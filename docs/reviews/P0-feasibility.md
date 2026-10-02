---
type: review
status: accepted
phase: P0
updated: 2026-10-01
related: [U-001, U-002, U-003, U-004, U-022, U-027, U-028, U-029, U-030]
---

# P0 可行性评审

> 2026-10-01 由项目负责人确认结论为“通过”，本记录已冻结。之后的变化写进新的评审记录或 ADR。

## 1. 结论

**通过。** 原版数据可以在不运行原版程序的前提下，被我们自己的解析器完整读取；P2 玩法切片所需的主要资源类型（模型、贴图、驾驶舱、HUD 图形与字体、音效）已经解码并经过全量验证；任务是数据驱动的，加载与生成流程已在 EXE 中定位。剩余未知项都属于“字段含义”层面，不构成路线风险，按负责阶段继续研究。

建议：P1 可以开始；P0 中不依赖可行性的项目（行为规范、cycles 校准、测试设备、键位实机验证）与 P1 并行收尾，全部完成后再写 P0 阶段退出评审。

## 2. 可行性条件逐项核对

总计划 §12 规定的可行性评审条件：

| 条件 | 结果 | 证据 |
|---|---|---|
| 能列出 `.NOB` 封包条目 | 通过。9 个封包的目录、类型标签与重定位表在全部条目上验证通过 | [imfat](../original/formats/imfat.md)、`tools/nob-list.ts` |
| 至少还原一个舰船模型 | 通过。486 个 MESH、19 个 MODL 全部解析，交叉引用全部有效；渲染出带贴图的舰船与基地，其中友方 Xpon 的几何形状与原版截图吻合 | [mesh](../original/formats/mesh.md)、`tools/nob-check.ts` |
| 至少还原一个任务的结构 | 通过。52 个 `SCEN` 的头部与 7 个段一致；已在 EXE 中定位任务构建、坐标缩放与对象生成代码，确认了比例尺、各段元素大小与空间字段，132 字节记录的对象种类、生成时间、位置、AI 参数默认值等字段为高概率；战役表 `SCCT` 的 3 组很可能是 3 个难度版本，5 条记录是可选僚机 | [scenario](../original/formats/scenario.md)、[executable](../original/formats/executable.md) §4、U-022 |
| 确认任务数据是否嵌在 EXE 中 | 通过。任务内容全部在 `SCENARIO.NOB`；EXE 中没有任务文字 | [scenario](../original/formats/scenario.md) §1、U-002 |

## 3. P2 所需资源类型的现状

| 资源 | 状态 | 证据 |
|---|---|---|
| 光盘镜像（CCD/IMG）读取 | 已在研究脚本中验证（原始扇区 + ISO9660） | [manifest](../original/manifest.md) |
| 贴图 TEX、全局调色板 | 已确认，全部解析 | [textures](../original/formats/textures.md) |
| 位图 BITM | 已确认，28/28 解析（含 1 个精灵 RLE 压缩图像）；22 个的调色板来源待查 | [textures](../original/formats/textures.md)、U-018 |
| 网格与模型 | 已确认，全部解析 | [mesh](../original/formats/mesh.md) |
| 核心音效 SND | 已确认为原始 PCM，全部解析 | [audio](../original/formats/audio.md) |
| 任务数据 | 结构与加载流程已确认；主要字段为高概率；决定机型的字段待定位 | [scenario](../original/formats/scenario.md) |
| 驾驶舱 CCKD | 元素结构与精灵 RLE 编码已确认；HI 前视驾驶舱按记录坐标拼合后，布局与颜色和原版 F1 截图一致；战略地图边框布局一致，但调色板来源待查 | [cockpit](../original/formats/cockpit.md)、U-029 |
| MFD 图像 MFDD | 已确认，3/3 解析：飞船状态显示的背景与子系统损伤叠加图，颜色正确 | [cockpit](../original/formats/cockpit.md) |
| HUD 图形、字体 | 已解码：每套驾驶舱自带 3 个点阵字体（两个 8×8、一个 4×6），菜单另有 8×8 字体；地图与放大窗口的单位图标、雷达光点、仪表条在 TABL 中，均可解码；部分 TABL 用途待查 | [hud](../original/formats/hud.md)、U-030 |
| 机型与模型的对应、贴图颜色 | 对应关系来自 M2ID；贴图调色板为 BGR 顺序并映射到全局调色板，按此渲染的玩家座机与 Xpon 在形状和颜色上都与截图吻合 | [hud](../original/formats/hud.md) §3、[textures](../original/formats/textures.md) §3 |

## 4. 遗留事项

| ID | 事项 | 负责阶段 | 风险 |
|---|---|---|---|
| U-022 | 任务记录中决定机型、阵营的字段，以及其余未确认字段；可从对象生成后的代码继续追踪，或用试玩对照 | P2 | 低：加载与生成流程已定位，剩余字段可逐个追踪 |
| U-028 | 光照如何选择明暗；其余 M2ID 槽位对应的机型 | P2/P3 | 低：颜色来源已确认 |
| U-027 | MODL 第 1、2 部件列表与音效槽含义 | P2 | 低 |
| U-018、U-019 | 部分 BITM 的调色板与朝向 | P2 | 低 |
| U-029 | CCKD 分组表、地图边框调色板、各组对应的视角 | P2 | 低：图像已能解码，只差布局细节 |
| U-004 | 音乐格式（SONG、MUSC） | P4 | 低：属于音乐 spike |
| U-030 | 4×6 字体的字符映射、部分 TABL 的用途 | P2 | 低 |

## 5. 对后续阶段的影响

- 不需要改变路线或缩小范围，不需要新增 ADR。
- 解析器已有 TypeScript 实现（`src/original-data/`），P1 搭建项目时直接纳入，并补上单元测试（使用代码生成的合成样本）。
- P2 应优先处理 U-022 中切片任务用到的字段（决定机型的字段），以及 U-029 的驾驶舱布局细节。
