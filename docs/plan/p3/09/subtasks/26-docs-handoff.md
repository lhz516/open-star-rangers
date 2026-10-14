---
type: plan
status: active
phase: P3
task: "09"
subtask: "26"
updated: 2026-10-14
---

# 26 — 文档与交接

**契约来源：** [spec](../spec.md) 的 S-12、AC-16；[范围](../spec.md#包含) 的 S-12。
**依赖：** 20, 21。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [Core 模块说明](../../../../engineering/modules/core.md)：新 API、阶段责任（`object-sets`、`warp-completion`、`frame-end`）、状态、事件、`map` 分区与 Warp 读模型、原因码、上限依据、版本与已批准差异（含 CR-11 差异 1、8）。
- [键盘输入指南](../../../../engineering/keyboard-input.md)：`w` 的门禁、右键编号的归属（按 D-01）、地图与 Warp 上下文的命令结果。
- [源码结构指南](../../../../engineering/source-structure.md)与 app/ui 模块分册：新模块的位置。
- 交接：向 P3-08（集合与可见标志、AI 对 Warp 的反应）、P3-10（基地上下文中的地图、保存页机制）、P3-11（Warp 中结算推迟、被毁/耗尽的中断边界）、P3-12（Warp 进度与规则位姿、标记呈现）、P3-13（`map` 分区、驾驶舱读数、生产几何、右键编号）、P3-14（点击、开始、到达事件）、P3-15（联合复验项）写明仍待表现与联合验收的内容。
- 内容、导入与工具指南的更新由 11 完成，本项核对其一致。

## 不包含

- 历史完成证据的改写。

## 关键文件与契约

- [core.md](../../../../engineering/modules/core.md)、[keyboard-input.md](../../../../engineering/keyboard-input.md)、[source-structure.md](../../../../engineering/source-structure.md)、[app.md](../../../../engineering/modules/app.md)、[ui.md](../../../../engineering/modules/ui.md)。

## 写入范围

- `docs/engineering/modules/core.md`
- `docs/engineering/keyboard-input.md`
- `docs/engineering/source-structure.md`
- `docs/engineering/modules/app.md`、`docs/engineering/modules/ui.md`

## 验收标准

- [ ] AC-16：文档记录实际 API、阶段、版本、原因码、上限与已批准差异；交接写明各下游任务仍待的验收。
- [ ] 新增事件在日志/比较器、新规则输入在应用/replay、关键状态在桥接中的接线与文档一致。
- [ ] 改动的文档 `updated:` 与链接有效；`pnpm check` 通过。

## 验证方法

- 文档与消费链审阅；链接与元数据核对。

## 完成证据
