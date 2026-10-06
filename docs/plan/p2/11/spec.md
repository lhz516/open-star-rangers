---
type: plan
status: accepted
phase: P2
task: "11"
updated: 2026-10-06
related: [ADR-0003, ADR-0005, ADR-0007, ADR-0008, ADR-0012, ADR-0015, U-027, U-028]
reviewed: sha256:b648fab4dd52
---

# P2-11：真实导入流程与最小资源查看器 — Spec

## 问题与目标

P2-01 至 P2-10 已分别交付读取、识别、Worker 作业、四个资源组的转换、缓存适配与 Core 纯载入，但它们还没有接到页面上：

- **页面：** 菜单的导入入口仍是 P1 的[占位页](../../../../src/ui/pages/ImportPlaceholderPage.tsx)，没有文件输入；[主菜单](../../../../src/ui/pages/MainMenuPage.tsx)固定显示“none verified”。
- **作业：** [作业持有者](../../../../src/app/import/import-job-owner.ts)只在 Node 测试与开发服务器的 Worker 测试中使用。页面没有引用它，所以生产构建没有 Worker chunk。
- **缓存：** [缓存适配](../../../../src/platform/storage/browser-resource-cache.ts)没有调用方，`commit` 与 `restore` 需要的包预算也没有确定。
- **消费：** 规范 payload 的展开与合成函数只有 Node 测试；`render/` 只绘制 P1 合成几何。[音频控制器](../../../../src/platform/audio/audio-controller.ts)没有界面；[`loadMission`](../../../../src/core/mission/load-mission.ts) 只在 Node 测试与本地脚本中运行。

前序 spec 把以下事项交给本任务：

