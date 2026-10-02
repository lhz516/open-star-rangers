---
type: plan
status: active
phase: P1
task: "02"
subtask: "02"
updated: 2026-10-01
---

# 02 — 场景契约、创建入口与只读输出

**契约来源：** [spec](../spec.md) 的 S-01、S-05、S-06；AC-01、AC-06（配置部分）、AC-08 与 AC-09（初始状态部分）、AC-10；“初始条件”“数据模型与契约”“读取与数据所有权”与技术决定 5、8。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新增 `src/core/errors.ts`：`CoreInputError extends Error`，带只读 `path: string`，消息说明原因。
- 新增 `src/core/synthetic-scene.ts`，定义：
  - 常量：默认 tick 频率 60、mover ID 1、移动速度每秒 1 个演示单位、标记坐标下界 -5 和上界 5（不含上界）。
  - 类型：`Vec3`（只读 x/y/z）、`EntityId`、`SyntheticSceneConfig { seed; tickRateHz? }`、`MoveInput { moveX }`、`Command`（`{ type: 'add-marker' }` 或 `{ type: 'remove-marker' }`）、`TickInput { input; commands }`。
  - `DomainEvent` 联合：`marker-added`、`marker-removed`、`command-rejected`。共同字段为 `type`、`tick` 和从 0 起的 `commandIndex`；增删事件另带 `entityId`、`position`；拒绝事件另带 `commandType` 与 `reason`（`marker-already-exists` 或 `marker-not-found`）。
  - 状态检查副本 `SyntheticSceneState`：`scenario: 'synthetic'`、`tick`、`tickRateHz`、`seed`、`rngState`、`nextEntityId`、`mover {id, position}`、`marker {id, position} | null`。
  - UI projection：`scenario: 'synthetic'`、`tick`、`tickRateHz`、`mover`、`marker`。
  - Render State：`tick` 与按 ID 升序的 `entities: {id, kind: 'mover' | 'marker', position}[]`。
  - 所有公开类型递归 `readonly`。
- `createSyntheticScene(config)` 返回 `SyntheticScene`，本子任务只提供 `inspect()`、`uiProjection()`、`renderState()`；`step()` 由 03 加入。
- 配置校验，失败时抛 `CoreInputError` 且不创建实例：
  - config 必须是非 null、非数组的对象，只允许 `seed` 与 `tickRateHz` 两个键，其他键抛错（`path` 为 `config.<键名>`）。
  - `seed` 为 number 类型的整数，范围 0 至 4294967295。
  - `tickRateHz` 缺省或值为 `undefined` 时取 60；否则须为有限正数，且其倒数为有限正数。
  - 不做强制类型转换，例如字符串 `'60'` 抛错。
- 初始状态：tick 0、mover `{id:1, position:{0,0,0}}`、无标记、`nextEntityId` 2、`rngState` 等于 seed。实例只保存 seed/tickRateHz 的值，调用方之后改动 config 对象不影响实例。
- 每次读取都新建纯数据对象并递归冻结；读取不改变任何状态或 RNG。
- 新增 `src/core/synthetic-scene.test.ts`，覆盖：
  - 默认频率与显式 120 Hz、seed 0 与上界下的完整 `inspect()` 及两种投影。
  - 每种非法配置（缺失、null、数组、额外键、非整数/负数/超界/NaN/字符串 seed、0/负数/Infinity/NaN/字符串频率、倒数溢出的极小频率）抛 `CoreInputError` 且 `path` 正确。
  - 创建后改动 config 不影响实例。
  - 写入冻结输出抛 `TypeError`；两次读取得到相等但不同的对象；读取前后 `inspect()` 相同；输出经 JSON 往返后相等。

## 不包含

- `step()`、移动、命令、事件生成与 RNG 消费（03）。
- TickInput 校验与数值守卫（04）。
- 序列化格式、恢复、哈希（P1-03）；Runtime、UI、渲染接线；新依赖。

## 关键文件与契约

- 计划新增 `src/core/errors.ts`、`src/core/synthetic-scene.ts`、`src/core/synthetic-scene.test.ts`（均尚不存在）。
- 复用 01 的 `src/core/rng.ts` 中的 `RngState`。
- 参考 [imfat.ts](../../../../../src/original-data/imfat.ts) 的命名错误类型模式；不导入解析器。

## 验收标准

- [ ] AC-01：只用显式配置在纯模块中创建；默认/显式频率、seed=0 与上界的初始检查结果、ID、场景标识及两种投影完全符合契约。
- [ ] AC-06（配置）：所列非法配置全部抛 `CoreInputError`，`path` 定位正确，不做强制转换。
- [ ] AC-08（初始）：输出冻结，写入抛错；两次读取互不共享对象；config 改动不影响实例。
- [ ] AC-09（初始）：UI 与 Render 一致，Render 实体按 ID 升序；读取前后 `inspect()` 不变。
- [ ] `pnpm exec vitest run src/core` 与 `pnpm check`（含工程边界回归）通过；没有新依赖或消费者接线。

## 验证方法

- 运行上述命令；测试中逐字段精确断言，不只检查对象存在。
- 对实现 diff 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理后重跑检查。
- 无浏览器、实机或原版对照。

## 完成证据
