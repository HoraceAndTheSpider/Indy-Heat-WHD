# AGENTS.md — Indy Heat Circuit Editor

## Working authority

- Treat the current `master` branch as the working authority.
- Before new implementation or reverse engineering, read the current application code, tests, wiki/reference material and relevant WHDLoad/source material.
- Do not repeat reverse engineering already documented as stable unless current code/data contradicts it.
- Preserve established editor behaviour unless the user explicitly asks for it to change.
- Do not push changes to GitHub unless the user explicitly asks.

## Delivery and packaging

Keep implementation, wiki documentation and repository-level documentation as separate handoffs.

### Application handoffs

- **Do not provide `.patch` / diff files as the implementation deliverable.**
- When implementation files are requested, provide a **ZIP containing the complete changed files**, ready for the user to copy directly into the `app/` folder and push to GitHub.
- Put changed `app/` files at the **root of the ZIP**; do not wrap them in an extra directory unless the user asks.
- Include only files that need adding/replacing, plus directly relevant application tests.
- **Do not include wiki/research `.md` files, `AGENTS.md`, or other repository-level documentation in an application ZIP.**
- Run the applicable tests before delivering the ZIP and state briefly what was tested.

### Wiki/documentation handoffs

- Wiki/research documentation must be delivered **separately from application files**.
- Even when the handoff contains only one `.md` file, **package it in a ZIP** for download.
- A wiki ZIP should contain only the wiki page file(s) intended for manual upload/update, unless the user explicitly asks for other supporting material.
- Repository-level files such as `AGENTS.md` should likewise be supplied in their own separate ZIP rather than mixed into an app or wiki handoff.

## Wiki documentation standard

Use the Bloodwych 68k and Bloodwych Z80 wikis as the style model: the Indy Heat wiki is a **comprehensive, topic-led technical reference to the reverse-engineered game**, not a chronological research log.

### Purpose and organisation

- Organise pages by **game concept/data structure**: for example track data, waypoint/AI behaviour, race setup, start/grid positions, pit/service data, track presentation objects, HUD/display data, and editor operation where appropriate.
- Consolidate verified findings into the relevant subject page. Do not create a new page merely because a new investigation was performed.
- Keep the number of pages sensible and interlink related topics.
- There must be **only one page reserved for future/open investigation** (currently `Further Investigation`, or an equivalent single page if renamed later).
- The future-research page contains only genuinely unresolved or incomplete work. Once an item is proved, remove it from that page and incorporate the finding into the appropriate reference page.
- Do not leave closed findings duplicated as historical research notes or investigation diaries.

### Writing style

- Explain the **game concept and visible/gameplay effect in plain language first**, so a reader can understand what the data controls and why it matters.
- Retain the **technical detail needed for accuracy and future editing**: offsets, record layouts, field sizes, bit meanings, pointer behaviour, code locations/routines, transformations and representative examples where useful.
- Connect the technical representation to its practical meaning. Do not present unexplained tables of offsets when the behaviour is understood.
- Prefer stable descriptions such as “this field selects the AI Turbo-use marker” over investigation-history wording such as “we found that this might be...”.
- Clearly distinguish what is **code-proven, debugger-proven, data-derived, visually/editor-confirmed, or still hypothesis** where that distinction matters.
- Do not overstate friendly names or semantics that have not been proved. Preserve unknown/raw fields accurately until their meaning is established.
- Include examples where they materially clarify encoding, transforms, special cases or gameplay consequences, but avoid repetitive dumps of evidence.

### Findings pages versus editor pages

- Pages describing reverse-engineered game data are the **authoritative findings pages**.
- Editor-operation pages may explain how to view, select, edit, validate or export that data, but must **not repeat the full reverse-engineered findings**.
- Editor pages should cross-reference the relevant findings section for record layouts, semantics and behavioural proof.
- Likewise, findings pages should not become user manuals for buttons, mouse actions or routine UI operation unless the editor behaviour itself is necessary to explain a validation or editing constraint.
- If an editor control exposes a field whose meaning is documented elsewhere, name it consistently and link/cross-reference rather than restating the investigation.

### Updating the wiki after investigations

When an investigation produces new evidence:

1. Decide which existing topic page owns the finding.
2. Update that page into a coherent reference description, integrating the new result with existing proven material rather than appending a dated research log.
3. Add or refine plain-language explanation of the in-game purpose/effect.
4. Add the minimum technical proof/detail needed to make the result reproducible and editor-safe.
5. Remove the corresponding item from `Further Investigation` if it is now closed.
6. Add a new wiki page only when the subject is genuinely distinct enough to deserve one.
7. If editor behaviour changes because of the finding, update the relevant editor-operation page separately and cross-reference the findings page.

## Editor/research discipline

- Clearly distinguish code-proven behaviour, live-debugger proof, data-derived facts, editor visualisation, and hypotheses.
- Keep Route Links and Sequence Groups logically separate.
- Sequence Group joining lines are useful and should remain, but they are **route-local**: same-Sequence points may join within A, within B, or within C; they must never join A↔B, A↔C, or B↔C.
- Prefer semantics proved from the game code/data over labels inferred only from editor appearance.
- Preserve raw data faithfully when a field is not yet understood; do not make destructive editor assumptions merely to give an unknown field a friendly name.
