(function(){
'use strict';

// Waypoint-mode convenience actions:
// - right-click a visible waypoint to toggle its code-proven AI Turbo marker
// - flip every waypoint on Routes A/B/C left/right across the 320-pixel game screen
// - add/delete waypoint records through a detached authoring model when route structure changes
// - clean route bookkeeping without flattening intentional branch/progress semantics
//
// Bitmap edit modes use their own overlay canvas and therefore retain their
// existing right-click paint behaviour.
const view=document.getElementById('view');
if(!view)return;

const WAYPOINT_SCREEN_WIDTH=320;
const MIN_ROUTE_WAYPOINTS=5;
const VIRTUAL_ROUTE_BASE=0x1000;
const VIRTUAL_ROUTE_STRIDE=0x2000;
const routeColours=['#ff5353','#53f06b','#4fd8ff'];
const waypointOverrides=new Map();
let actionMode=null;
let actionHover=null;

function authoringKey(){
  const sel=document.getElementById('trackSelect'),o=sel?.selectedOptions?.[0];
  if(!o)return null;
  if(o.dataset?.indyheatPackageKey)return `package:${o.dataset.indyheatPackageKey}`;
  if(o.dataset?.indyheatCustom==='1')return `custom:${o.value}`;
  const retail=o.dataset?.indyheatRetailIndex;
  return `retail:${retail==null?o.value:retail}`;
}
function currentOverride(){const key=authoringKey();return key==null?null:(waypointOverrides.get(key)||null);}
function cloneBytes(bytes){return bytes?Uint8Array.from(bytes):new Uint8Array(6);}
function allNodes(sets){const out=[];for(const set of sets||[]){for(const p of set.points||[])out.push(p);if(set.boundaryPoint)out.push(set.boundaryPoint);}return out;}
function nodeByAddress(sets,address){for(const n of allNodes(sets))if(n.runtimeAddress===address)return n;return null;}

function encodeVirtualPoint(point,changes={}){
  const values={
    x:changes.x??point.x,
    y:changes.y??point.y,
    progress:changes.progress??point.progress,
    progressFlag:changes.progressFlag??point.progressFlag,
    linkDelta:changes.linkDelta??point.linkDelta
  };
  const encoded=T.encodeRuntimeWaypoint(values),dec=T.decodeStoredWaypointBytes(encoded.storedBytes);
  point.x=dec.x;point.y=dec.y;point.progress=dec.progress;point.progressByte=dec.progressByte;point.progressFlag=dec.progressFlag;
  point.linkDelta=dec.linkDelta;point.linkAligned=dec.linkAligned;point.linkRecords=dec.linkRecords;
  point.runtimeBytes=encoded.runtimeBytes;point.storedBytes=encoded.storedBytes;point.fileOffset=null;point.__ihVirtual=true;
  point.storedWord0=((point.storedBytes[0]<<8)|point.storedBytes[1]);
  point.storedProgress=point.storedBytes[2];point.storedY=point.storedBytes[3];point.storedLink=((point.storedBytes[4]<<8)|point.storedBytes[5]);
  return {...values,...encoded};
}

function cloneWaypointSets(sourceSets){
  const sets=[],cloneForOriginal=new Map(),byAddress=new Map();
  // Match the core parser's address preference: ordinary points first, then
  // boundary-only records where the address is not already an ordinary point.
  for(const set of sourceSets||[])for(const p of set.points||[])if(!byAddress.has(p.runtimeAddress))byAddress.set(p.runtimeAddress,p);
  for(const set of sourceSets||[])if(set.boundaryPoint&&!byAddress.has(set.boundaryPoint.runtimeAddress))byAddress.set(set.boundaryPoint.runtimeAddress,set.boundaryPoint);

  for(const source of sourceSets||[]){
    const set={...source,points:[],boundaryPoint:null,originalStart:source.originalStart??source.start};
    for(const p of source.points||[]){
      const q={...p,fileOffset:null,storedBytes:cloneBytes(p.storedBytes),runtimeBytes:cloneBytes(p.runtimeBytes),__ihVirtual:true,__ihUnresolvedDelta:p.linkDelta};
      set.points.push(q);cloneForOriginal.set(p,q);
    }
    if(source.boundaryPoint){
      const p=source.boundaryPoint,q={...p,fileOffset:null,storedBytes:cloneBytes(p.storedBytes),runtimeBytes:cloneBytes(p.runtimeBytes),__ihVirtual:true};
      set.boundaryPoint=q;cloneForOriginal.set(p,q);
    }
    sets.push(set);
  }
  for(const sourceSet of sourceSets||[])for(const p of sourceSet.points||[]){
    const q=cloneForOriginal.get(p),target=byAddress.get(p.linkTarget)||null;
    q.__ihLinkTarget=target?cloneForOriginal.get(target)||null:null;
  }
  return sets;
}

function normaliseOverride(ov){
  if(!ov?.sets)return;
  const valid=new Set(allNodes(ov.sets));
  for(const set of ov.sets){
    const base=VIRTUAL_ROUTE_BASE+set.index*VIRTUAL_ROUTE_STRIDE;
    set.start=base;set.fileOffset=null;set.count=set.points.length;set.end=base+set.count*6;set.descriptorBytes=set.count*6;set.nearestScanCountCandidate=set.count+1;
    set.points.forEach((p,i)=>{p.index=i;p.setIndex=set.index;p.runtimeAddress=base+i*6;p.fileOffset=null;p.__ihVirtual=true;});
    if(set.boundaryPoint){set.boundaryPoint.index=set.count;set.boundaryPoint.setIndex=set.index;set.boundaryPoint.runtimeAddress=set.end;set.boundaryPoint.fileOffset=null;set.boundaryPoint.__ihVirtual=true;}
  }
  for(const set of ov.sets)for(const p of set.points){
    let target=(p.__ihLinkTarget&&valid.has(p.__ihLinkTarget))?p.__ihLinkTarget:null;
    let delta=target?target.runtimeAddress-p.runtimeAddress:(p.__ihUnresolvedDelta??p.linkDelta??0);
    if(delta<-32768||delta>32767){target=null;delta=p.__ihUnresolvedDelta??0;}
    encodeVirtualPoint(p,{linkDelta:delta});
    p.__ihLinkTarget=target;p.__ihUnresolvedDelta=delta;p.linkTarget=p.runtimeAddress+p.linkDelta;
    p.linkResolved=!!target;p.linkTargetSet=target?.setIndex??null;p.linkTargetIndex=target?.index??null;
    p.linkTargetBoundary=!!target?.boundaryOnly;p.linkTargetZeroSentinel=!!target?.zeroSentinel;
  }
  if(state.race){state.waypoints=ov.sets;state.race.waypointDescriptors=ov.sets;}
}

function ensureOverride(){
  const key=authoringKey();
  if(key==null)throw new Error('No circuit is selected.');
  let ov=waypointOverrides.get(key);
  if(ov)return ov;
  if(!state?.waypoints?.length)throw new Error('Load a circuit before changing waypoint structure.');
  ov={key,sets:cloneWaypointSets(state.waypoints),createdFromTrack:Number(document.getElementById('trackSelect')?.value||0)};
  waypointOverrides.set(key,ov);normaliseOverride(ov);return ov;
}

function applyOverrideToState(ov,selectedAddress=null){
  if(!ov)return false;normaliseOverride(ov);state.waypoints=ov.sets;if(state.race)state.race.waypointDescriptors=ov.sets;
  state.selectedWaypoint=null;
  if(selectedAddress!=null)state.selectedWaypoint=nodeByAddress(ov.sets,selectedAddress);
  return true;
}

function setStatus(text){const el=document.getElementById('editStatus');if(el)el.textContent=text;}
function routeCountsText(ov=currentOverride()){return ov?.sets?.map(s=>`${'ABC'[s.index]} ${s.points.length}`).join(' · ')||'';}

// Once structural editing begins the route data intentionally lives outside the
// fixed retail main-image spans.  Wrap the existing core helpers so all accepted
// waypoint field editing continues to work against that detached model.
const baseWriteWaypoint=T.writeWaypoint;
T.writeWaypoint=function(main,point,changes={}){
  if(!point?.__ihVirtual)return baseWriteWaypoint(main,point,changes);
  const result=encodeVirtualPoint(point,changes),ov=currentOverride();
  if(ov){
    const target=nodeByAddress(ov.sets,point.runtimeAddress+point.linkDelta);
    point.__ihLinkTarget=target;point.__ihUnresolvedDelta=point.linkDelta;
  }
  return result;
};

const baseNoteEdit=noteEdit;
noteEdit=function(point){
  if(point?.__ihVirtual){updateEditExportButtons();return;}
  return baseNoteEdit(point);
};

const baseRefreshWaypointModels=refreshWaypointModels;
refreshWaypointModels=function(selectedAddress=null){
  const ov=currentOverride();
  if(!ov)return baseRefreshWaypointModels(selectedAddress);
  applyOverrideToState(ov,selectedAddress);
};

const baseUpdateEditExportButtons=updateEditExportButtons;
updateEditExportButtons=function(){
  baseUpdateEditExportButtons();
  const ov=currentOverride();if(!ov)return;
  const revert=document.getElementById('revertAll'),patch=document.getElementById('savePatch'),main=document.getElementById('saveMain'),count=document.getElementById('editCount');
  if(revert)revert.disabled=false;
  if(patch){patch.disabled=true;patch.title='Structural waypoint edits are exported through the circuit ZIP rather than the fixed-address patch format.';}
  if(main){main.disabled=true;main.title='Structural waypoint edits are exported through the circuit ZIP rather than a modified retail main image.';}
  if(count)count.textContent=`${ov.importedPackageBaseline?'Custom waypoint structure':'Waypoint structure modified'} · ${routeCountsText(ov)}`;
};

const baseUpdateWaypointEditor=updateWaypointEditor;
updateWaypointEditor=function(){
  baseUpdateWaypointEditor();
  if(currentOverride()){
    const b=document.getElementById('revertWaypoint');
    if(b){b.disabled=true;b.title='After adding/deleting waypoints, use Revert all edits to restore the loaded route structure.';}
  }
};

const baseRevertSelectedWaypoint=revertSelectedWaypoint;
revertSelectedWaypoint=function(){
  if(currentOverride()){setStatus('Use Revert all edits to restore the loaded waypoint structure after add/delete changes.');return;}
  return baseRevertSelectedWaypoint();
};

const baseRevertAllWaypoints=revertAllWaypoints;
revertAllWaypoints=function(){
  const key=authoringKey(),had=key!=null&&waypointOverrides.delete(key);
  baseRevertAllWaypoints();
  if(had)setStatus('All waypoint field and structural edits reverted to the loaded circuit.');
};

const baseSelectTrack=selectTrack;
selectTrack=function(index){
  const result=baseSelectTrack(index),ov=currentOverride();
  if(ov){applyOverrideToState(ov,null);updateWaypointValidation();updateWaypointEditor();updateWaypointFitStats();updateEditExportButtons();render();}
  syncActionButtons();return result;
};

const baseLoadFile=loadFile;
loadFile=async function(file){
  waypointOverrides.clear();setActionMode(null,false);return baseLoadFile(file);
};

function waypointModeActive(){
  const show=document.getElementById('showWaypoints');
  if(!show?.checked)return false;
  // Surface/Foreground editing puts an interactive overlay above #view.
  const overlay=document.getElementById('layerEditCanvas');
  return !(overlay && getComputedStyle(overlay).pointerEvents!=='none');
}

function hitWaypoint(ev){
  if(!waypointModeActive()||!selected||!model||!state?.waypoints)return null;
  const pos=eventCanvasXY(ev);
  return nearestWaypointAt(pos.x,pos.y,100);
}

function pointSegmentDistance2(p,a,b){
  const vx=b.x-a.x,vy=b.y-a.y,wx=p.x-a.x,wy=p.y-a.y,den=vx*vx+vy*vy;
  let t=den?((wx*vx+wy*vy)/den):0;t=Math.max(0,Math.min(1,t));
  const x=a.x+t*vx,y=a.y+t*vy,dx=p.x-x,dy=p.y-y;
  return {d2:dx*dx+dy*dy,x,y,t};
}
function insertionCandidate(pos){
  if(!waypointModeActive()||!state?.waypoints)return null;
  const enabled=visibleWaypointSetIndices();let best=null;
  for(const set of state.waypoints){
    if(!enabled.has(set.index)||set.points.length<2)continue;
    const byAddress=new Map(set.points.map(p=>[p.runtimeAddress,p]));
    let linkedCandidate=false;
    // Prefer the route's real logical links. Splitting an actual edge preserves
    // non-default steering topology rather than assuming every record is +6.
    for(const p of set.points){
      const target=p.__ihLinkTarget||byAddress.get(p.linkTarget)||null;
      if(!target||target===p||target.boundaryOnly||target.setIndex!==set.index)continue;
      linkedCandidate=true;const a=wpScreen(p),b=wpScreen(target),q=pointSegmentDistance2(pos,a,b);
      if(!best||q.d2<best.d2)best={setIndex:set.index,sourceIndex:p.index,targetIndex:target.index,a,b,d2:q.d2,pos};
    }
    if(linkedCandidate)continue;
    // Defensive fallback for malformed/unresolved route links: use adjacent IDs.
    for(let i=0;i<set.points.length-1;i++){
      const a=wpScreen(set.points[i]),b=wpScreen(set.points[i+1]),q=pointSegmentDistance2(pos,a,b);
      if(!best||q.d2<best.d2)best={setIndex:set.index,sourceIndex:i,targetIndex:i+1,a,b,d2:q.d2,pos};
    }
  }
  return best;
}

function logicalSequenceRun(points,startIndex){
  const run=[];let previous=null;
  for(let i=startIndex;i<points.length;i++){
    const p=points[i];
    // Physical record order can contain a later branch/pit-lane run that
    // restarts its sequence numbering (commonly back at 0).  A decrease marks
    // that boundary; do not resequence records beyond it.
    if(previous!=null&&p.progress<previous)break;
    run.push(p);previous=p.progress;
  }
  return run;
}
function logicalFollowersAfterDelete(points,index,removedSequence){
  const run=[];let previous=removedSequence,started=false;
  for(let i=index+1;i<points.length;i++){
    const p=points[i];
    if(!started){
      // A same/lower value means the next physical record belongs to another
      // logical sequence group/run, so deletion must not touch it.
      if(p.progress<=removedSequence)break;
      started=true;
    }else if(p.progress<previous)break;
    run.push(p);previous=p.progress;
  }
  return run;
}

// Progress is shared race/checkpoint metadata, not a physical waypoint ID.
// Retail Route C deliberately contains route-local gaps, duplicates and branch
// runs, so a safe clean may remove only ordinals unused by ALL three routes.
function globalSequenceCompression(sets){
  const used=new Set();
  for(const set of sets||[])for(const p of set.points||[])used.add(Number(p.progress));
  if(!used.size)return {map:new Map(),gaps:[],max:null};
  if(!used.has(0))throw new Error('Route clean cannot compact sequence values because no route contains sequence 0. Repair the lap/start progress data manually first.');
  const max=Math.max(...used),map=new Map(),gaps=[];let shift=0;
  for(let value=0;value<=max;value++){
    if(!used.has(value)){gaps.push(value);shift++;continue;}
    map.set(value,value-shift);
  }
  return {map,gaps,max};
}
function percentile90(values){
  if(!values?.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor((sorted.length-1)*.9)];
}
function routeCProximity(sets){
  const c=sets?.[2]?.points||[];if(!c.length)return null;
  const result={};
  for(const setIndex of [0,1]){
    const points=sets?.[setIndex]?.points||[],distances=[];
    for(const p of points){
      let best=Infinity;
      for(const q of c){const dx=Number(p.x)-Number(q.x),dy=Number(p.y)-Number(q.y),d=Math.hypot(dx,dy);if(d<best)best=d;}
      if(Number.isFinite(best))distances.push(best);
    }
    result['AB'[setIndex]]={
      p90:percentile90(distances),
      max:distances.length?Math.max(...distances):null
    };
  }
  return result;
}
function cleanRouteData(){
  try{
    if(!selected||!model||!state?.waypoints?.length)throw new Error('Load a circuit before cleaning route data.');
    const ov=ensureOverride(),selectedPoint=state.selectedWaypoint||null;
    const beforeTargets=new Map();
    let unresolved=0;
    for(const set of ov.sets)for(const p of set.points){
      if(p.__ihLinkTarget)beforeTargets.set(p,p.__ihLinkTarget);
      else unresolved++;
    }
    const plan=globalSequenceCompression(ov.sets);
    let changedSequences=0;
    for(const set of ov.sets)for(const p of set.points){
      const next=plan.map.get(p.progress);
      if(next!=null&&next!==p.progress){p.progress=next;changedSequences++;}
    }
    normaliseOverride(ov);
    // normaliseOverride reassigns physical IDs 0..N-1 and recalculates every
    // resolved relative displacement from the retained target object.
    let changedTargets=0;
    for(const [point,target] of beforeTargets)if(point.__ihLinkTarget!==target)changedTargets++;
    state.selectedWaypoint=selectedPoint&&allNodes(ov.sets).includes(selectedPoint)?selectedPoint:null;
    updateWaypointValidation();updateWaypointEditor();updateWaypointFitStats();updateEditExportButtons();render();
    const prox=routeCProximity(ov.sets),fmt=v=>v==null?'—':Number(v).toFixed(1);
    const seqText=plan.gaps.length
      ?` Removed globally unused sequence ${plan.gaps.length===1?'value':'values'} ${plan.gaps.join(', ')} across A/B/C (${changedSequences} records updated).`
      :' No globally unused sequence values were found; route-specific gaps/duplicates were preserved.';
    const proximityText=prox?` Route C proximity: A→C p90 ${fmt(prox.A.p90)} / max ${fmt(prox.A.max)}; B→C p90 ${fmt(prox.B.p90)} / max ${fmt(prox.B.max)} world units.`:'';
    setStatus(`Route data cleaned. Physical waypoint IDs are contiguous and ${beforeTargets.size} resolved link target${beforeTargets.size===1?' was':'s were'} rebuilt without changing topology.${unresolved?` ${unresolved} unresolved/raw link${unresolved===1?' was':'s were'} retained.`:''}${changedTargets?` WARNING: ${changedTargets} logical link target${changedTargets===1?' changed':'s changed'} unexpectedly.`:''}${seqText}${proximityText}`);
    return {sequenceGapsRemoved:plan.gaps.slice(),changedSequences,resolvedLinks:beforeTargets.size,unresolvedLinks:unresolved,changedTargets,proximity:prox};
  }catch(e){setStatus('ERROR: '+e.message);return null;}
}

function addWaypointAt(pos,candidate=insertionCandidate(pos)){
  if(!candidate)throw new Error('Turn on Waypoints and at least one Route A/B/C layer before adding a waypoint.');
  const ov=ensureOverride(),set=ov.sets[candidate.setIndex];
  if(!set)throw new Error('The selected waypoint route is unavailable.');
  const source=set.points[candidate.sourceIndex],target=set.points[candidate.targetIndex];
  if(!source||!target)throw new Error('The detected waypoint link changed; move the pointer and try again.');
  // Insert immediately before the logical link target. This keeps the new
  // physical ID next to its successor even when the selected edge was a
  // non-default jump or the route-closing last->first link.
  const insertIndex=target.index,future=logicalSequenceRun(set.points,insertIndex);
  if(future.some(p=>p.progress>=127))throw new Error(`Route ${'ABC'[set.index]} cannot be resequenced because the affected logical sequence run already reaches 127.`);
  const newSequence=target.progress;
  const inv=inverseDisplayPoint(pos.x,pos.y,source);if(!inv)throw new Error('The clicked map position cannot be represented as a waypoint coordinate.');

  for(const p of future)p.progress+=1;
  const encoded=T.encodeRuntimeWaypoint({x:inv.x,y:inv.y,progress:newSequence,progressFlag:false,linkDelta:6});
  const point={
    index:insertIndex,setIndex:set.index,runtimeAddress:0,fileOffset:null,storedBytes:encoded.storedBytes,runtimeBytes:encoded.runtimeBytes,
    x:inv.x,y:inv.y,progress:newSequence,progressByte:newSequence,progressFlag:false,linkDelta:6,linkAligned:true,linkRecords:1,
    __ihVirtual:true,__ihLinkTarget:target,__ihUnresolvedDelta:6
  };
  // The plus marker is placed on an actual logical link, so insertion means
  // source -> new -> old target rather than creating an orphan point.
  source.__ihLinkTarget=point;
  set.points.splice(insertIndex,0,point);normaliseOverride(ov);
  state.selectedWaypoint=point;updateWaypointValidation();updateWaypointEditor();updateWaypointFitStats();updateEditExportButtons();render();
  setStatus(`Added Route ${'ABC'[set.index]} waypoint ${point.index} at sequence ${point.progress}. Following waypoint IDs and the affected logical sequence run were advanced by 1.`);
  return point;
}

function deleteWaypoint(best){
  if(!best)throw new Error('Move over a visible waypoint before deleting.');
  const ov=ensureOverride(),set=ov.sets[best.set];
  if(!set)throw new Error('The selected waypoint route is unavailable.');
  if(set.points.length<=MIN_ROUTE_WAYPOINTS)throw new Error(`Route ${'ABC'[set.index]} must contain at least ${MIN_ROUTE_WAYPOINTS} waypoints.`);
  const point=set.points[best.p.index];if(!point)throw new Error('The selected waypoint changed; move the pointer and try again.');
  const index=point.index,removedSequence=point.progress,future=logicalFollowersAfterDelete(set.points,index,removedSequence);
  const replacement=set.points[index+1]||set.points.find(p=>p!==point)||null;
  let repaired=0;
  for(const route of ov.sets)for(const p of route.points){if(p!==point&&p.__ihLinkTarget===point){p.__ihLinkTarget=replacement;repaired++;}}
  set.points.splice(index,1);for(const p of future)p.progress-=1;normaliseOverride(ov);
  state.selectedWaypoint=replacement&&set.points.includes(replacement)?replacement:null;
  updateWaypointValidation();updateWaypointEditor();updateWaypointFitStats();updateEditExportButtons();render();
  const nextText=replacement?` Links targeting it now use Route ${'ABC'[replacement.setIndex]} waypoint ${replacement.index}.`:'';
  setStatus(`Deleted Route ${'ABC'[set.index]} waypoint ${index} (sequence ${removedSequence}). Following waypoint IDs and the affected logical sequence run were reduced by 1.${repaired?nextText:''}`);
}

function updateActionHover(ev){
  if(!actionMode||!waypointModeActive()){actionHover=null;return;}
  const pos=eventCanvasXY(ev);
  actionHover=actionMode==='add'?{mode:'add',candidate:insertionCandidate(pos),pos}:{mode:'delete',best:nearestWaypointAt(pos.x,pos.y,144),pos};
}
function drawActionHover(){
  if(!actionMode||!actionHover||!waypointModeActive())return;
  const S=editorScale();ctx.save();ctx.lineWidth=Math.max(2,.8*S);ctx.font=`700 ${Math.max(12,5*S)}px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`;ctx.textAlign='center';ctx.textBaseline='middle';
  if(actionMode==='add'&&actionHover.candidate){
    const c=actionHover.candidate,col=routeColours[c.setIndex]||'#fff';ctx.strokeStyle=col;ctx.globalAlpha=.9;ctx.setLineDash([2*S,1.5*S]);ctx.beginPath();ctx.moveTo(c.a.x*S,c.a.y*S);ctx.lineTo(c.b.x*S,c.b.y*S);ctx.stroke();ctx.setLineDash([]);
    const x=actionHover.pos.x*S,y=actionHover.pos.y*S,r=Math.max(7,3*S);ctx.fillStyle='rgba(0,0,0,.82)';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.strokeStyle=col;ctx.stroke();ctx.fillStyle='#fff';ctx.fillText('+',x,y+.2*S);
  }else if(actionMode==='delete'&&actionHover.best){
    const b=actionHover.best,q=wpScreen(b.p),col=routeColours[b.set]||'#fff',x=q.x*S,y=q.y*S,r=Math.max(7,3*S);ctx.fillStyle='rgba(0,0,0,.82)';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.strokeStyle=col;ctx.stroke();ctx.fillStyle='#fff';ctx.fillText('−',x,y-.2*S);
  }
  ctx.restore();
}
const baseDrawWaypoints=drawWaypoints;
drawWaypoints=function(){baseDrawWaypoints();drawActionHover();};

function setActionMode(mode,announce=true){
  actionMode=actionMode===mode?null:mode;actionHover=null;
  for(const [id,value] of [['addWaypointMode','add'],['deleteWaypointMode','delete']]){const b=document.getElementById(id);if(b){const on=actionMode===value;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));}}
  view.style.cursor=actionMode?'crosshair':'';render();
  if(announce){
    if(actionMode==='add')setStatus('Add waypoint mode: hover the circuit for a (+) on the nearest logical route link, then click to insert.');
    else if(actionMode==='delete')setStatus(`Delete waypoint mode: hover a waypoint for a (−), then click to remove it. Each route must keep at least ${MIN_ROUTE_WAYPOINTS}.`);
    else setStatus('Waypoint add/delete mode off.');
  }
}
function syncActionButtons(){
  let ready=false;try{ready=!!(selected&&model&&state?.waypoints?.some(set=>set.points?.length));}catch(_e){}
  for(const id of ['addWaypointMode','deleteWaypointMode','cleanWaypointRoutes','flipWaypointsLR']){const b=document.getElementById(id);if(b)b.disabled=!ready;}
}

