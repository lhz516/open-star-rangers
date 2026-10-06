---
type: plan
status: active
phase: P2
task: "09"
subtask: "13"
updated: 2026-10-05
---

# 13 — P2-09 最终对齐验证

**契约来源：** [spec](../spec.md) 的全部 S-01 至 S-14、AC-01 至 AC-15，重点为 AC-13、AC-15 与[风险与恢复](../spec.md#风险与恢复)。
**依赖：** 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 14。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **覆盖核对：** 对照 spec、实际导出、测试与 01–12 的完成证据，逐项形成 S/AC 覆盖表；确认源字段处理表的每一行、每个错误码与限值名都有正负测试。
- **不变量核对：**
  - Core 与 `content/` 不导入 `original-data`；转换器只经 `VerifiedSource` 取字节；Worker 仍禁用网络 API；
  - 生产代码中没有地图框架、比例或其他研究数值（AC-02、AC-13），研究事实只在 `docs/original/` 维护；
  - `ConverterVersion` 与机型到模型的绑定在生产代码中各只有一份；
  - 诊断、快照、console 与 CLI 输出不含名称、坐标、原版字节或私人绝对路径；
  - 研究门槛若曾触发，spec 修订与重新批准记录完整，goal 覆盖与修订后的 S/AC 一致。
- **工程检查与提交范围：**
  - 运行 `pnpm check`、完整的 `pnpm test:e2e`（Worker 生产入口已改变）、`pnpm --silent check:original`、文档链接与元数据检查，以及 `node tools/task-state.ts p2/09`；
  - 审阅 goal 的全部提交：没有原版内容、二进制样本或 `local/` 输出，依赖清单与锁文件没有变化；
  - P2-01 至 P2-04、P2-10 的契约测试与既有浏览器回归保持通过。
- **交接核对：** P2-06 使用 06 的绑定（S-05）；P2-11 消费 `logic` 组与 `loadMission`；P2-12 负责独立原版对照；P3 接手规则输入、生成与地图/Warp 规则。确认 spec 的范围外说明仍然准确。
- **只核对，不实现：** 本子任务不新增功能代码。发现缺口时按 execute-goal 的补救流程新增子任务。

## 不包含

- 新功能、P2-05 至 P2-08 与 P2-11 的工作、P2 阶段退出评审（P2-13）。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md) 及 01–12 的完成证据。
- `src/original-data/formats/`、`src/original-data/conversion/`、`src/content/logic/`、`src/content/manifest-identity.ts`、`src/core/mission/`、`src/workers/`、`src/app/import/`、`tools/logic-check.ts`。
- [源码结构](../../../../engineering/source-structure.md)、[工程约定](../../../../engineering/README.md)、[工具指南](../../../../guides/tools.md)、[scenario](../../../../original/formats/scenario.md)、[unknowns](../../../../original/unknowns.md)、[阶段索引](../../tasks.md)。

## 验收标准

- [x] S-01 至 S-14、AC-01 至 AC-15 逐项有实现与验证证据，没有未解释的缺口，也没有用代理证据替代要求；AC-01、AC-02 的证据来自本地研究，AC-14 的证据来自真实的本地基准运行。
- [x] `pnpm check`、完整的 `pnpm test:e2e` 与 `pnpm --silent check:original` 通过；依赖清单与锁文件没有变化；仓库没有新增二进制样本或 `local/` 文件。
- [x] AC-15：文档、源码边界与测试发现一致，改动文档的 `updated:` 正确，链接、锚点与元数据检查通过；`node tools/task-state.ts p2/09` 在标记完成后输出 `done`。

## 验证方法

- 运行上述命令，审阅 goal 范围内的 diff，并做文档链接与锚点检查；覆盖审计交由独立的 rubber-duck 复核。
- 浏览器证据只来自既有 Worker 回归的重跑（技术决定 12），本地基准证据来自 12；本子任务核对其适用性，不以模拟替代。

## 完成证据

