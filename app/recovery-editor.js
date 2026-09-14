(function(){
'use strict';
const R=globalThis.IndyHeatRecoveryTools;
const C=globalThis.IndyHeatRecoveryCapture;
if(!R||!C)return;
const $=id=>document.getElementById(id);
const view=$('view'),buttons=$('layerModeButtons'),column=$('layerEditorColumn');
if(!view||!buttons||!column)return;

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
let active=false,grabGroup=false;
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
function selectionContains(cell){return !!cell&&selectedGroup.has(cell.gy*40+cell.gx);}
function setGrabGroup(on){
  grabGroup=!!on;
  const b=$('recoveryGrabGroup');if(b)b.classList.toggle('active',grabGroup);
  draw();
}
function clearGroup(){
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
function applyDelta(indices,delta,label){
  const v=values(),s=trackState();if(!v||!s||!indices.length)return;
  const unique=Array.from(new Set(indices)).filter(i=>i>=0&&i<1120);
  const before=unique.map(i=>v[i]);
  unique.forEach((i,n)=>applyRaw(i,R.rotateValue(before[n],delta)));
  s.history.push({indices:unique,before});
  if(s.history.length>100)s.history.shift();
  updateStats();draw();setStatus(`${label}: ${unique.length} recovery ${unique.length===1?'cell':'cells'} changed.${isDirty()?' · Modified':''}`);
}
function undo(){
  const s=trackState();if(!s||!s.history.length){setStatus('Nothing to undo in the Recovery layer.');return;}
  const op=s.history.pop();op.indices.forEach((i,n)=>applyRaw(i,op.before[n]));
  updateStats();draw();setStatus(`Undo: restored ${op.indices.length} recovery ${op.indices.length===1?'cell':'cells'}.${isDirty()?' · Modified':''}`);
}
function revert(){
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
function draw(){
  syncSize();ctx.clearRect(0,0,canvas.width,canvas.height);if(!active)return;
  const h=latest('heading'),s=surfaceCapture();if(!h||!s){setStatus('Recovery data is still loading.');return;}
  const S=canvas.width/320,showDormant=$('recoveryShowDormant').checked,v=h.result.values;
  const overlayAlpha=Math.max(.1,Math.min(1,Number($('opacity')?.value||55)/100));
  const selectedSet=new Set(selectionIndices());let activeCount=0,dormantCount=0;
  for(let gy=0;gy<28;gy++)for(let gx=0;gx<40;gx++){
    const i=gy*40+gx,relevant=R.cellIntersectsSurfaceClass(s.result.cells,gx,gy,1,s.result.width,s.result.height);
    if(relevant)activeCount++;else dormantCount++;
    if(!relevant&&!showDormant)continue;
    arrow((gx*8+4)*S,(gy*8+4)*S,v[i],relevant?overlayAlpha:overlayAlpha*.22,S,selectedSet.has(i));
  }
  const sel=selectionIndices();
  if(grabGroup){
    setStatus(`Recovery +3 · Grab group active · ${sel.length} selected · ${activeCount} active cells · ${dormantCount} non-active stored cells.${isDirty()?' · Modified':''}\nLeft-click arrows to add/remove them from the group. Click Grab group again when selection is complete.`);
  }else if(sel.length){
    setStatus(`Recovery +3 · ${sel.length} grouped arrows · ${activeCount} active cells · ${dormantCount} non-active stored cells.${isDirty()?' · Modified':''}\nLeft-click ↺ or right-click ↻ rotates the whole group. Clear group returns to single-cell editing.`);
  }else{
    setStatus(`Recovery +3 · ${activeCount} active cells · ${dormantCount} non-active stored cells.${isDirty()?' · Modified':''}\nLeft-click ↺ · right-click ↻. Use Grab group to build a non-adjacent selection.`);
  }
}
function cellAtEvent(e){
  const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)*320/r.width,y=(e.clientY-r.top)*256/r.height;
  if(x<0||x>=320||y<0||y>=224)return null;
  return {gx:Math.floor(x/8),gy:Math.floor(y/8)};
}
function step(){return Number($('recoveryStep').value||8);}
function operateCell(cell,delta,label){
  const group=selectionIndices();
  const indices=group.length?group:[cell.gy*40+cell.gx];
  applyDelta(indices,delta,group.length?`${label} group`:label);
}
function toggleGroupCell(cell){
  const i=cell.gy*40+cell.gx;
  if(selectedGroup.has(i))selectedGroup.delete(i);else selectedGroup.add(i);
  draw();
}

canvas.addEventListener('pointerdown',e=>{
  if(!active)return;const cell=cellAtEvent(e);if(!cell)return;
  e.preventDefault();e.stopPropagation();
  if(grabGroup){
    if(e.button===0)toggleGroupCell(cell);
    return;
  }
  if(e.button===2){operateCell(cell,-step(),'Rotate right');return;}
  if(e.button===0)operateCell(cell,step(),'Rotate left');
});
canvas.addEventListener('contextmenu',e=>{if(active)e.preventDefault();});

function deactivateRecovery(){
  if(!active)return;active=false;canvas.classList.remove('editing');mode.classList.remove('active');pane.hidden=true;ctx.clearRect(0,0,canvas.width,canvas.height);
}
function activateRecovery(){
  if(active){draw();return;}
  $('layerModeWaypoints')?.click();
  const wp=$('showWaypoints');if(wp?.checked){wp.checked=false;wp.dispatchEvent(new Event('change',{bubbles:true}));}
  if(waypointHost)waypointHost.hidden=true;if(drawing)drawing.hidden=true;
  buttons.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
  active=true;mode.classList.add('active');pane.hidden=false;canvas.classList.add('editing');selectedGroup.clear();grabGroup=false;
  $('recoveryGrabGroup')?.classList.remove('active');
  draw();
}
mode.addEventListener('click',e=>{e.preventDefault();activateRecovery();});
['layerModeWaypoints','layerEditSurface','layerEditMask'].forEach(id=>$(id)?.addEventListener('click',()=>{if(active)deactivateRecovery();}));
$('recoveryShowDormant').addEventListener('change',draw);
$('recoveryStep').addEventListener('change',draw);
$('recoveryRotateLeft').addEventListener('click',()=>{const a=selectionIndices();if(a.length)applyDelta(a,step(),'Rotate left');else setStatus('Select one or more recovery cells first.');});
$('recoveryRotateRight').addEventListener('click',()=>{const a=selectionIndices();if(a.length)applyDelta(a,-step(),'Rotate right');else setStatus('Select one or more recovery cells first.');});
$('recoveryGrabGroup').addEventListener('click',()=>setGrabGroup(!grabGroup));
$('recoveryClearGroup').addEventListener('click',clearGroup);
$('recoveryUndo').addEventListener('click',undo);
$('recoveryRevert').addEventListener('click',revert);
$('trackSelect')?.addEventListener('change',()=>{selectedGroup.clear();grabGroup=false;$('recoveryGrabGroup')?.classList.remove('active');setTimeout(()=>{updateStats();draw();},0);});
document.addEventListener('indyheat-recovery-capture',()=>{if(active){updateStats();draw();}});
$('fileInput')?.addEventListener('change',()=>{selectedGroup.clear();grabGroup=false;$('recoveryGrabGroup')?.classList.remove('active');if(active){setStatus('Loading recovery data…');setTimeout(draw,0);}});
$('dropZone')?.addEventListener('drop',()=>{selectedGroup.clear();grabGroup=false;$('recoveryGrabGroup')?.classList.remove('active');if(active){setStatus('Loading recovery data…');setTimeout(draw,0);}});
$('editorScale')?.addEventListener('change',()=>setTimeout(draw,0));
$('opacity')?.addEventListener('input',draw);
if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>draw()).observe(view);

setTimeout(()=>{updateStats();if(active)draw();},800);
})();
