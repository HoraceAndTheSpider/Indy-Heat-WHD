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
; Development 1.3 test 47 retains the runtime-proven test-46 championship restart
; and switches CUSTOM2 playlist/runtime CPU-choice handling to the compact editor v0.122
; contract.  The active event is still rebuilt immediately by custom_event_advance, so
; Gasoline Alley sees the upcoming race record before its upgrade-choice processing.
; Circuit CPU values are inherited from the restored template / optional cpu_choices.bin;
; playlist CPU values, when present, override all six families together.
;
; Test 47 also removes the largest CUSTOM2-only zero-filled work buffers from the Slave
; image.  They now live in the extra Chip-RAM workspace above the established $95FFF
; active arena; retail low-memory mode remains untouched.
;
; Test 44 retains the test-43 variable-playlist/custom-resource
; architecture and consumes the editor v0.114 authored route/pitlane fields.
; Test 43 already fixed the native race-start helper at $6364, which otherwise
; forces A6+$3DD6 back to $5902 (Illinois/event 1) after playlist selection.
; The custom-resource replacement path for circuit_10..99 uses one permanent
; active custom-circuit
; arena above the original 512 KiB game address space:
; - require WHDLoad v20 for ws_MemConfig support;
; - default BaseMem is $C0000 (768 KiB Chip RAM);
; - MemConfig=1 selects the original $80000 (512 KiB) retail-only footprint;
; - CUSTOM2=1 fails immediately and visibly when the selected BaseMem does not
;   include the complete custom arena;
; - preserve the original CUSTOM1 trainer options and CUSTOM2 custom-track gate;
; - compact IHPL uses zero-based circuit indexes 0..99 plus optional lap/CPU override;
; - circuit_00..09 select the ten proven retail physical templates;
; - circuit_10..99 use template.bin when present (word 0..9) so custom
;   routes may have variable waypoint counts; existing packages without it
;   retain the test-17 unique-retail-count inference for compatibility;
; - every active circuit_10..99 reuses the same dedicated high-Chip slots:
;     background   $80000..
;     foreground   $8D000..
;     surface      $90000..
;     recovery     $92000..
;     preview      $93000..
;     routes/IHWP  $94000..
;     pits/setup/presentation/name/template and diagnostics $95000..$95FFF;
; - background/foreground/surface/recovery are loaded directly into those fixed
;   slots; four private copies of the active template's resource-directory entries
;   live at $95500, with their runtime pointers aimed at the high payloads;
; - only the disposable active race record is repointed to those private entries;
;   the retail resource directory is never modified, and every event rebuild starts
;   from a pristine template captured in the high CUSTOM2 workspace;
; - the game's normal allocator/load/free calls are bypassed only while the active
;   race's private entries address the dedicated custom track range;
; - preview.bin is loaded once into its fixed high slot, then copied into the
;   game's temporary raw preview buffer at the already-proven $4440 post-decrunch
;   hook immediately before the game converts it into its object;
; - no circuit_10..99 background/foreground/surface/recovery data is deferred to
;   a later Load call or written into a retail allocator-owned destination;
; - IHWP stored records use the established bytewise-complement encoding and
;   are decoded with NOT.W/NOT.B for X, progress, Y and link respectively;
; - circuit_10..99 resource/template/route/settings/pit installation is mandatory:
;   failure uses an explicit WHDLoad requester instead of continuing with retail
;   template data;
; - the three race descriptors are repointed to the active route arena with
;   authored start/end/count values, then route_settings.bin writes the three
;   explicit minimum-previous-sequence lap guards at race+$0A/+$16/+$22;
; - race_setup.bin is the current exact $70 package layout; its appended words
;   explicitly write pit pickup centre X/top Y/half-width and Pit approach Y;
; - custom routes retain each authored route's independent point-0 and explicit boundary;
;   no retail shared-boundary byte alias is required between route A/B or B/C;
; - after the ten pristine retail templates are captured into the high CUSTOM2 workspace,
;   retail circuit_00..09 events execute from that circuit's original native race-record
;   slot, restored from its pristine template before each reuse;
; - only circuit_10..99 uses the disposable $5902 staging record, preserving the
;   runtime-proven custom-first path while avoiding retail resource-pointer transplants;
; - regional-map interception remains unchanged from the runtime-proven path;
; - preserve the established editor package files: background, foreground,
;   surface, recovery, preview, waypoints, route_settings, race_setup,
;   presentation, optional name.bin, optional cpu_choices.bin and optional template.bin;
; - explicit playlist fields are applied last; laps=0 retains the circuit/package
;   race_setup lap total, and bit-7 CPU values override all six circuit weights;
; - retain the runtime-proven 0-99 lap compositor and regional-map replacement;
; - in CUSTOM2=1 only, move the retail reserved live-lap states 13/14 to
;   100/101 so extended gameplay lap values do not collide with finish state;
; - leave the shared timer/current-lap renderer at $6B02 completely untouched;
; - cap the supported custom race length at 20 laps.
;
; Current development IHPL (variable length, no version field):
;   +00.l "IHPL"  +04.b count=1..99
;   each event:
;     +00.b circuit/flags: bits 0..6 circuit 0..99, bit 7 = playlist CPU values
;     +01.b laps: 0 = inherit circuit, otherwise 2..20
;     +02..+07.b optional Turbos/Brakes/Tyres/Crew/MPG/Engine values when bit 7 set
; A normal inherited event is therefore two bytes; a playlist-CPU event is eight bytes.
;
; Development versioning for this work is "1.3 test N".  The final release
; number remains 1.3; test numbering is not a separate release series.
;---------------------------------------------------------------------------*

RACE_RUNTIME_BASE       EQU     $5902           ; main+$4902 plus runtime $1000
RACE_RECORD_SIZE        EQU     $82
RACE_RECORD_COUNT       EQU     11
RACE_SENTINEL           EQU     $5E98
RACE_SETUP_LEGACY_SIZE  EQU     $68             ; indyheat_rXX_setup.bin legacy override only
RACE_SETUP_SIZE         EQU     $70             ; current circuit package layout
RACE_NAME_SIZE          EQU     $12             ; race+$70..+$81, 17 display bytes + NUL
CIRCUIT_TEMPLATE_SIZE   EQU     2               ; optional template.bin, big-endian word 0..9
PIT_LONG_COUNT_MINUS1   EQU     21              ; $58 / 4 = 22 longs -> DBF 21
TRACK_COUNT             EQU     10
TRACK_TEMPLATE_SIZE     EQU     TRACK_COUNT*RACE_RECORD_SIZE
PLAYLIST_MAX_CIRCUIT    EQU     99
PLAYLIST_MAX_EVENTS     EQU     99
PLAYLIST_HEADER_SIZE    EQU     5               ; "IHPL" + count.b
PLAYLIST_MIN_ENTRY_SIZE EQU     2               ; circuit/flags.b + laps.b
PLAYLIST_CPU_ENTRY_SIZE EQU     8               ; base two bytes + six CPU values
PLAYLIST_MAX_SIZE       EQU     PLAYLIST_HEADER_SIZE+(PLAYLIST_MAX_EVENTS*PLAYLIST_CPU_ENTRY_SIZE) ; $31D
PLAYLIST_MAGIC          EQU     $4948504C        ; "IHPL" file signature
PLAYLIST_CIRCUIT_MASK   EQU     $7F
CIRCUIT_CPU_CHOICES_SIZE EQU    6
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
REGION_SELECTOR_LEGACY_SIZE EQU  RACE_RECORD_COUNT
REGION_SELECTOR_SIZE    EQU     PLAYLIST_MAX_EVENTS
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
CIRCUIT_ROUTE_SETTINGS_SIZE EQU  $0C
CIRCUIT_ROUTE_SETTINGS_MAGIC EQU $49485253       ; "IHRS"
CIRCUIT_ROUTE_SETTINGS_VERSION EQU 1
CUSTOM_PIT_SLOT_SIZE    EQU     $58

; Test-33 dedicated active custom-circuit arena.  The original game owns only
; $00000..$7FFFF; these addresses exist only in the default $C0000 BaseMem mode.
CUSTOM_BACKGROUND_BASE      EQU $80000
CUSTOM_BACKGROUND_SLOT_SIZE EQU $0D000          ; next slot begins at $8D000
CUSTOM_FOREGROUND_BASE      EQU $8D000
CUSTOM_FOREGROUND_SLOT_SIZE EQU $03000
CUSTOM_SURFACE_BASE         EQU $90000
CUSTOM_SURFACE_SLOT_SIZE    EQU $02000
CUSTOM_RECOVERY_BASE        EQU $92000
CUSTOM_RECOVERY_SLOT_SIZE   EQU $01000
CUSTOM_TRACK_RESOURCE_END   EQU $93000          ; exclusive range for four raw track resources

CUSTOM_PREVIEW_BASE         EQU $93000
CUSTOM_PREVIEW_SLOT_SIZE    EQU $01000
CUSTOM_ROUTE_ARENA_BASE     EQU $94000
CUSTOM_ROUTE_ARENA_SIZE     EQU CIRCUIT_WAYPOINT_BUFFER_SIZE
CUSTOM_ROUTE_ARENA_END      EQU CUSTOM_ROUTE_ARENA_BASE+CUSTOM_ROUTE_ARENA_SIZE ; $94800
CUSTOM_PIT_ARENA_BASE       EQU $95000
CUSTOM_RACE_SETUP_BASE      EQU $95100
CUSTOM_PRESENTATION_BASE    EQU $95200
CUSTOM_NAME_BASE            EQU $95300
CUSTOM_TEMPLATE_BASE        EQU $95400
CUSTOM_RESOURCE_META_BASE   EQU $95500          ; four private 22-byte resource entries
CUSTOM_RESOURCE_META_SIZE   EQU 4*RESOURCE_ENTRY_SIZE ; $58
CUSTOM_ACTIVE_RACE_BASE      EQU RACE_RUNTIME_BASE ; circuit_10+ disposable live $82 race record
CUSTOM_ACTIVE_RACE_END       EQU CUSTOM_ACTIVE_RACE_BASE+RACE_RECORD_SIZE
CUSTOM_DIAG_BASE            EQU $95F00
CUSTOM_DIAG_FLAGS           EQU CUSTOM_DIAG_BASE+$F0
CUSTOM_DIAG_FAILURE         EQU CUSTOM_DIAG_BASE+$F2

