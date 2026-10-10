---
type: plan
status: active
phase: P3
task: "03"
subtask: "19"
updated: 2026-10-09
---

# 19 — 切片定义版本 4 与生产包装配

**契约来源：** [spec](../spec.md) 的 S-13、S-14、S-15、AC-10（既有声音不变）、AC-12、AC-14（份额与生产包配置）、AC-15（Node）、AC-16、AC-18；[切片定义版本 4](../spec.md#切片定义版本-4)、[限值与预算](../spec.md#限值与预算)、[包身份与转换器版本](../spec.md#包身份与转换器版本)、[持久化与兼容](../spec.md#持久化与兼容)。
**依赖：** 07, 15, 17, 18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **切片定义：** [slice-definition.ts](../../../../../src/content/slice-definition.ts) 的 `SLICE_DEFINITION_VERSION` 由 3 递增为 4，追加 spec 表中的 13 个必需角色及其组、kind 与数量；`SliceRole` 同步，其余不变。
- **接线：** 修改 [import-job.ts](../../../../../src/workers/import-job.ts) 与各生产表：
  - **logic 组：** logic 步骤在 `convertLogic` 之后运行 15 的 `convertRuleData`，把两者的分区合并为一份 logic 组草稿；
  - **图形：** 把 16 的生产映射与声明并入 `PRODUCTION_GRAPHICS_MAPPINGS`/`DECLARATIONS`；
  - **models 组：** 模型阶段在效果步骤之后运行 17 的 `runFlightDataStep`，结果并入 models 组草稿；
  - **音频：** 把 18 的 11 行并入 `PRODUCTION_SOUND_TABLE`。

  阶段集合与消息形状不变，导入协议保持版本 5。
- **份额与限值：**
  - 用本地脚本（`local/research/p3-03/shares/`）在基准镜像上以不设上限的限值运行各步骤，取得新增 Asset 的实际用量；
  - 按“2 倍，向上取整到 2 的幂”推导，填入 `PRODUCTION_RULE_DATA_SHARE`、`PRODUCTION_FLIGHT_GRAPHICS_SHARE`、`PRODUCTION_FLIGHT_DATA_SHARE`，并接入作业限值；
  - 若 07 记录的事件用量超出现有 logic 份额，同样调整；音频的观测值超出 `AUDIO_BUDGET_LIMITS` 时按同一规则提高；
  - [production-package.ts](../../../../../src/workers/production-package.ts) 的 `limits` 由测试从各份额推导核对。

  观测值与推导结果写入完成证据，只记计数。
- **版本：** 输出发生变化的转换器各自递增组件（预计 `graphics-4`、`logic-2`、`audio-2`、`models-4`，以实际变化为准），`PRODUCTION_CONVERTER_VERSION` 仍是唯一定义。同步更新 `PRODUCTION_PACKAGE.converterVersion` 和固定该字串的测试与 E2E 断言，使它们与推导结果一致。
- **合成数据：**
  - [synthetic-content.test-support.ts](../../../../../src/content/synthetic-content.test-support.ts) 生成版本 4 的完整合成包，覆盖全部新角色；
  - [synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 与相关的生产测试支持，用代码生成的 AISTUFF、COMM、CRAFT、DEBRIS 封包、SR.NOB 新条目、新 SND 与 EXE 区域，组成合成光盘与白名单；
  - E2E 夹具随之更新。
- **测试：**
  - **AC-12：** 版本 4 的合成完整包为 `complete`；逐一去掉每个新增必需角色的 Asset，或改变 `event-sound`、`hud-sound` 的数量时为 `incomplete`；版本 3 的包报 `definition-version-mismatch`。
  - **AC-15（Node）：** 旧转换器版本的包不提供恢复，定义版本 3 的记录为 `cache-incompatible`，版本 4 的合成包可提交与恢复。
  - **AC-16：** 生产作业发送四组；读取日志只含映射引用的条目、区域与文件头和目录，每个条目在其步骤内只读一次，不读取闭包之外的条目；转换失败时不发送组，并带完整的 `limit`；协议与 P2-04 的失败矩阵通过。
  - **AC-10：** 既有 18 个声音 Asset 的 ID、角色与 payload 字节不变。
  - [logic-check.ts](../../../../../tools/logic-check.ts) 在版本 4 下继续通过。
- 运行既有 E2E（`pnpm test:e2e`），确认装配没有破坏导入、缓存、查看器与生命周期的回归；新增的浏览器断言归 20。

## 不包含

- 新增的浏览器断言与画面核对：归 20。
- 本地核对 CLI 与外观对照：归 21。
- 模块分册与指南：由 22 同步；本项在完成证据中列出接线、份额、组件与版本的变化。

## 关键文件与契约

- [slice-definition.ts](../../../../../src/content/slice-definition.ts)、[completeness.ts](../../../../../src/content/completeness.ts)（只读）、[converter-version.ts](../../../../../src/original-data/conversion/converter-version.ts)、[production-package.ts](../../../../../src/workers/production-package.ts)、[import-job.ts](../../../../../src/workers/import-job.ts)。
- [resource-cache-records.ts](../../../../../src/platform/storage/resource-cache-records.ts)（只读）：版本不符时为 `cache-incompatible`。
- 15、16、17、18 新增的生产表与步骤。

## 写入范围

- `src/content/**`：切片定义、合成内容包与受影响的测试。
- `src/original-data/conversion/**`：生产表合并、份额、转换器组件与受影响的测试。
- `src/workers/**`：作业接线、生产包配置、合成导入与测试。
- `src/app/**`：受版本与包形状影响的测试。
- `src/platform/storage/**`：缓存记录的测试。
- `tools/logic-check.ts`：版本 4 下的核对。
- `tools/logic-check.test.ts`：对应测试。
- `e2e/**`：版本字串与合成夹具。
- `local/research/p3-03/shares/**`：份额推导脚本与输出（被忽略）。

## 验收标准

- [x] AC-12：版本 4 完整、逐一缺少角色或数量不符时为 `incomplete`、版本 3 报 `definition-version-mismatch`；生产定义仍只有一份（工程边界回归）。
- [x] AC-14（份额与生产包配置）：份额由观测值按规则推导，`PRODUCTION_PACKAGE.limits` 由测试从各份额推导一致；观测值与结果已记录。
- [x] AC-15（Node）：组件已递增，`ConverterVersion` 只有一个生产定义；旧版本记录不恢复，版本 3 为 `cache-incompatible`，版本 4 可提交与恢复。
- [x] AC-16：生产作业的结果、读取日志、失败行为与协议回归如上。
- [x] AC-10：既有 18 个声音 Asset 不变，新增 11 个已在包中。
- [x] AC-18：边界回归与诊断隐私保持；合成数据只由代码生成。
- [x] `pnpm check` 与 `pnpm test:e2e` 通过。

## 验证方法

- Node 测试（内容、转换、Worker、缓存与持有者），使用代码生成的合成光盘。
- 本地份额推导只在 `local/` 中运行原版数据；不提交读数。
- `pnpm check`；`pnpm test:e2e` 只作回归，不替代 20 的新增断言。

## 完成证据

2026-10-09，worker `exec-p3-03-19`，基于认领提交 b86329e。

- **切片定义版本 4（AC-12）：** [slice-definition.ts](../../../../../src/content/slice-definition.ts) 的 `SLICE_DEFINITION_VERSION` 为 4，`SliceRole` 与 `roles` 追加 spec 表中的 13 个角色（logic 的 6 个 data、models 的 3 个 data 与 `hit-shimmer`、cockpit-hud-map 的 `target-display` 与 `view-labels` 各恰为 1，`event-sound` 恰为 8，`hud-sound` 恰为 3）。切片 ID、候选、配置、`groups` 与 `groupKinds` 都不变。[slice-definition.test.ts](../../../../../src/content/slice-definition.test.ts) 逐角色核对组、kind 与数量。[synthetic-content.test-support.ts](../../../../../src/content/synthetic-content.test-support.ts) 的合成包覆盖全部新角色，含爆炸表依赖的动画与帧、星云列表依赖的图像，以及跨组的爆炸音效，并导出 `VERSION_4_ROLES` 与 `P2_ROLES_SLICE`。后者只供校验单个步骤的部分组，生产定义仍只有 `CLASSIC_P2_SLICE` 一份（`tools/engineering-boundaries.test.ts` 通过）。[completeness.test.ts](../../../../../src/content/completeness.test.ts) 核对了以下各项：
  - 版本 4 的合成包为 `complete`；
  - 每个新增角色去掉一个 Asset 时报 `role-cardinality`；
  - 去掉动画、帧或星云图像时报依赖缺失，去掉爆炸音效时报跨组依赖缺失；
  - `event-sound` 为 7 或 9、`hud-sound` 为 2 或 4 时报 `role-cardinality`；
  - 整个包或单组为定义版本 3（及 1、2）时报 `definition-version-mismatch`。
- **接线（AC-16）：** [import-job.ts](../../../../../src/workers/import-job.ts) 在 `PRODUCTION_LOGIC_STEP` 中先运行 `convertLogic`，再在其用量之上运行 `convertRuleData`，用新增的 `mergeGroupDrafts`（[graphics-step.ts](../../../../../src/original-data/conversion/graphics-step.ts)，与 `stepGroupDraft` 共用合并）按 Asset ID 合并为一份 logic 组草稿，份额为 logic 份额加规则数据份额。模型阶段在效果步骤之后运行 `runFlightDataStep`，结果并入 `modelsGroupDraft`，份额为模型份额加飞行数据份额，最终用量取飞行数据步骤之后的累计用量。其余接线如下：
  - 图形：[production-graphics.ts](../../../../../src/original-data/conversion/production-graphics.ts) 追加 `PRODUCTION_FLIGHT_GRAPHICS_DECLARATIONS`/`MAPPINGS`，`PRODUCTION_GRAPHICS_SHARE` 加上 `PRODUCTION_FLIGHT_GRAPHICS_SHARE`；
  - 音频：[production-sounds.ts](../../../../../src/original-data/conversion/production-sounds.ts) 按 Asset ID 合并 `PRODUCTION_FLIGHT_SOUND_TABLE`，共 29 行。

  阶段集合、消息形状与导入协议版本 5 都不变（`import-protocol.test.ts` 通过）。按 rubber-duck 的发现，[audio-conversion.ts](../../../../../src/original-data/conversion/audio-conversion.ts) 改用 `stepEntryReader`，使映射核验与转换共用每个 SND 的一次读取（此前每个 SND 读两次）。输出不变，测试中的读取次数相应改为 1。
- **转换器版本（AC-15）：** 4 个组件的输出都已改变，因此全部递增为 `graphics-4`、`logic-2`、`audio-2`、`models-4`：
  - `graphics-4`：新增飞行图像与视角标签；
  - `logic-2`：logic payload schema 2 与规则数据；
  - `audio-2`：新增 11 个声音；
  - `models-4`：模型阶段新增飞行数据，组件注释已写明它覆盖整个模型阶段。

  `PRODUCTION_CONVERTER_VERSION` 为 `osr-import.graphics-4.logic-2.audio-2.models-4`，仍是唯一定义。固定该字串的单元测试与 [import-worker.spec.ts](../../../../../e2e/import-worker.spec.ts) 已更新。
- **AC-15（缓存）：**
  - [resource-cache-records.test.ts](../../../../../src/platform/storage/resource-cache-records.test.ts)：定义版本 3 的记录读为 `cache-incompatible`；
  - [resource-holder-cache.test.ts](../../../../../src/app/resources/resource-holder-cache.test.ts)：前一生产转换器版本 `osr-import.graphics-3.logic-1.audio-1.models-3` 的条目在 `PRODUCTION_PACKAGE` 下不提供恢复，同一指纹下当前版本的条目提供恢复；
  - 版本 4 合成包的提交、恢复与再校验由既有的 `assembleRestoredGroups`、持有者提交与恢复测试覆盖（合成包现为版本 4），都通过。
- **份额与生产包（AC-14）：** 本地脚本 `local/research/p3-03/shares/derive.ts`（输出在同目录 `out/`，只含计数，已忽略）以不设上限的限值，在基准镜像上运行本工作树的各步骤。观测值与按“2 倍，向上取整到 2 的幂”推导的份额如下：

  | 份额 | 观测值 | 推导结果 |
  |---|---|---|
  | `PRODUCTION_FLIGHT_GRAPHICS_SHARE`（带与不带飞行图形时图形步骤用量之差） | assets 205、dependencyEdges 204、paletteEntries 256、imagePixels 1,870,336、payloadBytes 2,078,499 | 512、512、512、4,194,304、4,194,304 |
  | `PRODUCTION_RULE_DATA_SHARE` | assets 6、payloadBytes 77,198 | 16、262,144 |
  | `PRODUCTION_FLIGHT_DATA_SHARE` | assets 20、dependencyEdges 222、payloadBytes 11,895 | 64、512、32,768 |

  另两项沿用现有值：
  - logic 步骤（含事件）的观测值为 3 个 Asset、8 条边、7,593 字节、14 个对象、41 个引用，在 `PRODUCTION_LOGIC_SHARE` 之内，不调整；
  - 29 个声音（只为计量，把 SND 10181 的 `flags` 8 当作播放一次）为 29 个 Asset、470,861 字节、304,035 个采样点，在 `AUDIO_BUDGET_LIMITS`（37 / 8,388,608 / 4,194,304）之内，不提高。

  `PRODUCTION_PACKAGE.limits` 改为 assets 810、dependencyEdges 1,408、payloadBytes 16,564,224、imagePixels 5,373,952、paletteEntries 3,072，其余不变。[production-package.test.ts](../../../../../src/workers/production-package.test.ts) 核对三件事：上限等于全部份额与音频限值之和；三个新份额由测试中记录的基准观测值按规则推导；logic 与音频的观测值在现有限值之内。
- **合成数据（S-15、AC-16）：**
  - 新建 [production-rule-data.test-support.ts](../../../../../src/original-data/conversion/production-rule-data.test-support.ts)：在生产条目 ID 上生成 CRAFT、DEBRIS、AISTUFF、COMM 封包与 SR.NOB 的 TABL 10165，在生产地址上生成 EXE 区域（7 条飞行消息、10 个名称与带 LE fixup 的内置程序表）。AI 内容为 3 个程序、3 个 DFPG 与 22 个脚本，条目 ID 改写为生产 ID。封包另含诱饵条目：CINF 4039、AISTUFF 6047/6049、COMM 2001/2011。
  - [production-graphics.test-support.ts](../../../../../src/original-data/conversion/production-graphics.test-support.ts)：`regionExecutable` 可写 fixup，`productionGraphicsEntries` 含飞行图形条目。
  - [production-models.test-support.ts](../../../../../src/original-data/conversion/production-models.test-support.ts)：`productionSliceEntries` 加入 RENS 头部、EXIC/EXPL/NEBC、TABL 10165、新 SND 与一个未映射的 MUSC 诱饵；[production-sounds.test-support.ts](../../../../../src/original-data/conversion/production-sounds.test-support.ts) 的生成顺序使既有 18 个合成 SND 不变。
  - [synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts)：`sliceCoveredFiles` 组成合成光盘与白名单；`SYNTHETIC_AUDIO` 增加 8 个事件与 3 个 HUD 声音，`cockpitGraphics` 增加目标显示屏背景与视角标签，使这些夹具的组在版本 4 下仍然完整。

  全部由代码生成。
- **AC-16（Node）：** [import-job.test.ts](../../../../../src/workers/import-job.test.ts) 的“production package”测试覆盖以下各项：
  - **结果：** 生产作业在合成光盘上发送四组，全包按版本 4 为 `complete`。13 个新角色的数量都符合定义，另有依赖闭包中的 17 个动画、186 帧与 15 个星云图像。
  - **规则数据封包：** 读取集合恰为映射条目，各在 `convert-logic` 读 1 次，诱饵不被读取。
  - **SR.NOB：**
    - 飞行图形的 TEX/BITM/TABL 在 `convert-graphics` 各读 1 次；
    - ANIM 在图形与模型阶段各读 1 次；
    - EXIC/EXPL/NEBC 在 `convert-models` 读 1 次；
    - RENS 在 `convert-models` 读 2 次（效果步骤与飞行数据步骤各一次）；
    - 每个声音在 `convert-audio` 读 1 次；
    - 未读取的只有 MUSC 诱饵与未绑定的 MODL。
  - **失败：** 规则数据超出 logic 阶段份额时不发送组，带完整的 `limit`（`assets` 8/9）。
  - **既有用例：** 原有的全阶段用例核对了合并后的 logic 草稿、累计用量与 Node 推导的 models 组；P2-04/P2-12 的失败矩阵也通过，其中几处随新数据更新了固定预期：
    - F-05 的首个缺失路径为 `MAIN/AISTUFF.NOB`；
    - F-08 的映射序号为 286，缺失声音为外部要求第 12 项；
    - 预算场景排除飞行图形；
    - 根目录 1,024 条记录的光盘因查找次数增加，另加一个白名单外的填充文件。

  EXE 区域的读取由 15、16、17 的步骤测试核对，作业测试未逐页记录。
- **AC-10：** [production-flight-sounds.test.ts](../../../../../src/original-data/conversion/production-flight-sounds.test.ts) 与 [production-sounds.test.ts](../../../../../src/original-data/conversion/production-sounds.test.ts) 核对两件事：合并后的表为 29 行、按 ID 升序、SND 互不相同、包含 11 个新行；18 个既有声音的 ID、角色与整条 SND 定位不变，与合并表一起转换时其描述符和 payload 字节与单独转换时相同。
- **logic-check：** [logic-check.ts](../../../../../tools/logic-check.ts) 用规则数据读取器核对 6 个规则数据 payload，只解码 3 个 logic payload 给 Core。`payloadBytes` 限值只对这 3 个 payload 计量。测试已更新并通过。
- **基准上的已知缺口（协调者决定，待用户裁决）：** 基准中 SND 10181（`sound/event/warp-arrival`）的 `flags` 为 8，其余 10 个新 SND 为 0 或 1（10409、10455 为 0）。P2-08 的 `PRODUCTION_SND_RULES` 只接受 0 与 1，按协调者指示未改，也未把 8 当作播放一次。因此基准上的生产作业（以及 `node tools/logic-check.ts`）在 `convert-audio` 以 `unsupported-payload` 失败关闭（`sources.mappings[6]…flags`），不发送任何组。只为计量把 8 当作播放一次时，同一作业得到版本 4 的 `complete` 包：logic 9 个、models 266 个、cockpit-hud-map 103 个、audio 29 个 Asset，包预算在 `PRODUCTION_PACKAGE.limits` 之内。决定后由单独的修复子任务处理；合成 SND 都用 0 或 1。
- **AC-18：** 新增的测试支持只用代码生成的值；诊断位置不含名称或字节。`pnpm check:original` 的 `findings` 为空，工程边界回归与 ESLint 通过。
- **检查：**
  - `pnpm check`：180 个文件、5,696 项测试与生产构建通过；
  - `pnpm check:original`：通过；
  - `pnpm test:e2e`（端口 5157/5158）：181 项全部通过。
- **E2E 适配：** 以下 E2E 改动只是回归适配，新增的浏览器断言归 20：
  - [import-worker.spec.ts](../../../../../e2e/import-worker.spec.ts)：版本字串、组内 Asset 数与用量；
  - [import-page.spec.ts](../../../../../e2e/import-page.spec.ts)：空间估计改为由 `PRODUCTION_PACKAGE.limits.payloadBytes` 计算（15.8 MiB）；
  - [failure-storage-lifecycle.development.spec.ts](../../../../../e2e/failure-storage-lifecycle.development.spec.ts)：F-13 的列表按键序比较，合成光盘指纹已变；
  - [viewer-page.spec.ts](../../../../../e2e/viewer-page.spec.ts)：键盘用例从列表最后一项按 Tab 到画面，因为列表现有数百个条目，环绕整页超时；版式用例改用不透明的 missile 图像，因为第一个图像现为带透明的爆炸帧，其棋盘格灰度与预期不符，交 20 核对。
- **Rubber-duck：** 两项发现都已采纳：
  - (1) 新 SND 在音频阶段被读两次，违反“每个条目在其步骤内只读一次”：改为共用 `stepEntryReader`；
  - (2) 读取日志未证明不读闭包外条目：加入 SR.NOB 的 MUSC 诱饵并核对全部未读条目。
- **Simplify：**
  - **采纳：**
    - 音频改用 `stepEntryReader`，不另写缓存；
    - logic 草稿合并改为 `mergeGroupDrafts`，不再把草稿伪装成图形步骤结果；
    - `entryOf` 复用 `rule-data.test-support.ts` 的导出；
    - 默认的生产规则数据夹具只构建一次；
    - 读取日志的 `entriesOf` 使用 `SourceMappingTable` 类型；
    - F-13 的键序比较器使用 `compareText`。
  - **未采纳：**
    - 第三份 `fixupRecord`：`ai.test-support.ts` 不在写入范围；
    - 给 `syntheticAiSources` 加 ID 参数，取代按布局改写 ID：同上；
    - 让盘面解析器缓存目录索引，取代加大填充：`disc/` 不在范围；
    - 查看器条目列表改为单一 Tab 停靠：`src/ui` 不在范围，可交 P4 或 20；
    - 用定义推导 `VERSION_4_ROLES` 或 E2E 的组构成计数：会使独立预期失去独立性；
    - 并行运行规则数据与飞行数据步骤：会改变进度与错误的确定顺序。
- **文档影响：** 本行写入范围内没有需要改的文档。交 22：
  - 模块分册：`mergeGroupDrafts`；音频步骤共用读取；`ModelStepInput.flightData`；三个份额常量与 `PRODUCTION_PACKAGE.limits`；组件版本；`VERSION_4_ROLES`/`P2_ROLES_SLICE`；`regionExecutable` 的 fixup 参数；
  - [本地导入指南](../../../../guides/local-import.md#缓存与重新导入)：说明须重新导入；
  - audio.md：记录 11 个新 SND 的 `flags` 观测值（8 个为 1、2 个为 0、SND 10181 为 8）。
