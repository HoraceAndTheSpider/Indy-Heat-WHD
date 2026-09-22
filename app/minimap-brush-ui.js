(function(root){
'use strict';

/* MiniMap drawing/custom-brush adapter for shared raster tools — v0.65. */
const B=root.IndyHeatBrushTools,L=root.IndyHeatLayerTools;
if(!B||!L)return;
const {
  clamp,squareBounds,squareMask,circleMask,polygonMask,captureRasterBrush,
  stampRasterBrushPoints,patternFillRasterBrush,transformRasterBrush,
  encodeBrushFile,decodeBrushFile,BRUSH_VERSION,DRAW_TOOL_DEFS
}=B;

const $=id=>document.getElementById(id);
let drawTool='freehand',captureMode=null,gesture=null,hover=null,brush=null,externalTemplate=false,bridgePick=null,transparencyPickArmed=false;
const miniUndo=new Map();

function P(){return root.IndyHeatCircuitPackage||null;}
function T(){return root.IndyHeatTools||null;}
function C(){return root.IndyHeatRaceSetupCapture||null;}
function primaryModel(){const c=C();return c?.model||c?.layerModel||c?.coreModel||(c?.models||[])[0]||null;}
function recordsFor(model){
  const c=C(),t=T();if(!model||!t)return [];
  let records=c?.recordsByMain?.get(model.main)||null;
  if(!records){records=t.parseRaceRecords(model.main);c?.recordsByMain?.set(model.main,records);}
  for(const r of records)if(r.baseResourceId==null&&typeof t.raceBaseResourceId==='function')r.baseResourceId=t.raceBaseResourceId(r,model.resourceTableOffset+0x1000);
  return records;
}
function currentRecord(){const model=primaryModel(),t=T();if(!model||!t)return null;const base=t.TRACK_BASE_IDS?.[Number($('trackSelect')?.value||0)];return recordsFor(model).find(r=>r.baseResourceId===base)||null;}
function currentPreview(){const p=P(),model=primaryModel(),record=currentRecord();if(!p||!model||!record)return null;return p.resolvePreviewResource(model,record);}
function miniActive(){return !!($('layerEditMini')?.classList.contains('active')&&!$('circuitPreviewControls')?.hidden);}
function sourceKey(q=currentPreview()){
  const o=$('trackSelect')?.selectedOptions?.[0],identity=o?.dataset?.indyheatPackageKey?`package:${o.dataset.indyheatPackageKey}`:`track:${o?.value??'?'}`;
  return q?`${identity}:resource:${q.resourceId}`:identity;
}
function stackFor(q=currentPreview()){const k=sourceKey(q);if(!miniUndo.has(k))miniUndo.set(k,[]);return miniUndo.get(k);}
function clearMiniUndo(){const q=currentPreview();if(q)miniUndo.delete(sourceKey(q));}
function pushUndoBytes(q,bytes){const st=stackFor(q);st.push(Uint8Array.from(bytes));if(st.length>30)st.shift();}
function undoMini(){const q=currentPreview();if(!q)return false;const st=stackFor(q),prev=st.pop();if(!prev)return false;q.resource.data.set(prev);syncTransparencyUi();redraw();setState(`MiniMap edit undone.${brush?` Custom brush ${brush.width}×${brush.height} remains active.`:''}`);return true;}

function layout(){
  const c=$('circuitAuxCanvas'),p=P();if(!c||!p)return null;const w=p.PREVIEW_WIDTH,h=p.PREVIEW_HEIGHT;
  const scale=Math.max(1,Math.floor(Math.min((c.width-32)/w,(c.height-72)/h))),drawW=w*scale,drawH=h*scale;
  return {x:Math.round((c.width-drawW)/2),y:Math.round((c.height-drawH)/2+16),scale,w,h,drawW,drawH};
}
function eventPoint(e,{clamped=false}={}){const c=$('circuitAuxCanvas'),l=layout();if(!c||!l)return null;const r=c.getBoundingClientRect(),cx=(e.clientX-r.left)*c.width/r.width,cy=(e.clientY-r.top)*c.height/r.height;let x=Math.floor((cx-l.x)/l.scale),y=Math.floor((cy-l.y)/l.scale);const inside=x>=0&&y>=0&&x<l.w&&y<l.h;if(clamped){x=clamp(x,0,l.w-1);y=clamp(y,0,l.h-1);}return{x,y,inside};}
function setState(text,bad=false){const e=$('circuitFreeBrushState');if(!e)return;e.textContent=text||'';e.classList.toggle('bad',!!bad);}
function renderBase(){if(miniActive())$('layerEditMini')?.click();}
function safeUnderlyingPick(){if(bridgePick){bridgePick.click();}}
function currentPaintColour(){const b=document.querySelector('#circuitPreviewPalette [data-colour].selected');return b?Number(b.dataset.colour):12;}
function secondaryPaintAction(e){return !!e&&(e.button===2||(e.button===0&&e.ctrlKey));}
function primaryPaintAction(e){return !!e&&e.button===0&&!e.ctrlKey;}
function setPaintColour(v){document.querySelector(`#circuitPreviewPalette [data-colour="${Number(v)}"]`)?.click();}
function brushSize(){return Math.max(1,Number($('circuitPreviewBrush')?.value)||1);}
function decodedPreview(q=currentPreview()){const p=P();return p&&q?p.decodePreviewBob(q.resource.data):null;}
function writePreview(q,pixels,transparent){const p=P();q.resource.data.set(p.encodePreviewPixels(pixels,q.resource.data,transparent));updatePaletteTransparency(transparent);}
function isCapture(){return !!captureMode;}
function isClickShape(tool=drawTool){return tool==='curve'||tool==='freeform';}
function customBrushActive(){return !!brush;}
function normalBrushPoints(points){return L.expandPointsWithBrush(points,brushSize(),'square');}
function freeformCloseReady(g,p){return !!(g&&g.tool==='freeform'&&(g.vertices?.length||0)>=3&&p&&L.pointDistance(g.start,p)<=3);}
function capturePolygonCloseReady(g,p){return !!(g&&g.kind==='capture-poly'&&(g.vertices?.length||0)>=3&&p&&L.pointDistance(g.start,p)<=3);}

function syncUi(){
  document.querySelectorAll('[data-mini-draw-tool]').forEach(b=>b.classList.toggle('active',!captureMode&&!externalTemplate&&b.dataset.miniDrawTool===drawTool));
  document.querySelectorAll('[data-brush-capture]').forEach(b=>b.classList.toggle('active',b.dataset.brushCapture===captureMode));
  const slider=$('circuitPreviewBrush');if(slider)slider.disabled=!!brush;
  const sliderText=$('circuitPreviewBrushText');if(sliderText)sliderText.textContent=brush?`Custom ${brush.width}×${brush.height}`:String(slider?.value||1);
  const clear=$('circuitCustomBrushClear'),save=$('circuitFreeBrushSave');if(clear)clear.disabled=!brush;if(save)save.disabled=!brush;
  document.querySelectorAll('[data-custom-brush-rotate],[data-custom-brush-flip]').forEach(b=>b.disabled=!brush);
  const dims=$('circuitFreeBrushDims');if(dims)dims.textContent=brush?`${brush.width}×${brush.height} · ${brush.visiblePixels} visible px · hotspot ${brush.hotspotX},${brush.hotspotY}`:'Standard pixel brush';
}
function selectDrawTool(tool){
  if(!DRAW_TOOL_DEFS.some(d=>d.value===tool))return;
  drawTool=tool;captureMode=null;externalTemplate=false;transparencyPickArmed=false;gesture=null;hover=null;safeUnderlyingPick();syncUi();
  if(tool==='curve')setState('Curve: click start, click end, then move and click to set the bend.');
  else if(tool==='freeform')setState('Free-form: click vertices; close within 3px of the start to commit.');
  else if(tool==='fill'&&brush)setState('Custom brush Fill tiles the brush as a repeated pattern through the connected area.');
  else setState(brush?`${toolLabel(tool)} with custom ${brush.width}×${brush.height} brush.`:`${toolLabel(tool)} with standard pixel brush.`);
  redraw();
}
function toolLabel(tool){return DRAW_TOOL_DEFS.find(d=>d.value===tool)?.title||tool;}
function selectCapture(mode){
  if(!miniActive())$('layerEditMini')?.click();safeUnderlyingPick();externalTemplate=false;transparencyPickArmed=false;gesture=null;hover=null;captureMode=mode;syncUi();
  if(mode==='polygon')setState('Multi-edge capture: click successive vertices; close within 3px of the start to capture.');
  else if(mode==='trace')setState('Hold the left mouse button and trace a freeform capture lasso; release to capture.');
  else setState(`Drag a ${mode==='circle'?'circle':'square'} capture area; release to create the custom brush.`);
  redraw();
}
function activateCapturedBrush(newBrush,message){brush=newBrush;captureMode=null;externalTemplate=false;drawTool='freehand';gesture=null;hover=null;safeUnderlyingPick();syncUi();setState(`${message} Pencil is now selected; choose Line/Curve/shape/Fill to use the same custom brush.`);redraw();}
function clearCustomBrush(){brush=null;gesture=null;hover=null;captureMode=null;externalTemplate=false;drawTool='freehand';safeUnderlyingPick();syncUi();setState('Custom brush cleared. Standard brush-size control restored.');redraw();}

function downloadBrush(){
  if(!brush)return;try{const bytes=encodeBrushFile(brush,{paletteSize:P()?.PRESENTATION_PALETTE_RGB?.length||32}),a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));a.download=`indyheat_brush_${brush.width}x${brush.height}.ihbrush`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);setState(`Saved ${brush.width}×${brush.height} brush · ${bytes.length} bytes · IHBR v${BRUSH_VERSION}.`);}catch(err){setState(`ERROR: ${err.message}`,true);}
}
async function loadBrushFile(file){
  if(!file)return;try{const loaded=decodeBrushFile(new Uint8Array(await file.arrayBuffer())),paletteSize=P()?.PRESENTATION_PALETTE_RGB?.length||32;if(loaded.paletteSize!==paletteSize)throw new Error(`Brush uses a ${loaded.paletteSize}-colour palette; this MiniMap uses ${paletteSize}.`);activateCapturedBrush(loaded,`Loaded ${file.name} · ${loaded.width}×${loaded.height}.`);}catch(err){setState(`ERROR: ${err.message}`,true);}
}
function rotateBrush(deg){if(!brush)return;try{brush=transformRasterBrush(brush,{rotation:deg});syncUi();setState(`Custom brush rotated ${deg}° · now ${brush.width}×${brush.height}.`);redraw();}catch(err){setState(`ERROR: ${err.message}`,true);}}
function flipBrush(axis){if(!brush)return;try{brush=transformRasterBrush(brush,axis==='h'?{flipH:true}:{flipV:true});syncUi();setState(`Custom brush flipped ${axis==='h'?'horizontally':'vertically'}.`);redraw();}catch(err){setState(`ERROR: ${err.message}`,true);}}

