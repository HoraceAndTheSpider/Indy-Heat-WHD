# Indy Heat project instructions

## Purpose

This repository is a continuing reverse-engineering and authoring project. The primary failure mode to avoid is **repeating research that has already been settled** or allowing a small implementation task to turn into an open-ended investigation.

The GitHub Wiki is the project's durable technical memory. Its research/data pages should be detailed enough that a new thread can implement from them without rediscovering offsets, formats, graphics resources or runtime behaviour.

## Mandatory startup protocol

1. Read this `AGENTS.md` first.
2. Treat the **current checked-in `master`**, the **current pushed Wiki**, checked-in tests and the latest explicit user/runtime handover as authority.
3. Repository access is **read-only/reference work unless the user explicitly asks otherwise**. Do not commit, push, create branches or rewrite history. The user owns commits/pushes.
4. Before beginning new reverse-engineering, read/search the **relevant Wiki subject page first**. Do not re-prove a finding that is already documented there.
5. A user-reported live editor or Amiga/FS-UAE runtime result is the acceptance result. Static inspection is not a substitute for that observation.
6. If current source/data genuinely contradicts a Wiki statement, identify the contradiction explicitly and investigate only that point.

Do not read every Wiki page for every small task. Read the page(s) relevant to the named subsystem, then the owning source file(s).

## Two working modes

### Implementation mode — default when the user says implement, fix, add, change or proceed

When the user asks to implement a feature from already-established findings, treat the documented findings as a **specification**, not as hypotheses to re-investigate.

Workflow:

1. Read the relevant Wiki subject page if needed.
2. Inspect the canonical owning production file.
3. Inspect only direct dependencies needed to make the change.
4. Begin editing.
5. Perform **one focused verification pass** over the edited behaviour and obvious regression points.
6. Deliver the complete changed production files promptly for user runtime/browser testing.

Do **not** during implementation mode:

- re-run settled Disk.1/resource/decompression research;
- search the entire repository “just in case”;
- search historical commits or the web without a specific blocker;
- revalidate a documented binary mapping merely because it is important;
- broaden a local task into architecture cleanup or a new research milestone;
- keep checking after the information needed to code is already available;
- turn tool/file-transfer friction into a research project.

### Research mode — only when the user asks for investigation or a genuine unknown blocks implementation

Research mode should answer a clearly stated unknown.

Before starting, identify:

- the exact unresolved question;
- which existing Wiki page was checked;
- why the documented knowledge is insufficient or contradictory;
- what evidence would resolve the question.

When the question is answered, stop. Record the settled result on the relevant subject Wiki page during the next requested documentation pass. Do not leave a solved result only in chat history.

## Anti-loop / stop rules

These rules are mandatory because previous threads lost time repeatedly checking already-established facts.

- After reading the relevant Wiki page and owning source file, **2–3 additional source inspections without beginning the requested edit is a warning that the task is drifting**.
- Once the requested implementation can be written from documented facts, stop researching and write it.
- For a targeted editor task, one static verification pass is normally enough. User browser/runtime testing is the acceptance test.
- If a tool path fails twice or begins consuming more effort than the requested code change, use a simpler available path or deliver the implementation without that optional check.
- Do not verify the verification unless the first verification exposes an actual inconsistency.
- Do not independently add a second milestone while the requested milestone is incomplete.
- Prefer a usable targeted implementation over an indefinitely “better verified” non-delivery.
- If genuinely blocked by one missing fact, state that exact fact. Do not fill the gap with broad speculative research.

## Settled areas that must not be re-opened without contradictory evidence

The Wiki contains the canonical detail. In particular, do not restart:

- Disk.1 sector/resource-directory/File Imploder mapping;
- the established resource table and known track resource groups;
- six-byte complemented waypoint encoding and explicit relative links;
- stock route-count fingerprints merely to rediscover template identity;
- playlist v1/v2 mapping and the current 11-event runtime contract;
- the 1–20 lap gameplay/current-lap contract;
- the test-34 reusable custom high-memory arena architecture;
- racing-car graphics location: **resource `$38`**;
- driver/face graphics identity: **resources `$10/$11`**;
- `$05` pit-crew frame-family layout;
- `$08` male/female PIT-board frame-family layout;
- the confirmed zero-based female-driver lookup `03,04,05,08,09,13,19,22,28,37,40,43` and live `+$1B` female presentation flag;
- the Gasoline Alley presentation palette used for `$10/$11`;
- previously proved MiniMap/name/runtime presentation hooks.

If an implementation needs one of those facts, use the Wiki result directly.

## Wiki purpose and structure

The Wiki is primarily a **reverse-engineering/data reference**, not an editor changelog.

Research/data pages should form the majority of Wiki content and should preserve enough concrete detail to prevent future rediscovery. Current canonical research pages are:

- `Disk Image, Loader and Runtime Resource Map.md`
- `Track Data and Runtime Setup.md`
- `Waypoint, AI and Car Behaviour.md`
- `Race, Car and Pit Runtime Structures.md`
- `Race Presentation and Graphics Resources.md`
- `WHDLoad Runtime Overrides and Custom Track Loading.md`

