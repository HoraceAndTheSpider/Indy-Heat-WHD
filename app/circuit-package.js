(function(root){
'use strict';

/*
 * Indy Heat circuit package / regional-presentation bridge.
 *
 * This deliberately does NOT change the runtime-proven $68 race-setup file.
 * Authoring metadata owns regional map selection and the existing race-record
 * marker fields; runtime sidecars are generated from the authoring package.
 */

const FORMAT='Indy Heat Amiga circuit package';
const VERSION=1;
const MAP_BOB_SIZE=0x093A;
const MAP_WIDTH=78;
const MAP_HEIGHT=47;
const MAP_RESOURCE_ID=0x16;
const MARKER_RESOURCE_ID=0x17;
const MAP_FRAME_OFFSET=0x177C;
const LAP_MIN=1;
const LAP_MAX=99;
const PRESENTATION_MAGIC='IHPR';
const PRESENTATION_VERSION=2;
const PRESENTATION_SIZE=0x14;
const PREVIEW_WIDTH=78;
const PREVIEW_HEIGHT=51;
const PREVIEW_ORIGIN_X=40;
const PREVIEW_ORIGIN_Y=32;
const PREVIEW_TRANSPARENT=0;
const PREVIEW_PLANES=5;
const PREVIEW_ROW_BYTES=10;
const PREVIEW_PLANE_BYTES=PREVIEW_ROW_BYTES*PREVIEW_HEIGHT;
const PREVIEW_SIZE=12+PREVIEW_PLANE_BYTES*PREVIEW_PLANES; // $0A02
const MINIMAP_TEMPLATE_TRANSPARENT=8;
const MINIMAP_ALLOWED_TRANSPARENT=Object.freeze([PREVIEW_TRANSPARENT,MINIMAP_TEMPLATE_TRANSPARENT]);
const MINIMAP_TEMPLATES=Object.freeze([
  Object.freeze({key:"arrow",name:"Arrow",width:9,height:7,hotspotX:4,hotspotY:3,transparent:8,pixels:Object.freeze([8,8,8,12,12,12,8,8,8,8,8,8,12,3,3,12,8,8,12,12,12,12,12,3,3,12,8,12,3,3,3,3,3,3,3,12,12,12,12,12,12,3,3,12,8,8,8,8,12,3,3,12,8,8,8,8,8,12,12,12,8,8,8])}),
  Object.freeze({key:"pitbox_blue",name:"Pit box Blue",width:6,height:2,hotspotX:3,hotspotY:1,transparent:8,pixels:Object.freeze([8,25,25,25,25,25,25,25,25,25,25,8])}),
  Object.freeze({key:"pitbox_red",name:"Pit box Red",width:6,height:2,hotspotX:3,hotspotY:1,transparent:8,pixels:Object.freeze([8,5,5,5,5,5,5,5,5,5,5,8])}),
  Object.freeze({key:"pitbox_white",name:"Pit box White",width:6,height:2,hotspotX:3,hotspotY:1,transparent:8,pixels:Object.freeze([8,3,3,3,3,3,3,3,3,3,3,8])}),
  Object.freeze({key:"pitbox_yellow",name:"Pit box Yellow",width:6,height:2,hotspotX:3,hotspotY:1,transparent:8,pixels:Object.freeze([8,31,31,31,31,31,31,31,31,31,31,8])}),
  Object.freeze({key:"startline",name:"Start line",width:7,height:5,hotspotX:3,hotspotY:2,transparent:8,pixels:Object.freeze([8,8,8,8,3,0,3,8,8,8,3,0,3,8,8,8,3,0,3,8,8,8,3,0,3,8,8,8,3,0,3,8,8,8,8])}),
  Object.freeze({key:"tower",name:"Lap tower",width:9,height:16,hotspotX:4,hotspotY:8,transparent:8,pixels:Object.freeze([8,8,12,12,12,12,13,8,8,8,8,12,0,0,0,12,8,8,8,8,12,0,5,0,12,8,8,8,8,12,0,0,0,12,8,8,8,8,12,0,3,0,12,8,8,8,8,12,0,0,0,12,8,8,8,8,12,0,25,0,12,8,8,8,8,12,0,0,0,12,8,8,8,8,12,0,31,0,12,8,8,8,8,12,0,0,0,12,8,8,8,8,12,0,13,0,12,8,8,12,12,12,0,0,0,12,12,12,12,0,0,0,0,0,0,0,12,12,0,3,0,3,0,3,0,12,12,0,0,0,0,0,0,0,12,12,12,12,12,12,12,12,12,12])})
]);
const TRACK_BACKGROUND_SIZE=0xC800;
const TRACK_FOREGROUND_SIZES=Object.freeze([0x2800,0x2804]);
const TRACK_SURFACE_SIZE=0x1180;
const TRACK_RECOVERY_SIZE=0x0460;
const RACE_SETUP_SIZE=0x68;
const RESOURCE_ENTRY_SIZE=22;
const RUNTIME_MAIN_BASE=0x1000;
const REGIONAL_MAP_SCREEN_X=240;
const REGIONAL_MAP_SCREEN_Y=1;
const WAYPOINT_MAGIC='IHWP';
const WAYPOINT_VERSION=1;
const WAYPOINT_ROUTE_COUNT=3;
const CIRCUIT_INDEX_MIN=0;
const CIRCUIT_INDEX_MAX=99;
const HUD_LAYOUT=Object.freeze({
  currentLapRows:Object.freeze([0,9,18,27]),
  totalLaps:Object.freeze({x:-4,y:43}),
  timerDigits:Object.freeze([{x:-8,y:47},{x:0,y:47},{x:8,y:47}])
});
// Exact five-row [dark-mask, light-mask] pairs from the approved digits.iff
// artwork used by the runtime-proven arbitrary-lap compositor.
const HUD_DIGITS=Object.freeze({
  0:Object.freeze([[0x05,0x02],[0x00,0x05],[0x05,0x00],[0x00,0x05],[0x05,0x02]]),
  1:Object.freeze([[0x02,0x00],[0x00,0x02],[0x00,0x02],[0x00,0x02],[0x02,0x00]]),
  2:Object.freeze([[0x05,0x02],[0x00,0x01],[0x05,0x02],[0x00,0x04],[0x05,0x02]]),
  3:Object.freeze([[0x05,0x02],[0x00,0x01],[0x05,0x02],[0x00,0x01],[0x05,0x02]]),
  4:Object.freeze([[0x05,0x00],[0x00,0x05],[0x05,0x02],[0x00,0x01],[0x01,0x00]]),
  5:Object.freeze([[0x05,0x02],[0x00,0x04],[0x05,0x02],[0x00,0x01],[0x05,0x02]]),
  6:Object.freeze([[0x05,0x02],[0x00,0x04],[0x05,0x02],[0x00,0x05],[0x05,0x02]]),
  7:Object.freeze([[0x05,0x02],[0x00,0x01],[0x01,0x00],[0x00,0x01],[0x01,0x00]]),
  8:Object.freeze([[0x05,0x02],[0x00,0x05],[0x05,0x02],[0x00,0x05],[0x05,0x02]]),
  9:Object.freeze([[0x05,0x02],[0x00,0x05],[0x05,0x02],[0x00,0x01],[0x05,0x02]])
});
const GAME_HUD_DIGITS=Object.freeze({
  0:Object.freeze([0x3E,0x22,0x22,0x22,0x22,0x22,0x3E]),
  1:Object.freeze([0x02,0x02,0x02,0x02,0x02,0x02,0x02]),
  2:Object.freeze([0x3E,0x02,0x02,0x3E,0x20,0x20,0x3E]),
  3:Object.freeze([0x3E,0x02,0x02,0x3E,0x02,0x02,0x3E]),
  4:Object.freeze([0x22,0x22,0x22,0x3E,0x02,0x02,0x02]),
  5:Object.freeze([0x3E,0x20,0x20,0x3E,0x02,0x02,0x3E]),
  6:Object.freeze([0x3E,0x20,0x20,0x3E,0x22,0x22,0x3E]),
  7:Object.freeze([0x3E,0x02,0x02,0x02,0x02,0x02,0x02]),
  8:Object.freeze([0x3E,0x22,0x22,0x3E,0x22,0x22,0x3E]),
  9:Object.freeze([0x3E,0x22,0x22,0x3E,0x02,0x02,0x3E])
});
const HUD_CAR_COLOURS=Object.freeze([7,24,23,15]); // red, yellow, blue, grey
const LAP_TOTAL_ORIGIN=Object.freeze({x:5,y:3});

const RACE_OFF=Object.freeze({
  lapDisplayX:0x24,
  lapDisplayY:0x26,
  laps:0x28,
  previewDescriptor:0x46, // long pointer to the retail 12-byte preview descriptor
  regionalMarkerX:0x4A,
  regionalMarkerY:0x4C,
  regionalMarkerFrame:0x4E
});

const REGIONAL_MAPS=Object.freeze([
  Object.freeze({id:0,key:'usa',name:'USA',filename:'indyheat_map_0_usa.bin'}),
  Object.freeze({id:1,key:'world',name:'World',filename:'indyheat_map_1_world.bin'}),
  Object.freeze({id:2,key:'north_america',name:'North America',filename:'indyheat_map_2_north_america.bin'}),
  Object.freeze({id:3,key:'south_america',name:'South America',filename:'indyheat_map_3_south_america.bin'}),
  Object.freeze({id:4,key:'europe',name:'Europe',filename:'indyheat_map_4_europe.bin'}),
  Object.freeze({id:5,key:'africa',name:'Africa',filename:'indyheat_map_5_africa.bin'}),
  Object.freeze({id:6,key:'asia',name:'Asia',filename:'indyheat_map_6_asia.bin'}),
  Object.freeze({id:7,key:'australasia',name:'Australasia',filename:'indyheat_map_7_australasia.bin'})
]);

// Added regional maps are embedded so Map mode also works from file:// without fetch/CORS.
// Map 0 is deliberately NOT embedded: the retail USA map is read from the loaded Disk.1 resource $16.
const EMBEDDED_REGIONAL_MAP_B64=Object.freeze({
  1:'AE4ALwAoAEAAHQAFAAAAHAAAAAAAAAAAedYAAAQAAAAATfW6FAAHAAAACgeT/BwGAaGgAAARB/gAAAQkQAATV+jwABCwAaxABAHR4ASByAFB4GokrfAMASAAAAwPAMnmAECAAAAYPcD8RCoAAAAA0BCBLAC7gAAADgABwKAA24ABPAxgAWxCA14AAn6GgADkAAMAAgb/goAAczYAQC8v/wiAAH7IAJS/v/4IAAD/EAE+39f/JgAA/ODDz/3j/t4AADwAIctf+Vw8AAB7wAK9P5AEWAAAPKAR//+4AAAAAgqyA//+kRFAAAALfA///xL6UAAQA6Qn//oUYMiAAQE8HK/0HDDgwAAAwwQB7glBwgAggMGDgAwQbKAAIAGAwAB4EC/0AAABwEAwYAAIDwgAgGAwECAAC+FEAkDwYBgBAACuIAAAdgAfAAAAHAAAAHzCHwSAA3EkBAB0gAYoYAf+gAIAcAIOTABH+gAAAHYCDgAIAfyAABCkAgaAAAU5AACAOMb+xvxKkRQAAJDmwEQgpIw4AAjcvsBkGPkCcAAAUN74ODD+gCAAADDOwGUw/wAAEAAAxsBCMP+AAAABAMb8xjD/gAAAAAAAAAAB/4AAAAAB//9///+AAAAAAX3/X///gAD////n///////8///mKf///////P//Hmfv//7///z/+81z8/v/f//8/+/83////9+//Oy6n+///9//3/zy/39/+353/6+c1H9yT/f+3w//9PvzNjn//3yG2fTiGcO/9//9P/+s/7nb/1X67PeTvP4R3/92fhDGL/z+2+v+t+IBiRt8/3t///5d+bJd/P+N3/+M8t3gF/z/kH//i1TD8ff8//jv/sHoK/DZ/P8aH7w9Bt2YQ/z/+3/+PbRiI0v8/+8//M7jc5rn/P/LX/6kEibX//z9/e/9cDn+7r/8/fXf8cDy6d3v/P/93/gOX/v/f/z//tPrUlvnz//8//88+NwZ9/59/N//jvx88++bX/zf/n8//xf/+Nv8//4e/+8///f09P9/lh/pn//1/rj/v2Y/8v///838///Yf+z////D/P//0n/0///+jPz//7l//9f//PD8//+t//Hz//vs/P//qf35///+k3z//9f//////ub8//////3///1/6P//7z//////f8T///////////3M//+/e/f//////P//zz////////z///8////////8////OXf//////P////////////z///4AY//////8///+ggP//////P///+f///////z//+QB///////8//4EQ+///P///P/zCAPz+/8/P/z/55wH//P9H7/84LKOB//20AHP/OABRwf4dkABARzEIDIP8iCAAAAU0EAiMfBAAAAABOAAwz/iAAAgB4zeAcv/QYAANAM8/gDD/3IAAAIPPP6YQ/42AACBCzz/GgH/ABAgAAX8/wlX/wAQkAAF/P8AL/+IBMAAQfz/AG/+AOAIABn8/wIfvD0CDABD/P+AP/4dAAAiS/z/4z/8TMBACGf8/8Nf/AAAAAB//P3gr/wAIMgIv/z98d/wAFDhhe/8//zf+AAT++9//P/+A+hAAefDv7z//wT4AAH37l383/8A/AAj74lf/N/+AD/gB//o0/z//gAf4A//5zB0/38AH+AP//H4uP+/Aj/wX///zfz//8g/4Jv//4H8///Cf/Ab//4E/P//iH/xk//8APz//43/8HP/+AR8//+B/fh///4CfP//l//8//8AYPT//585ATkDAHHg//+vGT85zwB9xP//nwk/k8/wecz//58hB8f//n/8///PMT+T//9//P///zk/O/////z///85Az/////8/////////////P///gAAD/////z///4AAB/////8AAAAGAAAAAAAAAAAF/4AAAAAAAAAAItMGAABAAAABAp0BAwEAMBAAAAYYgwADAfgAAAfSRGYAAkv/jAAH/65GAeMv/7+YD/b3RAP3/////g7/91OD7/////4Hn88wB3/////MCH+NAC2f////MABf7wAjf/+5/DAAdv+Acn//Yl8wAB7/gD//fmwegAAjegA//Ld4PoAAJEwAHv8Q/H+AAD48AH/Givw5gAAm2BC0IXdmbwAAHvAAfL0dqO0AAAMwAPDI3/7iAAAPKADoHZn/4AAAh9QBXBZP/9AAAIOJAnAox56EAAAAyAgDgwMHIgAAAH8F1IeGHyAAAAA/wf/egxRogAgAP8D//QQV6AAIAF/wB/4ABc8AAABf+Af8AAYz4gAgL/gH/AADgdEAEDvwAfwAAAyEAAAGcAc9AAAbhAAABOABOwAAc8kAgBbgA/sIALxAAAAbgAJjAAH7YAAAG4CAYAAApOAAABYAQMAAP+HCAAAYAACRvz/jhwAAHAAAIYw/4YoAABsAAAsMA+GMAAAYAAAOAABgAAAADAAACwAAIAAAAAAAACEAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAHwAAAAAAAAAAAD4AAAAAD////////////8///tx////////P//lPP///////z/9Zl/////P7/8/+ee3//z+R+//PPy7uf/9vABz/zgAdZn/PbIAQG85CQz//4hoAAAFNtAIzPwQIAAABztgP9/4gAAIAec3oHv//OAADQHPP8AY/97AAEGD3z/9AH+fgAAm4+8/3oB/wAQILoH/P8IV/8AOp3gBfz/UO//jDPH8kn8//h//hT6G/kf/P/6v759Bs2YW/z/uD//3xVgMn/8/+v//s3rUAx//P/P//zmE6gAf/z/6r/9efjZCf/8/fn7++Tz49///P///9+Pe//v9/z//zf4xtH383/8//+F/ABL/67f/P//gf+AJ//t//z//wB/4D//7Of8//8AX+Av/+89fP//QB/wD//5+Pz//+I/+F///+/8///YP/yb//+d/P//2n/0H///Bdj///j/97Pf/Pb8///t//h3///+fP//4/38f//+lvz//7f//v//AHn0//+///+5AwBx9P//v3//ec8Aeez//9O//9PP8Hvc///f+/fH//5//P//////0///f/z//////3v////8/////3c//////P////////////z//////g/////8////ffwf/////A==',
  2:'AE4ALwAoAEAAHQAF/1xf/////////H+ZP/////////w/jX/////////8P32f////////3C+tn////////9w+dxn////+///MPI/uA////D//jHZmtVQh/+g//sR+nogI6UgQl/hsf05XYIIEHEPkfG4MZJk5AAEz0Gxr918gUIgCU4Bc/rlM0KqYBJcAXMjVRVAQCAUOQLD3q4zCrSwFBIBw394hFDYOBQoG8Kwh3KiATgMED+DbnKoIDAICABfg5EuzQxAaAAAe4NvjV4SzUgAANmD+XqorRhOAGHzgvWXUTrPvgPw94PtdqgOKCePxr+Cz5zNLKfH/43XAu6FUIIsi/gJ1wJn+dpOH8JwGqsDZ4b0qeSAcAVVgzP9px/3aOAaSoN71dlMaXLgHZWBv/t+Nzr1wB1rge//1cfv5YAbFwD3/79z/vOgFq4Af///3vzNgCScAH//////++EbfAAf///7u+5oNrgAD/////+7tSzwAA/f8AAAAAAV4AAH3/Mb8xvxKvAAB9/zmwEQgpPwAAP/UtsBkEPl8AAD77N74ODD+vAAA+/DOwGQw/04AAPv8xsBCMP+PAAH7/Mb8xjD/xwAA//wAAAAA/+OAAH////9////zwAB//X3/X///+YDIo6AAAAAAAACM5GbAAAAAAAAAhPVygAAAAAAAAIDugWAAAAAAAAAw9mggAAAAAUAAOPeN5gAAAAPAADjzVJH8AAAH4AD8+bqKq/4AH+gD/PlCJ/f////+H5zwwmif/////j+c0bKTZ/////5/PPyJAN//9//8/zzjxwMv/+///P98/6oqr/////n+fOhWwz//9/////z7JYbv//v///t8135UX//7///0/OZoqv//////6fz+vSN//////+n8/Drff//////R/PP1kj///v/ni/znvwe///1/G6f87ftrn//+nP4L/O979i///2P8E/zvd3s///+f/BP8539sP///7/pH/Oe/zD///+/8z/z3v95//////Y/877/g////3/l//Pe/5P///7/5T/z/P5j///+/+l/8/396////v/if/P//9n/////xH/z+7/t////f8D/8/2/3P///7/Rf/P8X/9/////4//z/ifQAAAAA/r/8/4iUxvzG/P1//P/LOCbAxjD/f/z/wyz2wGww/7/8/+eQWvA4MP/f/P/njA7AbDD///z/98AGwMYw///8/4fAAHTGMP///P/B4AAAAAD///z/8eAAY//////8//nyggP//////MgAAAAAAAAAAIzkAAAAAAAAAACE9AAAAAAAAAAAgOwAAAAAAAAAAADmAAAAAAABQAAA5AAAAAAAA8AAAPAAAAAAAAfgAMDgAAAAAAAP6AOE4AAAAAAAHz4cDOAAAAAAAAh+PBzAAAAAAAAB3nAEwAAAAAAAA5zACMAAAAAACAccwByAAAAAAAgGCcAcgAAAAAAEBgeAPIAAAAAAAgYOADyAAAAAAAICBAB8gAAAAAACAgAA/IAAAAAAAgAAAHyAAAAAAAIAAAB8gAAAAAACAAAAfIAAAAAAAQAYBXyAAAAAAACA4AP8gAAAAAAAYwAB/IAAAAAAABwAAPyAAAAAAAAIAAD8wAAAAAAACAAAfMAAAAAAABAAADzAAAAAAAAQAAB84AAAAAAAIAAA/PAAAAAAACAAAfz4AAAAAAAgAAP8/AAAAAAAIAAH/PwAAAAAABAAD/z+AAAAAAAIAA/8/wAAAAAACAAf/P+AAAAAAAAAP/z/gAAAAAAAAD/8/8MAAAAAAAA//P/DAAAAAADwH/z/44AAAAAw/h/8/+OAAAAAMP8P/P/zwAAAAjD/h/z/g8AAAAYw/4P8/8HgAAAAAP/B/P/x4AAAD///4fz/+fAAAB////H8AAAAAAAAAAAAAAIAAAAAAAAAAAABMAAAAAAAAAAAErcAAAAAAAAAMBn/8AAAAAAAADgb/7+AAAAAAAA4D////gAAAAAAPB/////+ABAAAHgf////v//gwAPwH//f/33/94AD4D/ff/7X//4gD/g/////r3/8YD/0P7///9X3+OA/4H/////v9/nwP+B/v3/9Wvv5+H/Af/9/+9n9+fH/wH+f//d/tf37/4B1f9/3+/39//8Ae7Tfvu/t////gHVcJ/tt7f///4BoIm/Uuf3///+AUlh99UzW/+f6gEcgn/11938f/ABMHBv01l+c//4ARlqG33ff4///AGcAo+58//f//wAmHA/Vl9/3//+AM4CBuAJn7///wCkKD6zt6+///4AUAApyMfPf//8ADgAPjkTv3//+AAYAFiMLX9///AACAAuISN/f//gAAgAFAAT/7//wAAEACYEVP/f/8AAAAACAAf/3/+AAAAAIAAAAAP/AAAAAAAAARvz/wAAAAAQAAIYw/8AAAAAAAAAsMA/gAAAAAAAAOAAB4AAAAAAAACwAAPAAAAAAAACEAAB4AAAAAAAAwAAAfAAAAAAAAAAAAD4AAAAAAAHwAAAeAAAAAAAD4AAADgD/WB/////////8/JA//////////PwBf//7v/////zsAB/////////M5gAP//9/////xOQAAH/d3////8TwAAAB/3/////A4AAAAAHv7///hOAAAABAAB8//AzgAAAAggAIf/wcwAAAASgAAd/wBMAAAABQgAOfwAjAAAAAKggHH8AcgAAAABAIBg/AHIAAgAKlBAYHgDyAAAAEJgIGDgA8gCAACIBKAgQAfIIAIAgEAgIAAPyECSBBEBIAAAB8iCJQBJISAAAAfJJUgCtGAgAAAHytJQAKsykAGAV8uFkgAooIgOAD/LPjIAspoGMAAfy5IVAgiCAcAAD8mP5UEYMACAAA/MnhkCpoIAgAAHzEP2hH/ZgQAAA8xvVwUxIUEAAAfOO+xI3ODCAAAPzxP7BxuxAgAAH8+X9o3PSgIAAD/P3/9He3ICAAB/z97/p/+wAQAA/8/u/2furACAAP/P/3/3/+AAgAH/z/5/QAAAAAAD/8//fUxvyAAAA//P/n+GbAQAAAP/z/99S2wEAA8B/8//Pk2vAAMP4f/P/74M7AQDD/D/z/++TGwEIw/4f8//v0xnQGMP+D/P//9AAAAAD/wfz//////g///+H8///9ffwf///x/A==',
  3:'AE4ALwAoAEAAHQAFAAAJIAAAAAAAAAAABlNggAAAAAAAAAM8hYAAAAAAAAACfACAAAAAAAAAAccAYAAAAAAAABCGAAgAAAAAAAAANwAEAAAAAAAAABQABgAAAAAAAAAYAAFgAAAAAAAARAACDAAAAAAAABAAAgoAAAAAAABQAAAAAAAAAAAAUYEmAAAAAAAAAFAiYQCAAAAAAABwEAABAAAAAAAAPI+FggAAAAAAAD0cmIIAAAAAAAAY/WtAAAAAAAAADn88RAAAAAAAAAF/u6oAAAAAAAALt/8CAAAAAAAAAPf/BAAAAAAAAAD9fUQAAAAAAAAA/n0YAAAAAEAAAHl4YAAAAAAAAAB7yMAAAAAAAAAA/sCAAAAAAAAAAGx4gAAAAAAAAAB8g4AAAAAAAAAACaIACAAAAAAAADwGAAAAAAAAAAAGPAAEAAAAAAAAHAgAAAAAAAAAAD6QAAAAAAAAAAAZYAAAAAAAAAAAP+AAAAAAAAAAAAAAAAUAAAAAAMb8xvxKgAAAAADmwEQgpIAAAAAAtsBkEPkAAAAAAN74ODD+gAAAAADOwGQw/wAAAAAAxsBCMP+AAAAAAMb8xjD/gAAAAAAAAAAA/4AAAAAB//9///+AAAAAAX3/X///gAD///H////////8///5n59//////P///99///////z///+X///////8////v+9f/////P///3/5//////z////6pv/////8/////8d5/////P///8/PX7////z///+/Tzf7///8////vjv9/f///P////+7v/////z////8/9v////8//////lt1////P///5++/37///z////d/vv////8////9//d+////P////+/3+////z///////9f///8/////7//f////P////Xv/v////z//////+3////8/////6/+v////P/////7/O////z/////97f////8/////7a//////P////9rPn////z/////tzf////8/////7N+/////P/////3Xf/3//z/////59v////8/////9tf/////P/////v//////z/////6y/////8/////+6//////P/////o//////z///wAAAAA/v/8///8xvzG/P1//P///CbAxjD/f/z///z2wGww///8///8WvA4MP///P///A7AbDD///z///wGwMYw///8///8AHTGMP///P///AAAAAD///z///4AY//////8///+ggP//////P//8f////////z///mfH3/////8////HAX//////P///pUA//////z///+IIF/////8////CEAP/////P////CAh/////z////6AAH////8////wAAJP////P///4wIAgv///z///+AAACJ///8////wgAAFP///P///+CBAwD///z////AAGUA///8////gBgCEP///P///8AYgIf///z////hgAAD///8////8QBAJ////P////ABAAf///z////8AAQr///8////9AAgA////P////8AASf///z/////AACn///8/////4AQD////P////+AAH////z/////gAL////8/////wAAf////P////+CAP////z/////gQD////8/////8MB//f//P/////BA/////z/////wx/////8/////8Ef/////P/////iL/////z/////4D/////8/////+D//////P///AAAAAAAf/z///wAAAAAAH/8///8AAAAAAB//P///AAAAADwf/z///wAAAAw/n/8///8AAAAMP9//P///AAAAjD///z///wAAAYw///8///8AAAAAP///P///gAAD/////z///4AAB/////8AAAPwAAAAAAAAAAABuHggAAAAAAAAAHj/wAAAAAAAAAB7/8AAAAAAAAAAH//4AAAAAAAAAD///gAAAAAAAAAH//8AAAAAAAAAA//+gAAAAAAAAA////AAAAAAAAAf//79AAAAAAAAH////4AAAAAAAB//t/+AAAAAAAAN9/7/wAAAAAAABfN9/8AAAAAAABb+7+/AAAAAAAAL1j6/AAAAAAAAAXDZ3wAAAAAAAABgNS4AAAAAAAAAkFDuAAAAAAAAAEgRHwAAAAAAAAIsCD8AAAAAAAAAGAB+AAAAAAAAABoA/gAAAAAAAAAMhPwAAAAAAAAADgHgAAAAAAAAAB4NwAAAAAAAAAAkDeAAAAAAAAAAGqHAAAAAAAAAABZDwAAAAAAAAAAA+4AAAAAAAAAABn8AAAAAAAAAAAj4AAAAAAAAAAAO/AAAAAAAAAAADrQAAAAAAAAAAAZwAAAAAAAAAAADwAAAAAAAAAAAAAAAP+AAAAAAAAARvz/gAAAAAAAAIYw/4AAAAAAAAAsMA+AAAAAAAAAOAABgAAAAAAAACwAAIAAAAAAAACEAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAHwAAAAAAAAAAAD4AAAAAD///i////////8///9n3///////P///zwB//////z///69AP/////8////hwB//////P///45AB/////z////iAIP////8/////gAD/////P///8gAAX////z////MAAIP///8////kAAAg////P///9AAABD///z////wgQIA///8////0CBhAP///P///9AQAAH///z////8noGH///8////9ZyYg////P////m9C0f///z////+fzxH///8/////T+7K////P////2n/gP///z/////9+0n///8/////618J////P/////6fB////z/////8TB////8//////KI/////P/////qAP////z/////5jD////8//////ED/////P/////DA//3//z/////5Qf////8/////8Mf/////P/////MH/////z/////6j/////8/////+h//////P/////o//////z///wAAAAAAH/8///8xvyAAAB//P///GbAQAAAf/z///y2wEAA8H/8///82vAAMP5//P///M7AQDD/f/z///zGwEIw///8///8xnQGMP///P///AAAAAD///z//////g/////8////ffwf/////A==',
  4:'AE4ALwAoAEAAHQAFAAAAAAGAAAAAgAAAAAAG4AAAAAAAAAAACZAAAAMAAAAAAGIgADwYgAAAAAA1FABCOAAAYAAAbAcOYKgAAM4AAEgCjo4EAAAhAAG4YEUAAAAANgACcKBOgAAAADoABOFAiQAAAAAcAAniAdYAAAAAAAIDgggAAAAAAAAAD8RNgAADBAAAHAaSd4AAAKwAACgMoC4AAIDUAABIC2YVAAA9bAAApASEIABAovwAAEgCZzQAAFv8AAGQArRYQIK2vAAEdAKIAKD3vfwABlgCo0AGpv/8AARwBmyAEXtG/AAKgRgAABb/vvwADt0wBAhH/uX8AAZpQAAAAP3//AAAlgBBgh0I//wAAWOBnBoC3v/8AAAMJP3+AK7//AAAoFz94gQB//wAAMD3/FCKQL/8AAAxe/9YHg1//AAAEH/H9hhsP/wAABH/BLACaAf8ACoS/NmIIKwD/AA18X9W0GAGBPwAP9mY4/jDgAv8AD//A3i7RAUz/AB/+8f+1/xKnTwAX+znzVyjpM/8AF/0t8/k1Pk//ABf9d/+ev/+//wAH/jO8mY//3/8AD9wxvxL/////AADgMb837b///wABAAAEAKZ///8AAAB//9//////AAAAX3/X/////z////////////8//////9//////P/////9/////fz/////+u/////8//////vv////5P/////fv/v//+T/////3Xz////s/83//5f/////uP/b//+r3////1T/9///X/13//84//f//N/6//98FP////rf9//8PSz////2/7v//Sc8///7+nv9/7/JvP//1/WL//9/8sD//8//7/vcnhNQ//83/9///PRHaP//7//7++rx9yD//+/9b/b78ln4///3/f+/r4/25P/79////P/V//j//v3///19WfP8////9f/iap3L3P/7s+//2r9hXWT///f3tbD17w8M//+/+/er8d8GkP//f739+y/qwDT///+tvf6cmYFU////+1o+H//gjP//7/v9/7f/9hz//+55hrsn8eDs///9f3T///t1RP//9jV/XX/3/hT/9/vrXvKf+/Zg/97/hz8vv//1eP/+k3+/vn//q7j/5db/38z//vfQ/8z////v//0/2P/7vz/75/f/duj/9R//9v8///e0/+Pve/f///+v/P/9bz///73/0zD//r8/x/f7/7v8////OXf/9/+x+P//////////ugz///4AY////+fM///+ggP////pkP///////////4D//////n////8A//////kf///5AP/////wL///+ID/////8Qf7w/gA/////8AH++GoAP/P///AAP+OBAD/gf//gGB/AAAA/8P//gDAfoAAAP/j//wBwHEAAAD/9//4A4DWAAAA////8AOAgAAAAP////DHiYAAAwD///vwE/2AAACo///H8ID+AACAwP//z/nj8QAAEAD//yf/w+AAQAIo///P/kPwAABSIP//x/xn0EACAAD//nf8b4CgAICA//pz/v/ABAAQAP/8Yf5sgBEAAgD/+sHwAAAAgIIA//qR4AQIBABAAP//4cAAAACsAAD//4cAQIIRCAAA//9/gAgAAMoAAP//7AAAAACIAAD//6AAAAAEAQAA//+AIAAAgkAAAP//4EgAAAYBAAD///AAAMYcOCAA///wAAAAHnAAAP/j8oAYAB/4AAD/0PAHHgA//AAA/+CAf48Af/4IAP/gAH/fgHwAIAD/wAM5AwEAABAA/8AHGTEBAwAAAP/ABgk2gwDwAAD/wAchA8ew/gAA/8APMTODsP8AAP/6PzkHI/D/gAD/+/85Az/2/4AA//////////+AAP///gAAD///gAD///4AAB///4AAAAAAAAAAAAAAfAAAAAABAAAAAPwAAAAAB+AAAAb8AAAAAA3wAAAHfAAAAAAL6AQ8B/wAAAAAO/wEHlf8ABAAAD//AHH7/AB+AABXn4D///wAOAAB/z+Ff/f8ABQAA/4/jv///AAIAAe8fyn+//wAAAANfHd////8AAAABvh0f///+AAABA18An////gAADgOXgH//r/8AAAwBDgL///SlAAA+AA4H7//XywAADABjQv939YgAAA4A4gv/39JQAABmAMQf/9IwIAAB4wBAD/deRAEAAOOAZN/94Q7AAAHPg///+mA0gAAD34f//+8n3oAAAAeP/v//67gcAAAaP/6/9P8ITgAAIH+a8X96y3wAAAT2wIB/9k/6AAAf6MiVf//F6AAAD8o+q/1/0dAAAAOzf2n6XeX4AAAD4M6z/GH4VgAAA4Gm0/hr7G4ABwPnyfn4Afs/AA+DMjjrYAB+zwAGPeAUHUAAfx8AA4/gjBVg//sHAAmBAAAfv//8nwALgAABLZ//7gsAC5pAAw8uw+AOAAsGAAAOAAB0AAAJkAADDxAAMjEAAPAACidBQBgAAAEAAAAwYgAPgAAAAAAAAAAAB/wAAAAAAHwAAAX8AAAAAAD4AAAF7z///////////+A//////7/////AP/////5n///+wD/////8i////iA//////UX+8P4AP/////sB/vhqAD/z///yAD/jgQA/4H//7hgfwAAAP/X//4g4H6AAAD/+//8QcB5AAAA////+MOA1gAAAP////KDiIAAAAD/////x82AAAME////8pP/gAAArP//7/yg/gAAgMD//8/75/UAAD1o//+n/8fgAECi+P//z/5n9AAAW/z//8f+99BAgra8//53/u+AoLe9/P/6c/7/wAaG//j//HH+bIARe0b8//rB+AAAFv+u/P/60fAECEdgxfz//+HAAAAA/R+M//+XAEGCHQje1P//f4GcGgLe0jz//+wk/f4ArsFU//+gXN2iBAHo3P//wPf8UIpAvrz///F7hlgeCWj8///wf8X2HHg/5P//8f0EsB54BlT/4/Lo2Ig//ANg/9Xxdx5Qf/4E+P//mf+vuP/+C7j/9dZ/36p8ADPw/937//+BAAAdGP/b73/5SYMAR/j/1Za//8NE8D/0/9Pn+/fH//4v/P/d///zw7//dzj//n//12P7/7/8//v//3c/9v/x/P//////////+gz//////g///+/M////ffwf///p0A==',
  5:'AE4ALwAoAEAAHQAFAAAADCoAAf///AAAADnbiAP///wAAABBPQlC9//8AAOAW77GpbH//AAAwGxvvlvBvDwAAAB8L8f94HgcAAAALrX///54AAAACP/Q/P//+AABAADezQP//2wAAAAHP4rD//7gAIAAHv/9f/994ADAEAn//vj+/WBAgAAf///7/8PgoCAAH////3+g6QCQBB////s/wCIMcAAX////v4BkDMABHw///+oAVAACAa25//vdgDQQYAEotD//a0AqCBAAkAiP8b6AGggYAAwAAHUeAAQACgAEEAAEHQAAAAEAAuAAAZ4AAAABwAAPAAf0AAAAgeAAAQADbAAAAIA0AAgABPAAEAAAGgAJAAfQAAAAwA4AAMAPoAAQADQIAADAK2AAAAD0BAAAIABgAAAA+BgAAEKgIZABAPgYIAA8cCgAAADkCAAAPfBmAAAA8DAAAP30TkEAADDQAAD/4ZgAAAAQ4AEAf+I8EAAABIAAAH/AdAUAAAwAgOb/5vxKgAAfABLm/0RopIgADgABts9kEPkAABoAAd7/uDD+gAA0AADOx3Qw/wAAWAAAxsRiMP+AANAAAMb8xjD/gADgEAAABgAA/4gAwAAB//9///+AAIAAAX3/X///gAD/////Of/+AAAA/////i1/5ggAAP////7+jz8+gAD//v/k0z/OBAIA////09rJoxFDwP///8P7fAMdxaD/////X2ACBoSc////xj//AAAS+P///+E//gQCnuz////Af74GAwt8///nACiHA49crP///gABBwF/o/j///gAAAWAPz30///wAAACwH/P/P//8AAABMB/3/T///ggAABh/9/8///x8AAAd////P//8PYABD//7/y///brwAac///8P//9frkOwf///I//++6//OH///z3///rd83n///83////+m+I////J////+v8R////z2f///+42f///8K4/////jH////PX3////rj////x3u///vnl////86Nf//6a2v////A2f///f/b////wHL///9//////8L////9+f/////B/////CT7v///wU3///ggnz///8+7///8A/5////E9////AF+////zr////4F/P/v/8U/////zf//1//LX//z/h////f/xT////8f/////8V///e/H//////K///z/4//////y///8/+v/////8P///OXf//////H////////////x///4AY//////8///+ggP//////P////w4uAIAAAD////4CQwGCAAA////wjwLCj6AAP/+/8TSD4QAAgD////B2okDEQAA////wftUAwBBAP///+4fYAIGABD////GP/wAABAA////wA9+BAKMAP///wAqggYCAAD//+cAKIcDDVAA///6AAEFAX0gQL//+AAABYAfIOD///AAAALAP8nw3//wAAAAQH+D9P//8CAAAGH/x/z///FAAABj/9f8P//gsgAEH//n/D//5KIABgh/6/wf//AciQqA//v4j//4KBL0gP//+AP//AAAjQX///wJ//7gAAAj///8Af///wABF////IB///8ABR////wAB//+AAIf///8QBP//wAGH////HAL//+ACT////wgA///oCK////8DBf//4FAP////AAP///C8H////wqP///npZ7///8BC///8BIM////BAf//+AAGP///xwv///wCXD///8RX///8AD7////Ar////gQccAf/wB//85AAEDAH/8Ff//GSEBzwB//BP//wkhE8/wf/wT//8hAYf//n/8J///MTAT//9//B///zkyO/////w///85AD/////8f////////////H///gAAD/////z///4AAB/////8AAAAB////gFTvAAAAAclf/8oUHwAAAA/2/b9foG8AAEANyUwW04CPAAAADIn560/Q8AAAAAmALxU38fgAAAAEWiTlyeX/AAAAD4gA174d/wAAAB9MIGpst/8AAAAwH2+iONf/AAAEQMqhMDP3/wAAAYHARbhA7+8QAAEj4BCMGD/HCAACB/F4RhAXgwgAAG8A0S0gFwIAAAJ5P/hggAYAAACCfB/AVwAOADAAB/2D4CgAAgAwAEf68Sy1oAUCOAAD//5bvkABATwAAf///v9AAAE/AAD7//79gAAAP4AAR////gAAAD+AAAA//74AAAA/4AAAP/+0AAAAH/4AAH//aAAAAD/9AAA//mgAAAAf/wAAH/3wAAIAOv8AAB/9sAAAAAP+AAAf//BAAAAx/AAAD//wAAAAC/wAAB/v8QAAACf8AAAfn/MAAAAH+AAADIvlAAAAP/gAABMPjwAAADvgAAALBwIEAAA+wAAAAx+OP+AAPYAAAAAXvz/gAD2AAAADb4w/4AA+AABABW8MA+AAPQAAAAB+AABgADIAAAACawAAIAA4AAAAAuEAAAAACAAAAADwAAAAACAAAAAAAAAAAAAAAAAAAHwAAAAAAAAAAAD4AAAAAD////8OLgDigwA////+FmMBgkAAP///8I8Cwq+qED//v/E2s+kABIA////wdqZQ5EABP///9n/VIMAWQD////ul2BCBgAQ////x3/8AQAQAP///8APfgQCjAD///8qCsJHHoAA///nACiHAx1AAP//+wCRIQr9YEC///oAAAWAHyDg///yIAAGwD/J8N//9gAIg0l/g/T///IhAAJh/+f8//33QABAY//X/D//4LoQBl//9/w//+SiAAYIf+v8H//wHIkJgP/7+I//+CgS9ID///gD//wQAI0F///8Cf/+4AAAI////AH///8AARf///yAf///AAU////8AAf//gACH////EAb//8ABl////xwC///gAk///f8IAP//6Arv////AwX//+BQD////wAD///wvB////8Kj///57We////AQv///ASDP///wQH///iBBr///8cL///9Alw////EV////AA+////wK////4kHHAH/8Cf////yBAwB//BX//3/hQc8Af/wT//+/41PP8H/8G///+/eH//5//Df////0U///f/wf////9nv////8v////3Q//////H////////////z//////g/////8////ffwf/////A==',
  6:'AE4ALwAoAEAAHQAFMAAAAAAAAAAAACgIAABMAAAAAAACVAAADgAYAAAA01cAAAfAFgAAAECyAA4KoAgAAABBFiKL6AwAAAAAS0FYBsITCAAAAJUYAMmwAXCAAAAfAgACgACgQAAARIAAAEAACExAAAgAAAGAAAAJ7gBwAAAAASoAAIfAqAAAAAIUAAACgMAENIAC3QAABgAACyqAAX+AACcAAAC8JC/+0ghkAAMF/Wsb//IIAAA+B3v+7//eGkgAOgy87f///g4YAEDAP/////oDIACiAD3////kHhAA8k5xn///IDUAAL//vG3//5FvAABL/z4M//8HxAAAlT//9H8+D84AAOa//9g6H4D4AAD1/39wCA8FZAAA//+ecAAOBBAAAP/f+XBhAABgAAD/z/DwkQQOAAAA/+fgcQZAMgAAAP/3QDICqcAAQAD/+AAwAEdEAAAAa/+AJAJTAAAAAAD+AB4AEoKAAAAD/wAYAhkFAAAAAP4AAgCoPQUAAAB8AOb87v5KgAAA+ADmwHzhpIAAAFAAtsBlH/kAAAGgAN74OrP+6BARgADOwHZ3/ygAJMAAxsBDtP+RAHgCAMb8x/n/6QA8TAAAAAAP/4AA8J4B//9///+AAPE4AX3/X///kAD////////////8//////f//////L/////7//f///z94////f/////898n///3//////Pv////3f/////y9/v3/3+/3///8y/7//e/e/////P////3/y1////z/f////Fv3v//8///v//+n+/ff/P9tRXv94f//0Pz0++s/4w+vX518/7ZbxSEqAz/5/P3rerYXwZp///zUq8Mf9YEud//88NsCluQAHX///D3tA4oYABI///ztEUMTAAAB5+/8rHxAAAAABu///Fn3RgAAAJsv//yt8YogAAC63//80ADDMgAAdz3//PQAwaEAAN57//x+wAAYgMHve//8P8AAJ0YAn3///B2BgY9/8V////wAYPOG/yt////8ACAfif8u3////AAwH6/+hT////wAGD/L/br////8AAj/7/2n/////AAH/+//vfv///yUAP///+n////8+wH////t/////CuB//////////z/g//////+/v/8/4f///////1//PqP/z//97//f/xsv//////8///8U3//e/f//////Ox//z////v/1/zv//8///5////8h///OXf//////IH///////////wP+/4AY//////8E+f+ggP///+//D////////////wv////9//////8A/f///v/9////NHD///9//f///zAwP///L/////8wfa2++Uf/////In+WHbCA/H///zBGADNoAD4///8nwIAAIABCH///PwAAADAABAP//z4AAABgAEIA8/88AAAAAGgAACA/KAAQAACBQAABTzABBDAACoAAAD8AAt6kBHBiAAn/AACgQTlgSoAb/wQgQCCwAAYD8f8PQ0DiggAEhvP/CgAQwEAAAEHz/yMQAAAAAACB+/8AAAGAAAAiA///KHhCCAAALgd//yQAIIgAABTPf/80ADBIQAAxnv//HYAABAAgQ97//w/wAAgRgCGe//8HYGBhBgBB+f//ABg8gAACgef//wAIBkAaQYH///8ABAfoPAED7///AAQP8H8oj////wACH/j/Kf////8AAf/4/2l+f///IQA/+f/yf3///wgAP///8T6///8A4H/+f/Z9////ACD//v/7/wAf/wAB/85AykCAH/8AI//GT8xhwB//ACf/wk/kwzwf/wBf/8hB8O7/m/8RD//MT+T+/8X/Cz//zk/Oj//n/yEP/85Az///+/8gH3//////////AD7/gAAD///v/wR4/4AAB///5/8wAAAAAAAAAAAAPAAAAAAAAAAAAD8CAAABgAAAAAAfjoAAAMACAAAAD8PAAAFwAAAAAA+CckMH+AAAAAANAHniT/+DgAAAH73/zNf/4cACABg/f/9f///gAAAA////z////AAAAf///5////8MAAP//////X///8AX//////v////wD//2//9Kv///wD//////8H//9gA///r3/XDL/+QAPz7OpblPR3wOAD9/ferGHAz9DAA7f9jUy/wAfgwAL//2Ynv8Af4EAB9/+aj//Cb4AAAHBruZf/Y/8IAAEivX/J//n/EAAAkHy37f/b5hAAACMf+G5jT/IQAAEAS7jfH6PmMAACONS3///v4GAAAwHoTr//7/GAAAOAYBu+f//gAAADArCBvDv/wQAAAiQwADgO/xACAACrVgCwDdgAAAAAq+AAcAn4GAAAA1DYAGAA8BgAAAP99AAAAPwUAAAD/4AAGADYKgAAA/9QABAAQE/+AAP+IAAAAXv3/gAD/4AAAAKZ4/4AA/+AAAAA88w+AAP/AAAAAPEYBkADvwAAAACwEAOgA/4AAAACEQABkAIfAAAAAwAAAEADjjgAAAAAAAAAADwwAAAHwAABAAD4UAAAD4AAAYEA////////////8D////////////AP3///5//f///zRw////f/3///8wND///6//////MH2tvvlH/////zL/lh2wgHx///8wRgAzKAA+P///J8CAAKAAQh///z8AAAAwAAQD//8+AAAAYABCAPP/PAAAAABoAAAgPygAEAAAgUAAAU8wAQEwAAqAAAA/AAJWhAQ0AgAJ/wAAoEExIEqAG/8EIEAosJAGA/H/CcJAlDviAwLz/woANOBAAAxB8/8jEAEABAIAgfv/IIAFgQAAIgf//zh5RggAAaYPf/8t0CCAIAAUz///NAgwyUAAMZ7//x3IACQBIEPe//8P+AQYEYEhnv//D3Aw4QQBQfn//wCQOIAAAoHn//8ACAZAGkGB////AQQH7DxBA+///wQMn/x/KI////8ECh/4/yn/////AQH/+P9pfn///yEAP/n/8n9///8IAD////E+v///AGb//n/yff///wAo//7/+/8AH/8AEf///+pAgB//ACf/3//UYcAf/wAn/+//9MM8H/8AX//+/fDu/5v/EQ/////0/v/F/wo/////3u//5/8hD///3c////v/Ih1//////////wA+////g///7/8kev/ffwf//+f/A==',
  7:'AE4ALwAoAEAAHQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIiOPvBEBDiEAAGIkQiIxAxEjAABSJAIiKQKQIoAAkiICIkkEiCSAAPIhwjx5B4cngACKIEImRQRBJEAAiiRCIkUEUSRAAQnDgiKF+E4oQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUAAAAAAMb8xvxKgAAAAADmwEQgpIAAAAAAtsBkEPkAAAAAAN74ODD+gAAAAADOwGQw/wAAAAAAxsBCMP+AAAAAAMb8xjD/gAAAAAAAAAAA/4AAAAAB//9///+AAAAAAX3/X///gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAiI4+8EQEOIQAAYiRCIjEDESMAAFIkAiIpApAigACSIgIiSQSIJIAA8iHCPHkHhyeAAIogQiZFBEEkQACKJEIiRQRRJEABCcOCIoX4TihAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/oAAAAAAxvzG/P0AAAAAACbAxjD/AAAAAAD2wGww/4AAAAAAWvA4MP+AAAAAAA7AbDD/gAAAAAAGwMYw/4AAAAAAAHTGMP+AAAAAAAAAAAD/gAAAAAAAY////4AAAAAAggP///+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADwAAAAAAAAAAAw/gAAAAAAAAAAMP8AAAAAAAAAAjD/gAAAAAAAAAYw/4AAAAAAAAAAAP+AAAAAAAAAD///gAAAAAAAAB///4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP+AAAAAAAAARvz/gAAAAAAAAIYw/4AAAAAAAAAsMA+AAAAAAAAAOAABgAAAAAAAACwAAIAAAAAAAACEAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAHwAAAAAAAAAAAD4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAxvyAAAAAAAAAAGbAQAAAAAAAAAC2wEAA8AAAAAAA2vAAMP4AAAAAAM7AQDD/AAAAAADGwEIw/4AAAAAAxnQGMP+AAAAAAAAAAAD/gAAAAAH//g///4AAAAABffwf//+AAA=='
});

// Presentation/Gasoline Alley palette documented by the runtime graphics work.
const PRESENTATION_PALETTE_WORDS=Object.freeze([
  0x000,0xEB9,0xD95,0xFFF,0x900,0xB33,0xC00,0xF00,
  0x4C4,0xEA1,0x292,0xC82,0x444,0x666,0x888,0xAAA,
  0x731,0xEA8,0x510,0xFDB,0x01B,0x14C,0x36C,0x48D,
  0xFFA,0x5AF,0xF99,0xF81,0x954,0xC74,0xC90,0xED2
]);

function be16(b,o){if(!b||o<0||o+2>b.length)throw new Error('be16 outside buffer');return ((b[o]<<8)|b[o+1])>>>0;}
function be32(b,o){if(!b||o<0||o+4>b.length)throw new Error('be32 outside buffer');return (((be16(b,o)<<16)>>>0)|be16(b,o+2))>>>0;}
function s16(v){return (v&0x8000)?v-0x10000:v;}
function wr16(b,o,v){v=Number(v);b[o]=(v>>>8)&255;b[o+1]=v&255;}
function wr32(b,o,v){v=Number(v)>>>0;wr16(b,o,(v>>>16)&0xffff);wr16(b,o+2,v&0xffff);}
function hex(v,n=4){return '$'+(Number(v)>>>0).toString(16).toUpperCase().padStart(n,'0');}
function clampInt(v,min,max,label){v=Number(v);if(!Number.isInteger(v)||v<min||v>max)throw new Error(`${label} must be ${min}..${max}`);return v;}
function signed16(v,label){v=Number(v);if(!Number.isInteger(v)||v<-32768||v>32767)throw new Error(`${label} must be a signed 16-bit integer`);return v;}
function mapById(id){id=clampInt(id,0,REGIONAL_MAPS.length-1,'Regional map ID');return REGIONAL_MAPS[id];}
function circuitFolder(index){index=clampInt(index,CIRCUIT_INDEX_MIN,CIRCUIT_INDEX_MAX,'Circuit number');return `circuit_${String(index).padStart(2,'0')}`;}
function stockTrackIdForCircuit(index){index=clampInt(index,CIRCUIT_INDEX_MIN,CIRCUIT_INDEX_MAX,'Circuit number');return index<10?index+1:null;}
function circuitIndexForStockTrackId(trackId){trackId=clampInt(trackId,1,10,'Playlist v1 Track ID');return trackId-1;}
function amiga12ToRgb(w){return [((w>>>8)&15)*17,((w>>>4)&15)*17,(w&15)*17];}
const PRESENTATION_PALETTE_RGB=Object.freeze(PRESENTATION_PALETTE_WORDS.map(amiga12ToRgb));

function base64ToBytes(s){
  if(typeof atob==='function'){const raw=atob(s),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i)&255;return out;}
  if(typeof Buffer!=='undefined')return Uint8Array.from(Buffer.from(s,'base64'));
  throw new Error('No base64 decoder is available');
}
function embeddedRegionalMapBytes(id){
  id=mapById(id).id;if(id===0)throw new Error('Retail USA map must be read from the loaded Disk.1');
  const s=EMBEDDED_REGIONAL_MAP_B64[id];if(!s)throw new Error(`Embedded regional map ${id} is unavailable`);
  const bytes=base64ToBytes(s);validateMapBob(bytes);return bytes;
}
function retailMapBobFromModel(model){
  if(!model||typeof model.getResource!=='function')throw new Error('Loaded Disk.1 model is required for the retail regional map');
  const r=model.getResource(MAP_RESOURCE_ID),data=r?.data;
  if(!data||data.length<MAP_FRAME_OFFSET+MAP_BOB_SIZE)throw new Error(`Disk.1 resource ${hex(MAP_RESOURCE_ID,2)} does not contain the retail map at +${hex(MAP_FRAME_OFFSET,4)}`);
  const bytes=data.slice(MAP_FRAME_OFFSET,MAP_FRAME_OFFSET+MAP_BOB_SIZE);validateMapBob(bytes);return bytes;
}

function readPresentation(main,recordOffset){
  if(!main||recordOffset<0||recordOffset+0x52>main.length)throw new Error('Race record presentation fields outside main image');
  return {
    lapDisplayX:s16(be16(main,recordOffset+RACE_OFF.lapDisplayX)),
    lapDisplayY:s16(be16(main,recordOffset+RACE_OFF.lapDisplayY)),
    laps:be16(main,recordOffset+RACE_OFF.laps),
    previewDescriptor:be32(main,recordOffset+RACE_OFF.previewDescriptor),
    markerX:s16(be16(main,recordOffset+RACE_OFF.regionalMarkerX)),
    markerY:s16(be16(main,recordOffset+RACE_OFF.regionalMarkerY)),
    markerFrame:be16(main,recordOffset+RACE_OFF.regionalMarkerFrame)
  };
}

function writePresentation(main,recordOffset,values={}){
  if(!main||recordOffset<0||recordOffset+0x52>main.length)throw new Error('Race record presentation fields outside main image');
  if(values.laps!=null)wr16(main,recordOffset+RACE_OFF.laps,clampInt(values.laps,LAP_MIN,LAP_MAX,'Lap total'));
  if(values.lapDisplayX!=null)wr16(main,recordOffset+RACE_OFF.lapDisplayX,signed16(values.lapDisplayX,'Lap display X')&0xffff);
  if(values.lapDisplayY!=null)wr16(main,recordOffset+RACE_OFF.lapDisplayY,signed16(values.lapDisplayY,'Lap display Y')&0xffff);
  if(values.markerX!=null)wr16(main,recordOffset+RACE_OFF.regionalMarkerX,signed16(values.markerX,'Regional marker X')&0xffff);
  if(values.markerY!=null)wr16(main,recordOffset+RACE_OFF.regionalMarkerY,signed16(values.markerY,'Regional marker Y')&0xffff);
  if(values.markerFrame!=null)wr16(main,recordOffset+RACE_OFF.regionalMarkerFrame,clampInt(values.markerFrame,0,3,'Regional marker frame'));
  return readPresentation(main,recordOffset);
}

function validateMapBob(bytes){
  if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
  if(bytes.length!==MAP_BOB_SIZE)throw new Error(`Regional map BOB must be exactly ${hex(MAP_BOB_SIZE)} (${MAP_BOB_SIZE}) bytes`);
  const width=be16(bytes,0),height=be16(bytes,2),xOrigin=s16(be16(bytes,4)),yOrigin=s16(be16(bytes,6)),transparent=be16(bytes,8),planes=be16(bytes,10);
  if(width!==MAP_WIDTH||height!==MAP_HEIGHT||planes!==5)throw new Error(`Regional map BOB header must be ${MAP_WIDTH}x${MAP_HEIGHT}, 5 planes`);
  if(transparent!==29)throw new Error(`Regional map transparent source index must be 29; got ${transparent}`);
  const rowBytes=Math.ceil(width/16)*2,planeBytes=rowBytes*height;
  if(12+planeBytes*planes!==bytes.length)throw new Error('Regional map BOB payload size/header mismatch');
  return {width,height,xOrigin,yOrigin,transparent,planes,rowBytes,planeBytes,payloadOffset:12,byteLength:bytes.length};
}

function decodeMapBob(bytes){
  if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
  const h=validateMapBob(bytes),pixels=new Uint8Array(h.width*h.height),opaque=new Uint8Array(h.width*h.height);
  for(let y=0;y<h.height;y++)for(let x=0;x<h.width;x++){
    let v=0,bi=x>>>3,mask=0x80>>>(x&7);
    for(let p=0;p<h.planes;p++)if(bytes[h.payloadOffset+p*h.planeBytes+y*h.rowBytes+bi]&mask)v|=1<<p;
    const i=y*h.width+x;pixels[i]=v;opaque[i]=v===h.transparent?0:1;
  }
  return {...h,pixels,opaque};
}

function mapBobToRgba(decoded,palette=PRESENTATION_PALETTE_RGB){
  const rgba=new Uint8ClampedArray(decoded.width*decoded.height*4);
  for(let i=0;i<decoded.pixels.length;i++){
    if(!decoded.opaque[i])continue;const c=palette[decoded.pixels[i]]||[255,0,255],o=i*4;
    rgba[o]=c[0];rgba[o+1]=c[1];rgba[o+2]=c[2];rgba[o+3]=255;
  }
  return {width:decoded.width,height:decoded.height,rgba};
}

function validatePreviewBob(bytes){
  if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
  if(bytes.length!==PREVIEW_SIZE)throw new Error(`Miniature preview BOB must be exactly ${hex(PREVIEW_SIZE)} (${PREVIEW_SIZE}) bytes`);
  const width=be16(bytes,0),height=be16(bytes,2),xOrigin=s16(be16(bytes,4)),yOrigin=s16(be16(bytes,6)),transparent=be16(bytes,8),planes=be16(bytes,10);
  if(width!==PREVIEW_WIDTH||height!==PREVIEW_HEIGHT||planes!==PREVIEW_PLANES)throw new Error(`Miniature preview BOB header must be ${PREVIEW_WIDTH}x${PREVIEW_HEIGHT}, ${PREVIEW_PLANES} planes`);
  if(xOrigin!==PREVIEW_ORIGIN_X||yOrigin!==PREVIEW_ORIGIN_Y)throw new Error(`Miniature preview origin must be ${PREVIEW_ORIGIN_X},${PREVIEW_ORIGIN_Y}`);
  if(!MINIMAP_ALLOWED_TRANSPARENT.includes(transparent))throw new Error(`Miniature preview transparent source index must be ${MINIMAP_ALLOWED_TRANSPARENT.join(' or ')}`);
  return {width,height,xOrigin,yOrigin,transparent,planes,rowBytes:PREVIEW_ROW_BYTES,planeBytes:PREVIEW_PLANE_BYTES,payloadOffset:12,byteLength:bytes.length};
}
function decodePreviewBob(bytes){
  if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);const h=validatePreviewBob(bytes),pixels=new Uint8Array(PREVIEW_WIDTH*PREVIEW_HEIGHT);
  for(let y=0;y<PREVIEW_HEIGHT;y++)for(let x=0;x<PREVIEW_WIDTH;x++){
    const bi=x>>>3,mask=0x80>>>(x&7);let v=0;
    for(let p=0;p<PREVIEW_PLANES;p++)if(bytes[12+p*PREVIEW_PLANE_BYTES+y*PREVIEW_ROW_BYTES+bi]&mask)v|=1<<p;
    pixels[y*PREVIEW_WIDTH+x]=v;
  }
  return {...h,pixels};
}
function encodePreviewPixels(pixels,template=null,transparentOverride=null){
  if(!pixels||pixels.length!==PREVIEW_WIDTH*PREVIEW_HEIGHT)throw new Error(`Miniature preview pixels must contain ${PREVIEW_WIDTH*PREVIEW_HEIGHT} entries`);
  const out=template?Uint8Array.from(template):new Uint8Array(PREVIEW_SIZE);
  if(template)validatePreviewBob(out);else{wr16(out,0,PREVIEW_WIDTH);wr16(out,2,PREVIEW_HEIGHT);wr16(out,4,PREVIEW_ORIGIN_X);wr16(out,6,PREVIEW_ORIGIN_Y);wr16(out,8,PREVIEW_TRANSPARENT);wr16(out,10,PREVIEW_PLANES);}
  if(transparentOverride!=null){const t=Number(transparentOverride);if(!MINIMAP_ALLOWED_TRANSPARENT.includes(t))throw new Error(`Miniature preview transparent source index must be ${MINIMAP_ALLOWED_TRANSPARENT.join(' or ')}`);wr16(out,8,t);}
  out.fill(0,12);
  for(let y=0;y<PREVIEW_HEIGHT;y++)for(let x=0;x<PREVIEW_WIDTH;x++){
    const v=Number(pixels[y*PREVIEW_WIDTH+x])&31,bi=x>>>3,mask=0x80>>>(x&7);
    for(let p=0;p<PREVIEW_PLANES;p++)if(v&(1<<p))out[12+p*PREVIEW_PLANE_BYTES+y*PREVIEW_ROW_BYTES+bi]|=mask;
  }
  return out;
}
function previewBobToRgba(decoded,palette=PRESENTATION_PALETTE_RGB){
  const rgba=new Uint8ClampedArray(PREVIEW_WIDTH*PREVIEW_HEIGHT*4);
  for(let i=0;i<decoded.pixels.length;i++){const v=decoded.pixels[i];if(v===decoded.transparent)continue;const c=palette[v]||[255,0,255],o=i*4;rgba[o]=c[0];rgba[o+1]=c[1];rgba[o+2]=c[2];rgba[o+3]=255;}
  return {width:PREVIEW_WIDTH,height:PREVIEW_HEIGHT,rgba};
}
function nearestPreviewColour(index,excluded=new Set()){
  const src=PRESENTATION_PALETTE_RGB[index]||[0,0,0];let best=-1,bestD=Infinity;
  for(let i=0;i<PRESENTATION_PALETTE_RGB.length;i++){
    if(excluded.has(i))continue;const c=PRESENTATION_PALETTE_RGB[i],d=(src[0]-c[0])**2+(src[1]-c[1])**2+(src[2]-c[2])**2;
    if(d<bestD){bestD=d;best=i;}
  }
  return best<0?12:best;
}
function migratePreviewTransparency(bytes,target=MINIMAP_TEMPLATE_TRANSPARENT){
  const decoded=decodePreviewBob(bytes);target=Number(target);
  if(!MINIMAP_ALLOWED_TRANSPARENT.includes(target))throw new Error(`Unsupported MiniMap transparency index ${target}`);
  if(decoded.transparent===target)return Uint8Array.from(bytes);
  const replacement=nearestPreviewColour(target,new Set([decoded.transparent,target])),pixels=decoded.pixels.slice();
  for(let i=0;i<pixels.length;i++){
    if(pixels[i]===decoded.transparent)pixels[i]=target;
    else if(pixels[i]===target)pixels[i]=replacement;
  }
  return encodePreviewPixels(pixels,bytes,target);
}
function transformMiniMapTemplate(template,{rotation=0,flipH=false,flipV=false}={}){
  if(!template||!template.pixels)throw new Error('MiniMap template is required');
  rotation=((Number(rotation)||0)%360+360)%360;if(![0,90,180,270].includes(rotation))throw new Error('Template rotation must be 0, 90, 180 or 270 degrees');
  let w=template.width,h=template.height,hx=template.hotspotX,hy=template.hotspotY,pixels=Uint8Array.from(template.pixels),nw=w,nh=h,nhx=hx,nhy=hy,out;
  if(rotation){
    nw=(rotation===90||rotation===270)?h:w;nh=(rotation===90||rotation===270)?w:h;out=new Uint8Array(nw*nh);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let dx,dy;if(rotation===90){dx=h-1-y;dy=x;}else if(rotation===180){dx=w-1-x;dy=h-1-y;}else{dx=y;dy=w-1-x;}
      out[dy*nw+dx]=pixels[y*w+x];
    }
    if(rotation===90){nhx=h-1-hy;nhy=hx;}else if(rotation===180){nhx=w-1-hx;nhy=h-1-hy;}else{nhx=hy;nhy=w-1-hx;}
    pixels=out;w=nw;h=nh;hx=nhx;hy=nhy;
  }
  if(flipH){out=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)out[y*w+(w-1-x)]=pixels[y*w+x];pixels=out;hx=w-1-hx;}
  if(flipV){out=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)out[(h-1-y)*w+x]=pixels[y*w+x];pixels=out;hy=h-1-hy;}
  return {key:template.key,name:template.name,width:w,height:h,hotspotX:hx,hotspotY:hy,transparent:template.transparent,pixels};
}
function stampMiniMapTemplate(pixels,template,anchorX,anchorY,options={}){
  if(!pixels||pixels.length!==PREVIEW_WIDTH*PREVIEW_HEIGHT)throw new Error('MiniMap preview pixel buffer is invalid');
  const t=transformMiniMapTemplate(template,options),out=Uint8Array.from(pixels);let written=0;
  anchorX=Math.round(Number(anchorX)||0);anchorY=Math.round(Number(anchorY)||0);
  for(let y=0;y<t.height;y++)for(let x=0;x<t.width;x++){
    const v=t.pixels[y*t.width+x];if(v===t.transparent)continue;
    const dx=anchorX-t.hotspotX+x,dy=anchorY-t.hotspotY+y;if(dx<0||dy<0||dx>=PREVIEW_WIDTH||dy>=PREVIEW_HEIGHT)continue;
    out[dy*PREVIEW_WIDTH+dx]=v;written++;
  }
  return {pixels:out,template:t,written};
}
function resolvePreviewResource(model,record){
  if(!model?.main||record?.offset==null)throw new Error('Disk model and race record required for miniature preview');
  const descriptor=be32(model.main,record.offset+RACE_OFF.previewDescriptor),descriptorOffset=descriptor-RUNTIME_MAIN_BASE;
  if(descriptorOffset<0||descriptorOffset+12>model.main.length)throw new Error(`Preview descriptor ${hex(descriptor,8)} is outside decrunched main`);
  const entryPtr=be32(model.main,descriptorOffset+6),tableRuntime=RUNTIME_MAIN_BASE+model.resourceTableOffset,delta=entryPtr-(tableRuntime+2);
  if(delta<0||delta%RESOURCE_ENTRY_SIZE)throw new Error(`Preview descriptor resource pointer ${hex(entryPtr,8)} is not a resource-table +2 pointer`);
  const resourceId=delta/RESOURCE_ENTRY_SIZE,resource=model.getResource(resourceId);validatePreviewBob(resource.data);
  return {descriptor,descriptorOffset,entryPtr,resourceId,resource};
}
function previewPixelsFromBackdrop(source,{sourceWidth=320,sourceHeight=256,cropHeight=224,zeroReplacement=12,transparent=PREVIEW_TRANSPARENT}={}){
  if(!(source instanceof Uint8Array))source=new Uint8Array(source||[]);
  if(source.length<sourceWidth*sourceHeight)throw new Error('Backdrop pixel buffer is too short');
  cropHeight=Math.max(1,Math.min(sourceHeight,Math.floor(cropHeight)));
  transparent=clampInt(transparent,0,31,'Miniature transparency');zeroReplacement=clampInt(zeroReplacement,0,31,'Backdrop replacement');if(zeroReplacement===transparent)zeroReplacement=nearestPreviewColour(transparent,new Set([transparent]));
  const out=new Uint8Array(PREVIEW_WIDTH*PREVIEW_HEIGHT);
  for(let dy=0;dy<PREVIEW_HEIGHT;dy++){
    const sy0=Math.floor(dy*cropHeight/PREVIEW_HEIGHT),sy1=Math.max(sy0+1,Math.floor((dy+1)*cropHeight/PREVIEW_HEIGHT));
    for(let dx=0;dx<PREVIEW_WIDTH;dx++){
      const sx0=Math.floor(dx*sourceWidth/PREVIEW_WIDTH),sx1=Math.max(sx0+1,Math.floor((dx+1)*sourceWidth/PREVIEW_WIDTH)),counts=new Uint16Array(32);
      for(let sy=sy0;sy<sy1;sy++)for(let sx=sx0;sx<sx1;sx++)counts[source[sy*sourceWidth+sx]&31]++;
      let best=0,bestN=-1;for(let i=0;i<32;i++)if(counts[i]>bestN){best=i;bestN=counts[i];}
      // Preserve the preview's declared transparency index.  Authored MiniMaps use
      // colour 8 for transparency so colour 0 remains available as visible black.
      out[dy*PREVIEW_WIDTH+dx]=best===transparent?zeroReplacement:best;
    }
  }
  return out;
}

