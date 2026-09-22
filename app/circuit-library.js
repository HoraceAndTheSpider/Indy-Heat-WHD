(function(root){
'use strict';

/*
 * Indy Heat custom circuit session library.
 *
 * circuit-package.js deliberately keeps one active retail-template host.  This
 * module adds a number-keyed custom library above that host so several custom
 * circuits can remain open at once.  Only the selected custom is materialised
 * into the shared host; leaving it snapshots the live edits and restores the
 * retail host before another selection is activated.
 */

const VERSION='0.69';
const CUSTOM_MIN=10,CUSTOM_MAX=99,RUNTIME_MAIN_BASE=0x1000;
const $=id=>document.getElementById(id);
const slots=new Map();
let activeSlot=null;
let importPassThrough=false;
let bootTimer=null;
let refreshTimer=null,refreshToken=0;

function P(){return root.IndyHeatCircuitPackage||null;}
function T(){return root.IndyHeatTools||null;}
function R(){return root.IndyHeatRaceSetupTools||null;}
function C(){return root.IndyHeatRaceSetupCapture||null;}
function W(){return root.IndyHeatWaypointAuthoring||null;}
function N(){return root.IndyHeatCircuitNameTools||null;}

function status(text,bad=false){
  const e=$('circuitPackageTopStatus');
  if(e){e.textContent=String(text||'');e.title=String(text||'');e.classList.toggle('bad',!!bad);}
}
function allModels(){
  const c=C(),out=[];
  for(const m of [c?.coreModel,c?.model,c?.layerModel,...(c?.models||[])])if(m&&!out.includes(m))out.push(m);
  return out;
}
function primaryModel(){const c=C();return c?.model||c?.layerModel||c?.coreModel||allModels()[0]||null;}
function resourceModel(){const c=C();return c?.layerModel||c?.model||c?.coreModel||allModels()[0]||null;}
function waypointModel(){const c=C();return c?.coreModel||c?.model||c?.layerModel||allModels()[0]||null;}
function recordsFor(model){
  const c=C(),t=T();if(!model||!t)return [];
  let records=c?.recordsByMain?.get(model.main)||null;
  if(!records){records=t.parseRaceRecords(model.main);c?.recordsByMain?.set(model.main,records);}
  for(const r of records){
    if(r.baseResourceId==null&&typeof t.raceBaseResourceId==='function')r.baseResourceId=t.raceBaseResourceId(r,model.resourceTableOffset+RUNTIME_MAIN_BASE);
    if(!r.waypointDescriptors&&typeof t.parseWaypointDescriptors==='function')r.waypointDescriptors=t.parseWaypointDescriptors(model.main,r);
  }
  return records;
}
function recordFor(model,index){
  const t=T();if(!model||!t)return null;const base=t.TRACK_BASE_IDS?.[index];
  return recordsFor(model).find(r=>r.baseResourceId===base)||null;
}
function customKey(index){return `custom:${Number(index)}`;}
function authorKey(index){return `package:${customKey(index)}`;}
function selectedOption(){return $('trackSelect')?.selectedOptions?.[0]||null;}
function selectedCustomNumber(){
  const o=selectedOption();if(o?.dataset?.indyheatCustom!=='1')return null;
  const n=Number(o.dataset.indyheatCircuitIndex);return Number.isInteger(n)?n:null;
}
function currentSelectedSlot(){const n=selectedCustomNumber();return n==null?null:slots.get(n)||null;}
function queueFullRefresh(reason='circuit data changed'){
  const sel=$('trackSelect');if(!sel)return false;
  const token=++refreshToken;
  if(refreshTimer!=null)clearTimeout(refreshTimer);
  refreshTimer=setTimeout(()=>{
    if(token!==refreshToken)return;
    refreshTimer=null;
    // Re-run the editor's established selected-track change path only after the
    // custom package has been materialised (or the retail host restored).  This
    // refreshes every consumer of the shared models: core backdrop, foreground,
    // surface, recovery, waypoints, race setup, validation and auxiliary UI.
    sel.dispatchEvent(new Event('change',{bubbles:true}));
    document.dispatchEvent(new CustomEvent('indyheat-circuit-content-refreshed',{detail:{reason,trackIndex:Number(sel.value||0),circuitIndex:selectedCustomNumber()}}));
  },0);
  return true;
}

function rawStoredRecord(main,point){
  if(point?.fileOffset!=null&&main&&point.fileOffset>=0&&point.fileOffset+6<=main.length)return main.slice(point.fileOffset,point.fileOffset+6);
  if(point?.storedBytes?.length>=6)return Uint8Array.from(point.storedBytes.slice(0,6));
  throw new Error('Waypoint has no six-byte stored representation');
}
function concat(parts){let n=0;for(const p of parts)n+=p.length;const out=new Uint8Array(n);let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;}
function rawEncodeWaypoints(record,main){
  const routes=record?.waypointDescriptors;if(!Array.isArray(routes)||routes.length<3)throw new Error('Three waypoint routes are required');
  const parts=[Uint8Array.of(0x49,0x48,0x57,0x50,0,1,0,3)];
  for(let i=0;i<3;i++){
    const set=routes[i],points=Array.isArray(set?.points)?set.points:[],boundary=set?.boundaryPoint||null;
    if(points.length>0xffff)throw new Error('Waypoint route exceeds 65535 points');
    parts.push(Uint8Array.of((points.length>>>8)&255,points.length&255,0,boundary?1:0));
    for(const point of points)parts.push(rawStoredRecord(main,point));
    if(boundary)parts.push(rawStoredRecord(main,boundary));
  }
  return concat(parts);
}
function directWriteWaypoints(model,record,bytes){
  const p=P(),t=T();if(!p||!t||!model||!record)throw new Error('Waypoint template is unavailable');
  const routes=p.decodeWaypointsBin(bytes),sets=record.waypointDescriptors||[];
  if(sets.length<3)throw new Error('Retail waypoint template is unavailable');
  for(let i=0;i<3;i++){
    const src=routes[i],dst=sets[i];
    if(src.points.length!==dst.points.length)throw new Error(`Waypoint route ${'ABC'[i]} count ${src.points.length} does not match host ${dst.points.length}`);
    if(!!src.boundaryBytes!==!!dst.boundaryPoint)throw new Error(`Waypoint route ${'ABC'[i]} boundary shape does not match host`);
    for(let n=0;n<src.points.length;n++)model.main.set(src.points[n],dst.points[n].fileOffset);
    if(src.boundaryBytes&&dst.boundaryPoint)model.main.set(src.boundaryBytes,dst.boundaryPoint.fileOffset);
  }
  record.waypointDescriptors=t.parseWaypointDescriptors(model.main,record);
}
function retailRouteCounts(){
  const t=T(),wm=waypointModel();if(!t||!wm)return [];
  return (t.TRACK_BASE_IDS||[]).map((_,i)=>{
    const r=recordFor(wm,i);return (r?.waypointDescriptors||[]).map(s=>s.points.length);
  });
}
function templateIndexFromZip(pkg,entries){
  const p=P(),b=entries.get(`${pkg.folder}/template.bin`);
  if(b){
    if(b.length!==2)throw new Error('template.bin must be exactly 2 bytes');
    const n=((b[0]<<8)|b[1])>>>0;if(n>9)throw new Error(`template.bin host ${n} is outside retail template range 0–9`);return n;
  }
  return p.inferTemplateIndex(pkg.circuitIndex,pkg.routeCounts,retailRouteCounts());
}
function displayNameFromEntries(pkg,entries){
  const nt=N(),b=entries.get(`${pkg.folder}/name.bin`);
  if(b&&nt?.decodeNameBytes){const name=nt.decodeNameBytes(b);if(name)return name;}
  return `Custom circuit ${pkg.circuitIndex}`;
}
function currentMapId(fallback=0){
  const n=Number($('circuitMapId')?.value);return Number.isInteger(n)&&n>=0&&n<=7?n:Number(fallback)||0;
}
function currentName(fallback=''){
  const s=String($('raceCircuitName')?.value??'').replace(/\s+/g,' ').trim();return s||fallback;
}
function currentWaypointBytes(slot,index,record,model){
  const routes=W()?.routesForKey?.(authorKey(slot.circuitIndex));
  return routes?.length===3?rawEncodeWaypoints({waypointDescriptors:routes},null):rawEncodeWaypoints(record,model.main);
}
function snapshotTrack(index,{circuitIndex=index,mapId=0,slot=null}={}){
  const p=P(),r=R(),pm=primaryModel(),rm=resourceModel(),wm=waypointModel();
  if(!p||!r||!pm||!rm||!wm)throw new Error('Circuit models are not ready');
  const pr=recordFor(pm,index),rr=recordFor(rm,index),wr=recordFor(wm,index);if(!pr||!rr||!wr)throw new Error(`Retail host ${index} is unavailable`);
  const base=rr.baseResourceId,pres=p.readPresentation(pm.main,pr.offset),q=p.resolvePreviewResource(pm,pr);
  const waypointsBin=slot?currentWaypointBytes(slot,index,wr,wm):rawEncodeWaypoints(wr,wm.main);
  return {
    circuitIndex,
    resources:{
      background:rm.getResource(base).data.slice(),foreground:rm.getResource(base+1).data.slice(),
      surface:rm.getResource(base+2).data.slice(),recovery:rm.getResource(base+3).data.slice()
    },
    previewBin:q.resource.data.slice(),waypointsBin,
    raceSetupBin:r.makeCompactBin(pm.main,pr),
    presentationBin:p.encodePresentationBin({mapId,presentation:pres})
  };
}
function applyFixedPackage(pkg,index){
  const p=P(),r=R(),t=T(),models=allModels();if(!p||!r||!t||!models.length)throw new Error('Disk.1 must be loaded before selecting a custom circuit');
  const pres=p.decodePresentationBin(pkg.presentationBin);
  for(const model of models){
    const rec=recordFor(model,index);if(!rec)throw new Error(`Retail host ${index} is unavailable`);
    const base=rec.baseResourceId,target=[model.getResource(base),model.getResource(base+1),model.getResource(base+2),model.getResource(base+3)];
    const src=[pkg.resources.background,pkg.resources.foreground,pkg.resources.surface,pkg.resources.recovery];
    for(let i=0;i<4;i++){
      if(target[i].data.length!==src[i].length)throw new Error(`Imported ${['background','foreground','surface','recovery'][i]}.bin does not match host resource size`);
      target[i].data.set(src[i]);
    }
    const q=p.resolvePreviewResource(model,rec);if(q.resource.data.length!==pkg.previewBin.length)throw new Error('preview.bin does not match host resource size');q.resource.data.set(pkg.previewBin);
    r.applyCompactBin(model.main,rec,pkg.raceSetupBin);p.writePresentation(model.main,rec.offset,pres);
  }
  return pres;
}
function applyWaypointPackage(slot){
  const p=P(),t=T(),wm=waypointModel(),rec=recordFor(wm,slot.hostIndex);if(!p||!t||!wm||!rec)return;
  rec.waypointDescriptors=t.parseWaypointDescriptors(wm.main,rec);
  const hostCounts=rec.waypointDescriptors.map(s=>s.points.length),routes=p.decodeWaypointsBin(slot.package.waypointsBin),counts=routes.map(s=>s.points.length);
  const same=counts.every((n,i)=>n===hostCounts[i]&&!!routes[i].boundaryBytes===!!rec.waypointDescriptors[i].boundaryPoint);
  if(same){
    for(const model of allModels()){
      const mr=recordFor(model,slot.hostIndex);mr.waypointDescriptors=t.parseWaypointDescriptors(model.main,mr);directWriteWaypoints(model,mr,slot.package.waypointsBin);
    }
    W()?.clearPackageRoutes?.(authorKey(slot.circuitIndex));
  }else{
    W()?.installPackageRoutes?.(authorKey(slot.circuitIndex),slot.package.waypointsBin,rec.waypointDescriptors);
  }
}
function applyPackage(slot){
  const pres=applyFixedPackage(slot.package,slot.hostIndex);applyWaypointPackage(slot);slot.mapId=pres.mapId;
}
function restoreHost(slot){
  if(!slot?.hostSnapshot)return;
  applyFixedPackage(slot.hostSnapshot,slot.hostIndex);
  for(const model of allModels()){
    const rec=recordFor(model,slot.hostIndex),t=T();if(!rec||!t)continue;rec.waypointDescriptors=t.parseWaypointDescriptors(model.main,rec);directWriteWaypoints(model,rec,slot.hostSnapshot.waypointsBin);
  }
  slot.hostSnapshot=null;
}
function captureSlot(slot=activeSlot){
  if(!slot)return;
  const mapId=currentMapId(slot.mapId),snap=snapshotTrack(slot.hostIndex,{circuitIndex:slot.circuitIndex,mapId,slot});
  slot.package={...slot.package,...snap,circuitIndex:slot.circuitIndex};slot.mapId=mapId;slot.name=currentName(slot.name);
  updateOption(slot);
}
function deactivateActiveSlot(){
  if(!activeSlot)return;
  const old=activeSlot;captureSlot(old);restoreHost(old);activeSlot=null;queueFullRefresh('retail host restored');
}
function syncCanonicalUi(slot){
  if(!slot||activeSlot!==slot)return;
  const number=$('circuitNumber'),map=$('circuitMapId');
  if(number&&Number(number.value)!==slot.circuitIndex){number.value=String(slot.circuitIndex);number.dispatchEvent(new Event('change',{bubbles:true}));}
  if(map&&Number(map.value)!==slot.mapId){map.value=String(slot.mapId);map.dispatchEvent(new Event('change',{bubbles:true}));}
}
function activateSlot(slot){
  if(!slot||activeSlot===slot){if(slot)syncCanonicalUi(slot);return;}
  if(activeSlot)deactivateActiveSlot();
  slot.hostSnapshot=snapshotTrack(slot.hostIndex,{circuitIndex:slot.hostIndex,mapId:0});
  applyPackage(slot);activeSlot=slot;
  syncCanonicalUi(slot);
  setTimeout(()=>syncCanonicalUi(slot),0);setTimeout(()=>syncCanonicalUi(slot),60);
  queueFullRefresh('custom circuit materialised');
}
function updateOption(slot){
  if(!slot?.option)return;
  slot.option.value=String(slot.hostIndex);slot.option.dataset.indyheatCustom='1';slot.option.dataset.indyheatPackageKey=customKey(slot.circuitIndex);
  slot.option.dataset.indyheatCircuitIndex=String(slot.circuitIndex);slot.option.dataset.indyheatCircuitName=slot.name;
  slot.option.textContent=`${slot.circuitIndex} – ${slot.name}`;
}
function sortCustomOptions(){
  const sel=$('trackSelect');if(!sel)return;
  [...sel.querySelectorAll('option[data-indyheat-custom="1"]')]
    .sort((a,b)=>Number(a.dataset.indyheatCircuitIndex)-Number(b.dataset.indyheatCircuitIndex))
    .forEach(o=>sel.appendChild(o));
}
function emitChanged(){
  root.dispatchEvent(new CustomEvent('indyheat-circuit-library-changed',{detail:{circuits:loadedCircuits()}}));
}
function loadedCircuits(){
  return [...slots.values()].sort((a,b)=>a.circuitIndex-b.circuitIndex).map(s=>({circuitIndex:s.circuitIndex,name:s.name,hostIndex:s.hostIndex,loaded:true}));
}
function replaceExistingNumber(n,except=null){
  const old=slots.get(n);if(!old||old===except)return;
  if(activeSlot===old)deactivateActiveSlot();
  W()?.clearPackageRoutes?.(authorKey(n));old.option?.remove();slots.delete(n);
}
function selectSlotOption(slot){
  const sel=$('trackSelect');if(!sel||!slot?.option)return;
  sel.selectedIndex=[...sel.options].indexOf(slot.option);sel.dispatchEvent(new Event('change',{bubbles:true}));
}
async function importCustomBytes(bytes,fileName='circuit.zip'){
  const p=P();if(!p)throw new Error('Circuit package tools are unavailable');
  const pkg=p.parseCircuitZip(bytes),n=pkg.circuitIndex;if(n<CUSTOM_MIN||n>CUSTOM_MAX)throw new Error(`Custom circuit number must be ${CUSTOM_MIN}–${CUSTOM_MAX}`);
  const entries=p.readZipStore(bytes),hostIndex=templateIndexFromZip(pkg,entries),name=displayNameFromEntries(pkg,entries);
  replaceExistingNumber(n);
  const sel=$('trackSelect');if(!sel)throw new Error('Circuit selector is unavailable');
  const option=document.createElement('option'),slot={circuitIndex:n,key:customKey(n),hostIndex,name,mapId:pkg.presentation?.mapId??0,package:pkg,option,hostSnapshot:null,fileName};
  slots.set(n,slot);updateOption(slot);sel.appendChild(option);sortCustomOptions();selectSlotOption(slot);emitChanged();
  status(`Loaded circuit ${n} – ${name}. ${slots.size} custom circuit${slots.size===1?'':'s'} open.`);
  return slot;
}
async function importHandler(e){
  if(importPassThrough)return;
  const input=e.currentTarget,file=input?.files?.[0];if(!file)return;
  // Target-capture runs after the existing name/waypoint capture hooks but before
  // circuit-package.js's legacy single-custom bubble listener.
  e.preventDefault();e.stopImmediatePropagation();
  try{
    const bytes=new Uint8Array(await file.arrayBuffer()),p=P();if(!p)throw new Error('Circuit package tools are unavailable');
    const pkg=p.parseCircuitZip(bytes);
    if(pkg.circuitIndex<CUSTOM_MIN){
      importPassThrough=true;
      try{input.dispatchEvent(new Event('change',{bubbles:true}));}finally{importPassThrough=false;}
      return;
    }
    await importCustomBytes(bytes,file.name);
  }catch(err){status(`ERROR: ${err.message}`,true);}
  finally{if(!importPassThrough&&input)input.value='';}
}
function selectedTrackChanged(){
  const slot=currentSelectedSlot();
  if(slot)activateSlot(slot);
  else if(activeSlot)deactivateActiveSlot();
}
function beforeTrackChange(e){
  if(e.target?.id!=='trackSelect'||!activeSlot)return;
  const o=e.target.selectedOptions?.[0],next=Number(o?.dataset?.indyheatCircuitIndex);
  if(o?.dataset?.indyheatCustom==='1'&&next===activeSlot.circuitIndex)return;
  // Restore the host before circuit-package.js's own target-capture selection
  // handler has a chance to activate a retail package into the same host.
  deactivateActiveSlot();
}
function rekeyActiveSlot(n){
  const slot=activeSlot;if(!slot||n===slot.circuitIndex)return;
  if(!Number.isInteger(n)||n<CUSTOM_MIN||n>CUSTOM_MAX){
    const input=$('circuitNumber');if(input)input.value=String(slot.circuitIndex);
    status(`Custom circuits use numbers ${CUSTOM_MIN}–${CUSTOM_MAX}; retail slots remain 0–9.`,true);return;
  }
  captureSlot(slot);const old=slot.circuitIndex;replaceExistingNumber(n,slot);slots.delete(old);W()?.clearPackageRoutes?.(authorKey(old));
  slot.circuitIndex=n;slot.key=customKey(n);slot.package.circuitIndex=n;slots.set(n,slot);updateOption(slot);sortCustomOptions();
  // Re-install any detached variable route structure under the new package key.
  applyWaypointPackage(slot);queueFullRefresh('custom circuit re-keyed');emitChanged();status(`Custom circuit renumbered ${old} → ${n}.`);
}
function circuitNumberChanged(e){
  if(e.target?.id!=='circuitNumber'||!activeSlot)return;rekeyActiveSlot(Number(e.target.value));
}
function nameChanged(e){
  if(e.target?.id!=='raceCircuitName'||!activeSlot)return;
  const name=String(e.target.value||'').replace(/\s+/g,' ').trim();if(!name)return;
  activeSlot.name=name;updateOption(activeSlot);emitChanged();
}
function reset(){
  if(activeSlot){try{restoreHost(activeSlot);}catch(_e){}activeSlot=null;queueFullRefresh('custom circuit library reset');}
  for(const s of slots.values())s.option?.remove();slots.clear();emitChanged();
}
function install(){
  const input=$('circuitPackageInput'),select=$('trackSelect');if(!input||!select||!P()||!T()||!R())return false;
  // Install after the established waypoint and circuit-name capture hooks so they
  // can inspect the original ZIP first; this capture listener then suppresses
  // only the legacy single-custom bubble importer.
  if(!input.dataset.indyHeatVariableWaypointHook||!input.dataset.circuitNameHook)return false;
  if(!input.dataset.indyheatCircuitLibrary){input.dataset.indyheatCircuitLibrary='1';input.addEventListener('change',importHandler,true);}
  if(!select.dataset.indyheatCircuitLibrary){
    select.dataset.indyheatCircuitLibrary='1';
    document.addEventListener('change',beforeTrackChange,true);
    select.addEventListener('change',selectedTrackChanged);
    document.addEventListener('change',circuitNumberChanged);
    document.addEventListener('input',nameChanged);
    document.addEventListener('change',nameChanged);
    document.addEventListener('indyheat-race-setup-capture',e=>{if(e.detail?.type==='model')reset();});
  }
  return true;
}

const api={
  version:VERSION,
  ownsCircuitIndex:n=>Number.isInteger(Number(n))&&Number(n)>=CUSTOM_MIN&&Number(n)<=CUSTOM_MAX,
  loadedCircuits,
  get:n=>{const s=slots.get(Number(n));return s?{circuitIndex:s.circuitIndex,name:s.name,hostIndex:s.hostIndex,loaded:true}:null;},
  importBytes:importCustomBytes,
  refresh:emitChanged,
  refreshSelectedContent:queueFullRefresh
};
root.IndyHeatCustomCircuitLibrary=api;

function boot(){let tries=0;if(install())return;bootTimer=setInterval(()=>{if(install()||++tries>300){clearInterval(bootTimer);bootTimer=null;}},50);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});else setTimeout(boot,0);

})(typeof globalThis!=='undefined'?globalThis:this);
