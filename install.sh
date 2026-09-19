#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Ecode installer
#
#   curl -fsSL https://raw.githubusercontent.com/albytehq/ecode/main/install.sh | bash
#
# What it does:
#   1. downloads a prebuilt package for your OS/arch from GitHub Releases
#      (falls back to a source build if no prebuilt exists yet)
#   2. installs it to ~/.ecode/app  — your data (~/.ecode/db, workspaces) is
#      never touched by upgrades
#   3. symlinks `ecode` into ~/.local/bin and makes sure it is on your PATH
#
# Options:
#   --version <tag>   install a specific release (e.g. --version v0.1.13)
#   --source          build from source (git clone + bun/npm + next build)
#   --home <dir>      install root (default ~/.ecode)
#
# Environment overrides (mostly for testing):
#   ECODE_ASSET_URL   download the tarball from this URL instead of GitHub
#   ECODE_BIN_DIR     where to place the `ecode` symlink
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="albytehq/ecode"
GITHUB="https://github.com/${REPO}"
API="https://api.github.com/repos/${REPO}"

# ── pretty output ────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  B=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; AMBER=$'\033[33m'; RED=$'\033[31m'; CYAN=$'\033[36m'; R=$'\033[0m'
else
  B=""; DIM=""; GREEN=""; AMBER=""; RED=""; CYAN=""; R=""
fi
step() { printf '  %s\n' "$*"; }
ok()   { printf '  %s %s\n' "${GREEN}ok${R}" "$*"; }
die()  { printf '  %s %s\n' "${RED}error${R}" "$*" >&2; exit 1; }

# ── options ──────────────────────────────────────────────────────────────────
VERSION=""
SOURCE=0
ECODE_HOME="${ECODE_HOME:-$HOME/.ecode}"
BIN_DIR="${ECODE_BIN_DIR:-$HOME/.local/bin}"
OVERRIDE_ASSET_URL="${ECODE_ASSET_URL:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --version)
      [ $# -ge 2 ] || die "--version needs a value (e.g. --version v0.1.13)"
      VERSION="$2"; shift 2 ;;
    --version=*)
      VERSION="${1#*=}"; shift ;;
    --source)
      SOURCE=1; shift ;;
    --home)
      [ $# -ge 2 ] || die "--home needs a directory path"
      ECODE_HOME="$2"; shift 2 ;;
    *)
      die "unknown option: $1 (supported: --version <tag> · --source · --home <dir>)" ;;
  esac
done
[ -n "$ECODE_HOME" ] || die "--home cannot be empty"

# ── platform detection ───────────────────────────────────────────────────────
case "$(uname -s)" in
  Linux)  os="linux" ;;
  Darwin) os="darwin" ;;
  *) die "unsupported OS: $(uname -s) — on Windows use WSL, or run the installer from Git Bash" ;;
esac
case "$(uname -m)" in
  x86_64|amd64|x64)    arch="x64" ;;
  aarch64|arm64|armv8l) arch="arm64" ;;
  *) die "unsupported architecture: $(uname -m) — try a source install: install.sh --source" ;;
esac

printf '\n  %s⚡ Ecode%s installer — %s/%s\n\n' "${GREEN}" "${R}" "$os" "$arch"

# ── prerequisites ─────────────────────────────────────────────────────────────
command -v curl >/dev/null 2>&1 || die "curl is required (apt install curl · brew install curl)"
command -v tar  >/dev/null 2>&1 || die "tar is required (apt install tar · brew install tar)"

if ! command -v node >/dev/null 2>&1; then
  die "Node.js 20+ is required but not installed.
       Install it from https://nodejs.org, or:
         macOS:  brew install node
         Debian: sudo apt install nodejs
       Then re-run this installer."
fi
node_major="$(node -p 'process.versions.node.split(".")[0]')"
[ "$node_major" -ge 20 ] || die "Node.js 20+ required, found $(node --version)"

