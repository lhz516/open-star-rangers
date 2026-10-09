---
type: plan
status: accepted
phase: P2
task: "04"
updated: 2026-10-08
related: [ADR-0002, ADR-0003, ADR-0008, ADR-0015]
reviewed: sha256:d7e3bb5aad76
---

# P2-04：Worker 导入协议与生命周期 — Spec

## 问题与目标

[P2-02](../02/spec.md) 与 [P2-03](../03/spec.md) 已能在纯模块中按需读取用户的 CloneCD 镜像、识别基准版本并取得已验证来源，但这些能力只在 Node 测试与本地 CLI 中运行过：

- **没有后台线程：** 浏览器中没有代码把用户的 `File` 交给后台线程读取。`src/workers/` 仍是计划目录，导入占位页（`src/ui/pages/ImportPlaceholderPage.tsx`，P2-11 已删除）不读取任何文件。
- **没有消息约定：** 作业身份、进度、结果、错误与取消都没有消息形状。[P2-01](../01/spec.md) 规定了二进制 payload 的所有权规则，但从未实际在线程间转移。
- **没有作业生命周期：** 启动失败、Worker 崩溃、取消、重试、迟到消息和释放都没有定义。P2-05 至 P2-09 的转换因此没有可接入的入口。

本任务完成后：

- **Worker 入口：** 每个导入作业在一个专用的模块 Worker 中运行。Worker 经 P2-03 产品入口打开并识别用户的文件组，报告进度与来源身份，然后正常结束，或以分类错误失败。
- **协议：** 主线程与 Worker 之间的每条消息都带协议版本或作业身份与顺序号，双方在运行时严格校验。规范结果以资源组为单位传输，二进制 payload 以转移方式交出，接收方用 P2-01 的完整性验证重新核对。
- **生命周期：** app 层的作业持有者同一时刻只管理一个活动作业，取消即终止 Worker。旧作业的消息不会改变新作业的状态，失败不会被当成空结果或成功。
- **证明：**
  - Node 测试覆盖协议、宿主与状态机；
  - 真实 Chromium 中的模块 Worker 用合成光盘证明读取、转移、取消、主页面响应，以及 Worker 的终止与监听释放；
  - 本地基准镜像在 Node 中走通产品路径的成功结果。
