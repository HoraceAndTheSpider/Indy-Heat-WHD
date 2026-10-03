(function(root){
'use strict';

/* Bollard Special Function.
 *
 * Pencil places one five-pixel bollard at the final pointer position. The
 * supplied bollard.ihbrush reference is a one-pixel column:
 *
 *   white
 *   colour
 *   white
 *   colour
 *   white  + one-pixel ground shadow to left/right
 *
 * The placement point is the bottom/base pixel so the object grows upward
 * from the track. Only the bollard body affects Foreground/Background; the
 * ground shadow does not. The Surface cell under the base is always Collision.
 */
const S=root.IndyHeatSpecialFunctions;if(!S?.register)return;

const VERSION='1.000';
const MASK_FOREGROUND=0;
const MASK_BACKGROUND=1;
const COLLISION=1;
const WHITE=3;
const SHADOW=4;

const settings={
  bodyColour:31,
  shadowDirection:'left',
  layerMode:'background'
};

const SHADOW_OPTIONS=Object.freeze([
  Object.freeze({value:'left',label:'Left'}),
  Object.freeze({value:'right',label:'Right'})
]);
const LAYER_OPTIONS=Object.freeze([
  Object.freeze({value:'foreground',label:'Foreground'}),
  Object.freeze({value:'background',label:'Background'})
]);

function inBounds(ctx,x,y){return x>=0&&y>=0&&x<ctx.width&&y<ctx.height;}
function point(p){
  if(!p||!Number.isFinite(Number(p.x))||!Number.isFinite(Number(p.y)))return null;
  return {x:Math.round(Number(p.x)),y:Math.round(Number(p.y))};
}
function placementPoint(g){
  const pts=Array.isArray(g?.points)?g.points:[];
  for(let i=pts.length-1;i>=0;i--){const p=point(pts[i]);if(p)return p;}
  return point(g?.end)||point(g?.start);
}
function bodyPoints(anchor){
  if(!anchor)return [];
  return [0,1,2,3,4].map(d=>({x:anchor.x,y:anchor.y-4+d,index:(d&1)?settings.bodyColour:WHITE}));
}
function shadowPoint(anchor){
  if(!anchor)return null;
  return {x:anchor.x+(settings.shadowDirection==='right'?1:-1),y:anchor.y};
}
function setBackdrop(ctx,pixels,x,y,index){
  if(!inBounds(ctx,x,y))return false;
  pixels[y*ctx.width+x]=ctx.helpers.validIndex(index);return true;
}
function setMask(ctx,mask,x,y,value){
  if(!inBounds(ctx,x,y))return false;
  mask[y*ctx.width+x]=value;return true;
}
function setCollision(ctx,surface,x,y){
  const helper=ctx.helpersFor('surface'),p=helper.screenToLayer(x,y);if(!p)return false;
  const info=ctx.layerInfo('surface');
  if(p.x<0||p.y<0||p.x>=info.width||p.y>=info.height)return false;
  surface[p.y*info.width+p.x]=COLLISION;return true;
}
function render(ctx){
  const anchor=placementPoint(ctx.geometry);if(!anchor)return {message:'Bollard: place with Pencil.'};
  const backdrop=ctx.layer('backdrop'),foreground=ctx.layer('foreground'),surface=ctx.layer('surface');
  const body=bodyPoints(anchor),shadow=shadowPoint(anchor),maskValue=settings.layerMode==='foreground'?MASK_FOREGROUND:MASK_BACKGROUND;
  let bodyPx=0,maskPx=0;
  for(const p of body){
    if(setBackdrop(ctx,backdrop,p.x,p.y,p.index))bodyPx++;
    if(setMask(ctx,foreground,p.x,p.y,maskValue))maskPx++;
  }
  if(shadow)setBackdrop(ctx,backdrop,shadow.x,shadow.y,SHADOW);
  const collision=setCollision(ctx,surface,anchor.x,anchor.y);
  return {message:`Bollard committed · colour ${settings.bodyColour} · shadow ${settings.shadowDirection} · ${settings.layerMode} · ${bodyPx}px body · mask ${maskPx}px${collision?' · collision':''}.`};
}

function ensureToggleStyle(){
  if(typeof document==='undefined'||document.getElementById('indyheatBollardToggleStyle'))return;
  const style=document.createElement('style');style.id='indyheatBollardToggleStyle';
  style.textContent=`.bollardToggle{display:inline-flex;gap:3px;justify-content:flex-end;flex-wrap:wrap}.bollardToggle button{padding:2px 7px;min-height:22px;font-size:10px}.bollardToggle button[aria-pressed="true"]{border-color:#d6b54a;background:#40391f;box-shadow:inset 0 0 0 1px #8f792f}`;
  document.head.appendChild(style);
}
function toggleButtons(container,ctx,{label,value,options,onChange}){
  if(typeof document==='undefined'||!container?.appendChild){ctx.ui.select(container,{label,value,options,onChange});return;}
  ensureToggleStyle();
  const row=document.createElement('div');row.className='specialControlRow';
  const name=document.createElement('span');name.textContent=label;
  const wrap=document.createElement('span');wrap.className='bollardToggle';
  const buttons=[];
  const refresh=()=>{for(const [button,item] of buttons)button.setAttribute('aria-pressed',String(item.value===value));};
  for(const item of options){
    const button=document.createElement('button');button.type='button';button.textContent=item.label;
    button.addEventListener('click',()=>{value=item.value;onChange?.(value);refresh();ctx.requestRedraw?.();});
    buttons.push([button,item]);wrap.appendChild(button);
  }
  refresh();row.append(name,wrap);container.appendChild(row);
}
function mountControls(container,ctx){
  if(ctx.ui.paletteColour)ctx.ui.paletteColour(container,{label:'Body colour',value:settings.bodyColour,onInput:v=>{settings.bodyColour=v;}});
  else ctx.ui.paletteIndex(container,{label:'Body colour',value:settings.bodyColour,onInput:v=>{settings.bodyColour=v;}});
  toggleButtons(container,ctx,{label:'Shadow',value:settings.shadowDirection,options:SHADOW_OPTIONS,onChange:v=>{settings.shadowDirection=v;}});
  toggleButtons(container,ctx,{label:'Layer',value:settings.layerMode,options:LAYER_OPTIONS,onChange:v=>{settings.layerMode=v;}});
}

S.register({
  id:'bollard',
  name:'Bollard',
  version:VERSION,
  category:'Track',
  status:'prototype',
  description:'Place the supplied five-pixel striped bollard with selectable body colour, one-pixel left/right ground shadow, Foreground/Background occlusion and automatic Surface collision at its base.',
  supportedModes:['backdrop'],
  supportedTools:['freehand'],
  layers:['backdrop','foreground','surface'],
  mountControls,
  preview:render,
  apply:render
});

})(typeof globalThis!=='undefined'?globalThis:this);
