---
type: guide
status: active
phase: P1
updated: 2026-10-03
related: [ADR-0008, ADR-0012]
---

# Open Star Rangers

独立的浏览器重实现项目，目前只有 **P1 合成工程演示**，不是原版玩法，也不是官方授权或官方产品。演示的形状、颜色与规则由代码自行构造，不需要游戏数据；当前菜单的原版数据导入明确未实现。

## 本地开发

使用[工程约定](./docs/engineering/README.md)规定的 Node/pnpm 版本：

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm check
pnpm test:e2e
```

浏览器回归需要本机已有兼容 Chrome/Chromium，不自动下载浏览器。环境、独立命令、端口/profile 所有权与覆盖限制只在工程约定维护。

从[项目进度](./docs/STATUS.md)、[文档地图](./docs/README.md)与[Agent入口](./AGENTS.md)了解当前实现及下一步；本地研究工具的适用范围见[工具指南](./docs/guides/tools.md)。不要把规划文档视为已交付功能。

## 许可证与原版权利

[MIT License](./LICENSE)仅覆盖本项目自有源码、文档及代码自建合成资源。第三方依赖/资源保留其各自许可和权利义务；MIT **不覆盖或授予原版 Star Rangers 程序、游戏数据、图像、文字、音频或其他原版内容的权利**。玩家必须自行合法取得自己的原版数据，仓库不分发原版内容。原版来源与格式事实只在[原版文档](./docs/original/)维护。

本项目不声称获得官方授权、完成严格 clean-room，或通过名称/商标调查、法律审核及首次公开负责人确认。[许可政策](./docs/decisions/ADR-0008-mit-and-dependency-licenses.md)不等于公开发布授权；本地工程/合规结果不能替代这些确认，也不构成法律意见或原版使用合法性保证。[package.json](./package.json)保持 `private: true`；云部署、CI/发布门禁与首次公开责任留给后续阶段。
