; Indy Heat v0.11 editor development hook
; Replace the existing patch_boot routine with this version and add the
; helper/filename below. Requires the existing _resload, _flushcache and
; pl_boot symbols from IndyHeatHD (1.1).asm.
;
; resload_LoadFile convention: A0 = filename, A1 = destination.

patch_boot
	bsr.b	load_editor_main

	lea	pl_boot(pc),a0
	sub.l	a1,a1
	move.l	_resload(pc),a2
	jsr	resload_Patch(a2)
	bsr	_flushcache

	jmp	$1050.w

load_editor_main
	movem.l	d0-d1/a0-a2,-(a7)
	lea	_editor_main_name(pc),a0
	move.l	_resload(pc),a2
	jsr	resload_GetFileSize(a2)
	tst.l	d0
	beq.b	.no_editor_main
	cmp.l	#$1206A,d0
	bne.b	.no_editor_main       ; wrong size: leave original image intact

	lea	_editor_main_name(pc),a0
	lea	$1000.w,a1
	jsr	resload_LoadFile(a2)

.no_editor_main
	movem.l	(a7)+,d0-d1/a0-a2
	rts

_editor_main_name
	dc.b	"indyheat_main_modified_v011.bin",0
	even
