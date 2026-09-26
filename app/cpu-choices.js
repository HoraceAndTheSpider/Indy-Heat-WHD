(function(root){
'use strict';

if(typeof document==='undefined')return;
const $=id=>document.getElementById(id);
const FIELD_IDS=Object.freeze({
  turbos:'cpuChoiceTurbos',brakes:'cpuChoiceBrakes',tyres:'cpuChoiceTyres',
  crew:'cpuChoiceCrew',mpg:'cpuChoiceMpg',engine:'cpuChoiceEngine'
});
let active=false,bootTimer=null;
const authored=new Map();
const baseline=new Map();

function R(){return root.IndyHeatRaceSetupTools||null;}
function C(){return root.IndyHeatRaceSetupCapture||null;}
function T(){return root.IndyHeatTools||null;}
function trackIndex(){return Number($('trackSelect')?.value||0);}
function circuitIndex(){const n=Number($('circuitNumber')?.value);return Number.isInteger(n)&&n>=0&&n<=99?n:trackIndex();}
function selectedOption(){return $('trackSelect')?.selectedOptions?.[0]||null;}
function sourceKey(){
  const o=selectedOption();
  if(!o)return `retail:${trackIndex()}|circuit:${circuitIndex()}`;
  const packageKey=o.dataset?.indyheatPackageKey;
  if(packageKey)return `package:${packageKey}|circuit:${circuitIndex()}`;
  if(o.dataset?.indyheatCustom==='1')return `custom:${circuitIndex()}`;
  const logical=o.dataset?.indyheatRetailIndex;
  return `retail:${Number(logical==null?o.value:logical)}|circuit:${circuitIndex()}`;
}
function recordsFor(model){
  const c=C(),t=T();if(!model||!t)return [];
  let records=c?.recordsByMain?.get(model.main)||null;
  if(!records){records=t.parseRaceRecords(model.main);c?.recordsByMain?.set(model.main,records);}
  for(const r of records)if(r.baseResourceId==null&&typeof t.raceBaseResourceId==='function')r.baseResourceId=t.raceBaseResourceId(r,model.resourceTableOffset+0x1000);
  return records;
}
function recordFor(model,index=trackIndex()){
  const t=T();if(!model||!t)return null;const base=t.TRACK_BASE_IDS?.[index];return recordsFor(model).find(r=>r.baseResourceId===base)||null;
}
function primaryModel(){const c=C();return c?.model||c?.layerModel||c?.coreModel||c?.models?.[0]||null;}
function loadedModels(){const c=C(),out=[];for(const m of [c?.coreModel,c?.model,c?.layerModel,...(c?.models||[])])if(m&&!out.includes(m))out.push(m);return out;}
function readValues(){
  const r=R(),m=primaryModel(),rec=recordFor(m);if(!r||!m||!rec)return null;
  return {...r.parseRaceSetup(m.main,rec).cpuChoices};
}
function writeValues(values){
  const r=R();if(!r)return false;
  let wrote=false;
  for(const m of loadedModels()){
    const rec=recordFor(m);if(!rec)continue;r.writeCpuChoices(m.main,rec.offset,values);wrote=true;
  }
  return wrote;
}
function inputValues(){
  const out={};
  for(const f of R()?.CPU_CHOICES||[]){
    const el=$(FIELD_IDS[f.key]),raw=String(el?.value??'').trim(),n=Number(raw);
    if(raw===''||!Number.isInteger(n)||n<0||n>65535)throw new Error(`${f.label} must be 0–65535`);
    out[f.key]=n;
  }
  return out;
}
function same(a,b){return !!a&&!!b&&(R()?.CPU_CHOICES||[]).every(f=>Number(a[f.key])===Number(b[f.key]));}
function setStatus(text,bad=false){const e=$('cpuChoicesStatus');if(!e)return;e.textContent=text;e.classList.toggle('bad',!!bad);}
function seedBaseline(key,values,force=false){if(values&&(force||!baseline.has(key)))baseline.set(key,{...values});}
function refresh({forceBaseline=false}={}){
  const key=sourceKey(),saved=authored.get(key);
  if(saved)writeValues(saved);
  const values=readValues();
  if(!values){setStatus('');return;}
  seedBaseline(key,values,forceBaseline);
  for(const f of R().CPU_CHOICES){const el=$(FIELD_IDS[f.key]),out=$(`${FIELD_IDS[f.key]}Value`);if(el&&document.activeElement!==el){const value=Number(values[f.key]);el.max=String(Math.max(255,value));el.value=String(value);if(out)out.value=String(value);}}
  const dirty=!same(values,baseline.get(key));
  setStatus('');
  const b=$('cpuChoicesRevert');if(b)b.disabled=!dirty;
}
function commit(){
  try{
    const values=inputValues(),key=sourceKey();
    if(!writeValues(values))throw new Error('CPU Choices race record is unavailable');
    authored.set(key,{...values});
    refresh();
  }catch(e){setStatus(`ERROR: ${e.message}`,true);}
}
function revert(){
  const key=sourceKey(),values=baseline.get(key);if(!values)return;
  authored.delete(key);writeValues(values);refresh();
}
function deactivate(){
  if(!active)return;active=false;$('layerEditCpuChoices')?.classList.remove('active');
  const pane=$('cpuChoicesPane');if(pane)pane.hidden=true;
}
function activate(){
  if(active){refresh();return;}
  $('layerModeWaypoints')?.click();
  active=true;$('layerEditCpuChoices')?.classList.add('active');
  const pane=$('cpuChoicesPane');if(pane)pane.hidden=false;
  const drawing=$('layerDrawingPane');if(drawing)drawing.hidden=true;
  const waypoint=$('layerWaypointHost');if(waypoint)waypoint.hidden=true;
  refresh();
}

function valuesForCircuit(index){
  const n=Number(index);
  if(!Number.isInteger(n)||n<0||n>99)return null;

  // Prefer an explicitly authored/imported value retained for this circuit.
  const suffix=`|circuit:${n}`;
  let found=null;
  for(const [key,value] of authored)if(key.endsWith(suffix))found={...value};
  if(found)return found;
  for(const [key,value] of baseline)if(key.endsWith(suffix))found={...value};
  if(found)return found;

  // Retail circuits can always be read directly from their race record.
  if(n<10){
    const r=R(),m=primaryModel(),rec=recordFor(m,n);
    if(r&&m&&rec)return {...r.parseRaceSetup(m.main,rec).cpuChoices};
  }

  // For the currently selected custom circuit, the host record carries its live values.
  if(circuitIndex()===n){
    const value=readValues();
    if(value)return {...value};
  }
  return null;
}
root.IndyHeatCpuChoices=Object.freeze({valuesForCircuit});

function inject(){
  const host=$('layerModeButtons'),column=$('layerEditorColumn');if(!host||!column||!R()?.CPU_CHOICES)return false;
  if($('layerEditCpuChoices'))return true;
  const style=document.createElement('style');style.id='cpuChoicesStyle';style.textContent=`
    #layerEditCpuChoices.active{border-color:#d6b54a;background:#5a4a1c}
    #cpuChoicesPane[hidden]{display:none}#cpuChoicesPane{font-size:12px}
    .cpuChoicesGrid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:8px 0 10px}
    .cpuChoicesGrid label{display:grid;gap:4px;margin:0;color:#b9c0cc;font-size:11px}
    .cpuChoicesSliderHead{display:flex;justify-content:space-between;gap:8px;align-items:center}
    .cpuChoicesGrid input[type=range]{min-width:0;width:100%;box-sizing:border-box;margin:0}
    .cpuChoicesGrid output{min-width:30px;text-align:right;color:#d6dbe3;font:11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
    .cpuChoicesActions{display:grid;grid-template-columns:1fr;gap:6px;margin:9px 0}
    .cpuChoicesActions button{font-size:11px;padding:6px}
    #cpuChoicesStatus{font-size:11px;line-height:1.4;white-space:pre-line}.cpuChoicesGrid input[type=range]:focus{outline:none}
  `;document.head.appendChild(style);
  const mode=document.createElement('button');mode.id='layerEditCpuChoices';mode.type='button';mode.textContent='CPU Choices';mode.title='Set Gasoline Alley CPU upgrade-family weights for prior to racing the selected circuit.';host.appendChild(mode);
  const pane=document.createElement('div');pane.id='cpuChoicesPane';pane.hidden=true;pane.innerHTML=`
    <div class="toolGroup"><div class="toolGroupTitle">CPU Choices</div>
      <div class="cpuChoicesGrid">
        <label title="Turbos CPU choice weight · race+$50.w"><span class="cpuChoicesSliderHead"><span>Turbos</span><output id="cpuChoiceTurbosValue" for="cpuChoiceTurbos">0</output></span><input id="cpuChoiceTurbos" type="range" min="0" max="255" step="1"></label>
        <label title="Brakes CPU choice weight · race+$52.w"><span class="cpuChoicesSliderHead"><span>Brakes</span><output id="cpuChoiceBrakesValue" for="cpuChoiceBrakes">0</output></span><input id="cpuChoiceBrakes" type="range" min="0" max="255" step="1"></label>
        <label title="Tyres CPU choice weight · race+$54.w"><span class="cpuChoicesSliderHead"><span>Tyres</span><output id="cpuChoiceTyresValue" for="cpuChoiceTyres">0</output></span><input id="cpuChoiceTyres" type="range" min="0" max="255" step="1"></label>
        <label title="Crew CPU choice weight · race+$56.w"><span class="cpuChoicesSliderHead"><span>Crew</span><output id="cpuChoiceCrewValue" for="cpuChoiceCrew">0</output></span><input id="cpuChoiceCrew" type="range" min="0" max="255" step="1"></label>
        <label title="MPG CPU choice weight · race+$58.w"><span class="cpuChoicesSliderHead"><span>MPG</span><output id="cpuChoiceMpgValue" for="cpuChoiceMpg">0</output></span><input id="cpuChoiceMpg" type="range" min="0" max="255" step="1"></label>
        <label title="Engine CPU choice weight · race+$5A.w"><span class="cpuChoicesSliderHead"><span>Engine</span><output id="cpuChoiceEngineValue" for="cpuChoiceEngine">0</output></span><input id="cpuChoiceEngine" type="range" min="0" max="255" step="1"></label>
      </div>
      <div class="cpuChoicesActions"><button id="cpuChoicesRevert" type="button">Revert</button></div>
      <div id="cpuChoicesStatus" class="muted"></div>
    </div>`;
  const drawing=$('layerDrawingPane'),waypoint=$('layerWaypointHost');column.insertBefore(pane,drawing||waypoint||null);
  mode.addEventListener('click',activate);
  document.addEventListener('click',e=>{const b=e.target?.closest?.('#layerModeButtons button');if(b&&b.id!=='layerEditCpuChoices'&&active)deactivate();},true);
  for(const id of Object.values(FIELD_IDS)){const el=$(id),out=$(`${id}Value`);el?.addEventListener('input',()=>{if(out)out.value=el.value;commit();});}
  $('cpuChoicesRevert').addEventListener('click',revert);
  $('trackSelect')?.addEventListener('change',()=>setTimeout(()=>refresh(),0));
  $('circuitNumber')?.addEventListener('change',()=>setTimeout(()=>refresh(),0));
  document.addEventListener('indyheat-race-setup-capture',e=>setTimeout(()=>{if(e.detail?.type==='model'){authored.clear();baseline.clear();}refresh();},0));
  document.addEventListener('indyheat-cpu-choices-imported',e=>setTimeout(()=>{
    const values=e.detail?.values;if(!values)return;const key=sourceKey();authored.set(key,{...values});seedBaseline(key,values,true);refresh();
  },0));
  return true;
}
function boot(){let tries=0;const tick=()=>{if(inject()||++tries>400){if(bootTimer){clearInterval(bootTimer);bootTimer=null;}}};tick();if(!$('layerEditCpuChoices'))bootTimer=setInterval(tick,50);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});else setTimeout(boot,0);

})(typeof globalThis!=='undefined'?globalThis:this);
