(function(root){
'use strict';

const RUNTIME_MAIN_BASE=0x1000;
const RACE_RECORD_SIZE=0x82;
const PIT_RECORD_SIZE=0x16;
const PIT_RECORD_COUNT=4;
const PIT_BLOCK_SIZE=PIT_RECORD_SIZE*PIT_RECORD_COUNT; // $58
const LEGACY_COMPACT_SIZE=0x68;
const LEGACY_COMPACT_SIZE_V70=0x70;
const LEGACY_COMPACT_SIZE_V74=0x74;
const COMPACT_SIZE=0x76;
const HUD_LOWER_OFFSET_MIN=0;
const HUD_LOWER_OFFSET_MAX=12;
const LAP_MIN=2;
const LAP_MAX=20;
const SCREEN_WIDTH=320;
const SCREEN_HEIGHT=256;
const PIT_PICKUP_HEIGHT=30;
const RACE_POINT_MARGIN=6;
const OFF=Object.freeze({
  laps:0x28,
  pitPickupX:0x2C,
  pitPickupY:0x2E,
  pitPickupHalfWidth:0x30,
  pitPointer:0x32,
  flagX:0x5C,
  flagY:0x5E,
  pitApproachY:0x60,
  startX:0x62,
  startY:0x66,
  startOrient:0x6A,
  routeAssignment:0x6C
});
const CPU_CHOICES_OFFSET=0x50;
const CPU_CHOICES_SIZE=6;
const LEGACY_CPU_CHOICES_SIZE=12;
const CPU_CHOICES=Object.freeze([
  Object.freeze({key:'turbos',label:'Turbos',offset:0x50}),
  Object.freeze({key:'brakes',label:'Brakes',offset:0x52}),
  Object.freeze({key:'tyres',label:'Tyres',offset:0x54}),
  Object.freeze({key:'crew',label:'Crew',offset:0x56}),
  Object.freeze({key:'mpg',label:'MPG',offset:0x58}),
  Object.freeze({key:'engine',label:'Engine',offset:0x5A})
]);

const PIT=Object.freeze({
  serviceX:0x00,
  serviceY:0x04,
  boardX:0x08,
  boardY:0x0C,
  screenX:0x10,
  screenY:0x12,
  slotWord:0x14
});
const COMPACT_LAYOUT=Object.freeze({
  laps:{offset:0x00,length:2,source:'race+$28.w'},
  flag:{offset:0x02,length:4,source:'race+$5C.w/+$5E.w'},
  start:{offset:0x06,length:10,source:'race+$62.l/+$66.l/+$6A.w'},
  pits:{offset:0x10,length:PIT_BLOCK_SIZE,source:'four raw $16-byte pit records via race+$32.l'},
  pitlane:{offset:0x68,length:8,source:'race+$2C/+2E/+30/+60 pitlane controls'},
  routeAssignment:{offset:0x70,length:4,source:'race+$6C.l Route A/B starting assignment'},
  hudLowerOffset:{offset:0x74,length:2,source:'custom lower three-player HUD offset 0..12 pixels'}
});

// Four start-grid local offsets written by the race setup code into each car's
// +$68/+6C 16.16 coordinates before the race origin at +$62/+66 is added.
// +$6A negative mirrors the local X coordinate before origin addition.
const GRID_CAR_OFFSETS=Object.freeze([
  Object.freeze({x:-0x00050000,y:-0x00022000}),
  Object.freeze({x:-0x00050000,y: 0x00022000}),
  Object.freeze({x:-0x000D0000,y:-0x00022000}),
  Object.freeze({x:-0x000D0000,y: 0x00022000})
]);

function be16(b,o){if(!b||o<0||o+2>b.length)throw new Error('be16 outside buffer');return ((b[o]<<8)|b[o+1])>>>0;}
function be32(b,o){if(!b||o<0||o+4>b.length)throw new Error('be32 outside buffer');return (((be16(b,o)<<16)>>>0)|be16(b,o+2))>>>0;}
function s16(v){return (v&0x8000)?v-0x10000:v;}
function s32(v){return v>0x7fffffff?v-0x100000000:v;}
function wr16(b,o,v){v=Number(v);b[o]=(v>>>8)&255;b[o+1]=v&255;}
function wr32(b,o,v){v=Number(v)>>>0;wr16(b,o,(v>>>16)&0xffff);wr16(b,o+2,v&0xffff);}
function clampInt(v,min,max,label){v=Number(v);if(!Number.isInteger(v)||v<min||v>max)throw new Error(`${label} must be ${min}..${max}`);return v;}
function fixedToNumber(v){return Number(v)/65536;}
function numberToFixed(v){v=Number(v);if(!Number.isFinite(v))throw new Error('16.16 value must be numeric');const n=Math.round(v*65536);if(n<-0x80000000||n>0x7fffffff)throw new Error('16.16 value outside signed 32-bit range');return n;}
function fixedText(v){const n=fixedToNumber(v);return Number.isInteger(n)?String(n):n.toFixed(4).replace(/0+$/,'').replace(/\.$/,'');}
function fileOffsetFromRuntime(ptr,mainLength){const off=(Number(ptr)>>>0)-RUNTIME_MAIN_BASE;if(off<0||off+PIT_BLOCK_SIZE>mainLength)throw new Error(`Pit pointer $${(Number(ptr)>>>0).toString(16).toUpperCase()} is outside decrunched main`);return off;}
function getHudLowerOffset(record){const n=Number(record?.hudLowerOffset);return Number.isInteger(n)?Math.max(HUD_LOWER_OFFSET_MIN,Math.min(HUD_LOWER_OFFSET_MAX,n)):0;}
function getOriginalHudLowerOffset(record){const n=Number(record?.hudLowerOffsetOriginal);return Number.isInteger(n)?Math.max(HUD_LOWER_OFFSET_MIN,Math.min(HUD_LOWER_OFFSET_MAX,n)):0;}
function setHudLowerOffset(record,value,{baseline=false}={}){if(!record)throw new Error('Race record required');value=clampInt(value,HUD_LOWER_OFFSET_MIN,HUD_LOWER_OFFSET_MAX,'Lower HUD offset');record.hudLowerOffset=value;if(baseline)record.hudLowerOffsetOriginal=value;else if(record.hudLowerOffsetOriginal==null)record.hudLowerOffsetOriginal=0;return value;}

function parsePitRecord(main,off,index){
  if(off<0||off+PIT_RECORD_SIZE>main.length)throw new Error('Pit record outside decrunched main');
  return {
    index,fileOffset:off,
    serviceX:s32(be32(main,off+PIT.serviceX)),serviceY:s32(be32(main,off+PIT.serviceY)),
    boardX:s32(be32(main,off+PIT.boardX)),boardY:s32(be32(main,off+PIT.boardY)),
    screenX:s16(be16(main,off+PIT.screenX)),screenY:s16(be16(main,off+PIT.screenY)),
    slotWord:s16(be16(main,off+PIT.slotWord)),
    raw:main.slice(off,off+PIT_RECORD_SIZE)
  };
}

function parseRaceSetup(main,record){
  if(!main||!record||record.offset==null)throw new Error('Decrunched main and parsed race record required');
  const o=record.offset;
  if(o<0||o+RACE_RECORD_SIZE>main.length)throw new Error('Race record outside decrunched main');
  const pitPointer=be32(main,o+OFF.pitPointer);
  const pitFileOffset=fileOffsetFromRuntime(pitPointer,main.length);
  const pits=[];for(let i=0;i<PIT_RECORD_COUNT;i++)pits.push(parsePitRecord(main,pitFileOffset+i*PIT_RECORD_SIZE,i));
  return {
    recordIndex:record.index,recordOffset:o,name:record.name||'',baseResourceId:record.baseResourceId??null,
    laps:be16(main,o+OFF.laps),
    pitPickupX:s16(be16(main,o+OFF.pitPickupX)),pitPickupY:s16(be16(main,o+OFF.pitPickupY)),
    pitPickupHalfWidth:be16(main,o+OFF.pitPickupHalfWidth),pitApproachY:s16(be16(main,o+OFF.pitApproachY)),
    flagX:s16(be16(main,o+OFF.flagX)),flagY:s16(be16(main,o+OFF.flagY)),
    startX:s32(be32(main,o+OFF.startX)),startY:s32(be32(main,o+OFF.startY)),
    startOrient:s16(be16(main,o+OFF.startOrient)),
    routeAssignment:be32(main,o+OFF.routeAssignment),
    hudLowerOffset:getHudLowerOffset(record),
    cpuChoices:Object.freeze({
      turbos:be16(main,o+0x50),brakes:be16(main,o+0x52),tyres:be16(main,o+0x54),
      crew:be16(main,o+0x56),mpg:be16(main,o+0x58),engine:be16(main,o+0x5A)
    }),
    pitPointer,pitFileOffset,pits
  };
}

function writeCommon(main,recordOffset,values={}){
  if(values.laps!=null)wr16(main,recordOffset+OFF.laps,clampInt(values.laps,LAP_MIN,LAP_MAX,'Lap count'));
  if(values.pitPickupX!=null)wr16(main,recordOffset+OFF.pitPickupX,clampInt(values.pitPickupX,-32768,32767,'Pit pickup centre X')&0xffff);
  if(values.pitPickupY!=null)wr16(main,recordOffset+OFF.pitPickupY,clampInt(values.pitPickupY,-32768,32767,'Pit pickup top Y')&0xffff);
  if(values.pitPickupHalfWidth!=null)wr16(main,recordOffset+OFF.pitPickupHalfWidth,clampInt(values.pitPickupHalfWidth,0,32767,'Pit pickup half-width'));
  if(values.pitApproachY!=null)wr16(main,recordOffset+OFF.pitApproachY,clampInt(values.pitApproachY,-32768,32767,'Pit approach Y')&0xffff);
  if(values.flagX!=null)wr16(main,recordOffset+OFF.flagX,clampInt(values.flagX,-32768,32767,'Flag X')&0xffff);
  if(values.flagY!=null)wr16(main,recordOffset+OFF.flagY,clampInt(values.flagY,-32768,32767,'Flag Y')&0xffff);
  if(values.startX!=null)wr32(main,recordOffset+OFF.startX,Number(values.startX)>>>0);
  if(values.startY!=null)wr32(main,recordOffset+OFF.startY,Number(values.startY)>>>0);
  if(values.startOrient!=null)wr16(main,recordOffset+OFF.startOrient,clampInt(values.startOrient,-32768,32767,'Start orientation')&0xffff);
}
function writeCpuChoices(main,recordOffset,values={}){
  for(const field of CPU_CHOICES){
    if(values[field.key]==null)continue;
    wr16(main,recordOffset+field.offset,clampInt(values[field.key],0,0xFFFF,`CPU ${field.label} weight`));
  }
}
function encodeCpuChoicesBin(main,record){
  const o=record.offset??record,out=new Uint8Array(CPU_CHOICES_SIZE);
  CPU_CHOICES.forEach((field,i)=>{
    const value=be16(main,o+field.offset);
    if(value>255)throw new Error(`CPU ${field.label} weight must be 0..255`);
    out[i]=value;
  });
  return out;
}
function decodeCpuChoicesBin(bin){
  if(!(bin instanceof Uint8Array))bin=new Uint8Array(bin||[]);
  const out={};
  if(bin.length===CPU_CHOICES_SIZE){
    CPU_CHOICES.forEach((field,i)=>out[field.key]=bin[i]);
    return out;
  }
  if(bin.length===LEGACY_CPU_CHOICES_SIZE){
    CPU_CHOICES.forEach((field,i)=>{
      const value=be16(bin,i*2);
      if(value>255)throw new Error(`CPU ${field.label} weight must be 0..255`);
      out[field.key]=value;
    });
    return out;
  }
  throw new Error(`cpu_choices.bin must be ${CPU_CHOICES_SIZE} bytes`);
}
function applyCpuChoicesBin(main,record,bin){
  const values=decodeCpuChoicesBin(bin),o=record.offset??record;
  writeCpuChoices(main,o,values);
  return values;
}
function writePit(main,pitFileOffset,index,values={}){
  index=clampInt(index,0,PIT_RECORD_COUNT-1,'Pit slot');const o=pitFileOffset+index*PIT_RECORD_SIZE;
  if(values.serviceX!=null)wr32(main,o+PIT.serviceX,Number(values.serviceX)>>>0);
  if(values.serviceY!=null)wr32(main,o+PIT.serviceY,Number(values.serviceY)>>>0);
  if(values.boardX!=null)wr32(main,o+PIT.boardX,Number(values.boardX)>>>0);
  if(values.boardY!=null)wr32(main,o+PIT.boardY,Number(values.boardY)>>>0);
  if(values.screenX!=null)wr16(main,o+PIT.screenX,clampInt(values.screenX,-32768,32767,'Pit screen X')&0xffff);
  if(values.screenY!=null)wr16(main,o+PIT.screenY,clampInt(values.screenY,-32768,32767,'Pit screen Y')&0xffff);
  if(values.slotWord!=null)wr16(main,o+PIT.slotWord,clampInt(values.slotWord,-32768,32767,'Pit slot/side word')&0xffff);
}

function makeCompactBin(main,record,{hudLowerOffset=null}={}){
  const setup=parseRaceSetup(main,record),o=setup.recordOffset,out=new Uint8Array(COMPACT_SIZE);
  out.set(main.slice(o+OFF.laps,o+OFF.laps+2),COMPACT_LAYOUT.laps.offset);
  out.set(main.slice(o+OFF.flagX,o+OFF.flagX+4),COMPACT_LAYOUT.flag.offset);
  out.set(main.slice(o+OFF.startX,o+OFF.startX+10),COMPACT_LAYOUT.start.offset);
  out.set(main.slice(setup.pitFileOffset,setup.pitFileOffset+PIT_BLOCK_SIZE),COMPACT_LAYOUT.pits.offset);
  wr16(out,COMPACT_LAYOUT.pitlane.offset+0,setup.pitPickupX&0xffff);
  wr16(out,COMPACT_LAYOUT.pitlane.offset+2,setup.pitPickupY&0xffff);
  wr16(out,COMPACT_LAYOUT.pitlane.offset+4,setup.pitPickupHalfWidth);
  wr16(out,COMPACT_LAYOUT.pitlane.offset+6,setup.pitApproachY&0xffff);
  wr32(out,COMPACT_LAYOUT.routeAssignment.offset,setup.routeAssignment);
  const hudOffset=hudLowerOffset==null?getHudLowerOffset(record):clampInt(hudLowerOffset,HUD_LOWER_OFFSET_MIN,HUD_LOWER_OFFSET_MAX,'Lower HUD offset');
  wr16(out,COMPACT_LAYOUT.hudLowerOffset.offset,hudOffset);
  return out;
}
function applyCompactBin(main,record,bin,{baseline=true}={}){
  if(!(bin instanceof Uint8Array))bin=new Uint8Array(bin);
  if(bin.length!==LEGACY_COMPACT_SIZE&&bin.length!==LEGACY_COMPACT_SIZE_V70&&bin.length!==LEGACY_COMPACT_SIZE_V74&&bin.length!==COMPACT_SIZE)throw new Error(`Race setup bin must be $68 (${LEGACY_COMPACT_SIZE}), $70 (${LEGACY_COMPACT_SIZE_V70}), $74 (${LEGACY_COMPACT_SIZE_V74}) or $76 (${COMPACT_SIZE}) bytes`);
  const setup=parseRaceSetup(main,record),o=setup.recordOffset;
  const importedLaps=be16(bin,COMPACT_LAYOUT.laps.offset);
  wr16(main,o+OFF.laps,importedLaps<LAP_MIN?LAP_MIN:importedLaps);
  main.set(bin.slice(COMPACT_LAYOUT.flag.offset,COMPACT_LAYOUT.flag.offset+4),o+OFF.flagX);
  main.set(bin.slice(COMPACT_LAYOUT.start.offset,COMPACT_LAYOUT.start.offset+10),o+OFF.startX);
  main.set(bin.slice(COMPACT_LAYOUT.pits.offset,COMPACT_LAYOUT.pits.offset+PIT_BLOCK_SIZE),setup.pitFileOffset);
  if(bin.length>=LEGACY_COMPACT_SIZE_V70){
    wr16(main,o+OFF.pitPickupX,be16(bin,COMPACT_LAYOUT.pitlane.offset+0));
    wr16(main,o+OFF.pitPickupY,be16(bin,COMPACT_LAYOUT.pitlane.offset+2));
    wr16(main,o+OFF.pitPickupHalfWidth,be16(bin,COMPACT_LAYOUT.pitlane.offset+4));
    wr16(main,o+OFF.pitApproachY,be16(bin,COMPACT_LAYOUT.pitlane.offset+6));
  }
  if(bin.length>=LEGACY_COMPACT_SIZE_V74)wr32(main,o+OFF.routeAssignment,be32(bin,COMPACT_LAYOUT.routeAssignment.offset));
  const hudOffset=bin.length>=COMPACT_SIZE?be16(bin,COMPACT_LAYOUT.hudLowerOffset.offset):0;
  setHudLowerOffset(record,hudOffset,{baseline});
  return parseRaceSetup(main,record);
}
function setupFilename(record){return `indyheat_r${String(Number(record.index)).padStart(2,'0')}_setup.bin`;}
function arraysEqual(a,b){if(!a||!b||a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;}
function isSetupDirty(main,originalMain,record){return !arraysEqual(makeCompactBin(main,record),makeCompactBin(originalMain,record,{hudLowerOffset:getOriginalHudLowerOffset(record)}));}
function revertSetup(main,originalMain,record){return applyCompactBin(main,record,makeCompactBin(originalMain,record,{hudLowerOffset:getOriginalHudLowerOffset(record)}),{baseline:false});}

// $B082 / main+$A082 specialised to X/Z 16.16 with vertical input zero.
// This is the same code-derived projection already used by the waypoint editor,
// but retains the low 16 fractional bits used by race/pit setup fields.
function projectFixedXZ(xRaw,zRaw){
  xRaw=Number(xRaw)|0;zRaw=Number(zRaw)|0;
  const x6=xRaw>>10,z6=zRaw>>10;
  const denominator=0x3200+((z6*0x31)>>6);
  if(!denominator)return null;
  return {x:0x168+Math.trunc((x6*0x200)/denominator),y:0x80-Math.trunc((z6*0x140)/denominator),denominator};
}
function replaceHighWord(raw,newHigh){
  newHigh=clampInt(newHigh,-32768,32767,'Coordinate high word');
  return s32((((newHigh&0xffff)<<16)>>>0)|(Number(raw)&0xffff));
}
function mergeProjectedFixed(raw,new22_6){
  new22_6=Math.max(-0x200000,Math.min(0x1fffff,Math.round(Number(new22_6)||0)));
  // The race projection consumes signed 22.6 coordinates (raw 16.16 >> 10).
  // Keep the ten projection-invisible low bits from the existing value so a
  // drag changes only data that can affect the rendered/game position.
  return s32(((((new22_6<<10)>>>0)|(Number(raw)&0x3ff))>>>0));
}
function projectFixed22_6(x6,z6){
  x6=Math.round(Number(x6));z6=Math.round(Number(z6));  if(!Number.isFinite(x6)||!Number.isFinite(z6))return null;
  const denominator=0x3200+((z6*0x31)>>6);
  if(!denominator)return null;
  return {
    x:0x168+Math.trunc((x6*0x200)/denominator),
    y:0x80-Math.trunc((z6*0x140)/denominator),
    denominator
  };
}
function inverseFixedXZ(screenX,screenY,preferXRaw=0,preferZRaw=0){
  screenX=Number(screenX);screenY=Number(screenY);
  if(!Number.isFinite(screenX)||!Number.isFinite(screenY))return null;

  const preferX=(Number(preferXRaw)|0)>>10;
  const preferZ=(Number(preferZRaw)|0)>>10;

  // Continuous inverse gives the centre of a compact integer search. The real
  // forward path truncates several integer operations, so the search evaluates
  // the exact forward projection and picks the closest screen result.
  const dy=0x80-screenY;
  const zDen=0x140-(dy*0x31/64);
  const zEstimate=Math.abs(zDen)>1e-9?(dy*0x3200)/zDen:preferZ;

  let best=null;
  const zCentre=Math.round(Number.isFinite(zEstimate)?zEstimate:preferZ);
  for(let dz=-160;dz<=160;dz++){
    const z6=Math.max(-0x200000,Math.min(0x1fffff,zCentre+dz));
    const denominator=0x3200+((z6*0x31)>>6);
    if(!denominator)continue;
    const xEstimate=((screenX-0x168)*denominator)/0x200;
    const xCentre=Math.round(Number.isFinite(xEstimate)?xEstimate:preferX);
    for(let dx=-5;dx<=5;dx++){
      const x6=Math.max(-0x200000,Math.min(0x1fffff,xCentre+dx));
      const q=projectFixed22_6(x6,z6);if(!q)continue;
      const ex=q.x-screenX,ey=q.y-screenY,d2=ex*ex+ey*ey;
      const tie=(Math.abs(x6-preferX)+Math.abs(z6-preferZ))*1e-9;
      const score=d2+tie;
      if(!best||score<best.score)best={x6,z6,screenX:q.x,screenY:q.y,d2,score};
    }
  }
  if(!best)return null;
  return {
    ...best,
    xRaw:mergeProjectedFixed(preferXRaw,best.x6),
    zRaw:mergeProjectedFixed(preferZRaw,best.z6)
  };
}

function addFixed32(a,b){return s32((((Number(a)>>>0)+(Number(b)>>>0))>>>0));}
function gridCarPositions(setup){
  if(!setup) return [];
  const mirrorX=Number(setup.startOrient)<0;
  return GRID_CAR_OFFSETS.map((o,index)=>{
    const lx=mirrorX?-o.x:o.x;
    return {index,x:addFixed32(setup.startX,lx),y:addFixed32(setup.startY,o.y),localX:lx,localY:o.y,heading16:Number(setup.startOrient)&0xffff};
  });
}
function angle16ToCanvasRadians(angle16){return -((Number(angle16)&0xffff)*Math.PI*2/65536);}
function angle16FromWorldVector(dx,dy){
  dx=Number(dx);dy=Number(dy);if(!Number.isFinite(dx)||!Number.isFinite(dy)||(dx===0&&dy===0))return 0;
  let a=Math.atan2(dy,dx);if(a<0)a+=Math.PI*2;return Math.round(a*65536/(Math.PI*2))&0xffff;
}
function pitHeadingFromRoute(record,pit){
  const points=record?.waypointDescriptors?.[2]?.points;if(!Array.isArray(points)||points.length<2||!pit)return null;
  const px=fixedToNumber(pit.serviceX),py=fixedToNumber(pit.serviceY);let best=null;
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],ax=Number(a.x),ay=Number(a.y),bx=Number(b.x),by=Number(b.y);
    const dx=bx-ax,dy=by-ay,len2=dx*dx+dy*dy;if(!Number.isFinite(len2)||len2<=0)continue;
    const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/len2));
    const qx=ax+t*dx,qy=ay+t*dy,ex=px-qx,ey=py-qy,d2=ex*ex+ey*ey;
    if(!best||d2<best.d2)best={dx,dy,d2};
  }
  return best?angle16FromWorldVector(best.dx,best.dy):null;
}

