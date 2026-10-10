---
type: plan
status: active
phase: P3
task: "04"
subtask: "12"
updated: 2026-10-10
---

# 12 — E2E：外壳、合规、生产预览与其余迁移

**契约来源：** [spec](../spec.md) 的[合成演示退役](../spec.md#合成演示退役)的测试迁移与文字、[开发诊断](../spec.md#开发诊断)的生产边界；AC-15，AC-18 的迁移部分，AC-22 的生产部分。
**依赖：** 10。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [app-shell.spec.ts](../../../../../e2e/app-shell.spec.ts)、[app-shell-resources.spec.ts](../../../../../e2e/app-shell-resources.spec.ts)、[bootstrap.spec.ts](../../../../../e2e/bootstrap.spec.ts)、[compliance-text.spec.ts](../../../../../e2e/compliance-text.spec.ts)：以开始任务入口与其资格说明取代演示入口；焦点规则；更新后的权利与隐私声明可读。
- [production-preview.spec.ts](../../../../../e2e/production-preview.spec.ts)：菜单、导入与任务流程（经生产缓存预置）在严格 CSP 与网络审计下没有违规或外发请求；产物与 source map 来源不含开发诊断面板、事件日志、命令编辑、下载入口与测试支持；生产 DOM 中没有诊断面板。
- [webgl-unavailable.spec.ts](../../../../../e2e/webgl-unavailable.spec.ts)：任务流程不创建 WebGL 表面，WebGL 不可用的降级改为在查看器上验证（查看器用例尚未覆盖的部分迁到此处）；确认菜单与任务流程在该浏览器中可用。
- [interaction-render.spec.ts](../../../../../e2e/interaction-render.spec.ts)：只验证合成键位与合成画面的部分删除；通用的原生控件与同所有者 resize 若仍有价值则迁到查看器或任务画面；删除整文件时同步 [playwright.config.ts](../../../../../playwright.config.ts) 与 [e2e-configuration.test.ts](../../../../../tools/e2e-configuration.test.ts)。
- [browser-replay.spec.ts](../../../../../e2e/browser-replay.spec.ts)：改为正式 Core：在浏览器中以合成内容执行 `replayRecord`，与 Node 的结果比较一致；版本与身份不符的记录被拒绝。
- [joint-pipeline.development.spec.ts](../../../../../e2e/joint-pipeline.development.spec.ts)：演示部分改为进入任务流程或删除，导入、缓存与查看器的验收不变。
- [viewer-page.spec.ts](../../../../../e2e/viewer-page.spec.ts)：`frameWindow` 改从 `mission-observations.ts` 导入；[image-observations.ts](../../../../../e2e/support/image-observations.ts)：去掉 `synthetic-view`，按查看器画面取证。
- 完成证据列出每个旧用例的去向。

## 不包含

- 生命周期、资源平衡与 Fast Refresh（11）；`demo-observations.ts` 与合成源码的删除（13）。

## 关键文件与契约

- 修改：上列 E2E 文件、[playwright.config.ts](../../../../../playwright.config.ts)、[e2e-configuration.test.ts](../../../../../tools/e2e-configuration.test.ts)。
- 消费：10 的 `mission-observations.ts` 与生产缓存预置；01 的合成内容。

## 写入范围

- `e2e/app-shell.spec.ts`：迁移。
- `e2e/app-shell-resources.spec.ts`：迁移。
- `e2e/bootstrap.spec.ts`：迁移。
- `e2e/compliance-text.spec.ts`：迁移。
- `e2e/compliance-assets.spec.ts`：声明文字变化时同步。
- `e2e/production-preview.spec.ts`：迁移与产物检查。
- `e2e/webgl-unavailable.spec.ts`：迁移。
- `e2e/interaction-render.spec.ts`：删除或迁移。
- `e2e/browser-replay.spec.ts`：改为正式 Core。
- `e2e/joint-pipeline.development.spec.ts`：演示部分迁移。
- `e2e/viewer-page.spec.ts`：helper 导入。
- `e2e/support/image-observations.ts`：取证对象。
- `playwright.config.ts`：用例增删时的项目归属。
- `tools/e2e-configuration.test.ts`：对应回归。
- `tools/compliance/notices.ts`：`ORIGINAL_RIGHTS_BOUNDARY` 不再提合成演示，其余声明不变。
- `tools/compliance/notices.test.ts`：对应断言。
- `e2e/support/app-entry.ts`：只改 `expectNoPlayClaim`（开始入口按资格启用、页面不声称原版玩法可玩）。
- `e2e/support/browser-test.ts`：测试后检查的意外失败 ID 改为正式应用的 ID。

## 验收标准

- [x] AC-15：生产任务流程在 CSP 与网络审计下无违规；产物、source map 来源与生产 DOM 中没有开发诊断与测试支持。
- [x] AC-22（生产）：生产中没有面板、日志、命令编辑器或测量接线。
- [x] 迁移后的用例不再引用 `demo-observations.ts`、`synthetic-view`、`Start synthetic demo` 或 `src/core/synthetic`；每个旧用例的去向有记录。
- [x] `pnpm test:e2e` 中本项涉及的文件在 development 与 production 项目通过；`pnpm check`（含 `tools/e2e-configuration.test.ts`）通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)；产物检查读取 `dist/` 与 source map 来源列表。
- 不适用原版对照。

