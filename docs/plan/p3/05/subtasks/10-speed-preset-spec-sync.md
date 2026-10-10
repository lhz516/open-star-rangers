---
type: plan
status: active
phase: P3
task: "05"
subtask: "10"
updated: 2026-10-10
---

# 10 — P3-02 与 P3-06 spec 同步：`speed-preset`

**契约来源：** [spec](../spec.md) 的[执行前提](../spec.md#执行前提)、[速度档位命令](../spec.md#速度档位命令)、[持久化与兼容](../spec.md#持久化与兼容)、技术决定 4；S-06；AC-07 的“共享 spec”部分。
**依赖：** 无。
**执行方式：** 需用户：批准对已批准 P3-02、P3-06 spec 的修订（工作流规定修订已批准的行为须由用户重新批准，agent 不能代填批准记录；若用户已给出覆盖此修订的明确预先授权，协调者记录其原文）。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **前提：** goal 的 P3-06 集成已满足（P3-06 的 spec、代码与测试已在本工作树）。未满足时本项记为 blocked。若届时 P3-06 的 goal 仍在执行，先经跨会话消息与 P3-06 的会话协调，避免同时改动其 spec。
- 起草对 [P3-02 spec](../../02/spec.md) [输入与命令](../../02/spec.md#输入与命令)的修订：命令联合新增 `{ type: 'speed-preset', level: 1–9 的整数 }`，校验与序列化规则，按其[扩展规则](../../02/spec.md#扩展规则)递增 `RULES_VERSION` 与 `GAME_REPLAY_VERSION`（相对实际集成基线各一次），snapshot 形状不变；旧录制在执行前因版本不匹配拒绝。
- 起草对 P3-06 spec 的修订：普通飞行的档位由 `select-number` 改接 `speed-preset`（效果与已交付的档位规则等价，Shift+1 归零，Shift+0 仍为 `speed maximum`），`speed-preset` 在其他上下文为 `wrong-context`；`select-number` 的默认飞行处理为 `ignored`/`wrong-context`，尚未实现的基地/地图处理仍为 `rejected`/`not-implemented`；通讯菜单打开时的处理按 Q-04 的结论与 P3-10 的边界。
- 两份修订都不新增 S/AC 编号，不改写其 goal 与子任务的历史证据；在各自审批节追加修订记录，如实写明批准来源与日期。向用户展示摘要与差异并取得明确批准。

## 不包含

- 代码迁移（16）；P3-10 的菜单优先级。

## 关键文件与契约

- [P3-02 spec](../../02/spec.md)；P3-06 spec（集成后位于 `docs/plan/p3/06/spec.md`）的“操纵”、技术决定 7/8 与速度档位相关段落。
- 实现现状（P3-06 分支）：`src/core/rules/flight-control.ts` 的 `presetThrottle`、`src/core/systems/flight-control.ts` 的速度命令处理、`src/core/contracts/domain-events.ts` 的结果原因（含 `wrong-context`）。

## 写入范围

- `docs/plan/p3/02/spec.md`：命令联合与版本修订及记录。
- `docs/plan/p3/06/spec.md`：档位入口修订及记录。

## 验收标准

- [ ] 两份 spec 的修订与 P3-05 spec 的速度档位命令一致，修订记录含真实批准来源与日期。
- [ ] 没有新增 S/AC 编号；`node tools/task-state.ts p3/02` 与 `node tools/task-state.ts p3/06` 没有因本修订报告覆盖失效或结构问题。
- [ ] 改动段落的链接与锚点可解析，`updated:` 已更新。

## 验证方法

- 逐条对照 P3-05 spec；运行两个 router 命令并记录输出。

## 完成证据
