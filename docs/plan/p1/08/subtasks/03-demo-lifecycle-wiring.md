---
type: plan
status: active
phase: P1
task: "08"
subtask: "03"
updated: 2026-10-10
---

# 03 — 演示生命周期接线

**契约来源：** [spec](../spec.md) 的 S-03、S-04、S-05、AC-05、AC-06、AC-09（装配接收部分）、AC-10（锁存与恢复的 Node 部分）、AC-12、AC-15，“计划新增契约”中的“进入时的 start 与 owner 身份”，行为表的返回菜单、清理失败锁存、StrictMode/Fast Refresh/容器替换各行，技术决定 2、3、5、6。
**依赖：** 01, 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新增实际供 React 使用的 DOM-free 演示生命周期接线：接收宿主、时钟与渲染选项工厂，管理“当前 owner”。
  - 只有在不存在活动 owner、未锁存时才创建；替换时先完成旧 owner 的全部清理尝试并取得失败记录，再决定是否创建新 owner。
  - 每个初始化成功且仍为当前的 owner 恰好派发一次 `start`；首次 start 失败不重试；重复通知、Exit 后的 idle 与同 owner 的 phase 变化不重复派发；已释放、替换或初始化失败的 owner 不收到 start。
  - 进入意图在 owner 创建前撤销时不创建；创建后立即撤销时完整释放；重复释放只清理一次。
  - 浏览器表面工厂回滚失败、owner 失败记录、`dispose()` 抛错都以 `demo-release-failed` 交付 01 的页面流转，且在任何后续启动机会之前同步交付；`reportError` 自身抛错也不丢失阻断；后续独立错误仍报告。
