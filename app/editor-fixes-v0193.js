(function(root){
'use strict';

/*
 * Indy Heat Circuit Editor v0.19.3 corrective UI layer.
 *
 * This file intentionally sits after the established v0.19.2 editor extensions.
 * It fixes live integration/timing problems without altering the circuit ZIP format,
 * package importer/exporter, regional-map assets, or the underlying race data model.
 */

if(typeof document==='undefined')return;
const $=id=>document.getElementById(id);
const TRACK_W=320,TRACK_H=256,TRACK_GAME_H=224,PREVIEW_W=78,PREVIEW_H=51;
const HUD_LAYOUT={currentLapRows:[0,9,18,27],totalLaps:{x:-4,y:43},timerDigits:[{x:-8,y:47},{x:0,y:47},{x:8,y:47}]};
const HUD_CAR_COLOURS=[7,24,23,15]; // red, yellow, blue, grey
const LAP_TOTAL_ORIGIN={x:5,y:3};
let hudDrag=null,uiEventsInstalled=false,opacityObserver=null,resizeObserver=null,backdropFixInstalled=false;

function packageTools(){return root.IndyHeatCircuitPackage||null;}
function indyTools(){return root.IndyHeatTools||null;}
function capture(){return root.IndyHeatRaceSetupCapture||null;}
function sourceTrackIndex(){return Number($('trackSelect')?.value||0);}
function uniq(items){const out=[];for(const x of items)if(x&&!out.includes(x))out.push(x);return out;}
function authoringModels(){const C=capture();return C?uniq([C.coreModel,C.layerModel,C.model,...(C.models||[])]):[];}
function primaryModel(){const C=capture();return C?.model||C?.layerModel||C?.coreModel||authoringModels()[0]||null;}
function resourceModel(){const C=capture();return C?.layerModel||C?.model||C?.coreModel||authoringModels()[0]||null;}

function recordsForModel(model){
  const C=capture(),T=indyTools();if(!model||!T)return [];
  let records=C?.recordsByMain?.get(model.main)||null;
  if(!records){records=T.parseRaceRecords(model.main);C?.recordsByMain?.set(model.main,records);}
  for(const r of records){
    if(r.baseResourceId==null&&typeof T.raceBaseResourceId==='function')r.baseResourceId=T.raceBaseResourceId(r,model.resourceTableOffset+0x1000);
    if(!r.waypointDescriptors&&typeof T.parseWaypointDescriptors==='function')r.waypointDescriptors=T.parseWaypointDescriptors(model.main,r);
  }
  return records;
}
function recordForModel(model,index=sourceTrackIndex()){
  const T=indyTools();if(!model||!T)return null;const base=T.TRACK_BASE_IDS?.[index];
  return recordsForModel(model).find(r=>r.baseResourceId===base)||null;
}
function currentRecord(){return recordForModel(primaryModel());}

function setVersionLabel(){
  const re=/v0\.(?:11|12|13|14|15|16|17|18|19(?:\.[123])?)/i;
  const h=document.querySelector('header h1');if(h)h.textContent=h.textContent.replace(re,'v0.19.3');
  document.title=document.title.replace(re,'v0.19.3');
}
function installStyle(){
  if($('indyheatFix0193Style'))return;
  const s=document.createElement('style');s.id='indyheatFix0193Style';s.textContent=`
    body[data-indyheat-v0193-fix="1"] #overlayOpacityControl[data-v0193-hidden="1"]{display:none!important}
    body[data-indyheat-v0193-fix="1"] #circuitRaceHudCanvas{display:none!important}
    #editorFixHudCanvas{position:absolute;inset:0;z-index:6;display:block;pointer-events:none;image-rendering:pixelated}
    #editorFixHudCanvas[hidden]{display:none!important}
    details.indyheatViewFold{padding:6px 8px;margin:6px 0;background:#14171c;border:1px solid #30343d;border-radius:6px}
    details.indyheatViewFold>summary{font-size:12px;color:#ccd3df}
    details.indyheatViewFold .classToggles{padding-left:12px}
    .indyheatViewToggleBody{padding:3px 0 4px 12px}
    .indyheatViewToggleBody label{margin:5px 0}
  `;document.head.appendChild(s);
}

/* -------------------------------------------------------------------------
 * 1. Map/Mini-map overlay-opacity visibility.
 * ---------------------------------------------------------------------- */
function auxModeOwnsCanvas(){
  const pane=$('circuitAuxPane');if(!pane||pane.hidden)return false;
  const map=$('circuitMapControls'),mini=$('circuitPreviewControls');
  return !!((map&&!map.hidden)||(mini&&!mini.hidden));
}
function syncOverlayOpacity(){
  const e=$('overlayOpacityControl');if(!e)return false;
  if(auxModeOwnsCanvas()){e.dataset.v0193Hidden='1';e.hidden=true;e.style.display='none';e.setAttribute('aria-hidden','true');}
  else{delete e.dataset.v0193Hidden;e.hidden=false;e.style.display='';e.setAttribute('aria-hidden','false');}
  return true;
}
function installOpacityWatch(){
  const buttons=$('layerModeButtons');
  if(buttons&&!buttons.dataset.v0193Opacity){
    buttons.dataset.v0193Opacity='1';
    buttons.addEventListener('click',()=>{setTimeout(syncOverlayOpacity,0);if(typeof requestAnimationFrame==='function')requestAnimationFrame(syncOverlayOpacity);},true);
  }
  const pane=$('circuitAuxPane');
  if(pane&&!opacityObserver&&typeof MutationObserver!=='undefined'){
    opacityObserver=new MutationObserver(syncOverlayOpacity);
    opacityObserver.observe(pane,{attributes:true,subtree:true,attributeFilter:['hidden','class','style']});
  }
  syncOverlayOpacity();
}

/* -------------------------------------------------------------------------
 * 2. Left-side foldable View groups.
 * ---------------------------------------------------------------------- */
function ensureFold(id,title,anchor,nodes=[]){
  if(!anchor?.parentNode)return null;
  let d=$(id)||anchor.closest('details[data-circuit-fold]');
  if(!d){
    d=document.createElement('details');d.open=true;d.dataset.circuitFold='1';
    const summary=document.createElement('summary');summary.textContent=title;d.appendChild(summary);
    anchor.parentNode.insertBefore(d,anchor);
  }
  d.id=id;d.classList.add('indyheatViewFold');d.dataset.circuitFold='1';
  const summary=d.querySelector(':scope > summary');if(summary)summary.textContent=title;
  for(const n of [anchor,...nodes])if(n?.parentNode&&n.parentNode!==d)d.appendChild(n);
  return d;
}
function mirrorToggle(host,id,label,targetId){
  let box=$(id);if(box)return box;
  const l=document.createElement('label');l.innerHTML=`<input id="${id}" type="checkbox"> ${label}`;box=l.querySelector('input');
  const target=$(targetId);if(target)box.checked=!!target.checked;
  box.addEventListener('change',()=>{const t=$(targetId);if(t){t.checked=box.checked;t.dispatchEvent(new Event('change',{bubbles:true}));}renderHud();});
  host.appendChild(l);return box;
}
function hudToggle(host,id,label){
  let box=$(id);if(box)return box;
  const l=document.createElement('label');l.innerHTML=`<input id="${id}" type="checkbox" checked> ${label}`;box=l.querySelector('input');
  box.addEventListener('change',renderHud);host.appendChild(l);return box;
}
function ensureLeftFolds(){
  const waypoint=$('showWaypoints'),wpLabel=waypoint?.closest('label');
  const oldSurfaceLabel=$('showSurface')?.closest('label');
  const visibleSurface=$('layerShowSurface'),surfaceRow=visibleSurface?.closest('.layerControlRow')||visibleSurface?.parentElement||oldSurfaceLabel;
  const viewSection=surfaceRow?.closest('section')||wpLabel?.closest('section')||oldSurfaceLabel?.closest('section');
  if(!viewSection)return false;

  if(surfaceRow){
    const existing=surfaceRow.closest('details[data-circuit-fold]');
    let surfaceControls=existing?.querySelector('.classToggles')||null;
    if(!surfaceControls&&oldSurfaceLabel){const n=oldSurfaceLabel.nextElementSibling;if(n?.classList?.contains('classToggles'))surfaceControls=n;}
    ensureFold('circuitViewSurface','Surface types',surfaceRow,surfaceControls?[surfaceControls]:[]);
    const sp=surfaceRow.querySelector?.('span');if(sp)sp.textContent='Show overlay';
  }
  if(wpLabel){
    const existing=wpLabel.closest('details[data-circuit-fold]');
    let controls=existing?.querySelector('.classToggles')||null;
    if(!controls){const n=wpLabel.nextElementSibling;if(n?.classList?.contains('classToggles'))controls=n;}
    ensureFold('circuitViewWaypoints','Waypoints',wpLabel,controls?[controls]:[]);
  }

  if(!$('circuitViewPits')&&$('raceShowPits')){
    const d=document.createElement('details');d.id='circuitViewPits';d.open=true;d.dataset.circuitFold='1';d.className='indyheatViewFold';
    d.innerHTML='<summary>Pits</summary><div class="indyheatViewToggleBody"></div>';const h=d.querySelector('div');
    mirrorToggle(h,'circuitShowPits','Pit/service + crew','raceShowPits');
    mirrorToggle(h,'circuitShowBoards','PIT boards','raceShowBoards');
    mirrorToggle(h,'circuitShowPitCars','Cars in pits','raceShowPitCars');
    viewSection.appendChild(d);
  }
  if(!$('circuitViewRaceControl')&&$('raceShowStart')){
    const d=document.createElement('details');d.id='circuitViewRaceControl';d.open=true;d.dataset.circuitFold='1';d.className='indyheatViewFold';
    d.innerHTML='<summary>Race control</summary><div class="indyheatViewToggleBody"></div>';const h=d.querySelector('div');
    mirrorToggle(h,'circuitShowStart','Start / grid anchor','raceShowStart');
    mirrorToggle(h,'circuitShowGridCars','Cars on grid','raceShowGridCars');
    mirrorToggle(h,'circuitShowFlag','Flag man','raceShowFlag');
    hudToggle(h,'circuitShowCurrentLaps','Current-lap tower');
    hudToggle(h,'circuitShowTotalLaps','Total laps');
    hudToggle(h,'circuitShowTimer','Timer');
    viewSection.appendChild(d);
  }
  for(const id of ['circuitViewSurface','circuitViewWaypoints','circuitViewPits','circuitViewRaceControl'])$(id)?.classList.add('indyheatViewFold');
  return !!($('circuitViewSurface')&&$('circuitViewWaypoints')&&$('circuitViewPits')&&$('circuitViewRaceControl'));
}

/* -------------------------------------------------------------------------
 * 3. Race HUD visibility and an always-reachable draggable origin.
 * ---------------------------------------------------------------------- */
function rgb(word){return [((word>>>8)&15)*17,((word>>>4)&15)*17,(word&15)*17];}
function paletteRgb(index){const P=packageTools(),w=P?.PRESENTATION_PALETTE_WORDS?.[index]??0xfff;return rgb(w);}
function drawGameDigit(ctx,digit,x,y,S,colourIndex){
  const rows=packageTools()?.GAME_HUD_DIGITS?.[Number(digit)];if(!rows)return;const c=paletteRgb(colourIndex);ctx.fillStyle=`rgb(${c[0]},${c[1]},${c[2]})`;
  for(let yy=0;yy<7;yy++){const bits=rows[yy];for(let xx=0;xx<6;xx++)if(bits&(1<<(5-xx)))ctx.fillRect((x+xx)*S,(y+yy)*S,Math.max(1,S),Math.max(1,S));}
}
function drawTotalDigit(ctx,digit,x,y,S){
  const rows=packageTools()?.HUD_DIGITS?.[Number(digit)];if(!rows)return;const dark=paletteRgb(5),light=paletteRgb(6);
  for(let yy=0;yy<5;yy++){const dm=rows[yy][0],lm=rows[yy][1];for(let xx=0;xx<3;xx++){const bit=1<<(2-xx),c=(lm&bit)?light:(dm&bit)?dark:null;if(c){ctx.fillStyle=`rgb(${c[0]},${c[1]},${c[2]})`;ctx.fillRect((x+xx)*S,(y+yy)*S,Math.max(1,S),Math.max(1,S));}}}
}
function drawTotal99(ctx,rendererX,rendererY,S){
  const x=rendererX-LAP_TOTAL_ORIGIN.x,y=rendererY-LAP_TOTAL_ORIGIN.y,bg=paletteRgb(1);ctx.fillStyle=`rgb(${bg[0]},${bg[1]},${bg[2]})`;ctx.fillRect(x*S,y*S,9*S,5*S);drawTotalDigit(ctx,9,x+1,y,S);drawTotalDigit(ctx,9,x+5,y,S);
}
function raceActive(){const pane=$('raceSetupPane');return !!(pane&&!pane.hidden&&getComputedStyle(pane).display!=='none');}
function hudCanvas(){return $('editorFixHudCanvas');}
function viewerStack(){return $('view')?.closest('.canvasStack')||$('view')?.parentElement||null;}
function ensureHudCanvas(){
  const stack=viewerStack(),view=$('view');if(!stack||!view)return false;let c=hudCanvas();
  if(!c){c=document.createElement('canvas');c.id='editorFixHudCanvas';c.hidden=true;stack.appendChild(c);}
  if(c.width!==view.width||c.height!==view.height){c.width=view.width;c.height=view.height;c.getContext('2d').imageSmoothingEnabled=false;}
  if(!resizeObserver&&typeof ResizeObserver!=='undefined'){resizeObserver=new ResizeObserver(()=>renderHud());resizeObserver.observe(view);}
  return true;
}
function hudEnabled(id){const e=$(id);return e?!!e.checked:true;}
function hudHandle(p){const ax=Number(p?.lapDisplayX)||0,ay=Number(p?.lapDisplayY)||0,m=8;const x=Math.max(m,Math.min(TRACK_W-m,ax)),y=Math.max(m,Math.min(TRACK_H-m,ay));return {x,y,actualX:ax,actualY:ay,clamped:x!==ax||y!==ay};}
function safeHudAnchor(p){return {x:Math.max(12,Math.min(304,Number(p?.lapDisplayX)||0)),y:Math.max(8,Math.min(198,Number(p?.lapDisplayY)||0))};}
function presentation(){const P=packageTools(),m=primaryModel(),r=recordForModel(m);return P&&m&&r?{P,m,r,p:P.readPresentation(m.main,r.offset)}:null;}
function renderHud(){
  if(!ensureHudCanvas())return;const c=hudCanvas(),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);c.hidden=!raceActive();if(c.hidden)return;
  const q=presentation();if(!q)return;const p=q.p,S=c.width/TRACK_W,alpha=Math.max(.25,Math.min(1,Number($('opacity')?.value||55)/100));ctx.save();ctx.globalAlpha=alpha;
  if(hudEnabled('circuitShowCurrentLaps'))for(let i=0;i<4;i++)drawGameDigit(ctx,i+1,p.lapDisplayX,p.lapDisplayY+HUD_LAYOUT.currentLapRows[i],S,HUD_CAR_COLOURS[i]);
  if(hudEnabled('circuitShowTotalLaps'))drawTotal99(ctx,p.lapDisplayX+HUD_LAYOUT.totalLaps.x,p.lapDisplayY+HUD_LAYOUT.totalLaps.y,S);
  if(hudEnabled('circuitShowTimer'))for(const d of HUD_LAYOUT.timerDigits)drawGameDigit(ctx,0,p.lapDisplayX+d.x,p.lapDisplayY+d.y,S,3);

  const h=hudHandle(p),x=h.x*S,y=h.y*S;ctx.globalAlpha=1;ctx.strokeStyle='#ffd84a';ctx.fillStyle='#ffd84a';ctx.lineWidth=Math.max(1,.7*S);ctx.beginPath();ctx.moveTo(x-5*S,y);ctx.lineTo(x+5*S,y);ctx.moveTo(x,y-5*S);ctx.lineTo(x,y+5*S);ctx.stroke();
  if(h.clamped){ctx.font=`${Math.max(9,Math.round(3.4*S))}px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`;ctx.textBaseline='top';const t=`HUD ${h.actualX},${h.actualY}`,w=ctx.measureText(t).width,tx=Math.max(2,Math.min(c.width-w-2,x+5*S)),ty=Math.max(2,Math.min(c.height-12,y+4*S));ctx.fillText(t,tx,ty);}
  ctx.restore();

  if($('circuitHudX'))$('circuitHudX').value=String(p.lapDisplayX);if($('circuitHudY'))$('circuitHudY').value=String(p.lapDisplayY);
}
function writeHud(x,y){
  const P=packageTools();if(!P)return;for(const m of authoringModels()){const r=recordForModel(m);if(r)P.writePresentation(m.main,r.offset,{lapDisplayX:Math.round(x),lapDisplayY:Math.round(y)});}
  if($('circuitHudX'))$('circuitHudX').value=String(Math.round(x));if($('circuitHudY'))$('circuitHudY').value=String(Math.round(y));renderHud();
}
function ensureHudControls(){
  const pane=$('raceSetupPane');if(!pane)return false;let controls=$('circuitRaceHudControls');
  if(!controls){
    controls=document.createElement('div');controls.id='circuitRaceHudControls';controls.className='toolGroup';controls.innerHTML=`<div class="toolGroupTitle">Race HUD / lap tower</div><div class="circuitAuxGrid"><label>HUD X <input id="circuitHudX" type="number"></label><label>HUD Y <input id="circuitHudY" type="number"></label></div><div class="raceSetupActions"><button id="circuitHudApply" type="button">Apply HUD anchor</button><button id="circuitHudBring" type="button">Bring into view</button></div><div class="muted">The yellow cursor is race+$24/+26: the true top-left of the 1/2/3/4 lap tower. An edge handle remains reachable when the authentic origin is outside the picture.</div>`;
    const grid=pane.querySelector('.raceSetupGrid');pane.insertBefore(controls,grid||pane.firstChild);
  }
  let actions=controls.querySelector('.raceSetupActions');if(!actions){actions=document.createElement('div');actions.className='raceSetupActions';controls.appendChild(actions);}
  let bring=$('circuitHudBring');if(!bring){bring=document.createElement('button');bring.id='circuitHudBring';bring.type='button';bring.textContent='Bring into view';actions.appendChild(bring);}
  const apply=$('circuitHudApply');if(apply&&!apply.dataset.v0193){apply.dataset.v0193='1';apply.addEventListener('click',()=>writeHud(Number($('circuitHudX')?.value||0),Number($('circuitHudY')?.value||0)));}
  if(!bring.dataset.v0193){bring.dataset.v0193='1';bring.addEventListener('click',()=>{const q=presentation();if(!q)return;const p=safeHudAnchor(q.p);writeHud(p.x,p.y);});}
  return true;
}
function canvasPoint(e){const c=$('raceSetupCanvas');if(!c)return null;const r=c.getBoundingClientRect();return {x:(e.clientX-r.left)*TRACK_W/r.width,y:(e.clientY-r.top)*TRACK_H/r.height};}
function installHudPointer(){
  const c=$('raceSetupCanvas');if(!c||c.dataset.v0193HudPointer)return !!c;c.dataset.v0193HudPointer='1';
  c.addEventListener('pointerdown',e=>{if(!raceActive()||e.button!==0)return;const q=canvasPoint(e),p=presentation()?.p;if(!q||!p)return;const h=hudHandle(p),dx=q.x-h.x,dy=q.y-h.y;if(dx*dx+dy*dy>15*15)return;e.preventDefault();e.stopImmediatePropagation();hudDrag={pointerId:e.pointerId};c.setPointerCapture?.(e.pointerId);writeHud(q.x,q.y);},true);
  c.addEventListener('pointermove',e=>{if(!hudDrag||hudDrag.pointerId!==e.pointerId)return;const q=canvasPoint(e);if(!q)return;e.preventDefault();e.stopImmediatePropagation();writeHud(q.x,q.y);},true);
  const end=e=>{if(!hudDrag||hudDrag.pointerId!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();try{c.releasePointerCapture?.(e.pointerId);}catch(_e){}hudDrag=null;renderHud();};
  c.addEventListener('pointerup',end,true);c.addEventListener('pointercancel',end,true);return true;
}

/* -------------------------------------------------------------------------
 * 4. Mini-map: race palette -> Gasoline Alley palette conversion.
 * ---------------------------------------------------------------------- */
function nibbleRgb(word){return [(word>>>8)&15,(word>>>4)&15,word&15];}
function neutral(word){const c=nibbleRgb(word),hi=Math.max(...c),lo=Math.min(...c);return hi-lo<=1;}
function colourDistance(a,b){const A=nibbleRgb(a),B=nibbleRgb(b),dr=A[0]-B[0],dg=A[1]-B[1],db=A[2]-B[2];return dr*dr*3+dg*dg*6+db*db*2;}
function buildPaletteMap(){
  const P=packageTools(),T=indyTools(),src=T?.VERIFIED_TRACK_PALETTE_WORDS,dst=P?.PRESENTATION_PALETTE_WORDS;if(!src||!dst)return null;const out=new Uint8Array(32);
  for(let i=0;i<32;i++){
    let candidates=[];for(let j=1;j<32;j++)if(!neutral(src[i])||neutral(dst[j]))candidates.push(j);if(!candidates.length)for(let j=1;j<32;j++)candidates.push(j);
    let best=candidates[0],bestD=Infinity;for(const j of candidates){const d=colourDistance(src[i],dst[j]);if(d<bestD){bestD=d;best=j;}}out[i]=best;
  }
  return out;
}
function reduceBackdrop(source,map){
  const out=new Uint8Array(PREVIEW_W*PREVIEW_H);
  for(let dy=0;dy<PREVIEW_H;dy++){
    const sy0=Math.floor(dy*TRACK_GAME_H/PREVIEW_H),sy1=Math.max(sy0+1,Math.floor((dy+1)*TRACK_GAME_H/PREVIEW_H));
    for(let dx=0;dx<PREVIEW_W;dx++){
      const sx0=Math.floor(dx*TRACK_W/PREVIEW_W),sx1=Math.max(sx0+1,Math.floor((dx+1)*TRACK_W/PREVIEW_W)),counts=new Uint16Array(32);
      for(let sy=sy0;sy<sy1;sy++)for(let sx=sx0;sx<sx1;sx++)counts[map[source[sy*TRACK_W+sx]&31]]++;
      let best=1,n=-1;for(let i=1;i<32;i++)if(counts[i]>n){n=counts[i];best=i;}out[dy*PREVIEW_W+dx]=best;
    }
  }
  return out;
}
function setMiniStatus(text){const e=$('circuitAuxStatusMini');if(e)e.textContent=text;}
function correctBackdropMiniature(){
  const P=packageTools(),T=indyTools(),model=resourceModel(),record=recordForModel(model),map=buildPaletteMap();if(!P||!T||!model||!record||!map)return;
  try{
    const bg=model.getResource(record.baseResourceId),TB=root.IndyHeatTrackBackdropTools;
    const source=TB?.decodeTrackPlanar?TB.decodeTrackPlanar(bg.data):T.decodePlanar(bg.data,TRACK_W,TRACK_H,5,0);
    const pixels=reduceBackdrop(source,map);
    for(const m of authoringModels()){
      const r=recordForModel(m);if(!r)continue;const q=P.resolvePreviewResource(m,r),encoded=P.encodePreviewPixels(pixels,q.resource.data);q.resource.data.set(encoded);
    }
    setMiniStatus('Miniature rebuilt from the current backdrop and palette-remapped from the race palette to the Gasoline Alley palette.');
    setTimeout(()=>{if($('circuitPreviewControls')&&!$('circuitPreviewControls').hidden)$('layerEditMini')?.click();},0);
  }catch(e){setMiniStatus(`ERROR: ${e.message}`);}
}
function installBackdropFix(){
  const b=$('circuitPreviewFromBackdrop');if(!b||b.dataset.v0193Palette)return !!b;b.dataset.v0193Palette='1';
  // v0.19.2's handler runs first and supplies the package-aware Undo baseline.
  // We then replace its index-for-index colour result with the corrected palette conversion.
  b.addEventListener('click',()=>setTimeout(correctBackdropMiniature,0));backdropFixInstalled=true;return true;
}

function installUiEvents(){
  if(uiEventsInstalled)return;const buttons=$('layerModeButtons');if(!buttons)return;
  uiEventsInstalled=true;
  buttons.addEventListener('click',()=>setTimeout(()=>{setVersionLabel();ensureLeftFolds();ensureHudControls();installHudPointer();syncOverlayOpacity();renderHud();},0));
  $('opacity')?.addEventListener('input',renderHud);$('editorScale')?.addEventListener('input',()=>setTimeout(renderHud,0));
  $('trackSelect')?.addEventListener('change',()=>setTimeout(()=>{ensureLeftFolds();renderHud();},0));
  document.addEventListener('indyheat-race-setup-capture',()=>setTimeout(()=>{ensureLeftFolds();ensureHudControls();installHudPointer();renderHud();},0));
}

function tick(){
  document.body?.setAttribute('data-indyheat-v0193-fix','1');installStyle();setVersionLabel();installUiEvents();installOpacityWatch();ensureLeftFolds();ensureHudCanvas();ensureHudControls();installHudPointer();installBackdropFix();renderHud();
  return !!(packageTools()&&indyTools()&&$('circuitPreviewFromBackdrop')&&$('raceSetupPane')&&$('circuitViewSurface')&&$('circuitViewWaypoints')&&$('circuitViewPits')&&$('circuitViewRaceControl'));
}
function boot(){let tries=0;tick();const timer=setInterval(()=>{tries++;const ready=tick();if(ready||tries>300)clearInterval(timer);},50);setTimeout(tick,1000);setTimeout(tick,2500);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});else setTimeout(boot,0);

})(typeof globalThis!=='undefined'?globalThis:this);
