---
type: plan
status: active
phase: P3
task: "04"
subtask: "11"
updated: 2026-10-10
---

# 11 — E2E：原生生命周期、资源平衡与 Fast Refresh

**契约来源：** [spec](../spec.md) 的[合成演示退役](../spec.md#合成演示退役)的测试迁移；AC-09（浏览器）、AC-13、AC-14，AC-18 的迁移部分。
**依赖：** 10。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- [native-lifecycle.spec.ts](../../../../../e2e/native-lifecycle.spec.ts)：改为经测试入口导入合成任务包并进入飞行；沿用已验证的 CDP 标签页切换路线：原生 hidden 使运行自动暂停，返回可见后仍暂停、tick 不变；显式继续后 tick 前进且没有补跑后台时长；出发保持期间隐藏后返回可见，结束出发仍为暂停。
- [fast-refresh.spec.ts](../../../../../e2e/fast-refresh.spec.ts)：用任务 hook 与任务画面模块的 Fast Refresh 取代演示部分：旧所有者失效，holder 与已确认的僚机选择保留；外壳刷新回菜单；三次菜单 → 任务 → 菜单往返。
- [joint-resources.spec.ts](../../../../../e2e/joint-resources.spec.ts)、[resource-balance-controls.spec.ts](../../../../../e2e/resource-balance-controls.spec.ts)、[resource-balance.ts](../../../../../e2e/support/resource-balance.ts)：以任务流程取代演示；监听、观察器、rAF、Worker、`beforeunload` 与单次计时器回到基线；飞行中至多一个游戏 rAF，暂停、保持与任务菜单时为零。
- [browser-probes.ts](../../../../../e2e/support/browser-probes.ts)：去掉 `synthetic-view` 的分组判断，按任务画面重新归类；增量加入单次计时器（`setTimeout`/`clearTimeout`）的非干扰探针；[resource-balance-controls.spec.ts](../../../../../e2e/resource-balance-controls.spec.ts) 增加故意泄漏的计时器与 `beforeunload` 控制样本和干净样本。
- [probe-contract.spec.ts](../../../../../e2e/probe-contract.spec.ts)：读取像素与投影的用例改为任务画面的只读属性与诊断；探针契约保持。
- [native-lifecycle.ts](../../../../../e2e/support/native-lifecycle.ts)、[fast-refresh.ts](../../../../../e2e/support/fast-refresh.ts)：按需调整。

## 不包含

- 外壳、合规、生产预览、WebGL 不可用、交互渲染、browser-replay 与 joint-pipeline 的迁移（12）；`demo-observations.ts` 的删除（13）。

## 关键文件与契约

- 修改：上列 E2E 文件与支持模块。
- 消费：10 的 `e2e/support/mission-observations.ts`。
- 工具约束见[工程约定](../../../../engineering/README.md#本地浏览器-runner)（单 worker、development-headed 的原生隐藏、Fast Refresh 编辑真实源码）。

## 写入范围

- `e2e/native-lifecycle.spec.ts`：迁移。
- `e2e/support/native-lifecycle.ts`：按需调整。
- `e2e/fast-refresh.spec.ts`：迁移。
- `e2e/support/fast-refresh.ts`：按需调整。
- `e2e/joint-resources.spec.ts`：迁移。
- `e2e/resource-balance-controls.spec.ts`：迁移与新控制样本。
- `e2e/support/resource-balance.ts`：迁移与计时器统计。
- `e2e/support/browser-probes.ts`：分组与计时器探针。
- `e2e/probe-contract.spec.ts`：迁移。

## 验收标准

- [x] AC-13：原生隐藏自动暂停、返回可见仍暂停、显式继续后不补跑；出发保持中的隐藏保护成立。
- [x] AC-14：三次往返与 Fast Refresh 后资源回到基线，计时器与 `beforeunload` 计入；飞行中至多一个游戏 rAF，非 running 为零；控制样本能检出故意泄漏的计时器与 `beforeunload`。
- [x] AC-09（浏览器）：Fast Refresh 与外壳刷新时旧所有者释放、holder 保留或按外壳刷新回菜单。
- [x] 迁移后的用例不再引用 `demo-observations.ts`、`synthetic-view` 或合成模块；`pnpm test:e2e e2e/native-lifecycle.spec.ts --project=development-headed` 与本项其余文件在 development/production 项目中通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)；完成证据列出每个旧用例的去向（迁移、合并或删除）及原因。
- 不适用原版对照。

## 完成证据

- **环境：** Google Chrome 155.0.8059.39（`channel: chrome`；development/production 为 headless 1280×800、像素比 1；development-headed 为自管 headed 浏览器），macOS（Apple M2，load 约 5–7），Node v22.22.0，V8 12.4.254.21-node.33；`OSR_E2E_DEV_PORT=5133 OSR_E2E_PREVIEW_PORT=5134`（开发服务器 `127.0.0.1:5133`，生产预览 `127.0.0.1:5134`）。只用代码生成的合成内容；没有合成 visibility/pagehide 事件，也没有替换 getter。
- **命令：** `pnpm exec playwright test e2e/native-lifecycle.spec.ts e2e/fast-refresh.spec.ts e2e/probe-contract.spec.ts e2e/joint-resources.spec.ts e2e/resource-balance-controls.spec.ts --project=development --project=production --project=development-headed`（先 `pnpm build`）26 个通过（development 15、production 10、development-headed 1）；最终版本的 native-lifecycle 共通过 3 次（含一次 `--repeat-each=2`）；`pnpm check` 通过（typecheck 含 `tsconfig.e2e.json`、lint、245 个测试文件 6,979 个测试、构建）。Fast Refresh 编辑的源码在每次运行后还原（`git status` 中没有 `src/` 改动）。
- **探针与资源平衡：** [browser-probes.ts](../../../../../e2e/support/browser-probes.ts) 去掉 `synthetic-view` 分组；`keyboard` 组现为 window 的 focus/blur、第二个生命周期登记者，以及任务画面（`[data-testid="mission-screen"]`）内元素上的应用监听（供 P3-05 的输入源；React DOM 的元素监听在元素进入文档前登记，不会落入）。新增单次计时器探针：只包装 `setTimeout`/`clearTimeout`，`this`、延迟、参数与返回的原生句柄不变，回调只多一步清除记录；只记录调用栈属于应用（`/src/` 或 `/assets/`）且处理器为函数的计时器；快照 `timers` 给出未触发未清除的 `pending`（ID 与延迟）、`scheduled`，以及已触发和已清除的 ID；`restore()` 还原原函数。`clearInterval` 不包装（应用不用它清除 timeout，已在注释中说明）。[resource-balance.ts](../../../../../e2e/support/resource-balance.ts) 改从 `mission-observations.ts` 取 `frameWindow`，新增 `timer` 类比较待触发计时器；离页保护的 `beforeunload` 属 `other` 组监听，已在原有逐组比较之内。Vite 客户端自己登记一个 `beforeunload`（`vite` 组），断言离页保护时排除它。

| 验收 | 设置与操作 | 观察 | 结果 |
|---|---|---|---|
| AC-13 | development-headed：自管 headed Chrome，CDP 自建 context 与两个标签页，`Target.activateTarget` 切换；测试入口 `worker=mission-startable`，合成光盘经 `DOM.setFileInputFiles` 选入，真实模块 Worker 导入并保存；之后全部操作为可信 CDP 点击（`NativeTarget.press` 在按钮位置连续两帧不变且为命中目标后点击） | 原生 visibility 日志 hidden → visible → hidden → visible → hidden → visible。出发保持（run 1、tick 0、离页保护 1、计时器 1）中隐藏：占位为 `waiting`，计时器被撤销（0），400 ms 后仍为 departure、tick 0、无 rAF；返回可见后占位恢复计时，跳过 → flight、`paused`/`hidden`、tick 0，三个真实 rAF 加 400 ms 后仍暂停；显式 Resume 后前进。飞行中隐藏：`paused`/`hidden`，无待交付 rAF、无计时器，400 ms 内 tick 不变（11）；返回可见后三个 rAF 加 400 ms 仍暂停、tick 11。显式 Resume：页面内记录可信点击、该点击请求的下一帧时间戳（会话在同一点击中请求首帧）与之后每次显示的 tick，每个显示的 tick 都不超过 ⌊(显示时刻 − 首帧)/31.25⌋ + 1（实测首个显示 +1 tick，距首帧约 34–36 ms，首帧距点击约 4 ms）；之后 300 ms 以上 tick 持续前进。返回主菜单后会话监听、离页保护、计时器与 rAF 均为 0，无应用错误 | passed |
| AC-13 反证 | 临时注释 `game-session.ts` 中 resume 的 `resetClock()`（未提交，已还原） | 显式继续后首帧补跑 5 tick（每帧上限），在首帧后 1.4 ms 显示，界限为 1，用例失败 | passed |
| AC-14（往返） | development 与 production：`seedProductionCache(missionPackage())`，刷新后经菜单恢复；`settleTooling` 后在菜单取 `ResourceBalance` 基线；三次访问，僚机依次为 0、无、4，每次含任务菜单中的重开 | 每个位置以 400 ms 帧窗口读取：介绍（无运行）会话监听 3（pagehide、pageshow、visibilitychange）、计时器 1、离页保护 0、帧请求 0；配置 计时器 0、帧 0；出发 tick 0、计时器 1、离页保护 1、帧 0；飞行 帧至多 1 且有交付、计时器 0、离页保护 1、tick 前进；暂停与任务菜单 帧请求 0、tick 稳定、离页保护 1；重开后的介绍 离页保护 0、计时器 1、会话监听身份与重开前相同；第二次运行同样。无 keyboard/render 监听（本任务尚无输入源与画布）。返回主菜单后与基线逐项一致（全部监听分组、观察器、画布、空闲帧、Worker、待触发计时器），上一所有者的三个会话监听都已移除，新所有者的监听登记在其之后。owner 编号：development 2/4/6（StrictMode 首次挂载创建后释放一个），production 1/2/3 | passed |
| AC-14（往返，开发） | [fast-refresh.spec.ts](../../../../../e2e/fast-refresh.spec.ts) 的三次往返：菜单 → 导入（有作业）→ 查看器 → 任务飞行 → 任务菜单返回 | 每轮后监听、观察器、未终止 Worker、已连接画布、待交付帧与待触发计时器回到基线，返回后焦点在 Start mission | passed |
| AC-09、AC-14（Fast Refresh） | development 测试入口导入 `mission-startable`；`ResourceBalance` 基线后进入飞行（僚机 3）；依次编辑 `src/app/composition/use-mission-owner.ts` 与 `src/app/MissionScreen.tsx`（各一次编辑、一次还原，都在同一文档中触发刷新） | 飞行中的编辑：新所有者（owner + 1）在介绍、run 为空，同一文档；会话监听恰 3 个且都在旧所有者的之后登记，离页保护 0、无待交付帧，计时器只有新介绍的 1 个。还原在该介绍计时器待触发时刷新：旧计时器 ID 在已清除列表中、不在已触发列表中，只剩下一个新所有者的计时器；跳过介绍后配置页预选已确认的僚机 3，再次飞行。返回菜单后 `ResourceBalance.check` 与基线一致 | passed |
| AC-09、AC-14 反证 | 临时注释 `mission-owner.ts` `#cancelTimer` 中的取消（未提交，已还原） | 飞行中仍有 3 个 3,000 ms 的待触发计时器，用例失败 | passed |
| AC-09（外壳刷新） | 同上导入后进入飞行，编辑并还原 `src/app/composition/use-resource-holder.ts` | 两次刷新后都在同一文档的主菜单：没有任务画面，包已丢弃（状态为 “Saved resources found in this browser, not yet verified.”，入口 `no-package`），会话监听、离页保护、计时器与帧都为 0，与基线一致；没有清理失败，恢复已保存的包后新所有者（编号更大）可打开，返回后仍与基线一致 | passed |
| AC-14（控制样本） | development 与 production：`/assets/` 路由模块故意泄漏 | 监听、观察器、持续 rAF、Worker、AudioContext 各只报告对应类别；新增的 600,000 ms 计时器只报告 `pending timer added since the baseline: <ID> (600000 ms)`，撤销后该 ID 在已清除列表中；`beforeunload` 只报告 `other listener added since the baseline: …:beforeunload:…`；已触发的 0 ms 计时器不报告，`fired` 增加 1。干净路径（识别失败的导入、缓存恢复、三轮查看与试听、一次任务飞行与返回）每步与基线一致。纯比较用例覆盖计时器规则（已触发或已清除不算，新增与消失都报告） | passed |
| 探针契约 | development 与 production | 测试自己的计时器：`this` 为 window、额外参数原样、`clearTimeout` 生效，不进入记录；`/assets/` 模块的计时器：返回原生正整数句柄，待触发时记录延迟 60,000，清除两次只记一次，触发的回调收到参数且 `this` 为 window，各 ID 分别进入已清除与已触发列表；`restore()` 后 `setTimeout` 为原生函数。任务画面：出发 `{ run: 1, tick: 0, position: departure }`，飞行中 tick 前进，暂停后稳定且属性为同一 owner/run；开发诊断的快照为同一运行、同一 tick、僚机 0，生产中没有 `dev-*` 元素；运行中帧至多 1、会话监听 3、离页保护 1（`other`）、无计时器、无画布与观察器；返回后全部为 0 | passed |

- **旧用例去向：**

| 旧用例 | 去向 | 原因 |
|---|---|---|
| native-lifecycle：原生标签页隐藏暂停、可信显式继续 | 迁移（同一用例） | 改经测试入口导入合成任务包并进入飞行；方向键移动 mover、按住键 repeat 不移动与新按下移动、P 键继续的部分删除：P3-04 没有飞行键位（P3-05），显式继续改为可信点击 Resume；新增出发保持中的隐藏与页面内的不补跑界限 |
| fast-refresh：查看器 owner hook 三次刷新 | 保留不变 | 不依赖演示 |
| fast-refresh：导入作业 hook 三次刷新 | 保留不变 | 不依赖演示 |
| fast-refresh：菜单、导入、查看器、演示三次往返 | 迁移 | 演示一段改为任务飞行，基线另计待触发计时器 |
| （新增）fast-refresh：任务 hook 与任务画面模块刷新；外壳刷新 | 新增 | AC-09、AC-14 的 Fast Refresh 验收面 |
| joint-resources：三次键盘/菜单往返的 owner、rAF、渲染与 GPU 平衡 | 迁移 | 改为任务流程的三次往返（各含重开）。删除：9 个键盘监听、6 个渲染监听、画布与 `WEBGL_lose_context`、GPU 暖态计数、mover 移动与 `n` 命令结果——任务画面尚无输入源、画布或渲染（P3-05、P3-12、P3-13）；画布释放与 GPU 计数仍由查看器路径覆盖（resource-balance-controls 干净路径、version-4-viewer、fast-refresh 查看器用例），正式命令结果由 10 的开发诊断提交覆盖 |
| resource-balance-controls：五类故意泄漏 | 迁移并扩展 | 新增计时器、`beforeunload` 泄漏与已触发计时器的干净样本 |
| resource-balance-controls：导入、恢复、查看与演示的干净路径 | 迁移 | 演示一段改为任务飞行 |
| resource-balance-controls：比较规则 | 扩展 | 增加计时器规则 |
| probe-contract：原生监听、观察器与帧行为 | 扩展 | 增加测试计时器的行为与不记录 |
| probe-contract：Worker 记录 | 保留不变 | 不依赖演示 |
| probe-contract：读取真实像素、新鲜投影、布局与 owner 资源 | 替换 | 像素（mover/marker 颜色）、合成视图布局与合成投影轴只验证合成画面，删除；改为任务画面的只读属性、开发诊断与 owner 资源。WebGL 表面的像素与布局取证归 12 的查看器 |
| probe-contract：错误收集两例 | 保留不变 | 不依赖演示 |
| （新增）probe-contract：应用计时器记录 | 新增 | 计时器探针的非干扰契约 |

- **范围外的观察：** 非干扰扫测（上述设施的使用者：import-page、viewer-page、cache-recovery、version-4-viewer、failure-storage-lifecycle、failure-worker-cancel、mission-flow 两项、responsiveness/network-audit 控制样本、audio-playback、import-worker、resource-cache、joint-pipeline.production、responsiveness-busy-worker，development 与 production）126 个用例中 122 个通过（扫测在评审修改之前运行，之后探针只改了已触发与已清除的记录形式）。failure-worker-cancel 的 3 个 F-12 用例（late restore、late commit、late listing）在不含本项改动的基线上同样失败（`window.osrTestEntry` 为 undefined，读取 `profile` 时抛错），不由本项引起；F-13 真实配额用例首轮得到 `quota-exceeded`，随后连续 2 次通过，按环境时序处理。
- **rubber-duck：** 两项阻塞建议均采纳。(1) 不补跑的界限原以 Node 在点击前的时间计算，点击开销会放宽界限；改为在页面内以可信点击请求的首帧时间戳为锚、逐个核对显示的 tick（反证在首帧后 1.4 ms 即被检出）。(2) Fast Refresh 原只在两个占位计时器都已结束后刷新，也没有完整的资源平衡；新增在介绍计时器待触发时的刷新（探针按 ID 记录已触发与已清除），并在 Fast Refresh 与外壳刷新用例中以 `ResourceBalance` 基线核对。
- **simplify：** 采纳：往返用例复用 `fly`；干净路径改用 `expectAdvancingTick`；去掉 `balance.check` 之前重复的释放检查；`scheduled` 由各列表推导；`press` 的稳定等待以 60 帧为界；joint-resources 附件只保留各位置的摘要。未采纳：把种子预置、恢复与“进入并飞行”的重复步骤抽成共用 helper（合适的位置 `mission-observations.ts`、`production-cache.ts` 不在本项写入范围）；持有状态改用瞬时快照（400 ms 帧窗口正是“非 running 无 rAF”的证据）；包装 `clearInterval`（超出本项规定的 setTimeout/clearTimeout 探针，应用不以它清除 timeout）；在 `ResourceBalance.start` 内自动 `settleTooling`（F-14 传入只有 `evaluate` 的页面对象）。
- **文档影响：** 本项写入范围内没有文档。[工程约定](../../../../engineering/README.md)需同步（归 15）：资源平衡小节的探针字段 `timers`、`timer` 比较、新增的计时器与 `beforeunload` 控制样本和已触发计时器的干净样本；探针分组改为按任务画面（`synthetic-view` 规则已删除），离页保护属 `other` 组、Vite 客户端另有自己的 `beforeunload`；本地浏览器 runner 中 native-lifecycle 的说明（测试入口导入、`DOM.setFileInputFiles`、`NativeTarget.press` 的稳定点击、页面内的不补跑界限、出发保持中的隐藏）；“联合资源测试逐轮打印 context 扩展能力”一条不再适用于 joint-resources（任务画面尚无画布，画布释放由查看器用例覆盖）；fast-refresh 新增任务 hook、任务画面与外壳刷新用例。

