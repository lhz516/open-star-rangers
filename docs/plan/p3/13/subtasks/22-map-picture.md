---
type: plan
status: active
phase: P3
task: "13"
subtask: "22"
updated: 2026-10-28
---

# 22 — 战略地图逻辑画面

**契约来源：** [spec](../spec.md#战略地图画面) 的 S-10，AC-16/19。
**依赖：** 14, 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 实现地图palette、框架绘制遍、网格、覆盖/迷雾、标记、标签/威胁闪烁、连线、信息行、zoom错开/方框/距离、目的地/光标读数与指针。
- 只读同tick map分区；零能量项目标记、计数行越出小窗但不越出屏幕按合同。
- 实现06/08确定的距离标签纯状态与双调用去抖端口，实际鼠标电平由23接入。
- 输出当前几何/绘制身份与GPU计划，ready只有实际合成成功后由24确认；消息行使用18的独立层组合，不另造队列。

## 不包含

不改变Core可见性/能量/选点，不画额外系统指针或可交互侧边按钮。

## 关键文件与契约

- [map.ts](../../../../../src/core/projections/map.ts)、[map-geometry-payload.ts](../../../../../src/content/hud/map-geometry-payload.ts)。
- 计划新增 `src/render/cockpit/map-picture/` 的地图内容与纯呈现状态。

## 写入范围

- `src/render/cockpit/map-picture/**`：地图图元/标记/标签、状态、GPU计划与测试。

## 验收标准

- [x] 各元素按权威顺序与palette输出，不重推可见性。
- [x] 选中多图标、计数行超窗、零能量和分区null/未就绪明确。
- [x] 去抖双调用、重开保留计数及本地指针/确认代价边界可独立断言。

## 验证方法

`pnpm test -- src/render/cockpit/map-picture`、`pnpm check`；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 限地图表现；28/31验证生产像素。

## 完成证据

2026-10-28，worker 分支 `exec/p3-13-22`（基线 `2ac17401`）。未启动 DOSBox-X，未运行 Ghidra；原版事实取自 [hud §4.1/§4.9](../../../../original/formats/hud.md#49-strategic-map-type-10)、[地图鼠标](../../../../original/formats/executable.md#map-mouse-input-p3-0503)、[放大窗口、信息窗口与标签](../../../../original/formats/executable.md#zoom-window-information-window-and-labels-p3-0904) 与 [06 的完成证据](./06-map-presentation-research.md#完成证据)；`0x4abe4` 与 `0x4b56c` 的边界细节只读核对了 06 的私有反汇编（`local/research/p3-13/06-map/out/p2`），未写新的私有输出。

**交付（纯模块，只导入自身、Core、content 与驾驶舱基础；无 DOM/GPU；随机抽取 0 次）。**

- [map-picture.ts](../../../../../src/render/cockpit/map-picture/map-picture.ts)：`createMapPicture({ font: fonts/1, unitMarkers: TABL 10461 的 29 条, zoomIcons: TABL 11401 的 29 条, hudText, names, costUnavailable, pointer? })` → `MapPictureModule`（`CockpitModule`，处理类型 10，`prepare` 为 ②）。③ 中按 `0x49f8c` 次序绘制：按钮 0 的绘制调用 → 信息行 → 友方圆盘 0x11、玩家圆盘 0x12、敌方圆环 9（圆盘裁到含端点盒 [x0, x0 + s]，圆环不裁）→ 网格 4（origin + i × trunc(s / `geometry.sectors`)）→ 标签（威胁按当 tick 时钟第 5 位 0xA/0xF）→ 指针处记录 26 与光标代价 → 世界内目的地的记录 27 与代价（+3, +3，低档 0xD）→ 其他世界内图标 → 目标记录 28 → 连线 8 → 玩家图标 → 放大窗口原点 + (4, 4) 的标题 → `0x4b56c` 错开 → 逐个放大图标（`boxed` 加 0xD 方框）紧随其编号（开关打开时，目标 0xF、其余 8）→ 外框（信息 0xD、放大 0xD、主地图 8，画在 x + w、y + h）→ 指针框 0xD（`zoomExtent` × 每单位像素，半宽截断，边缘只在 [x0, x0 + s] 内且端点钳位）。类型 8 消息行（18）与遍 1 框架元素（16 的唯一元素绘制者）不在本模块，由同一管线在其后绘制。projection 几何与类型 10 记录矩形不一致为 `invariant-violated`。
- [map-drawing.ts](../../../../../src/render/cockpit/map-picture/map-drawing.ts)：`drawRecord`（`0x4abe4`：色键 0，只在右/下收缩，左/上不裁；方框 (w′ + 1) × (h′ + 1) 四线画在图标之后；收缩到无列/行时不画像素但仍画方框）、`drawPanelOutline`、`drawGrid`、`drawPointerBox`、`clipLineStart`（`0x4c674`：先 x 后 y、f32 斜率、截断；同列/同行按 Δ-07 精确裁剪）。
- [map-zoom-spread.ts](../../../../../src/render/cockpit/map-picture/map-zoom-spread.ts)：`spreadZoomIcons`（`0x4b56c`）：图标表第 0 项不动（即使不是放大成员），步长为各自记录尺寸 + 2，盒子半宽截断、相接即重叠，九步累计偏移，越界立即试下一步，第 8 步回原位并结束扫描，计数用尽且原位越界时恢复原位，每次移动从 j = 0 重扫，每项至多 `COCKPIT_LIMITS.zoomComparisons`（10,000）次访问（计入自身与非成员），16 位像素。
- [map-picture-geometry.ts](../../../../../src/render/cockpit/map-picture/map-picture-geometry.ts)：给 23 的几何。

**交 23/24 的契约。**

- **几何：** `mapPictureGeometry(mapGeometry)` 从同一 `data/hud/map-geometry`（`readMapGeometry` 读出）给出 `{ screen: 640 × 480, mainMap: { left: x0, top: y0, right: x0 + s, bottom: y0 + s } }`，s = y1 − y0 + 1，即含端点记录的右/下边界为末列/末行 + 1；结构上等于 `MapInputGeometry` 去掉 `frame`。23 补上 `frame` 时其原点必须是输入区（Pointer Lock 目标）的边框盒左上，与指针采样原点相同（06 的几何表）。主地图半开 [x0, x0 + s)，鼠标钳位含端点 [x0, x0 + s − 1]（Core `quantiseMapPoint`）；外框、圆盘裁剪与指针框钳位到 x0 + s。
- **就绪凭证：** `drawn(): MapPictureDrawn | null`，`{ opening, serial, tick, geometry, pointer, pointerSource: 'local' | 'confirmed' }`。只在一次实际地图绘制完成后设置；开图（DC-09 第 1 步）、tick 结束不在视角 8、绘制时没有打开的地图（`player` 为 null 或 closed）、绘制中途抛错与 `dispose` 均为 null；`drawn()` 从不抛错。`opening` 为本运行开图次数，`serial` 为本运行地图画面数。模块每运行一个实例（新运行/重试新建，救援保留）。24 在该画面实际合成提交后才授予 `MapInput` ready；`geometry` 可与 23 的当前几何比对。
- **右键：** `CockpitTick.mapRightButton` 为 23 按 P3-05 资格给出的电平（失去资格即 false，Δ-09）；`labels()` 给出 `{ labelsOn, debounce, readDue }`（释放后拒绝）。
- **本地指针：** 可选 `pointer(): { right, down } | null`（P3-05 归一化 `MapPosition`），在每次地图绘制时读取，按 `quantiseMapPoint` 量化并钳到主地图；只驱动指针框与记录 26。
- **GPU 计划：** `MAP_PICTURE_GPU_PLAN = { texels: 0, renderTargets: 0 }`：地图在 CPU 画入驾驶舱屏幕面 S，由合成按 `palette/map/screen` 解析，二者已计入 DC-08 的驾驶舱计划。

**验证。**

- `pnpm exec vitest run src/render/cockpit/map-picture`：3 个文件 51 项通过（合成内容；字体每个字形带自身码位、图标索引带记录号，可从像素读回）。关键断言：
  - 次序与调色板：友方/玩家圆盘重叠处为 0x12，圆环压在友方圆盘上为 9，网格线穿过圆盘处为 4（圆盘在网格之前）；图标压网格，同像素的另一图标被目标记录 28 盖住，连线起点被玩家图标盖住、终点压在记录 26 上；标题“MAP”在放大窗口 + (4, 4)、主地图角为 0；外框在 x + w/y + h（共用列为最后画的主地图 8），不内缩不外扩；指针框 37 × 75 的四边、钳到主地图顶边时竖边端点盖住外框（负对照：外框其余像素仍为 8）。
  - 绘制辅助：记录色键洞、只在右/下收缩、左/上越界照画、方框 (w′ + 1) × (h′ + 1)（负对照 w′ × h′）、收缩到 0 列只画方框；网格 trunc 间距（负对照精确等分 9.5/17/24.5）；指针框完整/角落钳位的像素集；连线裁剪 4 例（含交点截断 (292, 338)）与同列/同行精确裁剪 4 例。
  - 错开：相同位置移 (+7, +5)、相接即重叠、分开不动、非成员第 0 项也固定、按各自记录尺寸、越界立即试下一步（含边界含端点）、第 8 步回原位、原位越界时恢复、第 3 轮扫描在第 10,001 次访问时停止（无上限时会回原位，可区分）。
  - 信息行：位置 (x + 4, y + 4 + 7k)、0x13/0xA（0x4000 计数行 0x13）、`%.0f` 半偶舍入（−2.5 → “-2”）、23 行时第 22 行画进放大区；满刻度 0 抛 `invariant-violated`（`map.information.rows[0].shield`），不输出 NaN。
  - 标签：第 150 行在下方、第 151 行在上方，3 像素横引线与斜引线；玩家/僚机 0xF、其他 0x10；受威胁在时钟 32、96 为 0xA，30、94 为 0xF。
  - 代价：确认光标 + (2, 2)，66/67/100 三档，无玩家图标不画；翻转边界 265/294 不翻、266/295 翻；E = 0 画“N/A”恒为 0xA（含负 c 与目的地）；目的地 + (3, 3) 低档 0xD，不在世界内或无玩家图标不画代价。本地指针 (150, 75) 时记录 26 与指针框在本地点，代价文字与连线终点留在确认光标，`pointerSource: 'local'`；钳位与无本地指针回退。
  - DC-09：新实例 (false, 0, 0)；开图后按住在第 1、17、33 pass 翻转（负对照 20 tick 为 1、21、41），读取在 pass 1、5、9…；tick 5 时钟 10 不严格大于到期 10 不读；带入计数 7（≡ 2 mod 5）重开后清开关不清计数，首次翻转在第 3 次读取（先绘制后读取会早一次）；关图 tick 仍执行读取（开关翻转、计数 19 带出、凭证为 null）；35 tick 按 1×35 与 5/3/2/4 分组的计数状态、凭证与 B 完全相同。
  - 凭证与生命周期：tick 1 无地图为 null；开图 tick 2 为 `{ opening: 1, serial: 1, tick: 2, geometry, pointer, 'confirmed' }`，tick 3 序号 2，关图 null，重开 opening 2；空批次与重复查询返回同一对象；`randomDraws` 为 0；`mapPictureGeometry` 与凭证几何相同；`player` 为 null 或 closed 时 B 全 0、凭证 null；map 分区未就绪由基础拒绝为 `invalid-input`；释放后凭证 null、`labels()` 为 `invalid-state`。
  - 内容：两张表各须 29 条 direct 记录；`costUnavailable` 须 1–5 个可打印 ASCII 字节且在 fonts/1 映射内（大写后），否则 `invalid-input`/`unmapped-character`。
- `pnpm check`（typecheck、lint、全部 Vitest 416 文件 11,309 项、生产构建；只有既有的 > 500 kB 块体积警告）：在 rubber-duck 与 simplify 修改之后复跑通过，退出码 0。

**Rubber-duck：** 一个只读审阅子代理（code-review 担任 rubber-duck）对照 spec、DC-09/DC-11、hud §4.9 与 06 证据逐项核对，绘制次序、裁剪、代价锚点与翻转、本地/确认分界、错开算法与 DC-09 节奏均无问题；提出 2 条并已采纳：E = 0 的项目标记原按 `c ≥ E` 在负 c 时会落入低档，改为恒取 0xA（DC-09“E = 0 时都取 0xA”、Δ-06“不落入低消耗颜色”），测试改为负 c 也为 0xA 并补目的地；`drawn()` 释放后改为返回 null 而非抛错，与文档一致，便于 24 轮询撤销。

**Simplify：** 只限本目录：标记校验改用 `drawText` 的同一查表（去掉手写大写与 `glyphsFor`），测试改用既有 `pixelsIn` 与 `syntheticImage`，去掉 `#zoom` 多余的接触点映射参数与只用一次的 `#require`；行为不变，复跑聚焦测试与 `pnpm check`。

**文档影响：** 写入范围外，交协调者：① `docs/engineering/modules/render.md` 记录本模块 API（归 24 的写入范围）；② `src/content/hud/hud-text-payload.ts` 中 `mapCornerLabel` 的注释仍写“主地图左上角”，应为放大窗口原点 + (4, 4)（06 已指出）；③ 建议在 hud §4.9 的放大窗口错开一条补充（已确认，代码，06 的私有反汇编）：10,000 次上限计的是每个 j 的访问（含自身与非成员）；第 8 步回原位即结束扫描，所以扫描中计数不会用尽，“恢复原位”只在原位本身越界时发生且不重算盒子；`0x4abe4` 在 w′ 或 h′ ≤ 0 时把空或反向范围交给 blitter（原版效果未确认，世界内像素等于边长时可达），项目不画像素、仍画方框。U 项无变化。STATUS 与 tasks.md 无需改动。
