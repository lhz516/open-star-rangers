---
type: plan
status: active
phase: P2
task: "06"
subtask: "19"
updated: 2026-10-06
---

# 19 — 效果几何数据的本地基准核对

**契约来源：** [spec](../spec.md) 的 AC-21；AC-11 的复跑。
**依赖：** 18。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。由 2026-10-06 的 spec 修订加入，见 [goal 执行记录](../goal.md#执行记录)。

## 工作范围

- 在本地基准镜像上，用被忽略的本地脚本：
  - 把三个 payload 与按 executable 记录的结构独立读取的数据逐项比较，两次运行 SHA-256 相同；
  - 用展开函数展开每条弹丸记录、每个导弹类型与每种碎片形状，核对顶点与面数符合构建规则；
  - 核对用量在 `PRODUCTION_MODEL_SHARE` 之内；
  - 经作业确认 `models` 组只剩 AC-14 的诊断。
- 复跑 [09](./09-local-base-check.md) 的脚本与 logic-check。证据只记命令、计数与判定。

## 不包含

- 截图对照与视觉保真（P2-12）。

## 关键文件与契约

- 本地脚本留在被忽略的 `local/research/p2-06/`；不提交原版内容或脚本输出。

## 验收标准

- [ ] AC-21：payload 与独立读取逐项相等，SHA-256 稳定；展开全部成功，顶点与面数符合规则；用量在份额之内；`models` 组只剩 AC-14 的诊断。
- [ ] 09 的脚本与 logic-check 复跑通过。

## 验证方法

- 本地 Node 脚本；不适用 browser-testing。

## 完成证据
