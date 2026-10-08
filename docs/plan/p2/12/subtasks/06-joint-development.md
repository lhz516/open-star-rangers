---
type: plan
status: active
phase: P2
task: "12"
subtask: "06"
updated: 2026-10-07
---

# 06 — 开发项目联合闭环

**契约来源：** [spec](../spec.md) 的 S-02（开发项目）、S-03、S-05（实际窗口）、[联合闭环](../spec.md#联合闭环)；AC-02、AC-04 与 AC-05 的开发部分、AC-10。
**依赖：** 01, 02, 03, 04, 05。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

计划新增 `e2e/joint-pipeline.development.spec.ts`，使用 02 的审计夹具、03 的响应探针、04 的资源平衡辅助与 05 的金丝雀 fixture：

- **3 轮联合闭环（同一隔离 context）：** 每轮按 spec 的开发步骤：
  1. 菜单 → 导入页面 → 文件选择控件提交带金丝雀的合成光盘 → 开始；真实模块 Worker 经测试入口走完五个阶段的真实转换（不是预制组）。
  2. 阶段顺序由 04 记录的 Worker 消息断言，React 可以合并短暂进度；状态符合 P2-11 的成立条件，任务载入与自动提交无先后要求；不以 `finished` 代替完整性。任务摘要同时等于 fixture 的独立预期与 Node 对同一合成组的诊断。
  3. 查看器中模型、效果、图像、调色板、布局、字库各选一项，已知像素样本误差 0（效果只取不跨接缝的面）；开火、导弹、爆炸、Warp 各一次可信点击试听，音频探针观察到缓冲、开始与停止。
  4. 返回菜单，验证释放（04），并在刷新前保存证据。
  5. 同源刷新 → 菜单显示有缓存（尚未校验）→ 打开已缓存的资源 → 恢复并重新校验；完整内容身份、payload 指纹、像素样本与任务摘要等于刷新前 → 返回菜单。
  6. 启动并退出合成演示，演示不显示也不使用导入的资源。
- **同文档往返：** 不刷新、不重建 App，连续 3 次导入与查看；同一项暖态 GPU 计数相等，退出后自有资源为 0。
- **实际窗口：** 导入（开始到终态）、提交（开始到终态）、恢复（开始到重新校验并载入完成）各自测量；长任务数为 0，记录实际耗时、最长任务与最大帧间隔。不人为拖慢 Worker。
- **网络与标记：** 全程审计零意外违规（HMR 流量单列）；金丝雀到达 payload 与缓存的证明作为附件。

## 不包含

- 生产项目闭环（07）；失败路径（08–10）；目标设备性能（P5）。

## 关键文件与契约

- 复用 [app-entry.ts](../../../../../e2e/support/app-entry.ts)、[viewer-observations.ts](../../../../../e2e/support/viewer-observations.ts) 的像素样本、[audio-playback.ts](../../../../../e2e/support/audio-playback.ts)、[resource-cache.ts](../../../../../e2e/support/resource-cache.ts) 的只读记录，以及 [mission-diagnostics.ts](../../../../../src/app/resources/mission-diagnostics.ts) 的 Node 诊断。
- 参照 [cache-recovery.spec.ts](../../../../../e2e/cache-recovery.spec.ts) 与 [joint-resources.spec.ts](../../../../../e2e/joint-resources.spec.ts)。

## 写入范围

- `e2e/joint-pipeline.development.spec.ts`：开发项目联合闭环。
- `src/app/app-entry.test-support.tsx`：按需在自动提交开始时打开响应窗口的测试入口钩子。

## 验收标准

- [x] AC-02：3 轮全部通过；阶段顺序、状态、6 类像素样本、4 类音频观察、刷新前后的身份/指纹/像素/摘要一致与 fixture 独立预期均断言；合成演示不消费导入包。
- [x] AC-04（开发）：每轮刷新前释放证据成立；同文档 3 次往返 GPU 暖态计数相等、退出后自有资源为 0；包与 payload 键集合准确。
- [x] AC-05（开发）：导入、提交、恢复三个实际窗口的长任务数为 0，记录完整。
- [x] AC-10（本用例）：审计零意外违规，金丝雀到达已证明。
- [x] `pnpm typecheck`、`pnpm lint` 与 `pnpm exec playwright test e2e/joint-pipeline --project=development` 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)：合成数据、隔离 context，结束后清理。
- 长任务超标时保留样本并定位来源，不过滤或放宽；来自应用的超标按 spec 技术决定 15 回到责任任务。
- 不涉及原版对照。

## 完成证据

2026-10-07，Chrome 155.0.8059.39（`channel: 'chrome'`，headless，视口 1280×800），macOS 26.6 arm64（Apple M2，8 核，16 GiB），Node 22.22.0；worker 端口 5118/5119。全部为代码生成的合成数据与测试自有的隔离 context，两个用例都用 02 的 `audited-test.ts`。

