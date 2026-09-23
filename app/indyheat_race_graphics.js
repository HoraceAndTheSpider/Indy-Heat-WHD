(function(root){
'use strict';

// Indy Heat Amiga race/presentation graphics decoder — v0.104.
//
// All artwork is decoded from the loaded retail Disk.1 model.  This module
// deliberately keeps the established ordinary BOB decoder and adds the
// separately encoded $38 racing-car bank.  Resource identities and selectors
// follow the current project Wiki; do not infer semantics from older v0.102
// labels.

const RACE_PALETTE_MAIN_OFFSET=0x5534;
const CAR_RESOURCE_ID=0x38;
const CAR_DESCRIPTOR_MAIN_OFFSET=0x2D30;
const CAR_FRAME_COUNT=336;
const CAR_EXPECTED_BYTES=0x32A8;

const PRESENTATION_PALETTE_WORDS=Object.freeze([
  0x000,0xEB9,0xD95,0xFFF,0x900,0xB33,0xC00,0xF00,
  0x4C4,0xEA1,0x292,0xC82,0x444,0x666,0x888,0xAAA,
  0x731,0xEA8,0x510,0xFDB,0x01B,0x14C,0x36C,0x48D,
  0xFFA,0x5AF,0xF99,0xF81,0x954,0xC74,0xC90,0xED2
]);

const RACE_OBJECT_RESOURCE_IDS=Object.freeze([
  0x05,0x06,0x07,0x08,0x09,0x0A,0x0B,0x0C,0x0D,0x0E,0x0F,0x10,0x11,CAR_RESOURCE_ID
]);

const RACE_OBJECT_ROLES=Object.freeze({
  0x05:{name:'pit crew',confidence:'established'},
  0x06:{name:'car damage/debris effects',confidence:'strong data/visual evidence'},
  0x07:{name:'damaged-car smoke plume',confidence:'strong data/visual evidence; exact consumer link pending'},
  0x08:{name:'PIT-board attendants',confidence:'established'},
  0x09:{name:'unresolved race-object bank',confidence:'unresolved'},
  0x0A:{name:'high-damage car-on-fire overlay',confidence:'user-confirmed in-game identity'},
  0x0B:{name:'out-of-fuel overlay',confidence:'user-confirmed in-game identity; exact internal grouping remains unresolved'},
  0x0C:{name:'unresolved race-object bank',confidence:'unresolved'},
  0x0D:{name:'speedometer',confidence:'user-confirmed in-game identity'},
  0x0E:{name:'speedometer / pit-status overlay',confidence:'user-confirmed association'},
  0x0F:{name:'flag man / starting gun',confidence:'established'},
  0x10:{name:'driver / face bank A',confidence:'established; 44-frame presentation bank'},
  0x11:{name:'driver / face bank B',confidence:'established; 44-frame mostly-mirrored companion to $10'},
  0x38:{name:'racing cars',confidence:'established; 336 descriptor-driven two-plane frames'}
});

// Resource-family order in $05/$08 and separate $38 colour selector:
//   0 red, 1 grey/white, 2 yellow, 3 blue.
// Player order follows the retail family order: P1 red, P2 grey/white, P3 yellow, P4 blue.
const PLAYER_GRAPHICS=Object.freeze([
  Object.freeze({player:'P1',colour:'Red',familyIndex:0,carColourIndex:0,css:'#ef4a43'}),
  Object.freeze({player:'P2',colour:'Grey/white',familyIndex:1,carColourIndex:1,css:'#d7d7d7'}),
  Object.freeze({player:'P3',colour:'Yellow',familyIndex:2,carColourIndex:2,css:'#e1c44b'}),
  Object.freeze({player:'P4',colour:'Blue',familyIndex:3,carColourIndex:3,css:'#7388ff'})
]);

const PIT_CREW_FAMILY_SIZE=76;
const PIT_CREW_SEQUENCES=Object.freeze({
  normal0:Object.freeze({key:'normal0',label:'Normal · side 0',offset:0,length:32}),
  normal1:Object.freeze({key:'normal1',label:'Normal · side 1',offset:32,length:32}),
  hitLR:Object.freeze({key:'hitLR',label:'Hit · car left→right',offset:64,length:6}),
  hitRL:Object.freeze({key:'hitRL',label:'Hit · car right→left',offset:70,length:6})
});
const PIT_BOARD_FAMILY_SIZE=16;
const PIT_BOARD_SEQUENCES=Object.freeze({
  male:Object.freeze({key:'male',label:'Male attendant',offset:0,length:8}),
  female:Object.freeze({key:'female',label:'Female attendant',offset:8,length:8})
});

const FEMALE_DRIVER_IDS=Object.freeze([3,4,5,8,9,13,19,22,28,37,40,43]);
const FEMALE_DRIVER_SET=new Set(FEMALE_DRIVER_IDS);

const CAR_PERSPECTIVES=Object.freeze({
  far:Object.freeze({key:'far',label:'Far',base:40,start:40,end:71}),
  middle:Object.freeze({key:'middle',label:'Middle',base:152,start:152,end:183}),
  near:Object.freeze({key:'near',label:'Near',base:264,start:264,end:295})
});
// $38 source value 0 is transparent. Source value 1 is the shared black detail
// used for tyres/outlines; only source values 2 and 3 use the selected player
// colour family. Treating every non-zero source value as a family shade loses
// the black wheel/detail pixels.
const CAR_COLOUR_PALETTE_BASES=Object.freeze([28,4,20,12]);

function be16(bytes,offset){
  if(!bytes||offset<0||offset+2>bytes.length)throw new Error('be16 outside buffer');
  return ((bytes[offset]<<8)|bytes[offset+1])>>>0;
}
function s16(v){return (v&0x8000)?v-0x10000:v;}
function s8(v){v=Number(v)&0xff;return (v&0x80)?v-0x100:v;}
function amiga12ToRgb(word){return [((word>>>8)&0xF)*17,((word>>>4)&0xF)*17,(word&0xF)*17];}

function paletteFromWords(words,source){
  return {words:Array.from(words),rgb:Array.from(words,amiga12ToRgb),source};
}
function presentationPalette(){return paletteFromWords(PRESENTATION_PALETTE_WORDS,'Gasoline Alley / presentation palette');}
function paletteFromMain(main,offset=RACE_PALETTE_MAIN_OFFSET){
  if(!main||offset<0||offset+64>main.length)throw new Error('Race palette is outside decrunched main image');
  const words=[];
  for(let i=0;i<32;i++){
    const word=be16(main,offset+i*2);
    if(word>0x0FFF)throw new Error(`Invalid Amiga 12-bit colour $${word.toString(16)} at main+$${(offset+i*2).toString(16)}`);
    words.push(word);
  }
  return {...paletteFromWords(words,'Disk.1 decrunched main'),offset};
}

// Four stored planes do not mean display colours 0..15. The race display is
// five-plane and retail places each four-colour source group into separated
// palette families. Five-plane resources already contain display indices.
function sourceToDisplayIndex(source,planes){
  source=Number(source)|0;
  if(planes===4)return source+4*((source>>>2)+1);
  if(planes===5)return source;
  return source;
}

function decodeFrame(data,offset=0,index=0){
  if(!data||offset<0||offset+12>data.length)throw new Error('Race-object frame header outside resource');
  const width=be16(data,offset+0),height=be16(data,offset+2);
  const rawXOrigin=be16(data,offset+4),rawYOrigin=be16(data,offset+6);
  const transparentSourceIndex=be16(data,offset+8),planes=be16(data,offset+10);
  if(width<1||width>320||height<1||height>256)throw new Error(`Invalid frame ${index} dimensions ${width}x${height} at $${offset.toString(16)}`);
  if(planes<1||planes>8)throw new Error(`Invalid frame ${index} plane count ${planes} at $${offset.toString(16)}`);
  if(transparentSourceIndex>=(1<<planes))throw new Error(`Frame ${index} transparent source index ${transparentSourceIndex} exceeds ${planes}-plane range`);

  const rowBytes=Math.ceil(width/16)*2,planeBytes=rowBytes*height,payloadOffset=offset+12;
  const byteLength=12+planeBytes*planes;
  if(offset+byteLength>data.length)throw new Error(`Frame ${index} at $${offset.toString(16)} overruns resource`);

  const sourcePixels=new Uint8Array(width*height),displayPixels=new Uint8Array(width*height),opaqueMask=new Uint8Array(width*height);
  displayPixels.fill(0xFF);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const pixelIndex=y*width+x,byteIndex=x>>>3,bitMask=0x80>>>(x&7);let source=0;
    for(let p=0;p<planes;p++){
      const po=payloadOffset+p*planeBytes+y*rowBytes+byteIndex;
      if(data[po]&bitMask)source|=1<<p;
    }
    sourcePixels[pixelIndex]=source;
    if(source===transparentSourceIndex)continue;
    opaqueMask[pixelIndex]=1;displayPixels[pixelIndex]=sourceToDisplayIndex(source,planes);
  }
  return {index,offset,byteLength,width,height,xOrigin:s16(rawXOrigin),yOrigin:s16(rawYOrigin),rawXOrigin,rawYOrigin,transparentSourceIndex,planes,rowBytes,planeBytes,payloadOffset,sourcePixels,displayPixels,opaqueMask};
}

function decodeBank(data,{resourceId=null,strict=true}={}){
  if(!data)throw new Error('Race-object resource data is required');
  const frames=[];let offset=0;
  while(offset<data.length){
    if(offset+12>data.length){if(strict)throw new Error(`Trailing ${data.length-offset} byte(s) after final race-object frame`);break;}
    const frame=decodeFrame(data,offset,frames.length);frames.push(frame);offset+=frame.byteLength;
  }
  if(strict&&offset!==data.length)throw new Error(`Parser ended at $${offset.toString(16)}, resource length is $${data.length.toString(16)}`);
  return {resourceId,role:resourceId==null?null:(RACE_OBJECT_ROLES[resourceId]||{name:'unresolved',confidence:'unresolved'}),byteLength:data.length,frameCount:frames.length,frames};
}

function decodeCarBank(model){
  if(!model?.main||typeof model.getResource!=='function')throw new Error('Disk model required for $38 cars');
  const resource=model.getResource(CAR_RESOURCE_ID),data=resource.data;
  if(data.length!==CAR_EXPECTED_BYTES)throw new Error(`$38 expected $${CAR_EXPECTED_BYTES.toString(16).toUpperCase()} bytes, got $${data.length.toString(16).toUpperCase()}`);
  const frames=[];let dataOffset=0;
  for(let index=0;index<CAR_FRAME_COUNT;index++){
    const d=CAR_DESCRIPTOR_MAIN_OFFSET+index*4;
    if(d+4>model.main.length)throw new Error(`$38 descriptor ${index} outside main image`);
    const width=model.main[d],height=model.main[d+1],xOrigin=s8(model.main[d+2]),yOrigin=s8(model.main[d+3]);
    if(width<1||width>16||height<1||height>64)throw new Error(`Invalid $38 descriptor ${index}: ${width}x${height}`);
    const planeBytes=height*2,byteLength=height*4;
    if(dataOffset+byteLength>data.length)throw new Error(`$38 frame ${index} overruns resource`);
    const sourcePixels=new Uint8Array(width*height),displayPixels=new Uint8Array(width*height),opaqueMask=new Uint8Array(width*height);
    displayPixels.fill(0xFF);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const bit=15-x;let source=0;
      for(let p=0;p<2;p++){
        const q=dataOffset+p*planeBytes+y*2,word=(data[q]<<8)|data[q+1];
        if(word&(1<<bit))source|=1<<p;
      }
      const pi=y*width+x;sourcePixels[pi]=source;
      if(source===0)continue;
      opaqueMask[pi]=1;displayPixels[pi]=source;
    }
    frames.push({index,offset:dataOffset,byteLength,width,height,xOrigin,yOrigin,transparentSourceIndex:0,planes:2,rowBytes:2,planeBytes,payloadOffset:dataOffset,sourcePixels,displayPixels,opaqueMask,descriptorOffset:d});
    dataOffset+=byteLength;
  }
  if(dataOffset!==data.length)throw new Error(`$38 frames consume $${dataOffset.toString(16)}, resource length is $${data.length.toString(16)}`);
  const sentinel=CAR_DESCRIPTOR_MAIN_OFFSET+CAR_FRAME_COUNT*4;
  return {resourceId:CAR_RESOURCE_ID,role:RACE_OBJECT_ROLES[CAR_RESOURCE_ID],byteLength:data.length,frameCount:frames.length,frames,resource,descriptorOffset:CAR_DESCRIPTOR_MAIN_OFFSET,sentinelOffset:sentinel};
}

