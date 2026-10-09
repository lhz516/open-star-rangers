---
type: guide
status: active
phase: all
updated: 2026-10-08
related: [ADR-0015]
---

# Core 模块说明

本文件是[源码结构指南](../source-structure.md)的模块分册，记录 `src/core/` 中已交付代码的当前 API 与契约要点。目录树、职责边界与 helper 归属以指南为准，行为契约以各任务 spec 为准；修改本模块代码的任务同步更新本文件。

[core/](../../../src/core/) 的确定性设施在 `determinism/`，P1 合成场景、快照与 replay 在 `synthetic/`（合成契约不是正式玩法契约，见 [ADR-0015](../../decisions/ADR-0015-source-module-structure.md)）；纯度与确定性规则见[工程约定](../README.md)。

## Core 任务载入

[core/mission/load-mission.ts](../../../src/core/mission/load-mission.ts)（[P2-09/11](../../plan/p2/09/subtasks/11-core-load-mission.md)）的 `loadMission(input)` 是 Core 的纯函数，契约见 spec 的 [Core 载入结果](../../plan/p2/09/spec.md#core-载入结果)：

- **输入：** `LoadMissionInput` 为 `{ mission, craftTypes, wingmanRoster }`，每项为 `{ id: AssetId, content: unknown }`。Core 仍在运行时核对输入，不信任调用者给的类型：先核对任务 ID，再用 [logic-readers.ts](../../../src/content/logic/logic-readers.ts) 读取任务；确认机型表与僚机名单的 ID 是任务引用的 ID 之后，才读取它们的 `content`。读取路径为 `input.<asset>.content`；单个 payload 内部的错误是读取器的 `ContentContractError`，原样传递。
- **前提：** 只检查跨 Asset 的一致性，不满足时抛出 `CoreInputError(path, reason)`，路径指向输入位置：
  - 输入或某项不是对象；
  - 任务 ID 不是 `mission` 类 Asset ID；
  - 机型表与僚机名单的 ID 不是任务引用的 ID，或名单引用了另一张机型表；
  - 声明或僚机选项引用了表中没有的机型；
  - 任务中没有或有两个玩家声明，或有僚机选项是玩家机型；
  - 表中有任务与名单都没引用的机型。这一项最后检查，以免缺少玩家时被误报为多余机型。
- **输出：** 冻结的 `MissionSetup`，字段依次为 `mission`、`campaign`、`coordinates`、`mapFrame`、`namePool`、`spawnRegions`、`declarations`、`player`、`groups`、`wingmanOptions`。声明与僚机选项附加解析出的 `side`、`model`（model 的 Asset ID）与 `baseInteraction`；`craftType` 为 null 时三者为 null、null、false。结果由读取器的新副本组成，与输入隔离；相同输入得到深度相等的结果。
- **纯净：** 不应用默认值，不推导生成时刻、顺序或位置，不使用 RNG 或宿主时间，只导入 `content/` 与 Core 自己的错误类型。

针对性检查为 `pnpm exec vitest run src/core/mission tools/engineering-boundaries.test.ts`。