function encodePresentationBin({mapId=0,presentation={}}={}){
  const out=new Uint8Array(PRESENTATION_SIZE);
  out.set(utf8(PRESENTATION_MAGIC),0);wr16(out,4,PRESENTATION_VERSION);wr16(out,6,PRESENTATION_SIZE);
  wr16(out,8,mapById(mapId).id);
  wr16(out,0x0A,signed16(presentation.markerX??0,'Regional marker X')&0xffff);
  wr16(out,0x0C,signed16(presentation.markerY??0,'Regional marker Y')&0xffff);
  wr16(out,0x0E,clampInt(presentation.markerFrame??0,0,3,'Regional marker frame'));
  wr16(out,0x10,signed16(presentation.lapDisplayX??0,'Lap-total display X')&0xffff);
  wr16(out,0x12,signed16(presentation.lapDisplayY??0,'Lap-total display Y')&0xffff);
  return out;
}
function decodePresentationBin(bytes){
  if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
  if(bytes.length!==PRESENTATION_SIZE)throw new Error(`presentation.bin must be exactly ${hex(PRESENTATION_SIZE)} bytes`);
  if(String.fromCharCode(...bytes.slice(0,4))!==PRESENTATION_MAGIC)throw new Error('Invalid presentation.bin magic');
  if(be16(bytes,4)!==PRESENTATION_VERSION||be16(bytes,6)!==PRESENTATION_SIZE)throw new Error('Unsupported presentation.bin version/size');
  const mapId=be16(bytes,8);mapById(mapId);
  return {mapId,markerX:s16(be16(bytes,0x0A)),markerY:s16(be16(bytes,0x0C)),markerFrame:be16(bytes,0x0E),lapDisplayX:s16(be16(bytes,0x10)),lapDisplayY:s16(be16(bytes,0x12))};
}
function storedRecord(main,point){
  if(point?.fileOffset!=null && main && point.fileOffset>=0 && point.fileOffset+6<=main.length)return main.slice(point.fileOffset,point.fileOffset+6);
  if(point?.storedBytes?.length>=6)return Uint8Array.from(point.storedBytes.slice(0,6));
  throw new Error('Waypoint has no six-byte stored representation');
}
function encodeWaypointsBin(record,main){
  const routes=record?.waypointDescriptors;if(!Array.isArray(routes)||routes.length<WAYPOINT_ROUTE_COUNT)throw new Error('Three waypoint routes are required');
  const parts=[utf8(WAYPOINT_MAGIC),Uint8Array.of(0,WAYPOINT_VERSION,0,WAYPOINT_ROUTE_COUNT)];
  for(let i=0;i<WAYPOINT_ROUTE_COUNT;i++){
    const set=routes[i],points=Array.isArray(set?.points)?set.points:[],boundary=set?.boundaryPoint||null;
    if(points.length>0xffff)throw new Error('Waypoint route exceeds 65535 points');
    parts.push(Uint8Array.of((points.length>>>8)&255,points.length&255,0,boundary?1:0));
    for(const point of points)parts.push(storedRecord(main,point));
    if(boundary)parts.push(storedRecord(main,boundary));
  }
  return concat(parts);
}
function decodeWaypointsBin(bytes){
  if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
  if(bytes.length<8||String.fromCharCode(...bytes.slice(0,4))!==WAYPOINT_MAGIC)throw new Error('Invalid waypoints.bin magic');
  if(be16(bytes,4)!==WAYPOINT_VERSION||be16(bytes,6)!==WAYPOINT_ROUTE_COUNT)throw new Error('Unsupported waypoints.bin version/route count');
  let pos=8;const routes=[];
  for(let i=0;i<WAYPOINT_ROUTE_COUNT;i++){
    if(pos+4>bytes.length)throw new Error('waypoints.bin ended inside a route header');
    const count=be16(bytes,pos),boundary=be16(bytes,pos+2);pos+=4;if(boundary>1)throw new Error('Invalid waypoint boundary flag');
    const points=[];for(let n=0;n<count;n++){if(pos+6>bytes.length)throw new Error('waypoints.bin ended inside point data');points.push(bytes.slice(pos,pos+6));pos+=6;}
    let boundaryBytes=null;if(boundary){if(pos+6>bytes.length)throw new Error('waypoints.bin ended inside boundary data');boundaryBytes=bytes.slice(pos,pos+6);pos+=6;}
    routes.push({index:i,points,boundaryBytes});
  }
  if(pos!==bytes.length)throw new Error('waypoints.bin has trailing bytes');
  return routes;
}

