(function(root){
'use strict';

/*
 * Shared raster-editing primitives for the circuit editors.
 *
 * Surface/Foreground use the generic API directly. MiniMap keeps its specialised
 * resource/gesture handling but calls the compatibility primitives below, which
 * all route through the same geometry/brush/fill implementation. The API is
 * deliberately resource-neutral so Backdrop can adopt it later.
 */

const TOOL_ALIASES=Object.freeze({
  pencil:'freehand',
  freehand:'freehand',
  line:'line',
  rect:'rectangle',
  rectangle:'rectangle',
  'rect-filled':'rectangle-filled',
  'rectangle-filled':'rectangle-filled',
  ellipse:'ellipse',
  circle:'ellipse',
  'ellipse-filled':'ellipse-filled',
  'circle-filled':'ellipse-filled',
  curve:'curve',
  freeform:'freeform',
  polygon:'freeform',
  fill:'fill',
  pick:'pick',
  template:'template'
});

function inBounds(x,y,w,h){
  return Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<w&&y<h;
}
function normaliseTool(tool){
  return TOOL_ALIASES[String(tool||'').toLowerCase()]||String(tool||'').toLowerCase();
}
function isPrimitiveTool(tool){
  tool=normaliseTool(tool);
  return tool==='line'||tool==='rectangle'||tool==='rectangle-filled'||tool==='ellipse'||tool==='ellipse-filled';
}

function getMaskPixel(data,x,y,offset=0,width=320,height=256){
  if(!inBounds(x,y,width,height))return null;
  const rowBytes=Math.ceil(width/8),index=offset+y*rowBytes+(x>>3),mask=0x80>>>(x&7);
  return (data[index]&mask)?1:0;
}
function setMaskPixel(data,x,y,value,offset=0,width=320,height=256){
  if(!inBounds(x,y,width,height))return false;
  const rowBytes=Math.ceil(width/8),index=offset+y*rowBytes+(x>>3),mask=0x80>>>(x&7);
  if(value)data[index]|=mask;
  else data[index]&=(~mask)&0xff;
  return true;
}
function getSurfaceCell(data,x,y,offset=0,width=160,height=112){
  if(!inBounds(x,y,width,height))return null;
  const rowBytes=Math.ceil(width/4),index=offset+y*rowBytes+(x>>2),shift=6-(x&3)*2;
  return (data[index]>>>shift)&3;
}
function setSurfaceCell(data,x,y,value,offset=0,width=160,height=112){
  if(!inBounds(x,y,width,height))return false;
  value=Number(value)&3;
  const rowBytes=Math.ceil(width/4),index=offset+y*rowBytes+(x>>2),shift=6-(x&3)*2,mask=3<<shift;
  data[index]=(data[index]&((~mask)&0xff))|(value<<shift);
  return true;
}

function linePoints(x0,y0,x1,y1){
  x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);
  const points=[],dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1;
  let err=dx+dy;
  while(true){
    points.push([x0,y0]);
    if(x0===x1&&y0===y1)break;
    const e2=2*err;
    if(e2>=dy){err+=dy;x0+=sx;}
    if(e2<=dx){err+=dx;y0+=sy;}
  }
  return points;
}
function uniquePoints(points){
  const seen=new Set(),out=[];
  for(const p of points||[]){
    if(!p||p.length<2)continue;
    const x=Math.round(Number(p[0])),y=Math.round(Number(p[1]));
    if(!Number.isFinite(x)||!Number.isFinite(y))continue;
    const key=`${x},${y}`;
    if(seen.has(key))continue;
    seen.add(key);out.push([x,y]);
  }
  return out;
}
function rectanglePoints(x0,y0,x1,y1){
  x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);
  const l=Math.min(x0,x1),r=Math.max(x0,x1),t=Math.min(y0,y1),b=Math.max(y0,y1);
  return uniquePoints([
    ...linePoints(l,t,r,t),...linePoints(r,t,r,b),
    ...linePoints(r,b,l,b),...linePoints(l,b,l,t)
  ]);
}
function filledRectanglePoints(x0,y0,x1,y1){
  x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);
  const l=Math.min(x0,x1),r=Math.max(x0,x1),t=Math.min(y0,y1),b=Math.max(y0,y1),out=[];
  for(let y=t;y<=b;y++)for(let x=l;x<=r;x++)out.push([x,y]);
  return out;
}
function ellipsePoints(x0,y0,x1,y1){
  x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);
  const l=Math.min(x0,x1),r=Math.max(x0,x1),t=Math.min(y0,y1),b=Math.max(y0,y1);
  const cx=(l+r)/2,cy=(t+b)/2,rx=(r-l)/2,ry=(b-t)/2;
  if(rx===0&&ry===0)return [[Math.round(cx),Math.round(cy)]];
  if(rx===0)return linePoints(Math.round(cx),t,Math.round(cx),b);
  if(ry===0)return linePoints(l,Math.round(cy),r,Math.round(cy));
  const steps=Math.max(24,Math.ceil(Math.PI*2*Math.max(rx,ry)*2)),out=[];
  let prev=null;
  for(let i=0;i<=steps;i++){
    const a=i*Math.PI*2/steps,p=[Math.round(cx+Math.cos(a)*rx),Math.round(cy+Math.sin(a)*ry)];
    if(prev)out.push(...linePoints(prev[0],prev[1],p[0],p[1]));
    prev=p;
  }
  return uniquePoints(out);
}
function filledEllipsePoints(x0,y0,x1,y1){
  x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);
  const l=Math.min(x0,x1),r=Math.max(x0,x1),t=Math.min(y0,y1),b=Math.max(y0,y1);
  const cx=(l+r)/2,cy=(t+b)/2,rx=(r-l)/2,ry=(b-t)/2,out=[];
  if(rx===0&&ry===0)return [[Math.round(cx),Math.round(cy)]];
  if(rx===0)return linePoints(Math.round(cx),t,Math.round(cx),b);
  if(ry===0)return linePoints(l,Math.round(cy),r,Math.round(cy));
  for(let y=t;y<=b;y++)for(let x=l;x<=r;x++){
    const nx=(x-cx)/rx,ny=(y-cy)/ry;
    if(nx*nx+ny*ny<=1.000001)out.push([x,y]);
  }
  return out;
}

