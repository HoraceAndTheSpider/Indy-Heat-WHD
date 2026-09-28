(function(root){
'use strict';

/* Random People Special Function.
 *
 * One person is four painted pixels:
 *   face
 *   torso
 * shadow + legs
 *
 * The three body pixels occupy one vertical column. The shadow sits one pixel
 * left of the legs and is derived from the original pixel underneath it.
 *
 * The reusable IndyHeatPeopleTools object is deliberately exported so later
 * Special Functions can place the same people without duplicating palette and
 * shadow rules.
 */
const S=root.IndyHeatSpecialFunctions;if(!S?.register)return;

const VERSION='0.1.0';
const settings={density:35};
let generation=1;

/* Recovered from the supplied People.ihbrush examples. */
const SKIN_TONES=Object.freeze([8,10,19]);
const LEG_TONES=Object.freeze([4,5,8,12,14]);
const TORSO_TONES=Object.freeze([3,6,7,9,11,13,15,17,18,21,23,25,26,27,29,30,31]);

const SHADE_GROUPS=Object.freeze([
  Object.freeze([4,5,6,7]),
  Object.freeze([12,13,14,15]),
  Object.freeze([20,21,22,23]),
  Object.freeze([24,25,26,27]),
  Object.freeze([28,29,30,31])
]);

function mix32(value){
  let x=Number(value)>>>0;
  x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;x=Math.imul(x,0x846ca68b);x^=x>>>16;
  return x>>>0;
}
function hashAt(seed,x,y,salt=0){
  return mix32((seed>>>0)^Math.imul((Math.round(x)+0x10001)>>>0,0x9e3779b1)^Math.imul((Math.round(y)+0x20003)>>>0,0x85ebca6b)^Math.imul((salt+1)>>>0,0xc2b2ae35));
}
function seedForGeneration(){return mix32(0x50454f50^Math.imul(generation,0x9e3779b1));}
function choose(values,seed){return values[(seed>>>0)%values.length];}
function luminance(rgb){return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];}
function paletteRgb(ctx,index){const c=ctx.paletteRgb(index);return Array.isArray(c)&&c.length>=3?c.map(v=>Math.max(0,Math.min(255,Number(v)||0))).slice(0,3):[0,0,0];}

function darkerIndex(ctx,index){
  index=ctx.helpers.validIndex(index);
  /* The reference brush demonstrates index 0 -> 5 for a neutral-grey shadow. */
  if(index===0)return 5;
  if(index===1)return 1;

  for(const group of SHADE_GROUPS){
    if(!group.includes(index))continue;
    const ordered=[...group].sort((a,b)=>luminance(paletteRgb(ctx,a))-luminance(paletteRgb(ctx,b))||a-b);
    const position=ordered.indexOf(index);
    if(position<=0)return index;
    return ordered[Math.max(0,position-1)];
  }

  const source=paletteRgb(ctx,index),sourceL=luminance(source),target=source.map(v=>v*.75);
  let best=index,bestDistance=Infinity;
  for(let candidate=0;candidate<ctx.paletteSize;candidate++){
    const rgb=paletteRgb(ctx,candidate),l=luminance(rgb);
    if(l>=sourceL-.01)continue;
    const dr=rgb[0]-target[0],dg=rgb[1]-target[1],db=rgb[2]-target[2],distance=dr*dr+dg*dg+db*db;
    if(distance<bestDistance){bestDistance=distance;best=candidate;}
  }
  return best;
}

function personFootprint(x,y){
  x=Math.round(x);y=Math.round(y);
  return Object.freeze([
    Object.freeze({x,y}),
    Object.freeze({x,y:y+1}),
    Object.freeze({x,y:y+2}),
    Object.freeze({x:x-1,y:y+2})
  ]);
}
function inBounds(ctx,x,y){return x>=0&&y>=0&&x<ctx.width&&y<ctx.height;}
function footprintFits(ctx,x,y,mask=null,occupied=null){
  for(const p of personFootprint(x,y)){
    if(!inBounds(ctx,p.x,p.y))return false;
    const index=p.y*ctx.width+p.x;
    if(mask&&mask[index]!==1)return false;
    if(occupied?.has(index))return false;
  }
  return true;
}
function markFootprint(ctx,occupied,x,y){for(const p of personFootprint(x,y))occupied.add(p.y*ctx.width+p.x);}

function torsoChoice(baseIndex,legs,seed){
  const allowed=TORSO_TONES.filter(index=>index!==baseIndex&&index!==legs);
  return choose(allowed.length?allowed:TORSO_TONES,seed);
}
function paintPerson(ctx,pixels,base,x,y,seed,{occupied=null}={}){
  x=Math.round(x);y=Math.round(y);
  if(!footprintFits(ctx,x,y,null,occupied))return false;
  const faceIndex=y*ctx.width+x,torsoIndex=(y+1)*ctx.width+x,legsIndex=(y+2)*ctx.width+x,shadowIndex=(y+2)*ctx.width+x-1;
  const face=choose(SKIN_TONES,hashAt(seed,x,y,1));
  const legs=choose(LEG_TONES,hashAt(seed,x,y,2));
  const torso=torsoChoice(base[torsoIndex],legs,hashAt(seed,x,y,3));
  const shadow=darkerIndex(ctx,base[shadowIndex]);
  pixels[shadowIndex]=shadow;
  pixels[legsIndex]=legs;
  pixels[torsoIndex]=torso;
  pixels[faceIndex]=face;
  if(occupied)markFootprint(ctx,occupied,x,y);
  return true;
}

function rectangleMask(ctx,start,end){
  const mask=new Uint8Array(ctx.width*ctx.height),x0=Math.max(0,Math.min(Math.round(start.x),Math.round(end.x))),x1=Math.min(ctx.width-1,Math.max(Math.round(start.x),Math.round(end.x))),y0=Math.max(0,Math.min(Math.round(start.y),Math.round(end.y))),y1=Math.min(ctx.height-1,Math.max(Math.round(start.y),Math.round(end.y)));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)mask[y*ctx.width+x]=1;
  return mask;
}
function ellipseMask(ctx,start,end){
  const mask=new Uint8Array(ctx.width*ctx.height),x0=Math.max(0,Math.min(Math.round(start.x),Math.round(end.x))),x1=Math.min(ctx.width-1,Math.max(Math.round(start.x),Math.round(end.x))),y0=Math.max(0,Math.min(Math.round(start.y),Math.round(end.y))),y1=Math.min(ctx.height-1,Math.max(Math.round(start.y),Math.round(end.y)));
  const cx=(x0+x1)/2,cy=(y0+y1)/2,rx=Math.max(.5,(x1-x0+1)/2),ry=Math.max(.5,(y1-y0+1)/2);
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    const dx=(x-cx)/rx,dy=(y-cy)/ry;if(dx*dx+dy*dy<=1.0001)mask[y*ctx.width+x]=1;
  }
  return mask;
}
function maskForGeometry(ctx){
  const g=ctx.geometry;if(!g.start||!g.end)return null;
  if(g.tool==='rectangle'||g.tool==='rectangle-filled')return rectangleMask(ctx,g.start,g.end);
  if(g.tool==='ellipse'||g.tool==='ellipse-filled')return ellipseMask(ctx,g.start,g.end);
  return null;
}
function areaPixelCount(mask){let n=0;for(const v of mask)if(v)n++;return n;}
function chanceForArea(){return .004+Math.max(1,Math.min(100,settings.density))*.00036;}
function chanceForPencil(){return .12+Math.max(1,Math.min(100,settings.density))*.0058;}

