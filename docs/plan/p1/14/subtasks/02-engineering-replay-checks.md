---
type: plan
status: active
phase: P1
task: "14"
subtask: "02"
updated: 2026-10-03
---

# 02 — 当前工程、Python 与 Node replay 核验

**契约来源：** [Spec](../spec.md) 的 S-02、S-03；AC-03、AC-06、AC-10、AC-14。
**依赖：** 01。
**执行状态：** 仅由 [Goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在01候选上实际运行 `pnpm check` 与独立 `python3 -B -m unittest discover -s tools/ghidra -p 'test_*.py'`，记录工具/解释器版本、四个类型程序/lint/Vitest/build及 Python 的退出码、发现与结果，保留原警告。
- 核对纯 Core 的 Node 测试与工程边界正/负发现未删/skip/降级，现有 Runtime/Session/UI/输入/合规测试随 `pnpm check` 运行，不重造故障矩阵。
- 核对 Node replay 生产记录/结果、events/checkpoints、真实成功/偏差比较及非法输入拒绝，保留相同版本/运行时范围。核对 Python 测试只写自有合成临时 XML，不调用实际 Ghidra。
- 完成证据只写本文件，工程失败注明命令阶段、原因、影响条件、原责任及恢复；已定位缺陷按 [Goal 聚焦修复规则](../goal.md#按需聚焦修复)交独立修复项，修复后本项重验并保留首次失败与新结果。未执行的必需阶段不能当完成，不能用历史全绿抵消。

## 不包含

- 不改测试/类型/lint/源码、fixture或依赖版本，不安装新工具；缺依赖只按项目 frozen lock恢复。
- 不运行浏览器（归03）或替代04的实际分发/合规审阅，不读取原版数据/运行研究实验，不创造新快照/存档格式。

## 关键文件与契约

- 只读[package.json](../../../../../package.json)、[Vite](../../../../../vite.config.ts)、[边界测试](../../../../../tools/engineering-boundaries.test.ts)和[工程约定](../../../../engineering/README.md)；本项只写完成证据及本任务 tracker。
- [replay 契约](../../../../../src/core/synthetic/synthetic-replay.ts)的 `SyntheticReplayRecord`/`SyntheticReplayResult` 已存在，format/version不改；[replay 测试](../../../../../src/core/synthetic/synthetic-replay.test.ts)、[比较测试](../../../../../src/core/synthetic/synthetic-replay-compare.test.ts)、[Session replay](../../../../../src/app/session/synthetic-session-replay.test.ts)和[UI replay](../../../../../src/ui/game/synthetic-game-replay.test.ts)已进入 Vitest。
- [Python 测试](../../../../../tools/ghidra/test_patch_watcom_cspec.py)已有结构变换、备份/幂等、失败不改写的标准库断言，不属于 pnpm runner。

## 验收标准

- [ ] AC-03：当前两条命令真实运行，版本、发现、各阶段结果和退出码完整记录；只有全部通过才支持工程退出条件通过，数量不硬编码为阈值。
- [ ] AC-06：Node 正/负 replay 断言确实执行，固定输入/种子及 events/checkpoints 比较沿现有契约，无跨引擎或正式存档承诺；浏览器一致性仍归03。
- [ ] AC-10：实际失败可定位原责任与恢复，契约内缺陷在本Goal独立修复项重验闭环；本项不写补丁，不能降低断言、改发现范围或把未运行阶段记为通过。
- [ ] AC-14：源码/配置/依赖无本项修改，临时合成测试收尾，不碰原版、用户存储或真实 Ghidra；文档和候选/构建身份准确。

## 验证方法

- 实际两命令及当前配置/测试源码发现核对；不另跑同一全套子测试来凑证据。若构建产物供03/04使用，记录其身份而非只确认 dist 存在。
- Node沿已有60/120 Hz、seed0/uint32上限等合成配置，重放事件与checkpoint用生产比较器及固定断言，FNV一致性hash不解释为安全来源hash。
- 本项不操作浏览器，无实现变化，不需代码 simplify。核对完成证据链接、日期、隐私和 diff；必要错误/未验证显式记录。

## 完成证据
