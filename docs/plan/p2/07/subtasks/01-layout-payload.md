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

- [ ] AC-01：往返相等、逐字节确定；截断、尾随字节、画幅宽 0/641、高 0/481、元素数 0/17、坐标越出画幅、重复图像都报 `invalid-graphics-payload`；未知 schema 报 `unsupported-payload-schema`；依赖不一致报 `binding-mismatch`。
- [ ] 描述符的 `payloadIdentity` 与实际字节一致，`validateGroup` 不报 `payload-mismatch`。
- [ ] 新模块不导入 `original-data`、DOM、Node 或 Three.js；P2-05 三类 payload 的既有测试不改即通过。
- [ ] `pnpm typecheck`、`pnpm lint` 与聚焦测试通过；源码结构已更新。

## 验证方法

- `pnpm test -- src/content/graphics/`，表驱动覆盖每个边界的“恰在边界”与“超出 1”。
- 不涉及浏览器或原版数据。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
