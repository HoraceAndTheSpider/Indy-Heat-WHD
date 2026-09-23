(function(root){
'use strict';

// Indy Heat Amiga race-object/BOB graphics decoder.
//
// Runtime input is Disk.1 via the existing IndyHeatTools.makeDiskModel() model.
// It does NOT read FlagMan.iff or any pre-ripped PNG.  The supplied IFF was used
// only as an external regression proof while the format was being established.
//
// Integration:
//   const model = IndyHeatTools.makeDiskModel(diskBytes);
//   const graphics = IndyHeatRaceGraphics.attach(model);
//   const frame = graphics.getFrame(0x08, 0);
//   const image = graphics.renderFrame(0x08, 0); // {width,height,rgba}

const RACE_PALETTE_MAIN_OFFSET = 0x5534; // decrunched retail main image
const RACE_OBJECT_RESOURCE_IDS = Object.freeze([
  0x05,0x06,0x07,0x08,0x09,0x0A,0x0B,0x0C,0x0D,0x0E,0x0F,0x10,0x11
]);

const RACE_OBJECT_ROLES = Object.freeze({
  0x05:{name:'pit crew',confidence:'established'},
  0x06:{name:'car damage/debris effects',confidence:'strong data/visual evidence'},
  0x07:{name:'damaged-car smoke plume',confidence:'strong data/visual evidence; exact consumer link pending'},
  0x08:{name:'PIT-board attendants',confidence:'established'},
  0x09:{name:'unresolved race-object bank',confidence:'unresolved'},
  0x0A:{name:'high-damage car-on-fire overlay',confidence:'user-confirmed in-game identity'},
  0x0B:{name:'out-of-fuel overlay',confidence:'user-confirmed in-game identity; exact internal grouping remains unresolved'},
  0x0C:{name:'unresolved race-object bank',confidence:'unresolved'},
  0x0D:{name:'speedometer',confidence:'user-confirmed in-game identity; three instances shown low on race screen'},
  0x0E:{name:'speedometer / pit-status overlay',confidence:'user-confirmed association; blank/default-restoration role remains inferred'},
  0x0F:{name:'flag man / starting gun',confidence:'established'},
  0x10:{name:'racing car bank A',confidence:'established; 44-frame five-plane retail bank'},
  0x11:{name:'racing car bank B / horizontal mirror',confidence:'established; near-mirror companion to $10'}
});

function be16(bytes, offset){
  if(!bytes || offset < 0 || offset + 2 > bytes.length) throw new Error('be16 outside buffer');
  return ((bytes[offset] << 8) | bytes[offset + 1]) >>> 0;
}

function s16(v){ return (v & 0x8000) ? v - 0x10000 : v; }

function amiga12ToRgb(word){
  return [((word >>> 8) & 0xF) * 17, ((word >>> 4) & 0xF) * 17, (word & 0xF) * 17];
}

function paletteFromMain(main, offset=RACE_PALETTE_MAIN_OFFSET){
  if(!main || offset < 0 || offset + 64 > main.length) throw new Error('Race palette is outside decrunched main image');
  const words=[], rgb=[];
  for(let i=0;i<32;i++){
    const word=be16(main,offset+i*2);
    if(word>0x0FFF) throw new Error(`Invalid Amiga 12-bit colour $${word.toString(16)} at main+$${(offset+i*2).toString(16)}`);
    words.push(word); rgb.push(amiga12ToRgb(word));
  }
  return {offset,words,rgb,source:'Disk.1 decrunched main'};
}

// Four stored planes do not mean display colours 0..15.  The race display is
// five-plane and the game places each four-colour source group into one of four
// separated banks in the 32-colour display palette.
function sourceToDisplayIndex(source, planes){
  source = Number(source) | 0;
  if(planes===4) return source + 4 * ((source >>> 2) + 1);
  if(planes===5) return source;
  return source;
}

function decodeFrame(data, offset=0, index=0){
  if(!data || offset < 0 || offset + 12 > data.length) throw new Error('Race-object frame header outside resource');

  const width=be16(data,offset+0);
  const height=be16(data,offset+2);
  const rawXOrigin=be16(data,offset+4);
  const rawYOrigin=be16(data,offset+6);
  const transparentSourceIndex=be16(data,offset+8);
  const planes=be16(data,offset+10);

  if(width<1 || width>320 || height<1 || height>256)
    throw new Error(`Invalid frame ${index} dimensions ${width}x${height} at $${offset.toString(16)}`);
  if(planes<1 || planes>8)
    throw new Error(`Invalid frame ${index} plane count ${planes} at $${offset.toString(16)}`);
  if(transparentSourceIndex >= (1 << planes))
    throw new Error(`Frame ${index} transparent source index ${transparentSourceIndex} exceeds ${planes}-plane range`);

  // Rows are word-padded.  Payload is plane-major: all rows of plane 0,
  // followed by all rows of plane 1, etc.
  const rowBytes=Math.ceil(width/16)*2;
  const planeBytes=rowBytes*height;
  const payloadOffset=offset+12;
  const byteLength=12+planeBytes*planes;
  if(offset+byteLength>data.length)
    throw new Error(`Frame ${index} at $${offset.toString(16)} overruns resource`);

  const sourcePixels=new Uint8Array(width*height);
  const displayPixels=new Uint8Array(width*height);
  const opaqueMask=new Uint8Array(width*height);
  displayPixels.fill(0xFF); // sentinel for transparent; never a display colour

  for(let y=0;y<height;y++){
    for(let x=0;x<width;x++){
      const pixelIndex=y*width+x;
      const byteIndex=x>>>3;
      const bitMask=0x80 >>> (x&7);
      let source=0;
      for(let p=0;p<planes;p++){
        const po=payloadOffset + p*planeBytes + y*rowBytes + byteIndex;
        if(data[po] & bitMask) source |= 1<<p;
      }
      sourcePixels[pixelIndex]=source;

      // Transparency is tested in SOURCE space, before palette remapping.
      if(source===transparentSourceIndex) continue;
      opaqueMask[pixelIndex]=1;
      displayPixels[pixelIndex]=sourceToDisplayIndex(source,planes);
    }
  }

  return {
    index,offset,byteLength,width,height,
    xOrigin:s16(rawXOrigin),yOrigin:s16(rawYOrigin),
    rawXOrigin,rawYOrigin,
    transparentSourceIndex,planes,rowBytes,planeBytes,payloadOffset,
    sourcePixels,displayPixels,opaqueMask
  };
}

function decodeBank(data,{resourceId=null,strict=true}={}){
  if(!data) throw new Error('Race-object resource data is required');
  const frames=[];
  let offset=0;
  while(offset<data.length){
    if(offset+12>data.length){
      if(strict) throw new Error(`Trailing ${data.length-offset} byte(s) after final race-object frame`);
      break;
    }
    const frame=decodeFrame(data,offset,frames.length);
    frames.push(frame);
    offset += frame.byteLength;
  }
  if(strict && offset!==data.length) throw new Error(`Parser ended at $${offset.toString(16)}, resource length is $${data.length.toString(16)}`);
  return {
    resourceId,
    role:resourceId==null?null:(RACE_OBJECT_ROLES[resourceId]||{name:'unresolved',confidence:'unresolved'}),
    byteLength:data.length,
    frameCount:frames.length,
    frames
  };
}

function frameToRgba(frame,paletteRgb){
  if(!frame) return null;
  if(!paletteRgb || paletteRgb.length!==32) throw new Error('32-colour race palette required');
  const rgba=new Uint8ClampedArray(frame.width*frame.height*4);
  for(let i=0;i<frame.displayPixels.length;i++){
    if(!frame.opaqueMask[i]) continue;
    const displayIndex=frame.displayPixels[i];
    const colour=paletteRgb[displayIndex];
    if(!colour) throw new Error(`No race palette entry for display index ${displayIndex}`);
    const o=i*4;
    rgba[o]=colour[0]; rgba[o+1]=colour[1]; rgba[o+2]=colour[2]; rgba[o+3]=255;
  }
  return {width:frame.width,height:frame.height,rgba};
}

function attach(model,{resourceIds=RACE_OBJECT_RESOURCE_IDS}={}){
  if(!model || typeof model.getResource!=='function' || !model.main)
    throw new Error('IndyHeatTools.makeDiskModel() result required');

  const palette=paletteFromMain(model.main);
  const banks={};
  for(const id of resourceIds){
    try{
      const resource=model.getResource(id);
      const bank=decodeBank(resource.data,{resourceId:id,strict:true});
      bank.resource=resource;
      banks[id]=bank;
    }catch(error){
      banks[id]={resourceId:id,role:RACE_OBJECT_ROLES[id]||null,error:String(error && error.message || error),frames:[],frameCount:0};
    }
  }

  const graphics={
    palette,banks,resourceIds:Array.from(resourceIds),roles:RACE_OBJECT_ROLES,
    getBank(id){ return banks[Number(id)] || null; },
    getFrame(id,index){ return banks[Number(id)]?.frames?.[Number(index)] || null; },
    renderFrame(id,index){
      const frame=this.getFrame(id,index);
      return frame ? frameToRgba(frame,palette.rgb) : null;
    }
  };
  model.raceGraphics=graphics;
  return graphics;
}

const api={
  RACE_PALETTE_MAIN_OFFSET,RACE_OBJECT_RESOURCE_IDS,RACE_OBJECT_ROLES,
  be16,s16,amiga12ToRgb,paletteFromMain,sourceToDisplayIndex,
  decodeFrame,decodeBank,frameToRgba,attach
};

if(typeof module!=='undefined' && module.exports) module.exports=api;
root.IndyHeatRaceGraphics=api;
})(typeof globalThis!=='undefined'?globalThis:this);

/*
 * v0.102 companion UI loader.
 *
 * Keep the decoder usable on its own (including Node/tests), while allowing the
 * browser editor to attach the dedicated retail graphics/animation inspector
 * without folding that UI into this binary decoder module.
 */
(function(){
'use strict';
if(typeof document==='undefined')return;
if(document.querySelector('script[data-indyheat-race-graphics-inspector]'))return;
const s=document.createElement('script');
s.src='race-graphics-inspector.js?v=0102';
s.dataset.indyheatRaceGraphicsInspector='1';
s.onerror=()=>console.warn('Indy Heat retail graphics inspector could not be loaded.');
document.head.appendChild(s);
})();
