---
type: plan
status: active
phase: P1
task: "10"
subtask: "05"
updated: 2026-10-10
---

# 05 — 同版本 Node 与浏览器 replay 回归

**契约来源：** [Spec](../spec.md) 的 S-04；AC-07、AC-11。
**依赖：** 01。
**执行状态：** 仅由 [Goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 独立合成记录为osr-synthetic-replay/1、seed0、tickRateHz50、checkpointInterval1，ticks复用Session录制回归的4个成功输入：moveX1/add-marker；moveX1/无命令；moveX0/无命令；moveX-0.5/remove-marker。不把取消的remove写进记录，不包含wall-clock/runId。
- Node生产replay生成参考events/checkpoints；开发origin动态导入同版本公开纯模块，在隔离场景对同一JSON记录执行replay，再用生产compare返回{match:true}，精确结果同时相等。
- 改变一个合法参考checkpoint hash，生产比较器必须返回match:false及真实tick/kind；非法format/version必须由生产校验拒绝而非测试自写校验。不复制完整Node负向矩阵。
- 报告记录Node/Chromium版本、代码身份与记录摘要，限定当前版本样本一致性。按[简化](../../../../../.agents/skills/simplify/SKILL.md)清理当前用例。

## 不包含

不改App默认owner、不开启UI录制、不调运行中的Session/Core、不重写hash/比较器；不新增公共schema或跨引擎逐位保证。生产页面回归由03/04负责，本项按Spec只在开发origin加载纯模块。

## 关键文件与契约

- 计划新增 e2e/browser-replay.spec.ts；记录与Node参考可留在该文件，不另存永远需要维护的参考JSON。
- 只读[SyntheticReplayRecord/Result与函数](../../../../engineering/source-structure.md#r1-合成-core)、[Session既有4tick序列](../../../../engineering/source-structure.md#r4-合成会话)、[快照hash](../../../../engineering/source-structure.md#r1-合成-core)。
- 复用01的origin/浏览器准备；本项不依赖DOM/GPU资源探针。

## 验收标准

- [x] AC-07：实际浏览器events/checkpoints与同版本Node精确相同，生产compare返回{match:true}。
- [x] AC-07：合法hash单点改变得到真实mismatch/tick，非法format/version由生产replay明确抛错。
- [x] AC-11：没有App状态/内部tick/录制接线变化，纯模块版本与4输入摘要可追溯。
- [x] pnpm check、该开发E2E及现有Session录制聚焦回归通过，不宣称生产UI导出按键记录。

## 验证方法

使用已有 pnpm exec vitest run src/app/session/synthetic-session-replay.test.ts 与01新增runner的开发replay用例；按[browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)隔离执行。JS浮点只证明此Node/Chromium样本环境，显示文字不作精确hash来源，无原版/实机对照。

## 完成证据

- 2026-10-03：[browser-replay](../../../../../e2e/browser-replay.spec.ts)在development origin4173实际通过，Node22.22.0与Chrome154/macOS。通过URL导入生产纯模块，只计算新的独立scene，不访问页面owner。记录为osr-synthetic-replay/1、seed0/50Hz、interval1及契约指定4输入；不含被暂停取消的命令、wall-clock或runId。
- Node生产replay生成events/checkpoints参考；浏览器结果逐项精确相同，真正的生产compare返回`{match:true}`。合法tick2参考hash只改首个十六进制字符，生产compare返回`{match:false,tick:2,kind:'checkpoint'}`；非法format/version分别由生产校验抛CoreInputError，若没有抛错测试立即失败。
- `pnpm test:e2e browser-replay.spec.ts --project=development`通过；`pnpm exec vitest run src/app/session/synthetic-session-replay.test.ts`3/3通过；`pnpm check`通过（47文件/1192测试、type/lint/build）。附件记录Node/browser/origin、完整输入、参考/观察及纯模块6文件的SHA256和record SHA256，只证明当前版本此样本环境。
- rubber-duck无实现/契约阻塞；证据在本次提交前补齐。simplify限定单用例，直接复用既有replay/比较/错误fixture，不引入固定参考JSON、schema或录制UI。文档影响检查：工程命令、Core与默认seed0/60Hz/recording-off演示仍准确，无生产源码/原版事实/ADR变化；07补覆盖边界。隔离context/browser/server随runner收尾，附件ignored。
