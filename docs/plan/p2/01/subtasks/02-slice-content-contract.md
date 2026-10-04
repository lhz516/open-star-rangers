---
type: plan
status: active
phase: P2
task: "01"
subtask: "02"
updated: 2026-10-03
---

# 02 — 切片定义与角色清单

**契约来源：** [spec](../spec.md) 的 S-01、S-03、S-04、S-05、S-08、S-10；AC-01 至 AC-04、AC-09。
**依赖：** 01。
**执行状态：** 仅由 [goal tracker](../goal.md#子任务跟踪) 维护。

## 工作范围

- 使用 08 已实现的 Asset ID、资源单位、身份、描述符和封闭资源组契约，定义唯一 `classic-p2-slice`、`SliceDefinition`、版本及所选角色基数；不另建一套 ID/身份类型。
- 按用户 2026-10-03 的粒度选择，每个模型一个规范 Asset；网格几何是模型 payload 内部数据，版本/所有权随模型，不为原版 MESH 创建独立 data Asset。共享源网格可复用解析结果，但发布给模型消费者的视图必须保持隔离；规范模型不得携带原版 mesh entry ID。
- 将 01 的合格候选和角色清单写入唯一生产定义；不合格或未确认候选不得写成成功配置。

## 不包含

- 不重复 08 的基础 ID/类型/身份契约，不实现来源 locator、完整性验证、预算累计或浏览器/Worker/IndexedDB 适配。
- 不选定未由 01 证据支持的模型、敌我关系或玩法规则。

## 关键文件与契约

- 计划新增 `src/content/` 内按职责拆分的纯模块文件与邻接测试入口；当前不存在。
- [tsconfig.core.json](../../../../../tsconfig.core.json)与 [工程边界](../../../../../tools/engineering-boundaries.test.ts)约束纯度。

## 验收标准

- [ ] 生产中仅有一份切片定义，完整角色和组基数与 spec 一致。
- [ ] Asset ID、版本、manifest、origin 和依赖数据是可结构化克隆的纯数据，且调用者修改输入不影响内部值。
- [ ] 合成来源和原版来源具有不可混淆的判别形状。
- [ ] 模型粒度与用户选择一致；几何变化改变所属模型的 payload identity，结构不兼容时按 schema 版本处理；共享源网格不产生可变跨模型别名或泄漏原版定位。

## 验证方法

- Node/Vitest 合成正负 fixture；不读取 `local/`。
- 运行纯模块类型和 lint 边界测试；不适用 browser-testing。

## 完成证据
