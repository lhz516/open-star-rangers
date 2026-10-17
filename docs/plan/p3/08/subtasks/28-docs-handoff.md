---
type: plan
status: active
phase: P3
task: "08"
subtask: "28"
updated: 2026-10-16
---

# 28 — 文档与交接

**契约来源：** [spec](../spec.md) 的 S-14、AC-16。
**依赖：** 13, 22, 23, 27。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [Core 模块说明](../../../../engineering/modules/core.md)：新 API、阶段责任、AI 控制器与世界级状态、请求、事件、上限依据、已知差异（含 Core 抽取次数与原版的差别、17 的指令速度读者复核、27 的对照结论）；更新“分阶段接入”中与 AI 相关的条目；向 P3-09（`object-sets` 中地图可见性的调用点、Warp 状态的读者）、P3-10（命令请求、回复事实、友伤累计的移交、僚机停靠）、P3-11（救援时 AI 状态的重置、僚机损失）、P3-12 至 P3-14 与 P3-15 交接。
- 同步[源码结构指南](../../../../engineering/source-structure.md)（新增文件的落点）、[app](../../../../engineering/modules/app.md) 与 [ui](../../../../engineering/modules/ui.md) 分册（新事件、`b`）、[工具用法](../../../../guides/tools.md)。
- 文档日期与链接正确。

## 不包含

- 实现与对照（已在前序子任务）。

## 关键文件与契约

- 见工作范围；全部为已有文档。

## 写入范围

- `docs/engineering/modules/core.md`：API、差异与交接。
- `docs/engineering/modules/app.md`：事件与会话。
- `docs/engineering/modules/ui.md`：输入。
- `docs/engineering/source-structure.md`：新文件落点。
- `docs/guides/tools.md`：工具用法。
- `docs/original/formats/ai.md`：执行记录中交 28 的代码事实（如 §12 的负延时数据事实）。
- `docs/original/formats/executable.md`：执行记录中交 28 的代码事实（WA5、WA6、X3、D3/D6、16 的代码事实等）。

## 验收标准

- [x] AC-16 的文档项全部完成，交接覆盖 P3-09 至 P3-15。
- [x] 文档的链接与元数据检查通过；`pnpm check` 通过。

## 验证方法

- 文档审阅；链接检查；`pnpm check`。

## 完成证据

- **Core 模块说明**（[core.md](../../../../engineering/modules/core.md)）：正式 Core 的引言加入 P3-08 与 CR-15–CR-30；世界创建与规则数据（`aiPrograms` schema 2 与关键字表、种类 14 的模型恒需、CR-15 的闭包与检查次序、`WorldRuleData.ai`、`instantiableModelIds` 列出种类 14 的模型、建造期不抽取）；契约（18 个命令含 `drop-transponder`，两种新事件的字段、语义、次序与 `isWingmanCommandReply`；`hit` 的 `area` 与 `0x6313c` 在切片中不可达、未实现）；世界与实体状态（`WorldAi`、`transponder`、`ai.program` 与控制器联合、`pendingCommand`、`ruleInputs` 可替换、`lastParkedUpdateClock` ≥ −0x80）；流水线表的第 4、7、12、13 行与 P3-10 的第 2、5、15 行，`TickContext.aiDispatches`，三种新请求与 `steer` 的机体主体，实例化第 13 步的选择与抽取次序；新节“AI 与僚机（P3-08）”（选择、控制器分派与 `HANDLERS` 规则、RNG 交接与逐次抽取的原因、解释器、解析缓存与执行预算、驾驶、目标、开火与基地、攻击航线、僚机、命令消费与 `WINGMAN_REPLIES` 停放码 4 的更正、停放处理器、Warp 离场、Xpon 与 `b`、D13 的重复）；原版规则辅助的 P3-08 规则清单；快照 6、`RULES_VERSION` 7、replay 3；上限表（`commandsPerTick` 的 52 种、`eventsPerTick` 9,064、`requestsPerTick` 32,768 与 7,559 的推导、两项 AI 预算、`canonicalTextLength` 2²⁵）与 ai-limits 的核对；扩展规则；已知差异（17 的指令速度读者复核、分阶段接入的 AI 条目、P3-08 的对照结论（27、25）与已知限制第 1–16 项的指针、CR-24 决定 3/4/11/15/16/17 与 D-02 差异 3、项目规则与运行时故障（含 `ai-firing.lock-gun`）、研究结论、Core 抽取次数与原版的差别）；交接：P3-08 改为已交付并列出更正，向 P3-03、P3-04、P3-05、P3-09（揭示调用点与读者、Warp 状态的读者）、P3-10（命令请求、回复事实、友伤累计、僚机停靠与修理、种类 `0x4000`）、P3-11（救援时的 AI 状态、被毁期间、僚机损失、拆除）、P3-12/P3-13、P3-14 与 P3-15 交接；针对性检查。
- **其他工程文档：** [app.md](../../../../engineering/modules/app.md)（事件总线、AI 与运行生命周期、`logic-4` 与 24 接受的 schema 1 已知限制）；[ui.md](../../../../engineering/modules/ui.md)（`KeyB`、事件日志字段、命令编辑与 `rules` 来源）；[源码结构指南](../../../../engineering/source-structure.md)（新文件落点、`systems/`、`rules/`、`world/` 的职责、e2e 支持）；[工具指南](../../../../guides/tools.md)（26 的 2–8 个备选位置与条件列表、跳过时保持断点；replay-check 的最长事件不变）。
- **原版文档（只有地址、常量、计数与序号）：** ai §11.2（s1 用写回后的 \|+0xE0\|）、§12（可达脚本中 1001 的负定值，已确认·数据，引 CR-24 决定 16）；executable A3（`0x5cc6c` 的框架与原点）、WA3 第 5 步（`0x5e844` 的算式）、WA5（无序距离算到达）、WA6（编队停止的速度读取，引 CR-24 决定 17）、WA7（第 2 阶段返回不投递油门、`0x640d8` 的 lo 与垂线判定、常量核对）、D3（`0x1724a8` = 3.0 与 A2）、D6（±1000）、X3（`0x171438` = F(1/32767)）。与 07、27 已写内容核对，无重复。
- **检查：** 自写的相对链接与锚点脚本（GitHub 标题规则）对 7 个文件 0 处问题；`git diff --check` 通过；`pnpm check:compliance` 通过；`pnpm check` 通过（typecheck、lint、339 个测试文件 10,032 项、build）。
- **rubber-duck：** 一项阻塞——流水线表仍把已合入的 P3-10 阶段写为“空”：已把第 2、5、15 行改为 P3-10 的实际接入并更正同类的“尚待”说法（P3-10 自己的详细说明仍归其文档同步）；两项非阻塞已采纳：`0x63250` 只在周期非零时抽取、模式 2 不写期限；开发事件日志只记 `transponder-deployed` 的摘要字段。未发现原版内容进入跟踪文件。simplify 不适用（只改文档）。

