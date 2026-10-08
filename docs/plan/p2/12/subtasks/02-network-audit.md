---
type: plan
status: active
phase: P2
task: "12"
subtask: "02"
updated: 2026-10-07
---

# 02 — 网络审计：分类、采集与控制样本

**契约来源：** [spec](../spec.md) 的 S-06、AC-11 与[网络审计](../spec.md#网络审计)；为 AC-10 提供审计实现（03、06–10 使用）。
**依赖：** 01。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **纯分类模块（计划新增 `tools/e2e-network-policy.ts`）：** 输入为采集到的事件，输出违规列表（类别、发起者、阶段）。
  - 生产允许集：同源 `GET`、无请求体、无查询串，路径属于 `/` 或本候选 `dist/` 的明确文件清单（复用 [distribution.ts](../../../../../tools/compliance/distribution.ts) 的 `ordinaryFiles`），资源类型与用途对应；`/favicon.ico` 的已知 404 单列，不扩大允许集；无 WebSocket、EventSource、新页面、cookie、`Cookie` 头或 Service Worker 注册。
  - 开发规则：只放行确认为应用/测试入口模块图与 Vite 工具链的同源 `GET`/`HEAD`，记录具体路径、资源类型与允许的 Vite 查询键/值模式；唯一允许的 WebSocket 是已识别的 Vite HMR 连接。不得以“任意同源 GET”或从捕获结果生成的白名单放行。
  - 测试专用请求（F-11 缺失 Worker、控制样本端点）由用例逐条声明方法、路径、无数据约束与预期错误，不放宽产品用例。
  - 金丝雀匹配：对 URL（解码后，含 fragment）、请求头、请求体、cookie、WebSocket 帧检查原文、URL 编码与 Base64 表示。
  - 未知发起者、未覆盖目标作为“证据不完整”，不计为零泄露。
  - 单元测试（计划新增 `tools/e2e-network-policy.test.ts`，在 Vitest 范围内）覆盖每条规则与每种编码的正反样本。
- **采集器（计划新增 `e2e/support/network-audit.ts`）：** 在产品脚本运行前建立 context/目标级观测，覆盖主页面、专用 Worker、导航与刷新、页面关闭；可附加到 Playwright 的 `page`/`BrowserContext`，也可附加到持久 profile 与 [native-lifecycle.ts](../../../../../e2e/support/native-lifecycle.ts) 启动的浏览器（10 使用）。
  - 记录 HTTP(S) 请求的目标 ID、发起者（页面/Worker/浏览器，无法归属须标记）、方法、URL、请求头、请求体长度、标记命中，包括失败、被路由拦截与被 CSP 阻止的尝试；WebSocket 建连与双向帧；EventSource；导航 URL；弹窗；cookie 写入与发送尝试；Service Worker 注册尝试及结束状态；页面与 Worker 的 CSP 违规。
  - 页面级请求事件是否覆盖 Worker 未经本项目验证；需要时用 Chrome DevTools 协议自动附加 Worker 目标。以控制样本证明可见性，不以 API 名称为证。
- **审计夹具（计划新增 `e2e/support/audited-test.ts`）：** 扩展 [browser-test.ts](../../../../../e2e/support/browser-test.ts) 的 `test`，提供 `audit` 夹具：接收金丝雀集合（05 提供）与声明的测试请求；用例结束时断言零意外违规，并附按类别统计的摘要（只含合成数据）。不修改 `browser-test.ts`。
- **控制样本：**
  - 计划新增 `e2e/network-audit-controls.spec.ts`（两个项目）：允许的静态加载通过；页面 `fetch`、`sendBeacon`（含关闭阶段）、专用 Worker `fetch`（生产项目中 Worker 脚本由测试路由在同源的非 `dist/` 路径上供应，不进入 `dist/`），分别在 URL、头部、请求体携带标记；页面被动图像请求、带 fragment 的导航与 cookie 各有可检测样本；全部被分类检出，Worker 那条归为 Worker 发起；被 CSP 阻止与实际传出分别判定。
  - 计划新增 `e2e/network-audit-controls.development.spec.ts`：非 HMR 的 WebSocket 建连与带标记的发送帧被检出；Vite HMR 连接被识别为允许。
  - 控制样本只发往测试自有的拦截路由或本机 loopback 接收端，不访问外部主机；它们的违规是预期结果，不计入产品零违规。

## 不包含

- 联合与失败用例中的使用（03、06–10）；金丝雀的合成数据嵌入与到达证明（05）。
- 持久的网络门禁或 CI（P5）；产物静态出站审阅（11）。

## 关键文件与契约

- [browser-test.ts](../../../../../e2e/support/browser-test.ts)：既有错误收集与 `expectDiagnostic`。
- [resource-cache.ts](../../../../../e2e/support/resource-cache.ts) 的 `requestsDuring` 只看主页面请求，不作为审计实现。
- [preview-csp.ts](../../../../../tools/preview-csp.ts)：生产预览的 `connect-src 'self'`、`worker-src 'self'`。
- 计划新增的四个文件见上。

## 写入范围

- `tools/e2e-network-policy.ts`：纯分类与金丝雀匹配。
- `tools/e2e-network-policy.test.ts`：单元测试。
- `e2e/support/network-audit.ts`：采集器。
- `e2e/support/audited-test.ts`：审计夹具。
- `e2e/network-audit-controls.spec.ts`：两个项目的控制样本。
- `e2e/network-audit-controls.development.spec.ts`：开发项目的 WebSocket 控制样本。

## 验收标准

- [x] AC-11：两个项目中，页面 `fetch`、`sendBeacon`（含关闭阶段）、专用 Worker `fetch`，以及被动加载、导航、cookie 的标记全部被检出并正确分类；Worker 请求归为 Worker 发起；开发项目的非 HMR WebSocket 与标记帧被检出；允许的静态加载通过；被 CSP 阻止与实际传出分别判定。
- [x] 单元测试覆盖生产允许集、开发规则、测试声明请求与三种编码的金丝雀匹配，每条规则都有正反样本。
- [x] 未知发起者或未覆盖目标使审计报告“证据不完整”，有对应测试。
- [x] 控制样本不访问外部主机；没有新依赖；`browser-test.ts` 未修改。
- [x] `pnpm test -- tools/e2e-network-policy.test.ts`、`pnpm typecheck`、`pnpm lint` 与两个项目的控制样本 E2E 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 在隔离 context 中只用合成数据：`pnpm exec playwright test e2e/network-audit-controls --project=development` 与 `--project=production`。
- 控制样本失败时 AC-10 不能通过；须更换采集机制直到通过，不以页面级请求列表代替。
- 不涉及原版对照。

## 完成证据

- **2026-10-07 — 实现（本机 Chrome 155.0.8059.39、Playwright 1.63.0、macOS，无头，1280×800）：**
  - **分类（[e2e-network-policy.ts](../../../../../tools/e2e-network-policy.ts)）：** 纯函数 `auditNetwork(capture, policy)` 输出违规（类别、通道、发起者、阶段、目标、主题 URL、`delivery`、金丝雀命中）、证据缺口与按 `product`/`toolchain`/`test`/`known-404`/`local` 单列的放行项，以及未出现的声明请求。生产允许集：同源 `GET`、无请求体、无查询串、路径属于候选 `dist/` 文件清单，按扩展名限定资源类型（`.map`、`compliance-inventory.json` 无产品用途即违规）；favicon 只认浏览器探测的特征（类型 `Other`、页面发起、404 或被放弃），脚本发出的同路径请求仍违规。开发规则逐条列出：入口文档、测试入口（查询键限 `TEST_ENTRY_QUERY`：`worker`、`cache` 为小写连字符名称，`capacity=insufficient`、`audio=unavailable`，`hold` 为至多三个 `commit`/`list`/`restore` 的逗号列表）、Vite 客户端/环境/预构建依赖（`v` 为 8 位十六进制）、仓库中实际存在的 `src/` 模块（查询键限 `t`/`import`/`worker_file`/`type=module`/`direct`），无“任意同源 GET”。唯一允许的 WebSocket 是同源 `/?token=` 且协商 `vite-hmr` 的页面连接，发送帧须严格是 Vite 客户端的 `ping` 或指向现有模块的 `vite:invalidate`。声明请求按方法、路径、查询模式匹配且不得带体，`expect` 可核对状态或 `failed`，未应答不算失败。金丝雀在 URL（含 fragment）、请求头、Cookie、请求体、发送帧、cookie 值、弹窗/导航/Service Worker/CSP 阻止 URL 中按原文、百分号/表单解码与 Base64（三种对齐、标准与 URL 安全字母表，含被百分号编码的 Base64）匹配，短于 8 字节的标记拒绝使用。
  - **采集（[network-audit.ts](../../../../../e2e/support/network-audit.ts)）：** 页面级 CDP 会话（非 flatten 自动附加 Worker）记录请求/ExtraInfo 头部（含网络层添加的 `Cookie`）、响应、失败与阻止原因、WebSocket 建连与双向帧、主框架导航（含同文档 fragment）、`Audits` 的 CSP 问题（页面与 Worker）、Service Worker 版本状态；文档开始前注入的钩子经 CDP binding 报告 `document.cookie`/Cookie Store 写入与 `register()` 尝试及其结果。浏览器级会话以 `Fetch` 拦截每个到达网络层的请求（只继续、不改动；控制样本可用 `serve` 在该层应答）并发现新目标，结束时读取 cookie jar。两路以请求 ID 合并：`sent`（经网络层发出）、`intercepted`（测试路由应答或未到网络层）、`blocked`（CSP 等）分别判定。可附加 Playwright 页面、持久 profile 页面与另一 CDP 客户端创建的目标（`attachTarget`，供 10 的原生浏览器）。
  - **夹具（[audited-test.ts](../../../../../e2e/support/audited-test.ts)）：** 扩展 `browser-test.ts` 的 `test`（未修改该文件），自动 `audit` 夹具：`canaries`、`declare`、`expectViolations`/`expectGaps`（仅控制样本）、`phase`、`attachPage`/`attachTarget`、`close`、`ready`、`serve`、`report`、`mode`；覆盖 `observeErrors` 使审计先于错误检查建立、晚于其拆除，拆除时以 `close` 阶段关闭页面后断言零意外违规、零缺口、无未出现的声明请求，并附只含合成数据的按类别摘要 `network-audit`。模式由 origin 决定（预览 origin 为生产）。
- **探针实测与机制修正（控制样本暴露、按验证方法更换机制直到通过）：**
  - 页面级 Network 看不到页面关闭或导航卸载时的 keepalive beacon，浏览器级 `Fetch` 能看到，故加入浏览器级视图；其中 Worker 请求的 `frameId` 是页面的，归属只能来自 Worker 会话。
  - 被 CSP 阻止的 `fetch`/WebSocket 不产生请求事件，只有 `Audits` 的 `ContentSecurityPolicyIssue`（含被阻止 URL）；`Audits.enable` 会补报此前的问题。
  - Chrome 在模块 Worker 主脚本到达后才创建其目标，Playwright 附加后立即 `runIfWaitingForDebugger`，一次恢复即放行，故审计的 Worker 会话可能晚于 Worker 首个动作。修正：主脚本（请求 ID 即 Worker 目标 ID）经过网络层后，暂停其他非文档请求直到该 Worker 会话就绪（≤3 s，脚本被拒则提前放行）；请求按任一渲染器 Network 事件归属（`requestWillBeSent` 优先，浏览器把 Worker 请求的 ExtraInfo 报在页面会话，不作归属依据）。Worker 只有在主脚本经过网络层或被拒（因而从未运行）时才算覆盖；页面路由应答的脚本以 Playwright 自身的响应按 URL 顺序配对判断是否被拒。未就绪前开启的 WebSocket、未到网络层而只见后续事件的请求、未经网络层的 Worker 脚本均使目标“未覆盖”。
- **验证：**
  - `pnpm exec vitest run tools/e2e-network-policy.test.ts`：20/20；`pnpm typecheck`、`pnpm lint` 通过；`pnpm check`（含 153 个 Vitest 文件 4551 项与构建）通过。
  - `OSR_E2E_DEV_PORT=5106 OSR_E2E_PREVIEW_PORT=5107 pnpm exec playwright test e2e/network-audit-controls`：14/14（开发 8、生产 6），审阅修正后复跑通过，此前同类组合连续 3 次全部通过。用例：① 真实首页静态加载零违规零缺口（生产 `/`、`index-*.js`、`index-*.css` 为 `product`；开发含 Vite 客户端与 `/src/main.tsx`），随后页面 `fetch` 的 URL 原文/头部 Base64/请求体 URL 编码、`sendBeacon` 体、被动图像 URL、`document.cookie` 写入与刷新后 `Cookie` 头（`sent`）、带 fragment 的跨文档导航均以 `page` 检出；② 浏览器层供应的专用 Worker（带生产 CSP）启动即发的 URL/头/体标记全部归为 `worker`，其跨源请求为 Worker 的 CSP 阻止（`blocked`，接收端未收到）；页面跨源请求在生产为 CSP 阻止，在开发实际传出并被 loopback 接收端收到（`sent`）；生产以顶层导航到接收端证明实际传出；③ 第二页 `pagehide` beacon 在 `close` 阶段以 `browser` 发起、`sent` 检出，开发接收端收到原文；④ 弹窗为违规，其未附加页面产生“未覆盖目标”与“未知发起者”缺口，`complete=false`；⑤ 两个 Service Worker 注册尝试均记录 `fulfilled`，版本终态分别 `activated` 与安装失败的 `redundant`，并有目标违规与缺口；⑥ 另一 CDP 客户端创建的目标（同原生生命周期的建法）经 `attachTarget` 同样审计到 `close` 阶段。`network-audit-controls.development.spec.ts`：Vite HMR 连接识别为 `toolchain` 放行；非 HMR WebSocket 的 URL 原文、文本帧原文、二进制帧 Base64 均检出且接收端收到。
  - 未提交的临时探针（只用合成数据）核对产品路径无误报：开发测试入口真实导入→查看→返回零违规零缺口，93 个 Worker 模块请求归为 `worker`；繁忙 Worker 在 `audit.ready()` 后立即取消零缺口；缺失 Worker 入口按声明请求放行；缓存模块页零违规；持久 profile 的关闭 beacon 检出；生产真实 Worker 识别、预置缓存恢复与查看、页面路由的 Worker 脚本 404/HTML 回退（声明 `expect` 404/200 核对成功）均零违规零缺口。
  - 控制样本只发往本测试的页面路由、浏览器层 `serve`、本机 loopback 接收端或本地开发/预览服务器（生产关闭 beacon 受 CSP 限于同源）；无外部主机。`package.json`、`pnpm-lock.yaml` 未变；`e2e/support/browser-test.ts` 未改。
- **Rubber-duck：** 6 项全部处理：favicon 例外收紧为浏览器探测特征（加反例）；HMR 发送帧改为完整模式校验（加 `ping` 附加字段、非法 invalidate 反例）；补 Service Worker 版本终态与控制样本（`activated`/`redundant`）；未应答的声明请求不再算 `failed`；非专用 Worker 目标（Service Worker 等）认领脚本 ID 时立即解除暂停，消除 3 s 停顿；Worker 设置命令并行发送并提供 `ready()`，供需要立即结束 Worker 的用例先等审计就绪。
- **Simplify：** 删除未用的 `sameDocument`，捕获时局部索引代替持久 `matched`，已结算工作从等待集合移除，拦截 ID 映射，页面设置批量发送，金丝雀按对象编译一次、无 `%`/`+` 时不解码，策略每用例只构建一次，模式按 origin 判定。未采纳：复用 `tools/compliance/packages.ts` 的 `object`（会把文件系统与子进程依赖带入纯分类模块）；把接收端移出（超出写入范围）；以产品 favicon 消除探测（产品改动且 spec 已定义已知 404 项）。
- **能力边界：** 结论限于候选与实际执行路径。`browser` 发起者指只在网络层看到、按框架归属到已覆盖页面的请求（如关闭阶段 beacon）。Worker 在审计会话就绪前开启的 WebSocket、由页面路由应答且只见后续事件的请求、未经网络层又未被拒的 Worker 脚本，以及审计结束前随浏览器一同结束的页面，均报“证据不完整”而不推断为零泄露。持久 profile 与原生浏览器须在关闭其浏览器前调用 `audit.close`/`finish`。
- **文档影响：** 工程约定的网络审计说明与两处“实际请求审计归 P2-12”的指向由 25 负责；[本地导入指南](../../../../guides/local-import.md)的静态边界说明仍准确；无原版事实或 U 项变化。
- **2026-10-07 — 变基到 goal/p2-12 `a7ff04e`（已集成 04、05、12、14、20）：** 05 为测试入口新增 `hold` 查询键（逗号分隔的保留缓存操作），按精确规则加入 `TEST_ENTRY_QUERY`，`capacity`、`audio` 同时收紧为唯一取值。新增单元回归：05 的全部 Worker 场景（`IMPORT_SCENARIOS`、`PROTOCOL_SCRIPTS`、`FAILURE_MATRIX` 的 `worker`、`production`、`missing`）与全部缓存失败码（含 `unavailable`）作为测试入口取值放行，`hold` 的单项、组合与 URL 编码逗号放行，非法操作、空项、分号、超过三项与其他键值拒绝。05 的六个金丝雀标记均不少于 8 字节，可按 `{ name, value: bytes }` 交给 `audit.canaries`。未提交的临时探针（开发项目、合成数据）：`worker=busy&hold=commit,list,restore` 载入并释放 `list`、`worker=canary&hold=commit` 带 05 全部金丝雀导入并释放提交、`worker=protocol-group-before-identified` 失败场景均零违规零缺口，随后删除。复验：`pnpm exec vitest run tools/e2e-network-policy.test.ts` 21/21；`pnpm check` 通过（154 个 Vitest 文件 4589 项与构建）；`OSR_E2E_DEV_PORT=5106 OSR_E2E_PREVIEW_PORT=5107 pnpm exec playwright test e2e/network-audit-controls e2e/resource-balance-controls.spec.ts e2e/probe-contract.spec.ts` 30/30（本任务控制样本 14，04、05 的用例在两个项目中通过）。
