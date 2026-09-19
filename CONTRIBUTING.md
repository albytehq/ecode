# Contributing to Ecode

Thanks for your interest in making Ecode better.

## Setting up

```bash
git clone https://github.com/albytehq/ecode.git
cd ecode
npm install          # or: bun install
npx prisma db push   # creates the local SQLite database
npm run dev          # dev server on http://localhost:3000
```

Requirements: Node.js 20+ (or Bun 1.1+).

## Before opening a PR

```bash
npx tsc --noEmit     # must pass with zero errors
npx eslint src/      # must pass
npm run build        # must succeed end-to-end
```

CI runs the same three checks on every push.

## Ground rules

- **Types are not optional.** `any` needs a comment explaining why.
- **Keep the engine in `src/lib/ecode/`.** UI code goes in `src/components/ecode/`. The agent loop, tools, and providers must stay UI-free so they can be tested and reused.
- **No new runtime dependencies** without opening an issue first explaining what problem the package solves that we cannot solve ourselves.
- **Match the design system.** Stone surfaces, one accent, mono for machine voice, 6px radii. When in doubt, look at neighboring components.
- **Security-sensitive code** (sandbox, shell deny rules, path resolution, key handling) requires a test or a reproduction in the PR description.

## Commit style

Conventional-ish, imperative mood: `fix: keep reasoning visible after completion`, `feat: collapsible sidebar rail`, `chore: bump catalog cache ttl`. Keep commits small.

## Reporting bugs

Open an issue with:
1. What you did (exact commands / clicks).
2. What you expected.
3. What happened instead, plus console output and the relevant `server.log` lines.
4. OS, Node version, browser.

## Feature requests

Ecode stays local-first, bring-your-own-key, and UI-minimal. Proposals that add telemetry, cloud accounts, or heavy client-side dependencies will not be accepted.
