# Indy Heat Amiga — Circuit Editor v0.11

HTML5 circuit viewer/editor for the Amiga **Indy Heat** `Disk.1`. On startup it attempts to load `whdload/data/Disk.1` directly from the project GitHub repository. The existing local file picker/drop zone remains available as a fallback or to test another disk image. Once loaded, parsing/editing remains in the browser.

## v0.11 usability / editing pass

The main screen is deliberately editor-focused. Technical explanations sit in fold-down panels below the circuit instead of occupying the left-hand controls.

Visible behaviour includes:

- **Track opacity** is independent of overlay opacity, so the original artwork can be faded while keeping routes, sequence groups, surfaces and recovery arrows clear.
- **Route links are route-local.** A Route A link is displayed only against Route A records (including its local descriptor boundary), and likewise for B/C.
- **Sequence Groups are route-local.** Yellow joins connect same-Sequence physical points within A, within B or within C only; they never join routes to one another.
- **Repository Disk.1 auto-load.** The editor attempts to fetch `https://raw.githubusercontent.com/HoraceAndTheSpider/Indy-Heat-WHD/master/whdload/data/Disk.1` automatically at startup. If that request is unavailable or blocked, use the normal Open/Drop control.
- **Original colour** is the default. It uses the exact 32-colour Amiga palette recovered from the original Illinois `r1.iff` rip.
- **Master Circuit Zoom** is now a slider from **100% to 600% in 50% steps**, with 200% as the default. The 320×256 game artwork remains pixel-accurate while editor overlays scale with it.
- **Waypoint labels** can show physical Waypoint ID (`A00`, `B12`, `C07`) or logical Sequence.
- **Drag waypoints directly** on the circuit; the editor converts the dragged screen position back to decoded waypoint X/Y.
- Hidden waypoint layers are **not selectable**.
- **Recovery arrows** are high-resolution vectors with adjustable density.
- The authentic code-derived mapping is the normal waypoint projection; manual comparison controls live only under advanced/research diagnostics.

## Waypoint editing

The proven six-byte record conversion is:

```text
runtime byte = stored byte XOR $FF
```

Decoded runtime record:

```text
+0.w  signed X
+2.b  progress/checkpoint ordinal in low 7 bits + separate high-bit flag
+3.b  signed Y
+4.w  signed relative byte displacement to another six-byte record
```

Routes are labelled:

- **A** — normal AI racing line
- **B** — alternate normal AI racing line
- **C** — reference/service path; exact human-progress and pit/service role remains under investigation

Click a visible waypoint or choose it from the list. You can then drag it, or edit X/Y, sequence, the high-bit flag and link target/delta numerically. Physical waypoint ID and logical sequence are deliberately kept separate. Edits are automatically re-encoded into the complemented stored representation.

Two optional research overlays sit directly below **Sequence groups**:

- **Bit-7 flags** — adds a white outer ring around each visible physical waypoint whose independent high bit is set. This deliberately does not assign a gameplay meaning to the flag; it is a visual aid for spotting geometric/contextual patterns.
- **Link deltas ≠ +6** — draws cyan directional arrows from each source waypoint to its route-local decoded link target only when the signed relative displacement is not the ordinary `+6`. The signed byte delta is labelled on the arrow, making branches, backward links and larger skips easy to inspect without duplicating every normal adjacent link.

These research overlays respect Route A/B/C visibility and the current waypoint projection. The cyan overlay remains route-local, matching the editor's existing route-link display safeguard.

## Surface and foreground editing

The established +1/+2 circuit resources can now be edited directly on the circuit.

Entering **Surface edit** or **Foreground edit** turns Waypoints off. Turning Waypoints back on exits bitmap editing. Surface/foreground visibility remains independent, so these layers can still be used as normal visual overlays when they are not being edited.

The editor uses three desktop columns: **circuit/details controls** on the left, the **circuit drawing** in the centre, and a contextual **Editor** column on the right. **Master Circuit Zoom** is permanently at the top of that right-hand column, defaults to **200%**, and offers 300% and 400%.

The right-hand column is now explicitly mode-driven with permanent **Waypoints / Surface / Foreground** buttons. Waypoint mode shows the existing Waypoint editor and enables normal waypoint selection/dragging. Surface and Foreground modes hide that editor and show the bitmap drawing tools. The modes are mutually exclusive and do not move the circuit vertically.

