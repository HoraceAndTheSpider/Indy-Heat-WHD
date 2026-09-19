/*
 * Indy Heat Amiga Circuit Editor — consolidated UI module v0.26
 *
 * This replaces the historical corrective-layer file layering. The two internal scopes are deliberately retained to preserve the
 * already accepted behaviour while presenting one stable runtime module.
 */

(function(root){
'use strict';

/*
 * Indy Heat Circuit Editor v0.26 — consolidated UI coordination.
 *
 * Preserves the accepted mode coordination, left-side folds, lap/HUD rendering,
 * opacity policy and Race presentation controls already accepted by the project.
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
  'layerEditRecovery',
  'layerEditRaceSetup',
  'layerEditMini',
  'layerEditMap'
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
  const h=document.querySelector('header h1');
  if(h)h.textContent='Indy Heat Amiga — Circuit Editor v0.26';
  document.title='Indy Heat Amiga – Circuit Editor v0.26';
}

function installStyle(){
  if($('indyheatEditorUiStyle'))return;
  const s=document.createElement('style');
  s.id='indyheatEditorUiStyle';
  s.textContent=`
    body[data-indyheat-editor-ui="1"] #circuitRaceHudCanvas{display:none!important}
    #editorUiHudCanvas{
      position:absolute;inset:0;z-index:6;display:block;pointer-events:none;
      image-rendering:pixelated;image-rendering:crisp-edges
    }
    #editorUiHudCanvas[hidden]{display:none!important}
    #editorUiHudDragHit{
      position:absolute;z-index:7;display:block;cursor:move;touch-action:none;
      background:transparent;user-select:none;-webkit-user-select:none
    }
    #editorUiHudDragHit[hidden]{display:none!important}
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
  if(!e.dataset.editorUiLapGuard){
    e.dataset.editorUiLapGuard='1';
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
  if(document.body?.dataset.editorUiLapGuards)return;
  document.body.dataset.editorUiLapGuards='1';

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
function hudCanvas(){return $('editorUiHudCanvas');}
function ensureHudCanvas(){
  const stack=viewerStack(),view=$('view');
  if(!stack||!view)return false;
  let c=hudCanvas();
  if(!c){
    c=document.createElement('canvas');
    c.id='editorUiHudCanvas';
    c.hidden=true;
    stack.appendChild(c);
  }
  let hit=$('editorUiHudDragHit');
  if(!hit){
    hit=document.createElement('div');
    hit.id='editorUiHudDragHit';
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
  const hit=$('editorUiHudDragHit'),view=$('view'),stack=viewerStack();
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
      <div class="muted" data-editor-ui-hud-help="1"></div>`;
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
  let help=controls.querySelector('[data-editor-ui-hud-help]');
  if(!help){
    const old=[...controls.querySelectorAll('.muted')].pop();
    help=old||document.createElement('div');
    help.classList.add('muted');
    help.dataset.editorUiHudHelp='1';
    if(!old)controls.appendChild(help);
  }
  help.textContent='Drag the visible lap tower/HUD directly, or use HUD X/Y. Current-lap and timer cells reproduce the retail $6B02 glyph, mask and source-plane shading; total laps previews the authored maximum 20.';

  const apply=$('circuitHudApply');
  if(apply&&!apply.dataset.editorUiHudAction){
    apply.dataset.editorUiHudAction='1';
    apply.addEventListener('click',()=>writeHud(Number($('circuitHudX')?.value||0),Number($('circuitHudY')?.value||0)));
  }
  if(bring&&!bring.dataset.editorUiHudAction){
    bring.dataset.editorUiHudAction='1';
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
  const hit=$('editorUiHudDragHit');
  if(!hit||hit.dataset.editorUiHudPointer)return !!hit;
  hit.dataset.editorUiHudPointer='1';
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
  document.body?.setAttribute('data-indyheat-editor-ui','1');
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

(function(root){
'use strict';

/*
 * Indy Heat Circuit Editor v0.26 — consolidated accepted refinements.
 *
 * Preserves the accepted overlay colours, lap slider, global HUD drag, explicit
 * Race-to-Garage MiniMap palette map and final editor-mode ordering.
 */

if(typeof document==='undefined')return;

const $=id=>document.getElementById(id);
const TRACK_W=320,TRACK_H=256;
const PREVIEW_W=78,PREVIEW_H=51,TRACK_GAME_H=224;

// Explicit lookup supplied by the project owner.
// Source = Race palette index. Destination = Garage / Gasoline Alley palette index.
// The spreadsheet row labelled Hex Index 028:$900 contains "Race # 29"; because
// the Hex Index is 028 and the following row is the genuine 029 entry, that row
// is treated as the evident source-index typo 28 -> 4.
const RACE_TO_GARAGE=Object.freeze([
  14, //  0 -> 14
   0, //  1 -> 0
  19, //  2 -> 19
   3, //  3 -> 3
  12, //  4 -> 12
  13, //  5 -> 13
  14, //  6 -> 14
  15, //  7 -> 15
  29, //  8 -> 29
  27, //  9 -> 27
  17, // 10 -> 17
  31, // 11 -> 31
  20, // 12 -> 20
  21, // 13 -> 21
  22, // 14 -> 22
  23, // 15 -> 23
  25, // 16 -> 25
  25, // 17 -> 25
  26, // 18 -> 26
  19, // 19 -> 19
  28, // 20 -> 28
  31, // 21 -> 31
  30, // 22 -> 30
  31, // 23 -> 31
  24, // 24 -> 24
   8, // 25 -> 8
   9, // 26 -> 9
  10, // 27 -> 10
   4, // 28 -> 4  (spreadsheet Hex Index 028)
   6, // 29 -> 6
   5, // 30 -> 5
   7  // 31 -> 7
]);

const MODE_ORDER=Object.freeze([
  'layerEditBackdrop',
  'layerEditMask',
  'layerEditSurface',
  'layerModeWaypoints',
  'layerEditRecovery',
  'layerEditRaceSetup',
  'layerEditMini',
  'layerEditMap'
]);

let hudDrag=null;
let paletteInstalled=false;
let bootTimer=null;

function tools(){return root.IndyHeatTools||null;}
function packageTools(){return root.IndyHeatCircuitPackage||null;}
function capture(){return root.IndyHeatRaceSetupCapture||null;}
function trackIndex(){return Number($('trackSelect')?.value||0);}

function uniq(items){
  const out=[];
  for(const x of items)if(x&&!out.includes(x))out.push(x);
  return out;
}
function models(){
  const C=capture();
  return C?uniq([C.coreModel,C.layerModel,C.model,...(C.models||[])]):[];
}
function primaryModel(){
  const C=capture();
  return C?.model||C?.layerModel||C?.coreModel||models()[0]||null;
}
function resourceModel(){
  const C=capture();
  return C?.layerModel||C?.model||C?.coreModel||models()[0]||null;
}
function recordsFor(model){
  const C=capture(),T=tools();
  if(!model||!T)return [];
  let records=C?.recordsByMain?.get(model.main)||null;
  if(!records){
    records=T.parseRaceRecords(model.main);
    C?.recordsByMain?.set(model.main,records);
  }
  for(const r of records){
    if(r.baseResourceId==null&&typeof T.raceBaseResourceId==='function')
      r.baseResourceId=T.raceBaseResourceId(r,model.resourceTableOffset+0x1000);
  }
  return records;
}
function recordFor(model,index=trackIndex()){
  const T=tools();
  if(!model||!T)return null;
  const base=T.TRACK_BASE_IDS?.[index];
  return recordsFor(model).find(r=>r.baseResourceId===base)||null;
}
function currentPresentation(){
  const P=packageTools(),m=primaryModel(),r=recordFor(m);
  return P&&m&&r?P.readPresentation(m.main,r.offset):null;
}

function setVersion(){
  const h=document.querySelector('header h1');
  if(h)h.textContent='Indy Heat Amiga — Circuit Editor v0.26';
  document.title='Indy Heat Amiga – Circuit Editor v0.26';
}


/* -------------------------------------------------------------------------
 * Overlay display colours.
 *
 * Foreground/Surface display colours are shared with layer-editor.js through
 * root.IndyHeatOverlayColours. They affect presentation only; resource bytes,
 * surface classes and foreground mask bits are never modified.
 * ---------------------------------------------------------------------- */
const OVERLAY_COLOUR_STORAGE='indyheat-overlay-colours';
const OVERLAY_COLOUR_STORAGE_LEGACY='indyheat-overlay-colours-v025';
const OVERLAY_COLOUR_DEFAULTS=Object.freeze({
  foreground:'#f5bd4f',
  surface0:'#ffffff',
  surface1:'#dc4545',
  surface2:'#5ed46c',
  surface3:'#4a79e8'
});
const overlayColours={...OVERLAY_COLOUR_DEFAULTS};
let overlayColourObserver=null;

function validHexColour(v){return /^#[0-9a-f]{6}$/i.test(String(v||''));}
function loadOverlayColours(){
  try{
    const saved=JSON.parse(localStorage.getItem(OVERLAY_COLOUR_STORAGE)||localStorage.getItem(OVERLAY_COLOUR_STORAGE_LEGACY)||'{}');
    for(const k of Object.keys(OVERLAY_COLOUR_DEFAULTS))if(validHexColour(saved[k]))overlayColours[k]=saved[k].toLowerCase();
  }catch(_e){}
}
function saveOverlayColours(){
  try{localStorage.setItem(OVERLAY_COLOUR_STORAGE,JSON.stringify(overlayColours));}catch(_e){}
}
function colourRgba(hex,a){
  const n=parseInt(String(hex).slice(1),16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}
function requestOverlayRedraw(){
  const opacity=$('opacity');
  if(opacity)opacity.dispatchEvent(new Event('input',{bubbles:true}));
}
function makeColourWheel(id,key,title){
  const input=document.createElement('input');
  input.type='color';input.id=id;input.className='overlayColourWheel';
  input.value=overlayColours[key];input.title=title;input.setAttribute('aria-label',title);
  input.dataset.overlayColourKey=key;
  input.addEventListener('pointerdown',e=>e.stopPropagation());
  input.addEventListener('click',e=>e.stopPropagation());
  input.addEventListener('input',()=>{
    if(validHexColour(input.value)){
      overlayColours[key]=input.value.toLowerCase();
      saveOverlayColours();syncLayerPaintSwatches();requestOverlayRedraw();
    }
  });
  return input;
}
function syncLayerPaintSwatches(){
  const map={
    '.paint-fg':'foreground',
    '.paint-normal':'surface0',
    '.paint-edge':'surface1',
    '.paint-slowA':'surface2',
    '.paint-slowB':'surface3'
  };
  for(const [sel,key] of Object.entries(map))document.querySelectorAll(sel).forEach(e=>e.style.background=overlayColours[key]);
}
function wrapSurfaceLabelText(label){
  let span=label.querySelector('.overlayColourLabelText');
  if(span)return span;
  span=document.createElement('span');span.className='overlayColourLabelText';
  const nodes=[...label.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());
  if(nodes.length){
    span.textContent=nodes.map(n=>n.textContent).join(' ').trim();
    for(const n of nodes)n.remove();
  }
  label.appendChild(span);
  return span;
}
function installOverlayColourControls(){
  const mask=$('layerShowMask');
  const surfaceChecks=[...document.querySelectorAll('.surfaceClass')];
  if(!mask||surfaceChecks.length<4)return false;

  if(!document.getElementById('indyheatOverlayColourStyle')){
    const style=document.createElement('style');style.id='indyheatOverlayColourStyle';
    style.textContent=`
      .overlayColourWheel{width:21px!important;height:21px!important;min-width:21px!important;padding:0!important;border:1px solid #687282!important;border-radius:50%!important;background:transparent!important;overflow:hidden;cursor:pointer;box-sizing:border-box}
      .overlayColourWheel::-webkit-color-swatch-wrapper{padding:0}
      .overlayColourWheel::-webkit-color-swatch{border:0;border-radius:50%}
      .overlayColourWheel::-moz-color-swatch{border:0;border-radius:50%}
      .surfaceClassColourLabel{display:grid!important;grid-template-columns:auto minmax(0,1fr) auto;gap:7px;align-items:center}
      .surfaceClassColourLabel .overlayColourLabelText{min-width:0}
    `;
    document.head.appendChild(style);
  }

  const maskRow=mask.closest('.layerControlRow')||mask.parentElement;
  if(maskRow&&!$('overlayColourForeground')){
    maskRow.style.gridTemplateColumns='auto minmax(0,1fr) auto';
    maskRow.appendChild(makeColourWheel('overlayColourForeground','foreground','Foreground overlay colour'));
  }

  for(const c of surfaceChecks){
    const n=Number(c.dataset.class);if(n<0||n>3)continue;
    const label=c.closest('label');if(!label)continue;
    label.classList.add('surfaceClassColourLabel');
    wrapSurfaceLabelText(label);
    const id=`overlayColourSurface${n}`;
    if(!$(id))label.appendChild(makeColourWheel(id,`surface${n}`,`Surface class ${n} overlay colour`));
  }

  syncLayerPaintSwatches();
  const paintHost=$('layerPaintChoices');
  if(paintHost&&!overlayColourObserver&&typeof MutationObserver!=='undefined'){
    overlayColourObserver=new MutationObserver(syncLayerPaintSwatches);
    overlayColourObserver.observe(paintHost,{childList:true,subtree:true});
  }
  if(!document.documentElement.dataset.editorUiOverlayColoursReady){
    document.documentElement.dataset.editorUiOverlayColoursReady='1';
    requestOverlayRedraw();
  }
  return true;
}
loadOverlayColours();
root.IndyHeatOverlayColours=overlayColours;

/* -------------------------------------------------------------------------
 * Race lap authoring: slider, 1..20.
 *
 * Keep the existing #raceLaps element so all existing authoring/apply guards
 * remain attached. Only its presentation changes from numeric entry to range.
 * ---------------------------------------------------------------------- */
function lapSliderValue(){
  const e=$('raceLaps'),out=$('raceLapsSliderValue');
  if(!e||!out)return false;
  let v=Math.round(Number(e.value));
  if(!Number.isFinite(v))v=1;
  v=Math.max(1,Math.min(20,v));
  if(String(v)!==e.value)e.value=String(v);
  out.value=String(v);
  out.textContent=String(v);
  out.setAttribute('aria-label',`${v} laps`);
  return true;
}
function installLapSlider(){
  const e=$('raceLaps');
  if(!e)return false;

  e.type='range';
  e.min='1';
  e.max='20';
  e.step='1';
  e.title='Authored custom range: 1–20. Lap 20 is displayed as F during gameplay.';
  e.setAttribute('aria-label','Race laps');

  let out=$('raceLapsSliderValue');
  if(!out){
    const row=document.createElement('div');
    row.className='raceLapSliderRow';
    const parent=e.parentNode;
    if(parent){
      parent.insertBefore(row,e);
      row.appendChild(e);
      out=document.createElement('output');
      out.id='raceLapsSliderValue';
      out.className='raceLapSliderValue';
      out.htmlFor='raceLaps';
      row.appendChild(out);
    }
  }

  if(!document.getElementById('indyheatLapSliderStyle')){
    const style=document.createElement('style');
    style.id='indyheatLapSliderStyle';
    style.textContent=`
      .raceLapSliderRow{display:flex;align-items:center;gap:8px;width:100%}
      .raceLapSliderRow #raceLaps{flex:1 1 auto;width:auto!important;min-width:0;margin:0}
      .raceLapSliderValue{flex:0 0 2ch;min-width:2ch;text-align:right;font-weight:700;color:#e3e7ec;font-variant-numeric:tabular-nums}
    `;
    document.head.appendChild(style);
  }

  if(!e.dataset.editorUiLapSlider){
    e.dataset.editorUiLapSlider='1';
    e.addEventListener('input',lapSliderValue);
    e.addEventListener('change',lapSliderValue);

    $('trackSelect')?.addEventListener('change',()=>setTimeout(lapSliderValue,0));
    document.addEventListener('indyheat-race-setup-capture',()=>setTimeout(lapSliderValue,0));
    document.addEventListener('click',ev=>{
      const id=ev.target?.closest?.('button')?.id;
      if(id==='raceApply'||id==='raceRevert')setTimeout(lapSliderValue,0);
    });
  }

  return lapSliderValue();
}

function reorderModes(){
  const host=$('layerModeButtons');
  if(!host)return false;

  const wanted=MODE_ORDER.filter(id=>{
    const b=$(id);
    return !!(b&&b.parentNode===host);
  });
  const current=[...host.children]
    .map(el=>el.id)
    .filter(id=>wanted.includes(id));

  const same=current.length===wanted.length&&current.every((id,i)=>id===wanted[i]);
  if(!same){
    for(const id of wanted){
      const b=$(id);
      if(id==='layerEditMini')b.textContent='MiniMap';
      host.appendChild(b);
    }
  }else{
    const mini=$('layerEditMini');
    if(mini&&mini.textContent!=='MiniMap')mini.textContent='MiniMap';
  }
  return MODE_ORDER.every(id=>!!$(id));
}

function installModeOrder(){
  const host=$('layerModeButtons');
  if(!host)return false;

  // Important: do NOT observe childList mutations here. Reordering existing
  // buttons itself mutates childList; observing and re-appending those nodes can
  // create an event loop that starves the browser UI.
  reorderModes();

  if(!host.dataset.editorUiModeOrder){
    host.dataset.editorUiModeOrder='1';

    // the consolidated core UI layer also reorders after mode clicks. Queue ours afterwards so the
    // project-approved order is the final DOM order without a MutationObserver.
    host.addEventListener('click',()=>setTimeout(reorderModes,0));
  }
  return true;
}

/* -------------------------------------------------------------------------
 * Lap tower: global capture drag.
 * ---------------------------------------------------------------------- */
function raceActive(){
  const pane=$('raceSetupPane'),button=$('layerEditRaceSetup');
  return !!(pane&&!pane.hidden&&button?.classList.contains('active'));
}
function eventGamePoint(e,{allowOutside=false}={}){
  const view=$('view');
  if(!view)return null;
  const r=view.getBoundingClientRect();
  if(!r.width||!r.height)return null;
  const inside=e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;
  if(!inside&&!allowOutside)return null;
  return {
    x:(e.clientX-r.left)*TRACK_W/r.width,
    y:(e.clientY-r.top)*TRACK_H/r.height,
    inside
  };
}
function hudBounds(p){
  const x=Number(p?.lapDisplayX)||0,y=Number(p?.lapDisplayY)||0;
  // Generous visible-HUD rectangle: four current-lap cells, total-laps object,
  // timer digits and a few pixels of grab margin.
  return {x0:x-18,y0:y-8,x1:x+26,y1:y+66};
}
function pointInHud(q,p){
  if(!q||!p)return false;
  const b=hudBounds(p);
  return q.x>=b.x0&&q.x<=b.x1&&q.y>=b.y0&&q.y<=b.y1;
}
function redrawHud(){
  const opacity=$('opacity');
  if(opacity)opacity.dispatchEvent(new Event('input',{bubbles:true}));
}
function writeHud(x,y){
  const P=packageTools();
  if(!P)return false;
  x=Math.round(x);y=Math.round(y);
  let wrote=false;
  for(const m of models()){
    const r=recordFor(m);
    if(!r)continue;
    P.writePresentation(m.main,r.offset,{lapDisplayX:x,lapDisplayY:y});
    wrote=true;
  }
  if(!wrote)return false;
  const X=$('circuitHudX'),Y=$('circuitHudY');
  if(X)X.value=String(x);
  if(Y)Y.value=String(y);
  redrawHud();
  return true;
}
function finishHudDrag(e){
  if(!hudDrag)return;
  if(e&&e.pointerId!=null&&hudDrag.pointerId!==e.pointerId)return;
  try{hudDrag.capture?.releasePointerCapture?.(hudDrag.pointerId);}catch(_e){}
  hudDrag=null;
  document.documentElement.classList.remove('indyheatHudDragging');
  redrawHud();
}
function installHudDrag(){
  if(document.documentElement.dataset.editorUiHudDrag)return true;
  document.documentElement.dataset.editorUiHudDrag='1';

  // Retire the the consolidated core UI layer DOM hit target. It is no longer part of input routing.
  const style=document.createElement('style');
  style.id='indyheatHudCaptureStyle';
  style.textContent=`
    #editorUiHudDragHit{pointer-events:none!important}
    html.indyheatHudDragging,html.indyheatHudDragging *{cursor:grabbing!important}
  `;
  document.head.appendChild(style);

  document.addEventListener('pointerdown',e=>{
    if(e.button!==0||!raceActive())return;
    const q=eventGamePoint(e),p=currentPresentation();
    if(!q||!p||!pointInHud(q,p))return;

    // Capture before raceSetupCanvas, layer canvas or any future overlay can
    // claim the gesture.
    e.preventDefault();
    e.stopImmediatePropagation();

    hudDrag={
      pointerId:e.pointerId,
      offsetX:q.x-(Number(p.lapDisplayX)||0),
      offsetY:q.y-(Number(p.lapDisplayY)||0),
      capture:e.target instanceof Element?e.target:null
    };
    try{hudDrag.capture?.setPointerCapture?.(e.pointerId);}catch(_e){}
    document.documentElement.classList.add('indyheatHudDragging');
  },true);

  window.addEventListener('pointermove',e=>{
    if(hudDrag&&hudDrag.pointerId===e.pointerId){
      const q=eventGamePoint(e,{allowOutside:true});
      if(!q)return;
      e.preventDefault();
      e.stopImmediatePropagation();
      writeHud(q.x-hudDrag.offsetX,q.y-hudDrag.offsetY);
      return;
    }

    // Cursor feedback is based on coordinates rather than event target too.
    if(!raceActive())return;
    const q=eventGamePoint(e),p=currentPresentation(),view=$('view');
    if(view)view.style.cursor=(q&&p&&pointInHud(q,p))?'grab':'';
  },true);

  window.addEventListener('pointerup',e=>{
    if(!hudDrag||hudDrag.pointerId!==e.pointerId)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    finishHudDrag(e);
  },true);
  window.addEventListener('pointercancel',finishHudDrag,true);
  window.addEventListener('blur',()=>finishHudDrag(null));

  return true;
}

/* -------------------------------------------------------------------------
 * Explicit race -> Garage palette lookup for "From backdrop".
 * ---------------------------------------------------------------------- */
function reduceBackdropWithLookup(source){
  const out=new Uint8Array(PREVIEW_W*PREVIEW_H);
  for(let dy=0;dy<PREVIEW_H;dy++){
    const sy0=Math.floor(dy*TRACK_GAME_H/PREVIEW_H);
    const sy1=Math.max(sy0+1,Math.floor((dy+1)*TRACK_GAME_H/PREVIEW_H));
    for(let dx=0;dx<PREVIEW_W;dx++){
      const sx0=Math.floor(dx*TRACK_W/PREVIEW_W);
      const sx1=Math.max(sx0+1,Math.floor((dx+1)*TRACK_W/PREVIEW_W));
      const counts=new Uint16Array(32);

      // Remap every sampled race pixel first. Repeated destination colours in
      // the supplied lookup deliberately combine before the area-mode choice.
      for(let sy=sy0;sy<sy1;sy++)for(let sx=sx0;sx<sx1;sx++){
        const raceIndex=source[sy*TRACK_W+sx]&31;
        counts[RACE_TO_GARAGE[raceIndex]]++;
      }

      let best=0,bestN=-1;
      for(let i=0;i<32;i++){
        if(counts[i]>bestN){bestN=counts[i];best=i;}
      }
      out[dy*PREVIEW_W+dx]=best;
    }
  }
  return out;
}
function setMiniStatus(text){
  const e=$('circuitAuxStatusMini');
  if(e)e.textContent=text;
}
function chooseUnusedMiniTransparency(pixels,currentTransparent){
  const used=new Set(pixels);if(!used.has(currentTransparent))return currentTransparent;
  for(let i=0;i<32;i++)if(!used.has(i))return i;
  throw new Error('The generated MiniMap uses all 32 palette indices; no unused transparency index is available.');
}
function applyExplicitPaletteMap(){
  const P=packageTools(),T=tools(),model=resourceModel(),r=recordFor(model);
  if(!P||!T||!model||!r)return false;
  try{
    const bg=model.getResource(r.baseResourceId);
    const TB=root.IndyHeatTrackBackdropTools;
    const source=TB?.decodeTrackPlanar
      ? TB.decodeTrackPlanar(bg.data)
      : T.decodePlanar(bg.data,TRACK_W,TRACK_H,5,0);
    const pixels=reduceBackdropWithLookup(source);

    for(const m of models()){
      const mr=recordFor(m);if(!mr)continue;
      const q=P.resolvePreviewResource(m,mr),decoded=P.decodePreviewBob(q.resource.data);
      const transparent=chooseUnusedMiniTransparency(pixels,decoded.transparent);
      q.resource.data.set(P.encodePreviewPixels(pixels,q.resource.data,transparent));
    }

    setTimeout(()=>$('layerEditMini')?.click(),0);
    return true;
  }catch(err){
    const top=$('circuitPackageTopStatus');if(top){top.textContent=`ERROR: ${err.message}`;top.classList.add('bad');}
    return false;
  }
}
function installPaletteMap(){
  const b=$('circuitPreviewFromBackdrop');
  if(!b)return false;
  if(b.dataset.editorUiPaletteMap)return true;
  b.dataset.editorUiPaletteMap='1';

  // circuit-package.js registered its own handler when it created the button.
  // Our later listener therefore runs after it. This intentionally preserves
  // its existing package-aware Undo snapshot, then replaces the generated
  // pixels with the authoritative lookup result.
  b.addEventListener('click',()=>setTimeout(applyExplicitPaletteMap,0));

  return true;
}

function tick(){
  setVersion();
  installModeOrder();
  const colourControlsReady=installOverlayColourControls();
  installLapSlider();
  installHudDrag();
  installPaletteMap();

  return !!(
    colourControlsReady&&
    tools()&&packageTools()&&capture()&&
    $('layerModeButtons')&&$('layerEditRecovery')&&$('layerEditRaceSetup')&&
    $('circuitPreviewFromBackdrop')
  );
}
function boot(){
  let tries=0;
  tick();
  bootTimer=setInterval(()=>{
    tries++;
    if(tick()||tries>400){
      clearInterval(bootTimer);
      bootTimer=null;
    }
  },50);

  // Reassert the accepted final order/version after the coordination scope's
  // delayed startup timers have completed.
  setTimeout(()=>{setVersion();reorderModes();},1000);
  setTimeout(()=>{setVersion();reorderModes();},3000);
}
if(document.readyState==='loading')
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});
else
  setTimeout(boot,0);

})(typeof globalThis!=='undefined'?globalThis:this);
