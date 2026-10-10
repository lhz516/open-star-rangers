---
type: plan
status: active
phase: P3
task: "06"
subtask: "09"
updated: 2026-10-09
---

# 09 — 世界创建的机型输入与共享契约

**契约来源：** [spec](../spec.md) 的 S-02、S-08；AC-01、AC-08（事件校验、版本与预算部分）；[对 P3-02 契约的增量](../spec.md#对-p3-02-契约的增量)的 D-01、D-04、D-05（分区结构）、D-06、D-07、D-08（预算）；检查点 A 批准的定稿形状。
**依赖：** 06。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **D-01 世界创建输入：**
  - `CreateWorldInput`、`createRecordingSession` 的输入与 `ReplayContent` 增加必需的 `craftInfo`（`{ id, content }`）；外层字段由 `readExactRecord` 校验，内容经 `readCraftInfo` 严格读取并冻结、与输入脱离；
  - 校验 Asset ID 的 kind；`original-import` 只接受唯一切片的 `data/craft-info`，synthetic 可用合法的 data Asset ID；
  - 语义检查按检查点 A 定稿：玩家、所选僚机、全部直接、延迟与编组实例的机型绑定，以及实际使用字段的数值域；错误只带结构路径与稳定原因，不回显导入值；
  - setupHash 在 `MissionSetup` 之后按固定字段顺序覆盖完整 craft-info（含 ID）；`WorldState` 显式保存冻结的机型内容；
  - replay 拒绝同一声明身份下换了 craft-info 的内容。
- **D-04 原因码：** `COMMAND_RESULT_REASONS` 增加 `player-unavailable`、`wrong-context`、`no-target`；比较校验同步。
- **D-06 领域事件：** 按检查点 A 定稿的形状加入 `speed-assist-toggled`、`speed-matched`、`object-left-world`，以及 [compare.ts](../../../../../src/core/replay/compare.ts) 的事件字段表与校验。本项只定义类型，发出归 12–14。
- **D-05 分区结构：** `flight` 拆为 `{ motion, combat }`，两者各为 `not-implemented` 或各自的 ready 联合；本项两者都保持 `not-implemented`（运动组的就绪归 15，战斗组归 P3-07）。
- **D-07 版本：** `RULES_VERSION` 与 `GAME_SNAPSHOT_VERSION` 相对合入基线各递增一次；本 goal 后续子任务不再递增，20 相对主线复核。
- **D-08 预算：** 按检查点 A 的容量核算修订 `CORE_LIMITS`（如需要），测试 limit/limit+1。
- **调用者与 test-support：** 更新 Core 测试与 test-support 中的世界创建输入（[create-world.test-support.ts](../../../../../src/core/world/create-world.test-support.ts)、[world.test-support.ts](../../../../../src/core/world/world.test-support.ts)、[replay.test-support.ts](../../../../../src/core/replay/replay.test-support.ts)），合成机型数据用 [rule-data.test-support.ts](../../../../../src/content/rule-data/rule-data.test-support.ts)。执行时若 P3-04 已接入正式 Core，同时更新其调用者，并按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 运行其既有合成会话回归。
- **测试：** 创建、各类拒绝、setupHash 的覆盖与无关性（键序、种子、僚机）、replay 拒绝、原因码与新事件的比较校验、版本拒绝。

## 不包含

- 实体与玩家状态的新字段及实例化（10）；规则系统（11–14）；运动 projection 的数据（15）。
- 修改 `src/content/`（只读消费 `readCraftInfo`）。

## 关键文件与契约

- [create-world.ts](../../../../../src/core/world/create-world.ts)、[setup-check.ts](../../../../../src/core/world/setup-check.ts)、[setup-hash.ts](../../../../../src/core/world/setup-hash.ts)、[world-state.ts](../../../../../src/core/world/world-state.ts)。
- [domain-events.ts](../../../../../src/core/contracts/domain-events.ts)、[limits.ts](../../../../../src/core/contracts/limits.ts)、[projection.ts](../../../../../src/core/projections/projection.ts)。
- [replay.ts](../../../../../src/core/replay/replay.ts)、[recording.ts](../../../../../src/core/replay/recording.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)、[snapshot.ts](../../../../../src/core/replay/snapshot.ts)、[rules-version.ts](../../../../../src/core/replay/rules-version.ts)。
- [craft-info.ts](../../../../../src/content/rule-data/craft-info.ts) 的 `readCraftInfo`、`CraftInfo`。

## 写入范围

- `src/core/contracts/**`：原因码、事件类型、上限。
- `src/core/world/**`：世界创建输入、语义检查、setupHash、世界状态及其测试与 test-support。
- `src/core/replay/**`：replay 内容、录制入口、比较校验、版本及其测试与 test-support。
- `src/core/projections/**`：`flight` 分区结构及其测试。
- `src/core/systems/*.test.ts`：随创建输入更新的测试。
- `src/app/**`、`e2e/**`：仅当 P3-04 已接入正式 Core 时更新调用者与回归。

## 验收标准

- [ ] AC-01：合法 craft-info 被严格读取、冻结并保存；缺字段、内容错误、kind/生产 ID/绑定/数值域不符各在创建前按约定的错误类型拒绝；setupHash 随内容变化，与键序、种子、僚机无关；同身份下换 craft-info 的 replay 被拒绝。
- [ ] 三个原因码与三个事件变体在类型与比较校验中就位；`flight` 分区拆为两组且都未就绪。
- [ ] 版本各递增一次；旧版本的 replay 记录被拒绝；预算的 limit/limit+1 测试通过（若修订了上限）。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过；P3-04 已接入时其浏览器回归通过。

## 验证方法

- Node 单元测试，合成机型数据；期望不由被测 helper 生成。
- 按 execute-goal 的流程完成 rubber-duck 审查后，以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 浏览器验证仅在 P3-04 已接入时适用。

## 完成证据