function clampNumber(v,min,max){
  v=Number(v);if(!Number.isFinite(v))v=min;
  return Math.max(min,Math.min(max,v));
}
function screenBounds(margin=0){
  margin=Math.max(0,Number(margin)||0);
  return {minX:margin,maxX:(SCREEN_WIDTH-1)-margin,minY:margin,maxY:(SCREEN_HEIGHT-1)-margin};
}
function clampScreenPoint(x,y,bounds=screenBounds()){
  return {x:clampNumber(x,bounds.minX,bounds.maxX),y:clampNumber(y,bounds.minY,bounds.maxY)};
}
function clampProjectedPairToBounds(xRaw,zRaw,bounds=screenBounds(),iterations=4){
  let xr=Number(xRaw)|0,zr=Number(zRaw)|0,changed=false;
  for(let i=0;i<Math.max(1,Number(iterations)|0);i++){
    const q=projectFixedXZ(xr,zr);if(!q)break;
    const c=clampScreenPoint(q.x,q.y,bounds);
    if(c.x===q.x&&c.y===q.y)return {xRaw:xr,zRaw:zr,projected:q,changed};
    const inv=inverseFixedXZ(c.x,c.y,xr,zr);if(!inv)break;
    if(inv.xRaw===xr&&inv.zRaw===zr)break;
    xr=inv.xRaw;zr=inv.zRaw;changed=true;
  }
  return {xRaw:xr,zRaw:zr,projected:projectFixedXZ(xr,zr),changed};
}


const api={RUNTIME_MAIN_BASE,RACE_RECORD_SIZE,PIT_RECORD_SIZE,PIT_RECORD_COUNT,PIT_BLOCK_SIZE,LEGACY_COMPACT_SIZE,LEGACY_COMPACT_SIZE_V70,LEGACY_COMPACT_SIZE_V74,COMPACT_SIZE,HUD_LOWER_OFFSET_MIN,HUD_LOWER_OFFSET_MAX,LAP_MIN,LAP_MAX,SCREEN_WIDTH,SCREEN_HEIGHT,PIT_PICKUP_HEIGHT,RACE_POINT_MARGIN,OFF,CPU_CHOICES_OFFSET,CPU_CHOICES_SIZE,LEGACY_CPU_CHOICES_SIZE,CPU_CHOICES,PIT,COMPACT_LAYOUT,GRID_CAR_OFFSETS,
  be16,be32,s16,s32,wr16,wr32,fixedToNumber,numberToFixed,fixedText,fileOffsetFromRuntime,getHudLowerOffset,getOriginalHudLowerOffset,setHudLowerOffset,parsePitRecord,parseRaceSetup,
  writeCommon,writeCpuChoices,encodeCpuChoicesBin,decodeCpuChoicesBin,applyCpuChoicesBin,writePit,makeCompactBin,applyCompactBin,setupFilename,arraysEqual,isSetupDirty,revertSetup,projectFixedXZ,replaceHighWord,
  mergeProjectedFixed,projectFixed22_6,inverseFixedXZ,
  addFixed32,gridCarPositions,angle16ToCanvasRadians,angle16FromWorldVector,pitHeadingFromRoute,clampNumber,screenBounds,clampScreenPoint,clampProjectedPairToBounds};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.IndyHeatRaceSetupTools=api;

if(typeof document==='undefined')return;
const T=root.IndyHeatTools,C=root.IndyHeatRaceSetupCapture,EG=root.IndyHeatEditGuard;
if(!T||!C)return;
const $=id=>document.getElementById(id);
let graphics=null,active=false,currentPit=0,drag=null,hitTargets=[];
const imageCache=new Map();

