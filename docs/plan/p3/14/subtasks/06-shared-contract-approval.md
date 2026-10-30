---
type: plan
status: active
phase: P3
task: "14"
subtask: "06"
updated: 2026-10-17
---

# 06 — D-01 共享输出与音频端口定稿

**契约来源：** [spec](../spec.md#实施关卡) 的 S-03、S-06、S-08、AC-06、AC-08、AC-10，D-01。
**依赖：** 05。
**执行方式：** 需用户：明确批准具体共享契约和必要量化判据；当前 spec 批准不代替该决定。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 把 05 的已核实需求落到最小字段：warnings 的 readiness/两布尔值、必要活动/运动/事件时快照；列明拥有者、生产者、类型、单位、缺失值、冻结和版本影响。
- 定稿 AudioController/能力端口的初始与更新参数、进度、状态查询、任务暂停门禁、封闭结果和错误；不将待核实原版范围硬套平台，不改变查看器缺省行为。
- 定稿所有者可信激活与异步关闭的必要公开接线，以及共享事件变更对 Runtime 测试替身和 replay 读取器/比较器的影响。
- 将具体变化与需要批准的数值判据写入相应现有 spec，按工作流取得明确批准；只有必需字段有真实需求时才扩展。代码落点由 08–18 实现。

## 不包含

- 不实现共享类型或规则，不批准冻结决定变更；不代建尚不存在的 P3-08 至 P3-13 spec。

## 关键文件与契约

- 现有 [P3-02 扩展规则](../../02/spec.md#扩展规则)、[P3-04 消费者生命周期](../../04/spec.md#消费者接线与释放)。
- 现有 [audio-controller.ts](../../../../../src/platform/audio/audio-controller.ts)、[DomainEvent](../../../../../src/core/contracts/domain-events.ts)、[Projection](../../../../../src/core/projections/projection.ts)只用于核对。

## 写入范围

- `docs/plan/p3/14/spec.md`：已授权关卡的具体定稿与审批记录。
- `docs/plan/p3/02/spec.md`：只读输出及必要版本修订。
- `docs/plan/p3/04/spec.md`：必要所有者/运行接线修订。
- `docs/plan/p2/08/spec.md`：若现有播放器公开契约需修订，限定新增能力及兼容边界。

## 验收标准

- [x] 具体字段、参数/结果形状、单位、默认值、版本和测试责任写全，没有开放任意载荷。
- [x] 受影响合同已有真实批准记录；未批准时不把本项 completed 或放行依赖代码。
- [x] 未改变 S/AC 范围；需要另改合同则先走 generate-spec/review-spec，不以 goal 自行决定。

## 验证方法

- 文档与实际 TypeScript 定义逐项核对；检查引用、元数据、版本升级/保持依据。
- 按[任务工作流](../../../../engineering/agent-workflow.md)处理审阅与审批标记；本项不运行应用实现。

## 完成证据

2026-10-17。只修改了四份 spec 与本文，没有改代码，也没有运行 DOSBox；所有新增契约按 [P3-02 扩展规则](../../02/spec.md#扩展规则)写入相应 spec。

**写入的契约：**

- [P3-02 的 P3-14 契约修订（D-01）](../../02/spec.md#p3-14-的契约修订d-01)，FA-01 至 FA-09：
  - 警告改为分区级 `communications.warnings`，没有玩家实体时保留最近一次采样；CB-14 的 `player.warnings` 删去。
  - 按 A-07 更正 CB-09：锁定等级 3、4 的谓词（CR-16），`0x38c30` 在雷达门禁之前，视角 1、6、8、0xC–0x12；撤销 CB-17 决定 11 的差异部分。
  - 新字段：`CombatTarget.activeState`、`MotionPlayer.recordMaximumSpeed`、`RenderEntity.state` 与 `speed`；`shot-fired` 的 `shooterForward`/`shooterSpeed`、`hit` 的 `victimForward`/`victimSpeed`（比较器按 f32 规则校验）。
  - 新事件 `object-retired`：活动对象进入待移除或区域切换时发出，带 tick 与发出次序；预算至多 4,096 每 tick。
  - `weapon-selected` 只更正 `commandIndex: null` 的语义，不加字段；停靠读既有的 `docking.docked`。
  - 版本：`RULES_VERSION` 相对实际集成基线递增一次（当前 7 → 8）；快照格式 6 与 replay 格式 3 不变；projection 与 Render State 的增补不递增版本。
- [P2-08 的播放控制器扩展](../../../p2/08/spec.md#播放控制器的扩展p3-14-的修订)：整数音量、声像与速率（上限 44,100 Hz），`update`、`voiceState`（256 个终态）、`pause`/`resume` 门禁、按源遍数计的 `repeat` 及其误差界；查看器行为不变。
- [P3-04 的任务音频接线](../../04/spec.md#任务音频接线p3-14-的修订)：`media` 控制器与屏障后的存活凭证、`onActivation` 与 `enableSound()`、暂停门禁、运行级失效、关闭屏障与 `MissionSoundStatus`。
- [P3-14 spec 的 D-01 定稿](../spec.md#d-01-定稿已批准)：D1-01 至 D1-17 的决定表。

**批准：** 用户于 2026-10-17 明确批准，选择“批准全部推荐方案（含三项差异）”：D1-01 至 D1-17 的全部推荐项，D1-04、D1-06、D1-13 作为已批准的差异，以及上述四份 spec 中起草的各节。批准记录写在 [P3-02](../../02/spec.md#审批)、[P3-04](../../04/spec.md#审批)、[P2-08](../../../p2/08/spec.md#审批) 与 [P3-14](../spec.md#审批) 的审批节。依赖 P3-11 的部分（拆除时的 `object-retired`、拆除与重开中的警告标志、失利处理、救援入口与结果延迟）仍然阻塞；05 (c) 的 4、5、8 交 07（D-02）。

**Rubber-duck：** 共 6 项，全部采纳：

1. 退场改为有序的 Core 事件 `object-retired`，不依赖帧末缺失；
2. 警告移到分区级，没有玩家实体时保留；
3. 屏障后的续体加存活凭证，并加必需用例；
4. 门禁关闭时的意外挂起、中断与关闭一律以 `released` 释放；
5. 新事件字段按 f32 规则比较；
6. 速率上限改为 44,100 Hz。

**验证：** 与 `domain-events.ts`、`projection.ts`、`render-state.ts`、`combat.ts`、`communications.ts`、`entity-table.ts`、`compare.ts`、`limits.ts`、`audio-controller.ts`、`browser-audio-controller.ts`、`mission-owner.ts` 与 `base-interior.ts` 逐项核对；链接检查通过；S/AC 编号未变。

**文档影响：** [Core 模块说明的交接](../../../../engineering/modules/core.md#交接)中 CB-09 攻击者条件一项，由 08 在实现时更新；Core 模块说明的投影与已知差异由 08、27 更新。STATUS 与阶段索引不变。
