;*---------------------------------------------------------------------------
;  :Program.	IndyHeat.asm
;  :Contents.	Slave for "Indy Heat" from Sales Curve
;  :Author.	Mr.Larmer of Wanted Team
;  :History.	26.04.1999
;  		10.08.2020 - minor bug on specific systems requires rebuild
;  :Requires.	-
;  :Copyright.	Public Domain
;  :Language.	68000 Assembler
;  :Translator.	Devpac 3.14
;  :To Do.
;---------------------------------------------------------------------------*


;
; Development 1.3 test 22 corrected lap-specific tower calling convention:
; - preserve the 1.21 WHDLoad v17 header and original CUSTOM1 trainer options;
; - CUSTOM2=1 enters PL_CUSTOMTRACKS, which chains to pl_boot with PL_NEXT;
; - CUSTOM2<>1 starts directly at pl_boot;
; - preserve playlist v1 exactly: physical Track IDs 1..10 plus lap override;
; - add playlist v2: zero-based circuit indexes 0..99 plus lap override;
; - v2 circuit_00..09 select the ten proven retail physical templates;
; - v2 circuit_10..99 load the matching editor package folder and infer its
;   structural retail template from the three IHWP waypoint route counts;
; - test 17 deliberately keeps custom waypoint/pit data at the retail template
;   runtime addresses; test 16 private relocation is disabled after runtime failure;
; - this proof prioritises retail address compatibility over concurrent custom
;   circuits sharing the same structural template;
; - all eight editor package files are consumed when valid: background,
;   foreground, surface, recovery, preview, waypoints, race_setup, presentation;
; - explicit playlist lap override is applied last; for a custom event $FFFF
;   retains the package-authored race_setup lap total;
; - malformed playlist/header/custom waypoint topology fails closed before any
;   race-record write; individual optional package components fail closed;
; - retain the runtime-proven 0-99 lap compositor and regional-map replacement;
; - in CUSTOM2=1 only, move the retail reserved live-lap states 13/14 to
;   100/101 so extended gameplay lap values do not collide with finish state;
; - leave the shared timer/current-lap renderer at $6B02 completely untouched;
; - patch only the lap-specific tail-call at $69C8/$69CC;
; - preserve the shared renderer A5-A6 MOVEM calling convention exactly;
; - keep retail lap rendering literally unchanged for values 0..12;
; - extend only 13..19 with the proved retail double-digit construction;
; - map numeric 20 and the relocated finish state to the original retail F;
; - map the relocated secondary terminal state to the original solid square;
; - cap the supported custom race length at 20 laps.
;
; Playlist v1 ($34 bytes, big endian):
;   +00.l "IHPL"  +04.w version=1  +06.w count=11
;   +08: 11 x { Track ID.w 1..10, laps.w ($FFFF=inherit destination event) }
;
; Playlist v2 ($34 bytes, big endian):
;   +00.l "IHPL"  +04.w version=2  +06.w count=11
;   +08: 11 x { circuit index.w 0..99, laps.w ($FFFF=inherit) }
;
; Development versioning for this work is "1.3 test N".  The final release
; number remains 1.3; test numbering is not a separate release series.
;---------------------------------------------------------------------------*

RACE_RUNTIME_BASE       EQU     $5902           ; main+$4902 plus runtime $1000
RACE_RECORD_SIZE        EQU     $82
RACE_RECORD_COUNT       EQU     11
RACE_SETUP_SIZE         EQU     $68
PIT_LONG_COUNT_MINUS1   EQU     21              ; $58 / 4 = 22 longs -> DBF 21
TRACK_COUNT             EQU     10
TRACK_TEMPLATE_SIZE     EQU     TRACK_COUNT*RACE_RECORD_SIZE
PLAYLIST_VERSION_V1     EQU     1
PLAYLIST_VERSION_V2     EQU     2
PLAYLIST_MAX_CIRCUIT    EQU     99
PLAYLIST_SIZE           EQU     $34             ; 8 + 11*4
PLAYLIST_MAGIC          EQU     $4948504C        ; "IHPL" file signature
PLAYLIST_INHERIT_LAPS   EQU     $FFFF
CUSTOM_MAX_LAPS         EQU     20              ; 1-19 numeric, final lap uses F
CUSTOM_FINISH_STATE     EQU     100             ; retail uses 13
CUSTOM_LAP_SENTINEL_2   EQU     101             ; retail uses 14; exact secondary meaning still unresolved
CURRENT_LAP_MASK_BASE   EQU     $6AEC           ; retail seven-byte single mask
CURRENT_LAP_MASK_INDEX  EQU     $6B78           ; retail 16-word mask-offset table
CURRENT_LAP_GLYPH_BASE  EQU     $6EA4           ; retail 16 x eight-byte glyph slots
CURRENT_LAP_MASK_DOUBLE EQU     CURRENT_LAP_MASK_BASE+7
CURRENT_LAP_MASK_SQUARE EQU     CURRENT_LAP_MASK_BASE+14
CURRENT_LAP_GLYPH_F     EQU     CURRENT_LAP_GLYPH_BASE+(13*8)
CURRENT_LAP_GLYPH_SQUARE EQU    CURRENT_LAP_GLYPH_BASE+(14*8)
CURRENT_LAP_GLYPH_BLANK EQU     CURRENT_LAP_GLYPH_BASE+(15*8)
CUSTOM_NAME_BUFFER_SIZE EQU     128
TRACK_BACKGROUND_SIZE   EQU     $C800
RESOURCE_TABLE_RUNTIME  EQU     $4C6A
RESOURCE_ENTRY_SIZE     EQU     22
RESOURCE_ENTRY_COUNT    EQU     108
REGION_MAP_COUNT        EQU     8
REGION_SELECTOR_SIZE    EQU     RACE_RECORD_COUNT
REGION_MAP_RESOURCE_ID  EQU     $16
REGION_MAP_RESOURCE_SIZE EQU    $20B6
REGION_MAP_FRAME_OFFSET EQU     $177C
REGION_MAP_BOB_SIZE     EQU     $093A
CIRCUIT_PACKAGE_COUNT   EQU     TRACK_COUNT
CIRCUIT_PATH_BUFFER_SIZE EQU    48
CIRCUIT_WAYPOINT_BUFFER_SIZE EQU $0800
CIRCUIT_PRESENTATION_SIZE EQU   $14
CIRCUIT_PRESENTATION_MAGIC EQU  $49485052        ; "IHPR"
CIRCUIT_PRESENTATION_VERSION EQU 2
CIRCUIT_WAYPOINT_MAGIC EQU      $49485750        ; "IHWP"
CIRCUIT_WAYPOINT_VERSION EQU    1
CIRCUIT_WAYPOINT_ROUTES EQU     3
CUSTOM_WAYPOINT_SLOT_SIZE EQU   $0600
CUSTOM_PIT_SLOT_SIZE    EQU     $58

	INCDIR	Includes:
	INCLUDE	whdload.i
	INCLUDE	whdmacros.i


	IFD BARFLY
	OUTPUT	IndyHeat.slave
	BOPT	O+				;enable optimizing
	BOPT	OG+				;enable optimizing
	BOPT	ODd-				;disable mul optimizing
	BOPT	ODe-				;disable mul optimizing
	BOPT	w4-				;disable 64k warnings
	BOPT	wo-			;disable optimizer warnings
	SUPER
	ENDC

;USE_FASTMEM
CHIPMEMSIZE = $80000
EXPMEMSIZE = $0

;======================================================================

_base
		SLAVE_HEADER		;ws_Security + ws_ID
		dc.w	17		;ws_Version
;;		dc.w	WHDLF_NoError|WHDLF_EmulTrap	;ws_flags
		dc.w	WHDLF_NoError
		IFD	USE_FASTMEM
		dc.l	CHIPMEMSIZE		;ws_BaseMemSize
		ELSE
		dc.l	CHIPMEMSIZE+EXPMEMSIZE
		ENDC
		dc.l	0		;ws_ExecInstall
		dc.w	start-_base	;ws_GameLoader
		dc.w	0		;ws_CurrentDir
		dc.w	0		;ws_DontCache
_keydebug	dc.b	$0		;ws_keydebug
_keyexit	dc.b	$5D		;ws_keyexit = '*'
_expmem	
	IFD	USE_FASTMEM	
	dc.l	EXPMEMSIZE			;ws_ExpMem
	ELSE
	dc.l	0
	ENDC
		dc.w	_name-_base		;ws_name
		dc.w	_copy-_base		;ws_copy
		dc.w	_info-_base		;ws_info
		dc.w	0			; ws_kickname
		dc.l	0			; ws_kicksize
		dc.w	0			; ws_kickcrc
		dc.w	_config-_base		

_config:	dc.b    "C1:X:Infinite coins:0;"	; ws_config;
		dc.b    "C1:X:No $150k bonus for coin use:1;"
		dc.b    "C2:B:Custom track mode;"
		dc.b    0

;============================================================================

	IFD BARFLY
	DOSCMD	"WDate  >T:date"
	ENDC


DECL_VERSION:MACRO
	dc.b	"1.3 test 22"
	IFD BARFLY
		dc.b	" "
		INCBIN	"T:date"
	ENDC
	ENDM


_name		dc.b	"Indy Heat"
		dc.b	0
_copy		dc.b	"1992 The Sales Curve",0
_info		dc.b	"Adapted & fixed by Mr Larmer & JOTD",10
		dc.b	"Trainer by Hungry Horace",10,10
		dc.b	"Version "
		DECL_VERSION
		dc.b	0
		even

; version xx.slave works

	dc.b	"$","VER: slave "
	DECL_VERSION
	dc.b	$A,$D,0
	even

;======================================================================

start	;	A0 = resident loader
;======================================================================

		lea	_resload(pc),a1
		move.l	a0,(a1)			;save for later use

		lea	$1000.w,a7

		lea	Tags(pc),a0
		move.l	_resload(pc),a2
		jsr	resload_Control(a2)

	; check version

		lea	$30000,A0
		moveq	#0,D0
		move.l	#$1600,D1
		moveq	#1,d2
		bsr.w	_LoadDisk

		move.l	#$1600,D0
		move.l	_resload(pc),a2
		jsr	resload_CRC16(a2)

		cmp.w	#$8261,D0
		bne.b	.not_support

		move.w	#$C0,$302C6
		patch	$C0,patch_boot

		lea	$30600,A0
		move.l	#$2C00,D0
		move.l	#$8E00,D1
		moveq	#1,d2
		bsr.w	_LoadDisk

		bsr	_flushcache

		jsr	$30316		; decrunch

		lea	(a0),a4

		bsr	_flushcache

		jmp	$302B2
