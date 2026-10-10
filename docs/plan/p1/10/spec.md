---
type: plan
status: accepted
phase: P1
task: "10"
updated: 2026-10-10
related: [ADR-0002, ADR-0006, ADR-0008, ADR-0009, ADR-0012, ADR-0015]
---

# P1-10：浏览器集成与回归冒烟 — Spec

## 问题与目标

P1-03 至 P1-09 已交付 replay、调度、React、Three.js、菜单和键盘，并取得真实 Chromium 证据。本任务**不重新实现这些系统，也不把已完成的人工验收再拆成工作**。当前缺口是：

- 仓库没有 Playwright 依赖、配置、E2E 类型/脚本入口；之前的浏览器验证依靠临时工具调用，不能作为贡献者可重复执行的回归命令。
- P1-08 的循环/GPU 资源证据与 P1-09 的键盘源证据分别成立，但缺少在同一测试回合中同时观察键盘、会话、桥接与 GPU 的持久回归。
- Node 已证明 replay；浏览器尚没有复用同一合成记录及比较器的持久检查。默认演示未开启录制，不能假称 UI 已能导出实际按键记录。

交付本地 Chromium 回归入口，将少量代表性闭环固化为自动测试，补齐上述联合证据。既有细粒度测试与仍有效的手工结果只引用、不复制；新 runner 必须实际运行证明自己有效。

