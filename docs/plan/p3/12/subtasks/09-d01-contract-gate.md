---
type: plan
status: active
phase: P3
task: "12"
subtask: "09"
updated: 2026-10-15
---

# 09 — D-01 共享契约定稿

**契约来源：** [spec](../spec.md) 的 S-01、AC-01；[共享契约修订（D-01）](../spec.md#共享契约修订d-01)、[技术决定](../spec.md#技术决定) 14。
**依赖：** 01, 05, 07。
**执行方式：** 需用户：批准 D-01 定稿的共享契约；用户在 goal 审批时授权 agent 按推荐方案定稿的，由协调者改为自动并记录授权出处。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 以 01、05、07 的结论为依据，定稿 spec D-01 表中各项的封闭类型、字段单位、发生阶段、写入与复位者、冻结与序列化、失败分支、预算与验证矩阵；不需要的字段附可推导性的证据。
- 定稿“帧后批次”的交付形状与 `PresentationTick`、`ExplosionActivation`、`PresentationCamera` 的最终字段，并与 P3-14 spec 的“需要 P3-12 提供的只读接口”（该 spec 在 P3-14 的工作分支上起草中）逐项对齐；差异记录在完成证据中，交 P3-14 的 D-02。
- 推导表现对象、选择缓存、帧内通知与 GPU 资源的预算（按切片最大产生率、寿命窗口与内容上限），写明依据。
- 判定版本影响：新增领域事件或持久观察字段时 `RULES_VERSION` 与快照/replay 格式各相对实际集成基线递增一次。
- 写入 [P3-02 spec](../../02/spec.md) 新增的“P3-12 的契约修订”一节与审批记录、[P3-04 spec](../../04/spec.md) 的修订记录，以及 [Core](../../../../engineering/modules/core.md) 与 [app](../../../../engineering/modules/app.md) 模块说明的契约部分。

## 不包含

- 实现（10、11、12）。
- 修改本任务 spec（契约已批准；D-01 的定稿只写入共享契约所在的文档）。
- 修改 P3-14 的 spec（交接，不越界）。

## 关键文件与契约

- [render-state.ts](../../../../../src/core/projections/render-state.ts)、[domain-events.ts](../../../../../src/core/contracts/domain-events.ts)、[destruction.ts](../../../../../src/core/systems/destruction.ts)、[player-state.ts](../../../../../src/core/world/player-state.ts)、[game-runtime.ts](../../../../../src/app/runtime/game-runtime.ts)、[game-session.ts](../../../../../src/app/session/game-session.ts)、[rules-version.ts](../../../../../src/core/replay/rules-version.ts)。
- P3-09 增量（在其分支）：`render-state.ts` 的 `RenderWarp`、`systems/view-switch.ts`。

## 写入范围

- `docs/plan/p3/02/spec.md`：P3-12 的契约修订一节与审批记录。
- `docs/plan/p3/04/spec.md`：帧后批次的修订记录。
- `docs/engineering/modules/core.md`：D-01 的契约部分。
- `docs/engineering/modules/app.md`：帧后批次的契约部分。

## 验收标准

- [ ] AC-01（定稿部分）：D-01 的类型、取样与复位点、失败矩阵、预算与版本影响已写入 P3-02、P3-04 spec 与模块说明，并有适用的批准记录，早于 10、11、12 的实现。
- [ ] 与 P3-14 接口的对齐结果与差异已记录。
- [ ] 没有开放字段、万能载荷或“其他表现字段”；文档链接与元数据有效。

## 验证方法

- 文档审阅：逐项对照 spec 的 D-01 表与 01、05、07 的结论。
- 核对批准记录的时间早于依赖它的实现提交。

## 完成证据