function installActionControls(){
  if(document.getElementById('addWaypointMode'))return;
  const anchor=document.querySelector('.editorSection .wpBtns');if(!anchor)return;
  if(!document.getElementById('waypointActionStyle')){
    const style=document.createElement('style');style.id='waypointActionStyle';style.textContent='.wpActionToggle.active{outline:2px solid currentColor;outline-offset:-2px}.wpActionToggle[aria-pressed="true"]{font-weight:700}';document.head.appendChild(style);
  }
  const row=document.createElement('div');row.className='wpBtns';
  const add=document.createElement('button');add.id='addWaypointMode';add.type='button';add.className='wpActionToggle';add.textContent='Add waypoint (+)';add.setAttribute('aria-pressed','false');add.title='Insert a waypoint on the nearest visible logical route link and renumber following IDs/sequences.';
  const del=document.createElement('button');del.id='deleteWaypointMode';del.type='button';del.className='wpActionToggle';del.textContent='Delete waypoint (−)';del.setAttribute('aria-pressed','false');del.title=`Delete a visible waypoint, repair links to the next waypoint and keep at least ${MIN_ROUTE_WAYPOINTS} per route.`;
  const clean=document.createElement('button');clean.id='cleanWaypointRoutes';clean.type='button';clean.textContent='Clean route data';clean.title='Rebuild physical waypoint IDs and resolved link displacements. Sequence values are compacted only when an ordinal is unused by Routes A, B and C together; route-specific branch gaps/duplicates are preserved.';
  row.append(add,del,clean);anchor.insertAdjacentElement('afterend',row);add.addEventListener('click',()=>setActionMode('add'));del.addEventListener('click',()=>setActionMode('delete'));clean.addEventListener('click',cleanRouteData);syncActionButtons();
}