// Playlist v1 remains exactly the proven retail-template contract.
const PLAYLIST_V1=Object.freeze({magic:'IHPL',version:1,eventCount:11,entrySize:4,size:0x34,trackIdMin:1,trackIdMax:10,inheritLaps:0xffff});

function validatePlaylistV1(bytes){
  if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
  if(bytes.length!==PLAYLIST_V1.size)throw new Error('Playlist v1 must be exactly $34 bytes');
  if(String.fromCharCode(...bytes.slice(0,4))!=='IHPL'||be16(bytes,4)!==1||be16(bytes,6)!==11)throw new Error('Invalid playlist v1 header');
  const entries=[];
  for(let i=0;i<11;i++){
    const o=8+i*4,trackId=be16(bytes,o),laps=be16(bytes,o+2);
    if(trackId<1||trackId>10)throw new Error(`Playlist v1 event ${i} Track ID must remain 1..10`);
    entries.push({eventIndex:i,trackId,circuitIndex:trackId-1,laps:laps===0xffff?null:Math.min(laps,LAP_MAX),rawLaps:laps});
  }
  return entries;
}

/*
 * Explicit future extension contract. This module can encode/decode it for
 * editor/package work, but the 1.3 test-15 slave intentionally does NOT consume
 * v2 yet. Version 2 keeps the proven 4-byte entry footprint but gives the first
 * word explicit zero-based circuit-library semantics. Version is the switch;
 * v1 IDs are never silently reinterpreted.
 */
