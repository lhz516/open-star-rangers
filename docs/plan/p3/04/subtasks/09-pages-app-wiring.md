---
type: plan
status: active
phase: P3
task: "04"
subtask: "09"
updated: 2026-10-10
---

# 09 — React 页面与应用接线

**契约来源：** [spec](../spec.md) 的 S-03、S-04、S-11（界面部分）、S-10（应用外壳中的演示入口），[应用流程](../spec.md#应用流程)、[开始资格](../spec.md#开始资格)、[任务开始配置](../spec.md#任务开始配置)、[衔接占位](../spec.md#衔接占位)、[任务菜单、暂停与退出](../spec.md#任务菜单暂停与退出)、[开发诊断](../spec.md#开发诊断)的生产边界、[缺省与标注](../spec.md#缺省与标注)、[合成演示退役](../spec.md#合成演示退役)的“文字”；为 AC-08、AC-09、AC-12、AC-14、AC-15、AC-19 提供实现。
**依赖：** 05, 06, 07。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **页面**（计划新增 `src/ui/mission/`）：
  - 开始配置页（G-04、G-07）：任务组与槽位、固定难度 19；目标与限制的项目说明（集中一处，标明项目文字、链接事实来源并注明置信度，说明本构建尚未实现这些规则，不简化为“最后一架敌机即胜利”或“任何阶段第三次损失即失败”）；僚机列表按名单次序显示 `nameCandidates`（纯文本；无候选显示项目编号；多候选列出候选）与“无僚机”；开始与返回主菜单；创建失败以 alert 显示类别、路径与原因。
  - 占位页（G-02/1、G-02/2）：功能描述的缺省标注、G ID、出发变体（solo/wingman）；打开时焦点移到跳过按钮；Enter、Space、Esc 只在本占位范围内、只接受新的按下；不把上一页的按键尾事件交给下一页。
  - 任务壳：游戏画面区域（留给 P3-12、P3-13），画面之外的项目状态栏（phase、暂停原因、不能继续的原因、G-01 无音乐）；暂停/继续与任务菜单控件；故障或停止提示（原因不含导入内容，重开与返回）；只读 `data-owner`、`data-run`、`data-tick` 属性；如实说明“正式运行骨架、尚非完整可玩切片”。
  - 任务菜单（G-07）：替代画面，继续、重开任务、返回主菜单；进入聚焦标题。
  - 界面中的缺省文字集中在计划新增的 `src/ui/mission/slice-gaps-copy.ts`，以 G ID 标识。
- **主菜单：** [MainMenuPage.tsx](../../../../../src/ui/pages/MainMenuPage.tsx) 去掉 `Start synthetic demo`，增加开始任务入口：满足资格时可用，否则禁用并以说明给出原因；返回时焦点规则（可用入口或菜单标题）。
- **应用外壳与流转：** [app-flow.ts](../../../../../src/app/flow/app-flow.ts) 以 `mission` 画面（进入次数、任务所有者清理锁存）取代 `demo`；[App.tsx](../../../../../src/app/App.tsx) 移除演示屏与演示槽位，接入任务槽位；权利与隐私声明不再提合成演示，其余声明不变、不新增法律保证。计划新增 `src/app/MissionScreen.tsx`（独立模块，使页面的 Fast Refresh 不重建外壳）与 `src/app/composition/use-mission-owner.ts`（打开与关闭槽位、在旧所有者释放后创建新所有者）。按 05 的收尾顺序 helper 调整 [use-resource-holder.ts](../../../../../src/app/composition/use-resource-holder.ts)，保证外壳卸载与 Fast Refresh 时先释放任务、再销毁 holder。
- **端口与入口：** [ports.ts](../../../../../src/app/ports.ts) 增加 04 的端口；[browser-ports.ts](../../../../../src/app/browser-ports.ts) 提供浏览器实现；计划新增 `src/app/app-version.ts` 给出 producer（应用名、包版本与构建模式，1–128 码元）。开发构建（`import.meta.env.DEV`）接入 07 的面板、帧计时与录制选项，生产构建以编译期分支剔除它们，不读 URL 参数或全局开关。[app-entry.test-support.tsx](../../../../../src/app/app-entry.test-support.tsx) 增加可注入的种子序列等测试端口；新增查询键同步 [e2e-network-policy.ts](../../../../../tools/e2e-network-policy.ts) 的 `TEST_ENTRY_QUERY` 及其测试。
- 合成演示的模块本身保留到 13 删除；本项只断开应用对它们的引用。

## 不包含

- E2E 用例（10–12）；合成模块与 lint 规则的删除（13）；`slice-gaps.md` 文档（15）。
- 原版键位绑定、飞行画面、HUD 与音频（P3-05、P3-12 至 P3-14）。

## 关键文件与契约

- 修改：[App.tsx](../../../../../src/app/App.tsx)、[app-flow.ts](../../../../../src/app/flow/app-flow.ts)、[MainMenuPage.tsx](../../../../../src/ui/pages/MainMenuPage.tsx)、[ports.ts](../../../../../src/app/ports.ts)、[browser-ports.ts](../../../../../src/app/browser-ports.ts)、[use-resource-holder.ts](../../../../../src/app/composition/use-resource-holder.ts)、[app-entry.test-support.tsx](../../../../../src/app/app-entry.test-support.tsx)、[e2e-network-policy.ts](../../../../../tools/e2e-network-policy.ts)、[app.css](../../../../../src/app/app.css)、[main.tsx](../../../../../src/main.tsx)（如需）。
- 计划新增：`src/ui/mission/**`、`src/app/MissionScreen.tsx`、`src/app/composition/use-mission-owner.ts`、`src/app/app-version.ts`。
- 消费：05 的任务所有者与槽位、06 的 store 与 hook、07 的面板与帧计时。

## 写入范围

- `src/ui/mission/**`：计划新增的页面与缺省文字。
- `src/ui/pages/MainMenuPage.tsx`：开始入口取代演示入口。
- `src/app/App.tsx`：外壳接线与声明文字。
- `src/app/MissionScreen.tsx`：计划新增的任务画面模块。
- `src/app/flow/app-flow.ts`：`mission` 画面。
- `src/app/flow/app-flow.test.ts`：对应测试。
- `src/app/composition/use-mission-owner.ts`：计划新增的 React hook。
- `src/app/composition/use-resource-holder.ts`：收尾顺序。
- `src/app/ports.ts`：端口扩展。
- `src/app/browser-ports.ts`：浏览器实现接线。
- `src/app/app-version.ts`：计划新增的 producer 标识。
- `src/app/app-entry.test-support.tsx`：测试端口注入。
- `src/app/app.css`：页面样式。
- `src/main.tsx`：必要的入口接线。
- `tools/e2e-network-policy.ts`：新增查询键。
- `tools/e2e-network-policy.test.ts`：对应测试。

## 验收标准

- [x] 主菜单的开始入口按资格可用或禁用并说明原因；不再出现 `Start synthetic demo`；页面不声称原版玩法已可玩。
- [x] 介绍 → 配置 → 出发 → 飞行 → 菜单/暂停 → 重开或返回的页面与 05 的流程一致；焦点、标签、Tab 顺序与 alert 符合 spec；按键尾事件不触发下一页。
- [x] G-01、G-02/1、G-02/2、G-04、G-06（重开与返回）、G-07 的标注在界面可见，文字集中在 `slice-gaps-copy.ts` 并以 G ID 标识。
- [x] 开发构建显示诊断面板并开启录制；生产构建的代码路径不包含面板、日志、命令编辑与下载入口（由 12 检查产物）。
- [x] 外壳卸载与 Fast Refresh 时任务先于 holder 释放；`app-flow` 的 Node 测试覆盖 `mission` 画面、锁存与焦点。
- [x] `pnpm check` 通过（含 `tools/e2e-network-policy.test.ts`）。

## 验证方法

- Node：`pnpm exec vitest run src/app src/ui tools/e2e-network-policy.test.ts`。
- 浏览器流程按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 用合成任务包在开发服务器上冒烟检查一次（入口、页面、焦点、标注）；完整 E2E 由 10–12 完成。依赖演示的既有 E2E 在本项之后暂时失败，由 10–12 迁移，执行记录中注明。
- 不适用原版对照。

## 完成证据

- **实现：**
  - 页面流转：[app-flow.ts](../../../../../src/app/flow/app-flow.ts) 的画面为 `menu`/`import`/`mission`/`viewer`，状态 `{ screen, missionVisit, focusTarget, cleanupFailure, viewerFailure }`；输入 `{ open-mission, eligible }`（不在菜单、不满足资格或已锁存时原样返回，进入次数耗尽抛 `RangeError`）与 `{ mission-release-failed, cause }`（只记第一次原因）；返回焦点为 `mission-entry`，锁存时为菜单标题。
  - 端口：[ports.ts](../../../../../src/app/ports.ts) 的 `AppPorts.mission` 为 `{ seed, clock, timer, leaveGuard, createSessionHost, createFileSave }`；[browser-ports.ts](../../../../../src/app/browser-ports.ts) 按 04 接线（`createBrowserSeedSource()`、`createBrowserClock()`、`createBrowserTimer()`、`createLeaveGuard(window)`、`createBrowserSessionHost`），文件保存只在开发构建中以 `import.meta.env.DEV` 后的顶层动态导入取得，生产为 null。[app-version.ts](../../../../../src/app/app-version.ts) 的 producer 为 `open-star-rangers 0.0.1 <构建模式>`（截至 128 码元）；名称与版本为手写常量，因为导入 `package.json` 会让开发页面请求 `/package.json`，开发网络审计拒绝它。
  - 所有者接线：[use-mission-owner.ts](../../../../../src/app/composition/use-mission-owner.ts) 以 `slot.open(setup)` 打开所有者，槽位决定创建时才创建会话宿主与 `ui` 消费者（`connect` 中以 ownerId 创建 06 的 store、桥接与命令反馈，`bind(context.session)`，以 `{ release: bridge.unbind, onSessionError: bridge.onError }` 返回）；所有者每次发布快照时把冻结的流程值写入 store。开发构建另以 `createFrameTiming(host, clock)` 包装宿主、加入 `timing.consumer` 与 `createMissionDiagnostics({ timing, fileSave })` 的消费者，录制为 `developmentRecording(appProducer(MODE))`；这些模块与 [MissionScreen.tsx](../../../../../src/app/MissionScreen.tsx) 的 `MissionDevPanel` 一样经 `import.meta.env.DEV` 后的顶层动态导入载入，生产录制为 null。effect 的清理释放槽位；`assemble` 以 `useCallback` 记忆，所以 hook 的 Fast Refresh 替换所有者。
  - 收尾顺序：[use-resource-holder.ts](../../../../../src/app/composition/use-resource-holder.ts) 接收槽位，清理时调用 05 的 `teardownMissionAndHolder(slot, holder)`；持有者的创建以 `useCallback` 记忆，外壳（`App.tsx` 或该 hook）的 Fast Refresh 因此重跑 effect，先释放任务再销毁 holder（实测：StrictMode 下依赖只有 props 与 state 的 effect 不随刷新重跑）。[App.tsx](../../../../../src/app/App.tsx) 记下进入任务画面时的 holder，渲染时 holder 已不同（外壳刷新）即返回菜单；`onPackageReplaced` 返回菜单并显示 `mission-package-replaced`；资格为 `missionEligibility(snapshot, flow.cleanupFailure)`；“返回主菜单”先 `slot.release()` 再切换画面。权利声明改为“independent project, not original gameplay or an officially authorized product”，其余声明不变。
  - 页面（`src/ui/mission/`）：[MissionPage.tsx](../../../../../src/ui/mission/MissionPage.tsx) 按流程位置显示占位、配置、飞行壳或任务菜单，按 ownerId 作 key；画面根 `mission-screen` 带只读 `data-owner`、`data-run`、`data-tick`（采样 tick）与 `data-position`，只有这一层订阅 tick。[PlaceholderPage.tsx](../../../../../src/ui/mission/PlaceholderPage.tsx)：G ID、缺省标注、出发变体（`data-variant` solo/wingman）、隐藏时的等待说明；焦点在 Skip；本页范围内新的 Enter、Space、Esc 跳过一次，repeat 一律 `preventDefault`；计时失败时只给 alert 与“Return to main menu”（焦点移到它，新的按键保留原生激活）。[StartConfigPage.tsx](../../../../../src/ui/mission/StartConfigPage.tsx)：标题获焦，组与槽位、难度 19（G-07）、目标与限制（G-04，项目文字、来源与置信度、本构建未实现）、按名单次序的僚机单选与“No wingman”（纯文本，无候选为项目编号，多候选列出），Start 与返回；创建失败以 `role=alert` 显示类别、路径与原因；锁存或包已改变时只保留返回并获焦。[MissionShell.tsx](../../../../../src/ui/mission/MissionShell.tsx)：标题获焦、骨架说明、空的游戏画面区域、画面外的状态栏（phase、暂停原因、不能继续的原因、G-01）、暂停/继续的单个切换控件（焦点不丢）与任务菜单；结束提示（stopped/faulted/cleanup-failed）只显示错误类名与结构字段（不含消息文本），无清理失败时可重开，均可返回。[MissionMenuPage.tsx](../../../../../src/ui/mission/MissionMenuPage.tsx)：标题获焦，Continue（隐藏时禁用并说明）、Restart mission、Return to main menu，G-07 与 G-06。文字：[slice-gaps-copy.ts](../../../../../src/ui/mission/slice-gaps-copy.ts) 以 G ID 为键（G-01、G-02/1、G-02/2、G-04、G-06、G-07）与 G-04 的 `MISSION_OBJECTIVES`（代码注释链接 executable 两节与 B-003/B-005）；[mission-copy.ts](../../../../../src/ui/mission/mission-copy.ts) 为骨架说明、资格原因、僚机标签、开始失败与结构化错误描述；[page-keys.ts](../../../../../src/ui/mission/page-keys.ts) 为占位按键与按住激活的判定。
  - 主菜单：[MainMenuPage.tsx](../../../../../src/ui/pages/MainMenuPage.tsx) 以 `Start mission` 取代演示入口，满足资格时可用，否则禁用并以 `mission-entry-reason` 说明（没有包、不完整的组或整包诊断、任务未载入或载入失败的类别/路径/原因、清理锁存）；说明含骨架声明与 G-07；返回焦点在入口禁用时落到菜单标题；入口上的 Enter/Space repeat 被抑制，按住返回键不会重新进入任务。
  - 测试入口：[app-entry.test-support.tsx](../../../../../src/app/app-entry.test-support.tsx) 的 `seeds` 查询（逗号分隔的十进制值，按次抽取，用完后回到 `crypto.getRandomValues`；uint32 以外的值原样交给所有者，报开始失败）；[e2e-network-policy.ts](../../../../../tools/e2e-network-policy.ts) 的 `TEST_ENTRY_QUERY.seeds` 为至多 16 个、每个至多 10 位的十进制数。[app.css](../../../../../src/app/app.css) 增加任务页面样式与输入、标题的可见焦点，删除已不渲染的 `.synthetic-input` 规则。合成演示模块未删除（13），应用不再引用它们。
- **Node：** `pnpm exec vitest run src/app src/ui tools/e2e-network-policy.test.ts` 通过（含新的 [app-flow.test.ts](../../../../../src/app/flow/app-flow.test.ts) 用例：仅在资格满足时从菜单进入、每次新的进入次数、返回焦点、任务画面上锁存后回到标题且不能再进入而查看器不受影响；[mission-copy.test.ts](../../../../../src/ui/mission/mission-copy.test.ts)：各资格原因、`FIVE_WINGMAN_NAMES` 的五个标签按纯文本、开始失败文字与可否重试、错误描述不含消息文本、G ID 键与目标/限制说明；[page-keys.test.ts](../../../../../src/ui/mission/page-keys.test.ts)：新的 Enter/Space/Esc 跳过，repeat 抑制，修饰键与输入法组合放行；[e2e-network-policy.test.ts](../../../../../tools/e2e-network-policy.test.ts)：`seeds` 的正反例与查询键列表）。`pnpm check` 通过（245 个测试文件、6,979 个测试与生产构建）。
- **生产边界：** `pnpm build` 的 `index-*.js` 中没有 `mission-dev-panel`、`Export recording`、`osr-recording`、`createObjectURL` 与 producer 字符串，source map 的 sources 中没有 `src/ui/dev/`、`dev-frame-timing`、`file-save`、`app-version`、测试支持或合成模块，也没有残留的顶层 await。改用动态导入的原因：静态导入时 Rolldown 保留了这些模块顶层的 `Object.freeze(...)` 调用与命令表单数据，source map 因而列出 `src/ui/dev/*`。完整的产物与 CSP 检查归 12。
- **浏览器冒烟（browser-testing）：** 本机 Chrome（Playwright MCP，独立配置），开发服务器 `127.0.0.1:5129`，测试入口 `worker=mission-startable&seeds=7,8,9`，经导入页导入 01 的合成光盘（代码生成，写入临时目录后删除）。没有包时入口禁用并说明原因；导入后可用。在入口按住 Enter：第一次按下进入介绍占位（焦点在 Skip），repeat 不跳过；新的 Space 跳过，配置页焦点在标题，名单五项与“No wingman”按纯文本显示（含 `<b>…</b> & co` 原样）；在 Start 上按住 Enter 进入出发占位（`data-tick` 0、`data-variant` solo），repeat 不跳过；Esc 进入飞行，tick 前进；暂停后 tick 不变，切换控件保持焦点；任务菜单期间 tick 不变，Continue 回到飞行；重开后回到介绍，配置页预选上次确认的“No wingman”；改选僚机后新运行 runId 2、种子 8、实体中出现 `wingman#3`；诊断提交的 `fire` 得到 commandId 1 的 rejected/`not-implemented`；返回主菜单后焦点在入口；有运行时导航出现 Chrome 原生 `beforeunload` 对话框。`mission-create-rejected` 留在配置页并以 alert 显示 `Core input error at input.mission.content.declarations[0].ruleInputs.craftCount: must give the player one request`；`mission-load-failed` 与 `mission-partial` 的入口禁用并分别说明类别/路径/原因与 `audio incomplete`。hook 的 Fast Refresh 替换所有者（ownerId 递增、新运行 runId 1 下无旧命令结果），包与已确认的僚机保留；外壳（`App.tsx`）的 Fast Refresh 回到菜单，包被丢弃，焦点在菜单标题。按住配置页的“Return to main menu”时 repeat 不会重新进入任务。控制台只有已有的 favicon 404。占位计时失败页面无法在浏览器中不加后门地触发，以代码审查覆盖。服务器、浏览器与临时文件均已关闭或删除。
- **既有 E2E：** 未运行。依赖合成演示的用例（`Start synthetic demo`、`synthetic-view`、旧的权利文字与 `expectNoPlayClaim`）在本项之后预期失败，由 10–12 迁移，13 删除合成模块。
- **审查：** rubber-duck 的四项均已修复：计时失败的占位曾阻止 Enter/Space 激活返回按钮；按住返回键的 repeat 会重新进入任务；不能重试的开始失败仍显示可用的 Start；所有者页面未按 ownerId 作 key，Fast Refresh 后诊断面板可能保留旧所有者的状态。simplify 采纳：tick 只由画面根订阅（避免每次采样重渲染整页）、开发模块并行动态导入、`MissionScreen` 与 hook 要求非空 holder、缺省文字去掉重复的 `id`、按住激活判定共用于占位与菜单入口。未采纳：复用 `missionFailureCopy`/`FailureNotice`（其文字针对载入失败且把类别、路径与原因收在折叠的技术细节中，而开始失败须直接显示）、把版本改从 `package.json` 读取（开发网络审计拒绝该请求）、以 ref 记下进入时的 holder（渲染时读 ref 不符合 React 规则）、把包替换并入 app-flow（spec 的页面流转形状只含进入次数与锁存）、在任务入口前延迟载入开发模块（只影响开发构建的启动）。
- **文档影响：** 本项写入范围不含文档。工程约定的“页面流转与演示生命周期”“合成 Runtime”等节、app/ui/platform 分册、键位文档（占位的 Enter/Space/Esc 与入口的 repeat 抑制）与本地导入指南（开始任务的条件与流程）由 15 更新；`slice-gaps.md` 由 15 按 [slice-gaps-copy.ts](../../../../../src/ui/mission/slice-gaps-copy.ts) 的 G ID 与位置编写。[tools/compliance/notices.ts](../../../../../tools/compliance/notices.ts) 的 `ORIGINAL_RIGHTS_BOUNDARY`（构建许可声明）仍写“independent synthetic engineering demo”，不在本项范围，已报告协调者。不读取 `local/`，不涉及原版对照。

