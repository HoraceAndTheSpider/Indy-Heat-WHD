(function(root){
'use strict';

/*
 * Indy Heat Circuit Editor v0.19.6 focused acceptance fix.
 *
 * This module intentionally runs after editor-fixes-v0193.js (currently v0.19.5).
 *
 * It addresses three live-editor acceptance failures:
 * 1. Lap-tower dragging no longer depends on any particular canvas/div receiving
 *    the pointer event. A document-level capture listener checks the pointer's
 *    coordinates against the visible HUD rectangle before any editor canvas sees it.
 * 2. "From backdrop" uses the explicit Race-index -> Garage-index palette lookup
 *    supplied in palette compare.xlsx, with no algorithmic colour matching.
 * 3. Final mode order is:
 *      Backdrop, Foreground, Surface,
 *      Waypoints, Recovery, Race,
 *      MiniMap, Map.
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
  const re=/v0\.(?:11|12|13|14|15|16|17|18|19(?:\.[1-6])?)/i;
  const h=document.querySelector('header h1');
  if(h)h.textContent=h.textContent.replace(re,'v0.19.6');
  document.title=document.title.replace(re,'v0.19.6');
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

  if(!host.dataset.v0196ModeOrder){
    host.dataset.v0196ModeOrder='1';

    // v0.19.5 also reorders after mode clicks. Queue ours afterwards so the
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
  if(document.documentElement.dataset.v0196HudDrag)return true;
  document.documentElement.dataset.v0196HudDrag='1';

  // Retire the v0.19.5 DOM hit target. It is no longer part of input routing.
  const style=document.createElement('style');
  style.id='indyheatHudCaptureStyle0196';
  style.textContent=`
    #editorFixHudDragHit194{pointer-events:none!important}
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
      const mr=recordFor(m);
      if(!mr)continue;
      const q=P.resolvePreviewResource(m,mr);
      const encoded=P.encodePreviewPixels(pixels,q.resource.data);
      q.resource.data.set(encoded);
    }

    setMiniStatus('Miniature rebuilt using the explicit Race → Garage palette lookup from palette compare.xlsx (Race 28 taken from the Hex Index 028 row: 28 → 4).');
    // Re-entering MiniMap calls its native renderer against the now-updated BOB.
    setTimeout(()=>$('layerEditMini')?.click(),0);
    return true;
  }catch(err){
    setMiniStatus(`ERROR: ${err.message}`);
    return false;
  }
}
function installPaletteMap(){
  const b=$('circuitPreviewFromBackdrop');
  if(!b)return false;
  if(b.dataset.v0196PaletteMap)return true;
  b.dataset.v0196PaletteMap='1';

  // circuit-package.js registered its own handler when it created the button.
  // Our later listener therefore runs after it. This intentionally preserves
  // its existing package-aware Undo snapshot, then replaces the generated
  // pixels with the authoritative lookup result.
  b.addEventListener('click',()=>setTimeout(applyExplicitPaletteMap,0));

  const controls=$('circuitPreviewControls');
  if(controls){
    const notes=[...controls.querySelectorAll('.muted')];
    const help=notes[notes.length-1];
    if(help)help.textContent='From backdrop shrinks the current 320×224 race image to 78×51, then remaps every Race palette index through the project-supplied Race → Garage lookup table. Right-click paints transparent colour 0.';
  }
  return true;
}

function tick(){
  setVersion();
  installModeOrder();
  installHudDrag();
  installPaletteMap();

  return !!(
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

  // Keep the final order/version after the older corrective layer's delayed
  // startup timers have completed.
  setTimeout(()=>{setVersion();reorderModes();},1000);
  setTimeout(()=>{setVersion();reorderModes();},3000);
}
if(document.readyState==='loading')
  document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});
else
  setTimeout(boot,0);

})(typeof globalThis!=='undefined'?globalThis:this);
