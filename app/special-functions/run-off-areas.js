(function(root){
'use strict';

/* Run Off Areas Special Function.
 *
 * Procedural Backdrop + Surface authoring derived from the supplied Indy Heat
 * gravel/run-off brush references. The useful sand examples are sparse rather
 * than all-over dither: broad 19/10 sand fields, restrained 20/9 depth patches,
 * a narrow edge treatment, and only transition dithering.
 *
 * Existing sand-family pixels are treated relatively. Re-applying the function
 * to 19/10/9/20/8 pixels darkens the existing result in broad dune-like patches
 * instead of regenerating the same fixed light pattern.
 *
 * Surface classes follow the editor contract:
 *   2 = Slowdown A / Grass
 *   3 = Slowdown B / Gravel / Run-off
 */
const S=root.IndyHeatSpecialFunctions;if(!S?.register)return;

const VERSION='0.1.0';
const SLOWDOWN_A=2,SLOWDOWN_B=3;
const settings={style:'dune',dither:20,plantDensity:15,allSlowdownA:false,feather:0};
let generation=1;

const SAND_FAMILY=Object.freeze([8,9,10,19,20]);
const SAND_SET=new Set(SAND_FAMILY);
const PLANT_COLOURS=Object.freeze([24,25,26]);

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
  return mix32(0x52554e4f^Math.imul(generation,0x9e3779b1)^Math.imul((sx+1)>>>0,0x85ebca6b)^Math.imul((sy+1)>>>0,0xc2b2ae35)^Math.imul((ex+3)>>>0,0x27d4eb2f)^Math.imul((ey+5)>>>0,0x165667b1));
}
function choose(values,seed){return values[(seed>>>0)%values.length];}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function inBounds(x,y,w,h){return x>=0&&y>=0&&x<w&&y<h;}
function setMask(mask,w,h,x,y){x=Math.round(x);y=Math.round(y);if(inBounds(x,y,w,h))mask[y*w+x]=1;}

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
function countMask(mask){let n=0;for(const v of mask||[])n+=v?1:0;return n;}

function boundaryDistances(mask,w,h,insideRadius,outsideRadius){
  const n=w*h,inside=new Int16Array(n),outside=new Int16Array(n);inside.fill(-1);outside.fill(-1);
  const qi=[],qo=[],neighbours=[[1,0],[-1,0],[0,1],[0,-1]];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,on=mask[i]===1;let edge=false;
    for(const [dx,dy] of neighbours){
      const nx=x+dx,ny=y+dy;
      if(!inBounds(nx,ny,w,h)){if(on){edge=true;break;}continue;}
      if((mask[ny*w+nx]===1)!==on){edge=true;break;}
    }
    if(!edge)continue;
    if(on&&insideRadius>0){inside[i]=1;qi.push(i);}
    else if(!on&&outsideRadius>0){outside[i]=1;qo.push(i);}
  }
  function spread(queue,dist,radius,wantInside){
    let head=0;
    while(head<queue.length){
      const i=queue[head++],d=dist[i];if(d>=radius)continue;const x=i%w,y=(i/w)|0;
      for(const [dx,dy] of neighbours){
        const nx=x+dx,ny=y+dy;if(!inBounds(nx,ny,w,h))continue;const ni=ny*w+nx;
        if((mask[ni]===1)!==wantInside||dist[ni]>=0)continue;
        dist[ni]=d+1;queue.push(ni);
      }
    }
  }
  if(insideRadius>0)spread(qi,inside,insideRadius,true);
  if(outsideRadius>0)spread(qo,outside,outsideRadius,false);
  return {inside,outside};
}
function featherMask(mask,w,h,total,seed){
  total=clamp(Math.round(Number(total)||0),0,40);if(!total)return mask.slice();
  const inner=Math.floor(total/2),outer=Math.ceil(total/2),out=mask.slice(),d=boundaryDistances(mask,w,h,inner,outer);
  for(let i=0;i<out.length;i++){
    const x=i%w,y=(i/w)|0;
    if(mask[i]){
      const dist=d.inside[i];
      if(inner>0&&dist>0&&dist<=inner){const keep=.35+.65*(dist/(inner+1));out[i]=(hashAt(seed,x,y,31)/0xffffffff)<keep?1:0;}
    }else{
      const dist=d.outside[i];
      if(outer>0&&dist>0&&dist<=outer){const add=.65*((outer-dist+1)/(outer+1));out[i]=(hashAt(seed,x,y,37)/0xffffffff)<add?1:0;}
    }
  }
  return out;
}

