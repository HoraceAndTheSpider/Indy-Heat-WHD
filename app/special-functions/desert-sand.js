(function(root){
'use strict';

/* Desert / Sand Special Function — North California-style warm earth.
 * Procedural Backdrop artwork only; never modifies Surface or Foreground.
 * Uses the game's verified 32-colour palette, not approximate RGB colours.
 * Left click builds lighter, sun-baked earth; right click darkens it.
 */
const S=root.IndyHeatSpecialFunctions;if(!S?.register)return;

const VERSION='1.001';
const settings={
  style:'rough',
  tone:'medium',
  feather:3,
  heaviness:100,
  variation:55,
  pattern:0,
  edgeBlend:true,
  protectOther:false,
  scrubDensity:18
};
let generation=1;

// True Indy Heat RGB12 palette: 8=$954, 9=$F81, 10=$FA6,
// 11=$FFA, 19=$FCA, 20=$C74, 21=$CB2, 22=$C90, 2=$FDC.
// Ordered approximately from burnt earth to pale dry sand.
const EARTH_SHADES=Object.freeze([8,20,9,10,19,2]);
const EARTH_SET=new Set([2,8,9,10,11,19,20,21,22]);
const SCRUB_SHADES=Object.freeze([24,25,26,27]);
const OPTIONS_STYLE=Object.freeze([
  {value:'smooth',label:'Smooth'},
  {value:'rough',label:'Rough'},
  {value:'scrubbed',label:'Scrubbed / patchy'}
]);
const OPTIONS_TONE=Object.freeze([
  {value:'light',label:'Light'},
  {value:'medium',label:'Medium'},
  {value:'dark',label:'Dark'}
]);

function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
function mix32(value){
  let x=value>>>0;
  x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;
  x=Math.imul(x,0x846ca68b);x^=x>>>16;
  return x>>>0;
}
function hash(x,y,salt=0){
  return mix32(Math.imul((x+0x10001)|0,0x9e3779b1)^
    Math.imul((y+0x20003)|0,0x85ebca6b)^
    Math.imul((salt+1)|0,0xc2b2ae35));
}
function random(x,y,salt){return hash(x,y,salt)/4294967296;}
/* Match Track Gradients Pattern 1: ordered Bayer8 replaces the random
 * pixel-scale decisions as Pattern approaches 100. The existing Variation
 * slider continues to control tone contrast and density independently.
 */
const BAYER8=Object.freeze([
   0,32, 8,40, 2,34,10,42,
  48,16,56,24,50,18,58,26,
  12,44, 4,36,14,46, 6,38,
  60,28,52,20,62,30,54,22,
   3,35,11,43, 1,33, 9,41,
  51,19,59,27,49,17,57,25,
  15,47, 7,39,13,45, 5,37,
  63,31,55,23,61,29,53,21
]);
function ditherThreshold(x,y,salt){
  const blend=clamp(Number(settings.pattern)||0,0,100)/100;
  const randomValue=random(x,y,salt);
  if(blend===0)return randomValue;
  const ordered=(BAYER8[((y&7)<<3)|(x&7)]+.5)/64;
  return randomValue*(1-blend)+ordered*blend;
}
function noise(x,y,scale,salt){
  const gx=Math.floor(x/scale),gy=Math.floor(y/scale);
  let tx=x/scale-gx,ty=y/scale-gy;
  tx=tx*tx*(3-2*tx);ty=ty*ty*(3-2*ty);
  const a=random(gx,gy,salt),b=random(gx+1,gy,salt);
  const c=random(gx,gy+1,salt),d=random(gx+1,gy+1,salt);
  return (a+(b-a)*tx)*(1-ty)+(c+(d-c)*tx)*ty;
}
function finitePoint(p){
  const x=Number(p?.x),y=Number(p?.y);
  return Number.isFinite(x)&&Number.isFinite(y)?{x,y}:null;
}
function maskForGeometry(ctx){
  const w=ctx.width,h=ctx.height,mask=new Uint8Array(w*h);
  const g=ctx.geometry||{},tool=g.tool||'freehand';
  const mark=(x,y)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&x<w&&y>=0&&y<h)mask[y*w+x]=1;};
  const toolState=ctx.toolState||{};
  const r=clamp(Math.round(Number(toolState.brushSize??toolState.size??toolState.radius??1)||1),1,24);
  function disk(cx,cy,radius){
    const x0=Math.max(0,Math.floor(cx-radius)),x1=Math.min(w-1,Math.ceil(cx+radius));
    const y0=Math.max(0,Math.floor(cy-radius)),y1=Math.min(h-1,Math.ceil(cy+radius));
    const rr=(radius+.25)*(radius+.25);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      if((x-cx)*(x-cx)+(y-cy)*(y-cy)<=rr)mask[y*w+x]=1;
    }
  }
  if(tool==='fill'&&Array.isArray(g.points)){
    for(const p0 of g.points){const p=finitePoint(p0);if(p)mark(p.x,p.y);}
    return mask;
  }
  const a=finitePoint(g.start),b=finitePoint(g.end);
  if((tool==='rectangle-filled'||tool==='rectangle')&&a&&b){
    const x0=Math.max(0,Math.ceil(Math.min(a.x,b.x))),x1=Math.min(w-1,Math.floor(Math.max(a.x,b.x)));
    const y0=Math.max(0,Math.ceil(Math.min(a.y,b.y))),y1=Math.min(h-1,Math.floor(Math.max(a.y,b.y)));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)mask[y*w+x]=1;
    return mask;
  }
  if((tool==='ellipse-filled'||tool==='ellipse')&&a&&b){
    const x0=Math.max(0,Math.floor(Math.min(a.x,b.x))),x1=Math.min(w-1,Math.ceil(Math.max(a.x,b.x)));
    const y0=Math.max(0,Math.floor(Math.min(a.y,b.y))),y1=Math.min(h-1,Math.ceil(Math.max(a.y,b.y)));
    const cx=(a.x+b.x)/2,cy=(a.y+b.y)/2;
    const rx=Math.max(.5,(Math.abs(b.x-a.x)+1)/2),ry=Math.max(.5,(Math.abs(b.y-a.y)+1)/2);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const dx=(x-cx)/rx,dy=(y-cy)/ry;
      if(dx*dx+dy*dy<=1.0001)mask[y*w+x]=1;
    }
    return mask;
  }
  const raw=tool==='line'&&a&&b?[a,b]:Array.isArray(g.points)?g.points:(a&&b?[a,b]:(a?[a]:[]));
  let last=null;
  for(const p0 of raw){
    const p=finitePoint(p0);if(!p)continue;
    if(last){
      const dx=p.x-last.x,dy=p.y-last.y,steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)));
      for(let n=0;n<=steps;n++){const t=n/steps;disk(Math.round(last.x+dx*t),Math.round(last.y+dy*t),r);}
    }else disk(Math.round(p.x),Math.round(p.y),r);
    last=p;
  }
  return mask;
}

