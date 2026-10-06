---
type: plan
status: active
phase: P2
task: "07"
subtask: "17"
updated: 2026-10-05
---

# 17 — 最终对齐

**契约来源：** [spec](../spec.md) 的全部范围项 S-01 至 S-11 与验收项 AC-01 至 AC-18；AC-15、AC-16 的最终核对。
**依赖：** 01、02、03、04、05、06、07、08、09、10、11、12、13、14、15、16。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

只做验证，不交付新功能代码。发现缺口时新增修复子任务（新 ID，插入本行之前并加入本行依赖），不在本子任务中修补。

- **覆盖核对：** 逐项核对 [goal 验收覆盖](../goal.md#验收覆盖)中每个 S 与 AC 都有完成证据，证据来自所列子任务。
- **不变量：**
  - 项目中只有一套图像记录转换、调色板展开与布局合成逻辑；
  - 布局 payload 不含 +44/+48 等未确认字段；规范内容中没有机型到图标的查找表；
  - 生产映射没有 `unconfirmed`；地图边框不绑定 DATA，除非 08 的证据证明它就是地图调色板；
  - `PRODUCTION_CONVERTER_VERSION` 含 `graphics` 组件，已有组件不变；协议版本与阶段集合未被本任务改变；
  - 发送第一个组之前完成全部校验；`models` 分区不由本任务发送。
- **边界与隐私（AC-15）：** `content/` 新模块不导入 `original-data`、DOM、Node 或 Three.js；`original-data` 转换不使用 DOM；本任务新增的诊断不含原版字节、条目编号、偏移、文件名或宿主路径；nob-check 只输出计数与失败原因；`workers/` 不使用网络 API；没有新依赖，`package.json`、`pnpm-lock.yaml`、`.nvmrc` 不变。
- **工程检查：** `pnpm check`、`pnpm check:original`、`pnpm test:e2e e2e/import-worker.spec.ts --project=development`。
- **文档（AC-16）：** cockpit、hud、unknowns 记录了 AC-10 至 AC-12、AC-14、AC-17、AC-18 的事实、置信度与观察最大值；源码结构记录布局 payload 字节布局、子资源语法、限值名、错误码与新的 `ConverterVersion`；工具指南记录 nob-check 的新输出；[tasks.md](../../tasks.md) 只有导航；全部改动文档的 `updated:` 为执行日期；链接与元数据检查无问题；文档中没有原版内容。
- **提交范围：** 本任务的提交只触及 `src/`、`e2e/`、`tools/nob-check.ts` 与文档；没有二进制文件、`local/` 路径、长十六进制或 base64 串、反编译标识符。
- **状态：** `node tools/task-state.ts p2/07` 与 tracker 一致；只有阶段摘要、下一步等发生变化时才更新 [STATUS](../../../../STATUS.md)。

## 不包含

- 新功能、研究或修补：缺口转为新的修复子任务。
- P2-12 的最终保真判定与 P2-13 的阶段评审。
- push、部署或其他外部操作。

## 关键文件与契约

- 只读核对全部本任务改动；必要时更新本 goal 的执行记录与 STATUS。

## 验收标准

- [ ] 每个 S 与 AC 都有对应子任务的完成证据。
- [ ] 上列不变量全部成立。
- [ ] AC-15：边界、隐私、依赖与锁文件检查通过；`pnpm check`、`pnpm check:original` 与聚焦 E2E 通过。
- [ ] AC-16：文档事实、置信度、源码结构与工具指南齐全，链接与元数据检查通过，没有原版内容。
- [ ] 提交范围核对通过；`task-state` 与 tracker 一致。

## 验证方法

- 运行上列命令并记录输出摘要；文档链接与元数据检查；`git diff` 与提交列表审阅。
- 浏览器证据引用 14 的结果；原版对照证据引用 07、08–11、15、16 的记录。

## 完成证据
