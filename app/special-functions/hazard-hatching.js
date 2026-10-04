(function(root){
'use strict';

/* Hazard Hatching Special Function.
 *
 * Procedural yellow/black hazard stripes for barrier tops, corners and other
 * trackside warning areas. The supplied hazard-hatching IHBR uses the same
 * four principal palette indices reproduced here:
 *
 *   upper/highlight edge: 23 yellow / 4 grey
 *   lower/main face:      21 yellow / 1 black
 *
 * The normal artist Brush Size controls Pencil/Line/Curve and outline shape
 * thickness. Fixed keeps one screen-space stripe angle. Follow makes path-tool
 * stripes use the same angle relative to the local path tangent, so they bend
 * naturally around curves.
 */
const S=root.IndyHeatSpecialFunctions;if(!S?.register)return;

const VERSION='1.002';
const STRIPE_WIDTH=1;
const YELLOW_LIGHT=23;
const YELLOW_DARK=21;
const GREY_LIGHT=4;
const BLACK=1;

const settings={angle:45,directionMode:'fixed'};
const DIRECTION_OPTIONS=Object.freeze([
  Object.freeze({value:'fixed',label:'Fixed'}),
  Object.freeze({value:'follow',label:'Follow'})
]);

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function inBounds(ctx,x,y){return x>=0&&y>=0&&x<ctx.width&&y<ctx.height;}
function setMask(mask,w,h,x,y){x=Math.round(x);y=Math.round(y);if(x>=0&&y>=0&&x<w&&y<h)mask[y*w+x]=1;}
function brushSize(ctx){
  const tool=ctx.toolState||{},raw=tool.brushSize??tool.size??1;
  return clamp(Math.round(Number(raw)||1),1,48);
}
function point(p){
  if(!p||!Number.isFinite(Number(p.x))||!Number.isFinite(Number(p.y)))return null;
  return {x:Number(p.x),y:Number(p.y)};
}
function uniquePoints(raw){
  const out=[];let last=null;
  for(const q of raw||[]){const p=point(q);if(!p)continue;if(!last||Math.abs(p.x-last.x)>.001||Math.abs(p.y-last.y)>.001){out.push(p);last=p;}}
  return out;
}
function rawPathPoints(g){
  const pts=uniquePoints(g?.points);
  if(pts.length)return pts;
  const a=point(g?.start),b=point(g?.end);return a&&b?[a,b]:a?[a]:[];
}
function densePathPoints(g){
  const src=rawPathPoints(g);if(src.length<2)return src;
  const out=[src[0]];
  for(let i=1;i<src.length;i++){
    const a=src[i-1],b=src[i],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),steps=Math.max(1,Math.ceil(len));
    for(let s=1;s<=steps;s++){const t=s/steps;out.push({x:a.x+dx*t,y:a.y+dy*t});}
  }
  return out;
}
function stampSquare(mask,w,h,cx,cy,size){
  const n=Math.max(1,Math.round(size)),origin=Math.floor((n-1)/2);
  for(let by=0;by<n;by++)for(let bx=0;bx<n;bx++)setMask(mask,w,h,Math.round(cx)-origin+bx,Math.round(cy)-origin+by);
}
function pathMask(ctx,g){
  const mask=new Uint8Array(ctx.width*ctx.height),n=brushSize(ctx),pts=densePathPoints(g);
  for(const p of pts)stampSquare(mask,ctx.width,ctx.height,p.x,p.y,n);
  return mask;
}
function bounds(g){
  const a=point(g?.start),b=point(g?.end);if(!a||!b)return null;
  return {x0:Math.min(a.x,b.x),x1:Math.max(a.x,b.x),y0:Math.min(a.y,b.y),y1:Math.max(a.y,b.y)};
}
function rectangleMask(ctx,g,filled){
  const q=bounds(g),mask=new Uint8Array(ctx.width*ctx.height);if(!q)return mask;
  const x0=Math.round(q.x0),x1=Math.round(q.x1),y0=Math.round(q.y0),y1=Math.round(q.y1);
  if(filled){for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)setMask(mask,ctx.width,ctx.height,x,y);return mask;}
  const n=brushSize(ctx);
  for(let x=x0;x<=x1;x++){stampSquare(mask,ctx.width,ctx.height,x,y0,n);stampSquare(mask,ctx.width,ctx.height,x,y1,n);}
  for(let y=y0;y<=y1;y++){stampSquare(mask,ctx.width,ctx.height,x0,y,n);stampSquare(mask,ctx.width,ctx.height,x1,y,n);}
  return mask;
}
function ellipseMask(ctx,g,filled){
  const q=bounds(g),mask=new Uint8Array(ctx.width*ctx.height);if(!q)return mask;
  const cx=(q.x0+q.x1)/2,cy=(q.y0+q.y1)/2,rx=Math.max(.5,(q.x1-q.x0)/2),ry=Math.max(.5,(q.y1-q.y0)/2);
  if(filled){
    const x0=Math.floor(q.x0),x1=Math.ceil(q.x1),y0=Math.floor(q.y0),y1=Math.ceil(q.y1);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const dx=(x-cx)/rx,dy=(y-cy)/ry;if(dx*dx+dy*dy<=1.0001)setMask(mask,ctx.width,ctx.height,x,y);}
    return mask;
  }
  const n=brushSize(ctx),circ=Math.max(12,Math.ceil(Math.PI*(3*(rx+ry)-Math.sqrt(Math.max(0,(3*rx+ry)*(rx+3*ry))))*2));
  for(let i=0;i<circ;i++){const a=i*Math.PI*2/circ;stampSquare(mask,ctx.width,ctx.height,cx+Math.cos(a)*rx,cy+Math.sin(a)*ry,n);}
  return mask;
}
function pointsMask(ctx,points){const mask=new Uint8Array(ctx.width*ctx.height);for(const p of points||[])setMask(mask,ctx.width,ctx.height,p?.x,p?.y);return mask;}
function areaMask(ctx){
  const g=ctx.geometry;if(!g)return null;
  if(g.tool==='freehand'||g.tool==='line'||g.tool==='curve')return pathMask(ctx,g);
  if(g.tool==='rectangle')return rectangleMask(ctx,g,false);
  if(g.tool==='rectangle-filled')return rectangleMask(ctx,g,true);
  if(g.tool==='ellipse')return ellipseMask(ctx,g,false);
  if(g.tool==='ellipse-filled')return ellipseMask(ctx,g,true);
  if(g.tool==='fill')return pointsMask(ctx,g.points);
  return null;
}
function countMask(mask){let n=0;for(const v of mask||[])if(v)n++;return n;}
function upperEdgeMask(mask,w,h){
  const edge=new Uint8Array(mask.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(mask[i]&&(y===0||!mask[i-w]))edge[i]=1;}
  return edge;
}
function pathSegments(g){
  const pts=densePathPoints(g),segments=[];let along=0;
  for(let i=1;i<pts.length;i++){
    const a=pts[i-1],b=pts[i],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<1e-6)continue;
    segments.push({a,b,dx,dy,len,ux:dx/len,uy:dy/len,start:along});along+=len;
  }
  return {segments,total:along};
}
function nearestPathFrame(built,x,y){
  let best=null,bestD2=Infinity;
  for(const s of built.segments){
    const vx=x-s.a.x,vy=y-s.a.y,raw=(vx*s.dx+vy*s.dy)/(s.len*s.len),t=clamp(raw,0,1),px=s.a.x+s.dx*t,py=s.a.y+s.dy*t,rx=x-px,ry=y-py,d2=rx*rx+ry*ry;
    if(d2>=bestD2)continue;
    const nx=-s.uy,ny=s.ux;
    bestD2=d2;best={along:s.start+s.len*t,lateral:rx*nx+ry*ny};
  }
  return best;
}
function positiveParity(n){n=Math.floor(n);return ((n%2)+2)%2;}
function stripeProjection(angle){
  const a=clamp(Number(angle)||0,0,90)*Math.PI/180,nx=-Math.sin(a),ny=Math.cos(a);
  /* Raster-normalise the stripe normal by its dominant component rather than
   * Euclidean length. At 45 degrees this gives (-1,+1), so every diagonal
   * band advances by one screen pixel instead of lingering for two pixels
   * because each axis only contributed ~0.707 to the old phase. */
  const gridScale=Math.max(Math.abs(nx),Math.abs(ny),1e-9);
  return {nx:nx/gridScale,ny:ny/gridScale};
}
function fixedStripeFamily(x,y){
  const n=stripeProjection(settings.angle),phase=(n.nx*x+n.ny*y)/STRIPE_WIDTH;
  return positiveParity(phase)===0?'yellow':'dark';
}
function followStripeFamily(built,x,y){
  const q=nearestPathFrame(built,x,y);if(!q)return fixedStripeFamily(x,y);
  const n=stripeProjection(settings.angle),phase=(n.nx*q.along+n.ny*q.lateral)/STRIPE_WIDTH;
  return positiveParity(phase)===0?'yellow':'dark';
}
function isPathTool(tool){return tool==='freehand'||tool==='line'||tool==='curve';}
function paintHatching(ctx,pixels,mask){
  const edge=upperEdgeMask(mask,ctx.width,ctx.height),follow=settings.directionMode==='follow'&&isPathTool(ctx.geometry?.tool),built=follow?pathSegments(ctx.geometry):null;
  let painted=0,highlighted=0;
  for(let y=0;y<ctx.height;y++)for(let x=0;x<ctx.width;x++){
    const i=y*ctx.width+x;if(!mask[i])continue;
    const family=follow?followStripeFamily(built,x,y):fixedStripeFamily(x,y),light=edge[i]===1;
    pixels[i]=family==='yellow'?(light?YELLOW_LIGHT:YELLOW_DARK):(light?GREY_LIGHT:BLACK);
    painted++;if(light)highlighted++;
  }
  return {painted,highlighted,follow};
}
function render(ctx){
  const mask=areaMask(ctx),count=countMask(mask);if(!mask||!count)return {message:'Hazard Hatching: draw with Pencil, Line, Curve, Rectangle, Ellipse or Fill.'};
  const pixels=ctx.layer('backdrop'),result=paintHatching(ctx,pixels,mask);
  return {message:`Hazard Hatching committed · ${result.painted}px · ${settings.angle}° · ${result.follow?'Follow':'Fixed'}${isPathTool(ctx.geometry?.tool)?` · brush ${brushSize(ctx)}px`:''} · ${result.highlighted}px upper-edge highlight.`};
}

