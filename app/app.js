'use strict';
const T=globalThis.IndyHeatTools;
let model=null, selected=null, raceRecords=[], originalMain=null, paletteSet=null;
const ONLINE_DISK_URL='https://raw.githubusercontent.com/HoraceAndTheSpider/Indy-Heat-WHD/master/whdload/data/Disk.1';
let manualDiskRequested=false;
let loadSerial=0;
const edits=new Map();
const $=id=>document.getElementById(id);
const canvas=$('view'), ctx=canvas.getContext('2d',{alpha:false});
const baseCanvas=document.createElement('canvas');baseCanvas.width=320;baseCanvas.height=256;
const baseCtx=baseCanvas.getContext('2d',{alpha:false});
const state={bg:null,mask1:null,surface:null,heading:null,resources:null,waypoints:null,race:null,selectedWaypoint:null,palette:null,paletteSource:null,drag:null};
function editorScale(){return Number($('editorScale')?.value||3);}
function resizeEditorCanvas(){const s=editorScale();canvas.width=320*s;canvas.height=256*s;ctx.imageSmoothingEnabled=false;}
function pointForDisplay(p){if(state.drag&&state.drag.pointAddress===p.runtimeAddress&&state.drag.preview)return {...p,x:state.drag.preview.x,y:state.drag.preview.y};return p;}

// The old v0.6 display calibration was expressed against complemented storage bytes.
// These defaults are the algebraically equivalent transform of the proven decoded runtime X/Y.
// The exact game wrapper feeding $B082 remains under trace, so this is a display mapping, not format semantics.
function waypointDisplayTransform(){return {mode:$('wpProjectionMode')?.value??'a082',sx:Number($('wpScaleX')?.value??2),ox:Number($('wpOffsetX')?.value??338),sy:Number($('wpScaleY')?.value??-1.5),oy:Number($('wpOffsetY')?.value??142.5)}}
function projectWaypointForDisplay(p,t=waypointDisplayTransform()){
  if(t.mode==='a082'){const q=T.projectWaypointA082(p.x,p.y);if(q)return q;}
  return {x:p.x*t.sx+t.ox,y:p.y*t.sy+t.oy};
}
function wpScreen(p){return projectWaypointForDisplay(pointForDisplay(p));}

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
  const serial=++loadSerial;
  setEnabled(false); model=null; selected=null; originalMain=null; paletteSet=null; edits.clear(); state.selectedWaypoint=null; $('scanLog').textContent='';
  status('Reading '+esc(file.name)+'…');
  try{
    const disk=new Uint8Array(await file.arrayBuffer());
    if(serial!==loadSerial)return;
    log(`Input: ${file.name} · ${disk.length} bytes (${hx(disk.length,6)})`);
    if(disk.length!==901120) log('WARNING: expected a 901,120-byte Amiga DD image; continuing with format detection.');
    status('Scanning Imploder resources…');
    await new Promise(r=>requestAnimationFrame(r));
    if(serial!==loadSerial)return;
    model=T.makeDiskModel(disk);
    originalMain=model.main.slice();
    log(`Imploder blocks found: ${model.blocks.length}`);
    log(`Main: disk ${hx(model.mainBlock.offset,6)}, unpacked ${hx(model.main.length,6)}`);
    log(`Resource directory: main+${hx(model.resourceTableOffset,4)}, ${model.resources.length} sequential entries`);
    if(model.blocks.length!==96) log(`NOTE: research disk produced 96 blocks; this image produced ${model.blocks.length}.`);
    status('<span class="ok">Disk loaded.</span>');
    raceRecords=T.parseRaceRecords(model.main);
    raceRecords.forEach(r=>{r.baseResourceId=T.raceBaseResourceId(r,model.resourceTableOffset+0x1000);r.waypointDescriptors=T.parseWaypointDescriptors(model.main,r);});
    paletteSet=T.findVerifiedTrackPalette?T.findVerifiedTrackPalette(model):T.verifiedTrackPaletteReference();
    raceRecords.forEach(r=>{r.paletteCandidate=paletteSet;});
    if(paletteSet.exactSourceFound) log(`Track palette: exact r1.iff 32-colour table found in ${paletteSet.sourceLabel}.`);
    else log('Track palette: exact table was not located in the decompressed data; using the verified r1.iff CMAP reference.');
    $('paletteMode').value='game';
    populateTracks(); renderRaceRecords(); setEnabled(true); $('trackSelect').value='0'; selectTrack(0); updateEditExportButtons();
  }catch(e){ console.error(e); status(`<span class="bad">${esc(e.message)}</span>`); log('ERROR: '+e.stack); }
}

