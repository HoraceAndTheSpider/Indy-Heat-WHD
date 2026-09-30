(function(root){
'use strict';

/* Backdrop drawing/custom-brush adapter for shared raster tools and Special Functions host. */
const B=root.IndyHeatBrushTools,L=root.IndyHeatLayerTools,Library=root.IndyHeatBrushLibrary,D=root.IndyHeatTrackBackdropTools,T=root.IndyHeatTools,C=root.IndyHeatRaceSetupCapture,R=root.IndyHeatRecoveryCapture,SF=root.IndyHeatSpecialFunctions;
if(!B||!L||!Library||!D||!T||!C)return;
const {
  clamp,rectangleBounds,rectangleMask,ellipseMask,polygonMask,captureRasterBrush,
  stampOpaqueRasterBrushPoints,patternFillOpaqueRasterBrush,stampBrushMaskPoints,patternFillBrushMask,transformRasterBrush,
  encodeBrushFile,decodeBrushFile,BRUSH_VERSION,DRAW_TOOL_DEFS
}=B;
const W=D.TRACK_WIDTH,H=D.TRACK_HEIGHT,PALETTE_SIZE=32,SURFACE_W=160,SURFACE_H=112,SURFACE_BYTES=0x1180;
const $=id=>document.getElementById(id);
let drawTool='freehand',captureMode=null,gesture=null,hover=null,brush=null,activeLibraryId=null,paintColour=1,transparencyPickArmed=false;
const undoBySource=new Map(),redoBySource=new Map(),baselineBySource=new Map(),brushTransparencyBySource=new Map();
const scratchResources=Object.freeze({
  backdrop:{data:new Uint8Array(D.TRACK_BYTES)},
  foreground:{data:new Uint8Array(Math.ceil(W/8)*H)},
  surface:{data:new Uint8Array(SURFACE_BYTES)}
});
let scratchActive=false;
const externalOverlay={
  image:null,name:'External overlay',width:0,height:0,
  baseWidth:0,baseHeight:0,
  offsetX:0,offsetY:0,scaleX:100,scaleY:100,
  rotation:0,tilt:0
};
let paletteCacheModel=null,paletteCache=null;
function scratchResourceAt(offset=0){return Number(offset)===1?scratchResources.foreground:Number(offset)===2?scratchResources.surface:scratchResources.backdrop;}
function scratchCanvas(){return $('backdropScratchCanvas');}
function externalOverlayCanvas(){return $('backdropExternalOverlayCanvas');}
function scratchWorkspaceActive(){return scratchActive;}
function cancelPlacementPending(){try{root.IndyHeatMultiLayerPlacement?.cancelPending?.();}catch(_e){}}
function specialActive(){return !!SF?.isActiveFor?.('backdrop');}
function specialToolAllowed(tool){return SF?.supportsTool?SF.supportsTool(tool,'backdrop'):true;}
function restoreSpecialDisabled(button){if(button?.dataset?.specialPrevDisabled==null)return;button.disabled=button.dataset.specialPrevDisabled==='1';delete button.dataset.specialPrevDisabled;}
function setSpecialDisabled(button,disabled){if(!button)return;if(disabled){if(button.dataset.specialPrevDisabled==null)button.dataset.specialPrevDisabled=button.disabled?'1':'0';button.disabled=true;}else restoreSpecialDisabled(button);}

function backdropActive(){return !!($('layerEditBackdrop')?.classList.contains('active')&&!$('backdropEditorPane')?.hidden);}
function trackIndex(){return Number($('trackSelect')?.value||0);}
function baseId(){return T.TRACK_BASE_IDS?.[trackIndex()]??null;}
function sourceKey(){
  if(scratchActive)return 'scratch';
  const o=$('trackSelect')?.selectedOptions?.[0];
  if(o?.dataset?.indyheatPackageKey)return `package:${o.dataset.indyheatPackageKey}`;
  const retail=o?.dataset?.indyheatRetailIndex;return `retail:${retail==null?(o?.value??trackIndex()):retail}`;
}
function capturedModels(){const out=[],seen=new Set();for(const m of [C.coreModel,C.layerModel,C.model,...(C.models||[])]){if(!m||seen.has(m)||typeof m.getResource!=='function')continue;seen.add(m);out.push(m);}return out;}
function resourceAt(offset=0){const b=baseId();if(b==null)return null;for(const model of capturedModels()){try{const r=model.getResource(b+Number(offset||0));if(r)return r;}catch(_e){}}return null;}
function currentResource(){return scratchActive?scratchResources.backdrop:resourceAt(0);}
function currentForegroundResource(){return scratchActive?scratchResources.foreground:resourceAt(1);}
function currentSurfaceResource(){return scratchActive?scratchResources.surface:resourceAt(2);}
function currentPixels(){const r=currentResource();return r?D.decodeTrackPlanar(r.data):null;}
function currentForegroundPixels(){const r=currentForegroundResource();if(!r||typeof T.decode1bpp!=='function')return null;const q=T.decode1bpp(r.data,W,H,0);return q instanceof Uint8Array?q:Uint8Array.from(q||[]);}
function surfaceOffset(resource=currentSurfaceResource()){return resource?Math.max(0,resource.data.length-SURFACE_BYTES):0;}
function currentSurfacePixels(){const r=currentSurfaceResource();if(!r||typeof T.decodeSurface2bpp!=='function')return null;const q=T.decodeSurface2bpp(r.data,surfaceOffset(r)),cells=q?.cells;return cells instanceof Uint8Array?cells.slice():Uint8Array.from(cells||[]);}
function syncResourceOffsetBytes(offset,bytes,minLength=0){
  if(!bytes)return 0;
  if(scratchActive){const r=scratchResourceAt(offset);if(!r||r.data.length<minLength)return 0;r.data.set(bytes.subarray(0,Math.min(r.data.length,bytes.length)),0);return 1;}
  const b=baseId();if(b==null)return 0;let n=0;for(const model of capturedModels()){try{const r=model.getResource(b+Number(offset||0));if(r&&r.data.length>=minLength){r.data.set(bytes.subarray(0,Math.min(r.data.length,bytes.length)),0);n++;}}catch(_e){}}return n;
}
function syncResourceBytes(bytes){return syncResourceOffsetBytes(0,bytes,D.TRACK_BYTES);}
function syncForegroundResourceBytes(bytes){return syncResourceOffsetBytes(1,bytes,Math.ceil(W/8)*H);}
function syncSurfaceResourceBytes(bytes){return syncResourceOffsetBytes(2,bytes,SURFACE_BYTES);}
function encodeForegroundPixels(pixels,templateBytes=null){if(!(pixels instanceof Uint8Array)||pixels.length!==W*H)throw new Error(`Foreground layer must contain ${W*H} pixels.`);const rowBytes=Math.ceil(W/8),need=rowBytes*H,out=templateBytes?Uint8Array.from(templateBytes):new Uint8Array(need);if(out.length<need)throw new Error(`Foreground resource is only ${out.length} bytes; expected at least ${need}.`);for(let y=0;y<H;y++)for(let xb=0;xb<rowBytes;xb++){let value=0;const x0=xb*8;for(let bit=0;bit<8;bit++)if(pixels[y*W+x0+bit])value|=0x80>>>bit;out[y*rowBytes+xb]=value;}return out;}
function encodeSurfacePixels(cells,templateBytes=null){if(!(cells instanceof Uint8Array)||cells.length!==SURFACE_W*SURFACE_H)throw new Error(`Surface layer must contain ${SURFACE_W*SURFACE_H} cells.`);const resource=currentSurfaceResource(),out=templateBytes?Uint8Array.from(templateBytes):new Uint8Array(resource?.data?.length||SURFACE_BYTES),offset=Math.max(0,out.length-SURFACE_BYTES);if(out.length<SURFACE_BYTES)throw new Error(`Surface resource is only ${out.length} bytes; expected at least ${SURFACE_BYTES}.`);for(let y=0;y<SURFACE_H;y++)for(let x=0;x<SURFACE_W;x++)L.setSurfaceCell(out,x,y,cells[y*SURFACE_W+x],offset,SURFACE_W,SURFACE_H);return out;}
function arraysEqual(a,b){if(!a||!b||a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;}
function refreshSelectedTrack(){if(scratchActive){renderScratchPixels(currentPixels());return true;}const sel=$('trackSelect');if(sel){sel.dispatchEvent(new Event('change',{bubbles:true}));return true;}try{return !!root.IndyHeatEditorBridge?.refreshSelectedTrack?.();}catch(_e){return false;}}
function requestCoreRender(){const opacity=$('backgroundOpacity');if(opacity){opacity.dispatchEvent(new Event('input',{bubbles:true}));return true;}return false;}
function renderScratchPixels(pixels){
  const c=scratchCanvas();if(!c||!pixels)return false;
  if(c.width!==W)c.width=W;if(c.height!==H)c.height=H;
  const ctx=c.getContext('2d'),img=ctx.createImageData(W,H);for(let i=0;i<pixels.length;i++){const rgb=paletteRgb(pixels[i]),o=i*4;img.data[o]=rgb[0];img.data[o+1]=rgb[1];img.data[o+2]=rgb[2];img.data[o+3]=255;}ctx.putImageData(img,0,0);return true;
}
function previewPixels(pixels){
  if(scratchActive){renderScratchPixels(pixels);return 1;}
  // recovery-hook captures every 320×256 decode, including app.js and layer-editor.js.
  // Update every live decoded backdrop for this track so other edit modes see the
  // paint immediately without a synthetic track change that would clear their Undo.
  let updated=0;const ti=trackIndex(),gen=R?.generation;
  for(const c of R?.background||[])if(c.generation===gen&&c.trackIndex===ti&&c.result?.length===pixels.length){c.result.set(pixels);updated++;}
  requestCoreRender();return updated;
}
function writePixels(pixels){
  const bytes=D.encodeTrackPlanar(pixels);if(!syncResourceBytes(bytes))throw new Error(scratchActive?'Scratch page could not accept the Backdrop edit.':'No active editor model accepted the backdrop edit.');previewPixels(pixels);if(scratchActive)cancelPlacementPending();return bytes;
}
function syncLiveFromResource(){const pixels=currentPixels();if(pixels)previewPixels(pixels);}
function sourceHistory(map){const k=sourceKey();if(!map.has(k))map.set(k,[]);return map.get(k);}
function sourceUndo(){return sourceHistory(undoBySource);}
function sourceRedo(){return sourceHistory(redoBySource);}
function rawLayerBytes(name){
  const resource=name==='backdrop'?currentResource():name==='foreground'?currentForegroundResource():name==='surface'?currentSurfaceResource():null;
  if(!resource)return null;
  return name==='backdrop'?resource.data.slice(0,D.TRACK_BYTES):resource.data.slice();
}
function cloneLayerMap(source){const out={};for(const [name,bytes] of Object.entries(source||{}))if(bytes)out[name]=Uint8Array.from(bytes);return out;}
function historyBefore(value){
  if(value instanceof Uint8Array)return {layers:{backdrop:Uint8Array.from(value)},label:'Backdrop'};
  if(!value||typeof value!=='object')return null;
  const source=value.layers&&typeof value.layers==='object'?value.layers:{backdrop:value.backdrop,foreground:value.foreground,surface:value.surface};
  const layers=cloneLayerMap(source);
  return Object.keys(layers).length?{layers,label:String(value.label||'Special Function')}:null;
}
function buildHistoryRecord(beforeLayers,afterLayers,label='Backdrop'){
  const before={},after={},names=new Set([...Object.keys(beforeLayers||{}),...Object.keys(afterLayers||{})]);
  for(const name of names){
    const b=beforeLayers?.[name],a=afterLayers?.[name];
    if(!b||!a||arraysEqual(b,a))continue;
    before[name]=Uint8Array.from(b);after[name]=Uint8Array.from(a);
  }
  return Object.keys(before).length?{before:{layers:before},after:{layers:after},label:String(label||'Backdrop')}:null;
}
function syncHistoryButtons(){
  const undo=$('backdropPaintUndo'),redo=$('backdropPaintRedo');
  if(undo)undo.disabled=!sourceUndo().length;
  if(redo)redo.disabled=!sourceRedo().length;
}
function pushHistoryRecord(record){
  if(!record)return null;
  const stack=sourceUndo();stack.push(record);if(stack.length>30)stack.shift();
  sourceRedo().length=0;syncHistoryButtons();return record;
}
function pushUndo(value){
  const item=historyBefore(value);if(!item)return null;
  const after={};for(const name of Object.keys(item.layers)){const bytes=rawLayerBytes(name);if(bytes)after[name]=bytes;}
  return pushHistoryRecord(buildHistoryRecord(item.layers,after,item.label));
}
function recordExternalHistory({beforeLayers,afterLayers,label='Backdrop'}={}){
  return pushHistoryRecord(buildHistoryRecord(beforeLayers,afterLayers,label));
}
function augmentLastHistory({beforeLayers,afterLayers,label='Backdrop',matchBackdropBefore=null,matchBackdropAfter=null}={}){
  const extra=buildHistoryRecord(beforeLayers,afterLayers,label);if(!extra)return null;
  const stack=sourceUndo(),last=stack[stack.length-1];
  const canMerge=!!(last&&matchBackdropBefore&&matchBackdropAfter&&last.before?.layers?.backdrop&&last.after?.layers?.backdrop&&arraysEqual(last.before.layers.backdrop,matchBackdropBefore)&&arraysEqual(last.after.layers.backdrop,matchBackdropAfter));
  if(!canMerge)return pushHistoryRecord(extra);
  for(const [name,bytes] of Object.entries(extra.before.layers))if(!last.before.layers[name])last.before.layers[name]=Uint8Array.from(bytes);
  for(const [name,bytes] of Object.entries(extra.after.layers))last.after.layers[name]=Uint8Array.from(bytes);
  last.label=String(label||last.label||'Backdrop');sourceRedo().length=0;syncHistoryButtons();return last;
}
function applyHistoryLayers(layers){
  const restored=[];let refresh=false,backdrop=false;
  if(layers?.backdrop){if(!syncResourceBytes(layers.backdrop))throw new Error('Backdrop history could not restore the active resource.');restored.push('Backdrop');backdrop=true;}
  if(layers?.foreground){if(!syncForegroundResourceBytes(layers.foreground))throw new Error('Foreground history could not restore the active resource.');restored.push('Foreground');refresh=true;}
  if(layers?.surface){if(!syncSurfaceResourceBytes(layers.surface))throw new Error('Surface history could not restore the active resource.');restored.push('Surface');refresh=true;}
  if(refresh)refreshSelectedTrack();else if(backdrop)previewPixels(D.decodeTrackPlanar(layers.backdrop));
  return restored;
}
function ensureBaseline(){const k=sourceKey(),r=currentResource();if(k&&r&&!baselineBySource.has(k))baselineBySource.set(k,r.data.slice(0,D.TRACK_BYTES));}
function undoPaint(e){
  e?.preventDefault?.();e?.stopImmediatePropagation?.();
  const record=sourceUndo().pop();if(!record){syncHistoryButtons();return false;}
  try{
    const restored=applyHistoryLayers(record.before?.layers||{});
    const redo=sourceRedo();redo.push(record);if(redo.length>30)redo.shift();
    setState(`${record.label||'Backdrop'} edit undone${restored.length?` · ${restored.join(' + ')}`:''}.`);
    syncUi();syncHistoryButtons();return true;
  }catch(err){sourceUndo().push(record);setState(`ERROR: ${err.message}`,true);syncHistoryButtons();return false;}
}
function redoPaint(e){
  e?.preventDefault?.();e?.stopImmediatePropagation?.();
  const record=sourceRedo().pop();if(!record){syncHistoryButtons();return false;}
  try{
    const restored=applyHistoryLayers(record.after?.layers||{});
    const undo=sourceUndo();undo.push(record);if(undo.length>30)undo.shift();
    setState(`${record.label||'Backdrop'} edit redone${restored.length?` · ${restored.join(' + ')}`:''}.`);
    syncUi();syncHistoryButtons();return true;
  }catch(err){sourceRedo().push(record);setState(`ERROR: ${err.message}`,true);syncHistoryButtons();return false;}
}
function scratchTransparencyIndex(){
  if(!brushTransparencyBySource.has('scratch'))brushTransparencyBySource.set('scratch',0);
  return brushTransparencyBySource.get('scratch');
}
function clearScratchPage(){
  try{
    const previous={layers:{backdrop:scratchResources.backdrop.data.slice(),foreground:scratchResources.foreground.data.slice(),surface:scratchResources.surface.data.slice()},label:'Scratch'};
    const fillIndex=scratchTransparencyIndex(),pixels=new Uint8Array(W*H);pixels.fill(fillIndex);
    const encoded=D.encodeTrackPlanar(pixels);
    const changed=!arraysEqual(previous.layers.backdrop,encoded)||previous.layers.foreground.some(Boolean)||previous.layers.surface.some(Boolean);
    scratchResources.backdrop.data.set(encoded);
    scratchResources.foreground.data.fill(0);
    scratchResources.surface.data.fill(0);
    if(changed)pushUndo(previous);
    if(scratchActive)previewPixels(pixels);else renderScratchPixels(pixels);
    setState(`Scratch page cleared to transparency index ${fillIndex}.`);
    syncUi();return true;
  }catch(err){setState(`ERROR: ${err.message}`,true);return false;}
}
function restoreLoaded(){
  if(scratchActive){clearScratchPage();return;}
  const k=sourceKey(),bytes=baselineBySource.get(k);if(!bytes)return;try{const before=currentResource().data.slice(0,D.TRACK_BYTES);syncResourceBytes(bytes);previewPixels(D.decodeTrackPlanar(bytes));pushUndo(before);setState('Backdrop restored to the circuit state loaded into this editor session.');syncUi();}catch(err){setState(`ERROR: ${err.message}`,true);}
}

function paletteInfo(){
  const model=C.model||C.layerModel||C.coreModel||(C.models||[])[0]||null;if(model===paletteCacheModel&&paletteCache)return paletteCache;
  let p=null;try{if(model&&typeof T.findVerifiedTrackPalette==='function')p=T.findVerifiedTrackPalette(model);}catch(_e){}
  if(!p?.rgb?.length&&typeof T.verifiedTrackPaletteReference==='function')p=T.verifiedTrackPaletteReference();
  if(!p?.rgb?.length){const words=Array.from(T.VERIFIED_TRACK_PALETTE_WORDS||[]);p={words,rgb:D.gamePaletteRgb(words),sourceLabel:'verified Indy Heat race palette'};}
  paletteCacheModel=model;paletteCache=p;return p;
}
function paletteRgb(i){return paletteInfo()?.rgb?.[Number(i)]||[255,0,255];}
function paletteWord(i){return Number(paletteInfo()?.words?.[Number(i)]??T.VERIFIED_TRACK_PALETTE_WORDS?.[Number(i)]??0);}
function syncScratchVisibility(){const c=scratchCanvas();if(!c)return;c.classList.toggle('active',scratchActive&&backdropActive());if(scratchActive&&backdropActive())renderScratchPixels(currentPixels());}
function syncExternalOverlayVisibility(){const c=externalOverlayCanvas();if(!c)return;c.classList.toggle('active',!!externalOverlay.image&&backdropActive());}
function externalTiltGeometry(width,height,tilt){
  const signed=clamp((Number(tilt)||0)/100,-1,1),amount=Math.abs(signed);
  const heightFactor=1-.45*amount,edgeFactor=Math.max(.20,1-.80*amount);
  return {
    signed,amount,
    height:Math.max(1,height*heightFactor),
    topWidth:Math.max(1,width*(signed>=0?edgeFactor:1)),
    bottomWidth:Math.max(1,width*(signed>=0?1:edgeFactor))
  };
}
function overlayDisplaySize(){
  const bw=Math.max(1,Number(externalOverlay.baseWidth)||Number(externalOverlay.width)||1),bh=Math.max(1,Number(externalOverlay.baseHeight)||Number(externalOverlay.height)||1);
  return {width:bw*Math.max(.01,Number(externalOverlay.scaleX)||100)/100,height:bh*Math.max(.01,Number(externalOverlay.scaleY)||100)/100};
}
function externalProjectiveSourceY(t,topWidth,bottomWidth){
  t=clamp(Number(t)||0,0,1);
  const top=Math.max(.0001,Number(topWidth)||.0001),bottom=Math.max(.0001,Number(bottomWidth)||.0001);
  const ratio=top/bottom,den=ratio-t*(ratio-1);
  return den>1e-9?clamp(t/den,0,1):t;
}
function drawExternalTransformed(ctx,image,sourceW,sourceH,cx,cy,width,height,rotation,tilt,alpha=1){
  if(!ctx||!image||!(sourceW>0&&sourceH>0&&width>0&&height>0))return false;
  const g=externalTiltGeometry(width,height,tilt),steps=Math.max(1,Math.min(Math.ceil(g.height),512));
  ctx.save();ctx.globalAlpha=clamp(Number(alpha)||0,0,1);ctx.imageSmoothingEnabled=true;ctx.translate(cx,cy);ctx.rotate((Number(rotation)||0)*Math.PI/180);
  for(let n=0;n<steps;n++){
    const t0=n/steps,t1=(n+1)/steps,tm=(t0+t1)/2;
    const dw=g.topWidth+(g.bottomWidth-g.topWidth)*tm;
    const dy=-g.height/2+t0*g.height,dh=(t1-t0)*g.height;
    const sy0=externalProjectiveSourceY(t0,g.topWidth,g.bottomWidth)*sourceH;
    const sy1=externalProjectiveSourceY(t1,g.topWidth,g.bottomWidth)*sourceH;
    const sh=Math.max(.001,sy1-sy0);
    ctx.drawImage(image,0,sy0,sourceW,sh,-dw/2,dy,dw,dh+.55);
  }
  ctx.restore();return true;
}
function externalOverlayOpacity(){return clamp(Number($('opacity')?.value??55)/100,0,1);}
function renderExternalOverlay(){
  const c=externalOverlayCanvas();if(!c)return false;
  if(c.width!==W)c.width=W;if(c.height!==H)c.height=H;
  const ctx=c.getContext('2d');ctx.clearRect(0,0,W,H);
  if(!externalOverlay.image){syncExternalOverlayVisibility();return false;}
  const iw=Math.max(1,Number(externalOverlay.width)||Number(externalOverlay.image.width)||1),ih=Math.max(1,Number(externalOverlay.height)||Number(externalOverlay.image.height)||1),size=overlayDisplaySize();
  drawExternalTransformed(ctx,externalOverlay.image,iw,ih,W/2+Number(externalOverlay.offsetX||0),H/2+Number(externalOverlay.offsetY||0),size.width,size.height,externalOverlay.rotation,externalOverlay.tilt,externalOverlayOpacity());
  syncExternalOverlayVisibility();return true;
}
function setScratchActive(on){
  scratchActive=!!on;gesture=null;hover=null;cancelPlacementPending();
  if(scratchActive){ensureBaseline();renderScratchPixels(currentPixels());setState('Scratch page active · edits stay independent of the selected circuit.');}
  else{requestCoreRender();setState('Track Backdrop active. Scratch content retained for this editor session.');}
  syncScratchVisibility();syncExternalOverlayVisibility();syncUi();root.IndyHeatMultiLayerPlacement?.syncHistory?.();drawOverlay();
}
function closeExternalImage(){try{externalOverlay.image?.close?.();}catch(_e){}externalOverlay.image=null;externalOverlay.width=0;externalOverlay.height=0;externalOverlay.baseWidth=0;externalOverlay.baseHeight=0;}
function resetExternalTransform(){externalOverlay.offsetX=0;externalOverlay.offsetY=0;externalOverlay.scaleX=100;externalOverlay.scaleY=100;externalOverlay.rotation=0;externalOverlay.tilt=0;}
function externalTransformedBounds(width,height,rotation,tilt){
  const g=externalTiltGeometry(width,height,tilt),a=(Number(rotation)||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  const corners=[
    [-g.topWidth/2,-g.height/2],[g.topWidth/2,-g.height/2],
    [-g.bottomWidth/2,g.height/2],[g.bottomWidth/2,g.height/2]
  ].map(([x,y])=>({x:x*c-y*s,y:x*s+y*c}));
  const rawMinX=Math.min(...corners.map(p=>p.x)),rawMaxX=Math.max(...corners.map(p=>p.x));
  const rawMinY=Math.min(...corners.map(p=>p.y)),rawMaxY=Math.max(...corners.map(p=>p.y));
  const minX=Math.floor(rawMinX),maxX=Math.ceil(rawMaxX),minY=Math.floor(rawMinY),maxY=Math.ceil(rawMaxY);
  return {
    minX,maxX,minY,maxY,
    width:Math.max(1,maxX-minX),height:Math.max(1,maxY-minY),
    centreX:(minX+maxX)/2,centreY:(minY+maxY)/2,
    originX:-minX,originY:-minY
  };
}
function realignExternalOverlay(){
  if(!externalOverlay.image)return false;
  try{
    const iw=Math.max(1,Number(externalOverlay.width)||Number(externalOverlay.image.width)||1);
    const ih=Math.max(1,Number(externalOverlay.height)||Number(externalOverlay.image.height)||1);
    const size=overlayDisplaySize(),rotation=Number(externalOverlay.rotation)||0,tilt=Number(externalOverlay.tilt)||0;
    const bounds=externalTransformedBounds(size.width,size.height,rotation,tilt);
    if(bounds.width>4096||bounds.height>4096)throw new Error('Re-aligned overlay would be too large; reduce Width/Height first.');
    const baked=document.createElement('canvas');baked.width=bounds.width;baked.height=bounds.height;
    const bctx=baked.getContext('2d');bctx.clearRect(0,0,bounds.width,bounds.height);
    drawExternalTransformed(bctx,externalOverlay.image,iw,ih,bounds.originX,bounds.originY,size.width,size.height,rotation,tilt,1);
    const previous=externalOverlay.image;
    externalOverlay.image=baked;externalOverlay.width=bounds.width;externalOverlay.height=bounds.height;
    externalOverlay.baseWidth=bounds.width;externalOverlay.baseHeight=bounds.height;
    externalOverlay.offsetX+=bounds.centreX;externalOverlay.offsetY+=bounds.centreY;
    externalOverlay.scaleX=100;externalOverlay.scaleY=100;externalOverlay.rotation=0;externalOverlay.tilt=0;
    try{previous?.close?.();}catch(_e){}
    renderExternalOverlay();syncReferenceLayerUi();
    setState(`External overlay re-aligned · new baseline ${bounds.width}×${bounds.height} uses the full axis-aligned transformed bounds.`);
    return true;
  }catch(err){setState(`ERROR: ${err.message}`,true);return false;}
}
async function decodeExternalImage(file){
  if(typeof createImageBitmap==='function'){
    try{const bitmap=await createImageBitmap(file);return {image:bitmap,width:bitmap.width,height:bitmap.height};}catch(_e){}
  }
  const url=URL.createObjectURL(file);
  try{
    const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('The selected image could not be decoded by this browser.'));img.src=url;});
    return {image,width:image.naturalWidth||image.width,height:image.naturalHeight||image.height};
  }finally{URL.revokeObjectURL(url);}
}
async function loadExternalOverlay(file){
  if(!file)return false;
  try{
    const decoded=await decodeExternalImage(file);closeExternalImage();resetExternalTransform();
    externalOverlay.image=decoded.image;externalOverlay.width=decoded.width;externalOverlay.height=decoded.height;externalOverlay.name=String(file.name||'External overlay');
    const fit=Math.min(W/Math.max(1,decoded.width),H/Math.max(1,decoded.height));externalOverlay.baseWidth=decoded.width*fit;externalOverlay.baseHeight=decoded.height*fit;
    renderExternalOverlay();syncReferenceLayerUi();const transformDetails=$('backdropExternalTransformDetails');if(transformDetails)transformDetails.open=true;setState(`External overlay loaded · ${externalOverlay.name} · ${decoded.width}×${decoded.height}.`);return true;
  }catch(err){setState(`ERROR: ${err.message}`,true);return false;}
}
function removeExternalOverlay(){
  closeExternalImage();externalOverlay.name='External overlay';const c=externalOverlayCanvas();c?.getContext('2d')?.clearRect(0,0,W,H);syncExternalOverlayVisibility();syncReferenceLayerUi();setState('External overlay removed.');
}
function syncExternalControl(id,value,suffix=''){
  const input=$(id),output=$(`${id}Value`);if(input&&document.activeElement!==input)input.value=String(value);if(output)output.textContent=`${value}${suffix}`;
}
function syncReferenceLayerUi(){
  const show=$('backdropScratchToggle');if(show){show.classList.toggle('active',scratchActive);show.setAttribute('aria-pressed',String(scratchActive));show.textContent='Show';}
  const scratchLabel=$('backdropScratchLabel');if(scratchLabel)scratchLabel.textContent='Scratch';
  const remove=$('backdropExternalRemove');if(remove)remove.disabled=!externalOverlay.image;
  const label=$('backdropExternalLabel');if(label){label.textContent=externalOverlay.image?externalOverlay.name:'External Overlay';label.title=externalOverlay.image?externalOverlay.name:'';}
  const transformDetails=$('backdropExternalTransformDetails');if(transformDetails)transformDetails.hidden=!externalOverlay.image;
  const controls=$('backdropExternalControls');if(controls)controls.hidden=false;
  syncExternalControl('backdropExternalOffsetX',externalOverlay.offsetX,'');
  syncExternalControl('backdropExternalOffsetY',externalOverlay.offsetY,'');
  syncExternalControl('backdropExternalScaleX',externalOverlay.scaleX,'%');
  syncExternalControl('backdropExternalScaleY',externalOverlay.scaleY,'%');
  syncExternalControl('backdropExternalRotation',externalOverlay.rotation,'°');
  syncExternalControl('backdropExternalTilt',externalOverlay.tilt,'%');
}
function bindExternalSlider(id,key,{integer=true}={}){
  const input=$(id);if(!input||input.dataset.externalBound)return;input.dataset.externalBound='1';
  input.addEventListener('input',()=>{externalOverlay[key]=integer?Math.round(Number(input.value)||0):Number(input.value)||0;renderExternalOverlay();syncReferenceLayerUi();});
}
function ensureExternalTransformUi(){
  const opacity=$('overlayOpacityControl'),viewSection=opacity?.closest('section');if(!viewSection)return false;
  let details=$('backdropExternalTransformDetails');
  if(!details){
    details=document.createElement('details');details.id='backdropExternalTransformDetails';details.className='smallDetails';details.hidden=true;
    details.innerHTML=`<summary>External overlay</summary><div id="backdropExternalControls">
      <label>X offset <input id="backdropExternalOffsetX" type="range" min="-320" max="320" step="1" value="0"><output id="backdropExternalOffsetXValue">0</output></label>
      <label>Y offset <input id="backdropExternalOffsetY" type="range" min="-256" max="256" step="1" value="0"><output id="backdropExternalOffsetYValue">0</output></label>
      <label>Width <input id="backdropExternalScaleX" type="range" min="10" max="400" step="1" value="100"><output id="backdropExternalScaleXValue">100%</output></label>
      <label>Height <input id="backdropExternalScaleY" type="range" min="10" max="400" step="1" value="100"><output id="backdropExternalScaleYValue">100%</output></label>
      <label class="externalRotateRow"><span>Rotate</span><input id="backdropExternalRotation" type="range" min="0" max="360" step="1" value="0"><output id="backdropExternalRotationValue">0°</output><button id="backdropExternalRealign" type="button" title="Bake the current transform into a new axis-aligned rectangular baseline, including the full rotated outside bounds">Re-align</button></label>
      <label title="Positive tilt narrows the top, keeps the lower edge wider, and compresses the image height relative to the current re-aligned axes"><span>Tilt</span><input id="backdropExternalTilt" type="range" min="-100" max="100" step="1" value="0"><output id="backdropExternalTiltValue">0%</output></label>
    </div>`;
    opacity.insertAdjacentElement('afterend',details);
    $('backdropExternalRealign')?.addEventListener('click',realignExternalOverlay);
    bindExternalSlider('backdropExternalOffsetX','offsetX');bindExternalSlider('backdropExternalOffsetY','offsetY');
    bindExternalSlider('backdropExternalScaleX','scaleX');bindExternalSlider('backdropExternalScaleY','scaleY');
    bindExternalSlider('backdropExternalRotation','rotation');bindExternalSlider('backdropExternalTilt','tilt');
  }
  return true;
}
function ensureReferenceLayersUi(){
  const select=$('trackSelect');if(!select)return false;
  let details=$('circuitReferenceLayers');
  if(!details){
    details=document.createElement('details');details.id='circuitReferenceLayers';details.open=true;
    details.innerHTML=`<summary>Reference layers</summary><div id="circuitReferenceLayerRows">
      <div id="backdropScratchRow" class="referenceLayerRow"><span class="circuitCompareSlot">S</span><button id="backdropScratchClear" type="button">Clear</button><button id="backdropScratchToggle" type="button" aria-pressed="false">Show</button><span id="backdropScratchLabel" class="circuitCompareLabel">Scratch</span></div>
      <div id="backdropExternalRow" class="referenceLayerRow"><span class="circuitCompareSlot">E</span><button id="backdropExternalAdd" type="button">Add</button><button id="backdropExternalRemove" type="button" disabled>Remove</button><span id="backdropExternalLabel" class="circuitCompareLabel">External Overlay</span></div>
      <input id="backdropExternalInput" type="file" accept="image/*" hidden>
    </div>`;
    select.insertAdjacentElement('afterend',details);
    $('backdropScratchClear')?.addEventListener('click',clearScratchPage);
    $('backdropScratchToggle')?.addEventListener('click',()=>setScratchActive(!scratchActive));
    $('backdropExternalAdd')?.addEventListener('click',()=>$('backdropExternalInput')?.click());
    $('backdropExternalRemove')?.addEventListener('click',removeExternalOverlay);
    $('backdropExternalInput')?.addEventListener('change',async e=>{const f=e.target.files?.[0];if(f)await loadExternalOverlay(f);e.target.value='';});
  }
  ensureExternalTransformUi();
  const rows=$('circuitReferenceLayerRows'),compare=$('circuitCompareAB'),scratchRow=$('backdropScratchRow');
  if(rows&&compare&&compare.parentElement!==rows)rows.insertBefore(compare,scratchRow||rows.firstChild);
  $('backdropScratchToggle')?.classList.toggle('active',scratchActive);
  syncReferenceLayerUi();return !!details;
}
function scheduleReferenceLayersUi(){let tries=0;const tick=()=>{ensureReferenceLayersUi();if(++tries<240&&(!$('circuitCompareAB')||!$('circuitReferenceLayers')))setTimeout(tick,50);};tick();}
async function importScratchIff(file){
  if(!file)return false;
  try{const bytes=new Uint8Array(await file.arrayBuffer()),result=D.convertIlbmToTrack(bytes,T.VERIFIED_TRACK_PALETTE_WORDS,{remap:$('backdropRemap')?.checked!==false}),before=scratchResources.backdrop.data.slice();scratchResources.backdrop.data.set(result.trackBytes.subarray(0,D.TRACK_BYTES));previewPixels(result.pixels);pushUndo(before);setState(`Scratch imported ${file.name} · ${result.sourceWidth}×${result.sourceHeight}${result.remapped?' · palette remapped':''}.`);syncUi();return true;}catch(err){setState(`ERROR: ${err.message}`,true);return false;}
}
function downloadScratchIff(){
  try{const E=root.IndyHeatBackdropIlbmExport;if(!E?.encodeBackdropIlbm)throw new Error('Backdrop IFF exporter is unavailable.');const words=Array.from(paletteInfo()?.words||T.VERIFIED_TRACK_PALETTE_WORDS||[]).slice(0,32),source=scratchResources.backdrop.data.slice(0,D.TRACK_BYTES),iff=E.encodeBackdropIlbm(source,words),parsed=D.parseIlbm(iff),roundTrip=D.encodeTrackPlanar(D.decodeIlbmPixels(parsed));if(!D.arraysEqual(source,roundTrip))throw new Error('Scratch IFF self-check failed.');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([iff],{type:'image/x-ilbm'}));a.download='indyheat_scratch_backdrop.iff';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);setState('Scratch exported as indyheat_scratch_backdrop.iff · 320×256 · 5 planes.');return true;}catch(err){setState(`ERROR: ${err.message}`,true);return false;}
}
async function handleBackdropIffInput(e){
  if(!scratchActive){const r=currentResource(),before=r?.data.slice(0,D.TRACK_BYTES);setTimeout(syncLiveFromResource,80);setTimeout(()=>{syncLiveFromResource();if(before)pushUndo(before);},320);return;}
  e.preventDefault();e.stopImmediatePropagation();const input=e.target,file=input?.files?.[0];if(file)await importScratchIff(file);if(input)input.value='';
}
function handleScratchFileClick(e){if(!scratchActive)return;const button=e.target?.closest?.('#backdropExportIff');if(!button)return;e.preventDefault();e.stopImmediatePropagation();downloadScratchIff();}
function setState(text,bad=false){const e=$('backdropPaintState');if(!e)return;e.textContent=text||'';e.classList.toggle('bad',!!bad);}
function setPaintColour(v){v=Number(v);if(!Number.isInteger(v)||v<0||v>=PALETTE_SIZE)return;paintColour=v;renderPaletteSelection();drawOverlay();}
function brushSize(){return Math.max(1,Number($('backdropBrushSize')?.value)||1);}
function normalBrushPoints(points){return L.expandPointsWithBrush(points,brushSize(),'square');}
function isClickShape(tool=drawTool){return tool==='curve'||tool==='freeform';}
function toolIsFilled(tool){return tool==='rectangle-filled'||tool==='ellipse-filled';}
function toolLabel(tool){return DRAW_TOOL_DEFS.find(d=>d.value===tool)?.title||tool;}
function freeformCloseReady(g,p){return !!(g&&g.tool==='freeform'&&(g.vertices?.length||0)>=3&&p&&L.pointDistance(g.start,p)<=3);}
function capturePolygonCloseTolerance(g){const pts=g?.vertices||[];if(pts.length<3)return 3;const minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x)),minY=Math.min(...pts.map(p=>p.y)),maxY=Math.max(...pts.map(p=>p.y)),span=Math.max(maxX-minX,maxY-minY);return Math.max(1,Math.min(3,span/3));}
function capturePolygonCloseReady(g,p){return !!(g&&g.kind==='capture-poly'&&(g.vertices?.length||0)>=3&&p&&L.pointDistance(g.start,p)<=capturePolygonCloseTolerance(g));}
function secondaryPaintAction(e){return !!e&&(e.button===2||(e.button===0&&e.ctrlKey));}
function primaryPaintAction(e){return !!e&&e.button===0&&!e.ctrlKey;}
function brushTransparencyIndex(){const k=sourceKey();if(!brushTransparencyBySource.has(k))brushTransparencyBySource.set(k,0);return brushTransparencyBySource.get(k);}
function setTransparencyPickArmed(on){transparencyPickArmed=!!on;syncTransparencyUi();if(transparencyPickArmed)setState('Set transparent armed · choose the editor brush-transparency colour from the Backdrop palette. Right-clicking a swatch also sets it directly.');}
function setTransparencyIndex(v){v=Number(v);if(!Number.isInteger(v)||v<0||v>=PALETTE_SIZE)return;brushTransparencyBySource.set(sourceKey(),v);transparencyPickArmed=false;syncTransparencyUi();setState(`Backdrop brush transparency index set to ${v}. This is an editor brush/mask colour only; it does not change the game bitmap format.`);drawOverlay();}
function syncTransparencyUi(){const v=brushTransparencyIndex(),value=$('backdropTransparentValue');if(value)value.textContent=String(v);const sw=$('backdropTransparentSwatch'),c=paletteRgb(v);if(sw&&c)sw.style.background=`rgb(${c[0]},${c[1]},${c[2]})`;const arm=$('backdropSetTransparent');if(arm)arm.classList.toggle('active',transparencyPickArmed);renderPaletteSelection();}

