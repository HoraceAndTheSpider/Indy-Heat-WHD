# v0.7 — decoded waypoint editor

## Visible functionality

- Exact XOR `$FF` decode/re-encode of six-byte waypoint records.
- Route A / B / C labels and independent visibility.
- Genuine decoded `+4.w` link topology instead of storage-order or `+13` candidate lines.
- Code-derived `$A082/$B082` waypoint projection as the default display mode.
- Click-to-select and list-based waypoint selection.
- Edit decoded X, Y, progress ordinal, high-bit flag and link delta/target.
- Automatic storage re-encoding after an edit.
- Route validation for descriptor span, link alignment and target resolution.
- Protected descriptor-end/boundary records, including the final zero sentinel.
- Waypoint patch JSON export.
- Modified decrunched main-image export for WHDLoad development testing.
- v0.7 track JSON includes stored/runtime bytes and resolved topology.

## Corrections carried into this build

- Resource +1 `$2804` variants decode from byte 0; four surplus bytes are trailing data.
- Removed the obsolete waypoint `link + 13`, `X×2`, `Y+128` interpretation from the active model.
- Shared descriptor endpoints resolve to ordinary records before boundary aliases.

## Still deliberately protected / unresolved

- Exact semantic name of the `+2` high-bit flag.
- Exact DBF/end-record ownership semantics.
- Meaning of the final zero sentinel beyond its boundary role.
- Exact pre-race routine that performs the in-place complement.
- Retail ADF recompression/repacking.
