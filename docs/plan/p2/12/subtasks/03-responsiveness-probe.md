---
type: plan
status: active
phase: P2
task: "12"
subtask: "03"
updated: 2026-10-07
---

# 03 — 主页面响应探针与可控输入

**契约来源：** [spec](../spec.md) 的 S-05、AC-05 与[资源平衡与主页面响应](../spec.md#资源平衡与主页面响应)中的“主页面响应”；本项交付探针、控制样本与可控繁忙 Worker 的输入证明，实际窗口的测量由 06、07 完成，I-7 由 09 使用。
**依赖：** 01, 02。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **探针（计划新增 `e2e/support/responsiveness.ts`）：**
  - 在窗口开始前安装 `PerformanceObserver`（`longtask`）与帧间隔记录；窗口由用例显式开始、结束，结束后等待记录送达再收齐与窗口相交的全部记录，把包移交与校验的同步尾部计入，不在终态刚发布时停止。
  - 长任务以 Long Tasks API 的 50 ms 定义识别；API 不可用或记录尚未送达时报告错误，不报告 0。
  - 输出：操作类型、窗口起止与总耗时、长任务数与最长时长、最大帧间隔（ms），以及浏览器版本、可见性与探针开销说明。
- **控制样本（计划新增 `e2e/responsiveness-controls.spec.ts`，两个项目）：** 窗口内人为阻塞主线程超过 50 ms 时，探针至少报告 1 个长任务；空闲窗口报告 0；模拟 API 不可用时探针报错。
- **可控繁忙 Worker（计划新增 `e2e/responsiveness-busy-worker.development.spec.ts`）：** 经测试入口的 `busy` 场景（[import-worker.test-support.ts](../../../../../src/workers/import-worker.test-support.ts)，测试侧限时、可终止）：
  - 可信点击测试插入的探针控件，处理后至少交付一帧；
  - 再可信点击“Cancel import”，所有者同步进入 `cancelled`，Worker 被终止，之后没有迟到事件更新状态；
  - 记录事件顺序；用例启用 02 的审计并以零意外违规结束。
- 快速完成的正常作业不在此插入第二次点击；实际窗口的门槛由 06、07 断言。

## 不包含

- 开发与生产联合闭环中的实际窗口测量（06、07）；F-11/F-12 中的 I-7（09）。
- 目标设备性能（P5）；改变零长任务门槛（须重新批准 spec）。

## 关键文件与契约

- [import-worker.spec.ts](../../../../../e2e/import-worker.spec.ts) 的 “page stays responsive while the Worker computes” 用例：harness 级的帧与点击顺序参照。
- [app-entry.ts](../../../../../e2e/support/app-entry.ts) 的 `openTestEntry`；02 的 `audited-test.ts`。
- 计划新增的三个文件见上。

## 写入范围

- `e2e/support/responsiveness.ts`：探针。
- `e2e/responsiveness-controls.spec.ts`：控制样本。
- `e2e/responsiveness-busy-worker.development.spec.ts`：可控繁忙 Worker 的输入与取消证明。

## 验收标准

- [x] 控制样本：人为长任务被检出（≥1），空闲窗口为 0，API 不可用时报错而不是 0；两个项目都通过。
- [x] AC-05（可控部分）：繁忙 Worker 运行时，可信点击被处理且之后至少一帧；可信点击取消使所有者同步进入终态、Worker 终止、无迟到更新；事件顺序已记录。
- [x] 该用例的网络审计零意外违规。
- [x] `pnpm typecheck`、`pnpm lint` 与 `pnpm exec playwright test e2e/responsiveness --project=development`、`--project=production` 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 使用合成数据与隔离 context。
- 不涉及原版对照。

## 完成证据

2026-10-07，Chrome 155.0.8059.39（`channel: 'chrome'`，headless，视口 1280×800），macOS 26.6 arm64（Apple M2），worker 端口 5109/5110；全部用合成数据与隔离 context，两个用例文件都用 02 的 `audited-test.ts`，夹具在结束时断言零意外违规、零缺口。

- **探针**（[responsiveness.ts](../../../../../e2e/support/responsiveness.ts)）：
  - 初始化脚本在页面脚本之前安装一个 `PerformanceObserver`，观察 `longtask`（`buffered`）与 `mark`，整个文档有效；`supportedEntryTypes` 缺少 `longtask` 时 `open` 抛错。
  - 窗口由用例 `ResponsivenessWindow.open`/`close` 显式开始、结束（`measureResponsiveness` 包装二者）；页面代码也可在操作开始的同一任务里经 `window.osrResponsiveness.open` 开窗，用例再以 `adopt` 关闭，供测试侧无法精确开始的操作使用。窗口可重叠，有窗口打开时才有测试自有的 rAF 循环。
  - `close` 先等一帧和一个任务，使终态排入的渲染与移交尾部落在窗口内，再固定结束时间；然后打一个 `performance.mark`，等同一观察器交付它（≤2 s）。观察器按排入顺序交付，所以此前结束的长任务都已到达；超时则报错，不报告 0。
  - 记录：操作、窗口起止与总耗时、与窗口相交的长任务（数、最长、逐条）、窗口内帧数与最大帧间隔（起点、各帧、终点之间），以及浏览器版本、机器、起止可见性和探针/CDP 开销说明。`attachResponsiveness` 把记录作为 JSON 附件，附项目名与 headless 设置。
  - `InputOrder`（供 09 的 I-7 使用）插入固定的测试控件，在 `window` 的捕获与冒泡阶段记录点击的 `input`/`handled`（可信标志、当时的导入状态与 Worker 状态），用 MutationObserver 记录导入状态变化，并记录帧，全部在一个页面顺序里；`stop` 移除它加入的一切。
- **控制样本**（[responsiveness-controls.spec.ts](../../../../../e2e/responsiveness-controls.spec.ts)，两个项目都在生产 App `/` 上）：
  - 阻塞 120 ms：1 个长任务（120 ms），最大帧间隔约 123 ms。
  - 阻塞在窗口关闭前结束，仍检出 ≥1 个且最长 ≥115 ms；页面在阻塞任务内自行开窗、由测试 `adopt` 时，该任务也被计入（起点 ≤ 窗口起点），之后再 `adopt` 报错。
  - 空闲 30 帧：0 个长任务，最大帧间隔约 17 ms；25 ms 阻塞：0 个长任务，帧间隔约 30 ms。
  - 两个故障在页面载入后施加，再在页面内安装探针，保证探针看到故障（多个初始化脚本的顺序未定义）：去掉 `supportedEntryTypes` 中的 `longtask` 时，`open` 报 “The Long Tasks API is unavailable…”；`observe` 不交付时，`close` 报 “Long task records were not delivered within 2000 ms…”。
- **可控繁忙 Worker**（[responsiveness-busy-worker.development.spec.ts](../../../../../e2e/responsiveness-busy-worker.development.spec.ts)，开发测试入口 `worker=busy`）：
  - 以 Worker 的 `ready`、`progress:identify-source` 确认作业在运行，并先 `audit.ready()`。
  - 记录到的事件顺序（连续帧合并）：frame → input:Start import → handled:Start import → frame → status:import:starting → frame → status:import:running:identify-source → frame → input:probe → handled:probe → frame → input:Cancel import → status:import:cancelled → handled:Cancel import → frame…；完整条目作为 `input-order` 附件。
  - 断言：两次点击都可信。探针点击时作业仍在 identify-source，其分派后、取消前至少有一帧，且没有其他事件。取消点击的 `input` 时状态为运行、Worker 终止次数 0；同一分派内只有一条状态变为 `import:cancelled`；`handled` 时 Worker 已终止 1 次。之后至少 10 帧且只有帧。
  - 最终探针：仅 1 个 Worker（`busy`，posts 1、jobs [1]、terminations 1），消息都早于终止；页面显示 “Import cancelled after …”，没有资源状态列表，“Start import” 可用，测试控件已移除。
- **检查**：`pnpm typecheck`、对三个文件的 `eslint` 无错误。`pnpm build` 后运行 `OSR_E2E_DEV_PORT=5109 OSR_E2E_PREVIEW_PORT=5110 pnpm exec playwright test e2e/responsiveness --project=development --project=production`：9 passed；`--repeat-each=5` 45/45 passed，事件顺序 5 次相同。`pnpm check` 通过（154 个测试文件、4589 个测试，构建成功）。
- **rubber-duck**：采纳 3 项。
  - 两个故障控制改为载入后施加故障再安装探针。
  - 边界控制改为 ≥1。
  - 新增页面开窗与 `adopt`，供提交这类由页面同步开始的操作使用。

  另外 2 项超出本项写入范围，交给协调者：
  - 06 若要精确测量自动提交窗口，需要测试入口在提交开始时调用 `window.osrResponsiveness.open`。
  - 09 的 F-11 I-7 需要一个可控的“启动后出错”时序场景；`late-error` 在进度后的零延迟定时器里抛错，现有 `hold-*` 只会停在阶段里直到被终止。
- **simplify**：
  - 已做：合并三处页面阻塞循环；去掉冗余的 `during` 标记（`input`/`handled` 之间即同一分派）和重复的 `operation` 字段；只在有窗口时保留长任务，并按仍打开的窗口裁剪；清理 `closing` 集合；点击标签取最近的按钮；用例改为单个查找和一次 Worker 快照。
  - 未做：记录里的总耗时、长任务数与最长时长是本项要求的输出，保留；环境信息逐条保留，单条记录也能独立作为证据；没有改为夹具或可配置的状态读取，以免增加接口；没有用更轻的 Worker 摘要，因为需要改 `browser-probes.ts`，不在范围内。
- **文档影响**：本项只新增测试支持与用例。工程约定中联合用例、审计与响应探针（含“50 ms 门槛只是本机验收”）的说明归 25；`docs/original/` 与 unknowns 不受影响。本项不需要另改文档。