// Chebyshev inward distance transform: two O(width*height) sweeps,
// avoiding expensive per-pixel neighbourhood scans on Fill previews.
function edgeDistances(mask,w,h){
  const dist=new Uint8Array(w*h);dist.fill(100);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;if(!mask[i]){dist[i]=0;continue;}
    if(x===0||y===0||x===w-1||y===h-1){dist[i]=1;continue;}
    if(!mask[i-1]||!mask[i+1]||!mask[i-w]||!mask[i+w]||
       !mask[i-w-1]||!mask[i-w+1]||!mask[i+w-1]||!mask[i+w+1])dist[i]=1;
  }
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;if(!mask[i]||dist[i]===1)continue;
    if(x>0)dist[i]=Math.min(dist[i],dist[i-1]+1);
    if(y>0){dist[i]=Math.min(dist[i],dist[i-w]+1);
      if(x>0)dist[i]=Math.min(dist[i],dist[i-w-1]+1);
      if(x+1<w)dist[i]=Math.min(dist[i],dist[i-w+1]+1);
    }
  }
  for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){
    const i=y*w+x;if(!mask[i]||dist[i]===1)continue;
    if(x+1<w)dist[i]=Math.min(dist[i],dist[i+1]+1);
    if(y+1<h){dist[i]=Math.min(dist[i],dist[i+w]+1);
      if(x>0)dist[i]=Math.min(dist[i],dist[i+w-1]+1);
      if(x+1<w)dist[i]=Math.min(dist[i],dist[i+w+1]+1);
    }
  }
  return dist;
}
function rightClick(ctx){
  if(ctx.geometry?.secondary===true)return true;
  const candidates=[ctx.toolState?.mouseButton,ctx.toolState?.button,
    ctx.toolState?.pointerButton,ctx.geometry?.button,ctx.pointer?.button,ctx.mouseButton];
  for(const value of candidates){
    const v=String(value).toLowerCase();
    if(v==='2'||v==='right')return true;
    if(v==='0'||v==='1'||v==='left'||v==='default')return false;
  }
  return false;
}
function scrubIndex(x,y,density){
  if(density<=0)return -1;
  // Sparse, slightly offset clumps rather than evenly-spaced green noise.
  const cell=9,cx=Math.floor(x/cell),cy=Math.floor(y/cell);
  for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
    const gx=cx+ox,gy=cy+oy,key=hash(gx,gy,83);
    if((key%100)>=density)continue;
    const px=gx*cell+2+((key>>>8)%6),py=gy*cell+2+((key>>>13)%6);
    const dx=x-px,dy=y-py,r=1+((key>>>19)%3);
    if(dx*dx+dy*dy>r*r)continue;
    const fleck=hash(x,y,97);
    if((fleck&7)===0)return 8; // understated dry shadow under scrub
    return SCRUB_SHADES[(fleck>>>8)&3];
  }
  return -1;
}
function shadeIndex(x,y,src,isDark,seed){
  const toneRank=settings.tone==='light'?4:settings.tone==='dark'?2:3;
  const variation=clamp(Number(settings.variation)||0,0,100)/100;
  const broad=noise(x,y,11,33),medium=noise(x,y,5,61);
  const micro=ditherThreshold(x,y,seed+53);
  let desired=toneRank;
  const amplitude=settings.style==='smooth'?.60:settings.style==='rough'?1.35:1.05;
  const field=(broad-.5)*1.8+(medium-.5)*.75;
  if(field<-.26/Math.max(.2,variation*amplitude))desired--;
  if(field>.30/Math.max(.2,variation*amplitude))desired++;
  if(settings.style!=='smooth'&&variation>0){
    if(micro<variation*.10)desired--;
    else if(micro>1-variation*.07)desired++;
  }
  if(settings.style==='rough'&&variation>.35&&ditherThreshold(x,y,seed+137)<variation*.06){
    // Dry ochre pockets in the original North California colour family.
    return (hash(x,y,seed+138)&1)?21:22;
  }
  if(EARTH_SET.has(src)){
    const existing=EARTH_SHADES.indexOf(src);
    if(existing>=0){
      // A new click genuinely builds on the currently painted ground.
      // L = sun-bleached/raised, R = compacted darker earth.
      desired=isDark?Math.min(desired,existing-1):Math.max(desired,existing+1);
    }
  }else if(isDark)desired--;
  const maxRank=settings.tone==='light'?5:4;
  return EARTH_SHADES[clamp(desired,0,maxRank)];
}
function apply(ctx){
  const backdrop=ctx.layer('backdrop'),base=ctx.baseLayer('backdrop');
  const w=ctx.width,h=ctx.height,mask=maskForGeometry(ctx);
  if(!w||!h||!base||!backdrop)return {message:'Desert / Sand: no Backdrop layer available.'};
  const tool=ctx.geometry?.tool||'freehand';
  const isStroke=tool==='freehand'||tool==='line'||tool==='curve';
  const brushSize=clamp(Math.round(Number(ctx.toolState?.brushSize??ctx.toolState?.size??ctx.toolState?.radius??1)||1),1,24);
  const requestedFeather=clamp(Math.round(Number(settings.feather)||0),0,10);
  // A 1-pixel Pencil must still paint a continuous line. Feathering a stroke
  // cannot be wider than the stroke's available interior radius.
  const feather=isStroke?Math.min(requestedFeather,Math.max(0,brushSize-1)):requestedFeather;
  const distances=feather?edgeDistances(mask,w,h):null;
  const dark=rightClick(ctx),heaviness=clamp(Number(settings.heaviness)||0,0,100)/100;
  const variation=clamp(Number(settings.variation)||0,0,100);
  const generationSeed=Math.imul(generation,0x45d9f3b);
  let covered=0,painted=0,protectedPixels=0,scrubPixels=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;if(!mask[i])continue;
    covered++;
    const src=base[i];
    if(settings.protectOther&&!EARTH_SET.has(src)){protectedPixels++;continue;}
    let chance=heaviness;
    const d=distances?distances[i]:100;
    if(feather&&d<=feather){
      const inward=(d/(feather+1));
      chance*=settings.edgeBlend?inward:Math.sqrt(inward);
    }
    if(ditherThreshold(x,y,generationSeed+7)>chance)continue;
    let out=shadeIndex(x,y,src,dark,generationSeed);
    if(settings.style==='scrubbed'){
      const density=clamp(Math.round(Number(settings.scrubDensity)||0),0,100);
      const plant=scrubIndex(x,y,density);
      if(plant>=0){out=plant;scrubPixels++;}
    }
    // Index validity is enforced by the host on commit. Use only real game
    // palette indices; don't synthesise RGB values or write other layers.
    backdrop[i]=out;
    painted++;
  }
  if(ctx.phase==='apply')generation++;
  return {message:`Desert / Sand · ${settings.style} · ${settings.tone} · ${painted}/${covered} px${dark?' · darken':' · lighten'}${feather?` · feather ${feather}px`:''}${scrubPixels?` · scrub ${scrubPixels}px`:''}${protectedPixels?` · protected ${protectedPixels}px`:''}${variation===0?' · no variation':''}.`};
}
function mountControls(container,ctx){
  ctx.ui.select(container,{label:'Style',value:settings.style,options:OPTIONS_STYLE,onChange:v=>{settings.style=v;}});
  ctx.ui.select(container,{label:'Tone',value:settings.tone,options:OPTIONS_TONE,onChange:v=>{settings.tone=v;}});
  ctx.ui.slider(container,{label:'Feather distance',min:0,max:10,step:1,value:settings.feather,onInput:v=>{settings.feather=v;}});
  ctx.ui.slider(container,{label:'Heaviness',min:0,max:100,step:5,value:settings.heaviness,onInput:v=>{settings.heaviness=v;}});
  ctx.ui.slider(container,{label:'Variation',min:0,max:100,step:5,value:settings.variation,onInput:v=>{settings.variation=v;}});
  ctx.ui.slider(container,{label:'Pattern (Random → Pattern 1)',min:0,max:100,step:5,value:settings.pattern,onInput:v=>{settings.pattern=v;}});
  ctx.ui.checkbox(container,{label:'Blend edges',checked:settings.edgeBlend,onChange:v=>{settings.edgeBlend=v;}});
  ctx.ui.slider(container,{label:'Scrub density',min:0,max:60,step:5,value:settings.scrubDensity,onInput:v=>{settings.scrubDensity=v;}});
  ctx.ui.checkbox(container,{label:'Protect non-earth colours',checked:settings.protectOther,onChange:v=>{settings.protectOther=v;}});
}

S.register({
  id:'desert-sand',
  name:'Desert / Sand',
  version:VERSION,
  category:'Track',
  status:'prototype',
  description:'Warm North California orange/ochre terrain. Smooth, Rough or Scrubbed styles; light/medium/dark tones, feather and density controls. Left click lightens; right click darkens. Paints Backdrop only.',
  supportedModes:['backdrop'],
  supportedTools:['freehand','line','curve','fill','rectangle-filled','ellipse-filled'],
  layers:['backdrop'],
  mountControls,
  preview:apply,
  apply:apply
});

})(typeof globalThis!=='undefined'?globalThis:this);