.not_support
		subq.l	#8,a7
		pea	TDREASON_WRONGVER.w
		move.l	_resload(pc),-(a7)
		addq.l	#resload_Abort,(a7)
		rts

;--------------------------------

Tags
		dc.l	WHDLTAG_CUSTOM1_GET
_custom1
		dc.l	0
		dc.l	WHDLTAG_CUSTOM2_GET
_custom2
		dc.l	0
		dc.l	TAG_DONE,TAG_DONE
		EVEN

;--------------------------------

patch_boot
	; Legacy one-for-one per-event setup overrides remain independent of
	; CUSTOM2 and are applied before either patch-list entry point.
	bsr.w	load_race_setups

	; CUSTOM2=1 selects the custom-track entry list.  Any other value uses
	; only the normal/common patch list.  Playlist processing is likewise
	; performed only on the explicit custom-track path.
	move.l	_custom2(pc),d0
	cmp.l	#1,d0
	bne.b	.retail_patches

	; Initialise event-local map choices first.  A custom package presentation
	; may then override its own event without being erased afterwards.
	bsr.w	load_region_selector
	bsr.w	apply_playlist
	bsr.w	apply_circuit_packages
	lea	PL_CUSTOMTRACKS(pc),a0
	bra.b	.apply_patches

.retail_patches
	lea	pl_boot(pc),a0

.apply_patches
	sub.l	a1,a1
	move.l	_resload(pc),a2
	jsr	resload_Patch(a2)
	bsr	_flushcache

	jmp	$1050.w


;---------------------------------------------------------------------------
; CUSTOM2=1 ONLY
;
; This is the dedicated entry patch list for custom-track work.
;
; Test 15 combines the two runtime-proven custom-mode branches without
; changing either proven draw/load mechanism:
;
; - Test 14 hook at $66C2 composes the requested total into the existing
;   retail frame-0 live payload, then resumes the untouched $66CA renderer.
; - Test 5 regional-map replacement stays inside the existing common $BDE4
;   Load hook, exact-CUSTOM2=1 gated, because that hook is shared by retail and
;   custom modes and PL_NEXT would overwrite a second patch at the same site.
;
; Gasoline Alley lap text still needs no patch: it reads race+$28 directly and
; passes the value to the normal numeric formatter at $6F24.
;
; PL_NEXT terminates this list and continues with the normal/common pl_boot.
;---------------------------------------------------------------------------

PL_CUSTOMTRACKS
	PL_START

	; Replace the lap-value load plus unsafe retail 8-12 lookup (8 bytes).
	; PL_PSS emits the JSR at $66C2 and skips the final two bytes so RTS resumes
	; at the untouched $66CA LEA $4270,A0.
	PL_PSS	$66C2,custom_lap_total,2

	; Retail race logic reserves live lap/state values 13 and 14.  That is
	; harmless for original 8..12-lap races but collides with authored totals
	; above 12.  Keep retail mode untouched; in CUSTOM2=1 move those sentinels
	; above the supported authored range (1..20).
	;
	; $A3EA: CMPI.W #13,$26(A4)  -> finished-state test
	;          immediate word is at $A3EC
	PL_W	$A3EC,CUSTOM_FINISH_STATE
	;
	; $AA32: CMPI.W #14,D0       -> second reserved-state test
	;          immediate word is at $AA34
	PL_W	$AA34,CUSTOM_LAP_SENTINEL_2
	;
	; $AA42: MOVEQ #13,D0        -> state written when D0 == race+$28
	;          immediate byte is at $AA43; MOVEQ #100 remains valid signed-8-bit
	PL_B	$AA43,CUSTOM_FINISH_STATE

	; Current-lap tower only.  $69B8 prepares the race HUD position and reads
	; the racer's live lap/state from $26(A0).  At $69C8 retail loads the
	; racer colour/source pointer from $28(A0), then tail-branches to $6B02.
	; Replace exactly those final 8 bytes.  The timer's $6A22->$6B02 path
	; remains byte-for-byte untouched.
	PL_PSS	$69C8,custom_current_lap_dispatch,2

	PL_NEXT	pl_boot



;---------------------------------------------------------------------------
; CUSTOM CURRENT-LAP TOWER — TEST 22
;
; Proven call paths:
;
; TIMER
;   $6A0A increments A6+$42B8/$42B6/$42B4 as three decimal timer digits.
;   $6A22 reads those digits and tail-calls the shared renderer at $6B02.
;
; CURRENT LAP
;   $69B8 loads the active race record from A6+$3DD6.
;   $69BC/$69C0 use race+$24/+26 as the HUD origin.
;   $69C4 reads the racer's live lap/state from $26(A0) into D2.
;   $69C8 loads $28(A0) into A0 and $69CC tail-branches to $6B02.
;
; Therefore $6B02 is a shared primitive and remains completely untouched.
; Test 20 patched inside it, which is why the timer was corrupted and the lap
; display appeared to advance incorrectly.
;
; Retail current-lap slots at $6EA4 are:
;   0..9, 10, 11, 12, F, solid square, blank
;
; Original 10..12 prove:
;   double(row) = $40 OR (single_digit(row) >> 1)
;
; Values 0..12 use the original renderer and tables without modification.
; Values 13..19 use new glyphs but the original double-width row mask and the
; untouched colour-aware blitter at $6B1C.
; Numeric 20 and custom finish state 100 use the original F glyph.
; Custom secondary state 101 uses the original solid-square glyph.
;
; Stack contract:
;   $6B02 executes MOVEM.L A5-A6,-(SP) (encoded $48E7,$0006).
;   $6B72 executes MOVEM.L (SP)+,A5-A6 (encoded $4CDF,$6000).
;   Test 21 incorrectly saved D1-D2, so the epilogue restored those values
;   into A5/A6 and corrupted A6 before the next $69B8/$69BC pass.
;   Paths entering directly at $6B1C must therefore save A5-A6 exactly.
;   PL_PSS adds a temporary return address; because retail $69CC was a tail
;   branch, that return is discarded so the renderer RTS returns to the real
;   caller of $69B8.
;---------------------------------------------------------------------------

custom_current_lap_dispatch
	; Replaces:
	;   $69C8  MOVEA.L $28(A0),A0
	;   $69CC  BRA.W   $6B02
	movea.l	$28(a0),a0

	cmp.w	#12,d2
	bls.b	.retail

	cmp.w	#13,d2
	blo.b	.blank
	cmp.w	#19,d2
	bls.b	.extended

	cmp.w	#CUSTOM_MAX_LAPS,d2
	beq.b	.final
	cmp.w	#CUSTOM_FINISH_STATE,d2
	beq.b	.final
	cmp.w	#CUSTOM_LAP_SENTINEL_2,d2
	beq.b	.square
	bra.b	.blank

.retail
	; Preserve the exact retail path.
	addq.l	#4,sp
	jmp	$6B02.w

.extended
	; Preserve original A5/A6 for the shared renderer's restore at $6B72.
	addq.l	#4,sp
	movem.l	a5-a6,-(sp)
	movea.l	a1,a2
	move.l	#CURRENT_LAP_MASK_BASE+7,d5
	sub.w	#13,d2
	lsl.w	#3,d2
	lea	custom_current_lap_13_19(pc),a1
	; $6B1C is the retail ADDA.W D2,A1.  Do not apply the offset twice.
	jmp	$6B1C.w

.final
	addq.l	#4,sp
	movem.l	a5-a6,-(sp)
	movea.l	a1,a2
	move.l	#CURRENT_LAP_MASK_BASE,d5
	lea	CURRENT_LAP_GLYPH_BASE.w,a1
	move.w	#13,d2
	lsl.w	#3,d2
	jmp	$6B1C.w

.square
	addq.l	#4,sp
	movem.l	a5-a6,-(sp)
	movea.l	a1,a2
	move.l	#CURRENT_LAP_MASK_BASE+14,d5
	lea	CURRENT_LAP_GLYPH_BASE.w,a1
	move.w	#14,d2
	lsl.w	#3,d2
	jmp	$6B1C.w

.blank
	addq.l	#4,sp
	movem.l	a5-a6,-(sp)
	movea.l	a1,a2
	move.l	#CURRENT_LAP_MASK_BASE,d5
	lea	CURRENT_LAP_GLYPH_BASE.w,a1
	move.w	#15,d2
	lsl.w	#3,d2
	jmp	$6B1C.w


custom_current_lap_13_19
	dc.b	$5F,$41,$41,$5F,$41,$41,$5F,$00	; 13
	dc.b	$51,$51,$51,$5F,$41,$41,$41,$00	; 14
	dc.b	$5F,$50,$50,$5F,$41,$41,$5F,$00	; 15
	dc.b	$5F,$50,$50,$5F,$51,$51,$5F,$00	; 16
	dc.b	$5F,$41,$41,$41,$41,$41,$41,$00	; 17
	dc.b	$5F,$51,$51,$5F,$51,$51,$5F,$00	; 18
	dc.b	$5F,$51,$51,$5F,$41,$41,$5F,$00	; 19
	even

;---------------------------------------------------------------------------
; CUSTOM ON-TRACK TOTAL-LAPS GRAPHIC — TEST 22 (TEST-14 PROVEN CODE)
;
; The earlier failed experiments manipulated the descriptor path unnecessarily.
; Live debugger evidence establishes a much simpler contract:
;
;   $4270.l -> runtime descriptor array
;   descriptor 0 +$0E.l -> live retail "8" 50-byte pixel payload
;   five planes, five rows, one 16-bit word per row = 50 bytes, plane-major
;
; The descriptor already carries the parsed dimensions/origins/transparency, so
; +$0E is the payload pointer rather than a 62-byte frame-header pointer.
; We therefore reuse one already-valid retail object. D0/D1 positioning,
; descriptor selection and the complete draw path after $66CA are untouched.
;---------------------------------------------------------------------------

custom_lap_total
	; Entry replaces $66C2-$66C9.  A0 is still the active $82-byte race record;
	; D0/D1 already contain the normal retail draw position.
	movem.l	d3-d7/a1-a4,-(a7)

	moveq	#0,d3
	move.w	$28(a0),d3		; requested event total laps

	; Test-19 gameplay/display contract is 1-20; clamp defensively here.
	cmp.w	#CUSTOM_MAX_LAPS,d3
	bls.b	.lap_in_range
	moveq	#CUSTOM_MAX_LAPS,d3
