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

  const priorityResult = await page.evaluate(() => {
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      const heroId = (name, faction, arm) => globalThis.STZB_SEED_DATA.HEROES.find((hero) =>
        hero.name === name && hero.faction === faction && hero.arm === arm
      )?.id;
      const skillId = (name) => globalThis.STZB_SEED_DATA.SKILLS.find((skill) => skill.name === name)?.id;
      const xixiangWugong = skillId("西乡武功");
      const playerTeam = [
        { heroId: heroId("曹操", "魏", "骑"), position: "camp", skills: [xixiangWugong] },
        { heroId: heroId("刘备", "蜀", "步"), position: "middle", skills: [] },
        { heroId: heroId("关羽", "蜀", "骑"), position: "front", skills: [] },
      ];
      const enemyTeam = [
        { heroId: heroId("曹操", "魏", "骑"), position: "camp", skills: [] },
        { heroId: heroId("刘备", "蜀", "步"), position: "middle", skills: [] },
        { heroId: heroId("关羽", "蜀", "骑"), position: "front", skills: [] },
      ];
      const battle = createBattle(playerTeam, enemyTeam);
      const order = [...alive(battle.player), ...alive(battle.enemy)].sort((a, b) => actionSpeed(b) - actionSpeed(a));
      return {
        xixiangWugong,
        priorityStatuses: battle.player.map((unit) => ({
          name: unit.name,
          priority: statusValue(unit, "priority"),
          rounds: unit.statuses.find((status) => status.type === "priority")?.rounds || 0,
        })),
        firstActor: {
          name: order[0]?.name,
          side: order[0]?.side,
        },
        order: order.map((unit) => `${unit.side}:${unit.name}`),
      };
    } finally {
      Math.random = originalRandom;
    }
  });

  if (!priorityResult.xixiangWugong) {
    throw new Error("应能找到官方战法【西乡武功】");
  }

  if (!priorityResult.priorityStatuses.some((status) => status.priority > 0 && status.rounds === 2)) {
    throw new Error(`西乡武功应在战斗前2回合赋予我军先手：${JSON.stringify(priorityResult.priorityStatuses)}`);
  }

  if (priorityResult.firstActor.side !== "player") {
    throw new Error(`西乡武功生效后第一行动方应为我军，实际顺序：${priorityResult.order.join(" -> ")}`);
  }

  const qixuRulinResult = await page.evaluate(() => {
    const heroId = (name, faction, arm) => globalThis.STZB_SEED_DATA.HEROES.find((hero) =>
      hero.name === name && hero.faction === faction && hero.arm === arm
    )?.id;
    const qixuRulin = globalThis.STZB_SEED_DATA.SKILLS.find((skill) => skill.name === "其徐如林");
    const simaYi = globalThis.STZB_SEED_DATA.HEROES.find((hero) =>
      hero.name === "司马懿" && hero.innate === qixuRulin?.id
    );
    const playerTeam = [
      { heroId: simaYi?.id, position: "camp", skills: [] },
      { heroId: heroId("诸葛亮", "蜀", "弓"), position: "middle", skills: [] },
      { heroId: heroId("刘备", "蜀", "步"), position: "front", skills: [] },
    ];
    const enemyTeam = [
      { heroId: heroId("曹操", "魏", "骑"), position: "camp", skills: [] },
      { heroId: heroId("刘备", "蜀", "步"), position: "middle", skills: [] },
      { heroId: heroId("关羽", "蜀", "骑"), position: "front", skills: [] },
    ];
    const battle = createBattle(playerTeam, enemyTeam);
    const caster = battle.player.find((unit) => unit.position === "middle");
    const target = battle.enemy.find((unit) => unit.position === "middle");
    const adjacentEnemies = battle.enemy.filter((unit) => unit.position !== "middle");
    const before = adjacentEnemies.map((unit) => ({ name: unit.name, troops: unit.troops }));
    const beforeValue = caster.statuses.find((status) => status.type === "strategySplash")?.value || 0;
    battle.ctx.round = 1;
    dealDamage(battle.ctx, caster, target, 1, "strategy", "测试策略");
    battle.player.forEach(tickStatuses);
    const afterValue = caster.statuses.find((status) => status.type === "strategySplash")?.value || 0;
    return {
      qixuRulinId: qixuRulin?.id,
      simaYiId: simaYi?.id,
      statuses: battle.player.map((unit) => ({
        name: unit.name,
        splash: unit.statuses.find((status) => status.type === "strategySplash")?.value || 0,
      })),
      before,
      after: adjacentEnemies.map((unit) => ({ name: unit.name, troops: unit.troops })),
      beforeValue,
      afterValue,
      splashLogs: battle.log.filter((entry) => entry.skill === "其徐如林").map(({ text, amount, actor, target, skill }) => ({
        text,
        amount,
        actor,
        target,
        skill,
      })),
    };
  });

  if (!qixuRulinResult.qixuRulinId || !qixuRulinResult.simaYiId) {
    throw new Error(`应能找到司马懿自带战法【其徐如林】：${JSON.stringify(qixuRulinResult)}`);
  }

  if (!qixuRulinResult.statuses.every((status) => status.splash > 0)) {
    throw new Error(`其徐如林应给我军全体挂接策略溅射：${JSON.stringify(qixuRulinResult.statuses)}`);
  }

  if (qixuRulinResult.splashLogs.length < 2) {
    throw new Error(`策略伤害命中中军时，其徐如林应波及相邻敌军：${JSON.stringify(qixuRulinResult.splashLogs)}`);
  }

  if (!qixuRulinResult.after.some((unit, index) => unit.troops < qixuRulinResult.before[index].troops)) {
    throw new Error(`其徐如林没有造成相邻目标兵损：${JSON.stringify(qixuRulinResult)}`);
  }

  if (qixuRulinResult.afterValue <= qixuRulinResult.beforeValue) {
    throw new Error(`其徐如林比例应在回合结束后提升：${JSON.stringify(qixuRulinResult)}`);
  }

  console.log(JSON.stringify({ result, priorityResult, qixuRulinResult }, null, 2));
} finally {
  await browser.close();
  await localServer.close();
}
