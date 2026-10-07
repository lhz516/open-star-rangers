---
type: plan
status: active
phase: P2
task: "11"
subtask: "10"
updated: 2026-10-06
---

# 10 — 查看器所有者与音频

**契约来源：** [spec](../spec.md) 的 S-08（试听）、S-12（GPU 与音频的所有权）、AC-06（替换前释放）、AC-15（Node，锁存部分），以及[行为与边界](../spec.md#行为与边界)中的试听、从查看器返回菜单、新结果替换资源包各行，技术决定 1。试听意图与 `close()` 观察已拆到 [22](./22-viewer-audio.md)（见 goal 执行记录）。
**依赖：** 02, 08, 22。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新增查看器所有者与生命周期（`src/app/viewer/`），沿用 [synthetic-demo-lifecycle.ts](../../../../../src/app/composition/synthetic-demo-lifecycle.ts) 的锁存模式：
  - **创建：** 每次进入查看器创建一个所有者，含查看渲染（08、09）与 22 的查看器音频，由应用端口提供表面工厂与音频能力。
  - **显示：** 读取资源持有者的当前资源包：只列出已完整验证的组，并解析查看意图（Asset ID 与序号），把对应的内容交给查看渲染。读取或展开失败只标记该项。
  - **替换：** 资源持有者替换资源包前，所有者先释放引用旧内容的 GPU 资源与已载入的声音，再采用新内容。
  - **释放：** 返回菜单、卸载、StrictMode 重跑与 Fast Refresh 时释放渲染与音频。任一步失败都锁存，阻止再次创建查看器直到整页重载；导入与演示不受影响。
- **音频：** 使用 22 的查看器音频。
  - 离开与替换资源包时取消待播放意图；替换后载入新资源包的声音。
  - 以 22 释放结果中的 `close()` 观察判断“已关闭”，不以控制器的 `disposed` 快照代替。关闭确认前不创建新的音频上下文；`close()` 被拒绝时锁存。
- **Node 测试**（伪造的表面工厂、音频能力与资源持有者）：
  - 创建与释放；替换前释放；锁存后不再创建；
  - 替换与离开时取消待播放意图；
  - `disconnect` 或监听撤销抛错、`close()` 被拒绝、`close()` 延迟完成时的锁存与不重建。

## 不包含

- React 页面、控件与键盘（11）；浏览器 E2E（11、13）。
- 修改 P2-08 的控制器契约（“不排队”保持不变）。

## 关键文件与契约

- 计划新增 `src/app/viewer/` 的所有者与生命周期及相邻测试；使用 22 的查看器音频。
- 复用：[audio-controller.ts](../../../../../src/platform/audio/audio-controller.ts)（`createAudioController`、`AudioCapability`、`SoundRecord`）、[browser-audio-controller.ts](../../../../../src/platform/audio/browser-audio-controller.ts)、08 与 09 的查看渲染、02 的资源持有者、[rollback-error.ts](../../../../../src/app/session/rollback-error.ts)。

## 验收标准

- [x] AC-06（释放）：资源持有者替换资源包前，引用旧内容的 GPU 资源与声音已释放。
- [x] AC-15（Node，所有者部分）：离开与替换取消待播放意图；`close()` 被拒绝时锁存且不创建新的音频上下文；关闭确认前不重建。
- [x] 任一释放步骤失败都锁存；锁存不影响导入与合成演示。
- [x] `app/viewer/` 不导入 `original-data`；`pnpm check` 通过。

## 验证方法

- `pnpm exec vitest run src/app src/render`，完成前 `pnpm check`。
- 浏览器部分见 11 与 13。按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：**
  - [viewer-items.ts](../../../../../src/app/viewer/viewer-items.ts)：
    - `viewerCatalog(groups)` 按组顺序、再按清单顺序列出完整组中的二维 Asset（图像、布局、调色板、字库），只为含这些条目的组建立 payload 索引；
    - `resolveItem(entry, payloads)` 用内容读取函数与 `expandImage`、`composeLayout` 得到查看项。引用缺失时为 `binding-mismatch` 的 ContentContractError；内容错误只成为该项的失败。模型与效果由 09 接入。
  - [viewer-owner.ts](../../../../../src/app/viewer/viewer-owner.ts) 的所有者：
    - 用 `createViewerRenderer` 建渲染器；
    - 跟随资源持有者，订阅变化后重新列出条目；
    - `select(id)` 显示一项，或把它标为失败；
    - 新资源包的音频（22）只在此前每一次关闭都确认后创建。
  - 同一文件的槽位 `createViewerLifecycle({ onCleanupFailure, reportError })`：
    - `open` 先关闭仍打开的所有者；已锁存时返回 null；
    - `close` 每步都尝试，同步失败立即锁存（多于一个时为 AggregateError），音频 `close-failed` 在观察到时锁存；
    - `cleanupFailure()` 公开锁存原因。锁存只在这个槽位中，资源持有者与合成演示的槽位不受影响。
  - **替换：** 持有者的 `beforeReplace` 中，所有者以渲染器新增的 `releaseItem()` 释放所示条目的 GPU 资源（释放失败时锁存），取消待播放意图并释放音频，再采用新内容。
  - **渲染器：** [viewer-renderer.ts](../../../../../src/render/viewer/viewer-renderer.ts) 新增 `releaseItem()`。除 `disposed` 外的任何状态下都释放当前显示；释放失败时抛 AggregateError，渲染器进入 `failed`。不可用的渲染器上什么也不做。
  - **边界：** [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 的“app resource and viewer boundaries”现允许 `app/viewer/` 导入 `render/`（所有者持有渲染器，spec 未禁止，与 `app/composition/` 相同）；`app/resources/` 仍禁止 `render/` 与 `ui/`，两者都禁止 `ui/`。`original-data` 由 ESLint 对整个 `src/app` 禁止。
- **测试：**
  - [viewer-owner.test.ts](../../../../../src/app/viewer/viewer-owner.test.ts) 共 20 条：
    - **条目与显示：** 条目顺序；图像、布局、调色板、字库各自显示；不可读的项与引用了不可读图像的布局只标记该项。
    - **替换：** 替换前已释放所示条目与音频，然后跟随新包；替换丢弃待播放意图；旧上下文确认关闭前不为新包创建音频；关闭被拒绝时锁存且不再创建。
    - **屏障与失败：**
      - 连续替换与重开查看器都等待最早一次仍在进行的关闭；
      - 渲染器已失败时替换前仍释放所示条目，释放失败时锁存；
      - 持有者订阅无法撤销时锁存；
      - 表面连接失败但已干净释放时，条目照常列出、没有画面；回滚失败（`RollbackError`）时锁存，之后不再创建。
    - **槽位：**
      - 关闭释放渲染器与音频，音频关闭后可再次打开；上一次关闭悬置时新的查看器没有音频；
      - 关闭被拒绝时锁存，之后不再创建，而持有者仍接受新的导入结果；
      - 渲染器释放失败立即锁存；打开前先关闭仍打开的所有者；锁存出口自身抛错时如实报告且仍锁存。
  - [viewer-renderer.test.ts](../../../../../src/render/viewer/viewer-renderer.test.ts) 新增 1 条：`releaseItem()` 在 `failed` 状态下也释放，释放失败时抛错并进入 `failed`。
  - 证伪：把关闭屏障改为只等最近一次关闭，或把 `releaseItem()` 换回 `show(null)` 后，对应测试失败。
- **检查：**
  - `pnpm exec vitest run src/app/viewer src/render/viewer`：74 条通过；
  - `pnpm check`：150 个文件 4,455 条测试，构建通过（其后只在一条测试中增加持有者断言，已单独重跑）。
- **Rubber-duck：** 4 个阻塞问题，均已修复并补回归测试：
  - 新资源包的音频只等待最近一次关闭，连续替换或重开查看器会在更早的关闭仍进行时创建上下文：改为只会累加的关闭屏障，所有者与槽位共用；
  - 渲染器失败后 `show(null)` 什么也不做，替换前不会释放旧条目的 GPU 资源（AC-06）：新增 `releaseItem()`，失败时锁存；
  - 释放时持有者订阅撤销抛错未被锁存：改为每步都尝试，并汇总失败；
  - 表面连接失败时所有者整体失败：干净回滚时改用不可用的渲染器，`RollbackError` 锁存并抛出。
- **Simplify：** 采纳：
  - `dispose` 的逐步释放改用 [cleanup.ts](../../../../../src/render/scene/cleanup.ts) 的 `attemptAll`（`app/viewer/` 现可导入 `render/`）；
  - `dispose` 清空 payload 索引，不再持有资源包字节（快照只含 ID、角色与失败，保留）；
  - 没有音频要关闭时不延长关闭屏障；
  - 测试复用 [resource-holder.test-support.ts](../../../../../src/app/resources/resource-holder.test-support.ts) 的 `flush`；
  - 不含二维条目的组不建立 payload 索引。

  未采纳：
  - 与 [synthetic-demo-lifecycle.ts](../../../../../src/app/composition/synthetic-demo-lifecycle.ts) 共用锁存槽位：两者的释放结果不同（查看器有异步音频关闭），抽取超出本子任务；
  - 按代缓存已解析的查看项：只在选择时解析一次，收益不明显。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md)新增“查看器所有者”一节，“资源查看渲染”一节补 `releaseItem()`，目录树加入两个新文件。工程约定与 STATUS 无需改动。
