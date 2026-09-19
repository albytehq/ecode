# Security Policy

## Supported versions

Only the latest release line receives security fixes.

## Reporting a vulnerability

Do not open a public issue for security problems.

Email **security@albyte.dev** (or use [GitHub's private vulnerability reporting](https://github.com/albytehq/ecode/security/advisories/new)) with:

- a description of the issue and its impact,
- steps or a proof of concept to reproduce it,
- affected version (check `/api/status`).

You can expect a response within 72 hours. Please avoid public disclosure until a fix is released.

## Trust boundaries you should know about

Ecode is a **local tool that runs an AI agent with access to a workspace directory and, if you allow it, your shell.** Read this before pointing it at anything sensitive:

- **API keys** are stored in plaintext in the local SQLite database (`db/custom.db`). Anyone with filesystem access to the repo directory can read them. Treat checkout access as key access.
- **Sessions run shell commands** inside the workspace when a permission mode allows it. Hard deny rules block system-destructive commands (`sudo`, `rm -rf /`, fork bombs, raw device writes, …) in every mode, including YOLO — but deny lists are not a sandbox. Do not run Ecode as a privileged user, and do not point it at directories you cannot afford to lose.
- **Prompt-injected tool calls** are a real risk with agentic systems: a malicious file in your workspace can attempt to steer the agent into running commands. The permission engine (`manual` mode) is the mitigation — approve actions deliberately.
- **The model catalog is fetched live** from `openrouter.ai`; no data is sent there other than the request itself.

## Scope

In scope: workspace escape (path traversal, symlink tricks), shell deny-rule bypass, key leakage through the API, XSS in chat rendering, CSRF on state-changing endpoints.

Out of scope: vulnerabilities in upstream providers, attacks requiring physical access, and social engineering.
