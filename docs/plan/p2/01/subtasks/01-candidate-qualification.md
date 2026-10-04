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

- [x] 取得首选候选合格证据，或按确定性规则产出一个重新批准的合格回退候选；否则 goal 保持 blocked。
- [x] 证据覆盖玩家、敌机基数、基地、结果、地图/Warp 角色及未知项置信度，未把高概率结论写成已确认。
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

- 后续独立激活研究未启动原版游戏；已有最短进入 live-3D 的行为记录见 [B-002](../../../../original/behavior/B-002-practice-mode.md)，未证明非任务表现激活路径，也不据此断言没有这种路径。相关菜单热键未核实，键盘调度不等于指针点击。原版之外的输入工具实验发生原生退出，未确认输入已派发；自有进程已回收，原配置/计分/程序及 391 份旧证据未变化。`runtime-activation-investigation-22/activation-dependency.json` 和 `verification.json` 保留精确输入缺口与限制，仅在 ignored local。
- 已提出一次隔离副本中的最小协作动作：进入练习入口后停在首次驾驶舱，不飞行、开火或通关；本轮没有可用用户应答，没有自动猜测菜单键序、修改原用户数据或把练习改为候选。仅阻塞当前激活研究，映射和观察链的已有证明不撤销；准确恢复条件仅由 goal 维护，AC-01/10 和前两项验收仍未通过。

