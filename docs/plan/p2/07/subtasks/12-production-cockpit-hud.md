---
type: plan
status: active
phase: P2
task: "07"
subtask: "12"
updated: 2026-10-06
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
  - 09 判定入选的其余族（spec 的 P2-07/09 执行期修订）：状态 MFD 叠加图、左显示屏页面背景 BITM 10467、仪表条 10479、地图单位标记 10461、11401 的全部记录（`image/map/zoom-icon/<i>`），ID 用完整来源列表内的序号；颜色键 0 与地图调色板绑定按 spec 生产 Asset 表。
  - 每个映射的 `confidence` 只能为 `confirmed` 或 `likely`，`unknowns` 与 `evidence` 链接到 `docs/original/` 的相应条目；非默认的转换选择（颜色键、地图调色板绑定）由 `evidence` 支撑。
  - 元素数由声明断言，与本地结构核对一致。
- **份额：** 以常量导出本任务的生产份额（assets 96、dependencyEdges 192、imagePixels 524,288、paletteEntries 1,024、glyphs 0、payloadBytes 786,432，其余 0），图形步骤的份额变为 P2-05 与本任务份额之和；作业的限值组合不变（读取限值 + 图形份额 + 逻辑份额）。
- **测试支持：** 扩展 [production-graphics.test-support.ts](../../../../../src/original-data/conversion/production-graphics.test-support.ts)，按生产映射的结构在合成封包中放置合成的 CCKD 分组、MFDD、TABL 与 BITM 条目；同步 [synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 的 `GRAPHICS_PAYLOAD_BYTES`、`PRODUCTION_CONVERSION_USAGE` 等期望。
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

- [x] 生产声明恰好包含已知使用的各族与 09 判定入选的族；映射置信度、U 项与证据链接与原版文档一致；没有 `unconfirmed` 映射。
- [x] AC-07 的份额常量与 spec 一致；图形步骤份额为两者之和。
- [x] 生产图形步骤在合成生产结构光盘上的 `cockpit-hud-map` 分区经 `validateGroup` 为 `group-complete`。
- [x] `pnpm typecheck`、`pnpm lint` 与 `pnpm test -- src/original-data/conversion/ src/workers/ src/app/import/` 通过；源码结构已更新。

## 验证方法

- Node 测试，只用代码生成的数据；生产常量与原版文档逐项对照审阅。
- 不涉及浏览器；真实 Worker 归 14。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：**
  - [production-graphics.ts](../../../../../src/original-data/conversion/production-graphics.ts) 按 spec 的生产 Asset 表声明并映射 86 个 P2-07 Asset（2 个布局、83 个图像、1 个调色板），条目均为 `MAIN/SR.NOB`：
    - 前视布局与 4 个元素：CCKD `groups/0`，高概率，U-029；
    - 地图边框布局与 4 个元素，以及 `palette/map/screen`（`groups/2/palette`）：已确认，U-029；
    - 状态显示背景 3 个（不透明）与叠加图 9 个（颜色键 0）：MFDD 10473；
    - 页面背景：BITM 10467 整条目；
    - 仪表条：TABL 10479 的 4 个记录；
    - 地图单位标记与放大窗口图标：TABL 10461、11401 各 29 个记录，地图调色板、颜色键 0。

    HUD 与地图各族为已确认，U-030；证据链接到 hud 与 cockpit 的相应小节。P2-05 与 P2-06 的声明不变。
  - 导出 `PRODUCTION_COCKPIT_HUD_MAP_SHARE`（96、192、524,288、1,024、0、786,432），`PRODUCTION_GRAPHICS_SHARE` 为 P2-05、P2-06 切片贴图与本任务三者之和。
- **测试：**
  - [production-graphics.test.ts](../../../../../src/original-data/conversion/production-graphics.test.ts) 以独立写出的期望表断言：
    - 声明恰为 P2-05、P2-06 与 86 个 P2-07 Asset，ID、kind、角色、调色板、透明与子资源逐项一致；
    - P2-07 映射没有 `unconfirmed`，置信度、U 项与证据逐项一致；
    - 份额常量等于 spec 表，图形份额为三者之和；
    - 合成生产结构光盘上的 `cockpit-hud-map` 分区经 `validateGroup` 为 `group-complete`、外部要求为空，且 CCKD 条目只读一次。
  - 合成生产光盘（[production-graphics.test-support.ts](../../../../../src/original-data/conversion/production-graphics.test-support.ts)）在生产条目 ID 处放置以下合成数据，条目 ID 从生产映射查得，不硬编码：
    - CCKD（3 个字库，slot 0 与 2 各 4 个元素，其中一个为精灵，slot 2 带分组调色板）；
    - MFDD（3 + 9 个记录）、BITM 与三个 TABL 列表。
  - 13 留下的中间断言（`incomplete`、`role-cardinality`）在作业、管线与 e2e 测试中改为 `group-complete`，`takeGroups()` 也移交 `cockpit-hud-map`。
- **本地基准（只作核对，正式证据归 16）：** 经产品入口打开本地光盘，直接运行生产图形步骤：
  - `cockpit-hud-map` 有 90 个 Asset（86 个来自本任务，4 个来自 P2-05），全部 `verified`；
  - 装配并写入身份后，`validateGroup` 为 `group-complete`，没有诊断；
  - 本任务的 payload 为 467,707 字节、像素 441,785，都在份额内。

  脚本 `local/research/p2-07/production-step.ts`。
- **检查：** `pnpm check` 通过（134 个文件、4044 个测试与构建）；`OSR_E2E_DEV_PORT=4273 OSR_E2E_PREVIEW_PORT=4274 pnpm test:e2e e2e/import-worker.spec.ts --project=development` 15/15 通过。
- **rubber-duck：** 没有阻塞或非阻塞问题。
- **simplify：** 没有修改。跳过的建议：
  - 测试改用生产或夹具辅助函数生成期望（期望表须独立于被测常量）；
  - 不导出 P2-07 份额（AC-07 要求以常量导出）；
  - 合成夹具做模块级缓存（只影响测试，构建开销很小）；
  - 把 P2-07 表移到独立模块（P2-06 拆出贴图表，是因为模型转换器要按编号引用它；本表没有这样的消费者，拆分还需导出共用的 `mapping` 辅助函数）。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)记录生产 Asset 清单、映射、份额与合计；[cockpit](../../../../original/formats/cockpit.md#bounded-canonical-graphics-projection) 的有界投影一节注明已由生产映射取代的部分。STATUS 不变。
