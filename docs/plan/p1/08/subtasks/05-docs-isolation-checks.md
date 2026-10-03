---
type: plan
status: active
phase: P1
task: "08"
subtask: "05"
updated: 2026-10-02
---

# 05 — 工程文档与隔离检查

**契约来源：** [spec](../spec.md) 的 S-08、AC-08、AC-10（文案与焦点接线的审阅部分）、AC-14，验证策略中的“工程检查”。
**依赖：** 01, 02, 03, 04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 同步[工程约定](../../../../engineering/README.md)：页面流转、演示生命周期接线（一次性 start、先释放后创建、清理失败锁存）、owner 清理失败记录与渲染回滚信号、菜单的验证方式；更新 P1-07 中“恢复入口归 P1-08”的表述为现状。
- 同步[源码结构指南](../../../../engineering/source-structure.md)：新增 `app/flow/`、`ui/pages/` 与新的 composition 文件，更新 App 描述。
- 执行 AC-08 生产源码检索（忽略注释），列出命中；审阅 owner 与演示画面调用点只使用 `SYNTHETIC_DEMO_OPTIONS`。
- 审阅 failed/faulted/初始化失败/锁存的 React 文案与焦点接线，以及 02 的浏览器表面回滚信号产生点，记录为审阅证据（不写成浏览器 passed）。
- 运行 AC-14 的工程检查与依赖差异检查；确认阶段索引链接正确。

## 不包含

- 任何功能代码改动；发现缺陷时由 execute-goal 新增修复子任务。
- 浏览器证据（06）。

## 关键文件与契约

- [docs/engineering/README.md](../../../../engineering/README.md)、[docs/engineering/source-structure.md](../../../../engineering/source-structure.md)、[docs/plan/p1/tasks.md](../../tasks.md)。
- [package.json](../../../../../package.json)、[pnpm-lock.yaml](../../../../../pnpm-lock.yaml) 应无差异。

## 验收标准

- [ ] AC-08：检索结果列出，页面流转、页面组件与 App 无禁止导入或 API；演示 owner 只用 `SYNTHETIC_DEMO_OPTIONS`。
- [ ] AC-10 审阅部分：文案、恢复入口与焦点接线与 spec 一致，并标注为审阅证据。
- [ ] AC-14：新增 `.test.ts` 在 Vitest 发现范围内，DOM-free 模块进入 Node 类型程序；`pnpm check` 通过（块体积警告只记录）；无新依赖、Playwright、jsdom、React Testing Library、路由库、二进制资源或原版内容。
- [ ] 工程约定与源码结构指南已同步，`updated:` 已更新；文档链接可解析。

## 验证方法

- `pnpm check`；`git diff -- package.json pnpm-lock.yaml` 为空；源码检索命令与结果写入证据。
- 不适用浏览器测试。

## 完成证据
