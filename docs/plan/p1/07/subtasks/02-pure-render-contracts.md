---
type: plan
status: active
phase: P1
task: "07"
subtask: "02"
updated: 2026-10-10
---

# 02 — 纯渲染契约、插值与视口布局

**契约来源：** [spec](../spec.md) 的 S-02、S-03、S-05、AC-03、AC-06、AC-07。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 `src/render/` 新增 DOM-free 的 RenderFrame 校验、实体位置插值、固定相机契约和 4:3 viewport 纯计算。
- 原子验证 alpha、tick、正安全整数 ID、严格排序/重复、kind、有限坐标、previous/current 冲突与 run 内 kind 历史；失败不改变已接受场景。
- 实现 `M`、DPR、零/无效尺寸和黑边矩形的明确约束，保留不持有 Core 权威事实的边界。

## 不包含

- 不创建 WebGLRenderer、DOM 观察器、React 或 owner 接线（03–06）。
- 不改变 Core Render State 或 Runtime/Session 类型。

## 关键文件与契约

- 新增 [viewport-layout.ts](../../../../../src/render/viewport/viewport-layout.ts)、[synthetic-render-frame.ts](../../../../engineering/source-structure.md#r2-合成渲染)、[synthetic-camera.ts](../../../../engineering/source-structure.md#r2-合成渲染)、[synthetic-appearance.ts](../../../../engineering/source-structure.md#r2-合成渲染) 及邻接测试；AC-06 的投影覆盖需要合成外观几何，因此外观表随本子任务交付。
- 复用 [SyntheticRenderState](../../../../engineering/source-structure.md#r1-合成-core) 和 [RenderFrame](../../../../engineering/source-structure.md#r3-合成-runtime)。

## 验收标准

- [x] AC-03 的插值、出现/移除语义和全部违约输入原子失败成立。
- [x] AC-06 的相机固定、投影范围和最小画面包围框成立。
- [x] AC-07 的参数表、非法 M `RangeError`、布局不等式和居中黑边成立。
- [x] 相关 DOM-free `.test.ts` 传递进入无 DOM lib 的 Node 类型检查。

## 验证方法

- Vitest 参数化测试使用合成 seed 0、真实 Three.js Scene/Camera/Geometry；测试 alpha 0/0.25/0.5/0.75、ID/kind/tick/坐标违约及 320×240 最小画面。
- 不需要 browser-testing；浏览器布局接线由 04/08 验证。

## 完成证据

- **布局（AC-07）：** [viewport-layout.test.ts](../../../../../src/render/viewport/viewport-layout.test.ts) 以 spec 全部 14 种容器加一个受 M 限制的横宽容器（12000×4000）、DPR 1/1.25/1.5/2/3/0/NaN、M 16384/4096 做参数化断言（null、像素比、整数缓冲、贴满边、比例误差 <1、居中与包含、冻结），非法 M 0/−1/1.5/NaN/Infinity 在每种容器下都抛 `RangeError`；另有代表性数值、极大有限尺寸保持有限、超过安全整数的整数 M。
- **帧校验与插值（AC-03 的映射层部分）：** [synthetic-render-frame.test.ts](../../../../engineering/source-structure.md#r2-合成渲染) 用真实 50 Hz Runtime、`moveX=1` 取得 alpha 0/0.25/0.5/0.75 的帧，mover x 与公式误差 ≤1e−12、y/z 等于 current；新 marker 位于 current；暂停折叠帧精确等于 current；被移除实体不再显示。22 种违约（alpha、tick、ID、顺序/重复、kind、坐标、稀疏数组、两份状态冲突、同运行 kind 变化、current 与 previous 中的 ID 重用、tick 倒退）均抛 `SyntheticRenderFrameError` 且历史不变；补跑帧、重复移除帧、极值插值不溢出、新运行空历史、过期 plan 不能提交均有覆盖。场景对象原子性与 Session 联合验证归 03。
- **相机与外观（AC-06）：** [synthetic-camera.test.ts](../../../../engineering/source-structure.md#r2-合成渲染) 断言宽高比 4/3 与视口常量一致、投影矩阵确定；[-5,5]³ 八角与原点的 NDC x/y/z 均在 (−1,1)；320×240 下 mover（原点）与 marker（八角）投影包围框均 ≥3 px（实测 marker 最小约 10.5×10.3 px，最大 |NDC| x 0.55、y 0.76）；背景与黑色差 ≥32、三色两两差 ≥64；每 kind 一份无贴图 `MeshBasicMaterial` 与几何，释放各一次且失败时继续尝试。
- **检查：** `pnpm exec vitest run src/render tools/engineering-boundaries.test.ts` 341/341；`pnpm check` 通过（37 个测试文件/981 个测试、构建）；render 边界回归确认 4 个 DOM-free 模块均在 Node 类型程序中。
- **审阅：** rubber-duck 指出稀疏数组、插值溢出、previous 中的已移除 ID 重用与布局极值/安全整数问题，均已修复并加回归；simplify 采纳单一历史表、绑定计划的 `commit()`、原地校验、共享 4:3 常量、相机参数私有化，未采纳布局公式重构（会改变取整语义）与基于单调 ID 的水位线（spec 未保证分配单调）。
- **文档影响：** [源码结构指南](../../../../engineering/source-structure.md#当前目录) 已列入 `render/` 当前文件；渲染约定的完整说明随 07 同步。
