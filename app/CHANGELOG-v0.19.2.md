# Indy Heat Circuit Editor v0.19.2

Focused UI/preview refinement following v0.19.1 testing.

## Mini map
- Removed relevance of the global overlay-opacity control while Mini map is active.
- Added **Pick** tool: click the miniature to select that exact palette index.
- Added **From backdrop** beside **New blank miniature**.
  - Uses the current edited 320×224 gameplay portion of the circuit backdrop.
  - Area-reduces it to the native 78×51 miniature.
  - Backdrop colour 0 is remapped to the currently selected non-zero miniature colour because miniature colour 0 is transparent.
- Renamed `Rectangle` to `Rect` so the label fits the tool button.
- Tool selection is persistent/state-driven: Pencil/Line/Rect/Fill/Pick remains highlighted after changing editor sections and returning.

## Map
- The global overlay-opacity control is hidden in Map mode; it is not relevant to the regional-map editor.

## Race / HUD
- Removed the separate `HUD` navigation button.
- HUD editing is now part of **Race**.
- Added a Race HUD overlay canvas above the existing Race overlay while preserving the existing pit/start/flag drag canvas.
- `race+$24/+26` is drawn as the actual **top-left origin** of the current-lap tower, not the centre of a placeholder graphic.
- Current-lap digits use the exact 6×7 in-game digit table from the retail renderer (`$6EA4`), previewed as 1/2/3/4 in red/yellow/blue/grey order.
- Timer digits use the same real 6×7 game font and the proved shared HUD offsets.
- Total laps previews `99` using the exact two-shade 3×5 masks from the approved `digits.iff` compositor artwork.
- The total-lap preview accounts for the proved retail BOB origin `(5,3)` rather than centring the object on its renderer coordinate.
- The yellow HUD cursor can be dragged directly in Race mode; numeric HUD X/Y fields remain available.
- Race shares the existing Overlay opacity control, so pits/cars/flag and HUD presentation fade together.

## Left-side view toggles
- Surface types and Waypoints are placed in foldable sections.
- Added foldable **Pits** controls for pit/service+crew, PIT boards and pit cars.
- Added foldable **Race control** controls for start/grid anchor, grid cars, flag man, current-lap tower, total laps and timer.
- The old duplicate Race visibility checkbox block is hidden; the left-side controls drive the existing Race renderer inputs.

No circuit package/runtime file-format changes and no WHDLoad slave changes are included.