.lap_in_range

	; Resolve the game's OWN valid frame-0 pixel payload:
	;   $4270.l -> descriptor array
	;   descriptor 0 +$0E.l -> 50-byte plane-major payload
	movea.l	$4270.w,a1
	move.l	a1,d7
	tst.l	d7
	beq.w	.draw_frame0
	movea.l	$0E(a1),a1
	move.l	a1,d7
	tst.l	d7
	beq.w	.draw_frame0

	; DIVU result: quotient/tens in low word, remainder/units in high word.
	move.l	d3,d4
	divu	#10,d4
	moveq	#0,d5
	move.w	d4,d5
	swap	d4
	moveq	#0,d6
	move.w	d4,d6

	lea	lap_digit_masks(pc),a2

	; A3 -> tens glyph.  Blank the leading tens cell for a single digit.
	move.l	a2,a3
	tst.w	d5
	bne.b	.have_tens
	moveq	#10,d5
.have_tens
	mulu	#10,d5
	adda.w	d5,a3

	; A4 -> units glyph.
	move.l	a2,a4
	mulu	#10,d6
	adda.w	d6,a4

	; descriptor+$0E already addresses the first payload byte. Test 12's
	; +12 offset only rewrote the tail and produced the observed 0-like result.
	; Rewrite the complete 50-byte plane-major payload in place.
	moveq	#4,d7			; five rows

.row
	; Dark shade ($05), tens x=1..3 then units x=5..7.
	moveq	#0,d3
	move.b	(a3)+,d3
	lsl.w	#8,d3
	lsl.w	#4,d3

	; Light shade ($06).
	moveq	#0,d4
	move.b	(a3)+,d4
	lsl.w	#8,d4
	lsl.w	#4,d4

	moveq	#0,d5
	move.b	(a4)+,d5
	lsl.w	#8,d5
	or.w	d5,d3

	moveq	#0,d6
	move.b	(a4)+,d6
	lsl.w	#8,d6
	or.w	d6,d4

	; Source colours:
	;   field $01 = plane0 set
	;   shade $05 = planes0+2
	;   shade $06 = planes1+2
	; Valid 9 pixels occupy word bits 15..7.
	move.w	#$FF80,d5
	move.w	d4,d6
	not.w	d6
	and.w	d6,d5

	move.w	d5,(a1)		; plane 0
	move.w	d4,10(a1)		; plane 1
	or.w	d3,d4
	move.w	d4,20(a1)		; plane 2
	clr.w	30(a1)			; plane 3
	clr.w	40(a1)			; plane 4
	addq.l	#2,a1
	dbf	d7,.row

.draw_frame0
	moveq	#0,d2			; always select the modified retail "8" slot
	movem.l	(a7)+,d3-d7/a1-a4
	rts


; Per digit: five rows of [dark-mask, light-mask], each three bits wide.
; Derived directly from the supplied digits.iff.
lap_digit_masks
	; 0
	dc.b	$05,$02,$00,$05,$05,$00,$00,$05,$05,$02
	; 1
	dc.b	$02,$00,$00,$02,$00,$02,$00,$02,$02,$00
	; 2
	dc.b	$05,$02,$00,$01,$05,$02,$00,$04,$05,$02
	; 3
	dc.b	$05,$02,$00,$01,$05,$02,$00,$01,$05,$02
	; 4
	dc.b	$05,$00,$00,$05,$05,$02,$00,$01,$01,$00
	; 5
	dc.b	$05,$02,$00,$04,$05,$02,$00,$01,$05,$02
	; 6
	dc.b	$05,$02,$00,$04,$05,$02,$00,$05,$05,$02
	; 7
	dc.b	$05,$02,$00,$01,$01,$00,$00,$01,$01,$00
	; 8
	dc.b	$05,$02,$00,$05,$05,$02,$00,$05,$05,$02
	; 9
	dc.b	$05,$02,$00,$05,$05,$02,$00,$01,$05,$02
	; blank tens glyph
	dc.b	$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
	even


;---------------------------------------------------------------------------
; COMMON PATCHES
;
; Applied in both retail and custom-track modes.  CUSTOM2<>1 starts directly
; here; CUSTOM2=1 reaches it through PL_CUSTOMTRACKS above.
;
; $BDE4 -> Load is deliberately common because it is the WHDLoad replacement
; for the game's disk/save access point in both modes.  The custom background
; override is therefore gated inside that shared access routine; placing a
; second $BDE4 patch in PL_CUSTOMTRACKS would be overwritten when PL_NEXT
; continues into this list.
;---------------------------------------------------------------------------

pl_boot
	PL_START

	PL_R	$89EE	; JOTD: was RTE
	PL_P	$9918,patch_main

; BB4C - decrunch proc
; keyboard must be fixed

	PL_PS	$9D24,kb_int
	PL_P	$BDE4,Load
	PL_END

kb_int
	movem.l	D0,-(A7)

	; quit key on 68000 / NOVBRMOVE

	move.b	$bfec01,d0
	not.b	d0
	ror.b	#1,d0
	cmp.b	_keyexit(pc),d0
	bne.b	.noquit

	pea	TDREASON_OK
	move.l	_resload(pc),-(a7)
	addq.l	#resload_Abort,(a7)
	rts
.noquit

	bset	#6,$BFEE01
	moveq.l	#2,D0
	bsr	beamdelay
	bclr	#6,$BFEE01
	movem.l	(A7)+,D0
	rts

; < D0: numbers of vertical positions to wait
beamdelay
.bd_loop1
	move.w  d0,-(a7)
        move.b	$dff006,d0	; VPOS
.bd_loop2
	cmp.b	$dff006,d0
	beq.s	.bd_loop2
	move.w	(a7)+,d0
	dbf	d0,.bd_loop1
	rts

;---------------------------------------------------------------------------
; Compact per-event setup override (legacy editor/runtime path).
;---------------------------------------------------------------------------

load_race_setups
	movem.l	d0-d7/a0-a6,-(a7)

	lea	race_setup_names(pc),a4
	lea	RACE_RUNTIME_BASE.w,a3
	moveq	#RACE_RECORD_COUNT-1,d7

.next_race
	moveq	#0,d0
	move.w	(a4)+,d0
	lea	race_setup_names(pc),a0
	adda.w	d0,a0
	move.l	a0,a5
	move.l	_resload(pc),a2
	jsr	resload_GetFileSize(a2)
	cmp.l	#RACE_SETUP_SIZE,d0
	bne.b	.skip_race

	move.l	a5,a0
	lea	race_setup_buffer(pc),a1
	move.l	_resload(pc),a2
	jsr	resload_LoadFile(a2)

	lea	race_setup_buffer(pc),a0

	move.w	(a0)+,$28(a3)		; laps
	move.l	(a0)+,$5C(a3)		; flag X/Y
	move.l	(a0)+,$62(a3)		; start X 16.16
	move.l	(a0)+,$66(a3)		; start Y 16.16
	move.w	(a0)+,$6A(a3)		; orientation/mirror

	move.l	$32(a3),a1
	moveq	#PIT_LONG_COUNT_MINUS1,d6
.copy_pits
	move.l	(a0)+,(a1)+
	dbf	d6,.copy_pits

.skip_race
	lea	RACE_RECORD_SIZE(a3),a3
	dbf	d7,.next_race

	movem.l	(a7)+,d0-d7/a0-a6
	rts

race_setup_names
	dc.w	race_setup_r01-race_setup_names
	dc.w	race_setup_r02-race_setup_names
	dc.w	race_setup_r03-race_setup_names
	dc.w	race_setup_r04-race_setup_names
	dc.w	race_setup_r05-race_setup_names
	dc.w	race_setup_r06-race_setup_names
	dc.w	race_setup_r07-race_setup_names
	dc.w	race_setup_r08-race_setup_names
	dc.w	race_setup_r09-race_setup_names
	dc.w	race_setup_r10-race_setup_names
	dc.w	race_setup_r11-race_setup_names

race_setup_r01	dc.b	"indyheat_r01_setup.bin",0
race_setup_r02	dc.b	"indyheat_r02_setup.bin",0
race_setup_r03	dc.b	"indyheat_r03_setup.bin",0
race_setup_r04	dc.b	"indyheat_r04_setup.bin",0
race_setup_r05	dc.b	"indyheat_r05_setup.bin",0
race_setup_r06	dc.b	"indyheat_r06_setup.bin",0
race_setup_r07	dc.b	"indyheat_r07_setup.bin",0
race_setup_r08	dc.b	"indyheat_r08_setup.bin",0
race_setup_r09	dc.b	"indyheat_r09_setup.bin",0
race_setup_r10	dc.b	"indyheat_r10_setup.bin",0
race_setup_r11	dc.b	"indyheat_r11_setup.bin",0
	even

race_setup_buffer
	ds.b	RACE_SETUP_SIZE
	even

;---------------------------------------------------------------------------
; Editor circuit package runtime bridge — TEST 16.
;
; v0.19 exports a binary-only folder:
;
;   circuit_00/background.bin
;             /foreground.bin
;             /surface.bin
;             /recovery.bin
;             /preview.bin
;             /waypoints.bin
;             /race_setup.bin
;             /presentation.bin
;
; circuit_00..09 remain direct substitutes for the ten proven physical retail
; templates.  Playlist v2 additionally selects circuit_10..99.  Those custom
; events are prepared by apply_playlist with private pit/waypoint storage; this
; stock-package pass deliberately skips them.
;
; Boot-time sidecars:
;   race_setup.bin    exact $68 legacy compact layout
;   presentation.bin  IHPR v2 / $14
;   waypoints.bin     IHWP v1, three route payloads
;
; Decompressed resources are replaced through the same proven deferred Load
; mechanism already used by the background and regional-map tests. External
; file size must exactly match the resource-directory outLen or retail data is
; retained. Package data is loaded after the legacy background override, so a
; valid circuit package wins when both are deliberately present.
;---------------------------------------------------------------------------

apply_circuit_packages
	movem.l	d0-d7/a0-a6,-(a7)

	lea	preview_resource_ids(pc),a0
	moveq	#TRACK_COUNT-1,d0