## 完成证据

- **环境：** Google Chrome 155.0.8059.39（`channel: chrome`，headless，1280×800，像素比 1；WebGL 不可用用例另起带 `--disable-webgl --disable-webgl2 --disable-3d-apis` 的浏览器进程），Node v22.22.0，V8 12.4.254.21-node.33；开发服务器 `127.0.0.1:5136`，生产预览 `127.0.0.1:5137`（`OSR_E2E_DEV_PORT=5136 OSR_E2E_PREVIEW_PORT=5137`）。每个用例一个隔离 context，只用代码生成的合成内容；生产用例经 [production-cache.ts](../../../../../e2e/support/production-cache.ts) 的 `seedProductionCache(page, await missionPackage())` 在测试自己的 context 中预置，刷新后经真实菜单 “Open saved resources” 恢复并校验，不使用测试入口或后门。
- **命令：** `pnpm test:e2e` 指定本项涉及的 11 个文件与共用 helper 的其余调用者（import-page、joint-pipeline.production、mission-flow.development/production），`--project=development --project=production`：58 个全部通过（4.1 min）；`pnpm exec vitest run tools/compliance/notices.test.ts` 6 个通过；`pnpm check:original` 无发现。在 11 之前的基线（`7e32ba3c`）上，`pnpm typecheck` 与 `tools/e2e-configuration.test.ts` 只因 11 尚未迁移的 probe-contract.spec.ts 仍导入本项删除的 `image` 而失败。变基到 11 的集成提交 `69619320` 后：`pnpm check` 通过（typecheck、lint、245 个测试文件 6,980 个测试，含 `tools/e2e-configuration.test.ts`，构建）；本项 11 个文件在两个项目中重跑 37 个全部通过（2.4 min），覆盖 11 改动的浏览器探针与资源平衡（`settleTooling`、`ResourceBalance`）。
- **反证：** 临时把 [MissionScreen.tsx](../../../../../src/app/MissionScreen.tsx) 对开发面板的动态导入改为静态导入（未提交，已还原并重新构建），构建产物检查用例因 source map 来源出现 `src/ui/dev/` 而失败，证明该断言不是空转。