# ── resolve the version to install ───────────────────────────────────────────
if [ -z "$VERSION" ]; then
  if [ -n "$OVERRIDE_ASSET_URL" ]; then
    # derive it from the asset filename (ecode-v0.1.13-linux-x64.tar.gz)
    VERSION="$(basename "$OVERRIDE_ASSET_URL" | sed -n 's/^ecode-\(v[0-9][^-]*\)-.*/\1/p')"
  fi
  if [ -z "$VERSION" ]; then
    step "${DIM}resolving the latest release…${R}"
    VERSION="$(curl -fsSL "$API/releases/latest" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1)"
    [ -n "$VERSION" ] || die "could not resolve the latest release — pass one manually: install.sh --version v0.1.13"
  fi
fi
step "installing ${B}Ecode ${VERSION}${R}"

# ── install (prebuilt → source fallback) ─────────────────────────────────────
install_prebuilt() {
  local asset_url="$1"
  local tmp
  tmp="$(mktemp -d)"

  step "${DIM}downloading${R} ${asset_url}"
  curl -fSL ${CI:+-sS} -o "$tmp/ecode.tar.gz" "$asset_url" \
    || die "download failed — check your connection and try again"

  # checksum (best effort — skipped if the .sha256 sidecar is missing)
  if curl -fsSL -o "$tmp/ecode.tar.gz.sha256" "$asset_url.sha256" 2>/dev/null; then
    expected="$(awk 'NR==1{print $1}' "$tmp/ecode.tar.gz.sha256")"
    if command -v sha256sum >/dev/null 2>&1; then
      actual="$(sha256sum "$tmp/ecode.tar.gz" | awk '{print $1}')"
    elif command -v shasum >/dev/null 2>&1; then
      actual="$(shasum -a 256 "$tmp/ecode.tar.gz" | awk '{print $1}')"
    else
      actual=""
    fi
    if [ -n "$actual" ]; then
      [ "$expected" = "$actual" ] || die "checksum mismatch — the download looks corrupt, re-run the installer"
      ok "checksum verified"
    fi
  fi

  mkdir -p "$ECODE_HOME"
  rm -rf "${ECODE_HOME}/app.new"
  mkdir -p "${ECODE_HOME}/app.new"
  step "${DIM}unpacking to${R} ${ECODE_HOME}/app"
  tar -xzf "$tmp/ecode.tar.gz" -C "${ECODE_HOME}/app.new" \
    || die "unpack failed — the package looks corrupt"

  [ -f "${ECODE_HOME}/app.new/.next/standalone/server.js" ] \
    || die "the package is missing the server — unexpected layout, please report this"

  # swap in the new app, keeping the previous one until the swap succeeds
  if [ -d "${ECODE_HOME}/app" ]; then
    rm -rf "${ECODE_HOME}/app.prev"
    mv "${ECODE_HOME}/app" "${ECODE_HOME}/app.prev"
  fi
  mv "${ECODE_HOME}/app.new" "${ECODE_HOME}/app"
  rm -rf "${ECODE_HOME}/app.prev"
  rm -rf "$tmp"
}

install_source() {
  command -v git >/dev/null 2>&1 || die "git is required for source installs"

  local pm=""
  if command -v bun >/dev/null 2>&1; then pm="bun";
  elif command -v npm >/dev/null 2>&1; then pm="npm";
  else
    die "source installs need bun or npm.
         Install bun:  curl -fsSL https://bun.sh/install | bash
         Install node: https://nodejs.org (includes npm)"
  fi

  if [ -d "${ECODE_HOME}/app/.git" ]; then
    die "an existing source checkout lives in ${ECODE_HOME}/app —
         to update it: cd ${ECODE_HOME}/app && git pull && $pm install && $pm run build
         to start over: rm -rf ${ECODE_HOME}/app"
  fi

  step "${DIM}cloning${R} ${GITHUB}.git"
  git clone --depth 1 "${GITHUB}.git" "${ECODE_HOME}/app"

  step "${DIM}installing dependencies with ${pm} (this can take a few minutes)…${R}"
  (
    cd "${ECODE_HOME}/app"
    if [ "$pm" = "bun" ]; then bun install --frozen-lockfile; else npm install; fi
    ./node_modules/.bin/prisma generate
    step "${DIM}building the production server (a few minutes)…${R}"
    DATABASE_URL="file:./install.db" "$pm" run build
    rm -f install.db
  ) || die "source build failed — see the output above"
}

