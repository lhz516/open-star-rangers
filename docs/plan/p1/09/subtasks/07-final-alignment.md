---
type: plan
status: active
phase: P1
task: "09"
subtask: "07"
updated: 2026-10-03
---

# 07 — 最小键盘输入与隔离最终对齐

**契约来源：** [Spec](../spec.md) 全部 S-01 至 S-07、AC-01 至 AC-16、技术决定及不包含范围。
**依赖：** 01, 02, 03, 04, 05, 06。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 只验证，逐项核对 Spec→goal 覆盖→实际交付→当前有效证据；不写新功能。缺口使用稳定新 ID 修复子任务，插在本行前并加入依赖。
- 核对：code 规范化、轴/命令/控制分流、通知限制、全部暂停清键、空表 repeat 无效、keyup 清理与拦截分离、资格恢复、不恢复旧 run/owner、pending 及独立错误保留。
- 核对所有获取/回滚/释放路径与先失效再撤销；明确逻辑隔离不等于物理监听回收，失败仍锁存。
- 05 证据必须对应最终代码：开发/生产的交互与焦点、真实 hidden、往返/StrictMode/HMR、同 owner Restart/Exit→Start、监听归属与清理结果。稀有失败与仅窗口路径按 Spec 的指定证据分层，不能伪造浏览器 passed。
- 在最终代码运行 `pnpm check`；检查任务完整 diff、受保护模块、配置/依赖、录制格式、文档/导航及无原版内容。

## 不包含

- 新功能代码、在本项修缺口、改 Spec/放宽验收或生成额外报告。
- P1-10 runner/跨模块全量回归、实机/原版保真或 P1 阶段退出判定。
- push、云/部署；无代码改动不调用 simplify。

## 关键文件与契约

- [Spec](../spec.md)、[goal](../goal.md)、01–06 全部完成证据及其列出的实际源码/测试。
- [工程约定](../../../../engineering/README.md)、[独立键位文档](../../../../engineering/keyboard-input.md)、[源码结构指南](../../../../engineering/source-structure.md)与[阶段索引](../../tasks.md)。
- 只读核对 [Core](../../../../../src/core/)、[Runtime](../../../../../src/app/runtime/)、[Session](../../../../../src/app/session/)、[package.json](../../../../../package.json)、[pnpm-lock.yaml](../../../../../pnpm-lock.yaml)相对任务起点无改动。

## 验收标准

- [x] 7 个 S 与 16 个 AC 全有真实且当前有效的完整证据；无未执行项、失败项或必需检查 blocked 被当通过。
- [x] 轴、命令、控制、焦点、通知、回滚/失效与错误保留不变量满足获批 Spec，没有新的时钟/队列/权威状态。
- [x] AC-08/09/13 开发及生产证据、AC-10 真实 hidden 及指定生产失焦、AC-11 StrictMode/HMR/往返/运行替换齐全。
- [x] AC-14/15 的完整差异与独立文档对齐通过；上游测试未删除、跳过或放宽，无受保护模块/依赖/格式变更。
- [x] AC-16 最终 `pnpm check` 通过，临时编辑、探针、浏览器/服务器及 synthetic 文件已按所有权清理。
- [x] tracker、依赖及所有子任务证据一致；本项不交付新代码，不把任务完成等同阶段退出。

## 验证方法

- `pnpm check`；对照 goal 的每个 S/AC 行核验 01–06 证据与实际测试/接线，记录当前源码版本及完整任务差异。
- 优先复用 05 的最终有效结果；如受影响代码发生变化或证据缺失，按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)重验指定用例，不重复无关浏览器检查。
- 文档/元数据/链接、ID 与依赖图核对；所有 tracker 行 completed 后，`node tools/task-state.ts p1/09`才应路由为 done。这只是工作流结论，不能代替上述证据。

## 完成证据

