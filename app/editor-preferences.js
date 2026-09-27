(function(root){
'use strict';

// Functional UI preferences only. Stored locally in this browser; no cookies,
// network requests, analytics or identifiers are used here.
if(typeof document==='undefined')return;
const $=id=>document.getElementById(id);
const STORAGE_KEY='indyheat.editor.ui-preferences.v1';
const FOLD_IDS=['circuitViewSurface','circuitViewWaypoints','circuitViewRecovery','circuitViewPits','circuitViewRaceControl'];
const TOGGLE_IDS=[
  'layerShowMask','layerShowSurface','showWaypoints','recoveryShowArrows','recoveryShowGrid',
  'circuitShowPitlaneZone','circuitShowPitApproach','circuitShowPits','circuitShowPitCrew','circuitShowBoards','circuitShowPitCars',
  'circuitShowStart','circuitShowGridCars','circuitShowFlag','circuitShowCurrentLaps','circuitShowTotalLaps','circuitShowTimer',
  'showWaypointLinks','showSequenceGroups','showBit7Flags','showNonDefaultLinkDeltas'
];
const DEBUG_SUMMARIES=new Set([
  'Developer exports','Advanced display diagnostics','Waypoint validation','Data checks','Data reference',
  'Race/event records and path descriptors','Resource scan'
]);
let applying=true,saveTimer=null,resizeObserver=null;

function isMobile(){
  return !!(root.matchMedia?.('(max-width: 760px)').matches ||
    (root.matchMedia?.('(pointer: coarse)').matches && root.innerWidth<=1050));
}
function load(){
  try{
    const q=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    return q&&typeof q==='object'&&q.remember===true?q:{};
  }catch(_e){return {};}
}
function store(q){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(q));}catch(_e){}}
function clearStored(){try{localStorage.removeItem(STORAGE_KEY);}catch(_e){}}
function checkedMap(){
  const q={};
  for(const id of TOGGLE_IDS){const e=$(id);if(e)q[id]=!!e.checked;}
  document.querySelectorAll('.surfaceClass').forEach((e,i)=>q[`surfaceClass${i}`]=!!e.checked);
  document.querySelectorAll('.waypointSet').forEach((e,i)=>q[`waypointSet${i}`]=!!e.checked);
  return q;
}
function foldMap(){const q={};for(const id of FOLD_IDS){const d=$(id);if(d)q[id]=!!d.open;}return q;}
function currentMode(){return $('layerModeButtons')?.dataset?.currentMode||root.IndyHeatEditorCurrentMode||null;}
function snapshot(){
  const viewport=$('circuitViewport');
  return {
    version:1,remember:true,
    mode:currentMode(),
    zoom:Number($('editorScale')?.value||3),
    backgroundOpacity:Number($('backgroundOpacity')?.value??100),
    overlayOpacity:Number($('opacity')?.value??55),
    showBg:!!$('showBg')?.checked,
    fixedViewport:!!viewport?.classList.contains('fixed'),
    fixedWidth:Number(viewport?.dataset?.fixedWidth)||null,
    fixedHeight:Number(viewport?.dataset?.fixedHeight)||null,
    hideWaypointNumbers:!!$('hideWaypointNumbers')?.checked,
    waypointLabelMode:$('wpLabelMode')?.value||'index',
    overlays:checkedMap(),
    folds:foldMap()
  };
}
function saveSoon(){
  if(applying||!$('rememberEditorSettings')?.checked)return;
  clearTimeout(saveTimer);saveTimer=setTimeout(()=>store(snapshot()),80);
}
function dispatchChange(e){e.dispatchEvent(new Event('change',{bubbles:true}));}
function setCheck(e,on){
  if(!e||e.checked===!!on)return;
  e.checked=!!on;dispatchChange(e);
}
function setRange(id,value,eventName='input'){
  const e=$(id);if(!e)return;
  const min=e.min===''?-Infinity:Number(e.min),max=e.max===''?Infinity:Number(e.max);
  const n=Math.max(min,Math.min(max,Number(value)));
  if(!Number.isFinite(n)||Number(e.value)===n)return;
  e.value=String(n);e.dispatchEvent(new Event(eventName,{bubbles:true}));
  if(eventName!=='change')dispatchChange(e);
}
function setSelect(id,value){const e=$(id);if(!e||value==null||e.value===String(value))return;e.value=String(value);dispatchChange(e);}
function markMobileDiagnostics(){
  const content=document.querySelector('.content');if(!content)return;
  for(const d of content.querySelectorAll(':scope > details')){
    const text=d.querySelector(':scope > summary')?.textContent?.trim()||'';
    if(DEBUG_SUMMARIES.has(text))d.classList.add('mobileDiagnostic');
  }
}
function controlsReady(){
  return !!($('layerEditBackdrop')&&$('layerModeButtons')&&$('editorScale')&&$('circuitViewportToggle')&&
    $('circuitViewport')&&$('circuitViewSurface')&&$('circuitViewWaypoints')&&$('circuitViewRecovery')&&
    $('circuitViewPits')&&$('circuitViewRaceControl'));
}
function defaultState(mobile){
  return {
    mode:'layerEditBackdrop',zoom:mobile?1:3,backgroundOpacity:100,overlayOpacity:55,showBg:true,
    fixedViewport:mobile,hideWaypointNumbers:mobile,waypointLabelMode:'index',
    overlays:Object.fromEntries([
      ...TOGGLE_IDS.map(id=>[id,false]),
      ...[0,1,2,3].map(i=>[`surfaceClass${i}`,false]),
      ...[0,1,2].map(i=>[`waypointSet${i}`,false])
    ]),
    folds:Object.fromEntries(FOLD_IDS.map(id=>[id,false]))
  };
}
function mergeState(saved,mobile){
  const d=defaultState(mobile),s=saved||{};
  return {
    ...d,...s,
    overlays:{...d.overlays,...(s.overlays||{})},
    folds:{...d.folds,...(s.folds||{})}
  };
}
function applyOverlayState(q){
  for(const [id,on] of Object.entries(q.overlays||{})){
    let e=$(id);
    if(!e&&/^surfaceClass\d$/.test(id))e=document.querySelectorAll('.surfaceClass')[Number(id.slice(-1))];
    if(!e&&/^waypointSet\d$/.test(id))e=document.querySelectorAll('.waypointSet')[Number(id.slice(-1))];
    setCheck(e,on);
  }
  for(const [id,open] of Object.entries(q.folds||{})){const d=$(id);if(d)d.open=!!open;}
}
function setFixed(on,q){
  const viewport=$('circuitViewport'),button=$('circuitViewportToggle');if(!viewport||!button)return;
  if(Number.isFinite(Number(q.fixedWidth))&&q.fixedWidth>0)viewport.dataset.fixedWidth=String(Math.round(q.fixedWidth));
  if(Number.isFinite(Number(q.fixedHeight))&&q.fixedHeight>0)viewport.dataset.fixedHeight=String(Math.round(q.fixedHeight));
  if(viewport.classList.contains('fixed')!==!!on)button.click();
}
function applyMode(mode,after){
  const b=$(mode)||$('layerEditBackdrop');
  if(!b){after?.();return;}
  if(currentMode()!==b.id)b.click();
  setTimeout(()=>after?.(),90);
}
function applyPreferences(){
  const mobile=isMobile(),saved=load(),q=mergeState(saved,mobile);
  document.body.classList.toggle('indyheatMobileUi',mobile);
  if($('rememberEditorSettings'))$('rememberEditorSettings').checked=saved.remember===true;
  markMobileDiagnostics();

  setCheck($('showBg'),q.showBg!==false);
  setRange('backgroundOpacity',q.backgroundOpacity,'input');
  setRange('editorScale',q.zoom,'input');
  setRange('opacity',q.overlayOpacity,'input');
  setSelect('wpLabelMode',q.waypointLabelMode);
  setCheck($('hideWaypointNumbers'),!!q.hideWaypointNumbers);
  setFixed(!!q.fixedViewport,q);

  applyMode(q.mode,()=>{
    // Mode modules establish their own overlay defaults. User/default overlay
    // preferences are applied afterwards so those modules cannot immediately
    // turn a freshly-clean startup view back on.
    applyOverlayState(q);
    applying=false;
    installPersistence();
    saveSoon();
  });
}
function installPersistence(){
  if(document.documentElement.dataset.indyheatPreferencesReady)return;
  document.documentElement.dataset.indyheatPreferencesReady='1';
  $('rememberEditorSettings')?.addEventListener('change',e=>{
    if(e.target.checked)store(snapshot());
    else clearStored();
  });
  document.addEventListener('change',e=>{
    const id=e.target?.id||'';
    if(id==='editorScale'||id==='backgroundOpacity'||id==='opacity'||id==='showBg'||id==='hideWaypointNumbers'||id==='wpLabelMode'||
       TOGGLE_IDS.includes(id)||e.target?.classList?.contains('surfaceClass')||e.target?.classList?.contains('waypointSet'))saveSoon();
  },true);
  document.addEventListener('click',e=>{
    if(e.target?.closest?.('#layerModeButtons button')||e.target?.id==='circuitViewportToggle')setTimeout(saveSoon,120);
  },true);
  for(const id of FOLD_IDS)$(id)?.addEventListener('toggle',saveSoon);
  const viewport=$('circuitViewport');
  if(viewport&&typeof ResizeObserver!=='undefined'){
    resizeObserver=new ResizeObserver(()=>{if(viewport.classList.contains('fixed'))saveSoon();});
    resizeObserver.observe(viewport);
  }
}