function updatePaletteTransparency(transparent){
  transparent=Number(transparent);for(const b of document.querySelectorAll('#circuitPreviewPalette [data-colour]')){const i=Number(b.dataset.colour),word=P()?.PRESENTATION_PALETTE_WORDS?.[i];b.title=i===transparent?`${i} · transparent · right-click to keep/set transparency`:`${i} · $${Number(word||0).toString(16).toUpperCase().padStart(3,'0')} · right-click to set transparent`;b.classList.toggle('transparentIndex',i===transparent);}
  const value=$('circuitPreviewTransparentValue');if(value)value.textContent=String(transparent);const swatch=$('circuitPreviewTransparentSwatch'),rgb=P()?.PRESENTATION_PALETTE_RGB?.[transparent];if(swatch&&rgb)swatch.style.background=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  const arm=$('circuitPreviewSetTransparent');if(arm)arm.classList.toggle('active',transparencyPickArmed);
}
function syncTransparencyUi(){const p=P(),q=currentPreview();if(!p||!q)return;try{updatePaletteTransparency(p.decodePreviewBob(q.resource.data).transparent);}catch(_e){}}
function setTransparencyPickArmed(on){
  transparencyPickArmed=!!on;const b=$('circuitPreviewSetTransparent');if(b)b.classList.toggle('active',transparencyPickArmed);
  if(transparencyPickArmed)setState('Set transparent armed · click a MiniMap palette swatch. Right-clicking a swatch also sets transparency directly.');
}
function paletteColourFromTarget(target){const b=target?.closest?.('#circuitPreviewPalette [data-colour]');return b?Number(b.dataset.colour):null;}
function palettePointerChoice(e){
  const colour=paletteColourFromTarget(e.target);if(colour==null)return;
  if(e.type==='contextmenu'||e.button===2){e.preventDefault();e.stopImmediatePropagation();transparencyPickArmed=false;setTransparencyIndex(colour);return;}
  if(e.type==='click'&&e.button===0&&transparencyPickArmed){e.preventDefault();e.stopImmediatePropagation();transparencyPickArmed=false;setTransparencyIndex(colour);}
}
function setTransparencyIndex(target){
  const p=P(),q=currentPreview();if(!p||!q)return;target=Number(target);if(!Number.isInteger(target)||target<0||target>31)return;
  try{const before=p.decodePreviewBob(q.resource.data);if(before.transparent===target){syncTransparencyUi();return;}const snapshot=q.resource.data.slice(),migrated=p.migratePreviewTransparency(q.resource.data,target);q.resource.data.set(migrated);pushUndoBytes(q,snapshot);const after=p.decodePreviewBob(q.resource.data);updatePaletteTransparency(after.transparent);setState(`MiniMap transparency changed ${before.transparent} → ${after.transparent}. Existing pixels were migrated losslessly.`);redraw();}catch(err){setState(`ERROR: ${err.message}`,true);syncTransparencyUi();}
}

