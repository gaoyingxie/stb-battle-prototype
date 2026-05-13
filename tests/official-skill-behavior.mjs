import { chromium } from "playwright";
import { startStaticServer } from "../scripts/dev-server.mjs";

const root = process.cwd();
const localServer = await startStaticServer({ root, port: 0 });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

try {
  await page.goto(localServer.url);
  await page.waitForFunction(() => (
    typeof globalThis.createBattle === "function"
    && typeof globalThis.takeAction === "function"
    && typeof globalThis.positionDistance === "function"
  ));

  const result = await page.evaluate(() => {
    const heroId = (name, faction, arm) => globalThis.STZB_SEED_DATA.HEROES.find((hero) =>
      hero.name === name && hero.faction === faction && hero.arm === arm
    )?.id;
    const playerTeam = [
      { heroId: heroId("曹操", "魏", "骑"), position: "camp", skills: [] },
      { heroId: heroId("关羽", "蜀", "骑"), position: "middle", skills: [] },
      { heroId: heroId("刘备", "蜀", "步"), position: "front", skills: [] },
    ];
    const enemyTeam = [
      { heroId: "official-hero-100435", position: "camp", skills: [] },
      { heroId: heroId("曹操", "魏", "骑"), position: "middle", skills: [] },
      { heroId: heroId("关羽", "蜀", "骑"), position: "front", skills: [] },
    ];
    const battle = createBattle(playerTeam, enemyTeam);
    const xiahouyuan = battle.enemy.find((unit) => unit.heroId === "official-hero-100435");
    const allyCaoCao = battle.enemy.find((unit) => unit.position === "middle");
    const playerCaoCao = battle.player.find((unit) => unit.position === "camp");
    const beforeAllyTroops = allyCaoCao.troops;

    takeAction(battle.ctx, xiahouyuan);

    return {
      attackRange: getAttackRange(xiahouyuan),
      distanceToPlayerCamp: positionDistance(xiahouyuan, playerCaoCao),
      beforeAllyTroops,
      afterAllyTroops: allyCaoCao.troops,
      logs: battle.log.map(({ type, text, actor, target, skill, amount }) => ({
        type,
        text,
        actor,
        target,
        skill,
        amount,
      })),
    };
  });

  if (result.distanceToPlayerCamp !== 5) {
    throw new Error(`夏侯渊大营到敌方大营应为5格，实际为${result.distanceToPlayerCamp}`);
  }

  const badSkillDamage = result.logs.find((entry) => entry.skill === "虎步关右" && entry.amount > 0);
  if (badSkillDamage) {
    throw new Error(`虎步关右不应直接造成伤害：${badSkillDamage.text}`);
  }

  if (result.afterAllyTroops !== result.beforeAllyTroops) {
    throw new Error(`虎步关右不应误伤己方曹操：${result.beforeAllyTroops} -> ${result.afterAllyTroops}`);
  }

  if (!result.logs.some((entry) => entry.text.includes("发动【虎步关右】"))) {
    throw new Error("虎步关右应记录为自身增益发动");
  }

  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  await localServer.close();
}
