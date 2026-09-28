(function(root){
'use strict';

/* Water Special Function.
 *
 * Procedural water derived from the supplied Indy Heat water brush reference.
 * Light water is based on palette index 15 with 16/17 edge highlights.
 * Dark water is based on palette index 14 with the reference 12/15 edge family.
 *
 * Area tools shade the complete generated shoreline. Pencil/Line/Curve inherit
 * the existing Backdrop brush size; optional Single edge shades only the left
 * side of the ordered stroke, so reversing the drawing direction swaps sides.
 */
const S=root.IndyHeatSpecialFunctions;if(!S?.register)return;

const VERSION='0.1.0';
const settings={style:'light',edgeGradient:4,singleEdge:false};
let generation=1;

const LIGHT_BASE=15;
const DARK_BASE=14;
const LIGHT_EDGE=Object.freeze({mid:16,bright:17});
const DARK_EDGE=Object.freeze({dark:12,highlight:15});

function mix32(value){
  let x=Number(value)>>>0;
  x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;x=Math.imul(x,0x846ca68b);x^=x>>>16;
  return x>>>0;
}
function hashAt(seed,x,y,salt=0){
  return mix32((seed>>>0)^Math.imul((Math.round(x)+0x10001)>>>0,0x9e3779b1)^Math.imul((Math.round(y)+0x20003)>>>0,0x85ebca6b)^Math.imul((salt+1)>>>0,0xc2b2ae35));
}
function seedForGeometry(g){
  const sx=Math.round(g?.start?.x||0),sy=Math.round(g?.start?.y||0),ex=Math.round(g?.end?.x||sx),ey=Math.round(g?.end?.y||sy);
  return mix32(0x57415452^Math.imul(generation,0x9e3779b1)^Math.imul((sx+1)>>>0,0x85ebca6b)^Math.imul((sy+1)>>>0,0xc2b2ae35)^Math.imul((ex+3)>>>0,0x27d4eb2f)^Math.imul((ey+5)>>>0,0x165667b1));
}
function inBounds(x,y,w,h){return x>=0&&y>=0&&x<w&&y<h;}
function setMask(mask,w,h,x,y){x=Math.round(x);y=Math.round(y);if(inBounds(x,y,w,h))mask[y*w+x]=1;}
function countMask(mask){let n=0;for(const v of mask||[])n+=v?1:0;return n;}

function rectangleMask(ctx,start,end){
  const w=ctx.width,h=ctx.height,mask=new Uint8Array(w*h);
  const x0=Math.max(0,Math.min(Math.round(start.x),Math.round(end.x))),x1=Math.min(w-1,Math.max(Math.round(start.x),Math.round(end.x)));
  const y0=Math.max(0,Math.min(Math.round(start.y),Math.round(end.y))),y1=Math.min(h-1,Math.max(Math.round(start.y),Math.round(end.y)));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)mask[y*w+x]=1;
  return mask;
}
function ellipseMask(ctx,start,end){
  const w=ctx.width,h=ctx.height,mask=new Uint8Array(w*h);
  const x0=Math.max(0,Math.min(Math.round(start.x),Math.round(end.x))),x1=Math.min(w-1,Math.max(Math.round(start.x),Math.round(end.x)));
  const y0=Math.max(0,Math.min(Math.round(start.y),Math.round(end.y))),y1=Math.min(h-1,Math.max(Math.round(start.y),Math.round(end.y)));
  const cx=(x0+x1)/2,cy=(y0+y1)/2,rx=Math.max(.5,(x1-x0+1)/2),ry=Math.max(.5,(y1-y0+1)/2);
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const dx=(x-cx)/rx,dy=(y-cy)/ry;if(dx*dx+dy*dy<=1.0001)mask[y*w+x]=1;}
  return mask;
}
function pointInPolygon(x,y,vertices){
  let inside=false;
  for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
    const a=vertices[i],b=vertices[j];
    if(((a.y>y)!==(b.y>y))&&(x<(b.x-a.x)*(y-a.y)/((b.y-a.y)||1e-9)+a.x))inside=!inside;
  }
  return inside;
}
function polygonMask(ctx,vertices){
  const w=ctx.width,h=ctx.height,mask=new Uint8Array(w*h),v=(vertices||[]).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
  if(v.length<3)return mask;
  const x0=Math.max(0,Math.floor(Math.min(...v.map(p=>p.x)))),x1=Math.min(w-1,Math.ceil(Math.max(...v.map(p=>p.x))));
  const y0=Math.max(0,Math.floor(Math.min(...v.map(p=>p.y)))),y1=Math.min(h-1,Math.ceil(Math.max(...v.map(p=>p.y))));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(pointInPolygon(x+.5,y+.5,v))mask[y*w+x]=1;
  return mask;
}
function pointsMask(ctx,points){
  const mask=new Uint8Array(ctx.width*ctx.height);for(const p of points||[])setMask(mask,ctx.width,ctx.height,p.x,p.y);return mask;
}
function pathMask(ctx,points,size=1){
  const mask=new Uint8Array(ctx.width*ctx.height),n=Math.max(1,Math.round(Number(size)||1)),origin=Math.floor((n-1)/2);
  for(const p of points||[]){
    const ax=Math.round(Number(p?.x)),ay=Math.round(Number(p?.y));if(!Number.isFinite(ax)||!Number.isFinite(ay))continue;
    for(let by=0;by<n;by++)for(let bx=0;bx<n;bx++)setMask(mask,ctx.width,ctx.height,ax-origin+bx,ay-origin+by);
  }
  return mask;
}
function areaMask(ctx){
  const g=ctx.geometry;if(!g)return null;
  if(g.tool==='freehand'||g.tool==='line'||g.tool==='curve')return pathMask(ctx,g.points,ctx.toolState?.brushSize||1);
  if(g.tool==='fill')return pointsMask(ctx,g.points);
  if(g.tool==='freeform')return polygonMask(ctx,g.vertices);
  if(!g.start||!g.end)return null;
  if(g.tool==='rectangle'||g.tool==='rectangle-filled')return rectangleMask(ctx,g.start,g.end);
  if(g.tool==='ellipse'||g.tool==='ellipse-filled')return ellipseMask(ctx,g.start,g.end);
  return null;
}
function isPathTool(tool){return tool==='freehand'||tool==='line'||tool==='curve';}