const PLAYLIST_V2=Object.freeze({magic:'IHPL',version:2,eventCount:11,entrySize:4,size:0x34,inheritLaps:0xffff,maxCircuitIndex:0xfffe});
function encodePlaylistV2(entries){
  if(!Array.isArray(entries)||entries.length!==11)throw new Error('Playlist v2 requires exactly 11 event entries');
  const out=new Uint8Array(PLAYLIST_V2.size);out.set([0x49,0x48,0x50,0x4c],0);wr16(out,4,2);wr16(out,6,11);
  entries.forEach((e,i)=>{
    const ci=clampInt(e.circuitIndex,0,PLAYLIST_V2.maxCircuitIndex,'Circuit index');
    const laps=e.laps==null?0xffff:clampInt(e.laps,LAP_MIN,LAP_MAX,'Lap total');
    wr16(out,8+i*4,ci);wr16(out,10+i*4,laps);
  });
  return out;
}
function decodePlaylistV2(bytes){
  if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
  if(bytes.length!==PLAYLIST_V2.size||String.fromCharCode(...bytes.slice(0,4))!=='IHPL'||be16(bytes,4)!==2||be16(bytes,6)!==11)throw new Error('Invalid playlist v2 header');
  const out=[];for(let i=0;i<11;i++){const o=8+i*4,ci=be16(bytes,o),laps=be16(bytes,o+2);if(ci===0xffff)throw new Error('Playlist v2 circuit index $FFFF is reserved');out.push({eventIndex:i,circuitIndex:ci,laps:laps===0xffff?null:laps});}return out;
}

