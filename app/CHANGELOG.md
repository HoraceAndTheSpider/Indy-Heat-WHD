# Changelog

## v0.42 — extend master zoom to 1000%

- Increased the Master Circuit Zoom control maximum from 600% to 1000%.
- Existing 50% zoom increments and all zoom/render behaviour are unchanged.

## v0.41 — single authoritative editor mode

- Added one authoritative `currentModeId` in the consolidated UI coordinator.
- All eight editor mode buttons now derive their selected state from that single value, so more than one mode button cannot remain highlighted at the same time.
- Existing mode modules may continue to perform their own setup/teardown, but any independent `.active` class changes are immediately reconciled back to the authoritative mode.
- Trusted user mode changes and legitimate programmatic mode changes are both supported; internal Waypoints hand-off clicks during another mode's activation cannot steal the selected mode.
- Added matching `aria-pressed` state and a `data-current-mode` value on the mode-button host.
- Updated the editor's visible/internal version and `editor-ui.js` cache-busting value to v0.41.

## v0.40 — allow drawing primitives beyond the canvas edge

- Changed line, rectangle/square and ellipse/circle drag geometry so the endpoint is no longer clamped to the visible track boundary.
- Shapes may now extend beyond the Foreground 320×256 bitmap or the Surface 160×112 logical grid (320×224 gameplay area).
- The complete primitive is generated first; existing resource bounds checks simply discard pixels/cells that fall outside the real resource.
- This allows genuinely clipped partial shapes at the edge, including circles/ellipses where only part of the curve, a single column or a single pixel remains on-screen.
- Freehand and Fill retain their established bounded behaviour.
- Updated the editor's visible/internal version and `layer-editor.js` cache-busting value to v0.40.

## v0.39 — drawing tools reach the final edge

- Fixed drag-based Surface and Foreground drawing tools committing the last `pointermove` position instead of the actual pointer-release position.
- Line, rectangle, filled rectangle, ellipse/circle and filled ellipse/circle now use the true release pixel/cell, so shapes can reach the final row/column instead of stopping one step short.
- Freehand drawing also closes the final segment to the pointer-release position when no final move event was emitted.
- Active Surface drags clamp to the real final 160×112 cell at the bottom edge instead of discarding a release exactly at or beyond gameplay Y=224.
- Updated the editor's visible/internal version and `layer-editor.js` cache-busting value to v0.39.

## v0.38 — Recovery view group and cross-mode Race/Pits overlays

- Added a foldable **Recovery** group to the left-side View controls.
- Recovery **Arrows** and **Grid** now have independent visibility checkboxes there, with their existing colour pickers alongside them; the grid display control is no longer left isolated in the Recovery edit pane.
- Recovery arrows can now be displayed as an overlay while another edit mode is active. Selecting Recovery mode still enables the arrows by default; other mode selections default them off, after which the left View control can deliberately re-enable them for comparison.
- **Pits** and **Race Control** overlays now render when enabled from the left View controls even when Race edit mode is not active. This allows comparisons such as PIT-board positions against Surface or Foreground overlays.
- Mode selection still applies the established default of hiding Race/Pits overlays outside Race mode, but a subsequent left-panel selection is now treated as an explicit visibility override rather than being ignored.
- Fixed the left Pits/Race mirror checkboxes so they stay synchronised when mode defaults change the underlying race visibility controls.
- Race HUD overlays can also be shown outside Race edit mode without exposing the Race edit drag cursor/anchor.
- Updated the editor's visible/internal version and changed-script cache-busting values to v0.38.

## v0.37 — restore left-side folding controls

- Restored the accepted foldable **Surface Types**, **Waypoints**, **Pits** and **Race Control** sections in the left-side View controls.
- The fold arrow and section description control only whether the section is expanded; the adjacent `[x]` master checkbox remains an independent overlay on/off control.
- Preserved the existing overlay colour controls and their visibility behaviour rather than replacing the master toggles.
- Moved fold-container recovery into the consolidated UI coordination retry path so the controls are rebuilt reliably even when the layer/race controls initialise after the earlier package startup pass.
- Updated the editor's visible/internal version and `editor-ui.js` cache-busting version to v0.37.

## v0.36 — foreground layer invert

