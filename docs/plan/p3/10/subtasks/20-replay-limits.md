---
type: plan
status: active
phase: P3
task: "10"
subtask: "20"
updated: 2026-10-14
---

# 20 — 快照、replay 与容量

**契约来源：** [spec](../spec.md) 的 S-01、AC-12；[持久化与兼容](../spec.md#持久化与兼容)。
**依赖：** 15, 18, 19。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 核对快照包含全部未来相关的新状态（菜单、子状态与到期、保存位姿、服务队列与进度、队列与通道、限频与计数、命令码）。
- 同一运行连续两次停靠与离港的 JSON 往返录制在 Node replay 中事件与检查点一致；与占位保持时长、帧分组无关；坏规则/格式版本、内容身份、setupHash 与输入在执行前拒绝。
- 菜单、消息、事件与请求预算的 limit/limit+1 与故障锁存回归；纯读不改变给定 tick 输入的规则结果。

## 不包含

- Runtime 保持（21）；真实内容核对（24）。

## 关键文件与契约

- [snapshot.ts](../../../../../src/core/replay/snapshot.ts)、[replay.ts](../../../../../src/core/replay/replay.ts)、[recording.ts](../../../../../src/core/replay/recording.ts)、[compare.ts](../../../../../src/core/replay/compare.ts)、[limits.ts](../../../../../src/core/contracts/limits.ts)。
- 计划新增：`src/core/replay/comm-replay.test.ts`。

## 写入范围

- `src/core/replay/**`：快照遗漏的修补与测试。
- `src/core/contracts/limits*.ts`：上限与测试。

## 验收标准

- [x] AC-12：快照完整；两次停靠/离港的录制 replay 一致，与保持时长和帧分组无关；坏版本、身份、setupHash 与输入提前拒绝；预算 limit/limit+1 与锁存有回归。
- [x] 本项相邻测试、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `pnpm exec vitest run` 跑本项相邻测试，再跑 `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`；`pnpm typecheck` 与 `pnpm lint` 通过。
- 完成前按 execute-goal 做一次 rubber-duck 审查，并以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **结论：** 核对后没有遗漏，`src/core/replay/**` 与 `src/core/contracts/limits*.ts` 的源码不改，本项只新增 [comm-replay.test.ts](../../../../../src/core/replay/comm-replay.test.ts)（28 项，全部用合成内容与输入）。
- **快照与比较器（CB-16）：** `snapshot.ts` 写出了 CB-02–CB-05、CB-11 的全部新状态，`compare.ts` 读出了 CB-13 的全部事件，两者都由 `CanonicalMembers` 和 `EVENT_FIELDS` 在编译期按类型穷举。已有测试覆盖：`snapshot.test.ts` 改动每个叶子都会改变规范文本；`budget.test.ts` 核对满队列的文本预算；`compare.test.ts` 核对 P3-10 事件的校验与次序，含 `length` 与 `removed` 的 4,096/4,097；`limits.test.ts` 核对 `radioQueueItems` 与 CB-16 的推导。版本已由 11 递增：`RULES_VERSION` 5、快照 4，replay 格式仍为 2。新测试中真实运行的检查点依次出现了以下状态：
  - 菜单层级 2、4、伙伴与保存页；
  - 子状态 3、4、5 及期限与停靠对象；
  - 保存位姿；服务光标；
  - 队列中等待的项，通道 `loading`、`playing`；
  - 头像池与实体头像；
  - 待处理命令码（投递当 tick 写入，下一 tick 清除）。
- **两次停靠与离港的 replay：** 在一个世界中依次进行：
  1. 两座基地的状态查询；
  2. 逐键请求停靠 A；
  3. 回复、`0x200` 倒计时与停靠，再加两个基地键；
  4. 离港后同批请求停靠 B，再次停靠与离港。

  事件依次为两次 `docked`/`transition`（G-02/3）、两次 `departed`/`transition`（G-02/4），无取消。经 JSON 往返的 `replayRecord` 与录制结果全等，`compareReplayResults` 为 match。749 个逐 tick 检查点等于每 tick 的 `snapshotHash`。把投递当 tick 的输入清空、把离港后移一 tick，都在该 tick 报告 `events`；伪造 `docked` 事件或检查点，在该 tick 报告不一致。
- **与保持时长、帧分组无关，纯读不变：** 对同一输入重新录制，读取方式包括以下几种：
  - 只读 projection、只读 Render State、只读 snapshot，或三者倒序；
  - 每 1、5、60 或全部 tick 读一次；
  - 在每个 `transition` 处另读 0、30 或 300 次。

  得到的录制与结果都与原录制全等；`replayRecord` 本身不读。
- **执行前拒绝：** 以下记录被拒绝时，`registerTick` 的计数（以 `vi.mock` 包装）为 0，即没有开始任何 tick：
  - 一份运行到末 tick 会出 Core 故障的记录。
  - 坏 replay 版本、P3-10 之前的 `rulesVersion` 与更高的 `rulesVersion`、另一 setupHash。
  - 故障 tick 之后才出现的坏输入：未知的通讯操作、数字 10、带字段的 `launch`。
  - 65 条命令的 tick。
  - 另一内容身份；同身份下改动 `commMessages` 或 `commMenus` 的内容（`record.setupHash`）。
  - 类别中有第十座基地的内容：在 `content.commMenus.content.categories[1].kindMask` 被拒绝。
- **容量与锁存：**
  - **菜单：** 一个 tick 64 条菜单命令，得到 64 个结果；九个对象的列表中，数字 9 选中第九座基地。
  - **消息：** 状态回复把无线电队列恰好填到 4,096 项，`radio-queued.length` 为 4,096，最终快照的队列长度也是 4,096；该录制经 JSON 往返 replay 一致。再多一项时 `radio.queue` 出现 `budget-exhausted`，不丢弃；会话随后的 step、读取与导出都抛出同一故障；含这一 tick 的记录 replay 整体失败，不返回部分结果。
  - **事件与请求：** 取第二次停靠请求、首次停靠与首次离港这 3 个 tick，经 `World.step` 在规则的产出之前预填占位事件或空操作请求。恰好填满 `eventsPerTick`（32,768）或 `requestsPerTick`（16,384）时，结果与不预填相同；多一项时在 `pipeline.events` 或 `pipeline.requests` 出现故障，世界锁存，随后的 step 与三种读取抛出同一故障。这些 tick 各自投递 `deliver-command`、`dock` 或 `depart`。
- **验证：**
  - 相邻测试 `pnpm exec vitest run src/core/replay/comm-replay.test.ts` 通过（28 项）。
  - `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts --testTimeout=60000` 通过（96 个文件，2,771 项）。
  - `pnpm typecheck`、`pnpm lint`、`pnpm build` 通过。
  - `pnpm exec vitest run --testTimeout=60000` 共 8,886 项，8,884 项通过。失败的 2 项是 `tools/compliance` 的真实构建测试，在各自显式的 30 秒与 45 秒超时下超时，当时负载约为 47。
  - `pnpm check` 只有 `snapshot.test.ts` 的叶子测试超过 5 秒默认超时，其余 8,885 项通过。
  - 上述超时的测试以及 `tools/e2e-configuration.test.ts`（较早一次全量运行中超时）单独重跑全部通过。
  - 本文件的两个 describe 设 60 秒超时，与其他整段 replay 测试相同；负载下默认的 5 秒不够。
- **审查：**
  - **rubber-duck 提出三点，均已修改：**
    1. 纯读原先只把三种读取一起测试，现在逐项测试，并加倒序。
    2. 原先以“会故障的记录”间接证明拒绝发生在执行之前，现在由 `registerTick` 计数直接证明。
    3. 事件与请求预算原先直接调用 `runTick`，现在经 `World.step` 测试，并核对锁存。
  - **simplify（复用、简化、效率、层次四个角度）：** 已采纳以下修改：
    - 洪泛场景由 `BASES` 与 `statusRequests` 统一生成；
    - 循环加了上界；
    - 拒绝用例用 `appendTick`；
    - 两组预算测试合为一组；
    - `prefilledStep` 直接返回投递的请求；
    - 读取变体从 20 次重跑减为 5 次。

    未改动以下几项：
    - 把 `recordWith`、`expectRejected` 移入 test-support：需要改动无关的 `combat-replay.test.ts`。
    - 克隆状态以省去前缀重放：`EntityTable` 是类，不能 `structuredClone`。
    - 改为直接调用 `runTick`：那样就不能验证锁存。
- **文档影响：** 没有新的原版事实，`docs/original/` 与 unknowns 不改。[Core 模块分册](../../../../engineering/modules/core.md)按任务列出 replay 测试，建议在 27 的统一更新中加入 `comm-replay.test.ts` 一行。该文件不在本项写入范围内，已在报告中提出。