function utf8(s){return new TextEncoder().encode(String(s));}
function concat(parts){let n=0;for(const p of parts)n+=p.length;const o=new Uint8Array(n);let at=0;for(const p of parts){o.set(p,at);at+=p.length;}return o;}
let crcTable=null;
function crc32(bytes){
  if(!crcTable){crcTable=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);crcTable[n]=c>>>0;}}
  let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;
}
function le16(v){return Uint8Array.of(v&255,(v>>>8)&255);}
function le32(v){return Uint8Array.of(v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255);}

// Minimal dependency-free ZIP writer, STORE only. Sufficient for authoring packages.
function zipStore(files){
  const locals=[],centrals=[];let offset=0,count=0;
  for(const f of files){
    const name=utf8(f.name),data=f.data instanceof Uint8Array?f.data:new Uint8Array(f.data),crc=crc32(data);
    const local=concat([Uint8Array.of(0x50,0x4b,0x03,0x04),le16(20),le16(0),le16(0),le16(0),le16(0),le32(crc),le32(data.length),le32(data.length),le16(name.length),le16(0),name,data]);
    const central=concat([Uint8Array.of(0x50,0x4b,0x01,0x02),le16(20),le16(20),le16(0),le16(0),le16(0),le16(0),le32(crc),le32(data.length),le32(data.length),le16(name.length),le16(0),le16(0),le16(0),le16(0),le32(0),le32(offset),name]);
    locals.push(local);centrals.push(central);offset+=local.length;count++;
  }
  const centralBlob=concat(centrals),eocd=concat([Uint8Array.of(0x50,0x4b,0x05,0x06),le16(0),le16(0),le16(count),le16(count),le32(centralBlob.length),le32(offset),le16(0)]);
  return concat([...locals,centralBlob,eocd]);
}

function textFromUtf8(bytes){
  if(typeof TextDecoder!=='undefined')return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  let out='';for(const b of bytes){if(b>0x7f)throw new Error('ZIP filename is not ASCII/UTF-8 compatible in this browser');out+=String.fromCharCode(b);}return out;
}
function readZipStore(bytes){
  if(!(bytes instanceof Uint8Array))bytes=new Uint8Array(bytes);
  const files=new Map();let pos=0,localCount=0;
  while(pos+4<=bytes.length){
    const sig=(bytes[pos]|(bytes[pos+1]<<8)|(bytes[pos+2]<<16)|(bytes[pos+3]<<24))>>>0;
    if(sig===0x02014b50||sig===0x06054b50)break;
    if(sig!==0x04034b50)throw new Error(`ZIP local header signature missing at ${hex(pos,8)}`);
    if(pos+30>bytes.length)throw new Error('ZIP ended inside a local file header');
    const flags=bytes[pos+6]|(bytes[pos+7]<<8),method=bytes[pos+8]|(bytes[pos+9]<<8),expectedCrc=(bytes[pos+14]|(bytes[pos+15]<<8)|(bytes[pos+16]<<16)|(bytes[pos+17]<<24))>>>0;
    const compressed=(bytes[pos+18]|(bytes[pos+19]<<8)|(bytes[pos+20]<<16)|(bytes[pos+21]<<24))>>>0,uncompressed=(bytes[pos+22]|(bytes[pos+23]<<8)|(bytes[pos+24]<<16)|(bytes[pos+25]<<24))>>>0;
    const nameLen=bytes[pos+26]|(bytes[pos+27]<<8),extraLen=bytes[pos+28]|(bytes[pos+29]<<8);
    if(flags&0x0008)throw new Error('ZIP data-descriptor entries are not supported; use a ZIP exported by this editor');
    if(method!==0)throw new Error(`ZIP entry compression method ${method} is not supported; Indy Heat editor ZIPs use STORE`);
    if(compressed!==uncompressed)throw new Error('Stored ZIP entry has different compressed/uncompressed sizes');
    const nameStart=pos+30,nameEnd=nameStart+nameLen,dataStart=nameEnd+extraLen,dataEnd=dataStart+compressed;
    if(dataEnd>bytes.length)throw new Error('ZIP entry overruns archive');
    const name=textFromUtf8(bytes.slice(nameStart,nameEnd));
    if(!name||name.startsWith('/')||name.includes('\\')||name.split('/').includes('..'))throw new Error(`Unsafe ZIP path: ${name||'(empty)'}`);
    const data=bytes.slice(dataStart,dataEnd);
    if(crc32(data)!==expectedCrc)throw new Error(`ZIP CRC mismatch for ${name}`);
    if(!name.endsWith('/')){if(files.has(name))throw new Error(`Duplicate ZIP entry ${name}`);files.set(name,data);localCount++;}
    pos=dataEnd;
  }
  if(!localCount)throw new Error('ZIP contains no stored circuit files');
  return files;
}
function parseCircuitZip(bytes){
  const entries=readZipStore(bytes),roots=new Set();
  for(const name of entries.keys()){const m=/^(circuit_(\d{2}))\/(.+)$/.exec(name);if(!m)throw new Error(`Circuit ZIP entry must be rooted at circuit_xx/: ${name}`);roots.add(m[1]);}
  if(roots.size!==1)throw new Error('Circuit ZIP must contain exactly one circuit_xx/ root folder');
  const folder=[...roots][0],m=/^circuit_(\d{2})$/.exec(folder);if(!m)throw new Error('Circuit folder must be circuit_00 through circuit_99');
  const circuitIndex=clampInt(Number(m[1]),CIRCUIT_INDEX_MIN,CIRCUIT_INDEX_MAX,'Circuit number'),get=name=>{const key=`${folder}/${name}`,v=entries.get(key);if(!v)throw new Error(`Circuit ZIP is missing ${key}`);return v;};
  const resources={background:get('background.bin'),foreground:get('foreground.bin'),surface:get('surface.bin'),recovery:get('recovery.bin')},previewBin=get('preview.bin'),waypointsBin=get('waypoints.bin'),raceSetupBin=get('race_setup.bin'),presentationBin=get('presentation.bin');
  if(resources.background.length!==TRACK_BACKGROUND_SIZE)throw new Error(`background.bin must be exactly ${hex(TRACK_BACKGROUND_SIZE)} bytes`);
  if(!TRACK_FOREGROUND_SIZES.includes(resources.foreground.length))throw new Error('foreground.bin must be exactly $2800 or $2804 bytes');
  if(resources.surface.length!==TRACK_SURFACE_SIZE)throw new Error(`surface.bin must be exactly ${hex(TRACK_SURFACE_SIZE)} bytes`);
  if(resources.recovery.length!==TRACK_RECOVERY_SIZE)throw new Error(`recovery.bin must be exactly ${hex(TRACK_RECOVERY_SIZE)} bytes`);
  validatePreviewBob(previewBin);const waypointRoutes=decodeWaypointsBin(waypointsBin);if(raceSetupBin.length!==RACE_SETUP_SIZE)throw new Error(`race_setup.bin must be exactly ${hex(RACE_SETUP_SIZE)} bytes`);const presentation=decodePresentationBin(presentationBin);
  return {circuitIndex,folder,resources,previewBin,waypointsBin,raceSetupBin,presentationBin,presentation,waypointRoutes,routeCounts:waypointRoutes.map(r=>r.points.length)};
}
function inferTemplateIndex(circuitIndex,routeCounts,retailRouteCounts){
  clampInt(circuitIndex,CIRCUIT_INDEX_MIN,CIRCUIT_INDEX_MAX,'Circuit number');
  if(!Array.isArray(routeCounts)||routeCounts.length!==WAYPOINT_ROUTE_COUNT)throw new Error('Imported package must contain three waypoint route counts');
  if(!Array.isArray(retailRouteCounts)||retailRouteCounts.length<10)throw new Error('Ten retail route-count templates are required');
  const same=a=>Array.isArray(a)&&a.length===routeCounts.length&&a.every((v,i)=>Number(v)===Number(routeCounts[i]));
  const matches=[];for(let i=0;i<10;i++)if(same(retailRouteCounts[i]))matches.push(i);
  if(matches.length!==1)throw new Error(matches.length?`Circuit waypoint shape matches more than one retail template (${matches.join(', ')})`:`Circuit waypoint shape does not match any retail template`);
  return matches[0];
}

function makePackageFiles({circuitIndex,resources={},previewBin=null,waypointsBin=null,raceSetupBin=null,presentationBin=null}={}){
  circuitIndex=clampInt(circuitIndex,CIRCUIT_INDEX_MIN,CIRCUIT_INDEX_MAX,'Circuit number');
  const folder=`${circuitFolder(circuitIndex)}/`,files=[];
  const map=[['background','background.bin'],['foreground','foreground.bin'],['surface','surface.bin'],['recovery','recovery.bin']];
  for(const [key,name] of map)if(resources[key])files.push({name:folder+name,data:resources[key]});
  if(previewBin)files.push({name:folder+'preview.bin',data:previewBin});
  if(waypointsBin)files.push({name:folder+'waypoints.bin',data:waypointsBin});
  if(raceSetupBin)files.push({name:folder+'race_setup.bin',data:raceSetupBin});
  if(presentationBin)files.push({name:folder+'presentation.bin',data:presentationBin});
  return files;
}

const api={VERSION,MAP_BOB_SIZE,MAP_WIDTH,MAP_HEIGHT,MAP_RESOURCE_ID,MARKER_RESOURCE_ID,MAP_FRAME_OFFSET,LAP_MIN,LAP_MAX,RACE_OFF,REGIONAL_MAPS,
  PREVIEW_WIDTH,PREVIEW_HEIGHT,PREVIEW_ORIGIN_X,PREVIEW_ORIGIN_Y,PREVIEW_TRANSPARENT,PREVIEW_PLANES,PREVIEW_SIZE,MINIMAP_TEMPLATE_TRANSPARENT,MINIMAP_TEMPLATES,REGIONAL_MAP_SCREEN_X,REGIONAL_MAP_SCREEN_Y,
  PRESENTATION_MAGIC,PRESENTATION_VERSION,PRESENTATION_SIZE,WAYPOINT_MAGIC,WAYPOINT_VERSION,WAYPOINT_ROUTE_COUNT,CIRCUIT_INDEX_MIN,CIRCUIT_INDEX_MAX,
  PRESENTATION_PALETTE_WORDS,PRESENTATION_PALETTE_RGB,PLAYLIST_V1,PLAYLIST_V2,HUD_LAYOUT,HUD_DIGITS,GAME_HUD_DIGITS,HUD_CAR_COLOURS,
  be16,be32,s16,wr16,wr32,hex,mapById,circuitFolder,stockTrackIdForCircuit,circuitIndexForStockTrackId,
  readPresentation,writePresentation,validateMapBob,decodeMapBob,mapBobToRgba,embeddedRegionalMapBytes,retailMapBobFromModel,validatePreviewBob,decodePreviewBob,encodePreviewPixels,previewBobToRgba,previewPixelsFromBackdrop,migratePreviewTransparency,transformMiniMapTemplate,stampMiniMapTemplate,resolvePreviewResource,encodePresentationBin,decodePresentationBin,encodeWaypointsBin,decodeWaypointsBin,
  validatePlaylistV1,encodePlaylistV2,decodePlaylistV2,crc32,zipStore,readZipStore,parseCircuitZip,inferTemplateIndex,makePackageFiles};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.IndyHeatCircuitPackage=api;

if(typeof document==='undefined')return;


/* ---------------- v0.19 browser/editor integration ---------------- */
const $=id=>document.getElementById(id);
const mapIds=new Map(),circuitNumbers=new Map(),mapCache=new Map(),previewOriginals=new Map(),previewUndo=new Map();
let markerGraphics=null,auxMode=null,auxLayout=null,dragMarker=false,previewGesture=null,previewColour=12,previewTool='pencil',previewBrush=1,previewTemplateKey='arrow',previewTemplateRotation=0,previewTemplateFlipH=false,previewTemplateFlipV=false,raceHudDrag=null;
const packageSlots=new Map();
let activePackageSlot=null,selectionTransition=false;
const ARROW_LABELS=Object.freeze(['Frame 0','Frame 1','Frame 2','Frame 3']);

