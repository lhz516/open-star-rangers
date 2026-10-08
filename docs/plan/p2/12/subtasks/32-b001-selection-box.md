---
type: plan
status: active
phase: P2
task: "12"
subtask: "32"
updated: 2026-10-08
---

# 32 — 修复：B-001 选中方框与 EXE 追踪的一致性

**契约来源：** [spec](../spec.md) 的 S-12；AC-22 的回填部分；[AGENTS.md](../../../../../AGENTS.md) 的“一个事实一处”与置信度要求。由 [27](./27-u030-source-tracing.md#完成证据) 的范围外观察新增（execute-goal §5）。
**依赖：** —。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [B-001](../../../../original/behavior/B-001-strategic-map.md) 的“选中标记”一条把用户观察记为“在主地图中左键点击后，被选中的单位外出现方框”（已确认）。27 由 EXE 确认主地图的单位标记不画方框，方框由放大窗口的图标框绘制（[hud 的 U-030 节](../../../../original/formats/hud.md#unidentified-elements-and-the-u-030-impact)）。两处记录矛盾。
- 核对 27 的追踪与 15、19 的用户观察记录后，在 B-001 中更正：分开记录用户观察（看到了什么、在哪里）与 EXE 的绘制归属，分别标注置信度；冲突未解决的部分标为未确认并写明可取证的方式。放大窗口上方小窗口一条同样链接 hud 的结论。
- 只写结构与判定，不写颜色名称或颜色值；顺带去掉该条中的颜色名称。

## 不包含

- 战略地图的选择规则实现（P3）；其他 B 文档与 `docs/original` 中本 goal 之前已有的颜色名称。

## 关键文件与契约

- 27 的完成证据；[hud](../../../../original/formats/hud.md)；[executable 的战略地图投影](../../../../original/formats/executable.md#strategic-map-projection)。

## 写入范围

- `docs/original/behavior/B-001-strategic-map.md`：选中标记与信息小窗两条。

## 验收标准

- [ ] B-001 与 hud 对选中方框的记录不再矛盾；用户观察与 EXE 归属分别带置信度与证据。
- [ ] 文档不含原版内容或颜色名称；链接与元数据有效，`pnpm --silent check:original` 通过。

## 验证方法

- 文档 diff 审阅、链接与元数据检查、`pnpm --silent check:original`。

## 完成证据