function scatterArea(ctx,pixels,base,mask,seed){
  const occupied=new Set(),chance=chanceForArea(),threshold=Math.floor(chance*0x100000000)>>>0;
  let placed=0,best=null,bestHash=0xffffffff;
  const reverseRows=(seed&1)!==0,reverseCols=(seed&2)!==0;
  for(let yi=0;yi<ctx.height;yi++){
    const y=reverseRows?ctx.height-1-yi:yi;
    for(let xi=0;xi<ctx.width;xi++){
      const x=reverseCols?ctx.width-1-xi:xi;
      if(!footprintFits(ctx,x,y,mask,occupied))continue;
      const h=hashAt(seed,x,y,11);
      if(h<bestHash){bestHash=h;best={x,y};}
      if(h>=threshold)continue;
      if(paintPerson(ctx,pixels,base,x,y,seed,{occupied}))placed++;
    }
  }
  if(!placed&&best&&paintPerson(ctx,pixels,base,best.x,best.y,seed,{occupied}))placed=1;
  return placed;
}
function uniquePath(points){
  const out=[],seen=new Set();
  for(const p of points||[]){const x=Math.round(Number(p.x)),y=Math.round(Number(p.y)),key=`${x},${y}`;if(!Number.isFinite(x)||!Number.isFinite(y)||seen.has(key))continue;seen.add(key);out.push({x,y});}
  return out;
}
function scatterPencil(ctx,pixels,base,seed){
  const path=uniquePath(ctx.geometry.points),occupied=new Set();if(!path.length)return 0;
  if(path.length===1)return paintPerson(ctx,pixels,base,path[0].x,path[0].y,seed,{occupied})?1:0;
  const chance=chanceForPencil(),threshold=Math.floor(Math.min(1,chance)*0x100000000)>>>0;let placed=0,best=null,bestHash=0xffffffff;
  for(const p of path){
    if(!footprintFits(ctx,p.x,p.y,null,occupied))continue;
    const h=hashAt(seed,p.x,p.y,17);if(h<bestHash){bestHash=h;best=p;}
    if(h>=threshold)continue;
    if(paintPerson(ctx,pixels,base,p.x,p.y,seed,{occupied}))placed++;
  }
  if(!placed&&best&&paintPerson(ctx,pixels,base,best.x,best.y,seed,{occupied}))placed=1;
  return placed;
}

