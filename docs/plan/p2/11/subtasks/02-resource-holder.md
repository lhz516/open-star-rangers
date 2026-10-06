---
type: plan
status: active
phase: P2
task: "11"
subtask: "02"
updated: 2026-10-06
---

# 02 — 资源持有者与状态阶梯

**契约来源：** [spec](../spec.md) 的 S-03、S-12（资源包所有权）、AC-05（不含缓存部分）、AC-06（替换与所有权），以及[状态阶梯](../spec.md#状态阶梯)、[数据模型与契约](../spec.md#数据模型与契约)中的资源包与代际、技术决定 4。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新增 DOM-free 的应用级资源持有者（`src/app/resources/`），由应用外壳实例创建与释放，不放入模块级全局变量。
  - **持有：** 至多一份资源包，`origin` 为 `import` 或 `cache`。组元素为 `{ group, manifest, payloads, sources }`，装在冻结容器中；payload 的所有权归持有者。
  - **接收作业结果：** 从作业持有者的 `finished` 快照与 `takeGroups()` 取得组，并用 `validatePackage(CLASSIC_P2_SLICE, groups)` 做全包判定。只取已完整的组；缺组或组不完整时为“部分转换”。
  - **替换：** 每次替换递增代际；作业失败或取消不替换。替换前通知订阅者，使查看器先释放引用旧内容的资源。
  - **状态派生：** 按[状态阶梯](../spec.md#状态阶梯)派生状态：来源已识别、部分转换、完整资源可查看、任务载入结果（由 04 填入）。缓存状态的字段在此定义，取值由 03 填入。不存在只凭 `finished` 得到“完整资源可查看”的路径。
  - **快照与订阅：** 冻结快照，同一状态返回同一对象；同步通知订阅者，订阅者抛出的错误交给 `reportError`。
  - **释放：** 释放后不再接受任何结果，也不通知订阅者。
- Node 测试：
  - 状态阶梯的表驱动真值表：`finished` 但缺组、组不完整、四组完整但全包 `incomplete`、完整包；
  - 替换与不替换；代际递增；
  - 持有期间 payload 逐字节不变、没有被 detach；
  - 释放后的迟到输入被丢弃。

## 不包含

- 缓存的列出、提交、恢复与相应状态（03）；任务载入（04）；页面（06、07）。

## 关键文件与契约

- 计划新增 `src/app/resources/` 中的持有者模块与相邻测试。
- 复用：[import-job-owner.ts](../../../../../src/app/import/import-job-owner.ts) 的快照与 `ImportedGroup`；[completeness.ts](../../../../../src/content/completeness.ts) 的 `validatePackage`、`PackageCompletenessResult`；[slice-definition.ts](../../../../../src/content/slice-definition.ts)；01 的预期包配置类型。
- 测试数据：[synthetic-import.test-support.ts](../../../../../src/workers/synthetic-import.test-support.ts) 的合成组，或 `content/` 的合成内容测试支持。

## 验收标准

- [ ] AC-05（非缓存部分）：状态派生与状态阶梯的成立条件逐行一致；不能只凭 `finished` 得到“完整资源可查看”。
- [ ] AC-06（持有与替换）：新的完整或部分结果替换资源包并递增代际；失败与取消不替换；替换前通知订阅者；payload 逐字节不变，没有被 detach。
- [ ] 释放后迟到的输入不改变状态，也不通知订阅者。
- [ ] `app/resources/` 不导入 `original-data`、DOM 或 React；`pnpm check` 通过。

## 验证方法

- `pnpm exec vitest run src/app tools/engineering-boundaries.test.ts`，完成前 `pnpm check`。
- 不适用浏览器验证（由 07、11、12 覆盖）。完成前按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
