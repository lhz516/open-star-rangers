---
type: plan
status: active
phase: P3
task: "08"
subtask: "28"
updated: 2026-10-16
---

# 28 — 文档与交接

**契约来源：** [spec](../spec.md) 的 S-14、AC-16。
**依赖：** 13, 22, 23, 27。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [Core 模块说明](../../../../engineering/modules/core.md)：新 API、阶段责任、AI 控制器与世界级状态、请求、事件、上限依据、已知差异（含 Core 抽取次数与原版的差别、17 的指令速度读者复核、27 的对照结论）；更新“分阶段接入”中与 AI 相关的条目；向 P3-09（`object-sets` 中地图可见性的调用点、Warp 状态的读者）、P3-10（命令请求、回复事实、友伤累计的移交、僚机停靠）、P3-11（救援时 AI 状态的重置、僚机损失）、P3-12 至 P3-14 与 P3-15 交接。
- 同步[源码结构指南](../../../../engineering/source-structure.md)（新增文件的落点）、[app](../../../../engineering/modules/app.md) 与 [ui](../../../../engineering/modules/ui.md) 分册（新事件、`b`）、[工具用法](../../../../guides/tools.md)。
- 文档日期与链接正确。

## 不包含

- 实现与对照（已在前序子任务）。

## 关键文件与契约

- 见工作范围；全部为已有文档。

## 写入范围

- `docs/engineering/modules/core.md`：API、差异与交接。
- `docs/engineering/modules/app.md`：事件与会话。
- `docs/engineering/modules/ui.md`：输入。
- `docs/engineering/source-structure.md`：新文件落点。
- `docs/guides/tools.md`：工具用法。
- `docs/original/formats/ai.md`：执行记录中交 28 的代码事实（如 §12 的负延时数据事实）。
- `docs/original/formats/executable.md`：执行记录中交 28 的代码事实（WA5、WA6、X3、D3/D6、16 的代码事实等）。

## 验收标准

- [ ] AC-16 的文档项全部完成，交接覆盖 P3-09 至 P3-15。
- [ ] 文档的链接与元数据检查通过；`pnpm check` 通过。

## 验证方法

- 文档审阅；链接检查；`pnpm check`。

## 完成证据
