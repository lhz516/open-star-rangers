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

- [x] setupHash 覆盖 `eventTriggers` 与声明的 `eventTrigger`；只在这些部分不同的任务得到不同的 setupHash，内容相同、键序不同时相同。
- [x] replay 在同一声明身份下换了事件触发时被拒绝；既有 Core 测试与确定性回归通过。
- [x] core 分册已更正，`updated:` 与链接有效。
- [x] `pnpm check` 通过。

## 验证方法

- Node 测试（`pnpm exec vitest run src/core`），合成任务只由代码生成；`pnpm check`。

## 完成证据

- **实现：** [setup-hash.ts](../../../../../src/core/world/setup-hash.ts) 的 `setupValue` 在 `groups` 之后、`wingmanOptions` 之前写出 `eventTriggers`（每个触发只有 `ranges`；区间依次为 `lower`、`upper`、`messages`、`summarySelector`，与 `EventRange` 的声明顺序一致，消息按规范文本的既有字符串规则写出）；`declaration` 在 `aiTarget` 之后写出 `eventTrigger`（与 `MissionDeclaration` 的字段顺序一致），僚机选项共用同一函数。其他字段、相对顺序与 `canonicalHash`/fnv1a64 不变；语义校验与系统不读取事件触发，Core 不解释、不调度它们（S-02）。
- **区分与稳定性（[create-world.test.ts](../../../../../src/core/world/create-world.test.ts) 的 `event triggers (P3-03 S-02)`）：** 合成任务 `eventMission()`（[测试支持](../../../../../src/core/world/create-world.test-support.ts)，切片形状的任务加内容读取器测试的 `syntheticMission().eventTriggers`，记录 3、7 计入触发 0，记录 8 计入触发 1）的 setupHash 与无触发的切片任务不同；12 个只改事件部分的变体（区间的 `lower`、`upper`、两个 `summarySelector`，一条消息的一个字节、少一条消息、同样字节合并为一条，多一个区间、区间换序，少一个触发，记录 7 改计入触发 1、记录 4 由 null 改为触发 0）都经内容读取器接受，setupHash 两两不同且都与基准不同。相同内容重建，以及触发、区间、声明与任务顶层键序反转时 setupHash 相同。僚机选项的 `eventTrigger` 由读取器限定为 null，单独以修改后的 `loadMission` 结果直接调用 `setupHash` 证明它被写出。
- **replay 拒绝（[replay.test.ts](../../../../../src/core/replay/replay.test.ts)）：** 事件任务的录制可用原内容重放；同一声明身份下改一条消息或改记录 7 计入的触发后，沿用 P3-02 的路径在 `record.setupHash`（`must be the setup hash of the replayed content`）被拒绝。
- **反证：** 把 `setup-hash.ts` 换回基线（42dbda9）后，上述 3 个新测试失败（区分、僚机选项、replay 拒绝），其余 104 个通过。
- **固定值：** 没有测试固定 setupHash 的取值；`src/core/synthetic/synthetic-replay.test.ts` 固定的是 P1 合成场景的状态哈希，与 setupHash 无关，未变。旧的 replay 记录因 setupHash 变化被拒绝，符合 P3-02 的兼容规则，生产中尚无持久化记录。
- **检查：** `pnpm exec vitest run src/core`：36 个文件、957 个测试通过；`pnpm check`：208 个文件、6,438 个测试与构建通过。
- **Rubber-duck：** 无阻塞问题；确认每个变体都经读取器接受并只隔离目标差异、`MissionSetup`/`ResolvedDeclaration`/`EventTrigger`/`EventRange` 的字段全部覆盖且顺序符合要求、僚机选项测试作为共用序列化函数的守护有意义。1 项文档意见采纳：core 分册原句“创建与语义校验不读取事件触发”与 setupHash 读取它们矛盾，改为“语义校验不读取，创建只在计算 setupHash 时写出”。
- **Simplify：** `eventMission()` 改为复用内容读取器测试的触发夹具，去掉单独导出的草稿类型（改为与 `groups` 一样的内联类型），replay 拒绝保留两个代表性变体并只录制 1 个 tick，僚机选项测试缓存哈希；未采纳去掉 `[...value.messages]` 的复制，以与既有字段（`origins`、`nameCandidates` 等）的写法一致。之后重跑 `src/core` 测试与反证。
- **文档影响：** [core 分册](../../../../engineering/modules/core.md)的 `setupHash` 一条改为包含事件触发并写明位置与区间字段顺序；按协调者要求，名称引用一节与 P3-12、P3-13 交接中“种类名待 P3-03”的措辞改为指向 P3-03 导入的 `data/craft-info`（CINF 机型记录 +0x04）。`updated:` 已是 2026-10-09。源码结构指南中 `world/` 的“setupHash”描述仍准确，无需修改。
