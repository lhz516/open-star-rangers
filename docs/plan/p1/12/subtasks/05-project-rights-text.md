---
type: plan
status: active
phase: P1
task: "12"
subtask: "05"
updated: 2026-10-03
---

# 05 — 项目许可证与站点权利边界

**契约来源：** [Spec](../spec.md) 的 S-07；AC-11、AC-13。
**依赖：** 无。
**执行状态：** 仅由 [Goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新建根LICENSE采用默认MIT完整标准文本，以package已有author Hanz及当前年份注明自有版权；README说明MIT只覆盖自有代码/文档/合成资源，不覆盖或授予原版资源权利，用户须自行合法取得原版。
- README提供本地工程入口并链接工程/工具权威文档，不复制hash/原版行为事实。说明当前只是非原版玩法的合成工程演示、独立项目非官方授权，不宣称严格clean-room、名称审核/首次公开负责人确认已通过。
- 在现有App外壳权利说明处窄幅增加明确原版权利边界，保持菜单/输入/生命周期不变。本文案与06生成的LICENSE.txt/第三方notice分别负责自有与第三方权利；本项不提前宣称尚不存在的CLI可用。
- 按[简化](../../../../../.agents/skills/simplify/SKILL.md)仅清理本项文字/接线，不重构页面。相关DOM/可访问性用合成浏览器核对，不重跑玩法/GPU。

## 不包含

不改变private/license政策或首次公开待确认状态、不加入官方标识/原版图片、不做名称/法律研究；notice生成与链接产物可读取由06/08完成。

## 关键文件与契约

- 计划新增根 LICENSE、README.md；文档中文说明、许可证标准英文全文。
- 现有[App](../../../../../src/app/App.tsx)只调整权利说明文字；只读[package.json](../../../../../package.json)的license/author/private及[ADR-0008](../../../../decisions/ADR-0008-mit-and-dependency-licenses.md)。

## 验收标准

- [x] AC-11：根文本完整准确，README/站点明确MIT自有范围/无原版授权/非官方合成演示，保留公开前确认，无法律保证。
- [x] AC-11/13：private及原版事实不变，UI不包含原版内容，menu/input/control行为不变。
- [x] 根/文档链接有效；pnpm check及站点相关DOM/可访问性核对通过，不声称06声明已完成。

## 验证方法

标准文本/版权信息/授权边界与链接人工审阅；App文字变化按[browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)在自有本地context核对可读DOM和既有菜单入口。无原版/实机比较；默认政策不等于首次公开授权。

## 完成证据

- 2026-10-03：根[LICENSE](../../../../../LICENSE)完整标准MIT，版权2026 Hanz与package author一致；[README](../../../../../README.md)中文说明仅自有代码/文档/合成资源、第三方另保留义务、原版需用户自行合法取得且不授予权利，明确独立非官方、非严格clean-room、名称/首次公开确认及法律保证未通过，private只指package元数据。
- [App](../../../../../src/app/App.tsx)只加不可聚焦的静态rights段落，无控件/生命周期/规则变更，现有标注与原始说明保留；未提前链接未生成声明或宣称合规CLI可用。根文档只链接工程/原版权威，不复制hash/行为。
- browser-testing下[专用DOM回归](../../../../../e2e/compliance-text.spec.ts)在开发4173/生产4174、Chrome154/macOS隔离context2/2通过：声明真实可读、首Tab仍Start/第二Tab仍Import、Enter进入heading/未实现占位、Return与菜单可用、无canvas/file input及意外错误。没有重跑玩法/GPU；runner收尾自有服务器/browser/context。
- `pnpm check`53文件/1263测试、type/lint/build通过；网站JS变化仅静态文字（index-BF0vE3hr.js）。rubber-duck无阻塞，建议显式无法律保证已加入README；simplify限定根文本/App段落/专用测试，复用已有error fixture，不抽象页面。
- 文档影响：根README为贡献者入口，所有链接有效，updated正确；工程/工具命令与键位/架构不变，06/07/08完成后才增加声明/合规用法。原版记录、MIT/private政策及阶段结论不变。
