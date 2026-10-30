---
type: plan
status: accepted
phase: P2
task: "08"
updated: 2026-10-17
related: [ADR-0005, ADR-0007, ADR-0008, ADR-0015, U-004, U-027]
reviewed: sha256:b71a3cf9dbc9
---

# P2-08：核心音效转换与播放适配 — Spec

## 问题与目标

P2 退出条件要求切片的核心音效（开火、导弹、爆炸、Warp）从用户本地原版数据还原，并取得原版本地对照证据。当前的缺口有四类：

- **没有 SND 转换：** [audio](../../../original/formats/audio.md) 已确认 SND 的头部结构与样本区边界，但源码没有 SND 解析器或转换器。16 位样本的解释、`flags` 含义，以及四类玩法音效对应哪些源条目，都还未确认（U-004、U-027）。
- **音效 Asset 没有生产来源：** [P2-01](../01/spec.md) 定义了 `audio` 资源组和四个音效角色。按其已批准的闭包规则，切片模型经 MODL 音效槽引用的样本也属于闭包，但目前没有生产来源映射。
- **导入作业不产生任何组：** [P2-04](../04/spec.md) 的作业只识别来源。`ConverterVersion` 与 `ManifestIdentity` 也还没有生产者，因此任何转换结果都无法组成可缓存、可全包验证的规范内容。
- **没有播放端：** 仓库中没有 Web Audio 代码，也没有可供查看器试听或后续 Runtime 事件消费者调用的播放端口。

本任务交付以下内容：

1. 切片音效的 SND 定向解析，以及到紧凑规范采样的转换；
2. 生产音效来源映射与音频组转换，并接入 P2-04 的导入作业；
3. 首个转换任务必需的包身份（转换器版本与 manifest 身份），按 P2-09 已批准的共享机制实现；
4. `platform/audio/` 中的 Web Audio 播放适配，覆盖解锁、被阻止、停止、页面隐藏与释放；
5. 四类核心角色的定向研究与本地试听对照。

完成后的可观察结果：

- 在开发者本地基准镜像上，生产导入作业送出的 `audio` 组经持有者用 `validateGroup` 重新验证为 `group-complete`。
- 在 Chrome 中，合成采样经播放适配产生与预期一致的音频数据和非静音输出，停止、隐藏与释放后不再发声。
- 四类角色的源对应、采样解释及其置信度记录在 `docs/original/`，开发者的本地试听判定为一致。

全包可用、缓存接线与查看器试听界面由 P2-11 装配。

