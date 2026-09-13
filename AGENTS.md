# AGENTS.md — Indy Heat Circuit Editor

## Working authority

- Treat the current `master` branch as the working authority.
- Do not repeat reverse engineering already documented as stable unless current code/data contradicts it.
- Preserve established editor behaviour unless the user explicitly asks for it to change.
- Do not push changes to GitHub unless the user explicitly asks.

## Delivery format

- **Do not provide `.patch` / diff files as the implementation deliverable.**
- When implementation files are requested, provide a **ZIP containing the complete changed application files**, ready for the user to copy directly into the `app/` folder and push to GitHub.
- Put changed `app/` files at the **root of the application ZIP**; do not wrap them in an extra directory unless the user asks.
- The **application handoff and wiki/research handoff must always be separate downloads**.
- **Do not include wiki pages, research handoff `.md` files, or other wiki documentation in the application ZIP.**
- If an investigation produces wiki/documentation updates, provide those separately as individual `.md` files or a separate clearly named wiki/documentation ZIP.
- Application ZIPs may include application-facing tests that belong with the implementation, but not wiki/research documentation.
- Include only application files that need adding/replacing, plus directly relevant application tests.
- Run the applicable tests before delivering the application ZIP and state briefly what was tested.

## Editor/research discipline

- Clearly distinguish code-proven behaviour, live-debugger proof, data-derived facts, editor visualisation, and hypotheses.
- Keep Route Links and Sequence Groups logically separate.
- Sequence Group joining lines are useful and should remain, but they are **route-local**: same-Sequence points may join within A, within B, or within C; they must never join A↔B, A↔C, or B↔C.
