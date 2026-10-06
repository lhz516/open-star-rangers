---
type: plan
status: active
phase: P2
task: "11"
subtask: "13"
updated: 2026-10-06
---

# 13 — StrictMode、Fast Refresh 与往返

**契约来源：** [spec](../spec.md) 的 S-12、AC-16，以及 AC-01 的往返部分；方法沿用 [P1-08 AC-12](../../../p1/08/spec.md)。
**依赖：** 07, 11。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 开发项目 E2E（测试入口，合成数据）：
  - **首次挂载：** StrictMode 下，至多一个作业持有者、一个查看器画布与一个音频上下文。
  - **作业运行中的编辑：** 保留应用外壳，做至少 3 次可还原、确实重跑目标 effect 的 Fast Refresh 编辑。每次稳定后：旧 Worker 已终止；导入页面能启动新作业。
  - **查看器打开时的编辑：** 同样至少 3 次。每次稳定后：旧画布已断开，旧音频上下文已关闭；新所有者与画布的身份不同于旧的，恰好一个已连接的画布；查看器重新显示当前项并能试听合成音效。
  - **不算替换成功：** 整页重载、只更新 JSX 而不重跑 effect，或画面被清空。
  - **往返：** 菜单、导入、查看器与演示之间往返 3 轮后，监听、观察器、Worker、画布与帧请求都回到基线。
- 每次编辑由测试还原；测试结束后检查工作区没有遗留改动。
- 若发现实现缺口，回到相应子任务（06、07、10、11）修正，并在本子任务记录。

## 不包含

- 生产预览（14）；缓存恢复（12）。

## 关键文件与契约

- 计划新增 E2E 用例；复用 [browser-probes.ts](../../../../../e2e/support/browser-probes.ts)、[joint-resources.spec.ts](../../../../../e2e/joint-resources.spec.ts) 的基线比较，以及 P1-08 用例中可还原编辑的做法。

## 验收标准

- [ ] AC-16：首次挂载、作业运行中与查看器打开时的编辑、往返 3 轮的结果都如上。
- [ ] 替换成功有新旧身份的证据；整页重载等不计入。
- [ ] 测试结束后工作区没有遗留改动；开发项目的相关 E2E 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 运行 `pnpm exec playwright test <新用例> --project=development`。
- 本子任务只新增测试时，不需要 simplify；若修改实现代码，按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)，并运行 `pnpm check`。

## 完成证据
