---
type: plan
status: active
phase: P3
task: "13"
subtask: "20"
updated: 2026-10-28
---

# 20 — 目标显示屏与独立深度场景（实施为 CPU 私有设备）

**契约来源：** [spec](../spec.md#右侧目标显示屏) 的 S-07，AC-12/18。
**依赖：** 14, 15, 17。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按04/08的目标选择器、变体和内容绘制专用灯光/相机/背景，不以世界Render State缺失隐藏已选目标。
- 实现无目标、Warp离开提示、标记十字、距离/速度/护盾/机型文字与严格刷新。
- 干扰使用17交付的真实模块，集成不以替身验收。
- GPU计划和目标独立深度附件计入预算；合成回游戏图像时不改世界深度。（2026-10-28 协调者注：spec 的 D-01 修订改为 CPU 私有设备，不分配 GPU 渲染目标或深度附件。）

## 不包含

不改目标清除规则和P3-12世界灯光，不实现SNIP算法副本。

## 关键文件与契约

- [model-lighting-layer.ts](../../../../../src/render/flight/lighting/model-lighting-layer.ts)、[flight-gpu-cache.ts](../../../../../src/render/flight/renderer/flight-gpu-cache.ts) 只读复用。
- 计划新增 `src/render/cockpit/target-display/`；复用17的 interference 模块。

## 写入范围

- `src/render/cockpit/target-display/**`：目标屏场景、数值、缓存及测试。

## 验收标准

- [x] 目标变体/离场/无目标/标记/零分母与计数正确。
- [x] 使用真实干扰模块，状态14门禁与节奏不重复推进。
- [x] 独立深度/资源预算/释放正确，不破坏Warp保留深度。

## 验证方法

`pnpm test -- src/render/cockpit/target-display`、`pnpm check`；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 仅目标屏，像素和真实场景在27/31验证。

## 完成证据

2026-10-28，worker 分支 `exec/p3-13-20`（认领基线 `2ac17401`，开工前快进到含 19 的 main `d67843e4`）。

**交付（`src/render/cockpit/target-display/`，纯模块，无 DOM/GPU/app/宿主时钟；未用 `gpu/`）：**

- [target-display.ts](../../../../../src/render/cockpit/target-display/target-display.ts)：`createTargetDisplay({ font, background, palettes, hudText, interference, models, names })` → 处理类型 7 的 `CockpitModule`（`instruments[7].activate/draw`、`beforeDraw`），另有只读 `state()`（`shown`、`nextRefresh`、`notice`、`forcePending`、干扰门）、`device()` 与 `budget`（`imagePixels` 9,216、`devicePixels` 10,000、`renderTargets` 0）。依 `0x42d80` 的次序：无玩家返回 → 待决的设备重建（每个 `view-switched` 与运行开始）或目标实体改变则强制 → 子系统 14：2 开干扰（关时记开始，不动刷新），1/3 在采样 u32 严格大于下次切换时用 17 的 `toggleInterference`（抽 1 次）并令下次刷新为 0，0 不读门；非 0 且开时调 17 的共享 `DisplayInterference.draw(…, start, alwaysRedraw)` 后返回 → `target-cleared`（cause `warp`）置 20 次离开提示：每次调用复制设备**上一幅**画面、画 `targetWarpNotice` 并送屏 → 无目标：采样严格超过下次刷新时清成背景、下次刷新 = 采样 + 0x80 并强制；强制时复制设备（不重渲染，可能仍是旧模型）并画 `targetNone` → 有目标：强制或到期时格式化读数并渲染、下次刷新 = 采样 + 9，然后复制设备、四行读数、名称与（标记）十字。无模型或无移动块的目标（原版 `0x44070` 失败）不画、放弃缓存目标，下次调用重试。复制为设备窗口 ((100 − w) >> 1, (100 − h) >> 1) 起 (w + 1) × (h + 1)（HI 即 (2,1)–(98,98)，多出第 587 列、第 443 行只写入 B）；送屏恰为矩形，且仅在画时（目录 +0x0C 为真时不送屏）。文字均 fonts/0、色 8：距离 x1 − (33 + 8·[>9999,>999,>99,>10])、y0 + 2（≥ 99999 时 × 0.001，阈值比较其 f32、打印 double）；速度 x1 − (33 + 8·[>99,>10])、y0 + 11；护盾 F(shield/c5C × 100)（c5C ≤ 0 为 0）于 x0 + 3 + 8·[<100,<10]、y1 − 8；机型值 F(at08 × 0.001)，未舍入积 > 1000 时再 × 0.001 并偏移 −12，x1 − (17 + 8·[>99,>10])；名称 (x0 + 3, y1 − 17)，标记为 `mapMarkerName`，其余经注入的 `names`。标记（种类位 25）：不画模型，三行为标记字面量（x1 − 33、x0 + 19、x1 − 17），十字以 0x0F 画于矩形中心。模型色：护盾 < 1 且非种类 0x2000/0x4000 → 0x0A；护盾/c5C > 0.25 或该两种类 → 0x10；否则 0x0F。观察距离 `targetViewDistances[kindBit]`（位 0–19，其余非标记为 `invariant-violated`）。模型只经注入的 `models.get(CombatTarget.model)` 取得（24 接线），缺失为 `binding-mismatch`；从不读 Render State 的可见集合。
- [target-scene.ts](../../../../../src/render/cockpit/target-display/target-scene.ts)：本运行独立的 100 × 100 索引设备 `TargetScene`：每次渲染先按 ⌊96u/100⌋ 拉伸 TEX 11089（不加明暗），再以单色画目标模型列表 0 的全部部件；网格顶点 P + x·X + y·U + z·D（目标库行 dir = R2、up = R1，PV5）；相机 C = T + (P − T)·(D/d)、dir = u = (T − P)/d、up = 玩家 R1，|R2·u| ≤ 0.01 时以世界 +y 注视（`0x857b0`：s = F(√(1 − dy²))，|s| ≤ 0.0001 时 up = (−dy, s, 0)）；被库拒绝的朝向保持上一个（初值单位阵）；投影 sx = F(50 + 2x·50/z)、sy = F(50 − 2y·50/z)，1 ≤ z < 900，跨前/后平面的三角形在相机空间裁剪（高概率），屏幕边界逐像素裁剪。`rebuild()`（视角切换的新设备）把设备置 0（未确认，见下）。
- [silhouette-raster.ts](../../../../../src/render/cockpit/target-display/silhouette-raster.ts)：RS1/RS2/RS4 的单色三角形填充：行 = round-half-even(sy)，旋转首点为最小行，16.16 边起点 round-half-even(sx·65536)、无预步进，步长 chop(Δx·F(1/Δrow)·65536)，跨度 ⌊xl⌋ ≤ x < ⌊xr⌋；四种剔除情形保留屏幕顺时针三角形。所有面同色且背景深度为最远值，深度测试（RS5）不可能改变任何像素，因此设备不建深度缓冲。
- **独立深度/预算/释放（CPU 设计，协调者首选）：** 目标场景整个在 CPU 上画进私有设备，只把颜色复制进 B；不分配 GPU 渲染目标或深度附件，世界深度与 Warp 保留深度在构造上无从触及；TEX 11089 的 9,216 像素经 `checkImagePixels` 在创建时核对，并以 `budget.imagePixels` 交 24 计入驾驶舱 2²⁰ 图像总额；设备 10,000 字节固定；无须释放的 GPU 资源（运行结束随模块回收）。与 spec 中“独立深度附件”“GPU 计划渲染目标 ≤ 1（右显示屏）”的写法不一致，修订建议见 worker 报告。
- 新增的代码常量取自私有只读分析（未写入 `docs/original/`，见下方文档影响）：`0x173a64` = 0.0001（f64），以及 hud §4.5 已列阈值 99999/9999/999/99/10/100/1000（f32）、0.001/100/0.01（f64）、0.25（f32）的实际值。

**验证：**

- `pnpm exec vitest run src/render/cockpit/target-display`：3 个测试文件 68 项通过。
- `pnpm check`（typecheck、lint、Vitest 418 个文件 11,350 项、构建）：通过，退出码 0；只有既有的 >500 kB 块体积警告。simplify 后复跑目标屏测试、typecheck 与 lint 通过。
- 关键断言（合成内容；期望画面在测试中按记录规则独立构造：拉伸公式、手算的剪影盒与文字坐标、`drawText`/`drawLine` 原语）：首绘整幅 B 逐像素相等（设备窗口、四行读数、名称），送屏恰为矩形，第 587 列/第 443 行在 B 不在 S；模型不依赖 Render State 的实体；9 种护盾/种类组合的颜色（含 0.25 不严格、c5C = 0、种类 0x2000/0x4000）；距离 10/10.5/99.5/99998.5/99999/150000.5、速度 10/10.5/99.5、护盾 100/99.5/0.5/c5C ≤ 0、机型值一次/两次（−12）的文本与 x；标记分支整幅像素（无模型、三字面量、`mapMarkerName`、12 段十字）；有目标每 9 单位严格刷新（奇数时钟 11 不到期、12 到期），换目标与视角切换强制；无目标 0x80 严格（140 不到期、142 到期），强制调用复制仍显示旧模型的设备；离开提示恰 20 次、每次送屏并覆盖旧画面，之后回到无目标，其他原因不提示；无移动块的目标不画、每次重试；无玩家不变；子系统 14：状态 2 帧 0,0,0,1,1,1 且不抽随机，状态 1 的切换时刻/次数等于 `cockpitRandom(TEST_SEED)` 推得的期望、关时内容立即重画，切换把刷新置 0（无目标场景中下次刷新 130 前即重画），状态 0 不读门；与真实左显示屏共用一个干扰实例时同 tick 后画者跳过同帧（负对照：分开实例两屏都画）；Warp 中 B 每次显示清 0 而 S 保持到下次绘制；从地图返回的首次调用被强制并复制重建后的设备；1×30 与 5+0+5+2+5+5+3+0+5 分组的 B、S、状态与抽取次数相同；背景尺寸/掩码、最近色映射（及缺调色板）、fonts/0 未映射字节、缺 `names`/`models`、设备放不下的矩形（激活时）与缺模型均为结构化错误。场景：拉伸恰在第 1、26、51、76 列重复；剪影 30–69 列 × 42–57 行，负对照镜像（剔除）、转 90°（高窄）、相邻表值 37.5（36–62 × 45–54）；目标库行与相机两分支（玩家 R1 向上与世界向上）、被拒朝向保持、退化 up；前/后平面裁剪。光栅：手算的跨度、四种剔除与旋转不变、round-half-even 行与列、F(1/25) 使步长为 65535 的截断、越界与非有限值。
- **变异检查**（`local/research/p3-13/20-target-display/mutate.sh`）：严格/非严格的目标与无目标刷新、0.25 比较、20 次、窗口偏移、−12、速度阈值、状态 0 读门、换目标强制、切换后刷新置 0、99999 边界、护盾阈值、失败时放弃缓存、重建设备、种类 0x4000、F(1/n)、half-even、0.01 分支、拉伸公式均被测试杀死；RS4 一般情形 `≥ 0` 改 `> 0` 未被杀死——零面积三角形按 RS4 本就不覆盖任何列，不可观测。
- **Rubber-duck（code-review 代理担任）：** 对照私有反汇编逐项核对次序、门控、u32 严格比较、送屏条件、模型失败、读数精度与位置、十字 12 段、相机与光栅/裁剪，未发现代码缺陷；唯一发现为 spec 与本文仍写 GPU 渲染目标/独立深度附件，而实现为 CPU 设备——不在本子任务写入范围，已作为修订建议交协调者（见 worker 报告）。
- **Simplify（按复用、简化、效率、层次四个角度自查本次 diff）：** 抽出 `craftReadings` 与 `shade(shield, kindBit)`，去掉重复的空值检查；字形核对改为逐项闭包；模型查找用 `?? fail`；完全在深度范围内的三角形跳过裁剪分配。未复用 `drawn-pose.ts` 的 `libraryOrientation` 与 `projection.ts` 的取整（驾驶舱边界规则禁止导入 `render/flight/scene`，前者还依赖 Three.js），也未改 `left-display-content.ts` 的私有 `literalBytes`（不在写入范围）。复跑测试、typecheck、lint 通过。
- **文档影响（均不在写入范围，交协调者）：** ① spec「右侧目标显示屏」与 DC-08：改为右显示屏以 CPU 私有 100 × 100 设备渲染（ADR-0009 的设备像素渲染不适用于该 100 像素设备，按原版逻辑像素即原版设备分辨率），GPU 计划不再为其保留渲染目标与深度，纹素合计相应去掉 (100 × `MAX_PIXEL_RATIO`)² 的颜色与深度，CPU 绘制面一行补 100 × 100 设备；`COCKPIT_LIMITS.renderTargets` 可由 24 归零。② hud §4.5 / executable T7 宜补：look-at 的 up 公式与 `0x173a64` = 0.0001 的退化分支；子系统 14 状态 3 与 1 同路（`CMP EAX,2` 后的 else）；离开提示与无目标强制时复制设备的现有画面而不重渲染；读数打印精度（缩放后以 double 打印、阈值比较 f32）；视角切换新建设备的初始像素未确认（本实现取 0，只在切换后 0x80 内无目标或离开提示倒数中可见）。③ `docs/engineering/modules/render.md` 的驾驶舱 API 由 24 同步（`createTargetDisplay` 与其注入项 `models`、`names`、共享 `interference`、`budget`）。`docs/original/unknowns.md`、STATUS 与 phase `tasks.md` 无需改动。
- **私有输出：** `local/research/p3-13/20-target-display/`（`check.log`、`constants.ts` 读取上述代码常量、`rand.ts`、`mutate.sh`）；只读参考 `local/research/p3-13/04-target-overlay/`。未运行 DOSBox-X、未开 Ghidra（只读既有私有输出）。