function paletteRecords(){const info=paletteInfo();return Array.from({length:PALETTE_SIZE},(_,i)=>({rgb:info.rgb?.[i]||[255,0,255],title:`${i} · $${paletteWord(i).toString(16).toUpperCase().padStart(3,'0')}`}));}
function configurePaletteControl(){const host=$('backdropPaintPalette'),PC=root.IndyHeatPaletteControl;if(!host||!PC)return false;return PC.configure(host,{records:paletteRecords,legacyDataKey:'backdropColour',primary:()=>paintColour,secondary:brushTransparencyIndex,primaryTarget:()=>transparencyPickArmed?'secondary':'primary',onPrimary:setPaintColour,onSecondary:setTransparencyIndex,secondaryTitle:'brush transparency index · right-click to keep/set',stencil:true});}
function applyStencil(basePixels,outPixels){const host=$('backdropPaintPalette'),PC=root.IndyHeatPaletteControl;return host&&PC?.applyStencilPixels?PC.applyStencilPixels(host,basePixels,outPixels):outPixels;}
function applyForegroundStencil(baseForeground,proposedForeground,backdropBase){const host=$('backdropPaintPalette'),PC=root.IndyHeatPaletteControl;if(!host||!PC?.stencilActive?.(host)||!PC?.stencilBlocked)return proposedForeground;const out=Uint8Array.from(proposedForeground);for(let i=0;i<out.length;i++)if(PC.stencilBlocked(host,backdropBase[i]))out[i]=baseForeground[i];return out;}
function applySurfaceStencil(baseSurface,proposedSurface,backdropBase){const host=$('backdropPaintPalette'),PC=root.IndyHeatPaletteControl;if(!host||!PC?.stencilActive?.(host)||!PC?.stencilBlocked)return proposedSurface;const out=Uint8Array.from(proposedSurface);for(let cy=0;cy<SURFACE_H;cy++)for(let cx=0;cx<SURFACE_W;cx++){const i=cy*SURFACE_W+cx;if(out[i]===baseSurface[i])continue;let blocked=false;for(let dy=0;dy<2&&!blocked;dy++)for(let dx=0;dx<2;dx++){const px=cx*2+dx,py=cy*2+dy;if(py<H&&PC.stencilBlocked(host,backdropBase[py*W+px])){blocked=true;break;}}if(blocked)out[i]=baseSurface[i];}return out;}
function renderPalette(){const info=paletteInfo();configurePaletteControl();const src=$('backdropPaletteSource');if(src)src.textContent=info.sourceLabel||'verified Indy Heat race palette';syncTransparencyUi();}
function renderPaletteSelection(){const host=$('backdropPaintPalette'),PC=root.IndyHeatPaletteControl;if(host&&PC)PC.render(host);}
function syncUi(){
  document.querySelectorAll('[data-backdrop-draw-tool]').forEach(b=>{const tool=b.dataset.backdropDrawTool;b.classList.toggle('active',!captureMode&&tool===drawTool);setSpecialDisabled(b,specialActive()&&tool!=='pick'&&!specialToolAllowed(tool));});
  document.querySelectorAll('[data-backdrop-brush-capture]').forEach(b=>{b.classList.toggle('active',b.dataset.backdropBrushCapture===captureMode);setSpecialDisabled(b,false);});
  document.querySelectorAll('[data-backdrop-library-id]').forEach(b=>b.classList.toggle('active',!!activeLibraryId&&b.dataset.backdropLibraryId===activeLibraryId));
  const slider=$('backdropBrushSize');if(slider)slider.disabled=!!brush;const label=$('backdropBrushSizeText');if(label)label.textContent=brush?`Brush ${brush.width}×${brush.height}`:String(slider?.value||1);
  const clear=$('backdropBrushClear'),save=$('backdropBrushSave');if(clear)clear.disabled=!brush;if(save)save.disabled=!brush;document.querySelectorAll('[data-backdrop-brush-rotate],[data-backdrop-brush-flip]').forEach(b=>b.disabled=!brush);
  const dims=$('backdropBrushDims');if(dims)dims.textContent=brush?`${brush.width}×${brush.height} · ${brush.visiblePixels} visible px · hotspot ${brush.hotspotX},${brush.hotspotY}`:'Standard pixel brush';
  const undo=$('backdropPaintUndo');if(undo)undo.disabled=!sourceUndo().length;const redo=$('backdropPaintRedo');if(redo)redo.disabled=!sourceRedo().length;
  const restore=$('backdropPaintRestore');if(restore){restore.textContent='Restore loaded';restore.disabled=scratchActive||!baselineBySource.has(sourceKey());restore.title=scratchActive?'Scratch is cleared from the Reference layers group on the left.':'';}
  const raw=$('backdropExport');if(raw){raw.disabled=scratchActive;raw.title=scratchActive?'Raw .bin export is disabled for the Scratch page. Switch back to the track to export the runtime Backdrop resource.':'';}
  syncReferenceLayerUi();
}
function selectDrawTool(tool){if(!DRAW_TOOL_DEFS.some(d=>d.value===tool))return;if(specialActive()&&tool!=='pick'&&!specialToolAllowed(tool)){setState(`${toolLabel(tool)} is not available for the active Special Function.`);return;}drawTool=tool;captureMode=null;gesture=null;hover=null;syncUi();if(tool==='curve')setState('Curve: click start, click end, then move and click to set the bend.');else if(tool==='freeform')setState('Free-form: click vertices; close within 3px of the start to commit.');else if(tool==='fill'&&brush)setState('Custom brush Fill tiles the brush through the connected colour area.');else setState(brush?`${toolLabel(tool)} with custom ${brush.width}×${brush.height} brush.`:`${toolLabel(tool)} with standard pixel brush.`);drawOverlay();}
function selectCapture(mode){captureMode=mode;gesture=null;hover=null;syncUi();if(mode==='polygon')setState('Multi-edge capture: click successive vertices; close near the start to capture. Start with right-click to capture and remove the selected pixels.');else if(mode==='trace')setState('Hold left to trace a freeform capture lasso; hold right to capture and remove the selected pixels.');else setState(`Drag a ${mode==='ellipse'?'ellipse':'rectangle'} capture area; use right mouse to capture and remove the selected pixels.`);drawOverlay();}
function activateCapturedBrush(newBrush,message,{libraryId=null}={}){brush=newBrush;activeLibraryId=libraryId;captureMode=null;if(!specialActive())drawTool='freehand';gesture=null;hover=null;syncUi();setState(specialActive()?`${message} The active Special Function remains selected.`:`${message} Pencil is now selected; choose Line/Curve/shape/Fill to use the same brush.`);drawOverlay();}
function activateLibraryBrush(id){try{const entry=Library.get(id),loaded=Library.materialise(entry);if(!entry||!loaded)throw new Error('Brush library entry is unavailable.');activateCapturedBrush(loaded,`${entry.name} brush selected.`,{libraryId:entry.id});}catch(err){setState(`ERROR: ${err.message}`,true);}}
function clearBrush(){brush=null;activeLibraryId=null;captureMode=null;gesture=null;hover=null;drawTool=specialActive()&&!specialToolAllowed('freehand')?(SF?.selected?.()?.supportedTools?.[0]||'freehand'):'freehand';syncUi();setState('Brush cleared. Standard brush-size control restored.');drawOverlay();}
function rotateBrush(deg){if(!brush)return;try{brush=transformRasterBrush(brush,{rotation:deg});activeLibraryId=null;syncUi();setState(`Brush rotated ${deg}° · now ${brush.width}×${brush.height}.`);drawOverlay();}catch(err){setState(`ERROR: ${err.message}`,true);}}
function flipBrush(axis){if(!brush)return;try{brush=transformRasterBrush(brush,axis==='h'?{flipH:true}:{flipV:true});activeLibraryId=null;syncUi();setState(`Brush flipped ${axis==='h'?'horizontally':'vertically'}.`);drawOverlay();}catch(err){setState(`ERROR: ${err.message}`,true);}}
function downloadBrush(){if(!brush)return;try{const bytes=encodeBrushFile(brush,{paletteSize:PALETTE_SIZE}),a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));a.download=`indyheat_backdrop_brush_${brush.width}x${brush.height}.ihbrush`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);setState(`Saved ${brush.width}×${brush.height} brush · IHBR v${BRUSH_VERSION}.`);}catch(err){setState(`ERROR: ${err.message}`,true);}}
async function loadBrushFile(file){if(!file)return;try{const loaded=decodeBrushFile(new Uint8Array(await file.arrayBuffer()));if(loaded.paletteSize!==PALETTE_SIZE)throw new Error(`Brush uses a ${loaded.paletteSize}-colour palette; Backdrop uses ${PALETTE_SIZE}.`);activateCapturedBrush(loaded,`Loaded ${file.name} · ${loaded.width}×${loaded.height}.`);}catch(err){setState(`ERROR: ${err.message}`,true);}}

