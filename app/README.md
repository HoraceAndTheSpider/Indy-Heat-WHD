# Indy Heat Amiga — Circuit Ripper / Viewer v0.5

A read-only, offline HTML5 research tool for the original Amiga `Indy Heat` disk image.

## Use

Open `index.html` in a modern browser, then load/drop the original `Disk.1` ADF. No web server and no upload are required; the disk is read locally by JavaScript.

The tool:

- scans the ADF for File Imploder (`EDAM` / `IMP!` and compatible) blocks;
- decompresses the main 68000 image in-browser;
- locates/parses the game's resource directory;
- exposes the ten repeated four-resource circuit groups;
- decodes the 320×256×5-plane circuit bitmap;
- decodes resource `+1` as the 320×256×1bpp bitmap;
- decodes resource `+2` as the code-proven packed 2bpp surface map;
- decodes resource `+3` as the code-proven 40×28 byte heading/direction grid;
- overlays those structures on the circuit;
- shows the three per-race six-byte path-record descriptors as point clouds without assuming storage-order connectivity;
- follows the code-proven per-race X-negation flag at race `+$6A` when displaying waypoint data;
- optionally shows a clearly marked experimental link interpretation for research;
- shows per-pixel/cell values under the pointer;
- exports the rendered PNG, decompressed raw resources and a JSON research representation.

The circuit image is currently shown with a greyscale 0–31 colour-index palette. The game's actual per-track palette has not yet been incorporated.

## Waypoint coordinate correction in v0.5

The waypoint coordinate model is now substantially better grounded in code. The game does **not** use one universal unmirrored or mirrored waypoint projection. Before performing the nearest-waypoint search it converts each car into a circuit-local coordinate system using fields in the current race record:

```asm
move.l  $68(a4),d0       ; car X, 16.16 fixed point
tst.w   $6A(a1)          ; per-race X orientation
bpl.s   .x_ok
neg.l   d0
.x_ok:
add.l   $62(a1),d0       ; per-race X origin
move.l  d0,$250(a5)

move.l  $6C(a4),d0       ; car Y, 16.16 fixed point
add.l   $66(a1),d0       ; per-race Y origin
move.l  d0,$258(a5)
```

The high words at `$250/$258` are then passed to the six-byte waypoint nearest-point routine. The race `+$6A` field is negative for West Canada, South California, Colorado and Kentucky, and non-negative for Illinois, Indianapolis, New Jersey, East Canada, Michigan and North California. v0.5 follows that flag automatically for its provisional display mirror.

The screen projection itself is **not yet fully code-proven**. For inspection the viewer still starts from `byte[+1]×2` and `signed(byte[+3])+128`, applying the race-directed X mirror when required. X/Y scale and offset remain diagnostic controls. Race `+$62/+66` origins are shown and exported but are not yet incorrectly folded into the bitmap projection.

All earlier waypoint contact sheets are superseded. One of them also reused a stale/wrong bitmap under a different circuit caption, so those images must not be used as geometric evidence.

## Important correction to the early research

The initial visual investigation incorrectly treated `$1180` and `$0460` resources as one-bit masks.

### Resource +2 — `$1180` bytes

`$1180 = 4480 = 40 × 112` bytes, but each byte stores **four two-bit values**. It is therefore a **160×112 2bpp logical map**, covering the 320×224 gameplay area at 2×2 screen pixels per cell.

This explains the apparent vertical stripes seen when its common `$55` bytes were displayed as one-bit pixels: `$55` is `01 01 01 01`, i.e. four neighbouring class-1 cells, not alternating mask pixels.

The 68000 lookup routine around main-file offset `~$9FB4` supports this directly: it halves Y, constructs a 40-byte row offset, derives the byte from X and extracts two bits to return class 0–3.

The caller now gives a much firmer behavioural decode:

- class 0 — ordinary/no special surface response;
- class 1 — collision/edge correction. It calls the 40×28 heading grid and converts the returned heading into a corrective X/Y vector;
- class 2 — stronger slowdown surface. The speed value is reduced by `speed >> 5` (about 1/32) on each response, with a secondary response magnitude of 36;
- class 3 — weaker slowdown surface. The speed value is reduced by `speed >> 6` (about 1/64), with a secondary response magnitude of 20.

This means the likely track model is not 'collision mask + separate slowdown mask'. The packed 2bpp map combines normal terrain, collision/edge cells and two slowdown strengths, while resource `+3` supplies the direction used by collision correction.

### Resource +3 — `$0460` bytes

`$0460 = 1120 = 40 × 28` bytes. It is **not a bitmap**: it is one byte per 8×8 gameplay cell over 320×224.

The 68000 routine around main-file offset `~$A000` indexes it using `x >> 3` and `y >> 3` and returns a byte. Its out-of-bounds cases return cardinal-style angle values. Together with vector visualisation, this strongly identifies it as a **heading/direction recovery grid**.

