---
type: plan
status: active
phase: P2
task: "07"
subtask: "12"
updated: 2026-10-05
---

# 12 — 生产驾驶舱、HUD 与地图内容

**契约来源：** [spec](../spec.md) 的 S-06，S-08 的份额；[生产 Asset 与来源](../spec.md#生产-asset-与来源)、[限值与预算](../spec.md#限值与预算)的生产份额；技术决定 5、6；AC-06 的“生产声明含已知使用的各族”、AC-07 的份额常量。
**依赖：** 04、06、08、09、18。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **生产声明与映射（扩展 [production-graphics.ts](../../../../../src/original-data/conversion/production-graphics.ts)）：** 按 08、09 写入 `docs/original/` 的结论，声明并映射本任务的 Asset：
  - `layout/cockpit/front` 与 `image/cockpit/front/element-<i>`（R1 选定的 CCKD `groups/0`）；
  - `layout/map/frame` 与 `image/map/frame/element-<i>`（CCKD 10103 `groups/2`），绑定 R2 的地图调色板 `palette/map/screen`，后者映射为 CCKD 10103 的 `groups/2/palette`（08 的结论，18 实现该子资源）；
  - `image/hud/status-display/background-<i>`（R4 选定 MFDD 的 `lists/0`）；
  - 09 判定入选的其余族：状态 MFD 叠加图、仪表条、雷达点、11401 的各区间，ID 用完整来源列表内的序号。
  - 每个映射的 `confidence` 只能为 `confirmed` 或 `likely`，`unknowns` 与 `evidence` 链接到 `docs/original/` 的相应条目；非默认的转换选择（颜色键、地图调色板绑定）由 `evidence` 支撑。
  - 元素数由声明断言，与本地结构核对一致。
- **份额：** 以常量导出本任务的生产份额（assets 96、dependencyEdges 192、imagePixels 524,288、paletteEntries 1,024、glyphs 0、payloadBytes 786,432，其余 0），图形步骤的份额变为 P2-05 与本任务份额之和；作业的限值组合不变（读取限值 + 图形份额 + 逻辑份额）。
- **测试支持：** 扩展 [production-graphics.test-support.ts](../../../../../src/original-data/conversion/production-graphics.test-support.ts)，按生产映射的结构在合成封包中放置合成的 CCKD 分组、MFDD 与 TABL 条目；同步 [synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 的 `GRAPHICS_PAYLOAD_BYTES`、`PRODUCTION_CONVERSION_USAGE` 等期望。
- **测试：**
  - 生产声明含已知使用的各族（前视布局与元素、地图边框布局与元素、地图调色板、状态 MFD 背景）以及 09 判定入选的族，且只含这些；没有 `unconfirmed` 映射；
  - 份额常量与 spec 表一致；
  - 生产图形步骤在合成的生产结构光盘上运行，`cockpit-hud-map` 分区加上合成身份后经 `validateGroup` 为 `group-complete`，外部要求为空；
  - 若 13 已完成：作业路径的既有测试改为期望生产 `cockpit-hud-map` 组为 `group-complete`。
- **文档：** 源码结构记录生产 Asset 列表与份额；[cockpit](../../../../original/formats/cockpit.md) 的“有界投影”一节注明已由生产映射取代的部分。

## 不包含

- 研究结论本身：归 08、09（若研究 blocked，本子任务随之 blocked）。
- 组装、包身份与 `graphics` 组件：归 [13](./13-group-assembly.md)。
- 本地基准运行：归 [15](./15-local-composite-check.md)、[16](./16-local-base-check.md)。

## 关键文件与契约

- **修改：** [production-graphics.ts](../../../../../src/original-data/conversion/production-graphics.ts) 及其测试；[production-graphics.test-support.ts](../../../../../src/original-data/conversion/production-graphics.test-support.ts)；[synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts)；受影响的作业与管线测试。
- **事实依据：** 08、09 更新后的 [cockpit](../../../../original/formats/cockpit.md) 与 [hud](../../../../original/formats/hud.md)。

## 验收标准

- [ ] 生产声明恰好包含已知使用的各族与 09 判定入选的族；映射置信度、U 项与证据链接与原版文档一致；没有 `unconfirmed` 映射。
- [ ] AC-07 的份额常量与 spec 一致；图形步骤份额为两者之和。
- [ ] 生产图形步骤在合成生产结构光盘上的 `cockpit-hud-map` 分区经 `validateGroup` 为 `group-complete`。
- [ ] `pnpm typecheck`、`pnpm lint` 与 `pnpm test -- src/original-data/conversion/ src/workers/ src/app/import/` 通过；源码结构已更新。

## 验证方法

- Node 测试，只用代码生成的数据；生产常量与原版文档逐项对照审阅。
- 不涉及浏览器；真实 Worker 归 14。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
