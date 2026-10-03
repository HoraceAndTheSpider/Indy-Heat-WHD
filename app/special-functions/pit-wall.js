(function(root){
'use strict';

/* Pit Wall Special Function.
 *
 * Filled Rectangle defines the overall left/right length and maximum end depth.
 * The renderer derives stretchable wall/fence patterns from the supplied
 * PitWalls_Various2.ihbrush reference instead of scaling its raster artwork.
 */
const S=root.IndyHeatSpecialFunctions;if(!S?.register)return;

const VERSION='1.004';
const COLLISION=1;
const MASK_FOREGROUND=0;
const MASK_BACKGROUND=1;
const settings={
  farWall:'fence',
  centre:'concrete',
  ends:'curved',
  middleWidth:60,
  people:false,
  peopleDensity:35,
  foreground:true
};
let generation=1;

/* Reference-palette families recovered from PitWalls_Various2.ihbrush. */
const CONCRETE=Object.freeze({highlight:7,mid:6,shade:5,dark:4});
const FENCE=Object.freeze({bright:11,yellow:23,yellowShade:22,black:1});
const GRASS=25;
const FENCE_OFFSET=2;
const FENCE_HEIGHT=5;
const FENCE_DEPTH=FENCE_OFFSET+FENCE_HEIGHT;
const FAR_CONCRETE_ROWS=Object.freeze([CONCRETE.highlight,CONCRETE.mid,CONCRETE.shade]);
const NEAR_CONCRETE_ROWS=Object.freeze([CONCRETE.dark,CONCRETE.shade,CONCRETE.shade,CONCRETE.highlight]);

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function mix32(value){let x=Number(value)>>>0;x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;x=Math.imul(x,0x846ca68b);x^=x>>>16;return x>>>0;}
function hashAt(seed,x,y,salt=0){return mix32((seed>>>0)^Math.imul((x+0x10001)>>>0,0x9e3779b1)^Math.imul((y+0x20003)>>>0,0x85ebca6b)^Math.imul((salt+1)>>>0,0xc2b2ae35));}
function point(p){return p&&Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.y))?{x:Math.round(Number(p.x)),y:Math.round(Number(p.y))}:null;}
function geometryBounds(ctx){
  const a=point(ctx.geometry.start),b=point(ctx.geometry.end);
  if(a&&b)return {x0:clamp(Math.min(a.x,b.x),0,ctx.width-1),x1:clamp(Math.max(a.x,b.x),0,ctx.width-1),y0:clamp(Math.min(a.y,b.y),0,ctx.height-1),y1:clamp(Math.max(a.y,b.y),0,ctx.height-1)};
  const pts=ctx.geometry.points||[];if(!pts.length)return null;
  const xs=pts.map(p=>Number(p.x)).filter(Number.isFinite),ys=pts.map(p=>Number(p.y)).filter(Number.isFinite);if(!xs.length||!ys.length)return null;
  return {x0:clamp(Math.round(Math.min(...xs)),0,ctx.width-1),x1:clamp(Math.round(Math.max(...xs)),0,ctx.width-1),y0:clamp(Math.round(Math.min(...ys)),0,ctx.height-1),y1:clamp(Math.round(Math.max(...ys)),0,ctx.height-1)};
}

/* Curved ends are a true capsule profile rather than a short diagonal taper.
 * Middle width is the percentage of the selected rectangle retained as the
 * straight central section; the remaining width is split equally between the
 * two rounded ends.
 */
