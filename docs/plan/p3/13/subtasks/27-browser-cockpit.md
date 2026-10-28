---
type: plan
status: active
phase: P3
task: "13"
subtask: "27"
updated: 2026-10-28
---

# 27 — 合成浏览器驾驶舱验证

**契约来源：** [spec](../spec.md#验证策略) 的 AC-05/06/08/09/10/11/12/13/14/15/19/20。
**依赖：** 25。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在本机Chrome/既有Playwright runner使用合成包，验证F1/Warp/被毁正确区域及页0–6、菜单、来电/基地摘要、消息滚动、SNIP、目标和雷达。
- 读取实际像素，而非只验证Canvas/命令调用；闪光作用完整游戏图像，黑边和React控件不受影响。
- 开发/生产入口都走实际装配，隔离状态夹具须明确为合成且不进入生产；被毁视角不得要求驾驶舱框架非黑。

## 不包含

不使用原版文件作为E2E夹具，不以合成事件证明系统快捷键拦截，不修改功能代码。

## 关键文件与契约

- [flight-pictures.ts](../../../../../e2e/support/flight-pictures.ts)、[flight-render.production.spec.ts](../../../../../e2e/flight-render.production.spec.ts)。
- 计划新增 `e2e/cockpit.development.spec.ts`、`cockpit.production.spec.ts`、`support/cockpit.ts`。

## 写入范围

- `e2e/cockpit.development.spec.ts`：计划新增开发回归。
- `e2e/cockpit.production.spec.ts`：计划新增生产回归。
- `e2e/support/cockpit.ts`：计划新增独立测试辅助。
- `e2e/support/flight-pictures.ts`：必要像素读取扩展。
- `e2e/flight-render.development.spec.ts`：旧“HUD待实现”断言更新。
- `e2e/flight-render.production.spec.ts`：相同生产断言同步。
- `e2e/flight-scenes.development.spec.ts`：保留世界和共享深度回归。
- `e2e/support/flight-flow.ts`、`e2e/support/mission-observations.ts`：F1 背景与单画布断言随驾驶舱更新（协调者增补，24/25 交接）。
- `e2e/base-interaction.development.spec.ts`：在制提示移到状态栏后的断言（协调者增补，25 交接）。

## 验收标准

- [x] 每种状态有实际逻辑像素或DOM断言，错误夹具可使断言失败。
- [x] DIAG/来电/滚动的时间边界与真实管线一致，不仅检查初始静态图。
- [x] G-03/G-05可见、无原版字节、网络审计不变。

## 验证方法

必须使用 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)；文件落地后 `pnpm test:e2e -- e2e/cockpit.development.spec.ts e2e/cockpit.production.spec.ts e2e/flight-render.development.spec.ts e2e/flight-render.production.spec.ts`。测试维护按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 限本组。

## 完成证据

2026-10-28，worker 分支 `exec/p3-13-27`（基线 `2bd89ec1`）。只改 E2E 测试代码，未改功能代码；未启动 DOSBox-X，未运行 Ghidra，未读原版文件，全部画面来自合成包。Chrome 无头 1280 × 800、DPR 1，`OSR_E2E_DEV_PORT=5181`/`OSR_E2E_PREVIEW_PORT=5182`，由 Playwright 自启自停（结束后 5181–5183 无监听）。

**交付。**

