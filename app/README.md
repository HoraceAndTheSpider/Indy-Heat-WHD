# Indy Heat Amiga Circuit Editor

Current editor version: **v0.26**.

This directory is the complete deployable browser editor. It is intentionally kept separate from reverse-engineering probes, historical integration patches and Node test files so the live application has one clear runtime file set.

## Runtime files

- `index.html` — application shell and deterministic script load order.
- `style.css` — base application styling.
- `indyheat.js` — Disk.1/resource decoding, race records, waypoint data and shared binary helpers.
- `recovery-hook.js` — early capture/bridge layer used to keep the core and extension editors on the same live Disk.1 models.
- `layer-tools.js` — bitmap/surface drawing primitives.
- `indyheat_race_graphics.js` — authentic race-object/BOB graphics decoder.
- `app.js` — core circuit viewer and waypoint editor.
- `layer-editor.js` — Foreground and Surface editors, drawing tools and magnifier.
- `waypoint-actions.js` — waypoint-mode convenience actions.
- `recovery-editor.js` — +3 recovery-direction editor, group selection, held rotation and cell grid.
- `race-setup.js` — race/pit/start/flag setup editing.
- `track-backdrop.js` — track backdrop import/export and IFF conversion.
- `circuit-package.js` — custom circuit package, MiniMap/Map and presentation workflows.
- `editor-ui.js` — consolidated editor coordination: mode ordering, folds, Race HUD, lap slider, overlay colours and accepted presentation refinements.

## Current authoring contract

Custom race length is **1–20 laps**. The editor uses the established runtime-supported range and does not widen the WHDLoad gameplay contract.

Overlay colours are editor display preferences only; they do not alter circuit resource data. Foreground and Surface colours are shared with the layer renderer, while Recovery has separate arrow/grid display colours.

The Recovery layer is the authentic **40×28** direction grid, one byte per **8×8** gameplay cell. Grab group supports click selection and drag-marquee selection. With Grab group off, left/right mouse rotation can be held continuously and a complete hold is one Undo operation.

## Circuit package

The custom package workflow continues to use the established package files where applicable:

- `background.bin`
- `foreground.bin`
- `surface.bin`
- `recovery.bin`
- `preview.bin`
- `waypoints.bin`
- `race_setup.bin`
- `presentation.bin`

MiniMap templates are embedded in the application; no separate template artwork files are required in this directory.

## Development history

Earlier per-version changelogs, integration patches, research probes and `test_*.js` files are deliberately not part of this deployable `app/` folder. Their history remains available in Git. Development-only material should live outside `app/` rather than being reintroduced into the runtime directory.