- Added **Invert layer** to Foreground edit mode.
- The action flips every bit in the complete 320×256 1bpp foreground/occlusion bitmap in one operation.
- Only the `$2800` bitmap bytes are inverted; the four trailing bytes present in `$2804` resource variants are preserved unchanged.
- The inversion uses the existing layer history/dirty-state path, so **Undo**, **Revert layer**, **Revert all edits**, raw foreground export and circuit ZIP export all use the inverted data normally.
- The control is visible only in Foreground mode; Surface editing is unchanged.
- Updated the editor's visible/internal version to v0.36.

## v0.35 — flip all waypoint routes left/right

- Added **Flip all waypoints L/R** to the Waypoint editor.
- The action transforms every waypoint on Routes A, B and C together.
- The requested mirror is performed in game-screen space as **X = 320 − X** using the code-derived A082 waypoint projection; it is not a raw stored-X negation.
- Waypoint Y, sequence/progress, AI Turbo flag and link delta are preserved.
- The transform computes every result before writing any waypoint, so a failed calculation cannot leave a partially mirrored route set.
- Mirrored waypoints use the normal editor write/edit bookkeeping, so existing waypoint patch export, modified-main export, circuit package export and **Revert all edits** continue to operate on the transformed data.
- Updated the editor's visible/internal version to v0.35.

## v0.34 — top-level Circuit / Playlist editor modes

- Moved championship playlist authoring out of the Circuit Editor's left-hand column.
- Added mutually exclusive **Circuit Editor** and **Playlist Editor** buttons beside the application title; switching modes hides the other editor while preserving its in-memory state.
- Reworked the playlist table into explicit **Race / Circuit ID / Circuit / Laps** columns.
- Clarified the two independent limits in the UI: circuit IDs are **0–99**, while **1–20** applies only to lap overrides.
- Kept the future championship-length control visible but disabled at the current runtime-required 11 races.
- Confirmed why the current custom-circuit ceiling is 99: playlist v2 stores a 16-bit circuit word, but WHDLoad test 30 explicitly caps it at 99 and its path builder emits exactly two decimal digits for `circuit_00..circuit_99`.
- Updated the editor's visible/internal version to v0.34.

## v0.33 — championship playlist editor

- Added a built-in **Championship playlist** authoring panel with the current runtime-fixed 11 race slots.
- Each race can select circuit `0..99` and either inherit the circuit lap count (`$FFFF`) or override it with `1..20` laps.
- Export writes the established 52-byte **IHPL v2** file as `indyheat_playlist.bin` and immediately re-parses the generated bytes before download.
- Import accepts both IHPL v1 and v2. v1 physical Track IDs `1..10` are converted to zero-based circuit IDs `0..9`; export always uses v2.
- The playlist parser/serializer is structurally count-driven, so the IHPL file format remains ready for future championships shorter or longer than 11 races.
- The **Championship races** control is deliberately visible but disabled at 11 because WHDLoad 1.3 test 30 currently rejects any other event count.
- Updated the editor's visible/internal version to v0.33.

## v0.32 — signed-coordinate export fallback

- Fixed direct circuit export failing with `Lap-total display X must be a signed 16-bit integer` when HUD controls had not yet been initialised. Negative signed coordinates are valid and remain supported.
- Presentation export now starts from the selected circuit's existing marker/HUD values and overrides only controls containing valid integers.
- Race/pit export uses the same fallback rule, preserving existing signed and 16.16 values for controls that are absent or blank instead of serialising `NaN`.
- Updated editor/cache-busting version to v0.32.

## v0.31 — direct circuit ZIP serialisation

- Replaced the fragile download-interception/post-processing path used by v0.28–v0.30.
- **Export circuit ZIP** now owns the export in one capture handler and stops the older package click handler, so only one ZIP can be produced.
- Export serialises the current live circuit number, geographic map fields, HUD anchor, race setup/lap count and Gasoline Alley name at click time.
- `preview.bin` is read directly from the current editable MiniMap resource buffer.
- Clean retail clones select waypoint data from the loaded model whose route counts match the selected retail source (Indianapolis = 68/70/54), avoiding stale cross-model waypoint state.
- `name.bin` and `template.bin` are written as normal package files rather than post-processing additions.
- The completed ZIP is re-read before download and verifies name, laps, map ID, template and waypoint route counts.
- Retail circuits are never blocked from export merely because editor models disagree; the exporter chooses the matching retail source when available.
- Added v0.31 cache-busting query strings for the export/UI scripts so replacing the canonical files cannot leave an older exporter active in the browser cache.

