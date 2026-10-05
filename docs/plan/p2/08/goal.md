---
type: plan
status: accepted
phase: P2
task: "08"
updated: 2026-10-05
---

# P2-08：核心音效转换与播放适配 — Goal

## 目标与来源

实现 [P2-08 spec](./spec.md) 中的 S-01 至 S-12 与 AC-01 至 AC-15：

- **内容与转换：**
  - 规范采样 payload 与唯一的浮点映射；
  - 包级 `ManifestIdentity`；
  - SND 定向解析与 `conversion` 错误层；
  - 音频组转换（目录预检、来源核验、预算）。
- **导入管线：** 协议 v2（`convert-audio` 阶段、`conversion` 错误层与顺序规则）、生产作业的音频阶段与包身份组装，以及 Node 与真实 Worker 集成。
- **播放：** `platform/audio/` 的 DOM-free 控制器、`browser-*` 工厂，以及 Chrome 中的真实播放与生命周期验证。
- **研究与原版证据：**
  - 定向研究写入 `docs/original/`；
  - 开发者本地试听对照；
  - 填入研究结论的生产音效表；
  - 本地基准镜像核对。

本文件不重新定义行为契约。

## 代码现状与前提

- **上游已完成：** `node tools/task-state.ts` 对 `p2/01`、`p2/02`、`p2/03`、`p2/04`、`p2/10` 都输出 `done`。本任务直接复用以下模块。
  - **内容契约：**
    - [slice-definition.ts](../../../../src/content/slice-definition.ts) 的 `CLASSIC_P2_SLICE`：`audio` 组只拥有 `sound`，四个音效角色各至少 1 个；
    - [asset-contract.ts](../../../../src/content/asset-contract.ts) 的 `readAssetDescriptor`、`AssetReference`；
    - [content-identity.ts](../../../../src/content/content-identity.ts)：`ConverterVersion` 与 `ManifestIdentity` 共用令牌语法 `[a-z0-9]+([-.:][a-z0-9]+)*`。rubber-duck 已实测 `osr-import.audio-1` 与 `manifest:sha256:<64 位十六进制>` 都能通过；
    - [completeness.ts](../../../../src/content/completeness.ts) 的 `validateGroup`：额外角色 `model-sound` 不需要改动切片定义；
    - [budget.ts](../../../../src/content/budget.ts) 的 `chargeBudget`、`readBudgetRecord`、`EMPTY_BUDGET_USAGE`；
    - [payload.ts](../../../../src/content/payload.ts) 的 `readPayloadRecords`；
    - [ownership.ts](../../../../src/content/ownership.ts) 的 `exclusiveBytes`、`payloadTransferList`；
    - [sha256.ts](../../../../src/content/sha256.ts) 的 `Sha256`、`sha256Fingerprint`；
    - [contract-validation.ts](../../../../src/content/contract-validation.ts) 的严格读取与 `ContentContractError`。
  - **来源：**
    - [source-mapping.ts](../../../../src/original-data/source-mapping.ts) 的 `readSourceMappingTable`、`assetSourceStates`。严格读取器拒绝多余字段，所以带 `role` 的行必须先投影为 `SourceMapping` 再交给它；
    - [verify-source-mappings.ts](../../../../src/original-data/source/verify-source-mappings.ts) 的 `verifySourceMappings`。它读取每个别名的块，返回绑定指纹的新表，但不保留字节；
    - [open-verified-source.ts](../../../../src/original-data/source/open-verified-source.ts) 是唯一产品入口。`VerifiedSource.openArchive(path)` 返回的 [ImfatArchiveHandle](../../../../src/original-data/archive/archive-reader.ts) 有 `entries`、`entry(id, type)` 与 `read(id, type)`，目录预检只用前两者；
    - [source-error.ts](../../../../src/original-data/source-error.ts) 的 `SourceError` 是 `conversion` 层错误类的形状参照。
  - **导入管线：**
    - [import-protocol.ts](../../../../src/workers/import-protocol.ts)：版本 1，阶段只有 `identify-source`，四个错误层；
    - [import-host.ts](../../../../src/workers/import-host.ts) 的 `toErrorData`、`#sendGroup`：每组分别转移，作业返回后才读取用量；
    - [import-job.ts](../../../../src/workers/import-job.ts) 的 `createImportJob(open)`：识别后即结束；
    - [import-job-owner.ts](../../../../src/app/import/import-job-owner.ts)：进度检查 `LATE_PROGRESS`、`INVALID_READ_BYTES`，组的验证顺序，`finished` 只核对组列表，不核对用量；
    - [import-worker.ts](../../../../src/workers/import-worker.ts) 调用无参的 `createImportJob()`。
  - **测试支持：**
    - [synthetic.ts](../../../../src/original-data/synthetic.ts) 的 `buildImfat`、`ByteWriter`；
    - [disc.test-support.ts](../../../../src/original-data/disc/disc.test-support.ts) 的 `syntheticFileDisc`；
    - [source.test-support.ts](../../../../src/original-data/source/source.test-support.ts) 的 `catalogFor`；
    - [synthetic-import.test-support.ts](../../../../src/workers/synthetic-import.test-support.ts) 的 `syntheticImport`、`syntheticOpen`、`syntheticGroupsJob`。`syntheticGroupsJob` 经 `createImportJob(open)` 识别，所以作业加入音频阶段后要同步它；
    - [import-worker.test-support.ts](../../../../src/workers/import-worker.test-support.ts) 的浏览器场景。
