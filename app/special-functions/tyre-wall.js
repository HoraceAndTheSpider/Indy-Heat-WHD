(function(root){
'use strict';

/* Tyre Wall Special Function.
 *
 * Derived from:
 *   Tyre_with_shadow.ihbrush
 *   Tyrewall_Colours.ihbrush
 *   Tyrewall_Group.ihbrush
 *   Tyre_Wall_multicolour-EXAMPLE.ihbrush
 *
 * Line/Curve place one fixed-orientation tyre along the ordered path.
 * Rectangle/Ellipse/Fill extend the supplied three-tyre group as continuous
 * staggered rows. Row 1 starts at X 0 with 5 px tyre pitch, row 2 at X +3
 * and Y +3, row 3 returns to the row-1 alignment, and so on. This preserves
 * the exact 2x1 reference relationship while allowing 3x2, 4x3 and any odd
 * or even number of rows. The two overlap-depth pixels are darkened whenever
 * a tyre exists in the immediately following/front row.
 */
const S=root.IndyHeatSpecialFunctions;if(!S?.register)return;

const VERSION='0.1.1';
const COLLISION=1;
const settings={colourA:'grey',colourB:'red',runLength:3,foreground:'half',collision:true};

const COLOURS=Object.freeze({
  grey:Object.freeze({label:'Grey',outer:4,inner:5,darker:1}),
  red:Object.freeze({label:'Red',outer:28,inner:30,darker:1}),
  darkGreen:Object.freeze({label:'Dark green',outer:24,inner:25,darker:1}),
  yellow:Object.freeze({label:'Yellow',outer:22,inner:21,darker:20}),
  orange:Object.freeze({label:'Orange',outer:20,inner:22,darker:8}),
  green:Object.freeze({label:'Green',outer:25,inner:26,darker:24}),
  lightRed:Object.freeze({label:'Light red',outer:29,inner:31,darker:28}),
  blue:Object.freeze({label:'Blue',outer:14,inner:13,darker:12}),
  darkBlue:Object.freeze({label:'Dark blue',outer:12,inner:14,darker:1}),
  white:Object.freeze({label:'White',outer:7,inner:3,darker:6})
});
const COLOUR_OPTIONS=Object.freeze(Object.entries(COLOURS).map(([value,q])=>Object.freeze({value,label:q.label})));
const FG_OPTIONS=Object.freeze([
  Object.freeze({value:'none',label:'0%'}),
  Object.freeze({value:'half',label:'50%'}),
  Object.freeze({value:'full',label:'100%'})
]);

/* Exact source pattern. O=outer tyre shade, I=inner tyre shade, K=black.
   Body is the non-transparent portion within local X 0..4 / Y 0..4.
   Remaining K pixels are the supplied cast shadow. */
const TYRE=Object.freeze([
  '.OOO...',
  'OKKKO..',
  'OIIIO..',
  'KOOOO..',
  'OIIIOK.',
  '.OOOKKK',
  '..KKKK.',
  '....K..'
]);
const TYRE_W=7,TYRE_H=8,HOT_X=3,HOT_Y=3;
const AREA_X_PITCH=5;
const AREA_Y_PITCH=3;
const AREA_ROW_OFFSET=3;
const OVERLAP_DARKEN_X=Object.freeze([0,4]);

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function inBounds(w,h,x,y){return x>=0&&y>=0&&x<w&&y<h;}
function tyreColour(name){return COLOURS[name]||COLOURS.grey;}
function colourForOccurrence(index){
  const run=clamp(Math.round(Number(settings.runLength)||1),1,20),block=Math.floor(Math.max(0,index)/run);
  return tyreColour((block&1)?settings.colourB:settings.colourA);
}
function tokenValue(token,colour){
  if(token==='O')return colour.outer;
  if(token==='I')return colour.inner;
  if(token==='K')return 1;
  return null;
}
function bodyToken(x,y){return x>=0&&x<5&&y>=0&&y<5&&TYRE[y][x]!=='.';}
function point(p){return p&&Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.y))?{x:Number(p.x),y:Number(p.y)}:null;}
function uniquePoints(points){const out=[];let last=null;for(const p0 of points||[]){const p=point(p0);if(!p)continue;const x=Math.round(p.x),y=Math.round(p.y);if(last&&last.x===x&&last.y===y)continue;last={x,y};out.push(last);}return out;}

