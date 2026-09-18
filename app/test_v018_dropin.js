'use strict';
const fs=require('fs'),assert=require('assert');

const hook=fs.readFileSync('recovery-hook.js','utf8');
const pkg=fs.readFileSync('circuit-package.js','utf8');

assert(hook.includes("s.src='circuit-package.js'"), 'recovery-hook must load circuit-package.js');
assert(pkg.includes("mapBtn.textContent='Map'"), 'Map editor mode missing');
assert(pkg.includes("miniBtn.textContent='Mini map'"), 'Mini-map editor mode missing');
assert(pkg.includes("hudBtn.textContent='HUD'"), 'HUD editor mode missing');
assert(pkg.includes('renderHudMode'), 'HUD renderer missing');
assert(pkg.includes('hudDrag'), 'HUD drag authoring missing');
assert(pkg.includes("const ARROW_LABELS=Object.freeze(['Frame 0','Frame 1','Frame 2','Frame 3'])"), 'four authentic arrow choices missing');
assert(pkg.includes("currentLapRows:Object.freeze([0,9,18,27])"), 'current-lap HUD offsets missing');
assert(pkg.includes("totalLaps:Object.freeze({x:-4,y:43})"), 'total-laps HUD offset missing');
assert(pkg.includes("timerDigits:Object.freeze([{x:-8,y:47},{x:0,y:47},{x:8,y:47}])"), 'timer HUD offsets missing');
assert(pkg.includes('New blank miniature'), 'mini-map blank action missing');
assert(pkg.includes('setCircuitHidden(true)'), 'auxiliary modes must hide main circuit');
assert(pkg.includes("folder+'preview.bin'"), 'native miniature preview.bin export missing');
assert(pkg.includes("folder+'waypoints.bin'"), 'binary waypoint export missing');
assert(pkg.includes("folder+'race_setup.bin'"), 'race setup export missing');
assert(pkg.includes("folder+'presentation.bin'"), 'presentation export missing');
assert(!pkg.includes("folder+'circuit.json'"), 'runtime package must not contain circuit.json');
assert(!pkg.includes("folder+'waypoints.json'"), 'runtime package must not contain waypoints.json');
assert(pkg.includes('stopImmediatePropagation'), '1-99 lap guard missing');
assert(pkg.includes("Export circuit ZIP"), 'ZIP export control missing');

console.log('Indy Heat v0.18 drop-in integration checks OK');
