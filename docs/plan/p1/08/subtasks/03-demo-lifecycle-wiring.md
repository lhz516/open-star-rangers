---
type: plan
status: active
phase: P1
task: "08"
subtask: "03"
updated: 2026-10-02
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
- 重写 [use-synthetic-demo-owner.ts](../../../../../src/app/composition/use-synthetic-demo-owner.ts) 以使用该接线：容器作为 effect 依赖不变；React 不发布已失效 owner；清理失败锁存后不再创建 owner（覆盖 StrictMode setup→cleanup→setup、容器替换、Fast Refresh）。
- 演示入口只使用 `SYNTHETIC_DEMO_OPTIONS`，不接受内容、导入或存档参数。
- 邻接 Node 测试覆盖 AC-15 的全部条目，以及 AC-10 的“无清理失败的 failed/faulted 返回后可重新进入、得到新 owner 与 run 1”和“锁存后工厂调用数不再增加”。

## 不包含

- 画面组件、页面外壳、焦点与文字（04）。
- 清理失败记录与渲染回滚信号本身（02）。
- 浏览器证据（06）。

## 关键文件与契约

- 计划新增 `src/app/composition/synthetic-demo-lifecycle.ts`（名称可由实现调整）与 `synthetic-demo-lifecycle.test.ts`，均尚不存在。保持 DOM-free，由测试传递导入。
- 修改 [use-synthetic-demo-owner.ts](../../../../../src/app/composition/use-synthetic-demo-owner.ts)：接收页面流转的失败交付回调与“进入意图”，返回值仍提供 owner 与容器回调 ref。
- 复用 [createSyntheticDemoOwner](../../../../../src/app/composition/synthetic-demo-owner.ts)、[ControlledHost](../../../../../src/app/session/synthetic-session.test-support.ts)、[RecordingSurface](../../../../../src/render/scene/render-surface.test-support.ts)、[TestClock](../../../../../src/ui/game/synthetic-ui.test-support.ts)；不另建逻辑替身。

## 验收标准

- [ ] AC-15：同 owner 重复启动通知只派发一次；首次 start 失败不重试；Exit 后重复通知仍 idle；初始隐藏时只派发一次 start，phase 为 paused/hidden 且无帧请求，转 visible 后仍 paused，显式 Resume 才调度。
- [ ] AC-15：已释放/替换/初始化失败的 owner 不收到 start；撤销进入意图时不创建；创建后立即撤销时完整释放；正常替换先完成旧清理再创建；重复释放只清理一次。
- [ ] AC-15/AC-09：清理失败或既有锁存时工厂调用数不再增加，覆盖 StrictMode 式 setup→cleanup→setup、容器替换与 HMR 式重建；失败在后续启动机会之前交付；`reportError` 抛错不丢失阻断。
- [ ] AC-10/AC-15：渲染 failed 或普通 faulted（无清理失败）释放后再进入得到新 owner、run 1，旧回调不影响新 owner。
- [ ] `pnpm exec vitest run src/app` 通过；`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node：对生产接线做调用计数与顺序断言，真实 Core/Session，`ControlledHost` 控制可见性与帧；注入表面工厂抛出 02 定义的回滚失败。
- React effect 参数、当前身份与失败交付点经代码审阅，浏览器交叉验证由 06 取得（AC-03/05/06/12）。

## 完成证据
