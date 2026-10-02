---
type: plan
status: active
phase: P1
task: "02"
subtask: "03"
updated: 2026-10-01
---

# 03 — Step 行为：移动、标记命令与事件

**契约来源：** [spec](../spec.md) 的 S-02、S-03、S-04、S-05、S-06；AC-02、AC-03、AC-04、AC-05（消费部分）、AC-07、AC-08 与 AC-09（tick 之后部分）、AC-10；“Step 与系统顺序”“标记命令”“RNG”。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 为 `SyntheticScene` 增加 `step(tickInput: TickInput): readonly DomainEvent[]`。签名不接受回调、emit 或订阅者，Core 不保留 tickInput 的引用。每次调用按固定顺序执行：
  1. 本次 tick 号 `n = tick + 1`。
  2. 按数组顺序处理命令，每条命令产生一个事件，`tick = n`，`commandIndex` 为该命令下标：
     - 无标记时 `add-marker`：分配 `nextEntityId` 后加一；依次抽取 X、Y、Z 三次 RNG，坐标为 `-5 + 10r`；添加静止标记；返回 `marker-added`。
     - 已有标记时 `add-marker`：返回 `command-rejected`，reason 为 `marker-already-exists`；不分配 ID，不抽 RNG。
     - 有标记时 `remove-marker`：移除标记；返回 `marker-removed`，带被移除的 ID 与位置副本。ID 不复用，不抽 RNG。
     - 无标记时 `remove-marker`：返回 `command-rejected`，reason 为 `marker-not-found`；状态与 RNG 不变。
  3. mover 的 X 增加 `moveX × 1 / tickRateHz`，Y、Z 保持 0；没有惯性，也不产生移动事件。
  4. 令 `tick = n`，返回本次事件数组（新建并冻结）。
- 业务拒绝不抛错，同 tick 的后续命令与移动照常执行。
- 本子任务只处理类型合法的输入；非法输入与数值守卫由 04 负责。
- 新增 `src/core/synthetic-scene-step.test.ts`：
  - **AC-02：** 空输入推进一个 tick 并返回空数组；在 60 Hz 与 120 Hz 下各运行一秒，moveX 为 -1、0、0.5、1 时 X 分别为 -1、0、0.5、1（绝对误差 ≤ 1e-12），Y/Z 为 0；之后 moveX 改为 0 时立即停止。
  - **AC-03：** 四种状态与命令组合各有精确的事件字段；拒绝前后 `rngState` 与 `nextEntityId` 不变，但 tick 推进、mover 照常移动。
  - **AC-04：** 同一 tick 内 add/add/remove/add 依次为成功、拒绝、成功、成功，`commandIndex` 为 0–3，最终只剩新 ID 的标记，各事件记录当时的 ID 与位置。对照组：已有标记时 remove 在 add 之前；同样的请求分散到多个 tick。
  - **AC-05：** 成功添加恰好抽三次，与直接调用 `nextRandom` 的序列一致；空 tick、拒绝、移除、移动和读取都不改变之后成功添加得到的坐标；覆盖 seed 0、普通种子与上界；所有坐标在 `[-5, 5)`，并用 RNG 可能的最大值 `(2^32 - 1) / 2^32` 验证场景坐标公式仍小于上界；移除后再添加使用新 ID。
  - **AC-07：** 两个独立实例用相同配置和逐 tick 序列，事件、`inspect()` 与两种投影逐 tick 相等；事件经 JSON 往返后不变。
  - **AC-08：** 先保存事件、投影与检查副本，之后运行更多 tick 并增删标记，旧对象不变；写入事件抛 `TypeError`。
  - **AC-09：** 初始、有标记、已移除、同 tick 增删后，UI 与 Render 描述同一组实体，Render 按 ID 升序；读取前后 `inspect()` 完全相同。

## 不包含

- TickInput 结构/范围校验、整批原子性和溢出守卫（04）。
- 暂停、队列、Event Bus、补跑与插值（P1-04、P1-05）；序列化、哈希与 replay runner（P1-03）。
- 旋转、碰撞、真实飞行或战斗规则；任何消费者接线；新依赖。

## 关键文件与契约

- 修改 02 新增的 `src/core/synthetic-scene.ts`：加入 `step()`。
- 计划新增 `src/core/synthetic-scene-step.test.ts`（尚不存在）。
- 复用 01 的 `nextRandom`；事件类型使用 02 已定义的 `DomainEvent`。

## 验收标准

- [ ] AC-02：tick 推进与积分结果符合精确断言和 1e-12 容差。
- [ ] AC-03：四种组合的事件与状态变化精确；拒绝不消耗 RNG 和 ID，tick 与移动照常推进。
- [ ] AC-04：同 tick 序列与对照组证明结果由处理顺序决定。
- [ ] AC-05：只在成功添加时恰好抽三次；非消耗操作不改变后续坐标；三种种子覆盖；坐标在范围内；ID 不复用。
- [ ] AC-07：独立实例逐 tick 一致；事件可 JSON 往返；`step` 没有回调参数。
- [ ] AC-08、AC-09：旧输出不受后续 tick 影响；UI 与 Render 一致且读取无副作用。
- [ ] `pnpm exec vitest run src/core` 与 `pnpm check` 通过；01、02 的测试仍然通过。

## 验证方法

- 运行上述命令；位置用容差比较，其余字段精确比较。
- 对实现 diff 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理后重跑检查。
- 无浏览器、实机或原版对照；合成数值不作保真证据。

## 完成证据
