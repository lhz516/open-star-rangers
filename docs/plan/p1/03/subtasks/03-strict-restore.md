---
type: plan
status: active
phase: P1
task: "03"
subtask: "03"
updated: 2026-10-02
---

# 03 — 严格恢复与数值上限边界

**契约来源：** [spec](../spec.md) 的 S-03、S-06；AC-02（恢复后键序无关部分）、AC-03、AC-04、AC-05、AC-06；“恢复”“数值上限边界”两节，技术决定 3，以及 P1-02 技术决定 7。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 [synthetic-scene.ts](../../../../../src/core/synthetic-scene.ts) 新增导出 `restoreSyntheticScene(snapshot: unknown): SyntheticScene`，复用同文件中的 `requireRecord`、tick 频率校验与 `Scene`。
  - `Scene` 增加一个仅供模块内部使用、从已校验状态构造的入口。`createSyntheticScene` 的行为与 `SyntheticScene` 接口都不变。
  - 格式常量从 02 的 `synthetic-snapshot.ts` 在运行时导入；该文件只从本文件导入类型，因此不形成运行时循环。
- 先完成全部校验，失败时抛 `CoreInputError`，`path` 以 `snapshot` 开头并指向字段（例如 `snapshot.state.marker.id`），不返回半构造的场景。规则逐条按 spec“恢复”一节的校验表：
  - **顶层：** 只含 `format`、`version`、`state`；`format` 与 `version` 必须完全匹配。
  - **`state`：** 只含 8 个字段；`scenario` 为 `'synthetic'`。
  - **数值字段：**
    - `tick` 为非负安全整数；`tickRateHz` 与创建配置规则相同；`seed`、`rngState` 为 `0` 至 `4294967295` 的整数；`nextEntityId` 为不小于 2 的安全整数。
    - 不接受数字字符串、BigInt、`NaN` 或 `±Infinity`；任何数值字段的 `-0` 都规范化为 `+0`。
  - **实体：**
    - `mover` 只含 `id`、`position`，`id` 为 1，`position` 只含 `x/y/z`，`x` 有限，`y`、`z` 为 0。
    - `marker` 为 `null`，或只含 `id`、`position`，`id` 为安全整数且 2 ≤ `id` < `nextEntityId`，三个坐标都在 `[-5,5)`。
  - 不检查历史可达性。
- 新场景不保留对输入对象的引用；之后修改输入对象不影响新场景。
- 新增 `src/core/synthetic-scene-restore.test.ts`：
  - **AC-03：** 分别从初始、有标记、移除后、JSON 往返后四种快照恢复。恢复实例的 `inspect()`、两种投影、快照与哈希都与来源相同。随后两者并行执行同一输入序列（含添加、移除和两种拒绝），逐 tick 比较事件与哈希。修改恢复用的输入对象不影响新场景。
  - **AC-02（恢复部分）：** 键序打乱、值相同的快照数据恢复后，规范文本与哈希相同。
  - **AC-04：** 每条规则至少一个负向用例，覆盖格式/版本错误、缺失与额外字段、错误的 scenario、非整数与越界整数、非有限数、数字字符串、非法频率、`mover.id ≠ 1`、`y/z ≠ 0`、`marker.id` 等于 1 或不小于 `nextEntityId`、坐标为 `-5.0000001` 或 `5`。逐项断言错误类型与 `path`。另有用例断言 `-0` 被接受并规范化为 `+0`。
  - **AC-05：**
    - 对 `tick`、`tickRateHz`、`seed`、`rngState`、`nextEntityId`、`mover.position.x`，以及 `marker` 的有无、`id` 和三个坐标，各构造一对规范化后不同、且满足其余不变量的合法快照；恢复后规范文本不同，这些选定用例的哈希也不同。
    - 状态不变时，重复读取快照、哈希和投影都不改变哈希。
    - 测试注释说明：有限用例不构成无碰撞证明。
  - **AC-06：**
    - 从 `tick = MAX_SAFE_INTEGER - 1` 恢复：一次有效 step 成功并到达上限，下一次抛 `CoreInputError`。
    - 从 `nextEntityId = MAX_SAFE_INTEGER - 1`、`marker = null` 恢复：一次添加成功，标记 ID 为 `MAX_SAFE_INTEGER - 1`，分配器到达 `MAX_SAFE_INTEGER`；移除后再添加抛错；同一状态下不分配 ID 的合法 tick 仍可推进。
    - 每次被拒绝的调用前后，快照与哈希都相同。

## 不包含

- 改变 P1-02 已有的守卫或 step 语义；中途快照 replay；旧版本迁移。
- 录制、replay、比对（04–06）。

## 关键文件与契约

- 修改已有的 [synthetic-scene.ts](../../../../../src/core/synthetic-scene.ts)：只新增恢复入口与内部构造路径。
- 计划新增 `src/core/synthetic-scene-restore.test.ts`（尚不存在）。
- 复用 02 的 `src/core/synthetic-snapshot.ts` 与 [errors.ts](../../../../../src/core/errors.ts)。

## 验收标准

- [ ] AC-03：四种来源恢复后完全等价，并行继续运行的事件与哈希逐 tick 相同；与输入对象隔离。
- [ ] AC-02（恢复部分）：键序无关。
- [ ] AC-04：每条恢复规则都有负向用例，错误类型与 `path` 正确；`-0` 被规范化。
- [ ] AC-05：逐字段的规范文本与哈希敏感性用例通过；重复读取哈希不变。
- [ ] AC-06：tick 与 ID 上限的边界测试通过，且有原子性证据，补全 P1-02 技术决定 7 原本仅有的审阅证据。
- [ ] P1-02 现有测试全部原样通过；`pnpm exec vitest run src/core` 与 `pnpm check` 通过。

## 验证方法

- 运行上述命令；对实现 diff 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理后重跑。
- 无浏览器、实机或原版对照。

## 完成证据
