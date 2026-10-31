---
type: plan
status: active
phase: "P3"
task: "16"
subtask: "09"
updated: "2026-10-31"
---

# 09 — 完整浏览器回归

**契约来源：** [spec](../spec.md) 的 S-03、AC-04、[技术决定](../spec.md#技术决定) 2 与 9。
**依赖：** 04、18、19、20。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在含修复的候选上先运行 `pnpm exec playwright test --list` 记录发现清单，再运行一次 `pnpm test:e2e`，覆盖 development、production 与 development-headed 三个项目。
- **对账：** 发现数与通过、失败、跳过数相符。跳过的只能是按项目设计不运行的用例。P3-15 的联合闭环、生命周期、警告与网络审计用例都在其中且通过。
- 记录浏览器版本、OS、端口、报告位置与本次构建的 `dist` 指纹。
- **失败处理：** 保留首次失败的报告与 trace，并查因。只有查明的环境原因（例如端口占用、锁屏）可不改代码重跑整条命令。`map-picture.development.spec.ts:211` 的旧归因只是线索，失败时同样查因，交 11 或新增修复项。
- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 核验真实观测与清理。

## 不包含

- 真实内容运行（06）；渲染风险的聚焦复现（11）。

## 关键文件与契约

- [playwright.config.ts](../../../../../playwright.config.ts)、`e2e/`。

## 写入范围

- `dist/**`：`pnpm test:e2e` 的生产构建（被忽略）。
- `test-results/**`：Playwright 输出与失败 trace（被忽略）。
- `playwright-report/**`：HTML 报告（被忽略）。

## 验收标准

- [x] AC-04：`--list` 与执行报告逐项对账，三个项目的应路由用例全部执行并通过；必需用例没有被跳过。
- [x] AC-04：联合闭环、生命周期、警告与网络审计用例在列且通过，网络审计零意外违规。
- [x] 失败与重跑符合技术决定 9，首次失败已保留。
- [x] 自有服务器与浏览器已关闭。

## 验证方法

- `pnpm exec playwright test --list`、`pnpm test:e2e`；对账表与报告路径。

## 完成证据

- **候选：** 提交 `e1910f04`（goal 分支 `main` 上 06 的提交，代码含 04、18、19 及新增的 `e2e/flight-sprite-scaling.development.spec.ts`、20 的 map-picture 记录器修复），`src` 树 `21e68310cf43eae58b863d4b3b12b318c3d489e5`，与 [08](./08-engineering-checks.md#完成证据) 的候选相同。两次运行前后 `git status --porcelain --untracked-files=all` 都为空，没有改动代码、配置或断言。
- **环境：** macOS 26.6（25G72），Google Chrome 156.0.8078.74（`channel: 'chrome'`，未设 `OSR_E2E_EXECUTABLE`），@playwright/test 1.63.0，Node v22.22.0，pnpm 12.8.1。端口：`OSR_E2E_DEV_PORT=5127`、`OSR_E2E_PREVIEW_PORT=5128`，开始前两端口都无监听。报告在 ignored 的 `playwright-report/index.html`，失败 trace/截图在 `test-results/`。
- **发现清单：** `pnpm exec playwright test --list` 退出码 0，`Total: 311 tests in 53 files`：development 250、production 60、development-headed 1。数字取自本次清单，不沿用 297。
- **第一次 `pnpm test:e2e`（00:32:17–01:12:51 PDT，40.5 分钟）：** 退出码 1。298 通过、4 失败、9 跳过，共 311。开始时负载均值 2.40 / 3.32 / 18.71（1/5/15 分钟），结束时 4.21 / 4.51 / 5.36，运行中 00:44 的 1 分钟值短暂达到 13.27。
  - **失败：** 都在 development 项目，都是自行启动 headed 本机 Chrome 的真实隐藏用例：`ai-wingman.development.spec.ts:472` 与 `base-interaction.development.spec.ts:377`（`CDP Runtime.evaluate timed out`）、`audio-playback.spec.ts:86`（`Trusted unlock timed out`，最后观测 `visibility: "hidden"`，`visibilityEvents: ["hidden"]`）、`failure-storage-lifecycle.development.spec.ts:981`（`Audible loop timed out`，最后观测同样从一开始就是 `hidden`、`audio-locked`）。
  - **原因（环境，已确认）：** 开始时屏幕已锁定。启动记录中 `CGSSessionScreenIsLocked` 为真，锁定时间与电源日志里前一晚 21:18:25 的 `Display is turned off` 一致。电源日志在 00:44:02 记录 `Display is turned on`。01:05 复查时锁定键已消失，`IOConsoleLocked` 为假，HID 空闲 1,035 秒，即约 00:47 有人工输入。四个失败分别出现在 00:33:12、00:33:29、00:34:26、00:39:36，都在解锁前，症状与 [P3-14/27](../../14/subtasks/27-documentation-handoff.md#完成证据) 的锁屏失败相同：headed 窗口一开始就是 `hidden`，不渲染。本次全部 9 个 headed 用例中，解锁后运行的五个都通过：`joint-lifecycle.development.spec.ts:222`（#131，00:47:41 开始）、`keyboard-input.development.spec.ts:190`、`mission-flow.development.spec.ts:847`、`mission-result.development.spec.ts:431`、`native-lifecycle.spec.ts:101`（development-headed）。解锁前运行的 headed 用例全部失败，解锁后全部通过；没有其他失败。因此这是环境原因，不是产品或测试缺陷。上述锁屏查询、电源日志摘录与时间点都与首次失败材料一起保存。
  - **保留：** 第一次运行的完整输出、HTML 报告，4 个失败各自的 `error-context.md` 与 `trace.zip`，以及其中 3 个的失败截图（`audio-playback.spec.ts:86` 没有失败截图），另含当次其他用例的附件目录，在第二次运行前已复制到本 worker 会话的产物目录（仓库外，不提交），可交协调者查看。
- **第二次 `pnpm test:e2e`（01:13:13–01:53:53 PDT，40.6 分钟）：** 按[技术决定 9](../spec.md#技术决定)，在证实环境原因并解锁后不改代码、配置或断言，重跑整条命令一次。外层用 `caffeinate -d -i` 阻止显示器空闲休眠，以免运行中再次锁屏。这只影响运行环境，没有改测试命令。退出码 0：**302 通过、0 失败、9 跳过，共 311**。每 30 秒采样一次锁屏状态，共 82 次，全部未锁定。1 分钟负载开始 3.43、结束 4.53，运行中在 3.12–10.27 之间。没有加重试、删用例或放宽判据。
- **逐项对账（第二次）：** 按“项目 + 文件:行:列 + 标题”把 `--list` 与执行输出逐条匹配，两边都是 311 条，没有缺失或多出的条目。

  | 项目 | 发现 | 通过 | 失败 | 跳过 |
  |---|---:|---:|---:|---:|
  | development | 250 | 248 | 0 | 2 |
  | production | 60 | 53 | 0 | 7 |
  | development-headed | 1 | 1 | 0 | 0 |
  | 合计 | 311 | 302 | 0 | 9 |

  - **跳过只按项目设计发生：** 9 个跳过都来自 `cockpit-lifecycle.spec.ts` 的 `only(build)` 与 `plain.skip`（`${build} build only`）。`production build` 两例（:395、:438）在 development 跳过，在 production 通过。`development build` 六例（:92、:145、:220、:277、:324、:353）与 `development build without Pointer Lock`（:473）在 production 跳过，在 development 通过。没有必需用例只被跳过而不在其应路由的项目中执行。
  - **重点用例：** `flight-sprite-scaling.development.spec.ts`（19）的 5 个宽度、`map-picture.development.spec.ts` 全部 9 例（含 :211、:291）与 `map-picture.production.spec.ts` 5 例都通过，两次运行都没有失败。
- **P3-15 联合用例（AC-04）：** [P3-15/01](../../15/subtasks/01-joint-loop-development.md)、[02](../../15/subtasks/02-joint-loop-production.md)、[03](../../15/subtasks/03-joint-lifecycle-resources.md)、[04](../../15/subtasks/04-warning-end-to-end.md) 各自的用例文件对应以下 8 个用例，都在清单中，两次运行都通过：
  - `joint-loop.development.spec.ts`：:395 成功、:406 失败；
  - `joint-loop.production.spec.ts`：:439、:450；
  - `joint-lifecycle.development.spec.ts`：:118、:176、:222（真实隐藏）；
  - `joint-warning.development.spec.ts`：:213。

  它们都用 `support/audited-test.ts` 的 `audit` fixture，在测试结束时断言网络审计没有意外违规。四个文件都没有调用 `expectViolations` 或 `expectGaps` 豁免任何违规，所以“通过”就是零意外违规。同属联合组的 `joint-pipeline`（development/production 各 2 例）与 `joint-resources`（两项目各 2 例）也全部通过。
- **构建指纹：** 按 [P2-13/04](../../../p2/13/subtasks/04-compliance-artifacts.md#完成证据) 的 `distManifest` 算法：`dist/` 下全部普通文件按路径排序，每行 `<SHA-256>  dist/<路径>`，以换行结尾，再对整个清单取 SHA-256。
  - **结果：** 两次 `test:e2e` 的 `vite build` 都转换 408 个模块，产物清单逐行相同，都是 `sha256:74260a03139057ce9b48f7d30153fc5798f6dfbd9b958a8ddca4829c9315843d`，9 个文件，12,223,935 字节，没有非普通文件。
  - **绑定范围：** 这是本子任务两次构建各自计算的值，恰好与 08 的 `pnpm check` 构建相同（同一源树，构建可重现）。它只证明这两次构建的产物身份，不代替 10 的 `check:compliance` 构建指纹。
- **清理（browser-testing）：** 两次运行的 dev/preview 服务器与浏览器都由 Playwright runner 启动和收尾，headed 用例的 Chrome 由各自的辅助函数关闭。结束后 5127、5128、5129 都无监听，没有残留的 `vite`、`playwright_chromiumdev_profile` Chrome 或 `caffeinate` 进程。锁屏采样脚本已随运行结束退出。本子任务没有另起服务器或浏览器。
- **失败与重跑（技术决定 9）：** 保留了首次失败的报告、trace 与原因；先证实是锁屏这一环境原因，再在环境恢复后不改代码重跑一次。没有删用例、加自动重试或放宽判据。`map-picture.development.spec.ts:211` 两次都通过，没有需要交给 11 的新失败。
- **Rubber-duck：** 审查了本文档差异与清单、两次输出、首次失败材料、对账脚本和指纹清单。没有阻断问题；认为 `caffeinate` 只改变运行环境，不改命令、配置、断言或重试，符合技术决定 9。四个非阻断问题都已修正：补存解锁时间线的原始查询输出；改正截图数量；P3-15 映射直接链接到 P3-15/01–04，不再引用尚无该映射的 07；写明本条审查结论。
- **文档影响：** 只运行检查。[工程约定](../../../../engineering/README.md)已写明 headed 真实隐藏用例需要未锁屏的桌面，锁屏时只能解锁后重跑，本次结果与之一致。命令与项目说明仍准确，不需要更新。
