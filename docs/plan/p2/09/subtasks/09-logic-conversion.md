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
- **预算：** 定义 logic 步骤的生产份额（`assets` 8、`dependencyEdges` 32、`payloadBytes` 1,048,576、`missionObjects` 256、`missionReferences` 4,096，其余维度 0），按 spec 的计数规则，在分配对应数据之前用 `chargeBudget` 在作业限值与先前步骤用量之上计量。超限沿用 P2-05 的 `budget-exceeded`，`limit` 为 `{ name: 维度名, limit, observed }`，`observed` 超出安全整数时为 null（P2-05 合入后修订，见 goal 执行记录）。
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

- [x] AC-03：合成来源经 `convertLogic` 得到的三类规范数据逐字段符合预期，覆盖 05、06 列出的全部正向情形；地图框架按结论 2 由头部扇区数与比例生成。
- [x] AC-09：写入身份后，以 `CLASSIC_P2_SLICE` 调用 `validateGroup` 为 `group-complete`；外部要求恰为绑定的 model Asset；来源为 `original-import` 且带合成指纹；每个 payload 可由 `payloadTransferList` 转移；转换器计入的用量等于按计数规则独立计算的值；篡改 payload 后组为 `incomplete`。
- [x] AC-09（预算阈值）：五个设限维度在预算计量函数上恰好等于上限时通过、超出 1 时为 `over-budget`；经转换器可触发的超限（`missionReferences` 与 `payloadBytes`）以合成样本触发，为 `budget-exceeded` 且 `limit` 完整；其余维度在结构限值下不可达，证据中注明。
- [x] AC-04（读取范围）：从识别之后开始记录读取日志，只出现以下读取：`SCENARIO.NOB` 与 `SR.NOB` 的文件头与目录各一次；映射表引用的 SCCT、所选 SCEN 与 M2ID 各一次，由核验与转换共用（P2-05 合入后修订）；不读取 `MUSC`、其他 SCEN 与 CINF。
- [x] AC-13：用两组不同的合成比例值与头部扇区数证明比例与地图框架数值来自输入；诊断与错误不含 `MARKER`、名称或坐标。
- [x] `pnpm exec vitest run src/original-data src/content tools/engineering-boundaries.test.ts`、`pnpm typecheck` 与 `pnpm lint` 通过。

## 验证方法

- Node 测试：合成光盘（含 1 MiB 不读取的填充文件以容纳读取预算）、合成白名单与记录读取的端口。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。
- 不适用 browser-testing。

## 完成证据

