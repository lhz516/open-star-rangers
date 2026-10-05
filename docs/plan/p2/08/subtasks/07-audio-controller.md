---
type: plan
status: active
phase: P2
task: "08"
subtask: "07"
updated: 2026-10-05
---

# 07 — DOM-free 播放控制器与 `platform/audio/` 边界

**契约来源：** [spec](../spec.md) 的 S-08（控制器部分）、S-09、S-10（平台部分）、S-12（本子任务部分），AC-09、AC-11（`platform/audio/` 部分）；[播放控制器](../spec.md#播放控制器)行为表与[契约表](../spec.md#播放控制器-1)、[技术决定](../spec.md#技术决定) 9、10。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **控制器：** 计划新增 `src/platform/audio/audio-controller.ts`，只用最小结构类型，不引用 DOM 类型。
  - **创建参数：**
    - 音频能力：创建上下文、在上下文上创建缓冲与源节点，取得 `state`、`statechange`、`resume`、`suspend`、`close`、`destination`；
    - 页面生命周期宿主：提供初始可见性，订阅隐藏与可见（区分 `visibilitychange`、`pagehide`、`pageshow`），返回撤销函数；
    - 必填的 `reportError`。
  - **状态：** `idle`、`locked`、`running`、`suspended`、`unavailable`、`failed`、`disposed`，按 spec 行为表转换。要点：
    - **上下文：** 延迟到 `unlock()` 创建；状态由 `statechange` 驱动，不等待 `resume()` 的 Promise；
    - **可见性是独立的门：** 隐藏时停止全部发声，只把 `running` 挂起为 `suspended`，并记为“因隐藏而挂起”；只有这种挂起才在恢复可见时自动 `resume()`；
    - **隐藏期间：** `unlock()` 不创建也不恢复；迟到的 `running` 立即再次挂起；
    - **浏览器自行挂起：** 停止发声，不补播；
    - **关闭或宿主抛错：** 变为 `failed`。
  - **命令：**
    - **`load(sounds)`：** 用 01 的读取器与浮点映射校验并创建缓冲，整批成功才登记；
    - **`play(id)`：** 只在 `running` 时创建新的发声，循环方式为整段循环时持续循环；同时发声数达到上限时返回 `voice-limit`。上限是导出常量，取值在实现时确定（≥ 4）并写入工程约定；
    - **`stop`、`stopAll`：** 立即停止并断开节点，可重复调用；
    - **`dispose()`：** 同步停止并断开全部发声，移除全部监听，释放已登记的缓冲；从不创建上下文；上下文存在且未关闭时至多 `close()` 一次。
  - **结果与快照：**
    - 结果是判别联合的纯数据，错误码为 spec 的封闭集合，不抛错、不以 rejected Promise 表达；
    - 快照为冻结的 `{ status, loaded, voices }`，两次变化之间保持同一对象；
    - `subscribe` 可用于 `useSyncExternalStore`，订阅者抛错交给 `reportError`；
    - 宿主错误只按名称分类，文本不进入结果。
  - **所有权：** 不保留、不转移、不修改调用方的 payload 缓冲。
- **边界规则：**
  - **lint：** [eslint.config.js](../../../../../eslint.config.js) 中，`platform/audio/` 不得导入 `original-data`（字节端口也不行）、`render`、`ui`、`app`、`workers`。
  - **依赖图回归：** [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 仿照 `platform/storage/` 一节新增：
    - 全部文件不出现 `fetch`、`XMLHttpRequest`、`WebSocket`、`sendBeacon`、`EventSource`、`localStorage` 标识符；
    - 只能相对导入，不能到达上列模块；
    - 非 `browser-*` 的模块必须在真实 Node 程序中。

  回归须带能触发每条规则的反例夹具。
- **测试：** 相邻的 `audio-controller.test.ts`，用假音频能力与假生命周期宿主。
- **文档：** 更新源码结构指南：把 `platform/audio/` 列入当前目录，从“后续扩展方向”的 P4 行中移出；记录控制器契约。更新工程约定的边界规则一节。

## 不包含

- `browser-*` 工厂与真实浏览器验证（08）。
- 何种事件播放哪个变体、声像与混音（P3）；试听界面（P2-11）。

## 关键文件与契约

- **计划新增：** `src/platform/audio/audio-controller.ts` 与 `audio-controller.test.ts`。
- **修改：** [eslint.config.js](../../../../../eslint.config.js)、[engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)、[源码结构](../../../../engineering/source-structure.md)、[工程约定](../../../../engineering/README.md)。
- **复用：** 01 的 `src/content/sound-payload.ts`；模式参照 [keyboard-source.ts](../../../../../src/platform/input/keyboard-source.ts)（DOM-free 宿主与监听管理）与 [platform/storage/](../../../../../src/platform/storage/)。

## 验收标准

- [ ] AC-09（状态转换）：实现 spec 行为表中的全部转换与错误码，每个错误码都有触发用例。
- [ ] AC-09（可见性）：以下情形都按 spec 处理：
  - 解锁前隐藏再恢复：保持 `idle`，不创建上下文；
  - `locked` 时隐藏再恢复：保持 `locked`；
  - `failed` 后隐藏再恢复：保持 `failed`；
  - 隐藏期间 `unlock()`：不创建、不恢复；
  - 隐藏前发起的 `resume()` 在隐藏后才兑现：再次挂起，不发声；
  - 浏览器自行挂起：停止发声，不补播；
  - 初始即为隐藏；
  - `pageshow` 恢复。
- [ ] AC-09（释放）：停止全部发声，移除全部监听，之后不再通知。`close()` 的调用次数：上下文创建前释放为 0 次；有存活上下文时恰好 1 次；重复释放不增加；上下文已被宿主关闭时为 0 次。
- [ ] AC-09（登记与所有权）：`load` 任一项失败则整批不登记；调用方修改或转移自己的缓冲，不影响已登记的音频；控制器从不转移它。
- [ ] AC-09（快照）：冻结，两次变化之间保持同一对象；订阅者的错误被隔离。
- [ ] AC-11（平台部分）：新边界回归在真实仓库上无违规，反例夹具各自被拒绝；既有边界不放宽。
- [ ] `pnpm exec vitest run src/platform/audio tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：假音频能力记录调用顺序与次数，可手动触发 `statechange`、使 `resume()` 永不兑现或迟到兑现；假生命周期宿主可设置初始可见性并逐个触发事件。
- 不适用原版对照；真实浏览器在 08 中验证。
- 完成前按 execute-goal 流程，以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
