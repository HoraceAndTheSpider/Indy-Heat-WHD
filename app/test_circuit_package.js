'use strict';
const assert=require('assert');
const P=require('./circuit-package.js');

assert.equal(P.circuitFolder(0),'circuit_00');
assert.equal(P.circuitFolder(9),'circuit_09');
assert.equal(P.circuitFolder(10),'circuit_10');
assert.equal(P.circuitFolder(99),'circuit_99');
assert.throws(()=>P.circuitFolder(100),/0..99/);
assert.equal(P.stockTrackIdForCircuit(0),1);assert.equal(P.stockTrackIdForCircuit(9),10);assert.equal(P.stockTrackIdForCircuit(10),null);

const main=new Uint8Array(0x800);const o=0x80;
P.wr16(main,o+P.RACE_OFF.lapDisplayX,0xfffc);P.wr16(main,o+P.RACE_OFF.lapDisplayY,0x002b);
P.wr16(main,o+P.RACE_OFF.laps,15);P.wr32(main,o+P.RACE_OFF.previewDescriptor,0x00001400);
P.wr16(main,o+P.RACE_OFF.regionalMarkerX,292);P.wr16(main,o+P.RACE_OFF.regionalMarkerY,20);P.wr16(main,o+P.RACE_OFF.regionalMarkerFrame,0);
let pr=P.readPresentation(main,o);assert.equal(pr.lapDisplayX,-4);assert.equal(pr.lapDisplayY,43);assert.equal(pr.laps,15);assert.equal(pr.previewDescriptor,0x1400);
pr=P.writePresentation(main,o,{laps:99,markerX:300,markerY:18,markerFrame:3});assert.equal(pr.laps,99);assert.throws(()=>P.writePresentation(main,o,{laps:100}),/1..99/);

const pb=P.encodePresentationBin({mapId:4,presentation:{markerX:300,markerY:18,markerFrame:2,lapDisplayX:-4,lapDisplayY:43}});
assert.equal(pb.length,0x14);assert.equal(Buffer.from(pb.slice(0,4)).toString(),'IHPR');assert.equal(P.PRESENTATION_VERSION,2);
const pd=P.decodePresentationBin(pb);assert.equal(pd.mapId,4);assert.equal(pd.markerX,300);assert.equal(pd.lapDisplayX,-4);assert(!Object.prototype.hasOwnProperty.call(pd,'previewRaw'));

// Exact native miniature circuit BOB: 78x51, origin 40/32, transparent 0, 5 planes, $0A02 bytes.
const pixels=new Uint8Array(P.PREVIEW_WIDTH*P.PREVIEW_HEIGHT);pixels[0]=1;pixels[1]=31;pixels[77]=7;pixels[78*50+77]=16;
const preview=P.encodePreviewPixels(pixels);assert.equal(preview.length,0x0a02);const ph=P.validatePreviewBob(preview);assert.equal(ph.width,78);assert.equal(ph.height,51);assert.equal(ph.xOrigin,40);assert.equal(ph.yOrigin,32);
assert.deepEqual(Array.from(P.decodePreviewBob(preview).pixels),Array.from(pixels));

// Synthetic race+$46 descriptor -> resource table entry+2 resolution.
const modelMain=new Uint8Array(0x1000);const record={offset:0x100};const tableOffset=0x500,resourceId=0x1b,descriptorRuntime=0x1400,descriptorOff=descriptorRuntime-0x1000;
P.wr32(modelMain,record.offset+P.RACE_OFF.previewDescriptor,descriptorRuntime);P.wr32(modelMain,descriptorOff+6,0x1000+tableOffset+resourceId*22+2);
const fakeModel={main:modelMain,resourceTableOffset:tableOffset,getResource:id=>{assert.equal(id,resourceId);return {id,data:preview};}};
const resolved=P.resolvePreviewResource(fakeModel,record);assert.equal(resolved.resourceId,0x1b);assert.equal(resolved.resource.data.length,0x0a02);