function populateTracks(){
  const sel=$('trackSelect'); sel.innerHTML='';
  T.TRACK_BASE_IDS.forEach((id,i)=>{
    const rr=raceRecords.find(r=>r.baseResourceId===id);
    const o=document.createElement('option'); o.value=i; o.textContent=rr?rr.name:`Circuit ${i+1}`; sel.appendChild(o);
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
    const maskOffset=0; // bitmap occupies the first $2800 bytes; $2804 resources have four trailing bytes, not a prefix
    state.mask1=T.decode1bpp(rs[1].data,320,256,0);
    state.surface=T.decodeSurface2bpp(rs[2].data,Math.max(0,rs[2].data.length-0x1180));
    state.heading=T.decodeHeadingGrid(rs[3].data,Math.max(0,rs[3].data.length-0x460));
    state.race=raceRecords.find(r=>r.baseResourceId===base) || null;
    const pal=state.race?.paletteCandidate || paletteSet || (T.verifiedTrackPaletteReference?T.verifiedTrackPaletteReference():null);
    state.palette=pal?.rgb||null;state.paletteSource=pal||null;
    state.waypoints=state.race?state.race.waypointDescriptors:null;
    state.selectedWaypoint=null;
    selected={index,base,maskOffset};
    const gameOpt=$('paletteMode').querySelector('option[value="game"]');
    if(state.palette){gameOpt.disabled=false;gameOpt.textContent='Original colour';}
    else{gameOpt.disabled=true;gameOpt.textContent='Original colour (unavailable)';if($('paletteMode').value==='game')$('paletteMode').value='mono';}
    $('trackMeta').textContent=state.race?'Routes A, B and C available':'';
    const palTech=state.paletteSource?`<p class="mini muted">Track palette: verified 32-colour r1.iff CMAP · ${esc(state.paletteSource.sourceLabel||'reference')}</p>`:`<p class="mini muted">Track palette unavailable.</p>`;
    $('resourceTable').innerHTML=`<table><thead><tr><th>Role</th><th>ID</th><th>sector</th><th>unpacked</th><th>packed</th><th>type</th></tr></thead><tbody>${resourceRow(rs[0],'5-plane bitmap')}${resourceRow(rs[1],'+1 1bpp')}${resourceRow(rs[2],'+2 2bpp surface')}${resourceRow(rs[3],'+3 heading grid')}</tbody></table>${palTech}`;
    updateStats(); updateWaypointFitStats(); updateWaypointValidation(); updateWaypointEditor(); render();
  }catch(e){console.error(e); log('Track load error: '+e.stack);}
}


function roadDistanceField(){
  if(!state.bg||!state.surface)return null;
  const w=320,h=224, inf=9999, d=new Float32Array(w*h);
  let minX=319,maxX=0,minY=223,maxY=0,count=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const safe=state.surface.cells[(y>>1)*160+(x>>1)]!==1;
    const road=state.bg[y*320+x]===0 && safe;
    const i=y*w+x; d[i]=road?0:inf;
    if(road){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);count++;}
  }
  const diag=1.41421356;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;let v=d[i];
    if(x)v=Math.min(v,d[i-1]+1); if(y)v=Math.min(v,d[i-w]+1);
    if(x&&y)v=Math.min(v,d[i-w-1]+diag); if(x+1<w&&y)v=Math.min(v,d[i-w+1]+diag); d[i]=v;
  }
  for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){
    const i=y*w+x;let v=d[i];
    if(x+1<w)v=Math.min(v,d[i+1]+1); if(y+1<h)v=Math.min(v,d[i+w]+1);
    if(x+1<w&&y+1<h)v=Math.min(v,d[i+w+1]+diag); if(x&&y+1<h)v=Math.min(v,d[i+w-1]+diag); d[i]=v;
  }
  return {data:d,width:w,height:h,bounds:{minX,maxX,minY,maxY,count}};
}
function allWaypointPoints(){const a=[];if(state.waypoints)for(const set of state.waypoints)for(const p of set.points)a.push(p);return a;}
function projectionQuality(t=waypointDisplayTransform(),field=roadDistanceField()){
  const pts=allWaypointPoints(); if(!pts.length||!field)return null;
  let n=0,oob=0,onBlack=0,near3=0,near6=0,safe=0,sum=0,minPX=999,maxPX=-999,minPY=999,maxPY=-999;
  for(const p of pts){
    const q=projectWaypointForDisplay(p,t),x=q.x,y=q.y;n++;minPX=Math.min(minPX,x);maxPX=Math.max(maxPX,x);minPY=Math.min(minPY,y);maxPY=Math.max(maxPY,y);
    if(x<0||x>=320||y<0||y>=224){oob++;sum+=144;continue;}
    const ix=Math.max(0,Math.min(319,Math.round(x))),iy=Math.max(0,Math.min(223,Math.round(y)));
    const dist=field.data[iy*320+ix];sum+=Math.min(dist,12)**2; if(state.bg[iy*320+ix]===0)onBlack++;if(dist<=3)near3++;if(dist<=6)near6++;
    const cls=state.surface.cells[(iy>>1)*160+(ix>>1)];if(cls!==1)safe++;else sum+=25;
  }
  const b=field.bounds,pw=maxPX-minPX,ph=maxPY-minPY,tw=b.maxX-b.minX,th=b.maxY-b.minY;
  const extentPenalty=.01*((pw-tw)**2+(ph-th)**2);
  return {n,oob,onBlack,near3,near6,safe,meanScore:sum/n+extentPenalty,pointBounds:{minPX,maxPX,minPY,maxPY},roadBounds:b};
}
function updateWaypointFitStats(){
  const q=projectionQuality();if(!q){$('wpFitStats').textContent='fit metrics unavailable';return;}
  const pc=v=>`${(100*v/q.n).toFixed(1)}%`;
  const t=waypointDisplayTransform();
  $('wpFitStats').textContent=`projection          ${t.mode==='a082'?'engine A082(x,0,y)':'manual'}\non black bitmap     ${pc(q.onBlack)}\nblack road ≤3 px    ${pc(q.near3)}\nblack road ≤6 px    ${pc(q.near6)}\n+2 not collision    ${pc(q.safe)}\noutside gameplay    ${q.oob}/${q.n}\nresearch score      ${q.meanScore.toFixed(1)} (lower is better)`;
}
function autoFitWaypointsToRoad(){
  const field=roadDistanceField(),pts=allWaypointPoints();if(!field||!pts.length)return;
  let best=null;
  const test=(sx,ox,sy,oy)=>{const t={mode:'manual',sx,ox,sy,oy},q=projectionQuality(t,field);if(!best||q.meanScore<best.q.meanScore)best={t,q};};
  // Research fit checks both X handednesses. Some near-symmetric circuits can score well both ways, so this is evidence, not format semantics.
  for(const xsign of [-1,1])for(let mag=1.5;mag<=2.5+1e-9;mag+=.1){const sx=xsign*mag;
    for(const ysign of [-1,1])for(let ymag=1.0;ymag<=1.8+1e-9;ymag+=.1){const sy=ysign*ymag;
      for(let ox=-80;ox<=400;ox+=20)for(let oy=80;oy<=200;oy+=10)test(sx,ox,sy,oy);
    }
  }
  let {sx,ox,sy,oy}=best.t;
  // Small coordinate-descent refinement around the coarse result.
  for(const step of [[.05,2,.05,2],[.025,1,.025,1]]){
    let improved=true,guard=0;
    while(improved&&guard++<4){improved=false;const before=best.q.meanScore;
      for(const [key,delta] of [['sx',step[0]],['ox',step[1]],['sy',step[2]],['oy',step[3]]]){
        const base={sx,ox,sy,oy}; for(const dir of [-1,1]){const t={...base};t[key]+=delta*dir;test(t.sx,t.ox,t.sy,t.oy);}
        ({sx,ox,sy,oy}=best.t);
      }
      improved=best.q.meanScore<before-.001;
    }
  }
  $('wpProjectionMode').value='manual';$('wpScaleX').value=sx.toFixed(3);$('wpOffsetX').value=ox.toFixed(2);$('wpScaleY').value=sy.toFixed(3);$('wpOffsetY').value=oy.toFixed(2);
}