function currentCapture(){return root.IndyHeatRaceSetupCapture||null;}
function recordsForModel(model){
  const C=currentCapture(),T=root.IndyHeatTools;if(!model||!T)return [];
  let records=C?.recordsByMain?.get(model.main)||null;
  if(!records){records=T.parseRaceRecords(model.main);C?.recordsByMain?.set(model.main,records);}
  for(const r of records){if(r.baseResourceId==null&&typeof T.raceBaseResourceId==='function')r.baseResourceId=T.raceBaseResourceId(r,model.resourceTableOffset+RUNTIME_MAIN_BASE);if(!r.waypointDescriptors&&typeof T.parseWaypointDescriptors==='function')r.waypointDescriptors=T.parseWaypointDescriptors(model.main,r);}
  return records;
}
function allAuthoringModels(){
  const C=currentCapture();if(!C)return [];const out=[];for(const m of [C.coreModel,C.layerModel,C.model,...(C.models||[])])if(m&&!out.includes(m))out.push(m);return out;
}
function primaryModel(){const C=currentCapture();return C?.model||C?.layerModel||C?.coreModel||allAuthoringModels()[0]||null;}
function resourceModel(){const C=currentCapture();return C?.layerModel||C?.model||C?.coreModel||allAuthoringModels()[0]||null;}
function waypointModel(){const C=currentCapture();return C?.coreModel||C?.model||C?.layerModel||allAuthoringModels()[0]||null;}
function recordForTrackIndex(index,model=primaryModel()){
  const T=root.IndyHeatTools;if(!model||!T)return null;const base=T.TRACK_BASE_IDS?.[index];return recordsForModel(model).find(r=>r.baseResourceId===base)||null;
}
function currentRecord(){return recordForTrackIndex(Number($('trackSelect')?.value||0),primaryModel());}
function sourceTrackIndex(){return Number($('trackSelect')?.value||0);}
function selectedOption(){return $('trackSelect')?.selectedOptions?.[0]||null;}
function customSelected(){return selectedOption()?.dataset?.indyheatCustom==='1';}
function logicalRetailIndex(option=selectedOption()){if(!option||option.dataset?.indyheatCustom==='1')return null;const v=option.dataset?.indyheatRetailIndex;return Number(v==null?option.value:v);}
function selectionKey(option=selectedOption()){return option?.dataset?.indyheatCustom==='1'?'custom':`retail:${logicalRetailIndex(option)??sourceTrackIndex()}`;}
function retailKey(index=sourceTrackIndex()){return `retail:${Number(index)}`;}
function currentCircuitIndex(){const key=selectionKey(),slot=packageSlots.get(key);return circuitNumbers.get(key)??slot?.package?.circuitIndex??(customSelected()?10:(logicalRetailIndex()??sourceTrackIndex()));}
function setCurrentCircuitIndex(v){const value=clampInt(v,CIRCUIT_INDEX_MIN,CIRCUIT_INDEX_MAX,'Circuit number'),key=selectionKey();circuitNumbers.set(key,value);const slot=packageSlots.get(key);if(slot)slot.package.circuitIndex=value;}
function currentMapId(){return mapIds.get(selectionKey())??0;}
function setCurrentMapId(id){mapIds.set(selectionKey(),mapById(id).id);}
function download(bytes,name,type='application/octet-stream'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function status(s){for(const id of ['circuitAuxStatus','circuitAuxStatusMini','circuitRaceHudStatus']){const e=$(id);if(e)e.textContent=s;}const top=$('circuitPackageTopStatus');if(top){top.textContent=String(s||'').split('\n')[0];top.title=String(s||'');top.classList.toggle('bad',String(s||'').startsWith('ERROR:'));}}
function ensureLapContract(){
  const e=$('raceLaps');if(!e)return;
  e.min=String(LAP_MIN);e.max=String(LAP_MAX);e.title='Runtime-proven authored range: 1–99';
  const apply=$('raceApply');
  if(apply&&!apply.dataset.circuitLapGuard){
    apply.dataset.circuitLapGuard='1';
    apply.addEventListener('click',ev=>{
      const v=Number(e.value);
      if(!Number.isInteger(v)||v<LAP_MIN||v>LAP_MAX){
        ev.preventDefault();ev.stopImmediatePropagation();
        status(`ERROR: Lap total must be ${LAP_MIN}–${LAP_MAX}.`);e.focus();
      }
    },true);
  }
}

async function loadMap(id){
  id=mapById(id).id;if(mapCache.has(id))return mapCache.get(id);
  const m=mapById(id);
  // Retail USA is part of Disk.1 resource $16 at +$177C.  Added maps are
  // bundled into this script so local/file:// editor use never depends on fetch().
  const bytes=id===0?retailMapBobFromModel(resourceModel()||primaryModel()):embeddedRegionalMapBytes(id);
  const decoded=decodeMapBob(bytes);mapCache.set(id,{bytes,decoded,map:m});return mapCache.get(id);
}
function imageDataFromRgba(r){return new ImageData(r.rgba,r.width,r.height);}
function rgbaCanvas(r){const c=document.createElement('canvas');c.width=r.width;c.height=r.height;c.getContext('2d').putImageData(imageDataFromRgba(r),0,0);return c;}
function putScaled(ctx,img,x,y,scale){ctx.imageSmoothingEnabled=false;ctx.drawImage(rgbaCanvas(img),x,y,img.width*scale,img.height*scale);}

function ensureMarkerGraphics(){
  if(markerGraphics)return markerGraphics;const C=currentCapture(),G=root.IndyHeatRaceGraphics;if(!C?.model||!G)return null;
  try{const resource=C.model.getResource(MARKER_RESOURCE_ID),bank=G.decodeBank(resource.data,{resourceId:MARKER_RESOURCE_ID,strict:true});markerGraphics={bank};return markerGraphics;}
  catch(e){status(`Arrow graphics unavailable: ${e.message}`);return null;}
}
function markerImage(frameIndex){const G=root.IndyHeatRaceGraphics,g=ensureMarkerGraphics(),frame=g?.bank?.frames?.[frameIndex];if(!G||!frame)return null;return {frame,...G.frameToRgba(frame,PRESENTATION_PALETTE_RGB)};}

function viewerStack(){return $('view')?.closest('.canvasStack')||$('view')?.parentElement||null;}
function auxCanvas(){return $('circuitAuxCanvas');}
function syncAuxSize(){const v=$('view'),c=auxCanvas();if(!v||!c)return;if(c.width!==v.width||c.height!==v.height){c.width=v.width;c.height=v.height;c.getContext('2d').imageSmoothingEnabled=false;}}
function setCircuitHidden(hide){
  const stack=viewerStack(),aux=auxCanvas();if(!stack)return;
  stack.querySelectorAll('canvas').forEach(c=>{if(c===aux)return;if(hide){if(c.dataset.preCircuitVisibility==null)c.dataset.preCircuitVisibility=c.style.visibility||'';c.style.visibility='hidden';}else if(c.dataset.preCircuitVisibility!=null){c.style.visibility=c.dataset.preCircuitVisibility;delete c.dataset.preCircuitVisibility;}});
  if(aux)aux.hidden=!hide;
}
function hideKnownEditorPanes(){['layerDrawingPane','layerWaypointHost','raceSetupPane','recoveryEditorPane','backdropEditorPane'].forEach(id=>{const e=$(id);if(e)e.hidden=true;});}
function clearModeButtons(){const b=$('layerModeButtons');if(b)b.querySelectorAll('button').forEach(x=>x.classList.remove('active'));}
function setExclusiveModeButton(buttonId){
  const apply=()=>{if(!auxMode)return;clearModeButtons();$(buttonId)?.classList.add('active');};
  apply();
  // Other legacy mode listeners may update their own active class later in the same
  // event turn. Reassert once after those listeners so Map/Mini stay exclusive.
  if(typeof queueMicrotask==='function')queueMicrotask(apply);
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(apply);
}
function setOverlayOpacityVisible(show){const e=$('overlayOpacityControl');if(e)e.hidden=!show;}
function syncPreviewToolButtons(){
  document.querySelectorAll('[data-preview-tool]').forEach(b=>b.classList.toggle('active',b.dataset.previewTool===previewTool));
  document.querySelectorAll('[data-preview-template]').forEach(b=>b.classList.toggle('active',previewTool==='template'&&b.dataset.previewTemplate===previewTemplateKey));
  document.querySelectorAll('[data-template-rotation]').forEach(b=>b.classList.toggle('active',Number(b.dataset.templateRotation)===previewTemplateRotation));
  $('circuitTemplateFlipH')?.classList.toggle('active',previewTemplateFlipH);$('circuitTemplateFlipV')?.classList.toggle('active',previewTemplateFlipV);
  const t=MINIMAP_TEMPLATES.find(x=>x.key===previewTemplateKey);const st=$('circuitTemplateState');if(st&&t)st.textContent=`${t.name} · ${previewTemplateRotation}°${previewTemplateFlipH?' · flip H':''}${previewTemplateFlipV?' · flip V':''}`;
}
function deactivateAux(){auxMode=null;previewGesture=null;dragMarker=false;setCircuitHidden(false);setOverlayOpacityVisible(true);$('circuitAuxPane')&&($('circuitAuxPane').hidden=true);$('circuitMapControls')&&($('circuitMapControls').hidden=true);$('circuitPreviewControls')&&($('circuitPreviewControls').hidden=true);$('layerEditMap')?.classList.remove('active');$('layerEditMini')?.classList.remove('active');}
function activateAux(mode){
  if(auxMode===mode){const buttonId=mode==='map'?'layerEditMap':'layerEditMini';setExclusiveModeButton(buttonId);syncPreviewToolButtons();renderAux();return;}deactivateAux();
  const wp=$('showWaypoints');if(wp?.checked){wp.checked=false;wp.dispatchEvent(new Event('change',{bubbles:true}));}
  hideKnownEditorPanes();auxMode=mode;setCircuitHidden(true);setOverlayOpacityVisible(false);$('circuitAuxPane').hidden=false;const buttonId=mode==='map'?'layerEditMap':'layerEditMini';setExclusiveModeButton(buttonId);$('circuitMapControls').hidden=mode!=='map';$('circuitPreviewControls').hidden=mode!=='mini';syncPreviewToolButtons();refreshUi();
}

function drawArrowChoiceButtons(){
  const host=$('circuitArrowChoices');if(!host)return;const p=currentRecord()&&currentCapture()?readPresentation(currentCapture().model.main,currentRecord().offset):null,selected=Math.max(0,Math.min(3,p?.markerFrame||0));host.innerHTML='';
  for(let i=0;i<4;i++){
    const b=document.createElement('button');b.type='button';b.className='circuitArrowChoice'+(i===selected?' selected':'');b.dataset.frame=String(i);b.title=`Game arrow frame ${i}`;
    const cv=document.createElement('canvas');cv.width=48;cv.height=40;const ctx=cv.getContext('2d');ctx.imageSmoothingEnabled=false;const img=markerImage(i);if(img){const sc=Math.min(3,Math.floor(Math.min(44/img.width,36/img.height)))||1;ctx.drawImage(rgbaCanvas(img),(48-img.width*sc)/2,(40-img.height*sc)/2,img.width*sc,img.height*sc);}b.append(cv,document.createTextNode(ARROW_LABELS[i]));b.addEventListener('click',()=>{const r=currentRecord(),C=currentCapture();if(!r||!C?.model)return;writePresentation(C.model.main,r.offset,{markerFrame:i});$('circuitMarkerFrame').value=String(i);drawArrowChoiceButtons();renderAux();});host.appendChild(b);
  }
}

async function renderMapMode(){
  syncAuxSize();const c=auxCanvas(),ctx=c.getContext('2d'),r=currentRecord(),C=currentCapture();ctx.fillStyle='#10131a';ctx.fillRect(0,0,c.width,c.height);if(!r||!C?.model)return;
  const p=readPresentation(C.model.main,r.offset),id=currentMapId();
  try{
    const map=await loadMap(id),rgba=mapBobToRgba(map.decoded),scale=Math.max(1,Math.floor(Math.min((c.width-32)/MAP_WIDTH,(c.height-72)/MAP_HEIGHT))),drawW=MAP_WIDTH*scale,drawH=MAP_HEIGHT*scale,x=Math.round((c.width-drawW)/2),y=Math.round((c.height-drawH)/2+16);auxLayout={mode:'map',x,y,scale,w:MAP_WIDTH,h:MAP_HEIGHT};
    ctx.fillStyle='#20242d';ctx.fillRect(x-4,y-4,drawW+8,drawH+8);putScaled(ctx,rgba,x,y,scale);
    const localX=p.markerX-REGIONAL_MAP_SCREEN_X,localY=p.markerY-REGIONAL_MAP_SCREEN_Y,img=markerImage(Math.max(0,Math.min(3,p.markerFrame)));
    if(img){const ax=x+localX*scale,ay=y+localY*scale;ctx.drawImage(rgbaCanvas(img),ax-img.frame.xOrigin*scale,ay-img.frame.yOrigin*scale,img.width*scale,img.height*scale);ctx.strokeStyle='#ffd84a';ctx.lineWidth=Math.max(1,scale/2);ctx.beginPath();ctx.moveTo(ax-4*scale,ay);ctx.lineTo(ax+4*scale,ay);ctx.moveTo(ax,ay-4*scale);ctx.lineTo(ax,ay+4*scale);ctx.stroke();}
    ctx.fillStyle='#ddd';ctx.font=`${Math.max(11,Math.round(c.width/55))}px ui-monospace,monospace`;ctx.fillText(`${map.map.name} · arrow frame ${p.markerFrame} · game (${p.markerX},${p.markerY})`,12,22);
  }catch(e){ctx.fillStyle='#ddd';ctx.font='12px monospace';ctx.fillText(e.message,10,20);}
}

function previewStateKey(q){return `${selectionKey()}:${q.resourceId}`;}
function currentPreview(){const model=primaryModel(),r=currentRecord();if(!model||!r)return null;const q=resolvePreviewResource(model,r),key=previewStateKey(q);if(!previewOriginals.has(key))previewOriginals.set(key,q.resource.data.slice());return q;}
function pushPreviewUndo(q){const key=previewStateKey(q),stack=previewUndo.get(key)||[];stack.push(q.resource.data.slice());if(stack.length>30)stack.shift();previewUndo.set(key,stack);}
function writePreviewPixels(q,pixels,transparentOverride=null){q.resource.data.set(encodePreviewPixels(pixels,q.resource.data,transparentOverride));}
function previewPixels(){const q=currentPreview();return q?decodePreviewBob(q.resource.data).pixels:null;}
function renderPreviewPalette(){const h=$('circuitPreviewPalette');if(!h)return;let transparent=PREVIEW_TRANSPARENT;try{const q=currentPreview();if(q)transparent=decodePreviewBob(q.resource.data).transparent;}catch(_e){}h.innerHTML='';for(let i=0;i<32;i++){const b=document.createElement('button');b.type='button';b.className='previewSwatch'+(i===previewColour?' selected':'');b.title=i===transparent?`${i} · transparent`:`${i} · $${PRESENTATION_PALETTE_WORDS[i].toString(16).toUpperCase().padStart(3,'0')}`;const c=PRESENTATION_PALETTE_RGB[i];b.style.background=`rgb(${c[0]},${c[1]},${c[2]})`;b.dataset.colour=String(i);b.addEventListener('click',()=>{previewColour=i;renderPreviewPalette();});h.appendChild(b);}}
function renderPreviewMode(){
  syncAuxSize();const c=auxCanvas(),ctx=c.getContext('2d'),q=currentPreview();ctx.fillStyle='#10131a';ctx.fillRect(0,0,c.width,c.height);if(!q)return;
  const decoded=decodePreviewBob(q.resource.data),rgba=previewBobToRgba(decoded),scale=Math.max(1,Math.floor(Math.min((c.width-32)/PREVIEW_WIDTH,(c.height-72)/PREVIEW_HEIGHT))),drawW=PREVIEW_WIDTH*scale,drawH=PREVIEW_HEIGHT*scale,x=Math.round((c.width-drawW)/2),y=Math.round((c.height-drawH)/2+16);auxLayout={mode:'mini',x,y,scale,w:PREVIEW_WIDTH,h:PREVIEW_HEIGHT};
  ctx.fillStyle='#262b35';ctx.fillRect(x-4,y-4,drawW+8,drawH+8);ctx.save();ctx.beginPath();ctx.rect(x,y,drawW,drawH);ctx.clip();putScaled(ctx,rgba,x,y,scale);ctx.restore();ctx.strokeStyle='#666';ctx.strokeRect(x-.5,y-.5,drawW+1,drawH+1);ctx.fillStyle='#ddd';ctx.font=`${Math.max(11,Math.round(c.width/55))}px ui-monospace,monospace`;ctx.fillText(`Miniature 78×51 · resource $${q.resourceId.toString(16).toUpperCase().padStart(2,'0')} · paint colour ${previewColour}`,12,22);
}
function drawHudPixelDigit(ctx,digit,x,y,S,colours={dark:5,light:6}){
  const rows=HUD_DIGITS[Number(digit)]||HUD_DIGITS[0],dark=PRESENTATION_PALETTE_RGB[colours.dark]||[187,51,51],light=PRESENTATION_PALETTE_RGB[colours.light]||[204,0,0];ctx.save();
  for(let yy=0;yy<5;yy++){const [dm,lm]=rows[yy];for(let xx=0;xx<3;xx++){const bit=1<<(2-xx),rgb=(lm&bit)?light:(dm&bit)?dark:null;if(!rgb)continue;ctx.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;ctx.fillRect((x+xx)*S,(y+yy)*S,Math.max(1,S),Math.max(1,S));}}
  ctx.restore();
}
function drawHudPixelNumber(ctx,value,x,y,S,colours={dark:5,light:6},{minDigits=1}={}){
  const text=String(Math.max(0,Math.floor(Number(value)||0))).padStart(minDigits,'0');let ox=x;for(const ch of text){drawHudPixelDigit(ctx,ch,ox,y,S,colours);ox+=4;}return ox-x;
}
function drawLapTotal99(ctx,rendererX,rendererY,S){
  // Retail total-laps descriptor origin is (5,3).  The proven custom renderer
  // writes an opaque 9x5 object with palette 1 background and 5/6 digit shades.
  const x=rendererX-LAP_TOTAL_ORIGIN.x,y=rendererY-LAP_TOTAL_ORIGIN.y,bg=PRESENTATION_PALETTE_RGB[1];ctx.save();ctx.fillStyle=`rgb(${bg[0]},${bg[1]},${bg[2]})`;ctx.fillRect(x*S,y*S,9*S,5*S);drawHudPixelDigit(ctx,9,x+1,y,S,{dark:5,light:6});drawHudPixelDigit(ctx,9,x+5,y,S,{dark:5,light:6});ctx.restore();
}
function drawGameHudDigit(ctx,digit,x,y,S,colourIndex=3){const rows=GAME_HUD_DIGITS[Number(digit)]||GAME_HUD_DIGITS[0],c=PRESENTATION_PALETTE_RGB[colourIndex]||[255,255,255];ctx.save();ctx.fillStyle=`rgb(${c[0]},${c[1]},${c[2]})`;for(let yy=0;yy<7;yy++){const bits=rows[yy];for(let xx=0;xx<6;xx++)if(bits&(1<<(5-xx)))ctx.fillRect((x+xx)*S,(y+yy)*S,Math.max(1,S),Math.max(1,S));}ctx.restore();}
function raceModeActive(){const pane=$('raceSetupPane'),button=$('layerEditRaceSetup');return !!(pane&&!pane.hidden&&button?.classList.contains('active'));}
function raceHudCanvas(){return $('circuitRaceHudCanvas');}
function syncRaceHudSize(){const v=$('view'),c=raceHudCanvas();if(!v||!c)return;if(c.width!==v.width||c.height!==v.height){c.width=v.width;c.height=v.height;c.getContext('2d').imageSmoothingEnabled=false;}}
function raceHudEnabled(id,def=true){const e=$(id);return e?!!e.checked:def;}
function renderRaceHudOverlay(){
  const c=raceHudCanvas();if(!c)return;syncRaceHudSize();const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);c.hidden=!raceModeActive();if(c.hidden)return;
  const r=currentRecord(),C=currentCapture();if(!r||!C?.model)return;const p=readPresentation(C.model.main,r.offset),S=c.width/320,alpha=Math.max(.25,Math.min(1,Number($('opacity')?.value||55)/100));ctx.save();ctx.globalAlpha=alpha;
  if(raceHudEnabled('circuitShowCurrentLaps'))for(let i=0;i<HUD_LAYOUT.currentLapRows.length;i++)drawGameHudDigit(ctx,i+1,p.lapDisplayX,p.lapDisplayY+HUD_LAYOUT.currentLapRows[i],S,HUD_CAR_COLOURS[i]);
  if(raceHudEnabled('circuitShowTotalLaps'))drawLapTotal99(ctx,p.lapDisplayX+HUD_LAYOUT.totalLaps.x,p.lapDisplayY+HUD_LAYOUT.totalLaps.y,S);
  if(raceHudEnabled('circuitShowTimer'))HUD_LAYOUT.timerDigits.forEach(q=>drawGameHudDigit(ctx,0,p.lapDisplayX+q.x,p.lapDisplayY+q.y,S,3));
  // race+$24/+26 is the true top-left origin used by the current-lap tower.
  const ax=p.lapDisplayX*S,ay=p.lapDisplayY*S;ctx.strokeStyle='#ffd84a';ctx.lineWidth=Math.max(1,.6*S);ctx.beginPath();ctx.moveTo(ax-5*S,ay);ctx.lineTo(ax+5*S,ay);ctx.moveTo(ax,ay-5*S);ctx.lineTo(ax,ay+5*S);ctx.stroke();ctx.restore();
}
function writeHudAnchorAll(x,y){for(const model of allAuthoringModels()){const r=recordForTrackIndex(sourceTrackIndex(),model);if(r)writePresentation(model.main,r.offset,{lapDisplayX:Math.round(x),lapDisplayY:Math.round(y)});}const X=$('circuitHudX'),Y=$('circuitHudY');if(X)X.value=String(Math.round(x));if(Y)Y.value=String(Math.round(y));renderRaceHudOverlay();}
function raceCanvasPoint(e){const c=$('raceSetupCanvas');if(!c)return null;const r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*320/r.width,y:(e.clientY-r.top)*256/r.height};}
function installRaceHudPointerBridge(){const c=$('raceSetupCanvas');if(!c||c.dataset.circuitHudBridge)return false;c.dataset.circuitHudBridge='1';
  c.addEventListener('pointerdown',e=>{if(!raceModeActive()||e.button!==0)return;const q=raceCanvasPoint(e),r=currentRecord(),C=currentCapture();if(!q||!r||!C?.model)return;const p=readPresentation(C.model.main,r.offset),dx=q.x-p.lapDisplayX,dy=q.y-p.lapDisplayY;if(dx*dx+dy*dy>14*14)return;e.preventDefault();e.stopImmediatePropagation();raceHudDrag={pointerId:e.pointerId};c.setPointerCapture?.(e.pointerId);writeHudAnchorAll(q.x,q.y);},true);
  c.addEventListener('pointermove',e=>{if(!raceHudDrag||raceHudDrag.pointerId!==e.pointerId)return;const q=raceCanvasPoint(e);if(!q)return;e.preventDefault();e.stopImmediatePropagation();writeHudAnchorAll(q.x,q.y);},true);
  const end=e=>{if(!raceHudDrag||raceHudDrag.pointerId!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();try{c.releasePointerCapture?.(e.pointerId);}catch(_e){}raceHudDrag=null;refreshUi();};c.addEventListener('pointerup',end,true);c.addEventListener('pointercancel',end,true);return true;
}
function renderAux(){if(auxMode==='map')renderMapMode();else if(auxMode==='mini')renderPreviewMode();}

function auxPoint(e){const c=auxCanvas(),r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*c.width/r.width,y:(e.clientY-r.top)*c.height/r.height};}
function sourcePoint(e){if(!auxLayout)return null;const q=auxPoint(e),x=Math.floor((q.x-auxLayout.x)/auxLayout.scale),y=Math.floor((q.y-auxLayout.y)/auxLayout.scale);return{x,y,inside:x>=0&&y>=0&&x<auxLayout.w&&y<auxLayout.h};}
function mapDrag(e){if(!dragMarker||auxMode!=='map')return;const q=sourcePoint(e),r=currentRecord(),C=currentCapture();if(!q?.inside||!r||!C?.model)return;const x=REGIONAL_MAP_SCREEN_X+q.x,y=REGIONAL_MAP_SCREEN_Y+q.y;writePresentation(C.model.main,r.offset,{markerX:x,markerY:y});$('circuitMarkerX').value=String(x);$('circuitMarkerY').value=String(y);renderMapMode();}
function toolPoints(tool,a,b,T){if(tool==='line')return T?.linePoints?T.linePoints(a.x,a.y,b.x,b.y):[[b.x,b.y]];if(tool==='rect')return T?.rectanglePoints?T.rectanglePoints(a.x,a.y,b.x,b.y):[[b.x,b.y]];return [[b.x,b.y]];}
function paintPreviewPoints(pixels,points,value){const T=root.IndyHeatLayerTools,expanded=T?.expandPointsWithBrush?T.expandPointsWithBrush(points,previewBrush,'square'):points;for(const [x,y] of expanded)if(x>=0&&y>=0&&x<PREVIEW_WIDTH&&y<PREVIEW_HEIGHT)pixels[y*PREVIEW_WIDTH+x]=value;}
function ensurePreviewTemplateTransparency(pr){
  const decoded=decodePreviewBob(pr.resource.data);if(decoded.transparent===MINIMAP_TEMPLATE_TRANSPARENT)return decoded;
  pr.resource.data.set(migratePreviewTransparency(pr.resource.data,MINIMAP_TEMPLATE_TRANSPARENT));
  return decodePreviewBob(pr.resource.data);
}
function placePreviewTemplate(pr,q){
  const source=MINIMAP_TEMPLATES.find(t=>t.key===previewTemplateKey);if(!source)return false;
  pushPreviewUndo(pr);const decoded=ensurePreviewTemplateTransparency(pr);
  const placed=stampMiniMapTemplate(decoded.pixels,source,q.x,q.y,{rotation:previewTemplateRotation,flipH:previewTemplateFlipH,flipV:previewTemplateFlipV});
  writePreviewPixels(pr,placed.pixels,MINIMAP_TEMPLATE_TRANSPARENT);renderPreviewPalette();renderPreviewMode();
  status(`${placed.template.name} template placed at ${q.x},${q.y} · ${previewTemplateRotation}°${previewTemplateFlipH?' · flip H':''}${previewTemplateFlipV?' · flip V':''}. Colour 8 is transparent; colour 0 remains black.`);return true;
}
function beginPreview(e){if(auxMode!=='mini')return;const q=sourcePoint(e);if(!q?.inside)return;e.preventDefault();const pr=currentPreview();if(!pr)return;if(previewTool==='template'&&e.button===0){placePreviewTemplate(pr,q);return;}const decoded=decodePreviewBob(pr.resource.data),pixels=decoded.pixels;if(previewTool==='pick'){previewColour=pixels[q.y*PREVIEW_WIDTH+q.x];renderPreviewPalette();syncPreviewToolButtons();status(`Picked miniature colour ${previewColour} at ${q.x},${q.y}.`);return;}pushPreviewUndo(pr);const value=e.button===2?decoded.transparent:previewColour;if(previewTool==='fill'){const T=root.IndyHeatLayerTools,idx=T?.floodFillIndices?T.floodFillIndices(pixels,PREVIEW_WIDTH,PREVIEW_HEIGHT,q.x,q.y,value):[];for(const i of idx)pixels[i]=value;writePreviewPixels(pr,pixels);renderPreviewMode();return;}previewGesture={start:q,last:q,value,pointerId:e.pointerId};auxCanvas().setPointerCapture?.(e.pointerId);paintPreviewPoints(pixels,[[q.x,q.y]],value);writePreviewPixels(pr,pixels);renderPreviewMode();}
function movePreview(e){if(!previewGesture||auxMode!=='mini'||previewTool!=='pencil')return;const q=sourcePoint(e);if(!q?.inside)return;const pr=currentPreview(),pixels=decodePreviewBob(pr.resource.data).pixels,T=root.IndyHeatLayerTools,pts=T?.linePoints?T.linePoints(previewGesture.last.x,previewGesture.last.y,q.x,q.y):[[q.x,q.y]];paintPreviewPoints(pixels,pts,previewGesture.value);writePreviewPixels(pr,pixels);previewGesture.last=q;renderPreviewMode();}
function endPreview(e){if(!previewGesture||auxMode!=='mini')return;const g=previewGesture;previewGesture=null;const q=sourcePoint(e),pr=currentPreview();if(!q?.inside||!pr)return;if(previewTool!=='pencil'&&previewTool!=='pick'){const pixels=decodePreviewBob(pr.resource.data).pixels,T=root.IndyHeatLayerTools,pts=toolPoints(previewTool,g.start,q,T);paintPreviewPoints(pixels,pts,g.value);writePreviewPixels(pr,pixels);}renderPreviewMode();}
function previewUndoOnce(){const q=currentPreview();if(!q)return;const key=previewStateKey(q),st=previewUndo.get(key)||[],b=st.pop();if(b){q.resource.data.set(b);renderPreviewMode();}previewUndo.set(key,st);}
function previewRevert(){const q=currentPreview();if(!q)return;const b=previewOriginals.get(previewStateKey(q));if(b){pushPreviewUndo(q);q.resource.data.set(b);renderPreviewMode();}}
function previewBlank(){const q=currentPreview();if(!q)return;pushPreviewUndo(q);const px=new Uint8Array(PREVIEW_WIDTH*PREVIEW_HEIGHT);px.fill(MINIMAP_TEMPLATE_TRANSPARENT);writePreviewPixels(q,px,MINIMAP_TEMPLATE_TRANSPARENT);renderPreviewPalette();renderPreviewMode();}
function previewFromBackdrop(){
  const q=currentPreview(),T=root.IndyHeatTools,TB=root.IndyHeatTrackBackdropTools,model=resourceModel(),record=recordForTrackIndex(sourceTrackIndex(),model);if(!q||!T||!model||!record)return;
  try{const bg=model.getResource(record.baseResourceId),source=TB?.decodeTrackPlanar?TB.decodeTrackPlanar(bg.data):T.decodePlanar(bg.data,320,256,5,0),transparent=MINIMAP_TEMPLATE_TRANSPARENT,replacement=previewColour===transparent?nearestPreviewColour(transparent,new Set([transparent])):previewColour,pixels=previewPixelsFromBackdrop(source,{zeroReplacement:replacement,transparent});pushPreviewUndo(q);writePreviewPixels(q,pixels,transparent);renderPreviewPalette();renderPreviewMode();status(`Miniature rebuilt from the current 320×224 gameplay backdrop. MiniMap transparency is colour ${transparent}; colour 0 remains available as black.`);}catch(e){status(`ERROR: ${e.message}`);}
}