function shapeColumns(bounds){
  const {x0,x1,y0,y1}=bounds,w=x1-x0+1,h=y1-y0+1,cy=(y0+y1)/2;
  const out=[];
  if(settings.ends==='square'){
    for(let x=x0;x<=x1;x++)out.push({x,top:y0,bottom:y1});
    return out;
  }
  const half=Math.max(.5,(h-1)/2),span=Math.max(1,w-1);
  const middleFraction=clamp(Number(settings.middleWidth)||60,10,90)/100;
  const middleSpan=span*middleFraction;
  const curveSpan=Math.max(1,(span-middleSpan)/2);
  for(let x=x0;x<=x1;x++){
    const d=Math.min(x-x0,x1-x);
    let localHalf=half;
    if(d<curveSpan){
      const t=clamp(d/curveSpan,0,1);
      // Quarter ellipse from a one-pixel nose/tail into the full middle depth.
      localHalf=Math.max(.5,half*Math.sqrt(Math.max(0,1-(1-t)*(1-t))));
    }
    out.push({x,top:clamp(Math.ceil(cy-localHalf),y0,y1),bottom:clamp(Math.floor(cy+localHalf),y0,y1)});
  }
  return out;
}
function setPixel(ctx,pixels,x,y,index){return ctx.helpers.setIndexedPixel(pixels,x,y,index);}
function restorePixel(ctx,pixels,base,x,y){
  x=Math.round(x);y=Math.round(y);
  if(x<0||y<0||x>=ctx.width||y>=ctx.height)return false;
  pixels[y*ctx.width+x]=base[y*ctx.width+x];
  return true;
}
function fencePixel(relativeX,row){
  const p8=((relativeX%8)+8)%8,p4=((relativeX%4)+4)%4;
  if(row===0)return p8===0?FENCE.bright:null;
  if(row===1||row===3)return p4<2?FENCE.yellow:FENCE.black;
  if(row===2||row===4)return p8===0?FENCE.yellowShade:null;
  return null;
}
function renderCentreAndFarWall(ctx,pixels,base,columns,bounds){
  const farDepth=settings.farWall==='fence'?FENCE_DEPTH:FAR_CONCRETE_ROWS.length;
  const nearDepth=NEAR_CONCRETE_ROWS.length,centreIndex=settings.centre==='grass'?GRASS:CONCRETE.mid;

  // Establish the island centre first. The rear wall is then painted over it.
  for(const col of columns){
    for(let y=col.top;y<=col.bottom;y++)setPixel(ctx,pixels,col.x,y,centreIndex);
  }

  for(const col of columns){
    const height=col.bottom-col.top+1;
    if(settings.farWall==='fence'){
      /* Fence transparency must reveal the original track, not the centre fill.
       * Restore the complete far-wall envelope before drawing the mesh. The mesh
       * itself starts two rows lower than v0.1.0 and there is no concrete strip
       * underneath it.
       */
      for(let d=0;d<Math.min(farDepth,height);d++)restorePixel(ctx,pixels,base,col.x,col.top+d);
      for(let row=0;row<FENCE_HEIGHT;row++){
        const d=FENCE_OFFSET+row;if(d>=height)break;
        const value=fencePixel(col.x-bounds.x0,row);
        if(value!=null)setPixel(ctx,pixels,col.x,col.top+d,value);
      }
    }else{
      for(let d=0;d<Math.min(farDepth,height);d++)setPixel(ctx,pixels,col.x,col.top+d,FAR_CONCRETE_ROWS[d]);
    }
  }
  return {farDepth,nearDepth};
}
function renderNearWall(ctx,pixels,columns){
  const nearDepth=NEAR_CONCRETE_ROWS.length;
  for(const col of columns){
    const height=col.bottom-col.top+1;
    for(let d=0;d<Math.min(nearDepth,height);d++)setPixel(ctx,pixels,col.x,col.bottom-d,NEAR_CONCRETE_ROWS[d]);
  }
  return nearDepth;
}

/* People may stand immediately in front of the rear wall and immediately
 * behind the front wall. For the fence variant the first valid head row is the
 * first visible fence row; for a solid rear wall it is the top concrete row.
 * At the near edge the head may sit on the last clear centre row so torso/legs
 * can continue behind the front wall, which is repainted after all people.
 */
