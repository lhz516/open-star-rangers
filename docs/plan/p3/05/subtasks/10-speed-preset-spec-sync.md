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

- [x] 两份 spec 的修订与 P3-05 spec 的速度档位命令一致，修订记录含真实批准来源与日期。
- [x] 没有新增 S/AC 编号；`node tools/task-state.ts p3/02` 与 `node tools/task-state.ts p3/06` 没有因本修订报告覆盖失效或结构问题。
- [x] 改动段落的链接与锚点可解析，`updated:` 已更新。

## 验证方法

- 逐条对照 P3-05 spec；运行两个 router 命令并记录输出。

## 完成证据

- **前提：** P3-06 已按用户指示提前集成（合并提交 `a98f89de`，见 goal 执行记录），本工作树具备 P3-06 的 spec、档位规则（`presetThrottle`）与测试；集成基线 `RULES_VERSION` 2、`GAME_REPLAY_VERSION` 1。动 P3-06 spec 之前已向 P3-06 协调者发送跨会话消息；对方答复其剩余的 spec 改动（子任务 25 的实例化步骤 3、未决事项与审批，08 的对照方法与判据和审批）不涉及档位措辞、AC-04 与技术决定 3，17 的原版配方用按键而非 Core 命令，18 将按运行时的现行命令核对 R-04b。
- **修订内容：** [P3-02 spec](../../02/spec.md#p3-05-的契约修订速度档位命令) 新增“P3-05 的契约修订（速度档位命令）”：`speed-preset` 变体与校验、门禁与结果同速度命令、取代 D-04 中普通飞行 `select-number` 的档位含义（默认飞行处理 `ignored`/`wrong-context`，未实现上下文 `rejected`/`not-implemented`，菜单优先级归 P3-10）、`rulesVersion` 与 replay 格式版本相对 2/1 各加一、快照格式不变。[P3-06 spec](../../06/spec.md#p3-05-的速度档位修订) 新增“P3-05 的速度档位修订”：档位入口改为 `speed-preset` 且与原路径等价，AC-04/R-04b 的档位核对改由 `speed-preset` 承担、判据不变，通讯菜单打开时按 Q-04，物理绑定，版本说明。两份 spec 的审批节各加一条修订记录。
- **批准：** 用户于 2026-10-10 对“是否批准这两份 spec 修订？”选择“批准修订”，记录写在两份 spec 的审批节。
- **检查：** 两份 spec 的 S/AC 编号不变；相对链接与锚点检查 0 个问题；`node tools/task-state.ts p3/02` 为 `done`，`node tools/task-state.ts p3/06` 为 `execute-goal`（P3-06 自身的执行状态，没有结构问题）；`updated:` 为 2026-10-10。
- **rubber-duck：** 采纳三项：P3-06 的 D-07 与持久化一节描述的是 P3-06 自己的版本变化，新节明确本修订只再加 `rulesVersion` 与 replay 格式版本、不加快照格式版本（P3-02 一节同样说明 D-07 的“replay 格式不变”只属 P3-06）；审批记录原先引用尚不存在的 goal 记录，改为写明批准问题与回答；P3-06 新节的优先规则同时覆盖“命令形状不变”的表述。审阅另确认：replay 记录序列化 `TickInput[]` 并逐 tick 以命令联合校验，新增变体确实改变 replay 格式；快照不含命令且已带 `rulesVersion`，格式不变；结果与 P3-06 现有门禁（先 `player-unavailable`，再 Warp/基地/地图 `wrong-context`）一致。
- **文档影响：** 只需两份 spec 的修订；core 模块说明与已知差异随 16、32 的实现更新，本项无其他文档改动。

