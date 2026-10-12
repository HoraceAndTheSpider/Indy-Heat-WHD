/* Indy Heat Circuit Editor — keyboard shortcuts (desktop keyboards).
 * Keeps actions routed through the existing UI, retaining each mode's own history,
 * selection, stencil and drawing behaviour. */
(function(root){
'use strict';
if(root.IndyHeatKeyboardShortcuts?.installed)return;
const $=id=>document.getElementById(id);
const MODES=['layerEditBackdrop','layerEditMask','layerEditSurface','layerModeWaypoints','layerEditRecovery','layerEditRaceSetup','layerEditMini','layerEditMap','layerEditCpuChoices'];
const EDITABLE='textarea,select,[contenteditable],[role="textbox"],[role="combobox"],[role="spinbutton"]';
let paletteCursor=-1, paletteHost=null, magnifyBefore=null, help=null;
const state={installed:true};root.IndyHeatKeyboardShortcuts=state;
function readyButton(selector){const e=typeof selector==='string'?document.querySelector(selector):selector;return e&&e.isConnected&&!e.disabled&&e.getClientRects().length?e:null;}
function click(selector){const b=typeof selector==='string'?document.querySelector(selector):selector;if(!b||!b.isConnected||b.disabled)return false;b.click();return true;}
function mode(){return $('layerModeButtons')?.dataset.currentMode||root.IndyHeatEditorCurrentMode||'layerEditBackdrop';}
function inPlaylist(){return document.body.classList.contains('playlistMode')||document.body.classList.contains('brushManagerMode')||$('playlistWorkspace')?.offsetParent!==null&&!($('playlistWorkspace')?.hidden);}
function activeOverlay(){return !![...document.querySelectorAll('[role="dialog"]:not([hidden]),dialog[open]')].some(d=>d.id!=='indyKeyboardHelp'&&d.getClientRects().length);}
function typing(e){return [e.target,document.activeElement].some(t=>{if(!t?.closest)return false;if(t.closest(EDITABLE)||t.isContentEditable)return true;const input=t.closest('input');return !!(input&&/^(text|number|email|search|url|password|tel|date|time|datetime-local|file|color)$/.test(input.type));});}
function switchMode(dir){const current=mode();const available=MODES.map(id=>$(id)).filter(readyButton);if(!available.length)return false;const at=Math.max(0,available.findIndex(b=>b.id===current));return click(available[(at+dir+available.length)%available.length]);}
function range(id,n){const el=$(id);if(!el||el.disabled)return false;const v=Math.min(Number(el.max)||n,Math.max(Number(el.min)||n,n));if(Number(el.value)===v)return true;el.value=String(v);el.dispatchEvent(new Event('input',{bubbles:true}));if(id!=='editorScale')el.dispatchEvent(new Event('change',{bubbles:true}));return true;}
function zoom(dir){const el=$('editorScale');if(!el)return false;return range('editorScale',Math.round((Number(el.value)+dir*(Number(el.step)||.5))*2)/2);}
function magnify(){const toggle=$('circuitViewportToggle'),viewport=$('circuitViewport'),z=$('editorScale');if(!toggle||!viewport||!z)return false;
 if(magnifyBefore){range('editorScale',magnifyBefore.zoom);if(viewport.classList.contains('fixed')!==magnifyBefore.fixed)toggle.click();magnifyBefore=null;return true;}
 magnifyBefore={zoom:Number(z.value),fixed:viewport.classList.contains('fixed')};if(!magnifyBefore.fixed)toggle.click();range('editorScale',3);return true;
}
function tools(){const m=mode();if(m==='layerEditSurface'||m==='layerEditMask')return [...document.querySelectorAll('input[name="layerTool"]')].filter(x=>!x.disabled).map(input=>({selected:input.checked,run:()=>{input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));}}));
 const s=m==='layerEditMini'?'[data-mini-draw-tool]':m==='layerEditBackdrop'?'[data-backdrop-draw-tool]':null;
 if(!s)return [];return [...document.querySelectorAll(s)].filter(readyButton).map(el=>({selected:el.classList.contains('active'),run:()=>el.click()}));
}
function cycleTools(dir){const a=tools();if(!a.length)return false;const idx=a.findIndex(t=>t.selected);a[(idx+dir+a.length)%a.length].run();return true;}
function undoRedo(redo){const m=mode();const sets={layerEditBackdrop:['backdropPaintUndo','backdropPaintRedo'],layerEditSurface:['layerUndo','layerRedo'],layerEditMask:['layerUndo','layerRedo'],layerEditMini:['circuitPreviewUndo','circuitPreviewRedo'],layerEditRecovery:['recoveryUndo','recoveryRedo'],layerModeWaypoints:['undo','redo']};
 const ids=sets[m];return !!(ids&&click('#'+ids[redo?1:0]));}
