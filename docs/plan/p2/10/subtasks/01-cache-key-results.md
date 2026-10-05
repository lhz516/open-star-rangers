---
type: plan
status: active
phase: P2
task: "10"
subtask: "01"
updated: 2026-10-05
---

# 01 — 缓存键、错误码与失败结果

**契约来源：** [spec](../spec.md) 的 S-02、S-10，AC-01、AC-10（宿主错误分类部分）、AC-14（结果字段部分）；[缓存键与身份](../spec.md#缓存键与身份)、[错误码](../spec.md#错误码)。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **缓存键：**
  - `ResourceCacheKey`：`{ originType: 'synthetic' | 'original-import'; originToken: string; converterVersion: ConverterVersion }`，冻结。
  - 由 `ContentIdentity` 确定性推导：原版导入取 `origin.sourceFingerprint`，合成内容取 `origin.fixtureId`。schema、切片定义版本与 manifest 身份不参与。
  - 读取不可信的键（恢复的输入）：未知 `originType`、多余字段、`originToken` 不满足对应来源的 P2-01 读取规则（原版导入用 `readSourceFingerprint`，合成内容用 fixture ID 规则）、`converterVersion` 不满足 P2-01 令牌规则，都返回 `invalid-request`。跨来源误用令牌（`SourceFingerprint` 当 fixture ID，或反之）同样被拒绝。
  - 与 IndexedDB 数组键的相互转换：包记录键 `[originType, originToken, converterVersion]`，payload 记录键在其后追加 `assetId`，不做字符串拼接。
- **结果与错误码：**
  - spec 的 13 个封闭 code，作为只读常量集合导出，不多不少。
  - 失败结果 `{ status: 'failed', code, location, reason, diagnostics, budget }`：`reason` 为每个 code 的固定文本；`diagnostics` 为 P2-01 的 `CompletenessDiagnostic` 列表，`budget` 为 P2-01 的 `BudgetViolation` 列表，没有时为空数组；结果冻结、可结构化克隆。
  - 各操作的成功结果类型（`committed`、`listed`、`restored`、空间检查结果、存储需求）与失败结果组成判别联合；类型可以在此声明，构造逻辑由后续子任务实现。
- **宿主错误分类：** 只按宿主异常的 `name` 分类，消息文本不进入结果：
  - 打开阶段：`VersionError` → `storage-newer-version`；其他名称（含 `SecurityError`、`InvalidStateError`）及非异常值 → `storage-unavailable`。
  - 写事务中止：`QuotaExceededError` → `quota-exceeded`；其他 → `write-failed`。
  - 读事务出错 → `read-failed`。
  - 连接关闭事件、取消与 `abort()` 的判定由 03–05 在适配器中实现，本子任务只提供分类函数与 code。
- 模块不依赖 DOM 类型，可被 `tsconfig.node.json` 程序中的测试导入；只导入 `src/content` 的公开导出。

## 不包含

- 记录布局、存储需求与空间判定（02、04）。
- IndexedDB 适配、事务与浏览器验证（03–06）。

## 关键文件与契约

- **计划新增：** `src/platform/storage/resource-cache-contract.ts`、`src/platform/storage/resource-cache-contract.test.ts`。
- **只读复用：** [content-identity.ts](../../../../../src/content/content-identity.ts)（`readContentIdentity`、`readSourceFingerprint`、`ContentOrigin`、`ConverterVersion`）、[completeness.ts](../../../../../src/content/completeness.ts)（`CompletenessDiagnostic`）、[budget.ts](../../../../../src/content/budget.ts)（`BudgetViolation`）。fixture ID 规则目前只在 `readContentOrigin` 内部；若需单独复用，在 `content-identity.ts` 中增加导出，不改变既有导出的行为。

## 验收标准

- [ ] AC-01（Node 部分）：两种来源的键确定；来源类别、令牌、转换器版本任一不同则键不同；schema、切片定义版本、manifest 身份变化不影响键；跨来源令牌、未知来源类别、多余字段与非法转换器版本都返回 `invalid-request`。
- [ ] S-10：错误码集合与 spec 的 13 个 code 完全一致；每个 code 的 `reason` 为固定文本；失败结果冻结，`structuredClone` 后相等。
- [ ] AC-10（分类部分）：`VersionError`、`SecurityError`、`InvalidStateError`、`QuotaExceededError`、`AbortError`、未知名称、无 `name` 的值与非对象值，都映射到上述 code。
- [ ] AC-14（结果字段部分）：给定带消息、堆栈与自定义字段的宿主异常，失败结果只含规定的 6 个字段，不含消息文本、堆栈、payload 字节或路径。
- [ ] `pnpm exec vitest run src/platform/storage`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- `resource-cache-contract.test.ts` 用 [synthetic-content.test-support.ts](../../../../../src/content/synthetic-content.test-support.ts) 的 `syntheticIdentity` 生成身份，表驱动覆盖键与分类；宿主异常用带 `name` 的普通对象与 Node 的 `DOMException` 构造。
- 不适用 browser-testing；真实宿主错误在 03–05 中验证。
- 完成前按 execute-goal 流程以本子任务 diff 为范围做 rubber-duck 审查与 [simplify](../../../../../.agents/skills/simplify/SKILL.md)。

## 完成证据
