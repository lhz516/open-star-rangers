---
type: plan
status: active
phase: P1
task: "05"
subtask: "03"
updated: 2026-10-02
---

# 03 — 浏览器 rAF 与生命周期宿主

**契约来源：** [spec](../spec.md) 的 S-03、S-04、S-08，AC-03、AC-07、AC-13（适配绑定部分）、AC-14。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 提供 `createBrowserSessionHost()`，实现真实 rAF/request-cancel、document.visibilityState 和 visibilitychange/pagehide/pageshow 的结构化通知。
- 每次 subscribeLifecycle 安装三份确定监听，取消幂等、逐项移除；注册到一半抛错必须撤销已装监听，不留下未交给 owner 的资源。
- 无模块导入副作用、无独立自动循环、无 Core/会话策略。pagehide 不伪造 visible，pageshow 重新读实际 visibility。
- 适配器留在 platform，用 app DOM 类型检查；不把浏览器模块导入当前无 DOM 的 Node 测试程序。

## 不包含

- 会话暂停/恢复策略归 04，完整实际生命周期证据归 07。
- 不安装 Playwright、jsdom 或修改 App/main；不宣称派发 pagehide 证明 BFCache。

## 关键文件与契约

- 计划新增 `src/platform/browser-session-host.ts`（目前不存在）。
- `src/app/session-host.ts`（01 计划交付，类型消费）；[app 类型配置](../../../../../tsconfig.app.json)（已有，不改）。

## 验收标准

- [ ] AC-03：实际 rAF 返回句柄并异步送毫秒时间，取消后不调用有效消费者；不自行续排。
- [ ] AC-07/13：三种真实事件绑定映射正确；监听安装/逐项撤销计数可观测，重复撤销不重复删除；导入时无监听。
- [ ] AC-14：模块按现有 app 类型环境检查，目标 typecheck/lint/build 与 pnpm check 通过，无新增依赖/配置。

## 验证方法

- 使用 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)，隔离 Chromium、`pnpm dev` 实际 origin；在创建 host 前于临时探针记录 add/removeEventListener 与 request/cancel。使用真实适配器，不通过 fake DOM 代替该证据。
- visibility 通知读实际 getter；pagehide/pageshow 可用浏览器事件探针确认绑定，明确不是 BFCache。07 再完成实际 hidden 与完整控制器验收。
- `pnpm typecheck`、`pnpm lint`、`pnpm check`；不写不存在的 E2E 命令。rubber-duck 后 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 范围仅本新模块。
- 检查 [engineering](../../../../engineering/README.md) 的平台使用说明；临时探针/自有服务器结束清理，无生产页面交付。

## 完成证据