function frameToRgba(frame,paletteRgb){
  if(!frame)return null;
  if(!paletteRgb||paletteRgb.length!==32)throw new Error('32-colour palette required');
  const rgba=new Uint8ClampedArray(frame.width*frame.height*4);
  for(let i=0;i<frame.displayPixels.length;i++){
    if(!frame.opaqueMask[i])continue;
    const colour=paletteRgb[frame.displayPixels[i]];
    if(!colour)throw new Error(`No palette entry for display index ${frame.displayPixels[i]}`);
    const o=i*4;rgba[o]=colour[0];rgba[o+1]=colour[1];rgba[o+2]=colour[2];rgba[o+3]=255;
  }
  return {width:frame.width,height:frame.height,rgba};
}
function carFrameToRgba(frame,paletteRgb,carColourIndex=0){
  if(!frame)return null;
  carColourIndex=Math.max(0,Math.min(3,Number(carColourIndex)|0));
  const base=CAR_COLOUR_PALETTE_BASES[carColourIndex],rgba=new Uint8ClampedArray(frame.width*frame.height*4);
  for(let i=0;i<frame.sourcePixels.length;i++){
    if(!frame.opaqueMask[i])continue;
    const source=frame.sourcePixels[i];
    // Retail cars share black detail (palette index 1) across all player colours.
    // Source 0 remains transparent; source 2/3 select the two body shades.
    const displayIndex=source===1?1:base+source,colour=paletteRgb[displayIndex];
    if(!colour)throw new Error(`No race palette entry for $38 display index ${displayIndex}`);
    const o=i*4;rgba[o]=colour[0];rgba[o+1]=colour[1];rgba[o+2]=colour[2];rgba[o+3]=255;
  }
  return {width:frame.width,height:frame.height,rgba};
}

