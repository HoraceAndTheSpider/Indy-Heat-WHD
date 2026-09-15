'use strict';

/*
 Indy Heat car-graphics research probe
 -------------------------------------
 Run from the repository root:

   node app/research_car_probe.js whdload/data/Disk.1

 or from app/:

   node research_car_probe.js ../whdload/data/Disk.1

 It does NOT modify Disk.1 or the repository.

 Purpose:
 - use the authoritative checked-in IndyHeatTools parser/decompressor;
 - inventory all 108 resource-directory entries;
 - try the established race-object BOB decoder against every loadable resource;
 - scan inside resources for contiguous embedded BOB runs rather than requiring
   a bank to begin at byte zero;
 - give resource $01 a deliberately deep scan;
 - scan the decrunched main image for references to each resource's live
   pointer-field address;
 - find BSR/JSR callers of the previously identified $3748/$3834/$397C
   car/foreground draw area under both possible main/runtime address
   interpretations;
 - produce review PNGs only from resource bytes. No reference image/IFF is used.

 This is a research probe, not a claim that a visual candidate is a racing car.
 A car identification still requires the image/data result to agree with the
 runtime consumer/draw path.
*/

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const T = require('./indyheat.js');
const G = require('./indyheat_race_graphics.js');

function hex(v,n=4){ return '$'+(Number(v)>>>0).toString(16).toUpperCase().padStart(n,'0'); }
function s8(v){ return v & 0x80 ? v-0x100 : v; }
function s16(v){ return v & 0x8000 ? v-0x10000 : v; }
function be16(b,o){ return ((b[o]<<8)|b[o+1])>>>0; }
function be32(b,o){ return (((be16(b,o)<<16)>>>0)|be16(b,o+2))>>>0; }

function mkdir(p){ fs.mkdirSync(p,{recursive:true}); }
function writeJson(p,obj){ fs.writeFileSync(p,JSON.stringify(obj,null,2)); }

function crc32(buf){
  let c=0xffffffff;
  for(let i=0;i<buf.length;i++){
    c^=buf[i];
    for(let k=0;k<8;k++) c=(c>>>1)^((c&1)?0xedb88320:0);
  }
  return (c^0xffffffff)>>>0;
}
function pngChunk(type,data){
  const t=Buffer.from(type,'ascii');
  const out=Buffer.alloc(12+data.length);
  out.writeUInt32BE(data.length,0);
  t.copy(out,4); data.copy(out,8);
  const crcInput=Buffer.concat([t,data]);
  out.writeUInt32BE(crc32(crcInput),8+data.length);
  return out;
}
function writePng(file,width,height,rgba){
  const sig=Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(width,0); ihdr.writeUInt32BE(height,4);
  ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  const row=width*4+1;
  const raw=Buffer.alloc(row*height);
  for(let y=0;y<height;y++){
    const ro=y*row; raw[ro]=0;
    Buffer.from(rgba.buffer,rgba.byteOffset+y*width*4,width*4).copy(raw,ro+1);
  }
  const out=Buffer.concat([
    sig,
    pngChunk('IHDR',ihdr),
    pngChunk('IDAT',zlib.deflateSync(raw,{level:9})),
    pngChunk('IEND',Buffer.alloc(0))
  ]);
  fs.writeFileSync(file,out);
}

function validHeader(data,offset,opts={}){
  if(offset<0 || offset+12>data.length) return null;
  const width=be16(data,offset);
  const height=be16(data,offset+2);
  const rawX=be16(data,offset+4);
  const rawY=be16(data,offset+6);
  const transparent=be16(data,offset+8);
  const planes=be16(data,offset+10);
  const xOrigin=s16(rawX), yOrigin=s16(rawY);

  const maxDim=opts.maxDim || 96;
  if(width<2 || width>maxDim || height<2 || height>maxDim) return null;
  if(planes<1 || planes>5) return null;
  if(transparent >= (1<<planes)) return null;
  if(Math.abs(xOrigin)>128 || Math.abs(yOrigin)>128) return null;

  const rowBytes=Math.ceil(width/16)*2;
  const planeBytes=rowBytes*height;
  const byteLength=12+planeBytes*planes;
  if(offset+byteLength>data.length) return null;

  return {offset,width,height,xOrigin,yOrigin,transparentSourceIndex:transparent,
          planes,rowBytes,planeBytes,byteLength,end:offset+byteLength};
}

