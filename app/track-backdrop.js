(function(root){
'use strict';

const TRACK_WIDTH=320;
const TRACK_HEIGHT=256;
const TRACK_PLANES=5;
const TRACK_ROW_BYTES=40;
const TRACK_PLANE_BYTES=TRACK_ROW_BYTES*TRACK_HEIGHT;
const TRACK_BYTES=TRACK_PLANE_BYTES*TRACK_PLANES; // $C800

function ascii4(b,o){return String.fromCharCode(b[o],b[o+1],b[o+2],b[o+3]);}
function be16(b,o){if(!b||o<0||o+2>b.length)throw new Error('be16 outside buffer');return ((b[o]<<8)|b[o+1])>>>0;}
function be32(b,o){if(!b||o<0||o+4>b.length)throw new Error('be32 outside buffer');return (((be16(b,o)<<16)>>>0)|be16(b,o+2))>>>0;}
function s8(v){return (v&0x80)?v-0x100:v;}
function amigaWordToRgb(word){return [((word>>>8)&15)*17,((word>>>4)&15)*17,(word&15)*17];}
function cmapToWords(cmap){return cmap.map(c=>((c[0]>>>4)<<8)|((c[1]>>>4)<<4)|(c[2]>>>4));}
function gamePaletteRgb(words){return Array.from(words||[],amigaWordToRgb);}

function parseChunks(bytes){
  if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
  if(bytes.length<12||ascii4(bytes,0)!=='FORM'||ascii4(bytes,8)!=='ILBM')throw new Error('IFF must be a FORM ILBM file');
  const formSize=be32(bytes,4),end=Math.min(bytes.length,8+formSize),chunks=[];
  for(let p=12;p+8<=end;){
    const id=ascii4(bytes,p),size=be32(bytes,p+4),dataOffset=p+8,dataEnd=dataOffset+size;
    if(dataEnd>end||dataEnd>bytes.length)throw new Error(`IFF chunk ${id} overruns FORM`);
    chunks.push({id,size,dataOffset,dataEnd,data:bytes.subarray(dataOffset,dataEnd)});
    p=dataEnd+(size&1);
  }
  return chunks;
}
function oneChunk(chunks,id,required=true){const c=chunks.find(q=>q.id===id);if(!c&&required)throw new Error(`IFF ${id} chunk is missing`);return c||null;}
function parseIlbm(bytes){
  if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
  const chunks=parseChunks(bytes),bm=oneChunk(chunks,'BMHD'),body=oneChunk(chunks,'BODY'),cmapChunk=oneChunk(chunks,'CMAP',false),camg=oneChunk(chunks,'CAMG',false);
  if(bm.size<20)throw new Error('IFF BMHD is shorter than 20 bytes');
  const d=bm.data,bmhd={
    width:be16(d,0),height:be16(d,2),x:(be16(d,4)&0x8000)?be16(d,4)-0x10000:be16(d,4),y:(be16(d,6)&0x8000)?be16(d,6)-0x10000:be16(d,6),
    planes:d[8],masking:d[9],compression:d[10],transparentColor:be16(d,12),xAspect:d[14],yAspect:d[15],pageWidth:be16(d,16),pageHeight:be16(d,18)
  };
  if(bmhd.width!==TRACK_WIDTH||bmhd.height!==TRACK_HEIGHT)throw new Error(`Track IFF must be exactly ${TRACK_WIDTH}×${TRACK_HEIGHT}; got ${bmhd.width}×${bmhd.height}`);
  if(bmhd.planes<1||bmhd.planes>TRACK_PLANES)throw new Error(`Track IFF must use 1–${TRACK_PLANES} bitplanes; got ${bmhd.planes}`);
  if(bmhd.masking!==0&&bmhd.masking!==1&&bmhd.masking!==2)throw new Error(`Unsupported ILBM masking mode ${bmhd.masking}`);
  if(bmhd.compression!==0&&bmhd.compression!==1)throw new Error(`Unsupported ILBM compression ${bmhd.compression}; expected none or ByteRun1`);
  const camgMode=camg&&camg.size>=4?be32(camg.data,0):0;
  if(camgMode&0x0800)throw new Error('HAM ILBM images cannot be used as Indy Heat track backdrops');
  if(camgMode&0x0080)throw new Error('EHB ILBM images cannot be used as Indy Heat track backdrops');
  const cmap=[];
  if(cmapChunk){for(let i=0;i+2<cmapChunk.data.length;i+=3)cmap.push([cmapChunk.data[i],cmapChunk.data[i+1],cmapChunk.data[i+2]]);}
  return {bytes,chunks,bmhd,body:body.data,cmap,camgMode};
}

function decodeByteRunRow(body,state,rowBytes){
  const out=new Uint8Array(rowBytes);let n=0;
  while(n<rowBytes){
    if(state.pos>=body.length)throw new Error('ByteRun1 BODY ended inside a scanline');
    const ctl=s8(body[state.pos++]);
    if(ctl>=0){const count=ctl+1;if(n+count>rowBytes||state.pos+count>body.length)throw new Error('ByteRun1 literal run exceeds scanline/BODY');out.set(body.subarray(state.pos,state.pos+count),n);state.pos+=count;n+=count;}
    else if(ctl!==-128){const count=1-ctl;if(n+count>rowBytes||state.pos>=body.length)throw new Error('ByteRun1 repeat run exceeds scanline/BODY');out.fill(body[state.pos++],n,n+count);n+=count;}
  }
  return out;
}
function decodeIlbmPixels(parsed){
  const {bmhd,body}=parsed,rowBytes=((bmhd.width+15)>>4)<<1,extraMask=bmhd.masking===1?1:0,state={pos:0},pixels=new Uint8Array(bmhd.width*bmhd.height),mask=extraMask?new Uint8Array(bmhd.width*bmhd.height):null;
  function nextRow(){
    if(bmhd.compression===1)return decodeByteRunRow(body,state,rowBytes);
    if(state.pos+rowBytes>body.length)throw new Error('Uncompressed BODY ended inside a scanline');const r=body.slice(state.pos,state.pos+rowBytes);state.pos+=rowBytes;return r;
  }
  for(let y=0;y<bmhd.height;y++){
    const rows=[];for(let p=0;p<bmhd.planes;p++)rows.push(nextRow());const maskRow=extraMask?nextRow():null;
    for(let x=0;x<bmhd.width;x++){
      const bi=x>>>3,bit=0x80>>>(x&7),i=y*bmhd.width+x;let v=0;
      for(let p=0;p<bmhd.planes;p++)if(rows[p][bi]&bit)v|=1<<p;
      pixels[i]=v;if(mask)mask[i]=(maskRow[bi]&bit)?1:0;
    }
  }
  if(mask)for(let i=0;i<pixels.length;i++)if(!mask[i])pixels[i]=0;
  return pixels;
}
function nearestColourIndex(rgb,palette){let best=0,bd=Infinity;for(let i=0;i<palette.length;i++){const q=palette[i],dr=rgb[0]-q[0],dg=rgb[1]-q[1],db=rgb[2]-q[2],d=dr*dr+dg*dg+db*db;if(d<bd){bd=d;best=i;}}return {index:best,d2:bd};}
function prepareTrackPixels(parsed,gameWords,{remap=true}={}){
  const src=decodeIlbmPixels(parsed),maxIndex=src.reduce((m,v)=>Math.max(m,v),0),gameRgb=gamePaletteRgb(gameWords);
  if(gameRgb.length!==32)throw new Error('A 32-colour Indy Heat game palette is required');
  if(maxIndex>=32)throw new Error(`IFF uses colour index ${maxIndex}; Indy Heat track backgrounds are 5-plane/32-colour`);
  const used=new Uint8Array(32);for(const v of src)used[v]=1;
  const sourceWords=cmapToWords(parsed.cmap),mapping=Array.from({length:32},(_,i)=>i);let paletteExact=true,changedIndices=0,totalSq=0,maxSq=0,mappedPixels=0,mappedColours=0;
  for(let i=0;i<32;i++)if(used[i]){
    if(!parsed.cmap[i]){paletteExact=false;if(remap)throw new Error(`IFF CMAP does not contain used colour index ${i}`);continue;}
    if(sourceWords[i]!==gameWords[i])paletteExact=false;
  }
  if(!paletteExact&&remap){
    for(let i=0;i<32;i++)if(used[i]){const n=nearestColourIndex(amigaWordToRgb(sourceWords[i]),gameRgb);mapping[i]=n.index;if(n.index!==i)changedIndices++;totalSq+=n.d2;maxSq=Math.max(maxSq,n.d2);mappedColours++;}
  }
  let pixels=src;
  if(!paletteExact&&remap){pixels=new Uint8Array(src.length);for(let i=0;i<src.length;i++){pixels[i]=mapping[src[i]];mappedPixels++;}}
  return {pixels,sourcePixels:src,mapping,paletteExact,remapped:!paletteExact&&remap,changedIndices,mappedPixels,meanRgbDistance:mappedColours?Math.sqrt(totalSq/mappedColours):0,maxRgbDistance:Math.sqrt(maxSq),sourceWords};
}
function encodeTrackPlanar(pixels){
  if(!pixels||pixels.length!==TRACK_WIDTH*TRACK_HEIGHT)throw new Error(`Track pixel buffer must be ${TRACK_WIDTH*TRACK_HEIGHT} bytes`);
  const out=new Uint8Array(TRACK_BYTES);
  for(let p=0;p<TRACK_PLANES;p++)for(let y=0;y<TRACK_HEIGHT;y++){
    const ro=p*TRACK_PLANE_BYTES+y*TRACK_ROW_BYTES,pi=y*TRACK_WIDTH;
    for(let xb=0;xb<TRACK_ROW_BYTES;xb++){let v=0;for(let bit=0;bit<8;bit++){const x=xb*8+bit;if(pixels[pi+x]&(1<<p))v|=0x80>>>bit;}out[ro+xb]=v;}
  }
  return out;
}
function decodeTrackPlanar(data){
  if(!data||data.length<TRACK_BYTES)throw new Error('Track resource is shorter than $C800');const pixels=new Uint8Array(TRACK_WIDTH*TRACK_HEIGHT);
  for(let p=0;p<TRACK_PLANES;p++)for(let y=0;y<TRACK_HEIGHT;y++)for(let xb=0;xb<TRACK_ROW_BYTES;xb++){const v=data[p*TRACK_PLANE_BYTES+y*TRACK_ROW_BYTES+xb];for(let bit=0;bit<8;bit++)if(v&(0x80>>>bit))pixels[y*TRACK_WIDTH+xb*8+bit]|=1<<p;}
  return pixels;
}
function convertIlbmToTrack(bytes,gameWords,options={}){const parsed=parseIlbm(bytes),prepared=prepareTrackPixels(parsed,gameWords,options),trackBytes=encodeTrackPlanar(prepared.pixels);return {...prepared,parsed,trackBytes};}
function arraysEqual(a,b){if(!a||!b||a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;}
function backdropFilename(base){return `indyheat_res${Number(base).toString(16).toUpperCase().padStart(2,'0')}_background.bin`;}

const api={TRACK_WIDTH,TRACK_HEIGHT,TRACK_PLANES,TRACK_ROW_BYTES,TRACK_PLANE_BYTES,TRACK_BYTES,ascii4,be16,be32,s8,amigaWordToRgb,cmapToWords,gamePaletteRgb,parseChunks,parseIlbm,decodeByteRunRow,decodeIlbmPixels,nearestColourIndex,prepareTrackPixels,encodeTrackPlanar,decodeTrackPlanar,convertIlbmToTrack,arraysEqual,backdropFilename};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.IndyHeatTrackBackdropTools=api;

if(typeof document==='undefined')return;
const T=root.IndyHeatTools,C=root.IndyHeatRaceSetupCapture,R=root.IndyHeatRecoveryCapture;if(!T||!C)return;
const $=id=>document.getElementById(id);const originals=new Map(),imports=new Map();let active=false;
function downloadBytes(bytes,name){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function trackIndex(){return Number($('trackSelect')?.value||0);}
function baseId(){return T.TRACK_BASE_IDS?.[trackIndex()]??null;}
function currentResource(){const b=baseId();if(b==null||!C.model)return null;const r=C.model.getResource(b);if(!originals.has(b))originals.set(b,r.data.slice());return r;}
function dirty(){const b=baseId(),r=currentResource(),o=originals.get(b);return !!(r&&o&&!arraysEqual(r.data,o));}
function setStatus(text){const e=$('backdropStatus');if(e)e.textContent=text;}
function refresh(){
  const b=baseId(),r=currentResource();if(!r){setStatus('Backdrop data is loading.');return;}
  const imp=imports.get(b),d=dirty(),lines=[`Resource $${b.toString(16).toUpperCase().padStart(2,'0')} · ${r.data.length} bytes · ${d?'Modified':'Unmodified'}`];
  if(imp)lines.push(`${imp.name} · ${imp.paletteExact?'palette matched':'palette remapped to game colours'}${imp.changedIndices?` · ${imp.changedIndices} colour indices reassigned`:''}`);
  lines.push(`WHDLoad background export: ${TRACK_BYTES} bytes ($C800), plane-major 320×256×5.`);setStatus(lines.join('\n'));$('backdropRevert').disabled=!d;
}
function liveBackgroundCapture(){
  if(!R?.background?.length)return null;
  const ti=trackIndex(),gen=R.generation,epoch=R.epoch;
  for(let i=R.background.length-1;i>=0;i--){
    const c=R.background[i];
    if(c.generation===gen&&c.epoch===epoch&&c.trackIndex===ti&&c.result?.length===TRACK_WIDTH*TRACK_HEIGHT)return c;
  }
  // Epoch can differ briefly while UI mode listeners settle; track/generation are
  // sufficient as a safe fallback because each capture owns its returned array.
  for(let i=R.background.length-1;i>=0;i--){
    const c=R.background[i];
    if(c.generation===gen&&c.trackIndex===ti&&c.result?.length===TRACK_WIDTH*TRACK_HEIGHT)return c;
  }
  return null;
}
function requestCoreRender(){
  // backgroundOpacity's normal app.js input handler does nothing except update its
  // label and call render(), so this is a stable public DOM route to repaint after
  // the live state.bg buffer has already been updated in place.
  const opacity=$('backgroundOpacity');
  if(opacity){opacity.dispatchEvent(new Event('input',{bubbles:true}));return true;}
  return false;
}
function redrawTrack(pixels=null){
  if(pixels){
    const live=liveBackgroundCapture();
    if(live)live.result.set(pixels);
  }
  if(!requestCoreRender()){
    const bridge=root.IndyHeatEditorBridge;
    if(bridge&&typeof bridge.refreshSelectedTrack==='function')bridge.refreshSelectedTrack();
  }
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>refresh());
  else setTimeout(refresh,0);
}

async function importIff(file){
  if(!file)return;const r=currentResource(),b=baseId();if(!r||b==null)return;
  try{
    const bytes=new Uint8Array(await file.arrayBuffer()),result=convertIlbmToTrack(bytes,T.VERIFIED_TRACK_PALETTE_WORDS,{remap:$('backdropRemap').checked});
    if(r.data.length<TRACK_BYTES)throw new Error(`Selected background resource is only ${r.data.length} bytes; expected at least $C800`);
    r.data.set(result.trackBytes,0);imports.set(b,{name:file.name,paletteExact:result.paletteExact,changedIndices:result.changedIndices,remapped:result.remapped});redrawTrack(result.pixels);
    setStatus(`Imported ${file.name}. ${result.paletteExact?'CMAP matches the Indy Heat game palette.':result.remapped?`Palette remapped to the nearest game colours (${result.changedIndices} used indices changed).`:'Source indices kept without remapping.'}\nExported runtime payload remains exactly $C800 bytes.`);
  }catch(e){setStatus(`ERROR: ${e.message}`);}
}
function inject(){
  const buttons=$('layerModeButtons'),column=$('layerEditorColumn');if(!buttons||!column)return false;if($('layerEditBackdrop'))return true;
  const style=document.createElement('style');style.textContent=`
    #layerModeButtons{grid-template-columns:repeat(3,minmax(0,1fr))!important}
    #layerModeButtons button{min-width:0}
    #layerEditBackdrop.active{border-color:#d6b54a;background:#5a4a1c}
    #backdropEditorPane[hidden]{display:none}
    #backdropEditorPane{font-size:12px}
    .backdropActions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:8px 0}
    .backdropActions button,.backdropFile{font-size:11px;padding:6px;box-sizing:border-box;width:100%}
    .backdropFile{display:block;border:1px solid #535b68;border-radius:3px;text-align:center;cursor:pointer;background:#282d35;color:#e3e7ec}
    .backdropFile input{display:none}
    #backdropStatus{font-size:11px;line-height:1.4;min-height:58px;white-space:pre-line;margin-top:8px}
  `;document.head.appendChild(style);
  const mode=document.createElement('button');mode.id='layerEditBackdrop';mode.type='button';mode.textContent='Backdrop';buttons.appendChild(mode);
  const pane=document.createElement('div');pane.id='backdropEditorPane';pane.hidden=true;pane.innerHTML=`
    <div class="toolGroup"><div class="toolGroupTitle">Track backdrop</div>
      <div class="muted" style="font-size:11px;line-height:1.35">Import a 320×256 ILBM/IFF backdrop. Uncompressed and ByteRun1 BODY data are supported. The editor converts row-interleaved ILBM planes into Indy Heat's $C800 plane-major background resource.</div>
      <label style="display:block;margin:8px 0"><input id="backdropRemap" type="checkbox" checked> Remap a differing IFF palette to the nearest Indy Heat game colours</label>
      <label class="backdropFile">Import IFF backdrop<input id="backdropIffInput" type="file" accept=".iff,.ilbm,.lbm,image/x-ilbm,application/octet-stream"></label>
      <div class="backdropActions"><button id="backdropExport" type="button">Export backdrop .bin</button><button id="backdropRevert" type="button">Revert backdrop</button></div>
      <div id="backdropStatus" class="muted">Backdrop data is loading.</div>
    </div>`;
  const drawing=$('layerDrawingPane'),waypointHost=$('layerWaypointHost');column.insertBefore(pane,drawing||waypointHost||null);
  mode.addEventListener('click',activate);
  ['layerModeWaypoints','layerEditSurface','layerEditMask','layerEditRecovery','layerEditRaceSetup'].forEach(id=>$(id)?.addEventListener('click',()=>{if(active)deactivate();}));
  $('backdropIffInput').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importIff(f);e.target.value='';});
  $('backdropExport').addEventListener('click',()=>{const r=currentResource(),b=baseId();if(!r||b==null)return;downloadBytes(r.data.slice(0,TRACK_BYTES),backdropFilename(b));setStatus(`Exported ${backdropFilename(b)} · ${TRACK_BYTES} bytes ($C800).\nThis is the raw decompressed track bitmap payload for WHDLoad injection.`);});
  $('backdropRevert').addEventListener('click',()=>{const r=currentResource(),b=baseId(),o=originals.get(b);if(!r||!o)return;r.data.set(o);imports.delete(b);redrawTrack(decodeTrackPlanar(o));setStatus('Backdrop restored to the loaded Disk.1 resource.');});
  $('trackSelect')?.addEventListener('change',()=>setTimeout(refresh,0));
  document.addEventListener('indyheat-race-setup-capture',e=>{if(e.detail?.type==='model'){originals.clear();imports.clear();}setTimeout(refresh,0);});
  return true;
}
function activate(){
  if(active){refresh();return;}$('layerModeWaypoints')?.click();const wp=$('showWaypoints');if(wp?.checked){wp.checked=false;wp.dispatchEvent(new Event('change',{bubbles:true}));}
  buttonsClear();active=true;$('layerEditBackdrop')?.classList.add('active');$('backdropEditorPane').hidden=false;if($('layerDrawingPane'))$('layerDrawingPane').hidden=true;if($('layerWaypointHost'))$('layerWaypointHost').hidden=true;refresh();
}
function buttonsClear(){$('layerModeButtons')?.querySelectorAll('button').forEach(b=>b.classList.remove('active'));}
function deactivate(){active=false;$('layerEditBackdrop')?.classList.remove('active');$('backdropEditorPane').hidden=true;}
function init(){if(!inject())return;const title=document.querySelector('header h1');if(title)title.textContent=title.textContent.replace(/v0\.(?:11|12|13|14)/i,'v0.15');document.title=document.title.replace(/v0\.(?:11|12|13|14)/i,'v0.15');refresh();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0));else setTimeout(init,0);
})(typeof globalThis!=='undefined'?globalThis:this);
