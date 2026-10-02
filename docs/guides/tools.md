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
| `tools/nob-check.ts` | 解析封包中全部 TEX、BITM、MESH、MODL 条目并检查交叉引用，只输出统计与失败项 | `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB` |

新增脚本时，在本表补充一行。
