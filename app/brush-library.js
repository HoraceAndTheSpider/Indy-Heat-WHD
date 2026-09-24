(function(root){
'use strict';

/* Shared brush catalogue + Special Functions framework — v0.101.
 *
 * IHBR v2 carries catalogue metadata with the raster; IHBR v1 remains readable.
 * Brush Manager UI lives in brush-manager.js. Auto Foreground lives in
 * foreground-auto.js. This file owns the shared catalogue/metadata, folder
 * discovery, brush-placement integration and Special Functions registry.
 *
 * Special Functions remain framework/placeholders in v0.101: the Backdrop UI
 * can browse and inspect them, but selecting one does not alter canvas drawing
 * or write any layer.
 */
const VERSION='0.101';
const entries=new Map();
const COMPANION_BASE_URL=(typeof document!=='undefined'&&document.currentScript?.src)?new URL('.',document.currentScript.src).href:null;
function loadCompanionModule(filename,globalName){
  if(typeof document==='undefined'||(globalName&&root[globalName]))return false;
  if(document.querySelector(`script[data-indyheat-companion="${filename}"],script[src*="/${filename}"],script[src$="${filename}"]`))return true;
  const script=document.createElement('script'),url=new URL(filename,COMPANION_BASE_URL||document.baseURI);url.searchParams.set('v','0101');
  script.src=url.href;script.dataset.indyheatCompanion=filename;script.defer=true;document.head.appendChild(script);return true;
}

function clonePixels(pixels){return pixels instanceof Uint8Array?pixels.slice():Uint8Array.from(pixels||[]);}
function cloneBrush(brush){
  if(!brush?.pixels||!Number.isInteger(Number(brush.width))||!Number.isInteger(Number(brush.height)))throw new Error('Brush catalogue entry has invalid raster data.');
  const out={...brush,pixels:clonePixels(brush.pixels)};
  let visible=0;for(const v of out.pixels)if(Number(v)!==Number(out.transparent))visible++;
  out.visiblePixels=visible;return out;
}
function normaliseTarget(value){const s=String(value||'').trim().toLowerCase();if(!s)throw new Error('Brush target is required.');return s;}
function normalisePlacement(placement){
  const p=placement&&typeof placement==='object'?placement:{};
  let foreground=null,surface=null,position=null;
  if(p.foreground){
    const q=p.foreground===true?{}:p.foreground;
    foreground=Object.freeze({
      mode:String(q.mode||'brush-mask'),
      value:q.value==null?1:(Number(q.value)?1:0),
      defaultEnabled:q.defaultEnabled!==false,
      // Optional future/custom footprint payload. The current placement engine
      // uses the visible brush footprint unless a later specialised handler
      // consumes this data, but Brush Manager must preserve it losslessly.
      mask:q.mask==null?null:Object.freeze(jsonClone(q.mask)||{})
    });
  }
  if(p.surface){
    const q=p.surface===true?{}:p.surface,cls=Number(q.class);
    surface=Object.freeze({
      mode:String(q.mode||'brush-footprint'),
      class:Number.isInteger(cls)&&cls>=0&&cls<=3?cls:0,
      defaultEnabled:q.defaultEnabled!==false,
      // Optional per-brush Surface payload retained for future specialised
      // placement; class remains the default when no payload is consumed.
      data:q.data==null?null:Object.freeze(jsonClone(q.data)||{})
    });
  }
  if(p.position){
    const q=p.position===true?{}:p.position,mode=String(q.mode||'fixed').trim().toLowerCase();
    if(mode==='fixed'){
      const x=Number(q.x),y=Number(q.y),anchor=String(q.anchor||'top-left').trim().toLowerCase();
      if(!Number.isInteger(x)||!Number.isInteger(y))throw new Error('Fixed brush placement requires integer X/Y coordinates.');
      if(anchor!=='top-left'&&anchor!=='hotspot')throw new Error(`Unsupported fixed brush anchor ${anchor}.`);
      position=Object.freeze({mode:'fixed',x,y,anchor,singleInstance:q.singleInstance!==false});
    }
  }
  return Object.freeze({foreground,surface,position});
}
function jsonClone(value){
  if(value==null)return value;
  try{return JSON.parse(JSON.stringify(value));}catch(_e){return null;}
}
function register(entry){
  const rawBrush=entry.brush||entry,rawMeta=entry.metadata??rawBrush?.metadata??{};
  const metadata=(rawMeta&&typeof rawMeta==='object'&&!Array.isArray(rawMeta))?(jsonClone(rawMeta)||{}):{};
  const id=String(entry?.id||metadata.id||entry?.key||'').trim();if(!id)throw new Error('Brush catalogue ID is required.');
  const target=normaliseTarget(entry.target||metadata.target||'backdrop'),source=String(entry.source||'session').trim()||'session';
  const brush=cloneBrush({...rawBrush,metadata});
  const allowedRaw=entry.allowedTools!==undefined?entry.allowedTools:metadata.allowedTools;
  const actionsRaw=entry.actions!==undefined?entry.actions:metadata.actions;
  const placementRaw=entry.placement!==undefined?entry.placement:metadata.placement;
  const preferredTool=String(entry.preferredTool??metadata.preferredTool??'').trim()||null;
  const item=Object.freeze({
    id,name:String(entry.name||metadata.name||brush.name||id),
    category:String(entry.category||metadata.category||'Other').trim()||'Other',
    target,source,
    fileName:String(entry.fileName||metadata.fileName||'').trim()||null,
    sourcePath:String(entry.sourcePath||'').trim()||null,
    tags:Object.freeze(Array.from(entry.tags??metadata.tags??[]).map(String)),
    allowedTools:allowedRaw==null?null:Object.freeze(Array.from(allowedRaw).map(String)),
    preferredTool,
    recolourable:entry.recolourable!=null?!!entry.recolourable:(metadata.recolourable==null?null:!!metadata.recolourable),
    actions:Object.freeze(Array.from(actionsRaw||[])),
    placement:normalisePlacement(placementRaw),
    metadata:Object.freeze(metadata),
    brush:Object.freeze({...brush,pixels:brush.pixels,metadata:Object.freeze(metadata)})
  });
  entries.set(id,item);return item;
}
function remove(id){return entries.delete(String(id));}
function removeSource(source){source=String(source);let n=0;for(const [id,e] of entries)if(e.source===source){entries.delete(id);n++;}return n;}
function get(id){return entries.get(String(id))||null;}
function list({target=null,source=null}={}){
  const t=target==null?null:normaliseTarget(target),s=source==null?null:String(source);
  return [...entries.values()].filter(e=>(t==null||e.target===t)&&(s==null||e.source===s));
}
function materialise(idOrEntry){const entry=typeof idOrEntry==='string'?get(idOrEntry):idOrEntry;if(!entry)return null;const out=cloneBrush({...entry.brush,metadata:jsonClone(entry.metadata)||{}});rememberActiveBrush(out,entry.target,entry);return out;}
function notify(){if(typeof root.dispatchEvent==='function'&&typeof CustomEvent!=='undefined')root.dispatchEvent(new CustomEvent('indyheat-brush-library-changed'));}


const IHBR_V2=2,IHBR_METADATA_FLAG=1,IHBR_HEADER_SIZE=20;
const BUNDLED_BRUSH_FILENAMES=Object.freeze([
  'LapTower.ihbrush','HUD_Red.ihbrush','HUD_White.ihbrush','HUD_Blue.ihbrush'
]);
const brushFolderState={loaded:0,failed:0,lastMessage:'Not scanned yet.',urls:[]};
let localBrushDirectoryHandle=null;

function utf8Encode(text){
  if(typeof TextEncoder!=='undefined')return new TextEncoder().encode(String(text));
  const s=unescape(encodeURIComponent(String(text))),out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;
}
function utf8Decode(bytes){
  if(typeof TextDecoder!=='undefined')return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  let s='';for(const b of bytes)s+=String.fromCharCode(b);return decodeURIComponent(escape(s));
}
function cleanBrushMetadata(metadata){
  if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))return {};
  const out=jsonClone(metadata)||{};
  out.schema='indyheat.brush';
  out.schemaVersion=1;
  return out;
}
function installBrushMetadataFormatSupport(){
  const B=root.IndyHeatBrushTools;if(!B||B.__indyHeatMetadataV2)return !!B;
  const baseDecode=typeof B.decodeBrushFile==='function'?B.decodeBrushFile.bind(B):null;
  if(!baseDecode||typeof B.encodeBrushFile!=='function')return false;
  B.decodeBrushFile=function(bytes){
    if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
    if(bytes.length<IHBR_HEADER_SIZE)throw new Error('Brush file is shorter than the IHBR header.');
    const magic=String.fromCharCode(bytes[0],bytes[1],bytes[2],bytes[3]);
    if(magic!=='IHBR')throw new Error('Not an Indy Heat brush file (IHBR).');
    const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),version=dv.getUint16(4,false);
    if(version===1){const brush=baseDecode(bytes);brush.metadata={};return brush;}
    if(version!==IHBR_V2)throw new Error(`Unsupported IHBR brush version ${version}.`);
    const flags=dv.getUint16(6,false);if(flags&~IHBR_METADATA_FLAG)throw new Error(`Unsupported IHBR v2 brush flags $${flags.toString(16).toUpperCase()}.`);
    const width=dv.getUint16(8,false),height=dv.getUint16(10,false),hotspotX=dv.getUint16(12,false),hotspotY=dv.getUint16(14,false),transparent=bytes[16],paletteSize=bytes[17]||256,metadataLength=dv.getUint16(18,false);
    if(!width||!height)throw new Error('Brush dimensions must be non-zero.');
    if(hotspotX>=width||hotspotY>=height)throw new Error('Brush hotspot lies outside the brush.');
    if(transparent>=paletteSize)throw new Error('Brush transparency index lies outside its palette.');
    const pixelLength=width*height,expected=IHBR_HEADER_SIZE+pixelLength+metadataLength;
    if(bytes.length!==expected)throw new Error(`IHBR v2 brush size mismatch: expected ${expected} bytes, got ${bytes.length}.`);
    const pixels=bytes.slice(IHBR_HEADER_SIZE,IHBR_HEADER_SIZE+pixelLength);let visible=0;
    for(const v of pixels){if(v>=paletteSize)throw new Error(`Brush pixel index ${v} lies outside its ${paletteSize}-colour palette.`);if(v!==transparent)visible++;}
    if(!visible)throw new Error('Brush contains no visible pixels.');
    let metadata={};
    if(flags&IHBR_METADATA_FLAG){
      if(!metadataLength)throw new Error('IHBR v2 metadata flag is set but metadata is empty.');
      try{metadata=JSON.parse(utf8Decode(bytes.slice(IHBR_HEADER_SIZE+pixelLength)));}catch(err){throw new Error(`IHBR v2 metadata JSON is invalid: ${err.message}`);}
      if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))throw new Error('IHBR v2 metadata must be a JSON object.');
    }else if(metadataLength)throw new Error('IHBR v2 contains metadata bytes without the metadata flag.');
    return {key:'loaded_brush',name:String(metadata.name||'Loaded brush'),width,height,hotspotX,hotspotY,transparent,paletteSize,pixels,visiblePixels:visible,fileVersion:version,metadata:cleanBrushMetadata(metadata)};
  };
  B.encodeBrushFile=function(brush,{paletteSize=brush?.paletteSize??32,metadata=brush?.metadata??null}={}){
    if(!brush?.pixels||brush.pixels.length!==brush.width*brush.height)throw new Error('Captured brush is invalid.');
    const width=Number(brush.width),height=Number(brush.height),hotspotX=Number(brush.hotspotX),hotspotY=Number(brush.hotspotY),transparent=Number(brush.transparent);
    if(!Number.isInteger(width)||width<1||width>65535||!Number.isInteger(height)||height<1||height>65535)throw new Error('Brush dimensions are outside IHBR v2 range.');
    if(!Number.isInteger(hotspotX)||hotspotX<0||hotspotX>=width||!Number.isInteger(hotspotY)||hotspotY<0||hotspotY>=height)throw new Error('Brush hotspot is outside the brush.');
    paletteSize=Number(paletteSize);if(!Number.isInteger(paletteSize)||paletteSize<1||paletteSize>256)throw new Error('Brush palette size must be 1..256.');
    if(!Number.isInteger(transparent)||transparent<0||transparent>=paletteSize)throw new Error('Brush transparency index is outside its palette.');
    for(const v of brush.pixels)if(Number(v)<0||Number(v)>=paletteSize)throw new Error(`Brush pixel index ${Number(v)} is outside the ${paletteSize}-colour palette.`);
    const clean=cleanBrushMetadata(metadata),hasMetadata=Object.keys(clean).length>2||metadata!=null;
    const metadataBytes=hasMetadata?utf8Encode(JSON.stringify(clean)):new Uint8Array(0);
    if(metadataBytes.length>65535)throw new Error(`IHBR v2 metadata is too large (${metadataBytes.length} bytes; maximum 65535).`);
    const out=new Uint8Array(IHBR_HEADER_SIZE+width*height+metadataBytes.length),dv=new DataView(out.buffer);
    out.set([73,72,66,82],0);dv.setUint16(4,IHBR_V2,false);dv.setUint16(6,hasMetadata?IHBR_METADATA_FLAG:0,false);
    dv.setUint16(8,width,false);dv.setUint16(10,height,false);dv.setUint16(12,hotspotX,false);dv.setUint16(14,hotspotY,false);
    out[16]=transparent;out[17]=paletteSize===256?0:paletteSize;dv.setUint16(18,metadataBytes.length,false);
    out.set(brush.pixels,IHBR_HEADER_SIZE);out.set(metadataBytes,IHBR_HEADER_SIZE+width*height);return out;
  };
  B.BRUSH_VERSION=IHBR_V2;B.BRUSH_METADATA_SCHEMA_VERSION=1;B.__indyHeatMetadataV2=true;
  return true;
}
function filenameLabel(filename){
  return String(filename||'Brush').replace(/\.ihbrush$/i,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
}
function entryMetadata(entry){
  const m={
    schema:'indyheat.brush',schemaVersion:1,id:entry.id,name:entry.name,category:entry.category,target:entry.target,
    tags:[...entry.tags],allowedTools:entry.allowedTools?[...entry.allowedTools]:null,preferredTool:entry.preferredTool||null,
    recolourable:entry.recolourable,actions:[...entry.actions],placement:{}
  };
  if(entry.placement.foreground)m.placement.foreground={...entry.placement.foreground};
  if(entry.placement.surface)m.placement.surface={...entry.placement.surface};
  if(entry.placement.position)m.placement.position={...entry.placement.position};
  if(!Object.keys(m.placement).length)delete m.placement;
  return m;
}
function registerDecodedBrush(brush,filename,source='folder:auto',sourcePath=null){
  const metadata=cleanBrushMetadata(brush.metadata||{}),name=String(metadata.name||filenameLabel(filename)),id=String(metadata.id||`folder:${String(filename).toLowerCase()}`);
  const entry=register({
    id,name,category:metadata.category||'Other',target:metadata.target||'backdrop',source,fileName:filename,sourcePath,
    tags:metadata.tags||['folder'],allowedTools:metadata.allowedTools,preferredTool:metadata.preferredTool,
    recolourable:metadata.recolourable,actions:metadata.actions||[],placement:metadata.placement,metadata,
    brush:{...brush,key:metadata.key||id,name,metadata}
  });
  return entry;
}
async function loadBrushUrl(url,{source='folder:auto',filename=null}={}){
  const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error(`${response.status} ${response.statusText}`);
  const bytes=new Uint8Array(await response.arrayBuffer()),B=root.IndyHeatBrushTools;if(!B?.decodeBrushFile)throw new Error('Brush decoder unavailable.');
  const brush=B.decodeBrushFile(bytes),name=filename||decodeURIComponent(String(url).split('/').pop().split('?')[0]);
  return registerDecodedBrush(brush,name,source,String(url));
}
async function discoverDirectoryListing(folderUrl){
  try{
    const response=await fetch(folderUrl,{cache:'no-store'});if(!response.ok)return [];
    const type=response.headers.get('content-type')||'';if(!/html|text/i.test(type))return [];
    const html=await response.text(),doc=new DOMParser().parseFromString(html,'text/html'),seen=new Set(),out=[];
    for(const a of doc.querySelectorAll('a[href]')){
      const href=a.getAttribute('href');if(!href||!href.toLowerCase().split(/[?#]/)[0].endsWith('.ihbrush'))continue;
      const url=new URL(href,folderUrl).href;if(seen.has(url))continue;seen.add(url);out.push(url);
    }
    return out;
  }catch(_e){return [];}
}
async function discoverGithubBrushUrls(){
  if(typeof fetch!=='function')return [];
  try{
    const response=await fetch('https://api.github.com/repos/HoraceAndTheSpider/Indy-Heat-WHD/contents/app/brushes?ref=master',{headers:{Accept:'application/vnd.github+json'},cache:'no-store'});
    if(!response.ok)return [];
    const data=await response.json();if(!Array.isArray(data))return [];
    return data.filter(x=>x?.type==='file'&&/\.ihbrush$/i.test(x.name)&&x.download_url).map(x=>x.download_url);
  }catch(_e){return [];}
}
async function refreshFolderBrushes(){
  if(typeof document==='undefined'||typeof fetch!=='function')return 0;
  removeSource('folder:auto');
  const folderUrl=new URL('brushes/',document.baseURI).href,urls=[];
  for(const url of await discoverDirectoryListing(folderUrl))if(!urls.includes(url))urls.push(url);
  if(!urls.length&&location.protocol!=='file:')for(const url of await discoverGithubBrushUrls())if(!urls.includes(url))urls.push(url);
  // Baseline fallbacks guarantee the shipped objects still load when a host
  // does not expose a directory index and GitHub discovery is unavailable.
  if(!urls.length&&location.protocol!=='file:')for(const name of BUNDLED_BRUSH_FILENAMES)urls.push(new URL(`brushes/${name}`,document.baseURI).href);
  let loaded=0,failed=0;
  for(const url of urls){
    try{await loadBrushUrl(url,{source:'folder:auto'});loaded++;}catch(_e){failed++;}
  }
  brushFolderState.loaded=loaded;brushFolderState.failed=failed;brushFolderState.urls=urls.slice();
  brushFolderState.lastMessage=location.protocol==='file:'&&loaded===0
    ?'Direct file mode cannot enumerate sibling folders without browser permission. Use “Scan local brushes folder”.'
    :`Loaded ${loaded} brush file${loaded===1?'':'s'} from brushes/${failed?` · ${failed} failed`:''}.`;
  notify();
  return loaded;
}
async function registerLocalBrushFiles(files,source='folder:local'){
  const B=root.IndyHeatBrushTools;if(!B?.decodeBrushFile)return 0;
  removeSource(source);let loaded=0,failed=0;
  for(const file of Array.from(files||[])){
    if(!/\.ihbrush$/i.test(file.name))continue;
    try{registerDecodedBrush(B.decodeBrushFile(new Uint8Array(await file.arrayBuffer())),file.name,source,file.webkitRelativePath||file.name);loaded++;}catch(_e){failed++;}
  }
  brushFolderState.loaded=loaded;brushFolderState.failed=failed;brushFolderState.lastMessage=`Loaded ${loaded} local brush file${loaded===1?'':'s'}${failed?` · ${failed} failed`:''}.`;
  notify();return loaded;
}
async function scanLocalBrushFolder(){
  if(typeof root.showDirectoryPicker==='function'){
    try{
      const handle=await root.showDirectoryPicker({mode:'readwrite'});localBrushDirectoryHandle=handle;const files=[];
      for await(const item of handle.values())if(item.kind==='file'&&/\.ihbrush$/i.test(item.name))files.push(await item.getFile());
      return registerLocalBrushFiles(files,'folder:local');
    }catch(err){
      if(err?.name!=='AbortError'){
        brushFolderState.lastMessage=`Local folder scan failed: ${err.message}`;
        notify();
      }
      return 0;
    }
  }
  brushFolderState.lastMessage='This browser cannot open a writable folder directly; use the Brush Manager folder-file fallback.';
  notify();
  return -1;
}

function brushFolderStatus(){
  return Object.freeze({
    loaded:brushFolderState.loaded,failed:brushFolderState.failed,lastMessage:brushFolderState.lastMessage,
    urls:Object.freeze(brushFolderState.urls.slice()),
    localWritable:!!localBrushDirectoryHandle,
    supportsDirectoryPicker:typeof root.showDirectoryPicker==='function'
  });
}
function updateEntryMetadata(id,metadata){
  const entry=get(id);if(!entry)throw new Error(`Unknown brush catalogue entry ${id}.`);
  const clean=cleanBrushMetadata(metadata),newId=String(clean.id||entry.id).trim()||entry.id;
  if(newId!==entry.id&&get(newId))throw new Error(`A brush with ID “${newId}” already exists.`);
  const updatedArgs={
    id:newId,name:String(clean.name||entry.name),category:String(clean.category||entry.category||'Other'),
    target:clean.target||entry.target,source:entry.source,fileName:entry.fileName,sourcePath:entry.sourcePath,
    tags:clean.tags??[...entry.tags],allowedTools:clean.allowedTools!==undefined?clean.allowedTools:entry.allowedTools,
    preferredTool:clean.preferredTool!==undefined?clean.preferredTool:entry.preferredTool,
    recolourable:clean.recolourable!==undefined?clean.recolourable:entry.recolourable,
    actions:clean.actions??[...entry.actions],placement:clean.placement??entry.placement,metadata:clean,
    brush:{...entry.brush,name:String(clean.name||entry.name),metadata:clean}
  };
  if(newId!==entry.id)remove(entry.id);
  const updated=register(updatedArgs);notify();return updated;
}
function encodeEntryFile(idOrEntry){
  const entry=typeof idOrEntry==='string'?get(idOrEntry):idOrEntry;if(!entry)throw new Error('Brush entry is unavailable.');
  const B=root.IndyHeatBrushTools;if(!B?.encodeBrushFile)throw new Error('Brush encoder is unavailable.');
  const metadata=entryMetadata(entry),bytes=B.encodeBrushFile({...entry.brush,metadata},{paletteSize:entry.brush.paletteSize||32,metadata});
  const filename=entry.fileName||`${entry.id.replace(/[^a-z0-9_-]+/gi,'_')}.ihbrush`;
  return {entry,metadata,bytes,filename};
}
async function writeEntryToLocalFolder(idOrEntry){
  if(!localBrushDirectoryHandle)throw new Error('Choose a local brushes folder first.');
  const out=encodeEntryFile(idOrEntry),handle=await localBrushDirectoryHandle.getFileHandle(out.filename,{create:true}),writable=await handle.createWritable();
  await writable.write(out.bytes);await writable.close();
  brushFolderState.lastMessage=`Saved ${out.filename} directly to the selected local brushes folder.`;
  notify();return out.filename;
}

function refreshBuiltins(){
  let count=0;
  const P=root.IndyHeatCircuitPackage,templates=P?.MINIMAP_TEMPLATES;
  removeSource('builtin:minimap');
  if(Array.isArray(templates)){
    for(const t of templates)register({
      id:`builtin:minimap:${t.key}`,name:t.name,category:'MiniMap templates',target:'minimap',source:'builtin:minimap',tags:['builtin'],
      allowedTools:null,actions:[],metadata:{schema:'indyheat.brush',schemaVersion:1,id:`builtin:minimap:${t.key}`,name:t.name,category:'MiniMap templates',target:'minimap'},
      brush:{key:t.key,name:t.name,width:t.width,height:t.height,hotspotX:t.hotspotX,hotspotY:t.hotspotY,transparent:t.transparent,paletteSize:P.PRESENTATION_PALETTE_RGB?.length||32,pixels:clonePixels(t.pixels)}
    });
    count+=templates.length;
  }
  // Backdrop objects are deliberately not embedded here. They are IHBR files
  // under app/brushes/ and are discovered by refreshFolderBrushes().
  removeSource('builtin:backdrop');
  notify();
  return count;
}

const api={
  VERSION,register,remove,removeSource,get,list,materialise,refreshBuiltins,refreshFolderBrushes,scanLocalBrushFolder,
  registerLocalBrushFiles,entryMetadata,brushFolderStatus,updateEntryMetadata,encodeEntryFile,writeEntryToLocalFolder,
  placeFixed:placeFixedBackdropEntry
};
root.IndyHeatBrushLibrary=api;


/* -------------------------------------------------------------------------
 * Special Functions registry
 * -------------------------------------------------------------------------
 *
 * These entries describe procedural Backdrop operations rather than raster
 * brush images. The schema intentionally anticipates later per-function
 * parameters and layer metadata without implementing them prematurely.
 */
const specialEntries=new Map();
let selectedSpecialId=null;

function freezeParameter(parameter){
  const p=parameter&&typeof parameter==='object'?parameter:{key:String(parameter||'')};
  return Object.freeze({...p,key:String(p.key||'').trim(),label:String(p.label||p.key||'').trim()});
}
function normaliseSpecial(entry){
  const id=String(entry?.id||entry?.key||'').trim();if(!id)throw new Error('Special Function ID is required.');
  const source=String(entry.source||'session').trim()||'session';
  const category=String(entry.category||'Other').trim()||'Other';
  const allowedTools=Object.freeze(Array.from(entry.allowedTools||[]).map(String));
  const parameters=Object.freeze(Array.from(entry.parameters||[]).map(freezeParameter));
  const layers=Object.freeze({
    backdrop:entry.layers?.backdrop!==false,
    foreground:entry.layers?.foreground===true,
    surface:entry.layers?.surface===true
  });
  return Object.freeze({
    id,
    name:String(entry.name||id),
    category,
    source,
    description:String(entry.description||''),
    status:String(entry.status||'placeholder'),
    implemented:entry.implemented===true,
    allowedTools,
    parameters,
    layers,
    tags:Object.freeze(Array.from(entry.tags||[]).map(String))
  });
}
function specialRegister(entry){const item=normaliseSpecial(entry);specialEntries.set(item.id,item);specialNotify();return item;}
function specialRemove(id){id=String(id);const removed=specialEntries.delete(id);if(selectedSpecialId===id)selectedSpecialId=null;if(removed)specialNotify();return removed;}
function specialRemoveSource(source){source=String(source);let n=0;for(const [id,e] of specialEntries)if(e.source===source){specialEntries.delete(id);if(selectedSpecialId===id)selectedSpecialId=null;n++;}if(n)specialNotify();return n;}
function specialGet(id){return specialEntries.get(String(id))||null;}
function specialList({category=null,source=null,status=null}={}){
  const c=category==null?null:String(category),s=source==null?null:String(source),st=status==null?null:String(status);
  return [...specialEntries.values()].filter(e=>(c==null||e.category===c)&&(s==null||e.source===s)&&(st==null||e.status===st));
}
function specialSelected(){return selectedSpecialId?specialGet(selectedSpecialId):null;}
function specialSelect(id){
  const item=specialGet(id);if(!item)throw new Error(`Unknown Special Function "${id}".`);
  selectedSpecialId=item.id;specialSelectionNotify();return item;
}
function specialClearSelection(){if(selectedSpecialId==null)return;selectedSpecialId=null;specialSelectionNotify();}
function specialNotify(){if(typeof root.dispatchEvent==='function'&&typeof CustomEvent!=='undefined')root.dispatchEvent(new CustomEvent('indyheat-special-functions-changed'));}
function specialSelectionNotify(){if(typeof root.dispatchEvent==='function'&&typeof CustomEvent!=='undefined')root.dispatchEvent(new CustomEvent('indyheat-special-function-selection-changed',{detail:{id:selectedSpecialId,item:specialSelected()}}));}

const BUILTIN_SPECIAL_FUNCTIONS=Object.freeze([
  Object.freeze({
    id:'track-base',name:'Track base / outline',category:'Track',source:'builtin:special',
    description:'Procedural track ribbon from line, curve or free-form geometry. Intended to establish track width and later support track shading.',
    status:'placeholder',implemented:false,allowedTools:['line','curve','freeform'],parameters:[],layers:{backdrop:true}
  }),
  Object.freeze({
    id:'track-edging',name:'Track edging / walls',category:'Track',source:'builtin:special',
    description:'Patterned track-edge or wall drawing following line, curve or free-form geometry. Pattern, width and colours will be defined from retail examples.',
    status:'placeholder',implemented:false,allowedTools:['line','curve','freeform'],parameters:[],layers:{backdrop:true}
  }),
  Object.freeze({
    id:'track-limit-line',name:'Track-limit line',category:'Track',source:'builtin:special',
    description:'Offset line-edge drawing with a gap followed by a coloured track-limit line. Gap, line width and colour will be defined during implementation.',
    status:'placeholder',implemented:false,allowedTools:['line','curve','freeform'],parameters:[],layers:{backdrop:true}
  }),
  Object.freeze({
    id:'gravel-trap',name:'Gravel trap',category:'Terrain',source:'builtin:special',
    description:'Area-drawn gravel texture for filled shapes or connected regions.',
    status:'placeholder',implemented:false,allowedTools:['rectangle-filled','ellipse-filled','freeform','fill'],parameters:[],layers:{backdrop:true}
  }),
  Object.freeze({
    id:'grass-wear',name:'Grass wear / mud',category:'Terrain',source:'builtin:special',
    description:'Procedural worn-grass treatment using mud browns and dark greens, derived from retail-map patterns.',
    status:'placeholder',implemented:false,allowedTools:['rectangle-filled','ellipse-filled','freeform','fill'],parameters:[],layers:{backdrop:true}
  }),
  Object.freeze({
    id:'mesh-fence',name:'Mesh fence',category:'Scenery',source:'builtin:special',
    description:'Straight or curved mesh fencing with regularly spaced posts.',
    status:'placeholder',implemented:false,allowedTools:['line','curve','freeform'],parameters:[],layers:{backdrop:true}
  }),
  Object.freeze({
    id:'muddy-path',name:'Mud-edged path',category:'Terrain',source:'builtin:special',
    description:'Path generator with procedural muddy or worn edges.',
    status:'placeholder',implemented:false,allowedTools:['line','curve','freeform'],parameters:[],layers:{backdrop:true}
  }),
  Object.freeze({
    id:'crowd-fill',name:'People / crowd fill',category:'Scenery',source:'builtin:special',
    description:'Area-driven crowd placement with controlled variation rather than a single repeated raster stamp.',
    status:'placeholder',implemented:false,allowedTools:['rectangle-filled','ellipse-filled','freeform','fill'],parameters:[],layers:{backdrop:true}
  }),
  Object.freeze({
    id:'woodland-fill',name:'Trees / woodland',category:'Scenery',source:'builtin:special',
    description:'Area-driven tree and woodland placement using repeatable controlled variation.',
    status:'placeholder',implemented:false,allowedTools:['rectangle-filled','ellipse-filled','freeform','fill'],parameters:[],layers:{backdrop:true}
  }),
  Object.freeze({
    id:'mud-area',name:'Mud area',category:'Terrain',source:'builtin:special',
    description:'Area-drawn mud treatment distinct from worn-grass and path-edge effects.',
    status:'placeholder',implemented:false,allowedTools:['rectangle-filled','ellipse-filled','freeform','fill'],parameters:[],layers:{backdrop:true}
  })
]);

function refreshSpecialBuiltins(){
  specialRemoveSource('builtin:special');
  for(const entry of BUILTIN_SPECIAL_FUNCTIONS)specialEntries.set(entry.id,normaliseSpecial(entry));
  specialNotify();
  return BUILTIN_SPECIAL_FUNCTIONS.length;
}

const specialApi={
  VERSION,
  register:specialRegister,
  remove:specialRemove,
  removeSource:specialRemoveSource,
  get:specialGet,
  list:specialList,
  selected:specialSelected,
  select:specialSelect,
  clearSelection:specialClearSelection,
  refreshBuiltins:refreshSpecialBuiltins,
  BUILTIN_SPECIAL_FUNCTIONS
};
root.IndyHeatSpecialFunctions=specialApi;

/* -------------------------------------------------------------------------
 * Backdrop Special Functions catalogue UI
 * ------------------------------------------------------------------------- */
function syncEditorVersion(){
  if(typeof root.IndyHeatSyncEditorIdentity==='function')root.IndyHeatSyncEditorIdentity();
}

function toolDisplayName(value){
  const map={
    line:'Line',curve:'Curve',freeform:'Free-form',
    'rectangle-filled':'Filled rectangle','ellipse-filled':'Filled ellipse',fill:'Fill'
  };
  return map[value]||value;
}
function injectSpecialUiStyle(){
  if(document.getElementById('indyheatSpecialFunctionStyle'))return;
  const style=document.createElement('style');
  style.id='indyheatSpecialFunctionStyle';
  style.textContent=`
    #backdropSpecialFunctions{margin:7px 0 6px;padding-top:7px;border-top:1px solid #343b46}
    #backdropSpecialFunctionHeader{display:flex;align-items:center;gap:6px;font-size:11px;color:#d7dce5;margin:0 0 3px}
    #backdropSpecialFunctionList{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-content:start;gap:4px;height:154px;min-height:84px;resize:vertical;overflow:auto;padding:2px 4px 7px 2px;box-sizing:border-box;border-bottom:1px solid #343b46}
    #backdropSpecialFunctionList button{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px;align-items:center;min-width:0;padding:5px 6px;text-align:left;font-size:10px}
    #backdropSpecialFunctionList button.selected{border-color:#d6b54a;background:#40391f;box-shadow:inset 0 0 0 1px #8f792f}
    #backdropSpecialFunctionList .specialName{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #backdropSpecialFunctionList .specialBadge{font-size:8px;letter-spacing:.04em;text-transform:uppercase;color:#9fa7b4;border:1px solid #464e5b;border-radius:3px;padding:1px 3px;white-space:nowrap}
    #backdropSpecialFunctionInfo{margin:5px 0 2px;padding:6px 7px;background:#15191f;border:1px solid #303640;border-radius:4px;font-size:10px;line-height:1.35;color:#aab1bd}
    #backdropSpecialFunctionInfo[hidden]{display:none}
    #backdropSpecialFunctionInfo b{color:#e1e5eb}
    #backdropSpecialFunctionInfo .specialForms{margin-top:3px;color:#8f98a6}
    #backdropUndoRow{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:7px 0 8px}
    #backdropUndoRow button{font-size:11px;padding:6px;width:100%}
    #backdropBrushControls{margin:4px 0 7px}
    #backdropPlacementLayers{margin:5px 0 8px;padding:6px 7px;border:1px solid #343b46;border-radius:4px;background:#15191f}
    #backdropPlacementLayers .placementTitle{font-size:10px;color:#aeb5c0;margin:0 0 4px}
    #backdropPlacementLayers .placementChecks{display:grid;grid-template-columns:1fr 1fr;gap:7px}
    #backdropPlacementLayers label{display:flex;align-items:center;gap:5px;margin:0;font-size:10px;color:#c7cdd7}
    #backdropPlacementLayers label.disabled{opacity:.42}
    #backdropFileActions{margin-top:10px;padding-top:8px;border-top:1px solid #343b46}
    #backdropFileActions>label{display:block;margin:0 0 7px}
    #backdropFileButtonGrid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
    #backdropFileButtonGrid button,#backdropFileButtonGrid .backdropFile{font-size:11px;padding:6px;box-sizing:border-box;width:100%;margin:0}
    #backdropBrushControls .backdropCaptureGrid{grid-template-columns:repeat(5,minmax(0,1fr))}
    #backdropMagicCapture.active,#circuitMagicCapture.active,#backdropBrushFreeRotate.active,#circuitBrushFreeRotate.active{border-color:#d6b54a;background:#5a4a1c;box-shadow:inset 0 0 0 1px #d6b54a}
    #circuitFreeBrushTools .miniCaptureGrid{grid-template-columns:repeat(5,minmax(0,1fr))!important}
    #sharedBrushRotationPreview{position:absolute;pointer-events:none;z-index:60;background:transparent}
    .sharedBrushRecolour{margin:4px 0 7px;padding:5px 6px;border:1px solid #343b46;border-radius:4px;background:#15191f}
    .sharedBrushRecolourHeader{display:flex;justify-content:space-between;gap:6px;align-items:center;margin-bottom:4px;font-size:9px;color:#aeb5c0}
    #backdropBrushRecolourDetected{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}
    .sharedBrushRecolourButtons{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:3px}
    .sharedBrushRecolourButtons button{min-width:0;padding:4px 1px;font-size:9px}
  `;
  document.head.appendChild(style);
}
function renderSpecialUi(){
  const host=document.getElementById('backdropSpecialFunctionList'),info=document.getElementById('backdropSpecialFunctionInfo'),count=document.getElementById('backdropSpecialFunctionCount');
  if(!host||!info)return;
  const all=specialList();
  if(count)count.textContent=String(all.length);
  host.innerHTML='';
  for(const entry of all){
    const button=document.createElement('button');
    button.type='button';
    button.dataset.specialFunctionId=entry.id;
    button.classList.toggle('selected',entry.id===selectedSpecialId);
    button.title=entry.description;
    const name=document.createElement('span');name.className='specialName';name.textContent=entry.name;
    const badge=document.createElement('span');badge.className='specialBadge';badge.textContent=entry.category;
    button.append(name,badge);
    button.addEventListener('click',()=>{specialSelect(entry.id);renderSpecialUi();});
    host.appendChild(button);
  }
  const selected=specialSelected();
  if(!selected){
    info.hidden=true;
    info.replaceChildren();
    return;
  }
  const forms=selected.allowedTools.length?selected.allowedTools.map(toolDisplayName).join(' · '):'To be defined';
  info.hidden=false;
  info.innerHTML='';
  const title=document.createElement('div');title.innerHTML=`<b></b> · ${selected.category}`;title.querySelector('b').textContent=selected.name;
  const description=document.createElement('div');description.textContent=selected.description;
  const tools=document.createElement('div');tools.className='specialForms';tools.textContent=`Drawing forms: ${forms}`;
  info.append(title,description,tools);
}
function replaceLabelText(label,text){
  if(!label)return;
  for(const node of label.childNodes){
    if(node.nodeType===Node.TEXT_NODE){node.textContent=text;return;}
  }
  label.insertBefore(document.createTextNode(text),label.firstChild);
}

let placementEntryId=null,pendingPlacement=null;
const multiHistoryBySource=new Map();
const editHistoryBySource=new Map(),redoHistoryBySource=new Map();
let placementListenersInstalled=false,placementHooksInstalled=false;
let arbitraryRotationPatched=false,magicCaptureMode=null,brushEnhancementListenersInstalled=false;
let freeRotateArmed=null,freeRotateGesture=null,freeRotationSyntheticClick=null;
const activeBrushMirror={backdrop:null,minimap:null},activeBrushCatalogueEntry={backdrop:null,minimap:null};
const CIRCUIT_BRUSH_COLOUR_GROUPS=Object.freeze({
  green:Object.freeze([24,25,26,27]),
  grey:Object.freeze([4,5,6,7]),
  blue:Object.freeze([12,13,14,15]),
  yellow:Object.freeze([20,21,22,23]),
  red:Object.freeze([28,29,30,31])
});
const CIRCUIT_BRUSH_COLOUR_LABELS=Object.freeze({
  green:'Green',grey:'Grey',blue:'Blue',yellow:'Yellow',red:'Red'
});

function placementSourceKey(){
  const sel=document.getElementById('trackSelect'),o=sel?.selectedOptions?.[0];
  if(o?.dataset?.indyheatPackageKey)return `package:${o.dataset.indyheatPackageKey}`;
  const retail=o?.dataset?.indyheatRetailIndex;
  return `retail:${retail==null?(o?.value??0):retail}`;
}
function placementTrackIndex(){return Number(document.getElementById('trackSelect')?.value||0);}
function placementBaseId(){return root.IndyHeatTools?.TRACK_BASE_IDS?.[placementTrackIndex()]??null;}
function placementModels(){
  const C=root.IndyHeatRaceSetupCapture,out=[],seen=new Set();
  for(const m of [C?.coreModel,C?.layerModel,C?.model,...(C?.models||[])]){
    if(!m||seen.has(m)||typeof m.getResource!=='function')continue;
    seen.add(m);out.push(m);
  }
  return out;
}
function firstLayerResource(offset){
  const base=placementBaseId();if(base==null)return null;
  for(const model of placementModels()){
    try{const r=model.getResource(base+offset);if(r)return r;}catch(_e){}
  }
  return null;
}
function snapshotLayer(offset){
  const r=firstLayerResource(offset);return r?Uint8Array.from(r.data):null;
}
function syncLayerBytes(offset,bytes){
  if(!bytes)return 0;
  const base=placementBaseId();if(base==null)return 0;
  let n=0;
  for(const model of placementModels()){
    try{
      const r=model.getResource(base+offset);
      if(!r)continue;
      r.data.set(bytes.subarray(0,Math.min(r.data.length,bytes.length)),0);n++;
    }catch(_e){}
  }
  return n;
}
function byteArraysEqual(a,b){
  if(!a||!b||a.length!==b.length)return false;
  for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;
  return true;
}
function currentBackdropSnapshot(){
  const r=firstLayerResource(0),n=root.IndyHeatTrackBackdropTools?.TRACK_BYTES||0xC800;
  return r?Uint8Array.from(r.data.subarray(0,Math.min(n,r.data.length))):null;
}
function placeFixedBackdropEntry(idOrEntry){
  const entry=typeof idOrEntry==='string'?get(idOrEntry):idOrEntry;
  const position=entry?.placement?.position;
  if(!entry||entry.target!=='backdrop'||position?.mode!=='fixed')throw new Error('Brush does not define a fixed Backdrop position.');
  const D=root.IndyHeatTrackBackdropTools;
  if(!D?.decodeTrackPlanar||!D?.encodeTrackPlanar)throw new Error('Backdrop tools are unavailable.');
  const before=currentBackdropSnapshot(),brush=entry.brush;
  if(!before||!brush?.pixels)throw new Error('Backdrop data is unavailable.');
  const pixels=D.decodeTrackPlanar(before);
  const left=position.anchor==='hotspot'?position.x-brush.hotspotX:position.x;
  const top=position.anchor==='hotspot'?position.y-brush.hotspotY:position.y;
  if(left<0||top<0||left+brush.width>320||top+brush.height>256)
    throw new Error(`${entry.name} fixed position lies outside the 320×256 Backdrop.`);
  let changedPixels=0,visiblePixels=0;
  for(let by=0;by<brush.height;by++)for(let bx=0;bx<brush.width;bx++){
    const v=brush.pixels[by*brush.width+bx];
    if(v===brush.transparent)continue;
    visiblePixels++;
    const i=(top+by)*320+(left+bx);
    if(pixels[i]!==v){pixels[i]=v;changedPixels++;}
  }
  if(!changedPixels)return {changed:false,entry,x:left,y:top,visiblePixels,changedPixels:0};
  const encoded=D.encodeTrackPlanar(pixels);
  if(!syncLayerBytes(0,encoded))throw new Error('No active editor model accepted the fixed brush placement.');
  refreshPlacementView();
  return {changed:true,entry,x:left,y:top,visiblePixels,changedPixels};
}
function refreshPlacementView(){
  const sel=document.getElementById('trackSelect');
  if(sel){
    sel.dispatchEvent(new Event('change',{bubbles:true}));
    document.dispatchEvent(new CustomEvent('indyheat-circuit-content-refreshed',{detail:{reason:'multilayer-placement',trackIndex:Number(sel.value||0)}}));
    return;
  }
  try{root.IndyHeatEditorBridge?.refreshSelectedTrack?.();}catch(_e){}
}
function activePlacementEntry(){return placementEntryId?get(placementEntryId):null;}
function placementLayerControls(){
  return {
    foreground:document.getElementById('backdropApplyForeground'),
    surface:document.getElementById('backdropApplySurface')
  };
}
function currentBackdropTool(){
  return document.querySelector('[data-backdrop-draw-tool].active')?.dataset?.backdropDrawTool||'freehand';
}
function syncAllowedPlacementTools(){
  const entry=activePlacementEntry(),allowed=entry?.allowedTools;
  document.querySelectorAll('[data-backdrop-draw-tool]').forEach(button=>{
    button.disabled=!!(allowed&&allowed.length&&!allowed.includes(button.dataset.backdropDrawTool));
  });
}
function syncPlacementUi({resetDefaults=false}={}){
  const entry=activePlacementEntry(),controls=placementLayerControls();
  const fg=entry?.placement?.foreground||null,surface=entry?.placement?.surface||null;
  if(controls.foreground){
    controls.foreground.disabled=!fg;
    controls.foreground.closest('label')?.classList.toggle('disabled',!fg);
    if(resetDefaults||!fg)controls.foreground.checked=!!(fg&&fg.defaultEnabled);
  }
  if(controls.surface){
    controls.surface.disabled=!surface;
    controls.surface.closest('label')?.classList.toggle('disabled',!surface);
    if(resetDefaults||!surface)controls.surface.checked=!!(surface&&surface.defaultEnabled);
    controls.surface.title=surface?`Default surface class: ${surface.class}`:'Selected item has no Surface definition';
  }
  syncAllowedPlacementTools();
}
function selectPlacementEntry(id){
  const entry=get(id);
  if(entry?.placement?.position?.mode==='fixed'){
    placementEntryId=null;pendingPlacement=null;syncPlacementUi({resetDefaults:true});return;
  }
  placementEntryId=entry?.target==='backdrop'?entry.id:null;
  pendingPlacement=null;
  syncPlacementUi({resetDefaults:true});
  if(entry?.preferredTool){
    const button=document.querySelector(`[data-backdrop-draw-tool="${CSS.escape(entry.preferredTool)}"]`);
    if(button&&!button.disabled)button.click();
  }
}
function clearPlacementEntry(){
  placementEntryId=null;pendingPlacement=null;
  syncPlacementUi({resetDefaults:true});
}
function placementEnabled(){
  const entry=activePlacementEntry(),controls=placementLayerControls(),tool=currentBackdropTool();
  if(!entry)return false;
  if(entry.allowedTools?.length&&!entry.allowedTools.includes(tool))return false;
  return !!((entry.placement.foreground&&controls.foreground?.checked)||(entry.placement.surface&&controls.surface?.checked));
}
function clonePlacementBrush(brush){
  return brush?.pixels?{...brush,pixels:Uint8Array.from(brush.pixels)}:null;
}
function uniqueAnchors(points){
  const seen=new Set(),out=[];
  for(const p of points||[]){
    const x=Math.round(Number(p[0])),y=Math.round(Number(p[1])),k=`${x},${y}`;
    if(!Number.isFinite(x)||!Number.isFinite(y)||seen.has(k))continue;
    seen.add(k);out.push([x,y]);
  }
  return out;
}
function appendUniqueAnchors(target,points){
  const seen=new Set((target||[]).map(p=>`${p[0]},${p[1]}`));
  for(const [x,y] of uniqueAnchors(points)){
    const k=`${x},${y}`;if(seen.has(k))continue;
    seen.add(k);target.push([x,y]);
  }
}
function beginOrExtendPending(brush,points,{mode='stamp',anchorX=0,anchorY=0}={}){
  if(typeof document==='undefined'||!placementEnabled())return;
  if(!document.getElementById('layerEditBackdrop')?.classList.contains('active'))return;
  const entry=activePlacementEntry(),beforeBackdrop=currentBackdropSnapshot();
  if(!entry||!brush?.pixels||!beforeBackdrop)return;
  const key=placementSourceKey(),controls=placementLayerControls();
  const mustStart=!pendingPlacement||
    pendingPlacement.sourceKey!==key||
    pendingPlacement.entryId!==entry.id||
    pendingPlacement.mode!==mode||
    !byteArraysEqual(beforeBackdrop,pendingPlacement.beforeBackdrop);
  if(mustStart){
    pendingPlacement={
      sourceKey:key,
      entryId:entry.id,
      mode,
      brush:clonePlacementBrush(brush),
      anchors:[],
      maskPoints:[],
      anchorX:Number(anchorX)||0,
      anchorY:Number(anchorY)||0,
      beforeBackdrop,
      beforeForeground:entry.placement.foreground&&controls.foreground?.checked?snapshotLayer(1):null,
      beforeSurface:entry.placement.surface&&controls.surface?.checked?snapshotLayer(2):null
    };
  }else{
    pendingPlacement.brush=clonePlacementBrush(brush);
    pendingPlacement.anchorX=Number(anchorX)||0;
    pendingPlacement.anchorY=Number(anchorY)||0;
  }
  if(mode==='pattern')appendUniqueAnchors(pendingPlacement.maskPoints,points);
  else appendUniqueAnchors(pendingPlacement.anchors,points);
}
function stampForegroundBytes(bytes,brush,anchors,definition){
  const L=root.IndyHeatLayerTools;if(!L?.setMaskPixel)return bytes;
  const out=Uint8Array.from(bytes),value=definition?.value?1:0;
  for(const [ax,ay] of uniqueAnchors(anchors)){
    for(let by=0;by<brush.height;by++)for(let bx=0;bx<brush.width;bx++){
      const v=brush.pixels[by*brush.width+bx];if(v===brush.transparent)continue;
      const x=ax-brush.hotspotX+bx,y=ay-brush.hotspotY+by;
      if(x<0||y<0||x>=320||y>=256)continue;
      L.setMaskPixel(out,x,y,value,0,320,256);
    }
  }
  return out;
}
function patternForegroundBytes(bytes,brush,maskPoints,anchorX,anchorY,definition){
  const L=root.IndyHeatLayerTools;if(!L?.setMaskPixel)return bytes;
  const out=Uint8Array.from(bytes),value=definition?.value?1:0,mod=(n,m)=>((n%m)+m)%m;
  for(const [x,y] of uniqueAnchors(maskPoints)){
    if(x<0||y<0||x>=320||y>=256)continue;
    const bx=mod(x-anchorX+brush.hotspotX,brush.width),by=mod(y-anchorY+brush.hotspotY,brush.height);
    if(brush.pixels[by*brush.width+bx]===brush.transparent)continue;
    L.setMaskPixel(out,x,y,value,0,320,256);
  }
  return out;
}
function stampSurfaceBytes(bytes,brush,anchors,definition){
  const L=root.IndyHeatLayerTools;if(!L?.setSurfaceCell)return bytes;
  const out=Uint8Array.from(bytes),offset=Math.max(0,out.length-0x1180),value=Number(definition?.class)||0,cells=new Set();
  for(const [ax,ay] of uniqueAnchors(anchors)){
    for(let by=0;by<brush.height;by++)for(let bx=0;bx<brush.width;bx++){
      const v=brush.pixels[by*brush.width+bx];if(v===brush.transparent)continue;
      const px=ax-brush.hotspotX+bx,py=ay-brush.hotspotY+by;
      if(px<0||py<0||px>=320||py>=224)continue;
      cells.add(`${px>>1},${py>>1}`);
    }
  }
  for(const key of cells){
    const [x,y]=key.split(',').map(Number);L.setSurfaceCell(out,x,y,value,offset,160,112);
  }
  return out;
}
function patternSurfaceBytes(bytes,brush,maskPoints,anchorX,anchorY,definition){
  const L=root.IndyHeatLayerTools;if(!L?.setSurfaceCell)return bytes;
  const out=Uint8Array.from(bytes),offset=Math.max(0,out.length-0x1180),value=Number(definition?.class)||0,mod=(n,m)=>((n%m)+m)%m,cells=new Set();
  for(const [x,y] of uniqueAnchors(maskPoints)){
    if(x<0||y<0||x>=320||y>=224)continue;
    const bx=mod(x-anchorX+brush.hotspotX,brush.width),by=mod(y-anchorY+brush.hotspotY,brush.height);
    if(brush.pixels[by*brush.width+bx]===brush.transparent)continue;
    cells.add(`${x>>1},${y>>1}`);
  }
  for(const key of cells){
    const [x,y]=key.split(',').map(Number);L.setSurfaceCell(out,x,y,value,offset,160,112);
  }
  return out;
}
function historyFor(map,key=placementSourceKey()){
  if(!map.has(key))map.set(key,[]);
  return map.get(key);
}
function editHistory(){return historyFor(editHistoryBySource);}
function redoHistory(){return historyFor(redoHistoryBySource);}
function cloneLayerSnapshot(bytes){return bytes?Uint8Array.from(bytes):null;}
function syncHistoryUi(){
  const undo=document.getElementById('backdropPaintUndo');
  const redo=document.getElementById('backdropPaintRedo');
  if(undo)undo.disabled=!editHistory().length;
  if(redo)redo.disabled=!redoHistory().length;
}
function pushEditRecord(record){
  if(!record)return null;
  const key=record.sourceKey||placementSourceKey(),stack=historyFor(editHistoryBySource,key);
  stack.push(record);if(stack.length>30)stack.shift();
  historyFor(redoHistoryBySource,key).length=0;
  syncHistoryUi();
  return record;
}
function makeEditRecord(beforeBackdrop,afterBackdrop){
  if(!beforeBackdrop||!afterBackdrop||byteArraysEqual(beforeBackdrop,afterBackdrop))return null;
  const beforeForeground=snapshotLayer(1),beforeSurface=snapshotLayer(2);
  return {
    sourceKey:placementSourceKey(),
    beforeBackdrop:Uint8Array.from(beforeBackdrop),
    afterBackdrop:Uint8Array.from(afterBackdrop),
    beforeForeground:cloneLayerSnapshot(beforeForeground),
    afterForeground:cloneLayerSnapshot(beforeForeground),
    beforeSurface:cloneLayerSnapshot(beforeSurface),
    afterSurface:cloneLayerSnapshot(beforeSurface)
  };
}
function finalisePendingPlacement(p,encodedBackdrop){
  if(!p||p.sourceKey!==placementSourceKey())return;
  const afterBackdrop=currentBackdropSnapshot();
  if(!afterBackdrop||!byteArraysEqual(afterBackdrop,encodedBackdrop))return;
  const entry=get(p.entryId);if(!entry)return;
  const controls=placementLayerControls();
  let foregroundAfter=null,surfaceAfter=null,changed=false,fgChanged=false,surfaceChanged=false;
  if(p.beforeForeground&&entry.placement.foreground&&controls.foreground?.checked){
    foregroundAfter=p.mode==='pattern'
      ?patternForegroundBytes(p.beforeForeground,p.brush,p.maskPoints,p.anchorX,p.anchorY,entry.placement.foreground)
      :stampForegroundBytes(p.beforeForeground,p.brush,p.anchors,entry.placement.foreground);
    if(!byteArraysEqual(foregroundAfter,p.beforeForeground)){
      if(syncLayerBytes(1,foregroundAfter)){changed=true;fgChanged=true;}
    }
  }
  if(p.beforeSurface&&entry.placement.surface&&controls.surface?.checked){
    surfaceAfter=p.mode==='pattern'
      ?patternSurfaceBytes(p.beforeSurface,p.brush,p.maskPoints,p.anchorX,p.anchorY,entry.placement.surface)
      :stampSurfaceBytes(p.beforeSurface,p.brush,p.anchors,entry.placement.surface);
    if(!byteArraysEqual(surfaceAfter,p.beforeSurface)){
      if(syncLayerBytes(2,surfaceAfter)){changed=true;surfaceChanged=true;}
    }
  }
  if(p.historyRecord){
    if(foregroundAfter)p.historyRecord.afterForeground=Uint8Array.from(foregroundAfter);
    if(surfaceAfter)p.historyRecord.afterSurface=Uint8Array.from(surfaceAfter);
  }
  if(!changed)return;
  queueMicrotask(()=>{
    refreshPlacementView();
    syncHistoryUi();
    const state=document.getElementById('backdropPaintState');
    if(state){
      const layers=[fgChanged?'Foreground':null,surfaceChanged?'Surface':null].filter(Boolean).join(' + ');
      state.textContent=`${state.textContent||'Placement committed.'} · ${layers} applied.`;
    }
  });
}
function installPlacementCommitHooks(){
  if(placementHooksInstalled)return true;
  const B=root.IndyHeatBrushTools,D=root.IndyHeatTrackBackdropTools;
  if(!B||!D||typeof B.stampOpaqueRasterBrushPoints!=='function'||typeof D.encodeTrackPlanar!=='function')return false;
  placementHooksInstalled=true;

  const stamp=B.stampOpaqueRasterBrushPoints.bind(B);
  B.stampOpaqueRasterBrushPoints=function(pixels,width,height,brush,points,...rest){
    const result=stamp(pixels,width,height,brush,points,...rest);
    if(width===320&&height===256)beginOrExtendPending(brush,points,{mode:'stamp'});
    return result;
  };

  const pattern=B.patternFillOpaqueRasterBrush.bind(B);
  B.patternFillOpaqueRasterBrush=function(pixels,width,height,brush,points,anchorX,anchorY,...rest){
    const result=pattern(pixels,width,height,brush,points,anchorX,anchorY,...rest);
    if(width===320&&height===256)beginOrExtendPending(brush,points,{mode:'pattern',anchorX,anchorY});
    return result;
  };

  const encode=D.encodeTrackPlanar.bind(D);
  D.encodeTrackPlanar=function(pixels,...rest){
    const before=currentBackdropSnapshot(),encoded=encode(pixels,...rest),pending=pendingPlacement;
    let historyRecord=null;
    const backdropActive=!!document.getElementById('layerEditBackdrop')?.classList.contains('active');
    if(backdropActive&&before&&!byteArraysEqual(before,encoded)){
      historyRecord=pushEditRecord(makeEditRecord(before,encoded));
    }
    if(pending&&byteArraysEqual(before,pending.beforeBackdrop)){
      pendingPlacement=null;
      if(historyRecord)pending.historyRecord=historyRecord;
      queueMicrotask(()=>finalisePendingPlacement(pending,encoded));
    }
    return encoded;
  };
  return true;
}
function restoreEditRecord(record,toAfter){
  if(!record)return false;
  const targetBackdrop=toAfter?record.afterBackdrop:record.beforeBackdrop;
  const targetForeground=toAfter?record.afterForeground:record.beforeForeground;
  const targetSurface=toAfter?record.afterSurface:record.beforeSurface;
  if(!syncLayerBytes(0,targetBackdrop))return false;
  if(targetForeground)syncLayerBytes(1,targetForeground);
  if(targetSurface)syncLayerBytes(2,targetSurface);
  return true;
}
function undoEdit(e){
  e?.preventDefault?.();e?.stopImmediatePropagation?.();
  const stack=editHistory(),record=stack[stack.length-1];
  if(!record){syncHistoryUi();return;}
  const current=currentBackdropSnapshot();
  if(!byteArraysEqual(current,record.afterBackdrop)){syncHistoryUi();return;}
  stack.pop();
  if(!restoreEditRecord(record,false)){stack.push(record);syncHistoryUi();return;}
  const redo=redoHistory();redo.push(record);if(redo.length>30)redo.shift();
  pendingPlacement=null;
  refreshPlacementView();syncHistoryUi();
  const state=document.getElementById('backdropPaintState');
  if(state)state.textContent='Backdrop edit undone.';
}
function redoEdit(e){
  e?.preventDefault?.();e?.stopImmediatePropagation?.();
  const redo=redoHistory(),record=redo[redo.length-1];
  if(!record){syncHistoryUi();return;}
  const current=currentBackdropSnapshot();
  if(!byteArraysEqual(current,record.beforeBackdrop)){syncHistoryUi();return;}
  redo.pop();
  if(!restoreEditRecord(record,true)){redo.push(record);syncHistoryUi();return;}
  const stack=editHistory();stack.push(record);if(stack.length>30)stack.shift();
  pendingPlacement=null;
  refreshPlacementView();syncHistoryUi();
  const state=document.getElementById('backdropPaintState');
  if(state)state.textContent='Backdrop edit redone.';
}
function captureExternalBackdropChange(){
  const before=currentBackdropSnapshot();
  if(!before)return;
  const beforeForeground=snapshotLayer(1),beforeSurface=snapshotLayer(2),sourceKey=placementSourceKey();
  queueMicrotask(()=>{
    if(sourceKey!==placementSourceKey())return;
    const after=currentBackdropSnapshot();
    if(!after||byteArraysEqual(before,after))return;
    const record={
      sourceKey,
      beforeBackdrop:Uint8Array.from(before),
      afterBackdrop:Uint8Array.from(after),
      beforeForeground:cloneLayerSnapshot(beforeForeground),
      afterForeground:cloneLayerSnapshot(snapshotLayer(1)),
      beforeSurface:cloneLayerSnapshot(beforeSurface),
      afterSurface:cloneLayerSnapshot(snapshotLayer(2))
    };
    pushEditRecord(record);
  });
}
const placementApi=Object.freeze({
  select:selectPlacementEntry,
  clear:clearPlacementEntry,
  activeEntry:activePlacementEntry,
  syncUi:syncPlacementUi,
  cancelPending:()=>{pendingPlacement=null;}
});
root.IndyHeatMultiLayerPlacement=placementApi;

function installPlacementListeners(){
  if(placementListenersInstalled)return true;
  const list=document.getElementById('backdropBrushLibraryList');
  if(!list||!installPlacementCommitHooks())return false;
  placementListenersInstalled=true;

  list.addEventListener('click',e=>{
    const button=e.target.closest?.('[data-backdrop-library-id]');
    if(!button)return;
    const entry=get(button.dataset.backdropLibraryId);
    if(entry?.placement?.position?.mode==='fixed'){
      clearPlacementEntry();
      let result=null,error=null;
      try{result=placeFixedBackdropEntry(entry);}catch(err){error=err;}
      // backdrop-brush-ui has already selected the library brush on the button's
      // own click handler. Clear it immediately: fixed brushes have no movable
      // cursor and no second placement click.
      document.getElementById('backdropBrushClear')?.click();
      const state=document.getElementById('backdropPaintState');
      if(state){
        if(error){state.textContent=`ERROR: ${error.message}`;state.classList.add('bad');}
        else{
          state.classList.remove('bad');
          state.textContent=result?.changed
            ?`${entry.name} placed at fixed position X ${result.x}, Y ${result.y} · ${result.changedPixels} pixels changed.`
            :`${entry.name} already matches its fixed position X ${result?.x}, Y ${result?.y}.`;
        }
      }
      return;
    }
    selectPlacementEntry(button.dataset.backdropLibraryId);
  });
  document.getElementById('backdropBrushClear')?.addEventListener('click',clearPlacementEntry);
  document.getElementById('backdropBrushLoad')?.addEventListener('click',clearPlacementEntry);
  document.querySelectorAll('[data-backdrop-brush-capture]').forEach(button=>button.addEventListener('click',clearPlacementEntry));
  document.querySelectorAll('[data-backdrop-draw-tool]').forEach(button=>button.addEventListener('click',()=>{pendingPlacement=null;syncHistoryUi();}));
  document.getElementById('backdropPaintUndo')?.addEventListener('click',undoEdit,true);
  document.getElementById('backdropPaintRedo')?.addEventListener('click',redoEdit,true);
  document.getElementById('backdropPaintRestore')?.addEventListener('click',()=>{pendingPlacement=null;captureExternalBackdropChange();},true);
  document.addEventListener('pointercancel',()=>{pendingPlacement=null;},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')pendingPlacement=null;},true);
  document.addEventListener('indyheat-circuit-content-refreshed',()=>{pendingPlacement=null;setTimeout(syncHistoryUi,0);});
  document.getElementById('trackSelect')?.addEventListener('change',()=>{pendingPlacement=null;setTimeout(syncHistoryUi,0);});
  syncHistoryUi();
  return true;
}

/* circuit-package.js v0.32 can repeatedly try to insert its Race HUD controls
   before a nested .raceSetupGrid. Provide a temporary direct-child anchor so
   that its existing insertBefore() succeeds without changing Race HUD behaviour. */
let raceHudAnchorTimer=null;
function installRaceHudInsertAnchorFix(){
  if(typeof document==='undefined')return false;
  const pane=document.getElementById('raceSetupPane');
  if(!pane)return false;
  if(document.getElementById('circuitRaceHudControls')){
    document.getElementById('indyheatRaceHudInsertAnchor')?.remove();
    return true;
  }
  const grid=pane.querySelector('.raceSetupGrid');
  if(!grid||grid.parentNode===pane)return true;
  let direct=grid;
  while(direct.parentNode&&direct.parentNode!==pane)direct=direct.parentNode;
  if(direct.parentNode!==pane)return false;
  let anchor=document.getElementById('indyheatRaceHudInsertAnchor');
  if(!anchor){
    anchor=document.createElement('span');
    anchor.id='indyheatRaceHudInsertAnchor';
    anchor.className='raceSetupGrid';
    anchor.hidden=true;
    pane.insertBefore(anchor,direct);
  }
  if(raceHudAnchorTimer==null){
    let tries=0;
    raceHudAnchorTimer=setInterval(()=>{
      tries++;
      if(document.getElementById('circuitRaceHudControls')||tries>240){
        document.getElementById('indyheatRaceHudInsertAnchor')?.remove();
        clearInterval(raceHudAnchorTimer);raceHudAnchorTimer=null;
      }
    },25);
  }
  return true;
}


function circuitBrushPaletteWords(){
  const words=root.IndyHeatTools?.VERIFIED_TRACK_PALETTE_WORDS;
  if(words?.length>=32)return Array.from(words).slice(0,32);
  return [
    0x888,0x000,0xFDC,0xFFF,0x333,0x666,0x999,0xCCC,
    0x954,0xF81,0xFA6,0xFFA,0x449,0x77B,0x66C,0x88F,
    0xAAF,0xCCF,0xF99,0xFCA,0xC74,0xCB2,0xC90,0xDD0,
    0x080,0x1B0,0x6D0,0x9F0,0x900,0xC00,0xB33,0xF00
  ];
}
function circuitBrushShadeLuminance(index){
  const w=circuitBrushPaletteWords()[Number(index)]??0;
  const r=(w>>>8)&15,g=(w>>>4)&15,b=w&15;
  return .2126*r+.7152*g+.0722*b;
}
function circuitBrushShadeOrder(groupName){
  const indices=CIRCUIT_BRUSH_COLOUR_GROUPS[groupName];
  if(!indices)throw new Error(`Unknown circuit brush colour group ${groupName}.`);
  return [...indices].sort((a,b)=>{
    const d=circuitBrushShadeLuminance(a)-circuitBrushShadeLuminance(b);
    return d||a-b;
  });
}
function analyseCircuitBrushColours(brush){
  if(!brush?.pixels)throw new Error('No active brush is available.');
  const counts={green:0,grey:0,blue:0,yellow:0,red:0};
  const membership=new Map();
  for(const [name,indices] of Object.entries(CIRCUIT_BRUSH_COLOUR_GROUPS))
    for(const index of indices)membership.set(index,name);
  for(const v of brush.pixels){
    if(v===brush.transparent)continue;
    const group=membership.get(Number(v));
    if(group)counts[group]++;
  }
  const ranked=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const top=ranked[0]||[null,0],second=ranked[1]||[null,0];
  const dominant=top[1]>0&&top[1]>second[1]?top[0]:null;
  const tied=top[1]>0&&top[1]===second[1];
  return {
    counts:Object.freeze({...counts}),
    dominant,
    dominantCount:top[1]||0,
    tied,
    shadeOrders:Object.freeze(Object.fromEntries(
      Object.keys(CIRCUIT_BRUSH_COLOUR_GROUPS).map(name=>[name,Object.freeze(circuitBrushShadeOrder(name))])
    ))
  };
}
function recolourCircuitBrush(brush,targetGroup){
  targetGroup=String(targetGroup||'').toLowerCase();
  if(!CIRCUIT_BRUSH_COLOUR_GROUPS[targetGroup])throw new Error(`Unknown recolour target ${targetGroup}.`);
  const analysis=analyseCircuitBrushColours(brush);
  if(analysis.tied)throw new Error('Brush has no unique dominant recolourable colour family.');
  if(!analysis.dominant)throw new Error('Brush does not contain a dominant green/grey/blue/yellow/red circuit-palette family.');
  const sourceGroup=analysis.dominant;
  if(sourceGroup===targetGroup)return {brush:cloneBrush(brush),analysis,sourceGroup,targetGroup,changed:0};
  const sourceOrder=analysis.shadeOrders[sourceGroup],targetOrder=analysis.shadeOrders[targetGroup];
  const mapping=new Map(sourceOrder.map((index,rank)=>[index,targetOrder[rank]]));
  const pixels=Uint8Array.from(brush.pixels);let changed=0;
  for(let i=0;i<pixels.length;i++){
    const replacement=mapping.get(Number(pixels[i]));
    if(replacement==null)continue;
    if(pixels[i]!==replacement){pixels[i]=replacement;changed++;}
  }
  const result={...brush,pixels};
  let visible=0;for(const v of pixels)if(v!==result.transparent)visible++;
  result.visiblePixels=visible;
  return {brush:result,analysis,sourceGroup,targetGroup,changed};
}
function activateTemporaryTransformedBrush(mode,brush,name='Transformed brush'){
  const target=mode==='minimap'?'minimap':'backdrop',source=`session:brush-transform:${target}`,id=`session:brush-transform:${target}`;
  removeSource(source);
  register({id,name,target,source,tags:['session','brush-transform'],allowedTools:null,actions:[],brush});
  // register()/removeSource() deliberately do not broadcast by themselves.
  // Temporary brushes must notify so the owning editor rebuilds its library
  // before we locate/click the hand-off button, then removes the transient row.
  notify();
  const selector=mode==='minimap'
    ?`#circuitBrushLibraryList [data-brush-library-id="${id}"]`
    :`#backdropBrushLibraryList [data-backdrop-library-id="${id}"]`;
  const button=document.querySelector(selector);
  if(!button){removeSource(source);notify();throw new Error('Transformed brush could not be activated.');}
  button.click();rememberActiveBrush(brush,mode);
  queueMicrotask(()=>{removeSource(source);notify();});
}
function circuitRecolourStatus(){
  const host=document.getElementById('backdropBrushRecolourDetected');
  const brush=activeBrushMirror.backdrop,entry=activeBrushCatalogueEntry.backdrop;
  if(!host)return;
  const buttons=document.querySelectorAll('#backdropBrushRecolour [data-brush-recolour]');
  if(entry?.recolourable===false){host.textContent='Disabled by Brush Manager';buttons.forEach(b=>b.disabled=true);return;}
  buttons.forEach(b=>b.disabled=false);
  if(!brush){host.textContent='Detected: —';return;}
  try{
    const a=analyseCircuitBrushColours(brush);
    host.textContent=a.dominant
      ?`Detected: ${CIRCUIT_BRUSH_COLOUR_LABELS[a.dominant]} (${a.dominantCount}px)`
      :a.tied?'Detected: ambiguous':'Detected: none';
  }catch(_e){host.textContent='Detected: —';}
}
function applyCircuitBrushRecolour(targetGroup){
  const brush=activeBrushMirror.backdrop;
  if(!brush){setBrushState('backdrop','Select, capture or load a custom brush before recolouring.',true);return false;}
  try{
    const result=recolourCircuitBrush(brush,targetGroup);
    const from=CIRCUIT_BRUSH_COLOUR_LABELS[result.sourceGroup],to=CIRCUIT_BRUSH_COLOUR_LABELS[result.targetGroup];
    if(!result.changed){
      setBrushState('backdrop',`${from} is already the dominant brush colour family; no recolour was needed.`);
      circuitRecolourStatus();return true;
    }
    activateTemporaryTransformedBrush('backdrop',result.brush,`${to} recolour`);
    setBrushState('backdrop',`Recoloured ${result.changed} brush pixels · ${from} → ${to}. Other colour families were left unchanged.`);
    circuitRecolourStatus();
    return true;
  }catch(err){
    setBrushState('backdrop',`ERROR: ${err.message}`,true);circuitRecolourStatus();return false;
  }
}
function installCircuitBrushRecolourUi(){
  const transforms=document.getElementById('backdropBrushTransforms');
  if(!transforms)return false;
  let host=document.getElementById('backdropBrushRecolour');
  if(!host){
    host=document.createElement('div');host.id='backdropBrushRecolour';host.className='sharedBrushRecolour';
    host.innerHTML=`<div class="sharedBrushRecolourHeader"><span>Circuit palette recolour</span><span id="backdropBrushRecolourDetected">Detected: —</span></div><div class="sharedBrushRecolourButtons"></div>`;
    const buttons=host.querySelector('.sharedBrushRecolourButtons');
    for(const group of ['green','grey','blue','yellow','red']){
      const button=document.createElement('button');button.type='button';button.dataset.brushRecolour=group;button.textContent=CIRCUIT_BRUSH_COLOUR_LABELS[group];
      button.title=`Recolour the brush's dominant circuit-palette family to ${CIRCUIT_BRUSH_COLOUR_LABELS[group]}; other colour families remain unchanged`;
      button.addEventListener('click',()=>applyCircuitBrushRecolour(group));
      buttons.appendChild(button);
    }
    transforms.insertAdjacentElement('afterend',host);
  }
  circuitRecolourStatus();
  return true;
}

/* Public recolour API for Brush Manager and future catalogue consumers.
   Attach only after these constants/functions are initialised; this ordering
   also avoids the v0.96 startup temporal-dead-zone regression. */
api.circuitColourGroups=CIRCUIT_BRUSH_COLOUR_GROUPS;
api.analyseCircuitRecolour=analyseCircuitBrushColours;
api.recolourCircuitBrush=recolourCircuitBrush;

function rememberActiveBrush(brush,target=null,entry=null){
  if(!brush?.pixels)return null;
  const mode=target==='minimap'||target==='backdrop'?target:activeBrushMode();
  if(!mode)return null;
  activeBrushMirror[mode]=cloneBrush(brush);activeBrushCatalogueEntry[mode]=entry||null;
  if(mode==='backdrop')queueMicrotask(circuitRecolourStatus);
  return activeBrushMirror[mode];
}
function rotateRasterBrushArbitrary(brush,rotation){
  if(!brush?.pixels||brush.pixels.length!==brush.width*brush.height)throw new Error('Captured brush is invalid.');
  const w=Number(brush.width),h=Number(brush.height),hx=Number(brush.hotspotX),hy=Number(brush.hotspotY),transparent=Number(brush.transparent);
  const angle=((Number(rotation)||0)%360+360)%360,rad=angle*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);
  const rotatePoint=(x,y)=>({x:c*x-s*y,y:s*x+c*y});
  const corners=[
    rotatePoint(-hx,-hy),
    rotatePoint((w-1)-hx,-hy),
    rotatePoint(-hx,(h-1)-hy),
    rotatePoint((w-1)-hx,(h-1)-hy)
  ];
  const minX=Math.floor(Math.min(...corners.map(p=>p.x))),maxX=Math.ceil(Math.max(...corners.map(p=>p.x)));
  const minY=Math.floor(Math.min(...corners.map(p=>p.y))),maxY=Math.ceil(Math.max(...corners.map(p=>p.y)));
  const nw=maxX-minX+1,nh=maxY-minY+1;
  if(nw<1||nh<1||nw>1024||nh>1024)throw new Error('Rotated brush dimensions are outside the supported range.');
  const out=new Uint8Array(nw*nh);out.fill(transparent);
  for(let oy=0;oy<nh;oy++)for(let ox=0;ox<nw;ox++){
    const rx=ox+minX,ry=oy+minY;
    const sx=Math.round(c*rx+s*ry+hx),sy=Math.round(-s*rx+c*ry+hy);
    if(sx<0||sy<0||sx>=w||sy>=h)continue;
    out[oy*nw+ox]=brush.pixels[sy*w+sx];
  }
  let visible=0;for(const v of out)if(v!==transparent)visible++;
  if(!visible)throw new Error('Rotation produced an empty brush.');
  return {...brush,width:nw,height:nh,hotspotX:-minX,hotspotY:-minY,pixels:out,visiblePixels:visible};
}
function installArbitraryRotationSupport(){
  if(arbitraryRotationPatched)return true;
  const B=root.IndyHeatBrushTools;
  if(!B||typeof B.transformRasterBrush!=='function')return false;
  const baseTransform=B.transformRasterBrush.bind(B);
  const baseCapture=typeof B.captureRasterBrush==='function'?B.captureRasterBrush.bind(B):null;
  const baseDecode=typeof B.decodeBrushFile==='function'?B.decodeBrushFile.bind(B):null;
  B.transformRasterBrush=function(brush,options={}){
    const rotation=Number(options?.rotation)||0,normalised=((rotation%360)+360)%360;
    let result;
    if([0,90,180,270].includes(normalised))result=baseTransform(brush,options);
    else{
      result=rotateRasterBrushArbitrary(brush,rotation);
      if(options?.flipH||options?.flipV)result=baseTransform(result,{rotation:0,flipH:!!options.flipH,flipV:!!options.flipV});
    }
    rememberActiveBrush(result);
    return result;
  };
  if(baseCapture)B.captureRasterBrush=function(...args){
    const result=baseCapture(...args);rememberActiveBrush(result);return result;
  };
  if(baseDecode)B.decodeBrushFile=function(...args){
    const result=baseDecode(...args);rememberActiveBrush(result);return result;
  };
  arbitraryRotationPatched=true;
  return true;
}
function backdropBrushModeActive(){
  const pane=document.getElementById('backdropEditorPane');
  return !!(document.getElementById('layerEditBackdrop')?.classList.contains('active')&&pane&&!pane.hidden);
}
function minimapBrushModeActive(){
  const pane=document.getElementById('circuitPreviewControls');
  return !!(document.getElementById('layerEditMini')?.classList.contains('active')&&pane&&!pane.hidden);
}
function activeBrushMode(){
  if(backdropBrushModeActive())return 'backdrop';
  if(minimapBrushModeActive())return 'minimap';
  return null;
}
function brushStateElement(mode){
  return document.getElementById(mode==='minimap'?'circuitFreeBrushState':'backdropPaintState');
}
function setBrushState(mode,message,bad=false){
  const state=brushStateElement(mode);if(!state)return;
  state.textContent=String(message||'');state.classList.toggle('bad',!!bad);
}
function brushTransparencyIndexForMode(mode,decoded=null){
  const id=mode==='minimap'?'circuitPreviewTransparentValue':'backdropTransparentValue';
  const n=Number(document.getElementById(id)?.textContent);
  if(Number.isInteger(n)&&n>=0&&n<=255)return n;
  if(Number.isInteger(decoded?.transparent))return Number(decoded.transparent);
  return 0;
}
function sharedPrimaryModel(){
  const C=root.IndyHeatRaceSetupCapture;
  return C?.model||C?.layerModel||C?.coreModel||(C?.models||[])[0]||null;
}
function sharedRecordsFor(model){
  const C=root.IndyHeatRaceSetupCapture,T=root.IndyHeatTools;if(!model||!T)return [];
  let records=C?.recordsByMain?.get(model.main)||null;
  if(!records){records=T.parseRaceRecords(model.main);C?.recordsByMain?.set(model.main,records);}
  for(const r of records)if(r.baseResourceId==null&&typeof T.raceBaseResourceId==='function')r.baseResourceId=T.raceBaseResourceId(r,model.resourceTableOffset+0x1000);
  return records;
}
function sharedMiniPreview(){
  const P=root.IndyHeatCircuitPackage,T=root.IndyHeatTools,model=sharedPrimaryModel();
  if(!P||!T||!model)return null;
  const base=T.TRACK_BASE_IDS?.[Number(document.getElementById('trackSelect')?.value||0)];
  const record=sharedRecordsFor(model).find(r=>r.baseResourceId===base)||null;
  if(!record)return null;
  try{return P.resolvePreviewResource(model,record);}catch(_e){return null;}
}
function miniLayout(canvas){
  const P=root.IndyHeatCircuitPackage;if(!canvas||!P)return null;
  const w=Number(P.PREVIEW_WIDTH||78),h=Number(P.PREVIEW_HEIGHT||51);
  const scale=Math.max(1,Math.floor(Math.min((canvas.width-32)/w,(canvas.height-72)/h)));
  const drawW=w*scale,drawH=h*scale;
  return {x:Math.round((canvas.width-drawW)/2),y:Math.round((canvas.height-drawH)/2+16),scale,w,h,drawW,drawH};
}
function magicContextFromEvent(mode,e){
  if(mode==='backdrop'){
    if(e.target?.id!=='view')return null;
    const D=root.IndyHeatTrackBackdropTools,before=currentBackdropSnapshot();
    if(!D?.decodeTrackPlanar||!before)throw new Error('Backdrop data is unavailable.');
    const r=e.target.getBoundingClientRect();
    return {
      mode,canvas:e.target,W:320,H:256,pixels:D.decodeTrackPlanar(before),
      transparent:brushTransparencyIndexForMode(mode),paletteSize:32,
      x:(e.clientX-r.left)*320/r.width,y:(e.clientY-r.top)*256/r.height
    };
  }
  if(mode==='minimap'){
    if(e.target?.id!=='circuitAuxCanvas')return null;
    const P=root.IndyHeatCircuitPackage,q=sharedMiniPreview();
    if(!P||!q)throw new Error('MiniMap data is unavailable.');
    const decoded=P.decodePreviewBob(q.resource.data),layout=miniLayout(e.target),r=e.target.getBoundingClientRect();
    const cx=(e.clientX-r.left)*e.target.width/r.width,cy=(e.clientY-r.top)*e.target.height/r.height;
    const x=(cx-layout.x)/layout.scale,y=(cy-layout.y)/layout.scale;
    if(x<0||y<0||x>=layout.w||y>=layout.h)throw new Error('Click inside the MiniMap image.');
    return {
      mode,canvas:e.target,W:layout.w,H:layout.h,pixels:decoded.pixels,
      transparent:brushTransparencyIndexForMode(mode,decoded),
      paletteSize:Number(P.PRESENTATION_PALETTE_RGB?.length||32),x,y
    };
  }
  return null;
}
function captureConnectedBrush(context){
  const {pixels,W,H,transparent}=context;
  let x=Math.max(0,Math.min(W-1,Math.floor(Number(context.x)||0)));
  let y=Math.max(0,Math.min(H-1,Math.floor(Number(context.y)||0)));
  const start=y*W+x;
  if(pixels[start]===transparent)throw new Error(`Magic picker clicked the transparent index (${transparent}); click inside the object.`);
  const seen=new Uint8Array(W*H),stack=[start],component=[];
  seen[start]=1;let minX=x,maxX=x,minY=y,maxY=y;
  const neighbours=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
  while(stack.length){
    const i=stack.pop(),px=i%W,py=(i/W)|0;component.push(i);
    if(px<minX)minX=px;if(px>maxX)maxX=px;if(py<minY)minY=py;if(py>maxY)maxY=py;
    for(const [dx,dy] of neighbours){
      const nx=px+dx,ny=py+dy;if(nx<0||ny<0||nx>=W||ny>=H)continue;
      const ni=ny*W+nx;if(seen[ni]||pixels[ni]===transparent)continue;
      seen[ni]=1;stack.push(ni);
    }
  }
  const width=maxX-minX+1,height=maxY-minY+1,out=new Uint8Array(width*height);out.fill(transparent);
  for(const i of component){const px=i%W,py=(i/W)|0;out[(py-minY)*width+(px-minX)]=pixels[i];}
  return {
    key:'magic-capture',name:'Magic capture',width,height,
    hotspotX:x-minX,hotspotY:y-minY,transparent,paletteSize:context.paletteSize||32,
    pixels:out,visiblePixels:component.length
  };
}
function activateTemporaryBrush(mode,brush){
  const target=mode==='minimap'?'minimap':'backdrop',source=`session:magic-capture:${target}`,id=`session:magic-capture:${target}`;
  removeSource(source);
  register({id,name:'Magic capture',target,source,tags:['session','magic-capture'],allowedTools:null,actions:[],brush});
  // The brush-list adapters listen for this event; without it the temporary
  // entry exists in the registry but has no DOM button to activate.
  notify();
  const selector=mode==='minimap'
    ?`#circuitBrushLibraryList [data-brush-library-id="${id}"]`
    :`#backdropBrushLibraryList [data-backdrop-library-id="${id}"]`;
  const button=document.querySelector(selector);
  if(!button){removeSource(source);notify();throw new Error('Magic brush could not be activated.');}
  button.click();rememberActiveBrush(brush,mode);
  queueMicrotask(()=>{removeSource(source);notify();});
}
function magicButton(mode){
  return document.getElementById(mode==='minimap'?'circuitMagicCapture':'backdropMagicCapture');
}
function setMagicCaptureArmed(mode,on){
  magicCaptureMode=on&&((mode==='backdrop'&&backdropBrushModeActive())||(mode==='minimap'&&minimapBrushModeActive()))?mode:null;
  for(const m of ['backdrop','minimap'])magicButton(m)?.classList.toggle('active',magicCaptureMode===m);
  if(magicCaptureMode){
    cancelFreeRotation();
    setBrushState(mode,'Magic picker armed · click a non-transparent pixel inside the object to capture its connected shape.');
  }
}
function magicCapturePointerDown(e){
  if(!magicCaptureMode||e.button!==0)return;
  const mode=magicCaptureMode,expected=mode==='minimap'?'circuitAuxCanvas':'view';
  if(e.target?.id!==expected)return;
  e.preventDefault();e.stopImmediatePropagation();
  try{
    const context=magicContextFromEvent(mode,e),brush=captureConnectedBrush(context);
    activateTemporaryBrush(mode,brush);setMagicCaptureArmed(mode,false);
    setBrushState(mode,`Magic brush captured · ${brush.width}×${brush.height} · ${brush.visiblePixels} visible px · hotspot ${brush.hotspotX},${brush.hotspotY}.`);
  }catch(err){
    setMagicCaptureArmed(mode,false);setBrushState(mode,`ERROR: ${err.message}`,true);
  }
}
function rotationButton(mode){
  return document.getElementById(mode==='minimap'?'circuitBrushFreeRotate':'backdropBrushFreeRotate');
}
function rotationCanvas(mode){
  return document.getElementById(mode==='minimap'?'circuitAuxCanvas':'view');
}
function removeRotationPreview(){
  document.getElementById('sharedBrushRotationPreview')?.remove();
}
function rotationPalette(mode){
  if(mode==='minimap')return root.IndyHeatCircuitPackage?.PRESENTATION_PALETTE_RGB||[];
  const T=root.IndyHeatTools,D=root.IndyHeatTrackBackdropTools;
  return D?.gamePaletteRgb?D.gamePaletteRgb(T?.VERIFIED_TRACK_PALETTE_WORDS||[]):[];
}
function ensureRotationPreview(target){
  let c=document.getElementById('sharedBrushRotationPreview');
  if(!c){c=document.createElement('canvas');c.id='sharedBrushRotationPreview';target.parentElement?.appendChild(c);}
  c.width=target.width;c.height=target.height;
  c.style.left=`${target.offsetLeft}px`;c.style.top=`${target.offsetTop}px`;
  c.style.width=`${target.offsetWidth}px`;c.style.height=`${target.offsetHeight}px`;
  return c;
}
function logicalRotationAnchor(mode,e,target){
  const r=target.getBoundingClientRect();
  if(mode==='backdrop')return {x:(e.clientX-r.left)*320/r.width,y:(e.clientY-r.top)*256/r.height,inside:true};
  const layout=miniLayout(target),cx=(e.clientX-r.left)*target.width/r.width,cy=(e.clientY-r.top)*target.height/r.height;
  const x=(cx-layout.x)/layout.scale,y=(cy-layout.y)/layout.scale;
  return {x,y,inside:x>=0&&y>=0&&x<layout.w&&y<layout.h};
}
function drawRotationPreview(g){
  if(!g?.baseBrush||!g.target)return;
  const c=ensureRotationPreview(g.target),ctx=c.getContext('2d'),brush=rotateRasterBrushArbitrary(g.baseBrush,g.angle||0),palette=rotationPalette(g.mode);
  ctx.clearRect(0,0,c.width,c.height);ctx.save();ctx.globalAlpha=.78;
  let ox=0,oy=0,sx=1,sy=1,maxW=320,maxH=256;
  if(g.mode==='backdrop'){
    sx=c.width/320;sy=c.height/256;
  }else{
    const l=miniLayout(g.target);ox=l.x;oy=l.y;sx=sy=l.scale;maxW=l.w;maxH=l.h;
    ctx.beginPath();ctx.rect(l.x,l.y,l.drawW,l.drawH);ctx.clip();
  }
  for(let by=0;by<brush.height;by++)for(let bx=0;bx<brush.width;bx++){
    const v=brush.pixels[by*brush.width+bx];if(v===brush.transparent)continue;
    const x=Math.floor(g.anchor.x)-brush.hotspotX+bx,y=Math.floor(g.anchor.y)-brush.hotspotY+by;
    if(x<0||y<0||x>=maxW||y>=maxH)continue;
    const rgb=palette[v]||[255,0,255];ctx.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    ctx.fillRect(ox+x*sx,oy+y*sy,Math.max(1,sx),Math.max(1,sy));
  }
  ctx.restore();
}
function freeRotationAngle(e,g){
  const dx=e.clientX-g.startX,dy=e.clientY-g.startY,dist=Math.hypot(dx,dy);
  if(dist<5)return {angle:0,moved:false};
  return {angle:Math.round(Math.atan2(dy,dx)*180/Math.PI),moved:true};
}
function setRotationButtonArmed(mode,on){
  const b=rotationButton(mode);if(b)b.classList.toggle('active',!!on);
}
function cancelFreeRotation(message=null){
  if(freeRotateArmed)setRotationButtonArmed(freeRotateArmed.mode,false);
  if(freeRotateGesture)setRotationButtonArmed(freeRotateGesture.mode,false);
  freeRotateArmed=null;freeRotateGesture=null;removeRotationPreview();
  if(message){const mode=activeBrushMode();if(mode)setBrushState(mode,message);}
}
function armFreeRotation(mode,button){
  const brush=activeBrushMirror[mode];
  if(!brush){setBrushState(mode,'Select, capture or load a custom brush before using Free rotation.',true);return;}
  if(freeRotateArmed?.button===button){cancelFreeRotation('Free rotation cancelled.');return;}
  setMagicCaptureArmed(mode,false);cancelFreeRotation();
  freeRotateArmed={mode,button,baseBrush:cloneBrush(brush)};
  setRotationButtonArmed(mode,true);
  setBrushState(mode,'Free rotation armed · click and hold on the main display, drag to rotate the visible brush, then release to accept.');
}
function freeRotatePointerDown(e){
  if(!freeRotateArmed||e.button!==0)return;
  const a=freeRotateArmed,target=rotationCanvas(a.mode);
  if(!target||e.target!==target)return;
  const anchor=logicalRotationAnchor(a.mode,e,target);
  if(!anchor?.inside){setBrushState(a.mode,'Click inside the editable image to begin Free rotation.',true);return;}
  e.preventDefault();e.stopImmediatePropagation();
  freeRotateGesture={mode:a.mode,button:a.button,baseBrush:cloneBrush(a.baseBrush),pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,anchor,target,angle:0,moved:false};
  freeRotateArmed=null;
  try{target.setPointerCapture?.(e.pointerId);}catch(_e){}
  drawRotationPreview(freeRotateGesture);
  setBrushState(freeRotateGesture.mode,'Free rotation · keep holding and move the pointer; release to accept.');
}
function updateFreeRotateGesture(e){
  const g=freeRotateGesture;if(!g||g.pointerId!==e.pointerId)return;
  e.preventDefault();e.stopImmediatePropagation();
  const q=freeRotationAngle(e,g);g.angle=q.angle;g.moved=q.moved;drawRotationPreview(g);
  setBrushState(g.mode,`Free rotation preview: ${q.angle}° · release to accept.`);
}
function finishFreeRotateGesture(e,cancel=false){
  const g=freeRotateGesture;if(!g||g.pointerId!==e.pointerId)return;
  e.preventDefault?.();e.stopImmediatePropagation?.();
  try{g.target?.releasePointerCapture?.(e.pointerId);}catch(_e){}
  freeRotateGesture=null;removeRotationPreview();setRotationButtonArmed(g.mode,false);
  if(cancel||!g.moved){setBrushState(g.mode,cancel?'Free rotation cancelled.':'Free rotation unchanged.');return;}
  const button=g.button,angle=g.angle;
  if(!button)return;
  if(g.mode==='minimap')button.dataset.customBrushRotate=String(angle);
  else button.dataset.backdropBrushRotate=String(angle);
  freeRotationSyntheticClick=button;button.click();
  if(g.mode==='minimap')button.dataset.customBrushRotate='0';
  else button.dataset.backdropBrushRotate='0';
}
function configureMagicButton(mode,capture){
  if(!capture)return;
  const id=mode==='minimap'?'circuitMagicCapture':'backdropMagicCapture';
  if(!document.getElementById(id)){
    const button=document.createElement('button');button.id=id;button.type='button';button.textContent='✦';
    button.title='Magic picker · click inside an object; surrounding transparent-index pixels determine the captured edge';
    button.setAttribute('aria-label','Magic brush picker');
    button.addEventListener('click',e=>{
      e.preventDefault();e.stopImmediatePropagation();
      if(mode==='backdrop')clearPlacementEntry();
      setMagicCaptureArmed(mode,magicCaptureMode!==mode);
    },true);
    capture.appendChild(button);
  }
  capture.style.gridTemplateColumns='repeat(5,minmax(0,1fr))';
}
function configureRotationButtons(mode,transforms,selector){
  if(!transforms)return;
  const rotateButtons=[...transforms.querySelectorAll(selector)];
  if(rotateButtons.length<3)return;
  const [cw,ccw,free]=rotateButtons;
  const attr=mode==='minimap'?'customBrushRotate':'backdropBrushRotate';
  cw.dataset[attr]='90';cw.textContent='↻';cw.title='Rotate brush 90° clockwise';
  ccw.dataset[attr]='270';ccw.textContent='↺';ccw.title='Rotate brush 90° anti-clockwise';
  free.id=mode==='minimap'?'circuitBrushFreeRotate':'backdropBrushFreeRotate';
  free.dataset[attr]='0';free.textContent='⟳';
  free.title='Free rotation · click this button, then click-hold and drag on the main display; release to accept';
  if(!free.dataset.sharedFreeRotateHook){
    free.dataset.sharedFreeRotateHook='1';
    free.addEventListener('click',e=>{
      if(freeRotationSyntheticClick===free){freeRotationSyntheticClick=null;return;}
      e.preventDefault();e.stopImmediatePropagation();armFreeRotation(mode,free);
    },true);
  }
}

function configureSharedBrushUi(){
  const backdropCapture=document.querySelector('#backdropBrushControls .backdropCaptureGrid')||document.querySelector('#backdropPaintTools .backdropCaptureGrid');
  configureMagicButton('backdrop',backdropCapture);
  configureRotationButtons('backdrop',document.getElementById('backdropBrushTransforms'),'[data-backdrop-brush-rotate]');

  const miniCapture=document.querySelector('#circuitFreeBrushTools .miniCaptureGrid');
  configureMagicButton('minimap',miniCapture);
  configureRotationButtons('minimap',document.getElementById('circuitCustomBrushTransforms'),'[data-custom-brush-rotate]');

  const miniHeader=document.getElementById('circuitBrushLibraryHeader');
  if(miniHeader)miniHeader.querySelector('.muted')?.remove();

  // Recolour groups 4–7 / 12–15 / 20–23 / 24–27 / 28–31 are specific
  // to the 320×256 circuit palette. MiniMap uses the separate presentation
  // palette, so this profile intentionally appears only in Backdrop.
  installCircuitBrushRecolourUi();
}
function installBackdropReturnGuard(){
  if(document.body?.dataset.backdropReturnGuard)return;
  document.body.dataset.backdropReturnGuard='1';
  document.addEventListener('click',e=>{
    const button=e.target?.closest?.('#layerModeButtons button');if(!button)return;
    if(button.id!=='layerEditBackdrop')return;
    const restore=()=>{
      const pane=document.getElementById('backdropEditorPane'),mode=document.getElementById('layerEditBackdrop');
      const authoritative=root.IndyHeatEditorCurrentMode==='layerEditBackdrop'||document.getElementById('layerModeButtons')?.dataset?.currentMode==='layerEditBackdrop';
      if(!pane||(!mode?.classList.contains('active')&&!authoritative))return;
      pane.hidden=false;pane.style.display='';
      const drawing=document.getElementById('layerDrawingPane'),wp=document.getElementById('layerWaypointHost');
      if(drawing)drawing.hidden=true;if(wp)wp.hidden=true;
    };
    setTimeout(restore,0);setTimeout(restore,40);
  },true);
}
function installBrushEnhancementListeners(){
  if(brushEnhancementListenersInstalled)return;
  brushEnhancementListenersInstalled=true;
  document.addEventListener('pointerdown',e=>{magicCapturePointerDown(e);freeRotatePointerDown(e);},true);
  document.addEventListener('pointermove',e=>{if(freeRotateGesture)updateFreeRotateGesture(e);},true);
  document.addEventListener('pointerup',e=>{if(freeRotateGesture)finishFreeRotateGesture(e,false);},true);
  document.addEventListener('pointercancel',e=>{if(freeRotateGesture)finishFreeRotateGesture(e,true);},true);
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    if(magicCaptureMode){e.preventDefault();const mode=magicCaptureMode;setMagicCaptureArmed(mode,false);setBrushState(mode,'Magic picker cancelled.');}
    if(freeRotateArmed||freeRotateGesture){e.preventDefault();cancelFreeRotation('Free rotation cancelled.');}
  },true);
  document.addEventListener('click',e=>{
    const target=e.target;
    if(target?.matches?.('[data-backdrop-brush-capture],[data-brush-capture],[data-backdrop-draw-tool],[data-mini-draw-tool],#backdropBrushLoad,#circuitFreeBrushLoad')){
      if(magicCaptureMode)setMagicCaptureArmed(magicCaptureMode,false);
      if(freeRotateArmed)cancelFreeRotation();
    }
    if(target?.matches?.('#backdropBrushClear')){activeBrushMirror.backdrop=null;activeBrushCatalogueEntry.backdrop=null;cancelFreeRotation();queueMicrotask(circuitRecolourStatus);}
    if(target?.matches?.('#circuitCustomBrushClear')){activeBrushMirror.minimap=null;activeBrushCatalogueEntry.minimap=null;cancelFreeRotation();}
  },true);
  document.getElementById('trackSelect')?.addEventListener('change',()=>{
    if(magicCaptureMode)setMagicCaptureArmed(magicCaptureMode,false);
    cancelFreeRotation();
  });
  installBackdropReturnGuard();
}

function tidyBackdropUi(){
  if(typeof document==='undefined')return false;
  const pane=document.getElementById('backdropEditorPane'),paintTools=document.getElementById('backdropPaintTools');
  if(!pane||!paintTools)return false;
  configureSharedBrushUi();

  document.querySelectorAll('#backdropBrushLibraryList [data-backdrop-library-id]').forEach(button=>{
    const entry=get(button.dataset.backdropLibraryId),position=entry?.placement?.position;
    if(position?.mode!=='fixed')return;
    button.dataset.fixedPlacement='1';
    button.title=`${entry.name} · fixed Backdrop position X ${position.x}, Y ${position.y} · click to place`;
  });

  const brushHeader=document.getElementById('backdropBrushLibraryHeader');
  if(brushHeader)brushHeader.querySelector('.muted')?.remove();

  /* Keep every current/captured-brush control together immediately after the
     palette and before the pre-made Brushes catalogue. */
  let brushControls=document.getElementById('backdropBrushControls');
  if(!brushControls){
    brushControls=document.createElement('div');
    brushControls.id='backdropBrushControls';
  }
  const capture=paintTools.querySelector('.backdropCaptureGrid');
  const sizeRow=document.getElementById('backdropBrushSizeRow');
  const dims=document.getElementById('backdropBrushDims');
  const saveLoad=document.getElementById('backdropBrushSave')?.closest('.raceSetupActions');
  const loadInput=document.getElementById('backdropBrushLoadInput');
  const transforms=document.getElementById('backdropBrushTransforms');
  for(const node of [capture,sizeRow,dims,saveLoad,loadInput,transforms]){
    if(node&&node.parentElement!==brushControls)brushControls.appendChild(node);
  }
  const paletteSource=document.getElementById('backdropPaletteSource');
  const brushTitle=brushHeader?.previousElementSibling?.classList?.contains('toolGroupTitle')?brushHeader.previousElementSibling:null;
  if(paletteSource&&brushControls.parentElement!==paintTools)paletteSource.insertAdjacentElement('afterend',brushControls);
  else if(brushTitle&&brushControls.nextElementSibling!==brushTitle)brushTitle.parentNode.insertBefore(brushControls,brushTitle);

  let placementLayers=document.getElementById('backdropPlacementLayers');
  if(!placementLayers){
    placementLayers=document.createElement('div');
    placementLayers.id='backdropPlacementLayers';
    placementLayers.innerHTML=`<div class="placementTitle">Placement layers</div><div class="placementChecks"><label><input id="backdropApplyForeground" type="checkbox"> Apply foreground</label><label><input id="backdropApplySurface" type="checkbox"> Apply surface</label></div>`;
  }
  if(brushControls.nextElementSibling!==placementLayers)brushControls.insertAdjacentElement('afterend',placementLayers);
  syncPlacementUi();

  /* Undo / Redo are intentionally fixed top-level actions. */
  const topGroup=pane.querySelector(':scope > .toolGroup')||pane.firstElementChild||pane;
  let undoRow=document.getElementById('backdropUndoRow');
  if(!undoRow){
    undoRow=document.createElement('div');
    undoRow.id='backdropUndoRow';
  }
  const undo=document.getElementById('backdropPaintUndo');
  let redo=document.getElementById('backdropPaintRedo');
  if(!redo){
    redo=document.createElement('button');
    redo.id='backdropPaintRedo';
    redo.type='button';
    redo.textContent='Redo';
    redo.disabled=true;
  }
  if(undo&&undo.parentElement!==undoRow)undoRow.appendChild(undo);
  if(redo.parentElement!==undoRow)undoRow.appendChild(redo);
  const topTitle=topGroup.querySelector(':scope > .toolGroupTitle');
  if(topTitle&&undoRow.parentElement!==topGroup)topTitle.insertAdjacentElement('afterend',undoRow);
  else if(topTitle&&undoRow.previousElementSibling!==topTitle)topTitle.insertAdjacentElement('afterend',undoRow);
  syncHistoryUi();

  /* File/import actions live together at the bottom. */
  let fileActions=document.getElementById('backdropFileActions');
  if(!fileActions){
    fileActions=document.createElement('div');
    fileActions.id='backdropFileActions';
    fileActions.innerHTML='<div id="backdropFileButtonGrid"></div>';
  }
  let fileGrid=document.getElementById('backdropFileButtonGrid');
  if(!fileGrid){
    fileGrid=document.createElement('div');
    fileGrid.id='backdropFileButtonGrid';
    fileActions.appendChild(fileGrid);
  }

  const remap=document.getElementById('backdropRemap')?.closest('label');
  const importLabel=document.getElementById('backdropIffInput')?.closest('label');
  const restore=document.getElementById('backdropPaintRestore');
  const exportBin=document.getElementById('backdropExport');
  const exportIff=document.getElementById('backdropExportIff');

  if(remap&&remap.parentElement!==fileActions)fileActions.insertBefore(remap,fileGrid);
  if(importLabel){
    replaceLabelText(importLabel,'Import IFF backdrop');
    if(importLabel.parentElement!==fileGrid)fileGrid.appendChild(importLabel);
  }
  if(restore&&restore.parentElement!==fileGrid)fileGrid.appendChild(restore);
  if(exportBin){
    exportBin.textContent='Export backdrop .bin';
    exportBin.style.gridColumn='auto';
    if(exportBin.parentElement!==fileGrid)fileGrid.appendChild(exportBin);
  }
  if(exportIff){
    exportIff.textContent='Export backdrop IFF';
    exportIff.style.gridColumn='auto';
    if(exportIff.parentElement!==fileGrid)fileGrid.appendChild(exportIff);
  }

  const status=document.getElementById('backdropStatus');
  if(status){
    if(fileActions.parentElement!==status.parentElement)status.insertAdjacentElement('beforebegin',fileActions);
    else if(fileActions.nextElementSibling!==status)status.insertAdjacentElement('beforebegin',fileActions);
  }else if(fileActions.parentElement!==topGroup)topGroup.appendChild(fileActions);

  const oldPaintActions=document.getElementById('backdropPaintActions');
  if(oldPaintActions&&!oldPaintActions.children.length)oldPaintActions.remove();

  installPlacementListeners();
  return true;
}
function scheduleBackdropTidy(){
  tidyBackdropUi();
  for(const delay of [50,150,400,900,1600])setTimeout(tidyBackdropUi,delay);
}
function installSpecialUi(){
  if(typeof document==='undefined')return false;
  const paintTools=document.getElementById('backdropPaintTools'),brushList=document.getElementById('backdropBrushLibraryList');
  if(!paintTools||!brushList)return false;
  injectSpecialUiStyle();
  if(!document.getElementById('backdropSpecialFunctions')){
    const section=document.createElement('div');section.id='backdropSpecialFunctions';
    section.innerHTML=`
      <div id="backdropSpecialFunctionHeader">
        <span>Special Functions (<span id="backdropSpecialFunctionCount">0</span>)</span>
      </div>
      <div id="backdropSpecialFunctionList" aria-label="Backdrop Special Functions"></div>
      <div id="backdropSpecialFunctionInfo" hidden></div>`;
    brushList.insertAdjacentElement('afterend',section);
  }
  renderSpecialUi();
  scheduleBackdropTidy();
  return true;
}
function bootSpecialUi(){
  syncEditorVersion();
  refreshSpecialBuiltins();
  installBrushEnhancementListeners();
  configureSharedBrushUi();
  let uiTries=0;
  const uiTimer=setInterval(()=>{
    configureSharedBrushUi();
    const ready=!!(document.getElementById('backdropBrushTransforms')&&document.getElementById('circuitCustomBrushTransforms')&&document.getElementById('backdropMagicCapture')&&document.getElementById('circuitMagicCapture'));
    if(ready||++uiTries>240)clearInterval(uiTimer);
  },50);
  if(installSpecialUi())return;
  let tries=0;
  const timer=setInterval(()=>{if(installSpecialUi()||++tries>240)clearInterval(timer);},50);
}
if(typeof root.addEventListener==='function'){
  root.addEventListener('indyheat-special-functions-changed',renderSpecialUi);
  root.addEventListener('indyheat-special-function-selection-changed',renderSpecialUi);
  root.addEventListener('indyheat-brush-library-changed',()=>{
    if(placementEntryId&&!get(placementEntryId))clearPlacementEntry();
    scheduleBackdropTidy();
    queueMicrotask(configureSharedBrushUi);
  });
}

if(typeof module!=='undefined'&&module.exports)module.exports=api;
/* Install BrushTools wrappers now, before backdrop-brush-ui.js loads and
   destructures the shared functions. */
installBrushMetadataFormatSupport();
installArbitraryRotationSupport();
installPlacementCommitHooks();
if(typeof document!=='undefined'){
  let raceHudGuardTries=0;
  const raceHudGuard=setInterval(()=>{
    raceHudGuardTries++;
    if(document.getElementById('circuitRaceHudControls')||raceHudGuardTries>240){
      clearInterval(raceHudGuard);
      document.getElementById('indyheatRaceHudInsertAnchor')?.remove();
      return;
    }
    installRaceHudInsertAnchorFix();
  },10);
  const raceHudObserver=typeof MutationObserver!=='undefined'?new MutationObserver(()=>{
    installRaceHudInsertAnchorFix();
    if(document.getElementById('circuitRaceHudControls'))raceHudObserver.disconnect();
  }):null;
  raceHudObserver?.observe(document.documentElement,{childList:true,subtree:true});
  installRaceHudInsertAnchorFix();
  const boot=()=>{syncEditorVersion();refreshBuiltins();loadCompanionModule('brush-manager.js','IndyHeatBrushManager');loadCompanionModule('foreground-auto.js','IndyHeatForegroundAuto');refreshFolderBrushes();installRaceHudInsertAnchorFix();bootSpecialUi();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});else setTimeout(boot,0);
}
})(typeof globalThis!=='undefined'?globalThis:this);
