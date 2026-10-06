---
type: plan
status: active
phase: P2
task: "11"
subtask: "18"
updated: 2026-10-06
---

# 18 — 本地导入指南与文档收口

**契约来源：** [spec](../spec.md) 的 S-13、AC-22（网络 API 检查与文档）。
**依赖：** 12, 13, 14。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 新增本地导入指南 `docs/guides/local-import.md`（中文）：
  - 需要的文件：同名的 `.ccd` 与 `.img`，可选 `.sub`、`.cue`；
  - 导入、取消、结果与失败的含义；状态阶梯各项的意思；
  - 缓存：自动保存、打开已缓存的资源、重新保存、被浏览器清除时如何重新导入；
  - 查看器的操作与限制（呈现约定未经原版对照、光照不是原版）；
  - 隐私：原版数据只在本浏览器中处理，不上传；
  - 本地生产预览的运行方式（供 19 使用）。
- 更新 [README](../../../../../README.md)：从“只有 P1 合成演示”改为如实描述导入与查看器，权利声明不变。
- 核对并补全[源码结构](../../../../engineering/source-structure.md)与[工程约定](../../../../engineering/README.md)：模块职责、应用端口与测试入口、呈现约定、E2E 路线与命令。各子任务已更新的部分只核对。
- 更新[文档地图](../../../../README.md)或[工具指南](../../../../guides/tools.md)中需要指向新指南的位置（如适用）。
- 在 [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 中新增检查：本任务新增的主线程模块（`app/`、`ui/`、`render/viewer/`）不使用 `fetch`、`XMLHttpRequest`、`WebSocket`、`EventSource` 或 `sendBeacon`。

## 不包含

- 面向发布的部署说明（P5）；STATUS 的阶段摘要（由 20 在完成时更新）。

## 关键文件与契约

- 计划新增 `docs/guides/local-import.md`；修改 [README.md](../../../../../README.md)、[source-structure.md](../../../../engineering/source-structure.md)、[engineering/README.md](../../../../engineering/README.md)、[engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts)。

## 验收标准

- [ ] AC-22（网络 API）：边界测试证明新增的主线程模块不使用所列网络 API。
- [ ] AC-22（文档）：README、源码结构、工程约定与本地导入指南已同步，`updated:` 已更新；链接与元数据检查通过。
- [ ] 指南不含原版内容，只描述结构、操作与限制。
- [ ] `pnpm check` 通过。

## 验证方法

- `pnpm exec vitest run tools/engineering-boundaries.test.ts`，完成前 `pnpm check`。
- 链接与元数据检查。边界测试属于测试代码改动，按 execute-goal 做 rubber-duck；没有实现代码改动时不需要 simplify。

## 完成证据
