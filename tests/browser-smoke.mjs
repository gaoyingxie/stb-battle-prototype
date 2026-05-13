import { chromium } from "playwright";
import { startStaticServer } from "../scripts/dev-server.mjs";

const root = process.cwd();
const localServer = await startStaticServer({ root, port: 0 });
const entryUrl = localServer.url;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const battleLayoutViewports = [
  { width: 1920, height: 900 },
  { width: 1920, height: 919 },
  { width: 1600, height: 820 },
  { width: 1366, height: 768 },
  { width: 1290, height: 854 },
];

const consoleMessages = [];
const pageErrors = [];
const portraitResponses = [];
page.on("console", (message) => {
  if (["error", "warning"].includes(message.type())) {
    consoleMessages.push(`${message.type()}: ${message.text()}`);
  }
});
page.on("pageerror", (error) => {
  pageErrors.push(error.message);
});
page.on("response", (response) => {
  const url = response.url();
  if (url.includes("/assets/portraits/") || url.includes("/styles/assets/portraits/")) {
    portraitResponses.push({ status: response.status(), url });
  }
});

async function measureBattleLayout(viewport) {
  await page.setViewportSize(viewport);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => document.querySelectorAll(".war-map .unit-card").length === 6);
  return page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      const bounds = element.getBoundingClientRect();
      return {
        bottom: Math.round(bounds.bottom),
        clientHeight: Math.round(element.clientHeight),
        height: Math.round(bounds.height),
        scrollHeight: Math.round(element.scrollHeight),
        top: Math.round(bounds.top),
      };
    };
    const battlefield = rect(".battlefield");
    const enemyBlock = rect(".enemy-block");
    const warMap = rect(".war-map");
    const cardClipping = [...document.querySelectorAll(".army-block")].some((block) => {
      const blockBounds = block.getBoundingClientRect();
      return [...block.querySelectorAll(".unit-card")].some((card) => {
        const cardBounds = card.getBoundingClientRect();
        return cardBounds.top < blockBounds.top - 1 || cardBounds.bottom > blockBounds.bottom + 1;
      });
    });
    return {
      battlefield,
      battlefieldFitsViewport: battlefield.bottom <= window.innerHeight + 1,
      cardClipping,
      enemyBlock,
      enemyFitsViewport: enemyBlock.bottom <= window.innerHeight + 1,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      warMap,
      warMapFitsBattlefield: warMap.bottom <= battlefield.bottom + 1 && warMap.scrollHeight <= warMap.clientHeight + 1,
    };
  });
}