- **用例（[joint-pipeline.development.spec.ts](../../../../../e2e/joint-pipeline.development.spec.ts)，开发项目）：**
  - **3 轮联合闭环**（同一隔离 context）：先在空菜单启动并退出一次演示作为“无包”参照。每轮：
    1. 菜单 → 导入页 → 文件选择控件提交 05 的金丝雀光盘 → 开始。测试入口 `worker=canary` 的真实模块 Worker（`/src/workers/import-worker.test-support.ts`，`type: module`，`name: canary`，posts 1、jobs [1]、终止 1 次）运行完整的生产作业。
    2. **阶段与状态：** 探针记录的 Worker 消息合并连续重复后恰为 `ready, progress/identify-source ×19, identified, progress/convert-graphics ×29, convert-logic ×12, convert-audio ×45, convert-models ×76, group ×4, finished`，消息都属本作业、都早于终止。页面内 MutationObserver 记录导入页渲染出的每个状态列表，逐个按 P2-11 阶梯判定且不倒退：`[]` → `Source identified` → `…Held in memory only, Saving in this browser, Mission loads into Core` → `…Saved in this browser (saved in N ms), Mission loads into Core`。任务状态可与“保存中”同时出现，不要求先后。四组均为 `complete`，导入结果为 `identified synthetic-canary`。
    3. **完整性与身份：** Node 用同一作业转换同一光盘并经 `validatePackage` 判为完整。存储的包记录四组的完整 `ContentIdentity` 等于 Node；全部 Asset 的描述指纹与存储 payload 字节在页面内的 SHA-256 都等于 Node 指纹；查看器身份行、条目集合等于 Node。
    4. **任务摘要：** 页面行等于 `missionLines(diagnoseMission(Node 包))`。另由 fixture 自身的 `defaultScenarioSpec`/`defaultCampaignSpec` 独立给出两行：战役组 0、槽 1，以及 9 条声明、3 个编组、3 个生成区域、2 个僚机选项、3 个名称池。页面行与 Node 诊断都须符合它们。
    5. **查看与试听：** 6 类各取一项读回（`model/enemy-ship-1` 带贴图的部件表、`data/missile-visuals` 不跨接缝的贴图视图且下转 0 或 3 步、`image/missile`、`palette/flight/models`、`layout/cockpit/front`、`font/hud/4x6`），像素样本误差 0。载入的 18 个音效缓冲与 Node 解码逐样本相同。开火、导弹、爆炸、Warp（`sound/fire/player`、`sound/missile`、`sound/explosion/player`、`sound/warp`）各一次 Playwright 可信点击：测试侧包装 `AudioBufferSourceNode.start/stop` 并经 `onended` 观察结束，不登记监听。每次点击恰好启动一个源，且源播放的就是该角色的缓冲。点击 Stop 后，源已结束、应用音频节点断开、声部为 0。
    6. **刷新前释放：** 返回菜单，`beforeReload` 通过并保存证据（Worker 恰好终止、AudioContext 已 `closed` 且 `close()` 已 resolve、画布脱离且丢失上下文、监听/观察器/帧回到基线、包与 payload 键集合准确）。
    7. **刷新与恢复：** 同源刷新后显示“Saved resources found in this browser, not yet verified.”，没有“View resources”。`rebaseline` 后打开已缓存资源，状态为 `restored and verified`。存储记录、身份行、条目集合、任务摘要与 6 项像素读回都等于刷新前，并再次通过音频检查与平衡检查。
    8. **演示：** 演示与“无包”参照的实体数、GPU 计数及合成视图截图的 SHA-256 都相同（截图间隔 200 ms 两次相同，证明画面稳定）。页面没有包身份或 Asset ID；演示期间不新增 Worker 或 AudioContext；退出后菜单状态不变，平衡检查通过。
  - **同文档往返：** 不刷新、不重建 App（文档 ID 不变），连续 3 次导入与查看。6 项暖态 GPU 计数逐轮相等（如 `model/enemy-ship-1` [1,1,1]、`data/missile-visuals` [2,1,2]、2D 项 [1,2,1]）。每轮退出后检查通过：Worker 为 `[1,1]×轮数`，AudioContext 均已关闭，画布数等于轮数且都已脱离、丢失上下文，包与 payload 键集合准确。
  - **实际窗口（AC-05）：** 导入窗口从点击“开始”前开窗，到结果出现后关窗。提交窗口由测试入口在提交开始时开窗（见下），用例接管后在“saved”出现时关窗。恢复窗口从点击前到 `restored and verified` 及任务载入状态出现后关窗。Worker 未被拖慢。在 `--repeat-each=3` 的 6 次运行中，导入 0.35–1.96 s、提交 51–553 ms、恢复 75–146 ms，长任务数都为 0；导入窗口最大帧间隔 29–130 ms，提交 17–27 ms，恢复 17–37 ms。每次运行都附 `responsiveness` 记录，含浏览器、机器、可见性（visible→visible）与探针开销。
  - **网络（AC-10）：** 审计接收 05 的全部 6 个金丝雀标记（文件名、内容文本、payload 字节、payload SHA-256、来源指纹、manifest 身份）。每次运行 `complete=true`，覆盖 1 个页面与 3 个 Worker 目标，违规 `{}`、缺口 `[]`，没有未发生的声明请求。HMR 单列为 `toolchain websocket`（每个文档 1 条），收藏夹探测按 `known-404` 单列。输入与 payload 到达在 Node 证明（标记在所选文件中，并在同作业转换出的 payload 与包身份中）。缓存到达每轮在页面 IndexedDB 中证明。`canary-arrival` 附件列出每个标记已证明到达的阶段与轮次。
