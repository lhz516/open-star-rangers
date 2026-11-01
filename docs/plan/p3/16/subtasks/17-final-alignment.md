---
type: plan
status: active
phase: "P3"
task: "16"
subtask: "17"
updated: "2026-10-31"
---

# 17 — 最终对齐

**契约来源：** [spec](../spec.md) 的全部 S-01 至 S-11、AC-01 至 AC-20，重点是 AC-19、AC-20 与[技术决定](../spec.md#技术决定) 13。
**依赖：** 01、02、03、04、05、06、07、08、09、10、11、12、13、14、15、16、18、19、20、21、22、23、24、25、26、27。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 只做验证，不交付新功能代码：
  - 逐项核对 goal 验收覆盖表的每个 S/AC 都有完成证据，或有明确的 blocked 记录与恢复条件；
  - 核对各检查绑定的候选与最终候选一致；04 之后有代码改动时，列出需重跑的项。
- 评审与证据定稿后，在最终候选构建的 `dist` 上运行 `pnpm --silent check:original`。
- 核对协调者对 STATUS 与阶段索引的修改符合确认前的限制（AC-19）。
- **审阅 `git status`、diff 与已跟踪文件（AC-20）：**
  - 只有本任务交付、S-11 文档、P3-03 映射、P3-02/09/10 的修订、Core 修复与回归，以及登记表的负责阶段；
  - 没有新依赖或原版内容；
  - 自有进程、端口与临时 profile 已清理；
  - 没有 push 或部署。
- 缺口作为新的修复子任务插入本项之前，不在本项实现。

## 不包含

- 新功能；负责人确认评审结论；push、部署或阶段切换。

## 关键文件与契约

- [goal](../goal.md)、01–16 的完成证据、`docs/reviews/P3-exit.md`。

## 写入范围

- `dist/**`：只在 `check:original` 需要当前候选的构建时重建（被忽略）。
- `docs/reviews/P3-exit.md`：只把评审中等待本项 `check:original` 的工程边界一行、阶段责任覆盖的计数与 P3-16 交付一句改为实际结果，并更正本项审查发现的 R 项汇总一句（2026-10-31 协调者扩大）。
- `local/research/p3-16/final-alignment/**`：构建清单与扫描报告（被忽略）。

## 验收标准

- [x] 每个 S/AC 都有对应证据或明确的 blocked 记录与恢复条件；没有以代理检查冒充实机、原版或人工证据。
- [x] `pnpm --silent check:original` 在最终候选上通过；各检查绑定的候选一致或已重跑。
- [x] AC-19：STATUS 与阶段索引符合确认前的限制，链接与元数据通过。
- [x] AC-20：git 审阅、原版隔离与清理通过；没有 push 或部署。
- [x] `node tools/task-state.ts p3/16` 与 `node tools/task-state.ts p3/03` 的输出与 tracker 一致。

## 验证方法

- 运行上列命令；`git status --short`、`git ls-files` 审阅；链接检查。

## 完成证据

- **2026-10-31（协调者，main，集成提交 `7fb0bd15` 之后的工作树）：** 只做验证；本项的文档修改只限扩大后的写入范围。
- **覆盖与证据：** goal 验收覆盖表的 S-01 至 S-11、AC-01 至 AC-20 所指的实现与验证子任务（01–16、18–20）全部 `completed`，其验收复选框全部勾选（`grep '^- \[ \]'` 在 01–16、18–20 中为 0）。按 spec 仍为上游缺口的项（R-22 八项 blocked、U-021 的最终前提、R-23 的 9 个未验证单元、外观证据缺口与授权不足的审批）都在评审中有原责任、影响与恢复条件，没有以代理检查冒充实机、原版或人工证据：试听与物理按键证据经 07 判定不受影响而复用，真实内容由 06 在本机 Chrome 中实际复跑。
- **候选绑定：** 最终 `src` 树 `21e68310cf43eae58b863d4b3b12b318c3d489e5`；`git diff a02f4ad0 HEAD -- . ':!docs'` 为空，即 08（`a02f4ad0`）、09（`e1910f04`）、10（`5465f27d`）与 06、07（`f2c61924`，只差 20 的测试支持文件）都绑定同一产品代码。05 在 `9a3b21f2` 上运行，之后只有 19（渲染）与 20（测试）改代码，不在转换路径上；14 在 `9ab62872` 上运行，其复用条件由 09 在最终候选上的完整回归满足（19 不改驾驶舱或地图绘制）。没有需要重跑的项。
- **`check:original`：** 评审与证据定稿后（含本项对评审的修改）`pnpm build` 退出 0，`pnpm --silent check:original` 退出 0：`osr-local-compliance`/1、`kind: original`、`passed: true`、0 finding，build 9、index 与 worktree 各 2,113 项、untracked 0。本次 `dist` 清单（P2-13/04 算法）SHA-256 `74260a03139057ce9b48f7d30153fc5798f6dfbd9b958a8ddca4829c9315843d`，9 个文件，与 08、09、10 逐行相同。报告与清单在被忽略的 `local/research/p3-16/final-alignment/`。
- **评审的更新（扩大的写入范围）：** 工程边界一行由“待验证”改为“通过”并引用本项结果，阶段责任覆盖计数改为 5 通过、11 不通过、1 待定（退出判定及交接，待负责人确认），P3-16 交付一句改为实际结果；按审查意见更正 R 项汇总一句：只有 R-19 全部一致，其余逐单元判定，有效的经批准差异与经批准的取证方法本身不阻止通过，阻止的是未验证、blocked、授权不足或受 U-021 约束的单元。结论“不通过”与 draft 状态不变。
- **AC-19：** STATUS 只改了卷首说明、P3 行的状态列（仍为“进行中”）、P3-15 子项后的 P3-16 摘要与“下一步”（指向待确认的评审）、已修复的联合故障说明与 U-021 的一句补充；评审记录列仍为 `—`，没有任务执行状态。阶段索引只在 P3-16 行加评审链接、在第 7 节指向评审。两者 `updated:` 为 2026-10-31。
- **链接与元数据：** 脚本检查 `d2a793e4` 以来改动的 35 个 Markdown 文件、4,810 个相对链接与锚点（含显式 `<a id>`）：0 处失效；另有 8 处命中都在 16 的完成证据中以行内代码引用的建议文本里，不是链接。改动的文档都有 front matter 与 `updated:`。
- **AC-20：** `git diff --name-status d2a793e4 HEAD` 只含：本任务的计划文档与评审；S-11 的 STATUS、阶段索引、engineering README、source-structure、core/render/original-data 模块说明；P3-03 goal 的四行映射与一条记录；P3-02/09/10 spec 的修订；`executable.md` 的查证补记；`unknowns.md` 只改负责阶段一列与日期（15 的逐列比对）；`src/core`、`src/original-data`、`src/render` 的修复与测试，`e2e` 的新回归与 map-picture 测量修复。没有依赖或锁文件变化（10），没有原版内容（`check:original` 与 `check:compliance` 通过；只记身份、计数与哈希，私有输出都在被忽略的 `local/research/p3-16/`）。没有 `exec-p3-16-*` 分支或 worktree 残留，`git worktree prune` 已运行；本任务启动的服务器、浏览器、临时 profile 与端口都已关闭（`lsof` 在 5100–5199 无监听）；没有 push、部署或阶段切换。09 与 10 的首次失败与私有输出已从 worker 目录复制到 `local/research/p3-16/e2e/` 与 `compliance/`。
- **路由：** `node tools/task-state.ts p3/03` 为 `done (terminal)`；本项标记完成后 `node tools/task-state.ts p3/16` 为 `done`。
- **审查：** rubber-duck 审查本项与评审：阻断项为“本项尚无证据却在评审中称已完成”，由本记录与 tracker 解决，并在全部文档定稿后重跑 `check:original`；非阻断项为 R 项汇总一句与判定规则不符，已更正。确认 STATUS 与阶段索引符合 AC-19，改动范围符合 AC-20，登记表只改负责阶段一列。
- **文档影响：** 除上述评审更新外无其他文档需要修改；STATUS 已由协调者在 16 集成时更新，阶段状态在负责人确认前不变。
- **2026-10-31 重新打开：** 依 spec 审批修订 1 新增 21–27，本项回到 pending；上面的记录是第一次最终对齐的证据，第二次最终对齐在 21–27 完成后重跑并另写记录。

- **2026-10-31 第二次最终对齐（协调者，main，`85aa9dea` 之后的工作树；最终 `src` 树 `7b3eea260733600cee182d966259abeca75d287d`）：** 只做验证；对评审的修改限于扩大后的写入范围（工程边界一行、阶段责任覆盖计数、P3-16 交付与候选身份几处及相应问题表行）。
  - **覆盖：** 21–27 全部 `completed`，验收复选框全部勾选；S-06、S-07、AC-09–AC-12、AC-15、AC-17 的新增证据在 21–27 与 goal 执行记录中。以证据解决与以经批准的判据修订解决分开记录，修订都写入责任 spec 的审批节并引用 spec 审批修订 1 的用户原话（A 类）：P3-05 对照修订 1、P3-07 D-02 修订 1、P3-09 D-02 修订 1、P3-11 D-02 修订 1 与 2、P3-12 的 2026-10-31 修订。第三组（U-021 冻结、C/B? 事后审阅、R-23 物理键与 Q-06、P3-13 M 会话、P3-14 试听、物理 Fn+F11）未动。
  - **新候选上的检查链：** 24 改了生产模块，所以全部重跑。`pnpm check` 退出 0（447 个文件、11,937 个测试与构建）；Python `tools/ghidra` 3 项、`tools/baseline` 232 项通过。`pnpm exec playwright test --list` 316 项（development 255、production 60、development-headed 1），一次 `caffeinate -d -i pnpm test:e2e` 退出 0：307 通过、0 失败、9 跳过（都是 `cockpit-lifecycle` 按项目设计的构建分流，与 09 相同），开始与结束时屏幕未锁定，P3-15 联合用例、`map-picture` 与两项缩放回归都在其中且通过；没有重跑。`pnpm --silent check:compliance` 退出 0：`osr-local-compliance`/1、七个范围完成、0 finding；依赖与锁文件相对 P3-15 基线无变化。三次构建的 `dist` 指纹都是 `sha256:9659fc771f34da9f734557a2e5b99b61af0aa27064258c59996e8d12e60403b4`（9 个文件）。
  - **复用：** 05（真实数据候选）与 06（真实内容复跑）之后只有 24 的屏幕门取格与测试文件改动，不触及导入、Core、流程或 replay，复用。
  - **`check:original`：** 评审与证据定稿后 `pnpm build` 与 `pnpm --silent check:original` 都退出 0：`passed: true`、0 finding，index 与 worktree 各 2,123 项，`dist` 指纹同上。私有输出在 `local/research/p3-16/final-alignment-2/`。
  - **评审：** 工程边界一行改为通过，阶段责任覆盖为 5 通过、11 不通过、1 待定；结论“不通过”与 draft 状态不变，五项退出条件判定不变，剩余阻塞项都属第三组。
  - **AC-19：** STATUS 只改 P3-16 摘要与“下一步”（剩余阻塞项都属负责人本人处理的项），阶段状态仍为进行中，评审记录列仍为 `—`；阶段索引不需要改动。
  - **链接与元数据：** `d2a793e4` 以来改动的 53 个 Markdown 文件、6,148 个相对链接与锚点（不含行内代码），0 处失效；都有 front matter 与 `updated:`。
  - **AC-20：** `87794bf7` 以来的改动只有：21–27 的计划文档、spec 修订 1、STATUS、评审；责任 spec（P3-05/07/09/11/12）审批节的判据修订；`docs/original/` 中按新证据记的事实（B-003、B-005、B-006、B-010、executable、textures、key-map）与 U-031、U-025 的按证据更新；24 的屏幕门修复与回归（`src/render/flight/shimmer/`、两份 `e2e/`）；engineering README 与 render 说明。没有依赖或原版内容；没有 `exec-p3-16-*` 分支或 worktree 残留；DOSBox-X 与本任务的服务器、浏览器都已关闭（5100–5199 无监听）；没有 push、部署或阶段切换。
  - **路由：** `node tools/task-state.ts p3/16` 为 `done (terminal)`；`p3/03` 为 `done (terminal)`。