function captureMask(g){if(!g)return [];const end=g.current||g.start;if(captureMode==='rectangle')return rectangleMask(g.start,end,W,H);if(captureMode==='ellipse')return ellipseMask(g.start,end,W,H);if(captureMode==='polygon')return polygonMask(g.vertices||[],W,H);if(captureMode==='trace')return polygonMask(g.path||[],W,H);return [];}
function finishCapture(){const g=gesture,pixels=currentPixels(),r=currentResource();if(!g||!pixels||!r)return;try{const mask=captureMask(g),transparent=brushTransparencyIndex(),label=captureMode==='rectangle'?'Rectangle':captureMode==='ellipse'?'Ellipse':captureMode==='polygon'?'Multi-edge':'Traced freeform',b=captureRasterBrush(pixels,W,H,transparent,mask,{name:`Backdrop ${label} capture`,key:'backdrop_free_brush'}),cut=!!g.cut,before=r.data.slice(0,D.TRACK_BYTES);gesture=null;if(cut){let out=Uint8Array.from(pixels);for(const p of mask){const x=Math.round(Array.isArray(p)?p[0]:p?.x),y=Math.round(Array.isArray(p)?p[1]:p?.y);if(x>=0&&y>=0&&x<W&&y<H)out[y*W+x]=transparent;}out=applyStencil(pixels,out);writePixels(out);pushUndo(before);}activateCapturedBrush(b,`${label} captured${cut?' and removed from canvas':''} · ${b.width}×${b.height}.`);}catch(err){gesture=null;setState(`ERROR: ${err.message}`,true);syncUi();drawOverlay();}}

