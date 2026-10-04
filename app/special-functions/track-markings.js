(function(root){
'use strict';

/* Track Markings Special Function.
 *
 * Line / Curve identify the section of neutral road to inspect. The same
 * conservative 2x2 homogeneous-region edge detection used by Track Gradients
 * is used here, then a one-pixel marking is drawn parallel to each detected
 * track edge. Markings can sit directly on the detected edge or 1..5 pixels
 * inward from it.
 *
 * Colour selections are colour families rather than fixed palette indices.
 * The actual shade follows the neutral road tone underneath the marking so a
 * darker circuit surface receives a darker family shade and a lighter surface
 * receives a lighter one.
 */
const S=root.IndyHeatSpecialFunctions;if(!S?.register)return;

const VERSION='1.001';
const MASK_BACKGROUND=1;
const TONES=Object.freeze([1,4,5,0,6,7,3]);
const TONE_POS=Object.freeze(new Map(TONES.map((value,index)=>[value,index])));

const settings={inside:'white',outside:'none',gap:0,shadeSteps:1};

const FAMILY_OPTIONS=Object.freeze([
  Object.freeze({value:'none',label:'None'}),
  Object.freeze({value:'red',label:'Red'}),
  Object.freeze({value:'yellow',label:'Yellow'}),
  Object.freeze({value:'orange',label:'Orange'}),
  Object.freeze({value:'green',label:'Green'}),
  Object.freeze({value:'blue',label:'Blue'}),
  Object.freeze({value:'white',label:'White'})
]);
const FAMILY_SHADES=Object.freeze({
  red:Object.freeze([28,29,30,31]),
  yellow:Object.freeze([22,21,23,11]),
  orange:Object.freeze([8,20,9,10]),
  green:Object.freeze([24,25,26,27]),
  blue:Object.freeze([12,14,15,16,17])
});
const SHADE_STEP_OPTIONS=Object.freeze([
  Object.freeze({value:'1',label:'1 step'}),
  Object.freeze({value:'2',label:'2 steps'})
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
    segments.push({a,b,dx,dy,len,len2:len*len,start:total,end:total+len,tx:dx/len,ty:dy/len});total+=len;
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
function nearestRouteInfo(x,y,built){
  let bestD2=Infinity,bestAlong=0,bestSigned=0;
  for(const seg of built.segments){
    const raw=((x-seg.a.x)*seg.dx+(y-seg.a.y)*seg.dy)/seg.len2,t=clamp(raw,0,1);
    const qx=seg.a.x+seg.dx*t,qy=seg.a.y+seg.dy*t,ox=x-qx,oy=y-qy,d2=ox*ox+oy*oy;
    if(d2>=bestD2)continue;
    bestD2=d2;bestAlong=seg.start+t*seg.len;
    // Positive is screen-left of the drawing direction.
    bestSigned=ox*seg.ty+oy*(-seg.tx);
  }
  return {distance:Math.sqrt(bestD2),along:bestAlong,signed:bestSigned,progress:built.total?clamp(bestAlong/built.total,0,1):0};
}

/* This is intentionally the Track Gradients footprint detector. */
function footprint(ctx,base,route){
  const w=ctx.width,h=ctx.height,progress=new Float32Array(w*h);progress.fill(-1);
  if(!route.built||w<2||h<2)return progress;
  const caps=endpointTangents(route.built),bw=w-1,bh=h-1,blockTone=new Int16Array(bw*bh);blockTone.fill(-1);

  for(let y=0;y<bh;y++)for(let x=0;x<bw;x++){
    const i=y*w+x,v=base[i];
    if(!TONE_POS.has(v))continue;
    if(base[i+1]!==v||base[i+w]!==v||base[i+w+1]!==v)continue;
    if(!insideLengthCaps(x,y,caps)||!insideLengthCaps(x+1,y,caps)||!insideLengthCaps(x,y+1,caps)||!insideLengthCaps(x+1,y+1,caps))continue;
    blockTone[y*bw+x]=v;
  }

  const queue=[],seen=new Uint8Array(bw*bh);
  function seedBlock(x,y){
    if(x<0||y<0||x>=bw||y>=bh)return;
    const bi=y*bw+x;if(blockTone[bi]<0||seen[bi])return;
    seen[bi]=1;queue.push(bi);
  }
  for(const sample of route.samples){
    const sx=Math.round(sample.x),sy=Math.round(sample.y);
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

  const core=new Uint8Array(w*h);
  for(let by=0;by<bh;by++)for(let bx=0;bx<bw;bx++){
    const bi=by*bw+bx;if(!seen[bi])continue;
    for(let oy=0;oy<2;oy++)for(let ox=0;ox<2;ox++)core[(by+oy)*w+(bx+ox)]=1;
  }

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
    const x=i%w,y=(i/w)|0;progress[i]=nearestRouteInfo(x,y,route.built).progress;
  }
  return progress;
}
function trackMaskFromProgress(progress){
  const mask=new Uint8Array(progress.length);for(let i=0;i<progress.length;i++)if(progress[i]>=0)mask[i]=1;return mask;
}
function globalInsideSign(built){
  const segs=built?.segments||[];let turn=0;
  for(let i=1;i<segs.length;i++)turn+=segs[i-1].tx*segs[i].ty-segs[i-1].ty*segs[i].tx;
  if(Math.abs(turn)<.02)return 1; // straight: Inside defaults to screen-left of stroke
  // Screen Y grows downward, so positive visual clockwise turn means the inside is screen-right.
  return turn>0?-1:1;
}
function boundarySeeds(ctx,mask,route){
  const w=ctx.width,h=ctx.height,inside=new Uint8Array(mask.length),outside=new Uint8Array(mask.length),neighbours=[[1,0],[-1,0],[0,1],[0,-1]],insideSign=globalInsideSign(route.built);
  const capMargin=Math.min(2,Math.max(.75,route.total*.04));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;if(!mask[i])continue;
    let edge=false;
    for(const [dx,dy] of neighbours){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h||!mask[ny*w+nx]){edge=true;break;}}
    if(!edge)continue;
    const q=nearestRouteInfo(x,y,route.built);
    if(q.along<capMargin||q.along>route.total-capMargin)continue;
    const side=q.signed*insideSign;
    if(side>=0)inside[i]=1;else outside[i]=1;
  }
  return {inside,outside};
}
function inwardDistance(mask,seeds,w,h,maxDistance){
  const dist=new Int16Array(mask.length);dist.fill(-1);const queue=[],neighbours=[[1,0],[-1,0],[0,1],[0,-1]];
  for(let i=0;i<seeds.length;i++)if(seeds[i]){dist[i]=0;queue.push(i);}
  let head=0;
  while(head<queue.length){
    const i=queue[head++],d=dist[i];if(d>=maxDistance)continue;const x=i%w,y=(i/w)|0;
    for(const [dx,dy] of neighbours){
      const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;
      const ni=ny*w+nx;if(!mask[ni]||dist[ni]>=0)continue;
      dist[ni]=d+1;queue.push(ni);
    }
  }
  return dist;
}
function familyShade(name,baseTone){
  const pos=TONE_POS.get(Number(baseTone));if(pos==null)return null;
  const lift=clamp(Math.round(Number(settings.shadeSteps)||1),1,2);

  /* White is the neutral ladder itself, so use exact palette-tone steps.
   * This matches retail examples such as 5 -> 0 and 6 -> 7 at one step,
   * while the common 0 -> 7 treatment is available at two steps. */
  if(name==='white')return TONES[clamp(pos+lift,0,TONES.length-1)];

  const shades=FAMILY_SHADES[name];if(!shades)return null;
  /* Keep the established coloured-family mapping as the 1-step baseline
   * (notably the red result), then let 2-step move one family shade brighter. */
  let si=Math.floor(pos*(shades.length-1)/(TONES.length-1));
  if(lift===2)si++;
  return shades[clamp(si,0,shades.length-1)];
}
function paintSide(ctx,backdrop,base,foreground,dist,family,gap){
  if(family==='none')return 0;let written=0;
  for(let i=0;i<dist.length;i++){
    if(dist[i]!==gap)continue;
    const colour=familyShade(family,base[i]);if(colour==null)continue;
    if(backdrop[i]!==colour){backdrop[i]=ctx.helpers.validIndex(colour);written++;}
    foreground[i]=MASK_BACKGROUND;
  }
  return written;
}
function render(ctx){
  const points=routePoints(ctx.geometry),route=routeSamples(points);
  if(route.samples.length<2||route.total<=0)return {message:'Track Markings: draw a Line or Curve through the track section.'};
  const backdrop=ctx.layer('backdrop'),base=ctx.baseLayer('backdrop'),foreground=ctx.layer('foreground'),progress=footprint(ctx,base,route),mask=trackMaskFromProgress(progress);
  const seeds=boundarySeeds(ctx,mask,route),gap=clamp(Math.round(Number(settings.gap)||0),0,5);
  const insideDist=inwardDistance(mask,seeds.inside,ctx.width,ctx.height,gap),outsideDist=inwardDistance(mask,seeds.outside,ctx.width,ctx.height,gap);
  const insidePx=paintSide(ctx,backdrop,base,foreground,insideDist,settings.inside,gap),outsidePx=paintSide(ctx,backdrop,base,foreground,outsideDist,settings.outside,gap);
  const lift=clamp(Math.round(Number(settings.shadeSteps)||1),1,2);
  return {message:`Track Markings committed · gap ${gap}px · shade lift ${lift} step${lift===1?'':'s'} · inside ${settings.inside} ${insidePx}px · outside ${settings.outside} ${outsidePx}px.`};
}
function remount(container,ctx){if(container?.replaceChildren){container.replaceChildren();mountControls(container,ctx);}ctx.refreshPreview?.();}
function mountControls(container,ctx){
  ctx.ui.select(container,{label:'Inside colour',value:settings.inside,options:FAMILY_OPTIONS,onChange:value=>{settings.inside=value;}});
  ctx.ui.select(container,{label:'Outside colour',value:settings.outside,options:FAMILY_OPTIONS,onChange:value=>{settings.outside=value;}});
  ctx.ui.select(container,{label:'Shade lift',value:String(settings.shadeSteps),options:SHADE_STEP_OPTIONS,onChange:value=>{settings.shadeSteps=Number(value)||1;}});
  ctx.ui.slider(container,{label:'Edge gap',min:0,max:5,step:1,value:settings.gap,onInput:value=>{settings.gap=value;}});
  ctx.ui.button(container,{label:'Swap colours',onClick:()=>{const t=settings.inside;settings.inside=settings.outside;settings.outside=t;remount(container,ctx);}});
}

S.register({
  id:'track-markings',
  name:'Track Markings',
  version:VERSION,
  category:'Track',
  status:'prototype',
  description:'Detect neutral track edges using the Track Gradients 2x2 road-core method, then draw one-pixel inside/outside markings 0-5 px inward from the edge. Colour-family shades follow road brightness with selectable 1- or 2-step lift; white uses the exact neutral palette ladder.',
  supportedModes:['backdrop'],
  supportedTools:['line','curve'],
  layers:['backdrop','foreground'],
  mountControls,
  preview:render,
  apply:render
});

})(typeof globalThis!=='undefined'?globalThis:this);
