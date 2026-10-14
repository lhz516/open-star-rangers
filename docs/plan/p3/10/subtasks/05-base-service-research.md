---
type: plan
status: active
phase: P3
task: "10"
subtask: "05"
updated: 2026-10-14
---

# 05 — 基地内部服务研究

**契约来源：** [spec](../spec.md) 的 S-11、AC-16；[原版研究](../spec.md#原版研究) Q-08，Q-11 中本项路径的数值；[基地内部、修理与补给](../spec.md#基地内部修理与补给)。
**依赖：** 无。
**执行方式：** 自动。原版证据由执行的 agent 按[原版证据获取](../../../../guides/original-evidence.md)自行取得。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- **Q-08：** 在子命令 1–3、`0x39664`、`0x39cb4`、`0x398ec`、`0x39c94`、`0x39d24`、`0x39820` 中核实：
  - 显示列表与服务队列各自的结构与次序，停靠时的初始内容，Enter 的移动与部分进度；
  - `0x39cb4` 对单槽位、组 33/34 与挂点槽位 5、8 的状态与“需要服务”，读的是存储的子系统字段还是挂点列表；
  - `0x398ec` 的每帧服务：生效时刻、时序（机型 +0x54、+0x9C 的单位与除法）、各选择值修理的字段、槽位 5/7/8 的额外调用、船体/能量/护盾/充能/弹药的补给增量与上限、队列出队；控制锁定、扰动与能量耗尽锁存的重置点；
  - 音效请求（SND 10167、10169 与 `0x2d6dc` 的选择音效）在哪个阶段发出、是否实际派发；
  - 离港中断、基地中打开地图时 `0x398ec` 是否运行；基地受攻击、受损或失效的影响；
  - 零容量、非法除数、负数与整数溢出在所选内容中是否可达。
- **运行读数：** 用模拟器内输入取得至少一次受损后停靠的服务链读数（子系统字段、资源与弹药随时钟的变化），供 09 规划预实验；飞行到基地附近先按[对照方法](../spec.md#对照方法与判据)尝试配方输入。
- **Q-11（本项部分）：** 服务计时的整数语义与比较。
- 事实写入 `local/research/p3-10/service/findings.md`：英文，按目标文档与节写成可直接并入的草稿，带置信度（Confirmed/Likely/Unconfirmed）与证据，只记地址、结构与行为，不含原版内容或反编译输出；受影响 U 项的状态变化一并列出。由 06 统一写入 `docs/original/`；本项不改跟踪的原版文档，使 01 至 05 可以并行。
- 完成证据给出交 07、08 的摘要：决定字段、单位、所有者、写入阶段与重置的结论，以及与 spec 已批准方向一致或冲突之处。冲突不在本项改 spec，交 07、08 按关卡处理。

## 不包含

- 停靠与离港本身（04）；服务列表与状态的绘制（P3-13，G-05 的项目页面归 22）。
- 修改任何 spec 或实现代码（07、08 起）。

## 关键文件与契约

- [TABL 10165 选择值](../../../../original/formats/hud.md#tabl-10165-selectors-and-tabl-10399-labels-p3-0304)、[W4](../../../../original/formats/executable.md#w4-mount-damage-repair-and-status-subsystems-5-and-8--confirmed-code)、[D7](../../../../original/formats/executable.md#d7-rescue-and-repair-resets--confirmed-code)、[帧流水线](../../../../original/formats/executable.md#frame-pipeline-p3-0201)是起点；[mounts.ts](../../../../../src/core/rules/mounts.ts) 的 `repairListMounts` 与 `listStatus` 是已有的挂点规则。
- 计划新增：`local/research/p3-10/service/` 下的 Ghidra 脚本、输出、私有只读项目副本与 `findings.md`（被忽略）。

## 写入范围

- `local/research/p3-10/service/**`：研究脚本、输出、私有副本与 findings 草稿（被忽略）。

## 验收标准

- [ ] Q-08 达到门槛（已确认，代码）：列表与队列、状态、每帧服务的时序与字段、补给上限、音效阶段、门禁与非法输入；有至少一次运行读数作交叉核对。
- [ ] 本项路径的数值语义已记录。
- [ ] findings 草稿注明每条事实的目标文档与节，带置信度与证据；本项没有改动跟踪的原版文档，仓库中没有原版内容、反编译输出或读数。
- [ ] 完成证据给出交 07、08 的摘要，并写明与 spec 方向一致或冲突之处。

## 验证方法

- Ghidra 以 `-noanalysis -readOnly` 在 `local/research/p3-10/service/` 的私有副本上运行，函数与 `__watcall` 只建在内存中；寄存器相关结论按原生指令读取，调用者以相对调用与 32 位值的原始扫描核对。
- 需要运行读数时按[运行时测量](../../../../guides/runtime-measurement.md)使用 `tools/baseline/measure.py` 与模拟器内输入，输出只在 `local/`；同一时间只有一个会话操作基准环境，由协调者安排。
- git 审阅确认除本 subtask 文档外没有改动跟踪文件，且没有原版内容、反编译输出或读数。

## 完成证据