- 用户随后已可协作并批准开始隔离会话。`runtime-manual-activation-23/report.json` 记录点击前自然启动过程中取得的一处合格区间变化；用户只报告黑色调试暂停画面，没有进入练习或执行游戏操作。原窗口已结束，原配置/计分/程序与旧报告哈希核对不变。实际字值、页面核验与未捕获写入者/来源的边界只在 [executable](../../../../original/formats/executable.md#qualified-startup-interval-change-before-manual-activation) 维护；这次不再要求用户点击入口，继续绑定新观察到的上下文，而不是把区间变化提升为资源转换/候选通过。

- `runtime-source-snapshot-24/milestone.json` 保存一次新运行中的有限上下文读取、字段稳定性/页面核验和精确 TEX handler 调用位置。结构兼容性、运行时 handle 与来源 ID 的区别及下一 ownership linker 只在上述 executable owner 维护。没有由尺寸/调色板数量或运行时 handle 唯一选定原版条目，没有抓到写指令/创建者；资格和额外单位/边数仍未通过/仍为 unknown。原数据、912 份旧证据与私有配置未变，没有产品接口或测试发现/截止时间变化。

- `tex-source-binding-25.json` 与精确原生导出取得 TEX continuation 的 wrapper/分派调用绑定，具体字段/寄存器、下一完成 linker 与尚未证明的来源含义只在上述 executable owner 维护。没有按类比补 source ID，没有启动新模拟器或 payload 捕获；对间接回调方法的合成保护不冒充真实来源请求。01 继续绑定完成回调/consumer 与已接受的运行时指针，所有资格和原 S-02 门禁保持未通过。

- `tex-completion-26-milestone.json` 核对完成函数及准备 callee 的完整可达原生流，取得成功 consumer 的字段/寄存器传递证据；精确关系及 +12 未观察语义只由上述 executable owner 维护。一次实际探针虽重验映射，但未通过设断点前的上下文保护，没有取得请求、wrapper 或 consumer 实例。没有将 native 转发的数值命名为已验证 archive ID；实际来源/所有者关联、写指令和候选资格仍未满足，已有 23/24/25 证据及原数据保持不变。

- `tex-completion-27-milestone.json` 取得下一请求载体的原生输入绑定，并在实际探针中重验 CODE/DATA 和页身份；精确语义边界与未核实的 code hook 注册只在上述 executable owner 维护。注册未确认时的零事件不作为执行时序/缺失证明，没有捕获 wrapper 实例或补来源 ID。01 继续先核实真实 hook 注册和目录 ID 语义，再关联实际 pointer/consumer；资格、原 S-02 与额外计数仍未满足。

- `code-registry-28-milestone.json` 保存真实 code hook 的原生登记和有界未观察结果、载体 callee 的具体操作及十项读取反例。只有原生登记证明 hook，fixture 不代替运行时证据；具体时长、操作和未关联限制只由上述 executable owner 维护。没有把零事件推成未执行/不存在，也没有把 opaque 载体数值补为目录 ID；停止重复回调捕获，下一替代来源比较仍须先证明记录生产/转换，再核对完整数据和可验证 locator（允许等价集合）。

- `source-binding-29-milestone.json` 核对了分配/分派 helper 的实际操作，避免沿用“image/renderer preparation”的未经证明命名；准备记录 +36 关联及像素/调色板范围、alias 和 mutation 的缺口只在上述 executable owner 维护。未对未证明布局进行完整图像比较或来源候选扫描，未把达到原生导出 cap 的函数当作空函数。没有新模拟器/输入、原数据或工程接口变化；资格、来源 locator、generated/reused-only 归属与额外计数仍未证明。

- `preparation-layout-30.json` 取得原生准备记录的构造/字段布局和正调色板转换循环，完整检查字段断言与合成转换例通过；owner 与 prep 的不同偏移语义、helper 实际操作和未读 target/未证明 mutation 只在上述 executable owner 维护。不能把静态布局套到已观察 pointer 就声称所有权，也不把这个 RGB 转换循环写成 nearest-DATA 映射。没有完整 payload 比较/来源结论，原数据和 2,233 份保护范围内的旧证据未变。

- `runtime-ownership-31-milestone.json` 取得实际 owner/linked-prep 及两组完整调色板读取和精确关系核对；字段对应、alias、所有条目转换与稳定性保护只在上述 executable owner 维护。此结果证明当前两记录/调色板关系，不证明构造函数执行、完整像素来源、请求 ID 或下游不变性。没有从结构关系直接选定原版 locator；原数据和 2,238 份旧证据保护范围未变，资格/S-02/额外计数仍未满足。

- `runtime-full-content-32-guard.json` 保留实际完整读取尝试的前置保护失败：重新验证记录/调色板后，当前数据段不覆盖完整像素范围，未发出 bulk dump。地址范围、非对齐页数和其他读路径仍可能有效的边界只在上述 executable owner 维护。完整像素读取及来源比较均未执行，匹配数仍为 unknown，不写成零匹配/来源不存在；原配置/程序/计分与 2,738 份保护范围证据未变。

- `runtime-full-content-33-guard.json` 核对本次初始 DATA selector 的完整新描述符内容及保护/分页状态，但实验性的回执绑定仍因未显示标签/echo 而拒绝 bulk 读取；描述符本身和接口能力的局限只在上述 executable owner 维护。没有改动 emulated registers 或改用截断段，完整像素/来源比对仍未执行，不把 decoder 保护失败升级为原版资源缺失或必须人工介入。原数据及 3,268 份保护范围证据未变。

- `runtime-full-content-34-milestone.json` 与 `current-tex-equivalence-34.json` 取得通过完整读取保护的图像内容等价证明；原版来源事实、两个等价 locator、全部候选既有引用及未确认的请求/创建者只在 [textures](../../../../original/formats/textures.md#checked-runtime-image-equivalence-and-exact-source-aliases) 维护，读取身份/页面/稳定性保护见 [executable](../../../../original/formats/executable.md#qualified-full-span-image-capture)。依已批准契约保留等价来源集合，不额外要求辨别字节完全相同条目的历史请求 ID；这不是完整生产来源映射、全包规范计数或候选资格通过。没有用户输入或产品接口变更，不重复 08 已完成的全量工程检查。

- `exact-source-tex-subgraphs.ts/.json` 将保守的精确来源别名纳入全部候选的部分模型/图像图；来源等价规则只在上述 textures 维护，重建计数、真实类型化引用断言和完整性边界见 [mesh](../../../../original/formats/mesh.md#exact-source-image-alias-projection-partial)。实际运行断言通过且报告 hash 与已验证结果一致，既有三份来源/图/音效报告未变。不将部分图句柄、hash 编号或来源别名直接当作生产 Asset/语义角色，也未据此选定候选或解锁下游。

- 本里程碑检查：7 份变更文档的元数据、166 个相对链接和 60 个锚点通过，`git diff --check` 通过；`pnpm --silent check:original` 四个范围均 completed 且零 finding。本地投影脚本/报告已确认 git-ignored；未改产品 TypeScript、测试、依赖或冻结决策。本次提交只持久化研究进展，不表示 01 验收完成。

- 玩家相对敌我分类已取得：对四个阵营掩码的立即数做有界字节搜索，再经只读 Ghidra 定位到玩家飞行按键的敌/友目标模式，并取得输入不变量与穷尽的分配来源，未扩展到 AI/公式。事实、地址与置信度只在 [executable](../../../../original/formats/executable.md#player-target-modes-and-enemy-classification) 维护。三组第一关恰依赖两种敌方模型，满足 1–2 种门槛；旧的 AI 同侧谓词、击杀统计和非基地推断都没有用作证据。代码确认用户试玩第一关的统计页难度就是选组输入，该次运行为 group 0 / slot 1，事实见 [scenario §4](../../../../original/formats/scenario.md#4-scct-campaign-table-confirmed-structure-likely-meaning)。放大复核截图后，此前误记的难度 14 更正为 19，仍属 group 0。

- `candidate-selection.ts/.json` 按 S-01/S-02 检查全部 51 个非零战役槽位，输入报告 hash 均核对未变，重跑 JSON 逐字节一致。
  - **不合格下界：** 45 个槽位直接引用 3–6 种敌方模型，无论其他条件如何都不合格。只有三组的 slot 1、slot 2 通过玩家/敌机/基地的结构门槛（[scenario 结构门槛](../../../../original/formats/scenario.md#p2-slice-candidate-evidence)）。
  - **完整资格只核实到选定候选：** 结算与地图/Warp 只在 group 0 / slot 1 的用户试玩中观察到，其余五个候选未逐个核实，也无需核实，原因见下一条。
  - **选择论证：** 按已批准的单位政策，候选的规范闭包由三部分组成：一个整任务 Asset（对象、引用、标签和数值都是内部元素）；由任务对象种类可达的 Asset，即模型及其图像、样本、嵌入或独立复用的调色板，以及若存在的按种类数据；以及与任务无关的切片固定 Asset，即驾驶舱、HUD/MFD、字体、地图图形、全局调色板、弹丸/导弹/碎片表现和核心音效。音乐、通讯/视频和简报不在切片范围内。三个 slot 1 的种类集合相同，闭包数量相同，按 group 字典序取 group 0。每个 slot 2 的种类集合严格包含 slot 1，至少多 3 个模型 Asset，所有按种类可达的类别都只增不减。因此不论其余五个候选是否合格，group 0 / slot 1 都是 S-02 的结果。
  - **部分投影：** 已有投影中可计数的类别为任务、模型、精确别名合并后的图像和合并别名后的样本，slot 1 为 34 Asset / 45 边，slot 2 为 47 / 76。这些只是部分投影，用于说明比较方向，不是完整的规范总数。调色板绑定、按种类数据和固定资源的绝对计数与来源映射由 02/03 完成。
  - 该回退候选的 spec 修订已经审阅，并获用户批准，见下一条。

- 子任务审查与完成：rubber-duck 审查指出 4 个阻塞问题和 1 个措辞问题，均已处理，同一审查者逐项复核为已解决。阻塞问题依次是：敌方分配来源未穷尽，结构门槛被写成完整资格，部分投影被当作规范总数，以及试玩绑定置信度过高。措辞问题是练习模式观察被写成穷尽。复核中补充了分配器与生成队列的类型化引用、统计页渲染的唯一数值来源，以及截图放大后的难度更正。spec [候选选择记录](../spec.md#候选选择记录)经另一模型按 review-spec 审阅，未产生新的契约决策；用户于 2026-10-04 明确批准该修订，spec 恢复 accepted。本子任务没有实现代码，无需 simplify；检查覆盖文档元数据/链接/锚点、`git diff --check` 与 `pnpm --silent check:original`（零 finding），不重复 08 已通过的全量工程检查。文档影响：原版事实已写入 executable、scenario、B-003、key-map 与 unknowns；工程约定与操作指南无需变更。

### 当前资格证据覆盖

| 资格/关卡 | 本轮评估 | 证据或未满足部分 |
|---|---|---|
| 玩家机型与基准配置 | 已确认：玩家为 M2ID slot 0；S-02 选出 group 0 / slot 1，基准配置随之为 group 0 | scenario §4 与上方 S-02 证据；代码确认用户第一关试玩即为同一 group/slot；僚机记录使用玩家模型，具体选择语义仍为 U-023 |
| 一至两种敌机 | 已确认：恰两种（slot 7、8） | executable 的玩家目标模式、输入不变量与穷尽分配来源；击杀统计只作一致性参考 |
| 基地/基地交互角色 | 已确认：slot 17 是该关唯一的基地交互 kind，属友方模式；用户在该关停靠 | B-004 与 executable；精确可用条件与状态门禁归 P3 |
| 战略地图/Warp | 已确认：同一关可用 | B-001；精确空间语义与 Warp 规则归 P3/P2-09 |
| 任务结果入口 | 已确认：同一关可观察结算与推进 | B-003；正式成功公式归 P3，被毁后的救援与失败规则另见 B-005/U-031 |
| 已观察表现图像的内容来源 | 精确等价来源集合已核对，历史请求/创建者仍未确认 | textures 与 executable；已有模型来源闭包包含该内容族，其他表现族与完整规范身份仍待核实 |
| S-02 回退排序 | 已完成：45 个槽位按敌机下界不合格；6 个通过结构门槛；按包含关系选出 group 0 / slot 1 | 上方 `candidate-selection` 证据与选择论证；34/45 等只是部分投影，绝对规范总数归 02/03 |
| 替代候选审批 | 已完成：spec 选择记录经另一模型审阅，用户于 2026-10-04 批准 | [spec 候选选择记录](../spec.md#候选选择记录) |
