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

- [x] AC-09（状态转换）：实现 spec 行为表中的全部转换与错误码，每个错误码都有触发用例。
- [x] AC-09（可见性）：以下情形都按 spec 处理：
  - 解锁前隐藏再恢复：保持 `idle`，不创建上下文；
  - `locked` 时隐藏再恢复：保持 `locked`；
  - `failed` 后隐藏再恢复：保持 `failed`；
  - 隐藏期间 `unlock()`：不创建、不恢复；
  - 隐藏前发起的 `resume()` 在隐藏后才兑现：再次挂起，不发声；
  - 浏览器自行挂起：停止发声，不补播；
  - 初始即为隐藏；
  - `pageshow` 恢复。
- [x] AC-09（释放）：停止全部发声，移除全部监听，之后不再通知。`close()` 的调用次数：上下文创建前释放为 0 次；有存活上下文时恰好 1 次；重复释放不增加；上下文已被宿主关闭时为 0 次。
- [x] AC-09（登记与所有权）：`load` 任一项失败则整批不登记；调用方修改或转移自己的缓冲，不影响已登记的音频；控制器从不转移它。
- [x] AC-09（快照）：冻结，两次变化之间保持同一对象；订阅者的错误被隔离。
- [x] AC-11（平台部分）：新边界回归在真实仓库上无违规，反例夹具各自被拒绝；既有边界不放宽。
- [x] `pnpm exec vitest run src/platform/audio tools/engineering-boundaries.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 测试：假音频能力记录调用顺序与次数，可手动触发 `statechange`、使 `resume()` 永不兑现或迟到兑现；假生命周期宿主可设置初始可见性并逐个触发事件。
- 不适用原版对照；真实浏览器在 08 中验证。
- 完成前按 execute-goal 流程，以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：** [audio-controller.ts](../../../../../src/platform/audio/audio-controller.ts) 的 `createAudioController({ audio, lifecycle, reportError })`，只用最小结构类型，不引用 DOM 类型。
  - **能力注入：** 能力分为 `createContext()` 与 `createBuffer(channels, sampleRate)`。缓冲不依赖上下文，因为 spec 要求 `load` 在 `idle`（尚无上下文）时可用，浏览器中由 `AudioBuffer` 构造器提供。
  - **上下文端口：** `state`、`onStateChange`、`resume`/`suspend`/`close` 与 `createVoice(buffer, loop)`。
  - **生命周期宿主：** `visible()` 与三种事件的监听。
  - **常量：** 同时发声上限 `AUDIO_VOICE_LIMIT` 为 8。
- **测试：** [audio-controller.test.ts](../../../../../src/platform/audio/audio-controller.test.ts) 的 40 个用例，使用假能力（记录调用、`resume` 永不兑现、手动驱动 `statechange`）与假生命周期宿主：
  - **状态与错误码：** 9 个错误码都有触发用例；被阻止时保持 `locked` 且不等待 `resume`，新的手势可解锁；构造失败为不可用；宿主关闭、开始发声抛错、创建缓冲抛错、状态监听注册抛错都为 `failed`；浏览器挂起与 `interrupted` 都停止发声且不补播。
  - **可见性：** 覆盖 AC-09 列出的八种情形：解锁前隐藏/恢复、`locked` 时、`failed` 后、隐藏期间 `unlock()`、迟到的 `running`、浏览器自行挂起、初始隐藏、`pageshow` 恢复。另覆盖恢复后仍未运行时由 `unlock()` 恢复。
  - **释放：** `close()` 次数为：上下文创建前 0、有存活上下文时 1、重复释放仍为 1、宿主已关闭时 0；全部监听移除，之后不再通知。
  - **登记、所有权与快照：** 整批或全无，含已登记的重复项；调用方修改与转移缓冲不影响已登记的音频；快照冻结且稳定；订阅者错误与清理错误交给 `reportError`。
  - **重入：** 在隐藏、浏览器挂起、宿主失败与释放期间，订阅者都无法开始发声；释放期间不能再次释放。
- **边界：**
  - **lint：** [eslint.config.js](../../../../../eslint.config.js) 新增 `src/platform/audio/` 一条，拒绝 `original-data`（含字节端口的纯类型导入）与 `app`、`render`、`ui`、`workers`。
  - **回归：** [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 新增 ESLint 用例与“audio playback boundaries”一节：
    - 网络 API、`localStorage`、非相对导入与禁止层的源码回归，共 12 个反例；
    - 沿依赖图的间接到达检查，反例覆盖经中间模块再导出、`import()` 类型与计算型动态导入；
    - Node 程序覆盖检查，反例为孤立模块。
- **命令：** `pnpm exec vitest run src/platform tools/engineering-boundaries.test.ts` 通过（128 个测试）。`pnpm check` 通过（102 个测试文件、2,975 个测试，构建成功），其中包含 `pnpm typecheck` 与 `pnpm lint`。
- **rubber-duck：** 四项发现全部采纳：
  - **重入：** 离开 `running` 时先改变状态，再停止发声并只发布一次；释放时先置为 `disposed`。
  - **注册失败：** `unlock()` 中状态监听注册与状态读取的异常改为 `failed`。
  - **创建缓冲：** 抛错时控制器进入 `failed`。
  - **间接到达：** 边界回归增加沿依赖图的检查。

  另外，测试发现构造时注册失败会遗漏回滚，已修复。
- **simplify：**
  - **采纳：** 整批校验后才创建缓冲；缓存 `unknown-sound`/`voice-limit` 结果；清理步骤不再分配闭包数组；去掉 `#host` 的不可达分支；通知时跳过中途移除的订阅者，与 import-job-owner 和 synthetic-renderer 一致；根目录检查复用共享的应用程序；测试样本改为常量。
  - **未采纳：**
    - 每次订阅的包装函数是仓库既有做法，保证同一函数的多次订阅相互独立；
    - 复用 render 的 `attemptAll` 需要跨层移动；
    - 把平台子树与依赖图遍历抽成通用辅助函数，需要改动 render、storage 与 original-data 既有回归，超出本子任务范围。
- **文档影响：**
  - [源码结构指南](../../../../engineering/source-structure.md)：`platform/audio/` 列入当前目录，从“后续扩展方向”的 P4 行移出，并记录控制器契约与边界。
  - [工程约定](../../../../engineering/README.md#lint-规则eslintconfigjs)：lint 规则一节新增音频播放边界与发声上限。