; Test-47 CUSTOM2-only workspace.  These are scratch/index buffers, not game-owned
; memory, and moving them here removes their zero-filled ds.* payload from the Slave.
CUSTOM_WORK_ROUTE_SETTINGS  EQU $96000          ; $0C
CUSTOM_WORK_PREVIEW_IDS     EQU $96010          ; 10 words = $14
CUSTOM_WORK_PATH            EQU $96030          ; 48 bytes
CUSTOM_WORK_PRESENTATION    EQU $96060          ; $14
CUSTOM_WORK_CPU_CHOICES     EQU $96080          ; six bytes
CUSTOM_WORK_REGION_SELECTOR EQU $96090          ; 99 bytes
CUSTOM_WORK_PLAYLIST_NAME   EQU $96100          ; 128 bytes
CUSTOM_WORK_WAYPOINTS       EQU $96200          ; $0800
CUSTOM_WORK_PLAYLIST        EQU $96A00          ; max $31D, slot rounded to $0320
CUSTOM_WORK_TEMPLATE_MAP    EQU $96D20          ; 99 words = $C6
CUSTOM_WORK_CIRCUIT_MAP     EQU $96DE6          ; 99 words = $C6
CUSTOM_WORK_TRACK_TEMPLATES EQU $96F00          ; 10 * $82 = $514
CUSTOM_ACTIVE_END           EQU $98000          ; minimum BaseMem for CUSTOM2=1

CUSTOM_FAIL_TEMPLATE    EQU     1
CUSTOM_FAIL_ROUTES      EQU     2
CUSTOM_FAIL_PITS        EQU     3
CUSTOM_FAIL_ASSETS      EQU     4
CUSTOM_FAIL_PLAYLIST    EQU     5


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
CHIPMEMSIZE = $C0000
LOWMEM_CHIPMEMSIZE = $80000
EXPMEMSIZE = $0

;======================================================================

_base
		SLAVE_HEADER		;ws_Security + ws_ID
		dc.w	20		;ws_Version (MemConfig support)
;;		dc.w	WHDLF_NoError|WHDLF_EmulTrap	;ws_flags
		dc.w	WHDLF_NoError
_basememsize
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
		dc.w	_config-_base		;ws_config
		dc.w	_memcfg-_base		;ws_MemConfig (WHDLoad v20+)

_config:	dc.b    "C1:X:Infinite coins:0;"	; ws_config;
		dc.b    "C1:X:No $150k bonus for coin use:1;"
		dc.b    "C2:B:Custom track mode;"
		dc.b    0
		even
_memcfg
		dc.l	LOWMEM_CHIPMEMSIZE,0	; MemConfig=1: 512 KiB Chip, retail only
		dc.l	0			; end of alternate memory configurations

;============================================================================

	IFD BARFLY
	DOSCMD	"WDate  >T:date"
	ENDC


DECL_VERSION:MACRO
	dc.b	"1.3 test 47"
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

	; MemConfig=1 deliberately restores the original 512 KiB footprint for
	; retail-only users.  CUSTOM2=1 needs the fixed active arena plus workspace
	; through $97FFF.
		move.l	_custom2(pc),d0
		cmp.l	#1,d0
		bne.b	.memory_ok
		move.l	_basememsize(pc),d0
		cmp.l	#CUSTOM_ACTIVE_END,d0
		bhs.b	.memory_ok
		lea	custom_fail_memory_msg(pc),a0
		bra.w	abort_custom_event
.memory_ok

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
	; CUSTOM2=1 captures the ten retail source templates before any compatibility
	; staging write. Legacy per-event setup files remain a retail-mode feature only;
	; custom mode rebuilds one disposable race record for each IHPL event.
	move.l	_custom2(pc),d0
	cmp.l	#1,d0
	beq.b	.custom_patches

	bsr.w	load_race_setups
	lea	pl_boot(pc),a0
	bra.b	.apply_patches

.custom_patches
	; Validate/index the playlist and capture pristine retail templates.
	; Retail events later use their original native record slots; circuit_10+ uses $5902.
	bsr.w	load_region_selector
	bsr.w	apply_playlist
	bsr.w	clear_custom_diag
	; Test 41 retains the test-40 event-zero activation. Retail circuits run from their own original
	; native record slot; circuit_10+ retains the proven $5902 staging path.
	bsr.w	activate_custom_event
	bsr.w	install_custom_championship_text
	lea	PL_CUSTOMTRACKS(pc),a0

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

	; Track the native championship event independently of A6+$3DD6 load timing.
	; $631C is MOVE.L #$5902,$3DD6(A6), eight bytes total.
	PL_PSS	$631C,custom_event_init,2
	; $634E calls the six-byte helper at $6364, whose retail body is simply
	; LEA $5902,A0 / RTS. $6350 immediately writes that A0 back to A6+$3DD6,
	; undoing the playlist selection. Return the selected active race instead.
	PL_P	$6364,custom_active_race_address
	; $6508 is the native +$82 / $5E98 event-advance routine.
	PL_P	$6508,custom_event_advance

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

	; Final championship MPH average. Retail divides player+$44 by the fixed
	; eleven-race season length at $8ECA. Replace MOVEQ/MOVE.W/DIVU as one unit.
	PL_PSS	$8EC4,custom_championship_mph_average,4

	; Current-lap tower only.  $69B8 prepares the race HUD position and reads
	; the racer's live lap/state from $26(A0).  At $69C8 retail loads the
	; racer colour/source pointer from $28(A0), then tail-branches to $6B02.
	; Replace exactly those final 8 bytes.  The timer's $6A22->$6B02 path
	; remains byte-for-byte untouched.
	PL_PSS	$69C8,custom_current_lap_dispatch,2

	; Track resources normally use protected entries $BA50/$BB1C.  Those addresses
	; deliberately land on the register-mask word of MOVEM prologues at $BA4E/$BB1A
	; and rely on the original protection/exception context.  Test 42 leaves every
	; untouched game call site exactly as retail: only these four track-resource
	; wrappers bypass the trap when they must fall back to a stock resource.
	PL_PSS	$6578,custom_load_background,2
	PL_PSS	$659C,custom_free_background,2
	PL_PSS	$58A8,custom_load_foreground,2
	PL_PSS	$58B6,custom_load_surface,2
	PL_PSS	$58C4,custom_load_recovery,2
	PL_PSS	$58DC,custom_free_foreground,2
	PL_PSS	$58E8,custom_free_surface,2
	PL_PSS	$58F4,custom_free_recovery,2

	; $4432 is the retail descriptor/object loader.  By $4440 its $BA50
	; resource load/decrunch has completed and entry+14 is valid, but the raw
	; resource has not yet been converted into the descriptor's object.
	; Replace only the active custom event's race+$46 preview at that point.
	PL_P	$4440,custom_preview_postdecrunch

	PL_NEXT	pl_boot


;---------------------------------------------------------------------------
; CUSTOM HIGH-MEMORY TRACK RESOURCE LOAD/FREE BRIDGE — TEST 33
;
; The original game passes an entry+2 resource-directory pointer in A0 to
; $BA50/$BB1C.  entry+14 is therefore 12(A0).  If that runtime pointer is one
; of the four dedicated high-Chip slots, the package payload is already resident
; and neither the retail allocator nor decompressor owns it.  Otherwise replay
; the original resource routine exactly.
;---------------------------------------------------------------------------

custom_load_background
	movea.l	$36(a0),a0
	bra.w	custom_load_resource_entry
custom_load_foreground
	movea.l	$3A(a2),a0
	bra.w	custom_load_resource_entry
custom_load_surface
	movea.l	$3E(a2),a0
	bra.w	custom_load_resource_entry
custom_load_recovery
	movea.l	$42(a2),a0

custom_load_resource_entry
	move.l	d0,-(a7)
	move.l	12(a0),d0
	cmp.l	#CUSTOM_BACKGROUND_BASE,d0
	blo.b	.retail
	cmp.l	#CUSTOM_TRACK_RESOURCE_END,d0
	bhs.b	.retail
	move.l	(a7)+,d0
	rts
.retail
	; $BA50 is the protected entry (the $00FC MOVEM mask word), not an
	; instruction boundary.  Reproduce the skipped prologue at $BA4E and enter
	; the aligned body at $BA52; its own $4CDF,$3F00 epilogue restores A0-A5.
	move.l	(a7)+,d0
	movem.l	a0-a5,-(a7)
	jmp	$BA52.l

custom_free_background
	movea.l	$36(a0),a0
	bra.w	custom_free_resource_entry
custom_free_foreground
	movea.l	$3A(a2),a0
	bra.w	custom_free_resource_entry
custom_free_surface
	movea.l	$3E(a2),a0
	bra.w	custom_free_resource_entry
custom_free_recovery
	movea.l	$42(a2),a0

custom_free_resource_entry
	move.l	d0,-(a7)
	move.l	12(a0),d0
	cmp.l	#CUSTOM_BACKGROUND_BASE,d0
	blo.b	.retail
	cmp.l	#CUSTOM_TRACK_RESOURCE_END,d0
	bhs.b	.retail
	move.l	(a7)+,d0
	rts
.retail
	; Mirror the original $BB1A MOVEM prologue and enter the aligned free body.
	move.l	(a7)+,d0
	movem.l	a0-a5,-(a7)
	jmp	$BB1E.l


;---------------------------------------------------------------------------
; CUSTOM GASOLINE ALLEY MINIMAP — TEST 33
;
; Retail object loader at $4432 (A0 = 12-byte descriptor):
;   $4432  MOVEA.L A0,A1
;   $4434  MOVE.L  A1,-(SP)
;   $4436  MOVEA.L 6(A1),A0       ; resource-table +2 pointer
;   $443A  BSR     $BA50          ; load/decrunch resource
;   $443E  MOVEA.L (SP)+,A1
;   $4440  MOVE.L  A1,-(SP)       ; hook here
;   ...
;   $4456  MOVEA.L 6(A1),A0
;   $445A  MOVEA.L 12(A0),A0      ; entry+14 raw resource pointer
;
; Hooking $4440 guarantees the raw preview resource exists, while still replacing
; it before the retail object-conversion routine consumes it.  The six bytes
; displaced by PL_P are replayed exactly before resuming at $4446.
;---------------------------------------------------------------------------

custom_preview_postdecrunch
	movem.l	d0-d7/a0-a6,-(a7)

	; Resolve the slave-tracked active playlist event.
	moveq	#0,d0
	move.w	active_event_index(pc),d0
	cmp.w	#PLAYLIST_MAX_EVENTS-1,d0
	bhi.w	.done

	move.w	d0,d1
	add.w	d1,d1
	lea	CUSTOM_WORK_CIRCUIT_MAP,a0
	move.w	0(a0,d1.w),d5
	cmp.w	#TRACK_COUNT,d5
	blo.w	.done
	cmp.w	#PLAYLIST_MAX_CIRCUIT,d5
	bhi.w	.done

	; A1 is the descriptor currently being built.  Only replace the descriptor
	; that is exactly race+$46 for the active custom event.
	movea.l	active_race_ptr(pc),a0
	movea.l	$46(a0),a0
	cmpa.l	a0,a1
	bne.w	.done

	; Descriptor+6 points at +2 inside the resource-table entry.  At this exact
	; post-decrunch point, +12 from that pointer is the valid retail temporary raw
	; buffer which the object converter consumes at $445A.  The custom source is
	; already resident at CUSTOM_PREVIEW_BASE; do not reopen preview.bin here.
	movea.l	6(a1),a0
	move.l	4(a0),d3		; preview resource outLen (entry+6)
	movea.l	12(a0),a4		; retail temporary raw buffer (entry+14)
	move.l	a4,d0
	beq.w	.done
	tst.l	d3
	beq.w	.done
	cmp.l	#CUSTOM_PREVIEW_SLOT_SIZE,d3
	bhi.w	.done
	cmp.l	active_custom_preview_size(pc),d3
	bne.w	.done

	lea	CUSTOM_PREVIEW_BASE,a3
	move.w	d3,d6
	subq.w	#1,d6
