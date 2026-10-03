(function(root){
'use strict';

/* Grandstand People Special Function.
 *
 * The supplied Crowd_Pixels.ihbrush is a 26x24 almost-solid crowd texture:
 * 621 painted pixels / 624 total.  This module keeps its observed palette
 * weighting but generates the pattern procedurally so a Fill can cover any
 * connected area without visibly tiling that 26x24 source.
 *
 * The Random People tool uses skin indices 8, 10 and 19 with equal selection.
 * The reference crowd brush contains the same three colours, but in a strongly
 * uneven 24:54:68 ratio.  Here their combined reference share is preserved
 * while the three skin colours are selected equally, so crowd skin balance is
 * consistent with Random People without changing the overall amount of skin.
 */
const S=root.IndyHeatSpecialFunctions;if(!S?.register)return;
const VERSION='0.1.0';
const settings={density:100};
let generation=1;

const REFERENCE_PAINTED=621;
const REFERENCE_TOTAL=624;
const REFERENCE_OCCUPANCY=REFERENCE_PAINTED/REFERENCE_TOTAL;
const SKIN_REFERENCE_TOTAL=24+54+68;
const SKIN_SHARE=SKIN_REFERENCE_TOTAL/REFERENCE_PAINTED;

/* Non-skin counts recovered directly from Crowd_Pixels.ihbrush. Index 0 is the
 * IHBR transparency index and is deliberately omitted here; unpainted crowd
 * pixels simply leave the existing Backdrop visible. */
const NON_SKIN_WEIGHTS=Object.freeze([
  Object.freeze([3,6]),Object.freeze([4,17]),Object.freeze([7,34]),
  Object.freeze([9,62]),Object.freeze([11,9]),Object.freeze([12,15]),
  Object.freeze([14,40]),Object.freeze([15,32]),Object.freeze([16,24]),
  Object.freeze([17,8]),Object.freeze([18,7]),Object.freeze([20,3]),
  Object.freeze([21,18]),Object.freeze([22,13]),Object.freeze([23,17]),
  Object.freeze([24,23]),Object.freeze([25,37]),Object.freeze([26,13]),
  Object.freeze([29,70]),Object.freeze([30,1]),Object.freeze([31,26])
]);
const NON_SKIN_TOTAL=NON_SKIN_WEIGHTS.reduce((sum,item)=>sum+item[1],0);

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function mix32(value){
  let x=Number(value)>>>0;
  x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;x=Math.imul(x,0x846ca68b);x^=x>>>16;
  return x>>>0;
}
function hashAt(seed,x,y,salt=0){
  return mix32((seed>>>0)^Math.imul((x+0x10001)>>>0,0x9e3779b1)^Math.imul((y+0x20003)>>>0,0x85ebca6b)^Math.imul((salt+1)>>>0,0xc2b2ae35));
}
function unit(hash){return (hash>>>0)/4294967296;}
function skinTones(){
  const source=root.IndyHeatPeopleTools?.SKIN_TONES;
  return Array.isArray(source)&&source.length?source:[8,10,19];
}
function weightedNonSkin(hash){
  let pick=unit(hash)*NON_SKIN_TOTAL;
  for(const [index,weight] of NON_SKIN_WEIGHTS){pick-=weight;if(pick<0)return index;}
  return NON_SKIN_WEIGHTS[NON_SKIN_WEIGHTS.length-1][0];
}
function crowdColour(x,y,seed){
  const skin=skinTones();
  if(unit(hashAt(seed,x,y,3))<SKIN_SHARE)return skin[hashAt(seed,x,y,5)%skin.length];
  return weightedNonSkin(hashAt(seed,x,y,7));
}
function fillPoints(ctx){
  const g=ctx.geometry||{};if(g.tool!=='fill'||!Array.isArray(g.points))return [];
  const out=[],seen=new Set();
  for(const p of g.points){
    const x=Math.round(Number(p?.x)),y=Math.round(Number(p?.y));
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=ctx.width||y>=ctx.height)continue;
    const index=y*ctx.width+x;if(seen.has(index))continue;seen.add(index);out.push({x,y,index});
  }
  return out;
}
function seedFor(ctx){
  const g=ctx.geometry||{},s=g.seed||g.start||{},sx=Math.round(Number(s.x)||0),sy=Math.round(Number(s.y)||0);
  return mix32(0x43524f57^Math.imul(generation,0x9e3779b1)^Math.imul(sx+1,0x85ebca6b)^Math.imul(sy+1,0xc2b2ae35));
}
function render(ctx){
  const points=fillPoints(ctx);if(!points.length)return {message:'Grandstand People: use Fill inside a closed area.'};
  const pixels=ctx.layer('backdrop'),density=clamp(Number(settings.density)||0,0,100)/100,occupancy=REFERENCE_OCCUPANCY*density,seed=seedFor(ctx);
  let painted=0;
  for(const p of points){
    if(unit(hashAt(seed,p.x,p.y,1))>=occupancy)continue;
    pixels[p.index]=ctx.helpers.validIndex(crowdColour(p.x,p.y,seed));painted++;
  }
  if(ctx.phase==='apply')generation++;
  return {message:`Grandstand People committed · ${painted} crowd pixels · density ${Math.round(density*100)}%.`};
}
function mountControls(container,ctx){
  ctx.ui.slider(container,{label:'Density',min:0,max:100,step:1,value:settings.density,onInput:value=>{settings.density=value;}});
}

const CrowdTools=Object.freeze({
  VERSION:'0.1',REFERENCE_OCCUPANCY,SKIN_SHARE,NON_SKIN_WEIGHTS,crowdColour
});
root.IndyHeatCrowdTools=CrowdTools;

S.register({
  id:'grandstand-people',
  name:'Grandstand People',
  version:VERSION,
  category:'Scenery',
  status:'prototype',
  description:'Fill a closed Backdrop area with the palette-weighted single-pixel crowd texture recovered from Crowd_Pixels.ihbrush.',
  supportedModes:['backdrop'],
  supportedTools:['fill'],
  layers:['backdrop'],
  mountControls,
  preview:render,
  apply:render
});

})(typeof globalThis!=='undefined'?globalThis:this);
