---
type: plan
status: active
phase: P1
task: "05"
subtask: "07"
updated: 2026-10-02
---

# 07 — 真实 Chromium 生命周期证据

**契约来源：** [spec](../spec.md) 的 S-03、S-04、S-06、S-08，AC-03、AC-07、AC-09、AC-13、AC-14（真实适配/使用文档）。
**依赖：** 03, 06。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 用已实现的 host/session 公共 API 在隔离 Chromium 加载临时 DOM 合成探针，显示 phase/runId/tick/error 和只读帧视图，不接生产 App/main、不增加正式演示页面。
- 在 host 创建前记录其 add/removeEventListener 和 request/cancel，验证实际三份监听与唯一请求；真实 rAF 驱动 tick，pause 后 tick 稳定、resume 明确重锚且无回退。
- 重复 start/pause/resume/restart/exit→start/dispose→新 owner，旧回调/旧句柄不影响新运行；使用计数和公开 projection，不以 HTTP 成功或 Canvas 存在作证。
- 切换实际标签页/窗口取得真实 hidden，返回 visible 后不自动继续，记录 document.visibilityState。工具做不到时须用户手动浏览器观测；都不可得则保留 blocked，不免除 AC-13。
- pagehide/pageshow 用浏览器事件探针确认绑定与离页阻断，明确不证明 BFCache。正常 dispose 后三个监听逐一撤销，停止帧通知。
- 在完成证据记录 origin/引擎、setup/action/expected/observed/result、清理；更新实际复现操作说明，不把临时探针提交成产品。

## 不包含

- 不修功能代码；发现缺口进入正常修复项，不能在 browser-testing 期间改应用。
- 不装 E2E runner/Playwright 项目依赖，不做 GPU、原版、实机快捷键或 React StrictMode/HMR 验收。

## 关键文件与契约

- `src/platform/browser-session-host.ts`、`src/app/synthetic-session.ts`（03/04–06 计划交付，本项只读）。
- [engineering](../../../../engineering/README.md)（已有，本项补充实际验证过的入口、复现与自有探针清理说明）；不额外创建仅为重复工程说明的 guide。
- 临时 DOM 探针/观测文件位于执行时确定的安全自有临时位置，只服务验证并清除，不新增 tracked 应用/测试代码。

## 验收标准

- [x] AC-13：真实 rAF 的运行/暂停/显式恢复/重启/退出/销毁→重建观察与公开状态一致；暂停/恢复状态对不回退。
- [ ] AC-07/13：实际 hidden 与 visible 已观测，回前台仍 paused；自动化或用户手动证据准确，不用伪造 getter 代替。
- [x] AC-09/13：注册三类真实监听、正常 dispose 逐项撤销、旧回调无通知；pagehide/pageshow 探针不被描述成 BFCache。
- [x] AC-14：探针、页面/上下文及自有服务器清理完成，无 App/main/依赖/存储变更；直接相关文档含 updated 日期、可复现步骤。

## 验证方法

- 必须调用 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)。先检查工具隔离与 Chromium 能力，复用/启动 `pnpm dev --host 127.0.0.1 --port 5173 --strictPort` 时先确认端口空闲，记录实际 origin，HTTP 仅证明启动。
- 不要求精确真实 FPS；每次回调/生命周期输出与单个请求的计数是判据。tick 观察使用条件等待，暂停后跨实际 rAF 观测期间保持相同；精确时间阈值已由 Node AC-04 验证。
- rubber-duck 对本项实际证据及文档做契约复核；无实现代码不执行 simplify。文档链接/元数据检查，不跑无关 build。
- 清理只操作自有探针/上下文/进程，不清用户站点数据；缺少真实 hidden/工具时如实 blocked。

## 完成证据