| 验收 | 设置与操作 | 观察 | 结果 |
|---|---|---|---|
| AC-15（任务流程、CSP 与网络审计） | [production-preview.spec.ts](../../../../../e2e/production-preview.spec.ts) 的 `audited` 用例：生产预览打开菜单（响应头为 `PREVIEW_CONTENT_SECURITY_POLICY`），进出导入页，预置并恢复 `missionPackage()`，开始任务：介绍跳过、默认僚机 Start、出发跳过，飞行，任务菜单，返回主菜单 | 无包时入口 `no-package`；恢复后状态为完整、已恢复校验、任务可载入，入口 `eligible`；飞行 tick 前进，owner/run 1；文档中 0 个 `canvas`，探针记录的 WebGL 画布为空；返回后焦点在入口、没有 Worker；`securitypolicyviolation` 为 0；网络审计（生产 `dist/` 白名单）无违规、无缺口、无外发请求 | passed |
| AC-15、AC-22（生产 DOM） | 同上，在介绍、配置、飞行与任务菜单读取 DOM | 没有 `mission-dev-panel` 或任何 `dev-*` 测试 ID，也没有 “Refresh state”“Submit command”“Export recording” 按钮 | passed |
| AC-15、AC-22（产物） | 构建产物检查：读取 `dist/` 全部文件与每个 source map 的 `sources`（按 map 所在目录解析为仓库路径；以 `src/app/mission/mission-owner.ts` 在列中证明路径形式） | 只有 `index.html` 一个页面；来源中没有 `.test`/`.test-support`、`e2e/`、app-entry、`src/ui/dev/`、`src/{core,render}/synthetic/` 与 `synthetic-*`/`Synthetic*` 模块，也没有开发诊断面板、诊断、事件日志、帧统计、命令编辑、实体检查、录制导出、帧计时（`dev-frame-timing.ts`）、文件保存适配器（`file-save.ts`、`browser-file-save.ts`）与 `app-version.ts`；JS/HTML 中没有测试标记，也没有这些模块独有的字符串（`mission-dev-panel`、`dev-state-run`、`dev-entities`、`dev-log`、`dev-frames`、`dev-command-submit`、`dev-recording-export`、`osr-recording-`、`createObjectURL`），每个字符串都先核对确实出现在对应源码中 | passed |
| 合成演示退役（外壳与启动） | app-shell、bootstrap、compliance-text 在两个项目；app-shell-resources 在开发项目 | 新 context：入口禁用，`data-eligibility=no-package`，原因 “Not available now. No resource package is held…”，可访问描述含 `MISSION_SKELETON` 与原因；鼠标点禁用入口不进入任务；第一个 Tab 停在导入入口；导入页往返（键盘与鼠标各一次）焦点回到导入入口。已保存但未恢复的包仍为 `no-package`；占位逻辑的 `models` 包恢复后为 `mission-failed`，原因为结构化的类别、路径与原因；存储不可用时导入 `mission-startable`，状态 “Held in memory only”，入口 `eligible`，可走到飞行（tick 前进）并返回，焦点回到入口，导入仍可用 | passed |
| 合成演示退役（“不声称可玩”） | [app-entry.ts](../../../../../e2e/support/app-entry.ts) 的 `expectNoPlayClaim`（协调者批准的范围），所有调用者 | 先确认 `MISSION_SKELETON` 自身是“not yet a playable slice”的说明，从页面文字中去掉它后不得出现 `playable`/`play mission`；页面有 Start mission 入口时，入口可用当且仅当 `data-eligibility=eligible`，其描述含该说明 | passed |
| 合成演示退役（文字） | compliance-text、compliance-assets；[notices.ts](../../../../../tools/compliance/notices.ts) | 页面权利声明含 “This is an independent project, not original gameplay or an officially authorized product.”、MIT 只适用于本项目、不授予原版内容权利，不含 demo；隐私声明不变。`ORIGINAL_RIGHTS_BOUNDARY` 只把 “This independent synthetic engineering demo” 改为 “This independent project”，其余不变；`LICENSE.txt` 与 `THIRD-PARTY-NOTICES.txt` 含新的边界文字（`notices.test.ts` 新增一例），`LICENSE.txt` 不含 demo | passed |
| WebGL 不可用 | [webgl-unavailable.spec.ts](../../../../../e2e/webgl-unavailable.spec.ts)，两个项目 | 查看器两次进出：`viewer-render-status` 为 alert “WebGL 2 is unavailable”，没有画布，列表可选（`aria-pressed`），诊断 `unavailable`、gpu/layout/placement 为空；每次返回后没有待执行帧、没有观察中的观察器、基线之后添加的应用监听全部移除。任务流程：飞行前进、暂停稳定、继续前进，文档中没有画布，返回后离页监听 0、同样释放；探针从未取得 WebGL 上下文 | passed |
| 通用原生控件与同所有者 resize | [interaction-render.spec.ts](../../../../../e2e/interaction-render.spec.ts)，两个项目 | 只用键盘：Shift+Tab 到入口，`n`/`x`/`p`/←/→ 不起作用，Enter 进入介绍（焦点在 Skip），Space 结束；方向键改选僚机 1，Enter 开始，Esc 结束出发；飞行中这些键不暂停、不改变 phase；窗口 480×900 与 1280×800 后同一 owner/run 继续前进、画面区域仍是同一元素；暂停切换控件用 Space/Enter 且保持焦点；任务菜单与返回均用键盘，焦点回到入口。查看器：每次 resize 布局都改变且画布按 4:3 规则跟随，诊断布局一致、同一项目与 GPU 计数、绘制数逐次增加，画布仍是同一元素；返回后画布离开文档 | passed |
| 浏览器 replay | [browser-replay.spec.ts](../../../../../e2e/browser-replay.spec.ts)，开发项目 | Node 以 `createRecordingSession` 录制合成 Core 世界（`create-world.test-support.ts`，僚机 0，64 时钟单位/tick）320 tick、检查点间隔 16，JSON 往返后 Node `replayRecord` 与录制结果一致；浏览器从开发服务器载入 `src/core/replay/replay.ts` 与 `compare.ts`，结果与 Node 完全相同，`compareReplayResults` 一致，改动 tick 32 检查点的期望得到 `{ match: false, tick: 32, kind: 'checkpoint' }`；格式、版本、rulesVersion、内容身份（converterVersion）与 setupHash 不符的记录在两边都以相同的 `CoreInputError` 拒绝 | passed |
| 联合管线（开发） | [joint-pipeline.development.spec.ts](../../../../../e2e/joint-pipeline.development.spec.ts) | 无包时入口 `no-package`；三轮导入、提交、查看、刷新恢复后，每轮从持有的 canary 包开始任务到飞行再返回：没有新建 Worker、音频上下文或 WebGL 画布，菜单状态与持有文字不变，资源平衡检查通过；导入、缓存与查看器的断言与网络审计、canary 未变 | passed |