// Mobile mode navigation uses the same Pointer Events path as the canvas.
// Do not depend on iOS/Safari synthesising a click from a touch.  Resolve a
// clean pointer tap by SCREEN COORDINATES as well as event.target so navigation
// still works if another composited layer is accidentally hit-tested above a
// visible mode button.
function installMobileModePointerBridge(){
  if(document.documentElement.dataset.indyheatMobileModePointerBridge)return;
  document.documentElement.dataset.indyheatMobileModePointerBridge='1';
  let gesture=null;
  const selector='#layerModeButtons button,#editorModeSwitch button';
  const atPoint=(x,y)=>{
    const direct=document.elementFromPoint?.(x,y)?.closest?.(selector);
    if(direct&&!direct.disabled)return direct;
    for(const button of document.querySelectorAll(selector)){
      if(button.disabled||!button.isConnected)continue;
      const r=button.getBoundingClientRect();
      if(r.width>0&&r.height>0&&x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom)return button;
    }
    return null;
  };
  document.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse'||e.button!==0)return;
    const button=atPoint(e.clientX,e.clientY);if(!button)return;
    gesture={pointerId:e.pointerId,button,x:e.clientX,y:e.clientY,moved:false};
    // Own the tap before a stray canvas/overlay can start a drawing gesture.
    if(e.cancelable)e.preventDefault();
    e.stopImmediatePropagation();
  },{capture:true,passive:false});
  document.addEventListener('pointermove',e=>{
    if(!gesture||e.pointerId!==gesture.pointerId)return;
    if(Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>12)gesture.moved=true;
    if(e.cancelable)e.preventDefault();
    e.stopImmediatePropagation();
  },{capture:true,passive:false});
  const cancel=e=>{if(!gesture||e?.pointerId==null||e.pointerId===gesture.pointerId)gesture=null;};
  document.addEventListener('pointercancel',cancel,{capture:true,passive:true});
  document.addEventListener('pointerup',e=>{
    const g=gesture;if(!g||e.pointerId!==g.pointerId)return;gesture=null;
    if(e.cancelable)e.preventDefault();
    e.stopImmediatePropagation();
    if(g.moved||g.button.disabled||!g.button.isConnected)return;
    const end=atPoint(e.clientX,e.clientY);
    if(end!==g.button)return;
    g.button.click();
  },{capture:true,passive:false});
}

function start(){
  installMobileModePointerBridge();
  let tries=0;
  const tick=()=>{
    if(controlsReady()){applyPreferences();return;}
    if(++tries<240)setTimeout(tick,50);
  };
  tick();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();

root.IndyHeatEditorPreferences=Object.freeze({storageKey:STORAGE_KEY,snapshot,save:()=>store(snapshot())});
})(typeof globalThis!=='undefined'?globalThis:this);