- **开始时同步：** 主线在第一次变基后又合入 P2-05 的 3 个提交。本分支无冲突变基到主线，唯一的语义影响（逻辑作业测试中写死的图形用量）已修正，见 [goal 执行记录](../goal.md#执行记录)。以下检查都在同步后的分支上进行。
- **S/AC 覆盖：**

  | Spec 项 | 实现 | 验证证据 |
  |---|---|---|
  | S-01、AC-01 | [scenario 切片字段清单](../../../../original/formats/scenario.md#selected-mission-field-inventory-confirmed-structure)、U-022/U-023 | [01](./01-field-inventory.md#完成证据)：本地只读研究、`check:original`；12 的本地计数与清单一致 |
  | S-02、AC-02 | [executable 战略地图投影](../../../../original/formats/executable.md#strategic-map-projection)、[B-001](../../../../original/behavior/B-001-strategic-map.md)、U-032 | [02](./02-spatial-frame.md#完成证据)：本地静态分析与截图对照；本子任务检索确认，所选任务的扇区数、比例与半边长不出现在 `src/`、`tools/`、`e2e/` |
  | S-03、AC-03、AC-04 | `original-data/formats/`、[convert-logic.ts](../../../../../src/original-data/conversion/convert-logic.ts) | [05](./05-scenario-parser.md#完成证据) 的正负表驱动测试；[08](./08-logic-sources.md#完成证据) 的 `subresource-mismatch`；[09](./09-logic-conversion.md#完成证据) 的逐字段转换与读取日志（每个条目读取一次） |
  | S-04、AC-05 | `content/logic/` | [04](./04-logic-content.md#完成证据)：往返、规范性与拒绝；P2-05 对齐后 schema 错误为 `unsupported-payload-schema` |
  | S-05、AC-06 | [craft-binding.ts](../../../../../src/original-data/conversion/craft-binding.ts) | [06](./06-craft-binding.md#完成证据)；本子任务检索确认 model 命名只出现在该模块 |
  | S-06、AC-07 | [logic-sources.ts](../../../../../src/original-data/conversion/logic-sources.ts) | [08](./08-logic-sources.md#完成证据) |
  | S-07、AC-08 | [manifest-identity.ts](../../../../../src/content/manifest-identity.ts)、[converter-version.ts](../../../../../src/original-data/conversion/converter-version.ts) | [03](./03-package-identity.md#完成证据) 的推导与黄金向量；[10](./10-import-stage.md#完成证据) 的作业身份。生产代码中 `PRODUCTION_CONVERTER_VERSION` 只有一份 |
  | S-08、AC-09 | `convertLogic` 与 `PRODUCTION_LOGIC_SHARE` | [09](./09-logic-conversion.md#完成证据)：`group-complete`、外部要求、份额阈值、`budget-exceeded` 与不可达维度 |
  | S-09、AC-10 | [import-job.ts](../../../../../src/workers/import-job.ts)、协议版本 3 | [10](./10-import-stage.md#完成证据)：作业、宿主、持有者与管线测试；浏览器回归 |
  | S-10、AC-11 | [load-mission.ts](../../../../../src/core/mission/load-mission.ts) | [11](./11-core-load-mission.md#完成证据) |
  | S-11 | 各层错误码 | 04、05、08、09、10、11 的负向测试；10 证明错误 DTO 经宿主与持有者原样到达 |
  | S-12、AC-12 | 不适用（结论 2） | [07](./07-file-range-locator.md#完成证据)：locator 形状未变，既有测试通过 |
  | S-13、AC-13 | 合成测试与边界 | 测试只用代码生成的数据；`pnpm check` 的边界回归与 Core 确定性规则；04、05、08–12 的隐私断言；Worker 网络禁用规则未变 |
  | S-14、AC-14、AC-15 | [logic-check.ts](../../../../../tools/logic-check.ts)、各文档 | [12](./12-local-base-check.md#完成证据)：真实本地运行；本子任务的文档检查 |

  源字段处理表的每一行、每个错误码与限值名的正负测试，见 05（解析与结构限值）、08（子资源）、09（预算与跨 Asset 一致性）与 11（Core 前提）的证据。
- **第一次核对未通过：** 独立的 rubber-duck 覆盖审计发现，记录 +0x1C、+0x40 与 +0x5C 三行只有正向测试；唯一的数值字段重定位负向用例在 +0x0C，属于代理证据。按补救流程，本子任务退回 `pending`，新增 [14](./14-record-value-negatives.md) 补齐。审计确认其余各行、全部错误码与限值名、修订后的 AC-04/AC-09/AC-10 与协议版本 3 都与实现和测试一致。
- **不变量：**
  - **依赖与读取：** Core 与 `content/` 不导入 `original-data`，转换器只经 `VerifiedSource` 与共用的步骤内读取取得字节，Worker 不使用网络 API；三项都由 ESLint 与边界回归保证，均通过。
  - **研究数值：** 本地研究记录中所选任务的头部数值（扇区数、比例与由此得到的半边长）不出现在源码、测试与工具中；生产代码只有格式知识（坐标轴方向、原点中心与机型掩码）。
  - **唯一定义：** `ConverterVersion` 的生产常量只有一份；机型到 model 的绑定只在 `craft-binding.ts`。
  - **隐私：** 诊断、快照、消息与 CLI 输出的隐私由各子任务的测试证明；12 的本地输出只含哈希与固定标记。
  - **修订记录：** 研究门槛修订、AC-09 更正、P2-05 对齐与读取增量基准更正都已记入 goal 执行记录与 spec 审批，goal 覆盖与修订后的 S/AC 一致。
- **工程检查与提交范围：**
  - `pnpm check` 通过：116 个测试文件、3440 个测试与生产构建（第一次核对）。
  - 完整的 `pnpm test:e2e` 通过：54 个用例。第一次运行时，被中止的旧运行遗留了本工作区自己的预览服务器，占用了端口，已按 PID 结束后重跑。
  - `pnpm build` 之后，`pnpm --silent check:original` 通过。
  - 本 goal 的改动文档都通过链接检查，`updated:` 均为 2026-10-05。
  - 相对主线的分支差异只有 `.md` 与 `.ts` 文件：没有二进制文件，没有 `local/` 文件，`package.json` 与 `pnpm-lock.yaml` 未变。
  - P2-01 至 P2-05、P2-10 的契约测试与既有浏览器回归都在上述运行中通过。
- **交接：**
  - **P2-06：** 用 `bindCraftTypes` 命名模型（S-05），装配组结果时把草稿交给作业的同一 `ManifestIdentity` 推导；
  - **P2-11：** 消费 `logic` 组，用 `decodeLogicPayload` 与 `loadMission` 载入；
  - **P2-12：** 负责独立的原版对照；
  - **P3：** 接手规则输入、生成、地图与 Warp 规则。

  spec 的范围外说明仍然准确。[STATUS](../../../../STATUS.md) 已更新 P2-09 完成与后续顺序。
- **第二次核对（14 完成后）：**
  - 14 补齐三行的负向用例，审计指出的缺口已关闭，源字段处理表的每一行都有本行的正负测试；
  - `pnpm check` 通过：116 个测试文件、3443 个测试与生产构建；`check:original` 通过；
  - 分支差异仍只有 `.md` 与 `.ts`，没有二进制、`local/` 文件或依赖变化；
  - 14 只改 Node 测试，同步后的完整浏览器回归（54 个用例）结果仍然适用；
  - 全部改动文档通过链接检查，`updated:` 正确；
  - 标记完成后 `node tools/task-state.ts p2/09` 输出 `done`。
- **结论：** S-01 至 S-14、AC-01 至 AC-15 都有实现与验证证据。AC-01、AC-02 的证据来自本地研究，AC-14 的证据来自真实的本地基准运行。最终对齐通过。
