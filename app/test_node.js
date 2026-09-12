const fs=require('fs');
const T=require('./indyheat.js');
const diskPath=process.argv[2] || 'Disk.1';
if(!fs.existsSync(diskPath)){
  console.error(`Usage: node test_node.js /path/to/Disk.1`);
  process.exit(2);
}
const disk=new Uint8Array(fs.readFileSync(diskPath));
const m=T.makeDiskModel(disk);
console.log('blocks',m.blocks.length,'main',m.main.length.toString(16),'table',m.resourceTableOffset.toString(16),'resources',m.resources.length);
if(m.blocks.length!==96) throw new Error(`expected 96 Imploder blocks, got ${m.blocks.length}`);
if(m.main.length!==0x1206a) throw new Error('wrong main size');
if(m.resourceTableOffset!==0x3c6a) throw new Error('wrong resource table');
if(m.resources.length!==108) throw new Error('wrong resource count');
for(const base of T.TRACK_BASE_IDS){
  const r=[0,1,2,3].map(n=>m.getResource(base+n));
  console.log(`$${base.toString(16)}`,r.map(x=>x.data.length.toString(16)).join(','));
  if(r[0].data.length!==0xc800) throw new Error('background size');
  if(![0x2800,0x2804].includes(r[1].data.length)) throw new Error('occlusion size');
  if(r[2].data.length!==0x1180) throw new Error('surface size');
  if(r[3].data.length!==0x460) throw new Error('heading size');
  if(T.decodeSurface2bpp(r[2].data).cells.length!==160*112) throw new Error('surface decode');
  if(T.decodeHeadingGrid(r[3].data).values.length!==40*28) throw new Error('heading decode');
}
const races=T.parseRaceRecords(m.main);
const mapping=races.map(r=>[r.index,r.name,T.raceBaseResourceId(r,m.resourceTableOffset+0x1000)]);
console.log('race/resource mapping',mapping.map(([n,name,b])=>`${n}:${name}->$${b.toString(16)}`).join(' | '));
if(mapping[1][2]!==0x4d || mapping[2][2]!==0x3d) throw new Error('race/resource ordering regression');

const coordFlags=races.slice(0,10).map(r=>r.coordFlipWord<0);
const expectedFlags=[false,false,false,true,true,false,false,true,false,true];
if(coordFlags.some((v,i)=>v!==expectedFlags[i])) throw new Error('race +$6A X-orientation flags changed');
console.log('race coord flags',coordFlags.map((v,i)=>`${i+1}:${v?'mirror':'normal'}`).join(' | '));
console.log('OK');
