---
type: plan
status: active
phase: P2
task: "01"
subtask: "06"
updated: 2026-10-03
---

# 06 — 合成契约测试与工程边界

**契约来源：** [spec](../spec.md) 的 S-12；AC-02 至 AC-09、AC-11、AC-12。
**依赖：** 02、03、04、05。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 在生产契约旁维护代码生成的合成清单、来源、payload identity、预算和依赖 fixture；自动测试不得读取 `local/`。
- 覆盖正向完整包、单组结果和全部负向路径：角色基数、ID、版本、来源、payload、闭包、身份、预算、所有权和原版隔离。
- 将测试发现、纯模块边界和现有 IMFAT/payload 回归纳入可运行命令；不添加新依赖或第二套 schema。

## 不包含

- 不做浏览器、真实 Worker、File、IndexedDB、GPU、Audio 或原版本地视觉/听觉对照。
- 不替其他子任务实现生产逻辑或修改 spec 契约。

## 关键文件与契约

- 复用 [synthetic.ts](../../../../../src/original-data/synthetic.ts)的测试数据生成模式，但新增内容 fixture 归 `src/content` owner。
- 计划新增邻接 `*.test.ts`；测试不输出原版 payload。

## 验收标准

- [ ] 所有 S/AC 的纯数据正负路径都有可重复断言，错误按 code 而非 message 分类。
- [ ] `src/content` 保持无 DOM/Node/Three.js/Web Audio/IndexedDB 依赖，P1 现有测试保持通过。
- [ ] 合成测试和构建产物不包含原版内容或研究输出。

## 验证方法

- `pnpm exec vitest run src/content src/original-data`
- `pnpm exec vitest run tools/engineering-boundaries.test.ts`
- 完成前按 07 运行 `pnpm check` 与 `pnpm check:original`。
- 不适用 browser-testing；真实浏览器证据归后续 P2 任务。

## 完成证据
