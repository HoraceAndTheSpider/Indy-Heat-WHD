'use strict';
const fs=require('fs'),assert=require('assert');
const pkg=fs.readFileSync('circuit-package.js','utf8');
const hook=fs.readFileSync('recovery-hook.js','utf8');

assert(pkg.includes('function readZipStore(bytes)'), 'STORE ZIP parser missing');
assert(pkg.includes('function parseCircuitZip(bytes)'), 'circuit ZIP parser missing');
assert(pkg.includes('Import circuit ZIP'), 'ZIP import control missing');
assert(pkg.includes("option.textContent=`-custom- · ${pkg.folder}`"), '-custom- selector option missing');
assert(pkg.includes("option.dataset.indyheatRetailIndex=String(target)"), 'retail logical-slot overlay missing');
assert(pkg.includes("$('trackSelect')?.addEventListener('change',packageSelectionCapture,true)"), 'package selector capture listener missing');
assert(pkg.includes('captureActivePackage()'), 'package working-state snapshot missing');
assert(pkg.includes('restoreActiveHost()'), 'retail host restoration missing');
assert(pkg.includes('inferTemplateIndex(pkg.circuitIndex,pkg.routeCounts,retailRouteCounts())'), 'template inference missing');
assert(pkg.includes('for(const model of models)'), 'package must apply to every editor model');
assert(pkg.includes('resetPackageSession()'), 'new-Disk package reset missing');
assert(pkg.includes('PACKAGE_RETAIL_REVERT_IDS'), 'imported-package retail Revert protection missing');
assert(pkg.includes('Restore loaded'), 'package-aware miniature baseline wording missing');
assert(!pkg.includes("folder+'circuit.json'"), 'runtime package must not contain circuit.json');
assert(!pkg.includes("folder+'waypoints.json'"), 'runtime package must not contain waypoints.json');

assert(hook.includes('coreModel:null'), 'core app model capture missing');
assert(hook.includes('layerModel:null'), 'layer editor model capture missing');
assert(hook.includes('recordsByMain:new Map()'), 'per-model race record capture missing');
assert(hook.includes('raceCapture.recordsByMain.set(main,records)'), 'per-model record registration missing');

console.log('Indy Heat v0.19 ZIP importer integration checks OK');
