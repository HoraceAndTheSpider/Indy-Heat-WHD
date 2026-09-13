# v0.9 — verified original track colour

## Palette

- Replaced the v0.8 race-record palette heuristic with the exact 32-colour Amiga palette from the original Illinois `r1.iff` rip.
- Correctly converts ILBM CMAP bytes as Amiga nibbles shifted left four bits; the palette begins `$888, $000, $FDC, $FFF`.
- Searches the decrunched main image for the exact 64-byte `$0RGB` table on disk load.
- If absent from main, searches decompressed resource data for the same exact table.
- The technical fold-down reports the located source/address when an exact game-data match is found.
- Original colour remains the default; monochrome remains optional.
- If the storage-location scan fails, rendering still uses the verified IFF CMAP rather than guessed colours.

## Retained v0.8 usability/editor work

- High-resolution editor overlays and zoom.
- Direct waypoint dragging and editing.
- Route A/B/C visibility and numbering.
- High-resolution recovery arrows.
- Exact XOR `$FF` waypoint encode/decode and modified-main export.
