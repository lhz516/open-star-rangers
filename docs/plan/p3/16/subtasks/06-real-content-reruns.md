---
type: plan
status: active
phase: "P3"
task: "16"
subtask: "06"
updated: "2026-10-30"
---

# 06 — 修复后真实内容复跑

**契约来源：** [spec](../spec.md) 的 S-04、AC-07、AC-08（复跑部分）、AC-12，以及[技术决定](../spec.md#技术决定) 3 中“真实内容运行”一项。
**依赖：** 04、18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **方法：** 在含 04 修复的候选上，按 [P3-15/07](../../15/subtasks/07-real-content-runs.md#完成证据) 的私有方法，在隔离的本机 Chrome 中运行。使用新建、用后删除的临时 profile，经正式导入页导入 `local/StarRang/cd/` 镜像。
- **配置与运行组合：** 按 [P3-01 的闭环运行](../../01/spec.md#闭环运行)，group 0 / slot 1、原始难度 19：
  - 成功运行：覆盖 L-01 至 L-10，再经重试到 L-02；
  - 失败运行：经正常玩法到失败终态，再经重试到 L-02；
  - 两次运行合计至少一次带僚机、一次不带。

  不注入终态，不用强制胜负、改写内存或自动驾驶后门。
- **记录：** 内容身份（与 05 一致或写明差异）、提交、构建与运行时、种子、输入路径、结果、重试；并与 [B-003](../../../../original/behavior/B-003-campaign-flow.md)、[B-005](../../../../original/behavior/B-005-campaign-rescue.md) 及 P3-11 的条件核对。
- **失败处理：** 运行若遇到规则差异或故障，保留证据并交协调者新增修复项，不在本项修改产品代码。

## 不包含

- 原版 DOSBox-X 运行；合成 E2E（09）。

## 关键文件与契约

- [P3-15/07](../../15/subtasks/07-real-content-runs.md)、[本地导入指南](../../../../guides/local-import.md)、[browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)。

## 写入范围

- `local/research/p3-16/real-content/**`：私有脚本、记录与截图（被忽略）。

## 验收标准

- [ ] AC-08、AC-12：最终候选上的成功与失败运行各自到达终态并完成重试，配置与 P3-01 组合一致，至少一次带僚机、一次不带。
- [ ] 内容身份、种子、输入路径与结果已记录，并与 B-003、B-005 和 P3-11 一致；不一致已列为问题。
- [ ] 没有使用用户的 Chrome profile；自有进程、端口与临时 profile 已清理；仓库没有原版内容。

## 验证方法

- 本机 Chrome 加 Playwright（经 CDP）或 Computer Use，按 browser-testing 核验真实观测；输出只在 `local/`。

## 完成证据
