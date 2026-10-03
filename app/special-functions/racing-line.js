(function(root){
'use strict';

/* Racing Line Special Function.
 *
 * The supplied Michigan reference is a sparse tyre-wear band rather than a
 * solid painted stroke. The original IHBR sample is six pixels wide through
 * its normal straight sections: the centre is busiest, density falls towards
 * the edges, and the mark darkens whatever Backdrop colour is already there.
 *
 * Line/Curve geometry is solved as one nearest-route field so bends do not
 * accumulate repeated stamps or become artificially darker at joins.
 */
const S=root.IndyHeatSpecialFunctions;if(!S?.register)return;
const VERSION='0.1.3';
const settings={width:6};

const DARKEN_MAP=Object.freeze({
  0:5,1:1,2:6,3:7,
  4:1,5:4,6:5,7:6,
  8:4,9:20,10:9,11:23,
  12:4,13:12,14:12,15:14,
  16:15,17:16,18:30,19:10,
  20:8,21:22,22:20,23:21,
  24:4,25:24,26:25,27:26,
  28:4,29:28,30:29,31:30
});

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function mix32(value){
  let x=Number(value)>>>0;
  x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;x=Math.imul(x,0x846ca68b);x^=x>>>16;
  return x>>>0;
}
function noise01(a,b,c){
  return mix32(Math.imul((a|0)^0x51ed270b,0x9e3779b1)^Math.imul((b|0)^0x68bc21eb,0x85ebca6b)^Math.imul((c|0)^0x02e5be93,0xc2b2ae35))/4294967296;
}
function uniquePoints(raw){
  const points=[];
  for(const p of raw||[]){
    const q={x:Number(p.x),y:Number(p.y)},last=points[points.length-1];
    if(!Number.isFinite(q.x)||!Number.isFinite(q.y))continue;
    if(!last||Math.abs(q.x-last.x)>.0001||Math.abs(q.y-last.y)>.0001)points.push(q);
  }
  return points;
}
function simplifyPoints(points,epsilon=.55){
  if(points.length<3)return points;
  const keep=new Uint8Array(points.length);keep[0]=1;keep[points.length-1]=1;const e2=epsilon*epsilon,stack=[[0,points.length-1]];
  while(stack.length){
    const [aIndex,bIndex]=stack.pop(),a=points[aIndex],b=points[bIndex],dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;let best=-1,bestD2=e2;
    for(let i=aIndex+1;i<bIndex;i++){
      const p=points[i];let t=len2?((p.x-a.x)*dx+(p.y-a.y)*dy)/len2:0;t=clamp(t,0,1);
      const ox=p.x-(a.x+dx*t),oy=p.y-(a.y+dy*t),d2=ox*ox+oy*oy;
      if(d2>bestD2){bestD2=d2;best=i;}
    }
    if(best>=0){keep[best]=1;stack.push([aIndex,best],[best,bIndex]);}
  }
  return points.filter((_p,i)=>keep[i]);
}
function routePoints(geometry){
  if(geometry.tool==='line'&&geometry.start&&geometry.end)return uniquePoints([geometry.start,geometry.end]);
  return simplifyPoints(uniquePoints(geometry.points));
}
function buildSegments(points){
  const segments=[];let cumulative=0;
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    if(len<.0001)continue;
    segments.push({a,b,dx,dy,len,len2:len*len,start:cumulative});cumulative+=len;
  }
  return {segments,totalLength:cumulative};
}
function routeSamples(ctx,points,half){
  const built=buildSegments(points),segments=built.segments;if(!segments.length)return [];
  const count=ctx.width*ctx.height,bestD2=new Float32Array(count),along=new Float32Array(count),touched=[];bestD2.fill(Infinity);
  const margin=half+1.5,radius2=(half+.46)*(half+.46);
  for(const seg of segments){
    const minX=Math.max(0,Math.floor(Math.min(seg.a.x,seg.b.x)-margin)),maxX=Math.min(ctx.width-1,Math.ceil(Math.max(seg.a.x,seg.b.x)+margin));
    const minY=Math.max(0,Math.floor(Math.min(seg.a.y,seg.b.y)-margin)),maxY=Math.min(ctx.height-1,Math.ceil(Math.max(seg.a.y,seg.b.y)+margin));
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
      let t=((x-seg.a.x)*seg.dx+(y-seg.a.y)*seg.dy)/seg.len2;t=clamp(t,0,1);
      const qx=seg.a.x+seg.dx*t,qy=seg.a.y+seg.dy*t,ox=x-qx,oy=y-qy,d2=ox*ox+oy*oy;
      if(d2>radius2)continue;
      const index=y*ctx.width+x;if(d2>=bestD2[index])continue;
      if(bestD2[index]===Infinity)touched.push(index);
      bestD2[index]=d2;along[index]=seg.start+t*seg.len;
    }
  }
  return touched.map(index=>({index,x:index%ctx.width,y:(index/ctx.width)|0,distance:Math.sqrt(bestD2[index]),along:along[index]}));
}
function markProbability(sample,half){
  const edge=Math.max(.001,half+.48),normalised=clamp(sample.distance/edge,0,1);
  /* Keep the centre visibly tyre-worn without letting neighbouring pixels lock
     together into broad clumps. A narrow centre-only boost restores a few extra
     core pixels without materially increasing the mid-band or edge density. Most
     variation remains per pixel; the outer edge keeps its isolated one-off flecks. */
  const centre=Math.max(0,1-normalised);
  const profile=.42*Math.pow(centre,.92)+.055*Math.pow(centre,4.2)+.085*Math.pow(normalised,2.4);
  const fine=noise01(sample.x,sample.y,0x4c494e45);
  const along=noise01(Math.floor(sample.along*1.8),Math.floor(sample.distance*3),0x52414345);
  return fine*.92+along*.08<profile;
}
function darkenIndex(ctx,index){
  index=ctx.helpers.validIndex(index);
  if(Object.prototype.hasOwnProperty.call(DARKEN_MAP,index))return ctx.helpers.validIndex(DARKEN_MAP[index]);
  if(typeof ctx.paletteRgb!=='function')return index;
  const source=ctx.paletteRgb(index);if(!Array.isArray(source)||source.length<3)return index;
  const lum=rgb=>.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2],sourceL=lum(source),target=source.map(v=>Number(v)*.72);let best=index,bestD=Infinity;
  for(let candidate=0;candidate<Number(ctx.paletteSize||32);candidate++){
    const rgb=ctx.paletteRgb(candidate);if(!Array.isArray(rgb)||rgb.length<3||lum(rgb)>=sourceL-.01)continue;
    const dr=rgb[0]-target[0],dg=rgb[1]-target[1],db=rgb[2]-target[2],d=dr*dr+dg*dg+db*db;
    if(d<bestD){bestD=d;best=candidate;}
  }
  return ctx.helpers.validIndex(best);
}
function render(ctx){
  const pixels=ctx.layer('backdrop'),points=routePoints(ctx.geometry);if(points.length<2)return;
  const width=clamp(Math.round(Number(settings.width)||6),5,10),half=(width-1)/2,samples=routeSamples(ctx,points,half);if(!samples.length)return;
  let painted=0;
  for(const sample of samples){
    if(!markProbability(sample,half))continue;
    const next=darkenIndex(ctx,pixels[sample.index]);
    if(next===pixels[sample.index])continue;
    pixels[sample.index]=next;painted++;
  }
  return {message:`Racing Line committed · width ${width}px · ${painted} tyre-mark pixels.`};
}
function mountControls(container,ctx){
  ctx.ui.slider(container,{label:'Width',min:5,max:10,step:1,value:settings.width,onInput:v=>{settings.width=v;}});
}

S.register({
  id:'racing-line',
  name:'Racing Line',
  version:VERSION,
  category:'Track',
  status:'prototype',
  description:'Sketch a sparse tyre-wear racing line that darkens the existing track or marking colour beneath it.',
  supportedModes:['backdrop'],
  supportedTools:['line','curve'],
  layers:['backdrop'],
  mountControls,
  preview:render,
  apply:render
});

})(typeof globalThis!=='undefined'?globalThis:this);
