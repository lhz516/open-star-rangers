---
type: plan
status: accepted
phase: P2
task: "11"
updated: 2026-10-06
---

# P2-11：真实导入流程与最小资源查看器 — Goal

## 目标与来源

实现已批准的 [P2-11 spec](./spec.md) 中的 S-01 至 S-13 与 AC-01 至 AC-24：

- **app：** 预期包配置与生产常量；应用级资源持有者，负责全包判定、状态阶梯、缓存编排、代际与任务载入诊断；应用端口与页面流转；导入页面；查看器所有者（GPU 与音频）。
- **render：** `render/viewer/` 的按需查看渲染，以及集中的呈现约定。
- **ui：** 导入页面、菜单状态、查看器页面、失败文案。
- **研究：** 效果贴图坐标（S-10），达到高概率时扩展效果 payload 与转换器。
- **证明：** Node 契约测试、开发与生产项目的合成 E2E、本地真实数据的 Node 核对，以及用户的真实界面核对。

本文件不重新定义行为契约。

## 代码现状与前提

- **上游已完成：** `node tools/task-state.ts` 对 `p2/01` 至 `p2/10` 都输出 `done`（2026-10-06 核对）。本任务直接复用：
  - **作业：** [import-job-owner.ts](../../../../src/app/import/import-job-owner.ts) 的 `createImportJobOwner`（`start`、`cancel`、`takeGroups`、`dispose`、`subscribe`、`getSnapshot`）；[import-worker-port.ts](../../../../src/app/import/import-worker-port.ts)；[browser-import-worker.ts](../../../../src/platform/workers/browser-import-worker.ts) 的 `browserImportWorkerFactory(createWorker?)`；[import-protocol.ts](../../../../src/workers/import-protocol.ts) 的 `IMPORT_FILE_LIMITS`、`IMPORT_STAGES`、`ImportErrorData`；[import-job.ts](../../../../src/workers/import-job.ts)。
  - **缓存：** [browser-resource-cache.ts](../../../../src/platform/storage/browser-resource-cache.ts) 的 `createResourceCache` 与 `ResourceCache`；[resource-cache-contract.ts](../../../../src/platform/storage/resource-cache-contract.ts) 的 13 个失败码、`ResourceCacheKey`、结果形状。
  - **内容：** [completeness.ts](../../../../src/content/completeness.ts) 的 `validatePackage`；[budget.ts](../../../../src/content/budget.ts) 的 `addBudgets`；[slice-definition.ts](../../../../src/content/slice-definition.ts) 的 `CLASSIC_P2_SLICE`；图形、模型、效果、音效的读取与消费函数（spec [当前实现与依据](./spec.md#当前实现与依据)列出）；[logic-payload.ts](../../../../src/content/logic/logic-payload.ts) 的 `decodeLogicPayload`。
  - **Core：** [load-mission.ts](../../../../src/core/mission/load-mission.ts) 的 `loadMission`。
  - **音频：** [audio-controller.ts](../../../../src/platform/audio/audio-controller.ts) 的 `createAudioController`；[browser-audio-controller.ts](../../../../src/platform/audio/browser-audio-controller.ts)。
  - **渲染：** [render-surface.ts](../../../../src/render/scene/render-surface.ts)、[webgl-surface.ts](../../../../src/render/webgl/webgl-surface.ts)、[browser-webgl-surface.ts](../../../../src/render/webgl/browser-webgl-surface.ts)（无障碍名称目前固定为合成演示的文字）、[viewport-layout.ts](../../../../src/render/viewport/viewport-layout.ts)、[cleanup.ts](../../../../src/render/scene/cleanup.ts)。
  - **页面：** [App.tsx](../../../../src/app/App.tsx)、[app-flow.ts](../../../../src/app/flow/app-flow.ts)、[MainMenuPage.tsx](../../../../src/ui/pages/MainMenuPage.tsx)、`src/ui/pages/ImportPlaceholderPage.tsx`（P2-11 已删除）、[main.tsx](../../../../src/main.tsx)。可参照的生命周期与锁存模式：[synthetic-demo-lifecycle.ts](../../../../src/app/composition/synthetic-demo-lifecycle.ts)、[use-synthetic-demo-owner.ts](../../../../src/app/composition/use-synthetic-demo-owner.ts)。
  - **测试设施：**
    - [import-worker.test-support.ts](../../../../src/workers/import-worker.test-support.ts) 的合成 Worker 场景（`synthetic`、`models`、`models-corrupt` 等）与 [synthetic-import.test-support.ts](../../../../src/workers/synthetic-import.test-support.ts)；
    - E2E 探针 [browser-probes.ts](../../../../e2e/support/browser-probes.ts)、[resource-cache.ts](../../../../e2e/support/resource-cache.ts)、[audio-playback.ts](../../../../e2e/support/audio-playback.ts)、[image-observations.ts](../../../../e2e/support/image-observations.ts)、[demo-observations.ts](../../../../e2e/support/demo-observations.ts)；
    - WebGL 关闭用例 [webgl-unavailable.spec.ts](../../../../e2e/webgl-unavailable.spec.ts)、联合资源用例 [joint-resources.spec.ts](../../../../e2e/joint-resources.spec.ts)；
    - Playwright 的 `development`、`production`、`development-headed` 项目（[playwright.config.ts](../../../../playwright.config.ts)）。
- **计划新增（均尚不存在）：**
  - `src/workers/production-package.ts`：预期包配置的生产常量；
  - `src/app/resources/`：资源持有者、缓存编排、任务诊断；
  - `src/app/viewer/`：查看器所有者与音频包装；
  - `src/render/viewer/`：查看渲染；
  - `src/ui/import/`、`src/ui/viewer/`：失败文案、导入页面、查看器页面；
  - 只在开发服务器上使用的测试入口：一个 HTML 页面与挂载生产 `App` 的测试支持模块。生产构建只以 `index.html` 为入口，不含它们；
  - `docs/guides/local-import.md`：本地导入指南；
  - `local/research/p2-11/`：本地脚本与输出，被忽略、不提交。

  文件拆分可在执行时微调，但不得建立中央 schema、第二套解码或合成逻辑，也不得让 `app/`、`render/`、`ui/` 导入 `original-data`。
- **边界与工具链：** [eslint.config.js](../../../../eslint.config.js) 与 [engineering-boundaries.test.ts](../../../../tools/engineering-boundaries.test.ts) 禁止 `render/`、`ui/`、`app/` 导入 `original-data`，生产模块不得依赖测试支持；`*.test-support.{ts,tsx}` 可以引用测试支持。依赖中已有 Three.js 0.186 与 React 19，不新增依赖。
- **本地数据（2026-10-06 均已存在）：**
  - `local/StarRang/cd/` 的 CloneCD 文件组：17、19 需要；
  - `local/ghidra/srangers.gpr`：15、16 的只读分析需要。

  缺少时相应子任务为 blocked，不能用合成数据代替。
- **人工前提：** 19 需要用户在真实机器上操作，agent 不能代替（spec AC-21）。
- **研究前提：** 16 只在 15 的结论达到高概率或已确认时进行；否则 15、16 为 blocked，由用户决定后续安排。其余子任务不依赖它们。
- **原版证据：** [executable 的效果表现来源](../../../original/formats/executable.md#effect-presentation-sources)、[mesh](../../../original/formats/mesh.md)、[textures](../../../original/formats/textures.md) §3，以及 [unknowns](../../../original/unknowns.md) 的 U-027、U-028。

## 验收覆盖

| Spec 范围项/验收项 | 实现子任务 | 验证子任务及方法 |
|---|---|---|
| S-01 | 06 | 06 流转测试与菜单 E2E；13 往返；21 生产预览 |
| S-02 | 07 | 07 Node 与开发项目 E2E |
| S-03 | 02 | 02 持有者测试 |
| S-04 | 03、06、07 | 03 伪造缓存测试；07、12 真实 IndexedDB E2E |
| S-05 | 01 | 01 一致性测试；03 包预算核算 |
| S-06 | 04、11 | 04 摘要与引用校验测试；11 E2E |
| S-07 | 08、09 | 08、09 场景构建测试；11 像素读回 |
| S-08 | 22、10、11 | 22 试听与音频测试；10 所有者测试；11 E2E |
| S-09 | 08、09 | 08、09 Node；11 像素读回；源码结构记录 |
| S-10 | 15、16 | 15 文档审阅；16 Node、本地核对与 E2E |
| S-11 | 21、14 | 21 生产项目 E2E 与产物检查；14 生产项目的查看路径 E2E |
| S-12 | 02、03、07、22、10、11 | 各子任务的释放测试；13 StrictMode、Fast Refresh 与往返 |
| S-13 | 07、11、15、16、18 | 各子任务的文档影响；18 指南与文档；20 链接与元数据 |
| AC-01 | 06 | 06 流转测试与开发项目 E2E；13 往返；21 生产项目 |
| AC-02 | 07 | 07 开发项目 E2E |
| AC-03 | 07 | 07 开发项目 E2E |
| AC-04 | 05、07 | 05 文案表驱动测试；07 失败场景 E2E |
| AC-05 | 02、03 | 02、03 真值表与可控 Promise |
| AC-06 | 02、03、10 | 02 所有权；03 旧提交三种终态；10 替换前释放 |
| AC-07 | 03、07 | 03 伪造缓存逐码；07 真实 IndexedDB 与注入失败 |
| AC-08 | 03、06 | 03 条目筛选；12 刷新恢复、改写、删除 E2E |
| AC-09 | 01、03、06 | 01 一致性；03 超预算；06 模块图边界测试 |
| AC-10 | 04、11 | 04 Node；11 E2E |
| AC-11 | 09 | 09 Node；11 像素读回 |
| AC-12 | 08 | 08 Node；11 像素读回 |
| AC-13 | 24、09 | 24 碎片面表 Node；09 Node；11 像素读回 |
| AC-14 | 08、10、11 | 08 绘制计数；11 帧、画布、上下文丢失与 WebGL 关闭 E2E |
| AC-15 | 22、10、11 | 22、10 Node；11 音频探针 E2E |
| AC-16 | 06、07、10、11 | 13 开发项目 E2E |
| AC-17 | 15 | 15 只读研究与文档审阅 |
| AC-18 | 16（贴图）；09、11（未确认时的回退显示） | 16 Node、本地核对与 E2E；11 回退显示 E2E |
| AC-19 | 21、14 | 21 生产项目 E2E 与产物检查；14 查看路径 E2E |
| AC-20 | 23、17 | 23、17 本地 Node 脚本 |
| AC-21 | 19 | 19 用户手工核对 |
| AC-22 | 07、18 | 07 权利文案 E2E；18 网络 API 源码检查、链接与元数据 |
| AC-23 | 全部 | 20 工程检查与依赖 diff |
| AC-24 | 11 | 11 开发项目 E2E |

## 子任务跟踪

状态只在此维护：`pending` / `in-progress` / `blocked` / `completed`。依赖项全部 completed 后才能开始；验收结果和证据写在相应 subtask 文档，不在阶段索引重复状态。

| 子任务 | 依赖 | 状态 |
|---|---|---|
| [01-production-package-profile.md](./subtasks/01-production-package-profile.md) | — | completed |
| [02-resource-holder.md](./subtasks/02-resource-holder.md) | 01 | completed |
| [03-cache-orchestration.md](./subtasks/03-cache-orchestration.md) | 02 | completed |
| [04-mission-diagnostics.md](./subtasks/04-mission-diagnostics.md) | 02 | completed |
| [05-failure-copy.md](./subtasks/05-failure-copy.md) | — | completed |
| [06-app-shell-flow.md](./subtasks/06-app-shell-flow.md) | 03, 05 | completed |
| [07-import-page.md](./subtasks/07-import-page.md) | 04, 05, 06 | completed |
| [08-viewer-render-foundation.md](./subtasks/08-viewer-render-foundation.md) | — | completed |
| [09-viewer-models-effects.md](./subtasks/09-viewer-models-effects.md) | 08, 24 | pending |
| [10-viewer-owner-audio.md](./subtasks/10-viewer-owner-audio.md) | 02, 08, 22 | pending |
| [11-viewer-page.md](./subtasks/11-viewer-page.md) | 04, 06, 09, 10 | pending |
| [12-cache-browser-recovery.md](./subtasks/12-cache-browser-recovery.md) | 07, 11 | pending |
| [13-lifecycle-hot-reload.md](./subtasks/13-lifecycle-hot-reload.md) | 07, 11 | pending |
| [14-production-preview-csp.md](./subtasks/14-production-preview-csp.md) | 07, 11, 21 | pending |
| [15-effect-mapping-research.md](./subtasks/15-effect-mapping-research.md) | — | completed |
| [16-effect-mapping-display.md](./subtasks/16-effect-mapping-display.md) | 11, 15, 17, 24 | pending |
| [17-local-real-data-check.md](./subtasks/17-local-real-data-check.md) | 09, 23 | pending |
| [18-docs-local-import-guide.md](./subtasks/18-docs-local-import-guide.md) | 12, 13, 14 | pending |
| [19-user-real-machine-check.md](./subtasks/19-user-real-machine-check.md) | 14, 18 | pending |
| [21-production-preview-csp.md](./subtasks/21-production-preview-csp.md) | 07 | completed |
| [22-viewer-audio.md](./subtasks/22-viewer-audio.md) | 02 | completed |
| [23-local-real-data-import.md](./subtasks/23-local-real-data-import.md) | 03, 04 | pending |
| [24-debris-face-pairs.md](./subtasks/24-debris-face-pairs.md) | — | pending |
| [20-final-alignment.md](./subtasks/20-final-alignment.md) | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24 | pending |

最后一行始终为最终对齐验证，依赖所有其他子任务。ID 分配后保持不变；新增修复项使用新 ID，插入最终验证之前并加入其依赖，不要求最终验证拥有最大的数字。

## 执行记录

- **2026-10-06 — 子任务 03 前的 spec 澄清：** spec“包预算与生产身份”原写“提交前的空间检查以 `payloadBytes` 加上 `measure` 的元数据估计为需求”。但行为表与 S-04 把空间检查放在开始导入之前，此时没有组输入，`measure` 无法计算元数据。
  - 改为：导入前以包预算的 `payloadBytes` 为需求，这是 [P2-10 spec](../10/spec.md) 操作表允许的估计；该上限（11,943,936 字节）远大于实际 payload 与元数据之和。
  - 同步修改了 spec 与子任务 03 的措辞，不影响其他验收。
- **2026-10-06 — 为并行执行拆分子任务：** 08 与 15 由用户在另外两个工作树中并行执行（分支 `agents/p2-08`、`agents/p2-15`），本工作树不执行它们，跟踪表中标为 in-progress。用户随后要求找出可同时进行的工作，因此把 10、14、17 中不依赖 08 的部分拆出，新增：
  - 21：生产预览的 CSP、Worker 入口与回退、构建产物与 AC-01 生产部分，依赖 07；14 只保留预置缓存的完整查看路径，并改为依赖 21。
  - 22：查看器的试听与音频 `close()` 观察，依赖 02；10 保留所有者、GPU、替换与锁存，并改为依赖 22。
  - 23：本地真实数据的导入、全包判定、任务载入与耗时，依赖 03、04；17 只保留场景构建，依赖改为 09、23。

  验收覆盖随之更新；spec 与各验收项不变。最终对齐 20 增加对 21、22、23 的依赖，仍为最后一行。
- **2026-10-06 — 子任务 08 的表面选项扩展：** 计划只把画布的无障碍名称改由调用方提供。但 spec 呈现约定要求读回的字节等于源字节，而 Three.js 渲染器默认以 sRGB 输出，会对着色器输出再做编码，本机 Chrome 实测最大误差 73。
  - 浏览器表面工厂与 `AppPorts.createSurface` 因此改为接收 `RenderSurfaceOptions`：无障碍名称加输出颜色空间。
  - 合成演示传原名称与默认的 sRGB 输出，行为不变；查看器传 `VIEWER_SURFACE`（线性输出，实测误差 0）。
  - 10 的所有者以 `createSurface(container, VIEWER_SURFACE)` 创建表面。不改变任何验收，详见 [08 的完成证据](./subtasks/08-viewer-render-foundation.md#完成证据)。
- **2026-10-06 — 子任务 15 的研究结论影响 09、16 与 P2-06 的实现：** 15 按 AC-17 通过：参数含义、坐标公式、计算时机与全部输入均已确认（代码），见 [executable](../../../original/formats/executable.md#effect-texture-mappings-p2-1115-research)。以下各项需在相关子任务开始前处理：
  - **碎片映射是柱面映射：** 原版用 wrap 类型 1，不是 spec、子任务 15/16 与 P2-06 文档所称的“平面映射”。该名称来自研究前的描述；契约要求（导入研究确定的参数、展开输出贴图坐标）照常适用。
  - **只应用第 0 个旋转：** 导弹预建的 32 个旋转映射中，原版只应用第 0 个；每枚导弹的元素都是带第 0 个坐标的副本，随机序号不影响贴图坐标。spec 的“每个旋转序号”输出与查看器的 32 选 1 仍可实现，但不对应原版可见的差异。16 开始前，需由用户确认是否保留这两项。
  - **接缝插值未确认：** 受影响的面是导弹元素 3 个侧面中的 1 个（另一面表模板 6 个面中的 2 个）和碎片唯一的面。按 spec“不以猜测的映射贴图”，16 的 AC-18 像素断言不能用这些面，除非用户先决定其显示方式，例如按顶点坐标线性插值并标注“接缝插值未确认”。
  - **碎片面表解析有误（P2-06 实现缺陷）：** 碎片构建函数传入逐顶点法线，`0x80c14` 因此把每个角读作（顶点序号，法线序号）一对，两种碎片模板各是一个 6 角面，executable 的面表结论已更正。`content/effects` 的 `faceList`、`faceTriangles` 与 `effectExpansionSize` 按纯顶点序号解析，碎片被展开成 6 角面加 5 角面，共 7 个三角形，几何错误。payload 保存的是原始字，导入不受影响。修正需在 09 与 16 之前安排，由用户决定归入 P2-06 修复还是本 goal 新增的修复子任务。15 只改原版文档，没有修改代码。
- **2026-10-06 — 合并 08、15 后的安排：** 用户要求合并两个分支并删除其分支与工作树，已完成（合并提交见 git 记录）。按用户“需要回答的问题按最推荐的答案”的授权，对 15 交接的事项作如下安排：
  - **碎片面表解析缺陷：** 归入本 goal，新增修复子任务 24（无依赖），09 与 16 改为依赖它，最终对齐 20 也依赖它。payload 字节与 schema 不变，不递增转换器组件。
  - **16 的两项决定（32 个旋转映射、跨接缝面的显示）：** 只影响 16，16 还依赖 11 与 17，留到 16 开始时决定并记录。

## 审批

用户于 2026-10-06 明确批准本 goal（“approve goal and commit”）。批准范围为上述 20 个子任务的拆分、依赖关系与验收覆盖，以及“代码现状与前提”中的计划新增文件、人工前提（19）与研究前提（15、16）。spec 已于同日获批准。批准不代表实现完成。
