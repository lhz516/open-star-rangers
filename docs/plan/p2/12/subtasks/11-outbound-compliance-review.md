---
type: plan
status: active
phase: P2
task: "12"
subtask: "11"
updated: 2026-10-08
---

# 11 — 产物出站能力审阅与来源/许可

**契约来源：** [spec](../spec.md) 的 S-07、[产物出站 API 清单](../spec.md#产物出站-api-清单)；AC-12、AC-13。
**依赖：** 22。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 依赖 22，使审阅对象是呈现修正之后的最终候选构建；之后若再有生产代码变化，由最终对齐判断是否重做。
- **出站能力审阅（AC-12）：** 构建当前候选（`pnpm build`），审阅全部页面与 Worker JavaScript 及其 source map 来源：
  - 检查 `fetch`、`XMLHttpRequest`、`WebSocket`、`EventSource`、`sendBeacon`、`importScripts`、WebRTC、WebTransport、Service Worker、cookie、导航与弹窗，以及 DOM/CSS 的资源 URL、表单与 link ping。字符串搜索只用于定位，须检查别名、属性访问与调用方的数据流。
  - 每处记录 chunk 文件名、API、来源模块、分类（应用自有、构建注入的辅助、依赖）与可达性理由：应用自有的数据外发调用为 0；正常的静态模块 Worker 与模块 URL 单列允许用途；依赖须写明是否可从实际调用到达、参数是否只是静态代码 URL。无法判断的路径记为证据缺口，不默认安全。
  - 定位辅助脚本放在被忽略的 `local/research/p2-12/outbound/`；它只读本项目的构建产物，不读原版数据。
- **来源、许可与原版隔离（AC-13）：**
  - `pnpm check:compliance` 通过，original 与 licenses 两类都完整且 0 条发现；
  - `dist/compliance-inventory.json` 中导入 Worker chunk 及其 map 已归属到来源模块；
  - 自 P1-12 审阅以来依赖集合未变：比较 `pnpm-lock.yaml` 与 P1-12 最终对齐提交（`e5383d8`）的差异，并核对 `THIRD-PARTY-NOTICES.txt`；
  - `git ls-files` 中没有 `local/` 路径、原版截图、采样或解码结果。
- 结论只作一次性审阅证据，不新增持久门禁（spec 技术决定 7）。

## 不包含

- 运行时网络审计（02、06–10）；CI 与持久合规门禁（P5）。
- 修改应用代码；发现可达的外发调用时按 spec 技术决定 15 回到责任任务并阻塞 AC-12。

## 关键文件与契约

- [cli.ts](../../../../../tools/compliance/cli.ts)、[build-plugin.ts](../../../../../tools/compliance/build-plugin.ts)（Worker 资产归属）、[distribution.ts](../../../../../tools/compliance/distribution.ts)；[工程约定的构建许可声明](../../../../engineering/README.md#构建许可声明)。

## 写入范围

- `local/research/p2-12/outbound/**`：定位辅助脚本与审阅明细（被忽略）。

## 验收标准

- [x] AC-12：候选全部页面与 Worker chunk 的主动与被动出站路径都有来源、调用与数据流、用途结论；应用自有的数据外发调用为 0；没有可达且能携带本地资源外发的依赖调用；没有未判定路径被当作安全。
- [x] AC-13：`pnpm check:compliance` 通过且两类 0 条发现；Worker chunk 与 map 已归属；依赖集合自 P1-12 未变、声明已核对；跟踪文件中没有原版内容或 `local/` 路径。
- [x] 证据写明审阅的候选提交与构建指纹。

## 验证方法

- 命令输出与清单写入完成证据；清单只含本项目代码的位置与结论。
- 不涉及浏览器验证或原版对照。

## 完成证据

- **候选：** 提交 `2f9a8dac5ed395753737d14afe02e3dc1d039724`（本 worker 的基点，即认领提交；工作树干净），构建指纹 `sha256:4d6c6bdcab2f3f334fdda1c1436f24b9e7493a204bc936c1ae780f0605b36fdd`（9 个文件，按 [12](./12-candidate-check.md#完成证据) 的算法），与 12 的候选 `97b70de` 相同；`97b70de..2f9a8da` 中 `src/` 只改了测试与 test-support 文件。2026-10-08 审阅，Node v22.22.0、pnpm 12.8.1、macOS 26.6（arm64）。22 之后的 P2-06 修复会改变构建，届时由 26 判断是否重做本项。
- **方法：** 脚本与明细在被忽略的 `local/research/p2-12/outbound/`，只读本项目的 `dist/`。
  - `outbound-scan.ts`（在检出根运行 `node local/research/p2-12/outbound/outbound-scan.ts`）：工作树有改动时拒绝运行；运行 `pnpm build` 并计算构建指纹。用 ESLint 的作用域分析列出每个 chunk 的全部自由（全局）引用及其用法，另记：
    - 出站相关的成员访问，包括以属性形式取得的构造函数（如 `new window.WebSocket`）；
    - 全局对象的别名：变量绑定自全局对象、`defaultView`/`contentWindow`/`ownerDocument` 等属性或 `||`、`?:` 的任一分支，按不动点传递；以及从全局对象或别名解构、`Reflect.get` 一类的反射，和以非字面量为键的计算访问；
    - URL 类的对象属性（JSX 属性）、调用的标签名参数、含 URL 协议、CSS `url(`、属性名或网络 API 名称的字符串；
    - `import()`、`import.meta`、静态 `import`/`export … from`、`eval`、`Function` 与字符串计时器。

    每处经该 chunk 自己的 source map 归属到来源模块与原行；HTML 与 CSS 另扫资源属性与 CSS URL 函数。
  - **定位器对照：** `--control` 对一段合成 chunk 断言 49 种构造全部检出，含 `const f = fetch` 别名、`self["fe" + "tch"]`、经别名的别名做计算访问、解构 `fetch`、`Reflect.get(globalThis, k)`、`new window.WebSocket`、JSX 的 `href`/`ping`/`src`/`action`、`innerHTML`、CSS `url(` 与静态 `import`，结果 `PASS`。删去其中一项（`sendBeacon`）后为 `FAIL`；关闭别名传递后三项别名访问漏检，也为 `FAIL`，退出码均为 1。
  - `source-view.ts` 读取 map 中的来源原文，并标出哪些原行在产物中有映射，用来判断依赖代码是否被打包。
  - 字符串与名称只用于定位；每组都按来源、调用方与数据流人工检查，逐处结论在同目录的 `review.md`。
- **扫描概况：**
  - **Worker chunk** `import-worker-BhloFmA_.js`：78 个来源，全部在 `src/`，没有依赖与构建辅助代码。26 个自由引用只有 ES 内置对象、`Blob`（仅 `instanceof`）与 `self`，没有任何网络、存储、Worker、URL 或动态加载 API。
  - **页面 chunk** `index-BIe887m_.js`：125 个来源，86 个自由引用。唯一的 `fetch` 在未映射的 Vite 辅助代码中；19 处未映射命中全部属于开头的 Rolldown 运行时与 Vite modulepreload polyfill。
  - 两个 chunk 都没有 `eval`、`Function`、字符串计时器、`import()`、静态 `import`/`export … from`，没有直接对全局对象以非字面量为键的访问，没有从全局对象解构或对其反射，也没有命名网络 API 的字符串字面量，所以计算键拼不出这些 API。
  - **别名：** 页面 chunk 有 87 处别名绑定（压缩器复用变量名，结果偏多）：86 处在 react-dom，1 处是应用把 `document` 或 `window` 作为事件目标。对别名的 7 处计算访问都在 react-dom，键是数组或 NodeList 的数字下标，或 React 的随机标记键（`"_reactListening"` 与 `"__reactContainer$"` 加随机串），不会指向网络 API。全局对象作为参数传入的位置人工检查：Worker 的 `runImportHost(self, …)` 只用 `addEventListener`、`postMessage` 与 `close`；应用的事件宿主只用 `addEventListener`/`removeEventListener`；three 的 `setContext(self)` 只用 `requestAnimationFrame`/`cancelAnimationFrame`；Vite polyfill 只把 `document` 交给 `MutationObserver.observe`。
- **出站 API 清单（AC-12）：**

  | chunk | API 或路径 | 来源模块 | 分类 | 可达性与用途 |
  |---|---|---|---|---|
  | index | `new Worker(new URL("/assets/import-worker-BhloFmA_.js", import.meta.url), { type: "module" })` | `src/platform/workers/browser-import-worker.ts` | 应用自有 | 允许用途：同源的静态模块 Worker 脚本；URL 是构建常量，不携带数据 |
  | index、Worker | `postMessage` 与 `message` | `src/platform/workers/worker-port.ts`；`src/workers/import-worker.ts`、`import-host.ts` | 应用自有 | 页面与自己的专用 Worker 之间的进程内通道，不是网络 |
  | index | `indexedDB`、`IDBKeyRange`、`navigator.storage.estimate()` | `src/platform/storage/browser-resource-cache.ts` | 应用自有 | 本地存储与配额，不是网络 |
  | index、Worker | `<input type="file">`；`Blob.slice().arrayBuffer()` | `src/ui/import/ImportPage.tsx`；`src/platform/files/blob-byte-source.ts` | 应用自有 | 读取用户选择的本地文件 |
  | index | `AudioContext`、`AudioBuffer` | `src/platform/audio/browser-audio-controller.ts` | 应用自有 | 从 payload 缓冲本地播放，没有 URL |
  | index | DOM 与 JSX 宿主元素 | `src/ui/**`、`src/render/webgl/browser-webgl-surface.ts` | 应用自有 | 只有文本、列表、`button`（均为 `type="button"`）、`input`（file、radio、checkbox）与 `document.createElement("canvas")`。没有 a、img、form、link、script、iframe 等元素，没有 URL 类属性、`dangerouslySetInnerHTML` 或属性展开，源码中也没有 `url(`，所以应用属性不会触发被动加载、导航或提交 |
  | Worker | `file:/<路径>` 字符串 | `src/original-data/disc/file-range.ts`、`source/identify-source.ts` | 应用自有 | 错误位置的标签，从不作为 URL 使用 |
  | index | `fetch(link.href, …)` 与 `MutationObserver` | Vite modulepreload polyfill（inventory 归属 vite@8.3.1） | 构建注入的辅助 | 载入时运行一次；`relList.supports("modulepreload")` 为真（Chrome）时立即返回。否则只请求 `link[rel=modulepreload]` 的 href：`index.html` 中没有这种链接，包内能创建它的 React DOM `preloadModule`/`preinitModule` 也未被调用。最多是对 `dist/` 文件的同源 GET，没有请求体，不携带本地数据 |
  | index | `__commonJS`、`__toESM` 等运行时辅助 | Rolldown 运行时（rolldown@1.2.12） | 构建注入的辅助 | 只操作对象，没有 I/O |
  | index | `preconnect`、`prefetchDNS`、`preload`、`preloadModule`、`preinit`、`preinitModule`，以及 `<link>`/`<script>` 资源的提升与创建 | react-dom | 依赖 | 不可达：这些导出因客户端依赖 react-dom 的内部对象而被打包，但没有模块调用它们（应用只从 `react-dom/client` 导入 `createRoot`）；应用也不渲染 link、script、style、meta、title |
  | index | 宿主属性设置器（`src`、`srcSet`、`href`、`xlink:href`、`action`、`formAction`、`poster`、`ping`）与 `<img>` 的 `src` | react-dom | 依赖 | 通用设置器可达，但值只来自应用属性，应用不传任何 URL 类属性 |
  | index | 表单动作（`FormData`、`requestFormReset`、`action`/`formAction`） | react-dom | 依赖 | 不可达：应用没有 `<form>` |
  | index | `innerHTML`（`dangerouslySetInnerHTML` 与 `<script>` 占位） | react-dom | 依赖 | 不可达：应用不用 `dangerouslySetInnerHTML`，也没有 `<script>` 元素 |
  | index | `navigation.navigate(currentEntry.url, { history: "replace" })`（默认过渡指示，自行拦截） | react-dom | 依赖 | 不可达：生产版 `createFiberRoot` 把它传给 `FiberRootNode`，后者忽略该参数，此外没有调用点；应用也不用 transition 或 action |
  | index | `navigation.transition`、`document.fonts`、`navigator.connection.downlink`、`getComputedStyle`、`CSS.escape`、`btoa`；iframe 的 `contentWindow.location.href` | react-dom | 依赖 | 只读或本地计算，不发请求；应用不用视图过渡，也没有 iframe |
  | index | `https://react.dev/errors/…?args[]=…` | react、react-dom | 依赖 | 只是抛出错误时的消息文本，从不请求 |
  | index | `__REACT_DEVTOOLS_GLOBAL_HOOK__`；`__THREE_DEVTOOLS__` 的 `CustomEvent` | react-dom；three | 依赖 | 只在用户自装的扩展定义该全局时可达，是页内的对象传递或事件，构建中没有网络 API；扩展自身的行为不在本构建范围内 |
  | index | `reportGlobalError`（`ErrorEvent`、受 `typeof` 保护的 `process.emit`）；scheduler 的 `MessageChannel`、`setTimeout` | react；scheduler | 依赖 | 本地错误报告与进程内调度 |
  | index | 加载器（`FileLoader` 与 `ImageBitmapLoader` 的 `fetch`、`ImageLoader` 的 `img.src`、`TextureLoader`、`ObjectLoader`、`AudioLoader` 等） | three | 依赖 | 不在包内：这些原行没有映射 |
  | index | `createElementNS(xhtml, name)` | three | 依赖 | 包内只有创建 canvas 的调用点；创建 img 的调用点不在包内 |
  | index | HTML 纹理（`layoutsubtree`、`texElementImage2D`、`canvas.appendChild(image)`） | three | 依赖 | 不可达：`HTMLTexture` 类不在包内，应用只创建 `DataTexture` |
  | index | `ImageUtils.getDataURL`、`Source.toJSON`（读 `image.src`、写 `url`）；WebXR | three | 依赖 | 序列化或设备 API，应用不调用 `toJSON` 与 `xr.setSession`，也不发请求 |
  | index | zustand 的 store 与订阅 | zustand | 依赖 | 无出站 |

  - **其他产物：** `index.html` 只引用同源的 `/assets/index-BIe887m_.js`（模块脚本）与 `/assets/index-vsXnrZeb.css`，没有 favicon 链接、meta refresh、base、表单或内联事件；浏览器自动的 `/favicon.ico` 探测由运行时审计（02）记为已知 404。CSS 没有 `url(`、`@import`、`image-set(` 或 `@font-face`。`.map` 只由 `sourceMappingURL` 注释引用，开发者工具打开时才读取，页面代码不请求。`LICENSE.txt`、`THIRD-PARTY-NOTICES.txt` 与 `compliance-inventory.json` 是不被页面载入的静态文件。
  - **结论：** 应用自有的数据外发调用为 0；依赖中能携带本地资源外发的可达调用为 0；没有未判定的路径。用户自装扩展的行为与浏览器的自动请求不属本构建的代码，前者不判定，后者由运行时审计覆盖。本清单只对这一候选成立，不是通用的自动安全证明（spec 技术决定 7）。
- **合规检查（AC-13）：**
  - `pnpm --silent check:compliance`：退出码 0，`passed: true`，0 条发现。各范围都 `completed`：worktree 850、index 850、untracked 0、build 9（original），dependencies 155、distribution 8、artifacts 9（licenses）。coverage 为 darwin/arm64，另列 24 个未安装的 optional 包。`check:original` 与 `check:licenses` 分别运行也都 `passed: true`、0 条发现。检查后 `dist/` 的指纹不变。
  - **Worker 归属：** inventory 中 `assets/import-worker-BhloFmA_.js` 与其 `.map` 各归属 78 个 `project:` 来源（content 25、original-data 48、workers 4、platform 1），与 map 的 sources 集合相同，记录的 SHA-256 与文件一致。[工程约定](../../../../engineering/README.md#构建许可声明)要求的三个条件都成立：脚本末尾的 `sourceMappingURL` 指向该 map，map 的 `file` 指回脚本，页面 chunk 以 `/assets/import-worker-BhloFmA_.js` 引用它。页面 chunk 另归属 react、react-dom、scheduler、three、zustand，以及 vite、rolldown 注入的辅助代码。
  - **依赖集合：**
    - `git diff e5383d8 HEAD` 中 `pnpm-lock.yaml` 与 `.nvmrc` 没有变化（锁的 SHA-256 为 `114caf38…3aff36`，与 [P1-12/08](../../../p1/12/subtasks/08-local-evidence-docs.md#完成证据) 记录的相同）；`package.json` 只有 `ff06c01` 改的 lint 脚本参数，依赖字段不变。
    - 锁定的依赖图因此不变；当前安装枚举 155 个实例，与 P1-12 记录的数量相同（P1-12 未留存逐实例清单，这里不作逐实例比较）。分发包仍是 react 19.3.0、react-dom 19.3.0、scheduler 0.28.0、three 0.186.1、zustand 5.0.15、vite 8.3.1、rolldown 1.2.12，都是 MIT；lightningcss（MPL-2.0）与 spdx-exceptions（CC-BY-3.0）仍不分发。
    - `THIRD-PARTY-NOTICES.txt` 为 124,340 字节，SHA-256 `ef1281bd…5be4`，与 P1-12/08 逐包核对全文的版本逐字节相同，含上述 7 个包各自的段落；`LICENSE.txt`（`cca635a2…6db0`）也与 P1-12 相同。
  - **原版隔离：**
    - `git ls-files` 有 850 个文件，全部是 us-ascii 或 UTF-8 文本（ts 411、md 397、tsx 14、json 8、java 6、yaml 4、html 3、py 2、其余 5），没有 `local/` 路径。
    - HEAD 的历史中从未出现 `local/` 路径或二进制文件（`git log --name-only`、`git log --numstat`）。
    - 自 P2-12 的首个提交 `0903ebf` 起新增的行中，没有成串的十六进制字节或长 Base64；original 扫描 0 条发现。
- **Rubber-duck：** 无阻塞问题；3 个非阻塞问题均已处理，并重跑扫描与对照。
  - 对照没有覆盖经变量的全局别名、解构、`Reflect.get` 与以属性取得的构造函数：扫描增加这些检测与 10 个对照用例，并人工检查作为参数传入的全局对象（见上文“别名”）。新增命中均已判定，不改变结论。
  - 扫描原先只要求构建前后状态相同，没有拒绝已有改动的工作树：改为有改动时拒绝运行。本次结果在干净的工作树上取得（提交本文件前暂存其改动后重跑）。
  - “155 个实例与 P1-12 一致”超出了 P1-12 留存的证据：改为锁定依赖图不变、实例数量相同。
- **未修改仓库代码：** 本提交只增加本文件的证据；本地脚本不提交，无需 simplify。
- **文档影响：** 本项是一次性审阅证据，不新增门禁（spec 技术决定 7）。[工程约定的构建许可声明](../../../../engineering/README.md#构建许可声明)对 Vite/Rolldown 辅助代码与 Worker 资产归属的描述与本次结果一致，指南、原版事实与 U 项都不受影响，无需更新。
