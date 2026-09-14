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

const capture=root.IndyHeatRecoveryCapture={generation:0,epoch:0,seq:0,heading:[],surface:[]};
const trackIndex=()=>Number(document.getElementById('trackSelect')?.value||0);
const trim=a=>{if(a.length>80)a.splice(0,a.length-80);};

function bumpGeneration(){capture.generation++;capture.epoch++;capture.heading.length=0;capture.surface.length=0;}
document.getElementById('fileInput')?.addEventListener('change',bumpGeneration,true);
document.getElementById('dropZone')?.addEventListener('drop',bumpGeneration,true);
document.getElementById('trackSelect')?.addEventListener('change',()=>{capture.epoch++;},true);

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
})(typeof globalThis!=='undefined'?globalThis:this);
