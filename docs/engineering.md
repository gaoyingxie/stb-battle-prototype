# 工程说明

## 战况回放实现边界

- 单封战报的 `initialPlayer` / `initialEnemy` 是战况回放的起点；平局后的继战作为下一封战报单独保存和播放。
- 战报列表可以把同一次开战中的前置平局继战折叠到最终结果卡下，但展开后仍按单封战报进入详情和回放，不合并多轮日志。
- `src/report-ui.js` 负责战报弹窗入口和视图路由；`src/battle-replay-ui.js` 负责回放时间轴、播放控制和 DOM 表现。
- `src/battle-engine.js` 仍只负责战斗状态、日志和结算，不接入 DOM、定时器或动画状态。

## 目录结构

```text
index.html                 页面入口
styles/                    UI 样式模块
official-data.js           官方资料生成结果
AGENTS.md                  Agent 入口和文档路由
src/battle-rules.js        规则常量、状态定义、伤害公式
src/seed-data.js           本地种子武将、战法和官方别名
src/battle-engine.js       战斗模拟引擎
src/report-ui.js           战报弹窗、战报快照、系统消息和日志渲染
src/battle-replay-ui.js    战况回放时间轴、播放控制和 2.5D 表现
src/slg-world.js           SLG 地图、军团、命令队列、要塞和 AI 纯模拟
src/world-ui.js            天下地图、地块详情和地块命令 DOM 渲染
src/army-ui.js             军团列表、选中军团和补员入口 DOM 渲染
src/app.js                 DOM 入口、存档、编队、抽卡和战斗流程
scripts/bootstrap.mjs      本地依赖、浏览器和最小检查入口
scripts/scrape-stzb-official.mjs
scripts/download-stzb-portraits.mjs
assets/portraits/          本地武将头像
docs/battle-rules.md       战斗规则文档
docs/engineering.md        工程文档
docs/team-ai.md            AI 配将推荐逻辑文档
docs/decisions/            设计决策记录
```

## 知识分层

- `AGENTS.md` 只做入口和路由，避免堆积系统细节。
- `docs/` 记录可复用的系统事实，包括工程边界、战斗规则、AI 配将和验证路径。
- `docs/decisions/` 记录关键设计决策，解释为什么某些实现不应被随意“优化”。
- `scripts/bootstrap.mjs` 提供稳定进场协议，减少对依赖安装、浏览器安装和最小验证命令的猜测。

首次进入仓库或重建本地环境时运行：

```powershell
npm run bootstrap
```

## 模块边界

- `battle-rules.js` 不访问 DOM，不读写存档，只保存可调规则和纯公式。
- `seed-data.js` 放本地兜底内容：早期种子武将、手写战法、官方名称别名。
- `battle-engine.js` 拥有战斗模拟状态：单位、回合、行动、伤害、治疗、状态生命周期。
- `team-ai.js` 拥有配将推荐逻辑：候选池、选将评分、战法评分和队伍组装策略。
- `report-ui.js` 拥有战报 UI、战报快照、系统消息和日志渲染；它只读写浏览器应用状态，不接入战斗规则。
- `battle-replay-ui.js` 拥有单封战报回放：时间轴、播放状态、进度控制、行动高亮和 2.5D DOM 表现。
- `slg-world.js` 拥有 SLG 纯模拟状态：地图、势力资源、军团、体力、伤兵、命令队列、要塞、驻守和 AI 行动。
- `world-ui.js` 拥有天下地图 DOM：地块格子、资源栏、地块详情和地块命令按钮；它只派发事件，不直接改状态。
- `army-ui.js` 拥有军团管理 DOM：军团卡、选中军团、体力/兵力/伤兵摘要和补员按钮；它只派发事件，不直接改状态。
- `app.js` 拥有浏览器应用状态：localStorage、按钮事件、编队表单、弹窗、抽卡和战斗流程。
- `official-data.js` 是生成物，不手工维护；需要刷新时重新运行抓取脚本。

这个拆法的目标是让后续迭代有明确落点：调公式改 `battle-rules.js`，加原型战法改 `seed-data.js`，改战斗行为改 `battle-engine.js`，改配将推荐改 `team-ai.js`，改战报和系统消息改 `report-ui.js`，改战况回放改 `battle-replay-ui.js`，改其他界面体验改 `app.js`。

## 样式分层

`index.html` 按顺序加载 `styles/` 下的样式模块。新增或调整 UI 时，优先把样式放进已有责任边界，避免重新堆回单一入口文件：