function playerGraphics(index){return PLAYER_GRAPHICS[Math.max(0,Math.min(3,Number(index)|0))];}
function playerFamilyIndex(index){return playerGraphics(index).familyIndex;}
function carColourForPlayer(index){return playerGraphics(index).carColourIndex;}
function isFemaleDriver(index){return FEMALE_DRIVER_SET.has(Number(index)|0);}
function pitCrewFrameIndex(playerIndex,sequenceKey='normal0',localFrame=0){
  const seq=PIT_CREW_SEQUENCES[sequenceKey]||PIT_CREW_SEQUENCES.normal0;
  localFrame=Math.max(0,Math.min(seq.length-1,Number(localFrame)|0));
  return playerFamilyIndex(playerIndex)*PIT_CREW_FAMILY_SIZE+seq.offset+localFrame;
}
function pitBoardFrameIndex(playerIndex,sequenceKey='male',localFrame=0){
  const seq=PIT_BOARD_SEQUENCES[sequenceKey]||PIT_BOARD_SEQUENCES.male;
  localFrame=Math.max(0,Math.min(seq.length-1,Number(localFrame)|0));
  return playerFamilyIndex(playerIndex)*PIT_BOARD_FAMILY_SIZE+seq.offset+localFrame;
}
function carRotationFromHeadingByte(heading){return (((Number(heading)|0)+4)&0xFF)>>>3;}
function carRotationFromHeading16(heading16){return carRotationFromHeadingByte((Number(heading16)>>>8)&0xFF);}
function carPerspectiveForScreenY(y){y=Number(y);return y<0x38?'far':(y<0x7E?'middle':'near');}
function carNormalFrameIndex(rotation,perspective='middle'){
  const p=CAR_PERSPECTIVES[perspective]||CAR_PERSPECTIVES.middle;
  return p.base+(Number(rotation)&31);
}
function carNormalFrameFromHeading(heading16,screenY){return carNormalFrameIndex(carRotationFromHeading16(heading16),carPerspectiveForScreenY(screenY));}
function carNormalInfoForFrame(index){
  index=Number(index)|0;
  for(const p of Object.values(CAR_PERSPECTIVES))if(index>=p.start&&index<=p.end)return {perspective:p.key,label:p.label,rotation:index-p.base};
  return null;
}

