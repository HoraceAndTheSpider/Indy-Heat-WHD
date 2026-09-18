'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'circuit-package.js'),'utf8');

// Map mode must not make a browser/network fetch. Retail USA is Disk.1 resource $16+$177C.
assert(src.includes('retailMapBobFromModel(resourceModel()||primaryModel())'));
assert(src.includes('EMBEDDED_REGIONAL_MAP_B64'));
assert(!/response\s*=\s*await\s+fetch\s*\(/.test(src));
assert(src.includes('MAP_FRAME_OFFSET=0x177C'));
assert(src.includes('MAP_RESOURCE_ID=0x16'));

// File-level circuit package actions belong in the sticky header next to Open Disk.1 / ADF.
assert(src.includes("top.id='circuitPackageHeader'"));
assert(src.includes('Import circuit ZIP'));
assert(src.includes('Export circuit ZIP'));
assert(src.includes("fileActions.appendChild(openDisk)"));
assert(src.includes("fileActions.appendChild(top)"));

// Right-column mode buttons are first; active mode tools follow immediately below.
assert(src.includes('column.insertBefore(buttons,column.firstElementChild)'));
assert(src.includes("buttons.insertAdjacentElement('afterend',pane)"));
assert(!src.includes('column.insertBefore(pane,column.firstChild?.nextSibling||null)'));

// Auxiliary modes must force one active navigation button only.
assert(src.includes('function setExclusiveModeButton(buttonId)'));
assert(src.includes('clearModeButtons();$(buttonId)?.classList.add(\'active\')'));
assert(src.includes("if(typeof queueMicrotask==='function')queueMicrotask(apply)"));
assert(src.includes("if(typeof requestAnimationFrame==='function')requestAnimationFrame(apply)"));

console.log('Indy Heat v0.19.1 UI/map corrective contract checks OK');
