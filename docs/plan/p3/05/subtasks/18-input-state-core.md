---
type: plan
status: active
phase: P3
task: "05"
subtask: "18"
updated: 2026-10-10
---

# 18 — 输入动作、本地状态、重复与拦截判定

**契约来源：** [spec](../spec.md) 的[输入上下文](../spec.md#输入上下文)、[操纵](../spec.md#操纵)、[开火](../spec.md#开火)、[离散命令与重复](../spec.md#离散命令与重复)、[修饰键与布局](../spec.md#修饰键与布局)、[页面层拦截](../spec.md#页面层拦截)、[清键与恢复](../spec.md#清键与恢复)（本地部分），[数据模型与契约](../spec.md#数据模型与契约)的“绑定表”“`InputAction`”“本地输入状态”行，技术决定 3、12；S-02 至 S-05、S-08、S-10 的纯逻辑部分；AC-03、AC-04、AC-06、AC-11、AC-13 的 Node 部分。
**依赖：** 12。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

全部为 DOM-free 纯逻辑，位于计划新增的 `src/ui/game-input/`，用注入的测试绑定表验证；最终绑定数据由 19 提供。

- **动作与匹配（`input-action.ts`）：** `InputAction` 判别联合——操纵（轴与方向）、主炮、命令（Core `Command`）、会话控制（`toggle-pause`、`open-menu`）、暂缺标注（`G-08`、`G-09`、`G-10`）。绑定条目类型：`code`、Shift/有效 Ctrl/适用 NumLock 要求、生效上下文、动作、是否可重复、来源（原版/项目/G 项）。纯函数按 `code`、修饰与交互上下文解析动作；不读 `key`/`keyCode`；同一有效组合有竞争离散动作时由检测函数报告（供 19 的矩阵测试）。
- **本地状态（`input-state.ts`）：** 有效新按下的 code 集合；左右 Ctrl/Alt 与 AltGraph 跟踪；三个轴各 −1/0/+1，同轴相反键为 0 且与次序无关；有效 Ctrl 把左右操纵路由到横滚、否则偏航，另一轴为 0，俯仰不受影响；Shift 与 Alt 不改变已建立的操纵；AltGr 期间屏蔽可能合成的 `ControlLeft`（左右 Alt 释放后不残留），明确单独按下的 `ControlRight` 保留真实 Ctrl 语义，无法区分时不触发 Ctrl 动作；主炮电平只由有效 `AltLeft`/`AltRight` 新按下建立，`altKey`/AltGraph 标志、repeat 或 focus 恢复不能建立，`altKey=false` 可解除；Meta 组合与输入法组合不启动动作，组合开始取消连续意图与重复资格；keyup 始终解除该 code。上下文变化、失焦、暂停、停止、换运行时清空全部本地状态并要求新按下；map/base 上下文的轴恒为 0、无主炮。
- **重复（`key-repeat.ts`）：** 首次新按下立即产生、以当时完整 projection 的 `clock.clock` 为起点，起点 +32 到期；只在 running 帧中观察到期，每个有效按住键每帧至多一次，下次到期为观察值 +16；同帧按最初按下次序；无 tick 帧不重复同一到期；不补发错过的次数；决定动作的 Shift/有效 Ctrl/适用 NumLock 改变、资格或上下文变化、松开、暂停、停止、换运行、同步提交失败时取消，modifier 恢复不复活；Alt 变化不改变其他命令的重复身份。
- **拦截判定（`page-intercept.ts`）：** 按 spec 的优先级 1–4 给出唯一的 `preventDefault` 决定，解除本地按住先于判定；覆盖 Tab、F12、Meta、组合输入、过期回调、Alt 与 AltGr 的 Ctrl 标志、未绑定 Ctrl 组合、有效绑定与 G 项的 keydown/repeat/keyup、F1–F11 非 Ctrl/Meta 组合、Escape 不拦截。
- **测试支持（`game-input.test-support.ts`）：** 合成 `KeyboardInput` 构造器与测试绑定表。
- Node 测试：修饰与 AltGr 时序（含 CtrlLeft→AltRight 的按下/抬起顺序与标志差异、已持有操纵键）、双 Alt、上下文切换、组合输入、重复的精确时钟（0/1/5 tick 帧、跨多期限、积压不追赶、各取消条件）、拦截矩阵（含 Alt+Tab、Alt+F12、Ctrl+F1、Meta+Alt、keyup 修饰变化）。

## 不包含

- 最终绑定数据（19）；与会话、反馈、端口的接线（20）；能力申请（21）；地图输入（22）。

## 关键文件与契约

- 依赖 12 扩展后的 [keyboard-input.ts](../../../../../src/platform/input/keyboard-input.ts)；[tick-input.ts](../../../../../src/core/contracts/tick-input.ts) 的 `Command` 与轴语义；[projection.ts](../../../../../src/core/projections/projection.ts) 的 `interactionContext` 与 `clock.clock`。
- 计划新增：`input-action.ts`、`input-state.ts`、`key-repeat.ts`、`page-intercept.ts` 及其测试、`game-input.test-support.ts`。

## 写入范围

- `src/ui/game-input/input-action.ts`、`src/ui/game-input/input-action.test.ts`
- `src/ui/game-input/input-state.ts`、`src/ui/game-input/input-state.test.ts`
- `src/ui/game-input/key-repeat.ts`、`src/ui/game-input/key-repeat.test.ts`
- `src/ui/game-input/page-intercept.ts`、`src/ui/game-input/page-intercept.test.ts`
- `src/ui/game-input/game-input.test-support.ts`

## 验收标准

- [ ] 轴、Ctrl 路由、AltGr、主炮电平与上下文清零符合契约（AC-03、AC-04 的 Node 部分）。
- [ ] 重复的起点、到期、每帧至多一次、不追赶与全部取消条件按精确时钟断言（AC-06 的纯逻辑部分）。
- [ ] 拦截优先级矩阵逐项成立（AC-11 的 Node 部分）；本地清理不复活旧状态（AC-13 的本地部分）。
- [ ] 模块 DOM-free；`pnpm exec vitest run src/ui/game-input` 通过；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 检查本项改动；`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- Node 测试以合成事件、合成 projection 时钟与测试绑定表驱动。

## 完成证据
