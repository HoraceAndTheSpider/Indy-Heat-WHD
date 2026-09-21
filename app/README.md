# Indy Heat Amiga Circuit Editor

Current editor version: **v0.48**.

This directory is the complete deployable browser editor. It is intentionally kept separate from reverse-engineering probes, historical integration patches and Node test files so the live application has one clear runtime file set.

## Runtime files

- `index.html` — application shell, deterministic script load order, top-level Circuit/Playlist mode switch and championship-playlist authoring UI.
- `style.css` — base application styling.
- `indyheat.js` — Disk.1/resource decoding, race records, waypoint data and shared binary helpers.
- `recovery-hook.js` — early capture/bridge layer used to keep the core and extension editors on the same live Disk.1 models.
- `layer-tools.js` — shared resource-neutral raster editing core used by Surface/Foreground and MiniMap (geometry, brush expansion, fill and bounded writes), with compatibility wrappers for existing callers.
- `indyheat_race_graphics.js` — authentic race-object/BOB graphics decoder.
- `app.js` — core circuit viewer and waypoint editor.
- `layer-editor.js` — Foreground and Surface editor UI/resource adapter using the shared raster tools, plus whole-layer Foreground inversion and fixed viewport support.
- `waypoint-actions.js` — waypoint-mode convenience actions, including AI Turbo-marker toggle and whole-route left/right mirroring.
- `recovery-editor.js` — +3 recovery-direction editor, group selection, held rotation and cell grid.
- `race-setup.js` — race/pit/start/flag setup editing.
- `track-backdrop.js` — track backdrop import/export and IFF conversion.
- `circuit-package.js` — custom circuit package, MiniMap/Map and presentation workflows.
- `editor-ui.js` — consolidated editor coordination: mode ordering, folds, Race HUD, lap slider, overlay colours and accepted presentation refinements.

## Current authoring contract

Waypoint mode includes **Flip all waypoints L/R**, which mirrors every point on Routes A/B/C in game-screen space using `screen X = 320 - screen X`. The stored/runtime X values are solved through the code-derived A082 projection; Y, sequence, flags and link topology are left unchanged.

Master Circuit Zoom now supports 100%–1000% in 50% increments.

Surface/Foreground and MiniMap now share one raster-tool core in `layer-tools.js`. Tool-name aliases (`freehand`/`pencil`, `rectangle`/`rect`), geometry, outlined/filled shapes, brush expansion, hatching, bounded painting and flood-fill are defined there rather than reimplemented per editor. Surface/Foreground use the generic API directly; MiniMap's existing calls remain compatible wrappers over the same implementation. The shared API is deliberately resource-neutral so Backdrop can adopt it later without another set of drawing primitives.

Race mode now drags **START GRID**, **P× STOP** and **P× PIT** using their actual fixed-point coordinate precision rather than waypoint integer quantisation. These markers can therefore settle at single-pixel screen positions where the game projection permits it. PIT CREW and FLAG remain direct integer screen coordinates.

Recovery group editing now uses the selected group consistently: the Rotate left/right buttons act on the grabbed selection, and holding left/right mouse on a selected arrow continuously rotates the whole group even if Grab group is still enabled. **Auto recovery** is independent of selection and always recalculates the whole map using the chosen propagation depth; existing group selection is preserved.

Recovery mode includes an explicit **Auto recovery** calculation. It derives boundary directions from the current Surface class 1/collision layout, carries the result one cell into the active wall field, and propagates through nearby non-active cells for a selectable 1–10 cell depth (default 5). Multiple influences are vector-averaged and the complete pass is one Undo operation.

The normal circuit workflow now uses the circuit ZIP as the authoring/export deliverable. Raw resource `.bin` downloads, Track JSON, waypoint patch and modified-main exports are retained only under the collapsed **Developer exports** area for debugging and inspection. `indyheat_playlist.bin` remains a normal Playlist Editor import/export because it is the runtime playlist format itself.

The runtime UI deliberately keeps reverse-engineering explanation out of the main controls. Lower diagnostic folds stay concise and link back to the GitHub wiki for detailed data structures and implementation notes.

The former 64×64 magnifier has been removed. Use **Fixed 640×512 viewport** beside Master Circuit Zoom to keep the circuit display to the same visible size as the complete 200% view while using higher zoom levels. At higher zoom, move around the circuit with the trackpad or viewport scrollbars; all circuit overlays remain aligned because the viewport contains the complete shared canvas stack.

Editor mode selection is centrally coordinated: Backdrop, Foreground, Surface, Waypoints, Recovery, Race, MiniMap and Map share one authoritative current mode, so only one mode button can be selected at a time.

