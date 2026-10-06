---
type: plan
status: active
phase: P2
task: "11"
subtask: "04"
updated: 2026-10-06
---

# 04 — 任务载入诊断

**契约来源：** [spec](../spec.md) 的 S-06、AC-10（Node），以及[数据模型与契约](../spec.md#数据模型与契约)中的任务载入结果、技术决定 10。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新增纯函数（`src/app/resources/` 中）：
  - 从完整的 `logic` 组按 `role` 取出任务、机型表与僚机名单三个逻辑 Asset，用 `decodeLogicPayload` 解码，再调用 `loadMission`；
  - 结果为 `loaded`（附结构摘要）或 `failed`（附 `{ kind: 'core-input' | 'content', path, reason }`）。
- 结构摘要只含：
  - 声明数、编组数、生成区域数、僚机选项数、名称池条目数；
  - 任务的 Asset ID、`campaign`、地图轴向与坐标单位标注、玩家声明序号；
  - 各阵营的声明数。

  不含名称池文字、消息或任何原版文字。
- 引用校验：解析到模型的声明数，以及每个模型 Asset ID 是否在持有的 `models` 组中。`models` 组缺失或不完整时如实标注。
- 资源持有者在资源包替换后（`logic` 组完整时）计算一次任务载入结果，并纳入状态阶梯（“任务可载入 Core”“任务不可载入”）。
- Node 测试使用合成的逻辑内容：
  - 成功；
  - 两个玩家声明（`CoreInputError`）；
  - 机型表缺少引用的机型（`CoreInputError`）；
  - 损坏的任务 payload（`ContentContractError`）；
  - 摘要不含合成名称中的 `MARKER`；
  - 引用校验在 `models` 组完整、缺失两种情况下的输出。

## 不包含

- 页面上的显示（11 的查看器、07 与 06 的状态文字）。
- 改动 `loadMission` 或逻辑 payload 的契约。

## 关键文件与契约

- 计划新增 `src/app/resources/` 中的任务诊断模块与相邻测试；修改 02 的持有者以纳入载入结果。
- 复用：[load-mission.ts](../../../../../src/core/mission/load-mission.ts)、[logic-payload.ts](../../../../../src/content/logic/logic-payload.ts) 的 `decodeLogicPayload`、[logic-content.ts](../../../../../src/content/logic/logic-content.ts) 的类型、[errors.ts](../../../../../src/core/errors.ts) 的 `CoreInputError`；参照 [logic-check.ts](../../../../../tools/logic-check.ts) 的按 role 取出方式。
- 测试数据：[logic-content.test-support.ts](../../../../../src/content/logic/logic-content.test-support.ts)。

## 验收标准

- [x] AC-10（Node）：成功时的摘要与对同一输入独立计算的期望一致；三种失败分别得到正确的 `kind`、路径与原因。
- [x] 引用校验列出解析到模型的声明数与每个模型的存在情况。
- [x] 摘要与诊断不含合成内容中的 `MARKER` 文字。
- [x] 持有者在 `logic` 组完整时才尝试载入；状态阶梯的“任务可载入 Core”只由 `loadMission` 成功得到。
- [x] `pnpm check` 通过。

## 验证方法

- `pnpm exec vitest run src/app src/core/mission`，完成前 `pnpm check`。
- 浏览器部分见 11。完成前按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：** [mission-diagnostics.ts](../../../../../src/app/resources/mission-diagnostics.ts) 的 `diagnoseMission(groups)`：
  - **取出与解码：** 先取出并解码唯一的任务 Asset，再按任务引用的 Asset ID 取出机型表与僚机名单，都用 `decodeLogicPayload`，然后调用 Core 的 `loadMission`。切片只约束任务角色，所以不按角色取最后一个。
  - **结果：**
    - 没有 `logic` 组时为 `not-attempted`；
    - 成功为 `loaded`，附结构摘要与引用校验；
    - `CoreInputError` 与 `ContentContractError` 分别为 `failed` 的 `core-input` 与 `content`，附路径与原因。解码错误的路径为 `logic[<Asset ID>].<路径>`；缺少被引用的 Asset 时，由 `loadMission` 在对应输入位置报告。
  - **持有者：** [resource-holder.ts](../../../../../src/app/resources/resource-holder.ts) 在每次替换时计算一次；缺陷交给 `reportError`，任务状态保持 `not-attempted`。
  - **状态阶梯：** [resource-status.ts](../../../../../src/app/resources/resource-status.ts) 只按 `loaded` 与 `failed` 增加“任务可载入 Core”“任务不可载入”。
- **测试数据：** [test support](../../../../../src/app/resources/resource-holder.test-support.ts) 的 `logicGroupInput` 用真实的逻辑 payload 组成 `logic` 组，机型表引用合成 `models` 组的模型，所以完整的合成包也能载入任务。`allGroups()` 改用它。
- **测试：** [mission-diagnostics.test.ts](../../../../../src/app/resources/mission-diagnostics.test.ts) 共 13 条。
  - **成功：** 摘要与引用校验等于测试中直接从同一份合成内容计算的期望：声明 6、编组 2、生成区域 2、僚机选项 2、名称池 2；`campaign`、轴向与单位标注、玩家序号 0；各阵营为玩家 1、友方 1、敌方 3、无 1；四个模型都在。
  - **缺少模型：** 没有 `models` 组时标为 `not-held`，模型全部缺失；`models` 组缺一个模型时，只有它为缺失。
  - **失败：**
    - 两个玩家声明：`core-input@input.mission.content.declarations[4].craftType`；
    - 机型表缺少引用的机型 8：`core-input@input.mission.content.declarations[5].craftType`；
    - 损坏的任务 payload：`content@logic[mission/first-campaign].payload`，原因为“must be JSON text”；
    - 缺少机型表：`core-input@input.craftTypes`。
  - **同角色的其他 Asset：** 完整的组另含机型表、僚机名单或两者的副本时，结果与没有副本时相同。证伪：改回按角色取最后一个时，相关两条测试失败。
  - **隐私：** 成功与失败的结果都不含 `MARKER` 与名称池文字。
  - **持有者：**
    - 完整包载入成功，得到“任务可载入 Core”，结果在缓存状态变化后仍是同一对象；
    - 任务失败的完整包得到“任务不可载入”；
    - 缺 `logic` 组的部分结果为 `not-attempted`，没有任务状态（真值表新增一行）。
- **检查：**
  - `pnpm exec vitest run src/app src/core/mission tools/engineering-boundaries.test.ts`：23 个文件，568 条测试通过；
  - `pnpm check`：144 个文件 4,333 条测试，构建通过。
- **Rubber-duck：** 没有阻塞问题。一项非阻塞问题已采纳：组中有同角色的其他 Asset 时，按词序会取错机型表。已改为按任务引用选取，并补测试。
- **Simplify：** 采纳三项：
  - 删去未使用的 `roster` 构造选项；
  - 缓存测试的阶梯断言滤掉任务状态，与任务诊断解耦；
  - `diagnoseMission` 改收中性的组形状，消除与持有者的类型循环。

  未采纳：
  - 与 `tools/logic-check.ts` 共用解码：工具有自己的停止与限值契约，生产代码不能依赖 tools，改工具超出本子任务；
  - 由阵营数推出声明数：spec 摘要明确列出声明数；
  - 收起摘要类型的导出：07、11 的页面要用；
  - 简化独立计算期望的测试：AC-10 要求独立计算；
  - 微小的遍历优化，以及把诊断移入 Worker：前者收益可忽略，后者是 spec 之外的架构改动。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)的当前目录加入 `mission-diagnostics.ts`，“应用资源持有者”一节新增任务载入诊断与阶梯中的任务状态。工程约定与 STATUS 无需改动。
