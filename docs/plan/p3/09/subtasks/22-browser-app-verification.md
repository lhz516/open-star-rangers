---
type: plan
status: active
phase: P3
task: "09"
subtask: "22"
updated: 2026-10-14
---

# 22 — 实际应用的浏览器验证

**契约来源：** [spec](../spec.md) 的 S-12、AC-12；[验证策略](../spec.md#验证策略)的浏览器验证。
**依赖：** 20, 21。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)，扩展 [mission-flow.development.spec.ts](../../../../../e2e/mission-flow.development.spec.ts) 等实际应用用例，用合成任务包进入正式 Session：
  - 游戏输入区按 `m` 后 Core 与桥接都报告 `map`；`p` 暂停与继续；未锁指针时 Esc 关闭地图；飞行键按上下文过滤；
  - 用开发 `MissionDevPanel` 命令编辑器提交 `map-point select`，等待 accepted 与目的地/标记事实，重新聚焦输入区，按 `w` 开始并等待完成；核对真实的能量、位置、阶段与事件，不改写世界或伪造 projection；
  - Warp 中打开任务菜单与页面隐藏后继续，无补跑、无重复扣费；退出与重开无遗留资源；
  - 生产几何仍为 null 时 not-ready 提示、可退出、无锁、无鼠标命令；生产包不含开发编辑器。
- 不以 P3-05 隔离入口的 `setContext` 证明 Core 地图；不以 Canvas 存在或 HTTP 成功证明规则。取不到的必要项记为 blocked。

## 不包含

- 地图鼠标的生产几何与像素（P3-13）、Warp 外观（P3-12）、全闭环（P3-15）。
- 跨系统实机矩阵（P5）。

## 关键文件与契约

- [mission-flow.development.spec.ts](../../../../../e2e/mission-flow.development.spec.ts)、[e2e/support/](../../../../../e2e/support/)、[browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)。

## 写入范围

- `e2e/mission-flow.development.spec.ts`、`e2e/mission-flow.production.spec.ts`
- `e2e/support/**`：观察与合成包辅助。
- `src/original-data/conversion/production-rule-data.test-support.ts`（只改 `productionCraftInfo()` 的玩家记录，使合成包可完成 Warp）与 `src/ui/dev/mission-diagnostics.test.ts`（随之改变的期望）（协调者 2026-10-14 扩大范围）。

## 验收标准

- [x] AC-12 的每项都在实际应用中通过，断言 DOM 中的命令结果、状态快照/事件与资源平衡。
- [x] 生产几何为 null 时的退化行为与生产包不含开发编辑器都有断言。
- [x] `pnpm test:e2e -- e2e/mission-flow.development.spec.ts e2e/mission-flow.production.spec.ts` 通过（含网络审计）。

## 验证方法

- browser-testing 的合成流程；记录 Chromium 版本与无法观察的项。

## 完成证据

