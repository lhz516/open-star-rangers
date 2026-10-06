---
type: plan
status: active
phase: P2
task: "06"
subtask: "13"
updated: 2026-10-06
---

# 13 — P2-06 最终对齐验证

**契约来源：** [spec](../spec.md) 的全部 S-01 至 S-14、AC-01 至 AC-21（S-14 与 AC-18 至 AC-21 由 2026-10-06 的修订加入），重点为 AC-11 至 AC-21 与[风险与恢复](../spec.md#风险与恢复)。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。20 是首轮核对后加入的补救子任务，见 [goal 执行记录](../goal.md#执行记录)。

## 工作范围

- **覆盖核对：** 对照 spec、实际导出、测试与 01–12 的完成证据，逐项形成 S/AC 覆盖表。确认[行为与边界](../spec.md#行为与边界)的每一行、[错误码](../spec.md#错误码)的每个 code 与失败边界一览的每一行，都有对应的正负测试或本地证据。
- **不变量核对：**
  - 只有一处调色板查找与最近色实现；[payloads.ts](../../../../../src/original-data/payloads.ts) 中没有 MESH 或 MODL 解析；
  - 机型模型 ID 只来自 P2-09 的绑定，样本 ID 只来自 P2-08 的生产音效表，贴图 ID 只来自生产贴图表；
  - 浮点、绕序、UV 与部件结构原样保留，转换不换算坐标；payload 不承载未确认的含义；
  - 超限与预算拒绝发生在分配之前；共用的 MESH 与 TEX 在一步内只物理读取一次；
  - 步骤失败时没有部分结果；作业失败与取消时没有部分组；全部已发送组共用一个身份；
  - 本任务产生的诊断不含原版字节、条目编号、偏移、文件名或宿主路径；继承的读取错误保持 P2-02/03 的形状；
  - `content/` 不导入 `original-data`；`original-data/conversion/` 只经产品入口取得封包；`workers/` 不使用网络 API；
  - 生产映射的置信度与 U 项与 10、11、12 的研究结论一致。
- **工程检查：**
  - 运行 `pnpm check`、`pnpm test:e2e`（全部项目，含 `e2e/import-worker.spec.ts`）、`pnpm check:original`、文档链接与元数据检查，以及 `node tools/task-state.ts p2/06`；
  - 确认 P2-01 至 P2-05、P2-08 至 P2-10 的测试与浏览器回归保持通过；
  - 依赖清单与锁文件没有变化。
- **提交范围：** 审阅 goal 的全部提交，确认没有原版内容、二进制样本、反编译输出、截图或 `local/` 输出。
- **文档核对：** 以下文档与实现和研究结论一致，`updated:` 已更新：
  - 源码结构、工程约定、工具指南；
  - 原版文档：mesh、textures、unknowns，按需 executable。

  `tasks.md` 只有导航；STATUS 只在阶段摘要或下一步变化时更新。
- **交接核对：** spec 的范围外说明仍然准确：
  - 渲染、坐标换算、纹理过滤与查看器归 P2-11；
  - 视觉保真判定归 P2-12；
  - 光照与玩法语义归 P3；
  - `cockpit-hud-map` 归 P2-07。
- **只核对，不实现：** 本子任务不新增功能代码。发现缺口时，按 execute-goal 的补救流程新增子任务。11、12、14 若为 blocked，本子任务不能完成，等待其恢复条件满足（14 由执行期修订加入，见 goal 执行记录）。

## 不包含

- 新功能、P2-07 的组装、P2-11 的页面接线与 P2 阶段退出评审（P2-13）。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md) 及 01–12 的完成证据。
- `src/content/models/`、`src/original-data/formats/` 的 MESH/MODL 读取、`src/original-data/conversion/` 的模型与贴图模块、[source-error.ts](../../../../../src/original-data/source-error.ts)、[payloads.ts](../../../../../src/original-data/payloads.ts)、`src/workers/`、[import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts)、[nob-check.ts](../../../../../tools/nob-check.ts)、`e2e/import-worker.spec.ts`。
- [源码结构](../../../../engineering/source-structure.md)、[工程约定](../../../../engineering/README.md)、[工具指南](../../../../guides/tools.md)、[阶段索引](../../tasks.md)。

## 验收标准

- [x] S-01 至 S-14、AC-01 至 AC-21 都有对应的实现与验证证据；AC-11 至 AC-14 与 AC-21 的本地证据只含命令、地址、计数与判定。
- [x] 上列不变量全部成立，或已有补救子任务。
- [x] `pnpm check`、全部 E2E、`pnpm check:original` 与文档检查通过；`node tools/task-state.ts p2/06` 的状态与 tracker 一致。
- [x] 依赖清单与锁文件不变；提交中没有原版内容或 `local/` 输出。

## 验证方法

- 逐项审阅与命令输出；必要时请独立审阅者复核覆盖表。
- 浏览器部分按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 的规则复跑。
- 不适用新的原版对照；沿用 09–12 的本地证据。

## 完成证据

2026-10-06 完成。只核对，没有新增功能代码。本子任务的范围原先写成 S-01 至 S-13、AC-01 至 AC-17，早于 2026-10-06 的修订；已按 goal 的覆盖表与依赖补为 S-14 与 AC-18 至 AC-21。

- **首轮未通过与补救：** 首轮核对后的 rubber-duck 审阅指出 AC-16 的诊断隐私不变量不成立：模型步骤与效果步骤各有一条 `invalid-declaration` 原因写出了封包文件名，而测试只核对位置语法。按补救流程，本子任务回到 pending，由 [20](./20-diagnostic-privacy.md) 修正（提交 `cc55a63`），再复跑本子任务。下面是复跑结果。

- **覆盖核对：** 按 [goal 的验收覆盖](../goal.md#验收覆盖)逐项核对，S-01 至 S-14、AC-01 至 AC-21 的实现与验证子任务都为 completed，各子任务的验收勾选全部完成（19 个子任务，0 个未勾选）。

  | 范围 | 证据 |
  |---|---|
  | S-01、S-02、AC-01、AC-02、AC-15 | 01 的 payload 往返与消费辅助测试；源码结构；10 的 mesh 文档 |
  | S-03、AC-03、AC-04、AC-12 | 02 的 MESH/MODL 读取测试；10 的本地全量 nob-check |
  | S-04、S-05、AC-05、AC-06 | 03 的转换与 04 的切片贴图测试 |
  | S-06、S-07、AC-07、AC-08 | 05、06 的步骤、生产引用表、份额与上界测试 |
  | S-08、S-09、AC-09、AC-10 | 05、07 的失败边界逐类断言与 `MessageChannel` 集成；20 的原因文本隐私断言；08 与本次的 E2E |
  | S-10、S-11、AC-11、AC-13、AC-14 | 09 与 19 的本地基准（四个组都 `group-complete`）；11、14 的效果来源研究；12 以 EXE 证据确认最近色规则 |
  | S-12、S-13、AC-16、AC-17 | 20 的诊断隐私补救；本次的工程检查、边界检索与文档核对（见下） |
  | S-14、AC-18 至 AC-21 | 15 的区域 locator；16 的 LE 读取；17 的 payload 与展开；18 的效果步骤、作业与 E2E；19 的本地独立核对 |

  行为与边界、错误码和失败边界一览的每一行，都在 05、07、15–18 的 Node 测试中有正负断言（各子任务证据逐行列出）。
- **不变量：**
  - **单一实现：** 调色板查找与最近色只在 `content/graphics/expand-image.ts`；[payloads.ts](../../../../../src/original-data/payloads.ts) 中没有 MESH 或 MODL 解析。
  - **ID 来源：** 模型 ID 的字面量只有 P2-09 绑定（`craft-binding.ts`）与研究确认的 `model/debris`；样本 ID 只来自生产音效表；贴图 ID 只由生产贴图表生成。
  - **封包读取：** `original-data/conversion/` 不使用 `parseImfat`/`entryData`，只经已验证来源取得封包。
  - **Worker：** `workers/` 不使用网络 API。
  - **层边界：** `content/` 不导入 `original-data`、DOM 或 Three.js，由 `pnpm lint` 与 engineering-boundaries 测试强制。
  - **原样保留与预算：** 浮点、绕序、UV 与部件结构原样保留，超限与预算拒绝先于分配，一步内共用条目只读一次，失败时没有部分结果，各组共用一个身份。这些都由 01–07、15–18 的测试断言。
  - **诊断隐私：** 首轮不成立，20 修正后成立。诊断位置由测试中的语法 oracle 核对；`models…` 与 `effects…` 的原因文本由 `namesPrivateDetail` 核对，不含文件名、路径、十六进制值、条目编号、偏移或字节值。继承的读取错误保持 P2-02/03 的形状。
  - **置信度：** 生产映射的置信度与 U 项与 10、11、12 的结论一致：模型 likely，带 U-022、U-027、U-028；贴图与效果图像 likely，带 U-028（效果另带 U-027）；效果数据 likely，带 U-027。
- **工程检查（2026-10-06）：**
  - `pnpm check` 通过（20 之后为 140 个文件，4,243 个测试，构建成功）；
  - `pnpm test:e2e` 全部项目通过（20 之后复跑，62 个，含 `e2e/import-worker.spec.ts`），P2-01 至 P2-05、P2-07 至 P2-10 的浏览器回归都在其中；
  - `pnpm check:original` 通过（0 个发现）；
  - `node tools/task-state.ts p2/06` 与 tracker 一致。
- **依赖：** `git diff 0198662^ HEAD -- package.json pnpm-lock.yaml .nvmrc` 为空。
- **提交范围：** 自 goal 批准提交 `0198662` 以来：
  - 没有 `local/` 路径、二进制文件或图像、音频、封包与可执行文件；
  - 新增行中没有十六进制转储式的字节序列；
  - 研究文档只记地址、条目号、调色板序号、计数与判定。
- **文档：**
  - 全部受版本控制的文档链接检查有 7 处锚点问题，都是 P1 文档指向 STATUS 中已不存在的“工程骨架”“运行骨架”小节，在本 goal 开始之前就已存在，不在本任务范围内；本 goal 改动的文档没有链接问题，front matter 与 `updated:` 都在。
  - 源码结构、工程约定、工具指南、mesh、textures、executable 与 unknowns 与实现一致。
  - U-027 中“如何导入，待 P2-06 契约修订批准”已过时，已改为已导入并经本地核对。
  - 修正了审阅指出的两处过时证据：
    - [17](./17-effect-payloads-expansion.md) 的已勾选验收改为修订后的 AC-19 措辞，即面的角数为 3 至顶点数，不含模式；
    - [07](./07-import-job-models.md) 与 goal“合入后”条款中的 `ConverterVersion` 补记 P2-07 合入后的值 `osr-import.graphics-2.logic-1.audio-1.models-1`。
  - STATUS 已更新：阶段摘要中 P2-06 已完成，新增 P2-06 摘要，下一步改为批次 6 的 P2-11。
  - `nob-check` 失败行带条目号不算违规，理由见 goal 执行记录：格式早于本 goal，AC-16 对它只要求“只输出结构计数与失败原因”。
- **交接：** spec 的范围外说明仍然准确：
  - 渲染、坐标换算、纹理过滤、贴图坐标与查看器归 P2-11；
  - 视觉保真归 P2-12；
  - 光照、明暗级选择与玩法语义归 P3；
  - `cockpit-hud-map` 归 P2-07，已合入 `main`。

  `nearestColourMap` 的修改属于 P2-05 AC-15 与技术决定 2 允许的范围，没有改变 payload 布局或声明契约。
- **审阅：**
  - rubber-duck 首轮发现一项阻断（诊断隐私），由 20 补救；
  - 两项非阻断（17 的验收措辞、07 的 `ConverterVersion`）已在上面修正；
  - `nob-check` 一项不采纳，理由同上；
  - 复核确认补救与文档修正到位，只要求先完成 E2E 复跑再标记完成，已照此执行。

