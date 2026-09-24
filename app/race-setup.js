(function(root){
'use strict';

const RUNTIME_MAIN_BASE=0x1000;
const RACE_RECORD_SIZE=0x82;
const PIT_RECORD_SIZE=0x16;
const PIT_RECORD_COUNT=4;
const PIT_BLOCK_SIZE=PIT_RECORD_SIZE*PIT_RECORD_COUNT; // $58
const COMPACT_SIZE=0x68;
const LAP_MIN=2;
const LAP_MAX=20;
const OFF=Object.freeze({
  laps:0x28,
  pitPointer:0x32,
  flagX:0x5C,
  flagY:0x5E,
  startX:0x62,
  startY:0x66,
  startOrient:0x6A
});
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
  pits:{offset:0x10,length:PIT_BLOCK_SIZE,source:'four raw $16-byte pit records via race+$32.l'}
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
    flagX:s16(be16(main,o+OFF.flagX)),flagY:s16(be16(main,o+OFF.flagY)),
    startX:s32(be32(main,o+OFF.startX)),startY:s32(be32(main,o+OFF.startY)),
    startOrient:s16(be16(main,o+OFF.startOrient)),
    pitPointer,pitFileOffset,pits
  };
}

function writeCommon(main,recordOffset,values={}){
  if(values.laps!=null)wr16(main,recordOffset+OFF.laps,clampInt(values.laps,LAP_MIN,LAP_MAX,'Lap count'));
  if(values.flagX!=null)wr16(main,recordOffset+OFF.flagX,clampInt(values.flagX,-32768,32767,'Flag X')&0xffff);
  if(values.flagY!=null)wr16(main,recordOffset+OFF.flagY,clampInt(values.flagY,-32768,32767,'Flag Y')&0xffff);
  if(values.startX!=null)wr32(main,recordOffset+OFF.startX,Number(values.startX)>>>0);
  if(values.startY!=null)wr32(main,recordOffset+OFF.startY,Number(values.startY)>>>0);
  if(values.startOrient!=null)wr16(main,recordOffset+OFF.startOrient,clampInt(values.startOrient,-32768,32767,'Start orientation')&0xffff);
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

function makeCompactBin(main,record){
  const setup=parseRaceSetup(main,record),o=setup.recordOffset,out=new Uint8Array(COMPACT_SIZE);
  out.set(main.slice(o+OFF.laps,o+OFF.laps+2),COMPACT_LAYOUT.laps.offset);
  out.set(main.slice(o+OFF.flagX,o+OFF.flagX+4),COMPACT_LAYOUT.flag.offset);
  out.set(main.slice(o+OFF.startX,o+OFF.startX+10),COMPACT_LAYOUT.start.offset);
  out.set(main.slice(setup.pitFileOffset,setup.pitFileOffset+PIT_BLOCK_SIZE),COMPACT_LAYOUT.pits.offset);
  return out;
}
function applyCompactBin(main,record,bin){
  if(!(bin instanceof Uint8Array))bin=new Uint8Array(bin);
  if(bin.length!==COMPACT_SIZE)throw new Error(`Race setup bin must be exactly $68 (${COMPACT_SIZE}) bytes`);
  const setup=parseRaceSetup(main,record),o=setup.recordOffset;
  const importedLaps=be16(bin,COMPACT_LAYOUT.laps.offset);
  wr16(main,o+OFF.laps,importedLaps<LAP_MIN?LAP_MIN:importedLaps);
  main.set(bin.slice(COMPACT_LAYOUT.flag.offset,COMPACT_LAYOUT.flag.offset+4),o+OFF.flagX);
  main.set(bin.slice(COMPACT_LAYOUT.start.offset,COMPACT_LAYOUT.start.offset+10),o+OFF.startX);
  main.set(bin.slice(COMPACT_LAYOUT.pits.offset,COMPACT_LAYOUT.pits.offset+PIT_BLOCK_SIZE),setup.pitFileOffset);
  return parseRaceSetup(main,record);
}
function setupFilename(record){return `indyheat_r${String(Number(record.index)).padStart(2,'0')}_setup.bin`;}
function arraysEqual(a,b){if(!a||!b||a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;}
function isSetupDirty(main,originalMain,record){return !arraysEqual(makeCompactBin(main,record),makeCompactBin(originalMain,record));}
function revertSetup(main,originalMain,record){return applyCompactBin(main,record,makeCompactBin(originalMain,record));}

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
  x6=Math.round(Number(x6));z6=Math.round(Number(z6));
  if(!Number.isFinite(x6)||!Number.isFinite(z6))return null;
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
  const px=fixedToNumber(pit.serviceX),py=fixedToNumber(pit.serviceY);let best=0,bd=Infinity;
  for(let i=0;i<points.length;i++){const q=points[i],dx=Number(q.x)-px,dy=Number(q.y)-py,d=dx*dx+dy*dy;if(d<bd){bd=d;best=i;}}
  const a=points[best],b=points[(best+1)%points.length];let dx=Number(b.x)-Number(a.x),dy=Number(b.y)-Number(a.y);
  if(dx===0&&dy===0){const prev=points[(best+points.length-1)%points.length];dx=Number(a.x)-Number(prev.x);dy=Number(a.y)-Number(prev.y);}
  return angle16FromWorldVector(dx,dy);
}

const api={RUNTIME_MAIN_BASE,RACE_RECORD_SIZE,PIT_RECORD_SIZE,PIT_RECORD_COUNT,PIT_BLOCK_SIZE,COMPACT_SIZE,LAP_MIN,LAP_MAX,OFF,PIT,COMPACT_LAYOUT,GRID_CAR_OFFSETS,
  be16,be32,s16,s32,wr16,wr32,fixedToNumber,numberToFixed,fixedText,fileOffsetFromRuntime,parsePitRecord,parseRaceSetup,
  writeCommon,writePit,makeCompactBin,applyCompactBin,setupFilename,arraysEqual,isSetupDirty,revertSetup,projectFixedXZ,replaceHighWord,
  mergeProjectedFixed,projectFixed22_6,inverseFixedXZ,
  addFixed32,gridCarPositions,angle16ToCanvasRadians,angle16FromWorldVector,pitHeadingFromRoute};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.IndyHeatRaceSetupTools=api;

if(typeof document==='undefined')return;
const T=root.IndyHeatTools,C=root.IndyHeatRaceSetupCapture;
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
function setStatus(s){const el=$('raceSetupStatus');if(el)el.textContent=s;}
function dirty(){const r=currentRecord();return !!(r&&C.model&&C.originalMain&&isSetupDirty(C.model.main,C.originalMain,r));}

function ensureGraphics(){
  if(!C.model)return;
  if(root.IndyHeatRaceGraphics){
    try{graphics=root.IndyHeatRaceGraphics.attach(C.model,{resourceIds:[0x05,0x08,0x0F]});imageCache.clear();draw();}catch(e){setStatus(`Race graphics unavailable: ${e.message}`);}
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
    .raceSetupGrid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:7px 0 10px}
    .raceSetupGrid label{display:grid;gap:3px;margin:0;color:#b9c0cc;font-size:11px}
    .raceSetupGrid input,.raceSetupGrid select{min-width:0;width:100%;box-sizing:border-box}
    .raceSetupWide{grid-column:1/-1}
    .raceSetupChecks{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:7px 0 10px}
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
      <div class="muted" style="font-size:11px;line-height:1.35">Pit/service and presentation positions are the real race/pit fields. Car starts use the shared per-track grid origin/orientation; the four individual start slots are reconstructed from the game setup constants. Car graphics remain a visual preview only unless a proved active-car renderer is available.</div>
      <div class="raceSetupChecks">
        <label><input id="raceShowStart" type="checkbox" checked> Start grid</label>
        <label><input id="raceShowPits" type="checkbox" checked> Pit targets</label>
        <label><input id="raceShowBoards" type="checkbox" checked> PIT boards</label>
        <label><input id="raceShowFlag" type="checkbox" checked> Flag man</label>
        <label><input id="raceShowGridCars" type="checkbox"> Cars on grid</label>
        <label><input id="raceShowPitCars" type="checkbox"> Cars in pits</label>
      </div>
      <div class="raceSetupGrid">
        <label>Laps <input id="raceLaps" type="number" min="2" max="20" step="1" title="Authored custom range: 2–20"></label>
        <label>Start orient <input id="raceStartOrient" type="number" min="-32768" max="32767" step="1"></label>
        <label>Flag X <input id="raceFlagX" type="number" min="-32768" max="32767" step="1"></label>
        <label>Flag Y <input id="raceFlagY" type="number" min="-32768" max="32767" step="1"></label>
        <label>Grid X (16.16) <input id="raceStartX" type="number" step="0.0001"></label>
        <label>Grid Y (16.16) <input id="raceStartY" type="number" step="0.0001"></label>
      </div>
      <div class="toolGroupTitle">Pit slot</div>
      <div class="raceSetupGrid">
        <label class="raceSetupWide">Slot <select id="racePitSlot"><option value="0">Pit 1</option><option value="1">Pit 2</option><option value="2">Pit 3</option><option value="3">Pit 4</option></select></label>
        <label>Service X (16.16) <input id="raceServiceX" type="number" step="0.0001"></label>
        <label>Service Y (16.16) <input id="raceServiceY" type="number" step="0.0001"></label>
        <label>PIT board X (16.16) <input id="raceBoardX" type="number" step="0.0001"></label>
        <label>PIT board Y (16.16) <input id="raceBoardY" type="number" step="0.0001"></label>
        <label>Crew screen X <input id="raceScreenX" type="number" min="-32768" max="32767" step="1"></label>
        <label>Crew screen Y <input id="raceScreenY" type="number" min="-32768" max="32767" step="1"></label>
        <label class="raceSetupWide">Slot / side word <input id="raceSlotWord" type="number" min="-32768" max="32767" step="1"></label>
      </div>
      <div class="raceSetupActions"><button id="raceApply" type="button">Apply fields</button><button id="raceRevert" type="button">Revert setup</button></div>
      <div class="raceSetupActions"><button id="raceExport" type="button">Export setup .bin</button><button id="raceExportAll" type="button">Export all setup .bins</button></div>
      <div class="raceSetupActions"><button id="raceExportMain" type="button">Modified main .bin</button><span></span></div>
      <div id="raceSetupStatus" class="muted">Race setup data is loading.</div>
    </div>`;
  const drawing=$('layerDrawingPane'),waypointHost=$('layerWaypointHost');column.insertBefore(pane,drawing||waypointHost||null);
  const stack=view.closest('.canvasStack')||view.parentElement;const cv=document.createElement('canvas');cv.id='raceSetupCanvas';stack.appendChild(cv);
  mode.addEventListener('click',activate);
  ['layerModeWaypoints','layerEditSurface','layerEditMask','layerEditRecovery','layerEditBackdrop'].forEach(id=>$(id)?.addEventListener('click',()=>{if(active)deactivate();}));
  $('racePitSlot').addEventListener('change',e=>{currentPit=Number(e.target.value)||0;refreshPanel();draw();});
  ['raceShowStart','raceShowPits','raceShowBoards','raceShowFlag','raceShowGridCars','raceShowPitCars'].forEach(id=>$(id).addEventListener('change',draw));
  $('raceApply').addEventListener('click',applyPanel);
  $('raceRevert').addEventListener('click',()=>{const r=currentRecord();if(!r||!C.model||!C.originalMain)return;revertSetup(C.model.main,C.originalMain,r);refreshPanel();draw();setStatus('Selected circuit race setup restored to the loaded Disk.1 data.');});
  $('raceExport').addEventListener('click',()=>{const r=currentRecord();if(!r||!C.model)return;const b=makeCompactBin(C.model.main,r);downloadBytes(b,setupFilename(r));setStatus(`Exported ${setupFilename(r)} · ${b.length} bytes ($68).\nLayout: laps 2 · flag 4 · start 10 · pits 88.`);});
  $('raceExportAll').addEventListener('click',()=>{if(!C.model||!C.records)return;const seen=new Set(),out=[];for(const base of T.TRACK_BASE_IDS||[]){const r=C.records.find(q=>q.baseResourceId===base);if(!r||seen.has(r.index))continue;seen.add(r.index);downloadBytes(makeCompactBin(C.model.main,r),setupFilename(r));out.push(setupFilename(r));}setStatus(`Exported ${out.length} circuit setup files · ${out.length*COMPACT_SIZE} bytes total.\nEach file is an independent $68 WHDLoad override.`);});
  $('raceExportMain').addEventListener('click',()=>{if(C.model)downloadBytes(C.model.main,'indyheat_main_modified_v012.bin');});
  cv.addEventListener('pointerdown',pointerDown);cv.addEventListener('pointermove',pointerMove);cv.addEventListener('pointerup',pointerUp);cv.addEventListener('pointercancel',pointerUp);cv.addEventListener('contextmenu',e=>{if(active)e.preventDefault();});
  $('trackSelect')?.addEventListener('change',()=>setTimeout(()=>{currentPit=0;refreshPanel();draw();},0));
  $('editorScale')?.addEventListener('change',()=>setTimeout(draw,0));$('opacity')?.addEventListener('input',draw);
  document.addEventListener('indyheat-race-setup-capture',()=>setTimeout(()=>{ensureGraphics();refreshPanel();draw();},0));
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>draw()).observe(view);
  return true;
}

function viewCanvas(){return $('view');}function overlayCanvas(){return $('raceSetupCanvas');}
function syncSize(){const v=viewCanvas(),c=overlayCanvas();if(!v||!c)return;if(c.width!==v.width||c.height!==v.height){c.width=v.width;c.height=v.height;c.getContext('2d').imageSmoothingEnabled=false;}}
function activate(){
  if(active){draw();return;}
  $('layerModeWaypoints')?.click();const wp=$('showWaypoints');if(wp?.checked){wp.checked=false;wp.dispatchEvent(new Event('change',{bubbles:true}));}
  const buttons=$('layerModeButtons');buttons?.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
  active=true;$('layerEditRaceSetup')?.classList.add('active');$('raceSetupPane').hidden=false;$('layerDrawingPane')&&( $('layerDrawingPane').hidden=true );$('layerWaypointHost')&&( $('layerWaypointHost').hidden=true );
  const c=overlayCanvas();c?.classList.add('editing');refreshPanel();draw();
}
function deactivate(){active=false;drag=null;$('layerEditRaceSetup')?.classList.remove('active');$('raceSetupPane').hidden=true;const c=overlayCanvas();c?.classList.remove('editing','dragging');draw();}

function refreshPanel(){
  const s=currentSetup();if(!s){setStatus('Race setup data is not available for this circuit yet.');return;}
  $('raceLaps').value=s.laps;$('raceFlagX').value=s.flagX;$('raceFlagY').value=s.flagY;$('raceStartX').value=fixedText(s.startX);$('raceStartY').value=fixedText(s.startY);$('raceStartOrient').value=s.startOrient;
  currentPit=Math.max(0,Math.min(3,currentPit));$('racePitSlot').value=String(currentPit);const p=s.pits[currentPit];
  $('raceServiceX').value=fixedText(p.serviceX);$('raceServiceY').value=fixedText(p.serviceY);$('raceBoardX').value=fixedText(p.boardX);$('raceBoardY').value=fixedText(p.boardY);$('raceScreenX').value=p.screenX;$('raceScreenY').value=p.screenY;$('raceSlotWord').value=p.slotWord;
  const r=currentRecord(),d=dirty();
  setStatus(`${s.name||`Race ${s.recordIndex}`} · race record ${s.recordIndex} · pit block $${s.pitPointer.toString(16).toUpperCase()}\n${d?'Modified':'Unmodified'} · compact export ${COMPACT_SIZE} bytes ($68). Drag visible anchors or edit fields.`);
  $('raceRevert').disabled=!d;
}
function applyPanel(){
  const r=currentRecord(),s=currentSetup();if(!r||!s||!C.model)return;
  try{
    writeCommon(C.model.main,r.offset,{laps:Number($('raceLaps').value),flagX:Number($('raceFlagX').value),flagY:Number($('raceFlagY').value),startX:numberToFixed($('raceStartX').value),startY:numberToFixed($('raceStartY').value),startOrient:Number($('raceStartOrient').value)});
    writePit(C.model.main,s.pitFileOffset,currentPit,{serviceX:numberToFixed($('raceServiceX').value),serviceY:numberToFixed($('raceServiceY').value),boardX:numberToFixed($('raceBoardX').value),boardY:numberToFixed($('raceBoardY').value),screenX:Number($('raceScreenX').value),screenY:Number($('raceScreenY').value),slotWord:Number($('raceSlotWord').value)});
    refreshPanel();draw();setStatus(`${s.name} race/pit fields updated.${dirty()?' · Modified':''}`);
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
  // Register/draw the edit cursor first, then draw the authentic sprite over it.
  // This mirrors the requested layer order: positioned graphic above cursor.
  anchor(ctx,x,y,S,text,kind,slot,false);
  const img=spriteCanvas(id,index);if(img){const {canvas,frame}=img;ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(canvas,(x-frame.xOrigin)*S,(y-frame.yOrigin)*S,canvas.width*S,canvas.height*S);ctx.restore();}
  label(ctx,text,x*S+4*S,y*S+4*S,S);
}
function drawCarFootprint(ctx,x,y,S,heading16,text){
  if(!Number.isFinite(x)||!Number.isFinite(y))return;ctx.save();ctx.translate(x*S,y*S);ctx.rotate(angle16ToCanvasRadians(heading16));ctx.lineJoin='round';
  ctx.fillStyle='rgba(20,20,20,.72)';ctx.strokeStyle='rgba(255,255,255,.96)';ctx.lineWidth=Math.max(1,0.55*S);ctx.beginPath();ctx.moveTo(6*S,0);ctx.lineTo(3.5*S,-3*S);ctx.lineTo(-5*S,-3*S);ctx.lineTo(-6*S,-2*S);ctx.lineTo(-6*S,2*S);ctx.lineTo(-5*S,3*S);ctx.lineTo(3.5*S,3*S);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.strokeStyle='#ffd84a';ctx.beginPath();ctx.moveTo(2*S,0);ctx.lineTo(5*S,0);ctx.moveTo(4*S,-1*S);ctx.lineTo(5*S,0);ctx.lineTo(4*S,1*S);ctx.stroke();ctx.restore();label(ctx,text,(x+5)*S,(y-7)*S,S);
}
function draw(){
  const c=overlayCanvas(),v=viewCanvas();if(!c||!v)return;syncSize();const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);hitTargets=[];
  if(!active&&root.IndyHeatRaceOverlayOverride!==true)return;
  const s=currentSetup();if(!s)return;const S=c.width/320,alpha=Math.max(.25,Math.min(1,Number($('opacity')?.value||55)/100));ctx.globalAlpha=alpha;
  if($('raceShowStart')?.checked){const q=projectFixedXZ(s.startX,s.startY);if(q)anchor(ctx,q.x,q.y,S,'START GRID','start');}
  if($('raceShowGridCars')?.checked){for(const car of gridCarPositions(s)){const q=projectFixedXZ(car.x,car.y);if(q)drawCarFootprint(ctx,q.x,q.y,S,car.heading16,`C${car.index+1}`);}}
  const record=currentRecord();
  for(const p of s.pits){
    let serviceQ=null;
    if($('raceShowPits')?.checked){serviceQ=projectFixedXZ(p.serviceX,p.serviceY);if(serviceQ)anchor(ctx,serviceQ.x,serviceQ.y,S,`P${p.index+1} STOP`,'service',p.index);if(p.screenX>=0&&p.screenX<320&&p.screenY>=0&&p.screenY<256)drawSprite(ctx,0x05,0,p.screenX,p.screenY,S,`P${p.index+1} CREW`,'screen',p.index);}
    if($('raceShowPitCars')?.checked){serviceQ=serviceQ||projectFixedXZ(p.serviceX,p.serviceY);if(serviceQ){const h=pitHeadingFromRoute(record,p);drawCarFootprint(ctx,serviceQ.x,serviceQ.y,S,h==null?(s.startOrient&0xffff):h,`P${p.index+1} CAR`);}}
    if($('raceShowBoards')?.checked){const q=projectFixedXZ(p.boardX,p.boardY);if(q)drawSprite(ctx,0x08,0,q.x,q.y,S,`P${p.index+1} PIT`,'board',p.index);}
  }
  if($('raceShowFlag')?.checked&&s.flagX>=0&&s.flagX<320&&s.flagY>=0&&s.flagY<256)drawSprite(ctx,0x0F,26,s.flagX,s.flagY,S,'FLAG','flag');
  // The old top-left browser-only "LAPS n" diagnostic is intentionally omitted.
  // The authentic on-track lap presentation is rendered by the Race HUD layer.
  ctx.globalAlpha=1;
}
function eventXY(e){const c=overlayCanvas(),r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*320/r.width,y:(e.clientY-r.top)*256/r.height};}
function nearestTarget(x,y){let best=null,bd=14*14;for(const t of hitTargets){const dx=t.x-x,dy=t.y-y,d=dx*dx+dy*dy;if(d<bd){bd=d;best=t;}}return best;}
function pointerDown(e){if(!active||e.button!==0)return;const p=eventXY(e),t=nearestTarget(p.x,p.y);if(!t)return;e.preventDefault();e.stopPropagation();drag={...t,pointerId:e.pointerId};overlayCanvas().setPointerCapture?.(e.pointerId);overlayCanvas().classList.add('dragging');if(t.index!=null){currentPit=t.index;$('racePitSlot').value=String(currentPit);}refreshPanel();}
function writeDrag(t,x,y){
  const r=currentRecord(),s=currentSetup();if(!r||!s||!C.model)return;
  if(t.kind==='flag'){writeCommon(C.model.main,r.offset,{flagX:Math.round(x),flagY:Math.round(y)});return;}
  if(t.kind==='screen'){writePit(C.model.main,s.pitFileOffset,t.index,{screenX:Math.round(x),screenY:Math.round(y)});return;}

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
function pointerUp(e){if(!drag||drag.pointerId!==e.pointerId)return;try{overlayCanvas().releasePointerCapture?.(e.pointerId);}catch(_e){}drag=null;overlayCanvas().classList.remove('dragging');refreshPanel();draw();}

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
 *   race_setup.bin deliberately remains the proven $68 format.
 *   The editor adds an optional ninth package sidecar, name.bin, containing the
 *   exact 18 raw bytes. Older editor builds ignore the extra ZIP member.
 *   Name authoring is kept as package metadata instead of mutating the shared
 *   retail template record, so switching imported packages cannot leak a name
 *   into the host circuit used by another package.
 */

const NAME_OFFSET=0x70;
const NAME_SIZE=0x12;
const NAME_DISPLAY_SIZE=0x11;
const NAME_LEFT_FILL=0x3c; // '<'
const NAME_RIGHT_FILL=0x40; // '@'

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
const RETAIL_ROUTE_COUNTS=Object.freeze([
  Object.freeze([46,46,45]), // Illinois
  Object.freeze([55,61,49]), // New Jersey
  Object.freeze([56,67,47]), // West Canada
  Object.freeze([63,67,66]), // South California
  Object.freeze([76,77,53]), // East Canada
  Object.freeze([68,70,54]), // Indianapolis
  Object.freeze([71,77,71]), // Michigan
  Object.freeze([77,73,71]), // Colorado
  Object.freeze([49,46,42]), // North California
  Object.freeze([82,80,77])  // Kentucky
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
  commitPendingImportedName();
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
    input.addEventListener('input',()=>{input.dataset.editing='1';updateCounter();});
  }
  const apply=$('raceApply');
  if(apply&&!apply.dataset.circuitNameHook){
    apply.dataset.circuitNameHook='1';
    apply.addEventListener('click',e=>{
      try{
        const bytes=encodeNameBytes($('raceCircuitName').value);
        authoredNames.set(currentNameKey(),bytes);
        $('raceCircuitName').dataset.editing='';
      }catch(err){
        e.preventDefault();e.stopImmediatePropagation();setRaceStatus(`ERROR: ${err.message}`);
      }
    },true);
    apply.addEventListener('click',()=>setTimeout(()=>syncNameUi(true),0));
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
        let circuitIndex=null,hit=null;
        for(const [name,data] of entries){
          const root=/^circuit_(\d{2})\//.exec(name);if(root&&circuitIndex==null)circuitIndex=Number(root[1]);
          const m=/^circuit_(\d{2})\/name\.bin$/.exec(name);
          if(m){hit={circuitIndex:Number(m[1]),bytes:data};break;}
        }
        if(hit){
          if(hit.bytes.length!==NAME_SIZE)throw new Error(`name.bin must be exactly $${NAME_SIZE.toString(16).toUpperCase()} bytes`);
          if(hit.bytes[NAME_DISPLAY_SIZE]!==0)throw new Error('name.bin byte 17 must be the terminating NUL');
          for(let i=0;i<NAME_DISPLAY_SIZE;i++)if(hit.bytes[i]<32||hit.bytes[i]>126)throw new Error('name.bin display bytes must be printable ASCII');
          pendingImportedName={circuitIndex:hit.circuitIndex,bytes:hit.bytes.slice()};
        }else pendingImportedName={circuitIndex,bytes:null};
        setTimeout(()=>{commitPendingImportedName();syncNameUi(true);},50);
        setTimeout(()=>{commitPendingImportedName();syncNameUi(true);},250);
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
    presentationBin
  });
  const folder=P.circuitFolder(circuitIndex);
  files.push({name:`${folder}/name.bin`,data:nameBytes.slice()});
  files.push({name:`${folder}/template.bin`,data:Uint8Array.of(0,templateIndex)});
  return {files,waypointCounts:wp.counts,presentationBin,previewBytes:preview.resource.data.slice()};
}
function verifyDirectPackage(P,zipBytes,circuitIndex,expectedName,expectedLaps,expectedMapId){
  const folder=P.circuitFolder(circuitIndex),entries=P.readZipStore(zipBytes);
  const get=name=>{const b=entries.get(`${folder}/${name}`);if(!b)throw new Error(`Internal export verification failed: missing ${name}`);return b;};
  const nameBytes=get('name.bin');
  if(decodeNameBytes(nameBytes)!==expectedName)throw new Error(`Internal export verification failed: name is ${decodeNameBytes(nameBytes)}, expected ${expectedName}`);
  const setup=get('race_setup.bin'),laps=(setup[0]<<8)|setup[1];
  if(laps!==expectedLaps)throw new Error(`Internal export verification failed: laps are ${laps}, expected ${expectedLaps}`);
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
  // v0.32 owns circuit ZIP serialisation here.  Stop circuit-package.js's older
  // click handler completely so stale parallel editor models cannot win later.
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
    if(e.detail?.type==='model'){authoredNames.clear();pendingImportedName=null;}
    setTimeout(()=>syncNameUi(true),0);
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});
else setTimeout(boot,0);

})(typeof globalThis!=='undefined'?globalThis:this);