function ensureToggleStyle(){
  if(typeof document==='undefined'||document.getElementById('indyheatHazardHatchingToggleStyle'))return;
  const style=document.createElement('style');style.id='indyheatHazardHatchingToggleStyle';
  style.textContent=`.hazardHatchingToggle{display:inline-flex;gap:3px;justify-content:flex-end;flex-wrap:wrap}.hazardHatchingToggle button{padding:2px 7px;min-height:22px;font-size:10px}.hazardHatchingToggle button[aria-pressed="true"]{border-color:#d6b54a;background:#40391f;box-shadow:inset 0 0 0 1px #8f792f}`;
  document.head.appendChild(style);
}
function toggleButtons(container,ctx,{label,value,options,onChange}){
  if(typeof document==='undefined'||!container?.appendChild){ctx.ui.select(container,{label,value,options,onChange});return;}
  ensureToggleStyle();
  const row=document.createElement('div');row.className='specialControlRow';
  const name=document.createElement('span');name.textContent=label;
  const wrap=document.createElement('span');wrap.className='hazardHatchingToggle';
  const buttons=[];
  const refresh=()=>{for(const [button,item] of buttons)button.setAttribute('aria-pressed',String(item.value===value));};
  for(const item of options){
    const button=document.createElement('button');button.type='button';button.textContent=item.label;
    button.addEventListener('click',()=>{value=item.value;onChange?.(value);refresh();ctx.refreshPreview?.();});
    buttons.push([button,item]);wrap.appendChild(button);
  }
  refresh();row.append(name,wrap);container.appendChild(row);
}
function mountControls(container,ctx){
  ctx.ui.slider(container,{label:'Stripe angle',min:0,max:90,step:5,value:settings.angle,onInput:v=>{settings.angle=v;}});
  toggleButtons(container,ctx,{label:'Direction',value:settings.directionMode,options:DIRECTION_OPTIONS,onChange:v=>{settings.directionMode=v;}});
}

S.register({
  id:'hazard-hatching',
  name:'Hazard Hatching',
  version:VERSION,
  category:'Track',
  status:'prototype',
  description:'Paint yellow/black hazard hatching with a light upper edge, 0–90° stripe angle, Fixed or path-following direction and normal artist Brush Size thickness.',
  supportedModes:['backdrop'],
  supportedTools:['freehand','line','curve','rectangle','rectangle-filled','ellipse','ellipse-filled','fill'],
  layers:['backdrop'],
  mountControls,
  preview:render,
  apply:render
});

})(typeof globalThis!=='undefined'?globalThis:this);
