const T=require('./indyheat.js');

function eq(a,b,msg){
  const aa=Array.isArray(a)||ArrayBuffer.isView(a)?Array.from(a):a;
  const bb=Array.isArray(b)||ArrayBuffer.isView(b)?Array.from(b):b;
  if(JSON.stringify(aa)!==JSON.stringify(bb)) throw new Error(`${msg}: ${JSON.stringify(aa)} != ${JSON.stringify(bb)}`);
}

// Live Illinois evidence captured in WinUAE debugger:
// stored 00 3E FF 1C FF F9 -> runtime FF C1 00 E3 00 06.
const stored=Uint8Array.from([0x00,0x3e,0xff,0x1c,0xff,0xf9]);
const d=T.decodeStoredWaypointBytes(stored);
eq(d.runtimeBytes,[0xff,0xc1,0x00,0xe3,0x00,0x06],'Illinois bytewise decode');
if(d.x!==-63||d.progress!==0||d.progressFlag||d.y!==-29||d.linkDelta!==6||d.linkRecords!==1) throw new Error('Illinois decoded field regression');
eq(T.encodeRuntimeWaypoint(d).storedBytes,stored,'Illinois re-encode');

// The recovered validation montage used A082(-staticX,0,-staticY). With the proven
// bytewise complement, the decoded first Illinois point is the natural high-word input.
const projected=T.projectWaypointA082(-63,-29);
if(!projected || projected.x!==179 || projected.y!==180) throw new Error('A082 waypoint projection regression');

// Second live record proves the progress high bit is separate from the low-7 ordinal.
const stored2=Uint8Array.from([0x00,0x36,0x7e,0x1c,0xff,0xf9]);
const d2=T.decodeStoredWaypointBytes(stored2);
eq(d2.runtimeBytes,[0xff,0xc9,0x81,0xe3,0x00,0x06],'Illinois second decode');
if(d2.x!==-55||d2.progress!==1||!d2.progressFlag||d2.y!==-29||d2.linkDelta!==6) throw new Error('Illinois progress flag regression');

// Synthetic race descriptor + route records, to exercise link resolution and writing.
const main=new Uint8Array(0x6000);
const runtimeStart=0x2000,fileStart=runtimeStart-0x1000;
main.set(stored,fileStart);
main.set(stored2,fileStart+6);
const third=T.encodeRuntimeWaypoint({x:-47,y:-28,progress:2,progressFlag:false,linkDelta:-12}).storedBytes;
main.set(third,fileStart+12);
const record={descriptors:[
  {start:runtimeStart,end:runtimeStart+12,count:2,wordA:0},
  {start:runtimeStart+12,end:runtimeStart+18,count:1,wordA:0},
  {start:runtimeStart+18,end:runtimeStart+18,count:0,wordA:0}
]};
const sets=T.parseWaypointDescriptors(main,record);
if(sets[0].points[0].linkTarget!==runtimeStart+6||!sets[0].points[0].linkResolved) throw new Error('link resolution regression');
if(!sets[0].boundaryPoint||sets[0].boundaryPoint.runtimeAddress!==runtimeStart+12) throw new Error('boundary record regression');

const p=sets[0].points[0];
T.writeWaypoint(main,p,{x:-60,y:-25,progress:7,progressFlag:true,linkDelta:12});
const changed=T.decodeStoredWaypointBytes(main.slice(fileStart,fileStart+6));
if(changed.x!==-60||changed.y!==-25||changed.progress!==7||!changed.progressFlag||changed.linkDelta!==12) throw new Error('write/re-encode regression');

// Drag inverse: exact forward points should invert to a coordinate that reprojects to the same screen point.
for(const [x,y] of [[-63,-29],[-20,12],[40,-50],[0,0],[95,60]]){
  const q=T.projectWaypointA082(x,y),inv=T.inverseWaypointA082(q.x,q.y,x,y);
  if(!inv) throw new Error('A082 inverse returned null');
  const qq=T.projectWaypointA082(inv.x,inv.y);
  if(qq.x!==q.x||qq.y!==q.y) throw new Error(`A082 inverse projection regression for ${x},${y}`);
}

// Verified palette regression: exact original-rip words, exact-sequence search and fallback.
const expectedPalette=[
  0x888,0x000,0xFDC,0xFFF,0x333,0x666,0x999,0xCCC,
  0x954,0xF81,0xFA6,0xFFA,0x449,0x77B,0x66C,0x88F,
  0xAAF,0xCCF,0xF99,0xFCA,0xC74,0xCB2,0xC90,0xDD0,
  0x080,0x1B0,0x6D0,0x9F0,0x900,0xC00,0xB33,0xF00
];
eq(T.VERIFIED_TRACK_PALETTE_WORDS,expectedPalette,'verified r1.iff palette words');
const pmain=new Uint8Array(0x5000),po=0x2340;
for(let i=0;i<expectedPalette.length;i++){const w=expectedPalette[i];pmain[po+i*2]=w>>8;pmain[po+i*2+1]=w&255;}
eq(T.findWordSequence(pmain,expectedPalette),[po],'exact palette signature search');
const fakeModel={main:pmain,resources:[],getResource(){throw new Error('should not scan resources after main hit')}};
const found=T.findVerifiedTrackPalette(fakeModel);
if(!found.exactSourceFound||found.sourceKind!=='main'||found.fileOffset!==po) throw new Error('verified main palette source regression');
const fallback=T.findVerifiedTrackPalette({main:new Uint8Array(128),resources:[],getResource(){throw new Error('no resources')}});
if(fallback.exactSourceFound||fallback.sourceKind!=='reference'||fallback.rgb.length!==32) throw new Error('verified IFF fallback regression');
const rbuf=new Uint8Array(64);for(let i=0;i<expectedPalette.length;i++){const w=expectedPalette[i];rbuf[i*2]=w>>8;rbuf[i*2+1]=w&255;}
const resourceHit=T.findVerifiedTrackPalette({main:new Uint8Array(128),resources:[{id:7,outLen:64}],getResource(){return {data:rbuf}}});
if(!resourceHit.exactSourceFound||resourceHit.sourceKind!=='resource'||resourceHit.resourceId!==7||resourceHit.fileOffset!==0) throw new Error('verified resource palette source regression');

const seq=T.summarizeWaypointSequences(sets);
if(seq[0].min!==0||seq[0].max!==1||seq[0].physicalCount!==2||seq[0].uniqueCount!==2||seq[0].missing.length) throw new Error('sequence summary route A regression');
const dupSets=[{index:0,points:[{progress:0},{progress:1},{progress:1},{progress:3}]},{index:1,points:[{progress:0},{progress:1},{progress:2},{progress:3}]},{index:2,points:[]}];
const ds=T.summarizeWaypointSequences(dupSets);
if(ds[0].duplicates.length!==1||ds[0].duplicates[0].sequence!==1||ds[0].missing[0]!==2) throw new Error('sequence duplicate/missing regression');
console.log('waypoint/editor v0.11 unit tests OK');