function applyNormalPoints(basePixels,points,value=paintColour){const out=Uint8Array.from(basePixels);for(const [x,y] of normalBrushPoints(points))if(x>=0&&y>=0&&x<W&&y<H)out[y*W+x]=value;return out;}
function applyPoints(basePixels,points,{filled=false,anchor=null,secondary=false}={}){const maskColour=brushTransparencyIndex();let out;if(brush){if(secondary)out=(filled?patternFillBrushMask(basePixels,W,H,brush,points,anchor?.x??0,anchor?.y??0,maskColour):stampBrushMaskPoints(basePixels,W,H,brush,points,maskColour)).pixels;else if(filled)out=patternFillOpaqueRasterBrush(basePixels,W,H,brush,points,anchor?.x??0,anchor?.y??0).pixels;else out=stampOpaqueRasterBrushPoints(basePixels,W,H,brush,points).pixels;}else out=applyNormalPoints(basePixels,points,secondary?maskColour:paintColour);return applyStencil(basePixels,out);}
function commitPixels(pixels,snapshot,message){try{writePixels(pixels);pushUndo(snapshot);gesture=null;hover=null;setState(message);syncUi();drawOverlay();return true;}catch(err){setState(`ERROR: ${err.message}`,true);return false;}}
function commitPoints(points,{filled=false,anchor=null,snapshot=null,secondary=false}={}){const base=currentPixels(),r=currentResource();if(!base||!r)return false;const before=snapshot||r.data.slice(0,D.TRACK_BYTES);try{const out=applyPoints(base,points,{filled,anchor,secondary});return commitPixels(out,before,`${toolLabel(drawTool)} committed${brush?(secondary?' as transparency-colour brush mask':' with custom brush'):secondary?' using brush transparency index':''}.`);}catch(err){setState(`ERROR: ${err.message}`,true);return false;}}
function commitFill(pt,secondary=false){const base=currentPixels(),r=currentResource();if(!base||!r)return;const PC=root.IndyHeatPaletteControl,host=$('backdropPaintPalette'),target=base[pt.y*W+pt.x];if(host&&PC?.stencilBlocked?.(host,target)){setState(`Fill blocked by stencil colour ${target}.`);return;}const probe=(target+1)%PALETTE_SIZE,indices=L.floodFillIndices(base,W,H,pt.x,pt.y,probe),points=indices.map(i=>[i%W,(i/W)|0]);if(!points.length)return;const before=r.data.slice(0,D.TRACK_BYTES);try{let out;if(brush)out=(secondary?patternFillBrushMask(base,W,H,brush,points,pt.x,pt.y,brushTransparencyIndex()):patternFillOpaqueRasterBrush(base,W,H,brush,points,pt.x,pt.y)).pixels;else{out=base.slice();const value=secondary?brushTransparencyIndex():paintColour;for(const i of indices)out[i]=value;}out=applyStencil(base,out);commitPixels(out,before,`Fill committed${brush?(secondary?' as transparency-colour brush mask':' with custom brush pattern'):secondary?' using brush transparency index '+brushTransparencyIndex():''}.`);}catch(err){setState(`ERROR: ${err.message}`,true);}}
function shapePoints(tool,start,end){if(tool==='line')return L.linePoints(start.x,start.y,end.x,end.y);if(tool==='rectangle')return L.rectanglePoints(start.x,start.y,end.x,end.y);if(tool==='rectangle-filled')return L.filledRectanglePoints(start.x,start.y,end.x,end.y);if(tool==='ellipse')return L.ellipsePoints(start.x,start.y,end.x,end.y);if(tool==='ellipse-filled')return L.filledEllipsePoints(start.x,start.y,end.x,end.y);return [[end.x,end.y]];}
function specialGeometry(tool,points,{start=null,end=null,control=null,vertices=null,seed=null,targetColour=null,filled=false,secondary=false,complete=false}={}){return {tool,points,start:start||null,end:end||null,control:control||null,vertices:vertices||[],seed:seed||null,targetColour,filled:!!filled,secondary:!!secondary,complete};}
function specialFillGeometry(pt,secondary=false){
  const base=currentPixels();if(!base||!pt)return null;
  const target=base[pt.y*W+pt.x],probe=(target+1)%PALETTE_SIZE,indices=L.floodFillIndices(base,W,H,pt.x,pt.y,probe);
  const points=indices.map(i=>({x:i%W,y:(i/W)|0}));
  return specialGeometry('fill',points,{start:pt,end:pt,seed:pt,targetColour:target,filled:true,secondary,complete:true});
}
function specialGestureGeometry(){
  if(!specialActive()||!gesture||!specialToolAllowed(gesture.tool))return null;
  if(gesture.kind==='clickshape'){
    if(gesture.tool==='curve'){
      const end=gesture.stage===1?(gesture.current||gesture.start):gesture.end,bend=gesture.stage===1?null:(gesture.bend||gesture.current||gesture.end);
      const points=gesture.stage===1?L.linePoints(gesture.start.x,gesture.start.y,end.x,end.y):L.curvePoints(gesture.start,gesture.end,bend);
      return specialGeometry('curve',points,{start:gesture.start,end,control:bend,secondary:gesture.secondary,complete:false});
    }
    const verts=[...(gesture.vertices||[])];if(gesture.current)verts.push(gesture.current);
    return specialGeometry(gesture.tool,L.polylinePoints(verts,{closed:false}),{start:gesture.start,end:gesture.current||gesture.start,vertices:verts,secondary:gesture.secondary,complete:false});
  }
  if(gesture.kind==='drag'&&gesture.tool==='freehand'){
    const points=(gesture.specialPath||[]).map(p=>({x:p.x,y:p.y}));
    if(points.length)return specialGeometry('freehand',points,{start:gesture.start,end:gesture.current||gesture.start,secondary:gesture.secondary,complete:false});
  }
  if(gesture.kind==='drag')return specialGeometry(gesture.tool,shapePoints(gesture.tool,gesture.start,gesture.current||gesture.start),{start:gesture.start,end:gesture.current||gesture.start,filled:toolIsFilled(gesture.tool),secondary:gesture.secondary,complete:false});
  return null;
}
function commitSpecialGeometry(geometry,snapshot){return !!SF?.commitGeometry?.('backdrop',geometry,{historyToken:snapshot});}