/*
 * Find a new stored/runtime waypoint X whose code-derived A082 projection is
 * as close as possible to newScreenX = 320 - oldScreenX.
 * Y is deliberately kept unchanged.
 */
function mirroredWaypointX(point){
  const oldScreen=T.projectWaypointA082(point.x,point.y);
  if(!oldScreen)throw new Error(`Cannot project Route ${'ABC'[point.setIndex]||'?'} waypoint ${point.index}`);
  const targetX=WAYPOINT_SCREEN_WIDTH-oldScreen.x,denominator=oldScreen.denominator,estimate=Math.round(((targetX-0x168)*denominator)/0x8000);
  let best=null;
  for(let d=-12;d<=12;d++){
    const x=Math.max(-32768,Math.min(32767,estimate+d)),q=T.projectWaypointA082(x,point.y);if(!q)continue;
    const error=Math.abs(q.x-targetX),tie=Math.abs(x-estimate);
    if(!best||error<best.error||(error===best.error&&tie<best.tie))best={x,oldScreenX:oldScreen.x,targetX,newScreenX:q.x,error,tie};
  }
  if(!best)throw new Error(`Cannot mirror Route ${'ABC'[point.setIndex]||'?'} waypoint ${point.index}`);
  return best;
}

function flipAllWaypointsLR(){
  const status=document.getElementById('editStatus');
  try{
    if(!selected||!model||!state?.waypoints?.length)throw new Error('Load a circuit before flipping waypoints.');
    const points=[];for(const set of state.waypoints)for(const p of set.points)points.push(p);
    if(!points.length)throw new Error('The selected circuit has no waypoint records.');
    const transformed=points.map(p=>({p,mirror:mirroredWaypointX(p)})),selectedAddress=state.selectedWaypoint?.runtimeAddress??null;
    for(const {p,mirror} of transformed){T.writeWaypoint(model.main,p,{x:mirror.x,y:p.y,progress:p.progress,progressFlag:p.progressFlag,linkDelta:p.linkDelta});noteEdit(p);}
    refreshWaypointModels(selectedAddress);updateWaypointValidation();updateWaypointEditor();updateWaypointFitStats();render();
    const changed=transformed.length,maxError=Math.max(...transformed.map(x=>x.mirror.error));
    if(status)status.textContent=`Flipped ${changed} waypoints on Routes A/B/C left/right using screen X = 320 - X. Y, sequence, AI Turbo flags and links were preserved. Maximum projection rounding error: ${maxError} px. Revert all edits restores the loaded waypoints.`;
  }catch(e){if(status)status.textContent='ERROR: '+e.message;}
}

