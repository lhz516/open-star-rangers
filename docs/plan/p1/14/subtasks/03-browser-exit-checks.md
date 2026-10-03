---
type: plan
status: active
phase: P1
task: "14"
subtask: "03"
updated: 2026-10-03
---

# 03 — 完整浏览器退出回归与必需补验

**契约来源：** [Spec](../spec.md) 的 S-02、S-03；AC-04 至 AC-07、AC-09、AC-10、AC-14。
**依赖：** 01。
**执行状态：** 仅由 [Goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)预检已有浏览器/隔离/端口，核对 `pnpm exec playwright test --list` 与当前路由，然后完整运行 `pnpm test:e2e`；记录候选、browser/OS、origin、viewport、实际通过/失败/未运行及构建身份。
- 用已有真实断言证明菜单/导入占位、React/键盘 Core 接受/拒绝、投影/合成像素、失焦/清键、暂停/继续/换run、布局与联合生命周期/rAF/监听/GPU，不新增探针或生产后门。
- 核对开发 replay 的同版本 Node 参考/浏览器 events/checkpoints精确相等、`{match:true}`、tick2 checkpoint偏差及非法format/version拒绝；不启用 UI 录制。
- 核对 headed 原生 hidden→visible及显式继续、独立WebGL-off降级；包含 P1-12 rights DOM与production生成文件可读性，不能把开发服务当发布物。
- 对01识别的必需失效浏览器证据有界补验；有效 HMR/原生窗口焦点/DPR/上下文/压力证据直接复用，不再重跑旧全矩阵。补验结果和01适用性链接闭合。
- 保留首次失败；只按 Spec 技术决定5对查明的环境原因整命令重跑，不改配置/断言，不以偶发重跑成功抵消原因不明的失败。缺陷定位后按 [Goal 聚焦修复规则](../goal.md#按需聚焦修复)新增独立修复项，本项在修复后以原判据重验、保留新旧结果并更新受影响历史适用性；所有自有资源与临时HMR编辑收尾。

## 不包含

- 不新增或持久修改应用、runner、测试断言、依赖、重试或skip；仅失效HMR补验可临时编辑并完整还原。不伪造时间/hidden/焦点，不停止用户进程或清个人profile数据。
- 不验证系统快捷键拦截、发布设备矩阵、原版保真、法律或云部署；不替代04全文/实际归属审阅。

## 关键文件与契约

- 只读[Playwright 配置](../../../../../playwright.config.ts)、[环境](../../../../../e2e/support/environment.ts)、[错误/探针 fixture](../../../../../e2e/support/browser-test.ts)与[P1-10 判据](../../10/spec.md#验收标准)；本项只写证据及本任务 tracker。
- 现有[交互/图形](../../../../../e2e/interaction-render.spec.ts)、[联合资源](../../../../../e2e/joint-resources.spec.ts)、[replay](../../../../../e2e/browser-replay.spec.ts)、[native](../../../../../e2e/native-lifecycle.spec.ts)、[WebGL-off](../../../../../e2e/webgl-unavailable.spec.ts)、[rights](../../../../../e2e/compliance-text.spec.ts)、[production assets](../../../../../e2e/compliance-assets.spec.ts)及bootstrap/probe用例全部按配置路由。
- replay沿 `osr-synthetic-replay`/1、seed0/50Hz/四tick/checkpointInterval1；默认App seed0/60Hz不录制，不能用改世界来取得结果。

## 验收标准

- [x] AC-04：三项目所有应路由用例实际执行，发现/结果对得上，必需用例无skip；版本/origin/产物/失败与允许环境重跑可追溯。
- [x] AC-05：真实反馈、像素、输入、控制、资源、native与降级结果完整；判定沿 P1-10 原阈值，Canvas/HTTP存在不代替通过。
- [x] AC-06：浏览器/Node参考与生产比较器的成功、合法偏差、非法版本结果有真实证据，不承诺普遍跨引擎一致。
- [x] AC-07：01交来的必需失效浏览器项已补验或明确能力阻塞；有效旧证据有理由，不重复矩阵或将Node故障标browser通过。
- [x] AC-09/10：rights与生产3文件结果存在；失败/未取得必需观测明确影响和恢复，已定位缺陷交本Goal独立修复项后重验，不能新加白名单或乐观通过。
- [x] AC-14：自有browser/context/targets/probes/server/临时文件清理，HMR编辑还原；所有测试仅合成，无用户数据操作或残留实现差异。

## 验证方法

- 用现有普通/production/headed runner，沿P1-10可信按键、宽窄布局误差、像素容差、timer-only rAF/松键采样和三往返资源判据；具体阈值引用原 Spec，不重新选择。
- 正常WebGL与独立禁用环境分开，原生 hidden 使用既有CDP路线；缺必要能力不能getter/synthetic事件代替。扩展缺失保留原契约的context-loss未验证注释，不增设设备门槛。
- 仅必需失效项用 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)补验；所有临时源码编辑须还原。无持久实现变更，不需代码 simplify；产物/源码变化交回01及相关检查，不用旧hash掩盖。

## 完成证据

- 2026-10-03：按browser-testing预检工具能力及既有runner后，实际 `pnpm exec playwright test --list`发现9文件/21项（development10、production10、development-headed1）；继而完整 `pnpm test:e2e` fresh build及21/21通过，exit0、1worker/0retry、skipped0/flaky0/unexpected0。首次运行通过，无环境重跑、断言/config修改或补丁。测试前空闲端口，runner严格启动自有服务器，实际browser导航确认应用，并非HTTP代替验收。
- 候选 `831d231` +本Goal文档；Chrome154.0.8037.95/macOS arm64、Playwright1.63.0、Node22.22.0。开发 `http://127.0.0.1:4173`、生产 `http://127.0.0.1:4174`；普通隔离context 1280×800/DPR1，窄布局480×900；native使用既有headed/CDP自建context/两target与实际窗口、移除三项background禁用默认参数。WebGL-off每项目另启隔离browser，不操作个人profile。

| 验收项 | 设置／原判据 | 当前观测／结果 |
|---|---|---|
| AC-05 菜单、控件、反馈与像素 | 两构建可信左右各≥1s；mover/marker≥9、颜色±3；N/X/X；宽窄≤1px | interaction-render两项目均passed：投影与实际图像中心同向、接受/接受/拒绝身份唯一递增、pending清空、marker出现/消失和实体数一致；同canvas/run缩放，buffer与布局公式完全相符 |
| AC-05 控制／隔离 | P和按钮暂停；松键/失焦/换run后首次新投影起四样本≥360ms、tick增/x不变；trusted repeat不恢复 | 两构建控制测试passed；菜单/导入/Return/面板不触发游戏键，原生Enter/Space/Tab正常；导入明确未实现、无文件输入/画布 |
| AC-05 联合资源／StrictMode | 两项目各三visit、同owner Restart/Exit→Start；9键盘/3Session/6render、timer-only rAF≤1、预热GPU无增长 | 每visit计数与回调身份均passed；GPU均2/0/1，每次返回菜单后资源净0、全部旧canvas断开；第三次返回后的menu快照两项目各3个已释放context，扩展全部可用且lost=true，不指仍运行的live快照，无“未验证context-loss”annotation |
| AC-05 native | 原生hidden/visible、三真实rAF与400ms观察后仍暂停；显式可信P及repeat/fresh | 日志hidden→visible→hidden→visible；hidden和visible-paused均tick18/x.217；显式继续后四样本ticks19/25/31/43、x均.217，fresh x.417；keys全部trusted且repeat=true实际存在，passed |
| AC-05 WebGL-off | 独立禁用进程；两visit Core命令/控件/重进仍工作 | 两构建getContext(webgl2)=null、unavailable原错、无canvas、N accepted、暂停/继续/返回/重进passed；未以正常WebGL代替 |
| AC-06 replay | seed0/50Hz/4tick/interval1、同版本Node参考与生产函数 | events/checkpoints精确相等；真实`{match:true}`；合法hash变化`{match:false,tick:2,kind:'checkpoint'}`；format/version分别抛CoreInputError，passed。默认App仍60Hz不录制 |
| AC-09 rights／生产文件 | 两origin权利段及production三文件导航/MIME/全文可读 | DOM与Tab/Import/Returnpassed；生产3文件HTTP200、JSON/text MIME，7shipped身份及全文长度1487/124340；不把dev当发布物，不替代04人工全文审阅 |
| AC-07 历史补验 | [01适用性](./01-candidate-evidence-map.md#历史适用性仅影响分析)逐类判断 | 无必需失效项；Session首帧/最新window/new-owner HMR/DPR/restore/压力按01理由复用，无临时编辑或旧全矩阵重跑；Node稀有故障仍仅Node |

- replay附件源SHA256 `8ae8d45e028690d835c08c57e2c7bb5225456990fd787010c8e53a3716889d8b`、recordSHA256 `bf362554b22a11bcf097eba40cd5e4a6b27cb70e12046a95ad543b79f4c5713a`；只证明此版本/样本，不推广跨引擎。build后JS/map与[02身份](./02-engineering-replay-checks.md#完成证据)完全相同，inventory文件SHA256 `bdd1b63d4c75b000af11cc5de949f0d44c3d771443b662461381bdb8c88b17c7`。
- 当前HTML报告实际stats expected21/unexpected0/flaky0/skipped0；常规browser-errors全部errors=[]/allowed=[]。probe独立child的受控console/exception/HTTP故障是自检，WebGL-off仅既有精确Three创建诊断及favicon404白名单，native仅favicon404；无扩大allowlist掩盖应用错误。
- 收尾：runner关闭自有browser/context/CDP targets/服务器，fixture finally恢复probe，4173/4174无监听；源码/config/依赖无本项diff。未临时HMR编辑、未读原版或个人存储。合成HTML/trace仅ignored目录，未入库。报告辅助读取曾误选HTML内置图片base64，改选明确zip模板后成功读取；这不是验收运行失败或重跑。
- 文档影响：runner/操作/阈值未变，既有说明除01列出的早期滞后外准确，05统一更正；无需新增工具/ADR/原版记录或实现simplify。证据先保存，最终06文档提交。
- rubber-duck核对实际报告/阈值/hash无证据正确性缺口；补本条审查记录并在审查后改tracker。其“第三个context仍live”建议读取了运行中快照；重新核对返回后menu附件，两项目各3context确实全部断开/lost=true，保留真实结论并明确快照时点，避免混淆；不改runner或重跑。
