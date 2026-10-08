(function(root){
'use strict';
const modules=Object.freeze([
    'alternate-curbs.js',
    'bollard.js',
    'footbridge.js',
    'grandstand-people.js',
    'grandstand.js',
    'grass.js',
    'gravel-trap.js',
    'hazard-hatching.js',
    'hud-panels.js',
    'mesh-fence.js',
    'overhead-advert-board.js',
    'parapet-walls.js',
    'pit-wall.js',
    'racing-line.js',
    'random-people.js',
    'rough-track.js',
    'run-off-areas.js',
    'toilet-blocks.js',
    'track-gradients.js',
    'track-markings.js',
    'trees-foliage.js',
    'tyre-wall.js',
    'water.js'
  ]);
root.INDYHEAT_SPECIAL_FUNCTION_MODULES=modules;
if(root.IndyHeatSpecialFunctions?.loadManifest)root.IndyHeatSpecialFunctions.loadManifest(modules);
else root.addEventListener?.('indyheat-special-functions-host-ready',()=>root.IndyHeatSpecialFunctions?.loadManifest(modules),{once:true});
})(typeof globalThis!=='undefined'?globalThis:this);
