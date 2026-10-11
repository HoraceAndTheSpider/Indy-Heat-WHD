(function(root){
'use strict';

/* Buildings Special Function v1.004.
 * The Line defines one ground-plane edge of a complete cuboid. Its depth
 * vector is computed PERPENDICULAR to that edge, so all four wall faces and
 * the roof survive the full clock-face rotation. A chosen facade can be the
 * line face or either angled end; Auto chooses the nearest usable elevation.
 * All drawing stays in the native 32-colour Indy Heat track palette.
 */
const S=root.IndyHeatSpecialFunctions;if(!S?.register)return;
const VERSION='1.004';
const settings={
  wall:'peach',height:26,depth:28,roof:'pitched',roofColour:'match',roofPitch:5,
  roofSide:'left',roofDetail:35,frontFace:'auto',
  windows:'rectangular',windowColour:'auto',spacing:9,
  door:'none',doorPosition:'centre',sideWindows:true,
  trim:false,shadow:4,shadowDirection:'right-down',layerMode:'foreground'
};
const WALLS=Object.freeze({
  /* All colours are verified native Indy Heat 32-colour indices. Windows
   * default to the darker shade of the wall's OWN material, never black.
   * Main/light/dark also separate sunny and shaded walls of the cuboid. */
  peach:{main:10,light:19,dark:20,detail:8,glass:8,glint:19},
  terracotta:{main:20,light:10,dark:8,detail:9,glass:8,glint:10},
  brick:{main:8,light:20,dark:4,detail:20,glass:4,glint:10},
  red:{main:29,light:30,dark:28,detail:30,glass:28,glint:30},
  gold:{main:21,light:23,dark:22,detail:20,glass:8,glint:19},
  green:{main:25,light:26,dark:24,detail:26,glass:24,glint:27},
  palegreen:{main:26,light:27,dark:25,detail:24,glass:24,glint:27},
  blue:{main:14,light:15,dark:12,detail:15,glass:12,glint:16},
  lilac:{main:16,light:17,dark:15,detail:14,glass:14,glint:17},
  cream:{main:19,light:2,dark:10,detail:20,glass:8,glint:2},
  grey:{main:6,light:7,dark:5,detail:4,glass:4,glint:7}
});
const ROOFS=Object.freeze({
  /* Bright roof planes are deliberately distinct from equally coloured wall
   * families: e.g. red wall 29/28, red roof 31/30 with 29 shadow. */
  slate:{main:5,light:6,dark:4,detail:4},
  peach:{main:19,light:2,dark:10,detail:20},
  brick:{main:20,light:10,dark:8,detail:9},
  palegreen:{main:27,light:26,dark:25,detail:24},
  cream:{main:2,light:3,dark:19,detail:10},
  grey:{main:7,light:3,dark:6,detail:5},
  charcoal:{main:4,light:5,dark:4,detail:6},
  terracotta:{main:9,light:10,dark:20,detail:19},
  red:{main:31,light:30,dark:29,detail:28},
  blue:{main:16,light:17,dark:14,detail:15},
  lilac:{main:17,light:16,dark:15,detail:14},
  green:{main:27,light:26,dark:25,detail:24},
  yellow:{main:23,light:11,dark:21,detail:22}
});
/* 'Match building' selects a roof from the wall's colour family. Its roof
 * shades deliberately differ from the wall shades to retain readable planes. */
const ROOF_MATCH=Object.freeze({
  peach:'peach',terracotta:'terracotta',brick:'brick',red:'red',
  gold:'yellow',green:'green',palegreen:'palegreen',blue:'blue',
  lilac:'lilac',cream:'cream',grey:'grey'
});
const WINDOW_COLOURS=Object.freeze({
  /* Explicit overrides only. Auto always selects a wall-matched recess. */
  charcoal:{glass:4,frame:5,highlight:6},
  blue:{glass:12,frame:14,highlight:16},
  reflective:{glass:14,frame:16,highlight:17},
  warm:{glass:8,frame:20,highlight:19},
  light:{glass:5,frame:6,highlight:7}
});
const choose=entries=>entries.map(([value,label])=>({value,label}));
const WALL_OPTIONS=choose([
  ['peach','Peach / California'],['terracotta','Terracotta / orange'],['brick','Brown brick'],
  ['red','Red'],['gold','Ochre / yellow'],['green','Green'],['palegreen','Lime'],
  ['blue','Blue'],['lilac','Lilac'],['cream','Cream'],['grey','Grey']
]);
const ROOF_OPTIONS=choose([
  ['flat','Flat'],['parapet','Flat / parapet'],['pitched','Pitched ridge'],
  ['gable','Gable end'],['hip','Hipped roof'],['tiled','Tiled roof'],
  ['sawtooth','Sawtooth factory'],['skylights','Flat / skylights'],['stepped','Stepped roof']
]);
const ROOF_COLOURS=choose([
  ['match','Match building'],['slate','Slate grey'],['charcoal','Charcoal grey'],['terracotta','Terracotta'],
  ['red','Red'],['blue','Blue'],['lilac','Lilac'],['green','Green'],['yellow','Ochre']
]);
const FACE_OPTIONS=choose([
  ['auto','Auto / visible front'],['line','Drawn line'],
  ['left','Left angled end'],['right','Right angled end']
]);
const WINDOW_OPTIONS=choose([
  ['none','None'],['slits','Small retail slits'],['tall','Tall narrow'],
  ['rectangular','Recessed rectangular'],['square','Square'],['paired','Paired narrow'],
  ['horizontal','Horizontal skyscraper lines'],['vertical','Vertical skyscraper lines'],
  ['shop','Shopfront / large'],['arched','Arched'],['grid','Office grid']
]);
const WINDOW_COLOUR_OPTIONS=choose([
  ['auto','Auto / wall-matched'],['charcoal','Charcoal'],['blue','Blue'],
  ['reflective','Reflective'],['warm','Warm / lit'],['light','Light grey']
]);
const DOOR_OPTIONS=choose([
  ['none','None'],['single','Single'],['double','Double'],
  ['glazed','Glazed'],['shop','Shop entrance'],['garage','Garage / shutter']
]);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const pt=(x,y)=>({x,y});
const add=(a,b)=>pt(a.x+b.x,a.y+b.y);
const sub=(a,b)=>pt(a.x-b.x,a.y-b.y);
const mul=(v,k)=>pt(v.x*k,v.y*k);
const mix=(a,b,t)=>pt(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);
function hash(x,y,z=0){let h=(Math.imul(x|0,0x9e3779b1)^Math.imul(y|0,0x85ebca6b)^Math.imul(z|0,0xc2b2ae35))>>>0;h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;return h>>>0;}
function geometry(ctx){
  const q=ctx.geometry||{};if(q.tool!=='line')return null;
  const start=q.start||q.points?.[0],end=q.end||q.points?.[q.points.length-1];
  if(!start||!end)return null;
  let a=pt(Number(start.x),Number(start.y)),b=pt(Number(end.x),Number(end.y));
  if(![a.x,a.y,b.x,b.y].every(Number.isFinite))return null;
  const len=Math.hypot(b.x-a.x,b.y-a.y);if(len<3)return null;
  const u=mul(sub(b,a),1/len),depth=clamp(Math.round(Number(settings.depth)||0),1,96),height=clamp(Math.round(Number(settings.height)||0),6,80);
  /* The isometric depth axis MUST be nonparallel to the drawn edge.
   * The perpendicular supplies most of the vector; modest horizontal skew
   * retains a familiar retail perspective on approximately flat fronts.
   * Choose screen-up for nonvertical edges; vertical lines use roof-side.
   * Reversing line endpoints must not invert the volume. */
  let n=pt(-u.y,u.x);
  if(Math.abs(n.y)>.14){if(n.y>0)n=mul(n,-1);}
  else if((settings.roofSide==='right'&&n.x<0)||(settings.roofSide==='left'&&n.x>0))n=mul(n,-1);
  const horizontal=settings.roofSide==='right'?1:-1;
  const back=add(mul(n,depth*.83),pt(horizontal*depth*.18,-depth*.08));
  const corners=[a,b,add(b,back),add(a,back)];
  const tops=corners.map(v=>pt(v.x,v.y-height));
  const faceDefs=[
    {id:'line',from:0,to:1,shade:'main'},
    {id:'right',from:1,to:2,shade:'dark'},
    {id:'rear',from:2,to:3,shade:'main'},
    {id:'left',from:3,to:0,shade:'dark'}
  ];
  const faces=faceDefs.map(f=>{
    const p=corners[f.from],r=corners[f.to],v=sub(r,p),edgeLen=Math.hypot(v.x,v.y);
    return {...f,p,r,v,u:mul(v,1/(edgeLen||1)),len:edgeLen,projectedWidth:Math.abs(v.x),screenY:(p.y+r.y)/2};
  });
  /* Determine the visible main elevation for highly angled fronts. When the
   * user draws nearly vertical, the line face is edge-on to the screen: put
   * windows on the nearest end face instead of dropping an entire elevation. */
  let primary=settings.frontFace;
  if(primary==='auto'){
    const line=faces[0],side=faces.filter(f=>f.id==='left'||f.id==='right').sort((x,y)=>y.screenY-x.screenY)[0];
    primary=line.projectedWidth>=Math.max(2,side.projectedWidth*.75)?'line':side.id;
  }
  return {a,b,u,len,depth,height,back,corners,tops,faces,primary};
}
function makePainter(ctx){
  const pixels=ctx.layer('backdrop'),base=ctx.baseLayer('backdrop'),structure=new Set(),w=ctx.width,h=ctx.height;
  function paint(x,y,index,owned=true){
    x=Math.round(x);y=Math.round(y);
    if(x<0||y<0||x>=w||y>=h)return false;
    const i=y*w+x;pixels[i]=ctx.helpers?.validIndex?ctx.helpers.validIndex(index):index;
    if(owned)structure.add(i);return true;
  }
  function line(p,q,c,owned=true){
    let x0=Math.round(p.x),y0=Math.round(p.y),x1=Math.round(q.x),y1=Math.round(q.y),dx=Math.abs(x1-x0),dy=Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1,err=dx-dy;
    for(let i=0;i<2048;i++){
      paint(x0,y0,c,owned);if(x0===x1&&y0===y1)break;
      const e2=2*err;if(e2>-dy){err-=dy;x0+=sx;}if(e2<dx){err+=dx;y0+=sy;}
    }
  }
  function fill(poly,c,owned=true){
    if(poly.length<3)return;
    /* Pixel-inclusive scanline spans. Unlike centre-only polygon membership,
       rounded scanline endpoints and Bresenham edge closures share a common
       raster footprint at every slope. This closes 1px pinholes along wall
       bases, roof seams, windows and the side-face joins. */
    let ymin=Infinity,ymax=-Infinity;
    for(const v of poly){ymin=Math.min(ymin,v.y);ymax=Math.max(ymax,v.y);}
    const lo=clamp(Math.floor(ymin)-1,0,h-1),hi=clamp(Math.ceil(ymax)+1,0,h-1);
    for(let y=lo;y<=hi;y++){
      const row=y+.5,cross=[];
      for(let i=0,j=poly.length-1;i<poly.length;j=i++){
        const a=poly[j],b=poly[i];
        if((a.y<=row&&row<b.y)||(b.y<=row&&row<a.y))
          cross.push(a.x+(row-a.y)*(b.x-a.x)/(b.y-a.y));
      }
      cross.sort((a,b)=>a-b);
      for(let i=0;i+1<cross.length;i+=2){
        const x0=clamp(Math.floor(cross[i]),0,w-1),x1=clamp(Math.ceil(cross[i+1]),0,w-1);
        for(let x=x0;x<=x1;x++)paint(x,y,c,owned);
      }
    }
    /* Outline each edge exactly, including closing edges and vertices. */
    for(let i=0;i<poly.length;i++)line(poly[i],poly[(i+1)%poly.length],c,owned);
  }
  function shadow(poly){
    const d=clamp(Math.round(settings.shadow),0,16);
    if(!d||settings.shadowDirection==='none')return;
    const offset=pt(settings.shadowDirection==='left-down'?-d:d,Math.max(1,Math.round(d*.55)));
    const shade={0:5,2:10,3:7,4:1,5:4,6:5,7:6,8:4,9:20,10:20,11:19,12:4,13:12,14:12,15:14,16:14,17:15,18:30,19:10,20:8,21:22,22:20,23:22,24:4,25:24,26:25,27:26,28:4,29:28,30:28,31:29};
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],q=[a,b,add(b,offset),add(a,offset)];
      const minX=clamp(Math.floor(Math.min(...q.map(v=>v.x))),0,w-1),maxX=clamp(Math.ceil(Math.max(...q.map(v=>v.x))),0,w-1);
      const minY=clamp(Math.floor(Math.min(...q.map(v=>v.y))),0,h-1),maxY=clamp(Math.ceil(Math.max(...q.map(v=>v.y))),0,h-1);
      for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
        let inside=false;
        for(let k=0,j=3;k<4;j=k++)if((q[k].y>y+.5)!==(q[j].y>y+.5)&&x+.5<(q[j].x-q[k].x)*(y+.5-q[k].y)/(q[j].y-q[k].y)+q[k].x)inside=!inside;
        if(inside){const z=y*w+x;pixels[z]=shade[base[z]]??5;}
      }
    }
  }
  return {paint,line,fill,shadow,structure};
}
/* Local coordinates along a wall face: horizontal distance s from its first
 * endpoint, and height v above the ground. Depth is a SCREEN-PROJECTED edge,
 * so all features follow the face as it rotates on the clock. */
