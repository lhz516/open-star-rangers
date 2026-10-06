---
type: plan
status: active
phase: P2
task: "06"
subtask: "02"
updated: 2026-10-05
---

# 02 — MESH/MODL 源结构读取加固

**契约来源：** [spec](../spec.md) 的 S-03、S-08（源结构部分），[行为与边界](../spec.md#行为与边界)的 MESH/MODL 行，[限值与预算](../spec.md#限值与预算)的结构限值与格式规则，[错误码](../spec.md#错误码)的 `source` 层；AC-03、AC-04，AC-12 的工具部分。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **MESH 读取（计划新增 `src/original-data/formats/mesh.ts`）：** `readMesh(block, path)` 返回位置、UV、法线、着色槽数、三角形索引与角点着色槽，全部为调用者独占的新缓冲。检查顺序：
  1. 头部：结构指针为 12，结构长度等于块长 − 12，保留字为 0；
  2. 只读取顶点数与三角形数，即按 `MODEL_LIMITS` 检查：为 0 或超过 4,096 时报 `limit-exceeded`（`meshVertices`、`meshTriangles`），之后才分配；
  3. 着色槽数为 1 至 3 × 三角形数，否则为 `invalid-payload`；
  4. 每个三角形角数恰为 3，顶点与着色槽索引在范围内；位置、UV 与法线全部有限；
  5. 尾字为 0，没有截断或尾随字节。

  另提供只读取计数的头部函数，供 03 在分配之前扣除 `vertices` 与 `triangles`。
- **MODL 读取（计划新增 `src/original-data/formats/modl.ts`）：** `readModel(block, path)` 返回三个部件列表（标志字、颜色、MESH 条目号、TEX 条目号或 0）与五个 SND 条目号（0 为空）。检查顺序：
  1. 列表指针与计数在块内；
  2. 部件总数为 1–256，否则报 `limit-exceeded`（`modelParts`）；
  3. 块长等于 44 + 28 × 部件总数；
  4. 部件保留字段为 0，颜色分量不大于 255。

  这几项不符时为 `invalid-payload`（第 2 项除外）。
- **位置：** 两个读取函数都以调用者给出的 `path` 为失败位置，不附加条目编号或偏移；03 传入 `models[<Asset ID>].model` 或 `….parts[<l>][<p>].mesh`。
- **错误：** [source-error.ts](../../../../../src/original-data/source-error.ts) 的 `SourceLimitName` 追加 `meshVertices`、`meshTriangles`、`modelParts`，已有 code 与限值的含义不变。同步 [import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts) 中类型完整的限值名记录。
- **移除旧解析器：** [payloads.ts](../../../../../src/original-data/payloads.ts) 删除 `parseMesh`、`parseModel` 及其类型与测试，只保留 ID 列表与 `PayloadError`。合成构造器移入 [synthetic.ts](../../../../../src/original-data/synthetic.ts)，计划新增 `syntheticMesh`、`syntheticModel`。
- **nob-check：** [nob-check.ts](../../../../../tools/nob-check.ts) 改用这两个读取函数，以条目为单位的位置只用于本地输出；计数与交叉引用核对不变，输出仍只有计数与失败原因。
- **测试：** 计划新增 `formats/mesh.test.ts`、`formats/modl.test.ts`，覆盖 AC-03、AC-04 的全部输入；nob-check 的现有测试继续通过。
- **文档：** [源码结构](../../../../engineering/source-structure.md)的原版格式读取一节与目录树；[mesh](../../../../original/formats/mesh.md) 开头的解析器链接改为新的读取函数（只改指针，不改格式事实）；nob-check 的输出若有变化，同步[工具指南](../../../../guides/tools.md#封包结构核对)。

## 不包含

- 转换、扣除与 `models[…]` 位置的组装（03）；按 MODL 读取 MESH 条目（05）。
- 全量本地核对与观察最大值的记录（10）。

## 关键文件与契约

- 计划新增 `src/original-data/formats/mesh.ts`、`modl.ts` 及测试。
- 修改 [payloads.ts](../../../../../src/original-data/payloads.ts)、[payloads.test.ts](../../../../../src/original-data/payloads.test.ts)、[synthetic.ts](../../../../../src/original-data/synthetic.ts)、[source-error.ts](../../../../../src/original-data/source-error.ts)、[nob-check.ts](../../../../../tools/nob-check.ts)、[import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts)。
- 复用 01 的 `MODEL_LIMITS` 与 [payload-block.ts](../../../../../src/original-data/formats/payload-block.ts) 的块读取（适用处）。`formats/` 只处理已读入的块，不打开封包。

## 验收标准

- [ ] AC-03：合成网格（顶点数 3、三角形数 1，以及含有未用顶点的样本）读出的位置、UV、法线、索引与着色槽与输入逐位相等，输出不与源块共用缓冲。以下输入报 `invalid-payload`：结构指针不为 12、长度字段不符、保留字或尾字不为 0、角数为 4、顶点或着色槽索引越界、着色槽数大于角点数、截断、尾随字节、任一浮点为 NaN 或无穷。
- [ ] AC-03：顶点数或三角形数为 0 或 4,097 报 `limit-exceeded`，限值名与 `observed` 正确；声明 0xFFFFFFFF 个顶点的网格只读取计数即被拒绝，不出现宿主 `RangeError`。
- [ ] AC-04：合成 MODL 读出的三个列表、部件字段与五个音效槽与输入相等。列表指针或计数越出块、块长不等于 44 + 28 × 部件总数、部件保留字段不为 0、颜色分量为 256 报 `invalid-payload`；部件总数为 0 或 257 报 `limit-exceeded`（`modelParts`）。`payloads.ts` 不再导出 `parseMesh` 与 `parseModel`。
- [ ] 失败位置恰为调用者给出的 `path`，不含条目编号；原因文字为可打印 ASCII。
- [ ] `pnpm exec vitest run src/original-data tools`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 表驱动测试，用 `expectSourceError` 断言 code、位置与限值；用源码搜索确认旧解析器已删除。
- 不适用 browser-testing；本地全量核对见 10。
- 完成前按 execute-goal 流程，以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
