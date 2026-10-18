---
type: plan
status: active
phase: P3
task: "12"
subtask: "25"
updated: 2026-10-17
---

# 25 — 飞行画面浏览器回归

**契约来源：** [spec](../spec.md) 的 S-02、AC-22（浏览器部分）；AC-02 至 AC-16、AC-23 的浏览器部分；[验证策略](../spec.md#验证策略)。
**依赖：** 23, 24, 34。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)，用合成任务包经正式流程进入飞行；按验收矩阵扩展合成内容（光照方向、受击、星云方向不对称图案、爆炸、碎片、Warp），不读原版文件。
- 读取实际绘制缓冲或经验证的截图链，在指定位置断言独立预期的颜色与掩码：三维内容（AC-07）、受击闪烁（AC-08）、星云（AC-09）、弹丸导弹碎片（AC-10）、精灵（AC-13）、闪光（AC-14）、合成与在制提示（AC-16）；“画布存在”“非黑像素”“调色板成员”只作辅助。
- Warp：用 P3-09 已有的开发命令入口执行一次实际 Warp 并读回（AC-15）；被毁视角：在隔离测试入口用合成状态驱动 14 的相机并读回（AC-06）。
- 生命周期：resize 与设备像素比（AC-05）、暂停与原生页面隐藏、重试、包替换、上下文丢失与 WebGL 不可用（AC-03）、资源平衡与 GPU 计数（AC-02）、网络审计与生产 CSP。
- 记录本机 Chrome 的帧耗时，不设阈值。缺少必需能力时记录未验证并换允许的本机路线，不跳过后宣称通过。

## 不包含

- 真实内容与原版对照（26、27）。

## 关键文件与契约

- 现有：[e2e/](../../../../../e2e/)、[resource-balance.ts](../../../../../e2e/support/resource-balance.ts)、[import-scenarios.test-support.ts](../../../../../src/workers/import-scenarios.test-support.ts)、[synthetic-content.test-support.ts](../../../../../src/content/synthetic-content.test-support.ts)、[本地浏览器 runner](../../../../engineering/README.md#本地浏览器-runner)。

## 写入范围

- `e2e/**`：飞行画面用例与支持代码。
- `src/workers/import-scenarios.test-support.ts`、`src/workers/synthetic-import.test-support.ts`：合成任务包扩展。
- `src/content/synthetic-content.test-support.ts`、`src/content/**/*.test-support.ts`：合成内容扩展。

## 验收标准

- [ ] AC-02 至 AC-16 与 AC-23 的浏览器部分各有独立预期的像素或 DOM 断言与证据（含闪光平移与星点、速度尘埃）。
- [ ] AC-22（浏览器部分）：resize 与像素比、暂停与隐藏、重试、包替换、上下文与不可用、资源平衡、网络审计与生产 CSP 通过；帧耗时已记录。
- [ ] 既有 E2E 不回归；`pnpm check` 通过。

## 验证方法

- 既有本地 Playwright runner；按 browser-testing 操作并在完成证据中记录命令、浏览器版本与结果。

## 完成证据