- 2026-10-03：最终源码为`1261ab2`，随后仅05/06证据与文档变更（当前HEAD `2e6f1fc`）；任务起点`8638479`。01–06验收框全部已满足并分别本地提交，未把accepted当实现完成。
- **覆盖核验：** S-01→03/06；S-02→01/03；S-03→03/04/05；S-04→02/04/05；S-05→01/03/04/05；S-06→02/04/05；S-07→05/06/07。AC-01→01/03/06；02→01/03；03/04/06→03/04/05；05→01/02/03/05；07→01/02/03/04/05；08/09/10/11/13→04/05（02/03/04的Node边界共同支持）；12→02/03/04及05的稀有文案接线审阅；14/15→06与完整任务差异；16→本项最终check。以上是验收证据入口摘要，完整实现/验证归属以goal覆盖表为准；7个S/16个AC均有契约指定层次的有效证据。
- **不变量：** 通用记录冻结且仅code/约定布尔字段；轴释放与preventDefault独立；仅fresh非重复running事件建表；双键抵消及数值去重；所有暂停/失焦/隐藏/换run/释放清表；真实Session逐tick投影与参考Core逐位相等。输入不在状态/取消/错误/清理或attach里提交，恢复无旧轴。命令/控制复用现有pending与可用性，真正失败保留原因，实际轴成功仅清旧input错误；ignored/no-op/repeat不清错。
- **所有权：** 02真实九项登记管理逐点回滚/多错/旧回调测试，03消费者状态订阅回滚，04先失效输入再撤销/Session/bridge/renderer完整收尾及app锁存都有证据；逻辑无效不被写成物理撤销成功。同owner换run不重注册，旧run/binding/source身份隔离。
- **浏览器有效性：** 05开发/生产实际移动、第一新tick后四样本跨360ms稳定、N/X/X/P、原生控件与Return放行、Tab/点击/ARIA/焦点截图齐全；开发原生hidden→visible仍paused、trusted repeat=true不恢复、fresh输入才移动；生产实际元素失焦仍running但轴停。StrictMode开发三次往返、生产一次，新owner真实Fast Refresh及恢复、同ownerRestart/Exit→Start监听身份平衡。仅窗口恢复也取得visible下原生blur/focus；窗口按住清轴矩阵准确归Node，不扩张浏览器结论。没有模拟事件替代hidden或伪造稀有故障browser pass。
- **最终工程：** `pnpm check`通过（三组TypeScript、ESLint、46文件/1185测试、生产构建）。产物index-BWtf9nnJ.js与05生产取证一致（811.01kB/gzip219.34kB）；仅既有500kB chunk警告。目标新测试覆盖及上游测试全部保留，没有删除/跳过/放宽旧验收。
- **完整任务差异与隐私：** 相对`8638479`的Core/Runtime/Session、依赖/锁文件、TS/Vite/ESLint配置、main、original-data、原版记录均未改；新增平台/消费者、桥接/store窄扩展、owner与输入区及相关测试/文档在approved范围。没有新时钟、命令队列、内部step/frame、存储、Lock/全屏/Gamepad或全局游戏键。所有任务文件是自建TS/TSX/CSS/Markdown，无local/、二进制、原版内容或研究输出。
- **清理与文档：** 05临时代码还原、探针随页面/context关闭、自有Chrome/profile/截图与服务器清理；5180/5181/9222无监听，原有5173未操作。独立键位文档active且旧规则全部纠正，工程/结构/导航更新；无新原版事实或冻结决定。STATUS仅更新下一步为P1-10联合验证，未勾选阶段退出项。
- **rubber-duck处置：** 补齐摘要中AC-06/07的01/04证据引用。拒绝“04与05测试数量冲突”与包体漂移两项：实际1178/约804kB写在03，不在05；03→04明确新增owner五项及lifecycle两项测试，1178+7=1185，并接入浏览器源使产物从旧804kB变811.01kB。04→05无源码变化，05明确记录最终index-BWtf9nnJ.js，与本项相同；精确文档检索及提交差异已核对，不修改正确历史证据。无真实实现缺口，不需要修复子任务；本项纯核验，不执行simplify。
- **最终文档检查：** 15篇相关文档/353个本地链接与锚点、front matter/date及全部验收框通过；goal图结构、稳定ID/依赖与覆盖有效，tracker全部completed时router为done。源码不再变化，最后一项仅提交本项证据、goal与STATUS摘要。
