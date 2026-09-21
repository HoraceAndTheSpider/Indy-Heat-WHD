(function(){
'use strict';

const T=globalThis.IndyHeatTools;
const L=globalThis.IndyHeatLayerTools;
if(!T||!L)return;

const ONLINE_DISK_URL='https://raw.githubusercontent.com/HoraceAndTheSpider/Indy-Heat-WHD/master/whdload/data/Disk.1';
const $=id=>document.getElementById(id);
const view=$('view');
if(!view)return;

let model=null,currentIndex=0,currentResources=null;
let raceRecords=[],researchWaypoints=null;
let bg=null,mask=null,surface=null,heading=null;
let editMode=null,gesture=null,history=[];
let manualLoadSerial=0,manualLayerRequested=false,redrawPending=false;
const originals=new Map();
const dirtyResources=new Set();
const OVERLAY_COLOUR_DEFAULTS=Object.freeze({
  foreground:'#f5bd4f',surface0:'#ffffff',surface1:'#dc4545',surface2:'#5ed46c',surface3:'#4a79e8'
});
function overlayColour(key){
  const value=globalThis.IndyHeatOverlayColours?.[key];
  return /^#[0-9a-f]{6}$/i.test(String(value||''))?value:OVERLAY_COLOUR_DEFAULTS[key];
}
function overlayColourRgba(key,a){
  const hex=overlayColour(key),n=parseInt(hex.slice(1),16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}

function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function hex2(v){return Number(v).toString(16).toUpperCase().padStart(2,'0');}
function arraysEqual(a,b){if(!a||!b||a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;}
function downloadBytes(bytes,name){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));
  a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function downloadBlob(blob,name){
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

function injectStyles(){
  const style=document.createElement('style');
  style.textContent=`
    main{grid-template-columns:280px minmax(0,1fr) 286px}
    .layerControlRow{display:grid;grid-template-columns:auto 1fr;gap:7px;align-items:center;font-size:13px;margin:7px 0}
    #layerEditorColumn{background:#181b21;border:1px solid #30343d;border-radius:8px;padding:10px;align-self:start;position:sticky;top:77px;max-height:calc(100vh - 92px);overflow:auto}
    #masterZoomHost{padding-bottom:10px;margin-bottom:10px;border-bottom:1px solid #303640}
    #masterZoomHost .masterZoomTitle{font-size:11px;color:#aeb5c0;margin:0 0 5px}
    #masterZoomHost #masterZoomControl{display:block;margin:0}
    #masterZoomHost #masterZoomControl select{margin-top:5px;width:100%}
    #masterZoomHost #overlayOpacityControl{display:block;margin:9px 0 0;font-size:12px}
    #masterZoomHost #overlayOpacityControl input{width:100%;margin-top:4px}
    #layerDrawingPane[hidden],#layerWaypointHost[hidden]{display:none}
    #layerWaypointHost .editorSection{border-top:0;padding-top:0;margin:0}
    #layerWaypointHost .editorSection h2{font-size:14px;margin:0 0 8px;color:#ccd3df}
    #layerModeButtons{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px}
    #layerModeButtons button{font-size:11px;padding:6px 5px}
    #layerModeButtons button.active{border-color:#d6b54a;background:#5a4a1c}
    #layerEditorTools[hidden]{display:none}
    #layerEditorTools{margin-top:10px;padding-top:9px;border-top:1px solid #303640}
    .toolGroup{margin:0 0 11px}
    .toolGroupTitle{font-size:11px;color:#aeb5c0;margin:0 0 5px}
    .toolRadioGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
    .toolRadioGrid input{position:absolute;opacity:0;pointer-events:none}
    .toolRadioGrid label{display:flex;align-items:center;justify-content:center;min-height:36px;margin:0;border:1px solid #495162;border-radius:5px;background:#222730;cursor:pointer;font-size:18px;line-height:1}
    .toolRadioGrid label:hover{background:#2b313d}
    .toolRadioGrid input:checked + label{border-color:#d6b54a;background:#5a4a1c;box-shadow:inset 0 0 0 1px #d6b54a}
    .paintRadioList{display:grid;gap:5px}
    .paintRadioList input{position:absolute;opacity:0;pointer-events:none}
    .paintRadioList label{display:flex;align-items:center;gap:7px;margin:0;padding:6px 7px;border:1px solid #495162;border-radius:5px;background:#222730;cursor:pointer;font-size:12px}
    .paintRadioList input:checked + label{border-color:#d6b54a;background:#5a4a1c}
    .paintSwatch{display:inline-block;width:12px;height:12px;border:1px solid #777;border-radius:2px}
    .paint-normal{background:rgba(255,255,255,.15)}.paint-edge{background:#dc4545}.paint-slowA{background:#5ed46c}.paint-slowB{background:#4a79e8}.paint-fg{background:#f5bd4f}.paint-clear{background:#111318}
    .brushSizeRow{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}
    #layerBrushSize{width:100%;margin:0}
    #layerBrushSizeText{font:11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;min-width:52px;text-align:right;color:#d8dde6}
    #layerBrushShape,#layerBrushHatch{width:100%;font-size:12px;padding:6px}
    #layerBrushShape.active,#layerBrushHatch.active{border-color:#d6b54a;background:#5a4a1c}
    #layerBrushHatch:disabled{opacity:.42;cursor:default}
    .layerActionBtns{display:grid;grid-template-columns:1fr 1fr;gap:6px}
    .layerActionBtns button{font-size:11px;padding:6px}
    #layerInvert{grid-column:1/-1}
    #layerEditorStatus{margin:8px 0 0;min-height:34px;font-size:11px;line-height:1.35}
    #circuitViewportToggle{display:block;width:100%;margin-top:9px;font-size:12px;padding:6px}
    #circuitViewportToggle.active{border-color:#d6b54a;background:#5a4a1c}
    #circuitViewport{position:relative;width:max-content;max-width:100%;overflow:visible}
    #circuitViewport.fixed{width:640px;height:512px;max-width:100%;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:auto}
    .canvasStack{position:relative;z-index:0;isolation:isolate;width:max-content;height:max-content}
    .canvasStack canvas#view{position:relative;z-index:0}
    #layerEditCanvas{position:absolute;inset:0;z-index:1;display:block;image-rendering:pixelated;touch-action:none;user-select:none;pointer-events:none}
    #layerEditCanvas.editing{pointer-events:auto;cursor:crosshair}
    @media(max-width:1050px){
      main{grid-template-columns:1fr}
      #layerEditorColumn{grid-column:auto;position:static;max-height:none}
      #circuitViewport.fixed{max-width:100%}
    }
  `;
  document.head.appendChild(style);
}

function makeRow(id,label){
  const row=document.createElement('div');row.className='layerControlRow';
  row.innerHTML=`<input id="${id}" type="checkbox"><span>${esc(label)}</span>`;
  return row;
}

function toolChoice(value,icon,title,checked=false){
  const id=`layerTool_${value}`;
  return `<input id="${id}" name="layerTool" type="radio" value="${value}"${checked?' checked':''}><label for="${id}" title="${esc(title)}" aria-label="${esc(title)}">${icon}</label>`;
}
function paintChoice(value,label,cls,checked=false){
  const id=`layerPaint_${value}`;
  return `<input id="${id}" name="layerPaint" type="radio" value="${value}"${checked?' checked':''}><label for="${id}"><span class="paintSwatch ${cls}"></span>${esc(label)}</label>`;
}

function setupControls(){
  const oldMask=$('showMask1'),oldSurface=$('showSurface');
  if(!oldMask||!oldSurface)return null;

  oldMask.checked=false;oldSurface.checked=false;
  oldMask.dispatchEvent(new Event('change',{bubbles:true}));
  oldSurface.dispatchEvent(new Event('change',{bubbles:true}));

  const oldMaskLabel=oldMask.closest('label'),oldSurfaceLabel=oldSurface.closest('label');
  const maskRow=makeRow('layerShowMask','Foreground / bridge mask');
  const surfaceRow=makeRow('layerShowSurface','Surface types');
  oldMaskLabel.before(maskRow);oldSurfaceLabel.before(surfaceRow);
  oldMaskLabel.style.display='none';oldSurfaceLabel.style.display='none';

  const column=document.createElement('section');
  column.id='layerEditorColumn';
  column.innerHTML=`
    <div id="masterZoomHost">
      <div class="masterZoomTitle">Master Circuit Zoom</div>
    </div>
    <div id="layerModeButtons">
      <button id="layerModeWaypoints" type="button">Waypoints</button>
      <button id="layerEditSurface" type="button">Surface</button>
      <button id="layerEditMask" type="button">Foreground</button>
    </div>
    <div id="layerDrawingPane" hidden>
      <div id="layerEditorTools">
        <div class="toolGroup">
          <div class="toolGroupTitle">Tool</div>
          <div class="toolRadioGrid">
            ${toolChoice('freehand','✎','Pencil / freehand',true)}
            ${toolChoice('line','╱','Straight line')}
            ${toolChoice('rectangle','□','Rectangle / square')}
            ${toolChoice('rectangle-filled','■','Filled rectangle / square')}
            ${toolChoice('ellipse','○','Ellipse / circle')}
            ${toolChoice('ellipse-filled','●','Filled ellipse / circle')}
            ${toolChoice('curve','∿','Three-click curve')}
            ${toolChoice('freeform','⬠','Free-form multi-edge shape')}
            ${toolChoice('fill','▨','Fill')}
          </div>
        </div>
        <div class="toolGroup">
          <div class="toolGroupTitle">Area to paint</div>
          <div id="layerPaintChoices" class="paintRadioList"></div>
        </div>
        <div class="toolGroup">
          <div class="toolGroupTitle">Brush size</div>
          <div class="brushSizeRow">
            <input id="layerBrushSize" type="range" min="1" max="9" step="1" value="1">
            <span id="layerBrushSizeText">1×1px</span>
          </div>
        </div>
        <div class="toolGroup">
          <div class="toolGroupTitle">Brush shape</div>
          <button id="layerBrushShape" type="button" data-shape="square" title="Toggle square/circle brush">■ Square</button>
        </div>
        <div class="toolGroup">
          <div class="toolGroupTitle">Brush pattern</div>
          <button id="layerBrushHatch" type="button" data-hatched="false" title="Toggle fixed 1px on / 1px off hatch pattern">▧ Solid</button>
        </div>
        <div class="layerActionBtns">
          <button id="layerUndo" type="button">Undo</button>
          <button id="layerRevert" type="button">Revert layer</button>
          <button id="layerInvert" type="button" hidden>Invert layer</button>
        </div>
        <div id="layerEditorStatus" class="muted"></div>
      </div>
    </div>
    <div id="layerWaypointHost" hidden></div>
  `;
  document.querySelector('main')?.appendChild(column);

  const zoomControl=$('masterZoomControl')||$('editorScale')?.closest('label');
  if(zoomControl){
    zoomControl.classList.remove('inlineControl');
    zoomControl.id='masterZoomControl';
    const textNode=Array.from(zoomControl.childNodes).find(n=>n.nodeType===Node.TEXT_NODE);
    if(textNode)textNode.textContent='';
    column.querySelector('#masterZoomHost')?.appendChild(zoomControl);
  }

  const overlayOpacityControl=$('overlayOpacityControl')||$('opacity')?.closest('label');
  if(overlayOpacityControl)column.querySelector('#masterZoomHost')?.appendChild(overlayOpacityControl);

  const viewportToggle=document.createElement('button');
  viewportToggle.id='circuitViewportToggle';
  viewportToggle.type='button';
  viewportToggle.textContent='▢ Fixed 640×512 viewport';
  viewportToggle.title='Restrict the circuit to a 640×512 window; use the trackpad or scrollbars to move around at higher zoom.';
  column.querySelector('#masterZoomHost')?.appendChild(viewportToggle);

  const waypointSection=Array.from(document.querySelectorAll('aside section.editorSection')).find(sec=>sec.querySelector('#wpSelectList'));
  if(waypointSection)column.querySelector('#layerWaypointHost')?.appendChild(waypointSection);

  return {
    column,maskRow,surfaceRow,
    showMask:$('layerShowMask'),showSurface:$('layerShowSurface'),
    modeWaypoints:$('layerModeWaypoints'),editMask:$('layerEditMask'),editSurface:$('layerEditSurface'),
    drawingPane:$('layerDrawingPane'),waypointHost:$('layerWaypointHost'),
    tools:$('layerEditorTools'),
    paintChoices:$('layerPaintChoices'),
    brushSize:$('layerBrushSize'),brushSizeText:$('layerBrushSizeText'),brushShape:$('layerBrushShape'),brushHatch:$('layerBrushHatch'),
    undo:$('layerUndo'),revert:$('layerRevert'),invert:$('layerInvert'),status:$('layerEditorStatus'),
    viewportToggle:$('circuitViewportToggle')
  };
}

injectStyles();
const ui=setupControls();
if(!ui)return;

function setupCanvas(){
  const viewport=document.createElement('div');viewport.id='circuitViewport';
  const stack=document.createElement('div');stack.className='canvasStack';
  view.parentNode.insertBefore(viewport,view);
  viewport.appendChild(stack);stack.appendChild(view);
  const overlay=document.createElement('canvas');overlay.id='layerEditCanvas';
  stack.appendChild(overlay);
  return {overlay,viewport,stack};
}
const canvasSetup=setupCanvas(),overlay=canvasSetup.overlay,circuitViewport=canvasSetup.viewport,octx=overlay.getContext('2d',{alpha:true});
let viewportCentre=null;

function syncEditorPane(){
  const drawing=!!editMode;
  ui.drawingPane.hidden=!drawing;
  ui.waypointHost.hidden=drawing;
  ui.modeWaypoints.classList.toggle('active',!drawing);
  ui.editSurface.classList.toggle('active',editMode==='surface');
  ui.editMask.classList.toggle('active',editMode==='mask');
}
function viewportIsFixed(){
  return circuitViewport.classList.contains('fixed');
}
function captureViewportCentre(){
  if(!viewportIsFixed())return null;
  const sw=Math.max(1,circuitViewport.scrollWidth),sh=Math.max(1,circuitViewport.scrollHeight);
  return {
    x:(circuitViewport.scrollLeft+circuitViewport.clientWidth/2)/sw,
    y:(circuitViewport.scrollTop+circuitViewport.clientHeight/2)/sh
  };
}
function restoreViewportCentre(pos=viewportCentre){
  if(!viewportIsFixed()||!pos)return;
  const left=pos.x*circuitViewport.scrollWidth-circuitViewport.clientWidth/2;
  const top=pos.y*circuitViewport.scrollHeight-circuitViewport.clientHeight/2;
  circuitViewport.scrollLeft=Math.max(0,left);
  circuitViewport.scrollTop=Math.max(0,top);
}
function setViewportFixed(on){
  const wasFixed=viewportIsFixed();
  const existing=wasFixed?captureViewportCentre():null;
  circuitViewport.classList.toggle('fixed',!!on);
  ui.viewportToggle.classList.toggle('active',!!on);
  ui.viewportToggle.textContent=on?'▣ Fixed 640×512 viewport':'▢ Fixed 640×512 viewport';
  ui.viewportToggle.setAttribute('aria-pressed',on?'true':'false');
  if(on&&!wasFixed){
    requestAnimationFrame(()=>{
      // First activation starts centred on the circuit rather than at the top-left.
      const pos=existing||{x:.5,y:.5};
      restoreViewportCentre(pos);
    });
  }
}
function toggleViewport(){
  setViewportFixed(!viewportIsFixed());
}

function syncCanvasSize(){
  if(overlay.width!==view.width||overlay.height!==view.height){
    overlay.width=view.width;overlay.height=view.height;
  }
  queueRedraw(true);
}

function activeResource(){
  if(!currentResources)return null;
  return editMode==='mask'?currentResources[1]:editMode==='surface'?currentResources[2]:null;
}
function resourceDirty(resource){
  if(!resource)return false;
  const orig=originals.get(resource.id);
  return !!orig&&!arraysEqual(orig,resource.data);
}
function updateDirty(resource){
  if(!resource)return;
  if(resourceDirty(resource))dirtyResources.add(resource.id);else dirtyResources.delete(resource.id);
}
function rememberOriginal(resource){
  if(resource&&!originals.has(resource.id))originals.set(resource.id,resource.data.slice());
}
function surfaceOffset(){return currentResources?Math.max(0,currentResources[2].data.length-0x1180):0;}

function decodeCurrent(){
  if(!currentResources)return;
  bg=T.decodePlanar(currentResources[0].data,320,256,5,0);
  mask=T.decode1bpp(currentResources[1].data,320,256,0);
  surface=T.decodeSurface2bpp(currentResources[2].data,surfaceOffset());
  heading=T.decodeHeadingGrid(currentResources[3].data,Math.max(0,currentResources[3].data.length-0x460));
  updateSurfaceStats();
}

function updateSurfaceStats(){
  if(!surface)return;
  const h=[0,0,0,0];for(const v of surface.cells)h[v]++;
  const el=$('surfaceStats');if(el)el.textContent=`logical: 160 × 112\ncoverage: 320 × 224\n2 bits/cell\n\nclass 0: ${h[0]}\nclass 1: ${h[1]}\nclass 2: ${h[2]}\nclass 3: ${h[3]}`;
}

function selectedTrack(index){
  if(!model)return;
  gesture=null;
  currentIndex=Math.max(0,Math.min(T.TRACK_BASE_IDS.length-1,Number(index)||0));
  const base=T.TRACK_BASE_IDS[currentIndex];
  currentResources=[0,1,2,3].map(n=>model.getResource(base+n));
  currentResources.forEach(rememberOriginal);
  const race=raceRecords.find(r=>r.baseResourceId===base)||null;
  researchWaypoints=race?.waypointDescriptors||null;
  decodeCurrent();history=[];
  updateToolbar();queueRedraw(true);
}

async function loadDiskBytes(bytes,label='Disk.1'){
  try{
    model=T.makeDiskModel(bytes);
    raceRecords=T.parseRaceRecords(model.main);
    raceRecords.forEach(r=>{
      r.baseResourceId=T.raceBaseResourceId(r,model.resourceTableOffset+0x1000);
      r.waypointDescriptors=T.parseWaypointDescriptors(model.main,r);
    });
    originals.clear();dirtyResources.clear();history=[];gesture=null;
    selectedTrack(Number($('trackSelect')?.value)||0);
    setLayerStatus(`${label} ready for layer editing.`);
  }catch(e){
    console.error('Layer editor disk load failed',e);
    setLayerStatus(`Layer editor unavailable: ${e.message}`,true);
  }
}

async function preloadDisk(){
  try{
    const r=await fetch(ONLINE_DISK_URL,{cache:'no-cache'});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const bytes=new Uint8Array(await r.arrayBuffer());
    if(manualLayerRequested)return;
    await loadDiskBytes(bytes,'Repository Disk.1');
  }catch(e){
    console.warn('Layer editor repository preload failed',e);
    setLayerStatus('Open/drop Disk.1 before editing foreground or surface data.');
  }
}

function loadManualFile(file){
  manualLayerRequested=true;
  const serial=++manualLoadSerial;
  file.arrayBuffer().then(buf=>{if(serial===manualLoadSerial)loadDiskBytes(new Uint8Array(buf),file.name);});
}

function setLayerStatus(text,bad=false){
  if(!ui.status)return;
  ui.status.textContent=text||'';
  ui.status.classList.toggle('bad',!!bad);
}

function currentTool(){
  return document.querySelector('input[name="layerTool"]:checked')?.value||'freehand';
}
function currentPaint(){
  return Number(document.querySelector('input[name="layerPaint"]:checked')?.value||0);
}
function updateBrushLabel(){
  const n=Math.max(1,Number(ui.brushSize?.value)||1);
  if(ui.brushSizeText)ui.brushSizeText.textContent=editMode==='surface'?`${n}×${n} cells · ${n*2}×${n*2}px`:`${n}×${n}px`;
}
function setPaintChoices(mode){
  if(!ui.paintChoices||ui.paintChoices.dataset.mode===mode)return;
  if(mode==='surface'){
    ui.paintChoices.innerHTML=[
      paintChoice(0,'Normal','paint-normal'),
      paintChoice(1,'Edge / collision','paint-edge',true),
      paintChoice(2,'Slowdown A','paint-slowA'),
      paintChoice(3,'Slowdown B','paint-slowB')
    ].join('');
  }else{
    ui.paintChoices.innerHTML=[
      paintChoice(1,'Foreground','paint-fg',true),
      paintChoice(0,'Clear','paint-clear')
    ].join('');
  }
  ui.paintChoices.dataset.mode=mode;
  ui.paintChoices.querySelectorAll('input[name="layerPaint"]').forEach(r=>r.addEventListener('change',()=>{
    if(gesture?.multiClick)cancelClickShape('Shape cancelled.');
    else gesture=null;
    queueRedraw();
  }));
}
function updateBrushShapeButton(){
  const circle=ui.brushShape?.dataset.shape==='circle';
  if(ui.brushShape){ui.brushShape.textContent=circle?'● Circle':'■ Square';ui.brushShape.classList.toggle('active',circle);}
}
function brushHatched(){
  return editMode==='mask'&&ui.brushHatch?.dataset.hatched==='true';
}
function updateBrushHatchButton(){
  if(!ui.brushHatch)return;
  const requested=ui.brushHatch.dataset.hatched==='true',available=editMode==='mask';
  ui.brushHatch.disabled=!available;
  ui.brushHatch.classList.toggle('active',available&&requested);
  ui.brushHatch.textContent=available&&requested?'▧ Hatched 1/1':'▧ Solid';
  ui.brushHatch.title=available
    ? 'Toggle fixed 1px on / 1px off hatch pattern; brush size changes footprint only'
    : '1px hatch is available for the 1bpp Foreground layer';
}
function updateToolbar(){
  overlay.classList.toggle('editing',!!editMode);
  syncEditorPane();
  syncGlobalRevertButton();
  if(!editMode)return;

  const res=activeResource(),dirty=resourceDirty(res);
  ui.undo.disabled=!history.some(h=>h.resourceId===res?.id);
  ui.revert.disabled=!dirty;
  ui.invert.hidden=editMode!=='mask';
  ui.invert.disabled=editMode!=='mask'||!res;
  setPaintChoices(editMode);
  updateBrushLabel();updateBrushShapeButton();updateBrushHatchButton();
  if(editMode==='surface'){
    setLayerStatus(`Surface: each brush unit is one native 2×2px cell. Right-click always paints Normal with the current tool and brush. 1px hatch is Foreground-only.${dirty?' · Modified':''}`);
  }else{
    setLayerStatus(`Foreground: native 1px bitmap. Hatched keeps a fixed 1px on / 1px off pattern while brush size changes only its area. Right-click always paints the opposite of the selected value: Foreground ↔ Clear. Invert layer flips the complete 320×256 mask.${dirty?' · Modified':''}`);
  }
}

function enterWaypointMode(){
  editMode=null;gesture=null;
  const wp=$('showWaypoints');
  if(wp&&!wp.checked){wp.checked=true;wp.dispatchEvent(new Event('change',{bubbles:true}));}
  updateToolbar();queueRedraw(true);
}
function enterEdit(mode){
  if(editMode===mode){updateToolbar();return;}
  if(!model){setLayerStatus('Layer data is still loading.');return;}
  editMode=mode;gesture=null;
  if(mode==='mask')ui.showMask.checked=true;
  if(mode==='surface')ui.showSurface.checked=true;
  const wp=$('showWaypoints');
  if(wp?.checked){wp.checked=false;wp.dispatchEvent(new Event('change',{bubbles:true}));}
  updateToolbar();queueRedraw(true);
}
function exitEdit(){if(!editMode)return;enterWaypointMode();}

function enabledSurfaceClasses(){
  return new Set(Array.from(document.querySelectorAll('.surfaceClass:checked')).map(c=>Number(c.dataset.class)));
}
function alpha(){return Number($('opacity')?.value??55)/100;}
function scale(){return overlay.width/320;}

function drawMask(){
  if(!ui.showMask.checked||!mask)return;
  const S=scale();octx.save();octx.globalAlpha=alpha();octx.fillStyle=overlayColour('foreground');
  for(let y=0;y<256;y++){
    let run=-1;
    for(let x=0;x<=320;x++){
      const on=x<320&&mask[y*320+x];
      if(on&&run<0)run=x;
      if(!on&&run>=0){octx.fillRect(run*S,y*S,(x-run)*S,S);run=-1;}
    }
  }
  octx.restore();
}
function drawSurface(){
  if(!ui.showSurface.checked||!surface)return;
  const S=scale(),enabled=enabledSurfaceClasses(),colors=[overlayColourRgba('surface0',.15),overlayColour('surface1'),overlayColour('surface2'),overlayColour('surface3')];
  octx.save();octx.globalAlpha=alpha();
  for(let y=0;y<112;y++)for(let x=0;x<160;x++){
    const v=surface.cells[y*160+x];if(!enabled.has(v))continue;
    octx.fillStyle=colors[v];octx.fillRect(x*2*S,y*2*S,2*S,2*S);
  }
  octx.restore();
}
function primitivePoints(tool,a,b){
  return L.toolPoints(tool,a,b);
}
function brushSize(){return Math.max(1,Number(ui.brushSize?.value)||1);}
function brushShape(){return ui.brushShape?.dataset.shape||'square';}
function brushed(points,size=brushSize(),shape=brushShape(),hatched=brushHatched(),hatchPhase=0){
  return L.applyBrush(points,{brushSize:size,brushShape:shape,hatched,hatchPhase});
}
function gestureBrushOptions(g=gesture){
  return {
    brushSize:g?.brushSize??brushSize(),
    brushShape:g?.brushShape??brushShape(),
    hatched:!!g?.hatched,
    hatchPhase:g?.hatchPhase??0
  };
}
function currentPreviewPoints(){
  if(!gesture||!editMode)return [];
  let base=[];
  if(gesture.tool==='curve'){
    if(gesture.stage===1&&gesture.start&&gesture.current)
      base=L.toolPoints('line',gesture.start,gesture.current);
    else if(gesture.stage===2&&gesture.start&&gesture.end&&gesture.bend)
      base=L.curvePoints(gesture.start,gesture.end,gesture.bend);
  }else if(gesture.tool==='freeform'){
    const vertices=gesture.vertices||[];
    if(vertices.length){
      if(gesture.joinReady&&vertices.length>=3)base=L.polylinePoints(vertices,{closed:true});
      else{
        const preview=vertices.slice();
        if(gesture.hover)preview.push(gesture.hover);
        base=L.polylinePoints(preview);
      }
    }
  }else if(gesture.start&&gesture.current&&L.isPrimitiveTool(gesture.tool)){
    base=primitivePoints(gesture.tool,gesture.start,gesture.current);
  }
  return base.length?L.applyBrush(base,gestureBrushOptions(gesture)):[];
}
function drawPreview(){
  const pts=currentPreviewPoints(),S=scale(),unit=editMode==='surface'?2:1;
  if(pts.length){
    octx.save();octx.globalAlpha=.88;
    octx.fillStyle=gesture?.erase?'rgba(255,255,255,.55)':'rgba(255,255,255,.9)';
    for(const [x,y] of pts)octx.fillRect(x*unit*S,y*unit*S,unit*S,unit*S);
    octx.restore();
  }
  if(gesture?.tool==='freeform'&&gesture.joinReady&&gesture.start){
    const cx=(gesture.start.x*unit+unit/2)*S,cy=(gesture.start.y*unit+unit/2)*S;
    octx.save();
    octx.globalAlpha=1;
    octx.strokeStyle='#ffd84a';
    octx.lineWidth=Math.max(1.5,.7*S);
    octx.beginPath();
    octx.arc(cx,cy,Math.max(4,2.5*S),0,Math.PI*2);
    octx.stroke();
    octx.restore();
  }
}

function researchWaypointProjection(p){
  const mode=$('wpProjectionMode')?.value||'a082';
  if(mode==='a082'){
    const q=T.projectWaypointA082(p.x,p.y);
    if(q)return q;
  }
  const sx=Number($('wpScaleX')?.value??2),ox=Number($('wpOffsetX')?.value??338);
  const sy=Number($('wpScaleY')?.value??-1.5),oy=Number($('wpOffsetY')?.value??142.5);
  return {x:p.x*sx+ox,y:p.y*sy+oy};
}
function waypointOverlaySets(){
  // app.js owns the live waypoint model and refreshes it after every edit.
  // Prefer that authoritative model so Turbo/link overlays cannot retain stale
  // flags from layer-editor.js's separate Disk.1 decoding snapshot.
  try{
    if(typeof state!=='undefined'&&Array.isArray(state?.waypoints))return state.waypoints;
  }catch(_e){}
  return Array.isArray(researchWaypoints)?researchWaypoints:[];
}
function visibleResearchWaypointSets(){
  if(!$('showWaypoints')?.checked)return [];
  const enabled=new Set(Array.from(document.querySelectorAll('.waypointSet:checked')).map(c=>Number(c.dataset.set)));
  return waypointOverlaySets().filter(set=>enabled.has(Number(set.index)));
}
function routeLocalWaypointMap(set){
  const by=new Map();
  for(const p of set.points||[])by.set(p.runtimeAddress,p);
  if(set.boundaryPoint&&!set.boundaryPoint.zeroSentinel)by.set(set.boundaryPoint.runtimeAddress,set.boundaryPoint);
  return by;
}

function researchPointByAddress(addr){
  for(const set of researchWaypoints||[]){
    const p=(set.points||[]).find(q=>q.runtimeAddress===addr);
    if(p)return p;
  }
  return null;
}
function syncSelectedResearchPointFromEditor(){
  if(!researchWaypoints)return false;
  const addr=Number($('wpSelectList')?.value);
  if(!addr)return false;
  const p=researchPointByAddress(addr);
  if(!p)return false;

  const x=Number($('editWpX')?.value),y=Number($('editWpY')?.value);
  const progress=Number($('editWpProgress')?.value),linkDelta=Number($('editWpDelta')?.value);
  if(Number.isFinite(x))p.x=x;
  if(Number.isFinite(y))p.y=y;
  if(Number.isFinite(progress))p.progress=progress;
  p.progressFlag=!!$('editWpFlag')?.checked;
  if(Number.isFinite(linkDelta)){
    p.linkDelta=linkDelta;
    p.linkTarget=p.runtimeAddress+linkDelta;
  }
  return true;
}
function resetResearchWaypointsFromLayerModel(){
  if(!model)return;
  raceRecords=T.parseRaceRecords(model.main);
  raceRecords.forEach(r=>{
    r.baseResourceId=T.raceBaseResourceId(r,model.resourceTableOffset+0x1000);
    r.waypointDescriptors=T.parseWaypointDescriptors(model.main,r);
  });
  const base=T.TRACK_BASE_IDS[currentIndex];
  researchWaypoints=raceRecords.find(r=>r.baseResourceId===base)?.waypointDescriptors||null;
  queueRedraw(true);
}
function drawCyanArrow(a,b,label,S){
  const ax=a.x*S,ay=a.y*S,bx=b.x*S,by=b.y*S,dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy);
  if(len<2*S)return;
  const ux=dx/len,uy=dy/len;
  const startPad=2.1*S,endPad=3.0*S;
  const x1=ax+ux*startPad,y1=ay+uy*startPad,x2=bx-ux*endPad,y2=by-uy*endPad;
  const head=Math.max(5,2.1*S),wing=.55;
  const cyan='#25e7ff';

  octx.save();
  octx.lineCap='round';octx.lineJoin='round';
  octx.strokeStyle='rgba(0,0,0,.86)';octx.lineWidth=Math.max(3,1.45*S);
  octx.beginPath();octx.moveTo(x1,y1);octx.lineTo(x2,y2);octx.stroke();
  octx.strokeStyle=cyan;octx.lineWidth=Math.max(1.4,.62*S);
  octx.beginPath();octx.moveTo(x1,y1);octx.lineTo(x2,y2);octx.stroke();

  const angle=Math.atan2(y2-y1,x2-x1);
  const hx1=x2-Math.cos(angle-wing)*head,hy1=y2-Math.sin(angle-wing)*head;
  const hx2=x2-Math.cos(angle+wing)*head,hy2=y2-Math.sin(angle+wing)*head;
  octx.fillStyle=cyan;octx.strokeStyle='rgba(0,0,0,.86)';octx.lineWidth=Math.max(2,.8*S);
  octx.beginPath();octx.moveTo(x2,y2);octx.lineTo(hx1,hy1);octx.lineTo(hx2,hy2);octx.closePath();octx.stroke();octx.fill();

  if(label){
    const mx=(x1+x2)/2,my=(y1+y2)/2-1.8*S,fontPx=Math.max(9,Math.round(3.5*S));
    octx.font=`600 ${fontPx}px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`;
    octx.textAlign='center';octx.textBaseline='bottom';
    octx.strokeStyle='rgba(0,0,0,.95)';octx.lineWidth=Math.max(2,1.05*S);
    octx.strokeText(label,mx,my);octx.fillStyle=cyan;octx.fillText(label,mx,my);
  }
  octx.restore();
}
function drawWaypointResearchOverlays(){
  if(!researchWaypoints||!$('showWaypoints')?.checked)return;
  const showFlags=$('showBit7Flags')?.checked;
  const showLinks=$('showNonDefaultLinkDeltas')?.checked;
  if(!showFlags&&!showLinks)return;
  const sets=visibleResearchWaypointSets(),S=scale();
  const enabled=new Set(sets.map(set=>Number(set.index)));

  if(showLinks){
    for(const set of sets){
      const byAddress=routeLocalWaypointMap(set);
      for(const p of set.points||[]){
        if(!enabled.has(Number(p.setIndex)))continue;
        if(Number(p.linkDelta)===6)continue;
        const target=byAddress.get(p.linkTarget);
        if(!target||target.zeroSentinel)continue;
        const a=researchWaypointProjection(p),b=researchWaypointProjection(target);
        if(!a||!b||a.x<0||a.x>=320||a.y<0||a.y>=224||b.x<0||b.x>=320||b.y<0||b.y>=224)continue;
        const d=Number(p.linkDelta),label=`${d>=0?'+':''}${d}`;
        drawCyanArrow(a,b,label,S);
      }
    }
  }

  if(showFlags){
    octx.save();
    octx.strokeStyle='#fff';octx.lineWidth=Math.max(1.4,.55*S);octx.globalAlpha=.98;
    for(const set of sets)for(const p of set.points||[]){
      if(!enabled.has(Number(p.setIndex)))continue;
      if(!p.progressFlag)continue;
      const q=researchWaypointProjection(p);
      if(!q||q.x<0||q.x>=320||q.y<0||q.y>=224)continue;
      octx.beginPath();octx.arc(q.x*S,q.y*S,Math.max(4,1.9*S),0,Math.PI*2);octx.stroke();
    }
    octx.restore();
  }
}
function drawNow(){
  redrawPending=false;
  if(overlay.width!==view.width||overlay.height!==view.height){overlay.width=view.width;overlay.height=view.height;}
  octx.clearRect(0,0,overlay.width,overlay.height);
  drawMask();drawSurface();drawPreview();drawWaypointResearchOverlays();
}
function queueRedraw(immediate=false){
  if(immediate){drawNow();return;}
  if(redrawPending)return;redrawPending=true;requestAnimationFrame(drawNow);
}

function canvasPoint(ev,canvas=overlay,clamp=true){
  const r=canvas.getBoundingClientRect();
  const x=(ev.clientX-r.left)*320/r.width;
  const y=(ev.clientY-r.top)*256/r.height;
  return clamp
    ? {x:Math.max(0,Math.min(319,x)),y:Math.max(0,Math.min(255,y))}
    : {x,y};
}
function worldPoint(ev,source='main',clamp=true){
  return canvasPoint(ev,overlay,clamp);
}
function gridPoint(pos,allowOutside=false){
  if(editMode==='surface'){
    if(!allowOutside&&(pos.x<0||pos.x>=320||pos.y<0||pos.y>=224))return null;
    return {x:Math.floor(pos.x/2),y:Math.floor(pos.y/2)};
  }
  if(!allowOutside&&(pos.x<0||pos.x>=320||pos.y<0||pos.y>=256))return null;
  return {x:Math.floor(pos.x),y:Math.floor(pos.y)};
}
function primitiveAllowsOutside(tool){
  return L.isPrimitiveTool(tool);
}
function paintValue(){return currentPaint();}
function secondaryPaintValue(){
  // Right-click is the secondary paint action:
  // Foreground: always the opposite of the selected value (Foreground <-> Clear).
  // Surface: always class 0 / Normal, regardless of the selected surface class.
  if(editMode==='mask')return paintValue()===0?1:0;
  return 0;
}
function gridSize(){return editMode==='surface'?{w:160,h:112}:{w:320,h:256};}
function gridValues(){return editMode==='surface'?surface?.cells:mask;}

function writePoint(x,y,value){
  if(!currentResources)return;
  if(editMode==='surface'){
    if(x<0||x>=160||y<0||y>=112)return;
    L.setSurfaceCell(currentResources[2].data,x,y,value,surfaceOffset());
    surface.cells[y*160+x]=value;
  }else if(editMode==='mask'){
    if(x<0||x>=320||y<0||y>=256)return;
    L.setMaskPixel(currentResources[1].data,x,y,value,0);
    mask[y*320+x]=value?1:0;
  }
}
function writePoints(points,value){
  const size=gridSize();
  return L.paintRaster({points,width:size.w,height:size.h,value,set:writePoint});
}
function writeBrushedPoints(points,value,size=brushSize(),shape=brushShape(),hatched=brushHatched(),hatchPhase=0){
  writePoints(brushed(points,size,shape,hatched,hatchPhase),value);
}

function beginHistory(){
  const res=activeResource();if(!res)return null;
  return {resourceId:res.id,before:res.data.slice(),trackIndex:currentIndex,mode:editMode};
}
function commitHistory(entry){
  if(!entry)return;
  const res=activeResource();
  if(!res||arraysEqual(entry.before,res.data))return;
  history.push(entry);updateDirty(res);updateSurfaceStats();updateToolbar();queueRedraw();
}
function undo(){
  const res=activeResource();if(!res)return;
  let i=-1;for(let n=history.length-1;n>=0;n--)if(history[n].resourceId===res.id){i=n;break;}
  if(i<0)return;
  const h=history.splice(i,1)[0];res.data.set(h.before);decodeCurrent();updateDirty(res);updateToolbar();queueRedraw(true);
  setLayerStatus(`${editMode==='surface'?'Surface':'Foreground'} edit undone.${resourceDirty(res)?' · Modified':''}`);
}
function revertLayer(){
  const res=activeResource(),orig=res&&originals.get(res.id);if(!res||!orig)return;
  res.data.set(orig);history=history.filter(h=>h.resourceId!==res.id);decodeCurrent();updateDirty(res);updateToolbar();queueRedraw(true);
  setLayerStatus(`${editMode==='surface'?'Surface':'Foreground'} restored to the loaded disk.`);
}
function invertForegroundLayer(){
  if(editMode!=='mask'||!currentResources)return;
  const res=currentResources[1];
  if(!res||res.data.length<0x2800){
    setLayerStatus('Foreground resource is shorter than the expected $2800-byte bitmap.',true);
    return;
  }
  const snapshot=beginHistory();
  for(let i=0;i<0x2800;i++)res.data[i]^=0xFF;
  decodeCurrent();
  commitHistory(snapshot);
  queueRedraw(true);
  setLayerStatus(`Foreground layer inverted across all 320×256 pixels.${resourceDirty(res)?' · Modified':''}`);
}

function waypointEditsPresent(){
  const t=$('editCount')?.textContent||'';
  return !/^0 modified waypoint/.test(t.trim());
}
function syncGlobalRevertButton(){
  const b=$('revertAll');if(!b)return;
  b.disabled=!(dirtyResources.size||waypointEditsPresent());
}
function revertAllLayers(){
  if(!model||!dirtyResources.size)return;
  for(const id of Array.from(dirtyResources)){
    const orig=originals.get(id);if(!orig)continue;
    try{model.getResource(id).data.set(orig);}catch(_){}
  }
  dirtyResources.clear();history=[];
  if(currentResources)decodeCurrent();
  updateToolbar();queueRedraw(true);
}

function updateEditCursorAt(pos){
  if(!bg||!surface||!mask||!heading)return;
  const x=Math.max(0,Math.min(319,Math.floor(pos.x))),y=Math.max(0,Math.min(255,Math.floor(pos.y)));
  const colour=bg[y*320+x],occ=mask[y*320+x];
  let surf='—',head='—';
  if(y<224){surf=surface.cells[(y>>1)*160+(x>>1)];head=heading.values[(y>>3)*40+(x>>3)];}
  const unit=editMode==='surface'?` · cell ${x>>1},${y>>1}`:'';
  $('cursorInfo').textContent=`x ${x} · y ${y} · colour ${colour}\nsurface ${surf} · recovery ${head} · foreground ${occ}${unit}`;
}

function isClickShapeTool(tool){
  return tool==='curve'||tool==='freeform';
}
function editGridUnitPixels(){
  return editMode==='surface'?2:1;
}
function freeformCloseReady(g,p){
  if(!g||g.tool!=='freeform'||(g.vertices?.length||0)<3||!p)return false;
  return L.pointDistance(g.start,p)*editGridUnitPixels()<=3;
}
function newClickShapeGesture(tool,source,p,ev){
  const erase=ev.button===2,value=erase?secondaryPaintValue():paintValue();
  const bSize=brushSize(),bShape=brushShape(),hatched=brushHatched(),hatchPhase=(p.x+p.y)&1;
  const base={
    multiClick:true,tool,source,start:{x:p.x,y:p.y},current:{x:p.x,y:p.y},
    snapshot:beginHistory(),value,erase,
    brushSize:bSize,brushShape:bShape,hatched,hatchPhase
  };
  if(tool==='curve')return {...base,stage:1,end:null,bend:null};
  return {...base,vertices:[{x:p.x,y:p.y}],hover:{x:p.x,y:p.y},joinReady:false};
}
function cancelClickShape(message='Shape cancelled.'){
  if(!gesture?.multiClick)return false;
  gesture=null;queueRedraw(true);setLayerStatus(message);return true;
}
function commitCurve(g,bend){
  g.bend={x:bend.x,y:bend.y};
  const points=L.curvePoints(g.start,g.end,g.bend);
  writeBrushedPoints(points,g.value,g.brushSize,g.brushShape,g.hatched,g.hatchPhase);
  gesture=null;
  commitHistory(g.snapshot);
  queueRedraw(true);
  setLayerStatus(`Curve committed.${resourceDirty(activeResource())?' · Modified':''}`);
}
function commitFreeform(g){
  const points=L.polylinePoints(g.vertices,{closed:true});
  writeBrushedPoints(points,g.value,g.brushSize,g.brushShape,g.hatched,g.hatchPhase);
  const count=g.vertices.length;
  gesture=null;
  commitHistory(g.snapshot);
  queueRedraw(true);
  setLayerStatus(`Free-form shape committed · ${count} vertices.${resourceDirty(activeResource())?' · Modified':''}`);
}
function handleClickShapeDown(ev,source,p,tool){
  if(!gesture||!gesture.multiClick||gesture.tool!==tool||gesture.source!==source){
    gesture=newClickShapeGesture(tool,source,p,ev);
    if(tool==='curve')setLayerStatus('Curve: start set · click the end point.');
    else setLayerStatus('Free-form: start set · click additional vertices; close within 3px of the start.');
    queueRedraw();return;
  }

  if(tool==='curve'){
    if(gesture.stage===1){
      if(L.pointDistance(gesture.start,p)<.001){
        setLayerStatus('Curve: choose an end point away from the start.');
        return;
      }
      gesture.end={x:p.x,y:p.y};
      gesture.current=gesture.end;
      gesture.bend={
        x:(gesture.start.x+gesture.end.x)/2,
        y:(gesture.start.y+gesture.end.y)/2
      };
      gesture.stage=2;
      setLayerStatus('Curve: move away from the straight line to set the bend, then click to finalise.');
      queueRedraw();return;
    }
    if(gesture.stage===2){
      commitCurve(gesture,p);
      return;
    }
  }

  if(tool==='freeform'){
    if(freeformCloseReady(gesture,p)){
      commitFreeform(gesture);
      return;
    }
    const last=gesture.vertices[gesture.vertices.length-1];
    if(L.pointDistance(last,p)<.001)return;
    gesture.vertices.push({x:p.x,y:p.y});
    gesture.hover={x:p.x,y:p.y};
    gesture.joinReady=freeformCloseReady(gesture,p);
    setLayerStatus(`Free-form: ${gesture.vertices.length} vertices · click more points or close within 3px of the start.`);
    queueRedraw();
  }
}

function beginGestureFrom(ev,source='main'){
  if(ev.button!==0&&ev.button!==2)return;
  if(!editMode||!model||!currentResources)return;

  const tool=currentTool();
  const pos=worldPoint(ev,source);
  const p=gridPoint(pos);if(!p)return;

  if(isClickShapeTool(tool)){
    handleClickShapeDown(ev,source,p,tool);
    ev.preventDefault();
    return;
  }

  const erase=ev.button===2,value=erase?secondaryPaintValue():paintValue(),snapshot=beginHistory();
  const bSize=brushSize(),bShape=brushShape(),hatched=brushHatched(),hatchPhase=(p.x+p.y)&1,capture=overlay;
  if(tool==='fill'){
    const size=gridSize(),vals=gridValues();
    const pts=L.floodFillPoints(vals,size.w,size.h,p.x,p.y,value,{hatched,hatchPhase});
    writePoints(pts,value);
    commitHistory(snapshot);ev.preventDefault();return;
  }
  gesture={pointerId:ev.pointerId,source,capture,start:p,current:p,last:p,snapshot,value,tool,erase,brushSize:bSize,brushShape:bShape,hatched,hatchPhase};
  capture.setPointerCapture?.(ev.pointerId);
  if(tool==='freehand'){writeBrushedPoints([[p.x,p.y]],value,bSize,bShape,hatched,hatchPhase);queueRedraw();}
  ev.preventDefault();
}
function moveGestureFrom(ev,source='main'){
  const cursorPos=worldPoint(ev,source,true);
  updateEditCursorAt(cursorPos);

  if(gesture?.multiClick&&gesture.source===source){
    const p=gridPoint(cursorPos);if(!p)return;
    if(gesture.tool==='curve'){
      if(gesture.stage===1)gesture.current={x:p.x,y:p.y};
      else if(gesture.stage===2)gesture.bend={x:p.x,y:p.y};
    }else if(gesture.tool==='freeform'){
      gesture.hover={x:p.x,y:p.y};
      gesture.joinReady=freeformCloseReady(gesture,p);
    }
    queueRedraw();
    return;
  }

  if(!gesture||gesture.pointerId!==ev.pointerId||gesture.source!==source)return;
  const allowOutside=primitiveAllowsOutside(gesture.tool);
  const pos=worldPoint(ev,source,!allowOutside);
  const p=gridPoint(pos,allowOutside);if(!p)return;
  gesture.current=p;
  if(gesture.tool==='freehand'){
    writeBrushedPoints(L.toolPoints('freehand',gesture.last,p),gesture.value,gesture.brushSize,gesture.brushShape,gesture.hatched,gesture.hatchPhase);
    gesture.last=p;
  }
  queueRedraw();
  ev.preventDefault();
}
function endGestureFrom(ev,source='main',cancel=false){
  if(gesture?.multiClick&&gesture.source===source)return;
  if(!gesture||gesture.pointerId!==ev.pointerId||gesture.source!==source)return;
  const g=gesture;gesture=null;
  try{g.capture?.releasePointerCapture?.(ev.pointerId);}catch(_){}
  if(cancel){
    const res=activeResource();if(res&&g.snapshot)res.data.set(g.snapshot.before);decodeCurrent();queueRedraw(true);return;
  }

  // Pointer-up can arrive without a matching final pointer-move event.
  // Primitive tools deliberately keep an out-of-bounds endpoint so their full
  // geometry may extend beyond the track. writePoint() clips the resulting
  // pixels/cells to the real resource, allowing partial shapes at every edge.
  const allowOutside=primitiveAllowsOutside(g.tool);
  const release=gridPoint(worldPoint(ev,source,!allowOutside),allowOutside);
  if(release){
    g.current=release;
    if(g.tool==='freehand'&&(release.x!==g.last.x||release.y!==g.last.y)){
      writeBrushedPoints(L.toolPoints('freehand',g.last,release),g.value,g.brushSize,g.brushShape,g.hatched,g.hatchPhase);
      g.last=release;
    }
  }

  if(g.tool!=='freehand'&&g.tool!=='fill'){
    writeBrushedPoints(primitivePoints(g.tool,g.start,g.current),g.value,g.brushSize,g.brushShape,g.hatched,g.hatchPhase);
  }
  commitHistory(g.snapshot);queueRedraw(true);ev.preventDefault();
}
function beginGesture(ev){beginGestureFrom(ev,'main');}
function moveGesture(ev){moveGestureFrom(ev,'main');}
function endGesture(ev,cancel=false){endGestureFrom(ev,'main',cancel);}

function patchNormalCursor(ev){
  if(!model||editMode||!surface||!mask||!heading)return;
  const p=canvasPoint(ev,view),x=Math.floor(p.x),y=Math.floor(p.y),surf=y<224?surface.cells[(y>>1)*160+(x>>1)]:'—',occ=mask[y*320+x];
  const el=$('cursorInfo');if(!el)return;
  const lines=el.textContent.split('\n');
  if(lines.length>=2){
    const head=y<224?heading.values[(y>>3)*40+(x>>3)]:'—';
    lines[1]=`surface ${surf} · recovery ${head} · foreground ${occ}`;
    el.textContent=lines.join('\n');
  }
}

function compositePng(){
  const c=document.createElement('canvas');c.width=view.width;c.height=view.height;
  const cctx=c.getContext('2d');cctx.drawImage(view,0,0);cctx.drawImage(overlay,0,0);
  c.toBlob(b=>downloadBlob(b,`indyheat_group_${currentIndex+1}_view.png`),'image/png');
}
function interceptExports(){
  document.querySelectorAll('[data-dl]').forEach(btn=>btn.addEventListener('click',ev=>{
    const i=Number(btn.dataset.dl);
    if(!model||!currentResources||!(i===1||i===2))return;
    ev.preventDefault();ev.stopImmediatePropagation();
    const r=currentResources[i],suffix=i===1?'bitmap1':'surface2bpp';
    downloadBytes(r.data,`indyheat_${hex2(r.id)}_${suffix}.bin`);
  },true));
  $('savePng')?.addEventListener('click',ev=>{
    if(!model)return;
    ev.preventDefault();ev.stopImmediatePropagation();compositePng();
  },true);
}

ui.showMask.addEventListener('change',()=>queueRedraw());
ui.showSurface.addEventListener('change',()=>queueRedraw());
ui.modeWaypoints.addEventListener('click',e=>{e.preventDefault();enterWaypointMode();});
ui.editMask.addEventListener('click',e=>{e.preventDefault();enterEdit('mask');});
ui.editSurface.addEventListener('click',e=>{e.preventDefault();enterEdit('surface');});
ui.undo.addEventListener('click',undo);ui.revert.addEventListener('click',revertLayer);ui.invert.addEventListener('click',invertForegroundLayer);
document.querySelectorAll('input[name="layerTool"]').forEach(r=>r.addEventListener('change',()=>{
  if(gesture?.multiClick)cancelClickShape('Shape cancelled.');
  else gesture=null;
  queueRedraw();
}));
ui.brushSize.addEventListener('input',()=>{
  if(gesture?.multiClick)cancelClickShape('Shape cancelled.');
  else gesture=null;
  updateBrushLabel();queueRedraw();
});
ui.brushShape.addEventListener('click',()=>{
  ui.brushShape.dataset.shape=ui.brushShape.dataset.shape==='circle'?'square':'circle';
  if(gesture?.multiClick)cancelClickShape('Shape cancelled.');
  else gesture=null;
  updateBrushShapeButton();queueRedraw();
});
ui.brushHatch.addEventListener('click',()=>{
  if(ui.brushHatch.disabled)return;
  ui.brushHatch.dataset.hatched=ui.brushHatch.dataset.hatched==='true'?'false':'true';
  if(gesture?.multiClick)cancelClickShape('Shape cancelled.');
  else gesture=null;
  updateBrushHatchButton();queueRedraw();
});

document.querySelectorAll('.surfaceClass').forEach(c=>c.addEventListener('change',()=>queueRedraw()));
document.querySelectorAll('.waypointSet').forEach(c=>c.addEventListener('change',()=>queueRedraw(true)));
$('showBit7Flags')?.addEventListener('change',()=>queueRedraw());
$('showNonDefaultLinkDeltas')?.addEventListener('change',()=>queueRedraw());
for(const id of ['wpProjectionMode','wpScaleX','wpOffsetX','wpScaleY','wpOffsetY']){
  $(id)?.addEventListener(id==='wpProjectionMode'?'change':'input',()=>queueRedraw());
}
$('opacity')?.addEventListener('input',()=>queueRedraw());
$('editorScale')?.addEventListener('input',e=>{
  viewportCentre=captureViewportCentre();
  const text=$('editorScaleText');
  if(text)text.textContent=`${Math.round(Number(e.target.value)*100)}%`;
  e.target.dispatchEvent(new Event('change'));
});
$('editorScale')?.addEventListener('change',()=>setTimeout(()=>{
  syncCanvasSize();
  restoreViewportCentre();
  viewportCentre=null;
},0));
ui.viewportToggle.addEventListener('click',toggleViewport);
$('trackSelect')?.addEventListener('change',e=>selectedTrack(Number(e.target.value)));
$('showWaypoints')?.addEventListener('change',e=>{if(e.target.checked&&editMode)enterWaypointMode();else{syncEditorPane();queueRedraw(true);}});
$('fileInput')?.addEventListener('change',e=>{if(e.target.files?.[0])loadManualFile(e.target.files[0]);});
$('dropZone')?.addEventListener('drop',e=>{if(e.dataTransfer?.files?.[0])loadManualFile(e.dataTransfer.files[0]);});

overlay.addEventListener('contextmenu',e=>{if(editMode)e.preventDefault();});
overlay.addEventListener('pointerdown',beginGesture);
overlay.addEventListener('pointermove',moveGesture);
overlay.addEventListener('pointerup',e=>endGesture(e,false));
overlay.addEventListener('pointercancel',e=>endGesture(e,true));
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&gesture?.multiClick){
    e.preventDefault();
    cancelClickShape('Shape cancelled.');
  }
});

