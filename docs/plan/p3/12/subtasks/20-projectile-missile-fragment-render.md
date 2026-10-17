---
type: plan
status: active
phase: P3
task: "12"
subtask: "20"
updated: 2026-10-17
---

# 20 — 弹丸、导弹与碎片的绘制

**契约来源：** [spec](../spec.md) 的 S-07、AC-10；[弹丸、导弹与碎片](../spec.md#弹丸导弹与碎片)；Q-07、Q-08。
**依赖：** 05, 13, 17。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/render/flight/objects/`：
  - 弹丸：`projectile` 选择器所指 RENS 记录的程序几何；导弹：对应导弹类型的机身与 TEX 10377 元素（只用第 0 个旋转映射）；放置、朝向、受光、颜色与跨接缝插值按 Q-07。
  - 判别值 3 碎片：源模型第 1 列表的原序号部件，逃生舱绘制部件 0–2；判别值 1、2 碎片（来自 13）：TEX 10151 的程序形状与 MODL 10383 第 1 列表部件；放置、自转轴与光照按 Q-08。
  - 记录或部件序号越界按内容/契约错误处理，不替代外观。
- 导出供 23 接入的 pass；测试覆盖每种外观来源、序号越界与 Q-07、Q-08 的分支。

## 不包含

- 爆炸精灵（21）。
- 接入与浏览器读回（23、25）。

## 关键文件与契约

- 现有：[effect-payload.ts](../../../../../src/content/effects/effect-payload.ts)、[viewer-effects.ts](../../../../../src/render/viewer/viewer-effects.ts)（`fanTriangles`、`effectViews` 可复用）。
- 计划新增：`src/render/flight/objects/`。

## 写入范围

- `src/render/flight/objects/**`：弹丸、导弹与碎片 pass 与测试。

## 验收标准

- [x] AC-10（Node 部分）：各外观来源与 Q-07、Q-08 的断言通过；越界引用报错。
- [x] `pnpm exec vitest run src/render/flight/objects` 通过。

## 验证方法

- Node 测试；合成内容来自 [effects.test-support.ts](../../../../../src/content/effects/effects.test-support.ts)。

## 完成证据

- **实现：** [object-surfaces.ts](../../../../../src/render/flight/objects/object-surfaces.ts) 在运行前把效果几何与第 1 列表部件准备成按“外观”（一个视觉所挂的部件）分组的受光部件（复用 17 的 `LitPartBuilder`，斜坡与贴图规则与模型一致）；[effect-objects-layer.ts](../../../../../src/render/flight/objects/effect-objects-layer.ts) 的 `EffectObjectsLayer`（世界槽）用自有的 `ModelLightingLayer` 按绘制位姿画 Core 的弹丸、导弹、判别值 3 碎片与表现模块中 `shown` 的判别值 1/2 碎片，光照、明暗、贴图、剔除与深度沿用模型层。
  - 弹丸：所指 RENS 记录的几何，质量 1；导弹：机身与尾翼质量 2，附加元素与 TEX 10377 元素质量 1，按 `0x4457c` 的挂接次序；判别值 1：两种 TEX 10151 形状之一，质量 2；判别值 2：MODL 10383 第 1 列表部件 i mod 个数；判别值 3：源模型第 1 列表原序号部件，逃生舱（仅部件 0）画部件 0–2；质量均为 min(RENS +0x18, 构建者质量)。
  - 颜色按 `0x7a698`：f32 分量夹到 [0, 1]、乘 255、就近偶数取整；无纹理形状以该字节色作部件色的斜坡，有纹理形状用纹理调色板的斜坡。
  - 面按 HS8 以 (c₀, c_{k−1}, c_k) 扇形三角化；带贴图的形状每个三角形的 u 按接缝规则调整（复用 18 的 `seamU`），v 不变。
  - 越界引用（弹丸记录、导弹类型、第 1 列表部件、非部件 0 的逃生舱、非本运行的弹丸 visuals、判别值 1 的形状）在绘制时报 `binding-mismatch`；导弹类型越界不按原版夹到最后一类（spec 的有意差异）。debris 模型缺失或无第 1 列表部件、设备质量为 0 在运行前拒绝。
  - 判别值 1/2 碎片按 21 的先例插值：上一 tick 最后一次绘制的位姿到当前位姿按 alpha 混合，帧折叠或新出现时取当前位姿；朝向按库的接受规则（`DrawnOrientations`）。
- **新事实（已确认，代码；交 27 写入 `docs/original/`）：** `0x97b14` 在网格创建时（`0x80c14` 逐面调用）每个面算一次法线，取角 c₀、c_{n−2}、c_{n−1}（面 +0x44 角数，+0x4C 角指针），即 normalise(normalise(c_{n−2} − c₀) × normalise(c_{n−1} − c₀))，存于面 +0x2C；平面路径 `0x7db10` 把该面法线复制给面的每个扇形三角形。因此多边形面的所有三角形都用最后一个扇形三角形的法线（对三角形面与 LS6 现有写法一致）。依据为 `local/research/p3-12/lighting/out/d61`（`0x97b14`）、`camera/out/p47.txt`（`0x80f00` 的调用）与 `shimmer-effects/out/p63.txt`（`0x7e080`–`0x7e092`）。实现按此计算；测试用非平面五边形证明不是逐三角形法线。
- **测试：** `pnpm exec vitest run src/render/flight/objects`：2 个文件 22 项通过，覆盖颜色换算（夹取、乘 255、就近偶数）、每种外观来源的几何、质量、法线、斜坡与贴图、元素接缝、设备质量上限与拒绝、内容缺失、所有越界引用、判别值 2 的取模、绘制次序、无偏移放置与光向、表现碎片的插值、折叠与被拒朝向、无世界视角与 GPU 计划。`pnpm check`（TypeScript、ESLint、Vitest 380 个文件 10,568 项、生产构建）通过。
- **Rubber-duck：** 指出逃生舱外观未检查部件序号（已改为仅部件 0，补测试）；无世界视角中不调用世界层，表现碎片的朝向停在最后一次世界帧（被拒行在旋转积分下不出现，作为限制写入文件说明）。其余（颜色、质量、法线、接缝、插值、与模型层共享 GPU 缓存键）未发现问题。
- **Simplify：** 收窄导出、删除未用参数与逐角分配、`#remember` 返回当前位姿；未采纳需改 17 文件的建议（见下）与按帧缓存外观 ID（开销可忽略）。
- **文档影响：** 本子任务不改其他文档。建议：27 把上述面法线事实并入 executable.md 的 LS6/HS8（LS6 “one normal per triangle” 改为“每面一个、复制到各扇形三角形”）；28 在 render 模块说明与源码结构指南中加入 `src/render/flight/objects/`。可选的后续整理（需 17 文件的写入范围）：给 `LitPartBuilder` 加接受已展开三角形与逐三角形法线的入口，给 `ModelLightingLayer` 加按绘制项输入，可去掉本模块的单部件模型适配与帧适配。
- **交 23 的接入：** 运行前 `prepareObjectSurfaces({...ModelLightingContent, projectiles: {id, visuals}, missiles, debris, debrisModel}, settings)`（内容错误拒绝开始），把 `surfaces.looks.plan` 加入 GPU 计划，`addLayer(new EffectObjectsLayer({surfaces, resources, effects}))`，其中 `effects` 为运行的表现效果（`fragments()`）；`wireFlightRun` 目前不对外给出 effects，须由 23 暴露。

