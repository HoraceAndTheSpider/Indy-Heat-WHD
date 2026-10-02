(function(root){
'use strict';

/* Grass Special Function.
 *
 * Brush-like grass painter for Pencil / Line / Curve plus filled Rectangle /
 * filled Ellipse. It is intentionally lighter-weight than a tile importer:
 * the plugin paints low-resolution Indy Heat grass using palette-aware dither,
 * feathering and optional soil-edge blending.
 *
 * Left click / default deepens grass. Right click lightens it.
 * Repainting onto existing grass increases heaviness, as if building a bump.
 */
const S=root.IndyHeatSpecialFunctions;if(!S?.register)return;

const VERSION='0.1.2';
const settings={
  style:'smooth',
  fillIntensity:'dark',
  feather:3,
  featherStrength:55,
  edgeMode:'soft',
  edgeDepth:2,
  soilBlend:true,
  dither:true,
  stripeWidth:6
};

const STYLE_OPTIONS=Object.freeze([
  Object.freeze({value:'smooth',label:'Smooth'}),
  Object.freeze({value:'rough',label:'Rough'}),
  Object.freeze({value:'mowed',label:'Mowed stripes'})
]);
const FILL_INTENSITY_OPTIONS=Object.freeze([
  Object.freeze({value:'bright',label:'Bright'}),
  Object.freeze({value:'medium',label:'Medium'}),
  Object.freeze({value:'dark',label:'Dark'})
]);
const EDGE_OPTIONS=Object.freeze([
  Object.freeze({value:'soft',label:'Soft grass edge'}),
  Object.freeze({value:'sharp',label:'Sharp earth edge'}),
  Object.freeze({value:'none',label:'No feather'})
]);

const GRASS=Object.freeze({dark:24,mid:25,light:26,bright:27});
const SOIL=Object.freeze({dark:8,mid:10,light:19,pale:2});
const TRACK_GREYS=new Set([4,5,6,7]);
const GRASS_SET=new Set([24,25,26,27]);
const SOIL_SET=new Set([2,8,9,10,19,20,21,22]);

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function validIndex(ctx,index){return typeof ctx.helpers?.validIndex==='function'?ctx.helpers.validIndex(index):clamp(Math.round(Number(index)||0),0,(ctx.paletteSize||32)-1);}
function inBounds(w,h,x,y){return x>=0&&y>=0&&x<w&&y<h;}
function hash(x,y,seed=0){
  let v=(Math.imul((x+0x9E37)>>>0,0x7feb352d)^Math.imul((y+0x85eb)>>>0,0x846ca68b)^Math.imul((seed+1)>>>0,0xc2b2ae35))>>>0;
  v^=v>>>15; v=Math.imul(v,0x2c1b3c6d); v^=v>>>12; return v>>>0;
}
function point(p){return p&&Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.y))?{x:Number(p.x),y:Number(p.y)}:null;}
function uniquePoints(raw){
  const out=[]; let last=null;
  for(const p0 of raw||[]){
    const p=point(p0); if(!p)continue;
    if(!last||Math.abs(p.x-last.x)>.0001||Math.abs(p.y-last.y)>.0001){out.push(p);last=p;}
  }
  return out;
}
function routePoints(g){
  if(g?.tool==='line'&&g.start&&g.end)return uniquePoints([g.start,g.end]);
  if((g?.tool==='rectangle-filled'||g?.tool==='ellipse-filled')&&g.start&&g.end)return uniquePoints([g.start,g.end]);
  return uniquePoints(g?.points);
}
function buildSegments(points){
  const segs=[]; let total=0;
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    if(len<1e-6)continue;
    segs.push({a,b,dx,dy,len,start:total,end:total+len}); total+=len;
  }
  return {segments:segs,total};
}
function routeAt(built,d){
  const {segments,total}=built; if(!segments.length)return null;
  d=clamp(Number(d)||0,0,total); let seg=segments[segments.length-1];
  for(const q of segments){if(d<=q.end+1e-7){seg=q;break;}}
  const t=seg.len>0?clamp((d-seg.start)/seg.len,0,1):0;
  return {x:seg.a.x+seg.dx*t,y:seg.a.y+seg.dy*t,along:d};
}
function routeSamples(points){
  if(!points.length)return [];
  if(points.length===1)return [{x:Math.round(points[0].x),y:Math.round(points[0].y),along:0}];
  const built=buildSegments(points); if(!built.segments.length)return [{x:Math.round(points[0].x),y:Math.round(points[0].y),along:0}];
  const count=Math.max(1,Math.ceil(built.total)), out=[], seen=new Set();
  for(let n=0;n<=count;n++){
    const d=n===count?built.total:Math.min(built.total,n),p=routeAt(built,d); if(!p)continue;
    const x=Math.round(p.x),y=Math.round(p.y),key=`${x},${y}`;
    if(seen.has(key))continue; seen.add(key); out.push({x,y,along:d});
  }
  return out;
}
function brushRadius(ctx){
  const tool=ctx.toolState||{};
  const raw=tool.brushSize??tool.size??tool.radius??1;
  return clamp(Math.round(Number(raw)||1),1,24);
}
function effectMode(ctx){
  if(ctx.geometry?.secondary===true)return 'lighten';
  const values=[ctx.toolState?.mouseButton,ctx.toolState?.button,ctx.toolState?.pointerButton,ctx.geometry?.button,ctx.pointer?.button,ctx.mouseButton];
  for(const v0 of values){
    const v=String(v0).toLowerCase();
    if(v==='2'||v==='right')return 'lighten';
    if(v==='0'||v==='1'||v==='left'||v==='default')return 'darken';
  }
  return 'darken';
}
function makeMask(ctx){
  const w=ctx.width,h=ctx.height,size=w*h,mask=new Uint8Array(size),along=new Float32Array(size); along.fill(-1);
  const g=ctx.geometry||{},tool=g.tool||'freehand';
  function stampDisk(cx,cy,r,progress=0){
    const minX=Math.max(0,Math.floor(cx-r)),maxX=Math.min(w-1,Math.ceil(cx+r));
    const minY=Math.max(0,Math.floor(cy-r)),maxY=Math.min(h-1,Math.ceil(cy+r));
    const rr=(r+.25)*(r+.25);
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
      const dx=x-cx,dy=y-cy;if(dx*dx+dy*dy>rr)continue;
      const i=y*w+x;mask[i]=1;if(along[i]<0||progress<along[i])along[i]=progress;
    }
  }
  if(tool==='fill'&&Array.isArray(g.points)&&g.points.length){
    const seedX=Math.round(Number(g.seed?.x??g.start?.x)||0),seedY=Math.round(Number(g.seed?.y??g.start?.y)||0);
    for(const p0 of g.points){
      const p=point(p0);if(!p)continue;
      const x=Math.round(p.x),y=Math.round(p.y);if(!inBounds(w,h,x,y))continue;
      const i=y*w+x;mask[i]=1;along[i]=Math.hypot(x-seedX,y-seedY);
    }
  }else if((tool==='rectangle-filled'||tool==='rectangle')&&g.start&&g.end){
    const x0=clamp(Math.round(Math.min(g.start.x,g.end.x)),0,w-1),x1=clamp(Math.round(Math.max(g.start.x,g.end.x)),0,w-1);
    const y0=clamp(Math.round(Math.min(g.start.y,g.end.y)),0,h-1),y1=clamp(Math.round(Math.max(g.start.y,g.end.y)),0,h-1);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const i=y*w+x;mask[i]=1;along[i]=x-x0;}
  }else if((tool==='ellipse-filled'||tool==='ellipse')&&g.start&&g.end){
    const x0=clamp(Math.round(Math.min(g.start.x,g.end.x)),0,w-1),x1=clamp(Math.round(Math.max(g.start.x,g.end.x)),0,w-1);
    const y0=clamp(Math.round(Math.min(g.start.y,g.end.y)),0,h-1),y1=clamp(Math.round(Math.max(g.start.y,g.end.y)),0,h-1);
    const cx=(x0+x1)/2,cy=(y0+y1)/2,rx=Math.max(.5,(x1-x0+1)/2),ry=Math.max(.5,(y1-y0+1)/2);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const dx=(x-cx)/rx,dy=(y-cy)/ry; if(dx*dx+dy*dy>1.0001)continue;
      const i=y*w+x; mask[i]=1; along[i]=x-x0;
    }
  }else{
    const pts=routePoints(g),samples=routeSamples(pts),r=brushRadius(ctx);
    for(const s of samples)stampDisk(s.x,s.y,r,s.along||0);
    if(samples.length===1&&pts[0])stampDisk(Math.round(pts[0].x),Math.round(pts[0].y),r,0);
  }
  return {mask,along};
}
function edgeData(ctx,base,mask,maxDistance){
  const w=ctx.width,h=ctx.height,dist=new Uint8Array(w*h),soilAdj=new Uint8Array(w*h),grassAdj=new Uint8Array(w*h);
  dist.fill(255);
  const md=clamp(Math.round(maxDistance||0),0,12);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;if(!mask[i])continue;
    let best=255,soil=0,grass=0;
    for(let oy=-md-1;oy<=md+1;oy++)for(let ox=-md-1;ox<=md+1;ox++){
      const nx=x+ox,ny=y+oy;if(!inBounds(w,h,nx,ny))continue;
      const ni=ny*w+nx;if(mask[ni])continue;
      const d=Math.round(Math.hypot(ox,oy)); if(d<best)best=d;
    }
    const neigh=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    for(const [ox,oy] of neigh){
      const nx=x+ox,ny=y+oy;if(!inBounds(w,h,nx,ny))continue;
      const ni=ny*w+nx;if(mask[ni])continue;
      const v=base[ni];
      if(SOIL_SET.has(v)||TRACK_GREYS.has(v))soil++;
      if(GRASS_SET.has(v))grass++;
    }
    dist[i]=best===255?0:best; soilAdj[i]=soil; grassAdj[i]=grass;
  }
  return {dist,soilAdj,grassAdj};
}
function shiftGrass(index,delta){
  const order=[GRASS.dark,GRASS.mid,GRASS.light,GRASS.bright];
  let p=order.indexOf(index); if(p<0)p=1; p=clamp(p+delta,0,order.length-1); return order[p];
}
function chooseSoil(seed,depth){
  const palette=depth>1?[SOIL.dark,SOIL.mid,SOIL.light]:[SOIL.mid,SOIL.light,SOIL.pale];
  return palette[seed%palette.length];
}
function grassAt(style,x,y,along,effect,sourceIndex){
  const h=hash(x,y,along|0),n=h&15,existingGrass=GRASS_SET.has(sourceIndex);
  let idx=GRASS.mid;
  if(style==='smooth'){
    idx=n<3?GRASS.light:n<13?GRASS.mid:GRASS.dark;
  }else if(style==='rough'){
    idx=n<3?GRASS.dark:n<8?GRASS.mid:n<13?GRASS.light:GRASS.bright;
  }else{ // mowed stripes
    const stripe=(((x+y)+Math.round(along||0))/Math.max(2,Math.round(settings.stripeWidth||6)))|0;
    const light=(stripe&1)===0;
    idx=light?(n<12?GRASS.light:GRASS.mid):(n<10?GRASS.mid:GRASS.dark);
  }

  if(effect==='lighten'){
    /* Relative lightening is anchored to the existing grass when possible.
       Style still modulates the result so Mowed/Rough remain visible when
       painted over an existing grass field instead of collapsing to one shade. */
    if(existingGrass){
      if(style==='mowed'){
        const stripe=(((x+y)+Math.round(along||0))/Math.max(2,Math.round(settings.stripeWidth||6)))|0;
        return (stripe&1)===0?shiftGrass(sourceIndex,1):sourceIndex;
      }
      if(style==='rough')return n<5?shiftGrass(sourceIndex,2):n<12?shiftGrass(sourceIndex,1):sourceIndex;
      return shiftGrass(sourceIndex,1);
    }
    return shiftGrass(idx,1);
  }

  if(existingGrass){
    const sourcePos=[GRASS.dark,GRASS.mid,GRASS.light,GRASS.bright].indexOf(sourceIndex);
    if(sourcePos>0){
      if(style==='mowed'){
        const stripe=(((x+y)+Math.round(along||0))/Math.max(2,Math.round(settings.stripeWidth||6)))|0;
        return (stripe&1)===0?sourceIndex:shiftGrass(sourceIndex,-1);
      }
      if(style==='rough')return n<4?4:n<13?shiftGrass(sourceIndex,-1):sourceIndex;
      return shiftGrass(sourceIndex,-1);
    }

    /* Index 24 is already the darkest true green. Repainting it must still
       remain visible: add sparse palette-dark shadow flecks rather than
       returning 24 unchanged everywhere. Mowed uses those flecks only in the
       darker stripe; Rough is deliberately denser. */
    if(style==='mowed'){
      const stripe=(((x+y)+Math.round(along||0))/Math.max(2,Math.round(settings.stripeWidth||6)))|0;
      return (stripe&1)===0?GRASS.dark:(n<6?4:GRASS.dark);
    }
    const shadowChance=style==='rough'?7:3; // /16
    return n<shadowChance?4:GRASS.dark;
  }
  return idx;
}