function refreshUi(){
  ensureLapContract();const r=currentRecord(),C=currentCapture();if(!r||!C?.model)return;const p=readPresentation(C.model.main,r.offset),id=currentMapId();
  $('circuitMapId')&&($('circuitMapId').value=String(id));$('circuitMarkerX')&&($('circuitMarkerX').value=String(p.markerX));$('circuitMarkerY')&&($('circuitMarkerY').value=String(p.markerY));$('circuitMarkerFrame')&&($('circuitMarkerFrame').value=String(Math.max(0,Math.min(3,p.markerFrame))));$('circuitNumber')&&($('circuitNumber').value=String(currentCircuitIndex()));$('circuitHudX')&&($('circuitHudX').value=String(p.lapDisplayX));$('circuitHudY')&&($('circuitHudY').value=String(p.lapDisplayY));
  const folder=circuitFolder(currentCircuitIndex()),stock=stockTrackIdForCircuit(currentCircuitIndex()),logical=logicalRetailIndex(),source=customSelected()?`-custom- using retail template ${sourceTrackIndex()}`:packageSlots.has(selectionKey())?`Retail slot ${logical} overlay using template ${sourceTrackIndex()}`:`Retail source ${sourceTrackIndex()+1}`;status(`${source} → ${folder}${stock?` · direct stock slot ${stock}`:' · custom library circuit'}\nMap ${mapById(id).name} · arrow (${p.markerX},${p.markerY}) frame ${p.markerFrame} · HUD (${p.lapDisplayX},${p.lapDisplayY}) · total laps ${p.laps}.`);drawArrowChoiceButtons();renderPreviewPalette();syncPreviewToolButtons();renderAux();renderRaceHudOverlay();
}
function applyMapFields(){const r=currentRecord(),C=currentCapture();if(!r||!C?.model)return;try{setCurrentMapId(Number($('circuitMapId').value));writePresentation(C.model.main,r.offset,{markerX:Number($('circuitMarkerX').value),markerY:Number($('circuitMarkerY').value),markerFrame:Number($('circuitMarkerFrame').value)});refreshUi();}catch(e){status(`ERROR: ${e.message}`);}}
function applyHudFields(){try{writeHudAnchorAll(Number($('circuitHudX').value),Number($('circuitHudY').value));refreshUi();}catch(e){status(`ERROR: ${e.message}`);}}
function packageFromTrack(index,key,circuitIndexOverride=null){
  const RST=root.IndyHeatRaceSetupTools,T=root.IndyHeatTools,pm=primaryModel(),rm=resourceModel(),wm=waypointModel();if(!pm||!rm||!wm||!RST||!T)throw new Error('Circuit data is not ready');
  const pr=recordForTrackIndex(index,pm),rr=recordForTrackIndex(index,rm),wr=recordForTrackIndex(index,wm);if(!pr||!rr||!wr)throw new Error('Circuit record is unavailable in one of the editor models');
  const p=readPresentation(pm.main,pr.offset);clampInt(p.laps,LAP_MIN,LAP_MAX,'Lap total');const base=rr.baseResourceId,q=resolvePreviewResource(pm,pr);
  return {circuitIndex:circuitIndexOverride??(circuitNumbers.get(key)??index),resources:{background:rm.getResource(base).data.slice(),foreground:rm.getResource(base+1).data.slice(),surface:rm.getResource(base+2).data.slice(),recovery:rm.getResource(base+3).data.slice()},previewBin:q.resource.data.slice(),waypointsBin:encodeWaypointsBin(wr,wm.main),raceSetupBin:RST.makeCompactBin(pm.main,pr),presentationBin:encodePresentationBin({mapId:mapIds.get(key)??0,presentation:p})};
}
function currentPackage(){return packageFromTrack(sourceTrackIndex(),selectionKey(),currentCircuitIndex());}
function retailRouteCounts(){const T=root.IndyHeatTools,wm=waypointModel();if(!T||!wm)return [];return (T.TRACK_BASE_IDS||[]).map((_,i)=>{const r=recordForTrackIndex(i,wm);return (r?.waypointDescriptors||[]).map(q=>q.points.length);});}
function writeWaypointPackageToRecord(model,record,waypointsBin){
  const T=root.IndyHeatTools,routes=decodeWaypointsBin(waypointsBin),sets=record?.waypointDescriptors;if(!model||!T||!Array.isArray(sets)||sets.length<WAYPOINT_ROUTE_COUNT)throw new Error('Retail waypoint template is unavailable');
  for(let i=0;i<WAYPOINT_ROUTE_COUNT;i++){
    const src=routes[i],dst=sets[i];if(src.points.length!==dst.points.length)throw new Error(`Waypoint route ${'ABC'[i]} count ${src.points.length} does not match template count ${dst.points.length}`);
    if(!!src.boundaryBytes!==!!dst.boundaryPoint)throw new Error(`Waypoint route ${'ABC'[i]} boundary shape does not match template`);
    for(let n=0;n<src.points.length;n++)model.main.set(src.points[n],dst.points[n].fileOffset);
    if(src.boundaryBytes&&dst.boundaryPoint)model.main.set(src.boundaryBytes,dst.boundaryPoint.fileOffset);
  }
  record.waypointDescriptors=T.parseWaypointDescriptors(model.main,record);
}
function applyPackageToTrack(pkg,index,key,{resetPreviewBaseline=false}={}){
  const T=root.IndyHeatTools,RST=root.IndyHeatRaceSetupTools,models=allAuthoringModels();if(!models.length||!T||!RST)throw new Error('Disk.1 must be loaded before importing a circuit ZIP');const pr=decodePresentationBin(pkg.presentationBin);let primaryPreview=null;
  for(const model of models){
    const r=recordForTrackIndex(index,model);if(!r)throw new Error('Retail template record is unavailable in an editor model');const base=r.baseResourceId,target=[model.getResource(base),model.getResource(base+1),model.getResource(base+2),model.getResource(base+3)],src=[pkg.resources.background,pkg.resources.foreground,pkg.resources.surface,pkg.resources.recovery];
    for(let i=0;i<4;i++){if(target[i].data.length!==src[i].length)throw new Error(`Imported ${['background','foreground','surface','recovery'][i]}.bin size ${hex(src[i].length)} does not match template resource size ${hex(target[i].data.length)}`);target[i].data.set(src[i]);}
    const q=resolvePreviewResource(model,r);if(q.resource.data.length!==pkg.previewBin.length)throw new Error('preview.bin size does not match the inferred retail template');q.resource.data.set(pkg.previewBin);if(model===primaryModel())primaryPreview=q;
    writeWaypointPackageToRecord(model,r,pkg.waypointsBin);RST.applyCompactBin(model.main,r,pkg.raceSetupBin);writePresentation(model.main,r.offset,pr);
  }
  mapIds.set(key,pr.mapId);circuitNumbers.set(key,pkg.circuitIndex);if(resetPreviewBaseline&&primaryPreview){const pkey=`${key}:${primaryPreview.resourceId}`;previewOriginals.set(pkey,pkg.previewBin.slice());previewUndo.delete(pkey);}markerGraphics=null;return recordForTrackIndex(index,primaryModel());
}
function optionForRetailIndex(index){
  const sel=$('trackSelect');if(!sel)return null;return [...sel.options].find(o=>o.dataset.indyheatCustom!=='1'&&Number(o.dataset.indyheatRetailIndex??o.value)===Number(index))||null;
}
function slotForOption(option=selectedOption()){const key=option?.dataset?.indyheatPackageKey;return key?packageSlots.get(key)||null:null;}
function captureActivePackage(){if(!activePackageSlot)return;activePackageSlot.package=packageFromTrack(activePackageSlot.hostIndex,activePackageSlot.key,activePackageSlot.package.circuitIndex);}
function restoreActiveHost(){if(!activePackageSlot?.hostSnapshot)return;applyPackageToTrack(activePackageSlot.hostSnapshot,activePackageSlot.hostIndex,retailKey(activePackageSlot.hostIndex));}
function deactivateActivePackage(){if(!activePackageSlot)return;captureActivePackage();restoreActiveHost();activePackageSlot=null;}
function activatePackageSlot(slot){
  if(!slot||activePackageSlot===slot)return;
  slot.hostSnapshot=packageFromTrack(slot.hostIndex,retailKey(slot.hostIndex),circuitNumbers.get(retailKey(slot.hostIndex))??slot.hostIndex);
  applyPackageToTrack(slot.package,slot.hostIndex,slot.key);activePackageSlot=slot;
}
function packageSelectionCapture(){
  if(selectionTransition)return;const next=slotForOption();
  try{if(activePackageSlot&&activePackageSlot!==next)deactivateActivePackage();if(next&&activePackageSlot!==next)activatePackageSlot(next);}
  catch(e){status(`ERROR: ${e.message}`);}
}
function resetPackageSession(){
  activePackageSlot=null;selectionTransition=false;packageSlots.clear();mapIds.clear();circuitNumbers.clear();previewOriginals.clear();previewUndo.clear();mapCache.clear();markerGraphics=null;auxMode=null;auxLayout=null;dragMarker=false;previewGesture=null;raceHudDrag=null;
}
const PACKAGE_RETAIL_REVERT_IDS=new Set(['revertWaypoint','revertAll','layerRevert','recoveryUndo','recoveryRevert','raceRevert','backdropRevert']);
function protectImportedPackageFromRetailRevert(e){
  if(!activePackageSlot)return;const b=e.target?.closest?.('button');if(!b||!PACKAGE_RETAIL_REVERT_IDS.has(b.id))return;
  e.preventDefault();e.stopImmediatePropagation();status(`Imported ${activePackageSlot.package.folder} is protected from legacy Disk.1 Undo/Revert actions that do not understand package baselines. Use package-safe Undo where available, Restore loaded for the miniature, or re-import the ZIP to restore the imported package baseline.`);
}
document.addEventListener('click',protectImportedPackageFromRetailRevert,true);
function removeCustomOption(){const sel=$('trackSelect'),o=sel?.querySelector('option[data-indyheat-custom="1"]');if(!o)return;const key=o.dataset.indyheatPackageKey;if(activePackageSlot&&activePackageSlot.key===key)deactivateActivePackage();if(key)packageSlots.delete(key);o.remove();}
function prepareSlot(pkg,key,option,hostIndex){
  const old=packageSlots.get(key);if(old&&activePackageSlot===old)deactivateActivePackage();
  const slot={key,package:pkg,hostIndex,hostSnapshot:null,option};packageSlots.set(key,slot);option.dataset.indyheatPackageKey=key;circuitNumbers.set(key,pkg.circuitIndex);mapIds.set(key,pkg.presentation.mapId);
  const q=resolvePreviewResource(primaryModel(),recordForTrackIndex(hostIndex,primaryModel())),pkey=`${key}:${q.resourceId}`;previewOriginals.set(pkey,pkg.previewBin.slice());previewUndo.delete(pkey);return slot;
}
function selectOption(option){const sel=$('trackSelect');if(!sel||!option)throw new Error('Track selector option is unavailable');selectionTransition=true;sel.selectedIndex=[...sel.options].indexOf(option);selectionTransition=false;sel.dispatchEvent(new Event('change',{bubbles:true}));}
function installStockPackage(pkg){
  deactivateActivePackage();const target=pkg.circuitIndex,hostIndex=inferTemplateIndex(pkg.circuitIndex,pkg.routeCounts,retailRouteCounts()),key=retailKey(target),option=optionForRetailIndex(target);if(!option)throw new Error(`Retail selector option ${target} is unavailable`);
  if(option.dataset.indyheatOriginalValue==null){option.dataset.indyheatOriginalValue=option.value;option.dataset.indyheatOriginalText=option.textContent;option.dataset.indyheatRetailIndex=String(target);}option.value=String(hostIndex);option.textContent=`${option.dataset.indyheatOriginalText} · imported ${pkg.folder}`;prepareSlot(pkg,key,option,hostIndex);selectOption(option);status(`Imported ${pkg.folder}. It overlays retail selector slot ${target}; editor template ${hostIndex} was inferred from the waypoint shape.`);
}
function installCustomPackage(pkg){
  deactivateActivePackage();removeCustomOption();const hostIndex=inferTemplateIndex(pkg.circuitIndex,pkg.routeCounts,retailRouteCounts()),sel=$('trackSelect'),option=document.createElement('option');option.value=String(hostIndex);option.dataset.indyheatCustom='1';option.textContent=`-custom- · ${pkg.folder}`;sel.appendChild(option);prepareSlot(pkg,'custom',option,hostIndex);selectOption(option);status(`Imported ${pkg.folder} as -custom-. Switch to any retail circuit for reference, then back to -custom- to continue editing.`);
}
async function importCircuitZip(file){
  if(!file)return;try{const pkg=parseCircuitZip(new Uint8Array(await file.arrayBuffer()));if(pkg.circuitIndex<10)installStockPackage(pkg);else installCustomPackage(pkg);refreshUi();}catch(e){status(`ERROR: ${e.message}`);}
}
function exportZip(){try{const p=currentPackage(),files=makePackageFiles(p),zip=zipStore(files),folder=circuitFolder(p.circuitIndex);download(zip,`${folder}.zip`,'application/zip');status(`Exported ${folder}.zip · ${files.length} game/runtime files, including the editable 78×51 preview. Unpack into data/.`);}catch(e){status(`ERROR: ${e.message}`);}}