- **下游：**
  - P2-05 至 P2-09 在本任务的导入作业中追加转换步骤；
  - [P2-10](../tasks.md#p2-10-indexeddb-最小资源缓存) 接收作业移交的已验证组结果；
  - [P2-11](../tasks.md#p2-11-真实导入流程与最小资源查看器) 把作业持有者接入导入页面。

阶段范围依据[总计划](../../master-plan.md#12-开发阶段与验收条件)，任务导航见[阶段索引](../tasks.md#p2-04-worker-导入协议与生命周期)。本任务遵循三项冻结决定：

- [总计划 §2](../../master-plan.md#2-冻结的技术选型)：导入与转换放在 Worker，主模拟首版留在主线程；
- [§4.1](../../master-plan.md#41-目录与模块划分)：`workers/` 是导入/转换 Worker 的入口；
- [§8](../../master-plan.md#8-浏览器运行存档与隐私)：原版数据在本地选择与转换，默认不上传。

## 范围

### 包含

- **S-01 消息协议与运行时校验：** 在计划新增的 `src/workers/` 中定义[消息协议](#消息协议)：
  - 内容包括协议版本、作业身份、顺序号、阶段进度、来源身份、组结果、结束与失败消息，以及纯数据的[错误 DTO](#错误层与错误码)。
  - 协议模块严格校验两个方向的每条消息，拒绝未知字段、类型与非法顺序；诊断不回显值，校验结果冻结。
  - 协议模块只依赖 `content/`，因此 app 与 platform 可以导入它，而不触及 `original-data`。
- **S-02 Worker 宿主：** Worker 内的宿主在模块载入后发送 `ready`，只接受一条有效的 `start`，运行一个作业，然后发送 `finished` 或 `failed` 并关闭自己。
  - 宿主捕获作业中的全部异常与未处理拒绝：已知错误按所属层转为 DTO，其他异常一律报 `internal-error`，不带宿主错误文本。
  - 组结果用 P2-01 的 `payloadTransferList` 计算转移列表后发送；不独占的 payload 在发送前被拒绝。
- **S-03 导入作业：** 生产作业的步骤如下：
  - 把每个文件包装为 P2-02 的 `BlobByteSource`，并计量端口实际返回的字节；
  - 经 P2-03 产品入口 `openVerifiedSource` 打开并识别来源；
  - 依次发送 `identify-source` 阶段的进度、`identified` 与 `finished`。

  本任务的作业不产生组结果。预算沿用 P2-02 的默认值（`.ccd` 与 `.img` 的总字节）。P2-05 至 P2-09 在这个作业中追加自己的转换步骤与阶段，不另建入口或协议。
- **S-04 浏览器 Worker 适配：** 计划新增的 `src/platform/workers/` 以模块 Worker 载入导入入口，实现 app 定义的 [Worker 端口](#作业持有者)：
  - 发送消息，转交收到的消息，并报告 `messageerror` 与 `error`；
  - 终止时先移除自己注册的全部监听；
  - 不把宿主错误文本或事件对象交给 app；
  - 构造函数可以替换，供浏览器测试载入合成作业入口。
- **S-05 作业持有者：** 计划新增的 `src/app/import/` 提供[作业持有者](#作业持有者)，包括状态机、开始、取消、移交结果、释放，以及可供 `useSyncExternalStore` 使用的订阅与冻结快照。
  - 同一时刻至多一个活动作业；每个作业使用新的作业 ID 与新的 Worker。
  - 取消、释放与终态都立即终止 Worker。
- **S-06 结果接收与所有权：** 持有者按[组结果的验证顺序](#组结果的验证顺序)核对每个组结果：先核对消息外层，再核对来源指纹，最后用切片定义与 `validateGroup` 重新验证内容，并核对内容声明的组与消息一致。
  - 完整的组连同 payload 保留，直到一次性移交；不完整的组只保留诊断。
  - payload 字节不进入快照；失败或取消时丢弃全部已收结果。
- **S-07 作业隔离与迟到消息：** 持有者只处理当前作业、当前端口上的消息，并核对作业 ID 与连续的顺序号。旧作业的消息，以及重复或乱序的消息，都不能改变当前或之后作业的状态。
- **S-08 失败分类与隐私：** 失败按[错误层与错误码](#错误层与错误码)分类：
  - 光盘层与来源层错误原样转换，内容层错误保留 code 与路径；
  - 本任务新增 6 个导入层错误码；
  - 任何失败都不暴露部分结果；
  - 诊断、快照与控制台输出都不含文件名、字节、宿主错误文本或绝对路径。
- **S-09 构建与边界：** 构建与边界规则如下：
  - Vite 以 ES 模块格式构建 Worker；
  - Worker 代码继续受 P2-03 的能力边界约束，只经产品入口取得原版字节，并另由 lint 禁用网络 API；
  - 协议、app 与 platform 的原版数据隔离保持通过。
- **S-10 合成测试：**
  - **Node：** 使用假端口与结构化克隆端口；
  - **浏览器：** 在开发服务器中运行真实模块 Worker，包括生产入口，以及只在测试中使用的合成作业入口。

  测试只用代码生成的合成光盘与内容，不读取 `local/`，仓库不新增二进制样本。
- **S-11 本地基准核对：** 在开发者机器上，用与 Worker 相同的作业与宿主模块，连接 app 作业持有者，在 Node 中处理本地基准镜像，确认产品路径的成功结果与读取量。
- **S-12 文档：** 同步[源码结构](../../../engineering/source-structure.md)、[工程约定](../../../engineering/README.md)中的边界规则与测试说明。

### 不包含

- **页面与 React（归 P2-11）：**
  - 文件选择、导入页面、React hook，以及面向玩家的进度与错误文案；
  - 真实 React StrictMode 双挂载与 Fast Refresh 的浏览器验证。

  本任务提供它们依赖的“创建 → 释放 → 再创建”基础，并在 Node 与浏览器中验证；这与 [P1-05](../../p1/05/spec.md) → P1-10 的分工相同。
- **生产构建中的 Worker：** 页面尚未引用作业持有者，生产构建不会产生 Worker chunk。生产预览中的 Worker 载入、CSP 与 SWA 回退由 P2-11 接入页面时验证；产物来源与许可审阅归 P2-12。
- **转换与缓存：**
  - payload 转换：P2-05 至 P2-09；
  - IndexedDB 缓存与缓存键：P2-10；
  - 全包完整性判定与“资源可用”状态：P2-11。
- **网络审计：** 主页面与 Worker 的实际请求审计归 P2-12；本任务只提供静态禁用规则。
- **其他：**
  - 多作业并发、Worker 池、跨刷新恢复作业；
  - 启动或执行超时，以及协作式取消；
  - SharedArrayBuffer、OffscreenCanvas 与主模拟 Worker；
  - Firefox/WebKit 与实机矩阵（P5）。
- **既有契约：** 不修改 P2-01 至 P2-03 的错误码、DTO、限值与预算语义，不新增依赖。

### 涉及模块

| 模块 | 责任与影响 |
|---|---|
| `src/workers/`（计划新增） | 协议与校验、Worker 宿主、导入作业、生产 Worker 入口；只在测试中使用的合成作业入口为 `*.test-support.ts` |
| `src/platform/workers/`（计划新增） | 浏览器模块 Worker 的创建、消息与错误转交、监听移除与终止 |
| `src/app/import/`（计划新增） | Worker 端口接口、作业持有者（状态机、结果接收、移交与释放） |
| [content/](../../../../src/content/) | 只被消费：`validateGroup`、`CLASSIC_P2_SLICE`、读取器与 `payloadTransferList`；不改契约 |
| [original-data/](../../../../src/original-data/) | 只被 Worker 消费：产品入口、`DiscReadError`、`SourceError` 与字节端口类型；不改实现 |
| [platform/files/](../../../../src/platform/files/) | Worker 复用 `BlobByteSource`；不改实现 |
| [vite.config.ts](../../../../vite.config.ts) | 增加 Worker 的 ES 输出格式 |
| [eslint.config.js](../../../../eslint.config.js)、[engineering-boundaries.test.ts](../../../../tools/engineering-boundaries.test.ts) | 新增 Worker 的网络 API 禁用规则与 fixture；既有边界不放宽 |
| [e2e/](../../../../e2e/)、[playwright.config.ts](../../../../playwright.config.ts) | 新增只在开发项目运行的 Worker 浏览器测试，扩展探针以观测 Worker 的创建、终止与监听 |
| [源码结构](../../../engineering/source-structure.md)、[工程约定](../../../engineering/README.md) | 记录新目录、协议、边界与测试 |

## 当前实现与依据

- **读取入口：** [open-verified-source.ts](../../../../src/original-data/source/open-verified-source.ts) 的 `openVerifiedSource(files, options)` 是产品代码取得原版字节的唯一入口。
  - 它接受 `{ name, source }` 文件组与 P2-02 的打开选项（`limits`、`cancellation`）；
  - 返回 `VerifiedSource`：`identity` 可结构化克隆，句柄本身不可克隆；
  - 失败时抛出 `DiscReadError` 或 `SourceError`，两者的 `toData()` 形状相同：`{ code, location, reason, limit }`。

  边界由 [P2-03 S-07](../03/spec.md#包含) 及其后续补救规定：Worker 不能导入底层能力（打开镜像、在任意文件上打开封包、内存解析、自定义白名单识别），原版字节只能经产品入口取得；测试与测试支持可以使用底层能力。见[工程约定](../../../engineering/README.md#lint-规则eslintconfigjs)。
- **字节端口：** [blob-byte-source.ts](../../../../src/platform/files/blob-byte-source.ts) 的 `BlobByteSource` 只用 Blob API，页面与 Worker 都适用。Blob 读取不可中止。
- **内容契约：** [completeness.ts](../../../../src/content/completeness.ts) 的 `validateGroup(definition, { manifest, payloads, sources })` 重新读取组输入并哈希 payload，返回 `group-complete` 或带诊断的 `incomplete`；格式错误的输入也以诊断返回，不抛出。
  - [ownership.ts](../../../../src/content/ownership.ts) 的 `payloadTransferList` 要求每个视图独占整个非共享 buffer，转移后发送方的视图失效。
  - [synthetic-content.test-support.ts](../../../../src/content/synthetic-content.test-support.ts) 生成覆盖全部角色的合成内容包。
- **来源身份：** `SourceIdentity` 为 `{ versionId, fingerprint, files }`。生产指纹为 `source:sha256:` 加 64 位十六进制，见[版本识别与已验证来源](../../../engineering/modules/original-data.md#版本识别与已验证来源)。
- **合成光盘：** [disc.test-support.ts](../../../../src/original-data/disc/disc.test-support.ts) 的 `syntheticFileDisc` 按路径放置任意文件，生成完整的合成 CloneCD 镜像；[source.test-support.ts](../../../../src/original-data/source/source.test-support.ts) 的 `catalogFor` 为合成文件生成白名单。
- **生命周期先例：** P1 的 owner 模式见 [use-synthetic-demo-owner.ts](../../../../src/app/composition/use-synthetic-demo-owner.ts)：effect 在卸载、StrictMode 重跑或 Fast Refresh 时先释放旧 owner，再创建新 owner。[ADR-0015](../../../decisions/ADR-0015-source-module-structure.md) 第 4 条规定，端口由提出需求的模块拥有，平台提供实现，应用层装配。
- **浏览器测试先例：**
  - [browser-replay.spec.ts](../../../../e2e/browser-replay.spec.ts) 在开发服务器中动态导入 `/src/…` 模块，因此只在开发项目运行；
  - [browser-probes.ts](../../../../e2e/support/browser-probes.ts) 在页面脚本之前安装，记录监听的注册与移除。

  当前 Playwright 只使用已安装的 Chrome（[playwright.config.ts](../../../../playwright.config.ts)）。
- **尚不存在：** 任何 Worker、消息协议、作业状态、Vite Worker 配置，以及引用它们的页面。

本任务不涉及原版事实，没有相关的 U 项。

## 行为与边界

| 场景或状态转换 | 预期结果 | 拒绝或失败时的反馈 |
|---|---|---|
| 正常导入 | `starting` → `running`：`identify-source` 进度的 `readBytes` 递增，收到 `identified`；之后 → `finished`，组为空。终态时监听已移除、Worker 已终止 | — |
| 文件组不合 P2-02 规则 | → `failed` | `disc` 层的原始 code 与位置，例如 `unsupported-file-set@files` |
| 不是基准版本 | → `failed`；之后的覆盖文件不再读取 | `source/unsupported-version@file:/路径` |
| 读取失败、预算超限 | → `failed` | `disc` 层的 `read-failed`、`budget-exceeded` 等 |
| Worker 脚本载入失败，或模块顶层抛错 | → `failed`；从未发送 `start` | `import/worker-start-failed@worker` |
| 作业抛出未分类的异常或拒绝 | → `failed` | `import/internal-error@job`，原因是固定文本 |
| 收到 `ready` 后，Worker 报告未捕获错误 | → `failed` | `import/worker-failed@worker` |
| 消息非法、乱序、重复，作业 ID 或版本不符，组结果的内容声明了另一个组，或出现 `messageerror` | → `failed` | `import/protocol-error@message…` |
| 收到 `ready` 后，发送 `start` 时同步抛错 | → `failed` | `import/worker-failed@worker` |
| 组结果的来源状态集绑定的指纹不是已识别来源的指纹 | → `failed` | `import/invalid-result@groups.<组>` |
| 组结果的内容未通过完整性验证（包括清单或来源状态格式错误） | 作业继续；该组记为 `incomplete` 并带诊断，payload 引用立即释放 | `finished` 只表示作业正常结束，不表示资源可用 |
| 取消（`starting` 或 `running`） | 同步变为 `cancelled`；监听先移除，Worker 随即终止；之后不再通知 | — |
| 有活动作业时再次开始 | 返回 `busy`，不改变任何状态 | — |
| 文件数不在 1–4，或某项不是名称为 1–255 个字符的 Blob | 返回 `invalid-files`，不创建 Worker | — |
| 调用者在 `ready` 之前修改传入的文件数组 | 不影响已接受的作业：发送的仍是开始时的快照 | — |
| 终态后再次开始（重试） | 新的作业 ID 与新的 Worker；上一作业未移交的结果被丢弃 | — |
| 旧作业的迟到消息 | 忽略，不改变状态，也不通知 | — |
| 释放持有者 | 终止活动 Worker、移除监听、丢弃结果、清空订阅；之后的命令被拒绝，快照不再变化 | 命令返回 `disposed`、false 或 null |
| Worker 卡住、不再发送消息 | 没有超时；作业保持当前状态，用户可以取消 | — |

**不变量：**

- 任何时刻至多一个活动作业与一个存活的 Worker。终态后，该作业的 Worker 不再存活，它的监听也不再注册。
- 只有作业持有者能改变作业状态；快照、订阅者与 Worker 都不能。
- `failed` 与 `cancelled` 不暴露来源身份与组结果；`finished` 只表示作业正常结束，不表示资源可用。全包判定归 P2-11。
- 文件内容只在 Worker 中读取，主线程不读取文件字节。

## 数据模型与契约

全部类型都是计划新增的，位于 `src/workers/` 的协议模块与 `src/app/import/`。文件名以 goal 为准。

### 消息协议

每条消息都是只含下列字段的 plain record。`IMPORT_PROTOCOL_VERSION` 为 1；消息形状、阶段集合或顺序规则的任何变化都要递增版本。

| 消息 | 方向 | 字段 | 约束 |
|---|---|---|---|
| `ready` | Worker → 主线程 | `{ type, protocol }` | 模块载入、监听安装后恰好发送一次；`protocol` 须等于主线程的版本 |
| `start` | 主线程 → Worker | `{ type, protocol, jobId, files }` | 收到有效的 `ready` 后恰好发送一次，是主线程唯一会发送的消息。`jobId` 为正安全整数。`files` 为 1–4 项 `{ name, blob }`：`name` 为 1–255 个 UTF-16 码元的字符串，`blob` 为 `Blob`。配对与扩展名由 P2-02 判定 |
| `progress` | Worker → 主线程 | `{ type, jobId, sequence, stage, readBytes }` | `stage` 属封闭集合，本任务只有 `identify-source`。`readBytes` 为本作业各输入端口已返回的累计字节，不减少，且不超过输入总字节。阶段开始时发送一次，之后每次端口读取完成发送一次 |
| `identified` | Worker → 主线程 | `{ type, jobId, sequence, identity: { versionId, sourceFingerprint } }` | 至多一次，在任何组结果之前。之后不再出现 `identify-source` 进度。`versionId` 为至多 64 字符的小写 token，`sourceFingerprint` 形如 `source:sha256:<64 位小写十六进制>` |
| `group` | Worker → 主线程 | `{ type, jobId, sequence, group, input: { manifest, payloads, sources } }`，附转移列表 | `group` 属 `RESOURCE_GROUPS`，每组至多一次，且须在 `identified` 之后。`input` 为 P2-01 的 `GroupInput`，恰好含这三个字段；`sources` 是带字符串 `sourceFingerprint` 的 record。内容声明的组须等于 `group`。每个 payload 视图独占整个 buffer，并随消息转移。验证顺序见下文 |
| `finished` | Worker → 主线程 | `{ type, jobId, sequence, groups, usage }` | 终态，须在 `identified` 之后。`groups` 按发送顺序列出已发送的组，须与实际收到的一致；`usage` 为完整的 P2-01 预算记录 |
| `failed` | Worker → 主线程 | `{ type, jobId, sequence, error }` | 终态，可出现在任何时候。`start` 无法读出作业 ID 时 `jobId` 为 null |

**共同规则：**

- `ready` 之后的每条消息都带 `start` 的作业 ID 与 `sequence`；`sequence` 从 1 开始，每条消息加 1。
- 终态消息之后，宿主不再发送任何消息。
- 来源身份只传版本 ID 与指纹，不传覆盖文件列表：
  - 指纹已由覆盖文件的路径、大小与哈希唯一确定；
  - 主线程的显示与缓存键只需要这两项；
  - 不传文件列表，也就不必在主线程重复 `DiscPath` 语法。

### 组结果的验证顺序

持有者按下列顺序处理 `group` 消息。第 1、2、3、5 步不合时作业失败；任何不予保留的组，其 payload 引用都立即释放：

1. **消息外层：** 字段、类型、作业 ID 与顺序号，`group` 属资源组，`input` 恰好含三个字段，`sources` 是带字符串 `sourceFingerprint` 的 record。不合时报 `protocol-error`。
2. **顺序：** 须在 `identified` 之后，且该组尚未收到。不合时报 `protocol-error`。
3. **来源绑定：** `sources.sourceFingerprint` 须等于已识别来源的指纹。不合时报 `invalid-result@groups.<组>`。
4. **内容验证：** 用 `CLASSIC_P2_SLICE` 与 `validateGroup` 重新验证 `input`。P2-01 由此核对清单来源与来源状态集的指纹一致，并核对 payload 的版本、长度与哈希。
5. **组一致：** 验证结果中的组若可读（不为 null），须等于消息的 `group`；不合时报 `protocol-error@message.group`。
6. **记录：**
   - `group-complete`：连同 payload 保留，`assets` 为已验证的描述符个数；
   - `incomplete`：只保留诊断，`assets` 为 null。清单无法读取、来源状态集格式错误或内层有多余字段，都在这里成为诊断。

### 错误层与错误码

错误 DTO 为 `{ layer, code, location, reason, limit }`：

- `code` 为至多 64 字符的小写短横线 token；
- `location` 与 `reason` 各为 1–512 个可打印 ASCII 字符；
- `limit` 为 null，或 `{ name, limit, observed }`：`name` 为至多 64 字符、以小写字母开头的字母数字 token，`limit` 为非负安全整数，`observed` 为非负安全整数或 null。

| `layer` | 来源 | 转换 |
|---|---|---|
| `disc` | `DiscReadError`（含 P2-01 预算记录的形状码） | `toData()` 原样 |
| `source` | `SourceError` | `toData()` 原样 |
| `content` | `ContentContractError`（例如 `payloadTransferList` 拒绝） | `code`、`path`（作 `location`）与 `reason`；`limit` 为 null |
| `import` | 本任务 | 见下表，code 为封闭集合 |

| `import` code | 产生方 | 条件 | 位置 |
|---|---|---|---|
| `invalid-request` | Worker | `start` 不合协议，或 `start` 之后又收到消息 | `request`，或 `request.` 加字段路径（如 `request.files[1].name`） |
| `internal-error` | Worker | 作业中未分类的异常或未处理拒绝 | `job` |
| `worker-start-failed` | 主线程 | 创建 Worker 时抛错，或收到 `ready` 之前出现 `error` 或 `messageerror` | `worker` |
| `worker-failed` | 主线程 | 收到 `ready` 之后，Worker 报告 `error`，或发送 `start` 时同步抛错 | `worker` |
| `protocol-error` | 主线程 | 消息未通过校验；顺序、作业 ID 或版本不符；组结果的内容声明了另一个组；`ready` 之后的 `messageerror`；`jobId` 为 null 的 `failed` | `message`，或 `message.` 加字段路径 |
| `invalid-result` | 主线程 | 组结果的来源状态集绑定的指纹不是已识别来源的指纹 | `groups.<组>` |

主线程只接受 Worker 报告 `import` 层中的 `invalid-request` 与 `internal-error`；另外四个只由主线程产生。原因都是固定文本。宿主的异常消息、`ErrorEvent` 的文本与文件名都不进入 DTO。

### 作业持有者

**Worker 端口：** 由 app 定义，platform 实现。工厂接收三个回调——收到消息、`messageerror`、`error`——并返回端口。

- `post(message)`：发送一条消息；可能同步抛错（例如序列化失败）。持有者捕获它，作业以 `worker-failed` 失败，端口恰好终止一次。
- `terminate()`：先移除全部监听，再终止 Worker；可重复调用。

终止之后，回调不再被调用。

**命令：**

| 命令 | 契约 |
|---|---|
| `start(files)` | 空闲或终态时创建新作业（新作业 ID、新端口），返回 `{ status: 'started', jobId }`。以下情况拒绝，且不改变状态、不创建端口：有活动作业时返回 `busy`；文件数不在 1–4、或某项不是名称为 1–255 个 UTF-16 码元的 Blob 时返回 `invalid-files`（主线程从不发送不合协议的 `start`）；释放后返回 `disposed`。开始新作业时，丢弃上一作业未移交的结果。被接受的文件列表立即复制为私有的 `{ name, blob }` 快照（只保留 Blob 引用，不读取或复制内容），输入总字节也由它计算；调用者之后修改数组不影响作业。发送 `start` 或终止端口后，持有者释放这些引用 |
| `cancel()` | `starting` 或 `running` 时同步变为 `cancelled` 并终止端口，返回 true；其他状态返回 false |
| `takeGroups()` | `finished` 时一次性返回完整的组：`{ group, manifest, payloads, sources }`，容器冻结，payload 视图从此归调用者独占，持有者不再引用它们。其他状态、再次调用或释放后都返回 null |
| `dispose()` | 可重复调用。终止活动端口、丢弃结果、清空订阅；之后的命令返回 `disposed`、false 或 null |
| `subscribe(listener)` / `getSnapshot()` | 状态变化后同步通知。快照冻结，在两次变化之间保持同一对象。一个订阅者抛错，不影响其他订阅者与状态 |

**快照：** 冻结的 plain data，不含 payload 字节。

| `status` | 字段 |
|---|---|
| `idle` | — |
| `starting` | `jobId` |
| `running` | `jobId`、`stage`（尚无进度时为 null）、`readBytes`、`identity`（未识别时为 null）、`groups` |
| `finished` | `jobId`、`identity`、`groups`、`usage` |
| `failed` | `jobId`、`stage`（尚无进度时为 null）、`error` |
| `cancelled` | `jobId`、`stage`（尚无进度时为 null） |

`groups` 的每项为 `{ group, status, assets, diagnostics }`：`status` 为 `group-complete` 或 `incomplete`；`assets` 对完整的组为已验证的描述符个数，对不完整的组为 null；`diagnostics` 为 P2-01 的安全诊断（完整的组为空）。

### 持久化与兼容

本任务不读写 IndexedDB、localStorage 或宿主文件，作业状态不跨刷新保留。

- **协议兼容：** 主线程与 Worker 来自同一次构建，`ready` 握手的版本不符时作业以 `protocol-error` 失败，不发送文件。
- **下游兼容：** 消息形状、错误层与 code、快照与移交形状由 P2-05 至 P2-11 消费，变化时须同步这些消费者并递增协议版本。
- **上游兼容：** P2-01 至 P2-03 的错误码与 DTO 原样透传；它们的变化会经错误层直接反映在快照中。

## 技术决定

用户在请求本 spec 时说明，需要回答的问题直接采用最推荐的答案。以下决定按此记录；整个契约仍须用户明确批准（见[审批](#审批)）。

1. **每个作业一个专用模块 Worker，取消即终止：**
   - Blob 读取不可中止。转换中的同步计算也不会让出事件循环，协作式取消无法及时生效。终止是唯一能立即停止全部工作并释放内存的方式。
   - 作业之间不共享 Worker：迟到消息无法影响新作业，崩溃也不会污染下一个作业。
   - 每次导入只多一次模块 Worker 启动，相对读取与哈希可以忽略。
   - 因此协议中没有取消消息；“取消”是持有者的状态转换加上终止 Worker。
2. **先握手，主线程只发送一条消息：** Worker 在 `ready` 中报告协议版本，主线程核对后才发送 `start`。这样“启动失败”有明确定义（`ready` 之前的错误），版本不符时文件不会发出。
3. **文件以 Blob 引用传入 Worker：** `File` 的结构化克隆不复制内容；主线程不读取文件字节，Worker 用 `BlobByteSource` 按需读取。
4. **协议模块不依赖 `original-data`：**
   - app 与 platform 不能触及 `original-data`（包括经中间模块），因此错误 DTO 由协议自己定义。
   - 光盘层与来源层的 code 按 token 语法校验，不在主线程复制它们的封闭集合；Node 测试核对已知的全部 code 都合语法。
   - 来源身份只传版本与指纹（见[消息协议](#消息协议)）。
5. **结果以资源组为单位：**
   - 资源组是 P2-01 完整性验证的单位。Worker 发送原始的组输入，主线程用 `validateGroup` 重新验证；接收方不信任发送方的结论，与 P2-01 一致。
   - 不完整的组记录诊断，但不使作业失败。P2-01 规定，不完整的结果供转换任务与查看器诊断使用；转换任务也可能分步交付。全包判定归 P2-11。
   - 组结果绑定的来源若不是本作业识别的来源，说明结果不属于这些文件，作业失败。
6. **一次性移交 payload：** TypedArray 不能冻结（P2-01 S-10），所以 payload 不进入快照，由持有者独占，并一次性移交给缓存或查看器，避免多处共享同一视图或无界复制。
7. **进度只报阶段与实际读取量：** 识别只读取镜像的一小部分，按输入总字节计算的百分比会误导用户。界面如何呈现由 P2-11 决定。每次端口读取完成发送一条进度，结果确定，可以测试。若之后的转换读取次数过多，由相应任务合并进度并递增协议版本。
8. **不设超时：** 没有可依据的阈值，且用户随时可以取消，终止一定生效。
9. **预算沿用 P2-02 默认值：** 识别只读取约 17 MB 原始扇区，远低于默认上限。转换任务各自批准预算时，再收紧作业的组合上限。
10. **端口归 app，实现归 platform：**
    - 遵循 ADR-0015 第 4 条，持有者可以在 Node 中用假端口测试。
    - 生产作业固定经产品入口打开来源；测试可以向同一作业逻辑注入用合成白名单的识别。底层能力只有测试支持能取得，因此不削弱 P2-03 的边界。
11. **构建与类型检查：**
    - 使用模块 Worker（`type: 'module'`）与 Vite 的 `worker.format: 'es'`，Worker 与页面使用同样的 ES 模块语义。
    - Worker 代码纳入现有类型检查与 lint。若需要 WebWorker 全局类型，只为 Worker 入口另设程序，且依赖图与能力边界检查必须覆盖它。
12. **测试分层：**
    - **开发服务器：** 页面尚未接线，生产构建中没有 Worker，所以浏览器测试在开发服务器中动态导入模块（与 `browser-replay.spec.ts` 相同）。
    - **成功路径：** 产品入口固定使用生产白名单，合成光盘只能走它的失败路径。成功、转移与阻塞场景改由只在测试中使用的 Worker 入口验证，它与生产入口共用宿主、协议、平台适配与持有者。
    - **本地基准：** [P2 阶段索引](../tasks.md#p2-12-资源管线联合验证与本地对照)规定 agent 浏览器检查只用合成资源，所以产品路径的成功结果在 Node 中用本地基准镜像核对。
13. **静态禁用网络 API：** Worker 代码只处理本地数据。lint 禁止 `src/workers/` 使用 `fetch`、`XMLHttpRequest`、`WebSocket`、`EventSource`、`importScripts` 与 `navigator.sendBeacon`。实际请求审计归 P2-12。
14. **不需要新 ADR：** 以上决定细化了总计划 §2、§4.1、§8 与 ADR-0003、ADR-0015，没有改变冻结决定；不引入新依赖（[ADR-0008](../../../decisions/ADR-0008-mit-and-dependency-licenses.md)）。

## 验收标准

| ID | 可观察的通过条件 | 验证方法与所需证据 |
|---|---|---|
| AC-01 | **正向：** 两个方向的每种消息都有合法样本通过，校验结果冻结。<br>**负向：** 以下每项都以稳定的 code 与路径拒绝，诊断不含被拒绝的值：<br>- 未知 `type`、缺少或多余字段、协议版本不符；<br>- 作业 ID 或顺序号不是正安全整数；<br>- 文件为 0 或 5 项，`name` 长 0 或 256，`blob` 不是 Blob；<br>- 未知阶段，`readBytes` 为负数或非整数；<br>- `versionId` 含大写或超过 64 字符，指纹不是 `source:sha256:` 加 64 位十六进制；<br>- 未知资源组，`sources` 为 null；<br>- 错误 DTO 的层未知、code 不合语法、`location` 或 `reason` 为空或超过 512 字符、`limit` 形状错误。<br>**code 语法：** P2-01 至 P2-03 已知的全部错误码与限值名都合 DTO 语法 | 表驱动 Node 测试 |
| AC-02 | **握手：** 宿主恰好发送一次 `ready`，只接受一条有效的 `start`。<br>**非法输入：** `start` 非法时，返回 `invalid-request` 及对应位置；作业 ID 无法读出时 `jobId` 为 null。`start` 之后再收到任何消息，作业都以 `invalid-request` 失败。<br>**错误转换：** `DiscReadError` 与 `SourceError` 转为对应层，其余字段等于 `toData()`。`ContentContractError` 转为 `content` 层。以下情况都报 `internal-error`，原因为固定文本，不含异常文本：<br>- 其他同步异常；<br>- 非 Error 值；<br>- 异步的未处理拒绝。<br>**终态：** 终态消息之后宿主关闭，不再发送消息；`sequence` 逐条加 1。<br>**转移：** 发送组结果后，发送方的 payload 视图已失效。非独占、互相别名或已转移的 payload 报 `content` 层对应的 code，该组不被发送 | Node 测试，使用假端点与真实结构化克隆端口 |
| AC-03 | **生产作业，产品入口：**<br>- 不含覆盖文件的合成镜像报 `source/unsupported-version@file:/MAIN/AISTUFF.NOB`；之前有 `identify-source` 进度，其 `readBytes` 大于 0，且等于端口实际返回的字节；<br>- 只有 `.ccd` 的文件组报 `disc/unsupported-file-set@files`，且不发生读取；<br>- 端口读取拒绝时报 `disc/read-failed`。<br>**注入合成白名单的识别（仅测试）：** 依次收到 `identified`（合成指纹）与 `finished`；`groups` 为空，`usage` 等于来源的用量，最后一次进度的 `readBytes` 等于 `usage.sourceReadBytes`。<br>**生产入口：** 只经产品入口打开来源 | Node 测试；依赖图与 lint 证明边界 |
| AC-04 | **状态转换：** 持有者实现[行为与边界](#行为与边界)中的全部状态转换。<br>**拒绝：** `busy`、`invalid-files` 与 `disposed` 不改变状态，也不创建端口。<br>**取消：** 同步完成；每个作业恰好终止一次端口，终止之后没有回调。<br>**释放：** 可重复调用，之后不再通知。<br>**快照：** 冻结，两次变化之间保持同一对象。<br>**订阅者：** 一个订阅者抛错不影响其他订阅者。<br>**启动失败：** 端口工厂抛错时，作业报 `worker-start-failed`。<br>**发送失败：** `post(start)` 同步抛错时，作业报 `worker-failed`，端口恰好终止一次。<br>**输入快照：** `ready` 之前修改、清空或替换传入数组的元素，发送的 `start` 仍等于开始时接受的文件 | Node 测试，使用假端口 |
| AC-05 | **迟到消息：** 作业 A 被取消，紧接着开始作业 B。之后 A 端口上的迟到消息（包括带 payload 的组结果）不改变 B 的状态，也不触发通知。<br>**协议错误：** 以下情况都使当前作业报 `protocol-error`，且不会被当成空的 `finished`：<br>- 作业 ID 不符；<br>- 顺序号跳号或重复；<br>- 第二次 `ready`；<br>- `jobId` 为 null 的 `failed`；<br>- `ready` 之后的 `messageerror`。<br>**版本不符：** `ready` 的版本不符时报 `protocol-error`，且从未发送 `start`。<br>**启动阶段：** `ready` 之前出现 `error` 或 `messageerror` 时报 `worker-start-failed` | Node 测试，使用假端口 |
| AC-06 | **结果：**<br>- 绑定已识别指纹的合成四组内容都记为 `group-complete`；<br>- 篡改一个 payload 的组记为 `incomplete`，带 P2-01 诊断，且持有者不再引用它的 payload；<br>- `sources.sourceFingerprint` 不是已识别指纹时报 `invalid-result@groups.<组>`；<br>- 内容声明的组与消息不同（例如 `audio` 内容以 `models` 发送）报 `protocol-error@message.group`；<br>- `identified` 之前的组、重复的组、外层缺字段或多字段，以及与实际不一致的 `finished.groups`，都报 `protocol-error`；<br>- 清单无法读取、来源状态集格式错误、内层有多余字段，都记为 `incomplete`，`assets` 为 null，带 P2-01 诊断。<br>**移交：** `takeGroups` 只在 `finished` 后返回一次；再次调用、释放之后或开始新作业之后都返回 null。<br>**快照：** 任何快照都不含 `Uint8Array`；`failed` 与 `cancelled` 不含来源身份与组 | Node 测试 |
| AC-07 | **集成：** 真实宿主、合成测试作业与真实持有者经结构化克隆端口连接：<br>- 四组 payload 以转移交出，发送方失效，接收方验证通过；<br>- 每层的一个失败样本经端口往返后，DTO 与原值相等。<br>**隐私：** 文件名只出现在主线程发给 Worker 的 `start` 中（包括克隆的 `File` 自带的名称）；Worker 发出的全部消息、快照、错误与诊断都不出现文件名标记 | Node 测试 |
| AC-08 | **生产入口：** 在开发服务器的 Chromium 中，经平台适配载入。用合成 CloneCD 时：<br>- 恰好创建一个模块 Worker；<br>- 收到 `identify-source` 进度，`readBytes` 大于 0；<br>- 最终报 `source/unsupported-version@file:/MAIN/AISTUFF.NOB`。<br>**测试入口：** 合成镜像含 8 个覆盖文件，大小与生产白名单相同、内容合成，并用合成白名单识别。依次收到 `identified`、四个以转移交出的 `group-complete` 组与 `finished`。<br>**终止与监听：** 两种入口在终态后，Worker 都已终止，监听都已移除。<br>**观测：** 记录 Worker 中的识别耗时与读取量，作为观测值，不作阈值 | Playwright 开发项目；探针记录 Worker 的创建、终止与监听；只用代码生成的合成数据 |
| AC-09 | **主页面响应：** 测试作业先发送一条进度，宣告进入同步忙循环；该循环只能被终止结束。收到这条进度之后、取消之前：<br>- 页面上的可信点击得到处理；<br>- 至少交付一次 rAF 回调。<br>**取消：** 随后取消，快照同步变为 `cancelled`；探针观测到恰好一次终止，Worker 的监听为 0，之后没有通知。<br>**重试：** 随后用会正常结束的测试作业开始新作业，它使用新的 Worker 与作业 ID 并成功结束；旧作业的状态从未出现在新作业的快照中 | Playwright 开发项目；循环不会自行结束，因此点击与 rAF 必然与 Worker 计算重叠，不使用耗时阈值 |
| AC-10 | **启动失败：** 入口 URL 不存在，或模块顶层抛错，都报 `worker-start-failed`，且从未发送 `start`。<br>**运行失败：**<br>- `ready` 之后的异步未捕获错误报 `worker-failed`；<br>- 作业抛错报 `internal-error`，不含宿主文本。<br>**释放：** 作业进行中释放持有者，Worker 被终止、监听被移除，之后没有通知。<br>**隐私：** 快照、错误与控制台都不含文件名标记 | Playwright 开发项目 |
| AC-11 | **边界：** lint 与依赖图对以下各项都有正负 fixture，当前仓库无违规：<br>- `src/workers/` 拒绝上述网络 API；<br>- Worker 继续只经产品入口取得原版字节；<br>- 协议、`src/app/import/` 与 `src/platform/workers/` 不触及 `original-data`；<br>- 生产模块不导入测试支持的 Worker 入口。<br>**构建：** `vite.config.ts` 以 ES 格式输出 Worker；`pnpm check` 通过；依赖清单与锁文件不变 | `pnpm check`；边界回归测试 |
| AC-12 | **本地基准：** 在开发者机器上，用生产作业、宿主与持有者在 Node 中处理本地基准镜像：<br>- 收到 `identified`：`star-rangers-1995-cd`，指纹等于 P2-03 固定的生产常量；<br>- 以 `finished` 结束，组为空，最后一次进度的 `readBytes` 等于 `usage.sourceReadBytes`；<br>- 记录耗时与读取量。<br>**输出：** 只含版本 ID、指纹、计数、读取量、耗时与结论 | 本地运行，脚本与输出留在 `local/`；subtask 证据只记录命令、计数与结论 |
| AC-13 | **文档：**<br>- [源码结构](../../../engineering/source-structure.md)记录新目录、协议、端口、持有者与测试入口；<br>- [工程约定](../../../engineering/README.md)记录网络 API 禁用规则与只在开发项目运行的 Worker 浏览器测试；<br>- [阶段索引](../tasks.md)链接本 spec。<br>文档链接与元数据检查通过 | 文档检查 |

## 验证策略

- **单元与契约测试：**
  - **协议：** 校验的表驱动测试（AC-01）；
  - **宿主：** 使用假端点（AC-02）；
  - **作业：** 使用合成光盘与记录读取的端口（AC-03）；
  - **持有者：** 使用假端口（AC-04 至 AC-06）；
  - **集成：** 经结构化克隆端口（AC-07）。

  测试与源码同目录。合成光盘、白名单与内容包复用现有测试支持；不读取 `local/`。
- **Replay 与一致性：** 不适用。本任务不涉及 Core、tick 或游戏状态。
- **浏览器验证：** 新增只在 Playwright 开发项目运行的 Worker 测试（AC-08 至 AC-10），按 [browser-testing](../../../../.agents/skills/browser-testing/SKILL.md) 准备合成数据与清理。
  - **探针：** 扩展探针，记录 Worker 的构造、`terminate` 调用，以及注册在 Worker 对象上的监听。
  - **合成文件：** 由页面内代码生成，构造为 `File`。
  - **入口：** 生产入口与测试入口都经平台适配载入。
  - **范围：** 生产预览与真实 StrictMode、Fast Refresh 的验证归 P2-11（见[不包含](#不包含)）。
- **实机与原版对照：** 不做视觉或听觉对照。AC-12 在开发者机器的 Node 中用本地基准镜像核对产品路径，结果只留在 `local/`。
- **工程检查：**
  - 迭代时：`pnpm exec vitest run src/workers src/app/import src/platform/workers tools/engineering-boundaries.test.ts`；
  - 完成前：`pnpm check`；
  - 浏览器：`pnpm exec playwright test e2e/<新测试> --project=development`（文件名以 goal 为准），提交前运行完整的 `pnpm test:e2e`；
  - 合规：`pnpm check:original`。

## 风险与恢复

风险等级：中。本任务新增跨线程的并发与生命周期，后续全部转换都依赖它；但它不改既有数据契约，也不持久化任何状态。

- **生产构建未在本任务中验证：** 开发服务器与生产构建在 chunk 拆分和 `import.meta.url` 改写上可能不同。
  - 缓解：统一使用模块 Worker 与 ES 输出格式；P2-11 的 spec 必须包含生产预览中的 Worker 载入、CSP 与 SWA 回退验证。
- **主线程验证组结果的开销：** `validateGroup` 在主线程哈希 payload，开销与 payload 总量成正比。
  - 缓解：切片的 payload 有预算上限；转换任务在浏览器中实测，确有瓶颈再按实测调整，不提前优化。
- **终止丢弃进行中的工作：** 作业不保存中间状态。缓存写入由 P2-10 设计为原子提交，终止不会留下完整标记。
- **进度消息过多：** 每次端口读取都发一条进度；读取次数多的转换可能产生大量消息。
  - 缓解：相应任务合并进度，并递增协议版本。
- **浏览器兼容：** 模块 Worker 在仍受支持的主流浏览器中都可用，跨引擎验证归 P5。
- **内存：** 未移交的结果只保留到移交、新作业开始或释放；不完整的组立即释放 payload。
- **恢复：** 没有持久化状态，回退只需移除新增模块与配置。协议变化由版本握手拦截；下游消费者随协议版本同步修订。

## 未决事项

无。

## 审批

用户于 2026-10-05 明确批准本 spec。批准范围包括：

- S-01 至 S-12、AC-01 至 AC-13；
- 消息协议、组结果的验证顺序、错误层与错误码、Worker 端口、作业持有者的命令与快照；
- 范围划分（StrictMode/Fast Refresh 与生产构建中的 Worker 归 P2-11，网络审计归 P2-12）及技术决定。

生成与审阅时按“采用推荐答案”授权作出的选择，随本次批准一并生效。
