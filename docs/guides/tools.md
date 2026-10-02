---
type: guide
status: active
phase: all
updated: 2026-10-01
---

# 工具用法

`tools/` 下是本地研究用的 Node 脚本，直接用 Node 22 运行，不需要构建。脚本只输出结构信息，不输出原版文件内容。解析逻辑放在 `src/original-data/`，浏览器端和工具共用同一份代码。

| 脚本 | 用途 | 用法 |
|---|---|---|
| `tools/nob-list.ts` | 列出 IMFAT（`.NOB`）封包目录：条目数、各类型数量与大小 | `node tools/nob-list.ts local/StarRang/SRANGERS/MAIN/*.NOB [--entries]` |
| `tools/nob-check.ts` | 解析封包中全部 TEX、BITM、MFDD、CCKD 字体、M2ID、NEBC、MESH、MODL 条目并检查交叉引用，只输出统计与失败项 | `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB` |
| `tools/ghidra/patch-watcom-cspec.py` | 给 Ghidra 加入 Watcom 调用约定 | 见 [baseline-environment](./baseline-environment.md#静态分析) |
| `tools/ghidra/DecompileAll.java` | 反编译全部函数到一个文件 | `-postScript DecompileAll.java <输出文件>` |
| `tools/ghidra/DumpCallers.java` | 反编译某个函数的全部调用者 | `-postScript DumpCallers.java <输出文件> <函数地址>` |
| `tools/ghidra/DumpAt.java` | 在指定地址补建函数，并反编译它及其调用的函数 | `-postScript DumpAt.java <输出文件> <深度> <地址>...` |
| `tools/ghidra/DumpFromStrings.java` | 从字符串出发找到引用它的函数并反编译 | `-postScript DumpFromStrings.java <输出文件> <深度> <字符串>...` |
| `tools/ghidra/ReadTable.java` | 按固定步长打印内存中的表格及其指向的字符串 | `-postScript ReadTable.java <起始地址> <数量或数量所在地址> <步长>` |

Ghidra 脚本通过 `ghidra-headless ... -scriptPath tools/ghidra -postScript <脚本> <参数>` 运行；输出文件必须放在 `local/` 下。

新增脚本时，在本表补充一行。
