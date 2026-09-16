#!/usr/bin/env python3
"""
Indy Heat Gasoline Alley North-USA map converter.

Game-native frame:
  78x47, 5 bitplanes, 10 bytes/row, 470 bytes/plane.
  12-byte big-endian header:
    width=78, height=47, xOrigin=40, yOrigin=64,
    transparentSourceIndex=29, planes=5.
  Payload is plane-major.

ILBM:
  fixed 78x47 / 5-plane FORM ILBM.
  BODY may be uncompressed or ByteRun1 compressed.
  BODY is converted between standard row-major/plane-interleaved ILBM order
  and Indy Heat's plane-major game order.

The CMAP is not part of the game .bin and is ignored when converting to .bin.
"""
from __future__ import annotations
import argparse, struct, pathlib, sys

W,H,P = 78,47,5
XO,YO,TRANSPARENT = 40,64,29
ROW = ((W+15)//16)*2
PLANE = ROW*H
BODY = PLANE*P
BOB = 12+BODY
FIXED_HEADER = struct.pack(">6H",W,H,XO,YO,TRANSPARENT,P)

PALETTE_WORDS = [
    0x888,0x000,0xFDC,0xFFF,0x333,0x666,0x999,0xCCC,
    0x954,0xF81,0xFA6,0xFFA,0x449,0x77B,0x66C,0x88F,
    0xAAF,0xCCF,0xF99,0xFCA,0xC74,0xCB2,0xC90,0xDD0,
    0x080,0x1B0,0x6D0,0x9F0,0x900,0xC00,0xB33,0xF00,
]

def cmap():
    b=bytearray()
    for w in PALETTE_WORDS:
        b += bytes((((w>>8)&15)*17,((w>>4)&15)*17,(w&15)*17))
    return bytes(b)

def iff_chunk(tag,payload):
    z=tag+struct.pack(">I",len(payload))+payload
    return z+(b"\0" if len(payload)&1 else b"")

def plane_to_ilbm(body):
    if len(body)!=BODY: raise ValueError(f"expected {BODY} game body bytes")
    o=bytearray()
    for y in range(H):
        for p in range(P):
            a=p*PLANE+y*ROW
            o += body[a:a+ROW]
    return bytes(o)

def ilbm_to_plane(body):
    if len(body)!=BODY: raise ValueError(f"expected {BODY} decoded ILBM BODY bytes")
    o=bytearray(BODY); q=0
    for y in range(H):
        for p in range(P):
            a=p*PLANE+y*ROW
            o[a:a+ROW]=body[q:q+ROW]
            q += ROW
    return bytes(o)

def byterun1_decode(data, expected):
    out=bytearray(); i=0
    while i<len(data) and len(out)<expected:
        n=data[i]; i+=1
        if n<=127:
            count=n+1
            if i+count>len(data): raise ValueError("truncated ByteRun1 literal")
            out += data[i:i+count]; i+=count
        elif n>=129:
            count=257-n
            if i>=len(data): raise ValueError("truncated ByteRun1 repeat")
            out += bytes([data[i]])*count; i+=1
        # 128 = NOP
    if len(out)!=expected:
        raise ValueError(f"ByteRun1 decoded to {len(out)} bytes, expected {expected}")
    return bytes(out)

def parse_ilbm(data):
    if len(data)<12 or data[:4]!=b"FORM" or data[8:12]!=b"ILBM":
        raise ValueError("not a FORM ILBM")
    end=min(len(data),8+struct.unpack(">I",data[4:8])[0])
    chunks={}; p=12
    while p+8<=end:
        tag=data[p:p+4]; n=struct.unpack(">I",data[p+4:p+8])[0]; p+=8
        if p+n>end: raise ValueError(f"truncated {tag!r} chunk")
        chunks[tag]=data[p:p+n]
        p += n+(n&1)
    if b"BMHD" not in chunks or b"BODY" not in chunks:
        raise ValueError("ILBM requires BMHD and BODY")
    bm=chunks[b"BMHD"]
    if len(bm)<20: raise ValueError("short BMHD")
    w,h,x,y,np,masking,compression,pad,trans,xa,ya,pw,ph = struct.unpack(">HHhhBBBBHBBhh",bm[:20])
    if (w,h,np)!=(W,H,P):
        raise ValueError(f"must be exactly {W}x{H}, {P} planes; got {w}x{h}, {np} planes")
    if masking not in (0,2):
        raise ValueError("mask-plane ILBMs are not accepted; use none or transparent-colour masking")
    if compression==0:
        raw=chunks[b"BODY"]
        if len(raw)!=BODY:
            raise ValueError(f"uncompressed BODY is {len(raw)} bytes, expected {BODY}")
    elif compression==1:
        raw=byterun1_decode(chunks[b"BODY"],BODY)
    else:
        raise ValueError(f"unsupported ILBM compression {compression}")
    return raw

def make_ilbm(game_body):
    bm=struct.pack(">HHhhBBBBHBBhh",W,H,0,0,P,2,0,0,TRANSPARENT,10,11,W,H)
    payload=(b"ILBM"+iff_chunk(b"BMHD",bm)+iff_chunk(b"CMAP",cmap())+
             iff_chunk(b"CAMG",struct.pack(">I",0))+iff_chunk(b"BODY",plane_to_ilbm(game_body)))
    return b"FORM"+struct.pack(">I",len(payload))+payload

def read_game_bin(path):
    data=pathlib.Path(path).read_bytes()
    if len(data)==BOB:
        if data[:12]!=FIXED_HEADER:
            got=struct.unpack(">6H",data[:12])
            raise ValueError(f"BOB header is not the fixed Indy Heat map header: {got}")
        return data[12:]
    if len(data)==BODY:
        return data
    raise ValueError(f"game binary must be {BOB} bytes (header+body) or {BODY} bytes (body only)")

def cmd_to_ilbm(args):
    game=read_game_bin(args.input)
    pathlib.Path(args.output).write_bytes(make_ilbm(game))

def cmd_to_bin(args):
    interleaved=parse_ilbm(pathlib.Path(args.input).read_bytes())
    game=ilbm_to_plane(interleaved)
    out=game if args.body_only else FIXED_HEADER+game
    pathlib.Path(args.output).write_bytes(out)

def main():
    ap=argparse.ArgumentParser()
    sub=ap.add_subparsers(dest="cmd",required=True)
    a=sub.add_parser("to-ilbm",help="game BOB/body .bin -> fixed 78x47 ILBM")
    a.add_argument("input"); a.add_argument("output"); a.set_defaults(fn=cmd_to_ilbm)
    a=sub.add_parser("to-bin",help="fixed 78x47 ILBM -> game .bin")
    a.add_argument("input"); a.add_argument("output")
    a.add_argument("--body-only",action="store_true",help="write 2350-byte plane payload, not 2362-byte BOB")
    a.set_defaults(fn=cmd_to_bin)
    args=ap.parse_args()
    try: args.fn(args)
    except Exception as e:
        print(f"error: {e}",file=sys.stderr); return 2
    return 0

if __name__=="__main__":
    raise SystemExit(main())
