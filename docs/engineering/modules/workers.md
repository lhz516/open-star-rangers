---
type: guide
status: active
phase: all
updated: 2026-10-14
related: [ADR-0015]
---

# 导入 Worker 模块说明

本文件是[源码结构指南](../source-structure.md)的模块分册，记录 `src/workers/` 中已交付代码的当前 API 与契约要点。目录树、职责边界与 helper 归属以指南为准，行为契约以各任务 spec 为准；修改本模块代码的任务同步更新本文件。

[workers/](../../../src/workers/) 由 [P2-04](../../plan/p2/04/spec.md) 逐步交付。

## 导入 Worker

[P2-04](../../plan/p2/04/spec.md) 在专用模块 Worker 中运行导入作业，消息与生命周期契约以 spec 为准。当前已实现：

- **消息协议：** [workers/import-protocol.ts](../../../src/workers/import-protocol.ts) 只依赖 `content/`，app 与 platform 都可以导入它。
  - `IMPORT_PROTOCOL_VERSION` 为 5：P2-05 增加 `convert-graphics` 时由 1 递增为 2；P2-09 与 P2-08 分别增加 `convert-logic` 与 `convert-audio`，各自递增为 3，合入后阶段集合与二者都不同，因此为 4；P2-06 追加 `convert-models` 并改为相邻阶段规则，递增为 5。`IMPORT_STAGES` 依次为 `identify-source`、`convert-graphics`、`convert-logic`、`convert-audio`、`convert-models`。`canReportStage(latest, stage, identified, grouped)` 是唯一的进度顺序规则，宿主与持有者共用：第一条进度是识别进度，之后每条进度只能重复当前阶段或进入紧随其后的阶段，不能跳过或倒退（作业在每个阶段开始时都报告一次进度）；识别进度只在 `identified` 之前，后续阶段只在它之后；第一个组之后不再有任何进度，因为组只在全部转换阶段完成后发送。`IMPORT_FILE_LIMITS` 规定 1–4 个文件，名称为 1–255 个 UTF-16 码元。
  - `readImportWorkerMessage` 读取 Worker 发往主线程的 6 种消息，`readImportStartMessage` 读取主线程发往 Worker 的 `start`。两者复用 `contract-validation.ts` 的严格 plain-data 读取，对协议记录拒绝未知或缺少的字段、accessor 与类实例。读取的协议字段复制后冻结。`start` 的文件只保留 Blob 引用，不读取内容。
  - 读取只核对单条消息；顺序、作业 ID 与顺序号的连续性由接收方核对。`group` 消息只读外层：`input` 恰好含三个字段，`sources` 是带字符串 `sourceFingerprint` 的 record。`group.input` 的内部值不复制，而是就地冻结其中可达的普通对象与数组，再交给接收方由 `validateGroup` 验证。递归只沿数据属性进行，不调用 accessor，并防止循环；payload 字节视图、Blob 与其他非普通对象不冻结，后者在内容验证中判为不完整。
  - 拒绝时返回 `import` 层 DTO，原因是固定文本，不回显值：
    - 主线程方向为 `protocol-error`，位置以 `message` 为根；
    - Worker 方向为 `invalid-request`，位置以 `request` 为根，并附上能读出的作业 ID，读不出时为 null。
- **错误 DTO：** `ImportErrorData` 为 `{ layer, code, location, reason, limit }`，层为 `disc`、`source`、`content` 或 `import`。
  - 前三层的 code 只按 token 语法核对，所以协议不依赖 `original-data`。
  - `import` 层的 6 个 code 为封闭集合 `IMPORT_ERROR_CODES`，`importError` 构造这一层的 DTO 并保留具体 code 的类型。Worker 报告的 `failed` 只接受其中的 `invalid-request` 与 `internal-error`（`WORKER_IMPORT_ERROR_CODES`），类型 `WorkerImportErrorData` 在编译期同样排除另外四个。