.clear_preview
	move.w	#$FFFF,(a0)+
	dbf	d0,.clear_preview

	lea	RACE_RUNTIME_BASE.w,a3
	moveq	#0,d4			; processed-waypoint bit mask
	moveq	#0,d7			; championship event index
	moveq	#RACE_RECORD_COUNT-1,d6

.next_event
	; A playlist-v2 custom-library event has already consumed its circuit_10+
	; sidecars and must not be reinterpreted as its structural circuit_00..09.
	move.w	d7,d0
	add.w	d0,d0
	lea	custom_circuit_by_event(pc),a0
	cmp.w	#$FFFF,0(a0,d0.w)
	bne.b	.advance

	bsr.w	race_circuit_index
	tst.w	d0
	bmi.b	.advance

	move.w	d0,d5			; physical circuit index 0..9
	bsr.w	capture_preview_resource_id

	move.w	d5,d0
	bsr.w	apply_circuit_setup

	move.w	d5,d0
	move.w	d7,d1
	bsr.w	apply_circuit_presentation

	btst	d5,d4
	bne.b	.advance
	bset	d5,d4
	move.w	d5,d0
	bsr.w	apply_circuit_waypoints

.advance
	lea	RACE_RECORD_SIZE(a3),a3
	addq.w	#1,d7
	dbf	d6,.next_event

	movem.l	(a7)+,d0-d7/a0-a6
	rts


; IN: A3 = active $82-byte race record
; OUT: D0.w = physical circuit index 0..9, or -1
race_circuit_index
	move.l	$36(a3),d1
	lea	circuit_entry_ptrs(pc),a0
	moveq	#0,d0
	moveq	#TRACK_COUNT-1,d2
.loop
	cmp.l	(a0)+,d1
	beq.b	.found
	addq.w	#1,d0
	dbf	d2,.loop
	moveq	#-1,d0
.found
	rts


circuit_entry_ptrs
	dc.l	RESOURCE_TABLE_RUNTIME+2+($39*RESOURCE_ENTRY_SIZE)
	dc.l	RESOURCE_TABLE_RUNTIME+2+($3D*RESOURCE_ENTRY_SIZE)
	dc.l	RESOURCE_TABLE_RUNTIME+2+($41*RESOURCE_ENTRY_SIZE)
	dc.l	RESOURCE_TABLE_RUNTIME+2+($45*RESOURCE_ENTRY_SIZE)
	dc.l	RESOURCE_TABLE_RUNTIME+2+($49*RESOURCE_ENTRY_SIZE)
	dc.l	RESOURCE_TABLE_RUNTIME+2+($4D*RESOURCE_ENTRY_SIZE)
	dc.l	RESOURCE_TABLE_RUNTIME+2+($5A*RESOURCE_ENTRY_SIZE)
	dc.l	RESOURCE_TABLE_RUNTIME+2+($5E*RESOURCE_ENTRY_SIZE)
	dc.l	RESOURCE_TABLE_RUNTIME+2+($62*RESOURCE_ENTRY_SIZE)
	dc.l	RESOURCE_TABLE_RUNTIME+2+($66*RESOURCE_ENTRY_SIZE)

circuit_base_resource_ids
	dc.w	$39,$3D,$41,$45,$49,$4D,$5A,$5E,$62,$66


; IN: D0.w circuit index, A3 race record. Preserves caller registers.
capture_preview_resource_id
	movem.l	d0-d3/a0-a1,-(a7)

	moveq	#0,d3
	move.w	d0,d3
	add.w	d3,d3
	lea	preview_resource_ids(pc),a1
	move.w	#$FFFF,0(a1,d3.w)

	movea.l	$46(a3),a0
	move.l	a0,d1
	beq.b	.done

	move.l	6(a0),d1
	sub.l	#RESOURCE_TABLE_RUNTIME+2,d1
	bmi.b	.done

	move.l	d1,d2
	divu	#RESOURCE_ENTRY_SIZE,d2
	move.l	d2,d1
	swap	d1
	tst.w	d1
	bne.b	.done
	cmp.w	#RESOURCE_ENTRY_COUNT,d2
	bhs.b	.done

	move.w	d2,0(a1,d3.w)

.done
	movem.l	(a7)+,d0-d3/a0-a1
	rts


; IN: D0.w circuit index, A1 -> zero-terminated leaf name
; OUT: A0 -> shared circuit_path_buffer
build_circuit_path
	movem.l	d1-d3/a1-a3,-(a7)

	lea	circuit_path_buffer(pc),a2
	lea	circuit_path_prefix(pc),a3
.copy_prefix
	move.b	(a3)+,(a2)+
	bne.b	.copy_prefix
	subq.l	#1,a2

	moveq	#0,d1
	move.w	d0,d1
	divu	#10,d1
	moveq	#0,d2
	move.w	d1,d2			; tens
	swap	d1
	moveq	#0,d3
	move.w	d1,d3			; units
	addi.b	#$30,d2
	move.b	d2,(a2)+
	addi.b	#$30,d3
	move.b	d3,(a2)+
	move.b	#$2F,(a2)+		; '/'

.copy_leaf
	move.b	(a1)+,(a2)+
	bne.b	.copy_leaf

	lea	circuit_path_buffer(pc),a0
	movem.l	(a7)+,d1-d3/a1-a3
	rts


; IN: D0.w circuit index, A3 race record
apply_circuit_setup
	movem.l	d0-d7/a0-a6,-(a7)

	lea	circuit_leaf_race_setup(pc),a1
	bsr.w	build_circuit_path
	move.l	a0,a5

	move.l	_resload(pc),a2
	jsr	resload_GetFileSize(a2)
	cmp.l	#RACE_SETUP_SIZE,d0
	bne.b	.done

	move.l	a5,a0
	lea	race_setup_buffer(pc),a1
	move.l	_resload(pc),a2
	jsr	resload_LoadFile(a2)

	lea	race_setup_buffer(pc),a0
	moveq	#0,d0
	move.w	(a0),d0
	beq.b	.done
	cmp.w	#CUSTOM_MAX_LAPS,d0
	bhi.b	.done

	lea	race_setup_buffer(pc),a0
	move.w	(a0)+,$28(a3)		; laps
	move.l	(a0)+,$5C(a3)		; flag X/Y
	move.l	(a0)+,$62(a3)		; start X 16.16
	move.l	(a0)+,$66(a3)		; start Y 16.16
	move.w	(a0)+,$6A(a3)		; orientation/mirror

	move.l	$32(a3),a1
	moveq	#PIT_LONG_COUNT_MINUS1,d6
.copy_pits
	move.l	(a0)+,(a1)+
	dbf	d6,.copy_pits

.done
	movem.l	(a7)+,d0-d7/a0-a6
	rts


; IN: D0.w circuit index, D1.w event index, A3 race record
apply_circuit_presentation
	movem.l	d0-d7/a0-a6,-(a7)
	move.w	d1,d6

	lea	circuit_leaf_presentation(pc),a1
	bsr.w	build_circuit_path
	move.l	a0,a5

	move.l	_resload(pc),a2
	jsr	resload_GetFileSize(a2)
	cmp.l	#CIRCUIT_PRESENTATION_SIZE,d0
	bne.b	.done

	move.l	a5,a0
	lea	circuit_presentation_buffer(pc),a1
	move.l	_resload(pc),a2
	jsr	resload_LoadFile(a2)

	lea	circuit_presentation_buffer(pc),a0
	cmp.l	#CIRCUIT_PRESENTATION_MAGIC,(a0)
	bne.b	.done
	cmp.w	#CIRCUIT_PRESENTATION_VERSION,4(a0)
	bne.b	.done
	cmp.w	#CIRCUIT_PRESENTATION_SIZE,6(a0)
	bne.b	.done

	moveq	#0,d0
	move.w	8(a0),d0
	cmp.w	#REGION_MAP_COUNT-1,d0
	bhi.b	.done

	moveq	#0,d1
	move.w	$0E(a0),d1
	cmp.w	#3,d1
	bhi.b	.done

	move.w	$0A(a0),$4A(a3)		; regional marker X
	move.w	$0C(a0),$4C(a3)		; regional marker Y
	move.w	$0E(a0),$4E(a3)		; regional marker frame
	move.w	$10(a0),$24(a3)		; HUD/current-lap top-left X
	move.w	$12(a0),$26(a3)		; HUD/current-lap top-left Y

	lea	region_selector(pc),a1
	move.b	d0,0(a1,d6.w)

.done
	movem.l	(a7)+,d0-d7/a0-a6
	rts


; IN: D0.w circuit index, A3 race record
apply_circuit_waypoints
	movem.l	d0-d7/a0-a6,-(a7)

	lea	circuit_leaf_waypoints(pc),a1
	bsr.w	build_circuit_path
	move.l	a0,a5

	move.l	_resload(pc),a2
	jsr	resload_GetFileSize(a2)
	cmp.l	#20,d0
	blo.w	.done
	cmp.l	#CIRCUIT_WAYPOINT_BUFFER_SIZE,d0
	bhi.w	.done
	move.l	d0,d5

	move.l	a5,a0
	lea	circuit_waypoint_buffer(pc),a1
	move.l	_resload(pc),a2
	jsr	resload_LoadFile(a2)

	lea	circuit_waypoint_buffer(pc),a0
	cmp.l	#CIRCUIT_WAYPOINT_MAGIC,(a0)
	bne.w	.done
	cmp.w	#CIRCUIT_WAYPOINT_VERSION,4(a0)
	bne.w	.done
	cmp.w	#CIRCUIT_WAYPOINT_ROUTES,6(a0)
	bne.w	.done

	; Validate everything before changing game memory.
	move.l	d5,d3
	subq.l	#8,d3
	lea	8(a0),a1
	movea.l	a3,a4
	moveq	#CIRCUIT_WAYPOINT_ROUTES-1,d6

.validate_route
	cmp.l	#4,d3
	blo.w	.done

	moveq	#0,d0
	move.w	(a1),d0
	cmp.w	8(a4),d0
	bne.w	.done

	moveq	#0,d1
	move.w	2(a1),d1
	cmp.w	#1,d1
	bhi.w	.done

	lea	4(a1),a1
	subq.l	#4,d3

	mulu	#6,d0
	tst.w	d1
	beq.b	.have_route_bytes
	addq.l	#6,d0
