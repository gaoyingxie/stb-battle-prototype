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
  await page.click("#startBattle");
  await page.waitForFunction(() => document.querySelector("#startBattle")?.textContent?.includes("第一回合"));
  await page.click("#startBattle");
  await page.waitForFunction(() => document.querySelector("#startBattle")?.textContent?.includes("下一回合"));
  await page.click("#drawTen");
  await page.waitForSelector("#gachaModal[open]");
  await page.click("#gachaClose");
  await page.click("[data-skill-id]");
  await page.waitForSelector("#skillModal[open]");

  const summary = await page.evaluate(() => ({
    title: document.querySelector("#battleTitle")?.textContent?.trim(),
    round: document.querySelector("#roundCount")?.textContent?.trim(),
    reportLines: document.querySelectorAll("#report .log-line").length,
    systemMessages: document.querySelectorAll("#systemMessages .system-message").length,
    reportIncludesRecruit: document.querySelector("#report")?.textContent?.includes("招募结果") || false,
    battleLogEntries: globalThis.STZB_DEBUG?.state?.activeBattle?.log?.length || 0,
    skillModalTitle: document.querySelector("#skillModalTitle")?.textContent?.trim(),
  }));

  if (!summary.reportLines) {
    throw new Error("战报没有渲染任何记录");
  }
  if (summary.battleLogEntries < 3) {
    throw new Error(`战斗日志记录过少：${summary.battleLogEntries}`);
  }
  if (!summary.systemMessages) {
    throw new Error("系统消息没有渲染抽卡记录");
  }
  if (summary.reportIncludesRecruit) {
    throw new Error("招募结果不应渲染到战报里");
  }
  if (!summary.skillModalTitle) {
    throw new Error("战法详情弹窗没有渲染标题");
  }
  if (pageErrors.length) {
    throw new Error(`页面错误：${pageErrors.join(" | ")}`);
  }

  console.log(JSON.stringify(summary, null, 2));
  if (consoleMessages.length) {
    console.warn(consoleMessages.join("\n"));
  }
} finally {
  await browser.close();
  await localServer.close();
}
