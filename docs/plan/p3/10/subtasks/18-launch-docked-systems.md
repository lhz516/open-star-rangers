---
type: plan
status: active
phase: P3
task: "10"
subtask: "18"
updated: 2026-10-14
---

# 18 — 离港与停靠中的系统

**契约来源：** [spec](../spec.md) 的 S-08、AC-10、AC-11；[离港](../spec.md#离港)、[停靠](../spec.md#停靠)的“停靠中的其他系统”、[依赖与交付边界](../spec.md#依赖与交付边界)。
**依赖：** 04, 17。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- `launch` 在基地上下文投递子命令 4；子状态 5 中停靠对象失效时 `mission-flow` 自行投递；按 Q-09 的次序执行：活动、视角恢复（低于 0xC 为 0xC，地图打开时的上一视角按 Q-09）、僚机恢复、按保存位姿放置且放置序号加 1、速度与控制状态、子状态回到 0、重绘、离港事件与离港衔接事件（G-02/4）。同 tick 重复请求按 Q-09，事件次数对应真实转移。
- 部分服务时离港不补满也不回滚（按 Q-08/Q-09）。
- 停靠中各系统（运动、能量、碰撞、弹丸、导弹起爆、目标候选、区域检查与停放）按 Q-10 的联合测试；`base-interior` 的视角门禁与地图打开、暂停恢复分别测试。被毁/救援与主流程未实现时只验本任务的入口与清空/恢复契约，用内部 test-support 建立前态，不新增生产注入入口。

## 不包含

- 运行中衔接的 Runtime 保持（21）；地图规则（P3-09）；被毁与救援流程（P3-11）。

## 关键文件与契约

- 16 的 `src/core/systems/docking.ts`、17 的 `src/core/systems/base-interior.ts`；[movement.ts](../../../../../src/core/systems/movement.ts)、[energy.ts](../../../../../src/core/systems/energy.ts)、[collision.ts](../../../../../src/core/systems/collision.ts)、[area.ts](../../../../../src/core/systems/area.ts) 中已有的停靠处理。
- 计划新增：`src/core/systems/docked-systems.test.ts`（联合测试）。

## 写入范围

- `src/core/systems/docking*.ts`、`src/core/rules/docking*.ts`：离港。
- `src/core/systems/base-interior*.ts`：离港对服务的中断。
- `src/core/systems/pipeline*.ts`：自动离港。
- `src/core/systems/docked-systems.test.ts`：计划新增。
- `src/core/systems/commands*.ts`、`src/core/systems/flight-control*.ts`：基地上下文 `launch` 投递 depart 与批内生效视角（CB-07 §3；13 只给出门禁）。
- `src/core/rules/base-service.ts`、`src/core/rules/base-service.test.ts`：与 rules/docking.ts 重复的周期与组字段常量去重（17 交接）。
- `src/core/systems/communications.ts`、`src/core/systems/communications.test.ts`：批内生效视角传入通讯判定（CB-07、CB-17 决定 8）与基地 `launch` 的断言。

## 验收标准

- [x] AC-10：主动与自动离港的次序、重复请求、视角恢复、僚机、放置与放置序号、速度与控制状态按 Q-09；部分服务不补满或回滚；事件次数对应真实转移。
- [x] AC-11：停靠中的各系统按 Q-10；视角门禁与地图、暂停分别测试；下游未实现部分只验入口并写明未接通。
- [x] 本项相邻测试、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `pnpm exec vitest run` 跑本项相邻测试，再跑 `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`；`pnpm typecheck` 与 `pnpm lint` 通过。
- 完成前按 execute-goal 做一次 rubber-duck 审查，并以本项写入范围调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **契约：** 按 D-01 定稿执行（P3-02 CB-02、CB-07 §3、CB-08、CB-10 `depart`、CB-16、CB-17 决定 6–8；executable DK1、DK3–DK5）。与 AC-10 旧措辞的差异按 D-01 ①：保存位姿是停靠基地的，离港放在基地沿其第 1 行 1000 单位处并朝该方向（四分之一转）；移动块不重建；`placementSerial` 是项目字段。
- **离港（AC-10）：** `src/core/systems/docking.ts` 的 `depart` 按 DK3 次序执行：活动恢复；视角 := max(上一视角, 0xC)，不写目标，涉及视角 6 时置重绘；`baseService` := null；僚机表头停靠时恢复为活动，位置不变；`launchPose`（`rules/docking.ts`）先把积存成 f32，再把和存成 f32；`savedPose` 改写；放置序号加 1；`0x3340c`；然后发出 `departed` 与 `transition`（G-02/4）。无玩家实体时不起作用；没有保存位姿时为故障。`commands.ts` 的 `judgeBaseKey` 在基地上下文接受 `launch`，立即投递 `depart`（command）。子状态 5 的对象失效时，`checkDockingWait` 投递 `depart`（automatic）并把子状态设为 0，不释放、不清空。`pipeline.ts` 删除了 `COMMUNICATIONS_REQUESTS` 故障桩，接入 `depart`。
- **批内生效视角（CB-07 §3、决定 8；协调者选方案 B，范围扩至 `communications*.ts`）：** `flight-control.ts` 每批建立 `EffectiveView`，经 `judge` → `judgeCommand` 传给 `judgeBaseKey` 与 `judgeCommunicationsCommand`。被接受的 `launch` 改写该视角，之后的 P3-06、P3-10 命令与近处菜单门禁都按它判定；P3-06 的轴按最终的有效上下文处理（MW-04）。同批第二个 `launch` 为 `wrong-context`（CB-16 的 `transition` ≤ 2）。P3-07 的命令仍读已提交的视角，等合入 MW-04 后统一。
- **测试（期望独立推导）：**
  - `rules/docking.test.ts`：视角下限；位姿行与位置（行列式为 1）；第二次再转四分之一；积先存 f32 的舍入用例（1627.012939453125，若只舍入一次则为 1627.0128173828125）；僚机表头。
  - `systems/docking.test.ts`：正式 step 中的 `l` 离港，事件、活动、僚机、放置、序号与视角；移动块原样保留，并置重绘；恢复停靠前的 0xD，低于 0xC 的提到 0xC；自动离港不清空、不改页；地图打开时自动离港得 0xC，上一视角为 8；同 tick 自动离港加 `l`，两次 `departed`/`transition`，第二次视角 0xC/0xC、位姿 (1300, −1400, 120)，序号加 2；部分服务既不补满也不回滚，离港后不再有服务步；无玩家时无作用；无保存位姿时故障。
  - `communications.test.ts`、`flight-control.test.ts`：基地中 `launch` 被接受；其后的 `navigate`/`launch` 为 `wrong-context`，`c` 打开菜单，P3-06 的油门与 Enter 按飞行判定，轴按最终上下文处理；请求次序为 `depart` → `control` → `match-speed` → 轴。`pipeline.test.ts`：两种 `depart` 在无玩家时不起作用。
- **停靠中的系统（AC-11）：** `systems/docked-systems.test.ts` 在正式停靠链之后做联合测试：
  - **运动：** 停靠的玩家与僚机按各自的块移动，每 tick 1 与 0.5 单位。
  - **能量：** 跳过；离港后恢复。
  - **碰撞：** 重叠的机体不接触；离港后的配对产生 proximity。
  - **弹丸：** 穿过停靠者，同路径上的活动机体被命中。
  - **导弹起爆：** 命中停靠的玩家与僚机，各 350。
  - **停放交战：** 对停靠目标与活动目标的事件相同。
  - **目标候选：** 基地视角不选敌；离港后跳过停靠的敌机，选中活动的敌机。
  - **漂移与区域：** 漂移的玩家带动区域中心，tick 53 区域检查切换基地，tick 54 自动离港，基地已停放；停靠的僚机从不被停放。
  - **暂停与恢复：** 只按 tick 推进；暂停期间读取不改状态，与连续运行的状态文本一致。

  视角门禁与地图打开由 17 的 `base-interior.test.ts` 覆盖（地图保持计时，关闭后每步只补一次）。未接通、只验入口的部分：P3-11 的 `0x32d74`（被毁后保持子状态 5、停靠对象、视角 6 与服务，`launch` 为 `player-unavailable`）、P3-08 的 AI 候选搜索、P3-09 的地图开关（以内部前态设置）。`enterBaseView` test-support 增设保存位姿。
- **去重（17 交接）：** `SERVICE_PERIODS`、`SERVICE_GROUPS` 只在 `rules/docking.ts` 中定义并导出，`rules/base-service.ts` 引用它们。
- **验证：** 相邻测试；`pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`（94 文件 2726 项）；`pnpm typecheck`、`pnpm lint`；`pnpm check` 通过（296 文件 8844 项，build 通过）；`pnpm exec vitest run --testTimeout=60000` 同样全部通过。
- **审查：**
  - **rubber-duck：** 无阻塞问题。它指出联合测试缺少弹丸与停放交战用例，已补上。
  - **simplify：** 改名了遮蔽 `rules/speed-match.ts` 的本地 `squaredDistance`。以下几项未改：共享的 tick 运行 helper 在写入范围之外；`departed` 联合保持类型安全，不用 cast；生效视角的传递是契约要求，视角要到请求处理才提交。
- **文档影响：** 不改 `docs/original/` 与 unknowns，没有新原版事实。Core 模块分册中有关 P3-10 的请求、`not-implemented` 与有效视角的说明已过时，按执行记录由 27 统一更新：基地上下文的 `launch` 已接入；`depart` 已处理；`EffectiveView` 的传递；P3-07 命令待 MW-04。