function valueNoise(seed,x,y,scale=5){
  const gx=Math.floor(x/scale),gy=Math.floor(y/scale),fx=(x-gx*scale)/scale,fy=(y-gy*scale)/scale;
  const fade=t=>t*t*(3-2*t),lerp=(a,b,t)=>a+(b-a)*t,unit=(ix,iy)=>hashAt(seed,ix,iy,71)/0xffffffff;
  const tx=fade(fx),ty=fade(fy);
  return lerp(lerp(unit(gx,gy),unit(gx+1,gy),tx),lerp(unit(gx,gy+1),unit(gx+1,gy+1),tx),ty);
}

/* Warm sand progression used for repeat passes:
 * 19 light pink/cream -> 10 peach -> 20 brown -> 8 dark brown.
 * 9 is the orange transition accent and joins the brown step on darkening.
 */
function darkerSand(index,steps=1){
  index=Number(index);steps=Math.max(0,Math.round(Number(steps)||0));
  for(let n=0;n<steps;n++){
    if(index===19)index=10;
    else if(index===10||index===9)index=20;
    else if(index===20)index=8;
    else if(index===8)index=8;
    else break;
  }
  return index;
}
function transitionDitherChance(){
  const amount=clamp(Number(settings.dither)||0,0,100)/100;
  return .005+amount*.075;
}
function newSandColour(seed,x,y,style,edgeDist){
  const broad=valueNoise(seed^0x7286a531,x,y,style==='smooth'?26:style==='dark'?18:22);
  const secondary=valueNoise(seed^0x34c12f9d,x+7,y-5,11);
  const fine=hashAt(seed,x,y,83)/0xffffffff;
  const dither=transitionDitherChance();

  /* The supplied sparse references use a light rim/edge rather than a noisy
     checkerboard border. Keep the first two pixels mostly 19/10. */
  if(edgeDist===1){
    if(fine<.08)return 20;
    return fine<.68?19:10;
  }
  if(edgeDist===2){
    if(fine<.04)return 20;
    return fine<.38?19:10;
  }

  if(style==='smooth'){
    if(broad<.16)return 19;
    if(broad>.84)return 20;
    if((Math.abs(broad-.16)<.045||Math.abs(broad-.84)<.045)&&fine<dither*.45)return broad<.5?19:20;
    return 10;
  }

  if(style==='dark'){
    if(broad<.16)return 10;
    if(broad>.75)return 8;
    if(secondary>.78&&fine<.12)return 9;
    if((Math.abs(broad-.16)<.06||Math.abs(broad-.75)<.06)&&fine<dither)return choose([9,20],hashAt(seed,x,y,89));
    return 20;
  }

  /* Dune: a mostly 10/19 sand field, broad 20 patches, and only sparse
     transition dithering. This is intentionally between old Smooth and Light. */
  if(broad<.18)return 19;
  if(broad>.76){
    if(secondary>.62&&fine<.16)return 9;
    return 20;
  }
  if((Math.abs(broad-.18)<.065||Math.abs(broad-.76)<.07)&&fine<dither){
    return broad<.5?19:choose([9,20],hashAt(seed,x,y,91));
  }
  if(secondary>.84&&fine<dither*.7)return 9;
  return 10;
}
function relativeSandColour(seed,x,y,current,style,edgeDist){
  const broad=valueNoise(seed^0xa3d45127,x+3,y+5,style==='smooth'?28:style==='dark'?17:21);
  const fine=hashAt(seed,x,y,97)/0xffffffff;
  let steps=0;

  if(style==='smooth'){
    if(broad>.68)steps=1;
    if(broad>.94&&fine<.35)steps=2;
  }else if(style==='dark'){
    if(broad>.30)steps=1;
    if(broad>.73)steps=2;
  }else{
    if(broad>.49)steps=1;
    if(broad>.86&&fine<.48)steps=2;
  }

  /* Keep the very outside rim relatively lighter so repeated passes build
     internal dune depth rather than turning the whole boundary uniformly dark. */
  if(edgeDist===1&&steps>0&&fine<.62)steps--;
  else if(edgeDist===2&&steps>0&&fine<.34)steps--;

  return darkerSand(current,steps);
}

