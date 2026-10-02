---
type: plan
status: active
phase: P1
task: "01"
subtask: "04"
updated: 2026-10-01
---

# 04 — 检查链发现与失败传播

**契约来源：** [spec](../spec.md) 的 S-02、S-03、S-04；AC-05、AC-06、AC-09。
**依赖：** 03。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 验证新测试被现有 `tools/**/*.test.ts` 发现，现有解析器集合仍被发现，`pnpm test` 与 `pnpm check` 都实际运行回归。既有配置足够时不另加 runner/script。
- 加固本任务专用检查函数的失败语义：负向预期未满足、正向出现诊断、检查器异常、未应用/ignored 和空用例/空输入必须是显式断言失败，不能 catch 后返回通过结果。
- 使用合成诊断/预期不匹配或受控检查器故障验证失败路径；只对本任务辅助函数注入输入，实际成功路径始终使用真实 TS/ESLint 结果，不复制或削弱生产规则。
- 为失败传播取得一次隔离的预期失败 runner 非零退出证据。临时失败用例使用独立自有临时位置，保留实际 Vitest 配置与当前项目依赖；不向生产目录写违规源，不永久留下失败测试，不把它计入正常测试集合。
- 执行完整工程检查与独立 Python XML 测试，确认既有测试未被删除/skip/降级。发现数量空缺或基线失败明确记录。

## 不包含

- 不建设通用编排工具、增加包依赖或把 Python 塞进 pnpm check。
- 不为让失败实验通过而修改 TS/lint 边界；不运行实际研究命令。
- 浏览器与证据说明同步由 05 负责。

## 关键文件与契约

- 02/03 新建的 `tools/engineering-boundaries.test.ts`：检查器异常与预期失败语义的回归，必要的小型检查函数留在此文件。
- [Vite/Vitest](../../../../../vite.config.ts)、[package.json](../../../../../package.json)：现有 test/check 入口；仅在实证发现接入缺口时直接修正，不改依赖版本。
- [Python 测试](../../../../../tools/ghidra/test_patch_watcom_cspec.py)及现有解析器测试：保持原样的检查对象。

## 验收标准

- [ ] AC-05：真实 runner 发现新边界用例和既有测试；无零用例成功或错误忽略。
- [ ] AC-05：目标限制失效、合法样本误报、检查器错误/未应用、空输入均触发失败，反馈含样本/位置/预期/实际。
- [ ] AC-05：一次隔离失败运行产生预期断言且进程非零退出；模块找不到或临时环境配置失败不算有效证据。
- [ ] AC-06：正常完整 `pnpm check` 和独立 Python 测试当前通过，发现集合没有未经说明的删除/skip。
- [ ] AC-09：失败实验已清理，不污染生产文件、正常发现范围或用户已有文件。

## 验证方法

- 针对性 `pnpm test -- tools/engineering-boundaries.test.ts`；整体 `pnpm test` 的发现结果和 `pnpm check` 的传播。
- 隔离预期失败 Vitest 进程，保留目标断言/非零结果作为证据；正常运行仍为零退出。不能仅用 `expect(...).toThrow` 推断 CLI 已传播失败。
- `python3 -B -m unittest discover -s tools/ghidra -p 'test_*.py'`，记录解释器版本。
- 代码变更用 [simplify](../../../../../.agents/skills/simplify/SKILL.md) 只检查此项 diff，重跑受影响检查。无浏览器或原版对照。

## 完成证据