const waypointMain=new Uint8Array(0x300);for(let i=0;i<54;i++)waypointMain[0x100+i]=i;
const route=(index,base)=>({index,points:[0,1].map(n=>({fileOffset:base+n*6,storedBytes:waypointMain.slice(base+n*6,base+n*6+6)})),boundaryPoint:{fileOffset:base+12,storedBytes:waypointMain.slice(base+12,base+18)}});
const waypointRecord={waypointDescriptors:[route(0,0x100),route(1,0x112),route(2,0x124)]};
const wb=P.encodeWaypointsBin(waypointRecord,waypointMain),wd=P.decodeWaypointsBin(wb);assert.equal(Buffer.from(wb.slice(0,4)).toString(),'IHWP');assert.equal(wd.length,3);assert.equal(wd[0].points.length,2);assert.equal(wd[0].boundaryBytes.length,6);

// v0.19.1: added regional maps are embedded; retail map 0 is extracted from Disk.1 resource $16 + $177C.
for(let i=1;i<=7;i++){const b=P.embeddedRegionalMapBytes(i);assert.equal(P.validateMapBob(b).byteLength,0x093a);}
const fakeRetailResource=new Uint8Array(P.MAP_FRAME_OFFSET+P.MAP_BOB_SIZE);const validMapFixture=P.embeddedRegionalMapBytes(1);fakeRetailResource.set(validMapFixture,P.MAP_FRAME_OFFSET);
const retailMap=P.retailMapBobFromModel({getResource:id=>{assert.equal(id,P.MAP_RESOURCE_ID);return {data:fakeRetailResource};}});assert.deepEqual(Array.from(retailMap),Array.from(validMapFixture));

const files=P.makePackageFiles({circuitIndex:12,resources:{background:new Uint8Array(0xc800),foreground:new Uint8Array(0x2800),surface:new Uint8Array(0x1180),recovery:new Uint8Array(0x460)},previewBin:preview,waypointsBin:wb,raceSetupBin:new Uint8Array(0x68),presentationBin:pb});
const names=files.map(f=>f.name);assert.deepEqual(names.sort(),['circuit_12/background.bin','circuit_12/foreground.bin','circuit_12/presentation.bin','circuit_12/preview.bin','circuit_12/race_setup.bin','circuit_12/recovery.bin','circuit_12/surface.bin','circuit_12/waypoints.bin'].sort());
assert(!names.some(n=>n.endsWith('.json')));const zip=P.zipStore(files);assert(Buffer.from(zip).includes(Buffer.from('circuit_12/preview.bin')));assert(!Buffer.from(zip).includes(Buffer.from('.json')));
console.log('Indy Heat circuit-package v0.19.2 binary package / preview / map tests OK');

// v0.19 package round-trip: the editor's own STORE ZIP must parse back to the
// same binary-only circuit payload without an editor metadata file.
const parsedZip=P.parseCircuitZip(zip);
assert.equal(parsedZip.circuitIndex,12);
assert.equal(parsedZip.folder,'circuit_12');
assert.equal(parsedZip.resources.background.length,0xc800);
assert.equal(parsedZip.resources.foreground.length,0x2800);
assert.equal(parsedZip.previewBin.length,0x0a02);
assert.equal(parsedZip.raceSetupBin.length,0x68);
assert.equal(parsedZip.presentation.mapId,4);
assert.deepEqual(parsedZip.routeCounts,[2,2,2]);
assert.deepEqual(Array.from(parsedZip.waypointRoutes[0].points[0]),Array.from(wd[0].points[0]));

// circuit_00..09 are fixed retail slots; circuit_10+ selects the one retail
// structural template whose three route counts match the imported package.
const retailCounts=[[46,46,45],[55,61,49],[56,67,47],[63,67,66],[76,77,53],[68,70,54],[71,77,71],[77,73,71],[49,46,42],[82,80,77]];
assert.equal(P.inferTemplateIndex(0,[46,46,45],retailCounts),0);
assert.equal(P.inferTemplateIndex(3,[46,46,45],retailCounts),0); // folder number is independent of source template
assert.equal(P.inferTemplateIndex(9,[82,80,77],retailCounts),9);
assert.equal(P.inferTemplateIndex(12,[68,70,54],retailCounts),5);
assert.throws(()=>P.inferTemplateIndex(12,[1,2,3],retailCounts),/does not match any retail template/);

console.log('Indy Heat circuit-package v0.19 ZIP importer round-trip tests OK');
