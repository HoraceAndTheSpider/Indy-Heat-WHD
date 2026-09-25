(function(root){
'use strict';

const MAGICS = new Set(['IMP!','ATN!','BDPI','CHFI','Dupa','EDAM','FLT!','M.H.','PARA','RDC9']);
const STATIC_TOKEN_EXTRA_BITS = [1,1,1,1,2,3,3,4,4,5,7,14];
const EXPLODE_TOKEN_BASE = [6,10,10,18];
const TRACK_BASE_IDS = [0x39,0x3D,0x41,0x45,0x49,0x4D,0x5A,0x5E,0x62,0x66];
const RESOURCE_TABLE_OFFSET = 0x3C6A;
const MAIN_OUT_LEN = 0x1206A;

// Verified common racing palette from the original Illinois ILBM rip (r1.iff).
// ILBM CMAP channels are stored as the Amiga 4-bit nibble shifted left four bits,
// so e.g. $80 maps back to nibble $8, not 128/17 rounded down to $7.
const VERIFIED_TRACK_PALETTE_WORDS = Object.freeze([
  0x888,0x000,0xFDC,0xFFF,0x333,0x666,0x999,0xCCC,
  0x954,0xF81,0xFA6,0xFFA,0x449,0x77B,0x66C,0x88F,
  0xAAF,0xCCF,0xF99,0xFCA,0xC74,0xCB2,0xC90,0xDD0,
  0x080,0x1B0,0x6D0,0x9F0,0x900,0xC00,0xB33,0xF00
]);

function be16(b,o){ return ((b[o]<<8)|b[o+1])>>>0; }
function be32(b,o){ return (((be16(b,o)<<16)>>>0)|be16(b,o+2))>>>0; }
function wr16(b,o,v){ b[o]=(v>>>8)&255; b[o+1]=v&255; }
function wr32(b,o,v){ wr16(b,o,(v>>>16)&0xffff); wr16(b,o+2,v&0xffff); }
function s8(v){ return v & 0x80 ? v-0x100 : v; }
function s16(v){ return v & 0x8000 ? v-0x10000 : v; }
function s32(v){ return v>0x7fffffff ? v-0x100000000 : v; }
function complementByte(v){ return (~v)&0xff; }

// Waypoint records are stored complemented in the decrunched main image.
// Live emulator captures prove that normal runtime use sees every byte XOR $FF.
function decodeStoredWaypointBytes(bytes){
  if(!bytes || bytes.length<6) throw new Error('Waypoint record must contain six stored bytes');
  const runtimeBytes=Uint8Array.from(bytes.slice(0,6),complementByte);
  const x=s16((runtimeBytes[0]<<8)|runtimeBytes[1]);
  const progressByte=runtimeBytes[2];
  const y=s8(runtimeBytes[3]);
  const linkDelta=s16((runtimeBytes[4]<<8)|runtimeBytes[5]);
  return {
    runtimeBytes,x,progressByte,progress:progressByte&0x7f,progressFlag:!!(progressByte&0x80),
    y,linkDelta,linkAligned:(linkDelta%6)===0,linkRecords:(linkDelta%6)===0?linkDelta/6:null
  };
}

function encodeRuntimeWaypoint(values){
  const x=Number(values.x), y=Number(values.y), progress=Number(values.progress), linkDelta=Number(values.linkDelta);
  if(!Number.isInteger(x)||x<-32768||x>32767) throw new Error('Waypoint X must be a signed 16-bit integer');
  if(!Number.isInteger(y)||y<-128||y>127) throw new Error('Waypoint Y must be a signed 8-bit integer');
  if(!Number.isInteger(progress)||progress<0||progress>127) throw new Error('Waypoint progress must be 0–127');
  if(!Number.isInteger(linkDelta)||linkDelta<-32768||linkDelta>32767) throw new Error('Waypoint link delta must be a signed 16-bit integer');
  const runtimeBytes=new Uint8Array(6);
  wr16(runtimeBytes,0,x&0xffff);
  runtimeBytes[2]=(progress&0x7f)|(values.progressFlag?0x80:0);
  runtimeBytes[3]=y&0xff;
  wr16(runtimeBytes,4,linkDelta&0xffff);
  return {runtimeBytes,storedBytes:Uint8Array.from(runtimeBytes,complementByte)};
}

function writeWaypoint(main, point, changes={}){
  if(!main || point.fileOffset==null) throw new Error('Waypoint has no writable main-image location');
  const values={
    x:changes.x??point.x, y:changes.y??point.y, progress:changes.progress??point.progress,
    progressFlag:changes.progressFlag??point.progressFlag, linkDelta:changes.linkDelta??point.linkDelta
  };
  const encoded=encodeRuntimeWaypoint(values);
  main.set(encoded.storedBytes,point.fileOffset);
  return {...values,...encoded};
}
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

// Code-derived projection at runtime $B082 / main+$A082 specialised for waypoint
// high-word coordinates. Earlier validation used A082(-staticX,0,-staticY); after
// the proven bytewise complement, decoded runtime X/Y are the natural inputs.
// Passing X/Y as 16.16 high words reduces the original 68000 arithmetic to these
// exact integer expressions (DIVS truncates toward zero).
function projectWaypointA082(x,y){
  x=Number(x); y=Number(y);
  if(!Number.isInteger(x)||!Number.isInteger(y)) return null;
  const denominator=0x3200 + y*0x31;
  if(denominator===0) return null;
  const dx=Math.trunc((x*0x8000)/denominator);
  const dy=Math.trunc((y*0x5000)/denominator);
  return {x:0x168+dx,y:0x80-dy,denominator};
}

// Invert the specialised waypoint projection sufficiently for editor dragging.
// Y has only 256 legal values, so enumerate it and test the nearest X candidates.
// This follows the exact forward integer projection rather than relying on a float-only inverse.
function inverseWaypointA082(screenX,screenY,preferX=0,preferY=0){
  screenX=Number(screenX); screenY=Number(screenY);
  if(!Number.isFinite(screenX)||!Number.isFinite(screenY)) return null;
  let best=null;
  for(let y=-128;y<=127;y++){
    const denominator=0x3200+y*0x31;
    if(denominator===0)continue;
    const estimate=Math.round(((screenX-0x168)*denominator)/0x8000);
    for(let dx=-3;dx<=3;dx++){
      const x=Math.max(-32768,Math.min(32767,estimate+dx));
      const q=projectWaypointA082(x,y); if(!q)continue;
      const ex=q.x-screenX,ey=q.y-screenY,d2=ex*ex+ey*ey;
      const tie=Math.abs(x-preferX)*1e-7+Math.abs(y-preferY)*1e-6;
      const score=d2+tie;
      if(!best||score<best.score)best={x,y,screenX:q.x,screenY:q.y,d2,score};
    }
  }
  return best;
}

function amiga12ToRgb(word){
  word=Number(word)&0x0fff;
  const r=(word>>8)&15,g=(word>>4)&15,b=word&15;
  return [r*17,g*17,b*17];
}

function paletteWordsToRgb(words){return Array.from(words,amiga12ToRgb);}

function findWordSequence(data,words){
  if(!data||!words||!words.length)return [];
  const hits=[];
  const byteLen=words.length*2;
  for(let off=0;off+byteLen<=data.length;off+=2){
    let ok=true;
    for(let i=0;i<words.length;i++)if(be16(data,off+i*2)!==(words[i]&0xffff)){ok=false;break;}
    if(ok)hits.push(off);
  }
  return hits;
}

function verifiedTrackPaletteReference(){
  const words=Array.from(VERIFIED_TRACK_PALETTE_WORDS);
  return {words,rgb:paletteWordsToRgb(words),verified:true,exactSourceFound:false,sourceKind:'reference',sourceLabel:'verified r1.iff CMAP fallback'};
}

// Locate the exact palette in decompressed game data. This deliberately replaces the
// v0.8 "looks like a palette" heuristic. Main is searched first; only if the exact
// 64-byte table is absent do we decompress/search the resource directory.
function findVerifiedTrackPalette(model,{scanResources=true}={}){
  const ref=verifiedTrackPaletteReference();
  if(!model)return ref;
  const mainHits=findWordSequence(model.main,VERIFIED_TRACK_PALETTE_WORDS);
  if(mainHits.length){
    return {...ref,exactSourceFound:true,sourceKind:'main',sourceLabel:`decompressed main +$${mainHits[0].toString(16).toUpperCase()}`,fileOffset:mainHits[0],hits:mainHits.map(fileOffset=>({kind:'main',fileOffset}))};
  }
  if(scanResources && Array.isArray(model.resources) && typeof model.getResource==='function'){
    const hits=[];
    for(const entry of model.resources){
      // Skip the large circuit bitmaps and similarly huge assets on the first exact scan;
      // a 64-byte palette table is overwhelmingly more likely in code/data-sized resources.
      if(!entry || entry.outLen<64 || entry.outLen>0x20000)continue;
      try{
        const resource=model.getResource(entry.id);
        const offsets=findWordSequence(resource.data,VERIFIED_TRACK_PALETTE_WORDS);
        for(const fileOffset of offsets)hits.push({kind:'resource',resourceId:entry.id,fileOffset});
      }catch(_){/* malformed/unrelated resources are ignored by the palette search */}
    }
    if(hits.length){
      const h=hits[0];
      return {...ref,exactSourceFound:true,sourceKind:'resource',sourceLabel:`resource $${h.resourceId.toString(16).toUpperCase()} +$${h.fileOffset.toString(16).toUpperCase()}`,resourceId:h.resourceId,fileOffset:h.fileOffset,hits};
    }
  }
  return ref;
}

// Kept as compatibility wrappers for v0.8 callers/tests. They now return the single
// verified common game palette rather than guessing independent race palettes.
function findTrackPaletteSet(main,records){
  const words=Array.from(VERIFIED_TRACK_PALETTE_WORDS), rgb=paletteWordsToRgb(words);
  const hits=findWordSequence(main,VERIFIED_TRACK_PALETTE_WORDS);
  const base={words,rgb,verified:true,sourceKind:hits.length?'main':'reference',fileOffset:hits[0]??null,sourceLabel:hits.length?`decompressed main +$${hits[0].toString(16).toUpperCase()}`:'verified r1.iff CMAP'};
  return {common:true,count:Array.isArray(records)?records.length:0,palettes:Array.from({length:Array.isArray(records)?records.length:0},()=>base),source:base};
}
function findTrackPalette(main,record){
  const words=Array.from(VERIFIED_TRACK_PALETTE_WORDS),hits=findWordSequence(main,VERIFIED_TRACK_PALETTE_WORDS);
  return {words,rgb:paletteWordsToRgb(words),verified:true,sourceKind:hits.length?'main':'reference',fileOffset:hits[0]??null,sourceLabel:hits.length?`decompressed main +$${hits[0].toString(16).toUpperCase()}`:'verified r1.iff CMAP'};
}

function parseRaceRecords(main, base=0x4902, count=11, size=0x82){
  const out=[];
  for(let i=0;i<count;i++){
    const o=base+i*size; if(o+size>main.length) break;
    const descriptors=[];
    for(let d=0;d<3;d++){
      const p=o+d*12;
      descriptors.push({start:be32(main,p),end:be32(main,p+4),count:be16(main,p+8),lapGuardRaw:main[p+10],lapGuardMin:s8(main[p+10])>>1,tailByte:main[p+11],wordA:s16(be16(main,p+10))});
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
      // Descriptor arithmetic proves count six-byte records in the stored span. The game's
      // nearest-point DBF appears to inspect the record at end as an additional boundary,
      // so that record is exposed separately below instead of silently added to points[].
      for(let i=0;i<desc.count;i++){
        const p=fileOffset+i*6;
        if(p+6>main.length) break;
        const storedBytes=main.slice(p,p+6);
        const dec=decodeStoredWaypointBytes(storedBytes);
        const runtimeAddress=desc.start+i*6;
        points.push({
          index:i,setIndex:d,runtimeAddress,fileOffset:p,storedBytes,
          runtimeBytes:dec.runtimeBytes,x:dec.x,progressByte:dec.progressByte,
          progress:dec.progress,progressFlag:dec.progressFlag,y:dec.y,
          linkDelta:dec.linkDelta,linkAligned:dec.linkAligned,linkRecords:dec.linkRecords,
          linkTarget:runtimeAddress+dec.linkDelta,
          // Stored aliases are retained for low-level inspection / backwards-compatible JSON.
          storedWord0:s16(be16(storedBytes,0)),storedProgress:storedBytes[2],
          storedY:s8(storedBytes[3]),storedLink:s16(be16(storedBytes,4))
        });
      }
    }
    let boundaryPoint=null;
    const boundaryFileOffset=desc.end-0x1000;
    if(boundaryFileOffset>=0 && boundaryFileOffset+6<=main.length){
      const storedBytes=main.slice(boundaryFileOffset,boundaryFileOffset+6);
      const zeroSentinel=storedBytes.every(v=>v===0);
      const dec=decodeStoredWaypointBytes(storedBytes);
      boundaryPoint={
        index:desc.count,setIndex:d,runtimeAddress:desc.end,fileOffset:boundaryFileOffset,
        storedBytes,runtimeBytes:dec.runtimeBytes,x:dec.x,progressByte:dec.progressByte,
        progress:dec.progress,progressFlag:dec.progressFlag,y:dec.y,linkDelta:dec.linkDelta,
        linkAligned:dec.linkAligned,linkRecords:dec.linkRecords,linkTarget:desc.end+dec.linkDelta,
        boundaryOnly:true,zeroSentinel
      };
    }
    sets.push({
      index:d,start:desc.start,end:desc.end,count:desc.count,lapGuardRaw:desc.lapGuardRaw,lapGuardMin:desc.lapGuardMin,tailByte:desc.tailByte,wordA:desc.wordA,fileOffset,points,boundaryPoint,
      descriptorBytes:desc.end-desc.start,nearestScanCountCandidate:desc.count+1
    });
  }

  // Resolve real runtime +4.w links against ordinary records and the explicit descriptor
  // boundary records. Boundary records remain protected from normal editing until the DBF
  // endpoint semantics (especially the final zero sentinel) are fully proved.
  const byAddress=new Map();
  // Prefer an ordinary record when a descriptor end aliases the next descriptor's start.
  // Boundary-only records are added afterwards so the final sentinel remains resolvable
  // without obscuring a genuine ordinary point at the same runtime address.
  for(const set of sets) for(const point of set.points)
    if(!byAddress.has(point.runtimeAddress)) byAddress.set(point.runtimeAddress,point);
  for(const set of sets)
    if(set.boundaryPoint && !byAddress.has(set.boundaryPoint.runtimeAddress))
      byAddress.set(set.boundaryPoint.runtimeAddress,set.boundaryPoint);
  for(const set of sets) for(const point of set.points){
    const target=byAddress.get(point.linkTarget)||null;
    point.linkResolved=!!target;
    point.linkTargetSet=target?.setIndex??null;
    point.linkTargetIndex=target?.index??null;
    point.linkTargetBoundary=!!target?.boundaryOnly;
    point.linkTargetZeroSentinel=!!target?.zeroSentinel;
  }
  return sets;
}

function summarizeWaypointSequences(sets){
  if(!sets) return [];
  return sets.map(set=>{
    const counts=new Map();
    for(const p of set.points||[]) counts.set(p.progress,(counts.get(p.progress)||0)+1);
    const values=[...counts.keys()].sort((a,b)=>a-b);
    const min=values.length?values[0]:null, max=values.length?values[values.length-1]:null;
    const missing=[];
    if(min!=null&&max!=null) for(let v=min;v<=max;v++) if(!counts.has(v)) missing.push(v);
    const duplicates=values.filter(v=>counts.get(v)>1).map(v=>({sequence:v,count:counts.get(v)}));
    return {route:'ABC'[set.index]||String(set.index),setIndex:set.index,physicalCount:(set.points||[]).length,min,max,uniqueCount:values.length,missing,duplicates,counts:Object.fromEntries(values.map(v=>[v,counts.get(v)]))};
  });
}

function raceBaseResourceId(record, resourceTableRuntimeBase=RESOURCE_TABLE_OFFSET+0x1000){
  // Race record +$36 points at +2 inside the first resource-directory entry for the track.
  const ptr=be32(record.raw,0x36);
  const delta=ptr-(resourceTableRuntimeBase+2);
  if(delta<0 || delta%22) return null;
  return delta/22;
}

function hex(v,n=4){ return '$'+Number(v>>>0).toString(16).toUpperCase().padStart(n,'0'); }

const api={MAGICS,TRACK_BASE_IDS,RESOURCE_TABLE_OFFSET,MAIN_OUT_LEN,VERIFIED_TRACK_PALETTE_WORDS,be16,be32,s8,s16,s32,hex,complementByte,decodeStoredWaypointBytes,encodeRuntimeWaypoint,writeWaypoint,imploderInfo,explode,scanImploderBlocks,parseResourceTable,findResourceTable,makeDiskModel,decodePlanar,decode1bpp,decodeSurface2bpp,decodeHeadingGrid,histogram,projectWaypointA082,inverseWaypointA082,amiga12ToRgb,paletteWordsToRgb,findWordSequence,verifiedTrackPaletteReference,findVerifiedTrackPalette,findTrackPaletteSet,findTrackPalette,parseRaceRecords,parseWaypointDescriptors,summarizeWaypointSequences,raceBaseResourceId};
if(typeof module!=='undefined' && module.exports) module.exports=api;
root.IndyHeatTools=api;
})(typeof globalThis!=='undefined'?globalThis:this);
