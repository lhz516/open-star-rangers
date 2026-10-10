---
type: plan
status: active
phase: P3
task: "02"
subtask: "13"
updated: 2026-10-09
---

# 13 — 重负载测试的超时修复

**契约来源：** [spec](../spec.md) 的 AC-11（规范文本上限）；[工程约定](../../../../engineering/README.md)的测试约定；`pnpm check` 作为每次集成的门槛。
**依赖：** 04。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 背景

集成 05 时 `pnpm check` 有两个测试超过 Vitest 默认的 5 秒而失败（系统负载约 12，其他会话同时运行）。两者单独运行时都通过，重跑完整检查也通过：

- `src/core/contracts/canonical-text.test.ts` 的“accepts a text of exactly 16777216 characters and rejects one more”：单独运行约 0.7 秒，完整检查中约 6.9 秒。06 的 worker 在负载 16–28 时也遇到同一超时。
- `tools/engineering-boundaries.test.ts` 的“checks every DOM-free render module in the Node program and no browser module there”：单独运行约 0.5 秒，完整检查中约 7.6 秒。该文件最近一次由 04 修改。

后续的 07、08 每次集成都要运行 `pnpm check`，偶发超时会拖慢集成并在 CI 上误报。

## 工作范围

- 查明两个测试在完整并行运行时变慢的原因（大字符串分配、TypeScript 程序构建、并行文件间的 CPU 与内存争用等），并对照 04 之前的提交判断渲染边界测试是否因 04 的改动变慢。
- 修复为在负载下稳定通过，不削弱断言：
  - 优先减少重复的重计算或大分配（如复用已构建的程序或字符串），保持对上限两侧和每种输入形式的覆盖；
  - 仍然需要较长时间的，给该测试或该组设置显式超时，并在代码旁用一句话写明依据与实测时间。
- 不改被测实现，不改 Vitest 的全局默认超时。

## 不包含

- 被测的 `canonical-text.ts` 与 ESLint 规则本身的行为。
- 其他测试的性能优化。

## 关键文件与契约

- [canonical-text.test.ts](../../../../../src/core/contracts/canonical-text.test.ts)、[engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)。
- [vite.config.ts](../../../../../vite.config.ts) 的 `test` 节：项目划分与全局设置（只读）。

## 写入范围

- `src/core/contracts/canonical-text.test.ts`：上限测试的超时与重计算。
- `tools/engineering-boundaries.test.ts`：渲染边界测试的超时与重计算。
- `docs/engineering/README.md`：测试一节中关于负载下超时的说明（只改这一处）。

## 验收标准

- [x] 两个测试的变慢原因已查明并记入完成证据，包括渲染边界测试是否因 04 变慢。
- [x] 断言覆盖不变：上限两侧、字符串与数组两种输入、渲染边界的全部检查仍在。
- [x] 在并行负载下（例如同时运行两份 `pnpm test`，或在 load average 不低于 8 时运行 `pnpm check`）两个测试都通过；完成证据记录修改前后的单独与负载下耗时。
- [x] `pnpm typecheck`、`pnpm lint` 通过；完成前运行 `pnpm check`。

## 验证方法

- `pnpm exec vitest run src/core/contracts/canonical-text.test.ts tools/engineering-boundaries.test.ts --reporter=verbose` 记录单独运行耗时。
- 在负载下运行完整检查并记录两个测试的耗时。

## 完成证据

- **变慢原因（已确认）：** 两者都是 CPU 密集的单线程计算，单独运行 0.5–0.75 s；全量运行时 4 个 Vitest worker（8 核中 4 个是能效核）、测试启动的构建与其他会话争用 CPU，耗时随负载放大：load 7–8 约 ×3，load 12–14 约 ×4–9，load 90 约 ×19。
  - 上限测试：开销在被测实现的 `writtenLength`，它在写出前逐个码元读取并查表，每个 16 M 码元的字符串 130–180 ms。原测试做 4 次扫描和 2 次 16 MiB 的 `JSON.stringify`（各约 45 ms），共 0.65–0.75 s。大分配不是主因：4 个独立字符串改为复用 1 个字符串加 `slice`，实测 633–787 ms 对 614–649 ms，差异在噪声内，因此没有保留。
  - 渲染边界测试：它是第一个读取 `sharedNodeFiles` 的用例，要构建真实的 Node TypeScript 程序：194 个根文件，共 1,111 个文件，其中需要新解析 607 个（388 个工具、测试与源码，219 个此前程序未解析过的包声明，含约 2.3 MB 的 Playwright 类型与 `typescript.d.ts`），单独运行 0.5–0.6 s。曾试过让 Node 程序复用 app 程序已解析的 `src` 文件，可省约 0.1 s，但不安全：TypeScript 把随编译选项变化的隐式导入（如 `react/jsx-runtime`）缓存在 SourceFile 上，Node 程序因此多出 4 个文件（csstype、@types/react 等）。因此未采用。
  - **不是 04 造成的：** 04 前（7ae4690）、04（301704a）与当前（a96d878）的 Node 程序分别为 1,076、1,088、1,111 个文件。渲染边界测试单独运行各 3 次，分别为 566–892、572–689、580–855 ms，差异在噪声内。工程约定早在 2026-10-08（P2-12，04 之前）就记录过该用例在 load 13–30 下超时。
