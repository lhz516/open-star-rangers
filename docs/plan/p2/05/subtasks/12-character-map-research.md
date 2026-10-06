---
type: plan
status: active
phase: P2
task: "05"
subtask: "12"
updated: 2026-10-05
---

# 12 — 字符映射研究（U-030 字体部分）

**契约来源：** [spec](../spec.md) 的 S-11 的字符映射部分，S-03 的映射规则；[图形转换声明](../spec.md#图形转换声明)中的字体 `charMap`；技术决定 5；AC-16，AC-18 的 hud 与 unknowns 部分。
**依赖：** 06。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **研究：** 只读分析本地 Ghidra 项目中的 HUD 文字绘制路径，确定三个字库从文本字节到字形索引的机制，重点是 4×6 字库。证据分三类：
  - EXE 文本绘制路径；
  - 原版截图中已知文字的逐像素匹配（`local/StarRang/captures/`）；
  - 仅凭字形辨认，最多为高概率。

  只把地址、机制与置信度写入文档，不粘贴反编译输出或字形位图。
- **8×8 字库：** hud §1 已核对字母与数字位于 ASCII 位置；本子任务先确认核对过的确切码位范围（大小写、数字），再只扩展到有证据的码位。
- **单元外置位：** 本地统计三个字库在单元宽度以外是否有置位。若有，在 U-030 中登记绘制宽度语义为未确认；转换仍逐位保留。
- **生产映射：** 在 06 的生产声明中填入 `charMap` 区间，逐段对应 hud 中有证据的条目。更新测试，断言生产区间与本子任务记录的范围一致。区间只表达研究得出的规则，不复制原版数据表。
- **阻塞条件：** 出现以下任一情况，本子任务为 blocked，记录原因、受影响的 AC-16 与恢复条件，不以空映射冒充完成：
  - 4×6 字库的机制未达到高概率。恢复条件：取得新证据。
  - 证明映射只能来自 EXE 中的数据表。恢复条件：扩展 P2-01 来源定位的 spec 获批准。
- **文档：** 更新 [hud](../../../../original/formats/hud.md) §1 与 [unknowns](../../../../original/unknowns.md) 的 U-030（及其 `updated:`）。

## 不包含

- TABL 10165 叠加图与 TABL 10399、11375 的用途（U-030 其余部分）：归 P2-07。
- HUD 文字布局、字距与绘制颜色：归 P2-07/P3。
- 缓存与转换器版本：生产 `ConverterVersion` 尚未定义，本子任务的映射变化不影响缓存。

## 关键文件与契约

- **修改：** 06 的生产声明模块及其测试（`src/original-data/conversion/`，06 新增）。
- **原版文档：** [hud](../../../../original/formats/hud.md)、[unknowns](../../../../original/unknowns.md)，按需 [executable](../../../../original/formats/executable.md)。
- **本地新增：** `local/research/p2-05/` 下的分析脚本、输出与截图比对（被忽略）。
- **前提：** `local/ghidra/srangers.gpr`、`local/StarRang/SRANGERS/MAIN/SR.NOB` 与 `local/StarRang/captures/`（2026-10-05 均已存在）；缺少时本子任务为 blocked。

## 验收标准

- [ ] AC-16：hud 记录 4×6 字库的机制、置信度（至少高概率）与证据类型；8×8 字库的映射只覆盖有证据的码位。
- [ ] 三个字库的单元外置位已统计；若有，U-030 已登记绘制宽度语义为未确认。
- [ ] 生产 `charMap` 与 hud 逐项一致，没有无证据条目；U-030 状态已更新。
- [ ] `pnpm exec vitest run src/original-data`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 本地只读研究与截图比对；证据只记录命令、地址、码位范围、计数与判定。
- 文档与代码常量逐项对照审阅。
- 不适用 browser-testing。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
