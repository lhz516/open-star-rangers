---
type: plan
status: active
phase: P3
task: "07"
subtask: "40"
updated: 2026-10-13
---

# 40 — 导弹 1 的完整原版窗口

**契约来源：** [spec](../spec.md) 的 S-09、S-11、AC-15、AC-16，已批准的 [D-02](../spec.md#d-02-连续行为判据)；[27](./27-comparison-conclusions.md) 的最终对照：导弹飞行与制导节奏类因 `a39-mc-01` 的导弹 1 仍在飞行、缺少终点而无结论。
**依赖：** 39。
**执行方式：** 自动。仅用配方声明的模拟器内输入；不得用宿主输入或修改原版内存。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在既有合格配置下补一个原版导弹 1 的完整 D-02 窗口：从发射到起爆或失效后离开；读齐发射、阶段 0 首个 state 7 回调、解保、每次引信检查、每个存活帧的目标有效性（+0x8C）、终点与下一帧离开。按 D-02 核对各自适用的截止/帧链节、引信重排（含 d ≥ 2）及帧步长 s ≠ 2。
- 先核对 `a39-mc-01` 的已有读数是否能补算；不能补算时，运行前写定单次配方、目标有效性门禁、绑定方式、暂停数、最大等待与运行终止条件。目标无效或导弹 1 未发射时不得记为窗口；不通过添加原版状态写入制造事件。
- 运行配置须与 26/38/39 一致（cycles 40000、baseline `manifest-b9bfecb3bf772fbf`、相同任务/难度/僚机）；只有 `complete` 且保护、清理通过的报告可计入。
- 一次预先设计的补采。若门禁不通过、目标事件没有出现或窗口远未完成，安全中止并记录准确阻塞；不盲目重跑、不放宽 D-02。
- 将合格运行、配方哈希、配置与保护/清理结果记入 B-009 和被忽略的 `local/research/p3-07/runtime/run-notes.md`；扩展 39/27 读取器以便 27 可判定（读数与输出仅留在 `local/`）。新确认事实按置信度写入 executable.md 并更新 U 项（若适用）。

## 不包含

- 修改 spec、D-02、采样数量或结论标准；新版场景和 AI 实现（27 / P3-08）。
- 生成原版内容、修改原版内存、宿主按键、绕过会话锁或并发运行 DOSBox-X。

## 关键文件与契约

- 27 的最终对照结论；39 的配方、分析与原版补采记录（`local/research/p3-07/runtime/`，被忽略）。
- [运行时测量指南](../../../../guides/runtime-measurement.md)与 B-009。

## 写入范围

- `docs/original/behavior/B-009-combat-rules.md`
- `docs/original/formats/executable.md`
- `docs/original/unknowns.md`
- `docs/guides/runtime-measurement.md`、`docs/guides/tools.md`（必要时）
- `local/research/p3-07/runtime/**`、`local/research/p3-07/comparison/**`（被忽略）
- 本子任务的完成证据

## 验收标准

- [x] 取得至少一个完整、合格的导弹 1 窗口，满足 D-02 对应的导弹飞行与制导节奏条件；或按证据记录本项阻塞，不得以发射或中途飞行窗口代替终点窗口。
- [x] 配方、运行配置、输入边界、保护与清理记录完整；不合格运行不计入。
- [x] 27 的读取器能消费该窗口，文档链接与元数据通过；若工具变化，相关合成测试通过。

## 验证方法

- 对照独立分析脚本、运行报告、配方指纹及 27 的 Φ 窗口核验终点链；运行 baseline 与 comparison 自检；检查链接、元数据、原版隔离和 git diff。

## 完成证据

- **最终结果：完成。** `a40-m1-06` 取得合格的完整导弹 1 窗口（详见本节末尾）。`a40-m1-01` 至 `a40-m1-05` 均不计入，以下按时间顺序保留其记录。
- **`a40-m1-01` 结果：阻塞；未取得窗口。** 单次预定运行 `a40-m1-01` 报告为 `cancelled`，不是 `complete`，不得计入。报告原因：`samples-missing`、`stimuli-missing`、`run-cancelled`；64/19,962 planned field samples 合格，5/6 stimuli applied。唯一失败发生在 `poll-target-gate`：自定义运行器在该 pause 等待确认时读取门禁 `reads.json`，得到 `FileNotFoundError`，遂在确认 pause 前写入 abort。报告没有门禁样本、没有 Space 刺激、没有玩家导弹发射；这不是目标有效或无效的运行时判定。`poll-select-target` 中的字段是在 `t` 刺激施加前读取，不能用来替代目标门禁。
- **运行身份与限制：** 配方 `local/research/p3-07/runtime/recipes/a40-m1.json`，SHA-256 `912064b22de752c7457cfb6268e5e817ff0a172a3ac3c11c3e842a18348f120e`，指纹 `sha256:08e59f448c5e0073667622eda6f0c7c01ab71614e58ec28a361296456f35dd13`；baseline `manifest-b9bfecb3bf772fbf`，mission 3019/difficulty 19/wingman 1/cycles 40000。报告记载原版保护完整性通过（201 个文件无变化）与进程清理通过；事后确认无 DOSBox-X 残留且会话锁空闲。只有预定的 5 个进入/选武器/选目标刺激被施加，没有 Space，也没有任何后续输入。
- **覆盖缺口：** phase 0 首个 state 7 回调、解保、每次 fuse 检查、目标 +0x8C 每存活帧、terminal 与 next-frame leave、d ≥ 2 后再次重排及 s ≠ 2 均未取得。既有 `a39-mc-01` 仍以 `end-not-read` 排除，不延伸、不拼接、不推断。依本项单次采集约束，不重跑；无完整窗口可供 `orig.py` reader 或 comparison 输出消费。B-009 已记录相同阻塞；未修改 27、29、goal、spec、executable、unknowns 或生产代码。
- **获准修正尝试 `a40-m1-02`（仍阻塞）：** 首次 runner race 的根因是工具在 operator confirmation 之前尚未写出该 pause 的 `reads.json`。修正后 runner 先确认 `poll-target-gate`，再在后续 `poll-fire` 确认前以 3 秒 bounded wait 读取已完成的 gate 记录；synthetic self-test 初始 7/7 通过。门禁记录中的目标节点/对象有效性、活动/未毁状态及 M1 选择均满足有效目标预期，但门禁错误地硬编码了无证据支持的目标 kind，因而拒绝该活动目标并在确认 `poll-fire` 前安全 abort；Space 未施加、无导弹发射。报告 `cancelled`，128/19,989 field samples 合格（98/6,397 required），刺激 6/7；完整性与清理通过。之后按 H5 的目标有效性定义移除了无依据的 kind 限制，门禁改为检查节点与对象有效、目标活动且未毁、并选中 M1；synthetic self-test 9/9 通过。依用户对唯一修正尝试的约束，不再重跑。
- **覆盖缺口：** phase 0 首个 state 7 回调、解保、每次 fuse 检查、目标 +0x8C 每存活帧、terminal 与 next-frame leave、d ≥ 2 后再次重排及 s ≠ 2 均未取得。既有 `a39-mc-01` 仍以 `end-not-read` 排除，不延伸、不拼接、不推断。无完整窗口可供 `orig.py` reader 或 comparison 输出消费。B-009 已记录两次尝试；未修改 27、29、goal、spec、executable、unknowns 或生产代码。
- **验证（a40-m1-01/02）：** 配方 parser/read-only preflight 通过（首次 532 pauses/87 fields；修正配方 533 pauses/87 fields）；这两次报告的完整性与清理均通过。gate synthetic self-test 9/9，comparison selftest 130/130，baseline unittest 184 项通过；编辑文档的相对链接与 `git diff --check` 通过。未运行 pnpm 全检（无生产/TypeScript 变更）；未扩展原版 reader，因为没有合格窗口可消费。a40-m1-03 的独立验证与结果见下文。
- **获准唯一最终尝试 `a40-m1-03`（阻塞；不计入样本）：** 2026-10-13 协调者批准精确门禁/配方/哈希及一次运行。运行前散列吻合；无 DOSBox-X，`SessionLock` 取得后释放；运行目录原先不存在。配方 SHA-256 `dc5288723109502baf39bbe51dc9e63f00e24b4516bda594327afdcc93b3ac2d`、指纹 `sha256:232270609b3b731a25bda85d648e6b0351e50cb226b43e00b41c0d442fa60eff`；baseline `manifest-b9bfecb3bf772fbf`，EXE SHA-256 `c1e0f4565988b6773ba1515e0b4f59f92ee22c118aea678d21817000cf924ffa`，mission 3019/group 0/slot 1、difficulty 19、wingman 1、cycles 40000。运行器 SHA-256 `30ca935c3df817f4fa49b617c7198965a9abe0e2192c5ac1a78b08b0b6cf4e8e`。
- **运行结果：** `local/research/p3-07/runtime/runs/a40-m1-03/report.json` 为 `cancelled`，结束时间 2026-10-13 18:07:08 UTC，用时 311.637 秒；原因 `samples-missing`、`stimuli-missing`、`integrity-failed`、`run-cancelled`、`original-changed`。204/20,078 field samples 合格（123/6,422 required），刺激 6/7：title/options/briefing、选择 M3、选择 M1、`t` 均施加；唯一未施加为 `fire-missile-1` Space。运行器已经确认了两个相邻 target-gate pauses 并抵达 `poll-fire` awaiting-confirmation，但在调用谓词时因 `NameError: check_gates is not defined` 退出。随后写入 `operator/abort.json`；`poll-fire` 未确认，且 Space 未施加。门禁读数未由 checker 评估，故不推断目标或武器门禁结果。
- **保护与清理：** cleanup 通过（DOSBox PID 13675、进程组已回收；无残留进程）；事后无 DOSBox-X，`SessionLock` 可取得并释放。完整性检查失败，201 个受保护文件的 changed/added 均为空；唯一 removed 项是运行器在 evidence root 创建并于结束时删除的隐藏 recipe snapshot `research/p3-07/runtime/runs/.a40-m1-03.dc5288723109502baf39bbe51dc9e63f00e24b4516bda594327afdcc93b3ac2d.recipe.json`。报告因该工作区文件变化标记 `integrity-failed`/`original-changed`，因此该运行不满足完整性资格。
- **窗口/限制：** 无玩家导弹发射；phase 0、arming、fuse checks、逐帧目标 +0x8C、terminal/next-frame leave、d ≥ 2 重排及 s ≠ 2 均未取得。三个已执行的 a40 尝试都不构成窗口，`a39-mc-01` 仍以 `end-not-read` 排除。a40-m1-03 的一次运行授权已用尽；无合格窗口，故不改 27、不加 reader/comparison 输出，40 维持阻塞。
- **协调者检查与批准 `a40-m1-04`：** 后续用户授权修复 harness 并准备一个新 run ID，随后授权协调者决定是否执行。显式导入 `check_gates`，异常/无效门禁仅写 abort、不确认；确认路径仅允许 run-local 相对 `operator/<pause>-<attempt>.json`；runner 在 snapshot 前调用 baseline `resolve_output`/`resolve_evidence` 并要求 evidence root 与规范化 output root 完全相同。snapshot 使用 `O_EXCL`、只读权限及配方 SHA 命名，在 runs root 下、measurement inventory 前创建。协调者复核并批准一次运行；运行前 recipe/preflight、manifest/EXE hash、无 DOSBox 与空闲 `SessionLock` 均验证通过。
- **a40-m1-04 预定配置/限制：** 不变配方 `a40-m1-corrected.json`（SHA-256 `dc5288723109502baf39bbe51dc9e63f00e24b4516bda594327afdcc93b3ac2d`；指纹 `sha256:232270609b3b731a25bda85d648e6b0351e50cb226b43e00b41c0d442fa60eff`），baseline `manifest-b9bfecb3bf772fbf`，EXE SHA-256 `c1e0f4565988b6773ba1515e0b4f59f92ee22c118aea678d21817000cf924ffa`，mission 3019/group 0/slot 1、difficulty 19、wingman 1、cycles 40000。配方 534 pauses、100 fields、20,078 samples、7 stimuli、`repeatReads=2`；目标门禁连续两次紧邻 `poll-fire`，只在二者通过后于 `poll-fire` 发送一次 Space；跟踪 520 帧；run 上限 3600 秒、每次 wait 上限 1500 秒。拟用命令：`M1_TARGET_GUARD=1 python3 -B -u local/research/p3-07/runtime/scripts/run_agent.py local/research/p3-07/runtime/recipes/a40-m1-corrected.json local/research/p3-07/runtime/runs a40-m1-04 local/research/p3-07/runtime/runs`。output 与 evidence 参数均指向规范化的 `local/research/p3-07/runtime/runs`，不扩大至父级 runtime。只有此次检查与之后明确批准完成后才能运行；门禁/目标失败或到期未见 terminal 均应安全中止，不重跑。
- **`a40-m1-04` 唯一运行结果（阻塞，不计入窗口）：** 命令以 `local/research/p3-07/runtime/runs` 同时作为 `--out` 与 `--evidence`。baseline 把 status signal 写成仓库相对路径 `local/research/.../operator/poll-select-m3-0.json`；runner 已将 output root 解析到共享 `local` symlink 的规范真实路径，却以工作树 cwd 对 signal 求绝对路径，导致 `valid_confirmation_path` 错误返回 false，日志为 `confirmation-status-malformed; not confirming`。运行停在首个 `poll-select-m3` confirmation，未确认 M3 选择、未读目标门禁、未施加 Space。协调者写入 `operator/abort.json` 安全取消，未绕过 guard。报告 `cancelled`，原因 `samples-empty`、`samples-missing`、`stimuli-missing`、`run-cancelled`；0/20,078 samples，3/7 stimuli（title-enter/options-enter/briefing-esc），无导弹发射或窗口，不能推断目标/武器/制导规则。
- **保护、清理与验证：** 报告 `integrity.passed=true`，201 个受保护文件与 28,289 个 evidence 文件无变化/新增/移除；recipe snapshot 在核对后由 baseline 清理流程移除。cleanup 通过，DOSBox PID 19553 及进程组回收；事后无 DOSBox-X，`SessionLock` 可取得并释放。runner mocks 18/18、gate synthetic tests 52/52、comparison selftest 130/130、baseline unittest 184 项、preflight、链接检查与 `git diff --check` 均通过；但 mocks 未覆盖“canonical output root + repository-relative status signal”的真实组合，运行实证暴露协议缺口。
- **阻塞与范围：** 40 按预定单次采集约束不重跑，维持 blocked；必须修正并端到端验证 canonical path 转换、并经单独复核后明确授权新尝试，方可恢复。没有窗口可供 `orig.py` 或 comparison 消费；不修改 D-02、27、spec、production code 或 baseline tools。
- **本次验证：** 更新后的 B-009 与本页 front matter 均保留必需 metadata，`updated: 2026-10-13`；两份文档的相对链接和锚点检查通过，`git diff --check` 通过。baseline/comparison/生产代码均未修改；未运行 pnpm 全检。
- **协调者恢复与 `a40-m1-05`（不计入）：** 用户授权协调者决定本目标其余事项。`valid_confirmation_path` 改为比较 signal 的规范化父目录与规范化 operator 目录；`test_m1_runner.py` 新增真实文件系统用例（共享 `local` symlink + 规范化 run root），runner 24/24、gate 52/52；`run_agent.py` SHA-256 `ed7771cf3271f1f8b7de6adc6426fda2ea70a63e255ea0f1f6850b0be9c6e3d3`。配方仍为 `a40-m1-corrected.json`。设置确认正常，两次目标门禁通过（`valid-active-enemy-target-and-viable-missile-1`），`poll-fire` 施加 Space，刺激 7/7。报告 `failed`（`samples-missing`、`run-timeout`），3614 秒后止于 m1-178：7,044/20,078 samples（required 2,306/6,422）。完整性通过（201 个受保护文件，无 evidence 变化/新增），清理通过（PID 21825 SIGTERM→SIGKILL 后回收）。原因是配方设计错误：`limits.runSeconds` 3600，而 534 个暂停约需 9,500 秒（每帧约 17.6 秒；a39-mc 用 86400）。此前对 a40-m1-04 的审阅漏掉了这一点。最后一行导弹仍在飞行，只作诊断，不作窗口。
- **获准修正运行 `a40-m1-06`：** `make40.py` 先确认能逐字节重建 `a40-m1-corrected.json`，然后只把 `runSeconds` 改为 86400，生成 `recipes/a40-m1-long.json`（SHA-256 `e108ce4b7fb7fe883eb4202238dbba4eb47a608f46176ed96381fc17def37c29`，指纹 `sha256:0ccef663c2cca766c73155c251aa83961f53374fbf44c0bad64dc8f68629f297`）；JSON 只有 `limits.runSeconds` 不同，配置、门禁、单次 Space、520 帧与 1500 秒等待上限不变。单独的 rubber-duck 复核无阻塞问题（等待、读数、日志与跳过命中限制充足；释放后的绑定字段为可选，不影响 `complete`；无硬编码配方名或哈希）。确定性预算错误的唯一修正运行不属于盲目重跑；协调者据用户授权批准。启动前 preflight 通过（manifest `manifest-b9bfecb3bf772fbf`，534 pauses，evidence 即规范化 runs 根），`SessionLock` 空闲，无 DOSBox-X。
- **`a40-m1-06` 结果（合格）：** 报告 `complete`，无 reasons；20,078/20,078 samples（12,291 合格，required 6,422/6,422），刺激 7/7，跳过命中 0，用时 8,502.7 秒（2026-10-13 19:50:39Z–22:12:21Z）。完整性通过（201 个受保护文件、29,379 个 evidence 文件均无变化/移除/新增），清理通过（DOSBox PID 26475 SIGTERM→SIGKILL，进程与进程组回收）；事后无 DOSBox-X。报告 SHA-256 `dc8149e6f45a3ec6aba32b931e40d20b4b04a0ea1f6bbaaf49e86cb99148d78e`。
- **窗口：** 发射 tick 11196，阶段 0 首个 state 7 回调 11200（步长 2、2）；寿命记录 384（`+0x44`），读取器归类为无制导程序。存活帧逐帧连续，每帧读到目标 `+0x8C` 句柄及其对象有效。37 次引信检查；相邻检查之间的 36 条严格截止链中，33 条 d = 0，3 条 d = 2 后重排。寿命到期：tick 11584 的帧仍为 state 7，11586 的帧为 state 6（失效，fizzle），11590 的帧节点已释放（下一帧离开，步长 4）。`orig.py` 的 `a40-m1` 读取器（selftest 136/136，新增 6 例）产出该窗口；Φ 判为 `holds`，无值失败或无效链节，`d2ThenReschedule` 与 `frameStepNot2` 均为真。
- **对 27 的影响（不在本项判定）：** 以 26/38/39 的 30 个运行加 `a40-m1-06` 重跑比较（31 个运行，`skippedRuns=[]`，新版输出 `out/new-c0d1b0c3` 不变，其后无 `src/` 变更）：导弹类原版持有窗口 4 个，覆盖导弹 0、1、3；`a40-m1-06` 的窗口键（寿命 384、无制导、fizzle）在现有新版场景中无配对，因为新版导弹 1 的窗口都以近炸结束。被忽略的 `compare.py` 已把过期的“导弹 1 无终点窗口”缺口改为这一新版配对缺口。报告 `out/a40-2026-10-13/report.json` SHA-256 `13e52f69ef9f8d1cebfcdbe1f845eac2de2861fe6f352c2d763a393a158a4b4d`；工具 SHA-256：`compare.py` `90eec0ca1a4f387d9bd6fe047676d96b1fbd5fedb8e4343344cd7119531ee9b5`，`orig.py` `7c8bf4d90a66e44655ebfb28130612828d3425d878f6e52de3fc7bb4c3cbcfd5`，`selftest.py` `efffd184ac08904520cfbf75881a9c1d741fb0ed955c670272f53c387ccff441`。新版场景补充与类别结论由 27 负责。
- **验证：** runner 24/24、gate 52/52、comparison selftest 136/136；preflight 通过。未修改生产代码、baseline 工具、spec 或 D-02；未运行 pnpm 全检（无 TypeScript 变更）。文档链接与元数据、`git diff --check`、原版合规检查见本次提交。
