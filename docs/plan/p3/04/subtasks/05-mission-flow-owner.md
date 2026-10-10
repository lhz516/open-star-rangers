---
type: plan
status: active
phase: P3
task: "04"
subtask: "05"
updated: 2026-10-09
---

# 05 — 任务流程与任务所有者

**契约来源：** [spec](../spec.md) 的 S-03、S-04、S-05，[应用流程](../spec.md#应用流程)、[开始资格](../spec.md#开始资格)、[任务开始配置](../spec.md#任务开始配置)、[衔接占位](../spec.md#衔接占位)、[任务菜单、暂停与退出](../spec.md#任务菜单暂停与退出)、[消费者接线与释放](../spec.md#消费者接线与释放)、[离页保护](../spec.md#离页保护)；AC-05（所有者部分）、AC-07、AC-08（Node）、AC-09、AC-10（Node）。
**依赖：** 01, 03, 04。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **任务输入：** 把 [mission-diagnostics.ts](../../../../../src/app/resources/mission-diagnostics.ts) 中解码三份逻辑 Asset 的逻辑提取为与诊断共用的 helper（计划新增 `src/app/resources/mission-input.ts`），诊断行为与输出不变；任务所有者用它从同一代资源包取得 `CreateWorldInput` 的 Asset 部分，不从另一代补齐。
- **开始资格**（计划新增 `src/app/mission/mission-eligibility.ts`）：由持有者快照推导可开始或各原因（没有包、部分包附组状态、诊断 `not-attempted`/`failed` 附类别路径原因、清理锁存）；缓存 listed/saved、作业 finished 都不能代替；完整但未保存/保存失败可开始。
- **流程状态机**（计划新增 `src/app/mission/mission-flow.ts`）：介绍、配置、出发、飞行、任务菜单、故障或停止；与会话状态对应；配置页预选规则（首次名单第 1 项；同一内容身份下保持上次成功确认的选择，含无僚机；新身份或页面重载重置；未确认编辑不覆盖）。
- **任务所有者**（计划新增 `src/app/mission/mission-owner.ts`）：
  - 绑定 holder 实例、generation 与完整内容身份；打开与确认时都重读 `current()`；代际变化时拒绝开始。
  - 原子开始：同步校验、取种子（端口失败即开始失败，不回退）、创建唯一运行；重复点击与迟到回调不能再创建；Core 创建错误留在配置页显示类别、路径与原因；会话、消费者或离页登记失败回滚，回滚失败锁存。
  - G-02/1 与 G-02/2 占位：所有者持有一个单次计时器，以单调时钟核对累计可见时间（3,000 ms）；hidden/pagehide 时保留剩余时长并撤销计时器，恢复后继续；提前回调不提前完成；按钮与 Enter/Space/Esc 的跳过意图只接受一次；出发结束以当前 ownerId 与 runId 的完成凭证调用会话 `complete-departure`；计时器登记、取消或时钟失败显式报告，取消失败锁存，不跳过占位、不启动运行。
  - 任务菜单：只在 running/paused 打开，先确认暂停成功；继续须关闭菜单并成功 resume，失败留在菜单显示原因；其他 phase 不开放。
  - 重开：exit 成功并完成必要收尾后回到介绍；清理失败不进入新流程，只允许返回菜单。返回菜单：先失效并尝试释放所有者。
  - 两级所有权：运行级消费者登记（按注册逆序、至多一次释放，不迁移到新运行）；所有者级资源登记（跨运行保留）；释放顺序为输入与计时器失效 → 会话 → UI 桥接与诊断 → 离页保护 → 画面与音频等；每项都尝试，失败汇总；异步关闭资源按关闭屏障登记，在确认关闭前禁止重建。本任务只登记本任务实际接入的资源，不创建音频或空媒体适配器。
  - 离页保护：在 transition/running/paused/stopped/faulted 登记一份，exit/dispose 撤销；介绍、配置与菜单不登记；登记失败阻止开始并回滚，撤销失败锁存。
  - 录制选项由所有者选项提供（开发 `{ producer, checkpointInterval: 32 }`，生产 null），所有者不读取构建模式。
- **任务槽位**（计划新增 `src/app/composition/mission-slot.ts`）：每个应用实例一个；ownerId 递增；先关闭旧所有者再创建新所有者；清理失败在本应用实例内锁存，之后不再创建；与查看器锁存独立。
- **资源包替换与销毁顺序：** 所有者订阅 `beforeReplace`，同步失效并释放，返回菜单且附原因；监听抛错不否决替换，槽位先锁存。提供 DOM-free 的应用级收尾顺序 helper（先释放任务槽位，再销毁 holder），供 09 在 React 接线中使用并在 Node 中测试，不依赖 `ResourceHolder.dispose()` 发出通知。
- 计划新增 Node 测试支持：由 01 的合成组组装持有者与资源包（复用 [resource-holder.test-support.ts](../../../../../src/app/resources/resource-holder.test-support.ts)，含 P3-03 对它的扩展），供本项与 07、09 的测试使用。资格只依据持有者的全包判定与任务诊断，不硬编码组或角色清单，因此随切片定义版本变化自动适用。

## 不包含

- React 页面、`App` 接线、端口生产实现与测试入口（09、04）；UI store 与桥接（06）；开发诊断（07）。
- 原生 `beforeunload` 对话框与浏览器流程证据（10）；运行中衔接（P3-10、P3-11）。

## 关键文件与契约

- 计划新增：`src/app/mission/mission-eligibility.ts`、`mission-flow.ts`、`mission-owner.ts`、`mission.test-support.ts` 及相邻测试；`src/app/composition/mission-slot.ts` 及测试；`src/app/resources/mission-input.ts`。
- [mission-diagnostics.ts](../../../../../src/app/resources/mission-diagnostics.ts)：提取共用解码，行为不变。
- [resource-holder.ts](../../../../../src/app/resources/resource-holder.ts)：只读消费 `current()`、`getSnapshot()`、`beforeReplace`；不改其销毁语义。
- 03 的 `src/app/session/game-session.ts`；04 的 `src/app/mission/mission-ports.ts`。
- 参照：[synthetic-demo-lifecycle.ts](../../../../../src/app/composition/synthetic-demo-lifecycle.ts) 的槽位与锁存；[viewer-owner.ts](../../../../../src/app/viewer/viewer-owner.ts) 的关闭屏障。

## 写入范围

- `src/app/mission/**`：流程、资格、所有者、测试支持与测试（不改 04 定稿的端口语义）。
- `src/app/composition/mission-slot*.ts`：任务槽位与测试。
- `src/app/resources/mission-input*.ts`：共用解码 helper 与测试。
- `src/app/resources/mission-diagnostics.ts`：改为使用共用 helper。
- `src/app/resources/mission-diagnostics.test.ts`：保持既有断言，必要时补充。

## 验收标准

- [ ] AC-07：开始 → 介绍 → 配置 → 出发 → 运行 → 重开 → 返回；2,999 ms 可见时间不自然结束、3,000 ms 后下次回调可结束；隐藏/离页不计入；所有结束路径至多一次；默认、无僚机、5 个索引与保留选择正确；每次实际创建尝试只抽一次种子，允许重复值，错误不回退；失败原子回滚；新运行 tick 0 且无旧意图。
- [ ] AC-05（所有者部分）：自然结束、跳过、隐藏/离页、重开与释放交错时不启动旧运行；隐藏后返回可见仍要求显式继续；计时器与时钟故障可见，取消失败锁存。
- [ ] AC-08（Node）：五类资格结果正确；`loaded` 只允许进入配置，`createWorld` 失败留在配置；打开与确认之间代际变化被拒绝，不混合 Asset。
- [ ] AC-09：运行级消费者逆序、至多一次释放且不迁移；所有者按规定顺序释放，失败仍尝试独立项并锁存；分别验证 `beforeReplace` 路径与 holder 销毁路径（收尾顺序 helper 先释放任务）；替换后没有旧运行或回调；缓存状态变化不重建运行。
- [ ] AC-10（Node）：每个有运行的 phase 恰有一份离页登记，exit/dispose 后为零；登记失败回滚。
- [ ] 任务诊断的既有测试不改断言通过；`pnpm exec vitest run src/app` 与 `pnpm check` 通过。

## 验证方法

- Node：真实会话与 Runtime、合成任务包、可控计时器、时钟与种子端口替身；部分初始化与释放失败的替身。
- 浏览器验证由 10、11 完成；不适用原版对照。

## 完成证据
