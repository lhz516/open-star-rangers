---
type: guide
status: active
phase: P1
updated: 2026-10-09
related: [ADR-0002, ADR-0006, ADR-0015]
---

# 工程约定

本项目代码的结构、命令与检查规则。架构决定见[总计划](../plan/master-plan.md) §4–5；本文只记录落地方式。

当前源码目录、Runtime/Session 的分工、helper 归属与后续阶段扩展落点见[源码结构指南](./source-structure.md)，各模块已交付代码的 API 与契约要点见其[模块分册](./source-structure.md#模块说明)，决定见 [ADR-0015](../decisions/ADR-0015-source-module-structure.md)。历史源码路径的对应关系与本轮验证只在[迁移记录](./source-structure.md#p1-06-前迁移记录)维护。

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
- 类型导入必须写成 `import type`。
- 持久正/负回归在 [engineering-boundaries.test.ts](../../tools/engineering-boundaries.test.ts)，进入现有 `pnpm test`/`pnpm check`。TypeScript 样本在自有临时项目中使用仓库原配置和真实 include/exclude，ESLint 使用虚拟源与真实逻辑路径，不在生产目录留违规文件。负向必须命中目标诊断，正向须通过；空项目、ignored/parser 错误及误配预期均会失败。
- 覆盖限定为明确的静态导入、路径、宿主 API 和 async/await 语法；不承诺识别动态绕过、别名间接调用或不经 async/await 的 Promise 链。测试例外是 `.test.ts`，不扩展未来 `.test.tsx`/E2E 发现能力。
- 同一回归文件的 render layer 部分（P1-07 AC-01/04/17）用 TypeScript 解析应用程序中的生产源码（忽略注释与普通字符串）：只允许从 `three` 包根导入且只在 `render/`，无 `three/*`、React Three Fiber 或 WebGPURenderer；`render/` 生产代码不出现 rAF、`setAnimationLoop`、定时器或 `queueMicrotask` 等调度标识符。`render/` 中浏览器适配命名为 `browser-*.ts`，与 `.tsx` 一样只由应用程序检查；其余 DOM-free 渲染模块必须出现在真实 `tsconfig.node.json` 程序中（即被某个 `.test.ts` 传递导入），且该程序不得包含任何 `browser-*` 或 `.tsx`。它同样不识别动态拼接的绕过。
- 同一回归文件的资源缓存部分（P2-10 AC-14/AC-15）解析 `src/platform/storage/` 的生产源码：不得出现 `fetch`、`XMLHttpRequest`、`WebSocket`、`sendBeacon`、`EventSource`、`window`、`document`、`localStorage` 标识符，只能相对导入且不能导入 `original-data`、`render`、`ui`、`app`、`workers`；非 `browser-*` 的模块必须在真实 Node 程序中。`browser-*` 适配不进入 Node 程序由上一条的 render 规则覆盖（它检查 `src/` 中所有浏览器模块）。
- 同一回归文件的应用资源部分（P2-11 S-03/AC-22）解析 `src/app/resources/` 的生产源码：不得出现与资源缓存相同的网络与宿主标识符，只能相对导入且不能导入 `render`、`ui`；每个模块都必须在真实 Node 程序中。各部分共用一次构建的 Node 程序文件集合。
- P2-11 AC-22 的主线程网络回归覆盖 `src/app/`、`src/ui/` 与 `src/render/viewer/` 的全部生产 `.ts`/`.tsx`（排除测试与测试支持）：不得引用 `fetch`、`XMLHttpRequest`、`WebSocket`、`EventSource`、`sendBeacon`。复用 TypeScript 程序与标识符解析，另检查字面量下标和解构属性；正反例验证目录范围、全局/属性/解构形式，忽略注释和普通字符串。这是静态源码边界，不承诺识别动态拼接的属性名；页面与 Worker 实际发出的请求由浏览器 runner 的[网络审计](#网络审计)核对。
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
- worker 数为 CPU 的 50%，为集成测试启动的构建工具和其他并行检查留出余量；不设全局 timeout。回归由 [engineering-boundaries.test.ts](../../tools/engineering-boundaries.test.ts) 保护：每个测试文件恰属一个项目，只有 mock 文件被隔离，且不覆盖 deadline。机器负载很高（load 约 13–30，多个会话并行检查）时，该文件的渲染边界用例在全量并行运行中曾超过 Vitest 默认的 5 s（单独运行约 1.8 s）；这时在低负载下复跑或单独运行确认，未改超时。
- 集成测试只为真实接线启动构建与子进程，其余在进程内覆盖：合规 CLI 回归只跑一次真实聚合构建，原版扫描各作用域与 inventory 校验分别由 [scan.test.ts](../../tools/compliance/scan.test.ts)、[distribution.test.ts](../../tools/compliance/distribution.test.ts) 覆盖；构建插件回归在首次真实审计后复用其结果做失败构建。

- 单元测试与源码放在同一目录，命名为 `*.test.ts`，用 Vitest 在 Node 环境运行。
- **测试不得读取原版文件。** 原版格式的测试数据由 `src/original-data/synthetic.test-support.ts` 在代码中生成，内容契约的合成包由 [synthetic-content.test-support.ts](../../src/content/synthetic-content.test-support.ts) 生成；用原版文件做的完整性检查放在 `tools/nob-check.ts`，只在本地运行。工程边界回归会检查 `src/content` 与 `src/original-data` 的测试和 test-support 文件：
  - 只能导入 `vitest`、作为哈希对照的 `node:crypto`，以及这两层自身的模块；相对路径按真实路径解析，不能借符号链接指向别处。
  - 不能使用 `require`、`process`、`vi` 或 `import.meta` 这类绕开 import 声明的加载方式。
  - 文件系统、工具脚本和计算型动态 import 都会被拒绝（P2-01 AC-11）。

  这项检查用于防止无意中读取文件，并不针对刻意混淆的代码。
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
- **生产预览的 CSP（P2-11 S-11、技术决定 11）：** [vite.config.ts](../../vite.config.ts) 只让 `vite preview` 发送 [preview-csp.ts](../../tools/preview-csp.ts) 中的严格策略：
  - 策略文本为 `default-src 'none'; script-src 'self'; worker-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`；
  - 不含 `unsafe-inline`、`unsafe-eval`、`blob:`、`data:`、通配符或其他来源；开发服务器的客户端依赖内联脚本，不发送策略；
  - [preview-csp.test.ts](../../tools/preview-csp.test.ts) 核对这些性质，以及只有预览发送策略。

  全部 `production` 项目用例都在该策略下运行。[production-preview.spec.ts](../../e2e/production-preview.spec.ts) 只在该项目运行，核对：
  - 页面与 Worker 脚本的响应都带策略；
  - 导入 Worker 是 `/assets/` 下带哈希的模块脚本，由页面 chunk 的 `new Worker(new URL(…, import.meta.url))` 创建（开发服务器的 `worker_file` 标记在构建中不存在）；
  - 生产尺寸的合成文件得到 `source/unsupported-version`；
  - Worker 脚本返回 404 或 200 的 HTML 时，导入以 `import/worker-start-failed` 结束，Worker 已终止，没有资源包。404 时浏览器自己的加载失败报告不总是出现，出现时才声明。这两个用例在[网络审计](#网络审计)下运行，被页面路由替换的 Worker 脚本请求以 `audit.declare` 声明，预期状态分别为 404 与 200；
  - 菜单、导入页面与合成演示没有 `securitypolicyviolation`；
  - 在隔离 context 中预置生产身份的合成缓存，同源刷新后经菜单恢复、重新校验，模型、图像与布局的像素读回逐字节一致，试听确实启动声音源，返回菜单后音频上下文关闭，整条路径没有 CSP 违规或控制台错误；
  - `dist/` 只有 `index.html` 一个页面，产物与 source map 来源不含测试入口、测试支持或合成目录。

  预置支持 [production-cache.ts](../../e2e/support/production-cache.ts) 复用合成 `models` 包、生产身份常量与 P2-10 的记录/键构造函数。Node 侧把转换器版本与来源指纹换成生产配置，经 `applyManifestIdentity` 重新派生合成包的 manifest 身份，再校验完整性与声明预算。可序列化的合成记录交给测试页面，由页面重建 `ArrayBuffer` 并在单个 IndexedDB 事务中写入；生产页面不载入 `/src/`、开发测试入口或测试支持模块，也不注入应用端口。仅限测试拥有的隔离 context，不接触用户缓存。

  探针契约用例的 Worker 因此改由 Playwright 路由在同源路径 `/__probe/*.js` 提供，不用 Blob URL。
  - **SWA 的输入（P5）：** 静态站点的回退（SPA fallback）必须排除 `/assets/*`，缺失的脚本应返回 404 而不是 `index.html`，否则 Worker 载入失败会被 HTML 掩盖；生产响应头应采用同一策略。本地预览的结果不能代替真实 SWA 的回退与响应头实测，后者归 P5。
- **P2-11 测试入口：** 开发服务器另提供 [e2e/entries/app.html](../../e2e/entries/app.html)，以 [app-entry.test-support.tsx](../../src/app/app-entry.test-support.tsx) 挂载生产 `App` 并注入合成端口：查询参数 `worker` 选择导入 Worker 的测试场景（[import-scenarios.test-support.ts](../../src/workers/import-scenarios.test-support.ts) 注册的名称，默认 `models`，另有 `production` 与 `missing`）；`cache=unavailable` 换成没有 IndexedDB 的缓存，`cache=<P2-10 失败码>` 让第一次提交返回该失败；`capacity=insufficient` 让空间检查报告只有 1 KiB 可用；`audio=unavailable` 换成无法创建音频上下文的音频能力；`hold` 取 `commit`、`list`、`restore` 中一至三项（逗号分隔），这些缓存操作的结果在缓存结算后等待测试用 [app-entry.ts](../../e2e/support/app-entry.ts) 的 `releaseCacheResults` 释放（`heldCacheResults` 计数），用于迟到结果（P2-12 F-12）。预期包配置取该场景的 `scenarioEntryProfile`，并发布为 `window.osrTestEntry.profile` 供用例预置缓存。测试在导航前安装了[响应探针](#响应探针)时，每次提交在开始的同一任务内打开 `commit` 窗口，由用例 `adopt` 后关闭；未安装时行为不变。新增查询键，或超出现有模式的取值，须同时加入 [e2e-network-policy.ts](../../tools/e2e-network-policy.ts) 的 `TEST_ENTRY_QUERY`，否则网络审计把这次导航判为违规；`worker`、`cache` 已接受任意小写连字符名称，新场景名不必改。生产构建只以 `index.html` 为入口，不含它；用例经 [app-entry.ts](../../e2e/support/app-entry.ts) 打开，只在 development 项目运行。
- **P2-11 页面回归路线：** 开发项目的 [import-page.spec.ts](../../e2e/import-page.spec.ts)、[viewer-page.spec.ts](../../e2e/viewer-page.spec.ts)、[cache-recovery.spec.ts](../../e2e/cache-recovery.spec.ts) 与 [fast-refresh.spec.ts](../../e2e/fast-refresh.spec.ts) 分别覆盖导入、查看器、缓存恢复/损坏与生命周期；生产项目走上述严格 CSP 与生产身份合成缓存，不使用开发测试入口。聚焦运行可用 `pnpm test:e2e e2e/import-page.spec.ts e2e/viewer-page.spec.ts e2e/cache-recovery.spec.ts e2e/fast-refresh.spec.ts --project=development`，生产路径用 `pnpm test:e2e e2e/production-preview.spec.ts --project=production`。这些自动化只用合成内容；用户真实界面的操作与证据清单见[本地导入指南](../guides/local-import.md#用户实机核对)。
- 聚焦运行：`pnpm test:e2e bootstrap.spec.ts --project=development --project=production`。Vitest 仍只发现 src/tools 的 `.test.ts`，不发现 E2E `.spec.ts`；[配置回归](../../tools/e2e-configuration.test.ts)验证类型/lint发现与项目设置（单 worker、零 retry、两个服务器都不复用、经 `/src` 导入的用例只属 development），并对 `--list` 中每个 `*.development.spec.ts`、`*.production.spec.ts` 断言其项目集合恰为对应的单一项目。断言失败、启动失败、端口占用与缺浏览器的非零退出是 Playwright 自身行为，不另设合成配置回归。
- 原生后台已固化在 [native-lifecycle](../../e2e/native-lifecycle.spec.ts)，可用 `pnpm test:e2e --project=development-headed` 独立运行：自管 headed 浏览器、CDP自建context/两tab、移除下文3项disable-background默认参数，取得真实hidden；不可用时保留原始原因并非零，不能合成事件或skip。受管page的hasFocus仍不是原生窗口证据。
- [WebGL降级](../../e2e/webgl-unavailable.spec.ts)用独立浏览器进程的disable-WebGL flags跑开发/生产；只有该场景允许当前Three.js具体创建失败诊断（逐项记录），其他异常/请求/控件错误仍失败。正常项目必须有实际WebGL2画面。
- 联合资源测试逐轮打印context扩展能力；缺可选`WEBGL_lose_context`的context以annotation明确“context-loss未验证”，不冒称lost。可用时逐个断言实际lost；完整必需测量及本机结果见[04证据](../plan/p1/10/subtasks/04-joint-resource-regression.md#完成证据)。
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
  - **页面隐藏：** 用 `nativeBrowser([自动播放开关])` 启动 headed 浏览器，在 CDP 自建的 context 中开两个标签页，用 `Target.activateTarget` 切换，得到原生 hidden，并记录原生 `visibilitychange` 日志。机器负载均值约 20–30 时，该用例偶发在恢复可见 300 ms 后仍读到挂起前的分析峰值而失败（同一基线提交上 8 次中 5 次），负载回落后通过；按环境时序处理，在低负载下复跑确认，不靠重试变绿。
  - **聚焦运行：** `pnpm test:e2e audio-playback.spec.ts --project=development`。
- 完整执行用`pnpm test:e2e`（当前build＋全部3项目）；失败不能靠重试变绿。正常用例采集pageerror/console/失败HTTP与请求以及UI错误，probe自检的受控异常与WebGL-off诊断只在各自场景逐项记录。自动覆盖、历史HMR/window/DPR/故障证据及其相关差异判断见[07证据](../plan/p1/10/subtasks/07-evidence-docs-alignment.md#完成证据)；源码/构建行为变化后只补失效项，不自动跑源码编辑。

#### P2-12 联合与失败用例

P2-12 的[联合闭环](../plan/p2/12/spec.md#联合闭环)与[失败矩阵](../plan/p2/12/spec.md#失败矩阵)只用代码生成的合成数据。每个用例都在[网络审计](#网络审计)下运行，并用[资源平衡](#资源平衡)核对释放；联合用例另测[主页面响应](#响应探针)。逐项断言与本机结果见各[子任务](../plan/p2/12/goal.md#子任务跟踪)的完成证据。

| 用例 | 项目 | 内容 | 本机耗时 |
|---|---|---|---|
| [joint-pipeline.development](../../e2e/joint-pipeline.development.spec.ts) | development | 测试入口 `worker=canary` 的真实 Worker 转换金丝雀光盘：3 轮导入、自动提交、查看与试听、刷新后恢复、合成演示；另有同文档 3 次往返 | 约 1 min |
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
  - **Fast Refresh：** 编辑与还原源码的辅助在 [fast-refresh.ts](../../e2e/support/fast-refresh.ts)，`withEdits` 结束时还原并核对文件，[fast-refresh.spec.ts](../../e2e/fast-refresh.spec.ts) 与 F-14 共用。

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
  - **开发：** 只放行同源、无请求体的 `GET`/`HEAD`，并逐条列出入口文档、测试入口、Vite 客户端与预构建依赖、仓库中存在的 `src/` 模块，以及各自允许的资源类型与 Vite 查询键，没有“任意同源 GET”。唯一允许的 WebSocket 是协商 `vite-hmr` 的同源 HMR 连接，它的发送帧只能是 Vite 客户端的 `ping` 或 `vite:invalidate`。测试入口的查询键与取值由 `TEST_ENTRY_QUERY` 列出（`worker`、`cache`、`capacity`、`audio`、`hold`）。
  - **金丝雀：** 在 URL（含 fragment）、请求头、Cookie、请求体、WebSocket 发送帧、cookie 值，以及弹窗、导航、Service Worker 与被 CSP 阻止的 URL 中查找，按原文、百分号或表单解码，以及 Base64（三种字节对齐，标准与 URL 安全字母表）匹配。
- **使用要点：**
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
- **用法：**
  - `ResourceBalance.start(page, testInfo, { packages })` 在已稳定的菜单上取基线；`check(label)` 断言没有差异，`measure` 只报告；
  - 提交后用 `expectPackages([expectedPackage(key, groups)])` 更新期望的缓存包；
  - 刷新前用 `beforeReload` 在旧文档中检查并保存释放证据，刷新后用 `rebaseline` 取新基线，未经 `beforeReload` 时它拒绝；
  - `warm(item, gpu)` 要求同一文档内同一项的暖态 GPU 计数逐轮相等；`attach` 附上全部记录。

  默认要求页面装有音频探针（`installAudioProbe`），只在音频不属于用例范围时传 `audio: false`。缺 `WEBGL_lose_context` 的画布只标注“上下文丢失未验证”，其他必需能力缺失直接失败。
- **React DOM 的元素监听：** React DOM 在单个元素上登记的非委托监听（如文件输入的 `invalid`、`<details>` 的 `toggle`）永不移除，在开发中归入 `test` 分组，在生产中归入 `other`。比较时按类型统计仍在文档中的这类监听，随元素离开文档的视为已释放；所以菜单上新出现的元素（如失败提示的 `<details>`）会带来一条新增的 `toggle`。
- **Playwright 的主世界脚本：** Playwright 第一次在页面主世界运行脚本时（`locator.evaluate`、`allInnerTexts`、`allTextContents`、元素截图、`boundingBox()`、`check()` 等），会在 `window` 上登记一组常驻的捕获监听，探针把它们计入 `test` 分组。基线须在这之后取：[joint-pipeline.development.spec.ts](../../e2e/joint-pipeline.development.spec.ts) 的 `settleTooling` 先做一次 `locator.evaluate`。也可以在受检查的文档中改用 `page.evaluate` 读取，用 `page.screenshot` 加裁剪读像素。
- **控制样本：** [resource-balance-controls.spec.ts](../../e2e/resource-balance-controls.spec.ts)（两个项目）故意泄漏监听、观察器、持续 rAF、未终止的 Worker 与未关闭的 AudioContext，每类只报告对应的问题；另有一条干净路径。

## 合成 Runtime

- [synthetic-runtime.ts](../../src/app/runtime/synthetic-runtime.ts) 是 P1 合成运行入口，契约见 [P1-04 spec](../plan/p1/04/spec.md)。它不是原版玩法；现已由 Session 与应用 owner 接入合成页面，Runtime 不直接拥有浏览器帧循环。
- 调用者向 `frame(nowMs)` 提供单调不减的毫秒时间戳；首帧只锚定。只在 Runtime 内推进 Core；时钟和 Event Bus 的内部发布入口不能交给消费者。
- `setInput` 保存连续轴，`submitCommand` 返回 Runtime commandId；它不同于 Core entityId。命令结果在整帧模拟结束后通知，持续事实从 `uiProjection`/`renderFrame` 读取。
- `on`/`onAny` 仅接收同步、返回 undefined 的回调。监听器抛错前的副作用不会回滚；帧末 `listener-failed` 不意味着 tick 未提交，不可重试已完成 tick。Core `faulted` 后禁止模拟和输入，读取与订阅清理仍可用；恢复会话属于 P1-05。
- 录制默认关闭；创建时传 `recording: {checkpointInterval}` 开启，`exportRecording()` 返回 P1-03 格式的冻结记录/结果，关闭时为 null。较大间隔仅减少检查点，不减少逐 tick 输入和事件；没有有界内存或自动持久化。
- 故障帧已经成功的 tick 和事件保留在录制中，但该帧通知不投递。因此故障导出仍可 replay 一致，却不是 Event Bus 投递日志。测试用真实合成 Core；故障测试只在 Vitest 创建边界注入 step 前异常，不向生产接口加入测试后门。
- owner 可在 frame/事件批次之外显式调用 `resetClock`（丢弃全部宿主时间进度）、`clearIntent`（清轴/队列并返回冻结 FIFO ID）、`foldRenderState`（previous=current、alpha=0）和 `clearSubscriptions`。faulted 也可收尾，但不解除故障；批次内调用抛 reentrant-call。它们不改 Core、RNG、ID 分配或录制；没有调用时裸 Runtime 行为不变。
- Runtime 与会话的针对性检查使用 `pnpm exec vitest run src/app/runtime src/app/session`；完整检查仍为 `pnpm check`。Core 回归可用 `pnpm exec vitest run src/core/determinism src/core/synthetic`；任务载入（P2-09）用 `pnpm exec vitest run src/core/mission`。

## 会话端口与错误

- [session-host.ts](../../src/app/session/session-host.ts) 是 app 的 DOM-free 调度/生命周期端口。回调在请求返回非负安全整数句柄之后异步交付（0 合法）；注册失败由宿主回收未交给 owner 的部分资源。取消和所有通知均同步返回 undefined。
- [session-errors.ts](../../src/app/session/session-errors.ts) 定义会话参数、状态及执行失败，不替代 Runtime 错误。执行失败保存有序 runtime/scheduler/consumer/cleanup/control 原因，冻结副本与条目但不冻结原异常；onError 不接受 Promise。
- [browser-session-host.ts](../../src/platform/browser/browser-session-host.ts) 在 platform 提供真实 rAF 与 visibilitychange/pagehide/pageshow，无导入副作用或独立循环。每份订阅拥有三个监听，撤销逐项尝试且幂等，部分注册失败先回滚再抛错。只用 app 的 DOM 类型检查；不要导入当前 Node 测试程序或给 Core 加 DOM。
- [synthetic-session.ts](../../src/app/session/synthetic-session.ts) 的 `createSyntheticSession(options,host,onError)` 创建 idle controller，配置复制/验证后只订阅一次宿主。`control` 独立处理 start/pause/resume/restart/exit/dispose；唯一请求凭证按运行与请求身份隔离，0 句柄合法。SessionRun 没有 frame/step/world/publish；结束后读写/注册拒绝，faulted 最后状态仍可读。
- 暂停/隐藏时清瞬时意图、折叠呈现并停止循环；pagehide 独立阻断，返回可见不自动继续。显式 resume 首回调重新锚定，保留最新呈现，不补跑后台时长。`onFrame` 包含真实 projection/render/report，暂停静止通知 report=null。owner 必须 dispose 后再创建，不靠全局单例；现有 React hook/演示生命周期已接入开发与生产合成页面并处理卸载/StrictMode/Fast Refresh 清理。
- rAF、同步控制及宿主通知各构成一个通知边界。域/帧消费者的控制、宿主通知与故障按 FIFO 在当前批次后处理；静止帧也不递归控制。状态通知允许为新运行接线，禁止控制；取消/错误/清理仅允许读取或取消订阅。新增订阅下一批生效，取消立即生效。
- `onCommandsCancelled` 的冻结 FIFO ID 及 reason 是会话反馈，不是 Core 拒绝或 replay 数据。转换通知按取消→暂停静止帧→适用收尾→状态→错误出口排序。`ownCleanup` 同步逆序收尾、至多尝试一次，release 即时移除/执行；释放后的 token 不再保有 owner/run/cleanup。release 失败只置 `cleanupFailed` 并同步抛错，不主动停止运行；后续 start/restart 均被阻断，exit/dispose 仍可执行。error 只保留最近错误，不是历史日志。
- 调用者自身同步操作失败直接抛出；同一同步边界内排队控制的失败单独在末尾交 onError，不合并或重报，排队 resume/start 的请求错误也保留其排队来源。异步边界汇总错误一次，剩余消费者/独立清理仍继续。Runtime listener-failed 提升为 consumer 故障，nowMs/read/request/cancel 为 scheduler；cancel 另置 cleanupFailed，实际迟到回调仍无效。Core faulted 为 runtime，资源/订阅释放为 cleanup。
- 故障保留最后成功 Core/recording 与折叠视图，停止调度并释放运行消费者/资源；无清理失败可 restart，清理失败只能结束并重建 owner。Runtime.frame 抛错不发成功形状帧。onError 抛错时也停止原本健康的循环，以 AggregateError 保留会话错、出口错及后续独立清理错，不重复调用出口。
- recording 使用 P1-03 原格式；wall-clock、runId、暂停/取消都不入记录。间隔 1/4 跨 pause/hidden/resume 的成功 tick 输入、事件与 checkpoint 用真实 replay/独立裸 Runtime 对照；故障前缀仍可导出，restart 记录从 tick 0 重建，旧冻结导出不变。Node 仅证明同版本同运行时一致，真实 Chromium 生命周期证据另见 P1-05 的 03/07。

### 浏览器生命周期复现

以下保留 P1-05 公共 Session API 的独立复现方法；当前完整应用已有合成页面及上述 E2E runner，常规验收优先运行 `pnpm test:e2e`，不必重新执行本手工矩阵。

1. 端口空闲时启动自有 `pnpm dev --host 127.0.0.1 --port 5173 --strictPort`，在独立 Chromium profile/context 打开 `http://127.0.0.1:5173/`，保持菜单未进入演示以免同时创建应用 owner；不改 App/main、不操作用户存储。
2. 在该 origin 的 DevTools 用动态 import 导入 `/src/app/session/synthetic-session.ts` 的 `createSyntheticSession` 和 `/src/platform/browser/browser-session-host.ts` 的 `createBrowserSessionHost`。以 `{scene:{seed:0,tickRateHz:50}}`、实际 host、必填同步错误出口创建 controller。用公共 onStatus/onFrame 与一个自有临时 `<pre>` 显示 phase/runId/tick/error，监听器返回 undefined；只读 projection/render，不写 Core。
3. 通过 `control({type:'start'})` 开始，正常 rAF 驱动 tick。pause 后跨实际 rAF 观察 tick 不变、静止 pair 相同/alpha=0；resume 首通知为 0 tick，pair 仍为最新 tick。restart 得到新 runId/tick0；exit→start 与 dispose→新 controller 分别观察请求/旧句柄隔离。
4. 切到另一实际标签页/窗口，再返回。记录实际 `document.visibilityState` 的变化、hidden 时与返回时的 status/tick；应为 hidden→visible、自动 paused/hidden、返回仍 paused 且 tick 不变，只有显式 resume 才继续。可以单独注册 visibilitychange 观察监听存入自有数组，以便返回后检查；记录时与 host 的三个监听分开计数。
5. 浏览器事件探针可派发 pagehide/pageshow 验证适配绑定/离页阻断，但这不是实际 hidden 或 BFCache 证据。工具若所有标签页持续 visible，该判据保持 blocked；不能覆盖 getter 或使用合成事件代替。
6. 正常 dispose 后 host 的 document visibilitychange、window pagehide/pageshow 各撤销一次，晚到旧回调不产生通知。移除自有探针/额外观察监听，关闭自有 context，停止自有服务器；不清站点全部数据。当前实测结果/工具限制见 [P1-05 浏览器证据](../plan/p1/05/subtasks/07-browser-lifecycle-evidence.md#完成证据)。

#### 已验证的 CDP 自动化路线

普通 Playwright 页面切换持续报告 visible 时，可使用已有工具的 Playwright/CDP 能力创建独立 context，而不是伪造 visibility。2026-10-02 已通过 VS Code 的 `runPlaywrightCode` 在外部 headed Chromium 154.0.8037.95 / macOS 验证该路线；VS Code 是执行入口，不是浏览器引擎或必需的唯一工具。普通页面路线失败的具体原因尚未确认。

1. 选择本机已有兼容 Chromium 二进制，以 `browserType().launch()` 启动自有浏览器；本轮使用 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`，`headless:false`、`args:['--enable-automation']`，并用 `ignoreDefaultArgs` 移除 `--disable-backgrounding-occluded-windows`、`--disable-renderer-backgrounding`、`--disable-background-timer-throttling`。不下载浏览器或新增项目 runner。
2. 用 `browser.newBrowserCDPSession()`，通过 `Target.createBrowserContext` 取得自有 `browserContextId`；在此 context 用 `Target.createTarget` 创建探针页和另一标签页。不要用普通 `browser.newContext()` 页面未触发 hidden 的结果冒充该路线通过。
3. 用 `Target.attachToTarget({targetId,flatten:false})` 取得探针页 session，通过 `Target.sendMessageToTarget` 发送 `Runtime.evaluate`，按 sessionId/消息 ID 接收 `Target.receivedMessageFromTarget` 的结果；明确检查协议错误和 exceptionDetails。探针页先导航到固定 Vite origin，再导入前述公共模块和安装临时 DOM/只读观测，不能在 data URL 的能力预检上宣称 Runtime 已通过。
4. 用 `Target.activateTarget` 激活探针页，确认原生 visible 且 tick 前进；激活另一标签页，确认原生 hidden、自动 paused 与稳定 tick；再次激活探针页，确认 visible 后跨真实 rAF 仍 paused/tick 不变，再显式 resume 验证首帧重锚与后续推进。记录原生 visibilitychange 日志；不使用合成事件、visibility getter 替换或强制生命周期命令。
5. 先 dispose 会话、撤销自有探针和包装，再用 `Target.disposeBrowserContext` 关闭自有 context、关闭自有浏览器/入口页并停止自有 Vite。只清理本轮拥有的资源，不关闭用户 profile 或其他项目的浏览器/服务器。

2026-10-02 P1-06 浏览器验收补充的工具约束（同一机器与工具）：

- `runPlaywrightCode` 的各次调用之间不保留全局变量。在一次调用中 `launch()` 的浏览器，调用结束后会失去句柄。因此真实 hidden 场景要在同一次调用内完成启动、驱动和 `finally` 关闭；若句柄已丢失，按自建的临时 profile 核对进程后，按 PID 停止。
- 跨多次调用的非 hidden 检查，可在 shell 中以临时 `--user-data-dir` 和 `--remote-debugging-port` 启动自管 Chrome，每次调用用 `connectOverCDP` 重连。但在本环境中，这样启动的 Chrome 无论切换标签页还是最小化窗口，都始终报告 visible（`hasFocus()` 也始终为 true），原因未确认，不能用来取得 hidden 证据。
- Playwright 的 `waitForFunction` 与 locator 等待默认用 rAF 轮询，会计入包装 `requestAnimationFrame` 的探针。测量待交付帧请求时，应只在页面内基于定时器的窗口里读取，并先重置最大值。
- `context.addInitScript` 随本次连接注册；重新连接后若要重载页面并保留探针，需要在同一次连接中再次注册。
- 2026-10-02 P1-07 补充（Chrome 154.0.8037.95 / macOS，shell 启动的临时 profile + `connectOverCDP`）：只改变 `Emulation.setDeviceMetricsOverride` 的 `deviceScaleFactor`（CSS 宽高不变）后，`devicePixelRatio` 与 `matchMedia(...).matches` 会变，但 `MediaQueryList` 的 `change` 事件要等媒体查询重新求值才派发。每次改 DPR 后交替发送 `Emulation.setEmulatedMedia({media:'screen'})` 与 `{media:''}`（对普通页面同义）即可触发 Chrome 自己派发真实的 `change`；连续发送相同值不会再次求值。这不是合成事件或 getter 替换，但只证明仿真路径，真实多显示器 DPR 切换仍归 P5。

## UI 投影与指令反馈

P1-06 的合成 UI 层位于 `src/ui/game/`，契约见 [P1-06 spec](../plan/p1/06/spec.md)。它不创建会话、宿主、rAF 或定时器，只消费 Session 的公开通知。

- [synthetic-game-store.ts](../../src/ui/game/synthetic-game-store.ts) 是 Zustand vanilla store。React 只拿到只读 `reader`（getState/getInitialState/subscribe）；UI 模块内部通过单次 `commit(change)` 原子写入一次转换（状态、投影、pending 增减与结果、清空当前运行反馈），无变化时不通知。状态与数组冻结；Core 投影与事件本已深冻结，错误保持原引用。
- [synthetic-session-bridge.ts](../../src/ui/game/synthetic-session-bridge.ts) 按 owner 绑定一个控制器：
  - 状态通知即时写入。新的 running/paused 运行立即发布投影并重建采样基准；idle/disposed 清空投影与运行反馈；faulted 保留最后成功投影。
  - 常规投影在现有 onFrame 中按 10 Hz（100 ms）采样，以“运行 + tick”去重；暂停静止帧立即发布未发布的 tick；恢复后不补发历史快照。
  - 采样时钟由装配层注入（浏览器为 `performance.now`），必须是有限且不倒退的毫秒值；只在需要锚定基准或判断新 tick 是否到期时读取。读取失败或非法值在帧监听器中抛出，由 Session 记为 consumer 故障：
    - 附着发生在状态通知内时，失败延到下一帧报告，避免状态监听因抛错被 Session 移除。
    - 已暂停的运行（如隐藏时 start）附着时不读时钟，在恢复后的首帧锚定基准，因此失败不会被无限期延迟。
    - 立即发布结果时时钟失败，已收到的结果与最新投影先写入，再抛出。
  - 附着是事务性的：运行监听全部注册成功后才写入 running/paused。运行级 consumer 每完成一项注册就用 `binding.own` 交出撤销函数；任一注册失败时，桥接逆序撤销已交出的注册，并在重新订阅状态后再抛出，以便继续观察随之而来的故障。撤销本身也失败时抛 `RollbackError`（P1-08，见下文“页面流转与演示生命周期”），绑定回滚失败同样如此。
  - 一个桥接实例只服务一个会话；成功绑定后 unbind 即终止，只有首次绑定失败可以重试。`onError` 只写 sessionError，必须作为创建 Session 时的错误出口传入；新运行开始且会话 error 为空时清空 sessionError。
- [synthetic-command-feedback.ts](../../src/ui/game/synthetic-command-feedback.ts) 是桥接的运行级 consumer：`submit(type)` 经当前运行提交已有 marker 命令，只有拿到 Runtime commandId 后才记为 pending，投影不提前改变。结果只来自 Core 的域事件：按 `delivery.commandId`（不是 commandIndex 或 entityId）匹配当前运行的 pending，生成 accepted/rejected，并与帧末最新投影同次写入，不等采样窗。其他消费者的命令和重复投递不会生成本面板结果；同步失败写入 actionError 并保留原 cause，暂停或已结束运行的错误来自 Session 本身。提交经 `SyntheticRunBinding.submitCommand` 转发：桥接回滚或 unbind 后该 binding 被注销，不再触及仍在运行的会话。成功提交时，清除旧 actionError 与新增 pending 在同一次写入中完成。
  - Session 的取消通知把匹配的 pending 记为 cancelled 并保留原 reason（user-pause/hidden/restart/exit/dispose/failure），不是 Core 拒绝。运行故障时，仍未终结的 pending 与 faulted 状态在同一次写入中标为 unconfirmed/session-failed：这些命令可能已在被丢弃事件的 tick 中执行，因此既不显示成功，也不自动重提。真实 Runtime 中，同一帧首个 tick 失败只会产生取消（命令尚未消耗），后续 tick 失败只会产生 unconfirmed。
- [synthetic-game-controls.ts](../../src/ui/game/synthetic-game-controls.ts) 的 `syntheticControlAvailability(status)` 按 spec“控件可用性”从状态纯函数推导可用性。结果以面板动作 ID（start/pause/resume/restart/exit/add-marker/remove-marker）为键，同一状态组合返回同一个冻结对象，便于 React selector 按引用比较。`createSyntheticGameControls(store, session).control(type)` 先清空 actionError 再调用 Session 控制，同步失败时写入。Session 仍是唯一判定者，UI 不放宽其判断；cleanupFailed 在 error 被替换后仍禁用 start/restart。
- [synthetic-keyboard-input.ts](../../src/ui/game/synthetic-keyboard-input.ts)（P1-09）提供已接入 owner/页面的 DOM-free 五键消费者，当前绑定及规则见独立[键位文档](./keyboard-input.md)。桥接绑定后调用 `createSyntheticKeyboardInput({store, session, bridge, feedback, controls}, {source})`，也可传 `{unavailable: cause}`。`session` 必须与桥接绑定的是同一控制器；反馈和 controls 复用该 owner 的实例。返回 `{reader, dispose}`：`reader.getSnapshot()/subscribe()` 只读、句柄与快照冻结，active/inactive 只随输入源资格变化，unavailable 保存原始 error，不随 tick 或暂停刷新。释放后读到 inactive，不再通知或接受旧回调。
  - 方向轴只从合法输入回调经 `SyntheticRunBinding.setInput` 转发；与 submitCommand 相同，retired/unbind 时先拒绝，当前运行身份、phase 与通知模式由 Session 校验。每个动作读取实时 Session 状态，不用 store 的旧缓存；命令走现有反馈，P 走现有可用性与 controls。
  - Session 状态订阅仅清本地按住表（所有暂停、结束和运行替换），不提交输入、命令或控制。start/resume 不补发；repeat 不能重建已清状态。源失焦/hidden/pagehide 在仍合法 running 时立即发送变化后的零轴，其余状态依赖 Session 清意图。setInput 同步失败写 actionError=input 并保留 cause；成功的实际轴变更只清旧 input 错误，忽略/no-op 不清错，也不覆盖独立错误。
  - 创建时先取得状态订阅再连接 source；connect 的同步初始信号只更新资格，不接受同步按键或提交输入。普通登记失败（包括回滚成功的 AggregateError）降为 unavailable；`RollbackError`（包括传入的 unavailable 原因）保持初始化失败，撤销已取得的订阅；若消费层回滚也失败，以新的 RollbackError 保留全部原因。dispose 先失效并清本地状态，再逐项释放 source、取消状态订阅，继续独立清理，以 AggregateError 报告全部失败；  owner 已先调用它再销毁 Session，并把失败纳入清理锁存。
- 测试用 [synthetic-ui.test-support.ts](../../src/ui/game/synthetic-ui.test-support.ts) 组合真实 Session、`ControlledHost`、可控时钟，以及记录监听器的会话包装，用来重放旧运行通知。
- [synthetic-demo-owner.ts](../../src/app/composition/synthetic-demo-owner.ts) 是 DOM-free 的应用装配 owner：`createSyntheticDemoOwner(host, clock, render, input)` 依次创建 store、反馈、渲染器（P1-07）、桥接、会话（种子0、Core默认频率，均为合成值）与键盘消费者，不自动 start、无全局单例。input 为 `{source}` 或 `{unavailable: cause}`；兼容未传入时显式报告未连接的 unavailable。对外只读 `store`、`renderer`、`keyboard`（getSnapshot/subscribe），以及 `dispatch(action)`、`dispose()`、`cleanupFailure()`。渲染器仍是桥接第二个运行级consumer，键盘源属于owner而非run。
  - `dispatch` 使用 controls 模块的 `createSyntheticPanelDispatcher`：marker 命令交给命令反馈，其余交给会话控制，动作分类留在 UI 层。
  - 传入的渲染表面在会话创建前即归 owner 所有；表面连接失败且释放成功时改为 unavailable，演示照常运行。表面释放也失败（渲染器抛 `RollbackError`，或表面工厂交来的 `unavailable` 本身是 `RollbackError`）时按初始化失败处理，不创建会话。  会话、桥接或键盘初始化失败时，依次尝试释放已连接输入、销毁已创建会话、解绑桥接与释放渲染器（含表面），store原子重置为status=null，actionError为initialize。回滚失败保持RollbackError及全部独立原因；普通输入登记失败且回滚成功仅键盘unavailable，演示继续可用。
  - `dispose` 先失效/释放键盘，再销毁会话、解绑桥接、释放渲染器，每项清理都会尝试；失败时把同一个 AggregateError 写入 actionError（cleanup）并抛出。重复调用无效果，dispose 或初始化失败后的 dispatch 被忽略。
  - `cleanupFailure()` 返回首个包含清理失败的错误记录 `{cause}`，外壳冻结、此后不再替换或清除，dispose 后仍可读。以下情况会设置记录：
    - 初始化回滚失败（`RollbackError`）。
    - 会话状态首次报告 `cleanupFailed`，或会话错误的失败项中出现 `RollbackError`（运行消费者自有撤销失败）。
    - `dispose` 失败：dispose 先停止 owner 的状态订阅，因此记录的就是抛出的错误。

    Core/调度故障、渲染 failed/unavailable，以及回滚成功的业务 AggregateError 都不设置。
  - 持有方必须先 dispose 旧 owner 再创建新 owner；应用中由下文的演示生命周期保证。
- React 接线：[use-synthetic-demo-owner.ts](../../src/app/composition/use-synthetic-demo-owner.ts) 的 `useSyntheticDemoOwner(lifecycle)` 返回 `{owner, containerRef}`。
  - 容器回调 ref 把元素本身存入 state，作为 effect 依赖：容器为空时不建 owner；画面子树重挂载或换了容器元素时，effect 关闭旧 visit 再打开新 visit。
  - 每次 effect 打开一个visit：先创建 `createBrowserKeyboardSource(container)`（此时未登记监听），再创建WebGL表面，与browser Session host及performance.now交给owner，最后start一次。owner负责所有获取/回滚/释放；hook不单独释放表面或输入源。源在Session与bridge成功后才connect，先前初始化失败不会漏掉输入监听；源登记回滚失败则连同已取得的表面完整收尾，不启动。
  - 卸载、StrictMode 重跑或 Fast Refresh 时，cleanup 先发布 null 再关闭 visit。清理失败锁存后不再创建表面或 owner。
  - 渲染状态监听错误与 dispose 抛出的错误经 `reportError` 报告。[use-synthetic-game.ts](../../src/ui/game/use-synthetic-game.ts) 用 Zustand 的 `useStore(reader, selector)` 订阅单个标量或稳定切片。[SyntheticDevPanel.tsx](../../src/ui/dev/SyntheticDevPanel.tsx) 只接收只读 `store`、`dispatch` 与只读渲染器，按区块分别订阅，使用原生按钮且不注册全局键盘监听；渲染诊断区只在挂载、点击刷新或渲染器更换时读取一次快照。[SyntheticRenderView.tsx](../../src/ui/render/SyntheticRenderView.tsx)（P1-07）提供画面容器（内容盒宽 100%、高 `clamp(240px, 70vh, 720px)`、相对定位、裁剪、黑底；React 不向其中渲染子节点，画布由 WebGL 表面管理）、合成标注，以及用 `useSyncExternalStore` 只在渲染状态转换时更新的状态文字（ready/context-lost 为 status，unavailable/failed 为 alert）。开发面板标题为 h3 `Development panel`、各区块为 h4，画面标题为 h3，以便演示画面的 h2 唯一。它们只在 P1-08 的合成演示画面中出现（开发与生产构建相同），见下文。

## 键盘源与输入区

[keyboard-input.ts](../../src/platform/input/keyboard-input.ts)定义冻结事件/信号/端口和纯按住轴；[keyboard-source.ts](../../src/platform/input/keyboard-source.ts)实现实际生产资格与监听管理，最小DOM-free Host驱动故障测试；[browser-keyboard-source.ts](../../src/platform/input/browser-keyboard-source.ts)只连接DOM，不被Node测试导入。容器拥有keydown/keyup/focusin/focusout，window只有focus/blur/pagehide/pageshow，document只有visibilitychange。释放先逻辑失效，再逐项撤销，撤销失败保留原因，不能声称物理清理成功。

[SyntheticRenderView](../../src/ui/render/SyntheticRenderView.tsx)的现有容器可Tab聚焦，点击canvas或黑边也聚焦，有名称、aria-describedby绑定说明和可见焦点；useSyncExternalStore只订阅键盘状态转换，不按tick刷新。进入演示仍聚焦标题，原生按钮和Tab不受干扰。规则与支持范围只在独立[键位文档](./keyboard-input.md)维护；目标检查为 `pnpm exec vitest run src/platform/input src/ui/game src/app/composition`，完整工程检查仍为 `pnpm check`。实际开发/生产、原生hidden、窗口focus与新owner HMR证据见 [P1-09/05](../plan/p1/09/subtasks/05-browser-input-evidence.md#完成证据)。

## 合成渲染

P1-07 的合成画面位于 `src/render/`，契约见 [P1-07 spec](../plan/p1/07/spec.md)。它是渲染消费者，不是第二条游戏循环；几何、颜色、相机与像素比上限都是合成演示值，不代表原版画面。

- 依赖：`three`（dependencies）与 `@types/three`（devDependencies）同为 0.186 次版本，只从包根导入、只构造 `WebGLRenderer`（WebGL 2，不回退）；不用 React Three Fiber、addons、WebGPU、Worker 或 OffscreenCanvas。生产构建主块因此约 798 kB（gzip 约 216 kB），Vite 的 500 kB 块体积警告按 spec 只记录，包体优化归 P5。
- DOM-free 模块由 Node 测试覆盖：[viewport-layout.ts](../../src/render/viewport/viewport-layout.ts)（固定 4:3、等比居中、DPR 上限 2 与设备尺寸上限 M）、[synthetic-render-frame.ts](../../src/render/synthetic/synthetic-render-frame.ts)（整帧校验与位置插值，每个运行一份历史）、[synthetic-camera.ts](../../src/render/synthetic/synthetic-camera.ts)、[synthetic-appearance.ts](../../src/render/synthetic/synthetic-appearance.ts)、[render-surface.ts](../../src/render/scene/render-surface.ts)（绘制端口）、[synthetic-renderer.ts](../../src/render/synthetic/synthetic-renderer.ts) 与 [webgl-surface.ts](../../src/render/webgl/webgl-surface.ts)。浏览器专用的 [browser-webgl-surface.ts](../../src/render/webgl/browser-webgl-surface.ts) 只创建画布、`WebGLRenderer`、`ResizeObserver` 与 resolution 媒体查询；画布的无障碍名称与渲染器的输出颜色空间由调用方的 `RenderSurfaceOptions` 指定，合成演示传 `SYNTHETIC_SURFACE`（原名称与 Three.js 默认的 sRGB 输出），P2-11 查看器的选择见[资源查看渲染](./modules/render.md#资源查看渲染)。边界回归要求非 `browser-*` 的渲染模块位于 Node 类型程序中（见上文 Lint 规则）。
- 绘制只发生在：表面首次得到有效布局、接线（读 `run.renderFrame()`）、绑定运行的每次 `SessionFrame`（含暂停静止帧）、运行结束（空帧）、布局变化（相同布局不重绘）与上下文恢复。渲染代码不调用 rAF、`setAnimationLoop`、定时器或微任务；暂停时只有后三类事件会重绘。
- 每帧先完整校验（alpha、tick、ID 顺序、kind、坐标、两份状态与运行历史一致、tick 不倒退）再原子更新场景；表面绘制失败时把场景退回上一份成功画面。任何映射或绘制错误使渲染器进入终止的 failed，帧监听与运行收尾从不向 Session 抛错；状态监听抛错经 `reportError` 报告，报告本身失败时丢弃，以保持会话健康。恢复方式（P1-08）：返回菜单后重新进入，会重建会话与渲染器并丢弃本次合成状态；会话不自动暂停，只有释放成功才允许重新进入。
- 初始化回滚失败用 [rollback-error.ts](../../src/app/session/rollback-error.ts) 的 `RollbackError`（`AggregateError` 子类，`cause` 为原始失败，`errors` 依次为原始失败与回滚失败）表示。以下几处在回滚失败时抛出它：`createSyntheticRenderer` 的连接回滚、渲染器 `attach()` 的本地回滚、`createBrowserWebGLSurface` 转交前的回滚。回滚成功时原样抛出原始原因，因此不必按消息或 AggregateError 类型猜测是否释放失败。
- 状态为 ready/context-lost/failed/unavailable/disposed，只在转换时通知；开始释放后不再通知。诊断快照（state、runId、drawnTick、draws、entities、当前 `renderer.info` 的 GPU 三项、layout）只按需读取。
- 释放顺序：撤销上下文监听、DPR 查询与尺寸观察 → 每种 kind 的共享几何与材质各释放一次 → `WebGLRenderer.dispose()` → 若有 `WEBGL_lose_context` 则强制丢弃（缺失只是能力限制）→ 移除画布；每步都尝试，失败汇总为 AggregateError。owner 释放顺序为输入 → 会话 → 桥接 → 渲染器。
- 测试替身 [render-surface.test-support.ts](../../src/render/scene/render-surface.test-support.ts) 记录每次绘制的对象、位置与相机，并按绘制/释放模拟 GPU 统计；它不进入生产导入链。目标回归：`pnpm exec vitest run src/render src/app/composition src/ui/game src/app/session src/app/runtime src/core/synthetic`。[synthetic-renderer-replay.test.ts](../../src/render/synthetic/synthetic-renderer-replay.test.ts) 证明不接、绘制中、failed、context-lost 与无布局时 Core 事件、录制与状态哈希一致。
- 浏览器取证：截图保持 `preserveDrawingBuffer:false`，用元素截图的 Buffer 在页面内 `createImageBitmap` 解码采样；DPR 变化用上文“已验证的 CDP 自动化路线”中的仿真加媒体重新求值；WebGL 不可用用 `--disable-webgl --disable-webgl2 --disable-3d-apis` 启动的隔离 Chrome；上下文丢失用页面画布的 `WEBGL_lose_context`。

## 页面流转与演示生命周期

P1-08 的 React 菜单原型由 P2-11 接入导入、缓存与查看器，契约见 [P1-08 spec](../plan/p1/08/spec.md) 与 [P2-11 spec](../plan/p2/11/spec.md)。它是现代网页界面，不是原版菜单，不提供原版玩法入口；用户操作见[本地导入指南](../guides/local-import.md)。

- [app-flow.ts](../../src/app/flow/app-flow.ts) 是 DOM-free 的页面流转，由邻接 Node 测试覆盖。
  - 冻结快照为 `{screen:'menu'|'import'|'demo'|'viewer', demoVisit, focusTarget, cleanupFailure, viewerFailure}`。
  - 输入为 open-demo、open-import、`{open-viewer, holdsPackage}`、return-to-menu、`{demo-release-failed, cause}` 与 `{viewer-release-failed, cause}`。不适用的输入原样返回同一对象；未持有资源包或查看器已锁存时不能进入查看器（P2-11）；`demoVisit` 耗尽时抛 `RangeError`。两种锁存都只记第一次的原因，各自只阻止自己的画面。
  - 返回菜单的焦点目标：导入画面回到导入入口，查看器回到 `View resources`，演示回到演示入口；对应的锁存已生效时回到菜单标题，在菜单上收到锁存时也移到标题。
  - 页面状态只在内存中，不用路由或 history；刷新后回到主菜单。
- [synthetic-demo-lifecycle.ts](../../src/app/composition/synthetic-demo-lifecycle.ts) 是每个应用实例一个的演示槽位，持有同步锁存，由真实 owner/Session 的 Node 测试覆盖。
  - `visit()` 表示一次进入意图。`open(create)` 先关闭仍持有 owner 的其他 visit；锁存时不调用工厂；否则创建 owner，交付其初始化回滚记录，未锁存时只派发一次 start。同一 visit 不会再次 start，失败的 start 也不重试。
  - `close()` 幂等，释放 owner、交付其清理失败记录，再报告 dispose 抛出的错误。`release()` 供“返回菜单”在切换画面前同步释放。
  - 失败经 `onCleanupFailure` 交给页面流转。该出口抛错时改经 `reportError` 报告；`reportError` 自身抛错被丢弃。无论出口是否失败，锁存都已生效。
- **应用端口（P2-11）：** [App](../../src/app/App.tsx) 由入口传入 [AppPorts](../../src/app/ports.ts)：导入 Worker 端口工厂、资源缓存端口、音频能力与页面生命周期、WebGL 表面工厂、预期包配置与 `reportError`。[main.tsx](../../src/main.tsx) 只传 [createBrowserPorts()](../../src/app/browser-ports.ts) 的生产实现与生产包配置；生产代码不读 URL 参数或全局开关。
  - [use-resource-holder.ts](../../src/app/composition/use-resource-holder.ts) 在 effect 中创建应用外壳的资源持有者（随即列出缓存），卸载、StrictMode 重跑与 Fast Refresh 时释放；外壳每次返回菜单都调用 `relist()`。
  - 主菜单按持有者快照显示原版数据状态：正在检查存储、没有、找到已保存的资源（尚未校验）或存储不可用；持有资源包时列出状态阶梯（保存与恢复附耗时）。存储、恢复与保存的失败以 [FailureNotice](../../src/ui/import/FailureNotice.tsx) 显示 05 的文案与技术细节；持有资源包时存储不可用也照常显示，除非它就是该资源包未保存的原因。
  - 演示生命周期的错误同样交给端口的 `reportError`。
  - 只测缓存适配的浏览器用例经 [resource-cache.ts](../../e2e/support/resource-cache.ts) 的 `loadCacheModules` 打开不含应用的 [blank.html](../../e2e/entries/blank.html)，因为应用一载入就列出缓存，会打开（从而创建）数据库。
  - 入口：持有资源包时有 `View resources`；未持有且有可恢复条目时有 `Open saved resources`（恢复中禁用，由它发起的恢复成功后焦点移到 `View resources`）；完整资源包未保存时有 `Save again`（保存中禁用）。
  - 查看器入口在查看器锁存后禁用并说明原因；外壳以 `viewer-cleanup-failure` 警告显示锁存的原因，导入与演示照常可用。
- **画面模块与 Fast Refresh（P2-11 S-12）：** 外壳的资源持有者在 `App` 自己的 effect 中创建，`App.tsx` 的 Fast Refresh 会重建它并丢掉持有的资源包。因此 [ImportScreen](../../src/app/ImportScreen.tsx) 与 [ViewerScreen](../../src/app/ViewerScreen.tsx) 各在自己的模块中：编辑它们或它们的 hook 时，只刷新该画面，外壳与资源包保留。
  - **StrictMode 下的重跑：** 刷新时 React 只经刷新重建的依赖（`useCallback`、`useMemo` 的结果）重跑 effect；依赖都是 props 与 state 的 effect 不会重跑。所以两个 hook 的 effect 都依赖一个 memo 化的回调：`useImportJob` 的移交，`useViewerOwner` 的 `optionsFor`。编辑 hook 后，作业持有者或查看器所有者即被替换。
  - **接续：** 查看器所有者被替换时（StrictMode 重跑、Fast Refresh），hook 在 effect 清理时记下它所选的条目、变体与视图，交给下一个所有者作为起始状态（`ViewerOwnerOptions.initial`）；离开查看器后再打开则从未选中开始。
  - **诊断：** 查看器槽位从 1 起为所有者编号（`ViewerOwner.serial`），画面区域的 `data-owner` 显示它；作业持有者在页面中同样编号（`ImportJobOwner.serial`），并以 `liveImportJobOwners()` 计数尚未释放的；导入页面的 section 以 `data-job-owner` 与 `data-live-job-owners` 显示。E2E 用它们区分真正的替换与只重渲染。
- **查看器页面（P2-11 S-07 至 S-09）：** [ViewerPage](../../src/ui/viewer/ViewerPage.tsx) 由 `ViewerScreen` 渲染，后者调用 [use-viewer-owner.ts](../../src/app/composition/use-viewer-owner.ts)。
  - **所有者：** hook 在画面区域挂载后经外壳的查看器槽位（`createViewerLifecycle`）打开所有者。表面由端口的 `createSurface(container, VIEWER_SURFACE)` 在槽位决定创建所有者之后才创建，所以锁存后不会再有画布；创建失败时改为不可用的渲染器，回滚也失败（`RollbackError`）时槽位锁存；卸载、StrictMode 重跑、Fast Refresh 与更换容器时关闭槽位。“Return to menu”先同步关闭槽位再切换画面，所以同步的释放失败在菜单出现前锁存；音频 `close()` 被拒绝则在观察到时锁存。
  - **页面：** 完整资源包显示其内容身份（manifest 身份与转换器版本），供核对恢复前后是否相同；按种类（模型、效果、图像、调色板、布局、字库）列出条目，默认不选中；所选条目显示失败（code、位置、原因）或变体：模型的部件列表单选（附内容与置信度）、效果的视图单选（附各形状的原值、绘制字节与贴图状态；仅含跨接缝面的项显示“Seam interpolation unconfirmed”标记）、模型的中性光开关。导弹贴图只应用旋转 0，不提供旋转选择。资源包不完整时始终显示说明与各组状态。
  - **画面：** 4:3 区域（`viewer-view`）可用 Tab 到达，有焦点轮廓与含当前 Asset ID 的无障碍名称；键盘操作见[键位文档](./keyboard-input.md#资源查看器的诊断键p2-11)，同样的操作有按钮。渲染状态以 `status` 或 `alert` 显示；“Refresh diagnostics”按需读出渲染诊断（状态、条目、绘制次数、GPU 计数、布局、位置与视图）。
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
- [App](../../src/app/App.tsx) 是应用外壳，持有页面流转状态与生命周期，只渲染当前画面；演示画面以 `demoVisit` 为 key，由外壳内的 `DemoScreen` 调用上述 hook。锁存后在所有画面显示含原始原因的 alert，并提示刷新页面；主菜单原生禁用 `Start synthetic demo`，导入入口照常可用。进入演示前，外壳先用当前状态同步校验转换：`demoVisit` 耗尽时以 alert 显示 `RangeError` 并停留在主菜单，不创建 owner；实际提交仍走函数式更新，双击时每次激活至多一次转换。
- [ui/pages/](../../src/ui/pages/) 提供菜单与合成演示画面及页面焦点 helper，不在 window/document 注册键盘监听；导入与查看器分别在 `ui/import/`、`ui/viewer/`。
  - 画面标题为 h2，`tabIndex=-1`：进入画面时聚焦标题；返回菜单时按 `focusTarget` 聚焦打开该画面的入口，锁存时聚焦菜单标题；首次加载不移动焦点。
  - 演示画面中，`Return to menu` 是标题之后的第一个控件。
  - 导入页面（P2-11，[ImportPage](../../src/ui/import/ImportPage.tsx)）见上文“导入页面”。
  - 样式在 [app.css](../../src/app/app.css)：响应式、按钮 `:focus-visible` 有可见 outline。
- 验证分层：页面流转、owner 记录与生命周期接线用 Node 测试。React 画面、焦点、键盘与往返释放用上文“已验证的 CDP 自动化路线”在开发服务器与 `vite preview` 中取证。稀有失败（failed、faulted、锁存）的 React 文案与焦点接线以 Node 测试加代码审阅为证，不伪造浏览器复现。不引入 jsdom、React Testing Library 或 Playwright 依赖。
