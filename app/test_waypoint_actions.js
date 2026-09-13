'use strict';
const fs=require('fs');
const html=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('waypoint-actions.js','utf8');

for(const needle of [
  '<script src="waypoint-actions.js"></script>',
  'AI Turbo markers',
  'AI Turbo marker (bit 7)',
  'Right-click'
]) if(!html.includes(needle)) throw new Error('Missing waypoint Turbo UI/wiring: '+needle);

for(const needle of [
  "ev.button!==2",
  "addEventListener('pointerdown'",
  "addEventListener('contextmenu'",
  'stopImmediatePropagation',
  'progressFlag:nextFlag',
  'T.writeWaypoint(model.main,p',
  'noteEdit(p)',
  'refreshWaypointModels(addr)',
  'updateWaypointValidation()',
  'updateWaypointEditor()',
  'render()'
]) if(!js.includes(needle)) throw new Error('Missing waypoint right-click behaviour: '+needle);

const layerPos=html.indexOf('<script src="layer-editor.js"></script>');
const actionPos=html.indexOf('<script src="waypoint-actions.js"></script>');
if(layerPos<0||actionPos<layerPos)throw new Error('waypoint-actions.js must load after layer-editor.js');

console.log('Waypoint AI Turbo marker right-click static tests OK');
