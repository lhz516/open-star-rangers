---
type: plan
status: active
phase: P3
task: "13"
subtask: "10"
updated: 2026-10-28
---

# 10 — 仪表调度规范内容

**契约来源：** [spec](../spec.md#内容输入与校验) 的 S-01，AC-02/05。
**依赖：** 08。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 D-01 实现仪表/元素调度 payload 的编码、严格读取、schema 与预算，slot/layout 身份、顺序、矩形、间隔与图像引用完整。
- 保留 slot 7 的无图像/类型 8，不修改 LayoutPayload 的最小元素约束来凑数据；不含原版指针或 last-draw 状态。
- 提供合成 payload 支持；新 schema 的读取/坏输入与不可变所有权测试同项完成。

## 不包含

不读取原版文件，不接 Worker/版本清单（11），不绘制仪表。

## 关键文件与契约

- 现有 [map-geometry-payload.ts](../../../../../src/content/hud/map-geometry-payload.ts)、[layout-payload.ts](../../../../../src/content/graphics/layout-payload.ts)。
- 计划新增 `src/content/hud/instruments-payload.ts`、同名 `.test.ts`、`instruments.test-support.ts`，最终名称以 D-01 为准。

## 写入范围

- `src/content/hud/instruments-payload.ts`：计划新增规范内容。
- `src/content/hud/instruments-payload.test.ts`：合成正反例。
- `src/content/hud/instruments.test-support.ts`：计划新增共享夹具。

## 验收标准

- [x] 正常 round-trip、零图像布局、顺序与矩形单位保持。
- [x] 截断、未知参数、重复/缺失引用、计数/字节超限均明确失败，分配前检查。
- [x] 不含原版内容、运行指针或可变跨消费者别名。

## 验证方法

文件落地后 `pnpm test -- src/content/hud/instruments-payload.test.ts`、`pnpm check`；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 限定本 payload，不抽象通用 schema 框架。

## 完成证据

2026-10-28，worker 分支 `exec/p3-13-10`（基线 `678615fd`）。

- **实现：** `src/content/hud/instruments-payload.ts` 按 DC-02 导出 `COCKPIT_INSTRUMENTS_ROLE`（`cockpit-instruments`）、`COCKPIT_INSTRUMENTS_SCHEMA_VERSION`（1）、`COCKPIT_INSTRUMENTS_LIMITS`（`payloadBytes` 8,192、`recordsPerSlot` 32、`params` 4）、`COCKPIT_INSTRUMENTS_FORMAT`（640×480、20 个观察距离、三槽的身份与类型集合）、封闭类型 `CockpitInstruments`/`InstrumentSlot`/`ElementSchedule`/`InstrumentRecord`/`InclusiveRectangle`/`InstrumentType`，以及 `readCockpitInstruments`、`checkCockpitInstruments(instruments, { front, mapFrame, mapGeometry })`、`encodeCockpitInstrumentsPayload`、`decodeCockpitInstrumentsPayload`。规范 ASCII JSON 与 map-geometry 相同（`canonical-json.ts`），字段次序即 DC-02 接口次序；descriptor 须为 `data`、本角色、schema 1、无依赖（P3-03 修订 4：依赖“无”，图像经布局与 `checkCockpitInstruments` 核对）。全部错误为 `invalid-flight-data-payload`（schema 为 `unsupported-payload-schema`，依赖为 `flight-data-reference-mismatch`、`payload-detached` 同既有 payload），诊断只含结构路径与固定原因。
- **读取规则（DC-02 第 1–6 条）：** 三槽依次且身份恰为 (0, 0, `layout/cockpit/front`, false)、(2, 6, `layout/map/frame`, false)、(7, 8, null, true)；每槽类型集合恰各一条、按源次序保留（类型 4、11、13、字符串、他槽类型、重复与缺失均拒绝）；矩形为整数且 0 ≤ x0 ≤ x1 ≤ 639、0 ≤ y0 ≤ y1 ≤ 479；`redrawInterval` 为 u32；`drawParam` 类型 0–3 为 0–255、其他为 0；`params` 类型 0–3 为 0–1 个 i32、类型 9 恰 4 个且两段含端点 x 范围在矩形内、各自有序，其他为空；20 个有限 f32 距离（-0 读作 0，与规范形式一致）；有布局的槽 1–16 个元素、图像为 image Asset ID 且两两不同，slot 7 为空；遍 1 且 `everyFrame` false 拒绝。记录 +0x1C 等运行期字段作为未知字段拒绝。所有列表先核长度再读项（槽 3、元素 16、记录 32、参数 4、距离 20，测试覆盖 limit 与 limit + 1 时报错路径不同），字节上限在 descriptor 与解析之前核对。
- **跨 Asset 核对：** 前视与地图布局的元素等长、同下标图像相同；slot 2 的类型 10 记录（任意位置）的矩形与重绘间隔与 map-geometry 逐字段相同。
- **合成夹具：** `instruments.test-support.ts` 的 `syntheticCockpitInstruments()`（新可变内容，slot 0 源次序 0, 1, 2, 3, 5, 7, 8, 6, 9, 12，含遍 0/遍 1 元素）与 `syntheticInstrumentAssets(content)`（与之相符的布局与地图几何），代码生成，不含原版值。
- **字节预算：** 合成内容编码 2,165 字节；每字段取最长拼写的有效内容（两槽各 16 个 128 字符图像 ID、u32 最大间隔、i32 最小条模式、23 字符的 f32）编码 7,795 字节 ≤ 8,192，测试断言之。生产转换的观测值由 11 核对并记入 cockpit §3。
- **检查：** `npx vitest run src/content/hud/instruments-payload.test.ts` 108 项通过；`pnpm check` 通过（typecheck、lint、398 个测试文件 10,981 项、build）。
- **rubber-duck：** 只读 code-review 代理按 DC-02、修订 4 与验收标准审查，唯一发现为 `InstrumentSlot.layout` 应为 DC-02 的 `AssetId | null`（原写为字面量字符串类型），已改并重跑 `pnpm check` 通过；其余规则、限值、字段次序、冻结与测试覆盖确认无问题。simplify 按四个角度自查本 diff：每个 HUD payload 自带 `readFields`/`integer`/`invalid` 是既有模式，按本子任务验证方法不抽象通用框架；简化了元素数量上下限的写法。
- **文档影响：** 不新增原版事实（只消费 cockpit.md 与 DC-02 已记录的事实），不改 unknowns；DC-02 与修订 4 无需修订。导入接线（转换、角色、Worker、合成包、切片定义 7、`graphics-6`、缓存与本机工具）归 11。
- **私有输出：** 无。
