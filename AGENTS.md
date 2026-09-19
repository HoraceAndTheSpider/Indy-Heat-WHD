## Mandatory startup protocol

- Read this `AGENTS.md` before doing any project work.
- Treat the current checked-in `master`, current pushed wiki, checked-in tests and the latest project handover/runtime-proof documents as authority.
- Do not repeat settled reverse-engineering merely because work has moved to a new conversation. Re-open an established finding only when current source/data or a new runtime test contradicts it.
- When the user reports behaviour observed in the live editor or Amiga runtime, treat that observation as the acceptance result. The presence of source code or a passing static test is not proof that a UI/runtime feature works.

## Editor versioning and file hygiene

- Every HTML5 editor/app change must increment the editor's internal/visible version number.
- Version increments do **not** justify creating another version-suffixed corrective JavaScript layer. Normal future changes must update/replace the existing canonical production files in place.
- Do not accumulate chained files such as `editor-fixes-v026.js`, `editor-fixes-v027.js`, etc. simply to represent successive versions. Avoid app-file bloat and unnecessary loader chains.
- When a change supersedes or extends an existing corrective layer, fold the new code into the appropriate existing production file(s), update the version string there, and adjust any loader/reference code so the obsolete successor layer is not required.
- Add a new production file only when the feature genuinely requires a distinct module/resource with an independent responsibility, not merely because the editor version has increased.
- Where an older version-suffixed corrective file is already the current canonical implementation, future work should update that file in place unless consolidation into a more appropriate existing module is part of the task. Do not create another numbered successor solely for the new version.
- Replacement app ZIPs must contain the current canonical app file set suitable for extraction over the repository. Do not include both an obsolete corrective layer and a new successor layer when the latter replaces the former.
- Visible/internal editor version numbering and physical filenames are separate concerns: increase the version number every time, while keeping the production file structure stable.

## User deliverables

- For HTML5 editor/app changes, deliver a ZIP containing the **complete replacement app files** at their repository-relative paths. The ZIP must be suitable for extraction over the repository. Do not present `.patch`, `.diff`, installer/apply scripts, or partial code fragments as the user deliverable.
- Do **not** present Node test/helper files as a user deliverable and do not ask the user to run Node tests unless the user explicitly requests them. Checked-in tests may still be inspected or maintained internally when useful.
- For WHDLoad slave changes, deliver the **complete changed `.asm` source file** for the user to compile/test. Do not substitute a patch, diff or apply script for the full source.
- If `AGENTS.md` itself is changed, provide the complete replacement `AGENTS.md` for upload.
- Runtime fixture/data files may be included when genuinely required by the feature, but they do not replace the complete app files or complete `.asm` source required above.

## WHDLoad slave development rules

- Treat the current checked-in WHDLoad slave source as authoritative. Before applying new changes, confirm that existing WHDLoad header fields, `ws_config` entries, CUSTOM options and trainer behaviour are preserved unless the user explicitly asks to change them.
- ChatGPT is **not expected to compile the WHDLoad slave**. The user will compile/test the Amiga slave source. Do not treat the absence of a local Amiga assembler as a blocker. Static/source inspection may be used internally, but the user-facing deliverable remains the complete changed `.asm` source.
- The project is developing the next and final WHDLoad slave release as **version 1.3**. Development builds must be labelled sequentially as **`1.3 test 1`**, **`1.3 test 2`**, etc. Do not create intermediate version numbers such as 1.4. When the work is release-ready, the final version string is simply **`1.3`**.