function findBobChains(data,resourceId){
  const headers=new Map();
  // BOB records are word-oriented. Odd starts are not useful here and create
  // a great deal of random-data noise.
  for(let off=0;off+12<=data.length;off+=2){
    const h=validHeader(data,off);
    if(h) headers.set(off,h);
  }

  const chains=[];
  const consumedStarts=new Set();
  for(const [off,h0] of headers){
    // Do not start in the middle of an already valid exact chain.
    let isContinuation=false;
    for(const h of headers.values()){
      if(h.end===off){ isContinuation=true; break; }
    }
    if(isContinuation) continue;

    const frames=[];
    let p=off;
    while(headers.has(p) && frames.length<2048){
      const h=headers.get(p);
      frames.push(h);
      p=h.end;
    }
    if(frames.length>=2){
      const planes=new Set(frames.map(f=>f.planes));
      const widths=frames.map(f=>f.width), heights=frames.map(f=>f.height);
      const fourPlane=frames.filter(f=>f.planes===4).length;
      const fivePlane=frames.filter(f=>f.planes===5).length;
      const carSize=frames.filter(f=>f.width>=8 && f.width<=48 && f.height>=8 && f.height<=48).length;
      const commonDims={};
      for(const f of frames){
        const k=`${f.width}x${f.height}x${f.planes}`;
        commonDims[k]=(commonDims[k]||0)+1;
      }
      const bestDim=Object.entries(commonDims).sort((a,b)=>b[1]-a[1])[0] || ['',0];
      let score=frames.length*10 + fourPlane*8 + carSize*5 + bestDim[1]*4;
      if(resourceId===0x01) score+=40;
      if(frames.length>=16) score+=50;
      chains.push({
        resourceId,start:off,end:p,byteLength:p-off,frameCount:frames.length,
        fourPlane,fivePlane,carSizeFrames:carSize,
        dominantDimensions:bestDim[0],dominantCount:bestDim[1],
        planeSet:Array.from(planes).sort(),
        score,frames
      });
    }
  }

  // Also retain isolated headers for $01 so we can tell whether a table or
  // separators break otherwise sensible graphics.
  const isolated=[];
  if(resourceId===0x01){
    for(const h of headers.values()){
      if(h.planes===4 && h.width>=8 && h.width<=48 && h.height>=8 && h.height<=48)
        isolated.push(h);
    }
  }
  chains.sort((a,b)=>b.score-a.score);
  return {headerCount:headers.size,chains,isolated};
}

function renderFrame(data,h,paletteRgb){
  const frame=G.decodeFrame(data,h.offset,0);
  return G.frameToRgba(frame,paletteRgb);
}

function makeContactSheet(data,chain,paletteRgb,outFile){
  const frameHeaders=chain.frames.filter(f=>f.planes===4 || f.planes===5);
  if(!frameHeaders.length) return false;

  const maxW=Math.max(...frameHeaders.map(f=>f.width));
  const maxH=Math.max(...frameHeaders.map(f=>f.height));
  const scale=(maxW<=32 && maxH<=32)?3:2;
  const pad=4;
  const cols=Math.min(16,Math.max(1,Math.ceil(Math.sqrt(frameHeaders.length))));
  const rows=Math.ceil(frameHeaders.length/cols);
  const cellW=maxW*scale+pad*2, cellH=maxH*scale+pad*2;
  const width=cols*cellW, height=rows*cellH;
  const rgba=new Uint8ClampedArray(width*height*4); // transparent background

  for(let fi=0;fi<frameHeaders.length;fi++){
    const h=frameHeaders[fi];
    let img;
    try{ img=renderFrame(data,h,paletteRgb); }
    catch(_){ continue; }
    const cx=fi%cols, cy=Math.floor(fi/cols);
    const ox=cx*cellW+pad+Math.floor((maxW-h.width)*scale/2);
    const oy=cy*cellH+pad+Math.floor((maxH-h.height)*scale/2);
    for(let y=0;y<h.height;y++) for(let x=0;x<h.width;x++){
      const so=(y*h.width+x)*4;
      if(!img.rgba[so+3]) continue;
      for(let sy=0;sy<scale;sy++) for(let sx=0;sx<scale;sx++){
        const dx=ox+x*scale+sx, dy=oy+y*scale+sy;
        const d=(dy*width+dx)*4;
        rgba[d]=img.rgba[so]; rgba[d+1]=img.rgba[so+1];
        rgba[d+2]=img.rgba[so+2]; rgba[d+3]=255;
      }
    }
  }
  writePng(outFile,width,height,rgba);
  return true;
}