function installFlipControl(){
  if(document.getElementById('flipWaypointsLR'))return;
  const anchor=document.querySelector('.editorSection .wpBtns');if(!anchor)return;
  const row=document.createElement('div');row.className='wpBtns';const button=document.createElement('button');button.id='flipWaypointsLR';button.type='button';button.textContent='Flip all waypoints L/R';button.title='Mirror every waypoint on Routes A, B and C across the 320-pixel game screen (screen X = 320 - X).';row.appendChild(button);anchor.insertAdjacentElement('afterend',row);
  button.addEventListener('click',flipAllWaypointsLR);syncActionButtons();
}

// Variable-count circuit packages retain the retail template only as an editor
// host.  Their real waypoint routes remain detached from the fixed retail main
// image spans, exactly like routes changed with Add/Delete in the current session.
let packageBaseEncodeWaypoints=null;
let pendingVariablePackageImport=null;
let replayingVariablePackageImport=false;

function packageRouteSets(decodedRoutes,templateSets=[]){
  if(!Array.isArray(decodedRoutes)||decodedRoutes.length!==3)throw new Error('Custom package must contain three waypoint routes.');
  const sets=[];
  for(let setIndex=0;setIndex<3;setIndex++){
    const src=decodedRoutes[setIndex],template=templateSets?.[setIndex]||{},base=VIRTUAL_ROUTE_BASE+setIndex*VIRTUAL_ROUTE_STRIDE;
    if(!Array.isArray(src?.points)||src.points.length<MIN_ROUTE_WAYPOINTS)
      throw new Error(`Route ${'ABC'[setIndex]} must contain at least ${MIN_ROUTE_WAYPOINTS} waypoints.`);
    const points=src.points.map((storedBytes,index)=>{
      const stored=cloneBytes(storedBytes),dec=T.decodeStoredWaypointBytes(stored),runtimeAddress=base+index*6;
      return {
        index,setIndex,runtimeAddress,fileOffset:null,storedBytes:stored,runtimeBytes:cloneBytes(dec.runtimeBytes),
        x:dec.x,y:dec.y,progressByte:dec.progressByte,progress:dec.progress,progressFlag:dec.progressFlag,
        linkDelta:dec.linkDelta,linkAligned:dec.linkAligned,linkRecords:dec.linkRecords,linkTarget:runtimeAddress+dec.linkDelta,
        storedWord0:((stored[0]<<8)|stored[1]),storedProgress:stored[2],storedY:stored[3],storedLink:((stored[4]<<8)|stored[5]),
        __ihVirtual:true,__ihUnresolvedDelta:dec.linkDelta
      };
    });
    let boundaryPoint=null;
    if(src.boundaryBytes){
      const stored=cloneBytes(src.boundaryBytes),dec=T.decodeStoredWaypointBytes(stored),runtimeAddress=base+points.length*6;
      boundaryPoint={
        index:points.length,setIndex,runtimeAddress,fileOffset:null,storedBytes:stored,runtimeBytes:cloneBytes(dec.runtimeBytes),
        x:dec.x,y:dec.y,progressByte:dec.progressByte,progress:dec.progress,progressFlag:dec.progressFlag,
        linkDelta:dec.linkDelta,linkAligned:dec.linkAligned,linkRecords:dec.linkRecords,linkTarget:runtimeAddress+dec.linkDelta,
        boundaryOnly:true,zeroSentinel:Array.from(stored).every(v=>v===0),__ihVirtual:true
      };
    }
    sets.push({
      ...template,index:setIndex,start:base,end:base+points.length*6,count:points.length,fileOffset:null,points,boundaryPoint,
      originalStart:template.originalStart??template.start??base,descriptorBytes:points.length*6,nearestScanCountCandidate:points.length+1
    });
  }
  const byAddress=new Map();
  for(const set of sets)for(const p of set.points)if(!byAddress.has(p.runtimeAddress))byAddress.set(p.runtimeAddress,p);
  for(const set of sets)if(set.boundaryPoint&&!byAddress.has(set.boundaryPoint.runtimeAddress))byAddress.set(set.boundaryPoint.runtimeAddress,set.boundaryPoint);
  for(const set of sets)for(const p of set.points)p.__ihLinkTarget=byAddress.get(p.runtimeAddress+p.linkDelta)||null;
  return sets;
}

