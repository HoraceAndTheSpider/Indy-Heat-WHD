# Indy Heat circuit research notes — 2026-09-11

These are working reverse-engineering notes, deliberately separating code-proven facts from hypotheses.

## Disk / loader

- Source image: standard 901,120-byte Amiga DD ADF.
- 96 recognised File Imploder-compatible resources were found in the supplied disk.
- Main packed block starts at disk offset `$002C00` (sector 22), magic `EDAM`.
- Main expands to `$1206A` bytes.
- Existing WHDLoad source replaces the game's sector loader and converts sector/count values to byte offset/length, which is useful for a future external-resource development patch.

## Resource directory

Current retail-build directory location in decompressed main: approximately `$3C6A`.

22-byte entries appear sequentially indexed and include:

```
+00.w  resource ID
+02.w  first disk sector
+04.w  sector count
+06.l  decompressed size
+0A.l  read/packed allocation field
+0E.l  runtime pointer/state field
+12.l  allocation-size field
```

The HTML5 tool validates/falls back to locating the sequential directory rather than relying only on the hard-coded offset.

## Track resource pointers

Track setup around main-file offset `~$48A6` loads three track-support resources and stores their data pointers in globals based at A6:

```
A6+$4292  full-resolution 1bpp resource (+1)
A6+$4296  packed 2bpp surface resource (+2)
A6+$429A  40×28 heading-byte resource (+3)
```

The circuit background is the associated `$C800` five-plane resource.

## +2 surface lookup — high confidence / code proven

Routine around `~$9FB4`:

- checks gameplay coordinate bounds;
- gets `A6+$4296`;
- `LSR.W #1` on Y, producing `y >> 1`;
- computes a 40-byte row offset;
- derives a byte index from X;
- selects/extracts two bits from that byte;
- returns value 0–3.

Thus `$1180` is 160×112 at 2bpp, covering 320×224 with 2×2 screen pixels per logical cell.

Caller around `~$9F20` differentiates returned values:

- 0 takes normal path;
- 1 invokes the heading lookup and recovery/correction behaviour;
- 2 and 3 both enter impact-style handling but with different constants/parameters.

Do not yet collapse classes 2/3 into one semantic meaning.

## +3 heading/direction lookup — high confidence / code proven

Routine around `~$A000`:

- checks X/Y bounds;
- reads pointer `A6+$429A`;
- shifts X and Y right by 3;
- computes `(y >> 3) * 40 + (x >> 3)`;
- returns one byte from the grid;
- out-of-bounds branches return fixed cardinal-style values.

This is a 40×28 array of one byte per 8×8 gameplay cell. The values behave coherently when rendered as direction vectors around the circuits.

Exact numeric heading phase/sign remains to be named from the steering arithmetic, hence the viewer has an adjustable display phase.

## +1 full-resolution bitmap — strong structural evidence, semantic trace ongoing

Pointer `A6+$4292` is used by routines around main offsets in the `$37xx–$39xx` region. They form 40-byte row offsets and test bits/longwords in a manner consistent with a 320-wide one-bit map.

This fits the author's description of an occlusion/'behind scenery' mask, but the final name should follow a complete trace through the BOB drawing order/mask code.

## Unresolved 6-byte lists / waypoint work

There are three descriptors in each event/race record whose address ranges are exact multiples of six bytes. Earlier notes called them three racing lines. That inference is no longer considered proven.

A separate nearest-point routine exists around `~$A0C0` and advances through six-byte records, but we still need to establish the pointer chain from race/track setup to that routine.

Next trace:

1. Identify each call to the nearest-point routine.
2. Trace the list pointer backwards to the owning structure/global.
3. Trace that field back into track setup/resource data.
4. Decode the six-byte record from every access, not from visual guessing.
5. Only after this, draw path points over the circuit and add them to the HTML5 viewer.

## Editor roadmap

1. v0.1 read-only ADF rip/view — implemented.
2. Resolve actual waypoint/path data and add overlay/inspection.
3. Fully label surface classes and +1 bitmap behaviour.
4. Resolve track palette(s) and render original colours.
5. Add PNG/indexed artwork and logical-map import/export.
6. Add circuit editing in browser.
7. Add a development WHDLoad slave that redirects track resources to external uncompressed/editor-produced files.
8. Identify/decode car BOB resources and animation/colour handling.
9. Build an original-format compiler/repacker if desired.
10. Isolate/refactor the race engine and then assess AGA display expansion.
