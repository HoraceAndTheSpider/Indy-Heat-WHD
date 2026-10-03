(function(root){
'use strict';

/* Footbridge Special Function v0.1.42
 *
 * Accepted cuboid geometry plus optional supports and first stair style.
 * Direct stairs attach to the two lower corners at each bridge end, run
 * directly away along the bridge axis and share the Leg height ground datum.
 * Later passes can add alternative stair arrangements and top variants.
 */
const S=root.IndyHeatSpecialFunctions;if(!S?.register)return;

const VERSION='0.1.43';
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
  stairSides:'none',
  topStyle:'closed',
  endCover:'closed',
  crossBeams:true,
  beamSpacing:10,
  peopleDensity:0,
  shadowMode:'none',
  shadowLength:6,
  nearWallDrop:'off',
  sunlitTop:false
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
const TOP_STYLE_OPTIONS=Object.freeze([
  Object.freeze({value:'closed',label:'Closed'}),
  Object.freeze({value:'open',label:'Open'})
]);
const END_COVER_OPTIONS=Object.freeze([
  Object.freeze({value:'closed',label:'Closed'}),
  Object.freeze({value:'open',label:'Open'})
]);
const SHADOW_OPTIONS=Object.freeze([
  Object.freeze({value:'none',label:'None'}),
  Object.freeze({value:'left',label:'Left/Down'}),
  Object.freeze({value:'right',label:'Right/Down'})
]);
const NEAR_WALL_DROP_OPTIONS=Object.freeze([
  Object.freeze({value:'off',label:'Off'}),
  Object.freeze({value:'auto',label:'Auto'})
]);

const FAMILY_MAP=Object.freeze({
  red:Object.freeze({main:29,light:31,dark:28,soft:30}),
  yellow:Object.freeze({main:23,light:11,dark:22,soft:21}),
  green:Object.freeze({main:25,light:27,dark:24,soft:26}),
  blue:Object.freeze({main:14,light:16,dark:12,soft:15}),
  orange:Object.freeze({main:9,light:10,dark:20,soft:22}),
  grey:Object.freeze({main:7,light:3,dark:5,soft:6})
});

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function inBounds(w,h,x,y){return x>=0&&y>=0&&x<w&&y<h;}
function validIndex(ctx,index){return ctx.helpers.validIndex(Number(index)||0);}
function familyDef(){return FAMILY_MAP[settings.family]||FAMILY_MAP.red;}
function familyColour(role){const f=familyDef();return f[role]??f.main;}

function sunlitTopColour(){
  // Deliberately allow a neutral/pale highlight where the family itself has
  // no convincing brighter member; this reads as sun glint in the game art.
  const byFamily={red:18,yellow:2,green:7,blue:17,orange:2,grey:2};
  return byFamily[settings.family]??familyColour('light');
}
function facingTopEdge(geo){
  return geo.facingLowerIndex===2?[geo.a1,geo.b1]:[geo.a0,geo.b0];
}

const SHADOW_DARKEN_MAP=Object.freeze({
  31:30,30:29,29:28,28:4,
  27:26,26:25,25:24,24:4,
  23:22,22:21,21:20,20:4,
  17:16,16:15,15:14,14:12,12:4,
  11:10,10:9,9:8,8:20,
  7:6,6:5,5:4,4:4,0:4,1:1,
  3:7,2:10,18:20,19:9
});
function darkenBackdropIndex(index){
  index=Number(index)||0;
  if(Object.prototype.hasOwnProperty.call(SHADOW_DARKEN_MAP,index))return SHADOW_DARKEN_MAP[index];
  return index>16?index-1:Math.max(0,index-1);
}
function hash01(seed){
  const x=Math.sin((Number(seed)||0)*12.9898+78.233)*43758.5453123;
  return x-Math.floor(x);
}
function seedKey(...parts){
  let h=2166136261>>>0;
  for(const part of parts){
    const n=Math.round(Number(part)||0);
    h^=n; h=Math.imul(h,16777619)>>>0;
  }
  return h>>>0;
}
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
const SIDE_STAIR_WIDTH=7;
const STAIR_SIDE_HEIGHT=5;
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
  const rawStart=roundPoint(g.start),rawEnd=roundPoint(g.end);
  const [a,b]=canonicalEndpoints(rawStart,rawEnd),d=sub(b,a),len=Math.hypot(d.x,d.y);
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
  // Internal walking floor/deck.  This plane always exists logically, even
  // when the bridge has a closed roof; Open Top merely makes it visible.
  const floor=[a3,b3,b2,a2];
  const sidePositive=[a1,b1,b2,a2],sideNegative=[a0,b0,b3,a3];
  const side=settings.endStyle==='angled'?sidePositive:(nearSign>0?sidePositive:sideNegative);
  const farSide=(side===sidePositive)?sideNegative:sidePositive;
  const facingLowerIndex=(side===sidePositive)?2:3;
  const sideBottomEdge=facingLowerIndex===2?[a2,b2]:[a3,b3];
  const rearBottomEdge=facingLowerIndex===2?[a3,b3]:[a2,b2];

  // Screen Y is perspective depth. At an exact 3/9 o'clock tie there is no
  // larger-Y endpoint, so preserve the user's draw direction: the first point
  // is the near/front end. This makes 3:00 and 9:00 true mirrors instead of
  // both collapsing to the right-hand end.
  const rawStartIsA=rawStart.x===a.x&&rawStart.y===a.y;
  const nearIsA=a.y>b.y || (a.y===b.y && rawStartIsA);
  const nearEnd=nearIsA?endA:endB,farEnd=nearIsA?endB:endA;

  return {
    a,b,u,len,width,projectedWidth,depth,nearSign,
    endA,endB,a0,a1,a2,a3,b0,b1,b2,b3,
    top,floor,side,farSide,sideBottomEdge,rearBottomEdge,facingLowerIndex,nearEnd,farEnd,
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
  const nearEndName=(geo.nearPoint.x===geo.a.x&&geo.nearPoint.y===geo.a.y)?'A':'B';
  makePair('A',geo.a3,geo.a2,facingPairIndex);
  makePair('B',geo.b3,geo.b2,facingPairIndex);
  for(const leg of legs)leg.isNearEnd=leg.endName===nearEndName;
  return legs;
}
function paintLegs(ctx,backdrop,legs,front){
  const colour=familyColour('dark');
  let n=0;
  for(const leg of legs){
    if(leg.isNearEnd!==front)continue;
    n+=paintLine(ctx,backdrop,leg.anchor,leg.foot,colour);
  }
  return n;
}

function collectLegPixels(ctx,legs){
  const set=new Set();
  for(const leg of legs)for(const p of drawLinePoints(leg.anchor,leg.foot))addMaskPixel(set,ctx,p.x,p.y);
  return set;
}
function addLegsToMask(ctx,mask,legs,bodyPixels){
  const near=new Set(),far=new Set();
  for(const leg of legs){
    const target=leg.isNearEnd?near:far;
    for(const p of drawLinePoints(leg.anchor,leg.foot))addMaskPixel(target,ctx,p.x,p.y);
  }
  let changed=0,nearWritten=0,farWritten=0;
  for(const i of near){
    if(bodyPixels&&bodyPixels.has(i))continue;
    if(mask[i]!==MASK_FOREGROUND)changed++;
    mask[i]=MASK_FOREGROUND;nearWritten++;
  }
  for(const i of far){
    if(bodyPixels&&bodyPixels.has(i))continue;
    if(mask[i]!==MASK_BACKGROUND)changed++;
    mask[i]=MASK_BACKGROUND;farWritten++;
  }
  return {facingWritten:nearWritten,rearWritten:farWritten,nearWritten,farWritten,changed};
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

  // Left/Right stair width is intentionally independent of Body width.
  // Direct Centre still follows the bridge width, but side stairs keep the
  // accepted compact 7px tread span even when the bridge body is widened.
  const spanPx=SIDE_STAIR_WIDTH;
  const t=Math.min(.45,spanPx/Math.max(1,geo.len));
  const innerTop=lerp(endTop,otherTop,t);
  const innerBottom=lerp(endBottom,otherBottom,t);

  return {
    pair,sideName,geo,
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

  /*
   * Centre stairs attach to the cuboid's actual lower end edge.  At 12:00
   * that edge is horizontal, but with Angled ends it progressively rotates
   * as the bridge approaches 3/9 o'clock.  Do not flatten it back to a
   * screen-horizontal line: doing so makes the stair landing cut across the
   * body at heavy side-on headings.
   */
  const top0={x:endPoly[3].x,y:endPoly[3].y};
  const top1={x:endPoly[2].x,y:endPoly[2].y};
  const centre={x:(top0.x+top1.x)/2,y:(top0.y+top1.y)/2};

  const outward=endName==='A'?mul(geo.u,-1):geo.u;
  const runVec=mul(outward,run);
  const groundDrop=baseHeight+perspectiveDrop;
  const descent={x:runVec.x,y:runVec.y+groundDrop};
  const ground0=add(top0,descent);
  const ground1=add(top1,descent);
  const groundCentre={x:(ground0.x+ground1.x)/2,y:(ground0.y+ground1.y)/2};

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

  // Foreground rule: everything is Foreground except the far/highest stairs
  // and legs.  Therefore any front/near stair stays Foreground even when it
  // is attached to the less-visible side.
  const paintFront=isNearEnd;
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
  // Solid stair sides are low parapet/side walls, not a one-pixel thickness
  // strip. Raise them above the stair surface so they meet the upper landing
  // properly and remain visible down the run.
  const h=STAIR_SIDE_HEIGHT;
  return [a,b,{x:b.x,y:b.y-h},{x:a.x,y:a.y-h}];
}
function paintStairSidePanels(ctx,backdrop,stair){
  if(settings.stairSides!=='solid')return 0;
  const main=familyColour('main'),dark=familyColour('dark'),light=familyColour('light');
  let n=0;
  for(const panel of [stairSidePanel(stair,true),stairSidePanel(stair,false)]){
    n+=paintCoveredFace(ctx,backdrop,panel,main);
    // Dark stair/surface seam with a lighter upper parapet edge.
    n+=paintLine(ctx,backdrop,panel[0],panel[1],dark);
    n+=paintLine(ctx,backdrop,panel[3],panel[2],light);
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
  n+=paintOpenTopStairBalustrade(ctx,backdrop,stair);
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
function topIsOpen(){return settings.topStyle==='open';}
function endsAreOpen(){return topIsOpen();}
function heavyAngleShade(geo){return Math.abs(geo.u.y)<0.22;}
function stairTopPostPoints(stair){
  return [0.18,0.5,0.82].map(t=>lerp(stair.top0,stair.top1,t));
}
function paintOpenTopStairBalustrade(ctx,backdrop,stair){
  if(!topIsOpen())return 0;
  const rail=familyColour('light'),post=familyColour('soft');
  let n=0;
  const pts=stairTopPostPoints(stair);
  const topPts=[];
  for(const p of pts){
    const q={x:p.x,y:p.y-2};
    topPts.push(q);
    n+=paintLine(ctx,backdrop,p,q,post);
  }
  for(let i=0;i<topPts.length-1;i++)n+=paintLine(ctx,backdrop,topPts[i],topPts[i+1],rail);
  return n;
}
function paintOpenEndFrame(ctx,backdrop,poly,geo){
  const light=familyColour('light'),soft=familyColour('soft'),dark=familyColour('dark'),main=familyColour('main');
  let n=0;
  // Open end: frame/threshold/mini balustrade with transparent interior.
  n+=paintLine(ctx,backdrop,poly[0],poly[1],light);
  n+=paintLine(ctx,backdrop,poly[0],poly[3],soft);
  n+=paintLine(ctx,backdrop,poly[1],poly[2],dark);
  n+=paintLine(ctx,backdrop,poly[3],poly[2],main);
  // small inner threshold line
  const i0=lerp(poly[3],poly[0],0.22),i1=lerp(poly[2],poly[1],0.22);
  n+=paintLine(ctx,backdrop,i0,i1,soft);
  // mini balustrade/posts at the open end
  const baseTs=[0.22,0.5,0.78];
  const tops=[];
  for(const t of baseTs){
    const p=lerp(poly[3],poly[2],t),q={x:p.x,y:p.y-2};
    tops.push(q);
    n+=paintLine(ctx,backdrop,p,q,soft);
  }
  for(let i=0;i<tops.length-1;i++)n+=paintLine(ctx,backdrop,tops[i],tops[i+1],light);
  if(heavyAngleShade(geo)){
    const shTop0=lerp(poly[0],poly[3],0.45),shTop1=lerp(poly[1],poly[2],0.45);
    const shade=[shTop0,shTop1,poly[2],poly[3]];
    n+=paintPoly(ctx,backdrop,shade,1);
  }
  return n;
}
function stairChoicesActive(){return settings.frontStairs!=='none'||settings.rearStairs!=='none';}
function beamFractions(geo){
  if(!topIsOpen()||!settings.crossBeams)return [];
  const step=clamp(Math.round(Number(settings.beamSpacing)||10),4,20);
  const out=[];
  for(let d=step;d<geo.len-step*0.5;d+=step)out.push(d/geo.len);
  return out;
}
function paintOpenTopBeams(ctx,backdrop,geo){
  if(!topIsOpen())return 0;
  // Optional sunlit treatment brightens the cross-beams; some families use a
  // neutral/pale index because their normal 'light' shade is already saturated.
  const colour=settings.sunlitTop?sunlitTopColour():familyColour('light');
  let n=0;
  for(const t of beamFractions(geo)){
    const a=lerp(geo.a0,geo.b0,t),b=lerp(geo.a1,geo.b1,t);
    n+=paintLine(ctx,backdrop,a,b,colour);
  }
  return n;
}
function addOpenTopBeamsToSet(set,ctx,geo){
  if(!topIsOpen())return;
  for(const t of beamFractions(geo)){
    const a=lerp(geo.a0,geo.b0,t),b=lerp(geo.a1,geo.b1,t);
    addLineToSet(set,ctx,a,b);
  }
}

function openFarSidePanelPoly(geo){
  // The closed cuboid already implies this complete opposite long side; the
  // solid roof normally hides most of it.  When Top = Open, keep the ENTIRE
  // far-side face and simply expose it by removing the roof.
  return topIsOpen()?geo.farSide:null;
}
function paintOpenFarSidePanel(ctx,backdrop,geo){
  const poly=openFarSidePanelPoly(geo);
  if(!poly)return 0;
  const fill=familyColour('soft');
  const edge=familyColour('light');
  let n=0;
  n+=paintConvexFace(ctx,backdrop,poly,fill,fill);
  n+=paintLine(ctx,backdrop,poly[2],poly[3],edge);
  return n;
}
function addOpenFarSidePanelToSet(set,ctx,geo){
  const poly=openFarSidePanelPoly(geo);
  if(!poly)return;
  addPolyToSet(set,ctx,poly);
  for(let i=0;i<poly.length;i++)for(const p of edgeSealPoints(poly[i],poly[(i+1)%poly.length],poly))addMaskPixel(set,ctx,p.x,p.y);
}

function paintOpenFloor(ctx,backdrop,geo){
  if(!topIsOpen())return 0;
  const main=familyColour('main'),soft=familyColour('soft'),dark=familyColour('dark');
  let n=0;
  // The floor is a complete lower cuboid plane.  It is painted before the
  // side walls so their edges continue to frame/occlude it correctly.
  n+=paintConvexFace(ctx,backdrop,geo.floor,main,main);
  // A restrained inner-edge definition helps the open interior read as a
  // walkable deck rather than a flat replacement roof.
  const rearA=lerp(geo.floor[0],geo.floor[3],0.22);
  const rearB=lerp(geo.floor[1],geo.floor[2],0.22);
  n+=paintLine(ctx,backdrop,rearA,rearB,soft);
  const frontA=lerp(geo.floor[3],geo.floor[0],0.18);
  const frontB=lerp(geo.floor[2],geo.floor[1],0.18);
  n+=paintLine(ctx,backdrop,frontA,frontB,dark);
  return n;
}
function addOpenFloorToSet(set,ctx,geo){
  if(!topIsOpen())return;
  addPolyToSet(set,ctx,geo.floor);
  for(let i=0;i<geo.floor.length;i++)for(const p of edgeSealPoints(geo.floor[i],geo.floor[(i+1)%geo.floor.length],geo.floor))addMaskPixel(set,ctx,p.x,p.y);
}
function paintSideDoor(ctx,backdrop,door){
  if(!door||!door.visible)return 0;
  let n=0;
  if(topIsOpen()){
    // Open-top side entrances read as an open landing rather than a black void.
    const fill=heavyAngleShade(door.geo||{u:{y:1}})?familyColour('dark'):familyColour('soft');
    n+=paintConvexFace(ctx,backdrop,door.poly,fill,fill);
    const a=lerp(door.lower0,door.lower1,0.2),b=lerp(door.lower0,door.lower1,0.8);
    n+=paintLine(ctx,backdrop,a,b,familyColour('light'));
  }else{
    n+=paintConvexFace(ctx,backdrop,door.poly,1,1);
  }
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

  // Open-top bridges imply open small ends as well. These are framed/open,
  // only using black shading when the bridge is close to a 3pm-style heading.
  if(endsAreOpen()){
    n+=paintOpenEndFrame(ctx,backdrop,geo.farEnd,geo);
  }else{
    n+=paintConvexFace(ctx,backdrop,geo.farEnd,dark,dark);
  }

  // Open Top reveals the internal walking floor, not the Backdrop beneath
  // the bridge.  Paint the deck first, then the long side faces around it.
  n+=paintOpenFloor(ctx,backdrop,geo);

  // With an open top, reveal the COMPLETE far long side. It is a full
  // cuboid side face in an alternate family shade, not a transparent gap.
  n+=paintOpenFarSidePanel(ctx,backdrop,geo);

  n+=paintConvexFace(ctx,backdrop,geo.side,dark,dark);
  n+=paintCoveredFace(ctx,backdrop,geo.side,dark);

  if(!topIsOpen())n+=paintConvexFace(ctx,backdrop,geo.top,main,main);

  // Always keep the two main long top edges. These become the visible upper
  // rails when the roof face is replaced by cross-beams.
  n+=paintLine(ctx,backdrop,geo.a0,geo.b0,light);
  n+=paintLine(ctx,backdrop,geo.a1,geo.b1,soft);
  n+=paintOpenTopBeams(ctx,backdrop,geo);

  for(const p of fullSupercoverLinePoints(geo.sideBottomEdge[0],geo.sideBottomEdge[1],geo.side))
    if(setBackdrop(ctx,backdrop,p.x,p.y,dark))n++;

  if(frontUsesSideEntrance()){
    n+=paintConvexFace(ctx,backdrop,geo.nearEnd,main,main);
    n+=paintLine(ctx,backdrop,geo.nearEnd[0],geo.nearEnd[1],light);
    n+=paintLine(ctx,backdrop,geo.nearEnd[1],geo.nearEnd[2],dark);
  }else if(endsAreOpen()){
    n+=paintOpenEndFrame(ctx,backdrop,geo.nearEnd,geo);
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
  // Match the Backdrop raster exactly.  With an open top, the roof fill is
  // intentionally omitted and replaced by the long parapet edges plus the
  // optional cross-beams.
  const endPolys=endsAreOpen()?[geo.farEnd,geo.nearEnd]:[geo.farEnd,geo.nearEnd];
  for(const poly of endPolys){
    addPolyToSet(set,ctx,poly);
    for(let i=0;i<poly.length;i++)for(const p of edgeSealPoints(poly[i],poly[(i+1)%poly.length],poly))addMaskPixel(set,ctx,p.x,p.y);
  }
  if(!topIsOpen()){
    addPolyToSet(set,ctx,geo.top);
    for(let i=0;i<geo.top.length;i++)for(const p of edgeSealPoints(geo.top[i],geo.top[(i+1)%geo.top.length],geo.top))addMaskPixel(set,ctx,p.x,p.y);
  }
  addOpenFloorToSet(set,ctx,geo);
  addPolyToSet(set,ctx,geo.side);
  for(let i=0;i<geo.side.length;i++)for(const p of edgeSealPoints(geo.side[i],geo.side[(i+1)%geo.side.length],geo.side))addMaskPixel(set,ctx,p.x,p.y);
  addCoveredFaceToSet(set,ctx,geo.side);
  for(const [p0,p1] of [[geo.a0,geo.b0],[geo.a1,geo.b1]])addLineToSet(set,ctx,p0,p1);
  addOpenFarSidePanelToSet(set,ctx,geo);
  addOpenTopBeamsToSet(set,ctx,geo);
  for(const p of fullSupercoverLinePoints(geo.sideBottomEdge[0],geo.sideBottomEdge[1],geo.side))addMaskPixel(set,ctx,p.x,p.y);
}


function shadowCastVector(){
  const direction=settings.shadowMode==='left'?-1:1;
  /* Shadow length is a ground-plane projection scale, not a sprite offset.
     At 8 the vertical height is turned roughly 1:1 onto the diagonal ground
     vector; lower/higher values shorten/lengthen the same projection. */
  const scale=clamp(Number(settings.shadowLength)||6,2,16)/8;
  return {x:direction*scale,y:scale};
}
function projectFromGround(ground,height,cast){
  height=Math.max(0,Number(height)||0);
  return {x:ground.x+cast.x*height,y:ground.y+cast.y*height};
}
function convexHull(points){
  const pts=points
    .filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y))
    .map(p=>({x:Number(p.x),y:Number(p.y)}))
    .sort((a,b)=>a.x-b.x||a.y-b.y);
  if(pts.length<=1)return pts;
  const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const lower=[];
  for(const p of pts){while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],p)<=0)lower.pop();lower.push(p);}
  const upper=[];
  for(let i=pts.length-1;i>=0;i--){const p=pts[i];while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],p)<=0)upper.pop();upper.push(p);}
  lower.pop();upper.pop();return lower.concat(upper);
}
function addShadowHull(set,ctx,points){
  const hull=convexHull(points);
  /* A cast shadow is a filled projected silhouette, not an outlined polygon.
     Adding a separate raster edge around the hull created a one-pixel clear
     band followed by a detached outer line on shallow/default-depth bodies.
     Fill the silhouette only; true ground-contact edges are added explicitly
     by their owning supports/stairs below. */
  if(hull.length>=3)addPolyToSet(set,ctx,hull);
  else if(hull.length===2)addLineToSet(set,ctx,hull[0],hull[1]);
  else if(hull.length===1)addMaskPixel(set,ctx,hull[0].x,hull[0].y);
}
function matchingLeg(legs,endName,index){
  return (legs||[]).find(leg=>leg.endName===endName&&leg.index===index)||null;
}
function syntheticSupport(geo,endName,index){
  const base=clamp(Math.round(Number(settings.legHeight)||10),6,22);
  const facingPairIndex=geo.facingLowerIndex===3?0:1;
  const facing=index===facingPairIndex;
  const length=base+(facing?stairPerspectiveDrop(geo):0);
  const anchor=endName==='A'?(index===0?geo.a3:geo.a2):(index===0?geo.b3:geo.b2);
  return {anchor,foot:{x:anchor.x,y:anchor.y+length},length};
}
function supportFor(geo,legs,endName,index){
  return matchingLeg(legs,endName,index)||syntheticSupport(geo,endName,index);
}
function bodyShadowPoints(geo,legs,cast){
  const out=[];
  const corners=[
    ['A',0,geo.a3,geo.a0],['A',1,geo.a2,geo.a1],
    ['B',0,geo.b3,geo.b0],['B',1,geo.b2,geo.b1]
  ];
  for(const [endName,index,bottom,top] of corners){
    const support=supportFor(geo,legs,endName,index);
    const baseGround=support.foot;
    const bottomHeight=Math.max(0,Number(support.length)||0);
    out.push(projectFromGround(baseGround,bottomHeight,cast));
    /* The visual body depth is deliberately chunky pixel art. Projecting its
       full raster depth onto the ground makes the cast silhouette look heavier
       than the bridge itself. Keep the lower-body contact unchanged, but use a
       little over half of the visual depth for the cast thickness. At the usual
       6 px body depth this reduces the shadow contribution from 4 px to 3 px,
       while deeper bodies still gain proportionally more shadow depth. This is
       shadow-only perspective correction; actual cuboid geometry is untouched. */
    const castBodyDepth=Math.max(2,Math.round(geo.depth*0.55));
    out.push(projectFromGround(baseGround,bottomHeight+castBodyDepth,cast));
  }
  return out;
}
function projectedLowerPerimeterPoint(geo,legs,p,cast){
  const projSupport=(endName,index)=>{
    const support=supportFor(geo,legs,endName,index);
    return projectFromGround(support.foot,support.length,cast);
  };
  const segments=[
    {a:geo.a3,b:geo.a2,pa:projSupport('A',0),pb:projSupport('A',1)},
    {a:geo.b3,b:geo.b2,pa:projSupport('B',0),pb:projSupport('B',1)},
    {a:geo.a3,b:geo.b3,pa:projSupport('A',0),pb:projSupport('B',0)},
    {a:geo.a2,b:geo.b2,pa:projSupport('A',1),pb:projSupport('B',1)}
  ];
  let best=null;
  for(const seg of segments){
    const vx=seg.b.x-seg.a.x,vy=seg.b.y-seg.a.y,l2=vx*vx+vy*vy||1;
    const t=clamp(((p.x-seg.a.x)*vx+(p.y-seg.a.y)*vy)/l2,0,1);
    const q={x:seg.a.x+vx*t,y:seg.a.y+vy*t};
    const d2=(p.x-q.x)**2+(p.y-q.y)**2;
    if(!best||d2<best.d2)best={d2,point:lerp(seg.pa,seg.pb,t)};
  }
  return best?best.point:{x:p.x,y:p.y};
}
function stairShadowPoints(geo,legs,stair,cast){
  /* The stair tip is a true ground contact, while the landing is attached to
     the raised cuboid.  Anchor one edge at the tip and the opposite edge at
     the SAME projected lower-body edge used by the cuboid shadow.  The stair
     shadow therefore physically bridges the ground contact to the body
     shadow instead of becoming a detached translated strip. */
  const landing0=projectedLowerPerimeterPoint(geo,legs,stair.top0,cast);
  const landing1=projectedLowerPerimeterPoint(geo,legs,stair.top1,cast);
  const points=[
    {x:stair.ground0.x,y:stair.ground0.y},
    {x:stair.ground1.x,y:stair.ground1.y},
    landing1,landing0
  ];
  if(settings.stairSides==='solid'){
    const h=STAIR_SIDE_HEIGHT;
    points.push(
      projectFromGround(stair.ground0,h,cast),
      projectFromGround(stair.ground1,h,cast),
      {x:landing0.x+cast.x*h,y:landing0.y+cast.y*h},
      {x:landing1.x+cast.x*h,y:landing1.y+cast.y*h}
    );
  }
  return points;
}
function paintStructureShadow(ctx,backdrop,geo,legs,stairs){
  if(settings.shadowMode==='none')return 0;
  const cast=shadowCastVector(),shadow=new Set();

  /* Treat the bridge as one grounded 3-D structure.  The cuboid shadow is
     projected from the four support feet; the lower body corners meet the
     ends of the leg shadows, and the roof/body depth continues farther along
     the same cast vector.  This avoids the old thin, detached drop-shadow. */
  addShadowHull(shadow,ctx,bodyShadowPoints(geo,legs,cast));

  /* Every support shadow begins at the exact foot that touches the track and
     ends where that support meets the projected lower cuboid. */
  for(const leg of legs||[]){
    const end=projectFromGround(leg.foot,leg.length,cast);
    addLineToSet(shadow,ctx,leg.foot,end);
  }

  /* Each stair is grounded by its lower/tip edge.  Keep that edge fixed and
     cast the raised landing/side structure away from it using the SAME vector
     as the cuboid and legs.  There is therefore never a jump-gap at a stair
     tip, regardless of bridge heading. */
  for(const stair of stairs||[]){
    addShadowHull(shadow,ctx,stairShadowPoints(geo,legs,stair,cast));
    // The stair tip is a real ground contact, so keep its exact base edge in
    // the shadow even though projected hulls themselves are no longer outlined.
    addLineToSet(shadow,ctx,stair.ground0,stair.ground1);
  }

  const original=ctx.baseLayer?ctx.baseLayer('backdrop'):Uint8Array.from(backdrop);
  let n=0;
  for(const i of shadow){
    const darker=darkenBackdropIndex(original[i]);
    if(backdrop[i]!==darker){backdrop[i]=validIndex(ctx,darker);n++;}
  }
  return n;
}