if [ "$SOURCE" -eq 1 ]; then
  install_source
else
  if [ -n "$OVERRIDE_ASSET_URL" ]; then
    install_prebuilt "$OVERRIDE_ASSET_URL"
  else
    asset_url="${GITHUB}/releases/download/${VERSION}/ecode-${VERSION}-${os}-${arch}.tar.gz"
    if curl -fsSIo /dev/null "$asset_url" 2>/dev/null; then
      install_prebuilt "$asset_url"
    else
      step "${AMBER}no prebuilt package for ${os}-${arch} yet — building from source${R}"
      install_source
    fi
  fi
fi

# ── symlink the CLI onto PATH ─────────────────────────────────────────────────
mkdir -p "$BIN_DIR"
chmod +x "${ECODE_HOME}/app/bin/ecode.js"
ln -sf "${ECODE_HOME}/app/bin/ecode.js" "${BIN_DIR}/ecode"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    # add to a shell profile once
    rc=""
    [ -n "${ZSH_VERSION:-}" ] && rc="$HOME/.zprofile"
    [ -z "$rc" ] && [ -f "$HOME/.bash_profile" ] && rc="$HOME/.bash_profile"
    [ -z "$rc" ] && rc="$HOME/.profile"
    line="export PATH=\"${BIN_DIR}:\$PATH\""
    if ! grep -qsF "$line" "$rc"; then
      printf '\n# ecode\n%s\n' "$line" >> "$rc"
    fi
    printf '  %s note:%s %s is not on your PATH yet — added it to %s\n' "${AMBER}" "${R}" "$BIN_DIR" "$rc"
    printf '  open a new terminal, or run: %s\n' "${CYAN}${line}${R}"
    ;;
esac

# ── verify ────────────────────────────────────────────────────────────────────
installed_version="$("${BIN_DIR}/ecode" --version 2>/dev/null)" || installed_version=""
if [ -n "$installed_version" ]; then
  ok "verified: ecode v${installed_version#v}"
else
  step "${AMBER}installed, but could not run 'ecode --version' — check that Node.js works${R}"
fi

# ── done ──────────────────────────────────────────────────────────────────────
shown_version="v${installed_version#v}"
[ -n "${installed_version:-}" ] || shown_version="$VERSION"
printf '\n'
printf '  %s⚡ Ecode %s%s %sinstalled%s\n' "${GREEN}" "${shown_version}" "${R}" "${B}" "${R}"
printf '\n'
printf '  start it        %secode%s   (the browser opens, ready to use)\n' "${B}" "${R}"
printf '  start in a repo  %secode ~/myproject%s\n' "${B}" "${R}"
printf '  get the URL     %secode url%s\n' "${B}" "${R}"
printf '  update later     %secode update%s\n' "${B}" "${R}"
printf '\n'
printf '  data lives in   %s%s%s — sessions and settings survive upgrades\n' "${DIM}" "$ECODE_HOME" "${R}"
printf '  uninstall       %srm -rf %s %s/ecode%s\n' "${DIM}" "$ECODE_HOME" "$BIN_DIR" "${R}"
printf '  docs            %s%s#readme%s\n' "${DIM}" "$GITHUB" "${R}"
printf '\n'
printf '  add an API key in %sSettings → Providers%s and start building.\n' "${B}" "${R}"
printf '\n'
