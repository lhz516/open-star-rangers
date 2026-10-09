---
type: plan
status: active
phase: P2
task: "03"
subtask: "01"
updated: 2026-10-08
---

# 01 — 分段 SHA-256

**契约来源：** [spec](../spec.md) 的 S-11、AC-11；[技术决定](../spec.md#技术决定) 10。
**依赖：** 无。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在 [sha256.ts](../../../../../src/content/sha256.ts) 中增加可分段输入的 SHA-256：
  - 任意次输入任意长度（含零长度）的字节，最后得到摘要；
  - 只保留不足一个 64 字节块的尾部，不复制或保留调用者的整段输入，也不修改输入；
  - 完成后能否再输入由实现明确规定，并有测试。
- 现有一次性的 `sha256Fingerprint` 保持签名与输出不变，可以改为基于同一实现。
- 摘要可以输出为 64 位小写十六进制，或 `sha256:` 前缀形式，供 04 计算指纹、05 核对文件哈希使用；具体导出名由实现决定。
- 实现保持纯模块：不导入 `node:crypto`、WebCrypto、DOM 或 Node 类型。

## 不包含

- 版本白名单、来源指纹与文件哈希核对（04、05）。
- 改变 P2-01 的 `PayloadFingerprint` 格式或 payload 身份规则。

## 关键文件与契约

- **修改：** [sha256.ts](../../../../../src/content/sha256.ts)、[sha256.test.ts](../../../../../src/content/sha256.test.ts)。
- **文档：** [源码结构](../../../../engineering/modules/content.md#内容基础契约与切片定义)中 `sha256.ts` 的说明。

## 验收标准

- [x] AC-11：在下列输入上，分段结果与一次性计算以及 `node:crypto` 的结果都一致：空输入、`abc`、长度 55/56/63/64/65/119/120 字节、1,000,000 个 `a`。
- [x] AC-11：同一输入的任意分段方式（含逐字节输入、零长度分段、跨 64 字节块边界的切分）得到相同摘要；`sha256Fingerprint` 对现有测试向量的输出不变。
- [x] 生产代码不导入 `node:crypto` 或 WebCrypto，在纯模块程序中编译；输入字节在计算后未被修改。
- [x] `pnpm exec vitest run src/content`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 在 `src/content/sha256.test.ts` 中做表驱动测试，用 `node:crypto` 作为测试中的参考实现（[测试规则](../../../../engineering/README.md#测试)允许）；对较短输入枚举所有切分点。
- 不适用 browser-testing 或原版对照。

## 完成证据

- **实现：** [sha256.ts](../../../../../src/content/sha256.ts) 新增 `Sha256`：
  - `update(bytes)` 接受任意长度（含零长度）片段，尾部长度由总长推导，只保留未满一块的尾部，压缩后立即清零；
  - `digestHex()` 返回 64 位小写十六进制，完成后清零尾部缓冲；
  - **完成后的语义：** 再次 `update` 抛错，再次 `digestHex` 返回同一结果；
  - **拒绝的输入：** 已 detached 的输入（复用 `ownership.ts` 的 `isDetached`）与超出安全整数的总长，都在改变状态前抛错。

  `sha256Fingerprint` 改为基于它，签名与输出不变。生产代码只导入同层的 `content-identity.ts`（类型）与 `ownership.ts`。
- **测试：** [sha256.test.ts](../../../../../src/content/sha256.test.ts) 以 `node:crypto` 为参考，覆盖：
  - 空输入、`abc`；
  - 长度 55/56/63/64/65/119/120 的全部两段切分；
  - 200 字节的逐字节输入、零长度与跨块边界切分；
  - 1,000,000 个 `a` 的一次性计算与不均匀分段（并核对公认摘要）；
  - 输入不被修改、完成后的语义，以及 detached 输入被拒绝且不改变状态。

  原有一次性测试向量保持通过。
- **变异检查：** 把 `tailLength += offset` 改为 `=` 后有 8 个测试失败，恢复后全部通过。
- **长度高位：** 64 位长度的高位字只有输入达到 512 MiB 以上才会非零，测试无法构造；实现按安全整数推导该字，并拒绝更大的总长。
- **检查：**
  - `pnpm exec vitest run src/content`：10 个文件、328 个测试通过；
  - `pnpm check`：类型检查、lint、80 个测试文件 2,100 个测试与构建全部通过。
- **Rubber-duck：** 采纳三项：处理后的调用者字节残留在尾部缓冲（改为压缩后与完成后清零）；总长可能失去精度（改为安全整数上限）；detached 输入被当作空输入（改为抛错）。
- **Simplify：**
  - 采纳：复用 `isDetached`；由总长推导尾部长度，去掉同步字段；缓存尾部 `DataView`；完成时只清零所需范围；去掉与原有一次性测试重复的断言。
  - 保留：压缩后的清零，用于满足“只保留未完成尾部”的要求。
- **文档影响：** 更新[源码结构](../../../../engineering/modules/content.md#内容基础契约与切片定义)中 `sha256.ts` 的说明；工程约定与工具指南无受影响内容。

