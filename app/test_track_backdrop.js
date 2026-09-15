'use strict';
const B=require('./track-backdrop.js');
function assert(c,m){if(!c)throw new Error(m);}
function eq(a,b,m){if(a!==b)throw new Error(`${m}: expected ${b}, got ${a}`);}
const gameWords=[
  0x888,0x000,0xFDC,0xFFF,0x333,0x666,0x999,0xCCC,
  0x954,0xF81,0xFA6,0xFFA,0x449,0x77B,0x66C,0x88F,
  0xAAF,0xCCF,0xF99,0xFCA,0xC74,0xCB2,0xC90,0xDD0,
  0x080,0x1B0,0x6D0,0x9F0,0x900,0xC00,0xB33,0xF00
];
function w16(a,o,v){a[o]=(v>>>8)&255;a[o+1]=v&255;}
function w32(a,o,v){w16(a,o,(v>>>16)&0xffff);w16(a,o+2,v&0xffff);}
function chunk(id,data){const out=new Uint8Array(8+data.length+(data.length&1));for(let i=0;i<4;i++)out[i]=id.charCodeAt(i);w32(out,4,data.length);out.set(data,8);return out;}
function paletteBytes(words){const out=new Uint8Array(words.length*3);words.forEach((w,i)=>{out[i*3]=((w>>>8)&15)*17;out[i*3+1]=((w>>>4)&15)*17;out[i*3+2]=(w&15)*17;});return out;}
function ilbmRows(pixels,width,height,planes){const rb=((width+15)>>4)<<1,rows=[];for(let y=0;y<height;y++)for(let p=0;p<planes;p++){const row=new Uint8Array(rb);for(let x=0;x<width;x++)if(pixels[y*width+x]&(1<<p))row[x>>>3]|=0x80>>>(x&7);rows.push(row);}return rows;}
function byteRunRow(row){const out=[];for(let p=0;p<row.length;){const n=Math.min(128,row.length-p);out.push(n-1);for(let i=0;i<n;i++)out.push(row[p+i]);p+=n;}return Uint8Array.from(out);}
function buildIlbm(pixels,words,{compression=0,width=320,height=256,planes=5}={}){
  const bm=new Uint8Array(20);w16(bm,0,width);w16(bm,2,height);bm[8]=planes;bm[9]=0;bm[10]=compression;bm[14]=10;bm[15]=11;w16(bm,16,width);w16(bm,18,height);
  const rows=ilbmRows(pixels,width,height,planes),parts=[];let bodyLen=0;for(const r of rows){const q=compression?byteRunRow(r):r;parts.push(q);bodyLen+=q.length;}const body=new Uint8Array(bodyLen);let bp=0;for(const q of parts){body.set(q,bp);bp+=q.length;}
  const cs=[chunk('BMHD',bm),chunk('CMAP',paletteBytes(words)),chunk('BODY',body)];let size=4;for(const c of cs)size+=c.length;const out=new Uint8Array(8+size);out.set(Buffer.from('FORM'),0);w32(out,4,size);out.set(Buffer.from('ILBM'),8);let p=12;for(const c of cs){out.set(c,p);p+=c.length;}return out;
}

const px=new Uint8Array(320*256);for(let y=0;y<256;y++)for(let x=0;x<320;x++)px[y*320+x]=((x>>4)+(y>>4))&31;
for(const compression of [0,1]){
  const iff=buildIlbm(px,gameWords,{compression});const converted=B.convertIlbmToTrack(iff,gameWords,{remap:true});
  assert(converted.paletteExact,`palette exact compression ${compression}`);eq(converted.trackBytes.length,0xC800,'track byte size');
  const back=B.decodeTrackPlanar(converted.trackBytes);assert(B.arraysEqual(back,px),`planar round trip compression ${compression}`);
}

const px2=new Uint8Array(320*256);px2.fill(1);const srcWords=gameWords.slice();srcWords[1]=gameWords[2];const remapped=B.convertIlbmToTrack(buildIlbm(px2,srcWords),gameWords,{remap:true});
assert(!remapped.paletteExact,'palette mismatch detected');assert(remapped.remapped,'palette remapped');eq(remapped.mapping[1],2,'nearest palette mapping');eq(B.decodeTrackPlanar(remapped.trackBytes)[0],2,'remapped pixel index');
const kept=B.convertIlbmToTrack(buildIlbm(px2,srcWords),gameWords,{remap:false});eq(B.decodeTrackPlanar(kept.trackBytes)[0],1,'source index kept when remap disabled');

let bad=false;try{B.parseIlbm(buildIlbm(new Uint8Array(319*256),gameWords,{width:319}));}catch(e){bad=/320×256/.test(e.message);}assert(bad,'wrong dimensions rejected');
eq(B.backdropFilename(0x39),'indyheat_res39_background.bin','background filename');
console.log('Indy Heat ILBM backdrop import/export tests OK');
