---
type: plan
status: active
phase: P2
task: "02"
subtask: "11"
updated: 2026-10-05
---

# 11 — lead-out 正值与打开时取消锁存补救

**契约来源：** [spec](../spec.md) 的 S-02、S-10；[支持布局](../spec.md#支持布局)中“点 `0xa2` 须有正安全整数 `PLBA`”；[数据模型与契约](../spec.md#数据模型与契约)中“第一次观察到 true 后该句柄保持取消”；AC-02、AC-07。缺口由 [10 第一次最终对齐](./10-final-alignment.md#完成证据)发现。
**依赖：** 01, 02。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **lead-out 正值：** `0xa2` 的 `PLBA` 不是正安全整数时，属于“非法的必需键”，在描述语法阶段返回 `invalid-descriptor@descriptor[Entry n].PLBA`，先于布局检查和镜像大小比较。目前 `PLBA=0` 会一路走到最后的比较，报成 `image-size-mismatch`。
- **打开时取消锁存：** [source-reader.ts](../../../../../src/original-data/disc/source-reader.ts) 的 `readCancellation` 校验探针时若读到 `aborted` 为 true，必须保留这次观察：句柄从一开始就处于取消状态，不读取任何字节。探针初始为 false 时，仍保留实时引用。
- 两项都补充回归测试；不改变其他行为。

## 不包含

- 测试证据补充（12），以及其他布局或限值的调整。

## 关键文件与契约

- **修改：** [clone-cd.ts](../../../../../src/original-data/disc/clone-cd.ts)、[source-reader.ts](../../../../../src/original-data/disc/source-reader.ts)，以及相邻测试。

## 验收标准

- [ ] `0xa2` 的 `PLBA` 为 0 时返回 `invalid-descriptor@descriptor[Entry 2].PLBA`，即使镜像大小与布局另有问题也先报此项；`PLBA` 等于扇区数时照常打开。
- [ ] 探针只在第一次读取时返回 true、之后返回 false：打开返回 `cancelled`，端口请求为 0；初始为 false 的探针在打开后再置 true，仍按实时值取消。
- [ ] `pnpm exec vitest run src/original-data`、`pnpm typecheck`、`pnpm lint` 通过。

## 验证方法

- Node 表驱动测试，按 code 与 location 断言，并检查读取日志。
- 不适用 browser-testing 或原版对照。

## 完成证据
