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

- [ ] AC-04：三项目所有应路由用例实际执行，发现/结果对得上，必需用例无skip；版本/origin/产物/失败与允许环境重跑可追溯。
- [ ] AC-05：真实反馈、像素、输入、控制、资源、native与降级结果完整；判定沿 P1-10 原阈值，Canvas/HTTP存在不代替通过。
- [ ] AC-06：浏览器/Node参考与生产比较器的成功、合法偏差、非法版本结果有真实证据，不承诺普遍跨引擎一致。
- [ ] AC-07：01交来的必需失效浏览器项已补验或明确能力阻塞；有效旧证据有理由，不重复矩阵或将Node故障标browser通过。
- [ ] AC-09/10：rights与生产3文件结果存在；失败/未取得必需观测明确影响和恢复，已定位缺陷交本Goal独立修复项后重验，不能新加白名单或乐观通过。
- [ ] AC-14：自有browser/context/targets/probes/server/临时文件清理，HMR编辑还原；所有测试仅合成，无用户数据操作或残留实现差异。

## 验证方法

- 用现有普通/production/headed runner，沿P1-10可信按键、宽窄布局误差、像素容差、timer-only rAF/松键采样和三往返资源判据；具体阈值引用原 Spec，不重新选择。
- 正常WebGL与独立禁用环境分开，原生 hidden 使用既有CDP路线；缺必要能力不能getter/synthetic事件代替。扩展缺失保留原契约的context-loss未验证注释，不增设设备门槛。
- 仅必需失效项用 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)补验；所有临时源码编辑须还原。无持久实现变更，不需代码 simplify；产物/源码变化交回01及相关检查，不用旧hash掩盖。

## 完成证据
