---
type: plan
status: active
phase: P2
task: "13"
subtask: "03"
updated: 2026-10-08
---

# 03 — 完整浏览器回归

**契约来源：** [spec](../spec.md) 的 S-02、S-03、AC-03、AC-06、AC-09、AC-10 与 AC-12；[退出条件覆盖](../spec.md#退出条件覆盖)、技术决定 2、4、5。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **发现：** 运行 `pnpm exec playwright test --list`，按项目（`development`、`production`、`development-headed`）记录用例数。181 不是固定目标。
- **执行：** 在干净工作树的当前提交上运行一次 `pnpm test:e2e`（全部项目）。记录以下内容：
  - 提交、Chrome/OS 版本、端口（含 `OSR_E2E_DEV_PORT`、`OSR_E2E_PREVIEW_PORT` 覆盖）与耗时；
  - 各项目的通过、失败、跳过、flaky 与未运行数，并与发现数核对。

  必需用例不能被跳过。
- **退出条件证据：** 按测试名称逐项记录以下用例的结果：
  - **联合闭环与资源平衡：** `joint-pipeline.development`、`joint-pipeline.production`、`joint-resources`、`resource-balance-controls`。
  - **失败矩阵（AC-09）：** `failure-input-content`、`failure-worker-cancel`、`failure-storage-lifecycle` 等。按 P2-12/08、09、10 完成证据中的对应关系，逐行列出 F-01 至 F-14 与 I-1 至 I-7 的断言用例及结果。
  - **网络审计（AC-10）：** `network-audit-controls` 的两个版本，以及受审计的产品用例。记录正向对照看到 Worker 请求、产品用例零意外违规。
  - **生产预览 CSP（AC-10）：** `production-preview`。
  - **主页面响应：** `responsiveness-*`。
- **历史证据适用性（S-03）：** 记录 P2-04 的 `import-worker`、P2-10 的 `resource-cache`、P2-11 的 `import-page`、`viewer-page`、`cache-recovery` 与 `fast-refresh` 在本轮的结果，供 01 的适用性表闭合。
- **浏览器纪律：** 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 核验真实观测与清理：只用隔离的合成 context，不使用个人 profile，不复用未知服务器；结束后停止自有的服务器与浏览器。
- **失败处理（技术决定 5）：** 首次失败保留报告与 trace。只有查明的环境原因（例如端口被占用）可在不改代码、配置与断言的前提下重跑整条命令，并同时记录失败与重跑。原因不明的失败不能以重跑抵消。定位的缺陷交协调者新增修复子任务。

## 不包含

- 修改用例、断言、重试次数或项目配置；新增测试。
- Firefox、WebKit、Safari 与目标设备（P5）；真实数据的浏览器导入（P2-11 AC-21 的适用性由 01 判断）。

## 关键文件与契约

- [playwright.config.ts](../../../../../playwright.config.ts)、[e2e/support/environment.ts](../../../../../e2e/support/environment.ts)、[e2e/](../../../../../e2e/)。
- P2-12 的[失败矩阵](../../12/spec.md#失败矩阵)与[失败不变量](../../12/spec.md#失败不变量)；[08](../../12/subtasks/08-failure-input-content.md#完成证据)、[09](../../12/subtasks/09-failure-worker-cancel.md#完成证据)、[10](../../12/subtasks/10-failure-storage-lifecycle.md#完成证据)、[02 网络审计](../../12/subtasks/02-network-audit.md#完成证据)、[06](../../12/subtasks/06-joint-development.md#完成证据)、[07](../../12/subtasks/07-joint-production.md#完成证据)的完成证据。

## 写入范围

- `dist/**`：pnpm test:e2e 先运行的生产构建（被忽略）。
- `test-results/**`：Playwright 输出与失败 trace（被忽略）。
- `playwright-report/**`：HTML 报告（被忽略）。

## 验收标准

- [x] AC-03：发现数与三个项目的实际执行数相符，必需用例没有被跳过；联合闭环、失败矩阵与网络审计用例都在本轮执行中；任何重跑都符合技术决定 5，并保留首次失败。
- [x] AC-09（E2E 部分）：F-01 至 F-14 每行与 I-1 至 I-7 的断言都有本轮的用例结果。
- [x] AC-10（E2E 部分）：网络审计的正向对照与产品用例都通过，零意外违规；生产预览 CSP 用例通过。
- [x] AC-06（浏览器类别）：P2-04、P2-10、P2-11 的自动用例在本轮的结果已记录。
- [x] AC-12：失败时写明受影响的退出条件、原责任任务与恢复条件；没有时写明“无”。自有的服务器、浏览器与端口已清理。

## 验证方法

- `pnpm exec playwright test --list`；`pnpm test:e2e`；用报告与 `--list` 输出核对计数。
- 浏览器验证按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)；只用代码生成的合成数据，不读原版数据。

## 完成证据

- **提交与环境（2026-10-08）：** 在提交 `13f8625`（goal 分支对本项的认领提交，也是本 worker 分支的基点）上运行，运行前后工作树与索引都干净。`f925d21..13f8625` 共 10 个提交，`docs/`、`.agents/` 与 `AGENTS.md` 之外没有差异（`git diff --stat f925d21 13f8625 -- . ':!docs' ':!.agents' ':!AGENTS.md'` 输出为空）。环境：macOS 26.6（25G72）、Google Chrome 155.0.8059.39（Playwright `channel: 'chrome'`，`bootstrap` 用例的 `environment` 附件在两个项目中都报告该版本）、Playwright 1.63.0、Node 22.22.0、pnpm 12.8.1；配置不变（视口 1280×800、DPR 1、1 个 worker、`retries: 0`、`forbidOnly`）。端口：`OSR_E2E_DEV_PORT=5109`、`OSR_E2E_PREVIEW_PORT=5110`（来源 `http://127.0.0.1:5109`、`http://127.0.0.1:5110`），运行前确认三个分配端口都没有监听；本项没有单独启动 browser-testing 开发服务器，5111 未使用。新建的 worker 工作树没有 `node_modules`，先运行 `pnpm install --frozen-lockfile`（正常完成，锁文件未变）；没有链接 `local/`，全程只用代码生成的合成数据。
- **发现：** `OSR_E2E_DEV_PORT=5109 OSR_E2E_PREVIEW_PORT=5110 pnpm exec playwright test --list`：29 个文件、181 项；`development` 146、`production` 34、`development-headed` 1。
- **执行：** `OSR_E2E_DEV_PORT=5109 OSR_E2E_PREVIEW_PORT=5110 pnpm test:e2e` 只运行一次，退出码 0，总耗时 626 s（构建 1.21 s，Playwright 报告 10.4 min／622.7 s）。负载均值开始时 3.88、结束时 10.86（其他 worker 会话同时运行）。先行的生产构建与 [02](./02-engineering-checks.md#完成证据) 逐字节相同：`index-aXSeUMy4.js` 与 `import-worker-CJmhnkml.js` 的 SHA-256 分别为 `42178e76…939b`、`1dbec5b9…e9d7`，`dist/compliance-inventory.json` 的 `checksum` 为 `0f20977b…1102`。

| 项目 | 发现 | 通过 | 失败 | flaky | 跳过 | 未运行 |
|---|---|---|---|---|---|---|
| `development` | 146 | 146 | 0 | 0 | 0 | 0 |
| `production` | 34 | 34 | 0 | 0 | 0 | 0 |
| `development-headed` | 1 | 1 | 0 | 0 | 0 | 0 |
| 合计 | 181 | 181 | 0 | 0 | 0 | 0 |

  HTML 报告的统计为 `total 181, expected 181, unexpected 0, flaky 0, skipped 0`；每项恰有一个结果，`retry` 均为 0。按文件核对，执行的文件与项目分配和 `--list` 一致。

- **联合闭环与资源平衡：**

| 用例 | 项目 | 结果 | 本轮观测 |
|---|---|---|---|
| `joint-pipeline.development`：三轮真实导入、提交、查看、刷新与校验恢复，演示分开 | development | 通过 | `joint-rounds` 每轮 Worker 阶段为 `ready → identify-source → identified → convert-graphics/logic/audio/models → group ×4 → finished`，状态以“Saved in this browser”与“Mission loads into Core”结束；`canary-arrival` 证明 6 个金丝雀到达各自阶段（文件名到输入；内容文本与 payload 字节到输入、payload 与缓存；payload SHA-256、来源指纹与 manifest 身份到 payload 与缓存），缓存轮次 1–3 |
| `joint-pipeline.development`：同一文档三次导入与查看，暖态 GPU 计数相等 | development | 通过 | 审计完整，无违规 |
| `joint-pipeline.production`：同一 context 三轮，真实 Worker 块拒绝合成文件，一次预置的缓存恢复、渲染、试听并经同源刷新保留 | production | 通过 | 金丝雀到达阶段同上；审计放行项只有 `product`（请求与导航）与 `known-404` |
| `joint-pipeline.production`：一次恢复后同一文档三次查看往返 | production | 通过 | 审计完整，无违规 |
| `joint-resources` | development、production | 各 1 通过 | — |
| `resource-balance-controls`（故意泄漏的检出、干净路径、比较规则） | development、production | 各 3 通过 | — |

- **失败矩阵（AC-09，E2E 部分）：** F-01 至 F-14 每行都在本轮执行并通过（与 P2-12 [08](../../12/subtasks/08-failure-input-content.md#完成证据)、[09](../../12/subtasks/09-failure-worker-cancel.md#完成证据)、[10](../../12/subtasks/10-failure-storage-lifecycle.md#完成证据) 的对应关系相同）。三个 `failure-*` 文件的 46 个用例都带 `failure-row` 注解（前置状态与预期终态），资源平衡报告的问题数均为 0，`browser-errors` 均为 0，网络审计完整且零意外违规（含金丝雀）；`production-preview` 的两个 F-11 用例不带该注解，按其自身断言（import 层失败、不保留包）通过。

| 行 | 用例（文件 › 名称） | 本轮结果 |
|---|---|---|
| F-01 | `failure-input-content` › `F-01 descriptor and image named differently: unchanged` | 1/1 通过 |
| F-02 | `failure-input-content` › `F-02 image one raw sector short of its descriptor: unchanged` | 1/1 通过 |
| F-03 | `failure-input-content` › `F-03 directory record whose extent starts past the image: unchanged` | 1/1 通过 |
| F-04 | `failure-input-content` › 目录记录恰等于限值（`complete-saved`）与超出 1（`unchanged`）；图形 payload 预算恰等于（`partial-unsaved`）与少 1 字节（`unchanged`） | 4/4 通过 |
| F-05 | `failure-input-content` › `F-05 disc the whitelist does not cover: unchanged` | 1/1 通过 |
| F-06 | `failure-input-content` › `F-06 covered file with the whitelisted size and other contents: unchanged` | 1/1 通过 |
| F-07 | `failure-input-content` › `F-07 corrupt mesh on an identified disc: unchanged` | 1/1 通过 |
| F-08 | `failure-input-content` › 被引用贴图缺失（`unchanged`）；跨组声音依赖缺失（`partial-unsaved`） | 2/2 通过 |
| F-09 | `failure-input-content` › 非法内容、组绑定到另一来源、未知类型消息、乱序消息、识别前的组、重复组（均 `unchanged`） | 6/6 通过 |
| F-10 | `failure-input-content` › 完整包但 Core 拒绝其任务（`complete-saved`）；`finished` 但缺组与组不完整（`partial-unsaved`） | 2/2 通过 |
| F-11 | `failure-worker-cancel` › `missing`、`top-level-throw`（`worker-start-failed`），`late-error`、`held-late-error`（`worker-failed`），`job-throws`（`internal-error`）；生产项目另有 `production-preview` › Worker 脚本 404 与被 HTML 回退替换 | 开发 5/5、生产 2/2 通过 |
| F-12 | `failure-worker-cancel` › 五个阶段各取消一次；连续进度时取消并重试；迟到恢复、迟到提交、迟到列出 | 9/9 通过 |
| F-13 | `failure-storage-lifecycle` › 提交 `quota-exceeded`/`storage-unavailable`/`write-failed`（页面反馈）、真实配额、abort 与页面中断、恢复 `not-found`/`cache-corrupt`/`cache-incompatible`、版本与指纹隔离 | 9/9 通过 |
| F-14 | `failure-storage-lifecycle` › 重入、查看器 Fast Refresh、原生有头 Chrome 的真实隐藏与恢复；另有 `fast-refresh`（3）与 `development-headed` 的 `native-lifecycle`（1） | 3/3、3/3、1/1 通过 |

| 不变量 | 本轮断言所在 | 结果 |
|---|---|---|
| I-1 反馈 | 按 P2-12 的适用条件：F-01 至 F-11、F-13 的用例按预先固定的类别、句子与 Layer/Code/Location/Limit，或组状态、部分包说明、任务诊断、缓存失败断言；F-12 只断言取消状态；F-14 断言所有者与资源终态，不涉及固定反馈字段 | 全部通过 |
| I-2 状态 | 46 个用例按注解中的前置与预期终态断言持有的包；导入、提交与恢复类用例另比较存储记录（具体到每行的比较方式见 P2-12 08、09、10 的完成证据） | 全部通过 |
| I-3 Worker | 全部 46 个用例的资源平衡报告（Worker 构造、作业与终止），问题数 0 | 全部通过 |
| I-4 登记 | 同上，监听、观察器、画布、帧、音频与缓存键回到菜单基线或合法活动基线 | 全部通过 |
| I-5 可继续使用 | disc：F-01、F-02、F-03、F-04 超限；source：F-05、F-06；content：F-09 非法内容（这 7 例都有第 4 次平衡检查，即行后的新作业）；import：F-11 全部 5 例；缓存：F-13 恢复失败 3 例；取消：F-12 连续进度 | 全部通过 |
| I-6 隐私 | 导入文件的用例检查页面文本与标记、控制台和平衡快照不含文件名或异常标记；F-14 真实隐藏用例检查原生页面无错误、平衡快照不含标记；F-14 Fast Refresh 不导入文件。46 个用例的审计金丝雀都零命中 | 全部通过 |
| I-7 响应 | F-11：`held-late-error` 的 `input-order the row` 与 `input-order the retry` 附件；F-12：五个阶段取消与连续进度的 `input-order` 附件；另有 `responsiveness-busy-worker` | 全部通过 |

- **网络审计（AC-10，E2E 部分）：** 75 个用例带 `network-audit` 附件（开发 61、生产 14）。
  - **正向对照：** `network-audit-controls` 在两个项目各 6 例、`network-audit-controls.development` 2 例，全部通过。“专用 Worker 的请求归 Worker”的用例在两个项目都断言金丝雀命中的发起者为 `worker`。弹窗与 Service Worker 两例按设计产生证据缺口（`complete: false`，各 3、4 个缺口），由 `expectGaps` 预期；全部对照的违规都属预期违规，`unexpectedViolations` 为 0，未出现的预期违规为 0。
  - **网络审计对照以外的 61 例：** 产品与行为用例 53 例（联合闭环 4、失败矩阵 46、繁忙 Worker 1、`production-preview` 的两个 Worker 故障用例），以及响应探针对照 8 例。每例 `complete: true`，违规 0、证据缺口 0、未出现的声明请求 0。
- **生产预览 CSP（AC-10）：** `production-preview` 6/6 通过。用例覆盖：
  - 真实导入 Worker 在策略下作为 `/assets/` 的哈希模块脚本运行；
  - Worker 脚本 404 与 HTML 回退；
  - 菜单、导入页与合成演示无 `securitypolicyviolation`；
  - 在策略下恢复缓存、渲染与试听；
  - 构建只含一个页面，没有测试入口、测试支持或合成目录。
- **主页面响应：** `responsiveness-controls` 两个项目各 4/4、`responsiveness-busy-worker` 1/1 通过。
  - **对照：** 超过 50 ms 的主线程阻塞（含在窗口关闭时结束、由页面打开窗口两种）各检出 1 个长任务（最长 120 ms）；空闲与 25 ms 阻塞为 0 个；Long Tasks API 不可用或记录未送达时探针失败而不报告 0。
  - **繁忙 Worker：** 事件顺序为可信点击被处理后有帧，随后可信取消立即进入 `status:import:cancelled`。
  - **实际窗口（Long Tasks API）：** 长任务全部为 0。

| 窗口 | 项目 | 次数 | 耗时 | 长任务 | 最大帧间隔 |
|---|---|---|---|---|---|
| 导入到终态 | development | 6 | 857.5–953.9 ms | 0 | 82.1 ms |
| 提交到终态 | development | 6 | 273.8–564.2 ms | 0 | 17.7 ms |
| 恢复到重新校验 | development | 3 | 76.9–85.3 ms | 0 | 19.7 ms |
| 识别到终态 | production | 3 | 126.4–128.5 ms | 0 | 17.3 ms |
| 缓存恢复 | production | 4 | 71.5–86.2 ms | 0 | 18.6 ms |

- **历史证据适用性（S-03，供 01）：** 下列用例只属开发项目（生产项目配置排除它们），本轮在构建输入与 02 相同的候选上全部通过：

| 来源 | 用例文件 | 本轮结果 |
|---|---|---|
| P2-04 | `import-worker` | 16/16 通过 |
| P2-10 | `resource-cache` | 18/18 通过 |
| P2-11 | `import-page` | 12/12 通过 |
| P2-11 | `viewer-page` | 12/12 通过 |
| P2-11 | `cache-recovery` | 3/3 通过 |
| P2-11 | `fast-refresh` | 3/3 通过 |

  这些用例只证明自动部分；P2-11 AC-21 的用户实机核对是否仍适用由 01 判断。

- **失败与重跑（AC-12）：** 无。全量命令首次运行即通过，没有重跑、跳过、重试、补丁或新增修复子任务，因此不涉及受影响的退出条件、原责任任务或恢复条件。
- **浏览器纪律与清理：**
  - **隔离：** 普通浏览器用例使用 runner 在 Playwright 自有浏览器进程中新建的隔离 context。自行启动浏览器的用例各自管理所拥有的资源：
    - 持久 profile 用例（`resource-cache`）使用测试自建的临时目录，结束后删除；
    - 原生或自定义启动（`native-lifecycle`、F-14 真实隐藏、音频可见性、网络审计的 CDP 目标、WebGL 关闭的浏览器）用 CDP 自建 context 或独立启动，并在 `finally` 中关闭。

    没有使用个人 profile。
  - **服务器：** 配置为 `reuseExistingServer: false` 且 `--strictPort`，因此没有复用未知服务器。
  - **清理：** 运行结束后，5109、5110、5111 没有监听；没有残留带 Playwright 临时 profile 的 Chrome 进程，也没有本工作树的 Vite 进程，临时目录中没有残留的 `osr-p2-10-profile-*`。本机常驻的 `@playwright/mcp` 进程不属于本项，未触碰。
  - **源码还原：** F-14 与 `fast-refresh` 的源码编辑已还原，`git status` 没有 `src/` 改动。
- **被跟踪文件：** 运行后 `git status --porcelain` 为空。`--ignored` 只列出 `dist/`、`playwright-report/`、`test-results/`（写入范围内）与依赖恢复产生的 `node_modules/`。本提交只更新本文档的验收勾选与完成证据。
- **Rubber-duck：** 审查本文档的完整差异与原始日志、`--list` 输出及 HTML 报告附件，没有阻塞问题；计数、F/I 映射、I-5 六类与 I-7 覆盖、历史用例计数、时长与 AC-12 都与原始记录一致。采纳三条非阻塞意见：
  - 审计用例中分出 8 个响应探针对照，产品与行为用例为 53 例；
  - `failure-row` 注解限于三个失败文件的 46 例，I-1、I-2、I-6 改为按适用条件描述；
  - 浏览器隔离按普通 context、持久 profile 与自行启动分别记录。

  另一条建议是保留运行前检查的原始输出。依赖恢复改为只记“正常完成”；运行前端口检查保留（`lsof` 未发现监听），其中 5109、5110 另由 `--strictPort` 启动成功证明可用。
- **文档影响：** 核对了[工程约定](../../../../engineering/README.md)的 E2E 命令与端口覆盖说明，以及 browser-testing 的清理要求，仍与本轮一致；没有新的原版事实、未知项、ADR 或接口变化，无需更新文档。本项没有实现代码，不需要 simplify。对 STATUS 与阶段索引没有改动建议。
