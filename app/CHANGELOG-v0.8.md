# v0.8 — usability and direct manipulation

## Editor/UI

- Reworked the left panel around actual editing controls; explanatory/research prose is now in fold-down panels below the circuit.
- Added 2× / 3× / 4× editor zoom (3× default).
- The original 320×256 artwork is scaled without smoothing, while editor overlays are redrawn at the higher canvas resolution.
- Added crisp high-resolution waypoint markers, topology lines and labels.
- Added waypoint label modes: route-local number, progress, runtime address or off.
- Added direct drag-to-move waypoint editing using the inverse of the code-derived game mapping.
- Hidden waypoints/routes are no longer selectable or draggable.
- Reworked +3 recovery vectors as high-resolution arrows with density control.
- Removed “Display projection” from the ordinary workflow; authentic game mapping is the default, with manual comparison controls retained only under Advanced diagnostics.

## Colour

- Added original Amiga 12-bit palette decoding.
- Palette resolution now looks for a consistent race-record pointer field across the race table instead of accepting an isolated colour-looking table for each circuit.
- Original colour is the default; monochrome remains available and is used automatically if the palette cannot be safely established.

## Waypoint model retained from the previous implementation pass

- Exact XOR `$FF` decode/re-encode of six-byte waypoint records.
- Route A / B / C semantics and independent visibility.
- Genuine decoded `+4.w` relative-link topology.
- Code-derived `$A082/$B082` waypoint mapping.
- Editing of X, Y, progress ordinal, high-bit flag and link delta/target.
- Descriptor/link validation, patch JSON export and modified decrunched main-image export.
- Resource +1 `$2804` variants decode from byte 0; four surplus bytes are trailing data.