function attach(model,{resourceIds=RACE_OBJECT_RESOURCE_IDS}={}){
  if(!model||typeof model.getResource!=='function'||!model.main)throw new Error('IndyHeatTools.makeDiskModel() result required');
  const racePalette=paletteFromMain(model.main),presentPalette=presentationPalette(),banks={};
  for(const id0 of resourceIds){
    const id=Number(id0);
    try{
      if(id===CAR_RESOURCE_ID){banks[id]=decodeCarBank(model);continue;}
      const resource=model.getResource(id),bank=decodeBank(resource.data,{resourceId:id,strict:true});bank.resource=resource;banks[id]=bank;
    }catch(error){banks[id]={resourceId:id,role:RACE_OBJECT_ROLES[id]||null,error:String(error?.message||error),frames:[],frameCount:0};}
  }
  const graphics={
    palette:racePalette,racePalette,presentationPalette:presentPalette,banks,resourceIds:Array.from(resourceIds),roles:RACE_OBJECT_ROLES,
    getBank(id){return banks[Number(id)]||null;},
    getFrame(id,index){return banks[Number(id)]?.frames?.[Number(index)]||null;},
    renderFrame(id,index,options={}){
      id=Number(id);const frame=this.getFrame(id,index);if(!frame)return null;
      if(id===CAR_RESOURCE_ID)return carFrameToRgba(frame,racePalette.rgb,options.carColourIndex??0);
      const palette=(id===0x10||id===0x11)?presentPalette:racePalette;
      return frameToRgba(frame,palette.rgb);
    },
    playerGraphics,playerFamilyIndex,carColourForPlayer,isFemaleDriver,pitCrewFrameIndex,pitBoardFrameIndex,
    carRotationFromHeadingByte,carRotationFromHeading16,carPerspectiveForScreenY,carNormalFrameIndex,carNormalFrameFromHeading,carNormalInfoForFrame
  };
  model.raceGraphics=graphics;return graphics;
}

