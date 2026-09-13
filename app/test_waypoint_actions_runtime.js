'use strict';
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const handlers={};
const status={textContent:''};
const view={addEventListener:(name,fn,capture)=>{handlers[name]={fn,capture};}};
const nodes={
  view,
  showWaypoints:{checked:true},
  editStatus:status
};
global.document={getElementById:id=>nodes[id]||null};
global.getComputedStyle=()=>({pointerEvents:'none'});
global.selected={};
global.model={main:new Uint8Array(64)};
const point={runtimeAddress:0x1234,fileOffset:0,index:7,setIndex:1,x:10,y:-3,progress:12,progressFlag:true,linkDelta:6};
global.state={waypoints:[{points:[point]}],selectedWaypoint:point};
global.eventCanvasXY=()=>({x:100,y:80});
global.nearestWaypointAt=()=>({p:point,d2:0});
let writes=[];
global.T={writeWaypoint:(main,p,change)=>{writes.push({...change});p.progressFlag=change.progressFlag;}};
let calls=[];
for(const name of ['selectWaypoint','noteEdit','refreshWaypointModels','updateWaypointValidation','updateWaypointEditor','updateWaypointFitStats','render']){
  global[name]=(...args)=>{calls.push([name,...args]); if(name==='selectWaypoint')global.state.selectedWaypoint=args[0].p;};
}
vm.runInThisContext(fs.readFileSync('waypoint-actions.js','utf8'),{filename:'waypoint-actions.js'});
assert(handlers.pointerdown&&handlers.pointerdown.capture===true,'right-button pointerdown interceptor must use capture phase');
assert(handlers.contextmenu,'contextmenu handler missing');
function event(button=2){return {button,prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};}
let e=event();handlers.pointerdown.fn(e);assert(e.prevented&&e.stopped,'right-button waypoint pointerdown must suppress drag');
e=event();handlers.contextmenu.fn(e);assert(e.prevented&&e.stopped,'waypoint context menu must be suppressed');
assert.equal(writes.length,1);
assert.deepEqual(writes[0],{x:10,y:-3,progress:12,progressFlag:false,linkDelta:6},'toggle must preserve every field except bit 7');
assert(status.textContent.includes('Removed AI Turbo marker'),'status should report removal');
assert(calls.some(c=>c[0]==='noteEdit'),'edit tracking missing');
assert(calls.some(c=>c[0]==='refreshWaypointModels'),'model refresh missing');

// A miss must leave normal browser/context behaviour alone.
global.nearestWaypointAt=()=>null;
e=event();handlers.contextmenu.fn(e);assert(!e.prevented&&!e.stopped,'empty-space context menu should not be consumed');

// Bitmap editing overlay remains authoritative for Surface/Foreground right-clicks.
nodes.layerEditCanvas={};
global.getComputedStyle=()=>({pointerEvents:'auto'});
global.nearestWaypointAt=()=>({p:point,d2:0});
e=event();handlers.contextmenu.fn(e);assert(!e.prevented&&!e.stopped,'bitmap edit mode must not be intercepted');
console.log('Waypoint AI Turbo marker right-click runtime test OK');