function overlayCanvas(){return $('backdropPaintCanvas');}
function syncOverlaySize(){const v=$('view'),c=overlayCanvas();if(!v||!c)return;if(c.width!==v.width||c.height!==v.height){c.width=v.width;c.height=v.height;c.getContext('2d').imageSmoothingEnabled=false;}drawOverlay();}
function eventPoint(e,{clamped=false}={}){const c=$('view');if(!c)return null;const r=c.getBoundingClientRect();let x=Math.floor((e.clientX-r.left)*W/r.width),y=Math.floor((e.clientY-r.top)*H/r.height),inside=x>=0&&y>=0&&x<W&&y<H;if(clamped){x=clamp(x,0,W-1);y=clamp(y,0,H-1);}return{x,y,inside};}
function handleClickShapeDown(e,pt){
  const secondary=secondaryPaintAction(e);
  if(!gesture||gesture.kind!=='clickshape'||gesture.tool!==drawTool){const r=currentResource();gesture={kind:'clickshape',tool:drawTool,start:{x:pt.x,y:pt.y},current:{x:pt.x,y:pt.y},snapshot:r?.data.slice(0,D.TRACK_BYTES),secondary,stage:1,vertices:[{x:pt.x,y:pt.y}]};if(drawTool==='curve')setState('Curve: start set · click the end point.');else setState('Free-form: start set · click more vertices, then close within 3px of the start.');drawOverlay();return;}
  if(drawTool==='curve'){if(gesture.stage===1){if(L.pointDistance(gesture.start,pt)<.001)return;gesture.end={x:pt.x,y:pt.y};gesture.stage=2;setState('Curve: move away from the straight line to set the bend, then click to finalise.');drawOverlay();return;}const points=L.curvePoints(gesture.start,gesture.end,pt);if(specialActive()&&specialToolAllowed('curve')){commitSpecialGeometry(specialGeometry('curve',points,{start:gesture.start,end:gesture.end,control:pt,secondary:gesture.secondary,complete:true}),gesture.snapshot);return;}commitPoints(points,{snapshot:gesture.snapshot,secondary:gesture.secondary});return;}
  if(drawTool==='freeform'){if(freeformCloseReady(gesture,pt)){const points=L.polylinePoints(gesture.vertices,{closed:true});if(specialActive()&&specialToolAllowed('freeform')){commitSpecialGeometry(specialGeometry('freeform',points,{start:gesture.start,end:gesture.start,vertices:gesture.vertices,secondary:gesture.secondary,complete:true}),gesture.snapshot);return;}commitPoints(points,{snapshot:gesture.snapshot,secondary:gesture.secondary});return;}const last=gesture.vertices[gesture.vertices.length-1];if(L.pointDistance(last,pt)<.001)return;gesture.vertices.push({x:pt.x,y:pt.y});gesture.current={x:pt.x,y:pt.y};setState(`Free-form: ${gesture.vertices.length} vertices · click more or close within 3px of start.`);drawOverlay();}
}
function beginDraw(e,pt){
  const secondary=secondaryPaintAction(e);
  if(specialActive()&&!specialToolAllowed(drawTool)){setState(`${toolLabel(drawTool)} is not available for the active Special Function.`);return;}
  if(drawTool==='pick'){const pixels=currentPixels(),picked=pixels?.[pt.y*W+pt.x];if(picked!=null){if(secondary){setTransparencyIndex(picked);setState(`Picked Backdrop brush transparency index ${picked} from canvas.`);}else{setPaintColour(picked);setState(`Picked Backdrop colour ${picked}.`);}}return;}
  if(drawTool==='fill'){
    if(specialActive()&&specialToolAllowed('fill')){
      const host=$('backdropPaintPalette'),PC=root.IndyHeatPaletteControl,base=currentPixels(),target=base?.[pt.y*W+pt.x];
      if(host&&PC?.stencilBlocked?.(host,target)){setState(`Fill blocked by stencil colour ${target}.`);return;}
      const r=currentResource(),geometry=specialFillGeometry(pt,secondary);if(geometry)commitSpecialGeometry(geometry,r?.data.slice(0,D.TRACK_BYTES));return;
    }
    commitFill(pt,secondary);return;
  }
  if(isClickShape()){handleClickShapeDown(e,pt);return;}
  const pixels=currentPixels(),r=currentResource();if(!pixels||!r)return;gesture={kind:'drag',tool:drawTool,pointerId:e.pointerId,start:{x:pt.x,y:pt.y},current:{x:pt.x,y:pt.y},last:{x:pt.x,y:pt.y},secondary,snapshot:r.data.slice(0,D.TRACK_BYTES),workingPixels:pixels.slice(),specialPath:drawTool==='freehand'&&specialActive()?[{x:pt.x,y:pt.y}]:null};$('view')?.setPointerCapture?.(e.pointerId);
  if(drawTool==='freehand'&&!specialActive()){gesture.workingPixels=applyPoints(gesture.workingPixels,[[pt.x,pt.y]],{secondary});previewPixels(gesture.workingPixels);if(secondary)setState(`Pencil mask · brush transparency index ${brushTransparencyIndex()}.`);}drawOverlay();
}
function moveDraw(e,pt){hover=pt?.inside?pt:null;if(gesture?.kind==='clickshape'){gesture.current={x:pt.x,y:pt.y};if(drawTool==='curve'&&gesture.stage===2)gesture.bend={x:pt.x,y:pt.y};drawOverlay();return;}if(!gesture||gesture.kind!=='drag'||gesture.pointerId!==e.pointerId){drawOverlay();return;}gesture.current={x:pt.x,y:pt.y};if(drawTool==='freehand'){const pts=L.linePoints(gesture.last.x,gesture.last.y,pt.x,pt.y);if(specialActive()&&specialToolAllowed('freehand')){const path=gesture.specialPath||(gesture.specialPath=[{x:gesture.start.x,y:gesture.start.y}]);for(const q of pts){const x=Array.isArray(q)?q[0]:q.x,y=Array.isArray(q)?q[1]:q.y,last=path[path.length-1];if(!last||last.x!==x||last.y!==y)path.push({x,y});}}else{gesture.workingPixels=applyPoints(gesture.workingPixels,pts,{secondary:gesture.secondary});previewPixels(gesture.workingPixels);}gesture.last={x:pt.x,y:pt.y};}drawOverlay();}
function endDraw(e,pt){if(!gesture||gesture.kind!=='drag'||gesture.pointerId!==e.pointerId)return;const g=gesture;try{$('view')?.releasePointerCapture?.(e.pointerId);}catch(_e){}if(specialActive()&&specialToolAllowed(g.tool)){const end=pt||g.current;if(g.tool==='freehand'){const path=g.specialPath||[{x:g.start.x,y:g.start.y}],last=path[path.length-1];if(end&&(!last||last.x!==end.x||last.y!==end.y)){for(const q of L.linePoints(last?.x??g.start.x,last?.y??g.start.y,end.x,end.y)){const x=Array.isArray(q)?q[0]:q.x,y=Array.isArray(q)?q[1]:q.y,tail=path[path.length-1];if(!tail||tail.x!==x||tail.y!==y)path.push({x,y});}}commitSpecialGeometry(specialGeometry('freehand',path,{start:g.start,end,secondary:g.secondary,complete:true}),g.snapshot);return;}const points=shapePoints(g.tool,g.start,end);commitSpecialGeometry(specialGeometry(g.tool,points,{start:g.start,end,filled:toolIsFilled(g.tool),secondary:g.secondary,complete:true}),g.snapshot);return;}if(g.tool==='freehand'){commitPixels(g.workingPixels,g.snapshot,`Pencil committed${brush?(g.secondary?' as transparency-colour brush mask':' with custom brush'):g.secondary?' using brush transparency index':''}.`);return;}commitPoints(shapePoints(g.tool,g.start,pt||g.current),{filled:toolIsFilled(g.tool),anchor:g.start,snapshot:g.snapshot,secondary:g.secondary});}
function cancelGesture(){if(specialActive())SF?.clearPreview?.('backdrop');else if(gesture?.kind==='drag'&&gesture.snapshot){try{previewPixels(D.decodeTrackPlanar(gesture.snapshot));}catch(_e){}}gesture=null;hover=null;drawOverlay();}

