---
type: plan
status: active
phase: P2
task: "05"
subtask: "09"
updated: 2026-10-05
---

# 09 — 加固 nob-check 与本地全量结构校验

**契约来源：** [spec](../spec.md) 的 S-12 的本地校验，S-13 的工具文档；[限值与预算](../spec.md#限值与预算)中安全上限须由全量校验核对的要求；技术决定 7、12；AC-14，AC-18 的观察最大值与工具指南部分。
**依赖：** 03。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **[nob-check.ts](../../../../../tools/nob-check.ts)：** 改用 03 的源结构读取：
  - DATA；
  - TEX 与 BITM 的整条目记录；有嵌入调色板时核对不透明像素索引都小于条目数，没有时只做结构与 256 色上界校验；
  - MFDD 两个列表中的全部记录；
  - CCKD 的字体目录与三个字体表。

  M2ID、NEBC、MESH、MODL 的既有检查保持不变。
- **输出：** 每类的通过数与失败数，失败原因只写 code 与结构位置（条目 ID 属结构信息，可以出现）；另输出观察最大值：图像宽、高，调色板条目数，字体单元宽、高。不输出任何像素、调色板值或字形。
- **本地运行：** `node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB`。期望 59 个 TEX、28 个 BITM、3 个 MFDD 的全部记录，3 个 CCKD 的全部字体表，以及 DATA，都通过。
  - 任何实例被拒绝时，本子任务为 blocked。记录原因与受影响的 AC-14，按证据修订 spec，不放宽为静默接受。
- **原版文档：** 像 [imfat §6](../../../../original/formats/imfat.md#6-observed-maxima-against-the-readers-limits-confirmed) 那样，把观察最大值与本任务限值的对照写入 [textures](../../../../original/formats/textures.md)；字体单元写入 [hud](../../../../original/formats/hud.md)。附置信度与检查命令，更新 `updated:`。
- **工具指南：** 在 [tools](../../../../guides/tools.md) 新增 nob-check 一节：用途、命令、输出字段与隐私约束；[AGENTS.md](../../../../../AGENTS.md) 中的命令说明若不再准确，同步更新。

## 不包含

- CCKD 元素、TABL 记录与 ANIM：容器归 P2-07，编码 1 不支持。
- 生产转换路径与本地基准：归 [10](./10-local-base-check.md)。

## 关键文件与契约

- **修改：** [nob-check.ts](../../../../../tools/nob-check.ts)、[textures](../../../../original/formats/textures.md)、[hud](../../../../original/formats/hud.md)、[tools](../../../../guides/tools.md)，按需 [AGENTS.md](../../../../../AGENTS.md)。
- **复用：** 03 的源结构读取；仓库工具可以使用全部能力。
- **前提：** 本地存在 `local/StarRang/SRANGERS/MAIN/SR.NOB`（2026-10-05 已存在）；缺少时本子任务为 blocked。

## 验收标准

- [ ] AC-14：全部 TEX、BITM、MFDD 记录，CCKD 字体表与 DATA 通过结构校验；有嵌入调色板的图像索引都在范围内；输出只有计数、失败原因与观察最大值。
- [ ] 观察最大值都在 spec 的结构限值内，并已写入 textures 与 hud，附命令与置信度。
- [ ] 工具指南记录 nob-check 的命令与输出；`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 本地运行工具，证据只记录命令、各类计数与观察最大值，不粘贴原版内容或私人绝对路径。
- 不适用 browser-testing。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