function rectangleMask(ctx,start,end){
  const mask=new Uint8Array(ctx.width*ctx.height),x0=Math.max(0,Math.min(Math.round(start.x),Math.round(end.x))),x1=Math.min(ctx.width-1,Math.max(Math.round(start.x),Math.round(end.x))),y0=Math.max(0,Math.min(Math.round(start.y),Math.round(end.y))),y1=Math.min(ctx.height-1,Math.max(Math.round(start.y),Math.round(end.y)));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)mask[y*ctx.width+x]=1;return mask;
}
function ellipseMask(ctx,start,end){
  const mask=new Uint8Array(ctx.width*ctx.height),x0=Math.max(0,Math.min(Math.round(start.x),Math.round(end.x))),x1=Math.min(ctx.width-1,Math.max(Math.round(start.x),Math.round(end.x))),y0=Math.max(0,Math.min(Math.round(start.y),Math.round(end.y))),y1=Math.min(ctx.height-1,Math.max(Math.round(start.y),Math.round(end.y)));
  const cx=(x0+x1)/2,cy=(y0+y1)/2,rx=Math.max(.5,(x1-x0+1)/2),ry=Math.max(.5,(y1-y0+1)/2);
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const dx=(x-cx)/rx,dy=(y-cy)/ry;if(dx*dx+dy*dy<=1.0001)mask[y*ctx.width+x]=1;}return mask;
}
function pointsMask(ctx,points){const mask=new Uint8Array(ctx.width*ctx.height);for(const p0 of points||[]){const p=point(p0);if(!p)continue;const x=Math.round(p.x),y=Math.round(p.y);if(inBounds(ctx.width,ctx.height,x,y))mask[y*ctx.width+x]=1;}return mask;}
function areaMask(ctx){
  const g=ctx.geometry;if(!g)return null;
  if(g.tool==='fill')return pointsMask(ctx,g.points);
  if(!g.start||!g.end)return null;
  if(g.tool==='rectangle'||g.tool==='rectangle-filled')return rectangleMask(ctx,g.start,g.end);
  if(g.tool==='ellipse'||g.tool==='ellipse-filled')return ellipseMask(ctx,g.start,g.end);
  return null;
}
function maskBounds(mask,w,h){
  let x0=w,y0=h,x1=-1,y1=-1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(mask[y*w+x]){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
  return x1>=x0?{x0,y0,x1,y1}:null;
}

function makeTyre(colour){
  const pixels=new Int16Array(TYRE_W*TYRE_H);pixels.fill(-1);const body=new Uint8Array(TYRE_W*TYRE_H);
  for(let y=0;y<TYRE_H;y++)for(let x=0;x<TYRE_W;x++){
    const value=tokenValue(TYRE[y][x],colour);if(value==null)continue;const i=y*TYRE_W+x;pixels[i]=value;if(bodyToken(x,y))body[i]=1;
  }
  return {pixels,body};
}
function setForegroundForBody(foreground,w,h,x,y,localY,mode){
  if(mode==='none'||!inBounds(w,h,x,y))return;
  if(mode==='full'||localY<=2)foreground[y*w+x]=1;
}
function setCollisionAt(ctx,surface,x,y){
  if(!settings.collision)return;const helper=ctx.helpersFor('surface'),p=helper.screenToLayer(x,y);if(!p)return;surface[p.y*ctx.layerInfo('surface').width+p.x]=COLLISION;
}
function paintTyre(ctx,backdrop,foreground,surface,anchor,colour){
  const sprite=makeTyre(colour),ox=Math.round(anchor.x)-HOT_X,oy=Math.round(anchor.y)-HOT_Y;let bodyPx=0;
  for(let sy=0;sy<TYRE_H;sy++)for(let sx=0;sx<TYRE_W;sx++){
    const si=sy*TYRE_W+sx,value=sprite.pixels[si];if(value<0)continue;const x=ox+sx,y=oy+sy;if(!inBounds(ctx.width,ctx.height,x,y))continue;backdrop[y*ctx.width+x]=value;
    if(sprite.body[si]){bodyPx++;setForegroundForBody(foreground,ctx.width,ctx.height,x,y,sy,settings.foreground);setCollisionAt(ctx,surface,x,y);}
  }
  return bodyPx;
}
function tangentSpacing(dx,dy){const len=Math.hypot(dx,dy);if(len<1e-9)return 6;return 5+Math.abs(dx)/len;}
function pathAnchors(points){
  const pts=uniquePoints(points);if(!pts.length)return [];if(pts.length===1)return [pts[0]];
  const out=[{x:pts[0].x,y:pts[0].y}],seen=new Set([`${pts[0].x},${pts[0].y}`]);let carry=0;
  for(let i=1;i<pts.length;i++){
    let ax=pts[i-1].x,ay=pts[i-1].y,bx=pts[i].x,by=pts[i].y,dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy);if(len<1e-9)continue;let ux=dx/len,uy=dy/len,remain=len,target=tangentSpacing(dx,dy);
    while(carry+remain>=target){const need=target-carry;ax+=ux*need;ay+=uy*need;remain-=need;const x=Math.round(ax),y=Math.round(ay),key=`${x},${y}`;if(!seen.has(key)){seen.add(key);out.push({x,y});}carry=0;target=tangentSpacing(dx,dy);}
    carry+=remain;
  }
  return out;
}