function updateStats(){
  const sh=T.histogram(state.surface.cells,3);
  $('surfaceStats').textContent=`logical: 160 × 112\ncoverage: 320 × 224\n2 bits/cell\n\nclass 0: ${sh[0]}\nclass 1: ${sh[1]}\nclass 2: ${sh[2]}\nclass 3: ${sh[3]}`;
  const vals=state.heading.values; let min=255,max=0,sum=0; const unique=new Set();
  for(const v of vals){min=Math.min(min,v);max=Math.max(max,v);sum+=v;unique.add(v)}
  $('headingStats').textContent=`grid: 40 × 28\ncell: 8 × 8 px\nbytes: ${vals.length}\nrange: ${min}–${max}\nunique: ${unique.size}\nmean: ${(sum/vals.length).toFixed(1)}`;
}

function paletteForRender(){
  if($('paletteMode')?.value==='game' && state.palette?.length===32)return state.palette;
  return Array.from({length:32},(_,v)=>{const g=Math.round(v*255/31);return [g,g,g];});
}
function backgroundImage(){
  const im=baseCtx.createImageData(320,256),d=im.data,palette=paletteForRender();
  for(let i=0;i<state.bg.length;i++){
    const rgb=palette[state.bg[i]]||[0,0,0],p=i*4;
    d[p]=rgb[0];d[p+1]=rgb[1];d[p+2]=rgb[2];d[p+3]=255;
  }
  return im;
}
function render(){
  const S=editorScale();
  if(canvas.width!==320*S||canvas.height!==256*S)resizeEditorCanvas();
  ctx.imageSmoothingEnabled=false;
  if(!state.bg){ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);return;}
  ctx.fillStyle='#17191d';ctx.fillRect(0,0,320*S,256*S);
  if($('showBg').checked){
    baseCtx.putImageData(backgroundImage(),0,0);
    ctx.save();ctx.globalAlpha=Number($('backgroundOpacity')?.value??100)/100;
    ctx.drawImage(baseCanvas,0,0,320,256,0,0,320*S,256*S);ctx.restore();
  }
  const alpha=Number($('opacity').value)/100;
  if($('showMask1').checked){
    ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle='#f5bd4f';
    for(let y=0;y<256;y++){
      let run=-1;
      for(let x=0;x<=320;x++){
        const on=x<320&&state.mask1[y*320+x];
        if(on&&run<0)run=x;
        if(!on&&run>=0){ctx.fillRect(run*S,y*S,(x-run)*S,S);run=-1;}
      }
    }
    ctx.restore();
  }
  if($('showSurface').checked){
    const enabled=new Set(Array.from(document.querySelectorAll('.surfaceClass:checked')).map(c=>Number(c.dataset.class)));
    const colors=['rgba(255,255,255,0.15)','#dc4545','#5ed46c','#4a79e8'];
    ctx.save();ctx.globalAlpha=alpha;const surf=state.surface;
    for(let y=0;y<surf.height;y++)for(let x=0;x<surf.width;x++){
      const v=surf.cells[y*surf.width+x];if(!enabled.has(v))continue;
      ctx.fillStyle=colors[v];ctx.fillRect(x*2*S,y*2*S,2*S,2*S);
    }
    ctx.restore();
  }
  if($('showWaypoints').checked&&state.waypoints)drawWaypoints();
  if($('showHeading').checked)drawHeading();
}
function waypointAddressMapForSet(set){
  const m=new Map();if(!set)return m;
  for(const p of set.points)m.set(p.runtimeAddress,p);
  // A descriptor-end record may be shared with the next descriptor in storage, but
  // for route-link drawing it belongs only to the originating route's local view.
  if(set.boundaryPoint&&!m.has(set.boundaryPoint.runtimeAddress))m.set(set.boundaryPoint.runtimeAddress,set.boundaryPoint);
  return m;
}
function visibleWaypointSetIndices(){
  if(!$('showWaypoints')?.checked)return new Set();
  return new Set(Array.from(document.querySelectorAll('.waypointSet:checked')).map(c=>Number(c.dataset.set)));
}
function waypointLabel(p,set){
  const mode=$('wpLabelMode')?.value||'off';
  if(mode==='index')return `${'ABC'[set.index]}${p.index}`;
  if(mode==='sequence')return String(p.progress);
  return '';
}
function drawWaypointLabel(text,x,y,colour,S){
  if(!text)return;
  const fontPx=Math.max(10,Math.round(4*S));
  ctx.save();ctx.font=`600 ${fontPx}px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`;ctx.textBaseline='bottom';
  const tx=x+2.6*S,ty=y-1.7*S;
  ctx.lineJoin='round';ctx.strokeStyle='rgba(0,0,0,.9)';ctx.lineWidth=Math.max(2,1.1*S);ctx.strokeText(text,tx,ty);
  ctx.fillStyle=colour;ctx.fillText(text,tx,ty);ctx.restore();
}
function sequenceGroupEdges(){
  if(!$('showSequenceGroups')?.checked||!state.waypoints)return [];
  const enabled=visibleWaypointSetIndices(),groups=new Map(),edges=[];
  for(const set of state.waypoints){
    if(!enabled.has(set.index))continue;
    for(const p of set.points){
      const q=wpScreen(p);if(q.x<0||q.x>=320||q.y<0||q.y>=224)continue;
      if(!groups.has(p.progress))groups.set(p.progress,[]);
      groups.get(p.progress).push({p,q,set:set.index});
    }
  }
  // Minimum-spanning tree per sequence group: joins the geographically closest members
  // without turning 3+ equivalent points into an unreadable complete graph.
  for(const [sequence,pts] of groups){
    if(pts.length<2)continue;
    const used=new Set([0]);
    while(used.size<pts.length){
      let best=null;
      for(const i of used)for(let j=0;j<pts.length;j++)if(!used.has(j)){
        const dx=pts[i].q.x-pts[j].q.x,dy=pts[i].q.y-pts[j].q.y,d2=dx*dx+dy*dy;
        if(!best||d2<best.d2)best={a:pts[i],b:pts[j],d2,sequence,j};
      }
      if(!best)break;edges.push(best);used.add(best.j);
    }
  }
  return edges;
}
function drawSequenceGroups(S){
  const edges=sequenceGroupEdges();if(!edges.length)return;
  ctx.save();ctx.strokeStyle='#ffd84a';ctx.lineWidth=Math.max(1.5,.65*S);ctx.globalAlpha=.9;ctx.setLineDash([2.2*S,1.6*S]);
  for(const e of edges){ctx.beginPath();ctx.moveTo(e.a.q.x*S,e.a.q.y*S);ctx.lineTo(e.b.q.x*S,e.b.q.y*S);ctx.stroke();}
  ctx.restore();
}
function drawWaypoints(){
  const enabled=visibleWaypointSetIndices(),S=editorScale();if(!enabled.size)return;
  const colors=['#ff5353','#53f06b','#4fd8ff'],showLinks=$('showWaypointLinks')?.checked;
  ctx.save();
  drawSequenceGroups(S);
  if(showLinks){
    ctx.globalAlpha=.78;ctx.lineWidth=Math.max(1.2,0.55*S);
    for(const set of state.waypoints){
      if(!enabled.has(set.index))continue;ctx.strokeStyle=colors[set.index]||'#fff';
      const byAddress=waypointAddressMapForSet(set);
      for(const p of set.points){
        // Route links are route-local. Cross-route equivalence is displayed separately
        // by the yellow Sequence Groups layer and must not leak into steering topology.
        const target=byAddress.get(p.linkTarget);if(!target||target.zeroSentinel)continue;
        const a=wpScreen(p),b=wpScreen(target);
        if(a.x<0||a.x>=320||a.y<0||a.y>=224||b.x<0||b.x>=320||b.y<0||b.y>=224)continue;
        ctx.beginPath();ctx.moveTo(a.x*S,a.y*S);ctx.lineTo(b.x*S,b.y*S);ctx.stroke();
      }
    }
    ctx.globalAlpha=1;
  }
  for(const set of state.waypoints){
    if(!enabled.has(set.index))continue;const col=colors[set.index]||'#fff';
    for(const p of set.points){
      const q=wpScreen(p),x=q.x,y=q.y;if(x<0||x>=320||y<0||y>=224)continue;
      const px=x*S,py=y*S,r=Math.max(3,1.45*S);
      ctx.beginPath();ctx.arc(px,py,r,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,.82)';ctx.fill();
      ctx.beginPath();ctx.arc(px,py,Math.max(2,0.9*S),0,Math.PI*2);ctx.fillStyle=col;ctx.fill();
      drawWaypointLabel(waypointLabel(p,set),px,py,col,S);
    }
  }
  const sp=state.selectedWaypoint;
  if(sp&&enabled.has(sp.setIndex)){
    const q=wpScreen(sp);ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(2,0.8*S);ctx.beginPath();ctx.arc(q.x*S,q.y*S,3.4*S,0,Math.PI*2);ctx.stroke();
  }
  ctx.restore();
}
function strokeArrowLine(cx,cy,ex,ey,a,S){
  const lenHead=2.4*S,aa=.62;
  ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(ex,ey);ctx.stroke();
  ctx.beginPath();ctx.moveTo(ex,ey);ctx.lineTo(ex-Math.cos(a-aa)*lenHead,ey-Math.sin(a-aa)*lenHead);ctx.moveTo(ex,ey);ctx.lineTo(ex-Math.cos(a+aa)*lenHead,ey-Math.sin(a+aa)*lenHead);ctx.stroke();
}
function drawHeading(){
  const phase=Number($('headingPhase').value),reverse=$('headingReverse').checked?-1:1,S=editorScale(),density=Math.max(1,Number($('headingDensity')?.value||1));
  const h=state.heading;ctx.save();ctx.globalAlpha=Math.max(.5,Number($('opacity').value)/100);
  for(let gy=0;gy<h.height;gy+=density)for(let gx=0;gx<h.width;gx+=density){
    const v=h.values[gy*h.width+gx],a=reverse*((v+phase)&255)*Math.PI*2/256;
    const cx=(gx*8+4)*S,cy=(gy*8+4)*S,len=5.5*S,ex=cx+Math.cos(a)*len,ey=cy+Math.sin(a)*len;
    ctx.strokeStyle='rgba(0,0,0,.88)';ctx.lineWidth=Math.max(3,1.45*S);strokeArrowLine(cx,cy,ex,ey,a,S);
    ctx.strokeStyle='rgba(255,255,255,.94)';ctx.lineWidth=Math.max(1.4,.62*S);strokeArrowLine(cx,cy,ex,ey,a,S);
  }
  ctx.restore();
}
function nearestWaypointAt(x,y,maxD2=64){
  const enabled=visibleWaypointSetIndices();if(!state.waypoints||!enabled.size)return null;
  let best=null,bd=maxD2+1;
  for(const set of state.waypoints){if(!enabled.has(set.index))continue;for(const p of set.points){
    const q=wpScreen(p),dx=q.x-x,dy=q.y-y,dd=dx*dx+dy*dy;if(dd<bd){bd=dd;best={set:set.index,p,q,d2:dd};}
  }}
  return best;
}
function eventCanvasXY(ev){
  const r=canvas.getBoundingClientRect();
  return {x:Math.max(0,Math.min(319,(ev.clientX-r.left)*320/r.width)),y:Math.max(0,Math.min(255,(ev.clientY-r.top)*256/r.height))};
}
function cursorAt(ev){
  if(!selected)return;const pos=eventCanvasXY(ev),x=Math.floor(pos.x),y=Math.floor(pos.y),bg=state.bg[y*320+x],occ=state.mask1[y*320+x];
  let surf='—',head='—';if(y<224){surf=state.surface.cells[(y>>1)*160+(x>>1)];head=state.heading.values[(y>>3)*40+(x>>3)];}
  let wp='';const best=nearestWaypointAt(pos.x,pos.y,64);
  if(best){const p=best.p;wp=`\nRoute ${'ABC'[best.set]} · waypoint ${p.index} · sequence ${p.progress}`;}
  $('cursorInfo').textContent=`x ${x} · y ${y} · colour ${bg}\nsurface ${surf} · recovery ${head}${wp}`;
}
function inverseDisplayPoint(screenX,screenY,p){
  const t=waypointDisplayTransform();
  if(t.mode==='a082')return T.inverseWaypointA082(screenX,screenY,p.x,p.y);
  if(!t.sx||!t.sy)return null;
  return {x:Math.max(-32768,Math.min(32767,Math.round((screenX-t.ox)/t.sx))),y:Math.max(-128,Math.min(127,Math.round((screenY-t.oy)/t.sy)))};
}
function selectWaypoint(best){
  if(!best)return false;state.selectedWaypoint=best.p;updateWaypointEditor();render();return true;
}
function beginWaypointDrag(ev){
  if(!selected||!$('showWaypoints').checked)return;const pos=eventCanvasXY(ev),best=nearestWaypointAt(pos.x,pos.y,100);if(!best)return;
  selectWaypoint(best);state.drag={pointerId:ev.pointerId,pointAddress:best.p.runtimeAddress,startX:best.p.x,startY:best.p.y,preview:{x:best.p.x,y:best.p.y},moved:false};
  canvas.setPointerCapture?.(ev.pointerId);canvas.classList.add('dragging');ev.preventDefault();
}
function moveWaypointDrag(ev){
  cursorAt(ev);const d=state.drag;if(!d||d.pointerId!==ev.pointerId||!state.selectedWaypoint)return;
  const pos=eventCanvasXY(ev),inv=inverseDisplayPoint(pos.x,pos.y,state.selectedWaypoint);if(!inv)return;
  if(inv.x!==d.preview.x||inv.y!==d.preview.y)d.moved=true;d.preview={x:inv.x,y:inv.y};
  $('editWpX').value=inv.x;$('editWpY').value=inv.y;$('editStatus').textContent=`Drag position: ${inv.x}, ${inv.y}`;render();
}
function endWaypointDrag(ev,cancel=false){
  const d=state.drag;if(!d||d.pointerId!==ev.pointerId)return;const p=state.selectedWaypoint;state.drag=null;canvas.classList.remove('dragging');
  try{canvas.releasePointerCapture?.(ev.pointerId);}catch(_e){}
  if(cancel||!d.moved||!p){updateWaypointEditor();render();return;}
  try{
    T.writeWaypoint(model.main,p,{x:d.preview.x,y:d.preview.y,progress:p.progress,progressFlag:p.progressFlag,linkDelta:p.linkDelta});
    noteEdit(p);const addr=p.runtimeAddress;refreshWaypointModels(addr);updateWaypointValidation();updateWaypointEditor();updateWaypointFitStats();render();
    $('editStatus').textContent=`Moved Route ${'ABC'[p.setIndex]} waypoint ${p.index}.`;
  }catch(e){$('editStatus').textContent='ERROR: '+e.message;refreshWaypointModels(p.runtimeAddress);updateWaypointEditor();render();}
}
function bytesHex(a){return Array.from(a,b=>b.toString(16).padStart(2,'0')).join(' ').toUpperCase();}
function waypointPatchJson(){
  return {
    format:'Indy Heat Amiga waypoint patch',version:'0.11',encoding:'stored byte = runtime byte XOR $FF',
    sourceTrack:state.race?state.race.name:null,
    edits:Array.from(edits.values()).sort((a,b)=>a.runtimeAddress-b.runtimeAddress)
  };
}
function trackJson(){
  const rs=state.resources,surf=state.surface,h=state.heading;
  return {
    format:'Indy Heat Amiga track editor export',version:'0.11',
    source:{resourceTableOffset:model.resourceTableOffset,trackGroup:selected.index+1,baseResource:selected.base},
    resources:rs.map((r,i)=>({role:['background5bpp','bitmap1bpp','surface2bpp','heading8x8'][i],id:r.id,sector:r.entry.sector,sectors:r.entry.sectors,unpackedSize:r.data.length,packedSize:r.block.packedSize,magic:r.block.magic})),
    bitmap:{width:320,height:256,planes:5},
    overlay1bpp:{width:320,height:256,decodeOffset:0,semantics:'foreground/occlusion mask; $2804 variants have four trailing bytes'},
    surface:{logicalWidth:160,logicalHeight:112,scaleX:2,scaleY:2,classes:Array.from(surf.cells),semantics:{0:'ordinary/no special response',1:'collision/edge correction; invokes heading grid',2:'slowdown strong (speed -= speed>>5)',3:'slowdown weak (speed -= speed>>6)'}},
    heading:{width:40,height:28,cellWidth:8,cellHeight:8,values:Array.from(h.values)},
    race:state.race?{eventIndex:state.race.index,name:state.race.name,coordXOriginRaw:state.race.coordXOriginRaw,coordYOriginRaw:state.race.coordYOriginRaw,coordFlipWord:state.race.coordFlipWord}:null,
    waypointEncoding:{storedToRuntime:'each of the six bytes XOR $FF',recordBytes:6,fields:{x:'+0.w signed runtime X',progress:'+2.b low7 ordinal + high flag',y:'+3.b signed runtime Y',link:'+4.w signed relative byte displacement'}},
    waypointDescriptors:state.waypoints?state.waypoints.map(set=>({
      route:'ABC'[set.index],index:set.index,runtimeStart:set.start,runtimeEnd:set.end,count:set.count,descriptorBytes:set.descriptorBytes,
      boundary:set.boundaryPoint?{runtimeAddress:set.boundaryPoint.runtimeAddress,storedBytes:Array.from(set.boundaryPoint.storedBytes),zeroSentinel:set.boundaryPoint.zeroSentinel}:null,
      points:set.points.map(p=>({index:p.index,runtimeAddress:p.runtimeAddress,fileOffset:p.fileOffset,storedBytes:Array.from(p.storedBytes),runtimeBytes:Array.from(p.runtimeBytes),x:p.x,y:p.y,progressByte:p.progressByte,progress:p.progress,progressFlag:p.progressFlag,linkDelta:p.linkDelta,linkRecords:p.linkRecords,linkTarget:p.linkTarget,linkResolved:p.linkResolved,displayX:wpScreen(p).x,displayY:wpScreen(p).y}))
    })):[],
    waypointDisplayTransform:{...waypointDisplayTransform(),status:'A082 mode uses decoded X/Y as 16.16 high-word inputs with middle coordinate zero; manual mode is display-only'},
    edits:Array.from(edits.values())
  };
}

