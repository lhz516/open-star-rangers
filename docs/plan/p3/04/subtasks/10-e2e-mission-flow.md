---
type: plan
status: active
phase: P3
task: "04"
subtask: "10"
updated: 2026-10-10
---

# 10 — E2E：任务流程、离页保护与导出

**契约来源：** [spec](../spec.md) 的[验证策略](../spec.md#验证策略)；AC-08（浏览器）、AC-10（浏览器）、AC-12、AC-16（E2E）、AC-19（浏览器），AC-22 的开发下载。
**依赖：** 08, 09。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `e2e/support/mission-observations.ts`：进入任务、读取只读 `data-owner`/`data-run`/`data-tick`、等待 tick 前进或稳定、读取开发诊断；并迁入 [demo-observations.ts](../../../../engineering/source-structure.md#r8-e2e-演示观察) 中仍被通用用例使用的 `frameWindow` 等 helper（原文件由 13 删除，本项不改其使用者）。
- 计划新增 `e2e/mission-flow.development.spec.ts`（测试入口，01 的合成场景）：
  - 开始资格：没有包、部分包、`loadMission` 失败、`createWorld` 拒绝（留在配置页）与可开始。
  - 完整流程，带与不带僚机各一次：介绍占位（跳过按钮、Enter、Space、Esc 与 3 秒自然结束都覆盖，repeat 与尾事件不推进下一页）→ 配置 → 出发占位（变体标注）→ 飞行（tick 前进、出发时 tick 0）→ 暂停稳定与继续 → 任务菜单（菜单期间不能被旁路继续）→ 重开（新 run、预选上次僚机）→ 返回主菜单（焦点规则）。开发诊断显示玩家与按选择出现的僚机，诊断提交的命令得到带 commandId 的 `not-implemented`。
  - 缺省标注文字（G-01、G-02/1、G-02/2、G-04、G-06、G-07）可见。
  - 离页保护：可信点击开始后真实关闭或刷新出现 Chrome 原生 `beforeunload` 对话框（关闭走 `runBeforeUnload` 路径），取消后同一运行与录制保留；菜单、介绍、配置与 exit 后不出现。
  - 录制导出：开发面板下载录制文件，测试进程以 08 的核对函数与同一合成光盘核对一致；下载资源释放。
- 计划新增 `e2e/mission-flow.production.spec.ts`：用 [production-cache.ts](../../../../../e2e/support/production-cache.ts) 在隔离 context 预置 01 的可开始任务包（版本 4 的完整包，按基线上 P3-03 的 `PRODUCTION_PACKAGE` 转换器版本与限值派生身份与预算），经真实菜单恢复、校验与启动；同样走完整流程（两种僚机、占位、暂停、菜单、重开、返回），只读属性取证；不依赖开发面板。
- 按需扩展 [production-cache.ts](../../../../../e2e/support/production-cache.ts) 与 [app-entry.ts](../../../../../e2e/support/app-entry.ts)。
- 用例在网络审计下运行；不使用合成 visibility 事件或 getter 替换。

## 不包含

- 原生隐藏、资源平衡与 Fast Refresh 的迁移（11）；外壳、合规、生产预览与其余依赖演示用例的迁移（12）；`demo-observations.ts` 的删除（13）。

## 关键文件与契约

- 计划新增：`e2e/mission-flow.development.spec.ts`、`e2e/mission-flow.production.spec.ts`、`e2e/support/mission-observations.ts`。
- 修改：[production-cache.ts](../../../../../e2e/support/production-cache.ts)、[app-entry.ts](../../../../../e2e/support/app-entry.ts)。
- 消费：01 的场景、08 的核对函数、09 的页面与测试端口。

## 写入范围

- `e2e/mission-flow.development.spec.ts`：计划新增。
- `e2e/mission-flow.production.spec.ts`：计划新增。
- `e2e/support/mission-observations.ts`：计划新增的共用 helper。
- `e2e/support/production-cache.ts`：预置可开始任务包。
- `e2e/support/app-entry.ts`：测试入口选项。

## 验收标准

- [x] AC-08（浏览器）：四种不能开始的原因与可开始在页面上正确显示。
- [x] AC-12：开发与生产各走完整流程，两种僚机配置各一次，五种占位结束方式都覆盖，repeat/尾事件不推进；tick 前进、暂停稳定、出发 tick 0、重开新 run；菜单期间不能旁路继续；返回焦点正确；开发诊断的实体与命令反馈正确。
- [x] AC-10（浏览器）：原生 `beforeunload` 对话框只在有运行时出现，取消后运行与录制保留。
- [x] AC-16（E2E）：下载的录制在测试进程中核对一致；AC-22：下载资源释放。
- [x] AC-19（浏览器）：缺省标注可见。
- [x] 无未声明的控制台错误或网络审计违规；`pnpm test:e2e e2e/mission-flow.development.spec.ts --project=development` 与 `pnpm test:e2e e2e/mission-flow.production.spec.ts --project=production` 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 编写与运行，合成内容，隔离 context；记录 Chrome 版本。
- 不适用原版对照。

## 完成证据

- **环境：** Google Chrome 155.0.8059.39（`channel: chrome`，headless，1280×800，像素比 1），Node v22.22.0，V8 12.4.254.21-node.33；开发服务器 `127.0.0.1:5130`，生产预览 `127.0.0.1:5131`（`OSR_E2E_DEV_PORT=5130 OSR_E2E_PREVIEW_PORT=5131`）。全部用例在网络审计（[audited-test.ts](../../../../../e2e/support/audited-test.ts)）与浏览器错误收集下运行，每个用例一个隔离 context，只用合成内容；没有合成 visibility/pagehide 事件，也没有替换 getter。
- **命令：** `pnpm test:e2e e2e/mission-flow.development.spec.ts --project=development` 6 个通过；`pnpm test:e2e e2e/mission-flow.production.spec.ts --project=production` 1 个通过；`pnpm check` 通过（typecheck、lint、245 个测试文件 6,979 个测试、构建）。
- **共用 helper：** [mission-observations.ts](../../../../../e2e/support/mission-observations.ts) 经 `page.evaluate` 读取 `mission-screen` 的 `data-owner`/`data-run`/`data-tick`/`data-position`（不启动 Playwright 主世界脚本，供 11 的资源平衡复用），提供 tick 前进/稳定的页内采样、五种占位结束方式（自然结束以 MutationObserver 记录的位置提交时刻计时，用后断开）、按住键的 repeat 与 keyup 尾事件、缺省标注读取、`beforeunload` 监听计数（既有浏览器探针）、真实离页请求（CDP `Page.reload` 或 `page.close({ runBeforeUnload: true })`，以 `page.on('dialog')` 应答；没有监听时 Playwright 会自行接受 `beforeunload`，`waitForEvent` 不能阻止）、开发诊断读取与命令提交，以及从 [demo-observations.ts](../../../../engineering/source-structure.md#r8-e2e-演示观察) 复制的 `frameWindow`（原文件与其使用者未改，由 13 删除）。[app-entry.ts](../../../../../e2e/support/app-entry.ts) 增加 `seeds` 选项；[production-cache.ts](../../../../../e2e/support/production-cache.ts) 增加 `missionPackage()`（`mission-startable` 作业发出的全部组，每个 worker 进程转换一次），由既有 `seedProductionCache` 以 P3-03 `PRODUCTION_PACKAGE` 的转换器版本、来源指纹与预算重新派生版本 4 的身份并校验完整。

| 验收 | 设置与操作 | 观察 | 结果 |
|---|---|---|---|
| AC-08（浏览器） | 测试入口 `worker=mission-startable` 不导入；分别导入 `mission-partial`、`mission-load-failed`、`mission-create-rejected` | 无包：入口禁用，`data-eligibility=no-package`，说明“No resource package is held…”；部分包：`package-incomplete`，说明含 `audio`；载入失败：`mission-failed`，说明为 `MISSION_SCENARIOS` 的路径与原因；创建拒绝：入口可用，配置页确认后 `mission-start-failure`（`data-kind=rejected`、role=alert，含路径与原因），僚机 0 与无僚机都被拒绝，`data-run` 为空、仍在 config、离页监听 0，返回后焦点在入口；可开始场景 `eligible` 且无原因 | passed |
| AC-12（开发） | 导入 `mission-startable`，`seeds` 三个值 | 运行 1（僚机 1）：介绍以跳过按钮结束；配置页焦点在标题、默认预选第 1 项、6 个标签为纯文本（含 `<b>…</b> & co` 原样，无 `b` 元素）；在 Start 上按住 Enter：第一次按下开始，出发占位上的 3 次 repeat 与 keyup 不结束出发（帧仍为 departure、tick 0，变体 wingman）；出发以新的 Enter 结束，飞行 tick 前进；诊断显示 run 1、种子 1、僚机 1、玩家实体在实体表中、恰有 `wingman#1`；诊断提交的命令得到带 commandId 的 `rejected`/`not-implemented`，事件日志有同 ID 的 `command-result`。暂停：phase paused、pause user，800 ms 内 tick 不变且等于诊断快照 tick；继续后前进。任务菜单：焦点在标题，Esc、p、P、Enter、Space 不继续，tick 不变，命令提交禁用；Continue 后前进。重开：新介绍（run 清空、离页监听 0），按住 Space 结束介绍，repeat 与 keyup 不在配置页开始；预选上次的僚机 1；改为无僚机后 run 2、tick 0、变体 solo，出发以 Esc 结束，诊断为种子 2、无僚机实体。返回主菜单：焦点在 Start mission，无任务画面与离页监听。新所有者：介绍与出发都自然结束（各 ≥ 2,900 ms 的提交间隔），预选无僚机，出发期间 800 ms 内 tick 为 0，诊断为种子 3 | passed |
| AC-12（生产） | 生产预览（CSP 头为 `PREVIEW_CONTENT_SECURITY_POLICY`）预置 `missionPackage()`，刷新后 “Open saved resources” 恢复并校验 | 恢复前缓存可恢复但入口仍为 `no-package`；恢复后状态为完整、已恢复校验、任务可载入，入口可用。同样的流程：运行 1（默认僚机 0，介绍 Esc、出发跳过按钮，变体 wingman，tick 0），暂停稳定、菜单期间按键不继续，重开（按住 Enter 结束介绍不开始；预选 0；无僚机 run 2、solo；按住 Space 结束出发，keyup 不暂停飞行），返回焦点在入口；新所有者两个占位自然结束、预选无僚机、选僚机 4 后出发 tick 0。介绍与两次飞行中都没有开发面板或 `dev-*` 元素，结束时 CSP 违规为 0 | passed |
| AC-10（浏览器） | 可信点击 Start 后，于飞行、暂停、任务菜单中请求离页；于介绍、配置与 exit 后真实刷新 | 介绍、配置、exit 后（以及主菜单）刷新不弹确认（以 `page.on('dialog')` 监听，任何对话框都会被拒绝并使用例失败），监听计数 0；出发、飞行、暂停、继续、菜单中监听计数恰为 1；`page.close({ runBeforeUnload: true })` 出现 `beforeunload` 对话框，取消后页面未关闭、同一 owner/run 继续前进；CDP 刷新出现对话框，取消后同一运行继续；暂停与菜单中同样，取消后 tick 不变、仍在菜单；接受刷新后页面重新载入到主菜单，运行随文档消失 | passed |
| AC-16（E2E） | 取消三次离页后，暂停中经开发面板导出 | 下载文件名 `osr-recording-0338691af2208b10-250413072-54.json`（种子为测试入口给出的值，finalTick 等于暂停 tick）；状态 `requested`；未修改的文件在测试进程中以 `runReplayCheck(path, discPaths, { catalog })`（同一合成光盘的白名单）核对：`passed: true`、`comparison.match: true`、finalTick 54、15 个事件、3 个检查点、身份为生产转换器版本 `osr-import.graphics-4.logic-2.audio-2.models-4`，`exitCode` 0；录制中的 `record.run` 为该种子与僚机 2，finalTick 不小于离页前的 tick，说明录制从运行开始保留 | passed |
| AC-22（开发下载） | 同上，导航前安装只计数的对象 URL 探针 | 下载的 blob URL 已创建并已撤销，文档中没有残留的 `a[download]` | passed |
| AC-19（浏览器） | 各页面读取可见的 `.slice-gap` 标注 | 主菜单 G-07；介绍 G-02/1；配置 G-04、G-07、G-01、G-02/1、G-02/2；出发 G-02/2；飞行 G-01、G-02/1、G-02/2 与状态栏的 G-01 短标签；任务菜单 G-07、G-06。每页每项恰好一次，文字与 `SLICE_GAPS` 一致；配置页的目标与限制标题注明 project text，三段文字与来源列表（Confirmed、Likely）与 `MISSION_OBJECTIVES` 一致 | passed |
| 控制台与网络 | 全部用例 | 无未声明的浏览器错误，网络审计无违规、无缺口 | passed |

- **反证：** 临时把 `page-keys.ts` 中的 repeat 改为结束占位（未提交，已还原），开发完整流程在按住 Enter 后停在 flight 而失败，证明 repeat 断言有效。
- **rubber-duck：** 无阻塞问题。四项非阻塞建议均采纳：缺省标注按可见项计数（不去重）并逐项核对文字；浏览器中核对目标、限制、来源与置信度；飞行、暂停、继续、菜单中离页监听数为 1，并增加菜单中的取消离页；位置记录的 MutationObserver 可断开（`stopWatchingPositions`）。
- **simplify：** 复用 `app-entry.ts` 的 `button`；轮询合并为一个 `poll`；`holdKey` 返回回调结果；命令结果须同时出现在事件日志中；对象 URL 探针移到开发用例；场景光盘每个进程只生成一次、异步写盘；生产用例提前开始转换；僚机标签改为写明的期望值。未采纳：把开发与生产流程合并为一个驱动（两种构建的取证不同，分开更清楚）；用 `waitForFunction` 代替页面读取轮询（会在页面主世界注入轮询，不利于资源平衡）；把 `missionPackage()` 移出 `production-cache.ts`（11、12 的生产用例也需要它）；`src/app/mission/mission.test-support.ts` 的 `missionGroups` 依赖 vitest，不能在 Playwright 中导入。
- **文档影响：** 本项写入范围内没有需要改的文档。工程约定（[README](../../../../engineering/README.md) 的测试入口与生产预置小节）需补充测试入口的 `seeds` 查询键、`missionPackage()`、`mission-observations.ts`、离页确认的取证方法（Playwright 在没有 `dialog` 监听时自行接受 `beforeunload`；`page.reload()` 在取消后等到超时，改用 CDP `Page.reload`）与两条聚焦命令，归 15 的写入范围，已在 worker 报告中提出。