function pointerDown(e){if(!backdropActive())return;const primary=primaryPaintAction(e),secondary=secondaryPaintAction(e);if(!primary&&!secondary)return;const pt=eventPoint(e);if(!pt?.inside)return;e.preventDefault();e.stopImmediatePropagation();if(captureMode){if(captureMode==='polygon'){if(!gesture||gesture.kind!=='capture-poly'){gesture={kind:'capture-poly',start:{x:pt.x,y:pt.y},current:{x:pt.x,y:pt.y},vertices:[{x:pt.x,y:pt.y}],cut:secondary};setState(`Multi-edge capture: start set · ${secondary?'cut mode · ':''}click more vertices, then close near the start.`);}else if(capturePolygonCloseReady(gesture,pt)){finishCapture();return;}else{const last=gesture.vertices[gesture.vertices.length-1];if(L.pointDistance(last,pt)>=.001)gesture.vertices.push({x:pt.x,y:pt.y});gesture.current={x:pt.x,y:pt.y};setState(`Multi-edge capture: ${gesture.vertices.length} vertices${gesture.cut?' · cut mode':''} · click more or close near start.`);}drawOverlay();return;}gesture={kind:'capture',pointerId:e.pointerId,start:{x:pt.x,y:pt.y},current:{x:pt.x,y:pt.y},path:[{x:pt.x,y:pt.y}],cut:secondary};$('view')?.setPointerCapture?.(e.pointerId);drawOverlay();return;}beginDraw(e,pt);}
function pointerMove(e){if(!backdropActive())return;const pt=eventPoint(e,{clamped:!!gesture});if(!pt)return;e.preventDefault();if(captureMode){if(captureMode==='polygon'){hover=pt.inside?pt:null;if(gesture?.kind==='capture-poly')gesture.current={x:pt.x,y:pt.y};drawOverlay();return;}if(!gesture||gesture.kind!=='capture'||gesture.pointerId!==e.pointerId){hover=pt.inside?pt:null;drawOverlay();return;}gesture.current={x:pt.x,y:pt.y};if(captureMode==='trace'){const last=gesture.path[gesture.path.length-1];if(!last||last.x!==pt.x||last.y!==pt.y)gesture.path.push({x:pt.x,y:pt.y});}drawOverlay();return;}moveDraw(e,pt);}
function pointerUp(e){if(!backdropActive())return;const pt=eventPoint(e,{clamped:true});if(captureMode==='polygon'&&gesture?.kind==='capture-poly'){e.preventDefault();e.stopImmediatePropagation();return;}if(captureMode&&gesture?.kind==='capture'&&gesture.pointerId===e.pointerId){e.preventDefault();e.stopImmediatePropagation();if(pt)gesture.current={x:pt.x,y:pt.y};if(captureMode==='trace'&&pt){const last=gesture.path[gesture.path.length-1];if(!last||last.x!==pt.x||last.y!==pt.y)gesture.path.push({x:pt.x,y:pt.y});}try{$('view')?.releasePointerCapture?.(e.pointerId);}catch(_e){}finishCapture();return;}if(gesture?.kind==='drag'&&gesture.pointerId===e.pointerId){e.preventDefault();e.stopImmediatePropagation();endDraw(e,pt);}}
function pointerCancel(e){if(!backdropActive())return;if(gesture){e.preventDefault();e.stopImmediatePropagation();cancelGesture();}}

function drawNormalPoints(ctx,points,value=paintColour,alpha=.55){const c=paletteRgb(value),sx=ctx.canvas.width/W,sy=ctx.canvas.height/H;ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle=`rgb(${c[0]},${c[1]},${c[2]})`;for(const [x,y] of normalBrushPoints(points))if(x>=0&&y>=0&&x<W&&y<H)ctx.fillRect(x*sx,y*sy,sx,sy);ctx.restore();}
function drawBrushAt(ctx,anchor,alpha=.7,secondary=false){if(!brush||!anchor?.inside)return;const sx=ctx.canvas.width/W,sy=ctx.canvas.height/H;ctx.save();ctx.globalAlpha=alpha;for(let by=0;by<brush.height;by++)for(let bx=0;bx<brush.width;bx++){const v=brush.pixels[by*brush.width+bx];if(v===brush.transparent)continue;const x=anchor.x-brush.hotspotX+bx,y=anchor.y-brush.hotspotY+by;if(x<0||y<0||x>=W||y>=H)continue;const c=paletteRgb(secondary?brushTransparencyIndex():v);ctx.fillStyle=`rgb(${c[0]},${c[1]},${c[2]})`;ctx.fillRect(x*sx,y*sy,sx,sy);}ctx.restore();}
function drawCustomPoints(ctx,points,filled=false,anchor={x:0,y:0},secondary=false){if(!brush)return;if(filled){const sx=ctx.canvas.width/W,sy=ctx.canvas.height/H,mod=(n,m)=>((n%m)+m)%m;ctx.save();ctx.globalAlpha=.62;for(const [x,y] of points){if(x<0||y<0||x>=W||y>=H)continue;const bx=mod(x-anchor.x+brush.hotspotX,brush.width),by=mod(y-anchor.y+brush.hotspotY,brush.height),v=brush.pixels[by*brush.width+bx];if(v===brush.transparent)continue;const c=paletteRgb(secondary?brushTransparencyIndex():v);ctx.fillStyle=`rgb(${c[0]},${c[1]},${c[2]})`;ctx.fillRect(x*sx,y*sy,sx,sy);}ctx.restore();return;}for(const p of points)drawBrushAt(ctx,{x:p[0],y:p[1],inside:true},.55,secondary);}

function drawCaptureOverlay(ctx){if(!captureMode||!gesture||!['capture','capture-poly'].includes(gesture.kind))return;const sx=ctx.canvas.width/W,sy=ctx.canvas.height/H,a=gesture.start,b=gesture.current||a;ctx.save();ctx.fillStyle=gesture.cut?'rgba(255,92,92,.18)':'rgba(255,216,74,.18)';ctx.strokeStyle=gesture.cut?'#ff6b6b':'#ffd84a';ctx.lineWidth=Math.max(1,Math.min(sx,sy)/2);ctx.setLineDash([Math.max(2,sx),Math.max(2,sy)]);if(captureMode==='trace'){const pts=gesture.path||[];if(pts.length){ctx.beginPath();ctx.moveTo((pts[0].x+.5)*sx,(pts[0].y+.5)*sy);for(let i=1;i<pts.length;i++)ctx.lineTo((pts[i].x+.5)*sx,(pts[i].y+.5)*sy);if(pts.length>2){ctx.closePath();ctx.fill();}ctx.stroke();}}else if(captureMode==='polygon'){const pts=gesture.vertices||[];if(pts.length){ctx.beginPath();ctx.moveTo((pts[0].x+.5)*sx,(pts[0].y+.5)*sy);for(let i=1;i<pts.length;i++)ctx.lineTo((pts[i].x+.5)*sx,(pts[i].y+.5)*sy);if(gesture.current)ctx.lineTo((gesture.current.x+.5)*sx,(gesture.current.y+.5)*sy);if(capturePolygonCloseReady(gesture,gesture.current)){ctx.closePath();ctx.fill();}ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc((pts[0].x+.5)*sx,(pts[0].y+.5)*sy,Math.max(2,Math.min(sx,sy)*1.1),0,Math.PI*2);ctx.stroke();}}else{const q=rectangleBounds(a,b,W,H),x=q.minX*sx,y=q.minY*sy,w=(q.maxX-q.minX+1)*sx,h=(q.maxY-q.minY+1)*sy;if(captureMode==='ellipse'){ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);ctx.fill();ctx.stroke();}else{ctx.fillRect(x,y,w,h);ctx.strokeRect(x+.5,y+.5,Math.max(1,w-1),Math.max(1,h-1));}}ctx.restore();}
function drawOverlay(){const c=overlayCanvas();if(!c)return;const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);if(!backdropActive())return;if(captureMode){drawCaptureOverlay(ctx);return;}if(specialActive()){const geometry=specialGestureGeometry();if(geometry)SF?.previewGeometry?.('backdrop',geometry,{historyToken:gesture?.snapshot});else SF?.clearPreview?.('backdrop');return;}if(gesture?.kind==='clickshape'){let pts=[];if(gesture.tool==='curve'){if(gesture.stage===1)pts=L.linePoints(gesture.start.x,gesture.start.y,(gesture.current||gesture.start).x,(gesture.current||gesture.start).y);else pts=L.curvePoints(gesture.start,gesture.end,gesture.bend||gesture.current||gesture.end);}else{const verts=[...(gesture.vertices||[])];if(gesture.current)verts.push(gesture.current);pts=L.polylinePoints(verts,{closed:false});}brush?drawCustomPoints(ctx,pts,false,{x:0,y:0},gesture.secondary):drawNormalPoints(ctx,pts,gesture.secondary?brushTransparencyIndex():paintColour);return;}if(gesture?.kind==='drag'&&gesture.tool!=='freehand'){const pts=shapePoints(gesture.tool,gesture.start,gesture.current||gesture.start),filled=toolIsFilled(gesture.tool);brush?drawCustomPoints(ctx,pts,filled,gesture.start,gesture.secondary):drawNormalPoints(ctx,pts,gesture.secondary?brushTransparencyIndex():paintColour);return;}if(hover?.inside&&drawTool!=='fill'&&drawTool!=='pick'){if(brush)drawBrushAt(ctx,hover);else drawNormalPoints(ctx,[[hover.x,hover.y]],paintColour,.68);}}

