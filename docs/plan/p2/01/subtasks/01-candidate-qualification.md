---
type: plan
status: active
phase: P2
task: "01"
subtask: "01"
updated: 2026-10-04
---

# 01 — 候选任务资格核对

**契约来源：** [spec](../spec.md) 的 S-01、S-02、S-03、S-06、S-11；AC-01、AC-10。
**依赖：** 08。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 使用开发者本地合法数据只读核对 SCCT 三组共用 slot 0、基准中间组策略及 P3 资格：玩家机型、1–2 种敌机、基地/基地交互对象、任务结果所需数据和地图/Warp 空间数据。
- 若首选不合格，按 spec 的确定性回退规则评估候选；记录候选选择器、结构计数、资源角色缺口、U 项和安全证据，不记录原版文字、图像、音频、字节或反编译输出。
- 产出供 `content/` 使用的候选身份与角色清单；没有合格候选时明确 blocked 原因和恢复条件。

## 不包含

- 不实现正式解析器、Asset ID 验证器、P3 规则或浏览器导入。
- 不把本地研究输出复制到跟踪文件或仓库；不执行上传、部署或破坏性操作。

## 关键文件与契约

- [SCEN/SCCT 格式](../../../../original/formats/scenario.md)与 [U-022/U-023](../../../../original/unknowns.md)是事实依据。
- 计划新增的本地研究/证据入口由执行时按现有工具归属决定；不在仓库追踪原版内容。
- 计划新增的生产切片定义由 02 消费本子任务结果。

## 验收标准

- [ ] 取得首选候选合格证据，或按确定性规则产出一个重新批准的合格回退候选；否则 goal 保持 blocked。
- [ ] 证据覆盖玩家、敌机基数、基地、结果、地图/Warp 角色及未知项置信度，未把高概率结论写成已确认。
- [x] 研究产物仅留在 `local/`，公开变更不包含原版内容或反编译输出。

## 验证方法

- 本地 Node 工具/只读研究与必要的 Ghidra/DOSBox 证据；输出只记录结构 ID、类型、计数、U 项和判定。
- 不适用 browser-testing；本子任务不建立浏览器交互。

## 完成证据

