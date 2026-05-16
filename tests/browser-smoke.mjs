import { chromium } from "playwright";
import { startStaticServer } from "../scripts/dev-server.mjs";

const root = process.cwd();
const localServer = await startStaticServer({ root, port: 0 });
const entryUrl = localServer.url;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const mainViewViewports = [
  { width: 1920, height: 900 },
  { width: 1920, height: 919 },
  { width: 1600, height: 820 },
  { width: 1366, height: 768 },
  { width: 1290, height: 854 },
  { width: 390, height: 844 },
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

async function measureMainViewLayout(viewport) {
  await page.setViewportSize(viewport);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForSelector("#worldMap .world-tile");
  return page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return {
        bottom: Math.round(bounds.bottom),
        clientHeight: Math.round(element.clientHeight),
        height: Math.round(bounds.height),
        scrollHeight: Math.round(element.scrollHeight),
        top: Math.round(bounds.top),
        width: Math.round(bounds.width),
      };
    };
    const visible = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return false;
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
    };
    const worldPanel = rect(".world-panel");
    const worldMap = rect("#worldMap");
    const worldDetail = rect("#worldDetail");
    return {
      battlefieldHidden: !visible(".battlefield"),
      detailVisible: visible("#worldDetail"),
      mapHasTiles: document.querySelectorAll("#worldMap .world-tile").length === 625,
      topbarHidden: !visible(".topbar"),
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      worldMap,
      worldMapInsidePanel: worldMap && worldPanel && worldMap.top >= worldPanel.top && worldMap.width <= worldPanel.width + 1,
      worldPanel,
      worldPanelVisible: visible(".world-panel"),
      worldStartsNearTop: worldPanel && worldPanel.top <= 18,
      worldDetail,
    };
  });
}

