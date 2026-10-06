---
type: plan
status: active
phase: P2
task: "09"
subtask: "07"
updated: 2026-10-05
---

# 07 — 条件交付：非封包参数 locator（研究后不适用）

**契约来源：** [spec](../spec.md) 的 S-12、AC-12；[空间框架的研究结论](../spec.md#空间框架的研究结论)。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **记录不适用依据：** 修订后的 spec 记录 S-02 为结论 2，地图框架来自所选 SCEN，S-12 不适用。本子任务核对 02 写入 `docs/original/` 的结论与 spec 一致，在证据中记录结论、文档位置与不适用依据，不修改代码，然后完成。
- **若 02 的记录与结论 2 不符：** 本子任务改为 blocked，按研究门槛修订 spec。

## 不包含

- 非封包 locator 的实现；封包条目 locator 的任何行为变化；地图框架的规范化（09）。

## 关键文件与契约

- **只读核对：** 02 修改的 `docs/original/` 文档；[source-mapping.ts](../../../../../src/original-data/source-mapping.ts) 不修改。

## 验收标准

- [x] AC-12：证据记录 02 的结论 2、文档位置与不适用依据；`OriginalAssetLocator` 的形状与校验没有改动（`git diff` 不含 source-mapping.ts）。

## 验证方法

- 文档核对与 diff 检查；完成前按 execute-goal 流程做 rubber-duck 审查。没有实现代码，不需要 simplify。
- 不适用 browser-testing。

## 完成证据

- **不适用依据：** 02 已把 S-02 的结论 2（任务内静态参数）写入 `docs/original/`：
  - [executable 地图投影](../../../../original/formats/executable.md#strategic-map-projection)与[世界网格](../../../../original/formats/executable.md#mission-placement-scheduling-and-world-grid)；
  - [B-001 地图框架与坐标轴](../../../../original/behavior/B-001-strategic-map.md#地图框架与坐标轴高概率p2-09)；
  - [U-032](../../../../original/unknowns.md#画面)。

  按这些记录，地图框架来自所选 SCEN 头部的扇区数（0x00/0x04）与参考比例（0x08），以原点为中心；在目的地选取路径上没有 Warp 专用的静态数据。必需的空间参数都在已覆盖的 `SCENARIO.NOB` 条目中，不存在只在主程序等非封包文件里的参数，因此 S-12 不适用，与 spec [空间框架的研究结论](../spec.md#空间框架的研究结论)与技术决定 14 一致。
- **代码无改动：** `git log f063eed..HEAD -- src/original-data/source-mapping.ts` 没有提交，本子任务也没有改动它，`OriginalAssetLocator` 的形状与校验不变；已有 locator 测试在 06 的 `pnpm check` 中全部通过（101 个测试文件、3082 个测试）。
- **rubber-duck：** 无问题。审阅确认 `mapFrame` 的半边长只由 SCEN 0x00/0x04/0x08 推导，中心与坐标轴是格式知识；主程序中的地图像素换算与运行时比例不属于 `StrategicMapFrame`。`source-mapping.ts` 与 f063eed 逐字节相同，locator 相关的 2 个测试文件、53 个测试通过。
- **文档影响：** 只更新本证据与 goal tracker；源码结构、工程约定与工具指南无需更新，因为没有新模块或命令。
