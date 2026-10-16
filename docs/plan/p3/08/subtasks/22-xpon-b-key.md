---
type: plan
status: active
phase: P3
task: "08"
subtask: "22"
updated: 2026-10-15
---

# 22 — Xpon 与 b 键

**契约来源：** [spec](../spec.md) 的 S-02（`b` 的绑定）、S-12、AC-10；[Xpon 与 `b`](../spec.md#xpon-与-b)；06 的研究与 08、09 定稿。
**依赖：** 09, 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/core/systems/xpon.ts`：种类 `0x4000` 的回调 `0x3897c`，接入 [pipeline.ts](../../../../../src/core/systems/pipeline.ts) 的 `updateObject`。
- 若 09 批准纳入 `b`：
  - Core：[tick-input.ts](../../../../../src/core/contracts/tick-input.ts) 加入 08 定稿的命令，[commands.ts](../../../../../src/core/systems/commands.ts) 判定门禁与原因，请求处理以 `0x38780` 的规则创建无声明来源的种类 `0x4000` 对象（[spawn.ts](../../../../../src/core/systems/spawn.ts) 的实例化辅助、[domain-events.ts](../../../../../src/core/contracts/domain-events.ts) 的来源形状），`lastParkedUpdateClock` 取创建时钟；
  - 输入：[bindings.ts](../../../../../src/ui/game-input/bindings.ts) 按 P3-05 修订的绑定表加入 `KeyB`，经现有输入源、清键与菜单捕获；同步[键位文档](../../../../engineering/keyboard-input.md)。
- 若不纳入：完成证据记录 09 的批准与依据，不改命令与绑定。
- 测试：Xpon 回调；`b` 的门禁、次数、初值、事件、容量与生命周期；绑定的修饰键、重复、上下文与清键。浏览器触发归 24。

## 不包含

- 迷雾与 Xpon 的视野（P3-09）；`transponder-created` 音效（P3-14）。

## 关键文件与契约

- 已有：见工作范围中的链接。
- 计划新增：`src/core/systems/xpon.ts` 及其测试。

## 写入范围

- `src/core/systems/xpon.ts`：Xpon 回调（新建）。
- `src/core/systems/xpon.test.ts`：测试（新建）。
- `src/core/systems/pipeline.ts`：回调接入与创建请求。
- `src/core/systems/commands.ts`：`b` 的判定。
- `src/core/systems/commands.test.ts`：测试。
- `src/core/systems/spawn.ts`：动态创建的实例化辅助。
- `src/core/contracts/tick-input.ts`：命令。
- `src/core/contracts/tick-input.test.ts`：测试。
- `src/core/contracts/domain-events.ts`：无声明来源的形状。
- `src/ui/game-input/**`：绑定与输入测试。
- `docs/engineering/keyboard-input.md`：绑定说明。
- `src/core/replay/recording.ts`：`drop-transponder` 加入后 `GAME_REPLAY_VERSION` 2→3（CR-25）。
- `src/core/replay/recording.test.ts`：版本与旧录制拒绝的测试。
- `src/core/rules/flight-state.ts`：`rebuiltMovementBlock` 注释的更正（只改注释）。
- `src/ui/dev/command-draft.ts`：开发命令编辑器的穷举表。
- `src/ui/dev/command-draft.test.ts`：同上的测试。
- `src/ui/dev/mission-diagnostics.test.ts`：命令穷举的测试。
- `tools/replay-check.ts`：录制大小核对的最长命令。
- `tools/replay-check.test.ts`：同上的测试。
- `src/core/world/world.test.ts`：命令穷举的测试。
- `src/core/replay/map-warp-replay.test.ts`：replay 与规则版本断言。
- `e2e/interaction-render.spec.ts`：`b` 不再属于未绑定键。
- `src/core/systems/pipeline.test.ts`：移除已接入的 `create-transponder` 拒绝用例。

## 验收标准

- [x] AC-10 的 Node 部分由测试覆盖；纳入或排除 `b` 都有 09 的批准与依据。
- [x] `pnpm check` 通过。

## 验证方法

- Node 规则与绑定、Runtime 集成测试，期望由 06 的记录独立推导。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据

- **纳入 `b` 的依据：** 09（D-03）按 [X5](../../../../original/formats/executable.md#x5-is-b-normal-play--likely-code-no-runtime-check)（高概率正常玩法）纳入，定稿为 [P3-02 CR-20](../../02/spec.md#cr-20-动态-xpon-与-bd-01)、[CR-30](../../02/spec.md#cr-30-b-的输入侧d-03) 与 [P3-05 绑定表](../../05/spec.md#绑定表)的 `KeyB` 行；代码注释标注“Likely”。
- **实现：** 新建 [xpon.ts](../../../../../src/core/systems/xpon.ts)：`drop-transponder` 的判定（CR-05 共同前置判定，接受时投递 `create-transponder`，无次数/能量/冷却门禁）；构造 `0x38780`（X2：`0x3060c`(100, 0, 0) 一次抽取、来源块比值刷新、逐轴 f32 偏移、0.75 倍速度的油门且表索引越界为故障、活动跟随来源、`lastParkedUpdateClock` 取创建时钟、只在活动创建时发出 `transponder-deployed`）；回调 `0x3897c`（X3：首次回调翻滚两次抽取、先行 3 后行 1，其余状态 0–3 保持，状态 7 在时钟严格大于 F₀ + 0x80 时稳定，状态 5/6 清除）。[pipeline.ts](../../../../../src/core/systems/pipeline.ts) 对种类 `0x4000` 运行该回调后接 `0x20ae4`（不做 Warp 过境检查、无 AI），并接入请求、从 `UNWIRED_REQUESTS` 移除 `create-transponder`；[commands.ts](../../../../../src/core/systems/commands.ts) 路由命令；[tick-input.ts](../../../../../src/core/contracts/tick-input.ts) 加入无字段命令；`GAME_REPLAY_VERSION` 2→3（CR-25）；[bindings.ts](../../../../../src/ui/game-input/bindings.ts) 加入 `KeyB`（无 Shift、无 Ctrl、只在飞行、可重复）。常数 f32 `0x171438` = f32(1/32767)（已确认，代码：私有 Ghidra 探针读取的值），供 X3 的翻滚值使用。
- **Node 测试（期望按 X2–X4、D13 与合成机型记录手算）：** [xpon.test.ts](../../../../../src/core/systems/xpon.test.ts) 23 项——判定（接受、两条命令两个对象、玩家不可用与 Warp/地图/基地的 `wrong-context`、批次内开图后为 `wrong-context`、菜单打开时仍接受）；构造（位姿 (1.1, 2, −12)、油门 75 → 速度 37 而非旧比值的 50、负速度的算术移位、资源与能量期限、一次抽取、来源块比值按来源记录 +0xB8 80 刷新、越界故障、停靠来源得到停放对象且无事件、僚机投放为停放且一次抽取）；回调（翻滚两次抽取与速率、翻滚两次抽取先于扰动五次抽取、保持、门禁下停放/锁定无变化无抽取、F₀ + 0x80 不稳定而 +0x81 稳定、状态 5/6 清除）；流水线（下一 tick 翻滚并开始运动，tick 67 稳定；Warp 过境中的 Xpon 照常请求活动而普通机体等待）。[recording.test.ts](../../../../../src/core/replay/recording.test.ts)：带 `drop-transponder` 的录制以格式 3 重放一致，格式 2 的记录在执行前以 `record.version` 拒绝。[bindings.test.ts](../../../../../src/ui/game-input/bindings.test.ts)：`KeyB` 的唯一绑定、NumLock 无关、Shift/Ctrl 与非飞行上下文无动作、进入 Keyboard Lock 集合、可重复标志。[input-consumer.test.ts](../../../../../src/ui/game-input/input-consumer.test.ts) 3 项经生产绑定、Session 与 Runtime 进入 Core：按下立即提交、按住在 c + 32 重复，两条都 `accepted` 并各发出 `transponder-deployed`、实体为 `creator: player` 并从下一 tick 翻滚；通讯菜单打开时仍投放；Shift/Ctrl/地图上下文无提交；失焦取消并结束重复，暂停与继续后不恢复重复。
- **检查：** `pnpm check` 通过（326 个测试文件、9718 项测试，构建通过）；`e2e/interaction-render.spec.ts` 的 development 与 production 各 1 项通过（`b` 已从“未绑定键”列表移除）。
- **rubber-duck：** 采纳三项非阻塞意见（来源与 Xpon 用不同 +0xB8 以区分记录、翻滚与扰动的抽取次序、经输入链在菜单打开时投放）。“僚机投放在同一遍走查中首次回调”的调用点属停放处理器 `0x62250` 的 `0x62aa0`（子任务 21 的范围）：本项导出 `constructTransponder(context, source, 'wingman')` 并测试其停放构造与一次抽取，同一遍走查的时序与 RNG 由 21 接入调用点时测试。
- **simplify：** 去掉 `TUMBLE_DURATION` 的导出，`SETTLE` 由 `HOLD` 派生，`steer` 改收控制块。未采纳（需改范围外文件）：与其他系统重复的 `craftRecord`/`steeredBlock`/`withWorldRand` 小助手、与 [combat-init.ts](../../../../../src/core/rules/combat-init.ts) `initialiseResources` 重复的能量期限常数。
- **文档影响：** [键位文档](../../../../engineering/keyboard-input.md)加入 `KeyB` 行、可重复命令清单与对照差异及交接；[flight-state.ts](../../../../../src/core/rules/flight-state.ts) 的 `rebuiltMovementBlock` 注释更正为只用于 P3-11 的救援（X2 第 8 步，07 的记录）。Core 模块说明的命令、请求与版本清单交 28。
