'use strict';
const fs=require('fs');
const path=require('path');
const G=require('./indyheat_race_graphics.js');
function assert(c,m){if(!c)throw new Error(m);}

// Proven four-plane source -> five-plane display mapping.
const map=[[0,4],[3,7],[4,12],[7,15],[8,20],[11,23],[12,28],[15,31]];
for(const [s,d] of map) assert(G.sourceToDisplayIndex(s,4)===d,`mapping ${s}->${d}`);

// Palette is read from the decrunched Disk.1 main image, not from an IFF.
const main=fs.readFileSync('/mnt/data/main_js.bin');
const pal=G.paletteFromMain(new Uint8Array(main));
assert(pal.offset===0x5534,'palette main offset');
assert(pal.words.length===32,'palette length');
assert(pal.words[0]===0x888 && pal.words[31]===0xF00,'palette endpoint regression');

const expected=new Map([[0x05,304],[0x06,64],[0x07,11],[0x08,64],[0x09,56],[0x0A,33],[0x0B,26],[0x0C,25],[0x0D,17],[0x0E,6],[0x0F,36]]);
for(const [id,count] of expected){
  const hex=id.toString(16).toUpperCase().padStart(2,'0');
  const p=`/mnt/data/resource${hex}_decompressed.bin`;
  const p2=`/mnt/data/resource${hex.toLowerCase()}_decompressed.bin`;
  const actual=fs.existsSync(p)?p:p2;
  const data=new Uint8Array(fs.readFileSync(actual));
  const bank=G.decodeBank(data,{resourceId:id});
  assert(bank.frameCount===count,`$${hex} frame count expected ${count}, got ${bank.frameCount}`);
}

const fbank=G.decodeBank(new Uint8Array(fs.readFileSync('/mnt/data/resource0F_decompressed.bin')),{resourceId:0x0F});
const f26=fbank.frames[26];
assert(f26.width===10 && f26.height===5,'$0F:26 dimensions');
assert(f26.xOrigin===5 && f26.yOrigin===4,'$0F:26 origin');
assert(f26.transparentSourceIndex===4 && f26.planes===4,'$0F:26 source transparency/planes');

console.log('Indy Heat race graphics decoder tests OK');
