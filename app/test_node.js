const fs=require('fs');
const T=require('./indyheat.js');
const diskPath=process.argv[2] || 'Disk.1';
if(!fs.existsSync(diskPath)){
  console.error(`Usage: node test_node.js /path/to/Disk.1`);
  console.error('Run node test_waypoints.js for disk-independent v0.11 waypoint/editor tests.');
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
  if(T.decode1bpp(r[1].data,320,256,0).length!==320*256) throw new Error('offset-zero +1 decode failed');
  if(T.decodeSurface2bpp(r[2].data).cells.length!==160*112) throw new Error('surface decode');
  if(T.decodeHeadingGrid(r[3].data).values.length!==40*28) throw new Error('heading decode');
}
const races=T.parseRaceRecords(m.main);
for(const r of races){r.baseResourceId=T.raceBaseResourceId(r,m.resourceTableOffset+0x1000);r.waypointDescriptors=T.parseWaypointDescriptors(m.main,r);}
const mapping=races.map(r=>[r.index,r.name,r.baseResourceId]);
console.log('race/resource mapping',mapping.map(([n,name,b])=>`${n}:${name}->$${b.toString(16)}`).join(' | '));
if(mapping[1][2]!==0x4d || mapping[2][2]!==0x3d) throw new Error('race/resource ordering regression');

// Exact live-debugged Illinois stored/runtime conversion.
const ill=races.find(r=>r.name==='Illinois');
if(!ill) throw new Error('Illinois race record missing');
const first=ill.waypointDescriptors[0].points[0];
if(first.x!==-63||first.y!==-29||first.progress!==0||first.progressFlag||first.linkDelta!==6){
  throw new Error(`Illinois first waypoint decode regression: ${JSON.stringify({x:first.x,y:first.y,progress:first.progress,flag:first.progressFlag,link:first.linkDelta})}`);
}
const storedHex=Array.from(first.storedBytes,b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
if(storedHex!=='003EFF1CFFF9') throw new Error(`Illinois stored bytes changed: ${storedHex}`);
if(!first.linkResolved) throw new Error('Illinois first +6 link should resolve to the next record');

let points=0,aligned=0,resolved=0,boundaries=0;
for(const r of races.slice(0,10))for(const set of r.waypointDescriptors){
  if(set.descriptorBytes!==set.count*6) throw new Error(`${r.name} route ${set.index}: descriptor span/count mismatch`);
  if(set.boundaryPoint)boundaries++;
  for(const p of set.points){
    points++; if(p.linkAligned)aligned++; if(p.linkResolved)resolved++;
    const re=T.encodeRuntimeWaypoint(p).storedBytes;
    if(re.some((v,i)=>v!==p.storedBytes[i])) throw new Error(`${r.name} route ${set.index} point ${p.index}: decode/re-encode mismatch`);
  }
}
console.log('waypoints',points,'aligned links',aligned,'resolved links',resolved,'descriptor boundaries',boundaries);
console.log('sequence ranges (range [physical points])');
for(const r of races.slice(0,10)){
  const seq=T.summarizeWaypointSequences(r.waypointDescriptors);
  const line=seq.map(q=>`${q.route} ${q.min}–${q.max} [${q.physicalCount}]${q.missing.length?` missing:${q.missing.join(',')}`:''}`).join(' · ');
  console.log(`${r.name}: ${line}`);
}
const palette=T.findVerifiedTrackPalette(m);
console.log('verified palette source',palette.sourceLabel);
if(!palette||palette.rgb.length!==32) throw new Error('verified track palette unavailable');
if(!palette.exactSourceFound) console.warn('NOTE: exact r1.iff palette table was not found in decompressed main/resources; reference CMAP fallback is active.');
console.log('v0.11 full-disk regressions OK');
