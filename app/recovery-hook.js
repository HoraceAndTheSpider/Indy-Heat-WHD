(function(root){
'use strict';

function normByte(v){ return ((Number(v)||0)%256+256)%256; }
function rotateValue(v,delta){ return normByte(normByte(v)+Number(delta||0)); }
function screenVector(v){
  const a=normByte(v)*Math.PI*2/256;
  return {x:Math.cos(a),y:-Math.sin(a)};
}
function cellIntersectsSurfaceClass(cells,gx,gy,target=1,width=160,height=112){
  if(!cells)return false;
  const sx=gx*4,sy=gy*4;
  for(let y=sy;y<Math.min(sy+4,height);y++){
    for(let x=sx;x<Math.min(sx+4,width);x++){
      if(cells[y*width+x]===target)return true;
    }
  }
  return false;
}
function rectIndices(x0,y0,x1,y1,width=40,height=28){
  let ax=Math.max(0,Math.min(width-1,Math.min(x0,x1)));
  let bx=Math.max(0,Math.min(width-1,Math.max(x0,x1)));
  let ay=Math.max(0,Math.min(height-1,Math.min(y0,y1)));
  let by=Math.max(0,Math.min(height-1,Math.max(y0,y1)));
  const out=[];
  for(let y=ay;y<=by;y++)for(let x=ax;x<=bx;x++)out.push(y*width+x);
  return out;
}
function rawAngleDegrees(v){ return normByte(v)*360/256; }

const helpers={normByte,rotateValue,screenVector,cellIntersectsSurfaceClass,rectIndices,rawAngleDegrees};
root.IndyHeatRecoveryTools=helpers;
if(typeof module!=='undefined'&&module.exports)module.exports=helpers;

const T=root.IndyHeatTools;
if(!T||typeof document==='undefined')return;

const capture=root.IndyHeatRecoveryCapture={generation:0,epoch:0,seq:0,heading:[],surface:[],background:[]};

// Capture app.js's own Circuit <select> change listener while app.js is loaded after
// this hook.  Backdrop import can then ask the core editor to re-run selectTrack()
// directly instead of relying on a synthetic DOM change event.  The wrapper is
// restored before extension scripts are injected, so later editor modes see the
// normal addEventListener implementation.
const trackSelectElement=document.getElementById('trackSelect');
let coreTrackChangeListener=null;
let restoreTrackAddListener=null;
if(trackSelectElement){
  const nativeAdd=trackSelectElement.addEventListener;
  trackSelectElement.addEventListener=function(type,listener,options){
    const captureOption=options===true || (options&&typeof options==='object'&&options.capture===true);
    if(type==='change' && !captureOption && !coreTrackChangeListener) coreTrackChangeListener=listener;
    return nativeAdd.call(this,type,listener,options);
  };
  restoreTrackAddListener=()=>{trackSelectElement.addEventListener=nativeAdd;restoreTrackAddListener=null;};
}
root.IndyHeatEditorBridge={
  refreshSelectedTrack(){
    const sel=document.getElementById('trackSelect');
    if(!sel)return false;
    if(typeof coreTrackChangeListener==='function'){
      coreTrackChangeListener.call(sel,{type:'change',target:sel,currentTarget:sel});
      return true;
    }
    sel.dispatchEvent(new Event('change',{bubbles:true}));
    return false;
  }
};

// Shared main/race capture for the race-setup editor.  This is intentionally hooked
// before app.js runs, just like the established recovery capture, so the editor can
// modify the same decrunched main image without adding another Disk.1 loader.
const raceCapture=root.IndyHeatRaceSetupCapture={generation:0,model:null,originalMain:null,records:null,coreModel:null,layerModel:null,models:[],recordsByMain:new Map()};
const trackIndex=()=>Number(document.getElementById('trackSelect')?.value||0);
const trim=a=>{if(a.length>80)a.splice(0,a.length-80);};
function emitRaceCapture(type){document.dispatchEvent(new CustomEvent('indyheat-race-setup-capture',{detail:{type,generation:raceCapture.generation,trackIndex:trackIndex()}}));}

const makeDiskModel=T.makeDiskModel.bind(T);
T.makeDiskModel=function(disk){
  const model=makeDiskModel(disk),stack=String(new Error().stack||'');
  raceCapture.generation++;
  raceCapture.model=model;
  raceCapture.originalMain=model.main.slice();
  raceCapture.records=null;
  if(!raceCapture.models.includes(model))raceCapture.models.push(model);
  if(/(?:^|\/)app\.js(?::|\?)/.test(stack))raceCapture.coreModel=model;
  else if(/layer-editor\.js(?::|\?)/.test(stack))raceCapture.layerModel=model;
  else if(!raceCapture.coreModel)raceCapture.coreModel=model;
  else if(!raceCapture.layerModel&&raceCapture.coreModel!==model)raceCapture.layerModel=model;
  emitRaceCapture('model');
  return model;
};

const parseRaceRecords=T.parseRaceRecords.bind(T);
T.parseRaceRecords=function(main,...args){
  const records=parseRaceRecords(main,...args);
  raceCapture.recordsByMain.set(main,records);
  if(raceCapture.model&&main===raceCapture.model.main){raceCapture.records=records;emitRaceCapture('records');}
  return records;
};

function bumpGeneration(){
  capture.generation++;capture.epoch++;capture.heading.length=0;capture.surface.length=0;capture.background.length=0;
  raceCapture.model=null;raceCapture.originalMain=null;raceCapture.records=null;raceCapture.coreModel=null;raceCapture.layerModel=null;raceCapture.models=[];raceCapture.recordsByMain=new Map();
}
document.getElementById('fileInput')?.addEventListener('change',bumpGeneration,true);
document.getElementById('dropZone')?.addEventListener('drop',bumpGeneration,true);
document.getElementById('trackSelect')?.addEventListener('change',()=>{capture.epoch++;},true);

const decodePlanar=T.decodePlanar.bind(T);
T.decodePlanar=function(data,width,height,planes,offset=0){
  const result=decodePlanar(data,width,height,planes,offset);
  // app.js stores this exact returned Uint8Array in state.bg. Capture the object,
  // not just the source resource, so backdrop import can update the live preview
  // in place without trying to call app.js's private selectTrack()/render functions.
  if(width===320&&height===256&&planes===5){
    capture.background.push({generation:capture.generation,epoch:capture.epoch,trackIndex:trackIndex(),seq:++capture.seq,data,offset,result});
    trim(capture.background);
    document.dispatchEvent(new CustomEvent('indyheat-recovery-capture',{detail:{type:'background',generation:capture.generation,trackIndex:trackIndex()}}));
  }
  return result;
};

const decodeHeading=T.decodeHeadingGrid.bind(T);
T.decodeHeadingGrid=function(data,offset=0){
  const result=decodeHeading(data,offset);
  capture.heading.push({generation:capture.generation,epoch:capture.epoch,trackIndex:trackIndex(),seq:++capture.seq,data,offset,result});
  trim(capture.heading);
  document.dispatchEvent(new CustomEvent('indyheat-recovery-capture',{detail:{type:'heading',generation:capture.generation,trackIndex:trackIndex()}}));
  return result;
};

const decodeSurface=T.decodeSurface2bpp.bind(T);
T.decodeSurface2bpp=function(data,offset=0){
  const result=decodeSurface(data,offset);
  capture.surface.push({generation:capture.generation,epoch:capture.epoch,trackIndex:trackIndex(),seq:++capture.seq,data,offset,result,initialCells:result.cells.slice()});
  trim(capture.surface);
  document.dispatchEvent(new CustomEvent('indyheat-recovery-capture',{detail:{type:'surface',generation:capture.generation,trackIndex:trackIndex()}}));
  return result;
};

// Load the post-v0.11 editor extensions after the existing static editor scripts have
// initialised. Keeping the bootstrap here avoids changing index.html while preserving the
// required pre-app parser capture above.
function loadEditorExtensions(){
  if(restoreTrackAddListener)restoreTrackAddListener();
  if(!document.querySelector('script[data-indyheat-race-setup]')){
    const s=document.createElement('script');s.src='race-setup.js';s.dataset.indyheatRaceSetup='1';document.head.appendChild(s);
  }
  if(!document.querySelector('script[data-indyheat-track-backdrop]')){
    const s=document.createElement('script');s.src='track-backdrop.js';s.dataset.indyheatTrackBackdrop='1';document.head.appendChild(s);
  }
  if(!document.querySelector('script[data-indyheat-circuit-package]')){
    const s=document.createElement('script');s.src='circuit-package.js';s.dataset.indyheatCircuitPackage='1';document.head.appendChild(s);
  }
}
if(document.readyState==='complete')setTimeout(loadEditorExtensions,0);
else root.addEventListener('load',()=>setTimeout(loadEditorExtensions,0),{once:true});
})(typeof globalThis!=='undefined'?globalThis:this);