function render(ctx){
  const pixels=ctx.layer('backdrop'),base=ctx.baseLayer('backdrop'),seed=seedForGeneration();let placed=0;
  if(ctx.geometry.tool==='freehand')placed=scatterPencil(ctx,pixels,base,seed);
  else{
    const mask=maskForGeometry(ctx);if(mask&&areaPixelCount(mask)>=4)placed=scatterArea(ctx,pixels,base,mask,seed);
  }
  if(ctx.phase==='apply')generation++;
  return {message:`Random People committed · ${placed} ${placed===1?'person':'people'}.`};
}
function mountControls(container,ctx){
  ctx.ui.slider(container,{label:'Density',min:1,max:100,step:1,value:settings.density,onInput:value=>{settings.density=value;}});
}

const PeopleTools=Object.freeze({
  VERSION:'1.0',SKIN_TONES,LEG_TONES,TORSO_TONES,darkerIndex,personFootprint,paintPerson,rectangleMask,ellipseMask,scatterArea,scatterPencil
});
root.IndyHeatPeopleTools=PeopleTools;

S.register({
  id:'random-people',
  name:'Random People',
  version:VERSION,
  category:'Scenery',
  status:'prototype',
  description:'Scatter tiny three-pixel people with palette-aware shadows over rectangle/circle areas, or place randomised people with Pencil.',
  supportedModes:['backdrop'],
  supportedTools:['freehand','rectangle','rectangle-filled','ellipse','ellipse-filled'],
  layers:['backdrop'],
  mountControls,
  preview:render,
  apply:render
});

})(typeof globalThis!=='undefined'?globalThis:this);