function captureMask(g){const p=P();if(!p||!g)return [];const end=g.current||g.start;if(captureMode==='square')return squareMask(g.start,end,p.PREVIEW_WIDTH,p.PREVIEW_HEIGHT);if(captureMode==='circle')return circleMask(g.start,end,p.PREVIEW_WIDTH,p.PREVIEW_HEIGHT);if(captureMode==='polygon')return polygonMask(g.vertices||[],p.PREVIEW_WIDTH,p.PREVIEW_HEIGHT);if(captureMode==='trace')return polygonMask(g.path||[],p.PREVIEW_WIDTH,p.PREVIEW_HEIGHT);return [];}
function finishCapture(){
  const p=P(),q=currentPreview(),g=gesture;if(!p||!q||!g)return;try{const decoded=p.decodePreviewBob(q.resource.data),mask=captureMask(g),label=captureMode==='square'?'Square':captureMode==='circle'?'Circle':captureMode==='polygon'?'Multi-edge':'Traced freeform',b=captureRasterBrush(decoded.pixels,p.PREVIEW_WIDTH,p.PREVIEW_HEIGHT,decoded.transparent,mask,{name:`${label} capture`,key:'free_brush'});gesture=null;activateCapturedBrush(b,`${label} captured · ${b.width}×${b.height}.`);}catch(err){gesture=null;setState(`ERROR: ${err.message}`,true);syncUi();redraw();}
}

