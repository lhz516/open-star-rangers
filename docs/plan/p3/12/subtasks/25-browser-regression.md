---
type: plan
status: active
phase: P3
task: "12"
subtask: "25"
updated: 2026-10-17
---

# 25 — 飞行画面浏览器回归

**契约来源：** [spec](../spec.md) 的 S-02、AC-22（浏览器部分）；AC-02 至 AC-16、AC-23 的浏览器部分；[验证策略](../spec.md#验证策略)。
**依赖：** 23, 24, 34。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)，用合成任务包经正式流程进入飞行；按验收矩阵扩展合成内容（光照方向、受击、星云方向不对称图案、爆炸、碎片、Warp），不读原版文件。
- 读取实际绘制缓冲或经验证的截图链，在指定位置断言独立预期的颜色与掩码：三维内容（AC-07）、受击闪烁（AC-08）、星云（AC-09）、弹丸导弹碎片（AC-10）、精灵（AC-13）、闪光（AC-14）、合成与在制提示（AC-16）；“画布存在”“非黑像素”“调色板成员”只作辅助。
- Warp：用 P3-09 已有的开发命令入口执行一次实际 Warp 并读回（AC-15）；被毁视角：在隔离测试入口用合成状态驱动 14 的相机并读回（AC-06）。
- 生命周期：resize 与设备像素比（AC-05）、暂停与原生页面隐藏、重试、包替换、上下文丢失与 WebGL 不可用（AC-03）、资源平衡与 GPU 计数（AC-02）、网络审计与生产 CSP。
- 记录本机 Chrome 的帧耗时，不设阈值。缺少必需能力时记录未验证并换允许的本机路线，不跳过后宣称通过。

## 不包含

- 真实内容与原版对照（26、27）。

## 关键文件与契约

