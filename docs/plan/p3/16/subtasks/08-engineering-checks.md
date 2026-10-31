---
type: plan
status: active
phase: "P3"
task: "16"
subtask: "08"
updated: "2026-10-30"
---

# 08 — 工程与 Python 检查

**契约来源：** [spec](../spec.md) 的 S-03、AC-03、[技术决定](../spec.md#技术决定) 2 与 9。
**依赖：** 04、18。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在含修复的候选上运行：
  - `pnpm check`；
  - `python3 -B -m unittest discover -s tools/ghidra -p 'test_*.py'`；
  - `python3 -B -m unittest discover -s tools/baseline -p 'test_*.py'`。
- 记录：提交；类型检查、lint、Vitest 的文件数与用例数；构建；Python 版本；各退出码；本次构建的 `dist` 指纹（按 P2-13/04 的算法）。
- **失败处理：** 保留首次失败与原因。只有查明的环境原因才可不改代码、配置与断言重跑整条命令。产品或测试缺陷交协调者新增修复项。

## 不包含

- E2E（09）；合规（10）。

## 关键文件与契约

- [package.json](../../../../../package.json) 的脚本；[工程约定](../../../../engineering/README.md#命令)。

## 写入范围

- `dist/**`：`pnpm check` 的构建（被忽略）。

## 验收标准

- [ ] AC-03：`pnpm check` 与两组 Python 测试都实际运行并通过，记录完整；没有沿用旧的测试数。
- [ ] 失败与重跑符合技术决定 9。

## 验证方法

- 命令输出与退出码；构建清单的 SHA-256。

## 完成证据