function peopleEnabled(){return (Number(settings.peopleDensity)||0)>0;}
/* Exact body palette rules from Random People v0.1.1. */
const PEOPLE_SKIN_TONES=Object.freeze([8,10,19]);
const PEOPLE_LEG_TONES=Object.freeze([4,5,8,12,14]);
const PEOPLE_TORSO_TONES=Object.freeze([3,6,7,9,11,13,15,17,18,21,23,25,26,27,29,30,31]);
const PEOPLE_SHADE_GROUPS=Object.freeze([
  Object.freeze([4,5,6,7]),
  Object.freeze([12,13,14,15]),
  Object.freeze([20,21,22,23]),
  Object.freeze([24,25,26,27]),
  Object.freeze([28,29,30,31])
]);
function peopleMix32(value){
  let x=Number(value)>>>0;
  x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;x=Math.imul(x,0x846ca68b);x^=x>>>16;
  return x>>>0;
}
function peopleHashAt(seed,x,y,salt=0){
  return peopleMix32((seed>>>0)^Math.imul((Math.round(x)+0x10001)>>>0,0x9e3779b1)^Math.imul((Math.round(y)+0x20003)>>>0,0x85ebca6b)^Math.imul((salt+1)>>>0,0xc2b2ae35));
}
function peopleChoose(values,seed){return values[(seed>>>0)%values.length];}
function peoplePaletteRgb(ctx,index){
  if(typeof ctx.paletteRgb==='function'){
    const c=ctx.paletteRgb(index);
    if(Array.isArray(c)&&c.length>=3)return c.map(v=>Math.max(0,Math.min(255,Number(v)||0))).slice(0,3);
  }
  // Fallback for focused test harnesses: Indy Heat's fixed 12-bit palette.
  const words=[0x888,0x000,0xFDC,0xFFF,0x333,0x666,0x999,0xCCC,0x954,0xF81,0xFA6,0xFFA,0x449,0x77B,0x66C,0x88F,0xAAF,0xCCF,0xF99,0xFCA,0xC74,0xCB2,0xC90,0xDD0,0x080,0x1B0,0x6D0,0x9F0,0x900,0xC00,0xB33,0xF00];
  const w=words[Math.max(0,Math.min(words.length-1,index))]||0;
  return [((w>>8)&15)*17,((w>>4)&15)*17,(w&15)*17];
}
function peopleLuminance(rgb){return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];}
function peopleDarkerIndex(ctx,index){
  index=ctx.helpers.validIndex(index);
  if(index===0)return 5;
  if(index===1)return 1;
  for(const group of PEOPLE_SHADE_GROUPS){
    if(!group.includes(index))continue;
    const ordered=[...group].sort((a,b)=>peopleLuminance(peoplePaletteRgb(ctx,a))-peopleLuminance(peoplePaletteRgb(ctx,b))||a-b);
    const position=ordered.indexOf(index);
    if(position<=0)return group===PEOPLE_SHADE_GROUPS[0]?index:4;
    return ordered[Math.max(0,position-1)];
  }
  const source=peoplePaletteRgb(ctx,index),sourceL=peopleLuminance(source),target=source.map(v=>v*.75);
  let best=index,bestDistance=Infinity;
  for(let candidate=0;candidate<ctx.paletteSize;candidate++){
    const rgb=peoplePaletteRgb(ctx,candidate),l=peopleLuminance(rgb);
    if(l>=sourceL-.01)continue;
    const dr=rgb[0]-target[0],dg=rgb[1]-target[1],db=rgb[2]-target[2],distance=dr*dr+dg*dg+db*db;
    if(distance<bestDistance){bestDistance=distance;best=candidate;}
  }
  return best;
}
function peopleFootprint(x,y){
  x=Math.round(x);y=Math.round(y);
  return [{x,y},{x,y:y+1},{x,y:y+2},{x:x-1,y:y+2}];
}

