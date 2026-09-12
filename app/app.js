'use strict';
const T=globalThis.IndyHeatTools;
let model=null, selected=null, raceRecords=[];
const $=id=>document.getElementById(id);
const canvas=$('view'), ctx=canvas.getContext('2d',{alpha:false});
const state={bg:null,mask1:null,surface:null,heading:null,resources:null,waypoints:null,race:null};
function waypointDisplayTransform(){const mode=$('wpFlipMode')?.value??'auto';const autoFlip=!!(state.race&&state.race.coordFlipWord<0);const flipX=mode==='yes'?true:mode==='no'?false:autoFlip;return {sx:Number($('wpScaleX')?.value??2),ox:Number($('wpOffsetX')?.value??0),sy:Number($('wpScaleY')?.value??1),oy:Number($('wpOffsetY')?.value??128),flipMode:mode,flipX,autoFlipFromRaceFlag:autoFlip}}
function wpScreen(p){const t=waypointDisplayTransform();let x=p.xByte*t.sx+t.ox;if(t.flipX)x=319-x;return {x,y:p.y*t.sy+t.oy};}

function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function hx(v,n=4){return T.hex(v,n)}
function log(s){$('scanLog').textContent += s+'\n';}
function status(html){$('diskStatus').innerHTML=html;}
function setEnabled(on){
  $('trackSelect').disabled=!on; $('savePng').disabled=!on; $('saveJson').disabled=!on;
  document.querySelectorAll('[data-dl]').forEach(b=>b.disabled=!on);
}
function downloadBlob(blob,name){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
function downloadBytes(bytes,name){downloadBlob(new Blob([bytes],{type:'application/octet-stream'}),name)}

async function loadFile(file){
  setEnabled(false); model=null; selected=null; $('scanLog').textContent='';
  status('Reading '+esc(file.name)+'…');
  try{
    const disk=new Uint8Array(await file.arrayBuffer());
    log(`Input: ${file.name} · ${disk.length} bytes (${hx(disk.length,6)})`);
    if(disk.length!==901120) log('WARNING: expected a 901,120-byte Amiga DD image; continuing with format detection.');
    status('Scanning Imploder resources…');
    await new Promise(r=>requestAnimationFrame(r));
    model=T.makeDiskModel(disk);
    log(`Imploder blocks found: ${model.blocks.length}`);
    log(`Main: disk ${hx(model.mainBlock.offset,6)}, unpacked ${hx(model.main.length,6)}`);
    log(`Resource directory: main+${hx(model.resourceTableOffset,4)}, ${model.resources.length} sequential entries`);
    if(model.blocks.length!==96) log(`NOTE: research disk produced 96 blocks; this image produced ${model.blocks.length}.`);
    status(`<span class="ok">Indy Heat recognised.</span><br>${disk.length.toLocaleString()} bytes · ${model.blocks.length} compressed blocks · ${model.resources.length} resource entries`);
    raceRecords=T.parseRaceRecords(model.main);
    raceRecords.forEach(r=>{r.baseResourceId=T.raceBaseResourceId(r,model.resourceTableOffset+0x1000);r.waypointDescriptors=T.parseWaypointDescriptors(model.main,r);});
    populateTracks(); renderRaceRecords(); setEnabled(true); $('trackSelect').value='0'; selectTrack(0);
  }catch(e){ console.error(e); status(`<span class="bad">${esc(e.message)}</span>`); log('ERROR: '+e.stack); }
}

function populateTracks(){
  const sel=$('trackSelect'); sel.innerHTML='';
  T.TRACK_BASE_IDS.forEach((id,i)=>{
    const rr=raceRecords.find(r=>r.baseResourceId===id);
    const o=document.createElement('option'); o.value=i; o.textContent=`${rr?rr.name:'Track group '+(i+1)} · resources ${hx(id,2)}–${hx(id+3,2)}`; sel.appendChild(o);
  });
}

function resourceRow(r,label){
  const e=r.entry,b=r.block;
  return `<tr><td>${esc(label)}</td><td>${hx(r.id,2)}</td><td>${hx(e.sector,3)}</td><td>${hx(e.outLen,5)}</td><td>${hx(b.packedSize,5)}</td><td>${esc(b.magic)}</td></tr>`;
}

function selectTrack(index){
  if(!model)return;
  try{
    const base=T.TRACK_BASE_IDS[index];
    const rs=[0,1,2,3].map(n=>model.getResource(base+n));
    state.resources=rs;
    state.bg=T.decodePlanar(rs[0].data,320,256,5,0);
    const maskOffset=autoMaskOffset(rs[1].data);
    state.mask1=T.decode1bpp(rs[1].data,320,256,maskOffset);
    state.surface=T.decodeSurface2bpp(rs[2].data,Math.max(0,rs[2].data.length-0x1180));
    state.heading=T.decodeHeadingGrid(rs[3].data,Math.max(0,rs[3].data.length-0x460));
    state.race=raceRecords.find(r=>r.baseResourceId===base) || null;
    state.waypoints=state.race?state.race.waypointDescriptors:null;
    selected={index,base,maskOffset};
    $('trackMeta').innerHTML=`${state.race?'<b>'+esc(state.race.name)+'</b> · race record #'+state.race.index+'<br>':''}Background ${hx(base,2)} · +1 ${hx(base+1,2)} · +2 ${hx(base+2,2)} · +3 ${hx(base+3,2)}${state.race?'<br>mapping: race +$36 → resource '+hx(base,2)+'<br>waypoints: '+state.waypoints.map(w=>w.points.length).join(' / ')+'<br>race-local coords: X origin '+state.race.coordXOriginHi+', Y origin '+state.race.coordYOriginHi+', X mirror '+(state.race.coordFlipWord<0?'YES':'no')+' (+$6A '+hx(state.race.coordFlipWord&0xffff,4)+')':''}`;
    $('resourceTable').innerHTML=`<table><thead><tr><th>Role</th><th>ID</th><th>sector</th><th>unpacked</th><th>packed</th><th>type</th></tr></thead><tbody>${resourceRow(rs[0],'5-plane bitmap')}${resourceRow(rs[1],'+1 1bpp')}${resourceRow(rs[2],'+2 2bpp surface')}${resourceRow(rs[3],'+3 heading grid')}</tbody></table>`;
    updateStats(); render();
  }catch(e){console.error(e); log('Track load error: '+e.stack);}
}

function autoMaskOffset(data){
  if(data.length===0x2804) return 4;
  if(data.length>0x2800 && data.length-0x2800<=16) return data.length-0x2800;
  return 0;
}
function requestedMaskOffset(){ const v=$('mask1Offset').value; return v==='auto'?autoMaskOffset(state.resources[1].data):Number(v); }
function refreshMask(){ if(!state.resources)return; try{state.mask1=T.decode1bpp(state.resources[1].data,320,256,requestedMaskOffset());render();}catch(e){log(e.message);} }

function updateStats(){
  const sh=T.histogram(state.surface.cells,3);
  $('surfaceStats').textContent=`logical: 160 × 112\ncoverage: 320 × 224\n2 bits/cell\n\nclass 0: ${sh[0]}\nclass 1: ${sh[1]}\nclass 2: ${sh[2]}\nclass 3: ${sh[3]}`;
  const vals=state.heading.values; let min=255,max=0,sum=0; const unique=new Set();
  for(const v of vals){min=Math.min(min,v);max=Math.max(max,v);sum+=v;unique.add(v)}
  $('headingStats').textContent=`grid: 40 × 28\ncell: 8 × 8 px\nbytes: ${vals.length}\nrange: ${min}–${max}\nunique: ${unique.size}\nmean: ${(sum/vals.length).toFixed(1)}`;
}

function backgroundImage(){
  const im=ctx.createImageData(320,256); const d=im.data;
  for(let i=0;i<state.bg.length;i++){
    const v=state.bg[i], g=Math.round(v*255/31), p=i*4;
    d[p]=g;d[p+1]=g;d[p+2]=g;d[p+3]=255;
  }
  return im;
}
function render(){
  if(!state.bg){ctx.fillStyle='#000';ctx.fillRect(0,0,320,256);return;}
  if($('showBg').checked) ctx.putImageData(backgroundImage(),0,0); else {ctx.fillStyle='#17191d';ctx.fillRect(0,0,320,256);}
  const alpha=Number($('opacity').value)/100;
  if($('showMask1').checked){
    ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle='#f5bd4f';
    // Render in scanline runs to keep this cheap.
    for(let y=0;y<256;y++){
      let run=-1;
      for(let x=0;x<=320;x++){
        const on=x<320 && state.mask1[y*320+x];
        if(on && run<0)run=x;
        if(!on && run>=0){ctx.fillRect(run,y,x-run,1);run=-1;}
      }
    }
    ctx.restore();
  }
  if($('showSurface').checked){
    const enabled=new Set(Array.from(document.querySelectorAll('.surfaceClass:checked')).map(c=>Number(c.dataset.class)));
    const colors=['rgba(255,255,255,0.15)','#dc4545','#5ed46c','#4a79e8'];
    ctx.save();ctx.globalAlpha=alpha;
    const s=state.surface;
    for(let y=0;y<s.height;y++) for(let x=0;x<s.width;x++){
      const v=s.cells[y*s.width+x]; if(!enabled.has(v))continue;
      ctx.fillStyle=colors[v];ctx.fillRect(x*2,y*2,2,2);
    }
    ctx.restore();
  }
  if($('showWaypoints').checked && state.waypoints) drawWaypoints();
  if($('showHeading').checked) drawHeading();
}
function drawWaypoints(){
  const enabled=new Set(Array.from(document.querySelectorAll('.waypointSet:checked')).map(c=>Number(c.dataset.set)));
  const colors=['#ff5353','#53f06b','#4fd8ff'];
  const showCandidateLinks=$('showWaypointLinks').checked;
  const byAddress=new Map();
  for(const set of state.waypoints) for(const p of set.points) byAddress.set(p.runtimeAddress,{set,p});
  ctx.save();ctx.lineWidth=.8;
  if(showCandidateLinks){
    // Diagnostic only: static records strongly suggest decodedDelta = raw(+4)+13,
    // but runtime preprocessing has not yet been located. Draw only links whose target
    // resolves to another point in this same race record; never connect storage order.
    ctx.setLineDash([2,2]); ctx.globalAlpha=.72;
    for(const set of state.waypoints){
      if(!enabled.has(set.index))continue;
      ctx.strokeStyle=colors[set.index]||'#fff';
      for(const p of set.points){
        if(p.linkTargetCandidate==null)continue;
        const t=byAddress.get(p.linkTargetCandidate); if(!t)continue;
        if(!enabled.has(t.set.index))continue;
        const a=wpScreen(p),b=wpScreen(t.p); const x1=a.x,y1=a.y,x2=b.x,y2=b.y;
        if(x1<0||x1>=320||y1<0||y1>=224||x2<0||x2>=320||y2<0||y2>=224)continue;
        ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
      }
    }
    ctx.setLineDash([]); ctx.globalAlpha=1;
  }
  for(const set of state.waypoints){
    if(!enabled.has(set.index))continue;
    const col=colors[set.index]||'#fff'; ctx.fillStyle=col;
    for(const p of set.points){
      const q=wpScreen(p),x=q.x,y=q.y;if(x<0||x>=320||y<0||y>=224)continue;
      ctx.fillRect(x-1,y-1,3,3);
    }
  }
  ctx.restore();
}

function drawHeading(){
  const phase=Number($('headingPhase').value), reverse=$('headingReverse').checked?-1:1;
  ctx.save(); ctx.strokeStyle='rgba(255,255,255,.76)';ctx.fillStyle='rgba(255,255,255,.76)';ctx.lineWidth=.65;
  const h=state.heading;
  for(let gy=0;gy<h.height;gy++) for(let gx=0;gx<h.width;gx++){
    const v=h.values[gy*h.width+gx];
    const a=reverse*((v+phase)&255)*Math.PI*2/256;
    const cx=gx*8+4,cy=gy*8+4,len=3.2;
    const ex=cx+Math.cos(a)*len, ey=cy+Math.sin(a)*len;
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(ex,ey);ctx.stroke();
    const ah=1.35,aa=.7;
    ctx.beginPath();ctx.moveTo(ex,ey);ctx.lineTo(ex-Math.cos(a-aa)*ah,ey-Math.sin(a-aa)*ah);ctx.lineTo(ex-Math.cos(a+aa)*ah,ey-Math.sin(a+aa)*ah);ctx.closePath();ctx.fill();
  }
  ctx.restore();
}

function cursorAt(ev){
  if(!selected)return;
  const r=canvas.getBoundingClientRect(); const x=Math.max(0,Math.min(319,Math.floor((ev.clientX-r.left)*320/r.width))), y=Math.max(0,Math.min(255,Math.floor((ev.clientY-r.top)*256/r.height)));
  const bg=state.bg[y*320+x],occ=state.mask1[y*320+x];
  let surf='outside gameplay',head='outside gameplay';
  if(y<224){ surf=state.surface.cells[(y>>1)*160+(x>>1)]; head=state.heading.values[(y>>3)*40+(x>>3)]; }
  let wp='';
  if(state.waypoints){let best=null,bd=999;for(const set of state.waypoints)for(const p of set.points){const q=wpScreen(p),dx=q.x-x,dy=q.y-y,dd=dx*dx+dy*dy;if(dd<bd){bd=dd;best={set:set.index,p,q};}}if(best&&bd<=36){const p=best.p;wp=`\nWP descriptor/index ${best.set}/${p.index}\ndisplay x/y        ${best.q.x.toFixed(1)}/${best.q.y.toFixed(1)}\nraw +0 word        ${p.rawWord0} (bytes ${p.raw0},${p.xByte})\nprogress +2        ${p.progress}${p.progressFlag?' +flag':''} (raw ${p.progressRaw})\nraw y +3           ${p.y}\nraw link +4        ${p.linkRaw}\nlink Δ candidate   ${p.linkDeltaCandidate}${p.linkRecordsCandidate==null?' (unaligned)':` = ${p.linkRecordsCandidate} records`}\nruntime addr       ${hx(p.runtimeAddress,4)}`;}}
  $('cursorInfo').textContent=`x ${x.toString().padStart(3)}  y ${y.toString().padStart(3)}\ncolour index ${bg}\n+1 bit       ${occ}\n+2 surface   ${surf}\n+3 heading   ${head}${wp}`;
}

function trackJson(){
  const rs=state.resources,s=state.surface,h=state.heading;
  return {
    format:'Indy Heat Amiga track research export',version:'0.5',
    source:{resourceTableOffset:model.resourceTableOffset,trackGroup:selected.index+1,baseResource:selected.base},
    resources:rs.map((r,i)=>({role:['background5bpp','bitmap1bpp','surface2bpp','heading8x8'][i],id:r.id,sector:r.entry.sector,sectors:r.entry.sectors,unpackedSize:r.data.length,packedSize:r.block.packedSize,magic:r.block.magic})),
    bitmap:{width:320,height:256,planes:5},
    overlay1bpp:{width:320,height:256,decodeOffset:requestedMaskOffset(),semantics:'foreground/occlusion mask; code-traced through car BOB/blitter masking path'},
    surface:{logicalWidth:160,logicalHeight:112,scaleX:2,scaleY:2,classes:Array.from(s.cells),semantics:{0:'ordinary/no special response',1:'collision/edge correction; invokes heading grid',2:'slowdown class A; stronger speed decay (speed -= speed>>5)',3:'slowdown class B; weaker speed decay (speed -= speed>>6)'}},
    heading:{width:40,height:28,cellWidth:8,cellHeight:8,values:Array.from(h.values),displayPhase:Number($('headingPhase').value),displayReverse:$('headingReverse').checked,note:'byte heading/direction lookup; display phase is visualisation-only until angular convention is fully labelled'},
    race:state.race?{eventIndex:state.race.index,name:state.race.name,lapCandidate:state.race.field28,eventNumber:state.race.field2A,coordXOriginRaw:state.race.coordXOriginRaw,coordXOriginHi:state.race.coordXOriginHi,coordYOriginRaw:state.race.coordYOriginRaw,coordYOriginHi:state.race.coordYOriginHi,coordFlipWord:state.race.coordFlipWord}:null,
    waypointDescriptors:state.waypoints?state.waypoints.map(set=>({
      index:set.index,runtimeStart:set.start,runtimeEnd:set.end,count:set.count,descriptorBytes:set.descriptorBytes,
      nearestScanCountCandidate:set.nearestScanCountCandidate,
      points:set.points.map(p=>({
        index:p.index,runtimeAddress:p.runtimeAddress,fileOffset:p.fileOffset,
        raw0:p.raw0,xByte:p.xByte,rawWord0:p.rawWord0,
        progressRaw:p.progressRaw,progress:p.progress,progressFlag:p.progressFlag,
        y:p.y,linkRaw:p.linkRaw,linkDeltaCandidate:p.linkDeltaCandidate,
        linkRecordsCandidate:p.linkRecordsCandidate,linkTargetCandidate:p.linkTargetCandidate,
        screenXUnmirrored:p.screenXUnmirrored,screenYProvisional:p.screenYProvisional,
        displayX:wpScreen(p).x,displayY:wpScreen(p).y
      }))
    })):[],
    waypointDisplayTransform:waypointDisplayTransform(),
    waypointResearchNote:'v0.5 uses the race record +$6A sign as the automatic X-mirror choice: negative => mirrored, non-negative => not mirrored. Display then uses x=byte1*2 (optionally mirrored around pixel 319) and y=signed(byte3)+128. Race +$62/+66 are code-proven circuit-local fixed-point origins used before AI waypoint comparison and are exported but not yet folded into the screen projection. Manual transform controls remain diagnostic. Earlier waypoint montages are superseded.'
  };
}

function renderRaceRecords(){
  const recs=raceRecords;
  let html='<table><thead><tr><th>#</th><th>main off</th><th>name candidate</th><th>+28</th><th>+2A</th><th>track base</th><th>X/Y origin</th><th>X mirror +$6A</th><th>three path descriptors (runtime start → end / stored count)</th></tr></thead><tbody>';
  for(const r of recs){
    const ds=r.descriptors.map(d=>`${hx(d.start,4)}→${hx(d.end,4)} / ${d.count}`).join('<br>');
    html+=`<tr><td>${r.index}</td><td>${hx(r.offset,4)}</td><td>${esc(r.name||'—')}</td><td>${r.field28}</td><td>${r.field2A}</td><td>${r.baseResourceId==null?'—':hx(r.baseResourceId,2)}</td><td>${r.coordXOriginHi} / ${r.coordYOriginHi}</td><td>${r.coordFlipWord<0?'YES':'no'} (${hx(r.coordFlipWord&0xffff,4)})</td><td class="mono">${ds}</td></tr>`;
  }
  html+='</tbody></table><p class="mini muted">Race-record order differs from circuit-resource order; the table above shows the descriptor-derived resource base. The boot loader copies the decrunched main image to runtime $1000, so a waypoint runtime pointer maps to this file image at pointer − $1000. The nearest-point routine scans six-byte records. Stored end−start equals count×6, while its DBF loop appears to inspect count+1 records; this boundary behaviour is still under trace.</p>';
  $('raceRecords').innerHTML=html;
}

$('fileInput').addEventListener('change',e=>e.target.files[0]&&loadFile(e.target.files[0]));
const dz=$('dropZone');
['dragenter','dragover'].forEach(n=>dz.addEventListener(n,e=>{e.preventDefault();dz.classList.add('drag')}));
['dragleave','drop'].forEach(n=>dz.addEventListener(n,e=>{e.preventDefault();dz.classList.remove('drag')}));
dz.addEventListener('drop',e=>e.dataTransfer.files[0]&&loadFile(e.dataTransfer.files[0]));
$('trackSelect').addEventListener('change',e=>selectTrack(Number(e.target.value)));
['showBg','showMask1','showSurface','showWaypoints','showWaypointLinks','showHeading','headingReverse','wpFlipMode'].forEach(id=>$(id).addEventListener('change',render));
document.querySelectorAll('.surfaceClass').forEach(c=>c.addEventListener('change',render));
document.querySelectorAll('.waypointSet').forEach(c=>c.addEventListener('change',render));
$('mask1Offset').addEventListener('change',refreshMask);
$('headingPhase').addEventListener('input',e=>{$('phaseText').textContent=e.target.value;render()});
$('opacity').addEventListener('input',e=>{$('opacityText').textContent=e.target.value+'%';render()});

['wpScaleX','wpOffsetX','wpScaleY','wpOffsetY'].forEach(id=>$(id).addEventListener('input',render));
$('wpReset').addEventListener('click',()=>{$('wpFlipMode').value='auto';$('wpScaleX').value=2;$('wpOffsetX').value=0;$('wpScaleY').value=1;$('wpOffsetY').value=128;render();});
canvas.addEventListener('mousemove',cursorAt);
$('savePng').addEventListener('click',()=>canvas.toBlob(b=>downloadBlob(b,`indyheat_group_${selected.index+1}_view.png`),'image/png'));
$('saveJson').addEventListener('click',()=>downloadBlob(new Blob([JSON.stringify(trackJson(),null,2)],{type:'application/json'}),`indyheat_group_${selected.index+1}.json`));
document.querySelectorAll('[data-dl]').forEach(b=>b.addEventListener('click',()=>{const i=Number(b.dataset.dl),r=state.resources[i];downloadBytes(r.data,`indyheat_${hx(r.id,2).slice(1)}_${['background','bitmap1','surface2bpp','heading'][i]}.bin`)}));

ctx.fillStyle='#000';ctx.fillRect(0,0,320,256);
