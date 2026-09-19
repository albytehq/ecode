// Fix for the Next 16 (Turbopack) + Prisma standalone issue.
//
// Background — the built server chunks import "@prisma/client-<hash>" (Turbopack's
// hashed module identity for @prisma/client). For that require to resolve in a
// STANDALONE deployment three things must hold:
//
//   1. a complete "@prisma/client-<hash>" package must exist under
//      .next/standalone/node_modules/@prisma/  (the trace ships @prisma/client,
//      not the hashed name — we copy it there),
//   2. .next/standalone/.next/node_modules/@prisma/client-<hash> must not be a
//      BROKEN copy (Turbopack sometimes traces a stub there whose "main" file
//      is missing — Node finds the package, fails on the entry, and hard-errors
//      instead of walking up; we remove it so resolution falls through to (1)),
//   3. the generated .prisma/client requires "@prisma/client/runtime/library.js",
//      so the plain @prisma/client must expose runtime/ — we keep the traced
//      client as a package of forwarders pointing at the hashed copy to stay
//      slim (saves ~58 MB), with a valid entry (index.js + default.js).
//
// This script runs after every `next build` (see the "build" script in
// package.json) and is mirrored defensively at runtime by bin/ecode.js.
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");
const chunksDir = path.join(standalone, ".next", "server", "chunks");
const prismaDir = path.join(standalone, "node_modules", "@prisma");
const innerPrismaDir = path.join(standalone, ".next", "node_modules", "@prisma");

const isStubPkg = (dir) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version === "0.0.0-stub";
  } catch {
    return false;
  }
};

// Does this package dir have a loadable entry ("main" file present, or an
// exports map that might resolve)? Used to detect broken traced copies.
// A 0.0.0-stub at the inner traced location is ALWAYS broken: its index.js
// forwards back to the hashed package, which resolves to the stub itself →
// circular require → empty exports. Only our stub format at the standalone
// root node_modules is valid.
const hasLoadableEntry = (dir) => {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  } catch {
    return false;
  }
  if (pkg.version === "0.0.0-stub") return false;
  if (pkg.exports) return true; // exports maps resolve subpaths; assume loadable
  if (pkg.main && fs.existsSync(path.join(dir, pkg.main))) return true;
  return false;
};

if (!fs.existsSync(chunksDir)) {
  console.log("[prisma-alias] no standalone build found — skipping");
  process.exit(0);
}

// 1. find the hashed @prisma/client references in the built chunks
const found = new Set();
const walk = (dir) => {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".js")) {
      const s = fs.readFileSync(p, "utf8");
      for (const m of s.matchAll(/@prisma\/client-([0-9a-f]{6,40})/g)) found.add(m[1]);
    }
  }
};
walk(chunksDir);

if (!found.size) {
  console.log("[prisma-alias] no hashed @prisma/client reference found — nothing to do");
  process.exit(0);
}

for (const hash of found) {
  const aliasName = `client-${hash}`;
  const alias = path.join(prismaDir, aliasName);
  const plain = path.join(prismaDir, "client");

  // 2a. ensure the complete hashed package exists at the standalone root
  if (!fs.existsSync(alias)) {
    if (!fs.existsSync(plain)) {
      console.warn(`[prisma-alias] ${plain} missing — cannot create the ${aliasName} alias`);
      continue;
    }
    if (isStubPkg(plain)) {
      console.warn(`[prisma-alias] ${plain} is already a stub — run a fresh build first, skipping`);
      continue;
    }
    fs.cpSync(plain, alias, { recursive: true });
    console.log(`[prisma-alias] created node_modules/@prisma/${aliasName} (copy of @prisma/client)`);
  } else {
    console.log(`[prisma-alias] node_modules/@prisma/${aliasName} already present`);
  }

  // 2b. remove a broken traced copy inside .next/node_modules — Node would find
  // it first, fail on its missing entry, and never reach the working alias.
  const inner = path.join(innerPrismaDir, aliasName);
  if (fs.existsSync(inner) && !hasLoadableEntry(inner)) {
    fs.rmSync(inner, { recursive: true, force: true });
    console.log(`[prisma-alias] removed broken traced copy .next/node_modules/@prisma/${aliasName}`);
    // drop the scope dir if it is now empty
    try {
      if (fs.existsSync(innerPrismaDir) && fs.readdirSync(innerPrismaDir).length === 0) {
        fs.rmSync(innerPrismaDir, { recursive: true, force: true });
      }
    } catch {}
  }

  // 3. slim the plain @prisma/client into forwarders pointing at the hashed
  //    copy (saves ~58 MB). The forwarder set must cover everything the
  //    generated client requires (runtime/library.js, default.js, …) and the
  //    package must have a VALID entry file (index.js).
  if (fs.existsSync(plain) && fs.existsSync(alias) && !isStubPkg(plain)) {
    let forwarded = 0;
    const relPosix = (p) => p.split(path.sep).join("/");
    const walkAlias = (rel) => {
      let entries;
      try {
        entries = fs.readdirSync(path.join(alias, rel), { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const relPath = path.join(rel, e.name);
        if (e.isDirectory()) {
          fs.mkdirSync(path.join(plain, relPath), { recursive: true });
          walkAlias(relPath);
        } else if (relPath === "package.json") {
          // skip — written below
        } else if (/\.(js|cjs|mjs)$/.test(e.name)) {
          const target = path.join(plain, relPath);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, `module.exports = require("@prisma/${aliasName}/${relPosix(relPath)}");\n`);
          forwarded++;
        } else if (/\.d\.ts$/.test(e.name)) {
          const target = path.join(plain, relPath);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, `export * from "@prisma/${aliasName}/${relPosix(relPath)}";\n`);
          forwarded++;
        } else {
          const target = path.join(plain, relPath);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.copyFileSync(path.join(alias, relPath), target);
        }
      }
    };
    fs.rmSync(plain, { recursive: true, force: true });
    fs.mkdirSync(plain, { recursive: true });
    fs.writeFileSync(
      path.join(plain, "package.json"),
      JSON.stringify({ name: "@prisma/client", version: "0.0.0-stub", main: "index.js" }, null, 2)
    );
    // entry forwarder (the traced client has no index.js — its exports map
    // resolves "." to default.js; consumers that read "main" need index.js)
    fs.writeFileSync(path.join(plain, "index.js"), `module.exports = require("@prisma/${aliasName}");\n`);
    forwarded++;
    walkAlias("");
    console.log(`[prisma-alias] stubbed plain @prisma/client → @prisma/${aliasName} (${forwarded} forwarders, saved ~58 MB)`);
  } else if (fs.existsSync(plain) && isStubPkg(plain)) {
    // 3b. repair an existing stub that predates the index.js entry fix
    const entry = path.join(plain, "index.js");
    if (!fs.existsSync(entry)) {
      fs.writeFileSync(entry, `module.exports = require("@prisma/${aliasName}");\n`);
      console.log(`[prisma-alias] repaired stub entry @prisma/client/index.js`);
    }
  }
}

// 4. drop runtime-dead heavyweight packages that Turbopack over-traces
const dead = [
  ["node_modules", "typescript"], // compile-only, never needed at runtime
  ["node_modules", "@img", "sharp-libvips-linuxmusl-x64"], // musl variant — we run glibc
  ["node_modules", "@img", "sharp-linuxmusl-x64"],
];
for (const seg of dead) {
  const p = path.join(standalone, ...seg);
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
    console.log(`[prisma-alias] removed runtime-dead ${path.join(...seg)}`);
  }
}