try {
  await page.goto(entryUrl);
  await page.waitForSelector("#startBattle");
  await page.click("#autoTeam");
  await page.waitForFunction(() => document.querySelector("#systemMessages")?.textContent?.includes("站位职责"));
  await page.click("#startBattle");
  await page.waitForFunction(() => document.querySelector("#startBattle")?.textContent?.includes("第一回合"));
  await page.click("#startBattle");
  await page.waitForFunction(() => document.querySelector("#startBattle")?.textContent?.includes("下一回合"));
  const battlePortraitCheck = await page.evaluate(() => ({
    unitPortraitBackground: getComputedStyle(document.querySelector(".unit-portrait"), "::before").backgroundImage,
    heroCardBackground: getComputedStyle(document.querySelector(".hero-card")).backgroundImage,
  }));
  await page.click("#drawTen");
  await page.waitForSelector("#gachaModal[open]");
  await page.click("#gachaClose");
  await page.click("[data-skill-id]");
  await page.waitForSelector("#skillModal[open]");

  await page.click("#skillModalClose");
  await page.waitForFunction(() => !document.querySelector("#skillModal")?.open);
  const caoRenId = await page.evaluate(() => (
    [...document.querySelectorAll("article.hero-card")]
      .find((card) => card.querySelector(".hero-name")?.textContent?.trim() === "曹仁")
      ?.dataset.heroId
  ));
  if (!caoRenId) throw new Error("武将册没有找到曹仁卡片");
  await page.click(`article.hero-card[data-hero-id="${caoRenId}"] .hero-name`);
  await page.waitForSelector("#heroModal[open]");
  const caoRenDetail = await page.evaluate(() => ({
    desc: document.querySelector("#heroModalDesc")?.textContent?.trim() || "",
    portrait: document.querySelector("#heroModalPortrait img")?.getAttribute("src") || "",
    dismantleText: document.querySelector("#heroModalDismantle")?.textContent?.trim() || "",
  }));
  await page.click("#heroModalClose");

  const summary = await page.evaluate(() => ({
    title: document.querySelector("#battleTitle")?.textContent?.trim(),
    round: document.querySelector("#roundCount")?.textContent?.trim(),
    reportLines: document.querySelectorAll("#report .log-line").length,
    systemMessages: document.querySelectorAll("#systemMessages .system-message").length,
    reportIncludesRecruit: document.querySelector("#report")?.textContent?.includes("招募结果") || false,
    systemIncludesAutoTeam: document.querySelector("#systemMessages")?.textContent?.includes("站位职责") || false,
    battleLogEntries: globalThis.STZB_DEBUG?.state?.activeBattle?.log?.length || 0,
    skillModalTitle: document.querySelector("#skillModalTitle")?.textContent?.trim(),
  }));

  const reportColorCheck = await page.evaluate(() => {
    const heroId = (name, faction, arm) => globalThis.STZB_SEED_DATA.HEROES.find((hero) =>
      hero.name === name && hero.faction === faction && hero.arm === arm
    )?.id;
    const playerTeam = [
      { heroId: heroId("曹操", "魏", "骑"), position: "camp", skills: [] },
      { heroId: heroId("刘备", "蜀", "步"), position: "middle", skills: [] },
      { heroId: heroId("关羽", "蜀", "骑"), position: "front", skills: [] },
    ];
    const enemyTeam = [
      { heroId: heroId("曹操", "魏", "骑"), position: "camp", skills: [] },
      { heroId: heroId("曹仁", "魏", "步"), position: "middle", skills: [] },
      { heroId: heroId("张辽", "魏", "骑"), position: "front", skills: [] },
    ];
    const battle = globalThis.createBattle(playerTeam, enemyTeam);
    globalThis.dealDamage(battle.ctx, battle.enemy[0], battle.player[0], 0.78, "attack", "测试攻击");
    globalThis.dealDamage(battle.ctx, battle.player[0], battle.enemy[0], 0.78, "attack", "测试反击");
    globalThis.writeReport(battle.log);
    const report = document.querySelector("#report");
    const unitNames = [...report.querySelectorAll(".report-unit")].map((node) => ({
      text: node.textContent,
      player: node.classList.contains("report-unit-player"),
      enemy: node.classList.contains("report-unit-enemy"),
    }));
    const avatars = [...report.querySelectorAll(".log-line.hit .report-avatar")].map((node) => ({
      title: node.getAttribute("title"),
      player: node.classList.contains("report-avatar-player"),
      enemy: node.classList.contains("report-avatar-enemy"),
      portrait: node.classList.contains("report-avatar-portrait"),
      borderColor: getComputedStyle(node).borderTopColor,
      src: node.querySelector("img")?.getAttribute("src") || "",
    }));
    const colorChannels = (color) => (color.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
    const isPlayerBlue = (color) => {
      const [red, green, blue] = colorChannels(color);
      return blue > red && blue > green;
    };
    const isEnemyRed = (color) => {
      const [red, green, blue] = colorChannels(color);
      return red > green && red > blue;
    };
    return {
      html: report.innerHTML,
      unitNames,
      avatars,
      hasPlayerAvatar: avatars.some((item) => item.player && item.portrait && item.src.includes("assets/portraits/")),
      hasEnemyAvatar: avatars.some((item) => item.enemy && item.portrait && item.src.includes("assets/portraits/")),
      hasPlayerBlueAvatar: avatars.some((item) => item.player && isPlayerBlue(item.borderColor)),
      hasEnemyRedAvatar: avatars.some((item) => item.enemy && isEnemyRed(item.borderColor)),
      hasPlayerName: unitNames.some((item) => item.text === "曹操" && item.player),
      hasEnemyName: unitNames.some((item) => item.text === "曹操" && item.enemy),
    };
  });

  const fullPrepReportCheck = await page.evaluate(() => {
    const heroId = (name, faction, arm) => globalThis.STZB_SEED_DATA.HEROES.find((hero) =>
      hero.name === name && hero.faction === faction && hero.arm === arm
    )?.id;
    const playerTeam = [
      { heroId: heroId("曹操", "魏", "骑"), position: "camp", skills: ["official-skill-200853"] },
      { heroId: heroId("刘备", "蜀", "步"), position: "middle", skills: [] },
      { heroId: heroId("关羽", "蜀", "骑"), position: "front", skills: [] },
    ];
    const enemyTeam = [
      { heroId: heroId("张辽", "魏", "骑"), position: "camp", skills: [] },
      { heroId: heroId("曹仁", "魏", "步"), position: "middle", skills: [] },
      { heroId: heroId("孙权", "吴", "弓"), position: "front", skills: [] },
    ];
    const battle = globalThis.createBattle(playerTeam, enemyTeam);
    globalThis.writeReport(battle.log);
    const report = document.querySelector("#report");
    const text = report?.textContent || "";
    const reportText = [...(report?.querySelectorAll(".log-line.system .report-text") || [])]
      .find((node) => node.textContent.includes("美人计"));
    return {
      includesFullEnding: text.includes("免疫该次伤害"),
      hasEllipsis: text.includes("…"),
      wrapsLongText: reportText ? reportText.getBoundingClientRect().height > 24 : false,
      text,
    };
  });

  const battleStatsCheck = await page.evaluate(() => {
    const heroId = (name, faction, arm) => globalThis.STZB_SEED_DATA.HEROES.find((hero) =>
      hero.name === name && hero.faction === faction && hero.arm === arm
    )?.id;
    const playerTeam = [
      { heroId: heroId("曹操", "魏", "骑"), position: "camp", skills: [] },
      { heroId: heroId("刘备", "蜀", "步"), position: "middle", skills: [] },
      { heroId: heroId("关羽", "蜀", "骑"), position: "front", skills: [] },
    ];
    const enemyTeam = [
      { heroId: heroId("张辽", "魏", "骑"), position: "camp", skills: [] },
      { heroId: heroId("曹仁", "魏", "步"), position: "middle", skills: [] },
      { heroId: heroId("孙权", "吴", "弓"), position: "front", skills: [] },
    ];
    const battle = globalThis.createBattle(playerTeam, enemyTeam);
    globalThis.dealDamage(battle.ctx, battle.player[0], battle.enemy[0], 0.78, "attack", "测试输出");
    globalThis.dealDamage(battle.ctx, battle.enemy[0], battle.player[1], 0.78, "attack", "测试受击");
    globalThis.heal(battle.ctx, battle.player[2], battle.player[1], 500, "测试治疗");
    globalThis.finishBattle(battle, "player", "roundLimit");
    globalThis.writeReport(battle.log, battle);
    const report = document.querySelector("#report");
    const text = report?.textContent || "";
    return {
      cardCount: report?.querySelectorAll(".battle-stat-card").length || 0,
      hasStats: Boolean(report?.querySelector(".battle-stats")),
      hasTotalDamage: text.includes("总输出"),
      hasTotalHealing: text.includes("总治疗"),
      hasDamageSkill: text.includes("【测试输出】") && text.includes("伤"),
      hasHealingSkill: text.includes("【测试治疗】") && text.includes("疗"),
    };
  });

  const formationConstraintCheck = await page.evaluate(() => {
    const state = globalThis.STZB_DEBUG.state;
    const heroId = (name, faction, arm) => globalThis.STZB_SEED_DATA.HEROES.find((hero) =>
      hero.name === name && hero.faction === faction && hero.arm === arm
    )?.id;
    const skillId = (name) => globalThis.STZB_SEED_DATA.SKILLS.find((skill) => skill.name === name)?.id;
    const luBuCavalry = heroId("吕布", "群", "骑");
    const luBuBow = heroId("吕布", "群", "弓");
    const caoCao = heroId("曹操", "魏", "骑");
    const calmArmy = skillId("安抚军心");
    state.roster[luBuCavalry] = 1;
    state.roster[luBuBow] = 1;
    state.skills[calmArmy] = 1;
    state.formation = [
      { heroId: luBuCavalry, skills: [calmArmy, null] },
      { heroId: luBuBow, skills: [calmArmy, null] },
      { heroId: caoCao, skills: [null, null] },
    ];
    globalThis.renderAll();
    const heroNames = state.formation.map((slot) => globalThis.STZB_SEED_DATA.HEROES.find((hero) => hero.id === slot.heroId)?.name);
    const equippedSkillNames = state.formation.flatMap((slot) => slot.skills || [])
      .filter(Boolean)
      .map((id) => globalThis.STZB_SEED_DATA.SKILLS.find((skill) => skill.id === id)?.name);
    const heroOptions = [...document.querySelectorAll('select[data-kind="hero"]')]
      .flatMap((select, selectIndex) => [...select.options]
        .filter((option) => option.textContent.includes("吕布"))
        .map((option) => ({ selectIndex, text: option.textContent, disabled: option.disabled, selected: option.selected })));
    const calmOptions = [...document.querySelectorAll('select[data-kind="skill"] option')]
      .filter((option) => option.textContent.includes("安抚军心"))
      .map((option) => ({ value: option.value, text: option.textContent, selected: option.selected }));
    const skillGrades = [...document.querySelectorAll('select[data-kind="skill"]')][0]
      ? [...document.querySelectorAll('select[data-kind="skill"]')[0].options]
        .filter((option) => option.value)
        .slice(0, 12)
        .map((option) => option.textContent.match(/· ([SABC])级/)?.[1] || "")
      : [];
    const heroRarities = [...document.querySelectorAll('select[data-kind="hero"]')[0].options]
      .slice(0, 12)
      .map((option) => Number(option.textContent.match(/· (\d)星/)?.[1] || 0));
    const handwrittenCanonicalIds = [...globalThis.STZB_SEED_DATA.HEROES, ...globalThis.STZB_SEED_DATA.SKILLS]
      .filter((item) => item.name && !String(item.id).startsWith("official-"))
      .map((item) => item.id);
    const starterHeroIds = state.formation.map((slot) => slot.heroId);
    return { heroNames, equippedSkillNames, heroOptions, calmOptions, skillGrades, heroRarities, handwrittenCanonicalIds, starterHeroIds };
  });

  const battleLayoutChecks = [];
  for (const viewport of battleLayoutViewports) {
    battleLayoutChecks.push(await measureBattleLayout(viewport));
  }

  if (!summary.reportLines) {
    throw new Error("战报没有渲染任何记录");
  }
  if (summary.battleLogEntries < 3) {
    throw new Error(`战斗日志记录过少：${summary.battleLogEntries}`);
  }
  if (!summary.systemMessages) {
    throw new Error("系统消息没有渲染抽卡记录");
  }
  if (!summary.systemIncludesAutoTeam) {
    throw new Error("自动整备系统消息没有渲染新评分说明");
  }
  if (summary.reportIncludesRecruit) {
    throw new Error("招募结果不应渲染到战报里");
  }
  if (!summary.skillModalTitle) {
    throw new Error("战法详情弹窗没有渲染标题");
  }
  if (!caoRenDetail.portrait || caoRenDetail.desc.includes("暂无武将传记") || caoRenDetail.dismantleText.includes("暂无")) {
    throw new Error(`四星曹仁详情没有补全官方引用：${JSON.stringify(caoRenDetail)}`);
  }
  if (!reportColorCheck.hasPlayerName || !reportColorCheck.hasEnemyName) {
    throw new Error(`同名武将战报没有正确区分敌我颜色：${JSON.stringify(reportColorCheck.unitNames)}`);
  }
  if (!reportColorCheck.hasPlayerAvatar || !reportColorCheck.hasEnemyAvatar) {
    throw new Error(`Report avatars did not render portraits with player/enemy side colors: ${JSON.stringify(reportColorCheck.avatars)}`);
  }
  if (!reportColorCheck.hasPlayerBlueAvatar || !reportColorCheck.hasEnemyRedAvatar) {
    throw new Error(`Report avatar computed border colors do not match player/enemy sides: ${JSON.stringify(reportColorCheck.avatars)}`);
  }
  if (!fullPrepReportCheck.includesFullEnding || fullPrepReportCheck.hasEllipsis || !fullPrepReportCheck.wrapsLongText) {
    throw new Error(`准备回合长战法战报没有完整换行显示：${JSON.stringify(fullPrepReportCheck)}`);
  }
  if (
    !battleStatsCheck.hasStats
    || battleStatsCheck.cardCount !== 6
    || !battleStatsCheck.hasTotalDamage
    || !battleStatsCheck.hasTotalHealing
    || !battleStatsCheck.hasDamageSkill
    || !battleStatsCheck.hasHealingSkill
  ) {
    throw new Error(`战后统计没有正确渲染武将和技能汇总：${JSON.stringify(battleStatsCheck)}`);
  }
  if (new Set(formationConstraintCheck.heroNames).size !== formationConstraintCheck.heroNames.length) {
    throw new Error(`编队仍允许同名武将重复上阵：${JSON.stringify(formationConstraintCheck)}`);
  }
  if (new Set(formationConstraintCheck.equippedSkillNames).size !== formationConstraintCheck.equippedSkillNames.length) {
    throw new Error(`编队仍允许同名战法重复配置：${JSON.stringify(formationConstraintCheck)}`);
  }
  if (formationConstraintCheck.calmOptions.length !== 1 || !formationConstraintCheck.calmOptions[0].value.startsWith("official-skill-")) {
    throw new Error(`安抚军心没有合并为官方代表项：${JSON.stringify(formationConstraintCheck.calmOptions)}`);
  }
  const selectedHeroOption = formationConstraintCheck.heroOptions.find((option) => option.selected);
  if (formationConstraintCheck.heroOptions.some((option) => option.selectIndex !== selectedHeroOption?.selectIndex && !option.disabled)) {
    throw new Error(`已上阵同名武将没有在其他槽位禁用：${JSON.stringify(formationConstraintCheck.heroOptions)}`);
  }
  if (formationConstraintCheck.skillGrades.join("") !== [...formationConstraintCheck.skillGrades].sort((a, b) => "SABC".indexOf(a) - "SABC".indexOf(b)).join("")) {
    throw new Error(`战法下拉没有按 S/A/B/C 排序：${JSON.stringify(formationConstraintCheck.skillGrades)}`);
  }
  if (formationConstraintCheck.heroRarities.some((rarity, index, list) => index > 0 && rarity > list[index - 1])) {
    throw new Error(`武将下拉没有按星级降序排序：${JSON.stringify(formationConstraintCheck.heroRarities)}`);
  }
  if (formationConstraintCheck.starterHeroIds.some((id) => !id?.startsWith("official-"))) {
    throw new Error(`编队运行态仍在使用手写武将 id：${JSON.stringify(formationConstraintCheck.starterHeroIds)}`);
  }
  if (
    !battlePortraitCheck.unitPortraitBackground.includes("/assets/portraits/")
    || battlePortraitCheck.unitPortraitBackground.includes("/styles/assets/portraits/")
    || !battlePortraitCheck.heroCardBackground.includes("/assets/portraits/")
    || battlePortraitCheck.heroCardBackground.includes("/styles/assets/portraits/")
  ) {
    throw new Error(`战场或武将卡头像背景路径错误：${JSON.stringify(battlePortraitCheck)}`);
  }
  const brokenStylePortraits = portraitResponses.filter((item) =>
    item.url.includes("/styles/assets/portraits/") || item.status >= 400
  );
  if (brokenStylePortraits.length) {
    throw new Error(`头像资源请求失败：${JSON.stringify(brokenStylePortraits.slice(0, 6))}`);
  }
  for (const check of battleLayoutChecks) {
    if (!check.battlefieldFitsViewport || !check.enemyFitsViewport || !check.warMapFitsBattlefield || check.cardClipping) {
      throw new Error(`Battlefield layout overflows or clips at ${check.viewport}: ${JSON.stringify(check)}`);
    }
  }
  if (pageErrors.length) {
    throw new Error(`页面错误：${pageErrors.join(" | ")}`);
  }

  console.log(JSON.stringify({
    ...summary,
    caoRenDetail,
    reportColorCheck: { unitNames: reportColorCheck.unitNames, avatars: reportColorCheck.avatars },
    battlePortraitCheck,
    formationConstraintCheck,
    fullPrepReportCheck: {
      includesFullEnding: fullPrepReportCheck.includesFullEnding,
      hasEllipsis: fullPrepReportCheck.hasEllipsis,
      wrapsLongText: fullPrepReportCheck.wrapsLongText,
    },
    battleStatsCheck,
    battleLayoutChecks,
  }, null, 2));
  if (consoleMessages.length) {
    console.warn(consoleMessages.join("\n"));
  }
} finally {
  await browser.close();
  await localServer.close();
}
