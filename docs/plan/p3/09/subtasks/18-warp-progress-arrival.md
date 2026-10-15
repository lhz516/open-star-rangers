---
type: plan
status: active
phase: P3
task: "09"
subtask: "18"
updated: 2026-10-14
---

# 18 — Warp 过程、完成与中断

**契约来源：** [spec](../spec.md) 的 S-09、AC-09，AC-07 的进行与完成部分；[Warp 过程与到达](../spec.md#warp-过程与到达)。
**依赖：** 17, 28。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的 `frame-end` 中、P3-07 显示步之前，按 06 推进进度并重现 `0x50188`/`0x50a28` 的规则位姿写入，与渲染无关。
- `warp-completion` 阶段在下一次检查消费已达终点的进度：恢复视角（8 改为 0xC）与页面、写回模式、速度、计时与能量（按 06），到达点加 ±(组 + 1) × 常数的偏移再按最近对象调整（抽取次序、支持集与调整按 06，世界 RNG），放置序号递增，`warp-completed` 只发一次。
- [area.ts](../../../../../src/core/systems/area.ts)/[active-area.ts](../../../../../src/core/rules/active-area.ts) 在玩家 Warp 期间的中心。
- 派发器子命令 2 在切片可达时一并实现；不可达时记录证据，不建无人调用的入口。
- Q-10 的每个可达中断：状态与一次性事实，取消不伪造完成；交 P3-11 的内部静态调用边界用合成前态验证。暂停只停住 Runtime，继续后接着同一 Warp。
- CR-11 差异 1（最近对象搜索看不到表现层效果）在测试与 Core 模块说明中注明。

## 不包含

- 结算推迟（P3-11）与 Warp 画面（P3-12、P3-13）。

## 关键文件与契约

- [pipeline.ts](../../../../../src/core/systems/pipeline.ts)、[displays.ts](../../../../../src/core/systems/displays.ts)、[area.ts](../../../../../src/core/systems/area.ts)、[active-area.ts](../../../../../src/core/rules/active-area.ts)、[movement.ts](../../../../../src/core/systems/movement.ts)。
- 计划新增：`src/core/rules/warp-arrival.ts`。

## 写入范围

- `src/core/systems/warp.ts`、`src/core/systems/warp.test.ts`
- `src/core/rules/warp-arrival.ts`、`src/core/rules/warp-arrival.test.ts`
- `src/core/systems/pipeline.ts`、`src/core/systems/pipeline.test.ts`
- `src/core/systems/area.ts`、`src/core/systems/area.test.ts`
- `src/core/rules/active-area.ts`、`src/core/rules/active-area.test.ts`
- `src/core/systems/displays.ts`、`src/core/systems/displays.test.ts`：frame-end 中的次序。
- `src/core/rules/warp-path.ts`、`src/core/rules/warp-path.test.ts`：计划新增，MW-02/MW-04/MW-07 的隧道路径（按 28/29 的 R-B）。
- `src/core/systems/view-switch.ts`、`src/core/systems/view-switch.test.ts`：进入/离开视角 1 的部分。（以上为协调者 2026-10-14 扩大范围）
- `src/core/systems/movement.ts`、`src/core/systems/movement.test.ts`、`src/core/world/world.test.ts`、`src/ui/dev/mission-diagnostics.test.ts`：Warp 期间的运动分派与既有整体期望（协调者 2026-10-14 扩大范围）。

## 验收标准

- [x] AC-09：进度与规则位姿在指定阶段推进；frame-end 首次到终点与下一次 completion 检查的 tick 边界明确，无提前或重复完成；复原与放置序号正确。
- [x] 到达随机的支持集、条件概率、次序与最近对象调整独立核对；CR-11 差异 1 已注明。
- [x] Q-10 的每个可达中断有用例；未接入的 P3-11 流程不宣称联合通过；AC-07 的进行与完成部分不双扣。
- [x] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts` 与 `pnpm check` 通过。

## 验证方法

- Node 规则、固定阶段、随机映射（可枚举域枚举）与内部接口集成测试。

## 完成证据

2026-10-14，worker（分支 `exec-p3-09-18`，基于认领提交 `4e0a1175`）。契约以 P3-02 spec 的“P3-09 的契约修订（D-01）”MW-02、MW-05、MW-07 至 MW-10、MW-12、MW-13 为准；原版事实按 executable 的 “Warp progress, completion and interruptions (P3-09/06)” 与 28 的 R-B 结论（`local/research/p3-09/warp-path/findings.md` §A，只读）。

- **实现：** [warp-path.ts](../../../../../src/core/rules/warp-path.ts) 增加 `shiftWarpPath`（`0x5172c`，2 次抽取）、`warpProgress`（`0x509c0`）、`steerInTunnel`（`0x50a28`：横向偏移、角度、30° 锥、横向运动、居中、窗口内误差档、撞墙、钳 1）与 `stepWarp`（`0x50508` 的次序：δ、u、u ≥ 1 时 u := +0 并平移、n + 1、求值、`0x50a28`、G := 路径位姿）。新增 [warp-arrival.ts](../../../../../src/core/rules/warp-arrival.ts)：扇区角（`0x3a6e8`/`0x3a61c`，F(1 ÷ S) 与 F(S × 0.5)）、到达点（拉近与 ±k 都乘误差 s，第 1 次抽取定号）、最近对象吸附（种类 0–25，不看状态/活动/被毁，严格 < 360000，+600）、间隔基数与 `0x3c040`。[warp.ts](../../../../../src/core/systems/warp.ts) 增加帧尾的 `runWarpStep`（视角 1 且玩家实体存在；不改放置序号）与 `warp-completion` 的 `completeWarp`（视角 8 改 0xC、上一视角 1、经 `switchView` 恢复页；有玩家实体时到达、第 2 次抽取取启动旋转、`warpClock`、块回模式 0 与最高速度、`warpCharge` 扣费不调耗尽处理、`inWarp` 清除；`warp-completed` 先于恢复页的 `left-page-changed`）。[pipeline.ts](../../../../../src/core/systems/pipeline.ts) 接入两步（帧尾：地图步、Warp 步、显示步）。[active-area.ts](../../../../../src/core/rules/active-area.ts) 按 MW-10 在玩家实体 `inWarp` 时以目的地为中心（无目的地为故障）。视角 1 而无 `warp` 不可达（只有开始进入视角 1），两步不处理。
- **逐位核对（本地，不入库）：** 把 `0x50a28` 的原生指令在 x87 双精度、最近舍入下做具体仿真（会话目录中的脚本，读取 06 的本地反汇编输出），对 4000 组合成输入（含 635 次锥钳、892 次撞墙、1936 次窗口内）与 `steerInTunnel` 逐位比较：全部相同。`0x2bf08`、`0x3a6e8`、`0x3a61c`、`0x3a380`、`0x3c040`、`0x509c0`、`0x50508` 的常数与运算次序以只读 Ghidra 读取（`-noanalysis -readOnly`，输出在会话目录）。
- **AC-09 与阶段边界：** [warp.test.ts](../../../../../src/core/systems/warp.test.ts) 在真实流水线中验证：帧尾每 tick 推进一次（无段完成不抽取，位姿写入，放置序号不变）；帧尾使 p 达到 1 的 tick 不完成（2 次平移抽取），下一 tick 的 `warp-completion` 完成（2 次到达抽取，此后不再有 Warp 步），之后不再重复；L ≤ 1 时在开始的同一 tick 完成（20 + 2 次抽取，事件次序 `warp-started`、页 6、`warp-completed`、恢复页）；到达的位置、姿态（`STARTUP_ROTATIONS[rand % 64]`）、放置序号 +1、`warpClock`（0x280 下限）、扣费、块与 `inWarp`；视角从地图恢复为 0xC、页 5 恢复为 0、页未变时不发事件；无玩家实体时只恢复视角与页、`arrival` 为 null、不抽取；完成后区域中心为到达位置。
- **到达随机与吸附：** [warp-arrival.test.ts](../../../../../src/core/rules/warp-arrival.test.ts) 枚举 rand 的全部 32768 个值：+k 与 −k 各 16384（条件概率各 1/2）；s = 0 保持目的地且仍抽 1 次；s = 0.5、1 与三个组的 k；扇区边界（含 F(1 ÷ 15000) 使 15000、30000 落在前一扇区）；吸附的严格界（600 不吸附）、并列取先出现者、玩家自身与被毁对象都是候选、z + 600 存 f32；间隔的 0、下限、比例与封顶；`0x3c040` 的状态、被毁与严格半径。系统测试另验证 s = 0.5 时的拉近、±2500 与吸附到更近的（已被毁）对象，以及 `hostileNear`。
- **CR-11 差异 1：** 已在 `warp-arrival.ts` 的模块注释中注明（最近对象搜索只见 Core 实体，表现层效果不是候选，按该差异原批准范围）；Core 模块说明的对应文字交 26（见下）。
- **Q-10 中断：** 可达的中断以合成前态验证 P3-11 的内部静态调用边界（`switchView(0x11, 1)`）：离开视角 1 后不步进、不完成（即使进度已达 1）、不扣费、`warpClock` 与 `warp` 不变、`inWarp` 保持、区域中心保持目的地；合成救援后 `inWarp` 仍保持，下一次开始不检查它，其完成清除它。能量为 0 时 Warp 继续，完成时扣费钳 0，完成本身不发 `energy-depleted`。未宣称与 P3-11 联合通过。暂停只停 Runtime（Core 无暂停入口，不步进即不变），停靠在 P3-10 之前不可达。派发器子命令 2 按 06 无发送者，未建入口。
- **AC-07 不双扣：** 开始只检查不扣费（17 的测试不变），扣费只在完成时一次（`warp-completed` 恰一次）。
- **MW-10：** [area.test.ts](../../../../../src/core/systems/area.test.ts) 验证 `inWarp` 时以目的地为中心（目的地附近保持活动、玩家隧道位置附近转入 area-switch）与无目的地的故障。
- **检查：** `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`（90 个文件、2679 项通过）；`pnpm check` 通过（293 个文件、8794 项，构建成功）。既有期望的更新：流水线已实现阶段列表加入 `warp-completion`；17 的“numbers each start”改为只运行到请求处理（整 tick 现在会在帧尾推进一次）。
- **rubber-duck：** 审阅完整 diff 与契约，未发现问题。
- **simplify：** 共享 `GRID_SCALE`、合并扇区中心计算、去掉 `steerInTunnel` JSDoc 中与行内重复的步骤表与热路径中的临时数组；未采纳：把 `steerInTunnel`/`stepWarp` 拆到新文件（超出写入范围）、跨文件共享 `vec`、惰性构造 `RandStream`（收益可忽略）。
- **文档影响：** `docs/engineering/modules/core.md` 归 26：建议写入 Warp 步与完成的阶段、MW-12 差异 3、CR-11 差异 1 对最近对象搜索的适用、视角 1 无 `warp` 不可达。原版事实交 09/29：`0x186b3c` = F(S × 0.5)（`0x3a380` 乘 f64 0.5，“半个扇区”由高概率改为已确认，代码）；`0x3a61c` 用 F(1 ÷ S) 使恰在正扇区边界上的坐标落入前一扇区；K = F(cos 0x171f14)，sin K 存为 0.5。STATUS 无需改动。

