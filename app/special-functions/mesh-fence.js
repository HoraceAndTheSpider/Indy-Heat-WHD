(function(root){
'use strict';

/* Mesh Fence Special Function.
 *
 * Line / Curve / Pencil define the fence ground line. Mesh grows vertically
 * upward from that route, using a transparent checker:
 *
 *   G . G .
 *   . G . G
 *
 * where G is the selected grey and "." leaves the existing Backdrop untouched.
 * Optional posts are redistributed along the route so the first and final
 * route positions are always posts. A 2 px plinth can sit below the mesh.
 *
 * Depth taper is deliberately 2D/faux-perspective: fence height is reduced
 * progressively toward the top of the 320x256 screen.
 */
const S=root.IndyHeatSpecialFunctions;if(!S?.register)return;

const VERSION='0.1.3';
const COLLISION=1;
const settings={
  meshGrey:5,
  shadeVariation:true,
  height:8,
  depthTaper:45,
  posts:true,
  postColour:6,
  postSpacing:12,
  plinth:false,
  topLine:false,
  topLineColour:6,
  foreground:'full',
  collision:true
};

const GREYS=Object.freeze([
  Object.freeze({value:'4',label:'Dark grey'}),
  Object.freeze({value:'5',label:'Grey'}),
  Object.freeze({value:'6',label:'Light grey'}),
  Object.freeze({value:'7',label:'Pale grey'})
]);
const FG_OPTIONS=Object.freeze([
  Object.freeze({value:'none',label:'0%'}),
  Object.freeze({value:'half',label:'50%'}),
  Object.freeze({value:'full',label:'100%'})
]);
const PLINTH_LIGHT=6,PLINTH_DARK=5;

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function inBounds(w,h,x,y){return x>=0&&y>=0&&x<w&&y<h;}
function point(p){return p&&Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.y))?{x:Number(p.x),y:Number(p.y)}:null;}
function uniquePoints(raw){
  const out=[];let last=null;
  for(const p0 of raw||[]){
    const p=point(p0);if(!p)continue;
    if(!last||Math.abs(p.x-last.x)>.0001||Math.abs(p.y-last.y)>.0001){out.push(p);last=p;}
  }
  return out;
}
function routePoints(g){
  if(g?.tool==='line'&&g.start&&g.end)return uniquePoints([g.start,g.end]);
  return uniquePoints(g?.points);
}
function buildSegments(points){
  const segments=[];let total=0;
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    if(len<1e-6)continue;
    segments.push({a,b,dx,dy,len,start:total,end:total+len});
    total+=len;
  }
  return {segments,total};
}
function routeAt(built,d){
  const {segments,total}=built;if(!segments.length)return null;
  d=clamp(Number(d)||0,0,total);let seg=segments[segments.length-1];
  for(const q of segments){if(d<=q.end+1e-7){seg=q;break;}}
  const t=seg.len>0?clamp((d-seg.start)/seg.len,0,1):0;
  return {x:seg.a.x+seg.dx*t,y:seg.a.y+seg.dy*t,along:d};
}
function routeSamples(points){
  if(!points.length)return [];
  if(points.length===1)return [{x:Math.round(points[0].x),y:Math.round(points[0].y),along:0}];
  const built=buildSegments(points);if(!built.segments.length)return [{x:Math.round(points[0].x),y:Math.round(points[0].y),along:0}];
  const count=Math.max(1,Math.ceil(built.total)),out=[],seen=new Set();
  for(let n=0;n<=count;n++){
    const d=n===count?built.total:Math.min(built.total,n),p=routeAt(built,d);if(!p)continue;
    const x=Math.round(p.x),y=Math.round(p.y),key=`${x},${y}`;
    if(seen.has(key))continue;seen.add(key);out.push({x,y,along:d});
  }
  return out;
}
function postAnchors(points,spacing){
  const requested=clamp(Math.round(Number(spacing)||12),4,64);
  if(!points.length)return {posts:[],spacing:requested,total:0};
  if(points.length===1)return {posts:[{x:Math.round(points[0].x),y:Math.round(points[0].y),along:0}],spacing:requested,total:0};
  const built=buildSegments(points);if(!built.segments.length)return {posts:[],spacing:requested,total:0};
  const intervals=Math.max(1,Math.ceil(built.total/requested)),actual=built.total/intervals,posts=[];
  for(let i=0;i<=intervals;i++){
    const p=routeAt(built,i===intervals?built.total:i*actual);if(!p)continue;
    const q={x:Math.round(p.x),y:Math.round(p.y),along:p.along},last=posts[posts.length-1];
    if(!last||last.x!==q.x||last.y!==q.y)posts.push(q);
  }
  return {posts,spacing:actual||requested,total:built.total};
}
function greyLighter(index){index=Number(index);if(index===4)return 5;if(index===5)return 6;if(index===6)return 7;return 7;}
function greyDarker(index){index=Number(index);if(index===7)return 6;if(index===6)return 5;if(index===5)return 4;return 4;}
function fenceHeight(ctx,y){
  const base=clamp(Math.round(Number(settings.height)||8),2,24),taper=clamp(Number(settings.depthTaper)||0,0,100)/100;
  const depth=clamp(Number(y)/(Math.max(1,ctx.height-1)),0,1),scale=1-taper*.6*(1-depth);
  return Math.max(2,Math.round(base*scale));
}
function meshBottomY(baseY){return Math.round(baseY)-(settings.plinth?2:0);}
function meshTopY(ctx,baseY){const bottom=meshBottomY(baseY);return bottom-fenceHeight(ctx,baseY)+1;}
function setBackdrop(ctx,pixels,x,y,index){
  x=Math.round(x);y=Math.round(y);if(!inBounds(ctx.width,ctx.height,x,y))return false;
  pixels[y*ctx.width+x]=ctx.helpers.validIndex(index);return true;
}
function setForegroundPixel(ctx,foreground,x,y,top,bottom,mode=settings.foreground){
  x=Math.round(x);y=Math.round(y);if(mode==='none'||!inBounds(ctx.width,ctx.height,x,y))return;
  if(mode==='full'||y<=Math.floor((top+bottom)/2))foreground[y*ctx.width+x]=1;
}
function setCollisionAt(ctx,surface,x,y){
  if(!settings.collision)return;const helper=ctx.helpersFor('surface'),p=helper.screenToLayer(x,y);if(!p)return;
  const info=ctx.layerInfo('surface');surface[p.y*info.width+p.x]=COLLISION;
}
function segmentPosition(along,spacing,total){
  spacing=Math.max(.001,Number(spacing)||1);along=clamp(Number(along)||0,0,Math.max(0,total));
  let index=Math.floor((along+1e-5)/spacing),local=(along-index*spacing)/spacing;
  if(along>=total-1e-5&&total>0){index=Math.max(0,Math.ceil(total/spacing)-1);local=1;}
  return {index,local:clamp(local,0,1)};
}
function meshShade(base,row,height,local,segmentSpacing){
  base=Number(base);if(!settings.shadeVariation)return base;
  if(row>=Math.max(0,height-2))return greyDarker(base);

  /* Low-resolution sunlight/glint derived from the Illinois fence.
     Make the highlight a definite tapered wedge rather than a rectangular
     quarter. Pixel-sized expansion is deliberately stronger than v0.1.1 so
     the checker transparency cannot make the taper disappear:
       - top begins up to 2 px into the previous segment;
       - top-right reaches about 2 px beyond the nominal half-segment;
       - each lower row pulls the right edge inward;
       - the final highlight row finishes about 2 px short.
  */
  const spacing=Math.max(4,Number(segmentSpacing)||4);
  const highlightRows=Math.max(2,Math.ceil(height*.6));
  if(row<highlightRows){
    const t=highlightRows<=1?0:row/(highlightRows-1);
    const x=local*spacing;
    const right=spacing*.5+2-(4*t);       // +2 px top -> -2 px bottom
    const leftSpill=Math.max(0,2-Math.round(t*3)); // 2,1,0... px
    const inCurrent=x>=0&&x<Math.max(1,right);
    const spillFromPrevious=leftSpill>0&&x>spacing-leftSpill;
    if(inCurrent||spillFromPrevious)return greyLighter(base);
  }
  return base;
}
function paintMeshColumn(ctx,backdrop,foreground,sample,segmentSpacing,total){
  const baseY=Math.round(sample.y),bottom=meshBottomY(baseY),height=fenceHeight(ctx,baseY),top=bottom-height+1;
  const seg=segmentPosition(sample.along,segmentSpacing,total),phase=Math.floor(sample.along+.001)&1;let painted=0;
  for(let row=0;row<height;row++){
    if(((phase+row)&1)!==0)continue;
    const y=top+row,value=meshShade(settings.meshGrey,row,height,seg.local,segmentSpacing);
    if(setBackdrop(ctx,backdrop,sample.x,y,value)){setForegroundPixel(ctx,foreground,sample.x,y,top,baseY);painted++;}
  }
  return {painted,top,bottom,height};
}
function paintPlinthColumn(ctx,backdrop,foreground,sample){
  if(!settings.plinth)return 0;
  const x=Math.round(sample.x),baseY=Math.round(sample.y),top=baseY-1,envelopeTop=meshTopY(ctx,baseY)-1;let painted=0;
  if(setBackdrop(ctx,backdrop,x,baseY,PLINTH_DARK)){setForegroundPixel(ctx,foreground,x,baseY,envelopeTop,baseY);painted++;}
  if(setBackdrop(ctx,backdrop,x,top,PLINTH_LIGHT)){setForegroundPixel(ctx,foreground,x,top,envelopeTop,baseY);painted++;}
  return painted;
}
function paintTopLine(ctx,backdrop,foreground,sample){
  if(!settings.topLine)return 0;
  const x=Math.round(sample.x),baseY=Math.round(sample.y),y=meshTopY(ctx,baseY);
  if(!setBackdrop(ctx,backdrop,x,y,settings.topLineColour))return 0;
  setForegroundPixel(ctx,foreground,x,y,y,baseY);
  return 1;
}
function paintPost(ctx,backdrop,foreground,post){
  const x=Math.round(post.x),baseY=Math.round(post.y),meshTop=meshTopY(ctx,baseY),top=meshTop-1,bottom=baseY;let painted=0;
  for(let y=top;y<=bottom;y++)if(setBackdrop(ctx,backdrop,x,y,settings.postColour)){setForegroundPixel(ctx,foreground,x,y,top,bottom);painted++;}
  return painted;
}
function render(ctx){
  const points=routePoints(ctx.geometry);if(!points.length)return {message:'Mesh Fence: draw with Pencil, Line or Curve.'};
  const backdrop=ctx.layer('backdrop'),foreground=ctx.layer('foreground'),surface=ctx.layer('surface'),samples=routeSamples(points);
  if(!samples.length)return {message:'Mesh Fence: route is empty.'};
  const built=buildSegments(points),posts=settings.posts?postAnchors(points,settings.postSpacing):{posts:[],spacing:clamp(settings.postSpacing,4,64),total:built.total};
  const total=posts.total||built.total||0,segmentSpacing=settings.posts?posts.spacing:clamp(settings.postSpacing,4,64);
  let meshPx=0,plinthPx=0,topLinePx=0,postPx=0;
  for(const sample of samples){
    meshPx+=paintMeshColumn(ctx,backdrop,foreground,sample,segmentSpacing,total).painted;
    plinthPx+=paintPlinthColumn(ctx,backdrop,foreground,sample);
    topLinePx+=paintTopLine(ctx,backdrop,foreground,sample);
    setCollisionAt(ctx,surface,sample.x,sample.y);
  }
  /* Posts are painted last so they remain visually continuous through the
     optional cap line and still extend one pixel above the mesh. */
  for(const post of posts.posts)postPx+=paintPost(ctx,backdrop,foreground,post);
  return {message:`Mesh Fence committed · ${samples.length} route px · height ${settings.height}px${settings.depthTaper?` · depth taper ${settings.depthTaper}%`:''}${settings.posts?` · ${posts.posts.length} posts`:''}${settings.plinth?' · plinth':''}${settings.topLine?' · top line':''}${settings.collision?' · collision':''} · Foreground ${settings.foreground==='none'?'0':settings.foreground==='full'?'100':'50'}%.`};
}
function mountControls(container,ctx){
  ctx.ui.select(container,{label:'Mesh grey',value:String(settings.meshGrey),options:GREYS,onChange:value=>{settings.meshGrey=Number(value)||5;}});
  ctx.ui.checkbox(container,{label:'Shade variation',checked:settings.shadeVariation,onChange:value=>{settings.shadeVariation=value;}});
  ctx.ui.slider(container,{label:'Fence height',min:2,max:24,step:1,value:settings.height,onInput:value=>{settings.height=value;}});
  ctx.ui.slider(container,{label:'Depth taper',min:0,max:100,step:5,value:settings.depthTaper,onInput:value=>{settings.depthTaper=value;}});
  ctx.ui.checkbox(container,{label:'Fence posts',checked:settings.posts,onChange:value=>{settings.posts=value;}});
  if(ctx.ui.paletteColour)ctx.ui.paletteColour(container,{label:'Post colour',value:settings.postColour,onInput:value=>{settings.postColour=value;}});
  else ctx.ui.paletteIndex(container,{label:'Post colour',value:settings.postColour,onInput:value=>{settings.postColour=value;}});
  ctx.ui.slider(container,{label:'Post spacing',min:4,max:64,step:1,value:settings.postSpacing,onInput:value=>{settings.postSpacing=value;}});
  ctx.ui.checkbox(container,{label:'2 px plinth',checked:settings.plinth,onChange:value=>{settings.plinth=value;}});
  ctx.ui.checkbox(container,{label:'Top line',checked:settings.topLine,onChange:value=>{settings.topLine=value;}});
  if(ctx.ui.paletteColour)ctx.ui.paletteColour(container,{label:'Top line colour',value:settings.topLineColour,onInput:value=>{settings.topLineColour=value;}});
  else ctx.ui.paletteIndex(container,{label:'Top line colour',value:settings.topLineColour,onInput:value=>{settings.topLineColour=value;}});
  ctx.ui.select(container,{label:'Foreground',value:settings.foreground,options:FG_OPTIONS,onChange:value=>{settings.foreground=value;}});
  ctx.ui.checkbox(container,{label:'Set collision',checked:settings.collision,onChange:value=>{settings.collision=value;}});
}

S.register({
  id:'mesh-fence',
  name:'Mesh Fence',
  version:VERSION,
  category:'Scenery',
  status:'prototype',
  description:'Transparent checker-mesh fence for Pencil/Line/Curve with selectable grey, optional shade variation, depth taper, enforced start/end posts, optional two-pixel plinth and selectable solid top line, Foreground split and Surface collision.',
  supportedModes:['backdrop'],
  supportedTools:['freehand','line','curve'],
  layers:['backdrop','foreground','surface'],
  mountControls,
  preview:render,
  apply:render
});

})(typeof globalThis!=='undefined'?globalThis:this);