function floorPeopleFootprint(x,y){
  x=Math.round(x);y=Math.round(y);
  // Denser open-top deck packing: only reserve the visible body column.
  // The lower-left shadow pixel is allowed to share space for review density.
  return [{x,y},{x,y:y+1},{x,y:y+2}];
}
function peopleTorsoChoice(baseIndex,legs,seed){
  const allowed=PEOPLE_TORSO_TONES.filter(index=>index!==baseIndex&&index!==legs);
  return peopleChoose(allowed.length?allowed:PEOPLE_TORSO_TONES,seed);
}
function floorPoint(poly,s,t){
  const top=lerp(poly[0],poly[1],s),bottom=lerp(poly[3],poly[2],s);
  return lerp(top,bottom,t);
}
function makePerson(face,seed,phase,maskValue){
  return {face:roundPoint(face),seed:seed>>>0,phase,maskValue};
}

function headingClockLift(geo){
  // Visual-only lift for open-top floor people as the bridge rotates away
  // from 12 o'clock.  Roughly 0px at 12, 1px from ~1 o'clock, 2px from ~2.
  const upness=Math.max(0.001,-geo.u.y);
  const fromVertical=Math.atan2(Math.abs(geo.u.x),upness)*180/Math.PI;
  if(fromVertical>=78)return 3;
  if(fromVertical>=60)return 2;
  if(fromVertical>=30)return 1;
  return 0;
}

