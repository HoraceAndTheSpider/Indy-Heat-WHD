# Indy Heat Amiga — Circuit Ripper / Viewer v0.1

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
- shows per-pixel/cell values under the pointer;
- exports the rendered PNG, decompressed raw resources and a JSON research representation.

The circuit image is currently shown with a greyscale 0–31 colour-index palette. The game's actual per-track palette has not yet been incorporated.

## Important correction to the early research

The initial visual investigation incorrectly treated `$1180` and `$0460` resources as one-bit masks.

### Resource +2 — `$1180` bytes

`$1180 = 4480 = 40 × 112` bytes, but each byte stores **four two-bit values**. It is therefore a **160×112 2bpp logical map**, covering the 320×224 gameplay area at 2×2 screen pixels per cell.

This explains the apparent vertical stripes seen when its common `$55` bytes were displayed as one-bit pixels: `$55` is `01 01 01 01`, i.e. four neighbouring class-1 cells, not alternating mask pixels.

The 68000 lookup routine around main-file offset `~$9FB4` supports this directly: it halves Y, constructs a 40-byte row offset, derives the byte from X and extracts two bits to return class 0–3.

Current behavioural interpretation from its caller:

- class 0 — ordinary/no special response;
- class 1 — off-road/recovery-type response and a heading-grid lookup;
- class 2 — impact/collision response A;
- class 3 — impact/collision response B.

The exact gameplay distinction between classes 2 and 3 remains under investigation.

### Resource +3 — `$0460` bytes

`$0460 = 1120 = 40 × 28` bytes. It is **not a bitmap**: it is one byte per 8×8 gameplay cell over 320×224.

The 68000 routine around main-file offset `~$A000` indexes it using `x >> 3` and `y >> 3` and returns a byte. Its out-of-bounds cases return cardinal-style angle values. Together with vector visualisation, this strongly identifies it as a **heading/direction recovery grid**.

The viewer draws this as arrows. The current `display phase` is explicitly a visualisation control rather than a claim that the final engine angle convention has been fully labelled.

### Resource +1 — about `$2800` bytes

This remains a genuine full-resolution 320×256 one-bit bitmap. Code references through the track resource pointer are consistent with a drawing/occlusion function, matching John Croudy's recollection of a 'draw car behind scenery' mask, but the final semantic label should be retained as provisional until its complete rendering path is documented.

## Waypoint status

Earlier research tentatively labelled three descriptors in each race/event record as three waypoint paths because their pointed-to ranges divide exactly into six-byte records.

That label is **withdrawn for now**. The data itself is real, but the latest trace has not yet demonstrated that those particular lists feed the AI nearest-point/steering routines. v0.1 therefore shows them only as unresolved six-byte-record descriptors.

The next research task is to trace the AI's actual path pointer from track/race setup into the nearest-point and steering code and only then add a waypoint overlay/editor.

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
