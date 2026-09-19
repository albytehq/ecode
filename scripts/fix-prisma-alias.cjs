// Fix for the Next 16 (Turbopack) + Prisma standalone issue:
// built chunks require("@prisma/client-<hash>") but the traced node_modules
// only contain @prisma/client. This script scans the built chunks for the
// hashed name and copies @prisma/client to the alias so the standalone
// server resolves it at runtime.
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");
const chunksDir = path.join(standalone, ".next", "server", "chunks");
const prismaDir = path.join(standalone, "node_modules", "@prisma");

if (!fs.existsSync(chunksDir)) {
  console.log("[prisma-alias] no standalone build found — skipping");
  process.exit(0);
}

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
  const alias = path.join(prismaDir, `client-${hash}`);
  if (fs.existsSync(alias)) {
    console.log(`[prisma-alias] client-${hash} already present`);
  } else {
    const source = path.join(prismaDir, "client");
    if (!fs.existsSync(source)) {
      console.warn(`[prisma-alias] ${source} missing — cannot create alias`);
      continue;
    }
    fs.cpSync(source, alias, { recursive: true });
    console.log(`[prisma-alias] created node_modules/@prisma/client-${hash} (copy of @prisma/client)`);
  }

  // Slim the standalone for distribution:
  // 1) Replace the (now redundant) plain @prisma/client with a re-export stub —
  //    the server chunks import the hashed alias; anything resolving the plain
  //    name gets forwarded. Saves ~58 MB.
  const plain = path.join(prismaDir, "client");
  if (fs.existsSync(plain) && fs.existsSync(alias)) {
    fs.rmSync(plain, { recursive: true, force: true });
    fs.mkdirSync(plain, { recursive: true });
    fs.writeFileSync(
      path.join(plain, "package.json"),
      JSON.stringify({ name: "@prisma/client", version: "0.0.0-stub", main: "index.js" }, null, 2)
    );
    fs.writeFileSync(
      path.join(plain, "index.js"),
      `module.exports = require("@prisma/client-${hash}");\n`
    );
    fs.writeFileSync(
      path.join(plain, "index.d.ts"),
      `export * from "@prisma/client-${hash}";\n`
    );
    console.log(`[prisma-alias] stubbed plain @prisma/client → @prisma/client-${hash} (saved ~58 MB)`);
  }
}

// 2) Drop runtime-dead heavyweight packages that Turbopack over-traces.
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
