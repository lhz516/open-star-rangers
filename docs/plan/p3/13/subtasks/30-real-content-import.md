---
type: plan
status: active
phase: P3
task: "13"
subtask: "30"
updated: 2026-10-25
---

# 30 — 本地真实内容独立导入核对

**契约来源：** [spec](../spec.md#验收标准) 的 AC-02/25。
**依赖：** 11。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 用本地合法镜像走产品导入与包验证，独立读取CCKD结构核对调度元数据、图像引用、slot 2几何和内容身份。
- 验证converter/schema切换后旧包不恢复，原版输入不被修改；记录版本、计数、哈希、诊断。
- 检查工具只输出允许的结构摘要；取得31真实候选准备所需的新包身份。

## 不包含

不把真实内容接入自动测试/CI，不实现导入修复、不为此启动DOSBox。

## 关键文件与契约

- [package-check.ts](../../../../../tools/package-check.ts)、[nob-check.ts](../../../../../tools/nob-check.ts)。
- [本地导入指南](../../../../guides/local-import.md) 与 [工具指南](../../../../guides/tools.md) 的既有命令。

## 写入范围

- `local/research/p3-13/import-check/**`：私有独立读取脚本、包验证及版本摘要。

## 验收标准

- [ ] 产品导入与独立结构读取一致，版本/角色/几何/身份可核对。
- [ ] 未读取非授权路径、未上传内容，原版输入文件不变。
- [ ] 故障有明确原因与恢复条件，不用合成包代替真实导入验收。

## 验证方法

按 [原版证据指南](../../../../guides/original-evidence.md) 和工具指南运行实际本机输入路径的 `node tools/package-check.ts`、`node tools/nob-check.ts`；只在本文保留安全摘要。缺数据先使用已记录合法路径，不造数据通过。

## 完成证据
