---
type: plan
status: active
phase: P2
task: "12"
subtask: "19"
updated: 2026-10-07
---

# 19 — 地图框架核实（M-3，U-032）

**契约来源：** [spec](../spec.md) 的 S-10、[原版本地对照](../spec.md#原版本地对照)的 M-3、技术决定 13；AC-20。
**依赖：** 12。
**执行方式：** 需用户：在基准 DOSBox-X 中进入所选任务的战略地图，按 agent 提示暂停或继续；必要时按清单截取已知世界位置的标记画面。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **首选，运行时读数：** agent 准备并运行本地调试器脚本（计划放在 `local/research/p2-12/map-frame/`，参照 `local/research/p2-01/runtime-vrt-map.py`）：
  - 在所选任务的地图状态中重新核验本进程的 CODE/DATA 对应、可读页与系数类型；历史地址不复用（[executable](../../../../original/formats/executable.md#bounded-runtime-codedata-object-correlation)）。
  - 读取世界矩形、地图矩形与两轴的世界/像素系数（[executable 地图投影](../../../../original/formats/executable.md#strategic-map-projection)中的位置）。
  - 明确 `scen-reference` 与 `scen-runtime` 的比例；验证两轴方向、尺度、中心与边界，按实际存储精度与候选的 `mapFrame` 比较。
- **备选，标记对照：** 用实际世界位置已知的对象（不是随机生成矩形）在地图截图中的标记，约束两轴与平移；±1 像素只在已证明取整与锚点误差界时使用。
- **结论：** 写入 [executable](../../../../original/formats/executable.md#strategic-map-projection)、[B-001](../../../../original/behavior/B-001-strategic-map.md) 与 [unknowns](../../../../original/unknowns.md) 的 U-032（状态、置信度、负责阶段），不复制字段值。两法都不能判定时本项为 blocked，记录尝试、原因与恢复条件，U-032 保持高概率。
- 只读分析：不修改原版文件或配置，结束时回收自有进程；调试器输出只在 `local/`。

## 不包含

- 地图交互、迷雾与 Warp 规则（P3）；任务字段对照（18）。

## 关键文件与契约

- [logic-content.ts](../../../../../src/content/logic/logic-content.ts) 的 `StrategicMapFrame`、`MissionCoordinates`；[B-001 地图框架](../../../../original/behavior/B-001-strategic-map.md#地图框架与坐标轴高概率p2-09)；[基准环境](../../../../guides/baseline-environment.md)。

## 写入范围

- `local/research/p2-12/map-frame/**`：调试器脚本与输出（被忽略）。
- `docs/original/formats/executable.md`：地图投影结论。
- `docs/original/behavior/B-001-strategic-map.md`：地图框架结论。
- `docs/original/unknowns.md`：U-032 状态。

## 验收标准

- [ ] AC-20：受校验的运行时读数，或足以约束两轴与中心的标记证据，支持方向、尺度、中心与范围；单位与精度明确。未取证成功时为 blocked 并记录恢复条件，不以尝试通过。
- [ ] 结论与置信度写入 executable、B-001 与 U-032；文档只有地址、结构、计数与判定，没有字段值或反编译输出。
- [ ] 原版文件与配置未改动；自有进程已回收。

## 验证方法

- 本地调试器脚本（用户配合）或截图测量；文档 diff 审阅；`pnpm --silent check:original`。

## 完成证据