function applyNormalPoints(basePixels,points,value){const out=Uint8Array.from(basePixels);for(const [x,y] of normalBrushPoints(points))if(x>=0&&y>=0&&x<P().PREVIEW_WIDTH&&y<P().PREVIEW_HEIGHT)out[y*P().PREVIEW_WIDTH+x]=value;return {pixels:out,transparent:null,written:points.length};}
function applyPoints(decoded,points,{erase=false,filled=false,anchor=null}={}){
  const p=P(),value=erase?decoded.transparent:currentPaintColour();if(brush){
    if(filled)return patternFillRasterBrush(decoded.pixels,p.PREVIEW_WIDTH,p.PREVIEW_HEIGHT,decoded.transparent,brush,points,anchor?.x??0,anchor?.y??0,{paletteSize:p.PRESENTATION_PALETTE_RGB?.length||32,erase});
    return stampRasterBrushPoints(decoded.pixels,p.PREVIEW_WIDTH,p.PREVIEW_HEIGHT,decoded.transparent,brush,points,{paletteSize:p.PRESENTATION_PALETTE_RGB?.length||32,erase});
  }
  const r=applyNormalPoints(decoded.pixels,points,value);r.transparent=decoded.transparent;return r;
}
function commitPoints(points,{erase=false,filled=false,anchor=null,snapshot=null}={}){
  const q=currentPreview(),decoded=decodedPreview(q);if(!q||!decoded)return false;try{const before=snapshot||q.resource.data.slice(),placed=applyPoints(decoded,points,{erase,filled,anchor});writePreview(q,placed.pixels,placed.transparent??decoded.transparent);pushUndoBytes(q,before);gesture=null;hover=null;syncTransparencyUi();setState(`${toolLabel(drawTool)} committed${brush?' with custom brush':''}.`);redraw();return true;}catch(err){setState(`ERROR: ${err.message}`,true);return false;}
}
function commitFill(pt,erase){
  const q=currentPreview(),p=P(),decoded=decodedPreview(q);if(!q||!p||!decoded)return;const target=decoded.pixels[pt.y*p.PREVIEW_WIDTH+pt.x],probe=(target+1)%(p.PRESENTATION_PALETTE_RGB?.length||32),indices=L.floodFillIndices(decoded.pixels,p.PREVIEW_WIDTH,p.PREVIEW_HEIGHT,pt.x,pt.y,probe),points=indices.map(i=>[i%p.PREVIEW_WIDTH,(i/p.PREVIEW_WIDTH)|0]);if(!points.length)return;
  if(brush)commitPoints(points,{erase,filled:true,anchor:pt});else{const value=erase?decoded.transparent:currentPaintColour();const out=decoded.pixels.slice();for(const i of indices)out[i]=value;const snap=q.resource.data.slice();writePreview(q,out,decoded.transparent);pushUndoBytes(q,snap);setState(`Fill committed${erase?' using transparency index '+decoded.transparent:''}.`);redraw();}
}
function shapePoints(tool,start,end){if(tool==='line')return L.linePoints(start.x,start.y,end.x,end.y);if(tool==='rectangle')return L.rectanglePoints(start.x,start.y,end.x,end.y);if(tool==='rectangle-filled')return L.filledRectanglePoints(start.x,start.y,end.x,end.y);if(tool==='ellipse')return L.ellipsePoints(start.x,start.y,end.x,end.y);if(tool==='ellipse-filled')return L.filledEllipsePoints(start.x,start.y,end.x,end.y);return [[end.x,end.y]];}
function toolIsFilled(tool){return tool==='rectangle-filled'||tool==='ellipse-filled';}

function handleClickShapeDown(e,pt){
  const erase=secondaryPaintAction(e);
  if(!gesture||gesture.kind!=='clickshape'||gesture.tool!==drawTool){const q=currentPreview();gesture={kind:'clickshape',tool:drawTool,start:{x:pt.x,y:pt.y},current:{x:pt.x,y:pt.y},erase,snapshot:q?.resource.data.slice(),stage:1,vertices:[{x:pt.x,y:pt.y}]};if(drawTool==='curve')setState('Curve: start set · click the end point.');else setState('Free-form: start set · click more vertices, then close within 3px of the start.');redraw();return;}
  if(drawTool==='curve'){
    if(gesture.stage===1){if(L.pointDistance(gesture.start,pt)<.001)return;gesture.end={x:pt.x,y:pt.y};gesture.stage=2;setState('Curve: move away from the straight line to set the bend, then click to finalise.');redraw();return;}
    const pts=L.curvePoints(gesture.start,gesture.end,pt);commitPoints(pts,{erase:gesture.erase,snapshot:gesture.snapshot});return;
  }
  if(drawTool==='freeform'){
    if(freeformCloseReady(gesture,pt)){const pts=L.polylinePoints(gesture.vertices,{closed:true});commitPoints(pts,{erase:gesture.erase,snapshot:gesture.snapshot});return;}
    const last=gesture.vertices[gesture.vertices.length-1];if(L.pointDistance(last,pt)<.001)return;gesture.vertices.push({x:pt.x,y:pt.y});gesture.current={x:pt.x,y:pt.y};setState(`Free-form: ${gesture.vertices.length} vertices · click more or close within 3px of start.`);redraw();
  }
}