**旧用例的去向：**

| 旧用例 | 去向 | 原因 |
|---|---|---|
| app-shell：菜单与演示、导入的焦点往返 | 原处迁移：演示入口换成禁用的 Start mission（原因、描述、不可点击、Tab 跳过），导入往返保留（键盘、鼠标各一轮） | 外壳与焦点是通用验收面；可用入口的进出与焦点由 10 的 mission-flow 与本项 interaction-render 覆盖 |
| app-shell-resources：只提供配置接受的已保存包，恢复后打开查看器 | 原处保留，加入 `no-package` 与 `mission-failed` 资格断言 | 资格说明取代演示 |
| app-shell-resources：存储不可用时导入与演示仍可用 | 迁移为存储不可用时导入 `mission-startable`，仅在内存中的完整包仍可开始任务（AC-08） | 演示换成正式任务流程 |
| bootstrap：载入合成应用菜单 | 迁移为载入应用菜单，入口禁用并说明原因 | 启动验收面 |
| compliance-text：权利与隐私文字、菜单次序、文件输入 | 原处迁移：新权利文字、不含 demo，Tab 越过禁用入口到导入 | 声明更新 |
| production-preview：菜单、导入页与合成演示无 CSP 违规 | 迁移为网络审计下的菜单、导入页与任务流程（预置缓存），并检查生产 DOM 无诊断 | AC-15 |
| production-preview：构建只有一个页面、无测试入口与测试支持 | 原处扩展：source map 来源与字符串标记覆盖开发诊断、测量接线、下载入口、演示链 | AC-15、AC-22 |
| production-preview：其余四例（Worker、两种 Worker 回退、缓存恢复与查看/试听） | 不变 | 与演示无关 |
| webgl-unavailable：WebGL 关闭时保留 Core 输入、控件与干净重进 | 迁移：降级说明、列表与两次进出的释放改在查看器上验证（开发与生产）；任务流程可用且没有画布 | 查看器是唯一的 WebGL 表面；viewer-page 只有一次开发访问 |
| webgl-unavailable 中的 `n` 标记命令与 `p` 暂停键 | 删除 | 合成键位与规则；本构建没有游戏键位（P3-05） |
| interaction-render：原生控件、可信移动、Core 结果与同所有者 resize | 拆分：原生控件与非绑定键 → 任务流程的键盘用例；同所有者 resize → 任务画面与查看器画布；可信移动、mover/marker 像素、标记命令与合成画布标签删除 | 后者只验证合成规则或画面；飞行画面的渲染验收归 P3-12 |
| interaction-render：暂停、失焦与换运行清除按住的移动 | 删除 | 只验证合成键盘轴；本构建没有游戏键位，会话的 `clear-input` 由 03 的 Node 测试覆盖，键盘 E2E 归 P3-05 |
| browser-replay：生产 replay 与 Node 一致、拒绝不符与非法版本 | 迁移到正式 Core 的 `replayRecord`/`compareReplayResults` | 正式 Core；浏览器下载录制经 `tools/replay-check.ts` 的核对在 10 的 mission-flow.development |
| joint-pipeline.development：演示与包并行（参照画面、实体与 GPU 计数相同，不显示包内容） | 迁移为每轮从持有的包开始任务并返回，不新建 Worker/音频/画布，状态不变，资源平衡通过；画面哈希与“不显示包内容”删除 | 演示画面是合成的；任务本来就使用包 |
| joint-pipeline.development：三次导入与查看的 GPU 计数 | 不变 | 与演示无关 |
| viewer-page | `frameWindow` 改从 `mission-observations.ts` 导入 | 13 删除 `demo-observations.ts` |
| image-observations：`image()`（合成 mover/marker 颜色）与读 `synthetic-view` 的 `verifyLayout` | `image()` 删除；`verifyLayout` 改读查看器 `viewer-view`，由 interaction-render 的查看器 resize 使用 | 11 的 probe-contract 迁移后不再导入它 |