| 来源 | 交接事项 |
|---|---|
| [P2-01](../01/spec.md)、[P2-04](../04/spec.md#不包含)、[P2-08](../08/spec.md) | 全包“资源可用”判定 |
| P2-04 | 页面与 React 接线；真实 StrictMode 与 Fast Refresh 的浏览器验证；生产预览中的 Worker 载入、CSP 与 SWA 回退验证（本任务验证本地生产预览中的行为，真实 SWA 配置与响应头仍归 P5，见技术决定 11） |
| [P2-10](../10/spec.md) | 何时提交、何时恢复；“已缓存/仅内存”状态；资源被清除时的重新导入提示；提交与恢复的预算限值 |
| P2-08 | 作业级读取上限与各阶段汇合后的组合上限；试听界面；用真实界面点击进行的实机解锁与听感检查 |
| [P2-06](../06/spec.md#消费者边界) | Three.js 渲染适配：坐标与 UV 原点换算、背面剔除、纹理过滤、按 image Asset ID 共享纹理；渲染前研究效果的贴图坐标（技术决定 17） |
| [P2-07](../07/spec.md) | 查看器中驾驶舱、HUD 与地图合成的实际显示 |
| [P2-09](../09/spec.md) | 导入页面、缓存接线与 Core 载入诊断界面 |

完成后可观察的结果：

- 玩家在页面中选择自己的 CCD/IMG，看到识别与转换进度，可以随时取消。
- 结果如实区分：来源已识别、部分转换、完整资源可查看、已缓存或仅在内存中、任务可载入 Core。
- 完整资源包自动存入本浏览器的 IndexedDB。同源刷新后，可以从缓存恢复，恢复时重新校验。
- 最小资源查看器在一个 WebGL 画面中显示切片的模型与效果、索引图像与调色板、驾驶舱/HUD/地图合成和字库，可以试听核心音效，并显示任务的结构摘要、引用校验与 Core 载入结果。
- P1 合成演示保持独立可用，仍标明为合成演示。界面不出现“可玩”或同义标记。

本任务对[总计划](../../master-plan.md#12-开发阶段与验收条件)四项 P2 退出条件的作用：

- **截图对照：** 提供 P2-12 本地对照所用的查看器；
- **任务载入 Core：** 提供页面上的载入诊断；
- **安全拒绝：** 在页面上给出越界与损坏输入的明确反馈；
- **无需服务器：** 不新增网络通道；网络审计归 P2-12。

任务导航见[阶段索引](../tasks.md#p2-11-真实导入流程与最小资源查看器)。

## 范围

### 包含

- **S-01 应用装配与页面流转：**
  - 页面流转在菜单、导入、合成演示之外增加查看器画面。
  - 应用外壳从入口接收一组端口：作业端口工厂、资源缓存、音频能力、WebGL 表面工厂、预期包配置与错误报告。生产入口只传生产实现与生产包配置；测试经开发服务器的测试入口注入合成实现及与合成目录一致的包配置，生产代码不引用测试支持。
  - 菜单的“原版数据”状态改为反映实际的缓存与内存状态（见[状态阶梯](#状态阶梯)）。
- **S-02 导入页面：** 替换占位页，提供：
  - **文件：** 文件选择控件，接受 `.ccd`、`.img`、`.sub`、`.cue`，可多选；
  - **作业控制：** 开始、进度（阶段与已读取 MiB）、取消；
  - **结果：** 结果摘要（含作业耗时）与按层和 code 分类的失败反馈；
  - **离开：** 返回菜单。

  作业持有者归导入页面。离开页面、卸载、StrictMode 重跑或 Fast Refresh 都会释放持有者，并终止进行中的 Worker。
- **S-03 资源包持有与状态阶梯：**
  - 应用级的资源持有者至多保存一份资源包：作业结束时取走的完整组，或从缓存恢复的包。
  - 持有者用 `CLASSIC_P2_SLICE` 调用 `validatePackage` 做全包判定，并记录缓存状态与任务载入结果。
  - 页面只按[状态阶梯](#状态阶梯)显示经实际验证的状态。
- **S-04 缓存接线：**
  - **列出：** 启动时与每次回到菜单时只列出缓存元数据，不读取 payload。
  - **导入前：** 按包预算做建议性的空间检查。
  - **提交：** 全包完整后自动提交；提交失败时显示“仅在内存中”及原因，可以重试。
  - **恢复：** 由用户触发，只恢复与预期包配置一致的键，并重新校验。
  - 提交与恢复完成后显示耗时。耗时由 `app/` 用页面时钟测量，只用于诊断显示。
  - 失败与资源被清除时给出重新导入提示。不做迁移、清理或缓存管理。
- **S-05 包预算与生产身份：**
  - 包预算等于各转换任务已批准的份额与音频限值之和，不新设数值。
  - 作业级读取上限维持 P2-02 的默认值。
  - 主线程取得包预算、生产 `ConverterVersion` 与生产来源指纹时，不导入 `original-data`。
- **S-06 任务载入诊断：**
  - 从完整的 `logic` 组取出任务、机型表与僚机名单三个逻辑 Asset，解码后调用 `loadMission`。
  - 显示结构摘要（计数、Asset ID 与枚举值，不显示原版文字）、引用校验（声明解析出的模型与 `models` 组的对应），以及载入成功或失败的位置与原因。
- **S-07 查看器渲染：** 在 `render/` 中新增 DOM-free 的查看渲染，复用[绘制端口](../../../../src/render/scene/render-surface.ts)、[WebGL 表面](../../../../src/render/webgl/webgl-surface.ts)与 [4:3 视口布局](../../../../src/render/viewport/viewport-layout.ts)。
  - **显示内容：** 模型的三个部件列表、效果形状、索引图像、调色板、布局合成与字库字形表。
  - **数据入口：** 只经 `content/` 的读取器与消费函数取数据，不另建解码路径。
  - **绘制时机：** 只在选择、交互、尺寸变化与上下文恢复时绘制，没有游戏循环。
  - **GPU 资源：** 所有权明确，纹理按 image Asset ID 共享。
- **S-08 查看器界面与试听：**
  - React 提供条目列表、选择、视图控件与键盘操作；只提交查看意图，不绘制画面。
  - 试听经 P2-08 的控制器：在可信点击中调用 `unlock()`，并记下一次待播放意图；控制器进入 `running` 后播放一次。停止、页面隐藏、离开查看器、替换资源包与释放都会取消这一意图。控制器本身不排队（P2-08）。离开查看器时释放。
  - 资源包不完整时，只列出已完整验证的组，并显示不完整的说明。
- **S-09 呈现约定：** 在渲染适配中集中实现并记录以下选择，各项标注依据与置信度，最终由 P2-12 用原版截图判定：
  - 坐标轴与手性的换算、UV 原点与正面绕序；
  - 背面剔除与纹理过滤；
  - 光照模式；
  - 效果颜色的解释、颜色空间与量化。
- **S-10 效果贴图坐标（P2-06 交接）：**
  - **研究：** 有界地只读研究 `0x82ae8` 及其调用者，确定导弹贴图元素的旋转映射与带贴图碎片的平面映射如何得到贴图坐标。
  - **达到高概率后：**
    - 以效果 payload 的新 schema 导入所需参数；
    - `content/effects` 的展开输出贴图坐标；
    - 递增模型转换器组件；
    - 本地核对新字段；
    - 查看器据此贴图。
  - **达不到时：** 相应验收保持 blocked；查看器对这些面只用颜色，并标明映射未确认。
- **S-11 生产构建前提：**
  - 生产预览中，页面经平台适配载入真实的 Worker chunk；Worker chunk 是 `/assets/` 下带内容哈希的同源脚本。
  - 本地生产预览（`vite preview`）发送拟定的严格 CSP 响应头；全部 `production` 项目用例与用户的真实数据核对都在该策略下运行，没有违规。
  - Worker 脚本缺失或被回退为 HTML 时，导入安全失败并释放 Worker。
  - 生产构建不含测试入口与合成目录。

  SWA 配置文件与真实响应头归 P5，本任务只把验证过的策略与回退要求写入工程约定。
- **S-12 生命周期与所有权：**
  - 对象：作业与 Worker、资源包与 payload、GPU 资源、音频上下文、订阅与监听。
  - 路径：返回菜单、失败、重入、卸载、StrictMode 与 Fast Refresh。所有路径都有单一所有者与释放时机。
  - 缓存的列出、提交与恢复都是异步的，其结果按[操作与代际](#操作与代际)只更新仍然有效的持有者。
  - 音频上下文是否已关闭，以应用包装的音频能力观察到的 `close()` 结果为准，不以控制器的 `disposed` 快照代替；关闭确认前不创建新的音频上下文。
  - 不使用 Blob URL、`HTMLImageElement` 或 2D Canvas 显示原版图像。
  - 导入与查看不影响合成演示会话。
- **S-13 文案与文档：**
  - **页面文案：** 更新权利与隐私文案、菜单与导入页说明。
  - **项目文档：** 更新 [README](../../../../README.md)、[源码结构](../../../engineering/source-structure.md)与[工程约定](../../../engineering/README.md)，新增本地导入指南，并补充阶段索引的导航链接。
  - **原版文档：** 研究结论写入 [executable](../../../original/formats/executable.md) 与 [U-027](../../../original/unknowns.md)。

### 不包含

- **联合验证与原版对照（P2-12）：**
  - 主页面与 Worker 的网络审计；
  - 联合 E2E 的重复次数与阈值；
  - 模型、贴图、布局、字体、音效与任务字段的原版本地保真对照与差异结论。
- **退出评审（P2-13）：** P2 的退出判定与 P3 交接。
- **玩法（P3）：**
  - 飞行与任务运行、Runtime 事件、Session；
  - Classic 飞行画面与 HUD 数据绑定；
  - 光照与明暗级（U-028）、效果的模式字；
  - 碰撞，以及从包围盒推断的任何规则。
- **缓存管理与发布（P5）：**
  - BIN/CUE、ISO、ZIP、目录选择与拖放等其他导入入口；
  - 缓存迁移、旧版本清理、缓存管理界面、按键删除；
  - 持久存储申请（`navigator.storage.persist()`）；
  - `public/staticwebapp.config.json`、真实 CSP 响应头、CI 与 SWA 部署；
  - 面向发布的玩家错误文案打磨；
  - Firefox、Safari 与移动设备。
- **完整查看器与导出：**
  - 完整资源查看器（P4）；
  - 通用编辑、全量目录与切片之外的资源；
  - 资源导出、上传或分享，以及诊断导出功能。
- **其他：**
  - 显示原版文字（任务名、名称池、消息与简报）；
  - 音量设置与设置持久化；
  - 宽屏与“原版像素”模式；
  - 新依赖；
  - 改变 P2-01 至 P2-10 的错误码、协议消息形状、切片定义或缓存记录格式。

### 涉及模块

| 模块 | 责任与影响 |
|---|---|
| [src/main.tsx](../../../../src/main.tsx)、[App.tsx](../../../../src/app/App.tsx)、[app-flow.ts](../../../../src/app/flow/app-flow.ts) | 入口传入生产端口；流转增加查看器画面与相应焦点目标 |
| `src/app/import/`（已有）、`src/app/resources/`（计划新增） | 导入页面的持有者 hook；应用级资源持有者：全包判定、缓存编排、任务载入、状态派生。纯逻辑可在 Node 中测试 |
| `src/workers/`（已有） | 计划新增主线程可用的生产包配置：包预算、`ConverterVersion`、来源指纹。不导入 `original-data`，一致性由 Node 测试证明 |
| `src/render/viewer/`（计划新增） | DOM-free 的查看渲染：查看项到 Three.js 对象的映射、呈现约定、纹理共享与释放、按需绘制、状态与诊断 |
| [browser-webgl-surface.ts](../../../../src/render/webgl/browser-webgl-surface.ts) | 画布的无障碍名称改由调用方提供；其余行为不变 |
| `src/ui/pages/`、`src/ui/viewer/`（计划新增） | 导入页面替换占位页；查看器页面、条目列表、控件与状态文字 |
| [src/platform/storage/](../../../../src/platform/storage/)、[src/platform/audio/](../../../../src/platform/audio/) | 按现有契约使用，预计不改 |
| `src/content/effects/`、`src/original-data/conversion/` 的效果步骤 | 只在 S-10 达到高概率时修改：效果 payload 新 schema、展开输出贴图坐标、模型转换器组件递增 |
| [vite.config.ts](../../../../vite.config.ts) | 本地 `vite preview` 发送拟定的 CSP 响应头；开发服务器与构建输出不变 |
| `e2e/` | 新增导入、查看、缓存恢复、生命周期与生产预览用例；更新 [compliance-text.spec.ts](../../../../e2e/compliance-text.spec.ts) 中关于占位页的断言 |
| 文档 | README、源码结构、工程约定、新的本地导入指南、阶段索引导航；executable 与 U-027（S-10） |

## 当前实现与依据

- **执行前提：**
  - P2-06 至 P2-10 都已完成，见 [STATUS](../../../STATUS.md)。
  - 作业阶段为 `identify-source` → `convert-graphics` → `convert-logic` → `convert-audio` → `convert-models`，协议版本 5，见 [import-protocol.ts](../../../../src/workers/import-protocol.ts)。
  - 作业按 `RESOURCE_GROUPS` 顺序发送 `logic`、`models`、`cockpit-hud-map`、`audio` 四组，共用一个包身份，见 [import-job.ts](../../../../src/workers/import-job.ts)。
  - 生产 `ConverterVersion` 为 `osr-import.graphics-2.logic-1.audio-1.models-1`（[converter-version.ts](../../../../src/original-data/conversion/converter-version.ts)）。
- **页面与流转：**
  - [app-flow.ts](../../../../src/app/flow/app-flow.ts) 只有 `menu`、`import`、`demo` 三个画面，`demo` 由清理失败锁存阻断（P1-08）。
  - [App.tsx](../../../../src/app/App.tsx) 直接创建合成演示的生命周期，没有注入点；[main.tsx](../../../../src/main.tsx) 在 StrictMode 下挂载。
  - 权利文案由 [compliance-text.spec.ts](../../../../e2e/compliance-text.spec.ts) 断言，该用例目前还断言页面上没有文件输入。
- **作业：**
  - `createImportJobOwner` 至多一个活动作业，每个作业新建 Worker。取消、释放与终态都会立即终止 Worker。
  - 快照不含 payload、文件名或宿主错误文本；`finished` 只表示作业正常结束；`takeGroups()` 在 `finished` 后交出一次完整组的所有权。
  - 启动规则是 1–4 个文件，名称至多 255 个 UTF-16 单元（`IMPORT_FILE_LIMITS`），违反时 `start` 返回 `invalid-files`。
  - 文件组规则见 [clone-cd.ts](../../../../src/original-data/disc/clone-cd.ts)：一个 `.ccd` 与一个同名 `.img`，加上可选的 `.sub` 与 `.cue`，否则报 `unsupported-file-set`。
  - [browser-import-worker.ts](../../../../src/platform/workers/browser-import-worker.ts) 用 `new URL('../../workers/import-worker.ts', import.meta.url)` 创建模块 Worker，测试可以替换入口。
- **生产识别与合成数据：**
  - P2-03 的生产白名单按 SHA-256 匹配原版文件（[source-catalog.ts](../../../../src/original-data/source/source-catalog.ts)），合成光盘在生产作业中只会得到 `source`/`unsupported-version`。
  - 导入的成功路径只能经测试入口（[import-worker.test-support.ts](../../../../src/workers/import-worker.test-support.ts) 与合成目录）在开发服务器上验证；合成目录的来源指纹不同于生产指纹。生产预览中的导入只能得到识别失败；恢复与查看可以经测试预置的合成缓存验证（技术决定 7）。
  - 来源指纹由目录确定性导出（`sourceFingerprint`），所以生产来源指纹是常量。
- **缓存：**
  - [browser-resource-cache.ts](../../../../src/platform/storage/browser-resource-cache.ts) 提供 `measure`、`checkCapacity`、`commit(inputs, limits, { signal })`、`list`、`restore(key, limits)` 与 `close`。
  - 提交与恢复都按调用方的限值核算清单的 `assets`、`dependencyEdges`、`payloadBytes`，再执行 `validatePackage`，并且只接受完整包；失败返回[封闭错误码](../10/spec.md#错误码)。
  - 缓存不证明来源指纹来自产品入口，这由装配方负责。
- **预算：**
  - 已批准的份额：图形 `PRODUCTION_GRAPHICS_SHARE`、逻辑 `PRODUCTION_LOGIC_SHARE`、模型与效果 `PRODUCTION_MODEL_SHARE`、音频 `AUDIO_BUDGET_LIMITS`。
  - 四者之和为 202 个 Asset、384 条依赖边、11,943,936 字节 payload；其余维度依次相加，`sourceReadBytes` 为 0。
  - 作业中，图形、逻辑与模型三步共用“输入总字节加三步份额”的限值，音频按自身限值从零核算。
  - 本地基准上，P2-06 的核对得到作业读取约 21.2 MB，远低于输入总字节；payload 约 1.5 MB。
- **内容消费：**
  - **图像：** [expandImage](../../../../src/content/graphics/expand-image.ts) 是唯一的调色板展开，输出逐行（首行在前）的 RGBA。
  - **布局：** [composeLayout](../../../../src/content/graphics/compose-layout.ts) 是唯一的布局合成。
  - **字库：** [glyph-lookup.ts](../../../../src/content/graphics/glyph-lookup.ts) 提供字符查找。
  - **模型：** [model-parts.ts](../../../../src/content/models/model-parts.ts) 的 `modelPartItems` 与 `expandModelTextures` 给出部件几何与材质，材质为颜色，或颜色加贴图加 `wrap: 'repeat'`。
  - **效果：** [expand-effects.ts](../../../../src/content/effects/expand-effects.ts) 给出每个形状的位置、多边形面表、颜色与贴图引用，导弹元素另带原样的旋转参数；不输出贴图坐标。
  - **音效：** [sound-payload.ts](../../../../src/content/sound-payload.ts) 是采样 payload 的读取器。
- **渲染：**
  - [webgl-surface.ts](../../../../src/render/webgl/webgl-surface.ts) 与 [browser-webgl-surface.ts](../../../../src/render/webgl/browser-webgl-surface.ts) 只创建 WebGL 2，不回退。画布的无障碍名称固定为合成演示的文字。
  - [synthetic-renderer.ts](../../../../src/render/synthetic/synthetic-renderer.ts) 与 [synthetic-demo-owner.ts](../../../../src/app/composition/synthetic-demo-owner.ts) 是可参照的所有权与释放模式。依赖中已有 Three.js 0.186。
- **音频：** `createAudioController` 提供 `unlock`、`load`、`play`、`stop`、`stopAll`、快照、订阅与 `dispose`，同时发声上限为 8；浏览器能力见 [browser-audio-controller.ts](../../../../src/platform/audio/browser-audio-controller.ts)。
  - `unlock()` 可能先返回 `locked`，之后经 `statechange` 进入 `running`；`play()` 在此之前被拒绝，控制器不排队，见 [audio-playback.spec.ts](../../../../e2e/audio-playback.spec.ts)。
  - `dispose()` 返回 `void`，上下文 `close()` 的拒绝不向调用方报告。所以“已关闭”须由应用包装的能力观察。
- **Core：** `loadMission({ mission, craftTypes, wingmanRoster })` 重新读取三个逻辑内容，产出冻结的 `MissionSetup`。单个 payload 的错误为 `ContentContractError`，跨 Asset 的前提为 `CoreInputError`。逻辑 payload 的 `role` 为 `mission`、`craft-types` 或 `wingman-roster`，见 [logic-check.ts](../../../../tools/logic-check.ts)。
- **模块边界：**
  - [eslint.config.js](../../../../eslint.config.js) 禁止 `render/`、`ui/`、`app/` 导入 `original-data`；生产模块不得依赖测试支持（[engineering-boundaries.test.ts](../../../../tools/engineering-boundaries.test.ts)）。
  - `workers/import-protocol.ts` 不依赖 `original-data`，所以主线程的生产模块图目前不含它。
- **浏览器测试设施：**
  - [browser-probes.ts](../../../../e2e/support/browser-probes.ts) 记录监听、观察器、画布、帧请求与 Worker 的构造和终止。
  - [image-observations.ts](../../../../e2e/support/image-observations.ts) 读取画面像素；[audio-playback.ts](../../../../e2e/support/audio-playback.ts) 与 [resource-cache.ts](../../../../e2e/support/resource-cache.ts) 是音频与缓存的探针。
  - Playwright 有 `development`、`production` 与 `development-headed` 三个项目（[playwright.config.ts](../../../../playwright.config.ts)），Worker、缓存与音频用例目前只在开发项目运行。
  - P1-08 以“可还原的 Fast Refresh 编辑”验证替换与释放，见 [P1-08 AC-12](../../p1/08/spec.md)。
- **原版依据：**
  - 渲染器高概率为 RenderMorphics Reality Lab（[executable](../../../original/formats/executable.md) §2）。
  - 网格的正面绕序与光照未确认（[mesh](../../../original/formats/mesh.md)、U-028）。
  - 效果的贴图映射经 `0x82ae8`，语义未追踪；带贴图碎片的平面映射依赖包围盒、`0x1718ea` 处的双精度数与该调用的立即数，P2-06 未导入。见 [executable 的效果表现来源](../../../original/formats/executable.md#effect-presentation-sources)与 U-027。
- **部署：**
  - 仓库没有 `public/` 与 `staticwebapp.config.json`，也没有 CSP。
  - [总计划 §10.3](../../master-plan.md#103-站点配置与运维) 要求 SPA 回退不吞掉缺失的 Worker 请求，CSP 按实际 Worker、blob 与音频使用收紧；配置与实测归 P5（[ADR-0012](../../../decisions/ADR-0012-local-p1-defer-ci-deployment.md)）。

## 行为与边界

| 场景或状态转换 | 预期结果 | 拒绝或失败时的反馈 |
|---|---|---|
| 首次载入与每次回到菜单 | 菜单先显示“正在检查浏览器存储”，随后按 `list()` 的结果显示：没有原版数据；有与预期包配置一致的缓存（尚未校验）；或存储不可用。只读元数据，不读 payload。持有的资源包状态为“已保存”但列表中已没有该键时，改为“仅在内存中”（`not-found`），提供重新保存；内存中的资源与查看不受影响 | 存储失败按 code 显示原因，不阻止导入或演示 |
| 选择不符合启动规则的文件（0 个、5 个以上、名称过长） | `start` 返回 `invalid-files`，不创建 Worker；持有的资源包不变 | 说明需要同名的 `.ccd` 与 `.img`，可选 `.sub`、`.cue`，至多 4 个文件 |
| 开始导入 | 开始按钮禁用；显示阶段名与已读取 MiB（不显示百分比，P2-04 技术决定 7）；取消可用 | 空间检查结果为 `insufficient` 时，先提示预计需要的空间与可用空间，用户仍可继续（P2-10 技术决定 6） |
| 来源已识别 | 显示版本标识；转换继续 | — |
| 用户取消、返回菜单、页面卸载、StrictMode 重跑或 Fast Refresh 时作业仍在进行 | Worker 立即终止，作业为 `cancelled` 或被释放；持有的资源包与缓存不变 | 取消时显示“已取消”，没有部分结果 |
| 作业失败（disc、source、content、import 各层） | 持有的资源包不变；Worker 已终止 | 按[失败反馈](#失败反馈)显示类别文字，以及 layer、code、结构位置与限值；不含文件名、路径或字节 |
| 作业结束，四组都完整，全包判定为 `complete` | 持有者取走四组，替换原资源包；状态为“完整资源可查看”；开始提交缓存并尝试载入任务 | — |
| 作业结束，有组不完整或缺失，或全包判定为 `incomplete` | 持有者取走已完整的组，替换原资源包；状态为“部分转换”，列出每组状态与诊断 code；不提交缓存；查看器只列出完整的组；`logic` 组完整时才尝试载入任务 | 说明哪些组未完整、不能缓存，并提示这不是可用的资源包 |
| 缓存提交 | 成功时状态为“已保存在本浏览器”。提交由应用级持有者负责，离开导入页面不会中断 | 失败时为“仅在内存中”，显示 code 与原因（例如配额不足、存储不可用），提供重试；任何失败都不改动已有的有效缓存（P2-10） |
| 菜单中打开缓存（未持有资源包，且有一致的缓存条目） | 恢复并重新校验，成功后作为资源包持有，状态为“完整资源可查看”与“已保存在本浏览器”，再尝试载入任务 | `not-found`、`cache-corrupt`、`cache-incompatible`、`over-budget`、读取失败等按 code 显示，提示重新导入；不显示任何资源 |
| 已持有资源包 | 菜单提供“查看资源”，不再提供打开缓存 | — |
| 打开查看器 | 列出各组的条目；默认不选中；画面为空的 4:3 区域。选中后显示该项 | 内容读取或展开失败时，只把该项标为失败，显示 code 与位置；其他条目仍可使用 |
| 查看器交互（旋转、缩放、复位、切换部件列表、光照模式、旋转映射序号） | 改变画面的交互恰好绘制一次，不改变画面的交互（例如已在初始视角时复位）不绘制；空闲时不请求动画帧。键盘操作见[查看器操作](#查看器操作) | — |
| WebGL 2 不可用 | 列表、任务诊断与试听仍可用 | 显示画面不可用的原因；不回退到 2D Canvas |
| WebGL 上下文丢失与恢复 | 丢失时显示状态；恢复后重画当前项，画面与丢失前相同，GPU 资源不重复 | — |
| 试听 | 可信点击解锁；控制器进入 `running` 后播放这次点击选择的声音一次；可以停止单个或全部声音 | 音频不可用或失败时显示原因；其他功能不受影响。解锁前取消的意图不会在之后播放 |
| 从查看器返回菜单 | 释放 GPU 资源与画布、停止并释放音频；资源包保留 | 释放失败（含音频上下文的 `close()` 被拒绝）时，按 P1-08 的规则锁存，阻止再次创建查看器直到整页重载；导入与演示仍可用 |
| 新的作业结束或恢复成功 | 新结果替换原资源包，替换前先释放引用旧内容的查看器资源 | 失败或取消的作业、失败的恢复都不替换 |
| P1 合成演示 | 在导入前后都可启动；不显示也不使用导入的资源；文案仍标明为合成演示 | 演示的锁存规则不变 |

### 状态阶梯

页面只显示下表中经实际验证的状态。“完成转换”不等于“资源可用”，“已识别”也不等于“可以转换”。任何画面都不出现“可玩”“开始任务”或同义的标记。

| 状态 | 成立条件 |
|---|---|
| 来源已识别 | 当前作业的快照带有 `identity`（在 `running` 与 `finished` 中） |
| 部分转换 | 作业为 `finished`，且有组不完整或缺失，或全包判定为 `incomplete` |
| 完整资源可查看 | 持有的资源包经 `validatePackage(CLASSIC_P2_SLICE, groups)` 判定为 `complete` |
| 已保存在本浏览器 | 对持有资源包的同一身份，`commit` 返回 `committed`，或 `restore` 返回 `restored`；并且之后的列出中该键仍然存在 |
| 仅在内存中 | 资源包完整，但提交尚未成功（正在提交、失败或存储不可用）；提交中另显示“正在保存” |
| 任务可载入 Core | 对持有资源包的 `logic` 组，`loadMission` 成功 |
| 任务不可载入 | `loadMission` 抛出 `CoreInputError` 或 `ContentContractError`；显示类别、路径与原因 |

## 数据模型与契约

本任务在 `app/`、`render/` 与 `ui/` 中新增类型，不改变 P2-01 至 P2-10 的公开数据形状。S-10 达到高概率时，效果 payload 与模型转换器组件按[效果贴图坐标](#效果贴图坐标)变化。

| 数据/字段 | 类型、单位与约束 | 权威所有者 | 输入/输出或序列化边界 |
|---|---|---|---|
| 应用端口（计划新增） | 作业端口工厂、缓存（P2-10 `ResourceCache` 形状）、音频能力（P2-08 `AudioCapability`）、WebGL 表面工厂、预期包配置、`reportError` | `app/` | 生产实现与生产包配置由 `main.tsx` 传入；测试入口注入合成实现与对应的包配置；生产模块图不含测试支持 |
| 资源包（计划新增） | `origin`（`import` 或 `cache`）；完整组列表，元素为 `{ group, manifest, payloads, sources }`；全包判定结果（P2-01 `PackageCompletenessResult`）；缓存状态；任务载入结果。冻结容器，payload 的所有权归持有者；每次替换得到新的代际 | `app/resources/` | 由应用外壳实例持有，不放入模块级全局变量；不发送到任何网络通道 |
| 缓存状态（计划新增） | `checking`、`unavailable`（附 P2-10 code）、`not-saved`（附 code）、`saving`、`saved` | `app/resources/` | 由 `list`、`commit`、`restore` 的结果派生；不由作业结束推断 |
| 任务载入结果（计划新增） | `not-attempted`；`loaded`，附结构摘要；`failed`，附 `{ kind: 'core-input' \| 'content', path, reason }` | `app/resources/` | 结构摘要只含计数、Asset ID、阵营枚举、`campaign`、地图轴向与坐标单位标注、玩家声明序号，不含名称池、消息或任何原版文字 |
| 生产包配置（计划新增） | `converterVersion`、`sourceFingerprint`、`limits`（完整的 P2-01 `BudgetRecord`） | `workers/` | 主线程只读常量；Node 测试证明它们分别等于 `PRODUCTION_CONVERTER_VERSION`、`sourceFingerprint(PRODUCTION_CATALOG)` 与四份已批准份额之和 |
| 查看项（计划新增） | 判别联合：模型（Asset ID、部件列表序号）、效果形状（Asset ID、形状路径、导弹旋转映射序号）、图像、调色板、布局、字库、音效、任务 | `ui/` 提交，`app/` 解析 | 只含 Asset ID 与序号，不含 payload；React 只提交意图 |
| 查看渲染状态（计划新增） | `ready`、`context-lost`、`failed`、`unavailable`、`disposed`，后两种失败附原始错误；诊断含绘制次数与 GPU 计数 | `render/viewer/` | 供 React 与测试读取；不含 Three.js 对象 |

### 包预算与生产身份

- **包预算：** 等于 `PRODUCTION_GRAPHICS_SHARE`、`PRODUCTION_LOGIC_SHARE`、`PRODUCTION_MODEL_SHARE` 与 `AUDIO_BUDGET_LIMITS` 的逐维之和，按 P2-01 `addBudgets` 计算。
  - 提交与恢复都使用它；提交前的空间检查以其 `payloadBytes` 加上 `measure` 的元数据估计为需求。
  - 任一转换任务修改份额时，这个和随之改变，由 Node 测试守护。
- **作业级读取上限：** 维持 P2-02 的默认值（输入总字节），不另设上限。
  - 读取按需进行，并受单条目上限约束；本地基准读取量约为输入的八分之一。
  - 各步骤的转换用量已分别受份额约束，因此 Worker 暂存的组合上限就是包预算。
  - P2-08 留下的“组合上限”由此确定，本任务不收紧任何已批准的值。
- **生产身份：** 生产包配置给出当前 `ConverterVersion` 与唯一的生产来源指纹。应用按注入的预期包配置筛选：恢复时只选择键为 `original-import`、指纹与 `ConverterVersion` 都等于预期值的条目；其他条目不提供恢复，也不清理（P5）。
  - 生产入口固定传生产包配置；测试入口传与合成目录一致的配置，筛选算法相同。
  - 不存在用 URL 参数或全局开关绕过筛选的途径。

### 缓存编排

- **列出：** 应用外壳创建后调用 `list()`，此后每次回到菜单再调用一次。结果只用于菜单状态与保存状态的核对，不读取 payload。
- **提交：**
  - 只在全包判定为 `complete`，且资源包来自本次导入时提交。资源包来自缓存时不重复提交。
  - 提交在主线程运行，由应用级持有者负责，带 `AbortSignal`。新的资源包替换旧的时，尽力中止旧的提交，结果服从 P2-10 的事务终态：写事务开始前或仍可中止时为 `cancelled`，已进入提交阶段则为 `committed`。无论哪种结果，都不更新新资源包的状态。
  - 页面卸载造成的中断按 P2-10 处理。
- **恢复：**
  - 只在用户选择“打开已缓存的资源”时进行，在主线程运行。
  - 恢复成功后，持有者用恢复结果的身份核对预期包配置，不一致时视为 `cache-incompatible`，不持有。
- **重试与重新保存：** 对同一资源包再次调用 `commit`，同键替换是原子的（P2-10）。
- **重新导入提示：** 恢复返回 `not-found` 时，说明资源可能已被浏览器清除，需要重新导入；返回 `cache-corrupt` 或 `cache-incompatible` 时，说明缓存不能使用，重新导入会原子替换它。

### 操作与代际

- **代际：** 资源持有者每次替换资源包（作业结束、恢复成功）都递增代际。提交、恢复与列出的结果都带发起时的代际与持有者实例；只有代际仍为当前值、持有者尚未释放时才更新状态，否则直接丢弃。迟到的恢复结果不会被持有，迟到的提交结果不改变当前资源包的缓存状态。
- **列出：** 只采用最近一次发起的 `list()` 结果。
- **互斥：**
  - 同一时刻至多一个恢复，进行中“打开已缓存的资源”禁用；
  - 同一资源包至多一个提交，保存中“重新保存”禁用。
  - 恢复进行中仍可进入导入页面；两者的先后完成由代际规则裁决。
- **释放：** 应用外壳卸载（含 StrictMode 重跑与 Fast Refresh）时，持有者被释放并中止进行中的提交；之后到达的任何结果都不更新状态。

### 查看项与渲染

- **数据入口：** 渲染只经 `content/` 的读取器与消费函数取数据。
  - 模型：`readModelPayload`、`modelPartItems`、`expandModelTextures`；
  - 效果：`readEffectPayload` 与展开函数；
  - 图像：`expandImage`；布局：`composeLayout`；字库：字库读取器与字符查找。
- **模型：**
  - 默认显示第 0 部件列表，可切换为第 1 或第 2 列表，并标注各列表的置信度（U-027：第 1 列表为碎片部件，已确认；第 2 列表的用途未确认）。
  - 几何按模型分别创建；纹理按 image Asset ID 共享，最后一个引用它的显示项释放后再释放。
  - 视图支持绕两轴旋转、缩放与复位，相机按模型包围球取景。包围盒只用于取景，不产生任何规则。
- **效果：**
  - 按记录、导弹类型与碎片形状分别列出。多边形面以第一个角为中心扇形三角化：每个形状的三角形数等于各面“角数 − 2”之和；一个 payload 全部展开形状的三角形总数等于 `effectExpansionSize(payload).triangles`，导弹的附加元素也计入。
  - 导弹元素可选择 32 个旋转映射中的一个（S-10 达到高概率后才贴图）。
- **图像与调色板：**
  - 图像按整数倍放大，居中显示在 4:3 区域中；透明像素以中性棋盘格背景显示。
  - 调色板显示为每行 16 个色块的网格。
- **布局：** 显示 `composeLayout` 的结果，覆盖整个 4:3 区域，透明处同样显示棋盘格背景。
- **字库：** 按字形序号把全部字形排成网格，并单独列出字符映射覆盖的代码数。字形以白色显示在黑底上；HUD 的实际颜色由布局或运行时决定，查看器不推断。
- **任务：** 只在 React 中以文字显示，不使用画面。
- **按需绘制：** 只在选中项变化、交互、尺寸或像素比变化、上下文恢复时同步绘制一次。查看器打开后不运行循环。

### 查看器操作

查看器操作是本项目的诊断界面，不是原版键位。

- **焦点：** 键盘操作只在画面区域获得焦点时生效。画面区域可以用 Tab 到达，有可见的焦点指示，有无障碍名称（含当前项的 Asset ID）。焦点在列表、按钮或其他控件上时，按键不影响画面；监听只注册在画面元素上，离开查看器时撤销。
- **按键：**
  - ArrowLeft/ArrowRight 绕竖直轴、ArrowUp/ArrowDown 绕水平轴旋转，每次 15°；
  - `+`（或 `=`）与 `-` 缩放，每次 1.25 倍，限制在初始取景的 1/8 至 8 倍；
  - `0` 复位。

  同样的操作也有按钮。
- **布局：** 画面按 [viewport-layout.ts](../../../../src/render/viewport/viewport-layout.ts) 的 4:3 规则缩放、居中与留黑边。窗口尺寸或设备像素比变化后重画一次，画面位置与 `computeViewportLayout` 的结果一致。

### 呈现约定

以下选择集中在 `render/viewer/` 的一处实现，写入[源码结构](../../../engineering/source-structure.md)并标注置信度。P2-12 用原版截图判定；判定有误时只改这一处，不重新导入，也不改 payload schema（P2-06 风险“坐标约定误判”）。

| 项 | 初始选择 | 依据与置信度 |
|---|---|---|
| 坐标轴与手性 | 源数据按左手系、y 向上解释，换算到 Three.js 时把 z 取反 | 未确认：只有“渲染器高概率为 Reality Lab”这一间接线索，不能据此推出模型数据的轴向与手性。这是可逆的查看器初始约定，需要直接研究或本地截图对照后才能提升置信度 |
| 正面绕序与背面剔除 | 查看器双面渲染，不剔除 | 绕序未确认（mesh）。双面渲染不依赖这一选择，轮廓仍可对照 |
| UV 原点 | v = 0 对应 `expandImage` 输出的首行，不翻转 | 未确认：后来的 Direct3D 系列约定不能证明这条 DOS 渲染路径的原点。这是可逆的初始约定，P2-12 用截图判定 |
| 纹理过滤与环绕 | 放大与缩小都用最近邻，不生成 mipmap；模型贴图按材质的 `repeat` 环绕 | 原版软件渲染的采样方式未确认；最近邻不引入原版没有的颜色 |
| 光照 | 默认不受光照，直接显示部件颜色或贴图纹素；可切换为中性方向光，并标明不是原版光照 | 原版光照与明暗级归 P3（U-028） |
| 效果颜色 | 三个浮点按 RGB 解释，截断到 [0, 1]；同时以数字显示原值。没有颜色的面（`colour` 为 `null`，例如导弹贴图元素）在没有可用贴图坐标时，用固定的中性诊断灰色，并标明不是原版颜色 | 取值范围与通道含义未确认（P2-06） |
| 颜色空间与量化 | 贴图字节、部件颜色字节与效果浮点颜色都按显示值使用，不做颜色空间转换，也不做 tone mapping；画面读回的字节等于源字节，浮点颜色按 round(clamp(v, 0, 1) × 255) 量化 | 项目选择：原版是 8 位调色板画面，查看器不引入额外的颜色变换；可以逐字节断言 |

### 效果贴图坐标

- **研究范围：** 只读分析 `0x82ae8`、它在导弹旋转映射（`0x44cd8`）与带贴图碎片（`0x3eab4`）处的调用，以及映射应用到顶点的代码。
  - 需要确定的内容：参数含义、贴图坐标的计算公式、计算时机（创建时还是每帧），以及导弹 32 个旋转与碎片平面映射的全部输入。
  - 结论只把地址、结构、公式与置信度写入 [executable](../../../original/formats/executable.md)，并更新 U-027；不提交反编译输出。
- **达到高概率或已确认时：**
  - **payload：** 效果 payload 递增 schema。新字段只承载研究确定的参数，不改变既有字段的语义；读取器只接受新 schema。
  - **转换：** 效果步骤从研究确定的 EXE 区域读取新参数，校验规则与既有效果数据一致。模型转换器组件递增（例如 `models-2`），生产 `ConverterVersion` 随之改变，旧版本的缓存因键不同而不会被恢复。
  - **展开：** `content/effects` 的展开按公式为导弹元素（每个旋转序号）与带贴图碎片输出贴图坐标，按 64 位浮点计算并舍入为 32 位；结果非有限时报 `invalid-effect-payload`。
  - **核对与显示：** 在本地基准上，新字段与独立读取逐项一致（与 P2-06/19 相同的方法）；查看器据此贴图。
- **结论依赖运行时状态时：** 例如映射随相机逐帧变化，就记录结论，查看器只显示静止姿态下按规则得到的坐标，并加以说明。
- **达不到高概率时：** 不改 payload，也不递增转换器；查看器对这些面只用颜色（没有颜色的面用中性诊断灰色），并显示“贴图映射未确认”。AC-18 保持 blocked，由用户决定后续安排。

### 失败反馈

文案按 layer 与 code 选择，固定为英文句子；未知 code 使用所在层的默认句，层也未知时使用全局默认句。每条失败都附“技术细节”：layer、code、结构位置与限值。不显示宿主错误文本、文件名或路径；页面不依赖 `reason` 文本分类。

| 来源 | 必须区分的类别 |
|---|---|
| 启动规则 | `invalid-files` |
| disc | 文件组不符（`unsupported-file-set`）；镜像布局或结构不受支持（`invalid-descriptor`、`unsupported-layout`、`image-size-mismatch`、`invalid-sector`、`invalid-volume`、`invalid-directory`、`directory-loop`、`invalid-path`、`path-not-found`、`wrong-entry-kind`、`invalid-range`）；超出限值或预算（`limit-exceeded`、`budget-exceeded`）；读取失败（`read-failed`） |
| source | 不是受支持的版本（`unsupported-version`、`path-not-covered`、`fingerprint-mismatch`、`alternatives-differ`）；原版数据未通过结构或转换校验（其余 code）；超出限值或预算 |
| content | 转换结果未通过内容校验 |
| import | Worker 无法启动（`worker-start-failed`）；Worker 意外停止（`worker-failed`）；内部错误或协议错误（`internal-error`、`protocol-error`、`invalid-result`、`invalid-request`） |
| 缓存 | P2-10 的 13 个 code 各有一句，其中 `quota-exceeded` 说明需要释放空间，`storage-unavailable` 说明资源只保存在当前页面中，`not-found` 提示重新导入 |
| 任务载入 | `CoreInputError` 与 `ContentContractError` 分别有一句 |

### 持久化与兼容

- **IndexedDB：** 只经 P2-10 的适配器访问，不改数据库名、版本或记录格式。
  - 缓存键为 `original-import`、来源指纹与生产 `ConverterVersion`。
  - 同键提交原子替换；旧 `ConverterVersion` 的条目保留不动，不恢复也不清理（P5）。
- **转换器版本递增：** S-10 若递增转换器组件，生产缓存键随之改变。本任务之前没有生产内容写入缓存，所以不需要迁移；开发与测试数据在隔离的浏览器 context 中。
- **其他存储：** 不使用 localStorage、Cache Storage 或 Service Worker；不申请持久存储。
- **恢复：** 恢复的数据只在完整重新校验后使用。损坏、版本不兼容或被清除时，只提示重新导入，不回退到部分内容。

## 技术决定

用户授权按最推荐的方案回答规划问题；以下决定据此采用，批准本 spec 时一并确认。

1. **查看器是独立画面，不覆盖在导入页面上：**
   - 导入页面的生命周期绑定作业，查看器的生命周期绑定 GPU 与音频，两者分开释放。
   - 资源包由应用级持有者保存，两个画面都只读取它。
   - 这沿用 P1-08 中“每个画面一个所有者”的模式。
2. **完整包自动提交，恢复由用户触发：**
   - P2-10 只允许完整包入库，自动提交使“已保存”与全包判定同步出现。
   - 恢复要对全部 payload 做哈希，并会替换内存中的内容；由用户触发，可以避免启动时的意外开销，也让“有缓存（未校验）”与“已恢复（已校验）”在界面上分开。
3. **提交与恢复在主线程运行：** 本地基准的 payload 约 1.5 MB，哈希开销小。缓存适配本来可以在 Worker 中运行，但放到 Worker 会增加一条跨线程的移交路径。P2-12 记录真实包的耗时；若实测阻塞明显，再按实测移入 Worker。
4. **部分结果可以查看，但不能缓存：**
   - P2-01 规定，不完整的结果供查看器诊断使用。
   - 查看器只列出已完整验证的组，并始终显示“不完整”的说明；不完整的包不提交，也不显示“完整资源可查看”。
5. **包预算取已批准份额之和，读取上限不变：** 理由见[包预算与生产身份](#包预算与生产身份)。这样不引入新的、缺乏依据的数值。
6. **主线程不导入 `original-data`：**
   - 生产包配置以常量放在 `workers/`，由 Node 测试证明与派生值一致。
   - 这样主线程包不会带入转换器与生产表，也保持现有的 lint 边界。
7. **测试入口注入合成实现：**
   - 生产白名单按 SHA-256 匹配，合成光盘无法在生产作业中成功，所以导入的成功路径在开发服务器的测试入口上验证：以生产 `App` 组件挂载，注入合成作业入口、与合成目录一致的预期包配置和其他端口。
   - 生产预览验证真实 Worker chunk、识别失败的反馈、Worker 脚本缺失时的失败，以及 CSP 下的完整查看路径：测试在自己的 context 中按 P2-10 记录格式预置一份身份取生产配置的合成包，经真实界面恢复后打开查看器并试听。这份合成包只存在于测试 context。
   - 生产代码不读取 URL 参数或全局开关来切换实现。
8. **呈现约定集中在一处，并显式标注：** P2-06 把坐标与 UV 原点的换算交给本任务，交由 P2-12 判定。
   - 双面渲染避免依赖未确认的绕序。
   - 不受光照的默认显示让颜色可以逐像素断言。
   - 最近邻过滤不引入新的颜色。
   - 这些选择都可以只改渲染适配来修正。
9. **效果贴图坐标的研究放在本任务：**
   - P2-06 技术决定 17 已把它安排在 P2-11 渲染之前，P2-12 也不承担新功能。
   - 研究有失败的可能，所以把它限定为 S-10 与 AC-17、AC-18，并给出达不到高概率时的界面表现；其余验收不受影响。
10. **任务摘要不显示原版文字：**
    - 结构摘要足以诊断载入与引用；不显示文字可以避免截图与证据含原版内容，也与 P2-09 不转换消息文字的范围一致。
    - 名称池只显示条目数。
11. **CSP 与 SWA 回退在本地生产预览中验证，不提交部署配置：**
    - 总计划把 `staticwebapp.config.json` 与安全响应头归 P5。
    - 本任务让本地 `vite preview` 发送拟定的严格策略：只允许同源的脚本、Worker 与样式，不含 `unsafe-inline`、`unsafe-eval`、`blob:`、`data:` 或通配来源。全部 `production` 项目用例与用户的真实数据核对都在该策略下运行。开发服务器依赖内联脚本，不施加该策略。
    - SWA 回退：本任务在生产预览中验证 Worker 脚本返回 404 或被替换为 HTML 时导入安全失败；“回退必须排除 `/assets/*`”与策略文本写入工程约定，作为 P5 的输入。真实 SWA 的回退与响应头实测归 P5，不能以本任务的结果代替。
12. **不新增依赖：** 交互用按钮与限定在画面元素上的键盘操作，不引入相机控件库；图像经 Three.js 的数据纹理上传，不经 Blob URL 或 `HTMLImageElement`。

## 验收标准

| ID | 可观察的通过条件 | 验证方法与所需证据 |
|---|---|---|
| AC-01 | **页面流转与独立演示：**<br>- 菜单可以进入导入页面、查看器（持有资源包时）与合成演示，返回菜单时焦点落在对应入口；<br>- 合成演示在导入前后都可启动，现有演示用例全部通过；<br>- 演示的画面、文案与 Session 中不出现导入的资源；<br>- 全站文字不含 “playable”“Play mission”“Start mission” 或同义标记 | Node：流转的表驱动测试。开发与生产项目 E2E：页面往返与文字断言；现有演示用例回归 |
| AC-02 | **文件选择与启动：**<br>- 0 个文件、5 个文件或名称超过 255 个单元时，`start` 返回 `invalid-files`，探针记录的 Worker 构造数不变，页面显示启动规则说明；<br>- 合法文件组启动后恰好构造 1 个 Worker，开始按钮禁用；<br>- 进度显示阶段名，已读取 MiB 不减少 | 开发项目 E2E：在测试中由代码生成合成文件，用文件选择控件提交；断言 Worker 探针与 DOM |
| AC-03 | **取消、返回与重入：** 对运行中的作业分别执行取消、返回菜单与重新进入，各 3 轮。每轮结束时：<br>- 构造的 Worker 都已终止；<br>- 页面监听与观察器的净登记回到基线；<br>- 持有的资源包与缓存条目不变；<br>- 再次进入后可以启动新作业 | 开发项目 E2E：Worker 探针、监听探针、缓存探针 |
| AC-04 | **失败反馈：**<br>- disc、source、content、import 四层各至少一个合成失败场景显示对应的类别文字，以及 layer、code 与位置；<br>- 未知 code 显示默认句；<br>- 页面文本与控制台不含合成文件名中的 `MARKER`；<br>- 持有的资源包不变 | Node：文案选择的表驱动测试，覆盖每层默认句。开发项目 E2E：用测试入口的失败场景（坏光盘、未覆盖文件、损坏网格、作业抛错、Worker 入口缺失） |
| AC-05 | **状态阶梯：** 由作业快照、取走的组、全包判定、提交与恢复结果、任务载入结果派生的状态，与[状态阶梯](#状态阶梯)的成立条件逐行一致。须覆盖：<br>- `finished` 但缺组或组不完整；<br>- 四组完整但全包 `incomplete`；<br>- 提交失败后重试成功；<br>- 恢复成功；<br>- 任务载入失败；<br>- 提交、恢复与列出的结果逆序完成，以及持有者释放后才到达（按[操作与代际](#操作与代际)丢弃）。<br>不存在只凭 `finished` 显示“完整资源可查看”或“已保存”的路径 | Node：资源持有者的表驱动真值表，用伪造的缓存、作业结果与可控 Promise |
| AC-06 | **持有与替换：**<br>- 新作业结束或恢复成功时替换资源包；作业失败或取消、恢复失败时不替换；<br>- 替换前，引用旧内容的查看器资源已释放；<br>- 替换时进行中的旧提交，无论在写事务开始前结束、被中止，还是已经提交成功，都不改变新资源包的缓存状态；<br>- 提交缓存、载入音效与创建纹理之后，持有的 payload 逐字节不变，也没有被 detach | Node：持有者与所有权测试，比较 payload 字节与 `ArrayBuffer` 状态；用可控的伪造缓存覆盖旧提交的三种终态 |
| AC-07 | **缓存提交：**<br>- 合成的完整包导入后，自动以包预算提交，状态为“已保存在本浏览器”，数据库中有该键的包记录；<br>- 部分结果从不调用 `commit`；<br>- 注入的缓存对 `quota-exceeded`、`storage-unavailable`、`write-failed`、`cancelled` 各返回一次时，状态为“仅在内存中”并显示 code；重试成功后为“已保存”；<br>- 空间检查为 `insufficient` 时先提示，用户可以继续 | Node：用伪造缓存覆盖每个失败 code 与重试。开发项目 E2E：真实 IndexedDB 的成功路径，以及注入失败缓存的一条路径；用缓存探针读取记录 |
| AC-08 | **刷新恢复与缓存失败：**<br>- 完整包提交后在同一 context 中刷新，菜单显示有缓存（未校验）；打开后恢复并校验，查看器的内容身份（manifest 身份）与提交前相同，任务载入成功；<br>- 测试同长度改写一条 payload 记录后打开，显示 `cache-corrupt` 与重新导入提示，不显示任何资源；<br>- 页面仍打开时删除数据库，回到菜单后保存状态变为“仅在内存中”（`not-found`），资源仍可查看并可重新保存；刷新后菜单显示没有原版数据；<br>- `ConverterVersion` 或指纹与预期包配置不同的条目不提供恢复 | 开发项目 E2E：刷新、改写与删除都在测试拥有的隔离 context 中进行。Node：条目选择规则 |
| AC-09 | **包预算、读取上限与主线程模块图：**<br>- 生产包配置的 `limits` 等于四份已批准份额经 `addBudgets` 之和；`converterVersion` 与 `sourceFingerprint` 等于生产值；<br>- 以生产包配置筛选时，合成目录身份的条目不提供恢复；<br>- 作业的读取限值仍为输入总字节；<br>- 超出包预算的合成包提交时得到 `over-budget`，状态为“仅在内存中”；<br>- 从 `src/main.tsx` 出发的生产模块图不含 `src/original-data/`，Worker 的模块图含 | Node 单元测试；工程边界测试检查模块图 |
| AC-10 | **任务载入诊断：**<br>- 合成的完整 `logic` 组载入成功，页面上的结构摘要与 Node 中对同一输入计算的摘要相同；<br>- 合成的失败输入（两个玩家声明、机型表缺少引用的机型、损坏的任务 payload）分别显示 `CoreInputError` 或 `ContentContractError` 的类别、路径与原因；<br>- 引用校验列出解析到模型的声明数，以及每个模型是否在 `models` 组中；<br>- 页面不含任务内容中的 `MARKER` 名称 | Node：摘要与引用校验的纯函数测试。开发项目 E2E：成功与一个失败场景 |
| AC-11 | **模型渲染：**<br>- Node：对合成模型，查看渲染产生的几何位置等于 payload 位置的 z 取反，索引与 UV 原样，材质双面、不受光照、最近邻；<br>- 两个模型引用同一贴图时只创建一个纹理；释放最后一个引用后，纹理计数回到 0；<br>- 浏览器：固定视角下，已知像素位置的颜色等于部件颜色或对应纹素，误差为 0；样本含非黑白的中间亮度颜色，用来发现颜色空间转换 | Node：用 Three.js 对象检查场景构建与颜色空间设置。开发项目 E2E：像素读回 |
| AC-12 | **图像、调色板、布局与字库：**<br>- Node：上传的纹理数据与 `expandImage`、`composeLayout` 的 RGBA 逐字节相同；调色板网格的每个色块等于对应条目；字形表每个字形单元的像素等于字形位；<br>- 浏览器：每类至少一个合成样本（含中间亮度颜色），在已知像素位置读回的颜色等于期望值，误差为 0 | Node 与开发项目 E2E |
| AC-13 | **效果渲染：**<br>- Node：三种效果的每个形状，三角形数等于各面“角数 − 2”之和；每个 payload 全部形状的三角形总数等于 `effectExpansionSize(payload).triangles`；位置等于展开结果的 z 取反；颜色按[呈现约定](#呈现约定)截断并量化；没有颜色的面使用中性诊断灰色；<br>- 浏览器：每种效果至少一个形状绘制后，已知像素位置的颜色符合期望 | Node 与开发项目 E2E |
| AC-14 | **按需绘制、GPU 与画面失败：**<br>- 查看器空闲 2 秒内请求的动画帧数为 0；改变画面的交互恰好绘制一次，不改变画面的交互不绘制（渲染诊断计数）；<br>- 在 10 个条目之间切换后，GPU 计数等于只显示当前条目时的计数；<br>- 返回菜单后画布已断开，支持 `WEBGL_lose_context` 时上下文已丢失；<br>- 模拟上下文丢失时显示状态，恢复后已知像素与丢失前相同；<br>- WebGL 2 不可用时显示原因，列表、任务诊断与试听仍可用 | 开发项目 E2E：帧与画布探针、渲染诊断、`WEBGL_lose_context`，以及现有 WebGL 关闭用例的方法 |
| AC-15 | **试听（浏览器）：**<br>- 首次可信点击之前没有运行中的音频上下文；点击后解锁，进入 `running` 后播放一次，快照中有发声；<br>- Node：解锁延迟进入 `running` 时只播放一次；进入 `running` 之前停止、隐藏、离开或替换资源包后，迟到的 `running` 不再播放；<br>- 停止后发声数为 0；<br>- 返回菜单后，包装能力观察到音频上下文的 `close()` 已完成；`close()` 被拒绝时查看器锁存，不创建新的音频上下文；<br>- 注入不可用的音频能力时显示原因，其他功能可用；<br>- 列出的音效与 `audio` 组的 Asset 一一对应 | Node：用伪造的音频能力覆盖延迟解锁、取消与 `close()` 拒绝。开发项目 E2E：复用 P2-08 的音频探针 |
| AC-16 | **StrictMode、Fast Refresh 与往返：**<br>- 开发模式首次挂载时，至多一个作业持有者、一个查看器画布与一个音频上下文；<br>- 保留应用外壳，在作业运行中与查看器打开时，各做至少 3 次可还原、确实重跑目标 effect 的 Fast Refresh 编辑；<br>- 每次稳定后，旧 Worker 已终止，旧画布已断开，旧音频上下文已关闭；<br>- 每次稳定后，新所有者与画布的身份不同于旧的，恰好一个已连接的画布；查看器重新显示当前项并能试听合成音效，导入页面能启动新作业；<br>- 整页重载、只更新 JSX 而不重跑 effect，或画面被清空，都不算替换成功；<br>- 菜单、导入、查看器与演示之间往返 3 轮后，监听、观察器、Worker、画布与帧请求都回到基线 | 开发项目 E2E，沿用 [P1-08 AC-12](../../p1/08/spec.md) 的可还原编辑方法与 [joint-resources.spec.ts](../../../../e2e/joint-resources.spec.ts) 的探针 |
| AC-17 | **效果贴图坐标研究：** [executable](../../../original/formats/executable.md) 记录：<br>- `0x82ae8` 的参数含义、坐标公式与计算时机；<br>- 导弹旋转映射与带贴图碎片平面映射的全部输入；<br>- 置信度与证据（地址、结构、计数）。<br>U-027 已更新。结论达到高概率或已确认时，本项通过；否则本项与 AC-18 都为 blocked，记录恢复条件 | 只读 Ghidra 分析，脚本与输出只在 `local/`；文档审阅 |
| AC-18 | **效果贴图坐标的表示与显示**（AC-17 通过后）：<br>- 新 schema 的效果 payload 编码后再读取逐项相等；截断、越界与非有限值报 `invalid-effect-payload`；旧 schema 报 `unsupported-payload-schema`；<br>- 展开输出的贴图坐标等于测试中按公式写成的计算式；<br>- 模型转换器组件与生产 `ConverterVersion` 已递增，相关测试同步；<br>- 本地基准上，新字段与独立读取逐项一致，差异为 0；<br>- 查看器中，带贴图的导弹元素与碎片在已知像素位置显示期望的纹素。<br>AC-17 不通过时：查看器对这些面只用颜色，没有颜色的导弹贴图元素用中性诊断灰色，并显示“贴图映射未确认”；该显示由 E2E 断言 | Node 表驱动测试，只用代码生成的任意参数；本地核对脚本只在 `local/`，证据只记计数与判定；开发项目 E2E |
| AC-19 | **生产预览：** 本地 `vite preview` 发送拟定的 CSP 响应头。在 `production` 项目中：<br>- 导入合成文件时，探针记录的 Worker 入口位于 `/assets/` 下、由 Vite 的 Worker 转换生成，脚本响应为 200 与 JavaScript 类型；识别失败显示 `source`/`unsupported-version` 的类别文字，Worker 已终止；<br>- 测试让 Worker 脚本返回 404，或返回 200 的 HTML（模拟 SPA 回退），导入都以 import 层失败结束，Worker 已终止，持有的资源包不变；<br>- 测试在自己的 context 中预置一份身份取生产配置的合成包，经菜单恢复后，查看器显示模型、图像与布局，并能试听；<br>- 上述全部路径与合成演示都没有 `securitypolicyviolation` 事件，也没有控制台错误；<br>- 生产构建产物不含测试入口与合成目录的模块 | 生产项目 E2E；构建产物检查。策略文本与回退要求写入工程约定 |
| AC-20 | **本地真实数据核对（Node）：** 在开发者机器上，用与 Worker 相同的作业模块处理本地基准镜像，把结果交给应用的资源持有者（缓存用伪造实现）：<br>- 识别出版本，四组都完整，全包 `complete`，任务可载入 Core；<br>- 查看渲染为玩家、敌机、基地模型，三种效果的全部形状，全部图像、调色板、两个布局与全部字库各构建一次场景，都没有错误；<br>- 记录全包校验的耗时 | 被忽略的 `local/` 脚本，不打开浏览器；agent 可以运行；证据只记状态、计数与耗时，不含原版内容 |
| AC-21 | **真实界面核对（用户）：** 用户在真实机器上，用本地生产预览（带拟定 CSP）与 Chrome，经真实界面导入自己的基准 CCD/IMG，确认：<br>- 识别出版本，状态依次出现“完整资源可查看”“已保存在本浏览器”“任务可载入 Core”；<br>- 刷新后从缓存恢复成功，任务再次可载入；<br>- 查看器中，玩家、敌机、基地模型，三种效果，每类图像、调色板、两个布局、全部字库都至少打开一项，没有错误；<br>- 开火、导弹、爆炸、Warp 四个角色都能听到，停止按钮有效，返回菜单后声音停止；<br>- 页面显示的作业、提交与恢复耗时 | 用户手工完成，不属于 agent 浏览器验证或自动 E2E（[工作流](../../../engineering/agent-workflow.md)要求 agent 浏览器验证只用合成数据）。记录日期、浏览器版本、各项结论与耗时；不录制声音，截图只留在 `local/` |
| AC-22 | **文案、隐私与文档：**<br>- 权利文案仍声明 MIT 不覆盖原版内容、不是官方产品、不授予原版权利；隐私文案说明原版数据只在本浏览器中读取、转换与保存，不上传；<br>- [compliance-text.spec.ts](../../../../e2e/compliance-text.spec.ts) 按新页面更新；<br>- 本任务新增的主线程模块不使用 `fetch`、`XMLHttpRequest`、`WebSocket`、`EventSource` 或 `sendBeacon`；<br>- README、源码结构、工程约定、新的本地导入指南、阶段索引与（S-10）executable、unknowns 已同步，并更新 `updated:` | E2E；源码检查或工程边界测试；链接与元数据检查 |
| AC-23 | **工程检查：** `pnpm check`、`pnpm test:e2e`（全部项目）与 `pnpm check:original` 通过；`package.json`、`pnpm-lock.yaml` 与 `.nvmrc` 没有变化 | 命令输出；依赖文件 diff |
| AC-24 | **查看器操作、焦点与布局：**<br>- 导入页面与查看器的全部控件可用 Tab 到达，可用 Enter 或 Space 触发，有可见的焦点指示；<br>- 画面区域获得焦点时，[查看器操作](#查看器操作)的每个按键按规定改变视角并恰好绘制一次；焦点在列表或按钮上时，同样的按键不改变画面；<br>- 离开查看器后，画面元素上的键盘监听已撤销；<br>- 在宽、窄两种窗口尺寸与两种设备像素比下，画面位置与 `computeViewportLayout` 的结果一致，已知像素的颜色不变 | 开发项目 E2E：可信键盘输入、监听探针、像素读回与布局断言 |

## 验证策略

- **单元与契约测试（Node）：**
  - 页面流转；
  - 资源持有者：状态阶梯、替换、缓存编排与失败 code、条目选择、所有权；
  - 生产包配置的一致性；
  - 任务摘要与引用校验；
  - 失败文案选择；
  - 查看渲染的场景构建、呈现约定、纹理共享与释放、按需绘制计数；
  - S-10 的 payload、展开与转换（若进行）。

  测试与源码同目录，只用代码生成的合成内容，不读取 `local/`。
- **Replay 与一致性：** 不适用。本任务不改变 Core、tick 或游戏状态；`loadMission` 的确定性已由 P2-09 覆盖，本任务只在页面上调用它。
- **浏览器验证：** 按 [browser-testing](../../../../.agents/skills/browser-testing/SKILL.md) 准备合成数据、隔离 context 并清理。
  - **开发项目：** 由开发服务器提供只在测试中打开的入口页，以生产 `App` 组件挂载并注入合成作业入口与按需替换的端口。
    - 覆盖 AC-02 至 AC-04、AC-07、AC-08、AC-10 至 AC-16、AC-18 与 AC-24；
    - 刷新恢复在同一个隔离 context 中进行；
    - Fast Refresh 编辑由测试还原。
  - **生产项目：** 覆盖 AC-01 与 AC-19，以及权利文案。全部用例都在本地预览发送的拟定 CSP 下运行；完整查看路径经测试预置的合成缓存进入。
  - 像素断言使用不受光照、最近邻与整数倍缩放的画面，误差为 0。
- **实机与原版对照：**
  - AC-20 是被忽略的本地 Node 脚本，agent 可以运行，不打开浏览器；
  - AC-21 由用户在真实机器上手工完成，包括真实界面导入、缓存恢复、查看与试听；agent 浏览器验证只用合成数据；
  - 原版画面与声音不离开 `local/`；原版截图的保真判定归 P2-12。
- **工程检查：**
  - 迭代：`pnpm exec vitest run src/app src/render src/ui src/workers tools/engineering-boundaries.test.ts`；S-10 另加 `src/content/effects src/original-data/conversion`；
  - 浏览器：`pnpm exec playwright test e2e/<新用例> --project=development` 与 `--project=production`；
  - 完成前：`pnpm check`、`pnpm test:e2e`、`pnpm check:original`；
  - 文档：链接与元数据检查。

## 风险与恢复

风险等级：中高。本任务首次把全部前序模块装配到页面上，涉及 GPU、音频与持久化的生命周期，并含一项可能失败的原版研究。不改动已批准的数据契约；只有 S-10 达到高概率时才修改效果 payload 与转换器。

- **效果贴图研究达不到高概率：** 查看器对相关面只用颜色并说明原因；AC-17 与 AC-18 为 blocked，其余验收照常完成。用户可以决定继续研究，或修订 spec 把该项移到别的任务。不以猜测的映射贴图。
- **呈现约定判断有误：** 只影响查看器的画面，P2-12 判定后只改渲染适配，不必重新导入。
- **主线程哈希耗时：** 真实包约 1.5 MB；AC-20 记录耗时。若出现明显卡顿，按实测把恢复与提交移入 Worker，属于实现调整，不改契约。
- **生产白名单使浏览器无法用合成数据走通生产导入的成功路径：** 导入成功路径由开发项目的测试入口覆盖；生产项目经预置的合成缓存覆盖恢复、查看与试听；真实数据由 AC-20 的本地 Node 核对与 AC-21 的用户核对覆盖。
- **拟定 CSP 使现有生产用例失败：** 例如某处依赖内联脚本或样式。这正是本任务要发现的问题：修正应用代码，而不是放宽策略；确需放宽时，记录理由并经用户确认。
- **AC-21 需要用户参与：** 在用户完成之前，本任务不能完成；其余验收可以先行完成。
- **Fast Refresh 用例不稳定：** 沿用 P1-08 的可还原编辑与稳定等待；测试结束后必须还原文件，检查工作区没有遗留改动。
- **转换器版本递增（S-10）：** 生产缓存键随之改变，旧键不恢复，用户需要重新导入。P2-11 之前没有生产缓存数据，所以没有实际影响。
- **恢复：** 代码按 subtask 逐项提交，可以回退。回退页面接线后，应用恢复为 P1 的导入占位；IndexedDB 中已写入的包不会被误用，因为没有代码读取它。

## 未决事项

无。规划问题已按用户授权采用推荐方案，见[技术决定](#技术决定)；批准时一并确认。AC-17 的研究结果不是批准前提，未达到时按[效果贴图坐标](#效果贴图坐标)处理。

## 审批

用户于 2026-10-06 明确批准本 spec（“approve spec and generate goal”）。批准范围包括：

- S-01 至 S-13、AC-01 至 AC-24；
- 状态阶梯、包预算与生产身份、缓存编排、操作与代际、查看项与渲染、查看器操作、呈现约定、效果贴图坐标（含达不到高概率时的处理）、失败反馈、持久化与兼容；
- 技术决定 1 至 12。

生成时按“采用推荐答案”授权作出的选择，以及 review-spec（rubber-duck，GPT-6.1 Sol）采纳的 15 项修正，随本次批准一并生效。AC-21 需要用户在真实机器上手工核对；AC-17 的研究结果不是批准前提。