阶段范围依据[总计划 §12](../../master-plan.md#12-开发阶段与验收条件)，任务导航见[阶段索引](../tasks.md#p1-10-浏览器集成与回归冒烟)。本任务支持 P1 的合成场景闭环、暂停/重启无重复循环及 replay 要求，不负责 P1 退出评审。真实前提为 [P1-03](../03/goal.md)、[P1-08](../08/goal.md)、[P1-09](../09/goal.md)，以及其引用的 P1-05/06/07 交付。

## 范围

### 包含

- **S-01 本地 runner：** 引入仅开发使用的 `@playwright/test`，建立 E2E 配置、独立类型检查、lint 与命令；普通冒烟覆盖开发服务器和当前生产预览，原生后台回归使用开发环境的 headed Chromium。工具版本与锁文件一致，不升级现有 Node/pnpm/TS/Vite。
- **S-02 代表性闭环回归：** 通过现有菜单、画面焦点、按钮与可信按键，观察连续移动、marker 接受/拒绝、暂停/继续、Restart、Exit→Start、返回菜单及导入占位。同时验证 DOM 投影与实际合成图形，不重新穷举上游所有用例。
- **S-03 同轮资源观测：** 在带键盘动作的同一 owner/run 生命周期中，联合观察唯一 rAF、输入/生命周期监听、渲染观察器、画布及 GPU 计数，证明正常清理与旧回调隔离；不以“页面未崩”或仅 Canvas 数量代替。
- **S-04 浏览器 replay：** 用 P1-03 既有格式和自建输入序列在浏览器运行生产 replay/比较函数，与同版本 Node 参考结果比较；不新增录制 UI、格式或世界写入入口。
- **S-05 故障与证据可信度：** 断言失败必须让 runner 非零退出；资源、浏览器或真实 hidden 能力缺失不能 skip 成绿色。错误采集、隔离与清理覆盖失败路径。常规 WebGL 不可用回归验证现有降级通道。
- **S-06 去重与维护：** 维护自动覆盖/既有证据/需补测的对应关系、运行方法与环境要求。复用已通过的新 owner HMR、窗口焦点与细粒度故障证据；只有相关实现变化或证据不适用时才补测相应部分。

### 不包含

- 新玩法、菜单/键位/渲染规则、Core/Runtime/Session 行为改变；不重建 P1-03 至 P1-09 的实现或 Node 测试矩阵。
- 再跑 P1-07 的完整 DPR/上下文恢复/20 次 Restart/50 对 marker 压力矩阵，或 P1-08 的 20 次菜单/导入往返来重复取证。这里只新增代表性自动覆盖与同轮联合观测。
- 将真实 HMR 源码编辑放入常规无人值守测试；不在 runner 中自动改用户源码。HMR 的既有证据有效性与必要补测见技术决定。
- Firefox/WebKit、真实 Safari、Windows/Linux、性能/30 分钟稳定性、原版保真与系统快捷键冲突矩阵，均属于 P0/P5；不以本机 Chromium 冒烟冒称完成。
- 原版资源、存储/导入/存档功能、全屏/Lock、Gamepad、音视频、云/CI/部署与 push；P1-12 合规工具仍是独立任务。

### 涉及模块

| 模块 | 责任与影响 |
|---|---|
| `e2e/`、`playwright.config.ts`、`tsconfig.e2e.json`（均计划新增） | 仅测试的场景、只读探针、合成记录与 Node runner；不进入网站入口 |
| [package.json](../../../../package.json)、[pnpm-lock.yaml](../../../../pnpm-lock.yaml)、[eslint.config.js](../../../../eslint.config.js) | 开发依赖、命令、独立 E2E 类型/lint 检查与可复现锁定 |
| [工程约定](../../../engineering/README.md)、[结构指南](../../../engineering/source-structure.md) | 执行时更新已实现的测试入口与证据分层 |
| [src/app/](../../../../src/app/)、[src/ui/](../../../../src/ui/)、[src/render/](../../../../src/render/)、[src/platform/input/](../../../../src/platform/input/) | 默认只读测试对象；若有必需观测缺口，优先测试侧探针，不增加生产控制后门 |
| [Core](../../../../src/core/)、Runtime/Session 及原版记录 | 只读复用契约，不修改权威状态、格式或规则 |

## 当前实现与依据

### 已完成，直接复用

| 已有交付 | 证据/代码入口 | 本任务不再做的工作 |
|---|---|---|
| 快照、哈希、录制、replay/比较 | [P1-03 最终证据](../03/subtasks/07-final-alignment.md#完成证据)、[synthetic-replay.ts](../../../engineering/source-structure.md#r1-合成-core) | 不再实现序列化/恢复/偏差检测，不复制负向矩阵 |
| 会话暂停/隐藏与真实通知边界 | [Session](../../../engineering/source-structure.md#r4-合成会话)、[录制回归](../../../engineering/source-structure.md#r4-合成会话)、[P1-05 真实可见性](../05/subtasks/07-browser-lifecycle-evidence.md#完成证据) | 不重建调度、取消、运行身份和 Node 生命周期验证 |
| 渲染/布局/资源/录制不变性 | [P1-07 浏览器证据](../07/subtasks/08-final-browser-alignment.md#完成证据)、[renderer replay 测试](../../../engineering/source-structure.md#r2-合成渲染) | 不重做相机、插值、布局、GPU 管理或录制接线 |
| 菜单、焦点、资源往返、降级 UI | [P1-08 最终证据](../08/subtasks/06-final-browser-alignment.md#完成证据)、[App](../../../../src/app/App.tsx) | 不重做页面流转、owner/latch 或导入占位 |
| 当前五键、清键、唯一源、真实 hidden、HMR | [P1-09 浏览器证据](../09/subtasks/05-browser-input-evidence.md#完成证据)、[最终对齐](../09/subtasks/07-final-alignment.md#完成证据)、[键位文档](../../../engineering/keyboard-input.md) | 不重做适配、失败回滚、keyup/修饰键矩阵及手工 HMR |

### 尚缺与执行前核对

- [Vite 配置](../../../../vite.config.ts) 的 Vitest 只发现 `src/**/*.test.ts`、`tools/**/*.test.ts`，且为 Node 环境；[Node tsconfig](../../../../tsconfig.node.json) 无 DOM。E2E 不混入该发现范围，不给既有 Core/Node 检查增加 DOM。
- [开发面板](../../../engineering/source-structure.md#r7-演示页面开发面板与画面)已有 phase/runId/tick/mover/marker/results 和按需刷新的渲染诊断；[SyntheticRenderView](../../../engineering/source-structure.md#r7-演示页面开发面板与画面)已有可聚焦输入区与状态。优先复用 role、testid、既有读数。
- [owner](../../../engineering/source-structure.md#r5-演示所有者与槽位)固定 seed 0、默认 60 Hz，`SYNTHETIC_DEMO_OPTIONS` 未设置 recording，也没有向 React 暴露 `SessionRun.exportRecording`。浏览器 replay 检查是独立合成记录验证，不伪装成 UI 录制。
- 受版本控制的 [pnpm-lock.yaml](../../../../pnpm-lock.yaml) 是 pnpm 12 的多文档锁：第一文档只锁 packageManagerDependencies/pnpm，第二文档以 `importers` 锁定 manifest 中全部应用/开发依赖。2026-10-03 复核 `pnpm install --frozen-lockfile --offline --lockfile-only` 通过且无差异，因此**不存在需修复的锁文件缺口**。新增 runner 依赖只需用 pnpm 正常更新同一文件，提交后 frozen 安装仍通过，且不放宽 pnpm 现有供应链策略；与 P1-12 涉及同一 manifest/锁文件时顺序编辑。
- [工程指南的 CDP 路线](../../../engineering/README.md#已验证的-cdp-自动化路线)与 P1-09 实测已证明本机 Chrome 154/macOS 可取得原生 hidden。普通 CDP 页签切换曾持续 visible；不能据此假定 headless/任意标签切换能完成该判据。

## 行为与边界

| 场景 | 预期结果 | 失败反馈 |
|---|---|---|
| 执行完整本地 E2E 命令 | 构建当前代码，分别驱动开发与生产页面；使用新 context/profile | 启动/构建/断言失败非零退出，保留所属用例与原始原因 |
| 浏览器或 WebGL 2 不满足普通画面用例 | 明确缺能力，不换成 DOM/Node mock 宣称画面通过 | 受影响验收未通过；提供实际版本与准备方法 |
| 输入区内移动、N/X/P 与按钮命令 | 结果仍经既有 Core/Session；重复/失焦/暂停不恢复旧轴 | 意外 actionError/sessionError、重复结算或图形不符使测试失败 |
| 页面原生 hidden→visible | 自动暂停，返回仍暂停，显式继续无旧轴 | 原生状态没有变 hidden 或能力受限必须失败/记录 blocked，不合成事件替代 |
| 同 owner 换 run、跨 owner 返回/重进 | 前者保留一组源；后者先释放再创建；无旧回调写新状态 | 任一资源余留、并行循环或清理错误均显式失败 |
| WebGL 禁用的新隔离 context | 原有 unavailable 原因可见；键盘命令仍得到真实 Core 结果，返回可重进 | 只允许该受控场景的预期上下文创建诊断，不整体忽略 console.error |
| 复用历史 HMR/窗口/稀有故障证据 | 记录版本、适用表面和未变化依据；必要时只补相关检查 | 不适用或缺失的必需证据保持未通过，不能仅抄 passed |

## 数据模型与契约

**无游戏数据模型变化。** 新数据只属于 `e2e/` 的合成输入与只读观测，不建立公共 schema 或生产调试 API。

| 数据 | 类型/约束 | 权威所有者 | 测试边界 |
|---|---|---|---|
| `MoveInput`、`Command`、投影 | 现有 `moveX`、marker 命令、tick/位置 | [synthetic-scene.ts](../../../engineering/source-structure.md#r1-合成-core) | UI 文本非整数保留3位小数，不作为精确哈希来源 |
| `SessionStatus`、`SessionFrame` | runId、phase、pauseReason、Core tick；宿主时间为毫秒 | Session | 测试只读状态，经公开输入/控制驱动；不调用内部 frame/step |
| `SyntheticReplayRecord/Result` | `osr-synthetic-replay`/1；config、成功 tick 的输入；events/checkpoints | [synthetic-replay.ts](../../../engineering/source-structure.md#r1-合成-core) | 复用 JSON 数据与生产校验/比较器，不改版本 |
| `SyntheticRenderDiagnostics` | drawnTick/draws/entities/gpu/layout | [synthetic-renderer.ts](../../../engineering/source-structure.md#r2-合成渲染) | 每次断言先 Refresh diagnostics，读数不是权威世界 |
| 资源探针记录（计划新增） | 目标/回调/句柄身份、登记/撤销、仍连接画布、上下文释放、rAF 最大待交付数 | E2E 测试 | 区分应用、Three.js、React 与测试自身；不改应用状态或传播 |

### 持久化与兼容

不新增 localStorage/IndexedDB、存档或 UI 录制；隔离 context 不接触用户数据。报告、trace 与合成截图仅存已忽略的 `test-results/` 或 `playwright-report/`，不进入网站和源码提交。自动化不读取 `local/`。

## 技术决定

1. **Chromium 单引擎、本地验收：** 按 ADR-0012，不建设 CI。默认使用本机已安装兼容 Chrome/Chromium，支持显式指定已有 executable；不写死个人路径，不在普通测试命令中下载浏览器。缺浏览器时是明确环境前提，准备步骤单独记录。
2. **独立测试入口：** 计划新增 `pnpm test:e2e`：当前生产 build 加 Playwright；包含开发/生产普通冒烟及开发 headed 生命周期项目。默认单worker、retries=0，前台/后台场景顺序执行，避免测试自身相互遮挡或以重试掩盖失败。`pnpm typecheck` 接入独立 E2E tsconfig，lint 覆盖新增 Node 测试/配置；`pnpm test`仍只跑既有 Vitest。`pnpm check`保留类型/lint/unit/build职责，浏览器命令独立调用，不能漏报。
3. **只固化代表性回归：** 既有人工结果不再独立重验，但新测试的首次实际执行是 runner 验收，不能用历史报告替代。三次联合菜单往返沿用 P1-09 的最小观察规模，不再重复旧20/50次压力矩阵；GPU 跨同 owner run 的基线在两种 kind 已实际绘制后采集。
4. **不伪造时间或可见性：** 普通按键用可信浏览器输入；松键/失焦后仍running或显式resume后，先等新投影，再观察至少3样本、跨度至少300 ms（来自现有100 ms采样与P1-09判据）；paused本身则验证tick停止，不等待递增。rAF测量排除 Playwright rAF轮询，使用不改变应用调度的只读探针。
5. **真实图形断言：** 复用 P1-07 合成颜色、4:3布局、截图解码方法与每通道±3容差；1280×800/DPR1 的 mover 与存在的 marker 至少各9像素。mover 下限是本任务新增，由 P1-07 在320×240下各边≥3设备像素的包围框保证推出，不改变其契约。合成速度1单位/秒，左右各约1 s仍在 P1-07 保证的可见范围内。运动时比较 mover 图像位置方向，不只数 Canvas；不扩展像素保真目标。
6. **Replay 的精确层次：** 复用会话录制回归已有 seed0/50Hz 成功输入序列生成记录，checkpointInterval=1；Node 生产 replay 产生参考 events/checkpoints，浏览器使用相同版本函数处理同一记录并比较。只证明该固定环境/样本的精确一致，不承诺不同 V8/引擎版本普遍逐位一致；默认演示仍不开录制。
7. **原生后台路线：** headed 项目沿用工程指南已验证的路线：自管启动兼容 Chrome 并移除 Playwright 默认的 `--disable-backgrounding-occluded-windows`、`--disable-renderer-backgrounding`、`--disable-background-timer-throttling`，在 CDP 自建 browser context 中用两个真实标签页切换。普通 `browser.newContext()` 页面切换或 `connectOverCDP` 到 shell 启动的 Chrome 曾持续 visible；Playwright 受管页面的 `hasFocus()` 也不能证明原生窗口焦点，因此窗口焦点仍按决定8复用 P1-09 证据，不在本 runner 中宣称取得。
8. **HMR 与旧证据：** P1-09 新 owner Fast Refresh 与窗口恢复是已完成证据，默认直接引用。执行时对照相关 App/hook/lifecycle/输入接线及构建行为变化；发生相关变化才按 browser-testing 有界补测、还原临时编辑。HMR不加入自动改源码的常规runner。
9. **修复边界：** 测试接入允许必要 helper 与观测，但不向生产暴露世界写入、执行内部 tick 或错误伪造入口。若发现上游缺陷，先记原责任/验收影响，使用聚焦修复流程；不借本任务改变已批准行为。
10. **资源安全：** 不默认复用任意占用端口或共享用户 profile；校验服务器项目/origin。自建服务器、浏览器与探针在成功/失败后都收尾；不终止其他进程、不清用户站点数据。测试不依赖 P1-12 执行顺序，但涉及共同 manifest/锁文件时顺序编辑。

## 验收标准

| ID | 可观察的通过条件 | 方法与证据 |
|---|---|---|
| AC-01 | 新 `pnpm test:e2e` 有实际用例，开发/生产/开发headed各有明确入口；Chromium版本、origin、配置可追溯。E2E进入类型/lint，不混入Vitest/纯模块检查，不升级既有工具链，项目锁定与manifest一致 | 实际命令、类型/lint发现与负向检查；`pnpm install --frozen-lockfile`通过及锁文件/依赖差异 |
| AC-02 | 两种页面从菜单原生操作进入，heading初始焦点、输入区名称/说明与Tab/点击正确；菜单/导入/Return和面板按钮不触发游戏键，原生Enter/Space正常；导入仍明确未实现 | 自动DOM/ARIA/焦点与可信事件观察；仅代表性流程，不重复上游全矩阵 |
| AC-03 | 两种页面持有左/右各≥1s，投影与实际mover图像位置同向变化；N accepted、X accepted、再次X rejected，投影/结果/实体与合成像素一致，没有乐观成功或重复结算 | 可信按键、投影样本、结果身份、截图解码；颜色/像素阈值见决定5 |
| AC-04 | P与面板控制保持原语义，暂停tick/draws稳定；继续不恢复旧轴。元素失焦仍running但轴停；Restart/Exit→Start换run清状态，返回重进为新owner。仍running或resume后，以松键/清键后首次新发布投影起取≥3样本跨≥300ms，tick递增、x相同 | 自动代表性闭环及实际repeat=true验证；paused验证tick不递增，复用P1-09规则不重做modifier/IME矩阵 |
| AC-05 | 开发StrictMode与生产各3次带移动/N的菜单往返，在同回合同步核对rAF最大待交付≤1、每个owner唯一keydown/keyup对、9项输入与3项Session生命周期登记、渲染监听/观察器配平。菜单演示owner资源净0（不计React根委托、Vite与测试自身），旧画布断开/正常可用扩展下旧context lost；同owner换run监听不增，两kind预热后的GPU计数无增长 | init探针按目标/回调/句柄身份归属，刷新诊断；Node既有订阅/旧回调测试作不可见边界证据。扩展缺失不可假称context lost |
| AC-06 | 两种构建至少宽1280×800→窄480×900的同owner缩放，画布位置/缓冲与现有布局函数相符（CSS边缘误差≤1px、缓冲4:3取整误差≤1px），实体仍可见且游戏键仍单次生效 | 实测容器/画布/像素与公式；不重复完整DPR矩阵，历史DPR证据按AC-10复用 |
| AC-07 | 固定合成记录在浏览器的events/checkpoints与同版本Node参考精确相等，生产比较器返回`{match:true}`；改变一个合法参考hash后得到真实mismatch/tick而非成功。非法format/version被现有生产校验拒绝 | 开发origin加载公开纯replay模块，独立场景计算；Node/浏览器版本与记录摘要，不改运行中的App世界 |
| AC-08 | 开发headed项目通过另一实际标签页取得原生hidden→visible：自动paused/hidden、隐藏tick稳定、返回仍paused，显式P后旧repeat不移动、新按下才移动。实际hidden未发生时不可skip/合成事件或getter替代 | 按决定7持久化已验证CDP协议路线，实际状态日志与可信输入；runner必须取得自身成功证据 |
| AC-09 | 受控WebGL不可用场景显示既有具体原因，键盘N/Core结果与暂停/继续仍可用，返回清理并可重进；正常场景无意外pageerror、actionError/sessionError或应用失败请求 | 独立禁用WebGL环境；预期诊断白名单仅限该用例。既有/favicon.ico 404可逐项记录，不忽略其余4xx/5xx |
| AC-10 | 有清楚的“新增自动覆盖/直接复用/失效需补测”映射。既有HMR、窗口焦点、DPR、故障/取消/回滚证据有版本及相关差异核对；无相关变化不重复手工实验，不把不适用报告抄为passed | 引用上述上游完成证据，执行时记录适用性；必需失效项才按browser-testing补测 |
| AC-11 | 断言错误、构建/启动错误、缺浏览器或必要能力均非零退出；失败报告可定位场景。无应用状态写入/内部tick/新增调度，无测试入口与Playwright进入生产产物，无原版内容或用户存储操作 | 受控失败用例/退出验证、网站产物与完整diff、测试探针审阅 |
| AC-12 | `pnpm check`及新E2E命令全通过；自有资源、临时编辑与测试fixture均按所有权收尾，直接相关工程/结构文档更新。未降低任何既有验收或宣称跨浏览器/阶段退出 | 完整命令、文档/链接、清理与范围检查；不能只报发现用例数量 |

## 验证策略

- **单元/契约：** 优先运行已有 Node 回归，不复制其穷举逻辑；新增测试 helper/配置发现和失败传播有聚焦验证，仍使用现有 Vitest。E2E 文件使用 `.spec.ts` 与独立配置。
- **Replay/一致性：** AC-07仅补浏览器执行缺口，复用 P1-03格式、Session既有序列与生产比较器；录制UI、格式升级、跨引擎保证不适用。
- **浏览器：** 新 runner 首次真实跑全部新增用例，Chromium开发/生产及headed后台。按 [browser-testing](../../../../.agents/skills/browser-testing/SKILL.md)准备合成内容、观察/清理；HMR等既有手工证据按AC-10复用。
- **实机/原版：** 不适用。本机自动化不是目标GPU/键鼠设备、Safari或原版对照，既有合成声明不改变。
- **工程：** 新命令目前不存在，执行后方可称可用；完成需现有 `pnpm check`加新增E2E、文档/产物检查。不下载浏览器、安装包或运行测试来完成本轮Spec生成。

## 风险与恢复

风险等级：中，主要是计数归属、浏览器能力与采样时序，不是游戏规则或数据迁移。

- 若把React/测试rAF或事件委托计入应用源，会误判泄漏；按身份与调用来源分离，不以“总事件数”证明释放。
- 10Hz旧投影和按需诊断会制造假通过；先等新投影、刷新诊断，再观察规定窗口。
- 硬编码个人浏览器路径、任意端口复用或后台模拟会掩盖环境失败；保持显式前提和非零退出。
- 仅新增测试/开发依赖/配置，可按聚焦提交回退；不涉及存档/缓存迁移。缺陷修复不得重写历史正确证据或放宽上游契约。

## 未决事项

无。按用户授权采用推荐方案：本机Chromium、独立本地runner、代表性自动覆盖、同轮资源联合观察、既有手工证据直接复用。兼容浏览器准备是执行期必须满足的前提，不被本Spec猜测为已完成。

## 审批

用户于 2026-10-03 明确批准本轮已审阅的完整契约，并要求生成 Goal。批准范围为 S-01 至 S-06、AC-01 至 AC-12；本轮只记录批准并生成执行计划，不授权实现、提交、push或部署。