Editor documentation is deliberately separated and limited:

- `Circuit Editor Operations.md` — concise user-facing control/interaction reference;
- `Editor and Track Package Workflow.md` — concise authoring/package/module contract.

Do not move game-data research into the editor pages merely because the editor consumes it.

### Strict research/editor separation

The reverse-engineering subject pages must contain **game/disassembly/data/runtime findings only**. Do not leak editor implementation detail into them merely because the editor uses the data. In particular, do not put any of the following on `Race Presentation and Graphics Resources.md` or another game-data page unless they are themselves evidence about the original game:

- Brush Manager or IHBR file-format workflow;
- editor brush filenames or catalogue metadata;
- drawing/painting tools;
- editor module ownership;
- UI controls, buttons, folds or mode behaviour;
- editor-only convenience transforms;
- Auto Foreground implementation details;
- implementation changelog/version prose.

Put those items, sparingly, on `Editor and Track Package Workflow.md` or `Circuit Editor Operations.md`. Conversely, keep binary layouts, disassembly-derived selectors, resource identities, palettes, runtime addresses and original-game graphics mappings on the research pages rather than duplicating them in editor documentation.

`Race Presentation and Graphics Resources.md` is specifically a **disassembly/graphics-resource reference**. Its purpose is to answer questions such as “which resource?”, “which frame?”, “which palette?”, “what binary layout?” and “what original-game selector chooses it?” — not “how does the editor expose it?”.

## One unresolved-work page only

There must be **one and only one**:

`Further Investigation.md`

All unresolved research, validation questions and deliberately deferred investigations belong there.

Do not create additional pages named or functioning as:

- Further Research;
- Unknowns;
- Research Backlog;
- To Investigate;
- Open Questions;
- Future Findings;
- or equivalent.

When an item becomes settled:

1. move/add the result to the appropriate research/data page;
2. remove the resolved item from `Further Investigation.md`;
3. update or replace any research image whose annotation has now been confirmed or disproved;
4. preserve useful historical evidence where it explains the current architecture, but label superseded approaches clearly.

A direct user visual/runtime confirmation is sufficient project evidence to settle a visual identity unless later source/runtime evidence contradicts it. Do not keep a confirmed item artificially open merely because the original game did not give the field a symbolic name.

## What a good research/data Wiki page contains

Prefer concrete reusable evidence over narrative summaries.

Where relevant, record:

- resource IDs and exact decompressed sizes;
- main/runtime offsets and pointer relationships;
- binary structure tables;
- signedness/endian details;
- frame counts and frame ranges;
- palette words and colour-index mappings;
- formulas/selectors used by the game;
- source-proven versus runtime-proven confidence;
- known historical experiments and why they were superseded;
- compact code/pseudocode examples that explain the format;
- small hex/binary layout examples;
- route-count/resource fingerprints;
- exact runtime acceptance results.

Example layout blocks are encouraged:

```text
+00.w  field
+02.b  field
+03.b  field
+04.w  field
```

or:

```text
value = ((heading + 4) & $FF) >> 3
```

Do not replace useful binary detail with vague prose.

## Generated graphics and research images

Correctly generated visual references are encouraged, especially for graphics-resource mapping.

Wiki image assets should live under:

```text
wiki/images/
```

Use generated contact sheets, palette references and frame-range diagrams when they reduce the need to re-extract/re-identify data later. **When the original graphics can be decoded, prefer an actual correctly coloured decoded contact sheet over a schematic frame-range diagram.** A schematic may supplement the decoded artwork, but should not be the only visual representation of a mapped graphics bank.

For a generated graphics reference:

- use the correct documented palette;
- render from the original decoded game data wherever possible, not from editor-derived artwork;
- label resource IDs and zero-based frame/driver indices clearly;
- use one authoritative image for a mapping where practical rather than retaining several stale variants;
- distinguish settled annotations from hypotheses;
- state any annotation legend in the page;
- do not silently bake a hypothesis into an image title or label;
- when the user visually confirms or rejects an annotation, update the canonical image and remove the superseded tentative annotation (for example, do not retain stale `F?` labels after the female-driver table has been confirmed);
- preserve existing useful generated images instead of repeatedly regenerating them;
- if a new render supersedes an incorrect one, replace/correct the Wiki reference and remove the stale image during the next documentation pass.

For Indy Heat specifically, do not render `$10/$11` with the race/circuit palette: they use the Gasoline Alley/presentation palette documented on `Race Presentation and Graphics Resources.md`.

## Documentation preservation

When updating the Wiki:

- use the **current pushed Wiki/export supplied by the user as the baseline**;
- do not reconstruct pages from an older Library export when a newer Wiki copy exists;
- preserve existing settled detail;
- add new findings rather than deleting useful evidence;
- correct stale statements that would cause repeated research;
- if an old conclusion was historically important but is now superseded, retain it under a clearly labelled historical/superseded section;
- preserve page names exactly; do not introduce hyphenated or URL-encoded replacement names;
- update `_Sidebar.md` only to keep the research/editor/open-work grouping accurate.

