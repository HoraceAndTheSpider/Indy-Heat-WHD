(function(root){
'use strict';

/*
 * Indy Heat Circuit Editor v0.19.5 corrective UI layer.
 *
 * Loader compatibility:
 *   The filename remains editor-fixes-v0193.js because recovery-hook.js on the
 *   current master already loads that path.  This replacement deliberately
 *   updates the visible editor version to v0.19.5 without changing the circuit
 *   package/runtime formats.
 *
 * v0.19.5 consolidates the remaining Race-HUD/UI fixes:
 * - render the genuine $6B02 two-tone/masked current-lap and timer cells;
 * - move HUD dragging onto a dedicated hit-region aligned with the visible HUD;
 * - keep a stable-width editor column whether or not vertical scrolling is needed;
 * - defer MiniMap recolouring until the project supplies an explicit remap table;
 * - keep the established v0.19.4 mode, fold and 1..20-lap behaviour.
 */

if(typeof document==='undefined')return;

const $=id=>document.getElementById(id);
const TRACK_W=320,TRACK_H=256,TRACK_GAME_H=224,PREVIEW_W=78,PREVIEW_H=51;
const AUTHORED_LAP_MIN=1,AUTHORED_LAP_MAX=20;
const HUD_LAYOUT=Object.freeze({
  currentLapRows:Object.freeze([0,9,18,27]),
  totalLaps:Object.freeze({x:-4,y:43}),
  timerDigits:Object.freeze([{x:-8,y:47},{x:0,y:47},{x:8,y:47}])
});
const HUD_CAR_SOURCE_ORDER=Object.freeze([0,2,1,3]); // retail source blocks: red, yellow, blue, grey
const HUD_TIMER_SOURCE=3;
const RETAIL_HUD_MASK_SINGLE=Object.freeze([0x1C,0xBE,0xBE,0x1C,0xBE,0xBE,0x1C]);
const RETAIL_HUD_SOURCE_ROWS=Object.freeze([
  Object.freeze([0x7F,0x7F,0x7F,0x7F,0x7F]), // red source
  Object.freeze([0x7F,0x7F,0x7F,0x7F,0x00]), // blue source
  Object.freeze([0x7F,0x7F,0x7F,0x00,0x7F]), // yellow source
  Object.freeze([0x7F,0x7F,0x7F,0x00,0x00])  // grey source / timer
]);
const LAP_TOTAL_ORIGIN=Object.freeze({x:5,y:3});

let hudDrag=null;
let uiEventsInstalled=false;
let resizeObserver=null;
let opacityObserver=null;
let modeCoordinatorInstalled=false;
let foldSyncInstalled=false;
let paletteFixInstalled=false;
let raceCanvasPatched=false;
let lapObserver=null;
let modeGuard=false;
let policyGuard=false;

const groupMemory={
  pits:{autoDisabled:false,values:null},
  race:{autoDisabled:false,values:null}
};

const MODE_ORDER=Object.freeze([
  'layerEditBackdrop',
  'layerEditMask',
  'layerEditSurface',
  'layerModeWaypoints',
  'layerEditRaceSetup',
  'layerEditMini',
  'layerEditMap',
  'layerEditRecovery'
]);

const PIT_TOGGLES=Object.freeze(['circuitShowPits','circuitShowBoards','circuitShowPitCars']);
const RACE_TOGGLES=Object.freeze([
  'circuitShowStart','circuitShowGridCars','circuitShowFlag',
  'circuitShowCurrentLaps','circuitShowTotalLaps','circuitShowTimer'
]);

function packageTools(){return root.IndyHeatCircuitPackage||null;}
function indyTools(){return root.IndyHeatTools||null;}
function capture(){return root.IndyHeatRaceSetupCapture||null;}
function sourceTrackIndex(){return Number($('trackSelect')?.value||0);}

function uniq(items){
  const out=[];
  for(const x of items)if(x&&!out.includes(x))out.push(x);
  return out;
}
function authoringModels(){
  const C=capture();
  return C?uniq([C.coreModel,C.layerModel,C.model,...(C.models||[])]):[];
}
function primaryModel(){
  const C=capture();
  return C?.model||C?.layerModel||C?.coreModel||authoringModels()[0]||null;
}
function resourceModel(){
  const C=capture();
  return C?.layerModel||C?.model||C?.coreModel||authoringModels()[0]||null;
}
function recordsForModel(model){
  const C=capture(),T=indyTools();
  if(!model||!T)return [];
  let records=C?.recordsByMain?.get(model.main)||null;
  if(!records){
    records=T.parseRaceRecords(model.main);
    C?.recordsByMain?.set(model.main,records);
  }
  for(const r of records){
    if(r.baseResourceId==null&&typeof T.raceBaseResourceId==='function')
      r.baseResourceId=T.raceBaseResourceId(r,model.resourceTableOffset+0x1000);
    if(!r.waypointDescriptors&&typeof T.parseWaypointDescriptors==='function')
      r.waypointDescriptors=T.parseWaypointDescriptors(model.main,r);
  }
  return records;
}
function recordForModel(model,index=sourceTrackIndex()){
  const T=indyTools();
  if(!model||!T)return null;
  const base=T.TRACK_BASE_IDS?.[index];
  return recordsForModel(model).find(r=>r.baseResourceId===base)||null;
}
function presentation(){
  const P=packageTools(),m=primaryModel(),r=recordForModel(m);
  return P&&m&&r?{P,m,r,p:P.readPresentation(m.main,r.offset)}:null;
}

function setVersionLabel(){
  const re=/v0\.(?:11|12|13|14|15|16|17|18|19(?:\.[1-5])?)/i;
  const h=document.querySelector('header h1');
  if(h)h.textContent=h.textContent.replace(re,'v0.19.5');
  document.title=document.title.replace(re,'v0.19.5');
}

function installStyle(){
  if($('indyheatFix0195Style'))return;
  const s=document.createElement('style');
  s.id='indyheatFix0195Style';
  s.textContent=`
    body[data-indyheat-v0195-fix="1"] #circuitRaceHudCanvas,
    body[data-indyheat-v0195-fix="1"] #editorFixHudCanvas{display:none!important}
    #editorFixHudCanvas194{
      position:absolute;inset:0;z-index:6;display:block;pointer-events:none;
      image-rendering:pixelated;image-rendering:crisp-edges
    }
    #editorFixHudCanvas194[hidden]{display:none!important}
    #editorFixHudDragHit194{
      position:absolute;z-index:7;display:block;cursor:move;touch-action:none;
      background:transparent;user-select:none;-webkit-user-select:none
    }
    #editorFixHudDragHit194[hidden]{display:none!important}
    #layerEditorColumn{
      box-sizing:border-box!important;width:286px!important;min-width:286px!important;max-width:286px!important;
      overflow-y:scroll!important;overflow-x:hidden!important;scrollbar-gutter:stable!important
    }

    #layerModeButtons{
      grid-template-columns:repeat(3,minmax(0,1fr))!important
    }
    #layerModeButtons button{min-width:0}
    details.indyheatViewFold{
      padding:6px 8px;margin:6px 0;background:#14171c;
      border:1px solid #30343d;border-radius:6px
    }
    details.indyheatViewFold>summary.indyheatFoldSummary{
      font-size:12px;color:#ccd3df;cursor:pointer
    }
    .indyheatFoldSummaryContent{
      display:inline-flex;align-items:center;justify-content:space-between;
      width:calc(100% - 1.35em);gap:8px
    }
    .indyheatFoldMaster{
      display:inline-flex;align-items:center;margin:0 0 0 auto;padding:0;
      color:#ccd3df;cursor:pointer
    }
    .indyheatFoldMaster input{margin:0}
    .indyheatMasterSource{display:none!important}
    details.indyheatViewFold .classToggles{padding-left:12px}
    .indyheatViewToggleBody,.circuitViewToggleBody{padding:3px 0 4px 12px}
    .indyheatViewToggleBody label,.circuitViewToggleBody label{margin:5px 0}
    @media(max-width:1050px){#layerEditorColumn{width:100%!important;min-width:0!important;max-width:none!important;overflow-y:visible!important;scrollbar-gutter:auto!important}}
  `;
  document.head.appendChild(s);
}

/* -------------------------------------------------------------------------
 * Zoom + mode navigation.
 * ---------------------------------------------------------------------- */
function renameZoom(){
  const title=document.querySelector('#masterZoomHost .masterZoomTitle');
  if(title&&title.textContent!=='Zoom')title.textContent='Zoom';
  const control=$('masterZoomControl');
  if(control){
    for(const n of Array.from(control.childNodes)){
      if(n.nodeType===3&&/Master\s+Circuit\s+Zoom/i.test(n.textContent||'')){
        n.textContent=(n.textContent||'').replace(/Master\s+Circuit\s+Zoom/ig,'Zoom');
      }
    }
  }
}
function reorderModeButtons(){
  const host=$('layerModeButtons');
  if(!host)return false;
  let found=0;
  for(const id of MODE_ORDER){
    const b=$(id);
    if(!b||b.parentNode!==host)continue;
    if(id==='layerEditMini')b.textContent='MiniMap';
    host.appendChild(b);
    found++;
  }
  return found>=7;
}
function recoveryActuallyActive(){
  const pane=$('recoveryEditorPane'),canvas=$('recoveryEditCanvas'),button=$('layerEditRecovery');
  return !!((pane&&!pane.hidden)||canvas?.classList.contains('editing')||button?.classList.contains('active'));
}
function deactivateRecoveryThroughOwnApi(){
  if(!recoveryActuallyActive())return;
  const wp=$('layerModeWaypoints');
  if(!wp)return;
  modeGuard=true;
  try{wp.click();}finally{modeGuard=false;}
}

function setCheck(id,value){
  const e=$(id);
  if(!e||e.checked===!!value)return;
  e.checked=!!value;
  e.dispatchEvent(new Event('change',{bubbles:true}));
}
function currentValues(ids){return ids.map(id=>!!$(id)?.checked);}
function groupHasAny(ids){return ids.some(id=>!!$(id)?.checked);}
function disableGroup(kind,ids){
  const mem=groupMemory[kind];
  if(!mem.autoDisabled){
    mem.values=currentValues(ids);
    mem.autoDisabled=true;
  }
  for(const id of ids)setCheck(id,false);
}
function restoreGroup(kind,ids){
  const mem=groupMemory[kind];
  const values=mem.values||ids.map(()=>true);
  for(let i=0;i<ids.length;i++)setCheck(ids[i],values[i]!==false);
  mem.autoDisabled=false;
}
function disableRacePresentation(){
  disableGroup('pits',PIT_TOGGLES);
  disableGroup('race',RACE_TOGGLES);
}
function applyModeOverlayPolicy(id){
  policyGuard=true;
  try{
    const mask=id==='layerEditMask';
    const surface=id==='layerEditSurface';
    const waypoints=id==='layerModeWaypoints';
    const race=id==='layerEditRaceSetup';

    setCheck('layerShowMask',mask);
    setCheck('layerShowSurface',surface);
    setCheck('showWaypoints',waypoints);

    if(race){
      restoreGroup('pits',PIT_TOGGLES);
      restoreGroup('race',RACE_TOGGLES);
    }else{
      disableRacePresentation();
    }
  }finally{
    policyGuard=false;
    syncFoldMasters();
    renderHud();
  }
}
function installModeCoordinator(){
  if(modeCoordinatorInstalled)return true;
  const host=$('layerModeButtons');
  if(!host)return false;
  modeCoordinatorInstalled=true;

  document.addEventListener('click',e=>{
    const b=e.target?.closest?.('#layerModeButtons button');
    if(!b||modeGuard)return;
    const id=b.id;
    // Existing mode implementations intentionally use .click() on Waypoints as
    // an internal hand-off/deactivation mechanism.  Only a trusted user click
    // should establish the new overlay policy; synthetic clicks must not win
    // a later setTimeout race and re-enable Waypoints behind the chosen mode.
    if(e.isTrusted===false)return;
    if(id!=='layerEditRecovery'&&recoveryActuallyActive())deactivateRecoveryThroughOwnApi();
    setTimeout(()=>{
      reorderModeButtons();
      applyModeOverlayPolicy(id);
      syncOverlayOpacity();
    },0);
  },true);

  // If the user manually re-enables a Race/Pits overlay for comparison while
  // another mode is active, retain that choice as the next Race-mode baseline.
  document.addEventListener('change',e=>{
    if(policyGuard)return;
    const id=e.target?.id;
    if(PIT_TOGGLES.includes(id)){
      groupMemory.pits.autoDisabled=false;
      groupMemory.pits.values=currentValues(PIT_TOGGLES);
    }else if(RACE_TOGGLES.includes(id)){
      groupMemory.race.autoDisabled=false;
      groupMemory.race.values=currentValues(RACE_TOGGLES);
    }
    syncFoldMasters();
  });
  return true;
}

/* -------------------------------------------------------------------------
 * Fold headers: title + adjacent master checkbox.
 * ---------------------------------------------------------------------- */
function dispatchAggregate(ids,value){
  policyGuard=true;
  try{for(const id of ids)setCheck(id,value);}
  finally{policyGuard=false;syncFoldMasters();renderHud();}
}
function installMasterSummary(details,title,masterId,sourceIds,{hideNode=null,single=false}={}){
  if(!details)return null;
  details.classList.add('indyheatViewFold');
  let summary=details.querySelector(':scope > summary');
  if(!summary){
    summary=document.createElement('summary');
    details.prepend(summary);
  }
  summary.classList.add('indyheatFoldSummary');

  let master=$(masterId);
  if(!master){
    summary.textContent='';
    const content=document.createElement('span');
    content.className='indyheatFoldSummaryContent';
    const text=document.createElement('span');
    text.className='indyheatFoldTitle';
    text.textContent=title;
    const label=document.createElement('label');
    label.className='indyheatFoldMaster';
    label.title=`Show / hide ${title}`;
    label.innerHTML=`<input id="${masterId}" type="checkbox" aria-label="Show ${title}">`;
    content.append(text,label);
    summary.appendChild(content);
    master=label.querySelector('input');

    const stop=e=>e.stopPropagation();
    label.addEventListener('click',stop);
    master.addEventListener('click',stop);
    master.addEventListener('change',()=>{
      if(single)setCheck(sourceIds[0],master.checked);
      else dispatchAggregate(sourceIds,master.checked);
      syncFoldMasters();
      renderHud();
    });
  }else{
    const text=summary.querySelector('.indyheatFoldTitle');
    if(text)text.textContent=title;
  }
  if(hideNode)hideNode.classList.add('indyheatMasterSource');
  return master;
}
function aggregateState(ids){
  const present=ids.map(id=>$(id)).filter(Boolean);
  if(!present.length)return {checked:false,indeterminate:false};
  const n=present.filter(e=>e.checked).length;
  return {checked:n===present.length,indeterminate:n>0&&n<present.length};
}
function syncMaster(id,ids){
  const m=$(id);
  if(!m)return;
  const s=aggregateState(ids);
  m.checked=s.checked;
  m.indeterminate=s.indeterminate;
}
function ensureLeftFolds(){
  const surface=$('layerShowSurface'),waypoint=$('showWaypoints');
  const surfaceRow=surface?.closest('.layerControlRow')||surface?.parentElement||null;
  const wpLabel=waypoint?.closest('label')||null;
  const surfaceDetails=surface?.closest('details[data-circuit-fold]')||surfaceRow?.closest('details');
  const waypointDetails=waypoint?.closest('details[data-circuit-fold]')||wpLabel?.closest('details');
  const pits=$('circuitViewPits');
  const race=$('circuitViewRaceControl');

  if(surfaceDetails){
    surfaceDetails.id='circuitViewSurface';
    installMasterSummary(surfaceDetails,'Surface Types','circuitMasterSurface',['layerShowSurface'],{hideNode:surfaceRow,single:true});
  }
  if(waypointDetails){
    waypointDetails.id='circuitViewWaypoints';
    installMasterSummary(waypointDetails,'Waypoints','circuitMasterWaypoints',['showWaypoints'],{hideNode:wpLabel,single:true});
  }
  if(pits)installMasterSummary(pits,'Pits','circuitMasterPits',PIT_TOGGLES);
  if(race)installMasterSummary(race,'Race Control','circuitMasterRace',RACE_TOGGLES);

  if(!foldSyncInstalled){
    foldSyncInstalled=true;
    document.addEventListener('change',syncFoldMasters);
  }
  syncFoldMasters();
  return !!(surfaceDetails&&waypointDetails&&pits&&race);
}
function syncFoldMasters(){
  syncMaster('circuitMasterSurface',['layerShowSurface']);
  syncMaster('circuitMasterWaypoints',['showWaypoints']);
  syncMaster('circuitMasterPits',PIT_TOGGLES);
  syncMaster('circuitMasterRace',RACE_TOGGLES);
}

/* -------------------------------------------------------------------------
 * Overlay opacity only belongs to circuit-overlay modes, not Map/MiniMap.
 * ---------------------------------------------------------------------- */
function auxModeOwnsCanvas(){
  const pane=$('circuitAuxPane');
  if(!pane||pane.hidden)return false;
  const map=$('circuitMapControls'),mini=$('circuitPreviewControls');
  return !!((map&&!map.hidden)||(mini&&!mini.hidden));
}
function syncOverlayOpacity(){
  const e=$('overlayOpacityControl');
  if(!e)return false;
  const hide=auxModeOwnsCanvas();
  e.hidden=hide;
  e.style.display=hide?'none':'';
  e.setAttribute('aria-hidden',hide?'true':'false');
  return true;
}
function installOpacityWatch(){
  const pane=$('circuitAuxPane');
  if(pane&&!opacityObserver&&typeof MutationObserver!=='undefined'){
    opacityObserver=new MutationObserver(syncOverlayOpacity);
    opacityObserver.observe(pane,{attributes:true,subtree:true,attributeFilter:['hidden','class','style']});
  }
  syncOverlayOpacity();
}

/* -------------------------------------------------------------------------
 * Lap authoring contract: 1..20.
 * ---------------------------------------------------------------------- */
function lapStatus(message){
  const race=$('raceSetupStatus');
  if(race)race.textContent=message;
  const top=$('circuitPackageTopStatus');
  if(top){top.textContent=message;top.classList.toggle('bad',/^ERROR:/.test(message));}
}
function lapValue(){
  const q=presentation();
  return q?Number(q.p.laps):NaN;
}
function ensureLapContract(){
  const e=$('raceLaps');
  if(!e)return false;
  e.min=String(AUTHORED_LAP_MIN);
  e.max=String(AUTHORED_LAP_MAX);
  e.title='Authored custom range: 1–20. Lap 20 is displayed as F during gameplay.';
  if(!e.dataset.v0194LapGuard){
    e.dataset.v0194LapGuard='1';
    e.addEventListener('input',()=>{
      if(e.value==='')return;
      let v=Number(e.value);
      if(Number.isFinite(v)&&v>AUTHORED_LAP_MAX)e.value=String(AUTHORED_LAP_MAX);
      if(Number.isFinite(v)&&v<AUTHORED_LAP_MIN)e.value=String(AUTHORED_LAP_MIN);
    });
  }
  if(!lapObserver&&typeof MutationObserver!=='undefined'){
    lapObserver=new MutationObserver(()=>{
      if(e.min!==String(AUTHORED_LAP_MIN))e.min=String(AUTHORED_LAP_MIN);
      if(e.max!==String(AUTHORED_LAP_MAX))e.max=String(AUTHORED_LAP_MAX);
      const wanted='Authored custom range: 1–20. Lap 20 is displayed as F during gameplay.';
      if(e.title!==wanted)e.title=wanted;
    });
    lapObserver.observe(e,{attributes:true,attributeFilter:['min','max','title']});
  }
  return true;
}
function installLapGuards(){
  if(document.body?.dataset.v0194LapGuards)return;
  document.body.dataset.v0194LapGuards='1';

  document.addEventListener('click',e=>{
    const b=e.target?.closest?.('button');
    if(!b)return;
    if(b.id==='raceApply'){
      const v=Number($('raceLaps')?.value);
      if(!Number.isInteger(v)||v<AUTHORED_LAP_MIN||v>AUTHORED_LAP_MAX){
        e.preventDefault();e.stopImmediatePropagation();
        lapStatus(`ERROR: Lap total must be ${AUTHORED_LAP_MIN}–${AUTHORED_LAP_MAX}.`);
        $('raceLaps')?.focus();
      }
    }
    if(b.id==='circuitPackageZip'){
      const v=lapValue();
      if(!Number.isInteger(v)||v<AUTHORED_LAP_MIN||v>AUTHORED_LAP_MAX){
        e.preventDefault();e.stopImmediatePropagation();
        lapStatus(`ERROR: Circuit package lap total must be ${AUTHORED_LAP_MIN}–${AUTHORED_LAP_MAX} before export.`);
        $('raceLaps')?.focus();
      }
    }
  },true);
}

/* -------------------------------------------------------------------------
 * Remove old Race canvas top-left "LAPS n" debug label without touching the
 * authentic pit/start/flag graphics on that canvas.
 * ---------------------------------------------------------------------- */
function patchRaceCanvasDebugLabel(){return true;}

/* -------------------------------------------------------------------------
 * Pixel-accurate Race HUD.
 *
 * Retail glyphs at runtime $6EA4 occupy 8-byte slots. Each row is an 8-bit
 * mask. Previous editor code rendered only bits 5..0, shifting visible pixels
 * two pixels left. Rendering bits 7..0 reproduces the retail cell position.
 * ---------------------------------------------------------------------- */
function rgb(word){return [((word>>>8)&15)*17,((word>>>4)&15)*17,(word&15)*17];}
function presentationRgb(index){
  const P=packageTools(),w=P?.PRESENTATION_PALETTE_WORDS?.[index]??0xfff;
  return rgb(w);
}
function raceRgb(index){
  const T=indyTools(),w=T?.VERIFIED_TRACK_PALETTE_WORDS?.[index]??0xfff;
  return rgb(w);
}
function drawRetailGlyph(ctx,digit,x,y,S,sourceIndex){
  const rows=packageTools()?.GAME_HUD_DIGITS?.[Number(digit)];
  const source=RETAIL_HUD_SOURCE_ROWS[Number(sourceIndex)];
  if(!rows||!source)return;
  for(let yy=0;yy<7;yy++){
    const glyph=rows[yy]||0,mask=RETAIL_HUD_MASK_SINGLE[yy]||0;
    for(let xx=0;xx<8;xx++){
      const bit=0x80>>>xx;
      let colourIndex=1; // $6B02 leaves the cell background as race palette colour 1 (black).
      if(glyph&bit){
        colourIndex=0;
        if(source[0]&bit)colourIndex|=1;
        if((source[1]&bit)&&(mask&bit))colourIndex|=2;
        if(source[2]&bit)colourIndex|=4;
        if(source[3]&bit)colourIndex|=8;
        if(source[4]&bit)colourIndex|=16;
      }
      const c=raceRgb(colourIndex);
      ctx.fillStyle=`rgb(${c[0]},${c[1]},${c[2]})`;
      ctx.fillRect((x+xx)*S,(y+yy)*S,Math.max(1,S),Math.max(1,S));
    }
  }
}
function drawTotalDigit(ctx,digit,x,y,S){
  const rows=packageTools()?.HUD_DIGITS?.[Number(digit)];
  if(!rows)return;
  const dark=raceRgb(5),light=raceRgb(6);
  for(let yy=0;yy<5;yy++){
    const dm=rows[yy][0],lm=rows[yy][1];
    for(let xx=0;xx<3;xx++){
      const bit=1<<(2-xx),c=(lm&bit)?light:(dm&bit)?dark:null;
      if(!c)continue;
      ctx.fillStyle=`rgb(${c[0]},${c[1]},${c[2]})`;
      ctx.fillRect((x+xx)*S,(y+yy)*S,Math.max(1,S),Math.max(1,S));
    }
  }
}
function drawTotal20(ctx,rendererX,rendererY,S){
  // Test-14/22 compositor source colours are race-palette 1/5/6:
  // black field, dark grey and light grey.  This is NOT the Gasoline Alley
  // presentation palette used by the prior editor preview.
  const x=rendererX-LAP_TOTAL_ORIGIN.x;
  const y=rendererY-LAP_TOTAL_ORIGIN.y;
  const bg=raceRgb(1);
  ctx.fillStyle=`rgb(${bg[0]},${bg[1]},${bg[2]})`;
  ctx.fillRect(x*S,y*S,9*S,5*S);
  drawTotalDigit(ctx,2,x+1,y,S);
  drawTotalDigit(ctx,0,x+5,y,S);
}
function raceActive(){
  const pane=$('raceSetupPane'),button=$('layerEditRaceSetup');
  return !!(pane&&!pane.hidden&&button?.classList.contains('active'));
}
function viewerStack(){
  return $('view')?.closest('.canvasStack')||$('view')?.parentElement||null;
}
function hudCanvas(){return $('editorFixHudCanvas194');}
function ensureHudCanvas(){
  const stack=viewerStack(),view=$('view');
  if(!stack||!view)return false;
  let c=hudCanvas();
  if(!c){
    c=document.createElement('canvas');
    c.id='editorFixHudCanvas194';
    c.hidden=true;
    stack.appendChild(c);
  }
  let hit=$('editorFixHudDragHit194');
  if(!hit){
    hit=document.createElement('div');
    hit.id='editorFixHudDragHit194';
    hit.hidden=true;
    hit.title='Drag lap tower / HUD';
    stack.appendChild(hit);
  }
  if(c.width!==view.width||c.height!==view.height){
    c.width=view.width;c.height=view.height;
    c.getContext('2d').imageSmoothingEnabled=false;
  }
  if(!resizeObserver&&typeof ResizeObserver!=='undefined'){
    resizeObserver=new ResizeObserver(()=>renderHud());
    resizeObserver.observe(view);
  }
  return true;
}
function syncHudDragHit(p){
  const hit=$('editorFixHudDragHit194'),view=$('view'),stack=viewerStack();
  if(!hit||!view||!stack||!p||!raceActive()){
    if(hit)hit.hidden=true;
    return;
  }
  const baseX=Number(p.lapDisplayX)||0,baseY=Number(p.lapDisplayY)||0;
  const x0=Math.max(0,baseX-14),x1=Math.min(TRACK_W,baseX+14);
  const y0=Math.max(0,baseY-4),y1=Math.min(TRACK_H,baseY+58);
  if(x1<=x0||y1<=y0){hit.hidden=true;return;}
  const vr=view.getBoundingClientRect(),sr=stack.getBoundingClientRect();
  const sx=vr.width/TRACK_W,sy=vr.height/TRACK_H;
  hit.style.left=`${vr.left-sr.left+x0*sx}px`;
  hit.style.top=`${vr.top-sr.top+y0*sy}px`;
  hit.style.width=`${(x1-x0)*sx}px`;
  hit.style.height=`${(y1-y0)*sy}px`;
  hit.hidden=false;
}
function hudEnabled(id){const e=$(id);return e?!!e.checked:true;}
function hudHandle(p){
  const ax=Number(p?.lapDisplayX)||0,ay=Number(p?.lapDisplayY)||0,m=8;
  const x=Math.max(m,Math.min(TRACK_W-m,ax));
  const y=Math.max(m,Math.min(TRACK_H-m,ay));
  return {x,y,actualX:ax,actualY:ay,clamped:x!==ax||y!==ay};
}
function safeHudAnchor(p){
  return {
    x:Math.max(12,Math.min(296,Number(p?.lapDisplayX)||0)),
    y:Math.max(8,Math.min(194,Number(p?.lapDisplayY)||0))
  };
}
function renderHud(){
  if(!ensureHudCanvas())return;
  const c=hudCanvas(),ctx=c.getContext('2d');
  ctx.clearRect(0,0,c.width,c.height);
  c.hidden=!raceActive();
  if(c.hidden){syncHudDragHit(null);return;}

  const q=presentation();
  if(!q)return;
  const p=q.p,S=c.width/TRACK_W;
  const alpha=Math.max(.25,Math.min(1,Number($('opacity')?.value||55)/100));
  ctx.save();
  ctx.globalAlpha=alpha;

  if(hudEnabled('circuitShowCurrentLaps')){
    for(let i=0;i<4;i++)
      drawRetailGlyph(ctx,i+1,p.lapDisplayX,p.lapDisplayY+HUD_LAYOUT.currentLapRows[i],S,HUD_CAR_SOURCE_ORDER[i]);
  }
  if(hudEnabled('circuitShowTotalLaps')){
    drawTotal20(ctx,p.lapDisplayX+HUD_LAYOUT.totalLaps.x,p.lapDisplayY+HUD_LAYOUT.totalLaps.y,S);
  }
  if(hudEnabled('circuitShowTimer')){
    for(const d of HUD_LAYOUT.timerDigits)
      drawRetailGlyph(ctx,0,p.lapDisplayX+d.x,p.lapDisplayY+d.y,S,HUD_TIMER_SOURCE);
  }

  const h=hudHandle(p),x=h.x*S,y=h.y*S;
  ctx.globalAlpha=1;
  ctx.strokeStyle='#ffd84a';
  ctx.fillStyle='#ffd84a';
  ctx.lineWidth=Math.max(1,.7*S);
  ctx.beginPath();
  ctx.moveTo(x-5*S,y);ctx.lineTo(x+5*S,y);
  ctx.moveTo(x,y-5*S);ctx.lineTo(x,y+5*S);
  ctx.stroke();

  if(h.clamped){
    ctx.font=`${Math.max(9,Math.round(3.4*S))}px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`;
    ctx.textBaseline='top';
    const t=`HUD ${h.actualX},${h.actualY}`;
    const w=ctx.measureText(t).width;
    const tx=Math.max(2,Math.min(c.width-w-2,x+5*S));
    const ty=Math.max(2,Math.min(c.height-12,y+4*S));
    ctx.fillText(t,tx,ty);
  }
  ctx.restore();

  syncHudDragHit(p);
  if($('circuitHudX'))$('circuitHudX').value=String(p.lapDisplayX);
  if($('circuitHudY'))$('circuitHudY').value=String(p.lapDisplayY);
}
function writeHud(x,y){
  const P=packageTools();
  if(!P)return;
  x=Math.round(x);y=Math.round(y);
  for(const m of authoringModels()){
    const r=recordForModel(m);
    if(r)P.writePresentation(m.main,r.offset,{lapDisplayX:x,lapDisplayY:y});
  }
  if($('circuitHudX'))$('circuitHudX').value=String(x);
  if($('circuitHudY'))$('circuitHudY').value=String(y);
  renderHud();
}
function ensureHudControls(){
  const pane=$('raceSetupPane');
  if(!pane)return false;
  let controls=$('circuitRaceHudControls');
  if(!controls){
    controls=document.createElement('div');
    controls.id='circuitRaceHudControls';
    controls.className='toolGroup';
    controls.innerHTML=`<div class="toolGroupTitle">Race HUD / lap tower</div>
      <div class="circuitAuxGrid">
        <label>HUD X <input id="circuitHudX" type="number"></label>
        <label>HUD Y <input id="circuitHudY" type="number"></label>
      </div>
      <div class="raceSetupActions">
        <button id="circuitHudApply" type="button">Apply HUD anchor</button>
        <button id="circuitHudBring" type="button">Bring into view</button>
      </div>
      <div class="muted" data-v0194-hud-help="1"></div>`;
    const grid=pane.querySelector('.raceSetupGrid');
    pane.insertBefore(controls,grid||pane.firstChild);
  }
  let actions=controls.querySelector('.raceSetupActions');
  if(!actions){
    actions=document.createElement('div');
    actions.className='raceSetupActions';
    controls.appendChild(actions);
  }
  let bring=$('circuitHudBring');
  if(!bring){
    bring=document.createElement('button');
    bring.id='circuitHudBring';bring.type='button';bring.textContent='Bring into view';
    actions.appendChild(bring);
  }
  let help=controls.querySelector('[data-v0194-hud-help]');
  if(!help){
    const old=[...controls.querySelectorAll('.muted')].pop();
    help=old||document.createElement('div');
    help.classList.add('muted');
    help.dataset.v0194HudHelp='1';
    if(!old)controls.appendChild(help);
  }
  help.textContent='Drag the visible lap tower/HUD directly, or use HUD X/Y. Current-lap and timer cells reproduce the retail $6B02 glyph, mask and source-plane shading; total laps previews the authored maximum 20.';

  const apply=$('circuitHudApply');
  if(apply&&!apply.dataset.v0194){
    apply.dataset.v0194='1';
    apply.addEventListener('click',()=>writeHud(Number($('circuitHudX')?.value||0),Number($('circuitHudY')?.value||0)));
  }
  if(bring&&!bring.dataset.v0194){
    bring.dataset.v0194='1';
    bring.addEventListener('click',()=>{
      const q=presentation();
      if(!q)return;
      const p=safeHudAnchor(q.p);
      writeHud(p.x,p.y);
    });
  }
  return true;
}
function raceCanvasPoint(e){
  const c=$('view');
  if(!c)return null;
  const r=c.getBoundingClientRect();
  return {x:(e.clientX-r.left)*TRACK_W/r.width,y:(e.clientY-r.top)*TRACK_H/r.height};
}
function hudHit(q,p){return {hit:!!(q&&p),handle:false};}
function installHudPointer(){
  const hit=$('editorFixHudDragHit194');
  if(!hit||hit.dataset.v0195HudPointer)return !!hit;
  hit.dataset.v0195HudPointer='1';
  hit.addEventListener('pointerdown',e=>{
    if(!raceActive()||e.button!==0)return;
    const q=raceCanvasPoint(e),p=presentation()?.p;
    if(!q||!p)return;
    e.preventDefault();e.stopPropagation();
    hudDrag={
      pointerId:e.pointerId,
      offsetX:q.x-(Number(p.lapDisplayX)||0),
      offsetY:q.y-(Number(p.lapDisplayY)||0)
    };
    try{hit.setPointerCapture?.(e.pointerId);}catch(_e){}
  });
  hit.addEventListener('pointermove',e=>{
    if(!hudDrag||hudDrag.pointerId!==e.pointerId)return;
    const q=raceCanvasPoint(e);if(!q)return;
    e.preventDefault();e.stopPropagation();
    writeHud(q.x-hudDrag.offsetX,q.y-hudDrag.offsetY);
  });
  const end=e=>{
    if(!hudDrag||hudDrag.pointerId!==e.pointerId)return;
    e.preventDefault();e.stopPropagation();
    try{hit.releasePointerCapture?.(e.pointerId);}catch(_e){}
    hudDrag=null;renderHud();
  };
  hit.addEventListener('pointerup',end);
  hit.addEventListener('pointercancel',end);
  return true;
}

/* -------------------------------------------------------------------------
 * Mini-map palette remap.
 *
 * The final explicit circuit->Gasoline Alley lookup supplied by the project
 * owner should supersede this when available.  This pass improves the old
 * global nearest-colour mapping by keeping neutrals/greens/blues/warm colours
 * in their own palette families and preserving exact non-transparent matches.
 * ---------------------------------------------------------------------- */
function nibbleRgb(word){return [(word>>>8)&15,(word>>>4)&15,word&15];}
function colourDistance(a,b){
  const A=nibbleRgb(a),B=nibbleRgb(b);
  const dr=A[0]-B[0],dg=A[1]-B[1],db=A[2]-B[2];
  return dr*dr*3+dg*dg*6+db*db*2;
}
function colourFamily(word){
  const [r,g,b]=nibbleRgb(word),hi=Math.max(r,g,b),lo=Math.min(r,g,b);
  if(hi-lo<=1)return 'neutral';
  if(g>=r*1.15&&g>=b*1.12)return 'green';
  if(b>=r*1.10&&b>=g*.92)return 'blue';
  return 'warm';
}
function buildPaletteMap(){
  const P=packageTools(),T=indyTools();
  const src=T?.VERIFIED_TRACK_PALETTE_WORDS,dst=P?.PRESENTATION_PALETTE_WORDS;
  if(!src||!dst)return null;

  const out=new Uint8Array(32);
  const all=[...Array(31)].map((_,i)=>i+1); // colour 0 is transparent in miniature
  const byFamily={neutral:[],green:[],blue:[],warm:[]};
  for(const j of all)byFamily[colourFamily(dst[j])].push(j);

  for(let i=0;i<32;i++){
    // Exact shared RGB words are authoritative if they do not select transparent 0.
    let exact=-1;
    for(let j=1;j<32;j++)if(dst[j]===src[i]){exact=j;break;}
    if(exact>=0){out[i]=exact;continue;}

    const family=colourFamily(src[i]);
    let candidates=byFamily[family];
    if(!candidates?.length)candidates=all;

    let best=candidates[0],bestD=Infinity;
    for(const j of candidates){
      const d=colourDistance(src[i],dst[j]);
      if(d<bestD){bestD=d;best=j;}
    }
    out[i]=best;
  }
  return out;
}
function reduceBackdrop(source,map){
  const out=new Uint8Array(PREVIEW_W*PREVIEW_H);
  for(let dy=0;dy<PREVIEW_H;dy++){
    const sy0=Math.floor(dy*TRACK_GAME_H/PREVIEW_H);
    const sy1=Math.max(sy0+1,Math.floor((dy+1)*TRACK_GAME_H/PREVIEW_H));
    for(let dx=0;dx<PREVIEW_W;dx++){
      const sx0=Math.floor(dx*TRACK_W/PREVIEW_W);
      const sx1=Math.max(sx0+1,Math.floor((dx+1)*TRACK_W/PREVIEW_W));
      const counts=new Uint16Array(32);
      for(let sy=sy0;sy<sy1;sy++)for(let sx=sx0;sx<sx1;sx++)
        counts[map[source[sy*TRACK_W+sx]&31]]++;
      let best=1,n=-1;
      for(let i=1;i<32;i++)if(counts[i]>n){n=counts[i];best=i;}
      out[dy*PREVIEW_W+dx]=best;
    }
  }
  return out;
}
function setMiniStatus(text){
  const e=$('circuitAuxStatusMini');
  if(e)e.textContent=text;
}
function correctBackdropMiniature(){
  const P=packageTools(),T=indyTools(),model=resourceModel(),record=recordForModel(model),map=buildPaletteMap();
  if(!P||!T||!model||!record||!map)return;
  try{
    const bg=model.getResource(record.baseResourceId),TB=root.IndyHeatTrackBackdropTools;
    const source=TB?.decodeTrackPlanar?TB.decodeTrackPlanar(bg.data):T.decodePlanar(bg.data,TRACK_W,TRACK_H,5,0);
    const pixels=reduceBackdrop(source,map);
    for(const m of authoringModels()){
      const r=recordForModel(m);
      if(!r)continue;
      const q=P.resolvePreviewResource(m,r);
      const encoded=P.encodePreviewPixels(pixels,q.resource.data);
      q.resource.data.set(encoded);
    }
    setMiniStatus('Miniature rebuilt with family-aware race-to-Gasoline-Alley palette mapping. An explicit project lookup table can replace this mapping later for exact art direction.');
    setTimeout(()=>{
      if($('circuitPreviewControls')&&!$('circuitPreviewControls').hidden)$('layerEditMini')?.click();
    },0);
  }catch(e){
    setMiniStatus(`ERROR: ${e.message}`);
  }
}
function installBackdropFix(){
  // Deliberately deferred in v0.19.5. The project owner will provide an
  // explicit circuit-palette -> Gasoline Alley palette lookup table.
  return true;
}

/* -------------------------------------------------------------------------
 * General UI event refresh.
 * ---------------------------------------------------------------------- */
function installUiEvents(){
  if(uiEventsInstalled)return true;
  const buttons=$('layerModeButtons');
  if(!buttons)return false;
  uiEventsInstalled=true;

  buttons.addEventListener('click',()=>setTimeout(()=>{
    setVersionLabel();
    renameZoom();
    reorderModeButtons();
    ensureLeftFolds();
    ensureLapContract();
    ensureHudControls();
    patchRaceCanvasDebugLabel();
    installHudPointer();
    syncOverlayOpacity();
    renderHud();
  },0));

  $('opacity')?.addEventListener('input',renderHud);
  $('editorScale')?.addEventListener('input',()=>setTimeout(renderHud,0));
  $('editorScale')?.addEventListener('change',()=>setTimeout(renderHud,0));
  $('trackSelect')?.addEventListener('change',()=>setTimeout(()=>{
    ensureLeftFolds();
    ensureLapContract();
    renderHud();
  },0));
  document.addEventListener('indyheat-race-setup-capture',()=>setTimeout(()=>{
    ensureLeftFolds();
    ensureLapContract();
    ensureHudControls();
    patchRaceCanvasDebugLabel();
    installHudPointer();
    renderHud();
  },0));
  return true;
}

function tick(){
  document.body?.setAttribute('data-indyheat-v0195-fix','1');
  installStyle();
  setVersionLabel();
  renameZoom();
  reorderModeButtons();
  installUiEvents();
  installModeCoordinator();
  installOpacityWatch();
  installLapGuards();
  ensureLeftFolds();
  ensureLapContract();
  ensureHudCanvas();
  ensureHudControls();
  patchRaceCanvasDebugLabel();
  installHudPointer();
  installBackdropFix();
  renderHud();

  return !!(
    packageTools()&&indyTools()&&
    $('layerEditBackdrop')&&$('layerEditMask')&&$('layerEditSurface')&&
    $('layerModeWaypoints')&&$('layerEditRaceSetup')&&$('layerEditMini')&&
    $('layerEditMap')&&$('layerEditRecovery')&&
    $('raceSetupPane')&&$('circuitViewPits')&&$('circuitViewRaceControl')
  );
}
function boot(){
  let tries=0;
  tick();
  const timer=setInterval(()=>{
    tries++;
    const ready=tick();
    if(ready||tries>300)clearInterval(timer);
  },50);
  setTimeout(tick,1000);
  setTimeout(tick,2500);
}
if(document.readyState==='loading')
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});
else
  setTimeout(boot,0);

})(typeof globalThis!=='undefined'?globalThis:this);
