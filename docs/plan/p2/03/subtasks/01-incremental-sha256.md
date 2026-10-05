---
type: plan
status: active
phase: P2
task: "03"
subtask: "01"
updated: 2026-10-05
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
- **文档：** [源码结构](../../../../engineering/source-structure.md#内容基础契约与切片定义)中 `sha256.ts` 的说明。

## 验收标准

- [ ] AC-11：在下列输入上，分段结果与一次性计算以及 `node:crypto` 的结果都一致：空输入、`abc`、长度 55/56/63/64/65/119/120 字节、1,000,000 个 `a`。
- [ ] AC-11：同一输入的任意分段方式（含逐字节输入、零长度分段、跨 64 字节块边界的切分）得到相同摘要；`sha256Fingerprint` 对现有测试向量的输出不变。
- [ ] 生产代码不导入 `node:crypto` 或 WebCrypto，在纯模块程序中编译；输入字节在计算后未被修改。
- [ ] `pnpm exec vitest run src/content`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 在 `src/content/sha256.test.ts` 中做表驱动测试，用 `node:crypto` 作为测试中的参考实现（[测试规则](../../../../engineering/README.md#测试)允许）；对较短输入枚举所有切分点。
- 不适用 browser-testing 或原版对照。

## 完成证据
