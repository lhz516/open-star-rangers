---
type: plan
status: active
phase: P3
task: "11"
subtask: "22"
updated: 2026-10-17
---

# 22 — 文档与交接

**契约来源：** [spec](../spec.md) 的 S-12、AC-16；[与其他任务的接口](../spec.md#与其他任务的接口)、[缺省与标注](../spec.md#缺省与标注)。
**依赖：** 17, 18, 21。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [Core 模块说明](../../../../engineering/modules/core.md)：任务流程、段 2、全清、损失、救援、失败、退场与完成的 API、阶段与状态所有权、事件、上限与版本；已知差异（G-02 零媒体时间对救援的适用、项目结果摘要）；对 P3-12（被毁视角进出时机）、P3-13（消息事件与 Q-09 常量、视角标签）、P3-14（结局与救援的事件）、P3-15（闭环复验与逐分支覆盖矩阵）的交接。
- [app](../../../../engineering/modules/app.md) 与 [ui](../../../../engineering/modules/ui.md) 分册：完成截断、结果阶段、终局占位、结果页、重试与返回。
- [slice-gaps](../../../../engineering/slice-gaps.md)：G-02/5 至 G-02/10 与 G-06（含 P3 不判定勋章、项目摘要）的呈现与位置。
- [tools](../../../../guides/tools.md)：`replay-check.ts` 对完成结束录制的说明（如有变化）；[键盘输入指南](../../../../engineering/keyboard-input.md) 中被毁序列与结果页的输入说明（如有变化）。
- 上游共享契约修订影响 P3-02、P3-04、P3-07 至 P3-10 的既有 goal/subtask 时，只记录需重验的范围，不改写历史结论。

## 不包含

- 原版事实（04、21）；STATUS 与阶段索引（协调者）。

## 关键文件与契约

- 上述文档；本任务各实现子任务的完成证据。

## 写入范围

- `docs/engineering/modules/core.md`：Core API、已知差异与交接。
- `docs/engineering/modules/app.md`：会话与所有者。
- `docs/engineering/modules/ui.md`：结果页与占位。
- `docs/engineering/slice-gaps.md`：G 项记录。
- `docs/engineering/keyboard-input.md`：输入说明的更新（如有）。
- `docs/guides/tools.md`：工具用法的更新（如有）。
- `docs/engineering/README.md`、`docs/engineering/source-structure.md`：E2E 合成数据与观察辅助（18 的交接）。
- `src/core/world/player-state.ts`、`src/core/rules/radio.ts`：仅过时注释（`heavyDamage` 只供 P4 勋章，ME-18；radio 的“P3-11 adds it”）。

## 验收标准

- [ ] 文档与实际代码、契约一致；G 项与界面一致；交接对象与责任明确。（AC-16、S-12）
- [ ] 文档 `updated:` 已更新，链接与锚点有效。
- [ ] 需重验的历史范围已记录，没有改写历史结论。

## 验证方法

- 文档链接与元数据检查；对照代码中的 G ID 常量与注释。

## 完成证据