function openTopNearWallDrop(geo){
  if(!topIsOpen()||settings.nearWallDrop!=='auto')return 0;
  const upness=Math.max(0.001,-geo.u.y);
  const fromVertical=Math.atan2(Math.abs(geo.u.x),upness)*180/Math.PI;
  if(fromVertical>=60)return 2;
  if(fromVertical>=30)return 1;
  return 0;
}
function visualBridgeGeometry(geo){
  const drop=openTopNearWallDrop(geo);
  if(!drop)return geo;
  const cp=p=>({x:p.x,y:p.y});
  let a0=cp(geo.a0),a1=cp(geo.a1),a2=cp(geo.a2),a3=cp(geo.a3),b0=cp(geo.b0),b1=cp(geo.b1),b2=cp(geo.b2),b3=cp(geo.b3);
  if(geo.facingLowerIndex===2){a1.y+=drop;b1.y+=drop;} else {a0.y+=drop;b0.y+=drop;}
  const top=[a0,b0,b1,a1],floor=[a3,b3,b2,a2];
  const sidePositive=[a1,b1,b2,a2],sideNegative=[a0,b0,b3,a3];
  const side=geo.facingLowerIndex===2?sidePositive:sideNegative;
  const farSide=geo.facingLowerIndex===2?sideNegative:sidePositive;
  const sideBottomEdge=geo.facingLowerIndex===2?[a2,b2]:[a3,b3];
  const rearBottomEdge=geo.facingLowerIndex===2?[a3,b3]:[a2,b2];
  const nearIsA=(geo.nearPoint.x===geo.a.x&&geo.nearPoint.y===geo.a.y);
  const endA=[a0,a1,a2,a3],endB=[b0,b1,b2,b3];
  const nearEnd=nearIsA?endA:endB,farEnd=nearIsA?endB:endA;
  return {...geo,a0,a1,a2,a3,b0,b1,b2,b3,top,floor,side,farSide,sideBottomEdge,rearBottomEdge,endA,endB,nearEnd,farEnd,visualNearWallDrop:drop};
}
function personPixels(ctx,base,person){
  const x=person.face.x,y=person.face.y;
  const faceIndex=y*ctx.width+x,torsoIndex=(y+1)*ctx.width+x,legsIndex=(y+2)*ctx.width+x,shadowIndex=(y+2)*ctx.width+x-1;
  const face=peopleChoose(PEOPLE_SKIN_TONES,peopleHashAt(person.seed,x,y,1));
  const legs=peopleChoose(PEOPLE_LEG_TONES,peopleHashAt(person.seed,x,y,2));
  const torso=peopleTorsoChoice(base[torsoIndex],legs,peopleHashAt(person.seed,x,y,3));
  const shadow=peopleDarkerIndex(ctx,base[shadowIndex]);
  return [
    {x:x-1,y:y+2,c:shadow,shadow:true},
    {x,y:y+2,c:legs},
    {x,y:y+1,c:torso},
    {x,y,c:face}
  ];
}
function personFits(ctx,person,occupied=null){
  for(const p of peopleFootprint(person.face.x,person.face.y)){
    if(!inBounds(ctx.width,ctx.height,p.x,p.y))return false;
    const i=p.y*ctx.width+p.x;
    if(occupied?.has(i))return false;
  }
  return true;
}
function reservePerson(ctx,person,occupied){
  for(const p of peopleFootprint(person.face.x,person.face.y))occupied.add(p.y*ctx.width+p.x);
}
function paintPeople(ctx,backdrop,people,phase){
  let n=0;
  // Match Random People: derive the little lower-left person shadow from the
  // surface immediately underneath the person, not from a fixed colour.
  const base=Uint8Array.from(backdrop);
  for(const person of people){
    if(phase&&person.phase!==phase)continue;
    for(const px of personPixels(ctx,base,person))if(setBackdrop(ctx,backdrop,px.x,px.y,px.c))n++;
  }
  return n;
}
function addPeopleToMask(ctx,mask,people,bodyPixels=null){
  let changed=0,fgWritten=0,bgWritten=0;
  for(const person of people){
    for(const px of peopleFootprint(person.face.x,person.face.y)){
      if(!inBounds(ctx.width,ctx.height,px.x,px.y))continue;
      const i=px.y*ctx.width+px.x;
      // Far/highest stair people are Background, but the body still owns any
      // overlap pixel where that stair/person passes behind the cuboid.
      if(person.maskValue===MASK_BACKGROUND&&bodyPixels?.has(i))continue;
      if(mask[i]!==person.maskValue)changed++;
      mask[i]=person.maskValue;
      if(person.maskValue===MASK_FOREGROUND)fgWritten++; else bgWritten++;
    }
  }
  return {changed,peopleFgWritten:fgWritten,peopleBgWritten:bgWritten};
}
function floorPeopleAcrossFractions(geo){
  /*
   * Populate the deck much more fully for review.  Keep only a small safety
   * margin at either side and use more lateral columns than v0.1.31.
   */
  const edge0Y=(geo.floor[0].y+geo.floor[1].y)/2;
  const edge1Y=(geo.floor[3].y+geo.floor[2].y)/2;
  const upperIsT0=edge0Y<=edge1Y;
  const visibleWidth=Math.max(3,geo.projectedWidth||geo.width||7);
  const onePixel=Math.min(.14,1/visibleWidth);
  const first=clamp(.12-onePixel,.02,.12);
  const last=clamp(.88+onePixel,.88,.98);
  const base=geo.width>=10
    ?[first,0.22,0.34,0.46,0.58,0.70,0.80,last]
    :[first,0.30,0.50,0.70,last];
  return upperIsT0?base:base.map(v=>1-v);
}
function floorPeople(geo,occupied){
  if(!topIsOpen()||!peopleEnabled())return [];
  const density=clamp(Number(settings.peopleDensity)||0,0,100)/100;
  // Denser longitudinal spacing so 100% genuinely looks busy.
  const along=Math.max(10,Math.round(geo.len/6));
  const across=floorPeopleAcrossFractions(geo);
  const lift=headingClockLift(geo);
  const out=[];
  for(let i=1;i<=along;i++){
    const s=i/(along+1);
    for(let j=0;j<across.length;j++){
      const t=across[j];
      const seed=seedKey(geo.a.x,geo.a.y,geo.b.x,geo.b.y,11,i,j);
      if(density<1&&hash01(seed)>density)continue;
      const p=floorPoint(geo.floor,s,t);
      const person=makePerson({x:p.x,y:p.y-2-lift},seed,'floor',MASK_FOREGROUND);
      if(occupied&&floorPeopleFootprint(person.face.x,person.face.y).some(q=>occupied.has(`${q.x},${q.y}`)))continue;
      if(occupied)for(const q of floorPeopleFootprint(person.face.x,person.face.y))occupied.add(`${q.x},${q.y}`);
      out.push(person);
    }
  }
  return out;
}
function stairPeople(stair,occupied){
  if(!peopleEnabled())return [];
  const density=clamp(Number(settings.peopleDensity)||0,0,100)/100;
  const ts=stairTreadFractions(stair);
  const out=[];
  for(let i=0;i<ts.length;i++){
    const t=ts[i];
    const seed=seedKey(stair.top0.x,stair.top0.y,stair.ground0.x,stair.ground0.y,23,i);
    if(hash01(seed)>density*0.85)continue;
    const lateral=(stair.mode==='centre'?(i%2?0.38:0.62):0.5);
    const [a,b]=stairCrossLine(stair,t),p=lerp(a,b,lateral);
    const person=makePerson({x:p.x,y:p.y-2},seed,stair.isNearEnd?'frontStair':'rearStair',stair.isNearEnd?MASK_FOREGROUND:MASK_BACKGROUND);
    if(occupied&&peopleFootprint(person.face.x,person.face.y).some(q=>occupied.has(`${q.x},${q.y}`)))continue;
    if(occupied)for(const q of peopleFootprint(person.face.x,person.face.y))occupied.add(`${q.x},${q.y}`);
    out.push(person);
  }
  return out;
}
function bridgePeople(geo,stairs){
  const occupied=new Set(),out=[];
  out.push(...floorPeople(geo,occupied));
  for(const stair of stairs)out.push(...stairPeople(stair,occupied));
  out.sort((a,b)=>a.face.y-b.face.y||a.face.x-b.face.x);
  return out;
}
function repaintVisibleSideOverPeople(ctx,backdrop,geo){
  const dark=familyColour('dark');
  let n=0;
  n+=paintConvexFace(ctx,backdrop,geo.side,dark,dark);
  n+=paintCoveredFace(ctx,backdrop,geo.side,dark);
  for(const p of fullSupercoverLinePoints(geo.sideBottomEdge[0],geo.sideBottomEdge[1],geo.side))
    if(setBackdrop(ctx,backdrop,p.x,p.y,dark))n++;
  return n;
}
function repaintStairSidesOverPeople(ctx,backdrop,stairs,front){
  let n=0;
  if(settings.stairSides!=='solid')return 0;
  for(const stair of stairs)if(stair.paintFront===front)n+=paintStairSidePanels(ctx,backdrop,stair);
  return n;
}
function paintOpenTopDefinition(ctx,backdrop,geo){
  if(!topIsOpen())return 0;
  let n=0;
  n+=paintLine(ctx,backdrop,geo.a0,geo.b0,familyColour('light'));
  n+=paintLine(ctx,backdrop,geo.a1,geo.b1,familyColour('soft'));
  if(settings.sunlitTop){
    const [a,b]=facingTopEdge(geo);
    n+=paintLine(ctx,backdrop,a,b,sunlitTopColour());
  }
  n+=paintOpenTopBeams(ctx,backdrop,geo);
  return n;
}
function applyOcclusionMask(ctx,mask,geo,legs,stairs,people){
  const body=new Set();collectCuboidPixels(body,ctx,geo);
  let changed=0;
  for(const i of body){if(mask[i]!==MASK_FOREGROUND)changed++;mask[i]=MASK_FOREGROUND;}
  const legOcc=addLegsToMask(ctx,mask,legs,body);
  const stairOcc=addStairsToMask(ctx,mask,stairs,body);
  const peopleOcc=addPeopleToMask(ctx,mask,people||[],body);
  return {
    foregroundWritten:body.size,
    changed:changed+legOcc.changed+stairOcc.changed+peopleOcc.changed,
    ...legOcc,
    stairNearWritten:stairOcc.nearWritten,
    stairFarWritten:stairOcc.farWritten,
    peopleFgWritten:peopleOcc.peopleFgWritten,
    peopleBgWritten:peopleOcc.peopleBgWritten
  };
}

