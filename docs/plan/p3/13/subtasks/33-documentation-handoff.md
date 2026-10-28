---
type: plan
status: active
phase: P3
task: "13"
subtask: "33"
updated: 2026-10-28
---

# 33 — 模块文档与 P3-14/P3-15 交接

**契约来源：** [spec](../spec.md#验收标准) 的 S-14，AC-20/24。
**依赖：** 32。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 对实际API同步render/app/ui/core/content分册、结构、输入/ready、G-03/G-05与导入版本说明；规划路径改为真实落点。
- 交P3-14 D-02定稿（不建共享模型、同tick输入、警告位置切换、可达性冲突信息）及读者/顺序/生命周期证据，交P3-15真实闭环、尚需联合复验及本任务明确限制。
- 对照S/AC与代码/证据，清理过时“待P3-13”标注，不删除仍真实存在的音效/媒体缺省。

## 不包含

不维护另一份执行tracker，不修改STATUS/phase tasks或旧评审，不宣称P3退出。

## 关键文件与契约

- [source-structure](../../../../engineering/source-structure.md)、[slice-gaps](../../../../engineering/slice-gaps.md)。
- 08/09的实际合同、32判定与27–29浏览器证据。

## 写入范围

- `docs/engineering/modules/render.md`：绘制API。
- `docs/engineering/modules/app.md`：Runtime/装配。
- `docs/engineering/modules/ui.md`：基地桥接/反馈。
- `docs/engineering/modules/core.md`：只读事实。
- `docs/engineering/modules/content.md`：payload与版本。
- `docs/engineering/source-structure.md`：目录与所有权。
- `docs/engineering/README.md`：受影响检查/模块边界。
- `docs/engineering/keyboard-input.md`：右键/资格/恢复。
- `docs/engineering/slice-gaps.md`：标注状态。
- `docs/guides/local-import.md`：新导入与真实功能入口。
- `src/content/hud/hud-text-payload.ts`：仅更正 `mapCornerLabel` 注释（放大窗原点 + (4,4)，06/22；协调者增补）。

## 验收标准

- [x] 每个API/命令/字段/路径与实际实现一致，来源事实链接不重复转抄。
- [x] 与P3-14/P3-15交接分清已验证、外部前提与联合范围。
- [x] 链接/日期/元数据正确，没有残留无依据的在制或已完成声明。

## 验证方法

文档对实际导出/入口与证据逐项核对，链接/metadata检查；文档-only不运行无关构建。

## 完成证据

2026-10-28，worker 分支 `exec/p3-13-33`（基线 `4781fde1`）。只改文档与 `hud-text-payload.ts` 的一行注释；未启动 DOSBox-X、未运行 Ghidra、未读原版文件，没有新增原版事实。

**核对方法。** 逐项对照 main 上的实际代码（`src/render/cockpit/**` 各目录的导出、`cockpit-run.ts` 的登记次序、`cockpit-contract.ts` 的钩子与类型、`cockpit-limits.ts`、`cockpit-layer.ts`、`flight-run.ts` 的 `FlightRunCockpit`/`FlightRunMap`/`FlightRunCockpitWiring`、`render/map/` 的 `createZoneGeometryPort` 与 `createMapPresentationPort`、`flight-consumer.ts`、`cockpit-content.ts`、`cockpit-copy.ts`、`use-mission-owner.ts` 的 `messagesConsumer`、`MissionShell.tsx`/`BasePage.tsx`/`MissionDevPanel.tsx` 的测试 ID、`eslint.config.js` 的 `osr/cockpit-imports` 与 GPU 适配条目、`e2e/` 的 cockpit/map-picture/lifecycle 用例与 `expectFlightCanvas`、`package.json` 的 `test:e2e`），以及 10–29、32、35 的完成证据与 spec 的“与 P3-14 的关系”、D-02 定稿、执行期决定及其补充。

**改动。**

- [render](../../../../engineering/modules/render.md)：重写“驾驶舱、HUD 与地图（P3-13）”：目录表（14–24 各目录与入口）、表现基础（输入类型、创建、钩子与 ①–④ 次序、查询、整批校验与锁存、`cockpitRandom`、`COCKPIT_LIMITS`）、光栅与文字（15）、仪表模块与登记次序（16–22，8、6、9、12 在前）、运行装配（24，含 `CockpitDiagnostics` 与开发面板读取）、地图就绪与输入几何（23）、测试支持（14 的 `cockpit.test-support.ts`、各模块的 test-support、`cockpit-run.test-support.ts`、26 的 `cockpit-integration.test-support.ts`）与针对性检查；新增“交接（P3-13）”。P3-12 交接中的在制提示一条标为已由 25 完成，P3-14 一条指向 D-02 定稿，P3-15 一条中“P3-11 尚未接入被毁进入”改为历史表述。引言加入地图就绪凭证端口。
- [app](../../../../engineering/modules/app.md)：`cockpitCopy()` 改述为 `slice-gaps-copy.ts` 之上的薄适配（删去“临时”一条）；画面接线加入 `ui` 阶段的 `messagesConsumer`（每运行 `bridgeMessageLine`）与开发诊断的驾驶舱摘要；引言加入驾驶舱内容与文案。`TickOutput.projection`（13）、`cockpit-content.ts`（24）与 `wireFlightRun(…, cockpit?)` 已在文中，核对一致未改。
- [ui](../../../../engineering/modules/ui.md)：引言的“缺少驾驶舱、HUD”改为已画入同一画布、仍无音效（P3-14）与音乐（G-01）；其余（25 写入的 store `messages`、`bridgeMessageLine`、基地页消息区块、开发面板）核对一致。
- [core](../../../../engineering/modules/core.md)：P3-12、P3-13 交接标为已交付并说明驾驶舱只读消费、`cockpit-front` 仍无规则；`indicatorRates` 已由 CK-03 加入；G-05 复核结论；“分阶段接入”中地图画面标为已交付；尾随警告攻击者遍历注明属 P3-14 D1-03（`3cd624f8`）；P3-14、P3-15 各加“来自 P3-13”，指向 render 的交接（一事一处）。
- [content](../../../../engineering/modules/content.md)：仪表调度 payload 加消费者一条（每个任务所有者第一次运行开始时解码并交叉核对）。
- [source-structure](../../../../engineering/source-structure.md)：目录树加入 `render/cockpit/**`、`render/map/map-presentation-port.ts`、`app/mission/cockpit-content.ts`、`app/composition/cockpit-copy.ts`、`content/hud/instruments-payload.ts`；职责表新增 `render/cockpit/` 行并更正 `render/map/`、`render/flight/`；分册表、浏览器测试分层与 P3 扩展行同步；两处退役记录中“驾驶舱仍归 P3-13”改为已画入。
- [README](../../../../engineering/README.md)：§Lint 新增“驾驶舱纯模块与 GPU 适配”（按 `eslint.config.js` 逐项核对：纯模块的相对引用范围、包与计算式导入、宿主全局与时间/随机/调度、async；GPU 适配可用 Three.js 与 render，不得导入 React/Zustand/idb、original-data、app/ui/platform/workers，不得用页面全局与宿主时间）；生产预览与 P3-12 观察中的 `expectFlightCanvas` 改为一个画布；新增 P3-13 回归一条（27 的 `cockpit.*`、28 的 `map-picture.*`、29 的 `cockpit-lifecycle` 与只读 WebGL 2 调用记录器），聚焦运行写明 `pnpm build && pnpm exec playwright test <文件>` 或不带 `--` 的 `pnpm test:e2e <文件>`，`pnpm test:e2e -- <文件>` 会跑全部；任务画面的 `flight-in-progress`、基地消息测试 ID、飞行画面的驾驶舱接线与开发面板 `dev-cockpit-*` 同步。
- [键盘输入](../../../../engineering/keyboard-input.md)：实现状态中的“F1 等仍待 P3-13”改为已交付的画面与生产地图输入，并说明 `cockpit-front` 仍无 Core 规则；P3-10 一条的正式通讯画面与 P3-13 一条（运行装配已由 24 交付，生产地图浏览器回归为 `e2e/map-picture.*`，生命周期为 29）更新。
- [slice-gaps](../../../../engineering/slice-gaps.md)：核对一条补 27/28 的浏览器用例；G 项、在制标注（只剩 P3-14 音效）与 `MAP_COST_UNAVAILABLE` 说明核对一致，未删除音效与音乐缺省。
- [本地导入指南](../../../../guides/local-import.md)：引言、开始任务的按键说明、目标与限制、飞行画面一步（驾驶舱、Warp、地图、被毁、G-03、G-05 与状态栏的音效在制提示）与开发诊断同步；重新导入（修订 4、切片定义 7、`graphics-6`）已由 11 写明，核对一致。
- [hud-text-payload.ts](../../../../../src/content/hud/hud-text-payload.ts)：`mapCornerLabel` 注释改为放大窗口原点 + (4, 4)（与 `map-picture.ts` 的绘制位置及 32 的 MP-CAP 一致）。

**交接内容（在 render 的“交接（P3-13）”）。** P3-14：不建共享提示模型（DD-01/DD-05），双方只读同 tick projection；警告位置随 FA-01 改读 `communications.warnings`、同一次合并删除旧读取、不留别名；07/32 的两项 9 型警告可达（高概率）与 P3-14 A-07/D1-11 冲突；尾随攻击者遍历属 D1-03（`3cd624f8`），合入后端到端复验 AC-14/AC-21；`recordMaximumSpeed` 与 FA-03 只保留一份；`RULES_VERSION` 10/快照 9 按实际集成基线重新核对。P3-15：已验证项（16–29、31、32）、外部前提（P3-14 合入、用户补采）、经批准的证据缺口（M-1/2/3/4/7/8 与补充中的非 M 项，恢复方式为私有 `comparison-plan/missing-evidence.md` 的补采会话，“须为一致”的外观子句仍未满足）与联合复验范围（真实被毁视角 AC-23、P3-14 合入后的类型 9、跨任务路径、含驾驶舱的闭环 replay，节奏只到运算级）。

**检查。**

- `pnpm install --frozen-lockfile` 后 `pnpm check`（typecheck、lint、Vitest 430 个文件 11,556 项、生产构建；只有既有的 > 500 kB 块体积警告）：退出码 0；日志在 ignored `local/research/p3-13/33-docs/check.log`。
- 会话链接检查脚本（相对路径与锚点）对 10 个改动文档：均 0 处失效；front matter `updated` 均为 2026-10-28（README 与 source-structure 由 2026-10-24 更新）；`git diff --check` 通过。
- `node tools/compliance/cli.ts original`：通过，0 处发现（build、index、untracked、worktree 范围）。
- 剩余“归 P3-13”的表述只表示职责归属（绘制归驾驶舱），不是在制声明；`docs/plan/p3/12/subtasks/15-renderer-lifecycle.md` 中旧的在制提示文字是历史记录，未改。

**Rubber-duck（code-review 代理担任）：** 逐项对照代码核对改动，确认 API、登记次序、钩子次序、lint 范围、E2E 文件与 `--` 的说法、`messagesConsumer`、`cockpitCopy()` 与两份交接正确；提出 3 条，均已采纳：① content 的“每个资源包第一次”改为“每个任务所有者的第一次运行开始时（失败则重试）”（缓存在 `flight-consumer.ts` 的 `connect` 内）；② core“分阶段接入”中地图画面仍写“归 P3-13”，改为已交付；③ render 的 P3-12 交接中“P3-11 尚未接入被毁进入”改为历史表述。复跑链接检查通过。

**文档影响：** 即本子任务的改动；原版事实、unknowns 无变化。写入范围外的建议见 worker 报告（STATUS、spec DC-13/DC-10 的同步与 `cockpit-front` 的归属）。

**私有输出：** `local/research/p3-13/33-docs/`（check.log、diff.patch、render 章节草稿）。
