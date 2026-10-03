---
type: plan
status: active
phase: P1
task: "10"
subtask: "07"
updated: 2026-10-03
---

# 07 — 证据适用性、完整 runner 与使用文档

**契约来源：** [Spec](../spec.md) 的 S-05、S-06；AC-01、AC-09、AC-10、AC-11、AC-12。
**依赖：** 01, 02, 03, 04, 05, 06。
**执行状态：** 仅由 [Goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 运行最终pnpm check与完整pnpm test:e2e（当前build＋开发/生产普通与开发headed），记录真实版本/origin/项目/结果与构建身份。补验runner断言、构建/启动、缺executable/能力失败路径非零；已有子任务负向证据可复用，不只报发现数量。
- 建立“新增自动覆盖／直接复用／失效需补测”映射，对P1-05–09的HMR、窗口、DPR、稀有故障/取消/回滚证据记录版本、对应路径及相对证据版本的相关差异。没变直接复用，必需失效项才按browser-testing有界补测；临时编辑必须还原，不在常规runner自动编辑源码。
- 更新工程约定的命令/四个类型程序/本地browser准备与CDP路线，结构指南说明E2E、Node回归和纯模块边界。说明需要已有兼容浏览器、不自动下载、单worker/零retry、输出目录、端口/profile所有权、故障处理与覆盖边界。
- 审阅完整diff及当前网站产物，确保Playwright/test入口未进入生产、无原版/用户数据读取、无新增生产控制后门。核对成功/失败后owned进程/profile/探针与临时fixtures收尾，ignored合成报告不进源码/网站。
- 按[简化](../../../../../.agents/skills/simplify/SKILL.md)仅处理本项文档和必要测试接入；发现功能缺口不能用历史证据/弱断言消除。

## 不包含

不重复仍有效的手工HMR/完整DPR/20或50压力矩阵、不生成另一份独立review报告；不代替P1-12合规或P1-14退出，不提交/上传原版或报告。

## 关键文件与契约

- 现有[工程约定](../../../../engineering/README.md)、[结构指南](../../../../engineering/source-structure.md)只更新直接相关执行入口，updated日期同步。
- 本任务goal覆盖表与01–06完成证据为权威，不另建执行状态文档；e2e/配置仅在必需接入问题时修改。
- 复用[P1-07证据](../../07/subtasks/08-final-browser-alignment.md#完成证据)、[P1-08证据](../../08/subtasks/06-final-browser-alignment.md#完成证据)、[P1-09证据](../../09/subtasks/05-browser-input-evidence.md#完成证据)和[最终对齐](../../09/subtasks/07-final-alignment.md#完成证据)，不得改写历史结论。

## 验收标准

- [x] AC-10：每项历史证据有版本/相关差异/适用判断，必需失效项有新的真实结果，无无效passed复用。
- [x] AC-01/09/12：pnpm check与完整3项目E2E实际通过，正常场景无意外应用错误，版本/origin/构建可追溯。
- [x] AC-11：受控失败非零/诊断完整，网站不含Playwright或测试入口、无生产写入/调度/原版读取；owned资源清理完成。
- [x] AC-12：工程/结构命令与发现范围、browser准备/限制及链接/元数据准确，不宣称跨浏览器或阶段退出。

## 验证方法

使用pnpm check、01落地的pnpm test:e2e，配置负向回归和产物/diff/link检查。浏览器实跑及条件补测按[browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)；仍有效历史矩阵直接引用，必要事实与新验收分开。证据写本项与既有负责子任务，不创建额外markdown报告。

## 完成证据

### 最终命令与身份

- 2026-10-03，源码/测试交付HEAD`8839ab1`（本项仅维护文档）；Node22.22.0、pnpm12.8.1、Playwright1.63.0、Chrome154.0.8037.95/macOS、Vite8.3.1/TS6.0.3。`pnpm check`通过4类型程序、lint、47文件/1192测试及build；完整`pnpm test:e2e`先当前build再跑18/18（development9、production8、development-headed1），1worker/0retry、无skip。开发/生产固定4173/4174、普通viewport1280×800/DPR1；缩放用480×900，native headed沿实际窗口。
- 普通场景无意外pageerror/console/失败HTTP/请求/UI错误。错误自检的独立child page与WebGL-off具体诊断在各自附件明确列出，不作为正常场景错误忽略；native原始日志为hidden→visible→hidden→visible，暂停tick17、repeat稳定x0.167、fresh后0.367。本轮数字只是观察，不要求宿主tick固定。
- `pnpm install --frozen-lockfile`通过；当前实际prod依赖React19.3.0/React DOM19.3.0/Three0.186.1/Zustand5.0.15，与获批规划基线一致。根锁仅加入Playwright3包，无原工具链/供应链策略升级。
- 生产JS仍`index-BWtf9nnJ.js`（811.01kB/gzip219.34kB，只有既有500kB警告），SHA256为`52c01e6c6613a1e951f85527ad6019409fa4a0bfc0609ccc5974c7b577778609`；source map为`6a71214c4c305887cb45494d1faed196ce333b4d1bd9a8fa29034d8b67bff468`。真实map的58个source无e2e/Playwright/spec；JS/HTML/CSS无测试探针、OSR_E2E或Playwright符号。相对`ec9e666`与最终输入源码`1261ab2`，src与Vite配置无差异，网站源码身份不变。

### 新增自动覆盖／历史证据适用性

| 类别 | 来源、版本与相关差异 | 本轮判断 |
|---|---|---|
| 新增自动入口/观测 | [01](./01-local-e2e-runner.md#完成证据)、[02](./02-readonly-browser-probes.md#完成证据)；开发/生产bootstrap、独立类型/lint与真实probe/错误自检 | 新runner实际运行，非复用历史截图；类型/发现边界保持 |
| 新增DOM/图形/控制/布局 | [03](./03-interaction-render-smoke.md#完成证据)，两构建可信左右≥1s、mover/marker各≥9及±3、N/X/X身份、paused稳定、fresh后4样本≥360ms、宽窄≤1px | 新像素与图像方向测量；不以Canvas存在/旧投影代替 |
| 新增同轮资源 | [04](./04-joint-resource-regression.md#完成证据)，两构建各3visit，同时9键盘/3Session/6render/rAF≤1、预热GPU2/0/1无增长、菜单净0 | 比上游分散资源证据更强；本机6个context扩展均可用并实际lost |
| 新增浏览器replay | [05](./05-browser-replay.md#完成证据)，Node与浏览器相同4tick记录、精确结果/真实match与tick2 mismatch/非法版本 | 补浏览器缺口；不冒称UI录制或跨引擎逐位一致 |
| 新增native与降级 | [06](./06-native-lifecycle-fallback.md#完成证据)，自管headed双tab真实hidden与可信repeat/fresh；独立WebGL-off进程 | 缺必要能力真实非零，旧报告不能替代新runner；受管hasFocus不是window证据 |
| 复用Session首帧/旧回调/故障通知 | [P1-05/07](../../05/subtasks/07-browser-lifecycle-evidence.md#完成证据)，2026-10-02 Chrome154/macOS；最终`8fb36e8`。该版到当前Session/Runtime/browser-host实现无差异，Session目录仅新增P1-08 RollbackError | 保留真实rAF首帧重锚与非BFCache绑定边界；P1-10新native只补自动流程，不重复全部矩阵 |
| 复用DPR/上下文恢复/压力 | [P1-07/08](../../07/subtasks/08-final-browser-alignment.md#完成证据)，Chrome154/macOS，最终`4908e3d`。DPR/布局/外观/相机/webgl-surface与正常绘制路径未变；P1-08仅renderer/browser工厂回滚失败改用RollbackError | DPR1→2→1.5→3及restore、20Restart/50marker证据适用；新wide/narrow和GPU联合已实跑。原已披露“restore后再dispose”Chrome/Three警告边界保留，常规新runner不触发该非必需路径，不伪称已消除 |
| 复用菜单稀有失败/锁存 | [P1-08/06](../../08/subtasks/06-final-browser-alignment.md#完成证据)，Chrome154/macOS、最终`dc20039`；随后P1-09增加输入，SyntheticDemoPage仅添加keyboard prop接线，App/page-flow/lifecycle/rollback的原路径不改，最新Node故障矩阵仍全通过 | 耗尽/回滚/锁存证据按原层次复用；新往返用03/04更强联合观测。稀有故障仍是Node/审阅，不制造browser注入后门 |
| 复用最新window焦点/HMR | [P1-09/05](../../09/subtasks/05-browser-input-evidence.md#完成证据)、[最终对齐](../../09/subtasks/07-final-alignment.md#完成证据)，2026-10-03 Chrome154/macOS、最终源码`1261ab2`与相同网站产物 | 当前App/hook/lifecycle/input/bridge/render及构建配置零差异，直接复用新owner真实Fast Refresh和原生visible窗口blur/focus。P1-07旧hook HMR路径不当成最新owner/input证据；由更晚P1-09结果替代，不需再编辑源码 |
| 复用细粒度输入/回滚/不可见订阅 | P1-05–09各自Node完成证据及本轮1192全部测试；P1-10无生产文件变化 | 取消/旧callback/IME/modifiers/多错/部分登记失败等不重复拆矩阵；所需断言未删、skip或放宽 |

不存在必需证据因本轮生产实现变化而失效；有历史更晚覆盖的部分使用最新版本，不机械复用旧HMR。没有重复原版/真实设备/系统快捷键或完整DPR/压力实验。

### 失败、清理与文档

- [01负向](./01-local-e2e-runner.md#完成证据)与[06能力/协议负向](./06-native-lifecycle-fallback.md#完成证据)复用同轮实际退出结果：断言、构建/启动、occupied origin、missing executable、normal WebGL缺失、真实hidden缺失、CDP错误均非零且保留具体原因；不是只列发现数量。
- 完整任务diff只有E2E、接入配置/开发依赖、Node配置回归及直接相关文档。无生产world写入、内部frame/step、录制/存储接线或新调度；未读取local/、原版/用户数据，未提交二进制/截图/研究输出。未执行P1-12、云/CI/push。
- 成功与受控失败都关闭自有browser/context/target，probe restore在嵌套finally；4173/4174无监听。临时负向fixture与其输出已删除，没有HMR临时代码修改；合成report/trace只在ignored目录。进程核对仅剩开始本请求前00:03已存在的VS Code工具Chrome，不属于本轮，未操作；既有用户服务器/profile未复用或停止。
- 更新[工程约定](../../../../engineering/README.md)的完整入口、浏览器准备/限制、独立四类型程序与诊断；[结构指南](../../../../engineering/source-structure.md)补E2E/support、Node回归与纯模块的边界/证据层次。无新原版事实/冻结决定；STATUS待最终通过后只调整阶段下一步，不放退出勾选。
- rubber-duck核对历史commit差异、产物hash、发现数量、类型与文档边界，无阻塞或非阻塞问题。本项纯文档/核验，不需要实现simplify。文档预检14篇/333链接与锚点、元数据日期与`git diff --check`通过；本项提交前再次核对。