- **修改：**
  - [canonical-text.test.ts](../../../../../src/core/contracts/canonical-text.test.ts)：上限测试按输入形式拆成字符串与列表两例，每例只做 2 次扫描（原为 4 次）。写出或扫描上限规模文本的 5 个用例放进 `limit-sized texts` 组，组上声明 30 s deadline，并用一行注释写明实测依据。
  - [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)：真实 Node 程序改由文件级 `beforeAll` 构建一次，限时 30 s，旁注实测依据。4 个读取者与全部渲染边界检查不变。代价是只运行该文件的部分用例时也会构建一次（约 0.6 s）。
  - 被测实现与 Vitest 全局配置未改；“Vitest discovery”用例仍确认配置中没有 `testTimeout`/`hookTimeout`。
- **断言覆盖：** 字符串仍检查 LIMIT−2 个 `a` 写出恰为 LIMIT、LIMIT−1 被拒；列表仍检查 LIMIT−4 写出恰为 LIMIT、LIMIT−3 被拒；路径与原因不变。转义、编码前拒绝与 Proxy 三例的断言原样保留（只改缩进）。渲染、存储、资源与音频的 Node 程序检查原样保留。用例数从 120 变为 121，因为上限测试拆成了两例。
- **耗时（ms）：**
  - 单独运行：`pnpm exec vitest run src/core/contracts/canonical-text.test.ts tools/engineering-boundaries.test.ts --reporter=verbose`，load 3–8。
    - 修改前：上限 738，渲染 540。
    - 修改后：字符串 292、列表 358、转义 341、编码前拒绝 61、Proxy 170；Node 程序 `beforeAll` 553（临时插桩测得，已移除），渲染读取者 1。
  - 负载下 A/B：修改前用 `git archive` 导出的 a96d878 副本，修改后用本 worktree，两份完整 `vitest run` 同时运行，因此负载相同，另加 N 个 CPU 占满进程。副本缺少 git/pnpm 元数据，导致 `compliance/packages.test.ts` 有 3 例失败，与本任务无关。
    - N=2，load 均值 7.9、峰值 14.0：修改前上限 1,348、渲染 818；修改后各例 ≤758、`beforeAll` 1,833。全部通过。
    - N=6，load 均值 19.9、峰值 26.4：修改前上限 2,075、渲染 1,707；修改后各例 ≤1,038、`beforeAll` 2,405。全部通过。
    - 中间方案（30 s 挂在各用例上，拆分时复用字符串，计算量与最终方案相同），load 均值 14.4、峰值 20.2：修改前上限 3,178、渲染 2,651；修改后各例 ≤1,618、渲染 2,631。全部通过。
    - 同一中间方案在其他会话叠加下，load 均值 89.8、峰值 194：修改前上限 13,995、转义 13,966、Proxy 9,106、渲染 13,721，均超过 5 s 失败；修改后各例 ≤18,629、渲染 12,879，均在 30 s 内通过。这一负载下另有一批不相关的用例在修改前后都超时，不在本任务范围。
- **检查：**
  - `pnpm typecheck`、`pnpm lint` 通过。
  - `pnpm check` 通过：172 个文件、5,002 个用例与构建全部通过，运行期间 load 均值 25.9、峰值 27.9。
- **评审与整理：**
  - rubber-duck：没有代码问题，唯一意见是完成证据缺失，现已补齐。
  - simplify：采纳 3 条：改为两个普通用例代替 `it.each` 加 `slice`；deadline 放到用例组上；Node 程序改由单个 `beforeAll` 构建。未采纳 1 条：改用数字形式的第三参数。仓库已用 `describe` 选项对象（如 e2e-configuration），并且选项对象让 deadline 紧挨用例名。
- **文档影响：** [工程约定](../../../../engineering/README.md)测试一节中“低负载下复跑、未改超时”的说法已改为现在的做法（写入范围在 d16a4f8 放宽）。STATUS 与阶段 tasks.md 不需要改。