function buildPeopleMask(ctx,columns,farDepth,nearDepth){
  const mask=new Uint8Array(ctx.width*ctx.height);
  for(const col of columns){
    const rearStart=settings.farWall==='fence'?col.top+FENCE_OFFSET:col.top;
    const y0=Math.max(col.top,rearStart);
    const y1=Math.min(col.bottom,col.bottom-nearDepth);
    for(let y=y0;y<=y1;y++)if(y>=0&&y<ctx.height)mask[y*ctx.width+col.x]=1;
  }
  return mask;
}
function footprintWithinIsland(columnsByX,width,height,points){
  for(const p of points){
    const x=Math.round(p.x),y=Math.round(p.y);
    if(x<0||y<0||x>=width||y>=height)return false;
    const col=columnsByX[x];if(!col||y<col.top||y>col.bottom)return false;
  }
  return true;
}
function headAllowed(mask,width,x,y){
  x=Math.round(x);y=Math.round(y);
  return x>=0&&y>=0&&x<width&&y<mask.length/width&&mask[y*width+x]===1;
}
function personBodyPoints(x,y){
  x=Math.round(x);y=Math.round(y);
  return [{x,y},{x,y:y+1},{x,y:y+2}];
}
function bodyKey(width,x,y){return Math.round(y)*width+Math.round(x);}
function adjacentRowConflict(anchors,x,y){
  /* Pixel-adjacent people are valid, but neighbouring columns must never have
   * their heads on exactly the same Y row. A one-pixel or greater Y stagger is
   * therefore enforced whenever |dx| == 1. */
  for(const a of anchors)if(Math.abs(a.x-x)===1&&a.y===y)return true;
  return false;
}
function buildPeopleAnchors(ctx,peopleMask,columnsByX,seed){
  const P=root.IndyHeatPeopleTools;if(!P?.personFootprint)return [];
  const density=clamp(Number(settings.peopleDensity)||1,1,100)/100,candidates=[];
  for(let y=0;y<ctx.height-2;y++)for(let x=1;x<ctx.width;x++){
    if(!headAllowed(peopleMask,ctx.width,x,y))continue;
    const footprint=P.personFootprint(x,y);
    if(!footprintWithinIsland(columnsByX,ctx.width,ctx.height,footprint))continue;
    candidates.push({x,y,h:hashAt(seed,x,y,7)});
  }
  /* Density is a percentage of a deliberately crowded visual maximum, not a
   * percentage of every mathematically possible anchor. About one anchor per
   * fourteen valid head positions at 100% keeps individuals readable while
   * still allowing true pixel-adjacent neighbours. Hash ordering removes the
   * old row/lattice structure. */
  candidates.sort((a,b)=>a.h-b.h||a.y-b.y||a.x-b.x);
  const target=Math.max(1,Math.round(candidates.length*density/14));
  const anchors=[],bodyOccupied=new Set();
  for(const c of candidates){
    const body=personBodyPoints(c.x,c.y);
    if(body.some(p=>bodyOccupied.has(bodyKey(ctx.width,p.x,p.y))))continue;
    if(adjacentRowConflict(anchors,c.x,c.y))continue;
    anchors.push(c);
    for(const p of body)bodyOccupied.add(bodyKey(ctx.width,p.x,p.y));
    if(anchors.length>=target)break;
  }
  if(!anchors.length){
    let best=null,bestHash=0xffffffff;
    for(let y=0;y<ctx.height-2;y++)for(let x=1;x<ctx.width;x++){
      if(!headAllowed(peopleMask,ctx.width,x,y))continue;
      const footprint=P.personFootprint(x,y);
      if(!footprintWithinIsland(columnsByX,ctx.width,ctx.height,footprint))continue;
      const h=hashAt(seed,x,y,13);if(h<bestHash){bestHash=h;best={x,y,h};}
    }
    if(best)anchors.push(best);
  }
  return anchors;
}

/* Generate each person against one immutable pre-people Backdrop snapshot.
 * Body pixels are then committed first; shadows are committed afterwards only
 * where no person's body exists. This lets people stand pixel-adjacent without
 * one person's shadow darkening or overwriting another person.
 */
