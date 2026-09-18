# v0.19.5

Focused follow-up to the v0.19.4 editor pass, based on live acceptance testing.

## Race HUD / lap tower

- Rebuilt the current-lap and timer preview from the actual retail `$6B02` renderer contract, not a flat-colour approximation.
- The editor now combines the retail `$6EA4` glyph bytes with the `$6AEC` seven-row mask and the original `$6A60-$6AEB` five-plane source blocks.
- This restores the dark/light pixel detail present in the real red, yellow, blue and grey lap digits and in the grey timer digits.
- The existing authored-total preview remains `20`, using the proven custom total-lap compositor artwork and race palette.
- Added a dedicated transparent drag hit-region that follows the visible HUD. Dragging no longer depends on the underlying Race canvas or the small yellow origin cursor.
- HUD X/Y writes continue to update the active authoring models used by circuit export.

## Race setup

- Removed the browser-only top-left `LAPS n` diagnostic at its source in `race-setup.js`.
- The Race lap input and `writeCommon()` authoring path now enforce the runtime-supported range `1..20` directly.

## Editor column

- The right editor column now reserves a stable scrollbar gutter and fixed desktop width, so modes with tall content (notably MiniMap) no longer make the third column appear wider/narrower than other modes.
- The responsive single-column layout still returns to full available width on narrow screens.

## MiniMap recolouring

- No further algorithmic recolouring changes are made in this build.
- The v0.19.4 family-aware override is disabled.
- Exact race-palette -> Gasoline Alley recolouring is deliberately deferred until the project-supplied lookup table is available.

No circuit ZIP format or WHDLoad runtime format change is included.
