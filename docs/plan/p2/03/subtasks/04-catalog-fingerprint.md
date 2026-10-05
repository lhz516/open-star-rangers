---
type: plan
status: active
phase: P2
task: "03"
subtask: "04"
updated: 2026-10-05
---

# 04 — 版本白名单与来源指纹

**契约来源：** [spec](../spec.md) 的 S-04、S-06、S-10（`invalid-catalog`）、S-12（合成白名单）；[版本白名单与覆盖范围](../spec.md#版本白名单与覆盖范围)、[来源指纹](../spec.md#来源指纹)；AC-04、AC-07（与光盘无关的部分）。
**依赖：** 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **白名单读取器：** 用严格的纯数据读取器校验白名单 `{ versionId, files }`，非法时返回 `invalid-catalog`，位置为 `catalog.*`：
  - `versionId` 为匹配 `[a-z0-9]+(-[a-z0-9]+)*`、不超过 64 字符的 token；
  - `files` 非空，按 ASCII 字节序严格升序且不重复；
  - 每项为 `{ path: DiscPath, byteLength: 非负安全整数, sha256: 'sha256:' + 64 位小写十六进制 }`；
  - 拒绝类实例、accessor 与未知字段；结果复制并冻结。
- **生产白名单：** 导出唯一的生产常量，`versionId` 为 `star-rangers-1995-cd`，恰好覆盖 spec 列出的 8 个路径，大小与哈希取自 [manifest](../../../../original/manifest.md#游戏文件光盘-main-与-flics)。
- **指纹：** 按 spec 的规范文本计算 `source:sha256:<hex>`：
  - 首行为 `open-star-rangers/source-fingerprint/1`；
  - 每个文件一行，依次为路径、十进制字节数（无前导零）、64 位哈希，以 `\t` 分隔；
  - 每行都以 `\n` 结尾；
  - 结果通过 P2-01 的 `readSourceFingerprint`；
  - 用测试固定生产指纹常量。
- **合成白名单：** 新增测试 helper，从合成文件内容生成白名单，供 05、06、08 使用。

## 不包含

- 读取光盘与计算文件哈希（05）；产品入口与已验证来源（05）。
- 改变覆盖范围、增加其他版本（P4/P5）。

## 关键文件与契约

- **计划新增：**
  - `src/original-data/source/source-catalog.ts`：白名单读取器、生产白名单与指纹计算；
  - `src/original-data/source/source.test-support.ts`：合成白名单 helper；
  - `src/original-data/source/source-catalog.test.ts`；
  - `tools/source-catalog.test.ts`：用 [manifest 解析](../../../../../tools/compliance/manifest.ts)的 `readManifest` 读取 manifest，核对生产白名单。
- **复用：** [sha256.ts](../../../../../src/content/sha256.ts) 的一次性计算、[disc-path.ts](../../../../../src/original-data/disc/disc-path.ts) 的 `isDiscPath`、[content-identity.ts](../../../../../src/content/content-identity.ts) 的 `readSourceFingerprint`，以及 02 的错误类。
- **文档：** [源码结构](../../../../engineering/source-structure.md)中的版本白名单与指纹说明。

## 验收标准

- [x] AC-04：
  - 生产白名单恰有一个版本 `star-rangers-1995-cd` 和 spec 列出的 8 个升序路径，每项的路径、大小、SHA-256 与 manifest 完全一致；
  - 生产指纹等于测试中固定的常量；
  - 读取器以 `invalid-catalog` 拒绝空文件列表、未排序或重复路径、非 `DiscPath`、大小不是非负安全整数、哈希格式错误、版本 token 非法，以及未知字段。
- [x] AC-07（无需光盘的部分）：
  - 指纹等于测试用 `node:crypto` 对规范文本独立计算的结果；
  - 只修改 `versionId` 不改变指纹；改变任一文件的哈希或大小、增删路径，指纹改变；
  - 测试所用合成白名单的指纹不等于生产指纹；
  - 路径排序与区域设置无关。
- [x] `pnpm exec vitest run src/original-data/source tools/source-catalog.test.ts`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 纯模块测试覆盖读取器与指纹；`tools/` 侧测试只读取 `docs/original/manifest.md`（只含路径、大小与哈希），不读取原版文件。
- 不适用 browser-testing 或原版对照。

## 完成证据

- **实现：** [source-catalog.ts](../../../../../src/original-data/source/source-catalog.ts)：
  - **`readSourceCatalog`：** 复用 P2-01 的 `readRecord`、`requireFields`、`readOrderedArray`、`matchesWhole` 与 `compareText`，严格读取白名单并返回冻结副本。失败一律报 `invalid-catalog`；只有符合 `catalog…` 结构路径的位置才被报告，其余情况（含 Proxy trap 抛出的错误或伪造的路径）都报 `catalog`。
  - **`sourceFingerprint`：** 按 spec 的规范文本（ASCII 字节，不依赖 `TextEncoder`）用分段 SHA-256 计算，并经 `readSourceFingerprint` 返回。
  - **`PRODUCTION_CATALOG`：** 在模块加载时经读取器构造，版本 `star-rangers-1995-cd`，覆盖 8 个文件。
- **测试辅助：** [source.test-support.ts](../../../../../src/original-data/source/source.test-support.ts) 的 `catalogFor` 从字节或按范围生成的内容生成合成白名单。
- **测试：**
  - [source-catalog.test.ts](../../../../../src/original-data/source/source-catalog.test.ts) 覆盖：
    - **生产白名单：** 8 个路径、ASCII 序与深度冻结；生产指纹固定为 `source:sha256:fd97bcea…81be`，并与 `node:crypto` 独立计算的结果一致；
    - **读取器：** 26 种非法形状都在预期结构路径返回 `invalid-catalog`，含 ASCII 序（`A_B` 在 `AB` 之后）、重复、未知字段与 `2^53` 长度；读取后修改输入不影响结果；被拒的值不出现在诊断中；
    - **Proxy：** trap 抛出的普通错误或伪造的 `ContentContractError` 都在 `catalog` 返回 `invalid-catalog`；
    - **指纹：** 与 `node:crypto` 一致并能通过 `readSourceFingerprint`；只改版本 ID 时不变；改变内容、长度、增删路径时都会改变；测试所用合成白名单的指纹不等于生产指纹。
  - [tools/source-catalog.test.ts](../../../../../tools/source-catalog.test.ts) 读取 `docs/original/manifest.md`，核对每个覆盖文件的大小与 SHA-256。
- **变异检查：** 规范文本的字节数加 1 后，有 2 个测试失败。
- **检查：**
  - `pnpm exec vitest run src/original-data/source tools/source-catalog.test.ts`：68 个测试通过；
  - `pnpm check`：83 个测试文件 2,256 个测试与构建通过。
- **Rubber-duck：** 采纳一项阻塞意见：防止 Proxy 伪造错误路径或泄露值，改为按位置白名单映射，并增加 Proxy 测试。行为上等同纯数据的透明 Proxy 仍被接受，与 P2-01 读取器一致。
- **Simplify：**
  - 采纳：测试辅助的字节分支复用 `sha256Fingerprint`，`contentDigest` 不再导出。
  - 未采纳：缓存生产指纹（只计算一次，开销可忽略）。
- **文档影响：** [源码结构](../../../../engineering/source-structure.md#版本白名单与来源指纹)新增“版本白名单与来源指纹”一节，并更新目录树。manifest 本身无需修改，一致性由测试保证；工程约定与工具指南无受影响内容。