function internalBoundary(mask,w,h){
  const boundary=new Uint8Array(w*h),neighbours=[[1,0],[-1,0],[0,1],[0,-1]];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;if(!mask[i])continue;
    for(const [dx,dy] of neighbours){const nx=x+dx,ny=y+dy;if(!inBounds(nx,ny,w,h))continue;if(!mask[ny*w+nx]){boundary[i]=1;break;}}
  }
  return boundary;
}
function nearestPathSide(points,x,y){
  if(!Array.isArray(points)||points.length<2)return {side:0,endCap:false,distance:Infinity};
  let best=Infinity,bestSide=0,bestEnd=false;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],ax=Number(a.x),ay=Number(a.y),bx=Number(b.x),by=Number(b.y),dx=bx-ax,dy=by-ay,len2=dx*dx+dy*dy;
    if(!Number.isFinite(len2)||len2<1e-9)continue;
    const raw=((x-ax)*dx+(y-ay)*dy)/len2,t=Math.max(0,Math.min(1,raw)),px=ax+t*dx,py=ay+t*dy,rx=x-px,ry=y-py,d2=rx*rx+ry*ry;
    if(d2>=best)continue;
    const cross=dx*(y-py)-dy*(x-px);
    best=d2;bestSide=cross>1e-7?1:cross<-1e-7?-1:0;
    bestEnd=(i===1&&raw<=0)||(i===points.length-1&&raw>=1);
  }
  return {side:bestSide,endCap:bestEnd,distance:Math.sqrt(best)};
}
function edgeSeeds(mask,w,h,geometry,singleEdge){
  const boundary=internalBoundary(mask,w,h);if(!singleEdge||!isPathTool(geometry?.tool))return boundary;
  const seeds=new Uint8Array(w*h),points=geometry?.points||[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;if(!boundary[i])continue;
    const q=nearestPathSide(points,x,y);
    // Canvas Y grows downwards. Positive cross is the visible right-hand side;
    // negative cross is visible left. Single-edge mode deliberately keeps left.
    if(q.side<0&&!q.endCap)seeds[i]=1;
  }
  return seeds;
}
function inwardDistances(mask,seeds,w,h,radius,geometry,singleEdge){
  const dist=new Int16Array(w*h);dist.fill(-1);if(radius<=0)return dist;
  const queue=[],neighbours=[[1,0],[-1,0],[0,1],[0,-1]];
  for(let i=0;i<seeds.length;i++)if(seeds[i]){dist[i]=1;queue.push(i);}
  let head=0;
  while(head<queue.length){const i=queue[head++],d=dist[i];if(d>=radius)continue;const x=i%w,y=(i/w)|0;
    for(const [dx,dy] of neighbours){const nx=x+dx,ny=y+dy;if(!inBounds(nx,ny,w,h))continue;const ni=ny*w+nx;if(!mask[ni]||dist[ni]>=0)continue;
      if(singleEdge&&isPathTool(geometry?.tool)){
        const q=nearestPathSide(geometry.points||[],nx,ny);if(q.side>0||q.endCap)continue;
      }
      dist[ni]=d+1;queue.push(ni);
    }
  }
  return dist;
}
function edgeColour(style,seed,x,y,d,width){
  if(width<=0||d<=0||d>width)return style==='dark'?DARK_BASE:LIGHT_BASE;
  const outer=1-(d-1)/Math.max(1,width),noise=(hashAt(seed,x,y,19)/0xffffffff-.5)*.22,q=Math.max(0,Math.min(1,outer+noise));
  if(style==='dark'){
    // Reference dark water has a dark rim (12), then a brighter 15 transition
    // before settling to the 14 base colour.
    if(d===1&&(hashAt(seed,x,y,23)/0xffffffff)<(.62+.28*Math.min(1,width/8)))return DARK_EDGE.dark;
    if(q>.34)return DARK_EDGE.highlight;
    return DARK_BASE;
  }
  if(q>.68)return LIGHT_EDGE.bright;
  if(q>.18)return LIGHT_EDGE.mid;
  return LIGHT_BASE;
}
function render(ctx){
  const sourceMask=areaMask(ctx);if(!sourceMask||countMask(sourceMask)<1)return {message:'Water: select or draw an area.'};
  const style=settings.style==='dark'?'dark':'light',base=style==='dark'?DARK_BASE:LIGHT_BASE,backdrop=ctx.layer('backdrop'),seed=seedForGeometry(ctx.geometry);
  const width=Math.max(0,Math.min(20,Math.round(Number(settings.edgeGradient)||0))),single=settings.singleEdge&&isPathTool(ctx.geometry?.tool);
  const seeds=edgeSeeds(sourceMask,ctx.width,ctx.height,ctx.geometry,single),dist=inwardDistances(sourceMask,seeds,ctx.width,ctx.height,width,ctx.geometry,single);
  let pixels=0,edgePixels=0;
  for(let y=0;y<ctx.height;y++)for(let x=0;x<ctx.width;x++){
    const i=y*ctx.width+x;if(!sourceMask[i])continue;let value=base;
    if(width>0&&dist[i]>0){value=edgeColour(style,seed,x,y,dist[i],width);if(value!==base)edgePixels++;}
    backdrop[i]=value;pixels++;
  }
  if(ctx.phase==='apply')generation++;
  const styleLabel=style==='dark'?'Dark':'Light',side=single?' · single left edge':'';
  return {message:`Water committed · ${styleLabel} · ${pixels} px · edge gradient ${width}px${side} · ${edgePixels} highlighted px.`};
}
function mountControls(container,ctx){
  ctx.ui.select(container,{label:'Base',value:settings.style,options:[{value:'light',label:'Light'},{value:'dark',label:'Dark'}],onChange:value=>{settings.style=value;}});
  ctx.ui.slider(container,{label:'Edge gradient',min:0,max:20,step:1,value:settings.edgeGradient,onInput:value=>{settings.edgeGradient=value;}});
  ctx.ui.checkbox(container,{label:'Single edge (Pencil/Line/Curve)',checked:settings.singleEdge,onChange:value=>{settings.singleEdge=value;}});
}

S.register({
  id:'water',
  name:'Water',
  version:VERSION,
  category:'Scenery',
  status:'prototype',
  description:'Procedural light/dark water with shoreline gradient following fills, shapes and brush-sized paths.',
  supportedModes:['backdrop'],
  supportedTools:['freehand','line','curve','rectangle','rectangle-filled','ellipse','ellipse-filled','freeform','fill'],
  layers:['backdrop'],
  mountControls,
  preview:render,
  apply:render
});

})(typeof globalThis!=='undefined'?globalThis:this);