- 2026-10-02：browser-testing 已调用，真实 Chromium 154.0.8037.95 / macOS，独立 context，viewport=1000×700，固定 origin `http://127.0.0.1:5173/`，真实 Vite 与公共模块导入。临时 DOM `<pre>` 显示 phase/runId/tick/error，无 App/main、依赖、存储或 Core 修改。
- 在适配器创建前包装真实 add/remove 与 request/cancel；自动循环的请求集合记录 maxPending=1。探针另有自己的 visibility 观察监听，单独计数，不能把它算作适配器第四个监听。

| 判据 | Setup/action | Expected | Observed | Result |
|---|---|---|---|---|
| AC-03/13 真实循环 | start；等待 tick≥3；pause，跨两个真实 rAF 观察 | 稳定 running 一请求，pause 无推进/持续通知 | tick=2121、pending=1；暂停 pair=2121/2121 alpha=0；随后 tick 不变、pending=0、帧数不变 | passed |
| AC-13 恢复 | 显式 resume，读取首正常帧 | 0 tick，呈现不倒退 | 首 report={ticks:0,capped:false}、pair=2121/2121、alpha=0；另一次恢复 pair=5023/5023；后续真实 tick 前进 | passed |
| AC-13 身份 | restart、exit→start、旧 run 读取 | 新身份/tick0、idle 零请求，旧能力拒绝 | runId=2/tick0/pending1；exit idle/pending0；start runId=3/tick0/pending1；旧读取 invalid-state | passed |
| AC-07 页面绑定 | 派发 pagehide/pageshow，再显式 resume | 离页阻断；pageshow 仅更新环境，不自动运行 | pagehide paused/hidden/environmentVisible=false/pending0；resume 拒绝；pageshow paused/environmentVisible=true/pending0 | passed（不是 BFCache/真实 hidden） |
| AC-09/13 收尾 | dispose，调用旧取消回调，再新建 owner | 三监听逐项移除，旧通知不增，新循环独立 | remove visibilitychange/pagehide/pageshow 各一次；帧数 17132 保持；disposed/runId=null/pending0；新 owner tick0→1，maxPending=1，资源清理 [1,2,3,1] | passed |
| AC-07/13 实际 hidden | 新标签页 bringToFront 后返回；另试最小化目标浏览器窗口 | 实际 document.visibilityState=hidden→visible，返回仍 paused | 两种操作都仍为 visible、visibilityLog=[]，tick 继续；没有实际 hidden 证据 | blocked |

- 实际页面错误列表为空，会话 errors=[]。本轮仅浏览器验证/文档，没有实现改动，不执行 simplify。完整工程结果复用 [06](./06-failure-recovery-replay.md#完成证据)，不以 build 代替 hidden。
- 能力替代尝试：默认 headed Chromium 启动报 runner 所期望的浏览器可执行文件缺失；读取当前浏览器启动路径的协议能力也不可用（未启用 automation）。随后找到现有 Chrome 二进制，用新临时 profile 明确 headless=false 启动，并另试移除默认后台抑制参数；同窗口不同标签页切换/原生最小化仍全部 visible。两份额外自有浏览器均已关闭，未安装/下载新工具。没有伪造 getter、派发 visibilitychange 或强制 lifecycle 状态来填 AC-13。
- 手动证据请求工具返回用户不在场，不能把推荐答案当成实际观测。恢复条件：可产生真实标签页 hidden 的隔离 Chromium，或用户按 [engineering 复现步骤](../../../../engineering/README.md#浏览器生命周期复现)提供实际 hidden→visible、暂停 tick 与返回仍 paused 的记录。
- 清理完成：两个自有页面/独立 context 已关闭，临时探针/包装随 context 移除；自有附着 Vite 已停止，两个自有工具日志/快照已删除。无原版/用户站点数据操作。
- 文档影响：engineering 增加已使用的公共入口复现步骤；STATUS 记录阶段级浏览器证据阻塞，不勾 GameRuntime 或 StrictMode/HMR。研究 guides/原版事实/冻结决定无需变更。
- rubber-duck 对本项证据/文档复核，无阻断问题；按建议将恢复/身份行仅标 AC-13 子面，避免混入 02/04 的 Node 精确验收归属。07 保持 blocked，不执行依赖未满足的 08。
