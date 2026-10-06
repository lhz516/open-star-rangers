---
type: plan
status: active
phase: P2
task: "07"
subtask: "15"
updated: 2026-10-06
---

# 15 — 本地合成画面比较与重叠检查（R5）

**契约来源：** [spec](../spec.md) 的 S-05 中 R5、S-10 的本地截图比较；[研究与入选门槛](../spec.md#研究与入选门槛)（像素比较、R5 的结论要求）；AC-12。
**依赖：** 12。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **生产画面：** 在开发者机器上，经产品入口打开本地基准来源、运行生产图形步骤，得到 `layout/cockpit/front` 与 `layout/map/frame` 及其图像与调色板，用 02 的合成函数得到两张 640×480 画面。
- **R5 重叠：** 对两个布局，报告元素之间重叠的不透明像素数。为 0 时记录绘制顺序不影响结果；不为 0 时，截图在重叠像素上必须与存储顺序一致，否则本子任务 blocked。
- **截图比较：** 两张画面分别与本地 F1 飞行截图与地图截图逐像素比较（不缩放、无容差），记录截图文件名、比较像素数、一致数与不一致像素的分类（例如运行时叠画的文字、仪表或高亮按钮）；没有分类的不一致不得忽略。
- **记录：** 结论写入 [cockpit](../../../../original/formats/cockpit.md)；本项是研究证据，最终保真判定归 P2-12。
- **方法：** 脚本与输出在 `local/research/p2-07/`；证据只记命令、文件名、计数与判定。

## 不包含

- 研究前视来源与地图调色板：归 [08](./08-cockpit-palette-research.md)。
- 生产路径的确定性与作业路径：归 [16](./16-local-base-check.md)。

## 关键文件与契约

- **修改：** [cockpit.md](../../../../original/formats/cockpit.md)。
- **计划新增（不提交）：** `local/research/p2-07/` 下的比较脚本与输出。
- **本地数据：** `local/StarRang/cd/`、`local/StarRang/captures/`。

## 验收标准

- [x] AC-12：两个布局的重叠不透明像素数已报告；不为 0 时截图与存储顺序一致，或本子任务 blocked。
- [x] AC-12：两张生产合成画面与本地截图的比较计数与不一致分类已记录。
- [x] 文档中没有像素、颜色值或原版内容。

## 验证方法

- 本地 Node 脚本；只经生产路径（产品入口、生产图形步骤、合成函数）得到画面，不另写解析或合成。
- 不涉及浏览器。

## 完成证据

- **方法：** `node --preserve-symlinks --preserve-symlinks-main local/research/p2-07/composite-check.ts`。只经生产路径：产品入口打开本地光盘，生产图形步骤，`readLayoutPayload`、`readImagePayload` 与 `readPalettePayload`，`composeLayout`；重叠由每个元素经 `expandImage` 的不透明像素计数。只比较画面中被覆盖的像素，不缩放、无容差。
- **R5：**
  - 前视布局的 4 个元素没有重叠的不透明像素；
  - 地图边框的 4 个元素在 161 个不透明像素上重叠，每处各元素的颜色都相同，所以任何绘制顺序得到同一画面；4 张地图截图在这些像素上与存储顺序的合成一致。
- **AC-12 比较：**
  - 前视与 `srangers_002.png`：比较 132,505 个像素，一致 111,440 个。不一致的 21,065 个全部落在该 slot 10 个仪表矩形中的 8 个之内，即每帧在元素之后绘制的仪表（cockpit R1）。
  - 地图边框与 `srangers_059.png`、`srangers_000.png`、`srangers_001.png`、`srangers_004.png`：各比较 124,701 个像素，全部一致。
  - 结果与 08 的研究合成相同。
- **记录：** [cockpit 的生产合成一节](../../../../original/formats/cockpit.md#production-composites-and-element-overlaps-r5)，只有文件名、计数与判定。最终保真判定归 P2-12。
- **rubber-duck：** 没有阻塞或非阻塞问题；置信度限定在这两个布局上，不一致像素都已归类。
- **文档影响：** 只更新 cockpit；没有代码改动，源码结构与指南不受影响，STATUS 不变。
