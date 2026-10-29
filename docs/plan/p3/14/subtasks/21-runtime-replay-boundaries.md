---
type: plan
status: active
phase: P3
task: "14"
subtask: "21"
updated: 2026-10-15
---

# 21 — Runtime 录制一致性与模块边界

**契约来源：** [spec](../spec.md#验证策略) 的 S-04、S-10、AC-03、AC-08、AC-13。
**依赖：** 19, 20。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 使用同版本/内容/种子/输入和可控 SessionHost，分别运行声音启用、禁用、锁定/失败、不同结束通知顺序。
- 比较真实 Runtime 执行的输入、事件和检查点，再使用正式 replay 校验，不单独调用无消费者的 replay 充数。
- 覆盖多 tick、暂停/恢复、非连续放置和消费者失败边界；局部声音序列相等只在表现 RNG 与宿主序列固定时要求。
- 将新 DOM-free 模块、无 Core 回写/新循环、render 不反向导入 app、platform 不导入游戏/解析器纳入已有工程边界回归。

## 不包含

- 不加入新玩法或修改随机数规则；暴露的实现缺口回责任项/新增修复项。

## 关键文件与契约

- 现有 [Session 测试](../../../../../src/app/session/game-session-replay.test.ts)、[replay](../../../../../src/core/replay/replay.ts)、[工程边界](../../../../../tools/engineering-boundaries.test.ts)。
- 计划新增 `runtime-integration.test.ts`、`replay.test.ts` 于 flight-audio。

## 写入范围

- `src/app/flight-audio/runtime-integration.test.ts`：正式通知与输入链。
- `src/app/flight-audio/replay.test.ts`：多音频状态一致性。
- `tools/engineering-boundaries.test.ts`：新模块正反边界测试。
- `eslint.config.js`：如现有规则未覆盖，按相同模式增加限定边界。
- `docs/engineering/README.md`：仅在“lint 规则”列表中加入 flight-audio 边界规则的一条（协调者 2026-10-28 扩展）。

## 验收标准

- [ ] 多个音频可用性场景的正式输入/事件/哈希一致，变化回调顺序不影响 Core。
- [ ] 新模块被真实 Node 程序覆盖，违反依赖/宿主/调度规则的负例命中对应诊断。
- [ ] 版本变更和旧记录处理符合 06；未要求生产音效 replay 逐次一致。

## 验证方法

- `pnpm test -- src/app/flight-audio/runtime-integration.test.ts src/app/flight-audio/replay.test.ts tools/engineering-boundaries.test.ts`、`pnpm check`。
- [simplify](../../../../../.agents/skills/simplify/SKILL.md)仅本项测试/边界代码；不需原版文件或浏览器代理结果。

## 完成证据
