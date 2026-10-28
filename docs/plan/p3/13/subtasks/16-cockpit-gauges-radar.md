---
type: plan
status: active
phase: P3
task: "13"
subtask: "16"
updated: 2026-10-28
---

# 16 — 前视框架、角落仪表与雷达

**契约来源：** [spec](../spec.md#前视驾驶舱与仪表) 的 S-04/S-05，AC-07/08/09。
**依赖：** 14, 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 实现框架元素/调度描述及类型 0–3、5 的独立绘制模块，未到期保留上次画面。
- 满刻度、受损读数与颜色按 02/08；状态 3 按每个原版读取者规则而非全局夹取。
- 雷达只读 Core 接触点，投影使用已确认相机输入；严格 due、Warp 停建、120 总项及噪点策略精确实现。

## 不包含

不改世界感知/目标筛选，不改应用装配（24）。

## 关键文件与契约

- [radar.ts](../../../../../src/core/rules/radar.ts)、12 的读模型与 14/15 的纯模块。
- 计划新增 `src/render/cockpit/gauges/`、`radar/`、`frame/`。

## 写入范围

- `src/render/cockpit/gauges/**`：类型 0–3 与测试。
- `src/render/cockpit/radar/**`：投影/噪点/缓冲与测试。
- `src/render/cockpit/frame/**`：框架合成描述与静态像素测试。

## 验收标准

- [x] 框架遍次/仪表顺序、强制重绘与缓存保持正确。
- [x] 速度内容基准不与动态上限混同，零分母按批准合同。
- [x] 独立世界位置/朝向期望通过，容量临界/零方向/状态1/2/3及Warp覆盖。

## 验证方法

`pnpm test -- src/render/cockpit/gauges src/render/cockpit/radar src/render/cockpit/frame`、`pnpm check`；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 限这三类模块。私有截图验收归31。

## 完成证据

2026-10-28，worker 分支 `exec/p3-13-16`（基线 `17ed65c9`）。未启动 DOSBox-X，未改 `presentation/**`、`raster/**`。

**交付（纯模块，按 14 的 `CockpitModule` 接入，24 装配）。**

- [gauges/gauge-bars.ts](../../../../../src/render/cockpit/gauges/gauge-bars.ts)：平条 `0x41680` 与异形条 `0x417a4`（[hud §4.2](../../../../original/formats/hud.md#42-corner-gauges-types-04)）。T[i] 按公式计算；n = chop((y1 − y0) × v)，超出 i32 取整数不定值 −2³¹；自锚行每隔一行画线并补一行；补行在 B 中用 T[2J]，送屏按各行自身 T；标签 fonts/0、颜色 8；`alwaysRedraw` 为 false 时平条先填 0 并送整个矩形，异形条逐行送形状段。项目界限（切片读数不可达）：下标超过 56 项时沿公式取 29（原版读表后内存）；行走在 480 行面边缘停止，不复现 16 位行回绕。
- [gauges/corner-gauges.ts](../../../../../src/render/cockpit/gauges/corner-gauges.ts)：`createCornerGauges({ font, labels })` → 类型 0–3 的处理器与只读查询 `timers()`。读数按 D16：类型 0 为 f32(speed ÷ `recordMaximumSpeed`)；类型 1 在视角 1 用 `recordMaximumSpeed`、其他视角用 `maximumSpeed`，满刻度不大于 0 时取 0；类型 2/3 为整数比的 f32。类型 0/2/3 的满刻度为 0 时（原版此处除法故障）报 `invariant-violated`，只在实际取真值时检查。字段 17/18/16/15：状态 0 取真值；状态 1 先抽一次，低两位为 3 取真值，否则再抽一次取 f32(rand × f32(1/32767) × 0.1)；状态 2 立即返回；状态 3 报 `invariant-violated`（原版画出未初始化的栈值，无法复现；雷达的状态 3 由 Core 按状态 0 读取）。能量/护盾的私有计时：槽 +0x0C 为 0 时 clock < due 即整段返回（全量重绘不绕过）；颜色取旧相位；due ≤ clock（非严格，u32）时翻转并 due := clock + 周期。每运行初值为 0/0x40/1、0/0x20/1（Δ-04）。没有玩家时直接返回。
- [radar/radar-geometry.ts](../../../../../src/render/cockpit/radar/radar-geometry.ts)：`radarGeometry`（`0x3ffb4`：中心、r、scale、三环与半环半径、y0…y1−1 的逐行跨度）、`planeOffsets`（同 tick 相机的 off_k）、`projectOnPlane`（`0x40d44`，f32 存储点照记录）、`radarPoint`（k = 2 取 a、b；|b| < 0.707 用 k = 0，否则 k = 1 取 c；退化时用每实体缓存）。半径小于 0 的矩形为 `invalid-input`。
- [radar/radar.ts](../../../../../src/render/cockpit/radar/radar.ts)：`createRadar()` → 类型 5 处理器（激活、预遍、绘制）与只读查询 `state()`（条目、已画标志、重建/闪烁到期与相位、`noiseDropped` 即 DC-08 的 `radarNoiseDropped`）、`cachedDirection(entityId)`（DC-12：供 21 的偏心指针；实体不再可呈现时清除，状态 2 冻结）。接触点只读 `radar.contacts` 与 `RadarContact.position`，颜色、形状、目标框按 T6；重建 `due < clock` 严格、due := clock + 5；闪烁在绘制与预遍中 `due < clock` 严格、+0x10；预遍只在已画后擦除 B 中条目（不送屏）。状态 1：1 次计数抽取 + 每项 5 次 + 尚有剩余时 1 次假框；状态 2：60 项 300 次；条目总数 ≥ 120 时噪点不保留但照常抽取并计数，Core 给出超过 120 项时报 `invariant-violated`。Warp：不重建、不画条目、不翻转、不抽取，只清圆盘、画环、送跨度；没有玩家时只清并送跨度。
- [frame/cockpit-frame.ts](../../../../../src/render/cockpit/frame/cockpit-frame.ts)：`createCockpitFrame({ content, layouts, images })` → 唯一的 `paintElement` 提供者，覆盖所有有布局的槽（slot 0 前视框架与 slot 2 地图框架，22 不应再提供）。创建时核对布局存在、元素数与图像一致、图像为 `direct` 且在 640 × 480 内（`invalid-input`）；绘制用 `blit` 的 `mask` 模式（原始图像含索引 0 全写，RLE 只写不透明段），返回图像矩形。

**验证。**

- `pnpm exec vitest run src/render/cockpit/gauges src/render/cockpit/radar src/render/cockpit/frame`：4 文件 56 项通过。`pnpm check`（typecheck + lint + Vitest 408 文件 11 183 项 + 构建）：通过，退出码 0。`pnpm exec vitest run tools/engineering-boundaries.test.ts -t cockpit`：7 项通过（新目录遵守 `osr/cockpit-imports`）。
- 关键断言（期望按 hud §4.2/§4.3、T6、D16 逐例手算，合成内容）：T 表 0–21 为 10、22 为 11、48 为 28、49 起为 29；n = 2k − 1 与 2k 画面相同；补行 B 宽于送屏；模式 2/3 及其他模式按 3；值 > 1 的线只留 B；速度读 `recordMaximumSpeed`（以 `maximumSpeed` 为分母的负对照不成立），指令速度在 Warp 换基准、满刻度 ≤ 0 为 0；零满刻度故障且状态 2 时不检查；能量/护盾 10 组阈值（含 0.25、0.5 边界）的首两次颜色、周期与 due；全量重绘与受损时私有计时仍拦截且不抽取；状态 1 逐次抽取与独立 `cockpitRandom` 序列一致并覆盖两个分支，状态 2 保留旧画面、计时不变，状态 3 故障；雷达几何与跨度、正前方（退化方向）居中、右/下/前上 45°/后左 45°、偏航且离原点的相机、大坐标下 d 只在加偏移后存一次（未修正时 side 翻转的负对照）、退化时沿用缓存；8 个接触点的位置/颜色/形状/目标框与 S 像素、环在条目之后且无十字线；跨度精确清除与送屏；interval 3 时重建只在 1、5、9、13 tick，interval 6 时每次调用都重建；预遍擦 B 而 S 保留、闪烁严格翻转；状态 1/2 噪点与独立推导一致（抽取数 1 + 5n + 条件、300）；119 + 目标框满 120 时噪点全丢、118 时只保留 2 项且抽取数不变、121 项故障；Warp 中状态与抽取数不变、圆盘只含环；框架静态区（10 个仪表矩形与雷达跨度之外）与生产 `composeLayout` 逐像素相同（面板下移一行的负对照 > 1000 处不同），遍 1 准星画在雷达之上，+48 = 0 面板只在全量重绘时绘制并在其间保留，同视角选组后重画；地图框架每帧绘制、与合成相同；1×n 与多种分批的状态、B/S 与 schedule 完全相同。
- **Rubber-duck（code-review 代理担任；环境无 rubber-duck 类型）：** 唯一发现——`projectOnPlane` 把 R_k·p 先存 f32 再加偏移，比原版多一次舍入，大坐标下 d 几乎总有差异、相机平面附近的 side 可能翻转。已采纳：只在加偏移后存一次，新增大坐标用例（修正前该用例失败）。其余四类行为审阅认为与文档一致。
- **Simplify：** 按复用、简化、效率、层级四个角度自查本次 diff：雷达两种噪点合并为一个抽取函数（次序不变），建造函数直接接收玩家的雷达读数，删去冗余别名与常量；未改行为，复跑上述检查通过。
- **文档影响：** 本写入范围外的建议见 worker 报告：`docs/engineering/modules/render.md` 的驾驶舱 API（24 的范围）；hud §4.3 可补充两条由代码组合推出的事实（宽度为较小边且为奇数时跨度伸出矩形各 1 列；切到 Warp 的首帧预遍仍会测试一次闪烁）；DC-11 或 hud §4.2 可登记上述项目界限与状态 3/零满刻度的故障处理。`docs/original/` 与 unknowns 未改。
- 无私有输出；检查日志只写在本 worktree 的 `node_modules/.cache/`。
