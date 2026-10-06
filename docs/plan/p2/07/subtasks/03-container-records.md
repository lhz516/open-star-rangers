---
type: plan
status: active
phase: P2
task: "07"
subtask: "03"
updated: 2026-10-05
---

# 03 — CCKD 与 MFDD 容器记录

**契约来源：** [spec](../spec.md) 的 S-03（CCKD、MFDD 与记录调色板部分）、S-08 与 S-09 的 source 层；[容器子资源](../spec.md#容器子资源)、[限值与预算](../spec.md#限值与预算)的结构限值、[错误码](../spec.md#错误码)；技术决定 3、9、10；AC-03 与 AC-04 的解析部分。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **CCKD 分组目录与元素（扩展 [source-graphics.ts](../../../../../src/original-data/conversion/source-graphics.ts)）：**
  - 读取头部 +0x08 的 {指针, 数量}：数量 1–8（`cockpitSlots`），目录在块内；每项 32 字节，+0x10 为元素数组指针，+0x14 为元素数 0–16（`cockpitElements`）；其余目录字段不解释；
  - 元素 52 字节：+0 为 36 字节图像记录，+36/+40 为 i32 屏幕坐标，+44、+48 只接受 0 或 1；
  - 提供按 slot 读取分组（元素坐标与记录偏移，按存储顺序）、按 (slot, i) 取元素记录偏移的函数；空 slot 与序号越界报 `subresource-not-found`；目录或元素数组越出块、+44/+48 越出报 `invalid-payload`；计数超限报 `limit-exceeded`。
  - 在读取或遍历声明的规模之前先判定计数与范围。
- **MFDD 列表：** 在现有 `readMfdRecordOffsets` 上增加每个列表 0–16 个记录的上限（`mfdRecords`），按 (l, i) 取记录偏移：`l` 只接受 0、1，越界报 `subresource-not-found`；指针越出块仍报 `invalid-payload`。
- **记录与嵌入调色板：** 容器内记录经 `readImageRecordHeader`/`decodeImageRecord`/`readEmbeddedPalette` 在块内偏移处读取，与偏移 0 的语义完全相同；记录没有嵌入调色板报 `subresource-not-found`。
- **错误类型：** 向 [source-error.ts](../../../../../src/original-data/source-error.ts) 的 `SourceLimitName` 追加 `cockpitSlots`、`cockpitElements`、`mfdRecords`；code 不新增，既有 code 的含义不变。诊断不含条目编号、偏移或原版字节。
- **测试：** 用 [conversion.test-support.ts](../../../../../src/original-data/conversion/conversion.test-support.ts) 扩展合成 CCKD（含字体目录、1 个与 8 个目录项、空 slot、编码 0 与 2 的元素）与合成 MFDD：
  - 元素坐标按存储顺序；容器内记录的解码结果与把同一记录放在偏移 0 时逐字节相同；`…/palette` 得到嵌入调色板；
  - 拒绝：slot 或元素越界、空 slot、`l` 为 2 → `subresource-not-found`；目录或元素数组越出块、+44 或 +48 为 2、MFDD 指针越出块 → `invalid-payload`；9 个目录项、17 个元素、17 个 MFDD 记录 → `limit-exceeded`，限值名与 `observed` 正确；
  - 元素记录声明 65535×65535 时只读头部即被拒绝，不出现宿主 `RangeError`；
  - 既有的 `readCockpitFonts`、`readMfdRecordOffsets` 测试与 nob-check 用法不受影响（新上限只收紧到 16）。
- **文档：** 源码结构“图形转换”一节记录容器解析函数与新限值名。

## 不包含

- TABL 图像列表：结构研究归 [05](./05-table-structure-research.md)，解析归 [06](./06-table-records.md)。
- 子资源路径的语法解析、映射与布局转换：归 [04](./04-layout-conversion.md)。
- nob-check 的全量校验：归 [07](./07-local-structure-check.md)。

## 关键文件与契约

- **修改：** [source-graphics.ts](../../../../../src/original-data/conversion/source-graphics.ts) 及其测试；[source-error.ts](../../../../../src/original-data/source-error.ts) 及其测试；[conversion.test-support.ts](../../../../../src/original-data/conversion/conversion.test-support.ts)。
- **事实依据：** [cockpit §1–2](../../../../original/formats/cockpit.md#1-cckd-cockpit-layouts)（目录项、元素与 MFDD 头部为已确认的格式规则）。

## 验收标准

- [ ] AC-03 的解析部分：CCKD 目录、元素与记录读取的正负路径全部符合，限值名与 `observed` 正确，65535×65535 只读头部。
- [ ] AC-04 的 MFDD 部分：`l` 为 2 或 `i` 越界、17 个记录、指针越出块分别报对应 code。
- [ ] `fonts/<i>` 与 MFDD 的既有测试不改即通过；没有新 code，只追加限值名。
- [ ] `pnpm typecheck`、`pnpm lint` 与聚焦测试通过；源码结构已更新。

## 验证方法

- `pnpm test -- src/original-data/conversion/source-graphics.test.ts src/original-data/source-error.test.ts`。
- 只用代码生成的数据；不涉及浏览器或原版数据。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