try {
  await page.goto(entryUrl);
  await page.waitForSelector("#worldMap .world-tile");
  const worldInitialCheck = await page.evaluate(() => {
    const slg = globalThis.STZB_DEBUG?.state?.slg;
    return {
      hasWorld: Boolean(document.querySelector("#worldMap .world-tile")),
      tileCount: document.querySelectorAll("#worldMap .world-tile").length,
      detailHasActions: Boolean(document.querySelector("#worldDetail [data-world-action='recruit']")),
      turn: slg?.turn,
      playerFood: slg?.factions?.player?.resources?.food,
      playerArmy: slg?.factions?.player?.armyTroops,
      adjacentOwner: slg?.tiles?.find((tile) => tile.id === "5-3")?.ownerId,
    };
  });
  await page.click('#worldMap [data-world-tile-id="3-3"]');
  await page.click('#worldDetail [data-world-action="recruit"]');
  await page.click('#worldMap [data-world-tile-id="5-3"]');
  await page.waitForSelector('#worldDetail [data-world-action="attack"]');
  const worldBeforeAttack = await page.evaluate(() => ({
    turn: globalThis.STZB_DEBUG?.state?.slg?.turn,
    playerFood: globalThis.STZB_DEBUG?.state?.slg?.factions?.player?.resources?.food,
    playerArmy: globalThis.STZB_DEBUG?.state?.slg?.factions?.player?.armyTroops,
  }));
  await page.click('#worldDetail [data-world-action="attack"]');
  await page.waitForFunction(() =>
    globalThis.STZB_DEBUG?.state?.slg?.tiles?.find((tile) => tile.id === "5-3")?.ownerId === "player"
  );
  const emptyRoadTarget = await page.evaluate(() => {
    const slg = globalThis.STZB_DEBUG?.state?.slg;
    const world = globalThis.STZB_SLG_WORLD;
    const rules = globalThis.STZB_SLG_RULES;
    return slg?.tiles?.find((tile) =>
      tile.type === rules.TILE_TYPES.EMPTY
      && !tile.ownerId
      && world.isAttackableTile(slg, rules.PLAYER_FACTION_ID, tile.id)
    )?.id;
  });
  if (!emptyRoadTarget) throw new Error("SLG world should expose an adjacent empty tile for road expansion after first capture");
  await page.click(`#worldMap [data-world-tile-id="${emptyRoadTarget}"]`);
  await page.waitForSelector('#worldDetail [data-world-action="attack"]');
  await page.click('#worldDetail [data-world-action="attack"]');
  await page.waitForFunction((tileId) =>
    globalThis.STZB_DEBUG?.state?.slg?.tiles?.find((tile) => tile.id === tileId)?.ownerId === "player",
    emptyRoadTarget
  );
  await page.click('#worldSummary [data-world-action="end-turn"]');
  await page.waitForFunction((turn) => globalThis.STZB_DEBUG?.state?.slg?.turn > turn, worldBeforeAttack.turn);
  const worldFlowCheck = await page.evaluate(() => {
    const slg = globalThis.STZB_DEBUG?.state?.slg;
    const tile = slg?.tiles?.find((item) => item.id === "5-3");
    return {
      turn: slg?.turn,
      capturedOwner: tile?.ownerId,
      playerFood: slg?.factions?.player?.resources?.food,
      playerArmy: slg?.factions?.player?.armyTroops,
      reports: globalThis.STZB_DEBUG?.state?.battleReports?.length || 0,
      ownedEmptyTiles: slg?.tiles?.filter((item) => item.type === "empty" && item.ownerId === "player").length || 0,
      detailHasAttackable: Boolean(document.querySelector("#worldMap .world-tile.attackable")),
    };
  });
  await page.evaluate(() => globalThis.autoTeam());
  await page.waitForFunction(() => document.querySelector("#systemMessages")?.textContent?.includes("站位职责"));
  await page.waitForSelector('#worldSummary [data-world-action="reports"]');
  const generatedReportCheck = await page.evaluate(() => ({
    badge: document.querySelector("#reportBadge")?.textContent?.trim(),
    worldReportText: document.querySelector('#worldSummary [data-world-action="reports"]')?.textContent?.trim() || "",
    reports: globalThis.STZB_DEBUG?.state?.battleReports?.length || 0,
    lastReportComplete: Boolean(globalThis.STZB_DEBUG?.state?.battleReports?.at(-1)?.battle?.complete),
    activeBattle: Boolean(globalThis.STZB_DEBUG?.state?.activeBattle),
  }));
  await page.click('#worldSummary [data-world-action="reports"]');
  await page.waitForSelector("#battleReportModal[open] .battle-report-card");
  await page.click("#battleReportModal .battle-report-card");
  await page.waitForSelector("#battleReportModal .battle-report-stage");
  const battlePlaceReportCheck = await page.evaluate(() => ({
    activeBars: document.querySelectorAll("#battleReportModal .battle-report-score-bar .troop-fill").length,
    woundedBars: document.querySelectorAll("#battleReportModal .battle-report-score-bar .wounded-fill").length,
    deathBars: document.querySelectorAll("#battleReportModal .battle-report-score-bar .death-fill").length,
    hasWoundedText: document.querySelector("#battleReportModal")?.textContent?.includes("伤"),
    enemyActiveStartsAtLeft: (() => {
      const bar = document.querySelector("#battleReportModal .battle-report-score-bar.enemy");
      const fill = bar?.querySelector(".troop-fill");
      if (!bar || !fill) return false;
      const barRect = bar.getBoundingClientRect();
      const fillRect = fill.getBoundingClientRect();
      return Math.abs(fillRect.left - barRect.left) <= 1.5;
    })(),
  }));
  await page.click('#battleReportModal [data-report-action="replay"]');
  await page.waitForSelector("#battleReportModal .battle-replay");
  const replayInitialCheck = await page.evaluate(() => ({
    replayOpen: Boolean(document.querySelector("#battleReportModal .battle-replay")),
    units: document.querySelectorAll("#battleReportModal .battle-replay-unit").length,
    expectedUnits: (
      (globalThis.STZB_DEBUG?.state?.battleReports?.at(-1)?.battle?.initialPlayer?.length || 0)
      + (globalThis.STZB_DEBUG?.state?.battleReports?.at(-1)?.battle?.initialEnemy?.length || 0)
    ),
    hasControls: Boolean(document.querySelector('#battleReportModal [data-report-action="replay-toggle"]')),
    hasScrubber: Boolean(document.querySelector("#battleReportModal .battle-replay-progress")),
    hasSpeedButtons: document.querySelectorAll('#battleReportModal [data-report-action="replay-speed"]').length,
    step: Number(document.querySelector("#battleReportModal .battle-replay")?.dataset.step || 0),
    total: Number(document.querySelector("#battleReportModal .battle-replay")?.dataset.total || 0),
    persistedInitialSnapshots: Boolean(
      globalThis.STZB_DEBUG?.state?.battleReports?.at(-1)?.battle?.initialPlayer?.length
      && globalThis.STZB_DEBUG?.state?.battleReports?.at(-1)?.battle?.initialEnemy?.length
    ),
  }));
  await page.click('#battleReportModal [data-report-action="replay-toggle"]');
  await page.waitForFunction(() => {
    const step = Number(document.querySelector("#battleReportModal .battle-replay")?.dataset.step || 0);
    return step > 0 && Boolean(document.querySelector("#battleReportModal .battle-replay-unit.active, #battleReportModal .battle-replay-unit.target"));
  });
  const replayAdvancedCheck = await page.evaluate(() => ({
    step: Number(document.querySelector("#battleReportModal .battle-replay")?.dataset.step || 0),
    hasActiveOrTarget: Boolean(document.querySelector("#battleReportModal .battle-replay-unit.active, #battleReportModal .battle-replay-unit.target")),
    hasCaption: Boolean(document.querySelector("#battleReportModal .battle-replay-caption p")?.textContent?.trim()),
    hasEffect: Boolean(document.querySelector("#battleReportModal .battle-replay-float")),
  }));
  await page.click('#battleReportModal [data-report-action="replay-speed"][data-speed="2"]');
  const replaySpeedCheck = await page.evaluate(() => ({
    activeSpeed: document.querySelector('#battleReportModal [data-report-action="replay-speed"].active')?.dataset.speed || "",
  }));
  await page.click('#battleReportModal [data-report-action="log"]');
  await page.waitForSelector("#battleReportModal .log-line");
  const generatedReportModalCheck = await page.evaluate(() => ({
    unreadAfterOpen: document.querySelector("#reportBadge")?.textContent?.trim() || "",
    badgeHidden: Boolean(document.querySelector("#reportBadge")?.hidden),
    modalOpen: Boolean(document.querySelector("#battleReportModal")?.open),
    reportLines: document.querySelectorAll("#battleReportModal .log-line").length,
    actionGroups: document.querySelectorAll("#battleReportModal .report-action-group").length,
    turnJumps: document.querySelectorAll("#battleReportModal .report-turn-jump").length,
    hasTroopAfter: Boolean(document.querySelector("#battleReportModal .report-troop-after")),
    hasActionTroops: [...document.querySelectorAll("#battleReportModal .report-action-head b")]
      .some((node) => node.textContent.includes("兵力")),
    firstJumpMatchesRound: (() => {
      const round = [...document.querySelectorAll("#battleReportModal .report-round-block")]
        .find((block) => block.querySelector(".report-turn-jump"));
      const title = round?.querySelector(".log-line.round span")?.textContent || "";
      const order = round?.querySelector(".report-turn-order")?.textContent || "";
      const match = title.match(/第\s*(\d+)\s*回合/);
      const expected = match ? `${match[1]}.` : title.includes("准备") ? "准." : "";
      return Boolean(expected && order.startsWith(expected));
    })(),
    actionPortraitFitsFull: [...document.querySelectorAll("#battleReportModal .report-action-portrait img")]
      .every((node) => getComputedStyle(node).objectFit === "contain"),
    hasStatsButton: Boolean(document.querySelector('#battleReportModal [data-report-action="stats"]')),
    hasFormationButton: Boolean(document.querySelector('#battleReportModal [data-report-action="formation"]')),
  }));
  await page.click("#battleReportModal .report-turn-jump");
  const battleReportJumpCheck = await page.evaluate(() => {
    const hash = window.location.hash;
    return {
      hash,
      targetExists: Boolean(hash && document.querySelector(hash)),
      targetIsActionGroup: Boolean(hash && document.querySelector(hash)?.classList.contains("report-action-group")),
    };
  });
  const expectedUnreadAfterOpen = Math.max((generatedReportCheck.reports || 0) - 1, 0);
  await page.click('#battleReportModal .battle-report-bottom-nav [data-report-action="formation"]');
  await page.waitForSelector("#battleReportModal .battle-report-formation-row");
  const formationReportCheck = await page.evaluate(() => ({
    rows: document.querySelectorAll("#battleReportModal .battle-report-formation-row").length,
    hasPlayerTab: Boolean(document.querySelector('#battleReportModal [data-report-action="formation-side"][data-side="player"]')),
    hasEnemyTab: Boolean(document.querySelector('#battleReportModal [data-report-action="formation-side"][data-side="enemy"]')),
  }));
  await page.click("#battleReportClose");
  await page.waitForSelector("#battleReportModal .battle-report-stage");
  const battleReportCloseBackCheck = await page.evaluate(() => ({
    modalOpen: Boolean(document.querySelector("#battleReportModal")?.open),
    title: document.querySelector("#battleReportTitle")?.textContent?.trim() || "",
    hasBattleStage: Boolean(document.querySelector("#battleReportModal .battle-report-stage")),
    hasFormationRows: Boolean(document.querySelector("#battleReportModal .battle-report-formation-row")),
  }));
  await page.click("#battleReportClose");
  await page.waitForFunction(() => !document.querySelector("#battleReportModal")?.open);
  const foldedSeriesSeed = await page.evaluate(() => {
    const state = globalThis.STZB_DEBUG.state;
    globalThis.__smokeOriginalReports = state.battleReports;
    const basePlayer = state.formation.map((slot, index) => ({
      ...slot,
      position: globalThis.STZB_BATTLE_RULES.POSITIONS[index].id,
      skills: [],
      troops: index === 0 ? 7200 : 1600,
      wounded: index === 0 ? 1800 : 300,
    }));
    const baseEnemy = state.enemy.map((slot, index) => ({
      ...slot,
      position: globalThis.STZB_BATTLE_RULES.POSITIONS[index].id,
      skills: [],
      troops: index === 0 ? 8100 : 1700,
      wounded: index === 0 ? 900 : 300,
    }));
    const makeDrawBattle = (playerSlots, enemySlots, encounter) => {
      const battle = globalThis.createBattle(playerSlots, enemySlots, {
        freshTroops: false,
        encounter,
        maxEncounters: 2,
      });
      battle.initialPlayer = battle.player.map(globalThis.unitSnapshot);
      battle.initialEnemy = battle.enemy.map(globalThis.unitSnapshot);
      battle.rounds = globalThis.STZB_BATTLE_RULES.DAMAGE_MODEL.maxRounds - 1;
      battle.ctx.round = battle.rounds;
      [...battle.player, ...battle.enemy].forEach((unit) => {
        unit.skills = [];
        unit.stats.attack = 0;
        unit.stats.strategy = 0;
        unit.stats.defense = 9999;
        if (unit.position !== "camp") {
          unit.troops = 0;
          unit.wounded = 600;
        }
      });
      globalThis.advanceBattleRound(battle);
      return battle;
    };
    const makeWinBattle = (playerSlots, enemySlots, encounter) => {
      const battle = globalThis.createBattle(playerSlots, enemySlots, {
        freshTroops: false,
        encounter,
        maxEncounters: 2,
      });
      battle.initialPlayer = battle.player.map(globalThis.unitSnapshot);
      battle.initialEnemy = battle.enemy.map(globalThis.unitSnapshot);
      const enemyCamp = battle.enemy.find((unit) => unit.position === "camp") || battle.enemy[0];
      enemyCamp.troops = 0;
      globalThis.finishBattle(battle, "player", "enemyCampDown");
      return battle;
    };
    const drawBattle = makeDrawBattle(basePlayer, baseEnemy, 1);
    const winBattle = makeWinBattle(
      globalThis.carryTeamForward(basePlayer, drawBattle.player),
      globalThis.carryTeamForward(baseEnemy, drawBattle.enemy),
      2,
    );
    const seriesId = "smoke-folded-draw-series";
    state.battleReports = [];
    globalThis.addBattleReport(globalThis.toBattleSnapshot(drawBattle), { seriesId, seriesIndex: 1, seriesSize: 2 });
    globalThis.addBattleReport(globalThis.toBattleSnapshot(winBattle), { seriesId, seriesIndex: 2, seriesSize: 2 });
    globalThis.renderBattleReportBadge();
    return {
      drawId: state.battleReports[0].id,
      winId: state.battleReports[1].id,
      seriesId,
    };
  });
  await page.click('#worldSummary [data-world-action="reports"]');
  await page.waitForSelector("#battleReportModal[open] .battle-report-series-toggle");
  const foldedSeriesCollapsedCheck = await page.evaluate(() => ({
    cardIds: [...document.querySelectorAll("#battleReportModal .battle-report-card")].map((node) => node.dataset.reportId),
    childCount: document.querySelectorAll("#battleReportModal .battle-report-card.series-child").length,
    count: document.querySelector("#battleReportModal .battle-report-series-count")?.textContent?.trim() || "",
    expanded: document.querySelector("#battleReportModal .battle-report-series-toggle")?.getAttribute("aria-expanded") || "",
  }));
  await page.click("#battleReportModal .battle-report-series-toggle");
  await page.waitForSelector("#battleReportModal .battle-report-card.series-child");
  const foldedSeriesExpandedCheck = await page.evaluate(() => ({
    cardIds: [...document.querySelectorAll("#battleReportModal .battle-report-card")].map((node) => node.dataset.reportId),
    childIds: [...document.querySelectorAll("#battleReportModal .battle-report-card.series-child")].map((node) => node.dataset.reportId),
    expanded: document.querySelector("#battleReportModal .battle-report-series-toggle")?.getAttribute("aria-expanded") || "",
  }));
  await page.click(`#battleReportModal .battle-report-card.series-child[data-report-id="${foldedSeriesSeed.drawId}"]`);
  await page.waitForSelector("#battleReportModal .battle-report-stage");
  const foldedSeriesDrawOpenCheck = await page.evaluate((drawId) => ({
    idMatches: document.querySelector("#battleReportEyebrow")?.textContent?.includes(drawId.slice(-8)) || false,
    hasStage: Boolean(document.querySelector("#battleReportModal .battle-report-stage")),
  }), foldedSeriesSeed.drawId);
  await page.click("#battleReportModal .battle-report-back");
  await page.waitForSelector("#battleReportModal .battle-report-series-toggle");
  await page.click(`#battleReportModal .battle-report-series-row .battle-report-card[data-report-id="${foldedSeriesSeed.winId}"]`);
  await page.waitForSelector("#battleReportModal .battle-report-stage");
  const foldedSeriesWinOpenCheck = await page.evaluate((winId) => ({
    idMatches: document.querySelector("#battleReportEyebrow")?.textContent?.includes(winId.slice(-8)) || false,
    hasStage: Boolean(document.querySelector("#battleReportModal .battle-report-stage")),
  }), foldedSeriesSeed.winId);
  await page.click("#battleReportClose");
  await page.waitForFunction(() => !document.querySelector("#battleReportModal")?.open);
  await page.evaluate(() => {
    const state = globalThis.STZB_DEBUG.state;
    state.battleReports = globalThis.__smokeOriginalReports || state.battleReports;
    delete globalThis.__smokeOriginalReports;
    globalThis.renderBattleReportBadge();
    globalThis.saveState();
  });
  const battlePortraitCheck = await page.evaluate(() => ({
    unitPortraitBackground: getComputedStyle(document.querySelector(".unit-portrait"), "::before").backgroundImage,
    heroCardBackground: getComputedStyle(document.querySelector(".hero-card")).backgroundImage,
  }));
  await page.evaluate(() => globalThis.drawHeroes(10));
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
    reportLines: globalThis.STZB_DEBUG?.state?.battleReports?.at(-1)?.battle?.log?.length || 0,
    systemMessages: document.querySelectorAll("#systemMessages .system-message").length,
    reportIncludesRecruit: document.querySelector("#report")?.textContent?.includes("招募结果") || false,
    systemIncludesAutoTeam: document.querySelector("#systemMessages")?.textContent?.includes("站位职责") || false,
    battleLogEntries: globalThis.STZB_DEBUG?.state?.battleReports?.at(-1)?.battle?.log?.length || 0,
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
    const weiCaoCao = globalThis.STZB_SEED_DATA.HEROES.find((hero) =>
      hero.name === "\u66f9\u64cd" && hero.faction === "\u9b4f" && hero.arm === "\u9a91"
    );
    const hanCaoCao = globalThis.STZB_SEED_DATA.HEROES.find((hero) =>
      hero.name === "\u66f9\u64cd" && hero.faction === "\u6c49" && hero.arm === "\u9a91"
    );
    const sameNameBattle = globalThis.createBattle(
      [{ heroId: weiCaoCao.id, position: "camp", skills: [] }],
      [{ heroId: hanCaoCao.id, position: "camp", skills: [] }],
    );
    globalThis.dealDamage(sameNameBattle.ctx, sameNameBattle.enemy[0], sameNameBattle.player[0], 0.78, "attack", "同名头像测试");
    globalThis.writeReport(sameNameBattle.log);
    const sameNameHit = document.querySelector("#report .log-line.hit");
    const sameNameAvatarSrc = sameNameHit?.querySelector(".report-avatar img")?.getAttribute("src") || "";
    const sameNameActorPortrait = sameNameBattle.log.find((entry) => entry.type === "hit")?.actorState?.portrait || "";
    return {
      html: report.innerHTML,
      unitNames,
      avatars,
      sameNameAvatarSrc,
      sameNameActorPortrait,
      sameNameExpectedPortrait: hanCaoCao.portrait,
      hasPlayerAvatar: avatars.some((item) => item.player && item.portrait && item.src.includes("assets/portraits/")),
      hasEnemyAvatar: avatars.some((item) => item.enemy && item.portrait && item.src.includes("assets/portraits/")),
      hasPlayerBlueAvatar: avatars.some((item) => item.player && isPlayerBlue(item.borderColor)),
      hasEnemyRedAvatar: avatars.some((item) => item.enemy && isEnemyRed(item.borderColor)),
      hasPlayerName: unitNames.some((item) => item.text === "曹操" && item.player),
      hasEnemyName: unitNames.some((item) => item.text === "曹操" && item.enemy),
      sameNameAvatarMatchesActor: sameNameAvatarSrc === sameNameActorPortrait && sameNameAvatarSrc === hanCaoCao.portrait,
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
    globalThis.finishBattle(battle, "player", "enemyCampDown");
    globalThis.writeReport(battle.log, battle);
    const report = document.querySelector("#report");
    const text = report?.textContent || "";
    const resultLine = report?.querySelector(".log-line.result");
    return {
      cardCount: report?.querySelectorAll(".battle-stat-card").length || 0,
      hasStats: Boolean(report?.querySelector(".battle-stats")),
      hasTotalDamage: text.includes("总输出"),
      hasTotalHealing: text.includes("总治疗"),
      hasDamageSkill: text.includes("【测试输出】") && text.includes("伤"),
      hasHealingSkill: text.includes("【测试治疗】") && text.includes("疗"),
      hasResultLine: Boolean(resultLine),
      hasResultGlyph: resultLine?.querySelector(".report-avatar")?.textContent.trim() === "终",
      endIsNotHealing: ![...(report?.querySelectorAll(".log-line.heal .report-text") || [])]
        .some((line) => line.textContent.includes("战斗结束")),
    };
  });

  const roundLimitDrawCheck = await page.evaluate(() => {
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
    const battle = globalThis.createBattle(playerTeam, enemyTeam, { encounter: 1, maxEncounters: 4 });
    battle.rounds = globalThis.STZB_BATTLE_RULES.DAMAGE_MODEL.maxRounds - 1;
    [...battle.player, ...battle.enemy].forEach((unit) => {
      unit.skills = [];
      unit.stats.attack = 0;
      unit.stats.strategy = 0;
      unit.stats.defense = 9999;
      unit.troops = unit.position === "camp" ? (unit.side === "player" ? 5321 : 16531) : 0;
      unit.wounded = 0;
    });
    globalThis.advanceBattleRound(battle);
    return {
      winner: battle.winner,
      label: battle.label,
      finishReason: battle.finishReason,
      subtitle: battle.subtitle,
      logText: battle.log.at(-1)?.text || "",
      playerCampAlive: battle.player.find((unit) => unit.position === "camp")?.troops > 0,
      enemyCampAlive: battle.enemy.find((unit) => unit.position === "camp")?.troops > 0,
    };
  });

  const drawChainReplayCheck = await page.evaluate(() => {
    const state = globalThis.STZB_DEBUG.state;
    const basePlayer = state.formation.map((slot, index) => ({
      ...slot,
      position: globalThis.STZB_BATTLE_RULES.POSITIONS[index].id,
      skills: [],
      troops: index === 0 ? 7200 : 0,
      wounded: index === 0 ? 1800 : 0,
    }));
    const baseEnemy = state.enemy.map((slot, index) => ({
      ...slot,
      position: globalThis.STZB_BATTLE_RULES.POSITIONS[index].id,
      skills: [],
      troops: index === 0 ? 8100 : 0,
      wounded: index === 0 ? 900 : 0,
    }));
    const makeDrawBattle = (playerSlots, enemySlots, encounter) => {
      const battle = globalThis.createBattle(playerSlots, enemySlots, {
        freshTroops: false,
        encounter,
        maxEncounters: 2,
      });
      battle.initialPlayer = battle.player.map(globalThis.unitSnapshot);
      battle.initialEnemy = battle.enemy.map(globalThis.unitSnapshot);
      battle.rounds = globalThis.STZB_BATTLE_RULES.DAMAGE_MODEL.maxRounds - 1;
      battle.ctx.round = battle.rounds;
      [...battle.player, ...battle.enemy].forEach((unit) => {
        unit.skills = [];
        unit.stats.attack = 0;
        unit.stats.strategy = 0;
        unit.stats.defense = 9999;
        if (unit.position !== "camp") {
          unit.troops = 0;
          unit.wounded = 0;
        }
      });
      globalThis.advanceBattleRound(battle);
      return battle;
    };
    const first = makeDrawBattle(basePlayer, baseEnemy, 1);
    const secondPlayer = globalThis.carryTeamForward(basePlayer, first.player);
    const secondEnemy = globalThis.carryTeamForward(baseEnemy, first.enemy);
    const second = makeDrawBattle(secondPlayer, secondEnemy, 2);
    const reports = [first, second].map(globalThis.toBattleSnapshot);
    const playerUnitByPosition = (position) => reports[0].player.find((unit) => unit.position === position);
    const enemyUnitByPosition = (position) => reports[0].enemy.find((unit) => unit.position === position);
    return {
      reportCount: reports.length,
      allDraws: reports.every((report) => report.winner === "draw" && report.finishReason === "roundLimit"),
      encounters: reports.map((report) => report.encounter),
      firstInitialPositions: reports[0].initialPlayer.map((unit) => unit.position),
      secondInitialPositions: reports[1].initialPlayer.map((unit) => unit.position),
      secondEnemyInitialPositions: reports[1].initialEnemy.map((unit) => unit.position),
      firstInitialTroops: reports[0].initialPlayer.map((unit) => unit.troops),
      firstFinalTroops: reports[0].player.map((unit) => unit.troops),
      firstFinalWounded: reports[0].player.map((unit) => unit.wounded),
      secondInitialTroops: reports[1].initialPlayer.map((unit) => unit.troops),
      secondInitialMaxTroops: reports[1].initialPlayer.map((unit) => unit.maxTroops),
      secondLogLength: reports[1].log.length,
      secondInitialMatchesFirstFinal: reports[1].initialPlayer.every((unit) => unit.troops === playerUnitByPosition(unit.position)?.troops),
      secondInitialUsesCarriedCapacity: reports[1].initialPlayer.every((unit, index) =>
        unit.maxTroops === playerUnitByPosition(unit.position).troops + playerUnitByPosition(unit.position).wounded
      ),
      secondInitialSkipsRouted:
        reports[1].initialPlayer.every((unit) => playerUnitByPosition(unit.position)?.troops > 0)
        && reports[1].initialEnemy.every((unit) => enemyUnitByPosition(unit.position)?.troops > 0)
        && reports[1].initialPlayer.length === reports[0].player.filter((unit) => unit.troops > 0).length
        && reports[1].initialEnemy.length === reports[0].enemy.filter((unit) => unit.troops > 0).length,
      secondStartLogShowsMissing: reports[1].log
        .find((entry) => entry.text?.includes("战斗开始"))
        ?.text.includes("缺阵") || false,
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
    const guanYu = heroId("关羽", "蜀", "骑");
    const liuBei = heroId("刘备", "蜀", "步");
    const calmArmy = skillId("安抚军心");
    state.roster[luBuCavalry] = 1;
    state.roster[luBuBow] = 1;
    state.roster[caoCao] = 1;
    state.roster[guanYu] = 1;
    state.roster[liuBei] = 1;
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
    state.formation = [
      { heroId: caoCao, skills: [calmArmy, null] },
      { heroId: guanYu, skills: [null, null] },
      { heroId: liuBei, skills: [null, null] },
    ];
    globalThis.renderAll();
    const campHeroSelect = document.querySelector('select[data-kind="hero"][data-index="0"]');
    campHeroSelect.value = guanYu;
    campHeroSelect.dispatchEvent(new Event("change", { bubbles: true }));
    const swappedHeroIds = state.formation.map((slot) => slot.heroId);
    const swappedHeroNames = state.formation.map((slot) => globalThis.STZB_SEED_DATA.HEROES.find((hero) => hero.id === slot.heroId)?.name);
    const swappedSkillIds = state.formation.map((slot) => slot.skills?.[0] || null);
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
    return {
      heroNames,
      equippedSkillNames,
      heroOptions,
      calmOptions,
      skillGrades,
      heroRarities,
      handwrittenCanonicalIds,
      starterHeroIds,
      swapExpectedHeroIds: [guanYu, caoCao, liuBei],
      swappedHeroIds,
      swappedHeroNames,
      swappedSkillIds,
      swappedSkillExpected: calmArmy,
    };
  });

  const mainViewLayoutChecks = [];
  for (const viewport of mainViewViewports) {
    mainViewLayoutChecks.push(await measureMainViewLayout(viewport));
  }

  if (
    !worldInitialCheck.hasWorld
    || worldInitialCheck.tileCount !== 625
    || !worldInitialCheck.detailHasActions
    || worldInitialCheck.adjacentOwner !== "neutral"
  ) {
    throw new Error(`SLG world did not initialize correctly: ${JSON.stringify(worldInitialCheck)}`);
  }
  if (
    worldBeforeAttack.playerFood >= worldInitialCheck.playerFood
    || worldBeforeAttack.playerArmy <= worldInitialCheck.playerArmy
    || worldFlowCheck.capturedOwner !== "player"
    || worldFlowCheck.turn <= worldBeforeAttack.turn
    || worldFlowCheck.reports < 1
    || worldFlowCheck.ownedEmptyTiles < 1
  ) {
    throw new Error(`SLG world recruit, capture, or end-turn flow failed: ${JSON.stringify({ worldBeforeAttack, worldFlowCheck })}`);
  }
  if (
    generatedReportCheck.badge !== String(generatedReportCheck.reports)
    || generatedReportCheck.reports < 1
    || !generatedReportCheck.lastReportComplete
    || generatedReportCheck.activeBattle
    || !generatedReportCheck.worldReportText.includes("战报")
  ) {
    throw new Error(`SLG 出征后没有生成可从天下主视图打开的未读战报：${JSON.stringify(generatedReportCheck)}`);
  }
  if (!battlePlaceReportCheck.activeBars || !battlePlaceReportCheck.woundedBars || !battlePlaceReportCheck.deathBars || !battlePlaceReportCheck.hasWoundedText || !battlePlaceReportCheck.enemyActiveStartsAtLeft) {
    throw new Error(`战斗地点兵力条没有按死亡/伤兵/剩余三段显示：${JSON.stringify(battlePlaceReportCheck)}`);
  }
  if (
    !replayInitialCheck.replayOpen
    || replayInitialCheck.units !== replayInitialCheck.expectedUnits
    || replayInitialCheck.units < 2
    || !replayInitialCheck.hasControls
    || !replayInitialCheck.hasScrubber
    || replayInitialCheck.hasSpeedButtons !== 3
    || replayInitialCheck.step !== 0
    || replayInitialCheck.total < 3
    || !replayInitialCheck.persistedInitialSnapshots
  ) {
    throw new Error(`Battle replay did not render from a persisted initial snapshot: ${JSON.stringify(replayInitialCheck)}`);
  }
  if (!replayAdvancedCheck.step || !replayAdvancedCheck.hasActiveOrTarget || !replayAdvancedCheck.hasCaption) {
    throw new Error(`Battle replay did not advance or highlight the current event: ${JSON.stringify(replayAdvancedCheck)}`);
  }
  if (replaySpeedCheck.activeSpeed !== "2") {
    throw new Error(`Battle replay speed control did not switch to x2: ${JSON.stringify(replaySpeedCheck)}`);
  }
  if (
    generatedReportModalCheck.unreadAfterOpen !== String(expectedUnreadAfterOpen)
    || generatedReportModalCheck.badgeHidden !== (expectedUnreadAfterOpen <= 0)
    || !generatedReportModalCheck.modalOpen
    || !generatedReportModalCheck.reportLines
    || !generatedReportModalCheck.actionGroups
    || !generatedReportModalCheck.turnJumps
    || !generatedReportModalCheck.hasTroopAfter
    || !generatedReportModalCheck.hasActionTroops
    || !generatedReportModalCheck.firstJumpMatchesRound
    || !generatedReportModalCheck.actionPortraitFitsFull
    || !generatedReportModalCheck.hasStatsButton
    || !generatedReportModalCheck.hasFormationButton
  ) {
    throw new Error(`战报弹层没有正确打开详情/标记已读：${JSON.stringify(generatedReportModalCheck)}`);
  }
  if (!battleReportJumpCheck.targetExists || !battleReportJumpCheck.targetIsActionGroup) {
    throw new Error(`战报左侧行动头像没有跳转到对应动作组：${JSON.stringify(battleReportJumpCheck)}`);
  }
  if (formationReportCheck.rows !== 3 || !formationReportCheck.hasPlayerTab || !formationReportCheck.hasEnemyTab) {
    throw new Error(`阵容详情没有正确渲染战报快照：${JSON.stringify(formationReportCheck)}`);
  }
  if (!battleReportCloseBackCheck.modalOpen || !battleReportCloseBackCheck.hasBattleStage || battleReportCloseBackCheck.hasFormationRows) {
    throw new Error(`阵容详情关闭按钮没有返回战斗地点：${JSON.stringify(battleReportCloseBackCheck)}`);
  }
  if (
    foldedSeriesCollapsedCheck.count !== "1"
    || foldedSeriesCollapsedCheck.expanded !== "false"
    || foldedSeriesCollapsedCheck.cardIds.length !== 1
    || foldedSeriesCollapsedCheck.cardIds[0] !== foldedSeriesSeed.winId
    || foldedSeriesCollapsedCheck.childCount !== 0
  ) {
    throw new Error(`平局继战战报默认折叠状态不正确：${JSON.stringify(foldedSeriesCollapsedCheck)}`);
  }
  if (
    foldedSeriesExpandedCheck.expanded !== "true"
    || !foldedSeriesExpandedCheck.cardIds.includes(foldedSeriesSeed.winId)
    || !foldedSeriesExpandedCheck.childIds.includes(foldedSeriesSeed.drawId)
  ) {
    throw new Error(`平局继战战报展开状态不正确：${JSON.stringify(foldedSeriesExpandedCheck)}`);
  }
  if (!foldedSeriesDrawOpenCheck.idMatches || !foldedSeriesDrawOpenCheck.hasStage) {
    throw new Error(`展开后的平局子战报无法打开详情：${JSON.stringify(foldedSeriesDrawOpenCheck)}`);
  }
  if (!foldedSeriesWinOpenCheck.idMatches || !foldedSeriesWinOpenCheck.hasStage) {
    throw new Error(`折叠组主战报无法打开详情：${JSON.stringify(foldedSeriesWinOpenCheck)}`);
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
  if (!reportColorCheck.sameNameAvatarMatchesActor) {
    throw new Error(`同名不同版本武将的小头像没有使用日志里的武将快照：${JSON.stringify({
      sameNameAvatarSrc: reportColorCheck.sameNameAvatarSrc,
      sameNameActorPortrait: reportColorCheck.sameNameActorPortrait,
      sameNameExpectedPortrait: reportColorCheck.sameNameExpectedPortrait,
    })}`);
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
    || !battleStatsCheck.hasResultLine
    || !battleStatsCheck.hasResultGlyph
    || !battleStatsCheck.endIsNotHealing
  ) {
    throw new Error(`战后统计没有正确渲染武将和技能汇总：${JSON.stringify(battleStatsCheck)}`);
  }
  if (
    roundLimitDrawCheck.winner !== "draw"
    || roundLimitDrawCheck.label !== "平局"
    || roundLimitDrawCheck.finishReason !== "roundLimit"
    || !roundLimitDrawCheck.playerCampAlive
    || !roundLimitDrawCheck.enemyCampAlive
    || roundLimitDrawCheck.subtitle.includes("按战损")
    || !roundLimitDrawCheck.subtitle.includes("第2轮交战")
  ) {
    throw new Error(`八回合大营未破没有判定为平局续战：${JSON.stringify(roundLimitDrawCheck)}`);
  }
  if (
    drawChainReplayCheck.reportCount !== 2
    || !drawChainReplayCheck.allDraws
    || drawChainReplayCheck.encounters.join(",") !== "1,2"
    || !drawChainReplayCheck.secondLogLength
    || !drawChainReplayCheck.secondInitialMatchesFirstFinal
    || !drawChainReplayCheck.secondInitialUsesCarriedCapacity
    || !drawChainReplayCheck.secondInitialSkipsRouted
    || !drawChainReplayCheck.secondStartLogShowsMissing
  ) {
    throw new Error(`Draw-chain battle reports do not keep separate replay starting snapshots: ${JSON.stringify(drawChainReplayCheck)}`);
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
  if (formationConstraintCheck.heroOptions.some((option) => option.disabled)) {
    throw new Error(`已上阵武将不应在其他槽位置灰：${JSON.stringify(formationConstraintCheck.heroOptions)}`);
  }
  if (formationConstraintCheck.swappedHeroIds.join("|") !== formationConstraintCheck.swapExpectedHeroIds.join("|")) {
    throw new Error(`选择已上阵武将没有交换站位：${JSON.stringify(formationConstraintCheck)}`);
  }
  if (formationConstraintCheck.swappedSkillIds[1] !== formationConstraintCheck.swappedSkillExpected) {
    throw new Error(`交换站位没有保留原武将战法配置：${JSON.stringify(formationConstraintCheck)}`);
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
  for (const check of mainViewLayoutChecks) {
    if (
      !check.worldPanelVisible
      || !check.worldStartsNearTop
      || !check.mapHasTiles
      || !check.worldMapInsidePanel
      || !check.detailVisible
      || !check.topbarHidden
      || !check.battlefieldHidden
    ) {
      throw new Error(`SLG main view layout failed at ${check.viewport}: ${JSON.stringify(check)}`);
    }
  }
  if (pageErrors.length) {
    throw new Error(`页面错误：${pageErrors.join(" | ")}`);
  }

  console.log(JSON.stringify({
    ...summary,
    worldInitialCheck,
    worldFlowCheck,
    generatedReportCheck,
    battlePlaceReportCheck,
    generatedReportModalCheck,
    formationReportCheck,
    battleReportCloseBackCheck,
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
    roundLimitDrawCheck,
    mainViewLayoutChecks,
  }, null, 2));
  if (consoleMessages.length) {
    console.warn(consoleMessages.join("\n"));
  }
} finally {
  await browser.close();
  await localServer.close();
}
