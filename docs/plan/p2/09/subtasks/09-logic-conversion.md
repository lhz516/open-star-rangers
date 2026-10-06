---
type: plan
status: active
phase: P2
task: "09"
subtask: "09"
updated: 2026-10-05
---

# 09 — `logic` 组转换、装配与预算

**契约来源：** [spec](../spec.md) 的 S-04（转换部分）、S-08、S-11（预算超限反馈）、AC-03、AC-04（读取范围）、AC-09、AC-13（数值来自输入、转换诊断隐私）；[规范逻辑数据](../spec.md#规范逻辑数据)、[限值与预算](../spec.md#限值与预算)。
**依赖：** 03, 04, 06, 08。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **转换编排：** 在 `original-data/conversion/` 提供 `convertLogic`，接收 `VerifiedSource`，依次：
  1. 以 `verifySourceMappings` 核验 08 的生产映射表；
  2. 经 `source.openArchive(...).read(...)` 读取 SCCT、所选 SCEN 与 M2ID，交给 05 解析；
  3. 以 08 的子资源核验升级映射，推导来源状态；
  4. 以 06 的绑定生成机型表；
  5. 生成 `MissionContent`（含名称备用池、生成矩形、放置引用、成员回指、AI 目标、编组布局与 `mapFrame`）与 `WingmanRoster`：比例与扇区数来自 SCEN 头部；`mapFrame` 的坐标轴、中心与半边长换算按 02 写入的记录实现，数值只来自输入；
  6. 以 04 的编码器生成 payload，每个 payload 独占自己的 buffer；
  7. 生成描述符（ID、kind、role、组、按 ID 升序的依赖、payload 身份），依赖与 payload 内引用一致；
  8. 返回 `logic` 组草稿（描述符、payload、来源状态）与预算用量，供 03 的身份写入使用。
- **预算：** 定义 `logic` 组的预算上限记录（`assets` 8、`dependencyEdges` 32、`payloadBytes` 1,048,576、`missionObjects` 256、`missionReferences` 4,096，其余维度 0），按 spec 的计数规则在分配对应数据之前用 `chargeBudget` 计量。`over-budget` 转为 `SourceError('limit-exceeded')`，`limit` 为 `{ name: 维度名, limit, observed }`；`budget-overflow` 报 `invalid-payload`。在 `SourceLimitName` 追加五个维度名。
- **身份：** 来源为 `original-import`，带已识别指纹；`converterVersion` 为 `PRODUCTION_CONVERTER_VERSION`；schema、切片 ID 与切片定义版本取自 P2-01 常量。
- **文档：** 在[源码结构](../../../../engineering/source-structure.md)中记录转换编排、预算上限与计数规则的位置。

## 不包含

- 作业阶段、进度与发送（10）；Core 载入（11）。
- 段 2、`MUSC`、CINF 与运行时创建对象的数据（spec 不包含）。

## 关键文件与契约

- **修改：** [source-error.ts](../../../../../src/original-data/source-error.ts)（追加预算维度限值名）。
- **复用：** 03 的身份写入与 `PRODUCTION_CONVERTER_VERSION`；04 的编码器与读取器；05 的解析器；06 的绑定；08 的映射表与子资源核验；[budget.ts](../../../../../src/content/budget.ts) 的 `chargeBudget`；[completeness.ts](../../../../../src/content/completeness.ts) 的 `validateGroup`；[ownership.ts](../../../../../src/content/ownership.ts) 的 `payloadTransferList`；[identify-source.ts](../../../../../src/original-data/source/identify-source.ts)（类型导入）。
- **计划新增：** `src/original-data/conversion/` 下的转换编排模块与相邻测试。

## 验收标准

- [ ] AC-03：合成来源经 `convertLogic` 得到的三类规范数据逐字段符合预期，覆盖 05、06 列出的全部正向情形；地图框架按结论 2 由头部扇区数与比例生成。
- [ ] AC-09：写入身份后，以 `CLASSIC_P2_SLICE` 调用 `validateGroup` 为 `group-complete`；外部要求恰为绑定的 model Asset；来源为 `original-import` 且带合成指纹；每个 payload 可由 `payloadTransferList` 转移；转换器计入的用量等于按计数规则独立计算的值；篡改 payload 后组为 `incomplete`。
- [ ] AC-09（预算阈值）：五个设限维度在预算计量函数上恰好等于上限时通过、超出 1 时为 `over-budget`；经转换器可触发的超限（至少 `missionObjects` 与 `missionReferences`）以合成样本触发，为 `limit-exceeded` 且 `limit` 完整；其余维度在结构限值下不可达，证据中注明。
- [ ] AC-04（读取范围）：从识别之后开始记录读取日志，只出现以下读取：`SCENARIO.NOB` 与 `SR.NOB` 的文件头与目录（核验与转换可各读一次）、映射表中每个 locator 各一次核验读取、转换对 SCCT、所选 SCEN 与 M2ID 的读取；不读取 `MUSC`、其他 SCEN 与 CINF。
- [ ] AC-13：用两组不同的合成比例值与头部扇区数证明比例与地图框架数值来自输入；诊断与错误不含 `MARKER`、名称或坐标。
- [ ] `pnpm exec vitest run src/original-data src/content tools/engineering-boundaries.test.ts`、`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- Node 测试：合成光盘（含 1 MiB 不读取的填充文件以容纳读取预算）、合成白名单与记录读取的端口。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不适用 browser-testing。

## 完成证据