function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function downloadBytes(bytes,name){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function currentRecord(){
  const records=C.records||[],model=C.model;if(!model)return null;
  for(const r of records)if(r.baseResourceId==null&&typeof T.raceBaseResourceId==='function')r.baseResourceId=T.raceBaseResourceId(r,model.resourceTableOffset+RUNTIME_MAIN_BASE);
  const ti=Number($('trackSelect')?.value||0),base=T.TRACK_BASE_IDS?.[ti];
  return records.find(r=>r.baseResourceId===base)||null;
}
function currentSetup(){const r=currentRecord();return r&&C.model?parseRaceSetup(C.model.main,r):null;}
root.IndyHeatRaceSetupState=Object.freeze({currentHudLowerOffset:()=>{const r=currentRecord();return r?getHudLowerOffset(r):0;}});
function setStatus(s){const el=$('raceSetupStatus');if(el)el.textContent=s;}
function dirty(){const r=currentRecord();const raceDirty=!!(r&&C.model&&C.originalMain&&isSetupDirty(C.model.main,C.originalMain,r));const hudDirty=!!root.IndyHeatRaceHud?.isDirty?.();return raceDirty||hudDirty;}

function ensureGraphics(){
  if(!C.model)return;
  if(root.IndyHeatRaceGraphics){
    try{graphics=root.IndyHeatRaceGraphics.attach(C.model,{resourceIds:[0x05,0x08,0x0F]});imageCache.clear();refreshPanel();draw();}catch(e){setStatus(`Race graphics unavailable: ${e.message}`);}
    return;
  }
  if(document.querySelector('script[data-indyheat-race-graphics]'))return;
  const s=document.createElement('script');s.src='indyheat_race_graphics.js';s.dataset.indyheatRaceGraphics='1';
  s.onload=()=>ensureGraphics();s.onerror=()=>setStatus('Race setup loaded, but indyheat_race_graphics.js could not be loaded.');document.head.appendChild(s);
}

function injectUi(){
  const buttons=$('layerModeButtons'),column=$('layerEditorColumn'),view=$('view');if(!buttons||!column||!view)return false;
  if($('layerEditRaceSetup'))return true;
  const style=document.createElement('style');style.textContent=`
    #layerModeButtons{grid-template-columns:repeat(3,minmax(0,1fr))!important}
    #layerModeButtons button{min-width:0}
    #layerEditRaceSetup.active{border-color:#d6b54a;background:#5a4a1c}
    #raceSetupPane[hidden]{display:none}
    #raceSetupPane{font-size:12px}
    .raceSetupGrid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px;margin:7px 0 10px}
    .raceSetupGrid label{display:grid;gap:3px;margin:0;color:#b9c0cc;font-size:11px}
    .raceSetupGrid input,.raceSetupGrid select{min-width:0;width:100%;box-sizing:border-box}
    .raceLapSliderRow{display:flex;align-items:center;gap:4px;width:100%;min-width:0;white-space:nowrap}
    .raceLapSliderRow #raceLaps{flex:1 1 auto;width:auto;max-width:none;min-width:58px;margin:0}
    .raceLapSliderValue{flex:0 0 5.5ch;min-width:5.5ch;text-align:left;white-space:nowrap;font-weight:700;color:#e3e7ec;font-variant-numeric:tabular-nums}
    .racePositionSliderRow{display:flex;align-items:center;gap:4px;width:100%;min-width:0;white-space:nowrap}
    .racePositionSliderRow input[type=range]{flex:1 1 auto;width:auto;min-width:58px;margin:0}
    .racePositionSliderValue{flex:0 0 3.5ch;min-width:3.5ch;text-align:right;white-space:nowrap;font-weight:700;color:#e3e7ec;font-variant-numeric:tabular-nums}
    .raceSetupWide{grid-column:1/-1}
    .raceSetupChecks{display:none}
    .raceSetupChecks label{margin:0;font-size:11px}
    .raceSetupActions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:7px 0}
    .raceSetupActions button{font-size:11px;padding:6px}
    #raceSetupStatus{font-size:11px;line-height:1.4;min-height:48px;margin-top:8px;white-space:pre-line}
    #raceSetupCanvas{position:absolute;inset:0;z-index:3;display:block;image-rendering:pixelated;touch-action:none;user-select:none;pointer-events:none}
    #raceSetupCanvas.editing{pointer-events:auto;cursor:grab}
    #raceSetupCanvas.dragging{cursor:grabbing}
  `;document.head.appendChild(style);
  const mode=document.createElement('button');mode.id='layerEditRaceSetup';mode.type='button';mode.textContent='Race';buttons.appendChild(mode);
  const pane=document.createElement('div');pane.id='raceSetupPane';pane.hidden=true;pane.innerHTML=`
    <div class="toolGroup"><div class="toolGroupTitle">Race setup</div>
      <div class="raceSetupChecks" aria-hidden="true">
        <label><input id="raceShowStart" type="checkbox" checked> Start grid</label>
        <label><input id="raceShowPitlaneZone" type="checkbox" checked> Pit pickup zone</label>
        <label><input id="raceShowPitApproach" type="checkbox" checked> Pit approach</label>
        <label><input id="raceShowPits" type="checkbox" checked> Pit service positions</label>
        <label><input id="raceShowPitCrew" type="checkbox" checked> Pit crews</label>
        <label><input id="raceShowBoards" type="checkbox" checked> PIT boards</label>
        <label><input id="raceShowFlag" type="checkbox" checked> Flag man</label>
        <label><input id="raceShowGridCars" type="checkbox"> Cars on grid</label>
        <label><input id="raceShowPitCars" type="checkbox"> Cars in pits</label>
      </div>
      <div class="raceSetupGrid">
        <label>Laps <span class="raceLapSliderRow"><input id="raceLaps" type="range" min="2" max="20" step="1" title="Authored custom range: 2–20"><output id="raceLapsSliderValue" class="raceLapSliderValue" for="raceLaps">2 laps</output></span></label>
        <label>Lower HUD <span class="raceLapSliderRow"><input id="raceHudLowerOffset" type="range" min="0" max="12" step="1" title="Moves the live lower HUD graphics down by 0–12 pixels; HUD Panels uses the same offset when placing the three Backdrop panels."><output id="raceHudLowerOffsetValue" class="raceLapSliderValue" for="raceHudLowerOffset">0 px</output></span></label>
        <label>Start orient <input id="raceStartOrient" type="number" min="-32768" max="32767" step="1"></label>
        <input id="raceFlagX" type="hidden"><input id="raceFlagY" type="hidden"><input id="raceStartX" type="hidden"><input id="raceStartY" type="hidden">
        <label>Flag X <span class="racePositionSliderRow"><input id="raceFlagXSlider" type="range" min="0" max="319" step="1"><output id="raceFlagXValue" class="racePositionSliderValue" for="raceFlagXSlider">0</output></span></label>
        <label>Flag Y <span class="racePositionSliderRow"><input id="raceFlagYSlider" type="range" min="0" max="255" step="1"><output id="raceFlagYValue" class="racePositionSliderValue" for="raceFlagYSlider">0</output></span></label>
        <label>Grid X <span class="racePositionSliderRow"><input id="raceStartXSlider" type="range" min="0" max="319" step="1"><output id="raceStartXValue" class="racePositionSliderValue" for="raceStartXSlider">0</output></span></label>
        <label>Grid Y <span class="racePositionSliderRow"><input id="raceStartYSlider" type="range" min="0" max="255" step="1"><output id="raceStartYValue" class="racePositionSliderValue" for="raceStartYSlider">0</output></span></label>
      </div>
      <div class="toolGroupTitle">Pitlane</div>
      <div class="raceSetupGrid">
        <input id="racePitPickupX" type="hidden"><input id="racePitPickupY" type="hidden"><input id="racePitPickupHalfWidth" type="hidden"><input id="racePitApproachY" type="hidden">
        <label>Pickup centre X <span class="racePositionSliderRow"><input id="racePitPickupXSlider" type="range" min="0" max="319" step="1"><output id="racePitPickupXValue" class="racePositionSliderValue" for="racePitPickupXSlider">0</output></span></label>
        <label>Pickup top Y <span class="racePositionSliderRow"><input id="racePitPickupYSlider" type="range" min="0" max="226" step="1"><output id="racePitPickupYValue" class="racePositionSliderValue" for="racePitPickupYSlider">0</output></span></label>
        <label>Pickup half-width <span class="racePositionSliderRow"><input id="racePitPickupHalfWidthSlider" type="range" min="0" max="159" step="1"><output id="racePitPickupHalfWidthValue" class="racePositionSliderValue" for="racePitPickupHalfWidthSlider">0</output></span></label>
        <label>Pit approach Y <span class="racePositionSliderRow"><input id="racePitApproachYSlider" type="range" min="6" max="249" step="1"><output id="racePitApproachYValue" class="racePositionSliderValue" for="racePitApproachYSlider">0</output></span></label>
      </div>
      <div class="toolGroupTitle">Pit slot</div>
      <div class="raceSetupGrid">
        <label class="raceSetupWide">Slot <select id="racePitSlot"><option value="0">Pit 1</option><option value="1">Pit 2</option><option value="2">Pit 3</option><option value="3">Pit 4</option></select></label>
        <input id="raceServiceX" type="hidden"><input id="raceServiceY" type="hidden"><input id="raceBoardX" type="hidden"><input id="raceBoardY" type="hidden"><input id="raceScreenX" type="hidden"><input id="raceScreenY" type="hidden">
        <label>Pit box X <span class="racePositionSliderRow"><input id="raceServiceXSlider" type="range" min="6" max="313" step="1"><output id="raceServiceXValue" class="racePositionSliderValue" for="raceServiceXSlider">0</output></span></label>
        <label>Pit box Y <span class="racePositionSliderRow"><input id="raceServiceYSlider" type="range" min="6" max="249" step="1"><output id="raceServiceYValue" class="racePositionSliderValue" for="raceServiceYSlider">0</output></span></label>
        <label>PIT board X <span class="racePositionSliderRow"><input id="raceBoardXSlider" type="range" min="0" max="319" step="1"><output id="raceBoardXValue" class="racePositionSliderValue" for="raceBoardXSlider">0</output></span></label>
        <label>PIT board Y <span class="racePositionSliderRow"><input id="raceBoardYSlider" type="range" min="0" max="255" step="1"><output id="raceBoardYValue" class="racePositionSliderValue" for="raceBoardYSlider">0</output></span></label>
        <label>Pit crew X <span class="racePositionSliderRow"><input id="raceScreenXSlider" type="range" min="0" max="319" step="1"><output id="raceScreenXValue" class="racePositionSliderValue" for="raceScreenXSlider">0</output></span></label>
        <label>Pit crew Y <span class="racePositionSliderRow"><input id="raceScreenYSlider" type="range" min="0" max="255" step="1"><output id="raceScreenYValue" class="racePositionSliderValue" for="raceScreenYSlider">0</output></span></label>
        <label class="raceSetupWide">Slot / side word <input id="raceSlotWord" type="number" min="-32768" max="32767" step="1"></label>
      </div>
      <button id="raceApply" type="button" hidden aria-hidden="true" tabindex="-1">Apply fields</button>
      <div id="raceCompareCopy" class="raceSetupActions"><button id="raceCopyPitsA" type="button" disabled>Copy A pits</button><button id="raceCopyPitsB" type="button" disabled>Copy B pits</button></div>
      <div class="raceSetupActions"><button id="raceRevert" type="button">Revert setup</button><span></span></div>
      <div class="raceSetupActions"><button id="raceExport" type="button">Export setup .bin</button><button id="raceExportAll" type="button">Export all setup .bins</button></div>
      <div class="raceSetupActions"><button id="raceExportMain" type="button">Modified main .bin</button><span></span></div>
      <div id="raceSetupStatus" class="muted">Race setup data is loading.</div>
    </div>`;
  const drawing=$('layerDrawingPane'),waypointHost=$('layerWaypointHost');column.insertBefore(pane,drawing||waypointHost||null);
  const stack=view.closest('.canvasStack')||view.parentElement;const cv=document.createElement('canvas');cv.id='raceSetupCanvas';stack.appendChild(cv);
  mode.addEventListener('click',activate);
  ['layerModeWaypoints','layerEditSurface','layerEditMask','layerEditRecovery','layerEditBackdrop'].forEach(id=>$(id)?.addEventListener('click',()=>{if(active)deactivate();}));
  $('raceLaps').addEventListener('input',commitLapSlider);
  $('raceHudLowerOffset').addEventListener('input',commitHudLowerOffsetSlider);
  $('racePitSlot').addEventListener('change',e=>{currentPit=Number(e.target.value)||0;const finish=()=>{refreshPanel();draw();};if(EG)EG.frame('race-pit-slot',finish);else requestAnimationFrame(finish);});
  $('raceCopyPitsA').addEventListener('click',()=>copyPitsFromCompare('A'));
  $('raceCopyPitsB').addEventListener('click',()=>copyPitsFromCompare('B'));
  document.addEventListener('indyheat-circuit-compare-changed',syncRaceCompareCopyButtons);
  document.addEventListener('indyheat-race-setup-updated',()=>{const finish=()=>{refreshPanel();draw();};if(EG)EG.frame('race-external-update',finish);else requestAnimationFrame(finish);});
  ['raceShowStart','raceShowPitlaneZone','raceShowPitApproach','raceShowPits','raceShowPitCrew','raceShowBoards','raceShowFlag','raceShowGridCars','raceShowPitCars'].forEach(id=>$(id)?.addEventListener('change',draw));
  ['raceStartOrient','raceSlotWord'].forEach(id=>$(id)?.addEventListener('input',commitPanelField));
  ['raceFlagXSlider','raceFlagYSlider','raceStartXSlider','raceStartYSlider','racePitPickupXSlider','racePitPickupYSlider','racePitPickupHalfWidthSlider','racePitApproachYSlider','raceServiceXSlider','raceServiceYSlider','raceBoardXSlider','raceBoardYSlider','raceScreenXSlider','raceScreenYSlider'].forEach(id=>$(id)?.addEventListener('input',commitPositionSlider));
  // Hidden compatibility hook for older internal helpers; users no longer need an Apply step.
  $('raceApply').addEventListener('click',applyPanel);
  $('raceRevert').addEventListener('click',()=>{const r=currentRecord();if(!r||!C.model||!C.originalMain)return;revertSetup(C.model.main,C.originalMain,r);root.IndyHeatRaceHud?.revertCurrent?.();refreshPanel();draw();setStatus('Selected circuit race setup and HUD position restored to the loaded Disk.1 data.');});
  $('raceExport').addEventListener('click',()=>{const r=currentRecord();if(!r||!C.model)return;const b=makeCompactBin(C.model.main,r);downloadBytes(b,setupFilename(r));setStatus(`Exported ${setupFilename(r)} · ${b.length} bytes ($76).\nLayout: laps 2 · flag 4 · start 10 · pits 88 · Pitlane controls 8 · Route A/B assignment 4 · Lower HUD offset 2.`);});
  $('raceExportAll').addEventListener('click',()=>{if(!C.model||!C.records)return;const seen=new Set(),out=[];for(const base of T.TRACK_BASE_IDS||[]){const r=C.records.find(q=>q.baseResourceId===base);if(!r||seen.has(r.index))continue;seen.add(r.index);downloadBytes(makeCompactBin(C.model.main,r),setupFilename(r));out.push(setupFilename(r));}setStatus(`Exported ${out.length} circuit setup files · ${out.length*COMPACT_SIZE} bytes total.\nEach file is an independent $76 authored race setup.`);});
  $('raceExportMain').addEventListener('click',()=>{if(C.model){const v=String(root.INDY_HEAT_EDITOR_VERSION||'').replace(/\./g,'');downloadBytes(C.model.main,`indyheat_main_modified_v${v}.bin`);}});
  cv.addEventListener('pointerdown',pointerDown);cv.addEventListener('pointermove',pointerMove);cv.addEventListener('pointerup',pointerUp);cv.addEventListener('pointercancel',pointerUp);cv.addEventListener('contextmenu',e=>{if(active)e.preventDefault();});
  $('trackSelect')?.addEventListener('change',()=>setTimeout(()=>{currentPit=0;refreshPanel();draw();},0));
  $('editorScale')?.addEventListener('change',()=>setTimeout(draw,0));$('opacity')?.addEventListener('input',draw);
  document.addEventListener('indyheat-race-setup-capture',()=>setTimeout(()=>{ensureGraphics();refreshPanel();draw();},0));
  document.addEventListener('indyheat-edit-finished',e=>{const control=e.detail?.control;if(control&&$('raceSetupPane')?.contains(control)){constrainRacePositions();const finish=()=>{refreshPanel();draw();};if(EG)EG.frame('race-edit-finished',finish);else requestAnimationFrame(finish);}});
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>draw()).observe(view);
  return true;
}