- [support/cockpit.ts](../../../../../e2e/support/cockpit.ts)：只用内容读取器（`src/content/**`）在 Node 中读合成包的 HUD 内容（DATA/地图调色板、fonts/0 与 fonts/1、`data/hud/instruments`、两个布局、图像、HUD 文字、视角标签、DIAG、飞行消息、通讯菜单），不引用渲染器模块；期望按 [hud §4](../../../../original/formats/hud.md#4-instrument-overlay-and-map-drawing-p3-13)、[cockpit 可见保留](../../../../original/formats/cockpit.md#instrument-records-scheduling-and-visible-persistence-p3-1301)、[comm §4](../../../../original/formats/comm.md#4-text-rules-confirmed) 与 [SF4](../../../../original/formats/executable.md#screen-flashes-p3-1204) 独立写出：字形（前 `height` 行、8 列、fonts/1 大写）、中点圆（含限步）、雷达几何/环/盘面行段、元素复制规则（pass 0 每帧元素不复制、带区外仪表矩形保持 0）、右显示屏背景拉伸与读数位置、消息行偏移与整字形范围、DIAG 打字/保持/光标调度、闪光表与整行上移、干扰帧。运行事实只经任务画面属性、开发事件日志与 UI store 的 projection 只读取得（`readCockpitState`）。每个检查返回错误像素列表，可对错误夹具（`withData` 换调色板、错位、错文本、错起点、错节奏）复跑。合成变体 `collisionPackage`（16 个巨型友机压在玩家上，玩家船体 12,000：第 2–4 tick 约 48 次碰撞，开始闪光并掷子系统损伤；种子 23 给字段 11 = 2，种子 79 给字段 14 = 2，已在 Node 世界中核对）与 `twoBasesPackage`（P3-10 停靠包加第二座基地，使 `c`、2 打开页 3）只是 Node 中对转换结果的 payload 替换，按 schema/长度/SHA-256 重新标识，只预置进测试自己的隔离缓存；生产构建不提供任何测试入口或夹具。
- [cockpit.development.spec.ts](../../../../../e2e/cockpit.development.spec.ts)（5 例）与 [cockpit.production.spec.ts](../../../../../e2e/cockpit.production.spec.ts)（2 例），见下表；开发用例经测试入口以入口 profile 预置并从主菜单恢复，生产用例以生产身份预置并经真实菜单恢复，均走实际装配。
- 既有断言更新（24/25 交接）：[flight-flow.ts](../../../../../e2e/support/flight-flow.ts) 删除已不遮挡任何内容的 `noteRect`/`note`；`expectF1Background` 只比较 3D 视口（0–315 行），按驾驶舱在该处的元素/仪表矩形与 F1 叠加颜色（`inF1Cockpit`）划出驾驶舱像素，其余仍须为背景或速度尘埃且次优星云 > 1000 处不符；`classifyWarp` 跳过视口中的驾驶舱矩形，`belowLit` 改为 `band`（静态带区不为索引 0 的像素数，闪光外为 0）。[flight-render.development.spec.ts](../../../../../e2e/flight-render.development.spec.ts) 的地图断言最小改为“地图框架元素按地图调色板逐像素一致且无隧道色”（地图像素细测归 28）；resize 比较不再跳过注记矩形。[mission-observations.ts](../../../../../e2e/support/mission-observations.ts) 的 `expectFlightCanvas` 改为整页 1 个画布（生产 2D 地图光标已按 spec 移除），`expectFlightCursorWithoutWebGL` 改为 0 个画布。[base-interaction.development.spec.ts](../../../../../e2e/base-interaction.development.spec.ts) 改为断言 `flight-view` 可见、`flight-in-progress` 在状态栏且不在 `mission-view` 内。[flight-pictures.ts](../../../../../e2e/support/flight-pictures.ts) 只更新 `F1_BOTTOM` 的过时注释。

**逐项结果（browser-testing；全部 passed）。**

| 准则 | 设置/操作 | 期望 | 观察证据 |
|---|---|---|---|
| F1 框架与带区（AC-08/20） | 开发 `mission-startable`，暂停后读 640 × 480 逻辑像素 | 视口内每帧元素逐像素；带区仪表矩形外全为 DATA 0（每帧 pass 0 面板不复制）；雷达 721 个环点为 0xD；Warp 灯文字 0x10（或熄灭时矩形为 0） | 四项错误像素均为 0；换地图调色板后四项均 > 0 |
| 页 0 DIAG 时间（AC-10） | F1 中 20 次暂停采样（tick 30–183，间隔 3–9） | 每个样本恰由“消息/已打字数/光标”解释；同一调度：格式 0 于 tick 1 生成，每 tick 一字，打完后 16 tick 释放，光标每步翻转 | 4–5 个样本处于打字中；拟合含 `{first: 0, generated: 1}`；“每 2 tick 一字”与“保持按 tick 计”两种错误节奏拟合为空 |
| F1 叠加、雷达与右显示屏（AC-09/12/15） | 同一画面 | 准星（半径 20、每八分圆 10 步）单色 0xC/10；雷达盘面有接触点；右显示屏仅为拉伸背景、颜色 8 文字与 ≤ 2 个模型像素（合成 list-0 只是 1 单位三角形）；护盾百分比与距离读数（阈值步进 x）；`d` 后名称在 (x0 + 3, y1 − 17) | 全部成立；背景错一列 > 0 处不符；距离只有一个值 |
| 页 1（AC-10） | `e` | BITM 10467（不含带区）、第 y0 行为 0、三个标签同色、按分配档位的两张记录 | 0 处不符；交换档位与换调色板均 > 0 |
| 页 2–5 与菜单（AC-10/11） | 开发 `twoBasesPackage`，`c`、2、1、2 | 页 2 类别、页 3 两座基地、页 4 指令（标题 0x13 于 (x0 + 6, y0 + 4)，行距 9，截断，末项 0x0C、活动对象 0x10）；页 5 G-03 两行标注居中于 96 × 96 的 0 区 | 均 0 处不符；换调色板、换另一种摘要的标注均失败 |
| 来电与消息行时间（AC-11/13） | `incoming-started` 后 +16 与 +40 tick 暂停 | 摘要颜色 8、模式 1，偏移 W − ((dt × 48) >> 6)，dt 自开始后的下一次逻辑绘制起算（RQ5）；带区为 0 | 两次均 0 处不符；按开始当 tick 起算的偏移失败；另一摘要失败；偏移随时间减小 |
| 速度辅助消息滚动（AC-13） | Ctrl+Enter，`speed-assist-toggled` 后 +8、+25 tick | 颜色 0xF、模式 2，偏移 W − ((dt × 120) >> 6) 自切换当 tick 起算 | 0 处不符；起点 ±1 tick 均失败；滚出后该行无任何字形 |
| 基地摘要（G-05，AC-11/20） | 停靠、跳过 G-02/3 | 基地页 G-05 标注可见；`base-message-line` 含同一摘要，`data-origin="project"` | 成立；store 队首 `{ text, origin: 'project' }` |
| Warp（AC-08/09/10） | 地图 + 编辑器选点 + `w`，起始闪光后 | 同一框架与带区；页 6：BITM、标题与基线非 0 单色、三条标签、基线刻度（至 y0 + 54，同 `srangers_066`）与条形之间为 0；雷达盘面只有 0 与环色；无准星；完成后回 F1、页 0、准星恢复 | 全部成立；标题右移一像素失败 |
| 被毁视角（AC-15/20） | 开发 P3-11 `failure` 变体，0x11/8 且 tick ≥ 8 | 标签（fonts/1，0xF，(0, 0)）；世界占满全屏（带区行有星点）；不要求框架：带区 DATA 0 < 1 %、环点 < 10 %、无元素、无准星；空的 slot 7 消息行不留 0 矩形 | 全部成立；另一文本的标签失败 |
| 闪光（AC-19） | 开发 `collisionPackage`（种子 23），tick 4–5 暂停 | 静态带区与雷达环按同一 (上移行数, 表) 为 `flashed(DATA, k)`；画布外页面像素与 Resume 按钮截图在闪光后不变；有黑边时为黑 | 拟合唯一（例如 `rows 2, table 18`）；40 tick 后无拟合、带区恢复 0；画布外像素与按钮截图相同（1280 × 800 下 4:3 游戏视图无黑边，黑边断言按条件执行） |
| SNIP（AC-10/12） | 同一运行 `e`（字段 11 = 2）；重开后种子 79（字段 14 = 2） | 页 1 位置为干扰帧且帧号 = ((样本 − 开页 tick 的样本) × 12) >> 6 mod 9；右显示屏 (491, 347) 为干扰帧 | 5 个样本均与开页起点相符，起点偏 ±3、±6 tick 均失败；合成帧以 4 为周期，故按同类比较；换调色板无帧；右显示屏不是目标显示 |
| 生产（AC-08/11/20） | 生产预览、严格 CSP，以生产身份预置 `missionPackage()` 与 `mission-docking` | F1 框架/带区/环/灯、页 0 一个打字状态、右显示屏；一个画布；无诊断、无测试入口；页 5 标注、消息行摘要恰有一个偏移、基地 G-05 摘要 | 全部成立；无 CSP 违规；返回菜单后无画布 |

**验证命令。**

- `pnpm exec tsc -p tsconfig.e2e.json`、`pnpm exec eslint e2e`：通过。`pnpm check`（typecheck、lint、Vitest 428 个文件 11,510 项、生产构建）：退出码 0。
- `pnpm exec playwright test --project=development e2e/cockpit.development.spec.ts`：5 passed；`--project=production e2e/cockpit.production.spec.ts e2e/flight-render.production.spec.ts`：3 passed；`e2e/flight-render.development.spec.ts`、`e2e/flight-scenes.development.spec.ts`、`e2e/probe-contract.spec.ts`、`e2e/production-preview.spec.ts`、`e2e/webgl-unavailable.spec.ts`（两个项目，使用改过的画布断言）：均通过。
- `e2e/base-interaction.development.spec.ts`：停靠与发射用例通过；“real hidden page”一例为 `CDP Runtime.evaluate timed out`（`e2e/support/native-lifecycle.ts:65`），把 e2e 改动暂存后在基线代码上同样失败（`runs/base-baseline.log`），与 `mission-flow.development.spec.ts:802` 同属既有环境问题。
- 本文“验证方法”中的 `pnpm test:e2e -- e2e/cockpit.development.spec.ts e2e/cockpit.production.spec.ts e2e/flight-render.development.spec.ts e2e/flight-render.production.spec.ts`：pnpm 把 `--` 原样交给 Playwright，于是构建后跑了全部 258 项（27.0 分钟）：246 passed、12 failed。本组 7 项与 flight-render 的 4 项全部通过。12 项失败都不在本组：8 项是真实隐藏页面/CDP/headed 的环境问题（`ai-wingman:454`、`audio-playback:86`、`base-interaction:378`、`failure-storage-lifecycle:981`、`keyboard-input:190`、`mission-flow:802`、`mission-result:431`、`native-lifecycle:92`），1 项是真实配额（`failure-storage-lifecycle:378`）；`mission-flow.development:596` 与 `mission-flow.production:187` 是 24 记下、归 28 的“地图输入未就绪”前提；`ai-wingman.development:146` 在地图中点击输入区后等不到面板的提交回执，把 e2e 改动暂存后在基线代码上同样失败（`runs/ai-146-baseline.log`）。只跑本组应写成 `pnpm test:e2e e2e/cockpit.development.spec.ts …`（不带 `--`）。

**限制（如实记录，不扩大断言）：** 合成目标模型的 list-0 部件是 1 单位三角形，在 100 单位观察距离下至多 1–2 像素，剪影只在 Node 测试（20）中逐像素核对；合成 BITM 10467 只有 5 × 4，菜单页按原版规则保留先前页面的像素，所以菜单页只核对期望字形、BITM 与第 y0 行，不判多余墨迹；合成干扰帧以 4 为周期；被毁视角中速度辅助被拒（`player-unavailable`）、失败变体也无来电，所以 slot 7 消息行只验证为空。地图像素与输入归 28，生命周期与资源平衡归 29。

**Rubber-duck（code-review 代理担任）：** 6 项发现均已处理：① 页 6 标题只检同色 → 改为非 0 单色并加“右移一像素”负对照；② 页面大部分未比较 → 页 6 增加三条标签与刻度和条形之间全 0 的检查；菜单页“多余墨迹”检查经实测不成立（合成 BITM 不覆盖面板，原版规则下旧像素保留），改为在 helper 注释中说明；③ SNIP 时间检查近乎空 → 起点钉在 `left-page-changed`（page=1）的 tick，样本增至 5 个，并加 ±3/±6 tick 负对照；④ 能量页换调色板对照无效 → 改用 `energyPageWrong`；⑤ 闪光取样依赖暂停速度 → 提前到 tick 4 并在仍可能闪光时重试一次，失败信息含 tick；⑥ 黑边检查可能跳过 → 增加画布四周页面像素在闪光前后相同的断言，黑边断言保留条件形式（游戏视图本身保持 4:3）。
**Simplify：** 只限本组测试代码，自行按四个角度审阅（未另起代理）：把运行驾驶与检查函数集中到 `support/cockpit.ts` 供两个规格共用；名称解析按运行所用包一次性解码；`clockAt` 直接用 projection 的 `clockUnitsPerTick`；删去未用导出与 F1 例中与停靠例重复的菜单步骤。未改：`craftRecord` 与 [mission-result.ts](../../../../../e2e/support/mission-result.ts) 的 `record`、`twoBasesPackage` 的 payload 替换与 [ai-wingman.ts](../../../../../e2e/support/ai-wingman.ts) 的 `withPayloads` 有少量重复，后两者在写入范围之外且未导出所需形式。
**文档影响：** [engineering README](../../../../engineering/README.md) 第 196 行仍写 `expectFlightCanvas`“另有隐藏的 2D 地图光标”，并缺少本组驾驶舱回归的说明与聚焦运行命令；该文件不在写入范围，建议文字见 worker 报告。原版事实与 U 项不变。
**私有输出：** `local/research/p3-13/27-browser-cockpit/`（`runs/*.log` 各次运行日志、`explore/` 中的合成画面截图、逻辑像素转储与 Node 种子/菜单探索脚本）。
