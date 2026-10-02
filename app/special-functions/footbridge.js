(function(root){
'use strict';

/* Footbridge Special Function v0.1.20
 *
 * Accepted cuboid geometry plus optional supports and first stair style.
 * Direct stairs attach to the two lower corners at each bridge end, run
 * directly away along the bridge axis and share the Leg height ground datum.
 * Later passes can add alternative stair arrangements and top variants.
 */
const S=root.IndyHeatSpecialFunctions;if(!S?.register)return;

const VERSION='0.1.20';
const MASK_FOREGROUND=0;
const MASK_BACKGROUND=1;

const settings={
  family:'red',
  endStyle:'straight',
  bodyWidth:7,
  bodyDepth:6,
  legStyle:'straight',
  legHeight:10,
  frontStairs:'none',
  rearStairs:'none',
  stairBack:'solid',
  stairSides:'none'
};

const FAMILY_OPTIONS=Object.freeze([
  Object.freeze({value:'red',label:'Red'}),
  Object.freeze({value:'yellow',label:'Yellow'}),
  Object.freeze({value:'green',label:'Green'}),
  Object.freeze({value:'blue',label:'Blue'}),
  Object.freeze({value:'orange',label:'Orange'}),
  Object.freeze({value:'grey',label:'Grey'})
]);
const END_OPTIONS=Object.freeze([
  Object.freeze({value:'straight',label:'Straight'}),
  Object.freeze({value:'angled',label:'Angled'})
]);
const END_STAIR_OPTIONS=Object.freeze([
  Object.freeze({value:'none',label:'None'}),
  Object.freeze({value:'left',label:'Direct Left'}),
  Object.freeze({value:'centre',label:'Direct Centre'}),
  Object.freeze({value:'right',label:'Direct Right'})
]);
const STAIR_BACK_OPTIONS=Object.freeze([
  Object.freeze({value:'solid',label:'Solid'}),
  Object.freeze({value:'open',label:'Open'})
]);
const STAIR_SIDE_OPTIONS=Object.freeze([
  Object.freeze({value:'none',label:'None'}),
  Object.freeze({value:'solid',label:'Solid'})
]);

const FAMILY_MAP=Object.freeze({
  red:Object.freeze({main:29,light:31,dark:28,soft:30}),
  yellow:Object.freeze({main:23,light:11,dark:22,soft:21}),
  green:Object.freeze({main:25,light:27,dark:24,soft:26}),
  blue:Object.freeze({main:14,light:16,dark:12,soft:15}),
  orange:Object.freeze({main:9,light:10,dark:20,soft:22}),
  grey:Object.freeze({main:6,light:7,dark:4,soft:5})
});

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function inBounds(w,h,x,y){return x>=0&&y>=0&&x<w&&y<h;}
function validIndex(ctx,index){return ctx.helpers.validIndex(Number(index)||0);}
function familyDef(){return FAMILY_MAP[settings.family]||FAMILY_MAP.red;}
function familyColour(role){const f=familyDef();return f[role]??f.main;}
function add(a,b){return {x:a.x+b.x,y:a.y+b.y};}
function sub(a,b){return {x:a.x-b.x,y:a.y-b.y};}
function mul(a,s){return {x:a.x*s,y:a.y*s};}
function roundPoint(p){return {x:Math.round(Number(p.x)||0),y:Math.round(Number(p.y)||0)};}
function canonicalEndpoints(p0,p1){
  p0=roundPoint(p0);p1=roundPoint(p1);
  return (p0.x<p1.x||(p0.x===p1.x&&p0.y<=p1.y))?[p0,p1]:[p1,p0];
}
function setBackdrop(ctx,layer,x,y,index){
  x=Math.round(x);y=Math.round(y);
  if(!inBounds(ctx.width,ctx.height,x,y))return false;
  layer[y*ctx.width+x]=validIndex(ctx,index);return true;
}
function drawLinePoints(a,b){
  a=roundPoint(a);b=roundPoint(b);
  let x0=a.x,y0=a.y,x1=b.x,y1=b.y;
  const dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1;
  let err=dx+dy;const pts=[];
  while(true){
    pts.push({x:x0,y:y0});
    if(x0===x1&&y0===y1)break;
    const e2=2*err;
    if(e2>=dy){err+=dy;x0+=sx;}
    if(e2<=dx){err+=dx;y0+=sy;}
  }
  return pts;
}
function fullSupercoverLinePoints(a,b,poly){
  /*
   * Facing-edge-only raster fix.
   *
   * Keep the v0.1.6 cuboid/entrance geometry unchanged.  The old supercover
   * inserted BOTH orthogonal corner pixels for every diagonal Bresenham move,
   * which occasionally produced a visually doubled step.  Insert only the
   * corner that lies inside the side face, giving a continuous 4-connected
   * staircase with no >1-pixel drop.
   */
  const line=drawLinePoints(a,b),out=[],seen=new Set(),centre=poly?polygonCentroid(poly):null;
  const addPoint=p=>{
    const x=Math.round(p.x),y=Math.round(p.y),k=`${x},${y}`;
    if(seen.has(k))return;
    seen.add(k);out.push({x,y});
  };
  for(let i=0;i<line.length;i++){
    const p=line[i];
    if(i>0){
      const q=line[i-1];
      if(p.x!==q.x&&p.y!==q.y){
        const candidates=[{x:p.x,y:q.y},{x:q.x,y:p.y}];
        let chosen=null;
        if(poly){
          for(const c of candidates){
            if(pointInPoly(c.x+.5,c.y+.5,poly)){chosen=c;break;}
          }
        }
        if(!chosen&&centre){
          const d0=(candidates[0].x-centre.x)**2+(candidates[0].y-centre.y)**2;
          const d1=(candidates[1].x-centre.x)**2+(candidates[1].y-centre.y)**2;
          chosen=d0<=d1?candidates[0]:candidates[1];
        }
        addPoint(chosen||candidates[0]);
      }
    }
    addPoint(p);
  }
  return out;
}
function pointInPoly(px,py,poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j];
    const hit=((a.y>py)!==(b.y>py))&&(px<(b.x-a.x)*(py-a.y)/((b.y-a.y)||1e-9)+a.x);
    if(hit)inside=!inside;
  }
  return inside;
}
function fillPolygon(poly,cb){
  const xs=poly.map(p=>p.x),ys=poly.map(p=>p.y);
  const x0=Math.floor(Math.min(...xs)),x1=Math.ceil(Math.max(...xs));
  const y0=Math.floor(Math.min(...ys)),y1=Math.ceil(Math.max(...ys));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(pointInPoly(x+.5,y+.5,poly))cb(x,y);
}
function paintPoly(ctx,backdrop,poly,index){let n=0;fillPolygon(poly,(x,y)=>{if(setBackdrop(ctx,backdrop,x,y,index))n++;});return n;}
function paintLine(ctx,backdrop,a,b,index){let n=0;for(const p of drawLinePoints(a,b))if(setBackdrop(ctx,backdrop,p.x,p.y,index))n++;return n;}
function addMaskPixel(set,ctx,x,y){x=Math.round(x);y=Math.round(y);if(inBounds(ctx.width,ctx.height,x,y))set.add(y*ctx.width+x);}
function addPolyToSet(set,ctx,poly){fillPolygon(poly,(x,y)=>addMaskPixel(set,ctx,x,y));}
function addLineToSet(set,ctx,a,b){for(const p of drawLinePoints(a,b))addMaskPixel(set,ctx,p.x,p.y);}