function scratch(){if(mode()!=='layerEditBackdrop')return false;const ids=['backdropScratchToggle','backdropScratchButton','backdropScratchMode','backdropScratchSwitch'];for(const id of ids)if(click('#'+id))return true;
 const btn=[...document.querySelectorAll('#backdropPaintTools button,#backdropEditorPane button')].find(b=>/^(scratch\s*(pad|mode)?|use scratch pad|switch to scratch|scratch on|scratch off)$/i.test((b.textContent||'').trim())&&!b.disabled);return btn?click(btn):false;}
function stencil(){if(!['layerEditBackdrop','layerEditSurface','layerEditMask','layerEditMini'].includes(mode()))return null;const host=mode()==='layerEditBackdrop'?'backdropPaintPalette':mode()==='layerEditMini'?'circuitPreviewPalette':'layerStencilPalette';const p=$(host);if(!p)return null;const bar=document.querySelector(`.indyheatStencilControls[data-palette-stencil-for="${host}"]`);return bar?{host:p,bar}:null;}
function setupActive(s){return !!s?.bar.querySelector('[data-stencil-action="setup"].active');}
function applyActive(s){return !!s?.bar.querySelector('[data-stencil-action="apply"].active');}
function focusSwatch(s,i){const b=s.host.querySelectorAll('[data-palette-index]');if(!b.length)return false;paletteHost=s.host;paletteCursor=(i+b.length)%b.length;for(const sw of b)sw.classList.remove('indyShortcutPaletteFocus');b[paletteCursor].classList.add('indyShortcutPaletteFocus');b[paletteCursor].scrollIntoView?.({block:'nearest',inline:'nearest'});return true;}
function stencilStep(){const s=stencil();if(!s)return false;if(!setupActive(s)&&!applyActive(s)){click(s.bar.querySelector('[data-stencil-action="setup"]'));focusSwatch(s,0);return true;}
 if(setupActive(s)){click(s.bar.querySelector('[data-stencil-action="apply"]'));return true;}
 click(s.bar.querySelector('[data-stencil-action="apply"]'));return true;
}
function moveSwatch(delta){const s=stencil();if(!s||!setupActive(s))return false;const count=s.host.querySelectorAll('[data-palette-index]').length;if(!count)return false;return focusSwatch(s,(s.host===paletteHost?paletteCursor:0)+delta);}
function toggleSwatch(){const s=stencil();if(!s||!setupActive(s))return false;const sw=s.host.querySelectorAll('[data-palette-index]');if(!sw.length)return false;if(s.host!==paletteHost||paletteCursor<0)focusSwatch(s,0);sw[paletteCursor]?.click();focusSwatch(s,paletteCursor);return true;}
function changeSize(n){const m=mode();if(m==='layerEditSurface'){const radio=$('layerPaint_'+(n-1));if(radio&&n<=4){radio.checked=true;radio.dispatchEvent(new Event('change',{bubbles:true}));return true;}}
 if(m==='layerEditSurface'||m==='layerEditMask')return range('layerBrushSize',n);
 if(m==='layerEditMini')return range('circuitPreviewBrush',n);
 if(m==='layerEditBackdrop')return range('backdropBrushSize',n);
 return false;}
