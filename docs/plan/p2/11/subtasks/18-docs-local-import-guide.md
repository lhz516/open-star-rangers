---
type: plan
status: active
phase: P2
task: "11"
subtask: "18"
updated: 2026-10-07
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

## 写入范围

- `docs/guides/local-import.md`：计划新增的本地导入指南。
- `README.md`：导入与查看器的描述。
- `docs/engineering/source-structure.md`、`docs/engineering/README.md`：核对并补全。
- `docs/README.md`、`docs/guides/tools.md`：指向新指南的位置（如适用）。
- `tools/engineering-boundaries.test.ts`：网络 API 边界检查。

## 验收标准

- [x] AC-22（网络 API）：边界测试证明新增的主线程模块不使用所列网络 API。
- [x] AC-22（文档）：README、源码结构、工程约定与本地导入指南已同步，`updated:` 已更新；链接与元数据检查通过。
- [x] 指南不含原版内容，只描述结构、操作与限制。
- [x] `pnpm check` 通过。

## 验证方法

- `pnpm exec vitest run tools/engineering-boundaries.test.ts`，完成前 `pnpm check`。
- 链接与元数据检查。边界测试属于测试代码改动，按 execute-goal 做 rubber-duck；没有实现代码改动时不需要 simplify。

## 完成证据

- **网络边界：** [engineering-boundaries.test.ts](../../../../../tools/engineering-boundaries.test.ts) 新增 P2-11 主线程网络回归，覆盖 `app/`、`ui/`、`render/viewer/` 的全部生产 `.ts`/`.tsx`，排除测试与测试支持。复用已有 TypeScript 程序与标识符读取器，拒绝五种 API 的全局、属性、字面量下标与解构引用；正反例覆盖目录、扩展名和引用形式，并证明注释/普通字符串不误报。三个目录均有非空断言。动态拼接不在静态边界的保证内，P2-12 网络审计未被替代。
- **文档：** 新增[本地导入指南](../../../../guides/local-import.md)，覆盖文件组、状态阶梯、取消/失败、自动保存/恢复/重试、同源与缓存清除、查看器/试听、呈现限制、隐私及 19 的真人核对清单。明确 16 递增转换器后必须重新导入，旧键不提供恢复、不迁移、不清理。
  - [README](../../../../../README.md) 如实描述导入与查看器，权利段落不变；[文档地图](../../../../README.md) 加入指南入口。
  - [源码结构](../../../../engineering/source-structure.md) 的当前转换器版本修正为 `osr-import.graphics-2.logic-1.audio-1.models-2`，关联 16 的证据，并修正 P2 尚无任务拆分的旧说明。现有资源持有者、查看器所有者、呈现约定已与实现一致。
  - [工程约定](../../../../engineering/README.md) 补充 preview 命令、网络边界和开发/生产 E2E 路线，修正菜单仍无导入能力与旧页面目录描述；既有端口、测试入口与 CSP 说明保留，指南链接到唯一策略文本。
- **检查（2026-10-07）：**
  - `pnpm exec vitest run tools/engineering-boundaries.test.ts`：95 条通过。
  - `VITEST_MAX_WORKERS=1 pnpm check`：TypeScript、ESLint、152 个测试文件 / 4,531 条测试及生产构建全部通过。沿用 14 的单 worker 环境变量减少并发，不修改测试、超时或仓库配置。仅有既有 TypeScript API 弃用及构建 chunk 大小警告。
  - 对本次涉及的 6 篇文档（含本页）解析 YAML front matter，核对必需字段、`updated: 2026-10-07`、本地 Markdown 链接目标与标题锚点；全部通过。`git diff --check` 通过。
  - `pnpm check:original`：工作树、索引、未跟踪与 9 个构建文件均完成，零发现；人工审阅确认只含自有代码、操作/结构描述和安全元数据，无原版内容。
- **指南命令实测：** 已构建当前代码，运行 `pnpm preview --host 127.0.0.1 --port 5155 --strictPort`（worker 分配端口，替代指南示例 4174），经 `curl --head` 与 Node HTTP 断言核对文档和唯一带哈希的导入 Worker：两者 HTTP 200，CSP 精确等于 `PREVIEW_CONTENT_SECURITY_POLICY`，Worker 为 JavaScript 类型。服务器已停止；未打开浏览器、未读取真实数据。既有浏览器路径证据见 12、13、14，本项不冒称完成 19 或实际 SWA 验收。
- **Rubber-duck：** 一次独立审阅，无阻塞问题。采纳两个文档建议：指出手工预览与 E2E 默认端口冲突的避让方法；在 19 核对清单第一步再次强调旧版本条目不提供恢复、必须重新导入。审阅确认网络规则会保守拒绝任意对象上同名属性；这符合静态边界，不扩展为类型/数据流审计。
- **Simplify 与文档影响：** 仅新增测试及文档，无生产实现代码变化，按本子任务约定无需 simplify。无冻结决定、原版事实或依赖变化，不新增 ADR；工具指南无需重复入口。阶段索引的指南导航由协调者集成时添加，STATUS 与 goal tracker 仍由协调者维护，本 worker 未修改。