- **宿主：** [workers/import-host.ts](../../../src/workers/import-host.ts) 的 `runImportHost(endpoint, job)` 在 Worker 内运行一个作业。
  - **端点：** `ImportHostEndpoint` 只含 `postMessage(message, transfer)`、`addEventListener`（`message`、`messageerror`、`unhandledrejection`）与 `close()`。Worker 入口把 `self` 断言为它，Node 测试用假端点或 `MessagePort`。宿主不监听 `error`：`ready` 之后的未捕获错误传到主线程，由持有者报 `worker-failed`。
  - **握手：** 安装监听后发送一次 `ready`，只接受第一条有效的 `start`。以下情况都以 `invalid-request` 失败：`start` 非法（带能读出的作业 ID）、`messageerror`，以及 `start` 之后的任何消息。
  - **作业：** `ImportJob` 接收冻结的文件快照与冻结的报告器（`progress`、`identified`、`group`），成功时返回预算用量。
    - 宿主维护顺序号，从 1 起逐条加 1。发送抛错（如克隆失败）不消耗顺序号，异常交给作业。
    - 阶段只能按 `canReportStage` 逐个前进：`identified` 至多一次，识别进度只在它之前，后续阶段的进度只在它之后，不能跳过阶段，进入后续阶段后不再有较早阶段的进度；组须在识别之后，且每组一次，第一个组之后不再报告进度；作业须先识别才能正常结束。违反时作业以 `internal-error` 失败，作为作业缺陷的防线。
    - 身份只发送版本 ID 与指纹。
  - **转移：** 发送组前，用 `readPayloadRecords` 与 `payloadTransferList` 计算转移列表，位置以 `groups.<组>.payloads` 为根。非独占、别名、已转移或乱序的 payload 以 `content` 层失败，该组不发送。发送后，作业持有的 payload 视图失效。
  - **终态：** 作业返回的用量经 `readBudgetRecord` 读取，再随 `finished` 与已发送的组一起发送。终态消息之后关闭端点，之后的报告与消息都被忽略。
  - **错误转换：**
    - `DiscReadError`、`SourceError` 按层转换，其余字段取自 `toData()`；
    - `ContentContractError` 转为 `content` 层，`location` 取 `path`；
    - 其他异常、非 Error 值与 `unhandledrejection` 都报 `internal-error@job`，原因是固定文本。宿主取消 `unhandledrejection` 的默认报告。
