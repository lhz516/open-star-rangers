---
type: plan
status: active
phase: P2
task: "06"
subtask: "01"
updated: 2026-10-05
---

# 01 — 规范模型 payload 与消费辅助

**契约来源：** [spec](../spec.md) 的 S-01、S-02，[模型 payload 契约](../spec.md#模型-payload-契约)、[消费者边界](../spec.md#消费者边界)、[错误码](../spec.md#错误码)的 `content` 层；AC-01、AC-02，AC-15 的源码结构部分，AC-16 的 `content/` 边界。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **payload schema 1（计划新增 `src/content/models/model-payload.ts`）：**
  - **常量：** `MODEL_PAYLOAD_SCHEMA_VERSION` 为 1。`MODEL_LIMITS` 定义结构限值，供 02、03 的源读取与转换共用：`meshVertices` 4,096、`meshTriangles` 4,096、`modelParts` 256、部件列表 3、音效槽 5。
  - **类型：** `ModelPayload` 含 `geometries`、`partLists`、`soundSlots`。
    - 几何：位置、UV、法线各为 `Float32Array`；三角形索引与角点着色槽为整数数组；另有着色槽数；
    - 部件：`sourceFlags`（u32）、`colour`（(R, G, B) 各 0–255）、`geometry`（几何表索引）、`texture`（null 或 image Asset ID）；
    - `soundSlots`：恰为 5 个，每个为 null 或 sound Asset ID。
  - **编码与读取：**
    - `encodeModelPayload` 校验后写入独占整个 `ArrayBuffer` 的新缓冲，同一输入得到同样的字节；
    - `readModelPayload(bytes, schemaVersion, path)` 严格读取，返回冻结数据，其中的数组是调用者独占的副本；
    - `modelPayloadLength` 按字段给出编码长度，供 03 在分配之前扣除 `payloadBytes`；
    - 字节布局为小端定长头部加数据，Asset ID 以 ASCII 存储，具体布局由实现确定。
  - **浮点：** 逐位保留，含负零与次正规数；NaN 与无穷一律拒绝。
- **依赖一致性：** 列出 payload 引用的 image 与 sound ID（去重后按升序），并检查描述符依赖恰好等于它们、kind 分别为 `image` 与 `sound`，否则为 `binding-mismatch`。做法参照 [graphics-binding.ts](../../../../../src/content/graphics/graphics-binding.ts)。
- **消费辅助（计划新增 `src/content/models/model-parts.ts`）：**
  - 按列表序号 0–2 取部件项：几何的位置、UV、法线、索引与角点着色槽（独占副本或不可写视图），以及材质 `{ colour }` 或 `{ colour, texture, wrap: 'repeat' }`；
  - 不剔除、不重排三角形，不翻转 UV；
  - 列表序号不是 0–2 为 `invalid-model-payload`；提供给贴图解析的图像与引用不符为 `binding-mismatch`；
  - 贴图颜色只经 P2-05 的 `expandImage` 取得，不另写颜色逻辑。
- **content code：** [contract-validation.ts](../../../../../src/content/contract-validation.ts) 追加 `invalid-model-payload`；`unsupported-payload-schema` 与 `binding-mismatch` 复用 P2-05 的 code。同步 [import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts) 中类型完整的 content code 记录。
- **测试：**
  - 计划新增 `model-payload.test.ts`、`model-parts.test.ts`，以及合成模型构造器 `models.test-support.ts`；
  - 覆盖 AC-01 的全部输入与拒绝项；
  - 覆盖 AC-02：用合成 TEX 图像与飞行调色板，消费辅助取得的贴图经 `expandImage` 展开，结果与 P2-05 的展开逐字节相同。
- **文档：** [源码结构](../../../../engineering/source-structure.md)新增“模型 payload”一节与目录树条目，写明：
  - 字节布局、限值、编码、读取与消费辅助；
  - payload 不承载部件列表、标志与音效槽的含义；
  - [消费者边界](../spec.md#消费者边界)的约定：坐标、轴向、手性、正面绕序与 UV 原点不作解释；GPU 纹理按 image ID 共享；P2-12 的对照入口。

## 不包含

- MESH/MODL 源结构读取（02）、转换与扣除（03）、来源映射与步骤（05）。
- Three.js 的几何、材质、纹理过滤与剔除（P2-11），光照（P3）。

## 关键文件与契约

- 计划新增 `src/content/models/model-payload.ts`、`model-parts.ts`、`models.test-support.ts` 及相邻测试。
- 修改 [contract-validation.ts](../../../../../src/content/contract-validation.ts)、[import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts)、[source-structure.md](../../../../engineering/source-structure.md)。
- 复用 [expand-image.ts](../../../../../src/content/graphics/expand-image.ts)、[graphics-format.ts](../../../../../src/content/graphics/graphics-format.ts) 的读取原语、[ownership.ts](../../../../../src/content/ownership.ts)、[payload.ts](../../../../../src/content/payload.ts)。新模块不导入 `original-data`、DOM、Node 或 Three.js。

## 验收标准

- [ ] AC-01：合成模型含三个列表（其中一个为空）、两个部件共用一个几何、有贴图与无贴图的部件、颜色 0 与 255、标志字原值，以及有空也有非空的五个音效槽。编码再读取后逐项相等：
  - 浮点逐位相等，含负零与次正规数；
  - 索引、绕序与角点着色槽不变；
  - 容器冻结，数组为调用者独占的副本。
- [ ] AC-01：以下输入各报 `invalid-model-payload` 与字段路径：截断、尾随字节、几何或部件数为 0 或超限、三角形索引不小于顶点数、角点着色槽不小于槽数、槽数大于 3 × 三角形数、非有限浮点、颜色大于 255、部件的几何索引越界、列表数不为 3、音效槽不为 5。schema 2 报 `unsupported-payload-schema`；引用与描述符依赖不一致报 `binding-mismatch`。
- [ ] AC-02：消费辅助按列表 0–2 取得的部件项与 payload 一一对应；无贴图的部件只有基色，有贴图的部件给出 image ID 与 `wrap: 'repeat'`；三角形顺序与 UV 未改变。修改返回值不影响后续调用。列表序号 3 报 `invalid-model-payload`。经 `expandImage` 得到的贴图 RGBA 与 P2-05 逐字节相同；图像与引用不符报 `binding-mismatch`。
- [ ] AC-15（源码结构部分）与 AC-16（`content/` 边界）：源码结构写明布局、payload 不承载的含义与消费者边界约定；新模块不导入 `original-data`、DOM、Node 或 Three.js。
- [ ] `pnpm exec vitest run src/content src/workers/import-protocol.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 表驱动测试，断言 code、路径与冻结；用 `Object.is` 与 `DataView` 位比较核对负零与次正规数。
- 不适用 browser-testing；模型渲染的浏览器验证归 P2-11。
- 完成前按 execute-goal 流程，以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
