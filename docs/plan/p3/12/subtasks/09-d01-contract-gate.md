---
type: plan
status: active
phase: P3
task: "12"
subtask: "09"
updated: 2026-10-17
---

# 09 — D-01 共享契约定稿

**契约来源：** [spec](../spec.md) 的 S-01、AC-01；[共享契约修订（D-01）](../spec.md#共享契约修订d-01)、[技术决定](../spec.md#技术决定) 14。
**依赖：** 01, 05, 07。
**执行方式：** 需用户：批准 D-01 定稿的共享契约；用户在 goal 审批时授权 agent 按推荐方案定稿的，由协调者改为自动并记录授权出处。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 以 01、05、07 的结论为依据，定稿 spec D-01 表中各项的封闭类型、字段单位、发生阶段、写入与复位者、冻结与序列化、失败分支、预算与验证矩阵；不需要的字段附可推导性的证据。
- 定稿“帧后批次”的交付形状与 `PresentationTick`、`ExplosionActivation`、`PresentationCamera` 的最终字段，并与 P3-14 spec 的“需要 P3-12 提供的只读接口”（该 spec 在 P3-14 的工作分支上起草中）逐项对齐；差异记录在完成证据中，交 P3-14 的 D-02。
- 推导表现对象、选择缓存、帧内通知与 GPU 资源的预算（按切片最大产生率、寿命窗口与内容上限），写明依据。
- 判定版本影响：新增领域事件或持久观察字段时 `RULES_VERSION` 与快照/replay 格式各相对实际集成基线递增一次。
- 写入 [P3-02 spec](../../02/spec.md) 新增的“P3-12 的契约修订”一节与审批记录、[P3-04 spec](../../04/spec.md) 的修订记录，以及 [Core](../../../../engineering/modules/core.md) 与 [app](../../../../engineering/modules/app.md) 模块说明的契约部分。

## 不包含

- 实现（10、11、12）。
- 修改本任务 spec（契约已批准；D-01 的定稿只写入共享契约所在的文档）。
- 修改 P3-14 的 spec（交接，不越界）。

## 关键文件与契约

- [render-state.ts](../../../../../src/core/projections/render-state.ts)、[domain-events.ts](../../../../../src/core/contracts/domain-events.ts)、[destruction.ts](../../../../../src/core/systems/destruction.ts)、[player-state.ts](../../../../../src/core/world/player-state.ts)、[game-runtime.ts](../../../../../src/app/runtime/game-runtime.ts)、[game-session.ts](../../../../../src/app/session/game-session.ts)、[rules-version.ts](../../../../../src/core/replay/rules-version.ts)。
- P3-09 增量（在其分支）：`render-state.ts` 的 `RenderWarp`、`systems/view-switch.ts`。

## 写入范围

- `docs/plan/p3/02/spec.md`：P3-12 的契约修订一节与审批记录。
- `docs/plan/p3/04/spec.md`：帧后批次的修订记录。
- `docs/engineering/modules/core.md`：D-01 的契约部分。
- `docs/engineering/modules/app.md`：帧后批次的契约部分。

## 验收标准

- [x] AC-01（定稿部分）：D-01 的类型、取样与复位点、失败矩阵、预算与版本影响已写入 P3-02、P3-04 spec 与模块说明，并有适用的批准记录，早于 10、11、12 的实现。
- [x] 与 P3-14 接口的对齐结果与差异已记录。
- [x] 没有开放字段、万能载荷或“其他表现字段”；文档链接与元数据有效。

## 验证方法

- 文档审阅：逐项对照 spec 的 D-01 表与 01、05、07 的结论。
- 核对批准记录的时间早于依赖它的实现提交。

## 完成证据

**批准：** 用户于 2026-10-17 经协调者提问（“是否批准 09 的 D-01 共享契约定稿？”）选择“批准，全部按推荐方案 (Recommended)”，覆盖下文全部定稿与开放选择 A–F 的推荐方案（通用 `view-switched`；`warp-wall-contact` 事件；Core 持有 `modelShown`；`explosion-created` 不带行矩阵；GPU 预算现在按本地计数定值；接受 FS-10 决定 7、8 两项新差异）。批准记录写入 [P3-02 的审批](../../02/spec.md#审批)与 [P3-04 的审批](../../04/spec.md#审批)；协调者以 goal 提交 17a45400 把本行恢复为 in-progress。批准早于 10、11、12 的任何实现提交（它们尚未开始）。

**写入：** [P3-02 的 P3-12 契约修订（FS-01 至 FS-11）](../../02/spec.md#p3-12-的契约修订d-01)与审批记录占位；[P3-04 的帧后逐 tick 输出](../../04/spec.md#帧后逐-tick-输出p3-12-的修订)与审批记录占位；[Core](../../../../engineering/modules/core.md) 与 [app](../../../../engineering/modules/app.md) 模块说明中标为“计划”的契约部分（实现前代码中没有）。

**逐项对照 spec 的 D-01 表：**

| D-01 行 | 定稿 | 依据 |
|---|---|---|
| 当前观察状态 | Render State 的 `subMode`、`followedEntityId`、`activeAreaCentre`；实体的 `inWarp`、`sourceKindBit` 与封闭的 `display`（`pending`/`shown`/`hidden`/`released`）；持久的 `PlayerState.modelShown`（FS-01、FS-02） | 01 的 F1、A4、A6；05 的 H（受击闪烁只用这些帧末值） |
| 视角进入与源模型交接 | `view-switched`：前后模式与子模式、阶段、写入时的玩家位姿；交接并入 `modelShown`（FS-02、FS-03） | 01 的 F2、A7、A8 |
| 爆炸构造事实 | `explosion-created`：爆炸/来源 ID、来源种类、变体、构造阶段、位置与线速度；行没有表现读者，附依据不给出（FS-03、FS-05） | 01 的 F3；X2、X3、X9 |
| 爆炸激活与生命周期 | `explosion-started` 不变；`display` 与离表确认生命周期；来源不进 Render State（FS-05） | 01 的 A6；spec 的激活流 |
| 活动区域 | `activeAreaCentre`；形状调用 Core 的 `isWithinActiveArea`（FS-01） | 01 的 F4 |
| 帧后批次 | `FrameReport.outputs: TickOutput[]`，故障矩阵与内存边界（P3-04 的修订，FS-06） | spec 的帧后批次行；07 的 B3（同步载入） |
| 06 的交接（Warp 撞壁闪光） | `warp-wall-contact`（FS-03、FS-10 决定 5） | 06 的 A7、E、G |

**不需要的字段：** 见 FS-05（被毁相机的进入位置与时刻、首次跟随距离、构造与激活的相机与视口、首次回调、Render State 中的爆炸来源 ID、爆炸构造时的行、视角切换的序号、受击闪烁历史、碎片与导弹的显示、隧道的其他输入、远平面计数、载入时刻），各附依据。

**预算：** FS-07（表现对象 4,096、选择缓存 6,144、帧内通知与受击记录的推导上界；GPU 纹理 2²⁵ 纹素、顶点与索引各 2¹⁸、渲染目标 4 个，依据为 `node tools/nob-check.ts` 对本地 `SR.NOB` 的计数：TEX 59 张至多 256²、ANIM 186 帧 1,611,264 像素、星云 15 张 128²、MESH 13,285 个三角形；`CRAFT.NOB`、`DEBRIS.NOB` 没有图形）与 FS-08（事件每 tick 新增至多 423，合计 9,487，`CORE_LIMITS` 不变）。

**版本：** 新增事件与持久状态：`RULES_VERSION` 7 → 8、快照格式 6 → 7（相对实际集成基线各一次，由 10 递增）；replay 记录形状不变，replay 格式仍为 3（FS-08）。

**与 P3-14 的对齐（交其 D-02，P3-14 的 spec 未修改）：** 依据分支 `p3-14-flight-sound-spec` 的 spec“需要 P3-12 提供的只读接口”与其子任务 05 的完成证据（06/07 输入）。

| P3-14 的需求 | 本定稿 | 差异或待 P3-14 决定 |
|---|---|---|
| 听者：owner/run、tick、相机位置与三行、未插值还是显示相机、何时读取 | `PresentationTick.afterStep`：未插值、tick 结束时、视角切换与 Warp 位姿之后；owner/run 在 `PresentationTick` | 无 |
| 地图、基地、拆除中的听者（其 05 的开放决定 8） | `afterStep` 在 6、8、0x13 中为座机位姿（C1：没有相机函数的视角），不冻结 | 解决其开放决定 8，不需 P3-14 另立规则 |
| 投影的单位、轴向与不可投影 | 不输出投影坐标；`viewport` 为含端点的逻辑像素矩形，行 0 右、行 1 上、行 2 前；退化的被毁相机可给出零行 | P3-14 的 A-04 声像按自己的投影计算，须处理零行 |
| 本帧有序的激活事实与当前效果列表，含额外爆炸与碎片再爆炸 | `PresentationTick.activations` 每次激活一次；`explosions(): PresentationExplosion[]` 无副作用地列出当前爆炸 | 无 |
| 效果键、Core ID、位置、激活时钟、事件关联与次序、`{ list, item }` | 键为模板字面量类型；Core 爆炸的 `origin` 带 `eventIndex`（其 `explosion-started` 在 `TickOutput.events` 中的下标） | 同 tick 中表现层激活排在 Core 激活之后（FS-10 决定 8，已批准差异待批）；P3-14 若需原版的抢占次序须接受这一点 |
| 静止帧、隐藏恢复、迟接消费者与重试不重放 | 静止帧没有 `PresentationTick`；查询无副作用；重试为新实例 | 无 |
| 帧内缓存容量 | 每帧至多 5 个 `PresentationTick`，激活数每 tick ≤ `explosion-started` 数 + 4,096；事件缓存 5 × `eventsPerTick` | 无 |
| Render State 的活动、状态与运动块速度（其 05 的 (a)） | 只新增 `display`：`shown` 或 `hidden` 恰为原版的位姿项条件（活动 ≠ 0 且状态 4 或 ≥ 7），可作为 A-01 的门禁；不公开原始状态与活动 | 运动块速度 +0x08 不在本定稿，须 P3-14 的 D-01（其 06）按 P3-02 扩展规则另加 |
| 事件时刻的来源行与速度（其 05 的 (a)） | 只有爆炸：`explosion-created` 给出构造位置与线速度（不含行） | `shot-fired`、`hit` 的行与速度须 P3-14 的 D-01 另定 |
| “移除”用哪项（其 05 的 (a)） | `display: 'released'` 标出原版处理移除项的 tick，次 tick 离表 | P3-14 选择以 `released` 还是离表为准 |
| 未列事件的处理分类 | 新增 `explosion-created`、`view-switched`、`warp-wall-contact` | P3-14 须为三者分类（原版没有已知的对应音效） |
| 爆炸存活期内的重放（其 05 的开放决定 4） | 激活只通知一次；当前效果列表可供重建 | 由 P3-14 决定 |

**审阅：** rubber-duck 审阅提出五点，均已采纳：(1) 远平面需要判别值 3 碎片的来源种类，`fragment` 表现选择器没有它 → `RenderEntity` 增加 `sourceKindBit`；(2) `view-switched` 缺序号、阶段联合未列出、“都在 `clock` 之后”与 `mission-flow` 矛盾 → 以 (tick, 事件下标) 为身份并在 FS-05 写明依据，`PipelineStageName` 列出 19 个阶段，时钟一句改正；(3) 表现层接口的 `eventIndex` 只在文字中、键为开放字符串、当前效果列表未定义 → FS-07 给出完整的替代类型（模板字面量键、`origin` 中的 `eventIndex`、有界的 `ordinal`、`PresentationExplosion` 查询）；(4) GPU 预算被推迟 → 以本地计数定出数值；(5) 录制的事件预算按平均大小估计 → `explosion-created` 去掉没有读者的行，FS-08 写明该预算是平均估计、最坏字节数的既有性质不在本修订内改变。

**检查：** 改动文件的相对链接与锚点全部有效（会话目录中的检查脚本，按 GitHub 标题锚点规则）；改动的文档 `updated:` 为 2026-10-17（写入批准记录后复查）；`node tools/task-state.ts p3/12` 正常（09 为 active）。`node tools/compliance/cli.ts compliance` 需要依赖与构建产物，本 worktree 未安装依赖，未运行；本项只改文档，跟踪文件中只有地址、计数与尺寸，没有原版内容。没有运行基准环境。

**文档影响：** 共享契约写入 P3-02、P3-04 与两份模块说明（标为计划，实现前代码中没有）；没有新的原版事实（`docs/original/` 与 unknowns 不变，研究结论由 08 写入）；STATUS 与阶段 `tasks.md` 不需修改。
