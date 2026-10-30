---
type: plan
status: active
phase: "P3"
task: "15"
subtask: "09"
updated: "2026-10-30"
---

# 09 — 缺省与近似标注审计

**契约来源：** [spec](../spec.md) 的 S-08、[行为与边界](../spec.md#行为与边界)“对照与标注审计”、[技术决定](../spec.md#技术决定)末条（F1 `cockpit-front`）；AC-09。清单来自 [P3-01 的缺省清单](../../01/spec.md#缺省清单)与[标注规则](../../01/spec.md#标注规则)。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 逐项审计 G-01 起的每个缺省项及所有临时资源、近似规则：在当前构建的 UI（合成任务包，development 与 production）中找到用户可见的标注位置，并核对 [slice-gaps](../../../../../docs/engineering/slice-gaps.md)、[slice-gaps-copy.ts](../../../../../src/ui/mission/slice-gaps-copy.ts)、P3-01 清单与相关任务证据中的说明与链接。
- 检索代码与文档中未登记的占位或近似（如临时资源标记、近似规则注释），确认每项均已披露；报告 F1 `cockpit-front` 的既有标注/责任缺口而不定义其 Core 效果。
- 结果写入本文档的完成证据：每项一行（G 项/资源、UI 位置、标注、文档链接、结论）。缺失或不一致作为差异交回责任任务。

## 不包含

- 新增或重新定义缺省；修改 UI 文案或文档（由责任任务修复）。

## 关键文件与契约

- [P3-01 spec](../../../../../docs/plan/p3/01/spec.md)、[slice-gaps](../../../../../docs/engineering/slice-gaps.md)、[slice-gaps-copy.ts](../../../../../src/ui/mission/slice-gaps-copy.ts)。

## 写入范围

- `local/research/p3-15/annotation-audit/**`：合成画面截图与审计草稿。

## 验收标准

- [x] AC-09：音乐、过场、通讯头像、替代页面及每个临时资源/近似规则都有 UI 标注与可追溯文档说明；无未披露的占位或近似。
- [x] F1 `cockpit-front` 的既有缺口已报告并指明责任归属状态；差异已交回。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 在 development 与 production 构建中以合成内容逐页观察；`rg` 检索代码与文档的占位/近似标记并与清单对照。

## 完成证据

**结论（2026-10-30 复审，基线 `3f48fddb`，含修复项 12 的 `0458ada4`）：AC-09 满足。** F1 `cockpit-front` 及其前视别名已按[修复项 12](./12-f1-disclosure.md#完成证据)并入 G-08 的披露：飞行输入区的 G-08 提示在两构建中与更新后的 `SLICE_GAPS` G-08 文案逐字相同，写明 F1 与前视别名、原版的整驾驶舱重绘与 P4 的责任；F1 行为不变（见下文“复审”与表中 G-08、F1 两行）。下面先是复审，再是 2026-10-29 首次审计的记录（其余各行在复审中重跑，结论不变）。

### 复审（2026-10-30）

- **方法：** 工作树变基到 main `3f48fddb` 后重新 `pnpm build`，以同一私有脚本、同一环境（headless Chrome 156，development 5127 测试入口，production 5129 `pnpm preview` 加 `seedProductionCache`，只用合成内容）重跑全部 4 个用例 × 2 个构建：8 passed（4.0 min）。脚本补充：每个视角键提示的整段文字与 `SLICE_GAPS` 的 “标题（G ID）. 说明” 做相等比较（此前为包含比较），小键盘别名同样比较；F1 之外再按 `ArrowUp` 与 `Numpad8`，每键检查无提示、无 alert，development 读事件日志。首次运行的输出移到 `local/research/p3-15/annotation-audit/run-2026-10-29/`，本次输出在 `results/` 与 `shots/`。
- **G-08 文案逐字一致且可见：** F2–F10、`Home`、`PageUp`、`ArrowLeft`、`ArrowRight`、`ArrowDown` 与 `Numpad7/9/4/5/6/2` 共 20 键在两构建中都显示 `data-gap="G-08"`，整段文字与 `SLICE_GAPS['G-08']` 相等（`exact: true`）；G-09、G-10 同样相等。显示的说明包含 F1 与前视别名（Up、作为 Up 的小键盘 8）停留在前视、现在按下不改变任何状态、原版还会重绘整个驾驶舱、Core 规则随其他视角归 P4。G-08 不在飞行缺省说明列表中（飞行页可见标注仍为 G-01、G-02/1、G-02/2），所以 F1 的处置只随这些视角键提示出现，这正是 [slice-gaps](../../../../engineering/slice-gaps.md#当前构建的缺省项) G-08 行写明的呈现（“文案中的说明随这些提示出现”）。
- **F1 行为不变：** F1、`ArrowUp`、`Numpad8` 在两构建中都不显示提示（`input-gap-notice` 为空）、没有 alert；development 事件日志对三键各有一条 `cockpit-front · outcome=rejected · reason=not-implemented`（tick 819、831、843）。production 没有事件日志，结果由共用 Core 代码推出（未直接读取）。
- **文档一致：** [slice-gaps](../../../../engineering/slice-gaps.md#g-08-与-f1-前视) 的 G-08 行与“G-08 与 F1 前视”一节、[P3-01 缺省清单](../../01/spec.md#缺省清单)的 G-08 行与[视角范围](../../01/spec.md#视角范围) F1 一项、[键位文档](../../../../engineering/keyboard-input.md)的实现状态与绑定表、[core 分册](../../../../engineering/modules/core.md#已知差异)的已知差异与 P3-12/P3-13 交接，与 UI 文案一致：F1 与前视别名仍提交 `cockpit-front`、Core 为 `not-implemented`、不显示 G-08 提示、视角停留在前视、本构建不重绘而原版重绘（已确认，代码；能否察觉未确认）、规则归 P4。
- **旁注（不阻塞 AC-09）：** [STATUS](../../../../STATUS.md) 的 P3-14 一条仍写 “F1 键 `cockpit-front` 仍无 Core 规则与明确负责项”，与 12 之后的处置（G-08 披露、归 P4）不同步；不在本子任务写入范围，交协调者。

### 首次审计（2026-10-29）

2026-10-29，worker 09，基线 `6aeb1a8e`。当时结论：**AC-09 未满足（blocked）**。全部 G 项（G-01 至 G-10，含 G-02/1 至 G-02/10）在 development 与 production 中都有与 `SLICE_GAPS` 逐字一致的界面标注，文档与代码一致；没有临时资源或近似规则。唯一差异是 F1 `cockpit-front`：Core 仍以开发阶段的 `not-implemented` 拒绝它，这一占位不在 P3-01 清单中、没有处置决定，也没有明确的负责任务（见下文“差异”）。

**方法与环境：** macOS 26.6、本机 Google Chrome 156（Playwright `channel: chrome`，headless，隔离上下文，1280 × 800），Node 22.22.0。只用代码生成的合成内容：development 走测试入口 `/e2e/entries/app.html`（`mission-startable`、`mission-docking` 合成盘导入，或以测试入口身份写入 `endingPackage` 变体缓存）；production 为本工作树 `pnpm build` 后的 `pnpm preview`（端口 5129），以 `seedProductionCache` 按生产身份写入同样的合成包，经主菜单 “Open saved resources” 恢复，页面没有 `osrTestEntry`。审计脚本与输出只在 `local/research/p3-15/annotation-audit/`（git 忽略）：`annotations.audit.ts`（4 个用例 × 2 个构建，`audit.config.ts`）全部通过（development 3.9 min、production 2.1 min），每页的观测写入 `results/<build>-<case>.json`，合成截图在 `shots/<build>/`。每页读取所有可见的 `.slice-gap[data-gap]`，核对 G ID 集合与 “标题（G ID）. 说明” 与 `SLICE_GAPS` 逐字相同（用 `expect.soft`，任何不符都会使用例失败）。另在同一工作树以 `OSR_E2E_DEV_PORT=5127 OSR_E2E_PREVIEW_PORT=5128` 重跑既有用例 [map-picture.production.spec.ts](../../../../../e2e/map-picture.production.spec.ts) 的 “E = 0 …（Δ-06）”：1 passed。所启动的服务器都已由 Playwright 关闭（5127–5129 无监听）。

### 逐项审计

“两构建”指 development 与 production 中都在本次运行里看到同一标注。文档列只列当前构建说明与负责任务的证据；G 项定义均见 [P3-01 缺省清单](../../01/spec.md#缺省清单)，当前呈现均见 [slice-gaps](../../../../engineering/slice-gaps.md#当前构建的缺省项)。

| 项 | UI 位置（本次到达方式） | 显示的标注 | 文档链接 | 结论 |
|---|---|---|---|---|
| G-01 音乐 | 开始配置页与任务壳 “Missing from this build”；任务壳状态栏 `mission-status` 的短标签；基地视角的任务壳同样显示 | “No music (G-01). This build plays no music.”；状态栏 “No music (G-01)”（两构建） | slice-gaps G-01；[P3-04/10](../../04/subtasks/10-e2e-mission-flow.md#完成证据) | 一致 |
| G-02/1 介绍过场 | 主菜单 Start mission 后的占位页 `mission-placeholder`；之后在开始配置页与任务壳的缺省说明 | 标题 “Introduction placeholder (G-02/1)”，说明含 “a project choice rather than the original length”（两构建） | slice-gaps G-02/1、[G-02 不计时](../../../../engineering/slice-gaps.md#g-02-不计时与基准设置的差异)；[P3-01/08](../../01/subtasks/08-transition-media.md#完成证据)；P3-04/10 | 一致 |
| G-02/2 出发过场 | 选僚机后 Start 的占位页；之后同上 | “Departure placeholder (G-02/2)”，变体行 “Departure with a wingman.”（`data-variant="wingman"`，两构建）；`solo` 变体本次在 docking 用例中经过但未单独记录，由 P3-04/10 的无僚机流程覆盖 | 同上 | 一致 |
| G-02/3 入港过场 | 合成 `mission-docking`：`c`、`2`、`2` 请求停靠，停靠 tick 之后的运行中保持 | “Docking placeholder (G-02/3)” 与其说明（两构建）；多项保持的 “Transition i of n” 未在本次出现，由 [P3-10/23](../../10/subtasks/23-browser-verification.md#完成证据) 覆盖 | slice-gaps G-02/3；P3-10/23 | 一致 |
| G-02/4 离港过场 | 基地页按 `l` | “Launch placeholder (G-02/4)” 与其说明（两构建） | slice-gaps G-02/4；P3-10/23 | 一致 |
| G-02/5 被毁救援 | `endingPackage('failure')`：开局碰撞被毁、逃生舱之后的保持 | “Rescue after destruction placeholder (G-02/5)”，说明写明救援船只在媒体中、飞行中不出现（两构建） | slice-gaps G-02/5；[P3-11/18](../../11/subtasks/18-browser-verification.md#完成证据) | 一致 |
| G-02/6 能量救援 | 同一运行，Backspace 全速耗尽能量、信标等待之后 | “Rescue after running out of energy placeholder (G-02/6)”（两构建） | slice-gaps G-02/6；P3-11/18 | 一致 |
| G-02/7 失败过场 | 第三次损失后的终局占位 | “Mission failure placeholder (G-02/7)”，变体 “Variant: craft out of energy.”（`energy`），“Ending 1 of 1; the results page follows the last.”（两构建）；`destroyed` 变体由 P3-11/18 与单元测试覆盖 | slice-gaps G-02/7；P3-11/18 | 一致 |
| G-02/8 成功返航 | `endingPackage('success-cutscene')`：碰撞全清、结算等待之后 | “Return placeholder (G-02/8)”，`data-variant="wingman"`，“Ending 1 of 2 …”（两构建） | slice-gaps G-02/8；P3-11/18 | 一致 |
| G-02/9 任务专属过场 | 同一运行，G-02/8 之后 | “Mission cut-scene placeholder (G-02/9)”，“Variant: the mission's cut-scene row 16.”（两构建） | slice-gaps G-02/9；P3-11/18 | 一致 |
| G-02/10 授勋过场 | 结果页（失败与成功两次） | “Medal cut-scene not shown (G-02/10)” 与说明（两构建） | slice-gaps G-02/10；P3-11/18 | 一致 |
| G-03 通讯头像、动画与语音 | 通讯窗口：停靠回复来电时左显示屏页 5（`leftPage` 5，画布内）；基地页 `base-messages` 区块 | 页 5 项目短标注 `DOCKING REPLY` / `G-03 PROJECT`（画布像素，见截图 `docking-comm-window-page-5.png`），消息行队首为项目摘要（`origin: project`）；基地页 G-03 标注逐字一致，消息行写 “(project summary, not the original line)”（两构建）。页 5 像素与摘要偏移由 [cockpit.development.spec.ts](../../../../../e2e/cockpit.development.spec.ts) “pages 2–5 …” 与 [cockpit.production.spec.ts](../../../../../e2e/cockpit.production.spec.ts) “production incoming …” 断言；未覆盖消息的 “No project summary covers this message yet (G-03).” 在切片可达序号中不出现，由 `slice-gaps-copy.test.ts` 核对 | slice-gaps G-03；[P3-13/25](../../13/subtasks/25-ui-bridge-gaps.md#完成证据)、[P3-13/27](../../13/subtasks/27-browser-cockpit.md#完成证据)；[P3-10/22](../../10/subtasks/22-ui-base-page-gaps.md#完成证据) | 一致 |
| G-04 简报与僚机页 | 开始配置页 `mission-config` 与目标区块 `mission-objectives`（`data-gap="G-04"`） | G-04 标注逐字一致；目标区块标题 “Objectives and limits (project text) (G-04)”（两构建） | slice-gaps G-04；P3-04/10 | 一致 |
| G-05 基地内部画面 | 停靠后任务壳的游戏视图 `base-page` | 标题 “Base service (G-05)”，G-05 标注逐字一致（含项目名称为 Likely 的说明）；按键说明没有 `later`（“not in this build yet”）项（两构建） | slice-gaps G-05；P3-10/22、P3-10/23 | 一致 |
| G-06 结果页与重开 | 失败与成功的结果页 `mission-result`；任务菜单 `mission-menu` | G-06 标注逐字一致，“This attempt (project summary)” 的说明 “not the original statistics page”；成功页总结标为 “from your imported data”（两构建）。运行故障或停止后可以重开时 `mission-ended` 中的 G-06 标注本次未到达，也没有 e2e 断言它（[ai-wingman.development.spec.ts](../../../../../e2e/ai-wingman.development.spec.ts) 只读该区块的故障提示）；代码见 [MissionShell.tsx](../../../../../src/ui/mission/MissionShell.tsx) 的 `EndedNotice`，与 slice-gaps 的页面清单一致 | slice-gaps G-06；P3-11/18 | 一致 |
| G-07 菜单与战役设置 | 主菜单入口；开始配置页的难度 “19 (fixed, G-07)”；任务菜单 | G-07 标注逐字一致（三处，两构建） | slice-gaps G-07；P3-04/10 | 一致 |
| G-08 其他视角 | 飞行输入区 `input-gap-notice` | F2–F10、Home、PageUp、ArrowLeft、ArrowRight、ArrowDown 每键都显示 “Additional cockpit views missing (G-08). …”；Numpad7/9/4/5/6/2（无 Shift 的 CDP 按键）也显示 G-08（两构建）。这些是 CDP 的受信按键，不证明系统快捷键被拦截 | slice-gaps G-08；[视角范围](../../01/spec.md#视角范围)；[P3-05/24](../../05/subtasks/24-slice-gap-copy.md#完成证据)、[P3-05/28](../../05/subtasks/28-e2e-keyboard-flow.md#完成证据)；[P3-15/12](./12-f1-disclosure.md#完成证据) | 一致；2026-10-30 复审：20 键的整段文字与更新后的 G-08 文案逐字相同，含 F1 与前视别名的处置（两构建） |
| G-09 自动驾驶 | 同上，`a` | “Autopilot missing (G-09). …”（两构建） | slice-gaps G-09；P3-05/24 | 一致 |
| G-10 飞行中切换灵敏度 | 同上，F11 | “In-flight sensitivity switching missing (G-10). …”（两构建） | slice-gaps G-10；P3-05/24 | 一致 |
| 地图零能量代价 `MAP_COST_UNAVAILABLE`（非 G 项） | 战略地图上方信息带的代价锚点（画布） | 项目短标记 `N/A`，不冒充百分比 | [slice-gaps 在制标注（非 G 项）](../../../../engineering/slice-gaps.md#在制标注非-g-项)；[P3-13 DC-11](../../13/spec.md#dc-11-已批准差异) Δ-06；[P3-13/28](../../13/subtasks/28-browser-map.md#完成证据) | 一致：已批准差异，按 slice-gaps 呈现；差异本身归 08 的对照汇总 |
| 声音状态 `mission-sound`（非 G 项） | 任务壳状态栏 | “Sound: on.”，只表示音效可播放 | slice-gaps 在制标注（非 G 项） | 一致：项目状态，不是缺省；音乐仍由 G-01 标注 |
| 资源查看器的中性光照（诊断页面） | 资源查看器 | “Neutral light (not the original lighting)”；页面写明 “not the original game's screens” | [render 模块说明](../../../../engineering/modules/render.md) | 一致：诊断页面，不属游戏画面 |
| F1 `cockpit-front`（及 `ArrowUp`、`Numpad8`） | 飞行输入区按 F1、`ArrowUp`、`Numpad8` | 本键**无提示**（设计如此）：`input-gap-notice` 为空，无 alert（两构建）；development 事件日志三键各为 `cockpit-front · outcome=rejected · reason=not-implemented`（2026-10-30，tick 819/831/843）。处置由上一行的 G-08 提示文字披露（F1 与前视别名停留在前视、按下不改变状态、原版另有整驾驶舱重绘、Core 规则归 P4） | [slice-gaps 的 G-08 与 F1 前视](../../../../engineering/slice-gaps.md#g-08-与-f1-前视)；[P3-01 缺省清单](../../01/spec.md#缺省清单) G-08 行（2026-10-30 修订）；[键位文档](../../../../engineering/keyboard-input.md#对照差异与下游责任)；[core 分册](../../../../engineering/modules/core.md#已知差异)；[P3-15/12](./12-f1-disclosure.md#完成证据) | 一致（2026-10-30 复审）；首次审计时为差异（见下） |

### 未登记占位与近似的检索

- **检索：** `rg -i` 检索 `src/`（除测试）的 `approximat|placeholder|temporary|stand-in|project choice|not the original|substitut|interim|TODO|FIXME|G-0x|Δ-0x`，以及 `docs/` 的 `近似|临时资源|临时替代|占位资源|项目替代|项目选择|暂定`，逐条分类。
- **临时资源：** 没有。`temporary` 只出现在开发诊断的下载元素与导入的读缓冲（[file-save.ts](../../../../../src/platform/files/file-save.ts)、[source-reader.ts](../../../../../src/original-data/disc/source-reader.ts)），不是游戏资源；没有项目自绘的代用图像、音频或文字冒充原版。
- **近似规则：** 没有。`approximation` 的命中是 EXE 中的 f64 常量（[warp-path.ts](../../../../../src/core/rules/warp-path.ts) 的 `0x171f14`、[warp-templates.ts](../../../../../src/render/flight/warp/warp-templates.ts) 的 `0x171f44`）与格式化器“报错而非近似”的说明。
- **项目选择与已批准差异（举例，不是完整清单；不是临时资源或近似规则，均有文档披露，完整清单由 08 的对照汇总与 P3-16 的披露负责）：** 占位 3,000 ms（G-02/1 标注已写明是项目选择）与 G 提示约 3 s；操纵键、Alt 修饰与重复节奏（[键位文档](../../../../engineering/keyboard-input.md)）；32 Hz 固定步长与“表现即就绪”（[core 已知差异](../../../../engineering/modules/core.md)）；星云起点、相机初值与绘制缓冲窄于 640 时的受击闪烁点阵（[P3-12 技术决定](../../12/spec.md#技术决定)，后者经 [审批](../../12/spec.md#审批) 2026-10-17 为已知差异）；P3-13 的 Δ-01、Δ-03 至 Δ-09；P3-14 的 D1-06、D1-13 与 D2-04、D2-10、D2-12、D2-13。地图十字光标只留给隔离测试入口，生产无（[键位文档](../../../../engineering/keyboard-input.md)）。
- **`not-implemented`：** Core 中唯一仍落入 `rejectNotImplemented` 的命令类型是 `cockpit-front`（[commands.ts](../../../../../src/core/systems/commands.ts) 的 `default` 分支；`speed`、`speed-preset` 由 flight-control 判定），即上表的 F1 一行（首次审计时为差异，2026-10-30 起由 G-08 披露）。开发诊断面板的 “rules that do not exist yet answer not-implemented” 只在 development。
- **文档旁注（不阻塞 AC-09）：** [P3-14 spec](../../14/spec.md#d-01-定稿已批准) 的 D1-07（第一声道为左）仍写“暂定，待 R-07”，而 [P3-14/27](../../14/subtasks/27-documentation-handoff.md#完成证据) 已按 24 的 R-07 记为已确认，行状态未同步，交 P3-14。`MISSION_SKELETON` 的 “not yet a playable slice” 是 slice-gaps 已说明的项目构建状态文字，不是 G 项。

### 差异（交回）

**2026-10-30 处置：** 下面第 1 条已由协调者按 (b) 处置（[goal 执行记录](../goal.md#执行记录) 2026-10-29“F1 处置”与 2026-10-30 的前提更正），经修复项 [12](./12-f1-disclosure.md) 并入 G-08 披露并集成；复审已满足恢复条件，差异关闭。以下保留首次审计的原文。

1. **F1 `cockpit-front` 仍是 Core 的开发阶段占位，没有处置决定与明确负责任务。** F1（及 `ArrowUp`、`Numpad8`）提交的命令被 Core 以 `not-implemented` 拒绝（[commands.ts](../../../../../src/core/systems/commands.ts)；该原因按 `domain-events.ts` 是“开发阶段的结果，不是原版的无操作”），界面没有标注。用户可见的影响高概率为零：原版 F1 只把视角设为 0xC（[executable](../../../../original/formats/executable.md) 的 view keys by key context，已确认，代码），P3 中飞行键上下文可达的视角只有已是 0xC 的前视与被毁视角，后者在被毁序列中不轮询游戏按键（[B-005](../../../../original/behavior/B-005-campaign-rescue.md)）；重选同一视角是否另有重绘等副作用未核实。差别在 Core 的结果与录制事实：原版在前视中处理按键而视角不变、在被毁序列中根本不轮询按键，P3 则一律记为 `rejected/not-implemented`，被毁序列中也不是其他飞行命令的 `player-unavailable`（[键位文档](../../../../engineering/keyboard-input.md#对照差异与下游责任)）。它不在 P3-01 清单中，也没有已批准的差异记录，按[标注规则](../../01/spec.md#标注规则)“新增”一条不能视为已披露的处置，AC-09 因此不勾选。**责任归属：** 名义上归 P3-12/P3-13（P3-01 [视角范围](../../01/spec.md#视角范围)“F1 驾驶舱前视：P3 必需（P3-12、P3-13）”，P3-05 spec 的不包含一条与 core 模块说明的 P3-12/P3-13 交接）；两者都已交付而没有实现其 Core 效果，[P3-13/34](../../13/subtasks/34-final-alignment.md#完成证据) 与 STATUS 记为“仍无 Core 规则与明确负责项”，即**目前没有明确的负责任务**。本子任务不定义其效果。**需协调者/用户决定（二选一）：** (a) 指定负责任务按原版实现 `cockpit-front` 的 Core 效果（含被毁序列的门禁）；(b) 经用户批准把现状记为已披露的处置（例如 P3-01 清单或已批准差异的修订），F1 仍提交 `cockpit-front`——不能改为 G-08 式拦截，否则违反 [P3-02 命令表](../../02/spec.md)“不能以 G-08 禁掉 F1”与 P3-05 的 F1/`ArrowUp`/`Numpad8` 绑定；若决定加界面说明，只能与命令并存。
2. 恢复条件：上述任一修复合入后，在同一条件下（两构建、合成内容）重跑本审计的 F1 行与受影响页面。
