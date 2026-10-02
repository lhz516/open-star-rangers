---
type: plan
status: active
phase: P1
task: "01"
subtask: "05"
updated: 2026-10-01
---

# 05 — 本地应用壳冒烟与证据同步

**契约来源：** [spec](../spec.md) 的 S-04、S-05、S-06；AC-06、AC-07、AC-08、AC-09、AC-10。
**依赖：** 04。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 使用当前检查通过的版本重新取得 production build，确认入口 HTML 与其引用资产存在；启动/复用本仓库开发服务并记录实际响应。
- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 在隔离测试上下文访问本地 `pnpm preview` 的构建产物；记录实际浏览器/OS/URL、标题、占位说明，刷新后再次观察。
- 检查未处理应用启动错误与必需脚本/样式加载；未引用 favicon 等自动请求不计为必需资产失败。HTTP 200 不是渲染证据。
- 同步工程说明，指向新检查入口/实际覆盖和已知限制，撤下“一次临时实验即证明全部成立”的说法。TS 与 JS lint 范围、Python 独立检查和 Promise 链限制明确区分。
- 用 AC 关联先前 01 至 04 证据；在全部工程骨架结果成立后恢复对应 STATUS 勾选并更新链接，删除易失效的“21 tests”数量断言。尚未完成的运行骨架和 P1 总验收保持未完成。
- 清理本次拥有的浏览器上下文、服务器和临时实验状态，复用的用户服务不停止；不得重置用户站点存储。

## 不包含

- 不安装 Playwright、修改应用行为、加渲染/游戏测试或 HMR 生命周期检查。
- 不更新原版事实、不执行哈希/许可实现、不部署、不 push。

## 关键文件与契约

- [App](../../../../../src/app/App.tsx)、[main](../../../../../src/main.tsx)、[index.html](../../../../../index.html)：只观察现有行为。
- [Vite](../../../../../vite.config.ts)、[package scripts](../../../../../package.json)：现有 dev/build/preview 入口。
- [工程约定](../../../../engineering/README.md)、[STATUS](../../../../STATUS.md#工程骨架)：直接相关证据/检查说明。
- 01 至 05 的 subtask：验收证据归档；临时构建/截图不变为额外报告或公共 fixture。

## 验收标准

- [x] AC-06：当前工程与 Python 结果有完整引用，02 至 04 回归继续通过。
- [x] AC-07：本地构建入口和引用资产可读，开发服务正确响应本仓库入口。
- [x] AC-08：生产构建在实际浏览器显示现有标题/说明，刷新后正常，无未处理应用启动错误或必需资产失败。
- [x] AC-09：服务/页面/临时文件已按所有权清理，无生产样本、原版访问或用户数据修改。
- [x] AC-10：工程说明和 STATUS 链接以当前可重复证据为准，既有已勾选项只在结果真实成立后恢复，不误勾运行骨架/P1 退出。

## 验证方法

- `pnpm check`；独立 Python 测试；检查实际 `dist/index.html` 引用的构建脚本/样式而非只确认目录存在。
- `pnpm dev --host 127.0.0.1 --port <空闲端口> --strictPort` 和 `pnpm preview --host 127.0.0.1 --port <另一个空闲端口> --strictPort` 是既有命令带 Vite 参数，执行时确定端口并验证进程/响应。
- 浏览器工具直接观察页面、刷新、console/network；能力缺失时 AC-08 保持未满足，不以源码文字代替。
- 文档修改检查相对链接和元数据；本项无新实现代码，通常无需代码 simplify。

## 完成证据

- 2026-10-01：在代码提交 `98873c3` 上验证，之后仅更新文档。`pnpm check` 为 3 文件/49 用例、typecheck/lint/build 全通过；Python `3.12.3` 的独立 XML 测试 3 用例通过。
- 测试前 5173/4173 无监听服务；本次分别启动 dev 与 preview，开发入口成功返回带 Vite client 的页面，生产入口为 HTTP 200。构建 HTML 引用 `/assets/index-DSo0_CBj.js`，资产实际存在。
- 按 browser-testing 创建独立 browser context，1280×800；macOS 上 VS Code Insiders 集成 Electron/Chromium，UA 中 Chromium `150.0.7871.250`、Electron `43.7.3`（不是 Safari 实测）。在 `http://127.0.0.1:4173/` 观察并刷新：

| Criterion | 操作 | 预期 | 实际证据 | Result |
|---|---|---|---|---|
| AC-07 | 构建并检查引用资产、启动 dev/preview | 入口/脚本存在且本地服务正确响应 | HTML/脚本存在，dev/preview 均响应 | passed |
| AC-08 | 新 context 打开生产构建 | React 标题和现有占位说明显示 | h1 为 Open Star Rangers；main 段落为原有开发中/无原版内容说明 | passed |
| AC-08 | 刷新、收集 pageerror/console error/requestfailed | 同样渲染，无启动错误/必需请求失败 | 刷新前后内容相同；errors/failures 均为空，脚本两次请求均 200 | passed |
| AC-09 | 清理浏览器 context 与自有服务 | 用户状态不被更改，测试资源释放 | finally 关闭 context；启动页 handle 随后已不存在；dev/preview 会话已停止，两端口无监听 | passed |

- 构建指纹：HTML SHA-256 `0c56c1a9d4181ca13e8f7f344a038638265c4397a7b11327b83368ba3574bf6e`；JS SHA-256 `eeb7929908d71c8f72ad950d3dd7a521ca798425e25ab1b862e230e24c2b948c`。再次 build 产物一致，不需重新把 HTTP 检查当作浏览器证据。
- [工程说明](../../../../engineering/README.md) 更新为持久回归、实际覆盖与限制；STATUS 恢复已验证的工程骨架项并链接本次证据，去掉固定测试数量/一次性实验断言。运行骨架、合规与整个 P1 退出仍未勾选。
- 未创建用户存储、原版数据、Playwright runner 或游戏功能；无遗留临时生产文件，无本次服务留在后台。