function render(ctx){
  const geo=bridgeGeometry(ctx.geometry);if(!geo)return {message:'Footbridge: draw a Line at least 4 px long.'};
  const backdrop=ctx.layer('backdrop'),foreground=ctx.layer('foreground');
  const legs=bridgeLegGeometry(geo);
  const stairs=bridgeStairGeometry(geo);
  const visualGeo=visualBridgeGeometry(geo);
  const people=bridgePeople(visualGeo,stairs);

  // Projected ground shadow first so the structure paints over it cleanly.
  paintStructureShadow(ctx,backdrop,visualGeo,legs,stairs);

  // Far/highest legs and stairs are Background and are painted first.
  paintLegs(ctx,backdrop,legs,false);
  paintStairs(ctx,backdrop,stairs,false);
  paintPeople(ctx,backdrop,people,'rearStair');
  repaintStairSidesOverPeople(ctx,backdrop,stairs,false);

  paintCuboid(ctx,backdrop,visualGeo);
  // Floor people stand inside the bridge: paint them on the deck, then repaint
  // the facing side wall so nobody can show through the side panel.
  paintPeople(ctx,backdrop,people,'floor');
  repaintVisibleSideOverPeople(ctx,backdrop,visualGeo);
  paintOpenTopDefinition(ctx,backdrop,visualGeo);

  // Near/lower legs and stairs are Foreground.
  paintLegs(ctx,backdrop,legs,true);
  paintStairs(ctx,backdrop,stairs,true);
  paintPeople(ctx,backdrop,people,'frontStair');
  repaintStairSidesOverPeople(ctx,backdrop,stairs,true);

  // Cut visible relocated entrances last.  This prevents the top of a
  // foreground side stair from painting over and visually narrowing the doorway.
  paintVisibleSideEntrances(ctx,backdrop,stairs);

  const occ=applyOcclusionMask(ctx,foreground,visualGeo,legs,stairs,people);
  const stairsActive=stairChoicesActive();
  const peopleCount=people.length;
  return {message:`Footbridge committed · ${settings.endStyle} ends · body width ${geo.width}px (projected ${geo.projectedWidth.toFixed(1)}px) × depth ${geo.depth}px${visualGeo.visualNearWallDrop?` · near wall drop ${visualGeo.visualNearWallDrop}px`:''}${settings.legStyle!=='none'?` · ${settings.legStyle} legs ${settings.legHeight}px + perspective`:''}${stairsActive?` · front ${settings.frontStairs} · rear ${settings.rearStairs} · ${settings.stairBack}${settings.stairSides==='solid'?' + sides':''} · shared height ${settings.legHeight}px`:''}${topIsOpen()?` · open top/open ends · ${settings.crossBeams?`cross beams ${clamp(Math.round((22-settings.beamSpacing)/2),1,9)}/9`:'cross beams off'}${settings.sunlitTop?' · sunlit edges':''}`:''}${settings.shadowMode!=='none'?` · shadow ${settings.shadowMode}/${settings.shadowLength}`:''}${peopleCount?` · people ${peopleCount} @ ${settings.peopleDensity}%`:''} · near opening @ ${geo.nearPoint.x},${geo.nearPoint.y} · far end @ ${geo.farPoint.x},${geo.farPoint.y} · Foreground body ${occ.foregroundWritten} px${settings.legStyle!=='none'?` · near legs FG ${occ.nearWritten} px · far legs BG ${occ.farWritten} px`:''}${stairsActive?` · stair FG ${occ.stairNearWritten} px · stair BG ${occ.stairFarWritten} px`:''}${peopleCount?` · people FG ${occ.peopleFgWritten} px · people BG ${occ.peopleBgWritten} px`:''}.`};
}

