---
type: plan
status: active
phase: P2
task: "09"
subtask: "11"
updated: 2026-10-05
---

# 11 — Core 纯载入 `loadMission`

**契约来源：** [spec](../spec.md) 的 S-10、S-11（Core 错误）、AC-11、AC-13（Core 纯净）；[Core 载入结果](../spec.md#core-载入结果)。
**依赖：** 04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **载入函数：** 在 `core/mission/` 实现 `loadMission(input)`：
  - 输入为 `{ mission, craftTypes, wingmanRoster }`，每项为 `{ id: AssetId, content: unknown }`；
  - 用 04 的纯数据读取器重新读取每个 `content`；单个 payload 内部的错误（如编组引用的声明不存在）由读取器报告，原样传递；
  - 只检查跨 Asset 的前提：任务引用的 ID 与传入项一致，僚机名单的 `references.craftTypes` 等于传入的机型表 ID；机型表恰覆盖任务与僚机名单引用的机型；任务中恰有一个声明解析为 `player`，且没有僚机选项解析为 `player`。不满足时抛出 `CoreInputError(path, reason)`，路径指向输入位置。
- **`MissionSetup`：** 按 spec 的字段表输出冻结、与输入隔离的纯数据，`mapFrame`、`namePool` 与 `spawnRegions` 从任务复制；声明附加解析出的 `side`、`model` 与 `baseInteraction`，`craftType` 为 null 时三者为 null、null、false。
- **纯净：** 不应用默认值、不推导生成时刻、顺序或位置、不使用 RNG 或宿主时间、不导入 `original-data`、DOM、IndexedDB 或 Runtime；不触及 `core/synthetic/`。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md)中记录 `core/mission/` 的职责；在[工程约定](../../../../engineering/README.md)中补充 Core 的针对性检查命令。

## 不包含

- 运行世界、生成队列、存档与 replay 初始状态（P3）；Runtime、Session 与 UI 接线（P2-11）。

## 关键文件与契约

- **复用：** 04 的读取器、类型与合成逻辑内容 test-support；[errors.ts](../../../../../src/core/errors.ts) 的 `CoreInputError`。
- **计划新增：** `src/core/mission/` 下的载入模块与相邻测试。

## 验收标准

- [x] AC-11 正向：合法合成逻辑数据得到的 `MissionSetup` 中，声明（含放置引用、成员回指与 AI 目标）、阵营、模型、基地交互、玩家、编组（含布局）、名称备用池、生成矩形、僚机选项与地图框架都符合预期。
- [x] AC-11 确定性与隔离：两次载入深度相等；结果冻结；修改输入或先前结果不影响后续载入。
- [x] AC-11 前提失败：没有或有两个玩家、僚机选项解析为玩家、引用的机型缺失、机型表多出机型、任务或僚机名单引用的 Asset ID 不一致，都抛出 `CoreInputError` 且路径准确；单个 payload 内部的错误为内容层错误，原样传递，不改为 `CoreInputError`。
- [x] AC-11 纯净：`pnpm lint` 的 Core 确定性规则与边界回归通过；错误不含 `MARKER`、名称或坐标；`pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm typecheck` 通过。

## 验证方法

- 表驱动 Node 测试，使用 04 的合成逻辑内容。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不适用 browser-testing。

## 完成证据

- **实现：** [load-mission.ts](../../../../../src/core/mission/load-mission.ts) 的 `loadMission(input: LoadMissionInput)`：
  - **读取顺序：** 先在运行时核对输入形状与任务 ID（`mission` 类 Asset ID），再用 04 的读取器读取任务；确认机型表与僚机名单的 ID 是任务引用的 ID 之后，才读取它们，并核对名单引用同一张机型表。
  - **解析：** 声明与僚机选项按机型表附加 `side`、`model` 与 `baseInteraction`。
  - **前提检查顺序：** 引用缺失的机型 → 玩家声明不是恰好一个 → 僚机选项为玩家 → 表中有未引用的机型。多余机型最后检查，因此缺少玩家时不会被误报为多余机型。
  - **输出：** 按 spec 字段顺序冻结 `MissionSetup`，内容全部来自读取器的新副本。

  只导入 `content/` 与 Core 的 `CoreInputError`，没有默认值、RNG、宿主时间或异步。
- **测试：** [load-mission.test.ts](../../../../../src/core/mission/load-mission.test.ts) 19 个测试通过，使用 04 的合成逻辑内容：
  - **正向：** `MissionSetup` 与逐项期望完全相等，覆盖以下内容：
    - 每个声明解析出的阵营、model 与基地交互，`craftType` 为 null 时为 null、null、false；
    - 放置引用、成员回指与 AI 目标原样保留；
    - 玩家序号 0；编组与布局、名称备用池、生成矩形、地图框架；
    - 僚机选项解析为友方并共用玩家 model。

    `Object.keys` 等于 spec 字段顺序。另一组比例与地图框架（坐标轴、中心、半边长都不同）原样出现在结果中。
  - **确定性与隔离：** 两次载入深度相等，结果深度冻结；结果的数组与输入不是同一对象；载入后修改输入的名称、放置与机型表，不影响已有结果与后续载入。
  - **前提失败：** 13 例 `CoreInputError`，路径准确：
    - 输入或某项不是对象；
    - 任务 ID 非法或不是任务类；
    - 机型表或名单 ID 不是任务引用的 ID，名单引用另一张机型表；
    - 声明或僚机选项引用的机型缺失；
    - 没有玩家、两个玩家、僚机选项为玩家；
    - 表中多出机型。
  - **内容错误：** 3 例原样传递，是 `ContentContractError` 实例，带 code、路径与原因：编组模板越界、机型表没有玩家（读取器的检查）、僚机选项引用任务结构。
  - **隐私：** 所有失败的消息与序列化结果都不含 `MARKER`，也不含任务中刻意放入的位置、生成矩形与布局坐标。
- **测试支持：** 把读取器测试中的 `deepFrozen` 提升到 [logic-content.test-support.ts](../../../../../src/content/logic/logic-content.test-support.ts)，供读取器与 Core 测试共用。
- **工程检查：** `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts src/content`、`pnpm typecheck` 与 `pnpm lint`（含 Core 确定性规则）通过；`pnpm check` 通过：115 个测试文件、3413 个测试与生产构建。
- **rubber-duck：** 无阻塞项，4 项建议已采纳：
  - 公开输入改为 `{ id: AssetId, content }`，运行时核对保留；
  - 增加第二组地图框架与比例、字段顺序断言；
  - 内容错误断言为 `ContentContractError` 实例并核对原因；
  - 隐私检查加入坐标。

  审阅确认“没有玩家”虽与“未引用的玩家机型”重叠，但因检查顺序仍可达。
- **simplify：**
  - **已采纳：**
    - 先核对 ID，再读取被引用的 Asset；
    - 已引用机型集合改为在解析之后显式推导，`resolve` 不再有副作用；
    - 只把 `ContentContractError` 转为 `CoreInputError`，其他异常原样抛出。
  - **未采纳：**
    - 与 `core/synthetic` 的记录校验共用：本子任务不触及 `core/synthetic/`；
    - 把 `deepFrozen` 移到更通用的测试支持：本测试核对的是读取器产出的数据，逻辑内容测试支持是合适位置。
- **文档影响：**
  - [源码结构](../../../../engineering/source-structure.md#core-任务载入)新增目录项与“Core 任务载入”一节；
  - [工程约定](../../../../engineering/README.md)补充 `pnpm exec vitest run src/core/mission`；
  - STATUS 无需更新。
