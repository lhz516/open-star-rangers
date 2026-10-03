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

- [x] AC-03：当前两条命令真实运行，版本、发现、各阶段结果和退出码完整记录；只有全部通过才支持工程退出条件通过，数量不硬编码为阈值。
- [x] AC-06：Node 正/负 replay 断言确实执行，固定输入/种子及 events/checkpoints 比较沿现有契约，无跨引擎或正式存档承诺；浏览器一致性仍归03。
- [x] AC-10：实际失败可定位原责任与恢复，契约内缺陷在本Goal独立修复项重验闭环；本项不写补丁，不能降低断言、改发现范围或把未运行阶段记为通过。
- [x] AC-14：源码/配置/依赖无本项修改，临时合成测试收尾，不碰原版、用户存储或真实 Ghidra；文档和候选/构建身份准确。

## 验证方法

- 实际两命令及当前配置/测试源码发现核对；不另跑同一全套子测试来凑证据。若构建产物供03/04使用，记录其身份而非只确认 dist 存在。
- Node沿已有60/120 Hz、seed0/uint32上限等合成配置，重放事件与checkpoint用生产比较器及固定断言，FNV一致性hash不解释为安全来源hash。
- 本项不操作浏览器，无实现变化，不需代码 simplify。核对完成证据链接、日期、隐私和 diff；必要错误/未验证显式记录。

## 完成证据

- 2026-10-03，候选 `831d231` 加本Goal验证文档；生产/测试/config/lock无本项差异。Node22.22.0/pnpm12.8.1/Python3.12.3；TS6.0.3/Vitest5.0.3/Vite8.3.1。

| 必需命令／阶段 | 实际结果 |
|---|---|
| `pnpm check` | exit0；core/app/node/e2e四TypeScript程序、ESLint、Vitest 56文件/1272测试全通过、fresh production build通过，无失败/skip/todo |
| `python3 -B -m unittest discover -s tools/ghidra -p 'test_*.py'` | exit0；3测试，结构保留/备份、幂等、unsupported失败不改写全通过；临时合成XML由TemporaryDirectory清理，不调用Ghidra |

- 实际发现仍为src/tools `.test.ts`，E2E独立；[边界测试](../../../../../tools/engineering-boundaries.test.ts)包含真实纯程序无DOM/Node、目标诊断正负、空/ignored/parser失败、预期失败Vitest非零、render import/scheduling/program边界，全部进入上述56文件，未删skip/放宽。Runtime/Session/UI/输入/合规的原正负断言随同执行，不重造矩阵。
- [Node replay](../../../../../src/core/synthetic/synthetic-replay.test.ts)实际覆盖60/120Hz、seed0/uint32上限、interval1/4的精确events/checkpoints、JSON/固定hash及非法format/version；[比较器](../../../../../src/core/synthetic/synthetic-replay-compare.test.ts)真实独立结果的`match:true`、events/hash偏差、checkpoint间隔/优先级及非法结果拒绝。[Session](../../../../../src/app/session/synthetic-session-replay.test.ts)证明pause/hidden/resume只记录成功输入，与裸Runtime一致；[UI](../../../../../src/ui/game/synthetic-game-replay.test.ts)证明采样/取消/错误不改录制。不是浏览器或正式存档证明，03另测Node/浏览器同记录。
- 当前build：index-BF0vE3hr.js 811391bytes / gzip219.50kB，SHA256 `0d6401fe467b6990e6d49aac92cc6ec630425a35f3f191cc84ab6dec1b756fea`；map SHA256 `ebca9b64c3961bf4dba0a063acc59bcb4d3c0630f5ceb7ea1132ef1cbd15be40`；inventory240输入checksum `022946f1d92be7559226e45581cdb5fb57b56ca01934377d602a36b21c0ac1e0`，与P1-12输入/产物相同；checksum非签名/通过报告。完整生成文件/许可归04，不以dist存在代替。
- 只保留既有Vite500kB chunk警告，不 suppress；首次命令均通过，无重跑/补丁/新增修复项，无缺依赖安装。文档影响：实际命令/测试约定未变，工程早期未接页面叙述仍由05纠正；本项无新原版事实/ADR或接口变化，无实现simplify。所有测试自有临时fixture自行收尾，无原版/用户存储/生产源码修改。
- rubber-duck限定本项完整diff及契约/实际测试，独立核对计数、版本、hash，无阻塞问题；审查结束才将02改completed。证据按无代码例外先保存，最终文档提交。
