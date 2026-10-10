---
type: plan
status: active
phase: P1
task: "06"
subtask: "08"
updated: 2026-10-10
---

# 08 — 浏览器验收证据

**契约来源：** [spec](../spec.md) 中 AC-01、AC-03、AC-04、AC-05、AC-09、AC-10、AC-11、AC-12、AC-13 的浏览器部分，以及“验证策略”的浏览器验证与证据边界。
**依赖：** 07。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 启动自有 Vite（端口空闲时用 `127.0.0.1:5173 --strictPort`），在隔离 Chromium context 中使用自建合成场景取得以下证据：

1. **初始与开始（AC-01）：** 初始为 idle 且无投影；start 后显示 tick=0、实际 tickRateHz，tick 随后前进。
2. **接受（AC-04）：** 在同一任务内触发 add 的真实 click 并立即读 DOM，看到 pending 与 ID；随后看到 accepted，其 tick/entity/position 与 marker 显示一致。
3. **拒绝（AC-05）：** 再次 add 得到 marker-already-exists；remove 得到 accepted；再次 remove 得到 marker-not-found；marker 显示始终与投影一致。
4. **取消与暂停（AC-03/AC-10）：** 在同一任务内依次 click add 与 pause，看到 user-pause 取消与 paused；跨真实 rAF tick 不变；resume 后继续。
5. **实际 hidden（AC-10）：** 用[已验证 CDP 路线](../../../../engineering/README.md#已验证的-cdp-自动化路线)切换标签页，看到 paused/hidden。返回可见后仍为 paused、resume 可用，显式 resume 后继续且不补跑。不得使用伪造 visibility 或合成事件。
6. **重启与退出：** restart 后 runId 更新、tick=0、反馈清空；exit 后为 idle、无投影；各状态的控件启用与 spec 一致。
7. **键盘（AC-13）：** Tab 聚焦，Enter/Space 能操作启用按钮；禁用按钮不提交；按钮外按键不触发任何游戏动作。
8. **提交计数（AC-11）：** 用临时、可还原的 Profiler 包装或等价提交计数，记录 StrictMode 初次提交基线、无关 tick 更新的增量（应为 0）与 marker 变化的增量。
9. **清理（AC-12）：** 在应用脚本前安装自有计数探针，记录待交付 rAF 请求与 visibilitychange/pagehide/pageshow 监听。
   - StrictMode 初次挂载后，最多一个 owner、一个请求、一组监听。
   - 用临时编辑让 App 暂不渲染 owner 再恢复，完成真实卸载/再挂载：卸载后为 0，恢复后不超过 1。
   - 分别临时编辑开发面板组件与 UI 桥接模块，触发 Vite 更新；若后者回退为整页重载，按实际记录并检查重载后的计数。
   - 确认旧回调不再写 store。
10. **诊断（AC-09）：** 用自有探针令一次 rAF 请求或回调失败，看到 sessionError 与 faulted，不修改生产参数或用户存储。

- 所有临时编辑必须还原，用 `git status` 与 diff 确认无残留；移除探针，dispose 自有 context，停止自有 Vite，不清除用户站点数据。
- 实际 hidden 或 HMR 观测无法取得时，本项记为 blocked，恢复条件写入 goal 执行记录。

## 不包含

- 跨引擎/Safari、真实 GPU、快捷键拦截或性能；P1-10 的项目级 runner。
- 修复功能缺陷：若发现缺口，新增修复子任务，插在 09 前。

## 关键文件与契约

- 07 交付的 [App.tsx](../../../../../src/app/App.tsx) 修改与计划新增的面板、hook 与 owner 文件（只读验证，临时编辑必须还原）。
- [工程约定的浏览器生命周期复现](../../../../engineering/README.md#浏览器生命周期复现)；如本项发现新的稳定操作步骤，更新该节。

## 验收标准

- [x] AC-01/04/05：初始、开始、接受与两种拒绝的 DOM 观测，含 ID、事件字段与 marker 一致性。
- [x] AC-03/10：pending、取消、暂停静止、实际 hidden→visible 仍暂停与显式继续均有真实浏览器证据。
- [x] AC-11：无关更新增量为 0、相关更新有提交，并记录 StrictMode 基线。
- [x] AC-12：StrictMode、卸载/再挂载与两类 HMR 更新后的计数均不超过 1，完全卸载后为 0；旧回调不再写入。
- [x] AC-09/13：诊断错误显示，以及鼠标与键盘的控件交互均符合 spec。
- [x] 临时编辑与探针已清理，工作区无残留；记录浏览器版本、入口、启动参数与清理结果。

## 验证方法

- browser-testing 的启动、驱动、记录与清理流程；证据按“标准、操作、预期、观测、结果”记录在本文件。
- 仅 HTTP 200、截图、旧 P1-05 探针或 Node 结果不能代替本项证据。

## 完成证据

2026-10-02，按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 执行，全部使用自建合成场景（P1 合成 marker，种子 0、60 Hz），未读原版文件，未改用户 profile 或站点数据。

**环境**

- 自有 Vite：`pnpm dev --host 127.0.0.1 --port 5173 --strictPort`，origin 固定为 `http://127.0.0.1:5173/`。
- 浏览器：macOS 上本机 Chrome 154.0.8037.95，headed。
- 1–4、6–10：在 shell 中以临时 `--user-data-dir`（/tmp 下）和 `--remote-debugging-port=9339` 启动的自有 Chrome，窗口约 1000×900；VS Code `runPlaywrightCode` 经 `connectOverCDP` 驱动。
- 5：按[已验证 CDP 路线](../../../../engineering/README.md#已验证的-cdp-自动化路线)，在单次 `runPlaywrightCode` 内用 `browserType().launch()` 启动 Chrome（`--enable-automation`，并移除三项后台抑制默认参数）；通过 `Target.createBrowserContext`/`createTarget`/`activateTarget` 切换标签页，用 `Runtime.evaluate` 读取页面。
- 临时探针 `/tmp/osr-p106-probe.js` 经 init script 在应用脚本之前注入，统计待交付 rAF 请求与 visibilitychange/pagehide/pageshow 监听，可注入一次失败，并记录原生 visibilitychange；探针不在仓库内。

| 标准 | 操作 | 预期 | 观测 | 结果 |
|---|---|---|---|---|
| AC-01 初始与开始 | 载入页面，点击 Start | 初始 idle、无投影；开始后 tick=0、实际频率，随后推进 | 初始 phase=idle、“No current world.”、pending/results 为 None，只有 Start 可用。开始后 scenario=synthetic、tick=0、60 Hz、marker none，随后 tick 推进至 31。在另一次运行中保存的页面文本里，Mover 显示“#1 at (0, 0, 0)”，且没有 Errors 区块 | passed |
| AC-04 接受 | 在同一次页面求值中 click Add marker，只等待两个已解决的 promise 微任务（不让出给其他任务或帧）后读 DOM；之后等结果 | 先只有 pending 与 ID，投影不变；随后 accepted 与 marker 一致 | 同任务内 pending=“run 1 · #1 add-marker: waiting for Core”，marker 前后均为 none，tick 31→31；随后“accepted by Core at tick 33: marker-added entity 2 at (−2.336, −4.997, −2.767)”，marker 显示同一 id 与位置，pending None | passed |
| AC-05 两种拒绝 | 再 Add；Remove；再 Remove | 依次 already-exists、accepted、not-found，marker 与投影一致 | #2 在 tick 36 被拒（marker-already-exists），marker 不变；#3 在 tick 38 marker-removed，marker none；#4 在 tick 41 被拒（marker-not-found），marker none | passed |
| AC-03/10 取消与暂停 | 同一次页面求值中 click Add marker 与 Pause，只等待两个微任务后读 DOM；之后观察真实帧与计时窗口 | 取消（user-pause）而非拒绝；paused；tick 不变且无帧请求 | #5“cancelled by the session: user-pause”，pending None，phase paused、pauseReason user、tick 1202；经 10 个真实 rAF 加 300 ms 仍为 1202，pending=0、maxPending=0；可用按钮为 Resume/Restart/Exit；恢复后 #5 仍为 cancelled | passed |
| AC-10 恢复首帧 | 暂停 500 ms 后，页面内 click Resume，逐帧读取 | 首帧重锚不补跑 | 恢复前 tick 1；之后各帧依次为 1、1、2、2，没有一次性补跑 | passed |
| AC-10 实际 hidden | 第 5 路线：Start 后激活另一标签页约 1.7 s，再激活回来，跨 15 个 rAF 后显式 Resume | 原生 hidden 时自动暂停；返回 visible 仍暂停，Resume 可用；显式恢复不补跑 | 原生日志为 [hidden]；状态 paused、pauseReason hidden、页面可见为 no，tick 停在 37，Resume 禁用。返回后日志为 [hidden, visible]，仍 paused，页面可见为 yes，Resume 可用，15 帧后 tick 仍为 37。Resume 后各帧为 37、37、38，30 帧后为 49，状态 running | passed |
| AC-11 提交计数 | 用临时 `React.Profiler` 包装五个区块（已还原）；StrictMode 首次挂载后依次测四个窗口 | 无关更新时只有投影区提交，相关更新时对应区块提交 | 首次挂载基线各区块 1 次。1 s 内只有 tick 变化（0→55）时，控件/状态/反馈/错误各 0 次，投影 9 次（约 10 Hz）。Add marker 被接受的窗口里，marker 显示由 none 变为 #2，投影 +3（含 marker 变化的那次发布），反馈 +2（pending 与 accepted），控件与状态均为 0。暂停使控件、状态、投影各 +1。暂停期间 500 ms 全部为 0 | passed |
| AC-12 StrictMode | 载入（dev StrictMode 建 A→销毁 A→建 B） | 至多一组监听，无请求 | 挂载后三种监听各 1、pending 0；Start 后 400 ms 窗口内 pending 1、maxPending 1 | passed |
| AC-12 面板 HMR | 临时修改面板标题后还原 | 热更新，owner 与计数不变 | Vite 日志为 hmr update SyntheticDevPanel.tsx，同一文档（标记保留），仍为 running、run 1，400 ms 内 tick 推进 26；三种监听各 1，pending 1，maxPending 1 | passed |
| AC-12 桥接 HMR | 临时修改 synthetic-session-bridge.ts 注释后还原 | 热更新或重载后至多一组 | Vite 日志为“hmr update /src/app/App.tsx”（以 App 为边界热更新，不是整页重载）；同一文档，hook 代码未变，owner 保留 running、run 1；三种监听各 1，pending 1，maxPending 1 | passed |
| AC-12 卸载/再挂载 | 临时让 App 不调用 owner hook，再还原 | 卸载后全部为 0；恢复后为 1 | 卸载后同一文档显示 Preparing，三种监听全部为 0，pending 0，cancel 计数 +1；恢复后新 owner 为 idle，监听各 1、pending 0；Start 后 run 1、pending 1、maxPending 1 | passed |
| AC-12 旧回调不写入 | 探针 v2 保存被取消的 rAF 回调与被移除的生命周期监听；同一文档内依次经历 StrictMode 挂载、卸载与再挂载（再挂载也在 StrictMode 下）；新 owner 运行且 Add marker 被接受后，直接调用全部旧回调 | 当前 owner 的 DOM、计数与错误都不变 | 共重放 1 个被取消的帧回调，以及来自 3 个已销毁 owner 的 9 个旧监听（含 pagehide）。重放后当前 owner 仍为 running、run 1、pauseReason none、页面可见 yes（若旧 pagehide 进入活动会话会暂停），结果仍只有 accepted #1，tick 继续推进（21→45）；sessionError/actionError 为空，pending 1，三种监听各 1，无 pageerror。旧 owner 自身 store 在页面上不可见，其旧回调不写入由 [owner 测试](../../../../engineering/source-structure.md#r5-演示所有者与槽位)与[桥接测试](../../../../engineering/source-structure.md#r6-合成-ui-层)直接断言；桥接订阅组数量同样由 Node 测试计数 | passed |
| AC-13 键盘与内容 | 焦点移到 body 后 Tab 与 Enter；Tab 与 Space；再在 body 上按 p/a/r/Space/Enter/ArrowLeft/Alt；对禁用按钮调用 `click()`；读取页面全文 | 只有可用的原生按钮可聚焦并可操作；没有全局按键；禁用按钮不提交；有合成标记，无导入成功或 HUD | 第一次 Tab 落在 Start（idle 时唯一可用），Enter 后 running；Tab 落在 Pause，Space 后 paused；body 上的按键使 phase/tick/results 均不变；禁用的 Add marker 调用 `click()` 后 pending 仍为 None，也没有 actionError。页面全文含“P1 synthetic engineering demo — not original gameplay”与“No original game content is included.”，只有 Session/Projection/Pending/Recent results 区块，没有导入、成功导入、Canvas 或 HUD 内容 | passed |
| AC-09 诊断 | 运行中让下一次 rAF 请求失败；Restart；再让 cancelAnimationFrame 失败后点 Pause；Exit；重载 | 显示 sessionError 与 faulted；清理失败时显示 actionError 与建议，start/restart 被阻断；重载恢复 | 请求失败：faulted，sessionError 为 scheduler 原因，可用 Restart/Exit。Restart：running，sessionError 清空。取消失败：faulted、cleanupFailed=yes，actionError 为 pause 失败（scheduler），显示重新加载建议，只有 Exit 可用。Exit：idle，仍显示建议，无可用按钮。重载：新 owner 为 idle，只有 Start 可用；全程无 pageerror | passed |

- 尝试过但未作为证据的路线：
  - 在 shell 启动的 Chrome 中，用普通新页面或同一窗口内的 CDP 新标签页切换，加上通过 `Browser.setWindowBounds` 最小化窗口，页面始终报告 visible（`hasFocus()` 也为 true）。原因未确认；该路线只用于非 hidden 检查。
  - 普通 `context.newPage()` 打开在另一个窗口。
  - 这些尝试都没有覆盖 visibility getter 或派发合成事件。
- 正常重启与退出（工作范围第 6 项，与 AC-12 无关）：Restart 后 runId 为 2、tick 0，pending 与 results 为 None，marker none；Exit 后 phase=idle、runId none、“No current world.”、results None，只有 Start 可用。
- 计数说明：Playwright 的 `waitForFunction` 与 locator 等待用 rAF 轮询，会计入探针；早期一次读数 maxPending=2 即由此造成。正式计数只在页面内基于定时器的窗口中读取，并先重置最大值。
- 清理：
  - 第一次在调用内启动的浏览器失去句柄，经核对为本轮自建（临时 Playwright profile），已按 PID 停止。
  - 第 5 路线的 context 用 `Target.disposeBrowserContext` 销毁，浏览器在同一调用的 `finally` 中关闭。
  - shell 启动的 Chrome 与 Vite 已停止，5173 与 9339 均无监听；临时 profile、探针、CDP 脚本与源码备份已删除。
  - 三个源码文件中的五次临时编辑（面板的 Profiler 与标题、桥接注释、App 卸载两次）都已从备份还原，`git diff -- src` 为空。
  - 旧回调补测后，自有 Chrome 与 Vite 再次停止，临时 profile、探针 v2 与备份已删除；两次的 VS Code 入口页在关闭时都已不存在。
- 本项只做浏览器验证与文档，没有生产代码改动，因此不执行 simplify。
- rubber-duck：
  - 认可桥接 HMR 以 App 为边界热更新且 owner 保留、实际 hidden 改用单独启动的 Chrome（同一 origin）、以及两个微任务内读取 DOM，三者均属有效证据。
  - 指出三处不足，均已处理：
    - 旧回调不写入原先只有计数间接支持：补做了旧回调重放，并注明哪些由 Node 测试直接断言。
    - AC-11 原先缺少 marker 变化时的提交增量：补充了已保存的投影 +3。
    - AC-01 的 mover 与无错误区块、AC-13 的合成标记与无导入/HUD 内容、正常重启/退出的观测原先未写入：补充了已保存的观测。
  - 另更正了临时编辑的计数表述。
- 文档影响：[工程约定](../../../../engineering/README.md)的 CDP 路线下补充本轮发现的工具约束：调用之间不保留全局变量、shell 启动的 Chrome 不报告 hidden、rAF 轮询会污染计数、init script 随连接注册。
