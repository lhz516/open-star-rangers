---
type: plan
status: active
phase: P3
task: "13"
subtask: "18"
updated: 2026-10-25
---

# 18 — 通讯页与有界消息行

**契约来源：** [spec](../spec.md#消息行指示条与-warp-灯) 的 S-06/S-08，AC-06/11/13。
**依赖：** 14, 15。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 页2–4 只消费菜单选项 key/tone/引用，保留两种布局/截断/闪烁；页5 读当前 incoming/shown 和注入的 G-03 摘要。
- 消息队列区分入队/首次逻辑显示/未画过期/滚出；按05/08的绘制前后阶段处理 incoming-started、flight-message、radio-flushed、速度辅助。
- 零时长消息仍入一次，完成/信标各按实际次序丢队首；只走一个事件通道。
- 提供基地页可读的当前摘要快照/订阅端口，不新建第二队列，不导入 UI 文案模块。

## 不包含

不导入 CMOV 台词/头像，不改变 radio 回调，不修改 BasePage（25）。

## 关键文件与契约

- [domain-events.ts](../../../../../src/core/contracts/domain-events.ts)、[comm-menus.ts](../../../../../src/content/rule-data/comm-menus.ts)。
- 计划新增 `src/render/cockpit/communications/`、`messages/`。

## 写入范围

- `src/render/cockpit/communications/**`：菜单/来电纯模块及测试。
- `src/render/cockpit/messages/**`：有界队列、时点、当前视图与测试。

## 验收标准

- [ ] 入队/取出不等于开始显示；绘制末尾开始只能下次合格绘制显示。
- [ ] 零时长、连续flush/beacon/完成、跨视角与不同帧分组均无提前/重复/丢消息。
- [ ] 摘要缺映射、字节/条数超限明确反馈，完整信息不因96像素面板裁掉。

## 验证方法

`pnpm test -- src/render/cockpit/communications src/render/cockpit/messages`、`pnpm check`；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 限消息消费者，不建事件溯源系统。

## 完成证据
