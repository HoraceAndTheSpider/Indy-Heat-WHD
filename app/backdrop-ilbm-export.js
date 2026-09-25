(function(root){
'use strict';

/* Full Backdrop ILBM exporter — v0.79. */
const WIDTH=320,HEIGHT=256,PLANES=5,ROW_BYTES=40,PLANE_BYTES=ROW_BYTES*HEIGHT,TRACK_BYTES=PLANE_BYTES*PLANES;

function wr16(b,o,v){b[o]=(v>>>8)&255;b[o+1]=v&255;}
function wr32(b,o,v){wr16(b,o,(v>>>16)&0xffff);wr16(b,o+2,v&0xffff);}
function ascii(s){return Uint8Array.from([...String(s)].map(c=>c.charCodeAt(0)&255));}
function concat(parts){let n=0;for(const p of parts)n+=p.length;const out=new Uint8Array(n);let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;}
function iffChunk(id,data){
  if(String(id).length!==4)throw new Error('IFF chunk id must be four characters');
  if(!(data instanceof Uint8Array))data=new Uint8Array(data||[]);
  const head=new Uint8Array(8);head.set(ascii(id),0);wr32(head,4,data.length);
  return data.length&1?concat([head,data,Uint8Array.of(0)]):concat([head,data]);
}
function paletteWordsToCmap(words){
  if(!Array.isArray(words)&&!(words instanceof Uint16Array))words=Array.from(words||[]);
  if(words.length<32)throw new Error('Backdrop ILBM export requires 32 palette words');
  const out=new Uint8Array(32*3);
  for(let i=0;i<32;i++){
    const w=Number(words[i])&0x0fff;
    out[i*3]=((w>>>8)&15)*17;
    out[i*3+1]=((w>>>4)&15)*17;
    out[i*3+2]=(w&15)*17;
  }
  return out;
}
function planeMajorToIlbmBody(bytes){
  if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes||[]);
  if(bytes.length<TRACK_BYTES)throw new Error(`Backdrop resource must contain at least $${TRACK_BYTES.toString(16).toUpperCase()} bytes`);
  const body=new Uint8Array(TRACK_BYTES);let at=0;
  for(let y=0;y<HEIGHT;y++)for(let p=0;p<PLANES;p++){
    const src=p*PLANE_BYTES+y*ROW_BYTES;
    body.set(bytes.subarray(src,src+ROW_BYTES),at);at+=ROW_BYTES;
  }
  return body;
}
function encodeBackdropIlbm(bytes,paletteWords){
  const bmhd=new Uint8Array(20);
  wr16(bmhd,0,WIDTH);wr16(bmhd,2,HEIGHT);wr16(bmhd,4,0);wr16(bmhd,6,0);
  bmhd[8]=PLANES;     // nPlanes
  bmhd[9]=0;          // no mask plane
  bmhd[10]=0;         // uncompressed BODY for broad Amiga paint-package compatibility
  bmhd[11]=0;
  wr16(bmhd,12,0);    // transparentColor is not a Backdrop/game transparency contract
  bmhd[14]=10;bmhd[15]=11; // conventional PAL low-resolution aspect
  wr16(bmhd,16,WIDTH);wr16(bmhd,18,HEIGHT);
  const payload=concat([
    ascii('ILBM'),
    iffChunk('BMHD',bmhd),
    iffChunk('CMAP',paletteWordsToCmap(paletteWords)),
    iffChunk('BODY',planeMajorToIlbmBody(bytes))
  ]);
  const form=new Uint8Array(8);form.set(ascii('FORM'),0);wr32(form,4,payload.length);
  return concat([form,payload]);
}
function defaultFilename(base){return `indyheat_res${Number(base).toString(16).toUpperCase().padStart(2,'0')}_background.iff`;}

const api={WIDTH,HEIGHT,PLANES,ROW_BYTES,PLANE_BYTES,TRACK_BYTES,paletteWordsToCmap,planeMajorToIlbmBody,encodeBackdropIlbm,defaultFilename};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.IndyHeatBackdropIlbmExport=api;

if(typeof document==='undefined')return;
const T=root.IndyHeatTools,C=root.IndyHeatRaceSetupCapture,D=root.IndyHeatTrackBackdropTools;
if(!T||!C||!D)return;
const $=id=>document.getElementById(id);
function trackIndex(){return Number($('trackSelect')?.value||0);}
function baseId(){return T.TRACK_BASE_IDS?.[trackIndex()]??null;}
function capturedModels(){
  const out=[],seen=new Set();
  for(const m of [C.coreModel,C.layerModel,C.model,...(Array.isArray(C.models)?C.models:[])]){
    if(!m||seen.has(m)||typeof m.getResource!=='function')continue;seen.add(m);out.push(m);
  }
  return out;
}
function currentBackdrop(){
  const b=baseId();if(b==null)return null;
  for(const model of capturedModels()){
    try{const resource=model.getResource(b);if(resource)return {model,resource,base:b};}catch(_e){}
  }
  return null;
}
function paletteWords(model){
  try{const p=typeof T.findVerifiedTrackPalette==='function'?T.findVerifiedTrackPalette(model):null;if(p?.words?.length>=32)return Array.from(p.words).slice(0,32);}catch(_e){}
  if(typeof T.verifiedTrackPaletteReference==='function'){
    const p=T.verifiedTrackPaletteReference();if(p?.words?.length>=32)return Array.from(p.words).slice(0,32);
  }
  return Array.from(T.VERIFIED_TRACK_PALETTE_WORDS||[]).slice(0,32);
}
function download(bytes,name){
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes],{type:'image/x-ilbm'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function setStatus(text,bad=false){const e=$('backdropStatus');if(e){e.textContent=text;e.classList.toggle('bad',!!bad);}}
function exportCurrent(){
  try{
    const q=currentBackdrop();if(!q)throw new Error('Backdrop resource is unavailable');
    const source=q.resource.data.slice(0,TRACK_BYTES),words=paletteWords(q.model),iff=encodeBackdropIlbm(source,words);
    // Self-check through the established importer/parser before download.
    const parsed=D.parseIlbm(iff),pixels=D.decodeIlbmPixels(parsed),roundTrip=D.encodeTrackPlanar(pixels);
    if(!D.arraysEqual(source,roundTrip))throw new Error('ILBM export self-check failed: decoded BODY does not reproduce the current Backdrop');
    download(iff,defaultFilename(q.base));
    setStatus(`Exported ${defaultFilename(q.base)} · ${WIDTH}×${HEIGHT} · ${PLANES} planes · 32-colour Indy Heat race palette.\nThe ILBM BODY round-tripped exactly to the current $C800 Backdrop resource.`);
  }catch(err){setStatus(`ERROR: ${err.message}`,true);}
}
function install(){
  const bin=$('backdropExport');if(!bin)return false;if($('backdropExportIff'))return true;
  const button=document.createElement('button');button.id='backdropExportIff';button.type='button';button.textContent='Export backdrop .iff';button.title='Export the complete 320×256 5-plane Backdrop as an ILBM using the verified Indy Heat race palette.';button.addEventListener('click',exportCurrent);
  bin.style.gridColumn='auto';
  button.style.gridColumn='auto';
  bin.insertAdjacentElement('afterend',button);
  return true;
}
let tries=0;function boot(){if(install()||++tries>240)return;setTimeout(boot,50);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});else setTimeout(boot,0);
})(typeof globalThis!=='undefined'?globalThis:this);