function drawLibraryThumbnail(canvas,entry){const b=entry?.brush,ctx=canvas?.getContext?.('2d');if(!b||!ctx)return;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=false;const scale=Math.max(1,Math.floor(Math.min((canvas.width-4)/b.width,(canvas.height-4)/b.height))),ox=Math.floor((canvas.width-b.width*scale)/2),oy=Math.floor((canvas.height-b.height*scale)/2);for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++){const v=b.pixels[y*b.width+x];if(v===b.transparent)continue;const c=paletteRgb(v);ctx.fillStyle=`rgb(${c[0]},${c[1]},${c[2]})`;ctx.fillRect(ox+x*scale,oy+y*scale,scale,scale);}}
function renderBrushLibrary(){const host=$('backdropBrushLibraryList');if(!host)return;const entries=Library.list({target:'backdrop'});host.innerHTML='';host.classList.toggle('empty',!entries.length);if(!entries.length){const m=document.createElement('div');m.className='muted emptyBrushLibrary';m.textContent='No Backdrop pre-made brushes installed yet.';host.appendChild(m);}for(const entry of entries){const b=document.createElement('button');b.type='button';b.dataset.backdropLibraryId=entry.id;b.title=`${entry.name} · ${entry.brush.width}×${entry.brush.height} · ${entry.source}`;b.innerHTML='<canvas width="34" height="26" aria-hidden="true"></canvas><span></span>';b.querySelector('span').textContent=entry.name;b.addEventListener('click',()=>activateLibraryBrush(entry.id));host.appendChild(b);drawLibraryThumbnail(b.querySelector('canvas'),entry);}const count=$('backdropBrushLibraryCount');if(count)count.textContent=String(entries.length);syncUi();}

function drawSpecialLayerPreview(layers,baseLayers){
  const canvas=overlayCanvas(),ctx=canvas?.getContext?.('2d');if(!canvas||!ctx)return false;
  const sx=canvas.width/W,sy=canvas.height/H,backdropBase=baseLayers?.backdrop||currentPixels();
  let drew=false;
  const foreground=layers?.foreground,foregroundBase=baseLayers?.foreground;
  if(foreground&&foregroundBase&&backdropBase){
    const effective=applyForegroundStencil(foregroundBase,foreground,backdropBase);
    ctx.save();
    for(let i=0;i<effective.length;i++){
      if(effective[i]===foregroundBase[i])continue;
      const x=i%W,y=(i/W)|0;
      ctx.fillStyle=effective[i]?'rgba(245,189,79,.68)':'rgba(18,22,28,.70)';
      ctx.fillRect(x*sx,y*sy,Math.max(1,sx),Math.max(1,sy));drew=true;
    }
    ctx.restore();
  }
  const surface=layers?.surface,surfaceBase=baseLayers?.surface;
  if(surface&&surfaceBase&&backdropBase){
    const effective=applySurfaceStencil(surfaceBase,surface,backdropBase),colours=['rgba(255,255,255,.46)','rgba(220,69,69,.62)','rgba(94,212,108,.62)','rgba(74,121,232,.62)'];
    ctx.save();
    const cw=2*sx,ch=2*sy;
    for(let i=0;i<effective.length;i++){
      if(effective[i]===surfaceBase[i])continue;
      const cx=i%SURFACE_W,cy=(i/SURFACE_W)|0;
      ctx.fillStyle=colours[effective[i]]||'rgba(255,255,255,.52)';
      ctx.fillRect(cx*cw,cy*ch,Math.max(1,cw),Math.max(1,ch));drew=true;
    }
    ctx.restore();
  }
  return drew;
}
function clearSpecialLayerPreview(){const c=overlayCanvas(),ctx=c?.getContext?.('2d');if(!c||!ctx)return false;ctx.clearRect(0,0,c.width,c.height);return true;}

function specialTemplate(){
  if(!brush)return null;
  const entry=activeLibraryId?Library.get(activeLibraryId):null;
  return {id:activeLibraryId||null,name:entry?.name||brush.name||'Backdrop brush',width:brush.width,height:brush.height,hotspotX:brush.hotspotX,hotspotY:brush.hotspotY,transparent:brush.transparent,paletteSize:brush.paletteSize||PALETTE_SIZE,pixels:brush.pixels};
}
function installSpecialFunctionsAdapter(){
  if(!SF?.attachAdapter)return false;
  SF.attachAdapter('backdrop',{
    width:W,height:H,paletteSize:PALETTE_SIZE,
    getTool:()=>drawTool,
    setTool:tool=>selectDrawTool(tool),
    getPrimaryColour:()=>paintColour,
    getToolState:()=>({brushSize:brushSize(),brushShape:'square',hatched:false}),
    getTemplate:specialTemplate,
    paletteRgb,paletteWord,
    layerInfo(name){
      if(name==='backdrop')return {width:W,height:H,paletteSize:PALETTE_SIZE,kind:'indexed',screenWidth:W,screenHeight:H,cellWidth:1,cellHeight:1};
      if(name==='foreground')return {width:W,height:H,paletteSize:2,kind:'binary',screenWidth:W,screenHeight:H,cellWidth:1,cellHeight:1};
      if(name==='surface')return {width:SURFACE_W,height:SURFACE_H,paletteSize:4,kind:'class',screenWidth:W,screenHeight:224,cellWidth:2,cellHeight:2};
      return null;
    },
    readLayer(name){
      if(name==='backdrop'){const pixels=currentPixels();return pixels?pixels.slice():null;}
      if(name==='foreground'){const pixels=currentForegroundPixels();return pixels?pixels.slice():null;}
      if(name==='surface'){const cells=currentSurfacePixels();return cells?cells.slice():null;}
      return null;
    },
    validateLayer(name,pixels){
      if(name==='backdrop'){for(const v of pixels)if(v>=PALETTE_SIZE)throw new Error(`Backdrop palette index ${v} is outside 0..${PALETTE_SIZE-1}.`);return;}
      if(name==='foreground'){for(const v of pixels)if(v!==0&&v!==1)throw new Error(`Foreground value ${v} is outside 0/1.`);return;}
      if(name==='surface'){for(const v of pixels)if(v>3)throw new Error(`Surface class ${v} is outside 0..3.`);return;}
      throw new Error(`Unsupported logical layer ${name}.`);
    },
    previewLayers(layers,{baseLayers}={}){
      const backdrop=layers?.backdrop,backdropBase=baseLayers?.backdrop||currentPixels();
      if(backdrop&&backdropBase)previewPixels(applyStencil(backdropBase,backdrop));
      drawSpecialLayerPreview(layers,baseLayers||{});
      return !!(layers?.backdrop||layers?.foreground||layers?.surface);
    },
    commitLayers(layers,{baseLayers,historyToken,message,plugin}={}){
      const backdropBase=baseLayers?.backdrop||currentPixels(),foregroundBase=baseLayers?.foreground||currentForegroundPixels(),surfaceBase=baseLayers?.surface||currentSurfacePixels();
      const proposed={};
      if(layers?.backdrop&&backdropBase)proposed.backdrop=applyStencil(backdropBase,layers.backdrop);
      if(layers?.foreground&&foregroundBase&&backdropBase)proposed.foreground=applyForegroundStencil(foregroundBase,layers.foreground,backdropBase);
      if(layers?.surface&&surfaceBase&&backdropBase)proposed.surface=applySurfaceStencil(surfaceBase,layers.surface,backdropBase);
      const bases={backdrop:backdropBase,foreground:foregroundBase,surface:surfaceBase},changed=Object.keys(proposed).filter(name=>bases[name]&&!arraysEqual(proposed[name],bases[name]));
      if(!changed.length){gesture=null;hover=null;setState(message||'Special Function made no changes.');syncUi();drawOverlay();return true;}
      const resources={backdrop:currentResource(),foreground:currentForegroundResource(),surface:currentSurfaceResource()};
      for(const name of changed)if(!resources[name]){setState(`ERROR: ${name} logical layer is unavailable.`,true);return false;}
      const before={layers:{},label:plugin?.name||'Special Function'};
      for(const name of changed){
        if(name==='backdrop')before.layers.backdrop=historyToken||resources.backdrop.data.slice(0,D.TRACK_BYTES);
        else before.layers[name]=resources[name].data.slice();
      }
      try{
        if(changed.includes('backdrop'))writePixels(proposed.backdrop);
        if(changed.includes('foreground')){
          const bytes=encodeForegroundPixels(proposed.foreground,resources.foreground.data);
          if(!syncForegroundResourceBytes(bytes))throw new Error('No active editor model accepted the foreground edit.');
        }
        if(changed.includes('surface')){
          const bytes=encodeSurfacePixels(proposed.surface,resources.surface.data);
          if(!syncSurfaceResourceBytes(bytes))throw new Error('No active editor model accepted the surface edit.');
        }
        pushUndo(before);gesture=null;hover=null;
        if(changed.some(name=>name!=='backdrop'))refreshSelectedTrack();
        setState(message||'Special Function committed.');syncUi();drawOverlay();return true;
      }catch(err){setState(`ERROR: ${err.message}`,true);return false;}
    },
    clearPreview(){syncLiveFromResource();clearSpecialLayerPreview();return true;},
    setStatus:setState,
    requestRedraw:drawOverlay,
    onSelectionChanged(plugin){captureMode=null;gesture=null;hover=null;if(plugin){if(!plugin.supportedTools.includes(drawTool)&&plugin.supportedTools.length)drawTool=plugin.supportedTools[0];setState(`${plugin.name} active · ${plugin.supportedTools.map(toolLabel).join(' / ')}.`);}else setState('Special Function off. Normal Backdrop drawing restored.');syncUi();drawOverlay();}
  });
  return true;
}

root.IndyHeatBackdropWorkspace=Object.freeze({
  isScratchActive:scratchWorkspaceActive,
  setScratchActive,
  clearScratch:clearScratchPage,
  syncUi,
  syncHistory:syncHistoryButtons,
  recordHistory:recordExternalHistory,
  augmentHistory:augmentLastHistory,
  undo:undoPaint,
  redo:redoPaint,
  scratchBackdropBytes:()=>scratchResources.backdrop.data.slice(),
  hasExternalOverlay:()=>!!externalOverlay.image
});

