---
id: ADR-0002
type: adr
status: accepted
phase: all
updated: 2026-09-30
related: []
---

# ADR-0002：单个 Vite 项目，不用 monorepo

## 背景

最初计划使用 pnpm workspace 拆分多个包，但项目不发布任何 npm 包，拆包只增加配置成本。

## 决定

单个 Vite + React + TS 项目，一个 `package.json`（`private: true`）。模块是 `src/` 下的目录，边界由 lint 规则检查。目录结构见总计划 §4.1。

## 后果

- `tools/` 中的 Node 脚本直接引用 `src/original-data`。
- 部署目录为 `dist/`。
