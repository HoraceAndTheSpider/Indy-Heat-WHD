(function(root){
'use strict';

function inBounds(x,y,w,h){
  return Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<w&&y<h;
}

function getMaskPixel(data,x,y,offset=0,width=320,height=256){
  if(!inBounds(x,y,width,height)) return null;
  const rowBytes=Math.ceil(width/8), index=offset+y*rowBytes+(x>>3), mask=0x80>>>(x&7);
  return (data[index]&mask)?1:0;
}

function setMaskPixel(data,x,y,value,offset=0,width=320,height=256){
  if(!inBounds(x,y,width,height)) return false;
  const rowBytes=Math.ceil(width/8), index=offset+y*rowBytes+(x>>3), mask=0x80>>>(x&7);
  if(value) data[index]|=mask;
  else data[index]&=(~mask)&0xff;
  return true;
}

function getSurfaceCell(data,x,y,offset=0,width=160,height=112){
  if(!inBounds(x,y,width,height)) return null;
  const rowBytes=Math.ceil(width/4), index=offset+y*rowBytes+(x>>2), shift=6-(x&3)*2;
  return (data[index]>>>shift)&3;
}

function setSurfaceCell(data,x,y,value,offset=0,width=160,height=112){
  if(!inBounds(x,y,width,height)) return false;
  value=Number(value)&3;
  const rowBytes=Math.ceil(width/4), index=offset+y*rowBytes+(x>>2), shift=6-(x&3)*2, mask=3<<shift;
  data[index]=(data[index]&((~mask)&0xff))|(value<<shift);
  return true;
}

function linePoints(x0,y0,x1,y1){
  x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);
  const points=[],dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1;
  let err=dx+dy;
  while(true){
    points.push([x0,y0]);
    if(x0===x1&&y0===y1) break;
    const e2=2*err;
    if(e2>=dy){err+=dy;x0+=sx;}
    if(e2<=dx){err+=dx;y0+=sy;}
  }
  return points;
}

function uniquePoints(points){
  const seen=new Set(),out=[];
  for(const [x,y] of points){
    const key=`${x},${y}`;
    if(seen.has(key))continue;
    seen.add(key);out.push([x,y]);
  }
  return out;
}

function rectanglePoints(x0,y0,x1,y1){
  const l=Math.min(x0,x1),r=Math.max(x0,x1),t=Math.min(y0,y1),b=Math.max(y0,y1);
  return uniquePoints([
    ...linePoints(l,t,r,t),...linePoints(r,t,r,b),
    ...linePoints(r,b,l,b),...linePoints(l,b,l,t)
  ]);
}

function ellipsePoints(x0,y0,x1,y1){
  const l=Math.min(x0,x1),r=Math.max(x0,x1),t=Math.min(y0,y1),b=Math.max(y0,y1);
  const cx=(l+r)/2,cy=(t+b)/2,rx=(r-l)/2,ry=(b-t)/2;
  if(rx===0&&ry===0)return [[Math.round(cx),Math.round(cy)]];
  if(rx===0)return linePoints(Math.round(cx),t,Math.round(cx),b);
  if(ry===0)return linePoints(l,Math.round(cy),r,Math.round(cy));
  const steps=Math.max(24,Math.ceil(Math.PI*2*Math.max(rx,ry)*2));
  const out=[];
  let prev=null;
  for(let i=0;i<=steps;i++){
    const a=i*Math.PI*2/steps,p=[Math.round(cx+Math.cos(a)*rx),Math.round(cy+Math.sin(a)*ry)];
    if(prev)out.push(...linePoints(prev[0],prev[1],p[0],p[1]));
    prev=p;
  }
  return uniquePoints(out);
}


function filledRectanglePoints(x0,y0,x1,y1){
  const l=Math.min(x0,x1),r=Math.max(x0,x1),t=Math.min(y0,y1),b=Math.max(y0,y1),out=[];
  for(let y=t;y<=b;y++)for(let x=l;x<=r;x++)out.push([x,y]);
  return out;
}

function filledEllipsePoints(x0,y0,x1,y1){
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

function brushOffsets(size=1,shape='square'){
  size=Math.max(1,Math.min(31,Math.round(Number(size)||1)));
  const c=(size-1)/2,out=[];
  if(shape==='circle'){
    const radius=Math.max(.5,(size-1)/2+.25),rr=radius*radius;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const dx=x-c,dy=y-c;if(dx*dx+dy*dy<=rr)out.push([x-Math.floor(c),y-Math.floor(c)]);
    }
  }else{
    const origin=Math.floor(c);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++)out.push([x-origin,y-origin]);
  }
  return out;
}

function expandPointsWithBrush(points,size=1,shape='square'){
  const offsets=brushOffsets(size,shape),out=[];
  for(const [x,y] of points)for(const [dx,dy] of offsets)out.push([x+dx,y+dy]);
  return uniquePoints(out);
}


function hatchPoints(points,phase=0){
  // Fixed 1-on / 1-off checker pattern in absolute pixel coordinates.
  // Brush size changes only the footprint; it never scales the hatch frequency.
  phase=(Number(phase)||0)&1;
  return uniquePoints(points).filter(([x,y])=>(((x+y)&1)===phase));
}

function floodFillIndices(values,width,height,startX,startY,newValue){
  if(!inBounds(startX,startY,width,height))return [];
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

const api={getMaskPixel,setMaskPixel,getSurfaceCell,setSurfaceCell,linePoints,rectanglePoints,ellipsePoints,filledRectanglePoints,filledEllipsePoints,brushOffsets,expandPointsWithBrush,hatchPoints,floodFillIndices};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.IndyHeatLayerTools=api;
})(typeof globalThis!=='undefined'?globalThis:this);
