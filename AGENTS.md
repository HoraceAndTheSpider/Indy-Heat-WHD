# Indy Heat project instructions

## Purpose

This repository is a continuing reverse-engineering and authoring project. The primary failure modes to avoid are:

- repeating research that has already been settled;
- allowing a small implementation task to turn into an open-ended investigation;
- diagnosing or describing a requested fix instead of delivering the changed file.

The GitHub Wiki is the project's durable technical memory. Its research/data pages should be detailed enough that a new thread can implement from them without rediscovering offsets, formats, graphics resources or runtime behaviour.

## Mandatory startup protocol

1. Read this `AGENTS.md` first.
2. Treat the current checked-in `master`, current pushed Wiki, checked-in tests and latest explicit user/runtime handover as authority.
3. Repository access is read-only/reference work unless the user explicitly asks otherwise. Do not commit, push, create branches or rewrite history. The user owns commits/pushes.
4. Before new reverse-engineering, read the relevant Wiki subject page first. Do not re-prove a finding already documented there.
5. A user-reported live editor or Amiga/FS-UAE runtime result is the acceptance result. Static inspection is not a substitute for that observation.
6. If current source/data genuinely contradicts a Wiki statement, identify the contradiction explicitly and investigate only that point.
7. Do not read every Wiki page for every small task. Read only the page(s) relevant to the named subsystem, then the owning source file(s).

## Hard execution gate for targeted fixes

This section is mandatory and overrides any tendency to broaden a small bug fix into research.

When the user reports a specific error, names the affected control/file, or asks for a clearly localised fix:

1. Treat it as implementation mode immediately.
2. Use the current local/current-session production file first. If it is unavailable, fetch the single canonical owner file once.
3. Do not browse the web, search historical commits, inspect Disk.1, re-read unrelated Wiki pages, or run repository-wide searches unless the owner file proves one is genuinely required.
4. If the error itself identifies the stale assertion/value/path, fix that exact point. Do not re-investigate the subsystem first.
5. Inspect at most one direct dependency unless the code demonstrates another dependency is required.
6. Begin the edit within three tool calls maximum after the task arrives. If three tool calls have occurred without an edit, stop investigating and make the smallest justified change.
7. Run one focused verification only: a syntax/static check or the narrowest relevant local test.
8. Deliver the requested complete replacement file/ZIP in the same response. Do not substitute a diagnosis, explanation, patch note or code snippet for the requested output.
9. Do not repeat source retrieval after the required file has already been obtained.
10. If artifact/file-transfer tooling causes friction, solve the transfer directly; do not turn that friction into source research.
11. Never provide patch notes unless the user explicitly asks for them.
12. If the user says a task is targeted, local, simple or already isolated, do not broaden it under any circumstances without a concrete code-level blocker.

Default sequence for targeted fixes:

```text
owner file -> edit -> one check -> deliver
```

Anything broader requires a concrete blocker visible in the code or an explicit user request for investigation.

## Two working modes

### Implementation mode — default when the user says implement, fix, add, change or proceed

When the user asks to implement a feature from already-established findings, treat the documented findings as a specification, not as hypotheses to re-investigate.

Workflow:

1. Read the relevant Wiki subject page only if needed.
2. Inspect the canonical owning production file.
3. Inspect only direct dependencies needed to make the change.
4. Begin editing.
5. Perform one focused verification pass over the edited behaviour and obvious regression points.
6. Deliver the complete changed production files promptly for user runtime/browser testing.

Do not during implementation mode:

- re-run settled Disk.1/resource/decompression research;
- search the entire repository “just in case”;
- search historical commits or the web without a specific blocker;
- revalidate a documented binary mapping merely because it is important;
- broaden a local task into architecture cleanup or a new research milestone;
- keep checking after the information needed to code is already available;
- turn tool/file-transfer friction into a research project;
- provide prose in place of the requested output.

### Research mode — only when the user asks for investigation or a genuine unknown blocks implementation

Research mode should answer a clearly stated unknown.

Before starting, identify:

- the exact unresolved question;
- which existing Wiki page was checked;
- why the documented knowledge is insufficient or contradictory;
- what evidence would resolve the question.

When the question is answered, stop. Record the settled result on the relevant subject Wiki page during the next requested documentation pass. Do not leave a solved result only in chat history.

## Anti-loop / stop rules

- After reading the relevant Wiki page and owning source file, 2–3 additional source inspections without beginning the requested edit means the task is drifting.
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
- the reusable custom high-memory arena architecture;
- racing-car graphics location: resource `$38`;
- driver/face graphics identity: resources `$10/$11`;
- `$05` pit-crew frame-family layout;
- `$08` male/female PIT-board frame-family layout;
- the confirmed zero-based female-driver lookup `03,04,05,08,09,13,19,22,28,37,40,43` and live `+$1B` female presentation flag;
- the Gasoline Alley presentation palette used for `$10/$11`;
- previously proved MiniMap/name/runtime presentation hooks.

