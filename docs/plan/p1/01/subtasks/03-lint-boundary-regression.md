---
type: plan
status: active
phase: P1
task: "01"
subtask: "03"
updated: 2026-10-01
---

# 03 — Lint 依赖、扩展名与 Core 同步边界

**契约来源：** [spec](../spec.md) 的 S-02、S-03；AC-03、AC-04、AC-09；边界矩阵和技术决定 6。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 02 的测试文件增加 ESLint 虚拟输入检查，使用真实根配置和逻辑 filePath，不提供测试专用规则 override。
- 纯模块和 Core 规则统一覆盖被类型项目接纳的 `.ts`、`.tsx` 非测试源。选用扩展既有 ESLint 作用域的方式；app `.tsx` 与已有 `.test.ts` 例外保持原责任。
- 限制 React/React DOM、Zustand、Three.js、idb、idb-keyval 的包根及全部子路径。用值导入、type-only 导入和 re-export 对照，直接断言 `no-restricted-imports`，不依赖安装这些未来依赖。
- 限制 app/render/ui/platform/workers 的相对目录入口、入口文件与不同深度的子模块；普通纯模块间导入和 app/工具到纯模块方向合法。不要为方便全面禁止所有相对导入。
- 覆盖 Core 直接随机数、时间、定时器、rAF、await；按用户确认补 `async` 声明、表达式、箭头、对象/类方法的语法规则，即使函数没有 await 也拒绝。
- 用纯数据/确定性运算、允许消费层 host API 及测试能力作正向对照。宿主调度限制只用于 Core，不误伤 Runtime/app。
- 将此前探测的缺口与新回归逐一关联。Promise 链/动态绕过只记录限制，不增通用静态分析。

## 不包含

- 不新增运行时、实体或模拟；不安装 Zustand/Three.js/存储库；不改变解析器与应用壳。
- 不将纯模块 lint 例外扩为生产豁免，不禁止允许层的异步工作。
- 检查链自我失败/发现验证由 04 负责。

## 关键文件与契约

- [eslint.config.js](../../../../../eslint.config.js)：作用域、根/子路径、应用层目录入口与 async 语法修正。
- 02 新建的 `tools/engineering-boundaries.test.ts`：增加 lint 矩阵，复用必要检查函数；非新公共 API。
- [node 类型项目](../../../../../tsconfig.node.json)：新测试的实际类型检查入口，不修改其职责。

## 验收标准

- [ ] AC-03：三个纯模块位置及 `.ts`/`.tsx` 对应样本受目标 lint 限制；规则未应用/ignored/解析失败不能替代目标 ruleId。
- [ ] AC-03：包根/子路径的值、类型导入和 re-export 以及应用层入口/子模块被拒绝；已知缺口均有用例。
- [ ] AC-03：Core 所列直接 host API、await 和所有 async 函数形式被对应规则拒绝，不以“类型报错”替代。
- [ ] AC-04：允许依赖方向、app `.tsx`、测试例外和消费层 host API 对照无相关误报。
- [ ] AC-09：只使用静态合成输入，未产生生产临时源或运行其中逻辑。
- [ ] 针对性 `pnpm test -- tools/engineering-boundaries.test.ts` 与完整 `pnpm check` 通过；02 用例保持有效。

## 验证方法

- 从真实 ESLint 结果取得 filePath、ruleId、消息；对正向代码检查错误集合，而非只检查某个禁用规则不存在。
- 使用上列两条检查命令；对配置/测试变更调用 [simplify](../../../../../.agents/skills/simplify/SKILL.md)，明确本 subtask 范围，随后重跑。
- 不进行浏览器/原版验证。STATUS 不成立勾选保持至 05 完成证据汇总。

## 完成证据
