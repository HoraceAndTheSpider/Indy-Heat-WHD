(function(root){
'use strict';

/*
 * Indy Heat Auto Collision Map — v0.132.
 *
 * This retains the original backdrop/waypoint road analysis, but applies it to
 * the +2 Surface resource where it belongs. Route-backed road becomes class 0
 * (Normal); everything else becomes class 1 (Edge / collision). Short gaps
 * between road components crossed by a waypoint route are kept driveable, as
 * required for bridges/underpasses. Slowdown classes are intentionally reset.
 *
 * The legacy filename/global alias are retained so older brush-library loaders
 * can still discover this companion module without loading it twice.
 */
const VERSION='0.132';
const W=320,GAME_H=224,CELL_W=160,CELL_H=112;
const TRACK_COLOURS=Object.freeze(new Set([0,4,5,6,7]));
const EXPAND_RADIUS=3,GAP_NEAR_RADIUS=2,GAP_MIN=6,GAP_MAX=48,GAP_RADIUS=3;
let undo=null,running=false,installed=false;

function T(){return root.IndyHeatTools||null;}
function L(){return root.IndyHeatLayerTools||null;}
function C(){return root.IndyHeatRaceSetupCapture||null;}
function sourceKey(){
  const sel=document.getElementById('trackSelect'),o=sel?.selectedOptions?.[0];
  if(o?.dataset?.indyheatPackageKey)return `package:${o.dataset.indyheatPackageKey}`;
  const retail=o?.dataset?.indyheatRetailIndex;return `retail:${retail==null?(o?.value??0):retail}`;
}
function trackIndex(){return Number(document.getElementById('trackSelect')?.value||0);}
function baseId(){return T()?.TRACK_BASE_IDS?.[trackIndex()]??null;}
function models(){
  const c=C(),out=[],seen=new Set();
  for(const m of [c?.coreModel,c?.layerModel,c?.model,...(c?.models||[])]){
    if(!m||seen.has(m)||typeof m.getResource!=='function')continue;seen.add(m);out.push(m);
  }
  return out;
}
function firstResource(offset){
  const base=baseId();if(base==null)return null;
  for(const model of models()){try{const r=model.getResource(base+offset);if(r)return r;}catch(_e){}}
  return null;
}
function snapshot(offset){const r=firstResource(offset);return r?Uint8Array.from(r.data):null;}
function syncBytes(offset,bytes){
  if(!bytes)return 0;const base=baseId();if(base==null)return 0;let n=0;
  for(const model of models())try{
    const r=model.getResource(base+offset);if(!r)continue;r.data.set(bytes.subarray(0,Math.min(r.data.length,bytes.length)),0);n++;
  }catch(_e){}
  return n;
}
function equalBytes(a,b){if(!a||!b||a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;}
function refreshView(){
  const sel=document.getElementById('trackSelect');
  if(sel){
    sel.dispatchEvent(new Event('change',{bubbles:true}));
    document.dispatchEvent(new CustomEvent('indyheat-circuit-content-refreshed',{detail:{reason:'auto-collision',trackIndex:Number(sel.value||0)}}));
    return;
  }
  try{root.IndyHeatEditorBridge?.refreshSelectedTrack?.();}catch(_e){}
}
function status(message,bad=false){
  const e=document.getElementById('layerEditorStatus');if(!e)return;e.textContent=String(message||'');e.classList.toggle('bad',!!bad);
}
function modeActive(){
  const button=document.getElementById('layerEditSurface'),pane=document.getElementById('layerDrawingPane');
  return !!(button?.classList.contains('active')&&pane&&!pane.hidden);
}
function threshold(){
  const e=document.getElementById('autoCollisionThreshold');return Math.max(8,Math.min(400,Math.round(Number(e?.value)||40)));
}
function syncUi(){
  const host=document.getElementById('autoCollisionTools'),slider=document.getElementById('autoCollisionThreshold'),out=document.getElementById('autoCollisionThresholdText'),run=document.getElementById('autoCollisionRun');
  if(host)host.hidden=!modeActive();if(out&&slider)out.textContent=`${slider.value} px`;
  if(run)run.disabled=running||!modeActive()||!firstResource(0)||!firstResource(2);
}
function linePoints(a,b){
  let x0=Math.round(a.x),y0=Math.round(a.y),x1=Math.round(b.x),y1=Math.round(b.y),dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1,err=dx+dy;
  const out=[];for(;;){out.push([x0,y0]);if(x0===x1&&y0===y1)break;const e2=err*2;if(e2>=dy){err+=dy;x0+=sx;}if(e2<=dx){err+=dx;y0+=sy;}}return out;
}
function waypointSets(){
  try{
    const authored=root.IndyHeatWaypointAuthoring?.currentRoutes?.();
    if(Array.isArray(authored)&&authored.length)return authored;
  }catch(_e){}
  const tools=T(),base=baseId();if(!tools||base==null)return [];
  for(const model of models())try{
    const records=tools.parseRaceRecords(model.main);
    for(const r of records){
      if(r.baseResourceId==null)r.baseResourceId=tools.raceBaseResourceId(r,model.resourceTableOffset+0x1000);
      if(r.baseResourceId!==base)continue;
      return r.waypointDescriptors||tools.parseWaypointDescriptors(model.main,r)||[];
    }
  }catch(_e){}
  return [];
}
function projectedLinks(){
  const tools=T(),sets=waypointSets(),links=[];if(!tools?.projectWaypointA082)return links;
  for(const set of sets){
    const by=new Map((set.points||[]).map(p=>[Number(p.runtimeAddress),p]));
    if(set.boundaryPoint&&!set.boundaryPoint.zeroSentinel)by.set(Number(set.boundaryPoint.runtimeAddress),set.boundaryPoint);
    for(const p of set.points||[]){
      const target=p.__ihLinkTarget||by.get(Number(p.linkTarget));if(!target||target.zeroSentinel)continue;
      const a=tools.projectWaypointA082(p.x,p.y),b=tools.projectWaypointA082(target.x,target.y);if(!a||!b)continue;
      if(!Number.isFinite(a.x)||!Number.isFinite(a.y)||!Number.isFinite(b.x)||!Number.isFinite(b.y))continue;
      links.push(linePoints(a,b));
    }
  }
  return links;
}
function components(pixels,minArea){
  const n=W*GAME_H,ids=new Int32Array(n);ids.fill(-1);const candidate=new Uint8Array(n);
  for(let i=0;i<n;i++)candidate[i]=TRACK_COLOURS.has(Number(pixels[i]))?1:0;
  const comps=[],dirs=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
  for(let i=0;i<n;i++){
    if(!candidate[i]||ids[i]>=0)continue;const id=comps.length,stack=[i],list=[];ids[i]=id;
    while(stack.length){
      const q=stack.pop(),x=q%W,y=(q/W)|0;list.push(q);
      for(const [dx,dy] of dirs){const nx=x+dx,ny=y+dy;if(nx<0||nx>=W||ny<0||ny>=GAME_H)continue;const ni=ny*W+nx;if(candidate[ni]&&ids[ni]<0){ids[ni]=id;stack.push(ni);}}
    }
    comps.push(list);
  }
  const qualified=new Uint8Array(comps.length);for(let i=0;i<comps.length;i++)if(comps[i].length>=minArea)qualified[i]=1;
  return {ids,comps,qualified};
}
function nearbyComponent(x,y,ids,selected,r=GAP_NEAR_RADIUS){
  let best=-1,bestD=Infinity;
  for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
    const nx=x+dx,ny=y+dy;if(nx<0||nx>=W||ny<0||ny>=GAME_H)continue;
    const id=ids[ny*W+nx];if(id<0||!selected.has(id))continue;const d=dx*dx+dy*dy;if(d<bestD){bestD=d;best=id;}
  }
  return best;
}
function dilate(seed,r=EXPAND_RADIUS){
  const out=seed.slice(),rr=r*r;
  for(let y=0;y<GAME_H;y++)for(let x=0;x<W;x++)if(!seed[y*W+x]){
    let hit=false;for(let dy=-r;dy<=r&&!hit;dy++)for(let dx=-r;dx<=r;dx++){
      if(dx*dx+dy*dy>rr)continue;const nx=x+dx,ny=y+dy;if(nx>=0&&nx<W&&ny>=0&&ny<GAME_H&&seed[ny*W+nx]){hit=true;break;}
    }
    if(hit)out[y*W+x]=1;
  }
  return out;
}
function fillDisc(mask,x,y,r=GAP_RADIUS){
  const rr=r*r;for(let yy=Math.max(0,y-r);yy<=Math.min(GAME_H-1,y+r);yy++)for(let xx=Math.max(0,x-r);xx<=Math.min(W-1,x+r);xx++)if((xx-x)*(xx-x)+(yy-y)*(yy-y)<=rr)mask[yy*W+xx]=1;
}
function fillWaypointGaps(openMask,links,ids,selected){
  let gaps=0;const seen=new Set();
  for(const points of links){
    let previous=-1,gap=[];
    for(const [x0,y0] of points){
      const x=Math.round(x0),y=Math.round(y0);if(x<0||x>=W||y<0||y>=GAME_H){gap=[];previous=-1;continue;}
      const id=nearbyComponent(x,y,ids,selected);
      if(id<0){if(previous>=0)gap.push([x,y]);continue;}
      if(previous>=0&&id!==previous&&gap.length>=GAP_MIN&&gap.length<=GAP_MAX){
        const first=gap[0],last=gap[gap.length-1],key=[Math.min(previous,id),Math.max(previous,id),Math.round((first[0]+last[0])/8),Math.round((first[1]+last[1])/8)].join(':');
        if(!seen.has(key)){seen.add(key);gaps++;for(const [gx,gy] of gap)fillDisc(openMask,gx,gy);}
      }
      previous=id;gap=[];
    }
  }
  return gaps;
}
function surfaceOffset(resource){return resource?Math.max(0,resource.data.length-0x1180):0;}
function calculate(minArea=threshold()){
  const tools=T(),layers=L(),bgRes=firstResource(0),surfaceRes=firstResource(2);
  if(!tools?.decodePlanar||!tools?.decodeSurface2bpp||!layers?.setSurfaceCell||!bgRes||!surfaceRes)throw new Error('Backdrop/surface data is unavailable.');
  const pixels=tools.decodePlanar(bgRes.data,320,256,5,0),off=surfaceOffset(surfaceRes),current=tools.decodeSurface2bpp(surfaceRes.data,off),links=projectedLinks();
  if(!links.length)throw new Error('No waypoint route links are available for the selected circuit.');
  const c=components(pixels,minArea),selected=new Set();
  for(const points of links)for(const [x,y] of points){if(x<0||x>=W||y<0||y>=GAME_H)continue;const id=c.ids[y*W+x];if(id>=0&&c.qualified[id])selected.add(id);}
  if(!selected.size)throw new Error(`No connected track-colour area ≥ ${minArea}px intersects the waypoint routes.`);
  const seed=new Uint8Array(W*GAME_H);for(const id of selected)for(const i of c.comps[id])seed[i]=1;
  const open=dilate(seed),gaps=fillWaypointGaps(open,links,c.ids,selected),bytes=Uint8Array.from(surfaceRes.data);
  let changed=0,normalCells=0,collisionCells=0,slowdownsCleared=0;
  for(let cy=0;cy<CELL_H;cy++)for(let cx=0;cx<CELL_W;cx++){
    let roadPixels=0;
    for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)roadPixels+=open[(cy*2+dy)*W+(cx*2+dx)]?1:0;
    const value=roadPixels?0:1,index=cy*CELL_W+cx,was=Number(current.cells[index]);
    if(was!==value)changed++;
    if(was>=2&&was!==value)slowdownsCleared++;
    if(value===0)normalCells++;else collisionCells++;
    layers.setSurfaceCell(bytes,cx,cy,value,off);
  }
  return {bytes,before:Uint8Array.from(surfaceRes.data),changed,areas:selected.size,gaps,normalCells,collisionCells,slowdownsCleared,threshold:minArea};
}
function run(){
  if(running)return;running=true;syncUi();const button=document.getElementById('autoCollisionRun');if(button)button.textContent='Calculating…';
  try{
    const q=calculate();
    if(!q.changed){status(`Auto collision map: no surface changes · ${q.areas} route-backed road areas · ${q.gaps} route gaps kept driveable · threshold ${q.threshold}px.`);return;}
    if(!syncBytes(2,q.bytes))throw new Error('No active editor model accepted the generated surface map.');
    const recorded=!!root.IndyHeatLayerHistory?.recordHistory?.({beforeLayers:{surface:q.before},afterLayers:{surface:q.bytes.slice()},label:'Auto collision map'});
    undo=recorded?null:{source:sourceKey(),before:q.before,after:q.bytes.slice()};refreshView();
    setTimeout(()=>status(`Auto collision map: ${q.changed} cells updated · ${q.normalCells} Normal · ${q.collisionCells} Collision · ${q.gaps} route gaps kept driveable${q.slowdownsCleared?` · ${q.slowdownsCleared} Slowdown cells reset`:''}.`),0);
  }catch(err){status(`ERROR: ${err.message}`,true);}
  finally{running=false;if(button)button.textContent='Auto collision map';setTimeout(syncUi,0);}
}
function undoGenerated(e){
  if(!undo||!modeActive()||undo.source!==sourceKey())return false;
  const current=snapshot(2);if(!current||!equalBytes(current,undo.after)){undo=null;return false;}
  e?.preventDefault?.();e?.stopImmediatePropagation?.();const before=undo.before;undo=null;syncBytes(2,before);refreshView();setTimeout(()=>status('Auto collision map undone.'),0);return true;
}
function install(){
  if(installed)return true;
  const tools=document.getElementById('layerEditorTools');if(!tools)return false;
  installed=true;
  const host=document.createElement('div');host.id='autoCollisionTools';host.className='toolGroup';host.hidden=true;
  host.innerHTML=`<div class="toolGroupTitle">Auto collision map</div><div class="autoCollisionThresholdRow"><label for="autoCollisionThreshold">Minimum connected track area</label><span id="autoCollisionThresholdText">40 px</span></div><input id="autoCollisionThreshold" type="range" min="8" max="400" step="4" value="40"><button id="autoCollisionRun" type="button">Auto collision map</button><div class="autoCollisionNote">Rebuilds Normal / Edge-Collision. Slowdown A/B are cleared.</div>`;
  const actions=tools.querySelector('.layerActionBtns');tools.insertBefore(host,actions||null);
  const style=document.createElement('style');style.id='autoCollisionStyle';style.textContent=`#autoCollisionTools{padding-top:7px;border-top:1px solid #343b46}#autoCollisionTools[hidden]{display:none!important}.autoCollisionThresholdRow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:center;font-size:10px;color:#b8bfca}.autoCollisionThresholdRow span{font:10px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#d8dde6}#autoCollisionThreshold{width:100%;margin:5px 0 6px}#autoCollisionRun{width:100%;font-size:11px;padding:6px}.autoCollisionNote{margin-top:5px;font-size:9px;line-height:1.35;color:#8f98a6}`;document.head.appendChild(style);
  document.getElementById('autoCollisionThreshold')?.addEventListener('input',syncUi);
  document.getElementById('autoCollisionRun')?.addEventListener('click',run);
  document.getElementById('layerUndo')?.addEventListener('click',e=>{if(!root.IndyHeatLayerHistory?.recordHistory)undoGenerated(e);},true);
  document.getElementById('layerRevert')?.addEventListener('click',()=>{undo=null;},true);
  document.getElementById('trackSelect')?.addEventListener('change',()=>setTimeout(()=>{if(undo&&undo.source!==sourceKey())undo=null;syncUi();},0));
  document.getElementById('layerModeButtons')?.addEventListener('click',()=>setTimeout(syncUi,0),true);
  syncUi();return true;
}
function boot(){
  if(install())return;let tries=0;const timer=setInterval(()=>{if(install()||++tries>240)clearInterval(timer);},50);
}
const api=Object.freeze({VERSION,calculate,run,install});
root.IndyHeatSurfaceAuto=api;
root.IndyHeatForegroundAuto=api; // legacy companion-loader alias only
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});else setTimeout(boot,0);
}
})(typeof globalThis!=='undefined'?globalThis:this);
