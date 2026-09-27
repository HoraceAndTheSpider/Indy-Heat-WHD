(function(root){
'use strict';

// Shared live-edit guard.
// Prevents model/UI refresh passes from rewriting a control while the user is
// actively manipulating it, and coalesces expensive post-edit refresh work to
// one animation frame.
const CONTROL_SELECTOR='input,select,textarea';
const TEXT_EDIT_TYPES=new Set(['text','search','number','email','tel','url','password']);
let activeControl=null;
const frameTasks=new Map();
const idleTasks=new Map();

function isControl(el){return !!el?.matches?.(CONTROL_SELECTOR);}
function focusKeepsEditing(el){
  if(!isControl(el))return false;
  if(el.tagName==='TEXTAREA')return true;
  if(el.tagName!=='INPUT')return false;
  return TEXT_EDIT_TYPES.has(String(el.type||'text').toLowerCase());
}
function focusedEditingControl(){
  const el=document.activeElement;
  return focusKeepsEditing(el)?el:null;
}
function editing(el=null){
  const current=(isControl(activeControl)&&activeControl.isConnected)?activeControl:null;
  const focused=focusedEditingControl();
  if(el)return el===current||el===focused;
  return !!(current||focused);
}
function within(node){
  if(!node)return false;
  const current=(isControl(activeControl)&&activeControl.isConnected)?activeControl:null;
  const focused=focusedEditingControl();
  return !!((current&&node.contains(current))||(focused&&node.contains(focused)));
}
function setValue(el,value,{force=false}={}){
  if(!el)return false;
  if(!force&&editing(el))return false;
  const next=String(value??'');
  if(el.value!==next)el.value=next;
  return true;
}
function setChecked(el,value,{force=false}={}){
  if(!el)return false;
  if(!force&&editing(el))return false;
  const next=!!value;if(el.checked!==next)el.checked=next;return true;
}
function frame(key,fn){
  key=String(key||'default');
  if(frameTasks.has(key))cancelAnimationFrame(frameTasks.get(key));
  const id=requestAnimationFrame(()=>{frameTasks.delete(key);try{fn?.();}catch(e){console.error(e);}});
  frameTasks.set(key,id);return id;
}
function whenIdle(key,fn){
  key=String(key||'default');
  if(editing()){idleTasks.set(key,fn);return false;}
  frame(key,fn);return true;
}
function release(control){
  if(activeControl===control)activeControl=null;

  // A control has finished even when focus moves straight into another control.
  // Consumers use this event for post-edit clamping/reconciliation.  The newly
  // focused control remains protected by editing()/setValue(), so a refresh
  // triggered for the control we just left cannot overwrite the next one.
  document.dispatchEvent(new CustomEvent('indyheat-edit-finished',{detail:{control:control||null}}));

  // Work explicitly queued with whenIdle() still waits until no control is
  // active at all.  This keeps expensive/global refreshes out of an edit chain.
  if(editing())return;
  const queued=[...idleTasks.entries()];idleTasks.clear();
  for(const [key,fn] of queued)frame(`idle:${key}`,fn);
}

function inputType(el){return el?.tagName==='INPUT'?String(el.type||'text').toLowerCase():'';}
function releaseOnChange(el){
  if(!isControl(el))return false;
  if(el.tagName==='SELECT')return true;
  if(el.tagName!=='INPUT')return false;
  return ['checkbox','radio','color','date','datetime-local','month','time','week','file'].includes(inputType(el));
}
function releaseOnPointerUp(el){return isControl(el)&&el.tagName==='INPUT'&&inputType(el)==='range';}

document.addEventListener('focusin',e=>{if(isControl(e.target))activeControl=e.target;},true);
document.addEventListener('pointerdown',e=>{
  const target=isControl(e.target)?e.target:null;
  if(activeControl&&activeControl!==target&&!focusKeepsEditing(activeControl))release(activeControl);
  if(target)activeControl=target;
},true);
document.addEventListener('pointerup',e=>{
  const control=(isControl(activeControl)&&activeControl.isConnected)?activeControl:null;
  if(control&&releaseOnPointerUp(control))setTimeout(()=>release(control),0);
},true);
document.addEventListener('pointercancel',()=>{
  const control=(isControl(activeControl)&&activeControl.isConnected)?activeControl:null;
  if(control&&!focusKeepsEditing(control))setTimeout(()=>release(control),0);
},true);
document.addEventListener('change',e=>{
  if(releaseOnChange(e.target))setTimeout(()=>release(e.target),0);
},true);
document.addEventListener('cancel',e=>{
  if(isControl(e.target))setTimeout(()=>release(e.target),0);
},true);
document.addEventListener('focusout',e=>{
  if(!isControl(e.target))return;
  setTimeout(()=>{if(document.activeElement!==e.target)release(e.target);},0);
},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&isControl(e.target))setTimeout(()=>release(e.target),0);},true);

root.IndyHeatEditGuard=Object.freeze({
  VERSION:'0.167',editing,within,setValue,setChecked,frame,whenIdle
});
})(typeof globalThis!=='undefined'?globalThis:this);
