# Indy Heat circuit research notes — 2026-09-11 (v0.5)

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

### Surface class behaviour now code-traced

The caller around main offsets `$9F28–$9FB2` distinguishes the packed 2bpp values as follows:

- `0`: no special response;
- `1`: calls the `$A000` heading-grid lookup, converts the returned heading through the sine/cosine table and applies half of that vector back to the car position; this is the collision/edge correction path;
- `2`: reduces car speed by `speed >> 5` and uses response magnitude 36;
- `3`: reduces car speed by `speed >> 6` and uses response magnitude 20.

Classes 2 and 3 are therefore two slowdown surface strengths rather than two wall-impact classes. This also provides a better reconciliation with John Croudy's interview: the Amiga implementation appears to have packed collision and slowdown classifications into a single 2-bit map, with the separate 40×28 field supplying collision recovery direction.

## +1 full-resolution bitmap — foreground/occlusion mask, code-proven

Pointer `A6+$4292` is used by routines around main offsets in the `$37xx–$39xx` region. They form 40-byte row offsets and test bits/longwords in a manner consistent with a 320-wide one-bit map.

The routines around `$3748`, `$3834` and `$397C` calculate the map offset from object coordinates, extract shifted bits from this resource, AND them with the object's own sprite mask and feed the result into the BOB/blitter drawing path. This establishes the foreground/behind-scenery role described by John Croudy.

## Six-byte AI path records — traced, topology still partly unresolved

The first three descriptors at the start of each race/event record feed the car AI/path setup. The nearest-point routine around main offset `$A0C0`:

- reads descriptor `+8.w` as its loop count;
- reads descriptor `+0.l` as the path-record pointer;
- compares the car position with word `+0` and signed byte `+3` of each record;
- advances exactly six bytes per record;
- returns the nearest record pointer.

Subsequent AI code stores that record and executes `ADDA.W +4(A0),A0`, proving that word `+4` is a relative path link at runtime. Byte `+2 & $7F` is copied into the car/race progress state and is **not a heading**; raw records frequently count `127,126,125...`, consistent with a route/checkpoint ordinal plus a high-bit flag.

Track setup gives additional direct evidence. After loading the three per-track support resources, routine `$48A6` calls runtime `$1080` (main-file offset `$0080`) with the current race record. That routine visits all three descriptors, scans their six-byte records, finds the maximum `point[2] & $7F`, and writes that maximum into descriptor byte `+10`. This confirms that `+2` is route/progress metadata and that descriptor `+10` is initialised at runtime from it.

### Circuit-local coordinate transform — code proven

Main-file code around `$92C0` converts the car's 16.16 fixed-point coordinates into the coordinate system used by the waypoint search:

```asm
MOVE.L  $68(A4),D0
TST.W   $6A(A1)
BPL.S   .x_ok
NEG.L   D0
.x_ok:
ADD.L   $62(A1),D0
MOVE.L  D0,$250(A5)
MOVE.L  $6C(A4),D0
ADD.L   $66(A1),D0
MOVE.L  D0,$258(A5)
```

The caller around `$950C` loads `MOVE.W $250(A5),D0` and `MOVE.W $258(A5),D1` immediately before calling the nearest-waypoint routine at `$A0C0`. This proves that race fields `+$62/+66` are 16.16 circuit-local origins and `+$6A` controls X negation/orientation.

Observed high-word values for the supplied build:

```text
Illinois          X -63  Y -25  mirror no
Indianapolis      X -69  Y -22  mirror no
New Jersey        X -68  Y   5  mirror no
West Canada       X -64  Y  19  mirror YES
South California  X -86  Y -37  mirror YES
East Canada       X -42  Y   9  mirror no
Michigan          X -52  Y -41  mirror no
Colorado          X -104 Y -22  mirror YES
North California  X -72  Y -37  mirror no
Kentucky          X -66  Y   5  mirror YES
```

This replaces the earlier assumption of one global X orientation. It does not yet prove the final local-coordinate-to-bitmap projection, so v0.5 uses `+$6A` automatically but keeps screen scale/origin adjustable.

