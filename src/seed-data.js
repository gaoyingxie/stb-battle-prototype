(function registerSeedData(global) {
  const HEROES = [
    {
      id: "cao-cao",
      name: "曹操",
      faction: "魏",
      arm: "骑",
      rarity: 5,
      innate: "wei-command",
      dismantles: ["official-skill-远攻秘策"],
      portrait: "assets/portraits/100023.jpg",
      cost: 3.5,
      distance: 2,
      stats: { attack: 91, strategy: 96, defense: 88, speed: 91 },
    },
    {
      id: "liu-bei",
      name: "刘备",
      faction: "蜀",
      arm: "步",
      rarity: 5,
      innate: "benevolence",
      dismantles: ["official-skill-神兵天降"],
      portrait: "assets/portraits/100016.jpg",
      cost: 3.5,
      distance: 3,
      stats: { attack: 74, strategy: 91, defense: 90, speed: 63 },
    },
    {
      id: "sun-quan",
      name: "孙权",
      faction: "吴",
      arm: "弓",
      rarity: 5,
      innate: "royal-cover",
      stats: { attack: 78, strategy: 94, defense: 82, speed: 72 },
    },
    {
      id: "guan-yu",
      name: "关羽",
      faction: "蜀",
      arm: "骑",
      rarity: 5,
      innate: "green-dragon",
      stats: { attack: 100, strategy: 76, defense: 92, speed: 86 },
    },
    {
      id: "lu-bu",
      name: "吕布",
      faction: "群",
      arm: "骑",
      rarity: 5,
      innate: "flying-general",
      stats: { attack: 110, strategy: 45, defense: 82, speed: 104 },
    },
    {
      id: "zhou-yu",
      name: "周瑜",
      faction: "吴",
      arm: "弓",
      rarity: 5,
      innate: "red-cliff",
      stats: { attack: 71, strategy: 108, defense: 76, speed: 78 },
    },
    {
      id: "zhang-liao",
      name: "张辽",
      faction: "魏",
      arm: "骑",
      rarity: 5,
      innate: "surprise-raid",
      stats: { attack: 96, strategy: 72, defense: 85, speed: 103 },
    },
    {
      id: "zhuge-liang",
      name: "诸葛亮",
      faction: "蜀",
      arm: "弓",
      rarity: 5,
      innate: "empty-fort",
      stats: { attack: 62, strategy: 112, defense: 83, speed: 67 },
    },
    {
      id: "sun-shangxiang",
      name: "孙尚香",
      faction: "吴",
      arm: "弓",
      rarity: 4,
      innate: "bow-flurry",
      stats: { attack: 93, strategy: 70, defense: 74, speed: 88 },
    },
    {
      id: "zhang-fei",
      name: "张飞",
      faction: "蜀",
      arm: "步",
      rarity: 4,
      innate: "battle-roar",
      stats: { attack: 99, strategy: 48, defense: 91, speed: 69 },
    },
    {
      id: "diao-chan",
      name: "貂蝉",
      faction: "群",
      arm: "弓",
      rarity: 4,
      innate: "moon-snare",
      stats: { attack: 61, strategy: 98, defense: 70, speed: 85 },
    },
    {
      id: "cao-ren",
      name: "曹仁",
      faction: "魏",
      arm: "步",
      rarity: 4,
      innate: "iron-wall",
      stats: { attack: 78, strategy: 66, defense: 104, speed: 58 },
    },
  ];
  
  const SKILLS = [
    {
      id: "wei-command",
      name: "魏武之威",
      type: "指挥",
      trigger: "command",
      desc: "前3回合我军伤害提高",
      apply(ctx, unit) {
        unit.sideUnits.forEach((ally) => addStatus(ally, "damageUp", 3, 0.12));
        log(ctx, "system", `${unit.name}发动【魏武之威】，我军前三回合攻势提升。`);
      },
    },
    {
      id: "benevolence",
      name: "仁德载世",
      type: "主动",
      chance: 0.45,
      desc: "恢复我军伤兵",
      use(ctx, unit) {
        const allies = alive(unit.sideUnits).sort((a, b) => a.troops - b.troops).slice(0, 2);
        allies.forEach((ally) => heal(ctx, unit, ally, 860 + unit.stats.strategy * 6, "仁德载世"));
        return allies.length > 0;
      },
    },
    {
      id: "royal-cover",
      name: "九锡黄龙",
      type: "指挥",
      trigger: "command",
      desc: "前2回合规避与防御",
      apply(ctx, unit) {
        unit.sideUnits.forEach((ally) => {
          addStatus(ally, "evade", 2, 0.22);
          addStatus(ally, "defenseUp", 2, 14);
        });
        log(ctx, "system", `${unit.name}发动【九锡黄龙】，我军获得规避与防御。`);
      },
    },
    {
      id: "green-dragon",
      name: "千里单骑",
      type: "追击",
      trigger: "pursuit",
      chance: 0.44,
      desc: "普攻后追击并回血",
      use(ctx, unit, target) {
        dealDamage(ctx, unit, target, 0.95, "attack", "千里单骑");
        heal(ctx, unit, unit, 460 + unit.stats.attack * 3.4, "千里单骑");
        return true;
      },
    },
    {
      id: "flying-general",
      name: "飞将无双",
      type: "主动",
      chance: 0.35,
      desc: "猛烈攻击敌军群体",
      use(ctx, unit) {
        pickTargets(unit.enemyUnits, 3).forEach((target) =>
          dealDamage(ctx, unit, target, 1.12, "attack", "飞将无双"),
        );
        return true;
      },
    },
    {
      id: "red-cliff",
      name: "火烧赤壁",
      type: "主动",
      chance: 0.42,
      desc: "策略伤害并灼烧",
      use(ctx, unit) {
        pickTargets(unit.enemyUnits, 2).forEach((target) => {
          dealDamage(ctx, unit, target, 1.02, "strategy", "火烧赤壁");
          addStatus(target, "burn", 2, 420 + unit.stats.strategy * 2);
        });
        return true;
      },
    },
    {
      id: "surprise-raid",
      name: "先驱突击",
      type: "指挥",
      trigger: "command",
      desc: "前3回合先手与攻击",
      apply(ctx, unit) {
        addStatus(unit, "priority", 3, 80);
        addStatus(unit, "attackUp", 3, 16);
        log(ctx, "system", `${unit.name}发动【先驱突击】，前三回合获得先手。`);
      },
    },
    {
      id: "empty-fort",
      name: "空城奇谋",
      type: "指挥",
      trigger: "command",
      desc: "前3回合扰乱主动战法",
      apply(ctx, unit) {
        unit.enemyUnits.forEach((enemy) => addStatus(enemy, "activeSealAura", 3, 0.24));
        log(ctx, "control", `${unit.name}布下【空城奇谋】，敌军主动战法受到干扰。`);
      },
    },
    {
      id: "bow-flurry",
      name: "枭姬连弩",
      type: "追击",
      trigger: "pursuit",
      chance: 0.5,
      desc: "普攻后追加一次箭雨",
      use(ctx, unit, target) {
        dealDamage(ctx, unit, target, 0.72, "attack", "枭姬连弩");
        const splash = pickTargets(unit.enemyUnits, 1, [target.id])[0];
        if (splash) dealDamage(ctx, unit, splash, 0.42, "attack", "枭姬连弩");
        return true;
      },
    },
    {
      id: "battle-roar",
      name: "燕人怒吼",
      type: "主动",
      chance: 0.38,
      desc: "伤害并使目标怯战",
      use(ctx, unit) {
        const targets = pickTargets(unit.enemyUnits, 2);
        targets.forEach((target) => {
          dealDamage(ctx, unit, target, 0.82, "attack", "燕人怒吼");
          if (Math.random() < 0.42) addStatus(target, "disarm", 1, 1);
        });
        return targets.length > 0;
      },
    },
    {
      id: "moon-snare",
      name: "闭月离间",
      type: "主动",
      chance: 0.42,
      desc: "策略伤害并犹豫",
      use(ctx, unit) {
        const target = pickTargets(unit.enemyUnits, 1)[0];
        if (!target) return false;
        dealDamage(ctx, unit, target, 0.8, "strategy", "闭月离间");
        addStatus(target, "silence", 1, 1);
        log(ctx, "control", `${target.name}陷入犹豫，下一次主动战法受阻。`, {
          target: target.name,
          targetUnit: target,
        });
        return true;
      },
    },
    {
      id: "iron-wall",
      name: "八门金锁",
      type: "指挥",
      trigger: "command",
      desc: "前2回合压制普攻",
      apply(ctx, unit) {
        pickTargets(unit.enemyUnits, 2).forEach((enemy) => addStatus(enemy, "disarm", 2, 1));
        log(ctx, "control", `${unit.name}发动【八门金锁】，敌军前排攻势受限。`);
      },
    },
    {
      id: "one-rider",
      name: "一骑当千",
      type: "主动",
      chance: 0.3,
      desc: "强力群体攻击",
      use(ctx, unit) {
        pickTargets(unit.enemyUnits, 3).forEach((target) =>
          dealDamage(ctx, unit, target, 1.35, "attack", "一骑当千"),
        );
        return true;
      },
    },
    {
      id: "avoid-edge",
      name: "避其锋芒",
      type: "指挥",
      trigger: "command",
      desc: "前3回合群体减伤",
      apply(ctx, unit) {
        unit.sideUnits.forEach((ally) => addStatus(ally, "damageDown", 3, 0.16));
        log(ctx, "system", `${unit.name}发动【避其锋芒】，我军前三回合受伤降低。`);
      },
    },
    {
      id: "counter-plan",
      name: "反计之策",
      type: "指挥",
      trigger: "command",
      desc: "前3回合概率犹豫",
      apply(ctx, unit) {
        unit.enemyUnits.forEach((enemy) => addStatus(enemy, "activeSealAura", 3, 0.3));
        log(ctx, "control", `${unit.name}发动【反计之策】，敌军主动战法可能失效。`);
      },
    },
    {
      id: "grand-reward",
      name: "大赏三军",
      type: "指挥",
      trigger: "command",
      desc: "前3回合群体增伤",
      apply(ctx, unit) {
        unit.sideUnits.forEach((ally) => addStatus(ally, "damageUp", 3, 0.16));
        log(ctx, "system", `${unit.name}发动【大赏三军】，我军前三回合伤害提高。`);
      },
    },
    {
      id: "golden-lock",
      name: "战必断金",
      type: "指挥",
      trigger: "command",
      desc: "前3回合概率怯战",
      apply(ctx, unit) {
        unit.enemyUnits.forEach((enemy) => addStatus(enemy, "disarmAura", 3, 0.35));
        log(ctx, "control", `${unit.name}发动【战必断金】，敌军普攻可能被压制。`);
      },
    },
    {
      id: "calm-army",
      name: "安抚军心",
      type: "主动",
      chance: 0.36,
      desc: "净化并治疗群体",
      use(ctx, unit) {
        const allies = alive(unit.sideUnits).sort((a, b) => a.troops - b.troops).slice(0, 2);
        allies.forEach((ally) => {
          clearBadStatuses(ally);
          heal(ctx, unit, ally, 620 + unit.stats.strategy * 4.7, "安抚军心");
        });
        return allies.length > 0;
      },
    },
    {
      id: "feint",
      name: "声东击西",
      type: "主动",
      chance: 0.45,
      desc: "强力策略群攻",
      use(ctx, unit) {
        pickTargets(unit.enemyUnits, 2).forEach((target) =>
          dealDamage(ctx, unit, target, 1.12, "strategy", "声东击西"),
        );
        return true;
      },
    },
    {
      id: "return-horse",
      name: "回马",
      type: "被动",
      trigger: "passive",
      desc: "受到普攻时反击",
      apply(ctx, unit) {
        addStatus(unit, "counter", 8, 0.42);
        log(ctx, "system", `${unit.name}习得【回马】，可在受普攻时反击。`);
      },
    },
    {
      id: "rouse",
      name: "奋起",
      type: "主动",
      chance: 0.34,
      desc: "短暂提升自身伤害",
      use(ctx, unit) {
        addStatus(unit, "damageUp", 2, 0.28);
        log(ctx, "system", `${unit.name}发动【奋起】，两回合内伤害提高。`);
        return true;
      },
    },
    {
      id: "cliff",
      name: "危崖困军",
      type: "主动",
      chance: 0.44,
      desc: "策略伤害并降防",
      use(ctx, unit) {
        pickTargets(unit.enemyUnits, 2).forEach((target) => {
          dealDamage(ctx, unit, target, 0.98, "strategy", "危崖困军");
          addStatus(target, "defenseDown", 2, 12);
        });
        return true;
      },
    },
    {
      id: "official-skill-远攻秘策",
      name: "远攻秘策",
      type: "指挥",
      target: "自身、友军全体",
      desc: "使自身攻击属性提高20.0，谋略属性提高20.0，攻击距离+1，同时，使友军全体在战斗开始后前3回合也获得与自身同样的增益。",
      trigger: "command",
      apply(ctx, unit) {
        unit.sideUnits.forEach((ally) => {
          addStatus(ally, "attackUp", 3, 20);
          addStatus(ally, "strategyUp", 3, 20);
          addStatus(ally, "rangeUp", 3, 1);
        });
        log(ctx, "system", `${unit.name}发动【远攻秘策】，前三回合我军攻击、谋略与攻击距离提升。`);
      },
    },
    {
      id: "official-skill-神兵天降",
      name: "神兵天降",
      type: "指挥",
      target: "敌军群体",
      desc: "战斗开始后前3回合，使敌军群体受到攻击和策略攻击时的伤害提高30.0%（受谋略属性影响）。",
      trigger: "command",
      apply(ctx, unit) {
        pickTargets(unit.enemyUnits, 2).forEach((enemy) => addStatus(enemy, "damageTakenUp", 3, 0.18));
        log(ctx, "system", `${unit.name}发动【神兵天降】，敌军前三回合更易受到伤害。`);
      },
    },
  ];
  
  const OFFICIAL_SKILL_ALIASES = new Map([
    ["魏武之威", "魏武之世"],
    ["仁德载世", "皇裔流离"],
    ["飞将无双", "天下无双"],
    ["火烧赤壁", "天妒英才XP"],
    ["空城奇谋", "空城"],
    ["枭姬连弩", "枭姬"],
    ["燕人怒吼", "当阳桥"],
    ["闭月离间", "闭月"],
  ]);
  

  global.STZB_SEED_DATA = Object.freeze({
    HEROES,
    SKILLS,
    OFFICIAL_SKILL_ALIASES,
  });
})(globalThis);
