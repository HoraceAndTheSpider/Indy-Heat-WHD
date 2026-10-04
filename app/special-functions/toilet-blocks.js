(function(root){
'use strict';

/* Toilet Blocks Special Function.
 *
 * Pencil / Line place complete 3x6 portable-toilet fronts along a route.
 * Each unit is assembled from two layers:
 *   - back: 3x6, bright 3x1 roof + medium 3x5 side/body;
 *   - front: 3x6 darkest family shade, with a black 1px window centred
 *            one pixel below the top edge.
 *
 * The back layer always sits one pixel higher than the front.  Its horizontal
 * offset is a faux-perspective projection: zero for horizontal/vertical rows,
 * one pixel at about 45 degrees, then back to zero towards the other axis.
 */
const S=root.IndyHeatSpecialFunctions;if(!S?.register)return;

const VERSION='1.001';
const MASK_FOREGROUND=0; // Project invariant: raw 0 = artwork in front of car.
const MASK_BACKGROUND=1; // raw 1 = car passes in front.
const SHADOW_INDEX=4;
const WINDOW_INDEX=1;

const settings={
  family:'green',
  gap:1,
  shadow:'right-down',
  layerMode:'background'
};

/* Exact shade triplets taken from the supplied Toilet Blocks IHBR examples. */
const FAMILY_MAP=Object.freeze({
  red:Object.freeze({front:28,side:30,top:31}),
  yellow:Object.freeze({front:22,side:21,top:23}),
  green:Object.freeze({front:24,side:26,top:27}),
  blue:Object.freeze({front:12,side:16,top:17}),
  white:Object.freeze({front:6,side:7,top:3}),
  orange:Object.freeze({front:20,side:9,top:19})
});
const FAMILY_OPTIONS=Object.freeze([
  Object.freeze({value:'red',label:'Red'}),
  Object.freeze({value:'yellow',label:'Yellow'}),
  Object.freeze({value:'green',label:'Green'}),
  Object.freeze({value:'blue',label:'Blue'}),
  Object.freeze({value:'white',label:'White'}),
  Object.freeze({value:'orange',label:'Orange'})
]);
const SHADOW_OPTIONS=Object.freeze([
  Object.freeze({value:'none',label:'None'}),
  Object.freeze({value:'left-down',label:'Left / Down'}),
  Object.freeze({value:'right-down',label:'Right / Down'})
]);
const LAYER_OPTIONS=Object.freeze([
  Object.freeze({value:'foreground',label:'Foreground'}),
  Object.freeze({value:'background',label:'Background'})
]);

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function inBounds(ctx,x,y){return x>=0&&y>=0&&x<ctx.width&&y<ctx.height;}
function point(p){
  const x=Number(p?.x),y=Number(p?.y);
  return Number.isFinite(x)&&Number.isFinite(y)?{x,y}:null;
}
function routePoints(g){
  if(g?.tool==='line'){
    const a=point(g.start),b=point(g.end);return a&&b?[a,b]:[];
  }
  const out=[];
  for(const p0 of g?.points||[]){
    const p=point(p0),last=out[out.length-1];if(!p)continue;
    if(!last||Math.abs(p.x-last.x)>.001||Math.abs(p.y-last.y)>.001)out.push(p);
  }
  if(out.length<2){
    const a=point(g?.start),b=point(g?.end);
    if(a&&!out.length)out.push(a);
    if(b&&(!out.length||Math.abs(b.x-out[out.length-1].x)>.001||Math.abs(b.y-out[out.length-1].y)>.001))out.push(b);
  }
  return out;
}
function buildSegments(points){
  const segments=[];let total=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    if(len<1e-6)continue;
    segments.push({a,b,dx,dy,len,start:total,end:total+len});total+=len;
  }
  return {segments,total};
}
function sampleAt(built,d){
  if(!built.segments.length)return null;
  d=clamp(Number(d)||0,0,built.total);
  let seg=built.segments[built.segments.length-1];
  for(const q of built.segments){if(d<=q.end+1e-7){seg=q;break;}}
  const t=seg.len?clamp((d-seg.start)/seg.len,0,1):0;
  return {x:seg.a.x+seg.dx*t,y:seg.a.y+seg.dy*t,tx:seg.dx/seg.len,ty:seg.dy/seg.len};
}
function unitAnchors(g){
  const pts=routePoints(g);if(!pts.length)return [];
  if(pts.length===1)return [{x:pts[0].x,y:pts[0].y,tx:1,ty:0}];
  const built=buildSegments(pts);if(!built.segments.length)return [{x:pts[0].x,y:pts[0].y,tx:1,ty:0}];
  const requested=3+clamp(Math.round(Number(settings.gap)||1),1,8);
  const intervals=Math.max(1,Math.floor(built.total/requested));
  /* Redistribute the complete blocks over the line so the final unit is never
     represented by a clipped/partial sprite.  Actual spacing is always >= the
     requested spacing, preserving the 1px horizontal minimum gap. */
  const count=built.total<requested?1:intervals+1;
  const spacing=count>1?built.total/(count-1):0;
  const out=[];
  for(let i=0;i<count;i++){
    const p=sampleAt(built,count===1?built.total*.5:i*spacing);if(p)out.push(p);
  }
  return out;
}
function sideOffset(tx,ty){
  const ax=Math.abs(tx),ay=Math.abs(ty);
  if(ax<1e-6||ay<1e-6)return 0;
  const theta=Math.atan2(ay,ax); // 0 horizontal -> PI/2 vertical
  const magnitude=Math.round(Math.sin(theta*2)); // 0 -> 1 @45 -> 0
  if(!magnitude)return 0;
  /* Orientation is geometry-based, not stroke-direction based: reversing the
     same line gives the same visible side.  Rising-right rows expose the right
     side, matching the supplied reference. */
  const sign=-(Math.sign(tx*ty)||1);
  return sign*magnitude;
}
function unitGeometry(anchor){
  const cx=Math.round(anchor.x),groundY=Math.round(anchor.y);
  const fx=cx-1,fy=groundY-5,side=sideOffset(anchor.tx,anchor.ty);
  return {
    frontX:fx,frontY:fy,
    backX:fx+side,backY:fy-1,
    groundY,side
  };
}
function setBackdrop(ctx,pixels,x,y,index){
  x=Math.round(x);y=Math.round(y);if(!inBounds(ctx,x,y))return false;
  pixels[y*ctx.width+x]=ctx.helpers.validIndex(index);return true;
}
function addUnitStructurePixels(ctx,set,u){
  for(let y=0;y<6;y++)for(let x=0;x<3;x++){
    const fx=u.frontX+x,fy=u.frontY+y,bx=u.backX+x,by=u.backY+y;
    if(inBounds(ctx,fx,fy))set.add(fy*ctx.width+fx);
    if(inBounds(ctx,bx,by))set.add(by*ctx.width+bx);
  }
}
function paintShadow(ctx,pixels,structure){
  if(settings.shadow==='none'||!structure?.size)return 0;
  const dx=settings.shadow==='left-down'?-1:1,dy=1;
  const shadow=new Set();
  /* Cast the complete front+back silhouette by one pixel.  Only the translated
     pixels that fall outside the structure remain visible.  This preserves the
     one-pixel retail-style shadow while allowing the exposed side/back layer to
     contribute its own return, producing the expected L-shaped shadow at
     diagonal views instead of a single ground line. */
  for(const i of structure){
    const x=i%ctx.width,y=(i/ctx.width)|0,nx=x+dx,ny=y+dy;
    if(!inBounds(ctx,nx,ny))continue;
    const ni=ny*ctx.width+nx;if(structure.has(ni))continue;
    shadow.add(ni);
  }
  for(const i of shadow)pixels[i]=SHADOW_INDEX;
  return shadow.size;
}
function paintBack(ctx,pixels,u,family,structure){
  let n=0;
  for(let x=0;x<3;x++)if(setBackdrop(ctx,pixels,u.backX+x,u.backY,family.top)){structure.add(`${u.backX+x},${u.backY}`);n++;}
  for(let y=1;y<6;y++)for(let x=0;x<3;x++)if(setBackdrop(ctx,pixels,u.backX+x,u.backY+y,family.side)){structure.add(`${u.backX+x},${u.backY+y}`);n++;}
  return n;
}
function paintFront(ctx,pixels,u,family,structure){
  let n=0;
  for(let y=0;y<6;y++)for(let x=0;x<3;x++){
    const index=(x===1&&y===1)?WINDOW_INDEX:family.front;
    if(setBackdrop(ctx,pixels,u.frontX+x,u.frontY+y,index)){structure.add(`${u.frontX+x},${u.frontY+y}`);n++;}
  }
  return n;
}
function applyLayerMask(ctx,mask,structure){
  const value=settings.layerMode==='foreground'?MASK_FOREGROUND:MASK_BACKGROUND;let written=0;
  for(const key of structure){
    const comma=key.indexOf(','),x=Number(key.slice(0,comma)),y=Number(key.slice(comma+1));
    if(!inBounds(ctx,x,y))continue;mask[y*ctx.width+x]=value;written++;
  }
  return {value,written};
}
function render(ctx){
  const anchors=unitAnchors(ctx.geometry);if(!anchors.length)return {message:'Toilet Blocks: draw with Pencil or Line.'};
  const backdrop=ctx.layer('backdrop'),foreground=ctx.layer('foreground'),family=FAMILY_MAP[settings.family]||FAMILY_MAP.green;
  const units=anchors.map(unitGeometry),structure=new Set(),shadowStructure=new Set();let bodyPx=0;
  /* Build the complete combined silhouette first so the 1 px shadow is cast from
     the whole toilet structure (front + raised/offset back), not just its base.
     Adjacent toilets also suppress shadow pixels that would fall inside another
     unit.  Structure artwork is then painted over the shadow as before. */
  for(const u of units)addUnitStructurePixels(ctx,shadowStructure,u);
  const shadowPx=paintShadow(ctx,backdrop,shadowStructure);
  const ordered=[...units].sort((a,b)=>a.groundY-b.groundY||a.frontX-b.frontX);
  for(const u of ordered){bodyPx+=paintBack(ctx,backdrop,u,family,structure);bodyPx+=paintFront(ctx,backdrop,u,family,structure);}
  const occ=applyLayerMask(ctx,foreground,structure);
  return {message:`Toilet Blocks committed · ${units.length} ${units.length===1?'unit':'units'} · ${settings.family} · gap ${settings.gap}px · ${settings.layerMode}${settings.shadow!=='none'?` · shadow ${settings.shadow}`:''} · ${bodyPx} body px · mask ${occ.written} px${shadowPx?` · shadow ${shadowPx} px`:''}.`};
}
function ensureToggleStyle(){
  if(typeof document==='undefined'||document.getElementById('indyheatToiletBlocksToggleStyle'))return;
  const style=document.createElement('style');style.id='indyheatToiletBlocksToggleStyle';
  style.textContent=`.toiletBlocksToggle{display:inline-flex;gap:3px;justify-content:flex-end;flex-wrap:wrap}.toiletBlocksToggle button{padding:2px 7px;min-height:22px;font-size:10px}.toiletBlocksToggle button[aria-pressed="true"]{border-color:#d6b54a;background:#40391f;box-shadow:inset 0 0 0 1px #8f792f}`;
  document.head.appendChild(style);
}
function toggleButtons(container,ctx,{label,value,options,onChange}){
  if(typeof document==='undefined'||!container?.appendChild){ctx.ui.select(container,{label,value,options,onChange});return;}
  ensureToggleStyle();
  const row=document.createElement('div');row.className='specialControlRow';
  const name=document.createElement('span');name.textContent=label;
  const wrap=document.createElement('span');wrap.className='toiletBlocksToggle';
  const buttons=[];const refresh=()=>{for(const [button,item] of buttons)button.setAttribute('aria-pressed',String(item.value===value));};
  for(const item of options){
    const button=document.createElement('button');button.type='button';button.textContent=item.label;
    button.addEventListener('click',()=>{value=item.value;onChange?.(value);refresh();ctx.refreshPreview?.();});
    buttons.push([button,item]);wrap.appendChild(button);
  }
  refresh();row.append(name,wrap);container.appendChild(row);
}
function mountControls(container,ctx){
  ctx.ui.select(container,{label:'Colour',value:settings.family,options:FAMILY_OPTIONS,onChange:v=>{settings.family=v;}});
  ctx.ui.slider(container,{label:'Gap',min:1,max:8,step:1,value:settings.gap,onInput:v=>{settings.gap=v;}});
  ctx.ui.select(container,{label:'Shadow',value:settings.shadow,options:SHADOW_OPTIONS,onChange:v=>{settings.shadow=v;}});
  toggleButtons(container,ctx,{label:'Layer',value:settings.layerMode,options:LAYER_OPTIONS,onChange:v=>{settings.layerMode=v;}});
}

S.register({
  id:'toilet-blocks',
  name:'Toilet Blocks',
  version:VERSION,
  category:'Scenery',
  status:'prototype',
  description:'Place complete three-pixel-wide portable toilet blocks with colour-family shading, angle-dependent side exposure, selectable gaps, small ground shadow and Foreground/Background occlusion.',
  supportedModes:['backdrop'],
  supportedTools:['freehand','line'],
  layers:['backdrop','foreground'],
  mountControls,
  preview:render,
  apply:render
});

})(typeof globalThis!=='undefined'?globalThis:this);
