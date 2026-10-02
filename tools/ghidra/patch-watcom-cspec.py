#!/usr/bin/env python3
"""Add a Watcom register calling convention (__watcall) to Ghidra's x86 Borland cspec.

The ghidra-lx-loader picks the Borland compiler spec for LE files. Watcom passes the
first four integer arguments in EAX, EDX, EBX, ECX and preserves all registers except
EAX, so decompiled output is wrong without this prototype. The script makes
__watcall the default prototype and keeps the original file as *.orig.

Usage: python3 tools/ghidra/patch-watcom-cspec.py ~/Tools/ghidra_12.0.1_PUBLIC
Re-run after reinstalling or upgrading Ghidra, then re-import the program.
"""
import re
import shutil
import sys
from pathlib import Path

WATCALL = """  <default_proto>
    <prototype name="__watcall" extrapop="unknown" stackshift="4">
      <input>
        <pentry minsize="1" maxsize="4"><register name="EAX"/></pentry>
        <pentry minsize="1" maxsize="4"><register name="EDX"/></pentry>
        <pentry minsize="1" maxsize="4"><register name="EBX"/></pentry>
        <pentry minsize="1" maxsize="4"><register name="ECX"/></pentry>
        <pentry minsize="1" maxsize="500" align="4"><addr offset="4" space="stack"/></pentry>
      </input>
      <output>
        <pentry minsize="1" maxsize="4"><register name="EAX"/></pentry>
        <pentry minsize="5" maxsize="8"><addr space="join" piece1="EDX" piece2="EAX"/></pentry>
      </output>
      <unaffected>
        <register name="ESP"/><register name="EBP"/><register name="ESI"/><register name="EDI"/>
        <register name="EBX"/><register name="ECX"/><register name="EDX"/>
      </unaffected>
    </prototype>
  </default_proto>
"""


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 1
    cspec = Path(sys.argv[1]) / "Ghidra/Processors/x86/data/languages/x86borland.cspec"
    text = cspec.read_text()
    if "__watcall" in text:
        print("already patched:", cspec)
        return 0
    backup = cspec.with_suffix(".cspec.orig")
    if not backup.exists():
        shutil.copy2(cspec, backup)
    match = re.search(r'  <default_proto>\n(    <prototype name="__fastcall".*?</prototype>\n)  </default_proto>\n', text, re.S)
    if not match:
        print("unexpected cspec layout; not patched")
        return 1
    # Keep the old default (__fastcall) as an ordinary prototype.
    cspec.write_text(text[: match.start()] + WATCALL + match.group(1) + text[match.end():])
    print("patched:", cspec)
    return 0


if __name__ == "__main__":
    sys.exit(main())
