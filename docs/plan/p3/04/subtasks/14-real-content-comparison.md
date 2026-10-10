---
type: plan
status: active
phase: P3
task: "04"
subtask: "14"
updated: 2026-10-10
---

# 14 — 真实内容核对与对照记录

**契约来源：** [spec](../spec.md) 的 S-12（对照部分）、[对照](../spec.md#对照)、[验证策略](../spec.md#验证策略)的实机/原版对照；AC-17、AC-20。
**依赖：** 08, 09, 11。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **AC-17 私有真实内容实验：** agent 启动自有开发服务器与独立的开发浏览器（关闭通用 trace 与截图采集），重新导入 `local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}`（基线上的转换器版本来自 P3-03，旧版本的缓存不提供恢复，不依赖既有缓存）；带僚机与不带僚机各开始一次正式运行并进入飞行；从开发诊断核对玩家 1 个、种类位 1 的对象恰在带僚机时存在、tick 前进；分别导出录制，以生产 CLI `node tools/replay-check.ts <录制> <同一 CloneCD 文件组>` 核对一致。记录候选提交、转换器版本、完整内容身份、配置、种子、Chrome、Node 与 V8 版本。录制、报告与任何派生输出只存放在 `local/research/p3-04/`；公开证据只含计数、身份与判定。
- **AC-20 对照记录：** 按 spec 的[对照](../spec.md#对照)，在完成证据中记录：
  - R-13 控制子集：依据 [B-001](../../../../original/behavior/B-001-strategic-map.md#打开与关闭已确认) 与[时基](../../../../original/formats/executable.md#simulation-time-base-p3-0106)；引用 03 的 Node 证据与 11 的原生隐藏证据；判定只记“Runtime 暂停控制子集通过”，披露原版扣时的至多 2 个时钟单位残差与 32 Hz、后台策略等项目选择，不声称完整 R-13 或关闭 U-021。
  - L-01、L-02、L-10 的流程部分：对照 [B-003 出发](../../../../original/behavior/B-003-campaign-flow.md#出发l-02)与[重开](../../../../original/behavior/B-003-campaign-flow.md#重开任务p3-0104)；披露 G-02 不计时、出发前创建 tick 0 世界、独立任务重试不保留战役状态的差异；说明结果后重试、完整起飞与画面尚待负责任务。
  - 不关闭 U-010、U-021、U-031，不写入 `docs/original/`。
- 若浏览器自动化无法取得所需操作，按[原版证据获取](../../../../guides/original-evidence.md)记录尝试与原因并阻塞，不用合成结果代替。

## 不包含

- DOS 原版运行或新的原版事实研究（spec 不要求）；文档同步（15）。

## 关键文件与契约

- 使用：`tools/replay-check.ts`（08）、开发构建的诊断与导出（07、09）。
- 证据来源：03、11 的完成证据；[B-001](../../../../original/behavior/B-001-strategic-map.md)、[B-003](../../../../original/behavior/B-003-campaign-flow.md)、[executable](../../../../original/formats/executable.md)。

## 写入范围

- `local/research/p3-04/**`：真实内容实验的私有输出（git 忽略）。

## 验收标准

- [x] AC-17：带与不带僚机各一次正式运行，玩家与僚机数量正确、tick 前进；两份导出录制经生产 CLI 与同一文件组核对一致；绑定候选、身份、配置、种子与运行时版本；输出只在 `local/research/p3-04/`。
- [x] AC-20：R-13 控制子集与 L 流程部分的结论、依据、置信度与已知差异记录在完成证据中，区分项目调度通过、已有原版依据与未完成的下游玩法。
- [x] 仓库中没有新增原版内容或派生输出（`git status` 与 `pnpm check:compliance`）。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 的方法操作开发构建（真实内容只在本地实验中使用，不纳入自动测试）；CLI 输出 JSON 报告存于 `local/research/p3-04/`。
- 对照为文档与证据核对，不需要新的 DOS 运行。

## 完成证据

2026-10-10，worker `exec-p3-04-14`，基于认领提交 `76cef6b1`（goal 分支 `p3-04-runtime-session-spec`）。实验脚本、两份录制、CLI 报告、运行日志与汇总只在被忽略的 `local/research/p3-04/`（`real-content-check.ts`、`run.log`、`summary.json`）；这里只记计数、身份、版本与判定。没有 DOS 原版运行或 Ghidra 工作（spec 不要求）。

### AC-17：私有真实内容实验

| 项 | 记录 |
|---|---|
| 候选 | 提交 `76cef6b14313266ef28b5ca210c5e30697310cd6`（HEAD），跟踪文件无改动。实验时 `git status` 只有一项未跟踪路径 `.impeccable/`，是本会话编辑器钩子的缓存，不是构建输入，之后已删除；`summary.json` 因此记为 `clean: false` |
| 开发服务器 | 自启 `pnpm dev --host 127.0.0.1 --port 5144 --strictPort`（Vite 8.3.1），页面为 `http://127.0.0.1:5144/` 的正式开发入口（不是测试入口，生产导入作业与生产白名单）；实验后已停止 |
| 浏览器 | 本机 Chrome 155.0.8059.39，由 Playwright 以 `channel: 'chrome'`、headless 启动，新建的非持久 context（空存储），视口 1280×800；不开 trace、不截图；只经可信点击与 DOM 读取操作，实验后已关闭 |
| Node / V8 | v22.22.0 / 12.4.254.21-node.33（CLI 与驱动脚本同一进程版本） |
| 转换器版本 | `osr-import.graphics-4.logic-2.audio-2.models-4`（P3-03 的基线版本） |
| 完整内容身份 | schemaVersion 1；sliceId `classic-p2-slice`；切片定义版本 4；转换器版本同上；`manifest:sha256:ac3bdb9c87c9fe4ea74505397b550619209d8204da9e40b3f065b5e77537b9ba`（与 [P3-03/21](../../03/subtasks/21-local-check-tools.md#完成证据) 的基准相同）；origin `original-import`，`source:sha256:fd97bcea3c3aee835c9058419469786587a4580e96b431bb9ce9c127ff2181be`。两份录制的 `record.content` 与两份 CLI 报告的身份键都等于此身份 |
| 运行配置 | 任务 `mission/first-campaign`，setupHash `4ff21a63b63f0acb`（两次相同：[setup-hash.ts](../../../../../src/core/world/setup-hash.ts) 只哈希任务设置），难度 19，每 tick 2 个时钟单位（32 Hz），检查点间隔 32，producer `open-star-rangers 0.0.1 development` |

- **重新导入：** 打开页面时主菜单为 “Original game data: None in this browser.”，没有可恢复的缓存。经真实导入页选入 `STAR_RANGERS` 的 ccd、img、sub、cue 四个文件，作业 `finished`，识别为 `star-rangers-1995-cd`。四组都是 complete：logic 9、models 266、cockpit-hud-map 104、audio 29 个 Asset。状态依次为 “Source identified”、“Complete resources, viewable”、“Saved in this browser”、“Mission loads into Core”；返回菜单后入口为 `eligible`。
- **两次正式运行：** 第一次从主菜单进入，第二次经任务菜单的 Restart mission 进入。两次都以跳过按钮结束介绍；开始配置页有 6 个选项（名单 5 项加无僚机），选择后点 Start。录制都在暂停后由开发面板导出，CLI 用法为 `node tools/replay-check.ts <录制> local/StarRang/cd/STAR_RANGERS.ccd …img …sub …cue`。

| 运行 | 选择与种子 | 出发 | 开发诊断（玩家与种类位 1） | 录制 | 生产 CLI |
|---|---|---|---|---|---|
| run 1，带僚机 | 僚机选项 0；种子 333835118 | 变体 `wingman`，tick 0；结束后 phase `running` | tick 5：51 个实体，玩家 1 个（种类位 0），种类位 1 的对象 1 个，来源 `wingman#0`；tick 679 与暂停时的 681 计数不变 | 46,557 字节；`record.run` 为难度 19、僚机 0、该种子；681 个 tick 输入，51 个事件（都是 `object-instantiated`），23 个检查点；文件名中的 setupHash、种子与 finalTick 681 都与记录和暂停时的诊断 tick 一致 | 退出码 0：`passed: true`、`error: null`、finalTick 681、events 51、checkpoints 23、`comparison.match: true` |
| run 2，不带僚机 | 无僚机；种子 3489279964 | 变体 `solo`，tick 0；结束后 phase `running` | tick 5：50 个实体，玩家 1 个（种类位 0），种类位 1 的对象 0 个，没有 `wingman#` 来源；tick 679 与 681 计数不变 | 46,360 字节；`record.run` 为难度 19、无僚机、该种子；681 个 tick 输入，50 个事件（都是 `object-instantiated`），23 个检查点；文件名与记录、诊断一致 | 退出码 0：`passed: true`、`error: null`、finalTick 681、events 50、checkpoints 23、`comparison.match: true` |

- **tick 前进：** 每次运行在开发诊断中都从 tick 5 前进到 679（同一 run，约 21 s），画面属性在 1 s 内分别前进 32 与 34 个 tick；暂停后 300 ms 内画面 tick 不变，且等于诊断 tick。
- **重开：** 同一 owner，run 从 1 递增为 2，配置页预选上次确认的僚机 0；两次种子不同（spec 不保证不同，只记录）。
- **CLI 复核：** 在 shell 中对两份录制再次手工执行同一 CLI，退出码都是 0，报告与脚本中的相同。
- **控制台：** 1 条错误，是 Chrome 自动请求 `/favicon.ico` 得到开发服务器的 404（单独载入页面核对了位置）；页面错误 0 条。
- **第一次尝试：** 第一次运行同一脚本时，两份录制也经 CLI 通过（finalTick 675，events 51/50）。但脚本有两处判定写错：
  - 在 tick 0 读取了诊断。此时还没有实体，因为 Core 在第一个 tick 才实例化时刻 0 的项（[Core 世界创建](../../../../engineering/modules/core.md#世界创建)）；
  - 误以为两次运行的 setupHash 不同。

  修正这两处后，在新的 context 中重新导入并重做全部步骤；上表来自第二次运行，第一次的输出也留在 `local/research/p3-04/attempt-1/`。
- **隐私：** 录制含有派生的运行状态，只存放在 `local/`；本文件只有计数、身份、哈希、种子、版本与判定，不含名称、文字或坐标。

### AC-20：对照记录

依据 spec 的[对照](../spec.md#对照)。每项分四部分记录：项目调度的结论、已有的原版依据（标明置信度）、已知差异、尚待下游的部分。本子任务不关闭 [U-010、U-021、U-031](../../../../original/unknowns.md)，也不写入 `docs/original/`。

#### R-13 控制子集

- **结论：Runtime 暂停控制子集通过。** 这是项目调度的结论，不是完整的 R-13。
- **原版依据：**
  - [B-001 打开与关闭](../../../../original/behavior/B-001-strategic-map.md#打开与关闭已确认)（已确认，试玩）：打开地图时游戏不暂停；地图内外都可以按 `p` 暂停与继续。
  - [时基](../../../../original/formats/executable.md#simulation-time-base-p3-0106)的 “Pauses and cut-scenes”（已确认，代码；未经运行观察）：`0x258f8` 在每个菜单页与 `p` 暂停的前后记录并扣除原始计数器的增量，因此下一次取样不含暂停时长，残差在一次回调的相位之内，即至多 2 个时钟单位（1/32 s）。
- **项目证据：**
  - Node：03 的 [game-session-pause-timing.test.ts](../../../../../src/app/session/game-session-pause-timing.test.ts)（[03 完成证据](./03-formal-session.md#完成证据)），本基线重跑 25/25 通过。覆盖五种暂停途径（用户暂停；重复暂停并夹有隐藏与可见的任务菜单式暂停；重复 hidden；帧回调时发现 hidden；重复 pagehide 后 pageshow）乘以四种长度（1 ms、1 tick、10 tick + 7 ms、1 h）：
    - 暂停期间不执行 tick，迟到的旧回调不推进；
    - 继续后首帧为 0 tick，不补计暂停前剩下的半个 tick；
    - 之后时钟只随实际执行的 tick 前进，每 tick 2 个单位。

    另有两项：出发保持在四种长度下保持 tick 0、时钟 0；不发控制时，提交地图与通讯命令（Core 对尚无规则的命令回答 `not-implemented`）不会停钟（12 tick，时钟 24）。
  - 浏览器：11 的完成证据中的 AC-13 行（[e2e/native-lifecycle.spec.ts](../../../../../e2e/native-lifecycle.spec.ts)，development-headed，CDP 切换原生标签页），见 [11 完成证据](./11-e2e-lifecycle-resources.md#完成证据)：
    - 原生 hidden 时自动暂停，返回可见后仍暂停；
    - 显式 Resume 后不补跑：每个显示的 tick 不超过 ⌊(显示时刻 − 首帧)/31.25⌋ + 1；
    - 出发保持期间的隐藏保护成立；
    - 另有一项反证。

    10 的 AC-12 行（[10 完成证据](./10-e2e-mission-flow.md#完成证据)）补充两点：暂停与任务菜单中 tick 稳定；菜单显示时按键不能旁路继续。
- **已知差异（项目选择，已披露）：**
  - 原版扣除暂停时长时留有至多 2 个时钟单位的回调相位残差。项目暂停时精确地不执行 tick，继续时只重新锚定，并丢弃暂停前不足 1 tick 的余量。这里没有建立两者之间统一的 tick 级或帧级误差界限，也不声称整帧与原版等价。
  - 32 Hz 固定步长是项目选择。原版每帧取可变步长（0、2、4 或更多个单位），帧率取决于处理器速度（[B-006](../../../../original/behavior/B-006-simulation-timing.md)、[Core 已知差异](../../../../engineering/modules/core.md#已知差异)）；U-021 的 cycles 尚未冻结。
  - 后台策略也是项目选择，沿用 P1-05：hidden 与 pagehide 时自动暂停，页面恢复可见后须显式继续，不补跑。它不是对原版行为的对照。
- **尚待下游：** 真实的地图模式、地图打开时的飞行输入门禁，以及地图内的 `p` 键，分别归 P3-09（规则）与 P3-05（键位），都还没有实现。Node 中的地图命令只是 Core 尚未实现的命令，不能据此声称完整的 R-13 已经对照。

#### L-01 任务开始配置（流程部分）

- **结论：通过（项目流程）。**
  - 资源包完整、任务能载入且没有锁存时，入口可用；没有包、包不完整、任务载入失败或已锁存时，入口禁用并说明原因；世界创建被拒绝时留在配置页并显示原因。证据为 [05](./05-mission-flow-owner.md#完成证据) 的 Node 测试，以及 10 的 E2E（覆盖没有包、包不完整、载入失败、创建被拒绝与可开始，锁存只由 Node 覆盖）。
  - 流程为主菜单 → G-02/1 介绍占位 → 开始配置 → 确认后创建世界 → G-02/2 出发占位。开始配置代替原版的 G-04 与 G-07 页面：名单 5 项加无僚机，难度固定为 19。
  - 真实内容中入口为 `eligible`，配置页有 6 个选项，带与不带僚机都开始成功（AC-17）。
- **原版依据：** [B-003 页面与操作顺序](../../../../original/behavior/B-003-campaign-flow.md#页面与操作顺序已确认用户观察)（已确认，用户观察）：战役设置 → 新战役 → 介绍动画 → 简报 → 僚机档案与选择（含无僚机选项）→ 确认 → 出发动画 → 飞行。所用媒体见 [B-003 出发](../../../../original/behavior/B-003-campaign-flow.md#出发l-02)（已确认，代码与数据）：第一关先播 `C-INTALL`，接着是出发前页面，确认后播 `FLYFROM` 或 `WFLYFROM`。项目的介绍、配置与出发的先后顺序，以及选择发生在出发之前，都与此一致。
- **已知差异：** 原版的选项、战役设置、简报与档案页面由 G-04、G-07 的项目页面代替；难度不可调（G-07）；世界的创建时机不同，见 L-02。

#### L-02 起飞（流程部分）

- **结论：出发的顺序与选择边界通过（项目流程）。**
  - 确认开始后进入 G-02/2。变体随本次僚机选择：无僚机为 `solo`，对应 `FLYFROM`；带僚机为 `wingman`，对应 `WFLYFROM`。
  - 占位结束之前保持 tick 0，结束后进入飞行（Node 与 E2E 见 03、05、10、11 的完成证据）。
  - 真实内容中，首批对象在第一个 tick 实例化：玩家 1 个；种类位 1 的对象恰在带僚机时有 1 个（51 对 50 个实体，计数至 tick 681 不变）。
- **原版依据：** [B-003 出发](../../../../original/behavior/B-003-campaign-flow.md#出发l-02)（已确认，代码与数据；未经运行核对）：
  - 出口为任务已建立、首批对象已生成的飞行状态；
  - 两段过场的用时计入生成队列的已过时间，但不计入飞行的第一步；
  - 所选任务除一组延迟编组之外，其余生成源都在 0 时刻到期。
- **已知差异（已披露）：**
  - **G-02 不计时：** 占位期间保持 tick 0，结束后不补计时间（[P3-02 技术决定 2](../../02/spec.md#技术决定)、[Core 已知差异](../../../../engineering/modules/core.md#已知差异)）。占位的 3 秒是项目的呈现时长，不是原版媒体的时长。这对应省去原版媒体播放用时的项目选择，但不等同于原版关闭过场：原版的构建用时、生成原点与首帧取样仍与项目不同（见下两条）。原版看过场时，过场用时计入生成队列，延迟编组在飞行中会更早出现。
  - **出发前创建 tick 0 世界：** 项目在确认开始时、出发占位之前创建世界，以便提前报告创建失败；原版在出发动画之后才载入任务。项目只保证占位结束之前不模拟，不声称构建时机与原版相同。
  - **首批对象的实例化时刻：** Core 在时钟 2 的第一个 tick 实例化时刻 0 的项，原版在构建帧的第一次队列检查时实例化（Core 已知差异）。
- **尚待下游：** 完整的起飞运动（P3-06）、飞行画面（P3-12、P3-13）与过场媒体（P3 中以 G-02 占位代替）。这里不记为完整的 L-02 通过。

#### L-10 重试或返回（流程部分）

- **结论：重开与返回通过（项目流程）。**
  - 重开可以从任务菜单发起，也可以从故障或停止的提示发起。它先以 exit 结束运行并取消未执行的命令，再回到 G-02/1，然后进入配置页（预选上次确认的僚机），最后以重新抽取的种子从 tick 0 创建新世界。
  - 返回主菜单时释放所有者。
  - 证据：05 的 Node 测试（流程、重开、返回、种子与代际）；10 的 E2E（重开后是新 run、预选、返回后的焦点）。真实内容中，同一 owner 的 run 从 1 变为 2，预选为 0，内容身份与 setupHash 相同，出发时 tick 0（AC-17）。
- **原版依据：** [B-003 重开任务](../../../../original/behavior/B-003-campaign-flow.md#重开任务p3-0104)（高概率，只读静态分析）：
  - 在战役中、任务进行时有效，回到同一关的开头。第一关先播介绍动画，出发前页面预选上次的僚机，再播出发动画。生成队列从头开始，本关统计清零。
  - 保留关卡编号、难度、僚机选择、战役统计、晋升与高分榜；救援计数清零。

  项目的介绍 → 配置（预选）→ 出发 → 从头开始的顺序与此一致。
- **已知差异（已披露）：**
  - **独立任务重试不保留战役状态（G-06）：** 项目没有关卡编号、战役统计、军衔、高分榜或救援计数可保留或清零。
  - 种子每次重新抽取；难度固定为 19（G-07）；世界在出发前创建（同 L-02）。
  - 原版经 Esc 选项页与战役设置页重开，项目用任务菜单（G-07）。
- **尚待下游：** 结果后重试（L-10 的 “从结果重试”，即原版失败提示中的重试同一关）归 P3-11。这里不记为完整的闭环通过。

### 审查与文档影响

- **rubber-duck：** 两项阻塞、一项非阻塞，均已采纳：删去 “两者的差别在 1 tick 以内” 这一没有依据的合并界限，改为分别陈述原版残差与项目丢弃的余量；把 “生成原点相当于原版关闭过场” 改为 P3-02 技术决定 2 的表述（省去媒体用时，不等同于关闭过场）；候选一行说明实验时唯一的未跟踪路径。审查者另核对了 AC-17 的计数、版本、身份、种子与两份 CLI 报告，以及置信度标注、未关闭的未知项与隐私，没有其他问题。
- **文档影响：** 无需更新其他文档。本子任务没有改代码、命令或流程；对照结论按 spec 只记在此处，工程文档与 `slice-gaps.md` 归 15。
- **检查：** `pnpm check:compliance` 通过；`git status` 只显示本文件的改动；`local/` 被 `.gitignore` 忽略。
