# AGENTS.md — Indy Heat Amiga Reverse Engineering / Circuit Editor

## Mandatory startup protocol

Every new thread or agent must **continue from the repository's accumulated state, not restart the reverse engineering**.

Before doing implementation or investigation:

1. Treat the current `master` branch as the working authority and inspect its current state.
2. Read this `AGENTS.md` in full.
3. Read the wiki page **[Disk Image, Loader and Runtime Resource Map](https://github.com/HoraceAndTheSpider/Indy-Heat-WHD/wiki/Disk-Image-Loader-and-Runtime-Resource-Map)** before touching `Disk.1`, rebuilding the main executable, scanning resources, or implementing another decoder.
4. Read the task-specific wiki page(s), then only the source/tests relevant to the requested task.
5. Inherit documented/code-proven findings when the current files still match their stated invariants. A new conversation is **not** a reason to re-prove them.
6. Re-open a settled item only when the current repository, a failing regression, live-debugger evidence, or the user's new evidence directly contradicts it.
7. Continue from the actual unresolved question and produce tangible review output where the task calls for it.

### Stable binary baseline

At the continuity checkpoint used to create these instructions:

- authoritative retail image: `whdload/data/Disk.1`;
- size: `901120` bytes = 1,760 × 512-byte sectors;
- Git blob: `c072bbacb3dd1d7ee5759e2ecdce2df7cca3cb61`;
- main File Imploder block: sector 22 / disk `$2C00`, `EDAM`;
- main decompressed size: `$1206A`;
- main Imploder `endOff`: `$8CBE`, packed frame size `$8CF0`;
- decompressed main file offset zero maps to runtime `$1000`;
- resource directory: main `+$3C6A` / runtime `$4C6A`;
- resource directory: 108 sequential 22-byte entries (`$00–$6B`);
- current full-disk regression expects 96 discoverable Imploder blocks;
- circuit base resource IDs: `$39,$3D,$41,$45,$49,$4D,$5A,$5E,$62,$66`.

If current `master` still satisfies those invariants, **do not spend time rediscovering them**. The wiki page above contains the layouts, formulas, track-resource formats and race-object rendering rules.

### Do not reconstruct the committed disk from connector fragments

If a tool can read repository text but cannot directly stream the binary `Disk.1`, do not rebuild the disk/main program from truncated Base64 slices and then treat decrunch errors as game evidence.

Use the checked-in parser/tests and documented offsets, or use a tool/environment that can access the committed file intact. Partial connector reconstruction is not an authoritative binary source.

### Source-of-truth hierarchy

Use the current material in this order when statements conflict:

1. current code/data and reproducible tests;
2. current topic-led wiki findings;
3. this `AGENTS.md`;
4. `app/README.md` and `app/research-notes.md` for implementation state;
5. older handovers/chats;
6. repository-root `README.md`.

The root `README.md` is an early viewer-era document and currently contains superseded statements about waypoints/palette. Do not let it override the current app, wiki or tests.

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

### Graphics-specific continuity rules

When the requested strand is race graphics:

- Keep the task graphics-only when the user says so; do not widen back into waypoint, pit-record, menu or unrelated-resource research.
- Treat the documented four-plane race-object transparency/palette mapping and BOB/blitter path as settled unless contradicted by current code/data.
- Treat the user-supplied `FlagMan.iff` reference and exact `$0F` frame-26 match as ground truth for validating the renderer.
- Do not identify an object solely from frame count or vague visual resemblance.
- Prefer an exact image match, proven object structure, or traced consumer/draw path.
- Do not restart hardware-sprite investigation for the racing cars merely because their actual frame bank is still unresolved.
