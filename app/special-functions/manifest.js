(function(root){
'use strict';
const modules=Object.freeze([
    'alternate-curbs.js',
    'bollard.js',
    'footbridge.js',
    'gravel-trap.js',
    'grass.js',
    'mesh-fence.js',
    'overhead-advert-board.js',
    'parapet-walls.js',
    'pit-wall.js',
    'random-people.js',
    'grandstand-people.js',
    'grandstand.js',
    'racing-line.js',
    'rough-track.js',
    'run-off-areas.js',
    'track-gradients.js',
    'trees-foliage.js',
    'tyre-wall.js',
    'water.js'
  ]);
root.INDYHEAT_SPECIAL_FUNCTION_MODULES=modules;
if(root.IndyHeatSpecialFunctions?.loadManifest)root.IndyHeatSpecialFunctions.loadManifest(modules);
else root.addEventListener?.('indyheat-special-functions-host-ready',()=>root.IndyHeatSpecialFunctions?.loadManifest(modules),{once:true});
})(typeof globalThis!=='undefined'?globalThis:this);
