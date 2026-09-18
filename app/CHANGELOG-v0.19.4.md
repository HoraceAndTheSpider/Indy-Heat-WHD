# v0.19.4

Corrective editor pass against master `c612d5a`.

## Mode handling
- Recovery now leaves its own internal edit state before Backdrop, Foreground, Surface, Waypoints, Race, MiniMap or Map takes control.
- Mode order is now: Backdrop, Foreground, Surface, Waypoints, Race, MiniMap, Map, then Recovery.
- Selecting a mode switches unrelated view overlays off by default; overlays may still be manually re-enabled afterwards for comparison.
- The visible `Master Circuit Zoom` label is shortened to `Zoom`.

## View folds
- Surface Types, Waypoints, Pits and Race Control now have their master checkbox beside the fold title.
- Pits and Race Control master checkboxes reflect mixed child states with the browser indeterminate state.

## Race / HUD
- Authored lap input is restricted to 1-20 and package export is blocked when the current lap total is outside that range.
- The old top-left `LAPS n` debug label is suppressed.
- Current-lap and timer glyphs now render the full 8-bit retail `$6EA4` rows. The earlier 6-bit renderer shifted visible pixels two pixels left.
- Timer uses the same retail digit masks as the lap tower and is previewed in grey.
- Total-laps preview is now `20`.
- Total-laps colours use race-palette source colours 1/5/6 (black / dark grey / light grey), matching the proven runtime compositor rather than the Gasoline Alley palette.
- The visible HUD area itself, not just the small yellow origin marker, can be dragged. HUD writes continue to be mirrored to the active authoring models.

## Mini-map
- `From backdrop` now uses palette-family-aware race-to-Gasoline-Alley conversion and preserves exact shared non-transparent palette words.
- This remains provisional: an explicit project colour lookup supplied from verified artwork should supersede algorithmic conversion if visual review still differs.

No circuit ZIP format or WHDLoad runtime format change is included.
