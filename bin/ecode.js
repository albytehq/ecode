#!/usr/bin/env node
// Ecode CLI — the `ecode` command.
//
//   ecode                    start Ecode (opens your browser)
//   ecode ~/myproject         start with a specific workspace directory
//   ecode .                  use the current directory
//   ecode --plan             start in plan mode (read-only research)
//   ecode --think            start with thinking mode on
//   ecode --ultrathink       start with maximum reasoning effort
//   ecode resume [query]     pick a previous session to resume
//   ecode url                print the frontend URL (exit 1 if not running)
//   ecode update             update to the latest release
//   ecode status             platform status card
//   ecode stop               stop the Ecode server
//   ecode help / --version
//
// Flags: --port N (default 4545 or $ECODE_PORT) · --no-open (don't open browser)
// Zero runtime dependencies — plain Node 18+.

"use strict";

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");
const readline = require("readline");

const VERSION = "0.1.13";
const APP_ROOT = path.resolve(__dirname, "..");
const ECODE_HOME = process.env.ECODE_HOME || path.join(os.homedir(), ".ecode");
const PID_FILE = path.join(ECODE_HOME, "server.pid");
const SERVER_LOG = path.join(ECODE_HOME, "server.log");
const DEFAULT_PORT = Number(process.env.ECODE_PORT) || 4545;
const HEALTH_TIMEOUT_MS = 3500;

// ---------------------------------------------------------------------------
// tiny terminal helpers (TTY-aware)
// ---------------------------------------------------------------------------
const isTTY = process.stdout.isTTY && !process.env.NO_COLOR;
const c = {
  dim: (s) => (isTTY ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s) => (isTTY ? `\x1b[1m${s}\x1b[0m` : s),
  green: (s) => (isTTY ? `\x1b[32m${s}\x1b[0m` : s),
  violet: (s) => (isTTY ? `\x1b[35m${s}\x1b[0m` : s),
  amber: (s) => (isTTY ? `\x1b[33m${s}\x1b[0m` : s),
  red: (s) => (isTTY ? `\x1b[31m${s}\x1b[0m` : s),
  cyan: (s) => (isTTY ? `\x1b[36m${s}\x1b[0m` : s),
};

const die = (msg, code = 1) => {
  console.error(`${c.red("error")} ${msg}`);
  process.exit(code);
};

const banner = () => {
  console.log("");
  console.log(`  ${c.green("⚡")} ${c.bold("Ecode")} ${c.dim(`v${VERSION}`)} — AI coding agent platform`);
  console.log(`  ${c.dim("plan · build · think · 450+ models · sandboxed tools")}`);
  console.log("");
};

// ---------------------------------------------------------------------------
// arg parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const flags = { port: DEFAULT_PORT, open: true, plan: false, thinking: null };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port") {
      const v = Number(argv[++i]);
      if (!v || v < 1 || v > 65535) die(`invalid port "${argv[i]}"`);
      flags.port = v;
    } else if (a.startsWith("--port=")) {
      const v = Number(a.slice(7));
      if (!v || v < 1 || v > 65535) die(`invalid port "${a.slice(7)}"`);
      flags.port = v;
    } else if (a === "--no-open") {
      flags.open = false;
    } else if (a === "--plan") {
      flags.plan = true;
    } else if (a === "--think" || a === "--thinking") {
      flags.thinking = "think";
    } else if (a === "--ultrathink") {
      flags.thinking = "ultrathink";
    } else if (a === "--help" || a === "-h") {
      flags.help = true;
    } else if (a === "--version" || a === "-v") {
      flags.version = true;
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

// ---------------------------------------------------------------------------
// http helpers
// ---------------------------------------------------------------------------
function fetchJson(port, urlPath, timeoutMs = HEALTH_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: urlPath, timeout: timeoutMs },
      (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, json: null });
          }
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.on("error", reject);
  });
}

