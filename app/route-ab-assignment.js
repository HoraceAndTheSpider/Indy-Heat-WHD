(function(root){
'use strict';

/*
 * Route A/B starting-assignment authoring.
 *
 * race+$6C.l is evaluated separately while each car is initialised. Retail
 * values are $00000000 and $FFFFFFFF; toggling between them swaps which of the
 * paired Route A/B descriptors is selected first for the same per-car state.
 * It does not move, mirror, reverse or relabel either waypoint route.
 *
 * Modern packages store this value explicitly at race_setup.bin +$70.l in the
 * $74-byte format. The short-lived v0.123 route_settings.bin byte +$0B encoding
 * is accepted on import only so those packages remain usable. New exports leave
 * route_settings.bin unchanged.
 */
const ROUTE_SETTING_OFFSET=0x0B;
const EXPLICIT_BIT=0x80;
const SWAPPED_BIT=0x01;
const RACE_OFFSET=0x6C;
const states=new Map();
const pendingImports=new Map();
let installed=false;

const $=id=>document.getElementById(id);
function T(){return root.IndyHeatTools||null;}
function C(){return root.IndyHeatRaceSetupCapture||null;}
function P(){return root.IndyHeatCircuitPackage||null;}
function selectedOption(){return $('trackSelect')?.selectedOptions?.[0]||null;}
function trackIndex(){return Number($('trackSelect')?.value||0);}
function circuitIndex(){
  const o=selectedOption(),n=Number(o?.dataset?.indyheatCircuitIndex);
  if(o?.dataset?.indyheatCustom==='1'&&Number.isInteger(n))return n;
  const field=Number($('circuitNumber')?.value);
  return Number.isInteger(field)?field:trackIndex();
}
function stateKey(){
  const o=selectedOption();if(!o)return `retail:${trackIndex()}`;
  const n=Number(o.dataset?.indyheatCircuitIndex);
  if(o.dataset?.indyheatCustom==='1'&&Number.isInteger(n))return `custom:${n}`;
  const retail=o.dataset?.indyheatRetailIndex;
  return `retail:${retail==null?trackIndex():retail}`;
}
function authoringModels(){
  const c=C(),out=[];
  for(const m of [c?.coreModel,c?.model,c?.layerModel,...(c?.models||[])])if(m&&!out.includes(m))out.push(m);
  return out;
}
function recordFor(model,index=trackIndex()){
  const t=T();if(!model||!t?.TRACK_BASE_IDS||typeof t.parseRaceRecords!=='function'||typeof t.raceBaseResourceId!=='function')return null;
  const base=t.TRACK_BASE_IDS[index];if(base==null)return null;
  const records=t.parseRaceRecords(model.main);
  for(const r of records){r.baseResourceId=t.raceBaseResourceId(r,model.resourceTableOffset+0x1000);if(r.baseResourceId===base)return r;}
  return null;
}
function be32(bytes,o){return (((bytes[o]<<24)>>>0)|(bytes[o+1]<<16)|(bytes[o+2]<<8)|bytes[o+3])>>>0;}
function wr32(bytes,o,v){v>>>=0;bytes[o]=(v>>>24)&255;bytes[o+1]=(v>>>16)&255;bytes[o+2]=(v>>>8)&255;bytes[o+3]=v&255;}
function readSwap(model,index=trackIndex()){
  const r=recordFor(model,index);if(!r)return null;
  const v=be32(model.main,r.offset+RACE_OFFSET);
  if(v===0)return false;if(v===0xffffffff)return true;
  return null;
}
function writeSwap(model,swapped,index=trackIndex()){
  const r=recordFor(model,index);if(!r)return false;
  wr32(model.main,r.offset+RACE_OFFSET,swapped?0xffffffff:0);return true;
}
function liveSwap(){for(const m of authoringModels()){const v=readSwap(m);if(v!==null)return v;}return false;}
function currentSwap(){const key=stateKey();return states.has(key)?states.get(key):liveSwap();}
function writeAll(swapped){let n=0;for(const m of authoringModels())if(writeSwap(m,swapped))n++;return n;}
function sync({restore=true}={}){
  const e=$('routeABSwap');if(!e)return;
  const key=stateKey();
  if(!states.has(key))states.set(key,liveSwap());
  const swapped=states.get(key);
  if(restore)writeAll(swapped);
  e.checked=swapped;
}

function injectControl(){
  if($('routeABSwap'))return true;
  const anchor=$('routeLapSettings');if(!anchor)return false;
  const label=document.createElement('label');label.className='checkline';
  label.innerHTML='<input id="routeABSwap" type="checkbox"> Swap Route A/B starting assignment';
  anchor.insertAdjacentElement('beforebegin',label);
  $('routeABSwap')?.addEventListener('change',e=>{
    const swapped=!!e.target.checked;states.set(stateKey(),swapped);writeAll(swapped);sync({restore:false});
  });
  sync();return true;
}

function decodeLegacyStoredAssignment(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length!==0x0C)return null;
  const v=bytes[ROUTE_SETTING_OFFSET];
  if(!(v&EXPLICIT_BIT))return null;
  if(v&0x7e)throw new Error('Invalid legacy Route A/B starting assignment in route_settings.bin');
  return !!(v&SWAPPED_BIT);
}
function decodeRaceSetupAssignment(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length<0x74)return null;
  const v=be32(bytes,0x70);
  if(v===0)return false;if(v===0xffffffff)return true;
  throw new Error('race_setup.bin Route A/B starting assignment must be $00000000 or $FFFFFFFF');
}
function selectedCircuitMatches(index){
  const o=selectedOption();
  return o?.dataset?.indyheatCustom==='1'&&Number(o.dataset.indyheatCircuitIndex)===Number(index);
}
function applyPending(){
  const index=circuitIndex();if(!pendingImports.has(index)||!selectedCircuitMatches(index))return false;
  const pending=pendingImports.get(index),key=`custom:${index}`;
  pendingImports.delete(index);
  if(pending.explicit)states.set(key,pending.swapped);
  else states.delete(key); // legacy package: take the newly materialised host value once
  sync();return true;
}
function captureImport(file){
  const p=P();if(!file||!p?.readZipStore||!p?.parseCircuitZip)return;
  (async()=>{
    try{
      const bytes=new Uint8Array(await file.arrayBuffer()),pkg=p.parseCircuitZip(bytes),entries=p.readZipStore(bytes);
      const setup=entries.get(`${pkg.folder}/race_setup.bin`),settings=entries.get(`${pkg.folder}/route_settings.bin`);
      let swapped=decodeRaceSetupAssignment(setup);
      if(swapped===null)swapped=decodeLegacyStoredAssignment(settings);
      pendingImports.set(Number(pkg.circuitIndex),swapped===null?{explicit:false}:{explicit:true,swapped});
      for(const delay of [0,25,75,150])setTimeout(()=>applyPending(),delay);
    }catch(err){console.warn('Route A/B assignment import:',err);}
  })();
}
function installImportHook(){
  const input=$('circuitPackageInput');if(!input||input.dataset.routeABAssignmentHook)return !!input;
  input.dataset.routeABAssignmentHook='1';
  input.addEventListener('change',e=>captureImport(e.target.files?.[0]),true);
  return true;
}
function install(){
  const ok=injectControl();installImportHook();
  if(ok&&!installed){
    installed=true;
    $('trackSelect')?.addEventListener('change',()=>setTimeout(()=>{applyPending();sync();},0));
    document.addEventListener('indyheat-race-setup-capture',()=>setTimeout(()=>{applyPending();sync();},0));
    root.addEventListener?.('indyheat-circuit-library-changed',()=>setTimeout(()=>{applyPending();sync();},0));
  }
  return ok&&!!P();
}
let tries=0;function boot(){if(install()||++tries>240)return;setTimeout(boot,50);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});else setTimeout(boot,0);

root.IndyHeatRouteABAssignment={version:'0.124',readSwap,writeAll,currentSwap,decodeRaceSetupAssignment,decodeLegacyStoredAssignment};
})(typeof globalThis!=='undefined'?globalThis:this);