function installPackageRoutes(authorKey,waypointsBin,templateSets=[]){
  const P=globalThis.IndyHeatCircuitPackage;
  if(!P?.decodeWaypointsBin)throw new Error('Circuit package waypoint decoder is unavailable.');
  const sets=packageRouteSets(P.decodeWaypointsBin(waypointsBin),templateSets);
  const ov={key:authorKey,sets,createdFromTrack:Number(document.getElementById('trackSelect')?.value||0),importedPackageBaseline:true};
  waypointOverrides.set(authorKey,ov);normaliseOverride(ov);
  if(authoringKey()===authorKey){
    applyOverrideToState(ov,null);updateWaypointValidation();updateWaypointEditor();updateWaypointFitStats();updateEditExportButtons();render();
  }
  return ov;
}

function waypointTemplateRecord(templateIndex){
  const C=globalThis.IndyHeatRaceSetupCapture,models=[];
  for(const m of [C?.coreModel,C?.model,C?.layerModel,...(C?.models||[])])if(m&&!models.includes(m))models.push(m);
  const baseId=T.TRACK_BASE_IDS?.[templateIndex];
  for(const m of models){
    const records=T.parseRaceRecords(m.main);
    for(const r of records){
      r.baseResourceId=T.raceBaseResourceId(r,m.resourceTableOffset+0x1000);
      if(r.baseResourceId!==baseId)continue;
      r.waypointDescriptors=T.parseWaypointDescriptors(m.main,r);
      return {model:m,record:r};
    }
  }
  return null;
}