function mountControls(container,ctx){
  let topControls=null,beamFrequencyControl=null,shadowControls=null;
  const syncTopControls=()=>{
    if(topControls)topControls.hidden=settings.topStyle!=='open';
    if(beamFrequencyControl?.parentElement)beamFrequencyControl.parentElement.hidden=!settings.crossBeams;
  };
  const syncShadowControls=()=>{
    if(shadowControls)shadowControls.hidden=settings.shadowMode==='none';
  };

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
  ctx.ui.select(container,{label:'Top',value:settings.topStyle,options:TOP_STYLE_OPTIONS,onChange:value=>{settings.topStyle=value;syncTopControls();}});

  topControls=document.createElement('div');
  container.appendChild(topControls);
  ctx.ui.checkbox(topControls,{label:'Cross beams',checked:settings.crossBeams,onChange:value=>{settings.crossBeams=!!value;syncTopControls();}});
  beamFrequencyControl=ctx.ui.slider(topControls,{label:'Cross beam frequency',min:1,max:9,step:1,value:clamp(Math.round((22-settings.beamSpacing)/2),1,9),onInput:value=>{settings.beamSpacing=clamp(22-2*Math.round(Number(value)||1),4,20);}});
  ctx.ui.checkbox(topControls,{label:'Sunlit top edges',checked:settings.sunlitTop,onChange:value=>{settings.sunlitTop=!!value;}});
  ctx.ui.select(topControls,{label:'Near wall drop',value:settings.nearWallDrop,options:NEAR_WALL_DROP_OPTIONS,onChange:value=>{settings.nearWallDrop=value;}});

  ctx.ui.slider(container,{label:'People density',min:0,max:100,step:5,value:settings.peopleDensity,onInput:value=>{settings.peopleDensity=value;}});
  ctx.ui.select(container,{label:'Shadow',value:settings.shadowMode,options:SHADOW_OPTIONS,onChange:value=>{settings.shadowMode=value;syncShadowControls();}});
  shadowControls=document.createElement('div');
  container.appendChild(shadowControls);
  ctx.ui.slider(shadowControls,{label:'Shadow length',min:2,max:16,step:1,value:settings.shadowLength,onInput:value=>{settings.shadowLength=value;}});

  syncTopControls();
  syncShadowControls();
}

S.register({
  id:'footbridge',
  name:'Footbridge',
  version:VERSION,
  category:'Scenery',
  status:'prototype',
  description:'Line-only Footbridge with independent Front and Rear Direct stair choices: None, Left, Centre or Right. Direct Centre follows Body width; Direct Left/Right keep a fixed compact tread width independent of Body width. Exact 3:00/9:00 headings preserve user draw direction so the structure mirrors correctly. Open Top exposes the internal walking floor/deck, keeps both long side faces solid, and can add optional periodic cross-beams with adjustable frequency. An optional Sunlit top edges toggle brightens the cross-beams and the single facing top edge, using a pale/neutral highlight where appropriate. Open-top floor people rise an extra pixel at near-horizontal headings so they remain visible by 3 o’clock. Solid stair sides are raised into proper low parapets along the full stair run. Foreground masking remains everything Foreground except the far/highest stairs and legs.',
  supportedModes:['backdrop'],
  supportedTools:['line'],
  layers:['backdrop','foreground'],
  mountControls,
  preview:render,
  apply:render
});

})(typeof globalThis!=='undefined'?globalThis:this);
