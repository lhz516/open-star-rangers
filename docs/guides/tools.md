---
type: guide
status: active
phase: all
updated: 2026-10-03
---

# 工具用法

`tools/` 下包含本地研究、任务路由与合规工具，直接用 Node 22 运行。研究脚本只输出结构信息，不输出原版文件内容；原版解析逻辑放在 `src/original-data/`，浏览器端和工具共用同一份代码。合规工具不读取原版来源，聚合命令会构建当前网站。

| 脚本 | 用途 | 用法 |
|---|---|---|
| `tools/nob-list.ts` | 列出 IMFAT（`.NOB`）封包目录：条目数、各类型数量与大小 | `node tools/nob-list.ts local/StarRang/SRANGERS/MAIN/*.NOB [--entries]` |
| `tools/nob-check.ts` | 解析封包中全部 TEX、BITM、MFDD、CCKD 字体、M2ID、NEBC、MESH、MODL 条目并检查交叉引用，只输出统计与失败项 | `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB` |
| `tools/task-state.ts` | 只读任务的 spec/goal/subtasks，确定性地给出工作流图的下一节点（见 [Agent 任务工作流](../engineering/agent-workflow.md#自动编排)）；`--mark-reviewed` 写入审阅标记 | `node tools/task-state.ts p1/03 [--json] [--mark-reviewed]` |
| `tools/compliance/cli.ts` | 本地完整文件hash/实际分发许可/声明指纹检查，严格非零失败与机读JSON | `pnpm check:original` / `pnpm check:licenses` / `pnpm check:compliance` |
| `tools/ghidra/patch-watcom-cspec.py` | 给 Ghidra 加入 Watcom 调用约定 | 见 [baseline-environment](./baseline-environment.md#静态分析) |
| `tools/ghidra/DecompileAll.java` | 反编译全部函数到一个文件 | `-postScript DecompileAll.java <输出文件>` |
| `tools/ghidra/DumpCallers.java` | 反编译某个函数的全部调用者 | `-postScript DumpCallers.java <输出文件> <函数地址>` |
| `tools/ghidra/DumpAt.java` | 在指定地址补建函数，并反编译它及其调用的函数 | `-postScript DumpAt.java <输出文件> <深度> <地址>...` |
| `tools/ghidra/DumpFromStrings.java` | 从字符串出发找到引用它的函数并反编译 | `-postScript DumpFromStrings.java <输出文件> <深度> <字符串>...` |
| `tools/ghidra/ReadTable.java` | 按固定步长打印内存中的表格及其指向的字符串 | `-postScript ReadTable.java <起始地址> <数量或数量所在地址> <步长>` |

Ghidra 脚本通过 `ghidra-headless ... -scriptPath tools/ghidra -postScript <脚本> <参数>` 运行；输出文件必须放在 `local/` 下。

## 本地合规

运行方法、声明文件与JSON字段/counts在[工程约定](../engineering/README.md#构建许可声明)维护。聚合先build再两个检查；独立命令只查当前状态，不自动安装、更新锁或重建。stdout为`osr-local-compliance`/1，失败passed=false且非零；未知/缺输入不能当空集合通过。机读调用可加pnpm的`--silent`，持久报告只放ignored的`test-results/compliance/`，不要把报告当网站资源。

- **完整文件扫描：** Git NUL枚举tracked worktree、实际暂存blob与未忽略untracked，dist递归全部普通文件（含map/声明/inventory）。暂存与工作树分别检测；不扫描Git历史、不读取ignored未跟踪或local路径，tracked local、symlink、越界、缺文件与空dist拒绝。命中与改名/扩展名无关。
- **黑名单边界：** 唯一事实源为[manifest](../original/manifest.md)。其镜像/游戏表之外未记录hash的文件仍不覆盖；完整SHA256也不识别片段、修改、压缩/解码/转换内容或截图。禁止自动到local补hash；必须人工审阅源文件/来源/完整产物，不能当版权或法律检测器。
- **许可证：** 精确锁/安装/peer实例及当前platform optional范围由pnpm核对；未安装optional只明确排除，不冒称许可已扫描。实际module/generated helper、map附带source和复制资产决定分发，dev标签不豁免；public文件需声明来源，未知或义务不明确失败。
- **义务与更新：** Root MIT只授予自有代码/文档/合成资源；第三方完整LICENSE/COPYRIGHT/NOTICE另行保留。OR记录允许分支、AND满足全部；网站GPL/AGPL不允许，LGPL无具体独立加载/替换/源码/声明证明不能通过，MPL等本地已知包不自动获得网站许可。依赖/lock/原文/源输入/产物变化或新增资产后需fresh build，不使用旧inventory冒称通过。
- **公开与后续：** 本地检查不证明严格clean-room，不代替名称/来源、片段审阅、法律审核或负责人首次公开确认。[许可政策](../decisions/ADR-0008-mit-and-dependency-licenses.md)不变；后续P5才接CI/发布门禁与部署，这些命令不上传、发布或执行云操作。

`DumpAt` 与 `DumpFromStrings` 共用同目录下的 `FunctionTraversal.java`（按深度遍历被调用函数），复制脚本时也需带上它。反编译脚本只请求 C 文本，不生成未使用的语法树；结束后释放反编译器与输出文件。

编译器规范补丁按 XML 结构修改，不依赖原文件的缩进和换行；验证命令：`python3 -B -m unittest discover -s tools/ghidra -p 'test_*.py'`。

新增脚本时，在本表补充一行。
