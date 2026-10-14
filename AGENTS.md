# Indy Heat project instructions

## Purpose and authority

This repository is an ongoing reverse-engineering, WHDLoad, HTML5 circuit authoring and original Motorola 68000 engine-extraction project. The primary failure modes to avoid are repeating settled research, turning focused implementation work into open-ended exploration, and supplying instructions/partial patches instead of complete requested deliverables.

**The Wiki is the single source of durable technical truth before and after every research and development pass.** Read `AGENTS.md` first, then the current canonical Wiki subject page(s), then only the relevant owner source. The current Dropbox Wiki mirror, when identified by the user as the latest version, takes precedence over an older GitHub Wiki; the current production source, checked-in tests and user's last Amiga/browser results are also authoritative. Explicitly identify genuine conflicts instead of silently choosing an older assertion.

The user owns source control. All GitHub and Dropbox access is **read-only** unless the user explicitly asks for a particular write. Do not commit, push, branch, delete remote files, reorganise remote folders, or rewrite history on the user's behalf.

## MANDATORY: Wiki replacement and delivery protocol

1. **Never create a `-append`, `-merge`, `-fix`, `-correct`, `-targeted merge`, `wiki-merge`, or similarly named Wiki file.** Such outputs are prohibited, even as temporary deliverables. Do not deliver paragraph fragments that must be inserted into an existing page.
2. To change a page, obtain the **complete latest canonical `.md`** first. Merge confirmed findings into its appropriate existing section and deliver a **complete replacement with exactly the original filename** at `wiki/<canonical title>.md`.
3. Preserve ALL existing settled content, addresses, code examples, tables, links, historical evidence and runtime reports. Correct only disproved or superseded statements; visibly distinguish older historical observations from current acceptance. Never recreate a large Wiki page from a shorter/older version or abstract summary.
4. Include all new, enduring documentation directly in `wiki/`. Other than existing needed images/assets in `wiki/images/` or `wiki/data/`, **do not create `evidence/`, `passes/`, `tests/`, `host-audit/`, `analysis/`, `wiki-merge/`, `Research/`, or other side folders as documentation deliverables**. Test-vector tables, original byte ranges, source addresses and host differences necessary to reproduce a result must be embedded in the canonical Wiki page as text or tables, or linked to an already maintained canonical source/fixture.
5. If the research concerns a new distinct, lasting subsystem that cannot reasonably fit an existing canonical page, a genuinely new complete Wiki page is permitted; cross-reference it from appropriate pages and `_Sidebar.md`. Do not create transient per-round research pages when a canonical subject page exists.
6. **`Further Investigation.md` is the only unresolved-work/backlog page.** Put all genuinely unresolved questions there, with specific source/acceptance criteria. When evidence resolves an item, remove or update it in that same complete replacement file.
7. **`AGENTS.md` replacements must also be complete** and placed at repository root, preserving unrelated rules.
8. Deliver one clean ZIP with only full replacement files in repository-relative paths, ordinarily `AGENTS.md` and `wiki/*.md`. No generated README/instructions, test folders, intermediate packages, duplicate copies, or script-only merge directions. Each file must be ready to overwrite its counterpart without additional assembly.
9. If a research round used temporary `.bin`, `.csv`, `.py` or host-audit fixtures, record the necessary source provenance, byte ranges, checksums or formulas in the Wiki and treat the temporary fixtures as deletable after verified documentation reconciliation. The original checked-in `Disk.1`, production `.s` source and accepted standalone candidate ZIP are not disposable research fixtures.
10. For clean-up requests, provide a **separate, explicit deletion inventory** within a complete canonical Wiki page or handover, distinguishing confirmed staging material from files requiring human review. Do not delete or recommend deleting a file merely because its name contains `Research` or `Pass` when it contains unmerged authoritative evidence.
11. Before claiming complete reconciliation, check every affected page's original length/content, the new page's retained headings, Wiki links and duplicate assertions, and the deletion inventory. **If a full up-to-date canonical baseline is unavailable, say so and do not fabricate a replacement or instruct the owner to delete the only copy.**
12. The Wiki output must be sufficient for the next conversation to implement source-first without examining transient directories or rediscovering known offsets.

