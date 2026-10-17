---
type: plan
status: active
phase: P3
task: "09"
subtask: "17"
updated: 2026-10-14
---

# 17 — Warp 开始

**契约来源：** [spec](../spec.md) 的 S-08、AC-08，AC-07 的开始部分；[Warp 开始](../spec.md#warp-开始)。
**依赖：** 14, 16, 28。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/core/systems/warp.ts`：`request-warp` 在飞行与地图上下文按 D-01 的结果表判定（玩家状态门禁、从基地打开的地图、间隔等号与两侧、能量、未设/零距离/失效目标按 05 的实际语义），在 [commands.ts](../../../../../src/core/systems/commands.ts) 中路由。
- 接受时按 05/D-01 写入：模式 3、`inWarp`、`warpClock`、玩家目标清除（不发 `target-changed`）、Warp 进度复位、视角 1 与上一视角、左显示屏页 6 与保存的页（发 `left-page-changed`，`commandIndex: null`）、`statusDisplay.redraw`、能量在核实的阶段扣除；拒绝时原子不变、不扣费、不抽随机数。
- `warp-started` 只在实际开始时发出，字段按 D-01；同 tick 重复请求不双扣；原版拒绝反馈若存在按 05 交接。
- Warp 中已实现的离散命令按结果表判定；连续轴与宿主控制不被误禁（与 13 的回归一起）。

## 不包含

- 进度、完成与中断（18）。

## 关键文件与契约

- [player-state.ts](../../../../../src/core/world/player-state.ts)、[displays.ts](../../../../../src/core/systems/displays.ts) 的页面规则、[energy.ts](../../../../../src/core/systems/energy.ts)、[flight-motion.ts](../../../../../src/core/rules/flight-motion.ts) 的 `integrateWarp`。

## 写入范围

- `src/core/systems/warp.ts`、`src/core/systems/warp.test.ts`
- `src/core/systems/commands.ts`、`src/core/systems/commands.test.ts`
- `src/core/systems/displays.ts`、`src/core/systems/displays.test.ts`：页 6 的保存与恢复。
- `src/core/systems/flight-control.test.ts`：Warp 中的轴回归。
- `src/core/rules/warp-path.ts`、`src/core/rules/warp-path.test.ts`：计划新增，MW-02/MW-04/MW-07 的隧道路径（按 28/29 的 R-B）。
- `src/core/systems/view-switch.ts`、`src/core/systems/view-switch.test.ts`：进入/离开视角 1 的部分。（以上为协调者 2026-10-14 扩大范围）
- `src/core/systems/pipeline.ts`、`src/core/systems/pipeline.test.ts`、`src/core/world/world.test.ts`、`src/ui/dev/mission-diagnostics.test.ts`、`src/core/systems/map.test.ts`：`warp-start` 内部请求的接入与“每种命令恰一个结果”的期望（协调者 2026-10-14 扩大范围）。

## 验收标准

- [x] AC-08：结果表的每个分支、原子失败、目标清除、页面保存、时钟与能量写入阶段正确；`warp-started` 只在实际开始时发出且快照完整。
- [x] AC-07 的开始部分：拒绝不扣费、恰够、同 tick 重复请求不双扣、耗尽通知一次性。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 逐命令与流水线测试，期望独立推导。

## 完成证据

2026-10-14，worker（分支 `exec-p3-09-17`，基于目标分支 `45381a71`；认领提交 `1e21577e`）。契约以 P3-02 的 D-01 修订（MW-04、MW-05、MW-09、MW-12（含差异 9）、MW-13）为准，取代本文工作范围中“置 `statusDisplay.redraw`”“在核实的阶段扣费”的旧措辞：开始不写能量、`warpClock` 与重绘。

- **实现：** 新增 `src/core/systems/warp.ts`：`judgeWarpRequest` 按 MW-04 的门禁表依次判定（玩家不可用 → Warp/基地上下文 → 从基地打开的地图 → 无目的地 → 间隔，等号通过 → c > E，恰够通过），返回拒绝原因或检查量；它只读，供 19 的 `warpRequest` 以已提交视角复用。`judgeRequestWarp` 在命令批次中判定，拒绝为 `ignored`；接受时把命令视角推进到 1，并以请求队列的 `defer` 暂存 `warp-start`：它在 P3-06 的 `control`/`match-speed` 与同批先于它判定的玩家发射之后、自动选敌之前投递（MW-04 修订，MW-12 差异 9）。`applyWarpStart` 在请求处理中按 MW-04 的四步写入：出发点、`inWarp`、清目标（不发 `target-changed`）、模式 `warp`、L；视角与 `switchView`（保存页、页 6，不置重绘）；路径设立（20 次世界抽取），位姿为第 1 段 u = 0，放置序号加 1，速度 0、指令速度 +0xB8、`atCommandedSpeed` false，`warp` 整体重置、`serial` 加 1；最后发 `warp-started`，页面变化时再发 `commandIndex` 为 null 的 `left-page-changed`。应用时重算检查量供事件使用，与判定不一致时为 Core 故障。新增 `src/core/rules/warp-path.ts`：L（`0x50068`）、路径设立 `0x51618` 与求值 `0x513e0`/`0x517f4`，运算次序按 28 的 findings A；归一化复用 `load-transforms.ts` 的 `normalise`（同为 `0x56aa8`，求和次序 y、x、z）。L 的 +0xA8 先存为 f32 再相乘（`0x50068` 的 `FILD`/`FSTP float`）。路由在 `commands.ts` 与 `pipeline.ts`（`Request` 联合加 `WarpStartRequest`）。
- **测试（期望由契约与 executable/28 的事实手算）：** `src/core/systems/warp.test.ts`（35 项）：门禁表的 16 个拒绝分支（含次序组合），每项与空命令世界比较 `stateText`，证明原子不变、不抽随机数；6 个接受分支（恰够、间隔等号、`warpClock` 为 0、零距离且 E = 0、从飞行打开的地图、停靠的玩家）；请求处理后的全部写入（20 次抽取后的 RNG 状态、恒定单位位姿 (0, 0, 10000)、按抽取值独立构造的 15 个控制点、L = 7、能量/`depleted`/`warpClock` 不变、重绘不变）；事件内容与次序；页已为 6 时不发页面事件；同 tick 两次请求只开始一次、只抽 20 次；从地图开始（`fromViewMode` 8，其后 `toggle-map`、`map-point`、`speed` 为 `wrong-context`）；同 tick 打开地图、select、开始（1 + 20 次抽取）；`serial` 递增与整体重置；差异 9 的次序：`[speed zero, request-warp]` 不故障且设立的速度 0、指令速度 +0xB8 生效（整个 tick 也不抛出），`[match, request-warp]` 的 `speed-matched` 先于 `warp-started` 且设立覆盖速度，`[fire, request-warp]` 的发射以开始前的位姿构造并先于开始应用，`[request-warp, speed, fire]` 其后两条为 `wrong-context`（把暂存改回立即投递时前三项失败）；检查失效时的故障。`src/core/rules/warp-path.test.ts`（15 项）：点 0、1 与 z 序列、点 1–4 为 +0、先 x 后 y 的 20 次抽取、取模与步长范围、f32 存储；u = 0 的恒定位姿（+0 零）、u = 0/1 端点、直路径中点、由切线求行与有符号零；L 在 0.5 边界（84840 → 7）、比值 1（169680 → 14）、截断与中间值。`flight-control.test.ts`：同 tick 的 `request-warp` 把命令视角推进到 Warp 上下文后，轴照常生效、其后的油门为 `wrong-context`。按 MW-04 更新“每种命令恰一个结果”的期望：`commands.test.ts`、`world.test.ts`、`map.test.ts`（范围已由协调者扩大）、`src/ui/dev/mission-diagnostics.test.ts`。
- **命令：** `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`（89 个文件、2617 项通过）；`pnpm check` 通过（类型检查、ESLint、Vitest 292 个文件 8732 项、生产构建）。
- **AC-07 的开始部分：** 拒绝不扣费、不抽随机数（与空命令世界的 `stateText` 相同）；恰够（c = E）与零距离（c = 0、E = 0）接受；同 tick 第二个请求为 `wrong-context`，只开始一次、只抽 20 次；开始不写能量与 `depleted` 锁存，因此开始不产生耗尽通知（扣费与耗尽由 18 的完成负责）。
- **rubber-duck：** 指出一项：`[speed zero, request-warp]` 在同一 tick 中，油门的 `control` 请求（P3-06 在命令循环之后投递）在 `warp-start` 之后应用，把指令速度改为 0，模式 3 积分的 0 ÷ 0 使合法输入触发 Core 故障。核对原版：`w` 在按键时投递 0x400/0，0x20000 在回调末尾投递，整数路径不检查模式，所以同帧的油门同样在设立之后生效；与 MW-04“按投递次序……不被追溯改写”一致。原版每次键盘轮询只读一个键，所以同帧先油门后 `w` 在原版不可达，Core 的有序批次可达。作为问题交协调者；协调者按预先授权修订 MW-04 并新增 MW-12 差异 9（目标分支 `45381a71`）：`warp-start` 排在同批的玩家控制与发射之后，已按此实现并以上列测试覆盖。其余检查（门禁次序、事件、抽取、求值、页面、禁止的写入）无问题。
- **simplify：** 采纳：归一化改用 `load-transforms.ts` 的 `normalise`（运算相同）；L 从系统模块移到规则模块 `warp-path.ts`；去掉别名，路径设立中 y 的抽取写成独立语句。未采纳：请求携带检查量（MW-04 固定了请求形状）；机型记录查找与测试辅助函数的共享（涉及范围外的文件）；视角推进的共享辅助函数（`map.ts` 不在范围内）。
- **文档影响：** `docs/engineering/modules/core.md`（归 26）需要更新：第 196 行与第 653 行把 Warp 开始清目标和 U-026“执行路径未追踪”写为待办，现已在 `warp.ts` 实现，且开始不写能量；第 645–653 行的 P3-09 交接加入 `warp.ts` 与 `warp-path.ts` 以及 MW-04 的命令视角推进。原版事实没有新增；`0x50068` 先把 +0xA8 存为 f32 是对 executable 中“F(f × FILD(C +0xA8))”的精度补充，可由 29 一并写入。STATUS 无需改动。