**Overlay opacity** now sits permanently beneath Master Circuit Zoom and above the editor-mode buttons.

The Drawing controls expand while Surface or Foreground edit mode is active and provide:

- Pencil / freehand;
- straight line;
- rectangle / square, outlined or filled;
- ellipse / circle, outlined or filled;
- flood fill;
- icon/radio-button tool selection;
- radio-button Area to Paint selection;
- a 1–9 brush-size slider;
- a Square/Circle brush toggle;
- a Foreground **Hatched 1/1** pattern toggle using a fixed one-pixel-on / one-pixel-off checker;
- right-click secondary paint using the current tool and brush;
- Undo;
- Revert layer.

For foreground, brush sizes are literal bitmap pixels. The optional **Hatched 1/1** pattern remains fixed at one pixel on / one pixel off in absolute foreground coordinates: changing brush size changes only the footprint covered by the brush, not the hatch frequency. This is intended for sparse 1bpp structures such as fencing. Because the Surface map is only addressable in 2×2-pixel logical cells, the 1px hatch option is deliberately Foreground-only.

For surfaces, brush sizes are logical cells: a 1×1 brush paints one native 2×2 game-pixel cell, a 2×2 brush paints 4×4 game pixels, and so on.

Right-click is deliberately mode-specific:
- **Foreground:** always paints the opposite of the selected value — Foreground becomes Clear, and Clear becomes Foreground — using the same tool, brush shape, brush size and hatch setting.
- **Surface:** always paints class 0 (**Normal**) using the same tool and brush, regardless of the selected surface class.

Surface editing works on the real **160×112** logical grid. Every painted cell therefore remains exactly **2×2 game pixels**. Paint values are Normal, Edge / collision, Slowdown A and Slowdown B.

Foreground editing works directly on the **320×256 1bpp** bitmap at single-pixel resolution, with Foreground and Clear paint values. `$2804` variants still treat the first `$2800` bytes as bitmap data and leave the four trailing bytes untouched.

Layer edits are written back into the editable decompressed resource data. The existing raw **+1 .bin** and **+2 .bin** exports therefore contain the edited resources. View PNG export composites the edited overlays. Waypoint/main-image export remains a separate path.

### Magnified Area

The Drawing pane includes a **64×64-pixel source magnifier**, displayed as a 256×256 working window. Click the magnifying-glass button and position the 64×64 frame over the main circuit. The magnified window updates from that source area, and the same drawing tools, brush size/shape and right-click erase behaviour work directly inside it.

Clicking the magnifying-glass button again disables the magnifier and clears its window to black. Enabling Waypoints also clears the magnifier because the drawing pane is hidden.

## Export

The editor can export:

- the current high-resolution editor view as PNG;
- track/research JSON;
- a compact waypoint-patch JSON;
- the complete modified decrunched `$1206A` main image as `indyheat_main_modified_v011.bin`;
- the four raw circuit resources, with +1/+2 reflecting foreground/surface edits.

It does **not** yet recompress the main image or edited resources into the retail ADF. `whdload-test/` contains a separate development-only source hook for loading the modified main image during `patch_boot`; it does not replace the existing working slave.

## Circuit layers

Established circuit data:

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

Layer packing/drawing tests:

```bash
node test_layer_tools.js
```

Static UI tests:

```bash
node test_ui.js
```

Verify the supplied/original Illinois ILBM palette:

```bash
node test_palette_iff.js /path/to/r1.iff
```

Full tests using your own original disk image:

```bash
node test_node.js /path/to/Disk.1
```

## Sequence-aware display

- **Sequence Groups** draw a yellow dashed minimum-spanning join between geographically adjacent visible waypoints on the **same route** sharing the same low-7-bit sequence value.
- Yellow is an equivalence aid, not a route/link.
- The sidebar summarises each route as sequence range plus physical point count; validation also catalogues A/B/C ranges for all ten circuits.
- Validation warns about missing sequence values and differing A/B/C ranges while retail invariants are still being catalogued.
- Different routes are allowed to have different physical waypoint counts. No companion point is implied on another route.