## Mandatory research and implementation modes

### Implementation mode

When asked to fix, implement, add, change, proceed or modify a clearly localised component:

1. Use the current authoritative owner production file; fetch it only once if not already present.
2. Inspect only direct dependencies needed for the change. Apply the smallest requested edit within the first three investigation tool calls where feasible.
3. Preserve accepted features and original game behaviour. Do not re-investigate settled Disk.1 formats, sprite identities, palettes or waypoint encoding.
4. Perform one focused build/static or runtime-relevant verification and deliver complete production replacement files/ZIP during the current response. Do not supply isolated code snippets or host-side fabricated behaviours instead.
5. For editor changes, increment version labels. For engine/Amiga changes, maintain readable original Motorola 68000 `.s` and BarFly compatibility, verify extracted instruction parity, deliver original fixtures only where needed, and keep the user's Amiga test as final runtime acceptance.
6. The user owns commits, pushes and host testing. Never claim that local assembly or a diagnostic-only branch proves original runtime behaviour.

### Research mode

Only when explicitly requested or when an unknown blocks implementation:

1. Identify the genuinely unresolved question and consult the relevant current canonical Wiki page before new source investigation.
2. Investigate the shortest original code path that resolves the question; avoid broad repeating disassembly and duplication.
3. State exact addresses, inputs, outputs, register/state dependencies, observed versus inferred semantics and the effect on the next extraction.
4. End research when the question is answered. Record confirmed facts in the **complete canonical page replacement** and remaining unknowns only in `Further Investigation.md`.
5. Research must not generate a new application or Amiga executable unless explicitly requested. Avoid standalone `evidence`/`tests` directory proliferation; preserve useful proof in Wiki text.

### Anti-loop / stop rules

After the canonical subject page and owner file, 2–3 speculative source inspections without clear progress is excessive. Stop and implement/deliver the narrow established change or explicitly state the precise blocker. Do not verify the verification. Prefer complete, testable outputs to prolonged exploration.

## Important established facts — do not rediscover without contradictory evidence

- Disk.1 resource tables, decompression, original entry-point addressing and track group identities.
- Six-byte complemented waypoints, signed relative links and descriptor boundary records; retail route-count fingerprints do **not** determine custom track template identity.
- A/B/C are descriptor and linked-graph identities, not simply separate road/pit lanes; preserve branch/rejoin links and lap progress semantics.
- High-memory reusable active custom circuit arena, private minimap descriptor and no `template.bin` dependency in current WHDLoad.
- Race/circuit resources, including `$38` racing cars; `$10/$11` driver/face banks; `$05` pit crew; `$08` PIT-board attendants; `$0F` flag man; and their palette/frame families.
- Female driver indices `03,04,05,08,09,13,19,22,28,37,40,43` (zero-based) and live driver `+$1B` female-presentation flag.
- Existing 11-event original/playlist contract, current custom circuit IDs `0..99`, authored lap range, and custom `race_setup.bin` layout from the current production Wiki.
- Four separate `$31A` car contexts, four `$124` player records, four `$16` pit records, original A5/A6 context ownership, scheduler roots and solved Stage 2C generation-triggered teardown.
- Stage 3B Passes 58–67 are **user-accepted** on Amiga with **RC=0**. Pass 67 confirms real original collision-tail execution and an observed **native A/B route switch**. Its separate preference-conflict `PREF` diagnostic remained negative. P65 crew-task admission and P66 pit movement/lift calls do not establish retail pit lifecycle; human pickup, pit crew rendering and occasional apparent collision pass-through remain incomplete. Pass 68 is an untested candidate, not an accepted baseline.

## Canonical Wiki organisation