.have_route_bytes
	cmp.l	d0,d3
	blo.w	.done
	sub.l	d0,d3
	adda.l	d0,a1

	lea	12(a4),a4
	dbf	d6,.validate_route

	tst.l	d3
	bne.w	.done

	; Copy stored/complemented six-byte records.
	lea	circuit_waypoint_buffer+8(pc),a1
	movea.l	a3,a4
	moveq	#CIRCUIT_WAYPOINT_ROUTES-1,d6

.copy_route
	moveq	#0,d0
	move.w	(a1),d0
	moveq	#0,d1
	move.w	2(a1),d1
	lea	4(a1),a1

	movea.l	(a4),a2
	move.w	d0,d2
	beq.b	.no_points
	subq.w	#1,d2
.copy_point
	move.l	(a1)+,(a2)+
	move.w	(a1)+,(a2)+
	dbf	d2,.copy_point

.no_points
	tst.w	d1
	beq.b	.no_boundary
	movea.l	4(a4),a2
	move.l	(a1)+,(a2)+
	move.w	(a1)+,(a2)+

.no_boundary
	lea	12(a4),a4
	dbf	d6,.copy_route

.done
	movem.l	(a7)+,d0-d7/a0-a6
	rts


circuit_path_prefix		dc.b	"circuit_",0
circuit_leaf_background	dc.b	"background.bin",0
circuit_leaf_foreground	dc.b	"foreground.bin",0
circuit_leaf_surface		dc.b	"surface.bin",0
circuit_leaf_recovery		dc.b	"recovery.bin",0
circuit_leaf_preview		dc.b	"preview.bin",0
circuit_leaf_waypoints		dc.b	"waypoints.bin",0
circuit_leaf_race_setup	dc.b	"race_setup.bin",0
circuit_leaf_presentation	dc.b	"presentation.bin",0
	even

circuit_resource_leaf_offsets
	dc.w	circuit_leaf_background-circuit_resource_leaf_offsets
	dc.w	circuit_leaf_foreground-circuit_resource_leaf_offsets
	dc.w	circuit_leaf_surface-circuit_resource_leaf_offsets
	dc.w	circuit_leaf_recovery-circuit_resource_leaf_offsets

preview_resource_ids
	ds.w	TRACK_COUNT
circuit_path_buffer
	ds.b	CIRCUIT_PATH_BUFFER_SIZE
circuit_presentation_buffer
	ds.b	CIRCUIT_PRESENTATION_SIZE
circuit_waypoint_buffer
	ds.b	CIRCUIT_WAYPOINT_BUFFER_SIZE
	even

;---------------------------------------------------------------------------
; Playlist v1/v2, explicitly opt-in through CUSTOM2=1.
;
; CUSTOM2 != 1:
;   - patch_boot never calls this routine;
;   - resload_GetCustom and playlist file probing are therefore never reached;
;   - legacy per-event setup replacement remains unchanged.
;
; CUSTOM2 = 1:
;   - CUSTOM=<filename> selects that exact relative WHDLoad data filename;
;   - empty CUSTOM selects playlist_default_name (indyheat_playlist.bin);
;   - invalid/missing/malformed playlist fails closed before game-memory writes.
;
; The native game event pointer at A6+$3DD6, $5902 start, +$82 progression and
; $5E98 sentinel are not patched by this feature.
;---------------------------------------------------------------------------

apply_playlist
	movem.l	d0-d7/a0-a6,-(a7)

	; Always clear the per-event library map first so a missing/invalid playlist
	; cannot leave a stale custom circuit selected.
	bsr.w	reset_playlist_event_maps

	; Called only from patch_boot's CUSTOM2=1 branch.
	bsr.w	resolve_playlist_name
	tst.l	d0
	beq.w	.done
	move.l	a0,a5

	; Both v1 and v2 deliberately retain the proven $34 footprint.
	move.l	_resload(pc),a2
	jsr	resload_GetFileSize(a2)
	cmp.l	#PLAYLIST_SIZE,d0
	bne.w	.done

	move.l	a5,a0
	lea	playlist_buffer(pc),a1
	move.l	_resload(pc),a2
	jsr	resload_LoadFile(a2)

	; Validate the complete header before touching game memory.
	lea	playlist_buffer(pc),a0
	cmp.l	#PLAYLIST_MAGIC,(a0)
	bne.w	.invalid
	cmp.w	#RACE_RECORD_COUNT,6(a0)
	bne.w	.invalid

	moveq	#0,d6
	move.w	4(a0),d6			; playlist version
	cmp.w	#PLAYLIST_VERSION_V1,d6
	beq.b	.version_ok
	cmp.w	#PLAYLIST_VERSION_V2,d6
	bne.w	.invalid
.version_ok

	; First pass validates every event and resolves v2 custom circuits to one of
	; the ten structural retail templates by IHWP route counts.  Only slave-local
	; bookkeeping is written in this pass; game race records remain untouched.
	lea	8(a0),a1
	lea	playlist_template_by_event(pc),a5
	lea	custom_circuit_by_event(pc),a6
	moveq	#RACE_RECORD_COUNT-1,d7
.validate_event
	moveq	#0,d2
	move.w	(a1),d2

	cmp.w	#PLAYLIST_VERSION_V1,d6
	bne.b	.validate_v2

	; v1 keeps the runtime-proven physical Track-ID interpretation.
	cmp.w	#1,d2
	blt.w	.invalid
	cmp.w	#TRACK_COUNT,d2
	bgt.w	.invalid
	subq.w	#1,d2
	move.w	d2,(a5)
	move.w	#$FFFF,(a6)
	bra.b	.validate_laps

.validate_v2
	cmp.w	#PLAYLIST_MAX_CIRCUIT,d2
	bhi.w	.invalid
	cmp.w	#TRACK_COUNT,d2
	bhs.b	.validate_custom

	; v2 circuit_00..09 map directly to retail structural templates 0..9.
	move.w	d2,(a5)
	move.w	#$FFFF,(a6)
	bra.b	.validate_laps

.validate_custom
	; circuit_10..99 is identified solely by its binary package.  waypoints.bin
	; is mandatory here because its three route counts prove which retail record
	; layout can safely host the custom circuit.
	move.w	d2,d0
	bsr.w	infer_custom_template
	tst.w	d0
	bmi.w	.invalid
	move.w	d0,(a5)
	move.w	d2,(a6)

.validate_laps
	move.w	2(a1),d0
	cmp.w	#PLAYLIST_INHERIT_LAPS,d0
	beq.b	.validated
	; Preserve test-15/v1 semantics: any non-$FFFF word is accepted here and
	; values above 20 are clamped during application.  v2 authoring is stricter.
	cmp.w	#PLAYLIST_VERSION_V1,d6
	beq.b	.validated
	cmp.w	#1,d0
	blo.w	.invalid
	cmp.w	#CUSTOM_MAX_LAPS,d0
	bhi.w	.invalid
.validated
	addq.l	#4,a1
	addq.l	#2,a5
	addq.l	#2,a6
	dbf	d7,.validate_event

	; Snapshot all retail templates before any event or package changes them.
	bsr.w	capture_track_templates

	lea	playlist_buffer+8(pc),a4
	lea	playlist_template_by_event(pc),a5
	lea	custom_circuit_by_event(pc),a6
	lea	RACE_RUNTIME_BASE.w,a3
	moveq	#0,d3
	move.w	playlist_buffer+4(pc),d3	; preserve playlist version during copy loop
	moveq	#0,d1			; championship event index 0..10
	moveq	#RACE_RECORD_COUNT-1,d7

.next_event
	; Preserve destination event values that remain event-local after remapping.
	move.w	$28(a3),d4			; destination laps
	move.w	$2A(a3),d5			; displayed race ordinal

	; Copy the resolved structural retail template.
	moveq	#0,d0
	move.w	(a5)+,d0
	mulu	#RACE_RECORD_SIZE,d0
	lea	track_template_buffer(pc),a0
	adda.l	d0,a0
	move.l	a3,a1
	bsr.w	copy_race_record
	move.w	d4,$28(a3)
	move.w	d5,$2A(a3)

	move.w	(a6),d2			; $FFFF = stock, otherwise circuit_10..99
	cmp.w	#$FFFF,d2
	beq.b	.apply_lap_override

	; TEST 17: keep the copied retail record's original waypoint and pit pointers.
	; Test 16 relocated those structures into slave-local storage; runtime testing
	; produced wrong AI headings immediately and prevented lap progression even
	; though the exported IHWP graph was structurally sound.  Patching the proven
	; retail addresses in place is therefore the controlled compatibility proof.
	; Limitation for this test: two custom events using the same retail structural
	; template would share these mutable structures and should not be combined.

	move.w	d2,d0
	bsr.w	apply_circuit_setup
	move.w	d2,d0
	bsr.w	apply_circuit_waypoints
	move.w	d2,d0
	; D1 still contains the championship event index.
	bsr.w	apply_circuit_presentation

.apply_lap_override
	; Playlist override is deliberately last. For a custom event $FFFF therefore
	; retains race_setup.bin's authored lap total; for stock it inherits the
	; destination event exactly as v1 did.
	move.w	2(a4),d0
	cmp.w	#PLAYLIST_INHERIT_LAPS,d0
	beq.b	.laps_done
	cmp.w	#PLAYLIST_VERSION_V1,d3
	bne.b	.write_lap_override
	cmp.w	#CUSTOM_MAX_LAPS,d0
	bls.b	.write_lap_override
	moveq	#CUSTOM_MAX_LAPS,d0
.write_lap_override
	move.w	d0,$28(a3)
.laps_done

	addq.l	#4,a4
	addq.l	#2,a6
	lea	RACE_RECORD_SIZE(a3),a3
	addq.w	#1,d1
	dbf	d7,.next_event
	bra.b	.done

.invalid
	; Validation failures are all-or-nothing for the playlist mapping.
	bsr.w	reset_playlist_event_maps
.done
	movem.l	(a7)+,d0-d7/a0-a6
	rts

reset_playlist_event_maps
	lea	custom_circuit_by_event(pc),a0
	lea	playlist_template_by_event(pc),a1
	moveq	#RACE_RECORD_COUNT-1,d0
.clear
	move.w	#$FFFF,(a0)+
	move.w	#$FFFF,(a1)+
	dbf	d0,.clear
	rts


