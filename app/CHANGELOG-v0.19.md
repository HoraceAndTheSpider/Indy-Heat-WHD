# Indy Heat Circuit Editor v0.19

## ZIP importer

v0.19 adds round-trip import of the binary-only `circuit_xx.zip` produced by the editor.

### Selector behaviour

- `circuit_00` through `circuit_09` overlay the corresponding retail dropdown slot and select it.
- `circuit_10` through `circuit_99` create/select one `-custom- · circuit_xx` dropdown option.
- Retail circuits remain selectable while a custom circuit is loaded for visual/data reference.
- Leaving an imported selection snapshots its current edited state and restores the underlying retail template.
- Returning to the imported selection re-applies the saved working package.

The circuit number is independent of the retail circuit used as the structural source. The importer identifies the required retail template from the three stored waypoint-route counts.

### Imported files

The ZIP remains game/runtime data only:

- `background.bin`
- `foreground.bin`
- `surface.bin`
- `recovery.bin`
- `preview.bin`
- `waypoints.bin`
- `race_setup.bin`
- `presentation.bin`

No JSON metadata is required or generated.

### Editor-model reconciliation

The current editor has separate core-viewer and layer-editor Disk.1 models. v0.19 applies an imported package to both so that backdrop/surface/foreground/recovery editing and waypoint/race/presentation editing all continue from the same imported circuit.

### Baseline protection

Some older editor Revert/Undo controls use the original Disk.1 as their baseline. While an imported package is selected, those unsafe legacy actions are blocked rather than allowing them to overwrite imported work with retail data. Package-aware miniature-map Undo/Restore remains available; re-importing the ZIP also restores the complete imported baseline.

### ZIP compatibility

The importer is guaranteed to round-trip ZIPs produced by the editor itself. These use uncompressed STORE entries with CRC validation.

## Installation

Copy the contents of this archive's `app/` folder over the existing repository `app/` folder.

This is a v0.19 update over the v0.18 editor. The regional map files installed with v0.18 remain unchanged.

No `.patch` or `.diff` files are included.
