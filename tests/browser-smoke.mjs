import { chromium } from "playwright";
import { startStaticServer } from "../scripts/dev-server.mjs";

const root = process.cwd();
const localServer = await startStaticServer({ root, port: 0 });
const entryUrl = localServer.url;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

const consoleMessages = [];
const pageErrors = [];
page.on("console", (message) => {
  if (["error", "warning"].includes(message.type())) {
    consoleMessages.push(`${message.type()}: ${message.text()}`);
  }
});
page.on("pageerror", (error) => {
  pageErrors.push(error.message);
});

try {
  await page.goto(entryUrl);
  await page.waitForSelector("#startBattle");
  await page.click("#autoTeam");
  await page.waitForFunction(() => document.querySelector("#systemMessages")?.textContent?.includes("站位职责"));
  await page.click("#startBattle");
  await page.waitForFunction(() => document.querySelector("#startBattle")?.textContent?.includes("第一回合"));
  await page.click("#startBattle");
  await page.waitForFunction(() => document.querySelector("#startBattle")?.textContent?.includes("下一回合"));
  await page.click("#drawTen");
  await page.waitForSelector("#gachaModal[open]");
  await page.click("#gachaClose");
  await page.click("[data-skill-id]");
  await page.waitForSelector("#skillModal[open]");

  await page.click("#skillModalClose");
  await page.waitForFunction(() => !document.querySelector("#skillModal")?.open);
  await page.click('article.hero-card[data-hero-id="cao-ren"] .hero-name');
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
    const playerTeam = [
      { heroId: "cao-cao", position: "camp", skills: [] },
      { heroId: "liu-bei", position: "middle", skills: [] },
      { heroId: "guan-yu", position: "front", skills: [] },
    ];
    const enemyTeam = [
      { heroId: "cao-cao", position: "camp", skills: [] },
      { heroId: "cao-ren", position: "middle", skills: [] },
      { heroId: "zhang-liao", position: "front", skills: [] },
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
      src: node.querySelector("img")?.getAttribute("src") || "",
    }));
    return {
      html: report.innerHTML,
      unitNames,
      avatars,
      hasPlayerAvatar: avatars.some((item) => item.player && item.portrait && item.src.includes("assets/portraits/")),
      hasEnemyAvatar: avatars.some((item) => item.enemy && item.portrait && item.src.includes("assets/portraits/")),
      hasPlayerName: unitNames.some((item) => item.text === "曹操" && item.player),
      hasEnemyName: unitNames.some((item) => item.text === "曹操" && item.enemy),
    };
  });

  const fullPrepReportCheck = await page.evaluate(() => {
    const playerTeam = [
      { heroId: "cao-cao", position: "camp", skills: ["official-skill-200853"] },
      { heroId: "liu-bei", position: "middle", skills: [] },
      { heroId: "guan-yu", position: "front", skills: [] },
    ];
    const enemyTeam = [
      { heroId: "zhang-liao", position: "camp", skills: [] },
      { heroId: "cao-ren", position: "middle", skills: [] },
      { heroId: "sun-quan", position: "front", skills: [] },
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
  if (!fullPrepReportCheck.includesFullEnding || fullPrepReportCheck.hasEllipsis || !fullPrepReportCheck.wrapsLongText) {
    throw new Error(`准备回合长战法战报没有完整换行显示：${JSON.stringify(fullPrepReportCheck)}`);
  }
  if (pageErrors.length) {
    throw new Error(`页面错误：${pageErrors.join(" | ")}`);
  }

  console.log(JSON.stringify({
    ...summary,
    caoRenDetail,
    reportColorCheck: { unitNames: reportColorCheck.unitNames, avatars: reportColorCheck.avatars },
    fullPrepReportCheck: {
      includesFullEnding: fullPrepReportCheck.includesFullEnding,
      hasEllipsis: fullPrepReportCheck.hasEllipsis,
      wrapsLongText: fullPrepReportCheck.wrapsLongText,
    },
  }, null, 2));
  if (consoleMessages.length) {
    console.warn(consoleMessages.join("\n"));
  }
} finally {
  await browser.close();
  await localServer.close();
}
