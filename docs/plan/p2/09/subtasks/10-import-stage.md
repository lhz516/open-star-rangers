---
type: plan
status: active
phase: P2
task: "09"
subtask: "10"
updated: 2026-10-08
---

# 10 — 导入作业的 `convert-logic` 阶段

**契约来源：** [spec](../spec.md) 的 S-07（作业中统一写入身份）、S-09、S-11（错误经宿主与持有者到达）、AC-08（作业部分）、AC-10、AC-13（快照与诊断隐私）；技术决定 12。
**依赖：** 03, 09。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **开始前核对：** 确认 P2-05、P2-08 没有已落地的协议版本或阶段变化；若有，在其之上递增，并在证据中说明。2026-10-05 核对时 P2-05 已合入：协议版本为 2，阶段为 `identify-source`、`convert-graphics`。本分支已变基到主线并按 [goal 执行记录](../goal.md#执行记录)对齐。
- **协议：** [import-protocol.ts](../../../../../src/workers/import-protocol.ts) 的 `IMPORT_STAGES` 在 `convert-graphics` 之后追加 `convert-logic`，`IMPORT_PROTOCOL_VERSION` 在合入时的值上递增；其余消息形状与规则不变。
- **阶段顺序：** P2-05 的 `canReportStage` 已规定阶段只按 `IMPORT_STAGES` 顺序前进，识别之后的阶段只在 `identified` 之后出现，宿主与持有者共用这一规则。本任务只为 `convert-logic` 补充测试：
  - [import-host.ts](../../../../../src/workers/import-host.ts) 拒绝识别之前或回退的阶段进度（`internal-error`）；
  - [import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts) 同样拒绝（`protocol-error`）；`readBytes` 的单调与上限规则不变。
- **生产作业：** [import-job.ts](../../../../../src/workers/import-job.ts) 在图形步骤之后：
  - 发送 `convert-logic` 进度（阶段开始一次，之后每次端口读取完成一次），计量继续累计；
  - 作业限值为读取限值加上图形与 logic 两个步骤的份额。以图形步骤的转换用量为起始用量调用 09 的 `convertLogic`；
  - 以 03 的函数对作业发送的全部组草稿推导同一 `ManifestIdentity`，写入每个组清单，再逐组 `report.group`。图形步骤的结果按 P2-05 不组装为组，留给 P2-06/07；
  - 返回值 `usage` 沿用 P2-05 的语义：读取用量加上累计的转换用量。
- **测试注入点：** 与 `open` 和图形步骤一样，logic 步骤只由测试替换（默认是生产转换）。更新受影响的测试支持与用例：
  - `syntheticGroupsJob` 改为只识别、不运行生产转换，保持 [import-worker.test-support.ts](../../../../../src/workers/import-worker.test-support.ts) 的 `synthetic` 场景只发送四个合成组；
  - [import-job.test.ts](../../../../../src/workers/import-job.test.ts) 与 [import-pipeline.test.ts](../../../../../src/app/import/import-pipeline.test.ts) 中“识别后无组结束”的用例，改为使用含合成 `SCENARIO.NOB`/`SR.NOB` 的白名单得到 `logic` 组，或注入空转换并说明理由；
  - 生产白名单拒绝合成光盘的用例保持不变。
- **文档：** 在[源码结构](../../../../engineering/modules/workers.md#导入-worker)中更新协议版本、阶段集合、阶段顺序与转换注入点；在[工程约定](../../../../engineering/README.md)中更新相关测试说明。

## 不包含

- 页面、查看器与缓存接线（P2-11）；新的浏览器用例（技术决定 12）。
- 改变宿主的错误层映射、持有者的状态机或 `finished.usage` 的语义。

## 关键文件与契约

- **修改：** [import-protocol.ts](../../../../../src/workers/import-protocol.ts)、[import-host.ts](../../../../../src/workers/import-host.ts)、[import-job.ts](../../../../../src/workers/import-job.ts)、[import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts) 及其测试；[synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts)；[import-pipeline.test.ts](../../../../../src/app/import/import-pipeline.test.ts)。
- **复用：** 03 的身份推导与写入；09 的 `convertLogic`；05 的合成封包 test-support；[import-host.test-support.ts](../../../../../src/workers/import-host.test-support.ts)。
- **浏览器回归：** [e2e/import-worker.spec.ts](../../../../../e2e/import-worker.spec.ts) 不新增用例，只重跑。

## 验收标准

- [x] AC-10：以注入的合成白名单运行生产作业，消息依次为 `identify-source` 进度、`identified`、`convert-graphics` 进度、`convert-logic` 进度、`group logic`、`finished`（`groups` 为 `['logic']`）；递增后的协议版本两端一致，旧版本的 `ready` 被拒绝；app 持有者接受该组，`takeGroups()` 一次性移交。
- [x] AC-10（失败）：转换失败时报 `failed`（`source` 或 `content` 层）且不发送组；预算超限到达持有者时为 `source` 层的 `budget-exceeded`，`limit` 的维度名、上限与观测值完整；识别之前的 `convert-logic` 进度在宿主与持有者都被拒绝。
- [x] AC-08（作业部分）：作业中每个组的清单携带同一 `ManifestIdentity`。
- [x] AC-13：快照、错误 DTO 与 console 不含文件名 `MARKER`、名称或坐标。
- [x] P2-04 的既有 Node 测试通过；`pnpm test:e2e import-worker.spec.ts --project=development` 通过；`pnpm check` 通过。

## 验证方法

- Node 集成测试：真实宿主、`MessageChannel` 结构化克隆端口与 app 持有者，合成光盘与合成白名单。
- 浏览器回归按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 的合成数据规则重跑既有 Worker 用例，不新增浏览器验收。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **开始前核对：** P2-05 已合入主线：协议版本 2，阶段为 `identify-source` 与 `convert-graphics`。本分支已变基并与其对齐，见 [goal 执行记录](../goal.md#执行记录)。P2-08 未合入（只有另一工作分支），不影响本子任务。
- **协议：** [import-protocol.ts](../../../../../src/workers/import-protocol.ts) 的 `IMPORT_PROTOCOL_VERSION` 由 2 递增为 3，`IMPORT_STAGES` 在 `convert-graphics` 之后追加 `convert-logic`。阶段顺序沿用 P2-05 的 `canReportStage`，宿主与持有者无需改动代码。
- **作业：** [import-job.ts](../../../../../src/workers/import-job.ts) 的 `createImportJob(open, graphics, logic)`：
  - **限值：** 作业限值为读取限值加上图形与 logic 两个份额。
  - **步骤：** 图形步骤之后报告 `convert-logic` 进度，以图形用量为起始用量运行 logic 步骤。
  - **发送：** 先算出最终用量，再以 `applyManifestIdentity(productionIdentityBasis(指纹), drafts)` 为全部草稿写入同一身份，最后逐组 `report.group`。
  - **注入：** `LogicStepInput` 的 `convert` 返回 `{ drafts, usage }`，默认是导出的 `PRODUCTION_LOGIC_STEP`；测试支持的 `NO_LOGIC` 返回空草稿。
- **测试支持：** [synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 新增以下内容：
  - **`NO_LOGIC`：** `syntheticGroupsJob` 改为以 `NO_GRAPHICS` 与 `NO_LOGIC` 运行，仍只发送四个合成组。
  - **`sliceCoveredFiles(scenario?)`：** 合成光盘的 `SR.NOB` 合并 [production-graphics.test-support.ts](../../../../../src/original-data/conversion/production-graphics.test-support.ts) 新增的 `productionGraphicsEntries` 与 [formats.test-support.ts](../../../../../src/original-data/formats/formats.test-support.ts) 新增的 `syntheticModelEntries`，另含 `SCENARIO.NOB`。

  测试 Worker 入口的 `graphics` 场景改用 `NO_LOGIC`，图形用例的含义不变。
- **测试（Node）：**
  - **AC-10：**
    - [import-job.test.ts](../../../../../src/workers/import-job.test.ts) 共 8 个测试。生产作业处理 `sliceCoveredFiles` 时，消息依次为识别进度、`identified`、图形进度、`convert-logic` 进度（开始一次，之后每次读取一次）、`group logic`、`finished`（`groups` 为 `['logic']`）。
    - 组经 `validateGroup` 为 `group-complete`。`finished.usage` 等于读取用量加上图形与 logic 的累计用量：`assets` 8、`dependencyEdges` 8、`missionObjects` 11、`missionReferences` 37，`payloadBytes` 为图形 payload 字节（测试支持的 `GRAPHICS_PAYLOAD_BYTES`）加 logic payload 字节。P2-05 合入主线后又修改了字库 payload，图形的 `glyphs` 改为 704，用量期望随之更新，见 goal 执行记录。
    - [import-pipeline.test.ts](../../../../../src/app/import/import-pipeline.test.ts) 经宿主、真实 `MessageChannel` 与持有者运行同一作业：阶段依次去重后为 `ready → identify-source → identified → convert-graphics → convert-logic → group → finished`；持有者的 `logic` 组为 `group-complete`，`takeGroups()` 只移交一次，第二次为 null。
    - 旧版本（2）的 `ready` 被持有者与协议读取拒绝，旧版本的 `start` 被宿主拒绝。
  - **AC-10（失败）：**
    - 管线中三类逻辑失败都停在 `convert-logic`，不发送组，持有者的错误与宿主转换的 DTO 相等：
      - 不支持的任务为 `source` 层 `unsupported-payload@archive:/MAIN/SCENARIO.NOB#3019/header/height`；
      - 份额不足为 `source` 层 `budget-exceeded`，`limit` 为 `{ missionReferences, 36, 37 }`；
      - 注入的内容错误为 `content` 层 `invalid-logic-payload`。
    - 作业测试另证明份额不足时只有 `identified` 与 `failed`，以及逻辑步骤之后的用量错误也不会先发出组。
    - [import-host.test.ts](../../../../../src/workers/import-host.test.ts) 与 [import-job-owner.test.ts](../../../../../src/app/import/import-job-owner.test.ts) 拒绝识别之前的 `convert-logic` 进度，以及 `convert-logic` 之后的 `convert-graphics` 进度；持有者的正常流程增加 `convert-logic` 快照；[import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts) 的 `canReportStage` 表覆盖 7 个新组合。
  - **AC-08（作业部分）：** 作业发送的组清单身份等于 `deriveManifestIdentity(productionIdentityBasis(指纹), 作业的全部草稿)`。测试包装生产步骤以取得草稿，不重复转换。
  - **AC-13：** 作业测试的消息、管线的消息与快照都不含文件名 `MARKER`。payload 中的合成名称以字节传输，消息的 JSON 与字符串值都不含它们。作业、宿主、转换与持有者的生产代码没有 console 调用，浏览器用例另核对 console。
- **浏览器回归：** `pnpm test:e2e import-worker.spec.ts --project=development` 共 11 个用例通过，不新增用例。期望只增加空的 `convert-logic` 快照（`synthetic` 与 `graphics` 场景）。首次运行时，第一个用例因开发服务器在模块图变化后重载页面而失败（“Execution context was destroyed”）；随后连续两次重跑全部通过，最终提交前又通过一次。
- **工程检查：** `pnpm check` 通过：114 个测试文件、3394 个测试与生产构建。
- **rubber-duck：** 无阻塞项，2 项建议已采纳：
  - **用量先于发送：** 作业先算出最终用量再发送组，并新增回归测试；
  - **文档：** 补充源码结构中 P2-05 管线序列的空逻辑阶段，以及 P2-09 的管线覆盖。
- **simplify：**
  - **已采纳：**
    - logic 步骤统一返回 `{ drafts, usage }`，不再用 null 表示“不转换”，作业按草稿列表统一写入身份；
    - 测试包装导出的生产步骤以取得草稿，不再重复转换；
    - 期望身份改用 `deriveManifestIdentity`。
  - **未采纳：**
    - 把 `createImportJob` 改为选项对象：会改动 P2-05 已确立的位置参数接口；
    - 继续精简测试辅助函数：它们是在 P2-05 原有函数上推广到三个阶段；
    - 把 `sliceCoveredFiles` 移到 original-data：P2-05 的 `graphicsCoveredFiles` 也在同一 Worker 测试支持中，保持一致。
- **文档影响：**
  - [源码结构](../../../../engineering/modules/workers.md#导入-worker)更新了协议版本、阶段集合、作业的限值、发送顺序与注入点、测试支持与管线覆盖；
  - [工程约定](../../../../engineering/README.md)更新了浏览器用例的阶段序列，并注明逻辑阶段由 Node 管线测试验证；
  - STATUS 无需更新。
