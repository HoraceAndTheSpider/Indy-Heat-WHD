(function(root){
'use strict';

/* Shared brush catalogue — v0.77.
 *
 * Catalogue metadata is intentionally separate from IHBR v1. A brush can be
 * tagged for a drawing surface (MiniMap, Backdrop, or future editor targets),
 * assigned a source, and gain optional actions/tool restrictions without
 * changing the compact brush file format itself.
 */
const VERSION='0.77';
const entries=new Map();

function clonePixels(pixels){return pixels instanceof Uint8Array?pixels.slice():Uint8Array.from(pixels||[]);}
function cloneBrush(brush){
  if(!brush?.pixels||!Number.isInteger(Number(brush.width))||!Number.isInteger(Number(brush.height)))throw new Error('Brush catalogue entry has invalid raster data.');
  const out={...brush,pixels:clonePixels(brush.pixels)};
  let visible=0;for(const v of out.pixels)if(Number(v)!==Number(out.transparent))visible++;
  out.visiblePixels=visible;return out;
}
function normaliseTarget(value){const s=String(value||'').trim().toLowerCase();if(!s)throw new Error('Brush target is required.');return s;}
function register(entry){
  const id=String(entry?.id||entry?.key||'').trim();if(!id)throw new Error('Brush catalogue ID is required.');
  const target=normaliseTarget(entry.target),source=String(entry.source||'session').trim()||'session';
  const brush=cloneBrush(entry.brush||entry);
  const item=Object.freeze({
    id,name:String(entry.name||brush.name||id),target,source,
    tags:Object.freeze(Array.from(entry.tags||[]).map(String)),
    allowedTools:entry.allowedTools==null?null:Object.freeze(Array.from(entry.allowedTools).map(String)),
    actions:Object.freeze(Array.from(entry.actions||[])),
    brush:Object.freeze({...brush,pixels:brush.pixels})
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
function materialise(idOrEntry){const entry=typeof idOrEntry==='string'?get(idOrEntry):idOrEntry;if(!entry)return null;return cloneBrush(entry.brush);}
function notify(){if(typeof root.dispatchEvent==='function'&&typeof CustomEvent!=='undefined')root.dispatchEvent(new CustomEvent('indyheat-brush-library-changed'));}

function refreshBuiltins(){
  const P=root.IndyHeatCircuitPackage,templates=P?.MINIMAP_TEMPLATES;if(!Array.isArray(templates))return 0;
  removeSource('builtin:minimap');
  for(const t of templates)register({
    id:`builtin:minimap:${t.key}`,name:t.name,target:'minimap',source:'builtin:minimap',tags:['builtin'],
    // Reserved for future Brush Manager rules/bespoke actions. No restrictions
    // are applied yet: a pre-made brush behaves exactly like any custom brush.
    allowedTools:null,actions:[],
    brush:{key:t.key,name:t.name,width:t.width,height:t.height,hotspotX:t.hotspotX,hotspotY:t.hotspotY,transparent:t.transparent,paletteSize:P.PRESENTATION_PALETTE_RGB?.length||32,pixels:clonePixels(t.pixels)}
  });
  notify();return templates.length;
}

const api={VERSION,register,remove,removeSource,get,list,materialise,refreshBuiltins};
root.IndyHeatBrushLibrary=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof document!=='undefined'){
  const boot=()=>refreshBuiltins();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});else setTimeout(boot,0);
}
})(typeof globalThis!=='undefined'?globalThis:this);
