---
type: plan
status: active
phase: P2
task: "01"
subtask: "07"
updated: 2026-10-04
---

# 07 — P2-01 最终对齐验证

**契约来源：** [spec](../spec.md) 的全部 S/AC，重点为 S-11/S-12、AC-10/AC-13。
**依赖：** 01、02、03、04、05、06、08、09、10。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 对照 spec、实际导出、测试、原版研究链接和四组/候选证据，检查每个 S/AC 有实现与验证覆盖。
- 核对候选资格门禁、唯一生产切片定义、来源隔离、稳定错误 code、版本/manifest/payload identity、预算/所有权与失败恢复。
- 只记录缺口并阻塞验收；发现需要改变 spec 的行为时停止并记录，不偷偷改契约。

## 不包含

- 不新增功能代码、资源类型、转换器、浏览器导入或 P3 玩法。
- 不代替 P2-12 的完整联合 E2E 或 P2-13 阶段退出评审。

## 关键文件与契约

- [spec](../spec.md)、[goal](../goal.md)及 01–06、08 完成证据。
- 受影响的 `src/content/`、`src/original-data/` 文档与测试；不读取或提交 `local/` 内容。

## 验收标准

- [x] 逐项形成 S/AC 覆盖表，无未解释缺口或用代理证据替代要求。
- [x] 候选资格证据已取得；否则准确记录 blocked，不标记完成。
- [x] 文档、源码边界、测试发现和研究事实归属一致。

## 验证方法

- 运行目标测试、`pnpm check`、`pnpm check:original`及文档链接/元数据检查。
- 本地原版资格证据按 spec 要求复核；不适用 browser-testing。

## 完成证据

### 2026-10-04 — 第一次最终对齐（未通过）

