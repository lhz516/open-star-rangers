---
type: plan
status: active
phase: P2
task: "03"
subtask: "05"
updated: 2026-10-05
---

# 05 — 版本识别、已验证来源与产品入口

**契约来源：** [spec](../spec.md) 的 S-05、S-06、S-07（句柄与产品入口）、S-09、S-10、S-12；[版本识别](../spec.md#版本识别)、[产品入口与底层能力](../spec.md#产品入口与底层能力)、[读取、所有权与生命周期](../spec.md#读取所有权与生命周期)；AC-05、AC-06、AC-07（光盘部分）、AC-08、AC-10。
**依赖：** 01, 03, 04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **识别（底层能力，07 将限制其使用者）：** 在已打开的 P2-02 镜像上，用给定的白名单识别。
  1. 用 04 的读取器校验白名单。
  2. **存在与大小：** 按路径升序调用 `lookup`。P2-02 的 `path-not-found`、`wrong-entry-kind`，目标是目录，以及大小不符，都返回 `unsupported-version`（位置为 `file:/路径`）；其他光盘层错误以同一实例传递。
  3. **哈希：** 按路径升序打开每个文件，从偏移 0 起顺序读取，每段不超过 4,194,304 字节，用 01 的分段 SHA-256 计算。每段计入后即丢弃；与白名单不符时返回 `unsupported-version`，之后的文件不再读取。
  4. **结果：** 全部一致时，用 04 的函数计算指纹，返回已验证来源。
- **已验证来源句柄：**
  - 冻结的 `identity` `{ versionId, fingerprint, files }`，可结构化克隆；
  - `openFile(path)` 返回覆盖文件的 `DiscFile`，`openArchive(path)` 用 03 的底层打开函数打开封包；
  - 覆盖范围外的合法路径返回 `path-not-covered`，非法路径返回 `invalid-request`，两者都不发生读取；
  - 修改调用者传入的白名单不影响句柄与身份。
- **产品入口：**
  - 接受 P2-02 的文件组与打开选项（预算、取消），先用 `openDiscImage` 打开，再用生产白名单识别；
  - 不接受自定义白名单；
  - P2-02 打开失败以同一实例传递；
  - 产品入口模块与底层识别模块分开，以便 07 按模块施加边界；产品需要的类型从产品入口模块导出。

## 不包含

- 来源映射核验（06）；lint 与依赖图规则（07）；CLI（08）。
- Worker 中的调用、作业消息与耗时观测（P2-04）。

## 关键文件与契约

- **计划新增：**
  - `src/original-data/source/identify-source.ts`：底层识别与已验证来源句柄；
  - `src/original-data/source/open-verified-source.ts`：产品入口；
  - 相邻 `*.test.ts`。
- **复用：**
  - [disc-image.ts](../../../../../src/original-data/disc/disc-image.ts) 的 `openDiscImage`、`DiscImage`、`DiscFile`；
  - [disc-error.ts](../../../../../src/original-data/disc/disc-error.ts) 的 `DiscReadError`；
  - 01 的分段 SHA-256，03 的封包打开函数与合成多文件光盘，04 的白名单与指纹函数，02 的错误类。
- **文档：** [源码结构](../../../../engineering/source-structure.md)中的版本识别、已验证来源与产品入口说明。

## 验收标准

- [ ] AC-05：
  - 合成光盘加合成白名单返回冻结、可结构化克隆的身份，指纹等于测试独立计算的结果，并通过 `readSourceFingerprint`；
  - `MAIN/` 中另有 `SRANGER.CFG`、`SRHISCOR.RAW`、`*.SWP`、演示目录或未知文件时，结果与指纹不变，这些文件从不被读取；
  - 读取日志只包含打开镜像、查找所经目录与覆盖文件的扇区，每段不超过 4 MiB。
- [ ] AC-06：
  - 缺失、路径中间段是文件、目标是目录、大小 ±1，都返回 `unsupported-version`，且没有读取任何覆盖文件的数据扇区（包括最后一个文件不符的情况）；
  - 首字节或最后一段被改时返回 `unsupported-version`，后续文件未被读取；多个不符时报告路径最小的一个；
  - 大小相同但内容不同的文件，即使文件名、卷标与 `.ccd` 相同也被拒绝；
  - 坏扇区、预算恰差 1 字节、在两段之间或等待最后一段期间取消，都以 P2-02 的 code 失败，不返回句柄。
- [ ] AC-07（光盘部分）：扇区布局、`.ccd` 文本与无关文件都不同、但覆盖文件相同的两张合成光盘，得到相同的身份与指纹。
- [ ] AC-08：
  - `openFile`/`openArchive` 只接受覆盖路径；非 NOB 的覆盖文件用 `openArchive` 打开时返回 `invalid-archive`；
  - 已验证来源的读取与识别共用同一镜像句柄的用量与取消状态；
  - 产品入口对缺少覆盖文件的合成光盘，在 `file:/MAIN/AISTUFF.NOB` 返回 `unsupported-version`；对大小与生产相同、内容不同的合成光盘，在哈希阶段返回 `unsupported-version`。
- [ ] AC-10（识别部分）：任何失败都不返回句柄或部分身份；同一输入在相同初始用量与取消状态下得到相同的首个错误；DTO 不含宿主名或文件内容。
- [ ] `pnpm exec vitest run src/original-data`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 用 03 的合成多文件光盘与记录读取的端口做 Node 测试；生产大小的文件用按需生成扇区的端口表示，不分配整份文件；用可控 Promise 端口复现取消。
- 不适用 browser-testing；基准盘的真实识别由 09 完成。

## 完成证据
