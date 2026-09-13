(function(){
'use strict';

// Waypoint-mode convenience action: right-click a visible waypoint to toggle
// its code-proven AI Turbo marker (waypoint +2 bit 7). Bitmap edit modes use
// their own overlay canvas and therefore retain their existing right-click paint.
const view=document.getElementById('view');
if(!view)return;

function waypointModeActive(){
  const show=document.getElementById('showWaypoints');
  if(!show?.checked)return false;
  // Surface/Foreground editing puts an interactive overlay above #view.
  // This check is an additional safeguard if that implementation changes.
  const overlay=document.getElementById('layerEditCanvas');
  return !(overlay && getComputedStyle(overlay).pointerEvents!=='none');
}

function hitWaypoint(ev){
  if(!waypointModeActive()||!selected||!model||!state?.waypoints)return null;
  const pos=eventCanvasXY(ev);
  return nearestWaypointAt(pos.x,pos.y,100);
}

// beginWaypointDrag() is already registered for pointerdown in app.js and did
// not previously distinguish mouse buttons. Intercept a right-button hit in the
// capture phase so it cannot accidentally begin a drag before contextmenu fires.
view.addEventListener('pointerdown',ev=>{
  if(ev.button!==2)return;
  const best=hitWaypoint(ev);
  if(!best)return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
},true);

view.addEventListener('contextmenu',ev=>{
  const best=hitWaypoint(ev);
  if(!best)return;
  ev.preventDefault();
  ev.stopImmediatePropagation();

  const p=best.p;
  const nextFlag=!p.progressFlag;
  try{
    selectWaypoint(best);
    T.writeWaypoint(model.main,p,{
      x:p.x,
      y:p.y,
      progress:p.progress,
      progressFlag:nextFlag,
      linkDelta:p.linkDelta
    });
    noteEdit(p);
    const addr=p.runtimeAddress;
    refreshWaypointModels(addr);
    updateWaypointValidation();
    updateWaypointEditor();
    updateWaypointFitStats();
    render();
    const updated=state.selectedWaypoint;
    const route=updated?('ABC'[updated.setIndex]||'?'):('ABC'[p.setIndex]||'?');
    const index=updated?.index??p.index;
    document.getElementById('editStatus').textContent=
      `${nextFlag?'Enabled':'Removed'} AI Turbo marker on Route ${route} waypoint ${index}.`;
  }catch(e){
    document.getElementById('editStatus').textContent='ERROR: '+e.message;
    refreshWaypointModels(p.runtimeAddress);
    updateWaypointEditor();
    render();
  }
});
})();
