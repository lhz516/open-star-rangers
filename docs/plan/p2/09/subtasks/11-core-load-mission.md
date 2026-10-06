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

- [ ] AC-11 正向：合法合成逻辑数据得到的 `MissionSetup` 中，声明（含放置引用、成员回指与 AI 目标）、阵营、模型、基地交互、玩家、编组（含布局）、名称备用池、生成矩形、僚机选项与地图框架都符合预期。
- [ ] AC-11 确定性与隔离：两次载入深度相等；结果冻结；修改输入或先前结果不影响后续载入。
- [ ] AC-11 前提失败：没有或有两个玩家、僚机选项解析为玩家、引用的机型缺失、机型表多出机型、任务或僚机名单引用的 Asset ID 不一致，都抛出 `CoreInputError` 且路径准确；单个 payload 内部的错误为内容层错误，原样传递，不改为 `CoreInputError`。
- [ ] AC-11 纯净：`pnpm lint` 的 Core 确定性规则与边界回归通过；错误不含 `MARKER`、名称或坐标；`pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm typecheck` 通过。

## 验证方法

- 表驱动 Node 测试，使用 04 的合成逻辑内容。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不适用 browser-testing。

## 完成证据