function makeMirrorToggle(host,id,label,targetId){const l=document.createElement('label');l.innerHTML=`<input id="${id}" type="checkbox"> ${label}`;const box=l.querySelector('input'),target=$(targetId);if(target)box.checked=!!target.checked;box.addEventListener('change',()=>{const t=$(targetId);if(t){t.checked=box.checked;t.dispatchEvent(new Event('change',{bubbles:true}));}renderRaceHudOverlay();});host.appendChild(l);return box;}
function foldExistingViewSection(anchorId,summaryText,contentNodes=[]){const anchor=$(anchorId);if(!anchor||anchor.closest('details[data-circuit-fold]'))return null;const details=document.createElement('details');details.dataset.circuitFold='1';details.open=true;const summary=document.createElement('summary');summary.textContent=summaryText;details.appendChild(summary);anchor.parentNode.insertBefore(details,anchor);details.appendChild(anchor);for(const n of contentNodes)if(n&&n.parentNode)details.appendChild(n);return details;}
function setupLeftViewToggles(){
  if($('circuitViewRaceControl'))return true;const surface=$('layerShowSurface'),waypoint=$('showWaypoints');if(!surface||!waypoint||!$('raceShowPits'))return false;
  const surfaceRow=surface.closest('.layerControlRow')||surface.parentElement,oldSurface=$('showSurface')?.closest('label'),surfaceControls=oldSurface?.nextElementSibling?.classList?.contains('classToggles')?oldSurface.nextElementSibling:null;
  if(surfaceRow&&!surfaceRow.closest('details[data-circuit-fold]')){const d=document.createElement('details');d.dataset.circuitFold='1';d.open=true;const sm=document.createElement('summary');sm.textContent='Surface types';surfaceRow.parentNode.insertBefore(d,surfaceRow);d.append(sm,surfaceRow);if(surfaceControls)d.appendChild(surfaceControls);const sp=surfaceRow.querySelector('span');if(sp)sp.textContent='Show overlay';}
  const wpLabel=waypoint.closest('label'),wpControls=wpLabel?.nextElementSibling;
  if(wpLabel&&!wpLabel.closest('details[data-circuit-fold]')){const d=document.createElement('details');d.dataset.circuitFold='1';d.open=true;const sm=document.createElement('summary');sm.textContent='Waypoints';wpLabel.parentNode.insertBefore(d,wpLabel);d.append(sm,wpLabel);if(wpControls?.classList?.contains('classToggles'))d.appendChild(wpControls);}
  const viewSection=surfaceRow?.closest('section')||waypoint.closest('section');if(!viewSection)return false;
  const pits=document.createElement('details');pits.id='circuitViewPits';pits.open=true;pits.innerHTML='<summary>Pits</summary><div class="circuitViewToggleBody"></div>';const ph=pits.querySelector('div');makeMirrorToggle(ph,'circuitShowPits','Pit/service + crew','raceShowPits');makeMirrorToggle(ph,'circuitShowBoards','PIT boards','raceShowBoards');makeMirrorToggle(ph,'circuitShowPitCars','Cars in pits','raceShowPitCars');
  const rc=document.createElement('details');rc.id='circuitViewRaceControl';rc.open=true;rc.innerHTML='<summary>Race control</summary><div class="circuitViewToggleBody"></div>';const rh=rc.querySelector('div');makeMirrorToggle(rh,'circuitShowStart','Start / grid anchor','raceShowStart');makeMirrorToggle(rh,'circuitShowGridCars','Cars on grid','raceShowGridCars');makeMirrorToggle(rh,'circuitShowFlag','Flag man','raceShowFlag');for(const [id,label] of [['circuitShowCurrentLaps','Current-lap tower'],['circuitShowTotalLaps','Total laps'],['circuitShowTimer','Timer']]){const l=document.createElement('label');l.innerHTML=`<input id="${id}" type="checkbox" checked> ${label}`;l.querySelector('input').addEventListener('change',renderRaceHudOverlay);rh.appendChild(l);}viewSection.append(pits,rc);return true;
}
function setupRaceIntegration(){
  const pane=$('raceSetupPane'),raceBtn=$('layerEditRaceSetup'),raceCanvas=$('raceSetupCanvas'),stack=viewerStack();if(!pane||!raceBtn||!raceCanvas||!stack)return false;
  if(!$('circuitRaceHudControls')){const controls=document.createElement('div');controls.id='circuitRaceHudControls';controls.className='toolGroup';controls.innerHTML=`<div class="toolGroupTitle">Race HUD / lap tower</div><div class="circuitAuxGrid"><label>HUD X <input id="circuitHudX" type="number"></label><label>HUD Y <input id="circuitHudY" type="number"></label></div><button id="circuitHudApply" type="button">Apply HUD anchor</button><div id="circuitRaceHudStatus" class="muted"></div><div class="muted">The yellow cursor is race+$24/+26: the true top-left of the 1/2/3/4 lap tower. Total laps previews 99 at -4,+43; timer digits use -8/0/+8,+47. Drag the yellow origin directly in Race mode.</div>`;const checks=pane.querySelector('.raceSetupChecks');if(checks)checks.style.display='none';const grid=pane.querySelector('.raceSetupGrid');pane.insertBefore(controls,grid||pane.firstChild);$('circuitHudApply').addEventListener('click',applyHudFields);}
  if(!$('circuitRaceHudCanvas')){const c=document.createElement('canvas');c.id='circuitRaceHudCanvas';c.hidden=true;stack.appendChild(c);}
  installRaceHudPointerBridge();setupLeftViewToggles();if(!raceBtn.dataset.circuitHudMode){raceBtn.dataset.circuitHudMode='1';raceBtn.addEventListener('click',()=>setTimeout(()=>{setOverlayOpacityVisible(true);refreshUi();renderRaceHudOverlay();},0));$('layerModeButtons')?.addEventListener('click',()=>setTimeout(renderRaceHudOverlay,0));$('opacity')?.addEventListener('input',renderRaceHudOverlay);$('editorScale')?.addEventListener('change',()=>setTimeout(renderRaceHudOverlay,0));}
  return true;
}

function injectUi(){
  const buttons=$('layerModeButtons'),column=$('layerEditorColumn'),view=$('view'),header=document.querySelector('header');if(!buttons||!column||!view||!header||$('circuitAuxPane'))return !!$('circuitAuxPane');
  const style=document.createElement('style');style.textContent=`
    #circuitAuxCanvas{position:absolute;inset:0;z-index:7;display:block;image-rendering:pixelated;touch-action:none;background:#10131a}
    #circuitAuxCanvas[hidden],#circuitRaceHudCanvas[hidden]{display:none} #circuitAuxPane[hidden],#circuitMapControls[hidden],#circuitPreviewControls[hidden]{display:none}
    #circuitArrowChoices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;margin:6px 0} .circuitArrowChoice{display:grid;grid-template-columns:48px 1fr;align-items:center;gap:4px;min-width:0}.circuitArrowChoice canvas{image-rendering:pixelated;background:#161a21}.circuitArrowChoice.selected{outline:2px solid #ffd84a}
    #circuitPreviewPalette{display:grid;grid-template-columns:repeat(8,1fr);gap:3px;margin:7px 0}.previewSwatch{height:22px;min-width:0;border:1px solid #555}.previewSwatch.selected{outline:2px solid #fff;outline-offset:1px} .circuitTemplateGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;margin:5px 0}.circuitTemplateGrid button,.circuitTemplateTransform button{min-width:0;padding:5px 4px;font-size:10px}.circuitTemplateGrid button.active,.circuitTemplateTransform button.active{border-color:#d6b54a;background:#5a4a1c;box-shadow:inset 0 0 0 1px #d6b54a}.circuitTemplateTransform{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;margin:5px 0}#circuitTemplateState{font-size:10px;color:#aeb5c0;margin:4px 0 8px}
    .circuitAuxGrid{display:grid;grid-template-columns:1fr 1fr;gap:6px}.circuitAuxGrid label{display:grid;gap:2px}.circuitAuxWide{grid-column:1/-1}.circuitToolRow{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;margin:6px 0}.circuitToolRow button{min-width:0;padding:6px 3px;font-size:11px}.circuitToolRow button.active{border-color:#d6b54a;background:#5a4a1c;box-shadow:inset 0 0 0 1px #d6b54a}#circuitRaceHudCanvas{position:absolute;inset:0;z-index:4;display:block;pointer-events:none;image-rendering:pixelated}.circuitViewToggleBody{padding:3px 0 4px 12px}.circuitViewToggleBody label{margin:5px 0}
    #circuitFileActions{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-left:auto}#circuitPackageHeader{display:flex;align-items:center;gap:6px;flex-wrap:wrap}#circuitPackageHeader label{display:flex;align-items:center;gap:5px;margin:0;font-size:12px}#circuitPackageHeader input[type=number]{width:58px;background:#222730;color:#fff;border:1px solid #495162;border-radius:4px;padding:7px 5px}#circuitPackageHeader button{padding:8px 10px;white-space:nowrap}#circuitPackageTopStatus{font-size:10px;color:#9aa1ad;max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#circuitPackageTopStatus.bad{color:#ff8585}
    @media(max-width:900px){#circuitFileActions{margin-left:0}}
  `;document.head.appendChild(style);

  // Mode navigation is always the first block in the right-hand editor column.
  if(column.firstElementChild!==buttons)column.insertBefore(buttons,column.firstElementChild);

  const mapBtn=document.createElement('button');mapBtn.id='layerEditMap';mapBtn.type='button';mapBtn.textContent='Map';buttons.appendChild(mapBtn);
  const miniBtn=document.createElement('button');miniBtn.id='layerEditMini';miniBtn.type='button';miniBtn.textContent='Mini map';buttons.appendChild(miniBtn);

  // Package operations are global file operations, so keep them beside Open Disk.1 / ADF.
  const fileActions=document.createElement('div');fileActions.id='circuitFileActions';const openDisk=header.querySelector('.filebtn');if(openDisk){header.insertBefore(fileActions,openDisk);fileActions.appendChild(openDisk);}else header.appendChild(fileActions);
  const top=document.createElement('div');top.id='circuitPackageHeader';top.innerHTML=`<label>Circuit # <input id="circuitNumber" type="number" min="0" max="99" step="1"></label><input id="circuitPackageInput" type="file" accept=".zip,application/zip" hidden><button id="circuitPackageImport" type="button">Import circuit ZIP</button><button id="circuitPackageZip" type="button">Export circuit ZIP</button><span id="circuitPackageTopStatus" title="Circuit package status"></span>`;fileActions.appendChild(top);

  const pane=document.createElement('div');pane.id='circuitAuxPane';pane.hidden=true;pane.innerHTML=`
    <div id="circuitMapControls" class="toolGroup" hidden><div class="toolGroupTitle">Regional map arrow</div><label>Regional map <select id="circuitMapId">${REGIONAL_MAPS.map(m=>`<option value="${m.id}">${m.id} · ${m.name}</option>`).join('')}</select></label><div id="circuitArrowChoices"></div><details><summary>Raw game coordinates</summary><div class="circuitAuxGrid"><label>Arrow X <input id="circuitMarkerX" type="number"></label><label>Arrow Y <input id="circuitMarkerY" type="number"></label><label class="circuitAuxWide">Frame <input id="circuitMarkerFrame" type="number" min="0" max="3"></label></div><button id="circuitMapApply" type="button">Apply raw fields</button></details><div id="circuitAuxStatus" class="muted"></div><div class="muted">Retail USA is read directly from Disk.1. Added regional maps are bundled with the editor. Drag the arrow tip directly on the enlarged map. Game map rectangle: x 240–317, y 1–47.</div></div>
    <div id="circuitPreviewControls" class="toolGroup" hidden><div class="toolGroupTitle">78×51 miniature circuit</div><div class="circuitToolRow"><button data-preview-tool="pencil" type="button">Pencil</button><button data-preview-tool="line" type="button">Line</button><button data-preview-tool="rect" type="button">Rect</button><button data-preview-tool="fill" type="button">Fill</button><button data-preview-tool="pick" type="button" title="Pick a colour from the miniature">Pick</button></div><label>Brush <input id="circuitPreviewBrush" type="range" min="1" max="5" step="1" value="1"> <span id="circuitPreviewBrushText">1</span></label><div id="circuitPreviewPalette"></div><div class="toolGroupTitle">Templates</div><div class="circuitTemplateGrid"><button data-preview-template="arrow" type="button">Arrow</button><button data-preview-template="pitbox_blue" type="button">Pit box Blue</button><button data-preview-template="pitbox_red" type="button">Pit box Red</button><button data-preview-template="pitbox_white" type="button">Pit box White</button><button data-preview-template="pitbox_yellow" type="button">Pit box Yellow</button><button data-preview-template="startline" type="button">Start line</button><button data-preview-template="tower" type="button">Lap tower</button></div><div class="circuitTemplateTransform"><button data-template-rotation="0" type="button">0°</button><button data-template-rotation="90" type="button">90°</button><button data-template-rotation="180" type="button">180°</button><button data-template-rotation="270" type="button">270°</button><button id="circuitTemplateFlipH" type="button">Flip H</button><button id="circuitTemplateFlipV" type="button">Flip V</button></div><div id="circuitTemplateState"></div><div class="raceSetupActions"><button id="circuitPreviewUndo" type="button">Undo</button><button id="circuitPreviewRevert" type="button">Restore loaded</button></div><div class="raceSetupActions"><button id="circuitPreviewBlank" type="button">New blank miniature</button><button id="circuitPreviewFromBackdrop" type="button">From backdrop</button></div><div id="circuitAuxStatusMini" class="muted"></div><div class="muted">Pick samples a colour directly from the miniature. From backdrop shrinks the current 320×224 gameplay image to 78×51 using the project Race → Garage mapping. Templates are embedded in the app. For authored MiniMaps, colour 8 is transparent so colour 0 remains usable as black. Right-click paints the current MiniMap transparency colour.</div></div>`;
  buttons.insertAdjacentElement('afterend',pane);
  const stack=viewerStack();if(getComputedStyle(stack).position==='static')stack.style.position='relative';const cv=document.createElement('canvas');cv.id='circuitAuxCanvas';cv.hidden=true;stack.appendChild(cv);
  mapBtn.addEventListener('click',()=>activateAux('map'));miniBtn.addEventListener('click',()=>activateAux('mini'));buttons.addEventListener('click',e=>{if(e.target!==mapBtn&&e.target!==miniBtn&&e.target.closest('button'))deactivateAux();},true);
  $('circuitNumber').addEventListener('change',e=>{try{setCurrentCircuitIndex(Number(e.target.value));refreshUi();}catch(err){status(`ERROR: ${err.message}`);}});$('circuitMapId').addEventListener('change',e=>{setCurrentMapId(Number(e.target.value));refreshUi();});$('circuitMapApply').addEventListener('click',applyMapFields);$('circuitPackageImport').addEventListener('click',()=>$('circuitPackageInput').click());$('circuitPackageInput').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importCircuitZip(f);e.target.value='';});$('circuitPackageZip').addEventListener('click',exportZip);
  $('trackSelect')?.addEventListener('change',packageSelectionCapture,true);
  document.querySelectorAll('[data-preview-tool]').forEach(b=>b.addEventListener('click',()=>{previewTool=b.dataset.previewTool;syncPreviewToolButtons();}));document.querySelectorAll('[data-preview-template]').forEach(b=>b.addEventListener('click',()=>{previewTemplateKey=b.dataset.previewTemplate;previewTool='template';syncPreviewToolButtons();}));document.querySelectorAll('[data-template-rotation]').forEach(b=>b.addEventListener('click',()=>{previewTemplateRotation=Number(b.dataset.templateRotation)||0;previewTool='template';syncPreviewToolButtons();}));$('circuitTemplateFlipH')?.addEventListener('click',()=>{previewTemplateFlipH=!previewTemplateFlipH;previewTool='template';syncPreviewToolButtons();});$('circuitTemplateFlipV')?.addEventListener('click',()=>{previewTemplateFlipV=!previewTemplateFlipV;previewTool='template';syncPreviewToolButtons();});syncPreviewToolButtons();$('circuitPreviewBrush').addEventListener('input',e=>{previewBrush=Number(e.target.value);$('circuitPreviewBrushText').textContent=String(previewBrush);});$('circuitPreviewUndo').addEventListener('click',previewUndoOnce);$('circuitPreviewRevert').addEventListener('click',previewRevert);$('circuitPreviewBlank').addEventListener('click',previewBlank);$('circuitPreviewFromBackdrop').addEventListener('click',previewFromBackdrop);
  cv.addEventListener('pointerdown',e=>{if(auxMode==='map'&&e.button===0){dragMarker=true;cv.setPointerCapture?.(e.pointerId);mapDrag(e);}else if(auxMode==='mini'&&(e.button===0||e.button===2))beginPreview(e);});cv.addEventListener('pointermove',e=>{mapDrag(e);movePreview(e);});cv.addEventListener('pointerup',e=>{if(auxMode==='map'){dragMarker=false;refreshUi();}endPreview(e);});cv.addEventListener('pointercancel',e=>{dragMarker=false;endPreview(e);});cv.addEventListener('contextmenu',e=>{if(auxMode==='mini')e.preventDefault();});
  $('trackSelect')?.addEventListener('change',()=>setTimeout(()=>{markerGraphics=null;refreshUi();},0));$('editorScale')?.addEventListener('input',()=>setTimeout(renderAux,0));document.addEventListener('indyheat-race-setup-capture',e=>{if(e.detail?.type==='model')resetPackageSession();setTimeout(()=>{refreshUi();setupRaceIntegration();},0);});ensureLapContract();refreshUi();let raceTries=0;const raceTimer=setInterval(()=>{raceTries++;if(setupRaceIntegration()||raceTries>200)clearInterval(raceTimer);},50);
  const title=document.querySelector('header h1');if(title)title.textContent=title.textContent.replace(/v0\.(?:11|12|13|14|15|16|17|18|19(?:\.[12])?)/i,'v0.19.2');document.title=document.title.replace(/v0\.(?:11|12|13|14|15|16|17|18|19(?:\.[12])?)/i,'v0.19.2');return true;
}
function boot(){if(injectUi())return;let tries=0;const t=setInterval(()=>{tries++;if(injectUi()||tries>200)clearInterval(t);},50);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0));else setTimeout(boot,0);

})(typeof globalThis!=='undefined'?globalThis:this);