function templateIndexFromCircuitZip(P,entries,folder){
  const bytes=entries.get(`${folder}/template.bin`);
  if(!bytes)return null;
  if(bytes.length!==2)throw new Error('template.bin must be exactly 2 bytes.');
  const index=((bytes[0]<<8)|bytes[1])>>>0;
  if(index>9)throw new Error(`template.bin retail host ${index} is outside 0–9.`);
  return index;
}

async function prepareVariableCountPackageImport(input,file){
  const P=globalThis.IndyHeatCircuitPackage;if(!P?.parseCircuitZip||!P?.readZipStore||!P?.zipStore)return false;
  const originalBytes=new Uint8Array(await file.arrayBuffer()),pkg=P.parseCircuitZip(originalBytes),entries=P.readZipStore(originalBytes);
  const templateIndex=templateIndexFromCircuitZip(P,entries,pkg.folder);
  if(templateIndex==null)return false; // legacy packages keep the existing shape-inference path
  const template=waypointTemplateRecord(templateIndex);
  if(!template)throw new Error(`Retail host template ${templateIndex} is unavailable. Load Disk.1 before importing the circuit package.`);
  const templateCounts=template.record.waypointDescriptors.map(set=>set.points.length);
  const variable=pkg.routeCounts.some((count,i)=>count!==templateCounts[i]);
  if(!variable)return false;

  // The old importer needs a retail-sized waypoint payload while it installs
  // resources into its fixed host. Replace only that temporary import payload;
  // the original variable routes are installed immediately afterwards below.
  const baseEncode=packageBaseEncodeWaypoints||P.encodeWaypointsBin;
  const hostWaypoints=baseEncode(template.record,template.model.main);
  entries.set(`${pkg.folder}/waypoints.bin`,hostWaypoints);
  const temporaryZip=P.zipStore([...entries.entries()].map(([name,data])=>({name,data})));
  pendingVariablePackageImport={
    folder:pkg.folder,circuitIndex:pkg.circuitIndex,templateIndex,
    waypointsBin:pkg.waypointsBin.slice(),routeCounts:pkg.routeCounts.slice()
  };

  if(typeof DataTransfer==='undefined')throw new Error('This browser cannot stage the custom waypoint package for import.');
  const dt=new DataTransfer(),replacement=new File([temporaryZip],file.name,{type:file.type||'application/zip'});
  dt.items.add(replacement);input.files=dt.files;
  replayingVariablePackageImport=true;
  try{input.dispatchEvent(new Event('change',{bubbles:true}));}
  finally{replayingVariablePackageImport=false;}
  return true;
}

