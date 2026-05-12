# 工程说明

## 目录结构

```text
index.html                 页面入口
styles.css                 UI 样式
official-data.js           官方资料生成结果
src/battle-rules.js        规则常量、状态定义、伤害公式
src/seed-data.js           本地种子武将、战法和官方别名
src/battle-engine.js       战斗模拟引擎
src/app.js                 DOM、存档、编队、抽卡、渲染
scripts/scrape-stzb-official.mjs
scripts/download-stzb-portraits.mjs
assets/portraits/          本地武将头像
docs/battle-rules.md       战斗规则文档
docs/engineering.md        工程文档
docs/team-ai.md            AI 配将推荐逻辑文档
```

## 模块边界

- `battle-rules.js` 不访问 DOM，不读写存档，只保存可调规则和纯公式。
- `seed-data.js` 放本地兜底内容：早期种子武将、手写战法、官方名称别名。
- `battle-engine.js` 拥有战斗模拟状态：单位、回合、行动、伤害、治疗、状态生命周期。
- `team-ai.js` 拥有配将推荐逻辑：候选池、选将评分、战法评分和队伍组装策略。
- `app.js` 拥有浏览器应用状态：localStorage、按钮事件、编队表单、弹窗、战报渲染。
- `official-data.js` 是生成物，不手工维护；需要刷新时重新运行抓取脚本。

这个拆法的目标是让后续迭代有明确落点：调公式改 `battle-rules.js`，加原型战法改 `seed-data.js`，改战斗行为改 `battle-engine.js`，改配将推荐改 `team-ai.js`，改界面体验改 `app.js`。

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
- 早期种子武将仍可保留，用于保证开局体验和手写战法样例。

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
- 新增 UI 功能时优先只改 `app.js` 和 `styles.css`，避免把 DOM 操作写进战斗引擎。
- `official-data.js` 是生成物；不要在里面做手工修补。
