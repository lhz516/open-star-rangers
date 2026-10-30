---
type: plan
status: active
phase: "P3"
task: "15"
subtask: "04"
updated: "2026-10-29"
---

# 04 — 类型 9 警告端到端复验

**契约来源：** [spec](../spec.md) 的 S-06、[行为与边界](../spec.md#行为与边界)“类型 9 警告产生与呈现”；AC-06。交接来源：[P3-13 spec](../../13/spec.md) 的 AC-14/AC-21、[P3-14 spec](../../14/spec.md) 的 AC-08/AC-14 与 DW-10。
**依赖：** 01。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新建 `e2e/support/joint-warning.ts`：以 01 的变体构造方式生成合成包，使真实 Core 规则产生尾随攻击者（`attackerOnTail`）与来弹（`missileIncoming`）警告：敌机按其 AI 与武器锁定规则自然咬尾或发射导弹，不由测试写入警告标志、武器锁定等级或 Core 状态。
- 新建 `e2e/joint-warning.development.spec.ts`：在 P3-14 AC-08 所定的有效视角/子系统条件下：
  - 读开发事件日志/状态中同 tick 的 `communications.warnings` 值，确认由规则从 false 变为 true 并在条件解除后复位；
  - 以 [cockpit.ts](../../../../../e2e/support/cockpit.ts) 的 `instrument(fixture, 9)` 区域读回驾驶舱类型 9 指示条的实际像素，确认与警告值相符；
  - 以 [flight-audio.ts](../../../../../e2e/support/flight-audio.ts) 的 `captureOutput`/`soundView` 读音效消费者的声音决定（`sound/hud/instrument-9-loop` 的 `instrument-9-craft`/`instrument-9-missile` 请求或开发声音日志），确认与警告相符；
  - 确认声音启停或音频不可用不改变驾驶舱状态，二者互不推进。
- 本项只证明信号与状态链路；人耳试听属于 P3-14 的 V-06（其子任务 26），不在此替代。

## 不包含

- P3-14 V-06 的感知判定；类型 9 警告在原版所选任务中的可达性结论（由 P3-14/24 处理，08 汇总）。
- 修改 `src/`。若真实条件在合成场景中不可达或链路缺失，本项不通过，记录证据并交回 P3-13/P3-14。

## 关键文件与契约

- 现有：[communications.ts](../../../../../src/core/projections/communications.ts)、[indicator-strip.ts](../../../../../src/render/cockpit/overlay/indicator-strip.ts)、[hud-cues.ts](../../../../../src/app/flight-audio/hud-cues.ts)、[cockpit.ts](../../../../../e2e/support/cockpit.ts)、[flight-audio.ts](../../../../../e2e/support/flight-audio.ts)、[map-warp.ts](../../../../../e2e/support/map-warp.ts) 的 `readLog`。
- 01 交付：`e2e/support/joint-loop.ts`（只读复用）。
- 计划新增：`e2e/support/joint-warning.ts`、`e2e/joint-warning.development.spec.ts`。

## 写入范围

- `e2e/support/joint-warning.ts`：警告场景变体与观察。
- `e2e/joint-warning.development.spec.ts`：警告端到端用例。

## 验收标准

- [x] AC-06：两种警告都由真实攻击者/来弹规则产生；同 tick 的 `communications.warnings`、类型 9 指示条像素与音效消费者决定一致，并覆盖解除；测试未直接设置警告或锁定字段。
- [x] 音频启停或不可用不改变驾驶舱表现；明确记录本项不代替 P3-14 V-06 的人耳判定。
- [x] 网络审计无违规；`pnpm typecheck`、`pnpm lint` 通过，已按 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 清理。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 执行：`pnpm test:e2e e2e/joint-warning.development.spec.ts --project=development`，连续两次通过；附触发警告的 tick、视角与三方读数。

## 完成证据

- **2026-10-29（worker exec/p3-15-04）：**
  - **实现：** 新增 [joint-warning.ts](../../../../../e2e/support/joint-warning.ts)，在 Node 中由 `mission-startable` 合成转换结果构造警告变体，替换任务、机型信息与 AI 程序 payload，全部由代码生成：
    - 玩家前方无物；一架 7 类敌机（属 `0x780` 尾随攻击者种类）静止于玩家后方 250 单位，唯一的 list-1 挂点为制导导弹 0，弹药 1 发。导弹 0 的分级时间为 0x80 单位/级，射程 1,280；寿命在追上玩家前结束。8、14、17 类排队在运行之外。
    - AI 程序：所有表记录在安装时开启 AI 锁定（+0x34、+0x38），+0x50 关；所有状态脚本为“232 就绪且平稳则 401 按下导弹通道，否则 1000 等待 4 单位”。与 `src/core/replay/tail-warning-replay.test.ts` 的设置一致。
    - 测试从不写入警告标志、锁定等级或 Core 状态。读取只经 DOM、任务 UI store（与 `cockpit.ts` 同法）、开发声音日志、音频探针，以及开发面板导出录制在 Node 中的正式重放（`startReplay` + `recordState`，逐 tick 读 projection 的 `communications.warnings` 与快照）。
    - `seededContent` 复制自 `mission-result.ts` 的私有函数（本项不得改该文件）。
  - **用例：** 新增 [joint-warning.development.spec.ts](../../../../../e2e/joint-warning.development.spec.ts)，在网络审计下运行。
    - 同一种子 `0x0eed1541`、无僚机的运行飞两次：先有 Web Audio（受信 Start 点击），再 `audio=unavailable`。
    - 输入只有页面控件的受信点击与输入区的 `p`。录制的每个 tick 均无命令且三轴为 0，即只有规则推动运行。
    - 视角始终为 0xC（DW-10 的有效视角之一），玩家字段 9 与 12 全程为 0（视觉门禁与雷达门禁满足）。
    - 每约 5 tick 以 `p` 暂停取样一次，每次 86–88 个样本，读同一 tick 的三方读数。
  - **Core（两次连续运行 × 两种音频，四条运行一致）：** 浏览器录制经 Node 重放与录制结果比较为 `{ match: true }`。
    - 敌机锁定 0 → 2（tick 38）→ 3（110）→ 4（182）→ 0：tick 219 发射，事件 `shot-fired` family missile，shooterKindBit 7。
    - `attackerOnTail` 为 tick 131–229（131 时敌机锁定 3、目标为玩家实体 1），tick 230 复位。
    - `missileIncoming` 为 tick 230–394（230 时导弹目标为玩家），导弹寿命结束后 tick 395 复位。
    - 两种音频下逐 tick 的警告时间线相同。
  - **三方读数：**
    - **store：** 每个暂停 tick 的 `communications.warnings` 与重放同 tick 的值相等。
    - **驾驶舱类型 9 指示条：** 读 slot 0 类型 9 记录的两段范围（params 230–300、340–410，行 450–465）的合成像素，排除合成 slot 中雷达（类型 5）盘面跨度覆盖的像素。
      - 机体标签（颜色 0xF）只在 `attackerOnTail` 于前 12 tick 内成立时出现，导弹标签（颜色 10）同理对 `missileIncoming`；其余时间各段为颜色 0。12 tick 为闪烁步进 0x15 单位加一帧。
      - 每个警告期间都见到标签与清除两相（闪烁），末样本两段均清除。
    - **声音消费者：**
      - 有 Web Audio 时，声音日志的 instrument-9 决定恰为：tick 131 `instrument-9-craft` started，tick 230 `instrument-9-missile` started。代码允许 `p` 恢复后 4 tick 内的 `audio-paused` 重试，本次未出现。
      - 每个暂停 tick 探针中发声的 `sound/hud/instrument-9-loop` 声部与该 tick 的标志同 tick 相符：机体声部音量 50/127、存储速率；导弹声部 22,000 Hz、全音量；复位后无声部。
      - 无 Web Audio 时，没有音频上下文，每个标志成立的 tick 恰有一次 `failed (audio-unavailable)`：机体 131–229，导弹 230–394，共 264 条。
  - **互不推进（d）：** 无 Web Audio 时，store 与驾驶舱指示条照同一规则跟随同一时间线；声音消费者逐 tick 重试失败而不影响二者，Core 时间线不变。“启停”只覆盖音频不可用一种；页面没有独立的声音开关。
  - **范围说明：** 只验证 0xC 视角；1、6、8、0x11 的视角门禁由 P3-14 的 `hud-cues.ts` 测试覆盖，本项未在浏览器中复验。本项只证明信号与状态链路，**不代替 P3-14 V-06（其子任务 26）的人耳试听判定**。
  - **浏览器验证：** `OSR_E2E_DEV_PORT=5112 OSR_E2E_PREVIEW_PORT=5113 pnpm test:e2e e2e/joint-warning.development.spec.ts --project=development` 连续两次通过，每次 1 passed，2.6 min 与 2.3 min；网络审计无违规。
  - **审查与清理：**
    - rubber-duck（code-review 子代理）指出一处，已采纳：`p` 恢复后控制器在 `statechange` 前仍为 paused，警告起始 tick 若紧随恢复，首次开始会被拒为 `audio-paused` 并在下一 tick 重试。断言改为允许恢复后 4 tick 内的此类重试，声部期望从实际开始 tick 起算。
    - 开发中发现合成 slot 的雷达盘面与指示条两段重叠，像素读取改为排除雷达跨度。
    - simplify 四角度审查已采纳：简化 `warningSpans`；`readWarnings` 只读 tick 与警告（视角与门禁取自 `pauseWhen` 的状态）；指示条读取的静态像素按 fixture 缓存；声音日志解析移入 support；每次暂停的三次页面读取并行；时间线的敌机字段改为非空。
    - 未采纳：导出 `mission-result.ts` 的 `seededContent`（超出写入范围，建议由后续任务处理）；证据仍写文件后附加（便于取证）；逐 tick 快照的开销（每条约 440 tick，可接受）。
  - **工程检查：**
    - `pnpm typecheck`、`pnpm lint`、`pnpm build` 通过。
    - `pnpm check` 两次都只在 vitest 阶段失败，原因都是 5 s 超时：机器高负载（load ≈ 16–67，有并行 worker），第一次 4 个、第二次 5 个，均为 `tools/engineering-boundaries.test.ts` 与 `src/render`、`src/app/session` 的测试，与本项无关（本项未改 `src/`）。
    - 这些文件以 `--testTimeout 60000` 单独运行全部通过（141/141、221/221）。其余 440 个文件、11,895 个测试通过。
  - **文档影响：** `docs/engineering/README.md` 的 E2E 说明归子任务 10，建议措辞已写入 worker 报告；其他文档无需更新。原版事实未新增。