.copy_preview
	move.b	(a3)+,(a4)+
	dbf	d6,.copy_preview

	lea	CUSTOM_DIAG_FLAGS,a0
	ori.w	#$000A,(a0)		; bit1 recognised + bit3 high-source copy

.done
	movem.l	(a7)+,d0-d7/a0-a6

	; Replay the six bytes replaced at $4440, then resume retail loader.
	move.l	a1,-(a7)
	move.w	4(a1),d0
	jmp	$4446


;---------------------------------------------------------------------------
; CUSTOM EVENT TRACKER / ACTIVE ARENA — TEST 33
;
; $631C initialises the native A6+$3DD6 event pointer to $5902.  The custom $6508
; replacement increments the playlist index and immediately activates the next event.
; This intentional look-forward is what makes Gasoline Alley use the upcoming race's
; CPU-choice weights.  circuit_10..99 still reuses the single $5902 staging record:
; custom->custom rewrites that record in place rather than allocating another slot.
;---------------------------------------------------------------------------

custom_active_race_address
	; Retail helper $6364 originally returned hard-coded $5902. In CUSTOM2 mode
	; return the slave-selected native retail slot or custom staging record.
	;
	; The first championship passes through $631C, but after a completed season the
	; game starts the next championship via the sole $6364 caller at $634E. At that
	; point custom_event_advance has deliberately left active_event_index equal to
	; playlist_event_count and released the active custom-resource state. Detect that
	; finished-season sentinel here, rebuild event zero, then return its fresh pointer.
	; Do not reset while index < count: that is normal Race 1 -> Race N progression.
	movem.l	d0-d1/a1,-(a7)
	moveq	#0,d0
	move.w	active_event_index(pc),d0
	moveq	#0,d1
	move.w	playlist_event_count(pc),d1
	cmp.w	d1,d0
	blo.b	.current_event
	lea	active_event_index(pc),a1
	clr.w	(a1)
	bsr.w	activate_custom_event
.current_event
	movem.l	(a7)+,d0-d1/a1
	movea.l	active_race_ptr(pc),a0
	rts

custom_event_init
	; Initial championship setup path. Test 45 made this reset explicit; retain it
	; for first-start/reinitialisation robustness. Subsequent completed-season restarts
	; are handled by custom_active_race_address above because $631C is not revisited.
	move.l	a0,-(a7)
	lea	active_event_index(pc),a0
	clr.w	(a0)
	move.l	(a7)+,a0
	bsr.w	activate_custom_event
	move.l	active_race_ptr(pc),$3DD6(a6)
	rts

custom_event_advance
	; Championship position is slave-owned. Retail events may use different native
	; race-record slots; circuit_10+ reuses the $5902 staging record.
	movem.l	d0-d1,-(a7)
	lea	active_event_index(pc),a0
	addq.w	#1,(a0)

	moveq	#0,d0
	move.w	playlist_event_count(pc),d0
	moveq	#0,d1
	move.w	(a0),d1
	cmp.w	d0,d1
	bhs.b	.sentinel

	bsr.w	activate_custom_event
	move.l	active_race_ptr(pc),d1
	move.l	d1,$3DD6(a6)
	movea.l	d1,a0
	movem.l	(a7)+,d0-d1
	rts

.sentinel
	move.w	d0,(a0)
	bsr.w	release_active_custom_resources
	bsr.w	clear_pending_track_overrides
	move.l	#RACE_SENTINEL,$3DD6(a6)
	lea	RACE_RUNTIME_BASE.w,a0
	movem.l	(a7)+,d0-d1
	rts

custom_championship_mph_average
	; Replaces retail MOVEQ #0,D0 / MOVE.W $44(A0),D0 / DIVU.W #11,D0.
	; player+$44 is the running sum of the per-race average MPH values.
	move.l	d1,-(a7)
	moveq	#0,d0
	move.w	$44(a0),d0
	moveq	#0,d1
	move.w	playlist_event_count(pc),d1
	bne.b	.have_count
	moveq	#1,d1
.have_count
	divu	d1,d0
	move.l	(a7)+,d1
	rts

install_custom_championship_text
	movem.l	d0/a0-a1,-(a7)
	lea	custom_championship_average_text(pc),a0
	move.l	#$8BEF,a1
.copy
	move.b	(a0)+,(a1)+
	bne.b	.copy
	movem.l	(a7)+,d0/a0-a1
	rts

custom_championship_average_text
	dc.b	"over all races",0
	even


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

	; TEST 25: capture one live comparison after the game's own waypoint setup
	; has run.  This does not alter race data and is inspectable at $7FF00.
	bsr.w	capture_custom_route_diag

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
	cmp.l	#RACE_SETUP_LEGACY_SIZE,d0
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
; route-settings scratch moved to CUSTOM_WORK_ROUTE_SETTINGS in test 47.
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
;             /route_settings.bin
;             /race_setup.bin
;             /presentation.bin
;             /name.bin          optional $12 Gasoline Alley circuit name
;             /cpu_choices.bin   optional six-byte Gasoline Alley CPU weights
;             /template.bin      optional word 0..9 for variable-count circuit_10+
;
; circuit_00..09 remain direct substitutes for the ten proven physical retail
; templates.  The compact playlist additionally selects circuit_10..99.  Those custom
; events are prepared by apply_playlist with private pit/waypoint storage; this
; stock-package pass deliberately skips them.
;
; Boot-time sidecars:
;   race_setup.bin       exact $70 current compact layout
;   route_settings.bin   IHRS v1 / $0C, three route lap-guard values
;   presentation.bin     IHPR v2 / $14
;   waypoints.bin        IHWP v1, three route payloads
;   name.bin          optional exact $12 copy of race+$70..+$81
;   cpu_choices.bin   optional six bytes: Turbos, Brakes, Tyres, Crew, MPG, Engine
;   template.bin      optional exact $02 structural retail template index
;
; circuit_00..09 retain the established deferred stock-package compatibility
; bridge.  circuit_10..99 do not use it: their graphical files are loaded into
; the dedicated $80000+ active arena when the event becomes active, and their
; structural resource-directory runtime pointers are repointed there.  All
; package files are exact-size validated before they are committed.
;---------------------------------------------------------------------------

apply_circuit_packages
	movem.l	d0-d7/a0-a6,-(a7)
	lea	CUSTOM_WORK_PREVIEW_IDS,a0
	moveq	#TRACK_COUNT-1,d0
.clear_preview
	move.w	#$FFFF,(a0)+
	dbf	d0,.clear_preview

	lea	RACE_RUNTIME_BASE.w,a3
	moveq	#0,d4			; processed-waypoint bit mask
	moveq	#0,d7			; championship event index
	moveq	#RACE_RECORD_COUNT-1,d6

.next_event
	; A compact-playlist custom-library event has already consumed its circuit_10+
	; sidecars and must not be reinterpreted as its structural circuit_00..09.
	move.w	d7,d0
	add.w	d0,d0
	lea	CUSTOM_WORK_CIRCUIT_MAP,a0
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

	; route_settings.bin is optional only on the stock-package bridge: with no
	; package sidecar the untouched retail descriptor guards remain authoritative.
	move.w	d5,d0
	bsr.w	load_circuit_route_settings

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
	lea	CUSTOM_WORK_PREVIEW_IDS,a1
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
; OUT: A0 -> shared CUSTOM_WORK_PATH
build_circuit_path
	movem.l	d1-d3/a1-a3,-(a7)

	lea	CUSTOM_WORK_PATH,a2
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

	lea	CUSTOM_WORK_PATH,a0
	movem.l	(a7)+,d1-d3/a1-a3
	rts


; IN: D0.w circuit index, A3 race record
apply_circuit_setup
	movem.l	d0-d7/a0-a6,-(a7)
	move.w	d0,d4			; circuit index

	lea	circuit_leaf_race_setup(pc),a1
	bsr.w	build_circuit_path
	move.l	a0,a5

	move.l	_resload(pc),a2
	jsr	resload_GetFileSize(a2)
	cmp.l	#RACE_SETUP_SIZE,d0
	bne.w	.done

	move.l	a5,a0
	cmp.w	#TRACK_COUNT,d4
	blo.b	.stock_setup_dest
	lea	CUSTOM_RACE_SETUP_BASE,a1
	bra.b	.load_setup
.stock_setup_dest
	lea	race_setup_buffer(pc),a1
.load_setup
	move.l	_resload(pc),a2
	jsr	resload_LoadFile(a2)

	cmp.w	#TRACK_COUNT,d4
	blo.b	.stock_setup_src
	lea	CUSTOM_RACE_SETUP_BASE,a0
	bra.b	.parse_setup
.stock_setup_src
	lea	race_setup_buffer(pc),a0
.parse_setup
	movea.l	a0,a6			; preserve $70 setup base for appended pitlane fields
	moveq	#0,d0
	move.w	(a0),d0
	beq.w	.done
	cmp.w	#CUSTOM_MAX_LAPS,d0
	bhi.w	.done

	move.w	(a0)+,$28(a3)		; laps
	move.l	(a0)+,$5C(a3)		; flag X/Y
	move.l	(a0)+,$62(a3)		; start X 16.16
	move.l	(a0)+,$66(a3)		; start Y 16.16
	move.w	(a0)+,$6A(a3)		; grid X mirror/sign field

	; circuit_10+ pits are committed by load_active_custom_pits. Stock package
	; pits retain the original native destination referenced by the selected race.
	cmp.w	#TRACK_COUNT,d4
	bhs.b	.skip_pits
	move.l	$32(a3),a1
	moveq	#PIT_LONG_COUNT_MINUS1,d6
.copy_pits
	move.l	(a0)+,(a1)+
	dbf	d6,.copy_pits