### Raw/pre-runtime record observations

The decompressed disk image is copied to runtime `$1000`, so a runtime path pointer maps back to main-file offset `pointer - $1000`. The earlier display projection was subsequently shown to be oversimplified. X orientation is per-race, not global. v0.5 starts from `screen_x = raw byte +1 * 2`, `screen_y = signed raw byte +3 + 128`, and mirrors X only when race word `+$6A` is negative. Exact screen scale/origin remain under investigation and are diagnostic rather than game-format semantics.

The game itself reads a word at `+0`, so byte `+0` cannot simply be discarded. It is zero for almost all currently inspected records but is non-zero in at least one record. This strongly suggests a pre-runtime/setup representation that still needs to be traced. v0.3 exports both the raw word and the low-byte X candidate rather than hiding this mismatch.

Word `+4` shows an unusually strong encoding invariant: `raw_link + 13` is normally an exact multiple of six. The dominant `$FFF9` (`-7`) maps to `+6`, while special values map to jumps such as `-276` (`-46` records). This is almost certainly related to the runtime graph links, but the code that transforms/prepares the raw values has not yet been located.

The old waypoint diagrams had multiple independent problems: raw records were connected in storage order; early diagnostics paired race records to circuit resource groups by list index; X orientation was treated as a universal display choice instead of reading race `+$6A`; and at least one generated contact sheet reused a stale/wrong bitmap under a different circuit caption. All such pre-v0.5 images are superseded. v0.5 resolves the resource base from each race record's own directory pointer, follows the per-race orientation flag, and renders points only by default. It retains an optional experimental link layer using the `raw+13` candidate, restricted to targets that resolve inside the same race's three descriptors.

### Descriptor boundary ambiguity

For every descriptor, `end - start == count * 6`. Yet the nearest-point routine loads `count` and uses `DBF`, apparently examining `count+1` records. Adjacent descriptors often begin exactly at the previous descriptor's `end`. The editor must preserve these raw values until setup/runtime behaviour establishes whether the endpoint is intentionally shared or the count is adjusted before use.

### Next path-code trace

1. Locate the setup/decryption pass that prepares word `+0` and/or link word `+4`.
2. Trace special `+4` jumps through the steering routine and identify branch/join/pit semantics.
3. Identify the purpose of descriptors A/B/C rather than assuming they are simply three equivalent racing lines.
4. Only then enable editable route connectivity.


## Race-record to circuit-resource mapping — code/data proven

Race record `+$36.l` points to `+2` inside the first resource-directory entry for that circuit. The resulting mapping is:

```
#1  Illinois          -> $39
#2  Indianapolis      -> $4D
#3  New Jersey        -> $3D
#4  West Canada       -> $41
#5  South California  -> $45
#6  East Canada       -> $49
#7  Michigan          -> $5A
#8  Colorado          -> $5E
#9  North California  -> $62
#10 Kentucky          -> $66
#11 Indianapolis      -> $4D
```

This ordering mismatch caused several early overlay diagnostics to be invalid, but it was not the only issue. Subsequent user review correctly identified an X-orientation problem, which led to the code trace above: race `+$6A` explicitly negates X for selected circuits. v0.5 uses that flag automatically and exposes manual mirror/scale/offset controls purely to test the still-unresolved final screen projection; they do not alter source data.

## Editor roadmap

1. v0.5 read-only ADF rip/view — implemented, including per-race orientation/origin metadata, safe point clouds and raw-field inspection.
2. Resolve path-link preprocessing/topology and descriptor A/B/C semantics.
3. Fully label surface classes and +1 bitmap behaviour.
4. Resolve track palette(s) and render original colours.
5. Add PNG/indexed artwork and logical-map import/export.
6. Add circuit editing in browser.
7. Add a development WHDLoad slave that redirects track resources to external uncompressed/editor-produced files.
8. Identify/decode car BOB resources and animation/colour handling.
9. Build an original-format compiler/repacker if desired.
10. Isolate/refactor the race engine and then assess AGA display expansion.