/* Cuboid construction.
 *
 * Follow the literal construction sequence used in the reference sketch:
 *   1. the user line supplies the two end centres;
 *   2. construct one complete end section at each endpoint;
 *   3. join corresponding corners directly;
 *   4. fill the resulting top / facing-side / end faces.
 *
 * There is deliberately no separate angled "cap".  Straight and Angled use
 * the same body construction; only the end-section top vector differs.
 */
// Faux-perspective projection for deck width.  Horizontal screen movement is
// uncompressed; vertical screen movement is foreshortened.  Therefore the
// selected Body width is fully visible at 12 o'clock and progressively
// reduces as the bridge turns towards 3/9 o'clock instead of becoming too
// visually thick on diagonal/horizontal crossings.
const WIDTH_Y_SCALE=0.50;
function projectedWidthVector(u,width){
  return {x:-u.y*width,y:u.x*width*WIDTH_Y_SCALE};
}
function projectedWidthLength(u,width){
  const v=projectedWidthVector(u,width);
  return Math.hypot(v.x,v.y);
}
function quantizedSegmentAroundCentre(center,vx,vy){
  /*
   * Pixel-stable projected end width.
   *
   * The old symmetric +/- half-vector rounding can move BOTH sides inward on
   * the same threshold, so an entrance suddenly loses 2 pixels.  Quantise the
   * complete screen-space vector first, then centre that integer vector.  Odd
   * spans are intentionally biased by half a pixel so only one side moves at
   * each threshold; the next threshold moves the opposite side.
   */
  const qx=Math.sign(vx||1)*Math.round(Math.abs(vx));
  const qy=Math.sign(vy||1)*Math.round(Math.abs(vy));
  const p0={
    x:Math.floor(center.x-qx/2),
    y:Math.floor(center.y-qy/2)
  };
  return [p0,{x:p0.x+qx,y:p0.y+qy}];
}
function straightEnd(center,width,depth,u){
  // Straight remains screen-horizontal; only its projected pixel span is
  // quantised one pixel at a time.
  const projected=projectedWidthLength(u,width);
  const [p0,p1]=quantizedSegmentAroundCentre(center,projected,0);
  const down={x:0,y:depth};
  return [p0,p1,add(p1,down),add(p0,down)];
}
function angledEnd(center,width,depth,u){
  /* Angled uses the actual projected 90-degree width vector.  Its x/y
     components change with heading while the pseudo-perspective vertical
     component is compressed by WIDTH_Y_SCALE. */
  let {x:wx,y:wy}=projectedWidthVector(u,width);

  // At exact 3/9 o'clock the projected width is vertical and would become
  // parallel to the screen-down depth.  Retain a one-pixel horizontal lean
  // purely to keep the end face visible; preserve the projected length.
  if(Math.abs(wx)<1){
    const target=Math.max(1,Math.hypot(wx,wy));
    const sign=wx<0?-1:wx>0?1:(u.x>=0?-1:1);
    wx=sign*Math.min(1,target);
    const remain=Math.max(0,target*target-wx*wx);
    wy=(wy<0?-1:1)*Math.sqrt(remain);
  }

  const [p0,p1]=quantizedSegmentAroundCentre(center,wx,wy);
  const down={x:0,y:depth};
  return [p0,p1,add(p1,down),add(p0,down)];
}
function nearSideSign(u){
  // Same facing-side choice for both end styles.  This is based only on the
  // line heading, so Angled cannot change/rotate the main body independently.
  const cross={x:1,y:0};
  let down={x:-u.y,y:u.x};
  if(down.y<0||(Math.abs(down.y)<1e-9&&down.x<0))down=mul(down,-1);
  return (cross.x*down.x)>=0?1:-1;
}
function bridgeGeometry(g){
  if(!g?.start||!g?.end)return null;
  const [a,b]=canonicalEndpoints(g.start,g.end),d=sub(b,a),len=Math.hypot(d.x,d.y);
  if(len<4)return null;
  const u={x:d.x/len,y:d.y/len};
  const width=clamp(Math.round(Number(settings.bodyWidth)||7),6,18);
  const depth=clamp(Math.round(Number(settings.bodyDepth)||6),6,10);
  const nearSign=nearSideSign(u);

  const makeEnd=settings.endStyle==='angled'?angledEnd:straightEnd;
  const projectedWidth=projectedWidthLength(u,width);
  const endA=makeEnd(a,width,depth,u),endB=makeEnd(b,width,depth,u);
  const [a0,a1,a2,a3]=endA,[b0,b1,b2,b3]=endB;

  // Direct corner-to-corner joins.  These are the only body faces.
  const top=[a0,b0,b1,a1];
  const sidePositive=[a1,b1,b2,a2],sideNegative=[a0,b0,b3,a3];
  const side=settings.endStyle==='angled'?sidePositive:(nearSign>0?sidePositive:sideNegative);
  const facingLowerIndex=(side===sidePositive)?2:3;
  const sideBottomEdge=facingLowerIndex===2?[a2,b2]:[a3,b3];
  const rearBottomEdge=facingLowerIndex===2?[a3,b3]:[a2,b2];

  // Screen Y is perspective depth: only the larger-Y endpoint exposes the
  // dark opening.  The far/top end is solid body.
  const nearIsA=a.y>b.y || (a.y===b.y && a.x>b.x);
  const nearEnd=nearIsA?endA:endB,farEnd=nearIsA?endB:endA;

  return {
    a,b,u,len,width,projectedWidth,depth,nearSign,
    endA,endB,a0,a1,a2,a3,b0,b1,b2,b3,
    top,side,sideBottomEdge,rearBottomEdge,facingLowerIndex,nearEnd,farEnd,
    nearPoint:nearIsA?a:b,farPoint:nearIsA?b:a
  };
}

