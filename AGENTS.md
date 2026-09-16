## WHDLoad slave development rules

- Treat the current checked-in WHDLoad slave source as authoritative. Before applying new changes, confirm that existing WHDLoad header fields, `ws_config` entries, CUSTOM options and trainer behaviour are preserved unless the user explicitly asks to change them.
- ChatGPT is **not expected to compile the WHDLoad slave**. The user will compile/test the Amiga slave source. Provide source changes, focused static/contract tests and any required runtime fixture files; do not treat the absence of a local Amiga assembler as a blocker or limitation requiring discussion each time.
- The project is developing the next and final WHDLoad slave release as **version 1.3**. Development builds must be labelled sequentially as **`1.3 test 1`**, **`1.3 test 2`**, etc. Do not create intermediate version numbers such as 1.4. When the work is release-ready, the final version string is simply **`1.3`**.
