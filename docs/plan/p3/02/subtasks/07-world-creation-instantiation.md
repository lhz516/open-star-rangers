---
type: plan
status: active
phase: P3
task: "02"
subtask: "07"
updated: 2026-10-09
---

# 07 — 世界创建、任务实例化与僚机

**契约来源：** [spec](../spec.md) 的 S-03、S-06、S-07；AC-02、AC-03（生成到期）、AC-05、AC-06（别名集成）、AC-07、AC-08、AC-10（来源与放置序号）；[运行配置与世界创建](../spec.md#运行配置与世界创建)、[任务实例化](../spec.md#任务实例化)、[僚机](../spec.md#僚机)、技术决定 7、8。
**依赖：** 03, 05, 06。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **创建入口：** 输入为三份逻辑 Asset、`ContentIdentity` 与运行配置 `{ rawDifficulty, wingman, seed, clockUnitsPerTick? }`：
  1. 用 [load-mission.ts](../../../../../src/core/mission/load-mission.ts) 得到 `MissionSetup`，读取器错误原样传递；用 `readContentIdentity` 校验身份结构。
  2. 配置：原始难度 0–100 的整数，按阈值 34、67 求出的组必须等于 `campaign.group`；`original-import` 只接受难度 19、group 0/slot 1 与生产任务 Asset `mission/first-campaign`，且只用默认 `clockUnitsPerTick`；其他取值只用于 `synthetic` 来源的契约测试。僚机为 null 或 `wingmanOptions` 的索引；种子为 uint32。
  3. 语义校验：玩家为种类位 0、僚机为位 1；模型、阵营与交互类别符合已支持的绑定；比例有限可换算；地图轴与世界矩形符合本切片；`RuleInputs` 中的显式 0 拒绝；切片外路径拒绝（`gridSpacing` 非零、非空且不为 100 的生成概率、掩码 `0x87c` 内的种类、乘 64 后超出 uint32 的生成时刻，以及 03 发现的其他未实现分支）；按安全整数展开“请求数 × 成员数”并对照 `CoreLimits`。
  4. 计算 `setupHash`：校验后完整 setup（名称、坐标、成员与全部规则输入）的规范文本哈希。
  5. 初始状态：tick 0、时钟 0、视角模式 0xC、任务状态“已构建”、没有实体；生成队列按 03 的 Q-01 排好；只完成 Q-04 证实属于构建期的缺省与抽取。创建不返回事件。
  错误只含稳定原因与结构路径，不回显导入的名称、坐标或 payload。
- **缺省值（Q-04）：** 各字段分别实现 null、显式值、负值语义，只对已证实的字段钳为 0；+0x70/+0x74 的缺省为 (组 + 3) × 任务号，任务号小于 1 时为 100；+0x78 的随机映射与抽取时机按 Q-04；任务号取 `campaign.slot`。
- **生成（填入 05 的派发器规则阶段）：** 生成队列检查只为每个到期请求产生生成请求，实例化在 05 的请求处理中按投递次序进行；到期判定“经过时间 > 生成时刻”；每次到期的请求数（段 1 用 +0x10、段 5 用 +0）；段 5 成员按布局偏移 i mod 布局数、余数为 0 时重算锚点、模板字段复制条件按 Q-02；放置调用 06 的服务；同刻多项与多次请求的次序按 Q-01。
- **实例化（Q-07）：** 写入 05 实体表的字段：种类、对象状态（新建）与活动（非玩家实体是否停放按 Q-07）、带命名空间的来源（编组索引、第几次请求、成员位置）、名称引用、阵营、模型、交互标志、位置、姿态、规则输入副本、放置序号；更新源记录与编组的生成计数与当前对象关联；玩家实例化设视角模式 0xC；产生 `object-instantiated` 事件（按实例化顺序）。依赖机型记录的初值不填，交 P3-06、P3-07。
- **名称（Q-05）：** 封闭联合 `none`、`candidate`、`pool`、`craft-type`；占用与释放进入世界状态；种类名文字若不在三份逻辑 Asset 中，只交付结构引用并在完成证据中列出交给 P3-03 的导入需求。
- **僚机（Q-06）：** null 时整个运行都不生成僚机；索引 i 时按门禁排程名单第 i 项（原版选择值 = i + 1），时刻、放置（锚点缺省为玩家记录）、缺省值与名称按 Q-06。僚机选择进入 `mission` projection。
- **供其他规则使用的接口：** 生成开关（清除由 P3-11 调用）与查询；待生成项及其来源的查询（P3-11 全清判定）；实例化通知（P3-11 段 2 计数）；放置服务（P3-11 救援）。这些接口只在 Core 内使用。
- **测试：** 合成任务覆盖[任务实例化](../spec.md#任务实例化)表中每条“实现”路径，期望由测试独立写出，不复用被测 helper；2 与 4 单位/tick 下的生成到期边界；每类拒绝的路径与原因，以及诊断不含 `MARKER` 名称或坐标；同一输入创建两次的初始状态规范文本相同，修改调用者数据不影响世界。

## 不包含

- 正式快照与 replay（08）；真实内容核对（09）；原版运行时核对（10）。
- 运动、武器、AI、地图、通讯与任务流程规则（P3-06 至 P3-11）；种类名文字的导入（P3-03）。

## 关键文件与契约

- [load-mission.ts](../../../../../src/core/mission/load-mission.ts)、[logic-content.ts](../../../../../src/content/logic/logic-content.ts)、[content-identity.ts](../../../../../src/content/content-identity.ts)：只读消费。
- [logic-content.test-support.ts](../../../../../src/content/logic/logic-content.test-support.ts)：合成任务的基础，测试中按需改写。
- 05 的世界与阶段表；06 的放置与换算；04 的契约。
- 计划新增：`src/core/world/create-world.ts`、`run-config.ts`、`setup-hash.ts`；`src/core/systems/spawn.ts`；`src/core/rules/record-defaults.ts`、`spawn-schedule.ts`、`name-assignment.ts` 及相邻测试（文件名可调整，职责不变）。

## 写入范围

- `src/core/world/**`：创建入口、运行配置与 setupHash。
- `src/core/systems/**`：生成阶段。
- `src/core/rules/**`：缺省值、排程与名称分配。
- `src/core/projections/**`：mission 分区中的僚机选择与任务状态。

## 验收标准

- [ ] AC-02：初始状态符合契约；每类非法配置、生产切片或难度不符、种类绑定错误、换算异常、别名不符、切片外路径与展开超限都在创建前拒绝，不返回世界；诊断不含名称与坐标；`original-import` 与 `synthetic` 的范围门禁分别有测试；相同输入两次创建的规范文本相同。
- [ ] AC-03（生成部分）：在 2 与 4 单位/tick 下，生成时刻为 T 秒的项在时钟首次大于 64T 的 tick 实例化。
- [ ] AC-05：每条“实现”路径的实例化 tick、次序、数量、来源、编组成员与布局偏移、`object-instantiated` 事件的内容与次序；生成开关清除后不再实例化；实体 ID 从 1 起连续且不复用。
- [ ] AC-06（集成部分）：同时被编组引用的 `object` 来源记录只换算一次；仅段 5 可达记录按 Q-03 处理。
- [ ] AC-07：Q-04 逐字段的 null/显式零/负值/正值语义与抽取时机；Q-05 的候选、池、无名、种类名、耗尽与释放；占用与计数进入世界状态。
- [ ] AC-08：僚机为 null 时没有种类位 1 的对象；每个索引恰好生成该名单项，时刻、放置、缺省值与名称符合 Q-06；越界索引被拒绝。
- [ ] AC-10（本项部分）：事件与 Render State 中的来源命名空间、模型与种类分离、放置序号正确。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过；完成前运行 `pnpm check`。

## 验证方法

- Vitest 单元测试（Node，合成逻辑内容），独立期望表与带 `MARKER` 的隐私断言。
- 真实内容与原版对照分别在 09、10 进行。

## 完成证据
