---
type: plan
status: active
phase: P3
task: "08"
subtask: "27"
updated: 2026-10-15
---

# 27 — 对照结论

**契约来源：** [spec](../spec.md) 的 S-13、AC-13、AC-15；[对照方法与判据](../spec.md#对照方法与判据)。
**依赖：** 23, 25, 26。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 11 批准的判据，把 26 的原版样本与新版候选（记录 `src/` 树与内容身份）对照：单次转移、连续时间链与编队/机动观测分别判定；包括 P3-07 留下的基地自动挂点连续节奏与僚机 AI 发射。
- 任一样本不满足即为“不一致”：回到研究或实现，由协调者加修复子任务并在修复后重新对照，不放宽判据。不可达分支记“不适用”并附证据；可达未采到记未完成。
- 结论写入 `docs/original/behavior/B-011-ai-wingman.md` 的测量结果与验收容差节；新发现的原版事实写入格式文档，U 项随之更新；跨任务未集成项（P3-09 地图分支、P3-10 菜单）与 U-021 前提逐项列出。

## 不包含

- Core 模块说明的已知差异（28）。

## 关键文件与契约

- 11 新建的 B-011；26 的私有报告。
- 计划新增：`local/research/p3-08/comparison/`（被忽略）。

## 写入范围

- `docs/original/behavior/B-011-ai-wingman.md`：测量结果与结论。
- `docs/original/formats/ai.md`：新发现的事实。
- `docs/original/formats/executable.md`：新发现的事实。
- `docs/original/unknowns.md`：U 项状态。
- `local/research/p3-08/comparison/**`：对照脚本与报告（被忽略）。

## 验收标准

- [ ] AC-15：判据事先批准；每类观测量都有结论，绑定原版配置与新版候选、内容身份；未测分支与限制逐项列出。
- [ ] AC-13 的收尾：新事实带置信度与证据；仓库中没有原版内容或读数。

## 验证方法

- 对照脚本的输出与判据逐项核对；文档的链接与元数据检查；`pnpm check:compliance`。

## 完成证据
