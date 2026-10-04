(function(root){
'use strict';

/* Track Gradients Special Function.
 *
 * Line / Curve only. The existing neutral road tone is shifted progressively
 * lighter or darker along the stroke using an ordered dither. Only the five
 * greys plus black and white are eligible. Every affected pixel is explicitly
 * written as Background in the Foreground mask (raw 1).
 *
 * Neutral ladder, darkest -> lightest:
 *   1 black, 4 dark grey, 5 grey, 0 mid grey, 6 light grey, 7 pale grey, 3 white
 */
const S=root.IndyHeatSpecialFunctions;if(!S?.register)return;

const VERSION='1.004';
const MASK_BACKGROUND=1;
const TONES=Object.freeze([1,4,5,0,6,7,3]);
const TONE_POS=Object.freeze(new Map(TONES.map((value,index)=>[value,index])));
const settings={direction:'up',steps:1,pattern:100};
let generation=1;

const DIRECTION_OPTIONS=Object.freeze([
  Object.freeze({value:'up',label:'Up / lighter'}),
  Object.freeze({value:'down',label:'Down / darker'})
]);
const STEP_OPTIONS=Object.freeze([
  Object.freeze({value:'1',label:'1 tone'}),
  Object.freeze({value:'2',label:'2 tones'})
]);

/* 8x8 Bayer matrix. This gives the repeated diagonal/checker texture seen in
 * the retail track gradients at the strongly patterned end of the control. */
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

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function point(p){return p&&Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.y))?{x:Number(p.x),y:Number(p.y)}:null;}
function uniquePoints(raw){
  const out=[];let last=null;
  for(const p0 of raw||[]){
    const p=point(p0);if(!p)continue;
    if(!last||Math.abs(p.x-last.x)>.0001||Math.abs(p.y-last.y)>.0001){out.push(p);last=p;}
  }
  return out;
}
function routePoints(g){
  if(g?.tool==='line'&&g.start&&g.end)return uniquePoints([g.start,g.end]);
  const pts=uniquePoints(g?.points);
  if(pts.length)return pts;
  if(g?.start&&g?.end)return uniquePoints([g.start,g.end]);
  return [];
}
function buildSegments(points){
  const segments=[];let total=0;
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    if(len<1e-6)continue;
    segments.push({a,b,dx,dy,len,start:total,end:total+len});total+=len;
  }
  return {segments,total};
}
function routeAt(built,d){
  const {segments,total}=built;if(!segments.length)return null;
  d=clamp(Number(d)||0,0,total);let seg=segments[segments.length-1];
  for(const q of segments){if(d<=q.end+1e-7){seg=q;break;}}
  const t=seg.len?clamp((d-seg.start)/seg.len,0,1):0;
  return {x:seg.a.x+seg.dx*t,y:seg.a.y+seg.dy*t,along:d};
}
function routeSamples(points){
  if(points.length<2)return {samples:[],total:0,built:null};
  const built=buildSegments(points);if(!built.segments.length)return {samples:[],total:0,built:null};
  for(const seg of built.segments){seg.len2=seg.len*seg.len;seg.tx=seg.dx/seg.len;seg.ty=seg.dy/seg.len;}
  const count=Math.max(1,Math.ceil(built.total)),out=[],seen=new Set();
  for(let n=0;n<=count;n++){
    const d=n===count?built.total:Math.min(built.total,n),p=routeAt(built,d);if(!p)continue;
    const x=Math.round(p.x),y=Math.round(p.y),key=`${x},${y}`;
    if(seen.has(key))continue;seen.add(key);out.push({x,y,along:d});
  }
  return {samples:out,total:built.total,built};
}
function endpointTangents(built){
  const first=built.segments[0],last=built.segments[built.segments.length-1];
  return {start:{x:first.a.x,y:first.a.y,tx:first.tx,ty:first.ty},end:{x:last.b.x,y:last.b.y,tx:last.tx,ty:last.ty}};
}
function insideLengthCaps(x,y,caps){
  const a=caps.start,b=caps.end;
  const fromStart=(x-a.x)*a.tx+(y-a.y)*a.ty;
  const pastEnd=(x-b.x)*b.tx+(y-b.y)*b.ty;
  return fromStart>=-.75&&pastEnd<=.75;
}
function nearestProgress(x,y,built){
  let bestD2=Infinity,bestAlong=0;
  for(const seg of built.segments){
    const raw=((x-seg.a.x)*seg.dx+(y-seg.a.y)*seg.dy)/seg.len2,t=clamp(raw,0,1);
    const qx=seg.a.x+seg.dx*t,qy=seg.a.y+seg.dy*t,dx=x-qx,dy=y-qy,d2=dx*dx+dy*dy;
    if(d2<bestD2){bestD2=d2;bestAlong=seg.start+t*seg.len;}
  }
  return built.total>0?clamp(bestAlong/built.total,0,1):0;
}
function footprint(ctx,base,route){
  const w=ctx.width,h=ctx.height,progress=new Float32Array(w*h);progress.fill(-1);
  if(!route.built||w<2||h<2)return progress;
  const caps=endpointTangents(route.built),bw=w-1,bh=h-1,blockTone=new Int16Array(bw*bh);blockTone.fill(-1);

  /* A spread cell is deliberately a homogeneous 2x2 Backdrop block, not an
   * individual neutral pixel. All four pixels must be the same eligible tone
   * and must lie inside the longitudinal start/end caps. This rejects the
   * single-pixel edge noise, dither specks and narrow necks that caused the
   * v0.1.1 flood to leak beyond the intended track surface. */
  for(let y=0;y<bh;y++)for(let x=0;x<bw;x++){
    const i=y*w+x,v=base[i];
    if(!TONE_POS.has(v))continue;
    if(base[i+1]!==v||base[i+w]!==v||base[i+w+1]!==v)continue;
    if(!insideLengthCaps(x,y,caps)||!insideLengthCaps(x+1,y,caps)||!insideLengthCaps(x,y+1,caps)||!insideLengthCaps(x+1,y+1,caps))continue;
    blockTone[y*bw+x]=v;
  }

  /* Seed every homogeneous 2x2 block touched by the drawn route. Each seed
   * then grows only through edge-adjacent 2x2 blocks of the exact same tone.
   * Different neutral greys therefore remain separate surfaces, and diagonal
   * contact alone never joins them. */
  const queue=[],seen=new Uint8Array(bw*bh);
  function seedBlock(x,y){
    if(x<0||y<0||x>=bw||y>=bh)return;
    const bi=y*bw+x;if(blockTone[bi]<0||seen[bi])return;
    seen[bi]=1;queue.push(bi);
  }
  for(const sample of route.samples){
    const sx=Math.round(sample.x),sy=Math.round(sample.y);
    /* The route itself may lie on a thin neutral marking. Search a small
     * neighbourhood for the broad homogeneous road core rather than requiring
     * the exact route pixel to belong to a valid 2x2 block. */
    for(let oy=-2;oy<=1;oy++)for(let ox=-2;ox<=1;ox++)seedBlock(sx+ox,sy+oy);
  }

  const neighbours=[[1,0],[-1,0],[0,1],[0,-1]];let head=0;
  while(head<queue.length){
    const bi=queue[head++],bx=bi%bw,by=(bi/bw)|0,tone=blockTone[bi];
    for(const [dx,dy] of neighbours){
      const nx=bx+dx,ny=by+dy;if(nx<0||ny<0||nx>=bw||ny>=bh)continue;
      const ni=ny*bw+nx;if(seen[ni]||blockTone[ni]!==tone)continue;
      seen[ni]=1;queue.push(ni);
    }
  }

  /* Convert the accepted 2x2 blocks back to a conservative pixel core.
   * The 2x2 rule is an EDGE detector: it establishes where the road body is
   * safely connected, but it must not erase legitimate one/two-pixel neutral
   * markings that sit inside that body. */
  const core=new Uint8Array(w*h);
  for(let by=0;by<bh;by++)for(let bx=0;bx<bw;bx++){
    const bi=by*bw+bx;if(!seen[bi])continue;
    for(let oy=0;oy<2;oy++)for(let ox=0;ox<2;ox++)core[(by+oy)*w+(bx+ox)]=1;
  }

  /* Recover neutral detail inside the accepted core. A skipped neutral pixel
   * is treated as an interior marking only when the core brackets/surrounds it
   * locally. This brings back thin road lines/dither without reopening the old
   * v0.1.1 leak through exposed edge specks, diagonal contact or 1 px necks. */
  const filled=core.slice(),dirs=[[1,0],[0,1],[1,1],[1,-1]],maxSpan=3;
  function coreAt(x,y){return x>=0&&y>=0&&x<w&&y<h&&filled[y*w+x]===1;}
  function neighbourCoreCount(x,y){
    let n=0;for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){if(!ox&&!oy)continue;if(coreAt(x+ox,y+oy))n++;}return n;
  }
  function bracketed(x,y){
    for(const [dx,dy] of dirs){
      let a=false,b=false;
      for(let d=1;d<=maxSpan&&!a;d++)a=coreAt(x-dx*d,y-dy*d);
      for(let d=1;d<=maxSpan&&!b;d++)b=coreAt(x+dx*d,y+dy*d);
      if(a&&b)return true;
    }
    return false;
  }
  for(let pass=0;pass<2;pass++){
    const add=[];
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=y*w+x;if(filled[i]||!TONE_POS.has(base[i])||!insideLengthCaps(x,y,caps))continue;
      if(neighbourCoreCount(x,y)<3||!bracketed(x,y))continue;
      add.push(i);
    }
    if(!add.length)break;for(const i of add)filled[i]=1;
  }

  for(let i=0;i<filled.length;i++)if(filled[i]){
    const x=i%w,y=(i/w)|0;progress[i]=nearestProgress(x,y,route.built);
  }
  return progress;
}
function shifted(index,delta){
  const pos=TONE_POS.get(Number(index));if(pos==null)return Number(index);
  return TONES[clamp(pos+delta,0,TONES.length-1)];
}
function availableSteps(index,direction,requested){
  const pos=TONE_POS.get(Number(index));if(pos==null)return 0;
  const capacity=direction==='up'?(TONES.length-1-pos):pos;
  return Math.min(Math.max(0,Math.round(Number(requested)||0)),capacity);
}
function fract(v){return v-Math.floor(v);}
function irregularThreshold(x,y){
  /* Historical lowest Pattern behaviour. It is deterministic and evenly
   * distributed, but retains a faint mathematical texture. Pattern 50 now
   * reproduces this exact threshold field. */
  return fract(52.9829189*fract(.06711056*x+.00583715*y));
}
function mix32(value){let x=Number(value)>>>0;x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;x=Math.imul(x,0x846ca68b);x^=x>>>16;return x>>>0;}
function randomThreshold(x,y){
  /* Stable for preview, but generation changes after each committed stroke so
   * separate gradients do not reuse one visible random field. */
  const h=mix32(Math.imul((x+0x10001)>>>0,0x9e3779b1)^Math.imul((y+0x20003)>>>0,0x85ebca6b)^Math.imul((generation+1)>>>0,0xc2b2ae35));
  return (h+.5)/0x100000000;
}
function ditherThreshold(x,y){
  const ordered=(BAYER8[((y&7)<<3)|(x&7)]+.5)/64;
  const irregular=irregularThreshold(x,y),random=randomThreshold(x,y);
  const p=clamp(Number(settings.pattern)||0,0,100);
  if(p<=50){
    /* 0 = completely random, 50 = the old minimum/irregular pattern. */
    const t=p/50;return random*(1-t)+irregular*t;
  }
  /* 50..100 continues from the old minimum into the ordered Bayer pattern. */
  const t=(p-50)/50;return irregular*(1-t)+ordered*t;
}
function toneFor(index,t,direction,requested,x,y){
  const dir=direction==='up'?1:-1,steps=availableSteps(index,direction,requested);
  if(!steps)return index;

  let from=index,to=index,blend=0;
  if(steps===1){
    from=index;to=shifted(index,dir);blend=clamp(t,0,1);
  }else{
    /* Exactly two equal-length dither transitions, with no flat middle tone. */
    if(t<.5){from=index;to=shifted(index,dir);blend=clamp(t*2,0,1);}
    else{from=shifted(index,dir);to=shifted(index,dir*2);blend=clamp((t-.5)*2,0,1);}
  }
  return ditherThreshold(x,y)<blend?to:from;
}
function render(ctx){
  const points=routePoints(ctx.geometry),route=routeSamples(points);
  if(route.samples.length<2||route.total<=0)return {message:'Track Gradients: draw a Line or Curve.'};
  const backdrop=ctx.layer('backdrop'),base=ctx.baseLayer('backdrop'),foreground=ctx.layer('foreground'),progress=footprint(ctx,base,route);
  const requested=clamp(Math.round(Number(settings.steps)||1),1,2);
  let eligible=0,changed=0,background=0,capped=0;
  for(let i=0;i<progress.length;i++){
    const t=progress[i];if(t<0)continue;
    const old=base[i];if(!TONE_POS.has(old))continue;
    const available=availableSteps(old,settings.direction,requested);
    if(available<requested)capped++;
    eligible++;
    if(available){
      const x=i%ctx.width,y=(i/ctx.width)|0,next=toneFor(old,t,settings.direction,requested,x,y);
      if(backdrop[i]!==next){backdrop[i]=next;changed++;}
    }
    if(foreground[i]!==MASK_BACKGROUND){foreground[i]=MASK_BACKGROUND;background++;}
  }
  if(ctx.phase==='apply')generation++;
  const direction=settings.direction==='up'?'lighter':'darker';
  return {message:`Track Gradients committed · ${requested} tone${requested===1?'':'s'} ${direction} · Pattern ${Math.round(Number(settings.pattern)||0)} · ${eligible} neutral px · ${changed} tone writes · Background written ${background} px${capped?` · ${capped} px capped to available tone range`:''}.`};
}
function mountControls(container,ctx){
  ctx.ui.select(container,{label:'Direction',value:settings.direction,options:DIRECTION_OPTIONS,onChange:value=>{settings.direction=value;}});
  ctx.ui.select(container,{label:'Gradient',value:String(settings.steps),options:STEP_OPTIONS,onChange:value=>{settings.steps=Number(value)||1;}});
  ctx.ui.slider(container,{label:'Pattern',min:0,max:100,step:1,value:settings.pattern,onInput:value=>{settings.pattern=value;}});
}

S.register({
  id:'track-gradients',
  name:'Track Gradients',
  version:VERSION,
  category:'Track',
  status:'prototype',
  description:'Neutral track gradients. Line/Curve define gradient direction/length, use homogeneous adjacent 2×2 same-tone regions to establish safe track edges, recover thin neutral markings inside that accepted core, shift black/white/five greys one or two tones lighter/darker, force the affected area to Background, and vary dither from fully random at Pattern 0 through the previous irregular minimum at 50 to ordered Bayer at 100.',
  supportedModes:['backdrop'],
  supportedTools:['line','curve'],
  layers:['backdrop','foreground'],
  mountControls,
  preview:render,
  apply:render
});

})(typeof globalThis!=='undefined'?globalThis:this);
