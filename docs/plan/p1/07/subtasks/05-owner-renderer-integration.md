---
type: plan
status: active
phase: P1
task: "07"
subtask: "05"
updated: 2026-10-02
---

# 05 — Owner 与渲染消费者接线

**契约来源：** [spec](../spec.md) 的 S-04、S-06、S-07、AC-02、AC-04、AC-10–AC-14、AC-16。
**依赖：** 03, 04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 扩展 app composition，使渲染端口及幂等 disposer 在 Session 创建前转交 owner；初始化失败和正常释放都尝试渲染清理。
- 把 renderer 作为逐运行 consumer 接入 P1-06 binding；attach 局部失败时本地逆序回滚并聚合错误，已转交 bridge 的 handle 变成 no-op。
- 保持渲染失败与 Session 错误隔离，重启/退出/旧 run 回调不污染新 run。

## 不包含

- 不实现 React 画面组件、菜单或恢复入口（06/P1-08）。
- 不修改 P1-06 bridge 的既有命令反馈语义，不创建全局 owner。

## 关键文件与契约

- [synthetic-demo-owner.ts](../../../../../src/app/composition/synthetic-demo-owner.ts)、[use-synthetic-demo-owner.ts](../../../../../src/app/composition/use-synthetic-demo-owner.ts)。
- [synthetic-session-bridge.ts](../../../../../src/ui/game/synthetic-session-bridge.ts) 的公开 consumer binding。
- 适配器直接内联在 owner 中（`{attach: binding => renderer.attach(binding)}`），无需单独文件；测试扩展现有 [synthetic-demo-owner.test.ts](../../../../../src/app/composition/synthetic-demo-owner.test.ts)。[App](../../../../../src/app/App.tsx) 暂以无样式容器接线，样式化画面组件属于 06。

## 验收标准

- [x] AC-02/04 的运行接线、唯一调度和 run 身份隔离成立。
- [x] AC-10/11/14 的初始化/attach/清理失败显式反馈且资源继续释放成立。
- [ ] AC-16 的接入不改变 replay、事件流或状态哈希成立。

## 验证方法

- Node 使用真实 Session、ControlledHost 和注入失败的表面/consumer 替身，断言 AggregateError 内容、释放顺序、幂等 dispose 与迟到回调。
- 对 owner 组合测试运行 `pnpm exec vitest run src/app/composition src/app/session src/app/runtime src/core/synthetic`。

## 完成证据

- **实现：** `createSyntheticDemoOwner(host, clock, render)` 现在必须接收渲染选项（`{surface, reportError}` 或 `{unavailable, reportError}`）。owner 先创建渲染器——表面连接失败时渲染器已释放表面，owner 改用 unavailable 渲染器继续——再创建桥接（渲染器在命令反馈之后作为运行级 consumer）与会话；`release` 依次尝试会话 dispose、桥接 unbind、渲染器 dispose 并汇总失败。owner 向外暴露只读 `renderer`（`SyntheticRendererReader`）。React hook 接收容器 ref，在同一 effect 内用 `createBrowserWebGLSurface` 创建表面（抛错则为 unavailable）并交给 owner，此后不单独释放表面。
- **Node（AC-02/04/10/11/14）：** owner 测试覆盖：start/add/restart 时每个运行都被绘制（含 run 2 新对象）；释放顺序 trace 为 session → bridge → surface disconnect → surface dispose，之后迟到的尺寸/上下文事件不绘制、0 次通知，重复 dispose 只释放一次；会话创建失败与桥接失败时已转交的表面被释放（后者顺序 session → bridge → disconnect → dispose）；表面连接失败时表面被释放、渲染器 unavailable 而 owner 照常 start；桥接解绑与表面释放同时失败时三步都尝试并汇总为 AggregateError、写入 actionError；unavailable 渲染器下 add/remove 均得到 Core accepted；绘制失败后渲染器 failed、会话仍 running、sessionError 为空、命令照常 accepted。接线事务性与 handle no-op 由 03 的渲染器测试覆盖，owner 适配器原样转发。
- **AC-16：** 接入渲染器不改变 replay/状态哈希的对照测试归 07。
- **检查：** `pnpm exec vitest run src/app src/render src/ui tools/engineering-boundaries.test.ts` 通过；`pnpm check` 通过（39 个测试文件/1026 个测试）。生产构建现含 Three.js：主块 794.85 kB（gzip 214.77 kB），Vite 输出 500 kB 块体积警告，按 spec 技术决定 10 只记录。
- **审阅：** rubber-duck 无发现。simplify 采纳渲染选项必填、先建渲染器后建桥接（消除可空的时序耦合）、连接失败降级为 unavailable（与“表面创建失败仍创建 owner 并显示 unavailable”一致）、直接暴露只读渲染器、复用 `attemptAll`；未采纳去掉 `reportError` 包装（分离调用 Web API 全局函数不保证安全）与测试辅助提取。
- **文档影响：** [工程约定](../../../../engineering/README.md#ui-投影与指令反馈) 的 owner 与 React 接线条目已同步渲染器所有权、释放顺序与 unavailable 降级。