function classifyWholeBank(data,id){
  try{
    const bank=G.decodeBank(data,{resourceId:id,strict:true});
    return {
      valid:true,frameCount:bank.frameCount,
      dimensions:Array.from(new Set(bank.frames.map(f=>`${f.width}x${f.height}x${f.planes}`))).slice(0,20)
    };
  }catch(e){
    return {valid:false,error:String(e.message||e)};
  }
}

function bytesHex(b,start,end){
  const s=[];
  for(let i=Math.max(0,start);i<Math.min(b.length,end);i++)
    s.push(b[i].toString(16).padStart(2,'0'));
  return s.join(' ').toUpperCase();
}

function decodeLikelyAbsoluteRefOpcode(op){
  // This is deliberately narrow: it only labels common 68000 forms whose
  // source effective address is absolute .W/.L. Unknown forms remain raw.
  const low=op&0x3f;
  const ea = low===0x38?'abs.w':low===0x39?'abs.l':null;
  if(!ea) return null;
  if((op&0xf1c0)===0x2040) return `MOVEA.L ${ea},A${(op>>9)&7}`;
  if((op&0xf1c0)===0x3040) return `MOVEA.W ${ea},A${(op>>9)&7}`;
  if((op&0xf000)===0x2000) return `MOVE.L ${ea},D${(op>>9)&7}`;
  if((op&0xf000)===0x3000) return `MOVE.W ${ea},D${(op>>9)&7}`;
  if((op&0xf1c0)===0x41c0) return `LEA ${ea},A${(op>>9)&7}`;
  if(op===0x4878 || op===0x4879) return `PEA ${ea}`;
  return null;
}

function scanAddressReferences(main,address){
  const refs=[];
  const w=address&0xffff;
  const wb=[w>>8,w&255];
  const lb=[(address>>>24)&255,(address>>>16)&255,(address>>>8)&255,address&255];

  for(let i=0;i+2<=main.length;i+=2){
    if(main[i]===wb[0] && main[i+1]===wb[1]){
      let kind='word-literal', op=null;
      if(i>=2){
        const opcode=be16(main,i-2);
        const label=decodeLikelyAbsoluteRefOpcode(opcode);
        if(label && label.includes('abs.w')){ kind='absolute-word-operand'; op=label; }
      }
      refs.push({mainOffset:i,runtimeAddress:0x1000+i,kind,opcode:op,
                 context:bytesHex(main,i-10,i+12)});
    }
    if(i+4<=main.length && main[i]===lb[0] && main[i+1]===lb[1] &&
       main[i+2]===lb[2] && main[i+3]===lb[3]){
      let kind='long-literal',op=null;
      if(i>=2){
        const opcode=be16(main,i-2);
        const label=decodeLikelyAbsoluteRefOpcode(opcode);
        if(label && label.includes('abs.l')){kind='absolute-long-operand';op=label;}
        if(opcode===0x4eb9){kind='JSR-absolute-long';op='JSR abs.l';}
        if(opcode===0x4ef9){kind='JMP-absolute-long';op='JMP abs.l';}
      }
      refs.push({mainOffset:i,runtimeAddress:0x1000+i,kind,opcode:op,
                 context:bytesHex(main,i-10,i+14)});
    }
  }
  // De-duplicate word hits that are simply the low word of a long hit.
  return refs.filter((r,idx,a)=>!a.some(q=>q!==r &&
    q.mainOffset===r.mainOffset-2 && q.kind.includes('long')));
}

