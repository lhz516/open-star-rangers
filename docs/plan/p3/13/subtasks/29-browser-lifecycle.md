---
type: plan
status: active
phase: P3
task: "13"
subtask: "29"
updated: 2026-10-28
---

# 29 — 资源、深度、恢复与网络边界验证

**契约来源：** [spec](../spec.md#接线与生命周期) 的 AC-18/19/25。
**依赖：** 27, 28。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 实际合成场景反复重试/返回/卸载/StrictMode，暖态GPU计数相等、每运行结束归零；CPU/队列预算和部分创建失败反馈覆盖。
- 丢上下文/布局时地图取消ready、解锁/系统指针恢复；恢复先画后资格，不补播消息/声音。
- 目标屏独立深度不污染世界，地图/基地往返后Warp保留深度；改变视口只变尺度。
- 验证迟到旧run结果失效、资源清理失败锁存和网络审计。

## 不包含

不放宽资源阈值或失败政策，不实施发布级设备矩阵。

## 关键文件与契约

- [flight-gpu-cache.ts](../../../../../src/render/flight/renderer/flight-gpu-cache.ts)、[game-session.ts](../../../../../src/app/session/game-session.ts)。
- 计划新增 `e2e/cockpit-lifecycle.spec.ts`，复用27/28的夹具。

## 写入范围

- `e2e/cockpit-lifecycle.spec.ts`：计划新增生命周期回归。
- `e2e/support/cockpit-lifecycle.ts`：计划新增故障与计数辅助。
- `src/render/cockpit/composition/*.test.ts`：局部创建/清理失败回归。

## 验收标准

- [x] 只有一个循环/画布/上下文，运行资源归零且重复暖态计数稳定。
- [x] GPU故障与契约故障分类正确，输入资格/指针与恢复同步。
- [x] Warp深度、游戏外黑边/控件及网络边界没有回归。

## 验证方法

使用 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)；`pnpm test:e2e -- e2e/cockpit-lifecycle.spec.ts`、相关Node故障回归和`pnpm check`。发现功能缺口转新增修复项；[simplify](../../../../../.agents/skills/simplify/SKILL.md)仅整理本验证夹具。

## 完成证据

2026-10-28，worker 分支 `exec/p3-13-29`（基线 `d67e66e7`）。只新增写入范围内的测试代码，未改产品代码；未启动 DOSBox-X，未运行 Ghidra，未读原版文件，全部画面来自合成包。浏览器：本机 Chrome（`channel: chrome`）headless，macOS，视口 1280 × 800、DPR 1；`OSR_E2E_DEV_PORT=5187`/`OSR_E2E_PREVIEW_PORT=5188`，由 Playwright 自启自停（结束后 5187–5189 无监听）；每个用例新建隔离 context，按 28 的做法把合成 `mission-startable`（或其变体）预置进测试入口 profile／生产身份的缓存，再经真实菜单恢复。

**交付。**

- [support/cockpit-lifecycle.ts](../../../../../e2e/support/cockpit-lifecycle.ts)：页面脚本前安装的只读 WebGL 2 调用记录器（包装 `WebGL2RenderingContext.prototype`，原样转发）。以画布清除（P3-12 屏幕阶段）切分合成帧，逐帧记游戏图像（唯一非画布 framebuffer）上的深度清除、驾驶舱层绘制（按其片元 `texelFetch(picture` 识别程序）及其是否测试/写深度、其他绘制、所挂深度纹理，帧内首次游戏图像调用与收尾时刻；另记 framebuffer 创建数、深度格式分配、各上下文（画布是否在文档、是否已丢失）与 `pointerlockchange` 时刻。可一次性注入两种故障：驾驶舱画面纹理的 `deleteTexture` 抛错、驾驶舱层的绘制抛错。另含经 DOM 点击读取开发诊断（锁定时鼠标点击会被锁定截走）、驾驶舱计数、按尺度比较逻辑画面与预置恢复的辅助。
- [cockpit-lifecycle.spec.ts](../../../../../e2e/cockpit-lifecycle.spec.ts)：开发 7 例（其中 Warp 深度一例同 28 的回退用例不经网络审计，因为审计不允许测试入口的 `pointerLock` 查询参数）、生产 2 例，见下表。
- [cockpit-lifecycle.test.ts](../../../../../src/render/cockpit/composition/cockpit-lifecycle.test.ts)（Node，11 项）：真实 `wireFlightRun` 加全部真实驾驶舱模块：层的纹理/几何/材质取得、`addLayer` 任一失败，或运行拒绝驾驶舱的四个登记（驾驶舱释放、层移除、地图端口、渲染器订阅）时整次运行回滚、缓存归零、渲染器无运行，下一运行与干净运行的资源和 GPU 计数相同（驾驶舱登记在 `beginRun` 之前被拒时 `beginRun` 未调用）；模块拒绝的内容在 `beginRun` 前拒绝；驾驶舱纹理释放抛错时运行结束报告该错误（会话据此锁存），其余资源仍释放、表现已释放、凭证撤销，此渲染器不再开始运行（`invalid-state`）；三次暖态运行（F1→地图→F1，8 tick）资源与 GPU 计数相同、结束后归零。