view.addEventListener('pointermove',patchNormalCursor);
// app.js updates the waypoint editor fields before this listener runs. Mirror those
// live values into the research overlay model so Bit-7 rings and Link-delta arrows
// follow waypoint drag previews immediately instead of remaining at the loaded position.
view.addEventListener('pointermove',()=>{
  if(!editMode&&$('showWaypoints')?.checked&&syncSelectedResearchPointFromEditor())queueRedraw();
});
view.addEventListener('pointerup',()=>setTimeout(()=>{if(syncSelectedResearchPointFromEditor())queueRedraw(true);},0));
view.addEventListener('pointercancel',()=>setTimeout(()=>{if(syncSelectedResearchPointFromEditor())queueRedraw(true);},0));
$('applyWaypoint')?.addEventListener('click',()=>setTimeout(()=>{if(syncSelectedResearchPointFromEditor())queueRedraw(true);},0));
$('revertWaypoint')?.addEventListener('click',()=>setTimeout(()=>{if(syncSelectedResearchPointFromEditor())queueRedraw(true);},0));
$('revertAll')?.addEventListener('click',()=>setTimeout(resetResearchWaypointsFromLayerModel,0));

for(const id of ['showBg','backgroundOpacity','paletteMode','showHeading','headingDensity']){
  $(id)?.addEventListener(id==='backgroundOpacity'?'input':'change',()=>queueRedraw());
}

interceptExports();
$('revertAll')?.addEventListener('click',()=>revertAllLayers(),true);
const editCount=$('editCount');
if(editCount)new MutationObserver(syncGlobalRevertButton).observe(editCount,{childList:true,subtree:true,characterData:true});
if(typeof ResizeObserver!=='undefined')new ResizeObserver(syncCanvasSize).observe(view);
editMode=null;syncEditorPane();setViewportFixed(false);syncCanvasSize();syncGlobalRevertButton();
preloadDisk();

})();
