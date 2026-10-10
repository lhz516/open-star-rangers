---
type: plan
status: active
phase: P3
task: "04"
subtask: "09"
updated: 2026-10-09
---

# 09 — React 页面与应用接线

**契约来源：** [spec](../spec.md) 的 S-03、S-04、S-11（界面部分）、S-10（应用外壳中的演示入口），[应用流程](../spec.md#应用流程)、[开始资格](../spec.md#开始资格)、[任务开始配置](../spec.md#任务开始配置)、[衔接占位](../spec.md#衔接占位)、[任务菜单、暂停与退出](../spec.md#任务菜单暂停与退出)、[开发诊断](../spec.md#开发诊断)的生产边界、[缺省与标注](../spec.md#缺省与标注)、[合成演示退役](../spec.md#合成演示退役)的“文字”；为 AC-08、AC-09、AC-12、AC-14、AC-15、AC-19 提供实现。
**依赖：** 05, 06, 07。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **页面**（计划新增 `src/ui/mission/`）：
  - 开始配置页（G-04、G-07）：任务组与槽位、固定难度 19；目标与限制的项目说明（集中一处，标明项目文字、链接事实来源并注明置信度，说明本构建尚未实现这些规则，不简化为“最后一架敌机即胜利”或“任何阶段第三次损失即失败”）；僚机列表按名单次序显示 `nameCandidates`（纯文本；无候选显示项目编号；多候选列出候选）与“无僚机”；开始与返回主菜单；创建失败以 alert 显示类别、路径与原因。
  - 占位页（G-02/1、G-02/2）：功能描述的缺省标注、G ID、出发变体（solo/wingman）；打开时焦点移到跳过按钮；Enter、Space、Esc 只在本占位范围内、只接受新的按下；不把上一页的按键尾事件交给下一页。
  - 任务壳：游戏画面区域（留给 P3-12、P3-13），画面之外的项目状态栏（phase、暂停原因、不能继续的原因、G-01 无音乐）；暂停/继续与任务菜单控件；故障或停止提示（原因不含导入内容，重开与返回）；只读 `data-owner`、`data-run`、`data-tick` 属性；如实说明“正式运行骨架、尚非完整可玩切片”。
  - 任务菜单（G-07）：替代画面，继续、重开任务、返回主菜单；进入聚焦标题。
  - 界面中的缺省文字集中在计划新增的 `src/ui/mission/slice-gaps-copy.ts`，以 G ID 标识。
- **主菜单：** [MainMenuPage.tsx](../../../../../src/ui/pages/MainMenuPage.tsx) 去掉 `Start synthetic demo`，增加开始任务入口：满足资格时可用，否则禁用并以说明给出原因；返回时焦点规则（可用入口或菜单标题）。
- **应用外壳与流转：** [app-flow.ts](../../../../../src/app/flow/app-flow.ts) 以 `mission` 画面（进入次数、任务所有者清理锁存）取代 `demo`；[App.tsx](../../../../../src/app/App.tsx) 移除演示屏与演示槽位，接入任务槽位；权利与隐私声明不再提合成演示，其余声明不变、不新增法律保证。计划新增 `src/app/MissionScreen.tsx`（独立模块，使页面的 Fast Refresh 不重建外壳）与 `src/app/composition/use-mission-owner.ts`（打开与关闭槽位、在旧所有者释放后创建新所有者）。按 05 的收尾顺序 helper 调整 [use-resource-holder.ts](../../../../../src/app/composition/use-resource-holder.ts)，保证外壳卸载与 Fast Refresh 时先释放任务、再销毁 holder。
- **端口与入口：** [ports.ts](../../../../../src/app/ports.ts) 增加 04 的端口；[browser-ports.ts](../../../../../src/app/browser-ports.ts) 提供浏览器实现；计划新增 `src/app/app-version.ts` 给出 producer（应用名、包版本与构建模式，1–128 码元）。开发构建（`import.meta.env.DEV`）接入 07 的面板、帧计时与录制选项，生产构建以编译期分支剔除它们，不读 URL 参数或全局开关。[app-entry.test-support.tsx](../../../../../src/app/app-entry.test-support.tsx) 增加可注入的种子序列等测试端口；新增查询键同步 [e2e-network-policy.ts](../../../../../tools/e2e-network-policy.ts) 的 `TEST_ENTRY_QUERY` 及其测试。
- 合成演示的模块本身保留到 13 删除；本项只断开应用对它们的引用。

## 不包含

- E2E 用例（10–12）；合成模块与 lint 规则的删除（13）；`slice-gaps.md` 文档（15）。
- 原版键位绑定、飞行画面、HUD 与音频（P3-05、P3-12 至 P3-14）。

## 关键文件与契约

- 修改：[App.tsx](../../../../../src/app/App.tsx)、[app-flow.ts](../../../../../src/app/flow/app-flow.ts)、[MainMenuPage.tsx](../../../../../src/ui/pages/MainMenuPage.tsx)、[ports.ts](../../../../../src/app/ports.ts)、[browser-ports.ts](../../../../../src/app/browser-ports.ts)、[use-resource-holder.ts](../../../../../src/app/composition/use-resource-holder.ts)、[app-entry.test-support.tsx](../../../../../src/app/app-entry.test-support.tsx)、[e2e-network-policy.ts](../../../../../tools/e2e-network-policy.ts)、[app.css](../../../../../src/app/app.css)、[main.tsx](../../../../../src/main.tsx)（如需）。
- 计划新增：`src/ui/mission/**`、`src/app/MissionScreen.tsx`、`src/app/composition/use-mission-owner.ts`、`src/app/app-version.ts`。
- 消费：05 的任务所有者与槽位、06 的 store 与 hook、07 的面板与帧计时。

## 写入范围

- `src/ui/mission/**`：计划新增的页面与缺省文字。
- `src/ui/pages/MainMenuPage.tsx`：开始入口取代演示入口。
- `src/app/App.tsx`：外壳接线与声明文字。
- `src/app/MissionScreen.tsx`：计划新增的任务画面模块。
- `src/app/flow/app-flow.ts`：`mission` 画面。
- `src/app/flow/app-flow.test.ts`：对应测试。
- `src/app/composition/use-mission-owner.ts`：计划新增的 React hook。
- `src/app/composition/use-resource-holder.ts`：收尾顺序。
- `src/app/ports.ts`：端口扩展。
- `src/app/browser-ports.ts`：浏览器实现接线。
- `src/app/app-version.ts`：计划新增的 producer 标识。
- `src/app/app-entry.test-support.tsx`：测试端口注入。
- `src/app/app.css`：页面样式。
- `src/main.tsx`：必要的入口接线。
- `tools/e2e-network-policy.ts`：新增查询键。
- `tools/e2e-network-policy.test.ts`：对应测试。

## 验收标准

- [ ] 主菜单的开始入口按资格可用或禁用并说明原因；不再出现 `Start synthetic demo`；页面不声称原版玩法已可玩。
- [ ] 介绍 → 配置 → 出发 → 飞行 → 菜单/暂停 → 重开或返回的页面与 05 的流程一致；焦点、标签、Tab 顺序与 alert 符合 spec；按键尾事件不触发下一页。
- [ ] G-01、G-02/1、G-02/2、G-04、G-06（重开与返回）、G-07 的标注在界面可见，文字集中在 `slice-gaps-copy.ts` 并以 G ID 标识。
- [ ] 开发构建显示诊断面板并开启录制；生产构建的代码路径不包含面板、日志、命令编辑与下载入口（由 12 检查产物）。
- [ ] 外壳卸载与 Fast Refresh 时任务先于 holder 释放；`app-flow` 的 Node 测试覆盖 `mission` 画面、锁存与焦点。
- [ ] `pnpm check` 通过（含 `tools/e2e-network-policy.test.ts`）。

## 验证方法

- Node：`pnpm exec vitest run src/app src/ui tools/e2e-network-policy.test.ts`。
- 浏览器流程按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 用合成任务包在开发服务器上冒烟检查一次（入口、页面、焦点、标注）；完整 E2E 由 10–12 完成。依赖演示的既有 E2E 在本项之后暂时失败，由 10–12 迁移，执行记录中注明。
- 不适用原版对照。

## 完成证据