Research/data pages include `Disk Image, Loader and Runtime Resource Map.md`, `Track Data and Runtime Setup.md`, `Waypoint, AI and Car Behaviour.md`, `Race, Car and Pit Runtime Structures.md`, `Race Presentation and Graphics Resources.md`, `Player, Driver and Car Data Structures.md`, `Live Race Memory and Vehicle Contexts.md`, `Standalone 68000 Race Engine Interface Contract.md` and `Standalone 68000 Race Engine Extraction Manifest.md`. Stage 3B pass pages document test-specific acceptance. `Further Investigation.md` is the only open-work page.

The editor's user/authoring guidance belongs in `Circuit Editor Operations.md` and `Editor and Track Package Workflow.md`. Do not move reverse-engineered game facts into editor documentation or implementation/UI ownership rules into game-data references.

For new maps, sprites or visual research images, use `wiki/images/` and the actual decoded source palette, not guessed or editor-transformed artwork. Replace outdated diagrams when source/runtime proof supersedes their annotations. Preserve relevant existing images and references.

## Canonical editor ownership

- Foreground/Surface: `app/layer-editor.js`; Auto Foreground: `app/foreground-auto.js`.
- Waypoints: `app/app.js`, `app/waypoint-actions.js`; Recovery: `app/recovery-editor.js`.
- Race setup: `app/race-setup.js`; racing graphics decoder: `app/indyheat_race_graphics.js`; graphics inspector: `app/race-graphics-inspector.js`.
- Backdrop: `app/track-backdrop.js`; MiniMap/map/package: `app/circuit-package.js`.
- Brush primitives: `app/brush-tools.js`; catalogue/IHBR/placement: `app/brush-library.js`; manager: `app/brush-manager.js`.
- UI coordination: `app/editor-ui.js`; top-level shell/scripts/version: `app/index.html`.

Do not use `app/brush-library.js` as a catch-all. Existing independent Special Functions remain registered procedural modules. New Special Function revisions use `1.xxx`; reserve `2.xxx` for true rewrites. Catalogue raster brushes remain `.ihbrush`; retain IHBR v1 reading and IHBR v2 metadata support.

## Editor and WHDLoad delivery

The HTML5 editor is pre-v1: versions increment `v0.100`, `v0.101` and so on until the owner explicitly calls a release. Increment visible/internal versions for all editor changes, preserve shared painting transactions and Foreground polarity, deliver only complete production changes with paths, and do not duplicate modules with patch filenames.

For the WHDLoad slave: preserve header/CUSTOM/trainer and proven runtime hooks; original retail mode and low-memory config must remain supported. The final release remains 1.3, with development versions `1.3 test N`. No silent fallback to retail when mandatory custom data fails. Custom graphics must not occupy transient retail decompression storage; the user builds/tests the `.asm` slave.

## Standalone 68000 engine, Amiga-first

The goal is **standalone, relocatable, readable original Motorola 68000 race-engine extraction** for an Amiga host that supplies track/race/pit/player/resource data, followed later by possible AGA/From Lights to Flag integration. Preserve original code and semantics instead of developing a parallel synthetic physics/AI implementation; use narrow host adapters only for clearly external services (display, sound, scheduling/AmigaOS integration). Exact original instruction evidence is more authoritative than estimated user-visible effects, and user-reported Amiga acceptance is more authoritative than local assembly. All reported RC values, negative coverage and unexercised callbacks must be recorded faithfully.

Stage 3B Pass 68 is the latest user-accepted Amiga HUNK baseline (`RC=0`); its original `$A6FE` ten-stage car dispatcher now runs, its original fuel-RNG state advanced, and native A/B switching was observed. Pass 69 is an untested pit-object-list reintegration candidate, preserving the G-key comparison with the earlier P67 split-update path. The owner will supply the P69 Amiga result before a comprehensive handover to a new thread. The original source authority is `whdload/data/Disk.1` with decompressed 73,834-byte programme SHA256 `f17172dab27fa5b33fc61ee26a8efe9a0628ca5fab8806c38b0a27e967c09e1c`. The next work is completion of the original cooperative task scheduler and genuine pit/effect coroutine lifetimes. Prioritise substantial connected original engine paths, **not** another research sweep, instrumentation-only pass or placeholder that masks missing native behaviour. The most useful previously documented gaps include original CPU-mode preservation, A/B candidate swapping, turbo request/activation, fuel/damage notification scheduling, pit entry/service/release and event-task graphics. Read relevant canonical Wiki evidence before implementing any subset.

