---
type: plan
status: active
phase: P3
task: "14"
subtask: "29"
updated: 2026-10-28
---

# 29 — 完整 e2e 套件的修复（补救）

**契约来源：** [spec](../spec.md#验证策略) 的 S-10、AC-12、AC-13。
**依赖：** 23。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 23 的完整 `pnpm test:e2e` 有 3 项失败，在 23 的基线 `78b9e4c4` 上同样失败：`browser-replay.spec.ts:47`（期望的事件集合缺 08 新增的 `object-retired`）、`flight-render.development.spec.ts:63`（缩放 0.7578125 时 12 个像素不同）、`mission-flow.development.spec.ts:353`（网络审计中没有匹配开发规则的 `/favicon.ico` 请求）。
- 逐项查明来源：在 main（`0180ada9`）的独立检出上运行同一用例，判断是 P3-14 引入（08 的事件、20 的表现扩展、18 的接线等）还是 main 上既有。
- P3-14 引入的，按原有断言意图修正（期望集合按契约更新；像素差查明根因后修代码或有依据地更新期望），不放宽判据；main 上既有的，记录证据与归属，不在本任务修改其他任务的行为。

## 不包含

- 不改动与上述 3 项无关的用例；不新增浏览器 runner。

## 写入范围

- `e2e/browser-replay.spec.ts`：事件集合期望。
- `e2e/flight-render.development.spec.ts`：仅在查明 P3-14 引入且期望须更新时。
- `e2e/mission-flow.development.spec.ts`：仅在查明 P3-14 引入时。
- `src/render/flight/presentation/**`：仅在像素差源于 20 的表现扩展时的修复与测试。

## 验收标准

- [x] 3 项各有来源结论与证据（main 上的复现结果）。
- [x] P3-14 引入的项已修正，开发与生产项目中相关用例通过；完整 `pnpm test:e2e` 中不再有 P3-14 引入的失败。
- [x] 未放宽任何判据；main 上既有的失败已记录归属。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 运行相关项目；main 的对照在临时检出中运行，用后删除。
- `pnpm check` 通过。

## 完成证据

环境：macOS，Chrome 156.0.8078.73（Playwright channel `chrome`，headless），端口 5187/5188。main 对照在 `0180ada9` 的临时分离检出中运行（另在 P3-13/27 的 `1ff26e7b` 跑过一次），用后已 `git worktree remove`。全部只用合成内容。

| 用例 | main | 本分支（改前） | 来源结论 | 处理 |
|---|---|---|---|---|
| `browser-replay.spec.ts:47` | 通过 | 必然失败 | P3-14 引入（08） | 期望集合加入 `object-retired` |
| `flight-render.development.spec.ts:63` | 单独运行 3 次失败 2 次（另 2 次单独运行也失败），签名相同 | 单独运行 4/4 失败；本次完整套件中通过 | main 上既有，非 P3-14 | 未改，记录归属 |
| `mission-flow.development.spec.ts:353` | 24/24 通过 | 5/14 失败 | P3-14 引入（飞行声音触发浏览器探测） | 测试在最后一次重载前等探测落定 |

- **`browser-replay.spec.ts:47`（已确认，P3-14 引入）：** 用例断言参考重放的事件类型集合恰为 4 种；08 按 FA-07/D1-05 新增 Core 事件 `object-retired`。在 Node 中复跑同一脚本输入（320 tick）得到 64 条，全部为 `area-switch`（kindBit 14×57、17×4、7×2、1×1），即活动区域外的对象进入区域切换。修正：[browser-replay.spec.ts](../../../../../e2e/browser-replay.spec.ts) 的期望集合加入 `object-retired`，仍是精确集合比较（多或少任何类型都失败）。修正后 development 通过（该文件只在 development 项目运行）。
- **`flight-render.development.spec.ts:63`（已确认为 main 上既有；原因未确认）：** 失败签名在 main 与本分支完全一致：`12 pixels at scale 0.7578125`，逻辑坐标 x 259、377–383，y 191–192，位于 P3-13 驾驶舱叠加元素（目标框顶部的标签）的边缘。在 `1ff26e7b`（P3-13/27，当时记录该用例通过）上同样失败。本机 Chrome 于 10-26～10-27 由 155 自动更新到 156；P3-12/25 与 P3-13/27 的通过记录均在 Chrome 155 上（高概率与浏览器更新有关，但无法在本机启动 Chrome 155 验证，故为未确认）。失败是间歇的：单独运行多数失败，本次完整套件中通过。P3-14 没有改动驾驶舱、飞行画面或该用例的像素判据（本分支对该文件的唯一改动是 18 把“在制提示”断言换成音效状态），未在本任务修改。归属：P3-12 的缩放取样判据（AC-05、AC-16）与 P3-13 的驾驶舱叠加，建议由 P3-13 的后续维护或最终对齐统一跟进。
- **`mission-flow.development.spec.ts:353`（已确认，P3-14 引入）：** 违规记录为 `GET /favicon.ico`，类型 Other、发起者 page、`delivery: sent`，既无状态也无失败。网络策略的 favicon 规则（[e2e-network-policy.ts](../../../../../tools/e2e-network-policy.ts) `#favicon`）只接受 404 或 `ERR_ABORTED`，其单元测试有意把无结果的探测判为违规。
  - 计时诊断（临时日志，已撤回）：失败时的探测在最后一次“接受离开”重载发出文档请求后约 20 ms 才发出，之后没有任何 CDP 结果事件。main 上只有第一个文档发出探测；本分支在每次运行开始发声后都会多一次探测。
  - 最小静态页复现（Chrome 156）：普通页面重载 3 次只探测 1 次；页面启动 AudioContext 振荡器后约 300 ms 内探测一次。`suspend`、重载本身都不触发；新文档首次发声时再触发。
  - 本用例中，可信的 Start 点击使声音为 `available`，发声后 20～180 ms 出现探测（5/5 次测得）。用例原先在 `tick > 0` 后立即重载，于是探测与导航竞争，有时被丢弃且无结果。
  - 修正：[mission-flow.development.spec.ts](../../../../../e2e/mission-flow.development.spec.ts) 在 Start 前读取审计已落定的 favicon 探测数，`tick > 0` 后至多等 2 s，直到审计中多出一个已落定的探测，再执行“接受离开”重载。审计与策略本身未改，所有记录仍按原规则判定；若探测仍无结果，用例照样失败。不要求浏览器必须探测（超时后直接继续），以免依赖 Chrome 未成文的行为。修正后 12/12 次通过。该文件只在 development 项目运行。
- **完整套件：** `OSR_E2E_DEV_PORT=5187 OSR_E2E_PREVIEW_PORT=5188 pnpm test:e2e`：288 通过、9 跳过、1 失败（28.9 min，机器负载约 11）。上述三项均通过。唯一失败的是 `keyboard-input.development.spec.ts:45`（“Ctrl routed the lateral key to roll”）：该次录制中 Ctrl+' 按住期间 15 个 tick 的 roll 都是 0。单独重复 10 次，本分支与 main 均 10/10 通过；P3-14 没有改动按键路由（只给 `use-input-focus.ts` 加了 `zoneElement` 引用）。判断为高负载下的计时问题，不是 P3-14 引入，未修改。23 的完整套件中该用例也通过。
- **检查：** `pnpm check` 通过（Vitest 445 个文件、11900 项，含生产构建）。
- **rubber-duck：** 无阻塞或非阻塞问题。确认精确集合仍严格；等待只调整导航时机，不压制审计失败；不强制要求探测出现是合适的；中途多次调用 `audit.report()` 安全（每次只做 drain 与快照）；未发现其他在发声后立即导航的同类竞争。
- **simplify：** 只改测试代码，两处改动已最小，未单独运行。
- **文档影响：** [engineering/README.md](../../../../engineering/README.md) 网络审计一节写有“浏览器自己的 `/favicon.ico` 探测单列为 `known-404`”。建议补一句：Chrome 156 在页面首次发声时也会探测 favicon，发声后立即导航的用例须先等探测落定。该文件不在本子任务写入范围，已作为提议转交协调者。其余文档无需更新。
