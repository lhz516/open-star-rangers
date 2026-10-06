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

- [x] AC-06：源码中只有这一份机型到模型的表（源码搜索证据）；命名规则产生合法且唯一的 Asset ID；合成 M2ID 把两个机型指向同一 MODL 时共用 ID、指向不同 MODL 时 ID 不同；绑定与 M2ID 解析不一致时失败。
- [x] AC-03（机型表部分）：玩家与僚机机型共用同一 model ID；机型表只含引用的机型；结果能被 04 的读取器读取。
- [x] 负向用例的 code 与位置正确，诊断不含 `MARKER` 或数值；`pnpm exec vitest run src/original-data`、`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- 表驱动 Node 测试；源码搜索 `model/player-ship` 等 ID 与 M2ID 解析的使用点。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不适用 browser-testing。

## 完成证据

- **实现：** [craft-binding.ts](../../../../../src/original-data/conversion/craft-binding.ts) 的 `bindCraftTypes(referenced, modelIds, location)`：
  - **输出：** 经 04 读取器读取的冻结 `CraftTypeTable`，以及每个 MODL 一项、按 Asset ID 升序的 `{ id, modelEntryId }`。后者正是 09 的跨组外部要求，也是 P2-06 命名模型所需的输入。
  - **阵营与基地交互：** 阵营按玩家目标模式掩码推导（类型 0 为玩家，`0x93780` 为敌方，`0x206c87e` 为友方）；`baseInteraction` 按交互种类掩码 `0x68000` 推导。注释链接 executable 记录，并注明“基地”含义为高概率。
  - **命名：** 按玩家、敌方、基地、其余友方的顺序；同类内按机型升序编号；同一 MODL 只得一个 ID；只允许同类机型或友方机型与玩家飞船共用 MODL。
- **测试：** [craft-binding.test.ts](../../../../../src/original-data/conversion/craft-binding.test.ts) 10 个测试通过：
  - 切片形状（机型 0、1、7、8、14、17）得到 `player-ship`（玩家与僚机共用）、`enemy-ship-1/2`、`friendly-craft-1`、`base-1`；
  - 只含引用的机型；结果冻结；
  - 同类机型指向同一 MODL 时共用 ID，指向不同 MODL 时依次编号；基地类多个模型按机型编号；
  - 失败：玩家机型缺失、M2ID 槽位为 0、机型越出表长（`invalid-payload`）；机型不属任何阵营（`unsupported-payload`）；敌方与玩家共用、基地与敌方共用、友方与基地共用（`invalid-payload`）。位置都是 `archive:/MAIN/SR.NOB#10649/ids[N]` 并通过位置语法检查，原因不含数值。
- **源码搜索：** 生产代码中出现 `player-ship`、`enemy-ship`、`friendly-craft` 与这组掩码的文件只有 `craft-binding.ts` 与 `slice-definition.ts`；后者是切片角色名，不是机型表。生产代码中没有第二份机型到模型的表；M2ID 解析结果只经此绑定转为模型 ID。
- **交接：** P2-06 必须用 `bindCraftTypes` 命名其 model Asset（spec S-05），并在自己的验收中核对 MODL 一致；已写入[源码结构](../../../../engineering/source-structure.md#逻辑组转换)。
- **工程检查：** `pnpm typecheck`、`pnpm lint` 通过；`pnpm check` 通过：101 个测试文件、3082 个测试与生产构建。
- **rubber-duck：** 无阻塞、无其他意见。审阅确认掩码、类型 31 的位运算、编号、共用规则、`unsupported-payload` 的分类与返回形状都符合契约。
- **simplify：**
  - **已采纳：** 排序改用 `compareText`；类别顺序与命名合为一个描述数组；去掉测试中多余的重复读取。
  - **未采纳：** 与记录解析共用位判断 helper：这里是阵营分类，不是字段解码。
- **文档影响：** 已在[源码结构](../../../../engineering/source-structure.md#逻辑组转换)新增“逻辑组转换”一节，记录绑定的位置、命名规则来源与 P2-06 的使用要求。工程约定、工具指南与 STATUS 无需更新。
