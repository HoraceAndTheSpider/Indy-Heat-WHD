(function(){
'use strict';
const R=globalThis.IndyHeatRecoveryTools;
const C=globalThis.IndyHeatRecoveryCapture;
if(!R||!C)return;
const $=id=>document.getElementById(id);
const view=$('view'),buttons=$('layerModeButtons'),column=$('layerEditorColumn');
if(!view||!buttons||!column)return;

const GRID_W=40,GRID_H=28,CELL=8,GAME_W=320,GAME_H=224;
const HOLD_DELAY=300,HOLD_REPEAT=85;

const style=document.createElement('style');
style.textContent=`
  #layerModeButtons{grid-template-columns:repeat(4,1fr)!important}
  #layerEditRecovery.active{border-color:#d6b54a;background:#5a4a1c}
  #recoveryEditorPane{margin-top:0;padding-top:0}
  #recoveryEditorPane[hidden]{display:none}
  .recoveryRow{margin:0 0 10px;font-size:12px}
  .recoveryRow label{display:block;margin:0 0 5px}
  .recoveryActions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:7px 0}
  .recoveryActions button{font-size:11px;padding:6px}
  #recoveryGrabGroup.active{border-color:#d6b54a;background:#5a4a1c;box-shadow:inset 0 0 0 1px #d6b54a}
  #recoveryStep{width:100%;margin-top:4px}
  #recoveryStatus{font-size:11px;line-height:1.4;min-height:54px;margin-top:8px}
  #recoveryEditCanvas{position:absolute;inset:0;z-index:2;display:block;image-rendering:pixelated;touch-action:none;user-select:none;pointer-events:none}
  #recoveryEditCanvas.editing{pointer-events:auto;cursor:crosshair}
`;
document.head.appendChild(style);

const mode=document.createElement('button');
mode.id='layerEditRecovery';mode.type='button';mode.textContent='Recovery';
buttons.appendChild(mode);

const pane=document.createElement('div');
pane.id='recoveryEditorPane';pane.hidden=true;
pane.innerHTML=`
  <div class="toolGroup">
    <div class="toolGroupTitle">Collision recovery directions</div>
    <div class="recoveryRow muted">One byte per 8×8 gameplay cell. Full-strength arrows intersect Surface class 1 (Edge / collision); other stored arrows can be retained as a faint editing reference.</div>
    <div class="recoveryRow"><label><input id="recoveryShowDormant" type="checkbox" checked> Show non-active arrows faintly</label></div>
    <div class="recoveryRow"><label><input id="recoveryShowGrid" type="checkbox"> Show 8×8 recovery-cell grid</label></div>
    <div class="recoveryRow"><label>Rotation step
      <select id="recoveryStep">
        <option value="1">1 raw step · 1.40625°</option>
        <option value="4">4 raw steps · 5.625°</option>
        <option value="8" selected>8 raw steps · 11.25°</option>
        <option value="16">16 raw steps · 22.5°</option>
        <option value="32">32 raw steps · 45°</option>
        <option value="64">64 raw steps · 90°</option>
      </select></label></div>
    <div class="recoveryActions">
      <button id="recoveryGrabGroup" type="button" title="Toggle group selection mode">☝ Grab group</button>
      <button id="recoveryClearGroup" type="button">Clear group</button>
    </div>
    <div class="recoveryActions">
      <button id="recoveryRotateLeft" type="button">↺ Rotate left</button>
      <button id="recoveryRotateRight" type="button">↻ Rotate right</button>
    </div>
    <div class="recoveryActions">
      <button id="recoveryUndo" type="button">Undo</button>
      <button id="recoveryRevert" type="button">Revert +3</button>
    </div>
    <div id="recoveryStatus" class="muted">Recovery data is loading.</div>
  </div>`;
const drawing=$('layerDrawingPane'),waypointHost=$('layerWaypointHost');
column.insertBefore(pane,drawing||waypointHost||null);

const stack=view.closest('.canvasStack')||view.parentElement;
const canvas=document.createElement('canvas');canvas.id='recoveryEditCanvas';stack.appendChild(canvas);
const ctx=canvas.getContext('2d',{alpha:true});
let active=false,grabGroup=false,pointerGesture=null;
const selectedGroup=new Set();
const states=new Map();

function currentTrack(){return Number($('trackSelect')?.value||0);}
function key(){return `${C.generation}:${currentTrack()}`;}
function captures(type){return C[type].filter(c=>c.generation===C.generation&&c.epoch===C.epoch&&c.trackIndex===currentTrack());}
function latest(type){const a=captures(type);return a.length?a[a.length-1]:null;}
function surfaceCapture(){
  const a=captures('surface');if(!a.length)return null;
  for(let i=a.length-1;i>=0;i--){
    const c=a[i],now=c.result.cells,old=c.initialCells;
    let dirty=false;for(let j=0;j<now.length;j++){if(now[j]!==old[j]){dirty=true;break;}}
    if(dirty)return c;
  }
  return a[a.length-1];
}
function trackState(){
  const h=latest('heading');if(!h)return null;
  const k=key();let s=states.get(k);
  if(!s){s={original:h.result.values.slice(),history:[]};states.set(k,s);}
  return s;
}
function values(){return latest('heading')?.result.values||null;}
function isDirty(){
  const s=trackState(),v=values();if(!s||!v)return false;
  for(let i=0;i<v.length;i++)if(v[i]!==s.original[i])return true;
  return false;
}
function selectionIndices(){return Array.from(selectedGroup).sort((a,b)=>a-b);}
function setGrabGroup(on){
  finishPointerGesture(null,true);
  grabGroup=!!on;
  const b=$('recoveryGrabGroup');if(b)b.classList.toggle('active',grabGroup);
  draw();
}
function clearGroup(){
  finishPointerGesture(null,true);
  selectedGroup.clear();
  setGrabGroup(false);
  setStatus(`Recovery group cleared. Left/right click now edits one recovery cell at a time.${isDirty()?' · Modified':''}`);
}
function applyRaw(index,value){
  for(const c of captures('heading')){
    c.result.values[index]=value;
    c.data[c.offset+index]=value;
  }
}
function pushHistory(indices,before){
  const s=trackState();if(!s||!indices.length)return;
  s.history.push({indices:indices.slice(),before:before.slice()});
  if(s.history.length>100)s.history.shift();
}
function applyDelta(indices,delta,label){
  const v=values(),s=trackState();if(!v||!s||!indices.length)return;
  const unique=Array.from(new Set(indices)).filter(i=>i>=0&&i<GRID_W*GRID_H);
  const before=unique.map(i=>v[i]);
  unique.forEach((i,n)=>applyRaw(i,R.rotateValue(before[n],delta)));
  pushHistory(unique,before);
  updateStats();draw();setStatus(`${label}: ${unique.length} recovery ${unique.length===1?'cell':'cells'} changed.${isDirty()?' · Modified':''}`);
}
function undo(){
  finishPointerGesture(null,true);
  const s=trackState();if(!s||!s.history.length){setStatus('Nothing to undo in the Recovery layer.');return;}
  const op=s.history.pop();op.indices.forEach((i,n)=>applyRaw(i,op.before[n]));
  updateStats();draw();setStatus(`Undo: restored ${op.indices.length} recovery ${op.indices.length===1?'cell':'cells'}.${isDirty()?' · Modified':''}`);
}
function revert(){
  finishPointerGesture(null,true);
  const s=trackState();if(!s)return;
  s.original.forEach((v,i)=>applyRaw(i,v));s.history.length=0;selectedGroup.clear();grabGroup=false;$('recoveryGrabGroup')?.classList.remove('active');
  updateStats();draw();setStatus('Recovery +3 restored to the loaded resource.');
}
function updateStats(){
  const v=values();if(!v)return;
  let min=255,max=0,sum=0;const unique=new Set();
  for(const n of v){min=Math.min(min,n);max=Math.max(max,n);sum+=n;unique.add(n);}
  const el=$('headingStats');if(el)el.textContent=`grid: 40 × 28\ncell: 8 × 8 px\nbytes: ${v.length}\nrange: ${min}–${max}\nunique: ${unique.size}\nmean: ${(sum/v.length).toFixed(1)}\nangle: 256 steps / turn`;
}
function setStatus(msg){$('recoveryStatus').textContent=msg;}
function syncSize(){
  if(canvas.width!==view.width||canvas.height!==view.height){canvas.width=view.width;canvas.height=view.height;ctx.imageSmoothingEnabled=false;}
}
function arrow(cx,cy,v,alpha,scale,selected){
  const d=R.screenVector(v),len=5.5*scale,ex=cx+d.x*len,ey=cy+d.y*len,a=Math.atan2(d.y,d.x),head=2.4*scale,aa=.62;
  ctx.globalAlpha=alpha;ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(ex,ey);ctx.moveTo(ex,ey);ctx.lineTo(ex-Math.cos(a-aa)*head,ey-Math.sin(a-aa)*head);ctx.moveTo(ex,ey);ctx.lineTo(ex-Math.cos(a+aa)*head,ey-Math.sin(a+aa)*head);
  ctx.strokeStyle='rgba(0,0,0,.92)';ctx.lineWidth=Math.max(2.6,1.3*scale);ctx.stroke();
  ctx.strokeStyle=selected?'rgba(255,220,90,.98)':'rgba(255,255,255,.96)';ctx.lineWidth=Math.max(1.2,.58*scale);ctx.stroke();
}
function drawGrid(scale,overlayAlpha){
  if(!$('recoveryShowGrid')?.checked)return;
  ctx.save();
  ctx.globalAlpha=Math.max(.18,Math.min(.55,overlayAlpha*.48));
  ctx.strokeStyle='rgba(110,210,255,.9)';
  ctx.lineWidth=Math.max(.65,.55*scale);
  ctx.beginPath();
  for(let gx=0;gx<=GRID_W;gx++){
    const x=gx*CELL*scale;
    ctx.moveTo(x,0);ctx.lineTo(x,GAME_H*scale);
  }
  for(let gy=0;gy<=GRID_H;gy++){
    const y=gy*CELL*scale;
    ctx.moveTo(0,y);ctx.lineTo(GAME_W*scale,y);
  }
  ctx.stroke();
  ctx.restore();
}
function marqueeIndices(gesture,surface){
  if(!gesture||gesture.kind!=='marquee')return [];
  let list=R.rectIndices(gesture.startCell.gx,gesture.startCell.gy,gesture.currentCell.gx,gesture.currentCell.gy,GRID_W,GRID_H);
  if(!$('recoveryShowDormant')?.checked&&surface){
    list=list.filter(i=>{
      const gx=i%GRID_W,gy=Math.floor(i/GRID_W);
      return R.cellIntersectsSurfaceClass(surface.result.cells,gx,gy,1,surface.result.width,surface.result.height);
    });
  }
  return list;
}
function drawMarquee(scale){
  const g=pointerGesture;if(!g||g.kind!=='marquee')return;
  const x0=Math.min(g.startCell.gx,g.currentCell.gx)*CELL*scale;
  const y0=Math.min(g.startCell.gy,g.currentCell.gy)*CELL*scale;
  const x1=(Math.max(g.startCell.gx,g.currentCell.gx)+1)*CELL*scale;
  const y1=(Math.max(g.startCell.gy,g.currentCell.gy)+1)*CELL*scale;
  ctx.save();
  ctx.globalAlpha=1;
  ctx.fillStyle='rgba(255,220,90,.10)';ctx.fillRect(x0,y0,x1-x0,y1-y0);
  ctx.strokeStyle='rgba(255,220,90,.95)';ctx.lineWidth=Math.max(1,scale);ctx.setLineDash([4*scale,3*scale]);
  ctx.strokeRect(x0+.5*scale,y0+.5*scale,Math.max(0,x1-x0-scale),Math.max(0,y1-y0-scale));
  ctx.restore();
}
function draw(){
  syncSize();ctx.clearRect(0,0,canvas.width,canvas.height);if(!active)return;
  const h=latest('heading'),s=surfaceCapture();if(!h||!s){setStatus('Recovery data is still loading.');return;}
  const S=canvas.width/GAME_W,showDormant=$('recoveryShowDormant').checked,v=h.result.values;
  const overlayAlpha=Math.max(.1,Math.min(1,Number($('opacity')?.value||55)/100));
  drawGrid(S,overlayAlpha);
  const selectedSet=new Set(selectionIndices());
  if(pointerGesture?.kind==='marquee')for(const i of marqueeIndices(pointerGesture,s))selectedSet.add(i);
  let activeCount=0,dormantCount=0;
  for(let gy=0;gy<GRID_H;gy++)for(let gx=0;gx<GRID_W;gx++){
    const i=gy*GRID_W+gx,relevant=R.cellIntersectsSurfaceClass(s.result.cells,gx,gy,1,s.result.width,s.result.height);
    if(relevant)activeCount++;else dormantCount++;
    if(!relevant&&!showDormant)continue;
    arrow((gx*CELL+CELL/2)*S,(gy*CELL+CELL/2)*S,v[i],relevant?overlayAlpha:overlayAlpha*.22,S,selectedSet.has(i));
  }
  drawMarquee(S);
  ctx.globalAlpha=1;
  const sel=selectionIndices();
  if(pointerGesture?.kind==='rotate'){
    setStatus(`Recovery +3 · ${pointerGesture.label} · hold to continue · ${pointerGesture.steps} ${pointerGesture.steps===1?'step':'steps'} applied to ${pointerGesture.indices.length} ${pointerGesture.indices.length===1?'cell':'cells'}. Release to finish.${isDirty()?' · Modified':''}`);
  }else if(grabGroup){
    const drag=pointerGesture?.kind==='marquee'?' · drag-selecting':'';
    setStatus(`Recovery +3 · Grab group active${drag} · ${sel.length} selected · ${activeCount} active cells · ${dormantCount} non-active stored cells.${isDirty()?' · Modified':''}\nClick an arrow to add/remove it, or hold and drag a box around multiple arrows.`);
  }else if(sel.length){
    setStatus(`Recovery +3 · ${sel.length} grouped arrows · ${activeCount} active cells · ${dormantCount} non-active stored cells.${isDirty()?' · Modified':''}\nLeft mouse ↺ or right mouse ↻ rotates the whole group. Press and hold to rotate continuously.`);
  }else{
    setStatus(`Recovery +3 · ${activeCount} active cells · ${dormantCount} non-active stored cells.${isDirty()?' · Modified':''}\nLeft mouse ↺ · right mouse ↻. Press and hold to rotate continuously. Use Grab group for multi-selection.`);
  }
}
function pointAtEvent(e,{clamp=false}={}){
  const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return null;
  let x=(e.clientX-r.left)*GAME_W/r.width,y=(e.clientY-r.top)*256/r.height;
  if(clamp){x=Math.max(0,Math.min(GAME_W-.001,x));y=Math.max(0,Math.min(GAME_H-.001,y));}
  else if(x<0||x>=GAME_W||y<0||y>=GAME_H)return null;
  return {x,y,gx:Math.floor(x/CELL),gy:Math.floor(y/CELL)};
}
function step(){return Number($('recoveryStep').value||8);}
function operationIndices(cell){
  const group=selectionIndices();
  return group.length?group:[cell.gy*GRID_W+cell.gx];
}
function beginRotationHold(e,cell,delta,label){
  const v=values();if(!v)return;
  const indices=Array.from(new Set(operationIndices(cell))).filter(i=>i>=0&&i<GRID_W*GRID_H);
  if(!indices.length)return;
  const before=indices.map(i=>v[i]);
  pointerGesture={kind:'rotate',pointerId:e.pointerId,indices,before,delta,label,steps:0,delayTimer:null,repeatTimer:null};
  try{canvas.setPointerCapture(e.pointerId);}catch(_e){}
  rotateHoldStep();
  pointerGesture.delayTimer=setTimeout(()=>{
    if(!pointerGesture||pointerGesture.kind!=='rotate')return;
    rotateHoldStep();
    pointerGesture.repeatTimer=setInterval(rotateHoldStep,HOLD_REPEAT);
  },HOLD_DELAY);
}
function rotateHoldStep(){
  const g=pointerGesture;if(!g||g.kind!=='rotate')return;
  const v=values();if(!v)return;
  for(const i of g.indices)applyRaw(i,R.rotateValue(v[i],g.delta));
  g.steps++;
  updateStats();draw();
}
function beginMarquee(e,cell){
  pointerGesture={kind:'marquee',pointerId:e.pointerId,startCell:{gx:cell.gx,gy:cell.gy},currentCell:{gx:cell.gx,gy:cell.gy},moved:false};
  try{canvas.setPointerCapture(e.pointerId);}catch(_e){}
  draw();
}
function finishPointerGesture(e,cancel=false){
  const g=pointerGesture;if(!g)return;
  if(e?.pointerId!=null&&g.pointerId!==e.pointerId)return;
  if(g.delayTimer)clearTimeout(g.delayTimer);
  if(g.repeatTimer)clearInterval(g.repeatTimer);
  try{canvas.releasePointerCapture(g.pointerId);}catch(_e){}
  pointerGesture=null;
  if(cancel){draw();return;}
  if(g.kind==='rotate'){
    if(g.steps>0)pushHistory(g.indices,g.before);
    updateStats();draw();
    setStatus(`${g.label}: ${g.indices.length} recovery ${g.indices.length===1?'cell':'cells'} rotated ${g.steps} ${g.steps===1?'step':'steps'}.${isDirty()?' · Modified':''}`);
    return;
  }
  if(g.kind==='marquee'){
    if(!g.moved){
      const i=g.startCell.gy*GRID_W+g.startCell.gx;
      if(selectedGroup.has(i))selectedGroup.delete(i);else selectedGroup.add(i);
    }else{
      const s=surfaceCapture(),list=marqueeIndices(g,s);
      for(const i of list)selectedGroup.add(i);
    }
    draw();
  }
}

canvas.addEventListener('pointerdown',e=>{
  if(!active||pointerGesture)return;
  const cell=pointAtEvent(e);if(!cell)return;
  if(e.button!==0&&e.button!==2)return;
  e.preventDefault();e.stopPropagation();
  if(grabGroup){if(e.button===0)beginMarquee(e,cell);return;}
  if(e.button===2){beginRotationHold(e,cell,-step(),'Rotate right');return;}
  beginRotationHold(e,cell,step(),'Rotate left');
});
canvas.addEventListener('pointermove',e=>{
  const g=pointerGesture;if(!g||g.pointerId!==e.pointerId||g.kind!=='marquee')return;
  const cell=pointAtEvent(e,{clamp:true});if(!cell)return;
  if(cell.gx!==g.startCell.gx||cell.gy!==g.startCell.gy)g.moved=true;
  g.currentCell={gx:cell.gx,gy:cell.gy};
  e.preventDefault();draw();
});
canvas.addEventListener('pointerup',e=>finishPointerGesture(e,false));
canvas.addEventListener('pointercancel',e=>finishPointerGesture(e,false));
window.addEventListener('blur',()=>finishPointerGesture(null,false));
canvas.addEventListener('contextmenu',e=>{if(active)e.preventDefault();});

function deactivateRecovery(){
  if(!active)return;finishPointerGesture(null,true);active=false;canvas.classList.remove('editing');mode.classList.remove('active');pane.hidden=true;ctx.clearRect(0,0,canvas.width,canvas.height);
}
function activateRecovery(){
  if(active){draw();return;}
  $('layerModeWaypoints')?.click();
  const wp=$('showWaypoints');if(wp?.checked){wp.checked=false;wp.dispatchEvent(new Event('change',{bubbles:true}));}
  if(waypointHost)waypointHost.hidden=true;if(drawing)drawing.hidden=true;
  buttons.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
  active=true;mode.classList.add('active');pane.hidden=false;canvas.classList.add('editing');selectedGroup.clear();grabGroup=false;pointerGesture=null;
  $('recoveryGrabGroup')?.classList.remove('active');
  draw();
}
mode.addEventListener('click',e=>{e.preventDefault();activateRecovery();});
['layerModeWaypoints','layerEditSurface','layerEditMask'].forEach(id=>$(id)?.addEventListener('click',()=>{if(active)deactivateRecovery();}));
$('recoveryShowDormant').addEventListener('change',draw);
$('recoveryShowGrid').addEventListener('change',draw);
$('recoveryStep').addEventListener('change',draw);
$('recoveryRotateLeft').addEventListener('click',()=>{const a=selectionIndices();if(a.length)applyDelta(a,step(),'Rotate left');else setStatus('Select one or more recovery cells first.');});
$('recoveryRotateRight').addEventListener('click',()=>{const a=selectionIndices();if(a.length)applyDelta(a,-step(),'Rotate right');else setStatus('Select one or more recovery cells first.');});
$('recoveryGrabGroup').addEventListener('click',()=>setGrabGroup(!grabGroup));
$('recoveryClearGroup').addEventListener('click',clearGroup);
$('recoveryUndo').addEventListener('click',undo);
$('recoveryRevert').addEventListener('click',revert);
$('trackSelect')?.addEventListener('change',()=>{finishPointerGesture(null,true);selectedGroup.clear();grabGroup=false;$('recoveryGrabGroup')?.classList.remove('active');setTimeout(()=>{updateStats();draw();},0);});
document.addEventListener('indyheat-recovery-capture',()=>{if(active){updateStats();draw();}});
$('fileInput')?.addEventListener('change',()=>{finishPointerGesture(null,true);selectedGroup.clear();grabGroup=false;$('recoveryGrabGroup')?.classList.remove('active');if(active){setStatus('Loading recovery data…');setTimeout(draw,0);}});
$('dropZone')?.addEventListener('drop',()=>{finishPointerGesture(null,true);selectedGroup.clear();grabGroup=false;$('recoveryGrabGroup')?.classList.remove('active');if(active){setStatus('Loading recovery data…');setTimeout(draw,0);}});
$('editorScale')?.addEventListener('change',()=>setTimeout(draw,0));
$('opacity')?.addEventListener('input',draw);
if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>draw()).observe(view);

setTimeout(()=>{updateStats();if(active)draw();},800);
})();