function fillIntensityGrass(index,intensity,x,y){
  intensity=String(intensity||'dark');
  if(intensity==='dark')return index;
  const h=hash(x,y,73),n=h&15;
  // Treat the dark-grey shadow fleck used by Dark/Rough grass as the bottom
  // of the grass scale, then remap into an all-green intensity range. This
  // keeps the selected Style's spatial pattern while preventing Medium/Bright
  // Fill from introducing grey into pure grass regions.
  const rank=index===GRASS.bright?3:index===GRASS.light?2:index===GRASS.mid?1:0;
  if(intensity==='bright'){
    if(rank>=2)return GRASS.bright;
    return n<4?GRASS.bright:GRASS.light;
  }
  if(rank>=3)return GRASS.bright;
  if(rank===2)return GRASS.light;
  if(rank===1)return n<3?GRASS.light:GRASS.mid;
  return n<2?GRASS.light:GRASS.mid;
}

function apply(ctx){
  const backdrop=ctx.layer('backdrop'), base=ctx.baseLayer('backdrop'), {mask,along}=makeMask(ctx), w=ctx.width,h=ctx.height;
  let count=0; for(const v of mask)if(v)count++; if(!count)return {message:'Grass: draw with Pencil, Line, Curve, Fill or a filled shape.'};
  const feather= settings.edgeMode==='none' ? 0 : clamp(Math.round(Number(settings.feather)||0),0,10);
  const edgeDepth=settings.edgeMode==='sharp'?clamp(Math.round(Number(settings.edgeDepth)||0),0,6):0;
  const maxEdge=Math.max(feather,edgeDepth)+1; const edges=edgeData(ctx,base,mask,maxEdge);
  const effect=effectMode(ctx),isFill=ctx.geometry?.tool==='fill'; let painted=0,soilPx=0,bumpPx=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x; if(!mask[i])continue;
    const src=base[i],existingGrass=GRASS_SET.has(src),existingSoil=SOIL_SET.has(src)||TRACK_GREYS.has(src),d=edges.dist[i],hsh=hash(x,y,17),edgeStrength=feather?clamp((feather+1-d)/(feather+1),0,1):0;
    let index=grassAt(settings.style,x,y,along[i],effect,src);
    if(isFill&&settings.fillIntensity!=='dark')index=fillIntensityGrass(index,settings.fillIntensity,x,y);
    if(existingGrass&&effect!=='lighten')bumpPx++;

    if(settings.edgeMode==='sharp'&&edgeDepth>0&&d>0&&d<=edgeDepth){
      const inwardBlend = feather>0 && d===edgeDepth && edgeStrength>.2;
      if(inwardBlend && (hsh&7)<3){
        index=grassAt(settings.style,x,y,along[i],effect,src);
      }else{
        index=chooseSoil(hsh,d); soilPx++;
      }
    }else if(feather>0&&d>0&&d<=feather){
      const heavy=clamp(Number(settings.featherStrength)||0,0,100)/100;
      const adjacentSoil=edges.soilAdj[i]>0;
      const blendSoil=settings.soilBlend&&(adjacentSoil||existingSoil);
      /* Soil adjacency now increases, rather than reduces, the earth share.
         At a heavy feather this produces an obvious dithered transition. */
      const soilBoost=blendSoil?(adjacentSoil?.42:.28)*edgeStrength:0;
      const keepGrassChance=clamp(1-edgeStrength*heavy-soilBoost,0,1);
      const r=((hsh>>>8)&255)/255;
      if(r>keepGrassChance){
        index=blendSoil?chooseSoil(hsh,d):src;
        soilPx++;
      }else if(settings.dither && (hsh&3)===0 && edgeStrength>.45){
        index=effect==='lighten'?GRASS.bright:GRASS.light;
      }
    }

    if(settings.soilBlend&&existingSoil&&effect!=='lighten'){
      const chance=d>0&&d<=Math.max(1,feather)?10:6; // 62.5% at edge, 37.5% inside
      if((hsh&15)<chance){index=chooseSoil(hsh,Math.max(1,d));soilPx++;}
    }
    if(!(isFill&&settings.fillIntensity!=='dark')){
      if(settings.dither&&!existingGrass&&settings.style==='rough'&&(hsh&7)===0)index=shiftGrass(index,-1);
      if(settings.dither && settings.style==='smooth' && (hsh&15)===15)index=shiftGrass(index,1);
    }
    backdrop[i]=validIndex(ctx,index); painted++;
  }
  return {message:`Grass committed · ${painted} px · ${settings.style}${isFill?` · fill ${settings.fillIntensity}`:''}${effect==='lighten'?' · lighten':' · darken'}${feather?` · feather ${feather}px`:''}${settings.edgeMode==='sharp'?` · earth edge ${edgeDepth}px`:''}${bumpPx?` · heavier over existing grass ${bumpPx}px`:''}.`};
}
function mountControls(container,ctx){
  ctx.ui.select(container,{label:'Style',value:settings.style,options:STYLE_OPTIONS,onChange:value=>{settings.style=value;}});
  ctx.ui.select(container,{label:'Fill intensity',value:settings.fillIntensity,options:FILL_INTENSITY_OPTIONS,onChange:value=>{settings.fillIntensity=value;}});
  ctx.ui.slider(container,{label:'Feather distance',min:0,max:10,step:1,value:settings.feather,onInput:value=>{settings.feather=value;}});
  ctx.ui.slider(container,{label:'Feather heaviness',min:0,max:100,step:5,value:settings.featherStrength,onInput:value=>{settings.featherStrength=value;}});
  ctx.ui.select(container,{label:'Edge behaviour',value:settings.edgeMode,options:EDGE_OPTIONS,onChange:value=>{settings.edgeMode=value;}});
  ctx.ui.slider(container,{label:'Edge depth',min:0,max:6,step:1,value:settings.edgeDepth,onInput:value=>{settings.edgeDepth=value;}});
  ctx.ui.checkbox(container,{label:'Blend with soil',checked:settings.soilBlend,onChange:value=>{settings.soilBlend=value;}});
  ctx.ui.checkbox(container,{label:'Dither',checked:settings.dither,onChange:value=>{settings.dither=value;}});
  ctx.ui.slider(container,{label:'Stripe width',min:2,max:16,step:1,value:settings.stripeWidth,onInput:value=>{settings.stripeWidth=value;}});
}

S.register({
  id:'grass',
  name:'Grass',
  version:VERSION,
  category:'Track',
  status:'prototype',
  description:'Dithered grass painter for Pencil/Line/Curve, Fill and filled shapes with smooth, rough or mowed-stripe styles, Bright/Medium/Dark Fill intensity, central brush-size control, feathering, strong soil-edge blending and left-click darken / right-click lighten behaviour.',
  supportedModes:['backdrop'],
  supportedTools:['freehand','line','curve','fill','rectangle-filled','ellipse-filled'],
  layers:['backdrop'],
  mountControls,
  preview:apply,
  apply:apply
});

})(typeof globalThis!=='undefined'?globalThis:this);