function paintEndDetail(ctx,backdrop,poly){
  const light=familyColour('soft'),dark=familyColour('dark');
  let n=0;
  // A dark end/opening with two restrained inner/body-colour edges.  This is
  // deliberately simple so later open-top variants can replace the end logic.
  n+=paintLine(ctx,backdrop,poly[0],poly[1],light);
  n+=paintLine(ctx,backdrop,poly[1],poly[2],dark);
  return n;
}
function polygonCentroid(poly){
  let x=0,y=0;for(const p of poly){x+=p.x;y+=p.y;}return {x:x/poly.length,y:y/poly.length};
}
function edgeSealPoints(a,b,poly){
  /* Bresenham supplies the visible edge.  On a diagonal step there are two
     orthogonal corner candidates; add only the candidate that lies on the
     *inside* of this face.  v0.1.4 added both and therefore created the small
     outward protrusions. */
  const line=drawLinePoints(a,b),out=[],seen=new Set(),centre=polygonCentroid(poly);
  const addPoint=(p)=>{const x=Math.round(p.x),y=Math.round(p.y),k=`${x},${y}`;if(seen.has(k))return;seen.add(k);out.push({x,y});};
  for(let i=0;i<line.length;i++){
    const p=line[i];addPoint(p);
    if(i===0)continue;
    const q=line[i-1];
    if(p.x===q.x||p.y===q.y)continue;
    const candidates=[{x:p.x,y:q.y},{x:q.x,y:p.y}];
    let chosen=null;
    for(const c of candidates){
      if(pointInPoly(c.x+.5,c.y+.5,poly)){chosen=c;break;}
    }
    if(!chosen){
      // Boundary/tie: choose the corner nearer the face centre, never both.
      const d0=(candidates[0].x-centre.x)**2+(candidates[0].y-centre.y)**2;
      const d1=(candidates[1].x-centre.x)**2+(candidates[1].y-centre.y)**2;
      chosen=d0<=d1?candidates[0]:candidates[1];
    }
    addPoint(chosen);
  }
  return out;
}
function paintConvexFace(ctx,backdrop,poly,fillIndex,edgeIndex=fillIndex){
  /* Inclusive scanline fill for these convex quadrilaterals.  First fill all
     pixel-centres inside the face, then seal each staircase boundary inward.
     This guarantees the Straight and Angled bodies use the identical raster
     rule and avoids the transparent lower-edge pinholes. */
  let n=0;
  const xs=poly.map(p=>p.x),ys=poly.map(p=>p.y);
  const y0=Math.floor(Math.min(...ys)),y1=Math.ceil(Math.max(...ys));
  for(let y=y0;y<=y1;y++){
    const sy=y+.5,hits=[];
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const a=poly[j],b=poly[i];
      if((a.y>sy)===(b.y>sy))continue;
      hits.push(a.x+(sy-a.y)*(b.x-a.x)/((b.y-a.y)||1e-9));
    }
    hits.sort((a,b)=>a-b);
    for(let h=0;h+1<hits.length;h+=2){
      const x0=Math.ceil(hits[h]-.5),x1=Math.floor(hits[h+1]-.5);
      for(let x=x0;x<=x1;x++)if(setBackdrop(ctx,backdrop,x,y,fillIndex))n++;
    }
  }
  for(let i=0;i<poly.length;i++)for(const p of edgeSealPoints(poly[i],poly[(i+1)%poly.length],poly))if(setBackdrop(ctx,backdrop,p.x,p.y,edgeIndex))n++;
  return n;
}