- **计划新增（均尚不存在）：**
  - **content：** `src/content/sound-payload.ts`（01）、`src/content/manifest-identity.ts`（02）；
  - **original-data：**
    - `src/original-data/conversion/conversion-error.ts` 与 `src/original-data/formats/snd.ts`（03）；
    - `src/original-data/conversion/audio-conversion.ts`（04）；
    - `src/original-data/conversion/production-sounds.ts`（06 建立，11 填入）；
  - **platform：** `src/platform/audio/audio-controller.ts`（07）与 `browser-audio-controller.ts`（08）；
  - **E2E：** `e2e/audio-playback.spec.ts` 与 `e2e/support/audio-playback.ts`（08）；
  - **本地（被忽略，不提交）：** `local/research/p2-08/` 下的脚本与输出（09、10、12）。

  以上都有相邻的 `*.test.ts`。文件名以执行为准，但须保持所列的模块归属；不新增依赖。
- **类型程序与边界：**
  - **类型程序：** [tsconfig.node.json](../../../../tsconfig.node.json) 没有 DOM 类型，因此被 Node 测试导入的控制器只用最小结构类型；`AudioContext` 等 DOM 类型只出现在 `browser-*.ts` 中，由 [tsconfig.app.json](../../../../tsconfig.app.json) 检查。
  - **既有边界：** [eslint.config.js](../../../../eslint.config.js) 与 [engineering-boundaries.test.ts](../../../../tools/engineering-boundaries.test.ts) 已有 `platform/storage/` 的网络与依赖回归，`platform/audio/` 照此新增。[original-data-capabilities.ts](../../../../tools/original-data-capabilities.ts) 只限制 `disc/`、`archive/`、`imfat.ts` 与 `source/`，所以新的 `formats/`、`conversion/` 模块属于“其他使用者”，只能经产品入口取得字节。