function scatterPeople(ctx,pixels,peopleMask,columnsByX,seed){
  if(!settings.people)return 0;
  const P=root.IndyHeatPeopleTools;if(!P?.paintPerson||!P?.personFootprint)return 0;
  const background=Uint8Array.from(pixels),anchors=buildPeopleAnchors(ctx,peopleMask,columnsByX,seed);
  const bodyPixels=new Set(),people=[];
  for(const a of anchors){
    const sample=Uint8Array.from(background);
    if(!P.paintPerson(ctx,sample,background,a.x,a.y,seed))continue;
    const face=a.y*ctx.width+a.x,torso=(a.y+1)*ctx.width+a.x,legs=(a.y+2)*ctx.width+a.x,shadow=(a.y+2)*ctx.width+a.x-1;
    people.push({face,torso,legs,shadow,sample,x:a.x,y:a.y});
    bodyPixels.add(face);bodyPixels.add(torso);bodyPixels.add(legs);
  }
  for(const p of people){pixels[p.face]=p.sample[p.face];pixels[p.torso]=p.sample[p.torso];pixels[p.legs]=p.sample[p.legs];}
  for(const p of people)if(!bodyPixels.has(p.shadow))pixels[p.shadow]=p.sample[p.shadow];
  return people.length;
}
function applyForeground(ctx,foreground,columns){
  if(!settings.foreground)return;
  /* Project invariant: raw 0 = Foreground / artwork in front of the car,
   * raw 1 = Background / car passes in front. The visually upper/far half of
   * the island is Foreground; the lower/near half is Background. */
  for(const col of columns){
    const split=(col.top+col.bottom)/2;
    for(let y=col.top;y<=col.bottom;y++)foreground[y*ctx.width+col.x]=y<=split?MASK_FOREGROUND:MASK_BACKGROUND;
  }
}
function applyCollision(ctx,surface,columns){
  const helper=ctx.helpersFor('surface'),info=ctx.layerInfo('surface'),written=new Set();
  for(const col of columns)for(let y=col.top;y<=col.bottom;y++){
    const p=helper.screenToLayer(col.x,y);if(!p)continue;
    const i=p.y*info.width+p.x;
    surface[i]=COLLISION;written.add(i);
  }
  return written.size;
}
function seedFor(bounds){return mix32(0x50495457^Math.imul(generation,0x9e3779b1)^Math.imul(bounds.x0+1,0x85ebca6b)^Math.imul(bounds.y0+1,0xc2b2ae35)^Math.imul(bounds.x1+1,0x27d4eb2d)^Math.imul(bounds.y1+1,0x165667b1));}
function render(ctx){
  const bounds=geometryBounds(ctx);if(!bounds)return {message:'Pit Wall: draw a Filled Rectangle.'};
  const width=bounds.x1-bounds.x0+1,height=bounds.y1-bounds.y0+1;
  if(width<8||height<7)return {message:'Pit Wall: placement is too small (minimum 8×7 px).'};

  const pixels=ctx.layer('backdrop'),base=ctx.baseLayer('backdrop'),foreground=ctx.layer('foreground'),surface=ctx.layer('surface'),columns=shapeColumns(bounds);
  const wall=renderCentreAndFarWall(ctx,pixels,base,columns,bounds);
  const peopleMask=buildPeopleMask(ctx,columns,wall.farDepth,wall.nearDepth);
  const columnsByX=Array(ctx.width);for(const col of columns)columnsByX[col.x]=col;

  applyForeground(ctx,foreground,columns);
  const collisionCells=applyCollision(ctx,surface,columns);

  // Rear wall first, then people, then the front wall for proper depth/occlusion.
  const people=scatterPeople(ctx,pixels,peopleMask,columnsByX,seedFor(bounds));
  renderNearWall(ctx,pixels,columns);

  if(ctx.phase==='apply')generation++;
  return {message:`Pit Wall committed · ${width}×${height}px${settings.ends==='curved'?` · middle width ${settings.middleWidth}%`:''}${settings.people?` · ${people} ${people===1?'person':'people'}`:''}${settings.foreground?' · Foreground split applied':''} · collision ${collisionCells} cells.`};
}
function mountControls(container,ctx){
  ctx.ui.select(container,{label:'Far wall',value:settings.farWall,options:[{value:'solid',label:'Solid wall'},{value:'fence',label:'Yellow / black fence'}],onChange:value=>{settings.farWall=value;}});
  ctx.ui.select(container,{label:'Centre',value:settings.centre,options:[{value:'concrete',label:'Concrete'},{value:'grass',label:'Grass'}],onChange:value=>{settings.centre=value;}});
  ctx.ui.select(container,{label:'Ends',value:settings.ends,options:[{value:'square',label:'Square'},{value:'curved',label:'Curved / wide'}],onChange:value=>{settings.ends=value;}});
  ctx.ui.slider(container,{label:'Middle width %',min:10,max:90,step:5,value:settings.middleWidth,onInput:value=>{settings.middleWidth=value;}});
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
  description:'Build a stretchable pit-wall island with rounded-width control, three-band concrete far wall or lowered transparent-backed fence, concrete/grass centre, staggered reusable random people, upper-half Foreground occlusion and automatic Surface collision.',
  supportedModes:['backdrop'],
  supportedTools:['rectangle-filled'],
  layers:['backdrop','foreground','surface'],
  mountControls,
  preview:render,
  apply:render
});

})(typeof globalThis!=='undefined'?globalThis:this);
