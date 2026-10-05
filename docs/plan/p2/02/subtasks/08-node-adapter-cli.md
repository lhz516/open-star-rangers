---
type: plan
status: active
phase: P2
task: "02"
subtask: "08"
updated: 2026-10-05
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

- [x] AC-11：
  - Node 适配只读打开，定位读取正确；短读续读到精确长度；提前 EOF 与 I/O 失败拒绝；
  - 关闭幂等，关闭后不能读取；
  - CLI 在每种成功或失败路径上都关闭句柄，关闭失败时非零退出；
  - 坏输入输出稳定 code，错误不含绝对路径；
  - 临时目录中的合成文件测试同时验证 manifest 的路径、大小与哈希读取；既有合规工具测试通过。
- [x] AC-12（自动部分）：合成镜像中超过 16 MiB 的文件按上限分段流式读取，计算出的 SHA-256 正确；累计用量等于请求日志之和；`.sub`/`.cue` 读取为 0。
- [x] 测试只操作自有临时目录，不读取 `local/`；`pnpm exec vitest run tools/node-byte-source.test.ts tools/disc-check.test.ts tools/compliance`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- 在临时目录写入合成 CloneCD 文件组与合成 manifest，覆盖短读、EOF、关闭与各失败路径；用 `node tools/disc-check.ts` 子进程检查退出码与输出。
- 不适用 browser-testing；本地基准核对见 09。

## 完成证据

- **实现：**
  - [node-byte-source.ts](../../../../../tools/node-byte-source.ts) 的 `NodeByteSource` 实现 `ByteSource` 与 `ClosableByteSource`：
    - `open(path)` 以 `'r'` 只读打开并记录大小；
    - 定位读取遇到短读会续读到精确长度，提前 EOF（`unexpected-eof`）或 I/O 失败（`read-failed`）即拒绝；
    - 使用不入池的未初始化内存，填满后才返回普通 `Uint8Array` 视图；
    - `close()` 是记忆化的 async 包装，同步抛错同样变为同一个拒绝，因此幂等；关闭后的读取返回 `closed`；
    - 错误只带稳定 code，没有宿主路径或宿主错误文本；`ReadHandle` 可注入，便于测试。
  - [manifest.ts](../../../../../tools/compliance/manifest.ts)：`BlacklistEntry` 改为判别联合，游戏行带已校验的 `size: number`，镜像行为 `size: null`。`cli.ts`、`scan.ts` 的行为不变。
  - [disc-check.ts](../../../../../tools/disc-check.ts)：
    - `runDiscCheck(paths, { manifestPath, signal, open })` 先读 manifest 游戏表，并要求每个路径都是规范 `DiscPath`；之后才打开输入，每个句柄打开后立即登记，以备关闭。
    - 用计数端口统计实际请求，经 `openDiscImage` 逐行 `openFile`、比较大小，并按 16 MiB 分段流式计算 SHA-256；只有得出结论的文件才计入 checked/matched。
    - 取消与预算耗尽会结束整次核对，其他读取错误只计为该文件不一致；意外错误报 `internal-error`，不序列化其文本。
    - 所有路径都关闭全部已打开的句柄；关闭失败报 `read-failed@input`。
    - 要求计量的 `sourceReadBytes` 等于请求日志之和，且 `.sub`/`.cue` 读取为 0，否则报 `read-accounting`。
    - `main` 负责解析参数、把 SIGINT 转为取消，并输出 `osr-disc-check`/1 JSON；退出码 0 通过、1 失败、2 用法错误。
