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

- [ ] 16 个描述符且终止符位于 LBA 31 时打开成功，读取日志为 LBA 16–31；既有的“无终止符”拒绝用例保持通过。
- [ ] 打开、查找、读取三层各有一个失败用例：重复执行两次得到相同的首个错误 DTO。
- [ ] CLI 读取游戏文件失败时报告 `read-failed`，`passed` 为 false，4 个句柄全部关闭。
- [ ] `pnpm exec vitest run src/original-data tools/disc-check.test.ts` 通过。

## 验证方法

- Node 测试，使用合成镜像与可注入的打开函数。
- 不适用 browser-testing 或原版对照。

## 完成证据
