# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.12] — 2026-09-19

The bring-your-own-key release, with a ground-up interface redesign.

### Removed
- Built-in Z.ai provider and all bundled tokens. Ecode is now strictly bring-your-own-key: every provider (OpenRouter, OpenAI, Anthropic, Gemini, custom OpenAI-compatible endpoints) is configured in Settings → Providers. Failed providers surface a clear error instead of silently falling back.

### Added
- **Settings page** with General / Providers / Appearance tabs: default model, permission, and thinking; per-provider API keys with key verification (`test` button hits the real validation endpoints — OpenRouter uses `/api/v1/auth/key`, not the public models list); accent color, density, and timestamp preferences.
- **Identity & time awareness** — every model is told who it is (`You are X, running inside Ecode v0.1.12`), its exact model ID, its knowledge cutoff when published, the workspace, the platform, and the current time (ISO + human-readable + timezone), recomputed on every LLM call.
- **Anti-slop voice rules** — the system prompt now enforces plain technical talk: no filler openers, no sycophancy, prose over bullet walls, no em dashes, a banned-phrase list.
- **Collapsible sidebar** (`Ctrl/Cmd+B`) with an icon rail, persisted across reloads.
- **Home = chat** — the landing page is gone. `/` is a focused composer; sessions are created lazily on first message.
- **Reload-safe sessions** — the active session id lives in the URL and localStorage; reload lands back in the conversation.
- **Closeable right panel** — a proper close button, plus tab state that stays in sync with the header toggles.
- Abort plumbing end-to-end: switching sessions, going home, deleting a session, or reloading aborts in-flight LLM calls server-side (`req.signal`), so orphaned streams stop burning tokens.
- SSE inactivity watchdog (90s) and single-flight streaming per client.
- Live catalog metadata: knowledge cutoffs, per-model pricing in the picker.

### Changed
- **Full-width chat** — the transcript fills the pane; prose is capped at 75ch, code and diffs span the full width.
- **Thinking stays visible** — reasoning streams live and remains on screen after the answer starts (collapsible, never auto-hidden).
- **Compact toolbar** — a 44px header; permission mode, context, cost, undo/redo moved into an overflow menu.
- **Ultra-thin scrollbars** — near-invisible until hover, cross-browser (WebKit + Firefox).
- New "warm terminal" design system: stone surfaces, a single amber accent (switchable), JetBrains Mono as the voice for labels and meta, tight 6px radii, vim-style status modeline under the composer.
- Hover-over-text bug fixed: the session delete control no longer covers the title.

### Fixed
- Sessions could not be closed from the files/logs/changes panel (no close affordance).
- Stale "included (Z.ai built-in)" spend line in `/status`.
- Optimistic user-message id swap now targets the correct message.
- Double-fire guard on `message_saved` for user vs assistant roles.

## [0.1.5] — 2026-09-19

First distributable release.

### Added
- Ecode CLI (`ecode [dir]`, `resume`, `status`, `stop`) — zero-dependency Node launcher that spawns the standalone server.
- Live OpenRouter catalog (450+ models) with fuzzy search and capability filters, including stealth previews (`stealth/ox-alpha`, `stealth/union-alpha`) picked up in realtime from OpenRouter's frontend card API.
- Chat redesign: user messages right-aligned without avatar/name; assistant messages left with the model's own icon and a meta header.
- Plan mode, ask_user question cards, thinking levels with a live reasoning block.
- Permission engine (manual/auto/YOLO), changesets with undo/redo, diff viewer, audit log, context compaction.
- Standalone build hardening: Prisma hashed-module alias fix, slimmed runtime (119MB standalone, 43MB tarball).

## [0.1.0] — 2026-09-19

Initial internal build: session lifecycle, multi-provider LLM layer, tool protocol, sandbox, approvals, telemetry.