.skip_pits

	; v0.114 current package appends four explicit race-level pitlane fields.
	lea	$68(a6),a0
	move.w	(a0)+,$2C(a3)		; pit pickup centre X
	move.w	(a0)+,$2E(a3)		; pit pickup top Y
	move.w	(a0)+,$30(a3)		; pit pickup half-width
	move.w	(a0)+,$60(a3)		; Pit approach Y

	; Gasoline Alley renders race+$70..+$81.  Custom-library name.bin uses its
	; own high-Chip slot; stock package compatibility retains the local buffer.
	move.w	d4,d0
	lea	circuit_leaf_name(pc),a1
	bsr.w	build_circuit_path
	move.l	a0,a5

	move.l	_resload(pc),a2
	jsr	resload_GetFileSize(a2)
	cmp.l	#RACE_NAME_SIZE,d0
	bne.w	.done

	move.l	a5,a0
	cmp.w	#TRACK_COUNT,d4
	blo.b	.stock_name_dest
	lea	CUSTOM_NAME_BASE,a1
	bra.b	.load_name
.stock_name_dest
	lea	race_setup_buffer(pc),a1
.load_name
	move.l	_resload(pc),a2
	jsr	resload_LoadFile(a2)

	cmp.w	#TRACK_COUNT,d4
	blo.b	.stock_name_src
	lea	CUSTOM_NAME_BASE,a0
	bra.b	.validate_name
.stock_name_src
	lea	race_setup_buffer(pc),a0
.validate_name
	cmp.b	#0,RACE_NAME_SIZE-1(a0)
	bne.b	.done
	lea	$70(a3),a1
	moveq	#8,d6
.copy_name
	move.w	(a0)+,(a1)+
	dbf	d6,.copy_name

.done
	movem.l	(a7)+,d0-d7/a0-a6
	rts


; IN: D0.w circuit index, A3 race record
; OUT: D0.l = 1 success/inherit, 0 malformed sidecar
; Missing cpu_choices.bin deliberately inherits the restored circuit/template values.
; When present, six bytes expand to the six race+$50..+$5A words in retail chooser order.
apply_circuit_cpu_choices
	movem.l	d1-d7/a0-a6,-(a7)
	lea	circuit_leaf_cpu_choices(pc),a1
	bsr.w	build_circuit_path
	move.l	a0,a5
	move.l	_resload(pc),a2
	jsr	resload_GetFileSize(a2)
	tst.l	d0
	beq.b	.inherit
	cmp.l	#CIRCUIT_CPU_CHOICES_SIZE,d0
	bne.b	.failed

	move.l	a5,a0
	lea	CUSTOM_WORK_CPU_CHOICES,a1
	move.l	_resload(pc),a2
	jsr	resload_LoadFile(a2)

	lea	CUSTOM_WORK_CPU_CHOICES,a0
	lea	$50(a3),a1
	moveq	#CIRCUIT_CPU_CHOICES_SIZE-1,d6
.copy
	moveq	#0,d0
	move.b	(a0)+,d0
	move.w	d0,(a1)
	addq.l	#2,a1
	dbf	d6,.copy
.inherit
	moveq	#1,d0
	bra.b	.return
.failed
	moveq	#0,d0
.return
	movem.l	(a7)+,d1-d7/a0-a6
	rts


; IN: D0.w circuit index, D1.w event index, A3 race record
apply_circuit_presentation
	movem.l	d0-d7/a0-a6,-(a7)
	move.w	d0,d5			; circuit index
	move.w	d1,d6			; event index

	lea	circuit_leaf_presentation(pc),a1
	bsr.w	build_circuit_path
	move.l	a0,a5

	move.l	_resload(pc),a2
	jsr	resload_GetFileSize(a2)
	cmp.l	#CIRCUIT_PRESENTATION_SIZE,d0
	bne.w	.done

	move.l	a5,a0
	cmp.w	#TRACK_COUNT,d5
	blo.b	.stock_dest
	lea	CUSTOM_PRESENTATION_BASE,a1
	bra.b	.load
.stock_dest
	lea	CUSTOM_WORK_PRESENTATION,a1
.load
	move.l	_resload(pc),a2
	jsr	resload_LoadFile(a2)

	cmp.w	#TRACK_COUNT,d5
	blo.b	.stock_src
	lea	CUSTOM_PRESENTATION_BASE,a0
	bra.b	.validate
.stock_src
	lea	CUSTOM_WORK_PRESENTATION,a0
.validate
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

	move.w	$0A(a0),$4A(a3)
	move.w	$0C(a0),$4C(a3)
	move.w	$0E(a0),$4E(a3)
	move.w	$10(a0),$24(a3)
	move.w	$12(a0),$26(a3)

	lea	CUSTOM_WORK_REGION_SELECTOR,a1
	move.b	d0,0(a1,d6.w)

.done
	movem.l	(a7)+,d0-d7/a0-a6
	rts


; IN: D0.w circuit index, A3 race record
apply_circuit_waypoints
	movem.l	d0-d7/a0-a6,-(a7)

	; circuit_10+ routes are decoded/repointed only when that event is active.
	cmp.w	#TRACK_COUNT,d0
	bhs.w	.done

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
	lea	CUSTOM_WORK_WAYPOINTS,a1
	move.l	_resload(pc),a2
	jsr	resload_LoadFile(a2)

	lea	CUSTOM_WORK_WAYPOINTS,a0
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
	lea	CUSTOM_WORK_WAYPOINTS+8,a1
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
circuit_leaf_route_settings	dc.b	"route_settings.bin",0
circuit_leaf_race_setup	dc.b	"race_setup.bin",0
circuit_leaf_presentation	dc.b	"presentation.bin",0
circuit_leaf_name		dc.b	"name.bin",0
circuit_leaf_cpu_choices	dc.b	"cpu_choices.bin",0
circuit_leaf_template	dc.b	"template.bin",0
	even

circuit_resource_leaf_offsets
	dc.w	circuit_leaf_background-circuit_resource_leaf_offsets
	dc.w	circuit_leaf_foreground-circuit_resource_leaf_offsets
	dc.w	circuit_leaf_surface-circuit_resource_leaf_offsets
	dc.w	circuit_leaf_recovery-circuit_resource_leaf_offsets

; CUSTOM2 scratch moved to the fixed high-memory workspace in test 47:
; preview IDs, path builder, presentation scratch and waypoint scratch.
	even

;---------------------------------------------------------------------------
; Compact development playlist, explicitly opt-in through CUSTOM2=1.
;
; CUSTOM2 != 1 never probes the playlist. CUSTOM2 = 1 loads the current editor
; format into CUSTOM_WORK_PLAYLIST, validates the complete variable-length file,
; resolves structural templates for circuit_10..99, then snapshots the ten retail
; race templates.  No playlist/version compatibility layer is carried in the Slave.
;---------------------------------------------------------------------------

apply_playlist
	movem.l	d0-d7/a0-a6,-(a7)

	bsr.w	reset_playlist_event_maps
	bsr.w	resolve_playlist_name
	tst.l	d0
	beq.w	.invalid
	move.l	a0,a5

	move.l	_resload(pc),a2
	jsr	resload_GetFileSize(a2)
	cmp.l	#PLAYLIST_HEADER_SIZE+PLAYLIST_MIN_ENTRY_SIZE,d0
	blo.w	.invalid
	cmp.l	#PLAYLIST_MAX_SIZE,d0
	bhi.w	.invalid
	lea	playlist_file_size(pc),a0
	move.l	d0,(a0)
	move.l	d0,d4			; validated file size

	move.l	a5,a0
	lea	CUSTOM_WORK_PLAYLIST,a1
	move.l	_resload(pc),a2
	jsr	resload_LoadFile(a2)

	lea	CUSTOM_WORK_PLAYLIST,a0
	cmp.l	#PLAYLIST_MAGIC,(a0)
	bne.w	.invalid

	moveq	#0,d5
	move.b	4(a0),d5			; count.b
	cmp.w	#1,d5
	blo.w	.invalid
	cmp.w	#PLAYLIST_MAX_EVENTS,d5
	bhi.w	.invalid

	lea	CUSTOM_WORK_PLAYLIST,a4
	adda.l	d4,a4			; exact end of loaded file
	lea	PLAYLIST_HEADER_SIZE(a0),a1	; first variable event
	lea	CUSTOM_WORK_TEMPLATE_MAP,a5
	lea	CUSTOM_WORK_CIRCUIT_MAP,a6
	move.w	d5,d7
	subq.w	#1,d7

.validate_event
	; Every event needs at least circuit/flags.b + laps.b.
	move.l	a4,d0
	move.l	a1,d1
	sub.l	d1,d0
	cmp.l	#PLAYLIST_MIN_ENTRY_SIZE,d0
	blo.w	.invalid

	moveq	#0,d2
	move.b	(a1),d2
	andi.w	#PLAYLIST_CIRCUIT_MASK,d2
	cmp.w	#PLAYLIST_MAX_CIRCUIT,d2
	bhi.w	.invalid
	cmp.w	#TRACK_COUNT,d2
	bhs.b	.validate_custom
	move.w	d2,(a5)
	move.w	#$FFFF,(a6)
	bra.b	.validate_laps

.validate_custom
	move.w	d2,d0
	bsr.w	infer_custom_template
	tst.w	d0
	bmi.w	.custom_invalid
	move.w	d0,(a5)
	move.w	d2,(a6)

.validate_laps
	moveq	#0,d0
	move.b	1(a1),d0
	beq.b	.validate_size
	cmp.w	#2,d0
	blo.w	.invalid
	cmp.w	#CUSTOM_MAX_LAPS,d0
	bhi.w	.invalid

.validate_size
	moveq	#PLAYLIST_MIN_ENTRY_SIZE,d3
	btst	#7,(a1)
	beq.b	.size_ready
	moveq	#PLAYLIST_CPU_ENTRY_SIZE,d3
.size_ready
	move.l	a4,d0
	move.l	a1,d1
	sub.l	d1,d0
	cmp.l	d3,d0
	blo.w	.invalid
	adda.w	d3,a1
	addq.l	#2,a5
	addq.l	#2,a6
	dbf	d7,.validate_event

	; Variable-length format must consume the file exactly; trailing bytes are invalid.
	cmpa.l	a4,a1
	bne.w	.invalid

	bsr.w	capture_track_templates
	lea	playlist_event_count(pc),a0
	move.w	d5,(a0)
	bra.b	.done

.custom_invalid
	lea	CUSTOM_DIAG_FAILURE,a0
	move.w	#CUSTOM_FAIL_TEMPLATE,(a0)
	lea	custom_fail_template_msg(pc),a0
	bra.w	abort_custom_event

.invalid
	lea	CUSTOM_DIAG_FAILURE,a0
	move.w	#CUSTOM_FAIL_PLAYLIST,(a0)
	lea	custom_fail_playlist_msg(pc),a0
	bra.w	abort_custom_event
.done
	movem.l	(a7)+,d0-d7/a0-a6
	rts


