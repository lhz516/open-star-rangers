---
type: plan
status: active
phase: P3
task: "05"
subtask: "25"
updated: 2026-10-10
---

# 25 — 装配：端口、输入消费者与任务画面

**契约来源：** [spec](../spec.md) 的[生命周期与资源](../spec.md#生命周期与资源)、[输入区与焦点](../spec.md#输入区与焦点)、[全屏与 Keyboard Lock](../spec.md#全屏与-keyboard-lock)、[Alt+F4 风险提示](../spec.md#altf4-风险提示)、[战略地图输入](../spec.md#战略地图输入)“几何来源”，[验证策略](../spec.md#验证策略)的浏览器验证；S-07、S-09、S-11、S-12、S-13、S-14 的装配部分；AC-10、AC-14、AC-15、AC-16、AC-17 的前提。
**依赖：** 19、22、23、24。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **端口：** [ports.ts](../../../../../src/app/ports.ts) 的 `MissionPorts` 增加输入所需的宿主能力：键盘源工厂、Pointer Lock、全屏与锁键、平台族；[browser-ports.ts](../../../../../src/app/browser-ports.ts) 提供浏览器实现。
- **开发测试入口：** [app-entry.test-support.tsx](../../../../../src/app/app-entry.test-support.tsx) 增加只由测试入口读取的查询键，用于覆盖平台族（Alt+F4 路径）与制造全屏/锁键/Pointer Lock 的不支持、拒绝、失败与 pending（AC-14），并在文件头注释写明；不新增 URL 参数或全局开关影响生产入口。同步 [e2e/support/app-entry.ts](../../../../../e2e/support/app-entry.ts) 的 URL 构造。
- **任务所有者装配：** [use-mission-owner.ts](../../../../../src/app/composition/use-mission-owner.ts) 以 `input` 阶段登记 20–22 的输入消费者：注入 19 的绑定表与锁键清单、15 的控制端口、`ui` 消费者创建的 `GameCommandFeedback.submit`（输入消费者经 getter 或等价方式取得，不直接调用 `submitCommand`）、21 的能力、22 的地图输入（生产几何提供者为 null，显示“地图输入未就绪”，生产地图策略留给 26）。StrictMode 双重挂载、Fast Refresh 与重开后只有一个输入源与一组监听。
- **画面：** [MissionScreen.tsx](../../../../../src/app/MissionScreen.tsx)、[MissionPage.tsx](../../../../../src/ui/mission/MissionPage.tsx) 把输入区元素交给键盘源绑定，把输入状态（提示、G 项标注、能力状态、错误）、全屏按钮与开始手势的全屏回调接到 23 的组件；G 项标注使用 24 的文字。
- Node 测试覆盖可在 Node 中验证的装配（例如消费者登记顺序与释放、测试入口查询键的解析）；真实浏览器行为由 28、29 验证。

## 不包含

- 地图策略的生产值（26）；浏览器测试（27–29）；文档（32）。

## 关键文件与契约

- [ports.ts](../../../../../src/app/ports.ts)、[browser-ports.ts](../../../../../src/app/browser-ports.ts)、[app-entry.test-support.tsx](../../../../../src/app/app-entry.test-support.tsx)、[use-mission-owner.ts](../../../../../src/app/composition/use-mission-owner.ts)、[MissionScreen.tsx](../../../../../src/app/MissionScreen.tsx)、[MissionPage.tsx](../../../../../src/ui/mission/MissionPage.tsx)、[MissionShell.tsx](../../../../../src/ui/mission/MissionShell.tsx)、[StartConfigPage.tsx](../../../../../src/ui/mission/StartConfigPage.tsx)、[e2e/support/app-entry.ts](../../../../../e2e/support/app-entry.ts)。
- 12–14、19–24 的产出。

## 写入范围

- `src/app/ports.ts`、`src/app/browser-ports.ts`、`src/app/app-entry.test-support.tsx`、`src/app/MissionScreen.tsx`
- `src/app/composition/**`
- `src/ui/mission/MissionPage.tsx`、`src/ui/mission/MissionShell.tsx`、`src/ui/mission/StartConfigPage.tsx`
- `src/ui/mission/InputNotices.tsx`、`src/ui/mission/mission-copy.ts`、`src/ui/mission/mission-copy.test.ts`：接通后“没有游戏控件”的骨架说明不再成立，能力与地图状态的文字也放在这里（2026-10-10 协调者依 23 的报告加入）。
- `e2e/support/app-entry.ts`
- `e2e/interaction-render.spec.ts`：接通输入后进入飞行的焦点改落输入区，原用例断言标题焦点（同上）。

## 验收标准

- [ ] 生产与开发入口都装配同一输入消费者；测试入口的覆盖只在测试入口生效。
- [ ] 输入消费者经反馈入口提交、经控制端口执行会话控制；生产地图输入在几何为 null 时显示未就绪且不锁定。
- [ ] 开始按钮与全屏按钮经平台端口发起全屏；输入状态在任务画面可见。
- [ ] `pnpm check` 通过；按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 检查本项改动；按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 做一次开发服务器上的冒烟（进入飞行、按键产生意图、返回菜单无残留监听），完整用例归 28、29。

## 验证方法

- `pnpm check`；开发服务器冒烟记录在完成证据中。

## 完成证据
