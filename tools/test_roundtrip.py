#!/usr/bin/env python3
from pathlib import Path
import hashlib, subprocess, sys, tempfile
ROOT=Path(__file__).resolve().parent
PY=sys.executable
tool=ROOT/"indyheat_north_usa_ilbm.py"
src=ROOT/"gasoline_alley_north_usa_78x47_bob.bin"
ilbm=ROOT/"gasoline_alley_north_usa_78x47.ilbm"

with tempfile.TemporaryDirectory() as td:
    td=Path(td)
    bob2=td/"roundtrip.bin"
    body2=td/"roundtrip_body.bin"
    ilbm2=td/"roundtrip.ilbm"
    subprocess.check_call([PY,str(tool),"to-bin",str(ilbm),str(bob2)])
    subprocess.check_call([PY,str(tool),"to-bin",str(ilbm),str(body2),"--body-only"])
    subprocess.check_call([PY,str(tool),"to-ilbm",str(src),str(ilbm2)])
    assert bob2.read_bytes()==src.read_bytes(), "ILBM -> BOB differs from original source frame"
    assert body2.read_bytes()==src.read_bytes()[12:], "ILBM -> body differs from original source frame"
    # Converter output itself is deterministic too.
    assert ilbm2.read_bytes()==ilbm.read_bytes(), "BOB -> ILBM differs from supplied ILBM"

print("PASS: source BOB -> ILBM -> source BOB is byte-identical")
print("BOB SHA256:", hashlib.sha256(src.read_bytes()).hexdigest())
print("BODY SHA256:", hashlib.sha256(src.read_bytes()[12:]).hexdigest())
print("ILBM SHA256:", hashlib.sha256(ilbm.read_bytes()).hexdigest())
