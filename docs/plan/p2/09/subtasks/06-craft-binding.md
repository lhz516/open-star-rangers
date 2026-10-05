---
type: plan
status: active
phase: P2
task: "09"
subtask: "06"
updated: 2026-10-05
---

# 06 — 机型与模型绑定

**契约来源：** [spec](../spec.md) 的 S-05、AC-06、AC-03（机型表部分）；[机型与模型绑定](../spec.md#机型与模型绑定)、[规范逻辑数据](../spec.md#规范逻辑数据)中的 `CraftTypeTable`。
**依赖：** 04, 05。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **唯一的生产绑定：** 在 `original-data/conversion/` 提供一个纯函数，输入为任务声明与僚机名单引用的机型集合，以及 05 解析的 M2ID 列表，输出 04 的 `CraftTypeTable`：
  - 只含实际引用的机型，按 `craftType` 升序；
  - `side` 按[玩家目标模式](../../../../original/formats/executable.md#player-target-modes-and-enemy-classification)推导，`baseInteraction` 按[交互种类判定](../../../../original/formats/executable.md#bounded-slot-1-interaction-kind-evidence)推导；这两组种类分组作为格式知识写在转换器中，并在代码注释中链接权威记录、注明“基地”含义为高概率；
  - 每个机型经 M2ID 解析到非零 MODL 条目，按 spec 的命名规则得到 `model/player-ship`、`model/enemy-ship-N`、`model/base-N` 或 `model/friendly-craft-N`；同一 MODL 只有一个 ID。
- **失败：** 机型在 M2ID 中为 0 或超出表长、同一 MODL 被推导出不同 ID、玩家机型不是恰好一个，都为 `invalid-payload`，位置为结构路径。
- **交接：** 在证据中记录 P2-06 必须使用本绑定（spec S-05），供 P2-06 的 spec 引用。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md)中记录绑定的位置、命名规则的权威来源（本任务 spec）与 P2-06 的使用要求。

## 不包含

- 模型与材质转换（P2-06）；机型参数、CINF 与武器数据（P3）。
- 来源映射（08）；组装配与预算（09）。

## 关键文件与契约

- **复用：** 05 的 M2ID 解析结果与中间声明；04 的 `CraftTypeTable` 类型与读取器；[asset-id.ts](../../../../../src/content/asset-id.ts) 的 `readAssetId`。
- **计划新增：** `src/original-data/conversion/` 下的绑定模块与相邻测试。

## 验收标准

- [ ] AC-06：源码中只有这一份机型到模型的表（源码搜索证据）；命名规则产生合法且唯一的 Asset ID；合成 M2ID 把两个机型指向同一 MODL 时共用 ID、指向不同 MODL 时 ID 不同；绑定与 M2ID 解析不一致时失败。
- [ ] AC-03（机型表部分）：玩家与僚机机型共用同一 model ID；机型表只含引用的机型；结果能被 04 的读取器读取。
- [ ] 负向用例的 code 与位置正确，诊断不含 `MARKER` 或数值；`pnpm exec vitest run src/original-data`、`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- 表驱动 Node 测试；源码搜索 `model/player-ship` 等 ID 与 M2ID 解析的使用点。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不适用 browser-testing。

## 完成证据