function paintPlants(ctx,pixels,trapMask,plantMask,seed){
  if(settings.style!=='dark'||settings.plantDensity<=0)return 0;
  const w=ctx.width,h=ctx.height,density=clamp(Number(settings.plantDensity)||0,0,100);
  const threshold=Math.floor((density*.00018)*0x100000000)>>>0;let plants=0;
  for(let y=1;y<h;y++)for(let x=0;x<w-1;x++){
    const i=y*w+x;if(!trapMask[i]||hashAt(seed,x,y,61)>=threshold)continue;
    const points=[[x,y,24],[x,y-1,25],[x+1,y-1,26]];let wrote=false;
    for(const [px,py,c] of points){const pi=py*w+px;if(!trapMask[pi])continue;pixels[pi]=c;plantMask[pi]=1;wrote=true;}
    if(wrote)plants++;
  }
  return plants;
}
function paintSurface(ctx,surface,trapMask,plantMask){
  const info=ctx.layerInfo('surface'),helper=ctx.helpersFor('surface'),cellClass=new Uint8Array(info.width*info.height),touched=new Uint8Array(info.width*info.height);
  for(let y=0;y<ctx.height;y++)for(let x=0;x<ctx.width;x++){
    const i=y*ctx.width+x;if(!trapMask[i])continue;const p=helper.screenToLayer(x,y);if(!p)continue;const si=p.y*info.width+p.x;touched[si]=1;
    const value=settings.allSlowdownA||plantMask[i]?SLOWDOWN_A:SLOWDOWN_B;
    if(value===SLOWDOWN_A||cellClass[si]!==SLOWDOWN_A)cellClass[si]=value;
  }
  let cells=0,a=0,b=0;
  for(let i=0;i<touched.length;i++)if(touched[i]){
    surface[i]=cellClass[i]||SLOWDOWN_B;cells++;
    if(surface[i]===SLOWDOWN_A)a++;
    else if(surface[i]===SLOWDOWN_B)b++;
  }
  return {cells,a,b};
}
function render(ctx){
  const sourceMask=areaMask(ctx);if(!sourceMask||countMask(sourceMask)<1)return {message:'Run Off Areas: select an area.'};
  const seed=seedForGeometry(ctx.geometry),trapMask=featherMask(sourceMask,ctx.width,ctx.height,settings.feather,seed);
  const backdrop=ctx.layer('backdrop'),base=ctx.baseLayer('backdrop'),surface=ctx.layer('surface'),plantMask=new Uint8Array(ctx.width*ctx.height);
  const edge=boundaryDistances(trapMask,ctx.width,ctx.height,4,0).inside;
  let painted=0,relative=0;

  for(let y=0;y<ctx.height;y++)for(let x=0;x<ctx.width;x++){
    const i=y*ctx.width+x;if(!trapMask[i])continue;
    const old=base[i],edgeDist=edge[i]>0?edge[i]:5;
    if(SAND_SET.has(old)){backdrop[i]=relativeSandColour(seed,x,y,old,settings.style,edgeDist);relative++;}
    else backdrop[i]=newSandColour(seed,x,y,settings.style,edgeDist);
    painted++;
  }

  const plants=paintPlants(ctx,backdrop,trapMask,plantMask,seed),s=paintSurface(ctx,surface,trapMask,plantMask);
  if(ctx.phase==='apply')generation++;
  const styleLabel=settings.style==='dark'?'Dark':settings.style==='smooth'?'Smooth':'Dune';
  return {message:`Run Off Area committed · ${styleLabel} · ${painted} px${relative?` · ${relative} relative sand px`:''} · Surface A ${s.a} / B ${s.b}${plants?` · ${plants} plant clusters`:''}.`};
}
function mountControls(container,ctx){
  ctx.ui.select(container,{label:'Style',value:settings.style,options:[
    {value:'smooth',label:'Smooth'},
    {value:'dune',label:'Dune'},
    {value:'dark',label:'Dark'}
  ],onChange:value=>{settings.style=value;}});
  ctx.ui.slider(container,{label:'Dither',min:0,max:100,step:1,value:settings.dither,onInput:value=>{settings.dither=value;}});
  ctx.ui.slider(container,{label:'Plant density',min:0,max:100,step:1,value:settings.plantDensity,onInput:value=>{settings.plantDensity=value;}});
  ctx.ui.checkbox(container,{label:'All Slowdown A',checked:settings.allSlowdownA,onChange:value=>{settings.allSlowdownA=value;}});
  ctx.ui.slider(container,{label:'Feather',min:0,max:40,step:1,value:settings.feather,onInput:value=>{settings.feather=value;}});
}

S.register({
  id:'run-off-areas',
  name:'Run Off Areas',
  version:VERSION,
  category:'Track',
  status:'prototype',
  description:'Procedural sand/run-off areas with broad dune shading, restrained transition dithering, relative darkening on repeat passes, Surface slowdown classes and optional plants.',
  supportedModes:['backdrop'],
  supportedTools:['freehand','line','curve','rectangle','rectangle-filled','ellipse','ellipse-filled','freeform','fill'],
  layers:['backdrop','surface'],
  mountControls,
  preview:render,
  apply:render
});

})(typeof globalThis!=='undefined'?globalThis:this);