**逐项结果（browser-testing；全部 passed）。**

| 准则 | 设置/操作 | 期望 | 观察证据 |
|---|---|---|---|
| 单画布/上下文/循环与暖态计数（AC-18） | 开发（StrictMode）入口，同一文档两次进出任务，每次 3 个运行（开始、重开、介绍页后再开），每运行 tick ≥ 40 时读取；种子固定使每运行世界相同 | 1 个在文档中的画布、1 个存活上下文（其余均已丢失且画布已移出）、帧至多 1 个在途、每帧恰 1 次驾驶舱绘制且不测不写深度、1 个渲染目标；暖态计数等于首次；两运行之间诊断为无运行/无资源、驾驶舱计数为无；回到菜单资源平衡 | 6 次读取均为 `9 geometries (34 vertices, 24 indices), 9 materials, 11 textures (1156737 texels), 1 render targets` 与 `8 geometries, 12 textures, 5 programs`；`ResourceBalance` 两次回菜单 0 差异；最终所有上下文均已丢失；StrictMode 的首个表面上下文已丢失、画布已移出 |
| 旧运行结果不进入新运行（AC-18） | 旧运行 Ctrl+Enter 排入 1 条消息后重开 | 新运行驾驶舱从空开始 | 新运行 `messages 0, messageDrops 0` |
| 队列预算（AC-18，Δ-05） | 连按 90 次 Ctrl+Enter | 队列 64 项，丢新项计数，不故障 | `messages 64, messageDrops 26`，仍在运行、渲染器 `ready` |
| GPU 非设备故障（AC-18） | 注入驾驶舱层绘制抛错 | 按 P3-12 分类：渲染器 `failed`、运行以消费者故障结束、本运行资源释放；新所有者重新绘制 | 画面通知“The flight picture failed, so the run cannot continue.”、`consumer failure`，诊断 `failed / run none / resources none`，tick 不再前进；回菜单资源平衡，新所有者每帧 1 次驾驶舱绘制，资源平衡 |
| 设备故障（上下文丢失，AC-18） | F1 与地图中 `loseContext` | 只暂停画面，运行继续 | `data-state="context-lost"`，丢失期间无绘制，tick 前进；恢复后绘制 |
| 契约故障（AC-18） | 地图几何与 slot 2 类型 10 记录不一致的变体 | 开始前拒绝并给出结构化原因，无画面无保留 | “Starting the run failed while connecting the run's consumers.” 与 `ContentContractError`；无 flight-area、无运行、无帧、无新 framebuffer/深度分配、无存活上下文（在 `beginRun` 之前由 Node 例证明） |
| 清理失败锁存与结构化错误（生产，AC-18） | 生产预览，注入驾驶舱纹理释放失败后重开 | 锁存，显示结构化原因；只有重载才可再开任务 | `cleanup-failure` 显示 “Releasing the mission's resources could not be confirmed. No new mission can be started until the page is reloaded” 及注入的原因；无 Start；主菜单入口 `cleanup-failed` 且禁用；重载后恢复并正常飞行；无 CSP 违规 |
| 丢上下文：输入资格/指针与恢复（AC-18） | 地图中锁定后 `loseContext`，20 tick 后恢复 | 立即撤销就绪、解锁、恢复系统指针；恢复后先提交画面再按 P3-05 资格请求锁定；不自动选点 | 解锁、“Map input is not ready.”、光标不为 `none`；丢失期间无帧；恢复后唯一一次锁定晚于第一幅恢复画面的提交；40 tick 内无 `warp-destination-set` |
| 不补播消息（AC-18） | F1 中 Ctrl+Enter 后立即丢上下文约 12 tick 再恢复，切换后 +25 tick 暂停 | 消息行按首次显示（切换 tick）滚动，不从恢复点重放；只排 1 次 | 与切换起点逐像素 0 处不符，按恢复点起算则不符；`messages 1`；本构建无声音消费者（P3-14），无声音可补播 |
| 丢布局（AC-18） | 地图中锁定后以测试样式隐藏 flight-area | 同上 | `buffer none`、解锁、未就绪、系统指针；20 tick 无绘制；恢复后锁定晚于首幅画面提交，无选点 |
| 视口只改尺度（AC-19） | 暂停的地图画面，窗口 1280 → 520 宽再还原 | 同一逻辑画面按新尺度最近邻；tick 不变；仍 1 个渲染目标 | 按逐像素来源比较 0 处不符；还原后与原画面一致 |
| 深度（AC-18；目标屏为 CPU 设备，按 D-01 修订核对） | 回退输入模式：F1 → `m` → 点击主地图设目的地 → `w` → Warp 完成 → F1 | F1 清深度；地图与 Warp 帧不清深度；驾驶舱层不测不写深度；全程同一深度附件、无新增深度分配与 framebuffer | 帧序列恰为 F1(7) → 地图(15–17) → Warp(1179–1180) → F1(22–23)；从地图起至 Warp 结束深度清除 0；深度纹理始终同一个；深度分配仍只一次 `640 × 480`；诊断 1 个渲染目标 |
| 黑边与控件（AC-19） | 测试样式把游戏视图改为 2:1（左右黑边），碰撞变体（种子 23）的屏幕闪光 | 闪光只作用于游戏图像 | 闪光拟合唯一；四个黑边采样点闪光中与之后均为黑；状态栏截图不变 |
| 生产单画布与恢复（AC-18/25） | 生产预览、严格 CSP，两次运行（中间丢/恢复上下文并重开） | 无诊断面板；1 画布/1 存活上下文/每帧 1 次驾驶舱绘制；地图丢上下文撤销与恢复同上；回菜单资源平衡 | 全部成立；无 CSP 违规 |

