---
type: plan
status: active
phase: P3
task: "08"
subtask: "24"
updated: 2026-10-15
---

# 24 — 浏览器回归

**契约来源：** [spec](../spec.md) 的 AC-10（`b` 的浏览器部分）、AC-14（导入与缓存的浏览器部分）、AC-17（浏览器生命周期）；[验证策略](../spec.md#验证策略)的浏览器验证。
**依赖：** 13, 22, 23。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 用合成内容验证：
  - 导入新 schema 的合成包、缓存恢复、旧 schema/旧转换器版本缓存不恢复与重新导入提示、坏包的错误反馈；网络审计保持有效；
  - 真实会话中 AI 推进（断言 Core 状态或事件变化，不只看 Canvas）、暂停/隐藏/恢复、AI 故障的显示、退出与重新进入后的清理；
  - 若纳入 `b`：在飞行中触发，断言实体与事件变化及失败反馈。
- 先选相关现有用例（[cache-recovery](../../../../../e2e/cache-recovery.spec.ts)、[mission-flow.development](../../../../../e2e/mission-flow.development.spec.ts)、[keyboard-input.development](../../../../../e2e/keyboard-input.development.spec.ts)、[joint-pipeline.development](../../../../../e2e/joint-pipeline.development.spec.ts)），再按需扩展；运行 `pnpm test:e2e`（不属于 `pnpm check`）。
- 合成按键不证明系统快捷键拦截；实机责任仍归 P3-05/P3-15。

## 不包含

- AI 画面与 HUD（P3-12、P3-13）；完整闭环（P3-15）。

## 关键文件与契约

- 已有：[e2e/](../../../../../e2e/) 的 runner 与支持、[mission.test-support.ts](../../../../../src/app/mission/mission.test-support.ts)。

## 写入范围

- `e2e/**`：回归用例与支持。
- `src/app/mission/mission.test-support.ts`：合成任务包的 AI 内容。

## 验收标准

- [x] AC-14 的浏览器部分：导入、恢复、拒绝与反馈正确，网络审计通过。
- [x] AC-17 的浏览器部分：暂停/恢复/退出/重新进入后 tick、状态与清理正确。
- [x] AC-10 的浏览器部分（纳入 `b` 时）。
- [x] `pnpm test:e2e` 的相关项目通过，`pnpm check` 通过。

## 验证方法

- browser-testing 的合成流程；断言实际状态、事件与资源平衡。
- 按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理本项范围。

## 完成证据

- **用例：** 新增 [ai-wingman.development.spec.ts](../../../../../e2e/ai-wingman.development.spec.ts)（5 项，development 项目，全部经网络审计并以文件名标记作 canary）与支持 [ai-wingman.ts](../../../../../e2e/support/ai-wingman.ts)；[production-cache.ts](../../../../../e2e/support/production-cache.ts) 的 `seedProductionCache` 增加可选的包键（来源指纹、转换器版本），缺省仍为生产包键，现有调用不变。全部为合成内容：`mission-startable` 合成光盘经真实 Worker 导入，或其 Node 转换结果替换一个规则数据 payload（按自身 schema、长度与 SHA-256 重新标识）后写入测试自己的隔离缓存。`mission.test-support.ts` 无需改动。
- **AC-14（导入、恢复、拒绝）：** 导入后 IndexedDB 中只有一个包，键的转换器为 `osr-import.graphics-5.logic-4.audio-2.models-4`，`data/ai-programs` 记录的 payload schema 为 2；重载后“Open saved resources”恢复为 restored and verified、Mission loads into Core，并实际运行。转换器 `…logic-3…` 下、`ai-programs` 为 schema 1（无关键字表）的旧包：主菜单为 None in this browser、不提供恢复、入口为 `no-package`；再次导入在旁保存新包，旧包的包记录与 payload 记录逐项不变，重载后只提供新包且校验恢复。当前键下的 schema 1 payload 与关键字表内大小写折叠后重名的 payload：缓存校验恢复、入口可用，但开始时世界创建以 payload 自身的诊断拒绝（`logic[data/ai-programs].descriptor.payloadIdentity.schemaVersion` 与 `…aiPrograms.keywordTables[0][n].name`），有僚机与无僚机两种选择都停在开始页、无 run、无离页保护。
- **AC-10（`b`）：** 飞行中在输入区按 `b`：恰好一个 `drop-transponder` 结果 accepted、同 tick 一个 `transponder-deployed`（`creatorEntityId` 为玩家），面板刷新后新增一个 kind 14、来源 `rules` 的实体，与任务声明的 5 个 kind 14（来源 `mission#8`）区分；导出的录制在 Node 重放到末 tick，该实体为 `source: null`、`transponder.creator: 'player'`。失败反馈：地图中按 `b` 不产生命令；面板编辑器提交 `drop-transponder` 得 ignored / `wrong-context`，不新增实体。
- **AC-17（真实会话的 AI 推进、暂停/隐藏/恢复、故障、退出与重新进入）：**
  - AI 推进：32 tick 内每个敌机与僚机的位置都改变；导出录制经 `runReplayCheck` 在 Node 以同一合成光盘重放，事件与检查点完全一致，重放末状态的控制器为 interpreter、parked、wingman，解析缓存非空。僚机命令：以 comm-menus 变体（第一类别列出僚机种类，转换出的合成菜单不列僚机）按 `c`、`1`、`2`，`command-delivered`（接收者僚机、code 7）之后 `wingman-command-consumed`（code 7、path active、outcome status、replyLine 0xB–0xD 之一）与同 tick 的 `radio-queued`。
  - 暂停：Pause 后 tick 1 s 不变，两次刷新的实体行（位置、状态、活动）完全相同，事件日志计数不变；Resume 从暂停 tick 继续，恢复后首帧起每个显示的 tick 不超过经过时间所允许的数量（不补墙钟），每个 AI 飞行器继续移动。
  - 真实隐藏：headed Chrome 经 CDP 自建上下文与两个 target，`Target.activateTarget` 切换得到原生 `hidden`/`visible`：隐藏时自动暂停（`pause=hidden`）且 tick 1.5 s 不变；可见后仍暂停，状态为隐藏时的 tick、AI 飞行器相对隐藏前已移动、600 ms 后再次刷新完全相同、日志计数不变；显式 Resume 后每个 AI 飞行器继续移动；最后回主菜单，释放上下文。
  - 故障：每个状态脚本换为自跳转动作（安装脚本保留）的 ai-programs 变体：起飞后 run 为 faulted，提示显示 `GameRuntimeError (kind faulted)` 与 `CoreFaultError (code budget-exhausted, site ai.dispatches-per-run)`，tick 停在 1，快照与导出不可用；回主菜单后无 run、无离页保护；同一文档再次导入合成光盘替换故障包后，新 run 正常推进。
  - 退出与重新进入：回主菜单后无 run、无离页保护，资源平衡回到基线；重新进入的 run（下一个种子）实体集合与首个 run 开始时相同、没有上一 run 的应答机或事件，AI 飞行器集合相同并再次移动；再次退出后资源平衡通过。
- **检查：** `pnpm check` 通过（typecheck、lint、339 个文件 10,031 项、build）。`playwright test e2e/ai-wingman.development.spec.ts --project development` 5 项通过，`--repeat-each=2` 10 项通过（端口 5175/5176）。相关现有用例（cache-recovery、mission-flow development/production、keyboard-input development/production、joint-pipeline.development、production-preview、interaction-render）共 42 项：一次合跑中 `joint-pipeline.development` 的三轮导入与 `keyboard-input.development` 的真实隐藏各失败一次（主机负载约 8，后者为录制中未出现按住的键），两者单独重跑均通过，且都不使用本项改动的支持代码。
- **rubber-duck：** 采纳 4 项：旧缓存用例改为真正的旧组合（`logic-3` 键下的 schema 1 payload），当前键下的 schema 1 另作拒绝用例；原生隐藏用例只断言隐藏前选定的 AI 飞行器在恢复后移动；重新进入后断言 AI 飞行器集合非空且与首个 run 相同再逐个比较；隐藏前先等待 16 个可见 tick，避免隐藏 tick 与基线相同。
- **simplify：** 读一次清单与 payload 记录、按 id 建 payload 表；`SeedKey` 改为 `ExpectedPackageProfile` 的 Pick，`seedProductionCache` 不再重复解析；AI 飞行器种类判断合为 `isAiCraftKind`；comm-menus 的 schema 取自 `RULE_DATA_SCHEMA_VERSIONS`；暂停中的固定 1 s 等待并入 `expectStableTick`；合成光盘每个 worker 只生成一次。未采纳：把 `writeDisc`、`restoreSaved`、`startFlight`、`afterTicks`、`logUntil`、原生状态读取等与 mission-flow、base-interaction 的同类函数合并到 support（需改动无关用例）；`replayedSnapshot` 与 `tools/replay-check.ts` 私有的 `replayContent` 重复（工具不在写入范围，注释要求二者同步）；原生 CDP 步骤并行化（顺序是有意的）。
- **发现（交协调者）：** 当前转换器键下 schema 1 的 `ai-programs` payload 会被缓存“校验恢复”并显示 Mission loads into Core，直到开始时才由世界创建拒绝；只有篡改或非发布版本能写出这种组合，真实的旧缓存（旧转换器键）不被提供。拒绝安全且有反馈，未改变行为。
- **文档影响：** 维护文档未列出 e2e 用例或 `seedProductionCache` 的签名，无需更新；合成键不能证明系统快捷键拦截，实机责任仍归 P3-05/P3-15。