function applyPendingVariablePackageImport(){
  const pending=pendingVariablePackageImport;if(!pending)return false;
  const option=document.getElementById('trackSelect')?.selectedOptions?.[0];
  if(!option?.dataset?.indyheatPackageKey)return false;
  const authorKey=authoringKey();if(!authorKey?.startsWith('package:'))return false;
  const template=waypointTemplateRecord(pending.templateIndex);if(!template)return false;
  try{
    installPackageRoutes(authorKey,pending.waypointsBin,template.record.waypointDescriptors);
    setStatus(`Loaded ${pending.folder} with custom waypoint counts ${pending.routeCounts.join('/')} using retail template ${pending.templateIndex} only as the editor host.`);
    pendingVariablePackageImport=null;syncActionButtons();return true;
  }catch(e){
    setStatus('ERROR: '+e.message);pendingVariablePackageImport=null;return false;
  }
}

function installVariableCountImportHook(){
  const input=document.getElementById('circuitPackageInput'),P=globalThis.IndyHeatCircuitPackage;
  if(!input||!P?.parseCircuitZip)return false;if(input.dataset.indyHeatVariableWaypointHook)return true;
  input.dataset.indyHeatVariableWaypointHook='1';
  input.addEventListener('change',ev=>{
    if(replayingVariablePackageImport)return;
    const file=ev.target.files?.[0];if(!file)return;
    // Leave normal retail-shaped packages entirely to the established importer.
    // For a variable-count package that old importer will reject its count-shape;
    // once that attempt has completed, replay a temporary host-shaped copy and
    // immediately restore the real detached routes.
    (async()=>{
      try{
        const bytes=new Uint8Array(await file.arrayBuffer()),pkg=P.parseCircuitZip(bytes),entries=P.readZipStore(bytes);
        if(globalThis.IndyHeatCustomCircuitLibrary?.ownsCircuitIndex?.(pkg.circuitIndex))return;
        const templateIndex=templateIndexFromCircuitZip(P,entries,pkg.folder);
        if(templateIndex==null)return;
        const template=waypointTemplateRecord(templateIndex);if(!template)return;
        const templateCounts=template.record.waypointDescriptors.map(set=>set.points.length);
        if(!pkg.routeCounts.some((count,i)=>count!==templateCounts[i]))return;
        // Give the legacy import attempt time to report/reject the shape before
        // the corrected replay replaces it.
        await new Promise(resolve=>setTimeout(resolve,50));
        await prepareVariableCountPackageImport(input,file);
      }catch(e){
        pendingVariablePackageImport=null;setStatus('ERROR: '+e.message);
      }
    })();
  },true);
  return true;
}

