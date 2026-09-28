(function(root){
'use strict';

/* Rough Track Special Function.
 *
 * The reference brushes show the intended construction as two stages:
 *   1. lay one continuous index-0 road ribbon;
 *   2. overlay the directional edge treatment (4 -> 5 -> 0 outside,
 *      0 -> 6 inside), optionally followed by marker lines.
 *
 * The route is solved as one signed-distance field. Each destination pixel is
 * classified once against its nearest position on the complete route, so bends
 * do not accumulate repeated cross-track stamps or seams.
 */
const S=root.IndyHeatSpecialFunctions;if(!S?.register)return;
const settings={
  width:32,
  darkBorder:5,
  gradientWidth:8,
  randomness:100,
  markerLines:false,
  markerColour:30
};

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function noise01(x,y,salt){
  let h=(Math.imul((x|0)^0x9e3779b9,0x85ebca6b)^Math.imul((y|0)^0xc2b2ae35,0x27d4eb2d)^(salt|0))|0;
  h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;
  return (h>>>0)/4294967296;
}
function ordered01(x,y,salt){
  const v=((Math.imul(x|0,17)+Math.imul(y|0,29)+(salt>>>3))&63);
  return (v+.5)/64;
}
function ditherThreshold(x,y,salt){
  const amount=clamp(Number(settings.randomness)||0,0,100)/100;
  const ordered=ordered01(x,y,salt),random=noise01(x,y,salt);
  return ordered+(random-ordered)*amount;
}
function ditherMix(a,b,mix,x,y,salt){
  mix=clamp(mix,0,1);if(mix<=0)return a;if(mix>=1)return b;
  return ditherThreshold(x,y,salt)<mix?b:a;
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
function simplifyPoints(points,epsilon=.65){
  if(points.length<3)return points;
  const keep=new Uint8Array(points.length);keep[0]=1;keep[points.length-1]=1;const e2=epsilon*epsilon,stack=[[0,points.length-1]];
  while(stack.length){
    const [aIndex,bIndex]=stack.pop(),a=points[aIndex],b=points[bIndex],dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;let best=-1,bestD2=e2;
    for(let i=aIndex+1;i<bIndex;i++){const p=points[i];let t=len2?((p.x-a.x)*dx+(p.y-a.y)*dy)/len2:0;t=clamp(t,0,1);const ox=p.x-(a.x+dx*t),oy=p.y-(a.y+dy*t),d2=ox*ox+oy*oy;if(d2>bestD2){bestD2=d2;best=i;}}
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
    segments.push({a,b,dx,dy,len,len2:len*len,start:cumulative,index:i});
    cumulative+=len;
  }
  /* A smoothed tangent is used only for the signed left/right classification.
   * Distance remains exact to the route polyline. This removes the alternating
   * horizontal/vertical normal produced by integer raster points on diagonals.
   */
  const radius=Math.max(2,Math.min(8,Math.round(points.length/28)));
  for(const seg of segments){
    const i=seg.index,i0=Math.max(0,i-radius),i1=Math.min(points.length-1,i+1+radius);
    let tx=points[i1].x-points[i0].x,ty=points[i1].y-points[i0].y,tlen=Math.hypot(tx,ty);
    if(tlen<.0001){tx=seg.dx;ty=seg.dy;tlen=seg.len;}
    seg.tx=tx/tlen;seg.ty=ty/tlen;
  }
  return {segments,totalLength:cumulative};
}
function trackSamples(ctx,points,half){
  const built=buildSegments(points),segments=built.segments;if(!segments.length)return {samples:[],totalLength:0};
  const count=ctx.width*ctx.height,bestD2=new Float32Array(count),signed=new Float32Array(count),along=new Float32Array(count),touched=[];
  bestD2.fill(Infinity);
  const margin=half+1.5,radius2=(half+.42)*(half+.42);

  /* Build one nearest-route field by visiting only the local ribbon-sized box
   * around each segment. A pixel can be considered many times, but only its
   * nearest route position survives; shading is therefore still applied once. */
  for(const seg of segments){
    const minX=Math.max(0,Math.floor(Math.min(seg.a.x,seg.b.x)-margin));
    const maxX=Math.min(ctx.width-1,Math.ceil(Math.max(seg.a.x,seg.b.x)+margin));
    const minY=Math.max(0,Math.floor(Math.min(seg.a.y,seg.b.y)-margin));
    const maxY=Math.min(ctx.height-1,Math.ceil(Math.max(seg.a.y,seg.b.y)+margin));
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
      let t=((x-seg.a.x)*seg.dx+(y-seg.a.y)*seg.dy)/seg.len2;t=clamp(t,0,1);
      const qx=seg.a.x+seg.dx*t,qy=seg.a.y+seg.dy*t,ox=x-qx,oy=y-qy,d2=ox*ox+oy*oy;
      if(d2>radius2)continue;
      const index=y*ctx.width+x;if(d2>=bestD2[index])continue;
      if(bestD2[index]===Infinity)touched.push(index);
      bestD2[index]=d2;
      signed[index]=ox*seg.ty+oy*(-seg.tx); // positive = screen-left / outside
      along[index]=seg.start+t*seg.len;
    }
  }
  const samples=new Array(touched.length);
  for(let i=0;i<touched.length;i++){
    const index=touched[i],x=index%ctx.width,y=(index/ctx.width)|0;
    samples[i]={index,x,y,signed:signed[index],along:along[index]};
  }
  return {samples,totalLength:built.totalLength};
}

function applyOutsideGradient(sample,half){
  const fromEdge=half-sample.signed;
  const dark=Math.max(0,Math.min(Number(settings.darkBorder)||0,half-1));
  const gradient=Math.max(0,Math.min(Number(settings.gradientWidth)||0,half-dark));
  if(fromEdge<0)return null;
  if(fromEdge<dark)return 4;
  if(gradient<=.001||fromEdge>=dark+gradient)return null;
  const t=(fromEdge-dark)/gradient;
  if(t<.5)return ditherMix(4,5,t*2,sample.x,sample.y,0x45a1);
  return ditherMix(5,0,(t-.5)*2,sample.x,sample.y,0x50b7);
}
function applyInsideGradient(sample,half,width){
  const fromEdge=half+sample.signed;if(fromEdge<0)return null;
  const solid=Math.max(1,Math.min(3,Math.round(width*.07)));
  const gradient=Math.max(0,Math.min(Number(settings.gradientWidth)||0,half-solid));
  if(fromEdge<solid)return 6;
  if(gradient<=.001||fromEdge>=solid+gradient)return null;
  return ditherMix(6,0,(fromEdge-solid)/gradient,sample.x,sample.y,0x60d3);
}
function isMarkerPixel(sample,half,totalLength){
  if(!settings.markerLines||totalLength<3)return false;
  if(sample.along<1||sample.along>totalLength-1)return false;
  const outside=half-sample.signed,inside=half+sample.signed;
  const inset=1.25,thickness=.9;
  return Math.abs(outside-inset)<=thickness/2||Math.abs(inside-inset)<=thickness/2;
}

function render(ctx){
  const pixels=ctx.layer('backdrop'),points=routePoints(ctx.geometry);if(!points.length)return;
  const width=Math.max(8,Math.round(settings.width)),half=(width-1)/2;
  if(points.length===1){ctx.helpers.paintDisc(pixels,points[0].x,points[0].y,Math.max(.5,half),0);return {message:'Rough Track committed.'};}

  const {samples,totalLength}=trackSamples(ctx,points,half);if(!samples.length)return;

  /* Pass 1: continuous route surface. */
  for(const sample of samples)pixels[sample.index]=0;

  /* Pass 2: edge treatment calculated once from the completed route field. */
  for(const sample of samples){
    const outside=applyOutsideGradient(sample,half);if(outside!=null){pixels[sample.index]=outside;continue;}
    const inside=applyInsideGradient(sample,half,width);if(inside!=null)pixels[sample.index]=inside;
  }

  /* Pass 3: optional one-pixel side markers, matching the reference brush's
   * inset red lines but using any snapped 32-colour palette index. */
  if(settings.markerLines){
    const marker=ctx.helpers.validIndex(settings.markerColour);
    for(const sample of samples)if(isMarkerPixel(sample,half,totalLength))pixels[sample.index]=marker;
  }
  return {message:'Rough Track committed.'};
}

function mountControls(container,ctx){
  ctx.ui.slider(container,{label:'Width',min:8,max:48,step:1,value:settings.width,onInput:v=>{settings.width=v;}});
  ctx.ui.slider(container,{label:'Dark border',min:0,max:12,step:1,value:settings.darkBorder,onInput:v=>{settings.darkBorder=v;}});
  ctx.ui.slider(container,{label:'Gradient width',min:1,max:16,step:1,value:settings.gradientWidth,onInput:v=>{settings.gradientWidth=v;}});
  ctx.ui.slider(container,{label:'Randomness',min:0,max:100,step:5,value:settings.randomness,onInput:v=>{settings.randomness=v;}});
  ctx.ui.checkbox(container,{label:'Inside/outside lines',checked:settings.markerLines,onChange:v=>{settings.markerLines=v;}});
  if(ctx.ui.paletteColour)ctx.ui.paletteColour(container,{label:'Line colour',value:settings.markerColour,onInput:v=>{settings.markerColour=v;}});
  else ctx.ui.paletteIndex(container,{label:'Line colour',value:settings.markerColour,onInput:v=>{settings.markerColour=v;}});
}

S.register({
  id:'rough-track',
  name:'Rough Track',
  version:'0.4.0',
  category:'Track',
  status:'prototype',
  description:'Continuous index-0 road ribbon with signed-distance directional edge gradients, adjustable randomisation and optional palette-snapped side marker lines.',
  supportedModes:['backdrop'],
  supportedTools:['line','curve'],
  layers:['backdrop'],
  mountControls,
  preview:render,
  apply:render
});

})(typeof globalThis!=='undefined'?globalThis:this);
