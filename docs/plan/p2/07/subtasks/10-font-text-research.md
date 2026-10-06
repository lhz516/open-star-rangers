---
type: plan
status: active
phase: P2
task: "07"
subtask: "10"
updated: 2026-10-05
---

# 10 — 文字字库与字形核对（R7）

**契约来源：** [spec](../spec.md) 的 S-05 中 R7；[研究与入选门槛](../spec.md#研究与入选门槛)中 R7 一行；[不包含](../spec.md#不包含)中 HUD 文字一项；技术决定 7；AC-17。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **定位文字：** 在参考画面（前视飞行与战略地图）中找出各处文字，按 P2-05 的生产字体 payload（`font/hud/8x8-1`、`font/hud/8x8-2`、`font/hud/4x6`）逐像素匹配字形的置位像素（只比较是否置位，颜色取自截图、不作断言），确定每处文字所用的字库与字距。
- **字形核对：** 经 [glyph-lookup.ts](../../../../../src/content/graphics/glyph-lookup.ts) 与生产字符映射，核对截图中需要的每个码位都能得到：
  - 都能得到：记录比较像素数与一致数；
  - 需要未映射的码位且有证据：按证据扩展 [production-graphics.ts](../../../../../src/original-data/conversion/production-graphics.ts) 的字符映射区间，更新 hud §1.1 的码位表与相关测试；
  - 没有证据：记为未确认，不加入映射。
- **单元外像素：** 若截图证据显示 4×6 字库单元外像素的绘制方式（裁剪或不裁剪），更新 U-030；否则保持未确认并写明转交 P3。
- **记录：** hud 为每处文字记录所用字库、字距与置信度，不记录文字内容。
- **方法：** 脚本与输出在 `local/research/p2-07/`，经产品入口与生产图形步骤取得字体 payload，不另写字体解析。

## 不包含

- 覆盖表与图像族：归 [09](./09-hud-family-research.md)（其中文字行引用本子任务的结论）。
- HUD 文字的布局、字距与颜色的规范表示：归 P3（spec 不包含）。
- `graphics` 版本组件：本任务内由 [13](./13-group-assembly.md) 加入一次，本子任务扩展映射时不另行递增（见 [goal](../goal.md#代码现状与前提)）。

## 关键文件与契约

- **修改：** [hud.md](../../../../original/formats/hud.md)、[unknowns.md](../../../../original/unknowns.md)；有证据扩展映射时修改 [production-graphics.ts](../../../../../src/original-data/conversion/production-graphics.ts) 及其测试。
- **计划新增（不提交）：** `local/research/p2-07/` 下的字形比较脚本与输出。
- **本地数据：** `local/StarRang/cd/` 或 `SR.NOB`、`local/StarRang/captures/`。

## 验收标准

- [ ] AC-17：hud 为参考画面中的每处文字记录所用字库、字距与置信度，以及比较像素数与一致数；不含文字内容。
- [ ] AC-17：截图需要的每个码位都能经生产字符映射得到，或已按证据扩展映射，或记为未确认。
- [ ] U-030 的单元外像素语义按证据更新或保持未确认并写明转交 P3。
- [ ] 若修改了生产映射：`pnpm typecheck`、`pnpm lint` 与 `pnpm test -- src/original-data/conversion/` 通过，hud 码位表与代码一致。

## 验证方法

- 本地研究脚本；证据只记命令、文件名、计数与判定。
- 文档与生产常量对照审阅。
- 修改了生产映射时，完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
