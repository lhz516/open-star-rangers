---
type: guide
status: active
phase: P1
updated: 2026-10-30
related: [ADR-0002, ADR-0006, ADR-0015]
---

# 工程约定

本项目代码的结构、命令与检查规则。架构决定见[总计划](../plan/master-plan.md) §4–5；本文只记录落地方式。

当前源码目录、Runtime/Session 的分工、helper 归属与后续阶段扩展落点见[源码结构指南](./source-structure.md)，各模块已交付代码的 API 与契约要点见其[模块分册](./source-structure.md#模块说明)，决定见 [ADR-0015](../decisions/ADR-0015-source-module-structure.md)。历史源码路径的对应关系与本轮验证只在[迁移记录](./source-structure.md#p1-06-前迁移记录)维护；P3-04 退役的 P1 合成演示（源码、lint 规则与本文原有的合成小节）见[退役记录](./source-structure.md#p3-04-合成演示退役记录)。

按 spec、goal 与 subtasks 开发的路径、审批、进度维护和 skills 入口见[Agent 任务工作流](./agent-workflow.md)。

## 环境

- Node 22（`.nvmrc`；`package.json` 要求 ≥ 22.18，以便直接运行 `.ts`），pnpm 12（`packageManager` 字段，由 corepack 提供）。
- 依赖用 `pnpm-lock.yaml` 锁定，升级经测试后合入。
- 原版数据与研究输出只在主 worktree 的 `local/`（被忽略）。每个新建的 worktree 都把 `local` 链接到主 worktree 的 `local`：
  - VS Code 由 [.vscode/settings.json](../../.vscode/settings.json) 的 `git.worktreeSymlinkFolders` 完成；
  - GitHub Copilot app 由 [.github/github-app.yml](../../.github/github-app.yml) 的 `session.create` 脚本完成，配置须先在 app 中审阅并接受；
  - execute-goal 的 worker 由其[派发步骤](../../.agents/skills/execute-goal/references/parallel.md#dispatch)完成；
  - 其他方式创建的 worktree，在其根目录运行 `ln -s <主 worktree>/local local`。

  不复制 `local/`，也不在 worktree 中另建一份。

## 命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 启动 Vite 开发服务器 |
| `pnpm build` | 生产构建及严格分发许可声明，输出到 `dist/` |
| `pnpm preview` | 预览当前 `dist/`，发送拟定 CSP；不会自动构建，操作见[本地导入指南](../guides/local-import.md#本地生产预览) |
| `pnpm typecheck` | 分别用四个 tsconfig 做增量类型检查（见下） |
| `pnpm lint` | ESLint（带缓存），包含模块边界与确定性规则 |
| `pnpm test` | Vitest 单元测试 |
| `pnpm check` | 依次运行以上四项检查，提交前使用 |
| `pnpm test:e2e` | 先构建当前代码，再运行独立的本地 Chromium 浏览器回归；不属于 `pnpm check` |
| `pnpm check:original` | 只读扫描当前Git工作树/索引/未忽略未跟踪及完整dist，不自动build |
| `pnpm check:licenses` | 只读核对当前锁/安装、inventory指纹与完整声明，不自动build |
| `pnpm check:compliance` | 先当前build，再执行两类检查，任一失败整体非零 |

`tools/` 中的研究脚本直接用 `node tools/<脚本>.ts` 运行，见 [tools](../guides/tools.md)。

Python 工具的测试用标准库 `unittest`，不属于 `pnpm check`，改动相应目录后单独运行：

| 命令 | 作用 |
|---|---|
| `python3 -B -m unittest discover -s tools/ghidra -p 'test_*.py'` | Ghidra 编译器规范补丁的测试 |
| `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'` | 运行时测量工具的测试：合成 LE 映像、假调试器与临时目录，不读取 `local/` 或原版文件；用法见[运行时测量](../guides/runtime-measurement.md) |

`pnpm typecheck` 与 `pnpm lint` 只重新检查变化的文件：各 tsconfig 启用 `incremental`，构建信息写入 `node_modules/.cache/tsc/`；ESLint 按文件内容缓存于 `node_modules/.cache/eslint/`。缓存键覆盖配置与依赖，自定义插件 `osr` 的版本取 `eslint.config.js` 与 [original-data-capabilities.ts](../../tools/original-data-capabilities.ts) 的内容摘要，规则源码一变缓存即失效。怀疑缓存有误时删除 `node_modules/.cache` 即回到全量检查。

### 构建许可声明

[构建插件](../../tools/compliance/build-plugin.ts)仅用于build，不进入应用。正常构建同时生成 `dist/LICENSE.txt`、`dist/THIRD-PARTY-NOTICES.txt`、`dist/compliance-inventory.json`；inventory是分发/指纹元数据，不是已通过合规报告。

- 当前锁与实际安装集合由pnpm自身frozen校验及只读查询核对；frozen在自有离线临时副本中运行lockfile-only/ignore-scripts，不修改用户树。缺依赖/文本/归属、未知或不支持的网站许可使build非零；普通命令不下载许可或安装依赖。
- 分发依据真实chunk/module、map附带来源及静态文件，不看dev标签。Vite/Rolldown实际注入的helper也属于分发；当前lightningcss仅本地工具，不自动获得网站许可。public复制文件必须显式归属，当前无public资源系统。
- 模块 Worker（P2-11 起生产构建含导入 Worker）由 Vite 单独构建，作为没有原始文件名的 `.js` 资产连同自己的 `.map` 写入页面 bundle；归属先处理全部 map，再按同名 `.map` 的来源归属这种 `.js` 资产，但只在三者都成立时：脚本末尾的 `sourceMappingURL` 指向该 map，map 的 `file` 指回该脚本，且某个产出的 chunk 以文件名引用它（页面以 URL 载入 Worker）；否则仍以 `asset-ownership` 失败。Vite 把 Worker map 的来源写成相对于进程当前目录的 `dist/assets`，所以构建须在仓库根运行（`pnpm build` 即如此）；在别处运行时来源无法解析，构建以归属错误失败。
- [声明生成器](../../tools/compliance/notices.ts)保留当前shipped包的完整本地LICENSE/COPYRIGHT/NOTICE（含多文本/目录及显式声明的义务），校验许可正文/版权基础完整性；未知义务仍需人工审阅，不是法律鉴定。项目MIT与原版权利范围见[根说明](../../README.md#许可证与原版权利)。
- 构建先移除旧声明/inventory及自有temporary文件；正常输入在load前记录并于写出前核对，输入变化或生成/IO失败不能留有效旧inventory。只管理3个明确输出，不清用户/local/或依赖目录；输入/产物SHA256有变化须重建。

[CLI](../../tools/compliance/cli.ts)输出 `osr-local-compliance`/1 的JSON，kind分别为original/licenses/compliance。只有全部必需范围completed且零finding才passed=true/exit0；失败是passed=false/非零，保留稳定code、范围与安全相对路径/包身份，不转发原始内容、私人路径或工具stderr。机器读取可用 `pnpm --silent check:compliance`；默认不保存报告，需留存时重定向到ignored的 `test-results/compliance/`。

counts的checked含义：worktree/index/untracked/build为完整文件数，dependencies为当前安装实例数，distribution为归属产物数（inventory自身无递归digest），artifacts为全部当前dist文件数。coverage明确当前platform/arch与未安装optional清单；这些未安装包没有被冒称已扫描。原版扫描只需Node/Git，缺许可SDK时许可/聚合也返回明确失败JSON，不安装补齐。

扫描/许可证政策的能力边界与P5后续确认见[本地合规用法](../guides/tools.md#本地合规)，当前来源/完整任务文件与实际产物审阅见[P1-12/08](../plan/p1/12/subtasks/08-local-evidence-docs.md#完成证据)。浏览器只核对相关声明DOM及生产预览3文件可读性；[专用assets测试](../../e2e/compliance-assets.spec.ts)只属于production项目，开发页面使用rights-text测试，不把开发服务器当dist静态发布物。

## TypeScript 配置

| 文件 | 范围 | 作用 |
|---|---|---|
| `tsconfig.base.json` | — | 共同选项：`strict`、`verbatimModuleSyntax`、`erasableSyntaxOnly`、允许 `.ts` 扩展名导入 |
| `tsconfig.core.json` | `src/core`、`src/original-data`、`src/content` | **不含 DOM 与 Node 类型**：这些纯模块一旦使用浏览器或 Node API，编译即失败 |
| `tsconfig.app.json` | `src/` 全部 | 浏览器应用（DOM、JSX、Vite 客户端类型） |
| `tsconfig.node.json` | `tools/**/*.ts`、Vite 配置、`src/**/*.test.ts` | Node 端 TypeScript；`eslint.config.js` 由 lint 覆盖，未启用 JS 类型检查 |
| `tsconfig.e2e.json` | `playwright.config.ts`、`e2e/**/*.ts` | 独立 Node runner 与浏览器 evaluate 的 DOM 类型，不扩大 Core/Node 环境 |

- `erasableSyntaxOnly` 禁止 `enum`、`namespace` 等需要转换的语法，使同一份代码既能被 Vite 打包，也能被 Node 直接运行。常量集合用 `as const` 对象代替 `enum`。
- 导入本项目模块时写出 `.ts`/`.tsx` 扩展名，Node 直接运行时需要。
- **TypeScript 固定为 6.0.x。** TypeScript 7 是原生实现，不再提供 typescript-eslint 依赖的 JavaScript API；typescript-eslint 支持 7 之后再升级。

## Lint 规则（`eslint.config.js`）

- **纯模块**（`src/core`、`src/original-data`、`src/content`）的非测试 `.ts`/`.tsx` 不得导入或 re-export React、React DOM、Zustand、Three.js、IndexedDB 封装库的包根/子路径，也不得导入 `app`、`render`、`ui`、`platform`、`workers` 的目录入口或子模块。
- **`src/core`** 不得使用 `Math.random`、`Date`、`performance.now`、定时器、`requestAnimationFrame`、`await` 或任何 `async` 函数形式。随机数来自 Core 自己的带种子生成器，时间来自 tick 计数（总计划 §5）。其他消费层仍允许宿主调度和异步。
- P3-02 的 `osr/core-synthetic-boundary`（正式 Core 与合成 Core 互不依赖）已随 `core/synthetic/` 于 P3-04 删除，见[退役记录](./source-structure.md#r9-lint-规则-osrcore-synthetic-boundary)。
- 类型导入必须写成 `import type`。
- 持久正/负回归在 [engineering-boundaries.test.ts](../../tools/engineering-boundaries.test.ts)，进入现有 `pnpm test`/`pnpm check`。TypeScript 样本在自有临时项目中使用仓库原配置和真实 include/exclude，ESLint 使用虚拟源与真实逻辑路径，不在生产目录留违规文件。负向必须命中目标诊断，正向须通过；空项目、ignored/parser 错误及误配预期均会失败。
- 覆盖限定为明确的静态导入、路径、宿主 API 和 async/await 语法；不承诺识别动态绕过、别名间接调用或不经 async/await 的 Promise 链。测试例外是 `.test.ts`，不扩展未来 `.test.tsx`/E2E 发现能力。
- 同一回归文件的 render layer 部分（P1-07 AC-01/04/17）用 TypeScript 解析应用程序中的生产源码（忽略注释与普通字符串）：只允许从 `three` 包根导入且只在 `render/`，无 `three/*`、React Three Fiber 或 WebGPURenderer；`render/` 模块自身的生产代码不出现 rAF、`setAnimationLoop`、定时器或 `queueMicrotask` 等调度标识符。`render/` 中浏览器适配命名为 `browser-*.ts`，与 `.tsx` 一样只由应用程序检查；其余 DOM-free 渲染模块必须出现在真实 `tsconfig.node.json` 程序中（即被某个 `.test.ts` 传递导入），且该程序不得包含任何 `browser-*` 或 `.tsx`。它同样不识别动态拼接的绕过。
- 同一回归文件的资源缓存部分（P2-10 AC-14/AC-15）解析 `src/platform/storage/` 的生产源码：不得出现 `fetch`、`XMLHttpRequest`、`WebSocket`、`sendBeacon`、`EventSource`、`window`、`document`、`localStorage` 标识符，只能相对导入且不能导入 `original-data`、`render`、`ui`、`app`、`workers`；非 `browser-*` 的模块必须在真实 Node 程序中。`browser-*` 适配不进入 Node 程序由上一条的 render 规则覆盖（它检查 `src/` 中所有浏览器模块）。
- 同一回归文件的应用资源部分（P2-11 S-03/AC-22）解析 `src/app/resources/` 的生产源码：不得出现与资源缓存相同的网络与宿主标识符，只能相对导入且不能导入 `render`、`ui`；每个模块都必须在真实 Node 程序中。各部分共用一次构建的 Node 程序文件集合。
- P2-11 AC-22 的主线程网络回归覆盖 `src/app/`、`src/ui/` 与 `src/render/viewer/` 的全部生产 `.ts`/`.tsx`（排除测试与测试支持）：不得引用 `fetch`、`XMLHttpRequest`、`WebSocket`、`EventSource`、`sendBeacon`。复用 TypeScript 程序与标识符解析，另检查字面量下标和解构属性；正反例验证目录范围、全局/属性/解构形式，忽略注释和普通字符串。这是静态源码边界，不承诺识别动态拼接的属性名；页面与 Worker 实际发出的请求由浏览器 runner 的[网络审计](#网络审计)核对。
- **飞行表现模块**（P3-12，[spec：表现层契约](../plan/p3/12/spec.md#表现层契约计划新增)）：`src/render/flight/presentation/` 的非测试文件只能以相对路径引用自身、`src/core` 与 `src/content`，包（含 Three.js）与计算式 `import()` 一律拒绝（本地规则 `osr/flight-presentation-imports`，检查导入、再导出、动态导入与 `import('…')` 类型）；不得使用 DOM 与宿主全局（`window`、`document`、`navigator`、`globalThis`、`fetch`、`crypto`、`Date`、`performance`、定时器、`requestAnimationFrame`、画布与 WebGL 类型等）、`Math.random`、`Date.now`、`performance.now`、`getRandomValues`、`randomUUID`，也不得使用 `await` 或 `async` 函数：随机源由运行注入，时间是任务时钟，每个 tick 同步处理。同一回归文件含 lint 正反例（两层目录深度、各种导入形式、测试文件不受限），并沿真实应用程序的依赖图核对模块传递可达的只有 Core、content 与自身，没有包与 DOM 名称（含夹具反例）。这同样是静态规则，不识别动态绕过。
- **驾驶舱纯模块与 GPU 适配**（P3-13，[spec：涉及模块](../plan/p3/13/spec.md#涉及模块)，[render 模块说明](./modules/render.md#驾驶舱目录)）：
  - **纯模块：** `src/render/cockpit/` 中除 GPU 适配目录以外的非测试文件只能以相对路径引用自身、`src/core`、`src/content` 与 `src/render/flight/presentation`，不得引用 GPU 适配目录（`src/render/cockpit/composition/` 与任一 `src/render/cockpit/<模块>/gpu/`）；包（含 Three.js）与计算式 `import()` 一律拒绝（本地规则 `osr/cockpit-imports`，检查导入、再导出、动态导入与 `import('…')` 类型）。宿主限制同上一条飞行表现模块：不得使用 DOM、页面与 WebGL 全局、`Date`、`performance`、定时器、`queueMicrotask`、`requestAnimationFrame`、`requestIdleCallback`、`crypto`、`Math.random`、`Date.now`、`performance.now`、`getRandomValues`、`randomUUID`，也不得使用 `await` 或 `async` 函数：随机源是运行的驾驶舱流，时间是任务时钟，每个 tick 同步处理。
  - **GPU 适配：** `src/render/cockpit/composition/**` 与 `src/render/cockpit/*/gpu/**` 可以用 Three.js 与 render 层，但不得导入 React、React DOM、Zustand、`idb`/`idb-keyval`（含子路径）与 `original-data`，不得导入 `app`、`ui`、`platform`、`workers` 层，不得使用 `window`、`document`、`navigator`、`localStorage`、`indexedDB`、`fetch` 与上述宿主时间、随机、调度，也不得使用 `await` 或 `async`：由应用装配它们。
  - **回归：** 同一回归文件含三个纯模块位置（presentation、gauges、raster）与两个 GPU 适配位置的 lint 正反例（测试与测试支持不受限），并沿真实应用程序的依赖图核对纯模块传递可达的只有 Core、content、飞行表现模块与自身，没有包、DOM 名称、GPU 适配或计算式导入（含夹具反例）。快速运行：`pnpm exec vitest run tools/engineering-boundaries.test.ts -t cockpit`。这同样是静态规则，不识别动态绕过。
- **飞行音效模块**（P3-14，[spec：涉及模块](../plan/p3/14/spec.md#涉及模块)，S-04、AC-13）：`src/app/flight-audio/` 的非测试文件只能以相对路径引用 `src/core`、`src/content`、`src/app`、`src/platform/audio` 与 `src/render/flight/presentation`，其中任何 `browser-*` 模块或 `.tsx` 都不行；包与计算式 `import()` 一律拒绝（本地规则 `osr/flight-audio-imports`，检查导入、再导出、动态导入与 `import('…')` 类型）。不得使用 DOM、页面与网络全局（`window`、`document`、`navigator`、`self`、`globalThis`、`localStorage`、`indexedDB`、`fetch`、`XMLHttpRequest`、`WebSocket`、`EventSource`）与音频宿主（`AudioContext`、`OfflineAudioContext`、`webkitAudioContext`、`Audio`、`HTMLMediaElement`，由控制器的注入能力提供），也不得使用 `Date`、`performance`、定时器、`queueMicrotask`、`requestAnimationFrame`、`requestIdleCallback`、`crypto`、`Math.random`、`Date.now`、`performance.now`、`getRandomValues`、`randomUUID`：会话的帧驱动它们。也不得使用 `await` 或 `async` 函数：每帧同步处理；只有所有者级连接 `owner*.ts`（P3-14/17）可以异步等待上一控制器关闭。同一回归文件含两层目录深度的 lint 正反例（含 `owner*.ts` 的例外只限顶层；测试、测试支持与其他 app 模块不受限），并沿真实应用程序的依赖图核对：模块传递可达的没有 `ui`、`original-data`、浏览器适配、`.tsx`、包与飞行表现模块以外的 render 代码；生产代码不出现 `submitCommand`、`setIntent`、`clearIntent`、`requestFrame`、`cancelFrame`、`createGameRuntime`、`createGameSession`、`advance` 及上述 DOM 与调度名称；render、platform、Core 与 content 不可达它们；每个模块都在真实 Node 程序中（均含夹具反例）。快速运行：`pnpm exec vitest run tools/engineering-boundaries.test.ts -t "flight audio|flight sound"`。这同样是静态规则，不识别动态绕过；运行时的一致性由 `src/app/flight-audio/` 的 `runtime-integration.test.ts` 与 `replay.test.ts` 核对。
- 同一回归文件的音频播放部分（P2-08 AC-11）与 lint 共同约束 `src/platform/audio/`。
  - **lint：** 用单独一条 `@typescript-eslint/no-restricted-imports` 覆盖平台的通用选项，拒绝任何 `original-data` 导入（包括纯类型导入字节端口），以及 `app`、`render`、`ui`、`workers`。
  - **源码回归：** 解析生产源码，不得出现 `fetch`、`XMLHttpRequest`、`WebSocket`、`sendBeacon`、`EventSource`、`localStorage` 标识符，只能相对导入；沿应用程序的依赖图（含再导出、动态 `import()` 与 `import('…')` 类型）也不能间接到达上述模块，无法核实目标的计算型动态导入同样报错；非 `browser-*` 的模块必须在真实 Node 程序中。
  - **反例：** 每条规则都有反例夹具，Node 程序一条用临时项目中的孤立模块验证。
  - **发声上限：** 播放控制器的同时发声上限 `AUDIO_VOICE_LIMIT` 为 8（至少满足四类核心音效同时发声）。它只是资源保护，不代表原版混音路数。
- 同一回归文件的 content 部分（P2-01 AC-01）保证唯一生产切片定义。`SliceDefinition` 带仅类型品牌，其他模块不经类型断言就无法构造；检查用应用程序的类型检查器找出所有目标类型可充当 `SliceDefinition` 的 `as`/`satisfies`/尖括号断言（含别名与映射类型），只允许 [slice-definition.ts](../../src/content/slice-definition.ts) 中的那一处。引用、传参或克隆已有单例不受限；显式 `any` 由 lint 拒绝，无类型的 `any` 数据流不在覆盖范围内。
- 规范内容的消费者（`src/core`、`src/content`、`src/render`、`src/platform`、`src/ui`、`src/app` 的非测试文件）不得导入 `original-data` 的目录入口或任何子模块（P2-01 S-06/AC-05），原版 locator、IMFAT entry ID/type 和子资源定位因此只留在 `original-data`。core 与 content 的这一限制与纯模块限制写在同一条规则选项里，因为 flat config 中后出现的同名规则选项会整体替换前者。lint 只检查直接的 import/export 声明，所以同一回归文件还沿真实应用程序的依赖图检查传递可达性（含再导出、动态 `import()` 与 `import('…')` 类型）：只有 `original-data` 与导入 `workers` 可以到达 `original-data`，消费者也不能经由 workers 或其他中间模块间接到达；主线程读取的生产包配置 `src/workers/production-package.ts`（P2-11 S-05）虽在 `workers/` 中，也按消费者对待，lint 与依赖图都禁止它到达 `original-data`；参数不是字符串字面量的动态 import 无法核实目标，从消费者可达时一律报错。测试文件不受限。
- 唯一例外是字节读取端口 [`src/original-data/io/byte-source.ts`](../../src/original-data/io/byte-source.ts)（P2-02 S-07/AC-09）。它只含类型、不导入任何模块，由平台适配实现。
  - **lint：** `src/platform` 的非测试文件改用 typescript-eslint 的 `@typescript-eslint/no-restricted-imports`，只允许以纯类型方式导入这一个模块（`import type` 或全部为 `type` 的具名导入）。值导入、副作用导入和其他 `original-data` 模块仍被拒绝。该扩展规则会放过纯类型再导出和动态加载，因此同一条目还用 `no-restricted-syntax` 拒绝以下语法：`export … from` 形式的 `original-data` 再导出（含 `export type`），字符串或模板字面量参数的动态 `import()`，以及 `import('…')` 类型查询。lint 无法追踪本地绑定的来源，先导入再 `export type { … }` 或用类型别名转出的情况由依赖图拦截。
  - **依赖图：** 平台文件到端口的边须同时满足两点才放行：
    - 对端口的每个引用都是纯类型导入声明；
    - 导出的符号不是端口类型，导出的类型别名与接口在任何位置（别名体、类型参数约束与默认值、继承、成员）都不引用端口类型。导出的函数与类可以在签名中使用端口，这正是适配的用法。

    满足时该边不计入可达性，所以 app/ui 使用平台适配不会被误报。app/ui 直接导入端口，或经平台的再导出、本地导出、类型别名或接口取得端口，仍然报错。
  - 其他层（core、content、render、ui、app）对端口的任何导入仍被拒绝。
- **原版数据的底层能力**（P2-03 S-07/AC-14）：未经生产白名单识别、就能打开光盘或封包的模块，只能由所属模块族、`original-data/source/` 来源模块族、测试与 `tools/` 使用。
  - **受限模块：**
    - `original-data/disc/` 下任意深度的 `.ts`/`.tsx` 模块（只豁免顶层的 `disc-error.ts`、`disc-path.ts`）；
    - `original-data/archive/` 下任意深度的模块与 `original-data/imfat.ts`；
    - `original-data/source/` 下除产品入口与两个公开模块以外的全部模块，包括接受自定义白名单的 `identify-source.ts`。今后新增的来源模块默认只供来源族使用；
    - 测试、测试支持，以及 `src/` 之外的全部仓库文件（`tools/`、E2E 支持、配置等）。它们可以使用全部能力，生产模块若导入它们，就能间接取得能力。依赖包不受此限。
  - **其他使用者：** `src/workers/` 与 `original-data` 内的其他模块（例如转换模块）只经以下来源模块取得能力：
    - 产品入口 [open-verified-source.ts](../../src/original-data/source/open-verified-source.ts)：取得镜像、文件与封包的唯一途径。它自己使用底层能力，因此导出面受限：唯一的值导出是它声明的函数 `openVerifiedSource`，其他导出都必须是纯类型；
    - [verify-source-mappings.ts](../../src/original-data/source/verify-source-mappings.ts)：只接受已验证来源句柄；
    - [source-catalog.ts](../../src/original-data/source/source-catalog.ts)：白名单数据与读取，不打开任何输入。

    这两个公开模块不属于来源族，与其他使用者受同样的检查，因此不能再导出或包装底层能力。其他使用者仍可使用错误类型、`DiscPath` 语法检查与来源映射，也可纯类型导入受限模块。其他层（core、content、render、ui、app）经 `src/` 内的中间模块到达 `original-data`，由消费者的传递检查拒绝。
  - **族之间：** disc 族与 archive 族之间也不能互相值导入，archive 族只能纯类型引用 disc 的接口。
  - **分类：** 受限模块所属的族与导入者所属的族由 [tools/original-data-capabilities.ts](../../tools/original-data-capabilities.ts) 统一判定，lint 与依赖图共用。
  - **lint：** 本地规则 `osr/original-data-capabilities`（定义在 `eslint.config.js`）把每个相对说明符相对于被检查文件解析为真实路径（带或不带 `.ts`/`.js` 都识别），再按上述分类判定；`original-data` 内其他位置的同名 `disc/`、`archive/` 目录不受影响。导入测试、测试支持或 `src/` 之外的文件时，提示生产代码不得依赖它们；其他情况提示改经产品入口。对产品入口改为检查导出面：除 `openVerifiedSource` 函数声明外，值声明、本地或带模块说明符的值再导出、值 `export *` 与默认导出都报错。对其他模块，它拒绝值导入（含副作用导入）、带模块说明符的再导出（含 `export type`、`export *`）、字符串或模板参数的动态 `import()` 与 `import('…')` 类型查询；纯类型导入声明放行。
  - **依赖图：** 同一回归文件解析每个生产模块的真实导入、再导出、动态导入与导入类型，按目标模块所属的族判定。`original-data` 与 `src/workers/` 中参数无法核实的动态导入一律报错。纯类型导入的名称只能在本模块私用：若再用不带模块说明符的 `export { … }`、`export type { … }` 或 `export default` 导出该名称，同样报错。lint 无法追踪本地名称的来源，这种情况只由依赖图拦截。产品入口的导出面按与 lint 相同的规则从语法核对，本地别名（如 `const leak = openDiscImage; export default leak`）也会被拒绝。基于受限类型声明并导出新的类型别名或接口，不算再导出：类型不携带打开能力，受限的值则在导入时已被拒绝。
- **测试支持与工具**（P2-04 AC-11）：`src/` 下的全部生产模块（含来源族与产品入口）都不得依赖测试、测试支持或 `src/` 之外的文件，也不得把它们当作 `new URL('…', import.meta.url)` 载入，例如测试用的 Worker 入口。
  - **lint：** `osr/original-data-capabilities` 适用于 `src/` 下全部非测试文件，对每个导入者检查这一类目标，也检查 `new URL('…', import.meta.url)` 的字面量说明符。URL 按 URL 语义解析（[original-data-capabilities.ts](../../tools/original-data-capabilities.ts) 的 `urlTarget`，lint 与依赖图共用）：相对路径不论有无 `./` 都相对于模块所在目录，以 `/` 开头的路径相对于仓库根（Vite 在 `/` 提供），反斜杠与浏览器 URL 一样视为路径分隔符，去掉查询与片段，`.js` 视为 `.ts` 源文件，外部 URL 忽略。能力族本身仍只在 `src/workers/` 与 `original-data` 中检查；其他层由上面的消费者规则整体拒绝 `original-data`，不重复报告。
  - **依赖图：** 同一检查对全部生产模块（不再豁免来源族）判定这一类目标，并把 `new URL('…', import.meta.url)` 的字面量当作引用。它不计入原版数据的可达性：Worker 入口单独载入，不是导入。纯类型导入照旧只能私用；参数不是字面量的 `new URL` 无法核实，不在覆盖范围内。
- **导入 Worker 不用网络**（P2-04 S-09/AC-11）：`src/workers/` 的非测试文件不得以全局名称使用 `fetch`、`XMLHttpRequest`、`WebSocket`、`EventSource` 与 `importScripts`（`no-restricted-globals`），也不得以任何对象的属性访问它们或 `sendBeacon`（`no-restricted-properties`，含 `self.`、`globalThis.`、`navigator.`、字面量计算属性与解构）。这只是静态规则；Worker 实际发出的请求由[网络审计](#网络审计)核对。

## 测试

- Vitest 用两个项目运行全部 `src/**/*.test.ts` 与 `tools/**/*.test.ts`（[vite.config.ts](../../vite.config.ts)）。顶层调用 `vi.mock(` 替换模块的文件进入 isolated 项目，各自拥有模块图；其余文件在 shared 项目中关闭隔离（`isolate: false`），同一 worker 复用模块图，免去每个文件重新启动与导入，这原是全量测试的主要耗时。配置启动时扫描文件自动分组，新增 mock 文件无需登记。`restoreMocks` 在每个用例后还原 spy；shared 项目中的测试不得依赖其他文件留下或改动的模块级状态。
- worker 数为 CPU 的 50%，为集成测试启动的构建工具和其他并行检查留出余量；不设全局 timeout。回归由 [engineering-boundaries.test.ts](../../tools/engineering-boundaries.test.ts) 保护：每个测试文件恰属一个项目，只有 mock 文件被隔离，且不覆盖 deadline。机器负载很高（load 约 12–30，多个会话并行检查）时，单独运行不足 1 s 的 CPU 密集用例在全量并行运行中曾超过 Vitest 默认的 5 s：规范文本的上限用例（每次扫描 16 M 码元）与首个构建真实 Node 程序的边界用例。因此前者所在的用例组声明 30 s deadline，Node 程序改由一个限时 30 s 的 `beforeAll` 构建，两处都在代码旁写明实测依据（[P3-02 子任务 13](../plan/p3/02/subtasks/13-heavy-test-timeouts.md)）。正式 Core 的录制与比较也各有一组按上限规模运行的用例（[recording.test.ts](../../src/core/replay/recording.test.ts) 的 `limit-sized recordings`：录满 tick 与命令容量；[compare.test.ts](../../src/core/replay/compare.test.ts) 的 `limit-sized results`：26 万余事件的结果），同样声明 30 s deadline 并旁注实测依据（[P3-02 子任务 08](../plan/p3/02/subtasks/08-snapshot-replay.md)）。随世界状态增长，又有一批用例在全量并行运行中超过 5 s（单独 0.1–2.2 s，两个全量运行并行、load 约 52 时最多 23 s），同样各自声明 deadline 并旁注实测依据：快照的全字段变化与 P3-08 控制器变体、快照文本预算、应用测试入口的场景配置为 60 s；图像 payload 往返、任务场景、地图与 Warp replay，以及边界测试中遍历真实应用程序的三项（SliceDefinition 构造、低层能力边界、原版数据消费者）为 30 s（[P3-08 子任务 31](../plan/p3/08/subtasks/31-long-test-timeouts.md)）。其余用例沿用默认值。
- 集成测试只为真实接线启动构建与子进程，其余在进程内覆盖：合规 CLI 回归只跑一次真实聚合构建，原版扫描各作用域与 inventory 校验分别由 [scan.test.ts](../../tools/compliance/scan.test.ts)、[distribution.test.ts](../../tools/compliance/distribution.test.ts) 覆盖；构建插件回归在首次真实审计后复用其结果做失败构建。

- 单元测试与源码放在同一目录，命名为 `*.test.ts`，用 Vitest 在 Node 环境运行。
- **测试不得读取原版文件。** 原版格式的测试数据由 `src/original-data/synthetic.test-support.ts` 在代码中生成，内容契约的合成包由 [synthetic-content.test-support.ts](../../src/content/synthetic-content.test-support.ts) 生成；用原版文件做的完整性检查放在 `tools/nob-check.ts`，只在本地运行。工程边界回归会检查 `src/content` 与 `src/original-data` 的测试和 test-support 文件：
  - 只能导入 `vitest`、作为哈希对照的 `node:crypto`，以及这两层自身的模块；相对路径按真实路径解析，不能借符号链接指向别处。
  - 不能使用 `require`、`process`、`vi` 或 `import.meta` 这类绕开 import 声明的加载方式。
  - 文件系统、工具脚本和计算型动态 import 都会被拒绝（P2-01 AC-11）。

  这项检查用于防止无意中读取文件，并不针对刻意混淆的代码。
- **合成生产飞行内容（P3-12）：** 合成生产包须留在飞行渲染器在运行开始时接受的范围内，否则正式流程的开始被拒绝：[flight-data.test-support.ts](../../src/original-data/conversion/flight-data.test-support.ts) 的 `PRODUCTION_SCENE` 的 RENS 设备值按发行数据的次序（+0x1C < +0x20 < +0x24，现为 600、1200、4000），方向光强度在 (0, 1]、环境光非负，闪光级别 0–63 且持续时间有限非零；[production-flight-graphics.test-support.ts](../../src/original-data/conversion/production-flight-graphics.test-support.ts) 与 [production-models.test-support.ts](../../src/original-data/conversion/production-models.test-support.ts) 的受击闪烁阈值与外壳纹理同尺寸、星云 128 × 128、同一动画的爆炸帧同尺寸、部件品质为 1–3，玩家与僚机机体（逃生舱来源）有 3 个第 1 列表部件。各项的依据见 [render 模块说明](./modules/render.md#运行接线与逐-tick-推进)。
- 调色板、图像记录、MFDD 列表、点阵字体与驾驶舱字体目录的源结构读取属于 [source-graphics.ts](../../src/original-data/conversion/source-graphics.ts)，`tools/nob-check.ts` 只负责调度与报告；合成样本覆盖目录顺序与恰为 3 项的约束。
- Ghidra 编译器规范补丁另有标准库 `unittest` 测试：`python3 -B -m unittest discover -s tools/ghidra -p 'test_*.py'`，验证 XML 结构变换、备份与幂等性。
- 运行时测量工具（`tools/baseline/`）的 `unittest` 测试用代码生成的合成 LE 映像、假调试器子进程与临时目录。每个测试模块先导入 `access_guard.py`，它安装审计钩子，使打开或列出 `local/` 及原版文件名的操作失败；`test_boundaries.py` 检查各模块只导入标准库与同目录模块、纯逻辑模块不访问文件、进程或时钟，以及源码中没有嵌入的字节串。
- 工程边界回归的临时项目复制实际配置、链接已安装依赖，结束由 finally 清理，不读取 `local/` 或真实 Ghidra。各 TypeScript 程序共用已安装包声明文件（如 `lib.dom.d.ts`）的解析结果，样本项目只另行解析自身源码；ESLint 样本矩阵按文件合成一次 lint，逐行核对每个样本命中的规则。真实纯模块程序的类型诊断由 `pnpm typecheck` 报告，回归只核对其中没有 DOM/Node 声明。断言失败使 Vitest 非零退出是 Vitest 自身的契约，不另设子进程回归。
- 快速只跑边界回归：`pnpm exec vitest run tools/engineering-boundaries.test.ts`。资源缓存的 DOM-free 逻辑：`pnpm exec vitest run src/platform/storage`；Node 中没有 IndexedDB，也不引入模拟实现，事务、配额、中断与刷新恢复只在浏览器 runner 中验证。不要用测试数量代替覆盖证明；当前证据见 [P1-01 subtasks](../plan/p1/01/goal.md#子任务跟踪)。

### 本地浏览器 runner

[Playwright 配置](../../playwright.config.ts)使用已有兼容 Chrome（channel `chrome`），不自动下载浏览器。需要使用其他已安装 Chromium 时设置 `OSR_E2E_EXECUTABLE` 为其可执行文件。缺浏览器是明确失败，不 skip。运行需要普通 WebGL 2 和原生 headed 桌面能力；完整验收见 [P1-10 goal](../plan/p1/10/goal.md)，bootstrap 通过不代表后续生命周期/渲染验收通过。

- 项目为 development、production、development-headed；单 worker、零 retry、禁止 `.only`，前台/后台顺序运行。不能改为多 worker：[fast-refresh](../../e2e/fast-refresh.spec.ts) 编辑真实源码，共享的开发服务器会把热更新推给所有打开的页面，曾替换并行用例中运行的导入任务 owner。
- **按文件名归属（P2-12 起）：** `*.development.spec.ts` 只在 development 运行，`*.production.spec.ts` 只在 production 运行，二者都不进入只匹配 `native-lifecycle.spec.ts` 的 development-headed；普通 `*.spec.ts` 在 development 与 production 都运行。新用例按此命名，不改配置；较早用例的归属仍由配置中的显式 `testIgnore` 列表维护。
- 开发服务器启动时预先转换页面与导入 Worker 的模块图（`server.warmup`）。Worker 经 URL 载入，不在页面的静态导入图中，否则首个导入任务要等按需转换。
- 自建开发/生产服务器默认为 `http://127.0.0.1:4173`、`http://127.0.0.1:4174`，strictPort 且不复用已有服务器。用 `OSR_E2E_DEV_PORT`/`OSR_E2E_PREVIEW_PORT` 指定不同的空闲端口；不关闭其他进程。
- 每个用例使用隔离 context，runner 收尾自有服务器与浏览器；报告、失败 trace/截图在 ignored 的 `playwright-report/`、`test-results/`，不进入网站或提交。
- **地图 Pointer Lock 隔离入口（P3-05/27）：** `/e2e/entries/map-input.html` 只由开发服务器提供，使用合成内容，不代表真实任务地图路径。headless Chrome 在 HTTP origin 上支持真实 Pointer Lock；`about:blank`/`setContent` 可能因 `WrongDocumentError` 失败。测试钩子经 CDP `Runtime.evaluate` 且 `userGesture: false` 驱动，避免 Playwright evaluate、locator、DOM trace 或截图造成瞬时用户激活、改变自动申请路径。该入口使用独立 `pointer-lock` 资源平衡组，且开发服务器预热按 `./e2e/entries/*.html` 匹配，无需每添入口修改配置。Chrome 155/macOS 26.6 的 CDP 注入鼠标移动在 DPR 1 与 2 下报告 CSS 像素位移；这是注入输入，不是物理鼠标单位实测。完整限制见[地图入口证据](../plan/p3/05/subtasks/27-map-input-entry.md#完成证据)。
- **生产预览的 CSP（P2-11 S-11、技术决定 11）：** [vite.config.ts](../../vite.config.ts) 只让 `vite preview` 发送 [preview-csp.ts](../../tools/preview-csp.ts) 中的严格策略：
  - 策略文本为 `default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`；
  - 不含 `unsafe-inline`、`unsafe-eval`、`blob:`、`data:`、通配符或其他来源；开发服务器的客户端依赖内联脚本，不发送策略；
  - [preview-csp.test.ts](../../tools/preview-csp.test.ts) 核对这些性质，以及只有预览发送策略。

  全部 `production` 项目用例都在该策略下运行。[production-preview.spec.ts](../../e2e/production-preview.spec.ts) 只在该项目运行，核对：
  - 页面与 Worker 脚本的响应都带策略；
  - 导入 Worker 是 `/assets/` 下带哈希的模块脚本，由页面 chunk 的 `new Worker(new URL(…, import.meta.url))` 创建（开发服务器的 `worker_file` 标记在构建中不存在）；
  - 生产尺寸的合成文件得到 `source/unsupported-version`；
  - Worker 脚本返回 404 或 200 的 HTML 时，导入以 `import/worker-start-failed` 结束，Worker 已终止，没有资源包。404 时浏览器自己的加载失败报告不总是出现，出现时才声明。这两个用例在[网络审计](#网络审计)下运行，被页面路由替换的 Worker 脚本请求以 `audit.declare` 声明，预期状态分别为 404 与 200；
  - 菜单、导入页面与任务流程（预置并恢复 `missionPackage()` 后，从介绍、开始配置、出发到飞行、任务菜单与返回主菜单）没有 `securitypolicyviolation`，网络审计没有违规、缺口或外发请求；介绍、配置、飞行与任务菜单中没有开发面板或任何 `dev-*` 元素；飞行中整页只有所有者的一个飞行画布（已命名、已连接、上下文存活，`expectFlightCanvas`；P3-13 起生产构建不再有 2D 地图光标画布），返回主菜单后没有画布；
  - 在隔离 context 中预置生产身份的合成缓存，同源刷新后经菜单恢复、重新校验，模型、图像与布局的像素读回逐字节一致，试听确实启动声音源，返回菜单后音频上下文关闭，整条路径没有 CSP 违规或控制台错误；
  - `dist/` 只有 `index.html` 一个页面。产物与 source map 来源（按 map 所在目录解析为仓库路径）不含测试入口、测试支持与 `e2e/`，不含开发诊断（`src/ui/dev/`）、帧计时（`dev-frame-timing.ts`）、文件保存（`file-save.ts`、`browser-file-save.ts`）与 `app-version.ts`，也不含已退役的合成演示路径；JS 与 HTML 中没有这些模块独有的字符串（如 `mission-dev-panel`、`osr-recording-`、`createObjectURL`）。开发专用的模块经 `import.meta.env.DEV` 之后的顶层动态导入载入，构建时整段剔除；改为静态导入会使 source map 列出 `src/ui/dev/`，该用例即失败（[P3-04/12](../plan/p3/04/subtasks/12-e2e-shell-production.md#完成证据) 的反证）。

  预置支持 [production-cache.ts](../../e2e/support/production-cache.ts) 复用合成 `models` 包、生产身份常量与 P2-10 的记录/键构造函数；`missionPackage()`（P3-04）给出 `mission-startable` 场景作业发出的全部组（每个进程只转换一次），供任务流程的生产用例以 `seedProductionCache(page, await missionPackage())` 预置。它与开发测试入口的 `worker=mission-startable` 来自同一场景作业，规则数据取 `productionRuleData()` 的缺省内容，其中合成玩家机型有足够能量、一个 Warp 成本对与较短的 Warp 过程（基准 14，按距离缩放），可以在应用中完成一次 Warp（[original-data 模块分册](./modules/original-data.md#规则数据转换)，P3-09/22）。Node 侧把转换器版本与来源指纹换成生产配置，经 `applyManifestIdentity` 重新派生合成包的 manifest 身份，再校验完整性与声明预算。可序列化的合成记录交给测试页面，由页面重建 `ArrayBuffer` 并在单个 IndexedDB 事务中写入（P3-11/18 把它拆成 Node 侧的 `seedRecords(converted?, key?)` 与自包含的页面函数 `storeSeed(records)`，行为不变，原生 CDP 目标也能执行后者）；生产页面不载入 `/src/`、开发测试入口或测试支持模块，也不注入应用端口。仅限测试拥有的隔离 context，不接触用户缓存。生产中的运行推进只从任务画面的只读 `data-tick` 与宿主探针观察；实体明细与录制在开发项目中核对。

  探针契约用例的 Worker 因此改由 Playwright 路由在同源路径 `/__probe/*.js` 提供，不用 Blob URL。
  - **SWA 的输入（P5）：** 静态站点的回退（SPA fallback）必须排除 `/assets/*`，缺失的脚本应返回 404 而不是 `index.html`，否则 Worker 载入失败会被 HTML 掩盖；生产响应头应采用同一策略。本地预览的结果不能代替真实 SWA 的回退与响应头实测，后者归 P5。
- **P2-11 测试入口：** 开发服务器另提供 [e2e/entries/app.html](../../e2e/entries/app.html)，以 [app-entry.test-support.tsx](../../src/app/app-entry.test-support.tsx) 挂载生产 `App` 并注入合成端口：查询参数 `worker` 选择导入 Worker 的测试场景（[import-scenarios.test-support.ts](../../src/workers/import-scenarios.test-support.ts) 注册的名称，默认 `models`，另有 `production` 与 `missing`；P3-04 的任务场景 `mission-startable`、`mission-partial`、`mission-load-failed`、`mission-create-rejected` 见 [workers 模块说明](./modules/workers.md)）；`cache=unavailable` 换成没有 IndexedDB 的缓存，`cache=<P2-10 失败码>` 让第一次提交返回该失败；`capacity=insufficient` 让空间检查报告只有 1 KiB 可用；`audio=unavailable` 换成无法创建音频上下文的音频能力；`seeds`（P3-04）为逗号分隔的十进制值（至多 16 个，每个至多 10 位），任务的种子来源按序为每次创建世界的尝试抽取一个，用完后回到 `crypto.getRandomValues`，非 uint32 的值原样交给任务所有者，用于验证开始失败；`hold` 取 `commit`、`list`、`restore` 中一至三项（逗号分隔），这些缓存操作的结果在缓存结算后等待测试用 [app-entry.ts](../../e2e/support/app-entry.ts) 的 `releaseCacheResults` 释放（`heldCacheResults` 计数），用于迟到结果（P2-12 F-12）。预期包配置取该场景的 `scenarioEntryProfile`，并发布为 `window.osrTestEntry.profile` 供用例预置缓存。测试在导航前安装了[响应探针](#响应探针)时，每次提交在开始的同一任务内打开 `commit` 窗口，由用例 `adopt` 后关闭；未安装时行为不变。新增查询键，或超出现有模式的取值，须同时加入 [e2e-network-policy.ts](../../tools/e2e-network-policy.ts) 的 `TEST_ENTRY_QUERY`，否则网络审计把这次导航判为违规；`worker`、`cache` 已接受任意小写连字符名称，新场景名不必改。生产构建只以 `index.html` 为入口，不含它；用例经 [app-entry.ts](../../e2e/support/app-entry.ts) 打开，只在 development 项目运行。
- **P2-11 页面回归路线：** 开发项目的 [import-page.spec.ts](../../e2e/import-page.spec.ts)、[viewer-page.spec.ts](../../e2e/viewer-page.spec.ts)、[cache-recovery.spec.ts](../../e2e/cache-recovery.spec.ts) 与 [fast-refresh.spec.ts](../../e2e/fast-refresh.spec.ts) 分别覆盖导入、查看器、缓存恢复/损坏与生命周期；生产项目走上述严格 CSP 与生产身份合成缓存，不使用开发测试入口。聚焦运行可用 `pnpm test:e2e e2e/import-page.spec.ts e2e/viewer-page.spec.ts e2e/cache-recovery.spec.ts e2e/fast-refresh.spec.ts --project=development`，生产路径用 `pnpm test:e2e e2e/production-preview.spec.ts --project=production`。这些自动化只用合成内容；用户真实界面的操作与证据清单见[本地导入指南](../guides/local-import.md#用户实机核对)。
- **P3-03 版本 4 回归（[P3-03/20](../plan/p3/03/subtasks/20-browser-verification.md)）：** [version-4-viewer.spec.ts](../../e2e/version-4-viewer.spec.ts) 是普通 `*.spec.ts`，在生产预览与开发服务器两个项目中都运行：合成文件在生产预览中只能到 `source/unsupported-version`，所以它按 [production-cache.ts](../../e2e/support/production-cache.ts) 的 `seedProductionCache` 在测试自己的 context 中以生产身份预置版本 4 的合成包，经菜单恢复并重新校验，再在查看器中核对四类新图像与可计时的 `repeat` 声音（[version-4.ts](../../e2e/support/version-4.ts) 的 `LONG_REPEAT`）；导入、保存与刷新恢复的完整流程在开发测试入口的 [viewer-page.spec.ts](../../e2e/viewer-page.spec.ts) 中。两者都在网络审计与资源平衡下运行。聚焦运行：`pnpm test:e2e e2e/version-4-viewer.spec.ts --project=development --project=production`。
  - **画面定位：** [viewer-observations.ts](../../e2e/support/viewer-observations.ts) 的 `bufferPixels` 按 Chrome 的规则定位画面：先把画布位置取整到 CSS 像素，再乘像素比（像素比 2 时 50.25 → 设备行 100，50.5 → 102），不是 round(CSS 位置 × 像素比)；画面区域位于小数 CSS 位置时，旧算法读到相邻的行。像素比 1 时两种算法相同。[joint-pipeline.production.spec.ts](../../e2e/joint-pipeline.production.spec.ts) 的 `framePixels` 仍用旧规则，只在像素比 1 下运行；以后在像素比 2 下使用时宜改用同一规则。
- **P3-04 任务流程回归：** [mission-flow.development.spec.ts](../../e2e/mission-flow.development.spec.ts) 经测试入口导入 01 的任务场景，核对开始资格（没有包、包不完整、载入失败、创建被拒绝与可开始）、完整流程（五种占位结束方式、两种僚机配置、暂停与任务菜单、重开、返回焦点、按住键的 repeat 与尾事件不触发下一页）、缺省标注、离页确认、开发诊断与录制下载；下载的录制在测试进程中以 [replay-check.ts](../../tools/replay-check.ts) 的 `runReplayCheck(录制, 光盘文件, { catalog })` 用同一合成光盘的白名单核对（CLI 始终只用生产白名单）。[mission-flow.production.spec.ts](../../e2e/mission-flow.production.spec.ts) 以 `missionPackage()` 预置并恢复后走同样的流程，并确认生产 DOM 中没有开发面板。逐项结果见 [P3-04/10](../plan/p3/04/subtasks/10-e2e-mission-flow.md#完成证据)。
  - **观察：** [mission-observations.ts](../../e2e/support/mission-observations.ts) 经 `page.evaluate` 读取任务画面根的 `data-owner`、`data-run`、`data-tick`、`data-position`，不启动 Playwright 的主世界脚本（否则资源平衡会多出常驻监听，见[资源平衡](#资源平衡)）；另提供 tick 前进或稳定的页内采样、占位的五种结束方式、按住键、缺省标注读取、离页监听计数、开发诊断读取（`devState`，含玩家视角 `viewMode`/`previousViewMode`）与命令提交，以及 `frameWindow`。P3-09 的地图与 Warp 用例另用 [map-warp.ts](../../e2e/support/map-warp.ts)：Core 的事实取自开发面板（刷新后的状态、实体行与事件日志中四个地图/Warp 事件的逐字段解析）；会话桥接的事实取自任务的 UI store，从任务画面元素的 React fiber 找到组件持有的 store，只调用它的 `getState`/`subscribe`，不写 store、世界或 projection；输入只经可信操作与开发面板自己的命令编辑器（[P3-09/22](../plan/p3/09/subtasks/22-browser-app-verification.md#完成证据)）。
  - **离页确认的取证：** 没有 `dialog` 监听时 Playwright 会自行接受 `beforeunload`，所以用例以 `page.on('dialog')` 应答；取消后 `page.reload()` 会一直等到超时，因此刷新改用 CDP `Page.reload`，关闭用 `page.close({ runBeforeUnload: true })`。确认只在可信点击开始之后、有运行的位置出现（出发、飞行、暂停、任务菜单），介绍、配置、主菜单与 exit 之后不出现；任何意外的对话框都使用例失败。这只证明本机 Chrome 的刷新与关闭路径，不代表所有浏览器、系统快捷键或 BFCache。
  - **聚焦运行：** `pnpm test:e2e e2e/mission-flow.development.spec.ts --project=development`；`pnpm test:e2e e2e/mission-flow.production.spec.ts --project=production`。
- **P3-11 救援、终局与结果页回归：** [mission-result.development.spec.ts](../../e2e/mission-result.development.spec.ts) 只在开发项目运行。合成的 `mission-startable` 任务不能靠输入到达终局，所以 [mission-result.ts](../../e2e/support/mission-result.ts) 在 Node 中替换转换结果的任务与 craft-info payload（[ai-wingman.ts](../../e2e/support/ai-wingman.ts) 的 `withPayloads`：其余 payload 不变，替换的 payload 按 schema、长度与 SHA-256 重新标识），给出与种子无关、由运行自身规则结束的三种变体（`endingPackage`）：`failure`（约 1,400 tick：G-02/5 → G-02/6 → G-02/7 `energy`）、`success`（约 650 tick：G-02/8 `solo`、空总结）与 `success-cutscene`（G-02/8 `wingman` 与 G-02/9，带两条消息的总结）；包经 `seedTestEntryPackage` 以开发测试入口的 profile 预置到测试自己的隔离缓存，再经主菜单恢复，运行中只提交正式输入。观察只读 DOM（`shownPlaceholder`、`shownResult`、`watchPages` 等）与开发面板，导出的录制在 Node 中以 `replayedEnding` 重放并与浏览器结果比较；原生隐藏用例以 `seedRecords` 与 `storeSeed` 在 CDP 自建的上下文中预置。逐项结果见 [P3-11/18](../plan/p3/11/subtasks/18-browser-verification.md#完成证据)。聚焦运行：`pnpm test:e2e e2e/mission-result.development.spec.ts --project=development`（原生隐藏一例以 [native-lifecycle.ts](../../e2e/support/native-lifecycle.ts) 的 `nativeBrowser` 自行启动 headed 浏览器）。
- **P3-12 飞行画面回归（[P3-12/25](../plan/p3/12/subtasks/25-browser-regression.md#完成证据)）：** 渲染器的 API 与已知差异见 [render 模块说明](./modules/render.md#飞行渲染p3-12)。
  - **隔离入口：** [e2e/entries/flight-scenes.html](../../e2e/entries/flight-scenes.html) 只由开发服务器提供（与地图入口相同，不新增测试入口查询键，网络策略不变），载入 [flight-scenes-entry.test-support.ts](../../src/render/flight/renderer/flight-scenes-entry.test-support.ts)：真实 `createFlightRenderer`、以 `FLIGHT_SURFACE` 创建的浏览器 WebGL 2 表面与真实 `wireFlightRun`，由可控的运行句柄 `fakeRun` 交付合成的逐 tick 输入；内容为 [flight-scenes.test-support.ts](../../src/render/flight/renderer/flight-scenes.test-support.ts) 的合成内容（可预测的四边形模型、单色外壳纹理与统一阈值）。`window.osrFlightScenes` 提供 `open`、`start`、`deliver`（null 为静止帧）、`diagnostics`、`resize`、`end`、`close` 与 `reported`。它用于 Core 尚不能产生的状态，例如 P3-11 未接入的被毁视角。
  - **用例：** [flight-scenes.development.spec.ts](../../e2e/flight-scenes.development.spec.ts) 在隔离入口中覆盖背景（星云与星点）、模型光照、受击闪烁、爆炸精灵、屏幕闪光、视角与速度尘埃、被毁视角、Warp 效果、弹丸导弹与碎片，以及尺寸、像素比与生命周期；[flight-render.development.spec.ts](../../e2e/flight-render.development.spec.ts) 在正式流程（测试入口 `worker=mission-startable`）中核对 F1 画面、暂停、resize、上下文丢失与恢复、重开与资源包替换，以及经地图与开发面板命令编辑器的实际 Warp；[flight-render.production.spec.ts](../../e2e/flight-render.production.spec.ts) 在生产预览的严格 CSP 下以 `missionPackage()` 预置核对同一 F1 画面。全部在网络审计下运行。
  - **独立期望：** 期望画面在测试侧按 executable 的规则独立计算，不调用生产渲染实现（用例复用 `src/render/flight/**` 的合成场景与资源夹具，投影、光照、像素与画面判定在 E2E 侧另写）：[flight-pictures.ts](../../e2e/support/flight-pictures.ts)（逻辑画面读回、调色板、星表、星云与投影）、[flight-models.ts](../../e2e/support/flight-models.ts)（光照、色阶、位姿与仿射纹理坐标）、[flight-flow.ts](../../e2e/support/flight-flow.ts)（正式流程的进入与暂停、开发面板的 Flight render 诊断与 F1 背景期望）。读回是页面截图在页内解码，按 `bufferPixels` 的定位规则在每个逻辑像素所覆盖设备像素的中心取样；“画布存在”“非黑”只作辅助。合成生产包开始时玩家行矩阵为单位阵，所以 F1 画面可以独立预测。
  - **观察：** [mission-observations.ts](../../e2e/support/mission-observations.ts) 的 `expectFlightCanvas`（整页恰有一个画布，即飞行画布：已命名、连接、上下文存活；P3-13 移除了生产的 2D 地图光标画布）、`expectFlightCursorWithoutWebGL`（WebGL 2 不可用时没有画布）与 `FLIGHT_SURFACE_LISTENERS`。P3-13 起 F1 画面的世界视口中也有驾驶舱像素：[flight-flow.ts](../../e2e/support/flight-flow.ts) 的 `expectF1Background` 只比较 0–315 行并按驾驶舱元素、仪表矩形与 F1 叠加颜色划出驾驶舱像素。
  - **限度：** 运行中改变设备像素比不能自动验证：CDP 的模拟像素比不触发 `resolution` 媒体查询的 change，而表面只在该事件时读取像素比；像素比 2 在独立 context 中验证。速度尘埃的逐粒子位置与 Warp 线段端点、导弹的逐像素外观与正式流程中的暖态 GPU 相等不在浏览器中断言，分别由 Node 测试与隔离入口覆盖。
  - **聚焦运行：** `pnpm test:e2e e2e/flight-scenes.development.spec.ts e2e/flight-render.development.spec.ts e2e/flight-render.production.spec.ts`。
- **P3-13 驾驶舱、HUD 与地图回归（[27](../plan/p3/13/subtasks/27-browser-cockpit.md#完成证据)、[28](../plan/p3/13/subtasks/28-browser-map.md#完成证据)、[29](../plan/p3/13/subtasks/29-browser-lifecycle.md#完成证据)）：** API 见 [render 模块说明](./modules/render.md#驾驶舱hud-与地图p3-13)。全部用合成包，开发用例以测试入口的 profile 预置并从主菜单恢复，生产用例以生产身份预置并经真实菜单恢复，都走实际装配；变体包只在 Node 中替换转换结果的 payload 并重新标识，只预置进测试自己的隔离缓存。
  - **驾驶舱：** [cockpit.development.spec.ts](../../e2e/cockpit.development.spec.ts) 与 [cockpit.production.spec.ts](../../e2e/cockpit.production.spec.ts) 核对 F1 的框架、带区、雷达环、Warp 灯、叠加与右显示屏，页 0 的 DIAG 打字、页 1、页 2–5 的菜单与 G-03 标注、消息行的滚动与基地页的同一摘要，Warp 的页 6，被毁视角的标签与空的槽 7 消息行，以及屏幕闪光与干扰。期望由 [cockpit.ts](../../e2e/support/cockpit.ts) 只用内容读取器在 Node 中按 hud §4 等原版规则独立写出，不引用渲染器模块；运行事实只经任务画面属性、开发事件日志与 UI store 的 projection 只读取得。
  - **地图：** [map-picture.development.spec.ts](../../e2e/map-picture.development.spec.ts) 与 [map-picture.production.spec.ts](../../e2e/map-picture.production.spec.ts) 核对地图画面（地图调色板、元素与无项目十字光标）、首帧先画后就绪、右键标签与 16 tick 节奏、首次锁定不选点、`m` 与两次 Escape、像素比 2、失焦/解锁/暂停清右键（Δ-09）、E = 0 的项目标记、信息窗越界、旧转换器版本不恢复与几何不符的拒绝。[map-picture.ts](../../e2e/support/map-picture.ts) 在 Node 中以 `cockpitContentOf` 解码同一合成包，用真实地图模块绘制浏览器读到的 Core 确认 `map` 分区作为期望，另有不经地图模块的独立元素检查与负对照。
  - **生命周期：** [cockpit-lifecycle.spec.ts](../../e2e/cockpit-lifecycle.spec.ts)（开发 7 例、生产 2 例）核对单画布、单上下文与单循环（StrictMode、重开与返回）、各运行的资源归还与暖态计数、上下文丢失与布局丢失时撤销就绪凭证与锁定并在恢复后先画后锁、消息不补播、消息队列满与驾驶舱绘制故障、带黑边的屏幕闪光、模块拒绝的内容与释放失败的锁存。[cockpit-lifecycle.ts](../../e2e/support/cockpit-lifecycle.ts) 在页面脚本前安装只读的 WebGL 2 调用记录器：包装 `WebGL2RenderingContext.prototype` 并原样转发，以画布清除切分合成帧，逐帧记录游戏图像上的深度清除、驾驶舱层的绘制及其是否测试/写深度、framebuffer 与深度格式的分配、各上下文与 `pointerlockchange` 时刻，并可一次性注入驾驶舱纹理释放或驾驶舱绘制的故障。其 Warp 深度一例与 28 的回退用例一样不经网络审计（审计不允许测试入口的 `pointerLock` 查询参数）。
  - **聚焦运行：** `pnpm build && pnpm exec playwright test e2e/cockpit.development.spec.ts e2e/cockpit.production.spec.ts e2e/map-picture.development.spec.ts e2e/map-picture.production.spec.ts e2e/cockpit-lifecycle.spec.ts`，或不带 `--` 的 `pnpm test:e2e <文件>`。不要写成 `pnpm test:e2e -- <文件>`：pnpm 把 `--` 原样交给 Playwright，结果运行全部用例（[27 的完成证据](../plan/p3/13/subtasks/27-browser-cockpit.md#完成证据)）。
- **P3-14 飞行音效回归（[22](../plan/p3/14/subtasks/22-browser-audio-output.md#完成证据)、[23](../plan/p3/14/subtasks/23-browser-lifecycle-resources.md#完成证据)、[30](../plan/p3/14/subtasks/30-start-gain-remediation.md#完成证据)）：** API 见 [app 模块说明的飞行音效](./modules/app.md#飞行音效)。全部用合成包与上述音频探针，期望从合成夹具按 audio 的 SND 布局独立解码，不经被测转换器；判定只用上下文状态、时钟、源与连接记录和最终输出的拟合，不以 `start()` 调用代替可听证据。
  - **输出与启用：** [flight-audio.spec.ts](../../e2e/flight-audio.spec.ts)（开发经测试入口导入 `mission-startable`，生产经隔离合成缓存恢复，都在网络审计下）在可信点击开始后核对左右声道按 A-09 的整数音量/声像拟合、引擎变调与静音、导弹一次性的逐帧输出与自然结束、`p` 与任务菜单的暂停保留进度、初始参数在连接之前写入，以及生产没有开发面板；[flight-audio.development.spec.ts](../../e2e/flight-audio.development.spec.ts) 以自建 Chrome（`--autoplay-policy=document-user-activation-required`，原始 CDP，不给激活）核对锁定时无声继续、菜单中启用不继续游戏、键盘 Tab 到“Enable sound”，以及 `audio=unavailable`。
  - **生命周期与资源：** [native-lifecycle.spec.ts](../../e2e/native-lifecycle.spec.ts)（development-headed）核对原生隐藏停止全部发声、可见后不自动恢复；[joint-resources.spec.ts](../../e2e/joint-resources.spec.ts)、[fast-refresh.spec.ts](../../e2e/fast-refresh.spec.ts) 与 [joint-pipeline.development.spec.ts](../../e2e/joint-pipeline.development.spec.ts) 核对每次 Start 恰好新建一个上下文、返回、结果页、重开与 HMR 后上下文已确认关闭且 `audio` 组监听归零（[资源平衡](#资源平衡)）。
  - **未在浏览器中覆盖：** `repeat` 的到达音 10181 在 `mission-startable` 中不可达，由查看器的真实 `repeat` 输出（version-4-viewer）与 Node 规则链覆盖；录制容量停止、故障与关闭失败只由 Node 覆盖。
  - **聚焦运行：** `pnpm test:e2e --project=development --project=production e2e/flight-audio.spec.ts e2e/flight-audio.development.spec.ts e2e/joint-resources.spec.ts e2e/fast-refresh.spec.ts e2e/joint-pipeline.development.spec.ts`；原生隐藏为 `pnpm test:e2e --project=development-headed e2e/native-lifecycle.spec.ts`。
- **P3-15 联合闭环、生命周期与警告回归（[01](../plan/p3/15/subtasks/01-joint-loop-development.md#完成证据)、[02](../plan/p3/15/subtasks/02-joint-loop-production.md#完成证据)、[03](../plan/p3/15/subtasks/03-joint-lifecycle-resources.md#完成证据)、[04](../plan/p3/15/subtasks/04-warning-end-to-end.md#完成证据)）：** 按文件名归属，[joint-loop.development.spec.ts](../../e2e/joint-loop.development.spec.ts)、[joint-lifecycle.development.spec.ts](../../e2e/joint-lifecycle.development.spec.ts) 与 [joint-warning.development.spec.ts](../../e2e/joint-warning.development.spec.ts) 只在 development 项目运行，[joint-loop.production.spec.ts](../../e2e/joint-loop.production.spec.ts) 只在 production 项目运行。四个文件都在网络审计下运行，只用代码生成的合成内容，不读取 `local/` 或原版文件；输入只有页面自身控件、游戏输入区按键与地图光标的受信操作，不用开发命令编辑器，不强制终局，也不写 Core 状态。
  - **变体包：** [joint-loop.ts](../../e2e/support/joint-loop.ts) 的 `jointLoopPackage('success' | 'failure')` 在 Node 中由转换后的 `mission-startable` 合成包替换任务、机型信息、通讯菜单与通讯消息 payload（后两者取 P3-10 合成对接盘的内容），四者都经 [ai-wingman.ts](../../e2e/support/ai-wingman.ts) 的 `withPayloads` 按 schema、长度与 SHA-256 重新标识，每个进程每种变体只构造一次。`success` 经起飞、选目标、射击、地图选基地并 Warp、停靠与离港，到全清的 G-02/8；`failure` 开局即被重合的友机撞毁，救援后两次耗尽能量，到第三次损失的 G-02/7 `energy`。
    - **预置：** 开发用例经测试入口 `worker=mission-startable` 打开（`seeds` 固定种子），以 `seedTestEntryPackage` 按测试入口的 profile 预置；生产用例以 [production-cache.ts](../../e2e/support/production-cache.ts) 的 `seedProductionCache` 按生产身份预置，种子由生产应用自取。两者都在测试自己的隔离 context 中刷新后经 “Open saved resources” 恢复。
    - **重放：** `replayJointLoop(路径, 预置包)` 在测试进程中以 Core 的正式重放重放开发面板导出的录制，经 `compareReplayResults` 与录制自身的结果比较；用例要求 `{ match: true }`，摘要含内容身份、种子、finalTick、事件与检查点数。
    - **其他支持：** joint-loop.ts 另导出受信输入（`pressInZone`、`holdGun`、`requestDocking`、`openLockedMap`、`selectContact`）与页面观察（`awaitPlaceholder`、`holdEnded`、`resultPage`）。[joint-lifecycle.ts](../../e2e/support/joint-lifecycle.ts) 提供变体恢复 `restoreJointVariant`、精简驱动整条运行的 `flySuccess`/`flyFailure`、所有者读数 `ownerProbe`/`expectOwner`/`Checkpoints`（各组监听、帧与两次读数间的循环数、计时器、离页保护、画布、Pointer Lock 与音频）、不追赶检查 `expectNoCatchUp`，以及原生目标的 `NativeBalance`。[joint-warning.ts](../../e2e/support/joint-warning.ts) 的 `jointWarningPackage()` 是另一个独立变体，同样由 `mission-startable` 构造，但只替换任务、机型信息与 AI 程序 payload（不替换通讯内容）：玩家后方一架带一枚制导导弹的 7 类敌机由 Core 自己的 AI 锁定、导弹与咬尾规则先后点亮并解除 `attackerOnTail` 与 `missileIncoming`；`warningTimeline` 在 Node 中重放录制，逐 tick 读出 projection 的 `communications.warnings`；`stripRead` 读驾驶舱类型 9 指示条两段的像素，排除合成槽位中雷达盘面覆盖的像素。
  - **观察：**
    - **joint-loop（development）：** 成功与失败各两条运行（有/无僚机），每步断言任务画面、占位、基地页、结果页与任务 UI store，以及开发事件日志中的正式 Core 事件。开发面板只用于刷新状态、清日志与导出录制。每条运行的录制在 Node 中重放为 `{ match: true }`；结果页 Restart 后新运行从 tick 0 开始。
    - **joint-loop（production）：** 在预览的严格 CSP 下走同样的成功、失败与重试，只经任务画面的只读属性（`data-owner`/`data-run`/`data-tick`/`data-position` 与 `mission-status` 的 `data-phase`）、可见页面、浏览器探针与只读的任务 UI store 观察，没有事件日志或录制。循环的每个页面都断言没有开发面板、`dev-*` 元素、`a[download]` 或名称含 record/export/replay/diagnos 的控件；产物与 source map 扫描仍归 production-preview 与 mission-flow.production。
    - **joint-lifecycle（development）：** 成功一例另核对暂停与继续（不追赶）与地图打开时 tick 继续，失败一例另核对救援衔接保持；两例都核对结果页 Restart、Return 与卸载后各检查点的所有者资源；任意相邻读数之间至多一条游戏循环，菜单终点与同文档基线比较（[资源平衡](#资源平衡)）。第三例为真实隐藏，见下。
    - **joint-warning（development）：** 同一种子在有 Web Audio 与 `audio=unavailable` 下各飞一次，在 0xC 视角下以 `p` 暂停取样，比较同 tick 的 UI store 警告、类型 9 指示条像素与声音消费者（音频探针中的 instrument-9 声部与开发声音日志的决定），以 Node 重放的逐 tick 时间线为准，重放同样要求 `{ match: true }`。
  - **真实隐藏：** joint-lifecycle 的原生一例以 [native-lifecycle.ts](../../e2e/support/native-lifecycle.ts) 的 `nativeBrowser` 自行启动 headed 本机 Chrome（移除后台节流的默认参数），在 CDP 自建 context 的两个标签页间以 `Target.activateTarget` 切换得到真实 `hidden`，变体包以 `seedRecords`/`storeSeed` 预置。需要未锁屏的桌面会话：锁屏或没有可见桌面时窗口一开始就隐藏，该例无法成立，只能在解锁后重跑；不以模拟的 `visibilityState`、无头结果或合成事件替代。
  - **限度：** 重放一致只声明同一代码版本、内容身份与这两个运行时（录制的 Chrome 与重放的 Node）之间，不作跨浏览器逐位一致结论。警告用例只证明信号与状态链路，只覆盖 0xC 视角，“启停”只覆盖音频不可用一种；它不代替 P3-14 V-06 的人耳试听判定。全部只用合成内容，不代表真实内容或实机运行的结果。
  - **聚焦运行：** `pnpm test:e2e e2e/joint-loop.development.spec.ts e2e/joint-lifecycle.development.spec.ts e2e/joint-warning.development.spec.ts --project=development`；`pnpm test:e2e e2e/joint-loop.production.spec.ts --project=production`。每个用例的超时为 10 分钟，单个文件在本机约 2–5 分钟。
- 聚焦运行：`pnpm test:e2e bootstrap.spec.ts --project=development --project=production`。Vitest 仍只发现 src/tools 的 `.test.ts`，不发现 E2E `.spec.ts`；[配置回归](../../tools/e2e-configuration.test.ts)验证类型/lint发现与项目设置（单 worker、零 retry、两个服务器都不复用、经 `/src` 导入的用例只属 development），并对 `--list` 中每个 `*.development.spec.ts`、`*.production.spec.ts` 断言其项目集合恰为对应的单一项目。断言失败、启动失败、端口占用与缺浏览器的非零退出是 Playwright 自身行为，不另设合成配置回归。
- 原生后台已固化在 [native-lifecycle](../../e2e/native-lifecycle.spec.ts)，可用 `pnpm test:e2e --project=development-headed` 独立运行：自管 headed 浏览器、CDP自建context/两tab、移除下文3项disable-background默认参数，取得真实hidden；不可用时保留原始原因并非零，不能合成事件或skip。受管page的hasFocus仍不是原生窗口证据。
  - **P3-04 起的用例：** 经测试入口 `worker=mission-startable` 导入（合成光盘经 CDP `DOM.setFileInputFiles` 选入，真实模块 Worker 导入并保存），之后的操作都是 [native-lifecycle.ts](../../e2e/support/native-lifecycle.ts) 的 `NativeTarget.press`：按可访问名称找到按钮，等它的位置连续两帧不变且为命中目标后再发可信 CDP 点击（另有 `setInputFiles` 方法与等待条件的 `until` 函数）。用例覆盖出发保持中的隐藏（占位等待、计时器撤销、tick 0；返回可见后跳过进入 `paused`/`hidden`）、飞行中的隐藏（自动暂停、无 rAF、无计时器、tick 稳定；返回可见后仍暂停），以及显式 Resume 后不补跑：页面内记录可信点击、该点击请求的首帧时间戳与之后每次显示的 tick，每个显示的 tick 都不超过 ⌊(显示时刻 − 首帧)/31.25⌋ + 1。逐项结果见 [P3-04/11](../plan/p3/04/subtasks/11-e2e-lifecycle-resources.md#完成证据)。
- [WebGL降级](../../e2e/webgl-unavailable.spec.ts)用独立浏览器进程的disable-WebGL flags跑开发/生产；只有该场景允许当前Three.js具体创建失败诊断（逐项记录），其他异常/请求/控件错误仍失败。P3-04 起降级在查看器上核对（WebGL 2 不可用的 alert、没有画布、列表可用、两次进出后帧、观察器与监听都释放），任务流程照常推进：P3-12 起飞行区域为 `unavailable`，以可访问的 alert 说明，没有画布。正常项目中查看器与任务的飞行画面都必须有实际 WebGL2 画面。
- [joint-resources](../../e2e/joint-resources.spec.ts)（P3-04 起）在两个项目中预置并恢复 `missionPackage()`，做三次菜单 → 任务 → 菜单的往返（僚机依次为 0、无、4，每次含任务菜单中的重开），在每个流程位置以帧窗口读取会话监听、计时器、离页保护与帧请求，返回菜单后与同文档基线逐项一致（[资源平衡](#资源平衡)）。P3-12 起所有者存在期间持有飞行表面的 6 个 `render` 组监听（`FLIGHT_SURFACE_LISTENERS`）与一个尺寸观察器，返回菜单后全部释放；画布的 GPU 计数与 `WEBGL_lose_context` 的能力记录另由查看器路径（resource-balance-controls 的干净路径、version-4-viewer 与 fast-refresh 的查看器用例）与飞行用例覆盖；P1 的完整必需测量及本机结果见[04证据](../plan/p1/10/subtasks/04-joint-resource-regression.md#完成证据)。
- **导入 Worker 浏览器测试**（P2-04 AC-08）：[import-worker.spec.ts](../../e2e/import-worker.spec.ts) 在页面内从开发服务器动态导入 `/src/…` 模块，所以只在 development 项目运行，生产项目用 `testIgnore` 排除；生产预览中的 Worker 归 P2-11 验证。
  - 生产入口经平台适配默认载入；测试入口 [import-worker.test-support.ts](../../src/workers/import-worker.test-support.ts) 由 Worker 的 `name` 选择 [import-scenarios.test-support.ts](../../src/workers/import-scenarios.test-support.ts) 注册的作业场景或协议脚本（`top-level-throw` 由入口自身处理）。合成文件在页面内由代码生成，不读取 `local/`。
  - 探针用 Proxy 包装 `Worker` 构造函数（保持 `instanceof` 与原型），并包装 `terminate`。快照的 `workers` 记录入口路径、URL 是否由 Vite 的 Worker 转换生成、类型、名称，以及 `postMessage` 与 `terminate` 的调用次数（不保留消息内容）；注册在 Worker 对象上的监听归入 `worker` 分组。[probe-contract](../../e2e/probe-contract.spec.ts) 在两个项目中证明包装后仍能载入模块 Worker、收发消息与终止。
  - 失败与生命周期（AC-09、AC-10）：测试入口另有四个场景：`busy` 先发送一条进度，再进入只有终止才能结束的同步循环；`job-throws` 让作业抛错；`late-error` 在 `ready` 之后的异步回调中抛出未捕获错误；`top-level-throw` 在模块求值时抛错。抛出的文本都含文件名标记，用于证明它不进入快照、错误与 console。页面内事件日志按顺序记录快照、可信点击、rAF、取消与释放，作为主页面响应与“之后无通知”的证据，不用耗时阈值。开发服务器对不存在的 `.ts` 入口返回 SPA 回退的 HTML（200），模块 Worker 因此载入失败，与生产静态托管的导航回退一致。
  - 图形阶段（P2-05 AC-12）：`graphics` 场景对生产图形与音效结构的合成光盘运行带图形与音频阶段、不转换逻辑组的生产作业，用例核对快照依次经过识别进度、`identified`、`convert-graphics` 进度、空的 `convert-logic` 阶段、`convert-audio` 进度、没有绑定模型的 `convert-models` 阶段，最后 `finished`；光盘还含生产音效表各条目的合成 SND，因此结束时有一个只含图形分区的不完整 `models` 组和一个完整的生产 `audio` 组，用量的转换维度与测试支持给出的期望一致；`graphics-corrupt` 场景以 `source` 层 `invalid-payload` 失败且没有部分结果。页面侧的持有者订阅可设置 `cancelAtStage`，在首个 `convert-graphics` 快照的通知中同步取消，避免与很快完成的合成转换竞争；之后只允许出现帧事件。
  - 逻辑阶段（P2-09）：不另设浏览器用例（P2-09 技术决定 12）。阶段顺序、组发送、预算与失败经宿主、真实 `MessageChannel` 与持有者的 Node 集成测试验证，见 [import-pipeline.test.ts](../../src/app/import/import-pipeline.test.ts)。浏览器用例只随新阶段更新快照序列。
  - 音频阶段（P2-08 AC-08）：`audio` 场景在同一光盘的 `MAIN/SR.NOB` 中加入合成 SND 条目，以合成音效表、不转换逻辑组运行生产作业。用例核对阶段顺序、完整的 `audio` 组、用量为图形与音频转换之和、移交的 payload 长度与描述符一致，并在 Node 中由同一 `audio` 清单与 Node 对同一光盘转换的 `models` 组草稿（`syntheticSource`）重新推导 `ManifestIdentity`，证明与 Worker 内的值相同。
  - 模型阶段（P2-06 AC-10、AC-14、AC-20）：`models` 场景对合成切片光盘运行完整的生产作业，逻辑阶段绑定的五个机体模型在音频阶段之后转换，同一阶段随后转换三个效果 `data` Asset。页面侧在持有者的端口事件外再记录每条收到的 `group` 消息与其清单，因为持有者对不完整组只给出状态与诊断。用例在 Node 中对同一光盘运行同一作业作对照：收到的 `models` 清单等于 Node 的，四个组都为 `group-complete`，持有者移交全部四个组；`models` 组的 Asset 数等于飞行调色板、纹理、绑定模型与效果 Asset 之和，用量等于 Node 的用量。另外，`assets`、`payloadBytes`、`vertices`、`triangles` 与 `imagePixels` 还要等于测试支持按布局给出的图形、音频、模型与效果用量加上收到的逻辑 Asset。`models-corrupt` 场景损坏共用网格，作业在 `convert-models` 以 `source` 层 `invalid-payload` 失败，位置为引用它的首个部件，且没有收到任何组。`cancelAtStage` 设为 `convert-models` 时，在音频阶段之后的首个模型快照上同步取消。
  - 聚焦运行：`pnpm test:e2e import-worker.spec.ts --project=development`。
- **浏览器错误收集**（[browser-test.ts](../../e2e/support/browser-test.ts)）：除页面的 pageerror、console error、失败请求与 4xx/5xx 外，也收集页面所建 Worker 的 console error（Playwright 把它报告在 Worker 上，不在页面上）。
  - 单个用例可以用 `expectDiagnostic(诊断)` 声明必须出现的诊断，写法与收集到的条目完全相同。每项只放行一条完全相同的条目，并记录为 `expected-diagnostic` annotation。
  - 未声明的错误仍使用例失败；声明了却未出现的诊断也使用例失败。判定由 `settleDiagnostics` 完成，[probe-contract](../../e2e/probe-contract.spec.ts) 核对它与 Worker console 的收集。
- [资源缓存](../../e2e/resource-cache.spec.ts)（P2-10）在页面内经开发服务器动态导入 `/src` 模块与合成内容 helper，因此只属于 development 项目（与 browser-replay 一样排除出 production，由[配置回归](../../tools/e2e-configuration.test.ts)固定）：`pnpm test:e2e resource-cache.spec.ts --project=development`。普通用例用隔离 context；刷新恢复用测试自有的临时持久 profile（`launchPersistentContext`，建于系统临时目录，结束后关闭并删除），使数据落在磁盘。[支持模块](../../e2e/support/resource-cache.ts)提供 IndexedDB 探针：默认只观察，不改变行为（事务模式、读写请求、`abort()` 调用、最终事件，以及各连接的 `versionchange` 与浏览器强制 `close`）、按导出常量的只读记录读取（库不存在时不打开，避免创建或升级）与请求记录；不清空或删除用户 profile 的数据。
  - **存储不可用：** 用 `createResourceCache({ indexedDB: null })` 或打开时抛出 `SecurityError`/`InvalidStateError` 的工厂表示能力缺失或打开失败；`storage` 注入同理。注入只表示这些失败形态，不用来证明事务或配额行为。
  - **取消：** 探针的 `onEvent` 在记录事件后、应用自身处理器之前同步运行，用来在写请求发出后或 `complete` 时触发 `AbortSignal`；它不改变请求。
  - **连接生命周期：** 另一连接删除数据库时，适配器空闲则删除不会 `blocked`；有写事务进行中时删除可能先 `blocked`，等该事务完成后成功。CDP `Storage.clearDataForOrigin`（`storageTypes: 'indexeddb'`）会强制关闭连接（`close` 事件）并删除数据，之后列出为空、恢复为 `not-found`。版本 2 的同名数据库由测试直接创建，用来验证 `storage-newer-version`，且库不被修改。
  - **中断：** 在临时持久 profile 中提交旧包后，开始提交带不可压缩 4 MiB payload 的新包，第一个写请求发出后关闭 context，再用同一 profile 重开。第一次按自然时序（通常已提交完）。之后的尝试启用探针的 `holdWrites`：它在该写事务上链式发出只读的 `count()` 请求，使事务保持未提交，而页面主线程保持空闲。它与读事务对应的 `holdReads` 都只延长事务生命周期，不增加任何写入。重开后必须是完整旧包（记录与之前相同）或完整新包。在页面内忙等不可行：控制台信号要等主线程空闲后才送达。
  - **损坏与并发：** 损坏与不兼容通过另一连接按导出常量直接改写已提交的真实记录，属于合成故障注入。改写后用 `readStoredRecords(page, true)` 的精确模式（逐字节列出 payload 记录）证明恢复与列出不删除、不修改任何记录。探针记录 payload 仓库的读取请求，用来证明超出预算的恢复没有读取 payload。并发用两个各持连接的适配器，按页面内 `signature`（各组 Asset ID 与 payload 摘要）判断恢复结果完全等于哪一个已提交候选。
  - **读失败与连接已关闭：** `holdReads` 在恢复或列出的只读事务上同样链式发出只读 `count()`，事务保持未完成时经 CDP 清除，得到原生只读中止与 `read-failed`。`closeNextTransaction` 是默认关闭的一次性故障注入：在下一次原生 `transaction()` 调用前关闭其真实连接，使其抛出 `InvalidStateError`，适配器报告 `storage-closed`；随后的操作重新打开数据库并报告实际状态。
  - **真实配额错误：** 本机 Chrome 154 实测，CDP `Storage.overrideQuotaForOrigin` 只有在会话首次使用 IndexedDB 之前设置才会作用于写入；之后再设置、降低或等待都不生效，重置后写入恢复。`Storage.getUsageAndQuota` 能看到覆盖值，`navigator.storage.estimate()` 始终看不到。因此用例在临时持久 profile 的第一个会话按默认配额提交旧包，重启浏览器后在首次使用前设置覆盖，再提交新包；payload 用不可压缩的伪随机字节，以免磁盘压缩使写入低于配额。覆盖期间，用例断言空间检查的完整结果等于按公式由随即独立读取的 `estimate()` 算出的结果；`sufficient`/`insufficient` 判定边界另把页面中真实 `estimate()` 的快照注入空间检查验证。
- **音频播放**（P2-08 AC-10）：[audio-playback.spec.ts](../../e2e/audio-playback.spec.ts) 在页面内经开发服务器动态导入 `/src` 的生产工厂与 payload 模块，因此只属于 development 项目，由 production 的 `testIgnore` 排除，并由[配置回归](../../tools/e2e-configuration.test.ts)固定。只用代码生成的合成采样。
  - **自管浏览器：** 每个用例自行启动 Chrome，并显式设置 `--autoplay-policy=document-user-activation-required`。本机 Chrome 154 实测，`user-gesture-required` 不会阻止 Web Audio。
  - **无激活的驱动：** Playwright 的 `page.evaluate` 会给页面用户激活，掩盖被阻止的路径。所以页面操作都经 [native-lifecycle](../../e2e/support/native-lifecycle.ts) 的 `NativeTarget` 走原始 CDP `Runtime.evaluate`（不带 `userGesture`），解锁用 CDP `Input.dispatchMouseEvent` 的可信点击；证据记录 `navigator.userActivation.hasBeenActive` 在点击前为 false。
  - **只读探针：** [支持模块](../../e2e/support/audio-playback.ts)的探针：
    - 用 Proxy 包装 `AudioContext` 与 `AudioBuffer` 构造器，记录实例；
    - 把每个接到已记录 `destination` 的连接另外分接到一个 `AnalyserNode`，该节点经增益为 0 的节点接到 `destination`，因此不改变输出；
    - 运行中的上下文用峰值判断有无声音，不以调用 `start()` 或没有异常作为可听证据；
    - 已挂起或已关闭的上下文不再渲染，分析节点保留最后一帧（实测关闭后峰值仍为 0.5）。此时的无输出证据是上下文状态，加上探针记录的“仍接到 `destination` 的应用节点数”为 0（包装 `connect`/`disconnect`）。
    - **声音源（P3-03/20）：** `sources()`（Node 侧为 `audioSources(page)`）给出每个启动的 `AudioBufferSourceNode` 的缓冲采样、循环设置（`loop`、`loopStart`、`loopEnd`），以及每次 `start`/`stop` 调用时的上下文时间与参数；记录在启动时复制，用 WeakMap 找到停止，不强持节点或缓冲，也不注册监听，因此资源平衡不受影响。试听用例按 payload 文档布局独立解码期望的采样，不调用被测的 `readSoundPayload`。
    - **分声道输出与逐发声参数（P3-14/22、30）：** 每个上下文另有一路分接：显式 2 声道、`speakers` 上混的增益节点 → 声道分离 → 左右各一个 4096 帧的 `AnalyserNode` → 增益 0 → `destination`，与应用接到 `destination` 的每个连接并联，不改变输出。探针记录应用节点的连接，在 `start()` 时取源之后的 GainNode（音量、第一与第二声道）与 `playbackRate` 的当时值（`initial`；固定发声没有增益），并列出连接之后才经 `.value` 写入的初始参数（`setAfterConnection`，Chrome 在这种情况下可能读到旧值；为此 `AudioParam.prototype.value` 的 setter 被原样转发并记录写入次序）；源以 `WeakRef` 跟踪到应用 `disconnect()`（`end` 记上下文时间），参数节点同样只弱引用。`capture()` 在同一任务中读出最新上下文两声道的最近窗口、活动声部的当前参数与已启动源数。探针仍不注册监听，也不包装 `setValueAtTime` 等自动化方法。`withAudioTargets` 另有 `path` 与 `audit` 选项（网络审计在导航前接入自建浏览器的标签页）。
    - **静音的判定：** 挂起或关闭后的分析器保留旧窗口，所以无声只以上下文状态、时钟停止、仍连接的源与 `routed()` 为证据，不读分析器峰值。
    - **轨迹：** `beginTrace` 在页面内每 5 ms 采样上下文时间与输出峰值，`finishTrace(until)` 在上下文时间越过 `until` 后才结束（不按挂钟，避免上下文启动慢时截短），`audibleRuns` 把轨迹分成听到的段。`repeat` 声音的遍数按听到的段计数。
    - **循环点插值：** Chrome 对重采样的循环缓冲在循环点做线性插值，结束前最后几帧会向下一遍首帧插值，在预定停止处多出一小段（实测约 40 ms）。用来计遍数的合成声音因此每遍首尾都须静音。
  - **页面隐藏：** 用 `nativeBrowser([自动播放开关])` 启动 headed 浏览器，在 CDP 自建的 context 中开两个标签页，用 `Target.activateTarget` 切换，得到原生 hidden，并记录原生 `visibilitychange` 日志。机器负载均值约 20–30 时，该用例偶发在恢复可见 300 ms 后仍读到挂起前的分析峰值而失败（同一基线提交上 8 次中 5 次），负载回落后通过；按环境时序处理，在低负载下复跑确认，不靠重试变绿。
  - **聚焦运行：** `pnpm test:e2e audio-playback.spec.ts --project=development`。
- 完整执行用`pnpm test:e2e`（当前build＋全部3项目）；失败不能靠重试变绿。正常用例采集pageerror/console/失败HTTP与请求以及UI错误，probe自检的受控异常与WebGL-off诊断只在各自场景逐项记录。自动覆盖、历史HMR/window/DPR/故障证据及其相关差异判断见[07证据](../plan/p1/10/subtasks/07-evidence-docs-alignment.md#完成证据)；源码/构建行为变化后只补失效项，不自动跑源码编辑。

#### P2-12 联合与失败用例

P2-12 的[联合闭环](../plan/p2/12/spec.md#联合闭环)与[失败矩阵](../plan/p2/12/spec.md#失败矩阵)只用代码生成的合成数据。每个用例都在[网络审计](#网络审计)下运行，并用[资源平衡](#资源平衡)核对释放；联合用例另测[主页面响应](#响应探针)。逐项断言与本机结果见各[子任务](../plan/p2/12/goal.md#子任务跟踪)的完成证据。

| 用例 | 项目 | 内容 | 本机耗时 |
|---|---|---|---|
| [joint-pipeline.development](../../e2e/joint-pipeline.development.spec.ts) | development | 测试入口 `worker=canary` 的真实 Worker 转换金丝雀光盘：3 轮导入、自动提交、查看与试听、刷新后恢复，以及从持有的包开始任务到飞行再返回（P3-04 起，不新建 Worker、音频上下文或画布）；另有同文档 3 次往返 | 约 1 min |
| [joint-pipeline.production](../../e2e/joint-pipeline.production.spec.ts) | production | 3 轮：生产尺寸合成文件在真实 `/assets/` Worker 中识别失败（不覆盖生产导入的成功路径）；`seedProductionCache` 只预置一次，刷新后恢复、查看、试听；另有一次缓存恢复后的同文档 3 次查看与试听往返 | 约 1.2 min |
| [failure-input-content](../../e2e/failure-input-content.development.spec.ts) | development | F-01 至 F-10，`FAILURE_MATRIX` 每例一个用例（20 个） | 约 2.2–2.5 min |
| [failure-worker-cancel](../../e2e/failure-worker-cancel.development.spec.ts) | development | F-11、F-12（14 个） | 约 1.5 min |
| [failure-storage-lifecycle](../../e2e/failure-storage-lifecycle.development.spec.ts) | development | F-13、F-14（12 个），含原生 headed 浏览器的真实隐藏 | 连同 fast-refresh 约 1.9 min |

耗时随机器负载变化，全量运行也一样。聚焦运行（`pnpm test:e2e` 先构建；文件名决定项目，不必写 `--project`）：`pnpm test:e2e e2e/joint-pipeline`；`pnpm test:e2e e2e/failure-input-content e2e/failure-worker-cancel e2e/failure-storage-lifecycle e2e/fast-refresh`；设施的控制样本为 `pnpm test:e2e e2e/network-audit-controls e2e/responsiveness e2e/resource-balance-controls`。

- **场景与预期（P2-12/05）：**
  - 测试 Worker 场景都注册在 [import-scenarios.test-support.ts](../../src/workers/import-scenarios.test-support.ts)：作业场景 `IMPORT_SCENARIOS` 与违反协议的 `PROTOCOL_SCRIPTS`，按名首次使用时构造；Worker 测试入口按 `name` 分派（`top-level-throw` 由入口在模块求值时直接抛错），Node 测试运行同一作业。P2-12 新增失败矩阵各例的场景、`canary`，以及时序场景：`hold-<阶段>` 进入该阶段后文件读取不再返回，直到 Worker 被终止；`progress-stream` 持续发送进度；`held-late-error` 发出进度后等页面在 `BroadcastChannel` `LATE_ERROR_RELEASE_CHANNEL` 上发消息，才在作业外抛错。
  - [failure-matrix.test-support.ts](../../src/workers/failure-matrix.test-support.ts) 的 `FAILURE_MATRIX` 为 F-01 至 F-10 每例写定 Worker 场景、文件、预期 `{layer, code, location, limit}` 或组/全包/任务结果，以及持有者结局（`unchanged`、`partial-unsaved`、`complete-saved`）。预期在运行被测代码前写定，[failure-matrix.test.ts](../../src/workers/failure-matrix.test.ts) 在 Node 中、浏览器用例在页面上断言同一张表。
  - [canaries.ts](../../e2e/support/canaries.ts) 组装六个金丝雀：文件名、内容文本、payload 字节标记、payload SHA-256、来源指纹与 manifest 身份。每个标记只为已证明到达的阶段（`input`、`payload`、`cache`）作证，`expectInputArrival`、`expectPayloadArrival`、`expectCacheArrival` 给出证明。开发项目导入 `canaryFiles()`；生产项目导入 `canaryProductionFiles()`，并用 `seedProductionCache(page, await canaryPackage())` 预置。交给审计时写作 `{ name, value: bytes }`。
  - 新增的测试支持只放在 `*.test-support.ts(x)`、测试或 `e2e/` 中，生产模块图不得包含它们（上文 lint 与工程边界回归）。
- **失败用例的做法（08–10）：**
  - **前置：** 每行先持有一个已保存的包：`models` 场景的行先导入切片光盘；`content-invalid` 恢复 `seedProductionCache` 预置的包；其余场景恢复按其包配置用 `seedPackage` 预置的合成包。页面不显示部分包的整包诊断路径，浏览器只核对 “Partial conversion” 与组状态，路径由 Node 断言。
  - **推迟提交：** 测试在自己的连接上对两个缓存仓库开只读事务，并用链式 `count()` 保持它未完成（只用属性回调，探针不计登记），页面之后的 readwrite 事务就会排队，直到测试结束该事务。
  - **真实配额：** 不必用持久 profile：在隔离 context 首次使用 IndexedDB 之前调用 `withQuotaOverride`（CDP `Storage.overrideQuotaForOrigin`），覆盖即对写入生效。`withPersistentProfile` 的页面不能 `audit.attachPage`，因为持久 context 的 `context.browser()` 为 null。
  - **探针与登记：** `installIdbProbe` 在事务、open 请求或连接结束时移除自己的监听，否则资源平衡会把它们计为应用监听。菜单显示失败提示时，React DOM 会在提示的 `<details>` 上登记自己的 `toggle` 监听；这类检查逐条预期恰好这一项。
  - **原生浏览器：** 用 [native-lifecycle.ts](../../e2e/support/native-lifecycle.ts) 的 headed 浏览器时，两个标签页在导航前都以 `audit.attachTarget` 附加，关闭浏览器前对每个目标调用 `audit.close`。“可见但音频仍挂起”的状态由测试侧的 resume 闸门制造：它暂缓真实的 `AudioContext.prototype.resume()`，直到测试放行。
  - **Fast Refresh：** 编辑与还原源码的辅助在 [fast-refresh.ts](../../e2e/support/fast-refresh.ts)，`withEdits` 结束时还原并核对文件，[fast-refresh.spec.ts](../../e2e/fast-refresh.spec.ts) 与 F-14 共用。P3-04 起 fast-refresh 另覆盖：任务 hook（`use-mission-owner.ts`）与任务画面模块（`MissionScreen.tsx`）在飞行中刷新时换成新所有者（ownerId 加 1，回到介绍，同一文档，会话监听恰 3 个且都在旧所有者之后登记），在介绍计时器待触发时刷新只留下新所有者的计时器，已确认的僚机选择保留；外壳（`use-resource-holder.ts`）刷新后回到主菜单、资源包被丢弃，会话监听、离页保护、计时器与帧都为 0；三次菜单 → 导入 → 查看器 → 任务 → 菜单的往返回到基线（见[页面流转与任务生命周期](#页面流转与任务生命周期)）。

#### 网络审计

P2-12 S-06 的实际请求审计：[e2e-network-policy.ts](../../tools/e2e-network-policy.ts) 是纯分类，有单元测试；[network-audit.ts](../../e2e/support/network-audit.ts) 负责采集；[audited-test.ts](../../e2e/support/audited-test.ts) 把二者接成 `audit` 夹具。

- **夹具：** 从 `audited-test.ts` 导入的 `test` 扩展 `browser-test.ts`，`audit` 自动启用。它在首次导航前附加用例的 `page`，先于错误收集建立、晚于其拆除。用例结束时以 `close` 阶段关闭页面，再断言零意外违规、零证据缺口、声明的请求都已出现，并附只含合成数据的摘要 `network-audit`。预览 origin 按生产允许集判定，它读取当前 `dist/` 的文件清单，所以要先构建；其他 origin 按开发规则。接口如下：
  - `canaries(...)`：不得外发的合成标记，至少 8 字节；
  - `declare(...)`：测试有意发出的请求，按方法、路径（字符串或正则）与允许的查询匹配，不得带请求体，`expect` 核对状态码或 `failed`；
  - `expectViolations(...)`、`expectGaps(...)`：只用于控制样本，列出故意造成的违规与缺口；
  - `phase(name)`：标注之后事件的阶段；
  - `attachPage(page)`、`attachTarget(browser, targetId)`：在导航前附加另一个页面，或另一个 CDP 客户端创建的目标；`close(page 或 targetId)`：以 `close` 阶段关闭已附加的页面，并收齐卸载时的流量；
  - `ready()`：等主脚本已经过网络层的 Worker 都被观测到；
  - `serve(url, response)`：只用于控制样本，在浏览器网络层应答；
  - `report()`：当前的分类结果，审计继续；`mode`：`production` 或 `development`。
- **采集：** 两个视图按请求 ID 合并。
  - 页面与专用 Worker（自动附加）各有目标会话，记录发起者、请求头（含网络层加上的 `Cookie`）、CSP 问题、WebSocket 帧、导航与 Service Worker 版本；注入每个文档的钩子报告 cookie 写入与 `register()` 尝试。
  - 浏览器级会话以 `Fetch` 拦截每个到达网络层的请求并原样继续，同时发现新目标。页面关闭时的 keepalive beacon 只有它能看到。

  请求的 `delivery` 分为 `sent`（经网络层发出）、`intercepted`（路由应答或未到网络层）与 `blocked`（发出前被 CSP 等拒绝）。发起者为 `browser` 指只在网络层看到、按框架归属到已覆盖页面的请求，例如关闭阶段的 beacon。
- **Worker 覆盖：** Chrome 在模块 Worker 的主脚本到达后才创建它的目标，Playwright 附加后又立即恢复它，所以审计的会话可能晚于 Worker 的第一个动作。为此，主脚本经过网络层后，浏览器会话会暂停其他非文档请求，直到该 Worker 的会话就绪（至多 3 s）。只有主脚本经过网络层，或脚本被拒因而 Worker 从未运行，这个 Worker 才算已覆盖。
- **规则：**
  - **生产：** 只放行同源、无请求体、无查询串的 `GET`，路径属于候选 `dist/` 的文件清单，资源类型与扩展名相符。以 `declare` 声明的测试请求不受文件清单、查询与资源类型的限制，但同样须同源、无请求体、方法为 `GET`。浏览器自己的 `/favicon.ico` 探测单列为 `known-404`。WebSocket、EventSource、弹窗、cookie、`Cookie` 头与 Service Worker 注册都是违规。
  - **开发：** 只放行同源、无请求体的 `GET`/`HEAD`，并逐条列出入口文档、测试入口、Vite 客户端与预构建依赖、仓库中存在的 `src/` 模块，以及各自允许的资源类型与 Vite 查询键，没有“任意同源 GET”。唯一允许的 WebSocket 是协商 `vite-hmr` 的同源 HMR 连接，它的发送帧只能是 Vite 客户端的 `ping` 或 `vite:invalidate`。测试入口的查询键与取值由 `TEST_ENTRY_QUERY` 列出（`worker`、`cache`、`capacity`、`audio`、`hold`、`seeds`）。
  - **金丝雀：** 在 URL（含 fragment）、请求头、Cookie、请求体、WebSocket 发送帧、cookie 值，以及弹窗、导航、Service Worker 与被 CSP 阻止的 URL 中查找，按原文、百分号或表单解码，以及 Base64（三种字节对齐，标准与 URL 安全字母表）匹配。
- **使用要点：**
  - Chrome 156 在页面首次出声后约 20–300 ms 也会探测 `/favicon.ico`（不只在首次载入时；P3-14/29 以最小静态页复现）。探测没有结果就被导航取消时，它按 favicon 规则是违规，所以开始飞行音效后立即重载或离开的用例须先等审计中多出一个已落定的探测（[mission-flow.development.spec.ts](../../e2e/mission-flow.development.spec.ts) 的 `settleAudibleProbe`，至多等 2 s，不要求一定出现），审计规则本身不放宽。
  - 用例在 Worker 刚启动时就结束它（例如立即取消），须先 `await audit.ready()`；否则 Worker 可能在被观测前结束，成为未覆盖目标。
  - 页面路由（`page.route`）在网络层之前应答。被它应答的 Worker 脚本不会触发上述暂停，Worker 启动时发出的请求可能先于审计会话；只要脚本没有被拒，这个 Worker 就是未覆盖目标。控制样本要覆盖这样的 Worker，改用 `audit.serve`。产品用例用页面路由替换 Worker 脚本时（生产预览的 404 与 HTML 回退，脚本被拒，Worker 从未运行），以 `audit.declare` 声明该请求，并设 `expect: 404` 或 `expect: 200`。
  - F-11 的缺失入口由开发服务器的 SPA 回退以 200 HTML 应答，用例声明这次 GET 并预期 200。
- **控制样本：** [network-audit-controls.spec.ts](../../e2e/network-audit-controls.spec.ts) 在两个项目中证明以下各项都被检出并正确归属：页面 `fetch`、`sendBeacon`（含关闭阶段）、专用 Worker `fetch` 在 URL、头部与请求体中的标记，被动图像、带 fragment 的导航、cookie、弹窗、Service Worker，以及另一 CDP 客户端创建的目标；被 CSP 阻止与实际传出分别判定。[network-audit-controls.development.spec.ts](../../e2e/network-audit-controls.development.spec.ts) 证明 HMR 连接被识别为工具链，非 HMR WebSocket 及其标记帧被检出。控制样本只发往测试路由、浏览器层 `serve`、本机 loopback 接收端或本地服务器，不访问外部主机。
- **能力边界：** 结论限于本候选与实际执行的路径，结合产物的静态出站审阅；不证明未执行的代码或所有隐蔽编码都不外发。审计不改动请求或响应（`serve` 除外），数据只留在测试进程中。以下情况都报告为证据缺口（`complete: false`），不推断为零泄露：
  - Worker 会话就绪前开启的 WebSocket；
  - 由页面路由应答、只见到后续事件的请求；
  - 未经网络层又未被拒的 Worker 脚本；
  - 无法归属发起者的事件、读不到的请求体；
  - 在审计关闭它之前随浏览器一同结束的页面。

#### 响应探针

[responsiveness.ts](../../e2e/support/responsiveness.ts)（P2-12 S-05）：

- **安装：** `installResponsiveness(page)` 须在导航前调用，它在页面脚本之前安装观察 `longtask` 与 `mark` 的 `PerformanceObserver`，对整个文档有效。
- **窗口：** 测试用 `ResponsivenessWindow.open(page, 操作)` 与 `close()` 开关窗口，或用 `measureResponsiveness(page, 操作, action)` 包住一次操作。测试无法精确开始的操作，由页面代码在同一任务里调用 `window.osrResponsiveness.open(name)` 开窗，测试再以 `ResponsivenessWindow.adopt(page, name)` 接管并关闭，测试入口的 `commit` 窗口就是这样。`close` 先等一帧与一个任务，再以一个 `performance.mark` 的送达证明此前的长任务记录都已到达；API 不可用或 2 s 内未送达时报错，不报告 0。刷新会结束窗口。
- **记录：** 操作，窗口起止与耗时，相交的长任务（数量、最长、逐条），帧数与最大帧间隔，以及浏览器、机器、起止可见性与探针/CDP 开销；`attachResponsiveness` 把记录附为 `responsiveness`。
- **输入顺序：** `InputOrder`（I-7）在同一页面顺序里记录可信点击的 `input`/`handled`、帧与导入页的状态变化，`stop` 移除它加入的控件与监听。这些时间只是测试接线，不是性能证据。
- **门槛：** 联合用例要求导入、提交与恢复窗口（生产项目为识别与恢复）的长任务数为 0，即没有超过 Long Tasks API 50 ms 定义的任务。这是本任务在本机的验收选择，不是浏览器保证，也不是 P5 目标设备的性能结论。超标时定位来源，不过滤记录，也不放宽门槛。
- **控制样本：** [responsiveness-controls.spec.ts](../../e2e/responsiveness-controls.spec.ts)（两个项目）：人为阻塞被检出，空闲窗口为 0，API 不可用或记录未送达时报错。[responsiveness-busy-worker.development.spec.ts](../../e2e/responsiveness-busy-worker.development.spec.ts)：繁忙 Worker 运行时，可信点击照常处理，取消同步完成。

#### 资源平衡

[resource-balance.ts](../../e2e/support/resource-balance.ts)（P2-12 S-03）把浏览器探针、音频探针与缓存记录键合成每个文档在菜单上的快照，并逐项列出它与同文档基线的全部差异。

- **探针字段：**
  - [browser-probes.ts](../../e2e/support/browser-probes.ts) 的快照另有 `document`，即每次安装生成的随机文档 ID；
  - `workers[]` 另有 `jobs`（页面发出的 `start` 消息的 `jobId`）、`messages`（Worker 发来的每条消息只留 `type`、`stage`、`jobId` 与探针序号 `at`）与 `terminatedAt`；
  - `listeners[]` 另有 `element`（`'react'` 表示 React DOM 在该元素上登记的非委托监听，否则为 null）与 `detached`（目标已离开文档）；
  - [audio-playback.ts](../../e2e/support/audio-playback.ts) 的 `records()` 给出每个 AudioContext 的状态与每次 `close()` 的结局（`pending`、`resolved`、`rejected`）。Chrome 在调用 `close()` 时就同步把 `state` 设为 `closed`，所以只有已 resolve 的 `close()` 才算已关闭。
  - **单次计时器（P3-04）：** 探针包装 `setTimeout`/`clearTimeout`，`this`、延迟、参数与返回的原生句柄都不变，只记录调用栈属于应用（`/src/` 或 `/assets/`）且处理器为函数的计时器（测试自己的计时器不记录）。快照的 `timers` 给出未触发也未清除的 `pending`（ID 与延迟）、`scheduled`，以及已触发与已清除的 ID；`restore()` 还原原函数。`clearInterval` 不包装，应用不用它清除 timeout。
  - **监听分组：** `keyboard` 组为 window 的 focus/blur、第二个生命周期登记者，以及任务画面（`[data-testid="mission-screen"]`）内元素上的应用监听（输入区 keydown/keyup/focusin/focusout，React DOM 的元素监听在元素进入文档前登记，不会落入）；`pointer-lock` 组为 P3-05 输入消费者的 `pointerlockchange`、`pointerlockerror`、`mousemove`、`mousedown`、`mouseup`；会话宿主的 visibilitychange/pagehide/pageshow 为 `session` 组；P3-14 起任务所有者的飞行声音控制器（`media` 阶段，在关闭屏障的续延中创建）登记的同三类监听为 `audio` 组：探针按任务所有者的固定次序（会话宿主 → `input` 阶段的键盘源 → 音频控制器）给每个新登记取三组中第一个尚无活动回调的组，没有任务所有者时（如查看器）只按登记次序编号（P3-14/23）；任务所有者的离页保护（`beforeunload`）属 `other` 组，而 Vite 客户端自己登记的 `beforeunload` 属 `vite` 组，计数离页保护时排除它。P1 的 `synthetic-view` 分组随合成画面删除。
- **用法：**
  - `ResourceBalance.start(page, testInfo, { packages })` 在已稳定的菜单上取基线；`check(label)` 断言没有差异，`measure` 只报告；
  - 提交后用 `expectPackages([expectedPackage(key, groups)])` 更新期望的缓存包；
  - 刷新前用 `beforeReload` 在旧文档中检查并保存释放证据，刷新后用 `rebaseline` 取新基线，未经 `beforeReload` 时它拒绝；
  - `warm(item, gpu)` 要求同一文档内同一项的暖态 GPU 计数逐轮相等；`attach` 附上全部记录。
  - 比较另含 `timer` 类：基线之后新增或消失的待触发计时器都报告，已触发或已清除的不算；任务流程中只有占位的单次计时器，返回菜单后应为 0。

  默认要求页面装有音频探针（`installAudioProbe`），只在音频不属于用例范围时传 `audio: false`。缺 `WEBGL_lose_context` 的画布只标注“上下文丢失未验证”，其他必需能力缺失直接失败。
- **React DOM 的元素监听：** React DOM 在单个元素上登记的非委托监听（如文件输入的 `invalid`、`<details>` 的 `toggle`）永不移除，在开发中归入 `test` 分组，在生产中归入 `other`。比较时按类型统计仍在文档中的这类监听，随元素离开文档的视为已释放；所以菜单上新出现的元素（如失败提示的 `<details>`）会带来一条新增的 `toggle`。
- **Playwright 的主世界脚本：** Playwright 第一次在页面主世界运行脚本时（`locator.evaluate`、`allInnerTexts`、`allTextContents`、元素截图、`boundingBox()`、`check()` 等），会在 `window` 上登记一组常驻的捕获监听，探针把它们计入 `test` 分组。基线须在这之后取：[joint-pipeline.development.spec.ts](../../e2e/joint-pipeline.development.spec.ts) 的 `settleTooling` 先做一次 `locator.evaluate`。也可以在受检查的文档中改用 `page.evaluate` 读取，用 `page.screenshot` 加裁剪读像素。
- **控制样本：** [resource-balance-controls.spec.ts](../../e2e/resource-balance-controls.spec.ts)（两个项目）故意泄漏监听、观察器、持续 rAF、未终止的 Worker、未关闭的 AudioContext、待触发的计时器与 `beforeunload` 监听，每类只报告对应的问题；已触发的计时器作为干净样本不报告。另有一条干净路径（识别失败的导入、缓存恢复、三轮查看与试听、一次任务飞行与返回），每步都与基线一致。

## 正式 Runtime

- [game-runtime.ts](../../src/app/runtime/game-runtime.ts) 是正式 Core 唯一的 Runtime（P3-04 S-01，契约见 [spec：Runtime](../plan/p3/04/spec.md#runtime)），API 见 [app 模块说明](./modules/app.md#正式-runtime)。每个运行一份，由[游戏会话](#会话端口与错误)创建与持有，不直接拥有浏览器帧循环。复用 P1-04 的 [fixed-step-clock.ts](../../src/app/runtime/fixed-step-clock.ts)（锚定、补跑上限、alpha）与 [runtime-errors.ts](../../src/app/runtime/runtime-errors.ts)，帧后事件由 [game-event-bus.ts](../../src/app/runtime/game-event-bus.ts) 分发。P1 的合成 Runtime 已退役（[R3](./source-structure.md#r3-合成-runtime)）。
- **时间：** 只用 Core 的默认步长（64 ÷ 2 = 32 Hz），不另设频率。调用者向 `frame(nowMs)` 提供单调不减的毫秒时间戳，首帧只锚定；每帧至多 5 tick（`MAX_TICKS_PER_FRAME`），超出的部分丢弃且该帧 alpha=0。宿主时间不进入 Core。
- **输入：** 连续意图 `{ axes, primaryFire }` 跨帧保持，直到再次设置或被清除。组批时，`primaryFire` 为真或自上次成功 step 以来曾由假变真，就加入一个主炮 `fire` 命令，所以按住期间每 tick 一个，两 tick 之间的短按也保留一次，不读 OS 自动重复。单次请求（如导弹）是普通命令：`submitCommand` 按公开的 `readTickInput` 规则校验并保存副本，返回从 1 起的 commandId；待执行队列上限 256（`COMMAND_QUEUE_LIMIT`，满时 `command-queue-full`），每 tick 至多 `CORE_LIMITS.commandsPerTick`（64）个（自动开火占一个名额），按 FIFO 顺延，非法或满队列的提交什么也不改变。0 tick 帧不消费队列或短按标记。
- **输出：** 帧末按 tick 与发出次序分发冻结的事件与 `{ commandId }`：只有已提交命令的 `command-result` 带 ID，自动开火与非命令事件为 null；关联按每个 tick 自己的批次。监听器只能同步；抛错时本批其余接收者照常收到，帧末报 `listener-failed`，已提交的 tick 不回滚。每个成功 step 后同时取得同 tick 的 projection 与 Render State，全部成功才一起更新缓存；`projection()` 在两次成功 step 之间是同一对象，`renderFrame()` 给出本运行最近两份 Render State。暂停、保持、停止与故障时读模型折叠为最后一组完整缓存（previous=current、alpha=0）。
- **故障与录制容量：** Core 故障或 Runtime 内部错误使 Runtime 故障：本帧事件都不投递，读模型保留最后完整的一组（可能早于故障点），`snapshot()` 与 `exportRecording()` 抛出该故障；当前抛错的 step 已可能执行的命令记为 `unconfirmed`，仍在队列中的确定未执行。录制容量不足（Core 以路径 `recording` 的 `CoreInputError` 拒绝）不是故障：只拒绝该 tick，本帧此前成功的 tick 照常投递，报告 `stop: 'recording-capacity'`，之后的输入与帧都被拒绝，快照与录制仍可读取。逐项规则见 [spec：失败帧与录制容量](../plan/p3/04/spec.md#失败帧与录制容量)。
- **生命周期操作：** `resetClock`、`clearIntent`（清意图与短按标记，返回队列中确定未执行的 FIFO ID）、`foldRenderState`、`clearSubscriptions` 只由会话在帧外调用，帧内调用抛 `reentrant-call`；它们不改 Core、RNG、实体 ID 或录制。
- **录制：** 运行规格带 `RecordingOptions` 时用 `createRecordingSession`，否则用 `createWorld`。开发构建默认从 tick 0 录制，检查点间隔 32，`producer` 为应用名、版本与构建模式；生产不录制（见[开发诊断与录制导出](#开发诊断与录制导出)）。录制只含实际执行的输入、事件与检查点，不含宿主时间、暂停、保持、运行 ID 或取消的命令。
- **测试：** Node 测试运行真实正式 Core 与合成任务（[create-world.test-support.ts](../../src/core/world/create-world.test-support.ts)）；故障只在测试文件中以顶层 `vi.mock` 替换创建边界注入（这些文件由 Vitest 的 isolated 项目运行），不向生产接口加入后门。commandId 耗尽只经代码审查确认。
- **针对性检查：** Runtime 与会话 `pnpm exec vitest run src/app/runtime src/app/session`；全部 Core 与边界回归 `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`；任务载入（P2-09）`pnpm exec vitest run src/core/mission`。完整检查仍为 `pnpm check`。

## 会话端口与错误

- [session-host.ts](../../src/app/session/session-host.ts) 是 app 的 DOM-free 调度/生命周期端口。回调在请求返回非负安全整数句柄之后异步交付（0 合法）；注册失败由宿主回收未交给调用者的部分资源。取消和所有通知均同步返回 undefined。
- [browser-session-host.ts](../../src/platform/browser/browser-session-host.ts) 在 platform 提供真实 rAF 与 visibilitychange/pagehide/pageshow，无导入副作用或独立循环。每份订阅拥有三个监听，撤销逐项尝试且幂等，部分注册失败先回滚再抛错。只用 app 的 DOM 类型检查；不要导入当前 Node 测试程序或给 Core 加 DOM。
- [session-errors.ts](../../src/app/session/session-errors.ts) 定义 `GameSessionError`：`invalid-argument`（带路径与原因）、`invalid-state`（带操作、phase、runId 与原因）与 `operation-failed`（有序的 runtime/scheduler/consumer/cleanup/control 失败项）。错误冻结副本与条目，但不冻结原异常；`onError` 不接受 Promise。[rollback-error.ts](../../src/app/session/rollback-error.ts) 的 `RollbackError`（`AggregateError` 子类，`cause` 为原始失败，`errors` 依次为原始失败与回滚失败）表示初始化回滚也失败；回滚成功时原样抛出原始原因。
- [game-session.ts](../../src/app/session/game-session.ts) 是正式游戏会话（P3-04 S-02，契约见 [spec：会话](../plan/p3/04/spec.md#会话)），API 见 [app 模块说明](./modules/app.md#游戏会话)。它沿用 P1-05 的控制器契约，差异如下：
  - **开始：** `createGameSession(host, onError)` 创建 idle 控制器，只订阅一次宿主。`start` 只在 idle 接受，带运行规格（三份逻辑 Asset、同包的 craft-info 与规则数据输入、运行可实例化机体的模型、内容身份、运行配置、录制选项与初始出发保持），校验并复制后创建唯一运行；没有 restart，重开是 exit → 配置 → start。世界创建的拒绝以 `invalid-argument` 抛出（路径 `control.spec…`，原错误为 cause），会话保持 idle。
  - **状态：** phase 增加 `transition`（只用于初始出发 G-02/2：tick 0、无帧请求、无输入、读模型折叠）与 `stopped`（录制容量，不是任务失败）。`complete-departure { runId }` 对当前运行只生效一次，过期或重复的以 `invalid-state` 拒绝；保持期间 hidden 或 pagehide 锁存 `resumeRequired`，结束保持后只进入 paused（hidden），必须显式继续。
  - **暂停与隐藏：** 隐藏或离页自动暂停并清除意图与队列，折叠读模型，停止循环；pagehide 独立阻断，返回可见不自动继续。显式 resume 的首个回调只重新锚定，不补跑暂停时长；任务菜单是同一种用户暂停。会话不读取 Core 状态来决定是否暂停。
  - **输入：** `setIntent` 与 `submitCommand` 只在 running 可用，其他状态明确拒绝且不分配 commandId。`clear-input`（原因 `focus-loss`、`pointer-lock-exit`，供 P3-05）清除意图、短按标记与未执行命令并逐个通知取消，不暂停、不重新锚定；在 paused 与 transition 为空操作。
  - **唯一循环与通知边界：** 一个控制器至多一个有效帧请求，迟到或重复的回调不推进；rAF、同步控制及宿主通知各构成一个通知边界，域事件 → 帧消费者 → 边界内排队的控制（FIFO）→ 状态/错误，状态通知允许为新运行接线、禁止控制，取消、错误与清理回调只读或撤销。
  - **取消与结果不明：** `onCommandsCancelled` 的冻结 FIFO ID 只列确定未执行的命令，原因为 user-pause、hidden、transition、focus-loss、pointer-lock-exit、recording-capacity、exit、dispose 或 failure；故障中结果不明的 ID 只在 `status.error` 的 `GameRuntimeError`（`unconfirmed`）中。
  - **故障与停止：** faulted 后不再提供新的快照或录制导出（已取得的冻结副本仍有效），不能 resume，只能 exit 后重新 start；stopped 保留录制供导出，直到 exit 或 dispose。`ownCleanup` 同步逆序、至多尝试一次；清理失败置 `cleanupFailed` 并在控制器生命期内锁存，之后不能再 start。
  - **错误归类：** Runtime 的 `listener-failed` 提升为 consumer 故障，时间、读取、请求与取消失败为 scheduler（取消失败另置 `cleanupFailed`），Core 故障为 runtime，资源与订阅释放为 cleanup，排队控制的失败为 control。异步边界的错误汇总后交 `onError` 一次，剩余消费者与独立清理继续。
- **测试支持：** 手动驱动的 `ControlledHost` 在 [session-host.test-support.ts](../../src/app/session/session-host.test-support.ts)，正式会话的组合在 [game-session.test-support.ts](../../src/app/session/game-session.test-support.ts)。[game-session-replay.test.ts](../../src/app/session/game-session-replay.test.ts) 证明经过出发保持、暂停、隐藏、任务菜单、按住开火、命令顺延与清输入后，录制 JSON 往返的 replay 与全部检查点一致；[game-session-pause-timing.test.ts](../../src/app/session/game-session-pause-timing.test.ts) 是 R-13 控制子集的 Node 证据（五种暂停途径 × 四种长度：暂停期间不执行 tick，继续首帧为 0 tick）。

### 浏览器生命周期复现

常规验收运行[本地浏览器 runner](#本地浏览器-runner) 的 [native-lifecycle](../../e2e/native-lifecycle.spec.ts)，它按下一节的路线自动完成。需要人工复现时：

1. 端口空闲时启动自有 `pnpm dev --host 127.0.0.1 --port 5173 --strictPort`，在独立的 Chromium profile 或 context 中打开 `http://127.0.0.1:5173/`，导入自己的本地数据或恢复已保存的完整包；只用代码生成的内容时，打开测试入口 `/e2e/entries/app.html?worker=mission-startable`，把 [import-scenarios.test-support.ts](../../src/workers/import-scenarios.test-support.ts) 的 `scenarioFiles('mission-startable')` 在 Node 中生成的 CloneCD 文件组写到临时目录后选入，用完删除。不改 App/main，不操作用户的其他站点数据。
2. 从主菜单 `Start mission`，跳过介绍，选择僚机后 `Start`，跳过出发进入飞行。只读取任务画面根（`data-testid="mission-screen"`）的 `data-owner`、`data-run`、`data-tick` 与状态栏（`mission-status` 的 `data-phase`、`data-pause`）；开发构建另可在诊断面板刷新快照。不写 Core，也不调用内部入口。
3. `Pause` 后跨实际 rAF 观察 tick 不变；`Resume` 后首帧为 0 tick，之后前进。任务菜单期间 tick 不变，按键不能旁路继续；`Restart mission` 得到新的 run（`data-run` 加 1），出发时 tick 为 0；返回主菜单释放所有者。
4. 切到另一实际标签页或窗口，再返回。记录实际 `document.visibilityState` 的变化与 hidden 时、返回时的状态栏与 tick：应为 hidden → visible，自动 paused（hidden），返回后仍暂停且 tick 不变，只有显式 `Resume` 才继续。可以单独注册 visibilitychange 观察监听存入自有数组，以便返回后检查；记录时与会话宿主的三个监听分开计数。
5. 浏览器事件探针可派发 pagehide/pageshow 验证适配绑定与离页阻断，但这不是实际 hidden 或 BFCache 证据。工具若所有标签页持续 visible，该判据保持 blocked；不能覆盖 getter 或使用合成事件代替。
6. 返回主菜单后，会话宿主的 document visibilitychange、window pagehide/pageshow 与离页保护的 `beforeunload` 各撤销一次，迟到的旧回调不产生通知。移除自有探针与额外观察监听，关闭自有 context，停止自有服务器；不清站点全部数据。P1-05 合成会话的实测结果与工具限制见 [P1-05 浏览器证据](../plan/p1/05/subtasks/07-browser-lifecycle-evidence.md#完成证据)，正式会话见 [P3-04/11](../plan/p3/04/subtasks/11-e2e-lifecycle-resources.md#完成证据)。

#### 已验证的 CDP 自动化路线

普通 Playwright 页面切换持续报告 visible 时，可使用已有工具的 Playwright/CDP 能力创建独立 context，而不是伪造 visibility。2026-10-02 已通过 VS Code 的 `runPlaywrightCode` 在外部 headed Chromium 154.0.8037.95 / macOS 验证该路线；VS Code 是执行入口，不是浏览器引擎或必需的唯一工具。普通页面路线失败的具体原因尚未确认。[native-lifecycle](../../e2e/native-lifecycle.spec.ts) 以 [native-lifecycle.ts](../../e2e/support/native-lifecycle.ts) 自动化同一路线。

1. 选择本机已有兼容 Chromium 二进制，以 `browserType().launch()` 启动自有浏览器；本轮使用 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，`headless:false`、`args:['--enable-automation']`，并用 `ignoreDefaultArgs` 移除 `--disable-backgrounding-occluded-windows`、`--disable-renderer-backgrounding`、`--disable-background-timer-throttling`。不下载浏览器或新增项目 runner。
2. 用 `browser.newBrowserCDPSession()`，通过 `Target.createBrowserContext` 取得自有 `browserContextId`；在此 context 用 `Target.createTarget` 创建探针页和另一标签页。不要用普通 `browser.newContext()` 页面未触发 hidden 的结果冒充该路线通过。
3. 用 `Target.attachToTarget({targetId,flatten:false})` 取得探针页 session，通过 `Target.sendMessageToTarget` 发送 `Runtime.evaluate`，按 sessionId/消息 ID 接收 `Target.receivedMessageFromTarget` 的结果；明确检查协议错误和 exceptionDetails。探针页先导航到固定 Vite origin，按上一节进入任务飞行（文件经 `DOM.setFileInputFiles` 选入，按钮用可信的 CDP 点击），再安装只读观测，不能在 data URL 的能力预检上宣称 Runtime 已通过。
4. 用 `Target.activateTarget` 激活探针页，确认原生 visible 且 tick 前进；激活另一标签页，确认原生 hidden、自动 paused 与稳定 tick；再次激活探针页，确认 visible 后跨真实 rAF 仍 paused/tick 不变，再以可信点击显式继续，验证首帧重锚与后续推进。记录原生 visibilitychange 日志；不使用合成事件、visibility getter 替换或强制生命周期命令。
5. 先返回主菜单释放任务所有者、撤销自有探针和包装，再用 `Target.disposeBrowserContext` 关闭自有 context、关闭自有浏览器/入口页并停止自有 Vite。只清理本轮拥有的资源，不关闭用户 profile 或其他项目的浏览器/服务器。

2026-10-02 P1-06 浏览器验收补充的工具约束（同一机器与工具）：

- `runPlaywrightCode` 的各次调用之间不保留全局变量。在一次调用中 `launch()` 的浏览器，调用结束后会失去句柄。因此真实 hidden 场景要在同一次调用内完成启动、驱动和 `finally` 关闭；若句柄已丢失，按自建的临时 profile 核对进程后，按 PID 停止。
- 跨多次调用的非 hidden 检查，可在 shell 中以临时 `--user-data-dir` 和 `--remote-debugging-port` 启动自管 Chrome，每次调用用 `connectOverCDP` 重连。但在本环境中，这样启动的 Chrome 无论切换标签页还是最小化窗口，都始终报告 visible（`hasFocus()` 也始终为 true），原因未确认，不能用来取得 hidden 证据。
- Playwright 的 `waitForFunction` 与 locator 等待默认用 rAF 轮询，会计入包装 `requestAnimationFrame` 的探针。测量待交付帧请求时，应只在页面内基于定时器的窗口里读取，并先重置最大值。
- `context.addInitScript` 随本次连接注册；重新连接后若要重载页面并保留探针，需要在同一次连接中再次注册。
- 2026-10-02 P1-07 补充（Chrome 154.0.8037.95 / macOS，shell 启动的临时 profile + `connectOverCDP`）：只改变 `Emulation.setDeviceMetricsOverride` 的 `deviceScaleFactor`（CSS 宽高不变）后，`devicePixelRatio` 与 `matchMedia(...).matches` 会变，但 `MediaQueryList` 的 `change` 事件要等媒体查询重新求值才派发。每次改 DPR 后交替发送 `Emulation.setEmulatedMedia({media:'screen'})` 与 `{media:''}`（对普通页面同义）即可触发 Chrome 自己派发真实的 `change`；连续发送相同值不会再次求值。这不是合成事件或 getter 替换，但只证明仿真路径，真实多显示器 DPR 切换仍归 P5。


## UI 投影与指令反馈

P3-04 的正式 UI 层位于 `src/ui/game/`，契约见 [spec：UI 桥接与命令反馈](../plan/p3/04/spec.md#ui-桥接与命令反馈)，附着与时钟规则沿用 [P1-06](../plan/p1/06/spec.md)；API 见 [UI 模块说明](./modules/ui.md#游戏-store桥接与命令反馈)。它不创建会话、宿主、rAF 或定时器，只消费会话的公开通知；P1 的合成 UI 层已退役（[R6](./source-structure.md#r6-合成-ui-层)）。

- **store：** 每个任务所有者一个 Zustand vanilla store（[game-store.ts](../../src/ui/game/game-store.ts) 的 `createGameStore(ownerId)`），状态为会话状态、projection 采样、流程位置、待确认命令与最近结果、操作错误与会话错误。React 只拿到只读 `reader`，经 [use-game.ts](../../src/ui/game/use-game.ts) 的 `useGame(reader, selector)` 订阅单个标量或稳定切片；写入者只有桥接、命令反馈与所有者的装配，每次转换单次原子写入，状态冻结，无变化时不通知。
- **桥接：** [game-session-bridge.ts](../../src/ui/game/game-session-bridge.ts) 的 `createGameSessionBridge({ store, clock, consumers })` 在开始前 `bind` 所有者的会话（只读 `status`、`currentRun`、`onStatus`），之后自动附着每个新运行；`bridge.onError` 作为创建会话时的错误出口，只写 sessionError。
  - 会话状态、新运行，以及暂停、保持、停止的静止边界立即写入；常规 projection 在既有帧通知中按 100 ms 采样，按 ownerId、runId 与 tick 去重，不另开定时器。`mission.status`、`player.interactionContext`、各分区的就绪状态与结果内容，以及 P3-09 的地图关键状态（地图开/关/无玩家、已提交的目的地与标记、`warpRequest` 的结果或原因、Warp 视角 1 与其过程序号）在帧末立即发布，按这些字段比较而不是按每 tick 新建的对象引用；地图光标（hover）与读数按采样发布。
  - 采样时钟由装配层注入（浏览器为 `performance.now`），必须是有限且不倒退的毫秒值；读取失败或非法值在帧监听器中抛出，由会话记为 consumer 故障。附着发生在状态通知内时，失败延到该运行的下一帧报告，避免状态监听因抛错被移除。
  - 附着是事务性的：运行级消费者每完成一项注册就交出撤销函数，任一注册失败时逆序撤销并重新抛出，撤销也失败时为 `RollbackError`。一个桥接只服务一个会话，成功绑定后 `unbind` 即终止。
- **命令反馈：** [game-command-feedback.ts](../../src/ui/game/game-command-feedback.ts) 的 `createGameCommandFeedback(store)` 是桥接的运行级消费者，`submit(command)` 经当前运行提交，拿到 commandId 后才记为 pending，同步失败写 actionError 并返回 null。结果按 ownerId、runId 与 commandId 匹配：本消费者命令的 `command-result` 给出 accepted、rejected 或 ignored 与原因，并与帧末最新 projection 同次写入，不先乐观更新；会话取消记为 cancelled 并保留原因；运行故障时仍未终结的记为 unconfirmed（`session-failed`），不自动重提。未知、重复、其他消费者或 null 的 ID 不产生结果；最近结果保留 10 个，运行结束时清空。
- **范围：** 桥接只供 React 页面使用。Classic 飞行 HUD 将由渲染器每帧直接读取运行的 projection，不经 store（[总计划 §5](../plan/master-plan.md#5-状态管理与通信约定)）。接线见下文[页面流转与任务生命周期](#页面流转与任务生命周期)。
- **测试：** [game-ui.test-support.ts](../../src/ui/game/game-ui.test-support.ts) 组合真实会话、`ControlledHost`、可控时钟与记录监听器的会话包装，用来重放旧运行的通知；尚无规则的 accepted/ignored 等分支用通知替身验证，不修改 Core 规则。针对性检查：`pnpm exec vitest run src/ui/game`。

## 开发诊断与录制导出

P3-04 S-07（[spec：开发诊断](../plan/p3/04/spec.md#开发诊断)），API 见 [UI 模块说明](./modules/ui.md#开发诊断)与 [app 模块说明](./modules/app.md#开发帧计时)。

- **只在开发构建：** Vite 开发服务器（含测试入口）的任务画面才有诊断面板。帧计时、诊断、面板与浏览器文件保存都在 `import.meta.env.DEV` 之后以顶层动态 `import()` 载入，生产构建在编译期剔除它们，生产的录制选项为 null；[production-preview](../../e2e/production-preview.spec.ts) 核对生产 DOM 与产物中都没有它们（[本地浏览器 runner](#本地浏览器-runner)）。不要改为静态导入：Rolldown 会保留这些模块顶层的冻结调用与命令表单数据，source map 随之列出 `src/ui/dev/`。
- **帧计时：** [dev-frame-timing.ts](../../src/app/mission/dev-frame-timing.ts) 的 `createFrameTiming(host, clock)` 包装所有者的会话宿主，在会话处理一次有效帧的前后各读一次单调时钟：窗口包含 Runtime 的模拟、帧后事件与帧消费者，不含等待下一个 rAF 的时间。时钟抛错、非有限或倒退时给出失败通知，从不记为 0 ms。它不是 GPU 或显示器耗时，没有通过阈值，也不另开循环。
- **诊断：** [mission-diagnostics.ts](../../src/ui/dev/mission-diagnostics.ts) 的 `createMissionDiagnostics({ timing, fileSave })` 是所有者级的 `ui` 消费者，每个新运行清空：
  - 事件日志保留最近 500 条结构化摘要与 commandId，超出时丢弃最旧的并显示已截断；
  - 声音日志（P3-14/18）以同一 500 条窗口保留本所有者、本运行的音效决定（`recordSound` 接收音效消费者的 `record`），字段见 [UI 模块说明](./modules/ui.md#开发诊断)，不含 PCM、名称或坐标；
  - 帧统计保留最近 120 个 `{ processingMs, ticks, capped }` 样本，给出平均与最大处理时间、tick 数与触顶帧数；
  - 实体与任务状态只在点击刷新时读取一次 Core 快照，名称只显示引用；
  - 命令编辑器可填写任一 Core 命令变体，按 `readTickInput` 规则校验后经命令反馈正常提交，尚无规则的命令得到 `not-implemented`；
  - 录制导出在通知边界之外同步取得同一成功 tick 的 `Recording`，以紧凑 JSON 经平台文件保存下载，文件名为 `osr-recording-<setupHash>-<种子>-<finalTick>.json`。`requested` 只表示浏览器接受了下载请求；保存失败保留这份副本以便重试；faulted 不提供新导出，stopped 仍可导出。

  这些窗口是开发显示的选择，不是性能或玩法阈值。变化按 UI 的采样间隔发布，状态变化、停止、计时失败与用户操作立即发布；诊断不进入录制、Core 状态或 RNG。
- **面板：** [MissionDevPanel.tsx](../../src/ui/dev/MissionDevPanel.tsx) 用原生控件，按区块分别订阅，不注册全局键盘监听。重开、返回与 HMR 不自动导出，面板提示这些操作会丢弃未导出的录制。E2E 读取的 `data-testid` 有 `mission-dev-panel`、`dev-entities`/`dev-entity`（`data-entity-id`、`data-kind-bit`、`data-source`）、`dev-log`、`dev-sound-log`（`li` 带 `data-result`、`data-sound`）与 `dev-sound-log-count`、`dev-frames`、`dev-command-type`、`dev-command-submit`、`dev-results`（`li` 带 `data-command-id`、`data-outcome`、`data-reason`）、`dev-recording-export`、`dev-recording-retry` 与 `dev-recording-status`（`data-status`），以及 P3-12 的 `dev-flight-refresh`、`dev-flight` 与 `dev-flight-<名称>`（`state`、`run`、`draws`、`last-tick`、`gpu`、`resources`、`buffer`），P3-13 的 `dev-cockpit-refresh`、`dev-cockpit` 与 `dev-cockpit-<名称>`（`messages`、`messageDrops`、`radarNoiseDropped`），没有运行的驾驶舱时为 `dev-cockpit-none`。
- **录制：** 开发装配传 `developmentRecording(appProducer(import.meta.env.MODE))`，检查点间隔 32，`producer` 如 `open-star-rangers 0.0.1 development`。[app-version.ts](../../src/app/app-version.ts) 的名称与版本是手写常量，须与 `package.json` 一起更新：导入 `package.json` 会使开发页面请求 `/package.json`，被开发网络审计拒绝。导出的文件可用 `node tools/replay-check.ts` 以同一 CloneCD 文件组在 Node 中重放核对（[工具指南](../guides/tools.md#录制重放核对)）。
- **针对性检查：** `pnpm exec vitest run src/ui/dev src/app/mission/dev-frame-timing.test.ts src/platform/files tools/replay-check.test.ts`。

## 键盘源与输入区

[keyboard-input.ts](../../src/platform/input/keyboard-input.ts) 定义冻结事件/信号/端口和纯按住轴；[keyboard-source.ts](../../src/platform/input/keyboard-source.ts) 实现实际生产资格与监听管理，最小 DOM-free Host 驱动故障测试；[browser-keyboard-source.ts](../../src/platform/input/browser-keyboard-source.ts) 只连接 DOM，不被 Node 测试导入。容器拥有 keydown/keyup/focusin/focusout，window 只有 focus/blur/pagehide/pageshow，document 只有 visibilitychange。P3-05 的 [game-input](../../src/ui/game-input/) 在任务所有者的 `input` 阶段连接平台源，绑定与游戏动作映射不进入平台层。释放先逻辑失效，再逐项撤销，撤销失败保留原因，不能声称物理清理成功。

P1-09 的合成五键消费者与其输入区已随合成演示退役（[R6](./source-structure.md#r6-合成-ui-层)、[R7](./source-structure.md#r7-演示页面开发面板与画面)）；P3-05 已建立正式任务输入区与游戏键位消费者。任务流程的项目页面按键（占位的 Enter/Space/Esc、入口的 repeat 抑制）仍在 [page-keys.ts](../../src/ui/mission/page-keys.ts)。绑定表、地图策略、清键入口与证据只在独立[键位文档](./keyboard-input.md)维护；针对性测试为 `pnpm exec vitest run src/platform/input src/ui/game-input src/ui/mission src/render/map`，E2E 键盘、地图与录制/replay 用例见本节 runner 及 `e2e/keyboard-input*.spec.ts`、`e2e/map-input.development.spec.ts`（隔离入口），生产地图路径的输入与画面见 `e2e/map-picture.*.spec.ts`（P3-13）；完整工程检查仍为 `pnpm check`。

## 渲染表面与视口

P1-07 的共用渲染设施位于 `src/render/scene/`、`src/render/viewport/` 与 `src/render/webgl/`，契约见 [P1-07 spec](../plan/p1/07/spec.md)；现由 P2-11 的资源查看器（[资源查看渲染](./modules/render.md#资源查看渲染)）与 P3-12 的飞行渲染（[飞行渲染](./modules/render.md#飞行渲染p3-12)）使用。P1 的合成渲染器已退役（[R2](./source-structure.md#r2-合成渲染)）。任务画面的飞行画布由每个任务所有者的渲染器持有，作为会话的运行级帧消费者绘制，不另建游戏循环；P3-13 的驾驶舱、HUD 与地图（[render 模块说明](./modules/render.md#驾驶舱hud-与地图p3-13)）经同一合成接入同一画布，作为 `cockpit` 槽的一层画入游戏图像，不另建画布、上下文或循环。

- **依赖：** `three`（dependencies）与 `@types/three`（devDependencies）同为 0.186 次版本，只从包根导入、只构造 `WebGLRenderer`（WebGL 2，不回退）；不用 React Three Fiber、addons、WebGPU、Worker 或 OffscreenCanvas。Vite 的 500 kB 块体积警告按 P1-07 spec 只记录，包体优化归 P5。
- **DOM-free 模块由 Node 测试覆盖：** [viewport-layout.ts](../../src/render/viewport/viewport-layout.ts)（固定 4:3、等比居中、DPR 上限 2 与设备尺寸上限）、[render-surface.ts](../../src/render/scene/render-surface.ts)（绘制端口与 `RenderSurfaceOptions`）、[cleanup.ts](../../src/render/scene/cleanup.ts) 与 [webgl-surface.ts](../../src/render/webgl/webgl-surface.ts)。浏览器专用的 [browser-webgl-surface.ts](../../src/render/webgl/browser-webgl-surface.ts) 只创建画布、`WebGLRenderer`、`ResizeObserver` 与 resolution 媒体查询；画布的无障碍名称与渲染器的输出颜色空间由调用方的 `RenderSurfaceOptions` 指定（查看器为 `VIEWER_SURFACE`，飞行画面为 `FLIGHT_SURFACE`）。边界回归要求非 `browser-*` 的渲染模块位于 Node 类型程序中（见上文 Lint 规则）。
- **多遍绘制（P3-12）：** `RenderSurface.drawPasses(passes)` 在一帧中按次序绘制各遍：每遍画入自己的目标（`WebGLRenderTarget`，null 为画布），`clearColor`/`clearDepth` 在绘制前清除整个目标（颜色清为不透明黑、深度清为最远），`scissor` 只限制绘制、不限制清除，为自目标左上角起的设备像素矩形；渲染器的 `autoClear` 在此期间关闭，不自动清除任何东西，结束后目标回到画布、裁剪关闭。上下文丢失导致的失败抛 `GraphicsDeviceError`。查看器仍只用 `draw(scene, camera)`。设备不提供 WebGL 2 时表面工厂抛 `GraphicsUnavailableError`，飞行渲染器据此进入 `unavailable` 而会话照常（[render 模块说明](./modules/render.md#渲染器)）。
- `createBrowserWebGLSurface` 转交前的回滚失败抛 `RollbackError`；回滚成功时原样抛出原始原因，因此不必按消息或 AggregateError 类型猜测是否释放失败。
- 测试替身 [render-surface.test-support.ts](../../src/render/scene/render-surface.test-support.ts) 记录每次绘制（`drawPasses` 的每一帧记录各遍的目标、清除与裁剪）并按绘制/释放模拟 GPU 统计；它不进入生产导入链。目标回归：`pnpm exec vitest run src/render`。
- 浏览器取证：截图保持 `preserveDrawingBuffer:false`，用元素截图的 Buffer 在页面内 `createImageBitmap` 解码采样；DPR 变化用上文“已验证的 CDP 自动化路线”中的仿真加媒体重新求值；WebGL 不可用用 `--disable-webgl --disable-webgl2 --disable-3d-apis` 启动的隔离 Chrome；上下文丢失用页面画布的 `WEBGL_lose_context`。

## 页面流转与任务生命周期

P1-08 的 React 菜单原型由 P2-11 接入导入、缓存与查看器，P3-04 接入正式任务流程，契约见 [P1-08 spec](../plan/p1/08/spec.md)、[P2-11 spec](../plan/p2/11/spec.md) 与 [P3-04 spec](../plan/p3/04/spec.md)。它是现代网页界面，不是原版菜单（G-07，见[切片缺省清单](./slice-gaps.md)）；任务画面是正式运行骨架，不是完整可玩切片。用户操作见[本地导入指南](../guides/local-import.md)。

- [app-flow.ts](../../src/app/flow/app-flow.ts) 是 DOM-free 的页面流转，由邻接 Node 测试覆盖。
  - 冻结快照为 `{screen:'menu'|'import'|'mission'|'viewer', missionVisit, focusTarget, cleanupFailure, viewerFailure}`。
  - 输入为 open-import、return-to-menu、`{open-mission, eligible}`、`{open-viewer, holdsPackage}`、`{mission-release-failed, cause}` 与 `{viewer-release-failed, cause}`。不适用的输入原样返回同一对象；不满足开始资格或任务已锁存时不能进入任务画面，未持有资源包或查看器已锁存时不能进入查看器；`missionVisit` 耗尽时抛 `RangeError`。两种锁存都只记第一次的原因，各自只阻止自己的画面。
  - 返回菜单的焦点目标：导入画面回到导入入口，查看器回到 `View resources`，任务画面回到 `Start mission`；对应的锁存已生效（或任务入口因其他原因禁用）时回到菜单标题，在菜单上收到锁存时也移到标题。
  - 页面状态只在内存中，不用路由或 history；刷新后回到主菜单，不恢复任务。
- **任务槽位与所有者（P3-04）：** DOM-free，API 见 [app 模块说明](./modules/app.md#任务流程与所有者)。
  - **槽位：** [App](../../src/app/App.tsx) 在自己的 state 中持有一个 [mission-slot.ts](../../src/app/composition/mission-slot.ts) 的槽位：同一时刻至多一个任务所有者，先释放旧的再创建新的，ownerId 从 1 递增、不复用；它还保存本应用实例内上次确认的僚机选择与异步关闭屏障。任何所有者的清理失败（含初始化回滚失败）都锁存槽位，经 `onCleanupFailure` 交给页面流转的 `mission-release-failed`：之后不再创建所有者，入口禁用并说明原因，所有画面显示 `cleanup-failure` 警告，直到重新载入页面；导入与查看器不受影响，查看器的锁存与它互相独立。
  - **资格：** 主菜单以 `missionEligibility(holder 快照, flow.cleanupFailure)` 决定 `Start mission` 是否可用（持有全包 `complete` 的资源包、任务诊断 `loaded`、未锁存），否则禁用并说明原因；入口资格只允许进入开始配置，世界创建在确认开始时才校验。
  - **流程：** 所有者从 G-02/1 介绍占位开始，经开始配置（G-04、G-07）、确认后创建 tick 0 世界并进入 G-02/2 出发占位（会话 `transition`），再进入飞行；任务菜单是暂停式的页面。重开先以 exit 结束运行，全部收尾成功才回到介绍；返回主菜单先 `slot.release()` 再切换画面，使同步的释放失败在菜单出现前锁存。占位在页面可见且无 pagehide 时累计 3,000 ms 自然结束（项目的呈现时长），也可提前跳过；隐藏时保留剩余时长并撤销计时器；计时器或时钟失败使占位永久停止，只能返回主菜单。
  - **所有权与释放：** 运行级消费者随每个运行登记，运行结束时由会话逆序释放；所有者级资源按阶段登记。所有者在有运行时（出发、飞行、暂停、停止、故障）登记一份离页保护，exit 或释放时撤销。释放顺序为占位计时器与输入 → 会话 → UI 桥接与开发诊断 → 离页保护 → 画面、音频等媒体；每项都尝试，任何失败都锁存。
  - **包替换与外壳收尾：** 资源持有者替换资源包前（`beforeReplace`），槽位同步释放绑定旧包的所有者（先锁存失败），外壳随即返回主菜单并显示 `mission-package-replaced`。`ResourceHolder.dispose()` 不通知任何监听，所以外壳卸载、StrictMode 重跑与外壳的 Fast Refresh 由 `teardownMissionAndHolder(slot, holder)` 显式先释放槽位、再销毁持有者，不依赖 React effect 的先后。外壳记下进入任务画面时的持有者；渲染时持有者已不同（外壳刷新）就返回主菜单。
- **应用端口（P2-11、P3-04）：** [App](../../src/app/App.tsx) 由入口传入 [AppPorts](../../src/app/ports.ts)：导入 Worker 端口工厂、资源缓存端口、音频能力与页面生命周期、WebGL 表面工厂、预期包配置、任务端口与 `reportError`。任务端口 `mission` 为 `{ seed, presentationSeed, clock, timer, leaveGuard, createSessionHost, createFileSave, createKeyboardSource, createFullscreen, createPointerLock, platformFamily }`（`presentationSeed` 为 P3-12 每个运行的飞行表现种子，与世界种子分开）。[main.tsx](../../src/main.tsx) 只传 [createBrowserPorts()](../../src/app/browser-ports.ts) 的生产实现与生产包配置：世界种子与表现种子都来自 `crypto.getRandomValues`，时钟为 `performance.now`，计时器为 `setTimeout`，离页保护在 `window` 上登记 `beforeunload`，会话宿主用真实 rAF 与页面生命周期，文件保存只在开发构建中以动态导入取得、生产为 null。生产代码不读 URL 参数或全局开关；只有开发测试入口注入合成端口（含 `seeds`，见上文测试入口）。
  - [use-resource-holder.ts](../../src/app/composition/use-resource-holder.ts) 在 effect 中创建应用外壳的资源持有者（随即列出缓存），卸载、StrictMode 重跑与外壳的 Fast Refresh 时按上述顺序先释放任务槽位再销毁它；外壳每次返回菜单都调用 `relist()`。
  - 主菜单按持有者快照显示原版数据状态：正在检查存储、没有、找到已保存的资源（尚未校验）或存储不可用；持有资源包时列出状态阶梯（保存与恢复附耗时）。存储、恢复与保存的失败以 [FailureNotice](../../src/ui/import/FailureNotice.tsx) 显示 05 的文案与技术细节；持有资源包时存储不可用也照常显示，除非它就是该资源包未保存的原因。
  - 只测缓存适配的浏览器用例经 [resource-cache.ts](../../e2e/support/resource-cache.ts) 的 `loadCacheModules` 打开不含应用的 [blank.html](../../e2e/entries/blank.html)，因为应用一载入就列出缓存，会打开（从而创建）数据库。
  - 入口：持有资源包时有 `View resources`；未持有且有可恢复条目时有 `Open saved resources`（恢复中禁用，由它发起的恢复成功后焦点移到 `View resources`）；完整资源包未保存时有 `Save again`（保存中禁用）。
  - 任务入口 `Start mission` 带 `data-eligibility`（`checking` 或资格状态）；不可用时以 `mission-entry-reason` 说明原因（没有资源包、不完整的组或整包诊断、任务未载入或载入失败的类别/路径/原因、清理锁存），说明中含正式运行骨架的声明与 G-07 标注。入口上的 Enter/Space repeat 被抑制，从任务画面按住返回键回到菜单时不会再次进入。
  - 查看器入口在查看器锁存后禁用并说明原因；外壳以 `viewer-cleanup-failure` 警告显示锁存的原因，导入与任务照常可用。
  - 任务所有者、槽位与外壳的错误同样交给端口的 `reportError`。
- **画面模块与 Fast Refresh（P2-11 S-12、P3-04）：** [ImportScreen](../../src/app/ImportScreen.tsx)、[ViewerScreen](../../src/app/ViewerScreen.tsx) 与 [MissionScreen](../../src/app/MissionScreen.tsx) 各在自己的模块中：编辑它们或它们的 hook 时只刷新该画面，外壳的资源包与已确认的僚机选择保留。外壳（`App.tsx` 或 `use-resource-holder.ts`）的 Fast Refresh 重建持有者的创建函数，从而重跑持有者的 effect：先释放任务槽位，再销毁持有者，丢掉资源包并回到主菜单（P3-04/09 实测）。P2-11 时持有者的 effect 只依赖 props，外壳刷新实际上不会重跑它，此前“`App.tsx` 的 Fast Refresh 会重建持有者”的说法依赖了这一不成立的前提，现以记忆化的创建函数实现。
  - **StrictMode 下的重跑：** 刷新时 React 只经刷新重建的依赖（`useCallback`、`useMemo` 的结果）重跑 effect；依赖都是 props 与 state 的 effect 不会重跑。所以各 hook 的 effect 都依赖一个 memo 化的函数：`useImportJob` 的移交，`useViewerOwner` 的 `optionsFor`，`useMissionOwner` 的 `assembleFor`，`useResourceHolder` 的 `create`。编辑 hook 后，作业持有者、查看器所有者或任务所有者即被替换。
  - **接续：** 查看器所有者被替换时（StrictMode 重跑、Fast Refresh），hook 在 effect 清理时记下它所选的条目、变体与视图，交给下一个所有者作为起始状态（`ViewerOwnerOptions.initial`）；离开查看器后再打开则从未选中开始。任务所有者被替换时，旧所有者先失效并释放，新所有者从 G-02/1 开始，不恢复运行世界，只保留资源包与已确认的僚机选择。
  - **诊断：** 查看器槽位从 1 起为所有者编号（`ViewerOwner.serial`），画面区域的 `data-owner` 显示它；作业持有者在页面中同样编号（`ImportJobOwner.serial`），并以 `liveImportJobOwners()` 计数尚未释放的；导入页面的 section 以 `data-job-owner` 与 `data-live-job-owners` 显示。任务画面根（`mission-screen`）带 `data-owner`（ownerId）、`data-run`、`data-tick`（最新采样的 Core tick）与 `data-position`（流程位置），只有这一层随 tick 重渲染。E2E 用它们区分真正的替换与只重渲染。
- **任务画面（P3-04）：** [MissionScreen](../../src/app/MissionScreen.tsx) 调用 [use-mission-owner.ts](../../src/app/composition/use-mission-owner.ts) 并渲染 [MissionPage](../../src/ui/mission/MissionPage.tsx)。
  - **所有者：** hook 在 effect 中经槽位打开所有者；槽位决定创建后才创建会话宿主与 `ui` 消费者。该消费者在所有者连接它时以 ownerId 创建 store、会话桥接与命令反馈，绑定所有者的会话，并以 `{ release: bridge.unbind, onSessionError: bridge.onError }` 返回；同时以持有者当时的资源包（即所有者正在绑定的那一代）的 logic 组创建结果页读取的导入文字 `MissionScreenParts.texts`（app 的 `missionTexts`，P3-11）；所有者每次发布快照时，hook 把冻结的流程值写入 store。飞行消费者之后是 P3-14 的音效 `media` 消费者（`createFlightAudioConsumer`，读同一运行的 `presentation()`，两个消费者列表次序相同）。开发构建另以帧计时包装宿主、加入帧计时与诊断两个消费者（诊断的 `recordSound` 作为音效消费者的 `record`）并传入开发录制选项（见[开发诊断与录制导出](#开发诊断与录制导出)）。
  - **飞行画面（P3-12）：** 装配时另建一个 `flight-canvas` 容器与 `media` 阶段的飞行消费者（`createFlightConsumer`，表面为 `createSurface(容器, FLIGHT_SURFACE)`，种子为 `presentationSeed`，见 [app 模块说明](./modules/app.md#飞行画面)），作为 `media` 阶段在会话、UI 桥接与离页保护之后释放。页面经 `MissionFlightView { renderer, bindFlightArea }` 取得它：[FlightView](../../src/ui/mission/FlightView.tsx) 挂载时把容器放进 `flight-area`，卸载（如显示基地页面）时只把它移出页面，画布与上下文随所有者释放。WebGL 2 不可用时渲染器为 `unavailable`，任务照常。P3-13 起飞行消费者另接驾驶舱：装配给出 `cockpit: { copy: cockpitCopy(), map }`，地图输入的几何为 `createZoneGeometryPort`、光标为当前运行的就绪凭证，`ui` 阶段的 `messagesConsumer` 把每个运行的消息行桥接进 store（[app 模块说明](./modules/app.md#飞行画面)）。effect 的清理释放槽位（卸载、StrictMode 重跑、Fast Refresh）；打开失败（如资格已变化的 `MissionUnavailableError`）以 `mission-open-failure` 显示并报告。
  - **页面：** `MissionPage` 按流程位置显示 G-02 占位（[PlaceholderPage](../../src/ui/mission/PlaceholderPage.tsx)：介绍、出发、运行中保持与 P3-11 的终局）、开始配置（[StartConfigPage](../../src/ui/mission/StartConfigPage.tsx)）、任务壳（[MissionShell](../../src/ui/mission/MissionShell.tsx)）、任务菜单（[MissionMenuPage](../../src/ui/mission/MissionMenuPage.tsx)）或 P3-11 的结果页（[ResultPage](../../src/ui/mission/ResultPage.tsx)），按 ownerId 作 key，下方是开发构建的诊断面板。页面只渲染所有者的快照，并在事件处理中调用其意图（`skip`、`select`、`start`、`pause`、`resume`、`openMenu`、`continueFromMenu`、`restart`），开始与继续直接来自可信点击。缺省标注的位置见[切片缺省清单](./slice-gaps.md)。
  - **焦点与按键：** 占位打开时焦点在 Skip，本页范围内新的 Enter、Space、Esc 提前结束一次，repeat 一律阻止默认行为，所以上一页按住的键不会结束占位或激活按钮；计时失败时只给 alert 与 `Return to main menu`（焦点移到它）。运行中保持的占位只在页面可见且焦点已丢失时取得焦点，终局占位只在页面可见时取得焦点。开始配置、任务壳、任务菜单与结果页进入时聚焦标题（结果页只在页面可见时）；开始配置的失败以 `role=alert` 显示类别、路径与原因，不能重试时只保留返回并获焦；任务壳的暂停/继续是一个切换控件，焦点不丢，不能继续（页面隐藏或离页）时禁用并说明原因，暂停状态显示在游戏区域之外的状态栏中。键位见[键位文档](./keyboard-input.md)。
  - **测试 ID：** `mission-screen`；`mission-placeholder`（`data-gap`、`data-status`，运行中保持与终局另有 `data-transition`）、`mission-placeholder-variant`（`data-variant`：出发与 G-02/8 为 `solo` 或 `wingman`，G-02/7 为 `destroyed` 或 `energy`，G-02/9 为过场行）与 `mission-placeholder-sequence`（`data-index`、`data-count`）；`mission-config`（单选的 `data-wingman` 为索引或 `none`）与 `mission-start-failure`（`data-kind`）；`mission-shell`、`mission-view`、`mission-status`（`data-phase`、`data-pause`）与 `mission-ended`（`data-ended`）；P3-12 的飞行区域 `flight-view`、`flight-area`（`data-state` 为渲染器状态，内含名为 “Flight view” 的画布）、`flight-notice`（`data-state`，渲染器 `context-lost`、`unavailable`、`failed` 时）与状态栏 `mission-status` 中 P3-14/18 的声音状态 `mission-sound`（`role="status"`，`data-sound` 为 `MissionSoundStatus`）与按钮 `mission-enable-sound`（开始页与任务菜单也显示 `mission-sound`；取代已移除的在制提示 `flight-in-progress`）；P3-13/25 的基地页消息区块 `base-messages`、`base-incoming`、`base-message-line`（`data-origin`、`data-covered`）；`mission-menu`；`mission-result`（`data-outcome`、`data-reason`）及其 `mission-result-summary`（`data-summary`）等，见 [UI 模块说明](./modules/ui.md#任务页面与缺省标注)；主菜单的 `mission-entry-reason`，以及 `mission-open-failure`、`mission-package-replaced`。
- **查看器页面（P2-11 S-07 至 S-09）：** [ViewerPage](../../src/ui/viewer/ViewerPage.tsx) 由 `ViewerScreen` 渲染，后者调用 [use-viewer-owner.ts](../../src/app/composition/use-viewer-owner.ts)。
  - **所有者：** hook 在画面区域挂载后经外壳的查看器槽位（`createViewerLifecycle`）打开所有者。表面由端口的 `createSurface(container, VIEWER_SURFACE)` 在槽位决定创建所有者之后才创建，所以锁存后不会再有画布；创建失败时改为不可用的渲染器，回滚也失败（`RollbackError`）时槽位锁存；卸载、StrictMode 重跑、Fast Refresh 与更换容器时关闭槽位。“Return to menu”先同步关闭槽位再切换画面，所以同步的释放失败在菜单出现前锁存；音频 `close()` 被拒绝则在观察到时锁存。
  - **页面：** 完整资源包显示其内容身份（manifest 身份与转换器版本），供核对恢复前后是否相同；按种类（模型、效果、图像、调色板、布局、字库）列出条目，默认不选中；所选条目显示失败（code、位置、原因）或变体：模型的部件列表单选（附内容与置信度）、效果的视图单选（附各形状的原值、绘制字节与贴图状态；仅含跨接缝面的项显示“Seam interpolation unconfirmed”标记）、模型的中性光开关。导弹贴图只应用旋转 0，不提供旋转选择。资源包不完整时始终显示说明与各组状态。
  - **画面：** 4:3 区域（`viewer-view`）可用 Tab 到达，有焦点轮廓与含当前 Asset ID 的无障碍名称；键盘操作见[键位文档](./keyboard-input.md#8-项目界面按键)，同样的操作有按钮。渲染状态以 `status` 或 `alert` 显示；“Refresh diagnostics”按需读出渲染诊断（状态、条目、绘制次数、GPU 计数、布局、位置与视图）。
  - **试听与任务：** [ViewerAudioPanel](../../src/ui/viewer/ViewerAudioPanel.tsx) 列出声音及播放、停止与全部停止按钮，显示音频状态、发声数与失败原因；任务一节以 [viewer-copy.ts](../../src/ui/viewer/viewer-copy.ts) 的文字显示 04 的结构摘要与引用校验（逐个列出解析到的模型及其是否在模型组中），失败时以 `FailureNotice` 显示类别与技术细节。只显示结构与计数，不显示原版文字。
  - React 只提交意图，按所有者、渲染器与音频的快照变化渲染，不随绘制重渲染。所有者与音频的 `getSnapshot`、`subscribe` 是绑定的函数，可直接交给 `useSyncExternalStore`。
- **导入页面（P2-11 S-02）：** [ImportPage](../../src/ui/import/ImportPage.tsx) 由 `ImportScreen` 渲染，后者调用 [use-import-job.ts](../../src/app/import/use-import-job.ts)。
  - **作业持有者：** hook 在 effect 中以端口的 Worker 工厂创建作业持有者，卸载、StrictMode 重跑与 Fast Refresh 时释放并终止 Worker。作业结束时，hook 在持有者自己的通知中把组交给资源持有者，所以随即离开页面也不丢组；此刻没有可用的资源持有者时，移交等到下一个持有者出现，新作业开始时放弃。提交属于资源持有者，不因离开页面中断。hook 另以页面时钟记录每个作业从开始到结束的耗时，并记下本页最近作业所得资源包的持有者实例与代际。
  - **控件：** 文件输入（`.ccd,.img,.sub,.cue`，可多选）、`Start import`、`Cancel import` 与 `Return to menu`。
  - **开始：** 资源持有者存在后才能开始。先做建议性的空间检查；`insufficient` 时先显示所需与可用的 MiB，由玩家选择 `Import anyway` 或 `Do not import`。检查进行中与等待选择时，开始按钮与文件输入都禁用；更换文件、开始作业或离开页面会使未完成的检查作废，所以开始的总是当前显示的文件。启动规则不符时显示 `start/file-rules` 文案，不创建 Worker。
  - **进度：** 运行中显示阶段名、已读取 MiB 与已识别的版本标识，不显示百分比；开始按钮与文件输入此时禁用。
  - **结果：** 结束后显示结果与耗时；失败经失败文案显示类别与技术细节；取消说明没有保留部分结果。
  - **资源状态：** 页面列出状态阶梯（含来源已识别）、本次导入各组的状态与诊断 code、部分转换的说明、保存失败与 `Save again`，以及任务载入失败。这些只针对本页最近作业所得的资源包（同一持有者实例与代际）；之前持有的资源包不当作本次结果，仍由菜单显示。
  - **文案：** 页首新增隐私说明：原版数据只在本浏览器中读取、转换与保存，不上传；权利说明保持 MIT 不覆盖原版内容、不是官方产品、不授予原版权利。
- [App](../../src/app/App.tsx) 是应用外壳，持有页面流转状态、任务槽位与查看器槽位，只渲染当前画面；任务画面以 `missionVisit` 为 key。锁存后在所有画面显示含原始原因的 alert，并提示刷新页面；主菜单原生禁用 `Start mission`，导入入口照常可用。进入任务画面前，外壳先用当前状态同步校验转换：`missionVisit` 耗尽时以 `open-mission-failure` 显示 `RangeError` 并停留在主菜单，不创建所有者；实际提交仍走函数式更新，双击时每次激活至多一次转换。页首的权利与隐私声明说明本项目是独立项目、不是原版玩法或官方授权产品，原版数据只在本浏览器中读取、转换与保存。
- [ui/pages/](../../src/ui/pages/) 提供主菜单与页面焦点 helper，[ui/mission/](../../src/ui/mission/) 提供任务页面，都不在 window/document 注册键盘监听；导入与查看器分别在 `ui/import/`、`ui/viewer/`。
  - 画面标题为 h2，`tabIndex=-1`：进入画面时聚焦标题（占位页聚焦 Skip）；返回菜单时按 `focusTarget` 聚焦打开该画面的入口，锁存或入口禁用时聚焦菜单标题；首次加载不移动焦点。
  - 导入页面（P2-11，[ImportPage](../../src/ui/import/ImportPage.tsx)）见上文“导入页面”。
  - 样式在 [app.css](../../src/app/app.css)：响应式、按钮与输入 `:focus-visible` 有可见 outline。
- 验证分层：页面流转、任务流程、所有者、槽位与收尾顺序用 Node 测试（[mission.test-support.ts](../../src/app/mission/mission.test-support.ts) 提供可控的时钟、计时器、种子、离页保护与测试消费者）。React 画面、焦点、键盘、离页确认与往返释放由[本地浏览器 runner](#本地浏览器-runner) 的 mission-flow、app-shell、interaction-render、native-lifecycle、joint-resources 与 fast-refresh 用例在开发服务器与 `vite preview` 中取证。稀有失败（占位计时失败、清理与回滚失败、锁存）的 React 文案与焦点接线以 Node 测试加代码审阅为证，不加后门伪造浏览器复现。不引入 jsdom、React Testing Library 或额外的浏览器依赖。