// Circuit ZIP export already serialises through the public package API.  Once a
// route has been structurally edited, make that API prefer the detached live
// waypoint sets so variable route counts are emitted without changing retail
// main-image spans.
function installPackageEncoderHook(){
  const P=globalThis.IndyHeatCircuitPackage;if(!P?.encodeWaypointsBin)return false;if(P.__indyHeatWaypointStructureHook)return true;
  const base=P.encodeWaypointsBin;packageBaseEncodeWaypoints=base;
  P.encodeWaypointsBin=function(record,main){
    const ov=currentOverride();
    if(ov?.sets?.length===3){
      const selectedIndex=Number(document.getElementById('trackSelect')?.value||0),recordIndex=T.TRACK_BASE_IDS?.indexOf(record?.baseResourceId);
      if(recordIndex==null||recordIndex<0||recordIndex===selectedIndex)return base({waypointDescriptors:ov.sets},null);
    }
    return base(record,main);
  };
  P.__indyHeatWaypointStructureHook=true;return true;
}

// Structural add/delete takes ownership of left click before app.js can start a drag.
view.addEventListener('pointermove',ev=>{if(!actionMode)return;updateActionHover(ev);render();});
view.addEventListener('pointerleave',()=>{if(!actionMode)return;actionHover=null;render();});
view.addEventListener('pointerdown',ev=>{
  if(actionMode){
    if(ev.button===0){ev.preventDefault();ev.stopImmediatePropagation();try{updateActionHover(ev);if(actionMode==='add')addWaypointAt(actionHover?.pos,actionHover?.candidate);else deleteWaypoint(actionHover?.best);updateActionHover(ev);render();}catch(e){setStatus('ERROR: '+e.message);}return;}
    if(ev.button===2){ev.preventDefault();ev.stopImmediatePropagation();return;}
  }
  if(ev.button!==2)return;
  const best=hitWaypoint(ev);if(!best)return;ev.preventDefault();ev.stopImmediatePropagation();
},true);

view.addEventListener('contextmenu',ev=>{
  if(actionMode){ev.preventDefault();ev.stopImmediatePropagation();return;}
  const best=hitWaypoint(ev);if(!best)return;ev.preventDefault();ev.stopImmediatePropagation();
  const p=best.p,nextFlag=!p.progressFlag;
  try{
    selectWaypoint(best);T.writeWaypoint(model.main,p,{x:p.x,y:p.y,progress:p.progress,progressFlag:nextFlag,linkDelta:p.linkDelta});noteEdit(p);
    const addr=p.runtimeAddress;refreshWaypointModels(addr);updateWaypointValidation();updateWaypointEditor();updateWaypointFitStats();render();
    const updated=state.selectedWaypoint,route=updated?('ABC'[updated.setIndex]||'?'):('ABC'[p.setIndex]||'?'),index=updated?.index??p.index;
    document.getElementById('editStatus').textContent=`${nextFlag?'Enabled':'Removed'} AI Turbo marker on Route ${route} waypoint ${index}.`;
  }catch(e){document.getElementById('editStatus').textContent='ERROR: '+e.message;refreshWaypointModels(p.runtimeAddress);updateWaypointEditor();render();}
});

document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&actionMode)setActionMode(null);});
document.getElementById('trackSelect')?.addEventListener('change',()=>setTimeout(()=>{
  actionHover=null;
  applyPendingVariablePackageImport();
  // A normal selected-track refresh reparses the retail host. Variable-count
  // custom routes live outside those fixed spans, so re-assert the detached
  // override after every circuit change/materialisation refresh.
  const ov=currentOverride();
  if(ov?.sets?.length===3){
    applyOverrideToState(ov,null);updateWaypointValidation();updateWaypointEditor();updateWaypointFitStats();updateEditExportButtons();render();
  }
  syncActionButtons();
},0));
document.addEventListener('indyheat-race-setup-capture',()=>setTimeout(syncActionButtons,0));
document.getElementById('fileInput')?.addEventListener('change',()=>setTimeout(syncActionButtons,0));

installActionControls();installFlipControl();
function installPackageBridges(){
  const encoder=installPackageEncoderHook(),importer=installVariableCountImportHook();
  return encoder&&importer;
}
let packageBridgeTries=0;
function retryPackageBridges(){
  if(installPackageBridges()||++packageBridgeTries>200)return;
  setTimeout(retryPackageBridges,50);
}
retryPackageBridges();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{retryPackageBridges();syncActionButtons();},{once:true});
else setTimeout(()=>{retryPackageBridges();syncActionButtons();},0);

// Small public bridge for package/export diagnostics and focused regression tests.
function routesForKey(key){return waypointOverrides.get(String(key||''))?.sets||null;}
function clearPackageRoutes(key){
  key=String(key||'');const had=waypointOverrides.delete(key);
  if(had&&authoringKey()===key){
    baseRefreshWaypointModels(null);updateWaypointValidation();updateWaypointEditor();updateWaypointFitStats();updateEditExportButtons();render();
  }
  return had;
}
globalThis.IndyHeatWaypointAuthoring={
  version:'0.69',minimumPerRoute:MIN_ROUTE_WAYPOINTS,
  hasStructuralEdits:()=>!!currentOverride(),
  currentRoutes:()=>currentOverride()?.sets||null,
  routeCounts:()=>currentOverride()?.sets?.map(s=>s.points.length)||null,
  routesForKey,clearPackageRoutes,installPackageRoutes,cleanRouteData,globalSequenceCompression,routeCProximity
};
})();
