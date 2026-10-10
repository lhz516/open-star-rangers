---
type: plan
status: active
phase: P3
task: "06"
subtask: "19"
updated: 2026-10-10
---

# 19 — Core 文档与交接

**契约来源：** [spec](../spec.md) 的 S-10；AC-12（文档部分）；[与相邻任务的接口](../spec.md#与相邻任务的接口)。
**依赖：** 14, 15, 16。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **[Core 模块说明](../../../../engineering/modules/core.md)：**
  - 世界创建的 `craftInfo` 输入、语义检查与 setupHash 覆盖；
  - 新的阶段实现（`movement`、`parked-update`、`area-check`）、内部请求与命令判定；
  - 新的规则辅助模块、实体与玩家状态字段、原因码、领域事件、`flight` 分区与上限；
  - 已知差异：分阶段接入（动态最高速度、AI 驾驶、停放对象的 AI 与 Warp 输入）、固定步长与原版可变步长、舍入方向、未实现的不可达分支；
  - 交接：P3-04（创建输入）、P3-05（轴的取值与对应、物理键、灵敏度档位、按住节奏）、P3-07（目标引用、最高速度的实时输入、弹丸与导弹模式、冲量与定时旋转的写入者）、P3-08（浮点操纵路径、停放对象的 AI、编队）、P3-09（`warpClock`、地图门禁、Warp 期间的区域中心）、P3-10（菜单中的数字键优先级）、P3-11（`object-left-world`）、P3-12/P3-13（放置序号、运动 projection、辅助状态与事件）、P3-14。
- **[源码结构指南](../../../../engineering/source-structure.md)：** 新模块的落点。
- **[工程约定](../../../../engineering/README.md)：** 仅在命令或检查规则变化时更新。
- 不声明下游玩法已完成；改动文档的 `updated:`、链接与锚点有效。

## 不包含

- 原版事实（01–05、17 写入 `docs/original/`）；spec 修订（06、08）。
- 键位文档的绑定（P3-05）。

## 关键文件与契约

- [core.md](../../../../engineering/modules/core.md) 的正式 Core、扩展规则、已知差异与交接各节；[source-structure.md](../../../../engineering/source-structure.md)。
- 09–16 的完成证据。

## 写入范围

- `docs/engineering/modules/core.md`：API、阶段、已知差异与交接。
- `docs/engineering/source-structure.md`：新模块落点。
- `docs/engineering/README.md`：仅在命令或检查规则变化时。

## 验收标准

- [x] AC-12（文档部分）：Core 模块说明与源码结构指南已同步新 API、阶段、已知差异与对下游任务的交接；未建的下游任务有明确交接。
- [x] 改动文档的 `updated:`、链接与锚点有效；没有原版内容。

## 验证方法

- 逐项对照 09–16 的交付与 spec 的接口表；文档链接与 front matter 检查。不涉及浏览器。

## 完成证据

- **2026-10-10（worker，认领提交 6f818892；按协调者要求变基到合并 main 之后的 90c9bfb3，在 P3-04 重组后的文档上写入，P3-04 的内容未改）：**
  - **[Core 模块说明](../../../../engineering/modules/core.md)：**
    - 正式 Core 的引言与入口表：P3-06 的增量与 P3-02 spec 的 [P3-06 契约修订](../../02/spec.md#p3-06-的契约修订检查点-a)。
    - 世界创建：`craftInfo` 输入（`readCraftInfoInput`：外层字段、Asset ID 的 kind、`original-import` 只接受 `data/craft-info`、冻结副本）、机型语义检查（`checkCraftInfo`：可实例化种类取自投递请求的队列项，四类拒绝，零值不拒绝）与 setupHash 的 `{ setup, craftInfo }`；创建步骤按代码的实际次序重排。
    - 契约：六个事件变体与四个原因码、tick 内次序；规范文本的类型化写出器；轴的数字摇杆语义指向新节。
    - 实体与世界状态：`WorldState.craftInfo`；分配时的飞行状态校验；新的“飞行状态”条（`MovementBlock`/`SteeredMovementBlock`、`AiState`、`Formation`、`setActivity`、`copyMovement`、分配器缺省）；生命周期（停放切换、`0x1f00000` 移除、Warp 过境门禁、玩家移除时清目标与控制状态）；玩家状态的 `target` 与 `control`。
    - 系统流水线：阶段表第 4、7、8、12、13、17 行；五种请求（`control`、`match-speed` 新增，`leave` 的停放切换）；命令判定的位置；生成阶段与实例化扩展点按检查点 A 的次序。
    - 新节[飞行控制、运动与停放](../../../../engineering/modules/core.md#飞行控制运动与停放)：玩家更新（可用、次序、命令判定次序与读回推算、轴的变化检测与请求合并、速度辅助、请求处理）、运动阶段（筛选、故障点、模式分派）、活动区域与停放（区域检查、停放切换、过境、停放更新与行进、唯一退场、活动对象无边界处理）。
    - 原版规则辅助：数值写回的故障规则、`worldHalfExtent`、`worldDefaultPoint`/`areaPoint`、`firingRecord`/`postsRequests`，以及八个新规则模块的 API。
    - Projection：`flight` 的 `{ motion, combat }`、`MotionPlayer` 字段、`initial-only`、`projection.motion` 故障；Render State 形状不变，停放中的写位置计入放置序号。
    - 快照与 replay：快照版本 2 与新状态、`RULES_VERSION` 2、录制与 `ReplayContent` 的 `craftInfo`、replay 格式版本不变、`startReplay`、比较的 `TickOrder`。
    - 上限：`eventsPerTick` 依据改为定稿核算（事件 3,201、请求 3,138），快照每实体的长度，`budget.test.ts`。
    - 扩展规则：命令、移动块变体、事件次序与请求的落点。
    - 已知差异：固定步长与定时旋转的时刻、输入（数字摇杆、地图与基地归零、G-09/G-10）、项目规则（轴值截断、同 tick 多条速度命令、手动匹配经请求、油门表索引钳制、负的停放 Warp 持续时间、控制状态的建立时刻、通讯菜单中的档位键）、分阶段接入（动态最高速度、AI 驾驶、停放对象的 AI 与 Warp 离场、目标、冲量等写入者、玩家 Warp、停放战斗与基地报告）、随机数缺口、不可达或未实现的分支（含 `0x68050` 的 +0x4C 路线）、舍入方向（飞行中运动写回待原版运行，按技术决定 12 处理）。
    - 交接：P3-03（`data/craft-info` 已接入；+0xA4 的类型由 P3-03 对齐，21 的交接）、P3-04（保留 P3-04 已交付的条目，补 `craftInfo` 创建与 replay 输入、`flight` 两组、新事件与原因码、清键后的中立轴；接入由 24 进行，不描述 24 将改变的 app/ui 行为）、P3-05、P3-06（已交付）、P3-07、P3-08、P3-09、P3-10、P3-11、P3-12/P3-13、P3-14 与 Q-11，逐项对应 spec 的[与相邻任务的接口](../spec.md#与相邻任务的接口)；这些下游 spec 尚未生成，以此为交接记录。
    - 针对性检查：新增的规则与系统测试、`motion-replay.test.ts`、`budget.test.ts` 与 Core 的测试支持（`stillEntityInit`、`addPlayerEntity`、`rand.test-support.ts`、`flight-motion.test-support.ts`）。
  - **[源码结构指南](../../../../engineering/source-structure.md)：** 目录树加入 `world/craft-info-input.ts`、`systems/area.ts`、`flight-control.ts`、`movement.ts` 与 `rules/` 的八个新模块（逐一与 `src/core/` 的生产文件核对）；Core 内部目录表的 `world/`、`systems/`、`rules/`、`projections/` 行与模块说明表的 core 行。只列生产文件，不加 API 细节（测试支持记在 core 分册）。
  - **[工程约定](../../../../engineering/README.md)：** 未改，命令与检查规则没有变化。
  - **对照：** 09–16 完成证据中“文档影响”列出的每一处过时内容均已更新（09：输入、setupHash、`WorldState`、原因码、事件、`FlightReady`、版本、`ReplayContent`、`craft-info-input.ts`；10：飞行状态、玩家目标与控制、新规则模块、`setActivity`、发帖判定的位置；11：阶段表第 8 行、`flight-motion.ts`、`movement.ts`、测试支持；12：原因码、请求、命令判定、扩展规则；13：`match-speed`、辅助与匹配事件的位置、玩家移除时的清除；14：阶段表第 13、17 行、`leave`、过境门禁、新模块与负持续时间的项目规则；15：`flight` 就绪、`startReplay`；16：只有 executable 的计数，归 23）。描述均按集成后的代码核对，原版事实只链接到 executable 的 P3-06 一节。
  - **检查：** 本地链接与锚点检查（`node local/research/p3-02/pipeline/check-links.ts` 对 core.md、source-structure.md 与本文件：324 处链接，0 失败；变基前同为 0 失败）；两份指南与本文件的 `updated:` 为 2026-10-10；`git diff --check` 通过；`node tools/compliance/cli.ts compliance` 与 `node tools/compliance/cli.ts original` 均通过、0 个发现。没有 TypeScript 改动，`pnpm check` 不适用；合并 main 后的树上 `pnpm typecheck` 仍因 P3-04 的调用者失败，归 24（另见 worker 报告中对 24 写入范围的补充）。
  - **rubber-duck：** 一条阻塞意见与三条非阻塞意见全部采纳：`0x68050` 的抽取次数写明 Core 中为 0–2 次、spec 中的 0–3 次计入了 Core 不可达的原版路径路线；故障锁存改为“只有改动前的输入读取与预检的 `CoreInputError` 不锁存”（P3-02 的旧说法不准确，影响 P3-04 对错误的理解）；没有玩家实体时区域检查的结果改为按活动、停放、停靠分别说明；`applyRecomputedMaximum` 无移动块时无作用、`speedMatch` 还要求主体有机型记录。审阅确认目录树与 `src/core/` 的生产文件一致，其余 API、阶段、版本、请求、事件、项目规则、已知差异与交接覆盖完整。
  - **simplify：** 只改文档，不适用。
  - **文档影响：** 本项即文档同步；STATUS 与阶段索引不需要改动。原版事实与 U 项不变（23 负责 executable 的补充）。
