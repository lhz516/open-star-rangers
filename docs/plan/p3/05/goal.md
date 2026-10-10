---
type: plan
status: accepted
phase: P3
task: "05"
updated: 2026-10-10
related: [ADR-0004, ADR-0009, ADR-0018, B-001, B-004, B-005, U-011, U-012, U-029]
---

# P3-05：原版键位与浏览器输入 — Goal

## 目标与来源

实现用户于 2026-10-10 批准的 [spec](./spec.md) 中的 S-01 至 S-15 与 AC-01 至 AC-19：

- 原版键位研究 Q-01 至 Q-06 与事实记录；[检查点 K](./spec.md#执行检查点) 按键盘、地图两项分别定稿；
- 平台：键盘修饰状态（Shift、AltGraph、NumLock）、Pointer Lock、全屏与 Keyboard Lock、平台族；
- 任务所有者向 `input` 阶段提供的输入控制端口；`speed-preset` 命令与 P3-06 档位入口的迁移；
- `ui/game-input/`：动作与本地状态、轴与 Ctrl 路由、AltGr、Alt 开火、帧后有界重复、页面层拦截判定、绑定表、输入消费者、能力申请生命周期、地图输入；`render/` 的自绘光标与 `MapInputGeometry`；
- 任务壳的输入区、焦点转移、未聚焦提示、G-08–G-10 标注、Alt+F4 提示、全屏按钮与开始手势，以及装配；
- 浏览器验证（开发/生产、隔离地图入口、键盘驱动 replay）、本机实机核对；R-23 对照与文档；
- 共享契约同步：P3-01 的 G-08、P3-02/P3-06 的档位命令、P3-04 的焦点与输入控制端口。

本文件不重新定义行为契约。命令的规则效果（`speed-preset` 迁移除外）、Core 同 tick 地图门禁（P3-09）、通讯菜单优先级（P3-10）、原版地图布局与生产几何（P3-13）、完整地图路径的联合复验（P3-15）和跨系统实机矩阵（P5）不在本 goal 中实现。

## 代码现状与前提

- **键盘源：** [keyboard-input.ts](../../../../src/platform/input/keyboard-input.ts) 的 `KeyboardInput` 只有 `code`、`repeat`、Ctrl/Alt/Meta 与 `isComposing`，`classifyKeyboardInput` 遇任一 Ctrl/Alt/Meta 既不激活也不拦截，`HeldKeyboardAxis` 取 −1/0/+1；[keyboard-source.ts](../../../../src/platform/input/keyboard-source.ts) 的资格要求窗口有焦点、页面可见且焦点恰在输入区容器；[browser-keyboard-source.ts](../../../../src/platform/input/browser-keyboard-source.ts) 尚无导入者。平台层没有 Pointer Lock、全屏、Keyboard Lock 或平台族适配。
- **Runtime 与会话：** [game-runtime.ts](../../../../src/app/runtime/game-runtime.ts) 的 `GameIntent { axes, primaryFire }` 经 `setIntent` 保持，按住开火每 tick 一个 `fire primary`、两 tick 间短按保留一个，命令队列上限 256；[game-session.ts](../../../../src/app/session/game-session.ts) 的 `GameSessionRun` 提供 `setIntent`、`submitCommand`、`onFrame`（`GameSessionFrame` 带 `phase` 与同 tick 的 `projection`）、`onCommandsCancelled`、`ownCleanup`，控制 `clear-input` 的原因为 `focus-loss`、`pointer-lock-exit`。
- **任务所有者：** [mission-owner.ts](../../../../src/app/mission/mission-owner.ts) 的消费者按 `input`、`ui`、`media` 阶段登记（`input` 最先释放），`MissionOwnerContext` 有 `previousClosed`，`session` 只是状态视图，没有控制入口；所有者提供 `pause`、`resume`、`openMenu`、`continueFromMenu`。装配在 [use-mission-owner.ts](../../../../src/app/composition/use-mission-owner.ts)（目前只有 `ui` 消费者与开发诊断）、[MissionScreen.tsx](../../../../src/app/MissionScreen.tsx)、[ports.ts](../../../../src/app/ports.ts) 的 `AppPorts`/`MissionPorts`、[browser-ports.ts](../../../../src/app/browser-ports.ts) 与开发测试入口 [app-entry.test-support.tsx](../../../../src/app/app-entry.test-support.tsx)。
- **界面与反馈：** [MissionShell.tsx](../../../../src/ui/mission/MissionShell.tsx) 的 `mission-view` 只有占位文字，焦点在挂载时落到标题；[slice-gaps-copy.ts](../../../../src/ui/mission/slice-gaps-copy.ts) 的 `SliceGapId` 尚无 G-08–G-10；[game-command-feedback.ts](../../../../src/ui/game/game-command-feedback.ts) 的 `submit(command): number | null` 只跟踪经自身提交的 commandId；[command-draft.ts](../../../../src/ui/dev/command-draft.ts) 为每个命令变体给出表单。
- **Core 契约：** [tick-input.ts](../../../../src/core/contracts/tick-input.ts) 的封闭命令联合与轴语义；[projection.ts](../../../../src/core/projections/projection.ts) 的 `player.interactionContext` 与 `clock.clock`（1/64 秒）；[rules-version.ts](../../../../src/core/replay/rules-version.ts)、[recording.ts](../../../../src/core/replay/recording.ts) 的版本常量。当前工作树的 Core 还没有 P3-06 的飞行规则。
- **呈现与几何：** [viewport-layout.ts](../../../../src/render/viewport/viewport-layout.ts) 的 `ViewportFrame` 可复用；[layout-payload.ts](../../../../src/content/graphics/layout-payload.ts) 没有地图仪表矩形；`render/` 没有地图光标。
- **浏览器测试：** [playwright.config.ts](../../../../playwright.config.ts) 按文件名后缀分配 development/production/development-headed 项目；[browser-probes.ts](../../../../e2e/support/browser-probes.ts) 的监听分组已有 `keyboard`，没有 Pointer Lock/全屏分组；[mission-observations.ts](../../../../e2e/support/mission-observations.ts) 提供任务观察与按键辅助；[mission-flow.development.spec.ts](../../../../e2e/mission-flow.development.spec.ts) 与 [browser-replay.spec.ts](../../../../e2e/browser-replay.spec.ts) 是 AC-17 的导出与重放路线。
- **计划新增：** `src/platform/input/pointer-lock.ts`、`browser-pointer-lock.ts`；`src/platform/browser/fullscreen.ts`、`browser-fullscreen.ts`、`platform-family.ts`、`browser-platform-family.ts`；`src/ui/game-input/`（`input-action.ts`、`input-state.ts`、`key-repeat.ts`、`page-intercept.ts`、`bindings.ts`、`input-consumer.ts`、`capabilities.ts`、`map-input.ts`、`map-input-policy.ts` 及测试与 test-support）；`src/render/map/`（光标模型、浏览器绘制与 `MapInputGeometry`）；`src/ui/mission/` 的输入区与提示组件；隔离地图入口 `e2e/entries/map-input.html`；键盘与地图的 e2e 用例。文件名可在实现时调整，职责与边界不变。
- **跨任务前提：**
  - **P3-04：** 已完成（本分支基于 main `d73e5d27`，`node tools/task-state.ts p3/04` 为 done）。
  - **P3-06 集成（06、07 的运行部分、10、11、16 的前提，并经依赖传到 19、24 及其下游）：** 原版无键盘操纵、数字摇杆轴语义、Shift+数字档位（分支上为 `presetThrottle` 经飞行中的 `select-number`）、G-09/G-10 的 P3-01 修订、`RULES_VERSION`/`GAME_REPLAY_VERSION` 的现值，以及基准环境的 BIOS 键盘缓冲注入工具，都只在分支 `p3-06-flight-motion-spec`（起草时为 `42db4ec2`，其 goal 仍在执行，08、17、18、25 未完成）。满足条件：P3-06 合入 main 后，协调者把 main 合并进本分支；在本工作树核对上述契约与工具存在并记录两个版本号，`pnpm check` 与 `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'` 通过，在执行记录中写明合并提交。只合入其他分支不算满足（spec [执行前提](./spec.md#执行前提)）。依赖它的子任务就绪时若前提未满足，记为 blocked，恢复条件即此项。用户若改为指示提前合并 P3-06 分支的某个提交，按同样核对并记录。
  - **P3-07 的定向证据：** T3、W3、D10 与 CR-05（`r`/`y`/`u`、Slash、能量 `s`/`g` 的方向）在分支 `p3-07-weapons-damage-spec`（起草时为 `0c8b4535`）。01 以读取时的提交复核；P3-07 未合入时，04 对其已覆盖的事实只写带分支与提交的交叉引用，不复制正文，合入后由 32 改为正式链接。不以此要求 P3-07 整项先完成。
  - **共享 spec 同步：** 09、10、11 起草对已批准 spec 的修订，须由用户批准（或由用户给出覆盖该修订的明确预先授权），不由本 goal 或检查点 K 代为批准；15、16、19、24 分别在其后实施。
  - **下游交接：** P3-09（Core 同 tick 地图门禁）、P3-10（通讯菜单捕获与优先级）、P3-13（生产地图几何与光标合成）、P3-15（完整地图路径复验）不是本 goal 的前提；相关项在 32 写入交接。
- **环境（起草时核对）：** 本 worktree 没有 `node_modules`，执行前运行 `pnpm install --frozen-lockfile`；`local/` 已以符号链接接入主仓库的 `local/`（含 `local/StarRang/` 与 `local/ghidra/srangers.gpr`）。Ghidra 只在私有副本上以 `-noanalysis -readOnly` 读取。DOSBox-X 同一时间只运行一个，与 P3-06、P3-07 的执行会话共用，由本 goal 的协调者操作，worker 不操作基准环境。浏览器用例使用本机 Chrome；实机核对用 Computer Use，需 macOS 的辅助功能与屏幕录制权限。
- **原版证据：** Q-01 至 Q-06 由 agent 按[原版证据指南](../../../guides/original-evidence.md)自行取得；原始码表、读数、反编译与原版文字只留在 `local/research/p3-05/`，仓库只记录地址、角色、结构与结论。调试器注入 BIOS 码只能证明该码之后的处理，不能代替物理键、修饰键或自动重复的证据。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 01、02、03、04、05、06、07 | 04、05、06、07：事实记录逐项对照证据与置信度；32：文档审阅与 `pnpm check:compliance` |
| S-02 | 18、19 | 19：Node 绑定矩阵（同一有效组合至多一个离散动作）；28：浏览器每动作族抽样 |
| S-03 | 08、18、19 | 18、19：Node 轴、相反键归零、Ctrl 路由；28：浏览器读取的逐 tick 输入 |
| S-04 | 18、19、20 | 18、20：Alt 电平、AltGr 与 Space 的 Node 时序；28：浏览器 tick 输入 |
| S-05 | 18、20 | 20：ControlledHost 驱动真实 Session/Runtime 的重复与反馈；29：浏览器录制 |
| S-06 | 10、16 | 16：Core/编辑器/replay 的 Node 回归与版本门禁；29：浏览器导出与重放 |
| S-07 | 09、15、20、23、25 | 15、20：输入控制端口与 `p`/Esc 的 Node 测试；28：浏览器焦点与会话控制 |
| S-08 | 18、20 | 18：拦截优先级矩阵；28：`defaultPrevented`；30、31：本机实机 |
| S-09 | 11、19、23、24、25 | 19：G 项绑定矩阵；24：文案与 slice-gaps 审阅；28：浏览器标注 |
| S-10 | 18、20、21、22 | 20、21、22：清键时序矩阵；28：浏览器真实失焦、隐藏与录制 |
| S-11 | 05、13、17、22、26 | 22：地图队列与端口的 Node 测试；27：隔离入口的像素与真实 Pointer Lock；26：K 地图定稿值；30：原生 Esc 解锁 |
| S-12 | 14、21、23、25 | 14、21：假宿主失败与部分成功；28：浏览器全屏与锁键状态；30：真实 Chrome 锁键 |
| S-13 | 14、23、25 | 23：注入平台与状态的 Node 测试；28：浏览器先全屏后退出路径 |
| S-14 | 15、20、21、22、25 | 21：受控 Promise 与事件排列；28：资源平衡、StrictMode 与 Fast Refresh |
| S-15 | 06、07、32 | 32：R-23 离散对照与文档审阅；33：覆盖与一致性复核 |
| AC-01 | 01–07 | 04、05、06、07：记录核对；33：`pnpm check:compliance` 与 git 审阅 |
| AC-02 | 05、08、19 | 19：Node 绑定矩阵含 NumLock 两态与 Shift；33：定稿记录、提交先后与覆盖审阅 |
| AC-03 | 08、18、19、20 | 18、20：Node 组合事件与上下文切换；28：浏览器 tick 输入及已集成 P3-06 有效轴的回归 |
| AC-04 | 18、20 | 18、20：Node；28：浏览器开火与操纵、Shift 档位、Ctrl 组合并用 |
| AC-05 | 19、20 | 19、20：Node 绑定、反馈关联与满队列注入；28：浏览器每动作族至少一例 |
| AC-06 | 18、20 | 20：ControlledHost 精确入队时钟与消费 tick；29：浏览器按住 `=` 的录制序列 |
| AC-07 | 10、16 | 16：Node 校验、等价性、select-number 结果与版本拒绝；29：浏览器导出 |
| AC-08 | 11、19、23、24 | 19：Node 绑定矩阵；24：文案与文档一致；28：浏览器标注与 `defaultPrevented` |
| AC-09 | 15、20 | 15、20：真实所有者/会话的 Node 测试；28：浏览器；27、30：锁指针时的 Esc |
| AC-10 | 23、25 | 23：组件测试；28：development/production 浏览器，含 StrictMode 与元素替换 |
| AC-11 | 18、20 | 18：判定矩阵；28：浏览器 `defaultPrevented`、滚动与导航断言 |
| AC-12 | 13、17、22、26 | 22：Node 端口与队列；27：隔离入口的像素读回与实际 `pointerLockElement` |
| AC-13 | 18、20、21、22 | 20、21、22：Node 时序矩阵与多 tick 帧；28：浏览器真实失焦/隐藏与录制 |
| AC-14 | 14、21、23、25 | 14、21：假宿主；28：浏览器状态；30：真实 Chrome 全屏与锁键 |
| AC-15 | 14、23、25 | 23：Node 注入平台；28：浏览器先全屏后退出 |
| AC-16 | 15、21、25 | 21：Node 受控 Promise；28：资源平衡与 Fast Refresh，含请求未结时离页 |
| AC-17 | 25、29 | 29：真实导出 JSON 经 Node `replayRecord` 重放与浏览器重放 |
| AC-18 | 30、31 | 30：Computer Use 本机核对；31：工具无法覆盖的物理项 |
| AC-19 | 32 | 32：对照与文档审阅；33：`pnpm check` |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。并行执行时，本表与执行记录只由协调者修改。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-flight-context-keys-research.md](./subtasks/01-flight-context-keys-research.md) | — | in-progress |
| [02-other-context-keys-research.md](./subtasks/02-other-context-keys-research.md) | — | completed |
| [03-map-mouse-research.md](./subtasks/03-map-mouse-research.md) | — | in-progress |
| [04-keyboard-research-records.md](./subtasks/04-keyboard-research-records.md) | 01, 02 | pending |
| [05-map-records-checkpoint.md](./subtasks/05-map-records-checkpoint.md) | 03 | pending |
| [06-runtime-key-samples.md](./subtasks/06-runtime-key-samples.md) | 04 | pending |
| [07-bios-repeat-research.md](./subtasks/07-bios-repeat-research.md) | — | in-progress |
| [08-keyboard-checkpoint.md](./subtasks/08-keyboard-checkpoint.md) | 04, 06 | pending |
| [09-p3-04-spec-sync.md](./subtasks/09-p3-04-spec-sync.md) | — | completed |
| [10-speed-preset-spec-sync.md](./subtasks/10-speed-preset-spec-sync.md) | — | completed |
| [11-p3-01-g08-sync.md](./subtasks/11-p3-01-g08-sync.md) | 08 | pending |
| [12-platform-keyboard-modifiers.md](./subtasks/12-platform-keyboard-modifiers.md) | — | completed |
| [13-platform-pointer-lock.md](./subtasks/13-platform-pointer-lock.md) | — | in-progress |
| [14-platform-fullscreen-family.md](./subtasks/14-platform-fullscreen-family.md) | — | pending |
| [15-owner-input-control.md](./subtasks/15-owner-input-control.md) | 09 | pending |
| [16-speed-preset-command.md](./subtasks/16-speed-preset-command.md) | 10 | pending |
| [17-map-cursor-render.md](./subtasks/17-map-cursor-render.md) | — | pending |
| [18-input-state-core.md](./subtasks/18-input-state-core.md) | 12 | pending |
| [19-binding-table.md](./subtasks/19-binding-table.md) | 08, 11, 16, 18 | pending |
| [20-input-consumer.md](./subtasks/20-input-consumer.md) | 15, 18 | pending |
| [21-capability-lifecycle.md](./subtasks/21-capability-lifecycle.md) | 13, 14, 20 | pending |
| [22-map-input.md](./subtasks/22-map-input.md) | 17, 21 | pending |
| [23-mission-shell-input-ui.md](./subtasks/23-mission-shell-input-ui.md) | — | pending |
| [24-slice-gap-copy.md](./subtasks/24-slice-gap-copy.md) | 11 | pending |
| [25-composition-wiring.md](./subtasks/25-composition-wiring.md) | 19, 22, 23, 24 | pending |
| [26-map-policy-wiring.md](./subtasks/26-map-policy-wiring.md) | 05, 25 | pending |
| [27-map-input-entry.md](./subtasks/27-map-input-entry.md) | 22 | pending |
| [28-e2e-keyboard-flow.md](./subtasks/28-e2e-keyboard-flow.md) | 25 | pending |
| [29-e2e-keyboard-replay.md](./subtasks/29-e2e-keyboard-replay.md) | 25 | pending |
| [30-real-device-check.md](./subtasks/30-real-device-check.md) | 25, 27 | pending |
| [31-real-device-physical.md](./subtasks/31-real-device-physical.md) | 30 | pending |
| [32-comparison-docs.md](./subtasks/32-comparison-docs.md) | 07, 26, 27, 28, 29, 30 | pending |
| [33-final-alignment.md](./subtasks/33-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

## 执行记录

- **2026-10-10 — 并行执行安排：** 用户以 `/execute-goal`（无参数，默认并行，同时运行的 worker 不超过 3 个）执行本 goal。协调者在 `p3-05-spec` 分支（本 worktree）上执行。本宿主的 `create_session` 不能在协调者指定的文件夹中启动会话，因此沿用 P3-01、P3-03、P3-06、P3-07 的做法：worker 在应用为其会话创建的 worktree 中运行（以认领提交为基），由 worker 把分支改名为 `exec-p3-05-NN` 作为认领标记，`local` 由仓库的会话脚本链接；其余照 execute-goal 的并行规则（协调者认领，逐个以 `Worker-Commit:` 拖车集成并清理）。Ghidra 由各 worker 在 `local/research/p3-05/` 下的私有副本中只读打开；基准环境（DOSBox-X）与 Computer Use 只由协调者操作。
- **2026-10-10 — Subtask 10 blocked:** P3-06 尚未在本工作树集成，10 要修订的 P3-06 spec 与依据的档位规则都不在本分支。
  Evidence: `git merge-base --is-ancestor p3-06-flight-motion-spec HEAD` 与对 `main` 的同一检查均为假；P3-06 分支为 `42db4ec2`，其 goal 的 08 仍为 in-progress，17、18、25 为 pending。
  Affected acceptance: 10 的全部验收；经依赖影响 16（AC-07）及其下游 19、25。
  Resume when: P3-06 合入 `main`，协调者把 `main` 合并进本分支并完成 goal [跨任务前提](#代码现状与前提)中的核对（或用户指示提前合并 P3-06 分支的某个提交并完成同样核对）。
- **2026-10-10 — 临时把并行 worker 上限改为 5：** 用户指示临时把同时运行的 worker 上限改为 5，为可开始的子任务另开会话。协调者据此在 01、02、03 之外认领 07 与 12。
- **2026-10-10 — 提前集成 P3-06（10 解除阻塞）：** 用户指示现在把 P3-06 分支合并进本分支（选择“现在合并 P3-06 分支并核对，之后有新提交再补合”）。合并提交 `a98f89de` 合入 `p3-06-flight-motion-spec` 的 `42db4ec2`；唯一冲突在阶段索引的相邻两行，保留两边的 spec/goal 链接，并把 P3-06 写入的 P3-05 范围中“普通飞行的 `select-number` 绑定 Shift+数字”改为指向 P3-05 已批准的 `speed-preset`。核对：`presetThrottle` 与速度规则、`tools/baseline/inputs.py`（BIOS 键盘缓冲注入）已在本分支；集成基线 `RULES_VERSION` 为 2、`GAME_REPLAY_VERSION` 为 1；`pnpm typecheck`、`pnpm lint`、`pnpm build` 通过；Vitest 全量在机器负载很高时有三个 5 秒超时（engineering-boundaries、import-job、image-payload 各一项，两次运行失败项不同），单独重跑三个文件全部通过；`tools/baseline` unittest 166 项通过。10 的恢复条件已满足，改回 pending。P3-06 之后的新提交须再合并并重做同样核对；P3-05 因此只能在 P3-06 之后或与之一起进入 `main`。

## 审批

用户于 2026-10-10 明确批准本 goal（“approve goal and commit”）。批准范围为本文件的代码现状与前提、验收覆盖，以及子任务 01 至 33 的拆分、依赖、执行方式与写入范围。

这不代表实现完成，也不替代 spec 批准（spec 已于同日单独批准）。批准本 goal 不等于批准 09、10、11 对 P3-04、P3-02/P3-06、P3-01 spec 的修订，这些修订在执行时仍须取得用户的明确批准；P3-06 集成等跨任务前提也没有因此满足。
