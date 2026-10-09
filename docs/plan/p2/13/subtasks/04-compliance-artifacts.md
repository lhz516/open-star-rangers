---
type: plan
status: active
phase: P2
task: "13"
subtask: "04"
updated: 2026-10-08
---

# 04 — 合规与产物审阅适用性

**契约来源：** [spec](../spec.md) 的 S-02、S-03、AC-04、AC-06、AC-10 与 AC-12；技术决定 2、4、5。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **聚合合规：** 在干净工作树的当前提交上运行 `pnpm --silent check:compliance`。记录 `format`（`osr-local-compliance`）、`version`（1）、`kind`、各范围的完成状态与计数、findings、coverage、`passed` 与退出码。需要持久报告时只写入被忽略的 `test-results/compliance/`。
- **依赖文件：** 核对 `package.json`、`pnpm-lock.yaml` 与 `.nvmrc` 相对 `f925d21` 的差异。没有变化时写明；有变化时按 P2-12/11 的方法重新审阅新增或变化的依赖与声明。
- **构建指纹与出站清单（AC-10、S-03）：** 按 P2-12/12 的算法得到本次构建的分发文件清单与指纹，与 P2-12 最后一次出站扫描绑定的构建（`local/research/p2-12/outbound/build-manifest.txt`）及 `final-26b` 比较。
  - **相同：** 出站 API 清单与来源/许可人工审阅对当前构建直接适用，记录比较结果。
  - **不同：** 把 `outbound-scan.ts` 复制到 `local/research/p2-13/outbound/` 后运行，先跑 `--control` 再跑扫描，保留 P2-12 的输出不变；对变化的 chunk 按 P2-12/11 的方法重做人工审阅。
- **生成的声明：** `LICENSE.txt`、`THIRD-PARTY-NOTICES.txt` 与 `compliance-inventory.json` 由本次构建生成，不手改。
- **失败处理：** 同 02（技术决定 5、6）。

## 不包含

- 最终评审文档定稿后的 `check:original`（08）。
- 修改合规工具、manifest 或许可政策；法律、名称、秘密或首次公开的确认。

## 关键文件与契约

