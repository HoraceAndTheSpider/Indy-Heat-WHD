# Changelog

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