Routine small editor changes do **not** require Wiki updates unless the user asks for a documentation pass or the change establishes new technical knowledge.

## Targeted editor tasks

A targeted task is a small/localised request where the user identifies the mode, control, file or behaviour and is not asking for new reverse-engineering.

Examples:

- add one control;
- fix one interaction;
- alter one transform/default/range;
- wire already-known graphics into an existing inspector;
- adjust one export field;
- move/rename one editor element.

For a targeted task:

1. use implementation mode;
2. inspect the canonical owner first;
3. widen only if the code proves it necessary;
4. make the smallest production change that satisfies the request;
5. increment the editor version;
6. perform one focused verification;
7. deliver complete changed files.

### Canonical editor ownership

- Foreground / Surface base editing: `app/layer-editor.js`
- Auto Foreground inference: `app/foreground-auto.js`
- Waypoints: `app/app.js` and `app/waypoint-actions.js`
- Recovery: `app/recovery-editor.js`
- Race setup: `app/race-setup.js`
- Retail race graphics decoder: `app/indyheat_race_graphics.js`
- Retail race graphics inspector UI: `app/race-graphics-inspector.js`
- Backdrop: `app/track-backdrop.js`
- MiniMap / Map / package: `app/circuit-package.js`
- brush raster primitives: `app/brush-tools.js`
- brush catalogue / IHBR / folder discovery / shared placement: `app/brush-library.js`
- Brush Manager UI: `app/brush-manager.js`
- editor coordination / layout: `app/editor-ui.js`
- top-level shell/version/script order: `app/index.html`

Do **not** use `app/brush-library.js` as a general editor catch-all.

## Current graphics implementation rule

The v0.102 retail graphics inspector structure is broadly usable, but its original asset semantics must not be copied forward blindly.

Research authority is the Wiki:

```text
$10/$11  driver / face presentation banks
$38      racing-car bank
$05      pit crew
$08      PIT-board attendants
$0F      flag man / starting gun
```

When implementing the improved graphics inspector/editor integration, correct the existing approach in place rather than starting a new resource-location investigation.

Normal `$38` car preview direction comes from route/driving heading, not the Recovery `+3` layer.

## Continuity and source selection

- Prefer the newest known working source.
- If the current conversation contains a user-tested local build newer than `master`, do not silently rebuild from older `master`.
- If the user has pushed the prior work, current `master` supersedes old handover version references.
- Do not recreate a solved feature from memory if current source already contains it.
- Preserve accepted behaviour unless the task explicitly changes it.

## Editor versioning and file hygiene

- Every HTML5 editor/app change increments the visible/internal version.
- The editor remains a **0.x development product** until the user explicitly declares a release candidate/complete v1 release.
- After `v0.100`, continue `v0.101`, `v0.102`, `v0.103`, etc.; do not roll to `v1.00` automatically.
- Update canonical production files in place.
- Add a new production file only for a genuinely independent responsibility.
- Do not create `*-fix-vNN.js`, `*-patch-vNN.js` or similar corrective layers.
- Do not reorganise unrelated modules during a targeted task.

## Brush architecture

- User catalogue brushes live as `.ihbrush` files under `app/brushes/`; do not embed their raster payloads in JavaScript.
- IHBR v1 remains readable; IHBR v2 carries UTF-8 JSON catalogue metadata with the raster.
- `app/brush-library.js` owns catalogue/format/folder loading and placement integration.
- `app/brush-manager.js` owns the manager workspace and metadata editing.
- `app/foreground-auto.js` owns Auto Foreground and remains independent of the brush catalogue.
- Special Functions remain procedural and separate from ordinary raster brushes.

## Editor deliverables

- Deliver **complete changed production files**, at repository-relative paths, suitable for overwriting the user's local files.
- Include genuinely new production modules only when required.
- Do not provide a patch/apply script as the primary deliverable.
- Do not package the whole app for a small targeted task.
- A ZIP may be supplied as convenience, containing only changed/new files with repository-relative paths.
- Do not create multiple duplicate ZIPs.
- Do not ask the user to run development tests unless requested; the user normally tests directly in the browser.

## WHDLoad slave development

- Treat the current checked-in slave as authority unless the conversation contains a newer user-tested source not yet pushed.
- Preserve WHDLoad header fields, CUSTOM options, trainer behaviour and proven runtime hooks unless the requested task changes them.
- Final release remains **1.3**; development builds are sequential **`1.3 test N`**.
- The user compiles/tests the slave; lack of a local Amiga assembler is not a blocker.
- Deliver the complete changed `.asm` source, not a patch.
- Do not silently fall back from a selected custom circuit to retail/template data when a mandatory custom asset fails.

## Current architectural principles

- `CUSTOM2=1` is custom-track mode.
- Custom circuits use one reusable active arena, not one permanent allocation per race.
- Custom graphical assets must not be written into transient retail allocator/decompression destinations.
- Retail mode remains available with the original memory footprint through the low-memory configuration.
- Editor package formats should not be changed merely to solve runtime storage.
- Circuit IDs remain `0..99`.
- Current championship runtime remains 11 events.
- Current custom race length remains `1..20` laps.
