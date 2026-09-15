'use strict';
const R=require('./race-setup.js');
function assert(c,m){if(!c)throw new Error(m);}
function eq(a,b,m){if(a!==b)throw new Error(`${m}: expected ${b}, got ${a}`);}

const main=new Uint8Array(0x1000);
const record={index:3,offset:0x100,name:'Synthetic',baseResourceId:0x41};
const pitFile=0x500,pitRuntime=pitFile+0x1000;
R.wr32(main,record.offset+R.OFF.pitPointer,pitRuntime);
R.wr16(main,record.offset+R.OFF.laps,12);
R.wr16(main,record.offset+R.OFF.flagX,123);R.wr16(main,record.offset+R.OFF.flagY,45);
R.wr32(main,record.offset+R.OFF.startX,R.numberToFixed(-41));R.wr32(main,record.offset+R.OFF.startY,R.numberToFixed(17.5));R.wr16(main,record.offset+R.OFF.startOrient,0xffff);
for(let i=0;i<4;i++){
  const o=pitFile+i*R.PIT_RECORD_SIZE;
  R.wr32(main,o+R.PIT.serviceX,R.numberToFixed(-60+i*5));R.wr32(main,o+R.PIT.serviceY,R.numberToFixed(20+i));
  R.wr32(main,o+R.PIT.boardX,R.numberToFixed(-55+i*5));R.wr32(main,o+R.PIT.boardY,R.numberToFixed(18+i));
  R.wr16(main,o+R.PIT.screenX,80+i*30);R.wr16(main,o+R.PIT.screenY,150+i*4);R.wr16(main,o+R.PIT.slotWord,(i&1)?-1:1);
}
const original=main.slice();
let s=R.parseRaceSetup(main,record);
eq(s.laps,12,'laps');eq(s.flagX,123,'flag X');eq(s.flagY,45,'flag Y');eq(s.startOrient,-1,'orientation');eq(s.pitPointer,pitRuntime,'pit pointer');eq(s.pits.length,4,'pit count');eq(s.pits[2].screenX,140,'pit screen X');

R.writeCommon(main,record.offset,{laps:9,flagX:200,flagY:70,startX:R.numberToFixed(-30.25),startY:R.numberToFixed(11),startOrient:1});
R.writePit(main,pitFile,2,{serviceX:R.numberToFixed(-12.5),boardY:R.numberToFixed(7.25),screenX:222,screenY:111,slotWord:-7});
s=R.parseRaceSetup(main,record);eq(s.laps,9,'edited laps');eq(s.flagX,200,'edited flag');eq(R.fixedText(s.startX),'-30.25','edited grid X');eq(R.fixedText(s.pits[2].serviceX),'-12.5','edited service X');eq(s.pits[2].slotWord,-7,'edited slot word');
assert(R.isSetupDirty(main,original,record),'dirty detection');

const bin=R.makeCompactBin(main,record);eq(bin.length,0x68,'compact size');eq(R.setupFilename(record),'indyheat_r03_setup.bin','filename');
const fresh=original.slice();R.applyCompactBin(fresh,record,bin);
assert(R.arraysEqual(R.makeCompactBin(fresh,record),bin),'compact round trip');
eq(fresh[0],original[0],'unrelated byte preserved');
R.revertSetup(main,original,record);assert(!R.isSetupDirty(main,original,record),'revert');

const fx=R.projectFixedXZ((-63)<<16,(-29)<<16);
eq(fx.x,179,'fixed projection X');eq(fx.y,180,'fixed projection Y');
const raw=R.numberToFixed(-12.25),changed=R.replaceHighWord(raw,-20);eq(changed&0xffff,raw&0xffff,'fractional low word preserved');eq(changed>>16,-20,'high word replaced');

// Code-derived four-car grid offsets and orientation mirroring.
const g0=R.gridCarPositions({startX:R.numberToFixed(100),startY:R.numberToFixed(50),startOrient:0});
eq(g0.length,4,'grid car count');
eq(R.fixedText(g0[0].x),'95','grid C1 X');
eq(R.fixedText(g0[0].y),'47.875','grid C1 Y');
eq(R.fixedText(g0[3].x),'87','grid C4 X');
eq(R.fixedText(g0[3].y),'52.125','grid C4 Y');
const g1=R.gridCarPositions({startX:R.numberToFixed(100),startY:R.numberToFixed(50),startOrient:-32768});
eq(R.fixedText(g1[0].x),'105','mirrored grid C1 X');
eq(R.fixedText(g1[3].x),'113','mirrored grid C4 X');
assert(Math.abs(R.angle16ToCanvasRadians(0x4000)+Math.PI/2)<1e-12,'screen Y inversion makes +90 world angle rotate -90 on canvas');
eq(R.angle16FromWorldVector(0,1),0x4000,'world vector +Y angle');
const rr={waypointDescriptors:[null,null,{points:[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}]}]};
const ph=R.pitHeadingFromRoute(rr,{serviceX:R.numberToFixed(1),serviceY:R.numberToFixed(0)});
eq(ph,0,'pit heading follows next Route C point');
console.log('Indy Heat race setup compact/export/grid tests OK');
