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

- [x] AC-03：实际 rAF 返回句柄并异步送毫秒时间，取消后不调用有效消费者；不自行续排。
- [x] AC-07/13：三种真实事件绑定映射正确；监听安装/逐项撤销计数可观测，重复撤销不重复删除；导入时无监听。
- [x] AC-14：模块按现有 app 类型环境检查，目标 typecheck/lint/build 与 pnpm check 通过，无新增依赖/配置。

## 验证方法

- 使用 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)，隔离 Chromium、`pnpm dev` 实际 origin；在创建 host 前于临时探针记录 add/removeEventListener 与 request/cancel。使用真实适配器，不通过 fake DOM 代替该证据。
- visibility 通知读实际 getter；pagehide/pageshow 可用浏览器事件探针确认绑定，明确不是 BFCache。07 再完成实际 hidden 与完整控制器验收。
- `pnpm typecheck`、`pnpm lint`、`pnpm check`；不写不存在的 E2E 命令。rubber-duck 后 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 范围仅本新模块。
- 检查 [engineering](../../../../engineering/README.md) 的平台使用说明；临时探针/自有服务器结束清理，无生产页面交付。

## 完成证据

- 2026-10-02：`pnpm check` typecheck/lint/23 文件 524 测试/build 全通过。platform 仅由原 app DOM 类型环境检查，Core/Node 配置与依赖未改。
- 浏览器：独立 Chromium 154.0.8037.95 context，1000×700，实际 origin `http://127.0.0.1:5173/`；公共模块经 Vite 导入，探针先包装真实 add/remove API，无应用代码改动。

| 判据 | Setup/action | Expected | Observed | Result |
|---|---|---|---|---|
| AC-03 | 请求真实 rAF，另请求后取消，跨两个真实 rAF 等待 | 异步交付毫秒，无自动续排，取消不回调 | handle=1、now=140、returned=true；被取消回调 0 次 | passed |
| AC-07/13 | 导入后注册，派发三类浏览器事件 | 导入零监听，三类正确映射 | importLog=[]；visibility=visible、pagehide、pageshow=visible | passed |
| AC-09/13 适配部分 | off 两次，再派发 pagehide | 各监听仅移除一次，不再通知 | add/remove 各三项（document visibilitychange / window pagehide/pageshow）；通知仍为 3 | passed |
| 注册回滚 | 第三项 add 抛合成 Error | 回收此前已安装两项，原错可见 | 两项 remove，错误为 injected registration failure | passed |

- 派发事件只证明绑定，不证明 BFCache 或真实 hidden；真实隐藏与完整 controller 由 07 验证。没有模块/业务控制台错误；既有页面 favicon 请求 404 与验收无关，未改应用。
- rubber-duck 通过；double-failure 的有序 errors 保留注册/回滚两个原错，cause 指向直接捕获的回滚错（符合 lint）。simplify 四角度并行，无适用清理。
- 清理：探针 context 与初始工具页已关闭；自有附着 Vite 进程已停止，两个自有工具日志/快照已删除。未写存储或改 App/main。
- 文档影响：engineering 记录实际平台入口及类型边界；研究 guides 无需更新，冻结决定/原版事实不变，完整生命周期阶段证据尚未满足，不改 STATUS。
