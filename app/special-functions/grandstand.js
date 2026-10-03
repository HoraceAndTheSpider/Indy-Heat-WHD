(function(root){
'use strict';

/* Grandstand Special Function v0.1.6
 *
 * A procedural grandstand whose user-drawn Line/Curve is the front seating edge.
 * The stand extends behind that edge either towards or away from screen centre,
 * allowing the same control to behave naturally in each quarter of the circuit.
 *
 * First-pass emphasis is frame geometry.  Full occupancy reuses the established
 * Grandstand People crowd palette when available; Empty uses a simple seating deck
 * pending a later empty-stand reference pass.
 */
const S=root.IndyHeatSpecialFunctions;if(!S?.register)return;
const VERSION='0.1.6';
const settings={
  facing:'inward',
  occupancy:'full',
  layerMode:'background',
  tilt:30,
  height:7,
  depth:9,
  family:'green',
  shadow:'right-down',
  shadowLength:6
};

const FAMILY_MAP=Object.freeze({
  red:Object.freeze({main:29,light:31,dark:28,soft:30}),
  yellow:Object.freeze({main:23,light:11,dark:22,soft:21}),
  green:Object.freeze({main:25,light:27,dark:24,soft:26}),
  blue:Object.freeze({main:14,light:16,dark:12,soft:15}),
  orange:Object.freeze({main:9,light:10,dark:20,soft:22}),
  grey:Object.freeze({main:6,light:7,dark:4,soft:5})
});
const FAMILY_OPTIONS=Object.freeze([
  Object.freeze({value:'green',label:'Green'}),
  Object.freeze({value:'red',label:'Red'}),
  Object.freeze({value:'yellow',label:'Yellow'}),
  Object.freeze({value:'blue',label:'Blue'}),
  Object.freeze({value:'orange',label:'Orange'}),
  Object.freeze({value:'grey',label:'Grey'})
]);
const FACING_OPTIONS=Object.freeze([
  Object.freeze({value:'inward',label:'Inwards'}),
  Object.freeze({value:'outward',label:'Outwards'})
]);
const OCCUPANCY_OPTIONS=Object.freeze([
  Object.freeze({value:'full',label:'Full'}),
  Object.freeze({value:'empty',label:'Empty'})
]);
const LAYER_OPTIONS=Object.freeze([
  Object.freeze({value:'foreground',label:'Foreground'}),
  Object.freeze({value:'background',label:'Background'})
]);
const SHADOW_OPTIONS=Object.freeze([
  Object.freeze({value:'none',label:'None'}),
  Object.freeze({value:'left-down',label:'Left / Down'}),
  Object.freeze({value:'right-down',label:'Right / Down'})
]);

let generation=1;
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function mix32(value){let x=Number(value)>>>0;x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;x=Math.imul(x,0x846ca68b);x^=x>>>16;return x>>>0;}
function hashAt(seed,x,y,salt=0){return mix32((seed>>>0)^Math.imul((Math.round(x)+0x10001)>>>0,0x9e3779b1)^Math.imul((Math.round(y)+0x20003)>>>0,0x85ebca6b)^Math.imul((salt+1)>>>0,0xc2b2ae35));}
function inBounds(ctx,x,y){return x>=0&&y>=0&&x<ctx.width&&y<ctx.height;}
function validIndex(ctx,index){return ctx.helpers.validIndex(Number(index)||0);}
function family(){return FAMILY_MAP[settings.family]||FAMILY_MAP.green;}
function colour(role){const f=family();return f[role]??f.main;}
function roundPoint(p){return {x:Math.round(Number(p.x)||0),y:Math.round(Number(p.y)||0)};}
function uniquePoints(raw){const out=[];for(const p of raw||[]){const q={x:Number(p?.x),y:Number(p?.y)},last=out[out.length-1];if(!Number.isFinite(q.x)||!Number.isFinite(q.y))continue;if(!last||Math.abs(last.x-q.x)>.001||Math.abs(last.y-q.y)>.001)out.push(q);}return out;}
function simplifyPoints(points,epsilon=.5){
  if(points.length<3)return points;
  const keep=new Uint8Array(points.length);keep[0]=1;keep[points.length-1]=1;const e2=epsilon*epsilon,stack=[[0,points.length-1]];
  while(stack.length){const [aI,bI]=stack.pop(),a=points[aI],b=points[bI],dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;let best=-1,bestD=e2;for(let i=aI+1;i<bI;i++){const p=points[i];let t=len2?((p.x-a.x)*dx+(p.y-a.y)*dy)/len2:0;t=clamp(t,0,1);const ox=p.x-(a.x+dx*t),oy=p.y-(a.y+dy*t),d=ox*ox+oy*oy;if(d>bestD){bestD=d;best=i;}}if(best>=0){keep[best]=1;stack.push([aI,best],[best,bI]);}}
  return points.filter((_p,i)=>keep[i]);
}
function routePoints(g){if(g.tool==='line'&&g.start&&g.end)return uniquePoints([g.start,g.end]);return simplifyPoints(uniquePoints(g.points));}
function sampleRoute(points){
  const out=[];let along=0;
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<.001)continue;
    const steps=Math.max(1,Math.ceil(len));
    for(let s=0;s<=steps;s++){
      if(i&&s===0)continue;
      const t=s/steps,x=a.x+dx*t,y=a.y+dy*t,last=out[out.length-1];
      if(last)along+=Math.hypot(x-last.x,y-last.y);
      out.push({x,y,along});
    }
  }
  if(out.length<2)return out;
  for(let i=0;i<out.length;i++){
    const a=out[Math.max(0,i-2)],b=out[Math.min(out.length-1,i+2)],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
    out[i].tx=dx/len;out[i].ty=dy/len;
  }
  return out;
}
function cardinalBodyDirection(ctx,samples){
  /* Facing is deliberately quantised by the screen quarter containing the
   * FIRST point of the user's front edge.  Using the moving midpoint made the
   * side switch drift as the second point was rotated (e.g. around 10:30 rather
   * than the expected 12:00 in the top quarter).  A cardinal quarter rule keeps
   * the switch predictable: top/bottom stands switch at 12/6; left/right stands
   * switch at 3/9. */
  const anchor=samples[0],rx=anchor.x-ctx.width/2,ry=anchor.y-ctx.height/2;
  let outward;
  if(Math.abs(rx)>Math.abs(ry))outward={x:rx>=0?1:-1,y:0};
  else outward={x:0,y:ry>=0?1:-1};
  return settings.facing==='inward'?outward:{x:-outward.x,y:-outward.y}; // body extends opposite the facing direction
}
function globalBackSign(ctx,samples){
  const first=samples[0],last=samples[samples.length-1],dx=last.x-first.x,dy=last.y-first.y,len=Math.hypot(dx,dy)||1;
  const tx=dx/len,ty=dy/len,nx=-ty,ny=tx,desired=cardinalBodyDirection(ctx,samples);
  return nx*desired.x+ny*desired.y>=0?1:-1;
}
function geometryFor(ctx){
  const pts=routePoints(ctx.geometry||{}),front=sampleRoute(pts);if(front.length<2)return null;
  const height=clamp(Math.round(Number(settings.height)||7),2,16);
  const depth=clamp(Math.round(Number(settings.depth)||9),4,20);
  const tiltDeg=clamp(Number(settings.tilt)||30,10,45),rise=Math.max(1,Math.round(Math.tan(tiltDeg*Math.PI/180)*depth*.65));
  const sign=globalBackSign(ctx,front),back=[],groundBack=[],frontFoot=[],backFoot=[];
  for(const p of front){
    const nx=-p.ty*sign,ny=p.tx*sign;
    /* Depth is the ground-plane offset of the rear support from the front edge.
     * Tilt then lifts the rear seating edge vertically from that ground-plan
     * position.  Keeping these as separate operations means a straight Curve
     * has exactly the same Depth behaviour as a Line, while Tilt remains visible. */
    const ground={x:p.x+nx*depth,y:p.y+ny*depth,along:p.along,tx:p.tx,ty:p.ty};
    groundBack.push(ground);
    back.push({x:ground.x,y:ground.y-rise,along:p.along,tx:p.tx,ty:p.ty});
    frontFoot.push({x:p.x,y:p.y+height,along:p.along});
    backFoot.push({x:ground.x,y:ground.y+height,along:p.along});
  }
  return {front,back,groundBack,frontFoot,backFoot,height,depth,rise,total:front[front.length-1].along};
}
function linePoints(a,b){
  a=roundPoint(a);b=roundPoint(b);let x0=a.x,y0=a.y,x1=b.x,y1=b.y,dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1,err=dx+dy;const out=[];
  while(true){out.push({x:x0,y:y0});if(x0===x1&&y0===y1)break;const e2=2*err;if(e2>=dy){err+=dy;x0+=sx;}if(e2<=dx){err+=dx;y0+=sy;}}
  return out;
}
function setPixel(ctx,layer,x,y,index){x=Math.round(x);y=Math.round(y);if(!inBounds(ctx,x,y))return false;layer[y*ctx.width+x]=validIndex(ctx,index);return true;}
function addSetPixel(ctx,set,x,y){x=Math.round(x);y=Math.round(y);if(!inBounds(ctx,x,y))return;set.add(y*ctx.width+x);}
function fillTriangle(ctx,set,a,b,c){
  const minX=Math.max(0,Math.floor(Math.min(a.x,b.x,c.x))),maxX=Math.min(ctx.width-1,Math.ceil(Math.max(a.x,b.x,c.x)));
  const minY=Math.max(0,Math.floor(Math.min(a.y,b.y,c.y))),maxY=Math.min(ctx.height-1,Math.ceil(Math.max(a.y,b.y,c.y)));
  const edge=(p,q,x,y)=>(x-p.x)*(q.y-p.y)-(y-p.y)*(q.x-p.x),area=edge(a,b,c.x,c.y);if(Math.abs(area)<.0001)return;
  const sign=area<0?-1:1;
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
    const px=x+.5,py=y+.5;
    if(edge(a,b,px,py)*sign>=-.0001&&edge(b,c,px,py)*sign>=-.0001&&edge(c,a,px,py)*sign>=-.0001)addSetPixel(ctx,set,x,y);
  }
}
function deckPixels(ctx,g){
  const set=new Set();
  /* Rasterise the seating surface as one connected strip of adjacent quads.
   * This is important for Curve: independent front-to-back scan lines can leave
   * pinholes when their normals fan out, and can make extra Depth appear to do
   * little.  Two triangles per route interval make the actual front/back ribbon
   * continuous at every supported depth. */
  for(let i=0;i<g.front.length-1;i++){
    const f0=g.front[i],f1=g.front[i+1],b0=g.back[i],b1=g.back[i+1];
    fillTriangle(ctx,set,f0,f1,b1);fillTriangle(ctx,set,f0,b1,b0);
  }
  /* Explicitly own both boundary curves so sub-pixel triangle coverage cannot
   * nibble holes out of the first/last deck row. */
  for(const p of [...g.front,...g.back])addSetPixel(ctx,set,p.x,p.y);
  return set;
}
function drawPolyline(ctx,layer,points,index){let n=0;for(let i=0;i<points.length-1;i++)for(const p of linePoints(points[i],points[i+1]))if(setPixel(ctx,layer,p.x,p.y,index))n++;return n;}
function darkerIndex(index){
  const map={31:30,30:29,29:28,28:4,27:26,26:25,25:24,24:4,23:22,22:20,21:20,11:23,20:8,10:9,9:20,8:4,19:10,17:16,16:15,15:14,14:12,12:4,13:12,7:6,6:5,5:4,4:4,3:7,2:6,18:30,0:4,1:1};
  return Object.prototype.hasOwnProperty.call(map,index)?map[index]:4;
}
function shadowVector(){const len=clamp(Math.round(Number(settings.shadowLength)||6),1,14);return {dx:settings.shadow==='left-down'?-len:len,dy:Math.max(1,Math.round(len*.55))};}
function paintShadow(ctx,backdrop,base,g){
  if(settings.shadow==='none')return 0;
  const {dx,dy}=shadowVector(),ground=new Set();
  /* Use the real support feet.  Rear feet follow the ground-plane Depth while
   * the raised rear deck is handled separately, so high Tilt cannot detach the
   * rear-leg shadow from the ground. */
  for(let i=0;i<g.front.length;i++)for(const p of linePoints(g.frontFoot[i],g.backFoot[i]))addSetPixel(ctx,ground,p.x,p.y);
  const steps=Math.max(Math.abs(dx),Math.abs(dy),1);let count=0;
  for(const idx of ground){const x=idx%ctx.width,y=(idx/ctx.width)|0;for(let s=0;s<=steps;s++){const t=s/steps,px=Math.round(x+dx*t),py=Math.round(y+dy*t);if(!inBounds(ctx,px,py))continue;const pi=py*ctx.width+px;backdrop[pi]=validIndex(ctx,darkerIndex(base[pi]));count++;}}
  return count;
}
function crowdColour(x,y,seed){
  const C=root.IndyHeatCrowdTools;if(C?.crowdColour)return C.crowdColour(x,y,seed);
  const fallback=[3,4,7,8,9,10,12,14,15,16,18,19,21,23,24,25,29,31];return fallback[hashAt(seed,x,y,9)%fallback.length];
}
function paintDeck(ctx,backdrop,g,deckSet,seed){
  if(settings.occupancy==='full'){
    const occupancy=Number(root.IndyHeatCrowdTools?.REFERENCE_OCCUPANCY)||.995;let n=0;
    for(const idx of deckSet){const x=idx%ctx.width,y=(idx/ctx.width)|0;if((hashAt(seed,x,y,1)>>>0)/4294967296>occupancy)continue;backdrop[idx]=validIndex(ctx,crowdColour(x,y,seed));n++;}
    return n;
  }
  /* Placeholder empty geometry: neutral seating surface with sparse darker row
   * lines.  This is intentionally simple until an empty retail reference is supplied. */
  let n=0;for(const idx of deckSet){backdrop[idx]=validIndex(ctx,colour('soft'));n++;}
  for(let i=0;i<g.front.length;i+=3){for(const p of linePoints(g.front[i],g.back[i])){const x=Math.round(p.x),y=Math.round(p.y),idx=y*ctx.width+x;if(inBounds(ctx,x,y)&&deckSet.has(idx))setPixel(ctx,backdrop,x,y,colour('dark'));}}
  return n;
}
function supportIndices(g){
  const result=[0],spacing=14;let target=spacing;
  for(let i=1;i<g.front.length-1;i++){if(g.front[i].along>=target){result.push(i);target+=spacing;}}
  if(result[result.length-1]!==g.front.length-1)result.push(g.front.length-1);return result;
}
function paintSupport(ctx,backdrop,top,bottom,role='dark'){
  for(const p of linePoints(top,bottom))setPixel(ctx,backdrop,p.x,p.y,colour(role));
  setPixel(ctx,backdrop,bottom.x-1,bottom.y,colour(role));setPixel(ctx,backdrop,bottom.x+1,bottom.y,colour(role));
}
function interpolatePoint(a,b,t){return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
function deckBoundaryPixels(ctx,g){
  const set=new Set();
  const addLine=(a,b)=>{for(const p of linePoints(a,b))addSetPixel(ctx,set,p.x,p.y);};
  for(let i=0;i<g.front.length-1;i++){addLine(g.front[i],g.front[i+1]);addLine(g.back[i],g.back[i+1]);}
  addLine(g.front[0],g.back[0]);addLine(g.front[g.front.length-1],g.back[g.back.length-1]);
  return set;
}
function drawOutsidePolyline(ctx,layer,points,index,deck){
  let n=0;
  for(let i=0;i<points.length-1;i++)for(const p of linePoints(points[i],points[i+1])){
    const x=Math.round(p.x),y=Math.round(p.y);if(!inBounds(ctx,x,y)||deck.has(y*ctx.width+x))continue;
    if(setPixel(ctx,layer,x,y,index))n++;
  }
  return n;
}
function exteriorDeckEdges(g,amount=1){
  const front=[],back=[];
  for(let i=0;i<g.front.length;i++){
    const f=g.front[i],b=g.back[i],dx=b.x-f.x,dy=b.y-f.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;
    front.push({x:f.x-ux*amount,y:f.y-uy*amount});
    back.push({x:b.x+ux*amount,y:b.y+uy*amount});
  }
  return {front,back};
}
function exteriorEndEdge(g,which,amount=1){
  const last=g.front.length-1,i=which==='first'?0:last,j=which==='first'?Math.min(1,last):Math.max(0,last-1);
  const a=g.front[i],near=g.front[j],dx=a.x-near.x,dy=a.y-near.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len;
  return [{x:g.front[i].x+ux*amount,y:g.front[i].y+uy*amount},{x:g.back[i].x+ux*amount,y:g.back[i].y+uy*amount}];
}
function paintFrame(ctx,backdrop,g){
  const supports=supportIndices(g),frontAvg=g.front.reduce((sum,p)=>sum+p.y,0)/g.front.length,backAvg=g.back.reduce((sum,p)=>sum+p.y,0)/g.back.length;
  const near=frontAvg>=backAvg?'front':'back',far=near==='front'?'back':'front';
  const farPts=g[far],nearPts=g[near],farFeet=far==='front'?g.frontFoot:g.backFoot,nearFeet=near==='front'?g.frontFoot:g.backFoot;
  const deck=deckPixels(ctx,g),boundary=deckBoundaryPixels(ctx,g),interior=new Set();
  for(const idx of deck)if(!boundary.has(idx))interior.add(idx);

  /* Continuous deck base first. */
  for(const idx of deck)backdrop[idx]=validIndex(ctx,colour('soft'));

  /* Far framework sits behind the seating plane.  Rear supports now terminate at
   * their actual ground feet, so increasing Tilt makes them visibly longer. */
  for(const i of supports)paintSupport(ctx,backdrop,farPts[i],farFeet[i],'dark');
  if(supports.length>1){
    const beam=farPts.map((p,i)=>interpolatePoint(p,farFeet[i],.62));drawPolyline(ctx,backdrop,beam,colour('dark'));
  }

  /* Endpoint side bracing uses the true feet of both front and rear supports. */
  for(const i of [supports[0],supports[supports.length-1]]){
    const f=g.front[i],b=g.back[i],ff=g.frontFoot[i],bf=g.backFoot[i];
    for(const p of linePoints(f,bf))setPixel(ctx,backdrop,p.x,p.y,colour('dark'));
    for(const p of linePoints(b,ff))setPixel(ctx,backdrop,p.x,p.y,colour('dark'));
  }

  /* Near framework remains visible below the front edge. */
  for(const i of supports)paintSupport(ctx,backdrop,nearPts[i],nearFeet[i],'main');
  if(supports.length>1){
    const beam=nearPts.map((p,i)=>interpolatePoint(p,nearFeet[i],.58));drawPolyline(ctx,backdrop,beam,colour('dark'));
  }

  /* Draw the frame first.  For a full grandstand the crowd then owns EVERY
   * seating-surface pixel, including the rasterised boundary.  This prevents a
   * shallow Curve from leaving an end/perimeter frame pixel visibly cutting
   * through the crowd when the curved ribbon rounds onto the pixel grid. */
  drawPolyline(ctx,backdrop,g.front,colour('main'));
  drawPolyline(ctx,backdrop,g.back,colour('light'));
  for(const pair of [[g.front[0],g.back[0]],[g.front[g.front.length-1],g.back[g.back.length-1]]])for(const p of linePoints(pair[0],pair[1]))setPixel(ctx,backdrop,p.x,p.y,colour('main'));
  drawPolyline(ctx,backdrop,g.front.map(p=>({x:p.x,y:p.y+1})),colour('dark'));

  const seed=mix32(0x4752414e^Math.imul(generation,0x9e3779b1)^Math.imul(Math.round(g.front[0].x)+1,0x85ebca6b)^Math.imul(Math.round(g.front[0].y)+1,0xc2b2ae35));
  if(settings.occupancy==='full'){
    const occupied=paintDeck(ctx,backdrop,g,deck,seed);
    /* Restore the visible frame rim one pixel OUTSIDE the seating ribbon only.
     * The deck mask is an explicit guard: no frame pixel from these outline
     * passes is ever allowed to overwrite crowd, even on very shallow curves. */
    const outer=exteriorDeckEdges(g,1);
    drawOutsidePolyline(ctx,backdrop,outer.front,colour('main'),deck);
    drawOutsidePolyline(ctx,backdrop,outer.back,colour('light'),deck);
    for(const which of ['first','last']){
      const edge=exteriorEndEdge(g,which,1);
      drawOutsidePolyline(ctx,backdrop,edge,colour('main'),deck);
    }
    return occupied;
  }
  return paintDeck(ctx,backdrop,g,interior,seed);
}

function applyOcclusionMask(ctx,mask,beforeStructure,backdrop,g){
  const value=settings.layerMode==='foreground'?0:1; // raw 0 = Foreground, raw 1 = Background
  const indices=deckPixels(ctx,g);
  for(let i=0;i<backdrop.length;i++)if(beforeStructure[i]!==backdrop[i])indices.add(i);
  let changed=0;
  for(const i of indices){if(mask[i]!==value)changed++;mask[i]=value;}
  return {written:indices.size,changed,value};
}
function ensureToggleStyle(){
  if(typeof document==='undefined'||document.getElementById('indyheatGrandstandToggleStyle'))return;
  const style=document.createElement('style');style.id='indyheatGrandstandToggleStyle';
  style.textContent=`.grandstandToggle{display:inline-flex;gap:3px;justify-content:flex-end;flex-wrap:wrap}.grandstandToggle button{padding:2px 7px;min-height:22px;font-size:10px}.grandstandToggle button[aria-pressed="true"]{border-color:#d6b54a;background:#40391f;box-shadow:inset 0 0 0 1px #8f792f}`;
  document.head.appendChild(style);
}
function toggleButtons(container,ctx,{label,value,options,onChange}){
  if(typeof document==='undefined'||!container?.appendChild){
    ctx.ui.select(container,{label,value,options,onChange});return;
  }
  ensureToggleStyle();
  const row=document.createElement('div');row.className='specialControlRow';
  const name=document.createElement('span');name.textContent=label;
  const wrap=document.createElement('span');wrap.className='grandstandToggle';
  const buttons=[];
  const refresh=()=>{for(const [button,item] of buttons)button.setAttribute('aria-pressed',String(item.value===value));};
  for(const item of options){
    const button=document.createElement('button');button.type='button';button.textContent=item.label;
    button.addEventListener('click',()=>{value=item.value;onChange?.(value);refresh();ctx.requestRedraw?.();});
    buttons.push([button,item]);wrap.appendChild(button);
  }
  refresh();row.append(name,wrap);container.appendChild(row);
}
function render(ctx){
  const g=geometryFor(ctx);if(!g)return {message:'Grandstand: draw a Line or Curve for the front edge.'};
  const backdrop=ctx.layer('backdrop'),foreground=ctx.layer('foreground'),base=ctx.baseLayer?ctx.baseLayer('backdrop'):Uint8Array.from(backdrop);
  const shadowPx=paintShadow(ctx,backdrop,base,g),beforeStructure=Uint8Array.from(backdrop),crowdPx=paintFrame(ctx,backdrop,g);
  const occ=applyOcclusionMask(ctx,foreground,beforeStructure,backdrop,g);
  if(ctx.phase==='apply')generation++;
  return {message:`Grandstand committed · ${settings.facing} · ${settings.layerMode} · tilt ${Math.round(settings.tilt)}° · height ${g.height}px · depth ${g.depth}px · ${settings.occupancy}${settings.occupancy==='full'?` · ${crowdPx} crowd px`:''} · mask ${occ.written} px${settings.shadow!=='none'?` · shadow ${shadowPx} px`:''}.`};
}
function remount(container,ctx){container.replaceChildren();mountControls(container,ctx);ctx.requestRedraw?.();}
function mountControls(container,ctx){
  toggleButtons(container,ctx,{label:'Facing',value:settings.facing,options:FACING_OPTIONS,onChange:v=>{settings.facing=v;}});
  toggleButtons(container,ctx,{label:'Grandstand',value:settings.occupancy,options:OCCUPANCY_OPTIONS,onChange:v=>{settings.occupancy=v;}});
  toggleButtons(container,ctx,{label:'Layer',value:settings.layerMode,options:LAYER_OPTIONS,onChange:v=>{settings.layerMode=v;}});
  ctx.ui.slider(container,{label:'Tilt',min:10,max:45,step:1,value:settings.tilt,onInput:v=>{settings.tilt=v;}});
  ctx.ui.slider(container,{label:'Height',min:2,max:16,step:1,value:settings.height,onInput:v=>{settings.height=v;}});
  ctx.ui.slider(container,{label:'Depth',min:4,max:20,step:1,value:settings.depth,onInput:v=>{settings.depth=v;}});
  ctx.ui.select(container,{label:'Frame colour',value:settings.family,options:FAMILY_OPTIONS,onChange:v=>{settings.family=v;}});
  ctx.ui.select(container,{label:'Shadow',value:settings.shadow,options:SHADOW_OPTIONS,onChange:v=>{settings.shadow=v;remount(container,ctx);}});
  if(settings.shadow!=='none')ctx.ui.slider(container,{label:'Shadow length',min:1,max:14,step:1,value:settings.shadowLength,onInput:v=>{settings.shadowLength=v;}});
}

S.register({
  id:'grandstand',
  name:'Grandstand',
  version:VERSION,
  category:'Scenery',
  status:'prototype',
  description:'Build a framed grandstand from a Line/Curve front edge, with screen-centre-aware inward/outward facing, Foreground/Background occlusion, adjustable tilt/height/depth, colour families, occupancy and grounded shadow.',
  supportedModes:['backdrop'],
  supportedTools:['line','curve'],
  layers:['backdrop','foreground'],
  mountControls,
  preview:render,
  apply:render
});

})(typeof globalThis!=='undefined'?globalThis:this);
