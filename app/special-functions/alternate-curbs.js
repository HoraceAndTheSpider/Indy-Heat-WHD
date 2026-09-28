(function(root){
'use strict';

/* Alternate Curbs Special Function.
 *
 * Reference IHBR: 6x3, three-pixel alternating colour blocks. Two rows form
 * the curb; the third is an optional edge line. The drawn path sits on the
 * inner curb row. Screen-left of stroke direction is the second curb row;
 * screen-right holds the optional edge line. Reversing the stroke flips sides.
 */
const S=root.IndyHeatSpecialFunctions;if(!S?.register)return;

const settings={
  colourA:'red',
  colourB:'white',
  edgeLine:true,
  edgeColour:4,
  edgeGap:0
};

const COLOURS=Object.freeze([
  {value:'red',label:'Red',pair:[28,29]},
  {value:'light-red',label:'Light red',pair:[30,31]},
  {value:'blue',label:'Blue',pair:[12,14]},
  {value:'yellow',label:'Yellow',pair:[22,23]},
  {value:'orange',label:'Orange',pair:[8,9]},
  {value:'green',label:'Green',pair:[25,26]},
  {value:'dark-green',label:'Dark green',pair:[24,25]},
  {value:'white',label:'White',pair:[5,6]},
  {value:'grey',label:'Grey',pair:[4,5]}
]);
const PAIRS=Object.freeze(Object.fromEntries(COLOURS.map(c=>[c.value,Object.freeze(c.pair)])));
const BLOCK=3;

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function uniquePoints(raw){
  const out=[];
  for(const p of raw||[]){
    const q={x:Number(p?.x),y:Number(p?.y)},last=out[out.length-1];
    if(!Number.isFinite(q.x)||!Number.isFinite(q.y))continue;
    if(!last||Math.abs(q.x-last.x)>.0001||Math.abs(q.y-last.y)>.0001)out.push(q);
  }
  return out;
}
function routePoints(geometry){
  if(geometry.tool==='line'&&geometry.start&&geometry.end)return uniquePoints([geometry.start,geometry.end]);
  return uniquePoints(geometry.points);
}
function buildSegments(points){
  const segments=[];let cumulative=0;
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    if(len<.0001)continue;
    segments.push({a,b,dx,dy,len,len2:len*len,start:cumulative,index:i,tx:dx/len,ty:dy/len});
    cumulative+=len;
  }
  /* Curves/freehand arrive as raster paths. Use a small neighbourhood for the
   * left/right tangent so the curb does not flip between horizontal/vertical
   * normals on diagonal stair-steps. Distance itself remains exact. */
  if(points.length>2){
    const radius=Math.max(2,Math.min(6,Math.round(points.length/30)));
    for(const seg of segments){
      const i0=Math.max(0,seg.index-radius),i1=Math.min(points.length-1,seg.index+1+radius);
      let tx=points[i1].x-points[i0].x,ty=points[i1].y-points[i0].y,len=Math.hypot(tx,ty);
      if(len<.0001){tx=seg.dx;ty=seg.dy;len=seg.len;}
      seg.tx=tx/len;seg.ty=ty/len;
    }
  }
  return {segments,totalLength:cumulative};
}
function routeField(ctx,points,maxDistance){
  const built=buildSegments(points),segments=built.segments;
  if(!segments.length)return {samples:[],totalLength:0};
  const count=ctx.width*ctx.height,bestD2=new Float32Array(count),signed=new Float32Array(count),along=new Float32Array(count),endZone=new Int8Array(count),endExtension=new Float32Array(count),touched=[];
  bestD2.fill(Infinity);
  const margin=maxDistance+1.5,radius2=(maxDistance+.55)*(maxDistance+.55),lastSegment=segments[segments.length-1];
  for(const seg of segments){
    const minX=Math.max(0,Math.floor(Math.min(seg.a.x,seg.b.x)-margin)),maxX=Math.min(ctx.width-1,Math.ceil(Math.max(seg.a.x,seg.b.x)+margin));
    const minY=Math.max(0,Math.floor(Math.min(seg.a.y,seg.b.y)-margin)),maxY=Math.min(ctx.height-1,Math.ceil(Math.max(seg.a.y,seg.b.y)+margin));
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
      const rawT=((x-seg.a.x)*seg.dx+(y-seg.a.y)*seg.dy)/seg.len2,t=clamp(rawT,0,1);
      const qx=seg.a.x+seg.dx*t,qy=seg.a.y+seg.dy*t,ox=x-qx,oy=y-qy,d2=ox*ox+oy*oy;
      if(d2>radius2)continue;
      const index=y*ctx.width+x;if(d2>=bestD2[index])continue;
      if(bestD2[index]===Infinity)touched.push(index);
      bestD2[index]=d2;
      signed[index]=ox*seg.ty+oy*(-seg.tx); // positive = screen-left of stroke
      along[index]=seg.start+t*seg.len;
      let zone=0,extension=0;
      if(seg===segments[0]&&rawT<0){zone=-1;extension=-rawT*seg.len;}
      else if(seg===lastSegment&&rawT>1){zone=1;extension=(rawT-1)*seg.len;}
      endZone[index]=zone;endExtension[index]=extension;
    }
  }
  const samples=touched.map(index=>({index,x:index%ctx.width,y:(index/ctx.width)|0,signed:signed[index],along:along[index],endZone:endZone[index],endExtension:endExtension[index]}));
  return {samples,totalLength:built.totalLength};
}
function shadePair(name){return PAIRS[name]||PAIRS.red;}
function pairForAlong(along){return ((Math.floor((along+.001)/BLOCK)&1)===0)?shadePair(settings.colourA):shadePair(settings.colourB);}
function curbColour(sample){const pair=pairForAlong(sample.along);return sample.signed>=.5?pair[0]:pair[1];}
function singlePoint(ctx,p){
  const pixels=ctx.layer('backdrop'),pair=shadePair(settings.colourA),x=Math.round(p.x),y=Math.round(p.y);
  ctx.helpers.setIndexedPixel(pixels,x,y,pair[1]);
  ctx.helpers.setIndexedPixel(pixels,x,y-1,pair[0]);
  if(settings.edgeLine)ctx.helpers.setIndexedPixel(pixels,x,y+1+settings.edgeGap,ctx.helpers.validIndex(settings.edgeColour));
}
function render(ctx){
  const pixels=ctx.layer('backdrop'),points=routePoints(ctx.geometry);if(!points.length)return;
  if(points.length===1){singlePoint(ctx,points[0]);return {message:'Alternate Curbs committed.'};}
  const lineDistance=settings.edgeLine?settings.edgeGap+1:0,maxDistance=Math.max(1.5,lineDistance+.65);
  const {samples,totalLength}=routeField(ctx,points,maxDistance);if(!samples.length)return;
  const edge=settings.edgeLine?ctx.helpers.validIndex(settings.edgeColour):null;
  for(const sample of samples){
    /* Outside the two route endpoints, only the darker outer curb row survives
     * for one extra pixel. This gives the requested tapered end rather than a
     * square two-row cap. */
    if(sample.endZone){
      if(sample.endExtension<=1.45&&sample.signed>=.5&&sample.signed<=1.45){
        const pair=pairForAlong(sample.endZone<0?0:totalLength);pixels[sample.index]=pair[0];
      }
      continue;
    }
    /* Curb occupies the path row (signed 0) plus one pixel on screen-left.
     * This reproduces the two curb rows of the reference brush. */
    if(sample.signed>=-.45&&sample.signed<=1.45){pixels[sample.index]=curbColour(sample);continue;}
    if(edge!=null){
      const target=-(settings.edgeGap+1);
      if(Math.abs(sample.signed-target)<=.45)pixels[sample.index]=edge;
    }
  }
  return {message:'Alternate Curbs committed.'};
}
function mountControls(container,ctx){
  ctx.ui.select(container,{label:'Colour 1',options:COLOURS,value:settings.colourA,onChange:v=>{settings.colourA=v;}});
  ctx.ui.select(container,{label:'Colour 2',options:COLOURS,value:settings.colourB,onChange:v=>{settings.colourB=v;}});
  ctx.ui.checkbox(container,{label:'Edge line',checked:settings.edgeLine,onChange:v=>{settings.edgeLine=v;}});
  if(ctx.ui.paletteColour)ctx.ui.paletteColour(container,{label:'Edge colour',value:settings.edgeColour,onInput:v=>{settings.edgeColour=v;}});
  else ctx.ui.paletteIndex(container,{label:'Edge colour',value:settings.edgeColour,onInput:v=>{settings.edgeColour=v;}});
  ctx.ui.select(container,{label:'Edge gap',options:[{value:0,label:'Adjacent'},{value:1,label:'1 px'},{value:2,label:'2 px'}],value:settings.edgeGap,onChange:v=>{settings.edgeGap=Number(v)||0;}});
}

S.register({
  id:'alternate-curbs',
  name:'Alternate Curbs',
  version:'0.1.2',
  category:'Track',
  status:'prototype',
  description:'Two-pixel alternating coloured curb with one-pixel dark end tapers and optional palette-selectable edge line with 0-2 pixel transparent gap.',
  supportedModes:['backdrop'],
  supportedTools:['freehand','line','curve'],
  layers:['backdrop'],
  mountControls,
  preview:render,
  apply:render
});

})(typeof globalThis!=='undefined'?globalThis:this);