function viewCanvas(){return $('view');}function overlayCanvas(){return $('raceSetupCanvas');}
function syncSize(){const v=viewCanvas(),c=overlayCanvas();if(!v||!c)return;if(c.width!==v.width||c.height!==v.height){c.width=v.width;c.height=v.height;c.getContext('2d').imageSmoothingEnabled=false;}}
function activate(){
  if(active){draw();return;}
  $('layerModeWaypoints')?.click();
  const buttons=$('layerModeButtons');buttons?.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
  active=true;$('layerEditRaceSetup')?.classList.add('active');$('raceSetupPane').hidden=false;$('layerDrawingPane')&&( $('layerDrawingPane').hidden=true );$('layerWaypointHost')&&( $('layerWaypointHost').hidden=true );
  const c=overlayCanvas();c?.classList.add('editing');refreshPanel();draw();
}
function deactivate(){active=false;drag=null;$('layerEditRaceSetup')?.classList.remove('active');$('raceSetupPane').hidden=true;const c=overlayCanvas();c?.classList.remove('editing','dragging');draw();}

function syncHudLowerOffsetReadout(){
  const input=$('raceHudLowerOffset'),out=$('raceHudLowerOffsetValue');if(!input||!out)return false;
  let value=Math.round(Number(input.value));if(!Number.isFinite(value))value=0;value=Math.max(HUD_LOWER_OFFSET_MIN,Math.min(HUD_LOWER_OFFSET_MAX,value));
  const label=`${value} px`;out.value=label;out.textContent=label;out.setAttribute('aria-label',label);return true;
}
function commitHudLowerOffsetSlider(){
  if(!syncHudLowerOffsetReadout())return false;
  const input=$('raceHudLowerOffset'),r=currentRecord();if(!input||!r)return false;
  try{
    const value=setHudLowerOffset(r,Math.round(Number(input.value)),{baseline:false}),d=dirty(),revert=$('raceRevert');
    if(revert)revert.disabled=!d;
    document.dispatchEvent(new CustomEvent('indyheat-hud-lower-offset-changed',{detail:{offset:value,recordIndex:r.index}}));
    setStatus(`${r.name||`Race ${r.index}`} · ${d?'Modified':'Unmodified'} · lower HUD +${value} px. HUD Panels places at Y ${212+value}.`);
    return true;
  }catch(e){setStatus(`ERROR: ${e.message}`);return false;}
}
function syncLapReadout(){
  const input=$('raceLaps'),out=$('raceLapsSliderValue');if(!input||!out)return false;
  let value=Math.round(Number(input.value));if(!Number.isFinite(value))value=2;value=Math.max(2,Math.min(20,value));
  const text=`${value} laps`;out.value=text;out.textContent=text;out.setAttribute('aria-label',text);return true;
}
function commitLapSlider(){
  if(!syncLapReadout())return false;
  const input=$('raceLaps'),r=currentRecord();if(!input||!r||!C.model)return false;
  const value=Math.round(Number(input.value));
  if(!Number.isInteger(value)||value<LAP_MIN||value>LAP_MAX)return false;
  try{
    // Keep the authored race record in step with the thumb while it is moving.
    // refreshPanel() can therefore run at any time without snapping the control
    // back to the value that existed before the drag started.
    writeCommon(C.model.main,r.offset,{laps:value});
    const revert=$('raceRevert');if(revert)revert.disabled=!dirty();
    const finish=()=>draw();if(EG)EG.frame('race-lap-live',finish);else finish();return true;
  }catch(e){setStatus(`ERROR: ${e.message}`);return false;}
}

function setCompatValue(id,value){
  const el=$(id);if(!el)return;
  const next=String(value??'');if(el.value!==next)el.value=next;
}
function sliderOutputId(sliderId){return String(sliderId||'').replace(/Slider$/,'Value');}
function setPositionSlider(sliderId,value,min,max){
  const input=$(sliderId),out=$(sliderOutputId(sliderId));if(!input)return;
  min=Math.ceil(Number(min));max=Math.floor(Number(max));if(!Number.isFinite(min)||!Number.isFinite(max)||min>max){min=0;max=0;}
  const active=!!EG?.editing?.(input);
  if(!active){input.min=String(min);input.max=String(max);}
  let v=Math.round(Number(value));if(!Number.isFinite(v))v=min;v=Math.max(min,Math.min(max,v));
  if(active){const live=Math.round(Number(input.value));if(Number.isFinite(live))v=live;}
  else if(EG)EG.setValue(input,v);else input.value=String(v);
  if(out){out.value=String(v);out.textContent=String(v);out.setAttribute('aria-label',String(v));}
}
function gridAnchorScreenBounds(setup){
  const fallback=screenBounds(RACE_POINT_MARGIN),origin=projectFixedXZ(setup?.startX,setup?.startY);if(!origin)return fallback;
  const qs=[origin,...gridCarPositions(setup).map(c=>projectFixedXZ(c.x,c.y)).filter(Boolean)];if(!qs.length)return fallback;
  const minDx=Math.min(...qs.map(q=>q.x-origin.x)),maxDx=Math.max(...qs.map(q=>q.x-origin.x));
  const minDy=Math.min(...qs.map(q=>q.y-origin.y)),maxDy=Math.max(...qs.map(q=>q.y-origin.y));
  const b={
    minX:Math.ceil(RACE_POINT_MARGIN-minDx),maxX:Math.floor((SCREEN_WIDTH-1-RACE_POINT_MARGIN)-maxDx),
    minY:Math.ceil(RACE_POINT_MARGIN-minDy),maxY:Math.floor((SCREEN_HEIGHT-1-RACE_POINT_MARGIN)-maxDy)
  };
  return b.minX<=b.maxX&&b.minY<=b.maxY?b:fallback;
}
function pitApproachScreenY(setup,pit){
  if(!setup||!pit)return null;
  const xRaw=s16((Number(pit.serviceX)>>>16)&0xffff)<<16,zRaw=Number(setup.pitApproachY)<<16,q=projectFixedXZ(xRaw,zRaw);
  return q?.y??null;
}
function syncCompatibilityPositionFields(setup){
  if(!setup)return;
  setCompatValue('racePitPickupX',setup.pitPickupX);setCompatValue('racePitPickupY',setup.pitPickupY);setCompatValue('racePitPickupHalfWidth',setup.pitPickupHalfWidth);setCompatValue('racePitApproachY',setup.pitApproachY);
  setCompatValue('raceFlagX',setup.flagX);setCompatValue('raceFlagY',setup.flagY);setCompatValue('raceStartX',fixedText(setup.startX));setCompatValue('raceStartY',fixedText(setup.startY));
  const pit=setup.pits?.[currentPit];if(!pit)return;
  setCompatValue('raceServiceX',fixedText(pit.serviceX));setCompatValue('raceServiceY',fixedText(pit.serviceY));setCompatValue('raceBoardX',fixedText(pit.boardX));setCompatValue('raceBoardY',fixedText(pit.boardY));setCompatValue('raceScreenX',pit.screenX);setCompatValue('raceScreenY',pit.screenY);
}
function syncPositionSliders(setup){
  if(!setup)return;
  const pit=setup.pits?.[currentPit]||setup.pits?.[0];if(!pit)return;
  const flagBounds=spriteAnchorBounds(0x0F,26,0);
  setPositionSlider('raceFlagXSlider',setup.flagX,flagBounds.minX,flagBounds.maxX);setPositionSlider('raceFlagYSlider',setup.flagY,flagBounds.minY,flagBounds.maxY);
  const grid=projectFixedXZ(setup.startX,setup.startY),gridBounds=gridAnchorScreenBounds(setup);
  setPositionSlider('raceStartXSlider',grid?.x,gridBounds.minX,gridBounds.maxX);setPositionSlider('raceStartYSlider',grid?.y,gridBounds.minY,gridBounds.maxY);
  const hw=Math.max(0,Math.min(159,Math.round(Number(setup.pitPickupHalfWidth)||0))),pickupMinX=hw,pickupMaxX=(SCREEN_WIDTH-1)-hw;
  setPositionSlider('racePitPickupXSlider',setup.pitPickupX,pickupMinX,pickupMaxX);setPositionSlider('racePitPickupYSlider',setup.pitPickupY,0,SCREEN_HEIGHT-PIT_PICKUP_HEIGHT);
  const halfMax=Math.max(0,Math.min(159,Math.round(Math.min(Number(setup.pitPickupX)||0,(SCREEN_WIDTH-1)-(Number(setup.pitPickupX)||0)))));
  setPositionSlider('racePitPickupHalfWidthSlider',setup.pitPickupHalfWidth,0,halfMax);
  setPositionSlider('racePitApproachYSlider',pitApproachScreenY(setup,pit),RACE_POINT_MARGIN,(SCREEN_HEIGHT-1)-RACE_POINT_MARGIN);
  const service=projectFixedXZ(pit.serviceX,pit.serviceY),serviceBounds=screenBounds(RACE_POINT_MARGIN);
  setPositionSlider('raceServiceXSlider',service?.x,serviceBounds.minX,serviceBounds.maxX);setPositionSlider('raceServiceYSlider',service?.y,serviceBounds.minY,serviceBounds.maxY);
  const board=projectFixedXZ(pit.boardX,pit.boardY),boardBounds=spriteFamilyAnchorBounds(0x08,pit.index*16,16,0);
  setPositionSlider('raceBoardXSlider',board?.x,boardBounds.minX,boardBounds.maxX);setPositionSlider('raceBoardYSlider',board?.y,boardBounds.minY,boardBounds.maxY);
  const crewBounds=spriteFamilyAnchorBounds(0x05,pit.index*76,76,0);
  setPositionSlider('raceScreenXSlider',pit.screenX,crewBounds.minX,crewBounds.maxX);setPositionSlider('raceScreenYSlider',pit.screenY,crewBounds.minY,crewBounds.maxY);
}
function sliderNumber(id,fallback=0){const el=$(id),n=Number(el?.value);return Number.isFinite(n)?Math.round(n):Math.round(Number(fallback)||0);}
function commitPositionSlider(e){
  const input=e?.target,r=currentRecord(),s=currentSetup();if(!input||!r||!s||!C.model)return;
  const pit=s.pits?.[currentPit]||s.pits?.[0];if(!pit)return;
  try{
    const id=input.id;
    if(id==='raceFlagXSlider'||id==='raceFlagYSlider'){
      writeCommon(C.model.main,r.offset,{flagX:sliderNumber('raceFlagXSlider',s.flagX),flagY:sliderNumber('raceFlagYSlider',s.flagY)});
    }else if(id==='racePitPickupXSlider'||id==='racePitPickupYSlider'||id==='racePitPickupHalfWidthSlider'){
      writeCommon(C.model.main,r.offset,{pitPickupX:sliderNumber('racePitPickupXSlider',s.pitPickupX),pitPickupY:sliderNumber('racePitPickupYSlider',s.pitPickupY),pitPickupHalfWidth:sliderNumber('racePitPickupHalfWidthSlider',s.pitPickupHalfWidth)});
    }else if(id==='raceStartXSlider'||id==='raceStartYSlider'){
      const q=projectFixedXZ(s.startX,s.startY);if(!q)return;
      const inv=inverseFixedXZ(sliderNumber('raceStartXSlider',q.x),sliderNumber('raceStartYSlider',q.y),s.startX,s.startY);if(!inv)return;
      writeCommon(C.model.main,r.offset,{startX:inv.xRaw,startY:inv.zRaw});
    }else if(id==='racePitApproachYSlider'){
      const xRaw=s16((Number(pit.serviceX)>>>16)&0xffff)<<16,preferY=Number(s.pitApproachY)<<16,q=projectFixedXZ(xRaw,preferY);if(!q)return;
      const inv=inverseFixedXZ(q.x,sliderNumber('racePitApproachYSlider',q.y),xRaw,preferY);if(!inv)return;
      writeCommon(C.model.main,r.offset,{pitApproachY:s16((Number(inv.zRaw)>>>16)&0xffff)});
    }else if(id==='raceServiceXSlider'||id==='raceServiceYSlider'){
      const q=projectFixedXZ(pit.serviceX,pit.serviceY);if(!q)return;
      const inv=inverseFixedXZ(sliderNumber('raceServiceXSlider',q.x),sliderNumber('raceServiceYSlider',q.y),pit.serviceX,pit.serviceY);if(!inv)return;
      writePit(C.model.main,s.pitFileOffset,currentPit,{serviceX:inv.xRaw,serviceY:inv.zRaw});
    }else if(id==='raceBoardXSlider'||id==='raceBoardYSlider'){
      const q=projectFixedXZ(pit.boardX,pit.boardY);if(!q)return;
      const inv=inverseFixedXZ(sliderNumber('raceBoardXSlider',q.x),sliderNumber('raceBoardYSlider',q.y),pit.boardX,pit.boardY);if(!inv)return;
      writePit(C.model.main,s.pitFileOffset,currentPit,{boardX:inv.xRaw,boardY:inv.zRaw});
    }else if(id==='raceScreenXSlider'||id==='raceScreenYSlider'){
      writePit(C.model.main,s.pitFileOffset,currentPit,{screenX:sliderNumber('raceScreenXSlider',pit.screenX),screenY:sliderNumber('raceScreenYSlider',pit.screenY)});
    }else return;
    const latest=currentSetup();syncCompatibilityPositionFields(latest);syncPositionSliders(latest);
    const d=dirty(),revert=$('raceRevert');if(revert)revert.disabled=!d;
    const finish=()=>{draw();setStatus(`${latest?.name||s.name||`Race ${s.recordIndex}`} · ${d?'Modified':'Unmodified'} · position changes are live.`);};
    if(EG)EG.frame('race-position-slider',finish);else finish();
  }catch(err){setStatus(`ERROR: ${err.message}`);}
}