阶段范围依据[总计划 §12](../../master-plan.md#12-开发阶段与验收条件)，任务导航见[阶段索引](../tasks.md#p2-08-核心音效转换与播放适配)。

## 范围

### 包含

- **S-01 SND 定向解析与校验：** 在 `original-data/` 计划新增 SND 解析与转换模块。
  - 只经 P2-03 的已验证来源读取条目，按[音频格式](../../../original/formats/audio.md#1-snd-digital-sound-effects-confirmed-on-all-37-entries)校验头部、重定位与样本区。
  - 采样率、位宽与 `flags` 只接受[采样格式规则](#采样格式规则)列出的取值。未列出的值明确失败，不猜测默认值。
- **S-02 规范采样 payload：** 在 `content/` 计划新增与来源无关的[规范采样 payload](#规范采样-payload) schema 1，并提供唯一的读取与浮点映射。
  - payload 保留源 PCM 的紧凑编码，不在导入时重采样或展开为浮点。
  - 转换器、播放适配和本地对照脚本使用同一份映射。
- **S-03 切片音效集合与生产映射：** 在 `original-data/` 计划新增唯一的生产音效表，为[切片音效集合](#切片音效集合)中的每个 sound Asset 记录以下内容：
  - 规范 ID 与角色；
  - P2-01 `SourceMapping`，包括 locator、精确别名、置信度、U 项与证据。

  Asset ID 遵循 [Asset ID 规则](#asset-id-规则)，不含条目编号或未确认的槽位含义。
- **S-04 定向研究：** 按[研究要求](#研究要求)，只确认切片音效实际需要的事实，并记入 `docs/original/`：
  - 16 位样本解释；
  - 切片样本出现的 `flags` 值及其含义；
  - 声道布局；
  - 四类核心角色到源条目的对应；
  - 角色经 MODL 选取时，相应音效槽的含义。
- **S-05 音频组转换与预算：** 把生产音效表转换为 P2-01 `GroupInput`，内容包括清单描述符、独占的 payload 与来源状态集。
  - 读取任何 SND 块（包括核验读取）之前，先按[音频转换预算](#音频转换预算)做目录预检；每个 payload 在分配前都已通过预检。
  - 样本格式在规则之内、但必需的角色映射未达到可用置信度时，结果是带诊断的 `incomplete`，不补默认资源。
- **S-06 包身份生成：** 实现 P2-09 已批准 spec 定义的共享机制：唯一的生产常量 `PRODUCTION_CONVERTER_VERSION`，以及由同一作业全部组草稿确定性推导的 `ManifestIdentity`，见[包身份](#包身份)。
  - 作业在全部转换阶段完成后，为包内所有组（即作业发送的组）计算同一身份，再发送各组。
  - 后续转换任务复用这套机制，不另立第二套。
- **S-07 导入作业与协议接入：** 按 P2-04 预留的扩展方式接入音频转换，协议变化见[导入协议变化](#导入协议变化)：
  - 在生产导入作业中追加 `convert-audio` 阶段，位于 P2-05 的 `convert-graphics` 之后；
  - 转换错误按 P2-05、P2-09 的做法扩展 P2-03 的 `SourceError`，经既有的 `source` 层传递，不新增错误层；
  - 递增协议版本，并同步宿主、持有者、平台适配与既有测试。
- **S-08 Web Audio 播放适配：** 在计划新增的 `platform/audio/` 中提供[播放控制器](#播放控制器)。
  - DOM-free 的控制器只依赖注入的最小音频能力，由 Node 测试覆盖；`browser-*` 工厂接入真实的 `AudioContext` 与页面生命周期。
  - 控制器按 Asset ID 载入规范采样，提供播放、停止、快照与订阅，是 P2-11 试听与后续 Runtime 事件消费者调用的最小端口。
- **S-09 解锁、生命周期与释放：**
  - 音频只在用户手势调用 `unlock()` 后开始运行，被浏览器阻止时如实报告。
  - 页面隐藏时停止全部发声并挂起，不排队补播。
  - 释放后停止发声、移除监听并关闭上下文。任何声音都不能越过已释放的控制器继续播放。
- **S-10 边界与隐私：**
  - 原版 locator 只留在 `original-data/`；`platform/audio/` 不导入 `original-data`、`render`、`ui`、`app`、`workers`，也不使用网络 API。
  - 诊断不含样本字节、宿主错误文本或私人路径。
  - 自动测试只用代码生成的合成 SND 与采样；不新增依赖。
- **S-11 验证：** Node 测试覆盖解析、payload、映射、转换、预算、身份、协议与控制器。真实浏览器验证在 Chrome 的开发项目中进行：
  - 音频播放与生命周期；
  - 含音频阶段的 Worker 作业。

  开发者本地完成两项人工核对：基准镜像核对，以及原版试听对照。
- **S-12 文档对齐：** 同步以下文档：
  - [源码结构指南](../../../engineering/source-structure.md)：新增模块，并把 `platform/audio/` 从后续方向改为当前目录；
  - [工程约定](../../../engineering/README.md)：边界规则、测试与浏览器命令；
  - P2-04 协议的当前说明；
  - 研究事实与 U 项状态。

### 不包含

- **音乐与其他媒体：** SONG/MUSC、Smacker 音轨、通讯画面音频与 MIDI/OPL 合成，按 [ADR-0005](../../../decisions/ADR-0005-video-music-interface-first.md) 由 spike 决定（P4）。
- **玩法反馈规则（P3）：**
  - 何种事件播放哪个变体；
  - 声像、距离衰减与混音优先级；
  - 原版同时发声的路数；
  - 正式开火、Warp 等领域事件。本任务不新增假的事件。
- **装配与界面（P2-11）：**
  - 导入页面、查看器试听控件与面向玩家的文案；
  - 缓存提交与恢复的接线、全包“资源可用”判定；
  - 用真实界面点击进行的实机解锁与听感检查。
- **联合原版对照（P2-12）：** 经查看器在浏览器中完成的最终保真对照与网络审计。
- **模型与其他资源：**
  - 模型转换和模型到音效的依赖边：P2-06；
  - 图像、字体、驾驶舱与任务数据：P2-05、P2-07、P2-09。

  P2-06 若发现弹丸、导弹或碎片表现引用了本任务集合之外的 SND，用本任务的转换器与生产表追加，不另建第二套 SND 转换。
- **切片定义：** 不修改 `CLASSIC_P2_SLICE` 的角色、数量范围或分组，也不改变 P2-01 至 P2-03、P2-10 的错误码与预算语义。
- **作业级读取预算：** 不收紧 P2-02 的作业级默认读取预算；各转换阶段汇合后的组合上限由 P2-11 统一确定。本阶段的读取如实计入来源用量，转换产物受[音频转换预算](#音频转换预算)约束。
- **设置与持久化：** 音量设置及其 localStorage 持久化（P4/P5）；IndexedDB 由 P2-10 负责，本任务不改。
- **其他：**
  - 重采样、压缩，以及 WAV/OGG 等导出格式；
  - `decodeAudioData` 编解码、AudioWorklet，以及任何新依赖；
  - Firefox/Safari 与移动设备矩阵（P5）。

### 涉及模块

| 模块 | 责任与影响 |
|---|---|
| `src/original-data/`（计划新增模块） | SND 解析与转换、生产音效表、生产 `ConverterVersion` 常量，以及 `SourceError` 的追加 code 与预算限值名。只经产品入口与 `verifySourceMappings` 取得原版字节，受现有[底层能力边界](../../../engineering/README.md#lint-规则eslintconfigjs)约束 |
| [src/original-data/synthetic.ts](../../../../src/original-data/synthetic.test-support.ts) | 扩展合成 SND 与含 SND 的 IMFAT 构造，供测试使用；不含原版字节 |
| `src/content/`（计划新增模块） | 规范采样 payload 的写入、读取与浮点映射；`ManifestIdentity` 的纯计算。既有导出与契约不变 |
| [src/workers/](../../../../src/workers/) | 协议版本递增（`convert-audio` 阶段与顺序规则）、生产作业的音频阶段与包身份组装；宿主的错误转换不变。测试可注入合成识别与合成音效表 |
| [src/app/import/](../../../../src/app/import/) | 持有者接受新阶段，执行新增的顺序规则；组结果的验证顺序不变 |
| [src/platform/workers/](../../../../src/platform/workers/) | 只随协议版本同步，行为不变 |
| `src/platform/audio/`（计划新增） | DOM-free 播放控制器与 `browser-*` 工厂；不建通用音频引擎 |
| [e2e/](../../../../e2e/)、[playwright.config.ts](../../../../playwright.config.ts) | 新增只在开发项目运行的音频播放用例；扩展导入 Worker 用例，加入音频阶段；必要时在 `e2e/support/` 增加只读探针 |
| [eslint.config.js](../../../../eslint.config.js)、[engineering-boundaries.test.ts](../../../../tools/engineering-boundaries.test.ts) | 新增 `platform/audio/` 的边界规则与回归；既有边界不放宽 |
| `docs/original/`、[源码结构](../../../engineering/source-structure.md)、[工程约定](../../../engineering/README.md) | 研究事实与 U 项，模块、协议与测试说明 |
| `src/core/`、`src/render/`、`src/ui/`、`src/app/` 其余部分 | 不改 |

## 当前实现与依据

- **原版格式与研究状态：** SND 的结构事实、已确认与未确认的部分，以及模型音效引用的结构核对，都以 [audio](../../../original/formats/audio.md) 为准；MODL 音效槽的结构与未确认含义见 [mesh](../../../original/formats/mesh.md#2-modl-structure-confirmed-on-all-19-entries)（U-027）；选定候选引用的 MODL 与 SND 数量见[候选来源概况](../../../original/formats/scenario.md#campaign-candidate-source-profiles-confirmed-structure)；SND 所在封包见 [imfat §4](../../../original/formats/imfat.md#4-type-distribution-per-file-confirmed)。本 spec 不复述这些事实，只引用它们，并把其中未确认的部分（16 位样本解释、`flags` 含义、玩法音效角色，即 U-004 的音效部分与 U-027 的音效槽）作为[研究要求](#研究要求)中的门槛。
- **已有的模型音效读取：** [payloads.ts](../../../../src/original-data/payloads.ts) 的 `parseModel` 返回 `soundIds`；[nob-check](../../../../tools/nob-check.ts) 核对它们都指向 SND 条目。
- **切片契约（P2-01，已实现）：**
  - [slice-definition.ts](../../../../src/content/slice-definition.ts) 的 `CLASSIC_P2_SLICE`：`audio` 组只拥有 `sound` kind；`fire-sound`、`missile-sound`、`explosion-sound`、`warp-sound` 各至少 1 个 Asset，没有上限。
  - [asset-units.ts](../../../../src/content/asset-units.ts)：sound 的计量单位是独立采样片段，采样点是其内部元素。[budget.ts](../../../../src/content/budget.ts) 的 `audioSamples` 以采样点计。
  - [P2-01 候选选择记录](../01/spec.md#候选选择记录)确定了 5 个模型：玩家、2 个敌机、基地与 1 个额外友方模型。其闭包规则把模型可达的样本计入切片。
- **来源映射（P2-01/03，已实现）：**
  - [source-mapping.ts](../../../../src/original-data/source-mapping.ts) 的 `SOURCE_ENTRY_TYPES` 规定 sound 只能来自 `SND`。`SourcePart.alternatives` 表达精确别名；`assetSourceStates` 把 `likely` 与 `confirmed` 的已核验映射都视为 `verified`。
  - [verify-source-mappings.ts](../../../../src/original-data/source/verify-source-mappings.ts) 在已验证来源上核对 locator 与别名。
  - **尚无任何生产映射表。**
- **读取入口（P2-03，已实现）：** [open-verified-source.ts](../../../../src/original-data/source/open-verified-source.ts) 是取得原版字节的唯一产品入口。封包句柄的 `read(id, type)` 返回条目字节与重定位，单条目受 P2-03 的 4 MiB 上限约束，见 [imfat §6](../../../original/formats/imfat.md#6-observed-maxima-against-the-readers-limits-confirmed)。
- **导入作业（P2-04，已实现）：**
  - **阶段：** [import-protocol.ts](../../../../src/workers/import-protocol.ts) 的协议版本为 1，阶段只有 `identify-source`，错误层为 `disc`、`source`、`content`、`import`。
  - **作业：** [import-job.ts](../../../../src/workers/import-job.ts) 识别后即结束，不产生组。
  - **P2-05 合入后（执行期修订三）：** 协议版本为 2，阶段为 `identify-source`、`convert-graphics`；`canReportStage` 统一规定转换阶段的进度只在 `identified` 之后、阶段按集合顺序不回退。作业识别后运行图形步骤，步骤结果按 [P2-05 技术决定 8](../05/spec.md#技术决定) 留在作业内，由 P2-06/07 装配为组，不发送组；`finished.usage` 为来源用量与图形转换用量之和。
  - **扩展方式：** [P2-04 S-03](../04/spec.md#包含) 规定转换任务在同一作业中追加步骤与阶段；其[消息协议](../04/spec.md#消息协议)规定消息形状、阶段集合或顺序规则变化时递增协议版本。持有者按[组结果的验证顺序](../04/spec.md#组结果的验证顺序)用 `validateGroup` 重新验证组结果。
- **身份与缓存（P2-01/10，已实现）：**
  - **全包一致：** [content-identity.ts](../../../../src/content/content-identity.ts) 定义 `ConverterVersion` 与 `ManifestIdentity` 的令牌语法。[completeness.ts](../../../../src/content/completeness.ts) 的 `validatePackage` 要求四组身份完全一致。
  - **生成规则：** P2-01 把 manifest 身份的生成算法交给“P2-03 与转换任务批准”，见其[清单与版本](../01/spec.md#清单来源与版本)，目前没有生产者。P2-09 已批准的 spec（“包身份与转换器版本”一节）定义了共享机制：唯一的生产常量与全包推导，由先落地的转换任务实现，后续任务复用。
  - **并行任务的错误约定：** P2-05、P2-09 已批准的 spec 都以追加 code 的方式扩展 P2-03 `SourceError`，经 `source` 层传递，不新增错误层；P2-09 定义的 `invalid-payload`、`unsupported-payload` 可供本任务复用。预算超限复用 P2-05 已落地的 `budget-exceeded`（`limit.name` 为 P2-01 预算维度），`limit-exceeded` 只表示结构限值。
  - **缓存键：** [P2-10](../10/spec.md#缓存键与身份) 的缓存键含 `ConverterVersion`。
- **播放端：**
  - 仓库中没有 Web Audio 代码，`src/platform/audio/` 不存在。[源码结构指南](../../../engineering/source-structure.md#后续扩展方向)的阶段方向表把它列在 P4，但该表只是职责落点，不是已批准清单；[P2 阶段索引](../tasks.md#p2-08-核心音效转换与播放适配)把 Web Audio 端口分配给本任务。
  - 相邻的平台适配可作为模式参考：P2-10 的 [platform/storage/](../../../../src/platform/storage/) 是 DOM-free 契约加 `browser-*` 适配；[browser-session-host.ts](../../../../src/platform/browser/browser-session-host.ts) 管理页面可见性监听。
- **冻结决定：**
  - **技术选型：** [总计划 §2](../../master-plan.md#2-冻结的技术选型) 冻结了 Web Audio 适配层。
  - **解锁与后台：** [§8](../../master-plan.md#8-浏览器运行存档与隐私) 要求音频在用户点击后解锁，并处理被浏览器阻止的情况；切换后台时暂停。
  - **事件与释放：** [§5](../../master-plan.md#5-状态管理与通信约定) 规定音效属于一次性事件，由 Runtime 发布到 Event Bus 后经订阅消费；音频资源随会话销毁。
- **基准环境：** 原版数字音效经 Miles `SB16.DIG` 输出到 Sound Blaster 16，见[基准环境](../../../guides/baseline-environment.md)。本地对照在该配置下进行。
- **浏览器测试：**
  - [resource-cache.spec.ts](../../../../e2e/resource-cache.spec.ts) 是在开发项目中导入 `/src` 模块的先例。
  - [native-lifecycle.spec.ts](../../../../e2e/native-lifecycle.spec.ts) 用 CDP `Target.activateTarget` 产生真实的页面隐藏。
  - Playwright 不设置 Chromium 的自动播放策略开关。

## 行为与边界

### 切片音效集合

`audio` 组包含切片闭包中的全部 sound Asset：

1. **核心角色：** 四类角色各至少 1 个 Asset，各自对应切片内的飞船、基地或武器实际会触发的原版样本。同一角色若有多个不同样本，都纳入为该角色的变体；某个变体何时播放由 P3 决定。
2. **模型可达样本：** P2-01 选定的 5 个模型在 MODL 音效槽中引用的全部非零 SND。
3. **P2-06 追加：** P2-06 确认的弹丸、导弹或碎片表现若引用了额外的 SND，由 P2-06 用本任务的生产表与转换器追加。

在同一角色内，同一源样本只形成一个 Asset：

- 既属于核心角色又被模型引用的样本，使用核心角色的 ID 与角色；
- 同一角色内精确重复的源条目，作为同一部件的 `alternatives`，由 `verifySourceMappings` 核对字节、元数据与重定位完全相同。

不同核心角色用到字节完全相同的不同条目时，每个角色各有一个 Asset。原因是 P2-01 的描述符只有一个角色，而两个角色在原版中是不同事件。具体规则：
- 每个 Asset 只映射到原版为该角色实际播放的条目，另一个角色的重复条目不列为它的 `alternatives`；
- 每个 SND 条目仍只属于一个 Asset，两个 Asset 的 payload 字节与指纹相同；
- 研究发现，导弹发射与 Warp 开始用的正是这样一对精确重复的条目，见 [audio](../../../original/formats/audio.md#slice-sample-set-and-role-correspondences-p2-08)。

若两个核心角色用到同一个条目，仍记为契约问题，修订本 spec。

### Asset ID 规则

- **核心角色：** ID 为 `sound/<角色词干>`，角色词干是 `fire`、`missile`、`explosion` 或 `warp`。有多个变体时追加一段：用途已确认的用该用途命名，如 `sound/warp/start`；用途未确认的用中性序号，如 `sound/fire/v1`。描述符的 `role` 是对应的切片角色，如 `fire-sound`。
- **其他模型可达样本：** ID 为 `sound/model-clip/<两位序号>`，`role` 为 `model-sound`。ID 和 `role` 都不表达槽位含义。
- **ID 的分配与稳定：**
  - 序号在生产表中一次分配后冻结，不由条目编号、文件名或槽位推导；
  - 更换来源条目不改变 ID；
  - 研究确认某个中性样本属于核心角色而需要改名时，作为输出变化递增本任务的转换器版本组件；
  - 全部 ID 都须满足 P2-01 的 [Asset ID 语法](../01/spec.md#asset-id-与角色)。
- **依赖与可见范围：** sound Asset 没有依赖。模型到样本的依赖边由 P2-06 依据本任务的生产表建立，不自行命名 sound ID。

### 采样格式规则

转换器对每个映射到的 SND 条目，按下列顺序核对。任何一项不符都使整个转换失败，不跳过该条目：

| 项 | 规则 | 失败 code（`source` 层） |
|---|---|---|
| 块与重定位 | 块至少 20 字节；恰有 1 个重定位，位置为 0；该处偏移值为 20 | `invalid-payload` |
| 样本字节数 | 等于块大小减 20，且为帧大小（位宽字节数 × 声道数）的正整数倍；帧数至少为 1 | `invalid-payload` |
| 位宽 | 8 或 16 | `unsupported-payload` |
| 采样率 | 8,000–44,100 Hz 的整数，包含两端 | `unsupported-payload` |
| `flags` | 只接受研究确认含义后列入生产转换规则的值，并按其含义得到声道数与循环方式；其他值一律拒绝 | `unsupported-payload` |

- **编码：** 8 位映射为无符号编码。16 位映射为有符号小端编码，前提是研究已把这一解释确认为至少高概率，见[研究要求](#研究要求)。
- **采样率：** 原样保留，不重采样。下限取 Web Audio `createBuffer` 保证支持的最低采样率；上限取 Sound Blaster 16 的最高采样率，基准观察值都在其中。
- **转换结果：** 样本字节按规范编码原样复制到新的独占缓冲，不修改源视图。
- **核对与分配的顺序：** 任何 SND 块被读取之前（包括 `verifySourceMappings` 的核验读取），先按[音频转换预算](#音频转换预算)的目录预检核算；声明的长度通过校验之前，不按它分配任何缓冲。

### 研究要求

研究只针对切片音效集合。结论、置信度与证据写入 `docs/original/formats/audio.md`；如涉及 MODL 槽位，同时写入 `mesh.md`。同步更新 [U-004、U-027](../../../original/unknowns.md#数据与格式) 的状态。

| 事项 | 方法与证据要求 | 进入生产转换的门槛 |
|---|---|---|
| 16 位样本解释 | 本地脚本对切片中的 16 位样本，比较有符号小端、无符号小端与有符号大端三种解释的均值与相邻差分统计，再经试听确认。只记录统计量与结论 | 至少高概率 |
| 切片样本出现的 `flags` 值 | 列出切片样本实际出现的值。按需结合只读 Ghidra（只记录函数地址与行为）、样本长度与声道的一致性，以及试听，确定每个值对应的声道数与循环方式 | 每个出现的值至少高概率。未出现的值不研究，转换时拒绝 |
| 四类核心角色的源对应 | 只读 Ghidra 定位开火、导弹、爆炸与 Warp 时的播放调用，确定它们用的是 MODL 槽位索引、固定条目编号还是其他表；在基准 DOSBox-X 中单独触发每类事件，比对候选样本；必要时研究 EXPL 等表中的音效引用，但只研究到能确定对应为止 | 每个角色的每个变体至少高概率，并有试听一致的判定 |
| 相关 MODL 音效槽 | 某个角色经槽位选取时，记录该槽的含义；其余槽保持未确认 | 只限已用到的槽位 |

- **门槛的含义：** 门槛只决定能否写入生产转换规则或生产表，不代表映射一定达到 `confirmed`。映射的 `confidence`、`unknowns` 与 `evidence` 按研究结论如实填写。
- **两类门槛分开处理：**
  - **采样解释（16 位解释、`flags`、声道）：** 没有达到门槛的解释不写入生产转换规则，因此不存在可合法产生的 payload。转换时遇到规则之外的格式，一律以 `source/unsupported-payload` 失败，不产生猜测的 payload，也不以不完整组代替。
  - **角色与来源对应：** 样本格式已在规则之内、但角色对应尚未达到门槛时，映射可以以 `unconfirmed` 写入生产表；转换照常进行，`audio` 组按 P2-01 规则为 `incomplete`（`source-not-ready`）。某个核心角色尚无任何映射时，组同样为 `incomplete`（`role-cardinality`）。
- **阻塞规则：** 任何必需事项达不到门槛时，本任务按阻塞处理，记录受影响的验收项与恢复条件。不能用合成数据、近似规则或按槽位顺序命名来补齐。
- **证据边界：** 只记录结构位置、编号、计数、统计量与判定。原版样本、反编译输出与本地生成的音频文件都留在 `local/`。

### 转换与导入作业

| 场景或状态转换 | 预期结果 | 拒绝或失败时的反馈 |
|---|---|---|
| 正常导入 | 依次为 `identify-source` 进度、`identified`、P2-05 的 `convert-graphics` 进度、`convert-audio` 进度（阶段开始一次，之后每次端口读取一次）、`group`（`audio`）、`finished`。持有者重新验证得到 `group-complete`，`takeGroups()` 返回该组 | — |
| 样本格式在规则之内，但必需的角色映射为 `unconfirmed` | 仍转换并发送组；作业正常结束 | 持有者记录 `incomplete`，诊断为 `source-not-ready`，带对应 U 项；`finished` 不代表可用 |
| 某个核心角色在生产表中没有任何映射 | 仍转换并发送组；作业正常结束 | 持有者记录 `incomplete`，诊断为 `role-cardinality` |
| 映射的条目不存在或类型不符（目录预检时发现），或别名不同（核验读取时发现） | → `failed`，不发送组 | `source` 层原 code（`entry-not-found`、`entry-type-mismatch`、`alternatives-differ` 等）与映射路径 |
| SND 头部、重定位或长度不合规则 | → `failed` | `source/invalid-payload`，位置为结构路径 |
| 位宽、采样率或 `flags` 不在接受范围 | → `failed`，不产生猜测的 payload | `source/unsupported-payload` |
| 目录预检或实际核算超出预算（含安全整数溢出） | → `failed`。预检超限时，任何 SND 块都不被读取（包括核验读取）；对应 payload 都不分配 | `source/budget-exceeded`，`limit` 为 `{ name: <预算维度>, limit, observed }`，溢出时 `observed` 为 null |
| 读取失败 | → `failed` | `disc` 层原 code |
| 音频阶段中取消 | 与 P2-04 相同：同步变为 `cancelled`，Worker 终止 | — |
| 识别失败或不是基准版本 | 不进入音频阶段 | 与 P2-04 相同 |
| 已发送组之后作业仍失败（例如后续组的转移失败，或结束用量无效） | → `failed` | 持有者按 P2-04 丢弃全部已收的组，`takeGroups()` 不移交任何结果 |

**不变量：**

- 组在全部转换阶段完成、包身份算出之后才发送；第一个 `group` 之后不再有进度消息。
- 发送第一个组之前，作业先完成全部组草稿、转移列表与结束用量的校验。因此转换、预算与身份的失败都发生在发送之前，不会发出任何组。
- 消息发送本身不是原子的：发送开始后若仍失败，由持有者丢弃已收的全部组，不暴露移交结果（沿用 P2-04）。
- 每个 payload 视图独占其缓冲，发送后在 Worker 侧失效（沿用 P2-04 的转移规则）。作业失败时，Worker 中已转换的 payload 随 Worker 终止释放。

### 播放控制器

| 场景或状态转换 | 预期结果 | 拒绝或失败时的反馈 |
|---|---|---|
| 创建控制器 | 状态为 `idle`；不创建 `AudioContext`。订阅页面生命周期宿主，并从宿主取得初始可见性 | — |
| `load(sounds)` | 用 `content` 的读取器校验每个规范采样，逐个创建音频缓冲；整批成功后才登记。可以在 `idle` 状态下进行 | 任一项失败则整批不登记：`invalid-sound-payload`（带 Asset ID）、`duplicate-sound`、`audio-unavailable` 或 `audio-failed` |
| 页面可见时调用 `unlock()`（须在用户手势处理中） | `idle`：创建唯一的 `AudioContext`，未运行时调用 `resume()`。`locked` 或 `suspended`：调用 `resume()`。`running`：无操作。之后状态由上下文的 `statechange` 驱动，运行即为 `running` | `unavailable`、`failed`、`disposed` 时不做任何事，返回当前状态；构造器缺失或抛错时变为 `unavailable` |
| 页面隐藏时调用 `unlock()` | 不创建上下文，也不调用 `resume()` | 返回当前状态 |
| 浏览器阻止自动播放 | 状态保持 `locked`，不等待 `resume()` 的 Promise；之后在新的手势中再次 `unlock()` 可以成功 | `play` 返回 `audio-locked` |
| `play(id)`，状态为 `running` | 创建新的发声，返回唯一 voice 句柄；循环方式为 `whole` 时持续循环直到停止。自然结束后断开节点、释放句柄 | `unknown-sound`；同时发声数达到导出常量上限时为 `voice-limit` |
| `play(id)`，状态不是 `running` | 不排队、不延后播放 | `idle`/`locked` 为 `audio-locked`，`suspended` 为 `audio-suspended`，`unavailable` 为 `audio-unavailable`，`failed` 为 `audio-failed`，`disposed` 为 `disposed` |
| `stop(voice)`、`stopAll()` | 立即停止并断开对应节点，释放句柄；可重复调用 | 未知或已结束的句柄返回 false，不抛错 |
| 页面隐藏（`visibilitychange` 为 hidden，或 `pagehide`） | 先停止全部发声。只有状态为 `running` 时才挂起上下文，状态变为 `suspended`，并记为“因隐藏而挂起”。`idle`、`locked` 与三个终止状态不变 | — |
| 页面恢复可见（`visibilitychange` 为 visible，或 `pageshow`） | 只有“因隐藏而挂起”时才调用 `resume()`，状态随 `statechange` 回到 `running`；其他状态不变。已停止的发声不补播 | 未恢复运行时状态保持 `suspended`，可由下一次 `unlock()` 恢复 |
| 页面隐藏期间收到迟到的 `running`（例如隐藏前发起的 `resume()` 之后才兑现） | 立即再次挂起，状态保持 `suspended`；隐藏期间不能开始发声 | — |
| 上下文被浏览器挂起或中断（不是控制器发起的） | 停止并释放全部发声，状态变为 `suspended`；之后不补播。上下文自行恢复运行时回到 `running`，也可以由 `unlock()` 恢复 | — |
| 上下文被宿主关闭，或宿主操作抛错 | 状态变为 `failed`，停止并释放全部发声 | 之后 `play` 返回 `audio-failed` |
| `dispose()` | 同步停止并断开全部发声，移除全部监听，释放已登记的缓冲；状态立即变为 `disposed`，之后不再通知。从不为释放而创建上下文：上下文已创建且未关闭时，至多发起一次 `close()`；否则不调用 `close()`。可重复调用 | 之后的命令返回 `disposed` 或 false |
| 订阅者抛错 | 交给创建时传入的 `reportError`，不影响其他订阅者与状态 | — |

**不变量：**

- 每个控制器至多一个 `AudioContext`，从不自行创建第二个。
- 进入 `suspended`、`failed` 或 `disposed` 之后，以及页面隐藏期间，没有任何发声继续或开始。
- 控制器不保留、不转移、也不修改调用方传入的 payload 缓冲；调用返回后，调用方修改自己的缓冲不影响已登记的音频。
- 快照冻结，在两次变化之间保持同一对象。

## 数据模型与契约

以下类型除注明“已有”外都是计划新增，文件划分由 goal 决定。不建立统一 schema 文件或全局 barrel。

### 规范采样 payload

kind 为 `sound` 的 Asset，其 payload schema 版本为 1（记录在 P2-01 `PayloadIdentity.schemaVersion` 中）。payload 字节是一个固定长度的小端头部，后接 PCM 数据：

| 偏移 | 类型 | 字段 | 约束 |
|---|---|---|---|
| 0 | char[4] | 格式标签 | ASCII `OSRS` |
| 4 | u32 | 采样率（Hz） | 8,000–96,000（Web Audio `createBuffer` 保证支持的范围） |
| 8 | u32 | 帧数 | ≥ 1 |
| 12 | u8 | 声道数 | 1 或 2 |
| 13 | u8 | 编码 | 1 = 无符号 8 位（`u8`），2 = 有符号 16 位小端（`s16le`） |
| 14 | u8 | 循环方式 | 0 = 不循环，1 = 整段循环 |
| 15 | u8 | 保留 | 0 |
| 16 | bytes | PCM | 交错的帧；长度恰为帧数 × 声道数 × 每样本字节数 |

- **写入与读取：** 读取器先核对长度至少为头部长度，再核对标签、各字段的取值、保留字节，以及 PCM 长度与总长度是否精确匹配；没有尾随字节。读取器不按声明的帧数分配缓冲，失败时给出 P2-01 风格的稳定 code 与路径，不回显值。头部长度与各偏移作为导出常量写入源码结构指南。
- **浮点映射：** 唯一的纯函数把 payload 映射为每个声道一个新的 `Float32Array`：
  - `u8` 的值 v 映射为 (v − 128) / 128，范围 [−1, 127/128]；
  - `s16le` 的值 v 映射为 v / 32768，范围 [−1, 32767/32768]；
  - 双声道按帧交错拆分。

  结果不与 payload 共享缓冲。
- **与来源无关：** payload 不含原版条目编号、`flags` 原值或任何 locator。
- **兼容：** 字段、编码、取值范围或映射公式的任何变化，都要递增 payload schema 版本与转换器版本组件。

### 音效描述符与生产音效表

| 数据/字段 | 类型、单位与约束 | 权威所有者 | 输入/输出或序列化边界 |
|---|---|---|---|
| sound `AssetDescriptor`（已有类型） | `kind: 'sound'`，`group: 'audio'`，`role` 为四个核心角色之一或 `model-sound`，`dependencies` 为空，`payloadIdentity.schemaVersion` 为 1 | `content/` 契约；值由转换器产生 | 清单经 Worker 发送，由持有者与 P2-10 重新验证 |
| 生产音效表 | 每行为 `{ role, mapping }`：`mapping` 是 P2-01 `SourceMapping`，规范 `AssetReference` 由 `mapping.asset` 持有；`mapping` 含单个部件，部件的 `alternatives` 为 `MAIN/SR.NOB` 中 `SND` 条目的 locator，`subresource` 为 null。行按 Asset ID 升序，ID 唯一；`role` 的取值、行序与唯一性由本任务单独校验 | `original-data/` | 只供转换器与本地核对使用。导入时把各行的 `mapping` 投影为 `{ sourceFingerprint: null, mappings }`，交给既有的 `readSourceMappingTable` 与 `verifySourceMappings`，绑定已识别的指纹，再经 `assetSourceStates` 得到不含 locator 的来源状态集。不扩展 P2-01 严格读取器去接受 `role` |
| 映射置信度 | 按研究结论如实填写 `confirmed`/`likely`/`unconfirmed`；非 `confirmed` 须列出 U 项；`evidence` 指向 `docs/original/` | 研究，记录在 `original-data/` | `unconfirmed` 的必需映射使组不完整（P2-01 `source-not-ready`） |
| 音频组输入 | P2-01 `GroupInput`：`manifest`（带包身份的 `audio` 清单）、`payloads`（每个 Asset 一条，独占缓冲）与 `sources`（绑定已识别指纹的状态集） | 作业组装 | 经协议 `group` 消息转移给持有者 |

- **生产表唯一：** 生产音效表是 SND 条目与 sound Asset ID 之间唯一的绑定。P2-06 建立模型到样本的依赖边时从这里查 ID，不另立映射。
- **测试注入：** 生产作业固定使用这张表。测试可以经与 `open` 相同的注入方式传入合成表，生产入口不传。

### 音频转换预算

音频阶段使用下列导出常量作为 P2-01 `BudgetRecord` 限值，只核算本阶段的转换用量。它相当于 P2-05 所说的步骤份额：音频阶段从零开始，只按这一份额核算，与图形步骤的份额互不占用。源读取仍受 P2-02 的默认预算与 P2-03 的单条目上限约束。

| 维度 | 上限 | 依据 |
|---|---:|---|
| `assets` | 37 | 唯一支持的版本中，`SR.NOB` 的 SND 条目总数（见 [imfat §4](../../../original/formats/imfat.md#4-type-distribution-per-file-confirmed)）；切片音效集合不可能超过它 |
| `dependencyEdges` | 0 | sound Asset 没有依赖 |
| `audioSamples` | 4,194,304 | 按 [audio](../../../original/formats/audio.md) 记录的全部 SND 总时长与最高观察采样率、至多 2 声道估算，上界约 133 万个采样点；此值留出 3 倍以上余量 |
| `payloadBytes` | 8,388,608 | 采样点上限 × 最大每样本 2 字节。计量对象是完整的规范 payload，含 16 字节头部，所以全部为 16 位样本时，本维度会略早于 `audioSamples` 达到上限 |
| 其余 8 个维度 | 0 | 不适用 |

- **目录预检：** 在 `verifySourceMappings` 或转换读取任何 SND 块之前，先打开 `SR.NOB` 的目录，按顺序做以下检查：
  1. 用目录确认每个 locator（含全部别名）都存在且类型为 `SND`。
  2. 每个 Asset 第一个 locator 的目录声明块大小若小于 20，立即以 `source/invalid-payload` 失败，位置为该块大小的结构路径。这一步在计算任何估算之前完成，所以估算不会为负。
  3. 按块大小核算可能产生的用量上界：`payloadBytes` 为 16 + 块大小 − 20，`audioSamples` 为块大小 − 20，另核算 `assets`。

  预检中任一项失败，或核算超限、溢出（以 `budget-exceeded` 失败）时，任何块都不被读取。预检只是检查，不计入用量。
- **实际核算：** 每个条目读取并通过[采样格式规则](#采样格式规则)之后，按实际的规范 payload 字节数与采样点数核算，每个维度只计一次。等于上限时通过；超过上限或超出安全整数范围时，以 `budget-exceeded` 失败，被拒绝的增量不部分计入。
- **读取量：** `verifySourceMappings` 会读取每个别名一次，转换随后再读取一次，因此源读取量大于 payload 字节数。全部读取都如实计入来源用量，并继续受 P2-02 默认预算与 P2-03 单条目上限的约束；本任务不另设源读取上限，也不声称读取量受 `payloadBytes` 约束。各转换阶段汇合后的作业级读取上限由 P2-11 确定。
- **基准核对：** 本地基准核对记录实际用量、源读取量与各上限的比较。若基准超出任一上限，须修订本 spec，不得静默调高。
- **作业用量：** `finished.usage` 等于来源用量、P2-05 图形转换用量与音频转换用量按维度相加。

### 包身份

本节实现 P2-09 已批准 spec 的“包身份与转换器版本”所定义的共享机制。P2-05、P2-09 与本任务只用这一套，不另立规则。

| 数据/字段 | 类型、单位与约束 | 权威所有者 | 输入/输出或序列化边界 |
|---|---|---|---|
| 生产 `ConverterVersion` | `original-data` 转换模块中唯一的生产常量 `PRODUCTION_CONVERTER_VERSION`，符合 P2-01 令牌语法。本任务选定初始值 `osr-import.audio-1`：`osr-import.` 后接按固定顺序以 `.` 连接的各转换器组件，每个组件形如 `<转换器>-<正整数>`；本任务的组件为 `audio-1` | 常量归 `original-data` 的转换模块；各组件归相应转换器 | 写入每组清单的 `identity.converterVersion`，P2-10 用作缓存键的一部分 |
| 版本递增规则 | 任一生产转换器的输出变化都递增该常量。就本任务而言，以下变化递增 `audio` 组件：SND 解析与校验规则、`flags` 解释、payload schema、生产表（ID、角色、映射、置信度）、预算限值，以及其他会改变同一来源转换结果的变化 | 本任务 | 递增后旧缓存键自然不再命中，旧条目的清理归 P5 |
| `ManifestIdentity` | `manifest:sha256:<64 位小写十六进制>`，对确定、无歧义的 ASCII 编码计算 SHA-256。编码依次包含：`schemaVersion`、`sliceId`、`sliceDefinitionVersion`、`ConverterVersion`、来源（`origin`）；然后按 `CLASSIC_P2_SLICE.groups` 顺序列出包内每个组的组名、按清单顺序排列的全部描述符（`id`、`kind`、`role`、`group`、依赖、payload 身份），以及该组的来源状态集（指纹，以及每项的 `id`、`state`、`unknowns`） | 计算函数归 `content/`（纯函数，复用已有 SHA-256）；调用归作业 | 同一作业的全部组共用一个值。上列任何字段变化都会改变它；它不覆盖 payload 字节本身，payload 的变化经 payload 指纹体现 |

- **组装顺序：** 作业先运行全部转换阶段，得到各组草稿（描述符、payload、来源状态），再计算一次 `ManifestIdentity`，填入每组清单，最后发送各组。本任务的作业只发送 `audio` 组：P2-05 的图形步骤结果按其 spec 留在作业内，由 P2-06/07 装配为组，在此之前既不发送，也不计入包身份。后续任务接入组后，同一计算覆盖作业发送的全部组：身份必须由全部已发送组的草稿重新计算一次，不得沿用只含 `audio` 的值，因为 P2-01 的 `validatePackage` 只比较各组身份是否相同，不重算。
- **合成内容：** 测试用的合成包可以使用固定的合成身份。生产作业的身份只能由上述规则产生。

### 导入协议变化

| 项 | 合入前（P2-04，及先合入的 P2-05） | 本任务 |
|---|---|---|
| `IMPORT_PROTOCOL_VERSION` | P2-04 为 1；P2-05 递增为 2 | 递增为 3。并行任务按合入顺序依次递增 |
| 阶段集合 | `identify-source`；P2-05 追加 `convert-graphics` | `identify-source`、`convert-graphics`、`convert-audio`，按此顺序 |
| 错误层 | `disc`、`source`、`content`、`import` | 不变。转换错误经 `source` 层传递，新增 code 只是新的 token |
| 进度顺序 | 识别之后不再有 `identify-source` 进度；P2-05 的 `canReportStage` 规定转换阶段的进度只在 `identified` 之后，阶段按集合顺序不回退 | `convert-audio` 适用同样的既有规则。另增一条：第一个 `group` 之后不再有任何进度 |
| 组消息 | 生产作业不发送组 | 生产作业发送 `audio` 组 |
| `finished.usage` | 来源用量；P2-05 加上图形转换用量 | 再加上音频转换用量 |

- **违规处理：** 持有者把违反上述顺序的消息报为 `protocol-error`，位置沿用 P2-04 的约定。`readBytes` 不减少、不超过输入总字节的规则跨阶段继续适用。
- **错误转换：** 不变。SND 转换与音频预算的错误是 `SourceError`，宿主按既有规则转为 `source` 层 DTO。
- **`source` 层的追加 code：** 本任务复用 P2-09 定义的 `invalid-payload`（结构损坏或违反格式规则）与 `unsupported-payload`（格式合法，但用到了生产规则未接受的取值），以及 P2-05 已落地的 `budget-exceeded`（音频预算超限）。预算超限的限值名为 P2-01 的预算维度，`observed` 在超出安全整数时为 null。P2-03 已有 code 与限值的含义不变，`limit-exceeded` 仍只表示结构限值。`location` 是结构位置（映射路径加字段名），`reason` 是固定文本，都不含字节、宿主路径或宿主错误文本。
- **组结果验证不变：** 组结果的验证顺序与 `takeGroups()` 的移交语义与 P2-04 相同。

### 播放控制器

控制器的契约与实现都在 `platform/audio/`。这沿用 P2-10 的先例：平台提供 DOM-free 契约与 `browser-*` 适配，应用层装配。P2-11 或 P3 若需要更窄的注入端口，按 [ADR-0015](../../../decisions/ADR-0015-source-module-structure.md) 第 4 条由需求方定义。

| 项 | 契约 |
|---|---|
| 创建 | 参数：注入的音频能力（创建上下文、创建缓冲）、页面生命周期宿主（提供初始可见性，订阅隐藏/可见，返回撤销函数），以及必填的 `reportError`。`browser-*` 工厂提供真实的 `AudioContext`、`AudioBuffer` 与 `document`/`window` 生命周期事件；Node 测试注入假实现 |
| 状态 | `idle`、`locked`、`running`、`suspended`、`unavailable`、`failed`、`disposed` |
| 快照 | 冻结的 `{ status, loaded, voices }`，`loaded` 为已登记的 Asset 数，`voices` 为当前发声数。可配合 `subscribe` 用于 `useSyncExternalStore` |
| 命令 | `unlock()`、`load(sounds)`、`play(id)`、`stop(voice)`、`stopAll()`、`dispose()`。`sounds` 为 `{ id, schemaVersion, bytes }` 列表，形状同 P2-01 `PayloadRecord`；`schemaVersion` 必须为 1 |
| 结果 | 判别联合的纯数据，预期失败以结果返回，不抛错、不以 rejected Promise 表达：`load` 为 `{ status: 'loaded', count }` 或 `{ status: 'failed', code, assetId }`；`play` 为 `{ status: 'started', voice }` 或 `{ status: 'rejected', code }` |
| 错误码（封闭） | `audio-unavailable`、`audio-locked`、`audio-suspended`、`audio-failed`、`unknown-sound`、`duplicate-sound`、`invalid-sound-payload`、`voice-limit`、`disposed` |
| 同时发声上限 | 导出的固定常量，至少为 4（四类核心角色可以同时发声），写入工程文档。它只是资源保护，不代表原版混音路数 |
| 宿主错误 | 只记录错误名称用于分类，宿主错误文本不进入结果或快照 |

### 播放控制器的扩展（P3-14 的修订）

**状态：已获用户批准（2026-10-17，P3-14 的 D-01）。** 用户的选择：“批准全部推荐方案（含三项差异）”。由 P3-14/06 起草。

本节定稿 [P3-14 spec 的控制器扩展边界](../../p3/14/spec.md#控制器扩展边界)中属于本 spec 的播放器公开契约：逐发声的初始参数与运行中更新、保留播放位置的任务暂停门禁，以及发声状态查询。P3-03 加入的 `repeat` 循环方式（[声音 payload schema 2](../../p3/03/spec.md#声音-payload-schema-2)）的停止方式也由本节重新规定。已批准的决定见 [P3-14 的 D-01 定稿](../../p3/14/spec.md#d-01-定稿已批准)（下文“D1-n”），Core 一侧见 [P3-02 的修订](../../p3/02/spec.md#p3-14-的契约修订d-01)，任务所有者的接线见 [P3-04 的修订](../../p3/04/spec.md#任务音频接线p3-14-的修订)。混音的原版事实只在 [audio A-09](../../../original/formats/audio.md#digital-mixing-in-the-linked-miles-library-a-09)；原版参数怎样计算属于消费者，平台只负责应用参数与管理资源。批准后，前文[播放控制器](#播放控制器)两节与本节不一致时以本节为准。

**兼容原则：** 不传参数、不调用 `pause`/`resume` 的调用者（查看器）得到与修订前相同的节点图、结果、状态与错误码。新增的状态值与错误码只在使用新能力时出现。查看器的类型穷举处把 `paused` 当作 `suspended`，但这个状态在查看器中从不出现。同时发声上限 `AUDIO_VOICE_LIMIT` 仍为 8，仍只是资源保护。

```ts
export const AUDIO_VOICE_LIMIT = 8;          // 不变
export const AUDIO_RATE_LIMIT = 44_100;      // 新增：速率上限（Hz），取游戏自己的钳位（A-09）；没有游戏以外的调用者需要更高
export const AUDIO_ENDED_HISTORY = 256;      // 新增：保留终态的最近句柄数

export type AudioStatus =
  | 'idle' | 'locked' | 'running' | 'paused' | 'suspended' | 'unavailable' | 'failed' | 'disposed';  // 新增 paused

export interface VoiceParameters {
  readonly volume: number;   // 整数 0–127
  readonly pan: number;      // 整数 0–127
  readonly rate: number;     // 整数 Hz，1–AUDIO_RATE_LIMIT
}

export type AudioErrorCode =
  | 'audio-unavailable' | 'audio-locked' | 'audio-suspended' | 'audio-failed' | 'unknown-sound' | 'duplicate-sound'
  | 'invalid-sound-payload' | 'voice-limit' | 'disposed'                                    // 既有
  | 'audio-paused' | 'invalid-parameters' | 'unknown-voice' | 'fixed-parameters';          // 新增

export type PlayFailureCode = Exclude<AudioErrorCode, 'duplicate-sound' | 'invalid-sound-payload' | 'unknown-voice' | 'fixed-parameters'>;
export type UpdateResult =
  | { readonly status: 'updated' }
  | { readonly status: 'rejected'; readonly code: 'unknown-voice' | 'fixed-parameters' | 'invalid-parameters' | 'audio-failed' | 'disposed' };

export type VoiceEnd = 'natural' | 'stopped' | 'preempted' | 'released';
export type VoiceState =
  | { readonly status: 'playing' }
  | { readonly status: 'paused' }
  | { readonly status: 'ended'; readonly reason: VoiceEnd }
  | { readonly status: 'unknown' };

export interface AudioController {
  unlock(): AudioStatus;
  load(sounds: readonly SoundRecord[]): LoadResult;                          // 不变
  play(id: string, parameters?: Partial<VoiceParameters>): PlayResult;
  update(voice: number, parameters: Partial<VoiceParameters>): UpdateResult;
  voiceState(voice: number): VoiceState;
  stop(voice: number, reason?: 'stopped' | 'preempted'): boolean;           // reason 缺省为 'stopped'
  stopAll(): void;
  pause(): AudioStatus;
  resume(): AudioStatus;
  // getSnapshot、subscribe、dispose 不变；快照的 voices 计入 playing 与 paused 的发声
}
```

| 场景 | 预期结果 | 拒绝或失败 |
|---|---|---|
| `play(id)`（不传参数） | 与修订前相同：不创建参数节点，按存储速率、全幅、两声道等幅播放。这样的发声是“固定”的 | 既有错误码；门禁关闭时为 `audio-paused`（见下） |
| `play(id, parameters)` | 先校验整个对象：给出的每项都必须是范围内的整数，缺省项取 127、64 与存储速率。通过后创建本发声的参数节点，**在 `start()` 之前**设好增益、两个声道的增益与 `playbackRate`，再开始 | 非整数、非有限数或越界为 `invalid-parameters`：不分配句柄、不创建节点、不改变计数 |
| `update(voice, parameters)` | 整个对象先校验；通过后在当前上下文时间同时应用所给各项。速率改变时重新安排 `repeat` 的停止（见下）。对暂停中的发声照样应用，继续时生效，不消耗进度 | 未知或已结束的句柄为 `unknown-voice`；固定发声为 `fixed-parameters`；参数非法为 `invalid-parameters`（不部分应用）；宿主操作抛错时控制器进入 `failed`，返回 `audio-failed`；已释放为 `disposed` |
| `voiceState(voice)` | 纯读取，不调用宿主：存活且状态为 `running` 为 `playing`；保留而上下文未运行（门禁关闭，或继续后仍在等待上下文运行）为 `paused`；已结束为 `ended` 及原因；从未发出或已超出保留范围为 `unknown` | — |
| 结束原因 | `natural`：自然播完，`repeat` 在最后一遍结束时的预定停止也算；`stopped`：调用者的 `stop`（缺省）或 `stopAll`；`preempted`：调用者以 `stop(voice, 'preempted')` 结束；`released`：控制器自行结束，即隐藏、`pagehide`、浏览器挂起或中断、宿主关闭或抛错、暂停失败与 `dispose` | 每个句柄只记录第一个原因；之后再停止返回 false |
| 终态的保留 | 句柄单调递增、从不复用。最近 `AUDIO_ENDED_HISTORY` 个已结束句柄的原因被保留，更早的返回 `unknown`。读取者每帧查询自己跟踪的句柄，所以保留量与读取节奏无关 | — |
| `pause()`：任务暂停门禁 | 关闭门禁，之后 `play` 返回 `audio-paused`。上下文存在且未失败时请求 `suspend()`，状态为 `paused`；已有发声保留，源采样进度停止（包括 `none`、`whole` 与 `repeat`），`voiceState` 为 `paused`。还没有上下文（`idle`、`locked`）时只记下门禁，状态不变。重复调用幂等 | `suspend()` 同步抛错或兑现为 rejected 时：以 `released` 释放全部发声，经 `reportError` 报告（只含错误名称），状态为 `failed`。这是控制器唯一观察宿主 Promise 结果的地方，因为暂停中的声音不能继续 |
| `resume()`（须在可信用户激活中调用） | 页面可见时打开门禁；有上下文时调用 `resume()`，状态随 `statechange` 回到 `running`，保留的发声从原位置继续，不从头重播。页面隐藏时不做任何事，门禁保持关闭 | 上下文仍被自动播放策略阻止时状态为 `locked`，保留的发声仍为 `paused`、不发声，由下一次可信的 `resume()` 或 `unlock()` 继续 |
| 门禁关闭时 `unlock()` | 没有上下文时在手势中创建，随后保持挂起；状态为 `paused`。只取得能力，不播放，也不打开门禁 | 构造失败为 `unavailable` |
| 门禁关闭时页面隐藏 | 以 `released` 释放全部发声，失效待处理的参数更新；状态保持 `paused`。页面恢复可见时**不**恢复上下文 | — |
| 门禁关闭时的意外转换 | 只有**当前这次** `pause()` 请求的 `suspend()` 造成的挂起保留发声。其他任何转换，例如浏览器中断（`interrupted`）、`suspend()` 尚未兑现时上下文被中断、非本次暂停造成的挂起、宿主关闭，都以 `released` 释放全部发声，与门禁状态无关。关闭时状态为 `failed`；其余情况下状态保持 `paused`，门禁仍关闭 | — |
| 门禁打开时页面隐藏、浏览器挂起或中断 | 与修订前相同：释放全部发声（`released`），状态为 `suspended`，不补播 | — |

**`repeat` 的遍数：**

- 遍数按完整的源遍计，与速率、暂停和墙钟无关（A-09 的“complete source passes”）。不再用“速率为 1 时的墙钟停止时间”。
- 控制器为每个 `repeat` 发声记下已消耗的源帧数。开始时与每次改变速率时，按“剩余源帧 ÷（缓冲采样率 × 当前 `playbackRate`）”在当前上下文时间之后重新安排 `stop(when)`；端口的语义是后一次调用取代尚未到达的停止。暂停时上下文时间不前进，所以进度保留。提前停止后不再自然续播。
- **误差：** 速率不变时遍数精确，与 P3-03 的结果相同。每次改变速率，因 `playbackRate` 在渲染量子边界才生效，进度误差至多为 128 个输出帧乘以变化前后 `playbackRate` 之差（以源帧计）。测试按这一界限断言，不另设百分比容差。
- `none` 在任何速率下播完一遍后自然结束；`whole` 循环到被停止。缓冲不按遍数复制。

**参数到 Web Audio 的映射（D1-07、D1-13）：**

- **音量：** 增益 = 音量 ÷ 127，线性幅度，不是分贝。A-09 的主音量在 P3 中为 127（没有声音设置），所以等于该式。
- **声像：** 两个输出声道的增益分别为 T[127 − 声像] ÷ 128 与 T[声像] ÷ 128，T 为 A-09 的线性平衡表；声像 63 与 64 两声道都满幅。第一个声道是 Web Audio 的声道 0（左），这一“第一声道为左”的对应依 D1-07。不使用 `StereoPannerNode`：它是等功率曲线，中心值与两端的增益都不同。
- **速率：** `playbackRate` = 速率 ÷ 该缓冲的采样率（payload 的存储速率）。平台接受 1–44,100（与游戏的钳位相同，A-09），拒绝 0 与更大的值；把计算结果钳到 0–44,100、并把小于 1 按 1 处理（A-09 中库对低于 1 的速率的处理）是消费者的事。
- **不复现（D1-13）：** 点采样、22050 Hz 的 1:1 窗口、整数截断、8 位输出量化与 22050 Hz 的输出格式。
- **节点：** 每个带参数的发声为“源 → 音量增益 → 两个声道增益 → 合并 → 输出”；参数节点随该发声的结束、停止或释放一起断开，并撤销其监听。

**能力端口：** `AudioContextPort.createVoice(buffer, loop, parameters?)` 增加可选的初始参数 `{ gain, left, right, playbackRate }`（均为有限数），只有给出参数时才创建参数节点。返回的 `AudioVoicePort` 增加 `setParameters(parameters, when)`，固定发声没有该方法。浏览器适配在 `browser-audio-controller.ts`；假能力（`audio-controller.test-support.ts`）记录每次设置的参数与时间，以及安排的停止时间。

**测试责任（P3-14/10、11、22）：**

- 合法参数的边界：0、127、1、`AUDIO_RATE_LIMIT`，以及其外侧 1；非整数、NaN 与缺项的缺省值。
- 初始参数先于 `start()` 设置；`update` 的全有或全无。
- 结束原因的每条路径，以及迟到的 `ended` 回调；保留窗口的 256 与 257。
- `repeat` 在初始速率、运行中变速、暂停/继续与提前停止下的遍数，以及上述误差界。
- `pause` 与 `resume` 在 `idle`、`locked`、`running` 与隐藏中的交错，以及暂停失败。
- 必需用例：暂停后（上下文已 `suspended`）再收到 `interrupted`；`suspend()` 尚未兑现时收到 `interrupted` 或 `closed`。两者都以 `released` 释放全部发声，之后的 `resume()` 不恢复任何旧发声。
- 查看器的回归，包括节点数不变。
- 浏览器中以合成采样测量左右声道与播放进度（P3-14/22）。

### 持久化与兼容

- **不新增持久化：** 本任务不读写 IndexedDB 或 localStorage。音频组的 payload 经 P2-11 交给 P2-10 的缓存时，沿用其记录格式与恢复时的重新校验，不需改动缓存。
- **缓存兼容：** 规范采样以 payload schema 版本 1 写入 `PayloadIdentity`。任何影响转换输出的变化都按[包身份](#包身份)的规则递增转换器版本组件，从而得到新的缓存键。旧键不会被误读为当前内容，其清理归 P5。
- **协议兼容：** 递增后的协议版本与旧版本互不兼容。握手阶段按 P2-04 的规则以 `protocol-error` 拒绝，不发送文件。

## 技术决定

用户在请求本 spec 时说明，需要回答的问题直接采用最推荐的答案。以下决定按此记录；整个契约仍须用户明确批准（见[审批](#审批)）。

1. **`audio` 组覆盖切片闭包中的全部 sound Asset，不只四个核心角色：** P2-01 的闭包规则把模型可达的样本计入切片，而 `audio` 组是唯一拥有 `sound` kind 的组。若只转换四个角色，P2-06 的模型就无法通过全包验证；若让 P2-06 再写一套 SND 转换，又违反“不再开第二套解析器”的阶段约束。模型可达样本只做结构映射，不赋予玩法含义。
2. **规范 payload 保留源 PCM 编码，播放时才展开为浮点：** 这遵循[总计划 §8](../../master-plan.md#8-浏览器运行存档与隐私)“缓存尽量保留紧凑格式，加载时再展开”的要求。8 位与 16 位都无损保留，体积与源数据相当；浮点映射集中在 `content/` 的一个纯函数，转换器、播放端和本地对照共用，不会出现两套采样解释。
3. **不在导入时重采样：** Web Audio 的缓冲可以使用源采样率，由上下文负责重采样。保留源采样率可以避免引入有损处理与额外的实现选择，也让本地对照可以直接核对音高与速度。
4. **`flags` 采用封闭的已研究取值：** 观察到的 3 个取值含义都未确认。转换器只接受经研究确认、并已写入生产规则的取值，其他取值明确失败。这样不会把“可能是循环或声道”的猜测写进 payload。payload 的声道数与循环方式字段只表达通用音频属性，不复制原值。
5. **角色对应须达到高概率，并有试听一致的判定：** 生产映射的置信度沿用 P2-01 的规则，`unconfirmed` 会阻止组完整。阶段退出要求本地对照证据，所以本任务把开发者的试听判定作为验收的一部分；只有代码或只有试听的单方面推断，都不能升级为已确认。
6. **包身份采用 P2-09 已批准的共享机制：** 原决定是“版本组件 + 全包 SHA-256”的自有规则。执行 05 前的核对发现，P2-09 的 spec 先获批，规定了唯一的生产常量 `PRODUCTION_CONVERTER_VERSION`，以及覆盖 `ConverterVersion`、来源与全部组草稿的 ASCII SHA-256 推导。本任务按本条原有的对齐规则改用该机制，并作为先落地者实现它。常量初始值由本任务选定为 `osr-import.audio-1`，以组件形式标明变化来自哪个转换器。这样只有一套身份规则，P2-10 的缓存键与 P2-01 的全包一致性都成立。
7. **协议只因阶段变化而递增，转换错误扩展 `source` 层：** 原决定新增 `conversion` 错误层。执行 05 前的核对发现，P2-05 与 P2-09 已批准的 spec 都以追加 code 的方式扩展 P2-03 `SourceError`，不新增错误层。为避免同类错误出现两套层与 DTO 规则，本任务改为复用 P2-09 的 `invalid-payload`、`unsupported-payload`，预算超限复用 P2-05 已落地的 `budget-exceeded`。原定复用 P2-09 声明的 `limit-exceeded`；P2-05 先合入后，按“先落地者实现，后者复用”的规则改用它的 code（执行期修订三）。这对 P2-03 契约只是追加 code 与限值名，已有含义不变。协议版本仍因阶段集合变化而递增。
8. **组在全部转换完成后发送，之后不再有进度：** 这是计算全包 manifest 身份的必然要求。音频阶段的内存占用受预算约束（payload 不超过 8 MiB），可以在 Worker 中暂存。
9. **播放控制器的契约与实现都在 `platform/audio/`，`AudioContext` 在 `unlock()` 中延迟创建：**
   - **位置：** 与 P2-10 一样，在需求方的消费者出现之前先由平台提供契约，避免在 app 中预先建立没有消费者的空端口（ADR-0015 第 7 条）。
   - **延迟创建：** 在用户手势中创建上下文，最符合浏览器自动播放策略。
   - **状态驱动：** 状态由 `statechange` 驱动，不等待可能永不兑现的 `resume()` Promise，因此被阻止时不会挂起。
   - **不排队：** 不排队播放，因为补播会在恢复时突然发出积压的声音。
10. **页面隐藏时停止并挂起，恢复时不补播：** 这与[总计划 §8](../../master-plan.md#8-浏览器运行存档与隐私)的后台暂停一致，也满足声音不能越过已结束查看继续播放的要求。原版在后台的行为与本项无关，DOS 程序没有页面可见性的概念。
11. **浏览器测试固定自动播放策略：** Playwright 不设置 Chromium 的自动播放策略开关，无头模式下的默认策略又可能与桌面版不同。用例显式设置“需要用户手势”的策略，以可信点击完成解锁，因此“被阻止”与“已解锁”两条路径都能复现。
12. **不需要新 ADR：** 以上决定细化了总计划 §2、§5、§8、ADR-0007 与 ADR-0015，没有改变冻结决定；不引入新依赖（[ADR-0008](../../../decisions/ADR-0008-mit-and-dependency-licenses.md)）。P2-04 的协议按其自身规则扩展，P2-04 已批准的 spec 作为历史记录保留，当前协议说明改由源码结构指南维护。

## 验收标准

| ID | 可观察的通过条件 | 验证方法与所需证据 |
|---|---|---|
| AC-01 | **SND 校验：** 合成 SND 的 8 位与 16 位样本、采样率边界 8,000 与 44,100、每个已列入生产规则的 `flags` 取值，都转换为预期的规范 payload。<br>**拒绝：** 以下每项都以预期 code 与结构位置拒绝：块小于 20 字节、重定位数不为 1 或位置不为 0、偏移不为 20、样本字节数与块大小不符、样本字节数不是帧大小的整数倍、帧数为 0、位宽为 12、采样率为 7,999 与 44,101、未列入的 `flags`。诊断不含样本字节，失败前不按声明长度分配缓冲 | 表驱动 Node 测试，使用代码生成的 SND |
| AC-02 | **payload 往返：** 规范 payload 的写入与读取往返一致，头部偏移等于导出常量。<br>**读取拒绝：** 错误标签、未知编码、声道数或循环方式、采样率 7,999 与 96,001、保留字节非零、PCM 长度不符、尾随字节、长度小于头部，都以稳定 code 与路径拒绝。<br>**浮点映射：** 精确值为：`u8` 的 0、128、255 分别映射为 −1、0、127/128；`s16le` 的 −32768、0、32767 分别映射为 −1、0、32767/32768。双声道正确拆分，结果不与 payload 共享缓冲 | Node 测试 |
| AC-03 | **生产音效表：** 只有一张生产音效表。<br>- 四个核心角色各至少一行；<br>- ID 唯一、升序，符合 Asset ID 规则，不含条目编号；<br>- 每行的 locator 都是 `MAIN/SR.NOB` 的 `SND`，`subresource` 为 null；<br>- 非 `confirmed` 的行都列有 U 项，证据指向 `docs/original/`。<br>**合法性与边界：** 各行的 `mapping` 投影（`{ sourceFingerprint: null, mappings }`）能通过 `readSourceMappingTable`；`role` 的取值、行序与唯一性另有校验，带 `role` 的行本身不送入该读取器。locator 不出现在 `content/`、`platform/`、`app/`、`ui/` 的任何导出中 | Node 测试读取真实生产表；边界回归 |
| AC-04 | **转换结果：** 用含 SND 条目的合成光盘与注入的合成表，音频转换得到的 `GroupInput` 经 `validateGroup(CLASSIC_P2_SLICE, …)` 为 `group-complete`，没有外部要求。<br>- payload 版本、长度与指纹都与描述符一致；<br>- 每个 payload 独占缓冲；<br>- 来源状态集绑定已识别的指纹。<br>**不完整：** 样本格式在规则之内时，把一个核心角色的映射改为 `unconfirmed`，结果为 `incomplete`，诊断为 `source-not-ready` 并带对应 U 项；删去一个核心角色的全部映射，结果为 `incomplete`，诊断为 `role-cardinality`。<br>**失败：** 样本的 `flags` 或位宽不在规则之内时，以 `source/unsupported-payload` 失败，不产生 payload。把别名的两个条目改为不同，以 `source/alternatives-differ` 失败 | Node 测试 |
| AC-05 | **预算：** 每个音频预算维度在等于上限时通过，超过 1 时以 `source/budget-exceeded` 失败，`limit` 的名称、上限与观测值正确；累加溢出时观测值为 null。<br>**目录预检：** 预检超限时，读取计量证明没有任何 SND 块被读取，包括 `verifySourceMappings` 的核验读取；不分配任何 payload。目录声明块大小为 8 字节的 SND 条目在预检中以 `source/invalid-payload` 失败（不是预算读取器的 `invalid-budget-value`），同样零块读取、零分配。<br>**计量口径：** `payloadBytes` 计入完整 payload（含 16 字节头部），每个维度只计一次。<br>**用量：** `finished.usage` 等于来源用量、图形转换用量与音频转换用量之和，来源用量包含核验读取与转换读取 | Node 测试，使用计量的合成字节端口 |
| AC-06 | **包身份：** 生产 `ConverterVersion` 是唯一的常量 `PRODUCTION_CONVERTER_VERSION`，值为 `osr-import.audio-1`，能通过 P2-01 读取器。<br>**确定性：** `ManifestIdentity` 形如 `manifest:sha256:<64 位十六进制>`，相同输入两次计算结果相同。<br>**敏感性：** 以下每项单独变化都会改变结果：任一描述符字段、依赖、payload 身份、来源状态（状态值或 U 项）、指纹、组的集合、切片定义版本、`ConverterVersion`、来源。<br>**全包一致：** 同一作业所有组的清单身份相同 | Node 测试 |
| AC-07 | **协议：**<br>- 版本已递增（本分支为 3，在 P2-05 的 2 之后），阶段集合按[导入协议变化](#导入协议变化)，错误层集合不变；<br>- 持有者以 `protocol-error` 拒绝三种顺序违规：`identified` 之前的 `convert-audio` 进度、阶段回退（含 `convert-audio` 之后的 `convert-graphics` 进度）、`group` 之后的进度；<br>- 新旧版本互相握手时被拒绝。<br>**错误转换：** SND 转换与音频预算的 `SourceError` 经既有宿主转为 `source` 层 DTO，`limit` 的预算维度名、上限与观测值（含 null）完整保留；其余层的转换不变。<br>**回归：** P2-04、P2-05 的既有测试按新契约更新后全部通过；其中“生产作业组为空”的断言改为本任务的预期 | Node 测试 |
| AC-08 | **Worker 集成（Node）：** 经 Node `MessageChannel` 连接生产作业（注入合成识别与合成表）、宿主、平台适配与持有者。<br>- 消息依次为 `identified`、`convert-graphics` 进度、`convert-audio` 进度、`audio` 组与 `finished`；<br>- 持有者得到 `group-complete`，`takeGroups()` 返回该组，发送方 payload 视图已失效；<br>- SND 转换错误（`source` 层）往返后与宿主转换的 DTO 相等；<br>- 已收到组之后作业失败（例如结束用量无效）时，持有者丢弃已收的组，`takeGroups()` 返回 null。<br>**真实浏览器 Worker：** 在开发项目中，经测试 Worker 入口跑同一场景，结果与 Node 一致 | Node 集成测试；`pnpm test:e2e import-worker.spec.ts --project=development` |
| AC-09 | **控制器（Node，假音频能力）：**<br>- **状态转换：** 实现[播放控制器](#播放控制器)表中的全部转换与错误码；<br>- **可见性：** 覆盖以下情形：解锁前隐藏再恢复（保持 `idle`，不创建上下文）；`locked` 时隐藏再恢复（保持 `locked`）；`failed` 后隐藏再恢复（保持 `failed`）；隐藏期间调用 `unlock()`（不创建、不恢复）；隐藏前发起的 `resume()` 在隐藏后才兑现（再次挂起，不发声）；浏览器自行挂起（停止发声，不补播）；初始即为隐藏；`pageshow` 恢复；<br>- **释放：** 停止全部发声，移除全部监听，可重复调用，之后不再通知。上下文创建前释放时 `close()` 调用 0 次；有存活上下文时恰好 1 次；重复释放不增加；上下文已被宿主关闭时为 0 次；<br>- **登记：** `load` 失败时整批不登记；<br>- **所有权：** 调用方修改或转移自己的缓冲不影响已登记的音频，控制器从不转移它；<br>- **快照：** 冻结，订阅者的错误被隔离 | Node 测试 |
| AC-10 | **真实浏览器播放（Chrome，合成采样，固定“需要用户手势”策略）：**<br>- **被阻止：** 没有可信点击时，`unlock()` 后状态不是 `running`，`play` 返回 `audio-locked`，且没有输出。<br>- **解锁：** 可信点击后状态为 `running`。<br>- **缓冲：** 缓冲的采样率、长度与逐样本数据等于 `u8` 与 `s16le` 合成采样的预期浮点值。<br>- **输出：** 播放期间观测到非静音输出；自然结束或 `stop` 之后回到静音，发声数归零。<br>- **页面隐藏与恢复：** 经真实隐藏（CDP `Target.activateTarget`）后，全部发声停止，状态为 `suspended`，`play` 返回 `audio-suspended`；回到可见后恢复 `running`，且不补播。<br>- **释放：** 释放后上下文状态为 `closed`，没有剩余监听或输出。<br>- **不可用：** 移除 `AudioContext` 构造器时，状态为 `unavailable`。<br>不以调用 `start()` 或无异常作为可听的证据 | `pnpm test:e2e <音频用例>.spec.ts --project=development`。观测输出的方式可以是只读探针，或由测试注入的上下文工厂在 destination 之前插入分析节点；至少一条用例经 `browser-*` 生产工厂与真实 `AudioContext` 走完整路径 |
| AC-11 | **边界：**<br>- `platform/audio/` 不导入 `original-data`、`render`、`ui`、`app`、`workers`，不出现 `fetch` 等网络 API，非 `browser-*` 模块在真实 Node 程序中；<br>- `content/` 保持纯模块；<br>- 音频转换只经产品入口与 `verifySourceMappings` 取得字节；<br>- `src/workers/` 的网络禁用继续生效；<br>- 依赖清单与锁文件不变 | `tools/engineering-boundaries.test.ts` 新增与既有回归、`pnpm lint`、`pnpm typecheck`；依赖文件 diff |
| AC-12 | **本地基准核对（开发者本机，原版数据）：** 用与 Worker 相同的作业、宿主与持有者模块，在 Node 中处理 `local/` 下的基准 CloneCD 文件组，产品入口与生产表不注入。<br>- 以 `finished` 结束，`audio` 组为 `group-complete`；<br>- 记录 Asset 数、各角色的 Asset 数、采样率、位宽与 `flags` 分布、payload 字节与采样点用量及其与上限的比较、读取量；<br>- 覆盖核对：P2-01 选定的 5 个模型在 MODL 音效槽中引用的每个非零 SND，都已映射到生产表 | 本地 Node 脚本放在被忽略的 `local/research/p2-08/`。证据只含命令、计数、分布与结论，不含原版内容或私人绝对路径 |
| AC-13 | **研究事实：** 下列事实按[研究要求](#研究要求)写入 `docs/original/`，置信度与证据齐全：<br>- 16 位样本解释；<br>- 切片样本出现的每个 `flags` 值；<br>- 声道布局；<br>- 四个核心角色每个变体的源对应；<br>- 用到的 MODL 音效槽含义。<br>U-004（音效部分）与 U-027 的状态已更新。生产表的置信度与这些记录一致，四个角色都不是 `unconfirmed`。任一项达不到门槛时本任务为 blocked，不得通过 | 文档审阅；生产表与文档的一致性审阅；`pnpm check:original` 零发现 |
| AC-14 | **本地试听对照（开发者人工）：** 开发者对四个核心角色的每个变体做对照：一方是经同一浮点映射得到的转换结果，另一方是在基准 DOSBox-X 中单独触发对应事件时原版发出的声音。逐项判定以下三点：<br>- 是否为同一声音；<br>- 音高与速度一致（采样率正确）；<br>- 没有符号、字节序或声道错误造成的噪声或失真。<br>判定须全部为一致 | 开发者的书面判定，记录在 subtask 证据中，只含角色、变体与判定。本地生成的音频与录音只留在 `local/`。合成测试不能替代本项 |
| AC-15 | **文档与工程检查：**<br>- 源码结构指南、工程约定与阶段索引已同步，`platform/audio/` 已列入当前目录；<br>- `pnpm check` 通过；<br>- 受影响的 E2E 用例在开发项目通过；<br>- `pnpm check:original` 通过；<br>- 文档链接与元数据检查通过 | 命令输出与 diff 审阅 |

## 验证策略

- **单元/契约测试：**
  - 计划新增的 `original-data/`、`content/`、`platform/audio/` 模块各有相邻的 `*.test.ts`；`src/workers/`、`src/app/import/` 中的既有测试按新的协议版本更新。
  - 合成 SND 与含 SND 的 IMFAT 由 [synthetic.ts](../../../../src/original-data/synthetic.test-support.ts) 生成，合成光盘沿用 P2-04 的测试支持。
  - 覆盖 AC-01 至 AC-09 的正向、边界与失败路径。
  - 迭代时运行 `pnpm exec vitest run src/original-data src/content src/workers src/app/import src/platform/audio tools/engineering-boundaries.test.ts`，按实际路径收窄。
- **Replay/一致性：** 不适用。本任务不创建或推进 Core 世界，音频是一次性反馈的消费端，不影响 Core 状态或 replay。转换的确定性由 AC-06 与 AC-04 证明：相同输入得到相同的 payload 指纹与 manifest 身份。
- **浏览器验证：**
  - 用 browser-testing 的路线，在 Chrome 的开发项目中导入 `/src` 模块，只用代码生成的合成采样。
  - 新增的音频用例自行启动浏览器，并显式设置“需要用户手势”的自动播放策略开关。解锁使用 Playwright 的可信点击，页面隐藏沿用 native-lifecycle 的 CDP 路线。
  - 导入 Worker 用例扩展到音频阶段。
  - 这些用例属于开发项目，与 browser-replay、resource-cache 一样排除在 production 项目之外，并同步 [E2E 配置回归](../../../../tools/e2e-configuration.test.ts)。
- **实机/原版对照：**
  - **AC-12：** 开发者本地运行基准核对。
  - **AC-13、AC-14：** 研究与试听对照，需要开发者参与：在基准 DOSBox-X 中单独触发开火、导弹、爆炸、Warp，与转换结果逐项比对。这些都不能由合成测试或 agent 浏览器检查替代。
  - **归属其他任务：** 用真实界面点击进行的实机解锁与听感检查归 P2-11；经查看器的联合保真对照归 P2-12。
- **工程检查：** 完成前运行 `pnpm check`、受影响的 `pnpm test:e2e … --project=development`、`pnpm check:original`，并检查依赖文件无变化。本任务不涉及 Python/Ghidra 工具变更；只读 Ghidra 研究的脚本与输出留在 `local/`。
- **文档检查：** front matter、相对链接与锚点、S/AC 唯一性，以及 U 项与格式引用。用 `git status` 与 diff 确认没有 `local/` 内容、研究输出或原版 payload 被跟踪。

## 风险与恢复

风险等级：**中。** 本任务改动所有转换任务共用的导入协议与包身份，决定 P2-10 的缓存键组成；角色研究还可能长期阻塞。但目前没有已发布的缓存或玩家数据需要迁移。

- **研究无法闭合：** 两类门槛分别处理，本任务都按 blocked 记录受影响的 AC 与恢复条件。
  - **角色对应：** 映射保持 `unconfirmed` 或缺失，`audio` 组不完整（`source-not-ready` 或 `role-cardinality`）。取得证据后更新映射。
  - **采样解释（16 位解释、`flags`、声道）：** 相应取值不写入生产转换规则；转换遇到它时以 `source/unsupported-payload` 失败，不产生 payload。取得证据后更新转换规则。
  - **恢复后：** 无论更新的是映射还是转换规则，都递增版本组件。
  - **禁止：** 不用近似样本、猜测的解释或按槽位顺序命名来通过。
- **采样解释错误（符号、字节序、采样率、声道）：**
  - **缓解：** 统计依据、试听对照与精确的浮点映射测试三重约束。
  - **恢复：** 修正后递增 payload schema 或转换器版本组件，旧缓存键不再命中。
- **并行转换任务的契约冲突：**
  - **来源：** P2-05、P2-09 与本任务并行，可能各自递增协议版本或提出不同的身份规则。
  - **规则：** 协议版本按合入顺序依次递增。转换错误的层（`source`）与包身份机制以 P2-09 已批准的定义为准（见技术决定 6、7）：先落地者实现，后者复用；已落地的 code（如 P2-05 的 `budget-exceeded`）同样由后合入者复用。合入时若共享文件冲突，按这一份定义合并，不另立规则。
- **浏览器自动播放策略差异：** 用例固定策略开关并以可信点击解锁，只证明 Chrome 中的工程行为。真实界面的实机检查在 P2-11，Firefox/Safari 与移动设备在 P5。
- **`AudioContext` 资源泄漏：** 浏览器会限制同时存在的上下文数量。每个控制器至多一个上下文，释放时关闭；AC-09 与 AC-10 都核对关闭。
- **Worker 暂存全部组：** 组在发送前暂存于 Worker，内存受音频预算约束。后续转换任务加入时，各自的预算须一并考虑总量，由 P2-11 确定组合上限。
- **原版内容泄漏：**
  - **规则：** 自动化只用代码生成的数据；本地脚本生成的音频文件与统计只留在 `local/research/p2-08/`；证据只记录结构位置、计数与判定。
  - **收尾门禁：** `pnpm check:original` 与人工 diff 审阅。
  - **处理：** 发现泄漏时删除受影响的未提交文件，重跑检查。

## 未决事项

无。研究事项（AC-13）与本地试听（AC-14）是执行期的前置验收条件，不是待用户决定的行为选择；若不能达到门槛，任务按[研究要求](#研究要求)的阻塞规则停止。

## 审批

用户于 2026-10-05 明确批准本 spec（“approve spec and generate goal”）。批准范围包括：

- S-01 至 S-12、AC-01 至 AC-15；
- 切片音效集合、Asset ID 规则、采样格式规则与研究门槛；
- 规范采样 payload、生产音效表、音频转换预算、包身份与导入协议变化；
- 播放控制器的状态、生命周期与释放语义，以及技术决定。

生成与审阅时按“采用推荐答案”授权作出的选择，以及 review-spec 两轮审阅采纳的九项修正，随本次批准一并生效。

**执行期修订（2026-10-05）：** 执行子任务 05 前，按 goal 前提六核对并行任务，发现 P2-05、P2-09 的 spec 都在本 spec 之前获批，并以不同机制处理转换错误层与包身份。依据本 spec 风险约定中的对齐规则，以及用户在 execute-goal 调用中的授权（需要修改 spec 时可以直接修改 spec、goal 与 subtasks，并在执行记录中说明），本 spec 作了以下修订，改为复用共享机制：
- S-06、S-07；
- 采样格式规则、转换与导入作业、音频转换预算中的错误 code；
- 包身份、导入协议变化、协议兼容；
- 技术决定 6、7；
- AC-01、AC-04 至 AC-08；
- 风险约定。

S/AC 编号与其余行为不变。详情见 [goal 执行记录](./goal.md#执行记录)。

**执行期修订二（2026-10-05）：** 子任务 09 的研究发现，导弹发射与 Warp 开始是两个字节完全相同的不同条目。本 spec 原规定此类情况记为契约问题、修订 spec，因此同样依据上述授权修订了“切片音效集合”中跨角色共用样本的规则：两个角色各有一个 Asset，各自映射到原版为该角色播放的条目；同一条目被两个核心角色使用时，仍为契约问题。其余行为不变。研究事项（AC-13）与本地试听（AC-14）仍是执行期的验收条件；达不到门槛时任务按阻塞规则停止，本批准不预先认定其结论。

**执行期修订三（2026-10-05）：** 子任务 05 开始时核对发现，P2-05 已合入 `main`。它把协议递增为版本 2，追加 `convert-graphics` 阶段，并以 `budget-exceeded` 表达预算超限；图形步骤结果留在作业内，不发送组。本分支已以合并提交并入 `main`。依据风险约定“协议版本按合入顺序依次递增，已落地者的定义由后者复用”与同一授权，修订了以下各处：
- 当前实现与依据；
- 转换与导入作业、音频转换预算与导入协议变化（版本 3，阶段 `identify-source`、`convert-graphics`、`convert-audio`；预算超限为 `budget-exceeded`；作业只发送 `audio` 组，用量含图形转换用量）；
- 包身份的组装顺序；
- 技术决定 7、AC-05、AC-07、AC-08 与风险约定。

S/AC 编号、音频行为与其余契约不变。

**2026-10-17 修订（P3-14 的 D-01：播放控制器的扩展，经用户明确批准）：** 用户于 2026-10-17 明确批准，选择“批准全部推荐方案（含三项差异）”（P3-14 spec 的 [D-01 定稿](../../p3/14/spec.md#d-01-定稿已批准)，本 spec 相关的是 D1-07、D1-13 与 D1-15；D1-13 的 Web Audio 重采样与浮点输出是已批准的差异）。只新增“[播放控制器的扩展（P3-14 的修订）](#播放控制器的扩展p3-14-的修订)”一节与本条记录：整数音量、声像与速率参数（速率上限 44,100 Hz），`update`、`voiceState`、`pause`/`resume` 门禁（只有本次暂停造成的挂起保留发声），以及按源遍数计的 `repeat`。查看器的既有行为不变。S/AC 编号与本 spec 的其他契约不变，历史证据不改写。
