#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLUGIN_DIR = ROOT / "app" / "special-functions"
MANIFEST = PLUGIN_DIR / "manifest.js"


def module_files():
    return sorted(
        (
            p.name
            for p in PLUGIN_DIR.glob("*.js")
            if p.name != MANIFEST.name and not p.name.startswith(".") and not p.name.startswith("_")
        ),
        key=lambda name: (name.casefold(), name),
    )


def render(files):
    rows = ",\n".join(f"    {name!r}" for name in files)
    array = f"[\n{rows}\n  ]" if rows else "[]"
    return f"""(function(root){{
'use strict';
const modules=Object.freeze({array});
root.INDYHEAT_SPECIAL_FUNCTION_MODULES=modules;
if(root.IndyHeatSpecialFunctions?.loadManifest)root.IndyHeatSpecialFunctions.loadManifest(modules);
else root.addEventListener?.('indyheat-special-functions-host-ready',()=>root.IndyHeatSpecialFunctions?.loadManifest(modules),{{once:true}});
}})(typeof globalThis!=='undefined'?globalThis:this);\n"""


def main():
    PLUGIN_DIR.mkdir(parents=True, exist_ok=True)
    files = module_files()
    MANIFEST.write_text(render(files), encoding="utf-8", newline="\n")
    print(f"Generated manifest: {len(files)} Special Function{'s' if len(files) != 1 else ''}.")


if __name__ == "__main__":
    main()
