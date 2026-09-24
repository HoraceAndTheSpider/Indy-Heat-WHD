(function(root){
'use strict';

/* Indy Heat authentic race-graphics overlay. */

const VERSION=String(root.INDY_HEAT_EDITOR_VERSION||'');
const RESOURCE_IDS=Object.freeze([0x38,0x05,0x08,0x0F]);
const FPS=12;
const PLAYER_MAPPING=Object.freeze([
  Object.freeze({index:0,player:'P1',colour:'Red',familyIndex:0,carColourIndex:0,css:'#ef4a43'}),
  Object.freeze({index:1,player:'P2',colour:'Grey/white',familyIndex:1,carColourIndex:1,css:'#d7d7d7'}),
  Object.freeze({index:2,player:'P3',colour:'Yellow',familyIndex:2,carColourIndex:2,css:'#e1c44b'}),
  Object.freeze({index:3,player:'P4',colour:'Blue',familyIndex:3,carColourIndex:3,css:'#7388ff'})
]);

const api={VERSION,RESOURCE_IDS,PLAYER_MAPPING};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.IndyHeatRaceGraphicsInspector=api;

function syncVersion(){
  if(typeof root.IndyHeatSyncEditorIdentity==='function')root.IndyHeatSyncEditorIdentity();
}
syncVersion();
if(typeof document==='undefined')return;

const $=id=>document.getElementById(id);
let graphics=null,attachedModel=null,imageCache=new Map(),overlay=null,retryTimer=0;
let pitsPlaying=false,racePlaying=false,pitsFrame=0,raceFrame=-1,raf=0,lastTick=0,overlayRefreshRaf=0;

function deps(){return {T:root.IndyHeatTools,G:root.IndyHeatRaceGraphics,R:root.IndyHeatRaceSetupTools,C:root.IndyHeatRaceSetupCapture};}
function playerInfo(index){return PLAYER_MAPPING[Math.max(0,Math.min(3,Number(index)|0))];}
function currentRecord(){
  const {T,C}=deps();if(!T||!C?.model)return null;
  for(const r of C.records||[])if(r.baseResourceId==null&&typeof T.raceBaseResourceId==='function')r.baseResourceId=T.raceBaseResourceId(r,C.model.resourceTableOffset+0x1000);
  const ti=Number($('trackSelect')?.value||0),base=T.TRACK_BASE_IDS?.[ti];
  return (C.records||[]).find(r=>r.baseResourceId===base)||null;
}
function currentSetup(){const {R,C}=deps(),r=currentRecord();if(!R||!C?.model||!r)return null;try{return R.parseRaceSetup(C.model.main,r);}catch(_){return null;}}
function overlaysVisible(){
  const pane=$('raceSetupPane'),button=$('layerEditRaceSetup');
  return !!((pane&&!pane.hidden&&button?.classList.contains('active'))||root.IndyHeatRaceOverlayOverride===true);
}
function ensureGraphics(){
  const {G,C}=deps();if(!G||!C?.model)return false;
  if(graphics&&attachedModel===C.model)return true;
  try{graphics=G.attach(C.model,{resourceIds:RESOURCE_IDS});attachedModel=C.model;imageCache=new Map();return true;}
  catch(_){graphics=null;attachedModel=null;return false;}
}
function spriteCanvas(id,index,playerIndex=0){
  if(!ensureGraphics())return null;
  const p=playerInfo(playerIndex),key=`${id}:${index}:${id===0x38?p.carColourIndex:'-'}`;
  if(imageCache.has(key))return imageCache.get(key);
  const rendered=graphics.renderFrame(id,index,id===0x38?{carColourIndex:p.carColourIndex}:{}),frame=graphics.getFrame(id,index);
  if(!rendered||!frame)return null;
  const c=document.createElement('canvas');c.width=rendered.width;c.height=rendered.height;
  const x=c.getContext('2d'),im=x.createImageData(rendered.width,rendered.height);im.data.set(rendered.rgba);x.putImageData(im,0,0);
  const value={canvas:c,frame};imageCache.set(key,value);return value;
}

function ensureOverlay(){
  if(overlay?.isConnected)return overlay;
  const view=$('view');if(!view)return null;const stack=view.closest('.canvasStack')||view.parentElement;if(!stack)return null;
  overlay=document.createElement('canvas');overlay.id='raceGraphicsInspectorCanvas';
  Object.assign(overlay.style,{position:'absolute',inset:'0',zIndex:'3',pointerEvents:'none',imageRendering:'pixelated'});
  stack.appendChild(overlay);return overlay;
}
function syncOverlay(){const c=ensureOverlay(),view=$('view');if(!c||!view)return null;if(c.width!==view.width||c.height!==view.height){c.width=view.width;c.height=view.height;}return c;}
function suppressLegacyRaceVisuals(){
  const c=$('raceSetupCanvas');if(c)c.style.opacity='0';
  const old=$('raceGraphicsInspector');if(old)old.remove();
  $('raceGraphicsInspectorStyle')?.remove();
}
function checked(id,fallback=false){const e=$(id);return e?!!e.checked:fallback;}
function pitPlayerMask(){const e=$('raceGraphicsPitPlayerMask');const v=e?Number(e.value):Number(root.IndyHeatPitPlayerMask??15);return Math.max(0,Math.min(15,Number.isFinite(v)?Math.round(v):15));}
function pitPlayerVisible(index){return !!(pitPlayerMask()&(1<<(Number(index)|0)));}
function sectionState(prefix){return {graphics:checked(`raceGraphics${prefix}Graphics`,true),cursors:checked(`raceGraphics${prefix}Cursors`,false),labels:checked(`raceGraphics${prefix}Labels`,false)};}

function label(ctx,text,x,y,S,colour='#fff'){
  ctx.save();ctx.font=`600 ${Math.max(9,Math.round(3.6*S))}px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`;ctx.textBaseline='top';
  const w=ctx.measureText(text).width;ctx.fillStyle='rgba(0,0,0,.78)';ctx.fillRect(x-2*S,y-1*S,w+4*S,Math.max(10,5*S));ctx.fillStyle=colour;ctx.fillText(text,x,y);ctx.restore();
}
function cursor(ctx,x,y,S,colour='#ffd84a'){
  if(!Number.isFinite(x)||!Number.isFinite(y))return;const px=x*S,py=y*S;
  ctx.save();ctx.lineWidth=Math.max(1.5,.7*S);ctx.strokeStyle=colour;ctx.fillStyle='rgba(0,0,0,.65)';ctx.beginPath();ctx.arc(px,py,3.2*S,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(px-5*S,py);ctx.lineTo(px+5*S,py);ctx.moveTo(px,py-5*S);ctx.lineTo(px,py+5*S);ctx.stroke();ctx.restore();
}
function sprite(ctx,id,index,x,y,S,playerIndex=0){
  if(!Number.isFinite(x)||!Number.isFinite(y))return;const img=spriteCanvas(id,index,playerIndex);if(!img)return;
  const {canvas,frame}=img;ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(canvas,(x-frame.xOrigin)*S,(y-frame.yOrigin)*S,canvas.width*S,canvas.height*S);ctx.restore();
}
function drawCursorLabel(ctx,state,x,y,S,text,colour='#fff'){
  if(state.cursors)cursor(ctx,x,y,S);if(state.labels)label(ctx,text,(x+5)*S,(y-7)*S,S,colour);
}
function drawLabelOnly(ctx,state,x,y,S,text,colour='#fff'){if(state.labels)label(ctx,text,(x+5)*S,(y-7)*S,S,colour);}
function pitCrewFrame(pit,playerIndex){const side=Number(pit?.slotWord)===1?'normal1':'normal0';return graphics.pitCrewFrameIndex(playerIndex,side,pitsFrame%32);}
function pitBoardFrame(playerIndex){return graphics.pitBoardFrameIndex(playerIndex,checked('raceGraphicsPitBoardFemale',false)?'female':'male',pitsFrame%8);}
function carFrame(heading16,screenY){return graphics.carNormalFrameFromHeading(heading16,screenY);}

function drawOverlay(){
  suppressLegacyRaceVisuals();const c=syncOverlay();if(!c)return;const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);
  if(!overlaysVisible()||!ensureGraphics())return;
  const {R}=deps(),s=currentSetup(),record=currentRecord();if(!R||!s)return;
  const S=c.width/320,alpha=Math.max(.25,Math.min(1,Number($('opacity')?.value||55)/100));ctx.globalAlpha=alpha;
  const pits=sectionState('Pits'),race=sectionState('Race');

  if(checked('raceShowStart')||checked('circuitShowStart')){
    const q=R.projectFixedXZ(s.startX,s.startY);if(q)drawCursorLabel(ctx,race,q.x,q.y,S,'START GRID');
  }

  if(checked('raceShowGridCars')||checked('circuitShowGridCars')){
    for(const car of R.gridCarPositions(s)){
      const q=R.projectFixedXZ(car.x,car.y);if(!q)continue;const p=playerInfo(car.index);
      if(race.graphics)sprite(ctx,0x38,carFrame(car.heading16,q.y),q.x,q.y,S,car.index);
      drawLabelOnly(ctx,race,q.x,q.y,S,`${p.player} CAR`,p.css);
    }
  }

  for(const pit of s.pits){
    if(!pitPlayerVisible(pit.index))continue;
    const p=playerInfo(pit.index);
    const showPits=checked('raceShowPits')||checked('circuitShowPits');
    const showPitCars=checked('raceShowPitCars')||checked('circuitShowPitCars');
    let serviceQ=(showPits||showPitCars)?R.projectFixedXZ(pit.serviceX,pit.serviceY):null;

    // Authentic draw order: car first, then pit crew. This guarantees the
    // retail crew artwork always appears in front of a car occupying the pit.
    if(showPitCars&&serviceQ&&pits.graphics){
      const h=R.pitHeadingFromRoute(record,pit),heading=h==null?(s.startOrient&0xffff):h;
      sprite(ctx,0x38,carFrame(heading,serviceQ.y),serviceQ.x,serviceQ.y,S,pit.index);
    }

    if(showPits){
      if(serviceQ)drawCursorLabel(ctx,pits,serviceQ.x,serviceQ.y,S,`${p.player} STOP`,p.css);
      if(pit.screenX>=0&&pit.screenX<320&&pit.screenY>=0&&pit.screenY<256){
        if(pits.graphics)sprite(ctx,0x05,pitCrewFrame(pit,pit.index),pit.screenX,pit.screenY,S,pit.index);
        drawCursorLabel(ctx,pits,pit.screenX,pit.screenY,S,`${p.player} CREW`,p.css);
      }
    }
    if(showPitCars&&serviceQ)drawCursorLabel(ctx,pits,serviceQ.x,serviceQ.y,S,`${p.player} CAR`,p.css);

    if(checked('raceShowBoards')||checked('circuitShowBoards')){
      const q=R.projectFixedXZ(pit.boardX,pit.boardY);if(q){
        if(pits.graphics)sprite(ctx,0x08,pitBoardFrame(pit.index),q.x,q.y,S,pit.index);
        drawCursorLabel(ctx,pits,q.x,q.y,S,`${p.player} PIT`,p.css);
      }
    }
  }

  if((checked('raceShowFlag')||checked('circuitShowFlag'))&&s.flagX>=0&&s.flagX<320&&s.flagY>=0&&s.flagY<256){
    const fi=raceFrame<0?26:raceFrame;if(race.graphics)sprite(ctx,0x0F,fi,s.flagX,s.flagY,S,0);drawCursorLabel(ctx,race,s.flagX,s.flagY,S,'FLAG');
  }
  ctx.globalAlpha=1;
}

function updatePlayButtons(){const p=$('raceGraphicsPitsPlay'),r=$('raceGraphicsRacePlay');if(p)p.textContent=pitsPlaying?'Pause':'Play';if(r)r.textContent=racePlaying?'Pause':'Play';}
function resetPits(){pitsPlaying=false;pitsFrame=0;updatePlayButtons();scheduleOverlayRefresh();}
function resetRace(){racePlaying=false;raceFrame=0;updatePlayButtons();scheduleOverlayRefresh();}
function togglePits(){pitsPlaying=!pitsPlaying;if(pitsPlaying&&pitsFrame>=31)pitsFrame=0;updatePlayButtons();startAnimation();scheduleOverlayRefresh();}
function toggleRace(){racePlaying=!racePlaying;if(pitsPlaying===false&&racePlaying&&(raceFrame<0||raceFrame>=35))raceFrame=0;updatePlayButtons();startAnimation();scheduleOverlayRefresh();}
function startAnimation(){if((pitsPlaying||racePlaying)&&!raf){lastTick=0;raf=requestAnimationFrame(animationTick);}}
function animationTick(ts){
  raf=0;if(!pitsPlaying&&!racePlaying)return;if(!lastTick)lastTick=ts;
  const interval=1000/FPS;
  if(ts-lastTick>=interval){
    lastTick=ts;
    if(pitsPlaying){pitsFrame++;if(pitsFrame>31){if(checked('raceGraphicsPitsLoop',true))pitsFrame=0;else{pitsPlaying=false;pitsFrame=31;}}}
    if(racePlaying){raceFrame++;if(raceFrame>35){if(checked('raceGraphicsRaceLoop',true))raceFrame=0;else{racePlaying=false;raceFrame=35;}}}
    updatePlayButtons();drawOverlay();
  }
  if(pitsPlaying||racePlaying)raf=requestAnimationFrame(animationTick);
}

function syncPitPlayerMaskOutput(){const input=$('raceGraphicsPitPlayerMask'),out=$('raceGraphicsPitPlayerMaskValue');if(!input)return;const v=Math.max(0,Math.min(15,Number(input.value)|0));root.IndyHeatPitPlayerMask=v;if(out)out.textContent=`${v} · %${v.toString(2).padStart(4,'0')}`;}
function makePitPlayerMask(){const row=document.createElement('label');row.className='raceGraphicsPlayerMask';row.innerHTML='<span>Players</span><input id="raceGraphicsPitPlayerMask" type="range" min="0" max="15" step="1" value="15" title="Bit mask: 1=P1, 2=P2, 4=P3, 8=P4"><output id="raceGraphicsPitPlayerMaskValue">15 · %1111</output>';const input=row.querySelector('input');input.addEventListener('input',()=>{syncPitPlayerMaskOutput();drawOverlay();});return row;}
function makeCheck(id,label,checkedByDefault){const l=document.createElement('label');l.className='raceGraphicsViewCheck';l.innerHTML=`<input id="${id}" type="checkbox"${checkedByDefault?' checked':''}> ${label}`;l.querySelector('input').addEventListener('change',drawOverlay);return l;}
function makeSectionControls(host,prefix){
  const wrap=document.createElement('div');wrap.className='raceGraphicsViewOptions';wrap.dataset.raceGraphicsSection=prefix;
  wrap.append(makeCheck(`raceGraphics${prefix}Graphics`,'Graphics',true),makeCheck(`raceGraphics${prefix}Cursors`,'Cursors',false),makeCheck(`raceGraphics${prefix}Labels`,'Labels',false));
  if(prefix==='Pits'){
    wrap.appendChild(makePitPlayerMask());syncPitPlayerMaskOutput();
    const female=makeCheck('raceGraphicsPitBoardFemale','Female PIT-board attendant',false);
    female.querySelector('input').addEventListener('change',drawOverlay);wrap.appendChild(female);
  }
  const row=document.createElement('div');row.className='raceGraphicsPlaybackRow';const play=document.createElement('button');play.type='button';play.id=`raceGraphics${prefix}Play`;play.textContent='Play';
  const reset=document.createElement('button');reset.type='button';reset.id=`raceGraphics${prefix}Reset`;reset.textContent='Reset';
  const loop=makeCheck(`raceGraphics${prefix}Loop`,'Loop',true);play.addEventListener('click',prefix==='Pits'?togglePits:toggleRace);reset.addEventListener('click',prefix==='Pits'?resetPits:resetRace);row.append(play,reset,loop);wrap.appendChild(row);host.appendChild(wrap);
}
function scheduleOverlayRefresh(){
  if(overlayRefreshRaf)return;
  overlayRefreshRaf=requestAnimationFrame(()=>{overlayRefreshRaf=0;syncPitSideButton();drawOverlay();});
}
function decoratePitSlots(){
  const select=$('racePitSlot');if(!select)return false;
  PLAYER_MAPPING.forEach((p,i)=>{const o=select.options?.[i];if(o)o.textContent=`Pit ${i+1} · ${p.colour}`;});
  return true;
}
function syncPitSideButton(){
  const input=$('raceSlotWord'),button=$('racePitSideToggle');if(!input||!button)return;
  const side=Number(input.value)===1?1:0;button.dataset.side=String(side);button.textContent=`Side ${side}`;button.setAttribute('aria-pressed',side===1?'true':'false');
}
function installPitSideToggle(){
  const input=$('raceSlotWord');if(!input)return false;
  let button=$('racePitSideToggle');
  if(!button){
    button=document.createElement('button');button.type='button';button.id='racePitSideToggle';button.className='racePitSideToggle';
    button.addEventListener('click',()=>{
      const next=Number(input.value)===1?0:1;input.value=String(next);syncPitSideButton();
      $('raceApply')?.click();scheduleOverlayRefresh();
    });
    input.insertAdjacentElement('afterend',button);input.hidden=true;
  }
  syncPitSideButton();return true;
}
function enhancePitEditor(){decoratePitSlots();installPitSideToggle();}

function injectViewControls(){
  if($('raceGraphicsPitsGraphics')&&$('raceGraphicsRaceGraphics'))return true;
  const pits=$('circuitViewPits'),race=$('circuitViewRaceControl');if(!pits||!race)return false;
  const ph=pits.querySelector('.circuitViewToggleBody')||pits.querySelector('div'),rh=race.querySelector('.circuitViewToggleBody')||race.querySelector('div');if(!ph||!rh)return false;
  if(!$('raceGraphicsPitsGraphics'))makeSectionControls(ph,'Pits');
  if(!$('raceGraphicsRaceGraphics'))makeSectionControls(rh,'Race');
  if(!$('raceGraphicsViewStyle')){const style=document.createElement('style');style.id='raceGraphicsViewStyle';style.textContent=`
    .raceGraphicsViewOptions{margin:7px 0 3px;padding:6px 0 0 12px;border-top:1px solid #30343d}.raceGraphicsViewOptions>label{display:block;margin:4px 0}.raceGraphicsPlayerMask{display:grid!important;grid-template-columns:48px minmax(0,1fr) 72px;gap:6px;align-items:center}.raceGraphicsPlayerMask input{width:100%}.raceGraphicsPlayerMask output{text-align:right;font:10px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:nowrap}.raceGraphicsPlaybackRow{display:flex;gap:8px;align-items:center;margin:6px 0 2px}.raceGraphicsPlaybackRow button{padding:4px 9px;font-size:11px}.raceGraphicsPlaybackRow label{margin:0}.racePitSideToggle{width:100%;padding:6px 9px;font-size:11px}`;document.head.appendChild(style);}
  enhancePitEditor();updatePlayButtons();suppressLegacyRaceVisuals();ensureOverlay();drawOverlay();return true;
}

function installListeners(){
  if(document.documentElement.dataset.raceGraphicsOverlay108)return;document.documentElement.dataset.raceGraphicsOverlay108='1';
  const watched=new Set(['raceShowStart','raceShowPits','raceShowBoards','raceShowFlag','raceShowGridCars','raceShowPitCars','circuitShowStart','circuitShowPits','circuitShowBoards','circuitShowFlag','circuitShowGridCars','circuitShowPitCars']);
  const pitFields=new Set(['racePitSlot','raceServiceX','raceServiceY','raceBoardX','raceBoardY','raceScreenX','raceScreenY','raceSlotWord']);
  document.addEventListener('change',e=>{
    const id=e.target?.id;if(watched.has(id)){setTimeout(drawOverlay,0);return;}
    if(pitFields.has(id)){setTimeout(()=>{enhancePitEditor();scheduleOverlayRefresh();},0);}
  });
  document.addEventListener('input',e=>{if(pitFields.has(e.target?.id))setTimeout(scheduleOverlayRefresh,0);});
  document.addEventListener('pointermove',e=>{if(e.target?.id==='raceSetupCanvas')setTimeout(scheduleOverlayRefresh,0);});
  document.addEventListener('pointerup',e=>{if(e.target?.id==='raceSetupCanvas')setTimeout(scheduleOverlayRefresh,0);});
  document.addEventListener('click',e=>{if(e.target?.id==='raceApply'||e.target?.id==='raceRevert')setTimeout(()=>{enhancePitEditor();scheduleOverlayRefresh();},0);});
  $('trackSelect')?.addEventListener('change',()=>setTimeout(()=>{enhancePitEditor();scheduleOverlayRefresh();},0));$('opacity')?.addEventListener('input',drawOverlay);$('layerModeButtons')?.addEventListener('click',()=>setTimeout(drawOverlay,0));
  document.addEventListener('indyheat-race-setup-capture',()=>setTimeout(()=>{graphics=null;attachedModel=null;imageCache.clear();ensureGraphics();enhancePitEditor();drawOverlay();},0));
  window.addEventListener('blur',()=>{pitsPlaying=false;racePlaying=false;updatePlayButtons();});
  if(typeof ResizeObserver!=='undefined'){const view=$('view');if(view)new ResizeObserver(drawOverlay).observe(view);}
}
function boot(){
  syncVersion();setTimeout(syncVersion,0);setTimeout(syncVersion,250);setTimeout(syncVersion,1000);setTimeout(syncVersion,3000);installListeners();
  if(injectViewControls()){enhancePitEditor();return;}let tries=0;retryTimer=setInterval(()=>{tries++;syncVersion();if(injectViewControls()||tries>400){clearInterval(retryTimer);retryTimer=0;enhancePitEditor();}},50);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});else setTimeout(boot,0);

})(typeof globalThis!=='undefined'?globalThis:this);
