name: Bug report
description: Something broke
labels: ["bug"]
body:
  - type: textarea
    id: what-happened
    attributes:
      label: What happened?
      description: Also tell us what you expected to happen.
      placeholder: Describe the bug…
    validations:
      required: true
  - type: textarea
    id: steps
    attributes:
      label: Steps to reproduce
      placeholder: |
        1. `ecode ~/project`
        2. picked model X, sent "…"
        3. clicked …
    validations:
      required: true
  - type: textarea
    id: logs
    attributes:
      label: Console / server log output
      description: Browser console errors and the relevant server.log lines. Paste as-is.
      render: shell
  - type: input
    id: version
    attributes:
      label: Ecode version
      placeholder: "0.1.12 (check /api/status or the sidebar badge)"
  - type: textarea
    id: environment
    attributes:
      label: Environment
      placeholder: "OS, Node version (node -v), browser, provider + model"
