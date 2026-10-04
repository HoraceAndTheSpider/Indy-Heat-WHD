(function(root){
'use strict';

/* Parapet Walls Special Function.
 *
 * Pencil / Line / Curve define the wall base. The wall rises vertically
 * upward from the route, matching the low-resolution construction used by
 * the supplied Indy Heat reference brush:
 *
 *   light top edge
 *   main wall face
 *   optional darker lower edge
 *
 * Optional alternate colour families switch in blocks along the route.
 * Periodic detail can be a darker vertical joint or a true one-pixel gap.
 * The ground shadow uses the same relative Backdrop-darkening approach as
 * Overhead Advert Board and never touches Foreground/Surface by itself.
 */
const S=root.IndyHeatSpecialFunctions;if(!S?.register)return;

const VERSION='1.001';
const COLLISION=1;
const MASK_FOREGROUND=0;
const MASK_BACKGROUND=1;

const settings={
  family:'grey',
  height:4,
  lowerShade:true,
  alternate:false,
  alternateFamily:'red',
  alternateLength:10,
  detailMode:'none',
  detailSpacing:10,
  shadow:false,
  shadowDirection:'right',
  shadowLength:5,
  shadowDrop:3,
  ditherJoins:false,
  foreground:'foreground',
  collision:true
};

const FAMILY_OPTIONS=Object.freeze([
  Object.freeze({value:'grey',label:'Grey'}),
  Object.freeze({value:'white',label:'White'}),
  Object.freeze({value:'red',label:'Red'}),
  Object.freeze({value:'yellow',label:'Yellow'}),
  Object.freeze({value:'green',label:'Green'}),
  Object.freeze({value:'blue',label:'Blue'}),
  Object.freeze({value:'orange',label:'Orange'})
]);
const FAMILY_MAP=Object.freeze({
  // Grey and red are taken directly from the supplied parapet-wall IHBR.
  grey:Object.freeze({top:7,face:5,dark:4,mid:6}),
  white:Object.freeze({top:3,face:7,dark:5,mid:6}),
  red:Object.freeze({top:18,face:29,dark:28,mid:30}),
  yellow:Object.freeze({top:11,face:23,dark:22,mid:21}),
  green:Object.freeze({top:27,face:25,dark:24,mid:26}),
  blue:Object.freeze({top:16,face:14,dark:12,mid:15}),
  orange:Object.freeze({top:10,face:9,dark:8,mid:20})
});
const DETAIL_OPTIONS=Object.freeze([
  Object.freeze({value:'none',label:'None'}),
  Object.freeze({value:'line',label:'Vertical lines'}),
  Object.freeze({value:'gap',label:'Transparent gaps'})
]);
const SHADOW_DIR_OPTIONS=Object.freeze([
  Object.freeze({value:'right',label:'Cast right'}),
  Object.freeze({value:'left',label:'Cast left'})
]);
const FG_OPTIONS=Object.freeze([
  Object.freeze({value:'none',label:'None (leave existing)'}),
  Object.freeze({value:'background',label:'Set background'}),
  Object.freeze({value:'half',label:'Set 50%'}),
  Object.freeze({value:'foreground',label:'Set foreground'})
]);
const WALL_COLOURS=Object.freeze(new Set(Object.values(FAMILY_MAP).flatMap(f=>[f.top,f.face,f.dark,f.mid])));

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function inBounds(w,h,x,y){return x>=0&&y>=0&&x<w&&y<h;}
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
  return uniquePoints(g?.points);
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
  const t=seg.len>0?clamp((d-seg.start)/seg.len,0,1):0;
  return {x:seg.a.x+seg.dx*t,y:seg.a.y+seg.dy*t,along:d};
}
function routeSamples(points){
  if(!points.length)return [];
  if(points.length===1)return [{x:Math.round(points[0].x),y:Math.round(points[0].y),along:0}];
  const built=buildSegments(points);if(!built.segments.length)return [{x:Math.round(points[0].x),y:Math.round(points[0].y),along:0}];
  const count=Math.max(1,Math.ceil(built.total)),out=[],seen=new Set();
  for(let n=0;n<=count;n++){
    const d=n===count?built.total:Math.min(built.total,n),p=routeAt(built,d);if(!p)continue;
    const x=Math.round(p.x),y=Math.round(p.y),key=`${x},${y}`;
    if(seen.has(key))continue;seen.add(key);out.push({x,y,along:d});
  }
  return out;
}
function family(name){return FAMILY_MAP[name]||FAMILY_MAP.grey;}
function familyAt(along){
  if(!settings.alternate)return family(settings.family);
  const span=clamp(Math.round(Number(settings.alternateLength)||10),2,32);
  return ((Math.floor((Number(along)+.001)/span)&1)===0)?family(settings.family):family(settings.alternateFamily);
}
function wallHeight(){return clamp(Math.round(Number(settings.height)||4),3,12);}
function wallTop(baseY,height=wallHeight()){return Math.round(baseY)-height+1;}
function setBackdrop(ctx,pixels,x,y,index){
  x=Math.round(x);y=Math.round(y);if(!inBounds(ctx.width,ctx.height,x,y))return false;
  pixels[y*ctx.width+x]=ctx.helpers.validIndex(Number(index)||0);return true;
}
function setForegroundPixel(ctx,foreground,x,y,top,bottom){
  const mode=settings.foreground;
  if(mode==='none')return;
  x=Math.round(x);y=Math.round(y);if(!inBounds(ctx.width,ctx.height,x,y))return;
  const i=y*ctx.width+x;
  if(mode==='background'){foreground[i]=MASK_BACKGROUND;return;}
  if(mode==='foreground'){foreground[i]=MASK_FOREGROUND;return;}
  if(mode==='half')foreground[i]=y<=Math.floor((top+bottom)/2)?MASK_FOREGROUND:MASK_BACKGROUND;
}
function setCollisionAt(ctx,surface,x,y){
  if(!settings.collision)return;
  const helper=ctx.helpersFor('surface'),p=helper.screenToLayer(x,y);if(!p)return;
  const info=ctx.layerInfo('surface');surface[p.y*info.width+p.x]=COLLISION;
}
function detailAt(sample,total){
  const mode=settings.detailMode;if(mode==='none')return null;
  const spacing=clamp(Math.round(Number(settings.detailSpacing)||10),3,32),along=Number(sample.along)||0;
  // Keep both physical ends solid; periodic detail belongs between them.
  if(along<.75||along>Math.max(0,total-.75))return null;
  const nearest=Math.round(along/spacing)*spacing;
  return Math.abs(along-nearest)<=.5?mode:null;
}
function rowColour(f,row,height){
  if(row===0)return f.top;
  if(settings.lowerShade&&row===height-1)return f.dark;
  return f.face;
}
function getBackdrop(layer,width,x,y){
  x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=width)return null;
  const i=y*width+x;return i>=0&&i<layer.length?Number(layer[i]):null;
}
function linePoints(a,b){
  let x0=Math.round(a.x),y0=Math.round(a.y),x1=Math.round(b.x),y1=Math.round(b.y),dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1,err=dx+dy;
  const out=[];
  while(true){out.push({x:x0,y:y0});if(x0===x1&&y0===y1)break;const e2=2*err;if(e2>=dy){err+=dy;x0+=sx;}if(e2<=dx){err+=dx;y0+=sy;}}
  return out;
}
function shadowShift(){
  const dx=(settings.shadowDirection==='left'?-1:1)*clamp(Math.round(Number(settings.shadowLength)||5),1,16);
  const dy=clamp(Math.round(Number(settings.shadowDrop)||3),0,16);
  return {dx,dy};
}
function shadowIndex(index){
  index=Number(index)||0;
  const map={
    31:30,30:29,29:28,28:4,
    27:26,26:25,25:24,24:4,
    23:22,22:20,21:20,11:23,
    20:8,10:9,9:20,8:4,19:10,
    17:16,16:15,15:14,14:12,12:4,13:12,
    7:6,6:5,5:4,4:4,
    3:7,2:6,18:30
  };
  return Object.prototype.hasOwnProperty.call(map,index)?map[index]:4;
}
function paintShadow(ctx,backdrop,sourceBackdrop,samples,total){
  if(!settings.shadow)return 0;
  const {dx,dy}=shadowShift();let count=0;
  for(const sample of samples){
    if(detailAt(sample,total)==='gap')continue;
    for(const p of linePoints(sample,{x:sample.x+dx,y:sample.y+dy})){
      const src=getBackdrop(sourceBackdrop,ctx.width,p.x,p.y);if(src==null)continue;
      if(setBackdrop(ctx,backdrop,p.x,p.y,shadowIndex(src)))count++;
    }
  }
  return count;
}
function matchWallProfile(rows){
  if(!rows?.length)return null;
  let best=null;
  for(const [name,f] of Object.entries(FAMILY_MAP)){
    // The top-edge colour is the strongest signal. Requiring it prevents a
    // flat road/grass colour that happens to share a palette index with one
    // wall face from being mistaken for an adjacent parapet.
    if(rows[0]!==f.top)continue;
    let score=3;
    for(let r=1;r<rows.length;r++){
      const v=rows[r],last=r===rows.length-1;
      if(last&&(v===f.dark||v===f.face)){score+=2;continue;}
      if(v===f.face){score+=2;continue;}
      if(v===f.mid){score+=1;continue;}
    }
    if(!best||score>best.score)best={name,f,score};
  }
  return best;
}
function wallProfile(source,width,x,baseY,height){
  const top=baseY-height+1,rows=[];
  for(let r=0;r<height;r++)rows.push(getBackdrop(source,width,x,top+r));
  const match=matchWallProfile(rows);
  return {rows,match};
}
function detectAdjacentWall(ctx,source,endpoint,interior,height){
  if(!settings.ditherJoins||!endpoint)return null;
  let best=null;
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
    if(dx===0&&dy===0)continue;
    const x=endpoint.x+dx,y=endpoint.y+dy;
    if(!inBounds(ctx.width,ctx.height,x,y))continue;
    if(interior&&x===interior.x&&y===interior.y)continue;
    const p=wallProfile(source,ctx.width,x,y,height);if(!p.match)continue;
    const score=p.match.score*10-Math.hypot(dx,dy);
    if(!best||score>best.score)best={x,y,rows:p.rows,score,family:p.match.name};
  }
  return best;
}
function buildDitherPlans(ctx,source,samples,height){
  const plans=new Map();if(!settings.ditherJoins||samples.length<2)return plans;
  const first=detectAdjacentWall(ctx,source,samples[0],samples[1],height);
  const last=detectAdjacentWall(ctx,source,samples[samples.length-1],samples[samples.length-2],height);
  function add(fromStart,join){
    if(!join)return;
    const limit=Math.min(3,samples.length);
    for(let d=0;d<limit;d++){
      const index=fromStart?d:samples.length-1-d;
      if(!plans.has(index)||d<(plans.get(index).distance??99))plans.set(index,{distance:d,rows:join.rows});
    }
  }
  add(true,first);add(false,last);return plans;
}
function ditherColour(base,f,row,height,plan){
  if(!plan)return base;
  const adjacent=plan.rows?.[row];
  let use=false;
  if(plan.distance===0)use=((row&1)===0);
  else if(plan.distance===1)use=((row+1)%3===0);
  else use=(row===Math.floor(height/2));
  if(!use)return base;
  if(WALL_COLOURS.has(adjacent)&&adjacent!==base)return adjacent;
  // Same-family joins still get a tiny intermediate pixel so the join reads
  // rather than disappearing entirely.
  return f.mid!==base?f.mid:f.top;
}
function paintWallColumn(ctx,backdrop,foreground,sample,total,plan){
  const height=wallHeight(),top=wallTop(sample.y,height),bottom=Math.round(sample.y),detail=detailAt(sample,total),f=familyAt(sample.along);
  if(detail==='gap')return {painted:0,gap:true,top,bottom,height};
  let painted=0;
  for(let row=0;row<height;row++){
    let value=detail==='line'?f.dark:rowColour(f,row,height);
    value=ditherColour(value,f,row,height,plan);
    const y=top+row;
    if(setBackdrop(ctx,backdrop,sample.x,y,value)){
      setForegroundPixel(ctx,foreground,sample.x,y,top,bottom);painted++;
    }
  }
  return {painted,gap:false,top,bottom,height};
}
function render(ctx){
  const points=routePoints(ctx.geometry);if(!points.length)return {message:'Parapet Walls: draw with Pencil, Line or Curve.'};
  const backdrop=ctx.layer('backdrop'),foreground=ctx.layer('foreground'),surface=ctx.layer('surface'),sourceBackdrop=backdrop.slice?backdrop.slice():Uint8Array.from(backdrop),samples=routeSamples(points);
  if(!samples.length)return {message:'Parapet Walls: route is empty.'};
  const built=buildSegments(points),total=built.total||0,height=wallHeight(),ditherPlans=buildDitherPlans(ctx,sourceBackdrop,samples,height);

  // Shadow is ground-plane Backdrop darkening only and is calculated from the
  // untouched source so overlapping projected samples do not progressively darken.
  const shadowPx=paintShadow(ctx,backdrop,sourceBackdrop,samples,total);

  let wallPx=0,gaps=0,joins=0;
  for(let i=0;i<samples.length;i++){
    const sample=samples[i],plan=ditherPlans.get(i),result=paintWallColumn(ctx,backdrop,foreground,sample,total,plan);
    if(result.gap){gaps++;continue;}
    wallPx+=result.painted;if(plan)joins++;
    setCollisionAt(ctx,surface,sample.x,sample.y);
  }

  const maskLabel=settings.foreground==='none'?'leave existing':settings.foreground==='background'?'set background':settings.foreground==='foreground'?'set foreground':'set 50%';
  return {message:`Parapet Walls committed · ${samples.length} route px · height ${height}px${settings.lowerShade?' · lower shade':''}${settings.alternate?` · alternate ${settings.alternateLength}px`:''}${settings.detailMode==='line'?` · periodic lines ${settings.detailSpacing}px`:settings.detailMode==='gap'?` · gaps ${settings.detailSpacing}px`:''}${settings.shadow?` · ground shadow ${settings.shadowDirection} ${settings.shadowLength}/${settings.shadowDrop}`:''}${settings.ditherJoins?` · dither joins ${joins?'applied':'none detected'}`:''}${settings.collision?' · collision':''} · ${maskLabel}.`};
}
function mountControls(container,ctx){
  ctx.ui.select(container,{label:'Wall colour',value:settings.family,options:FAMILY_OPTIONS,onChange:value=>{settings.family=value;}});
  ctx.ui.slider(container,{label:'Wall height',min:3,max:12,step:1,value:settings.height,onInput:value=>{settings.height=value;}});
  ctx.ui.checkbox(container,{label:'Darker lower line',checked:settings.lowerShade,onChange:value=>{settings.lowerShade=value;}});
  ctx.ui.checkbox(container,{label:'Alternate colour',checked:settings.alternate,onChange:value=>{settings.alternate=value;}});
  ctx.ui.select(container,{label:'Alternate family',value:settings.alternateFamily,options:FAMILY_OPTIONS,onChange:value=>{settings.alternateFamily=value;}});
  ctx.ui.slider(container,{label:'Alternate length',min:2,max:32,step:1,value:settings.alternateLength,onInput:value=>{settings.alternateLength=value;}});
  ctx.ui.select(container,{label:'Periodic detail',value:settings.detailMode,options:DETAIL_OPTIONS,onChange:value=>{settings.detailMode=value;}});
  ctx.ui.slider(container,{label:'Detail spacing',min:3,max:32,step:1,value:settings.detailSpacing,onInput:value=>{settings.detailSpacing=value;}});
  ctx.ui.checkbox(container,{label:'Shadow',checked:settings.shadow,onChange:value=>{settings.shadow=value;}});
  ctx.ui.select(container,{label:'Shadow direction',value:settings.shadowDirection,options:SHADOW_DIR_OPTIONS,onChange:value=>{settings.shadowDirection=value;}});
  ctx.ui.slider(container,{label:'Shadow length',min:1,max:12,step:1,value:settings.shadowLength,onInput:value=>{settings.shadowLength=value;}});
  ctx.ui.slider(container,{label:'Shadow drop',min:0,max:12,step:1,value:settings.shadowDrop,onInput:value=>{settings.shadowDrop=value;}});
  ctx.ui.checkbox(container,{label:'Dither joins',checked:settings.ditherJoins,onChange:value=>{settings.ditherJoins=value;}});
  ctx.ui.select(container,{label:'Occlusion',value:settings.foreground,options:FG_OPTIONS,onChange:value=>{settings.foreground=value;}});
  ctx.ui.checkbox(container,{label:'Set collision',checked:settings.collision,onChange:value=>{settings.collision=value;}});
}

S.register({
  id:'parapet-walls',
  name:'Parapet Walls',
  version:VERSION,
  category:'Scenery',
  status:'prototype',
  description:'Low solid parapet walls for Pencil/Line/Curve with 3–12 px height, light top edge, optional dark lower edge, colour-family alternation, periodic dark joints or transparent gaps, optional ground-projected shadow, conservative adjacent-wall join dithering, explicit occlusion modes and Surface collision.',
  supportedModes:['backdrop'],
  supportedTools:['freehand','line','curve'],
  layers:['backdrop','foreground','surface'],
  mountControls,
  preview:render,
  apply:render
});

})(typeof globalThis!=='undefined'?globalThis:this);
