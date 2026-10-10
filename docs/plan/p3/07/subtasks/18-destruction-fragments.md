---
type: plan
status: active
phase: P3
task: "07"
subtask: "18"
updated: 2026-10-10
---

# 18 — 被毁、爆炸与碎片

**契约来源：** [spec](../spec.md) 的 S-10、AC-12；[被毁、爆炸与碎片](../spec.md#被毁爆炸与碎片)、[联合依赖与阶段时序](../spec.md#联合依赖与阶段时序)、技术决定 4、5；P3-02 spec 的 [CR-02](../../02/spec.md#cr-02-实体的战斗状态d-01)（`ExplosionCombat`、`FragmentCombat` 与表现选择器）、[CR-03](../../02/spec.md#cr-03-移动块的模式-12d-03)（`spinning` 块与 `0x218e8` 的模式 1、2）、[CR-04](../../02/spec.md#cr-04-玩家状态d-01)（`followedEntity`、`delayedExplosionClock`）、[CR-05](../../02/spec.md#cr-05-命令原因码与内部请求d-01)（`expire`、`release-held`、`hand-off`）、[CR-06](../../02/spec.md#cr-06-领域事件与次序d-01)（`explosion-started`、`fragment-expired`、`source-released`）、[CR-07](../../02/spec.md#cr-07-实例化扩展与系统流水线d-01d-03)（爆炸的激活与延迟玩家爆炸阶段）、[CR-08](../../02/spec.md#cr-08-直接创建与对象生命周期d-01)（直接创建与生命周期）、[CR-11](../../02/spec.md#cr-11-表现层的归属与已批准的差异d-01)（归表现层的部分）、[CR-13](../../02/spec.md#cr-13-其他任务在-p3-07-规则中的调用点d-03-之外的接口)（P3-11 的调用点）。
**依赖：** 06, 07, 12, 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **毁伤入口（X1、X2）：** 15 调用的入口：被毁对象进入 `destroyed-source`（不再更新，仍移动）；玩家只设 `delayedExplosionClock` = 时钟 + 0xC0；其他活动对象构造爆炸。种类 1 的 `0x32d74` 与种类 2 的 `0x32dec`（P3-11）在爆炸构造之前的位置写在模块注释中，不建空函数（CR-13）。
- **爆炸构造（`0x23ac8`，X2）：** 种类 22 实体：
  - `source`、`sourceKindBit`、`variant`（`large`、`other`、`missile`）；来源不是机体，或产生碎片失败时，`heldSource` 持有来源；
  - 经 `0x218e8` 的模式 1 分支（14 新建）得到 `linear` 块（`hitTest` 为 false，速度为来源当时的速度）；来源为 `spinning` 块时，先以其速度方向为第三行并重新正交化（本项加入）；
  - 产生判别值 3 的碎片；
  - 构造可在请求处理、移动阶段、碰撞阶段、延迟玩家爆炸阶段与对象更新（P3-08 的 AI 范围伤害）中直接调用，不经请求（CR-08）。
- **爆炸的生命周期（X4，CR-07）：**
  - 种类 22 的 `set-state` 请求转为激活（`0x2409c`）：写 `activationClock` 与 `removalAfterClock`，发出 `explosion-started`（位置为激活时、尚未移动的位置）；在对象更新中创建的爆炸在同一 tick 激活；
  - 被持有的来源在帧序号首次达到帧数（n₁₂ 或 n₃）时经 `release-held` 进入待移除；
  - 爆炸在激活后第 49 tick 请求移除。
- **判别值 3 碎片（X6、X7）：**
  - 按源模型第 1 列表的原序号产生，种类 1、2 跳过部件 1、2；DEBRIS 参数允许种类 1、2 第 0 部件的空引用（逃生舱）；
  - `spinning` 块（`0x218e8` 的模式 2，本项加入）与 `spinning` 运动（`0x2285c`：平移后按 `spinAxis` 旋转，每次移动转过固定弧度，不乘步长）；接入移动阶段归 22；
  - 耐久按参数的 +0x5C 类别；首次回调设到期，大型来源的碎片不到期（`never`）；
  - 击落 `0x24a6c`：置 `explodeOnExpiry` 并把到期改为 1，作为函数供 17、19 调用；
  - 玩家的第 0 部件碎片构造时写 `followedEntity`；
  - 第 0 部件碎片在首个活动回调中投递 `hand-off`；请求处理中来源进入待移除，并发出 `source-released`（玩家不移除，`removed` 为 false）。
- **碎片的到期（`expire` → `0x256e4`，X7）：** 发出 `fragment-expired`：
  - 被击落的构造爆炸（`explodes`）；
  - 玩家的逃生舱：清除 `followedEntity`，`0x32e14(1)`（P3-11）的位置写在注释中，然后进入待移除（`escape-pod`）；
  - 僚机的第 0 部件按其特例（`wingman-pod`）；
  - 其他进入待移除（`removed`）。
- **延迟玩家爆炸（X2）：** `destruction.ts` 导出 `delayed-player-explosion` 阶段的 `run`：`delayedExplosionClock` 非空、时钟严格大于它且玩家实体存在时构造玩家的爆炸，并把它清为 null。
- **不在 Core（CR-11）：** EXPL 选择、EXIC 子集、额外爆炸（`0x23fdc`）、判别值 1、2 的碎片与事件 `0x10`、闪光都归表现层。Core 不做这些抽取，不建逻辑视点或相机状态。
- **测试：**
  - 被毁分支；创建、首次回调、激活与移除时刻（含对象更新中创建的同 tick 激活）。
  - 来源的交接、释放与移除时刻：被毁后第 3 tick；激活后第 28、14 tick；爆炸在激活后第 49 tick 请求移除。
  - 玩家延迟爆炸与逃生舱到期从各自原点计时。
  - 碎片的部件序号、逃生舱的无参数部件、耐久类别、`never` 到期；击落与之后的爆炸。
  - `0x218e8` 模式 2 与 `spinning` 来源的重新正交化；`spinning` 运动。
  - 事件的内容与次序。

## 不包含

- EXPL 选择、额外爆炸、判别值 1、2 的碎片与闪光（P3-12、P3-14，CR-11）；爆炸与碎片的绘制、缩放与音效（P3-12、P3-14）；被毁视角相机（P3-12）。
- 救援（P3-11）；碎片与机体的碰撞（19）、碎片受击（17）；`linear` 运动（17）与移动阶段的接线（22）。

## 关键文件与契约

- `src/core/systems/destruction.ts`（11 新建）：毁伤入口、延迟爆炸阶段、爆炸与碎片的按种类更新，以及 `set-state`、`expire`、`release-held`、`hand-off` 请求。
- 使用 12 的静态规则数据（第 1 列表部件数、DEBRIS 映射、n₁₂ 与 n₃）与运行时种类缺省；14 的 `src/core/rules/movement-builders.ts`。
- 计划新增：`src/core/rules/explosions.ts`、`src/core/rules/fragments.ts` 及相邻测试。

## 写入范围

- `src/core/systems/destruction.ts`：毁伤、爆炸与碎片。
- `src/core/systems/destruction.test.ts`：毁伤系统测试（新建）。
- `src/core/rules/explosions.ts`：爆炸构造、变体与生命周期（新建）。
- `src/core/rules/explosions.test.ts`：爆炸测试（新建）。
- `src/core/rules/fragments.ts`：碎片产生、初态、`spinning` 运动、耐久、击落与到期（新建）。
- `src/core/rules/fragments.test.ts`：碎片测试（新建）。
- `src/core/rules/movement-builders.ts`：`0x218e8` 的模式 2 与 `spinning` 来源（14 新建）。
- `src/core/rules/movement-builders.test.ts`：构造测试。

## 验收标准

- [ ] AC-12：X9 与 CR-08 确定的创建、首次回调、激活与移除时刻满足阶段契约；来源的交接与释放时刻正确；玩家延迟爆炸与逃生舱到期从各自原点计时。
- [ ] AC-12：EXPL 选择归表现层：Core 不抽取，`explosion-started` 给出来源、来源种类、变体、位置与激活时钟；额外爆炸与判别值 1、2 的碎片不在 Core 中。
- [ ] AC-12：判别值 3 碎片用原模型部件序号，覆盖允许无 DEBRIS 的逃生舱；寿命、耐久、交接、击落后的爆炸与大型来源不到期正确；`fragment-expired`、`source-released` 的内容正确。
- [ ] `pnpm exec vitest run src/core tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：经正式 `step` 断言事件次序与实体生命周期；构造的期望由 X1–X11 独立推导。
- 不读取渲染状态；首次运动在 22 验证；原版对照见 27。

## 完成证据