function refreshWaypointModels(selectedAddress=null){
  for(const r of raceRecords)r.waypointDescriptors=T.parseWaypointDescriptors(model.main,r);
  if(state.race){state.waypoints=state.race.waypointDescriptors;state.race.waypointDescriptors=state.waypoints;}
  state.selectedWaypoint=null;
  if(selectedAddress!=null && state.waypoints)for(const set of state.waypoints){const p=set.points.find(q=>q.runtimeAddress===selectedAddress);if(p){state.selectedWaypoint=p;break;}}
}
function waypointValidation(){
  const issues=[];let ordinary=0,resolved=0,boundaryTargets=0,flags=0;
  const sequences=T.summarizeWaypointSequences(state.waypoints||[]);
  if(!state.waypoints)return {issues,ordinary,resolved,boundaryTargets,flags,sequences};
  for(const set of state.waypoints){
    if(set.descriptorBytes!==set.count*6)issues.push(`Route ${'ABC'[set.index]} descriptor span ${set.descriptorBytes} != count×6 (${set.count*6})`);
    for(const p of set.points){ordinary++;if(p.progressFlag)flags++;
      if(!p.linkAligned)issues.push(`Route ${'ABC'[set.index]} #${p.index}: link ${p.linkDelta} is not 6-byte aligned`);
      if(p.linkResolved){resolved++;if(p.linkTargetBoundary)boundaryTargets++;}else issues.push(`Route ${'ABC'[set.index]} #${p.index}: target ${hx(p.linkTarget,4)} is outside parsed route/boundary records`);
    }
  }
  for(const q of sequences){
    if(q.missing.length)issues.push(`Route ${q.route}: missing sequence ${q.missing.join(', ')}`);
  }
  const populated=sequences.filter(q=>q.min!=null);
  if(populated.length>1){
    const ranges=new Set(populated.map(q=>`${q.min}:${q.max}`));
    if(ranges.size>1)issues.push(`A/B/C sequence ranges differ: ${populated.map(q=>`${q.route} ${q.min}–${q.max}`).join(' · ')}`);
  }
  return {issues,ordinary,resolved,boundaryTargets,flags,sequences};
}
function updateSequenceSummary(v=waypointValidation()){
  const el=$('sequenceSummary');if(!el)return;
  if(!v.sequences?.length){el.textContent='Sequence summary unavailable.';return;}
  el.innerHTML=v.sequences.map(q=>{
    const range=q.min==null?'—':`${q.min}–${q.max}`;
    const extra=[];if(q.duplicates.length)extra.push(`${q.duplicates.length} duplicate value${q.duplicates.length===1?'':'s'}`);if(q.missing.length)extra.push(`${q.missing.length} missing`);
    return `<div><b>${q.route}</b> ${range} · ${q.physicalCount} points${extra.length?` · <span class="${q.missing.length?'warn':''}">${extra.join(', ')}</span>`:''}</div>`;
  }).join('');
}
function allCircuitSequenceReport(){
  if(!raceRecords?.length)return [];
  return raceRecords.slice(0,10).map(r=>{
    const seq=T.summarizeWaypointSequences(r.waypointDescriptors||[]);
    const ranges=seq.map(q=>q.min==null?'—':`${q.min}–${q.max}`);
    const sameRange=new Set(ranges).size<=1;
    return {name:r.name||`Event ${r.index}`,ranges,seq,sameRange};
  });
}
function updateWaypointValidation(){
  const v=waypointValidation();updateSequenceSummary(v);
  const sequenceLines=v.sequences.map(q=>`${q.route}: ${q.min==null?'—':`${q.min}–${q.max}`} · ${q.physicalCount} physical · ${q.uniqueCount} unique${q.duplicates.length?` · duplicate: ${q.duplicates.map(d=>`${d.sequence}×${d.count}`).join(', ')}`:''}${q.missing.length?` · MISSING: ${q.missing.join(', ')}`:''}`).join('\n');
  const all=allCircuitSequenceReport();
  const allLines=all.map(c=>`${c.sameRange?'✓':'!'} ${c.name.padEnd(18,' ')} A ${c.ranges[0]||'—'} [${c.seq[0]?.physicalCount??0}] · B ${c.ranges[1]||'—'} [${c.seq[1]?.physicalCount??0}] · C ${c.ranges[2]||'—'} [${c.seq[2]?.physicalCount??0}]`).join('\n');
  $('wpValidation').textContent=`selected circuit sequence ranges:
${sequenceLines||'—'}

all circuits (range [physical points]):
${allLines||'—'}

ordinary records: ${v.ordinary}
resolved links:   ${v.resolved}/${v.ordinary}
boundary targets: ${v.boundaryTargets}
high-bit flags:   ${v.flags}
issues:           ${v.issues.length}${v.issues.length?'\n\n'+v.issues.slice(0,12).join('\n')+(v.issues.length>12?`\n… ${v.issues.length-12} more`:''):''}`;
}
function updateEditExportButtons(){
  const dirty=edits.size>0;$('savePatch').disabled=!dirty;$('saveMain').disabled=!dirty;$('revertAll').disabled=!dirty;
  $('editCount').textContent=`${edits.size} modified waypoint${edits.size===1?'':'s'}`;
}
function populateWaypointSelectList(){
  const sel=$('wpSelectList');sel.innerHTML='';
  const none=document.createElement('option');none.value='';none.textContent='— choose waypoint —';sel.appendChild(none);
  const enabled=visibleWaypointSetIndices();
  if(!state.waypoints||!enabled.size){sel.disabled=true;return;}
  for(const set of state.waypoints){
    if(!enabled.has(set.index))continue;
    const group=document.createElement('optgroup');group.label=`Route ${'ABC'[set.index]}`;
    for(const p of set.points){const o=document.createElement('option');o.value=p.runtimeAddress;o.textContent=`${'ABC'[set.index]} ${String(p.index).padStart(2,'0')} · sequence ${p.progress}`;group.appendChild(o);}
    sel.appendChild(group);
  }
  sel.disabled=false;if(state.selectedWaypoint&&enabled.has(state.selectedWaypoint.setIndex))sel.value=String(state.selectedWaypoint.runtimeAddress);
}
function updateWaypointEditor(){
  const enabled=visibleWaypointSetIndices();
  let p=state.selectedWaypoint;
  if(p&&!enabled.has(p.setIndex)){state.selectedWaypoint=null;p=null;}
  const controls=['editWpX','editWpY','editWpProgress','editWpFlag','editWpDelta','editWpTarget','applyWaypoint','revertWaypoint'];
  controls.forEach(id=>{$(id).disabled=!p;});populateWaypointSelectList();
  if(!p){$('wpSelectedInfo').textContent=enabled.size?'Select or drag a visible waypoint.':'Turn on Waypoints and a route to edit.';$('editWpTarget').innerHTML='<option>—</option>';return;}
  $('wpSelectList').value=String(p.runtimeAddress);
  $('wpSelectedInfo').textContent=`Route ${'ABC'[p.setIndex]} · waypoint ${p.index} · sequence ${p.progress}`;
  $('editWpX').value=p.x;$('editWpY').value=p.y;$('editWpProgress').value=p.progress;$('editWpFlag').checked=p.progressFlag;$('editWpDelta').value=p.linkDelta;
  const sel=$('editWpTarget');sel.innerHTML='';
  const keep=document.createElement('option');keep.value='';keep.textContent=`Current · ${p.linkDelta} → ${hx(p.linkTarget,4)}${p.linkResolved?'':' (unresolved)'}`;sel.appendChild(keep);
  for(const set of state.waypoints)for(const q of set.points){const o=document.createElement('option');o.value=q.runtimeAddress;o.textContent=`${'ABC'[set.index]} ${q.index} · ${hx(q.runtimeAddress,4)}${q.runtimeAddress===p.linkTarget?' ← current':''}`;sel.appendChild(o);}
  if(p.linkResolved&&!p.linkTargetBoundary)sel.value=String(p.linkTarget);
}
function noteEdit(point){
  const off=point.fileOffset,orig=Array.from(originalMain.slice(off,off+6)),cur=Array.from(model.main.slice(off,off+6));
  const key=point.runtimeAddress;
  if(orig.every((v,i)=>v===cur[i]))edits.delete(key);
  else{
    const a=T.decodeStoredWaypointBytes(Uint8Array.from(orig)),b=T.decodeStoredWaypointBytes(Uint8Array.from(cur));
    edits.set(key,{runtimeAddress:key,fileOffset:off,originalStored:orig,currentStored:cur,
      originalRuntime:{x:a.x,y:a.y,progress:a.progress,progressFlag:a.progressFlag,linkDelta:a.linkDelta},
      currentRuntime:{x:b.x,y:b.y,progress:b.progress,progressFlag:b.progressFlag,linkDelta:b.linkDelta}});
  }
  updateEditExportButtons();
}
function applyWaypointEdit(){
  const p=state.selectedWaypoint;if(!p)return;
  try{
    let linkDelta=Number($('editWpDelta').value);const target=$('editWpTarget').value;
    if(target!=='')linkDelta=Number(target)-p.runtimeAddress;
    T.writeWaypoint(model.main,p,{x:Number($('editWpX').value),y:Number($('editWpY').value),progress:Number($('editWpProgress').value),progressFlag:$('editWpFlag').checked,linkDelta});
    noteEdit(p);const addr=p.runtimeAddress;refreshWaypointModels(addr);updateWaypointValidation();updateWaypointEditor();updateWaypointFitStats();render();
    $('editStatus').textContent=`Updated ${hx(addr,4)}.`;
  }catch(e){$('editStatus').textContent='ERROR: '+e.message;}
}
function revertSelectedWaypoint(){
  const p=state.selectedWaypoint;if(!p||!originalMain)return;model.main.set(originalMain.slice(p.fileOffset,p.fileOffset+6),p.fileOffset);noteEdit(p);const addr=p.runtimeAddress;refreshWaypointModels(addr);updateWaypointValidation();updateWaypointEditor();render();$('editStatus').textContent=`Reverted ${hx(addr,4)}.`;
}
function revertAllWaypoints(){
  if(!originalMain||!model)return;for(const e of edits.values())model.main.set(originalMain.slice(e.fileOffset,e.fileOffset+6),e.fileOffset);edits.clear();const addr=state.selectedWaypoint?.runtimeAddress??null;refreshWaypointModels(addr);updateWaypointValidation();updateWaypointEditor();updateEditExportButtons();render();$('editStatus').textContent='All waypoint edits reverted.';
}
function renderRaceRecords(){
  const recs=raceRecords;
  let html='<table><thead><tr><th>#</th><th>main off</th><th>name candidate</th><th>+28</th><th>+2A</th><th>track base</th><th>X/Y origin</th><th>AI X-negate +$6A</th><th>three path descriptors (runtime start → end / stored count)</th></tr></thead><tbody>';
  for(const r of recs){
    const ds=r.descriptors.map(d=>`${hx(d.start,4)}→${hx(d.end,4)} / ${d.count}`).join('<br>');
    html+=`<tr><td>${r.index}</td><td>${hx(r.offset,4)}</td><td>${esc(r.name||'—')}</td><td>${r.field28}</td><td>${r.field2A}</td><td>${r.baseResourceId==null?'—':hx(r.baseResourceId,2)}</td><td>${r.coordXOriginHi} / ${r.coordYOriginHi}</td><td>${r.coordFlipWord<0?'YES':'no'} (${hx(r.coordFlipWord&0xffff,4)})</td><td class="mono">${ds}</td></tr>`;
  }
  html+='</tbody></table><p class="mini muted">Race-record order differs from circuit-resource order; the table above shows the descriptor-derived resource base. The boot loader copies the decrunched main image to runtime $1000, so a waypoint runtime pointer maps to this file image at pointer − $1000. The nearest-point routine scans six-byte records. Stored end−start equals count×6, while its DBF loop appears to inspect count+1 records; this boundary behaviour is still under trace.</p>';
  $('raceRecords').innerHTML=html;
}

