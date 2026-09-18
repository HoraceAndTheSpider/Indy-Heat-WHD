# Indy Heat Circuit Editor v0.19.1

Focused corrective update for v0.19 feedback.

## Map mode
- Retail USA map is now read directly from loaded Disk.1 resource `$16`, offset `$177C`.
- The extracted retail BOB is 78×47, 5-plane, `$093A` bytes and matches the prior USA map asset byte-for-byte.
- The seven added regional maps are embedded in `circuit-package.js`.
- Map mode performs no browser/network fetch, so local `file://` use no longer reports `Failed to fetch`.

## Right-hand mode navigation
- `Waypoints / Surface / Foreground / Recovery / Backdrop / Race / Map / Mini map / HUD` navigation is kept at the top of the right-hand editor column.
- Map, Mini map and HUD tools appear immediately below the navigation row when active.
- Auxiliary mode selection is explicitly exclusive; legacy Waypoints state is cleared/re-checked after existing listeners run.

## Circuit ZIP controls
- `Open Disk.1 / ADF`, circuit number, `Import circuit ZIP` and `Export circuit ZIP` now occupy the same header file-actions group.
- ZIP controls are no longer hidden inside Map/Mini/HUD mode content.
- Package status remains available from the header and inside active auxiliary modes.

No runtime/slave changes are included.
