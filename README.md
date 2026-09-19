<div align="center">

# Ecode

**A local-first AI coding agent you run from your own terminal.**

450+ models via OpenRouter · plan mode · visible reasoning · sandboxed tools · approval gates · diffs with undo · full audit trail

</div>

---

Ecode is a self-hosted coding agent platform: type `ecode` in any project directory and get a browser-based agent that can read, plan, write, and execute — behind your own API keys, on your own machine, with your data staying local.

No built-in provider, no bundled tokens, no telemetry to us. You bring the keys; Ecode brings the workflow.

## What it looks like

- **Chat-first interface** — user messages right, the model's own icon and name left, reasoning kept visible above every answer.
- **450+ live models** — the full OpenRouter catalog streams in realtime, including stealth previews (anonymous labs) the public API hides.
- **Plan mode** — a read-only agent that researches your codebase and produces an implementation plan before anything is written.
- **Thinking you can see** — reasoning streams live and stays visible after the answer starts. Toggle effort: off / think / ultrathink.
- **A permission engine** — manual approval for every write/delete/shell command, auto mode, or YOLO with hard deny rules for system-destructive commands.
- **Diffs, undo, and audit** — every file change is a changeset with a unified diff, one-click undo/redo, and a structured audit log.

## Install

Requirements: [Node.js](https://nodejs.org) 20+ and curl. That's it.

```bash
curl -fsSL https://raw.githubusercontent.com/albytehq/ecode/main/install.sh | bash
```

The installer downloads a prebuilt package for your platform (Linux x64/arm64 · macOS arm64 — on an Intel Mac it builds from source automatically), installs it to `~/.ecode`, and puts `ecode` on your PATH. Your data — sessions, provider keys, settings, workspaces — lives in `~/.ecode` and survives every upgrade.

Then, from any directory:

```bash
ecode              # starts the server, prints the frontend URL, opens your browser
ecode ~/my-project # opens with that directory as the workspace
ecode url          # prints the frontend URL (quiet, scriptable)
ecode --no-open    # start without opening the browser
ecode update       # update to the latest release
ecode resume       # pick up a previous session
ecode status       # server health from the terminal
ecode stop         # stop the background server
```

No prebuilt package for your platform yet? The installer falls back to a source build automatically (needs git + bun or npm), or you can build manually:

```bash
git clone https://github.com/albytehq/ecode.git
cd ecode
npm install        # bun works too: bun install
npm run build
node bin/ecode.js  # same CLI, straight from the checkout
```

Uninstall: `rm -rf ~/.ecode ~/.local/bin/ecode`.

On Windows, run the installer from WSL or Git Bash. The first launch starts a local server (default `http://localhost:4545`) and seeds its own SQLite database — nothing else to configure.

## Configure a provider

Ecode is bring-your-own-key by design. Open **Settings → Providers** in the UI and paste a key:

| Provider | Where to get a key | Notes |
|----------|-------------------|-------|
| [OpenRouter](https://openrouter.ai/settings/keys) | openrouter.ai/settings/keys | **Recommended.** 450+ models, one key, stealth previews are free while they last. |
| [OpenAI](https://platform.openai.com/api-keys) | platform.openai.com | Direct API. |
| [Anthropic](https://console.anthropic.com/settings/keys) | console.anthropic.com | Direct Messages API with native thinking. |
| [Google Gemini](https://aistudio.google.com/apikey) | aistudio.google.com | Via the OpenAI-compatible endpoint. |
| Custom | any OpenAI-compatible endpoint | Ollama, LM Studio, vLLM, Groq, Together… set a base URL. |

Keys are stored in the local SQLite database, are never returned in full by the API, and are used only for direct calls to the provider you configured.

## Daily use

```
ecode ~/code/api-server
```

1. Pick a model from the header (search 450+, filter free/reasoning/vision/tools/stealth).
2. Choose **Plan** for read-only research, or stay in **Build**.
3. Talk to it. Approve or deny each risky action, or switch permission mode.
4. Review changes in the right panel, undo anything, export the transcript with `/share`.

Slash commands: `/plan` `/build` `/think [off|think|ultrathink]` `/undo` `/redo` `/yolo on|off` `/status` `/share` `/help`.

Keyboard: `Ctrl/Cmd+B` toggles the sidebar. Everything else is one click away.

## How it works

```
you ──chat──▶ Next.js UI ──SSE──▶ agent loop ──▶ provider API (your key)
                   │                  │
                   │                  ├── sandboxed tools: read / list / write / delete / shell / grep / ask_user
                   │                  ├── permission engine (manual / auto / yolo + hard deny rules)
                   │                  └── changesets + audit log
                   └── SQLite (sessions, messages, changesets, approvals, settings)
```

- **Workspace isolation** — every session gets its own workspace; path traversal and symlinks out of it are rejected.
- **Shell deny rules** — `sudo`, `rm -rf /`, fork bombs, device writes and friends are refused at the engine level, even in YOLO.
- **Context compaction** — old turns are trimmed automatically when the conversation approaches the model's context limit.
- **Stealth models** — the catalog merges OpenRouter's public API with its frontend card API, so stealth previews (like `ox-alpha`, `union-alpha`) appear the moment they exist.

## Development

```bash
npm install
npx prisma db push          # local database
npm run dev                 # dev server on :3000

npx tsc --noEmit            # types
npx eslint src/             # lint
npm run build               # production build + standalone
```

Stack: Next.js 16 (App Router, Turbopack) · React 19 · Tailwind CSS 4 · shadcn/ui · Prisma + SQLite · Zustand · @lobehub/icons.

Project layout:

```
bin/ecode.js              zero-dependency CLI
src/app/                  routes + API (sessions, chat SSE, models, providers, settings, audit)
src/lib/ecode/            the engine: agent loop, llm providers, tools, sandbox, prompt, catalog, store
src/components/ecode/     the UI: chat, sidebar, header, panels, model picker, settings
scripts/                  build helpers (prisma standalone alias fix)
```

## Security

- Keys live in a local SQLite file with the same trust boundary as your `.env` — treat repo access as key access.
- Sessions run shell commands with a timeout, inside the workspace, under deny rules that override every permission mode.
- Found something? See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Albyte
