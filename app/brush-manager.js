(function(root){
'use strict';

/*
 * Indy Heat Brush Manager — v0.101.
 *
 * Dedicated UI/controller for the shared brush catalogue. Raster/file-format,
 * folder discovery and placement semantics remain owned by brush-library.js.
 */
const VERSION='0.101';
const Library=root.IndyHeatBrushLibrary;
const B=root.IndyHeatBrushTools;
if(!Library||!B)return;

let selectedId=null,installed=false;

function paletteFor(entry){
  if(entry?.target==='minimap'&&Array.isArray(root.IndyHeatCircuitPackage?.PRESENTATION_PALETTE_RGB))
    return root.IndyHeatCircuitPackage.PRESENTATION_PALETTE_RGB;
  const words=root.IndyHeatTools?.VERIFIED_TRACK_PALETTE_WORDS;
  if(words&&root.IndyHeatTrackBackdropTools?.gamePaletteRgb)
    return root.IndyHeatTrackBackdropTools.gamePaletteRgb(words);
  return Array.from({length:256},(_,i)=>[i,i,i]);
}
function drawPreview(entry){
  const canvas=document.getElementById('brushManagerPreview');if(!canvas)return;
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);if(!entry?.brush?.pixels)return;
  const b=entry.brush,palette=paletteFor(entry),scale=Math.max(1,Math.floor(Math.min((canvas.width-12)/b.width,(canvas.height-12)/b.height)));
  const ox=Math.floor((canvas.width-b.width*scale)/2),oy=Math.floor((canvas.height-b.height*scale)/2);ctx.imageSmoothingEnabled=false;
  for(let y=0;y<b.height;y++)for(let x=0;x<b.width;x++){
    const v=b.pixels[y*b.width+x];if(v===b.transparent)continue;
    const rgb=palette[v]||[255,0,255];ctx.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;ctx.fillRect(ox+x*scale,oy+y*scale,scale,scale);
  }
}
function toolChecks(){return [...document.querySelectorAll('#brushManagerAllowedTools input[type=checkbox][data-tool]')];}
function syncToolDisable(){
  const any=document.getElementById('brushManagerAnyTools')?.checked;
  for(const box of toolChecks())box.disabled=!!any;
}
function fillForm(entry){
  const set=(id,value)=>{const e=document.getElementById(id);if(e)e.value=value??'';};
  const check=(id,value)=>{const e=document.getElementById(id);if(e)e.checked=!!value;};
  const panel=document.getElementById('brushManagerEditor');if(panel)panel.hidden=!entry;
  if(!entry){drawPreview(null);return;}
  set('brushManagerName',entry.name);set('brushManagerId',entry.id);set('brushManagerCategory',entry.category);set('brushManagerTarget',entry.target);
  set('brushManagerPreferred',entry.preferredTool||'');set('brushManagerTags',[...entry.tags].join(', '));check('brushManagerRecolourable',entry.recolourable===true);
  check('brushManagerAnyTools',entry.allowedTools==null);for(const box of toolChecks())box.checked=!!entry.allowedTools?.includes(box.dataset.tool);
  const fg=entry.placement.foreground,sf=entry.placement.surface,pos=entry.placement.position;
  check('brushManagerForeground',!!fg);check('brushManagerForegroundDefault',!!fg?.defaultEnabled);set('brushManagerForegroundValue',fg?.value??0);
  check('brushManagerSurface',!!sf);check('brushManagerSurfaceDefault',!!sf?.defaultEnabled);set('brushManagerSurfaceClass',sf?.class??0);
  check('brushManagerFixed',!!pos);set('brushManagerFixedX',pos?.x??0);set('brushManagerFixedY',pos?.y??0);set('brushManagerFixedAnchor',pos?.anchor||'top-left');check('brushManagerSingle',pos?.singleInstance!==false);
  const source=document.getElementById('brushManagerSource');
  if(source)source.textContent=`${entry.fileName||entry.name} · ${entry.source}${entry.sourcePath?` · ${entry.sourcePath}`:''} · ${entry.brush.width}×${entry.brush.height} · IHBR v${entry.brush.fileVersion||'runtime'}`;
  syncToolDisable();drawPreview(entry);
}
function render(){
  if(typeof document==='undefined')return;
  const listEl=document.getElementById('brushManagerList'),status=document.getElementById('brushManagerScanStatus');if(!listEl)return;
  const items=Library.list().slice().sort((a,b)=>a.category.localeCompare(b.category)||a.name.localeCompare(b.name));
  listEl.innerHTML='';
  for(const entry of items){
    const button=document.createElement('button');button.type='button';button.className='brushManagerListItem';button.dataset.brushManagerId=entry.id;
    button.classList.toggle('active',entry.id===selectedId);
    const title=document.createElement('span');title.textContent=entry.name;
    const meta=document.createElement('small');meta.textContent=`${entry.category} · ${entry.target} · ${entry.fileName?'IHBR':'runtime'}`;
    button.append(title,meta);button.addEventListener('click',()=>{selectedId=entry.id;render();});listEl.appendChild(button);
  }
  if(status)status.textContent=Library.brushFolderStatus?.().lastMessage||'';
  let selected=selectedId?Library.get(selectedId):null;if(!selected&&items.length){selected=items[0];selectedId=selected.id;}
  for(const b of listEl.querySelectorAll('.brushManagerListItem'))b.classList.toggle('active',b.dataset.brushManagerId===selectedId);
  fillForm(selected);
}
function metadataFromForm(entry){
  const value=id=>document.getElementById(id)?.value;
  const checked=id=>!!document.getElementById(id)?.checked;
  const base=Library.entryMetadata(entry),allowed=checked('brushManagerAnyTools')?null:toolChecks().filter(b=>b.checked).map(b=>b.dataset.tool);
  const placement={...(base.placement||{})};
  if(checked('brushManagerForeground'))placement.foreground={...(entry.placement.foreground||{}),mode:'brush-mask',value:Number(value('brushManagerForegroundValue'))?1:0,defaultEnabled:checked('brushManagerForegroundDefault')};
  else delete placement.foreground;
  if(checked('brushManagerSurface'))placement.surface={...(entry.placement.surface||{}),mode:'brush-footprint',class:Math.max(0,Math.min(3,Number(value('brushManagerSurfaceClass'))||0)),defaultEnabled:checked('brushManagerSurfaceDefault')};
  else delete placement.surface;
  if(checked('brushManagerFixed'))placement.position={mode:'fixed',x:Math.round(Number(value('brushManagerFixedX'))||0),y:Math.round(Number(value('brushManagerFixedY'))||0),anchor:value('brushManagerFixedAnchor')||'top-left',singleInstance:checked('brushManagerSingle')};
  else delete placement.position;
  const actions=[...(base.actions||[])].filter(a=>a!=='place-fixed');if(placement.position)actions.push('place-fixed');
  return {
    ...base,id:String(value('brushManagerId')||entry.id).trim(),name:String(value('brushManagerName')||entry.name).trim(),
    category:String(value('brushManagerCategory')||'Other').trim()||'Other',target:value('brushManagerTarget')||'backdrop',
    tags:String(value('brushManagerTags')||'').split(',').map(s=>s.trim()).filter(Boolean),allowedTools:allowed,
    preferredTool:value('brushManagerPreferred')||null,recolourable:checked('brushManagerRecolourable'),actions,
    placement:Object.keys(placement).length?placement:undefined
  };
}
function applyMetadata(){
  const entry=Library.get(selectedId);if(!entry)return null;
  const updated=Library.updateEntryMetadata(entry.id,metadataFromForm(entry));selectedId=updated.id;render();return updated;
}
function downloadBytes(bytes,filename){
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function exportEntry(){
  try{
    const entry=applyMetadata();if(!entry)return;
    const out=Library.encodeEntryFile(entry);downloadBytes(out.bytes,out.filename);
    setStatus(`Exported ${out.filename} as IHBR v${B.BRUSH_VERSION} with embedded metadata.`);
  }catch(err){setStatus(`ERROR: ${err.message}`,true);}
}
async function writeEntry(){
  try{
    const entry=applyMetadata();if(!entry)return;
    const filename=await Library.writeEntryToLocalFolder(entry);setStatus(`Saved ${filename} directly to the selected local brushes folder.`);
  }catch(err){setStatus(`ERROR: ${err.message}`,true);}
}
function setStatus(message,bad=false){
  const el=document.getElementById('brushManagerScanStatus');if(el){el.textContent=String(message||'');el.classList.toggle('bad',!!bad);}
}
async function scanLocal(){
  const result=await Library.scanLocalBrushFolder();
  if(result===-1){
    const input=document.getElementById('brushManagerFolderInput');if(input){input.value='';input.click();}
  }
}
function setMode(on){
  document.body.classList.toggle('brushManagerMode',!!on);if(on)document.body.classList.remove('playlistMode');
  const manager=document.getElementById('brushManagerWorkspace'),button=document.getElementById('showBrushManager');
  if(manager)manager.hidden=!on;
  if(button){button.classList.toggle('active',!!on);button.setAttribute('aria-pressed',String(!!on));}
  if(on){
    for(const id of ['showCircuitEditor','showPlaylistEditor']){
      const b=document.getElementById(id);b?.classList.remove('active');b?.setAttribute('aria-pressed','false');
    }
    render();
  }
}
function install(){
  if(installed||typeof document==='undefined')return installed;
  const nav=document.getElementById('editorModeSwitch');if(!nav)return false;
  installed=true;
  const style=document.createElement('style');style.id='brushManagerStyle';style.textContent=`
    body.brushManagerMode #dropZone,body.brushManagerMode main,body.brushManagerMode #circuitFileActions,body.brushManagerMode #playlistWorkspace{display:none!important}
    body:not(.brushManagerMode) #brushManagerWorkspace{display:none!important}
    #brushManagerWorkspace{max-width:1180px;margin:18px auto;padding:0 18px 28px;box-sizing:border-box}
    .brushManagerCard{background:#181b21;border:1px solid #30343d;border-radius:8px;padding:14px}
    .brushManagerToolbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:10px}.brushManagerToolbar .spacer{flex:1}
    #brushManagerScanStatus{font-size:11px;color:#9fa7b4;min-width:220px}#brushManagerScanStatus.bad{color:#ff7f7f!important}
    .brushManagerGrid{display:grid;grid-template-columns:300px minmax(0,1fr);gap:12px}
    #brushManagerList{display:grid;gap:4px;max-height:680px;overflow:auto}.brushManagerListItem{text-align:left;padding:7px}.brushManagerListItem span,.brushManagerListItem small{display:block}.brushManagerListItem small{font-size:9px;color:#929aa7;margin-top:2px}.brushManagerListItem.active{border-color:#d6b54a;background:#332c19}
    #brushManagerEditor{display:grid;grid-template-columns:160px minmax(0,1fr);gap:7px 10px;align-items:center}.brushManagerWide{grid-column:1/-1}
    #brushManagerEditor input[type=text],#brushManagerEditor input[type=number],#brushManagerEditor select{width:100%;box-sizing:border-box;background:#222730;color:#fff;border:1px solid #495162;border-radius:4px;padding:6px}
    #brushManagerPreview{width:100%;height:150px;background:#101217;border:1px solid #30343d;image-rendering:pixelated}
    #brushManagerAllowedTools{display:flex;gap:8px;flex-wrap:wrap;font-size:11px}.brushManagerInline{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.brushManagerInline input[type=number]{width:80px!important}
    #brushManagerSource{font-size:10px;color:#9fa7b4;overflow-wrap:anywhere}
    @media(max-width:780px){.brushManagerGrid{grid-template-columns:1fr}#brushManagerEditor{grid-template-columns:1fr}}
  `;document.head.appendChild(style);
  const button=document.createElement('button');button.id='showBrushManager';button.type='button';button.textContent='Brush Manager';button.setAttribute('aria-pressed','false');nav.appendChild(button);
  const workspace=document.createElement('section');workspace.id='brushManagerWorkspace';workspace.hidden=true;workspace.innerHTML=`
    <div class="brushManagerCard">
      <div class="brushManagerToolbar">
        <b>Brush Manager</b><span class="spacer"></span>
        <button id="brushManagerRescan" type="button">Rescan brushes/</button>
        <button id="brushManagerLocalScan" type="button">Scan local brushes folder</button>
        <label class="filebtn">Open brush files<input id="brushManagerFileInput" type="file" accept=".ihbrush" multiple></label>
        <input id="brushManagerFolderInput" type="file" accept=".ihbrush" webkitdirectory multiple hidden>
        <span id="brushManagerScanStatus"></span>
      </div>
      <div class="brushManagerGrid">
        <div id="brushManagerList"></div>
        <div id="brushManagerEditor" hidden>
          <canvas id="brushManagerPreview" class="brushManagerWide" width="520" height="150"></canvas>
          <div id="brushManagerSource" class="brushManagerWide"></div>
          <label for="brushManagerName">Name</label><input id="brushManagerName" type="text">
          <label for="brushManagerId">Catalogue ID</label><input id="brushManagerId" type="text">
          <label for="brushManagerCategory">Category</label><input id="brushManagerCategory" type="text">
          <label for="brushManagerTarget">Target</label><select id="brushManagerTarget"><option value="backdrop">Backdrop</option><option value="minimap">MiniMap</option></select>
          <label for="brushManagerPreferred">Preferred drawing form</label><select id="brushManagerPreferred"><option value="">No preference</option></select>
          <label for="brushManagerTags">Tags</label><input id="brushManagerTags" type="text" placeholder="structure, scenery">
          <span>Recolourable</span><label><input id="brushManagerRecolourable" type="checkbox"> Circuit-palette recolouring permitted</label>
          <span>Accepted paint modes</span><div><label><input id="brushManagerAnyTools" type="checkbox"> Any</label><div id="brushManagerAllowedTools"></div></div>
          <span>Foreground</span><div class="brushManagerInline"><label><input id="brushManagerForeground" type="checkbox"> Apply mask</label><label><input id="brushManagerForegroundDefault" type="checkbox"> default on</label><label>value <select id="brushManagerForegroundValue"><option value="0">0</option><option value="1">1</option></select></label></div>
          <span>Surface</span><div class="brushManagerInline"><label><input id="brushManagerSurface" type="checkbox"> Apply footprint</label><label><input id="brushManagerSurfaceDefault" type="checkbox"> default on</label><label>class <select id="brushManagerSurfaceClass"><option value="0">Normal</option><option value="1">Edge</option><option value="2">Slowdown A</option><option value="3">Slowdown B</option></select></label></div>
          <span>Fixed placement</span><div class="brushManagerInline"><label><input id="brushManagerFixed" type="checkbox"> Fixed</label><label>X <input id="brushManagerFixedX" type="number"></label><label>Y <input id="brushManagerFixedY" type="number"></label><select id="brushManagerFixedAnchor"><option value="top-left">Top-left</option><option value="hotspot">Hotspot</option></select><label><input id="brushManagerSingle" type="checkbox"> single instance</label></div>
          <div class="brushManagerWide brushManagerInline"><button id="brushManagerApply" type="button">Apply metadata</button><button id="brushManagerExport" type="button">Export updated .ihbrush</button><button id="brushManagerWrite" type="button">Write to selected local folder</button></div>
        </div>
      </div>
    </div>`;
  const insert=document.getElementById('playlistWorkspace');if(insert)insert.insertAdjacentElement('afterend',workspace);else document.body.appendChild(workspace);
  const preferred=document.getElementById('brushManagerPreferred'),allowed=document.getElementById('brushManagerAllowedTools');
  for(const def of B.DRAW_TOOL_DEFS||[]){
    const option=document.createElement('option');option.value=def.value;option.textContent=def.title;preferred.appendChild(option);
    const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.dataset.tool=def.value;label.append(box,document.createTextNode(` ${def.title}`));allowed.appendChild(label);
  }
  button.addEventListener('click',()=>setMode(true));
  for(const id of ['showCircuitEditor','showPlaylistEditor'])document.getElementById(id)?.addEventListener('click',()=>setMode(false),true);
  document.getElementById('brushManagerAnyTools').addEventListener('change',syncToolDisable);
  document.getElementById('brushManagerApply').addEventListener('click',()=>{try{applyMetadata();setStatus('Brush metadata applied in this editor session.');}catch(err){setStatus(`ERROR: ${err.message}`,true);}});
  document.getElementById('brushManagerExport').addEventListener('click',exportEntry);
  document.getElementById('brushManagerWrite').addEventListener('click',writeEntry);
  document.getElementById('brushManagerRescan').addEventListener('click',()=>Library.refreshFolderBrushes());
  document.getElementById('brushManagerLocalScan').addEventListener('click',scanLocal);
  document.getElementById('brushManagerFileInput').addEventListener('change',e=>Library.registerLocalBrushFiles(e.target.files,'folder:opened'));
  document.getElementById('brushManagerFolderInput').addEventListener('change',e=>Library.registerLocalBrushFiles(e.target.files,'folder:local'));
  render();return true;
}
function boot(){
  if(install())return;
  let tries=0;const timer=setInterval(()=>{if(install()||++tries>240)clearInterval(timer);},50);
}
root.addEventListener?.('indyheat-brush-library-changed',()=>queueMicrotask(render));
root.IndyHeatBrushManager=Object.freeze({VERSION,install,render,setMode});
if(typeof module!=='undefined'&&module.exports)module.exports=root.IndyHeatBrushManager;
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});else setTimeout(boot,0);
}
})(typeof globalThis!=='undefined'?globalThis:this);
