(function(){
'use strict';

// Waypoint-mode convenience actions:
// - right-click a visible waypoint to toggle its code-proven AI Turbo marker
// - flip every waypoint on Routes A/B/C left/right across the 320-pixel game screen
//
// Bitmap edit modes use their own overlay canvas and therefore retain their
// existing right-click paint behaviour.
const view=document.getElementById('view');
if(!view)return;

const WAYPOINT_SCREEN_WIDTH=320;

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

/*
 * Find a new stored/runtime waypoint X whose code-derived A082 projection is
 * as close as possible to:
 *
 *     newScreenX = 320 - oldScreenX
 *
 * Y is deliberately kept unchanged.  The projection's screen Y depends only
 * on waypoint Y, so this mirrors the route horizontally without changing the
 * route's vertical geometry, sequence values, flags or link topology.
 */
function mirroredWaypointX(point){
  const oldScreen=T.projectWaypointA082(point.x,point.y);
  if(!oldScreen)throw new Error(`Cannot project Route ${'ABC'[point.setIndex]||'?'} waypoint ${point.index}`);

  const targetX=WAYPOINT_SCREEN_WIDTH-oldScreen.x;
  const denominator=oldScreen.denominator;
  const estimate=Math.round(((targetX-0x168)*denominator)/0x8000);

  let best=null;
  // A waypoint X step can move several screen pixels depending on Y. Search
  // around the analytic estimate and choose the nearest representable result.
  for(let d=-12;d<=12;d++){
    const x=Math.max(-32768,Math.min(32767,estimate+d));
    const q=T.projectWaypointA082(x,point.y);
    if(!q)continue;
    const error=Math.abs(q.x-targetX);
    const tie=Math.abs(x-estimate);
    if(!best||error<best.error||(error===best.error&&tie<best.tie)){
      best={x,oldScreenX:oldScreen.x,targetX,newScreenX:q.x,error,tie};
    }
  }
  if(!best)throw new Error(`Cannot mirror Route ${'ABC'[point.setIndex]||'?'} waypoint ${point.index}`);
  return best;
}

function flipAllWaypointsLR(){
  const status=document.getElementById('editStatus');
  try{
    if(!selected||!model||!state?.waypoints?.length)throw new Error('Load a circuit before flipping waypoints.');

    const points=[];
    for(const set of state.waypoints){
      for(const p of set.points)points.push(p);
    }
    if(!points.length)throw new Error('The selected circuit has no waypoint records.');

    // Calculate the complete transform before writing anything, so an error on
    // one point cannot leave a partially mirrored route set.
    const transformed=points.map(p=>({p,mirror:mirroredWaypointX(p)}));
    const selectedAddress=state.selectedWaypoint?.runtimeAddress??null;

    for(const {p,mirror} of transformed){
      T.writeWaypoint(model.main,p,{
        x:mirror.x,
        y:p.y,
        progress:p.progress,
        progressFlag:p.progressFlag,
        linkDelta:p.linkDelta
      });
      noteEdit(p);
    }

    refreshWaypointModels(selectedAddress);
    updateWaypointValidation();
    updateWaypointEditor();
    updateWaypointFitStats();
    render();

    const changed=transformed.length;
    const maxError=Math.max(...transformed.map(x=>x.mirror.error));
    if(status){
      status.textContent=
        `Flipped ${changed} waypoints on Routes A/B/C left/right using screen X = 320 - X. `+
        `Y, sequence, AI Turbo flags and links were preserved. `+
        `Maximum projection rounding error: ${maxError} px. Revert all edits restores the loaded waypoints.`;
    }
  }catch(e){
    if(status)status.textContent='ERROR: '+e.message;
  }
}

function installFlipControl(){
  if(document.getElementById('flipWaypointsLR'))return;
  const anchor=document.querySelector('.editorSection .wpBtns');
  if(!anchor)return;

  const row=document.createElement('div');
  row.className='wpBtns';
  const button=document.createElement('button');
  button.id='flipWaypointsLR';
  button.type='button';
  button.textContent='Flip all waypoints L/R';
  button.title='Mirror every waypoint on Routes A, B and C across the 320-pixel game screen (screen X = 320 - X).';
  row.appendChild(button);
  anchor.insertAdjacentElement('afterend',row);

  function syncEnabled(){
    let ready=false;
    try{ready=!!(selected&&model&&state?.waypoints?.some(set=>set.points?.length));}catch(_){}
    button.disabled=!ready;
  }

  button.addEventListener('click',flipAllWaypointsLR);
  document.getElementById('trackSelect')?.addEventListener('change',()=>setTimeout(syncEnabled,0));
  document.addEventListener('indyheat-race-setup-capture',()=>setTimeout(syncEnabled,0));
  document.getElementById('fileInput')?.addEventListener('change',()=>setTimeout(syncEnabled,0));
  syncEnabled();
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

installFlipControl();
})();
