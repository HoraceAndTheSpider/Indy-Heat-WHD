# v0.19.7 hotfix

Immediate regression fix for v0.19.6.

## Browser lock-up
The v0.19.6 mode-order code installed a `MutationObserver` on `#layerModeButtons`.
Its callback called `reorderModes()`, which re-appended the existing buttons and
therefore generated another `childList` mutation. In a live browser this could
repeat continuously and starve the UI thread, making the entire editor appear
locked.

v0.19.7 removes that observer completely.

Mode ordering is now reapplied only:
- during extension startup; and
- once after a mode-button click, queued after the older v0.19.5 handler.

The intended order remains:

1. Backdrop
2. Foreground
3. Surface
4. Waypoints
5. Recovery
6. Race
7. MiniMap
8. Map

The explicit Race -> Garage palette lookup and the document-level lap-tower drag
logic from v0.19.6 are otherwise unchanged.