- **共用 helper：** [browser-test.ts](../../../../../e2e/support/browser-test.ts)（协调者批准的范围）每个用例结束时检查的意外失败 ID 由演示的 `action-error`、`session-error`、`open-demo-failure` 改为正式应用的 `cleanup-failure`、`open-mission-failure`、`mission-open-failure`、`mission-action-error`、`mission-placeholder-failure`（预期出现的 `mission-start-failure` 不列入）。没有删除用例文件，[playwright.config.ts](../../../../../playwright.config.ts) 与 [e2e-configuration.test.ts](../../../../../tools/e2e-configuration.test.ts) 不需改动；browser-replay 仍只属 development。
- **rubber-duck：** 一项阻塞：完成证据尚未记录旧用例去向（本节补齐）。一项非阻塞已采纳：查看器 resize 每次与上一次比较布局与绘制数，而不是都与初始值比较。
- **simplify：** 采纳：去掉 `endPlaceholder` 之前多余的出发位置等待；WebGL 用例把任务流程移出查看器的两次循环，复用 `settleTooling` 与 `openHeldViewer`；查看器诊断轮询取用轮询结果；生产 DOM 诊断检查合为一次页面读取；replay 拒绝用例改为记录与消息一一对应的表，页面导航与 Node 录制并行；存储不可用用例提前生成光盘；`expectNoPlayClaim` 先确认被去掉的说明本身仍是说明。未采纳：把恢复包或进出任务的步骤抽到 `production-cache.ts`/`mission-observations.ts`（10 的文件，不在本项范围）；与 mission-flow.production 共用 `expectNoDiagnostics`（同上）；失败 ID 改为通用约定、产物边界移入构建工具、按所有者比较监听（超出本项范围）；`verifyLayout` 移入 `viewer-observations.ts`（工作范围指定 `image-observations.ts`）；`expectAdvancingTick` 的固定采样窗口（10 的 helper）。
- **文档影响：** 本项写入范围内没有文档。工程约定 [README](../../../../engineering/README.md) 中生产预览一节的“菜单、导入页面与合成演示没有 `securitypolicyviolation`”“产物与 source map 来源不含测试入口、测试支持或合成目录”、WebGL 降级一节的“正常项目必须有实际WebGL2画面”，以及[源码结构指南](../../../../engineering/source-structure.md)对 interaction-render、browser-replay、webgl-unavailable 验收面的描述需按本项更新，归 15 的写入范围，已在 worker 报告中提出。不读取 `local/`，不涉及原版对照。
