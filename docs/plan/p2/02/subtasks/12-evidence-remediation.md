---
type: plan
status: active
phase: P2
task: "02"
subtask: "12"
updated: 2026-10-05
---

# 12 — 限值、确定性与 CLI 关闭的测试证据补救

**契约来源：** [spec](../spec.md) 的 S-09、S-10、S-11；[限值与预算](../spec.md#限值与预算)中“卷描述符个数 ≤ 16（终止符须位于 LBA 16–31 内）”；[读取、所有权与生命周期](../spec.md#读取所有权与生命周期)中“CLI 在成功、读取失败、打开失败及取消时都关闭已取得的句柄”；AC-04、AC-08、AC-11。缺口由 [10 第一次最终对齐](./10-final-alignment.md#完成证据)发现。
**依赖：** 03, 08。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

实现已满足这些要求，但缺少持久的测试证据。本子任务只补测试，除非测试暴露实现缺陷：

- **卷描述符上限：** 主卷、14 个可跳过的描述符和位于第 16 个（LBA 31）的终止符可以打开，读取日志恰为 LBA 16–31。
- **首个错误的确定性（AC-08）：** 同一失败输入在相同初始预算与取消状态下，分别在打开、查找与读取三层重复执行两次，得到相同的首个错误 DTO。
- **CLI 读取失败时关闭（AC-11）：** 读取游戏文件时端口失败，该文件记为 `read-failed`，核对以失败结束，全部已取得的句柄都被关闭。

## 不包含

- lead-out 正值与取消锁存的实现修正（11）。

## 关键文件与契约

- **修改：** [iso9660-volume.test.ts](../../../../../src/original-data/disc/iso9660-volume.test.ts)、[disc-image.test.ts](../../../../../src/original-data/disc/disc-image.test.ts)、[disc-check.test.ts](../../../../../tools/disc-check.test.ts)。

## 验收标准

- [x] 16 个描述符且终止符位于 LBA 31 时打开成功，读取日志为 LBA 16–31；既有的“无终止符”拒绝用例保持通过。
- [x] 打开、查找、读取三层各有一个失败用例：重复执行两次得到相同的首个错误 DTO。
- [x] CLI 读取游戏文件失败时报告 `read-failed`，`passed` 为 false，4 个句柄全部关闭。
- [x] `pnpm exec vitest run src/original-data tools/disc-check.test.ts` 通过。

## 验证方法

- Node 测试，使用合成镜像与可注入的打开函数。
- 不适用 browser-testing 或原版对照。

## 完成证据

- **测试（只补证据，没有改实现）：**
  - [iso9660-volume.test.ts](../../../../../src/original-data/disc/iso9660-volume.test.ts)：主卷、14 个补充描述符与位于 LBA 31 的终止符（第 16 个描述符）可以打开，卷信息正确，读取日志恰为 LBA 16–31。既有的“16 个描述符内无终止符”拒绝用例仍证明不会读第 17 个。
  - [disc-image.test.ts](../../../../../src/original-data/disc/disc-image.test.ts)（AC-08）：用相同输入、相同初始预算记录（40,000 字节）与相同取消状态，分别新建句柄做两次：
    - 打开：描述符扇区为空，返回 `invalid-volume`；
    - 查找：不存在的路径，返回 `path-not-found`；
    - 读取：原始扇区头部损坏，返回 `invalid-sector`。
    - 每层两次得到的完整 DTO（code、location、reason、limit）相同。同一句柄上重复查找与读取也得到相同错误。
  - [disc-check.test.ts](../../../../../tools/disc-check.test.ts)（AC-11）：从第一个游戏文件的数据扇区起，镜像端口读取失败：
    - 该文件记为 `read-failed`，其余照常核对（checked 3、matched 2），`error` 为 null，`passed` 为 false；
    - 4 个句柄全部关闭；
    - 报告中没有宿主异常里的临时目录路径。
  - 测试辅助 `requestedLbas` 现在遇到不是整扇区的请求即失败，任何多出的不足一扇区的读取都不会被漏掉。
- **检查：**
  - `pnpm exec vitest run src/original-data tools/disc-check.test.ts` 通过；typecheck 与 lint 通过；
  - 完整 `pnpm check` 通过：80 个测试文件共 2086 项测试、build。
- **Rubber-duck：** 没有阻塞项，确认三个用例都不会空过，且各自命中目标路径。非阻塞项“`requestedLbas` 会把不足一扇区的请求截掉”已修复。
- **Simplify：** 只改测试，没有生产代码变更，按流程不需要代码清理。
- **文档影响：** 无需更新。
