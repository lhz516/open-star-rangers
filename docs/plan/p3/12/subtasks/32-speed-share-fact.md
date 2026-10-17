---
type: plan
status: active
phase: P3
task: "12"
subtask: "32"
updated: 2026-10-17
---

# 32 — 速度份额事实（D-01 补充 FS-12）

**契约来源：** [spec](../spec.md) 的 S-01、S-15、AC-01、AC-23；[星点与速度尘埃](../spec.md#星点与速度尘埃)的“输入（D-01 补充，FS-12）”；[P3-02 的 P3-12 契约修订](../../02/spec.md#p3-12-的契约修订d-01)。
**依赖：** 10, 30。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 定稿：按 30 完成证据中的推荐定稿，在 [P3-02 spec](../../02/spec.md) 的 P3-12 契约修订中加入 FS-12（`RenderState.speedShare`：整数 ≤ 100，在 tick 末取样，各视角与被毁视角各阶段的公式；由当前状态推导，不新增持久状态或快照字段；玩家记录校验收紧为 trunc(+0xB8) ≥ 1），并写入审批记录：用户 2026-10-17 批准方向并授权协调者按推荐方案定稿（见本任务 [spec 审批](../spec.md#审批)）。同步 [core 模块说明](../../../../engineering/modules/core.md)的契约部分。
- 实现：在 Core 的 Render State 投影中给出 FS-12，并按推荐收紧相应内容校验。RULES_VERSION 与快照格式相对集成基线只各递增一次：10 已递增，本项不再递增，只核对（Render State 为读模型，不进快照）。
- 测试：各视角（F1 等、Warp 公式、无玩家或无相机函数为 0）与被毁视角各阶段（爆炸前取速度 30、有效跟随、跟随实体离表为 0）的取样与份额边界；校验收紧的拒绝用例；玩法字段与 RNG 抽取不变的回归。

## 不包含

- 速度尘埃的绘制（31）。

## 关键文件与契约

- 10 实现的 Render State 增量；30 的完成证据与 `local/research/p3-12/stars-dust/findings.md`。

## 写入范围

- `src/core/**`：FS-12 的投影、校验与测试。
- `docs/plan/p3/02/spec.md`：FS-12 与审批记录。
- `docs/engineering/modules/core.md`：FS-12 的契约部分。
- `src/workers/synthetic-import.test-support.ts`、`src/workers/mission-scenarios.test.ts`：合成玩家记录的 +0xB8 满足收紧后的校验。

## 验收标准

- [x] FS-12 已写入 P3-02 spec 并有审批记录，早于实现提交。
- [x] Core 按 FS-12 给出速度份额，覆盖各视角与被毁视角各阶段；没有新的版本递增；玩法与 RNG 不变。
- [x] `pnpm check` 通过。

## 验证方法

- Node 测试；文档审阅。

## 完成证据

- **定稿（AC 1）：** [P3-02 spec](../../02/spec.md) 新增 [FS-12](../../02/spec.md#fs-12-速度份额d-01-补充)（`RenderState.speedShare`、A/W 两个公式、按 tick 结束时视角与子模式的取值表、取样点、派生不持久、不递增版本、MW-01 检查 4 的 +0xB8 收紧为 trunc(+0xB8) ≥ 1、被排除的方案与交接），该节的编号说明与批准状态随之更新；文末[审批](../../02/spec.md#审批)新增 2026-10-17 补充，引用用户原话“批准方向；30 定稿字段后由协调者按推荐方案写入，不再问我”，并记录协调者按该授权接受 30 的推荐定稿。实现时按原版写明 `FISTP` dword（超出 i32 为 −2³¹）与上限 100 之后的 i16 存储：速度不为负且 v × 100 在 i32 之内时为 0–100，极端输入可回绕到 100 以上；协调者 2026-10-17 接受这一精确化（方案 a），已写入 FS-12 的“类型与单位”与审批记录。FS-05、FS-08 没有“不公开速度”的说法，不需改动。文档与实现在同一提交中（协调者允许）。
- **实现（AC 2）：** [speed-share.ts](../../../../../src/core/projections/speed-share.ts) 的 `cameraSpeedShare`（A）、`warpSpeedShare`（W）与 `speedShare(world)`，由 [render-state.ts](../../../../../src/core/projections/render-state.ts) 的 `renderWorld` 给出 `speedShare`；B 取玩家实体种类位所绑定记录的 +0xB8（与 Warp 步相同）；0x11 的子模式 ≠ 8 读取为 `invariant-violated`（`render.speed-share-sub-mode`）。[craft-info-input.ts](../../../../../src/core/world/craft-info-input.ts) 的 `checkPlayerWarp` 由 `atB8 > 0` 收紧为 `atB8 >= 1`。没有新增持久状态、快照字段或事件；`RULES_VERSION` 8、快照格式 7、replay 格式 3 不变。
- **测试：** [speed-share.test.ts](../../../../../src/core/projections/speed-share.test.ts)（37 例）：A 以 trunc(B) 为除数、W 以 B 为除数（32/64.75 → 50 与 49；F(0.9)/1.5 → 89 与 59）、v × 100 先截断（F(0.64)）、上限 100、无下限（−50/−49）、−0 归 0、超出 i32 的整数不定值与 i16 低 16 位（2²⁵/64 → 0、2²⁵/3 → 0x5556、−650 → 536、−2000 → −3392）、与独立实现的正负速度扫描一致；没有玩家实体或其 ID 已离表为 0，0xC–0x10、0x12 为 A，没有移动块为 0，视角 1 为 W，没有相机函数的 12 个视角为 0，0x11/8 爆炸前 A(30) = 46、跟随实体在表中为 A(其速度)（25、100）、离表为 0，0x11 的子模式 0–7 与 9 故障，B 取玩家实体种类的记录，读取不改世界。[render-state.test.ts](../../../../../src/core/projections/render-state.test.ts) 与 [create-world.test.ts](../../../../../src/core/world/create-world.test.ts) 的整份 Render State 加入 `speedShare`；后者新增 0 < +0xB8 < 1（含 2⁻¹⁴⁹）的拒绝用例，接受用例改为 +0xB8 = 1。[map-warp-replay.test.ts](../../../../../src/core/replay/map-warp-replay.test.ts) 在整段地图/Warp 运行的每个 tick 以快照中的玩家速度独立核对份额（0xC 与 1 中都出现 > 1 的取值，地图中为 0）。
- **玩法与 RNG 回归：** [replay.test-support.ts](../../../../../src/core/replay/replay.test-support.ts) 的 `gameplayDigest` 每 tick 另读一次 Render State；地图/Warp、战斗、AI 三个摘要不变（`8231182cf57bf5fc`、`fba1bd8161cf249f`、`2e249be7a5836a1d`）。通讯运行的夹具原以玩家 +0xB8 = 2⁻¹⁴⁹ 使其不动，收紧后被拒绝，改为 +0xB8 = 1 且 +0x88 = 2³⁰（能量限制的最高速度为 0，仍不动）；在基线 `3be64fe4`（FS-12 之前的代码）的临时 worktree 中对同一改动的夹具算出摘要 `8d83ea3256bebe8f`，与本实现相同，测试改用此值；临时 worktree 已删除。同理，经协调者扩大写入范围（goal 分支 `d73d10ab`），[synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 的停靠夹具改为玩家 +0xB8 = 1、+0x88 = 2³⁰（`DOCKING_PLAYER_AT88`），[mission-scenarios.test.ts](../../../../../src/workers/mission-scenarios.test.ts) 同步断言，停靠场景在四个种子下照常完成。
- **检查（AC 3）：** 针对性测试（`src/core/projections`、`src/core/replay`、`src/core/world/create-world.test.ts`、`src/workers`）通过；`pnpm check` 通过（类型检查、ESLint、Vitest、生产构建）。改动的三份文档的相对链接与锚点全部有效（本地脚本按 GitHub 标题锚点规则）。
- **rubber-duck：** 一次审阅。采纳：（1）停靠夹具违反收紧后的校验（经范围请求修复，见上）；（2）测试中 W 的独立期望多做了一次上限，改正并加入 i16 回绕到 100 以上的负速度用例；（3）新增 B 取玩家实体种类记录的用例。审阅指出 i16 存储可使份额大于 100，与“至多 100”的措辞不符，已交协调者裁定（接受精确化）。
- **simplify：** 去掉重复的 −0 规范化（i16 存储已归 0）、`chop32` 的范围判定改为 `| 0`、测试的独立期望改用 `Int16Array`、合并重复的记录替换辅助与冗余断言。未采纳：把 AI 规则中三份私有 `chop32` 合并为共享导出（超出本项改动范围）；去掉 `gameplayDigest` 中每 tick 的 Render State 读取（它是本项的回归证据）。
- **文档影响：** [core 模块说明](../../../../engineering/modules/core.md)的 Render State 一节新增速度份额条目，世界创建一节的 +0xB8 条件改为 ≥ 1；原版事实已由 30 写入 `docs/original/`，本项不新增原版事实，unknowns 不变；STATUS 与阶段 `tasks.md` 不需要改动（阶段摘要、优先级与阻塞不变）；工程与操作指南不受影响。