function toolPoints(tool,a,b=a){
  tool=normaliseTool(tool);
  if(!a||!b)return [];
  const x0=Number(a.x),y0=Number(a.y),x1=Number(b.x),y1=Number(b.y);
  if(![x0,y0,x1,y1].every(Number.isFinite))return [];
  if(tool==='freehand')return linePoints(x0,y0,x1,y1);
  if(tool==='line')return linePoints(x0,y0,x1,y1);
  if(tool==='rectangle')return rectanglePoints(x0,y0,x1,y1);
  if(tool==='rectangle-filled')return filledRectanglePoints(x0,y0,x1,y1);
  if(tool==='ellipse')return ellipsePoints(x0,y0,x1,y1);
  if(tool==='ellipse-filled')return filledEllipsePoints(x0,y0,x1,y1);
  return [];
}


function pointDistance(a,b){
  if(!a||!b)return Infinity;
  const dx=Number(a.x)-Number(b.x),dy=Number(a.y)-Number(b.y);
  return Number.isFinite(dx)&&Number.isFinite(dy)?Math.hypot(dx,dy):Infinity;
}
function nearPoint(a,b,tolerance=0){
  return pointDistance(a,b)<=Math.max(0,Number(tolerance)||0);
}

/*
 * Three-point curve used by the click-based editor:
 *   start -> end establish the chord;
 *   bend is the point the curve passes through at t=.5.
 *
 * Converting that midpoint target to the quadratic Bézier control point gives:
 *   control = 2*bend - (start+end)/2
 * This makes "move away from the straight line to add bend" intuitive while
 * retaining a normal quadratic curve internally.
 */
function curvePoints(start,end,bend){
  if(!start||!end||!bend)return [];
  const p0={x:Number(start.x),y:Number(start.y)};
  const p1={x:Number(end.x),y:Number(end.y)};
  const pm={x:Number(bend.x),y:Number(bend.y)};
  if(![p0.x,p0.y,p1.x,p1.y,pm.x,pm.y].every(Number.isFinite))return [];

  const chordX=p1.x-p0.x,chordY=p1.y-p0.y;
  const bendX=pm.x-p0.x,bendY=pm.y-p0.y;
  const cross=chordX*bendY-chordY*bendX;
  if(Math.abs(cross)<1e-9)return linePoints(p0.x,p0.y,p1.x,p1.y);

  const c={
    x:2*pm.x-(p0.x+p1.x)/2,
    y:2*pm.y-(p0.y+p1.y)/2
  };
  const approxLength=Math.hypot(c.x-p0.x,c.y-p0.y)+Math.hypot(p1.x-c.x,p1.y-c.y);
  let steps=Math.max(24,Math.ceil(approxLength*2));
  if(steps&1)steps++; // ensure t=.5 is sampled, so the committed curve contains bend.
  const out=[];
  let prev=[Math.round(p0.x),Math.round(p0.y)];
  for(let i=1;i<=steps;i++){
    const t=i/steps,u=1-t;
    const q=[
      Math.round(u*u*p0.x+2*u*t*c.x+t*t*p1.x),
      Math.round(u*u*p0.y+2*u*t*c.y+t*t*p1.y)
    ];
    out.push(...linePoints(prev[0],prev[1],q[0],q[1]));
    prev=q;
  }
  out.unshift([Math.round(p0.x),Math.round(p0.y)]);
  return uniquePoints(out);
}