function scanCallers(main,targetRuntime){
  const callers=[];
  const base=0x1000;
  for(let off=0;off+2<=main.length;off+=2){
    const op=be16(main,off);
    const rt=base+off;
    if((op&0xff00)===0x6100){ // BSR
      const d8=op&0xff;
      let target,bytes;
      if(d8===0 && off+4<=main.length){
        const d=s16(be16(main,off+2));
        target=rt+2+d; bytes=4;
      }else{
        target=rt+2+s8(d8); bytes=2;
      }
      if((target&0xffffff)===targetRuntime){
        callers.push({type:'BSR',mainOffset:off,runtimeAddress:rt,target,bytes,
                      context:bytesHex(main,off-12,off+18)});
      }
    }else if(op===0x4eb8 && off+4<=main.length){ // JSR abs.w
      const target=s16(be16(main,off+2))&0xffffffff;
      if((target&0xffff)===targetRuntime){
        callers.push({type:'JSR abs.w',mainOffset:off,runtimeAddress:rt,target,
                      context:bytesHex(main,off-12,off+18)});
      }
    }else if(op===0x4eb9 && off+6<=main.length){
      const target=be32(main,off+2);
      if(target===targetRuntime){
        callers.push({type:'JSR abs.l',mainOffset:off,runtimeAddress:rt,target,
                      context:bytesHex(main,off-12,off+20)});
      }
    }
  }
  return callers;
}

function scanOffsetPointerTables(data,minCount=8){
  const tables=[];
  for(let off=0;off+minCount*4<=data.length;off+=2){
    const vals=[];
    let p=off,last=-1;
    while(p+4<=data.length && vals.length<512){
      const v=be32(data,p);
      if(v>=data.length || v<=last || (v&1)) break;
      vals.push(v); last=v; p+=4;
    }
    if(vals.length>=minCount){
      tables.push({offset:off,count:vals.length,first:vals[0],last:vals[vals.length-1],
                   sample:vals.slice(0,16)});
      off += vals.length*4-2;
    }
  }
  return tables;
}

function resourcePointerFieldAddress(model,id){
  return 0x1000 + model.resourceTableOffset + id*22 + 14;
}
function resourceEntryAddress(model,id){
  return 0x1000 + model.resourceTableOffset + id*22;
}


function extractResourceBytes(model,id){
  const entry=model.resources[id];
  if(!entry || entry.id!==id) throw new Error(`Resource ${hex(id,2)} missing from directory`);

  try{
    const resource=model.getResource(id);
    return {
      id,entry,data:resource.data,kind:'imploder',
      diskOffset:entry.sector*512,
      physicalBytes:entry.sectors*512,
      block:resource.block
    };
  }catch(error){
    // Some resource-directory entries are resident/raw rather than File Imploder
    // blocks.  For research purposes preserve only the bytes explicitly covered
    // by the directory's disk extent.  Prefer an in-range readSize/outLen where
    // one is present, otherwise retain the full sector allocation.
    const diskOffset=entry.sector*512;
    const physicalBytes=entry.sectors*512;
    if(diskOffset<0 || diskOffset>=model.disk.length || physicalBytes<=0)
      throw error;
    const available=Math.min(physicalBytes,model.disk.length-diskOffset);
    const candidates=[entry.readSize,entry.outLen]
      .map(Number)
      .filter(v=>Number.isInteger(v) && v>0 && v<=available);
    const length=candidates.length?candidates[0]:available;
    return {
      id,entry,
      data:model.disk.slice(diskOffset,diskOffset+length),
      kind:'raw-directory-slice',
      diskOffset,physicalBytes:available,
      decoderError:String(error && error.message || error)
    };
  }
}

function knownNonCar(id){
  if(id===0x00) return true;
  if(id>=0x05 && id<=0x17) return true;
  for(const base of T.TRACK_BASE_IDS){
    if(id>=base && id<=base+3) return true;
  }
  return false;
}