function tyreFitsArea(ctx,mask,bounds,sprite,ox,oy){
  let bodyVisible=false;
  for(let sy=0;sy<TYRE_H;sy++)for(let sx=0;sx<TYRE_W;sx++){
    const si=sy*TYRE_W+sx;if(!sprite.body[si])continue;const x=ox+sx,y=oy+sy;
    if(!inBounds(ctx.width,ctx.height,x,y)){
      const allowed=(x<0&&bounds.x0===0)||(x>=ctx.width&&bounds.x1===ctx.width-1)||(y<0&&bounds.y0===0)||(y>=ctx.height&&bounds.y1===ctx.height-1);
      if(!allowed)return false;
      continue;
    }
    bodyVisible=true;if(mask[y*ctx.width+x]!==1)return false;
  }
  return bodyVisible;
}
function paintTyreTopLeft(ctx,backdrop,foreground,surface,sprite,ox,oy,mask=null){
  let bodyPx=0;
  for(let sy=0;sy<TYRE_H;sy++)for(let sx=0;sx<TYRE_W;sx++){
    const si=sy*TYRE_W+sx,value=sprite.pixels[si];if(value<0)continue;const x=ox+sx,y=oy+sy;if(!inBounds(ctx.width,ctx.height,x,y))continue;
    if(mask&&mask[y*ctx.width+x]!==1)continue;
    backdrop[y*ctx.width+x]=value;
    if(sprite.body[si]){bodyPx++;setForegroundForBody(foreground,ctx.width,ctx.height,x,y,sy,settings.foreground);setCollisionAt(ctx,surface,x,y);}
  }
  return bodyPx;
}
function rowBodyOwners(ctx,row){
  const owners=new Map();
  for(const item of row){
    const {sprite,colour,ox,oy}=item;
    for(let sy=0;sy<TYRE_H;sy++)for(let sx=0;sx<TYRE_W;sx++){
      const si=sy*TYRE_W+sx;if(!sprite.body[si])continue;const x=ox+sx,y=oy+sy;if(!inBounds(ctx.width,ctx.height,x,y))continue;owners.set(y*ctx.width+x,colour);
    }
  }
  return owners;
}
function darkenBehindCurrentRow(ctx,backdrop,previousOwners,row,mask){
  if(!previousOwners?.size)return 0;let changed=0;
  for(const item of row)for(const dx of OVERLAP_DARKEN_X){
    const x=item.ox+dx,y=item.oy;if(!inBounds(ctx.width,ctx.height,x,y))continue;const i=y*ctx.width+x;if(mask&&mask[i]!==1)continue;const colour=previousOwners.get(i);if(!colour)continue;backdrop[i]=colour.darker;changed++;
  }
  return changed;
}
function buildAreaRows(ctx,mask,bounds){
  const rows=[];let occurrence=0;
  for(let rowIndex=0,y=bounds.y0;y<=bounds.y1;y+=AREA_Y_PITCH,rowIndex++){
    const offset=(rowIndex&1)?AREA_ROW_OFFSET:0,row=[];
    for(let x=bounds.x0+offset;x<=bounds.x1;x+=AREA_X_PITCH){
      const colour=colourForOccurrence(occurrence),sprite=makeTyre(colour);
      if(!tyreFitsArea(ctx,mask,bounds,sprite,x,y))continue;
      row.push({ox:x,oy:y,colour,sprite,occurrence});occurrence++;
    }
    if(row.length)rows.push(row);
  }
  return rows;
}
function renderPath(ctx,backdrop,foreground,surface){
  const anchors=pathAnchors(ctx.geometry.points);let occurrence=0,bodyPx=0;
  for(const a of anchors){bodyPx+=paintTyre(ctx,backdrop,foreground,surface,a,colourForOccurrence(occurrence++));}
  return {tyres:anchors.length,bodyPx};
}
function renderArea(ctx,backdrop,foreground,surface){
  const mask=areaMask(ctx),bounds=mask&&maskBounds(mask,ctx.width,ctx.height);if(!mask||!bounds)return {tyres:0,rows:0,bodyPx:0,darkened:0};
  const rows=buildAreaRows(ctx,mask,bounds);let tyres=0,bodyPx=0,darkened=0,previousOwners=null;
  for(const row of rows){
    darkened+=darkenBehindCurrentRow(ctx,backdrop,previousOwners,row,mask);
    for(const item of row){bodyPx+=paintTyreTopLeft(ctx,backdrop,foreground,surface,item.sprite,item.ox,item.oy,mask);tyres++;}
    previousOwners=rowBodyOwners(ctx,row);
  }
  return {tyres,rows:rows.length,bodyPx,darkened};
}
function render(ctx){
  const backdrop=ctx.layer('backdrop'),foreground=ctx.layer('foreground'),surface=ctx.layer('surface');let result;
  if(ctx.geometry.tool==='line'||ctx.geometry.tool==='curve')result=renderPath(ctx,backdrop,foreground,surface);
  else result=renderArea(ctx,backdrop,foreground,surface);
  const a=tyreColour(settings.colourA).label,b=tyreColour(settings.colourB).label;
  return {message:`Tyre Wall committed · ${result.tyres} tyres${result.rows?` · ${result.rows} rows`:''} · ${a}/${b} · run ${settings.runLength}${settings.collision?' · collision':''} · Foreground ${settings.foreground==='none'?'0':settings.foreground==='full'?'100':'50'}%.`};
}
function mountControls(container,ctx){
  ctx.ui.select(container,{label:'Colour A',value:settings.colourA,options:COLOUR_OPTIONS,onChange:value=>{settings.colourA=value;}});
  ctx.ui.select(container,{label:'Colour B',value:settings.colourB,options:COLOUR_OPTIONS,onChange:value=>{settings.colourB=value;}});
  ctx.ui.slider(container,{label:'Colour run',min:1,max:20,step:1,value:settings.runLength,onInput:value=>{settings.runLength=value;}});
  ctx.ui.select(container,{label:'Foreground',value:settings.foreground,options:FG_OPTIONS,onChange:value=>{settings.foreground=value;}});
  ctx.ui.checkbox(container,{label:'Set collision',checked:settings.collision,onChange:value=>{settings.collision=value;}});
}

S.register({
  id:'tyre-wall',
  name:'Tyre Wall',
  version:VERSION,
  category:'Track',
  status:'prototype',
  description:'Procedural single-row and staggered multi-row tyre walls using the supplied shadow, colour and overlap references, with colour runs, Foreground and Surface collision.',
  supportedModes:['backdrop'],
  supportedTools:['line','curve','rectangle','rectangle-filled','ellipse','ellipse-filled','fill'],
  layers:['backdrop','foreground','surface'],
  mountControls,
  preview:render,
  apply:render
});

})(typeof globalThis!=='undefined'?globalThis:this);