$('fileInput').addEventListener('change',e=>{if(e.target.files[0]){manualDiskRequested=true;loadFile(e.target.files[0]);}});
const dz=$('dropZone');
['dragenter','dragover'].forEach(n=>dz.addEventListener(n,e=>{e.preventDefault();dz.classList.add('drag')}));
['dragleave','drop'].forEach(n=>dz.addEventListener(n,e=>{e.preventDefault();dz.classList.remove('drag')}));
dz.addEventListener('drop',e=>{if(e.dataTransfer.files[0]){manualDiskRequested=true;loadFile(e.dataTransfer.files[0]);}});
$('trackSelect').addEventListener('change',e=>selectTrack(Number(e.target.value)));
['showBg','showMask1','showSurface','showWaypointLinks','showSequenceGroups','showHeading','headingReverse'].forEach(id=>$(id).addEventListener('change',render));
$('paletteMode').addEventListener('change',render);
$('wpLabelMode').addEventListener('change',render);
$('headingDensity').addEventListener('change',render);
$('editorScale').addEventListener('change',()=>{resizeEditorCanvas();render();});
document.querySelectorAll('.surfaceClass').forEach(c=>c.addEventListener('change',render));
function waypointVisibilityChanged(){
  const enabled=visibleWaypointSetIndices();
  if(state.selectedWaypoint&&!enabled.has(state.selectedWaypoint.setIndex))state.selectedWaypoint=null;
  if(!$('showWaypoints').checked)state.drag=null;
  updateWaypointEditor();render();
}
$('showWaypoints').addEventListener('change',waypointVisibilityChanged);
document.querySelectorAll('.waypointSet').forEach(c=>c.addEventListener('change',waypointVisibilityChanged));
$('headingPhase').addEventListener('input',e=>{$('phaseText').textContent=e.target.value;render()});
$('opacity').addEventListener('input',e=>{$('opacityText').textContent=e.target.value+'%';render()});
$('backgroundOpacity').addEventListener('input',e=>{$('backgroundOpacityText').textContent=e.target.value+'%';render()});

