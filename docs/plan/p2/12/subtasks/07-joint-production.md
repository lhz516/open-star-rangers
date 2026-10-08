---
type: plan
status: active
phase: P2
task: "12"
subtask: "07"
updated: 2026-10-07
---

# 07 — 生产项目联合闭环与回退审计

**契约来源：** [spec](../spec.md) 的 S-02（生产项目）、S-03、S-05（识别与恢复窗口）、[联合闭环](../spec.md#联合闭环)；AC-03、AC-04 与 AC-05 的生产部分、AC-08 的生产回退部分、AC-10。
**依赖：** 01, 02, 03, 04, 05。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **联合闭环（计划新增 `e2e/joint-pipeline.production.spec.ts`）：** 同一空的隔离 context，3 轮，全程记录 `securitypolicyviolation`（参照 [production-preview.spec.ts](../../../../../e2e/production-preview.spec.ts)）：
  1. 导入带金丝雀的生产尺寸合成文件，真实 `/assets/` Worker chunk 报告 `source`/`unsupported-version` 后终止；本次结果不持有资源，已有包保留不变。
  2. 只在第一轮识别失败后用 05 的带标记变体经 `seedProductionCache` 预置一次（`add`，不得重复插入同键），刷新以重新列出缓存；之后各轮保留该缓存。未持有包时经菜单恢复；已持有包时先验证识别失败不改变它，再直接查看。
  3. 查看 6 类、试听 4 个角色、返回；释放检查后同源刷新，再恢复、查看、返回；刷新前后完整内容身份、payload 指纹、已知像素与任务摘要相同。
  - 同文档内连续 3 次缓存恢复后的查看往返：暖态 GPU 计数相等，退出后自有资源为 0。
  - 实际窗口：识别作业与缓存恢复各自测量，长任务数为 0。
  - 不宣称生产导入的成功路径已由合成文件覆盖。
- **回退审计：** 修改 [production-preview.spec.ts](../../../../../e2e/production-preview.spec.ts)，让 Worker 脚本 404 与被回退为 HTML 两个用例使用 02 的审计夹具，测试专用的失败请求逐条声明；其余断言与精确诊断匹配不变。

## 不包含

- 开发项目闭环（06）；开发项目的 Worker 故障（09）；真实 SWA 响应头与回退（P5）。

## 关键文件与契约

- [production-cache.ts](../../../../../e2e/support/production-cache.ts) 的 `seedProductionCache`；[preview-csp.ts](../../../../../tools/preview-csp.ts)；[synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 的 `productionSizedFiles` 及 05 的带标记变体。

## 写入范围

- `e2e/joint-pipeline.production.spec.ts`：生产项目联合闭环。
- `e2e/production-preview.spec.ts`：回退用例启用审计。

## 验收标准

- [x] AC-03：3 轮全部通过；识别失败不替换已有包；预置只发生一次；6 类画面、4 类试听、刷新恢复与任务诊断一致；无意外 CSP 违规或控制台错误。
- [x] AC-04（生产）：每轮刷新前释放证据成立；同文档往返 GPU 暖态计数相等。
- [x] AC-05（生产）：识别与恢复窗口的长任务数为 0，记录完整。
- [x] AC-08（生产回退）：404 与 HTML 回退用例在审计下通过，测试专用请求单独声明。
- [x] AC-10（本用例）：审计零意外违规，满足生产允许集。
- [x] `pnpm typecheck`、`pnpm lint` 与 `pnpm exec playwright test e2e/joint-pipeline e2e/production-preview --project=production` 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)：生产项目先构建（`pnpm build`），合成数据、隔离 context。
- 不涉及原版对照。

## 完成证据

- **2026-10-07 — 实现（本机 Chrome 155.0.8059.39、Playwright 1.63.0、Node 22.22.0、macOS 25.6 arm64 Apple M2 8 核 16 GiB，无头，1280×800，DPR 1；生产预览带拟定 CSP；只用合成数据）：**
  - **联合闭环（[joint-pipeline.production.spec.ts](../../../../../e2e/joint-pipeline.production.spec.ts)，按 01 的文件名只进生产项目，`--list` 核对）：** 同一空 context 3 轮，全程用 02 的审计 `test`。每轮：导入 05 的 `canaryProductionFiles()`，真实 `/assets/import-worker-*.js` 模块 Worker（`viteWorker: false`）报 `source`/`unsupported-version`，Worker 消息为 `ready`…`progress/identify-source`…`failed`、同一作业、恰好终止一次；导入页无状态、组与保存；页面文本无文件名与内容标记。第 1 轮回菜单为“None in this browser”且缓存为空；之后才以 `seedProductionCache(page, await canaryPackage())` 预置一次（`add`），刷新后经菜单恢复。第 2、3 轮开始时已持有上一轮恢复的包：失败后菜单仍为“Resources are held in this page”、状态列表逐字相同，缓存仍恰为同一个包，再直接查看。每轮刷新前后各查看一次：查看器身份行等于 Node 侧预置包的 `manifestIdentity` 与转换器版本（manifest 身份哈希了完整身份基础与每个 payload 身份），任务行等于 `missionLines(diagnoseMission(...))`；模型（`enemy-ship`）、效果（导弹或带贴图碎片中第一个有不跨接缝贴图中间色样本的视图）、图像、调色板、布局、字库各一项像素与 Node 预期逐字节一致（二维另加一个非棋盘格的不透明纹素）；火力、导弹、爆炸、Warp 各点一次 Play：载入时为全部 18 个声音建立的 AudioBuffer 与 Node 从 payload 格式独立换算的采样逐值相等，每次点击启动的声音源恰好播放该角色自己的缓冲（测试侧记录 `start()` 的缓冲），声音结束后连接数回到 0，再“Stop all sounds”后声部为 0。刷新前后身份、任务行与全部像素读数 `toEqual`。存储的包记录在预置后与结束时的完整 `ContentIdentity` 及逐 Asset payload 指纹均等于 Node 预期。每个文档的 CSP 响应头等于 `PREVIEW_CONTENT_SECURITY_POLICY`，每次刷新前与结束时 `securitypolicyviolation` 为空；`browser-test.ts` 的控制台/请求错误零意外。
  - **同文档往返（同文件第 2 个用例）：** 预置、刷新、恢复一次后，不刷新连续 3 次查看 6 类并试听 4 个角色：每项暖态 GPU 计数与本文档第一次相等（`balance.warm`）；每次返回后资源平衡零差异，第 n 次后恰有 n 个画布脱离文档且上下文已丢失、n 个 AudioContext 为 `closed` 且 `close()` 已兑现，Worker 为 0。
  - **资源平衡（AC-04）：** 用 04 的 `ResourceBalance`：每个文档以菜单为基线；每次识别失败、恢复与查看返回后 `check`；包键集合按 `expectedPackage(PRODUCTION_KEY, seeded.groups)` 核对（无孤儿、无缺失）；每次刷新前 `beforeReload` 保存释放证据，刷新后 `rebaseline`。3 轮用例共 5 个文档、4 次同源刷新。
  - **响应（AC-05）：** 03 的探针在每个文档脚本前安装。3 轮用例测量识别 3 次（开始导入到失败终态且 Worker 已终止）与缓存恢复 4 次（点击到“restored and verified”与“Mission loads into Core”），逐个附件并断言长任务为 0。simplify 后一次：识别 138–289 ms，恢复 80–103 ms，最大帧间隔 ≤ 30.1 ms；历次运行识别 105–820 ms、恢复 75–456 ms，均为 0 个长任务，可见性均为 `visible`。
  - **网络审计与金丝雀（AC-10）：** 预置后登记 `productionCanaries(seeded)` 的 6 个标记，并在 Node 证明输入（3 轮用例）、payload 与缓存到达，附件 `canary-arrival`。附件 `network-audit`：3 轮用例 `complete: true`，覆盖页面 1、Worker 3，放行 product 请求 18、导航 5、favicon 已知 404 5，违规与缺口为 0；同文档用例页面 1，违规与缺口为 0。
  - **回退审计（[production-preview.spec.ts](../../../../../e2e/production-preview.spec.ts)，AC-08）：** 404 与 HTML 回退两个用例改用审计 `test`，各以 `audit.declare` 声明被页面路由替换的 `GET /assets/import-worker-*.js` 及其预期状态（404 / 200），并登记文件名标记；其余断言与 `expectDiagnostic` 精确匹配不变。审计附件均为 `complete: true`、Worker 1、test 请求 1、违规与缺口 0、无缺失声明。反证：把声明状态临时改为 +1，两个用例均以 `declared-outcome` 违规失败（已还原）。
- **机制修正（实测暴露）：** 元素截图、`boundingBox()`、`allTextContents()` 与 `check()` 会在主世界创建 Playwright 注入脚本并留下 13 个 window 监听（`test` 组），资源平衡如实报告。本用例改用页面内矩形裁剪的 `page.screenshot` 读像素（解码同 `bufferPixels`）、`page.evaluate` 读列表文本、单选用点击；没有放宽平衡规则。
- **长任务定位：** 曾在同文档用例的恢复窗口观测到 1 个 61–110 ms（归属 `self`）的长任务，紧接 3 轮用例后与重负载下单独运行均出现，轻负载下单独运行 2/2 未出现，与机器负载相关（本机同时有其他 worker 的 E2E）。CDP trace 显示该任务是点击的输入任务：主线程 CPU 时间只有 2.5–3.7 ms，以 `AnimationFrame::Render` 开始后等待 60–72 ms 才派发点击（`EventDispatch` 0.3–0.5 ms）；恢复自身的校验任务在其后，墙钟 24–35 ms、CPU 23–32 ms。只在 context 创建后一两秒内的首次恢复出现：先点一次无关标题无效，让该用例先空闲 4 s 则 2/2 消失；3 轮用例的恢复都在 context 开始数秒后，从未出现。因此 AC-05 的识别与恢复窗口取 3 轮用例的 7 个，同文档用例（AC-04）的恢复不再测量并在用例注释中写明原因；门槛未改，任何记录都未被过滤。另：最初同文档用例也生成生产尺寸文件，已去掉（该用例不导入）。
- **验证：** `pnpm typecheck`、`pnpm lint` 通过；`pnpm check` 通过（154 个 Vitest 文件 4589 项与构建）；`OSR_E2E_DEV_PORT=5121 OSR_E2E_PREVIEW_PORT=5122 pnpm exec playwright test e2e/joint-pipeline e2e/production-preview --project=production` 在最终代码上 8/8 通过 3 次（此前同一组合在 simplify 前 2 次）。`package.json`、`pnpm-lock.yaml` 未变，`e2e/support/` 未改。
- **不宣称：** 合成文件在生产作业中只能识别失败（spec 技术决定 1），本用例不覆盖生产导入的成功路径；那归开发项目（06）。
- **Rubber-duck：** 1 项（阻塞）已处理：4 个角色的试听原先只证明“建立了全部缓冲”与“启动计数增加”，不能证明点击的是该角色自己的声音；改为测试侧记录每次 `start()` 的缓冲并逐个比对，且等待其结束释放。审阅认可同文档用例去掉生产尺寸文件生成。
- **Simplify：** 截图以 base64 而非数字数组传入页面；AudioBuffer 在页面内切片后再传回；身份与任务行一次读取；Worker 终止轮询只取终止次数；缓存的 6 项预期增加布局不变断言。未采纳：复用 `soundChannelData`（预期须独立于被测换算）；记忆化 RGB 映射与释放闭包（量小，只在用例生命周期内）。建议协调者：在 `e2e/support/` 层让资源平衡识别 Playwright 自身的主世界监听、让 `bufferPixels` 不触发它们，并让音频探针暴露已启动缓冲（超出本子任务写入范围）。
- **文档影响：** [工程约定](../../../../engineering/README.md#本地浏览器-runner)中 production-preview 回退用例的说明应补“在网络审计下运行、测试请求单独声明”，并记录生产联合用例与上述 Playwright 主世界监听的注意事项，归 25；本地导入指南、源码结构与 `docs/original/` 无需改动（无产品或原版事实变化）。

