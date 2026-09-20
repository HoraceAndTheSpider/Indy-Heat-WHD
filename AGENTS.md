# Indy Heat project instructions

## Mandatory startup protocol

- Read this `AGENTS.md` first.
- Treat the **current checked-in `master`**, current pushed wiki, checked-in tests and the latest explicit handover/runtime-proof document as authority.
- Repository access is **read-only/reference work unless the user explicitly asks otherwise**. Do not commit, push, create branches or rewrite repository history. The user tests locally and owns commits/pushes.
- Do not repeat settled reverse-engineering because work has moved to a new conversation. Re-open a settled point only when current source/data or a new runtime observation contradicts it.
- A user-reported live editor or Amiga runtime result is the acceptance result. Static source inspection is not a substitute for that runtime observation.

## Targeted tasks — default for small editor changes

A **targeted task** is a small, localised request where the user identifies the editor mode, control, file or behaviour to change and is **not** asking for new reverse-engineering.

Examples:
- add one button to an existing editor mode;
- rename or reposition an existing control;
- add a simple transform to an existing layer;
- change a default, range, label, tooltip or small export field;
- make a small visual/editor interaction change.

For a targeted task:

1. **Do not perform a repo-wide investigation.**
2. Inspect the most likely owning file first. Follow only direct dependencies required to make the requested change.
3. Do not re-read the entire wiki, all handovers, all tests or unrelated source modules.
4. Do not search historical commits or the web unless the requested behaviour genuinely cannot be understood from the current source.
5. Do not broaden the task into architecture cleanup, refactoring, reverse-engineering or documentation unless the user asks.
6. Make the smallest production change that satisfies the request.
7. Perform one focused verification pass covering the edited behaviour and obvious regression points.
8. Deliver the result promptly. Do not spend time building extra diagnostic packages, patches, diffs, helper scripts or alternative implementations unless required.
9. If the user gives several small editor changes serially, complete each as a separate targeted task and keep momentum rather than re-auditing the project every time.

When a targeted editor task names a mode, start with its canonical owner:
- Foreground / Surface: `app/layer-editor.js`
- Waypoints: `app/app.js` and `app/waypoint-actions.js`
- Recovery: `app/recovery-editor.js`
- Race setup: `app/race-setup.js`
- Backdrop: `app/track-backdrop.js`
- MiniMap / Map / package: `app/circuit-package.js`
- editor coordination / layout: `app/editor-ui.js`
- top-level shell/version/script order: `app/index.html`

Only widen beyond those files when the current code proves it is necessary.

## Continuity and source selection

- Prefer the **newest known working source**. If the current conversation contains a user-tested local build newer than repository `master`, do not silently rebuild from the older master snapshot.
- If a new thread starts after the user has pushed the previous work, current `master` supersedes the handover's old commit/version references.
- Do not re-create a solved feature from memory if the current source already contains it.
- Preserve existing accepted behaviour unless the requested task explicitly changes it.

## Editor versioning and file hygiene

- Every HTML5 editor/app change increments the visible/internal editor version.
- Version increments do **not** justify creating version-suffixed production files.
- Update canonical production files in place. Add a new production file only when the feature has a genuinely independent responsibility.
- Do not accumulate `*-fix-vNN.js`, `*-patch-vNN.js` or equivalent corrective layers.
- Do not reorganise the app during a targeted task unless the user explicitly asks for cleanup.

## Editor deliverables

- Deliver **only complete changed existing app files**, at their repository-relative paths, suitable for overwriting the user's local files.
- Do not provide partial snippets, patches or apply scripts as the primary deliverable.
- Do not package the whole `app/` directory for a small change.
- A ZIP is optional convenience only. If used, it contains only the complete changed files and preserves repository-relative paths.
- Do not create multiple equivalent ZIPs or duplicate URL-encoded filenames.
- Do not include Node test/helper files unless the user explicitly asks.
- Do not ask the user to run development tests unless requested. The user normally tests the editor directly in the browser.
- For a trivial one-file behaviour change, prefer the direct changed file plus only the version/changelog files that genuinely must change.

## Documentation tasks

- Preserve existing wiki page names. Do not rename pages by introducing hyphens or URL-encoded filenames.
- Keep **one and only one** `Further Investigation.md` page.
- Findings belong on the relevant subject page; only unresolved work belongs on `Further Investigation.md`.
- Do not duplicate the same finding across several wiki pages unless a short cross-reference is genuinely useful.
- For routine small editor changes, do **not** update the wiki unless the user asks for a documentation pass.

## WHDLoad slave development

- Treat the current checked-in slave as authority unless the current conversation contains a newer user-tested source not yet pushed.
- Preserve existing WHDLoad header fields, CUSTOM options, trainer behaviour and proven runtime hooks unless the requested task changes them.
- The final release remains **1.3**. Development builds are sequential **`1.3 test N`**.
- The user compiles/tests the slave. Lack of a local Amiga assembler is not a blocker.
- Deliver the complete changed `.asm` source, not a patch.
- Do not fall back silently from a selected custom circuit to retail/template data when a mandatory custom asset fails. Custom loading is all-or-nothing.

## Current architectural principles

- `CUSTOM2=1` is custom-track mode.
- Custom circuits use one reusable active arena; do not allocate one permanent copy per championship race.
- Custom graphical assets must not be written into transient retail allocator/decompression destinations.
- Retail mode must remain available with the original memory footprint through the low-memory configuration.
- Editor package formats should not be changed merely to solve a runtime storage problem.