- **浏览器（2026-10-05 在本机 Chrome 154.0.8037.98 实测，只用合成数据）：**
  - **自动播放开关：** `--autoplay-policy=user-gesture-required` **不会**阻止 Web Audio：没有用户激活时，上下文仍为 `running`。能阻止的是 `--autoplay-policy=document-user-activation-required`（也是不加开关时的默认值），此时上下文为 `suspended`，可信点击后变为 `running`。spec 技术决定 11 的“需要用户手势”的策略据此使用这个开关值。
  - **用户激活：** Playwright 的 `page.evaluate` 会给页面用户激活（`navigator.userActivation.hasBeenActive` 变为 true），会掩盖被阻止的路径。被阻止的用例必须用原始 CDP `Runtime.evaluate`（不带 `userGesture`）驱动；解锁用可信点击，即 CDP `Input.dispatchMouseEvent` 或 Playwright 的 `click`。
  - **输出观测：** 无头模式下，接在 destination 前的 `AnalyserNode` 能观测到实际输出（正弦峰值 0.5），停止后回到 0。`createBuffer` 可使用 11,025 Hz，`getChannelData` 逐样本精确。
  - **真实页面隐藏：** 只能用 [native-lifecycle](../../../../e2e/native-lifecycle.spec.ts) 的路线，即 [native-lifecycle.ts](../../../../e2e/support/native-lifecycle.ts) 的 `nativeBrowser()` 与 `NativeTarget`：自管的 headed 浏览器、CDP 自建 context 与两个标签页、移除 3 个后台节流默认参数。普通 Playwright 页面始终报告 visible，见[工程约定](../../../engineering/README.md#本地浏览器-runner)。
- **前提一：spec 已批准。** 用户于 2026-10-05 明确批准，见 [spec 审批](./spec.md#审批)。
- **前提二：依赖安装。** 本工作树没有 `node_modules`；首个子任务开始前运行 `pnpm install --frozen-lockfile`，不改锁文件。
- **前提三：浏览器（08、06 的浏览器部分需要）。** 已安装的兼容 Chrome（`channel: 'chrome'` 或 `OSR_E2E_EXECUTABLE`）。08 的页面隐藏用例另需原生 headed 桌面能力。缺少时相应子任务为 blocked，不用合成事件或 Node 模拟代替。
- **前提四：本地原版数据与工具（09、10、12 需要）。** 以下都已存在（2026-10-05 只核对了名称）；缺少时相应子任务为 blocked，不能用合成数据代替：
  - `local/StarRang/cd/` 的 CloneCD 文件组（4 个文件）与 `local/StarRang/SRANGERS/` 安装目录；
  - [基准环境](../../../guides/baseline-environment.md)中的 DOSBox-X（`~/Applications/dosbox-x.app`）与 Ghidra 12.0.1 只读分析环境。
- **前提五：开发者参与（10 需要）。** AC-14 的试听判定，以及 AC-13 中“试听一致”的门槛，只能由开发者给出。agent 准备本地对照材料与清单，不替代判定。
- **前提六：并行任务的协调。** P2-05、P2-09 可能与本任务同时推进。05 开始前核对 `IMPORT_PROTOCOL_VERSION`、错误层与包身份规则是否已被其他已批准的契约改动；若已改动，按 spec 技术决定 6 与风险约定修订 spec 并重新批准，不在实现中自行协调出第二套规则。
- **原版证据：** SND 结构、模型音效引用与候选来源计数以 [audio](../../../original/formats/audio.md)、[mesh](../../../original/formats/mesh.md)、[scenario](../../../original/formats/scenario.md#campaign-candidate-source-profiles-confirmed-structure) 为准。16 位解释、`flags`、声道与四类角色的对应仍未确认（[U-004、U-027](../../../original/unknowns.md#数据与格式)），由 09、10 按 spec 的[研究要求](./spec.md#研究要求)处理。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 03（解析与规则机制）、11（生产规则） | 03 合成 SND 的 Node 测试；12 基准镜像上的生产规则 |
| S-02 | 01 | 01 payload 往返、拒绝与浮点映射的 Node 测试 |
| S-03 | 04（行形状与投影）、06（生产表模块）、11（生产行） | 04 合成表 Node 测试；11 读取真实生产表；12 覆盖核对 |
| S-04 | 09、10 | 09 静态研究证据；10 试听判定；13 文档与生产表的一致性 |
| S-05 | 04 | 04 转换、预检与预算的 Node 测试 |
| S-06 | 02、06 | 02 身份计算的 Node 测试；06 生产 `ConverterVersion` 与组装测试 |
| S-07 | 05、06 | 05 协议与持有者 Node 测试；06 作业与集成测试、Worker E2E |
| S-08 | 07、08 | 07 控制器 Node 测试；08 Chrome E2E |
| S-09 | 07、08 | 07 生命周期与释放 Node 测试；08 真实解锁、隐藏与释放 E2E |
| S-10 | 03、04、05、07 | 各子任务的诊断与边界测试；13 复核诊断不含字节或宿主文本 |
| S-11 | 01–08、10、12 | 各子任务的 Node 测试与 E2E；10、12 的本地核对；13 汇总 |
| S-12 | 01–12（各自同步） | 13 文档链接、元数据与内容一致性 |
| AC-01 | 03 | 03 表驱动 Node 测试 |
| AC-02 | 01 | 01 Node 测试 |
| AC-03 | 04、11 | 11 读取真实生产表的 Node 测试与边界回归 |
| AC-04 | 04 | 04 Node 测试（合成光盘与注入表） |
| AC-05 | 04、06 | 04 计量端口的预检与核算测试；06 的 `finished.usage` |
| AC-06 | 02、06 | 02 格式、确定性与敏感性测试；06 生产值与同一作业各组的身份相同 |
| AC-07 | 05 | 05 协议、宿主与持有者 Node 测试，以及 P2-04 既有测试的更新 |
| AC-08 | 06 | 06 Node `MessageChannel` 集成测试；`pnpm test:e2e import-worker.spec.ts --project=development` |
| AC-09 | 07 | 07 假音频能力的 Node 测试 |
| AC-10 | 08 | 08 `pnpm test:e2e audio-playback.spec.ts --project=development` |
| AC-11 | 04、07 | 04 能力边界；07 `platform/audio/` 边界回归；13 依赖文件 diff |
| AC-12 | 12 | 12 本地 Node 脚本 |
| AC-13 | 09、10、11 | 13 文档审阅、生产表一致性、`pnpm check:original` |
| AC-14 | 10 | 10 开发者书面判定 |
| AC-15 | 01–12 | 13 `pnpm check`、受影响的 E2E、`pnpm check:original`、文档检查 |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-sound-payload.md](./subtasks/01-sound-payload.md) | — | completed |
| [02-manifest-identity.md](./subtasks/02-manifest-identity.md) | — | completed |
| [03-snd-parser.md](./subtasks/03-snd-parser.md) | 01 | pending |
| [04-audio-group-conversion.md](./subtasks/04-audio-group-conversion.md) | 01, 03 | pending |
| [05-import-protocol-v2.md](./subtasks/05-import-protocol-v2.md) | 03 | pending |
| [06-import-job-audio-stage.md](./subtasks/06-import-job-audio-stage.md) | 02, 04, 05 | pending |
| [07-audio-controller.md](./subtasks/07-audio-controller.md) | 01 | pending |
| [08-browser-audio-playback.md](./subtasks/08-browser-audio-playback.md) | 07 | pending |
| [09-sound-research.md](./subtasks/09-sound-research.md) | 01, 03 | pending |
| [10-listening-comparison.md](./subtasks/10-listening-comparison.md) | 09 | pending |
| [11-production-sound-table.md](./subtasks/11-production-sound-table.md) | 06, 10 | pending |
| [12-local-base-check.md](./subtasks/12-local-base-check.md) | 11 | pending |
| [13-final-alignment.md](./subtasks/13-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

**依赖结构：**

- **转换链：** 01 → 03 → 04；03 → 05；02、04、05 → 06。
- **播放链：** 01 → 07 → 08，与转换链和研究链互不依赖。
- **研究链：** 01、03 → 09 → 10（开发者参与）。
- **汇合：** 06 与 10 汇合于 11 → 12。研究链阻塞时，转换链与播放链仍可完成。

## 执行记录

## 审批

用户于 2026-10-05 明确批准本 goal（“approve goal and commit”），批准范围为上述 13 个子任务的拆分、依赖关系和验收覆盖，包括 06 先建立空的生产音效模块、11 再依据研究填入的安排。spec 已于同日由用户明确批准。批准不代表实现完成，也不授权 push、部署或替代 10 中开发者的试听判定。