function pixelCellTouchesPoly(x,y,poly){
  // Boundary-aware face coverage.  The normal centre-point scanline fill is
  // ideal for interiors but can leave a one-pixel staircase gap where a
  // shallow lower edge only clips a cell.  Sample the pixel cell itself so
  // any genuinely covered boundary cell is included without changing the
  // cuboid geometry.
  const samples=[
    [x+.25,y+.25],[x+.75,y+.25],[x+.25,y+.75],[x+.75,y+.75],[x+.5,y+.5]
  ];
  for(const [sx,sy] of samples)if(pointInPoly(sx,sy,poly))return true;
  // Also include a cell when one of the polygon edges runs through it.
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length];
    for(const p of drawLinePoints(a,b))if(p.x===x&&p.y===y)return true;
  }
  return false;
}
function paintCoveredFace(ctx,backdrop,poly,index){
  let n=0;
  const xs=poly.map(p=>p.x),ys=poly.map(p=>p.y);
  const x0=Math.floor(Math.min(...xs))-1,x1=Math.ceil(Math.max(...xs))+1;
  const y0=Math.floor(Math.min(...ys))-1,y1=Math.ceil(Math.max(...ys))+1;
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    if(!pixelCellTouchesPoly(x,y,poly))continue;
    if(setBackdrop(ctx,backdrop,x,y,index))n++;
  }
  return n;
}


function bridgeLegGeometry(geo){
  if(settings.legStyle==='none')return [];
  const base=clamp(Math.round(Number(settings.legHeight)||10),6,22);
  // The facing-side supports sit slightly lower than the rear pair to give a
  // simple Indy Heat-style perspective cue.  Scale the difference gently with
  // the body depth so it remains visible without becoming exaggerated.
  const perspectiveDrop=clamp(Math.round(geo.depth/3),2,3);
  const legs=[];

  const makePair=(endName,p0,p1,facingIndex)=>{
    const centre={x:(p0.x+p1.x)/2,y:(p0.y+p1.y)/2};
    const anchors=[p0,p1];
    for(let i=0;i<2;i++){
      const anchor=anchors[i];
      const facing=(i===facingIndex);
      const length=base+(facing?perspectiveDrop:0);
      // Straight drops vertically from the cuboid corner.  Angled preserves
      // the slight outward lean introduced in v0.1.11.
      let lean=0;
      if(settings.legStyle==='angled'){
        let outward=Math.sign(anchor.x-centre.x);
        if(!outward)outward=i===0?-1:1;
        lean=Math.min(2,Math.max(1,Math.round(length/12)))*outward;
      }
      const foot={x:anchor.x+lean,y:anchor.y+length};
      legs.push({endName,index:i,anchor,foot,facing,length});
    }
  };

  // end arrays are [top0, top1, lower1, lower0].  Therefore lower corner 0
  // below corresponds to index 3 in the end polygon and lower corner 1 to 2.
  // Pass them left-to-right in polygon order as [lower0, lower1].
  const facingPairIndex=geo.facingLowerIndex===3?0:1;
  makePair('A',geo.a3,geo.a2,facingPairIndex);
  makePair('B',geo.b3,geo.b2,facingPairIndex);
  return legs;
}
function paintLegs(ctx,backdrop,legs,facing){
  const colour=familyColour('dark');
  let n=0;
  for(const leg of legs){
    if(leg.facing!==facing)continue;
    n+=paintLine(ctx,backdrop,leg.anchor,leg.foot,colour);
  }
  return n;
}
function addLegsToMask(ctx,mask,legs,bodyPixels){
  const facing=new Set(),rear=new Set();
  for(const leg of legs){
    const target=leg.facing?facing:rear;
    for(const p of drawLinePoints(leg.anchor,leg.foot))addMaskPixel(target,ctx,p.x,p.y);
  }

  let changed=0,facingWritten=0,rearWritten=0;

  // The cuboid owns every overlap pixel.  In particular, rear/background
  // supports must never overwrite the body mask where the leg passes behind
  // the bridge.
  for(const i of facing){
    if(bodyPixels&&bodyPixels.has(i))continue;
    if(mask[i]!==MASK_FOREGROUND)changed++;
    mask[i]=MASK_FOREGROUND;
    facingWritten++;
  }
  for(const i of rear){
    if(bodyPixels&&bodyPixels.has(i))continue;
    if(mask[i]!==MASK_BACKGROUND)changed++;
    mask[i]=MASK_BACKGROUND;
    rearWritten++;
  }

  return {facingWritten,rearWritten,changed};
}


