'use strict';
const fs=require('fs');
const html=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('app.js','utf8');
const ids=new Set(Array.from(html.matchAll(/id="([^"]+)"/g),m=>m[1]));
const refs=new Set(Array.from(js.matchAll(/\$\('([^']+)'\)/g),m=>m[1]));
const missing=[...refs].filter(x=>!ids.has(x));
if(missing.length)throw new Error('Missing HTML ids: '+missing.join(', '));
for(const needle of ['id="paletteMode"','Original colour','id="wpLabelMode"','Waypoint ID','id="editorScale"','id="headingDensity"','id="backgroundOpacity"']){
  if(!html.includes(needle))throw new Error('Missing v0.11 UI feature: '+needle);
}
if(/>\s*Display projection\s*</i.test(html))throw new Error('Old Display projection control returned');
if(!js.includes('beginWaypointDrag')||!js.includes("addEventListener('pointerdown'"))throw new Error('Waypoint drag wiring missing');
if(!js.includes('visibleWaypointSetIndices'))throw new Error('Waypoint visibility hit-test gate missing');
for(const needle of ['id="showSequenceGroups"','Sequence groups','<option value="sequence">Sequence</option>','id="sequenceSummary"'])if(!html.includes(needle))throw new Error('Missing sequence UI: '+needle);
if(!js.includes('drawSequenceGroups')||!js.includes('summarizeWaypointSequences'))throw new Error('Sequence overlay/summary wiring missing');
if(!js.includes('waypointAddressMapForSet')||js.includes('function waypointAddressMap()'))throw new Error('Route-local link resolution missing');
if(!js.includes('ONLINE_DISK_URL')||!js.includes('preloadOnlineDisk()'))throw new Error('Online Disk.1 preload wiring missing');
console.log('v0.11 UI static tests OK');
