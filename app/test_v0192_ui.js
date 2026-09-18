'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const P=require('./circuit-package.js');
const src=fs.readFileSync(path.join(__dirname,'circuit-package.js'),'utf8');

// Mini-map editor: picker, compact Rect label, persistent active-state sync and
// one-click backdrop reduction/recolouring.
assert(src.includes('data-preview-tool="pick"'));
assert(src.includes('>Rect</button>'));
assert(src.includes('function syncPreviewToolButtons()'));
assert(src.includes('circuitPreviewFromBackdrop'));
assert(src.includes('function previewFromBackdrop()'));
assert(src.includes('previewPixelsFromBackdrop'));
assert(src.includes('backdrop colour 0 is recoloured'));
assert(src.includes('.circuitToolRow button.active'));

// Pure backdrop -> 78x51 generation contract. A uniform transparent-source
// backdrop must become the selected non-zero replacement rather than holes.
const bg0=new Uint8Array(320*256);
const mini0=P.previewPixelsFromBackdrop(bg0,{zeroReplacement:12});
assert.equal(mini0.length,78*51);
assert(mini0.every(v=>v===12));
const bg5=new Uint8Array(320*256);bg5.fill(5);
const mini5=P.previewPixelsFromBackdrop(bg5,{zeroReplacement:12});
assert(mini5.every(v=>v===5));

// Approved digits.iff two-tone masks are carried literally, not browser text.
assert.deepEqual(P.HUD_DIGITS[0],[[5,2],[0,5],[5,0],[0,5],[5,2]]);
assert.deepEqual(P.HUD_DIGITS[9],[[5,2],[0,5],[5,2],[0,1],[5,2]]);
assert.deepEqual(P.GAME_HUD_DIGITS[0],[0x3E,0x22,0x22,0x22,0x22,0x22,0x3E]);
assert.deepEqual(P.GAME_HUD_DIGITS[4],[0x22,0x22,0x22,0x3E,0x02,0x02,0x02]);
assert(src.includes('drawGameHudDigit'));
assert(src.includes('HUD_LAYOUT.currentLapRows'));
assert(src.includes('HUD_LAYOUT.timerDigits'));
assert(src.includes('drawLapTotal99'));
assert(src.includes('LAP_TOTAL_ORIGIN'));
assert(src.includes('race+$24/+26: the true top-left'));
assert(src.includes('HUD_CAR_COLOURS'));

// HUD is no longer a standalone navigation mode; it is integrated into Race.
assert(!src.includes("hudBtn.id='layerEditHud'"));
assert(src.includes("controls.id='circuitRaceHudControls'"));
assert(src.includes("c.id='circuitRaceHudCanvas'"));
assert(src.includes('installRaceHudPointerBridge'));
assert(src.includes("'circuitShowCurrentLaps','Current-lap tower'"));
assert(src.includes("'circuitShowTotalLaps','Total laps'"));
assert(src.includes("'circuitShowTimer','Timer'"));
assert(src.includes("'circuitShowFlag','Flag man'"));
assert(src.includes("'circuitShowStart','Start / grid anchor'"));

// Surface / Waypoints plus the new Pits / Race control groups are foldable.
assert(src.includes("sm.textContent='Surface types'"));
assert(src.includes("sm.textContent='Waypoints'"));
assert(src.includes("pits.id='circuitViewPits'"));
assert(src.includes("rc.id='circuitViewRaceControl'"));

// Overlay-opacity control is hidden only for full-screen Map / Mini-map modes;
// Race keeps and shares it with pits/cars/HUD.
assert(src.includes('function setOverlayOpacityVisible(show)'));
assert(src.includes('setOverlayOpacityVisible(false)'));
assert(src.includes("raceBtn.addEventListener('click',()=>setTimeout(()=>{setOverlayOpacityVisible(true)"));

console.log('Indy Heat v0.19.2 mini-map / Race-HUD UI checks OK');
