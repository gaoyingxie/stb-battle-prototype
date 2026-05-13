# 河洛战阵 / STZB Battle Prototype

一个静态 HTML/CSS/JS 的《率土之滨》风格战斗原型，聚焦三人编队、战法配置、抽卡拆解、官方资料导入和一回合一回合推进的 PVE 战斗。

[![Version](https://img.shields.io/badge/version-0.1.0-blue)](package.json)
[![Deploy](https://img.shields.io/badge/deploy-GitHub%20Pages-brightgreen)](https://gaoyingxie.github.io/stb-battle-prototype/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## 在线体验

👉 **[gaoyingxie.github.io/stb-battle-prototype](https://gaoyingxie.github.io/stb-battle-prototype/)**

## 功能特色

- **三人编队**：大营、中军、前锋各 10000 兵，最多 8 回合 PVE 战斗。
- **回合推进**：按回合逐步展示，不一次性跳到结果，战斗过程清晰可读。
- **战法系统**：支持被动、指挥、主动、追击四类战法，含准备回合、发动率判定。
- **抽卡拆解**：十连抽卡，3/4 星自动转狗粮并解锁可拆战法。
- **AI 配将**：自动整备（玩家编队）和郊野守军生成均由统一的 AI 配将引擎驱动。
- **丰富机制**：洞察免疫、怯战、犹豫、混乱、暴走、援护、分兵、反击、兵种克制、同阵营/同兵种加成、灼烧、伤兵池与治疗。
- **本地运行**：零构建步骤，浏览器直接打开 `index.html` 即可。

## 快速开始

直接用浏览器打开 `index.html` 即可运行，无需安装依赖或构建。

如需本地开发服务器（支持热更新）：

```bash
npm run serve
```

页面脚本加载顺序：

| 顺序 | 文件 | 职责 |
|------|------|------|
| 1 | `src/battle-rules.js` | 战斗规则常量、状态定义、伤害公式 |
| 2 | `official-data.js` | 由脚本生成的官方武将/战法资料 |
| 3 | `src/seed-data.js` | 本地种子武将、种子战法、官方别名映射 |
| 4 | `src/battle-engine.js` | 回合推进、选目标、状态、伤害、治疗 |
| 5 | `src/team-ai.js` | AI 配将推荐引擎 |
| 6 | `src/app.js` | DOM、存档、编队、抽卡、弹窗、渲染 |

## 文档

| 文档 | 说明 |
|------|------|
| [战斗规则说明](docs/battle-rules.md) | 状态效果、行动顺序、距离规则、伤害公式、伤兵规则、当前近似点与待校准项 |
| [AI 配将策略](docs/team-ai.md) | 选将评分算法、战法评分逻辑、郊野守军生成规则、扩展建议 |
| [工程说明](docs/engineering.md) | 模块职责与边界、数据刷新脚本、素材路径、验证建议、迭代约定 |

## 技术栈

- **语言**：JavaScript (vanilla，无框架)
- **运行环境**：浏览器（静态 HTML/CSS/JS）
- **测试**：Playwright 冒烟测试 + Node.js 数据完整性测试
- **数据获取**：`scripts/` 下 Node.js 脚本抓取官方资料和头像
- **部署**：GitHub Pages

## 测试

```bash
# 语法检查
npm run check

# 数据完整性测试
npm run test:data

# 战法行为测试
npm run test:skills

# 浏览器冒烟测试（需先安装 Playwright）
npm run playwright:install
npm run smoke:browser
```

## 数据与版权

官方数据和头像来自《率土之滨》公开网页资源，本项目只建议用于本地原型、学习和调试。头像素材版权归原权利方所有，不建议公开商用或再分发素材。

## 更新日志

### v0.1.0 (2026-05-11)

- 初始原型发布
- 三人编队回合制 PVE 战斗引擎
- 被动/指挥/主动/追击四类战法系统
- 十连抽卡与战法拆解
- AI 配将引擎（自动整备 + 郊野守军生成）
- 状态效果：控制、属性、伤害、免疫、光环等 20+ 种
- 兵种克制、阵营/兵种协同加成
- 伤兵池与治疗机制
- 官方资料抓取脚本与头像下载
- Playwright 冒烟测试与数据完整性测试