function polylinePoints(vertices,{closed=false}={}){
  const pts=(vertices||[])
    .filter(p=>p&&Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.y)))
    .map(p=>({x:Number(p.x),y:Number(p.y)}));
  if(!pts.length)return [];
  if(pts.length===1)return [[Math.round(pts[0].x),Math.round(pts[0].y)]];
  const out=[];
  for(let i=1;i<pts.length;i++)
    out.push(...linePoints(pts[i-1].x,pts[i-1].y,pts[i].x,pts[i].y));
  if(closed&&pts.length>2)
    out.push(...linePoints(pts[pts.length-1].x,pts[pts.length-1].y,pts[0].x,pts[0].y));
  return uniquePoints(out);
}

function brushOffsets(size=1,shape='square'){
  size=Math.max(1,Math.min(31,Math.round(Number(size)||1)));
  shape=String(shape||'square').toLowerCase()==='circle'?'circle':'square';
  const c=(size-1)/2,out=[];
  if(shape==='circle'){
    const radius=Math.max(.5,(size-1)/2+.25),rr=radius*radius;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const dx=x-c,dy=y-c;
      if(dx*dx+dy*dy<=rr)out.push([x-Math.floor(c),y-Math.floor(c)]);
    }
  }else{
    const origin=Math.floor(c);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++)out.push([x-origin,y-origin]);
  }
  return out;
}
function expandPointsWithBrush(points,size=1,shape='square'){
  const offsets=brushOffsets(size,shape),out=[];
  for(const [x,y] of points||[])for(const [dx,dy] of offsets)out.push([x+dx,y+dy]);
  return uniquePoints(out);
}
function hatchPoints(points,phase=0){
  phase=(Number(phase)||0)&1;
  return uniquePoints(points).filter(([x,y])=>(((x+y)&1)===phase));
}
function applyBrush(points,{brushSize=1,brushShape='square',hatched=false,hatchPhase=0}={}){
  let out=expandPointsWithBrush(points,brushSize,brushShape);
  return hatched?hatchPoints(out,hatchPhase):out;
}
function paintPoints(tool,a,b,options={}){
  const points=toolPoints(tool,a,b);
  return points.length?applyBrush(points,options):points;
}

function clipPoints(points,width,height){
  return uniquePoints(points).filter(([x,y])=>inBounds(x,y,width,height));
}
function writePoints(points,width,height,write){
  if(typeof write!=='function')return 0;
  let count=0;
  for(const [x,y] of uniquePoints(points)){
    if(!inBounds(x,y,width,height))continue;
    write(x,y);count++;
  }
  return count;
}
function paintRaster({points,width,height,value,set}={}){
  if(typeof set!=='function')return 0;
  return writePoints(points,width,height,(x,y)=>set(x,y,value));
}

function floodFillIndices(values,width,height,startX,startY,newValue){
  startX=Math.floor(Number(startX));startY=Math.floor(Number(startY));
  if(!values||!inBounds(startX,startY,width,height))return [];
  const start=startY*width+startX,target=values[start];
  if(target===newValue)return [];
  const seen=new Uint8Array(width*height),stack=[start],out=[];
  seen[start]=1;
  while(stack.length){
    const i=stack.pop(),x=i%width,y=(i/width)|0;
    if(values[i]!==target)continue;
    out.push(i);
    if(x>0){const n=i-1;if(!seen[n]){seen[n]=1;stack.push(n);}}
    if(x+1<width){const n=i+1;if(!seen[n]){seen[n]=1;stack.push(n);}}
    if(y>0){const n=i-width;if(!seen[n]){seen[n]=1;stack.push(n);}}
    if(y+1<height){const n=i+width;if(!seen[n]){seen[n]=1;stack.push(n);}}
  }
  return out;
}
function floodFillPoints(values,width,height,startX,startY,newValue,{hatched=false,hatchPhase=0}={}){
  let points=floodFillIndices(values,width,height,startX,startY,newValue).map(i=>[i%width,(i/width)|0]);
  return hatched?hatchPoints(points,hatchPhase):points;
}

const api={
  TOOL_ALIASES,inBounds,normaliseTool,isPrimitiveTool,toolPoints,applyBrush,paintPoints,clipPoints,writePoints,paintRaster,
  getMaskPixel,setMaskPixel,getSurfaceCell,setSurfaceCell,
  linePoints,rectanglePoints,ellipsePoints,filledRectanglePoints,filledEllipsePoints,curvePoints,polylinePoints,pointDistance,nearPoint,
  brushOffsets,expandPointsWithBrush,hatchPoints,floodFillIndices,floodFillPoints
};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.IndyHeatLayerTools=api;
})(typeof globalThis!=='undefined'?globalThis:this);