reset_playlist_event_maps
	bsr.w	release_active_custom_resources
	bsr.w	clear_pending_track_overrides
	lea	active_event_index(pc),a0
	clr.w	(a0)
	lea	active_race_ptr(pc),a0
	move.l	#RACE_RUNTIME_BASE,(a0)
	lea	playlist_event_count(pc),a0
	clr.w	(a0)
	lea	playlist_file_size(pc),a0
	clr.l	(a0)
	lea	CUSTOM_WORK_CIRCUIT_MAP,a0
	lea	CUSTOM_WORK_TEMPLATE_MAP,a1
	moveq	#PLAYLIST_MAX_EVENTS-1,d0
.clear
	move.w	#$FFFF,(a0)+
	move.w	#$FFFF,(a1)+
	dbf	d0,.clear
	rts


; IN: D0.w = event index. OUT: A0 -> validated variable-length event entry.
; apply_playlist has already proved every entry boundary, so runtime lookup only scans
; the preceding bit-7 lengths.  This keeps the on-disk playlist compact without another
; per-event pointer table.
playlist_event_address
	movem.l	d1-d2,-(a7)
	move.w	d0,d2
	lea	CUSTOM_WORK_PLAYLIST+PLAYLIST_HEADER_SIZE,a0
.scan
	tst.w	d2
	beq.b	.found
	moveq	#PLAYLIST_MIN_ENTRY_SIZE,d1
	btst	#7,(a0)
	beq.b	.advance
	moveq	#PLAYLIST_CPU_ENTRY_SIZE,d1
.advance
	adda.w	d1,a0
	subq.w	#1,d2
	bra.b	.scan
.found
	movem.l	(a7)+,d1-d2
	rts


; IN: D0.w = custom circuit index 10..99
; OUT: D0.w = structural retail template 0..9, or -1
;
; Variable-count packages carry template.bin (one BE word 0..9).  Existing
; packages without it remain compatible through the test-17 unique count match.
; waypoints.bin itself is validated in either case before a template is accepted.
infer_custom_template
	movem.l	d1-d7/a0-a6,-(a7)
	move.w	d0,d7

	move.w	d7,d0
	bsr.w	validate_custom_waypoint_file
	tst.l	d0
	beq.w	.failed

	move.w	d7,d0
	lea	circuit_leaf_template(pc),a1
	bsr.w	build_circuit_path
	move.l	a0,a5
	move.l	_resload(pc),a2
	jsr	resload_GetFileSize(a2)
	tst.l	d0
	beq.b	.legacy_counts
	cmp.l	#CIRCUIT_TEMPLATE_SIZE,d0
	bne.w	.failed

	move.l	a5,a0
	lea	CUSTOM_TEMPLATE_BASE,a1
	move.l	_resload(pc),a2
	jsr	resload_LoadFile(a2)
	moveq	#0,d0
	move.w	CUSTOM_TEMPLATE_BASE,d0
	cmp.w	#TRACK_COUNT-1,d0
	bls.w	.return
	bra.w	.failed

.legacy_counts
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


; IN: D0.w = custom circuit index 10..99
; OUT: D0.l = 1 valid / loaded at CUSTOM_ROUTE_ARENA_BASE, 0 invalid
; SIDE: inferred_route_counts receives A/B/C ordinary point counts.
;
; Validation is deliberately format/safety based rather than retail-topology based.
; Custom routes may have independent point-0 and boundary records; the active
; loader preserves them and performs decoded link/bounds validation separately.
validate_custom_waypoint_file
	movem.l	d1-d7/a0-a6,-(a7)
	move.w	d0,d7

	lea	circuit_leaf_waypoints(pc),a1
	bsr.w	build_circuit_path
	move.l	a0,a5
	move.l	_resload(pc),a2
	jsr	resload_GetFileSize(a2)
	cmp.l	#56,d0			; 8-byte header + 3*(4 + one point + boundary)
	blo.w	.failed
	cmp.l	#CUSTOM_ROUTE_ARENA_SIZE,d0
	bhi.w	.failed
	move.l	d0,d6

	move.l	a5,a0
	lea	CUSTOM_ROUTE_ARENA_BASE,a1
	move.l	_resload(pc),a2
	jsr	resload_LoadFile(a2)

	lea	CUSTOM_ROUTE_ARENA_BASE,a0
	cmp.l	#CIRCUIT_WAYPOINT_MAGIC,(a0)
	bne.w	.failed
	cmp.w	#CIRCUIT_WAYPOINT_VERSION,4(a0)
	bne.w	.failed
	cmp.w	#CIRCUIT_WAYPOINT_ROUTES,6(a0)
	bne.w	.failed

	; Custom authoring may add/delete route points independently.  Validate only
	; the IHWP structure needed by the runtime: positive counts, one explicit
	; boundary per route, complete payloads, and exact file consumption.  Runtime
	; link safety is checked after decode in load_active_custom_routes.
	subq.l	#8,d6
	lea	8(a0),a1
	lea	inferred_route_counts(pc),a4
	moveq	#CIRCUIT_WAYPOINT_ROUTES-1,d5
.validate_route
	cmp.l	#4,d6
	blo.w	.failed

	moveq	#0,d0
	move.w	(a1),d0			; ordinary point count
	beq.w	.failed
	move.w	d0,(a4)+
	cmp.w	#1,2(a1)			; explicit boundary required by race descriptor
	bne.w	.failed
	lea	4(a1),a2			; first stored point
	subq.l	#4,d6

	mulu	#6,d0
	addq.l	#6,d0			; ordinary points + explicit boundary
	cmp.l	d0,d6
	blo.w	.failed
	adda.l	d0,a2
	sub.l	d0,d6
	movea.l	a2,a1
	dbf	d5,.validate_route

	tst.l	d6
	bne.w	.failed
	moveq	#1,d0
	bra.b	.return
.failed
	moveq	#0,d0
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
	lea	CUSTOM_WORK_PLAYLIST_NAME,a0
	move.l	#CUSTOM_NAME_BUFFER_SIZE,d0
	moveq	#0,d1			; reserved, required by API
	move.l	_resload(pc),a2
	jsr	resload_GetCustom(a2)
	tst.l	d0
	beq.b	.failed

	lea	CUSTOM_WORK_PLAYLIST_NAME,a0
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

	lea	CUSTOM_WORK_PREVIEW_IDS,a0
	moveq	#TRACK_COUNT-1,d0
.clear_preview
	move.w	#$FFFF,(a0)+
	dbf	d0,.clear_preview

	lea	track_source_offsets(pc),a4
	lea	CUSTOM_WORK_TRACK_TEMPLATES,a5
	lea	RACE_RUNTIME_BASE.w,a3
	moveq	#0,d5
	moveq	#TRACK_COUNT-1,d7
.next_track
	moveq	#0,d0
	move.w	(a4)+,d0
	move.l	a3,a0
	adda.w	d0,a0

	move.l	a3,d4
	movea.l	a0,a3
	move.w	d5,d0
	bsr.w	capture_preview_resource_id
	movea.l	d4,a3

	move.l	a5,a1
	bsr.w	copy_race_record
	lea	RACE_RECORD_SIZE(a5),a5
	addq.w	#1,d5
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
; Playlist filename, raw file and per-event maps live in CUSTOM_WORK_*.
playlist_event_count
	dc.w	0
playlist_file_size
	dc.l	0
active_event_index
	dc.w	0
	even
active_race_ptr
	dc.l	RACE_RUNTIME_BASE
active_custom_resource_template
	dc.w	$FFFF
	even
active_custom_resource_race
	dc.l	0
active_custom_preview_size
	dc.l	0
active_route_starts
	ds.l	CIRCUIT_WAYPOINT_ROUTES
active_route_ends
	ds.l	CIRCUIT_WAYPOINT_ROUTES
active_route_counts
	ds.w	CIRCUIT_WAYPOINT_ROUTES
	even
; Pristine retail templates live at CUSTOM_WORK_TRACK_TEMPLATES.
	even

;---------------------------------------------------------------------------
; ACTIVE CUSTOM EVENT ARENA / WORKSPACE — TEST 47
;
; The original Indy Heat program owns $00000..$7FFFF.  Default MemConfig=0
; allocates $C0000 BaseMem. $80000..$95FFF remains the active circuit_10+ arena;
; $96000..$97FFF is CUSTOM2-only scratch/index workspace moved out of the Slave image.
; Retail events use their own original native race-record slots; $5902 is reused only
; as the circuit_10+ staging record.
;
; MemConfig=1 selects the original $80000 BaseMem and is retail-only.
;---------------------------------------------------------------------------

activate_custom_event
	movem.l	d0-d7/a0-a6,-(a7)

	bsr.w	release_active_custom_resources
	bsr.w	clear_pending_track_overrides

	moveq	#0,d7
	move.w	active_event_index(pc),d7
	moveq	#0,d0
	move.w	playlist_event_count(pc),d0
	cmp.w	d0,d7
	bhs.w	.done
	cmp.w	#PLAYLIST_MAX_EVENTS-1,d7
	bhi.w	.done

	move.w	d7,d0
	add.w	d0,d0
	move.w	d0,d4
	lea	CUSTOM_WORK_TEMPLATE_MAP,a0
	move.w	0(a0,d4.w),d5
	cmp.w	#TRACK_COUNT-1,d5
	bhi.w	.asset_failed

	lea	CUSTOM_WORK_CIRCUIT_MAP,a0
	move.w	0(a0,d4.w),d6
	cmp.w	#$FFFF,d6
	bne.b	.have_circuit
	move.w	d5,d6
.have_circuit

	cmp.w	#TRACK_COUNT,d6
	bhs.b	.custom_record

	; Retail circuit_00..09: restore and use that circuit's own original native
	; race-record slot. Do not transplant its retail resource pointers elsewhere.
	moveq	#0,d0
	move.w	d5,d0
	mulu	#RACE_RECORD_SIZE,d0
	lea	CUSTOM_WORK_TRACK_TEMPLATES,a0
	adda.l	d0,a0

	move.w	d5,d0
	add.w	d0,d0
	lea	track_source_offsets(pc),a1
	moveq	#0,d1
	move.w	0(a1,d0.w),d1
	lea	RACE_RUNTIME_BASE.w,a1
	adda.w	d1,a1
	; copy_race_record uses D6 as its DBF counter. Preserve the resolved circuit
	; index: otherwise D6 returns as $FFFF and falls into the custom-assets path.
	move.w	d6,-(a7)
	bsr.w	copy_race_record
	move.w	(a7)+,d6

	; copy_race_record advances A1; reconstruct the selected native slot in A3.
	move.w	d5,d0
	add.w	d0,d0
	lea	track_source_offsets(pc),a1
	moveq	#0,d1
	move.w	0(a1,d0.w),d1
	lea	RACE_RUNTIME_BASE.w,a3
	adda.w	d1,a3
	lea	active_race_ptr(pc),a0
	move.l	a3,(a0)
	bra.w	.prepare_common

