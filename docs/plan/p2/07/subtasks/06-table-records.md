---
type: plan
status: active
phase: P2
task: "07"
subtask: "06"
updated: 2026-10-05
---

# 06 — TABL 图像列表记录

**契约来源：** [spec](../spec.md) 的 S-03（TABL 部分）、S-08 与 S-09 的 source 层；[容器子资源](../spec.md#容器子资源)、[限值与预算](../spec.md#限值与预算)中的 `tableRecords`、[错误码](../spec.md#错误码)；技术决定 3；AC-04 的 TABL 部分。
**依赖：** 03、04、05。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **解析（扩展 [source-graphics.ts](../../../../../src/original-data/conversion/source-graphics.ts) 或计划新增的相邻模块）：** 只支持 05 在 hud 中记录为已确认的图像列表结构：
  - 记录数 1–64（`tableRecords`），在遍历前判定；
  - 按序号 i 取记录偏移；越界报 `subresource-not-found`；
  - 结构不符或记录指针越出块报 `invalid-payload`。
- **子资源：** 图形步骤接受 TABL 的 `records/<i>`（image）与 `records/<i>/palette`（palette），语法与 04 的其他容器一致；子资源与 kind 不匹配 → `invalid-declaration`。记录的解码、透明、限值与错误语义沿用 P2-05。
- **错误类型：** 向 `SourceLimitName` 追加 `tableRecords`。
- **测试：** 按 05 记录的结构生成合成 TABL：
  - `records/<i>` 得到正确的图像，且与偏移 0 的同一记录逐字节相同；
  - 结构不符、记录指针越出块 → `invalid-payload`；65 个记录 → `limit-exceeded`（`tableRecords`）；`i` 越界、对没有嵌入调色板的记录取 `…/palette` → `subresource-not-found`；
  - 经步骤转换 TABL 记录的用例（含与 CCKD、MFDD 来源混合的声明组）。
- **文档：** 源码结构“图形转换”一节记录 TABL 子资源与 `tableRecords`。

## 不包含

- 结构研究：归 [05](./05-table-structure-research.md)。
- 生产 TABL 映射与入选：归 [09](./09-hud-family-research.md) 与 [12](./12-production-cockpit-hud.md)。
- 05 没有确认的 TABL 结构：不实现，不按“看起来像图像”推断。

## 关键文件与契约

- **修改：** [source-graphics.ts](../../../../../src/original-data/conversion/source-graphics.ts)、[graphics-step.ts](../../../../../src/original-data/conversion/graphics-step.ts)、[source-error.ts](../../../../../src/original-data/source-error.ts) 及其测试；[conversion.test-support.ts](../../../../../src/original-data/conversion/conversion.test-support.ts)。
- **事实依据：** 05 更新后的 [hud](../../../../original/formats/hud.md) TABL 一节。

## 验收标准

- [x] AC-04 的 TABL 部分全部通过。
- [x] 解析只接受 hud 记录为已确认的结构；限值在遍历前判定。
- [x] `pnpm typecheck`、`pnpm lint` 与聚焦测试通过；源码结构已更新。

## 验证方法

- `pnpm test -- src/original-data/conversion/`。
- 只用代码生成的数据；不涉及浏览器或原版数据。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

2026-10-05：

- **实现：**
  - [source-graphics.ts](../../../../../src/original-data/conversion/source-graphics.ts) 的 `readTableRecordOffsets` 只接受 [hud §2](../../../../original/formats/hud.md#tabl-image-lists-confirmed-structure) 记录为已确认的结构，依次检查：
    - 读取记录 0 的固定 36 字节头；记录数为其像素偏移除以 36，在读取其余记录之前判定为 1–64（`tableRecords`）；
    - 每个记录都是不带嵌入调色板的 raw 记录，数据恰为宽 × 高字节（与 `decodeImageRecord` 共用 `requireRawSize`，不解码）；
    - 像素数据按记录顺序、无空隙地恰好占满其余部分。

    其他形态都是 `invalid-payload`。`tableRecordOffset` 对应 `records/<i>`；`CONTAINER_LIMITS.tableRecords` 为 64。
  - [source-error.ts](../../../../../src/original-data/source-error.ts) 追加限值名 `tableRecords`。
  - [convert-graphics.ts](../../../../../src/original-data/conversion/convert-graphics.ts) 的 `RecordSelector` 加入 `table-record`，记录偏移改用穷举的 `switch`。
  - [graphics-step.ts](../../../../../src/original-data/conversion/graphics-step.ts) 接受 TABL 的 `records/<i>` 与 `records/<i>/palette`。
  - [conversion.test-support.ts](../../../../../src/original-data/conversion/conversion.test-support.ts) 新增 `tableBlock`，`graphicsArchive` 可带 TABL 条目。
- **测试：** `source-graphics` 107 项、`convert-graphics` 45 项、`graphics-step` 37 项，全部通过。
  - **AC-04 TABL 部分：**
    - `records/<i>` 的图像与偏移 0 的同一记录逐字节相同，含 1 个与 64 个记录；
    - 序号 3、-1、0.5 与列表记录的 `…/palette` 报 `subresource-not-found`；
    - 65 个记录，以及记录 0 声称 65 个记录（其余记录从未读取），报 `limit-exceeded`（`tableRecords`，`observed` 65）；
    - 结构不符报 `invalid-payload`：ID 列表、数据始于记录内、数据位于记录数组内、精灵记录、嵌入调色板、数据乱序、数据之间有空隙、尾随字节、记录指针越出块，以及未被选中的记录尺寸不符。
  - **经转换与步骤：**
    - TABL 记录与整条目逐字节相同，越界序号定位于 `graphics[image/…].record`；
    - 与 CCKD、MFDD 来源混合的声明组中，各条目各读取一次，TABL 映射为 `verified`；
    - 整条目 TABL、前导零、越界序号与列表记录的 `/palette` 都报对应 code 与位置。
- **工程：** `pnpm typecheck`、`pnpm lint` 通过；`pnpm check` 通过，124 个文件、3807 项，构建成功。
- **审查：**
  - **rubber-duck：** 阻塞项为未被选中的 raw 记录尺寸不符时，列表仍可能被接受。已加入逐记录的宽 × 高检查与回归测试。
  - **simplify：**
    - 已采纳：复用已有的单像素记录样本；穷举 `switch`；共用 `requireRawSize`。
    - 未采纳：
      - 表驱动语法：只有三个短分支；
      - 读取器改为只返回记录数：与 MFDD 的偏移列表接口保持一致，nob-check 也使用它；
      - 缩小步骤层混合样本：本子任务要求混合声明组；
      - 在步骤中把选择器解析为偏移：04 已决定解析留在转换层。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)“图形转换”一节记录 TABL 结构检查、`tableRecordOffset`、`records/<i>` 子资源、`tableRecords`、`RecordSelector` 与 `tableBlock`；原版事实已由 05 写入；其余文档不受影响。
