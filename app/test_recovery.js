'use strict';
const assert=require('assert');
const R=require('./recovery-hook.js');
function near(a,b,eps=1e-10){assert(Math.abs(a-b)<eps,`${a} != ${b}`);}
let d=R.screenVector(0x00);near(d.x,1);near(d.y,0);
d=R.screenVector(0x40);near(d.x,0);near(d.y,-1);
d=R.screenVector(0x80);near(d.x,-1);near(d.y,0);
d=R.screenVector(0xC0);near(d.x,0);near(d.y,1);
assert.strictEqual(R.rotateValue(250,8),2);
assert.strictEqual(R.rotateValue(2,-8),250);
assert.strictEqual(R.rawAngleDegrees(0x40),90);
const cells=new Uint8Array(160*112);
assert.strictEqual(R.cellIntersectsSurfaceClass(cells,3,4,1),false);
cells[(4*4+2)*160+(3*4+1)]=1;
assert.strictEqual(R.cellIntersectsSurfaceClass(cells,3,4,1),true);
assert.deepStrictEqual(R.rectIndices(2,3,3,4),[122,123,162,163]);
console.log('Recovery field helper tests OK');