.custom_record
	cmp.w	#PLAYLIST_MAX_CIRCUIT,d6
	bhi.w	.asset_failed

	; circuit_10+ retains the proven custom-first staging address $5902.
	moveq	#0,d0
	move.w	d5,d0
	mulu	#RACE_RECORD_SIZE,d0
	lea	CUSTOM_WORK_TRACK_TEMPLATES,a0
	adda.l	d0,a0
	lea	CUSTOM_ACTIVE_RACE_BASE,a1
	; Preserve D6 here for the same copy_race_record clobber.
	move.w	d6,-(a7)
	bsr.w	copy_race_record
	move.w	(a7)+,d6
	lea	CUSTOM_ACTIVE_RACE_BASE,a3
	lea	active_race_ptr(pc),a0
	move.l	a3,(a0)

.prepare_common
	move.w	d7,d0
	addq.w	#1,d0
	move.w	d0,$2A(a3)

	move.w	d6,d0
	bsr.w	apply_circuit_setup
	move.w	d6,d0
	bsr.w	apply_circuit_cpu_choices
	tst.l	d0
	beq.w	.asset_failed
	move.w	d6,d0
	move.w	d7,d1
	bsr.w	apply_circuit_presentation

	cmp.w	#TRACK_COUNT,d6
	bhs.b	.custom_assets

	; Retail sidecar waypoints use the established in-place test-34 path.
	move.w	d6,d0
	bsr.w	apply_circuit_waypoints
	bra.w	.apply_laps

.custom_assets
	move.w	d6,d0
	move.w	d5,d1
	bsr.w	load_active_custom_assets
	tst.l	d0
	beq.w	.asset_failed

	move.w	d6,d0
	bsr.w	load_active_custom_routes
	tst.l	d0
	beq.w	.route_failed

	; Current custom packages explicitly author all three descriptor lap guards.
	; Missing/invalid route_settings.bin is a package failure, not inheritance.
	move.w	d6,d0
	bsr.w	load_circuit_route_settings
	tst.l	d0
	beq.w	.route_failed

	move.w	d6,d0
	bsr.w	load_active_custom_pits
	tst.l	d0
	beq.w	.pit_failed

.apply_laps
	; custom_event_advance has already selected/rebuilt the upcoming race before
	; Gasoline Alley.  Resolve that event's compact record and apply playlist fields
	; last, so Circuit mode inherits the race/template values and Playlist mode wins.
	move.w	d7,d0
	bsr.w	playlist_event_address
	moveq	#0,d1
	move.b	1(a0),d1
	beq.b	.apply_cpu
	move.w	d1,$28(a3)

.apply_cpu
	btst	#7,(a0)
	beq.b	.post_laps
	lea	2(a0),a0
	lea	$50(a3),a1
	moveq	#CIRCUIT_CPU_CHOICES_SIZE-1,d2
.copy_cpu
	moveq	#0,d1
	move.b	(a0)+,d1
	move.w	d1,(a1)
	addq.l	#2,a1
	dbf	d2,.copy_cpu

.post_laps
	; Gasoline Alley has early event-zero presentation consumers before the race
	; pointer hook runs. Mirror presentation-only fields to $5902 for stock events,
	; but leave all track resource/route/pit pointers in their original native slot.
	cmp.w	#TRACK_COUNT,d6
	bhs.w	.done
	bsr.w	mirror_stock_presentation_to_event0
	bra.w	.done

.asset_failed
	lea	CUSTOM_DIAG_FAILURE,a0
	move.w	#CUSTOM_FAIL_ASSETS,(a0)
	lea	custom_fail_assets_msg(pc),a0
	bra.w	abort_custom_event
.route_failed
	lea	CUSTOM_DIAG_FAILURE,a0
	move.w	#CUSTOM_FAIL_ROUTES,(a0)
	lea	custom_fail_routes_msg(pc),a0
	bra.w	abort_custom_event
.pit_failed
	lea	CUSTOM_DIAG_FAILURE,a0
	move.w	#CUSTOM_FAIL_PITS,(a0)
	lea	custom_fail_pits_msg(pc),a0
	bra.w	abort_custom_event
.done
	movem.l	(a7)+,d0-d7/a0-a6
	rts

; IN: A3 = active retail race record. Preserve the established early Gasoline
; Alley event-zero view without transplanting the resource-bearing race record.
mirror_stock_presentation_to_event0
	movem.l	d0-d6/a0-a2,-(a7)
	lea	RACE_RUNTIME_BASE.w,a1
	cmpa.l	a1,a3
	beq.b	.done

	; A previous circuit_10+ event may have used $5902 as its staging record.
	; Restore the genuine Illinois/event-zero record first so any remaining early
	; hard-coded event-zero consumers see valid retail structure/resource pointers.
	lea	CUSTOM_WORK_TRACK_TEMPLATES,a0
	lea	RACE_RUNTIME_BASE.w,a1
	bsr.w	copy_race_record
	lea	RACE_RUNTIME_BASE.w,a1

	move.l	$24(a3),$24(a1)		; HUD X/Y
	move.l	$28(a3),$28(a1)		; laps + one-based event number
	move.l	$46(a3),$46(a1)		; miniature preview descriptor
	move.l	$4A(a3),$4A(a1)		; regional marker X/Y
	move.w	$4E(a3),$4E(a1)		; regional marker frame

	lea	$70(a3),a0
	lea	$70(a1),a2
	moveq	#3,d0
.copy_name_longs
	move.l	(a0)+,(a2)+
	dbf	d0,.copy_name_longs
	move.w	(a0)+,(a2)+
.done
	movem.l	(a7)+,d0-d6/a0-a2
	rts

load_active_stock_routes_optional
	movem.l	d1-d7/a0-a6,-(a7)
	move.w	d0,d7
	lea	circuit_leaf_waypoints(pc),a1
	bsr.w	build_circuit_path
	move.l	_resload(pc),a2
	jsr	resload_GetFileSize(a2)
	tst.l	d0
	beq.b	.ok
	move.w	d7,d0
	bsr.w	load_active_custom_routes
	bra.b	.return
.ok
	moveq	#1,d0
.return
	movem.l	(a7)+,d1-d7/a0-a6
	rts


; Release slave-local ownership of the active circuit_10+ staging record.
; Retail templates remain immutable in CUSTOM_WORK_TRACK_TEMPLATES; test 39 restores each
; stock circuit's own native slot before reuse.
release_active_custom_resources
	movem.l	d0/a0,-(a7)
	; The circuit_10+ $5902 staging record is disposable. Retail native slots are
	; restored from CUSTOM_WORK_TRACK_TEMPLATES before reuse; transition cleanup therefore
	; only clears slave-local ownership/preview state before the arena is reused.
	lea	active_custom_resource_template(pc),a0
	move.w	#$FFFF,(a0)
	lea	active_custom_resource_race(pc),a0
	clr.l	(a0)
	lea	active_custom_preview_size(pc),a0
	clr.l	(a0)
	movem.l	(a7)+,d0/a0
	rts

; A deferred stock-package override armed before an event transition must not
; write into a buffer after circuit_10+ becomes active.
clear_pending_track_overrides
	move.l	a0,-(a7)
	lea	pending_background_name(pc),a0
	clr.l	(a0)
	lea	pending_background_dest(pc),a0
	clr.l	(a0)
	lea	pending_circuit_name(pc),a0
	clr.l	(a0)
	lea	pending_circuit_dest(pc),a0
	clr.l	(a0)
	lea	pending_circuit_size(pc),a0
	clr.l	(a0)
	move.l	(a7)+,a0
	rts


; IN: D0.w circuit index, D1.l expected file size, A1 leaf name, A2 destination
; OUT: D0.l = 1 exact-size file loaded / 0 failure
load_custom_asset_exact
	movem.l	d1-d7/a0-a6,-(a7)
	move.l	d1,d6
	move.l	a2,a6
	bsr.w	build_circuit_path
	move.l	a0,a5

	move.l	_resload(pc),a2
	jsr	resload_GetFileSize(a2)
	cmp.l	d6,d0
	bne.b	.failed

	move.l	a5,a0
	move.l	a6,a1
	move.l	_resload(pc),a2
	jsr	resload_LoadFile(a2)
	moveq	#1,d0
	bra.b	.return
.failed
	moveq	#0,d0
.return
	movem.l	(a7)+,d1-d7/a0-a6
	rts


; IN: D0.w custom circuit index, D1.w structural template 0..9
; OUT: D0.l = 1 success / 0 failure
;
; Files are loaded first; the active race is repointed to private high-memory
; resource-entry copies only after every mandatory graphical payload has passed
; exact-size validation.  The retail resource directory itself is never changed.
load_active_custom_assets
	movem.l	d1-d7/a0-a6,-(a7)
	move.w	d0,d7			; circuit index
	moveq	#0,d6
	move.w	d1,d6			; structural template 0..9
	cmp.w	#TRACK_COUNT-1,d6
	bhi.w	.failed

	; D5 is the byte offset into circuit_entry_ptrs; retain D6 as the actual
	; template index so pointer commit/state recording is unambiguous.
	move.w	d6,d5
	lsl.w	#2,d5
	lea	circuit_entry_ptrs(pc),a0
	movea.l	0(a0,d5.w),a4		; base resource entry+2 pointer

	; background.bin
	move.l	4(a4),d1		; entry+6 outLen
	cmp.l	#TRACK_BACKGROUND_SIZE,d1
	bne.w	.failed
	move.w	d7,d0
	lea	circuit_leaf_background(pc),a1
	lea	CUSTOM_BACKGROUND_BASE,a2
	bsr.w	load_custom_asset_exact
	tst.l	d0
	beq.w	.failed

	; foreground.bin: retail variants are $2800 or $2804.
	lea	RESOURCE_ENTRY_SIZE(a4),a4
	move.l	4(a4),d1
	tst.l	d1
	beq.w	.failed
	cmp.l	#CUSTOM_FOREGROUND_SLOT_SIZE,d1
	bhi.w	.failed
	move.w	d7,d0
	lea	circuit_leaf_foreground(pc),a1
	lea	CUSTOM_FOREGROUND_BASE,a2
	bsr.w	load_custom_asset_exact
	tst.l	d0
	beq.w	.failed

	; surface.bin
	lea	RESOURCE_ENTRY_SIZE(a4),a4
	move.l	4(a4),d1
	tst.l	d1
	beq.w	.failed
	cmp.l	#CUSTOM_SURFACE_SLOT_SIZE,d1
	bhi.w	.failed
	move.w	d7,d0
	lea	circuit_leaf_surface(pc),a1
	lea	CUSTOM_SURFACE_BASE,a2
	bsr.w	load_custom_asset_exact
	tst.l	d0
	beq.w	.failed

	; recovery.bin
	lea	RESOURCE_ENTRY_SIZE(a4),a4
	move.l	4(a4),d1
	tst.l	d1
	beq.w	.failed
	cmp.l	#CUSTOM_RECOVERY_SLOT_SIZE,d1
	bhi.w	.failed
	move.w	d7,d0
	lea	circuit_leaf_recovery(pc),a1
	lea	CUSTOM_RECOVERY_BASE,a2
	bsr.w	load_custom_asset_exact
	tst.l	d0
	beq.w	.failed

	; preview.bin size comes from the active race's preview descriptor/resource
	; entry rather than a hard-coded package assumption.
	movea.l	$46(a3),a0
	move.l	a0,d0
	beq.w	.failed
	movea.l	6(a0),a0		; descriptor+6 -> resource entry+2
	move.l	4(a0),d4		; entry+6 outLen
	tst.l	d4
	beq.w	.failed
	cmp.l	#CUSTOM_PREVIEW_SLOT_SIZE,d4
	bhi.w	.failed
	move.w	d7,d0
	move.l	d4,d1
	lea	circuit_leaf_preview(pc),a1
	lea	CUSTOM_PREVIEW_BASE,a2
	bsr.w	load_custom_asset_exact
	tst.l	d0
	beq.w	.failed

	; Build four private resource-directory entries from the retail template.
	; Each full entry is 22 bytes; the race record points at entry+2, matching
	; the original resource-directory contract.  The global retail table remains
	; completely untouched.
	lea	circuit_entry_ptrs(pc),a0
	movea.l	0(a0,d5.w),a0		; source entry+2
	lea	-2(a0),a0			; source full entry
	lea	CUSTOM_RESOURCE_META_BASE,a1
	moveq	#21,d0			; 22 longs = 88 bytes = four entries
