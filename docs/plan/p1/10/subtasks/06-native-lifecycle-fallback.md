---
type: plan
status: active
phase: P1
task: "10"
subtask: "06"
updated: 2026-10-03
---

# 06 — 原生后台与 WebGL 降级持久回归

**契约来源：** [Spec](../spec.md) 的 S-02、S-05；AC-08、AC-09、AC-11。
**依赖：** 02。
**执行状态：** 仅由 [Goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 开发headed项目自管启动已有Chrome，移除Spec决定7的3个disable-background默认参数，用Target.createBrowserContext及两个真实标签页完成原生visible→hidden→visible；通过已验证的CDP非扁平session路线，逐项检查协议错误/exceptionDetails。
- 真实应用页面先运行并持轴，切另标签页取得document原生hidden及Session paused/hidden，隐藏tick稳定；返回visible仍paused，显式可信P后旧repeat=true不移动，新按下才移动。日志必须证明原生visibilitychange，采样沿用02。
- 独立浏览器启动flags禁用WebGL（不仅换context），在隔离context验证具体unavailable原因、可信N得到Core accepted、P/面板暂停继续、返回清理再进入。开发/生产普通origin共用该降级用例；正常画面项目仍要求真实WebGL2。
- 预期WebGL创建诊断按该场景具体白名单，其他pageerror/actionError/sessionError/失败请求默认失败；缺浏览器/WebGL2/真实hidden能力不能skip或mock成绿。子进程/协议失败保持非零，所有自有target/context/browser在失败亦收尾。
- 按[简化](../../../../../.agents/skills/simplify/SKILL.md)检查CDP helper与失败传播，不新增生产错误注入入口。

## 不包含

不改visibility getter、不合成hidden、不用受管hasFocus证明窗口；窗口/HMR既有证据交07复用。不开启P5设备矩阵、浏览器下载或全屏/锁定。

## 关键文件与契约

- 计划新增 e2e/native-lifecycle.spec.ts、e2e/webgl-unavailable.spec.ts、e2e/support/native-lifecycle.ts；按本项新增文件精确分配01配置中的项目，必要修改仅限配置/helper。
- 只读[已验证CDP路线](../../../../engineering/README.md#已验证的-cdp-自动化路线)、[P1-09真实输入证据](../../09/subtasks/05-browser-input-evidence.md#完成证据)。
- 只读[会话](../../../../../src/app/session/synthetic-session.ts)、[键盘消费者](../../../../../src/ui/game/synthetic-keyboard-input.ts)、[降级文案](../../../../../src/ui/render/SyntheticRenderView.tsx)。

## 验收标准

- [x] AC-08：新runner自身取得真实hidden，自动暂停/返回不自动继续、旧repeat不移动/新按下有效，未合成事件或覆盖getter。
- [x] AC-09：独立WebGL-off浏览器中具体原因可见，Core接受N、控制有效、返回释放并可重进；限定诊断白名单不隐藏其他错误。
- [x] AC-11：受控能力/协议失败非零且定位原始原因；真实hidden未发生时验收保持未通过，不用历史passed替代。
- [x] pnpm check和本项headed/降级用例实跑通过，自有浏览器/targets/profile/进程收尾。

## 验证方法

严格按[browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)与Spec决定7/AC-08、09；真实可信Input通道记录repeat/isTrusted，稳定样本用02的方法。协议错误/exceptionDetails均显式检查；缺桌面能力可尝试有界已知路线，仍无证据则blocked。无目标实机/原版对照。

## 完成证据

- 2026-10-03：[native-lifecycle](../../../../../e2e/native-lifecycle.spec.ts)、[CDP relay](../../../../../e2e/support/native-lifecycle.ts)、[WebGL-off](../../../../../e2e/webgl-unavailable.spec.ts)实际3/3通过。Chrome154/macOS，原生headed为development4173，WebGL-off分别4173/4174。沿用Spec指定3项ignoreDefaultArgs，自管Chrome、自有Target.createBrowserContext/两真实tab、flatten:false中继，逐个检查protocol error/exceptionDetails。
- AC-08：日志`hidden → visible → hidden → visible`（最初创建于后台）；真实持轴运行后切alternate取得hidden/paused/hidden，tick17在400ms隐藏与回visible后3真实rAF+400ms均不变。显式可信P才恢复；autoRepeat=true/trusted右键后4样本跨≥360ms、tick增长而x0.167不变；keyup→fresh down后x0.367，所有记录isTrusted。正常WebGL2 ready也明确要求。数值随宿主时间变化，不是固定tick承诺。
- AC-09：独立browser进程使用3项disable-WebGL flags，实际getContext为null。两构建各2轮进入unavailable，显示具体`Error creating WebGL context`与session不受影响；可信N仅一Core accepted及marker投影，P/按钮Pause/Resume实际工作，暂停350ms tick不变。返回输入/Session/render活跃登记净0、pending rAF0、Start可用并再进入，不锁存。
- 默认错误fixture对所有普通项目收集真实console/pageerror/request/HTTP/UI错误；WebGL-off只允许当前Three的3个具体创建诊断文本，逐项写allowed附件。最初真实新Three额外诊断导致测试非零，核对原始文本后缩窄白名单而非整体忽略console。native从Runtime/Network/Log采集，成功/失败都附错误记录，正常场景无意外错误。
- AC-11受控独立临时fixture：missing-normal-WebGL实际返回null、CDP未知方法实际-32601均runner退出1，场景与原始原因明确；单实际前台tab不给alternate时，真实visibility一直visible，5s后`Required native hidden...last observation: "visible"`、退出1。没有合成hidden或覆盖getter。主用例另检查evaluate异常原始原因，未知协议也没有成功fallback。临时fixture不在仓库/普通命令，完成后删除；所有自有context/targets/browser在finally释放。
- `pnpm test:e2e native-lifecycle.spec.ts webgl-unavailable.spec.ts`3/3通过；受影响probe-contract合并实跑共9/9通过；`pnpm check`通过（47文件/1192测试、type/lint/build）。4173/4174结束无监听，产物仍index-BWtf9nnJ.js。rubber-duck无阻塞发现；simplify限定本项新文件与helper窄改，将CDP click复用同一evaluate/exception处理，默认fixture的restore移入嵌套finally确保断言失败也执行，不改生产层。
- 文档影响：工程约定补持久headed命令、独立WebGL-off/限定诊断与可选context扩展限制。原生window focus/HMR仍由07检查旧证据，受管hasFocus不被冒称新证据；无原版事实、ADR或阶段退出变动，结构/完整覆盖由07补齐。
