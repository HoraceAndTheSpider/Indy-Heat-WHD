(function(root){
'use strict';

const S=root.IndyHeatSpecialFunctions;if(!S?.register)return;

const VERSION='0.1.5';
const settings={
  family:'red',
  boardHeight:8,
  legHeight:9,
  legWidth:1,
  legGrey:6,
  edgeBevel:'lighter',
  innerShade:true,
  innerShadeMode:'darker',
  fauxText:true,
  textColour:3,
  shadow:true,
  shadowDirection:'right',
  shadowLength:5,
  shadowDrop:3
};

const FAMILY_OPTIONS=Object.freeze([
  Object.freeze({value:'red',label:'Red'}),
  Object.freeze({value:'yellow',label:'Yellow'}),
  Object.freeze({value:'green',label:'Green'}),
  Object.freeze({value:'blue',label:'Blue'}),
  Object.freeze({value:'orange',label:'Orange'}),
  Object.freeze({value:'grey',label:'Grey'})
]);
const EDGE_OPTIONS=Object.freeze([
  Object.freeze({value:'off',label:'Off'}),
  Object.freeze({value:'lighter',label:'Lighter'}),
  Object.freeze({value:'darker',label:'Darker'})
]);
const SHADE_OPTIONS=Object.freeze([
  Object.freeze({value:'lighter',label:'Lighter'}),
  Object.freeze({value:'darker',label:'Darker'})
]);
const SHADOW_DIR_OPTIONS=Object.freeze([
  Object.freeze({value:'right',label:'Cast right'}),
  Object.freeze({value:'left',label:'Cast left'})
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
function roundPoint(p){return {x:Math.round(Number(p.x)||0),y:Math.round(Number(p.y)||0)};}
function inBounds(w,h,x,y){return x>=0&&y>=0&&x<w&&y<h;}
function validIndex(ctx,index){return ctx.helpers.validIndex(Number(index)||0);}
function familyDef(){return FAMILY_MAP[settings.family]||FAMILY_MAP.red;}
function familyColour(role){
  const f=familyDef();
  return f[role]??f.main;
}
function setBackdrop(ctx,layer,x,y,index){
  x=Math.round(x);y=Math.round(y);
  if(!inBounds(ctx.width,ctx.height,x,y))return false;
  layer[y*ctx.width+x]=validIndex(ctx,index);return true;
}
function setForeground(ctx,layer,x,y){
  x=Math.round(x);y=Math.round(y);
  if(!inBounds(ctx.width,ctx.height,x,y))return false;
  layer[y*ctx.width+x]=1;return true;
}
function getBackdrop(layer,width,x,y){
  x=Math.round(x);y=Math.round(y);
  if(x<0||y<0||x>=width)return 0;
  const idx=y*width+x;
  return idx>=0&&idx<layer.length?Number(layer[idx])||0:0;
}
function drawLinePoints(a,b){
  a=roundPoint(a);b=roundPoint(b);
  let x0=a.x,y0=a.y,x1=b.x,y1=b.y,dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1,err=dx+dy;
  const pts=[];
  while(true){
    pts.push({x:x0,y:y0});
    if(x0===x1&&y0===y1)break;
    const e2=2*err;
    if(e2>=dy){err+=dy;x0+=sx;}
    if(e2<=dx){err+=dx;y0+=sy;}
  }
  return pts;
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
function rectColumns(x,w){
  x=Math.round(x);w=Math.max(1,Math.min(2,Math.round(w||1)));
  const start=x-Math.floor((w-1)/2),cols=[];
  for(let i=0;i<w;i++)cols.push(start+i);
  return cols;
}
function lerpPoint(a,b,t){return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
function boardGeometry(g){
  if(!g?.start||!g?.end)return null;
  const a=roundPoint(g.start),b=roundPoint(g.end),bh=clamp(Math.round(Number(settings.boardHeight)||8),2,32),lh=clamp(Math.round(Number(settings.legHeight)||8),1,32);
  const tl={x:a.x,y:a.y-(bh+lh)},tr={x:b.x,y:b.y-(bh+lh)};
  const bl={x:a.x,y:a.y-lh},br={x:b.x,y:b.y-lh};
  return {a,b,bh,lh,tl,tr,bl,br,poly:[tl,tr,br,bl]};
}
function translatedPoly(poly,dx,dy){return poly.map(p=>({x:p.x+dx,y:p.y+dy}));}
function shadowShift(){
  const dx=(settings.shadowDirection==='left'?-1:1)*clamp(Math.round(Number(settings.shadowLength)||5),1,16);
  const dy=clamp(Math.round(Number(settings.shadowDrop)||3),0,16);
  return {dx,dy};
}
function shadowIndex(index){
  index=Number(index)||0;
  const map=Object.freeze({
    31:30,30:29,29:28,28:4,
    27:26,26:25,25:24,24:4,
    23:22,22:20,21:20,11:23,
    20:8,10:9,9:20,8:4,19:10,
    17:16,16:15,15:14,14:12,12:4,13:12,
    7:6,6:5,5:4,4:4,
    3:7,2:6,18:30
  });
  if(Object.prototype.hasOwnProperty.call(map,index))return map[index];
  return 4; // fallback dark grey if already at family minimum or unknown
}
function applyShadowPixel(ctx,backdrop,sourceBackdrop,x,y){
  x=Math.round(x);y=Math.round(y);
  if(!inBounds(ctx.width,ctx.height,x,y))return false;
  const src=getBackdrop(sourceBackdrop,ctx.width,x,y);
  return setBackdrop(ctx,backdrop,x,y,shadowIndex(src));
}
function paintShadowRect(ctx,backdrop,sourceBackdrop,x0,y0,x1,y1){
  let count=0;
  for(let x=Math.min(x0,x1);x<=Math.max(x0,x1);x++){
    for(let y=Math.min(y0,y1);y<=Math.max(y0,y1);y++){
      if(applyShadowPixel(ctx,backdrop,sourceBackdrop,x,y))count++;
    }
  }
  return count;
}
function paintShadow(ctx,backdrop,sourceBackdrop,geo){
  if(!settings.shadow)return 0;
  const {dx,dy}=shadowShift();
  let count=0;

  /* Ground-plane projection:
     the feet line on the track is the near edge of the banner shadow.
     The banner itself is above ground, so its shadow should lie on the
     road/grass from the feet line outward, not hang directly beneath the
     banner as a conventional drop shadow. */
  const groundShadow=[geo.a,geo.b,{x:geo.b.x+dx,y:geo.b.y+dy},{x:geo.a.x+dx,y:geo.a.y+dy}];
  fillPolygon(groundShadow,(x,y)=>{if(applyShadowPixel(ctx,backdrop,sourceBackdrop,x,y))count++;});

  // Leg shadows start at each foot and project away along the same vector.
  for(const foot of [geo.a,geo.b]){
    const cols=rectColumns(foot.x,settings.legWidth);
    for(const col of cols){
      for(const p of drawLinePoints({x:col,y:foot.y},{x:col+dx,y:foot.y+dy})){
        if(applyShadowPixel(ctx,backdrop,sourceBackdrop,p.x,p.y))count++;
      }
    }
  }
  return count;
}
function paintBevel(ctx,backdrop,foreground,geo){
  if(settings.edgeBevel==='off')return 0;
  const colour=settings.edgeBevel==='lighter'?familyColour('light'):familyColour('dark');
  const edges=[[geo.tl,geo.tr],[geo.tr,geo.br],[geo.br,geo.bl],[geo.bl,geo.tl]];
  let count=0;
  for(const [p0,p1] of edges){
    for(const p of drawLinePoints(p0,p1)){
      if(setBackdrop(ctx,backdrop,p.x,p.y,colour))count++;
      setForeground(ctx,foreground,p.x,p.y);
    }
  }
  return count;
}
function paintInnerShade(ctx,backdrop,foreground,geo){
  if(!settings.innerShade||geo.bh<3)return 0;
  const shade=settings.innerShadeMode==='lighter'?familyColour('light'):familyColour('soft');
  const left=lerpPoint(geo.tl,geo.bl,Math.min(.22,1-1/Math.max(2,geo.bh)));
  const right=lerpPoint(geo.tr,geo.br,Math.min(.22,1-1/Math.max(2,geo.bh)));
  let count=0;
  for(const p of drawLinePoints({x:left.x+1,y:left.y+1},{x:right.x-1,y:right.y+1})){
    if(pointInPoly(p.x+.5,p.y+.5,geo.poly)){
      if(setBackdrop(ctx,backdrop,p.x,p.y,shade))count++;
      setForeground(ctx,foreground,p.x,p.y);
    }
  }
  return count;
}
function paintFauxText(ctx,backdrop,foreground,geo){
  if(!settings.fauxText||geo.bh<4)return 0;
  const rows=geo.bh>=7?[.48,.66]:[.56];
  const seed=((geo.a.x&255)<<24)^((geo.a.y&255)<<16)^((geo.b.x&255)<<8)^(geo.b.y&255)^(geo.bh<<4);
  const darkerFamily=familyColour('dark');
  let state=seed>>>0,count=0;
  for(const t of rows){
    const left=lerpPoint(geo.tl,geo.bl,t),right=lerpPoint(geo.tr,geo.br,t);
    const line=drawLinePoints({x:left.x+2,y:left.y},{x:right.x-2,y:right.y});
    let i=0;
    while(i<line.length){
      state=(Math.imul(state,1664525)+1013904223)>>>0;
      const gap=1+(state%3); i+=gap;
      state=(Math.imul(state,1664525)+1013904223)>>>0;
      const run=1+(state%5);
      state=(Math.imul(state,1664525)+1013904223)>>>0;
      const useDouble=(state&3)===0;
      state=(Math.imul(state,1664525)+1013904223)>>>0;
      const runColour=(state&3)===0?darkerFamily:settings.textColour;
      for(let n=0;n<run&&i+n<line.length;n++){
        const p=line[i+n];
        state=(Math.imul(state,1664525)+1013904223)>>>0;
        const pixelColour=(state&7)===0?darkerFamily:runColour;
        if(pointInPoly(p.x+.5,p.y+.5,geo.poly)){
          if(setBackdrop(ctx,backdrop,p.x,p.y,pixelColour))count++;
          setForeground(ctx,foreground,p.x,p.y);
          if(useDouble && pointInPoly(p.x+.5,p.y-0.5,geo.poly)){
            if(setBackdrop(ctx,backdrop,p.x,p.y-1,pixelColour))count++;
            setForeground(ctx,foreground,p.x,p.y-1);
          }
        }
      }
      i+=run;
    }
  }
  return count;
}
function paintBanner(ctx,backdrop,foreground,geo){
  const main=familyColour('main');
  let fillCount=0,fgCount=0;
  fillPolygon(geo.poly,(x,y)=>{
    if(setBackdrop(ctx,backdrop,x,y,main))fillCount++;
    if(setForeground(ctx,foreground,x,y))fgCount++;
  });
  const bevelCount=paintBevel(ctx,backdrop,foreground,geo);
  const shadeCount=paintInnerShade(ctx,backdrop,foreground,geo);
  const textCount=paintFauxText(ctx,backdrop,foreground,geo);
  return {fillCount,fgCount,bevelCount,shadeCount,textCount};
}
function paintLeg(ctx,backdrop,foreground,foot,topY,makeForeground){
  const cols=rectColumns(foot.x,settings.legWidth),grey=validIndex(ctx,settings.legGrey);
  let count=0;
  for(const x of cols){
    for(let y=Math.min(foot.y,topY);y<=Math.max(foot.y,topY);y++){
      if(setBackdrop(ctx,backdrop,x,y,grey))count++;
      if(makeForeground)setForeground(ctx,foreground,x,y);
    }
  }
  return count;
}

function applyOcclusionMask(ctx,foreground,geo,legAIsBackdrop){
  const before=foreground.slice();
  let setCount=0,clearCount=0;

  // Entire banner is driven under.
  fillPolygon(geo.poly,(x,y)=>{
    x=Math.round(x);y=Math.round(y);
    if(!inBounds(ctx.width,ctx.height,x,y))return;
    const i=y*ctx.width+x;
    if(foreground[i]!==1){foreground[i]=1;setCount++;}
  });

  // Nearer support (larger Y foot) is driven under.
  const nearFoot=legAIsBackdrop?geo.b:geo.a;
  const nearTop=legAIsBackdrop?geo.br.y:geo.bl.y;
  for(const x of rectColumns(nearFoot.x,settings.legWidth)){
    for(let y=Math.min(nearFoot.y,nearTop);y<=Math.max(nearFoot.y,nearTop);y++){
      if(!inBounds(ctx.width,ctx.height,x,y))continue;
      const i=y*ctx.width+x;
      if(foreground[i]!==1){foreground[i]=1;setCount++;}
    }
  }

  // Farther support (smaller Y foot) is explicitly background, even where
  // its visible pixels overlap the banner artwork.
  const farFoot=legAIsBackdrop?geo.a:geo.b;
  const farTop=legAIsBackdrop?geo.bl.y:geo.br.y;
  for(const x of rectColumns(farFoot.x,settings.legWidth)){
    for(let y=Math.min(farFoot.y,farTop);y<=Math.max(farFoot.y,farTop);y++){
      if(!inBounds(ctx.width,ctx.height,x,y))continue;
      const i=y*ctx.width+x;
      if(foreground[i]!==0){foreground[i]=0;clearCount++;}
    }
  }

  let changed=0,active=0;
  for(let i=0;i<foreground.length;i++){
    if(foreground[i]!==before[i])changed++;
    if(foreground[i])active++;
  }
  return {setCount,clearCount,changed,active};
}

function render(ctx){
  const geo=boardGeometry(ctx.geometry);if(!geo)return {message:'Overhead Advert Board: draw a Line.'};
  const backdrop=ctx.layer('backdrop'),foreground=ctx.layer('foreground');
  const sourceBackdrop=backdrop.slice?backdrop.slice():Array.from(backdrop);

  const shadowCount=paintShadow(ctx,backdrop,sourceBackdrop,geo);
  const legAIsBackdrop=(geo.a.y<=geo.b.y); // smaller Y = further up-screen = background-only support
  const banner=paintBanner(ctx,backdrop,foreground,geo);

  // Legs are deliberately painted last so they remain visibly on top of the banner.
  const legA=paintLeg(ctx,backdrop,foreground,geo.a,geo.bl.y,!legAIsBackdrop);
  const legB=paintLeg(ctx,backdrop,foreground,geo.b,geo.br.y,legAIsBackdrop);

  // Authoritative final mask pass: banner + near support foreground, far support background.
  const occ=applyOcclusionMask(ctx,foreground,geo,legAIsBackdrop);

  return {message:`Overhead Advert Board committed · board ${geo.bh}px · legs ${geo.lh}px × ${settings.legWidth}px${settings.shadow?` · ground shadow ${settings.shadowDirection} ${settings.shadowLength}/${settings.shadowDrop}`:''} · Foreground ${occ.active} px (${occ.changed} changed)${settings.fauxText?' · faux text angled with darker family variation':''}.`};
}
function mountControls(container,ctx){
  ctx.ui.select(container,{label:'Board family',value:settings.family,options:FAMILY_OPTIONS,onChange:value=>{settings.family=value;}});
  ctx.ui.slider(container,{label:'Board height',min:2,max:24,step:1,value:settings.boardHeight,onInput:value=>{settings.boardHeight=value;}});
  ctx.ui.slider(container,{label:'Leg height',min:1,max:24,step:1,value:settings.legHeight,onInput:value=>{settings.legHeight=value;}});
  ctx.ui.select(container,{label:'Leg width',value:String(settings.legWidth),options:[{value:'1',label:'1 px'},{value:'2',label:'2 px'}],onChange:value=>{settings.legWidth=Number(value)||1;}});
  if(ctx.ui.paletteColour)ctx.ui.paletteColour(container,{label:'Leg colour',value:settings.legGrey,onInput:value=>{settings.legGrey=value;}});
  else ctx.ui.paletteIndex(container,{label:'Leg colour',value:settings.legGrey,onInput:value=>{settings.legGrey=value;}});
  ctx.ui.select(container,{label:'Edge bevel',value:settings.edgeBevel,options:EDGE_OPTIONS,onChange:value=>{settings.edgeBevel=value;}});
  ctx.ui.checkbox(container,{label:'Inner shade',checked:settings.innerShade,onChange:value=>{settings.innerShade=value;}});
  ctx.ui.select(container,{label:'Inner shade mode',value:settings.innerShadeMode,options:SHADE_OPTIONS,onChange:value=>{settings.innerShadeMode=value;}});
  ctx.ui.checkbox(container,{label:'Faux text',checked:settings.fauxText,onChange:value=>{settings.fauxText=value;}});
  if(ctx.ui.paletteColour)ctx.ui.paletteColour(container,{label:'Text colour',value:settings.textColour,onInput:value=>{settings.textColour=value;}});
  else ctx.ui.paletteIndex(container,{label:'Text colour',value:settings.textColour,onInput:value=>{settings.textColour=value;}});
  ctx.ui.checkbox(container,{label:'Shadow',checked:settings.shadow,onChange:value=>{settings.shadow=value;}});
  ctx.ui.select(container,{label:'Shadow direction',value:settings.shadowDirection,options:SHADOW_DIR_OPTIONS,onChange:value=>{settings.shadowDirection=value;}});
  ctx.ui.slider(container,{label:'Shadow length',min:1,max:12,step:1,value:settings.shadowLength,onInput:value=>{settings.shadowLength=value;}});
  ctx.ui.slider(container,{label:'Shadow drop',min:0,max:12,step:1,value:settings.shadowDrop,onInput:value=>{settings.shadowDrop=value;}});
}

S.register({
  id:'overhead-advert-board',
  name:'Overhead Advert Board',
  version:VERSION,
  category:'Scenery',
  status:'prototype',
  description:'Line-only overhead sponsor board. The drawn line defines the two feet, with variable board height, leg height/width, grey support colour, full edge bevel, optional inner shade, slanted randomized faux text with darker family variation, an explicit banner/near-support foreground mask, far-support background mask, and a ground-projected shadow cast from the feet line and supports.',
  supportedModes:['backdrop'],
  supportedTools:['line'],
  layers:['backdrop','foreground'],
  mountControls,
  preview:render,
  apply:render
});

})(typeof globalThis!=='undefined'?globalThis:this);
