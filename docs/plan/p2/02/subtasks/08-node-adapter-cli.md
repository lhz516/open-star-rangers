---
type: plan
status: active
phase: P2
task: "02"
subtask: "08"
updated: 2026-10-04
---

# 08 — Node 文件适配、manifest 大小与本地核对 CLI

**契约来源：** [spec](../spec.md) 的 S-09、S-13（工具指南）；[读取、所有权与生命周期](../spec.md#读取所有权与生命周期)；AC-11、AC-12（超过 16 MiB 的分段自动回归）。
**依赖：** 05。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **Node 端口实现：** 用只读文件句柄的定位读取实现 `ByteSource`。
  - 底层短读时继续读取至请求长度；提前 EOF 或 I/O 失败时拒绝。
  - 拥有者可以显式、幂等地关闭句柄，关闭后不能再读取。
  - 错误不含绝对路径。
- **manifest 扩展：** 最小扩展 [manifest.ts](../../../../../tools/compliance/manifest.ts)，让游戏文件表的条目带出已校验的大小；`cli.ts`、`scan.ts` 与既有合规测试的行为不变。
- **本地核对 CLI：** 输入为 CloneCD 文件组路径与 manifest。
  - 用 P2-02 读取链解析 manifest 游戏文件表中的每个路径，核对大小，并以不超过 16 MiB 的分段流式计算 SHA-256。
  - 统计实际请求日志的累计 `sourceReadBytes`，确认 `.sub`/`.cue` 读取为 0。
  - 只输出规范光盘路径、计数与比对结论；坏输入以非零退出并输出稳定 code。
  - 在成功、打开部分失败、读取失败与取消时都关闭已取得的句柄；关闭失败也以非零退出。
- **文档：** 在[工具指南](../../../../guides/tools.md)中加入 CLI 用法。

## 不包含

- 对真实基准盘的运行与原版结构事实记录（09）。
- 产品版本识别、来源指纹与哈希白名单（P2-03）。

## 关键文件与契约

- **计划新增：** `tools/node-byte-source.ts`、`tools/disc-check.ts` 及相邻测试 `tools/node-byte-source.test.ts`、`tools/disc-check.test.ts`。
- **修改：** [manifest.ts](../../../../../tools/compliance/manifest.ts) 与 [manifest.test.ts](../../../../../tools/compliance/manifest.test.ts)、[工具指南](../../../../guides/tools.md)。
- **前提：** 05 的完整读取链。

## 验收标准

- [ ] AC-11：
  - Node 适配只读打开，定位读取正确；短读续读到精确长度；提前 EOF 与 I/O 失败拒绝；
  - 关闭幂等，关闭后不能读取；
  - CLI 在每种成功或失败路径上都关闭句柄，关闭失败时非零退出；
  - 坏输入输出稳定 code，错误不含绝对路径；
  - 临时目录中的合成文件测试同时验证 manifest 的路径、大小与哈希读取；既有合规工具测试通过。
- [ ] AC-12（自动部分）：合成镜像中超过 16 MiB 的文件按上限分段流式读取，计算出的 SHA-256 正确；累计用量等于请求日志之和；`.sub`/`.cue` 读取为 0。
- [ ] 测试只操作自有临时目录，不读取 `local/`；`pnpm exec vitest run tools/node-byte-source.test.ts tools/disc-check.test.ts tools/compliance`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 在临时目录写入合成 CloneCD 文件组与合成 manifest，覆盖短读、EOF、关闭与各失败路径；用 `node tools/disc-check.ts` 子进程检查退出码与输出。
- 不适用 browser-testing；本地基准核对见 09。

## 完成证据