function beginDraw(e,pt){
  const secondary=secondaryPaintAction(e);
  if(drawTool==='pick'){const d=decodedPreview(),picked=d?.pixels[pt.y*P().PREVIEW_WIDTH+pt.x];if(picked==null)return;if(secondary){setTransparencyPickArmed(false);setTransparencyIndex(picked);setState(`Picked MiniMap transparency index ${picked} from canvas.`);}else if(primaryPaintAction(e)){setPaintColour(picked);setState(`Picked MiniMap paint colour ${picked}.`);redraw();}return;}
  if(drawTool==='fill'){commitFill(pt,secondary);return;}
  if(isClickShape()){handleClickShapeDown(e,pt);return;}
  const q=currentPreview(),decoded=decodedPreview(q);if(!q||!decoded)return;gesture={kind:'drag',tool:drawTool,pointerId:e.pointerId,start:{x:pt.x,y:pt.y},current:{x:pt.x,y:pt.y},last:{x:pt.x,y:pt.y},erase:secondary,snapshot:q.resource.data.slice(),workingPixels:decoded.pixels.slice(),transparent:decoded.transparent};$('circuitAuxCanvas')?.setPointerCapture?.(e.pointerId);
  if(drawTool==='freehand'){
    // Pencil secondary action is explicitly the MiniMap's current transparent
    // palette index. Do not route it through the selected paint colour.
    const placed=applyPoints({...decoded,pixels:gesture.workingPixels,transparent:gesture.transparent},[[pt.x,pt.y]],{erase:secondary});gesture.workingPixels=placed.pixels;gesture.transparent=placed.transparent??gesture.transparent;writePreview(q,gesture.workingPixels,gesture.transparent);
    if(secondary)setState(`Pencil erase · transparency index ${decoded.transparent}.`);
  }
  redraw();
}
function moveDraw(e,pt){
  hover=pt?.inside?pt:null;if(gesture?.kind==='clickshape'){
    if(drawTool==='curve'){gesture.current={x:pt.x,y:pt.y};if(gesture.stage===2)gesture.bend={x:pt.x,y:pt.y};}
    else gesture.current={x:pt.x,y:pt.y};redraw();return;
  }
  if(!gesture||gesture.kind!=='drag'||gesture.pointerId!==e.pointerId){redraw();return;}
  gesture.current={x:pt.x,y:pt.y};if(drawTool==='freehand'){
    const q=currentPreview(),pts=L.linePoints(gesture.last.x,gesture.last.y,pt.x,pt.y),placed=applyPoints({pixels:gesture.workingPixels,transparent:gesture.transparent},pts,{erase:gesture.erase});gesture.workingPixels=placed.pixels;gesture.transparent=placed.transparent??gesture.transparent;gesture.last={x:pt.x,y:pt.y};writePreview(q,gesture.workingPixels,gesture.transparent);
  }
  redraw();
}
function endDraw(e,pt){
  if(!gesture||gesture.kind!=='drag'||gesture.pointerId!==e.pointerId)return;const g=gesture;try{$('circuitAuxCanvas')?.releasePointerCapture?.(e.pointerId);}catch(_e){}
  if(g.tool==='freehand'){pushUndoBytes(currentPreview(),g.snapshot);gesture=null;setState(`Pencil committed${brush?' with custom brush':''}.`);redraw();return;}
  const points=shapePoints(g.tool,g.start,pt||g.current);commitPoints(points,{erase:g.erase,filled:toolIsFilled(g.tool),anchor:g.start,snapshot:g.snapshot});
}
function cancelGesture(){if(gesture?.kind==='drag'&&gesture.snapshot&&currentPreview())currentPreview().resource.data.set(gesture.snapshot);gesture=null;hover=null;redraw();}

function pointerDown(e){
  if(!miniActive())return;const primary=primaryPaintAction(e),secondary=secondaryPaintAction(e);if(externalTemplate){if(primary)clearMiniUndo();return;}if(!primary&&!secondary)return;const pt=eventPoint(e);if(!pt?.inside)return;e.preventDefault();e.stopImmediatePropagation();
  if(captureMode){
    if(!primary)return;
    if(captureMode==='polygon'){
      if(!gesture||gesture.kind!=='capture-poly'){
        gesture={kind:'capture-poly',start:{x:pt.x,y:pt.y},current:{x:pt.x,y:pt.y},vertices:[{x:pt.x,y:pt.y}]};
        setState('Multi-edge capture: start set · click more vertices, then close within 3px of the start.');
      }else if(capturePolygonCloseReady(gesture,pt)){
        finishCapture();return;
      }else{
        const last=gesture.vertices[gesture.vertices.length-1];
        if(L.pointDistance(last,pt)>=.001)gesture.vertices.push({x:pt.x,y:pt.y});
        gesture.current={x:pt.x,y:pt.y};
        setState(`Multi-edge capture: ${gesture.vertices.length} vertices · click more or close within 3px of start.`);
      }
      redraw();return;
    }
    gesture={kind:'capture',pointerId:e.pointerId,start:{x:pt.x,y:pt.y},current:{x:pt.x,y:pt.y},path:[{x:pt.x,y:pt.y}]};$('circuitAuxCanvas')?.setPointerCapture?.(e.pointerId);redraw();return;
  }
  beginDraw(e,pt);
}
function pointerMove(e){
  if(!miniActive()||externalTemplate)return;const pt=eventPoint(e,{clamped:!!gesture});if(!pt)return;e.preventDefault();e.stopImmediatePropagation();
  if(captureMode){
    if(captureMode==='polygon'){
      hover=pt.inside?pt:null;
      if(gesture?.kind==='capture-poly')gesture.current={x:pt.x,y:pt.y};
      redraw();return;
    }
    if(!gesture||gesture.kind!=='capture'||gesture.pointerId!==e.pointerId){hover=pt.inside?pt:null;redraw();return;}
    gesture.current={x:pt.x,y:pt.y};if(captureMode==='trace'){const last=gesture.path[gesture.path.length-1];if(!last||last.x!==pt.x||last.y!==pt.y)gesture.path.push({x:pt.x,y:pt.y});}redraw();return;
  }
  moveDraw(e,pt);
}
function pointerUp(e){
  if(!miniActive()||externalTemplate)return;const pt=eventPoint(e,{clamped:true});
  if(captureMode==='polygon'&&gesture?.kind==='capture-poly'){e.preventDefault();e.stopImmediatePropagation();return;}
  if(captureMode&&gesture?.kind==='capture'&&gesture.pointerId===e.pointerId){e.preventDefault();e.stopImmediatePropagation();if(pt)gesture.current={x:pt.x,y:pt.y};if(captureMode==='trace'&&pt){const last=gesture.path[gesture.path.length-1];if(!last||last.x!==pt.x||last.y!==pt.y)gesture.path.push({x:pt.x,y:pt.y});}try{$('circuitAuxCanvas')?.releasePointerCapture?.(e.pointerId);}catch(_e){}finishCapture();return;}
  if(gesture?.kind==='drag'&&gesture.pointerId===e.pointerId){e.preventDefault();e.stopImmediatePropagation();endDraw(e,pt);}
}
function pointerCancel(e){if(!miniActive()||externalTemplate)return;if(gesture){e.preventDefault();e.stopImmediatePropagation();cancelGesture();}}

