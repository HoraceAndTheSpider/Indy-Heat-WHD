# Indy Heat Amiga — Circuit Editor v0.11

HTML5 circuit viewer/editor for the Amiga **Indy Heat** `Disk.1`. On startup it now attempts to load `whdload/data/Disk.1` directly from the project GitHub repository. The existing local file picker/drop zone remains available as a fallback or to test another disk image. Once loaded, parsing/editing remains in the browser.

## v0.11 usability / route-link pass

The main screen is now deliberately editor-focused. Technical explanations have been moved into the fold-down panels below the circuit instead of occupying the left-hand controls.

Visible changes include:

- **Track opacity** is independent of overlay opacity, so the original artwork can be faded while keeping routes, sequence groups, surfaces and recovery arrows clear.
- **Route links are route-local.** A Route A link is resolved only against Route A records (including its local descriptor boundary), and likewise for B/C. Yellow Sequence Groups remain the only intentional cross-route joining overlay.
- **Repository Disk.1 auto-load.** The editor attempts to fetch `https://raw.githubusercontent.com/HoraceAndTheSpider/Indy-Heat-WHD/master/whdload/data/Disk.1` automatically at startup. If that request is unavailable or blocked, use the normal Open/Drop control.

- **Original colour** is the default. It uses the exact 32-colour Amiga palette recovered from the original Illinois `r1.iff` rip. On disk load, the editor searches the decrunched main image for that exact 64-byte `$0RGB` table and then searches decompressed resources if necessary; the technical panel reports the located source. Monochrome remains available.
- **2× / 3× / 4× editor zoom**. The 320×256 game artwork remains pixel-accurate, while waypoints, labels, links and recovery arrows are drawn as higher-resolution editor graphics on top.
- **Waypoint labels** can be switched between physical Waypoint ID (`A00`, `B12`, `C07`) and logical Sequence. Duplicate sequence labels are deliberately shown when several physical points represent the same progress step.
- **Drag waypoints directly** on the circuit. Dragging is converted back into the game's decoded waypoint X/Y coordinates and committed on release.
- Hidden waypoint layers are **not selectable**. Turning off Waypoints or Route A/B/C removes those points from hit-testing as well as the display.
- **Recovery arrows** are rendered as high-resolution vectors with adjustable density.
- The normal editor no longer asks you to understand “display projection”. The authentic code-derived game mapping is simply the default. Manual mapping controls survive only inside **Advanced display / research diagnostics**.

## Waypoint editing

The proven six-byte record conversion is:

```text
runtime byte = stored byte XOR $FF
```

The decoded runtime record exposed by the editor is:

```text
+0.w  signed X
+2.b  progress/checkpoint ordinal in low 7 bits + separate high-bit flag
+3.b  signed Y
+4.w  signed relative byte displacement to another six-byte record
```

Routes are labelled:

- **A** — normal AI racing line
- **B** — alternate AI racing line
- **C** — reference/service path; exact human-progress and pit/service role remains under investigation

Click a visible waypoint or choose it from the list. You can then drag it, or edit X/Y, sequence, the high-bit flag and link target/delta numerically. Physical waypoint ID and logical sequence are deliberately kept separate. Edits are automatically re-encoded into the complemented stored representation.

## Export

The editor can export:

- the current high-resolution editor view as PNG;
- track/research JSON;
- a compact waypoint-patch JSON;
- the complete modified decrunched `$1206A` main image as `indyheat_main_modified_v011.bin`;
- the four raw circuit resources.

It does **not** yet recompress the main image into the retail ADF. `whdload-test/` contains a separate development-only source hook for loading the modified main image during `patch_boot`; it does not replace the existing working slave.

## Circuit layers

The established circuit data remains available as optional layers:

- 320×256 × 5-plane track artwork;
- resource +1 — 320×256 1bpp foreground/occlusion mask;
- resource +2 — 160×112 packed 2bpp surface map;
- resource +3 — 40×28 recovery/heading field.

For `$2804` +1 resources, the bitmap begins at byte 0 and the four additional bytes are trailing data.

## Tests

Disk-independent parser/editor tests:

```bash
node test_waypoints.js
```

Verify the supplied/original Illinois ILBM palette:

```bash
node test_palette_iff.js /path/to/r1.iff
```

Full tests using your own original disk image:

```bash
node test_node.js /path/to/Disk.1
```

The full test reports whether the exact `r1.iff` palette table is present in the decrunched main image or another decompressed resource. The editor still has the verified palette available if that source-location scan does not find the table.


## Sequence-aware display (introduced v0.10)

- **Sequence Groups** draws a yellow dashed minimum-spanning join between geographically adjacent visible waypoints sharing the same low-7-bit sequence value. Yellow is an equivalence aid, not a route/link.
- The sidebar summarises each route as sequence range plus physical point count; the validation fold-down also catalogues A/B/C ranges for all ten circuits in the loaded disk.
- Validation warns about missing sequence values and differing A/B/C ranges; these are warnings while the retail invariants are still being catalogued.
- Different routes are allowed to have different physical waypoint counts. No companion point is implied on another route.