function pan(key){const viewport=$('circuitViewport');const fixed=viewport?.classList.contains('fixed');const el=fixed?viewport:document.scrollingElement;const step=Math.max(24,Math.round(16*Number($('editorScale')?.value||3)));
 if(!el)return false;const delta={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[key];if(!delta)return false;
 if(fixed&&viewport.scrollWidth<=viewport.clientWidth&&viewport.scrollHeight<=viewport.clientHeight)return false;
 el.scrollBy?.({left:delta[0],top:delta[1],behavior:'auto'});return true;}
function helpToggle(){if(help?.isConnected){help.remove();help=null;return true;}help=document.createElement('div');help.id='indyKeyboardHelp';help.setAttribute('role','dialog');help.setAttribute('aria-label','Keyboard shortcuts');help.tabIndex=-1;
 help.innerHTML='<div class="indyKeyHelpBox"><div class="indyKeyHelpTitle"><strong>Keyboard shortcuts</strong><button type="button" aria-label="Close keyboard shortcuts">×</button></div><div class="indyKeyHelpGrid">'+[
 ['U / R','Undo / Redo'],['Ctrl/⌘ Z, Ctrl/⌘ Y','Undo / Redo'],['J','Toggle Backdrop scratch pad'],['M','Magnify: fixed viewport, 300% (again to restore)'],['+ / −','Zoom in / out'],['Ctrl/⌘ + / −','Next / previous editor mode'],['Space / Shift+Space','Next / previous drawing tool'],['S','Stencil: Setup → Apply → Off'],['Enter','Toggle selected stencil palette colour'],['Arrow keys','Move palette selection during Setup; otherwise pan canvas'],['1–9','Brush size; Surface 1–4 selects surface type'],['?','Show / hide this help'],['Esc','Close shortcuts help']
 ].map(([k,v])=>`<span><kbd>${k}</kbd></span><span>${v}</span>`).join('')+'</div><p>Shortcuts are disabled whilst typing in fields or using the playlist editor.</p></div>';
 help.querySelector('button').addEventListener('click',helpToggle);help.addEventListener('pointerdown',e=>{if(e.target===help)helpToggle()});document.body.appendChild(help);help.focus();return true;}
function installCss(){if($('indyKeyboardStyle'))return;const css=document.createElement('style');css.id='indyKeyboardStyle';css.textContent=`.indyShortcutPaletteFocus{outline:2px solid #f4d46b!important;outline-offset:-2px;box-shadow:0 0 0 2px #181b21,0 0 0 4px #f4d46b!important}#indyKeyboardHelp{position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.69);display:flex;align-items:center;justify-content:center;padding:15px}#indyKeyboardHelp .indyKeyHelpBox{background:#20242e;border:1px solid #69758b;border-radius:8px;color:#e3e7f1;max-width:640px;width:100%;max-height:85vh;overflow:auto;padding:15px;font:13px/1.45 sans-serif}#indyKeyboardHelp .indyKeyHelpTitle{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;font-size:17px}#indyKeyboardHelp button{font-size:23px;color:#fff;background:#303c53;border:1px solid #54627a;cursor:pointer}#indyKeyboardHelp .indyKeyHelpGrid{display:grid;grid-template-columns:minmax(120px,190px) 1fr;gap:7px 12px}#indyKeyboardHelp kbd{display:inline-block;background:#353b49;border:1px solid #636d80;border-radius:3px;padding:1px 4px;font-size:12px}#indyKeyboardHelp p{color:#aab2c0;margin:12px 0 0}`;document.head.appendChild(css);}
function onKey(e){if(e.defaultPrevented||e.isComposing||e.altKey||typing(e)||inPlaylist())return;if(e.repeat&&!/^Arrow/.test(e.key))return;if(/^Arrow/.test(e.key)&&document.activeElement?.matches?.('input[type=range]'))return;if(help){if(e.key==='Escape'||e.key==='?'||e.key==='/'){e.preventDefault();helpToggle();}return;}if(activeOverlay())return;
 const k=e.key.toLowerCase(),meta=e.ctrlKey||e.metaKey;let handled=false;
 if(meta){if(k==='z')handled=undoRedo(!!e.shiftKey);else if(k==='y')handled=undoRedo(true);else if(k==='+'||k==='='||k==='add')handled=switchMode(1);else if(k==='-'||k==='subtract')handled=switchMode(-1);}
 else if(!e.shiftKey&&k==='u')handled=undoRedo(false);
 else if(!e.shiftKey&&k==='r')handled=undoRedo(true);
 else if(!e.shiftKey&&k==='j')handled=scratch();
 else if(!e.shiftKey&&k==='m')handled=magnify();
 else if(k==='+'||k==='='||k==='add')handled=zoom(1);
 else if(k==='-'||k==='_'||k==='subtract')handled=zoom(-1);
 else if(e.code==='Space'||k===' ')handled=cycleTools(e.shiftKey?-1:1);
 else if(!e.shiftKey&&k==='s')handled=stencilStep();
 else if(k==='enter')handled=toggleSwatch();
 else if(/^arrow(left|right|up|down)$/i.test(e.key)){const s=stencil();if(setupActive(s)){const stride=e.key==='ArrowUp'?-8:e.key==='ArrowDown'?8:e.key==='ArrowLeft'?-1:1;handled=moveSwatch(stride);}else handled=pan(e.key);}
 else if(/^[1-9]$/.test(k)&&!e.shiftKey)handled=changeSize(Number(k));
 else if(k==='?'||(e.shiftKey&&k==='/'))handled=helpToggle();
 if(handled)e.preventDefault();}
function install(){installCss();document.addEventListener('keydown',onKey,true);const header=$('layerEditorColumn')||$('headerTools');if(header&&!$('indyShortcutHelpButton')){const b=document.createElement('button');b.type='button';b.id='indyShortcutHelpButton';b.textContent='⌨ Shortcuts';b.title='Keyboard shortcuts (?)';b.style.cssText='display:block;margin-top:9px;min-height:30px;font-size:11px;white-space:nowrap;max-width:100%';b.addEventListener('click',helpToggle);header.appendChild(b);}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(typeof globalThis!=='undefined'?globalThis:this);
