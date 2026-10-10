---
type: plan
status: active
phase: P3
task: "04"
subtask: "04"
updated: 2026-10-09
---

# 04 — 应用端口与平台适配器

**契约来源：** [spec](../spec.md) 的 S-05（平台部分）、[离页保护](../spec.md#离页保护)、[数据模型与契约](../spec.md#数据模型与契约)的“应用端口”行、[开发诊断](../spec.md#开发诊断)的文件保存；为 AC-07、AC-10、AC-22 提供端口。
**依赖：** 无。
**执行方式：** 自动。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 计划新增 `src/app/mission/mission-ports.ts`：DOM-free 的需求方端口类型（不含实现）：
  - 种子来源：返回 uint32；异常或非法值由调用者报告为开始失败。
  - 单调毫秒时钟：有限且不倒退。
  - 单次计时器：登记返回非负安全整数句柄后异步回调；取消幂等；登记失败显式抛出。
  - 离页保护：登记一份 `beforeunload` 确认，返回幂等撤销函数；登记失败回滚已取得部分后抛出。
  - 开发文件保存：以文件名与文本保存，返回成功或带原因的失败；拥有并释放 Blob、对象 URL 与临时元素。
- 计划新增浏览器实现（模块导入时无副作用，监听只在调用时安装）：
  - `src/platform/browser/browser-seed.ts`：`crypto.getRandomValues` 取一个 uint32。
  - `src/platform/browser/browser-timer.ts`：`performance.now` 与 `setTimeout`/`clearTimeout` 的单次计时器与时钟。
  - `src/platform/browser/leave-guard.ts`：在 `window` 上登记 `beforeunload`，处理器调用 `preventDefault()` 请求原生确认，不定制提示文字，不在处理器中退出、清理或导出；撤销失败抛出供调用者锁存。
  - `src/platform/files/browser-file-save.ts`：Blob、对象 URL 与临时下载元素的创建与释放；失败、完成与所有者释放都回收；不把浏览器接收下载请求报告为写盘成功。
- 每个适配器按 [keyboard-source.ts](../../../../../src/platform/input/keyboard-source.ts) 的先例，用最小 DOM-free 宿主替身做 Node 测试；只有薄的浏览器连接部分不进入 Node 程序。

## 不包含

- `AppPorts` 与生产入口的接线（09）；任务所有者对端口的使用（05）；原生 `beforeunload` 对话框的浏览器证据（10）。

## 关键文件与契约

- 计划新增：`src/app/mission/mission-ports.ts`；`src/platform/browser/browser-seed.ts`、`browser-timer.ts`、`leave-guard.ts`；`src/platform/files/browser-file-save.ts`；相邻 Node 测试。
- 参照：[browser-session-host.ts](../../../../../src/platform/browser/browser-session-host.ts) 的部分注册回滚；[keyboard-source.ts](../../../../../src/platform/input/keyboard-source.ts) 的 DOM-free 宿主模式；[platform 模块说明](../../../../engineering/modules/platform.md)。

## 写入范围

- `src/app/mission/mission-ports.ts`：计划新增的端口类型。
- `src/platform/browser/browser-seed*.ts`：种子适配器与测试。
- `src/platform/browser/browser-timer*.ts`：时钟与计时器适配器与测试。
- `src/platform/browser/leave-guard*.ts`：离页保护适配器与测试。
- `src/platform/files/browser-file-save*.ts`：文件保存适配器与测试。

## 验收标准

- [ ] 端口类型 DOM-free，位于 `app/mission/`；平台实现无导入时副作用。
- [ ] 种子返回 uint32，宿主异常原样抛出、不回退为固定值或宿主时间。
- [ ] 计时器：句柄可为 0；取消幂等；取消后迟到的回调不执行；时钟非有限或倒退时报告错误。
- [ ] 离页保护：登记一次只安装一个监听；撤销幂等；部分登记失败回滚；处理器只请求原生确认。
- [ ] 文件保存：成功、失败与释放三条路径都回收对象 URL 与临时元素；失败带原因。
- [ ] Node 程序与边界规则接受这些模块（只有 `browser-*` 连接部分不在 Node 程序中）；`pnpm check` 通过。

## 验证方法

- Node：`pnpm exec vitest run src/platform src/app/mission`，宿主替身记录监听、计时器、对象 URL 的取得与释放。
- 原生 `beforeunload` 对话框与下载由 10 在 Chrome 中验证；不适用原版对照。

## 完成证据
