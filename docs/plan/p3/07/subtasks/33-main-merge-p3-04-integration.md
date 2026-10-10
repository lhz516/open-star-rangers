---
type: plan
status: active
phase: P3
task: "07"
subtask: "33"
updated: 2026-10-10
---

# 33 — 合并 main 后接入 P3-04 的 Runtime、Session 与工具

**契约来源：** [spec](../spec.md) 的 S-01、S-02、AC-01、AC-02、AC-17；P3-02 spec 的 [CR-01](../../02/spec.md#cr-01-世界创建输入与静态规则数据d-01)（世界创建与录制的规则输入）、[CR-06](../../02/spec.md#cr-06-领域事件与次序d-01)（新领域事件）、[CR-12](../../02/spec.md#cr-12-projection-与-render-stated-01)。
**依赖：** 12, 16。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 背景

协调者在执行中新增本项（2026-10-10，依用户对新增解除阻塞子任务的预先授权，不需审阅）。P3-04（Runtime、Session 与 UI）已快进合入 `main`，并删除了 P1 的合成演示。P3-06 已把 `main` 合并到它的分支，并在其子任务 24 中让 P3-04 的调用者接入 P3-06 的契约（`craftInfo` 等）。本分支此后再合并 P3-06 分支时，P3-04 的 `createWorld`、录制与 replay 调用者会缺少 P3-07 新增的规则输入，事件与读模型的消费者也需要接上。本项完成这次合并与接入，使本分支与 `main` 的差距不再扩大。

## 工作范围

- **合并：** 在 worker 分支上把 `p3-07-weapons-damage-spec` 当前的 HEAD 与 `p3-06-flight-motion-spec` 合并（`git merge --no-ff`），在 worker worktree 中解决冲突，并保留双方的改动。合并前后都核对 P3-06 的已有决定（参照其子任务 24 的做法与提交 `fb6ea0b`）。
- **接入 P3-07 的契约：** 参照 P3-06 子任务 24 接入 `craftInfo` 的路径，使 P3-04 的任务输入、任务所有者、Runtime、Session、事件总线、开发工具 UI、`tools/replay-check.ts` 与浏览器 replay 端到端测试，从同一已验证的资源包读取并传入 CR-01 的规则输入（`debrisParameters`、`projectileVisuals`、`explosions`、`explosionAnimations`、`models` 按 CR-01 的实际字段）。P3-07 的新领域事件与读模型字段，在现有消费者中按已有约定显示或透传，不新增玩法 UI。
- **范围之外的发现：** Runtime 或 UI 中需要新行为（例如开火输入、HUD）的，不在本项实现，交 P3-05、P3-13 等的交接（记入完成证据，由 28 写入交接）。
- **测试：** 更新受影响的单元测试与测试辅助；`pnpm check` 通过。若浏览器 replay 端到端测试受影响，按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 运行 `pnpm` 中已有的 e2e 命令，并记录结果。
- **提交方式：** 合并提交与接入改动作为一个合并提交（解决冲突与接入同在其中），提交前把 worker 分支重新建立在 goal 分支的最新 HEAD 之上（以最新 HEAD 重做合并并应用接入改动），使协调者可以直接合并。协调者以 `git merge` 集成本项（不用 cherry-pick），并在执行记录中注明。

## 不包含

- 战斗玩法的 UI、输入绑定与画面（P3-05、P3-12、P3-13）。
- P3-07 规则本身的改动（13 至 22）。若合并暴露 Core 规则的冲突，报告协调者，不在本项改写规则。

## 关键文件与契约

- P3-06 的子任务 24（提交 `fb6ea0b`）：`src/app/resources/mission-input.ts`、`src/app/mission/mission-owner.ts`、`src/app/runtime/game-runtime.ts`、`src/app/runtime/game-event-bus.ts`、`src/app/session/game-session.ts`、`src/ui/dev/*`、`src/ui/game/game-session-bridge.ts`、`tools/replay-check.ts`、`e2e/browser-replay.spec.ts` 及相邻测试。
- 12 的 `src/core/world/rule-data.ts` 与 `createWorld` 的输入；CR-01 的字段清单。
- [源码结构](../../../../engineering/source-structure.md)中 P3-04 的合成演示退役记录。

## 写入范围

- `src/app/**`：任务输入、任务所有者、Runtime、Session 与事件总线的接入。
- `src/ui/**`：开发工具与游戏会话桥的接入。
- `src/workers/**`：任务场景测试的接入。
- `e2e/**`：浏览器 replay 的接入。
- `tools/replay-check.ts`、`tools/replay-check.test.ts`：replay 核对的接入。
- `src/core/projections/projection.ts`：P3-06 的 `motionPlayer` 经移动块联合收窄为受操纵的块（与 `craftMovement` 的处理相同）。
- `src/core/replay/budget.test.ts`：P3-06 的容量测试适配 CR-03 的联合与 CR-02 的战斗状态（P3-06 的断言只针对其自身的项）。
- `src/core/world/create-world.ts`、`src/core/world/create-world.test.ts`：导出 `instantiableModelIds`，由 Core 给出 CR-01 所需的可实例化模型集合，不改变 `initialWorldState`。
- `src/original-data/conversion/production-rule-data.test-support.ts`：生产结构的合成光盘夹具满足 CR-01 的检查（DEBRIS 记录数、挂点链、炮 +0x14），与 P3-06 子任务 24 的同类修改一致。
- `src/core/projections/combat.test.ts`：合并 P3-06 的运动组后 `flight.motion` 的断言。
- `docs/engineering/README.md`、`docs/engineering/modules/app.md`、`docs/engineering/modules/ui.md`、`docs/guides/tools.md`：P3-04 的接入点、事件与 replay 核对的文档同步（与 P3-06 子任务 24 更新的同一组文档）。

合并本身带入的 P3-06 与 `main` 的改动不计入写入范围；协调者拥有的 `docs/plan/p3/tasks.md` 若有合并冲突，按协调者给出的文本解决；在上列之外需要为解决冲突而修改的路径，先发 scope-request。

## 验收标准

- [ ] 本分支已合并 `p3-06-flight-motion-spec` 的当前 HEAD（含 `main`），冲突的解决保留了双方的决定。
- [ ] P3-04 的世界创建、录制与 replay 调用者都传入 CR-01 的规则输入，且与 Core 从同一资源包读取；没有用占位或空数据冒充规则输入。
- [ ] `pnpm check` 通过；受影响的 e2e 已运行并记录结果，或写明未受影响的依据。
- [ ] 需要新玩法行为的发现已记入完成证据，交给相应任务。

## 验证方法

- `pnpm check`；必要时按 browser-testing 运行已有的浏览器 replay 端到端测试。
- 协调者集成后在合并结果上再运行 `pnpm check`。

## 完成证据
