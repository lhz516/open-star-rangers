---
type: plan
status: active
phase: P3
task: "03"
subtask: "28"
updated: 2026-10-09
---

# 28 — setupHash 覆盖事件触发

**契约来源：** [spec](../spec.md) 的 S-02、AC-02（Core 透传，既有 Core 测试与确定性保持）、AC-21；[涉及模块](../spec.md#涉及模块)的 `core/mission/` 一行。合并 main 后适用的 P3-02 契约：[P3-02 spec](../../02/spec.md) 的“快照、哈希与 replay”——`setupHash` 是校验后**完整** `MissionSetup` 的规范文本的 fnv1a64，覆盖全部静态输入。
**依赖：** 22。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **缺口：** 最终对齐首轮发现，合并 main 后 [setup-hash.ts](../../../../../src/core/world/setup-hash.ts) 按显式字段表序列化 `MissionSetup`，不含 P3-03 加入的 `eventTriggers` 与声明（含僚机选项）的 `eventTrigger`。两份只在事件触发上不同的任务因此得到相同的 setupHash，replay 与快照绑定不到这部分初始数据，与 P3-02 的契约不符。
- **修复：** 在 `setupValue` 中按显式字段顺序加入 `eventTriggers`（每个触发的 `ranges`，每个区间的全部字段按 [logic-content.ts](../../../../../src/content/logic/logic-content.ts) 的 `EventRange` 声明顺序，消息为字节串时按规范文本的既有字符串规则写出），并在 `declaration` 中加入 `eventTrigger`。不改变其他字段、顺序或哈希算法；不改 Core 的语义校验，Core 仍不解释也不调度触发（spec S-02）。
- **测试：**
  - 两份只在一个区间字段、一条消息字节、触发数量或某个声明的 `eventTrigger` 上不同的合成任务，setupHash 不同；输入键序不同、内容相同时 setupHash 相同；
  - replay 在同一声明身份下换了事件触发时被拒绝（setupHash 不同），沿用 P3-02 既有的拒绝路径；
  - 既有 Core 测试全部通过；若有固定的哈希期望值随之更新，并在证据中列出。
- **文档：** [core 分册](../../../../engineering/modules/core.md) 中 `setupHash` 一条改为包含事件触发（22 如实记录了合并后的缺口，此处更正）。

## 不包含

- 事件触发的语义与调度：归 P3-11。
- replay 记录格式与 `rulesVersion`：不变。setupHash 的取值变化只使旧的 replay 记录被拒绝，这符合 P3-02 的兼容规则（不兼容一律拒绝，不迁移）；生产中尚无持久化的 replay 记录（录制入口归 P3-04）。

## 关键文件与契约

- [setup-hash.ts](../../../../../src/core/world/setup-hash.ts)、[load-mission.ts](../../../../../src/core/mission/load-mission.ts)（只读）、[logic-content.ts](../../../../../src/content/logic/logic-content.ts)（只读）、[canonical-text.ts](../../../../../src/core/contracts/canonical-text.ts)（只读）。
- 测试：[create-world.test.ts](../../../../../src/core/world/create-world.test.ts)、[replay.test.ts](../../../../../src/core/replay/replay.test.ts) 与其测试支持。

## 写入范围

- `src/core/world/setup-hash.ts`：加入事件触发。
- `src/core/world/create-world.test.ts`：setupHash 的区分与稳定性测试。
- `src/core/world/create-world.test-support.ts`：带事件触发的合成任务。
- `src/core/replay/**`：replay 拒绝的测试与受影响的固定值（只改测试与测试支持）。
- `docs/engineering/modules/core.md`：`setupHash` 的覆盖范围。

## 验收标准

- [ ] setupHash 覆盖 `eventTriggers` 与声明的 `eventTrigger`；只在这些部分不同的任务得到不同的 setupHash，内容相同、键序不同时相同。
- [ ] replay 在同一声明身份下换了事件触发时被拒绝；既有 Core 测试与确定性回归通过。
- [ ] core 分册已更正，`updated:` 与链接有效。
- [ ] `pnpm check` 通过。

## 验证方法

- Node 测试（`pnpm exec vitest run src/core`），合成任务只由代码生成；`pnpm check`。

## 完成证据
