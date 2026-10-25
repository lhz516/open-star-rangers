---
type: plan
status: active
phase: P3
task: "11"
subtask: "18"
updated: 2026-10-23
---

# 18 — 浏览器验证

**契约来源：** [spec](../spec.md) 的 AC-12；[验证策略](../spec.md#验证策略)的浏览器验证。
**依赖：** 17。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 在本机 Chrome 用现有独立 E2E runner 与合成包验证（计划新增 `e2e/mission-result.development.spec.ts`）：
  - 失败路径：两次被毁 → G-02/5 → 同关继续 → 第三次 → G-02/7 → 结果页（失败）→ 重试 → G-02/1 → 开始配置预选上次僚机 → 新 run 的 L-02 飞行。
  - 成功路径：全清 → 完成消息事件 → G-02/8（有/无 G-02/9）→ 结果页（成功，含总结）→ 重试至新 run 的飞行；另验证返回菜单。
  - 至少一次能量耗尽救援（G-02/6）。
  - 占位自然结束与跳过各至少一次；隐藏时的计时、焦点与 Tab、旧按键清除；新 run 状态重置；标注、错误、4:3 DOM；网络审计与资源平衡。
- 合成初始数据由测试构造（敌机与基地靠近玩家、可控能量），运行中只提交正式输入；只用测试侧诊断，不新增生产中修改状态的 API。缺测试能力时记入完成证据，交协调者新增修复子任务。

## 不包含

- 被毁视角与消息行的像素（P3-12、P3-13）；OS 快捷键实机验证（P3-15/P5）。

## 关键文件与契约

- [e2e/support/](../../../../../e2e/support/) 的 `base-interaction.ts`、`mission-observations.ts`、`network-audit.ts`、`resource-balance.ts`；先例 [base-interaction.development.spec.ts](../../../../../e2e/base-interaction.development.spec.ts)。

## 写入范围

- `e2e/mission-result.development.spec.ts`：计划新增的浏览器回归。
- `e2e/support/**`：合成任务包与观察辅助。

## 验收标准

- [x] 成功与失败两条路径都重试至新 run 的飞行；返回菜单可用；救援同关继续。（AC-12）
- [x] 覆盖 G-02/5、/6、/7、/8 及有/无 /9，自然结束与跳过、隐藏、焦点与旧按键清除。（AC-12）
- [x] 网络审计与资源平衡通过；`pnpm test:e2e` 中本 spec 与既有任务流程 spec 通过。

## 验证方法

- `pnpm test:e2e`（按需限定本 spec 与受影响的既有 spec）；DOM、键盘、读模型与生命周期联合断言，不以 Canvas 存在代替。

## 完成证据

- **2026-10-23（worker 18）：** 本机 Chrome 155.0.8059.85（Playwright channel `chrome`，macOS），开发服务器 `http://127.0.0.1:5154`，视口 1280×800、DPR 1。
  - **合成初始数据：** [mission-result.ts](../../../../../e2e/support/mission-result.ts) 在 Node 中替换 `mission-startable` 转换结果的任务与 craft-info payload（[ai-wingman.ts](../../../../../e2e/support/ai-wingman.ts) 新增的 `withPayloads`；任务字节由严格的 `encodeLogicPayload` 产生），在测试自己的隔离缓存中以开发测试入口的 profile 预置，再经主菜单恢复校验。三种变体：`failure`（重型友机 14 在玩家处，碰撞即被毁 → G-02/5；1 % 能量与速度成本 → 两次能量耗尽 → G-02/6、G-02/7 `energy`；约 1,400 tick）；`success`（无护盾的 7、8 号敌机在玩家处，碰撞全清 → G-02/8 `solo`，空总结；646 tick）；`success-cutscene`（总结选择值 16 → G-02/8 `wingman` 与 G-02/9，两条消息的总结）。按 15 的交接把玩家 +0xC0 设为 2。Node 中对多个种子、有无僚机逐一核对过这些终局；运行中不靠诊断写状态，只提交正式输入（Backspace、Enter、`]`、`p` 与页面按钮）。
  - **[mission-result.development.spec.ts](../../../../../e2e/mission-result.development.spec.ts)，4 例全部通过（`OSR_E2E_DEV_PORT=5154 OSR_E2E_PREVIEW_PORT=5155 npx playwright test e2e/mission-result.development.spec.ts --project development`，约 3 min）：**
    - 失败：G-02/5（transitionId 1，自然结束 ≥ 2.9 s；焦点留在用户点过的诊断面板按钮上，不被保持抢走）→ 同一 run 继续、Backspace 的 `speed` 被接受 → 能量耗尽后按住 `]` 与 Enter 进入 G-02/6（transitionId 2；焦点落空时 Skip 取焦点，Enter 的 repeat 不跳过；新的 Esc 结束，输入区重新取得焦点）→ G-02/7（`energy`，1/1，tick 静止，自然结束）→ 结果页（`third-loss:energy`、`failure` 总结说明、“2 of 2”、击杀 0）。导出录制在 Node 中重放与浏览器结果逐字段相等且以完成结尾；录制显示 `]` 在保持前有俯仰输入、G-02/6 之后直到松键为 0（旧按键清除）。按住 Enter 在 Restart 上重开：G-02/1 不被 repeat 跳过；开始页预选上次的僚机 0；新 run 的 runId +1、种子取第二个、tick 从头，其第一次损失再报 `rescues=1`（救援计数已重置）；经任务菜单返回主菜单，资源平衡通过。
    - 成功（有 G-02/9）：事件日志依次为 `all-clear`、`settlement-started`（总结 `mission/first-campaign 0/0`，选择值 16）、`flight-message missionComplete`、`result-latched`、`teardown-started`、`mission-completed`，无 `transition`；重放中全清之前只有 7、8 号的碰撞击毁，之后无击毁。G-02/8（`wingman`，1/2，按钮跳过）→ G-02/9（`16`，2/2，Space 跳过）→ 结果页显示合成总结文本与来源标注。重开时 G-02/1 自然结束，预选僚机，进入新 run 飞行，返回菜单与资源平衡通过。
    - 成功（无 G-02/9）：G-02/8 `solo`（1/1，Enter 跳过）→ 结果页 `empty` 总结；结果页上按 `p`、Backspace、`m` 不推进 tick；结果页的 Return to main menu 回到主菜单（入口取得焦点、无任务画面、无离页保护），资源平衡通过。
    - 每个结果页：标题取得焦点，Tab → Restart mission → Return to main menu，Shift+Tab 返回；结果视图保持 4:3；G-06、G-02/10 标注与文案一致；终局占位各自带 G 标注。
    - 真实隐藏（CDP 自建上下文、两个真实标签页切换，headed）：G-02/5 时隐藏 → `waiting`、tick 260 不动、3.5 s 后仍在；可见后跳过 → 飞行为 `paused`/`hidden`，显式 `p` 才继续；G-02/7 时隐藏 3.5 s 不计时，可见后按页面时钟计的隐藏前与可见后时间合计达到自然结束时长才进入结果页，标题取得焦点。终局占位不会在隐藏页上挂载（隐藏时 run 已暂停），因而“隐藏时不抢焦点”只由 17 的 Node 测试覆盖。
  - **网络审计与浏览器错误：** 每例都在审计 fixture 下运行（合成总结与来源指纹为金丝雀），无违规、无缺口、无浏览器错误。
  - **回归：** 新 spec 与 `mission-flow.development`、`mission-flow.production`、`base-interaction.development`、`ai-wingman.development`、`probe-contract`、`resource-balance-controls`、`webgl-unavailable`、`version-4-viewer` 合跑 44 例全部通过（8.5 min）；清理后再跑新 spec、`ai-wingman.development` 与 `keyboard-input.development` 22 例通过。`pnpm check` 通过。
  - **支持代码：** [production-cache.ts](../../../../../e2e/support/production-cache.ts) 把 `seedProductionCache` 拆成 Node 侧 `seedRecords` 与自包含的页面函数 `storeSeed`（行为不变），供原生 CDP 目标预置；[keyboard-input.ts](../../../../../e2e/support/keyboard-input.ts) 提取 `saveRecording`；[ai-wingman.ts](../../../../../e2e/support/ai-wingman.ts) 新增 `missionAssetContent`、`withPayloads`、`ruleDataBytes`，`withRuleData` 改为其薄封装。
  - **rubber-duck：** 无阻塞问题；三项非阻塞建议均已采纳（重放核对全清前的碰撞击毁、重开后的第一次救援计数、原生隐藏计时改用页面时钟）。simplify：采纳通用 payload 替换、复用资产读取与录制下载、去掉多余导出；未采纳的：扩展 `watchPositions`/`endPlaceholder`（会改变其他用例依赖的键语义）、用 page clock 快进（自然结束本身是验收项）、预置时的字节数组序列化（既有做法）。
  - **文档影响：** 本子任务写入范围外的 `docs/engineering/README.md`（E2E 预置与观察支持）与 `docs/engineering/source-structure.md`（`e2e/support/` 说明）应提到 `mission-result.ts` 与 `seedRecords`/`storeSeed`，交 22。