function installUi(){
  const pane=$('backdropEditorPane'),view=$('view'),stack=view?.closest('.canvasStack');if(!pane||!view||!stack)return false;if($('backdropPaintTools'))return true;
  const style=document.createElement('style');style.textContent=`
    #backdropScratchCanvas{position:absolute;inset:0;z-index:7;display:none;width:100%;height:100%;image-rendering:pixelated;pointer-events:none;user-select:none}
    #backdropScratchCanvas.active{display:block}
    #backdropExternalOverlayCanvas{position:absolute;inset:0;z-index:8;display:none;width:100%;height:100%;pointer-events:none;user-select:none}
    #backdropExternalOverlayCanvas.active{display:block}
    #backdropPaintCanvas{position:absolute;inset:0;z-index:9;display:none;image-rendering:pixelated;touch-action:none;user-select:none}
    #backdropPaintCanvas.active{display:block;pointer-events:none}
    #backdropPaintTools{margin-top:8px;padding-top:7px;border-top:1px solid #343b46}
    #backdropPaintTools .backdropDrawToolGrid,#backdropPaintTools .backdropCaptureGrid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;margin:6px 0}
    #backdropPaintTools .backdropCaptureGrid{grid-template-columns:repeat(4,minmax(0,1fr))}
    #backdropPaintTools .backdropDrawToolGrid button,#backdropPaintTools .backdropCaptureGrid button{min-width:0;height:31px;padding:4px;font-size:18px;line-height:1}
    #backdropPaintTools button.active{border-color:#d6b54a;background:#5a4a1c;box-shadow:inset 0 0 0 1px #d6b54a}
    #backdropPaintPalette{display:grid;grid-template-columns:repeat(8,1fr);gap:3px;margin:6px 0}
    #backdropPaintPalette button{height:22px;min-width:0;border:1px solid #555;padding:0}
    #backdropPaintPalette button.selected{outline:2px solid #fff;outline-offset:1px}#backdropPaintPalette button.transparentIndex{box-shadow:inset 0 0 0 2px #d6b54a}#backdropTransparencyControl{display:grid;grid-template-columns:minmax(0,1fr) auto 18px;gap:7px;align-items:center;margin:5px 0;font-size:11px;color:#b9c0cc}#backdropSetTransparent{min-width:0;padding:6px 7px}#backdropSetTransparent.active{border-color:#d6b54a;background:#5a4a1c;box-shadow:inset 0 0 0 1px #d6b54a}#backdropTransparentReadout{white-space:nowrap}#backdropTransparentSwatch{width:16px;height:16px;border:1px solid #d6b54a;border-radius:3px;box-sizing:border-box}
    #backdropPaletteSource{font-size:9px;color:#929aa7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:1px 0 6px}
    #backdropBrushSizeRow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:end;margin:4px 0 7px}#backdropBrushSizeRow label{margin:0}#backdropBrushClear{white-space:nowrap;padding:6px 7px}
    #backdropBrushLibraryHeader{display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:11px;color:#d7dce5;margin:4px 0 2px}#backdropBrushLibraryHeader .muted{font-size:9px;white-space:nowrap}
    #backdropBrushLibraryList{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-content:start;gap:4px;height:150px;min-height:84px;resize:vertical;overflow:auto;padding:2px 4px 7px 2px;margin:2px 0 6px;box-sizing:border-box;border-bottom:1px solid #343b46}
    #backdropBrushLibraryList.empty{height:42px;min-height:42px;resize:none;display:block}#backdropBrushLibraryList .emptyBrushLibrary{padding:8px 2px;font-size:10px}
    #backdropBrushLibraryList button{display:grid;grid-template-columns:38px minmax(0,1fr);gap:4px;align-items:center;min-width:0;padding:3px 4px;text-align:left;font-size:10px}#backdropBrushLibraryList button.active{border-color:#d6b54a;background:#5a4a1c;box-shadow:inset 0 0 0 1px #d6b54a}#backdropBrushLibraryList canvas{image-rendering:pixelated;background:#161a21;border:1px solid #3f4652}#backdropBrushLibraryList span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #backdropBrushDims{font-size:10px;color:#9aa1ad;margin:3px 0 5px}#backdropPaintState{font-size:10px;line-height:1.35;min-height:27px;margin:4px 0 2px;color:#9aa1ad}#backdropPaintState.bad{color:#ff8585}
    #backdropBrushTransforms{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;margin:5px 0}#backdropBrushTransforms button{min-width:0;padding:5px 2px;font-size:10px}
    #backdropPaintActions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:8px 0}#backdropPaintActions button{font-size:11px;padding:6px}#backdropExport{grid-column:1/-1}
    #circuitReferenceLayers{margin-top:7px;border-top:1px solid #30343d;padding-top:5px}
    #circuitReferenceLayers>summary{cursor:pointer;font-size:11px;color:#d7dce5;user-select:none}
    #circuitReferenceLayerRows{display:grid;gap:4px;margin-top:5px}
    #circuitReferenceLayerRows #circuitCompareAB{margin-top:0}
    .referenceLayerRow{display:grid;grid-template-columns:18px 42px 46px minmax(0,1fr);gap:4px;align-items:center}
    .referenceLayerRow .circuitCompareSlot{font-weight:700;text-align:center;color:#d7dce5}
    .referenceLayerRow button{min-width:0;padding:4px 5px;font-size:10px}
    #backdropScratchToggle.active{border-color:#d6b54a;background:#5a4a1c;box-shadow:inset 0 0 0 1px #d6b54a}
    #backdropExternalTransformDetails{margin-top:6px}
    #backdropExternalTransformDetails>summary{cursor:pointer;font-size:11px;color:#d7dce5;user-select:none}
    #backdropExternalControls{display:grid;gap:4px;padding:6px 0 2px 8px}
    #backdropExternalControls[hidden]{display:none}
    #backdropExternalControls label{display:grid;grid-template-columns:54px minmax(0,1fr) 42px;gap:5px;align-items:center;margin:0;font-size:10px;color:#9fa7b4}
    #backdropExternalControls label.externalRotateRow{grid-template-columns:54px minmax(0,1fr) 42px 56px}
    #backdropExternalControls label.externalRotateRow button{min-width:0;padding:3px 5px;font-size:9px}
    #backdropExternalControls input[type=range]{width:100%;min-width:0;margin:0}
    #backdropExternalControls output{text-align:right;font:10px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#d7dce5}
  `;document.head.appendChild(style);
  const scratch=document.createElement('canvas');scratch.id='backdropScratchCanvas';scratch.width=W;scratch.height=H;stack.appendChild(scratch);
  const external=document.createElement('canvas');external.id='backdropExternalOverlayCanvas';external.width=W;external.height=H;stack.appendChild(external);
  const canvas=document.createElement('canvas');canvas.id='backdropPaintCanvas';stack.appendChild(canvas);
  const tools=document.createElement('div');tools.id='backdropPaintTools';tools.innerHTML=`
    <div class="toolGroupTitle">Tool</div><div class="backdropDrawToolGrid">${DRAW_TOOL_DEFS.map(d=>`<button type="button" data-backdrop-draw-tool="${d.value}" title="${d.title}" aria-label="${d.title}">${d.icon}</button>`).join('')}</div>
    <div class="toolGroupTitle">Colour</div><div id="backdropTransparencyControl"><button id="backdropSetTransparent" type="button" title="Set the editor brush-transparency index used by capture and right-click mask painting">Set transparent</button><span id="backdropTransparentReadout" title="Editor brush/mask transparency index; separate from game bitmap semantics">Index <b id="backdropTransparentValue">0</b></span><span id="backdropTransparentSwatch" aria-hidden="true"></span></div><div id="backdropPaintPalette"></div><div id="backdropPaletteSource"></div>
    <div class="toolGroupTitle">Brushes</div><div id="backdropBrushLibraryHeader"><span>Pre-made brushes (<span id="backdropBrushLibraryCount">0</span>)</span><span class="muted">drag edge to resize</span></div><div id="backdropBrushLibraryList"></div>
    <div class="backdropCaptureGrid"><button data-backdrop-brush-capture="rectangle" type="button" title="Capture rectangle">□</button><button data-backdrop-brush-capture="ellipse" type="button" title="Capture ellipse">○</button><button data-backdrop-brush-capture="polygon" type="button" title="Capture free-form multi-edge shape">${DRAW_TOOL_DEFS.find(d=>d.value==='freeform')?.icon||'⬠'}</button><button data-backdrop-brush-capture="trace" type="button" title="Capture traced freeform lasso">〰</button></div>
    <div id="backdropBrushSizeRow"><label>Brush <input id="backdropBrushSize" type="range" min="1" max="9" step="1" value="1"> <span id="backdropBrushSizeText">1</span></label><button id="backdropBrushClear" type="button" disabled>Clear brush</button></div>
    <div id="backdropBrushDims">Standard pixel brush</div><div class="raceSetupActions"><button id="backdropBrushSave" type="button" disabled>Save brush</button><button id="backdropBrushLoad" type="button">Load brush</button></div><input id="backdropBrushLoadInput" type="file" accept=".ihbrush,application/octet-stream" hidden>
    <div id="backdropBrushTransforms"><button data-backdrop-brush-rotate="90" type="button" disabled>↻90°</button><button data-backdrop-brush-rotate="180" type="button" disabled>↻180°</button><button data-backdrop-brush-rotate="270" type="button" disabled>↻270°</button><button data-backdrop-brush-flip="h" type="button" disabled>Flip H</button><button data-backdrop-brush-flip="v" type="button" disabled>Flip V</button></div>
    <div id="backdropPaintState">Paint directly on the 320×256 Backdrop using the verified race palette.</div><div id="backdropPaintActions"><button id="backdropPaintUndo" type="button" disabled>Undo</button><button id="backdropPaintRestore" type="button">Restore loaded</button></div>`;
  const status=$('backdropStatus'),group=status?.parentElement||pane;group.insertBefore(tools,status||null);
  const exportButton=$('backdropExport'),oldActions=$('backdropRevert')?.closest('.backdropActions');if(exportButton)$('backdropPaintActions')?.appendChild(exportButton);if(oldActions)oldActions.style.display='none';
  tools.querySelectorAll('[data-backdrop-draw-tool]').forEach(b=>b.addEventListener('click',()=>selectDrawTool(b.dataset.backdropDrawTool)));tools.querySelectorAll('[data-backdrop-brush-capture]').forEach(b=>b.addEventListener('click',()=>selectCapture(b.dataset.backdropBrushCapture)));
  tools.querySelectorAll('[data-backdrop-brush-rotate]').forEach(b=>b.addEventListener('click',()=>rotateBrush(Number(b.dataset.backdropBrushRotate))));tools.querySelectorAll('[data-backdrop-brush-flip]').forEach(b=>b.addEventListener('click',()=>flipBrush(b.dataset.backdropBrushFlip)));
  $('backdropSetTransparent')?.addEventListener('click',()=>setTransparencyPickArmed(!transparencyPickArmed));$('backdropBrushClear')?.addEventListener('click',clearBrush);$('backdropBrushSave')?.addEventListener('click',downloadBrush);$('backdropBrushLoad')?.addEventListener('click',()=>$('backdropBrushLoadInput')?.click());$('backdropBrushLoadInput')?.addEventListener('change',async e=>{const f=e.target.files?.[0];if(f)await loadBrushFile(f);e.target.value='';});$('backdropBrushSize')?.addEventListener('input',syncUi);$('backdropPaintUndo')?.addEventListener('click',undoPaint);document.addEventListener('click',e=>{if(e.target?.id==='backdropPaintRedo'&&backdropActive())redoPaint(e);},true);$('backdropPaintRestore')?.addEventListener('click',restoreLoaded);
  $('backdropIffInput')?.addEventListener('change',handleBackdropIffInput,true);document.addEventListener('click',handleScratchFileClick,true);$('opacity')?.addEventListener('input',renderExternalOverlay);scheduleReferenceLayersUi();
  view.addEventListener('pointerdown',pointerDown,true);view.addEventListener('pointermove',pointerMove,true);view.addEventListener('pointerup',pointerUp,true);view.addEventListener('pointercancel',pointerCancel,true);view.addEventListener('pointerleave',()=>{if(backdropActive()&&!gesture){hover=null;drawOverlay();}},true);view.addEventListener('contextmenu',e=>{if(backdropActive()){e.preventDefault();e.stopImmediatePropagation();}},true);
  $('layerEditBackdrop')?.addEventListener('click',()=>setTimeout(()=>{ensureBaseline();canvas.classList.toggle('active',backdropActive());syncScratchVisibility();syncExternalOverlayVisibility();syncOverlaySize();renderPalette();renderBrushLibrary();syncUi();},0));$('layerModeButtons')?.addEventListener('click',e=>{if(e.target?.id!=='layerEditBackdrop')setTimeout(()=>{canvas.classList.toggle('active',backdropActive());syncScratchVisibility();syncExternalOverlayVisibility();drawOverlay();},0);},true);
  $('trackSelect')?.addEventListener('change',()=>setTimeout(()=>{paletteCacheModel=null;paletteCache=null;gesture=null;hover=null;captureMode=null;transparencyPickArmed=false;ensureBaseline();renderPalette();if(scratchActive)renderScratchPixels(currentPixels());syncUi();drawOverlay();},0));
  document.addEventListener('indyheat-circuit-content-refreshed',()=>setTimeout(()=>{paletteCacheModel=null;paletteCache=null;ensureBaseline();renderPalette();if(scratchActive)renderScratchPixels(currentPixels());syncUi();drawOverlay();},0));document.addEventListener('indyheat-race-setup-capture',()=>setTimeout(()=>{paletteCacheModel=null;paletteCache=null;ensureBaseline();renderPalette();if(scratchActive)renderScratchPixels(currentPixels());syncUi();},0));
  root.addEventListener?.('indyheat-brush-library-changed',renderBrushLibrary);if(typeof ResizeObserver!=='undefined')new ResizeObserver(syncOverlaySize).observe(view);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&backdropActive()&&gesture){e.preventDefault();cancelGesture();setState('Shape cancelled.');}});
  ensureBaseline();renderPalette();renderBrushLibrary();installSpecialFunctionsAdapter();if(!specialActive())selectDrawTool('freehand');else syncUi();syncScratchVisibility();syncExternalOverlayVisibility();renderExternalOverlay();syncOverlaySize();return true;
}
function boot(){if(installUi())return;let tries=0;const timer=setInterval(()=>{if(installUi()||++tries>240)clearInterval(timer);},50);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});else setTimeout(boot,0);

})(typeof globalThis!=='undefined'?globalThis:this);
