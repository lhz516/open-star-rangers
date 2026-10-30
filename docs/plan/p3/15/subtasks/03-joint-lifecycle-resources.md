---
type: plan
status: active
phase: "P3"
task: "15"
subtask: "03"
updated: "2026-10-29"
---

# 03 — 联合生命周期与资源平衡

**契约来源：** [spec](../spec.md) 的 S-03、[行为与边界](../spec.md#行为与边界)“暂停、地图、隐藏/返回、重试、返回菜单与卸载”；AC-03、AC-04。
**依赖：** 01。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新建 `e2e/joint-lifecycle.development.spec.ts` 与必要的 `e2e/support/joint-lifecycle.ts`，用 01 的变体包：
  - 暂停与继续：tick 停止，继续不追赶；地图打开时 tick 继续推进（地图不是暂停）。
  - 真实隐藏：以 [native-lifecycle.ts](../../../../../e2e/support/native-lifecycle.ts) 的 `nativeBrowser` 在真实标签页切换下隐藏飞行与地图中的运行，断言 `phase`、tick 不推进、按住的输入被清除；返回可见后须显式继续，且不追赶隐藏时间。不得以模拟 `visibilityState` 替代。
  - 成功与失败结果页的重试、返回主菜单与任务画面卸载：每个检查点以 [resource-balance.ts](../../../../../e2e/support/resource-balance.ts) 读取所有者级帧、计时器、监听器、离页保护、音频上下文/声源与渲染资源，断言回到对应基线；任一时刻至多一条游戏循环；旧运行的声源或回调不再活动；重试不复用旧运行。
- 失败读数保留基线/末值与失败项，不放宽阈值。

## 不包含

- 闭环步骤本身的断言（01、02）；生产构建（02 已覆盖用户流程，本项只在 development 取得可读资源探针）。
- 修改资源平衡设施或产品代码；发现泄漏作为差异交回责任任务。

## 关键文件与契约

- 现有：[joint-resources.spec.ts](../../../../../e2e/joint-resources.spec.ts)、[native-lifecycle.spec.ts](../../../../../e2e/native-lifecycle.spec.ts)、[mission-result.development.spec.ts](../../../../../e2e/mission-result.development.spec.ts) 中的真实隐藏用例、[resource-balance.ts](../../../../../e2e/support/resource-balance.ts)、[native-lifecycle.ts](../../../../../e2e/support/native-lifecycle.ts)。
- 01 交付：`e2e/support/joint-loop.ts`。
- 计划新增：`e2e/joint-lifecycle.development.spec.ts`、`e2e/support/joint-lifecycle.ts`。

## 写入范围

- `e2e/joint-lifecycle.development.spec.ts`：联合生命周期与资源平衡用例。
- `e2e/support/joint-lifecycle.ts`：本项专用的观察辅助。

## 验收标准

- [x] AC-03：暂停/真实隐藏期间 tick 不推进、恢复须显式继续且不追赶；地图中 tick 继续；隐藏与恢复后输入已清除；重试不复用旧运行。真实隐藏由真实标签页切换产生。
- [x] AC-04：成功与失败两条结果路径的重试、返回菜单与卸载后，各资源组回到基线，任一运行至多一条循环，无旧运行音源或回调活动；证据附每个检查点的基线/末值。
- [x] 网络审计无违规；`pnpm typecheck`、`pnpm lint` 通过，已按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 执行：`pnpm test:e2e e2e/joint-lifecycle.development.spec.ts --project=development`，连续两次通过。需要本机未锁屏的桌面会话；锁屏时有头窗口一开始即隐藏，此时 blocked，恢复条件为解锁后重跑，不以无头结果替代。

## 完成证据

- **2026-10-29（worker exec/p3-15-03）：**
  - **实现：** 新增 [joint-lifecycle.development.spec.ts](../../../../../e2e/joint-lifecycle.development.spec.ts) 与 [joint-lifecycle.ts](../../../../../e2e/support/joint-lifecycle.ts)。
    - 只读复用 01 的 [joint-loop.ts](../../../../../e2e/support/joint-loop.ts)：变体包与受信输入辅助。support 中的 `flySuccess`/`flyFailure` 按 01 的输入顺序精简驱动整条运行，不重复 01 的逐步断言。
    - 输入只有游戏输入区按键、锁定指针移动与点击，以及页面自身控件；开发面板只读事件日志、状态，并导出录制。没有状态写入；全程开启网络审计。
    - 所有者读数 `ownerProbe` 是自包含的页面函数，Playwright 页面与原生 CDP 目标都能执行。它读出：
      - 各组所有者监听：session、audio、keyboard、fullscreen、pointer-lock、render；
      - 本窗口的帧，以及“上次读数以来同时挂起的自有帧最大数”（即循环数）；
      - 待触发计时器与已排计时器总数、离页保护、WebGL 画布、Pointer Lock；
      - 音频：上下文状态、已启动和仍连接的声源、`routed`。

      `expectOwner` 按位置（介绍、开始页、出发、运行、暂停、衔接保持、结果页）断言这些值；每个检查点都要求“上次读数以来至多一条循环”，所以运行期间的循环数在相邻读数之间连续受检。
    - 菜单终点用 [resource-balance.ts](../../../../../e2e/support/resource-balance.ts) 的 `ResourceBalance.check` 与同文档基线比较，要求音频探针存在；原生目标没有 Playwright 页面，改用同一 `compareBalance`（`NativeBalance`）。
  - **验证：** `OSR_E2E_DEV_PORT=5109 OSR_E2E_PREVIEW_PORT=5110 pnpm test:e2e e2e/joint-lifecycle.development.spec.ts --project=development` 连续两次通过。
    - 每次 3 passed，分别用时 4.4 min 与 4.2 min。成功用例约 2.0 min，失败用例约 1.9 min，真实隐藏用例 15–18 s。
    - 两次运行之前，修正原生用例中的竞态时曾有一次失败（见“审查与修正”）。
    - 真实隐藏由有头 Chrome 156.0.8078.74 中 CDP 创建的 context 的两个标签页以 `Target.activateTarget` 切换产生；不模拟 `visibilityState`。运行前确认本机未锁屏。
  - **AC-03（第二次运行的读数）：**
    - **暂停与继续（成功运行 1）：**
      - 首次击毁后按住 `]`，在输入区按 `p`：phase paused（user），焦点仍在输入区，上下文 suspended。检查点 tick 81、无帧请求；1.5 s 内 tick 不变。
      - 再按 `p`：按页面时钟，继续后首帧之后显示的每个 tick 都不超过 `⌊Δt/31.25 ms⌋+1`，即不追赶。之后为 running，tick 105，帧 1/24/24。
      - `]` 到继续之后才抬起。录制中它在暂停之前有俯仰，暂停 tick 起俯仰全为 0。
    - **地图不是暂停：** 地图打开且锁定后仍为 running；800 ms 内 tick 前进至少 16，单循环，帧 1/25/25，桥接上下文为 map。
    - **真实隐藏，飞行中（原生）：**
      - 按住 `]` 8 tick（pressed 15）后切到另一标签页：hidden，paused（hidden），tick 26。隐藏 1.5 s 窗口内无帧、无计时器、无连接声源，上下文 suspended。
      - 返回可见：经 3 个真实动画帧加 400 ms 仍为 paused（hidden）、tick 26，焦点仍在输入区。
      - 在输入区按 `p` 才继续，不追赶。录制中 `]` 在隐藏 tick 前有俯仰，之后全为 0；它的 key-up 在继续之后才发出。
    - **真实隐藏，地图中（原生）：**
      - 地图打开锁定、tick 前进后隐藏：paused（hidden），tick 73，Pointer Lock 已释放，桥接仍为 map/open。
      - 可见后仍 paused、tick 不变、未重新锁定。
      - `p` 继续：不追赶，map/open 继续推进；`p` 的激活使地图重新取得锁定，符合 P3-05 的地图锁定规则。
      - 原生 visibilitychange 序列末四项为 hidden、visible、hidden、visible。
      - 地图中按住的键不按 tick 作用：轴为 0，开火只在飞行，见 [input-action.ts](../../../../../src/ui/game-input/input-action.ts) 的 `HELD_CONTEXTS`。所以按住输入的清除在飞行中经录制核对，地图中核对 Pointer Lock 的释放。
    - **重试不复用旧运行：** 两个用例的 Restart 都回到同一 owner 的介绍，会话监听身份相同，run 为空。下一次 Start 是 run 2、tick 0、种子为第二个，开发状态 tick < 300。
  - **AC-04（第二次运行的检查点；监听依次为 session/audio/keyboard/fullscreen/pointer-lock/render，“帧”为最多同时挂起/请求/送达）：**

    | 检查点 | 成功 | 失败 | 期望 |
    |---|---|---|---|
    | 介绍 | 计时器 1、保护 0、监听 3/3/5/2/5/6、无上下文 | 同 | 菜单基线之外只有所有者 |
    | 出发（run 1） | 计时器 1、保护 1、帧 0、上下文 running、无声源 | 同 | 出发不推进 |
    | 飞行（run 1） | 帧 1/24/24、键盘 9、画布 1、声源 1 | 帧 1/24/24、声源 2 | 单循环 |
    | 衔接保持 | G-02/3：计时器 1、保护 1、帧 0、画布 0、声源 0 | G-02/5：同，声源 1 | 救援 11381 按 P3-14 D2-13 在保持中继续，不断言 |
    | 结果页 | 帧 0、计时器 0、保护 1、声源 0、上下文 running | 同 | 结果页无声 |
    | Restart 介绍 / 开始页（1.5 s 窗口） | 同一 owner 与会话监听；保护 0；已启动声源与结果页相同（44），已排计时器不增（8） | 同（16、8） | 无旧运行声源或回调 |
    | 飞行（run 2） | 帧 1/24/24、同一上下文 running、新声源 | 同 | 单循环 |
    | 主菜单 | 所有者监听全为 0、帧 0、计时器 0、保护 0、上下文 closed:resolved | 同 | 卸载 |

    - **菜单资源平衡：** 成功、失败与原生三处都没有差异项，`unverifiedContextLoss` 为空。
      - 基线：活动监听 162（原生 149）、无画布、无计时器、无上下文。
      - 末值：两块画布均已离开文档且上下文已丢失；帧 0/0/0、无待触发计时器、唯一上下文 `close()` 已 resolve、`routed` 0。
      - 末值的活动监听数为 176（原生 157），比较按组与 React 元素监听规则判为相等。
    - **循环：** 全部检查点的“上次读数以来循环数”最大为 1。
    - 完整读数、基线/末值与报告在用例附件 `joint-lifecycle-success`、`joint-lifecycle-failure`、`joint-lifecycle-native`、`resource-balance`、`native-resource-balance`。
  - **网络审计：** 三个用例 `complete: true`，无违规、无缺口；只有浏览器自己的 favicon 404。审计 canary 为测试入口的源指纹。没有浏览器错误。
  - **审查与修正：**
    - rubber-duck（code-review 子代理）提出三项，均已采纳：
      1. 原“run 2 只有新声源”的检查不可能失败。改为：从结果页到重试后的开始页，已启动声源数与已排计时器数不变，并留出 1.5 s 窗口。
      2. 开发事件日志会按运行过滤，“日志为空”证明不了旧回调已停。已删除该检查。
      3. 原生用例原先用 Resume 按钮继续，焦点离开输入区会清键，因此无法证明是隐藏清的键。改为保持焦点、按 `p` 继续，并断言焦点未离开。
    - 首轮验证另发现三处测试自身的问题，均已修正：
      - 隐藏页的计时器被 Chrome 节流，页面内 400 ms 窗口超过 CDP 的 5 s 超时。隐藏读数改为在可见侧标记窗口起点，由 Node 计时。
      - 地图中 `p` 继续后重新锁定，导出录制的点击落到锁定区。改为先按 `m` 关闭地图（结束锁定）再导出。
      - `m` 的锁定请求未落定时补点击，引起竞态。改为与 `openLockedMap` 相同：等到已锁定或出现“Click the map”提示后再点击。
    - 失败用例原先断言救援保持中无声源，与 P3-14 D2-13 不符，已删除。
    - simplify（按四个角度自查本项两个文件）已采纳：去掉未用的返回值、`time` 字段与 `until` 依赖，`NativeBalance.check` 改为直接轮询，`TICK_MS` 不再导出。
    - 未采纳：复用 [map-warp.ts](../../../../../e2e/support/map-warp.ts) 的 `watchResume`。它只记录点击，本项还需 keydown，且不得修改该文件。
  - **工程检查：** `pnpm typecheck`、`pnpm lint` 通过。`pnpm check` 通过：445 个测试文件、11,900 个测试，构建成功。
  - **产品差异：** 未发现泄漏或违背契约的行为，没有交回项。
  - **文档影响：** `docs/engineering/README.md` 的 E2E 说明归子任务 10，建议措辞写在 worker 报告中；本项不改其他文档。

