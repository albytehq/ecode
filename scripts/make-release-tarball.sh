#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# make-release-tarball.sh — package a production build for GitHub Releases
#
#   ecode-v<version>-<os>-<arch>.tar.gz
#     ├─ .next/standalone/   prebuilt server (server.js + node_modules + static)
#     ├─ bin/ecode.js        the CLI
#     ├─ prisma/schema.prisma
#     ├─ db-seed/custom.db  pristine SQLite (first-run seeding)
#     ├─ prisma-cli/         sidecar prisma CLI (safe schema upgrades)
#     ├─ scripts/fix-prisma-alias.cjs
#     └─ package.json · README.md · LICENSE
#
# Prerequisite: `bun run build` (or `npm run build`) has completed.
# Usage: bash scripts/make-release-tarball.sh   → dist/ecode-v…-<os>-<arch>.tar.gz
# Env:   ECODE_OS / ECODE_ARCH  override platform detection (used by CI matrix)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

die() { printf '  error %s\n' "$*" >&2; exit 1; }

VERSION="$(node -p 'require("./package.json").version')"
[ -n "$VERSION" ] || die "could not read the version from package.json"
PRISMA_VER="$(node -p 'require("./package.json").dependencies.prisma')"
[ -n "$PRISMA_VER" ] || die "could not read the prisma version from package.json"

case "${ECODE_OS:-$(uname -s)}" in
  Linux|linux) OS="linux" ;;
  Darwin|darwin) OS="darwin" ;;
  *) die "unsupported OS: $(uname -s)" ;;
esac
case "${ECODE_ARCH:-$(uname -m)}" in
  x86_64|amd64|x64) ARCH="x64" ;;
  aarch64|arm64|armv8l) ARCH="arm64" ;;
  *) die "unsupported architecture: $(uname -m)" ;;
esac

STANDALONE="$ROOT/.next/standalone"
[ -f "$STANDALONE/server.js" ] || die "no production build found — run: bun run build"
[ -f "$STANDALONE/.next/static" ] || [ -d "$STANDALONE/.next/static" ] || die "build incomplete — .next/static is missing inside standalone"
[ -d "$STANDALONE/public" ] || die "build incomplete — public/ is missing inside standalone"

STAGE="$ROOT/dist/stage"
NAME="ecode-v${VERSION}-${OS}-${ARCH}.tar.gz"
OUT="dist/${NAME}"
rm -rf "$STAGE"
mkdir -p "$STAGE"

step() { printf '  %s\n' "$*"; }
step "packaging Ecode v${VERSION} (${OS}-${ARCH})"

# 1. prebuilt server
step "copying the standalone build"
mkdir -p "$STAGE/.next"
cp -R "$STANDALONE" "$STAGE/.next/standalone"

# prune runtime junk that never belongs in a package (created by dev/e2e runs
# with cwd inside the standalone dir — workspaces, downloads, logs…)
for junk in workspaces download skills db logs tmp; do
  rm -rf "$STAGE/.next/standalone/$junk"
done
find "$STAGE/.next/standalone" -maxdepth 1 -name "*.log" -delete 2>/dev/null || true

# 2. CLI + schema + alias fix
mkdir -p "$STAGE/bin" "$STAGE/prisma" "$STAGE/scripts" "$STAGE/db-seed"
cp "$ROOT/bin/ecode.js" "$STAGE/bin/ecode.js"
cp "$ROOT/prisma/schema.prisma" "$STAGE/prisma/schema.prisma"
cp "$ROOT/scripts/fix-prisma-alias.cjs" "$STAGE/scripts/fix-prisma-alias.cjs"
cp "$ROOT/LICENSE" "$STAGE/LICENSE" 2>/dev/null || true
cp "$ROOT/README.md" "$STAGE/README.md" 2>/dev/null || true

# minimal package.json (version metadata only)
printf '{"name":"ecode","version":"%s","private":true}\n' "$VERSION" > "$STAGE/package.json"

# 3. pristine database seed — generated fresh from the current schema
step "generating the first-run database seed"
rm -rf "$ROOT/dist/seed-tmp"
mkdir -p "$ROOT/dist/seed-tmp"
DATABASE_URL="file:$ROOT/dist/seed-tmp/custom.db" ./node_modules/.bin/prisma db push --skip-generate >/dev/null
[ -f "$ROOT/dist/seed-tmp/custom.db" ] || die "seed generation failed"
mv "$ROOT/dist/seed-tmp/custom.db" "$STAGE/db-seed/custom.db"
rm -rf "$ROOT/dist/seed-tmp"

# 4. sidecar prisma CLI — lets prebuilt installs run `prisma db push` upgrades
step "installing the sidecar prisma CLI (${PRISMA_VER})"
(
  cd "$STAGE"
  mkdir -p prisma-cli
  cd prisma-cli
  printf '{"name":"ecode-prisma-cli","private":true,"description":"sidecar prisma CLI for safe schema upgrades"}\n' > package.json
  npm install --omit=dev --no-audit --no-fund --loglevel=error "prisma@$PRISMA_VER" >/dev/null
)

# 5. tar + checksum
step "creating $OUT"
mkdir -p "$ROOT/dist"
tar -czf "$ROOT/$OUT" -C "$STAGE" .
if command -v sha256sum >/dev/null 2>&1; then
  ( cd "$ROOT/dist" && sha256sum "$NAME" > "$NAME.sha256" )
elif command -v shasum >/dev/null 2>&1; then
  ( cd "$ROOT/dist" && shasum -a 256 "$NAME" > "$NAME.sha256" )
fi
rm -rf "$STAGE"

SIZE="$(du -h "$ROOT/$OUT" | cut -f1)"
step "done: $OUT ($SIZE)"
[ -f "$ROOT/dist/$NAME.sha256" ] && step "      $NAME.sha256"
