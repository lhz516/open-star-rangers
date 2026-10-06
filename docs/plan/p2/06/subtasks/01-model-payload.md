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

- [x] AC-01：合成模型含三个列表（其中一个为空）、两个部件共用一个几何、有贴图与无贴图的部件、颜色 0 与 255、标志字原值，以及有空也有非空的五个音效槽。编码再读取后逐项相等：
  - 浮点逐位相等，含负零与次正规数；
  - 索引、绕序与角点着色槽不变；
  - 容器冻结，数组为调用者独占的副本。
- [x] AC-01：以下输入各报 `invalid-model-payload` 与字段路径：截断、尾随字节、几何或部件数为 0 或超限、三角形索引不小于顶点数、角点着色槽不小于槽数、槽数大于 3 × 三角形数、非有限浮点、颜色大于 255、部件的几何索引越界、列表数不为 3、音效槽不为 5。schema 2 报 `unsupported-payload-schema`；引用与描述符依赖不一致报 `binding-mismatch`。
- [x] AC-02：消费辅助按列表 0–2 取得的部件项与 payload 一一对应；无贴图的部件只有基色，有贴图的部件给出 image ID 与 `wrap: 'repeat'`；三角形顺序与 UV 未改变。修改返回值不影响后续调用。列表序号 3 报 `invalid-model-payload`。经 `expandImage` 得到的贴图 RGBA 与 P2-05 逐字节相同；图像与引用不符报 `binding-mismatch`。
- [x] AC-15（源码结构部分）与 AC-16（`content/` 边界）：源码结构写明布局、payload 不承载的含义与消费者边界约定；新模块不导入 `original-data`、DOM、Node 或 Three.js。
- [x] `pnpm exec vitest run src/content src/workers/import-protocol.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 表驱动测试，断言 code、路径与冻结；用 `Object.is` 与 `DataView` 位比较核对负零与次正规数。
- 不适用 browser-testing；模型渲染的浏览器验证归 P2-11。
- 完成前按 execute-goal 流程，以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：** [model-payload.ts](../../../../../src/content/models/model-payload.ts) 定义 schema 1：22 字节头部（显式存储列表数 3 与音效槽数 5，供读取器拒绝不符的值）、严格升序且恰为实际使用 ID 的引用表、11 字节部件、按首次使用排序的几何（位置、UV、法线分平面存储），同一模型只有一种字节表示。`encodeModelPayload` 与 `readModelPayload` 共用同一组规则；读取器先检查计数范围、确认字节存在，然后才分配。另有 `MODEL_LIMITS`、`MODEL_PAYLOAD_LAYOUT`、`modelPayloadLength`、`modelReferences` 与 `checkModelBinding`。[model-parts.ts](../../../../../src/content/models/model-parts.ts) 提供 `modelPartItems` 与 `expandModelTextures`，后者只调用 `expandImage`。[contract-validation.ts](../../../../../src/content/contract-validation.ts) 追加 `invalid-model-payload`，[import-protocol.test.ts](../../../../../src/workers/import-protocol.test.ts) 的类型完整记录同步。
- **AC-01：** [model-payload.test.ts](../../../../../src/content/models/model-payload.test.ts) 用 [models.test-support.ts](../../../../../src/content/models/models.test-support.ts) 的合成模型覆盖：列表 2 为空、两个部件共用几何 0、有无贴图、颜色 0 与 255、标志字 0xFFFFFFFF 等原值、同一 sound 占两个槽、空槽。往返后按位比较浮点（含负零、最小与最大次正规数、最大有限值），容器冻结，几何数组各占独立缓冲且与 payload 和输入互不影响；两次编码逐字节与 SHA-256 相同，长度等于 `modelPayloadLength`；4,096 顶点与三角形、256 部件的边界往返通过。读取器按表逐项拒绝截断、尾随字节、列表数 2、槽数 6、几何数 0 或超过部件数、部件数 0 或 257、顶点或三角形数 0 或 4,097、着色槽数 0 或超过角点数、索引等于顶点数、角点槽等于槽数、NaN 与正负无穷、几何序号越界或不按首次使用、引用越界、kind 不符、引用乱序或未使用，均报 `invalid-model-payload` 与字段路径；声明 65,535 个顶点的头部按计数字段拒绝。颜色以 u8 存储，大于 255 不可表示，由编码器拒绝（256、−1、0.5 与稀疏数组）。schema 2 报 `unsupported-payload-schema`；已转移的字节或数组报 `payload-detached`；`checkModelBinding` 对非 model、缺少或多出依赖、kind 不符报 `binding-mismatch`。
- **AC-02：** [model-parts.test.ts](../../../../../src/content/models/model-parts.test.ts) 覆盖列表 0–2 的部件项与几何、无贴图部件只有 `colour` 一个字段、有贴图部件为 `{ colour, texture, wrap: 'repeat' }`；返回项冻结，修改返回的数组不影响 payload 与后续调用。列表序号 3、−1、0.5、NaN 报 `invalid-model-payload@list`。用合成的 nearest 图像（其一带掩码）与飞行调色板，`expandModelTextures` 的结果与直接调用 `expandImage` 逐字节相同；缺少、多出或改名的图像报 `binding-mismatch@images`，缺少或多出调色板报 `binding-mismatch@palettes`。
- **AC-15、AC-16：** [源码结构](../../../../engineering/source-structure.md#模型-payload)新增“模型 payload”一节与目录树条目：字节布局、限值、编码与读取规则、payload 不承载的含义、消费者边界（坐标、轴向、手性、绕序、UV 原点不作解释；GPU 纹理按 image ID 共享；几何不跨模型共享）与 P2-12 对照入口。新模块只导入 `content/` 内的模块，`pnpm exec vitest run tools/engineering-boundaries.test.ts` 通过（88 项）。
- **检查：** `pnpm exec vitest run src/content src/workers/import-protocol.test.ts` 通过（23 个文件、986 项）；`pnpm typecheck`、`pnpm lint` 通过；`pnpm check` 通过（124 个文件、3,727 项，生产构建成功）。
- **rubber-duck：** 无阻塞问题。采纳一项：编码器原本接受稀疏数组，现改用 `readArray` 拒绝空洞，并增加颜色、音效槽与部件列表的稀疏数组用例。审查确认了浮点按位保留、计数先于分配、拒绝用例命中预期条件、规范形式不会拒绝合法的转换输出（列表 0 为空、跨列表共用 MESH、重复音效槽），以及诊断不回显取值。
- **simplify：** 采纳：读取器的逐元素映射回调改为预分配数组加循环；`expandModelTextures` 对每个贴图只计算一次 `imagePalettes`；几何断言移入测试支持供两份测试共用；`floatBits` 不再复制数组；`set16`、`set32` 移入 [graphics.test-support.ts](../../../../../src/content/graphics/graphics.test-support.ts)，图像测试改用共享版本。未采纳：
  - 通用的 `requireInteger` 与 ASCII 工具的迁移：需要改动本子任务以外的图形模块；
  - 读取时同步校验以省去 `checkModel` 的第二遍：会让编码器与读取器的规则分成两处，且在当前规模下只是一次线性扫描；
  - 共享描述符构造器：需要改动 graphics-binding 的测试；
  - `ModelPayloadShape` 改为私有：它是导出函数 `modelPayloadLength` 的参数类型，03 会用到。
- **文档影响：** 已更新[源码结构](../../../../engineering/source-structure.md)；[STATUS](../../../../STATUS.md) 的 P2-06 下一步改为“goal 已批准，正在执行”。工程约定与工具指南无需改动：没有新命令，也没有新的测试规则。`docs/original/` 无需改动：本子任务不涉及原版事实。