.copy_resource_meta
	move.l	(a0)+,(a1)+
	dbf	d0,.copy_resource_meta

	lea	CUSTOM_RESOURCE_META_BASE,a0
	move.l	#CUSTOM_BACKGROUND_BASE,14(a0)
	lea	RESOURCE_ENTRY_SIZE(a0),a0
	move.l	#CUSTOM_FOREGROUND_BASE,14(a0)
	lea	RESOURCE_ENTRY_SIZE(a0),a0
	move.l	#CUSTOM_SURFACE_BASE,14(a0)
	lea	RESOURCE_ENTRY_SIZE(a0),a0
	move.l	#CUSTOM_RECOVERY_BASE,14(a0)

	; Repoint only this active race record to the four private entries.
	lea	CUSTOM_RESOURCE_META_BASE+2,a0
	move.l	a0,$36(a3)
	lea	RESOURCE_ENTRY_SIZE(a0),a0
	move.l	a0,$3A(a3)
	lea	RESOURCE_ENTRY_SIZE(a0),a0
	move.l	a0,$3E(a3)
	lea	RESOURCE_ENTRY_SIZE(a0),a0
	move.l	a0,$42(a3)

	lea	active_custom_resource_template(pc),a0
	move.w	d6,(a0)
	lea	active_custom_resource_race(pc),a0
	move.l	a3,(a0)
	lea	active_custom_preview_size(pc),a0
	move.l	d4,(a0)

	lea	CUSTOM_DIAG_FLAGS,a0
	ori.w	#$0001,(a0)
	moveq	#1,d0
	bra.b	.return

.failed
	moveq	#0,d0
.return
	movem.l	(a7)+,d1-d7/a0-a6
	rts

; A0 -> zero-terminated message.  This is deliberately non-returning.
abort_custom_event
	move.l	a0,-(a7)
	pea	TDREASON_FAILMSG
	move.l	_resload(pc),-(a7)
	addq.l	#resload_Abort,(a7)
	rts

custom_fail_memory_msg	dc.b	"Custom track mode needs default memory; remove MemConfig=1",0
custom_fail_template_msg	dc.b	"Custom circuit template/waypoints invalid",0
custom_fail_assets_msg	dc.b	"Custom circuit graphical asset load failed",0
custom_fail_routes_msg	dc.b	"Custom circuit route/settings data failed",0
custom_fail_pits_msg	dc.b	"Custom circuit pit data failed",0
custom_fail_playlist_msg	dc.b	"Custom playlist missing or invalid",0
	even


; IN: D0.w circuit index, A3 active race record
; OUT: D0.l = 1 exact IHRS v1 sidecar loaded/applied, 0 missing/invalid
;
; The editor exposes semantic values 0..63.  The game stores each guard doubled
; in the first byte of the descriptor tail, because the lap-wrap helper ASR.B #1
; before comparing previous route progress.  The adjacent tail bytes are currently
; unconsumed and are explicitly cleared so custom circuit data does not inherit them.
load_circuit_route_settings
	movem.l	d1-d7/a0-a6,-(a7)
	lea	circuit_leaf_route_settings(pc),a1
	bsr.w	build_circuit_path
	move.l	a0,a5

	move.l	_resload(pc),a2
	jsr	resload_GetFileSize(a2)
	cmp.l	#CIRCUIT_ROUTE_SETTINGS_SIZE,d0
	bne.w	.failed

	move.l	a5,a0
	lea	CUSTOM_WORK_ROUTE_SETTINGS,a1
	move.l	_resload(pc),a2
	jsr	resload_LoadFile(a2)

	lea	CUSTOM_WORK_ROUTE_SETTINGS,a0
	cmp.l	#CIRCUIT_ROUTE_SETTINGS_MAGIC,(a0)
	bne.w	.failed
	cmp.w	#CIRCUIT_ROUTE_SETTINGS_VERSION,4(a0)
	bne.w	.failed
	cmp.w	#CIRCUIT_ROUTE_SETTINGS_SIZE,6(a0)
	bne.w	.failed

	moveq	#0,d1
	move.b	8(a0),d1
	cmp.w	#63,d1
	bhi.w	.failed
	lsl.w	#1,d1
	move.b	d1,$0A(a3)
	clr.b	$0B(a3)

	moveq	#0,d1
	move.b	9(a0),d1
	cmp.w	#63,d1
	bhi.w	.failed
	lsl.w	#1,d1
	move.b	d1,$16(a3)
	clr.b	$17(a3)

	moveq	#0,d1
	move.b	10(a0),d1
	cmp.w	#63,d1
	bhi.w	.failed
	lsl.w	#1,d1
	move.b	d1,$22(a3)
	clr.b	$23(a3)

	moveq	#1,d0
	bra.b	.return
.failed
	moveq	#0,d0
.return
	movem.l	(a7)+,d1-d7/a0-a6
	rts


; IN: D0.w custom circuit index 10..99, A3 active race record
; OUT: D0.l = 1 success / 0 failure
load_active_custom_pits
	movem.l	d1-d7/a0-a6,-(a7)
	move.w	d0,d7
	lea	circuit_leaf_race_setup(pc),a1
	bsr.w	build_circuit_path
	move.l	a0,a5
	move.l	_resload(pc),a2
	jsr	resload_GetFileSize(a2)
	cmp.l	#RACE_SETUP_SIZE,d0
	bne.b	.failed
	move.l	a5,a0
	lea	CUSTOM_RACE_SETUP_BASE,a1
	move.l	_resload(pc),a2
	jsr	resload_LoadFile(a2)

	lea	CUSTOM_RACE_SETUP_BASE+$10,a0	; four $16 pit records begin at +$10
	lea	CUSTOM_PIT_ARENA_BASE,a1
	moveq	#PIT_LONG_COUNT_MINUS1,d6
.copy
	move.l	(a0)+,(a1)+
	dbf	d6,.copy
	move.l	#CUSTOM_PIT_ARENA_BASE,$32(a3)
	moveq	#1,d0
	bra.b	.return
.failed
	moveq	#0,d0
.return
	movem.l	(a7)+,d1-d7/a0-a6
	rts


; IN: D0.w custom circuit index 10..99, A3 active race record
; OUT: D0.l = 1 success / 0 failure
;
; validate_custom_waypoint_file first leaves the raw IHWP file at $94000.
; This routine decodes all three route payloads downward in the same arena while
; preserving each route's own point-0 and explicit boundary, validates every
; relative link against the decoded runtime record set, then atomically commits
; start/end/count fields.  route_settings.bin is applied immediately afterwards
; for circuit_10..99 so descriptor lap guards are authored explicitly.
load_active_custom_routes
	movem.l	d1-d7/a0-a6,-(a7)
	move.w	d0,d7
	bsr.w	validate_custom_waypoint_file
	tst.l	d0
	beq.w	.failed

	lea	CUSTOM_ROUTE_ARENA_BASE+8,a2	; first IHWP route header
	lea	CUSTOM_ROUTE_ARENA_BASE,a1	; independent runtime-route destination
	lea	active_route_starts(pc),a4
	lea	active_route_ends(pc),a5
	lea	active_route_counts(pc),a6
	moveq	#CIRCUIT_WAYPOINT_ROUTES-1,d6
.decode_route
	moveq	#0,d0
	move.w	(a2),d0
	move.w	d0,(a6)+
	lea	4(a2),a2			; source ordinary points

	; Keep every authored route independent.  In particular, do not force route
	; B point 0 to alias route A's boundary (or C point 0 to alias B's).
	move.l	a1,(a4)+			; descriptor start
	bsr.w	copy_normalize_waypoint_records
	move.l	a1,(a5)+			; descriptor end / explicit boundary address
	moveq	#1,d0
	bsr.w	copy_normalize_waypoint_records	; explicit boundary

	dbf	d6,.decode_route

	move.l	a1,d7			; one-past-final decoded record
	cmp.l	#CUSTOM_ROUTE_ARENA_END,d7
	bhi.w	.failed

	; Validate every decoded +4.w relative link.  Valid targets must land on a
	; six-byte record in the decoded arena.  Only the final boundary may target
	; the one-past-final +6 sentinel.
	lea	CUSTOM_ROUTE_ARENA_BASE,a0
.validate_link
	cmpa.l	d7,a0
	bhs.b	.links_ok
	moveq	#0,d0
	move.w	4(a0),d0
	ext.l	d0
	move.l	a0,d1
	add.l	d1,d0
	cmp.l	#CUSTOM_ROUTE_ARENA_BASE,d0
	blo.w	.failed
	cmp.l	d7,d0
	blo.b	.target_in_arena
	bne.w	.failed
	move.l	d7,d1
	subq.l	#6,d1
	cmp.l	d1,a0
	bne.w	.failed
.target_in_arena
	sub.l	#CUSTOM_ROUTE_ARENA_BASE,d0
	divu	#6,d0
	swap	d0
	tst.w	d0
	bne.w	.failed
	lea	6(a0),a0
	bra.b	.validate_link

