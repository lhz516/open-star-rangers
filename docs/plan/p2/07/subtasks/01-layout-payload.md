---
type: plan
status: active
phase: P2
task: "07"
subtask: "01"
updated: 2026-10-05
---

# 01 — 布局 payload

**契约来源：** [spec](../spec.md) 的 S-01；[布局 payload](../spec.md#布局-payload)、[行为与边界](../spec.md#行为与边界)中“消费者读取布局 payload”一行、[错误码](../spec.md#错误码)的 content 层；技术决定 1；AC-01。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **布局 payload schema 1（`src/content/graphics/`，计划新增模块）：** 小端定长头部加数据，总长恰为两者之和，Asset ID 以 ASCII 存储，编码方式与 P2-05 的三类 payload 一致：
  - `frame`：`{ width: 1–640, height: 1–480 }`，单位为像素；
  - `elements`：1–16 项，数组顺序即绘制顺序；每项 `{ image, x, y }`，`image` 为 image Asset ID，`x`、`y` 为整数，0 ≤ x < width、0 ≤ y < height；
  - 各元素引用的图像互不相同。
- **编码与严格读取：** 编码器校验同样的约束；读取器拒绝截断、尾随字节、字段越界、元素数 0 或 17、坐标越出画幅与重复图像，都报 `invalid-graphics-payload`；schema 不是 1 报 `unsupported-payload-schema`。读取结果冻结，与输入缓冲隔离。
- **描述符一致性：** 扩展 [graphics-binding.ts](../../../../../src/content/graphics/graphics-binding.ts)，让 `GraphicsPayload` 包含布局，布局引用的图像按 ID 升序恰等于描述符依赖、且依赖全部为 `image`，否则 `binding-mismatch`。三类既有 payload 的行为不变。
- **测试：** 相邻 `*.test.ts`：往返与逐字节确定性；上列每种拒绝；`binding-mismatch` 的多出、缺少、kind 不符；描述符的 `payloadIdentity` 由实际字节计算，交给 [completeness.ts](../../../../../src/content/completeness.ts) 的 `validateGroup` 时没有 `payload-mismatch`（用 [synthetic-content.test-support.ts](../../../../../src/content/synthetic-content.test-support.ts) 组成的合成组）。
- **文档：** [源码结构](../../../../engineering/source-structure.md)的“图形 payload”一节记录布局 payload 的字节布局、约束与读取错误。

## 不包含

- 合成函数与 `layout-out-of-frame`：归 [02](./02-layout-composition.md)。
- 从 CCKD 转换布局与布局声明：归 [04](./04-layout-conversion.md)。
- 元素按图像尺寸是否越出画幅：读取器只能检查坐标，矩形检查归 04（转换）与 02（合成）。

## 关键文件与契约

- **计划新增：** `src/content/graphics/` 下的布局 payload 模块与相邻测试（尚不存在）。
- **修改：** [graphics-binding.ts](../../../../../src/content/graphics/graphics-binding.ts) 及其测试（`GraphicsPayload` 联合与绑定检查的布局分支）。
- **复用：** [graphics-format.ts](../../../../../src/content/graphics/graphics-format.ts) 的 `GRAPHICS_SCHEMA_VERSION`、`payloadView`、`requireInteger`、`asciiBytes`/`asciiText`；[asset-id.ts](../../../../../src/content/asset-id.ts) 的 `readAssetId`。

## 验收标准

- [x] AC-01：往返相等、逐字节确定；截断、尾随字节、画幅宽 0/641、高 0/481、元素数 0/17、坐标越出画幅、重复图像都报 `invalid-graphics-payload`；未知 schema 报 `unsupported-payload-schema`；依赖不一致报 `binding-mismatch`。
- [x] 描述符的 `payloadIdentity` 与实际字节一致，`validateGroup` 不报 `payload-mismatch`。
- [x] 新模块不导入 `original-data`、DOM、Node 或 Three.js；P2-05 三类 payload 的既有测试不改即通过。
- [x] `pnpm typecheck`、`pnpm lint` 与聚焦测试通过；源码结构已更新。

## 验证方法

- `pnpm test -- src/content/graphics/`，表驱动覆盖每个边界的“恰在边界”与“超出 1”。
- 不涉及浏览器或原版数据。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

2026-10-05：

- **实现：**
  - [layout-payload.ts](../../../../../src/content/graphics/layout-payload.ts) 定义布局 payload schema 1：5 字节头部（`u16` 宽、`u16` 高、`u8` 元素数），N 个 5 字节元素项（`u16` x、`u16` y、`u8` 图像 ID 长度），之后按元素顺序存放 ASCII 图像 ID。读取器先核对元素表与总长，再读取 ID；编码器与读取器共用逐元素检查。`layoutPayloadLength` 供 04 在分配前扣除 `payloadBytes`。
  - [graphics-format.ts](../../../../../src/content/graphics/graphics-format.ts)：`readReference(value, kind, path)` 由原 `readPaletteReference` 泛化而来，调色板引用的行为与文案不变；`GRAPHICS_LIMITS.layoutElements` 为 16。
  - [graphics-binding.ts](../../../../../src/content/graphics/graphics-binding.ts)：`GraphicsPayload` 加入布局；`layoutImages` 给出升序的元素图像；`checkGraphicsBinding` 对布局要求依赖恰为元素图像且 kind 为 `image`。
- **测试：** `pnpm exec vitest run src/content/graphics` 通过，7 个文件、179 项。[layout-payload.test.ts](../../../../../src/content/graphics/layout-payload.test.ts) 覆盖：
  - 精确字节布局与往返；冻结结果；重复编码逐字节相同，缓冲独占；
  - 边界值：1×1、640×480 的最后一个像素、16 个元素、128 字符 ID；
  - 读取器拒绝：schema 2；截断头部、截断元素表、截断 ID 与尾随字节；画幅宽 0/641、高 0/481；元素数 0/17；ID 长度 0/129；x = 宽、y = 高，以及画幅收窄后越界的 x；非法 ID 与调色板 ID；重复图像，报在后一个元素上；
  - 编码器拒绝同类字段，另加负数、小数与非对象元素。

  [graphics-binding.test.ts](../../../../../src/content/graphics/graphics-binding.test.ts)：
  - 布局的 `binding-mismatch` 覆盖 kind 不符、少一个元素图像、多一个、换成别的图像、按绘制顺序而非升序、依赖 kind 不是 `image`、依赖调色板；
  - 合成的 `cockpit-hud-map` 组改用真实 payload（调色板、三张图像、字库与两个布局）。`validateGroup` 为 `group-complete`，没有 `payload-mismatch`；每个描述符的指纹等于实际字节的 SHA-256，`checkGraphicsBinding` 通过。
  - P2-05 的 palette、image、font payload 测试文件未修改，照常通过。
- **工程：** `pnpm typecheck`、`pnpm lint` 通过；`pnpm check` 通过，123 个文件、3681 项，构建成功。`content/graphics/` 的新模块只导入 `content/` 内的模块，由 core tsconfig（无 DOM/Node 类型）与边界回归覆盖。
- **审查：**
  - **rubber-duck：** 审查本子任务 diff，结论为无阻塞、无非阻塞问题。
  - **simplify（四个角度）：**
    - 已采纳：测试用的 `set16`、`setText` 移入 [graphics.test-support.ts](../../../../../src/content/graphics/graphics.test-support.ts)；排序改用 `compareText`；集成用例的布局元素只定义一次；去掉布局测试中重复的 SHA 断言（绑定测试已覆盖）。
    - 未采纳：编码时冻结（拆分会增加路径）；128 字符 ID 的长度断言（`readAssetId` 只保证不超过 128）；ID 的临时 ASCII 缓冲（与同类模块一致，开销可忽略）；通用的依赖推导机制（`GraphicsPayload` 是 spec 封闭的联合，P2-05 已按同样方式处理调色板与字体）。
    - `image-payload.test.ts` 的同名局部 helper 保持不变，以满足“既有测试不改”。
- **文档影响：**
  - [源码结构](../../../../engineering/source-structure.md)的目录树与“图形 payload”一节已更新：四类共用 schema、布局的安全上限、字节布局、读取错误、`layoutImages` 与布局绑定规则。
  - 工程约定与工具指南的命令和检查规则不变；不涉及原版事实或 STATUS。
