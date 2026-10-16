---
type: plan
status: active
phase: P3
task: "12"
subtask: "12"
updated: 2026-10-15
---

# 12 — 表现模块：相机、选择者与激活流

**契约来源：** [spec](../spec.md) 的 S-08、AC-11；[表现层效果与会话级选择者](../spec.md#表现层效果与会话级选择者)、[表现层契约（计划新增）](../spec.md#表现层契约计划新增)、[内容输入与校验](../spec.md#内容输入与校验)。
**依赖：** 10, 11。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/render/flight/presentation/`：每个运行一份、不依赖 DOM、Three.js 与 WebGL 的表现模块。
- 运行开始时校验爆炸表、动画帧数与星云列表等输入（空类别、帧数一致性、索引界内），失败以内容错误拒绝开始；抽取 EXIC 子集（保留请求次序与重复）。
- 逐 tick 消费 11 的批次：维护 `beforeStep` 与 `afterStep` 相机（F1 与 Warp 为观察实体位姿；新运行以原点与单位矩阵初始化；无观察实体时保留最后合法值）；在激活 tick 为每个 Core 爆炸选择一次 EXPL（`large` 列表 1，`missile` 列表 3，`other` 按步首相机的 400 距离切换），缓存到 ID 离开 Render State。
- 交付 `PresentationTick` 与爆炸激活流：每次激活恰通知一次，查询无副作用，迟加入的消费者从当前状态恢复且不重播；owner/run 绑定，拒绝跨运行、倒退或缺 tick 的输入。
- 表现随机源与世界 RNG 分开，按运行由宿主种子初始化，测试可注入；预算在分配前检查，超出给出 `presentation-capacity` 类错误。
- 加入 lint 边界：`src/render/flight/presentation/` 不得导入 `three`、DOM 或 `src/app`。
- 测试：子集、选择、400 两侧、缓存寿命（出屏、暂停、地图、动画结束不改选择）、重试、消费者登记先后、limit/limit+1。

## 不包含

- 额外爆炸、事件 0x10 与判别值 1/2 碎片（13）；被毁视角相机（14）。
- 渲染（15 起）。

## 关键文件与契约

- 现有：[flight-data-content.ts](../../../../../src/content/flight/flight-data-content.ts)、[flight-data-readers.ts](../../../../../src/content/flight/flight-data-readers.ts)、[explosions.ts](../../../../../src/core/rules/explosions.ts)（`explosionFrame` 语义）、[eslint.config.js](../../../../../eslint.config.js)、[engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)。
- 计划新增：`src/render/flight/presentation/` 下的模块与测试。

## 写入范围

- `src/render/flight/presentation/*.ts`：表现模块基础、相机、选择者、激活流与测试。
- `eslint.config.js`：表现模块的导入边界。
- `tools/engineering-boundaries.test.ts`：边界回归。

## 验收标准

- [ ] AC-11：子集、单次选择、400 距离、原始序号、缓存寿命、重试与激活流的每项断言通过；P3-14 契约替身收到同一选择与步末相机，每次激活恰一次。
- [ ] 内容输入错误在开始前拒绝；预算 limit 通过、limit+1 在分配前失败。
- [ ] `pnpm exec vitest run src/render/flight/presentation tools/engineering-boundaries.test.ts` 与 `pnpm lint` 通过。

## 验证方法

- Node 测试，注入随机源；合成内容来自 [flight-data.test-support.ts](../../../../../src/content/flight/flight-data.test-support.ts)。

## 完成证据