function drawBrushAt(ctx,l,anchor,alpha=.72,erase=false){if(!brush||!anchor?.inside)return;const p=P(),d=decodedPreview(),eraseCol=p?.PRESENTATION_PALETTE_RGB?.[d?.transparent]||[255,255,255];ctx.save();ctx.globalAlpha=alpha;for(let sy=0;sy<brush.height;sy++)for(let sx=0;sx<brush.width;sx++){const v=brush.pixels[sy*brush.width+sx];if(v===brush.transparent)continue;const dx=anchor.x-brush.hotspotX+sx,dy=anchor.y-brush.hotspotY+sy;if(dx<0||dy<0||dx>=l.w||dy>=l.h)continue;const col=erase?eraseCol:(p.PRESENTATION_PALETTE_RGB[v]||[255,0,255]);ctx.fillStyle=`rgb(${col[0]},${col[1]},${col[2]})`;ctx.fillRect(l.x+dx*l.scale,l.y+dy*l.scale,l.scale,l.scale);}ctx.restore();}
function drawNormalPoints(ctx,l,points,erase=false){const d=decodedPreview();if(!d)return;const value=erase?d.transparent:currentPaintColour(),rgb=P()?.PRESENTATION_PALETTE_RGB?.[value]||[255,0,255];ctx.save();ctx.globalAlpha=.58;ctx.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;for(const [x,y] of normalBrushPoints(points))if(x>=0&&y>=0&&x<l.w&&y<l.h)ctx.fillRect(l.x+x*l.scale,l.y+y*l.scale,l.scale,l.scale);ctx.restore();}
function drawCustomPoints(ctx,l,points,erase=false,filled=false,anchor={x:0,y:0}){if(!brush)return;if(filled){const mod=(n,m)=>((n%m)+m)%m;ctx.save();ctx.globalAlpha=.65;for(const [x,y] of points){if(x<0||y<0||x>=l.w||y>=l.h)continue;if(erase){const ec=P()?.PRESENTATION_PALETTE_RGB?.[decodedPreview()?.transparent]||[255,255,255];ctx.fillStyle=`rgb(${ec[0]},${ec[1]},${ec[2]})`;ctx.fillRect(l.x+x*l.scale,l.y+y*l.scale,l.scale,l.scale);continue;}const sx=mod(x-anchor.x+brush.hotspotX,brush.width),sy=mod(y-anchor.y+brush.hotspotY,brush.height),v=brush.pixels[sy*brush.width+sx];if(v===brush.transparent)continue;const c=P().PRESENTATION_PALETTE_RGB[v]||[255,0,255];ctx.fillStyle=`rgb(${c[0]},${c[1]},${c[2]})`;ctx.fillRect(l.x+x*l.scale,l.y+y*l.scale,l.scale,l.scale);}ctx.restore();return;}for(const p of points)drawBrushAt(ctx,l,{x:p[0],y:p[1],inside:true},.58,erase);}
function drawCaptureOverlay(ctx,l){
  if(!captureMode||!gesture||!['capture','capture-poly'].includes(gesture.kind))return;const a=gesture.start,b=gesture.current||a;
  ctx.save();ctx.beginPath();ctx.rect(l.x,l.y,l.drawW,l.drawH);ctx.clip();ctx.fillStyle='rgba(255,216,74,.18)';ctx.strokeStyle='#ffd84a';ctx.lineWidth=Math.max(1,l.scale/2);ctx.setLineDash([Math.max(2,l.scale),Math.max(2,l.scale)]);
  if(captureMode==='trace'){
    const pts=gesture.path||[];if(pts.length){ctx.beginPath();ctx.moveTo(l.x+(pts[0].x+.5)*l.scale,l.y+(pts[0].y+.5)*l.scale);for(let i=1;i<pts.length;i++)ctx.lineTo(l.x+(pts[i].x+.5)*l.scale,l.y+(pts[i].y+.5)*l.scale);if(pts.length>2){ctx.closePath();ctx.fill();}ctx.stroke();}
  }else if(captureMode==='polygon'){
    const pts=gesture.vertices||[];if(pts.length){ctx.beginPath();ctx.moveTo(l.x+(pts[0].x+.5)*l.scale,l.y+(pts[0].y+.5)*l.scale);for(let i=1;i<pts.length;i++)ctx.lineTo(l.x+(pts[i].x+.5)*l.scale,l.y+(pts[i].y+.5)*l.scale);if(gesture.current)ctx.lineTo(l.x+(gesture.current.x+.5)*l.scale,l.y+(gesture.current.y+.5)*l.scale);if(capturePolygonCloseReady(gesture,gesture.current)){ctx.closePath();ctx.fill();}ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(l.x+(pts[0].x+.5)*l.scale,l.y+(pts[0].y+.5)*l.scale,Math.max(2,l.scale*1.1),0,Math.PI*2);ctx.stroke();}
  }else{
    const q=squareBounds(a,b,l.w,l.h),x=l.x+q.minX*l.scale,y=l.y+q.minY*l.scale,w=(q.maxX-q.minX+1)*l.scale,h=(q.maxY-q.minY+1)*l.scale;if(captureMode==='circle'){ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);ctx.fill();ctx.stroke();}else{ctx.fillRect(x,y,w,h);ctx.strokeRect(x+.5,y+.5,w-1,h-1);}
  }
  ctx.restore();
}
function drawGestureOverlay(ctx,l){
  if(captureMode){drawCaptureOverlay(ctx,l);return;}if(externalTemplate)return;
  if(gesture?.kind==='clickshape'){
    let pts=[];if(gesture.tool==='curve'){if(gesture.stage===1)pts=L.linePoints(gesture.start.x,gesture.start.y,(gesture.current||gesture.start).x,(gesture.current||gesture.start).y);else pts=L.curvePoints(gesture.start,gesture.end,gesture.bend||gesture.current||gesture.end);}else{const verts=[...(gesture.vertices||[])];if(gesture.current)verts.push(gesture.current);pts=L.polylinePoints(verts,{closed:false});}
    brush?drawCustomPoints(ctx,l,pts,gesture.erase):drawNormalPoints(ctx,l,pts,gesture.erase);return;
  }
  if(gesture?.kind==='drag'&&gesture.tool!=='freehand'){
    const pts=shapePoints(gesture.tool,gesture.start,gesture.current||gesture.start),filled=toolIsFilled(gesture.tool);brush?drawCustomPoints(ctx,l,pts,gesture.erase,filled,gesture.start):drawNormalPoints(ctx,l,pts,gesture.erase);return;
  }
  if(hover?.inside&&drawTool!=='fill'&&drawTool!=='pick'){
    if(brush)drawBrushAt(ctx,l,hover,.72,false);else drawNormalPoints(ctx,l,[[hover.x,hover.y]],false);
  }
}
function drawOverlay(){if(!miniActive())return;const c=$('circuitAuxCanvas'),l=layout();if(!c||!l)return;const ctx=c.getContext('2d');drawGestureOverlay(ctx,l);}
function redraw(){renderBase();syncUi();drawOverlay();}