function stairPerspectiveDrop(geo){
  return clamp(Math.round(geo.depth/3),2,3);
}
function stairRunLength(geo){
  const h=clamp(Math.round(Number(settings.legHeight)||10),6,22);
  return Math.max(6,Math.round(h*.9));
}
function stairTopWidth(endPoly){
  // Direct stairs remain screen-straight.
  const p0=endPoly[3],p1=endPoly[2];
  return Math.max(2,Math.round(Math.hypot(p1.x-p0.x,p1.y-p0.y)));
}
function endPairIndexForScreenSide(endPoly,sideName){
  const pair0MidX=(endPoly[0].x+endPoly[3].x)/2;
  const pair1MidX=(endPoly[1].x+endPoly[2].x)/2;
  const leftPair=pair0MidX<=pair1MidX?0:1;
  return sideName==='left'?leftPair:1-leftPair;
}
function visiblePairIndex(geo){
  return geo.facingLowerIndex===3?0:1;
}
function sideDoorGeometry(geo,endName,endPoly,sideName){
  const pair=endPairIndexForScreenSide(endPoly,sideName);
  const other=endName==='A'?geo.endB:geo.endA;

  const topIndex=pair===0?0:1;
  const lowerIndex=pair===0?3:2;
  const endTop=endPoly[topIndex],endBottom=endPoly[lowerIndex];
  const otherTop=other[topIndex],otherBottom=other[lowerIndex];

  // Side doorway width follows the stair/bridge width rather than using the
  // narrower v0.1.19 cut-out.  This gives the angled side stair a clean,
  // unobscured attachment.
  const spanPx=clamp(stairTopWidth(endPoly),3,18);
  const t=Math.min(.45,spanPx/Math.max(1,geo.len));
  const innerTop=lerp(endTop,otherTop,t);
  const innerBottom=lerp(endBottom,otherBottom,t);

  return {
    pair,sideName,
    visible:pair===visiblePairIndex(geo),
    poly:[endTop,innerTop,innerBottom,endBottom],
    lower0:endBottom,lower1:innerBottom,
    centre:{
      x:(endBottom.x+innerBottom.x)/2,
      y:(endBottom.y+innerBottom.y)/2
    }
  };
}
function makeCentreStair(geo,endName,endPoly,isNearEnd){
  const baseHeight=clamp(Math.round(Number(settings.legHeight)||10),6,22);
  const perspectiveDrop=stairPerspectiveDrop(geo);
  const run=stairRunLength(geo);

  const e0=endPoly[3],e1=endPoly[2];
  const centre={x:(e0.x+e1.x)/2,y:Math.max(e0.y,e1.y)};
  const width=stairTopWidth(endPoly);
  const half=width/2;
  const top0={x:centre.x-half,y:centre.y};
  const top1={x:centre.x+half,y:centre.y};

  const outward=endName==='A'?mul(geo.u,-1):geo.u;
  const runVec=mul(outward,run);
  const groundDrop=baseHeight+perspectiveDrop;
  const groundCentre={
    x:centre.x+runVec.x,
    y:centre.y+runVec.y+groundDrop
  };
  const ground0={x:groundCentre.x-half,y:groundCentre.y};
  const ground1={x:groundCentre.x+half,y:groundCentre.y};

  const poly=[top0,top1,ground1,ground0];
  const verticalTravel=Math.max(1,Math.abs(groundCentre.y-centre.y));
  return {
    endName,isNearEnd,mode:'centre',sideName:null,sideVisible:true,
    paintFront:isNearEnd,maskValue:isNearEnd?MASK_FOREGROUND:MASK_BACKGROUND,
    top0,top1,ground0,ground1,poly,centre,run,verticalTravel
  };
}
function makeSideStair(geo,endName,endPoly,isNearEnd,sideName){
  const baseHeight=clamp(Math.round(Number(settings.legHeight)||10),6,22);
  const perspectiveDrop=stairPerspectiveDrop(geo);
  const run=stairRunLength(geo);
  const door=sideDoorGeometry(geo,endName,endPoly,sideName);

  /*
   * Direct Left/Right is still a sideways stair run, but unlike Direct Centre
   * its tread lines follow the bridge's long axis.  Use the relocated
   * doorway's lower edge directly as the first tread/attachment, then repeat
   * that same vector at the ground end.  This avoids a horizontal stair
   * fighting a diagonal cuboid.
   */
  const top0={x:door.lower0.x,y:door.lower0.y};
  const top1={x:door.lower1.x,y:door.lower1.y};
  const treadVec={x:top1.x-top0.x,y:top1.y-top0.y};
  const centre={x:(top0.x+top1.x)/2,y:(top0.y+top1.y)/2};

  const xDir=sideName==='left'?-1:1;
  const groundDrop=baseHeight+perspectiveDrop;
  const groundCentre={x:centre.x+xDir*run,y:centre.y+groundDrop};
  const ground0={x:groundCentre.x-treadVec.x/2,y:groundCentre.y-treadVec.y/2};
  const ground1={x:groundCentre.x+treadVec.x/2,y:groundCentre.y+treadVec.y/2};

  const poly=[top0,top1,ground1,ground0];
  const verticalTravel=Math.max(1,Math.abs(groundCentre.y-centre.y));

  // A front stair on the visible side is foreground.  A front stair on the
  // hidden side belongs behind the bridge.  Rear stairs remain background.
  const paintFront=isNearEnd&&door.visible;
  return {
    endName,isNearEnd,mode:sideName,sideName,sideVisible:door.visible,door,
    paintFront,maskValue:paintFront?MASK_FOREGROUND:MASK_BACKGROUND,
    top0,top1,ground0,ground1,poly,centre,run,verticalTravel
  };
}
function stairForEnd(geo,endName,endPoly,isNearEnd,mode){
  if(mode==='none')return null;
  if(mode==='centre')return makeCentreStair(geo,endName,endPoly,isNearEnd);
  return makeSideStair(geo,endName,endPoly,isNearEnd,mode);
}
function bridgeStairGeometry(geo){
  const nearIsA=geo.nearPoint.x===geo.a.x&&geo.nearPoint.y===geo.a.y;
  const frontEndName=nearIsA?'A':'B',rearEndName=nearIsA?'B':'A';
  const frontPoly=nearIsA?geo.endA:geo.endB;
  const rearPoly=nearIsA?geo.endB:geo.endA;

  const out=[];
  const front=stairForEnd(geo,frontEndName,frontPoly,true,settings.frontStairs);
  const rear=stairForEnd(geo,rearEndName,rearPoly,false,settings.rearStairs);
  if(front)out.push(front);
  if(rear)out.push(rear);
  return out;
}

