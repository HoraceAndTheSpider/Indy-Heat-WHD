# Optional WHDLoad round-trip test hook

The editor exports `indyheat_main_modified_v011.bin`, a decrunched `$1206A`-byte main image with waypoint edits applied in stored/complemented form.

The existing Indy Heat slave reaches `patch_boot` after the original main image has been copied to runtime `$1000`. For a development-only test slave, load the editor export over `$1000` **before** applying `pl_boot`, then apply the normal WHDLoad patches to the replacement image.

A replacement `patch_boot` fragment is provided in `patch_boot_v011_test.asm`. It is intentionally optional: if the file is absent or not exactly `$1206A` bytes, the normal disk-loaded image is left untouched.

Suggested workflow:

1. Edit one obvious Illinois waypoint in v0.11.
2. Export **Modified main .bin**; keep the filename `indyheat_main_modified_v011.bin` in the WHDLoad data/current directory.
3. Build a development slave with the supplied `patch_boot` replacement/helper.
4. Launch Illinois and verify the route/AI response.
5. Remove the external file to return to the original image without changing Disk.1.

This hook has not been assembled in this environment; it is supplied as source for the next controlled WHDLoad test, not as a replacement production slave.