const healthy = async (port) => {
  try {
    const r = await fetchJson(port, "/api/status");
    return r.status === 200 && r.json && r.json.ok === true && r.json.name === "Ecode";
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// server lifecycle
// ---------------------------------------------------------------------------
function readPid() {
  try {
    return Number(fs.readFileSync(PID_FILE, "utf8").trim());
  } catch {
    return null;
  }
}

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitHealthy(port, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    process.stdout.write(".");
    if (await healthy(port)) {
      process.stdout.write("\n");
      return true;
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  process.stdout.write("\n");
  return false;
}

// Turbopack+Prisma standalone workaround (mirrors scripts/fix-prisma-alias.cjs):
// built chunks require("@prisma/client-<hash>") but the traced node_modules only
// ships @prisma/client. Ensure the hashed alias exists and no broken traced
// copy shadows it from .next/node_modules.
function fixPrismaAlias(standalone) {
  try {
    const prismaDir = path.join(standalone, "node_modules", "@prisma");
    const chunksDir = path.join(standalone, ".next", "server", "chunks");
    if (!fs.existsSync(prismaDir) || !fs.existsSync(chunksDir)) return;
    const need = new Set();
    for (const f of fs.readdirSync(chunksDir)) {
      if (!f.endsWith(".js")) continue;
      const s = fs.readFileSync(path.join(chunksDir, f), "utf8");
      for (const m of s.matchAll(/@prisma\/client-([0-9a-f]{6,40})/g)) need.add(m[1]);
    }
    const clientSrc = path.join(prismaDir, "client");
    if (!fs.existsSync(clientSrc)) return;
    const isStub = () => {
      try {
        return JSON.parse(fs.readFileSync(path.join(clientSrc, "package.json"), "utf8")).version === "0.0.0-stub";
      } catch {
        return false;
      }
    };
    for (const hash of need) {
      const alias = path.join(prismaDir, `client-${hash}`);
      if (!fs.existsSync(alias)) {
        if (isStub()) continue; // can't build the alias from a stub
        fs.cpSync(clientSrc, alias, { recursive: true });
        console.log(`  ${c.dim(`applied prisma standalone fix (client-${hash})`)}`);
      }
      // broken traced copy inside .next/node_modules shadows the alias — remove it
      const inner = path.join(standalone, ".next", "node_modules", "@prisma", `client-${hash}`);
      if (fs.existsSync(inner)) {
        let main = null;
        let hasExports = false;
        let isInnerStub = false;
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(inner, "package.json"), "utf8"));
          main = pkg.main || null;
          hasExports = !!pkg.exports;
          isInnerStub = pkg.version === "0.0.0-stub";
        } catch {}
        // a stub in the traced location is circular (forwards to itself) — always broken
        if (isInnerStub || (!hasExports && (!main || !fs.existsSync(path.join(inner, main))))) {
          fs.rmSync(inner, { recursive: true, force: true });
          console.log(`  ${c.dim(`removed broken traced prisma copy (client-${hash})`)}`);
        }
      }
      // repair stubs that predate the index.js entry fix
      const entry = path.join(clientSrc, "index.js");
      if (isStub() && !fs.existsSync(entry) && fs.existsSync(alias)) {
        fs.writeFileSync(entry, `module.exports = require("@prisma/client-${hash}");\n`);
        console.log(`  ${c.dim(`repaired prisma stub entry (client-${hash})`)}`);
      }
    }
  } catch {
    /* best effort */
  }
}

