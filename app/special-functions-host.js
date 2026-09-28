(function(root){
'use strict';

/* Stable host for isolated procedural editor Special Functions. */
const API_VERSION=3;
const HOST_VERSION='1.5';
const plugins=new Map(),adapters=new Map(),loadedModules=new Set(),moduleErrors=new Map();
let selectedId=null,manifestModules=[],uiTimer=null,moduleLoadChain=Promise.resolve(),reloadCounter=0;
const SESSION_TOKEN=Date.now().toString(36);
let loadToken=SESSION_TOKEN;

const scriptUrl=(typeof document!=='undefined'&&document.currentScript?.src)?document.currentScript.src:null;
const appBaseUrl=scriptUrl?new URL('.',scriptUrl):null;
const specialBaseUrl=appBaseUrl?new URL('special-functions/',appBaseUrl):null;

function notify(name,detail={}){
  if(typeof root.dispatchEvent==='function'&&typeof CustomEvent!=='undefined')root.dispatchEvent(new CustomEvent(name,{detail}));
}
function asStrings(values){return Object.freeze(Array.from(values||[]).map(v=>String(v).trim()).filter(Boolean));}
function normaliseLayers(value){
  if(Array.isArray(value))return asStrings(value);
  if(value&&typeof value==='object')return asStrings(Object.keys(value).filter(k=>value[k]));
  return Object.freeze(['backdrop']);
}
function normalisePlugin(entry){
  if(!entry||typeof entry!=='object')throw new Error('Special Function registration requires an object.');
  const id=String(entry.id||'').trim();if(!id)throw new Error('Special Function ID is required.');
  if(!/^[a-z0-9][a-z0-9._-]*$/i.test(id))throw new Error(`Invalid Special Function ID "${id}".`);
  const supportedModes=asStrings(entry.supportedModes||entry.modes||['backdrop']);
  const supportedTools=asStrings(entry.supportedTools||entry.allowedTools||[]);
  const layers=normaliseLayers(entry.layers);
  if(!supportedModes.length)throw new Error(`${id}: at least one supported editor mode is required.`);
  if(!supportedTools.length)throw new Error(`${id}: at least one supported artist tool is required.`);
  if(!layers.length)throw new Error(`${id}: at least one logical layer is required.`);
  return Object.freeze({
    id,
    name:String(entry.name||id),
    version:String(entry.version||'0.0.0'),
    category:String(entry.category||'Other'),
    description:String(entry.description||''),
    status:String(entry.status||'ready'),
    supportedModes,
    supportedTools,
    layers,
    activate:typeof entry.activate==='function'?entry.activate:null,
    deactivate:typeof entry.deactivate==='function'?entry.deactivate:null,
    mountControls:typeof entry.mountControls==='function'?entry.mountControls:null,
    preview:typeof entry.preview==='function'?entry.preview:null,
    apply:typeof entry.apply==='function'?entry.apply:null
  });
}
function register(entry){
  const plugin=normalisePlugin(entry);
  if(plugins.has(plugin.id))throw new Error(`Special Function "${plugin.id}" is already registered.`);
  plugins.set(plugin.id,plugin);
  notify('indyheat-special-functions-changed',{id:plugin.id,item:plugin});
  renderUi();
  return plugin;
}
function remove(id){
  id=String(id);if(selectedId===id)clearSelection();
  const removed=plugins.delete(id);if(removed){notify('indyheat-special-functions-changed',{id});renderUi();}return removed;
}
function get(id){return plugins.get(String(id))||null;}
function list({mode=null}={}){const all=[...plugins.values()];return mode==null?all:all.filter(p=>p.supportedModes.includes(String(mode)));}
function selected(){return selectedId?get(selectedId):null;}
function adapterFor(target){return adapters.get(String(target))||null;}
function activeFor(target){const p=selected();return !!(p&&p.supportedModes.includes(String(target)));}
function supportsTool(tool,target='backdrop'){
  const p=selected();if(!p||!p.supportedModes.includes(String(target)))return true;
  return p.supportedTools.includes(String(tool));
}
function toolDisplayName(value){
  const names={freehand:'Pencil',line:'Line',curve:'Curve',freeform:'Free-form',rectangle:'Rectangle','rectangle-filled':'Filled rectangle',ellipse:'Ellipse','ellipse-filled':'Filled ellipse',fill:'Fill',pick:'Pick'};
  return names[value]||String(value);
}
function compactError(target,err){
  const adapter=adapterFor(target);const text=`Special Function: ${err?.message||err}`;
  try{adapter?.setStatus?.(text,true);}catch(_e){}
  return false;
}
function cloneTemplate(template){
  if(!template||typeof template!=='object')return null;
  const pixels=template.pixels instanceof Uint8Array?template.pixels.slice():Uint8Array.from(template.pixels||[]);
  return Object.freeze({
    id:template.id==null?null:String(template.id),name:String(template.name||'Template'),
    width:Number(template.width)||0,height:Number(template.height)||0,
    hotspotX:Number(template.hotspotX)||0,hotspotY:Number(template.hotspotY)||0,
    transparent:Number(template.transparent)||0,paletteSize:Number(template.paletteSize)||0,pixels
  });
}
function lifecycleContext(plugin,target){
  const adapter=adapterFor(target);
  return Object.freeze({
    apiVersion:API_VERSION,target,plugin,
    width:Number(adapter?.width)||0,height:Number(adapter?.height)||0,paletteSize:Number(adapter?.paletteSize)||0,
    primaryColour:()=>Number(adapter?.getPrimaryColour?.()??0),
    template:()=>cloneTemplate(adapter?.getTemplate?.()),
    hasLayer:name=>adapter?.readLayer?.(String(name)) instanceof Uint8Array,
    layerInfo:name=>{const key=String(name),base=adapter?.readLayer?.(key);return base instanceof Uint8Array?normaliseLayerInfo(adapter,key,base):null;},
    refreshPreview:()=>adapter?.requestRedraw?.(),
    ui:createUiHelpers(adapter)
  });
}
function activatePlugin(plugin,target){try{plugin?.activate?.(lifecycleContext(plugin,target));}catch(err){compactError(target,err);}}
function deactivatePlugin(plugin,target){try{plugin?.deactivate?.(lifecycleContext(plugin,target));}catch(err){compactError(target,err);}}
function syncAdapterSelection(target){
  const adapter=adapterFor(target),plugin=selected();if(!adapter)return;
  const active=plugin&&plugin.supportedModes.includes(target)?plugin:null;
  try{adapter.clearPreview?.();}catch(_e){}
  try{adapter.onSelectionChanged?.(active);}catch(err){compactError(target,err);}
  if(active){
    const current=String(adapter.getTool?.()||'');
    if(!active.supportedTools.includes(current)&&active.supportedTools.length)try{adapter.setTool?.(active.supportedTools[0]);}catch(err){compactError(target,err);}
  }
  try{adapter.requestRedraw?.();}catch(_e){}
}
function select(id){
  const next=get(id);if(!next)throw new Error(`Unknown Special Function "${id}".`);
  if(selectedId===next.id){clearSelection();return null;}
  const previous=selected();
  if(previous)for(const target of previous.supportedModes)deactivatePlugin(previous,target);
  selectedId=next.id;
  for(const target of new Set([...adapters.keys(),...next.supportedModes]))syncAdapterSelection(target);
  for(const target of next.supportedModes)activatePlugin(next,target);
  notify('indyheat-special-function-selection-changed',{id:selectedId,item:next});
  renderUi();
  return next;
}
function clearSelection(){
  const previous=selected();if(!previous)return;
  for(const target of previous.supportedModes)deactivatePlugin(previous,target);
  selectedId=null;
  for(const target of adapters.keys())syncAdapterSelection(target);
  notify('indyheat-special-function-selection-changed',{id:null,item:null});
  renderUi();
}
function attachAdapter(target,adapter){
  target=String(target||'').trim();if(!target)throw new Error('Special Function adapter target is required.');
  if(!adapter||typeof adapter.readLayer!=='function'||typeof adapter.previewLayers!=='function'||typeof adapter.commitLayers!=='function')throw new Error(`${target}: incomplete Special Function adapter.`);
  adapters.set(target,adapter);syncAdapterSelection(target);renderUi();return adapter;
}
function detachAdapter(target){target=String(target);const adapter=adapters.get(target);try{adapter?.clearPreview?.();}catch(_e){}return adapters.delete(target);}

function clonePoint(point){
  if(Array.isArray(point))return Object.freeze({x:Number(point[0]),y:Number(point[1])});
  return Object.freeze({x:Number(point?.x),y:Number(point?.y)});
}
function normaliseGeometry(geometry){
  const tool=String(geometry?.tool||'');
  const points=Object.freeze(Array.from(geometry?.points||[]).map(clonePoint).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
  const targetColour=Number(geometry?.targetColour);
  return Object.freeze({
    tool,points,
    start:geometry?.start?clonePoint(geometry.start):(points[0]||null),
    end:geometry?.end?clonePoint(geometry.end):(points[points.length-1]||null),
    control:geometry?.control?clonePoint(geometry.control):null,
    vertices:Object.freeze(Array.from(geometry?.vertices||[]).map(clonePoint)),
    seed:geometry?.seed?clonePoint(geometry.seed):null,
    targetColour:Number.isFinite(targetColour)?targetColour:null,
    filled:geometry?.filled===true,
    secondary:geometry?.secondary===true,
    complete:geometry?.complete===true
  });
}
function pixelHelpers(width,height,paletteSize,info={}){
  const cellWidth=Math.max(1,Number(info.cellWidth)||1),cellHeight=Math.max(1,Number(info.cellHeight)||1);
  function validIndex(index){index=Number(index);if(!Number.isInteger(index)||index<0||index>=paletteSize)throw new Error(`Palette index ${index} is outside 0..${paletteSize-1}.`);return index;}
  function setIndexedPixel(pixels,x,y,index){
    x=Math.round(Number(x));y=Math.round(Number(y));index=validIndex(index);
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=width||y>=height)return false;
    pixels[y*width+x]=index;return true;
  }
  function paintDisc(pixels,cx,cy,radius,index){
    index=validIndex(index);cx=Number(cx);cy=Number(cy);radius=Math.max(0,Number(radius)||0);
    const x0=Math.floor(cx-radius),x1=Math.ceil(cx+radius),y0=Math.floor(cy-radius),y1=Math.ceil(cy+radius),r2=(radius+.35)*(radius+.35);let n=0;
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if((x-cx)*(x-cx)+(y-cy)*(y-cy)<=r2&&setIndexedPixel(pixels,x,y,index))n++;
    return n;
  }
  function screenToLayer(x,y){
    x=Math.floor(Number(x)/cellWidth);y=Math.floor(Number(y)/cellHeight);
    return Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&y>=0&&x<width&&y<height?Object.freeze({x,y}):null;
  }
  function layerToScreen(x,y){
    x=Math.round(Number(x));y=Math.round(Number(y));
    return Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&y>=0&&x<width&&y<height?Object.freeze({x:x*cellWidth,y:y*cellHeight,width:cellWidth,height:cellHeight}):null;
  }
  function setAtScreen(pixels,x,y,index){const p=screenToLayer(x,y);return p?setIndexedPixel(pixels,p.x,p.y,index):false;}
  return Object.freeze({setIndexedPixel,paintDisc,validIndex,screenToLayer,layerToScreen,setAtScreen,clamp:(v,min,max)=>Math.max(min,Math.min(max,v))});
}
function normaliseToolState(value){
  const q=value&&typeof value==='object'?value:{};
  return Object.freeze({
    brushSize:Math.max(1,Math.round(Number(q.brushSize)||1)),
    brushShape:String(q.brushShape||'square'),
    hatched:q.hatched===true
  });
}
function normaliseLayerInfo(adapter,name,base){
  const raw=typeof adapter.layerInfo==='function'?(adapter.layerInfo(name)||{}):{};
  let width=Math.round(Number(raw.width)),height=Math.round(Number(raw.height));
  if(!(width>0&&height>0)){
    const aw=Math.round(Number(adapter.width)),ah=Math.round(Number(adapter.height));
    if(aw>0&&ah>0&&aw*ah===base.length){width=aw;height=ah;}
    else{width=base.length;height=1;}
  }
  if(width*height!==base.length)throw new Error(`${name}: logical layer dimensions ${width}×${height} do not match ${base.length} values.`);
  const paletteSize=Math.max(1,Math.round(Number(raw.paletteSize)||Number(adapter.paletteSize)||256));
  return Object.freeze({
    name:String(name),width,height,paletteSize,
    kind:String(raw.kind||'indexed'),
    screenWidth:Math.max(1,Math.round(Number(raw.screenWidth)||width)),
    screenHeight:Math.max(1,Math.round(Number(raw.screenHeight)||height)),
    cellWidth:Math.max(1,Number(raw.cellWidth)||1),
    cellHeight:Math.max(1,Number(raw.cellHeight)||1)
  });
}
function validateLayer(adapter,name,pixels,base,info=null){
  if(!(pixels instanceof Uint8Array))pixels=Uint8Array.from(pixels||[]);
  if(pixels.length!==base.length)throw new Error(`${name}: plugin returned ${pixels.length} values; expected ${base.length}.`);
  if(typeof adapter.validateLayer==='function')adapter.validateLayer(name,pixels,base,info);
  return pixels;
}
function runPlugin(target,geometry,phase){
  const plugin=selected(),adapter=adapterFor(target);
  if(!plugin||!adapter||!plugin.supportedModes.includes(target))return null;
  const g=normaliseGeometry(geometry);if(!plugin.supportedTools.includes(g.tool))return null;
  const baseLayers={},workingLayers={},layerInfos={},layerHelpers={};
  for(const name of plugin.layers){
    const base=adapter.readLayer(name);if(!(base instanceof Uint8Array))throw new Error(`${plugin.name}: logical layer "${name}" is unavailable in ${target}.`);
    baseLayers[name]=base.slice();workingLayers[name]=base.slice();
    layerInfos[name]=normaliseLayerInfo(adapter,name,base);
    layerHelpers[name]=pixelHelpers(layerInfos[name].width,layerInfos[name].height,layerInfos[name].paletteSize,layerInfos[name]);
  }
  const primaryLayer=Object.prototype.hasOwnProperty.call(layerHelpers,'backdrop')?'backdrop':plugin.layers[0];
  const helpers=layerHelpers[primaryLayer]||pixelHelpers(Number(adapter.width)||0,Number(adapter.height)||0,Number(adapter.paletteSize)||256);
  const ctx={
    apiVersion:API_VERSION,phase,target,plugin,geometry:g,
    width:Number(adapter.width)||0,height:Number(adapter.height)||0,paletteSize:Number(adapter.paletteSize)||0,
    primaryColour:Number(adapter.getPrimaryColour?.()??0),
    toolState:normaliseToolState(adapter.getToolState?.()),
    template:cloneTemplate(adapter.getTemplate?.()),
    layer(name){name=String(name);if(!Object.prototype.hasOwnProperty.call(workingLayers,name))throw new Error(`${plugin.name}: undeclared layer "${name}".`);return workingLayers[name];},
    baseLayer(name){name=String(name);if(!Object.prototype.hasOwnProperty.call(baseLayers,name))throw new Error(`${plugin.name}: undeclared layer "${name}".`);return baseLayers[name].slice();},
    layerInfo(name){name=String(name);if(!Object.prototype.hasOwnProperty.call(layerInfos,name))throw new Error(`${plugin.name}: undeclared layer "${name}".`);return layerInfos[name];},
    helpersFor(name){name=String(name);if(!Object.prototype.hasOwnProperty.call(layerHelpers,name))throw new Error(`${plugin.name}: undeclared layer "${name}".`);return layerHelpers[name];},
    paletteRgb:index=>adapter.paletteRgb?.(index)||null,
    paletteWord:index=>adapter.paletteWord?.(index)??null,
    helpers
  };
  const callback=phase==='preview'?(plugin.preview||plugin.apply):(plugin.apply||plugin.preview);
  if(!callback)throw new Error(`${plugin.name}: no ${phase} or apply handler is registered.`);
  const returned=callback(ctx);
  if(returned&&typeof returned.then==='function')throw new Error(`${plugin.name}: asynchronous drawing handlers are not supported.`);
  if(returned?.layers&&typeof returned.layers==='object')for(const [name,pixels] of Object.entries(returned.layers)){
    if(!Object.prototype.hasOwnProperty.call(workingLayers,name))throw new Error(`${plugin.name}: returned undeclared layer "${name}".`);
    workingLayers[name]=Uint8Array.from(pixels);
  }
  for(const name of Object.keys(workingLayers))workingLayers[name]=validateLayer(adapter,name,workingLayers[name],baseLayers[name],layerInfos[name]);
  return {plugin,geometry:g,baseLayers,workingLayers,message:String(returned?.message||`${plugin.name} committed.`)};
}
function previewGeometry(target,geometry,options={}){
  target=String(target);if(!activeFor(target)||!supportsTool(geometry?.tool,target))return false;
  try{const result=runPlugin(target,geometry,'preview');if(!result)return false;adapterFor(target).previewLayers(result.workingLayers,{...options,baseLayers:result.baseLayers,plugin:result.plugin,geometry:result.geometry});return true;}catch(err){return compactError(target,err);}
}
function commitGeometry(target,geometry,options={}){
  target=String(target);if(!activeFor(target)||!supportsTool(geometry?.tool,target))return false;
  try{const result=runPlugin(target,geometry,'apply');if(!result)return false;const ok=adapterFor(target).commitLayers(result.workingLayers,{...options,baseLayers:result.baseLayers,plugin:result.plugin,geometry:result.geometry,message:result.message});return ok!==false;}catch(err){return compactError(target,err);}
}
function clearPreview(target){try{return adapterFor(String(target))?.clearPreview?.()!==false;}catch(err){return compactError(String(target),err);}}

function createUiHelpers(adapter){
  function row(container,labelText,input){const label=document.createElement('label');label.className='specialControlRow';const span=document.createElement('span');span.textContent=labelText;label.append(span,input);container.appendChild(label);return input;}
  function slider(container,{label,min=0,max=100,step=1,value=0,onInput}){const input=document.createElement('input');input.type='range';input.min=String(min);input.max=String(max);input.step=String(step);input.value=String(value);const output=document.createElement('output');output.textContent=input.value;input.addEventListener('input',()=>{output.textContent=input.value;onInput?.(Number(input.value));adapter?.requestRedraw?.();});const wrap=document.createElement('span');wrap.className='specialSlider';wrap.append(input,output);return row(container,label,wrap);}
  function checkbox(container,{label,checked=false,onChange}){const input=document.createElement('input');input.type='checkbox';input.checked=!!checked;input.addEventListener('change',()=>{onChange?.(input.checked);adapter?.requestRedraw?.();});const wrap=document.createElement('span');wrap.className='specialCheck';wrap.append(input);return row(container,label,wrap);}
  function selectControl(container,{label,options=[],value,onChange}){const input=document.createElement('select');for(const item of options){const option=document.createElement('option'),v=typeof item==='object'?item.value:item,t=typeof item==='object'?item.label:item;option.value=String(v);option.textContent=String(t);input.appendChild(option);}if(value!=null)input.value=String(value);input.addEventListener('change',()=>{onChange?.(input.value);adapter?.requestRedraw?.();});return row(container,label,input);}
  function button(container,{label,onClick}){const input=document.createElement('button');input.type='button';input.textContent=label;input.addEventListener('click',()=>onClick?.());container.appendChild(input);return input;}
  function paletteIndex(container,{label,value=0,onInput}){const input=document.createElement('input');input.type='number';input.min='0';input.max=String(Math.max(0,(Number(adapter?.paletteSize)||1)-1));input.step='1';input.value=String(value);input.addEventListener('change',()=>{let v=Number(input.value);v=Math.max(0,Math.min(Number(input.max),Number.isFinite(v)?Math.round(v):0));input.value=String(v);onInput?.(v);adapter?.requestRedraw?.();});return row(container,label,input);}
  function paletteColour(container,{label,value=0,onInput}){
    const size=Math.max(1,Number(adapter?.paletteSize)||1),wrap=document.createElement('span');wrap.className='specialPaletteColour';
    const input=document.createElement('input');input.type='color';input.setAttribute('aria-label',label);
    const swatch=document.createElement('span');swatch.className='specialPaletteSwatch';
    const index=document.createElement('span');index.className='specialPaletteIndex';
    const rgbAt=i=>{const c=adapter?.paletteRgb?.(i);return Array.isArray(c)&&c.length>=3?c.map(v=>Math.max(0,Math.min(255,Math.round(Number(v)||0)))).slice(0,3):[255,0,255];};
    const hex=c=>'#'+c.map(v=>v.toString(16).padStart(2,'0')).join('');
    const snapRgb=rgb=>{let best=0,bestD=Infinity;for(let i=0;i<size;i++){const c=rgbAt(i),dr=rgb[0]-c[0],dg=rgb[1]-c[1],db=rgb[2]-c[2],d=dr*dr+dg*dg+db*db;if(d<bestD){bestD=d;best=i;}}return best;};
    const show=i=>{i=Math.max(0,Math.min(size-1,Math.round(Number(i)||0)));const c=rgbAt(i),h=hex(c);input.value=h;swatch.style.background=h;swatch.title=`Palette index ${i}`;index.textContent=String(i);return i;};
    show(value);
    input.addEventListener('change',()=>{const h=input.value,rgb=[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)],v=show(snapRgb(rgb));onInput?.(v);adapter?.requestRedraw?.();});
    wrap.append(input,swatch,index);return row(container,label,wrap);
  }
  return Object.freeze({slider,checkbox,select:selectControl,button,paletteIndex,paletteColour});
}
function mountSelectedControls(){
  if(typeof document==='undefined')return;const host=document.getElementById('backdropSpecialFunctionControls');if(!host)return;host.replaceChildren();const plugin=selected();if(!plugin||!plugin.supportedModes.includes('backdrop'))return;
  const adapter=adapterFor('backdrop'),ctx=lifecycleContext(plugin,'backdrop');
  try{plugin.mountControls?.(host,ctx);}catch(err){const m=document.createElement('div');m.className='specialError';m.textContent=err.message;host.appendChild(m);compactError('backdrop',err);}
}
function injectStyle(){
  if(typeof document==='undefined'||document.getElementById('indyheatSpecialFunctionsHostStyle'))return;
  const style=document.createElement('style');style.id='indyheatSpecialFunctionsHostStyle';style.textContent=`
    #backdropSpecialFunctions{margin:7px 0 7px;padding-top:7px;border-top:1px solid #343b46}
    #backdropSpecialFunctionHeader{display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:11px;color:#d7dce5;margin:0 0 3px}
    #backdropSpecialFunctionRefresh{padding:1px 5px;min-height:18px;font-size:9px;line-height:1.1}
    #backdropSpecialFunctionRefresh:disabled{opacity:.55}
    #backdropSpecialFunctionList{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;max-height:154px;overflow:auto;padding:2px 4px 5px 2px}
    #backdropSpecialFunctionList.empty{display:block;max-height:none;padding:5px 2px;color:#89919e;font-size:10px}
    #backdropSpecialFunctionList button{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px;align-items:center;min-width:0;padding:5px 6px;text-align:left;font-size:10px}
    #backdropSpecialFunctionList button.selected{border-color:#d6b54a;background:#40391f;box-shadow:inset 0 0 0 1px #8f792f}
    #backdropSpecialFunctionList .specialName{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #backdropSpecialFunctionList .specialVersion{font-size:8px;color:#9fa7b4;white-space:nowrap}
    #backdropSpecialFunctionInfo{margin:5px 0 2px;padding:6px 7px;background:#15191f;border:1px solid #303640;border-radius:4px;font-size:10px;color:#aab1bd}
    #backdropSpecialFunctionInfo[hidden]{display:none}
    #backdropSpecialFunctionInfo .specialMeta{display:flex;justify-content:space-between;gap:8px;color:#8f98a6}
    #backdropSpecialFunctionControls{display:grid;gap:5px;margin-top:6px}
    #backdropSpecialFunctionControls:empty{display:none}
    #backdropSpecialFunctionControls .specialControlRow{display:grid;grid-template-columns:minmax(0,1fr) minmax(92px,1.2fr);gap:7px;align-items:center;margin:0}
    #backdropSpecialFunctionControls .specialSlider{display:grid;grid-template-columns:minmax(0,1fr) 28px;gap:5px;align-items:center}
    #backdropSpecialFunctionControls .specialSlider input{width:100%;min-width:0}
    #backdropSpecialFunctionControls output{text-align:right;font:10px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
    #backdropSpecialFunctionControls input[type=number],#backdropSpecialFunctionControls select{width:100%;box-sizing:border-box}
    #backdropSpecialFunctionControls .specialPaletteColour{display:grid;grid-template-columns:34px 22px 24px;gap:5px;align-items:center;justify-content:end}
    #backdropSpecialFunctionControls .specialPaletteColour input[type=color]{width:34px;height:22px;padding:1px;border:1px solid #4a5260;background:#171b21;box-sizing:border-box}
    #backdropSpecialFunctionControls .specialPaletteSwatch{width:20px;height:20px;border:1px solid #676f7c;box-shadow:inset 0 0 0 1px #111}
    #backdropSpecialFunctionControls .specialPaletteIndex{text-align:right;font:10px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#c4cad3}
    #backdropSpecialFunctionControls .specialError{color:#ff8585}
  `;document.head.appendChild(style);
}
function installUi(){
  if(typeof document==='undefined')return false;
  const brushList=document.getElementById('backdropBrushLibraryList');if(!brushList)return false;injectStyle();
  let section=document.getElementById('backdropSpecialFunctions');
  if(!section){section=document.createElement('div');section.id='backdropSpecialFunctions';brushList.insertAdjacentElement('afterend',section);}
  if(!document.getElementById('backdropSpecialFunctionHeader'))section.innerHTML=`
    <div id="backdropSpecialFunctionHeader"><span>Special Functions (<span id="backdropSpecialFunctionCount">0</span>)</span><button id="backdropSpecialFunctionRefresh" type="button" title="Reload manifest and Special Functions">Refresh</button></div>
    <div id="backdropSpecialFunctionList" aria-label="Backdrop Special Functions"></div>
    <div id="backdropSpecialFunctionInfo" hidden><div class="specialMeta"></div><div id="backdropSpecialFunctionControls"></div></div>`;
  const refreshButton=document.getElementById('backdropSpecialFunctionRefresh');
  if(refreshButton&&!refreshButton.dataset.specialRefreshBound){
    refreshButton.dataset.specialRefreshBound='1';
    refreshButton.addEventListener('click',async()=>{
      refreshButton.disabled=true;refreshButton.textContent='...';
      try{await refreshSpecialFunctions();}finally{refreshButton.disabled=false;refreshButton.textContent='Refresh';}
    });
  }
  renderUi();return true;
}
function renderUi(){
  if(typeof document==='undefined')return;const host=document.getElementById('backdropSpecialFunctionList'),count=document.getElementById('backdropSpecialFunctionCount'),info=document.getElementById('backdropSpecialFunctionInfo');if(!host||!info)return;
  const all=list({mode:'backdrop'});if(count)count.textContent=String(all.length);host.replaceChildren();host.classList.toggle('empty',!all.length);
  if(!all.length){host.textContent=moduleErrors.size?'No Special Functions loaded. Check module errors.':'No Special Functions installed.';}
  for(const plugin of all){const button=document.createElement('button');button.type='button';button.dataset.specialFunctionId=plugin.id;button.classList.toggle('selected',plugin.id===selectedId);button.title=plugin.description||plugin.name;const name=document.createElement('span');name.className='specialName';name.textContent=plugin.name;const version=document.createElement('span');version.className='specialVersion';version.textContent=`v${plugin.version}`;button.append(name,version);button.addEventListener('click',()=>select(plugin.id));host.appendChild(button);}
  const plugin=selected();if(!plugin||!plugin.supportedModes.includes('backdrop')){info.hidden=true;info.querySelector('.specialMeta')?.replaceChildren();document.getElementById('backdropSpecialFunctionControls')?.replaceChildren();return;}
  info.hidden=false;const meta=info.querySelector('.specialMeta');if(meta){meta.replaceChildren();const category=document.createElement('span');category.textContent=plugin.category;const tools=document.createElement('span');tools.textContent=plugin.supportedTools.map(toolDisplayName).join(' · ');meta.append(category,tools);}mountSelectedControls();
}
function bootUi(){if(installUi())return;let tries=0;uiTimer=setInterval(()=>{if(installUi()||++tries>240){clearInterval(uiTimer);uiTimer=null;}},50);}

function sanitiseModuleName(value){
  const file=String(typeof value==='object'?value.file:value||'').trim();
  if(!file||file.includes('..')||file.includes('\\')||file.startsWith('/')||!file.toLowerCase().endsWith('.js'))throw new Error(`Invalid Special Function module path "${file}".`);
  return file;
}
function loadModule(moduleEntry,token=loadToken){
  const file=sanitiseModuleName(moduleEntry);if(loadedModules.has(file))return Promise.resolve(true);if(typeof document==='undefined'||!specialBaseUrl)return Promise.resolve(false);
  return new Promise(resolve=>{
    const script=document.createElement('script'),url=new URL(file,specialBaseUrl);url.searchParams.set('sf',token);script.src=url.href;script.dataset.indyheatSpecialFunction=file;script.async=false;
    script.addEventListener('load',()=>{loadedModules.add(file);moduleErrors.delete(file);renderUi();resolve(true);},{once:true});
    script.addEventListener('error',()=>{moduleErrors.set(file,`Failed to load ${file}`);renderUi();resolve(false);},{once:true});
    document.head.appendChild(script);
  });
}
function loadManifest(modules){
  manifestModules=Object.freeze(Array.from(modules||[]).map(sanitiseModuleName));
  const token=loadToken,files=manifestModules.slice();
  moduleLoadChain=moduleLoadChain.then(async()=>{for(const file of files)await loadModule(file,token);});
  return moduleLoadChain;
}
function loadManifestScript({force=false,token=loadToken}={}){
  if(typeof document==='undefined'||!specialBaseUrl)return Promise.resolve(false);
  const existing=document.querySelector('script[data-indyheat-special-manifest]');
  if(existing&&!force)return Promise.resolve(true);
  if(existing)existing.remove();
  return new Promise(resolve=>{
    const script=document.createElement('script'),url=new URL('manifest.js',specialBaseUrl);url.searchParams.set('sf',token);script.src=url.href;script.dataset.indyheatSpecialManifest='1';script.async=false;
    script.addEventListener('load',()=>{moduleErrors.delete('manifest.js');renderUi();resolve(true);},{once:true});
    script.addEventListener('error',()=>{moduleErrors.set('manifest.js','Failed to load Special Functions manifest.');renderUi();resolve(false);},{once:true});
    document.head.appendChild(script);
  });
}
async function refreshSpecialFunctions(){
  await moduleLoadChain.catch(()=>{});
  clearSelection();
  plugins.clear();loadedModules.clear();moduleErrors.clear();manifestModules=Object.freeze([]);
  if(typeof document!=='undefined')document.querySelectorAll('script[data-indyheat-special-function],script[data-indyheat-special-manifest]').forEach(node=>node.remove());
  try{delete root.INDYHEAT_SPECIAL_FUNCTION_MODULES;}catch(_err){root.INDYHEAT_SPECIAL_FUNCTION_MODULES=undefined;}
  loadToken=`${SESSION_TOKEN}-r${++reloadCounter}`;
  renderUi();
  const manifestLoaded=await loadManifestScript({force:true,token:loadToken});
  if(!manifestLoaded)return false;
  await moduleLoadChain.catch(()=>{});
  notify('indyheat-special-functions-refreshed',{manifest:manifestModules.slice()});
  renderUi();return moduleErrors.size===0;
}

const api=Object.freeze({
  API_VERSION,HOST_VERSION,register,remove,get,list,selected,select,clearSelection,
  attachAdapter,detachAdapter,adapter:adapterFor,isActiveFor:activeFor,supportsTool,
  previewGeometry,commitGeometry,clearPreview,loadManifest,refresh:refreshSpecialFunctions,
  manifest:()=>manifestModules.slice()
});
root.IndyHeatSpecialFunctions=api;
notify('indyheat-special-functions-host-ready',{api});
if(Array.isArray(root.INDYHEAT_SPECIAL_FUNCTION_MODULES))loadManifest(root.INDYHEAT_SPECIAL_FUNCTION_MODULES);
else loadManifestScript();
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(bootUi,0),{once:true});else setTimeout(bootUi,0);
}

})(typeof globalThis!=='undefined'?globalThis:this);
