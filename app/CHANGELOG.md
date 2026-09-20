# Changelog

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