- [tools/compliance/cli.ts](../../../../../tools/compliance/cli.ts)、[report.ts](../../../../../tools/compliance/report.ts)、[build-plugin.ts](../../../../../tools/compliance/build-plugin.ts)；[工具指南：本地合规](../../../../guides/tools.md#本地合规)。
- [P2-12/11](../../12/subtasks/11-outbound-compliance-review.md#完成证据)、[P2-12/12](../../12/subtasks/12-candidate-check.md#完成证据)；被忽略的 `local/research/p2-12/outbound/`。

## 写入范围

- `dist/**`：聚合检查先运行的生产构建（被忽略）。
- `test-results/compliance/**`：可选的持久报告（被忽略）。
- `local/research/p2-13/**`：只在构建指纹不同、须重跑出站扫描时写入（被忽略）。

## 验收标准

- [x] AC-04（聚合部分）：输出为 `osr-local-compliance`/1，各范围完成、零发现、`passed:true`、退出码 0；依赖文件相对 `f925d21` 没有变化，或变化已重新审阅。
- [x] AC-10（产物部分）与 AC-06（产物类别）：当前构建指纹与出站扫描绑定的构建比较结果已记录；相同则出站清单与人工审阅适用，不同则已重跑并完成变化部分的审阅。
- [x] AC-12：失败时写明受影响的退出条件、原责任任务与恢复条件；没有时写明“无”。没有修改被跟踪的文件。

## 验证方法

- `pnpm --silent check:compliance`；`git --no-pager diff f925d21 -- package.json pnpm-lock.yaml .nvmrc`；构建清单比较。
- 不涉及浏览器验证；不读原版数据（扫描只读本项目的 `dist/` 与 manifest 中的哈希）。

## 完成证据

- **提交与环境（2026-10-08）：** 在 `6ea5c64`（goal 分支的认领提交，也是本 worker 分支的基点）上运行。运行前 `git status --porcelain --untracked-files=all --no-renames` 为空，新工作树中没有 `dist/`。`f925d21..6ea5c64` 共 16 个提交，在 `docs/`、`.agents/` 与 `AGENTS.md` 之外没有差异。环境为 Node 22.22.0、pnpm 12.8.1、macOS（arm64）。新工作树先运行 `pnpm install --frozen-lockfile`（退出码 0，锁文件未变）。被忽略的 `local` 是指向主检出的符号链接，本项只读取其中 P2-12 的记录。
- **聚合合规（AC-04 聚合部分）：** `pnpm --silent check:compliance`（先构建再检查）首次运行即通过，退出码 0，stderr 为空。stdout 存在被忽略的 `test-results/compliance/p2-13-04-compliance.json`（158,009 字节）。

  | 字段 | 结果 |
  |---|---|
  | `format`、`version`、`kind` | `osr-local-compliance`、1、`compliance` |
  | `passed`、`findings` | `true`、0 条 |
  | original 范围（`counts`） | worktree 879、index 879、untracked 0、build 9，均 `completed:true` |
  | licenses 范围（`counts`） | dependencies 155、distribution 8、artifacts 9，均 `completed:true` |
  | `coverage` | darwin/arm64，另列 24 个未安装的 optional 包 |

  worktree 与 index 从 [P2-12/11](../../12/subtasks/11-outbound-compliance-review.md#完成证据)（`2f9a8da`）的 850 增至 879：净增 29 个被跟踪文件，没有删除。其中 24 个是文档；5 个是 `src/` 文件，即 3 个生产模块与 2 个测试。3 个生产模块已包含在 `ec5af1f5…f690` 构建中，并由下文 P2-12/29 的重扫覆盖（Worker chunk 新增的来源）。按 AC-04，计数不作为目标。
- **依赖文件：** `git diff --quiet f925d21 HEAD -- package.json pnpm-lock.yaml .nvmrc` 的退出码为 0，即没有差异，无需重新审阅。
  - `pnpm-lock.yaml` 的 SHA-256 为 `114caf38…3aff36`，与 P2-12/11 的记录相同。
  - 本次报告的 155 个依赖实例与 P2-12/11 报告（被忽略的 `local/research/p2-12/outbound/compliance.json`）逐项深度相等（`isDeepStrictEqual`），24 个未安装的 optional 包也相同。
- **生成的声明：** 都由本次构建生成，未手改。
  - `LICENSE.txt`（`cca635a2…6db0`）与 `THIRD-PARTY-NOTICES.txt`（`ef1281bd…5be4`）与 P2-12/11 记录的相同。
  - `compliance-inventory.json` 的 `checksum` 为 `0f20977b…1102`，与 [02](./02-engineering-checks.md#完成证据) 记录的相同。
- **构建指纹（AC-10、AC-06 产物类别）：** 按 [P2-12/12](../../12/subtasks/12-candidate-check.md#完成证据) 候选核对脚本的 `distManifest` 算法计算：`dist/` 下全部普通文件按路径排序，每行为 `<SHA-256>  dist/<路径>`，以换行结尾，再对整个清单取 SHA-256。
  - **结果：** `sha256:ec5af1f5d9d46fe3d9654d8715151682e2ca7d7f6c6c0b06e189b35bdac1f690`，9 个文件，7,096,735 字节。清单存在被忽略的 `test-results/compliance/p2-13-04-build-manifest.txt`。
  - **比较：** 本次清单与以下两份逐字节相同：
    - `local/research/p2-12/outbound/build-manifest.txt`，即 P2-12 最后一次出站扫描（[29](../../12/subtasks/29-mesh-uv-recheck.md#完成证据) 在 `02fd66f` 上重跑）绑定的构建；该扫描的 `scan.json` 记录同一指纹，`index-aXSeUMy4.js` 与 `import-worker-CJmhnkml.js` 的哈希也与本次相同；
    - `local/research/p2-12/candidate/final-26b-build-manifest.txt`。
- **出站清单适用性：** 构建指纹相同，因此出站 API 清单与来源/许可人工审阅直接适用于当前构建。
  - **适用的证据链：** P2-12/11 在 `2f9a8da`（`4d6c6bdc…`）上完成清单与人工审阅。P2-12/29 在 `ec5af1f5…` 上重跑扫描与 `--control`（49 种构造，`PASS`）：两个 chunk 的自由全局引用集合不变，新增来源都是应用模块，出站结论不变，并经 P2-12/26 接受。
  - **本轮处理：** 当前构建与该扫描绑定的构建逐文件相同，没有变化的 chunk 需要人工审阅。因此没有重跑扫描，也没有创建 `local/research/p2-13/`；P2-12 的输出保持不变。供复现：`outbound-scan.ts` 的 SHA-256 为 `25e6264c…8fc5`。
- **失败与重跑（AC-12）：** 无。检查首次运行即通过，没有重跑、跳过或修复子任务，因此不涉及受影响的退出条件、原责任任务或恢复条件。
- **被跟踪文件：** 运行后 `git status --porcelain --untracked-files=all` 为空。被忽略的输出只有写入范围内的 `dist/` 与 `test-results/compliance/`，另有依赖恢复的 `node_modules/` 与 `local` 链接。本提交只改本文档的验收勾选与完成证据。
- **Rubber-duck：** 审查本文档的完整差异、被忽略的报告与清单，以及 P2-12/11、12、26、29 和本 goal 01 的证据。没有阻塞问题；所引链接与锚点都存在。1 个非阻塞问题已修正：原先把被跟踪文件数的增加只归于文档，实际还有 5 个 `src/` 文件。
- **文档影响：** [工具指南的本地合规](../../../../guides/tools.md#本地合规)与[工程约定的构建许可声明](../../../../engineering/README.md#构建许可声明)与本次输出一致。没有新的原版事实、U 项或 ADR，无需更新文档。本项没有实现代码，不需要 simplify。对 STATUS 与阶段索引没有改动建议。