- **测试入口钩子（[app-entry.test-support.tsx](../../../../../src/app/app-entry.test-support.tsx)）：** 测试安装了 03 的响应探针且 Long Tasks API 可用时，每次 `commit` 在开始时同步调用 `window.osrResponsiveness.open('commit')`，即在导入结束的同一任务内开窗。未安装探针时行为不变。生产模块图不含它。
- **检查：**
  - `pnpm typecheck` 通过；
  - 两文件的 `eslint` 无错误；
  - `OSR_E2E_DEV_PORT=5118 OSR_E2E_PREVIEW_PORT=5119 pnpm exec playwright test e2e/joint-pipeline --project=development`：2 passed；`--repeat-each=3` 6/6 passed，每条约 18–48 s；
  - 回归 `e2e/import-page e2e/cache-recovery e2e/responsiveness e2e/failure-input-content --project=development`：40 passed；
  - `pnpm check` 通过（154 个文件，4589 项测试，构建成功）。首次运行时机器负载均值约 31，`tools/engineering-boundaries.test.ts` 有 1 项失败；单独运行与随后的完整复跑都通过，属负载相关的既有时序问题。
- **Rubber-duck：**
  - **采纳：**
    - 试听逐次核对被启动源的缓冲，并记录 `stop()` 与结束；
    - 18 个缓冲全部逐样本核对；
    - 页面任务摘要另按 fixture 规格独立核对，不只依赖 `missionLines`；
    - 演示加比较视图截图；
    - 刷新前后另比较条目集合。
  - **部分保留，说明如下：**
    - **停止：** 合成音效只有 3–40 帧（11,025 Hz 下 0.3–3.6 ms），72 次试听都在 Stop 点击前自然结束（`stops=0`）。“停止”的证据是源已结束、应用节点断开、声部为 0。在仍在播放的声部上点击 Stop 触发 `stop()` 的路径需要更长的合成音效，即修改 fixture，超出本项范围；P2-08 `audio-playback.spec.ts` 已用循环音效覆盖该路径。
    - **恢复后持有的包：** 持有者在恢复时以 `validatePackage` 逐个核对 payload 的 SHA-256 与描述指纹，并要求键等于预期配置。用例比较的是：同一键下的存储记录（完整身份、全部指纹与字节摘要）、身份行、条目集合、全部音效缓冲与 6 项像素，在刷新前后都等于 Node。直接读出内存中持有包的全部字节需要另一个测试入口钩子，超出本项对该文件登记的用途，已在报告中提出。
    - **任务摘要的阵营、模型引用、坐标轴与单位：** 这些来自转换器的研究映射，fixture 规格不能独立给出，只与 Node 诊断核对。
  - **未采纳：** 提交窗口钩子改为显式开关或自动关闭。新增查询键须改 `tools/e2e-network-policy.ts`，超出范围。目前只有本用例在测试入口安装响应探针；未被接管的窗口只保留测试自有的帧循环。
- **Simplify：**
  - **采纳：**
    - 恢复窗口改用 `measureResponsiveness`；
    - 去掉未用的 `groups`；
    - 读回用例按布局缓存；
    - 试听记录随结果返回；
    - 只读取 `stops` 字段；
    - 两个对象库并行读取；
    - 金丝雀输入与 payload 证明在开头做一次，缓存证明每轮做；
    - 并行准备金丝雀包与文件；
    - 钩子改用具名接口。
  - **未采纳：**
    - 改用 `readStoredRecords`：它需要把缓存模块载入受平衡检查的页面，且只给 FNV 摘要；
    - 收窄状态观察范围、去掉音效样本复制：数据只有几十个样本，开销可忽略。
  - **建议下沉到共享支持**（超出本项写入范围，交协调者）：
    - `settleTooling`：Playwright 首次在主世界执行定位器求值时，会在 `window` 上登记一组捕获监听，归入 `test` 分组，并在该文档内常驻。资源平衡基线须在此之后取得，否则后续检查会报告这些监听。建议由 04 的 `ResourceBalance.start`/`rebaseline` 统一处理，或在 25 的文档中写明；
    - 每个声部的缓冲与停止记录建议并入 `audio-playback.ts` 的音频探针；
    - 轮询接管页面开出的窗口建议并入 `responsiveness.ts`；
    - 带 SHA-256 的包内容读取建议并入 `resource-cache.ts`。
- **文档影响：** [工程约定](../../../../engineering/README.md)“P2-11 测试入口”一节列出了查询参数，尚未提到 05 的 `hold`，也没有本项的提交窗口钩子。联合用例、审计与响应探针的工程说明归 25。本项在测试入口文件头写明了钩子，并在报告中提出给 25 的条目。`docs/original/` 与 unknowns 不受影响，STATUS 与阶段索引无需改动。
