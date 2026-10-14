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

- [x] 轴、Ctrl 路由、AltGr、主炮电平与上下文清零符合契约（AC-03、AC-04 的 Node 部分）。
- [x] 重复的起点、到期、每帧至多一次、不追赶与全部取消条件按精确时钟断言（AC-06 的纯逻辑部分）。
- [x] 拦截优先级矩阵逐项成立（AC-11 的 Node 部分）；本地清理不复活旧状态（AC-13 的本地部分）。
- [x] 模块 DOM-free；`pnpm exec vitest run src/ui/game-input` 通过；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 检查本项改动；`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- Node 测试以合成事件、合成 projection 时钟与测试绑定表驱动。

## 完成证据

- **动作与匹配（[input-action.ts](../../../../../src/ui/game-input/input-action.ts)）：** `InputAction` 为 `steer`（轴 `pitch`/`yaw`/`roll` 与方向 ±1，按 `TickAxes` 的符号）、`primary-fire`、`command`（Core `Command`）、`session`（`toggle-pause`/`open-menu`）与 `gap`（`G-08`/`G-09`/`G-10`）；`Binding` 带 `code`、`shift`/`ctrl`（有效 Ctrl）/`numLock` 的 `true`/`false`/`'any'` 规则、`contexts`、`action`、`repeatable` 与 `source`（`original`/`project`/`gap`）。`createBindingTable` 复制并深冻结条目，载入时拒绝空 code、空/重复/未知上下文、非命令的可重复项、操纵出现在 flight/warp 以外或主炮出现在 flight 以外（spec 输入上下文：map/base 轴恒为 0、无主炮），以及任何冲突；`findBindingConflicts` 报告同一 code、重叠上下文、Shift/Ctrl/NumLock 规则重叠的每对条目（供 19 的矩阵测试）。`resolve` 只按 code、修饰与上下文匹配，不读 `key`/`keyCode`；`bound` 不看上下文，供页面拦截。Alt 不是匹配修饰，Meta 与组合输入在匹配前拒绝。
- **本地状态（[input-state.ts](../../../../../src/ui/game-input/input-state.ts)）：** `InputState` 接收规范化事件与 `InputMoment { eligible, running, runId, context, clock }`（consumer 每次从最新完整 projection 读取），返回 `{ action, intentChanged, preventDefault }`；`frame(moment)` 返回到期重复，`cancelRepeat(code)` 供同步提交失败，`sync`/`clear` 供状态通知与失焦。资格由真变假、离开 running、换运行或换上下文都清空按住表、Ctrl/Alt 跟踪与重复；非 running 时只接受会话控制。已按住的操纵键每次按当前有效修饰重新解析，因此有效 Ctrl 把左右键路由到横滚、否则偏航，另一轴为 0，俯仰不变，Shift 与 Alt 不改变；同轴相反键按位记录，结果与次序无关。主炮只由解析为 `primary-fire` 的新按下建立；`altKey=false` 释放左 Alt，`altKey` 与 `altGraph` 都为假才释放右 Alt。AltGr：观察到的右 Alt、AltGraph 标志，或没有观察到左 Alt 的 Alt 标志期间，只有观察到的 `ControlRight` 算 Ctrl；此期间见到的左或无法识别的 Ctrl 保持屏蔽，直到不再有这样的 Ctrl（`ctrlKey=false` 或其 keyup），因此 Alt 释放后不残留。被屏蔽的 Ctrl 在匹配与拦截中都视为没有 Ctrl（AltGr+Enter 为 `confirm-selection`）。Meta 与组合输入不启动动作；带组合标志的事件取消按住与重复；keyup 始终释放。
- **重复（[key-repeat.ts](../../../../../src/ui/game-input/key-repeat.ts)）：** 首次新按下由 consumer 立即提交，`KeyRepeat` 以按下时的 `clock` 为起点 c，c+32 到期；每次 `due(clock)` 每键至多一次，下次到期为观察值 +16，按开始次序返回，不追赶。`InputState` 只在 running 且合格的帧中询问；松开、决定动作的 Shift/有效 Ctrl/NumLock 改变（重新解析的条目不同即取消，恢复修饰不复活）、上下文、资格、暂停、停止、换运行、`clear` 与 `cancelRepeat` 都取消；Alt 不是匹配修饰，不影响重复身份。
- **拦截（[page-intercept.ts](../../../../../src/ui/game-input/page-intercept.ts)）：** `shouldPreventDefault` 按优先级 1–4 给出唯一决定：无资格（含过期回调）、组合、Meta 组合与 Meta 键、Tab、F12 放行；Alt 键本身与带 Alt/AltGraph 标志的事件拦截（不论 Ctrl 标志）；之后 Escape 放行，有效 Ctrl 组合只在已绑定时拦截，其余已绑定（任一上下文）、刚释放按住键的 keyup 与 F1–F11 拦截；其他放行。`InputState` 先释放再判定。
- **测试：** `pnpm exec vitest run src/ui/game-input`：4 个文件 116 个用例通过（input-action 23、input-state 58、key-repeat 7、page-intercept 28），都用 [game-input.test-support.ts](../../../../../src/ui/game-input/game-input.test-support.ts) 的合成事件、合成 moment 与测试绑定表（形同 spec 草案，注明不是生产数据）。覆盖：四个方向键、相反键两种次序、Ctrl 路由（按住中按下/松开 Ctrl、带 Ctrl 按下）、Shift/Alt 不改变操纵、Warp 有轴无主炮、map/base 不登记操纵与开火、暂停中只有会话控制；上下文切换清零且回到飞行不恢复（帧与按键两种途径）；主炮只由新按下建立、双 Alt、漏掉的 Alt keyup 由标志释放、AltGraph 保持右 Alt、失焦后 repeat/`altKey`/focus 不恢复、Alt 不阻止其他绑定；AltGr 的 CtrlLeft→AltRight 按下与两种抬起次序（已按住操纵键、Enter 为 confirm-selection、不残留 Ctrl）、Alt 释放后被屏蔽的左 Ctrl 直到其释放、AltGraph 标志与未观察到的 Alt、无 AltGraph 标志但观察到右 Alt、明确的 ControlRight 保留 Ctrl、观察到的左 Alt 不屏蔽、无 Ctrl/Alt 标志的 AltGr、孤立 Ctrl 无命令；新按下一个动作、repeat 与重复 keydown 无动作、G 项与会话控制、map 中 Esc 无动作且不拦截、不读 `key`/`keyCode`；Meta/组合不启动但 keyup 释放、组合开始取消意图与重复；重复的精确时钟（c+32、每帧至多一次、+16、迟到帧不追赶；KeyRepeat 另覆盖每帧 1 tick、0 tick 帧、5 tick 帧与一帧跨多个期限）、同帧按首次按下次序、非 running/不合格帧无重复、十种取消条件（松开、提交失败、暂停、停止帧、失资格、换运行、换上下文、clear、Ctrl 与 Shift 改变后恢复）均须新按下、能量减不会变为加、不决定动作的 Shift 与 Alt 不取消、被屏蔽的合成 Ctrl 不取消、NumLock 改变取消；拦截矩阵（Alt+Tab、Alt+F12、Ctrl+F1、Meta+Alt、AltGr 的 Ctrl 标志、keyup 修饰变化、F1–F11 带与不带 Shift/Ctrl/Meta、Escape、map 中的已绑定键、未绑定 Ctrl 组合）。变异检查：去掉屏蔽的保持、重复取消、Alt 标志释放、未观察 Alt 的屏蔽、ControlRight 例外、组合清除、同步意图报告、按位方向或表的上下文校验，各自使用例失败。
- **工程检查：** `pnpm typecheck`、`pnpm exec eslint src/ui/game-input` 通过；`pnpm check`（typecheck、lint、233 个文件 7086 个用例、build）通过，本次无超时。模块不使用 DOM 类型或全局对象，只依赖 core 契约类型与 platform 的 `KeyboardInput`。
- **Rubber-duck：** 无阻塞、非阻塞问题或建议。
- **Simplify：** 采纳：轴改为按位记录、去掉每次更新的 Map/Set；`KeyRepeat` 改为以 code 为键、节奏常量不导出（行为用例已断言 32/16）；冲突检测与按 code 分组改用索引循环与原地追加；无重复的帧返回共享的冻结结果；“map/base 无轴、主炮只在 flight”从状态中的特例移到建表校验，状态只信任表的上下文。未采纳：不导出 `SessionControl`、`InputGapId`、`BindingSource`（19、20 的契约需要）。
- **文档影响：** 需更新、归[子任务 32](./32-comparison-docs.md)：[键位文档](../../../../engineering/keyboard-input.md)写明本地状态、Ctrl 路由、AltGr 规范化及其披露的限制（与右 Alt 重叠的真实左 Ctrl 也被屏蔽，直到松开；macOS 右 Option 同样屏蔽左 Ctrl，只有右 Ctrl 可在此期间横滚；Windows 合成的 ControlLeft 先于 AltRight 到达，在那一刻按 Ctrl 计，可能短暂横滚或取消一个无 Ctrl 变体的重复）、拦截优先级与重复节奏；[ui 模块说明](../../../../engineering/modules/ui.md)与[源码结构指南](../../../../engineering/source-structure.md)加入 `src/ui/game-input/`。本子任务的写入范围不含这些文档，未编辑；没有新的原版事实。
