# AGENTS.md — Indy Heat Circuit Editor

## Working authority

- Treat the current `master` branch as the working authority.
- Do not repeat reverse engineering already documented as stable unless current code/data contradicts it.
- Preserve established editor behaviour unless the user explicitly asks for it to change.
- Do not push changes to GitHub unless the user explicitly asks.

## Delivery format

- **Do not provide `.patch` / diff files as the implementation deliverable.**
- When implementation files are requested, provide a **ZIP containing the complete changed files**, ready for the user to copy directly into the `app/` folder and push to GitHub.
- Put changed `app/` files at the **root of the ZIP**; do not wrap them in an extra directory unless the user asks.
- Include only files that need adding/replacing, plus any directly relevant test/documentation files.
- Run the applicable tests before delivering the ZIP and state briefly what was tested.

## Editor/research discipline

- Clearly distinguish code-proven behaviour, live-debugger proof, data-derived facts, editor visualisation, and hypotheses.
- Keep Route Links and Sequence Groups logically separate.
- Sequence Group joining lines are useful and should remain, but they are **route-local**: same-Sequence points may join within A, within B, or within C; they must never join A↔B, A↔C, or B↔C.
