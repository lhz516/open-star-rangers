---
type: plan
status: active
phase: P3
task: "12"
subtask: "14"
updated: 2026-10-17
---

# 14 — 被毁视角相机

**契约来源：** [spec](../spec.md) 的 S-03、AC-06（Node 部分）；[被毁视角](../spec.md#被毁视角)。
**依赖：** 01, 12。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 `src/render/flight/presentation/destruction-camera/`（计划新增）实现：视角 0x11、子模式 8 时，从 10 提供的转换事实（发生处的座机位姿与时钟）初始化，绕第 0 行转 32°；逃生舱出现前姿态保持、按 −30 × 进入后秒数沿相机第 2 行后退；跟随逃生舱时每 tick 转向、用叉积重建轴、距离首次取当前值后每 tick 向 30 缓动四分之一。
- 退化方向按 01 的结论处理；01 未确认时该项保持 blocked，不输出 NaN 或任意朝向。
- 步首与步末相机正确区分；离开该视角回到 F1 相机；救援复位与同 ID 的新销毁序列重新初始化。
- 测试：逐 tick 与权威公式一致（误差按 f32 舍入推导）；帧内进入并退出、跟随点失效、退化方向、救援复位。

## 不包含

- 进入与结束的规则（P3-11）。
- 渲染与浏览器场景（16、25）。

## 关键文件与契约

- 计划新增：`src/render/flight/presentation/destruction-camera/`。
- 输入：10 的视角转换事实与 `followedEntityId`。

## 写入范围

- `src/render/flight/presentation/destruction-camera/**`：被毁视角相机与测试。

## 验收标准

- [x] AC-06（Node 部分）：初始化、后退、跟随、首次距离与逐 tick 缓动满足权威公式；各边界情形不产生 NaN。
- [x] `pnpm exec vitest run src/render/flight/presentation` 通过。

## 验证方法

- Node 序列测试。

## 完成证据

- **实现：** [destruction-camera.ts](../../../../../src/render/flight/presentation/destruction-camera/destruction-camera.ts) 的 `createDestructionCamera()` 经 12 的 `FlightPresentationInput.destructionCamera` 接入，未改 `presentation/*.ts`。
  - 进入（`0x31094`）：每个切到 0x11/8 的 `view-switched` 按事件次序重新初始化：取事件中的玩家位姿，经 Core 的 `rotateRows(…, 'pitch', ENTRY_ANGLE)` 绕第 0 行转 f32 的 32°（位模式 0x3F0EFA35，等于 `Math.fround(32° 弧度)`），距离未设定（−1），进入时刻为 F(clock ÷ 64)。`clock` 阶段之前的切换取上一 tick 的时钟（原版此时读的是上一遍的取样）；FS-03 规定 P3-11 的进入总在其后，这一分支只为如实。
  - 相机步（`0x31bdc`）：tick 末视角为 0x11/8 且有观察实体时运行一次。未跟随时位置为 F(P + F(R2 × s))，s = D(D(now − entry) × −30)，P 为 tick 末的座机位置、行保持；跟随实体不在 `entities` 中时冻结；跟随时 R2 = F(F − 位置)，未设定的距离取 F(√((y² + z²) + x²))，行由 Core 的 `orthonormalFrame`（与 `0x31bdc` 内联的规范化、叉积与舍入相同）重建，距离 F(d + (30 − d) × 0.25)（原版大于、不大于 30 两个分支在双精度下结果相同），位置 F(F + F(R2 × −d))。运算次序据私有本地清单逐条核对，仓库只记公式。
  - 离开视角时丢弃状态并返回 null（展示相机回到观察实体位姿）；没有进入事件却处于 0x11/8、进入时没有玩家、未跟随时观察实体不在表中，均为 `invariant-violated`。
- **测试：** [destruction-camera.test.ts](../../../../../src/render/flight/presentation/destruction-camera/destruction-camera.test.ts) 16 项，全部为合成状态：
  - 用预先反转 32° 的玩家朝向使进入行恰为单位矩阵，逐 tick 精确断言（`toEqual`）后退 0.9375/tick、首次测距后不再测距（逃生舱跳远仍从 37.5 缓动到 35.625、34.21875）、自 30 以下向上缓动；
  - 一般朝向与移动逃生舱 119 个 tick 按理想双精度公式在 f32 舍入导出的界内（每分量 2–32 个 2⁻²⁴ 相对步长）一致，并检查手性、正交与收敛到 30；
  - 进入时的行来自事件而非 tick 末朝向、`clock` 前后阶段的进入时刻、同 tick 多次进入取最后一次；
  - 跟随点失效冻结、重新列出后从冻结位姿与已缓动距离继续；退化：相机与逃生舱重合得零行、距离 0→7.5，之后行 0、1 保持为零而行 2 恢复；新视线与旧行 1 同向或反向得零行 0、1；全部有限；
  - 帧内进入并退出返回 null 且状态丢弃；救援后同一玩家与逃生舱 ID 的新销毁序列从新进入时刻后退并重新测距；
  - 接入 `createFlightPresentation`：进入 tick 的 `beforeStep` 为上一 tick 的 F1 相机、`afterStep` 为被毁相机（全屏视口），下一 tick 的 `beforeStep` 等于它，救援 tick 的 `afterStep` 回到 F1 相机。
  - 变异检查：每 tick 重新测距、角度取反、忽略 `clock` 前阶段、失效时不冻结、行 0 不规范化，各至少使一项失败。
- **检查：** `pnpm exec vitest run src/render/flight/presentation` 4 文件 63 项通过；`pnpm check` 通过（345 文件 10194 项，构建成功）。
- **限度：** 缓动与后退按 tick（技术决定 7），原版按帧率可变的派发器 pass，只声明运算级一致。P3-11 尚未实现被毁视角的进入，只用合成状态验证，不宣称真实的死亡与救援流程已走通；浏览器部分归 25。
- **Rubber-duck：** 唯一发现是测试辅助函数的参数类型取错下标（`pnpm check` 的类型检查也失败），已改为显式选项类型；实现与契约、算式无问题。
- **Simplify：** 改用 Core 的 `rowOf` 与 `orthonormalFrame`，删去本地叉积与矩阵拼装；把两个等价的缓动分支合一并注明；测试去掉两处重复计算。未采纳：统一失效策略（观察实体缺失违反契约而逃生舱失效是原版分支，保留区别）、把观察实体门槛移入未跟随分支（原版派发器在没有玩家对象时整个不调用相机函数）、在契约中携带各阶段的时钟取样（超出写入范围）。
- **文档影响：** 工程与指南文档无需修改。建议协调者或 28 在 executable 的 PV8 补充只属于原版事实的细节：进入角为 f32 0x3F0EFA35；未跟随时每分量先存 F(R2 × s) 再加；跟随时首次距离的平方和次序为 (y² + z²) + x²，位置同样先存 F(R2 × −d)；两个缓动分支在双精度下相同。STATUS 与 tasks.md 无需修改。