- `base.css`：变量、全局盒模型、页面字体和背景。
- `app-shell.css`：应用外壳、顶栏、品牌区和顶部操作区。
- `controls.css`：通用按钮和图标按钮。
- `layout.css`：三栏主布局、面板结构、面板标题、徽标和结果标签。
- `world.css`：天下地图、资源栏、地块详情、地块标记和命令按钮。
- `army.css`：军团管理区、军团卡、军团状态条和补员入口。
- `roster.css`：编队编辑器、武将列表、战法集、武将卡和列表内小控件。
- `battlefield.css`：战场容器、双方阵列、战斗单位卡、头像、兵力条和战斗内战法标签。
- `modals.css`：战法详情、武将详情、抽卡弹窗和相关动画。
- `battle-summary.css`：交锋结果带、回合计数、战场统计条和队伍兵力汇总。
- `logs.css`：内嵌战报日志、战报头像、战报数值、修正项和系统消息。
- `battle-report.css`：战报入口、战报列表、战报弹窗、回放、统计和阵容视图。
- `responsive.css`：宽度和移动端响应式覆盖。

拆分后的 CSS 仍然依赖加载顺序处理少量共享选择器，例如 `.result-chip`、`.skill-chip` 和 `.text-link`。跨模块改动时先确认是否只是共享控件，能放进 `controls.css` 的不要散落到业务模块里；只服务单个页面区域的样式留在对应模块。

## 数据刷新

重新抓取武将、战法和可拆战法：

```powershell
node .\scripts\scrape-stzb-official.mjs
```

脚本会抓取：

- `hero_extra.json`
- `skill_extra.json`
- 每个 `herolist/{id}.html`

生成结果写入 `official-data.js`。

下载武将头像：

```powershell
node .\scripts\download-stzb-portraits.mjs
```

头像路径规则：

```text
https://g0.gph.netease.com/ngsocial/community/stzb/cn/cards/cut/card_medium_{iconId}.jpg?gameid=g10
```

下载脚本应使用 `iconId || officialId`。有些武将复用同一张头像，验证时应该检查“是否缺少头像引用”，不要用“武将数是否等于图片文件数”作为唯一标准。

## 官方数据归并

应用启动时会把 `official-data.js` 合并到本地种子数据：

- 官方战法会补齐品质、类型、距离、目标、发动率、描述和图标。
- 与本地手写战法同名或命中别名映射时，保留本地战斗实现，只补官方展示字段。
- 官方武将会追加到 `HEROES`，但缺少自带战法映射的条目会跳过。
- 早期种子武将和手写战法只做源码内的战斗行为补充；合并官方数据后，运行态和开局编队都使用官方 id，不保留旧本地 id 兼容分支。
- 编队配置按武将名称和战法名称去重，避免同名不同 id 的官方/种子记录被同时上阵或配置。

## 验证建议

无构建步骤时至少执行：

```powershell
npm run check
```

浏览器冒烟使用 Playwright：

```powershell
npm install
npm run playwright:install
npm run smoke:browser
```

改动战斗规则后，建议再做一次浏览器冒烟：

- 页面能加载。
- 编队下拉能显示武将和战法。
- 点击开战能进入第一回合。
- 战报中能出现伤害明细。
- 武将详情、战法详情、抽卡弹窗能正常打开关闭。

## 迭代约定

- 新增通用状态时，先在 `battle-rules.js` 的 `STATUS_DEFINITIONS` 登记标签、分类和说明，再在 `battle-engine.js` 接入行为。
- 武将攻击距离应优先来自官方/武将自身 `distance` 字段；不要按兵种推导攻击距离。`DEFAULT_ATTACK_DISTANCE` 只是缺失字段时的原型兜底。
- 新增公式常量时，放进 `DAMAGE_MODEL`，不要把魔法数字散落在引擎函数里。
- 新增手写战法时放进 `seed-data.js`，尽量写清 `type`、`trigger`、`chance`、`desc` 和行为函数。
- 新增战报或系统消息 UI 时优先改 `report-ui.js`、`styles/logs.css` 或 `styles/battle-report.css`；新增战况回放逻辑时优先改 `battle-replay-ui.js` 和 `styles/battle-report.css`；新增其他 UI 功能时优先只改 `app.js` 和对应的 `styles/*.css` 模块，避免把 DOM 操作写进战斗引擎。
- `official-data.js` 是生成物；不要在里面做手工修补。