; IN: D0.w = custom circuit index 10..99
; OUT: D0.w = uniquely matching retail structural template 0..9, or -1
infer_custom_template
	movem.l	d1-d7/a0-a6,-(a7)
	move.w	d0,d7

	lea	circuit_leaf_waypoints(pc),a1
	bsr.w	build_circuit_path
	move.l	a0,a5
	move.l	_resload(pc),a2
	jsr	resload_GetFileSize(a2)
	cmp.l	#20,d0
	blo.w	.failed
	cmp.l	#CIRCUIT_WAYPOINT_BUFFER_SIZE,d0
	bhi.w	.failed
	move.l	d0,d6

	move.l	a5,a0
	lea	circuit_waypoint_buffer(pc),a1
	move.l	_resload(pc),a2
	jsr	resload_LoadFile(a2)

	lea	circuit_waypoint_buffer(pc),a0
	cmp.l	#CIRCUIT_WAYPOINT_MAGIC,(a0)
	bne.w	.failed
	cmp.w	#CIRCUIT_WAYPOINT_VERSION,4(a0)
	bne.w	.failed
	cmp.w	#CIRCUIT_WAYPOINT_ROUTES,6(a0)
	bne.w	.failed

	subq.l	#8,d6
	lea	8(a0),a1
	lea	inferred_route_counts(pc),a4
	moveq	#CIRCUIT_WAYPOINT_ROUTES-1,d5
.parse_route
	cmp.l	#4,d6
	blo.w	.failed
	moveq	#0,d0
	move.w	(a1),d0
	move.w	d0,(a4)+
	moveq	#0,d1
	move.w	2(a1),d1
	cmp.w	#1,d1
	bhi.w	.failed
	lea	4(a1),a1
	subq.l	#4,d6
	mulu	#6,d0
	tst.w	d1
	beq.b	.route_bytes
	addq.l	#6,d0
.route_bytes
	cmp.l	d0,d6
	blo.w	.failed
	sub.l	d0,d6
	adda.l	d0,a1
	dbf	d5,.parse_route
	tst.l	d6
	bne.w	.failed

	lea	retail_route_counts(pc),a0
	moveq	#0,d2
	moveq	#TRACK_COUNT-1,d5
.compare_template
	lea	inferred_route_counts(pc),a4
	move.w	(a0),d0
	cmp.w	(a4),d0
	bne.b	.next_template
	move.w	2(a0),d0
	cmp.w	2(a4),d0
	bne.b	.next_template
	move.w	4(a0),d0
	cmp.w	4(a4),d0
	bne.b	.next_template
	move.w	d2,d0
	bra.b	.return
.next_template
	lea	6(a0),a0
	addq.w	#1,d2
	dbf	d5,.compare_template
.failed
	moveq	#-1,d0
.return
	movem.l	(a7)+,d1-d7/a0-a6
	rts

inferred_route_counts
	ds.w	3
retail_route_counts
	dc.w	46,46,45		; circuit_00 Illinois
	dc.w	55,61,49		; circuit_01 New Jersey
	dc.w	56,67,47		; circuit_02 West Canada
	dc.w	63,67,66		; circuit_03 South California
	dc.w	76,77,53		; circuit_04 East Canada
	dc.w	68,70,54		; circuit_05 Indianapolis
	dc.w	71,77,71		; circuit_06 Michigan
	dc.w	77,73,71		; circuit_07 Colorado
	dc.w	49,46,42		; circuit_08 North California
	dc.w	82,80,77		; circuit_09 Kentucky
	even

; Resolve CUSTOM to a safe relative filename.
; OUT: D0=1 and A0=filename, or D0=0 on failure.
; Empty CUSTOM deliberately chooses playlist_default_name.

resolve_playlist_name
	lea	custom_playlist_name(pc),a0
	move.l	#CUSTOM_NAME_BUFFER_SIZE,d0
	moveq	#0,d1			; reserved, required by API
	move.l	_resload(pc),a2
	jsr	resload_GetCustom(a2)
	tst.l	d0
	beq.b	.failed

	lea	custom_playlist_name(pc),a0
	tst.b	(a0)
	bne.b	.validate
	lea	playlist_default_name(pc),a0

.validate
	move.l	a0,a1
	moveq	#0,d2			; previous character
	cmp.b	#'/',(a1)
	beq.b	.failed
.next_char
	move.b	(a1)+,d1
	beq.b	.end_name
	cmp.b	#':',d1
	beq.b	.failed
	cmp.b	#'/',d1
	bne.b	.remember
	cmp.b	#'/',d2
	beq.b	.failed
.remember
	move.b	d1,d2
	bra.b	.next_char
.end_name
	cmp.b	#'/',d2
	beq.b	.failed
	moveq	#1,d0
	rts
.failed
	moveq	#0,d0
	rts

; Canonical physical-track template order:
; 01 Illinois, 02 New Jersey, 03 West Canada, 04 South California,
; 05 East Canada, 06 Indianapolis, 07 Michigan, 08 Colorado,
; 09 North California, 10 Kentucky. Event 11 is Indianapolis again.

capture_track_templates
	movem.l	d0-d7/a0-a5,-(a7)
	lea	track_source_offsets(pc),a4
	lea	track_template_buffer(pc),a5
	lea	RACE_RUNTIME_BASE.w,a3
	moveq	#TRACK_COUNT-1,d7
.next_track
	moveq	#0,d0
	move.w	(a4)+,d0
	move.l	a3,a0
	adda.w	d0,a0
	move.l	a5,a1
	bsr.w	copy_race_record
	lea	RACE_RECORD_SIZE(a5),a5
	dbf	d7,.next_track
	movem.l	(a7)+,d0-d7/a0-a5
	rts

copy_race_record
	moveq	#31,d6			; 32 longs = $80
.copy_long
	move.l	(a0)+,(a1)+
	dbf	d6,.copy_long
	move.w	(a0)+,(a1)+		; final $02
	rts

track_source_offsets
	dc.w	$0000			; Track 01 <- event 1
	dc.w	$0104			; Track 02 <- event 3
	dc.w	$0186			; Track 03 <- event 4
	dc.w	$0208			; Track 04 <- event 5
	dc.w	$028A			; Track 05 <- event 6
	dc.w	$0082			; Track 06 <- event 2
	dc.w	$030C			; Track 07 <- event 7
	dc.w	$038E			; Track 08 <- event 8
	dc.w	$0410			; Track 09 <- event 9
	dc.w	$0492			; Track 10 <- event 10

playlist_default_name
	dc.b	"indyheat_playlist.bin",0
	even
custom_playlist_name
	ds.b	CUSTOM_NAME_BUFFER_SIZE
	even
playlist_buffer
	ds.b	PLAYLIST_SIZE
	even
playlist_template_by_event
	ds.w	RACE_RECORD_COUNT
custom_circuit_by_event
	ds.w	RACE_RECORD_COUNT
track_template_buffer
	ds.b	TRACK_TEMPLATE_SIZE
	even

;---------------------------------------------------------------------------
; Test-16 private mutable storage experiment (DISABLED IN TEST 17).
;
; Kept in source for comparison only; apply_playlist no longer calls this routine.
; Runtime testing of test 16 showed immediate AI direction/lap-progress failure
; despite a structurally valid IHWP export, so test 17 preserves retail addresses.
;---------------------------------------------------------------------------

; IN: D0.w event index 0..10, A3 = copied event race record
; OUT: D0.l = 1 success, 0 failure
prepare_custom_event_storage
	movem.l	d1-d7/a0-a6,-(a7)
	moveq	#0,d7
	move.w	d0,d7
	cmp.w	#RACE_RECORD_COUNT-1,d7
	bhi.w	.failed

	; Allocate fixed private waypoint slot for this event.
	move.l	d7,d1
	mulu	#CUSTOM_WAYPOINT_SLOT_SIZE,d1
	lea	custom_waypoint_storage(pc),a5
	adda.l	d1,a5

	; Copy from route-A start through route-C boundary record (end+6).
	move.l	(a3),d2
	beq.w	.failed
	move.l	28(a3),d3
	addq.l	#6,d3
	sub.l	d2,d3
	beq.w	.failed
	cmp.l	#CUSTOM_WAYPOINT_SLOT_SIZE,d3
	bhi.w	.failed

	movea.l	d2,a0
	movea.l	a5,a1
	move.w	d3,d6
	subq.w	#1,d6
.copy_waypoint_span
	move.b	(a0)+,(a1)+
	dbf	d6,.copy_waypoint_span

	; Relocate all three descriptor start/end pointers by the same delta.
	move.l	a5,d4
	sub.l	d2,d4
	movea.l	a3,a4
	moveq	#CIRCUIT_WAYPOINT_ROUTES-1,d6
.relocate_descriptor
	add.l	d4,(a4)
	add.l	d4,4(a4)
	lea	12(a4),a4
	dbf	d6,.relocate_descriptor

	; Copy the 4 x $16 pit records to a private $58 block and repoint race+$32.
	move.l	d7,d1
	mulu	#CUSTOM_PIT_SLOT_SIZE,d1
	lea	custom_pit_storage(pc),a5
	adda.l	d1,a5
	movea.l	$32(a3),a0
	move.l	a0,d0
	beq.b	.failed
	movea.l	a5,a1
	moveq	#PIT_LONG_COUNT_MINUS1,d6
.copy_pit_block
	move.l	(a0)+,(a1)+
	dbf	d6,.copy_pit_block
	move.l	a5,$32(a3)

	moveq	#1,d0
	bra.b	.return
.failed
	moveq	#0,d0
.return
	movem.l	(a7)+,d1-d7/a0-a6
	rts


;---------------------------------------------------------------------------
; Gasoline Alley regional map override — CUSTOM2=1 only.
;
; Map IDs are event-local presentation metadata and deliberately remain
; separate from playlist data unless presentation.bin supplies an event map.  Optional file "indyheat_region_select.bin" is
; exactly 11 bytes: one map ID (0..7) for each championship event slot.
; Missing/wrong-sized selector -> all events use map ID 0 (USA).
;
; Fixed map IDs:
;   0 USA (original)       1 World              2 North America
;   3 South America       4 Europe             5 Africa
;   6 Asia                7 Australasia
;
; Resource $16 is $20B6 bytes decompressed.  Its second/final BOB begins at
; +$177C and is the 78x47 Gasoline Alley regional map.  Each external map is
; the complete replacement BOB ($093A / 2362 bytes), not a whole resource.
;
; The game's normal load/decrunch path remains authoritative.  When Load sees
; resource $16 it arms a pending replacement for frame +$177C.  The next game
; Load call occurs after the resource has been decrunched; apply_pending_map
; then replaces only that frame.  Missing/wrong-sized map file fails closed,
; leaving the original USA map intact.
;---------------------------------------------------------------------------