function main(){
  const diskPath=process.argv[2] || path.join('whdload','data','Disk.1');
  if(!fs.existsSync(diskPath)){
    console.error('Disk.1 not found.');
    console.error('Usage: node app/research_car_probe.js whdload/data/Disk.1');
    process.exit(2);
  }

  const outDir=path.resolve(process.argv[3] || 'indyheat_car_probe_output');
  mkdir(outDir);
  const candidateDir=path.join(outDir,'candidate_sheets');
  mkdir(candidateDir);

  const disk=new Uint8Array(fs.readFileSync(diskPath));
  if(disk.length!==901120) throw new Error(`Unexpected disk size ${disk.length}; expected 901120`);

  console.log('Parsing Disk.1 with current IndyHeatTools...');
  const model=T.makeDiskModel(disk);
  const palette=G.paletteFromMain(model.main);
  const report={
    generatedAt:new Date().toISOString(),
    disk:{path:diskPath,size:disk.length,imploderBlocks:model.blocks.length,
          mainLength:model.main.length,resourceTableOffset:model.resourceTableOffset,
          resourceCount:model.resources.length},
    palette:{mainOffset:palette.offset,words:palette.words},
    resources:[],
    shortlist:[],
    resource01:null,
    drawPathCallers:{},
    notes:[
      'Candidate sheets contain only decoded game-resource pixels on transparent padding.',
      'Visual candidate status is not proof of car identity.',
      'Final car identification requires agreement with the runtime consumer/draw path.'
    ]
  };

  const allChains=[];
  for(let id=0;id<model.resources.length;id++){
    const entry=model.resources[id];
    const rec={
      id,hexId:hex(id,2),entry:{
        sector:entry.sector,sectors:entry.sectors,outLen:entry.outLen,
        readSize:entry.readSize,runtimePtr:entry.runtimePtr,allocSize:entry.allocSize
      },
      pointerFieldRuntime:resourcePointerFieldAddress(model,id),
      entryRuntime:resourceEntryAddress(model,id)
    };
    try{
      const resource=extractResourceBytes(model,id);
      rec.loaded=true;
      rec.storageKind=resource.kind;
      rec.diskOffset=resource.diskOffset;
      rec.physicalBytes=resource.physicalBytes;
      if(resource.decoderError) rec.decoderError=resource.decoderError;
      rec.actualLength=resource.data.length;
      rec.wholeBank=classifyWholeBank(resource.data,id);
      const scan=findBobChains(resource.data,id);
      rec.headerCount=scan.headerCount;
      rec.chains=scan.chains.map(c=>({
        start:c.start,end:c.end,byteLength:c.byteLength,frameCount:c.frameCount,
        fourPlane:c.fourPlane,fivePlane:c.fivePlane,carSizeFrames:c.carSizeFrames,
        dominantDimensions:c.dominantDimensions,dominantCount:c.dominantCount,
        planeSet:c.planeSet,score:c.score
      }));
      if(id===0x01){
        rec.offsetPointerTables=scanOffsetPointerTables(resource.data,8);
        rec.isolatedCarLikeHeaders=scan.isolated.slice(0,500);
        report.resource01={
          entry:rec.entry,actualLength:rec.actualLength,
          wholeBank:rec.wholeBank,headerCount:scan.headerCount,
          chains:rec.chains,offsetPointerTables:rec.offsetPointerTables,
          isolatedCarLikeHeaderCount:scan.isolated.length
        };
      }
      for(const c of scan.chains){
        c.resourceData=resource.data;
        c.knownNonCar=knownNonCar(id);
        allChains.push(c);
      }
    }catch(e){
      rec.loaded=false;
      rec.error=String(e.message||e);
    }
    report.resources.push(rec);
  }


  // Focused common-resource inventory.  Resource $38 is the last compressed
  // resource before the established first circuit background $39 in this build;
  // $24-$33 are retained because the directory contains non-Imploder entries in
  // this region and we do not want the generic decompressor to hide them.
  report.focusResources={};
  const rawDir=path.join(outDir,'raw_focus_resources');
  mkdir(rawDir);
  for(const id of [...Array(0x10)].map((_,i)=>0x24+i).concat([0x34,0x35,0x36,0x37,0x38,0x39])){
    const rec=report.resources[id];
    if(!rec) continue;
    report.focusResources[hex(id,2)]=rec;
    try{
      const x=extractResourceBytes(model,id);
      fs.writeFileSync(path.join(rawDir,`R${id.toString(16).toUpperCase().padStart(2,'0')}_${x.kind}.bin`),
                       Buffer.from(x.data));
    }catch(_){}
  }

  // Resource $38 receives an unconditional detailed decode/render attempt.
  report.resource38=null;
  try{
    const r38=extractResourceBytes(model,0x38);
    const scan38=findBobChains(r38.data,0x38);
    report.resource38={
      storageKind:r38.kind,entry:r38.entry,actualLength:r38.data.length,
      wholeBank:classifyWholeBank(r38.data,0x38),
      headerCount:scan38.headerCount,
      chains:scan38.chains.map(c=>({
        start:c.start,end:c.end,byteLength:c.byteLength,frameCount:c.frameCount,
        fourPlane:c.fourPlane,fivePlane:c.fivePlane,carSizeFrames:c.carSizeFrames,
        dominantDimensions:c.dominantDimensions,dominantCount:c.dominantCount,
        planeSet:c.planeSet,score:c.score
      }))
    };
    for(const c of scan38.chains.slice(0,20)){
      if(c.fourPlane+c.fivePlane===0) continue;
      const fn=`R38_FOCUS_O${c.start.toString(16).toUpperCase().padStart(6,'0')}_N${String(c.frameCount).padStart(3,'0')}.png`;
      makeContactSheet(r38.data,c,palette.rgb,path.join(candidateDir,fn));
    }
  }catch(e){
    report.resource38={error:String(e && e.message || e)};
  }

  // Static-code references to early resource pointer fields. $01 is the main
  // target; known banks are included as comparison controls.
  report.mainResourceReferences={};
  for(const id of [0x00,0x01,0x02,0x03,0x04,0x05,0x06,0x07,0x08,0x0A,0x0D,0x0F,0x34,0x35,0x36,0x37,0x38]){
    const ptr=resourcePointerFieldAddress(model,id);
    const ent=resourceEntryAddress(model,id);
    report.mainResourceReferences[hex(id,2)]={
      pointerFieldRuntime:ptr,
      pointerFieldReferences:scanAddressReferences(model.main,ptr),
      entryRuntime:ent,
      entryReferences:scanAddressReferences(model.main,ent)
    };
  }

  // Old work described the car/foreground routines ambiguously around these
  // values. Search both literal runtime values and +$1000 variants so the probe
  // does not silently encode the old ambiguity as a fact.
  for(const t of [0x3748,0x3834,0x397c,0x4748,0x4834,0x497c]){
    report.drawPathCallers[hex(t,4)]=scanCallers(model.main,t);
  }

  // Prefer unresolved/non-track resources for review, but keep a few known
  // banks as controls if their score is exceptionally high.
  const ranked=allChains.slice().sort((a,b)=>{
    const ap=a.score-(a.knownNonCar?120:0)+(a.resourceId===0x38?500:0);
    const bp=b.score-(b.knownNonCar?120:0)+(b.resourceId===0x38?500:0);
    return bp-ap;
  });

  let imageCount=0;
  for(const c of ranked){
    if(imageCount>=40) break;
    if(c.frameCount<3) continue;
    if(c.fourPlane+c.fivePlane<Math.max(3,Math.floor(c.frameCount*0.75))) continue;
    const adjusted=c.score-(c.knownNonCar?120:0);
    if(adjusted<45) continue;
    const idhex=c.resourceId.toString(16).toUpperCase().padStart(2,'0');
    const fn=`R${idhex}_O${c.start.toString(16).toUpperCase().padStart(6,'0')}_N${String(c.frameCount).padStart(3,'0')}.png`;
    const file=path.join(candidateDir,fn);
    if(makeContactSheet(c.resourceData,c,palette.rgb,file)){
      report.shortlist.push({
        resourceId:c.resourceId,hexId:hex(c.resourceId,2),start:c.start,
        frameCount:c.frameCount,dominantDimensions:c.dominantDimensions,
        score:c.score,knownNonCar:c.knownNonCar,file:path.relative(outDir,file)
      });
      imageCount++;
    }
  }

  // Always render sensible $01 chains, even if global ranking was noisy.
  try{
    const r1=extractResourceBytes(model,0x01);
    const s1=findBobChains(r1.data,0x01);
    for(const c of s1.chains.slice(0,12)){
      if(c.fourPlane+c.fivePlane===0) continue;
      const fn=`R01_DEEP_O${c.start.toString(16).toUpperCase().padStart(6,'0')}_N${String(c.frameCount).padStart(3,'0')}.png`;
      const file=path.join(candidateDir,fn);
      if(!fs.existsSync(file)) makeContactSheet(r1.data,c,palette.rgb,file);
    }
  }catch(_){}

  writeJson(path.join(outDir,'car_probe_report.json'),report);

  const summary=[];
  summary.push('Indy Heat car probe');
  summary.push('===================');
  summary.push(`Disk: ${disk.length} bytes; main ${hex(model.main.length,5)}; resources ${model.resources.length}`);
  summary.push('');
  summary.push('Priority target: resource $38');
  const r38=report.resource38;
  if(r38 && !r38.error){
    summary.push(`  table sector: ${r38.entry.sector}; outLen ${r38.entry.outLen} (${hex(r38.entry.outLen,6)})`);
    summary.push(`  storage: ${r38.storageKind}; extracted bytes ${r38.actualLength}`);
    summary.push(`  strict whole-bank BOB: ${r38.wholeBank.valid?'YES':'no'}`);
    summary.push(`  plausible BOB headers: ${r38.headerCount}`);
    summary.push(`  contiguous BOB chains: ${r38.chains.length}`);
    for(const c of r38.chains.slice(0,20))
      summary.push(`    ${hex(c.start,6)}: ${c.frameCount} frames; dominant ${c.dominantDimensions}; ${c.fourPlane} four-plane; car-size ${c.carSizeFrames}; score ${c.score}`);
  }else{
    summary.push(`  ERROR: ${r38 ? r38.error : 'no result'}`);
  }
  summary.push('');

  summary.push('Resource-directory focus $24-$39');
  for(let id=0x24;id<=0x39;id++){
    const r=report.resources[id];
    if(!r) continue;
    summary.push(`  ${hex(id,2)} sector ${String(r.entry.sector).padStart(4,' ')} sectors ${String(r.entry.sectors).padStart(3,' ')} outLen ${hex(r.entry.outLen,6)} read ${hex(r.entry.readSize,6)} storage ${r.storageKind||'unread'} bytes ${r.actualLength||0}`);
  }
  summary.push('');

  summary.push('Resource $01');
  const r1=report.resource01;
  if(r1){
    summary.push(`  size: ${r1.actualLength} (${hex(r1.actualLength,6)})`);
    summary.push(`  strict whole-bank BOB: ${r1.wholeBank.valid?'YES':'no'}`);
    summary.push(`  plausible BOB headers found: ${r1.headerCount}`);
    summary.push(`  contiguous BOB chains: ${r1.chains.length}`);
    summary.push(`  car-sized isolated 4-plane headers: ${r1.isolatedCarLikeHeaderCount}`);
    summary.push(`  plausible increasing offset tables: ${r1.offsetPointerTables.length}`);
    for(const c of r1.chains.slice(0,10))
      summary.push(`    chain ${hex(c.start,6)}: ${c.frameCount} frames; dominant ${c.dominantDimensions}; score ${c.score}`);
  }else summary.push('  could not load resource $01');
  summary.push('');
  summary.push('Top unresolved candidate BOB chains');
  for(const s of report.shortlist.filter(x=>!x.knownNonCar).slice(0,20))
    summary.push(`  ${s.hexId} ${hex(s.start,6)}: ${s.frameCount} frames; ${s.dominantDimensions}; ${s.file}`);
  summary.push('');
  summary.push('Main-code references to resource $01 live pointer field');
  const refs=report.mainResourceReferences[hex(1,2)]?.pointerFieldReferences || [];
  if(refs.length) for(const r of refs)
    summary.push(`  main ${hex(r.mainOffset,5)} / runtime ${hex(r.runtimeAddress,5)}: ${r.kind}${r.opcode?' '+r.opcode:''} | ${r.context}`);
  else summary.push('  no literal absolute reference found (it may be reached indirectly via the resource table/base register)');
  summary.push('');
  summary.push('Main-code references to resource $38 live pointer field');
  const refs38=report.mainResourceReferences[hex(0x38,2)]?.pointerFieldReferences || [];
  if(refs38.length) for(const r of refs38)
    summary.push(`  main ${hex(r.mainOffset,5)} / runtime ${hex(r.runtimeAddress,5)}: ${r.kind}${r.opcode?' '+r.opcode:''} | ${r.context}`);
  else summary.push('  no literal absolute reference found (indirect table/base-register access remains possible)');
  summary.push('');

  summary.push('Known car/foreground draw-area callers');
  for(const [target,calls] of Object.entries(report.drawPathCallers)){
    if(!calls.length) continue;
    summary.push(`  ${target}:`);
    for(const c of calls) summary.push(`    ${c.type} from main ${hex(c.mainOffset,5)} / runtime ${hex(c.runtimeAddress,5)} | ${c.context}`);
  }
  summary.push('');
  summary.push('Full details: car_probe_report.json');
  summary.push('Review images: candidate_sheets/');
  fs.writeFileSync(path.join(outDir,'SUMMARY.txt'),summary.join('\n')+'\n');
  console.log(summary.join('\n'));
}

main();
