(function(root){
'use strict';

/* Tents Special Function v1.002
 * Based on the retail tent/market-stall motifs in the supplied IHBR brush.
 * A straight Line defines the FRONT GROUND EDGE; the canopy extends away
 * from that line. Roofs are true four-corner surfaces, not brush-stretched
 * sprites. Their two-colour bands follow the roof's own UV coordinates.
 * The optional walls are independently striped, plain or absent (stilts).
 */
const S=root.IndyHeatSpecialFunctions;if(!S?.register)return;
const VERSION='1.002';
const settings={
  shape:'gable',facing:'inward',depth:18,height:10,rise:6,
  colourA:'white',colourB:'red',stripeWidthA:5,stripeWidthB:5,stripeDirection:'frontage',
  sides:'striped',flags:true,flagColour:'green',
  shadowDirection:'none',shadowLength:5,layerMode:'foreground'
};
const COLOURS=Object.freeze({
  white:{light:3,main:7,dark:6},
  red:{light:31,main:30,dark:29},
  yellow:{light:11,main:23,dark:21},
  blue:{light:15,main:14,dark:12},
  green:{light:27,main:26,dark:25},
  orange:{light:9,main:10,dark:20},
  lilac:{light:17,main:16,dark:15},
  grey:{light:7,main:6,dark:5},
  black:{light:5,main:4,dark:1}
});
const choices=values=>values.map(([value,label])=>({value,label}));
const colourChoices=choices([
  ['white','White'],['red','Red'],['yellow','Yellow'],['blue','Blue'],
  ['green','Green'],['orange','Orange'],['lilac','Lilac'],['grey','Grey'],['black','Black']
]);
function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
function P(x,y){return {x,y};}
function add(a,b){return P(a.x+b.x,a.y+b.y);}
function lerp(a,b,t){return P(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);}
function up(a,h){return P(a.x,a.y-h);}
function uv(p,u,v){return {x:p.x,y:p.y,u,v};}
function inBounds(ctx,x,y){return x>=0&&y>=0&&x<ctx.width&&y<ctx.height;}
function round(p){return P(Math.round(p.x),Math.round(p.y));}
function tone(key,role='light'){return (COLOURS[key]||COLOURS.white)[role];}
/* Stripe widths are measured in displayed pixel columns/rows, not in the
   Euclidean length of an angled baseline. A 45-degree line covers more world
   distance than screen columns; scaling by that length visibly broadens each
   stripe. The dominant raster axis is the stable measure at every angle. */
function projectedSpan(a,b){
  return Math.max(1,Math.max(Math.abs(Math.round(b.x)-Math.round(a.x)),Math.abs(Math.round(b.y)-Math.round(a.y))));
}
function geometry(ctx){
  const g=ctx.geometry||{};
  if(g.tool!=='line'||!g.start||!g.end)return null;
  const f0=P(Number(g.start.x),Number(g.start.y)),f1=P(Number(g.end.x),Number(g.end.y));
  if(![f0.x,f0.y,f1.x,f1.y].every(Number.isFinite))return null;
  const dx=f1.x-f0.x,dy=f1.y-f0.y,len=Math.hypot(dx,dy);
  if(len<3)return null;
  const centre=P((f0.x+f1.x)/2,(f0.y+f1.y)/2),midScreen=P(ctx.width/2,ctx.height/2);
  const unit=P(-dy/len,dx/len),towards=P(midScreen.x-centre.x,midScreen.y-centre.y);
  const facingSign=(unit.x*towards.x+unit.y*towards.y)>=0?1:-1;
  const sign=settings.facing==='inward'?-facingSign:facingSign;
  const depth=clamp(Number(settings.depth)||18,3,65);
  /* Pixel-art game perspective: the depth's screen-Y component is reduced.
     The screen-quarter facing check above uses the true perpendicular. */
  const shift=P(unit.x*depth*sign,unit.y*depth*sign*.67);
  const b0=add(f0,shift),b1=add(f1,shift);
  const height=clamp(Number(settings.height)||10,3,30),rise=clamp(Number(settings.rise)||6,1,24);
  const A=up(f0,height),B=up(f1,height),C=up(b1,height),D=up(b0,height);
  const ridgeFront=up(lerp(A,B,.5),rise),ridgeBack=up(lerp(D,C,.5),rise);
  const apex=up(lerp(lerp(A,B,.5),lerp(D,C,.5),.5),rise);
  return {f0,f1,b0,b1,A,B,C,D,ridgeFront,ridgeBack,apex,len,depth,height,rise,
    frontagePixels:projectedSpan(A,B),depthPixels:projectedSpan(A,D)};
}
function makePainter(ctx){
  const pixels=ctx.layer('backdrop'),w=ctx.width,h=ctx.height,structure=new Set();
  const valid=ctx.helpers?.validIndex||((v)=>clamp(Math.round(v),0,31));
  function put(x,y,c,struct=true){
    x=Math.round(x);y=Math.round(y);if(!inBounds(ctx,x,y))return false;
    const idx=y*w+x;pixels[idx]=valid(c);if(struct)structure.add(idx);return true;
  }
  function line(a,b,c,struct=true){
    a=round(a);b=round(b);let x=a.x,y=a.y,dx=Math.abs(b.x-x),dy=Math.abs(b.y-y),sx=x<b.x?1:-1,sy=y<b.y?1:-1,err=dx-dy;
    for(;;){put(x,y,c,struct);if(x===b.x&&y===b.y)break;const e2=2*err;if(e2>-dy){err-=dy;x+=sx;}if(e2<dx){err+=dx;y+=sy;}}
  }
  function tri(a,b,c,colourAt){
    const ax=a.x,ay=a.y,bx=b.x,by=b.y,cx=c.x,cy=c.y;
    const denominator=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);
    if(Math.abs(denominator)<1e-7)return;
    const xmin=clamp(Math.floor(Math.min(ax,bx,cx)),0,w-1),xmax=clamp(Math.ceil(Math.max(ax,bx,cx)),0,w-1);
    const ymin=clamp(Math.floor(Math.min(ay,by,cy)),0,h-1),ymax=clamp(Math.ceil(Math.max(ay,by,cy)),0,h-1);
    for(let y=ymin;y<=ymax;y++)for(let x=xmin;x<=xmax;x++){
      const px=x+.5,py=y+.5;
      const wa=((by-cy)*(px-cx)+(cx-bx)*(py-cy))/denominator;
      const wb=((cy-ay)*(px-cx)+(ax-cx)*(py-cy))/denominator;
      const wc=1-wa-wb;
      if(wa<-.00001||wb<-.00001||wc<-.00001)continue;
      const u=wa*a.u+wb*b.u+wc*c.u,v=wa*a.v+wb*b.v+wc*c.v;
      put(x,y,colourAt(u,v,x,y));
    }
  }
  function quad(a,b,c,d,colourAt){
    tri(a,b,c,colourAt);tri(a,c,d,colourAt);
    /* Diagonal/steep edges are explicitly rasterised after the polygon. This
       closes the one-pixel holes that otherwise occur at perspective joins. */
    const edge=(v0,v1)=>{
      const x0=round(v0),x1=round(v1),steps=Math.max(Math.abs(x1.x-x0.x),Math.abs(x1.y-x0.y),1)*2;
      for(let i=0;i<=steps;i++){
        const t=i/steps;put(v0.x+(v1.x-v0.x)*t,v0.y+(v1.y-v0.y)*t,colourAt(v0.u+(v1.u-v0.u)*t,v0.v+(v1.v-v0.v)*t));
      }
    };
    edge(a,b);edge(b,c);edge(c,d);edge(d,a);
  }
  function triangle(a,b,c,colourAt){
    tri(a,b,c,colourAt);
    const verts=[a,b,c];
    for(let e=0;e<3;e++){
      const v0=verts[e],v1=verts[(e+1)%3],steps=Math.max(Math.abs(v1.x-v0.x),Math.abs(v1.y-v0.y),1)*2;
      for(let k=0;k<=steps;k++){
        const t=k/steps;put(v0.x+(v1.x-v0.x)*t,v0.y+(v1.y-v0.y)*t,colourAt(v0.u+(v1.u-v0.u)*t,v0.v+(v1.v-v0.v)*t));
      }
    }
  }
  return {pixels,structure,put,line,quad,triangle};
}
function stripeAt(distance){
  /* A repeating pair of stripes: independent pixel widths in both colours.
     Width 1 must remain a genuine single-pixel stripe, even at an angle. */
  const a=clamp(Math.round(Number(settings.stripeWidthA)||1),1,20);
  const b=clamp(Math.round(Number(settings.stripeWidthB)||1),1,20);
  const period=a+b;
  const pixel=Math.floor(distance+1e-6);
  const t=((pixel%period)+period)%period;
  return t<a?settings.colourA:settings.colourB;
}
function stripeChoice(u,v,width,depth){
  return stripeAt(settings.stripeDirection==='depth'?v*depth:u*width);
}
function roofColour(u,v,width,depth,shaded){
  const key=stripeChoice(u,v,width,depth);
  return tone(key,shaded?'main':'light');
}
function wallColour(u,v,width,shaded){
  if(settings.sides==='solid')return tone(settings.colourA,shaded?'main':'light');
  return tone(stripeAt(u*width),shaded?'main':'light');
}
function paintShadow(ctx,p,g){
  if(settings.shadowDirection==='none'||!Number(settings.shadowLength))return;
  const len=clamp(Number(settings.shadowLength),0,18);
  const directions={
    'left-down':[-1,1],'right-down':[1,1],
    'left-up':[-1,-1],'right-up':[1,-1],
    left:[-1,0],right:[1,0],up:[0,-1],down:[0,1]
  };
  const [vx,vy]=directions[settings.shadowDirection]||[1,1];
  const sx=vx*len,sy=vy*(vx===0?len:Math.max(1,Math.round(len*.5)));
  const w=ctx.width,h=ctx.height,base=ctx.baseLayer?.('backdrop')||p.pixels;
  const dark={2:19,3:7,7:6,6:5,5:4,19:10,10:20,20:8,8:4,9:20,11:23,23:21,21:22,22:8,24:4,25:24,26:25,27:26,28:4,29:28,30:29,31:30,14:12,15:14,16:15,17:16};
  const corners=[g.f0,g.f1,g.b1,g.b0],minX=Math.max(0,Math.floor(Math.min(...corners.map(a=>a.x))+Math.min(0,sx))),maxX=Math.min(w-1,Math.ceil(Math.max(...corners.map(a=>a.x))+Math.max(0,sx))),minY=Math.max(0,Math.floor(Math.min(...corners.map(a=>a.y))+Math.min(0,sy))),maxY=Math.min(h-1,Math.ceil(Math.max(...corners.map(a=>a.y))+Math.max(0,sy)));
  /* Low-cost footprint shadow: two ground-plan triangles, offset consistently
     down and sideways. It never marks the Foreground collision/occlusion mask. */
  const polys=[[g.f0,g.f1,g.b1],[g.f0,g.b1,g.b0]];
  function insideTri(px,py,a,b,c){
    const d=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(d)<1e-8)return false;
    const u=((b.y-c.y)*(px-c.x)+(c.x-b.x)*(py-c.y))/d;
    const v=((c.y-a.y)*(px-c.x)+(a.x-c.x)*(py-c.y))/d;
    return u>=0&&v>=0&&u+v<=1;
  }
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
    if(!polys.some(([a,b,c])=>insideTri(x-sx+.5,y-sy+.5,a,b,c)))continue;
    const i=y*w+x,source=base[i],dst=dark[source];if(dst!=null)p.pixels[i]=dst;
  }
}
function paintWalls(g,p){
  const {f0,f1,b0,b1,A,B,C,D}=g;
  /* Sort whole faces back-to-front on screen. No facade disappears when the
     baseline is rotated into the vertical clock-face quadrants. */
  const faces=[
    {corners:[D,C,b1,b0],width:g.frontagePixels,shade:true,mean:(b0.y+b1.y)/2},
    {corners:[A,B,f1,f0],width:g.frontagePixels,shade:false,mean:(f0.y+f1.y)/2},
    {corners:[D,A,f0,b0],width:g.depthPixels,shade:true,mean:(f0.y+b0.y)/2},
    {corners:[B,C,b1,f1],width:g.depthPixels,shade:false,mean:(f1.y+b1.y)/2}
  ];
  if(settings.sides!=='none'){
    faces.sort((a,b)=>a.mean-b.mean);
    for(const face of faces){const [a,b,c,d]=face.corners;p.quad(uv(a,0,0),uv(b,1,0),uv(c,1,1),uv(d,0,1),(u,v)=>wallColour(u,v,face.width,face.shade));}
  }
  /* Poles from roof eave to ground remain present when tent walls are off.
     Mid-front poles keep long striped market awnings visibly supported. */
  const corners=[[A,f0],[B,f1],[C,b1],[D,b0]];
  for(const [top,ground] of corners){p.line(top,ground,5);p.put(ground.x,ground.y,4);}
  const count=Math.floor(g.len/18);
  if(settings.sides==='none'&&count>0){for(let i=1;i<=count;i++){
    const t=i/(count+1),top=lerp(A,B,t),foot=lerp(f0,f1,t);p.line(top,foot,5);p.put(foot.x,foot.y,4);
  }}
}
function roofFace(p,g,frontLeft,frontRight,rearRight,rearLeft,shaded){
  p.quad(frontLeft,frontRight,rearRight,rearLeft,(u,v)=>roofColour(u,v,g.frontagePixels,g.depthPixels,shaded));
}
function paintRoof(g,p){
  const {A,B,C,D,ridgeFront:R,ridgeBack:T,apex:X}=g;
  const roofStyle=settings.shape;
  if(roofStyle==='awning'){
    /* Entirely striped single-slope awning, commonly seen on retail stalls. */
    const rearLift=Math.max(1,Math.round(g.rise*.6));
    const bD=up(D,rearLift),bC=up(C,rearLift);
    roofFace(p,g,uv(A,0,0),uv(B,1,0),uv(bC,1,1),uv(bD,0,1),false);
    p.line(A,B,6);p.line(bD,bC,7);
  }else if(roofStyle==='pavilion'){
    /* One apex, four genuinely planar striped roof faces. */
    const c=uv(X,.5,.5);
    const triangles=[
      {a:uv(A,0,0),b:uv(B,1,0),d:c,shade:false},
      {a:uv(B,1,0),b:uv(C,1,1),d:c,shade:true},
      {a:uv(C,1,1),b:uv(D,0,1),d:c,shade:true},
      {a:uv(D,0,1),b:uv(A,0,0),d:c,shade:false}
    ];
    triangles.sort((a,b)=>((a.a.y+a.b.y)/2)-((b.a.y+b.b.y)/2));
    for(const face of triangles)p.triangle(face.a,face.b,face.d,(u,v)=>roofColour(u,v,g.frontagePixels,g.depthPixels,face.shade));
    p.line(X,A,7);p.line(X,B,7);p.line(X,C,6);p.line(X,D,6);
  }else{
    /* Twin sloping quadrilateral roof planes; each roof band is defined in
       the same 3D UV field, so the stripes do not stretch or break at angles. */
    const planes=[
      {coords:[uv(A,0,0),uv(R,.5,0),uv(T,.5,1),uv(D,0,1)],shade:false,mean:(A.y+D.y)/2},
      {coords:[uv(R,.5,0),uv(B,1,0),uv(C,1,1),uv(T,.5,1)],shade:true,mean:(B.y+C.y)/2}
    ];
    planes.sort((a,b)=>a.mean-b.mean);
    for(const plane of planes)roofFace(p,g,...plane.coords,plane.shade);
    p.line(R,T,7);
  }
  /* Retail tents use a narrow coloured valance on visible roof edges. */
  function valance(a,b){
    const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y))*2);
    const xAxis=Math.abs(b.x-a.x)>=Math.abs(b.y-a.y);
    const colourAtPoint=point=>{
      /* Front edge runs use the EXACT dominant-axis pixel offset; sampling
         t*EuclideanLength makes neighbouring 1px bands alternate in width. */
      const axis=xAxis?Math.round(point.x)-Math.round(a.x):Math.round(point.y)-Math.round(a.y);
      return stripeAt(Math.abs(axis));
    };
    /* Paint dark trim first, then the top edge. The reverse can overwrite an
       adjacent colour on diagonal roofs where rounded pixels share a row. */
    for(let i=0;i<=steps;i++){
      const where=lerp(a,b,i/steps),key=colourAtPoint(where);
      p.put(where.x,where.y+1,tone(key,'dark'));
    }
    for(let i=0;i<=steps;i++){
      const where=lerp(a,b,i/steps),key=colourAtPoint(where);
      p.put(where.x,where.y,tone(key,'main'));
    }
  }
  valance(A,B);valance(D,C);
  p.line(A,D,6);p.line(B,C,5);
}
function flagAnchors(g){
  /* Distribute pennants by distance ALONG THE DRAWN FRONT EDGE, not X.
     Horizontal, vertical and angled tents get the same relative positions. */
  const count=clamp(Math.round(g.len/30),1,4);
  if(settings.shape==='pavilion'&&count===1)return [g.apex];
  const anchors=[];
  for(let i=0;i<count;i++){
    const t=(i+.5)/count;
    const front=lerp(g.A,g.B,t),back=lerp(g.D,g.C,t);
    if(settings.shape==='awning'){
      anchors.push(up(lerp(front,back,.7),g.rise*.6*.7));
    }else if(settings.shape==='pavilion'){
      /* Each point sits on the near/front triangular roof slope. */
      anchors.push(lerp(front,g.apex,Math.min(.85,2*Math.min(t,1-t))));
    }else{
      /* Gable lift varies across frontage; the ridge is at its midpoint. */
      anchors.push(up(lerp(front,back,.22),g.rise*(1-Math.abs(2*t-1))));
    }
  }
  return anchors;
}
function paintFlags(g,p){
  if(!settings.flags)return;
  const tops=flagAnchors(g);
  for(let i=0;i<tops.length;i++){
    /* Retail flags are actual little pennants, not three isolated pixels.
       Use a taller pole and a 6x4 solid, tapered cloth with a highlighted rim. */
    const a=tops[i],poleTop=up(a,9),main=tone(settings.flagColour,'light'),
      shade=tone(settings.flagColour,'dark'),middle=tone(settings.flagColour,'main');
    p.line(a,poleTop,4);p.put(poleTop.x,poleTop.y-1,7);
    const direction=(i&1)?-1:1;
    for(let row=0;row<4;row++){
      const width=row===0?5:row===1?6:row===2?5:3;
      for(let col=1;col<=width;col++){
        const colour=row===0?main:row>=2?shade:col===width?main:middle;
        p.put(poleTop.x+direction*col,poleTop.y+row,colour);
      }
    }
  }
}
function render(ctx){
  const g=geometry(ctx);if(!g)return {message:'Tents: draw a straight Line (at least 3px) along the front ground edge.'};
  const p=makePainter(ctx);
  paintShadow(ctx,p,g);
  paintWalls(g,p);
  paintRoof(g,p);
  paintFlags(g,p);
  const foreground=ctx.layer('foreground');
  const maskValue=settings.layerMode==='foreground'?0:1;
  for(const i of p.structure)foreground[i]=maskValue;
  return {message:`Tents · ${settings.shape} · ${Math.round(g.len)}px frontage · depth ${Math.round(g.depth)}px · ${settings.sides==='none'?'open on stilts':settings.sides+' sides'} · ${settings.colourA}/${settings.colourB} stripes · ${p.structure.size}px.`};
}
function mountControls(container,ctx){
  ctx.ui.select(container,{label:'Roof shape',value:settings.shape,options:choices([['gable','Gable (pitched)'],['pavilion','Pavilion (peak)'],['awning','Awning (single slope)']]),onChange:v=>{settings.shape=v;}});
  ctx.ui.select(container,{label:'Facing',value:settings.facing,options:choices([['inward','Inwards'],['outward','Outwards']]),onChange:v=>{settings.facing=v;}});
  ctx.ui.slider(container,{label:'Depth',min:3,max:65,step:1,value:settings.depth,onInput:v=>{settings.depth=v;}});
  ctx.ui.slider(container,{label:'Side height',min:3,max:30,step:1,value:settings.height,onInput:v=>{settings.height=v;}});
  ctx.ui.slider(container,{label:'Roof rise',min:1,max:24,step:1,value:settings.rise,onInput:v=>{settings.rise=v;}});
  ctx.ui.select(container,{label:'Stripe colour 1',value:settings.colourA,options:colourChoices,onChange:v=>{settings.colourA=v;}});
  ctx.ui.select(container,{label:'Stripe colour 2',value:settings.colourB,options:colourChoices,onChange:v=>{settings.colourB=v;}});
  ctx.ui.slider(container,{label:'Stripe 1 width',min:1,max:20,step:1,value:settings.stripeWidthA,onInput:v=>{settings.stripeWidthA=v;}});
  ctx.ui.slider(container,{label:'Stripe 2 width',min:1,max:20,step:1,value:settings.stripeWidthB,onInput:v=>{settings.stripeWidthB=v;}});
  ctx.ui.select(container,{label:'Roof stripe direction',value:settings.stripeDirection,options:choices([['frontage','Along frontage'],['depth','Along depth']]),onChange:v=>{settings.stripeDirection=v;}});
  ctx.ui.select(container,{label:'Sides',value:settings.sides,options:choices([['none','Open (stilts)'],['striped','Striped walls'],['solid','Plain walls']]),onChange:v=>{settings.sides=v;}});
  ctx.ui.checkbox(container,{label:'Flags',checked:settings.flags,onChange:v=>{settings.flags=v;}});
  ctx.ui.select(container,{label:'Flag colour',value:settings.flagColour,options:colourChoices,onChange:v=>{settings.flagColour=v;}});
  ctx.ui.select(container,{label:'Shadow direction',value:settings.shadowDirection,options:choices([
    ['none','None'],['left-down','Left / Down'],['right-down','Right / Down'],
    ['left-up','Left / Up'],['right-up','Right / Up'],['left','Left'],
    ['right','Right'],['up','Up'],['down','Down']
  ]),onChange:v=>{settings.shadowDirection=v;}});
  ctx.ui.slider(container,{label:'Shadow length',min:0,max:18,step:1,value:settings.shadowLength,onInput:v=>{settings.shadowLength=v;}});
  ctx.ui.select(container,{label:'Layer',value:settings.layerMode,options:choices([['foreground','Foreground'],['background','Background']]),onChange:v=>{settings.layerMode=v;}});
}
S.register({
  id:'tents',name:'Tents',version:VERSION,category:'Scenery',status:'prototype',
  description:'Line-based retail-style tents with independent exact pixel-width stripes (including 1px), full-size flags distributed along frontage, three roofs, optional walls/stilts and eight shadow directions.',
  supportedModes:['backdrop'],supportedTools:['line'],layers:['backdrop','foreground'],
  mountControls,preview:render,apply:render
});
})(typeof globalThis!=='undefined'?globalThis:this);
