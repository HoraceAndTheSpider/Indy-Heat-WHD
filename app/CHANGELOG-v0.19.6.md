# v0.19.6

Focused acceptance fix based on live-editor feedback.

## Lap tower movement
- Replaced the v0.19.5 lap-tower DOM hit-region routing with document-level pointer capture.
- A left-button press is tested against the visible HUD rectangle by screen coordinates before any stacked editor canvas sees the event.
- Dragging therefore no longer depends on `raceSetupCanvas`, `editorFixHudDragHit194`, z-index ordering or which overlay is the event target.
- Existing HUD X/Y fields and package presentation data remain the authoritative stored position.

## MiniMap palette
- Removed algorithmic colour matching from the corrective path.
- `From backdrop` now applies the explicit Race-index -> Garage-index lookup supplied in `palette compare.xlsx`.
- Spreadsheet row `028:$900` says `Race # 29`, but its Hex Index is 028 and the following row is the genuine 029 row. It is therefore interpreted as the evident typo `Race 28 -> Garage 4`.
- Repeated destination indices are preserved intentionally.

## Mode order
Final button order is now:

1. Backdrop
2. Foreground
3. Surface
4. Waypoints
5. Recovery
6. Race
7. MiniMap
8. Map

No WHDLoad or circuit-package file format changes are included.