If an implementation needs one of those facts, use the Wiki result directly.

## Wiki purpose and structure

The Wiki is primarily a reverse-engineering/data reference, not an editor changelog.

Canonical research pages:

- `Disk Image, Loader and Runtime Resource Map.md`
- `Track Data and Runtime Setup.md`
- `Waypoint, AI and Car Behaviour.md`
- `Race, Car and Pit Runtime Structures.md`
- `Race Presentation and Graphics Resources.md`
- `WHDLoad Runtime Overrides and Custom Track Loading.md`

Editor documentation:

- `Circuit Editor Operations.md`
- `Editor and Track Package Workflow.md`

Do not move game-data research into editor pages merely because the editor consumes it. Do not put editor implementation details into reverse-engineering pages unless they are evidence about the original game.

## One unresolved-work page only

There must be one and only one:

`Further Investigation.md`

All unresolved research, validation questions and deliberately deferred investigations belong there.

When an item becomes settled:

1. move/add the result to the appropriate research/data page;
2. remove the resolved item from `Further Investigation.md`;
3. update or replace any research image whose annotation has now been confirmed or disproved;
4. preserve useful historical evidence where it explains the current architecture, but label superseded approaches clearly.

A direct user visual/runtime confirmation is sufficient project evidence to settle a visual identity unless later source/runtime evidence contradicts it.

## Documentation preservation

When updating the Wiki:

- use the current pushed Wiki/export supplied by the user as the baseline;
- do not reconstruct pages from an older export when a newer Wiki copy exists;
- preserve existing settled detail;
- add new findings rather than deleting useful evidence;
- correct stale statements that would cause repeated research;
- preserve page names exactly;
- update `_Sidebar.md` only to keep the research/editor/open-work grouping accurate.

Routine small editor changes do not require Wiki updates unless the user asks for a documentation pass or the change establishes new technical knowledge.

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

1. use implementation mode immediately;
2. use the current local/current-session owner file first; fetch the canonical owner once only if necessary;
3. widen only if the owner code proves it necessary;
4. begin editing within three tool calls;
5. make the smallest production change that satisfies the request;
6. increment the editor version where the app itself changes;
7. perform one focused verification;
8. deliver complete changed files in the same response;
9. do not provide diagnosis, patch notes or implementation commentary instead of the requested files.

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

Do not use `app/brush-library.js` as a general editor catch-all.

## Current graphics implementation rule

Research authority is the Wiki:

```text
$10/$11  driver / face presentation banks
$38      racing-car bank
$05      pit crew
$08      PIT-board attendants
$0F      flag man / starting gun
```

Normal `$38` car preview direction comes from route/driving heading, not the Recovery `+3` layer.

## Continuity and source selection

- Prefer the newest known working source.
- If the current conversation contains a user-tested local build newer than `master`, do not silently rebuild from older `master`.
- If the user has pushed the prior work, current `master` supersedes old handover version references.
- Do not recreate a solved feature from memory if current source already contains it.
- Preserve accepted behaviour unless the task explicitly changes it.
- Do not fetch the same source file repeatedly in one task.

## Editor versioning and file hygiene

- Every HTML5 editor/app change increments the visible/internal version.
- The editor remains a 0.x development product until the user explicitly declares a release candidate/complete v1 release.
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

## Special Functions versioning

- Plugin version numbering starts at `1.000`.
- `1.xxx` is the normal revision line.
- `2.xxx`, `3.xxx`, etc. are reserved for complete rewrites/major replacement generations.
- Do not use `0.x.x` plugin versions for new revisions.

## Editor deliverables

- Deliver complete changed production files, at repository-relative paths, suitable for overwriting the user's local files.
- Include genuinely new production modules only when required.
- Do not provide a patch/apply script as the primary deliverable.
- Do not package the whole app for a small targeted task.
- A ZIP may be supplied as convenience, containing only changed/new files with repository-relative paths.
- Do not create multiple duplicate ZIPs.
- Do not ask the user to run development tests unless requested; the user normally tests directly in the browser.
- Never provide patch notes unless explicitly requested.
- When the user requests an output file, the response is incomplete until the file is actually supplied.

## WHDLoad slave development

- Treat the current checked-in slave as authority unless the conversation contains a newer user-tested source not yet pushed.
- Preserve WHDLoad header fields, CUSTOM options, trainer behaviour and proven runtime hooks unless the requested task changes them.
- Final release remains 1.3; development builds are sequential `1.3 test N`.
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
