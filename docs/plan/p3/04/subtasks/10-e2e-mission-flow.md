---
type: plan
status: active
phase: P3
task: "04"
subtask: "10"
updated: 2026-10-09
---

# 10 — E2E：任务流程、离页保护与导出

**契约来源：** [spec](../spec.md) 的[验证策略](../spec.md#验证策略)；AC-08（浏览器）、AC-10（浏览器）、AC-12、AC-16（E2E）、AC-19（浏览器），AC-22 的开发下载。
**依赖：** 08, 09。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `e2e/support/mission-observations.ts`：进入任务、读取只读 `data-owner`/`data-run`/`data-tick`、等待 tick 前进或稳定、读取开发诊断；并迁入 [demo-observations.ts](../../../../../e2e/support/demo-observations.ts) 中仍被通用用例使用的 `frameWindow` 等 helper（原文件由 13 删除，本项不改其使用者）。
- 计划新增 `e2e/mission-flow.development.spec.ts`（测试入口，01 的合成场景）：
  - 开始资格：没有包、部分包、`loadMission` 失败、`createWorld` 拒绝（留在配置页）与可开始。
  - 完整流程，带与不带僚机各一次：介绍占位（跳过按钮、Enter、Space、Esc 与 3 秒自然结束都覆盖，repeat 与尾事件不推进下一页）→ 配置 → 出发占位（变体标注）→ 飞行（tick 前进、出发时 tick 0）→ 暂停稳定与继续 → 任务菜单（菜单期间不能被旁路继续）→ 重开（新 run、预选上次僚机）→ 返回主菜单（焦点规则）。开发诊断显示玩家与按选择出现的僚机，诊断提交的命令得到带 commandId 的 `not-implemented`。
  - 缺省标注文字（G-01、G-02/1、G-02/2、G-04、G-06、G-07）可见。
  - 离页保护：可信点击开始后真实关闭或刷新出现 Chrome 原生 `beforeunload` 对话框（关闭走 `runBeforeUnload` 路径），取消后同一运行与录制保留；菜单、介绍、配置与 exit 后不出现。
  - 录制导出：开发面板下载录制文件，测试进程以 08 的核对函数与同一合成光盘核对一致；下载资源释放。
- 计划新增 `e2e/mission-flow.production.spec.ts`：用 [production-cache.ts](../../../../../e2e/support/production-cache.ts) 在隔离 context 预置 01 的可开始任务包（版本 4 的完整包，按基线上 P3-03 的 `PRODUCTION_PACKAGE` 转换器版本与限值派生身份与预算），经真实菜单恢复、校验与启动；同样走完整流程（两种僚机、占位、暂停、菜单、重开、返回），只读属性取证；不依赖开发面板。
- 按需扩展 [production-cache.ts](../../../../../e2e/support/production-cache.ts) 与 [app-entry.ts](../../../../../e2e/support/app-entry.ts)。
- 用例在网络审计下运行；不使用合成 visibility 事件或 getter 替换。

## 不包含

- 原生隐藏、资源平衡与 Fast Refresh 的迁移（11）；外壳、合规、生产预览与其余依赖演示用例的迁移（12）；`demo-observations.ts` 的删除（13）。

## 关键文件与契约

- 计划新增：`e2e/mission-flow.development.spec.ts`、`e2e/mission-flow.production.spec.ts`、`e2e/support/mission-observations.ts`。
- 修改：[production-cache.ts](../../../../../e2e/support/production-cache.ts)、[app-entry.ts](../../../../../e2e/support/app-entry.ts)。
- 消费：01 的场景、08 的核对函数、09 的页面与测试端口。

## 写入范围

- `e2e/mission-flow.development.spec.ts`：计划新增。
- `e2e/mission-flow.production.spec.ts`：计划新增。
- `e2e/support/mission-observations.ts`：计划新增的共用 helper。
- `e2e/support/production-cache.ts`：预置可开始任务包。
- `e2e/support/app-entry.ts`：测试入口选项。

## 验收标准

- [ ] AC-08（浏览器）：四种不能开始的原因与可开始在页面上正确显示。
- [ ] AC-12：开发与生产各走完整流程，两种僚机配置各一次，五种占位结束方式都覆盖，repeat/尾事件不推进；tick 前进、暂停稳定、出发 tick 0、重开新 run；菜单期间不能旁路继续；返回焦点正确；开发诊断的实体与命令反馈正确。
- [ ] AC-10（浏览器）：原生 `beforeunload` 对话框只在有运行时出现，取消后运行与录制保留。
- [ ] AC-16（E2E）：下载的录制在测试进程中核对一致；AC-22：下载资源释放。
- [ ] AC-19（浏览器）：缺省标注可见。
- [ ] 无未声明的控制台错误或网络审计违规；`pnpm test:e2e e2e/mission-flow.development.spec.ts --project=development` 与 `pnpm test:e2e e2e/mission-flow.production.spec.ts --project=production` 通过。

## 验证方法

- 按 [browser-testing](../../../../../.agents/skills/browser-testing/SKILL.md) 编写与运行，合成内容，隔离 context；记录 Chrome 版本。
- 不适用原版对照。

## 完成证据
