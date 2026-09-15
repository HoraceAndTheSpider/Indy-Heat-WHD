'use strict';

const fs=require('fs');
const path=require('path');
const T=require('./indyheat.js');
const G=require('./indyheat_race_graphics.js');

function assert(condition,message){
  if(!condition) throw new Error(message);
}

const diskPath=process.argv[2] || path.join(__dirname,'..','whdload','data','Disk.1');
if(!fs.existsSync(diskPath)){
  throw new Error(`Disk.1 not found at ${diskPath}. Pass a path as the first argument if required.`);
}

const disk=new Uint8Array(fs.readFileSync(diskPath));
assert(disk.length===901120,`expected 901120-byte Disk.1, got ${disk.length}`);

const model=T.makeDiskModel(disk);
assert(model.main.length===0x1206A,`main length expected $1206A, got $${model.main.length.toString(16)}`);
assert(model.resources.length===108,`resource directory expected 108 entries, got ${model.resources.length}`);
assert(model.blocks.length===96,`expected 96 discoverable Imploder blocks, got ${model.blocks.length}`);

// Proven four-plane source -> five-plane display mapping.
const map=[[0,4],[3,7],[4,12],[7,15],[8,20],[11,23],[12,28],[15,31]];
for(const [source,display] of map){
  assert(G.sourceToDisplayIndex(source,4)===display,`mapping ${source}->${display}`);
}

// Palette is read from the decrunched Disk.1 main image, never from an IFF.
const palette=G.paletteFromMain(model.main);
assert(palette.offset===0x5534,'race palette main offset');
assert(palette.words.length===32,'race palette length');
assert(palette.words[0]===0x888 && palette.words[31]===0xF00,'race palette endpoint regression');

// Strict whole-resource frame counts.
const expected=new Map([
  [0x05,304],[0x06,64],[0x07,11],[0x08,64],[0x09,56],[0x0A,33],
  [0x0B,26],[0x0C,25],[0x0D,17],[0x0E,6],[0x0F,36]
]);

for(const [id,count] of expected){
  const resource=model.getResource(id);
  const bank=G.decodeBank(resource.data,{resourceId:id,strict:true});
  assert(bank.frameCount===count,
    `$${id.toString(16).toUpperCase().padStart(2,'0')} frame count expected ${count}, got ${bank.frameCount}`);
}

// FlagMan.iff is not loaded here.  The record fields themselves are the permanent
// regression point established by the earlier zero-pixel-mismatch comparison.
const fbank=G.decodeBank(model.getResource(0x0F).data,{resourceId:0x0F,strict:true});
const f26=fbank.frames[26];
assert(f26.width===10 && f26.height===5,'$0F:26 dimensions');
assert(f26.xOrigin===5 && f26.yOrigin===4,'$0F:26 origin');
assert(f26.transparentSourceIndex===4 && f26.planes===4,'$0F:26 transparency/planes');

// Current semantic metadata. These assertions protect confirmed naming from
// accidentally regressing to earlier unresolved/incorrect labels.
assert(G.RACE_OBJECT_ROLES[0x0A].name==='high-damage car-on-fire overlay','$0A role');
assert(G.RACE_OBJECT_ROLES[0x0B].name==='out-of-fuel overlay','$0B role');
assert(G.RACE_OBJECT_ROLES[0x0D].name==='speedometer','$0D role');
assert(G.RACE_OBJECT_ROLES[0x0E].name==='speedometer / pit-status overlay','$0E role');

const graphics=G.attach(model);
assert(graphics.getBank(0x08).frameCount===64,'attached $08 PIT-board bank');
assert(graphics.getBank(0x0F).frameCount===36,'attached $0F flag-man bank');

console.log('Indy Heat race graphics Disk.1 regression tests OK');
