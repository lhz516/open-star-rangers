---
type: plan
status: active
phase: P3
task: "02"
subtask: "05"
updated: 2026-10-09
---

# 05 — 世界、实体表、流水线与读模型

**契约来源：** [spec](../spec.md) 的 S-01、S-04、S-05；AC-03（每 tick 推进）、AC-04（命令结果）、AC-09、AC-10；[行为与边界](../spec.md#行为与边界)、[实体与生命周期](../spec.md#实体与生命周期)、[系统流水线](../spec.md#系统流水线)、[Projection 与 Render State](../spec.md#projection-与-render-state)、技术决定 5、6。
**依赖：** 01, 04。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **世界与 step：** 世界对象提供 `step(tickInput)`（返回深度冻结的 `DomainEvent[]`）、`projection()` 与 `renderState()`；快照归 08。世界的内部构造只供 07 的创建与本项测试使用，不导出可注入处理器或任意修改世界的生产入口。
- **每 tick：** 先用 04 的读取函数校验整份输入（失败时世界不变）；tick 加 1；任务流程阶段读取上一采样时间，时钟阶段按 04 的时钟推进；本 tick 输入只在本 tick 内有效，不形成跨 tick 队列。
- **命令结果：** 每个结构合法的命令恰好产生一个 `command-result`，`commandIndex` 正确；本任务没有规则处理器，所有命令为 `rejected` / `not-implemented`，不改状态。
- **实体表（按 01 的 Q-08）：** 实体 ID 从 1 起分配、在同一世界内不复用；每个种类位一张有序表，按掩码遍历的次序符合原版；生命周期区分可交互、被毁与待移除，被毁不等于移除（救援会复用玩家对象）。移除只在移除阶段进行，同时摘除种类表、清理玩家与其他存活引用。实体与生成预算按 `CoreLimits` 检查，超出为内部故障。
- **阶段表（按 01 的 Q-09）：** 代码中只有一张有序阶段表：输入登记、任务流程、时钟、对象更新与动作意图、派发器规则阶段（生成在前，子阶段按 Q-09）、帧尾规则推进、移除与提交。阶段之间显式传递本 tick 的类型化事件列表，不建发布/订阅、持久消息总线或回调注册。本 tick 新生成的实体不倒回对象更新阶段；它们在后续子阶段是否可见按 Q-09 固定并测试。生成阶段的内容由 07 填入，这里只放入固定位置。尚无规则的阶段不写假系统。
- **故障锁存：** 内部不变量被破坏或执行中耗尽预算时抛出内部故障错误，不返回部分事件；之后的 `step`、`projection`、`renderState`（及 08 的快照）都抛出同一故障。
- **玩家状态：** 玩家实体 ID（未生成时为 null）、视角模式（创建时 0xC）、上一视角模式与子模式；交互上下文由视角模式推出（Warp：0–3；基地：6；地图：8；飞行：其他）。
- **projection：** 深度冻结、与内部状态脱离：
  - `clock`、`mission`、`player` 三个就绪分区；
  - `flight`、`map`、`communications`、`result` 四个分区的类型按 spec 的 ready 形状定义，本任务一律返回 `not-implemented`，不构造空列表、0 值、全图可见或胜利默认值；
  - 不提供全体实体列表。
- **Render State：** tick、视角模式、观察实体 ID（可空），以及按 ID 升序的可呈现实体：ID、`kindBit`、表现判别或模型 Asset ID、位置、姿态、放置序号。被毁未退场与已移除分开。
- **测试：** 阶段次序与事件可见时机；遍历次序与移除清理；被毁不移除；故障锁存且无部分输出；每命令一个结果；读取不改状态哈希、旧输出不随后续 tick 改变；用合成的两帧消费者覆盖新生实体、移除与放置序号变化（不连续移动不插值）。

## 不包含

- 动作的规则效果（P3-06 至 P3-10）；地图开启时屏蔽飞行命令的门禁（P3-09 在接入地图模式时实现）。
- 世界创建、实例化与生成阶段内容（07）；快照、录制与 replay（08）。
- Runtime 的两帧保留与跨运行折叠（P3-04）；Core 模块说明（11）。

## 关键文件与契约

- 04 的 `contracts/`：时钟、输入、事件信封、上限与内部故障错误。
- [rng.ts](../../../../../src/core/determinism/rng.ts)：世界状态持有 RNG 状态。
- 计划新增：`src/core/world/world.ts`、`entity-table.ts`、`player-state.ts`；`src/core/systems/pipeline.ts`；`src/core/projections/projection.ts`、`render-state.ts` 及相邻测试（文件名可调整，职责不变）。

## 写入范围

- `src/core/world/**`：世界、实体表与玩家状态（新建）。
- `src/core/systems/**`：阶段表（新建）。
- `src/core/projections/**`：projection 与 Render State（新建）。

## 验收标准

- [ ] AC-03（推进部分）：每次成功的 `step()` 使 tick 加 1、时钟加每 tick 单位数；没有其他推进时钟的公开接口。
- [ ] AC-04（结果部分）：每个合法命令恰有一个 `command-result`，均为 `not-implemented`，状态不变；Core 没有跨 tick 的命令或按键队列。
- [ ] AC-09：阶段表与 Q-09 一致并有测试固定；新生实体的可见时机有断言；遍历与清理符合 Q-08；被毁与移除分开；故障锁存且无部分输出；没有可注入处理器的生产入口。
- [ ] AC-10（本项部分）：projection 与 Render State 深度冻结、脱离、读取不改哈希；四个规则分区为 `not-implemented`；两帧消费者契约测试通过。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过；完成前运行 `pnpm check`。

## 验证方法

- Vitest 单元测试（Node，合成世界状态）；状态哈希用 04 的规范文本临时计算，08 交付正式快照后由 08 复核。
- 不涉及浏览器或原版对照。

## 完成证据
