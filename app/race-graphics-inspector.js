(function(root){
'use strict';

/*
 * Indy Heat retail race-graphics inspector — v0.102.
 *
 * All raster graphics are decoded at runtime from the loaded Disk.1 through
 * IndyHeatTools + IndyHeatRaceGraphics. No pre-ripped PNG/IFF assets are used.
 *
 * This module deliberately stays separate from race-setup.js: race-setup owns
 * editable race/pit coordinates; this module owns retail graphics inspection,
 * playback and alignment preview.
 */

const VERSION='0.102';
const RESOURCE_IDS=Object.freeze([0x05,0x08,0x0F,0x10,0x11]);

// Existing HUD research in editor-ui.js establishes source-block order
// [0,2,1,3] for P1..P4, while the four source blocks are
// [red,yellow,blue,grey]. Keep this mapping descriptive: the $10/$11 car
// graphics are shared/mirrored banks, not four separate player-colour banks.
const PLAYER_MAPPING=Object.freeze([
  Object.freeze({index:0,player:'P1',colour:'Red',sourceBlock:0,css:'#ef4a43'}),
  Object.freeze({index:1,player:'P2',colour:'Blue',sourceBlock:2,css:'#7388ff'}),
  Object.freeze({index:2,player:'P3',colour:'Yellow',sourceBlock:1,css:'#e1c44b'}),
  Object.freeze({index:3,player:'P4',colour:'Grey/white',sourceBlock:3,css:'#d7d7d7'})
]);

const ASSETS=Object.freeze([
  Object.freeze({id:0x10,key:'car-a',label:'Car bank A · $10',defaultTarget:'grid',
    note:'44-frame authentic retail car bank.'}),
  Object.freeze({id:0x11,key:'car-b',label:'Car bank B / horizontal mirror · $11',defaultTarget:'grid',
    note:'44-frame companion bank; predominantly the horizontal-mirror counterpart to $10.'}),
  Object.freeze({id:0x05,key:'pit-crew',label:'Pit crew · $05',defaultTarget:'crew',
    note:'Authentic retail pit-crew/object bank.'}),
  Object.freeze({id:0x08,key:'pit-board',label:'PIT-board attendants · $08',defaultTarget:'boards',
    note:'Authentic retail PIT-board/object bank.'}),
  Object.freeze({id:0x0F,key:'flag',label:'Flag man / starting gun · $0F',defaultTarget:'flag',
    note:'Authentic retail flag-man/starting-gun bank.'})
]);

const TARGETS=Object.freeze([
  Object.freeze({key:'grid',label:'Grid car positions'}),
  Object.freeze({key:'pits',label:'Pit/service car positions'}),
  Object.freeze({key:'crew',label:'Pit crew screen positions'}),
  Object.freeze({key:'boards',label:'PIT-board positions'}),
  Object.freeze({key:'flag',label:'Flag-man position'}),
  Object.freeze({key:'none',label:'Preview window only'})
]);

function assetById(id){return ASSETS.find(a=>a.id===Number(id))||ASSETS[0];}
function playerInfo(index){return PLAYER_MAPPING[Number(index)]||{player:`P${Number(index)+1}`,colour:'',css:'#fff'};}
function hex2(v){return '$'+Number(v).toString(16).toUpperCase().padStart(2,'0');}
function clamp(v,min,max){v=Math.round(Number(v)||0);return Math.max(min,Math.min(max,v));}

const api={VERSION,RESOURCE_IDS,PLAYER_MAPPING,ASSETS,TARGETS,assetById,playerInfo,hex2,clamp};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.IndyHeatRaceGraphicsInspector=api;

function syncVersion(){
  root.INDY_HEAT_EDITOR_VERSION=VERSION;
  if(typeof document==='undefined')return;
  document.title=document.title.replace(/v\d+\.\d+/i,`v${VERSION}`);
  const h=document.querySelector('#appIdentity h1')||document.querySelector('header h1');
  if(h)h.textContent=h.textContent.replace(/v\d+\.\d+/i,`v${VERSION}`);
}
syncVersion();

if(typeof document==='undefined')return;

const $=id=>document.getElementById(id);
let graphics=null;
let attachedModel=null;
let imageCache=new Map();
let overlay=null;
let playing=false;
let raf=0;
let lastFrameTime=0;
let retryTimer=0;

function deps(){
  return {
    T:root.IndyHeatTools,
    G:root.IndyHeatRaceGraphics,
    R:root.IndyHeatRaceSetupTools,
    C:root.IndyHeatRaceSetupCapture
  };
}
function currentRecord(){
  const {T,C}=deps();
  if(!T||!C?.model)return null;
  for(const r of C.records||[]){
    if(r.baseResourceId==null&&typeof T.raceBaseResourceId==='function')
      r.baseResourceId=T.raceBaseResourceId(r,C.model.resourceTableOffset+0x1000);
  }
  const ti=Number($('trackSelect')?.value||0),base=T.TRACK_BASE_IDS?.[ti];
  return (C.records||[]).find(r=>r.baseResourceId===base)||null;
}
function currentSetup(){
  const {R,C}=deps(),r=currentRecord();
  if(!R||!C?.model||!r)return null;
  try{return R.parseRaceSetup(C.model.main,r);}catch(_){return null;}
}
function raceModeActive(){
  const pane=$('raceSetupPane'),button=$('layerEditRaceSetup');
  return !!(pane&&!pane.hidden&&button?.classList.contains('active'));
}
function ensureGraphics(){
  const {G,C}=deps();
  if(!G||!C?.model)return false;
  if(graphics&&attachedModel===C.model)return true;
  try{
    graphics=G.attach(C.model,{resourceIds:RESOURCE_IDS});
    attachedModel=C.model;
    imageCache=new Map();
    return true;
  }catch(err){
    graphics=null;attachedModel=null;
    setMeta(`Graphics unavailable: ${err.message||err}`);
    return false;
  }
}
function bank(){
  if(!ensureGraphics())return null;
  const id=Number($('raceGraphicsAsset')?.value||0x10);
  return graphics.getBank(id);
}
function selectedAsset(){return assetById(Number($('raceGraphicsAsset')?.value||0x10));}
function frameCount(){
  const b=bank();
  return b&&!b.error?Number(b.frameCount||0):0;
}
function frameIndex(){
  const n=Math.max(0,frameCount()-1);
  return clamp($('raceGraphicsFrameNumber')?.value??$('raceGraphicsFrame')?.value,0,n);
}
function spriteCanvas(id,index){
  if(!ensureGraphics())return null;
  const key=`${id}:${index}`;
  if(imageCache.has(key))return imageCache.get(key);
  const rendered=graphics.renderFrame(id,index),frame=graphics.getFrame(id,index);
  if(!rendered||!frame)return null;
  const c=document.createElement('canvas');
  c.width=rendered.width;c.height=rendered.height;
  const x=c.getContext('2d'),im=x.createImageData(rendered.width,rendered.height);
  im.data.set(rendered.rgba);x.putImageData(im,0,0);
  const value={canvas:c,frame};
  imageCache.set(key,value);
  return value;
}

function setMeta(text){
  const e=$('raceGraphicsMeta');if(e)e.textContent=text;
}
function syncFrameControls(value){
  const count=frameCount(),max=Math.max(0,count-1);
  const range=$('raceGraphicsFrame'),num=$('raceGraphicsFrameNumber');
  value=clamp(value,0,max);
  if(range){range.max=String(max);range.value=String(value);}
  if(num){num.max=String(max);num.value=String(value);}
  return value;
}
function bounds(changed=null){
  const count=frameCount(),max=Math.max(0,count-1);
  const a=$('raceGraphicsStart'),b=$('raceGraphicsEnd');
  let start=clamp(a?.value,0,max),end=clamp(b?.value,0,max);
  if(start>end){
    if(changed==='end')start=end;
    else end=start;
  }
  if(a){a.max=String(max);a.value=String(start);}
  if(b){b.max=String(max);b.value=String(end);}
  return {start,end,max};
}
function setFrame(value,{redraw=true}={}){
  const {start,end}=bounds();
  value=clamp(value,start,end);
  syncFrameControls(value);
  if(redraw){drawPreview();drawOverlay();}
  return value;
}
function resetAsset(){
  if(!ensureGraphics())return;
  const b=bank(),count=b&&!b.error?b.frameCount:0,max=Math.max(0,count-1);
  if($('raceGraphicsStart'))$('raceGraphicsStart').value='0';
  if($('raceGraphicsEnd'))$('raceGraphicsEnd').value=String(max);
  syncFrameControls(0);
  const a=selectedAsset(),target=$('raceGraphicsTarget');
  if(target)target.value=a.defaultTarget;
  stopPlayback();
  drawPreview();drawOverlay();
}
function setFpsOutput(){
  const e=$('raceGraphicsFps'),out=$('raceGraphicsFpsValue');
  if(out)out.textContent=`${clamp(e?.value,1,30)} fps`;
}

function drawPreview(){
  const c=$('raceGraphicsPreview');if(!c)return;
  const ctx=c.getContext('2d');
  ctx.clearRect(0,0,c.width,c.height);
  ctx.fillStyle='#0e1014';ctx.fillRect(0,0,c.width,c.height);
  if(!ensureGraphics())return;
  const id=Number($('raceGraphicsAsset')?.value||0x10),fi=frameIndex();
  const img=spriteCanvas(id,fi);
  if(!img){setMeta(`${selectedAsset().label} · frame unavailable`);return;}
  const {canvas,frame}=img;
  const maxScale=Math.max(1,Math.floor(Math.min((c.width-20)/canvas.width,(c.height-20)/canvas.height,8)));
  const s=maxScale,ax=Math.round(c.width/2),ay=Math.round(c.height/2);
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(canvas,ax-frame.xOrigin*s,ay-frame.yOrigin*s,canvas.width*s,canvas.height*s);
  ctx.strokeStyle='#ffd84a';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(ax-6,ay+.5);ctx.lineTo(ax+6,ay+.5);ctx.moveTo(ax+.5,ay-6);ctx.lineTo(ax+.5,ay+6);ctx.stroke();
  const b=bank(),a=selectedAsset();
  setMeta(`Built from loaded Disk.1 · ${a.label} · frame ${fi}/${Math.max(0,(b?.frameCount||1)-1)} · ${frame.width}×${frame.height} · origin ${frame.xOrigin},${frame.yOrigin} · ${frame.planes} planes`);
}

function ensureOverlay(){
  if(overlay?.isConnected)return overlay;
  const view=$('view');if(!view)return null;
  const stack=view.closest('.canvasStack')||view.parentElement;if(!stack)return null;
  overlay=document.createElement('canvas');
  overlay.id='raceGraphicsInspectorCanvas';
  overlay.style.position='absolute';
  overlay.style.inset='0';
  overlay.style.zIndex='4';
  overlay.style.pointerEvents='none';
  overlay.style.imageRendering='pixelated';
  stack.appendChild(overlay);
  return overlay;
}
function syncOverlay(){
  const c=ensureOverlay(),view=$('view');if(!c||!view)return null;
  if(c.width!==view.width||c.height!==view.height){c.width=view.width;c.height=view.height;}
  return c;
}
function label(ctx,text,x,y,S,colour='#fff'){
  if(!$('raceGraphicsLabels')?.checked)return;
  ctx.save();
  ctx.font=`600 ${Math.max(9,Math.round(3.6*S))}px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`;
  ctx.textBaseline='top';
  const w=ctx.measureText(text).width;
  ctx.fillStyle='rgba(0,0,0,.80)';ctx.fillRect(x-2*S,y-1*S,w+4*S,Math.max(10,5*S));
  ctx.fillStyle=colour;ctx.fillText(text,x,y);ctx.restore();
}
function drawAnchor(ctx,x,y,S){
  const px=x*S,py=y*S;
  ctx.save();ctx.strokeStyle='#ffd84a';ctx.lineWidth=Math.max(1,.55*S);
  ctx.beginPath();ctx.moveTo(px-4*S,py);ctx.lineTo(px+4*S,py);ctx.moveTo(px,py-4*S);ctx.lineTo(px,py+4*S);ctx.stroke();ctx.restore();
}
function drawFrameAt(ctx,id,fi,x,y,S,text='',colour='#fff'){
  if(!Number.isFinite(x)||!Number.isFinite(y))return;
  drawAnchor(ctx,x,y,S);
  const img=spriteCanvas(id,fi);
  if(img){
    const {canvas,frame}=img;
    ctx.save();ctx.imageSmoothingEnabled=false;
    ctx.drawImage(canvas,(x-frame.xOrigin)*S,(y-frame.yOrigin)*S,canvas.width*S,canvas.height*S);
    ctx.restore();
  }
  if(text)label(ctx,text,(x+5)*S,(y-7)*S,S,colour);
}
function targetsFor(key){
  const {R}=deps(),s=currentSetup(),record=currentRecord();
  if(!R||!s)return [];
  if(key==='grid'){
    return R.gridCarPositions(s).map((car,i)=>{
      const q=R.projectFixedXZ(car.x,car.y),p=playerInfo(i);
      return q?{x:q.x,y:q.y,text:`${p.player} ${p.colour.toUpperCase()}`,colour:p.css,index:i}:null;
    }).filter(Boolean);
  }
  if(key==='pits'){
    return s.pits.map((pit,i)=>{
      const q=R.projectFixedXZ(pit.serviceX,pit.serviceY),p=playerInfo(i);
      return q?{x:q.x,y:q.y,text:`${p.player} ${p.colour.toUpperCase()} PIT`,colour:p.css,index:i}:null;
    }).filter(Boolean);
  }
  if(key==='crew'){
    return s.pits.map((pit,i)=>{
      const p=playerInfo(i);
      return pit.screenX>=0&&pit.screenX<320&&pit.screenY>=0&&pit.screenY<256
        ?{x:pit.screenX,y:pit.screenY,text:`${p.player} CREW`,colour:p.css,index:i}:null;
    }).filter(Boolean);
  }
  if(key==='boards'){
    return s.pits.map((pit,i)=>{
      const q=R.projectFixedXZ(pit.boardX,pit.boardY),p=playerInfo(i);
      return q?{x:q.x,y:q.y,text:`${p.player} PIT BOARD`,colour:p.css,index:i}:null;
    }).filter(Boolean);
  }
  if(key==='flag'){
    return s.flagX>=0&&s.flagX<320&&s.flagY>=0&&s.flagY<256
      ?[{x:s.flagX,y:s.flagY,text:'FLAG',colour:'#fff'}]:[];
  }
  return [];
}
function drawOverlay(){
  const c=syncOverlay();if(!c)return;
  const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);
  if(!raceModeActive()||!$('raceGraphicsOverlay')?.checked||!ensureGraphics())return;
  const target=$('raceGraphicsTarget')?.value||'none';if(target==='none')return;
  const id=Number($('raceGraphicsAsset')?.value||0x10),fi=frameIndex(),S=c.width/320;
  ctx.globalAlpha=Math.max(.25,Math.min(1,Number($('opacity')?.value||55)/100));
  for(const t of targetsFor(target))drawFrameAt(ctx,id,fi,t.x,t.y,S,t.text,t.colour);
  ctx.globalAlpha=1;
}

function stopPlayback(){
  playing=false;
  if(raf){cancelAnimationFrame(raf);raf=0;}
  lastFrameTime=0;
  const b=$('raceGraphicsPlay');if(b)b.textContent='Play';
}
function animationTick(ts){
  if(!playing)return;
  const fps=clamp($('raceGraphicsFps')?.value,1,30),interval=1000/fps;
  if(!lastFrameTime)lastFrameTime=ts;
  if(ts-lastFrameTime>=interval){
    const {start,end}=bounds();
    let n=frameIndex()+1;
    if(n>end){
      if($('raceGraphicsLoop')?.checked)n=start;
      else{setFrame(end);stopPlayback();return;}
    }
    setFrame(n);
    lastFrameTime=ts;
  }
  raf=requestAnimationFrame(animationTick);
}
function togglePlayback(){
  if(playing){stopPlayback();return;}
  const count=frameCount();if(!count)return;
  const {start,end}=bounds();
  if(frameIndex()<start||frameIndex()>end||frameIndex()===end)setFrame(start);
  playing=true;
  const b=$('raceGraphicsPlay');if(b)b.textContent='Pause';
  lastFrameTime=0;raf=requestAnimationFrame(animationTick);
}

function playerMapHtml(){
  return PLAYER_MAPPING.map(p=>
    `<span class="raceGraphicsPlayer"><i style="background:${p.css}"></i>${p.player} ${p.colour}</span>`
  ).join('');
}
function injectUi(){
  if($('raceGraphicsInspector'))return true;
  const pane=$('raceSetupPane');if(!pane)return false;
  const host=pane.querySelector('.toolGroup')||pane;
  const style=document.createElement('style');
  style.id='raceGraphicsInspectorStyle';
  style.textContent=`
    #raceGraphicsInspector{margin-top:10px;padding-top:9px;border-top:1px solid #30343d}
    .raceGraphicsPlayerMap{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:6px 0}
    .raceGraphicsPlayer{display:flex;gap:6px;align-items:center;font-size:11px;color:#d5dae2}
    .raceGraphicsPlayer i{width:10px;height:10px;border:1px solid #777;border-radius:2px;box-sizing:border-box}
    .raceGraphicsGrid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:7px 0}
    .raceGraphicsGrid label{display:grid;gap:3px;margin:0;color:#b9c0cc;font-size:11px}
    .raceGraphicsGrid input,.raceGraphicsGrid select{min-width:0;width:100%;box-sizing:border-box}
    .raceGraphicsWide{grid-column:1/-1}
    .raceGraphicsFrameRow{display:grid;grid-template-columns:minmax(0,1fr) 58px;gap:6px;align-items:center}
    .raceGraphicsActions{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:7px 0}
    .raceGraphicsActions button{padding:6px 10px;font-size:11px}
    .raceGraphicsActions label{margin:0;font-size:11px;white-space:nowrap}
    #raceGraphicsPreview{width:100%;height:120px;display:block;background:#0e1014;border:1px solid #30343d;border-radius:4px;image-rendering:pixelated;box-sizing:border-box}
    #raceGraphicsMeta{font-size:10px;line-height:1.35;min-height:28px;margin-top:5px}
    #raceGraphicsInspectorCanvas{image-rendering:pixelated}
  `;
  document.head.appendChild(style);

  const box=document.createElement('div');
  box.id='raceGraphicsInspector';
  box.innerHTML=`
    <div class="toolGroupTitle">Retail graphics / animation</div>
    <div class="raceGraphicsPlayerMap">${playerMapHtml()}</div>
    <div class="muted" style="font-size:10px;line-height:1.35">
      Player colours follow the established retail HUD source order. Car banks $10/$11 are a shared mirrored pair, not four colour-specific banks. Turn off the matching static Race overlay above when comparing an animated pit/flag sequence.
    </div>
    <div class="raceGraphicsGrid">
      <label class="raceGraphicsWide">Asset <select id="raceGraphicsAsset"></select></label>
      <label class="raceGraphicsWide">Track target <select id="raceGraphicsTarget"></select></label>
      <label class="raceGraphicsWide">Frame
        <div class="raceGraphicsFrameRow">
          <input id="raceGraphicsFrame" type="range" min="0" max="0" step="1" value="0">
          <input id="raceGraphicsFrameNumber" type="number" min="0" max="0" step="1" value="0">
        </div>
      </label>
      <label>Loop start <input id="raceGraphicsStart" type="number" min="0" max="0" step="1" value="0"></label>
      <label>Loop end <input id="raceGraphicsEnd" type="number" min="0" max="0" step="1" value="0"></label>
      <label class="raceGraphicsWide">Playback
        <div class="raceGraphicsFrameRow">
          <input id="raceGraphicsFps" type="range" min="1" max="30" step="1" value="8">
          <output id="raceGraphicsFpsValue">8 fps</output>
        </div>
      </label>
    </div>
    <div class="raceGraphicsActions">
      <button id="raceGraphicsPlay" type="button">Play</button>
      <label><input id="raceGraphicsLoop" type="checkbox" checked> Loop</label>
      <label><input id="raceGraphicsOverlay" type="checkbox" checked> Draw on track</label>
      <label><input id="raceGraphicsLabels" type="checkbox" checked> Labels</label>
    </div>
    <canvas id="raceGraphicsPreview" width="260" height="120"></canvas>
    <div id="raceGraphicsMeta" class="muted">Retail graphics are loading from Disk.1.</div>
  `;
  host.appendChild(box);

  const asset=$('raceGraphicsAsset'),target=$('raceGraphicsTarget');
  for(const a of ASSETS){const o=document.createElement('option');o.value=String(a.id);o.textContent=a.label;asset.appendChild(o);}
  for(const t of TARGETS){const o=document.createElement('option');o.value=t.key;o.textContent=t.label;target.appendChild(o);}
  asset.value=String(0x10);target.value='grid';

  asset.addEventListener('change',resetAsset);
  target.addEventListener('change',drawOverlay);
  $('raceGraphicsFrame').addEventListener('input',e=>setFrame(e.target.value));
  $('raceGraphicsFrameNumber').addEventListener('input',e=>setFrame(e.target.value));
  $('raceGraphicsStart').addEventListener('change',()=>{const q=bounds('start');setFrame(clamp(frameIndex(),q.start,q.end));});
  $('raceGraphicsEnd').addEventListener('change',()=>{const q=bounds('end');setFrame(clamp(frameIndex(),q.start,q.end));});
  $('raceGraphicsFps').addEventListener('input',setFpsOutput);
  $('raceGraphicsPlay').addEventListener('click',togglePlayback);
  $('raceGraphicsOverlay').addEventListener('change',drawOverlay);
  $('raceGraphicsLabels').addEventListener('change',drawOverlay);

  ensureOverlay();
  resetAsset();
  return true;
}

function installListeners(){
  if(document.documentElement.dataset.raceGraphicsInspectorListeners)return;
  document.documentElement.dataset.raceGraphicsInspectorListeners='1';
  $('trackSelect')?.addEventListener('change',()=>setTimeout(()=>{drawPreview();drawOverlay();},0));
  $('opacity')?.addEventListener('input',drawOverlay);
  $('layerModeButtons')?.addEventListener('click',()=>setTimeout(()=>{
    if(!raceModeActive()&&playing)stopPlayback();
    drawOverlay();
  },0));
  document.addEventListener('indyheat-race-setup-capture',()=>setTimeout(()=>{
    graphics=null;attachedModel=null;imageCache.clear();ensureGraphics();drawPreview();drawOverlay();
  },0));
  window.addEventListener('blur',()=>{if(playing)stopPlayback();});
  if(typeof ResizeObserver!=='undefined'){
    const view=$('view');if(view)new ResizeObserver(drawOverlay).observe(view);
  }
}

function boot(){
  syncVersion();
  // brush-library.js still carries its own v0.101 module version and reasserts
  // it during startup. Reassert the editor release after startup timers settle.
  setTimeout(syncVersion,0);
  setTimeout(syncVersion,250);
  setTimeout(syncVersion,1000);
  setTimeout(syncVersion,3000);
  if(injectUi()){
    installListeners();ensureGraphics();drawPreview();drawOverlay();
    return;
  }
  let tries=0;
  retryTimer=setInterval(()=>{
    tries++;
    syncVersion();
    if(injectUi()||tries>400){
      clearInterval(retryTimer);retryTimer=0;
      if($('raceGraphicsInspector')){installListeners();ensureGraphics();drawPreview();drawOverlay();}
    }
  },50);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});
else setTimeout(boot,0);

})(typeof globalThis!=='undefined'?globalThis:this);