## v0.30 — live export-state capture

- Circuit ZIP export now snapshots the visible race-setup controls at export time and writes that exact `$68` payload into `race_setup.bin`; a separate **Apply fields** click is no longer required before exporting.
- The visible Gasoline Alley name is encoded directly at export time, so text typed into the field cannot fall back to the previously loaded retail name.
- The export interception now runs in the capture phase, before the normal package exporter, removing the event-order race between `race-setup.js` and `circuit-package.js`.
- Removed v0.29's waypoint cross-model rewrite. It could substitute a different retail route set; export now leaves the package exporter's waypoint bytes untouched.
- Confirmed from the user's failing package that Mini-map scribbles were already present in `preview.bin`; the unchanged in-game Mini-map remains a WHDLoad loader issue rather than an editor export issue.

## v0.29 — retail clone export repair

- Removed the v0.28 retail-clone export blockers. Selecting a retail circuit and assigning a new custom circuit number must always remain exportable.
- Retail clone export now treats the selected retail circuit as authoritative and repairs cross-model drift instead of surfacing it to the user.
- `waypoints.bin` is rebuilt from a loaded model whose waypoint counts match the selected retail circuit's established route shape when one is available.
- An unedited Gasoline Alley name is regenerated from the selected retail circuit label, preventing stale package/name state from leaking into a new clone. Explicitly edited names are preserved.
- `template.bin` remains explicit two-byte metadata for the selected retail template.

## v0.28 — circuit clone/export integrity

- Fixed circuit-name state leaking between different source circuits that reused the same destination circuit number. Name state is now scoped to the selected source/package plus circuit number and is cleared when a new Disk.1 model is loaded.
- Imported `name.bin` data is now bound to the package selection created by that import instead of globally to `circuit_xx`.
- Added a retail-clone export preflight: when exporting directly from a retail source, the three waypoint counts must match that selected circuit's established route shape. Mixed-model exports are blocked instead of silently producing a misleading runtime test package.
- Circuit ZIP export now adds `template.bin`, exactly two big-endian bytes containing the selected retail template index (`0..9`). This is additive metadata for the custom-route relocation work; older package readers may ignore it.
- Export status now reports the template index, route counts and emitted Gasoline Alley name so source contamination is visible immediately.

## v0.27 — Gasoline Alley circuit names

- Added editable **Circuit name** in Race mode for the name shown in Gasoline Alley (1–17 printable ASCII characters; `<` and `@` remain reserved retail padding glyphs).
- Circuit ZIP export now includes `name.bin` (18 bytes: 17 display bytes plus NUL) while keeping the runtime-proven `race_setup.bin` format unchanged at `$68` bytes.
- Older eight-file circuit ZIPs remain import-compatible: if `name.bin` is absent, the current retail/template name is retained.
- Circuit-name authoring is kept separate from the shared retail host race record, so editing a package name does not overwrite the host circuit name.
- Runtime loading requires WHDLoad **1.3 test 23** (or later), which injects optional `name.bin` into `race+$70..+$81`.

## v0.26 — consolidated editor

- Rebuilt `app/` as a clean deployable folder rather than carrying historical tests, probes, patches and per-version changelogs alongside the runtime.
- Consolidated the two historical `editor-fixes-v019x.js` corrective layers into one stable `editor-ui.js` module while retaining the already accepted editor behaviour.
- Made `index.html` own the complete deterministic runtime script order.
- Reduced `recovery-hook.js` to its actual role: early model/event capture and the selected-track refresh bridge. It no longer injects the rest of the editor dynamically.
- Made the source version explicit as **v0.26** and removed competing version rewrites from `circuit-package.js`.
- Moved Foreground/Surface display-colour ownership into `layer-editor.js`; the v0.25 colour controls now feed the renderer directly instead of intercepting canvas drawing calls.
- Preserved browser colour preferences, including one-time compatibility with the v0.25 storage keys.
- Normalised both UI-coordination scopes to the accepted mode order: Backdrop, Foreground, Surface, Waypoints, Recovery, Race, MiniMap, Map.
- Retained the accepted IFF refresh, 1–20 lap slider, MiniMap templates/hover previews, Recovery marquee/held-rotation/grid controls and overlay colour pickers.
- No custom circuit package format or WHDLoad runtime format was changed in this pass.

Earlier detailed development history remains in Git.
