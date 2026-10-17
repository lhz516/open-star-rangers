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

## 验收标准

- [ ] FS-12 已写入 P3-02 spec 并有审批记录，早于实现提交。
- [ ] Core 按 FS-12 给出速度份额，覆盖各视角与被毁视角各阶段；没有新的版本递增；玩法与 RNG 不变。
- [ ] `pnpm check` 通过。

## 验证方法

- Node 测试；文档审阅。

## 完成证据
