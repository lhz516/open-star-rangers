---
type: plan
status: active
phase: P1
task: "03"
subtask: "02"
updated: 2026-10-02
---

# 02 — 版本化快照、规范文本与状态哈希

**契约来源：** [spec](../spec.md) 的 S-01、S-02、S-06；AC-01、AC-02（规范文本部分）；“快照”“规范文本与状态哈希”两节，数据模型中的“合成快照”“规范文本”“状态哈希”，持久化与兼容，技术决定 1、2、7、8。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新增 `src/core/synthetic-snapshot.ts`，内容如下。
  - **格式常量：** `'osr-synthetic-snapshot'` 与版本 `1`。
  - **快照类型：** `{ format, version, state }`，其中 `state` 即 P1-02 的 `SyntheticSceneState`，从 [synthetic-scene.ts](../../../../../src/core/synthetic-scene.ts) 以 `import type` 导入，不在运行时导入该文件。
  - **取快照：** 自由函数，参数为 `SyntheticScene`，基于 `inspect()` 构造快照。结果深冻结、每次新建，与场景内部及其他读取结果隔离；读取不改变 tick、状态、RNG 或 ID 分配器。
  - **规范文本：** 自由函数，按 spec 数据模型固定的字段顺序输出无空白紧凑 JSON：顶层依次为 `format, version, state`；`state` 依次为 `scenario, tick, tickRateHz, seed, rngState, nextEntityId, mover{id, position{x,y,z}}, marker`，`marker` 为 `null` 或 `{id, position{x,y,z}}`。
    - 字段顺序与调用者对象的键顺序无关。
    - 数值按 `JSON.stringify` 的 ECMAScript 规则书写，`-0` 写作 `0`；全文只含 ASCII。
  - **状态哈希：** 规范文本的 FNV-1a 64（01），同时提供针对快照和针对场景的入口，场景入口等价于先取快照再求哈希。
- 不修改 `SyntheticScene` 接口，也不改变 P1-02 的现有行为。
- 新增 `src/core/synthetic-snapshot.test.ts`：
  - **AC-01：**
    - seed 0 初始状态与“添加一个标记后”两个场景的完整快照：格式、版本与全部状态字段都与 `inspect()` 精确相等。
    - 写入快照的嵌套字段抛 `TypeError`，且场景与其他读取结果不变。
    - 读取快照或哈希前后，`inspect()` 完全相同。
    - 快照经 JSON 往返后与原快照相等。
  - **AC-02（规范文本）：**
    - seed 0 初始状态的规范文本与测试中手写的字面量完全相同。
    - 有标记状态使用测试中手写的快照数据（坐标取易读的有限值），其规范文本同样与手写字面量完全相同。
    - 键顺序被打乱但值相同的快照对象，得到相同的规范文本与哈希。
    - 含 `-0` 的数值写作 `0`。
    - 哈希为 16 位小写十六进制字符串，且等于 01 函数对规范文本的结果。

## 不包含

- 从快照恢复场景及恢复校验（03）。恢复后键序无关的断言由 03 补测。
- 录制、replay、比对（04–06）；任何持久化或 I/O。

## 关键文件与契约

- 计划新增 `src/core/synthetic-snapshot.ts`、`src/core/synthetic-snapshot.test.ts`（尚不存在）。
- 复用 [synthetic-scene.ts](../../../../../src/core/synthetic-scene.ts) 的 `SyntheticScene`、`SyntheticSceneState` 类型，以及 01 的 `src/core/fnv1a64.ts`。

## 验收标准

- [x] AC-01：两种场景的快照完整且精确；快照深冻结、与其他读取隔离、读取无副作用；JSON 往返后相等。
- [x] AC-02（规范文本）：两个手写字面量完全匹配；键序无关；`-0` 写作 `0`；哈希格式正确，且等于规范文本的 FNV-1a 64。
- [x] `SyntheticScene` 接口与 P1-02 现有测试未改动；`synthetic-snapshot.ts` 不在运行时导入 `synthetic-scene.ts`。
- [x] `pnpm exec vitest run src/core` 与 `pnpm check` 通过。

## 验证方法

- 运行上述命令；对实现 diff 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理后重跑。
- 规范文本的期望值必须在测试中手写，不能由被测函数生成。
- 无浏览器、实机或原版对照。

## 完成证据

- **实现：** [synthetic-snapshot.ts](../../../../../src/core/synthetic-snapshot.ts) 导出：
  - 常量 `SYNTHETIC_SNAPSHOT_FORMAT`、`SYNTHETIC_SNAPSHOT_VERSION` 与类型 `SyntheticSnapshot`；
  - `takeSyntheticSnapshot(scene)`：基于 `inspect()`，每次新建并深冻结；
  - `canonicalSnapshotText(snapshot)`：按 spec 字段顺序重建对象后用 `JSON.stringify`，`-0` 写作 `0`；
  - `hashSyntheticSnapshot(snapshot)` 与 `hashSyntheticScene(scene)`：规范文本的 `fnv1a64`。
  
  该文件只以 `import type` 引用 `synthetic-scene.ts`；`synthetic-scene.ts` 与 `SyntheticScene` 接口未改动。
- **测试：** [synthetic-snapshot.test.ts](../../../../../src/core/synthetic-snapshot.test.ts)，共 12 项。
  - **AC-01：**
    - seed 0 初始快照与完整字面量相等；有标记场景的快照与 `{format, version, state: inspect()}` 严格相等，并含标记、RNG 状态与分配器。
    - 两次读取的根对象与每个嵌套对象都不是同一对象，且全部冻结；写入嵌套字段或 `version` 抛 `TypeError`，场景与另一份读取不变；场景继续 step 后，已保留的快照不变。
    - 与不读取快照的对照场景并行运行三个 tick，读取快照和哈希前后 `inspect()` 相同，事件与最终状态一致。
    - JSON 往返后相等。
  - **AC-02（规范文本）：**
    - seed 0 初始状态与一个手写有标记快照的规范文本，与测试中手写的字面量完全相同。
    - 各层键序打乱后，规范文本与哈希相同。
    - `-0` 写作 `0`，文本不含 `-0`。
    - 哈希符合 `^[0-9a-f]{16}$`，且等于 `fnv1a64(手写字面量)`；场景哈希等于其快照哈希。
- **检查：** `pnpm exec vitest run src/core` 通过；最终 `pnpm check` 通过（typecheck、lint、10 个测试文件共 185 项、build）。
- **审阅：** rubber-duck 指出隔离测试未覆盖全部嵌套对象，也未验证场景前进后快照不变，已补测。simplify 去掉了重复的 seed 0 用例和重复的哈希断言。未采纳的建议有两条：JSON 往返属 AC-01 必需，保留；增量哈希对很小的状态不值得做。