- **合成包（协调者 2026-10-14 扩大范围）：** 21 交来的阻塞属实：`mission-startable` 的玩家机型来自共享支持 `productionCraftInfo()`，+0x54 = −100 使能量为 −100，成本对 [{−1000, 3}, {2000, 0x7fffffff}] 按距离奇偶回绕（奇数约 2.1M），+0xA8 = 140 使过程约 200 s。[production-rule-data.test-support.ts](../../../../../src/original-data/conversion/production-rule-data.test-support.ts) 只改玩家记录：+0x54 100000、一个成本对 {1000, 10}（每 1000 单位 10）、+0xA8 14（同 Core 链支持）。连带只有 [mission-diagnostics.test.ts](../../../../../src/ui/dev/mission-diagnostics.test.ts) 第 4 个结果由 `insufficient-energy` 变为 accepted（保留 `no-destination`）；全量 Vitest 其余不变。
- **观察（[map-warp.ts](../../../../../e2e/support/map-warp.ts)）：** Core 事实取自开发面板：刷新后的玩家视角（`devState` 增加 `viewMode`/`previousViewMode`）、实体行（标记 kind 25、`map-marker`）与事件日志中四个 P3-09 事件的逐字段解析。桥接事实取自任务的 UI store：从任务画面元素的 React fiber 找到组件持有的 `game`，只调用 `getState`/`subscribe`（读取上下文、视角、地图开关、目的地、标记、`warpRequest`、目的地费用读数、能量、位置、Warp 页完成度、最近命令结果），不写 store、世界或 projection。目的地只经 `MissionDevPanel` 命令编辑器自己的控件提交；没有 `setContext`、调试写入或伪造 projection。
- **开发（Chrome 155.0.8059.41，headless，`OSR_E2E_DEV_PORT=5166`）——[mission-flow.development.spec.ts](../../../../../e2e/mission-flow.development.spec.ts) 的 “m, p, unlocked Esc …”：** 输入区按 `m`：命令结果 `toggle-map` accepted，日志 `map-toggled open=true viewMode=8 previousViewMode=12`，面板视角 0x08，桥接上下文 `map`、地图 open、`warpRequest` no-destination，输入状态“Map input is not ready.”，系统指针未隐藏。`p` 暂停（`user`，tick 与桥接 tick 稳定、仍为 map）后 `p` 继续。地图中 `=`、Space、`t`、`1`、Shift+5、`e`、`\`、按住 `]` 与鼠标移动/点击：无新命令、无 pending、无目的地/标记。未锁 Esc：`toggle-map` accepted，回到 flight（视角 12、map closed），不开任务菜单。重新 `m` 后编辑器提交 `map-point select`（230.5/400, 127.5/400）：accepted，`warp-destination-set` 无图标、`marker=created`，目的地 (6750, −16425, 0)；桥接给出同一目的地与标记、`warpRequest` accepted，费用读数 373/100000、percent 1；面板实体为 kind 25 `map-marker`。点击输入区（地图中不选择）后 `w`：`request-warp` accepted（点击未产生命令），`warp-started` serial 1、cost 373 ≤ energy 100000、fromViewMode 8、目的地一致，桥接 `warp`/视角 1，面板 0x01（前一 0x08）；Warp 中 `m`、`w`、`=` 无命令。任务菜单期间桥接整体（tick、Warp 完成度、能量、位置）不变，Continue 后前进。tick 691 完成一次：`warp-completed` serial 1、arrived、error 0.0575、chargeCost 373、energyBefore 99980 → energyAfter 99596 = max(trunc(E − (c + c·s·0.5)), 0)；chargeDistance 与日志的起点→到达点距离一致；桥接在完成那一 tick 发布的状态正是能量 99596 与到达位置 (6750, −16425, 600)、视角 12。导出录制的命令恰为 3 个 `toggle-map`、`map-point select`、`request-warp`，所有轴为 0；Node `runReplayCheck` 通过（finalTick 713、43 事件、24 检查点、比较一致）。退出到主菜单与重开（第二个种子、新 run 无目的地/标记、视角 12、无结果）后资源平衡两次通过（无音频范围）；`pointerlockchange` 0 次。
- **真实 hidden（同文件 “a real hidden page during a Warp …”，有头 Chrome 155、自建 CDP context 两个 target，两者都接入网络审计）：** Warp 中切到另一 target：`hidden`、自动暂停 `hidden`、tick 27 保持 1.5 s；返回 `visible` 仍暂停于 27，桥接整体（tick、完成度、能量、位置）不变。点击 Resume：首帧仅定锚，之后显示的每个 tick 都不超过 ⌊(时刻 − 首帧)/31.25⌋ + 1（实测首帧后 34 ms 显示 tick 28），无补跑。之后恰好一次 `warp-completed`（373 扣费，99981 → 99598，按规则），桥接在完成 tick 发布扣费后的能量与到达位置。
- **生产（`OSR_E2E_PREVIEW_PORT=5167`，CSP 与网络审计下）——[mission-flow.production.spec.ts](../../../../../e2e/mission-flow.production.spec.ts) 的 “the production map without geometry …”：** 合成包预置缓存并恢复后进入飞行；`m` 打开 Core 地图（桥接 map、视角 8、`toggle-map` accepted），提示“Map input is not ready.”，系统指针未隐藏；鼠标移动与两次点击后无命令、无目的地/标记、无锁；`m` 关闭、再开后未锁 Esc 关闭且不开菜单；4 个结果都是 `toggle-map` accepted；`pointerlockchange` 0 次；DOM 无开发面板，source map 含 `src/ui/game-input/map-input.ts` 而无任何 `src/ui/dev/` 模块（包文本扫描另见 production-preview.spec.ts）。
- **检查：** 两个文件 11 个用例全部通过（2.0 min）；`pnpm check` 通过（Vitest 299 个文件 8892 个、lint、typecheck、构建）；全量 `pnpm test:e2e` 226 个通过（首次全量与 rubber-duck 并发运行时，两个资源平衡用例因 trace 文件被并发清理而报 ENOENT，单独重跑的全量不再出现）。
- **rubber-duck：** 两项采纳：完成后核对权威能量/位置（改为在 UI store 订阅中取完成 tick 发布的状态，能量与位置须与日志一致；菜单与 hidden 期间核对整份桥接视图不变）；hidden 后不补跑的上界过宽（改用 native-lifecycle 的首帧定锚逐 tick 上界）。
- **simplify：** 改用 `startKeyboardFlight`；`devState` 增加视角取代单独解析；日志等待返回轮询到的值；视角常量共享到两份用例；比较整份视图；去掉生产用例中与 production-preview 重复的包文本扫描。未采纳：`readBridgeView` 与 `watchStore` 的 fiber 查找合并（页函数须自包含）；原生用例的键/可见性辅助与其他用例共享（它们在其他 spec 文件中，超出写入范围）。
- **文档影响（交 26/协调者）：** `docs/engineering/source-structure.md` 第 486 行称任务画面只经 `data-*` 与开发面板取证，需补 `map-warp.ts` 只读读取 UI store；`docs/engineering/README.md` 的“观察”条（约 186 行）补 `map-warp.ts`，`missionPackage()` 条（约 177 行）注明合成玩家可完成 Warp；`docs/engineering/modules/original-data.md` 第 152 行可注明 `productionCraftInfo()` 的玩家能量与 Warp 字段。

