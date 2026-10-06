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

- [x] AC-05（非缓存部分）：状态派生与状态阶梯的成立条件逐行一致；不能只凭 `finished` 得到“完整资源可查看”。
- [x] AC-06（持有与替换）：新的完整或部分结果替换资源包并递增代际；失败与取消不替换；替换前通知订阅者；payload 逐字节不变，没有被 detach。
- [x] 释放后迟到的输入不改变状态，也不通知订阅者。
- [x] `app/resources/` 不导入 `original-data`、DOM 或 React；`pnpm check` 通过。

## 验证方法

- `pnpm exec vitest run src/app tools/engineering-boundaries.test.ts`，完成前 `pnpm check`。
- 不适用浏览器验证（由 07、11、12 覆盖）。完成前按 execute-goal 做 rubber-duck 与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据

- **实现：**
  - [resource-holder.ts](../../../../../src/app/resources/resource-holder.ts) 的 `createResourceHolder({ reportError })`：
    - `acceptImport(job)` 只在 `finished` 时调用 `takeGroups()`，按切片定义排序并冻结组列表，用 `validatePackage(CLASSIC_P2_SLICE, groups)` 做全包判定。部分结果同样替换。
    - 每次替换代际加 1，先以旧包通知 `beforeReplace`，再持有新包并通知订阅者。
    - 冻结快照不含 payload；`current()` 返回带 payload 的资源包。
    - `PackageCacheState`（`not-saved`/`saving`/`saved`）与 `MissionLoadState` 已定义，由 03、04 填入。
  - [resource-status.ts](../../../../../src/app/resources/resource-status.ts) 的 `resourceStatuses(holder, job?)` 按状态阶梯派生状态。
  - 缓存状态的拆分：spec 数据模型中的 `checking` 与 `unavailable` 属于列出（菜单）状态，留给 03 的目录状态；资源包自身只用 `not-saved`、`saving`、`saved`。
- **测试：** [resource-holder.test.ts](../../../../../src/app/resources/resource-holder.test.ts) 共 17 条，用伪造的作业持有者与 `content/` 合成组。
  - **真值表：** 四种情形的状态、组状态与诊断逐行核对：
    - 四组完整且全包 `complete`：来源已识别、完整资源可查看、仅在内存中；
    - 缺 `audio` 组：部分转换，`group-missing@groups.audio`；
    - `cockpit-hud-map` 组不完整：部分转换，组状态附诊断；
    - 四组完整但 `models` 组的转换器版本不同：部分转换，`package-identity-mismatch`。
  - **阶梯规则：**
    - 只有 `finished` 而未取走组时，只得到“来源已识别”；
    - `running` 无身份、`failed`、`cancelled` 时没有状态；
    - 缓存状态 `saved` 才得到“已保存”，`saving` 得到“仅在内存中”加“正在保存”。
  - **持有与替换：**
    - 失败、取消与已取走组时不替换，不调用 `takeGroups`，快照与订阅都不变；
    - 完整、部分、完整三次结束得到代际 1、2、3，`beforeReplace` 在旧包仍被持有时、订阅通知之前被调用；
    - 组按定义顺序持有，payload 为同一对象，字节与事先复制的值逐一相等，所以没有被改写或 detach；
    - 快照在两次变化之间为同一冻结对象，不含 `bytes`。
  - **错误与释放：**
    - 监听抛错交给 `reportError`，其他监听照常；`reportError` 本身抛错时替换仍完成，其余监听仍被调用。证伪：去掉保护后该测试失败。
    - 释放后 `acceptImport` 返回 false 且不调用 `takeGroups`，没有任何通知，`current()` 为 null；释放监听在替换中释放持有者时返回 false，不持有新包。
- **边界：** [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 新增“app resource boundaries”：`app/resources/` 不得出现网络 API、`window`、`document`、`localStorage`，不得导入包、`render`、`ui`，每个模块须在 Node 程序中。lint 已禁止 `app/` 导入 `original-data`。
  - 证伪：在该目录放入使用 `window` 并导入 `react` 的探针，两条测试都失败。
- **检查：**
  - `pnpm exec vitest run src/app tools/engineering-boundaries.test.ts`：20 个文件，484 条测试通过；
  - `pnpm check`：142 个文件 4,268 条测试，构建通过。
- **Rubber-duck：** 没有阻塞问题。一项非阻塞问题已采纳：`reportError` 抛错会中断替换并丢失已取走的组，改为与作业持有者相同的保护，并补测试。
- **Simplify：** 采纳四项：
  - 直接持有已冻结的移交组，不再逐组复制；
  - 删去与逐字节比较重复的 buffer 长度断言；
  - 边界测试新增共用的 Node 程序文件集合，三处检查共用一次构建；
  - 模块级缓存改名，避免与局部变量同名。

  未采纳三项：
  - 改用 `boundGroups`：它会把 workers 测试支持与转换器拉入 app 测试，而这里只需一行；
  - 跳过全包重新校验：spec 要求以 `validatePackage` 判定，P2-01 规定全包判定不信任组结果；
  - 把各目录的边界检查抽成通用 helper：需改动既有的缓存与音频检查，超出本子任务范围。
- **文档影响：**
  - [源码结构](../../../../engineering/source-structure.md)的当前目录加入 `app/resources/`，新增“应用资源持有者”一节；
  - [工程约定](../../../../engineering/README.md)补充应用资源的边界回归；
  - STATUS 无需改动。