- **测试：**
  - [node-byte-source.test.ts](../../../../../tools/node-byte-source.test.ts)（AC-11 适配部分）：
    - `0o444` 只读文件可以打开，证明以只读方式打开，定位读取正确；
    - 打开失败返回 `open-failed`，错误不含路径；
    - 每次只返回 3 字节的短读会续读到 10 字节；提前 EOF 与 I/O 失败都拒绝；
    - 5 种非法范围在读取前被拒绝；
    - 关闭幂等，只调用一次底层关闭，之后的读取返回 `closed`；同步与异步的关闭失败都在每次调用时得到同一个 `close-failed`。
  - [disc-check.test.ts](../../../../../tools/disc-check.test.ts) 在自有临时目录写入合成 CloneCD 文件组与合成 manifest（含路径、大小、哈希），不读取 `local/`：
    - AC-12 自动部分：含一个 16 MiB+3,000 字节文件的四个文件全部一致；`sourceReadBytes` 等于请求之和；`.sub`/`.cue` 读取为 0；四个句柄全部关闭。若一次读取超过 16 MiB 会得到 `limit-exceeded`，因此全部一致即证明按上限分段。
    - 不一致：哈希、大小与不存在的路径，逐文件给出 code。
    - AC-11 CLI 部分：
      - 文件组不受支持时，关闭已打开的句柄；后一个文件打开失败时（`read-failed@input[1]`），关闭先前已打开的句柄；
      - 读到第 6 次时取消：返回 `cancelled`，checked 为 0，四个句柄都关闭；
      - 异步关闭失败与首个关闭同步抛错时，都关闭了其余句柄，并以 `read-failed@input` 失败；
      - 意外错误报 `internal-error`，此时没有打开更多文件；
      - manifest 不可读（不含路径）、格式错误、含非规范路径（不回显该路径，且在打开任何文件之前）分别返回稳定 code；
      - 子进程：一致时退出 0，输出不含临时目录路径；坏输入退出 1 并给出稳定 code；无参数或未知选项退出 2。
  - [manifest.test.ts](../../../../../tools/compliance/manifest.test.ts)：真实 manifest 的游戏行都有安全整数大小，镜像行为 null；合成 manifest 的大小等于 fixture 字节数；既有合规测试全部通过。
- **变异检查：** 删去 finally 中的关闭后，5 个用例失败。用量核对分支无法用正常端口触发：计数端口记录的正是读取方发出的请求长度。该分支作为 09 真实运行的防御性校验保留，成功用例直接断言了两者相等。
- **检查：**
  - `pnpm exec vitest run tools/node-byte-source.test.ts tools/disc-check.test.ts tools/compliance` 通过；
  - 完整 `pnpm check` 通过：typecheck、lint、80 个测试文件共 2080 项测试、build；
  - `pnpm check:original` 通过，0 findings。
- **Rubber-duck：** 5 项发现均已修复：
  - 同步抛出的关闭会破坏幂等并漏关后续句柄：改为 async 包装与 async 回调；
  - 意外错误会以带路径的未捕获栈退出：改为 `internal-error`；
  - manifest 中的非规范路径可能被回显：改为预先校验，报 `manifest-path`；
  - `close-failed` 不在封闭错误码内：改为 `read-failed`，CLI code 也定义为封闭联合；
  - 取消后计数会虚报一致：改为只计已得出结论的文件。
- **Simplify：**
  - 已应用：
    - manifest 条目改为判别联合；输入改为单一记录数组；计数端口惰性读取 `byteLength`，构造不会抛错，句柄得以先登记；
    - 复用 `isCount`；`ClosableByteSource` 移到适配器模块；使用不清零的不入池内存；
    - 测试复用 `volumeSectors`、合规侧 `sha256` 与 `syntheticBytes`，摘要只计算一次，只有主用例处理 16 MiB 文件。
  - 未采纳：目录缓存（spec 规定不做缓存）；另立原版 manifest 解析器（spec 要求最小扩展）；复用固定行的 `syntheticManifest` 骨架。
- **文档影响：**
  - [工具指南](../../../../guides/tools.md)新增 `tools/disc-check.ts` 表行与“光盘镜像核对”一节：输入、核对内容、输出、退出码、句柄与原版内容边界；
  - [源码结构](../../../../engineering/source-structure.md)改为指向已实现的 Node 适配与 CLI；
  - 不涉及原版事实或 U 项，基准盘运行由 09 完成。