**基地往返：** Warp 不能从基地直接到达（发射回到 F1，F1 按 RS6 清深度），Warp 中 `toggle-map` 被 Core 以 `wrong-context` 忽略，所以可达的“往返后进 Warp”只有 F1 → 地图 → Warp，已在浏览器中逐帧核对；基地帧只有驾驶舱槽、驾驶舱层在基地不绘制，由既有层次序与 24 的 Node 测试覆盖，本项未另测基地帧。隐藏页面行为不在本项断言中，未使用真实隐藏页面。

**命令。**

- `pnpm exec vitest run src/render/cockpit/composition/`：3 个文件 23 项通过。
- `pnpm build && OSR_E2E_DEV_PORT=5187 OSR_E2E_PREVIEW_PORT=5188 pnpm exec playwright test e2e/cockpit-lifecycle.spec.ts --repeat-each 3`（审阅前）：27 passed（另 27 项为跨项目 skip）；审阅修改后 `--repeat-each 2`：18 passed。首轮重复暴露的两处不稳（种子只有 4 个而 6 次世界创建、Warp 用例清空记录后立即开图）已修正。
- 全量 `pnpm exec playwright test`（无 `--`，291 项，31.2 分钟）：281 passed、9 skipped（本文件的跨项目 skip）、1 failed：`ai-wingman.development.spec.ts:146`，即 27 已在基线上复现、由修复项 35 处理的地图回归，与本项无关。本次运行中简报列出的隐藏页面/CDP/headed 与配额用例均通过。
- `pnpm check`（typecheck、lint、Vitest 430 文件 11,556 项、生产构建；只有既有的 > 500 kB 块体积警告）：退出码 0。

**Rubber-duck（code-review 代理担任）：** 6 项，均已处理：① 记录器帧时刻在上一帧画布清除时打下，丢失/隐藏期间的空帧会带着旧时刻吸收恢复后的首次绘制，“先画后锁”不可能失败 → 改为记录帧内首次游戏图像调用与收尾（画布清除）两个时刻，比较锁定时刻与恢复后首幅驾驶舱画面的收尾时刻，并要求其首次调用晚于解锁；② 契约用例的“分配前”在浏览器中无法证伪（three.js 首次绘制才建 GL 对象）→ 浏览器标题改为“无画面无保留”，新增 Node 例断言 `beginRun` 未调用，驾驶舱登记被拒的用例断言 `beginRun` 次数；③ “暂停中 tick 不变”比较的是相邻两次读取 → 改为暂停时记 tick、缩放后比较；④ “地图不写深度”按分类恒真 → 删去，依靠逐帧驾驶舱不测不写深度与深度清除合计；⑤ 拒绝登记例名为“立即释放”但只在运行结束后检查 → 改名为整次回滚并加 `beginRun` 次数断言（`own()` 的立即释放语义由 24 的通用用例覆盖）；⑥ 回滚后“资源相同”只查形状 → 与独立渲染器上的干净运行比较资源与 GPU 计数。
**Simplify：** 只限本项新增测试代码，由本 worker 直接审阅：去掉记录器中未被断言使用的颜色清除与“其他深度写”计数，`restart` 接受介绍页回调以合并重复的重开步骤，删去未用返回值。未改：上下文丢失与按尺度比较与 flight-render 用例的局部函数、预置恢复与 28 的局部函数相似，但那些文件不在写入范围且未导出。
**文档影响：** [engineering README](../../../../engineering/README.md) 的 E2E 回归清单未列本项文件与 WebGL 调用记录器的做法，该文件不在写入范围，建议文字见 worker 报告。原版事实、U 项与模块说明无变化（未改 API）。
**私有输出：** `local/research/p3-13/29-browser-lifecycle/`（`e2e-full.log`、`e2e-repeat.log`、`e2e-final.log`、`check.log`、`build.log`）。
