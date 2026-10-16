---
type: plan
status: active
phase: P3
task: "14"
subtask: "18"
updated: 2026-10-15
---

# 18 — 声音状态、可信激活与开发日志接线

**契约来源：** [spec](../spec.md#声音状态与开发诊断) 的 S-08、S-09、AC-10、AC-11、AC-12。
**依赖：** 17。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 把 17 接到正式 mission 装配，使用现有音频能力；开始/Continue/启用声音的可信点击同步请求解锁，p 仍经既有所有者控制。
- 英文项目状态文字区分等待关闭、锁定、可用、游戏暂停、宿主挂起与失败；启用声音不继续游戏或关闭菜单。
- 状态按钮在输入区外可 Tab 到达，成功且满足 P3-05 条件才回到输入区；失败、隐藏或用户已移焦不抢焦点。
- DEV 下保留最近 500 条声音决定，字段按 spec，截断可见；生产编译隔离日志/诊断接线，无 PCM/坐标转储和新导出功能。

## 不包含

- 不新增声音设置、模态框或 Classic DOM HUD；不修改飞行按键含义。

## 关键文件与契约

- 现有 use-mission-owner、MissionScreen、MissionPage、StartConfigPage、MissionMenuPage、MissionShell、use-input-focus 与 mission-diagnostics。
- 计划新增 `ui/mission/AudioStatus.tsx`、`audio-copy.ts`/测试及 `ui/dev/audio-log.ts`/测试；不新增 TSX 单元 runner。

## 写入范围

- `src/app/composition/use-mission-owner.ts`：正式消费者/状态接线。
- `src/app/MissionScreen.tsx`：声音视图传递。
- `src/app/ports.ts`：现有能力声明的必要语义同步。
- `src/app/browser-ports.ts`：仅必要的已存在能力装配。
- `src/ui/mission/**`：声音状态、激活、焦点与相关纯文案测试。
- `src/ui/dev/**`：声音日志及 DEV 面板/测试。
- `src/app/app.css`：必要的状态与可见焦点样式。
- `docs/engineering/modules/ui.md`：状态与 DEV 边界说明。
- `docs/engineering/keyboard-input.md`：声音控件与现有焦点/控制交接。

## 验收标准

- [ ] 状态忠实反映能力和播放门禁；同步可信激活不延后，按钮不旁路暂停。
- [ ] p/菜单/输入区的既有语义与焦点保持；文案和日志纯模块测试覆盖边界。
- [ ] DEV 500 项截断与运行身份正确；生产没有日志或原版敏感输出。

## 验证方法

- 相关纯 `.test.ts` 与 `pnpm check`；按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)做合成状态控件验证，持久完整 E2E 归 22。
- 对本项接线与组件调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)，不扩充设置界面。

## 完成证据
