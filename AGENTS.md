# Agent 入口指南

这个仓库是《率土之滨》风格战斗模拟器的静态浏览器原型，聚焦三人编队、战法配置、官方资料导入、抽卡拆解、AI 配将推荐和逐回合 PVE 战斗回放。

这个文件只做导航层。稳定的系统事实放在 `docs/`，解释“为什么现在这样设计”的内容放在 `docs/decisions/`。

## 核心地图

- `index.html` 负责页面外壳和脚本加载顺序。
- `styles/` 负责 UI 样式，按基础、外壳、控件、布局、编队、战场、弹窗、战报和响应式拆分。
- `src/battle-rules.js` 负责规则常量、状态定义和公式工具。
- `src/battle-engine.js` 负责战斗模拟状态和回合推进。
- `src/team-ai.js` 负责 AI 阵容和战法推荐。
- `src/seed-data.js` 负责手工维护的种子武将、战法和官方别名映射。
- `src/app.js` 负责浏览器状态、localStorage、DOM 事件、弹窗、抽卡、编队和渲染。
- `official-data.js` 是生成的官方资料，不要手工修改。
- `assets/portraits/` 保存下载的武将头像。
- `scripts/` 保存本地工具、数据刷新脚本和静态开发服务器。
- `tests/` 保存 Node 和 Playwright 验证路径。

## 优先阅读

- 架构边界和验证命令：`docs/engineering.md`
- 战斗规则、状态行为、公式和已知近似点：`docs/battle-rules.md`
- AI 配将推荐行为：`docs/team-ai.md`
- 非显然约束和设计原因：`docs/decisions/`

## 本地进场

首次本地开发前，使用稳定 bootstrap 入口：

```powershell
npm run bootstrap
```

手动浏览器测试使用本地 HTTP 路径：

```powershell
npm start
```

浏览器验证不要通过 `file://` 直接打开 `index.html`。

## 验证路径

改代码后至少跑快速语法检查：

```powershell
npm run check
```

按改动范围选择更完整的验证：

- 数据和生成引用：`npm run test:data`
- 官方战法行为：`npm run test:skills`
- UI、战报、弹窗、系统消息路由：`npm run smoke:browser`

## 硬约束

- 不要手工修改 `official-data.js`；需要刷新时运行 `scripts/scrape-stzb-official.mjs`。
- 不要按兵种推导武将攻击距离；优先使用官方/武将自身 `distance` 字段，`DEFAULT_ATTACK_DISTANCE` 只做兜底。
- DOM 工作留在 `src/app.js`；不要给战斗引擎增加浏览器或 UI 依赖。
- 战斗状态事件进入战报，账号/系统类事件进入系统消息。
- 改设计级行为时，同步更新相关文档或决策记录。
- 如果改动需要新增外部依赖、改生成的官方数据、或重写核心战斗语义，先停下来确认方向。
