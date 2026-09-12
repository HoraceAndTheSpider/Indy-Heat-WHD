(function(root){
'use strict';

const MAGICS = new Set(['IMP!','ATN!','BDPI','CHFI','Dupa','EDAM','FLT!','M.H.','PARA','RDC9']);
const STATIC_TOKEN_EXTRA_BITS = [1,1,1,1,2,3,3,4,4,5,7,14];
const EXPLODE_TOKEN_BASE = [6,10,10,18];
const TRACK_BASE_IDS = [0x39,0x3D,0x41,0x45,0x49,0x4D,0x5A,0x5E,0x62,0x66];
const RESOURCE_TABLE_OFFSET = 0x3C6A;
const MAIN_OUT_LEN = 0x1206A;

function be16(b,o){ return ((b[o]<<8)|b[o+1])>>>0; }
function be32(b,o){ return (((be16(b,o)<<16)>>>0)|be16(b,o+2))>>>0; }
function wr16(b,o,v){ b[o]=(v>>>8)&255; b[o+1]=v&255; }
function wr32(b,o,v){ wr16(b,o,(v>>>16)&0xffff); wr16(b,o+2,v&0xffff); }
function s16(v){ return v & 0x8000 ? v-0x10000 : v; }
function s32(v){ return v>0x7fffffff ? v-0x100000000 : v; }
function ascii4(b,o){ return String.fromCharCode(b[o],b[o+1],b[o+2],b[o+3]); }

function imploderInfo(block, off=0){
  if (!block || off+12>block.length) return null;
  const magic=ascii4(block,off);
  if (!MAGICS.has(magic)) return null;
  const outLen=be32(block,off+4), endOff=be32(block,off+8);
  if ((endOff&1) || endOff<14 || endOff+0x26>outLen) return null;
  return {magic,outLen,endOff,packedSize:endOff+0x32};
}

function explode(block){
  const inf=imploderInfo(block,0);
  if(!inf) throw new Error('Not a recognised File Imploder block');
  const {outLen,endOff}=inf;
  const src=new Uint8Array(outLen);
  src.set(block.subarray(0, Math.min(block.length,outLen)),0);
  const base=endOff;
  let srcEnd=outLen, cmprPos=0, tokenRunLen=0, token=0;

  if(base+0x2e>src.length) throw new Error('Imploder trailer outside output buffer');
  wr32(src,8,be32(src,base+0));
  wr32(src,4,be32(src,base+4));
  wr32(src,0,be32(src,base+8));
  tokenRunLen=be32(src,base+0x0c);
  if(!(src[base+0x10]&0x80)) cmprPos--;
  token=src[base+0x11];
  const runBase=Array.from({length:8},(_,i)=>be16(src,base+0x12+i*2));
  const runExtra=Array.from(src.subarray(base+0x22,base+0x22+12));

  function readBits(count){
    let ret=0;
    for(let i=0;i<count;i++){
      let bit=token>>>7;
      token=(token<<1)&255;
      if(token===0){
        const p=base+cmprPos-1;
        if(p<0 || p>=src.length) throw new Error('Imploder bitstream underflow');
        token=((src[p]<<1)&255)|bit;
        cmprPos--;
        const p2=base+cmprPos;
        if(p2<0 || p2>=src.length) throw new Error('Imploder bitstream underflow');
        bit=src[p2]>>>7;
      }
      ret=(ret<<1)|bit;
    }
    return ret>>>0;
  }

  let guard=0;
  while(true){
    if(++guard>10000000) throw new Error('Imploder runaway guard');
    for(let i=0;i<tokenRunLen && srcEnd>0;i++){
      cmprPos--; srcEnd--;
      const p=base+cmprPos;
      if(p<0 || p>=src.length) throw new Error('Imploder literal underflow');
      src[srcEnd]=src[p];
    }
    if(srcEnd===0) break;

    let matchLen, selector;
    if(readBits(1)){
      if(readBits(1)){
        if(readBits(1)){
          if(readBits(1)){
            if(readBits(1)){
              cmprPos--;
              const p=base+cmprPos;
              if(p<0 || p>=src.length) throw new Error('Imploder match underflow');
              matchLen=src[p]; selector=3;
            } else { matchLen=readBits(3)+6; selector=3; }
          } else { matchLen=5; selector=3; }
        } else { matchLen=4; selector=2; }
      } else { matchLen=3; selector=1; }
    } else { matchLen=2; selector=0; }

    if(readBits(1)){
      if(readBits(1)) tokenRunLen=readBits(STATIC_TOKEN_EXTRA_BITS[selector+8])+EXPLODE_TOKEN_BASE[selector];
      else tokenRunLen=readBits(STATIC_TOKEN_EXTRA_BITS[selector+4])+2;
    } else tokenRunLen=readBits(STATIC_TOKEN_EXTRA_BITS[selector]);

    let match;
    if(readBits(1)){
      if(readBits(1)) match=srcEnd+readBits(runExtra[8+selector])+runBase[4+selector]+1;
      else match=srcEnd+readBits(runExtra[4+selector])+runBase[selector]+1;
    } else match=srcEnd+readBits(runExtra[selector])+1;

    for(let i=0;i<matchLen && srcEnd>0;i++){
      match--; srcEnd--;
      if(match<0 || match>=src.length) throw new Error('Imploder back-reference outside output');
      src[srcEnd]=src[match];
    }
  }
  return src;
}

function scanImploderBlocks(disk){
  const out=[];
  const sigFirst=new Set([0x49,0x41,0x42,0x43,0x44,0x45,0x46,0x4d,0x50,0x52]);
  for(let off=0;off+12<=disk.length;off++){
    if(!sigFirst.has(disk[off])) continue;
    const inf=imploderInfo(disk,off);
    if(!inf) continue;
    if(off+inf.packedSize>disk.length) continue;
    out.push({offset:off,sector:Math.floor(off/512),sectorOffset:off%512,...inf});
    // Do not jump by packed size: rare signatures can overlap and the manifest is diagnostic.
  }
  return out;
}

function parseResourceTable(main, offset=RESOURCE_TABLE_OFFSET){
  const entries=[];
  for(let pos=offset, expected=0;pos+22<=main.length;pos+=22,expected++){
    const id=be16(main,pos);
    // Existing table starts at id 0 and is sequential; stop on first mismatch after entries begin.
    if(id!==expected){ if(entries.length) break; else continue; }
    entries.push({
      id,
      tableOffset:pos,
      sector:be16(main,pos+2),
      sectors:be16(main,pos+4),
      outLen:be32(main,pos+6),
      readSize:be32(main,pos+10),
      runtimePtr:be32(main,pos+14),
      allocSize:be32(main,pos+18)
    });
  }
  return entries;
}

function findResourceTable(main){
  // Known retail build first.
  let e=parseResourceTable(main,RESOURCE_TABLE_OFFSET);
  if(e.length>=0x6a) return {offset:RESOURCE_TABLE_OFFSET,entries:e};
  // Fallback: search for a long sequential table with sane sectors/sizes.
  let best={offset:-1,entries:[]};
  for(let off=0;off+22*40<main.length;off+=2){
    const cand=[];
    for(let pos=off,id=0;pos+22<=main.length;pos+=22,id++){
      if(be16(main,pos)!==id) break;
      const sector=be16(main,pos+2), sectors=be16(main,pos+4), outLen=be32(main,pos+6);
      if(sector>1760 || sectors>1760 || outLen>0x200000) break;
      cand.push({id,tableOffset:pos,sector,sectors,outLen,readSize:be32(main,pos+10),runtimePtr:be32(main,pos+14),allocSize:be32(main,pos+18)});
    }
    if(cand.length>best.entries.length) best={offset:off,entries:cand};
  }
  if(best.entries.length<40) throw new Error('Could not locate Indy Heat resource directory');
  return best;
}

function makeDiskModel(disk){
  const blocks=scanImploderBlocks(disk);
  let mainBlock=blocks.find(b=>b.outLen===MAIN_OUT_LEN);
  if(!mainBlock) mainBlock=blocks.find(b=>b.offset===22*512);
  if(!mainBlock) throw new Error('Indy Heat main program resource not found');
  const main=explode(disk.subarray(mainBlock.offset,mainBlock.offset+mainBlock.packedSize));
  const table=findResourceTable(main);
  const blockByOffset=new Map(blocks.map(b=>[b.offset,b]));
  const cache=new Map();

  function getResource(id){
    if(cache.has(id)) return cache.get(id);
    const entry=table.entries[id];
    if(!entry || entry.id!==id) throw new Error(`Resource $${id.toString(16)} not in directory`);
    const off=entry.sector*512;
    let block=blockByOffset.get(off);
    if(!block){
      const inf=imploderInfo(disk,off);
      if(!inf) throw new Error(`Resource $${id.toString(16)} at disk $${off.toString(16)} is not an Imploder block`);
      block={offset:off,sector:entry.sector,sectorOffset:0,...inf};
    }
    const data=explode(disk.subarray(off,off+block.packedSize));
    const result={id,entry,block,data}; cache.set(id,result); return result;
  }

  return {disk,blocks,mainBlock,main,resourceTableOffset:table.offset,resources:table.entries,getResource};
}

function decodePlanar(data,width,height,planes,offset=0){
  const rowBytes=Math.ceil(width/8), planeBytes=rowBytes*height;
  if(offset+planeBytes*planes>data.length) throw new Error('Planar resource shorter than expected');
  const px=new Uint8Array(width*height);
  for(let p=0;p<planes;p++){
    const po=offset+p*planeBytes;
    for(let y=0;y<height;y++){
      const ro=po+y*rowBytes;
      for(let xb=0;xb<rowBytes;xb++){
        const v=data[ro+xb];
        for(let bit=0;bit<8;bit++){
          const x=xb*8+bit; if(x>=width) break;
          if(v&(0x80>>>bit)) px[y*width+x]|=(1<<p);
        }
      }
    }
  }
  return px;
}

function decode1bpp(data,width,height,offset=0){
  const rowBytes=Math.ceil(width/8);
  if(offset+rowBytes*height>data.length) throw new Error('1bpp resource shorter than expected');
  const px=new Uint8Array(width*height);
  for(let y=0;y<height;y++) for(let xb=0;xb<rowBytes;xb++){
    const v=data[offset+y*rowBytes+xb];
    for(let bit=0;bit<8;bit++){
      const x=xb*8+bit; if(x>=width) break;
      px[y*width+x]=(v&(0x80>>>bit))?1:0;
    }
  }
  return px;
}

function decodeSurface2bpp(data,offset=0){
  const w=160,h=112,rowBytes=40;
  if(offset+rowBytes*h>data.length) throw new Error('Surface resource shorter than 0x1180 bytes');
  const cells=new Uint8Array(w*h);
  for(let y=0;y<h;y++){
    for(let bx=0;bx<rowBytes;bx++){
      const v=data[offset+y*rowBytes+bx];
      // Big-endian packing: four 2-bit logical cells, high pair first.
      for(let q=0;q<4;q++) cells[y*w+bx*4+q]=(v>>>(6-q*2))&3;
    }
  }
  return {width:w,height:h,scaleX:2,scaleY:2,cells};
}

function decodeHeadingGrid(data,offset=0){
  const w=40,h=28,len=w*h;
  if(offset+len>data.length) throw new Error('Heading grid shorter than 0x460 bytes');
  return {width:w,height:h,cellW:8,cellH:8,values:data.slice(offset,offset+len)};
}

function histogram(values,maxValue){
  const h=new Array(maxValue+1).fill(0); for(const v of values) if(v<=maxValue) h[v]++; return h;
}

function parseRaceRecords(main, base=0x4902, count=11, size=0x82){
  const out=[];
  for(let i=0;i<count;i++){
    const o=base+i*size; if(o+size>main.length) break;
    const descriptors=[];
    for(let d=0;d<3;d++){
      const p=o+d*12;
      descriptors.push({start:be32(main,p),end:be32(main,p+4),count:be16(main,p+8),wordA:s16(be16(main,p+10))});
    }
    // Name occupies the final 18-byte display field in this retail build. '<' and '@' are alignment/fill glyphs.
    let name='';
    const nameBytes=main.subarray(o+0x70,o+0x82);
    name=Array.from(nameBytes,c=>(c>=32&&c<=126)?String.fromCharCode(c):'').join('').replace(/[<@]/g,' ').replace(/\s+/g,' ').trim();
    out.push({index:i+1,offset:o,name,descriptors,field28:be16(main,o+0x28),field2A:be16(main,o+0x2A),coordXOriginRaw:s32(be32(main,o+0x62)),coordXOriginHi:s16(be16(main,o+0x62)),coordYOriginRaw:s32(be32(main,o+0x66)),coordYOriginHi:s16(be16(main,o+0x66)),coordFlipWord:s16(be16(main,o+0x6A)),raw:main.slice(o,o+size)});
  }
  return out;
}


function parseWaypointDescriptors(main, record){
  const sets=[];
  for(let d=0;d<3;d++){
    const desc=record.descriptors[d];
    const fileOffset=desc.start-0x1000; // boot copy maps decompressed file offset 0 to runtime $1000
    const points=[];
    if(fileOffset>=0 && fileOffset<main.length){
      // The descriptor span is exactly count*6 bytes. The game's nearest-point routine
      // loads count into D7 and uses DBF, apparently inspecting one extra record at the
      // descriptor end. We keep the descriptor's own count here and expose the ambiguity
      // rather than silently consuming the following descriptor's first record.
      for(let i=0;i<desc.count;i++){
        const p=fileOffset+i*6;
        if(p+6>main.length) break;
        const raw0=main[p];
        const xByte=main[p+1];
        const rawWord0=s16(be16(main,p));
        const progressRaw=main[p+2];
        const y=(main[p+3]&0x80)?main[p+3]-256:main[p+3];
        const linkRaw=s16(be16(main,p+4));
        // Static disk data has a striking invariant: (linkRaw + 13) is normally a
        // multiple of the six-byte record stride. Runtime code uses +4(A0) directly,
        // so this is kept explicitly as a *candidate pre-runtime decode* until the
        // setup/decryption transformation has been located.
        const linkDeltaCandidate=linkRaw+13;
        const linkAligned=(linkDeltaCandidate%6)===0;
        const runtimeAddress=desc.start+i*6;
        points.push({
          index:i,runtimeAddress,fileOffset:p,
          raw0,xByte,rawWord0,
          progressRaw,progress:progressRaw&0x7f,progressFlag:!!(progressRaw&0x80),
          y,linkRaw,linkDeltaCandidate,
          linkRecordsCandidate:linkAligned?linkDeltaCandidate/6:null,
          linkTargetCandidate:linkAligned?runtimeAddress+linkDeltaCandidate:null,
          // Visual projection is based on the fields that consistently place the raw
          // point clouds over the course. rawWord0 is retained separately because byte 0
          // is non-zero in at least one pre-runtime record and its setup semantics remain open.
          screenXUnmirrored:xByte*2,screenYProvisional:y+128
        });
      }
    }
    sets.push({
      index:d,start:desc.start,end:desc.end,count:desc.count,wordA:desc.wordA,fileOffset,points,
      descriptorBytes:desc.end-desc.start,
      nearestScanCountCandidate:desc.count+1
    });
  }
  return sets;
}

function raceBaseResourceId(record, resourceTableRuntimeBase=RESOURCE_TABLE_OFFSET+0x1000){
  // Race record +$36 points at +2 inside the first resource-directory entry for the track.
  const ptr=be32(record.raw,0x36);
  const delta=ptr-(resourceTableRuntimeBase+2);
  if(delta<0 || delta%22) return null;
  return delta/22;
}

function hex(v,n=4){ return '$'+Number(v>>>0).toString(16).toUpperCase().padStart(n,'0'); }

const api={MAGICS,TRACK_BASE_IDS,RESOURCE_TABLE_OFFSET,MAIN_OUT_LEN,be16,be32,s16,s32,hex,imploderInfo,explode,scanImploderBlocks,parseResourceTable,findResourceTable,makeDiskModel,decodePlanar,decode1bpp,decodeSurface2bpp,decodeHeadingGrid,histogram,parseRaceRecords,parseWaypointDescriptors,raceBaseResourceId};
if(typeof module!=='undefined' && module.exports) module.exports=api;
root.IndyHeatTools=api;
})(typeof globalThis!=='undefined'?globalThis:this);
