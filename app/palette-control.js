(function(root){
'use strict';

/*
 * Shared indexed-palette swatch control.
 *
 * Backdrop and MiniMap provide their own 32 colour records and state callbacks;
 * this module owns the swatch DOM plus primary/secondary pointer behaviour.
 * The host listener survives every swatch rebuild, so palette refreshes cannot
 * lose left/right selection handlers.
 */
const states=new WeakMap();

function resolveHost(host){
  return typeof host==='string'?document.getElementById(host):(host||null);
}
function stateFor(host){
  host=resolveHost(host);if(!host)return null;
  let st=states.get(host);
  if(!st){st={host,config:{}};states.set(host,st);install(st);}
  return st;
}
function install(st){
  const host=st.host;if(host.dataset.indyheatPaletteControl==='1')return;
  host.dataset.indyheatPaletteControl='1';
  host.addEventListener('pointerdown',e=>{
    const swatch=e.target?.closest?.('[data-palette-index]');
    if(!swatch||!host.contains(swatch))return;
    const secondary=e.button===2||(e.button===0&&e.ctrlKey);
    if(e.button!==0&&!secondary)return;
    const index=Number(swatch.dataset.paletteIndex);if(!Number.isInteger(index))return;
    const cfg=st.config;
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
function classNameFor(cfg,index,record){
  const classes=['indyheatPaletteSwatch'];
  if(cfg.swatchClass)classes.push(cfg.swatchClass);
  if(Number(valueOf(cfg.primary))===index)classes.push(cfg.primaryClass||'selected');
  if(Number(valueOf(cfg.secondary))===index)classes.push(cfg.secondaryClass||'transparentIndex');
  const extra=typeof cfg.classes==='function'?cfg.classes(index,record):null;
  if(Array.isArray(extra))classes.push(...extra.filter(Boolean));
  else if(extra)classes.push(String(extra));
  return classes.join(' ');
}
function titleFor(cfg,index,record){
  let title=record?.title||'';
  if(typeof cfg.title==='function')title=cfg.title(index,record)||title;
  if(Number(valueOf(cfg.secondary))===index&&cfg.secondaryTitle){
    const extra=typeof cfg.secondaryTitle==='function'?cfg.secondaryTitle(index,record):cfg.secondaryTitle;
    if(extra)title=title?`${title} · ${extra}`:String(extra);
  }
  return title;
}
function render(host){
  const st=stateFor(host);if(!st)return false;
  const cfg=st.config,records=recordsOf(cfg),h=st.host;
  h.replaceChildren();
  for(let index=0;index<records.length;index++){
    const record=records[index],button=document.createElement('button');
    button.type='button';
    button.dataset.paletteIndex=String(index);
    if(cfg.legacyDataKey)button.dataset[cfg.legacyDataKey]=String(index);
    button.className=classNameFor(cfg,index,record);
    const rgb=record?.rgb||[255,0,255];
    button.style.background=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    const title=titleFor(cfg,index,record);if(title)button.title=title;
    h.appendChild(button);
  }
  return true;
}
function configure(host,options={}){
  const st=stateFor(host);if(!st)return false;
  Object.assign(st.config,options);
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

const api=Object.freeze({configure,render,choose,getConfig});
root.IndyHeatPaletteControl=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