## Mandatory original-source and final-code integrity (Stage 3B onward; 14 October 2026)

1. **Physical source availability is a hard precondition.** Before attempting any new code extraction, confirm that the actual original `whdload/data/Disk.1` binary, its verified `73,834`-byte unpacked main programme or an independently reproduced copy, and the latest owner-accepted `.s` source, HUNK, builder and necessary resource fixtures are accessible as bytes in the execution environment. Merely finding their names in Dropbox, reading file previews, or seeing a GitHub URL is **not** sufficient. If any required file is inaccessible or obsolete, **stop and request the exact file from the owner immediately; do not infer, reconstruct or fabricate original instructions**. Compute and record the source checksum and check every newly extracted byte range against the actual game image.
2. **Original gameplay instructions are the only permissible final implementation.** Do not rewrite the AI, physics, steering, upgrades, lap logic, collision, damage, Turbo, fuel, pit logic or game rules as host-calculated equivalents. Permitted final modifications are confined to relocation of original addresses, offsets and memory placements; source-compatible preparation/adaptation of the engine's complete inputs; output adapters exposing its actual results; and compatible graphics/audio rendering interfaces for original outputs, including future AGA support. Where calls, operands or branches must change for relocation, state precisely what changed and validate original unaffected instructions.
3. **Temporary placeholders are explicitly temporary.** An isolated host shim may bridge a missing original allocator, coroutine/IRQ scheduler, asset loader or other external service to keep an intermediate candidate testable. It must be named and documented `TEMPORARY`, must never be mistaken for retail parity, and must not silently replace gameplay logic. Track its original entry and dependency, the exact deletion/replacement criterion, and a next-pass replacement objective in canonical Wiki. Each pass must work towards eliminating placeholders; regressions in original-code coverage are not acceptable simply to make diagnostics green.
4. **Report extraction progress honestly.** Classify each added span as `ORIGINAL / LIVE` (executing), `RELOCATED / LIVE` (with documented operands/calls), `STAGED ORIGINAL` (included but not executed), `HOST I/O` or `TEMPORARY`. Count *distinct* verified original address bytes; never count duplicate fixtures, data tables, instructions staged but unexecuted, host-written instructions, or renamed diagnostics as newly live source. Amiga `RC=0` demonstrates that a candidate ran, not complete retail equivalence.
5. **Prioritise connected substantive extraction.** Integrate and exercise significant original call paths and their producer/consumer dependencies rather than routinely adding isolated 20–50 byte leaves or further test HUD features. A bounded pass may deliberately stop at a native scheduler or rendering dependency; disclose the precise gap and do not claim unfinished coroutines are active.
6. **Existing successes are not a blank cheque for host substitutions.** Audit earlier Stage 3B host decisions; progressively replace them with source-verifiable retail routines. Preserve actual owner-reported negative coverage (`PREF` route switch not seen, native crew/fire/debris visuals not yet scheduled, original manual pit pickup incomplete) and avoid tuning or inventing engine behaviour to satisfy visual expectations.
7. **The required source bundle and canonical documents must accompany the output.** A complete Amiga candidate ZIP includes native HUNK, readable full `.s`, builder, exact source/provenance fixtures and any resource files actually needed to run. Changed Wiki pages must be complete replacement pages under their canonical names, `AGENTS.md` at repository root if changed; no partial patch snippets or remote modifications. The Amiga is the final acceptance authority.

## Final documentation check

Deliverable acceptance for a research/documentation task requires complete canonical `.md` files, not snippets or a narrative claiming they are ready. The file-tree should be immediately suitable for copying to the repository. Never announce research staging folders as long-term Wiki dependencies. Retire staging fragments only **after** the complete replacements have been verified to contain their findings.
