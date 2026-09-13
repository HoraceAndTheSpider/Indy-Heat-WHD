'use strict';
const L=require('./layer-tools.js');

function assert(cond,msg){if(!cond)throw new Error(msg);}

{
  const b=new Uint8Array(40*256);
  assert(L.getMaskPixel(b,0,0)===0,'mask starts clear');
  L.setMaskPixel(b,0,0,1);
  L.setMaskPixel(b,7,0,1);
  L.setMaskPixel(b,8,0,1);
  assert(b[0]===0x81&&b[1]===0x80,'1bpp bit packing regression');
  L.setMaskPixel(b,7,0,0);
  assert(b[0]===0x80,'1bpp clear regression');
}

{
  const b=new Uint8Array(40*112);
  L.setSurfaceCell(b,0,0,1);
  L.setSurfaceCell(b,1,0,2);
  L.setSurfaceCell(b,2,0,3);
  L.setSurfaceCell(b,3,0,0);
  assert(b[0]===0x6c,'2bpp high-pair-first packing regression');
  assert(L.getSurfaceCell(b,0,0)===1,'surface read 0');
  assert(L.getSurfaceCell(b,1,0)===2,'surface read 1');
  assert(L.getSurfaceCell(b,2,0)===3,'surface read 2');
  assert(L.getSurfaceCell(b,3,0)===0,'surface read 3');
}

{
  const p=L.linePoints(0,0,3,3);
  assert(JSON.stringify(p)===JSON.stringify([[0,0],[1,1],[2,2],[3,3]]),'line raster regression');
  const r=L.rectanglePoints(1,1,3,2);
  for(const q of [[1,1],[2,1],[3,1],[1,2],[2,2],[3,2]])assert(r.some(x=>x[0]===q[0]&&x[1]===q[1]),'rectangle edge missing');
  const e=L.ellipsePoints(0,0,4,4);
  for(const q of [[2,0],[4,2],[2,4],[0,2]])assert(e.some(x=>x[0]===q[0]&&x[1]===q[1]),'ellipse cardinal point missing');
}


{
  const f=L.filledRectanglePoints(1,1,3,2);
  assert(f.length===6,'filled rectangle area regression');
  for(const q of [[1,1],[2,1],[3,1],[1,2],[2,2],[3,2]])assert(f.some(x=>x[0]===q[0]&&x[1]===q[1]),'filled rectangle missing cell');

  const e=L.filledEllipsePoints(0,0,4,4);
  assert(e.some(x=>x[0]===2&&x[1]===2),'filled ellipse missing centre');
  assert(!e.some(x=>x[0]===0&&x[1]===0),'filled ellipse incorrectly includes corner');

  const square=L.brushOffsets(3,'square');
  assert(square.length===9,'3x3 square brush regression');
  const circle=L.brushOffsets(3,'circle');
  assert(circle.length===5,'3x3 circle brush regression');
  const expanded=L.expandPointsWithBrush([[5,5]],3,'circle');
  assert(expanded.length===5,'brush expansion regression');
}


{
  const p3=L.expandPointsWithBrush([[10,10]],3,'square');
  const h3=L.hatchPoints(p3,(10+10)&1);
  assert(h3.length===5,'3x3 hatch should keep fixed checker frequency');
  assert(h3.some(([x,y])=>x===10&&y===10),'hatch should include stroke origin');

  const p5=L.expandPointsWithBrush([[10,10]],5,'square');
  const h5=L.hatchPoints(p5,(10+10)&1);
  assert(h5.length===13,'5x5 hatch footprint regression');
  assert(h5.every(([x,y])=>((x+y)&1)===0),'hatch frequency/phase regression');
}

{
  const v=Uint8Array.from([
    1,1,0,0,
    1,0,0,2,
    1,1,2,2
  ]);
  const fill=L.floodFillIndices(v,4,3,0,0,3);
  const got=new Set(fill);
  for(const i of [0,1,4,8,9])assert(got.has(i),'flood region missing cell '+i);
  assert(!got.has(2)&&!got.has(7),'flood crossed boundary');
}

console.log('layer editing tools tests OK');