const api={
  RACE_PALETTE_MAIN_OFFSET,PRESENTATION_PALETTE_WORDS,CAR_RESOURCE_ID,CAR_DESCRIPTOR_MAIN_OFFSET,CAR_FRAME_COUNT,CAR_EXPECTED_BYTES,
  RACE_OBJECT_RESOURCE_IDS,RACE_OBJECT_ROLES,PLAYER_GRAPHICS,PIT_CREW_FAMILY_SIZE,PIT_CREW_SEQUENCES,PIT_BOARD_FAMILY_SIZE,PIT_BOARD_SEQUENCES,
  FEMALE_DRIVER_IDS,CAR_PERSPECTIVES,CAR_COLOUR_PALETTE_BASES,
  be16,s16,s8,amiga12ToRgb,paletteFromWords,presentationPalette,paletteFromMain,sourceToDisplayIndex,decodeFrame,decodeBank,decodeCarBank,
  frameToRgba,carFrameToRgba,playerGraphics,playerFamilyIndex,carColourForPlayer,isFemaleDriver,pitCrewFrameIndex,pitBoardFrameIndex,
  carRotationFromHeadingByte,carRotationFromHeading16,carPerspectiveForScreenY,carNormalFrameIndex,carNormalFrameFromHeading,carNormalInfoForFrame,attach
};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.IndyHeatRaceGraphics=api;
})(typeof globalThis!=='undefined'?globalThis:this);

/* v0.105 companion UI loader. */
(function(){
'use strict';
if(typeof document==='undefined')return;
if(document.querySelector('script[data-indyheat-race-graphics-inspector]'))return;
const s=document.createElement('script');
s.src='race-graphics-inspector.js?v=0105';
s.dataset.indyheatRaceGraphicsInspector='1';
s.onerror=()=>console.warn('Indy Heat retail graphics inspector could not be loaded.');
document.head.appendChild(s);
})();