load_region_selector
	movem.l	d0-d2/a0-a2,-(a7)

	; Deterministic fallback: all event slots use the original USA map.
	lea	region_selector(pc),a0
	moveq	#0,d0
	moveq	#REGION_SELECTOR_SIZE-1,d1
.clear
	move.b	d0,(a0)+
	dbf	d1,.clear

	lea	region_selector_name(pc),a0
	move.l	_resload(pc),a2
	jsr	resload_GetFileSize(a2)
	cmp.l	#REGION_SELECTOR_SIZE,d0
	bne.b	.done

	lea	region_selector_name(pc),a0
	lea	region_selector(pc),a1
	move.l	_resload(pc),a2
	jsr	resload_LoadFile(a2)

	; Validate every byte before runtime use.  Invalid bytes become USA rather
	; than rejecting otherwise useful event selections.
	lea	region_selector(pc),a0
	moveq	#REGION_SELECTOR_SIZE-1,d1
.validate
	cmp.b	#REGION_MAP_COUNT-1,(a0)
	bls.b	.next
	clr.b	(a0)
.next
	addq.l	#1,a0
	dbf	d1,.validate
.done
	movem.l	(a7)+,d0-d2/a0-a2
	rts


apply_pending_region_map
	movem.l	d0-d2/a0-a4,-(a7)
	lea	pending_region_map_name(pc),a3
	move.l	(a3),d0
	beq.b	.done
	move.l	d0,a0
	lea	pending_region_map_dest(pc),a4
	move.l	(a4),d1
	beq.b	.clear
	move.l	d1,a1
	clr.l	(a3)
	clr.l	(a4)
	move.l	a0,a3
	move.l	a1,a4
	move.l	_resload(pc),a2
	jsr	resload_GetFileSize(a2)
	cmp.l	#REGION_MAP_BOB_SIZE,d0
	bne.b	.done
	move.l	a3,a0
	move.l	a4,a1
	move.l	_resload(pc),a2
	jsr	resload_LoadFile(a2)
	bra.b	.done
.clear
	clr.l	(a3)
	clr.l	(a4)
.done
	movem.l	(a7)+,d0-d2/a0-a4
	rts


; D1.w = disk sector requested by game, A0 = compressed/decrunch destination,
; A6 = normal game base register from the caller.
arm_region_map_override
	movem.l	d0-d5/a0-a4,-(a7)
	move.w	d1,d5
	lea	RESOURCE_TABLE_RUNTIME.w,a1
	moveq	#RESOURCE_ENTRY_COUNT-1,d4
.find_resource
	cmp.w	2(a1),d5
	bne.b	.next_resource
	cmp.w	#REGION_MAP_RESOURCE_ID,(a1)
	bne.b	.done
	cmp.l	#REGION_MAP_RESOURCE_SIZE,6(a1)
	bne.b	.done

	; Resolve current event slot from the runtime-proven A6+$3DD6 pointer.
	; If called outside a valid event window, fall back to slot 0 / USA.
	moveq	#0,d3
	move.l	$3DD6(a6),d0
	cmp.l	#RACE_RUNTIME_BASE,d0
	blo.b	.have_event
	cmp.l	#RACE_RUNTIME_BASE+(RACE_RECORD_COUNT*RACE_RECORD_SIZE),d0
	bhs.b	.have_event
	sub.l	#RACE_RUNTIME_BASE,d0
	divu	#RACE_RECORD_SIZE,d0
	move.w	d0,d3
.have_event

	lea	region_selector(pc),a2
	moveq	#0,d0
	move.b	0(a2,d3.w),d0
	cmp.w	#REGION_MAP_COUNT-1,d0
	bls.b	.map_ok
	moveq	#0,d0
.map_ok
	add.w	d0,d0			; word-offset table
	lea	region_map_name_offsets(pc),a2
	move.w	0(a2,d0.w),d1
	lea	region_map_name_offsets(pc),a3
	adda.w	d1,a3

	lea	pending_region_map_name(pc),a2
	move.l	a3,(a2)
	lea	pending_region_map_dest(pc),a2
	lea	REGION_MAP_FRAME_OFFSET(a0),a3
	move.l	a3,(a2)
	bra.b	.done
.next_resource
	lea	RESOURCE_ENTRY_SIZE(a1),a1
	dbf	d4,.find_resource
.done
	movem.l	(a7)+,d0-d5/a0-a4
	rts

region_selector_name
	dc.b	"indyheat_region_select.bin",0
	even
region_selector
	ds.b	REGION_SELECTOR_SIZE
	even

region_map_name_offsets
	dc.w	region_map_0_name-region_map_name_offsets
	dc.w	region_map_1_name-region_map_name_offsets
	dc.w	region_map_2_name-region_map_name_offsets
	dc.w	region_map_3_name-region_map_name_offsets
	dc.w	region_map_4_name-region_map_name_offsets
	dc.w	region_map_5_name-region_map_name_offsets
	dc.w	region_map_6_name-region_map_name_offsets
	dc.w	region_map_7_name-region_map_name_offsets
region_map_0_name	dc.b	"maps/indyheat_map_0_usa.bin",0
region_map_1_name	dc.b	"maps/indyheat_map_1_world.bin",0
region_map_2_name	dc.b	"maps/indyheat_map_2_north_america.bin",0
region_map_3_name	dc.b	"maps/indyheat_map_3_south_america.bin",0
region_map_4_name	dc.b	"maps/indyheat_map_4_europe.bin",0
region_map_5_name	dc.b	"maps/indyheat_map_5_africa.bin",0
region_map_6_name	dc.b	"maps/indyheat_map_6_asia.bin",0
region_map_7_name	dc.b	"maps/indyheat_map_7_australasia.bin",0
	even
pending_region_map_name	dc.l	0
pending_region_map_dest	dc.l	0

;---------------------------------------------------------------------------
; External decompressed circuit-background override.
;---------------------------------------------------------------------------

apply_pending_background
	movem.l	d0-d2/a0-a4,-(a7)
	lea	pending_background_name(pc),a3
	move.l	(a3),d0
	beq.b	.done
	move.l	d0,a0
	lea	pending_background_dest(pc),a4
	move.l	(a4),d1
	beq.b	.clear
	move.l	d1,a1
	clr.l	(a3)
	clr.l	(a4)
	move.l	a0,a3
	move.l	a1,a4
	move.l	_resload(pc),a2
	jsr	resload_GetFileSize(a2)
	cmp.l	#TRACK_BACKGROUND_SIZE,d0
	bne.b	.done
	move.l	a3,a0
	move.l	a4,a1
	move.l	_resload(pc),a2
	jsr	resload_LoadFile(a2)
	bra.b	.done
.clear
	clr.l	(a3)
	clr.l	(a4)
.done
	movem.l	(a7)+,d0-d2/a0-a4
	rts

; D1.w = disk sector requested by game, A0 = compressed/decrunch destination.
arm_background_override
	movem.l	d0-d4/a0-a3,-(a7)

	; Called only from Load while CUSTOM2=1.
	move.w	d1,d4
	lea	RESOURCE_TABLE_RUNTIME.w,a1
	moveq	#RESOURCE_ENTRY_COUNT-1,d3
.find_resource
	cmp.w	2(a1),d4
	bne.b	.next_resource
	move.l	6(a1),d2
	cmp.l	#TRACK_BACKGROUND_SIZE,d2
	bne.b	.done
	moveq	#0,d0
	move.w	(a1),d0
	lea	background_override_names(pc),a2
.find_name
	move.w	(a2)+,d2
	cmp.w	#$FFFF,d2
	beq.b	.done
	cmp.w	d0,d2
	beq.b	.name_match
	addq.l	#2,a2
	bra.b	.find_name
.name_match
	moveq	#0,d2
	move.w	(a2)+,d2
	lea	background_override_names(pc),a3
	adda.w	d2,a3
	lea	pending_background_name(pc),a2
	move.l	a3,(a2)
	lea	pending_background_dest(pc),a2
	move.l	a0,(a2)
	bra.b	.done
.next_resource
	lea	RESOURCE_ENTRY_SIZE(a1),a1
	dbf	d3,.find_resource
.done
	movem.l	(a7)+,d0-d4/a0-a3
	rts

background_override_names
	dc.w	$39,bg_39_name-background_override_names
	dc.w	$3D,bg_3d_name-background_override_names
	dc.w	$41,bg_41_name-background_override_names
	dc.w	$45,bg_45_name-background_override_names
	dc.w	$49,bg_49_name-background_override_names
	dc.w	$4D,bg_4d_name-background_override_names
	dc.w	$5A,bg_5a_name-background_override_names
	dc.w	$5E,bg_5e_name-background_override_names
	dc.w	$62,bg_62_name-background_override_names
	dc.w	$66,bg_66_name-background_override_names
	dc.w	$FFFF,0
	even
bg_39_name	dc.b	"indyheat_res39_background.bin",0
bg_3d_name	dc.b	"indyheat_res3D_background.bin",0
bg_41_name	dc.b	"indyheat_res41_background.bin",0
bg_45_name	dc.b	"indyheat_res45_background.bin",0
bg_49_name	dc.b	"indyheat_res49_background.bin",0
bg_4d_name	dc.b	"indyheat_res4D_background.bin",0
bg_5a_name	dc.b	"indyheat_res5A_background.bin",0
bg_5e_name	dc.b	"indyheat_res5E_background.bin",0
bg_62_name	dc.b	"indyheat_res62_background.bin",0
bg_66_name	dc.b	"indyheat_res66_background.bin",0
	even
pending_background_name	dc.l	0
pending_background_dest	dc.l	0

;---------------------------------------------------------------------------
; Complete circuit-package decompressed resource override — TEST 16.
;---------------------------------------------------------------------------

apply_pending_circuit_resource
	movem.l	d0-d2/a0-a4,-(a7)

	lea	pending_circuit_name(pc),a3
	move.l	(a3),d0
	beq.b	.done
	move.l	d0,a0

	lea	pending_circuit_dest(pc),a4
	move.l	(a4),d1
	beq.b	.clear
	move.l	d1,a1

	lea	pending_circuit_size(pc),a2
	move.l	(a2),d2

	clr.l	(a3)
	clr.l	(a4)
	clr.l	(a2)

	move.l	a0,a3
	move.l	a1,a4
	move.l	_resload(pc),a2
	jsr	resload_GetFileSize(a2)
	cmp.l	d2,d0
	bne.b	.done

	move.l	a3,a0
	move.l	a4,a1
	move.l	_resload(pc),a2
	jsr	resload_LoadFile(a2)
	bra.b	.done