function syncProjectionControls(){
  $('manualProjectionControls').classList.toggle('hidden',$('wpProjectionMode').value!=='manual');
}
['wpScaleX','wpOffsetX','wpScaleY','wpOffsetY'].forEach(id=>$(id).addEventListener('input',()=>{if($('wpProjectionMode').value!=='manual')$('wpProjectionMode').value='manual';syncProjectionControls();updateWaypointFitStats();render();}));
$('wpProjectionMode').addEventListener('change',()=>{syncProjectionControls();updateWaypointFitStats();render();});
$('wpReset').addEventListener('click',()=>{$('wpProjectionMode').value='a082';$('wpScaleX').value=2;$('wpOffsetX').value=338;$('wpScaleY').value=-1.5;$('wpOffsetY').value=142.5;syncProjectionControls();updateWaypointFitStats();render();});
$('wpAutoFit').addEventListener('click',()=>{autoFitWaypointsToRoad();syncProjectionControls();updateWaypointFitStats();render();});

canvas.addEventListener('pointerdown',beginWaypointDrag);
canvas.addEventListener('pointermove',moveWaypointDrag);
canvas.addEventListener('pointerup',e=>endWaypointDrag(e,false));
canvas.addEventListener('pointercancel',e=>endWaypointDrag(e,true));
canvas.addEventListener('pointerleave',e=>{if(!state.drag)cursorAt(e);});
$('wpSelectList').addEventListener('change',e=>{const addr=Number(e.target.value);if(!addr)return;const enabled=visibleWaypointSetIndices();for(const set of state.waypoints||[]){if(!enabled.has(set.index))continue;const p=set.points.find(q=>q.runtimeAddress===addr);if(p){state.selectedWaypoint=p;updateWaypointEditor();render();return;}}});
$('editWpTarget').addEventListener('change',()=>{const p=state.selectedWaypoint;if(p&&$('editWpTarget').value!=='')$('editWpDelta').value=Number($('editWpTarget').value)-p.runtimeAddress;});
$('applyWaypoint').addEventListener('click',applyWaypointEdit);
$('revertWaypoint').addEventListener('click',revertSelectedWaypoint);
$('revertAll').addEventListener('click',revertAllWaypoints);
$('savePng').addEventListener('click',()=>canvas.toBlob(b=>downloadBlob(b,`indyheat_group_${selected.index+1}_view.png`),'image/png'));
$('saveJson').addEventListener('click',()=>downloadBlob(new Blob([JSON.stringify(trackJson(),null,2)],{type:'application/json'}),`indyheat_group_${selected.index+1}_v011.json`));
$('savePatch').addEventListener('click',()=>downloadBlob(new Blob([JSON.stringify(waypointPatchJson(),null,2)],{type:'application/json'}),'indyheat_waypoint_patch_v011.json'));
$('saveMain').addEventListener('click',()=>downloadBytes(model.main,'indyheat_main_modified_v011.bin'));
document.querySelectorAll('[data-dl]').forEach(b=>b.addEventListener('click',()=>{const i=Number(b.dataset.dl),r=state.resources[i];downloadBytes(r.data,`indyheat_${hx(r.id,2).slice(1)}_${['background','bitmap1','surface2bpp','heading'][i]}.bin`)}));

async function preloadOnlineDisk(){
  const startManualState=manualDiskRequested;
  status('Loading repository Disk.1…');
  try{
    const response=await fetch(ONLINE_DISK_URL,{cache:'no-cache'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const blob=await response.blob();
    if(manualDiskRequested!==startManualState||manualDiskRequested)return;
    const file=new File([blob],'Disk.1',{type:'application/octet-stream'});
    await loadFile(file);
    log(`Auto-loaded: ${ONLINE_DISK_URL}`);
  }catch(e){
    console.warn('Automatic Disk.1 load failed',e);
    if(!model&&!manualDiskRequested)status('Online Disk.1 could not be loaded. Open or drop a local Disk.1 / ADF.');
  }
}

syncProjectionControls();resizeEditorCanvas();ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
preloadOnlineDisk();
