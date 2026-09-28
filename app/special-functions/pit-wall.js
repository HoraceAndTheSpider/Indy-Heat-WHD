(function(root){
'use strict';

/* Pit Wall Special Function.
 *
 * Filled Rectangle defines the overall left/right length and maximum end depth.
 * The renderer derives stretchable wall/fence patterns from the supplied
 * PitWalls_Various2.ihbrush reference instead of scaling its raster artwork.
 */
const S=root.IndyHeatSpecialFunctions;if(!S?.register)return;

const VERSION='0.1.0';
const settings={
  farWall:'fence',
  centre:'concrete',
  ends:'curved',
  middleDepth:70,
  people:false,
  peopleDensity:35,
  foreground:true
};
let generation=1;

/* Reference-palette families recovered from PitWalls_Various2.ihbrush. */
const CONCRETE=Object.freeze({highlight:7,mid:6,shade:5,dark:4});
const FENCE=Object.freeze({bright:11,yellow:23,yellowShade:22,black:1});
const GRASS=25;

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function mix32(value){let x=Number(value)>>>0;x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;x=Math.imul(x,0x846ca68b);x^=x>>>16;return x>>>0;}
function hashAt(seed,x,y,salt=0){return mix32((seed>>>0)^Math.imul((x+0x10001)>>>0,0x9e3779b1)^Math.imul((y+0x20003)>>>0,0x85ebca6b)^Math.imul((salt+1)>>>0,0xc2b2ae35));}
function smoothstep(t){t=clamp(Number(t)||0,0,1);return t*t*(3-2*t);}
function point(p){return p&&Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.y))?{x:Math.round(Number(p.x)),y:Math.round(Number(p.y))}:null;}
function geometryBounds(ctx){
  const a=point(ctx.geometry.start),b=point(ctx.geometry.end);
  if(a&&b)return {x0:clamp(Math.min(a.x,b.x),0,ctx.width-1),x1:clamp(Math.max(a.x,b.x),0,ctx.width-1),y0:clamp(Math.min(a.y,b.y),0,ctx.height-1),y1:clamp(Math.max(a.y,b.y),0,ctx.height-1)};
  const pts=ctx.geometry.points||[];if(!pts.length)return null;
  const xs=pts.map(p=>Number(p.x)).filter(Number.isFinite),ys=pts.map(p=>Number(p.y)).filter(Number.isFinite);if(!xs.length||!ys.length)return null;
  return {x0:clamp(Math.round(Math.min(...xs)),0,ctx.width-1),x1:clamp(Math.round(Math.max(...xs)),0,ctx.width-1),y0:clamp(Math.round(Math.min(...ys)),0,ctx.height-1),y1:clamp(Math.round(Math.max(...ys)),0,ctx.height-1)};
}
function shapeColumns(bounds){
  const {x0,x1,y0,y1}=bounds,w=x1-x0+1,h=y1-y0+1,cy=(y0+y1)/2;
  const out=[];
  if(settings.ends==='square'){
    for(let x=x0;x<=x1;x++)out.push({x,top:y0,bottom:y1});
    return out;
  }
  const endHalf=Math.max(.5,(h-1)/2),bodyHalf=Math.max(.5,endHalf*clamp(settings.middleDepth,30,100)/100);
  const span=Math.max(1,w-1),cap=Math.max(1,Math.min(endHalf,span/5)),transition=Math.max(1,Math.min(Math.max(2,endHalf),Math.max(1,span/4-cap/2)));
  for(let x=x0;x<=x1;x++){
    const d=Math.min(x-x0,x1-x),half=(()=>{
      if(d<cap){const q=(cap-d)/cap;return endHalf*Math.sqrt(Math.max(0,1-q*q));}
      if(d<cap+transition){const t=smoothstep((d-cap)/transition);return endHalf+(bodyHalf-endHalf)*t;}
      return bodyHalf;
    })();
    out.push({x,top:clamp(Math.ceil(cy-half),y0,y1),bottom:clamp(Math.floor(cy+half),y0,y1)});
  }
  return out;
}
function setPixel(ctx,pixels,x,y,index){return ctx.helpers.setIndexedPixel(pixels,x,y,index);}
function fencePixel(relativeX,row){
  const p8=((relativeX%8)+8)%8,p4=((relativeX%4)+4)%4;
  if(row===0)return p8===0?FENCE.bright:null;
  if(row===1||row===3)return p4<2?FENCE.yellow:FENCE.black;
  if(row===2||row===4)return p8===0?FENCE.yellowShade:null;
  if(row===5)return CONCRETE.mid;
  if(row===6)return CONCRETE.highlight;
  return null;
}
function renderWalls(ctx,pixels,columns,bounds){
  const farDepth=settings.farWall==='fence'?7:4,nearDepth=4,centreIndex=settings.centre==='grass'?GRASS:CONCRETE.mid;
  for(const col of columns){
    for(let y=col.top;y<=col.bottom;y++)setPixel(ctx,pixels,col.x,y,centreIndex);
  }
  for(const col of columns){
    const height=col.bottom-col.top+1;
    for(let d=0;d<Math.min(farDepth,height);d++){
      const y=col.top+d;
      if(settings.farWall==='fence'){
        const value=fencePixel(col.x-bounds.x0,d);if(value!=null)setPixel(ctx,pixels,col.x,y,value);
      }else{
        const value=[CONCRETE.highlight,CONCRETE.mid,CONCRETE.shade,CONCRETE.dark][d]??CONCRETE.dark;
        setPixel(ctx,pixels,col.x,y,value);
      }
    }
    for(let d=0;d<Math.min(nearDepth,height);d++){
      const y=col.bottom-d,value=[CONCRETE.dark,CONCRETE.shade,CONCRETE.shade,CONCRETE.highlight][d]??CONCRETE.highlight;
      setPixel(ctx,pixels,col.x,y,value);
    }
  }
  return {farDepth,nearDepth};
}
function buildInteriorMask(ctx,columns,farDepth,nearDepth){
  const mask=new Uint8Array(ctx.width*ctx.height);
  for(const col of columns){
    const y0=col.top+farDepth,y1=col.bottom-nearDepth;
    for(let y=y0;y<=y1;y++)if(y>=0&&y<ctx.height)mask[y*ctx.width+col.x]=1;
  }
  return mask;
}
function footprintInside(mask,width,points){for(const p of points){const x=Math.round(p.x),y=Math.round(p.y);if(x<0||y<0||x>=width||y>=mask.length/width||mask[y*width+x]!==1)return false;}return true;}
function scatterPeople(ctx,pixels,interior,seed){
  if(!settings.people)return 0;
  const P=root.IndyHeatPeopleTools;if(!P?.paintPerson||!P?.personFootprint)return 0;
  const background=Uint8Array.from(pixels),occupied=new Set(),chance=.0015+clamp(settings.peopleDensity,1,100)*.0002,threshold=Math.floor(Math.min(1,chance)*0x100000000)>>>0;
  let placed=0,best=null,bestHash=0xffffffff;
  for(let y=0;y<ctx.height-2;y++)for(let x=1;x<ctx.width;x++){
    const footprint=P.personFootprint(x,y);if(!footprintInside(interior,ctx.width,footprint))continue;
    let blocked=false;for(const p of footprint){if(occupied.has(p.y*ctx.width+p.x)){blocked=true;break;}}if(blocked)continue;
    const h=hashAt(seed,x,y,7);if(h<bestHash){bestHash=h;best={x,y};}
    if(h>=threshold)continue;
    if(P.paintPerson(ctx,pixels,background,x,y,seed,{occupied}))placed++;
  }
  if(!placed&&best&&P.paintPerson(ctx,pixels,background,best.x,best.y,seed,{occupied}))placed=1;
  return placed;
}
function applyForeground(ctx,foreground,columns){
  if(!settings.foreground)return;
  for(const col of columns){const split=(col.top+col.bottom)/2;for(let y=col.top;y<=col.bottom;y++)foreground[y*ctx.width+col.x]=y<=split?1:0;}
}
function seedFor(bounds){return mix32(0x50495457^Math.imul(generation,0x9e3779b1)^Math.imul(bounds.x0+1,0x85ebca6b)^Math.imul(bounds.y0+1,0xc2b2ae35)^Math.imul(bounds.x1+1,0x27d4eb2d)^Math.imul(bounds.y1+1,0x165667b1));}
function render(ctx){
  const bounds=geometryBounds(ctx);if(!bounds)return {message:'Pit Wall: draw a Filled Rectangle.'};
  const width=bounds.x1-bounds.x0+1,height=bounds.y1-bounds.y0+1;
  if(width<8||height<7)return {message:'Pit Wall: placement is too small (minimum 8×7 px).'};
  const pixels=ctx.layer('backdrop'),foreground=ctx.layer('foreground'),columns=shapeColumns(bounds),wall=renderWalls(ctx,pixels,columns,bounds),interior=buildInteriorMask(ctx,columns,wall.farDepth,wall.nearDepth);
  const people=scatterPeople(ctx,pixels,interior,seedFor(bounds));applyForeground(ctx,foreground,columns);
  if(ctx.phase==='apply')generation++;
  return {message:`Pit Wall committed · ${width}×${height}px${settings.ends==='curved'?` · middle ${settings.middleDepth}%`:''}${settings.people?` · ${people} ${people===1?'person':'people'}`:''}${settings.foreground?' · Foreground split applied':''}.`};
}
function mountControls(container,ctx){
  ctx.ui.select(container,{label:'Far wall',value:settings.farWall,options:[{value:'solid',label:'Solid wall'},{value:'fence',label:'Yellow / black fence'}],onChange:value=>{settings.farWall=value;}});
  ctx.ui.select(container,{label:'Centre',value:settings.centre,options:[{value:'concrete',label:'Concrete'},{value:'grass',label:'Grass'}],onChange:value=>{settings.centre=value;}});
  ctx.ui.select(container,{label:'Ends',value:settings.ends,options:[{value:'square',label:'Square'},{value:'curved',label:'Curved / wide'}],onChange:value=>{settings.ends=value;}});
  ctx.ui.slider(container,{label:'Middle depth %',min:30,max:100,step:5,value:settings.middleDepth,onInput:value=>{settings.middleDepth=value;}});
  ctx.ui.checkbox(container,{label:'Random people',checked:settings.people,onChange:value=>{settings.people=value;}});
  ctx.ui.slider(container,{label:'People density',min:1,max:100,step:1,value:settings.peopleDensity,onInput:value=>{settings.peopleDensity=value;}});
  ctx.ui.checkbox(container,{label:'Set foreground',checked:settings.foreground,onChange:value=>{settings.foreground=value;}});
}

S.register({
  id:'pit-wall',
  name:'Pit Wall',
  version:VERSION,
  category:'Scenery',
  status:'prototype',
  description:'Build a stretchable pit-wall island with concrete/fence far wall, concrete/grass centre, optional reusable random people and an upper/lower Foreground split.',
  supportedModes:['backdrop'],
  supportedTools:['rectangle-filled'],
  layers:['backdrop','foreground'],
  mountControls,
  preview:render,
  apply:render
});

})(typeof globalThis!=='undefined'?globalThis:this);
