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
; Development 1.3 test 3 structural patch-list test:
; - preserve the 1.21 WHDLoad v17 header and original CUSTOM1 trainer options;
; - CUSTOM2=1 enters PL_CUSTOMTRACKS, which chains to pl_boot with PL_NEXT;
; - CUSTOM2<>1 starts directly at pl_boot;
; - retain external per-event setup overrides;
; - external decompressed background overrides require CUSTOM2=1;
; - retain the runtime-proven eleven-event retail-track playlist remap;
; - CUSTOM2=1 is the explicit custom-track/playlist gate;
; - CUSTOM=<filename> selects a playlist only while CUSTOM2=1;
; - empty CUSTOM falls back to "indyheat_playlist.bin";
; - malformed/missing playlists fail closed before race-record writes;
; - Track IDs remain the proven retail physical Track IDs 01-10 in playlist v1.
;
; Playlist v1 ($34 bytes, big endian):
;   +00.l "IHPL"
;   +04.w version = 1
;   +06.w event count = 11
;   +08   11 entries:
;          +00.w physical Track ID 1..10
;          +02.w lap override, $FFFF = inherit destination event
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
PLAYLIST_VERSION        EQU     1
PLAYLIST_SIZE           EQU     $34             ; 8 + 11*4
PLAYLIST_MAGIC          EQU     $4948504C        ; "IHPL" file signature
PLAYLIST_INHERIT_LAPS   EQU     $FFFF
CUSTOM_NAME_BUFFER_SIZE EQU     128
TRACK_BACKGROUND_SIZE   EQU     $C800
RESOURCE_TABLE_RUNTIME  EQU     $4C6A
RESOURCE_ENTRY_SIZE     EQU     22
RESOURCE_ENTRY_COUNT    EQU     108

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
	dc.b	"1.3 test 3"
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

	bsr.w	apply_playlist
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
; This is the dedicated entry patch list for custom-track work.  Test 3 adds
; no new game-code patches: it proves the entry/chaining structure using the
; already-runtime-proven playlist/background behaviour only.
;
; Future custom-only game patches (lap-total renderer, Gasoline Alley maps,
; preview hooks, etc.) belong here, before PL_NEXT.
;
; PL_NEXT terminates this list and continues with the normal/common pl_boot.
;---------------------------------------------------------------------------

PL_CUSTOMTRACKS
	PL_START

	PL_NEXT	pl_boot


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
; Playlist v1, explicitly opt-in through CUSTOM2=1.
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

	; Called only from patch_boot's CUSTOM2=1 branch.
	bsr.w	resolve_playlist_name
	tst.l	d0
	beq.w	.done
	move.l	a0,a5

	; Missing or wrong-sized playlist is a clean no-op.
	move.l	_resload(pc),a2
	jsr	resload_GetFileSize(a2)
	cmp.l	#PLAYLIST_SIZE,d0
	bne.w	.done

	move.l	a5,a0
	lea	playlist_buffer(pc),a1
	move.l	_resload(pc),a2
	jsr	resload_LoadFile(a2)

	; Validate complete header and all Track IDs before any race-record write.
	lea	playlist_buffer(pc),a0
	cmp.l	#PLAYLIST_MAGIC,(a0)
	bne.w	.done
	cmp.w	#PLAYLIST_VERSION,4(a0)
	bne.w	.done
	cmp.w	#RACE_RECORD_COUNT,6(a0)
	bne.w	.done

	lea	8(a0),a1
	moveq	#RACE_RECORD_COUNT-1,d7
.validate
	move.w	(a1),d0
	cmp.w	#1,d0
	blt.w	.done
	cmp.w	#TRACK_COUNT,d0
	bgt.w	.done
	addq.l	#4,a1
	dbf	d7,.validate

	bsr.w	capture_track_templates

	lea	playlist_buffer+8(pc),a4
	lea	RACE_RUNTIME_BASE.w,a3
	moveq	#RACE_RECORD_COUNT-1,d7

.next_event
	; Preserve event-local values from the destination slot.
	move.w	$28(a3),d4			; laps
	move.w	$2A(a3),d5			; displayed race ordinal

	; Select physical Track ID 1..10 from canonical retail templates.
	moveq	#0,d0
	move.w	(a4),d0
	subq.w	#1,d0
	lea	track_template_buffer(pc),a0
.seek_template
	tst.w	d0
	beq.b	.template_found
	lea	RACE_RECORD_SIZE(a0),a0
	subq.w	#1,d0
	bra.b	.seek_template

.template_found
	move.l	a3,a1
	bsr.w	copy_race_record

	move.w	d4,$28(a3)
	move.w	d5,$2A(a3)

	; Optional lap override is event-local.
	move.w	2(a4),d0
	cmp.w	#PLAYLIST_INHERIT_LAPS,d0
	beq.b	.laps_done
	move.w	d0,$28(a3)
.laps_done

	addq.l	#4,a4
	lea	RACE_RECORD_SIZE(a3),a3
	dbf	d7,.next_event

.done
	movem.l	(a7)+,d0-d7/a0-a6
	rts

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
track_template_buffer
	ds.b	TRACK_TEMPLATE_SIZE
	even

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
		; inside a common routine: custom background files must never be
		; probed or applied unless CUSTOM2 is exactly 1.
		move.l	_custom2(pc),d4
		cmp.l	#1,d4
		bne.b	.no_pending_background
		bsr.w	apply_pending_background
.no_pending_background

		tst.w	d2
		beq.b	.skip

		btst	#0,d3
		bne.b	Save

		cmp.l	#1,d4
		bne.b	.no_background_override
		bsr.w	arm_background_override
.no_background_override

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

;======================================================================

	END