function refreshPanel(){
  const r=currentRecord(),s=currentSetup();if(!s||!r){setStatus('Race setup data is not available for this circuit yet.');return;}
  const put=(id,value)=>{const el=$(id);if(!el)return;if(EG)EG.setValue(el,value);else el.value=String(value??'');};
  put('raceLaps',s.laps);syncLapReadout();put('raceHudLowerOffset',s.hudLowerOffset);syncHudLowerOffsetReadout();put('racePitPickupX',s.pitPickupX);put('racePitPickupY',s.pitPickupY);put('racePitPickupHalfWidth',s.pitPickupHalfWidth);put('racePitApproachY',s.pitApproachY);put('raceFlagX',s.flagX);put('raceFlagY',s.flagY);put('raceStartX',fixedText(s.startX));put('raceStartY',fixedText(s.startY));put('raceStartOrient',s.startOrient);
  currentPit=Math.max(0,Math.min(3,currentPit));put('racePitSlot',currentPit);const p=s.pits[currentPit];
  put('raceServiceX',fixedText(p.serviceX));put('raceServiceY',fixedText(p.serviceY));put('raceBoardX',fixedText(p.boardX));put('raceBoardY',fixedText(p.boardY));put('raceScreenX',p.screenX);put('raceScreenY',p.screenY);put('raceSlotWord',p.slotWord);
  syncCompatibilityPositionFields(s);syncPositionSliders(s);
  const d=dirty();
  setStatus(`${s.name||`Race ${s.recordIndex}`} · race record ${s.recordIndex} · pit block $${s.pitPointer.toString(16).toUpperCase()}
${d?'Modified':'Unmodified'} · compact export ${COMPACT_SIZE} bytes ($76) · Lower HUD +${s.hudLowerOffset} px. Drag visible anchors or edit fields.`);
  $('raceRevert').disabled=!d;syncRaceCompareCopyButtons();
}
function syncRaceCompareCopyButtons(){
  const api=root.IndyHeatCircuitCompare;
  for(const slot of ['A','B']){
    const b=$(`raceCopyPits${slot}`),q=api?.getSlot?.(slot);if(!b)continue;
    b.disabled=!q?.raceSetupBin||!!api?.isCurrent?.(slot);
  }
}
function copyPitsFromCompare(slot){
  const api=root.IndyHeatCircuitCompare,q=api?.getSlot?.(slot),r=currentRecord();
  try{
    if(!q?.raceSetupBin)throw new Error(`Comparison ${slot} has no race/pit data. Use Set ${slot} on the source circuit first.`);
    if(api?.isCurrent?.(slot))throw new Error(`Comparison ${slot} is the current circuit.`);
    if(!r||!C.model)throw new Error('Race setup data is unavailable for the current circuit.');
    const src=q.raceSetupBin;
    if(src.length!==LEGACY_COMPACT_SIZE&&src.length!==LEGACY_COMPACT_SIZE_V70&&src.length!==LEGACY_COMPACT_SIZE_V74&&src.length!==COMPACT_SIZE)throw new Error('Comparison pit data has an unsupported race setup size.');
    const merged=makeCompactBin(C.model.main,r);
    merged.set(src.slice(COMPACT_LAYOUT.pits.offset,COMPACT_LAYOUT.pits.offset+COMPACT_LAYOUT.pits.length),COMPACT_LAYOUT.pits.offset);
    if(src.length>=LEGACY_COMPACT_SIZE_V70)merged.set(src.slice(COMPACT_LAYOUT.pitlane.offset,COMPACT_LAYOUT.pitlane.offset+COMPACT_LAYOUT.pitlane.length),COMPACT_LAYOUT.pitlane.offset);
    applyCompactBin(C.model.main,r,merged,{baseline:false});currentPit=0;
    const finish=()=>{refreshPanel();draw();setStatus(`Copied all pit/service, crew, board and pitlane data from ${slot} · ${q.label}.`);};
    if(EG)EG.frame('copy-compare-pits',finish);else finish();
  }catch(e){setStatus(`ERROR: ${e.message}`);}
  syncRaceCompareCopyButtons();
}


function spriteAnchorBounds(resourceId,frameIndex,fallbackMargin=0){
  const fallback=screenBounds(fallbackMargin),frame=graphics?.getFrame?.(resourceId,frameIndex);
  if(!frame)return fallback;
  const minX=Math.max(0,Math.ceil(Number(frame.xOrigin)||0)+fallbackMargin);
  const minY=Math.max(0,Math.ceil(Number(frame.yOrigin)||0)+fallbackMargin);
  const maxX=Math.min(SCREEN_WIDTH-1,Math.floor(SCREEN_WIDTH-Number(frame.width||0)+Number(frame.xOrigin||0)-fallbackMargin));
  const maxY=Math.min(SCREEN_HEIGHT-1,Math.floor(SCREEN_HEIGHT-Number(frame.height||0)+Number(frame.yOrigin||0)-fallbackMargin));
  return (minX<=maxX&&minY<=maxY)?{minX,maxX,minY,maxY}:fallback;
}
function spriteFamilyAnchorBounds(resourceId,start,count,fallbackMargin=0){
  const fallback=screenBounds(fallbackMargin);let minX=fallback.minX,minY=fallback.minY,maxX=fallback.maxX,maxY=fallback.maxY,found=false;
  for(let i=0;i<count;i++){
    const frame=graphics?.getFrame?.(resourceId,start+i);if(!frame)continue;found=true;
    minX=Math.max(minX,Math.ceil(Number(frame.xOrigin)||0)+fallbackMargin);
    minY=Math.max(minY,Math.ceil(Number(frame.yOrigin)||0)+fallbackMargin);
    maxX=Math.min(maxX,Math.floor(SCREEN_WIDTH-Number(frame.width||0)+Number(frame.xOrigin||0)-fallbackMargin));
    maxY=Math.min(maxY,Math.floor(SCREEN_HEIGHT-Number(frame.height||0)+Number(frame.yOrigin||0)-fallbackMargin));
  }
  return (found&&minX<=maxX&&minY<=maxY)?{minX,maxX,minY,maxY}:fallback;
}
function writeProjectedInside(pitFileOffset,index,kind,xRaw,zRaw,bounds){
  const safe=clampProjectedPairToBounds(xRaw,zRaw,bounds);
  if(kind==='start'){
    const r=currentRecord();if(r&&C.model)writeCommon(C.model.main,r.offset,{startX:safe.xRaw,startY:safe.zRaw});
  }else if(kind==='service')writePit(C.model.main,pitFileOffset,index,{serviceX:safe.xRaw,serviceY:safe.zRaw});
  else if(kind==='board')writePit(C.model.main,pitFileOffset,index,{boardX:safe.xRaw,boardY:safe.zRaw});
  return safe.changed;
}
function constrainStartGrid(setup){
  let xRaw=setup.startX,zRaw=setup.startY,changed=false;
  for(let pass=0;pass<4;pass++){
    const origin=projectFixedXZ(xRaw,zRaw);if(!origin)break;
    const temp={...setup,startX:xRaw,startY:zRaw};
    const qs=[origin,...gridCarPositions(temp).map(c=>projectFixedXZ(c.x,c.y)).filter(Boolean)];
    if(!qs.length)break;
    const b=screenBounds(RACE_POINT_MARGIN),minX=Math.min(...qs.map(q=>q.x)),maxX=Math.max(...qs.map(q=>q.x)),minY=Math.min(...qs.map(q=>q.y)),maxY=Math.max(...qs.map(q=>q.y));
    let dx=0,dy=0;
    if(minX<b.minX)dx=b.minX-minX;else if(maxX>b.maxX)dx=b.maxX-maxX;
    if(minY<b.minY)dy=b.minY-minY;else if(maxY>b.maxY)dy=b.maxY-maxY;
    if(!dx&&!dy)break;
    const inv=inverseFixedXZ(origin.x+dx,origin.y+dy,xRaw,zRaw);if(!inv)break;
    xRaw=inv.xRaw;zRaw=inv.zRaw;changed=true;
  }
  if(changed){const r=currentRecord();if(r&&C.model)writeCommon(C.model.main,r.offset,{startX:xRaw,startY:zRaw});}
  return changed;
}
function constrainPitPickup(setup){
  const r=currentRecord();if(!r||!C.model)return false;
  let x=Math.round(Number(setup.pitPickupX)||0),y=Math.round(Number(setup.pitPickupY)||0),hw=Math.round(Number(setup.pitPickupHalfWidth)||0);
  hw=Math.max(0,Math.min(159,hw));
  x=Math.round(clampNumber(x,hw,(SCREEN_WIDTH-1)-hw));
  y=Math.round(clampNumber(y,0,SCREEN_HEIGHT-PIT_PICKUP_HEIGHT));
  const changed=x!==setup.pitPickupX||y!==setup.pitPickupY||hw!==setup.pitPickupHalfWidth;
  if(changed)writeCommon(C.model.main,r.offset,{pitPickupX:x,pitPickupY:y,pitPickupHalfWidth:hw});
  return changed;
}
function constrainPitApproach(setup){
  const r=currentRecord(),pit=setup.pits[currentPit]||setup.pits[0];if(!r||!pit||!C.model)return false;
  const xRaw=s16((Number(pit.serviceX)>>>16)&0xffff)<<16,zRaw=setup.pitApproachY<<16,q=projectFixedXZ(xRaw,zRaw);if(!q)return false;
  const targetY=clampNumber(q.y,RACE_POINT_MARGIN,(SCREEN_HEIGHT-1)-RACE_POINT_MARGIN);if(targetY===q.y)return false;
  const inv=inverseFixedXZ(q.x,targetY,xRaw,zRaw);if(!inv)return false;
  const value=s16((Number(inv.zRaw)>>>16)&0xffff);if(value===setup.pitApproachY)return false;
  writeCommon(C.model.main,r.offset,{pitApproachY:value});return true;
}
function constrainRacePositions(){
  const r=currentRecord(),s=currentSetup();if(!r||!s||!C.model)return false;
  let changed=false;
  changed=constrainPitPickup(s)||changed;
  changed=constrainStartGrid(currentSetup()||s)||changed;
  let now=currentSetup()||s;
  const flagBounds=spriteAnchorBounds(0x0F,26,0),flag=clampScreenPoint(now.flagX,now.flagY,flagBounds);
  if(flag.x!==now.flagX||flag.y!==now.flagY){writeCommon(C.model.main,r.offset,{flagX:Math.round(flag.x),flagY:Math.round(flag.y)});changed=true;}
  now=currentSetup()||now;
  changed=constrainPitApproach(now)||changed;
  now=currentSetup()||now;
  const serviceBounds=screenBounds(RACE_POINT_MARGIN);
  for(const pit of now.pits){
    changed=writeProjectedInside(now.pitFileOffset,pit.index,'service',pit.serviceX,pit.serviceY,serviceBounds)||changed;
    const latest=currentSetup()?.pits?.[pit.index]||pit;
    const boardBounds=spriteFamilyAnchorBounds(0x08,pit.index*16,16,0);
    changed=writeProjectedInside(now.pitFileOffset,pit.index,'board',latest.boardX,latest.boardY,boardBounds)||changed;
    const p2=currentSetup()?.pits?.[pit.index]||latest,crewBounds=spriteFamilyAnchorBounds(0x05,pit.index*76,76,0),crew=clampScreenPoint(p2.screenX,p2.screenY,crewBounds);
    if(crew.x!==p2.screenX||crew.y!==p2.screenY){writePit(C.model.main,now.pitFileOffset,pit.index,{screenX:Math.round(crew.x),screenY:Math.round(crew.y)});changed=true;}
  }
  return changed;
}