.clear
	clr.l	(a3)
	clr.l	(a4)
	lea	pending_circuit_size(pc),a2
	clr.l	(a2)

.done
	movem.l	(a7)+,d0-d2/a0-a4
	rts


; D1.w = disk sector requested by game, A0 = compressed/decrunch destination.
arm_circuit_resource_override
	movem.l	d0-d7/a0-a6,-(a7)

	move.l	a0,a4			; eventual decompressed destination
	move.w	d1,d7			; requested disk sector

	lea	RESOURCE_TABLE_RUNTIME.w,a1
	moveq	#RESOURCE_ENTRY_COUNT-1,d6

.find_resource
	cmp.w	2(a1),d7
	bne.w	.next_resource

	moveq	#0,d2
	move.w	(a1),d2		; requested resource id
	move.l	6(a1),d3		; expected decompressed size

	; If the current championship event is a playlist-v2 custom circuit, map
	; this request relative to THAT event's structural race record and use the
	; circuit_10..99 folder rather than the retail template folder.
	move.l	$3DD6(a6),d0
	cmp.l	#RACE_RUNTIME_BASE,d0
	blo.w	.stock_mapping
	cmp.l	#RACE_RUNTIME_BASE+(RACE_RECORD_COUNT*RACE_RECORD_SIZE),d0
	bhs.w	.stock_mapping
	movea.l	d0,a3
	sub.l	#RACE_RUNTIME_BASE,d0
	divu	#RACE_RECORD_SIZE,d0
	moveq	#0,d1
	move.w	d0,d1
	add.w	d1,d1
	lea	custom_circuit_by_event(pc),a2
	move.w	0(a2,d1.w),d5
	cmp.w	#TRACK_COUNT,d5
	blo.w	.stock_mapping
	cmp.w	#PLAYLIST_MAX_CIRCUIT,d5
	bhi.w	.stock_mapping

	; Derive this event's structural base resource ID from race+$36.
	move.l	$36(a3),d0
	sub.l	#RESOURCE_TABLE_RUNTIME+2,d0
	bmi.w	.done
	move.l	d0,d1
	divu	#RESOURCE_ENTRY_SIZE,d1
	move.l	d1,d0
	swap	d0
	tst.w	d0
	bne.w	.done
	moveq	#0,d0
	move.w	d1,d0			; structural base resource ID
	moveq	#0,d1
	move.w	d2,d1
	sub.w	d0,d1
	cmp.w	#3,d1
	bls.b	.custom_base_resource

	; The miniature preview is a separate resource reached through race+$46's
	; 12-byte descriptor. Match its resource-table +2 pointer explicitly.
	movea.l	$46(a3),a0
	move.l	a0,d0
	beq.w	.done
	move.l	6(a0),d0
	sub.l	#RESOURCE_TABLE_RUNTIME+2,d0
	bmi.w	.done
	move.l	d0,d1
	divu	#RESOURCE_ENTRY_SIZE,d1
	move.l	d1,d0
	swap	d0
	tst.w	d0
	bne.w	.done
	cmp.w	d2,d1
	bne.w	.done
	lea	circuit_leaf_preview(pc),a1
	bra.b	.custom_build_name

.custom_base_resource
	add.w	d1,d1
	lea	circuit_resource_leaf_offsets(pc),a2
	move.w	0(a2,d1.w),d0
	lea	circuit_resource_leaf_offsets(pc),a1
	adda.w	d0,a1

.custom_build_name
	move.w	d5,d0
	bsr.w	build_circuit_path
	bra.w	.validate_and_arm

.stock_mapping
	; Existing test-16 direct package bridge for circuit_00..09.
	lea	circuit_base_resource_ids(pc),a2
	moveq	#0,d4
	moveq	#TRACK_COUNT-1,d5

.find_base
	moveq	#0,d0
	move.w	d2,d0
	sub.w	(a2)+,d0
	cmp.w	#3,d0
	bls.b	.have_base_resource
	addq.w	#1,d4
	dbf	d5,.find_base

	lea	preview_resource_ids(pc),a2
	moveq	#0,d4
	moveq	#TRACK_COUNT-1,d5

.find_preview
	cmp.w	(a2)+,d2
	beq.b	.have_preview
	addq.w	#1,d4
	dbf	d5,.find_preview
	bra.w	.done

.have_base_resource
	add.w	d0,d0
	lea	circuit_resource_leaf_offsets(pc),a2
	move.w	0(a2,d0.w),d1
	lea	circuit_resource_leaf_offsets(pc),a1
	adda.w	d1,a1
	bra.b	.build_stock_name

.have_preview
	lea	circuit_leaf_preview(pc),a1

.build_stock_name
	move.w	d4,d0
	bsr.w	build_circuit_path

.validate_and_arm
	move.l	a0,a3
	move.l	_resload(pc),a2
	jsr	resload_GetFileSize(a2)
	cmp.l	d3,d0
	bne.b	.done

	lea	pending_circuit_name(pc),a0
	move.l	a3,(a0)
	lea	pending_circuit_dest(pc),a0
	move.l	a4,(a0)
	lea	pending_circuit_size(pc),a0
	move.l	d3,(a0)
	bra.b	.done

.next_resource
	lea	RESOURCE_ENTRY_SIZE(a1),a1
	dbf	d6,.find_resource

.done
	movem.l	(a7)+,d0-d7/a0-a6
	rts


pending_circuit_name	dc.l	0
pending_circuit_dest	dc.l	0
pending_circuit_size	dc.l	0

;--------------------------------

patch_main

	; old Mr Larmer code to emulate stackframe
	; (fixed crash on 68010+ but unfortunately incompatible with 68000!)
	;	subq.l	#2,a7
	;	move.w	2(a7),(a7)
	;	move.l	4(a7),2(a7)
	;	move.w	#$80,6(a7)

.c1	movem.l	d0,-(a7)		; preserve regs
	move.l	_custom1(pc),d0		; CUSTOM1 tooltype 
	btst	#0,d0			; infinite credits ?
	beq	.c2			; 
	move.l	#$4e714e71,($755e)	; NOP


.c2	btst	#1,d0			; No $150,000 bonus
	beq	.cont			; skip
	clr.w	($755a)			; zero value credit
	move.b	#00,($7c45)		; fix text
	move.b	#$0C,($7c0d)		; fix text $07->$0C (+5 Y coord)
	move.b	#$16,($7c25)		; fix text $11->$16 (+5 Y coord)

.cont	movem.l	(a7)+,d0		; restore regs

	; skip the false SR pushed on the stack (routine ended by RTE, replaced by RTS)

	addq.l	#2,a7

	; decrypt copylock (Mr Larmer magic stuff)

	movem.l	$98D8,D0-D7
	movem.l	d0-a7,-(a7)

	move.l	#$C5A89C87,D0
	lea	8(A7),A0
	lea	$24(A7),A1
	moveq	#2,D2
	move.l	D0,D3
	lsl.l	#2,D0
loop
	move.l	(A0)+,D1
	sub.l	D0,D1
	move.l	D1,(A1)+
	add.l	D0,D0
	addq.b	#1,D2
	cmp.b	#8,D2
	bne.s	loop
	move.l	D3,(A1)+

	move.l	#$3D742CF1,(a7)
	movem.l	(A7)+,D0-D7/A0
	move.l	D0,$60.w

	rts

	bsr	_flushcache

	rts

;--------------------------------

Load
		movem.l	d0-a6,-(a7)

		; $BDE4 is a shared WHDLoad disk/save access point and is patched in
		; pl_boot for both modes.  This is the one custom-mode gate retained
		; inside a common routine: custom background/map files must never be
		; probed or applied unless CUSTOM2 is exactly 1.
		move.l	_custom2(pc),d4
		cmp.l	#1,d4
		bne.b	.no_pending_custom_assets
		bsr.w	apply_pending_background
		bsr.w	apply_pending_circuit_resource
		bsr.w	apply_pending_region_map
.no_pending_custom_assets

		tst.w	d2
		beq.b	.skip

		btst	#0,d3
		bne.b	Save

		cmp.l	#1,d4
		bne.b	.no_custom_asset_override
		bsr.w	arm_background_override
		bsr.w	arm_circuit_resource_override
		bsr.w	arm_region_map_override
.no_custom_asset_override

		moveq	#0,D0
		move.w	D1,D0
		mulu	#512,D0
		moveq	#0,D1
		move.w	D2,D1
		mulu	#512,D1

		moveq	#1,D2

		bsr.b	_LoadDisk
.skip
		movem.l	(a7)+,d0-a6
		moveq	#0,d0
		rts

;--------------------------------

Save
		moveq	#0,D0
		move.w	D2,D0
		mulu	#512,D0			;len
		mulu	#512,D1			;offset
		lea	(A0),a1			;address
		lea	_savename(pc),a0	;filename

		move.l	_resload(pc),a2
		jsr	resload_SaveFileOffset(a2)

		movem.l	(a7)+,d0-a6
		moveq	#0,d0
		rts

_savename	dc.b	"Disk.1",0
	CNOP 0,2

;--------------------------------

_resload	dc.l	0		;address of resident loader

;--------------------------------
; IN:	d0=offset d1=size d2=disk a0=dest
; OUT:	d0=success

_LoadDisk	movem.l	d0-d1/a0-a2,-(a7)
		move.l	_resload(pc),a2
		jsr	resload_DiskLoad(a2)
		movem.l	(a7)+,d0-d1/a0-a2
		rts

_flushcache:
	move.l	a2,-(a7)
	move.l	_resload(pc),a2
	jsr	resload_FlushCache(a2)
	move.l	(a7)+,a2
	rts

;---------------------------------------------------------------------------
; Writable per-event backing storage for playlist-v2 custom-library circuits.
;---------------------------------------------------------------------------
custom_pit_storage
	ds.b	RACE_RECORD_COUNT*CUSTOM_PIT_SLOT_SIZE
	even
custom_waypoint_storage
	ds.b	RACE_RECORD_COUNT*CUSTOM_WAYPOINT_SLOT_SIZE
	even

;======================================================================

	END