function lerp(a,b,t){return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
function stairCrossLine(stair,t){
  // Centre stairs remain horizontal.  Side stairs preserve the vector of the
  // relocated side-door lower edge, so every tread is parallel to the
  // cuboid's long axis.
  return [lerp(stair.top0,stair.ground0,t),lerp(stair.top1,stair.ground1,t)];
}
function stairTreadFractions(stair){
  /*
   * Treads are locked to screen-space rhythm: one tread every 2 vertical
   * pixels, regardless of bridge length/angle.  Increasing Leg height simply
   * adds more steps; it never stretches the spacing between them.
   */
  const travel=Math.max(1,Number(stair.verticalTravel)||1);
  const out=[];
  for(let y=2;y<=travel+0.001;y+=2)out.push(Math.min(1,y/travel));
  if(!out.length||out[out.length-1]<1)out.push(1);
  return out;
}
function stairSidePanel(stair,left){
  const a=left?stair.top0:stair.top1;
  const b=left?stair.ground0:stair.ground1;
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;

  // Side panels sit INSIDE the stair footprint.  Do not add pixels beyond
  // the bridge/stair width.
  const sign=left?1:-1;
  const ox=sign*Math.max(1,Math.round(Math.abs(dy)/len));
  const oy=0;
  return [a,b,{x:b.x+ox,y:b.y+oy},{x:a.x+ox,y:a.y+oy}];
}
function paintStairSidePanels(ctx,backdrop,stair){
  if(settings.stairSides!=='solid')return 0;
  const main=familyColour('main'),dark=familyColour('dark'),light=familyColour('light');
  let n=0;
  for(const [panel,left] of [[stairSidePanel(stair,true),true],[stairSidePanel(stair,false),false]]){
    n+=paintCoveredFace(ctx,backdrop,panel,main);
    // Dark outside edge, lighter inside/top attachment detail.
    const outside=left?[panel[3],panel[2]]:[panel[0],panel[1]];
    const inside=left?[panel[0],panel[1]]:[panel[3],panel[2]];
    n+=paintLine(ctx,backdrop,outside[0],outside[1],dark);
    n+=paintLine(ctx,backdrop,inside[0],inside[1],light);
  }
  return n;
}
function paintStairEdges(ctx,backdrop,stair){
  const dark=familyColour('dark'),soft=familyColour('soft'),light=familyColour('light');
  let n=0;

  // Sloping outside stair edges.
  n+=paintLine(ctx,backdrop,stair.top0,stair.ground0,dark);
  n+=paintLine(ctx,backdrop,stair.top1,stair.ground1,dark);

  const treads=stairTreadFractions(stair);
  for(let i=0;i<treads.length;i++){
    const t=treads[i];
    const [a,b]=stairCrossLine(stair,t);
    const line=drawLinePoints(a,b);
    for(let j=0;j<line.length;j++){
      const p=line[j];
      if(setBackdrop(ctx,backdrop,p.x,p.y,(i&1)?light:soft))n++;
    }
    if(settings.stairBack==='solid'&&i<treads.length-1){
      // With 2px tread spacing, the single row between treads becomes the
      // restrained darker riser/detail row.
      const yNext=Math.min(stair.verticalTravel,Math.round((i+1)*2)+1);
      const t2=Math.min(1,yNext/Math.max(1,stair.verticalTravel));
      const [ra,rb]=stairCrossLine(stair,t2);
      n+=paintLine(ctx,backdrop,ra,rb,dark);
    }
  }
  return n;
}
function paintOneStair(ctx,backdrop,stair){
  const main=familyColour('main');
  let n=0;
  if(settings.stairBack==='solid')n+=paintCoveredFace(ctx,backdrop,stair.poly,main);
  n+=paintStairSidePanels(ctx,backdrop,stair);
  n+=paintStairEdges(ctx,backdrop,stair);
  return n;
}
function paintStairs(ctx,backdrop,stairs,front){
  let n=0;
  for(const stair of stairs)if(stair.paintFront===front)n+=paintOneStair(ctx,backdrop,stair);
  return n;
}
function collectStairPixels(ctx,stair){
  const set=new Set();

  if(settings.stairBack==='solid'){
    const xs=stair.poly.map(p=>p.x),ys=stair.poly.map(p=>p.y);
    const x0=Math.floor(Math.min(...xs))-1,x1=Math.ceil(Math.max(...xs))+1;
    const y0=Math.floor(Math.min(...ys))-1,y1=Math.ceil(Math.max(...ys))+1;
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)
      if(pixelCellTouchesPoly(x,y,stair.poly))addMaskPixel(set,ctx,x,y);
  }

  if(settings.stairSides==='solid'){
    for(const panel of [stairSidePanel(stair,true),stairSidePanel(stair,false)]){
      const xs=panel.map(p=>p.x),ys=panel.map(p=>p.y);
      const x0=Math.floor(Math.min(...xs))-1,x1=Math.ceil(Math.max(...xs))+1;
      const y0=Math.floor(Math.min(...ys))-1,y1=Math.ceil(Math.max(...ys))+1;
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)
        if(pixelCellTouchesPoly(x,y,panel))addMaskPixel(set,ctx,x,y);
    }
  }

  for(const p of drawLinePoints(stair.top0,stair.ground0))addMaskPixel(set,ctx,p.x,p.y);
  for(const p of drawLinePoints(stair.top1,stair.ground1))addMaskPixel(set,ctx,p.x,p.y);

  for(const t of stairTreadFractions(stair)){
    const [a,b]=stairCrossLine(stair,t);
    const line=drawLinePoints(a,b);
    for(let j=0;j<line.length;j++)addMaskPixel(set,ctx,line[j].x,line[j].y);
  }
  return set;
}
function addStairsToMask(ctx,mask,stairs,bodyPixels){
  let nearWritten=0,farWritten=0,changed=0;
  for(const stair of stairs){
    const pixels=collectStairPixels(ctx,stair);
    const value=stair.maskValue;
    for(const i of pixels){
      // Body always owns shared attachment/overlap pixels.
      if(bodyPixels&&bodyPixels.has(i))continue;
      if(mask[i]!==value)changed++;
      mask[i]=value;
      if(value===MASK_FOREGROUND)nearWritten++;else farWritten++;
    }
  }
  return {nearWritten,farWritten,changed};
}