function at(face,s,v=0){return pt(face.p.x+face.u.x*s,face.p.y+face.u.y*s-v);}
function quad(face,painter,s0,s1,v0,v1,c){
  painter.fill([at(face,s0,v0),at(face,s1,v0),at(face,s1,v1),at(face,s0,v1)],c);
}
/* Native-pixel retail motifs. Each character represents ONE pixel of a
 * reusable sprite, not a rectangle fitted to a drawing vector:
 *   G = recessed glass, H = reflected/lighter glass, F = light wall mullion,
 *   . = retain the existing wall pixel.
 * In the source brush: two-pixel panes and 1px separators dominate low-rise
 * windows. Modern towers instead use continuous independent 1px lines. */
const WINDOW_MOTIFS=Object.freeze({
  slits:Object.freeze(['G','G','G']),
  tall:Object.freeze(['G','G','G','G']),
  rectangular:Object.freeze(['GH','GG','GG']),
  square:Object.freeze(['GG','GH']),
  paired:Object.freeze(['GG.GG','GG.GG','GG.GG']),
  shop:Object.freeze(['GG.GG','GG.GG','HH.HH','GG.GG']),
  arched:Object.freeze(['.G.','GGG','GGG','GGG']),
  grid:Object.freeze(['GG.GG','GG.GG','.....','GG.GG','GG.GG'])
});
function windowInk(wall){
  const forced=WINDOW_COLOURS[settings.windowColour];
  return forced||{glass:wall.glass,frame:wall.main,highlight:wall.glint};
}
function windowFootprint(face,g){
  return {
    contains(x,y){
      /* Solve the coordinate transform of the projected vertical façade.
       * This includes the angled front wall and prevents stamp pixels leaking
       * into the silhouette, roof, side elevations, or below the ground line.
       */
      if(Math.abs(face.u.x)<.08)return false;
      const s=(x-face.p.x)/face.u.x;
      const v=face.p.y+face.u.y*s-y;
      return s>=1&&s<=face.len-1&&v>=1&&v<=g.height-1;
    }
  };
}
function faceWindow(face,painter,s,v,kind,wall,g){
  const motif=WINDOW_MOTIFS[kind];if(!motif)return false;
  const ink=windowInk(wall),width=Math.max(...motif.map(row=>row.length)),height=motif.length;
  const middle=at(face,s,0),x0=Math.round(middle.x-width/2),y0=Math.round(middle.y-v-height);
  const clip=windowFootprint(face,g);
  let n=0;
  for(let yy=0;yy<height;yy++)for(let xx=0;xx<width;xx++){
    const token=motif[yy][xx]||'.';if(token==='.')continue;
    const px=x0+xx,py=y0+yy;
    if(!clip.contains(px,py))continue;
    if(painter.paint(px,py,token==='G'?ink.glass:token==='H'?ink.highlight:wall.light))n++;
  }
  return n>0;
}
function wallWindows(g,painter,face,wall,primary){
  const kind=settings.windows;
  if(kind==='none'||(!primary&&!settings.sideWindows)||face.len<4)return 0;
  const ink=windowInk(wall),spacing=clamp(Math.round(Number(settings.spacing)||9),4,28);
  const margin=2,projected=Math.abs(face.v.x),clip=windowFootprint(face,g);
  /* A near edge-on face cannot fit a legible screen-space window. Do not
   * distort a 2x3 pixel motif into an angled streak to force it to fit. */
  if(projected<4)return 0;
  if(kind==='horizontal'){
    let count=0;
    const step=Math.max(3,spacing);
    for(let v=3;v<g.height-2;v+=step){
      /* True continuous strip following the façade line; 1px tall, with
       * restrained family-coloured reflection, never hard-coded black. */
      for(let s=2;s<face.len-2;s+=.6){
        const p=at(face,s,v),x=Math.round(p.x),y=Math.round(p.y);
        if(!clip.contains(x,y))continue;
        painter.paint(x,y,ink.glass);
        if(spacing<8&&v+1<g.height-2&&Math.round(s)%7===0&&clip.contains(x,y-1))painter.paint(x,y-1,ink.highlight);
      }
      count++;
    }
    return count;
  }
  if(kind==='vertical'){
    let count=0;const usable=projected-2*margin;
    const columns=Math.max(1,Math.floor(usable/Math.max(3,spacing)));
    const x0=Math.min(face.p.x,face.r.x)+margin;
    for(let i=0;i<columns;i++){
      const x=x0+(i+.5)*(usable/columns),s=(x-face.p.x)/face.u.x;
      if(s<1||s>face.len-1)continue;
      for(let v=2;v<g.height-2;v+=.7){
        const q=at(face,s,v),px=Math.round(q.x),py=Math.round(q.y);
        if(!clip.contains(px,py))continue;
        painter.paint(px,py,ink.glass);
        /* Adjacent one-pixel glint, like original lime/lilac skyline. */
        if(spacing<=7&&clip.contains(px+1,py)&&i%2===0)painter.paint(px+1,py,ink.highlight);
      }
      count++;
    }
    return count;
  }
  const motif=WINDOW_MOTIFS[kind];if(!motif)return 0;
  const width=Math.max(...motif.map(row=>row.length)),height=motif.length;
  const available=projected-2*margin;if(available<width)return 0;
  const pitch=Math.max(spacing,width+2),rowPitch=Math.max(spacing,height+2);
  const columns=Math.max(1,Math.floor((available-width)/pitch)+1);
  const used=width+(columns-1)*pitch;
  const startX=Math.min(face.p.x,face.r.x)+margin+(available-used)/2+width/2;
  let count=0;
  for(let v=3;v+height<g.height-2;v+=rowPitch){
    for(let col=0;col<columns;col++){
      const screenX=startX+col*pitch;
      const s=(screenX-face.p.x)/face.u.x;
      if(s<1||s>face.len-1)continue;
      /* No windows through the entrance. */
      if(primary&&settings.door!=='none'&&v<12){
        const centre=settings.doorPosition==='left'?3:settings.doorPosition==='right'?face.len-3:face.len/2;
        const half=settings.door==='garage'?7:settings.door==='shop'?5:settings.door==='double'?4:3;
        if(Math.abs(s-centre)<half+width/2+1)continue;
      }
      if(faceWindow(face,painter,s,v,kind,wall,g))count++;
    }
  }
  return count;
}
function wallDoor(g,painter,face,wall){
  const style=settings.door;if(style==='none'||face.len<5)return;
  const height=clamp(style==='garage'?10:style==='shop'?11:8,3,g.height-2);
  const width=clamp(style==='garage'?12:style==='shop'?9:style==='double'?6:3,2,Math.floor(face.len-2));
  const s=clamp(settings.doorPosition==='left'?2:settings.doorPosition==='right'?face.len-width-2:(face.len-width)/2,1,face.len-width-1);
  const c=windowInk(wall);
  quad(face,painter,s,s+width,0,height,wall.detail);
  quad(face,painter,s+1,s+width-1,1,height-1,style==='glazed'||style==='shop'?c.glass:style==='garage'?5:style==='double'?wall.dark:wall.detail);
  if(style==='double'||style==='shop')painter.line(at(face,s+width/2,0),at(face,s+width/2,height),wall.dark);
  if(style==='garage')for(let v=2;v<height;v+=2)painter.line(at(face,s+1,v),at(face,s+width-1,v),6);
  if(style==='glazed'||style==='shop')painter.line(at(face,s+1,height-2),at(face,s+width-1,height-2),c.highlight);
  if(style!=='garage')painter.paint(at(face,s+width-1,3).x,at(face,s+width-1,3).y,wall.light);
  painter.line(at(face,s-1,height),at(face,s+width+1,height),wall.light);
}
function walls(g,painter,wall){
  /* Paint every face of the cube. Nearer faces are painted after farther
   * faces, so both side elevations and the front always remain complete. */
  const ordered=g.faces.slice().sort((a,b)=>a.screenY-b.screenY);
  let count=0;
  for(const face of ordered){
    const a=face.p,b=face.r,ta=pt(a.x,a.y-g.height),tb=pt(b.x,b.y-g.height);
    const primary=face.id===g.primary;
    const shade=face.id==='rear'?wall.dark:face.id==='line'?wall.main:face.id==='left'?wall.light:wall.dark;
    painter.fill([a,b,tb,ta],shade);
    painter.line(a,ta,face.id==='line'?wall.light:wall.main);
    painter.line(ta,tb,wall.light);
    painter.line(b,tb,wall.detail);
    if(settings.trim){
      painter.line(at(face,0,2),at(face,face.len,2),wall.dark);
      /* Courses remain separated by the single Window spacing setting. */
      for(let v=2+Math.max(4,settings.spacing);v<g.height-2;v+=Math.max(4,settings.spacing))
        painter.line(at(face,1,v),at(face,face.len-1,v),wall.light);
    }
    if(face.id!=='rear')count+=wallWindows(g,painter,face,wall,primary);
    if(primary)wallDoor(g,painter,face,wall);
  }
  return count;
}
function roofGeometry(g){
  const [a,b,c,d]=g.tops;
  return {a,b,c,d};
}
function paintRoof(g,painter,wall,roof){
  const {a,b,c,d}=roofGeometry(g),style=settings.roof;
  const pitch=clamp(Math.round(Number(settings.roofPitch)||0),1,20);
  const detail=clamp(Number(settings.roofDetail)||0,0,100)/100;
  const edge=roof.dark,beam=roof.light;
  function outline(){painter.line(a,b,edge);painter.line(b,c,edge);painter.line(c,d,beam);painter.line(d,a,beam);}
  function skylights(){
    /* The retail roofs carry small slanted 2–4px skylight motifs, not
     * full-length dark glazing strips running the entire building depth. */
    const n=Math.max(1,Math.floor(g.len/7));
    for(let i=0;i<n;i++){
      const u=(i+.5)/n,front=mix(a,b,u),back=mix(d,c,u);
      const p0=mix(front,back,.27),p1=mix(front,back,.37);
      painter.line(p0,p1,roof.dark);
      painter.line(add(p0,pt(1,-1)),add(p1,pt(1,-1)),15);
    }
  }
  if(style==='flat'||style==='parapet'||style==='stepped'||style==='skylights'){
    painter.fill([a,b,c,d],roof.main);
    if(style==='parapet'){
      /* Raised pale rims enclosing the flat roof (rather than another pitch). */
      const lift=pt(0,-2);
      painter.line(add(a,lift),add(b,lift),roof.light);
      painter.line(add(d,lift),add(c,lift),roof.dark);
      for(const p of [a,b,c,d])painter.line(p,add(p,lift),roof.dark);
    }else if(style==='stepped'){
      const lift=pt(0,-3);
      const inner=[add(a,mul(sub(c,a),.20)),add(b,mul(sub(d,b),.20)),add(c,mul(sub(a,c),.20)),add(d,mul(sub(b,d),.20))];
      painter.fill(inner,roof.dark);
      for(let i=0;i<4;i++)painter.line(inner[i],add(inner[i],lift),roof.light);
      const raised=inner.map(p=>add(p,lift));painter.fill(raised,roof.light);
      painter.line(raised[0],raised[1],roof.detail);
    }else if(style==='skylights')skylights();
    if(style==='flat'&&detail>.12){
      for(let t=.18;t<1;t+=.18)painter.line(mix(a,d,t),mix(b,c,t),roof.detail);
    }
    outline();return;
  }
  if(style==='sawtooth'){
    painter.fill([a,b,c,d],roof.dark);
    const teeth=Math.max(2,Math.floor(g.len/9));
    for(let k=0;k<teeth;k++){
      const t0=k/teeth,t1=(k+1)/teeth;
      const f0=mix(a,b,t0),f1=mix(a,b,t1),r0=mix(d,c,t0),r1=mix(d,c,t1);
      painter.fill([f0,f1,r1,r0],k%2?roof.main:roof.light);
      const raisedF=add(f0,pt(0,-Math.min(4,pitch))),raisedR=add(r0,pt(0,-Math.min(4,pitch)));
      painter.line(f0,raisedF,roof.dark);painter.line(r0,raisedR,roof.dark);
      painter.line(raisedF,raisedR,roof.detail);
      painter.line(f1,r1,roof.dark);
    }
    outline();return;
  }
  /* A true two-plane pitched roof, with separate gables and visible ridgeline.
     End face colours are drawn before the roof planes, so both ends close. */
  const roofRise=style==='hip'?pitch*.65:pitch;
  let rA=add(mix(a,d,.5),pt(0,-roofRise));
  let rB=add(mix(b,c,.5),pt(0,-roofRise));
  if(style==='hip'){
    const ra=rA,rb=rB;rA=mix(ra,rb,.18);rB=mix(ra,rb,.82);
  }
  painter.fill([a,d,rA],style==='gable'?wall.light:wall.dark);
  painter.fill([b,c,rB],style==='gable'?wall.main:wall.dark);
  painter.fill([a,b,rB,rA],roof.main);
  painter.fill([rA,rB,c,d],roof.light);
  if(style==='hip'){
    painter.fill([a,d,rA],roof.dark);
    painter.fill([b,c,rB],roof.main);
  }
  painter.line(rA,rB,roof.detail);
  painter.line(a,b,roof.dark);painter.line(d,c,roof.dark);
  painter.line(a,rA,roof.light);painter.line(d,rA,roof.dark);
  painter.line(b,rB,roof.light);painter.line(c,rB,roof.dark);
  if(style==='tiled'){
    /* Two offset courses of short coloured tiles. They follow the slope and
       do not collapse to sparse random dots at small sizes. */
    for(let t=.18;t<.91;t+=.17){
      for(let u=(Math.round(t*10)%2)*.07;u<.99;u+=.14){
        if(hash(Math.round(t*101),Math.round(u*101),15)%100>detail*100)continue;
        const p=mix(mix(a,b,u),mix(rA,rB,u),t);
        painter.line(p,add(p,pt(1,0)),roof.detail);
        const q=mix(mix(d,c,u),mix(rA,rB,u),t);
        painter.line(q,add(q,pt(1,0)),roof.dark);
      }
    }
  }
}
function render(ctx){
  const g=geometry(ctx);if(!g)return {message:'Buildings: draw a straight Line along a ground edge (at least 3 px).'};
  const painter=makePainter(ctx),wall=WALLS[settings.wall]||WALLS.peach;
  const roofFamily=settings.roofColour==='match'?(ROOF_MATCH[settings.wall]||'slate'):settings.roofColour;
  const roof=ROOFS[roofFamily]||ROOFS.slate;
  painter.shadow(g.corners);
  const windowCount=walls(g,painter,wall);
  paintRoof(g,painter,wall,roof);
  const fg=ctx.layer('foreground'),v=settings.layerMode==='foreground'?0:1;
  for(const i of painter.structure)fg[i]=v;
  return {message:`Buildings · ${settings.frontFace==='auto'?`auto (${g.primary})`:g.primary} front · ${Math.round(g.len)}×${g.height}×${g.depth} · ${windowCount} windows · ${painter.structure.size} px · ${settings.layerMode}.`};
}
function mountControls(container,ctx){
  ctx.ui.select(container,{label:'Wall colour',value:settings.wall,options:WALL_OPTIONS,onChange:v=>{settings.wall=v;}});
  ctx.ui.slider(container,{label:'Height',min:6,max:80,step:1,value:settings.height,onInput:v=>{settings.height=v;}});
  ctx.ui.slider(container,{label:'Building depth',min:1,max:96,step:1,value:settings.depth,onInput:v=>{settings.depth=v;}});
  ctx.ui.select(container,{label:'Front façade',value:settings.frontFace,options:FACE_OPTIONS,onChange:v=>{settings.frontFace=v;}});
  ctx.ui.select(container,{label:'Depth direction',value:settings.roofSide,options:choose([['left','Left'],['right','Right']]),onChange:v=>{settings.roofSide=v;}});
  ctx.ui.select(container,{label:'Roof style',value:settings.roof,options:ROOF_OPTIONS,onChange:v=>{settings.roof=v;}});
  ctx.ui.select(container,{label:'Roof colour',value:settings.roofColour,options:ROOF_COLOURS,onChange:v=>{settings.roofColour=v;}});
  ctx.ui.slider(container,{label:'Roof pitch',min:0,max:16,step:1,value:settings.roofPitch,onInput:v=>{settings.roofPitch=v;}});
  ctx.ui.slider(container,{label:'Roof detail',min:0,max:100,step:5,value:settings.roofDetail,onInput:v=>{settings.roofDetail=v;}});
  ctx.ui.select(container,{label:'Window style',value:settings.windows,options:WINDOW_OPTIONS,onChange:v=>{settings.windows=v;}});
  ctx.ui.select(container,{label:'Window colour',value:settings.windowColour,options:WINDOW_COLOUR_OPTIONS,onChange:v=>{settings.windowColour=v;}});
  ctx.ui.slider(container,{label:'Window spacing',min:4,max:28,step:1,value:settings.spacing,onInput:v=>{settings.spacing=v;}});
  ctx.ui.checkbox(container,{label:'Windows on side',checked:settings.sideWindows,onChange:v=>{settings.sideWindows=v;}});
  ctx.ui.select(container,{label:'Door style',value:settings.door,options:DOOR_OPTIONS,onChange:v=>{settings.door=v;}});
  ctx.ui.select(container,{label:'Door position',value:settings.doorPosition,options:choose([['left','Left'],['centre','Centre'],['right','Right']]),onChange:v=>{settings.doorPosition=v;}});
  ctx.ui.checkbox(container,{label:'Wall trim / floors',checked:settings.trim,onChange:v=>{settings.trim=v;}});
  ctx.ui.select(container,{label:'Shadow direction',value:settings.shadowDirection,options:choose([['none','None'],['left-down','Left / Down'],['right-down','Right / Down']]),onChange:v=>{settings.shadowDirection=v;}});
  ctx.ui.slider(container,{label:'Shadow length',min:0,max:16,step:1,value:settings.shadow,onInput:v=>{settings.shadow=v;}});
  ctx.ui.select(container,{label:'Layer',value:settings.layerMode,options:choose([['foreground','Foreground'],['background','Background']]),onChange:v=>{settings.layerMode=v;}});
}
S.register({
  id:'buildings',name:'Buildings',version:VERSION,category:'Scenery',status:'prototype',
  description:'Retail-palette buildings with individually stamped, fixed-size pixel windows; wall-matched glazing and continuous family-coloured skyscraper lines; independent roof shading, automatic rows and full four-wall geometry.',
  supportedModes:['backdrop'],supportedTools:['line'],layers:['backdrop','foreground'],
  mountControls,preview:render,apply:render
});
})(typeof globalThis!=='undefined'?globalThis:this);