function commitPanelField(e){
  const input=e?.target,r=currentRecord(),s=currentSetup();if(!input||!r||!s||!C.model)return;
  if(input.value==='')return;
  try{
    const id=input.id,value=Number(input.value);
    if(!Number.isFinite(value))return;
    const common={
      racePitPickupX:['pitPickupX',value],racePitPickupY:['pitPickupY',value],
      racePitPickupHalfWidth:['pitPickupHalfWidth',value],racePitApproachY:['pitApproachY',value],
      raceFlagX:['flagX',value],raceFlagY:['flagY',value],raceStartOrient:['startOrient',value],
      raceStartX:['startX',numberToFixed(input.value)],raceStartY:['startY',numberToFixed(input.value)]
    }[id];
    if(common)writeCommon(C.model.main,r.offset,{[common[0]]:common[1]});
    else{
      const pit={
        raceServiceX:['serviceX',numberToFixed(input.value)],raceServiceY:['serviceY',numberToFixed(input.value)],
        raceBoardX:['boardX',numberToFixed(input.value)],raceBoardY:['boardY',numberToFixed(input.value)],
        raceScreenX:['screenX',value],raceScreenY:['screenY',value],raceSlotWord:['slotWord',value]
      }[id];
      if(!pit)return;
      writePit(C.model.main,s.pitFileOffset,currentPit,{[pit[0]]:pit[1]});
    }
    const finish=()=>{draw();const d=dirty();$('raceRevert').disabled=!d;setStatus(`${s.name||`Race ${s.recordIndex}`} · ${d?'Modified':'Unmodified'} · changes are live.`);};
    if(EG)EG.frame('race-live-field',finish);else finish();
  }catch(err){setStatus(`ERROR: ${err.message}`);}
}

function applyPanel(){
  const r=currentRecord(),s=currentSetup();if(!r||!s||!C.model)return;
  try{
    writeCommon(C.model.main,r.offset,{laps:Number($('raceLaps').value),pitPickupX:Number($('racePitPickupX').value),pitPickupY:Number($('racePitPickupY').value),pitPickupHalfWidth:Number($('racePitPickupHalfWidth').value),pitApproachY:Number($('racePitApproachY').value),flagX:Number($('raceFlagX').value),flagY:Number($('raceFlagY').value),startX:numberToFixed($('raceStartX').value),startY:numberToFixed($('raceStartY').value),startOrient:Number($('raceStartOrient').value)});
    writePit(C.model.main,s.pitFileOffset,currentPit,{serviceX:numberToFixed($('raceServiceX').value),serviceY:numberToFixed($('raceServiceY').value),boardX:numberToFixed($('raceBoardX').value),boardY:numberToFixed($('raceBoardY').value),screenX:Number($('raceScreenX').value),screenY:Number($('raceScreenY').value),slotWord:Number($('raceSlotWord').value)});
    constrainRacePositions();refreshPanel();draw();setStatus(`${s.name} race/pit fields updated.${dirty()?' · Modified':''}`);
  }catch(e){setStatus(`ERROR: ${e.message}`);}
}

function spriteCanvas(id,index){
  if(!graphics)return null;const key=`${C.generation}:${id}:${index}`;if(imageCache.has(key))return imageCache.get(key);
  const rendered=graphics.renderFrame(id,index),frame=graphics.getFrame(id,index);if(!rendered||!frame)return null;
  const c=document.createElement('canvas');c.width=rendered.width;c.height=rendered.height;const x=c.getContext('2d');const im=x.createImageData(rendered.width,rendered.height);im.data.set(rendered.rgba);x.putImageData(im,0,0);const obj={canvas:c,frame};imageCache.set(key,obj);return obj;
}
function label(ctx,text,x,y,S){ctx.save();ctx.font=`600 ${Math.max(9,Math.round(3.7*S))}px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`;ctx.textBaseline='top';const w=ctx.measureText(text).width;ctx.fillStyle='rgba(0,0,0,.78)';ctx.fillRect(x-2*S,y-1*S,w+4*S,Math.max(10,5*S));ctx.fillStyle='#fff';ctx.fillText(text,x,y);ctx.restore();}
function anchor(ctx,x,y,S,text,kind,index=null,drawText=true){
  if(!Number.isFinite(x)||!Number.isFinite(y))return;hitTargets.push({kind,index,x,y});const px=x*S,py=y*S;ctx.save();ctx.lineWidth=Math.max(1.5,.7*S);ctx.strokeStyle='#ffd84a';ctx.fillStyle='rgba(0,0,0,.65)';ctx.beginPath();ctx.arc(px,py,3.2*S,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(px-5*S,py);ctx.lineTo(px+5*S,py);ctx.moveTo(px,py-5*S);ctx.lineTo(px,py+5*S);ctx.stroke();if(drawText)label(ctx,text,px+4*S,py+4*S,S);ctx.restore();
}
function drawSprite(ctx,id,index,x,y,S,text,kind,slot=null){
  anchor(ctx,x,y,S,text,kind,slot,false);
  const img=spriteCanvas(id,index);if(img){const {canvas,frame}=img;ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(canvas,(x-frame.xOrigin)*S,(y-frame.yOrigin)*S,canvas.width*S,canvas.height*S);ctx.restore();}
  label(ctx,text,x*S+4*S,y*S+4*S,S);
}
function drawCarFootprint(ctx,x,y,S,heading16,text){
  if(!Number.isFinite(x)||!Number.isFinite(y))return;ctx.save();ctx.translate(x*S,y*S);ctx.rotate(angle16ToCanvasRadians(heading16));ctx.lineJoin='round';
  ctx.fillStyle='rgba(20,20,20,.72)';ctx.strokeStyle='rgba(255,255,255,.96)';ctx.lineWidth=Math.max(1,0.55*S);ctx.beginPath();ctx.moveTo(6*S,0);ctx.lineTo(3.5*S,-3*S);ctx.lineTo(-5*S,-3*S);ctx.lineTo(-6*S,-2*S);ctx.lineTo(-6*S,2*S);ctx.lineTo(-5*S,3*S);ctx.lineTo(3.5*S,3*S);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.strokeStyle='#ffd84a';ctx.beginPath();ctx.moveTo(2*S,0);ctx.lineTo(5*S,0);ctx.moveTo(4*S,-1*S);ctx.lineTo(5*S,0);ctx.lineTo(4*S,1*S);ctx.stroke();ctx.restore();label(ctx,text,(x+5)*S,(y-7)*S,S);
}
function drawPitlaneOverlay(ctx,s,S){
  const showZone=$('raceShowPitlaneZone')?.checked,showApproach=$('raceShowPitApproach')?.checked;
  if(!showZone&&!showApproach)return;
  const x=s.pitPickupX,y=s.pitPickupY,hw=Math.max(0,s.pitPickupHalfWidth),h=30;
  ctx.save();
  if(showZone){
    ctx.strokeStyle='rgba(255,216,74,.96)';ctx.fillStyle='rgba(255,216,74,.10)';ctx.lineWidth=Math.max(1,.65*S);ctx.setLineDash([4*S,3*S]);
    ctx.fillRect((x-hw)*S,y*S,(hw*2)*S,h*S);ctx.strokeRect((x-hw)*S,y*S,(hw*2)*S,h*S);ctx.setLineDash([]);
    anchor(ctx,x,y,S,'PIT PICKUP','pitPickup',null,true);
    anchor(ctx,x+hw,y+h/2,S,'WIDTH','pitWidth',null,true);
  }
  if(showApproach){
    const points=[];
    for(const pit of s.pits){
      const approachX=s16((Number(pit.serviceX)>>>16)&0xffff),approachRawY=s.pitApproachY<<16;
      const q=projectFixedXZ(approachX<<16,approachRawY);
      if(q)points.push(q);
    }
    if(points.length){
      const x1=Math.min(...points.map(q=>q.x))-8,x2=Math.max(...points.map(q=>q.x))+8,y=points[0].y;
      hitTargets.push({kind:'approachLine',x1,y1:y,x2,y2:y});
      hitTargets.push({kind:'approachLine',x:x1,y});
      hitTargets.push({kind:'approachLine',x:x2,y});
    }
  }
  ctx.restore();
}
function draw(){
  const c=overlayCanvas(),v=viewCanvas();if(!c||!v)return;syncSize();const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);hitTargets=[];
  if(!active&&root.IndyHeatRaceOverlayOverride!==true)return;
  const s=currentSetup();if(!s)return;const S=c.width/320,alpha=Math.max(.25,Math.min(1,Number($('opacity')?.value||55)/100));ctx.globalAlpha=alpha;
  drawPitlaneOverlay(ctx,s,S);
  if($('raceShowStart')?.checked){const q=projectFixedXZ(s.startX,s.startY);if(q)anchor(ctx,q.x,q.y,S,'START GRID','start');}
  if($('raceShowGridCars')?.checked){for(const car of gridCarPositions(s)){const q=projectFixedXZ(car.x,car.y);if(q)drawCarFootprint(ctx,q.x,q.y,S,car.heading16,`C${car.index+1}`);}}
  const record=currentRecord();
  for(const p of s.pits){
    let serviceQ=null;
    if($('raceShowPits')?.checked){serviceQ=projectFixedXZ(p.serviceX,p.serviceY);if(serviceQ)anchor(ctx,serviceQ.x,serviceQ.y,S,`P${p.index+1} STOP`,'service',p.index);}
    if($('raceShowPitCrew')?.checked&&p.screenX>=0&&p.screenX<320&&p.screenY>=0&&p.screenY<256)drawSprite(ctx,0x05,0,p.screenX,p.screenY,S,`P${p.index+1} CREW`,'screen',p.index);
    if($('raceShowPitCars')?.checked){serviceQ=serviceQ||projectFixedXZ(p.serviceX,p.serviceY);if(serviceQ){const h=pitHeadingFromRoute(record,p);drawCarFootprint(ctx,serviceQ.x,serviceQ.y,S,h==null?(s.startOrient&0xffff):h,`P${p.index+1} CAR`);}}
    if($('raceShowBoards')?.checked){const q=projectFixedXZ(p.boardX,p.boardY);if(q)drawSprite(ctx,0x08,0,q.x,q.y,S,`P${p.index+1} PIT`,'board',p.index);}
  }
  if($('raceShowFlag')?.checked&&s.flagX>=0&&s.flagX<320&&s.flagY>=0&&s.flagY<256)drawSprite(ctx,0x0F,26,s.flagX,s.flagY,S,'FLAG','flag');
  ctx.globalAlpha=1;
}
function eventXY(e){const c=overlayCanvas(),r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*320/r.width,y:(e.clientY-r.top)*256/r.height};}
function segmentDistanceSq(px,py,x1,y1,x2,y2){
  const vx=x2-x1,vy=y2-y1,wx=px-x1,wy=py-y1,l2=vx*vx+vy*vy;
  if(l2<=0)return wx*wx+wy*wy;
  const u=Math.max(0,Math.min(1,(wx*vx+wy*vy)/l2)),dx=px-(x1+u*vx),dy=py-(y1+u*vy);
  return dx*dx+dy*dy;
}
function nearestTarget(x,y){
  let best=null,bd=14*14;
  for(const t of hitTargets){
    if(!Number.isFinite(t.x)||!Number.isFinite(t.y))continue;
    const dx=t.x-x,dy=t.y-y,d=dx*dx+dy*dy;if(d<bd){bd=d;best=t;}
  }
  for(const t of hitTargets){
    if(!Number.isFinite(t.x1)||!Number.isFinite(t.y1)||!Number.isFinite(t.x2)||!Number.isFinite(t.y2))continue;
    const d=segmentDistanceSq(x,y,t.x1,t.y1,t.x2,t.y2);if(d<8*8&&d<bd){bd=d;best=t;}
  }
  return best;
}
function pointerDown(e){if(!active||e.button!==0)return;const p=eventXY(e),t=nearestTarget(p.x,p.y);if(!t)return;e.preventDefault();e.stopPropagation();drag={...t,clickX:p.x,pointerId:e.pointerId};overlayCanvas().setPointerCapture?.(e.pointerId);overlayCanvas().classList.add('dragging');if(t.index!=null){currentPit=t.index;$('racePitSlot').value=String(currentPit);}refreshPanel();}
function writeDrag(t,x,y){
  const r=currentRecord(),s=currentSetup();if(!r||!s||!C.model)return;
  if(t.kind==='flag'){writeCommon(C.model.main,r.offset,{flagX:Math.round(x),flagY:Math.round(y)});return;}
  if(t.kind==='screen'){writePit(C.model.main,s.pitFileOffset,t.index,{screenX:Math.round(x),screenY:Math.round(y)});return;}
  if(t.kind==='pitPickup'){writeCommon(C.model.main,r.offset,{pitPickupX:Math.round(x),pitPickupY:Math.round(y)});return;}
  if(t.kind==='pitWidth'){writeCommon(C.model.main,r.offset,{pitPickupHalfWidth:Math.max(0,Math.round(Math.abs(x-s.pitPickupX)))});return;}
  if(t.kind==='approachLine'){
    const pit=s.pits[currentPit]||s.pits[0];if(!pit)return;
    const xRaw=s16((Number(pit.serviceX)>>>16)&0xffff)<<16,preferY=s.pitApproachY<<16;
    const inv=inverseFixedXZ(Number.isFinite(t.clickX)?t.clickX:x,y,xRaw,preferY);if(!inv)return;
    writeCommon(C.model.main,r.offset,{pitApproachY:s16((Number(inv.zRaw)>>>16)&0xffff)});return;
  }
  if(t.kind==='start'){
    const inv=inverseFixedXZ(x,y,s.startX,s.startY);if(!inv)return;
    writeCommon(C.model.main,r.offset,{startX:inv.xRaw,startY:inv.zRaw});
    return;
  }
  const pit=s.pits[t.index];if(!pit)return;
  if(t.kind==='service'){
    const inv=inverseFixedXZ(x,y,pit.serviceX,pit.serviceY);if(!inv)return;
    writePit(C.model.main,s.pitFileOffset,t.index,{serviceX:inv.xRaw,serviceY:inv.zRaw});
  }
  if(t.kind==='board'){
    const inv=inverseFixedXZ(x,y,pit.boardX,pit.boardY);if(!inv)return;
    writePit(C.model.main,s.pitFileOffset,t.index,{boardX:inv.xRaw,boardY:inv.zRaw});
  }
}
function pointerMove(e){if(!drag||drag.pointerId!==e.pointerId)return;const p=eventXY(e);writeDrag(drag,p.x,p.y);refreshPanel();draw();}
function pointerUp(e){if(!drag||drag.pointerId!==e.pointerId)return;try{overlayCanvas().releasePointerCapture?.(e.pointerId);}catch(_e){}drag=null;overlayCanvas().classList.remove('dragging');constrainRacePositions();refreshPanel();draw();}