Drawing primitives are clipped by the resource boundary rather than by the drag geometry. Lines, rectangles/squares and ellipses/circles may extend beyond the visible track; only the resulting in-bounds Foreground pixels or Surface cells are written. This permits partial shapes at any edge without flattening the primitive against the canvas boundary.

Foreground edit mode includes **Invert layer**. It flips the complete 320×256 1bpp foreground/occlusion mask in one operation. On `$2804` resource variants only the `$2800` bitmap bytes are inverted; the four trailing bytes are preserved. The action participates in the normal Undo/Revert/dirty-state path, so raw foreground export and circuit ZIP export use the inverted data directly.

Custom race length is **1–20 laps**. The editor uses the established runtime-supported range and does not widen the WHDLoad gameplay contract.

The current championship runtime remains **11 races**. The playlist editor therefore exposes the championship-length control but keeps it visibly disabled at 11. The IHPL header already contains a count word and the editor's parser/serializer is count-driven, so no file-format redesign is required when WHDLoad eventually supports shorter or longer championships.

Overlay colours are editor display preferences only; they do not alter circuit resource data. Foreground and Surface colours are shared with the layer renderer, while Recovery has separate arrow/grid display colours.

The left-side **Surface Types**, **Waypoints**, **Recovery**, **Pits** and **Race Control** groups are foldable. Folding a group does not change overlay visibility: each fold header retains its independent `[x]` master visibility control. Recovery exposes **Arrows** and **Grid** visibility in this left-side group with their existing colour pickers. Pits and Race Control may be switched on as display overrides while another edit mode is active, allowing direct comparison against Surface, Foreground or other overlays. Mode changes still establish the normal defaults; the left-side controls then act as explicit overrides.

The Recovery layer is the authentic **40×28** direction grid, one byte per **8×8** gameplay cell. Grab group supports click selection and drag-marquee selection. With Grab group off, left/right mouse rotation can be held continuously and a complete hold is one Undo operation.

## Championship playlist

The application has two mutually exclusive top-level modes: **Circuit Editor** and **Playlist Editor**. Playlist authoring is a separate full-width workspace rather than part of the Circuit Editor side column.

The built-in playlist editor writes the established `indyheat_playlist.bin` format. The current circuit-ID ceiling is **99**, not 20: **1–20 is only the lap-override range**. Playlist v2 stores the circuit value as a 16-bit word, but the present WHDLoad loader explicitly validates `0..99` and constructs two-digit `circuit_00..circuit_99` package paths.

It writes:

- magic `IHPL`;
- export version **2**;
- current runtime count **11**;
- each event is `{ circuit.w, laps.w }`;
- v2 circuit numbers are **0–99**;
- laps are **`$FFFF` inherit** or **1–20**.

Import accepts both playlist v1 and v2. v1 physical Track IDs `1..10` are converted to v2-style zero-based circuit IDs `0..9` in the editor. Export always writes v2.

The **Reset retail** action restores the established retail championship order:

`0, 5, 1, 2, 3, 4, 6, 7, 8, 9, 5`

which corresponds to the original physical Track-ID order `1, 6, 2, 3, 4, 5, 7, 8, 9, 10, 6`.

## Circuit package

The custom package workflow continues to use the established package files where applicable:

- `background.bin`
- `foreground.bin`
- `surface.bin`
- `recovery.bin`
- `preview.bin`
- `waypoints.bin`
- `race_setup.bin`
- `name.bin` — optional 18-byte Gasoline Alley circuit-name sidecar (17 display bytes + NUL); older packages without it remain valid.
- `template.bin` — two-byte big-endian retail template index (`0..9`) emitted by v0.32+ exports for unambiguous WHDLoad custom-route hosting.
- `presentation.bin`

MiniMap templates are embedded in the application; no separate template artwork files are required in this directory.

Circuit ZIP export in v0.32+ is a single direct serialisation path. At **Export circuit ZIP** it reads the live race/name/map/HUD controls, the current editable MiniMap buffer and the selected circuit resources, then builds and verifies one package. Clean retail clones choose waypoint data matching the selected retail route shape (for example Indianapolis 68/70/54). No separate **Apply fields** click is required. Signed presentation and pit coordinates may be negative; if a control has not been initialised, export preserves the selected circuit's existing value rather than treating the missing control as zero/NaN.

## Development history

Earlier per-version changelogs, integration patches, research probes and `test_*.js` files are deliberately not part of this deployable `app/` folder. Their history remains available in Git. Development-only material should live outside `app/` rather than being reintroduced into the runtime directory.