- 重写 [use-synthetic-demo-owner.ts](../../../../engineering/source-structure.md#r5-演示所有者与槽位) 以使用该接线：容器作为 effect 依赖不变；React 不发布已失效 owner；清理失败锁存后不再创建 owner（覆盖 StrictMode setup→cleanup→setup、容器替换、Fast Refresh）。
- 演示入口只使用 `SYNTHETIC_DEMO_OPTIONS`，不接受内容、导入或存档参数。
- 邻接 Node 测试覆盖 AC-15 的全部条目，以及 AC-10 的“无清理失败的 failed/faulted 返回后可重新进入、得到新 owner 与 run 1”和“锁存后工厂调用数不再增加”。

## 不包含

- 画面组件、页面外壳、焦点与文字（04）。
- 清理失败记录与渲染回滚信号本身（02）。
- 浏览器证据（06）。

## 关键文件与契约

- 计划新增 `src/app/composition/synthetic-demo-lifecycle.ts`（名称可由实现调整）与 `synthetic-demo-lifecycle.test.ts`，均尚不存在。保持 DOM-free，由测试传递导入。
- 修改 [use-synthetic-demo-owner.ts](../../../../engineering/source-structure.md#r5-演示所有者与槽位)：接收页面流转的失败交付回调与“进入意图”，返回值仍提供 owner 与容器回调 ref。
- 复用 [createSyntheticDemoOwner](../../../../engineering/source-structure.md#r5-演示所有者与槽位)、[ControlledHost](../../../../engineering/source-structure.md#r4-合成会话)、[RecordingSurface](../../../../../src/render/scene/render-surface.test-support.ts)、[TestClock](../../../../engineering/source-structure.md#r6-合成-ui-层)；不另建逻辑替身。

## 验收标准

- [x] AC-15：同 owner 重复启动通知只派发一次；首次 start 失败不重试；Exit 后重复通知仍 idle；初始隐藏时只派发一次 start，phase 为 paused/hidden 且无帧请求，转 visible 后仍 paused，显式 Resume 才调度。
- [x] AC-15：已释放/替换/初始化失败的 owner 不收到 start；撤销进入意图时不创建；创建后立即撤销时完整释放；正常替换先完成旧清理再创建；重复释放只清理一次。
- [x] AC-15/AC-09：清理失败或既有锁存时工厂调用数不再增加，覆盖 StrictMode 式 setup→cleanup→setup、容器替换与 HMR 式重建；失败在后续启动机会之前交付；`reportError` 抛错不丢失阻断。
- [x] AC-10/AC-15：渲染 failed 或普通 faulted（无清理失败）释放后再进入得到新 owner、run 1，旧回调不影响新 owner。
- [x] `pnpm exec vitest run src/app` 通过；`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node：对生产接线做调用计数与顺序断言，真实 Core/Session，`ControlledHost` 控制可见性与帧；注入表面工厂抛出 02 定义的回滚失败。
- React effect 参数、当前身份与失败交付点经代码审阅，浏览器交叉验证由 06 取得（AC-03/05/06/12）。

## 完成证据

- **实现：** [synthetic-demo-lifecycle.ts](../../../../engineering/source-structure.md#r5-演示所有者与槽位) 是每个应用实例一个的 DOM-free 演示槽位，持有同步锁存：
  - `visit()` 表示一次进入意图。`open(create)` 先关闭仍持有 owner 的其他 visit，未锁存时才调用工厂；随后锁存 owner 的初始化回滚记录，否则只派发一次 start 并再次检查记录。同一 visit 再次 `open` 返回 null，失败的 start 不重试。
  - `close()` 幂等：释放 owner、交付其清理失败记录，再报告 dispose 抛出的错误。
  - `release()` 供“返回菜单”在切换画面前同步释放当前 owner。
  - 两个出口自身抛错都被吞掉，锁存不受影响。
- **hook：** [use-synthetic-demo-owner.ts](../../../../engineering/source-structure.md#r5-演示所有者与槽位) 改为接收生命周期，effect 依赖仍为 `[container, lifecycle]`：setup 中 `open` 并发布 owner，cleanup 中先发布 null 再 `close`。锁存后 `open` 返回 null，不创建表面或 owner，StrictMode 重跑、容器替换和 Fast Refresh 都走这一路径。演示入口仍只用 `SYNTHETIC_DEMO_OPTIONS`。
- **过渡状态：** [App](../../../../../src/app/App.tsx) 在本提交中只做最小适配（以 `reportError` 作为失败出口），因此暂时会在加载时自动启动；[04](./04-menu-pages-shell.md) 改为菜单外壳后消除。
- **Node 测试：** [synthetic-demo-lifecycle.test.ts](../../../../engineering/source-structure.md#r5-演示所有者与槽位) 使用真实 owner/Core/Session（`ControlledHost`、`TestClock`、`RecordingSurface`），工厂与 start/dispose 均计数并记录顺序：
  - **一次性 start：** 每个 owner 只 start 一次；重复 `open` 与 Exit 后都不再 start，Exit 后保持 idle。
  - **失败与隐藏：** 首次 start 失败不重试。隐藏页面 start 后为 paused/hidden 且无帧请求，转为可见后仍 paused，显式 Resume 才调度。
  - **owner 身份：** 已关闭或已被替换的 visit 不再 start。初始化失败的 owner 忽略 start：store 状态为 null，host 无资源。
  - **先释放后创建：** 关闭后的意图不创建 owner；打开后立即关闭会完整释放，且只释放一次；`release()` 同步释放并交付失败。替换的顺序为 create → dispose → create。
  - **失败后重进：** 渲染 failed 或普通 faulted 返回后，再进入得到新 owner 与 run 1，旧帧回调无影响。
  - **锁存：** 以下各路径都锁存，且工厂调用数不再增加（含 3 次模拟 StrictMode/容器替换/HMR 的新 visit）：
    - dispose 失败：顺序为 create → dispose → failure，且同时报告。
    - 替换时旧 owner 释放失败：不创建替换 owner。
    - 先前的会话 cleanupFailed：在 close 时交付；若 dispose 也失败，只报告 dispose 错误，首因不变。
    - 渲染器初始化回滚失败与表面工厂交来的 `RollbackError`：在 open 时交付，从不 start、无会话资源。
    - 两个出口自身都抛错：仍保持阻断。
- **工程检查：** `pnpm exec vitest run src/app`：通过；`pnpm typecheck`、`pnpm lint` 通过；`pnpm check`：43 个文件 1094 passed，构建成功（仅既有块体积警告）。React effect 参数、发布时机与失败交付点经代码审阅；浏览器交叉验证归 [06](./06-final-browser-alignment.md)。
- **Rubber-duck：**
  - 阻断问题：返回菜单若只靠被动 effect cleanup，释放与锁存会晚于菜单出现。已新增同步 `release()`，由 04 的返回处理在切换画面前调用，effect cleanup 保留为兜底。
  - 非阻断：补充了表面工厂 `RollbackError` 经生命周期的端到端测试。
- **Simplify：**
  - 已采纳：合并 open 与 start 为原子操作，消除可遗漏/重排的中间状态。
  - 已采纳：不再读取 store 的 `actionError` 判断初始化失败，改由 owner 自身的“初始化失败后忽略 dispatch”契约保证。
  - 已采纳：`close()` 清除 owner 引用，避免已释放的渲染图被保留。
  - 未采纳：跨 `render/` 与 `app/` 的共享错误出口 helper（跨模块且收益小）、提取 `NO_VIEW` 测试夹具、去掉 start 计数包装（AC-15 需要调用计数）。
- **文档影响：** 生命周期与锁存的工程文档同步按计划归 [05](./05-docs-isolation-checks.md)。

