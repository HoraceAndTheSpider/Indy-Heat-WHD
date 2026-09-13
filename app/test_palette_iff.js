'use strict';
const fs=require('fs');
const T=require('./indyheat.js');
const path=process.argv[2];
if(!path||!fs.existsSync(path)){
  console.error('Usage: node test_palette_iff.js /path/to/r1.iff');
  process.exit(2);
}
const b=fs.readFileSync(path);
if(b.toString('ascii',0,4)!=='FORM'||b.toString('ascii',8,12)!=='ILBM')throw new Error('not an ILBM');
let p=12,cmap=null,bmhd=null;
while(p+8<=b.length){const id=b.toString('ascii',p,p+4),n=b.readUInt32BE(p+4),d=b.subarray(p+8,p+8+n);if(id==='CMAP')cmap=d;if(id==='BMHD')bmhd=d;p+=8+n+(n&1);}
if(!bmhd||!cmap)throw new Error('BMHD/CMAP missing');
if(bmhd.readUInt16BE(0)!==320||bmhd.readUInt16BE(2)!==256||bmhd[8]!==5)throw new Error('unexpected ILBM geometry/depth');
if(cmap.length!==96)throw new Error(`expected 32-colour CMAP, got ${cmap.length/3}`);
const words=[];
for(let i=0;i<32;i++)words.push(((cmap[i*3]>>4)<<8)|((cmap[i*3+1]>>4)<<4)|(cmap[i*3+2]>>4));
if(JSON.stringify(words)!==JSON.stringify(Array.from(T.VERIFIED_TRACK_PALETTE_WORDS)))throw new Error('r1.iff CMAP does not match embedded verified palette');
console.log('r1.iff verified: 320x256, 5 planes, 32-colour CMAP matches editor palette');
console.log(words.map(w=>w.toString(16).toUpperCase().padStart(3,'0')).join(' '));
