#!/usr/bin/env python3
"""Add a Watcom register calling convention (__watcall) to Ghidra's x86 Borland cspec.

The ghidra-lx-loader picks the Borland compiler spec for LE files. Watcom passes the
first four integer arguments in EAX, EDX, EBX, ECX and preserves all registers except
EAX, so decompiled output is wrong without this prototype. The script makes
__watcall the default prototype and keeps the original file as *.orig.

Usage: python3 tools/ghidra/patch-watcom-cspec.py ~/Tools/ghidra_12.0.1_PUBLIC
Re-run after reinstalling or upgrading Ghidra, then re-import the program.
"""
import shutil
import sys
import xml.etree.ElementTree as ET
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
    tree = ET.parse(cspec, parser=ET.XMLParser(target=ET.TreeBuilder(insert_comments=True)))
    root = tree.getroot()
    if root.find(".//prototype[@name='__watcall']") is not None:
        print("already patched:", cspec)
        return 0
    backup = cspec.with_suffix(".cspec.orig")
    if not backup.exists():
        shutil.copy2(cspec, backup)
    default = root.find("default_proto")
    prototype = default.find("prototype[@name='__fastcall']") if default is not None else None
    if prototype is None:
        print("unexpected cspec layout; not patched")
        return 1
    # Keep the old default (__fastcall) as an ordinary prototype.
    position = list(root).index(default)
    root.remove(default)
    root.insert(position, ET.fromstring(WATCALL))
    root.insert(position + 1, prototype)
    ET.indent(tree, space="  ")
    tree.write(cspec, encoding="UTF-8", xml_declaration=True)
    print("patched:", cspec)
    return 0


if __name__ == "__main__":
    sys.exit(main())