async function ensureServer(port) {
  if (await healthy(port)) {
    // already running — but if this CLI is newer than the running server
    // (e.g. the user just ran `ecode update`), restart into the new version
    let runningVersion = null;
    try {
      const r = await fetchJson(port, "/api/status");
      runningVersion = r.json && r.json.version;
    } catch {}
    if (!runningVersion || runningVersion === VERSION) {
      console.log(`  ${c.green("✓")} Ecode server ${c.dim(`already running on port ${port}`)}`);
      return;
    }
    console.log(`  ${c.amber("!")} running server is v${runningVersion}, this install is v${VERSION} — restarting`);
    await stopServer(port);
  }

  // stale/zombie process cleanup
  const pid = readPid();
  if (pidAlive(pid)) {
    console.log(`  ${c.amber("!")} stale server process (pid ${pid}) — restarting`);
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
    await new Promise((r) => setTimeout(r, 900));
    if (pidAlive(pid)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  fs.rmSync(PID_FILE, { force: true });

  fs.mkdirSync(ECODE_HOME, { recursive: true });

  // user-supplied ECODE_DATABASE_URL means they manage their own database
  if (!process.env.ECODE_DATABASE_URL) {
    ensureDb(path.join(ECODE_HOME, "db", "custom.db"));
  }

  const env = {
    ...process.env,
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    NODE_ENV: process.env.NODE_ENV || "production",
    // dedicated env override — a user's global DATABASE_URL (e.g. for their own
    // apps) must never leak into Ecode's SQLite path
    DATABASE_URL: process.env.ECODE_DATABASE_URL || `file:${path.join(ECODE_HOME, "db", "custom.db")}`,
    ECODE_WORKSPACES_ROOT: process.env.ECODE_WORKSPACES_ROOT || path.join(ECODE_HOME, "workspaces"),
    ECODE: "1",
  };

  fs.mkdirSync(env.ECODE_WORKSPACES_ROOT, { recursive: true });

  const standalone = path.join(APP_ROOT, ".next", "standalone", "server.js");
  const nextBin = path.join(APP_ROOT, "node_modules", ".bin", "next");

  let child;
  let waitMs;
  if (fs.existsSync(standalone)) {
    console.log(`  ${c.dim("starting Ecode server")} ${c.dim(`(standalone, port ${port})`)}`);
    fixPrismaAlias(standalone);
    child = spawn(process.execPath, [standalone], {
      env,
      detached: true,
      stdio: ["ignore", fs.openSync(SERVER_LOG, "a"), fs.openSync(SERVER_LOG, "a")],
      cwd: path.dirname(standalone),
    });
    waitMs = 20000;
  } else if (fs.existsSync(nextBin)) {
    console.log(`  ${c.dim("no production build found — starting dev server")} ${c.amber("(first compile can take a minute)")}`);
    child = spawn(process.execPath, [nextBin, "dev", "-p", String(port)], {
      env: { ...env, NODE_ENV: "development" },
      detached: true,
      stdio: ["ignore", fs.openSync(SERVER_LOG, "a"), fs.openSync(SERVER_LOG, "a")],
      cwd: APP_ROOT,
    });
    waitMs = 120000;
  } else {
    die(
      `no Ecode server found.\n  Run it from a directory containing the Ecode app (a production build or a checkout),\n  or from inside the project: ${c.cyan("npm run build")} then try again.`
    );
  }

  child.unref();
  fs.writeFileSync(PID_FILE, String(child.pid));
  console.log(`  ${c.green("→")} server pid ${child.pid} ${c.dim(`· log: ${SERVER_LOG}`)}`);

  if (await waitHealthy(port, waitMs)) {
    console.log(`  ${c.green("✓")} Ecode is up ${c.dim(`http://localhost:${port}`)}`);
  } else {
    console.log("");
    die(
      `server did not become healthy in time.\n  Check the log: ${c.cyan(SERVER_LOG)}\n  Or run manually: ${c.cyan(`PORT=${port} node ${standalone}`)}`
    );
  }
}

// ---------------------------------------------------------------------------
// database bootstrap — first run seeds SQLite, upgrades apply `prisma db push`
// ---------------------------------------------------------------------------
function findPrismaCli() {
  const candidates = [
    // prebuilt installs ship a sidecar prisma CLI (safe schema upgrades)
    path.join(APP_ROOT, "prisma-cli", "node_modules", "prisma", "build", "index.js"),
    // source checkouts have it in node_modules
    path.join(APP_ROOT, "node_modules", "prisma", "build", "index.js"),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

function schemaStamp(schemaPath) {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(schemaPath)).digest("hex").slice(0, 16);
  } catch {
    return null;
  }
}

function dbPush(prismaEntry, dbUrl, schemaPath) {
  try {
    const r = spawnSync(process.execPath, [prismaEntry, "db", "push", "--skip-generate", "--schema", schemaPath], {
      env: { ...process.env, DATABASE_URL: dbUrl, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
      encoding: "utf8",
      timeout: 120000,
    });
    if (r.status === 0) return { ok: true };
    const tail = ((r.stderr || r.stdout || "").split("\n").filter(Boolean).slice(-3).join("\n") || "unknown prisma error").trim();
    return { ok: false, why: tail };
  } catch (e) {
    return { ok: false, why: e.message };
  }
}

function ensureDb(dbFile) {
  const schemaPath = path.join(APP_ROOT, "prisma", "schema.prisma");
  const dbUrl = `file:${dbFile}`;
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });

  const stampFile = path.join(path.dirname(dbFile), ".schema-stamp");
  const want = fs.existsSync(schemaPath) ? schemaStamp(schemaPath) : null;

  // first run — no database yet
  if (!fs.existsSync(dbFile)) {
    const seed = path.join(APP_ROOT, "db-seed", "custom.db");
    const prisma = findPrismaCli();
    if (fs.existsSync(seed)) {
      fs.copyFileSync(seed, dbFile);
      console.log(`  ${c.green("✓")} database initialized ${c.dim(`(${dbFile})`)}`);
    } else if (prisma) {
      console.log(`  ${c.dim("creating the database")}`);
      const r = dbPush(prisma, dbUrl, schemaPath);
      if (!r.ok) {
        die(`could not create the database:\n  ${r.why}\n  schema: ${schemaPath}`);
      }
      console.log(`  ${c.green("✓")} database initialized ${c.dim(`(${dbFile})`)}`);
    } else if (fs.existsSync(schemaPath)) {
      die(
        `no database at ${dbFile} and no way to create one.\n  This install looks incomplete — re-run the installer:\n  ${c.cyan("curl -fsSL https://raw.githubusercontent.com/albytehq/ecode/main/install.sh | bash")}`
      );
    } else {
      return; // dev checkout without schema — assume the caller handles it
    }
    if (want) fs.writeFileSync(stampFile, want, "utf8");
    return;
  }

  // existing database — apply schema upgrades when prisma/schema.prisma changed
  if (!want) return;
  let have = null;
  try {
    have = fs.readFileSync(stampFile, "utf8").trim();
  } catch {}
  if (have === want) return;

  const prisma = findPrismaCli();
  if (!prisma) {
    console.log(`  ${c.amber("!")} database schema changed but no prisma CLI is bundled — continuing with the current database`);
    return;
  }
  console.log(`  ${c.dim("database schema changed — applying upgrade")}`);
  const r = dbPush(prisma, dbUrl, schemaPath);
  if (r.ok) {
    fs.writeFileSync(stampFile, want, "utf8");
    console.log(`  ${c.green("✓")} database schema up to date`);
  } else {
    console.log(
      `  ${c.amber("!")} could not upgrade the database schema automatically:\n  ${r.why}`
    );
    console.log(
      `  ${c.dim("your data was kept as-is. If anything misbehaves, back it up and re-init:")}\n  ${c.dim(`mv ${path.dirname(dbFile)} ${path.dirname(dbFile)}.bak`)}`
    );
  }
}

async function stopServer(port) {
  const pid = readPid();
  if (!pidAlive(pid)) {
    fs.rmSync(PID_FILE, { force: true });
    console.log(`  ${c.dim("no running Ecode server found")}`);
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {}
  const start = Date.now();
  while (pidAlive(pid) && Date.now() - start < 6000) {
    await new Promise((r) => setTimeout(r, 300));
  }
  if (pidAlive(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
  fs.rmSync(PID_FILE, { force: true });
  console.log(`  ${c.green("✓")} Ecode server stopped ${c.dim(`(pid ${pid})`)}`);
}

// ---------------------------------------------------------------------------
// browser opening
// ---------------------------------------------------------------------------
function openBrowser(url) {
  const candidates =
    process.platform === "darwin"
      ? [["open", [url]]]
      : process.platform === "win32"
        ? [["cmd", ["/c", "start", "", url]]]
        : [["xdg-open", [url]], ["wslview", [url]]];
  for (const [cmd, args] of candidates) {
    try {
      const p = spawn(cmd, args, { detached: true, stdio: "ignore" });
      p.on("error", () => {});
      p.unref();
      return true;
    } catch {}
  }
  return false;
}

const launch = (port, url, open = true) => {
  console.log("");
  console.log(`  ${c.green("⚡")} Ecode is ${c.bold("ready")} ${c.dim(`— frontend:`)}`);
  console.log("");
  console.log(`      ${c.bold(url)}`);
  console.log("");
  if (open && openBrowser(url)) {
    console.log(`  ${c.dim("opening it in your browser… (stop the server with")} ${c.bold("ecode stop")}${c.dim(")")}`);
  } else {
    console.log(`  ${c.dim("open the URL above in your browser to start")}`);
  }
  console.log("");
};

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------
function expandHome(p) {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return path.join(os.homedir(), p.slice(2));
  return p;
}

async function cmdOpen(flags, positional) {
  const port = flags.port;
  await ensureServer(port);

  let url = `http://localhost:${port}/?from=cli`;
  if (positional.length > 0) {
    const raw = expandHome(positional[0]);
    const abs = path.resolve(raw);
    if (!fs.existsSync(abs)) die(`directory "${raw}" does not exist`);
    if (!fs.statSync(abs).isDirectory()) die(`"${raw}" is not a directory`);
    url += `&dir=${encodeURIComponent(abs)}`;
    console.log(`  ${c.dim("workspace")} ${abs}`);
  }
  if (flags.plan) url += "&mode=plan";
  launch(port, url, flags.open);
}

async function cmdResume(flags, positional) {
  const port = flags.port;
  await ensureServer(port);

  const res = await fetchJson(port, "/api/sessions").catch(() => null);
  const sessions = (res && res.json && res.json.sessions) || [];
  if (sessions.length === 0) {
    console.log(`  ${c.dim("no sessions yet — starting a fresh one")}`);
    launch(port, `http://localhost:${port}/?from=cli`, flags.open);
    return;
  }

  const query = positional.join(" ").toLowerCase().trim();
  let list = sessions;
  if (query) {
    list = sessions.filter(
      (s) => s.title.toLowerCase().includes(query) || s.id.toLowerCase().includes(query)
    );
    if (list.length === 1) {
      launch(port, `http://localhost:${port}/?session=${list[0].id}&from=cli`, flags.open);
      console.log(`  ${c.green("→")} resuming ${c.bold(list[0].title)}`);
      return;
    }
    if (list.length === 0) {
      die(`no session matches "${query}"`);
    }
  }

  console.log(`  ${c.bold("Resume a session")} ${c.dim("— most recent first")}`);
  console.log("");
  list.slice(0, 20).forEach((s, i) => {
    const when = new Date(s.updatedAt).toLocaleString();
    const badge = [
      s.agentMode === "plan" ? c.amber("plan") : null,
      s.thinking !== "off" ? c.violet(s.thinking) : null,
      s.mode === "yolo" ? c.red("yolo") : null,
    ]
      .filter(Boolean)
      .join(c.dim("/"));
    console.log(`  ${c.green(String(i + 1).padStart(2))} ${c.bold(s.title.slice(0, 42))} ${badge ? c.dim("[") + badge + c.dim("]") : ""}`);
    console.log(`     ${c.dim(`${s.model} · ${s.messageCount} messages · ${when}`)}`);
  });

  if (!isTTY) {
    console.log("");
    console.log(`  ${c.dim(`non-interactive terminal — open: http://localhost:${port}/?session=<id>&from=cli`)}`);
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = () =>
    new Promise((resolve) => {
      rl.question(`  ${c.cyan("number")} ${c.dim("(enter = 1, q = quit)")} `, (ans) => resolve(ans.trim()));
    });
  let ans = await ask();
  while (ans !== "" && ans.toLowerCase() !== "q" && !(Number(ans) >= 1 && Number(ans) <= list.length)) {
    ans = await ask();
  }
  rl.close();
  if (ans.toLowerCase() === "q") {
    console.log(`  ${c.dim("bye")}`);
    return;
  }
  const chosen = list[(Number(ans) || 1) - 1];
  launch(port, `http://localhost:${port}/?session=${chosen.id}&from=cli`, flags.open);
  console.log(`  ${c.green("→")} resuming ${c.bold(chosen.title)}`);
  console.log("");
}

async function cmdStatus(flags) {
  const port = flags.port;
  const res = await fetchJson(port, "/api/status").catch(() => null);
  if (!res || res.status !== 200 || !res.json) {
    die(`Ecode server is not running on port ${port}\n  start one with: ${c.cyan("ecode")}`);
  }
  const s = res.json.status || {};
  const money = (n) => (n ? `$${Number(n).toFixed(4)}` : "$0");
  console.log(`  ${c.green("⚡")} ${c.bold("Ecode")} ${c.dim(`v${res.json.version || VERSION}`)} ${c.dim(`· port ${port}`)}`);
  console.log("");
  const rows = [
    ["sessions", `${s.sessions ?? 0} (${s.activeSessions ?? 0} active)`],
    ["tokens", (s.totalTokens ?? 0).toLocaleString()],
    ["est. spend", money(s.estCost)],
    ["tool calls", s.toolCalls ?? 0],
    ["approvals", s.approvals ?? 0],
    ["avg latency", `${s.avgLatencyMs ?? 0}ms`],
    ["errors", s.errors ?? 0],
    ["node", s.node ?? process.version],
  ];
  for (const [k, v] of rows) {
    console.log(`  ${k.padEnd(13)} ${c.dim("·")} ${v}`);
  }
  console.log("");
}

async function cmdUrl(flags) {
  const port = flags.port;
  if (await healthy(port)) {
    console.log(`http://localhost:${port}/`);
    return;
  }
  die(`Ecode is not running on port ${port}\n  start it with: ${c.cyan("ecode")}`);
}

async function cmdUpdate(rest) {
  const installUrl = "https://raw.githubusercontent.com/albytehq/ecode/main/install.sh";
  console.log(`  ${c.dim("updating Ecode — running the official installer")}`);
  console.log("");
  const passthrough = rest.map((r) => `'${r.replace(/'/g, "'\\''")}'`).join(" ");
  const r = spawnSync("bash", ["-c", `curl -fsSL ${installUrl} | bash -s -- ${passthrough}`], {
    stdio: "inherit",
  });
  if (r.error) {
    if (r.error.code === "ENOENT") {
      die("bash + curl are required for updates — re-run the installer manually:\n  curl -fsSL https://raw.githubusercontent.com/albytehq/ecode/main/install.sh | bash");
    }
    die(r.error.message);
  }
  process.exit(r.status ?? 0);
}

function cmdHelp() {
  banner();
  console.log(`  ${c.bold("Usage")}`);
  console.log(`    ecode                     start Ecode and open it in your browser`);
  console.log(`    ecode <dir>               start with a workspace directory (ecode ~/myapp)`);
  console.log(`    ecode .                   use the current directory as the workspace`);
  console.log("");
  console.log(`  ${c.bold("Commands")}`);
  console.log(`    url                       print the frontend URL (quiet, scriptable)`);
  console.log(`    update [--version <tag>]  update to the latest (or a specific) release`);
  console.log(`    resume [query]            resume a previous session (interactive picker)`);
  console.log(`    status                    platform status card`);
  console.log(`    stop                      stop the Ecode server`);
  console.log(`    help · version            this message · ${VERSION}`);
  console.log("");
  console.log(`  ${c.bold("Session flags")}`);
  console.log(`    --plan                    start in ${c.amber("plan mode")} (read-only research)`);
  console.log(`    --think                   enable ${c.violet("thinking mode")}`);
  console.log(`    --ultrathink              maximum reasoning effort`);
  console.log("");
  console.log(`  ${c.bold("Server flags")}`);
  console.log(`    --port <n>                port (default ${DEFAULT_PORT} or $ECODE_PORT)`);
  console.log(`    --no-open                 don't open the browser automatically`);
  console.log("");
  console.log(`  ${c.dim("install / update: curl -fsSL https://raw.githubusercontent.com/albytehq/ecode/main/install.sh | bash")}`);
  console.log(`  ${c.dim(`state lives in ${ECODE_HOME}`)}`);
  console.log("");
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
(async () => {
  const { flags, positional } = parseArgs(process.argv.slice(2));

  if (flags.version) {
    console.log(VERSION);
    return;
  }

  const command = positional[0];
  const rest = positional.slice(1);

  if (flags.help || command === "help") {
    cmdHelp();
    return;
  }

  if (command === "status") {
    banner();
    await cmdStatus(flags);
    return;
  }

  if (command === "stop") {
    banner();
    await stopServer(flags.port);
    return;
  }

  if (command === "resume") {
    banner();
    await cmdResume(flags, rest);
    return;
  }

  if (command === "url") {
    await cmdUrl(flags);
    return;
  }

  if (command === "update") {
    banner();
    await cmdUpdate(rest);
    return;
  }

  banner();
  await cmdOpen(flags, positional);
})().catch((e) => {
  die(e instanceof Error ? e.message : String(e));
});
