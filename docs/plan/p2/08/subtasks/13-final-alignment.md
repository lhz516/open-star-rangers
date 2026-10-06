---
type: plan
status: active
phase: P2
task: "08"
subtask: "13"
updated: 2026-10-05
---

# 13 — 最终对齐验证

**契约来源：** [spec](../spec.md) 的全部 S-01 至 S-12 与 AC-01 至 AC-15；[验证策略](../spec.md#验证策略)、[风险与恢复](../spec.md#风险与恢复)。
**依赖：** 01、02、03、04、05、06、07、08、09、10、11、12、14、15。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

只做验证，不交付新的功能代码。发现缺口时，在 goal 中新增修复子任务（新 ID），插入本行之前并加入本行的依赖。

- **覆盖：** 逐项核对 goal 的[验收覆盖](../goal.md#验收覆盖)，确认每个 S 与 AC 都有对应子任务的完成证据，证据与 spec 当前文本一致。
- **不变量复核：**
  - **转换与原版隔离：**
    - payload 与 locator 分离，`content/` 与 `platform/` 不触及 `original-data`；
    - 原版字节只经产品入口与 `verifySourceMappings` 取得；
    - 自动测试与 agent 浏览器检查只用代码生成的数据。
  - **组的发送与失败：**
    - 组在全部转换与身份计算之后发送；
    - 发送前的失败不发出组，发送后的失败由持有者丢弃已收的组。
  - **诊断：** 不含样本字节、宿主错误文本或私人路径。生产代码中没有 `ConversionError` 或 `conversion` 错误层；SND 转换与音频预算的每个 `SourceError` 产生路径（`invalid-payload`、`unsupported-payload`、`budget-exceeded`）都有测试，并经宿主到达 `source` 层 DTO。
  - **播放：** 隐藏、挂起、失败与释放后没有发声；控制器至多一个上下文；释放从不创建上下文。
  - **研究与生产表：** 研究门槛与生产表一致；没有用近似样本、猜测的解释或槽位顺序命名补齐。
- **工程检查：**
  - `pnpm check`；
  - `pnpm test:e2e audio-playback.spec.ts import-worker.spec.ts --project=development`，以及受配置变更影响的 production 项目回归；
  - `pnpm check:original`；
  - 依赖清单与锁文件相对任务开始时无变化。
- **文档：**
  - 源码结构指南、工程约定与研究记录同步；
  - [阶段索引](../../tasks.md)的导航正确；
  - 变更文档的 front matter、`updated` 日期、相对链接与锚点检查通过；
  - STATUS 只在阶段摘要或下一步变化时更新。
- **人工证据：** 确认 10 的试听判定与 12 的基准核对证据齐全；它们不能由本子任务的自动检查代替。

## 不包含

- 新的功能、测试或研究；缺口一律成为修复子任务。
- push、部署或云资源修改（不在授权范围内）。

## 关键文件与契约

- **只读核对：** 本任务的全部改动与 [goal](../goal.md)、[spec](../spec.md)、[阶段索引](../../tasks.md)、[STATUS](../../../../STATUS.md)。

## 验收标准

- [x] 每个 S-01 至 S-12、AC-01 至 AC-15 都有通过的证据，且与 spec 当前文本一致。
- [x] 上列不变量全部复核通过，并在证据中逐条记录依据。
- [x] `pnpm check`、上列 E2E、`pnpm check:original` 通过；依赖文件无变化。
- [x] 文档链接、元数据与内容检查通过；`git status` 中没有 `local/` 内容、研究输出或原版 payload 被跟踪。

## 验证方法

- 运行上列命令并记录结果；逐项审阅子任务证据与 diff。
- 浏览器检查按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)，只用合成数据。
- 原版相关项只复核 10、12 的既有证据，不重新试听或读取原版数据。

## 完成证据

- **覆盖（S-01 至 S-12、AC-01 至 AC-15）：** 只读审阅对照 goal 的[验收覆盖](../goal.md#验收覆盖)，逐项核对各子任务的验收框与完成证据。
  - **结论：** 每项都有证据，且与 spec 当前文本（含三次执行期修订）一致。早期记录的 `conversion` 层与 `limit-exceeded`，已由 04、14 的后续修订说明与合并提交明确取代。
  - **交给本子任务的三项：** 审阅指出以下三项由本子任务完成，结果见下列各条：S-10 的跨层诊断复核、AC-11 的依赖文件 diff，以及 AC-15 的全部文档检查。
- **不变量复核：**
  - **转换与原版隔离：**
    - [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 的以下回归都在 `pnpm check` 中通过：
      - “original-data dependency boundary”：每个生产消费者都不能到达 `original-data`；
      - “keeps audio playback away from original data and the app, render, ui and workers layers”；
      - “keeps every production module within the low-level capability boundary”：`conversion/` 与 `formats/` 只经产品入口取得字节；
      - “keeps every content and original-data test on code-generated data”。
    - 生产代码中没有 `ConversionError` 或 `'conversion'` 层，已用 grep 确认。
  - **组的发送与失败：** 06 的作业与管道测试证明，组在全部转换、身份计算与发送前校验之后才发送。发送前的失败没有 `group` 消息，包括跨组共享 buffer 的 `checkPackageTransfers` 用例；发送后的失败由持有者丢弃已收的组，`takeGroups()` 为 null。
  - **诊断（S-10）：**
    - **转换：** SND 与音频转换的每个 `SourceError` 位置都经 P2-03 的位置语法检查（audio-conversion.test）；03 证明不回显头部取值。
    - **宿主：** 未知异常转为固定文本的 `internal-error`。import-host.test 有 18 处断言，证明文件名标记不进入消息。
    - **管道与浏览器：** 管道测试证明 SND 错误往返后，标记不出现在通道流量与快照中；Worker E2E 证明标记不出现在快照与 console 中。
    - **播放：** 控制器的结果与快照是封闭形状，测试以精确相等断言；宿主错误只交给 `reportError`。
    - **各 code 的测试：** `invalid-payload` 见 snd、audio-conversion、import-host、import-pipeline；`unsupported-payload` 见 snd、audio-conversion、production-sounds、import-host、import-job、import-pipeline；`budget-exceeded` 见 audio-conversion、conversion-budget、import-host、import-job。
  - **播放：** 隐藏、挂起、失败与释放后没有发声；控制器至多一个上下文，释放从不创建上下文。证据见 07 的 Node 测试与 08 的 Chrome E2E；本次完整 E2E 中的 `audio-playback.spec.ts` 再次通过。
  - **研究与生产表：** 11 的 18 行与 audio 的角色对应、10 的试听判定一致；没有用近似样本、猜测的解释或槽位顺序补齐。12 在基准镜像上的覆盖为 13/13。
- **工程检查（2026-10-05）：**
  - `pnpm check` 通过：114 个测试文件、3,281 个测试，构建成功。
  - `pnpm test:e2e` 两个项目共 58 个全部通过，覆盖 `audio-playback.spec.ts`、`import-worker.spec.ts` 与 production 项目的回归（1c2eb05 改动过 production 项目的忽略列表）。默认端口被另一个工作树的服务占用，因此按工程约定改用 `OSR_E2E_DEV_PORT=4273 OSR_E2E_PREVIEW_PORT=4274`。
  - `pnpm check:original` 通过。
  - **依赖文件（AC-11）：** `git diff 5be8895 HEAD -- package.json pnpm-lock.yaml .nvmrc` 为空，相对任务开始没有变化。
- **文档（AC-15）：**
  - **元数据与链接：** 本分支自身的 18 个提交（`main..HEAD`，不含合并进来的 P2-05 提交）共改动 69 个文件，其中 23 个文档的 `updated` 都是 2026-10-05。链接检查覆盖这 23 个文档，864 个相对链接与锚点全部有效。
  - **导航：** [阶段索引](../../tasks.md)的 P2-08 行链接到 spec 与 goal。
  - **spec：** 审阅标记与当前内容一致，`task-state` 不报告过期。
  - **STATUS：** 已与 P2-08 的完成状态对齐，由修复子任务 [15](./15-status-alignment.md) 完成，见下条“首轮与修复”。
- **人工证据：** 10 的开发者试听判定与 12 的基准核对证据都齐全，本子任务没有重新试听，也没有读取原版数据。
- **范围与原版内容：** 改动只涉及 `src/`、`e2e/`、`tools/` 的边界与配置回归、`eslint.config.js`、`playwright.config.ts` 与文档，没有无关改动。`git ls-files` 中没有 `local/` 内容或原版文件。
- **首轮与修复：** 首轮核对中，上列工程检查、覆盖与不变量都已通过。rubber-duck 指出唯一的阻塞问题：STATUS 的下一步仍把 P2-08 列为批次 4 的待办。按最终对齐的修复规则，本行退回 `pending`，新增修复子任务 [15](./15-status-alignment.md) 处理，并记入 [goal 执行记录](../goal.md#执行记录)。其余审阅项均已核实：
  - 引用的边界测试名都存在；
  - 生产代码没有 `ConversionError`；
  - 跟踪表各行状态正确；
  - STATUS 没有声称 P2-05 已完成，也没有加入退出条件。
- **重跑（15 完成后）：** 15 之后只改了文档，因此重跑了以下检查：
  - `pnpm check` 通过（114 个测试文件、3,281 个测试，构建成功），`pnpm check:original` 通过；
  - 依赖文件相对任务开始仍无变化；
  - 本分支 19 个提交改动的 24 个文档，`updated` 都为 2026-10-05，877 个链接与锚点全部有效；
  - `node tools/task-state.ts p2/08` 结构有效，15 为 `completed`。

  代码自首轮完整的 `pnpm test:e2e`（58 个通过）以来未改，因此 E2E 结论仍然有效。

