(function(root){
'use strict';

/*
 * Shared indexed-palette control.
 *
 * Hosts provide their own colour records and primary/secondary callbacks. This
 * module owns persistent swatch interaction plus the shared colour-stencil UI.
 * A stencil protects destination pixels whose CURRENT colour index is selected;
 * drawing code can query/apply that mask without caring which editor owns it.
 */
const states=new WeakMap();

function resolveHost(host){
  return typeof host==='string'?document.getElementById(host):(host||null);
}
function newStencilState(){return {active:false,setup:false,locked:new Set(),draft:new Set(),bar:null};}
function stateFor(host){
  host=resolveHost(host);if(!host)return null;
  let st=states.get(host);
  if(!st){st={host,config:{},stencil:newStencilState()};states.set(host,st);install(st);}
  return st;
}
function injectStyles(){
  if(document.getElementById('indyheatPaletteControlStyle'))return;
  const style=document.createElement('style');style.id='indyheatPaletteControlStyle';style.textContent=`
    .indyheatPaletteSwatch{position:relative}
    .indyheatPaletteSwatch.stencilLocked{opacity:.65}
    .indyheatPaletteSwatch.stencilLocked::after{content:'×';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:16px;line-height:1;text-shadow:0 1px 2px #000,1px 0 2px #000,-1px 0 2px #000;pointer-events:none}
    .indyheatStencilControls{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;align-items:center;margin:5px 0}
    .indyheatStencilControls button{min-width:0;padding:5px 4px;font-size:10px;white-space:nowrap}
    .indyheatStencilControls button.active{border-color:#d6b54a;background:#5a4a1c;box-shadow:inset 0 0 0 1px #d6b54a}
    .indyheatStencilState{grid-column:1/-1;font-size:9px;color:#9aa1ad;min-height:12px;line-height:1.25}
  `;document.head.appendChild(style);
}
function emitStencilChange(st){
  const s=st.stencil,chosen=s.setup?s.draft:s.locked;
  st.host.dispatchEvent(new CustomEvent('indyheat-palette-stencil-change',{bubbles:true,detail:{active:s.active,setup:s.setup,locked:[...chosen].sort((a,b)=>a-b)}}));
}
function install(st){
  injectStyles();
  const host=st.host;if(host.dataset.indyheatPaletteControl==='1')return;
  host.dataset.indyheatPaletteControl='1';
  host.addEventListener('pointerdown',e=>{
    const swatch=e.target?.closest?.('[data-palette-index]');
    if(!swatch||!host.contains(swatch))return;
    const secondary=e.button===2||(e.button===0&&e.ctrlKey);
    if(e.button!==0&&!secondary)return;
    const index=Number(swatch.dataset.paletteIndex);if(!Number.isInteger(index))return;
    const cfg=st.config,s=st.stencil;

    // Stencil setup temporarily owns ordinary left-click. Right-click/Ctrl-click
    // remains available for the host's normal secondary-colour action.
    if(cfg.stencil&&s.setup&&e.button===0&&!e.ctrlKey){
      e.preventDefault();e.stopImmediatePropagation();
      if(s.draft.has(index))s.draft.delete(index);else s.draft.add(index);
      render(host);updateStencilUi(st);emitStencilChange(st);return;
    }

    let role=secondary?'secondary':'primary';
    if(role==='primary'&&typeof cfg.primaryTarget==='function'){
      role=cfg.primaryTarget(index,e)==='secondary'?'secondary':'primary';
    }
    const fn=role==='secondary'?cfg.onSecondary:cfg.onPrimary;
    if(typeof fn!=='function')return;
    e.preventDefault();e.stopImmediatePropagation();
    fn(index,e);
    render(host);
  },true);
  host.addEventListener('contextmenu',e=>{
    const swatch=e.target?.closest?.('[data-palette-index]');
    if(!swatch||!host.contains(swatch))return;
    e.preventDefault();e.stopImmediatePropagation();
  },true);
}
function valueOf(v){return typeof v==='function'?v():v;}
function recordsOf(cfg){
  const records=valueOf(cfg.records);
  return Array.isArray(records)?records:[];
}
function cleanStencilRange(st){
  const count=recordsOf(st.config).length,s=st.stencil;
  for(const set of [s.locked,s.draft])for(const v of [...set])if(v<0||v>=count)set.delete(v);
}
const EMPTY_STENCIL_SET=new Set();
function visibleStencilSet(st){
  const s=st.stencil;
  if(s.setup)return s.draft;
  if(s.active)return s.locked;
  return EMPTY_STENCIL_SET;
}
function classNameFor(st,index,record){
  const cfg=st.config,classes=['indyheatPaletteSwatch'];
  if(cfg.swatchClass)classes.push(cfg.swatchClass);
  if(Number(valueOf(cfg.primary))===index)classes.push(cfg.primaryClass||'selected');
  if(Number(valueOf(cfg.secondary))===index)classes.push(cfg.secondaryClass||'transparentIndex');
  if(cfg.stencil&&visibleStencilSet(st).has(index))classes.push('stencilLocked');
  const extra=typeof cfg.classes==='function'?cfg.classes(index,record):null;
  if(Array.isArray(extra))classes.push(...extra.filter(Boolean));
  else if(extra)classes.push(String(extra));
  return classes.join(' ');
}
function titleFor(st,index,record){
  const cfg=st.config;let title=record?.title||'';
  if(typeof cfg.title==='function')title=cfg.title(index,record)||title;
  if(Number(valueOf(cfg.secondary))===index&&cfg.secondaryTitle){
    const extra=typeof cfg.secondaryTitle==='function'?cfg.secondaryTitle(index,record):cfg.secondaryTitle;
    if(extra)title=title?`${title} · ${extra}`:String(extra);
  }
  if(cfg.stencil&&visibleStencilSet(st).has(index))title=title?`${title} · stencil locked`:'Stencil locked';
  return title;
}
function ensureStencilUi(st){
  const cfg=st.config,s=st.stencil,host=st.host;
  if(!cfg.stencil){if(s.bar)s.bar.hidden=true;return null;}
  if(!s.bar){
    const bar=document.createElement('div');bar.className='indyheatStencilControls';bar.dataset.paletteStencilFor=host.id||'';
    const setup=document.createElement('button');setup.type='button';setup.dataset.stencilAction='setup';setup.textContent='Setup';setup.title='Choose destination colours to protect. While Setup is active, left-click swatches to lock/unlock them.';
    const apply=document.createElement('button');apply.type='button';apply.dataset.stencilAction='apply';apply.textContent='Apply';apply.title='Apply the selected stencil. Click again while active to switch the stencil off.';
    const invert=document.createElement('button');invert.type='button';invert.dataset.stencilAction='invert';invert.textContent='Invert';invert.title='Swap locked and unlocked colours.';
    const state=document.createElement('div');state.className='indyheatStencilState';state.dataset.stencilState='1';
    bar.append(setup,apply,invert,state);host.insertAdjacentElement('beforebegin',bar);s.bar=bar;
    setup.addEventListener('click',()=>{
      if(!s.setup){s.draft=new Set(s.locked);s.setup=true;}else{s.setup=false;s.draft=new Set(s.locked);}
      render(host);updateStencilUi(st);emitStencilChange(st);
    });
    apply.addEventListener('click',()=>{
      if(s.active&&!s.setup){s.active=false;}
      else{if(s.setup)s.locked=new Set(s.draft);s.active=true;s.setup=false;s.draft=new Set(s.locked);}
      render(host);updateStencilUi(st);emitStencilChange(st);
    });
    invert.addEventListener('click',()=>{
      const count=recordsOf(cfg).length,target=s.setup?s.draft:s.locked,next=new Set();
      for(let i=0;i<count;i++)if(!target.has(i))next.add(i);
      if(s.setup)s.draft=next;else{s.locked=next;s.draft=new Set(next);}
      render(host);updateStencilUi(st);emitStencilChange(st);
    });
  }
  s.bar.hidden=false;return s.bar;
}
function updateStencilUi(st){
  const s=st.stencil,bar=ensureStencilUi(st);if(!bar)return;
  const setup=bar.querySelector('[data-stencil-action="setup"]'),apply=bar.querySelector('[data-stencil-action="apply"]'),invert=bar.querySelector('[data-stencil-action="invert"]'),status=bar.querySelector('[data-stencil-state]');
  const chosen=s.setup?s.draft:s.locked,count=recordsOf(st.config).length;
  setup?.classList.toggle('active',s.setup);
  apply?.classList.toggle('active',s.active&&!s.setup);
  if(apply)apply.textContent=s.active&&!s.setup?'Stencil ON':'Apply';
  if(invert)invert.disabled=!count;
  if(status)status.textContent=s.setup?`Setup · ${chosen.size} colour${chosen.size===1?'':'s'} selected · left-click swatches`:(s.active?`Stencil on · ${s.locked.size} colour${s.locked.size===1?'':'s'} protected`:`Stencil off · ${s.locked.size} colour${s.locked.size===1?'':'s'} selected`);
}
function render(host){
  const st=stateFor(host);if(!st)return false;
  cleanStencilRange(st);
  const cfg=st.config,records=recordsOf(cfg),h=st.host;
  h.replaceChildren();
  for(let index=0;index<records.length;index++){
    const record=records[index],button=document.createElement('button');
    button.type='button';button.dataset.paletteIndex=String(index);
    if(cfg.legacyDataKey)button.dataset[cfg.legacyDataKey]=String(index);
    button.className=classNameFor(st,index,record);
    const rgb=record?.rgb||[255,0,255];button.style.background=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    const title=titleFor(st,index,record);if(title)button.title=title;
    h.appendChild(button);
  }
  updateStencilUi(st);return true;
}
function configure(host,options={}){
  const st=stateFor(host);if(!st)return false;
  Object.assign(st.config,options);cleanStencilRange(st);ensureStencilUi(st);
  return render(st.host);
}
function choose(host,index,role='primary'){
  const st=stateFor(host);if(!st)return false;
  index=Number(index);if(!Number.isInteger(index))return false;
  const cfg=st.config,fn=role==='secondary'?cfg.onSecondary:cfg.onPrimary;
  if(typeof fn!=='function')return false;
  fn(index,null);return render(st.host);
}
function getConfig(host){return stateFor(host)?.config||null;}
function stencilActive(host){const st=stateFor(host);return !!(st?.config?.stencil&&st.stencil.active);}
function stencilBlocked(host,index){
  const st=stateFor(host);index=Number(index);
  return !!(st?.config?.stencil&&st.stencil.active&&Number.isInteger(index)&&st.stencil.locked.has(index));
}
function stencilAllows(host,index){return !stencilBlocked(host,index);}
function stencilSelection(host,{draft=false}={}){
  const st=stateFor(host);if(!st)return [];
  const set=draft&&st.stencil.setup?st.stencil.draft:st.stencil.locked;
  return [...set].sort((a,b)=>a-b);
}
function applyStencilPixels(host,before,after){
  const st=stateFor(host);if(!st?.config?.stencil||!st.stencil.active||!before||!after||before.length!==after.length)return after;
  let out=after;
  for(let i=0;i<before.length;i++)if(st.stencil.locked.has(Number(before[i]))){
    if(out===after)out=typeof after.slice==='function'?after.slice():Array.from(after);
    out[i]=before[i];
  }
  return out;
}

const api=Object.freeze({configure,render,choose,getConfig,stencilActive,stencilBlocked,stencilAllows,stencilSelection,applyStencilPixels});
root.IndyHeatPaletteControl=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