- **导入作业：** [workers/import-job.ts](../../../src/workers/import-job.ts) 的 `createImportJob(open, graphics, logic, audio, models)` 返回生产作业。
  - **计量：** 每个文件包装为 `BlobByteSource`，外加一层计量。每个阶段开始时报告一次进度，之后端口每次读取成功返回，报告当前阶段与跨阶段累计的实际返回字节：识别阶段从 0 开始，之后各阶段从上一阶段结束时的累计值开始。
  - **识别：** 经 `open` 打开并识别，成功时报告 `identified`（版本 ID 与指纹）。
  - **限值与用量：** 图形、逻辑与模型步骤共用一份限值记录：P2-02 的默认读取限值（输入总字节，即 `sourceReadBytes`）加上三个阶段批准的份额；逻辑步骤在图形转换用量之上扣除，模型步骤在逻辑用量之上扣除，效果步骤与飞行数据步骤依次在前一步的用量之上按同一份模型份额扣除。P3-03 起逻辑份额为 `PRODUCTION_LOGIC_SHARE` 加 `PRODUCTION_RULE_DATA_SHARE`，模型份额为 `PRODUCTION_MODEL_SHARE` 加 `PRODUCTION_FLIGHT_DATA_SHARE`，图形份额已含飞行图形与 HUD 文字（[原版数据](./original-data.md#图形转换)）。音频阶段按 `AUDIO_BUDGET_LIMITS`（或注入的限值）从零核算，与其他步骤互不占用（P2-08 的预算契约）。作业返回已验证来源最终的读取用量、飞行数据步骤的累计转换用量与音频用量逐维之和。
  - **图形转换（P2-05）：** 识别之后运行 [图形转换步骤](./original-data.md#图形转换)。结果的 `models` 分区并入 `models` 组发送（P2-06）；`cockpit-hud-map` 分区由 `stepGroupDraft` 装配为 `cockpit-hud-map` 组草稿（P2-07），不重新转换，没有 Asset 时为空组，照常发送。生产图形的 `cockpit-hud-map` 分区含 P2-05 的调色板与字库和 P2-07 的驾驶舱、HUD 与地图 Asset（P2-06 的切片贴图在 `models` 分区），在已识别的来源上为 `group-complete`，外部要求为空。转换失败为 `source` 层；读取失败保持 P2-02 `disc` 层或 P2-03 `source` 层的原 code 与位置，都原样交给宿主转换。
  - **逻辑转换（P2-09）：** 图形阶段之后进入 `convert-logic`，运行[逻辑组转换步骤](./original-data.md#逻辑组转换)，结果为组草稿、累计用量与机型绑定的模型（`LogicStepGroups.models`，即 `convertLogic` 返回的 `bindCraftTypes` 的 `models`）；测试的 `NO_LOGIC` 返回空草稿与空绑定。[P3-03/19](../../plan/p3/03/subtasks/19-package-integration.md) 起，生产的 `PRODUCTION_LOGIC_STEP` 先运行 `convertLogic`，再在其用量之上运行[规则数据转换](./original-data.md#规则数据转换)的 `convertRuleData`，用 `mergeGroupDrafts` 按 Asset ID 合并为一份 `logic` 组草稿。
  - **音频转换（P2-08）：** 逻辑阶段之后进入 `convert-audio`，以 [`convertAudioGroup`](./original-data.md#原版格式转换) 转换 `audio` 组草稿；音效表为空时得到没有 Asset 的 `audio` 组，照常发送。生产音效表自 P3-03/19 起为 29 行。
  - **模型转换（P2-06）：** 音频阶段之后进入 `convert-models`，对逻辑步骤绑定的模型运行[模型转换步骤](./original-data.md#模型转换步骤)：映射与声明由 `ModelStepInput.inputs(绑定)` 一并生成，查找表与份额也来自它；只用这份绑定，不重读任务或 M2ID。同一阶段内随后运行[效果步骤](./original-data.md#效果步骤)（映射与声明来自 `ModelStepInput.effects`）与 P3-03/19 接入的[飞行数据步骤](./original-data.md#飞行数据步骤)（映射与声明来自 `ModelStepInput.flightData`），不新增阶段。最后由 `modelsGroupDraft` 把图形步骤的 `models` 分区与模型、效果、飞行数据步骤的结果合并为 `models` 组草稿。`models` 组只含非空的分区：没有模型、效果或飞行数据时只含图形分区，没有 Asset 时为空组，照常发送。
  - **组装与发送：** 全部转换完成后，以 [manifest-identity.ts](../../../src/content/manifest-identity.ts) 的 `applyManifestIdentity` 和 `productionIdentityBasis(指纹)`，对作业发送的全部组草稿（`cockpit-hud-map` 组、逻辑步骤的草稿、`audio` 组与 `models` 组）推导同一 `ManifestIdentity`，写入每个组清单；`applyManifestIdentity` 按 `RESOURCE_GROUPS` 排列各组，因此发送顺序为 `logic`、`models`、`cockpit-hud-map`、`audio`（不发送的组跳过），与草稿的传入顺序无关。发送任何组之前，先由 `checkPackageTransfers` 用 `readPayloadRecords` 与 `payloadTransferList` 校验每组的转移列表（位置与宿主相同，为 `groups.<组>.payloads`），并确认没有 buffer 跨组共享，以免发送前一组时使后一组失效；再以 `addBudgets` 算出最终用量。因此转换、预算、身份与最终用量的失败都不会发出组。之后逐组 `report.group`，返回用量。后续任务接入更多组时，身份须对全部已发送组重新推导，`validatePackage` 只比较各组身份是否相同，不会发现沿用的旧值。
  - **注入点：** `open` 默认是产品入口 `openVerifiedSource`，不传 `limits`，沿用 P2-02 的默认预算。`graphics`（`GraphicsStepInput`：映射、声明与份额）默认是[生产图形](./original-data.md#图形转换)的声明、映射与份额。`logic`（`LogicStepInput`：`convert` 与份额）默认是导出的 `PRODUCTION_LOGIC_STEP`，即上述 `convertLogic` 与 `convertRuleData` 的合并，以及两者份额之和；`convert` 返回 `{ drafts, usage, models }`。`audio`（`AudioStageInput`：音效表、SND 规则与可选限值）默认是生产音效表与规则。`models`（`ModelStepInput`：由绑定一并生成映射与声明的 `inputs`、查找表、效果的映射与声明 `effects`、飞行数据的映射与声明 `flightData` 与份额）默认是[生产模型](./original-data.md#生产模型)的 `productionModelMappings` 与 `productionModelDeclarations`、`PRODUCTION_MODEL_REFERENCES`、[效果步骤](./original-data.md#效果步骤)的生产映射与声明、`PRODUCTION_FLIGHT_DATA_MAPPINGS` 与 `PRODUCTION_FLIGHT_DATA_DECLARATIONS`，以及 `PRODUCTION_MODEL_SHARE` 与 `PRODUCTION_FLIGHT_DATA_SHARE` 之和。限值与用量用 `addBudgets` 逐维相加。只有测试传入其他打开函数或步骤输入，用合成白名单识别。
- **生产包配置（P2-11）：** [workers/production-package.ts](../../../src/workers/production-package.ts) 导出预期包配置的类型 `ExpectedPackageProfile`（`converterVersion`、`sourceFingerprint`、`limits`）与冻结的生产常量 `PRODUCTION_PACKAGE`，供主线程筛选缓存条目并核算提交与恢复（[P2-11 包预算与生产身份](../../plan/p2/11/spec.md#包预算与生产身份)）。
  - 值以常量写出，模块只导入 `content/`，因此主线程不会载入转换器与生产表；它虽在 `workers/` 中，lint 与依赖图都按消费者禁止它到达 `original-data`。
  - `converterVersion` 为 `osr-import.graphics-5.logic-2.audio-2.models-4`（P3-03/19；P3-09/11 的地图几何把图形组件递增为 `graphics-5`）。
  - `limits` 是图形、逻辑、模型三个阶段的已批准份额与 `AUDIO_BUDGET_LIMITS` 经 `addBudgets` 的逐维之和，`sourceReadBytes` 为 0。P3-03 之后为 812 个 Asset、1,408 条依赖边、16,568,320 字节 payload（P3-09/11 的地图几何份额再加 1 个 Asset 与 256 字节，为 813 与 16,568,576）、5,373,952 个像素、3,072 个调色板项，`vertices`、`triangles` 各 8,192、`glyphs` 768、`audioSamples` 4,194,304、`missionObjects` 256、`missionReferences` 4,096（P3-03 之前为 218、384 与 12,075,008 字节）。P3-03 的三个新份额由基准观测值按“2 倍，向上取整到 2 的幂”推导（[原版数据](./original-data.md#图形转换)的飞行图形与 HUD 文字份额，[规则数据](./original-data.md#规则数据转换)与[飞行数据](./original-data.md#飞行数据步骤)的份额）；logic 步骤（3 个 Asset、8 条边、7,593 字节、14 个对象、41 个引用）与 29 个声音（29 个 Asset、470,861 字节、304,035 个采样点）的基准观测在既有份额与音频限值之内，不调整。基准上的完整生产包用量为 408 个 Asset、611 条依赖边、3,783,074 字节，在限值之内（P3-03/26）。作业读取上限仍是上文的输入总字节，不另设。
  - 相邻 Node 测试从 `original-data` 派生三个值并逐一比较；转换器组件、生产白名单或任一份额改变时测试失败，须同步常量。测试还记录 P3-03 份额推导所用的基准观测值，由规则重算各份额，并核对 logic 与音频的观测值在现有限值之内。
  - 在开发者自己的数据上，`tools/package-check.ts` 用同一作业模块转换并对照这些限值，见[包核对](../../guides/tools.md#包核对)。
- **生产入口：** [workers/import-worker.ts](../../../src/workers/import-worker.ts) 把 `self` 断言为 `ImportHostEndpoint`，再用 `createImportJob()` 调用 `runImportHost`，不含其他逻辑。页面程序没有 WebWorker 类型，所以不另设类型程序。
- **测试支持：** [synthetic-import.test-support.ts](../../../src/workers/synthetic-import.test-support.ts) 的 `syntheticImport(covered, versionId)` 在 Node 与浏览器中都可用。
  - `SCENARIO_SOURCES` 列出会识别光盘的测试 Worker 场景各自的合成光盘与白名单版本 ID，Worker 测试入口与 P2-11 的应用测试入口共用它；`scenarioProfile(scenario)` 给出该场景所发资源包的预期包配置（白名单指纹；`synthetic` 用内容测试支持的转换器版本，其余用生产转换器版本；生产包预算），Node 测试证明它与场景实际发出的身份一致。
  - 它用 `syntheticFileDisc` 生成光盘（另含一个不读取的 1 MiB 填充文件，以免默认预算被耗尽），按块读出为名称含 `MARKER` 的 `File`。
  - 同时返回一个打开函数：用底层的 `openDiscImage` 与 `identifySource`，按 `catalogFor(covered)` 识别。
  - 同文件的 `syntheticGroupsJob(open, groups)` 先经注入的打开函数识别，以 `NO_GRAPHICS`、`NO_LOGIC`、`NO_AUDIO` 与 `NO_MODELS`（都不转换任何 Asset）运行转换阶段，丢弃作业自己的空 `models`、`cockpit-hud-map` 与 `audio` 组，再发送 `groups(指纹)` 给出的组，供只关心识别与组转移的测试使用；默认的 `boundGroups` 是绑定已识别指纹的四个合成组。
  - **合成光盘：** 生产图形的合成光盘由 [production-graphics.test-support.ts](../../../src/original-data/conversion/production-graphics.test-support.ts) 的 `productionGraphicsFiles(blocks, extra)` 生成，可替换或省略条目，也可加入其他条目；`productionGraphicsEntries` 给出同样的图形条目。
    - `graphicsCoveredFiles(corrupt)`：只有生产图形；
    - `productionCoveredFiles(corrupt)`：生产图形加上 `productionSoundEntries()`，即生产音效表各条目的合成 SND，供图形与音频阶段使用；
    - `audioCoveredFiles(corrupt)`（P2-08）：在生产图形结构的 `MAIN/SR.NOB` 中加入四个合成 SND 条目（其一为 16 位），`SYNTHETIC_AUDIO` 是把它们转换为完整 `audio` 组的合成音效表与规则（`flags` 取值只有测试含义），期望的转换用量为 `AUDIO_CONVERSION_USAGE`。P3-03 起另有 8 个 `event-sound` 与 3 个 `hud-sound`，其中 `SYNTHETIC_REPEATED_SOUND`（`sound/event/synthetic-2`）的 `flags` 9 按测试规则为 `repeat` 3 次，与生产的 8 次不同，以证明次数来自规则；`corrupt` 让开火音效的 `flags` 不被接受；
    - `sliceCoveredFiles({ scenario?, campaign?, corruptMesh? })`（P2-09、P2-06）：全部生产步骤都能转换的合成光盘。`SR.NOB` 为[生产模型](./original-data.md#生产模型)的 `productionSliceEntries`（图形条目、M2ID 与合法的绑定模型、效果模型、MESH、合成 RENS 条目、生产音效条目），`SCENARIO.NOB` 含战役表与可替换的所选任务，`SRANGERS.EXE` 由 `regionExecutable` 写入效果区域、生产图形区域（颜色表、下行格式与 64 条 HUD 文字）与规则数据的区域及 fixup；P3-03/19 起另含 `productionRuleData()` 在生产条目 ID 上生成的 `CRAFT.NOB`、`DEBRIS.NOB`、`AISTUFF.NOB` 与 `COMM.NOB`（转换用量为 `RULE_DATA_USAGE`），`SR.NOB` 还含 RENS 头部、EXIC/EXPL/ANIM/NEBC、飞行图像、TABL 10165、新 SND 与一个不读取的 MUSC 诱饵；`campaign`（P3-04）替换战役表及其僚机名单；`corruptMesh` 使五个模型共用的网格被模型步骤以 `invalid-payload` 拒绝。模型与效果步骤在其上的期望用量为 `PRODUCTION_MODEL_USAGE` 与 `PRODUCTION_EFFECT_USAGE`。
    - `cockpitCoveredFiles(corrupt)`（P2-07）：`SR.NOB` 含合成的 DATA、TEX、CCKD（slot 0 为前视布局，slot 1 为空，slot 2 为地图边框）、MFDD 与 TABL 条目。`cockpitGraphics(changes)` 是在其上转换的图形步骤输入（合成映射都为 confirmed，份额高于用量）：`cockpit-hud-map` 分区有飞行调色板、三个字库、前视与地图边框布局及其元素图像、元素的嵌入调色板、MFDD 与 TABL 记录，满足该组全部角色（P3-03 起另含目标显示屏背景及其调色板、视角标签，以及一个小型 EXE 上的 HUD 文字）；`models` 分区为一个贴图、其调色板与 `models` 飞行调色板。`changes` 可按 Asset ID 去掉 Asset，或替换声明与映射的字段（如置信度）；`COCKPIT_GRAPHICS_ASSETS` 列出各 Asset 的 ID、角色与组。`corrupt` 使一个前视元素的 +44 为 2，被转换器以 `invalid-payload` 拒绝。
    - 前三者的 4×6 字库表在 `corrupt` 时少一个字节（CCKD 仍为生产结构，只换字库）。期望的图形 payload 字节数由 `GRAPHICS_PAYLOAD_BYTES` 按 payload 长度公式给出，图形步骤的转换用量为 `GRAPHICS_CONVERSION_USAGE`，二者都含 P2-07 的 `COCKPIT_HUD_MAP_USAGE`；图形与音频阶段在 `productionCoveredFiles()` 上的转换用量为 `PRODUCTION_CONVERSION_USAGE`。`NO_MODELS` 是不转换任何模型或效果的模型阶段输入。生产模型阶段总是转换效果模型与效果数据，而这些光盘没有它们的来源，所以只关心图形或音频的作业同时传入 `NO_LOGIC` 与 `NO_MODELS`。
  - 同文件的 `syntheticOpen(covered, versionId)` 是单独的合成白名单识别，`syntheticSource(covered, versionId)` 在调用线程中打开与 `syntheticImport` 同一光盘的已验证来源（指纹相同），供 Node 侧推导期望；`productionSizedFiles()` 按生产白名单的路径与大小生成内容（`generatedContent`），形状与基准版本相同，内容从不是原版。
  - 测试 Worker 入口 [import-worker.test-support.ts](../../../src/workers/import-worker.test-support.ts) 与生产入口共用宿主，由 Worker 的 `name` 选择 [import-scenarios.test-support.ts](../../../src/workers/import-scenarios.test-support.ts) 注册的作业场景或协议脚本（`top-level-throw` 由入口自身在模块求值时抛错），Node 测试运行同一场景。`synthetic` 场景识别生产尺寸的合成文件后发送四个组，并在结束前确认发送过的 payload 视图都已失效，否则作业失败，因此正常结束即证明组是转移而非复制。`graphics`、`graphics-corrupt`（P2-05）与 `graphics-element-corrupt`（P2-07）场景对 `productionCoveredFiles()` 运行带图形与音频阶段、以 `NO_LOGIC` 与 `NO_MODELS` 跳过逻辑与模型转换的生产作业，因此 `graphics` 场景发送完整的生产 `cockpit-hud-map` 与 `audio` 组；两个损坏变体分别为 `productionCoveredFiles('font')`（4×6 字库短一字节）与 `productionCoveredFiles('element')`（第一个前视元素的绘制遍标志为 2），图形阶段以 `invalid-payload` 失败；页面与 Worker 用同一函数生成光盘。`audio` 场景（P2-08）对 `audioCoveredFiles()` 以 `NO_LOGIC`、`NO_MODELS` 与 `SYNTHETIC_AUDIO` 运行生产作业。`models` 与 `models-corrupt` 场景（P2-06）对 `sliceCoveredFiles()` 运行完整的生产作业，后者的共用网格损坏。`content-invalid` 场景（P2-11）识别同一光盘后，逻辑步骤抛出 `ContentContractError`，作业以 `content` 层失败。其余生命周期与失败场景见[工程约定](../README.md#本地浏览器-runner)，P2-12 的失败矩阵、时序与金丝雀场景见[联合与失败用例](../README.md#p2-12-联合与失败用例)。
  - **任务场景（P3-04）：** `MISSION_SCENARIOS` 列出四个任务场景，并记录各自在走向正式世界途中停下的阶段与稳定的失败。`models` 的名单只有 2 项，不满足生产配置（5 个僚机），所以另用任务光盘：`sliceCoveredFiles` 的战役表换成 [formats.test-support.ts](../../../src/original-data/formats/formats.test-support.ts) 的 `fiveWingmanCampaignSpec()`，5 个僚机选项的名字候选为 `FIVE_WINGMAN_NAMES`（依次 1、2、0、1、3 个；供配置页显示，不带 `MARKER`，其一含类似标记的文字以核对纯文本呈现）。
    - `mission-startable`：在任务光盘上运行完整生产作业。全包 `complete`、任务诊断 `loaded`，`createWorld` 以生产配置（`mission/first-campaign`、难度 19、默认步长）对无僚机与 0–4 都成功。
    - `mission-partial`：同一光盘，音效表去掉唯一的 `warp-sound`，`audio` 组为 `role-cardinality@roles.warp-sound` 而不被持有，全包为 `group-missing@groups.audio`，任务仍 `loaded`。
    - `mission-load-failed`：同一光盘，转换后名单第一项取玩家机种（与 `mission-invalid` 共用逻辑步骤），诊断 `failed`（`core-input`，`input.wingmanRoster.content.options[0].craftType`）。
    - `mission-create-rejected`：光盘中玩家记录请求两架（`twoPlayerRequestsScenarioSpec()`），诊断 `loaded`，`createWorld` 以 `CoreInputError`（`input.mission.content.declarations[0].ruleInputs.craftCount`）拒绝。
    - `scenarioFiles(name)` 给出场景光盘的 CloneCD 文件组；`scenarioGroups(name)` 在调用线程运行场景作业，返回发送的全部组（形状同持有者的组，可交给生产缓存预置）；预期包配置仍取 `scenarioEntryProfile(name)`。[mission-scenarios.test.ts](../../../src/workers/mission-scenarios.test.ts) 按导入作业所有者与持有者的规则核对上述结果。
  - [import-host.test-support.ts](../../../src/workers/import-host.test-support.ts) 的 `FakeEndpoint` 记录监听、发送、转移列表与关闭，并用协议读取函数核对宿主发出的每条消息，供宿主与作业的 Node 测试共用；`portEndpoint(port)` 把 Node `MessageChannel` 的一端包装为宿主端点。
- **集成测试：** [app/import/import-pipeline.test.ts](../../../src/app/import/import-pipeline.test.ts) 用 Node `MessageChannel` 把真实的持有者、平台适配、宿主与合成作业连在一起：消息经结构化克隆，组的 payload 以转移交出。它核对发送方视图失效、接收方验证与移交、每层失败经往返后与宿主转换的 DTO 相等、文件名只出现在 `start` 中，以及结束后不留下打开的 `MessagePort`。
  - **图形（P2-05）：** 识别进度 → `identified` → 图形进度 → 空的逻辑阶段 → 音频进度 → 不转换模型的模型阶段 → 只含图形分区的不完整 `models` 组与完整的生产 `cockpit-hud-map`、`audio` 组 → `finished`（用量含转换维度），以及识别失败、图形阶段读取失败（缺少条目、识别后端口拒绝读取）与转换失败各自保持层、code 与位置，快照停在相应阶段且没有部分结果。
  - **逻辑（P2-09）：** 在 `sliceCoveredFiles()` 上，消息依次经过识别、`identified`、图形、逻辑、音频、模型、`group`、`finished`；持有者验证全部四个组为 `group-complete`（P2-06 的效果 Asset 补齐角色，最近色规则确认后贴图不再未确认），`models` 组的验证与 Node 对收到的同一组消息的验证结果相同；各组身份相同，`takeGroups()` 只移交一次完整的组。不支持的任务（`source` 层 `unsupported-payload`）、份额不足（`source` 层 `budget-exceeded`，`limit` 完整）与注入的内容错误（`content` 层）都停在 `convert-logic`，不发送组，快照与消息不含文件名标记。
  - **音频（P2-08）：** 完整的 `audio` 组经通道转移、发送方视图失效、持有者移交且清单身份为生产值；SND 转换失败经往返后与宿主转换的 DTO 相等、没有组；组发送之后作业失败时，持有者丢弃已收的组。
  - **模型（P2-06）：** 网格损坏时，`source` 层 `invalid-payload@models[model/base-1].parts[0][1].mesh` 经往返后与宿主转换的 DTO 相等，快照停在 `convert-models`，没有组。作业测试另按失败边界一览覆盖模型映射核验、MESH 缺失与类型不符、光盘层失败，并核对发送的 `models` 组与 Node 由同一来源与绑定推导的组草稿相同。
- **Worker 端口：** [app/import/import-worker-port.ts](../../../src/app/import/import-worker-port.ts) 由 app 定义，platform 实现（ADR-0015 第 4 条）。
  - 工厂 `ImportWorkerPortFactory` 接收三个回调（收到消息、`messageError`、`error`），每次调用创建一个新 Worker，可能抛错。回调只传收到的数据或事件发生这一事实，不传事件对象、宿主错误文本或文件名。
  - `post(start)` 可能同步抛错。`terminate()` 先移除全部监听再终止，可重复调用，之后不再有回调。
- **平台适配：** [platform/workers/worker-port.ts](../../../src/platform/workers/worker-port.ts) 的 `connectImportWorker(worker, events)` 在最小的 `WorkerLike` 形状上实现端口，不用 DOM 类型，由 Node 测试覆盖。
  - 它注册 `message`、`messageerror`、`error` 三个监听，按上面的端口契约转交与终止；对 `error` 另调用 `preventDefault()`，错误文本不进入页面控制台。
  - [browser-import-worker.ts](../../../src/platform/workers/browser-import-worker.ts) 的 `browserImportWorkerFactory(createWorker)` 每次调用创建一个新 Worker。默认用 Vite 可识别的 `new Worker(new URL('../../workers/import-worker.ts', import.meta.url), { type: 'module' })`；浏览器测试传入 `createWorker` 载入测试入口。它是 `browser-*` 文件，只由应用程序检查。
  - [vite.config.ts](../../../vite.config.ts) 以 `worker.format: 'es'` 输出 Worker。P2-11 在 [browser-ports.ts](../../../src/app/browser-ports.ts) 中以默认工厂接线，生产构建因此产生独立的哈希 Worker chunk（`assets/import-worker-*.js`）；生产预览中的验证见[工程约定](../README.md#本地浏览器-runner)。
- **作业持有者：** [app/import/import-job-owner.ts](../../../src/app/import/import-job-owner.ts) 的 `createImportJobOwner({ createPort, reportError })` 同一时刻至多管理一个活动作业。它是 DOM-free 的，Node 测试用假端口。
  - **开始：** `start(files)` 只在空闲或终态时创建新作业，作业 ID 递增，每个作业一个新端口。
    - 有活动作业时返回 `busy`；文件数不在 1–4，或某项不是名称为 1–255 个 UTF-16 码元的 Blob 时返回 `invalid-files`；释放后返回 `disposed`。拒绝都不改变状态，也不创建端口。
    - 持有者用这些文件构造 `start` 请求，交给协议的 `readImportStartMessage` 核对，所以主线程从不发送 Worker 会拒绝的请求。读取结果就是冻结的私有 `{ name, blob }` 列表，只保留 Blob 引用，输入总字节也由它计算；发送 `start` 或作业结束后释放。
  - **握手：** 状态从 `starting` 开始；收到有效的 `ready` 后发送唯一的 `start`，进入 `running`。
    - 工厂抛错，或 `ready` 之前的 `error`、`messageError`，都报 `worker-start-failed@worker`；
    - `ready` 的版本不符时报 `protocol-error`，不发送 `start`；
    - 发送 `start` 抛错时报 `worker-failed@worker`。
  - **消息：** 用协议读取函数校验，再依次核对第二次 `ready`（`message.type`）、作业 ID（`message.jobId`，含 `jobId` 为 null 的 `failed`）与连续的顺序号（`message.sequence`）。
    - 进度的字节数不得减少或超过输入总字节（`message.readBytes`）；阶段只能按 `IMPORT_STAGES` 的顺序前进，识别之前不得有后续阶段的进度，识别之后或进入后续阶段之后不得再有较早阶段的进度（`message.stage`）；收到第一个组之后不得再有进度（同为 `message.stage`）；
    - `identified` 至多一次；组与 `finished` 须在识别之后，每组至多一次（`message.group`）；
    - `ready` 之后的 `messageError` 报 `protocol-error@message`，`error` 报 `worker-failed@worker`；
    - Worker 报告的 `failed` 原样成为快照的错误。
  - **组结果：** 按 spec 的验证顺序处理每个 `group`：
    - 外层由协议读取函数核对；组须在识别之后，每组一次；
    - `sources.sourceFingerprint` 须等于已识别的指纹，否则报 `invalid-result@groups.<组>`；
    - 用 `CLASSIC_P2_SLICE` 与 `validateGroup` 重新验证；可读的组须等于消息的组，否则报 `protocol-error@message.group`；
    - `group-complete` 连同 payload 保留，摘要的 `assets` 为描述符个数；`incomplete`（含清单无法读取、来源状态集格式错误或多余字段）只保留 P2-01 诊断，`assets` 为 null，不再引用其 payload。

    `finished.groups` 须与收到的组完全一致（顺序与集合），否则报 `protocol-error@message.groups`。快照的 `groups` 只含摘要 `{ group, status, assets, diagnostics }`，没有 payload 字节。
  - **移交：** `takeGroups()` 只在 `finished` 之后返回一次完整的组 `{ group, manifest, payloads, sources }`（按收到顺序），容器全部冻结：内部容器在协议读取时已冻结，保留的条目在验证通过后立即冻结，移交列表在接受 `finished` 时冻结。payload 视图从此归调用者独占。再次调用、开始新作业或释放之后，以及其他状态，都返回 null。作业以任何方式结束时都释放它保留的 payload 引用：完成时结果移入一个新的冻结列表，在端口终止之后与 `finished` 快照一起发布；失败、取消与释放丢弃全部已收结果。
  - **终态与隔离：** 结束、失败、取消与释放都先终止端口，每个作业恰好一次。工厂返回之前送达的回调先排队，发布 `starting` 后按序处理；作业结束之后的回调都被丢弃，所以旧作业的迟到消息不会影响新作业。
  - **命令与快照：** `cancel()` 只对 `starting`、`running` 生效，同步变为 `cancelled`。`dispose()` 可重复调用：终止活动端口、丢弃结果、清空订阅，之后的命令返回 `disposed`、false 或 null，快照不再变化。快照冻结，在两次变化之间保持同一对象；`failed` 与 `cancelled` 不含来源身份与组。订阅者同步收到通知，抛出的错误交给 `reportError`，不影响其他订阅者与状态；通知过程中被移除（包括因释放）的订阅者不再收到这次通知。