function init(){
  if(!injectUi())return;ensureGraphics();refreshPanel();draw();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0));else setTimeout(init,0);
})(typeof globalThis!=='undefined'?globalThis:this);

/* Gasoline Alley circuit-name package support. */
(function(root){
'use strict';

/*
 * Gasoline Alley circuit-name authoring (canonical race-setup extension).
 *
 * Runtime fact inherited from the current source/wiki state:
 *   race+$70..+$81 is the 18-byte Gasoline Alley display-name field.
 *   Bytes 0..16 are display data and byte 17 is NUL. Retail data uses '<'
 *   and '@' as invisible alignment/fill glyphs around the readable name.
 *
 * Package compatibility:
 *   race_setup.bin is authored as the current $76 format; older $68/$70/$74 package
 *   files remain importable and are upgraded on the next export.
 *   The editor adds an optional package sidecar, name.bin, containing the
 *   exact 18 raw bytes. Older editor builds ignore the extra ZIP member.
 *   Name authoring is kept as package metadata instead of mutating the shared
 *   retail template record, so switching imported packages cannot leak a name
 *   into the host circuit used by another package.
 */

const NAME_OFFSET=0x70;
const NAME_SIZE=0x12;
const NAME_DISPLAY_SIZE=0x11;
const NAME_LEFT_FILL=0x3c;
const NAME_RIGHT_FILL=0x40;

function decodeNameBytes(bytes){
  if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes||[]);
  let s='';
  for(let i=0;i<Math.min(NAME_DISPLAY_SIZE,bytes.length);i++){
    const c=bytes[i];
    if(c===0)break;
    if(c===NAME_LEFT_FILL||c===NAME_RIGHT_FILL)s+=' ';
    else if(c>=32&&c<=126)s+=String.fromCharCode(c);
  }
  return s.replace(/\s+/g,' ').trim();
}

function encodeNameBytes(value){
  const name=String(value??'').replace(/\s+/g,' ').trim();
  if(!name)throw new Error('Circuit name must not be blank');
  if(name.length>NAME_DISPLAY_SIZE)throw new Error(`Circuit name is limited to ${NAME_DISPLAY_SIZE} characters`);
  for(let i=0;i<name.length;i++){
    const c=name.charCodeAt(i);
    if(c<32||c>126||c===NAME_LEFT_FILL||c===NAME_RIGHT_FILL)
      throw new Error("Circuit name must use printable ASCII and cannot contain '<' or '@'");
  }
  const out=new Uint8Array(NAME_SIZE);
  const free=NAME_DISPLAY_SIZE-name.length;
  const left=Math.floor(free/2),right=free-left;
  let p=0;
  for(let i=0;i<left;i++)out[p++]=NAME_LEFT_FILL;
  for(let i=0;i<name.length;i++)out[p++]=name.charCodeAt(i);
  for(let i=0;i<right;i++)out[p++]=NAME_RIGHT_FILL;
  out[NAME_DISPLAY_SIZE]=0;
  return out;
}

function addNameFileToZipBytes(P,zipBytes,circuitIndex,nameBytes){
  if(!P||typeof P.readZipStore!=='function'||typeof P.zipStore!=='function'||typeof P.circuitFolder!=='function')
    throw new Error('Circuit package tools are unavailable');
  if(!(nameBytes instanceof Uint8Array))nameBytes=new Uint8Array(nameBytes||[]);
  if(nameBytes.length!==NAME_SIZE)throw new Error(`name.bin must be exactly $${NAME_SIZE.toString(16).toUpperCase()} bytes`);
  const entries=P.readZipStore(zipBytes);
  entries.set(`${P.circuitFolder(circuitIndex)}/name.bin`,nameBytes.slice());
  return P.zipStore([...entries.entries()].map(([name,data])=>({name,data})));
}

const api={NAME_OFFSET,NAME_SIZE,NAME_DISPLAY_SIZE,decodeNameBytes,encodeNameBytes,addNameFileToZipBytes};
root.IndyHeatCircuitNameTools=api;
if(typeof document==='undefined')return;

const $=id=>document.getElementById(id);
let bootTimer=null;
let zipHookBusy=false;
const authoredNames=new Map();
let pendingImportedName=null;
let pendingImportedCpuChoices=null;
const RETAIL_ROUTE_COUNTS=Object.freeze([
  Object.freeze([46,46,45]),
  Object.freeze([55,61,49]),
  Object.freeze([56,67,47]),
  Object.freeze([63,67,66]),
  Object.freeze([76,77,53]),
  Object.freeze([68,70,54]),
  Object.freeze([71,77,71]),
  Object.freeze([77,73,71]),
  Object.freeze([49,46,42]),
  Object.freeze([82,80,77])
]);

function tools(){return root.IndyHeatTools||null;}
function packageTools(){return root.IndyHeatCircuitPackage||null;}
function capture(){return root.IndyHeatRaceSetupCapture||null;}
function trackIndex(){return Number($('trackSelect')?.value||0);}
function primaryModel(){const C=capture();return C?.model||C?.layerModel||C?.coreModel||C?.models?.[0]||null;}
function recordsFor(model){
  const C=capture(),T=tools();if(!model||!T)return [];
  let records=C?.recordsByMain?.get(model.main)||null;
  if(!records){records=T.parseRaceRecords(model.main);C?.recordsByMain?.set(model.main,records);}
  for(const r of records){
    if(r.baseResourceId==null&&typeof T.raceBaseResourceId==='function')
      r.baseResourceId=T.raceBaseResourceId(r,model.resourceTableOffset+0x1000);
  }
  return records;
}
function recordFor(model,index=trackIndex()){
  const T=tools();if(!model||!T)return null;
  const base=T.TRACK_BASE_IDS?.[index];
  return recordsFor(model).find(r=>r.baseResourceId===base)||null;
}
function currentCircuitIndex(){
  const n=Number($('circuitNumber')?.value);
  return Number.isInteger(n)&&n>=0&&n<=99?n:trackIndex();
}
function selectedOption(){return $('trackSelect')?.selectedOptions?.[0]||null;}
function sourceIdentity(){
  const o=selectedOption();
  if(!o)return `retail:${trackIndex()}`;
  const packageKey=o.dataset?.indyheatPackageKey;
  if(packageKey)return `package:${packageKey}`;
  if(o.dataset?.indyheatCustom==='1')return `custom:${trackIndex()}`;
  const logical=o.dataset?.indyheatRetailIndex;
  return `retail:${Number(logical==null?o.value:logical)}`;
}
function currentNameKey(){return `${sourceIdentity()}|circuit:${currentCircuitIndex()}`;}
function normalRetailSource(){
  const o=selectedOption();
  return !!o&&o.dataset?.indyheatCustom!=='1'&&!o.dataset?.indyheatPackageKey;
}
function selectedSourceLabel(){
  const o=selectedOption();
  return String(o?.dataset?.indyheatOriginalText||o?.textContent||'').replace(/\s+/g,' ').trim();
}
function loadedModels(){
  const C=capture(),out=[];
  for(const m of [C?.coreModel,C?.model,C?.layerModel,...(C?.models||[])])
    if(m&&!out.includes(m))out.push(m);
  return out;
}
function retailWaypointExport(P,templateIndex){
  const T=tools(),expected=RETAIL_ROUTE_COUNTS[templateIndex];
  if(!T||!P||!expected)return null;
  let fallback=null;
  for(const model of loadedModels()){
    const record=recordFor(model,templateIndex);
    if(!record)continue;
    try{
      record.waypointDescriptors=T.parseWaypointDescriptors(model.main,record);
      const counts=(record.waypointDescriptors||[]).map(r=>r.points.length);
      const candidate={bytes:P.encodeWaypointsBin(record,model.main),counts};
      if(!fallback)fallback=candidate;
      if(expected.every((v,i)=>v===counts[i]))return {...candidate,repaired:true};
    }catch(_e){}
  }
  return fallback;
}
function nameBytesFor(model,record){
  if(!model||!record)return null;
  return model.main.slice(record.offset+NAME_OFFSET,record.offset+NAME_OFFSET+NAME_SIZE);
}
function currentNameBytes(){
  const authored=authoredNames.get(currentNameKey());
  if(authored)return authored.slice();
  const m=primaryModel(),r=recordFor(m),b=nameBytesFor(m,r);
  if(!b||b.length!==NAME_SIZE)throw new Error('Current circuit name field is unavailable');
  return b;
}
function currentNameIsAuthored(){return authoredNames.has(currentNameKey());}
function currentName(){return decodeNameBytes(currentNameBytes());}
function commitPendingImportedName(){
  const pending=pendingImportedName;if(!pending||pending.circuitIndex==null)return false;
  if(currentCircuitIndex()!==pending.circuitIndex)return false;
  const o=selectedOption();
  if(!o||(o.dataset?.indyheatCustom!=='1'&&!o.dataset?.indyheatPackageKey))return false;
  const key=currentNameKey();
  if(pending.bytes)authoredNames.set(key,pending.bytes.slice());else authoredNames.delete(key);
  pendingImportedName=null;
  return true;
}
function commitPendingImportedCpuChoices(){
  const pending=pendingImportedCpuChoices;if(!pending||pending.circuitIndex==null)return false;
  if(currentCircuitIndex()!==pending.circuitIndex)return false;
  const o=selectedOption();
  if(!o||(o.dataset?.indyheatCustom!=='1'&&!o.dataset?.indyheatPackageKey))return false;
  pendingImportedCpuChoices=null;
  if(!pending.bytes)return true;
  const R=root.IndyHeatRaceSetupTools,values=R?.decodeCpuChoicesBin?.(pending.bytes);
  if(!R||!values)return false;
  for(const model of loadedModels()){
    const record=recordFor(model);if(record)R.writeCpuChoices(model.main,record.offset,values);
  }
  document.dispatchEvent(new CustomEvent('indyheat-cpu-choices-imported',{detail:{circuitIndex:pending.circuitIndex,values:{...values}}}));
  return true;
}
function commitPendingImportedSidecars(){
  const a=commitPendingImportedName(),b=commitPendingImportedCpuChoices();
  return a||b;
}
function setRaceStatus(text){const e=$('raceSetupStatus');if(e)e.textContent=text;}
function setTopStatus(text,bad=false){
  const e=$('circuitPackageTopStatus');if(!e)return;
  e.textContent=text;e.classList.toggle('bad',!!bad);
}
function updateCounter(){
  const input=$('raceCircuitName'),out=$('raceCircuitNameCount');if(!input||!out)return;
  out.textContent=`${input.value.length}/${NAME_DISPLAY_SIZE}`;
}
function syncNameUi(force=false){
  commitPendingImportedSidecars();
  const input=$('raceCircuitName');if(!input)return false;
  if(!force&&document.activeElement===input&&input.dataset.editing==='1')return true;
  try{input.value=currentName();}catch(_e){return false;}
  input.dataset.editing='';updateCounter();
  const revert=$('raceRevert');if(revert&&currentNameIsAuthored())revert.disabled=false;
  return true;
}
function installNameUi(){
  const grid=$('raceLaps')?.closest('.raceSetupGrid');
  if(!grid)return false;
  if(!$('raceCircuitName')){
    const label=document.createElement('label');label.className='raceSetupWide';
    label.innerHTML=`Circuit name <span style="display:flex;gap:7px;align-items:center"><input id="raceCircuitName" type="text" maxlength="${NAME_DISPLAY_SIZE}" autocomplete="off" spellcheck="false" title="Gasoline Alley circuit name; 1–${NAME_DISPLAY_SIZE} printable ASCII characters"><output id="raceCircuitNameCount" style="min-width:4.5ch;text-align:right"></output></span><span class="muted" style="font-size:10px;line-height:1.25">Displayed on Gasoline Alley. Exported as the optional 18-byte name.bin package sidecar.</span>`;
    grid.insertBefore(label,grid.firstChild);
    const input=$('raceCircuitName');
    const commitName=(showError=false)=>{
      try{
        const bytes=encodeNameBytes(input.value);authoredNames.set(currentNameKey(),bytes);$('raceRevert')&&($('raceRevert').disabled=false);return true;
      }catch(err){if(showError)setRaceStatus(`ERROR: ${err.message}`);return false;}
    };
    input.addEventListener('input',()=>{input.dataset.editing='1';updateCounter();commitName(false);});
    input.addEventListener('change',()=>{if(commitName(true)){input.dataset.editing='';syncNameUi(true);}});
  }
  const revert=$('raceRevert');
  if(revert&&!revert.dataset.circuitNameHook){
    revert.dataset.circuitNameHook='1';
    revert.addEventListener('click',()=>{
      authoredNames.delete(currentNameKey());
      setTimeout(()=>syncNameUi(true),0);
    },true);
  }
  if(!$('trackSelect')?.dataset.circuitNameHook){
    const sel=$('trackSelect');if(sel){sel.dataset.circuitNameHook='1';sel.addEventListener('change',()=>setTimeout(()=>syncNameUi(true),0));}
  }
  if(!$('circuitNumber')?.dataset.circuitNameHook){
    const n=$('circuitNumber');if(n){n.dataset.circuitNameHook='1';n.addEventListener('change',()=>setTimeout(()=>syncNameUi(true),0));}
  }
  syncNameUi();
  return true;
}

function installNameImport(){
  const input=$('circuitPackageInput'),P=packageTools();if(!input||!P)return false;
  if(input.dataset.circuitNameHook)return true;
  input.dataset.circuitNameHook='1';
  input.addEventListener('change',e=>{
    const file=e.target.files?.[0];if(!file)return;
    (async()=>{
      try{
        const entries=P.readZipStore(new Uint8Array(await file.arrayBuffer()));
        let circuitIndex=null,nameHit=null,cpuHit=null;
        for(const [name,data] of entries){
          const root=/^circuit_(\d{2})\//.exec(name);if(root&&circuitIndex==null)circuitIndex=Number(root[1]);
          const nm=/^circuit_(\d{2})\/name\.bin$/.exec(name);if(nm)nameHit={circuitIndex:Number(nm[1]),bytes:data};
          const cm=/^circuit_(\d{2})\/cpu_choices\.bin$/.exec(name);if(cm)cpuHit={circuitIndex:Number(cm[1]),bytes:data};
        }
        if(nameHit){
          if(nameHit.bytes.length!==NAME_SIZE)throw new Error(`name.bin must be exactly $${NAME_SIZE.toString(16).toUpperCase()} bytes`);
          if(nameHit.bytes[NAME_DISPLAY_SIZE]!==0)throw new Error('name.bin byte 17 must be the terminating NUL');
          for(let i=0;i<NAME_DISPLAY_SIZE;i++)if(nameHit.bytes[i]<32||nameHit.bytes[i]>126)throw new Error('name.bin display bytes must be printable ASCII');
          pendingImportedName={circuitIndex:nameHit.circuitIndex,bytes:nameHit.bytes.slice()};
        }else pendingImportedName={circuitIndex,bytes:null};
        if(cpuHit){
          root.IndyHeatRaceSetupTools.decodeCpuChoicesBin(cpuHit.bytes);
          pendingImportedCpuChoices={circuitIndex:cpuHit.circuitIndex,bytes:cpuHit.bytes.slice()};
        }else pendingImportedCpuChoices={circuitIndex,bytes:null};
        setTimeout(()=>{commitPendingImportedSidecars();syncNameUi(true);},50);
        setTimeout(()=>{commitPendingImportedSidecars();syncNameUi(true);},250);
      }catch(err){setTopStatus(`ERROR: ${err.message}`,true);}
    })();
  },true);
  return true;
}

function liveTextValue(id){
  const el=$(id);
  if(!el)return null;
  const text=String(el.value??'').trim();
  return text===''?null:text;
}
function liveIntegerOr(id,fallback,label,min=-32768,max=32767){
  const text=liveTextValue(id);
  if(text==null)return Number(fallback);
  const n=Number(text);
  if(!Number.isInteger(n)||n<min||n>max)throw new Error(`${label} must be ${min}..${max}`);
  return n;
}
function liveFixed16Or(id,fallbackRaw,label){
  const text=liveTextValue(id);
  if(text==null)return Number(fallbackRaw);
  const n=Number(text);
  if(!Number.isFinite(n))throw new Error(`${label} must be numeric`);
  const raw=Math.round(n*65536);
  if(raw<-0x80000000||raw>0x7fffffff)throw new Error(`${label} is outside signed 16.16 range`);
  return raw;
}
function snapshotLiveRaceSetup(templateIndex){
  const R=root.IndyHeatRaceSetupTools,model=primaryModel(),record=recordFor(model,templateIndex);
  if(!R||!model||!record)throw new Error('Live race-setup state is unavailable');
  const setup=R.parseRaceSetup(model.main,record);
  R.writeCommon(model.main,record.offset,{
    laps:liveIntegerOr('raceLaps',setup.laps,'Lap total',2,20),
    pitPickupX:liveIntegerOr('racePitPickupX',setup.pitPickupX,'Pit pickup centre X'),
    pitPickupY:liveIntegerOr('racePitPickupY',setup.pitPickupY,'Pit pickup top Y'),
    pitPickupHalfWidth:liveIntegerOr('racePitPickupHalfWidth',setup.pitPickupHalfWidth,'Pit pickup half-width',0,32767),
    pitApproachY:liveIntegerOr('racePitApproachY',setup.pitApproachY,'Pit approach Y'),
    flagX:liveIntegerOr('raceFlagX',setup.flagX,'Flag X'),
    flagY:liveIntegerOr('raceFlagY',setup.flagY,'Flag Y'),
    startX:liveFixed16Or('raceStartX',setup.startX,'Start X'),
    startY:liveFixed16Or('raceStartY',setup.startY,'Start Y'),
    startOrient:liveIntegerOr('raceStartOrient',setup.startOrient,'Start orientation')
  });
  const pitIndex=liveIntegerOr('racePitSlot',0,'Pit slot',0,3);
  const pit=setup.pits[pitIndex];
  R.writePit(model.main,setup.pitFileOffset,pitIndex,{
    serviceX:liveFixed16Or('raceServiceX',pit.serviceX,'Pit service X'),
    serviceY:liveFixed16Or('raceServiceY',pit.serviceY,'Pit service Y'),
    boardX:liveFixed16Or('raceBoardX',pit.boardX,'Pit board X'),
    boardY:liveFixed16Or('raceBoardY',pit.boardY,'Pit board Y'),
    screenX:liveIntegerOr('raceScreenX',pit.screenX,'Pit screen X'),
    screenY:liveIntegerOr('raceScreenY',pit.screenY,'Pit screen Y'),
    slotWord:liveIntegerOr('raceSlotWord',pit.slotWord,'Pit slot/side word')
  });
  return R.makeCompactBin(model.main,record);
}
function resourceModel(){
  const C=capture();return C?.layerModel||C?.model||C?.coreModel||C?.models?.[0]||null;
}
function directWaypointExport(P,templateIndex){
  const T=tools();if(!P||!T)throw new Error('Waypoint export tools are unavailable');
  if(normalRetailSource()){
    const exact=retailWaypointExport(P,templateIndex);
    if(exact)return exact;
  }
  const models=loadedModels();
  for(const model of models){
    const record=recordFor(model,templateIndex);if(!record)continue;
    try{
      record.waypointDescriptors=T.parseWaypointDescriptors(model.main,record);
      const counts=(record.waypointDescriptors||[]).map(r=>r.points.length);
      return {bytes:P.encodeWaypointsBin(record,model.main),counts,repaired:false};
    }catch(_e){}
  }
  throw new Error('Waypoint data for the selected circuit is unavailable');
}
function livePresentationBin(P,templateIndex){
  const model=primaryModel(),record=recordFor(model,templateIndex);
  if(!model||!record)throw new Error('Presentation state is unavailable');
  const base=P.readPresentation(model.main,record.offset);
  const mapText=liveTextValue('circuitMapId');
  const mapId=mapText==null?0:Number(mapText);
  return P.encodePresentationBin({
    mapId,
    presentation:{
      markerX:liveIntegerOr('circuitMarkerX',base.markerX,'Regional marker X'),
      markerY:liveIntegerOr('circuitMarkerY',base.markerY,'Regional marker Y'),
      markerFrame:liveIntegerOr('circuitMarkerFrame',base.markerFrame,'Regional marker frame',0,3),
      lapDisplayX:liveIntegerOr('circuitHudX',base.lapDisplayX,'Lap-total display X'),
      lapDisplayY:liveIntegerOr('circuitHudY',base.lapDisplayY,'Lap-total display Y')
    }
  });
}
function directPackageFiles(P,circuitIndex,templateIndex,nameBytes,raceSetupBytes){
  const pm=primaryModel(),rm=resourceModel();
  if(!pm||!rm)throw new Error('Circuit resource state is unavailable');
  const pr=recordFor(pm,templateIndex),rr=recordFor(rm,templateIndex);
  if(!pr||!rr)throw new Error('Selected circuit record is unavailable');
  const base=rr.baseResourceId;
  if(base==null)throw new Error('Selected circuit resource base is unavailable');
  const preview=P.resolvePreviewResource(pm,pr);
  if(!preview?.resource?.data)throw new Error('Mini-map resource is unavailable');
  const wp=directWaypointExport(P,templateIndex);
  const presentationBin=livePresentationBin(P,templateIndex);
  const files=P.makePackageFiles({
    circuitIndex,
    resources:{
      background:rm.getResource(base).data.slice(),
      foreground:rm.getResource(base+1).data.slice(),
      surface:rm.getResource(base+2).data.slice(),
      recovery:rm.getResource(base+3).data.slice()
    },
    previewBin:preview.resource.data.slice(),
    waypointsBin:wp.bytes,
    raceSetupBin:raceSetupBytes,
    presentationBin,
    routeSettingsBin:P.encodeRouteSettingsBin(P.readRouteLapGuards(pm.main,pr.offset))
  });
  const folder=P.circuitFolder(circuitIndex);
  files.push({name:`${folder}/name.bin`,data:nameBytes.slice()});
  files.push({name:`${folder}/cpu_choices.bin`,data:root.IndyHeatRaceSetupTools.encodeCpuChoicesBin(pm.main,pr)});
  files.push({name:`${folder}/template.bin`,data:Uint8Array.of(0,templateIndex)});
  return {files,waypointCounts:wp.counts,presentationBin,previewBytes:preview.resource.data.slice()};
}
function verifyDirectPackage(P,zipBytes,circuitIndex,expectedName,expectedLaps,expectedMapId){
  const folder=P.circuitFolder(circuitIndex),entries=P.readZipStore(zipBytes);
  const get=name=>{const b=entries.get(`${folder}/${name}`);if(!b)throw new Error(`Internal export verification failed: missing ${name}`);return b;};
  const nameBytes=get('name.bin');
  if(decodeNameBytes(nameBytes)!==expectedName)throw new Error(`Internal export verification failed: name is ${decodeNameBytes(nameBytes)}, expected ${expectedName}`);
  const setup=get('race_setup.bin');
  const expectedSetupSize=root.IndyHeatRaceSetupTools.COMPACT_SIZE;
  if(setup.length!==expectedSetupSize)throw new Error(`Internal export verification failed: race_setup.bin is $${setup.length.toString(16).toUpperCase()} bytes, expected $${expectedSetupSize.toString(16).toUpperCase()}`);
  const laps=(setup[0]<<8)|setup[1];
  const routeAssignment=root.IndyHeatRaceSetupTools.be32(setup,0x70);
  if(routeAssignment!==0&&routeAssignment!==0xffffffff)throw new Error('Internal export verification failed: Route A/B starting assignment is not $00000000 or $FFFFFFFF');
  if(laps!==expectedLaps)throw new Error(`Internal export verification failed: laps are ${laps}, expected ${expectedLaps}`);
  root.IndyHeatRaceSetupTools.decodeCpuChoicesBin(get('cpu_choices.bin'));
  const pres=P.decodePresentationBin(get('presentation.bin'));
  if(pres.mapId!==expectedMapId)throw new Error(`Internal export verification failed: map is ${pres.mapId}, expected ${expectedMapId}`);
  const template=get('template.bin'),templateIndex=(template[0]<<8)|template[1];
  const routes=P.decodeWaypointsBin(get('waypoints.bin'));
  return {templateIndex,routeCounts:routes.map(r=>r.points.length),fileCount:entries.size};
}
function downloadZipBytes(bytes,name){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([bytes],{type:'application/zip'}));
  a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function installNameExport(){
  const button=$('circuitPackageZip'),P=packageTools();if(!button||!P)return false;
  if(button.dataset.circuitNameHook)return true;
  button.dataset.circuitNameHook='1';
  button.addEventListener('click',e=>{
    e.preventDefault();e.stopImmediatePropagation();
    if(zipHookBusy)return;
    zipHookBusy=true;
    try{
      const circuitIndex=currentCircuitIndex(),templateIndex=trackIndex();
      if(!Number.isInteger(templateIndex)||templateIndex<0||templateIndex>=RETAIL_ROUTE_COUNTS.length)
        throw new Error(`Selected retail template index ${templateIndex} is invalid`);
      const expectedName=String($('raceCircuitName')?.value??currentName()).replace(/\s+/g,' ').trim();
      const nameBytes=encodeNameBytes(expectedName);
      authoredNames.set(currentNameKey(),nameBytes.slice());
      const expectedLaps=Number($('raceLaps')?.value);
      if(!Number.isInteger(expectedLaps)||expectedLaps<2||expectedLaps>20)throw new Error('Lap total must be 2–20');
      const expectedMapId=Number($('circuitMapId')?.value);
      const raceSetupBytes=snapshotLiveRaceSetup(templateIndex);
      const built=directPackageFiles(P,circuitIndex,templateIndex,nameBytes,raceSetupBytes);
      const zip=P.zipStore(built.files),checked=verifyDirectPackage(P,zip,circuitIndex,expectedName,expectedLaps,expectedMapId);
      downloadZipBytes(zip,`${P.circuitFolder(circuitIndex)}.zip`);
      setTopStatus(`${P.circuitFolder(circuitIndex)} exported · ${checked.fileCount} files · template ${checked.templateIndex} · routes ${checked.routeCounts.join('/')} · laps ${expectedLaps} · map ${expectedMapId} · name ${expectedName}.`);
    }catch(err){setTopStatus(`ERROR: ${err.message}`,true);}
    finally{zipHookBusy=false;}
  },true);
  return true;
}

function tick(){return installNameUi()&&installNameImport()&&installNameExport();
}
function boot(){
  let tries=0;tick();
  bootTimer=setInterval(()=>{if(tick()||++tries>400){clearInterval(bootTimer);bootTimer=null;}},50);
  document.addEventListener('indyheat-race-setup-capture',e=>{
    if(e.detail?.type==='model'){authoredNames.clear();pendingImportedName=null;pendingImportedCpuChoices=null;}
    setTimeout(()=>syncNameUi(true),0);
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});
else setTimeout(boot,0);

})(typeof globalThis!=='undefined'?globalThis:this);
