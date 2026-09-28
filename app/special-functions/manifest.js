(function(root){
'use strict';
const modules=Object.freeze([
    'alternate-curbs.js',
    'gravel-trap.js',
    'pit-wall.js',
    'random-people.js',
    'rough-track.js',
    'water.js'
  ]);
root.INDYHEAT_SPECIAL_FUNCTION_MODULES=modules;
if(root.IndyHeatSpecialFunctions?.loadManifest)root.IndyHeatSpecialFunctions.loadManifest(modules);
else root.addEventListener?.('indyheat-special-functions-host-ready',()=>root.IndyHeatSpecialFunctions?.loadManifest(modules),{once:true});
})(typeof globalThis!=='undefined'?globalThis:this);
