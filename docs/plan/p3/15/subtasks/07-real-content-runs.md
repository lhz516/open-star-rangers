---
type: plan
status: active
phase: "P3"
task: "15"
subtask: "07"
updated: "2026-10-29"
---

# 07 — 本地原版内容的成功/失败与重试

**契约来源：** [spec](../spec.md) 的 S-05、[行为与边界](../spec.md#行为与边界)“私有本地内容的完整任务运行”、[持久化与兼容](../spec.md#持久化与兼容)；AC-07。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在隔离的本机 Chrome 配置文件（不触碰用户现有站点数据）中，经正式导入页从 `local/StarRang/cd/` 的本地光盘镜像导入切片资源包；记录内容身份（包身份、manifest 与来源指纹的截断哈希、切片定义版本）与构建/提交。
- 按所选切片配置（group 0 / slot 1、原始难度 19；成功路径带僚机，失败路径可不带）分别走到成功与失败终态，并各自重试进入新运行。可在开发构建中只读读取状态辅助导航与瞄准，输入只经游戏输入区与页面控件；不写 Core 状态、不用调试结果。
- 核对：结果、总结选择、救援次数与终局分支与 [B-003](../../../../../docs/original/behavior/B-003-campaign-flow.md)、[B-005](../../../../../docs/original/behavior/B-005-campaign-rescue.md) 及 [P3-11/19](../../../../../docs/plan/p3/11/subtasks/19-real-content-check.md)、[P3-11/21](../../../../../docs/plan/p3/11/subtasks/21-comparison-conclusions.md) 的证据相符；涉及时间的比较注明 P3-11 原版样本为 `fixed 40000 cycles`（U-021）。
- 录制、截图、日志与笔记只存于 `local/research/p3-15/real-content/`；公开证据只写判定、计数、截断哈希与链接。

## 不包含

- 合成 E2E（01–04）；修改导入或规则代码；运行原版 DOSBox（只在发现确需补采的原版事实时，由协调者追加修复项）。

## 关键文件与契约

- [本地导入指南](../../../../../docs/guides/local-import.md)、[原版证据指南](../../../../../docs/guides/original-evidence.md)、[package-check.ts](../../../../../tools/package-check.ts)、[replay-check.ts](../../../../../tools/replay-check.ts)（可选的本地重放，只在本机）。

## 写入范围

- `local/research/p3-15/real-content/**`：私有运行记录与录制。

## 验收标准

- [ ] AC-07：成功与失败两种实际流程均到达终态并各自完成重试；内容身份、设置、输入路径与结果已记录，并与 P3-11/B-003/B-005 的证据互相核对。
- [ ] 不一致项作为差异交回责任任务；无法取得时登记阻塞、已尝试途径与恢复条件，不以合成 E2E 替代。
- [ ] 仓库中没有原版内容、截图、录制或解码输出；`pnpm check:original` 通过。

## 验证方法

- 本机隔离浏览器实测（可用 Playwright 驱动本机 Chrome 或 Computer Use）；如录制导出，可在本机以 `node tools/replay-check.ts` 重放核对，结果只存 `local/`。

## 完成证据