- **spec 更正：** 实现时发现 AC-09 的可触发预算维度与子任务 01 的修订不一致：`missionObjects` 不可达，`payloadBytes` 可达。已按用户授权更正 spec 与本子任务的 AC-09，见 [goal 执行记录](../goal.md#执行记录)。
- **实现：** [convert-logic.ts](../../../../../src/original-data/conversion/convert-logic.ts) 的 `convertLogic(source, limits, usage)` 依次：
  1. 以 08 的 `logicEntryReader` 与 `verifyLogicSources` 核验映射，并解析映射的 SCCT；
  2. 从同一步骤读取取得映射的 SCEN 与 M2ID 并解析；
  3. 以 `bindCraftTypes` 绑定任务与僚机名单引用的机型；
  4. 核对唯一玩家记录（spec 规范逻辑数据中的跨 Asset 一致性）；
  5. 组装 `MissionContent`、`CraftTypeTable` 与 `WingmanRoster`：`mapFrame` 由头部扇区数与比例生成，坐标轴与中心按 executable 的记录；
  6. 按 Asset ID 升序计量预算、编码 payload，并生成描述符。

  返回冻结的 `{ draft: GroupDraft, usage }`，`usage` 为累计的转换用量。相关改动：
  - **预算：** `PRODUCTION_LOGIC_SHARE` 是五个设限维度的生产份额，其余为 0。
    - **计量：** 本步骤在作业限值与先前步骤的用量之上扣除，起始用量含 `sourceReadBytes` 时为 `invalid-budget-value`。每个 Asset 先计量 Asset 数、依赖边与两类任务计数；再由 [logic-payload.ts](../../../../../src/content/logic/logic-payload.ts) 新增的 `encodeLogicPayload(payload, reserve)` 回调，在检查上限与分配字节之前计量 `payloadBytes`。
    - **超限：** 报 P2-05 的 `budget-exceeded`，位置为该 Asset 的来源条目；总量超出安全整数时 `observed` 为 null。
  - **读取：** P2-05 的步骤内读取移到 [step-entry-reader.ts](../../../../../src/original-data/conversion/step-entry-reader.ts)，并增加读取前钩子，图形步骤与本步骤共用。
  - **身份：** [converter-version.ts](../../../../../src/original-data/conversion/converter-version.ts) 新增 `productionIdentityBasis(sourceFingerprint)`：来源为 `original-import`，schema、切片 ID 与切片定义版本取 P2-01 常量，转换器版本取 `PRODUCTION_CONVERTER_VERSION`。
  - **复用：** [logic-sources.ts](../../../../../src/original-data/conversion/logic-sources.ts) 新增 `LOGIC_ASSETS`，生产映射表改用它；payload schema 不符改报 P2-05 的 `unsupported-payload-schema`。
- **测试：** [convert-logic.test.ts](../../../../../src/original-data/conversion/convert-logic.test.ts) 22 个测试通过，使用合成 `SCENARIO.NOB`/`SR.NOB`、带 1 MiB 不读取填充的合成光盘与合成白名单：
  - **AC-03：**
    - 默认样本解码后的三个 payload 与逐字段写出的期望完全相等。任务覆盖名称备用池、生成矩形、规则输入（0 为 null、i32 负值、u32 最高位）、候选名称、AI 掩码、种类 0 的模板、别名合并的来源标记、成员回指、锚点、AI 目标、成员重复、共用布局与 `spawnCount`；机型表中玩家与僚机共用 `model/player-ship`，基地机型带 `baseInteraction`；僚机名单为两项。
    - 另一样本验证位置、负 `gridSpacing`、`spawnTime` 与 `craftCount` 的 u32 上界，以及布局第 0 个元素的 y/z 交换。
  - **AC-13：** 扇区数与比例取 6/900 与 11/1234.5 两组时，`referenceScale` 与 `halfExtent`（2700 与 6789.75）都随输入变化。所有失败用例都经 [source-error.test-support.ts](../../../../../src/original-data/source-error.test-support.ts) 新增的 `sourceFailure` 核对：位置符合语法，诊断不含 `MARKER`。源码中没有地图或比例数值，只有坐标轴方向与原点中心这两项格式知识。
  - **AC-09：**
    - 以 `productionIdentityBasis` 写入身份后，`validateGroup` 为 `group-complete`；外部要求恰为 5 个绑定的 model；来源为 `original-import`，带合成来源指纹；`payloadTransferList` 接受 3 个 payload；篡改任务 payload 的一个字节后组为 `incomplete`。
    - 描述符的 kind、role、组与升序依赖逐项断言，来源状态为三项 `verified`。
    - 用量与测试按计数规则从解码 payload 独立计算的值相等（`missionReferences` 37、`missionObjects` 11、`dependencyEdges` 8、payload 字节总和）。
  - **AC-09（预算阈值）：**
    - 五个维度在 `chargeBudget` 上恰等于份额时通过，超出 1 时为 `over-budget`；`PRODUCTION_LOGIC_SHARE` 的其余维度为 0。
    - 64 个编组、每组 64 个成员位置时，在任务的 SCEN 条目报 `budget-exceeded`，`limit` 为 `{ missionReferences, 4096, 4232 }`。
    - 64 个编组各写入 256 个布局元素时，在编码字节之前报 `payloadBytes` 的 `budget-exceeded`，观测值大于 1,048,576。
    - **累计用量：** 在先前步骤的用量之上扣除时，返回累计用量；先前用量导致的超限，观测值包含先前用量；总量超出安全整数时观测值为 null；起始用量含 `sourceReadBytes` 时被拒绝。
    - **不可达维度：**
      - `assets` 恒为 3；
      - `dependencyEdges` 至多为 21 个有阵营机型各自的 model 加 3，即 24。测试让 21 个机型各绑定独立 model，得到 24；
      - `missionObjects` 至多为 64 条段 1 记录加 16 个僚机，即 80。
  - **AC-04（读取范围）：** [source.test-support.ts](../../../../../src/original-data/source/source.test-support.ts) 新增 `loggedReads`。它在识别之后包装 `openFile` 记录每次读取，并按偏移归类到文件头、目录或条目。结果恰为：
    - 两个封包的文件头与目录各 1 次；
    - SCCT、SCEN 与 M2ID 各 1 次，由核验与转换共用；
    - 不读取 `MUSC` 与另一个 SCEN；合成光盘没有 CINF。
  - **跨 Asset 一致性：** 第二条玩家记录、任务没有玩家记录、僚机为玩家机型都为 `unsupported-payload`；两处都没有玩家机型时，绑定报 `invalid-payload`。解析与子资源失败原样传递，不返回部分组。
  - **其他：** [logic-payload.test.ts](../../../../../src/content/logic/logic-payload.test.ts) 验证 `reserve` 收到精确字节数，且在上限检查之前调用；[converter-version.test.ts](../../../../../src/original-data/conversion/converter-version.test.ts) 验证身份基础。
- **工程检查：**
  - **对齐前：** `pnpm exec vitest run src/original-data src/content tools/engineering-boundaries.test.ts src/workers`、`pnpm typecheck` 与 `pnpm lint` 通过；`pnpm check` 通过，共 103 个测试文件、3107 个测试，含生产构建。
  - **对齐后：** 结果见下文“P2-05 合入后的对齐”。
- **rubber-duck：** 无阻塞项，确认 AC-09 的可达性更正成立。两项建议：
  - **计量时机：** 已采纳，Asset、依赖边与任务计数改为在复制与编码之前计量。未采纳的部分：规范 JSON 文本仍在 `payloadBytes` 判定之前生成。不生成文本就测量长度，需要复制一份规范编码器；而文本大小受结构限值约束（约 1.3 MB 以内），payload 字节在判定之后才分配。
  - **不可达维度的依据：** 已采纳，补充 21 个机型各绑定独立 model 的测试，并在证据中写明上限。
- **simplify：**
  - **已采纳：**
    - 测试复用内容层的 `declaration` 与 `ruleInputs`；
    - 新增共用的 `sourceFailure`，08 的测试也改用它；
    - 封包缓存改为共用实现（对齐后由 P2-05 的步骤内读取取代）；
    - 解码辅助按 Asset 顺序直接解构；
    - 篡改用例不再复制全部 payload。
  - **未采纳：**
    - 把 payload 身份的构造提升为生产辅助函数：只有这一个生产调用方，且要改 P2-01 模块；等第二个转换器出现时再提升；
    - 缓存 SCCT 条目：当时要改 P2-03 的核验器；对齐后已由 P2-05 的步骤内读取实现；
    - 并行读取 SCEN 与 M2ID：会失去确定的错误顺序，收益很小；
    - 用位置参数调用替代 Asset 计划记录：具名字段更清楚；
    - 引用计数中的小数组分配：开销可忽略。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md#逻辑组转换)记录了以下内容：转换步骤、生产份额、计量时机、计数规则、`productionIdentityBasis`、`reserve`、共用的步骤内读取与 `sourceFailure`。spec 与 goal 记录了 AC-09 更正与 P2-05 对齐。工程约定、工具指南与 STATUS 无需更新。
- **P2-05 合入后的对齐（2026-10-05，变基后）：** 原因见 [goal 执行记录](../goal.md#执行记录)。以上实现与测试按对齐后的状态记录；对齐前的差异如下：
  - 预算常量为 `LOGIC_BUDGET_LIMITS`，从空用量起算，超限报 `limit-exceeded`，溢出报 `invalid-payload`；
  - 封包缓存是 `verify-source-mappings.ts` 中的 `openEachArchiveOnce`，SCCT 读 3 次，SCEN 与 M2ID 各读 2 次；
  - payload schema 不符报 `unsupported-schema`。

  对齐新增 4 个用量测试，并改用 `loggedReads`。P2-05 的图形步骤测试不改即通过。对齐后，`pnpm check` 通过：114 个测试文件、3377 个测试，含生产构建。
