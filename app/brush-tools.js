(function(root){
'use strict';

/*
 * Generic indexed-raster brush engine — v0.78.
 *
 * Resource-neutral capture, masking, stamping, transparency handling and IHBR
 * save/load support. MiniMap, Backdrop and future drawing surfaces consume this API
 * through their own UI adapters.
 */
const VERSION='0.78';
const BRUSH_MAGIC='IHBR';
const BRUSH_VERSION=1;
const BRUSH_HEADER_SIZE=20;
const DRAW_TOOL_DEFS=Object.freeze([
  Object.freeze({value:'freehand',icon:'✎',title:'Pencil / freehand'}),
  Object.freeze({value:'line',icon:'╱',title:'Straight line'}),
  Object.freeze({value:'rectangle',icon:'□',title:'Rectangle / square'}),
  Object.freeze({value:'rectangle-filled',icon:'■',title:'Filled rectangle / square'}),
  Object.freeze({value:'ellipse',icon:'○',title:'Ellipse / circle'}),
  Object.freeze({value:'ellipse-filled',icon:'●',title:'Filled ellipse / circle'}),
  Object.freeze({value:'curve',icon:'∿',title:'Three-click curve'}),
  Object.freeze({value:'freeform',icon:'⬠',title:'Free-form multi-edge shape'}),
  Object.freeze({value:'fill',icon:'▨',title:'Fill'}),
  Object.freeze({value:'pick',icon:'⌾',title:'Pick colour'})
]);

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function pointKey(x,y){return `${x},${y}`;}
function rectangleBounds(a,b,width,height){
  return {
    minX:clamp(Math.min(a.x,b.x),0,width-1),maxX:clamp(Math.max(a.x,b.x),0,width-1),
    minY:clamp(Math.min(a.y,b.y),0,height-1),maxY:clamp(Math.max(a.y,b.y),0,height-1)
  };
}
function rectangleMask(a,b,width,height){
  const q=rectangleBounds(a,b,width,height),out=[];
  for(let y=q.minY;y<=q.maxY;y++)for(let x=q.minX;x<=q.maxX;x++)out.push([x,y]);
  return out;
}
function ellipseMask(a,b,width,height){
  const q=rectangleBounds(a,b,width,height),out=[];
  const cx=(q.minX+q.maxX+1)/2,cy=(q.minY+q.maxY+1)/2;
  const rx=Math.max(.5,(q.maxX-q.minX+1)/2),ry=Math.max(.5,(q.maxY-q.minY+1)/2);
  for(let y=q.minY;y<=q.maxY;y++)for(let x=q.minX;x<=q.maxX;x++){
    const nx=((x+.5)-cx)/rx,ny=((y+.5)-cy)/ry;
    if(nx*nx+ny*ny<=1)out.push([x,y]);
  }
  return out;
}
// Backwards-compatible constrained helpers retained for callers that explicitly
// need a square/circle. Capture tools use rectangleBounds/rectangleMask/ellipseMask.
function squareBounds(a,b,width,height){
  const dx=b.x-a.x,dy=b.y-a.y,side=Math.max(Math.abs(dx),Math.abs(dy));
  const ex=a.x+(dx<0?-side:side),ey=a.y+(dy<0?-side:side);
  return rectangleBounds(a,{x:ex,y:ey},width,height);
}
function squareMask(a,b,width,height){
  const q=squareBounds(a,b,width,height),out=[];
  for(let y=q.minY;y<=q.maxY;y++)for(let x=q.minX;x<=q.maxX;x++)out.push([x,y]);
  return out;
}
function circleMask(a,b,width,height){
  const q=squareBounds(a,b,width,height),out=[];
  const cx=(q.minX+q.maxX+1)/2,cy=(q.minY+q.maxY+1)/2;
  const rx=Math.max(.5,(q.maxX-q.minX+1)/2),ry=Math.max(.5,(q.maxY-q.minY+1)/2);
  for(let y=q.minY;y<=q.maxY;y++)for(let x=q.minX;x<=q.maxX;x++){
    const nx=((x+.5)-cx)/rx,ny=((y+.5)-cy)/ry;
    if(nx*nx+ny*ny<=1)out.push([x,y]);
  }
  return out;
}
function pointInPolygon(px,py,poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const xi=poly[i].x+.5,yi=poly[i].y+.5,xj=poly[j].x+.5,yj=poly[j].y+.5;
    const cross=((yi>py)!==(yj>py))&&(px<(xj-xi)*(py-yi)/((yj-yi)||1e-12)+xi);
    if(cross)inside=!inside;
  }
  return inside;
}
function rasterLinePoints(a,b,width,height){
  let x0=Math.round(Number(a?.x)||0),y0=Math.round(Number(a?.y)||0),x1=Math.round(Number(b?.x)||0),y1=Math.round(Number(b?.y)||0);
  const out=[],dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1;let err=dx+dy;
  while(true){if(x0>=0&&y0>=0&&x0<width&&y0<height)out.push([x0,y0]);if(x0===x1&&y0===y1)break;const e2=2*err;if(e2>=dy){err+=dy;x0+=sx;}if(e2<=dx){err+=dx;y0+=sy;}}
  return out;
}
function polygonMask(poly,width,height){
  if(!Array.isArray(poly)||poly.length<3)return [];
  const minX=clamp(Math.floor(Math.min(...poly.map(p=>p.x))),0,width-1),maxX=clamp(Math.ceil(Math.max(...poly.map(p=>p.x))),0,width-1);
  const minY=clamp(Math.floor(Math.min(...poly.map(p=>p.y))),0,height-1),maxY=clamp(Math.ceil(Math.max(...poly.map(p=>p.y))),0,height-1),out=[],seen=new Set();
  const add=(x,y)=>{if(x<0||y<0||x>=width||y>=height)return;const k=pointKey(x,y);if(seen.has(k))return;seen.add(k);out.push([x,y]);};
  // Include every raster pixel touched by the visible selection boundary. This is
  // important for tiny captures, where centre-only polygon filling can otherwise
  // omit most of the pixels underneath the selection line itself.
  for(let i=0;i<poly.length;i++)for(const [x,y] of rasterLinePoints(poly[i],poly[(i+1)%poly.length],width,height))add(x,y);
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++)if(pointInPolygon(x+.5,y+.5,poly))add(x,y);
  return out;
}
function captureRasterBrush(pixels,width,height,transparent,maskPoints,{name='Captured brush',key='captured'}={}){
  if(!pixels||pixels.length!==width*height)throw new Error('Source raster size does not match its dimensions.');
  transparent=Number(transparent);const seen=new Set(),visiblePts=[];
  for(const p of maskPoints||[]){
    const x=Number(p[0]),y=Number(p[1]);if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=width||y>=height)continue;
    const k=pointKey(x,y);if(seen.has(k))continue;seen.add(k);const v=Number(pixels[y*width+x]);
    // Editor brush transparency is a capture key: matching source pixels are
    // not part of the collected object and must not enlarge its brush bounds.
    if(v!==transparent)visiblePts.push([x,y,v]);
  }
  if(!seen.size)throw new Error('The capture selection is empty.');
  if(!visiblePts.length)throw new Error(`The selected area contains only brush-transparency index ${transparent}.`);
  const minX=Math.min(...visiblePts.map(p=>p[0])),maxX=Math.max(...visiblePts.map(p=>p[0])),minY=Math.min(...visiblePts.map(p=>p[1])),maxY=Math.max(...visiblePts.map(p=>p[1]));
  const w=maxX-minX+1,h=maxY-minY+1,out=new Uint8Array(w*h);out.fill(transparent);
  for(const [x,y,v] of visiblePts)out[(y-minY)*w+(x-minX)]=v;
  return {key,name,width:w,height:h,hotspotX:Math.floor((w-1)/2),hotspotY:Math.floor((h-1)/2),transparent,pixels:out,visiblePixels:visiblePts.length};
}
function prepareTargetTransparency(pixels,targetTransparent,brush,paletteSize=32){
  const out=Uint8Array.from(pixels),visibleBrush=new Set();
  for(const v of brush.pixels)if(v!==brush.transparent)visibleBrush.add(Number(v));
  let transparent=Number(targetTransparent);
  if(!visibleBrush.has(transparent))return {pixels:out,transparent,migrated:false};
  const used=new Set();for(const v of out)if(v!==transparent)used.add(Number(v));
  let replacement=-1;for(let i=0;i<paletteSize;i++)if(!used.has(i)&&!visibleBrush.has(i)){replacement=i;break;}
  if(replacement<0)throw new Error('No free palette index is available to preserve brush colours while changing transparency.');
  for(let i=0;i<out.length;i++)if(out[i]===transparent)out[i]=replacement;
  return {pixels:out,transparent:replacement,migrated:true,previousTransparent:transparent};
}
function stampRasterBrush(pixels,width,height,targetTransparent,brush,anchorX,anchorY,{paletteSize=32}={}){
  if(!pixels||pixels.length!==width*height)throw new Error('Target raster size does not match its dimensions.');
  if(!brush?.pixels||brush.pixels.length!==brush.width*brush.height)throw new Error('Captured brush is invalid.');
  const prep=prepareTargetTransparency(pixels,targetTransparent,brush,paletteSize),out=prep.pixels;
  anchorX=Math.round(Number(anchorX));anchorY=Math.round(Number(anchorY));let written=0;
  for(let y=0;y<brush.height;y++)for(let x=0;x<brush.width;x++){
    const v=brush.pixels[y*brush.width+x];if(v===brush.transparent)continue;
    const dx=anchorX-brush.hotspotX+x,dy=anchorY-brush.hotspotY+y;
    if(dx<0||dy<0||dx>=width||dy>=height)continue;
    out[dy*width+dx]=v;written++;
  }
  return {...prep,pixels:out,written};
}
function recountVisiblePixels(brush){
  let visible=0;for(const v of brush.pixels||[])if(v!==brush.transparent)visible++;
  return {...brush,visiblePixels:visible};
}
function transformRasterBrush(brush,{rotation=0,flipH=false,flipV=false}={}){
  if(!brush?.pixels||brush.pixels.length!==brush.width*brush.height)throw new Error('Captured brush is invalid.');
  rotation=((Number(rotation)||0)%360+360)%360;if(![0,90,180,270].includes(rotation))throw new Error('Brush rotation must be 0, 90, 180 or 270 degrees.');
  let w=brush.width,h=brush.height,hx=brush.hotspotX,hy=brush.hotspotY,pixels=Uint8Array.from(brush.pixels),out,nw=w,nh=h,nhx=hx,nhy=hy;
  if(rotation){
    nw=(rotation===90||rotation===270)?h:w;nh=(rotation===90||rotation===270)?w:h;out=new Uint8Array(nw*nh);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let dx,dy;if(rotation===90){dx=h-1-y;dy=x;}else if(rotation===180){dx=w-1-x;dy=h-1-y;}else{dx=y;dy=w-1-x;}
      out[dy*nw+dx]=pixels[y*w+x];
    }
    if(rotation===90){nhx=h-1-hy;nhy=hx;}else if(rotation===180){nhx=w-1-hx;nhy=h-1-hy;}else{nhx=hy;nhy=w-1-hx;}
    pixels=out;w=nw;h=nh;hx=nhx;hy=nhy;
  }
  if(flipH){out=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)out[y*w+(w-1-x)]=pixels[y*w+x];pixels=out;hx=w-1-hx;}
  if(flipV){out=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)out[(h-1-y)*w+x]=pixels[y*w+x];pixels=out;hy=h-1-hy;}
  return recountVisiblePixels({...brush,width:w,height:h,hotspotX:hx,hotspotY:hy,pixels});
}
function uniqueAnchors(points){
  const seen=new Set(),out=[];for(const p of points||[]){const x=Math.round(Number(p[0])),y=Math.round(Number(p[1])),k=pointKey(x,y);if(!Number.isFinite(x)||!Number.isFinite(y)||seen.has(k))continue;seen.add(k);out.push([x,y]);}return out;
}
function stampRasterBrushPoints(pixels,width,height,targetTransparent,brush,points,{paletteSize=32,erase=false}={}){
  if(!pixels||pixels.length!==width*height)throw new Error('Target raster size does not match its dimensions.');
  if(!brush?.pixels||brush.pixels.length!==brush.width*brush.height)throw new Error('Captured brush is invalid.');
  const prep=erase?{pixels:Uint8Array.from(pixels),transparent:Number(targetTransparent),migrated:false}:prepareTargetTransparency(pixels,targetTransparent,brush,paletteSize),out=prep.pixels;
  let written=0;
  for(const [ax,ay] of uniqueAnchors(points))for(let y=0;y<brush.height;y++)for(let x=0;x<brush.width;x++){
    const v=brush.pixels[y*brush.width+x];if(v===brush.transparent)continue;
    const dx=ax-brush.hotspotX+x,dy=ay-brush.hotspotY+y;if(dx<0||dy<0||dx>=width||dy>=height)continue;
    out[dy*width+dx]=erase?prep.transparent:v;written++;
  }
  return {...prep,pixels:out,written};
}
function stampOpaqueRasterBrushPoints(pixels,width,height,brush,points){
  if(!pixels||pixels.length!==width*height)throw new Error('Target raster size does not match its dimensions.');
  if(!brush?.pixels||brush.pixels.length!==brush.width*brush.height)throw new Error('Captured brush is invalid.');
  const out=Uint8Array.from(pixels);let written=0;
  for(const [ax,ay] of uniqueAnchors(points))for(let y=0;y<brush.height;y++)for(let x=0;x<brush.width;x++){
    const v=brush.pixels[y*brush.width+x];if(v===brush.transparent)continue;
    const dx=ax-brush.hotspotX+x,dy=ay-brush.hotspotY+y;if(dx<0||dy<0||dx>=width||dy>=height)continue;
    out[dy*width+dx]=v;written++;
  }
  return {pixels:out,written};
}
function patternFillOpaqueRasterBrush(pixels,width,height,brush,maskPoints,anchorX,anchorY){
  if(!pixels||pixels.length!==width*height)throw new Error('Target raster size does not match its dimensions.');
  if(!brush?.pixels||brush.pixels.length!==brush.width*brush.height)throw new Error('Captured brush is invalid.');
  const out=Uint8Array.from(pixels),mod=(n,m)=>((n%m)+m)%m;let written=0;
  anchorX=Math.round(Number(anchorX)||0);anchorY=Math.round(Number(anchorY)||0);
  for(const p of maskPoints||[]){const x=Math.round(Number(p[0])),y=Math.round(Number(p[1]));if(x<0||y<0||x>=width||y>=height)continue;
    const sx=mod(x-anchorX+brush.hotspotX,brush.width),sy=mod(y-anchorY+brush.hotspotY,brush.height),v=brush.pixels[sy*brush.width+sx];
    if(v===brush.transparent)continue;out[y*width+x]=v;written++;
  }
  return {pixels:out,written};
}
function patternFillRasterBrush(pixels,width,height,targetTransparent,brush,maskPoints,anchorX,anchorY,{paletteSize=32,erase=false}={}){
  if(!pixels||pixels.length!==width*height)throw new Error('Target raster size does not match its dimensions.');
  if(!brush?.pixels||brush.pixels.length!==brush.width*brush.height)throw new Error('Captured brush is invalid.');
  const prep=erase?{pixels:Uint8Array.from(pixels),transparent:Number(targetTransparent),migrated:false}:prepareTargetTransparency(pixels,targetTransparent,brush,paletteSize),out=prep.pixels;
  anchorX=Math.round(Number(anchorX)||0);anchorY=Math.round(Number(anchorY)||0);let written=0;
  const mod=(n,m)=>((n%m)+m)%m;
  for(const p of maskPoints||[]){const x=Math.round(Number(p[0])),y=Math.round(Number(p[1]));if(x<0||y<0||x>=width||y>=height)continue;
    const sx=mod(x-anchorX+brush.hotspotX,brush.width),sy=mod(y-anchorY+brush.hotspotY,brush.height),v=brush.pixels[sy*brush.width+sx];
    if(v===brush.transparent)continue;out[y*width+x]=erase?prep.transparent:v;written++;
  }
  return {...prep,pixels:out,written};
}
function stampBrushMaskPoints(pixels,width,height,brush,points,maskColour){
  if(!pixels||pixels.length!==width*height)throw new Error('Target raster size does not match its dimensions.');
  if(!brush?.pixels||brush.pixels.length!==brush.width*brush.height)throw new Error('Captured brush is invalid.');
  maskColour=Number(maskColour);const out=Uint8Array.from(pixels);let written=0;
  for(const [ax,ay] of uniqueAnchors(points))for(let y=0;y<brush.height;y++)for(let x=0;x<brush.width;x++){
    const v=brush.pixels[y*brush.width+x];if(v===brush.transparent)continue;
    const dx=ax-brush.hotspotX+x,dy=ay-brush.hotspotY+y;if(dx<0||dy<0||dx>=width||dy>=height)continue;
    out[dy*width+dx]=maskColour;written++;
  }
  return {pixels:out,written};
}
function patternFillBrushMask(pixels,width,height,brush,maskPoints,anchorX,anchorY,maskColour){
  if(!pixels||pixels.length!==width*height)throw new Error('Target raster size does not match its dimensions.');
  if(!brush?.pixels||brush.pixels.length!==brush.width*brush.height)throw new Error('Captured brush is invalid.');
  const out=Uint8Array.from(pixels),mod=(n,m)=>((n%m)+m)%m;maskColour=Number(maskColour);let written=0;
  anchorX=Math.round(Number(anchorX)||0);anchorY=Math.round(Number(anchorY)||0);
  for(const p of maskPoints||[]){const x=Math.round(Number(p[0])),y=Math.round(Number(p[1]));if(x<0||y<0||x>=width||y>=height)continue;
    const sx=mod(x-anchorX+brush.hotspotX,brush.width),sy=mod(y-anchorY+brush.hotspotY,brush.height),v=brush.pixels[sy*brush.width+sx];
    if(v===brush.transparent)continue;out[y*width+x]=maskColour;written++;
  }
  return {pixels:out,written};
}
function encodeBrushFile(brush,{paletteSize=32}={}){
  if(!brush?.pixels||brush.pixels.length!==brush.width*brush.height)throw new Error('Captured brush is invalid.');
  const width=Number(brush.width),height=Number(brush.height),hotspotX=Number(brush.hotspotX),hotspotY=Number(brush.hotspotY),transparent=Number(brush.transparent);
  if(!Number.isInteger(width)||width<1||width>65535||!Number.isInteger(height)||height<1||height>65535)throw new Error('Brush dimensions are outside IHBR v1 range.');
  if(!Number.isInteger(hotspotX)||hotspotX<0||hotspotX>=width||!Number.isInteger(hotspotY)||hotspotY<0||hotspotY>=height)throw new Error('Brush hotspot is outside the brush.');
  if(!Number.isInteger(transparent)||transparent<0||transparent>255)throw new Error('Brush transparency index is outside byte range.');
  paletteSize=Number(paletteSize);if(!Number.isInteger(paletteSize)||paletteSize<1||paletteSize>256)throw new Error('Brush palette size must be 1..256.');
  for(const v of brush.pixels)if(Number(v)<0||Number(v)>=paletteSize)throw new Error(`Brush pixel index ${Number(v)} is outside the ${paletteSize}-colour palette.`);
  const out=new Uint8Array(BRUSH_HEADER_SIZE+width*height),dv=new DataView(out.buffer);
  for(let i=0;i<4;i++)out[i]=BRUSH_MAGIC.charCodeAt(i);
  dv.setUint16(4,BRUSH_VERSION,false);dv.setUint16(6,0,false);dv.setUint16(8,width,false);dv.setUint16(10,height,false);dv.setUint16(12,hotspotX,false);dv.setUint16(14,hotspotY,false);out[16]=transparent;out[17]=paletteSize===256?0:paletteSize;dv.setUint16(18,0,false);out.set(brush.pixels,BRUSH_HEADER_SIZE);return out;
}
function decodeBrushFile(bytes){
  if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);if(bytes.length<BRUSH_HEADER_SIZE)throw new Error('Brush file is shorter than the IHBR header.');
  const magic=String.fromCharCode(bytes[0],bytes[1],bytes[2],bytes[3]);if(magic!==BRUSH_MAGIC)throw new Error('Not an Indy Heat brush file (IHBR).');
  const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),version=dv.getUint16(4,false);if(version!==BRUSH_VERSION)throw new Error(`Unsupported IHBR brush version ${version}.`);
  const flags=dv.getUint16(6,false);if(flags!==0)throw new Error(`Unsupported IHBR brush flags $${flags.toString(16).toUpperCase()}.`);
  const width=dv.getUint16(8,false),height=dv.getUint16(10,false),hotspotX=dv.getUint16(12,false),hotspotY=dv.getUint16(14,false),transparent=bytes[16],paletteSize=bytes[17]||256;
  if(!width||!height)throw new Error('Brush dimensions must be non-zero.');if(hotspotX>=width||hotspotY>=height)throw new Error('Brush hotspot lies outside the brush.');if(transparent>=paletteSize)throw new Error('Brush transparency index lies outside its palette.');
  const expected=BRUSH_HEADER_SIZE+width*height;if(bytes.length!==expected)throw new Error(`IHBR brush size mismatch: expected ${expected} bytes, got ${bytes.length}.`);
  const pixels=bytes.slice(BRUSH_HEADER_SIZE);let visible=0;for(const v of pixels){if(v>=paletteSize)throw new Error(`Brush pixel index ${v} lies outside its ${paletteSize}-colour palette.`);if(v!==transparent)visible++;}
  if(!visible)throw new Error('Brush contains no visible pixels.');return {key:'loaded_brush',name:'Loaded brush',width,height,hotspotX,hotspotY,transparent,paletteSize,pixels,visiblePixels:visible,fileVersion:version};
}

const api={VERSION,BRUSH_MAGIC,BRUSH_VERSION,BRUSH_HEADER_SIZE,DRAW_TOOL_DEFS,clamp,rectangleBounds,rectangleMask,ellipseMask,squareBounds,squareMask,circleMask,pointInPolygon,rasterLinePoints,polygonMask,captureRasterBrush,prepareTargetTransparency,stampRasterBrush,recountVisiblePixels,transformRasterBrush,stampRasterBrushPoints,patternFillRasterBrush,stampOpaqueRasterBrushPoints,patternFillOpaqueRasterBrush,stampBrushMaskPoints,patternFillBrushMask,encodeBrushFile,decodeBrushFile};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.IndyHeatBrushTools=api;

})(typeof globalThis!=='undefined'?globalThis:this);
