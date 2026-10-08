---
type: plan
status: active
phase: P2
task: "12"
subtask: "24"
updated: 2026-10-08
---

# 24 — 判定回填原版文档

**契约来源：** [spec](../spec.md) 的 S-12、[判定分类](../spec.md#判定分类)；AC-22 的回填部分（判定汇总表在 26）。
**依赖：** 16, 17, 18, 19, 21, 22, 23。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 把 16–23 得到的新事实写入唯一的权威位置，带置信度与适用的候选，不复制原版内容，格式文档用英文：
  - [mesh](../../../../original/formats/mesh.md) §3：全部切片模型（含 M2ID 槽位 8 的敌机与碎片）的对照结论，以及绕序与手性的已知程度；
  - [cockpit](../../../../original/formats/cockpit.md)：最终候选上的布局与透明比较；
  - [hud](../../../../original/formats/hud.md)：二维覆盖结论，以及 U-030 未识别元素是否可能缺少切片必需图形的影响判断（不仅因未找到来源就归 P3）；
  - [audio](../../../../original/formats/audio.md)：查看器播放路径与原版的对照；
  - [scenario](../../../../original/formats/scenario.md)：独立字段对照与 Core 载入核对；
  - [textures](../../../../original/formats/textures.md)：切片 BITM 的朝向（U-019）等有新证据的项。
- 更新 [unknowns](../../../../original/unknowns.md) 中受影响 U 项（U-019、U-027、U-028、U-029、U-030 等）的状态、证据与负责阶段；U-032 已由 19 更新，本项只核对一致。
- 文档只记地址、结构、计数、文件名与判定；更新各文档的 `updated:`。

## 不包含

- 判定汇总表与阶段影响结论（26；阶段退出判定归 P2-13）；地图框架（19 已写）。

## 关键文件与契约

- 16、17、18、21、22、23 的完成证据；[AGENTS.md](../../../../../AGENTS.md) 的“一个事实一处”与置信度要求。

## 写入范围

- `docs/original/formats/mesh.md`：模型对照结论。
- `docs/original/formats/cockpit.md`：布局对照结论。
- `docs/original/formats/hud.md`：二维覆盖与 U-030 影响。
- `docs/original/formats/audio.md`：播放路径对照。
- `docs/original/formats/scenario.md`：字段与载入对照。
- `docs/original/formats/textures.md`：朝向等新证据。
- `docs/original/unknowns.md`：U 项状态。

## 验收标准

- [x] AC-22（回填）：新事实与 U-030 影响判断写入唯一权威文档，带置信度与候选适用性；受影响 U 项状态已更新。
- [x] 文档不含原版字节、像素值、颜色值、文字或反编译输出；`pnpm --silent check:original` 通过。
- [x] `updated:`、相对链接与锚点有效。

## 验证方法

- 文档 diff 审阅、链接与元数据检查、`pnpm --silent check:original`。

## 完成证据

- **输入核对：** 逐项对照 [16](./16-layout-comparison.md#完成证据)、[17](./17-hud-texture-coverage.md#完成证据)、[18](./18-mission-comparison.md#完成证据)、[19](./19-map-frame.md#完成证据)、[21](./21-user-comparison-session.md#完成证据)、[22](./22-presentation-verdicts.md#完成证据)、[23](./23-user-recheck.md#完成证据) 的完成证据与协调者转来的建议（只作输入）。关键计数在被忽略的本地输出中复核一致：`local/research/p2-12/` 下 `layouts/layouts.log`、`layouts.json`，`presentation/all-meshes.log`、`layout.log`，`hud/coverage.json`、`coverage.md`，`session/record.md`（V-1 在 22 之后的状态）。BITM 条目的大小与重定位数取自 `node tools/nob-list.ts local/StarRang/SRANGERS/MAIN/SR.NOB --entries`。
- **回填位置（事实只在这些位置，本文件不重复）：**
  - mesh：[§1 贴图坐标块的顺序](../../../../original/formats/mesh.md#texture-coordinate-block-order-likely-p2-12)（更正，高概率）、绕序节、§2 第 2 列表与标志、[§3 P2-12 对照](../../../../original/formats/mesh.md#p2-12-viewer-comparison-v-1)（含槽位 8 与碎片）、§4。
  - [cockpit R5 的 P2-12 节](../../../../original/formats/cockpit.md#all-qualifying-captures-p2-12)。
  - hud：[P2-12 覆盖核对](../../../../original/formats/hud.md#slice-coverage-check-and-u-030-impact-p2-12)、[U-030 影响判断](../../../../original/formats/hud.md#unidentified-elements-and-the-u-030-impact)、[R8](../../../../original/formats/hud.md#zoom-window-icons-by-craft-type-r8) 的观察列；R3 中“未识别元素交 P3”与仪表条“只画顶部”两处改为指向新节。
  - [audio 的播放路径节](../../../../original/formats/audio.md#viewer-playback-path-p2-12)：各角色与原版的 P2-12 直接对照记为未记录，不冒称完成。
  - [scenario 的 P2-12 节](../../../../original/formats/scenario.md#independent-field-comparison-and-core-load-p2-12)：无新格式事实。
  - textures：[§1](../../../../original/formats/textures.md#1-data-global-palette-confirmed) 的飞行调色板核对、[§4](../../../../original/formats/textures.md#4-bitm-bitmaps-confirmed-structure) 的页面背景调色板与切片 BITM 朝向。
  - [unknowns](../../../../original/unknowns.md)：U-001、U-004、U-018（未确认 → 部分确认，P2 → P4）、U-019（未确认 → 部分确认，P2 → P4）、U-027（负责阶段拆为 P2 对照 / P3 运行时规则）、U-028、U-029、U-030（负责阶段拆为 P2/P2-07、P3、P4）。U-022、U-023 按 18 不变。
- **U-030 影响判断：** 写在 hud 与 U-030（上方链接）。结论是所有未识别元素都没有确定的来源，不能排除缺少切片必需图形，因此不转交 P3；证实缺少图形的回 P2-07。它对 AC-17、AC-22 的影响由 26 汇总。
- **U-032 只核对：** executable 的地图投影节、B-001 的 P2-12 新节与 U-032 三处都是已确认，内容一致；其余 `docs/original/` 文件没有过时的 U-032 引用。
- **检查：**
  - 会话临时脚本（GitHub 锚点规则）检查本项 8 个文件（7 个改动文档与本文件）：`updated:` 齐全，249 个相对链接与锚点没有问题；对照样本能检出缺失文件与错误锚点。diff 没有删除或改名既有标题，既有链接不失效。
  - `pnpm --silent build` 后 `pnpm --silent check:original`：`passed: true`，0 个发现（新 worktree 首次运行因缺少 `dist/` 在 build 范围报 ENOENT，构建后通过）。
  - 新增行中没有颜色名称、颜色值、像素值、原版文字或反编译输出，只有条目 ID、地址、文件名、尺寸、计数、哈希与判定。
- **Rubber-duck：** 4 项阻塞、1 项非阻塞，全部处理后重跑上述检查。
  - **阻塞：**
    - mesh §1 原写“每个带贴图部件的坐标都错”：改为只限坐标不全相同的部件（切片 137 个中的 133 个），第 2 列表 4 个部件两种读法相同。
    - 第 2 列表原写“半透明不是存储的属性”：改为“没有透明字段（已确认）、单凭标志 1 不表示半透明（高概率）、是否由属于第 2 列表本身选择点阵绘制未确认”（mesh、U-027）。
    - U-018 记了已确认的例外却仍为未确认、负责 P2：改为部分确认，切片已解决，其余 19 个切片外的 BITM 归 P4。
    - 本证据原先重复了原版事实，并直接宣布 AC 结论：改为只列回填位置、核对与检查，AC 汇总留给 26。
  - **非阻塞：** U-030 的理由原写“只有有界检索的证据”，与雷达、方框已有的候选矛盾：改为“没有确定的来源，候选都未追踪”，SNIP 10487 只作为显示屏内容的线索（hud、U-030）。
- **文档影响：** 只改上述 `docs/original/` 文件与本文件。工程约定、指南与源码结构无需修改：22 已同步呈现约定，其中“转换读取有误、回 P2-06”的记录与 mesh §1 的更正一致。goal、tasks 与 STATUS 的建议在 worker 报告中。