function frontUsesSideEntrance(){
  return settings.frontStairs==='left'||settings.frontStairs==='right';
}
function paintSideDoor(ctx,backdrop,door){
  if(!door||!door.visible)return 0;
  let n=0;
  n+=paintConvexFace(ctx,backdrop,door.poly,1,1);
  // Small body-colour edge accents keep the doorway readable on the side.
  n+=paintLine(ctx,backdrop,door.poly[0],door.poly[1],familyColour('soft'));
  n+=paintLine(ctx,backdrop,door.poly[1],door.poly[2],familyColour('dark'));
  return n;
}
function paintVisibleSideEntrances(ctx,backdrop,stairs){
  let n=0;
  for(const stair of stairs){
    if((stair.mode==='left'||stair.mode==='right')&&stair.sideVisible)
      n+=paintSideDoor(ctx,backdrop,stair.door);
  }
  return n;
}
function paintCuboid(ctx,backdrop,geo){
  const main=familyColour('main'),dark=familyColour('dark'),light=familyColour('light'),soft=familyColour('soft');
  let n=0;

  n+=paintConvexFace(ctx,backdrop,geo.farEnd,dark,dark);
  n+=paintConvexFace(ctx,backdrop,geo.side,dark,dark);
  n+=paintCoveredFace(ctx,backdrop,geo.side,dark);
  n+=paintConvexFace(ctx,backdrop,geo.top,main,main);

  n+=paintLine(ctx,backdrop,geo.a0,geo.b0,light);
  n+=paintLine(ctx,backdrop,geo.a1,geo.b1,soft);

  for(const p of fullSupercoverLinePoints(geo.sideBottomEdge[0],geo.sideBottomEdge[1],geo.side))
    if(setBackdrop(ctx,backdrop,p.x,p.y,dark))n++;

  // Side stair choices move the front entrance off the end face.  Close the
  // old direct opening with the bridge's base colour.  None/Centre preserve
  // the accepted v0.1.18 black front opening.
  if(frontUsesSideEntrance()){
    n+=paintConvexFace(ctx,backdrop,geo.nearEnd,main,main);
    n+=paintLine(ctx,backdrop,geo.nearEnd[0],geo.nearEnd[1],light);
    n+=paintLine(ctx,backdrop,geo.nearEnd[1],geo.nearEnd[2],dark);
  }else{
    n+=paintConvexFace(ctx,backdrop,geo.nearEnd,1,1);
    n+=paintEndDetail(ctx,backdrop,geo.nearEnd);
  }
  return n;
}

function addCoveredFaceToSet(set,ctx,poly){
  const xs=poly.map(p=>p.x),ys=poly.map(p=>p.y);
  const x0=Math.floor(Math.min(...xs))-1,x1=Math.ceil(Math.max(...xs))+1;
  const y0=Math.floor(Math.min(...ys))-1,y1=Math.ceil(Math.max(...ys))+1;
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(pixelCellTouchesPoly(x,y,poly))addMaskPixel(set,ctx,x,y);
}
function collectCuboidPixels(set,ctx,geo){
  // Match the Backdrop raster exactly: the facing side uses boundary-aware
  // coverage, while the other faces retain the accepted v0.1.9 raster.
  for(const poly of [geo.top,geo.farEnd,geo.nearEnd]){
    addPolyToSet(set,ctx,poly);
    for(let i=0;i<poly.length;i++)for(const p of edgeSealPoints(poly[i],poly[(i+1)%poly.length],poly))addMaskPixel(set,ctx,p.x,p.y);
  }
  addPolyToSet(set,ctx,geo.side);
  for(let i=0;i<geo.side.length;i++)for(const p of edgeSealPoints(geo.side[i],geo.side[(i+1)%geo.side.length],geo.side))addMaskPixel(set,ctx,p.x,p.y);
  addCoveredFaceToSet(set,ctx,geo.side);
  for(const [p0,p1] of [[geo.a0,geo.b0],[geo.a1,geo.b1]])addLineToSet(set,ctx,p0,p1);
  for(const p of fullSupercoverLinePoints(geo.sideBottomEdge[0],geo.sideBottomEdge[1],geo.side))addMaskPixel(set,ctx,p.x,p.y);
}

