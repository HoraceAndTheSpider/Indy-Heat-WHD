(function(root){
'use strict';

// v0.57 race-data validation helpers.
// Retail-derived/proved behaviours:
// - race+$6A uses 0 for a +X start and $8000 (-32768) for a -X start.
// - pit+$14 is a 0/1 presentation variant; on clear two-row retail pit layouts
//   the upper service row is 1 and the lower service row is 0.
// - projected pit-box -> crew-screen anchors cluster around (-2, side?+1:0).

const $=id=>document.getElementById(id);
const C=root.IndyHeatRaceSetupCapture;
const T=root.IndyHeatTools;
const R=root.IndyHeatRaceSetupTools;
if(!C||!T||!R)return;

const GRID_PLUS_X=0;
const GRID_MINUS_X=-32768;
const PIT_ROW_MIN_GAP=3;
const PIT_ROW_MAX_SPREAD=2.5;
const CREW_WARN_DISTANCE=2.5; // all 40 retail pits fall within 2.24 px of preferred anchor
let installed=false;
let lastKey='';

function selectedTrackIndex(){return Number($('trackSelect')?.value||0);}
function currentModel(){return C.model||C.layerModel||C.coreModel||C.models?.[0]||null;}
function recordsFor(model){
  if(!model)return [];
  let records=C.recordsByMain?.get(model.main)||null;
  if(!records){records=T.parseRaceRecords(model.main);C.recordsByMain?.set(model.main,records);}
  for(const r of records)if(r.baseResourceId==null)r.baseResourceId=T.raceBaseResourceId(r,model.resourceTableOffset+R.RUNTIME_MAIN_BASE);
  return records;
}
function currentRecord(){
  const model=currentModel(),base=T.TRACK_BASE_IDS?.[selectedTrackIndex()];
  return recordsFor(model).find(r=>r.baseResourceId===base)||null;
}
function currentSetup(){const model=currentModel(),record=currentRecord();return model&&record?R.parseRaceSetup(model.main,record):null;}
function currentRoutes(){
  const detached=root.IndyHeatWaypointAuthoring?.currentRoutes?.();
  if(Array.isArray(detached)&&detached.length===3)return detached;
  const model=currentModel(),record=currentRecord();
  if(!model||!record)return null;
  try{return T.parseWaypointDescriptors(model.main,record);}catch(_e){return null;}
}
function liveNumber(id,fallback){
  const el=$(id),s=String(el?.value??'').trim(),n=Number(s);
  return s!==''&&Number.isFinite(n)?n:Number(fallback);
}
function liveInteger(id,fallback){const n=liveNumber(id,fallback);return Number.isInteger(n)?n:Number(fallback);}
function setDirty(){const b=$('raceRevert');if(b)b.disabled=false;}
function redrawRace(){
  const el=$('raceShowStart')||$('raceShowPits');
  if(el)el.dispatchEvent(new Event('change',{bubbles:true}));
}
function setIssue(id,text,bad=false,muted=false){
  const el=$(id);if(!el)return;
  el.textContent=text||'';el.hidden=!text;
  el.classList.toggle('raceValidationBad',!!bad);
  el.classList.toggle('raceValidationMuted',!!muted);
}
function directionText(v){return Number(v)<0?'−X / left':' +X / right';}

function startDirectionState(){
  const setup=currentSetup(),routes=currentRoutes();
  if(!setup||!routes?.[0]?.points?.[2])return {valid:false,reason:'Start direction cannot be validated until Route A has at least three waypoints.'};
  const startX=liveNumber('raceStartX',R.fixedToNumber(setup.startX));
  const wp3=Number(routes[0].points[2].x),dx=wp3-startX;
  const orient=liveInteger('raceStartOrient',setup.startOrient);
  if(!Number.isFinite(startX)||!Number.isFinite(wp3)||Math.abs(dx)<0.5)return {valid:false,reason:'Start direction is ambiguous because Route A waypoint 3 is almost directly above/below the start.'};
  const expected=dx<0?GRID_MINUS_X:GRID_PLUS_X;
  return {valid:true,startX,wp3,dx,orient,expected,match:orient===expected};
}
function updateStartDirection(){
  const s=startDirectionState(),button=$('raceGridDirectionToggle');
  const raw=$('raceStartOrient');
  if(button){
    const v=liveInteger('raceStartOrient',currentSetup()?.startOrient??0);
    button.textContent=`Grid X direction: ${v<0?'−X':' +X'}`;
    button.setAttribute('aria-pressed',v<0?'true':'false');
  }
  if(raw)raw.title='Raw race+$6A mirror word: retail uses 0 (+X) or -32768 / $8000 (-X).';
  if(!s.valid){setIssue('raceGridDirectionValidation',s.reason,false,true);return;}
  if(s.orient!==GRID_PLUS_X&&s.orient!==GRID_MINUS_X){
    setIssue('raceGridDirectionValidation',`Grid direction has unsupported raw value ${s.orient}; retail circuits use only 0 or -32768.`,true);return;
  }
  if(!s.match){
    setIssue('raceGridDirectionValidation',`Start direction mismatch: Route A waypoint 3 is ${s.dx<0?'left':'right'} of the grid; Grid X direction should be ${s.expected<0?'−X':' +X'}.`,true);return;
  }
  setIssue('raceGridDirectionValidation','');
}
function writeGridDirection(value,message='Grid X direction updated.'){
  const model=currentModel(),record=currentRecord();if(!model||!record)throw new Error('Race setup is unavailable.');
  value=Number(value)<0?GRID_MINUS_X:GRID_PLUS_X;
  R.writeCommon(model.main,record.offset,{startOrient:value});
  if($('raceStartOrient'))$('raceStartOrient').value=String(value);
  setDirty();redrawRace();updateAll();
  const st=$('raceSetupStatus');if(st)st.textContent=message;
}
function toggleGridDirection(){
  const setup=currentSetup();if(!setup)return;
  const current=liveInteger('raceStartOrient',setup.startOrient);
  writeGridDirection(current<0?GRID_PLUS_X:GRID_MINUS_X);
}

function livePits(){
  const setup=currentSetup();if(!setup)return null;
  const pits=setup.pits.map(p=>({
    ...p,
    serviceX:R.fixedToNumber(p.serviceX),serviceY:R.fixedToNumber(p.serviceY),
    slotWord:Number(p.slotWord),screenX:Number(p.screenX),screenY:Number(p.screenY)
  }));
  const sel=Math.max(0,Math.min(3,Number($('racePitSlot')?.value||0)));
  if(pits[sel]){
    pits[sel].serviceX=liveNumber('raceServiceX',pits[sel].serviceX);
    pits[sel].serviceY=liveNumber('raceServiceY',pits[sel].serviceY);
    pits[sel].slotWord=liveInteger('raceSlotWord',pits[sel].slotWord);
    pits[sel].screenX=liveInteger('raceScreenX',pits[sel].screenX);
    pits[sel].screenY=liveInteger('raceScreenY',pits[sel].screenY);
  }
  return pits;
}

// Infer only when the four service positions form two clearly separated Y rows.
// Retail proof: all eight clear two-row circuits use upper row=1, lower row=0.
// Illinois and Indianapolis are single-row layouts and intentionally remain ambiguous.
function inferPitSides(pits=livePits()){
  if(!pits?.length)return {confident:false,reason:'Pit side validation is unavailable.'};
  const entries=pits.map((p,i)=>({i,y:Number(p.serviceY)})).filter(p=>Number.isFinite(p.y)).sort((a,b)=>a.y-b.y);
  if(entries.length!==4)return {confident:false,reason:'Pit side validation needs four valid pit-box positions.'};
  let gap=-Infinity,split=-1;
  for(let i=0;i<entries.length-1;i++){const g=entries[i+1].y-entries[i].y;if(g>gap){gap=g;split=i;}}
  if(gap<PIT_ROW_MIN_GAP)return {confident:false,reason:'Pit side cannot be inferred reliably from this single-row/compact layout.'};
  const low=entries.slice(0,split+1),high=entries.slice(split+1);
  if(!low.length||!high.length)return {confident:false,reason:'Pit side row split is ambiguous.'};
  const spread=a=>Math.max(...a.map(x=>x.y))-Math.min(...a.map(x=>x.y));
  if(spread(low)>PIT_ROW_MAX_SPREAD||spread(high)>PIT_ROW_MAX_SPREAD)
    return {confident:false,reason:'Pit side cannot be inferred reliably because the service positions do not form two clear rows.'};
  const expected=new Array(4);
  for(const q of low)expected[q.i]=0;
  for(const q of high)expected[q.i]=1;
  return {confident:true,expected,gap,low,high};
}
function updatePitSide(){
  const pits=livePits(),inf=inferPitSides(pits),fix=$('raceFixPitSides');
  if(fix)fix.disabled=!inf.confident;
  if(!pits){setIssue('racePitSideValidation','Pit side validation is unavailable.',false,true);return;}
  const invalid=pits.map((p,i)=>({i,value:p.slotWord})).filter(x=>x.value!==0&&x.value!==1);
  if(invalid.length){setIssue('racePitSideValidation',`Pit side must be 0 or 1: ${invalid.map(x=>`P${x.i+1}=${x.value}`).join(', ')}.`,true);return;}
  if(!inf.confident){setIssue('racePitSideValidation',inf.reason,false,true);return;}
  const wrong=pits.map((p,i)=>({i,got:p.slotWord,want:inf.expected[i]})).filter(x=>x.got!==x.want);
  if(wrong.length){
    setIssue('racePitSideValidation',`Pit side mismatch: ${wrong.map(x=>`P${x.i+1} should be ${x.want}`).join(', ')} for the current two-row layout.`,true);return;
  }
  setIssue('racePitSideValidation','');
}
function fixPitSides(){
  const model=currentModel(),setup=currentSetup(),inf=inferPitSides();
  if(!model||!setup||!inf.confident)return;
  for(let i=0;i<4;i++)R.writePit(model.main,setup.pitFileOffset,i,{slotWord:inf.expected[i]});
  const sel=Math.max(0,Math.min(3,Number($('racePitSlot')?.value||0)));
  if($('raceSlotWord'))$('raceSlotWord').value=String(inf.expected[sel]);
  setDirty();updateAll();
  const st=$('raceSetupStatus');if(st)st.textContent=`Pit side presentation corrected from the current two-row pit-box layout (${inf.expected.map((v,i)=>`P${i+1}=${v}`).join(' · ')}).`;
}

function preferredCrewPosition(pit){
  if(!pit||!Number.isFinite(pit.serviceX)||!Number.isFinite(pit.serviceY)||(pit.slotWord!==0&&pit.slotWord!==1))return null;
  const q=R.projectFixedXZ(R.numberToFixed(pit.serviceX),R.numberToFixed(pit.serviceY));if(!q)return null;
  return {x:q.x-2,y:q.y+(pit.slotWord===1?1:0),boxX:q.x,boxY:q.y};
}
function crewState(){
  const pits=livePits();if(!pits)return null;
  const sel=Math.max(0,Math.min(3,Number($('racePitSlot')?.value||0))),pit=pits[sel],want=preferredCrewPosition(pit);
  if(!want)return {sel,pit,want:null};
  const dx=pit.screenX-want.x,dy=pit.screenY-want.y,distance=Math.hypot(dx,dy);
  return {sel,pit,want,dx,dy,distance};
}
function updateCrewValidation(){
  const c=crewState(),align=$('raceAlignCrew');if(align)align.disabled=!c?.want;
  if(!c?.want){setIssue('raceCrewValidation','Crew placement cannot be validated until the selected pit has valid coordinates and side 0/1.',false,true);return;}
  if(c.distance>CREW_WARN_DISTANCE){
    setIssue('raceCrewValidation',`Pit crew position is outside the retail spacing envelope for P${c.sel+1} (preferred ≈ ${c.want.x},${c.want.y}; current ${c.pit.screenX},${c.pit.screenY}).`,true);return;
  }
  setIssue('raceCrewValidation','');
}
function alignCrewToPitBox(){
  const model=currentModel(),setup=currentSetup(),c=crewState();if(!model||!setup||!c?.want)return;
  R.writePit(model.main,setup.pitFileOffset,c.sel,{screenX:c.want.x,screenY:c.want.y});
  if($('raceScreenX'))$('raceScreenX').value=String(c.want.x);
  if($('raceScreenY'))$('raceScreenY').value=String(c.want.y);
  setDirty();redrawRace();updateAll();
  const st=$('raceSetupStatus');if(st)st.textContent=`P${c.sel+1} pit crew aligned to the retail-derived pit-box relationship (${c.want.x}, ${c.want.y}).`;
}

function updateAll(){updateStartDirection();updatePitSide();updateCrewValidation();}

function renameLabel(inputId,text){
  const input=$(inputId),label=input?.closest('label');if(!label)return null;
  for(const n of label.childNodes){if(n.nodeType===Node.TEXT_NODE){n.textContent=text+' ';break;}}
  return label;
}
function installUi(){
  if(installed)return true;
  const orient=$('raceStartOrient'),side=$('raceSlotWord'),grid=orient?.closest('.raceSetupGrid'),pitGrid=side?.closest('.raceSetupGrid');
  if(!orient||!side||!grid||!pitGrid)return false;
  installed=true;
  const style=document.createElement('style');style.textContent=`
    .raceValidationBad{color:#ff6b6b!important;font-size:10px;line-height:1.25;margin-top:2px}
    .raceValidationMuted{color:#8e97a6!important;font-size:10px;line-height:1.25;margin-top:2px}
    .raceValidationLine{grid-column:1/-1;min-height:0}
    #raceGridDirectionToggle{width:100%;font-size:11px;padding:6px}
  `;document.head.appendChild(style);

  const startLabel=renameLabel('raceStartOrient','Grid X direction');
  orient.style.display='none';orient.tabIndex=-1;
  const dir=document.createElement('button');dir.id='raceGridDirectionToggle';dir.type='button';dir.title='Toggle the proved race+$6A X-mirror state between +X (0) and -X ($8000 / -32768).';
  startLabel.appendChild(dir);dir.addEventListener('click',toggleGridDirection);
  const startIssue=document.createElement('div');startIssue.id='raceGridDirectionValidation';startIssue.className='raceValidationLine';startIssue.hidden=true;grid.appendChild(startIssue);

  renameLabel('raceServiceX','Pit box X (16.16)');renameLabel('raceServiceY','Pit box Y (16.16)');
  renameLabel('raceScreenX','Pit crew screen X');renameLabel('raceScreenY','Pit crew screen Y');
  renameLabel('raceSlotWord','Pit side (0/1)');side.min='0';side.max='1';side.step='1';side.title='Code-proven 0/1 pit presentation variant at pit+$14.';
  const pitIssue=document.createElement('div');pitIssue.id='racePitSideValidation';pitIssue.className='raceValidationLine';pitIssue.hidden=true;pitGrid.appendChild(pitIssue);
  const crewIssue=document.createElement('div');crewIssue.id='raceCrewValidation';crewIssue.className='raceValidationLine';crewIssue.hidden=true;pitGrid.appendChild(crewIssue);

  const actions=document.createElement('div');actions.className='raceSetupActions';
  const fix=document.createElement('button');fix.id='raceFixPitSides';fix.type='button';fix.textContent='Correct pit sides';fix.title='When the four pit boxes form two clear rows, set upper-row pits to side 1 and lower-row pits to side 0, matching all comparable retail circuits.';
  const align=document.createElement('button');align.id='raceAlignCrew';align.type='button';align.textContent='Align crew to pit box';align.title='Set the selected pit crew to the retail-derived preferred anchor: 2 px left of the projected pit box; side 0 uses the same Y and side 1 uses +1 px Y.';
  actions.append(fix,align);pitGrid.insertAdjacentElement('afterend',actions);fix.addEventListener('click',fixPitSides);align.addEventListener('click',alignCrewToPitBox);

  const watched=['raceStartX','raceStartY','raceStartOrient','raceServiceX','raceServiceY','raceScreenX','raceScreenY','raceSlotWord','racePitSlot'];
  for(const id of watched){const el=$(id);el?.addEventListener('input',()=>setTimeout(updateAll,0));el?.addEventListener('change',()=>setTimeout(updateAll,0));}
  $('trackSelect')?.addEventListener('change',()=>setTimeout(updateAll,0));
  $('raceApply')?.addEventListener('click',()=>setTimeout(updateAll,0));
  $('raceRevert')?.addEventListener('click',()=>setTimeout(updateAll,0));
  $('raceExport')?.addEventListener('click',()=>updateAll(),true);
  $('raceExportAll')?.addEventListener('click',()=>updateAll(),true);
  $('raceSetupCanvas')?.addEventListener('pointermove',()=>setTimeout(updateAll,0));
  $('raceSetupCanvas')?.addEventListener('pointerup',()=>setTimeout(updateAll,0));
  document.addEventListener('indyheat-race-setup-capture',()=>setTimeout(updateAll,0));

  // Export/save should always refresh the advisory checks first, without blocking export.
  document.addEventListener('click',e=>{
    const b=e.target?.closest?.('button');if(!b)return;
    if(/export circuit zip|export setup|save/i.test(String(b.textContent||'')))updateAll();
  },true);

  // The waypoint mirror reverses the authored start direction too.  The original
  // flip action is synchronous; check its status after it runs and swap +$6A only
  // when the waypoint transform succeeded.
  const flip=$('flipWaypointsLR');
  if(flip)flip.addEventListener('click',()=>setTimeout(()=>{
    const msg=String($('editStatus')?.textContent||'');
    if(/^Flipped \d+ waypoints on Routes A\/B\/C/.test(msg)){
      const setup=currentSetup();if(setup){
        const current=liveInteger('raceStartOrient',setup.startOrient);
        try{writeGridDirection(current<0?GRID_PLUS_X:GRID_MINUS_X,'Waypoint X mirror completed; Grid X direction was swapped with it.');}catch(_e){}
      }
    }
  },0),true);

  updateAll();return true;
}

let tries=0;
function boot(){if(installUi())return;if(++tries<240)setTimeout(boot,50);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});else setTimeout(boot,0);

// Low-frequency fallback keeps advisory text correct after structural waypoint
// edits/imports that do not emit a dedicated public event.
setInterval(()=>{
  if(!installed)return;
  const key=`${selectedTrackIndex()}|${root.IndyHeatWaypointAuthoring?.routeCounts?.()?.join('/')||''}|${$('racePitSlot')?.value||0}|${$('raceStartX')?.value||''}|${$('raceStartOrient')?.value||''}|${$('raceServiceY')?.value||''}|${$('raceSlotWord')?.value||''}`;
  if(key!==lastKey){lastKey=key;updateAll();}
},400);

root.IndyHeatRaceValidation={
  version:'0.57',update:updateAll,startDirectionState,inferPitSides,crewState,
  retailCrewRule:{xOffset:-2,yOffsetSide0:0,yOffsetSide1:1,warningDistance:CREW_WARN_DISTANCE}
};
})(typeof globalThis!=='undefined'?globalThis:this);
