---
type: plan
status: active
phase: "P3"
task: "16"
subtask: "10"
updated: "2026-10-31"
---

# 10 — 合规与产物适用性

**契约来源：** [spec](../spec.md) 的 S-03、S-04（产物与许可类别）、AC-05、[技术决定](../spec.md#技术决定) 2 与 3。
**依赖：** 04、18、19。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在含修复的候选上运行 `pnpm --silent check:compliance`，核对报告：`osr-local-compliance`/1，各必需范围 completed，零 finding，`passed: true`，退出码 0。
- **产物与许可审阅的适用性：** 按构建指纹与依赖文件（`pnpm-lock.yaml`、`package.json`、`.nvmrc`）相对 P3-15 最终基线的差异，判断出站 API 清单、生产预览 CSP 与来源/许可人工审阅对当前构建是否仍有效；有变化时只重核变化部分。
- 记录本次构建的 `dist` 指纹，以及它与 08、09 各自构建的关系。

## 不包含

- 最终的 `check:original`（17，在文档定稿后运行）。

## 关键文件与契约

- [合规 CLI](../../../../../tools/compliance/cli.ts)；[本地合规用法](../../../../guides/tools.md)。

## 写入范围

- `dist/**`：`check:compliance` 的构建（被忽略）。
- `test-results/compliance/**`：留存的报告（被忽略）。

## 验收标准

- [x] AC-05：合规报告满足上述条件。
- [x] AC-05：产物、CSP 与许可审阅的适用性已判定，有变化时已重核；不把完整文件哈希扫描说成原版解码内容的全面检测。

## 验证方法

- CLI JSON 与退出码；构建清单与依赖文件的差异。

## 完成证据

- **候选与环境（2026-10-31）：** 提交 `5465f27d`（goal 分支 `main` 上已认领本行，代码含 04、18、19、20），`src` 树 `21e68310…`，与 [08](./08-engineering-checks.md#完成证据) 的候选相同。运行前后 `git status --porcelain` 都为空。macOS 26.6（arm64），Node v22.22.0，pnpm 12.8.1；新 worktree 执行 `pnpm install --frozen-lockfile`（退出码 0，锁文件未变），开始时没有 `dist/` 与 `test-results/`。`local` 是指向主检出的链接，本项只读其中 P2-12 与 09 的记录，没有写入。
- **聚合合规（AC-05 第一条）：** `pnpm --silent check:compliance`（先构建再检查）只运行一次，退出码 0，stderr 为空。报告存在被忽略的 `test-results/compliance/p3-16-10-compliance.json`（236,230 字节）。

  | 字段 | 结果 |
  |---|---|
  | `format`、`version`、`kind` | `osr-local-compliance`、1、`compliance` |
  | `passed`、`findings` | `true`、0 条 |
  | original 范围 | worktree 2112、index 2112、untracked 0、build 9，均 `completed:true` |
  | licenses 范围 | dependencies 155、distribution 8、artifacts 9，均 `completed:true` |
  | `coverage` | darwin/arm64，另列 24 个未安装的 optional 包 |

  七个计数正是 [report.ts](../../../../../tools/compliance/report.ts) 的 `requiredScopes('compliance')`，全部完成。计数不作为目标。
- **扫描边界：** original 范围按 [manifest](../../../../original/manifest.md) 中已记录的完整文件 SHA-256 比对被跟踪文件、暂存 blob、未忽略的未跟踪文件与 `dist/` 的全部普通文件，只能发现这些原版文件的整文件副本。它不识别片段、修改、压缩、解码或转换后的内容，也不是对原版解码内容的全面检测（[本地合规](../../../../guides/tools.md#本地合规)）。定稿后的 `check:original` 由 17 运行。
- **构建指纹：** 按 [P2-13/04](../../../p2/13/subtasks/04-compliance-artifacts.md#完成证据) 的 `distManifest` 算法，即 `dist/` 下全部普通文件按路径排序，每行 `<SHA-256>  dist/<路径>`，以换行结尾，再对整个清单取 SHA-256。
  - **结果：** `sha256:74260a03139057ce9b48f7d30153fc5798f6dfbd9b958a8ddca4829c9315843d`，9 个文件，12,223,935 字节，没有非普通文件。清单存在被忽略的 `test-results/compliance/p3-16-10-build-manifest.txt`。本项的全部扫描结束后重算，指纹不变。
  - **与 08、09 的关系：** 这是本次 `check:compliance` 构建自己算出的值，与 08 的 `pnpm check` 构建和 09 两次 `test:e2e` 构建的指纹相同；本次清单与 09 留存的两份清单（`local/research/p3-16/e2e/run1`、`run2` 的 `dist-manifest.txt`）逐字节相同。三项检查因此绑定同一产物：同一源树，构建可重现。
- **依赖文件与构建输入：** 相对 P3-15 最终基线 `5be7346b`（代码 `2b39a2ed`），`git diff --quiet` 对 `package.json`、`pnpm-lock.yaml`、`.nvmrc` 的退出码都是 0。锁文件 SHA-256 为 `114caf38…3aff36`，与 P2-12/11、P2-13/04 记录的相同。`tools/`、`vite.config.ts`、`index.html`、`tsconfig*.json`、`playwright.config.ts` 也没有差异。`2b39a2ed..HEAD` 在 `docs/` 等之外只改了 `src/` 与 `e2e/`（24 个文件）。其中进入产物的生产模块只有 6 个：`src/core/projections/map.ts`、`src/core/systems/warp.ts`（04）、`src/original-data/formats/ai.ts`、`le-executable.ts`（18）、`src/render/flight/composition/logical-screen.ts`、`sprites/explosion-sprites.ts`（19）。`rules-version.ts` 的常量被内联，不单列为输入。其余是测试、test-support 与 E2E 文件。
- **许可与来源审阅（重核变化部分，不只比较锁文件）：** 在临时 worktree 中检出 `2b39a2ed`，用同一锁文件安装，再运行 `pnpm --silent check:compliance`（退出码 0，`passed:true`，0 条发现）。用这次重建的基线构建与当前构建比较：
  - 155 个依赖实例与 24 个未安装的 optional 包深度相等（`isDeepStrictEqual`）；
  - 8 个分发项只有 chunk 文件名与哈希不同；
  - `compliance-inventory.json` 的 `dependencies`、`publicFiles`、`coverage` 深度相等，每个产物的来源归属在 chunk 改名后相同；`inputs` 的 656 项中只有上面 6 个源文件的哈希变化，没有增删；
  - 两个 chunk 的 source map 来源列表排序后的 SHA-256 相同（Worker 116 个来源，`64c2369e…`；页面 400 个，`1281ed5f…`），即来源集合相同；
  - `LICENSE.txt`、`THIRD-PARTY-NOTICES.txt` 与 CSS 逐字节相同，`index.html` 只有入口 chunk 名不同。

  所以分发包、许可归属与声明都没有变化，[P3-13/34](../../13/subtasks/34-final-alignment.md#完成证据) 的 `check:licenses` 与此前的来源/许可人工审阅仍然适用；6 个变化的源文件都是项目自有代码，没有新依赖或新复制资产。
- **出站 API 清单（重核变化部分）：** 最后一次完整人工出站审阅是 [P2-12/11](../../../p2/12/subtasks/11-outbound-compliance-review.md#完成证据)，[P2-12/29](../../../p2/12/subtasks/29-mesh-uv-recheck.md#完成证据) 在 `ec5af1f5…` 上重扫，经 P2-13/04 沿用。P3-15 的基线没有构建指纹，也没有静态出站扫描（[07](./07-affected-evidence.md#完成证据)）。本项把 P2-12 的定位脚本 `outbound-scan.ts`（SHA-256 `25e6264c…8fc5`，未改）复制到被忽略的 `test-results/compliance/outbound/` 下运行，P2-12 的输出保持不变：
  - **定位器对照：** `--control` 为 `PASS`，49 种构造全部检出。
  - **当前构建：** `--no-build` 扫描本次 `check:compliance` 的 `dist`，绑定 `5465f27d` 与 `74260a03…`，工作树干净。Worker chunk 有 116 个来源、26 个自由引用；页面 chunk 有 400 个来源、89 个自由引用，19 处未映射；另有 4 条文本发现。
  - **P3-15 基线构建：** 在上述临时 worktree 中构建并扫描 `2b39a2ed`，指纹为 `sha256:f699b4e9…6322`（9 个文件）。这是今天以同一工具链重建的值，不是 P3-15 当时的产物。
  - **差异：** 两个构建的自由引用集合、用法与按来源计数逐项相同（`globals.md` 只有 chunk 名不同），文本发现相同。定位命中按（chunk、类别、键、来源模块、原行）去掉压缩名后作多重集比较，结果是 7,176 对 7,174 处。只有 18 与 19 改写的 3 行仍命中相同的全局（`Object.freeze`、`new Float32Array` ×2），另有 2 处属性名 `'source'` 命中因改名为 `blocks` 而消失。没有新增出站相关的 API、URL、元素或动态加载，比较脚本与结果在 `outbound/hit-diff.*`。
  - **与 P2-12 的关系（补充）：** 相对 P2-12/29 的扫描，Worker 的自由引用不变。页面 chunk 新增 3 个自由引用：`BigInt`（规则与驾驶舱数值）、`crypto`（`browser-seed.ts` 的种子来源）、`MouseEvent`（指针锁定的 `instanceof`）；依赖代码的命中除 three 少了几处外不变。项目代码新增的出站相关或可疑命中（新全局、`navigator`、`open`、URL 协议字符串、标签名等类别）逐条初筛，都是本地 API：IndexedDB `open`、`navigator` 的 `userActivation`、`keyboard`、`userAgentData` 与 `platform`、错误标签中的 `file:/` 字符串，以及名称与标签名相同的字符串。`fetch` 仍只在未映射的 Vite 辅助代码中，`Worker`/`URL` 仍只有同一处同源模块 Worker，没有 `XMLHttpRequest`、`WebSocket`、`EventSource` 或 `sendBeacon`。这是定位层面的初筛，不是 P2-12/11 那样逐条的人工数据流审阅。
- **CSP：** [preview-csp.ts](../../../../../tools/preview-csp.ts) 与 `vite.config.ts` 相对基线没有变化。产物形状也相同：同源模块脚本，一个同源模块 Worker，没有新的资源 URL、blob 或内联代码，CSS 逐字节相同。同一指纹的构建在 [09](./09-browser-regression.md#完成证据) 的整次运行中通过了 production 项目的 60 个用例，其中 `production-preview.spec.ts` 的 6 例在严格 CSP 与网络审计下都通过。因此 CSP 对当前构建有效。
- **结论：** 当前构建的出站 API、CSP 与来源/许可审阅都有效，变化部分已经重核。出站结论的范围是：相对 P3-15 基线，没有新增出站相关的定位命中或 API 用法（命中的增减只有上面 5 处）；相对 P2-12 最后一次人工清单，增量只做了上述定位层面的初筛；运行时由 09 的网络审计覆盖。这只对这一候选成立，不是通用的自动安全证明。
- **失败与重跑：** 无。`check:compliance` 首次即通过，没有重跑或修复。
- **清理：** 临时 worktree 已用 `git worktree remove --force` 删除，`/tmp` 中的临时文件已删。没有启动服务器或浏览器。被忽略的输出只有写入范围内的 `dist/` 与 `test-results/compliance/`（含 `outbound/`），以及按 worker 预检恢复依赖产生的 `node_modules/`（被忽略的环境准备，不是交付物）。本提交只改本文档。
- **Rubber-duck：** 审查本文档差异与全部原始输出（两份合规报告、两次扫描、`hit-diff`、09 的清单与输出）。确认报告字段、零发现、指纹、与 08/09 的清单一致、CSP 理由和哈希扫描的边界措辞都与原始证据相符，`hit-diff.mjs` 去掉压缩名不会掩盖真实差异。采纳 2 个非阻塞问题：来源集合相同改为写明排序后列表的哈希（基线 worktree 已删，此值取自删除前的计算）；出站结论与 P2-12 初筛的范围改为“出站相关命中”，不再说定位层面完全不变。不采纳 1 个“阻塞”问题：`pnpm install --frozen-lockfile` 是 worker 预检与协调者明确要求的依赖恢复，`node_modules/` 被忽略，不属于本项写入的交付物。
- **文档影响：** [本地合规](../../../../guides/tools.md#本地合规)、[工程约定的构建许可声明](../../../../engineering/README.md#构建许可声明)与本次输出一致，无需更新。没有新的原版事实、U 项或 ADR。本项没有实现代码，不需要 simplify。对 STATUS 与阶段索引没有改动建议。
