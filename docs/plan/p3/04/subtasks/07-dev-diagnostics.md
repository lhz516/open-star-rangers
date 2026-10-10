---
type: plan
status: active
phase: P3
task: "04"
subtask: "07"
updated: 2026-10-09
---

# 07 — 开发诊断与录制导出

**契约来源：** [spec](../spec.md) 的 S-07 与[开发诊断](../spec.md#开发诊断)；AC-22，AC-16 的导出部分。
**依赖：** 04, 05, 06。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **DOM-free 模型**（计划新增 `src/ui/dev/`）：
  - 事件日志：订阅运行的全部事件，保留最近 500 条结构化摘要（tick、类型、主要字段、commandId），超出丢最旧项并标记已截断；可清空；新运行清空。
  - 帧统计：最近 120 个 `{ processingMs, ticks, capped }` 样本，给出平均与最大处理时长、tick 数统计与触顶帧数；按 UI 采样频率发布；非法时钟值报告错误，不记 0。
  - 命令编辑：可选择 16 个 Core 命令变体之一并填写其字段，提交前经 `readTickInput` 的规则校验，经正常运行句柄提交，结果进入 06 的命令反馈。
  - 实体与任务状态：点击刷新时读取一次快照，显示 tick、时钟、种子、setupHash、内容身份、任务状态、玩家状态、生成队列摘要与实体列表（ID、种类位、来源、位置、对象状态与活动、被毁标志、放置序号）；名称只显示引用。faulted 时禁用。
- **帧计时接线**（计划新增 `src/app/mission/dev-*.ts`）：开发装配包装会话宿主的帧回调，在同一次有效帧处理的开始与结束读取单调时钟，窗口包含 Runtime 模拟、帧后事件与帧消费者，不含等待下一 rAF 的时间；不另开循环。
- **录制导出：** 在通知边界之外同步取得同一成功 tick 的 `Recording`，序列化为紧凑 JSON，经 04 的文件保存端口保存；文件名只含校验过的 setupHash、uint32 种子与 finalTick；faulted 不提供新导出，stopped 可导出；保存失败不丢弃记录，可重试；提示重开、返回与 HMR 会丢弃未导出的录制。
- **开发面板**（计划新增 `src/ui/dev/MissionDevPanel.tsx`）：原生控件、标题层级、按区块分别订阅，不注册全局键盘监听。生产隔离由 09 在装配时完成（编译期剔除）。
- 随实现编写 Node 测试：模型、帧计时窗口、导出副本、文件端口失败与资源释放；没有诊断消费者时 Core 录制与有诊断时一致。

## 不包含

- 在任务画面中挂载面板与开发/生产装配分支（09）；开发浏览器下载核对（10）；生产产物检查（12）。
- 改变 Core 的录制格式或规则版本。

## 关键文件与契约

- 计划新增：`src/ui/dev/event-log.ts`、`frame-stats.ts`、`command-draft.ts`、`recording-export.ts`、`MissionDevPanel.tsx` 及测试；`src/app/mission/dev-frame-timing.ts` 及测试（文件名可调整）。
- 只读消费：[recording.ts](../../../../../src/core/replay/recording.ts)、[snapshot.ts](../../../../../src/core/replay/snapshot.ts)、[tick-input.ts](../../../../../src/core/contracts/tick-input.ts)；04 的文件保存与时钟端口；05 的所有者登记接口；06 的命令反馈。
- 参照：[SyntheticDevPanel.tsx](../../../../../src/ui/dev/SyntheticDevPanel.tsx) 的面板结构（不复用其合成语义）。

## 写入范围

- `src/ui/dev/**`：计划新增的诊断模型、导出、面板与测试（不改 `SyntheticDevPanel.tsx`）。
- `src/app/mission/dev-*.ts`：计划新增的开发装配帧计时与测试。

## 验收标准

- [ ] AC-22：日志 500/501、帧窗口 120/121、最近结果 10/11 的保留正确；帧处理窗口包含模拟与消费者，不把 rAF 间隔当处理耗时；非法时钟不报告 0。
- [ ] AC-22：导出副本在后续 tick 后不变；保存失败可重试；对象 URL 与临时元素在成功、失败与释放时回收；新运行清空日志；没有诊断消费者时录制一致。
- [ ] 命令编辑的 16 个变体都能构造合法命令，非法字段在提交前拒绝；尚无规则的命令得到带 commandId 的 `not-implemented` 结果。
- [ ] faulted 时禁用快照与导出，stopped 时可导出。
- [ ] `pnpm exec vitest run src/ui/dev src/app/mission` 与 `pnpm check` 通过。

## 验证方法

- Node：注入时钟与文件保存端口的替身，真实会话与合成任务。
- 开发浏览器下载与 Node 核对由 10 完成，生产中不存在由 12 核对；不适用原版对照。

## 完成证据
