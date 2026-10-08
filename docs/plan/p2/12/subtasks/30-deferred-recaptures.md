---
type: plan
status: active
phase: P2
task: "12"
subtask: "30"
updated: 2026-10-08
---

# 30 — 修复：延后的补拍与受影响项重判

**契约来源：** [spec](../spec.md) 的 S-08、[原版本地对照](../spec.md#原版本地对照)；AC-14、AC-15、AC-17、AC-21（跨接缝外观）、AC-22。由 [26](./26-final-alignment.md) 第一次运行新增（execute-goal §5），对应 [15](./15-user-captures.md#完成证据) 中用户决定“记录缺口，相应验收保持 blocked，稍后补拍重做”。
**依赖：** 27, 28, 29, 31。
**执行方式：** 需用户：用户在基准 DOSBox-X 中补拍；agent 按 15 的义务记录登记，并按技术决定 8 的修订完成视觉判定、按 16、17 的脚本完成逐像素与覆盖核对。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **补拍（用户）：** 按 15 记录的“无法取得”义务补拍，只拍仍缺的义务：
  - C-01 第二个方向（手性）；C-03 两种敌机各自的碎片；C-04 僚机与基地碎片；C-06 两种敌机与基地开火；C-07 各种导弹的侧面与后方、敌机导弹；C-08 轻、中、重损伤，闪烁的亮与灭，带条形图的页面；C-09 4×6 字库文字（HI；在 F2、目标显示屏与通讯菜单中查找）；C-10 逐单位的地图标记、跃迁目标与其他标记；
  - 27 指出某个 U-030 元素需要截图才能定论时，一并补拍；
  - [32](./32-b001-selection-box.md#完成证据) 的两个取证帧：左键点击后被框的单位同时显示在主地图与放大窗口中（方框在哪一处）；选取框只覆盖部分单位时的信息小窗（是否只列这些单位）；
  - 跨接缝的效果面与第 2 列表外壳的静态外形：若补拍仍不能给出严格基准，写明范围依据（例如只在受击帧以点阵出现），按判定分类记录，不当作通过。
- **登记：** 按 15 的 `obligations.ts`、`record.ts` 与接受规则登记，`--complete` 通过；截图只在 `local/`。
- **重判（agent）：** 在 29 之后的候选上重做受补拍影响的判定：21 中因缺少基准为“无法判定”的 V-1、V-2、V-3 与 V-4 项；17 中因 C-07 至 C-10 为“无法判定”的 23 个图像、`palette/missile` 与 `font/hud/4x6`；跨接缝外观。差异按 22 的方式区分呈现约定与责任任务。
- **回填：** 新的原版事实写入唯一权威位置（mesh、hud、textures、cockpit、unknowns），带置信度与候选适用性。同时按 32 的观察更正 hud 的两处措辞：选中方框的判定比较三个分量（目标点的 z 可来自最近的图标，见 executable），信息小窗的范围是放大窗口范围内的单位（`0x4c5ec`）。

## 不包含

- 已有判定且不受补拍影响的项；转换修复（回责任任务）；P3 运行时规则。

## 关键文件与契约

- 15 的义务记录与接受规则；16、17、21、22 的完成证据；[本地导入指南的原版本地对照](../../../../guides/local-import.md#原版本地对照p2-12)。

## 写入范围

- `local/research/p2-12/baselines/**`、`local/research/p2-12/session/**`、`local/research/p2-12/hud/**`、`local/research/p2-12/layouts/**`：补拍登记、判定明细与脚本输出（被忽略）。
- `docs/original/formats/mesh.md`、`docs/original/formats/hud.md`、`docs/original/formats/textures.md`、`docs/original/formats/cockpit.md`、`docs/original/unknowns.md`：新事实回填。
- `docs/original/formats/executable.md`：效果来源节中导弹与弹丸记录的对照结论（2026-10-08 放宽）。
- `docs/original/behavior/B-001-strategic-map.md`、`docs/original/behavior/B-005-campaign-rescue.md`：地图上的跃迁目标标记与救援动画的观察（2026-10-08 放宽）。

## 验收标准

- [ ] 15 记录的每个“无法取得”义务都有合格截图，或有用户同意的范围依据；`--complete` 通过。
- [ ] AC-14、AC-15、AC-17 的必需项没有因缺少基准而“无法判定”；跨接缝外观有判定或范围依据。
- [ ] 文档不含原版内容；链接与元数据有效，`pnpm --silent check:original` 通过。

## 验证方法

- 用户补拍；agent 登记、视觉判定与本地脚本；文档检查。

## 完成证据
