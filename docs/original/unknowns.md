---
type: register
status: active
phase: all
updated: 2026-09-30
---

# 待确认事项登记表

关于原版游戏、尚未完全确认的事项都登记在这里，由 `U-###` 唯一标识。P0 的退出条件要求每一项都“已确认”，或有明确的研究计划和负责阶段（总计划 §12）。

**状态**：未确认 → 进行中 → 高概率 → 已确认；不再影响项目的标为“不再需要”。结论写在本表或链接的文档中，不在其他地方重复。

## 数据与格式

| ID | 事项 | 状态 | 结论 / 线索 | 证据 | 负责阶段 |
|---|---|---|---|---|---|
| U-001 | `.NOB` 内部格式 | 进行中 | 封包目录与重定位表已确认；调色板、TEX 已能解码；BITM 部分可解码；MESH 顶点为 32 位浮点 | [imfat](./formats/imfat.md)、[textures](./formats/textures.md)、[mesh](./formats/mesh.md) | P0 |
| U-002 | 任务数据存于 `SCENARIO.NOB`，还是嵌在 EXE 中 | 高概率在 `SCENARIO.NOB` | 有 52 个 `SCEN` 条目，待解析验证 | [imfat](./formats/imfat.md) | P0 |
| U-003 | 任务总数与分支结构 | 未确认 | 可能为 52 个任务 | 同上 | P0 |
| U-004 | 音乐与音效编码 | 未确认 | `SND` 37 个、`SONG` 12 个、`MUSC` 5 个 | 同上 | P2（音效）/ P4（音乐） |
| U-005 | 原版存档格式 | 未确认 | 原版存档兼容是可选工作 | | P4 之后 |
| U-018 | 不带调色板的 BITM 所用调色板 | 未确认 | 21 个 BITM 用全局调色板显示颜色不对 | [textures](./formats/textures.md) | P2 |
| U-019 | 部分 BITM 显示为上下颠倒 | 未确认 | 可能按行倒序存储，也可能是贴图本身的朝向 | 同上 | P2 |
| U-020 | IMFAT 目录项 `flags` 字段含义 | 未确认 | 观察到 0、0x10、0x50 | [imfat](./formats/imfat.md) | P2 |

## 画面

| ID | 事项 | 状态 | 结论 / 线索 | 证据 | 负责阶段 |
|---|---|---|---|---|---|
| U-006 | 内部分辨率与显示模式 | 高概率有两种 | `SRANGER.CFG` 中有 `GAMEHIRES=TRUE`、`CINEMATIC=HIGHRES`；有 640×316 的全屏 BITM | 配置文件、[textures](./formats/textures.md) | P0 |
| U-007 | 战略地图的结构与交互 | 未确认 | | 待试玩 | P0 |

## 玩法与数值

| ID | 事项 | 状态 | 结论 / 线索 | 证据 | 负责阶段 |
|---|---|---|---|---|---|
| U-008 | 精确运动模型 | 未确认 | | 待行为实验 | P0 / P3 |
| U-009 | 是否使用定点数与三角函数查表 | 未确认 | 网格顶点以 32 位浮点存储，原版至少部分使用浮点 | [mesh](./formats/mesh.md) | P0 / P3 |
| U-010 | 起降、Warp 与过场动画的衔接 | 未确认 | 光盘有 `LAUNCH`、`LANDING`、`FLYTO`、`FLYFROM` 等 Smacker 视频 | [manifest](./manifest.md) | P0 |

## 输入

| ID | 事项 | 状态 | 结论 / 线索 | 证据 | 负责阶段 |
|---|---|---|---|---|---|
| U-011 | 完整原版键位（含飞行方向与横滚） | 部分确认 | README 中的键位已列入键位表 | [key-map](./input/key-map.md) | P0 |
| U-012 | 是否支持鼠标飞行 | 未确认 | | 待试玩 | P0 |

## 存档

| ID | 事项 | 状态 | 结论 / 线索 | 证据 | 负责阶段 |
|---|---|---|---|---|---|
| U-013 | 存档时机与存档槽数量 | 未确认 | | 待试玩 | P0 |
| U-014 | 战役存档内容与高分榜 | 未确认 | 高分榜文件为 `SRHISCOR.RAW`（1176 字节） | [manifest](./manifest.md) | P0 |

## 环境与其他

| ID | 事项 | 状态 | 结论 / 线索 | 证据 | 负责阶段 |
|---|---|---|---|---|---|
| U-015 | 是否有拷贝保护（光盘检测、手册问答） | 未确认 | | 待试玩 | P0 |
| U-016 | 参考音乐设备 | 高概率为 OPL3 | 原安装的 Miles 配置为 `SBPRO2.MDI` | [baseline-environment](../guides/baseline-environment.md) | P0 |
| U-017 | 是否存在官方补丁 | 未确认 | 安装版 EXE 与光盘逐字节一致 | [manifest](./manifest.md) | P0 |
| U-021 | 基准 DOSBox-X cycles 值 | 进行中 | 初始值 `fixed 40000`，待根据流畅度校准后冻结 | [baseline-environment](../guides/baseline-environment.md) | P0 |