function installUi(){
  const controls=$('circuitPreviewControls'),canvas=$('circuitAuxCanvas');if(!controls||!canvas)return false;if($('circuitFreeBrushTools'))return true;
  const style=document.createElement('style');style.textContent=`
    #circuitPreviewControls .miniDrawToolGrid,#circuitFreeBrushTools .miniCaptureGrid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;margin:6px 0}
    #circuitPreviewControls .miniDrawToolGrid button,#circuitFreeBrushTools .miniCaptureGrid button{min-width:0;height:31px;padding:4px;font-size:18px;line-height:1}
    #circuitPreviewControls .miniDrawToolGrid button.active,#circuitFreeBrushTools .miniCaptureGrid button.active{border-color:#d6b54a;background:#5a4a1c;box-shadow:inset 0 0 0 1px #d6b54a}
    #circuitFreeBrushTools{margin:3px 0 7px;padding-top:2px}
    #circuitFreeBrushState{font-size:10px;line-height:1.35;min-height:27px;margin:4px 0 2px;color:#9aa1ad}
    #circuitFreeBrushState.bad{color:#ff8585}#circuitFreeBrushDims{font-size:10px;color:#9aa1ad;margin:3px 0 5px}
    #circuitCustomBrushTransforms{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:4px;margin:5px 0}#circuitCustomBrushTransforms button{min-width:0;padding:5px 2px;font-size:10px}
    #circuitMiniBrushSizeRow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:end;margin:4px 0 7px}#circuitMiniBrushSizeRow label{margin:0}#circuitCustomBrushClear{white-space:nowrap;padding:6px 7px}
    #circuitTransparencyControl{display:grid;grid-template-columns:minmax(0,1fr) auto 18px;gap:7px;align-items:center;margin:7px 0 5px;font-size:11px;color:#b9c0cc}
    #circuitPreviewSetTransparent{min-width:0;padding:6px 7px}#circuitPreviewSetTransparent.active{border-color:#d6b54a;background:#5a4a1c;box-shadow:inset 0 0 0 1px #d6b54a}#circuitPreviewTransparentReadout{white-space:nowrap}#circuitPreviewTransparentSwatch{width:16px;height:16px;border:1px solid #d6b54a;border-radius:3px;box-sizing:border-box}
    #circuitPreviewPalette .transparentIndex{outline:2px solid #d6b54a!important;outline-offset:1px}
  `;document.head.appendChild(style);

  const oldRow=controls.querySelector('.circuitToolRow');if(!oldRow)return false;bridgePick=oldRow.querySelector('[data-preview-tool="pick"]');if(bridgePick){bridgePick.click();const bridge=document.createElement('div');bridge.hidden=true;bridge.id='circuitPreviewToolBridge';bridge.appendChild(bridgePick);controls.appendChild(bridge);}
  oldRow.className='miniDrawToolGrid';oldRow.innerHTML=DRAW_TOOL_DEFS.map(d=>`<button type="button" data-mini-draw-tool="${d.value}" title="${d.title}" aria-label="${d.title}">${d.icon}</button>`).join('');
  oldRow.querySelectorAll('[data-mini-draw-tool]').forEach(b=>b.addEventListener('click',()=>selectDrawTool(b.dataset.miniDrawTool)));

  const freeformIcon=DRAW_TOOL_DEFS.find(d=>d.value==='freeform')?.icon||'⬠';
  const free=document.createElement('div');free.id='circuitFreeBrushTools';free.innerHTML=`<div class="toolGroupTitle">Free brush</div><div class="miniCaptureGrid"><button data-brush-capture="square" type="button" title="Capture square" aria-label="Capture square">□</button><button data-brush-capture="circle" type="button" title="Capture circle" aria-label="Capture circle">○</button><button data-brush-capture="polygon" type="button" title="Capture free-form multi-edge shape" aria-label="Capture free-form multi-edge shape">${freeformIcon}</button><button data-brush-capture="trace" type="button" title="Capture traced freeform lasso" aria-label="Capture traced freeform lasso">〰</button></div><div id="circuitFreeBrushDims">Standard pixel brush</div><div class="raceSetupActions"><button id="circuitFreeBrushSave" type="button" disabled>Save brush</button><button id="circuitFreeBrushLoad" type="button">Load brush</button></div><input id="circuitFreeBrushLoadInput" type="file" accept=".ihbrush,application/octet-stream" hidden><div id="circuitCustomBrushTransforms"><button data-custom-brush-rotate="90" type="button" disabled title="Rotate brush 90 degrees clockwise">↻90°</button><button data-custom-brush-rotate="180" type="button" disabled title="Rotate brush 180 degrees">↻180°</button><button data-custom-brush-rotate="270" type="button" disabled title="Rotate brush 270 degrees clockwise">↻270°</button><button data-custom-brush-flip="h" type="button" disabled>Flip H</button><button data-custom-brush-flip="v" type="button" disabled>Flip V</button></div><div id="circuitFreeBrushState">Capture an area to create a reusable custom brush.</div>`;
  oldRow.insertAdjacentElement('afterend',free);free.querySelectorAll('[data-brush-capture]').forEach(b=>b.addEventListener('click',()=>selectCapture(b.dataset.brushCapture)));
  free.querySelectorAll('[data-custom-brush-rotate]').forEach(b=>b.addEventListener('click',()=>rotateBrush(Number(b.dataset.customBrushRotate))));free.querySelectorAll('[data-custom-brush-flip]').forEach(b=>b.addEventListener('click',()=>flipBrush(b.dataset.customBrushFlip)));
  $('circuitFreeBrushSave')?.addEventListener('click',downloadBrush);$('circuitFreeBrushLoad')?.addEventListener('click',()=>$('circuitFreeBrushLoadInput')?.click());$('circuitFreeBrushLoadInput')?.addEventListener('change',async e=>{const f=e.target.files?.[0];if(f)await loadBrushFile(f);e.target.value='';});

  const slider=$('circuitPreviewBrush'),sizeLabel=slider?.closest('label');if(sizeLabel&&!$('circuitMiniBrushSizeRow')){const row=document.createElement('div');row.id='circuitMiniBrushSizeRow';sizeLabel.parentNode.insertBefore(row,sizeLabel);row.appendChild(sizeLabel);const clear=document.createElement('button');clear.id='circuitCustomBrushClear';clear.type='button';clear.textContent='Clear custom';clear.disabled=true;clear.addEventListener('click',clearCustomBrush);row.appendChild(clear);}

  const palette=$('circuitPreviewPalette');if(palette&&!$('circuitTransparencyControl')){const trans=document.createElement('div');trans.id='circuitTransparencyControl';trans.innerHTML=`<button id="circuitPreviewSetTransparent" type="button" title="Arm transparency selection; the next left-click on a palette swatch becomes transparent">Set transparent</button><span id="circuitPreviewTransparentReadout">Index <b id="circuitPreviewTransparentValue">–</b></span><span id="circuitPreviewTransparentSwatch" aria-hidden="true"></span>`;palette.insertAdjacentElement('beforebegin',trans);$('circuitPreviewSetTransparent')?.addEventListener('click',()=>setTransparencyPickArmed(!transparencyPickArmed));palette.addEventListener('click',palettePointerChoice,true);palette.addEventListener('contextmenu',palettePointerChoice,true);new MutationObserver(()=>queueMicrotask(syncTransparencyUi)).observe(palette,{childList:true});}

  controls.querySelectorAll('[data-preview-template]').forEach(b=>b.addEventListener('click',()=>{externalTemplate=true;captureMode=null;gesture=null;hover=null;syncUi();setTimeout(syncTransparencyUi,0);}));
  for(const id of ['circuitPreviewBlank','circuitPreviewFromBackdrop','circuitPreviewRevert'])$(id)?.addEventListener('click',()=>{clearMiniUndo();gesture=null;hover=null;setTimeout(()=>{syncTransparencyUi();syncUi();},0);},true);
  $('circuitPreviewUndo')?.addEventListener('click',e=>{const q=currentPreview(),st=q?stackFor(q):[];if(st.length){e.preventDefault();e.stopImmediatePropagation();undoMini();}},true);
  slider?.addEventListener('input',()=>syncUi());

  canvas.addEventListener('pointerdown',pointerDown,true);canvas.addEventListener('pointermove',pointerMove,true);canvas.addEventListener('pointerup',pointerUp,true);canvas.addEventListener('pointercancel',pointerCancel,true);
  canvas.addEventListener('pointerleave',e=>{if(!gesture&&!externalTemplate){hover=null;redraw();}},true);canvas.addEventListener('contextmenu',e=>{if(!externalTemplate){e.preventDefault();e.stopImmediatePropagation();}},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&miniActive()&&gesture){e.preventDefault();cancelGesture();setState('Shape cancelled.');}});
  $('trackSelect')?.addEventListener('change',()=>{gesture=null;hover=null;captureMode=null;externalTemplate=false;transparencyPickArmed=false;safeUnderlyingPick();syncUi();setState(brush?`Custom brush ${brush.width}×${brush.height} retained; Pencil selected.`:'Standard pixel brush.');setTimeout(syncTransparencyUi,0);});
  selectDrawTool('freehand');syncTransparencyUi();return true;
}
function boot(){if(installUi())return;let tries=0;const timer=setInterval(()=>{if(installUi()||++tries>200)clearInterval(timer);},50);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0));else setTimeout(boot,0);

})(typeof globalThis!=='undefined'?globalThis:this);