The viewer draws this as arrows. The current `display phase` is explicitly a visualisation control rather than a claim that the final engine angle convention has been fully labelled.

### Resource +1 — about `$2800` bytes

This is now code-traced as the **foreground/occlusion mask**. The car-drawing routines around main offsets `$3748`, `$3834` and `$397C` fetch this resource, calculate the bitmap position from the car/sprite coordinates, shift out the relevant mask bits, AND them with the moving object's sprite mask and pass the resulting words into the BOB/blitter drawing path. This is the mechanism that allows cars to disappear behind foreground scenery, matching John Croudy's recollection.

## Path / waypoint status

The first three 12-byte descriptors in each race/event record are now traced into the AI path code. Each references six-byte records and the nearest-point routine at main-file offset `~$A0C0` walks those records in six-byte strides.

Several presentation errors affected the early waypoint diagrams: storage-order lines were drawn before topology was understood; race-record order was confused with resource-group order in one diagnostic; X orientation was treated as universal; and one generated montage reused a stale/wrong circuit bitmap. v0.5 resolves circuit resources through the race pointer, follows the code-proven race `+$6A` X-orientation flag, and displays **point clouds by default with no connecting lines**.

Current code-backed/raw-data interpretation of each six-byte record:

```
+0.w  word read by nearest-point code; pre-runtime byte 0 has unresolved setup semantics
+1.b  low byte used as the provisional local-X coordinate; viewer starts from byte1 × 2 and mirrors only when race +$6A is negative
+2.b  route/progress value; low 7 bits are used by lap/progress logic, high bit is a flag
+3.b  signed Y; viewer displays screen Y = signed(byte3) + 128
+4.w  relative-link field used by runtime AI code after track setup
```

The raw disk image has a strong invariant in `+4.w`: for essentially all meaningful path records, `raw_link + 13` is divisible by the six-byte record stride. The common raw value `$FFF9` (`-7`) therefore maps to `+6`, while special values map to multi-record jumps. This strongly suggests an encoded/pre-runtime graph link. However, runtime code later uses `+4(A0)` directly, so a setup/decryption transformation is still missing from the static trace. The optional v0.5 link display is therefore deliberately labelled **experimental** and only draws candidate links that resolve to another point in the same race record.

A second boundary detail remains open: descriptor `end - start == count × 6`, but the nearest-point routine loads `count` into a `DBF` loop, which appears to inspect `count + 1` records. v0.5 preserves the stored count and does not silently consume the next descriptor's first record.

The coordinate trace at main-file offset about `$92C0` proves that waypoint comparison happens in a circuit-local coordinate system with per-race X orientation and X/Y origins. v0.5 therefore uses race `+$6A` for automatic display mirroring and exposes manual mirror/X/Y scale/offset controls only as research diagnostics. Exact game-space-to-bitmap projection constants are still being traced and are not treated as saved-format semantics.


### Race-record order is not circuit-resource order

This matters when analysing or exporting waypoint data. The event/race records and bitmap groups are ordered differently:

| Race record | Circuit | Resource base |
|---:|---|---:|
| 1 | Illinois | `$39` |
| 2 | Indianapolis | `$4D` |
| 3 | New Jersey | `$3D` |
| 4 | West Canada | `$41` |
| 5 | South California | `$45` |
| 6 | East Canada | `$49` |
| 7 | Michigan | `$5A` |
| 8 | Colorado | `$5E` |
| 9 | North California | `$62` |
| 10 | Kentucky | `$66` |
| 11 | Indianapolis (repeat event) | `$4D` |

The mapping is derived from the race record's pointer at `+$36` into the 22-byte resource directory. Do not infer it from array position.

## Circuit resource groups

The repeated groups currently identified are:

```
39–3C
3D–40
41–44
45–48
49–4C
4D–50
5A–5D
5E–61
62–65
66–69
```

Within each group:

```
base+0  $C800   320×256×5-plane circuit bitmap
base+1 ~$2800   320×256×1bpp bitmap
base+2  $1180   160×112 packed 2bpp surface map (2×2 screen pixels/cell)
base+3  $0460   40×28 heading/direction bytes (8×8 screen pixels/cell)
```

## Why WHDLoad is likely the best editing development path

The retail data is File Imploder-compressed and packed into raw disk sectors. A modified circuit can have the same decompressed size but a different compressed size, so in-place ADF writes are not reliably safe.

The existing WHDLoad slave already intercepts the game's sector loader. A development slave can therefore replace selected circuit loads with external files (or copy expanded custom data into the expected buffers), allowing quick iteration without first solving disk repacking. Once the editor/compiler is stable, original-format recompression/repacking can be tackled separately.

See `research-notes.md` for the current technical map.
