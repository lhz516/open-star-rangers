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

- [x] AC-21：payload 与独立读取逐项相等，SHA-256 稳定；展开全部成功，顶点与面数符合规则；用量在份额之内；`models` 组只剩 AC-14 的诊断。
- [x] 09 的脚本与 logic-check 复跑通过。

## 验证方法

- 本地 Node 脚本；不适用 browser-testing。

## 完成证据

2026-10-06 完成。只运行被忽略的本地脚本，没有改动代码。

- **AC-21：** `node local/research/p2-06/effect-check.ts local/StarRang/cd/STAR_RANGERS.{ccd,img,sub,cue}` 输出 `passed: true`。
  - **独立读取：** 脚本不经产品读取器：
    - RENS 条目用研究用 IMFAT 解析器读取，+0x58 有重定位；
    - EXE 用脚本自己的 LE 页映射读取，本地 EXE 的 SHA-256 与生产白名单一致；
    - 字段按 executable 记录的布局自行解码，位模式经显式小端 `DataView` 转换；
    - RENS 条目号、Asset ID、角色、贴图与导弹常量顺序都在脚本中按文档写出，不取自生产常量；区域位置沿用 `PRODUCTION_EFFECT_REGIONS`，它已由测试对照独立写出的表核对。

    与效果步骤产生的三个 payload 逐字段比较（浮点按 `Object.is`），差异都为 0。另外断言：结果恰为一个 `models` 组，恰好含这三个 Asset，角色、依赖与来源状态对齐。比较器自检：改动一个浮点、一个面表字与贴图 ID 的副本，恰好报出 3 处。
  - **SHA-256 稳定：** 两次各自打开来源完整运行图形、逻辑、模型与效果步骤，三个 payload 的 SHA-256 相同。
  - **展开：** 弹丸 10 条记录、导弹 9 个类型（34 个形状）与碎片 5 个形状都展开成功，坐标都有限。按构建规则逐个形状核对顶点数，并用脚本自己的面表解析核对每个形状的面恰好等于所用模板：
    - 弹丸每条 4 个顶点，面等于所选模板；
    - 导弹机身 2 × 段数个顶点，面恰为 (2j, 2j + 2, 2j + 3, 2j + 1) mod 2n 的四边形；每片尾翼 9 个顶点，面等于尾翼模板；元素 6 个顶点，面等于按标志浮点值选中的模板；附加元素在标志位模式非零时出现，3 个顶点，面等于其模板；
    - 碎片 3 + 2 个形状，各 6 个顶点，面等于各自的模板。

    规则共 110 项，全部通过。三个 payload 依次为 40/40、322/373、30/35 个顶点/三角形，都与 `effectExpansionSize` 一致。
  - **用量：** 效果步骤为 3 个 Asset、2 条依赖边、2,145 字节 payload、392 个顶点、448 个三角形。模型阶段（模型加效果）合计 9 个 Asset、43 条边、163,684 字节、3,939 个顶点、4,148 个三角形，在 `PRODUCTION_MODEL_SHARE` 之内。
  - **作业的 `models` 组：** 12 已解除 AC-14，所以没有剩余诊断，比“只剩 AC-14 的诊断”更强：`models` 组为 `group-complete`，44 个 Asset，0 条诊断（见下）。
- **复跑 09：** `node local/research/p2-06/base-check.ts …` 输出 `passed: true`。
  - 四个组（logic、models、cockpit-hud-map、audio）都为 `group-complete`，0 条诊断；
  - 共用一个包身份，持有者移交全部四个组；
  - 读取 21,157,011 字节，在默认读取上限之内。
- **复跑 logic-check：** `node tools/logic-check.ts …` 输出 `passed: true`。
- 输出只留在被忽略的 `local/research/p2-06/`：`effect-check.json`、`base-check.json`、`logic-check-19.json`。
- **Rubber-duck：** 三项阻断，均已修复后复跑：
  1. 独立一侧原先从生产常量取 RENS 条目号、贴图与常量顺序，也沿用同样的类型数组位转换，现改为按文档在本地写出，并用小端 `DataView`；
  2. 原先只核对多数形状的顶点数，现改为逐个形状核对面；
  3. 原先 `passed` 没有要求三个 Asset 恰好都在，现已断言。

  审阅确认：用量的基线与份额正确；12 完成后没有剩余诊断，满足 AC-21 的最后一项。
- **文档影响：** 不需要更新。效果几何的结构与规则已在 18 与 12 写入 executable、textures 与源码结构；本子任务只是本地核对。
