;*---------------------------------------------------------------------------
;  :Program.	IndyHeat.asm
;  :Contents.	Slave for "Indy Heat" from Sales Curve
;  :Author.	Mr.Larmer of Wanted Team
;  :History.	26.04.99
;  :Requires.	-
;  :Copyright.	Public Domain
;  :Language.	68000 Assembler
;  :Translator.	Devpac 3.14
;  :To Do.
;---------------------------------------------------------------------------*

RACE_RUNTIME_BASE       EQU     $5902           ; main+$4902 plus runtime $1000
RACE_RECORD_SIZE        EQU     $82
RACE_SETUP_SIZE         EQU     $68
PIT_LONG_COUNT_MINUS1   EQU     21              ; $58 / 4 = 22 longs -> DBF 21
TRACK_BACKGROUND_SIZE  EQU     $C800
RESOURCE_TABLE_RUNTIME EQU     $4C6A
RESOURCE_ENTRY_SIZE    EQU     22
RESOURCE_ENTRY_COUNT   EQU     108

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
		dc.w	10		;ws_Version
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

;============================================================================

	IFD BARFLY
	DOSCMD	"WDate  >T:date"
	ENDC


DECL_VERSION:MACRO
	dc.b	"1.2"
	IFD BARFLY
		dc.b	" "
		INCBIN	"T:date"
	ENDC
	ENDM


_name		dc.b	"Indy Heat"
		dc.b	0
_copy		dc.b	"1992 The Sales Curve",0
_info		dc.b	"adapted & fixed by Mr Larmer & JOTD",10,10
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
trainer
		dc.l	0
		dc.l	0

;--------------------------------

patch_boot
        bsr.w   load_race_setups

        lea     pl_boot(pc),a0
        sub.l   a1,a1
        move.l  _resload(pc),a2
        jsr     resload_Patch(a2)
        bsr     _flushcache

        jmp     $1050.w


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

;--------------------------------

load_race_setups
        movem.l d0-d7/a0-a6,-(a7)

        lea     race_setup_names(pc),a4
        lea     RACE_RUNTIME_BASE.w,a3
        moveq   #10,d7                          ; eleven race records

.next_race
        ; Filename table contains 16-bit offsets from race_setup_names.
        ; Using dc.w label-base keeps the slave position-independent and avoids
        ; relocation records, which WHDLoad rejects.
        moveq   #0,d0
        move.w  (a4)+,d0
        lea     race_setup_names(pc),a0
        adda.w  d0,a0                           ; optional filename
        move.l  a0,a5                           ; preserve filename for LoadFile
        move.l  _resload(pc),a2
        jsr     resload_GetFileSize(a2)
        cmp.l   #RACE_SETUP_SIZE,d0
        bne.b   .skip_race                      ; absent or wrong size: untouched

        move.l  a5,a0
        lea     race_setup_buffer(pc),a1
        move.l  _resload(pc),a2
        jsr     resload_LoadFile(a2)

        lea     race_setup_buffer(pc),a0

        ; Scatter the compact race-record fields.
        move.w  (a0)+,$28(a3)                   ; laps
        move.l  (a0)+,$5C(a3)                   ; flag X/Y (two words)
        move.l  (a0)+,$62(a3)                   ; start X 16.16
        move.l  (a0)+,$66(a3)                   ; start Y 16.16
        move.w  (a0)+,$6A(a3)                   ; orientation/mirror word

        ; The remaining $58 bytes are the four original pit records.
        move.l  $32(a3),a1                      ; runtime pit block pointer
        moveq   #PIT_LONG_COUNT_MINUS1,d6
.copy_pits
        move.l  (a0)+,(a1)+
        dbf     d6,.copy_pits

.skip_race
        lea     RACE_RECORD_SIZE(a3),a3
        dbf     d7,.next_race

        movem.l (a7)+,d0-d7/a0-a6
        rts

race_setup_names
        dc.w    race_setup_r01-race_setup_names
        dc.w    race_setup_r02-race_setup_names
        dc.w    race_setup_r03-race_setup_names
        dc.w    race_setup_r04-race_setup_names
        dc.w    race_setup_r05-race_setup_names
        dc.w    race_setup_r06-race_setup_names
        dc.w    race_setup_r07-race_setup_names
        dc.w    race_setup_r08-race_setup_names
        dc.w    race_setup_r09-race_setup_names
        dc.w    race_setup_r10-race_setup_names
        dc.w    race_setup_r11-race_setup_names

race_setup_r01 dc.b "indyheat_r01_setup.bin",0
race_setup_r02 dc.b "indyheat_r02_setup.bin",0
race_setup_r03 dc.b "indyheat_r03_setup.bin",0
race_setup_r04 dc.b "indyheat_r04_setup.bin",0
race_setup_r05 dc.b "indyheat_r05_setup.bin",0
race_setup_r06 dc.b "indyheat_r06_setup.bin",0
race_setup_r07 dc.b "indyheat_r07_setup.bin",0
race_setup_r08 dc.b "indyheat_r08_setup.bin",0
race_setup_r09 dc.b "indyheat_r09_setup.bin",0
race_setup_r10 dc.b "indyheat_r10_setup.bin",0
race_setup_r11 dc.b "indyheat_r11_setup.bin",0
        even

race_setup_buffer
        ds.b    RACE_SETUP_SIZE
        even

