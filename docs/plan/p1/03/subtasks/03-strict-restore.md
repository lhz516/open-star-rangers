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

- [x] AC-03：四种来源恢复后完全等价，并行继续运行的事件与哈希逐 tick 相同；与输入对象隔离。
- [x] AC-02（恢复部分）：键序无关。
- [x] AC-04：每条恢复规则都有负向用例，错误类型与 `path` 正确；`-0` 被规范化。
- [x] AC-05：逐字段的规范文本与哈希敏感性用例通过；重复读取哈希不变。
- [x] AC-06：tick 与 ID 上限的边界测试通过，且有原子性证据，补全 P1-02 技术决定 7 原本仅有的审阅证据。
- [x] P1-02 现有测试全部原样通过；`pnpm exec vitest run src/core` 与 `pnpm check` 通过。

## 验证方法

- 运行上述命令；对实现 diff 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理后重跑。
- 无浏览器、实机或原版对照。

## 完成证据

- **实现：** [synthetic-scene.ts](../../../../../src/core/synthetic-scene.ts)
  - 新增导出 `restoreSyntheticScene(snapshot: unknown): SyntheticScene`。
  - 私有 `Scene` 构造函数改为接收已校验的 `SyntheticSceneState` 并复制一份；`createSyntheticScene` 用初始状态调用它，行为、错误路径与消息不变。
  - 恢复专用的 `requireExactRecord` 在拒绝额外字段之外，还要求每个字段都是自有属性，原型链上的继承值视为缺失。
  - 数值通过 `readNumber` 加规则元组校验，`-0` 经 `value + 0` 规范化为 `+0`；`readVec` 统一读取 mover 与 marker 的坐标。
  - 只做结构和不变量校验，不检查历史可达性。快照格式常量运行时从 `synthetic-snapshot.ts` 导入，后者只做类型导入，因此没有运行时循环。
- **测试：** [synthetic-scene-restore.test.ts](../../../../../src/core/synthetic-scene-restore.test.ts)，共 87 项。
  - **AC-03：**
    - 初始、有标记（120 Hz）、移除后（seed 4294967295）、JSON 往返四种来源，恢复后的 `inspect`、两种投影、快照与哈希都与来源严格相同。
    - 随后并行执行 6 个 tick（移动、添加、两种拒绝、移除、同 tick add/remove/add），逐 tick 比较事件与哈希。
    - 修改输入对象、来源场景继续运行，都不影响恢复的场景。
  - **AC-02：** 各层键序打乱的快照数据，恢复后规范文本与哈希相同。
  - **AC-04：**
    - 60 个负向用例逐条覆盖校验表，逐项断言 `CoreInputError` 与 `path`，含 BigInt、数字字符串、NaN/Infinity、`1e-320` 频率、`mover.id = 2`、`y/z ≠ 0`、`marker.id` 为 1/等于/大于 `nextEntityId`、坐标 `-5.0000001` 与 `5`。
    - 继承字段视为缺失；边界值被接受；9 个可为 0 的数值字段传入 `-0` 后都规范化为 `+0`。
    - getter 计数用例证明每个字段只读一次，且使用的就是校验过的值。
  - **AC-05：** 对 11 个可变字段（含 `marker` 有无、`id` 与三个坐标），各构造一个与基准只差该字段的合法快照，规范文本与哈希都不同；注释写明有限用例不构成无碰撞证明。重复读取快照、投影与哈希，哈希不变。
  - **AC-06：**
    - `tick = MAX_SAFE_INTEGER - 1`：一次 step 后到达上限，之后 idle 与带添加的 step 都抛 `CoreInputError`（`tickInput`）。
    - `nextEntityId = MAX_SAFE_INTEGER - 1`：添加得到 ID `MAX_SAFE_INTEGER - 1`，分配器到达上限；已有标记时被拒的添加不分配 ID，仍可执行；移除后再添加，以及 remove+add，都抛错（`tickInput.commands`）。
    - 每次被拒的调用前后快照与哈希都相同；不分配 ID 的 tick 继续推进到 tick 5。
- **检查：** `pnpm exec vitest run src/core` 通过；P1-02 的三个测试文件未改动且全部通过；最终 `pnpm check` 通过（typecheck、lint、11 个测试文件共 272 项、build）。
- **审阅：**
  - rubber-duck 指出三点，处理如下：
    - 继承字段会被当作存在：已改为要求自有属性并补测。
    - getter 场景未被测试：已补测。
    - “不构造场景”用例无法证伪：已删除。
    - 多个错误同时存在时，报告哪一个取决于键序：spec 没有要求先后顺序，未改。
  - simplify：
    - 已采纳：合并 mover/marker 的重复坐标读取，改用模块级数值规则；为负向用例表引入构造 helper。
    - 未采纳：抽取共享的测试 helper（需要改动 P1-02 测试文件，超出范围）；构造时的二次复制（恢复很少发生，开销可忽略）；为 replay 导出校验 helper（留到 05 实际需要时再做）。