本项只做核对，没有改动功能代码。覆盖范围是本 goal 从 `a6691f1` 到 06 提交的全部历史（57 个文件），以及 [01](./01-candidate-qualification.md#完成证据)–[06](./06-synthetic-contract-tests.md#完成证据)、[08](./08-base-content-contract.md#完成证据)的完成证据。

#### S/AC 覆盖表

| 项 | 实现 | 验证与证据 | 结论 |
|---|---|---|---|
| S-01、AC-01 | [slice-definition.ts](../../../../../src/content/slice-definition.ts) 中唯一的 `CLASSIC_P2_SLICE`：候选为战役 group 0 / slot 1，僚机可选，定义版本为 1 | 源码中只有这一个定义常量；工程边界回归保证只有所属模块能构造 `SliceDefinition`。02 测试中的角色表是核对 S-03 的预期值；下游验证（角色缺失、数量、组与 kind）都由该定义驱动，合成 fixture 为样例 Asset 显式标注角色，并由该定义检查 | 满足 |
| S-02、AC-10 | 首选 slot 0 不合格，按 S-02 选出回退候选 | [01](./01-candidate-qualification.md#完成证据)的本地只读资格证据；spec [候选选择记录](../spec.md#候选选择记录)经另一模型审阅，并于 2026-10-04 获用户重新批准；生产定义与结论一致 | 满足 |
| S-03、AC-02 | 15 个角色、四个资源组、各组拥有的 kind；敌机 1–2 | 02 测试逐角色核对；04/06 覆盖逐角色缺失、0/3 个敌机不裁剪、任务引用的敌机缺失 | 满足 |
| S-04、AC-03 | [asset-id.ts](../../../../../src/content/asset-id.ts)、[asset-contract.ts](../../../../../src/content/asset-contract.ts) | 08 的边界值与非法 ID 测试（错误按 code 断言）；03 证明只换等价 locator 时 ID 与依赖不变 | 满足 |
| S-05、AC-04 | [content-identity.ts](../../../../../src/content/content-identity.ts)：schema 1 与分开的六项身份 | 08/06 的运行时测试按 code/path 断言；类型级断言覆盖品牌与来源判别联合；完整性要求合成内容不带来源状态，原版导入的来源指纹必须匹配 | **未满足：** 同时带有两种字段的具名对象仍能通过类型检查（运行时已拒绝），由 [09](./09-isolation-origin-remediation.md) 修复 |
| S-06、AC-05 | [source-mapping.ts](../../../../../src/original-data/source-mapping.ts) 只在 `original-data` | 03 的映射测试；ESLint 禁止消费者导入；依赖图检查再导出、动态 import 与类型查询 | 满足 |
| S-07、AC-06 | [completeness.ts](../../../../../src/content/completeness.ts) 的 `validateGroup` | 04 的 23 种组级变异、来源绑定与伪造结果；06 的几何字节变化 | 满足 |
| S-08、AC-07 | `validatePackage`，组级与全包使用不同的判别联合 | 04/06 覆盖四组独立结果、缺组/重复组、六种身份混装、跨组缺失/环/重复 ID，以及判别值的类型级区分 | 满足 |
| S-09、AC-08 | [budget.ts](../../../../../src/content/budget.ts) 的十二个维度，不包含具体限值 | 05 的 51 项测试与 06 的组合测试；具体限值仍由 P2-02 至 P2-09 的 spec 批准 | 满足 |
| S-10、AC-09 | 冻结的纯数据，以及 [ownership.ts](../../../../../src/content/ownership.ts) 的独占副本与转移规则 | 08 的嵌套容器隔离；05/06 的别名、独占副本、转移后发送方失效与接收方重新验证；纯层程序没有 DOM/Node 声明 | **未满足：** 全包结果引用传入定义的组数组，`assetSourceStates` 引用映射的 U 项数组，由 [09](./09-isolation-origin-remediation.md) 修复；真实 Worker 转移归 P2-04 |
| S-11 | 未确认语义保留在 U 项 | [unknowns](../../../../original/unknowns.md#数据与格式)中 U-022/023/027/028/029/030 的状态与证据；[P2 tasks](../../tasks.md#定向研究与交接入口)把它们逐项交给 P2-05 至 P2-09；没有因语义 ID 命名而提升置信度 | 满足 |
| S-12、AC-11 | [synthetic-content.test-support.ts](../../../../../src/content/synthetic-content.test-support.ts) 在代码中生成带合成标记的数据 | 06 的测试数据守卫（真实路径、宿主加载方式）；`pnpm check:original` 零发现；对新增行的十六进制转储与长编码启发式扫描为 0 | 满足 |
| AC-12 | 纯层边界覆盖 `src/content` | IMFAT、payload、synthetic 模块与 P1 各层在本 goal 范围内均未改动；ESLint 拆分后覆盖范围与原先一致；依赖清单与锁文件未变；完整检查通过 | 满足 |
| AC-13 | 事实写在 `docs/original/`，spec 和 tasks 只链接 | 源码结构说明中引用的 37 个标识符逐个比对，均为实际导出或已说明的字段；文档链接、锚点与日期检查通过 | **未满足：** spec 的候选选择记录复述了 SCEN 条目与 M2ID 槽位→角色，而非只链接权威记录，由 [10](./10-spec-fact-links.md) 修订（用户已选择修订 spec） |
| 风险恢复与阻塞门禁 | 01 的阻塞与恢复都记录在 [goal 执行记录](../goal.md#执行记录) | 01 曾按规则 blocked，取得证据后恢复；`node tools/task-state.ts p2/01` 在 07 完成后核对 | 满足 |

#### 其他核对

- **稳定错误 code：** spec 要求区分的九类都有专用 code，诊断与测试都按 code/path 分类：
  - 语法/版本，例如 `invalid-record`、`unsupported-schema`、`definition-version-mismatch`；
  - 角色基数：`role-cardinality`；
  - 缺失引用：`missing-dependency`；
  - 类型不匹配：`kind-mismatch`、`group-mismatch`；
  - 重复/环：重复、乱序、自引用与 `dependency-cycle`；
  - payload 身份：`payload-*`；
  - 包身份：`package-identity-mismatch`、`group-missing`；
  - 来源/研究未就绪：`source-*`；
  - 预算：`budget-*` 与维度错误。
- **提交范围：** 本 goal 的所有改动只落在以下路径，没有 `local/` 路径、研究输出或无关文件：
  - P2 规划与 `docs/original` 研究记录；
  - 工程文档与 STATUS；
  - `src/content`、来源映射；
  - 两份工具测试；
  - 经批准的 ESLint/Vitest 配置。
- **测试发现：** Vitest 包含 `src/**/*.test.ts` 与 `tools/**/*.test.ts`，新增测试都被发现；调度回归保证串行执行不缩小发现范围。
- **验证：**
  - `pnpm check` 为 67 个文件 1640 项通过，四个 TypeScript 程序、lint 与生产构建均通过；
  - `pnpm check:original` 零发现；
  - 文档链接、元数据与 `git diff --check` 通过；
  - 本 goal 未改动 Python/Ghidra 工具，因此不需要运行其检查；
  - 不适用 browser-testing。
- **结论：** 未通过。rubber-duck 复查发现 AC-04、AC-09、AC-13 未满足，见上表；补救按流程新增 09、10，07 回到 pending，待补救完成后重跑。曾提前写入 goal 与 STATUS 的完成声明已撤回。

### 2026-10-04 — 第二次最终对齐（补救后）

补救子任务 [09](./09-isolation-origin-remediation.md#完成证据)与 [10](./10-spec-fact-links.md#完成证据)完成后重新核对。第一次核对表中其余各项的实现与证据没有被补救改动；补救只涉及来源类型、两处结果副本、注释、对应测试与 spec 候选记录，并已重新运行完整检查。

| 项 | 第一次结论 | 补救与证据 | 本次结论 |
|---|---|---|---|
| AC-04 | 同时带两种字段的具名对象能通过类型检查 | `ContentOrigin` 两个变体以可选 `never` 排除对方字段。类型级断言证明混合形状不可赋值、合法形状可赋值；暂存修复时这些断言使 `tsc` 失败。显式 `undefined` 的限制及其理由见 09，并经审查者认可 | 满足 |
| AC-09 | 全包结果与派生来源状态引用调用者的数组 | 两处都改为冻结副本，并用可变的结构化克隆证明调用者修改不影响先前结果。复核其余契约输出：都是冻结的新副本；`readPayloadRecords` 与 `payloadTransferList` 是有意的所有权例外；`readRecord` 等是校验原语 | 满足 |
| AC-13 | spec 候选记录复述 SCEN 条目与 M2ID 槽位 | 10 改为链接权威记录。修订经独立审阅者审阅、无发现，写入 `reviewed` 标记，并由用户于 2026-10-04 重新批准。spec、P2 tasks 与 STATUS 中已没有这些数值 | 满足 |
| AC-01 措辞 | 曾说下游测试的角色都取自定义 | 第一次核对表已改为：下游验证由定义驱动，合成 fixture 显式标注样例角色，并由定义检查 | 满足 |

- **提交范围：** 补救提交 `838ec4a`、`617d600`、`2804417` 只改动以下文件；对新增行的十六进制转储与长编码启发式扫描为 0：
  - 本 goal 的 spec、goal、子任务文档与 STATUS；
  - `content-identity`、`completeness`、`contract-validation` 与 `source-mapping` 及其测试。
- **验证：**
  - `pnpm check` 在补救后的 HEAD 为 67 个文件 1642 项通过，四个 TypeScript 程序、lint 与生产构建均通过；
  - `pnpm check:original` 零发现；
  - 文档链接、锚点与 `git diff --check` 通过；
  - 依赖与锁文件未变；
  - 不适用 browser-testing。
- **审查：** 第一次核对的审查者在复核时被会话中断，由新的审查者对六项原发现逐项复核。审查者确认六项均已解决，07 的三项验收均已满足，只要求把本节原先的验证占位文字改为实际结果。
- **结论：** 通过。S-01 至 S-12、AC-01 至 AC-13 都有实现与验证覆盖，没有未解释的缺口或代理证据；候选资格证据已取得；文档、源码边界、测试发现与事实归属一致。
- **工作流状态：** 标记完成后，`node tools/task-state.ts p2/01` 输出 `done (terminal)`，原因是全部子任务已完成。