- 现有：[e2e/](../../../../../e2e/)、[resource-balance.ts](../../../../../e2e/support/resource-balance.ts)、[import-scenarios.test-support.ts](../../../../../src/workers/import-scenarios.test-support.ts)、[synthetic-content.test-support.ts](../../../../../src/content/synthetic-content.test-support.ts)、[本地浏览器 runner](../../../../engineering/README.md#本地浏览器-runner)。

## 写入范围

- `e2e/**`：飞行画面用例与支持代码。
- `src/workers/import-scenarios.test-support.ts`、`src/workers/synthetic-import.test-support.ts`：合成任务包扩展。
- `src/content/synthetic-content.test-support.ts`、`src/content/**/*.test-support.ts`：合成内容扩展。
- `src/render/flight/**/*.test-support.ts`：浏览器测试入口与场景构建（只限测试支持文件，不改生产代码）。

## 验收标准

- [x] AC-02 至 AC-16 与 AC-23 的浏览器部分各有独立预期的像素或 DOM 断言与证据（含闪光平移与星点、速度尘埃）。
- [x] AC-22（浏览器部分）：resize 与像素比、暂停与隐藏、重试、包替换、上下文与不可用、资源平衡、网络审计与生产 CSP 通过；帧耗时已记录。
- [x] 既有 E2E 不回归；`pnpm check` 通过。

## 验证方法

- 既有本地 Playwright runner；按 browser-testing 操作并在完成证据中记录命令、浏览器版本与结果。

## 完成证据

本机环境：macOS 26.6（arm64），Chrome 155.0.8059.82（Playwright channel `chrome`，headless；原生隐藏用 headed），Node 与 pnpm 按仓库版本；端口 5175/5176。全部用例只用代码生成的合成内容，不读原版文件。

**做法。** 期望值都在测试侧按 `docs/original/formats/executable.md` 的规则独立写出（[flight-pictures.ts](../../../../../e2e/support/flight-pictures.ts)：星表 SD2/SD3、星云 NB1/NB3/NB4、PV3 投影、调色板；[flight-models.ts](../../../../../e2e/support/flight-models.ts)：LS2–LS7 光照与色阶、PV5 位姿、仿射纹理坐标），不调用渲染器模块；读回是页面合成后的截图（沿用 viewer-observations 已验证的截图链，在页内解码，按逻辑像素取设备像素中心）。“画布存在”“非黑”“调色板成员”只作辅助。

- **隔离入口（新增）：** [flight-scenes.html](../../../../../e2e/entries/flight-scenes.html) 只由开发服务器提供，载入 [flight-scenes-entry.test-support.ts](../../../../../src/render/flight/renderer/flight-scenes-entry.test-support.ts)：真实 `createFlightRenderer`、生产表面选项的浏览器 WebGL 2 表面与真实 `wireFlightRun`，由 `fakeRun` 交付合成逐 tick 输入；内容为 23 的集成内容加几个可预测的四边形模型、单色外壳纹理与统一阈值（[flight-scenes.test-support.ts](../../../../../src/render/flight/renderer/flight-scenes.test-support.ts)）。没有新增查询键，网络策略不变。
- **正式流程：** 开发测试入口 `worker=mission-startable` 经真实 Worker 导入后正式进入飞行；生产项目以 `missionPackage()` 预置并经菜单恢复。合成生产包开始时玩家行矩阵为单位阵，F1 画面可独立预测。

| 准则 | 用例（文件 › 用例） | 预期（独立计算） | 结果 |
|---|---|---|---|
| AC-09、AC-23 星点、AC-16 | flight-scenes › backgrounds | 单位行：整幅画面逐像素等于“黑底 + 槽 0 星云（行轴向左、列轴向下，x 257–384、y 177–304）+ 57 颗星（SD3）”，恰有列表中的一个起点能解释；转 180° 后槽 1 显示下一项（起点 + 1），θ = 0（行轴向右、列轴向上），在 ±4 像素的位置搜索中恰有一个位置逐像素相符 | 通过；起点与位置见附件 `nebula` |
| AC-07 | flight-scenes › models | 平面、贴图平面与不受光贴图四边形：光朝世界 −x（LS2），偏航 0.6/0.8/0.95 得明暗级 1、正对或背光得 0；色阶 min(255, chop(c·a + c·(i/3)·F(1 − a))) 再取最近 DATA 项；贴图按屏幕空间仿射插值取纹素（有若干采样像素上透视正确插值会取到别的纹素，证明是仿射）；近处模型遮挡远处；“先量化再着色”会得到别的项 | 通过（约 3.7 万个指定像素） |
| AC-08 | flight-scenes › hit shimmer | 统一阈值 20：命中后第 4 tick（t = 15）外壳色覆盖整个外壳，第 5 tick（t = 19）只在 0x7F 的屏幕门矩阵通过的像素（逻辑 (x + y) 偶数）显示，第 6 tick（t = 23）消失，其余为船体平面色 | 通过 |
| AC-10 | flight-scenes › projectiles… | 弹丸记录 0：模板按宽度与长度标记展开，正面三角形内为其颜色字节的最近 DATA 项（不受光），周围为背景；判别值 3 碎片：机体模型第 1 列表部件 1 在碎片位姿处无偏移、平面受光（HS9），只画朝向相机的三角形；导弹：只断言在其展开顶点的凸包内有绘制（外观由 20 的 Node 测试覆盖）；画面中没有这三者以外的变化像素 | 通过；导弹逐像素外观未在浏览器断言（限度） |
| AC-13 | flight-scenes › explosion sprites | large 爆炸在深度 100：缩放 trunc(4t) = 3，块左上 = 中心 − (3w >> 1, 3h >> 1)，3 × 3 单元为帧 f 的 DATA 10f + 3j + i；第 0–2、3–4、5–6 tick 为帧 0、1、2，第 7 tick 起隐藏；前方四边形覆盖的块按块整体隐藏（块左上像素的深度） | 通过 |
| AC-14、AC-16 | flight-scenes › screen flash | 玩家受击（闪光 0：掩码 6、0.5 s、每 tick 抽取、级别 63）：开始 tick 不变；之后每 tick 整幅游戏画面（含驾驶舱行）恰为“上移 (r AND 0xFFFE)/2 ∈ {0,1,2,3} 行、露出行为黑、全部按表 chop((d − e)/d × 63) >> 1 变换”中的唯一一种，且至少一个 tick 平移 > 0；超过持续时间后复原；画布两侧黑边为黑；静止帧冻结 | 通过 |
| AC-23、AC-04 | flight-scenes › views and speed dust | 地图、基地、0x13 整幅黑；地图标记不画；F1 份额 0 与 1 时画面恰为背景，份额 50 时差异像素 ≤ 50、在列 1–638、行 1–314 内，颜色恰为 DATA 2 与 4 | 通过 |
| AC-06、AC-23 | flight-scenes › destruction view | 切换事件快照姿态（预转 32°）进入 0x11/8：相机行为单位阵、整屏视口（中心行 240）、68 颗星；不跟随时每 tick 沿 −R2 后退 30 × 2 ÷ 64（alpha 0 绘制前一 tick 相机）；四边形按此逐 tick 缩小；爆炸前份额 30 的尘埃为 DATA 2/7、≤ 50 | 通过；P3-11 的真实死亡与救援转换未验证（交 P3-15） |
| AC-15、AC-23 | flight-scenes › Warp effect | 视角 1：只有隧道色 (0,e,0)/(e,e,e)、单位行星点（> 30 颗未被覆盖）与黑；行 316 起全黑；中心无隧道；份额 0 无尘埃；份额 60 时尘埃为 DATA 2/7 且连成线段 | 通过 |
| AC-15 | flight-render.development › real Warp | 经地图与面板命令编辑器（P3-09）实际 Warp：地图中画面全黑；Warp 中（开始闪光之后）隧道像素 > 200、除隧道色与 DATA 1–7 外无其他颜色、驾驶舱行全黑、尘埃连成线段；完成后回到 F1，无隧道色 | 通过 |
| AC-16、AC-23、AC-04、AC-05、AC-03、AC-22 | flight-render.development › F1 picture… | 暂停后 F1 画面等于“黑底 + 起点星云 + 57 星”，差异只有 ≤ 50 个尘埃像素（DATA 2–7，列 1–638、行 1–314），驾驶舱行除在制提示外全黑，提示文字可见；暂停时绘制数与最后 tick 不变；窗口变窄后缓冲按 4:3 缩小，重画的画面是同一逻辑画面按新比例取样，黑边为黑；`WEBGL_lose_context` 丢失后提示 `context-lost`、tick 继续而不再绘制，恢复后继续绘制且画面仍为同一起点的背景 | 通过 |
| AC-02、AC-22 | flight-render.development › restart and replaced package | 重开（同一 owner 的第 2 个运行）与重新导入替换资源包（新 owner）后各自绑定并绘制；返回菜单后没有画布、此前的飞行画布都已断开且上下文已释放，资源平衡对基线逐项一致 | 通过 |
| AC-02、AC-04、AC-05、AC-16 | flight-scenes › layout and lifecycle | 1000×480、640×700、1280×960 与像素比 2（独立 context）下逻辑画面相同（模型边缘 2 像素除外），黑边为黑；静止帧重画但 tick 与画面不变；运行结束后资源为 null，同场景同种子同 tick 再运行的暖态资源与 GPU 计数相等；关闭后无连接的 WebGL 画布，无报告的错误 | 通过 |
| AC-16、AC-22 生产 CSP | flight-render.production | 生产预览的严格 CSP 下 F1 画面同上，没有开发诊断元素，返回后无画布，无 `securitypolicyviolation`，网络审计无违规或缺口 | 通过 |
| AC-03 不可用 | webgl-unavailable（既有，两项目） | 禁用 WebGL 的 Chrome：飞行区域 `unavailable`、可访问的 alert、没有画布，任务照常推进与释放 | 通过 |
| AC-22 原生隐藏 | native-lifecycle（既有，headed） | 真实隐藏期间没有动画帧；回到可见仍暂停时，飞行渲染器的绘制数与最后 tick 跨真实帧不变，最后 tick 不超过隐藏时暂停的 tick | 通过 |

- **帧耗时（不设门槛）：** 运行中 3 s 的 rAF 间隔：181 帧，中位 16.7 ms，p95 16.7 ms，最大 16.8 ms（Chrome 155.0.8059.82 headless，640 × 480，像素比 1，合成生产包 F1）。
- **网络审计：** 新用例全部用 `audited-test` 夹具，开发与生产规则下零违规、零证据缺口。
- **未验证与限度（如实记录）：**
  - 运行中改变设备像素比：Chrome 的模拟像素比（CDP）不触发 `resolution` 媒体查询的 change（实测 devicePixelRatio 变为 2 而无事件），表面只在该事件时读像素比，因此“运行中像素比变化”未在自动化中验证；像素比 2 在独立 context 中验证（AC-05 的其余部分通过）。
  - 速度尘埃的粒子位置与 Warp 线段端点未逐像素断言：重生抽取来自共享表现随机流，抽取次序按技术决定 5 由实现决定，逐项位置由 31 的 Node 测试（注入随机源）覆盖；浏览器断言门控、颜色、范围、数量上限与线段。
  - 正式流程的暖态 GPU 计数不逐次比较：运行缓存按首次绘制分配，只有同世界同 tick 才可比；该比较在隔离入口中完成。
  - 导弹外观、受击的玩家/被毁视角/Warp 分支、插值跨界折叠、EXPL 选择（AC-11/12 无浏览器部分）由各自的 Node 测试覆盖。
- **既有 E2E：** 基线（`5e82fa9d`，`pnpm test:e2e`）有 7 项失败，均因 15 接入飞行画布后旧用例仍断言任务画面没有 WebGL 画布或渲染监听：joint-pipeline（开发）、joint-resources 与 probe-contract（两项目）、production-preview（生产）、native-lifecycle（headed）。已在 e2e 内更新：`mission-observations.ts` 新增 `FLIGHT_SURFACE_LISTENERS` 与 `expectFlightCanvas`（任务画布已命名、连接且上下文存活，加隐藏的 2D 光标）；资源用例期望飞行表面的 6 个渲染监听与一个尺寸观察器，返回后全部释放；joint-pipeline 期望开发 StrictMode 先建后释放的两个飞行画布均已断开且丢弃上下文。
- **命令：** `OSR_E2E_DEV_PORT=5175 OSR_E2E_PREVIEW_PORT=5176 pnpm test:e2e`：全部 247 个用例通过（开发、生产与 development-headed，18.8 min）；聚焦：`pnpm exec playwright test e2e/flight-scenes.development.spec.ts e2e/flight-render.development.spec.ts e2e/flight-render.production.spec.ts`；`pnpm check` 通过（382 个测试文件、10601 个用例与生产构建）。
- **Rubber-duck：** 采纳——纹理改为按屏幕空间仿射插值并断言与透视插值可区分的像素；碎片改为精确的部件位置与颜色、导弹改为凸包掩码并断言没有多余像素；尘埃颜色集合改为精确相等并加数量上限；Warp 星点数量下限与 Warp 后的世界画面；原生隐藏的注释改为与证据相符；包替换加 owner 变化与旧画布释放的断言。未采纳——按 SD5/SD6 重放尘埃随机抽取（抽取次序由实现决定，见上）；以内容不同的第二个合成包做替换（需改 `src/original-data` 的合成生产夹具，超出写入范围；包绑定由 15 的 Node 测试覆盖），列为限度。
- **Simplify：** 模型期望与屏幕几何移到 `e2e/support/flight-models.ts`，三份点在凸多边形内的判断合为 `insideConvex`，像素集合改为 Set 查询，截图以 base64 传入页面并以 base64 取回，闪光比较提前退出；未合并的 `recordViolations` 副本（另有四个生产用例各有一份）留待以后。
- **文档影响：** 工程约定的本地浏览器 runner 一节已过时（“任务画面尚无画布/输入源与画布”“正常项目中……任务画面尚无画布”），且未列出新的隔离入口、飞行用例与 `flight-pictures`/`flight-models`/`flight-flow` 支持模块；属 28 的写入范围，已在报告中提出。原版文档与 unknowns 无新事实。
