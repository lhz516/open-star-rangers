---
type: plan
status: active
phase: P3
task: "13"
subtask: "11"
updated: 2026-10-28
---

# 11 — 图形导入与版本全链

**契约来源：** [spec](../spec.md#共享契约修订d-01) 的 S-01，AC-02。
**依赖：** 10。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 将 CCKD 已核实字段转换到 10 的 payload，仍经验证来源、步骤读取、先预算后分配；slot 2 与 map-geometry 同源且一致。
- 唯一角色/切片、payload 验证、生产源映射、Worker 装配、合成任务包、缓存恢复资格一起更新，按 D-01 递增必要版本。
- 扩展现有本地核对工具以输出结构/计数/哈希，不输出内容；查看器旧功能与合法旧 schema 消费不误改。

## 不包含

不增加新导入格式、缓存迁移、媒体或通用资源编辑器。

## 关键文件与契约

- [source-graphics.ts](../../../../../src/original-data/conversion/source-graphics.ts)、[convert-graphics.ts](../../../../../src/original-data/conversion/convert-graphics.ts)、[production-graphics.ts](../../../../../src/original-data/conversion/production-graphics.ts)。
- [slice-definition.ts](../../../../../src/content/slice-definition.ts)、[production-package.ts](../../../../../src/workers/production-package.ts)。

## 写入范围

- `src/original-data/conversion/*graphics*.ts`：读取/转换/源映射及合成测试。
- `src/content/**/*.ts`：仅新角色包验证、合成包及受影响读者测试，不改无关规则。
- `src/workers/*.ts`：新内容装配、版本及导入测试。
- `src/platform/storage/*.test.ts`：旧 converter/schema 拒绝与重导入。
- `tools/nob-check.ts`：结构核对扩展。
- `tools/nob-check.test.ts`：合成工具测试。
- `tools/package-check.ts`：包核对扩展。
- `tools/package-check.test.ts`：合成工具测试。
- `docs/engineering/modules/content.md`：新角色与版本。
- `docs/guides/local-import.md`：重新导入条件。
- `src/original-data/conversion/production-hud-text.ts`：观察距离表的 EXE 区域读取（08 增补）。
- `src/original-data/conversion/production-hud-text.test.ts`：合成测试（08 增补）。
- `src/original-data/conversion/production-executable.ts`：EXE 区域规则（08 增补）。
- `src/original-data/conversion/production-executable.test.ts`：合成测试（08 增补）。

## 验收标准

- [ ] 实际生产转换得到 10 的有效 payload，slot 2 不漂移；来源映射和坏输入拒绝完整。
- [ ] 旧缓存不静默复用，新导入可恢复；唯一切片定义与 converter 同步。
- [ ] 公共测试全合成，查看器既有回归不变。

## 验证方法

`pnpm test -- src/original-data/conversion src/content src/workers src/platform/storage`，再 `pnpm check`；[simplify](../../../../../.agents/skills/simplify/SKILL.md) 限新角色导入链。真实原版核对归 30。

## 完成证据
