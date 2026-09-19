name: Feature request
description: Propose something new
labels: ["enhancement"]
body:
  - type: textarea
    id: problem
    attributes:
      label: What problem does this solve?
      description: The use case, not the solution. What are you trying to do that Ecode makes hard today?
      placeholder: I was trying to …
    validations:
      required: true
  - type: textarea
    id: proposal
    attributes:
      label: Your proposal
      description: What should Ecode do instead? Sketch the interaction.
  - type: dropdown
    id: area
    attributes:
      label: Area
      options:
        - Agent / tools
        - Models / providers
        - UI / UX
        - CLI
        - Security
        - Other
    validations:
      required: true
