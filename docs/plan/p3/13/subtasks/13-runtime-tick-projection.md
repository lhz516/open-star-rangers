---
type: plan
status: active
phase: P3
task: "13"
subtask: "13"
updated: 2026-10-28
---

# 13 — Runtime 保留逐 tick projection

**契约来源：** [spec](../spec.md#共享契约修订d-01) 的 S-01，AC-01/03。
**依赖：** 08。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- `TickOutput` 保留现有 `#tick` 已提取的冻结 projection 引用，同 tick/clock/render 一致，不额外复制世界。
- 0 tick 空批次、至多 5 项、过场/完成截断、录制容量停止成功前缀、Core/读模型失败按现有规则交付。
- 保留先全部模拟、Event Bus、再帧消费者的顺序；同步现有批次夹具与消费者测试。

## 不包含

不改变固定步长、游戏命令顺序、两份 Render State 插值或 UI 采样，不实现驾驶舱消费者。

## 关键文件与契约

- [game-runtime.ts](../../../../../src/app/runtime/game-runtime.ts)、[game-session.ts](../../../../../src/app/session/game-session.ts)。
- [game-runtime-outputs.test.ts](../../../../../src/app/runtime/game-runtime-outputs.test.ts)、[game-session-presentation.test.ts](../../../../../src/app/session/game-session-presentation.test.ts)。

## 写入范围

- `src/app/runtime/*.ts`：TickOutput 与批次/故障测试。
- `src/app/session/*.ts`：原序转交与夹具测试。
- `src/render/flight/**/*.test.ts`：既有输出夹具同步。
- `src/render/flight/**/*.test-support.ts`：同 tick projection 夹具。
- `docs/engineering/modules/app.md`：新输出字段。

## 验收标准

- [x] 各输出持有对应 tick projection，帧末不倒填旧 tick；对象引用可验证未重提取。
- [x] cut/失败/容量前缀/0 tick 行为完整，事件不重复。
- [x] P3-12 既有帧批次与回放测试保持通过。

## 验证方法

`pnpm test -- src/app/runtime src/app/session src/render/flight`、`pnpm check`；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 只保留既有引用，不新增通用事件溯源框架。

## 完成证据

- **实现：** [game-runtime.ts](../../../../../src/app/runtime/game-runtime.ts) 的 `TickOutput` 增加 `readonly projection: Projection`；`#tick` 把该次成功 step 后已取得的 `this.#world.projection()` 原样放进同一冻结项（与 `render`、`tick`、`clock` 同源），不再次提取、不复制。批次构造、故障路径、截断、容量停止与“全部模拟 → Event Bus → 帧消费者”次序未改；会话仍原样转交 `report`（[game-session.ts](../../../../../src/app/session/game-session.ts) 无需修改），两份 Render State 插值不变，没有 tick 中途回调。
- **Runtime 测试：** [game-runtime-outputs.test.ts](../../../../../src/app/runtime/game-runtime-outputs.test.ts) 对 0、1、5 tick 与 `capped` 帧断言每项 `projection.clock.tick/clock` 与 `tick/clock`、`render` 一致、项内全部冻结、各项 projection 互不相同、最后一项与 `projection()` 为同一对象；下一帧不改动旧报告中的 render/projection 引用；监听器在帧后只看到帧末 projection（即最后一项），各项仍保留各自 tick（不倒填）。[game-runtime-fault.test.ts](../../../../../src/app/runtime/game-runtime-fault.test.ts) 以注入取得第 3 次 `projection()`/`renderState()` 的返回对象，断言 `outputs[2]` 持有同一对象、5 tick 帧恰好提取 5 次（未重提取）；录制容量停止只交 tick 1–2 前缀、最后一项 projection 即 `projection()`；既有的 projection/Render State 提取故障用例仍断言抛 `faulted`、无交付。[transition](../../../../../src/app/runtime/game-runtime-transition.test.ts) 与 [completion](../../../../../src/app/runtime/game-runtime-completion.test.ts) 截断断言截断 tick 的 projection 即 `projection()`、前缀 tick 为 1–3。事件不重复沿用 `expectSameDeliveries`。
- **会话与夹具：** [game-session-consumers.test.ts](../../../../../src/app/session/game-session-consumers.test.ts) 断言帧消费者收到的 `outputs` 逐项 projection tick 为 1–3、最后一项与会话帧的 `projection` 为同一对象，且仍在 Event Bus 之后。[flight-run.test-support.ts](../../../../../src/render/flight/renderer/flight-run.test-support.ts) 新增 `projectionOf`（只含与 Render State 一致的 clock 的替身）与 `tickOutput`，`fakeRun().deliver` 交出带同 tick projection 的 `TickOutput` 形状项，帧的 `projection` 为最后一项的（原为 null）；`src/render/flight` 下既有测试无需改动即通过。
- **检查：** `pnpm typecheck` 通过；`pnpm test -- src/app/runtime src/app/session src/render/flight` 通过（397 个文件，10874 项）；`pnpm check`（TypeScript + ESLint + Vitest + 生产构建）通过（397 个文件，10874 项；仅既有的 chunk 体积警告）。P3-12 既有帧批次、`game-session-presentation`、`game-session-replay` 与录制测试全部通过。未运行 `e2e/flight-scenes.development.spec.ts`（本子任务未要求浏览器检查；`fakeRun` 改动只为夹具补字段，渲染器不读取 projection 字段）。
- **rubber-duck：** 以只读 code-review 代理担任，对照 P3-04“帧后同 tick projection”与 P3-12 故障矩阵、本子任务验收审查完整 diff，结论“无发现”。
- **simplify：** 对本 diff 自行按复用/简化/效率/层级四个角度检查：仅合并 outputs 测试中重复的长度守卫并更正注释；`projectionOf` 不复用 `scene.test-support.ts` 的不透明 `PROJECTION`，因为需要逐 tick 不同且 clock 一致的对象。未新增通用框架。
- **文档影响：** 更新 [app.md](../../../../../docs/engineering/modules/app.md) 的帧后同 tick projection 一条（`updated: 2026-10-28`）。P3-04 spec 已由 08 定稿，无需改；STATUS 与 tasks.md 无需变化。无原版事实或 `U-###` 变化。
