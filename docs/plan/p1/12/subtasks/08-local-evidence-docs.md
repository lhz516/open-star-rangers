---
type: plan
status: active
phase: P1
task: "12"
subtask: "08"
updated: 2026-10-03
---

# 08 — 当前仓库实测、人工审阅与维护文档

**契约来源：** [Spec](../spec.md) 的 S-07；AC-08 至 AC-15。
**依赖：** 01, 02, 03, 04, 05, 06, 07。
**执行状态：** 仅由 [Goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 用当前最终源码/依赖实际运行pnpm exec vitest run tools/compliance、pnpm check及新pnpm check:compliance；记录源码版本/当前diff身份、manifest/项目锁/构建指纹、四scope counts、包/平台覆盖及实际shipped集合。
- 逐项核对当前包归属/许可全文/NOTICE与产物，验证lightningcss相关MPL是否真not-distributed；源码映射附带内容也算分发，不凭devDependency判断。检查生成LICENSE/THIRD-PARTY-NOTICES/inventory可读取且无需个人绝对路径/时间噪声。
- 人工审阅完整任务新增/修改文件、来源与网站产物（只合成/自有/合法第三方声明，不访问local）：hash只匹配manifest覆盖的完整文件，未覆盖原版、片段/转换内容与首次公开确认仍有边界。保留此人工结果，不将其包装成法律保证。
- 更新工程命令、工具指南及README使用入口：独立/聚合检查、报告字段/错误语义、实际分发判据、默认离线、忽略未跟踪规则、index分开扫描、manifest覆盖限制、P5后续公开审核。事实只链接original权威，不复制真实hash清单。
- 05站点说明/06静态声明按browser-testing仅验证相关DOM/可访问性、本地预览文件可读取，开发/生产菜单保持，不重跑P1-08/09玩法/GPU。自有server/context/fixtures清理，报告不进源码/网站。
- 按[简化](../../../../../.agents/skills/simplify/SKILL.md)只清理当前文档和必要测试接入，不把缺口留给最终验证实现。

## 不包含

不补录原版hash、不读取原版试命中，不授权发布/名称/法律结论；不建CI/云、不改private、不重做P1-01或游戏测试矩阵。

## 关键文件与契约

- 现有[工程约定](../../../../engineering/README.md)、[工具指南](../../../../guides/tools.md)、05新增README更新真实命令/输出/限制，文档updated同步。
- 本任务goal/subtask证据记录真实结果，不另建独立review报告；只读[manifest](../../../../original/manifest.md)、[政策](../../../../decisions/ADR-0008-mit-and-dependency-licenses.md)。
- 当前tools/compliance/、网站App与dist生成物为人工审阅表面；共享P1-10改动保持完整，不并行覆盖。

## 验收标准

- [ ] AC-14/15：当前完整check/compliance及目标Vitest全通过，源码/锁/manifest/build身份与所有范围/平台覆盖明确。
- [ ] AC-08至11：当前分发包/资源和map许可逐项对照，MPL归属有事实依据，3生成文件稳定/可读，根/站点授权边界不变。
- [ ] AC-13/14：人工来源/全任务文件/产物审阅及hash能力限制记录，无原版/个人信息/秘密或用户目录读取，全部owned资源收尾。
- [ ] AC-15：工程/工具/项目说明命令、JSON、链接/元数据准确，Core/Session/原版规则不变、无CI/云或阶段退出声明。

## 验证方法

目标Vitest、pnpm check、pnpm check:compliance实际运行；包文本/分发映射/完整diff与产物审阅、文档/链接检查。相关网页/静态文件按[browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md)取证及按所有权清理，不用浏览器合成内容代替许可正文义务，不访问原版资源。

## 完成证据