function applyOcclusionMask(ctx,mask,geo,legs,stairs){
  const body=new Set();collectCuboidPixels(body,ctx,geo);
  let changed=0;
  for(const i of body){if(mask[i]!==MASK_FOREGROUND)changed++;mask[i]=MASK_FOREGROUND;}
  const legOcc=addLegsToMask(ctx,mask,legs,body);
  const stairOcc=addStairsToMask(ctx,mask,stairs,body);
  return {
    foregroundWritten:body.size,
    changed:changed+legOcc.changed+stairOcc.changed,
    ...legOcc,
    stairNearWritten:stairOcc.nearWritten,
    stairFarWritten:stairOcc.farWritten
  };
}

function render(ctx){
  const geo=bridgeGeometry(ctx.geometry);if(!geo)return {message:'Footbridge: draw a Line at least 4 px long.'};
  const backdrop=ctx.layer('backdrop'),foreground=ctx.layer('foreground');
  const legs=bridgeLegGeometry(geo);
  const stairs=bridgeStairGeometry(geo);

  // Rear/background scenery is painted first so the cuboid naturally
  // obscures it.  Only facing/foreground supports and near stairs are painted
  // after the bridge body.
  paintLegs(ctx,backdrop,legs,false);
  paintStairs(ctx,backdrop,stairs,false);
  paintCuboid(ctx,backdrop,geo);
  paintLegs(ctx,backdrop,legs,true);
  paintStairs(ctx,backdrop,stairs,true);

  // Cut visible relocated entrances last.  This prevents the top of a
  // foreground side stair from painting over and visually narrowing the
  // doorway.
  paintVisibleSideEntrances(ctx,backdrop,stairs);

  const occ=applyOcclusionMask(ctx,foreground,geo,legs,stairs);
  const stairsActive=settings.frontStairs!=='none'||settings.rearStairs!=='none';
  return {message:`Footbridge committed · ${settings.endStyle} ends · body width ${geo.width}px (projected ${geo.projectedWidth.toFixed(1)}px) × depth ${geo.depth}px${settings.legStyle!=='none'?` · ${settings.legStyle} legs ${settings.legHeight}px + perspective`:''}${stairsActive?` · front ${settings.frontStairs} · rear ${settings.rearStairs} · ${settings.stairBack}${settings.stairSides==='solid'?' + sides':''} · shared height ${settings.legHeight}px`:''} · near opening @ ${geo.nearPoint.x},${geo.nearPoint.y} · far end closed @ ${geo.farPoint.x},${geo.farPoint.y} · Foreground body ${occ.foregroundWritten} px${settings.legStyle!=='none'?` · facing legs FG ${occ.facingWritten} px · rear legs BG ${occ.rearWritten} px`:''}${stairsActive?` · stair FG ${occ.stairNearWritten} px · stair BG ${occ.stairFarWritten} px`:''}.`};
}

function mountControls(container,ctx){
  ctx.ui.select(container,{label:'Body family',value:settings.family,options:FAMILY_OPTIONS,onChange:value=>{settings.family=value;}});
  ctx.ui.select(container,{label:'End style',value:settings.endStyle,options:END_OPTIONS,onChange:value=>{settings.endStyle=value;}});
  ctx.ui.slider(container,{label:'Body width',min:6,max:18,step:1,value:settings.bodyWidth,onInput:value=>{settings.bodyWidth=value;}});
  ctx.ui.slider(container,{label:'Body depth',min:6,max:10,step:1,value:settings.bodyDepth,onInput:value=>{settings.bodyDepth=value;}});
  ctx.ui.select(container,{label:'Legs',value:settings.legStyle,options:[{value:'none',label:'None'},{value:'straight',label:'Straight'},{value:'angled',label:'Angled'}],onChange:value=>{settings.legStyle=value;}});
  ctx.ui.slider(container,{label:'Leg height',min:6,max:22,step:1,value:settings.legHeight,onInput:value=>{settings.legHeight=value;}});
  ctx.ui.select(container,{label:'Front stairs',value:settings.frontStairs,options:END_STAIR_OPTIONS,onChange:value=>{settings.frontStairs=value;}});
  ctx.ui.select(container,{label:'Rear stairs',value:settings.rearStairs,options:END_STAIR_OPTIONS,onChange:value=>{settings.rearStairs=value;}});
  ctx.ui.select(container,{label:'Stair back',value:settings.stairBack,options:STAIR_BACK_OPTIONS,onChange:value=>{settings.stairBack=value;}});
  ctx.ui.select(container,{label:'Stair sides',value:settings.stairSides,options:STAIR_SIDE_OPTIONS,onChange:value=>{settings.stairSides=value;}});
}

S.register({
  id:'footbridge',
  name:'Footbridge',
  version:VERSION,
  category:'Scenery',
  status:'prototype',
  description:'Line-only Footbridge with independent Front and Rear Direct stair choices: None, Left, Centre or Right. Centre preserves the accepted direct-stair behaviour. Left/Right relocate the stair to that screen side; their tread lines follow the cuboid length angle and attach directly to the relocated side doorway. When the chosen side is visible, the direct end opening is closed in the bridge base colour and a black side opening is cut last so stair artwork cannot obscure it. Hidden-side stairs remain behind the cuboid. Treads retain fixed 2-pixel vertical spacing, shared Leg height, Solid/Open backs and optional Solid sides. Shadow and open-top variants remain deferred.',
  supportedModes:['backdrop'],
  supportedTools:['line'],
  layers:['backdrop','foreground'],
  mountControls,
  preview:render,
  apply:render
});

})(typeof globalThis!=='undefined'?globalThis:this);
