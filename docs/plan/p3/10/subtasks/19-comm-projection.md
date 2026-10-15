---
type: plan
status: active
phase: P3
task: "10"
subtask: "19"
updated: 2026-10-14
---

# 19 — 通讯分区读模型

**契约来源：** [spec](../spec.md) 的 S-02、S-04、S-07、AC-05；[规则输入与读模型边界](../spec.md#规则输入与读模型边界)的“projection”“身份与快照”。
**依赖：** 13, 14, 17。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 把 `communications` 分区从 `not-implemented` 改为就绪：区分无玩家、菜单关闭、各菜单层级（菜单身份、项的源引用、显示位置与键、可用性）、来电（消息身份与说话者快照）与基地服务视图（Q-08 证明可显示的项、状态、选择、顺序与进度、资源与弹药）。
- 输出深度冻结、脱离世界；重复读取不抽取 RNG、不改变状态；后挂消费者从 projection 恢复当前菜单与来电，不需要事件历史；不泄露完整实体表或隐藏对象位置。

## 不包含

- G-05 页面与 G-03 文字（22）；驾驶舱绘制（P3-13）。

## 关键文件与契约

- [projection.ts](../../../../../src/core/projections/projection.ts)；[combat.ts](../../../../../src/core/projections/combat.ts) 是分区模块的先例。
- 计划新增：`src/core/projections/communications.ts` 及测试。

## 写入范围

- `src/core/projections/communications*.ts`：计划新增。
- `src/core/projections/projection*.ts`：分区接入与断言。

## 验收标准

- [x] AC-05（读模型部分）：各判别正确；菜单、来电与基地视图完整、冻结、读取无副作用；后挂消费者可恢复持续状态；说话者移除后来电仍可解析。
- [x] 本项相邻测试、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `pnpm exec vitest run` 跑本项相邻测试，再跑 `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`；`pnpm typecheck` 与 `pnpm lint` 通过。
- 完成前按 execute-goal 做一次 rubber-duck 审查，并以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：** [communications.ts](../../../../../src/core/projections/communications.ts) 的 `projectCommunications` 按 P3-02 CB-14 与 D-01 方向修订 ⑥ 填充 `communications` 分区，[projection.ts](../../../../../src/core/projections/projection.ts) 接入后该分区恒为 `ready`（类型仍为 `NotImplementedPartition | CommunicationsProjection`，与 `flight.combat` 的先例一致）。无玩家实体时 `player: null`；已毁的玩家照常给出。`menu` 只在页为 2–4 且已建菜单时给出（休眠菜单不公开），项为显示位置（1 起，comm §7.3）、原始键字节与建菜单时的值（类别源项、对象身份/种类/名称/色调、命令源项与命令码、退出），菜单身份为 commMenus 的 Asset ID 与表，没有不可用原因。`incoming` 只在通道为 `playing` 时给出：消息身份、入队时的说话者快照，`frame` 按 CB-09 由世界时钟、`elapsedEighths` 与 `playbackFrame` 算出。`docking` 为子状态、停靠对象与玩家活动是否为停靠。`base` 只在已提交视角为 6 时给出：同一数组的行次序（D-01 ②，既是队列也是显示次序）、各行的选择值与 `serviceState`（组 33/34 折叠）、光标与三个标志；视角 6 而 `baseService` 为 null 是 Core 故障（`communications.base`）。`warnings` 读 `tailCheck` 的两个指示灯。不公开队列、`loading` 中的消息、停靠期限、基地计时与速率。输出深度冻结，复制自世界状态，读取不抽取、不写状态。
- **与验收措辞的差异（按已批准的 D-01 方向修订）：** 工作范围中的“可用性”按 ⑥ 不设（原版菜单没有不可用项）；“基地服务视图……选择、顺序与进度”按 ② 为同一数组的行次序与光标行，进度由行的 `state` 与标志表达，计时不公开（CB-14）；资源与弹药读数沿用 `flight.combat`（CB-14），本分区不重复。
- **项目解释（契约未逐字规定，已记录）：** `IncomingView.shown` 为“页 5 此刻显示该消息”，即视角不是 1（Warp）且页为 5；CB-13 的 `incoming-started.shown` 是开始时的同一判据。通道状态不存 `shown`，在页 5 上用 `c` 打开菜单后为 false，菜单关闭回到页 5 后为 true。
- **测试（期望按 CB-02、CB-03、CB-09、CB-11、CB-14 与 comm §7 手写，不调用 projection 或规则 helper 推导）：** [communications.test.ts](../../../../../src/core/projections/communications.test.ts) 14 项：无玩家/存活/已毁/移除后的判别；静止玩家的完整读数；玩家实体不可解析或不是机体时的故障；正式 step 中逐层的菜单视图（类别、对象、TABL 2003 的近处命令菜单，位置、键、源项、对象快照与通讯对象）及关闭；被来电遮盖的休眠菜单不显示、来电结束恢复页 3 后菜单原样再现；来电的帧（5 + 8 + 5 个 1/8 秒，每 tick 一个单位：tick 3–6 为帧 0、7–14 为帧 1、15–19 为帧 2、tick 20 结束）与说话者移除后的快照；Warp 视角及残留页 5 下 `shown: false`、在页 5 上打开菜单后 `shown: false`；正式 step 的停靠全链（子状态 3 → 来电 → 回复 20 tick 后子状态 4 → 0x200 ÷ 8 + 1 = 65 tick 后停靠），停靠 tick 的基地视图行次序按 BS2 手推为 [7, 1, 9, 0, 2, 3, 4, 5, 6, 8, 10]；手设基地状态下组 33/34 的折叠与 `navigate-selection`/`confirm-selection` 后的行次序与光标；视角 8 无基地、视角 6 无服务的故障；尾随警告两灯；后挂消费者：两个相同驱动的世界，一个每 tick 两次读取 projection（快照哈希、RNG 状态不变，读数相等、每次新对象、深度冻结），另一个不读，12 tick 内每 tick 事件相同、最终状态文本相同，后挂者一次读取即得页 5、休眠的对象列表与已移除说话者的来电（帧 1）；读数脱离世界（之后的规则变化不改变已取得的读数）；不泄露队列、期限、计时、速率、位置与 `loading`。[projection.test.ts](../../../../../src/core/projections/projection.test.ts) 的分区总览改为 `communications` 就绪。
- **检查：** `pnpm exec vitest run src/core/projections/`（4 个文件 56 项）与 `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`（2711 项）通过；`pnpm typecheck`、`pnpm lint` 通过；`pnpm check` 第一次全部通过（含构建），第二次在高负载下 3 个文件的 5 项因 5 秒超时失败（`budget.test.ts`、`package-check.test.ts`、`combat-chains.test.ts`，均与本项无关），随后 `pnpm exec vitest run --testTimeout=60000` 296 个文件 8826 项全部通过。
- **rubber-duck：** 无阻断问题。采纳：`shown` 显式排除 Warp 视角（不依赖进入 Warp 必改页的不变量）并补测试；补“玩家实体不是机体”的故障用例。其余决定（位置 1 起、视角 6 无服务为故障、深拷贝冻结、通讯对象原样给出）经复核成立。
- **simplify：** 采纳：改用 `rules/docking.ts` 导出的 `BASE_VIEW_MODE`；基地视图的视角判定与故障并入 `baseView`；标志以 `detached` 复制；测试改为直接赋值、合并机体守卫；`projection.ts` 头注释重排。未采纳：按 tick 缓存或惰性分区（超出本项且与 `flight.combat` 先例不同）；把 Warp 视角常量与“页 5 显示”谓词提升到规则模块、共享深拷贝 helper（需改写入范围外的 `systems/radio.ts`、`replay/snapshot.ts`），留作记录。
- **文档影响：** [Core 模块说明](../../../../engineering/modules/core.md)第 441 行仍称 `communications` 分区为 `not-implemented` 并列出已撤销的 `OptionUnavailableReason`/`CommunicationsReady`，需更新，不在本项写入范围，与 11、14、16 相同交 27（文档交接）。原版事实与契约无新增，`docs/original/` 与 U 项不变。