; ---------------------------------------------------------------------------
; External decompressed circuit-background override
;
; The game's Load routine reads the compressed File Imploder block into A0.
; The caller then decrunches that block in place.  Therefore a raw $C800 editor
; export MUST NOT be loaded from patch_boot or directly over A0 before Load
; returns: the game's decruncher would try to decrunch the raw bitmap.
;
; Instead Load does two small jobs:
;   1. at entry, apply an override armed by the PREVIOUS background disk read;
;      by now that previous block has returned to the resource loader and been
;      decrunched in place at its original A0 destination;
;   2. before a new disk read, identify whether D1.w is one of the ten circuit
;      background resources and, if so, remember A0 + its external filename.
;
; Track setup loads further support resources (+1/+2/+3), so the next Load call
; occurs after the background decrunch and supplies the safe replacement point.
; Missing or non-$C800 files simply leave the original decompressed bitmap alone.
; ---------------------------------------------------------------------------

apply_pending_background
        movem.l d0-d2/a0-a4,-(a7)

        lea     pending_background_name(pc),a3
        move.l  (a3),d0
        beq.b   .done
        move.l  d0,a0

        lea     pending_background_dest(pc),a4
        move.l  (a4),d1
        beq.b   .clear
        move.l  d1,a1

        ; Clear first: resload calls must never leave a stale pending request.
        clr.l   (a3)
        clr.l   (a4)

        move.l  a0,a3                  ; preserve filename across GetFileSize
        move.l  a1,a4                  ; preserve final decrunched destination
        move.l  _resload(pc),a2
        jsr     resload_GetFileSize(a2)
        cmp.l   #TRACK_BACKGROUND_SIZE,d0
        bne.b   .done                  ; absent/wrong size -> keep original

        move.l  a3,a0
        move.l  a4,a1
        move.l  _resload(pc),a2
        jsr     resload_LoadFile(a2)   ; overwrite decompressed $C800 bitmap
        bra.b   .done

.clear
        clr.l   (a3)
        clr.l   (a4)
.done
        movem.l (a7)+,d0-d2/a0-a4
        rts

; D1.w = disk sector requested by the game
; A0   = destination used for the compressed block / in-place decrunch
arm_background_override
        movem.l d0-d4/a0-a3,-(a7)
        move.w  d1,d4

        lea     RESOURCE_TABLE_RUNTIME.w,a1
        moveq   #RESOURCE_ENTRY_COUNT-1,d3
.find_resource
        cmp.w   2(a1),d4               ; resource first sector?
        bne.b   .next_resource
        move.l  6(a1),d2
        cmp.l   #TRACK_BACKGROUND_SIZE,d2
        bne.b   .done                  ; same sector but not a track-sized bitmap

        moveq   #0,d0
        move.w  (a1),d0                ; resource ID
        lea     background_override_names(pc),a2
.find_name
        move.w  (a2)+,d2                        ; resource ID
        cmp.w   #$FFFF,d2
        beq.b   .done
        cmp.w   d0,d2
        beq.b   .name_match
        addq.l  #2,a2                           ; skip relative filename offset
        bra.b   .find_name

.name_match
        moveq   #0,d2
        move.w  (a2)+,d2                        ; offset from table base
        lea     background_override_names(pc),a3
        adda.w  d2,a3

        lea     pending_background_name(pc),a2
        move.l  a3,(a2)
        lea     pending_background_dest(pc),a2
        move.l  a0,(a2)
        bra.b   .done

.next_resource
        lea     RESOURCE_ENTRY_SIZE(a1),a1
        dbf     d3,.find_resource
.done
        movem.l (a7)+,d0-d4/a0-a3
        rts

background_override_names
        ; Resource ID followed by 16-bit filename offset from this table base.
        ; No absolute label pointers: WHDLoad slaves must contain no relocations.
        dc.w    $39,bg_39_name-background_override_names
        dc.w    $3D,bg_3d_name-background_override_names
        dc.w    $41,bg_41_name-background_override_names
        dc.w    $45,bg_45_name-background_override_names
        dc.w    $49,bg_49_name-background_override_names
        dc.w    $4D,bg_4d_name-background_override_names
        dc.w    $5A,bg_5a_name-background_override_names
        dc.w    $5E,bg_5e_name-background_override_names
        dc.w    $62,bg_62_name-background_override_names
        dc.w    $66,bg_66_name-background_override_names
        dc.w    $FFFF,0

even
bg_39_name      dc.b "indyheat_res39_background.bin",0
bg_3d_name      dc.b "indyheat_res3D_background.bin",0
bg_41_name      dc.b "indyheat_res41_background.bin",0
bg_45_name      dc.b "indyheat_res45_background.bin",0
bg_49_name      dc.b "indyheat_res49_background.bin",0
bg_4d_name      dc.b "indyheat_res4D_background.bin",0
bg_5a_name      dc.b "indyheat_res5A_background.bin",0
bg_5e_name      dc.b "indyheat_res5E_background.bin",0
bg_62_name      dc.b "indyheat_res62_background.bin",0
bg_66_name      dc.b "indyheat_res66_background.bin",0
        even

pending_background_name
        dc.l    0
pending_background_dest
        dc.l    0

;--------------------------------



patch_main

	; old Mr Larmer code to emulate stackframe
	; (fixed crash on 68010+ but unfortunately incompatible with 68000!)
	;	subq.l	#2,a7
	;	move.w	2(a7),(a7)
	;	move.l	4(a7),2(a7)
	;	move.w	#$80,6(a7)

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

                ; If the previous disk read was a track background, its caller
                ; has now completed the in-place Imploder decrunch.  Replace the
                ; final $C800 bitmap before processing this next resource load.
                bsr.w   apply_pending_background

		tst.w	d2
		beq.b	.skip

		btst	#0,d3
		bne.b	Save

                ; D1 is still the original sector number and A0 is the resource
                ; buffer which the game will decrunch in place after we return.
                bsr.w   arm_background_override

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