.links_ok
	; Commit only after the complete package has decoded and validated.
	lea	active_route_starts(pc),a0
	lea	active_route_ends(pc),a1
	lea	active_route_counts(pc),a2
	movea.l	a3,a4
	moveq	#CIRCUIT_WAYPOINT_ROUTES-1,d6
.commit
	move.l	(a0)+,(a4)
	move.l	(a1)+,4(a4)
	move.w	(a2)+,8(a4)
	lea	12(a4),a4
	dbf	d6,.commit
	moveq	#1,d0
	bra.b	.return
.failed
	moveq	#0,d0
.return
	movem.l	(a7)+,d1-d7/a0-a6
	rts

; IN: D0.w = number of six-byte stored waypoint records, A2 source, A1 dest
; OUT: A2/A1 advanced; D0 exhausted.
;
; TEST 33 retains the corrected circuit_15 stored-byte decode:
; every stored waypoint byte is the runtime byte XOR $FF.
;   +0.w X        -> NOT.W
;   +2.b progress -> NOT.B
;   +3.b Y        -> NOT.B
;   +4.w link     -> NOT.W
;
; Test 30's NEG/ADD #13 hypothesis happened to turn the ordinary stored $FFF9
; link into +6, but reversed authored branch links such as stored $00C5 in the
; wrong direction.  Decode the established six-byte complement literally.
copy_normalize_waypoint_records
	tst.w	d0
	beq.b	.done
	subq.w	#1,d0
.record
	move.w	(a2)+,d2
	not.w	d2
	move.w	d2,(a1)+

	move.b	(a2)+,d2
	not.b	d2
	move.b	d2,(a1)+

	move.b	(a2)+,d2
	not.b	d2
	move.b	d2,(a1)+

	move.w	(a2)+,d2
	not.w	d2
	move.w	d2,(a1)+
	dbf	d0,.record
.done
	rts

;---------------------------------------------------------------------------
; CUSTOM DEBUGGER PROOF BLOCK — $95F00..$95FFF
;
; +00.l "IHDG" once captured during the first on-track lap-total draw
; +04.w proof version (=1)
; +06.w active event index
; +08.w custom circuit index or $FFFF
; +0A.w structural template index or $FFFF
; +0C..+2F active race route descriptors ($24 bytes)
; +30..+47 first 24 bytes of relocated/custom Route A
; +48..+5F first 24 bytes at the retail template's Route-A address after the
;            game's own startup processing
; +60..+8B active race bytes $24..$4F (HUD/preview/marker presentation fields)
; +F0.w flags: bit0 custom resource, bit1 MiniMap recognised, bit2 map, bit3 MiniMap copied
; +F2.w strict custom failure: 1 template/topology, 2 routes, 3 pits, 4 assets, 5 playlist
;
; The block is diagnostic only and occupies the final page of the test-33 active arena.
;---------------------------------------------------------------------------
clear_custom_diag
	movem.l	d0/a0,-(a7)
	lea	CUSTOM_DIAG_BASE,a0
	moveq	#63,d0
.clear
	clr.l	(a0)+
	dbf	d0,.clear
	movem.l	(a7)+,d0/a0
	rts

capture_custom_route_diag
	movem.l	d0-d7/a0-a6,-(a7)
	movea.l	a0,a5			; active race record supplied by custom_lap_total
	lea	CUSTOM_DIAG_BASE,a6
	cmp.l	#$49484447,(a6)		; "IHDG"
	beq.w	.done
	move.l	#$49484447,(a6)
	move.w	#1,4(a6)
	moveq	#0,d7
	move.w	active_event_index(pc),d7
	move.w	d7,6(a6)
	move.w	#$FFFF,8(a6)
	move.w	#$FFFF,$0A(a6)
	cmp.w	#PLAYLIST_MAX_EVENTS-1,d7
	bhi.b	.copy_desc
	move.w	d7,d0
	add.w	d0,d0
	lea	CUSTOM_WORK_CIRCUIT_MAP,a0
	move.w	0(a0,d0.w),8(a6)
	lea	CUSTOM_WORK_TEMPLATE_MAP,a0
	move.w	0(a0,d0.w),$0A(a6)

.copy_desc
	movea.l	a5,a0
	lea	$0C(a6),a1
	moveq	#8,d0
.copy_desc_loop
	move.l	(a0)+,(a1)+
	dbf	d0,.copy_desc_loop

	; First 24 bytes from the active/custom Route A.
	movea.l	(a5),a0
	move.l	a0,d0
	beq.b	.template_sample
	lea	$30(a6),a1
	moveq	#5,d0
.copy_custom
	move.l	(a0)+,(a1)+
	dbf	d0,.copy_custom

.template_sample
	moveq	#0,d0
	move.w	$0A(a6),d0
	cmp.w	#TRACK_COUNT-1,d0
	bhi.b	.presentation_sample
	mulu	#RACE_RECORD_SIZE,d0
	lea	CUSTOM_WORK_TRACK_TEMPLATES,a0
	adda.l	d0,a0
	movea.l	(a0),a0
	move.l	a0,d0
	beq.b	.presentation_sample
	lea	$48(a6),a1
	moveq	#5,d0
.copy_template
	move.l	(a0)+,(a1)+
	dbf	d0,.copy_template

.presentation_sample
	lea	$24(a5),a0
	lea	$60(a6),a1
	moveq	#10,d0			; 11 longs = $2C bytes ($24..$4F)
.copy_presentation
	move.l	(a0)+,(a1)+
	dbf	d0,.copy_presentation
.done
	movem.l	(a7)+,d0-d7/a0-a6
	rts


;---------------------------------------------------------------------------
; Gasoline Alley regional map override — CUSTOM2=1 only.
;
; Map IDs are event-local presentation metadata and deliberately remain
; separate from playlist data unless presentation.bin supplies an event map.
; Optional file "indyheat_region_select.bin" accepts either the legacy 11-byte
; form or an expanded 99-byte form: one map ID (0..7) per available event slot.
; A legacy selector leaves events 12..99 at the deterministic USA fallback (0).
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
	lea	CUSTOM_WORK_REGION_SELECTOR,a0
	moveq	#0,d0
	moveq	#REGION_SELECTOR_SIZE-1,d1
.clear
	move.b	d0,(a0)+
	dbf	d1,.clear

	lea	region_selector_name(pc),a0
	move.l	_resload(pc),a2
	jsr	resload_GetFileSize(a2)
	cmp.l	#REGION_SELECTOR_LEGACY_SIZE,d0
	beq.b	.load
	cmp.l	#REGION_SELECTOR_SIZE,d0
	bne.b	.done
.load
	lea	region_selector_name(pc),a0
	lea	CUSTOM_WORK_REGION_SELECTOR,a1
	move.l	_resload(pc),a2
	jsr	resload_LoadFile(a2)

	; Validate every byte before runtime use.  Invalid bytes become USA rather
	; than rejecting otherwise useful event selections.
	lea	CUSTOM_WORK_REGION_SELECTOR,a0
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

	; TEST 25: resource $16 is known.  Match its own directory entry directly.
	; The earlier sector scan could stop on another entry sharing the same first
	; sector and therefore miss the map even though $16 was the real request.
	lea	RESOURCE_TABLE_RUNTIME.w,a1
	adda.w	#REGION_MAP_RESOURCE_ID*RESOURCE_ENTRY_SIZE,a1
	cmp.w	#REGION_MAP_RESOURCE_ID,(a1)
	bne.b	.done
	cmp.w	2(a1),d5
	bne.b	.done
	cmp.l	#REGION_MAP_RESOURCE_SIZE,6(a1)
	bne.b	.done

	; Follow the tracked event selector.  Invalid state fails back to event 0.
	moveq	#0,d3
	move.w	active_event_index(pc),d3
	cmp.w	#PLAYLIST_MAX_EVENTS-1,d3
	bls.b	.have_event
	moveq	#0,d3
.have_event

	lea	CUSTOM_WORK_REGION_SELECTOR,a2
	moveq	#0,d0
	move.b	0(a2,d3.w),d0
	cmp.w	#REGION_MAP_COUNT-1,d0
	bls.b	.map_ok
	moveq	#0,d0
.map_ok
	add.w	d0,d0
	lea	region_map_name_offsets(pc),a2
	move.w	0(a2,d0.w),d1
	lea	region_map_name_offsets(pc),a3
	adda.w	d1,a3

	lea	pending_region_map_name(pc),a2
	move.l	a3,(a2)
	lea	pending_region_map_dest(pc),a2
	lea	REGION_MAP_FRAME_OFFSET(a0),a3
	move.l	a3,(a2)

	lea	CUSTOM_DIAG_FLAGS,a4
	ori.w	#$0004,(a4)		; region-map arm observed
.done
	movem.l	(a7)+,d0-d5/a0-a4
	rts

region_selector_name
	dc.b	"indyheat_region_select.bin",0
	even
; Region selector bytes live at CUSTOM_WORK_REGION_SELECTOR in CUSTOM2 mode.
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

	; circuit_10+ never uses the legacy deferred background bridge in test 33.
	moveq	#0,d0
	move.w	active_event_index(pc),d0
	cmp.w	#PLAYLIST_MAX_EVENTS-1,d0
	bhi.b	.stock_or_legacy
	add.w	d0,d0
	lea	CUSTOM_WORK_CIRCUIT_MAP,a1
	move.w	0(a1,d0.w),d2
	cmp.w	#TRACK_COUNT,d2
	blo.b	.stock_or_legacy
	cmp.w	#PLAYLIST_MAX_CIRCUIT,d2
	bls.w	.done

.stock_or_legacy
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

	; circuit_10+ assets are already resident in the fixed high arena.  Do not
	; arm any deferred circuit-package replacement for the active custom event.
	moveq	#0,d0
	move.w	active_event_index(pc),d0
	cmp.w	#PLAYLIST_MAX_EVENTS-1,d0
	bhi.b	.stock_scan
	add.w	d0,d0
	lea	CUSTOM_WORK_CIRCUIT_MAP,a2
	move.w	0(a2,d0.w),d5
	cmp.w	#TRACK_COUNT,d5
	blo.b	.stock_scan
	cmp.w	#PLAYLIST_MAX_CIRCUIT,d5
	bls.w	.done

.stock_scan
	; Existing circuit_00..09 bridge: retain its proven generic scan unchanged.
	lea	RESOURCE_TABLE_RUNTIME.w,a1
	moveq	#RESOURCE_ENTRY_COUNT-1,d6
.find_resource
	cmp.w	2(a1),d7
	bne.w	.next_resource
	moveq	#0,d2
	move.w	(a1),d2
	move.l	6(a1),d3

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

	lea	CUSTOM_WORK_PREVIEW_IDS,a2
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

;======================================================================

	END
