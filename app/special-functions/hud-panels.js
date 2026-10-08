(function(root){
'use strict';

/* HUD Panels Special Function.
 *
 * The three lower player panels are normal IHBR catalogue brushes. This function
 * owns their game-specific placement as one Backdrop + Foreground operation.
 * The authored Race setting supplies the shared vertical offset used by the
 * runtime fuel/damage bars, speedometer, PIT/status graphics and these panels.
 */
const S=root.IndyHeatSpecialFunctions;if(!S?.register)return;

const VERSION='1.002';
const BASE_Y=212;
const MAX_OFFSET=12;
const FOREGROUND_VALUE=0;
const PANELS=Object.freeze([
  Object.freeze({id:'builtin:backdrop:hud-red',x:8}),
  Object.freeze({id:'builtin:backdrop:hud-white',x:112}),
  Object.freeze({id:'builtin:backdrop:hud-blue',x:216})
]);
let brushLoadPromise=null;

function hudOffset(){
  let value=Number(root.IndyHeatRaceSetupState?.currentHudLowerOffset?.()??0);
  if(!Number.isInteger(value))value=0;
  return Math.max(0,Math.min(MAX_OFFSET,value));
}
function brushFor(id){
  const entry=root.IndyHeatBrushLibrary?.get?.(id),brush=entry?.brush;
  return brush?.pixels?brush:null;
}
function brushesReady(){return PANELS.every(panel=>!!brushFor(panel.id));}
function ensureBrushes(){
  if(brushesReady())return Promise.resolve(true);
  const refresh=root.IndyHeatBrushLibrary?.refreshFolderBrushes;
  if(typeof refresh!=='function')return Promise.resolve(false);
  if(!brushLoadPromise){
    brushLoadPromise=Promise.resolve()
      .then(()=>refresh.call(root.IndyHeatBrushLibrary))
      .then(()=>brushesReady())
      .catch(()=>false)
      .finally(()=>{brushLoadPromise=null;});
  }
  return brushLoadPromise;
}
function stamp(ctx,backdrop,foreground,brush,left,top){
  let changed=0;
  for(let by=0;by<brush.height;by++)for(let bx=0;bx<brush.width;bx++){
    const value=brush.pixels[by*brush.width+bx];
    if(value===brush.transparent)continue;
    const x=left+bx,y=top+by;
    if(x<0||y<0||x>=ctx.width||y>=ctx.height)continue;
    const i=y*ctx.width+x;
    if(backdrop[i]!==value){backdrop[i]=value;changed++;}
    foreground[i]=FOREGROUND_VALUE;
  }
  return changed;
}
function render(ctx){
  const backdrop=ctx.layer('backdrop'),foreground=ctx.layer('foreground');
  const offset=hudOffset(),top=BASE_Y+offset;
  let changed=0;
  for(const panel of PANELS){
    const brush=brushFor(panel.id);
    if(!brush){
      ensureBrushes();
      throw new Error('HUD panel brushes are still loading. Try HUD Panels again once the brush catalogue has loaded.');
    }
    if(brush.width!==97||brush.height!==28)throw new Error(`${panel.id} must remain 97×28 pixels.`);
    if(top+brush.height>ctx.height)throw new Error(`HUD offset ${offset} places the panels outside the 320×256 Backdrop.`);
    changed+=stamp(ctx,backdrop,foreground,brush,panel.x,top);
  }
  return {message:`HUD Panels committed · Y ${top} (+${offset}) · Red X 8 · White X 112 · Blue X 216${changed?` · ${changed} Backdrop pixels changed`:''}.`};
}

S.register({
  id:'hud-panels',
  name:'HUD Panels',
  version:VERSION,
  category:'Race',
  status:'ready',
  description:'Click once with Fill to place the red, white and blue lower player HUD panels at Y 212 plus the Race Lower HUD offset, with their established Background/Foreground mask.',
  supportedModes:['backdrop'],
  supportedTools:['fill'],
  layers:['backdrop','foreground'],
  activate:()=>{ensureBrushes();},
  preview:render,
  apply:render
});

ensureBrushes();

})(typeof globalThis!=='undefined'?globalThis:this);
