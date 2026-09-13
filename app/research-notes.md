# Indy Heat v0.11 implementation notes

This file is intentionally short. The project wiki is the canonical reverse-engineering reference; these notes describe only the assumptions implemented by this build.

## Waypoint model used by v0.9

Live WinUAE captures on Illinois proved that a stored six-byte waypoint record is complemented byte-for-byte before race use:

```text
stored  00 3E FF 1C FF F9
runtime FF C1 00 E3 00 06

runtime byte = stored byte XOR $FF
```

The editor therefore treats an ordinary decoded record as:

```text
+0.w  signed X
+2.b  low 7 bits = progress/checkpoint ordinal; bit 7 retained separately
+3.b  signed Y
+4.w  signed relative byte displacement to another six-byte record
```

`+4.w` is rendered as genuine runtime topology. A normal `$0006` points to the next six-byte record; non-local branches are preserved as signed byte displacements.

## Descriptor boundary rule

For the three route descriptors, `end - start == count * 6`. The game also uses a DBF scan which appears to reach the record at `end`. v0.9 parses that record as a protected boundary record but does not include it in the normal editable list.

When a descriptor end is the next descriptor's start, ordinary records take precedence during link resolution. A boundary-only record is used only when no ordinary record exists at that address, including the final zero sentinel.

## Projection used by v0.9

The default route display uses the code-derived projection at main `$A082` / runtime `$B082`. Earlier validation used `A082(-staticX,0,-staticY)` and placed roughly 94–100% of route locations on valid class-0 surface. With the bytewise complement now proven, v0.9 feeds decoded runtime X/Y as the high-word coordinates: `A082(runtimeX,0,runtimeY)`.

Manual scale/offset and auto-fit remain available only as comparison/research controls. They are not part of the file format.

## Resource +1 correction

For `$2804` foreground/occlusion resources, the 320×256 bitmap starts at byte 0 and occupies `$2800` bytes. The four extra bytes trail the bitmap. v0.9 always decodes +1 from offset 0.

## Editing/export boundary

v0.9 edits ordinary waypoint records in the decrunched main image and automatically writes the complemented six stored bytes. It can export:

- a waypoint patch JSON;
- the complete modified decrunched `$1206A` main image;
- the existing track JSON / resources / rendered image.

It does not yet recompress/rebuild the retail ADF. The accompanying `whdload-test/` note provides an optional development hook for loading the modified main image at `patch_boot` before applying the normal WHDLoad patches.
\n\n## Palette handling in v0.9

The previous pointer-field heuristic has been removed. The authoritative reference is the original Illinois `r1.iff` CMAP, whose 32 Amiga `$0RGB` words are:

```text
888 000 FDC FFF 333 666 999 CCC
954 F81 FA6 FFA 449 77B 66C 88F
AAF CCF F99 FCA C74 CB2 C90 DD0
080 1B0 6D0 9F0 900 C00 B33 F00
```

The editor searches the decrunched main image for that exact 64-byte table. If absent, it searches decompressed resource data. The technical panel records the exact source hit. The verified CMAP is retained as the rendering reference even when the storage-location search fails, and monochrome remains selectable.


## Sequence-aware editor interpretation (v0.10)

The editor now deliberately distinguishes the physical route-local waypoint index from the low-7-bit logical sequence/progress value. Duplicate sequence values are treated as valid and can be visualised with a yellow equivalence overlay. Route C is labelled neutrally as a reference/service path pending the remaining human-progress/AI-service trace; the UI no longer claims that pit routing is its only role.