- `node tools/nob-list.ts local/StarRang/SRANGERS/MAIN/SCENARIO.NOB --entries` 确认 52 个 `SCEN` 和一个 `SCCT`；本地结构脚本确认三组均为 18 个 slot，slot 0 均指向 entry 3121，基准选择器为 group 1 / slot 0。
- `local/research/p2-01/candidate-qualification.json`（忽略目录）记录安全结构证据。首选任务有 10 条 section-1 记录，非玩家非零 kind 经函数 `0x65ca4` 确认映射到六个 M2ID 槽位；section 3/4 为空。该映射仍未证明敌我、基地能力、结果条件或 Warp 空间语义。
- Ghidra 只读分析输出仅写入 `local/research/p2-01/`；跟踪文档只记录安全结构 ID、类型、计数、置信度和判定，没有原版字节、文字、图像、音频或反编译内容。
- Rubber-duck 审查指出原结论错误地把消息段当作结果数据、把未确认 kind 当作敌方/基地角色，并忽略了六种非玩家槽位；这些问题均已撤回，子任务按契约保持 blocked。
- 文档影响：结构证据和资格缺口已写入权威 [scenario](../../../../original/formats/scenario.md#p2-slice-candidate-evidence) 并同步 U-022；其他工程/操作文档无需变更，因为本子任务未新增产品接口或命令。
- 2026-10-03 用户补充试玩及本地截图核对形成 [B-002](../../../../original/behavior/B-002-practice-mode.md)：练习玩法候选不合格，失败流程已有观察，成功条件仍未确认；截图编号错配不用于生产机型映射。入口到 slot 0 的绑定仍保留高概率，不能将练习和战役第一关混为一谈。
- 2026-10-03 用户补充战役试玩；本轮核对 32 个引用截图，证据按 owner 写入 [B-003](../../../../original/behavior/B-003-campaign-flow.md)、[B-004](../../../../original/behavior/B-004-base-communications.md)、[B-005](../../../../original/behavior/B-005-campaign-rescue.md) 与既有 [B-001](../../../../original/behavior/B-001-strategic-map.md)，同时同步未知项和键位。截图文字/名称与画面只留在 `local/`，未复制进文档。
- 资格判断：本轮足以消除战役是否具有基地交互、实际 Warp 和结算入口的玩法覆盖疑问，但不足以通过 AC-01/10 或解锁子任务 02。难度/敌机类别的证据限制见 B-003，结构选择器与闭包仍待研究；替代候选尚未修订、审阅和批准。
- 子任务证据/置信度检查：没有将击杀分类当作模型类别、将目标名称当作资源身份、将战机被毁当作战役失败；成功/失败的精确规则归 P3，不新增“关闭全部 U-031”作为 P2 资格条件。
- 本地执行 `node local/research/p2-01/profile-candidates.ts`，覆盖和计数限制见 [scenario 来源 profile](../../../../original/formats/scenario.md#campaign-candidate-source-profiles-confirmed-structure)；结构断言核对 54 个 slot、52 个不同 SCEN、三个 slot-1 profile 及逐类型最小值。`node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB` 零失败。没有把原版来源条目数或来源边数作为 S-02 的规范 Asset/边数。
- 模型对照已补入 [mesh](../../../../original/formats/mesh.md#3-comparison-with-the-original-partial) 和 U-028；研究脚本与 Ghidra 输出仍只留在 `local/`。接口/测试规则未变化，无需改工程约定；跟踪文档只含来源 ID、数量、结构和研究结论。
- 后续只读分析核实首个战役任务使用 slot 1，并发现 section-5 实际成员数组遍历和 +0x5C 的真实用途。profile 已升级为 version 2 并重算 54 个槽位，slot-1 的来源数量和逐类型最小值保持不变；参数敏感结论同时核对原生调用寄存器，未依赖旧的 `__fastcall` 推断签名。事实见 scenario/executable，不在此复制原版代码。
- 08 完成后恢复研究；新增本地 `fixed-graphics-profile.ts`，固定 HI 图形贡献的结构/部分计数见 [cockpit](../../../../original/formats/cockpit.md#bounded-canonical-graphics-projection)。断言核对 25 个唯一单位（2 layout、20 image、3 font）及 8 条已解析布局/图像边；报告显式不完整，未把这些贡献当作全包数量或 S-02 排序结果。
- 2026-10-04 有界研究生成可重放的 `model-material-subgraphs.ts`，覆盖全部候选，重建闭包/引用并通过真实 `readAssetReference` 校验；重新生成的报告与初次结果逐字节一致。模型/几何/图像引用的划分与限制见 [mesh](../../../../original/formats/mesh.md#bounded-modelmaterial-dependency-projection-confirmed-structurecounts)，没有将研究编号当作稳定生产语义 ID。
- 同日新增 `sound-source-profile.ts`，全量样本区边界、模型音效引用和精确别名核对通过；合成边界样本同时拒绝截断和不完整采样字。结构结论及未确认的角色/声道/flags 见 [audio](../../../../original/formats/audio.md#sample-boundaries-and-candidate-model-references-confirmed-structure)。两份新报告均明确 `complete: false`、`rankingAvailable: false`，所有脚本/输出已确认 git-ignored。
- 本轮研究文档检查：6 份变更文档的元数据、98 个相对链接及锚点通过，`git diff --check` 通过；`pnpm --silent check:original` 四个范围均完成且零 finding。未改产品 TypeScript、测试或依赖，不重复 08 已通过的全量工程检查。本轮仅持久化事实里程碑，不表示子任务完成。
- 2026-10-04 独立有界研究新增 `slot1-role-gates.ts/.json`，精确地址只读分析及全部模板/成员（含非零生成时间）断言通过；基地 kind 门禁和 SCEN 外分配器调用的安全事实、角色置信度及限制见 [executable](../../../../original/formats/executable.md#bounded-slot-1-interaction-kind-evidence)。该门禁不是阵营分类，也不能证明基地交互在任意运行状态可用；隐式路径是否新增模型身份仍未确认。新报告四个完成/排序/分类/隐式覆盖标志均为 false，不重算已完成的模型/音效/固定图形图。
- 此有界研究只取得角色门禁里程碑，未完成本子任务，不启动 02–07、不修订 spec、不暂存/提交。下一次从 `0x38780`、`0x3cb80` 两个已定位的 SCEN 外分配器调用者核实 kind 与模型来源，再决定隐式身份是否扩展候选；敌方基数、完整规范图、原 S-02 排序及替代候选重新审阅/批准仍未满足。工程/操作命令与产品接口未变，相关工程指南无需更新。
- 同日跟进完成上述两条路径的原生输入及局部/直接调用门禁核对；`node local/research/p2-01/two-allocator-profile.ts` 将结果与全部 54 个现有 profile 对比，来源图不重算。事实、条件性及未闭合的表现/参数依赖见 [executable](../../../../original/formats/executable.md#two-allocator-paths-native-inputs-and-profile-comparison)。只读 Ghidra 使用精确函数/调用地址，未用猜测的 C 签名确定输入，原生指令、C、脚本及报告仅留 ignored local。
- 本次仍不通过 AC-01/10、不改变 tracker 或 spec、不推进下游。下一有界目标可核对剩余分配调用 `0x23b3c` / `0x23ff0` 的输入和模型绑定；其他直接调用地址由 executable 单点维护。报告保留完成/排序/隐式覆盖 false，候选敌方基数、完整闭包、原 S-02 排序及替代审批仍未满足；未重跑测试/构建，产品接口与工程指南没有变化。
- 同日按一个地址列表完成剩余直接分配器输入批次；初次原生导出触及第四个函数的本地单函数指令上限，调整 ignored 导出器上限后，同一列表完整导出成功。`node local/research/p2-01/remaining-allocator-profile.ts` 核对完整输入集、有效 M2ID 边界/零条目、已知直接调用清单覆盖和全部既有 profile，且原 profile 哈希未变化；没有重建已完成的图。结果与置信度/可达性限制只写在 [executable 的单一事实表](../../../../original/formats/executable.md#remaining-direct-allocator-input-inventory)，原生指令、C 和一个合并 recipe/report 仍仅留 ignored local。
- 此批次闭合的是已知直接 allocator 输入清单，不是资源闭包或敌方分类；全部相关完成/排序/表现/间接/隐式模型/敌方标志保持 false。下一有界动作是从 `0x24d78` 到 `0x3e530` 核对独立的二级表现选择器，不能由 allocator 无直接模型身份推断无需表现资源。01 保持进行中；AC-01/10、完整闭包、S-02 排序和替代审批仍未满足，不修改 spec、不推进下游、不重跑测试/构建、不暂存/提交。
- 同日继续二级选择器链，取得局部 discriminator 生成/消费、MODL 类型处理器及部件引用族证据；`node local/research/p2-01/secondary-selector-profile.ts` 核对精确原生输入、已记录候选的条件模型请求和未变化的 profile 哈希。选择器、缓存/参数表未绑定的限制及 ASSET_UNITS 归属见 [executable](../../../../original/formats/executable.md#secondary-presentation-selector-bounded-production-and-dispatch)，模型部件事实只在 [mesh](../../../../original/formats/mesh.md#secondary-presentation-model-reuse-bounded) 维护。没有原版指令/代码/内容进入跟踪文件，也没有重建已完成的图。
- 此里程碑未闭合全部选择器值域或表现来源，未给未知单位/边数填写 0。下一精确 linker 是 `0x66864` 的 MODL 完成回调与 `0x3ec20` 的缓存 owner 线索；缓存创建未证明前不标 procedural，不把 selector 1 或零来源当作无表现。01 继续进行中；敌方基数、全图、S-02 排序及替代审批仍未满足，不改 spec、不推进下游，不重跑测试/构建。
- 同日跟进两条 linker，`node local/research/p2-01/presentation-closure-profile.ts` 验证 MODL 完成回调的原生寄存器绑定、缓存 texture setter 的实际操作及初始零值的有限意义；事实/限制见 [executable](../../../../original/formats/executable.md#model-completion-and-cached-handle-follow-up)，模型内部颜色状态只由 [mesh](../../../../original/formats/mesh.md#secondary-presentation-model-reuse-bounded) 维护。仅完善有效 MODL 的完成绑定，不把缓存 texture 更新误称几何创建，不把零初始值或零 texture handle 判为无表现资源。
- 剩余最小缺口是缓存几何和 active model/texture 的运行时来源赋值；注册 TEX handler `0x662c8` 可作为下一精确来源侧线索，但尚未证明它写入这些 context。附加 probe `0x6ac98` 已排除为 callback 执行器。报告的额外 Asset/边数仍为 unknown，01 继续进行中；逐候选可达性、敌方基数、全图、S-02 排序和替代审批仍未满足。未修改产品接口或重跑测试/构建，原生输出与合并 recipe/report 只留 ignored local。
- 同日完成最后一次有界静态 writer 核对；`node local/research/p2-01/cache-writer-profile.ts` 验证精确 cell/附近 base 的 reference/write 元数据及一次候选函数地址列表的完整原生覆盖。未恢复 containing root 结构，发现的邻近写入没有绑定目标 cell 的运行时创建或来源。具体 scope、置信度与缺口只在 [executable](../../../../original/formats/executable.md#final-bounded-static-cache-writer-attempt) 维护；既有 MODL 完成绑定不撤销，也不提升为缓存/全图闭合。
- 此分支的静态研究按有界执行约束停在证据 blocker：需一个本地初始化至首个 discriminator-1/2 实例的四 cell write-watch 记录，先做 LE→runtime 地址映射，取得 writer PC/调用链与来源元数据。该 probe 尚未执行，不再扩张猜测的静态地址或通用 loader。ASSET_UNITS 边界和额外 Asset/边数仍为 unknown；01 保持进行中，逐候选可达性、敌方基数、完整图、S-02 排序和替代审批仍未满足。没有产品/工程约定变更，未重跑测试/构建或候选 profile。
- 剩余资格条件：按 S-02 核实战役回退候选的角色、完整规范图和确定性排序，再修订、重新审阅和批准 spec。当前研究状态仅见 goal tracker；没有资格通过，不要求用户继续通关被排除的练习模式。
- 2026-10-04 独立有界敌我研究只沿既有 `0x68050` 目标选择路径，完成五个精确函数的只读原生/Watcom 交叉核对；`slot1-hostility-boundary.ts` 将全部 slot-1 主记录、模板和实际成员逐条与原 SCEN 和未变化的 version-2 profile 对照。证据及缺失的权威攻击/敌我 consumer 链接只由 [executable](../../../../original/formats/executable.md#slot-1-hostility-qualification-boundary) 维护；实际敌机基数仍为 unknown，slot 8 不提升为已确认敌方，未知值不填 0。
- 此轮保存的是精确分类证据边界，不通过 AC-01/10、不选定候选、不修改 tracker/spec、不推进下游。缓存创建来源仍为独立 blocker，未重访；保留原 S-02 全规范图排序和每模型一个 Asset/内部几何决定。不重跑已完成的测试、构建、profile 或全检查；本轮仅验证新增研究断言及文档/变更边界。

- 2026-10-04 第二次独立有界敌我追踪从已记录的 target-iterator 引用进入一个具体表现 consumer；新增 `slot1-iff-consumer-attempt.ts/.json` 核对三个精确原生函数、五条直接调用绑定和未变化的 source-profile 哈希，没有重算既有 profile。精确 consumer、观察位置及其 IFF/攻击语义仍未绑定的限制见 [executable](../../../../original/formats/executable.md#bounded-presentation-consumer-follow-up)。实际敌机基数仍为 unknown；输入不变量未证明，不向主记录、模板或成员传播敌我判定，也不要求必须存在持久阵营字段。
- 此 distinct attempt 在具体运行时身份/IFF 观察 blocker 处停止；未改变资格、原 S-02 排序、模型 Asset 粒度或 goal/spec，下游仍未启动，独立缓存分支未重访。只验证新增实验及变更文档元数据/链接；不重复已完成的工程检查。

- 随后用 private install/config 运行有界 DOSBox-X PTY 探针，原安装的配置/计分文件哈希保持不变，各自有进程均已回收；原始屏幕、原生指令和运行时输出仅留 ignored local。前三次尝试分别保留地址映射未验证、F10 观察时间不足和历史断点误判的失败证据，没有将其当作外部前提或赋值不存在。
- 修复按键/时限/最新断点响应解析后，`runtime-cache-probe-attempt-04/report.json` 记录一次真实 key-only F10 返回边界验证：4 项合成解析回归通过，返回位置观察 35.12 秒，单次控制器总时长 44.60 秒；旧报告哈希与原用户配置/计分哈希未变化。此结果只证明 DPMI 发现中断返回可自动控制，不证明应用入口或 LE object 映射；观察点覆盖仍为 0/16 bytes，来源赋值未取得，报告完成/资格标志均 false。下一步只收集经过验证的运行时映射与初始化写入，不扩张猜测静态地址或重跑工程检查。

- `runtime-cache-probe-attempt-05/report.json` 保留纠正协议后的一次独立转场尝试：目标中断 hook 未取得合格停点，未证明实际 LE 应用入口、object-4 runtime base/selectors/limits 或初始化前时机，覆盖仍为 0/16 bytes。没有猜测地址或设置未验证观察点；未知来源/额外 Asset/边数仍为 unknown，不是 0。单次控制器 19.58 秒，自有 PID 已回收，原用户配置/计分哈希及旧报告哈希未变化。此策略在证据 blocker 处停止；恢复条件仅由 goal 维护，不要求用户重复普通战役试玩或已经自动验证的按键动作。

- 用户批准分阶段恢复后，直接验证安装版本的定时暂停能力并取得运行中 CODE/DATA 关联。`runtime-vrt-map-12/report.json` 及离线反例记录两处完整窗口的独立精确比较、每对象地址推导与隔离/清理；此前失败报告保留，错误公共偏移没有改成静默默认。原版事实只在 [executable](../../../../original/formats/executable.md#bounded-runtime-codedata-object-correlation) 维护，不在此复制地址表或原始内容。当前只证明检查范围内的映射；入口执行、初始化前观察、缓存来源赋值、敌我基数与完整 S-02 排序仍未通过，报告资格标志保持 false。

- 映射后的赋值实验保留各次控制/读取失败；修复就绪等待和读取校验后，run 18 取得真实的部分观察点注册，未把模拟解析测试算作实际覆盖。页面可读性、跨模式警报及早期零填充输出的证据限制只在 [executable](../../../../original/formats/executable.md#watch-registration-and-address-space-availability-boundary) 维护。没有从不可读、初始零值或报警推断资源不存在/来源已确认；完整字值变化、写入者和初始化时机仍未满足。原始内存/控制输出只留 ignored local，没有产品接口或工程检查规则变更。

- `runtime-linear-assignment-21/report.json` 记录一次实际完成的有界观察控制链；最新原生响应、保护/分页上下文返回、相关页身份与完整字读取均取得证据，详情只在上述 executable owner 维护。最后合格快照可读但没有取得赋值/来源身份；观察暂停区间不宣称连续覆盖。下一步需要一个范围明确的表现/3D 创建上下文，不能继续重复启动实验，也不能从此结果把额外资源计为 0。原 spec、S-02、角色门槛和未完成验收项保持不变。

### 当前资格证据覆盖

| 资格/关卡 | 本轮评估 | 证据或未满足部分 |
|---|---|---|
| 玩家机型与基准配置 | 首关 slot-1 选择逻辑和三组来源 profile 已核对，配置未锁定 | B-003 和 scenario；本次统计样本不能冒充中间组，最终按原 S-02 选定配置，不能提前固定中间组 |
| 一至两种敌机 | 未证明完整基数 | B-003 的定性观察和击杀样本不替代全部主/延迟对象的机型与阵营映射 |
| 基地/基地交互角色 | 可观察功能已确认，slot-1 kind 门禁已有结构证据 | B-004 与 executable 的有界角色证据；运行时可用条件、具体所选任务的基地数量与完整来源闭包仍待核实 |
| 战略地图/Warp | 存在与表现已确认 | B-001；所选任务空间对象与原版来源绑定仍待完成 |
| 任务结果入口 | 可观察结算/推进已确认 | B-003；正式成功公式归 P3，被毁后的救援与失败规则另见 B-005/U-031 |
| S-02 回退排序 | 来源规模对比已完成，规范排序未完成 | scenario 的计数不涵盖全部切片，来源条目/边也不是规范 Asset/边；需先明确规范划分或经批准修订选择规则 |
| 替代候选审批 | 未完成 | 现有 accepted spec 的批准不等于批准任意战役任务，不能静默改候选 |
