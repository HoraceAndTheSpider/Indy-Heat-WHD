# Indy Heat Circuit Editor v0.19.3

Corrective integration update for the live issues reported against v0.19.2.

## Race / HUD

- Race now has a separate v0.19.3 HUD preview layer that does not depend on the Race button retaining a particular CSS `active` state.
- Current-lap 1/2/3/4 digits, the `99` total-lap preview and timer preview remain tied to the authentic `race+$24/+26` origin.
- When that authentic origin is outside the 320×256 circuit picture, an on-screen yellow edge handle remains visible and draggable.
- **Bring into view** moves the HUD origin to a safe visible position when required.
- HUD edits are written to all active editor models so ZIP export sees the same value shown in the editor.

## Left View controls

- **Surface types**, **Waypoints**, **Pits** and **Race control** are created as independent foldable `<details>` groups.
- Their creation no longer depends on every later Race control already existing at the exact same initialisation moment.
- Setup is retried until all four groups are present.

## Map / Mini map

- **Overlay opacity** is explicitly hidden in Map and Mini-map modes using both state and CSS, preventing legacy layout updates from making it reappear.
- It is restored in normal circuit/Race modes.

## Mini-map From backdrop

- The 320×224 racing backdrop is now converted from the verified racing palette to the Gasoline Alley/presentation palette before reduction to 78×51.
- Automatic conversion excludes Gasoline Alley colour 0 because that is miniature transparency.
- Near-grey racing colours are matched to near-grey Gasoline Alley colours rather than arbitrary saturated entries.
- Existing package-aware Mini-map Undo behaviour is preserved: v0.19.2 creates the Undo baseline first, then v0.19.3 replaces the incorrect index-for-index colour conversion.

## Packaging

No circuit ZIP format or WHDLoad runtime format changes are made by v0.19.3.
