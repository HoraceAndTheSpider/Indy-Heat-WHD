# v0.11

- Added independent track/background opacity control.
- Fixed Route Links so targets resolve only within the originating A/B/C descriptor instead of through a global cross-route address map.
- Fixed Sequence Groups so yellow joins are route-local: same-Sequence points may join within A, within B or within C, but never between routes.
- Added automatic startup fetch of repository `whdload/data/Disk.1`, with manual Open/Drop fallback.
- Updated export filenames/version metadata to v0.11.
