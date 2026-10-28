---
type: plan
status: active
phase: P3
task: "13"
subtask: "25"
updated: 2026-10-28
---

# 25 — 基地消息桥接与缺省标注

**契约来源：** [spec](../spec.md#缺省与标注) 的 S-12，AC-11/13/20。
**依赖：** 18, 24。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 将18的同一当前来电/消息快照接入基地项目页，队首变化立即发布，其他保持既有React采样；不创建第二队列。
- 完成G-03摘要映射与注入文案，页5短标注、完整消息正文以及未知映射生产反馈。
- 保留游戏输入区、焦点、暂停/退出控制、结构化错误；往返基地/地图不重播。
- 只移除已完成驾驶舱/HUD/地图在制文案；未完成P3-14的音效说明不得顺手删除。

## 不包含

不重做G-05美术、菜单/结果页，不导入CMOV台词或改变radio规则。

## 关键文件与契约

- [BasePage.tsx](../../../../../src/ui/mission/BasePage.tsx)、[MissionShell.tsx](../../../../../src/ui/mission/MissionShell.tsx)、[slice-gaps-copy.ts](../../../../../src/ui/mission/slice-gaps-copy.ts)。
- [game-store.ts](../../../../../src/ui/game/game-store.ts)、[game-session-bridge.ts](../../../../../src/ui/game/game-session-bridge.ts)。

## 写入范围

- `src/ui/mission/*.ts`：文案/视图模型与相关测试。
- `src/ui/mission/*.tsx`：基地/任务壳呈现与反馈。
- `src/ui/game/game-store.ts`：当前消息只读状态。
- `src/ui/game/game-store.test.ts`：状态与发布测试。
- `src/ui/game/game-session-bridge.ts`：共享模型桥接。
- `src/ui/game/game-session-bridge.test.ts`：身份/生命周期测试。
- `src/app/composition/use-mission-owner.ts`：注入文案与桥接订阅。
- `docs/engineering/slice-gaps.md`：G-03/G-05与在制标注。
- `docs/engineering/modules/ui.md`：新读者/错误说明。
- `src/app/composition/cockpit-copy.ts`：24 留下的临时文案注入点，替换为 25 的正式文案（协调者增补）。
- `src/ui/dev/*.ts`、`src/ui/dev/*.tsx`：仅在开发面板显示驾驶舱诊断计数（`messageDrops`、`radarNoiseDropped`，协调者增补）。

## 验收标准

- [ ] 基地能显示完整项目正文，MFD标注不冒充原版台词。
- [ ] 共享队列只有一份，跨视角/重挂/恢复无重复，未知映射可见。
- [ ] 原有输入与焦点不回归，文案准确保留剩余缺省。

## 验证方法

`pnpm test -- src/ui/game src/ui/mission src/app/mission`、`pnpm check`；[browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 的正式像素/DOM回归由27–29完成；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 限桥接和标注。

## 完成证据
