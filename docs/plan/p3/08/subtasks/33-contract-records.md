---
type: plan
status: active
phase: P3
task: "08"
subtask: "33"
updated: 2026-10-16
---

# 33 — 契约与批准记录的补齐

**契约来源：** 29 的首次核对（goal [执行记录](../goal.md#执行记录) 2026-10-16）；用户 2026-10-15 的常设授权。
**依赖：** —
**执行方式：** 自动。由协调者依用户授权决定并记录。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 两个运行时故障 `ai-firing.lock-gun`（列表 1 当前挂点为 +0x18 ≠ 0 的炮）与 `ai-piloting.main-weapon` 不在已批准契约中：在 P3-02 CR-15 的运行时故障清单中记录二者（切片真实内容不触发，原版越界读取），并作为 CR-24 的决定记录批准与被排除方案；同步 P3-08 spec 第 133 行一带“只剩两个运行时故障”与 `negative-delay` 的过时表述。
- 在 P3-02 的审批节补记 2026-10-15 执行中 P3-08 的契约修订：CR-24 决定 16、17，CR-15 的变化（撤销 `negative-delay`、澄清 `missing-transponder`、加入 `ai-interpreter.channel` 与上项两个故障），CR-23 的 AI 锁定时序更正，`canonicalTextLength` 提高到 2²⁵；CR-25 的版本号注明合并后的实际值（规则 7、快照 6、replay 3）。
- 在 P3-08 spec 的审批节补记 2026-10-16 的两批决定（e-02/wii-01/wii2-01 的窗口计入、已知限制第 11–16 项、b-09 布局更正、27 的四项决定）。
- 把合并 P3-09 与 P3-10 留下的两个联合故障记入 core.md 的已知差异或交接（负责：P3-09 的 MW-04 或 P3-10 的 CB-07），使其在合并到 main 后仍有记录。
- 文字修正：26 的完成证据中已被 2026-10-16 决定取代的“未满足/待定”表述（加注取代说明，不删历史）；B-011 跨任务项补 P3-11 救援与 P3-10 停靠；26 完成证据中引用的单条指令改为“地址加含义”的写法。

## 不包含

- 行为与代码变化；其他任务的契约。

## 关键文件与契约

- [P3-02 spec](../../02/spec.md)、[P3-08 spec](../spec.md)、[core.md](../../../../engineering/modules/core.md)、[B-011](../../../../original/behavior/B-011-ai-wingman.md)、[26](./26-original-formal-runs.md)。

## 写入范围

- `docs/plan/p3/02/spec.md`：CR-15、CR-24、CR-25 与审批节。
- `docs/plan/p3/08/spec.md`：过时表述与审批节。
- `docs/engineering/modules/core.md`：联合故障的记录。
- `docs/original/behavior/B-011-ai-wingman.md`：跨任务项。
- `docs/plan/p3/08/subtasks/26-original-formal-runs.md`：取代说明与指令写法。

## 验收标准

- [ ] 两个运行时故障、2026-10-15 与 2026-10-16 的各项决定都在相应 spec 的正文与审批节有记录，引用用户授权原话。
- [ ] 联合故障在 core.md 有负责任务的记录；文字修正完成。
- [ ] 链接与锚点检查、`pnpm check:compliance` 通过；没有原版内容。

## 验证方法

- 逐项对照 29 的核对报告；链接检查；git 审阅。

## 完成证据
