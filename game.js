const POSITIONS = [
  { id: "camp", label: "大营" },
  { id: "middle", label: "中军" },
  { id: "front", label: "前锋" },
];

const ARM_COUNTERS = {
  骑: "步",
  步: "弓",
  弓: "骑",
};

const ARM_COUNTER_BONUS = 0.15;
const ARM_COUNTER_PENALTY = 0.1;

const POSITION_COORDS = {
  player: { camp: 0, middle: 1, front: 2 },
  enemy: { front: 3, middle: 4, camp: 5 },
};

const DEFAULT_ATTACK_DISTANCE = {
  骑: 2,
  步: 2,
  弓: 3,
};

const FACTION_BONUS_STATS = ["attack", "strategy", "defense", "speed"];
const ARM_BONUS_STATS = {
  步: ["attack", "defense"],
  骑: ["attack", "speed"],
  弓: ["defense", "speed"],
};

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
      log(ctx, "control", `${target.name}陷入犹豫，下一次主动战法受阻。`);
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

mergeOfficialData();

const EQUIPPABLE_SKILLS = SKILLS;
const state = {
  roster: {},
  skills: {},
  fodder: 0,
  formation: starterFormation(),
  enemy: [],
  lastBattle: null,
  activeBattle: null,
};

const CUSTOM_SKILL_DETAILS = {
  "wei-command": [["触发", "战斗开始"], ["持续", "前3回合"], ["效果", "我军全体伤害 +12%"]],
  benevolence: [["触发", "主动"], ["发动率", "45%"], ["目标", "我军兵力最低2人"], ["治疗", "860 + 谋略 × 6"]],
  "royal-cover": [["触发", "战斗开始"], ["持续", "前2回合"], ["效果", "我军全体规避 22%，防御 +14"]],
  "green-dragon": [["触发", "普通攻击后"], ["发动率", "44%"], ["伤害率", "95%攻击伤害"], ["治疗", "自身恢复 460 + 攻击 × 3.4"]],
  "flying-general": [["触发", "主动"], ["发动率", "35%"], ["目标", "敌军3人"], ["伤害率", "112%攻击伤害"]],
  "red-cliff": [["触发", "主动"], ["发动率", "42%"], ["目标", "敌军2人"], ["伤害率", "102%策略伤害"], ["灼烧", "2回合，每回合 420 + 谋略 × 2"]],
  "surprise-raid": [["触发", "战斗开始"], ["持续", "前3回合"], ["效果", "自身先手 +80，攻击 +16"]],
  "empty-fort": [["触发", "战斗开始"], ["持续", "前3回合"], ["效果", "敌军主动战法 24% 概率失效"]],
  "bow-flurry": [["触发", "普通攻击后"], ["发动率", "50%"], ["主目标", "72%攻击伤害"], ["溅射", "另1名敌军 42%攻击伤害"]],
  "battle-roar": [["触发", "主动"], ["发动率", "38%"], ["目标", "敌军2人"], ["伤害率", "82%攻击伤害"], ["控制", "42%概率怯战1回合"]],
  "moon-snare": [["触发", "主动"], ["发动率", "42%"], ["目标", "敌军单体"], ["伤害率", "80%策略伤害"], ["控制", "犹豫1回合"]],
  "iron-wall": [["触发", "战斗开始"], ["持续", "前2回合"], ["效果", "敌军2人怯战"]],
  "one-rider": [["触发", "主动"], ["发动率", "30%"], ["目标", "敌军3人"], ["伤害率", "135%攻击伤害"]],
  "avoid-edge": [["触发", "战斗开始"], ["持续", "前3回合"], ["效果", "我军全体受伤 -16%"]],
  "counter-plan": [["触发", "战斗开始"], ["持续", "前3回合"], ["效果", "敌军主动战法 30% 概率失效"]],
  "grand-reward": [["触发", "战斗开始"], ["持续", "前3回合"], ["效果", "我军全体伤害 +16%"]],
  "golden-lock": [["触发", "战斗开始"], ["持续", "前3回合"], ["效果", "敌军普攻 35% 概率被压制"]],
  "calm-army": [["触发", "主动"], ["发动率", "36%"], ["目标", "我军兵力最低2人"], ["治疗", "620 + 谋略 × 4.7"], ["附加", "清除负面状态"]],
  feint: [["触发", "主动"], ["发动率", "45%"], ["目标", "敌军2人"], ["伤害率", "112%策略伤害"]],
  "return-horse": [["触发", "被动"], ["持续", "整场"], ["效果", "受到普通攻击时 42% 概率反击"], ["反击伤害", "36%攻击伤害"]],
  rouse: [["触发", "主动"], ["发动率", "34%"], ["持续", "2回合"], ["效果", "自身伤害 +28%"]],
  cliff: [["触发", "主动"], ["发动率", "44%"], ["目标", "敌军2人"], ["伤害率", "98%策略伤害"], ["附加", "防御 -12，持续2回合"]],
  "official-skill-远攻秘策": [["触发", "战斗开始"], ["持续", "前3回合"], ["我军全体", "攻击 +20，谋略 +20，攻击距离 +1"]],
  "official-skill-神兵天降": [["触发", "战斗开始"], ["持续", "前3回合"], ["目标", "敌军2人"], ["效果", "受到伤害 +18%（原型近似）"]],
};

const els = {
  formationEditor: document.querySelector("#formationEditor"),
  roster: document.querySelector("#roster"),
  rosterCount: document.querySelector("#rosterCount"),
  fodderCount: document.querySelector("#fodderCount"),
  enemyLine: document.querySelector("#enemyLine"),
  playerLine: document.querySelector("#playerLine"),
  playerTroops: document.querySelector("#playerTroops"),
  enemyTroops: document.querySelector("#enemyTroops"),
  roundCount: document.querySelector("#roundCount"),
  report: document.querySelector("#report"),
  battleTitle: document.querySelector("#battleTitle"),
  battleSubtitle: document.querySelector("#battleSubtitle"),
  battleResult: document.querySelector("#battleResult"),
  startBattle: document.querySelector("#startBattle"),
  skillModal: document.querySelector("#skillModal"),
  skillModalTitle: document.querySelector("#skillModalTitle"),
  skillModalMeta: document.querySelector("#skillModalMeta"),
  skillModalDesc: document.querySelector("#skillModalDesc"),
  skillModalClose: document.querySelector("#skillModalClose"),
  heroModal: document.querySelector("#heroModal"),
  heroModalTitle: document.querySelector("#heroModalTitle"),
  heroModalMeta: document.querySelector("#heroModalMeta"),
  heroModalPortrait: document.querySelector("#heroModalPortrait"),
  heroModalStats: document.querySelector("#heroModalStats"),
  heroModalInnate: document.querySelector("#heroModalInnate"),
  heroModalDismantle: document.querySelector("#heroModalDismantle"),
  heroModalDesc: document.querySelector("#heroModalDesc"),
  heroModalClose: document.querySelector("#heroModalClose"),
  gachaModal: document.querySelector("#gachaModal"),
  gachaSubtitle: document.querySelector("#gachaSubtitle"),
  gachaResults: document.querySelector("#gachaResults"),
  gachaClose: document.querySelector("#gachaClose"),
};

function init() {
  resetRuntimeState();
  loadState();
  ensureStarterRoster();
  if (!state.enemy.length) state.enemy = randomEnemyTeam();
  normalizeFormationSkills();
  saveState();
  bindEvents();
  renderAll();
}

function bindEvents() {
  document.querySelector("#drawTen").addEventListener("click", () => drawHeroes(10));
  document.querySelector("#rerollEnemy").addEventListener("click", () => {
    state.enemy = randomEnemyTeam();
    state.lastBattle = null;
    state.activeBattle = null;
    writeReport([{ type: "system", text: "斥候回报：新的郊野守军已经出现。" }]);
    saveState();
    renderAll();
  });
  document.querySelector("#resetAll").addEventListener("click", resetAll);
  els.startBattle.addEventListener("click", advanceBattleFlow);
  document.querySelector("#autoTeam").addEventListener("click", autoTeam);
  document.querySelector("#clearReport").addEventListener("click", () => {
    els.report.innerHTML = "";
  });
  document.body.addEventListener("click", handleBodyClick);
  els.skillModalClose.addEventListener("click", () => els.skillModal.close());
  els.heroModalClose.addEventListener("click", () => els.heroModal.close());
  els.gachaClose.addEventListener("click", () => els.gachaModal.close());
  [els.skillModal, els.heroModal, els.gachaModal].forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) modal.close();
    });
  });
}

function mergeOfficialData() {
  const official = globalThis.STZB_OFFICIAL_DATA;
  if (!official?.heroes?.length || !official?.skills?.length) return;
  const skillIds = new Set(SKILLS.map((skill) => skill.id));
  official.skills.forEach((skill) => {
    if (skillIds.has(skill.id) || !skill.name) return;
    SKILLS.push(attachOfficialSkillBehavior({
      id: skill.id,
      name: skill.name,
      type: skill.type || "未知",
      grade: skill.grade || "",
      target: skill.target || "",
      desc: skill.desc || "官方战法库条目暂无效果描述。",
      trigger: "official",
      officialId: skill.officialId,
      soldierType: skill.soldierType || "",
      distance: skill.distance ?? null,
      probability: skill.probability || "",
      effect: skill.effect || "",
      icon: skill.icon || "",
      skillCount: skill.skillCount ?? null,
      studyDesc: skill.studyDesc || "",
      studyDesc2: skill.studyDesc2 || "",
    }));
    skillIds.add(skill.id);
  });

  const heroKeys = new Set(HEROES.map((hero) => `${hero.name}-${hero.faction}-${hero.arm}-${hero.innate}`));
  official.heroes.forEach((hero) => {
    const key = `${hero.name}-${hero.faction}-${hero.arm}-${hero.innate}`;
    if (heroKeys.has(key) || !skillById(hero.innate)) return;
    HEROES.push({
      id: hero.id,
      officialId: hero.officialId,
      name: hero.name,
      faction: hero.faction,
      arm: hero.arm,
      rarity: hero.rarity,
      innate: hero.innate,
      dismantle: hero.dismantle,
      dismantles: hero.dismantles || (hero.dismantle ? [hero.dismantle] : []),
      iconId: hero.iconId,
      portrait: hero.portrait,
      cost: hero.cost,
      distance: hero.distance,
      stats: hero.stats,
      desc: hero.desc,
    });
    heroKeys.add(key);
  });
}

function chanceFromProbability(value, fallback) {
  const numbers = String(value || "").match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  if (!numbers.length) return fallback;
  return Math.max(...numbers) / 100;
}

function attachOfficialSkillBehavior(skill) {
  const desc = skill.desc || "";
  if (/指挥|被动/.test(skill.type)) {
    skill.trigger = "command";
    skill.apply = (ctx, unit) => {
      const allies = /我军|友军|自身/.test(desc) ? unit.sideUnits : [unit];
      if (/伤害.*提高|造成.*提高/.test(desc)) allies.forEach((ally) => addStatus(ally, "damageUp", 2, 0.1));
      if (/攻击属性.*提高/.test(desc)) allies.forEach((ally) => addStatus(ally, "attackUp", 2, 10));
      if (/谋略属性.*提高|谋略.*提高/.test(desc)) allies.forEach((ally) => addStatus(ally, "strategyUp", 2, 10));
      const rangeUp = attackRangeDelta(desc);
      if (rangeUp > 0) allies.forEach((ally) => addStatus(ally, "rangeUp", 2, rangeUp));
      if (/防御.*提高|规避|减伤|伤害降低/.test(desc)) allies.forEach((ally) => addStatus(ally, "damageDown", 2, 0.1));
      log(ctx, "system", `${unit.name}发动【${skill.name}】：${summarizeDesc(desc)}`);
    };
    return skill;
  }

  skill.chance = chanceFromProbability(skill.probability, /追击/.test(skill.type) ? 0.4 : 0.35);
  skill.trigger = /追击/.test(skill.type) ? "pursuit" : "active";
  skill.use = (ctx, unit, pursuedTarget) => {
    const targetText = `${skill.target || ""} ${desc}`;
    const distance = Number(skill.distance) || skillDistanceFromText(targetText);
    const hostile = /敌军|敌方|攻击目标/.test(targetText);
    const healing = /恢复|休整|急救/.test(desc);
    const count = targetCountFromText(targetText);
    const targets = healing
      ? filterSkillTargets(unit, unit.sideUnits, targetText, distance).sort((a, b) => a.troops - b.troops).slice(0, count)
      : pursuedTarget
        ? [pursuedTarget]
        : pickSkillTargets(unit, hostile ? unit.enemyUnits : unit.sideUnits, count, targetText, distance);
    if (!targets.length) return false;

    targets.forEach((target) => {
      if (healing) {
        heal(ctx, unit, target, 520 + unit.stats.strategy * 4.2, skill.name);
      } else {
        dealDamage(ctx, unit, target, /强力|猛烈|全体/.test(desc) ? 1.05 : 0.78, /策略|谋略|恐慌|妖术/.test(desc) ? "strategy" : "attack", skill.name);
      }
      if (/怯战|无法进行普通攻击/.test(desc)) addStatus(target, "disarm", 1, 1);
      if (/犹豫|无法发动主动/.test(desc)) addStatus(target, "silence", 1, 1);
      if (/混乱|暴走/.test(desc)) addStatus(target, "silence", 1, 1);
      if (/燃烧|灼烧|火攻/.test(desc)) addStatus(target, "burn", 2, 360 + unit.stats.strategy * 2);
      if (/防御.*降低/.test(desc)) addStatus(target, "defenseDown", 2, 10);
    });
    return true;
  };
  return skill;
}

function handleBodyClick(event) {
  const skillButton = event.target.closest("[data-skill-id]");
  if (skillButton) {
    showSkillModal(skillButton.dataset.skillId);
    return;
  }

  const dismantleButton = event.target.closest("[data-dismantle-hero]");
  if (dismantleButton && !dismantleButton.disabled) {
    dismantleHero(dismantleButton.dataset.dismantleHero);
    return;
  }

  const heroButton = event.target.closest("[data-hero-id]");
  if (heroButton) {
    showHeroModal(heroButton.dataset.heroId);
  }
}

function showSkillModal(skillId) {
  const skill = skillById(skillId);
  if (!skill) return;
  els.skillModalTitle.innerHTML = `${skill.icon ? `<img class="skill-title-icon" src="${escapeHtml(skill.icon)}" alt="">` : ""}<span>${escapeHtml(skill.name)}</span>`;
  els.skillModalMeta.textContent = [
    skill.grade ? `战法品质：${skill.grade}` : skillGradeText(skill),
    skill.type ? `战法类型：${skill.type}` : "",
    skill.soldierType ? `兵种类型：${skill.soldierType}` : "",
    skill.distance ? `有效距离：${skill.distance}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  els.skillModalDesc.innerHTML = skillDetailHtml(skill);
  els.skillModal.showModal();
}

function showHeroModal(heroId) {
  const hero = heroById(heroId);
  if (!hero) return;
  const reference = heroReference(hero);
  const innate = skillById(hero.innate);
  const dismantles = dismantleSkillsForHero(hero);
  els.heroModalTitle.textContent = hero.name;
  els.heroModalMeta.textContent = [
    hero.faction,
    hero.arm,
    `${"★".repeat(hero.rarity)}${hero.rarity}星`,
    hero.cost || reference?.cost ? `COST ${hero.cost || reference.cost}` : "",
    hero.distance || reference?.distance ? `攻击距离 ${hero.distance || reference.distance}` : "",
    armCounterText(hero.arm),
  ].filter(Boolean).join(" · ");
  els.heroModalPortrait.innerHTML = portraitForHero(hero)
    ? `<img src="${portraitForHero(hero)}" alt="${hero.name}画像">`
    : `<div class="hero-detail-fallback">${hero.name.slice(0, 1)}</div>`;
  els.heroModalStats.innerHTML = [
    ["攻", hero.stats.attack],
    ["谋", hero.stats.strategy],
    ["防", hero.stats.defense],
    ["速", hero.stats.speed],
  ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");
  fillHeroSkillButton(els.heroModalInnate, "自带战法", innate);
  fillHeroSkillButton(els.heroModalDismantle, "可拆战法", dismantles);
  els.heroModalDesc.textContent = hero.desc || reference?.desc || "暂无武将传记。";
  els.heroModal.showModal();
}

function fillHeroSkillButton(button, label, skills) {
  const list = Array.isArray(skills) ? skills.filter(Boolean) : [skills].filter(Boolean);
  if (!list.length) {
    button.hidden = true;
    button.removeAttribute("data-skill-id");
    button.textContent = "";
    return;
  }
  const skill = list[0];
  button.hidden = false;
  button.dataset.skillId = skill.id;
  button.innerHTML = `<span>${label}</span><strong>${list.map((item) => item.name).join(" / ")}</strong><em>${[skillGradeText(skill), skill.type || "战法"].filter(Boolean).join(" · ")}</em>`;
}

function skillDetailHtml(skill) {
  const desc = skill.desc || "这个战法已经接入战斗，但暂无官方描述。";
  const rows = conciseSkillRows(skill);
  return `
    <section class="skill-detail-block">
      <h3>官方描述</h3>
      <p>${escapeHtml(desc)}</p>
    </section>
    <section class="skill-detail-block">
      <h3>战斗信息</h3>
      <div class="effect-grid compact">
        ${rows.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
      </div>
    </section>
  `;
}

function conciseSkillRows(skill) {
  const desc = skill.desc || "";
  return [
    ["战法品质", skill.grade || "暂无"],
    ["战法类型", skill.type || "未知"],
    ["兵种类型", skill.soldierType || "未知"],
    ["有效距离", skill.distance ? String(skill.distance) : "按描述"],
    ["目标群体", skill.target || inferTargetText(desc)],
    ["发动率", skill.probability || (skill.chance ? `${Math.round(skill.chance * 100)}%` : triggerIsAlways(skill) ? "100%" : "按战法类型推断")],
    ["效果", skill.effect || "按描述"],
    ["伤害类型", /恢复|休整|急救/.test(desc) ? "恢复" : /策略|谋略|恐慌|妖术/.test(desc) ? "策略伤害" : /攻击|伤害率|猛攻/.test(desc) ? "攻击伤害" : "按描述"],
  ];
}

function triggerText(skill) {
  if (skill.trigger === "command") return "战斗开始时生效";
  if (skill.trigger === "passive") return "战斗开始时获得被动";
  if (skill.trigger === "pursuit") return "普通攻击后判定";
  if (skill.type === "主动") return "每回合行动时判定";
  return skill.type || "战法触发";
}

function skillGradeText(skill) {
  return skill?.grade ? `${skill.grade}级` : "";
}

function skillNameWithGrade(skill) {
  const grade = skillGradeText(skill);
  return grade ? `${skill.name}（${grade}）` : skill.name;
}

function triggerIsAlways(skill) {
  return skill.trigger === "command" || skill.trigger === "passive" || /指挥|被动/.test(skill.type || "");
}

function inferTargetText(desc) {
  if (/我军|友军/.test(desc)) return /群体|全体/.test(desc) ? "我军群体" : "友军单体";
  if (/自身/.test(desc)) return "自身";
  if (/敌军|敌方/.test(desc)) return /群体|全体/.test(desc) ? "敌军群体" : "敌军单体";
  return "按战法描述选择目标";
}

function statusTextFromDesc(desc) {
  const statuses = [];
  if (/怯战|无法进行普通攻击/.test(desc)) statuses.push("怯战 1回合");
  if (/犹豫|无法发动主动/.test(desc)) statuses.push("犹豫 1回合");
  if (/混乱|暴走/.test(desc)) statuses.push("控制 1回合");
  if (/燃烧|灼烧|火攻/.test(desc)) statuses.push("灼烧 2回合，每回合 360 + 谋略 × 2");
  if (/防御.*降低/.test(desc)) statuses.push("防御 -10，持续2回合");
  return statuses.join("；") || "无";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function dismantleHero(heroId) {
  const hero = heroById(heroId);
  const skills = dismantleSkillsForHero(hero);
  if (!hero || !skills.length || (state.roster[hero.id] || 0) <= 0) return;
  state.roster[hero.id] -= 1;
  removeHeroFromFormation(hero.id);
  skills.forEach((skill) => {
    state.skills[skill.id] = (state.skills[skill.id] || 0) + 1;
  });
  state.activeBattle = null;
  state.lastBattle = null;
  writeReport([{ type: "system", text: `拆解${hero.name}，获得战法【${skills.map((skill) => skill.name).join("】、【")}】。` }]);
  saveState();
  renderAll();
}

function removeHeroFromFormation(heroId) {
  let changed = false;
  state.formation.forEach((slot) => {
    if (slot.heroId !== heroId) return;
    slot.heroId = null;
    slot.skills = [null, null];
    changed = true;
  });
  if (!changed) return;
  const candidates = ownedHeroes()
    .filter((hero) => !state.formation.some((slot) => slot.heroId === hero.id))
    .sort((a, b) => b.rarity - a.rarity || b.stats.attack + b.stats.strategy - (a.stats.attack + a.stats.strategy));
  state.formation.forEach((slot, index) => {
    if (slot.heroId || !candidates.length) return;
    const hero = candidates.shift();
    slot.heroId = hero.id;
    slot.skills = suggestSkills(index);
  });
}

function dismantleSkillForHero(hero) {
  return dismantleSkillsForHero(hero)[0] || null;
}

function dismantleSkillsForHero(hero) {
  const reference = heroReference(hero);
  const ids = [
    ...(hero?.dismantles || []),
    ...(reference?.dismantles || []),
    hero?.dismantle,
    reference?.dismantle,
  ].filter(Boolean);
  return [...new Set(ids)].map(skillById).filter(Boolean);
}

function showGacha(pulls) {
  const results = pulls.map((pull) => pull.hero ? pull : { hero: pull, converted: false });
  const convertedCount = results.filter((pull) => pull.converted).length;
  els.gachaSubtitle.textContent = results.some((pull) => pull.hero.rarity >= 5)
    ? `金印显耀，名将入营${convertedCount ? `；${convertedCount}名低星武将转为狗粮` : ""}`
    : `${convertedCount}名低星武将已转为狗粮`;
  els.gachaResults.innerHTML = results.map((pull, index) => {
    const hero = pull.hero;
    return `
    <article class="gacha-result rarity-${hero.rarity} ${pull.converted ? "converted" : ""}" data-hero-id="${hero.id}" style="--delay: ${index * 42}ms">
      ${avatarMarkup(hero)}
      <strong>${hero.name}</strong>
      <span>${hero.faction} · ${hero.arm}</span>
      <em>${"★".repeat(hero.rarity)}</em>
      ${pull.converted ? `<small>转为狗粮</small>` : ""}
    </article>
  `;
  }).join("");
  els.gachaModal.showModal();
}

function summarizeDesc(desc) {
  return desc ? `${desc.slice(0, 42)}${desc.length > 42 ? "…" : ""}` : "效果已生效";
}

function avatarMarkup(hero, className = "avatar") {
  const portrait = portraitForHero(hero);
  if (portrait) return `<div class="${className} portrait-avatar"><img src="${portrait}" alt="${hero.name}画像" loading="lazy"></div>`;
  return `<div class="${className}">${hero.name.slice(0, 1)}</div>`;
}

function portraitForHero(hero) {
  if (!hero) return "";
  if (hero.portrait) return hero.portrait;
  const matched = heroReference(hero);
  return matched?.portrait || "";
}

function heroReference(hero) {
  if (!hero) return null;
  return HEROES.find((candidate) =>
    candidate !== hero
    && candidate.officialId
    && candidate.name === hero.name
    && candidate.faction === hero.faction
    && candidate.arm === hero.arm
  ) || HEROES.find((candidate) =>
    candidate !== hero
    && candidate.officialId
    && candidate.name === hero.name
  ) || null;
}

function ensureStarterRoster() {
  ["cao-cao", "guan-yu", "liu-bei", "sun-shangxiang", "cao-ren"].forEach((id) => {
    state.roster[id] = Math.max(1, state.roster[id] || 0);
  });
  ["grand-reward", "avoid-edge", "one-rider", "return-horse", "calm-army", "counter-plan", "feint", "golden-lock"].forEach((id) => {
    state.skills[id] = Math.max(1, state.skills[id] || 0);
  });
}

function resetAll() {
  if (typeof confirm === "function" && !confirm("确定要重置所有武将、战法、编队、抽卡记录和战斗记录吗？")) return;
  localStorage.removeItem("heluozhanzhen");
  resetRuntimeState();
  ensureStarterRoster();
  state.enemy = randomEnemyTeam();
  normalizeFormationSkills();
  saveState();
  writeReport([{ type: "system", text: "已重置所有记录，回到初始阵容。" }]);
  renderAll();
}

function resetRuntimeState() {
  state.roster = {};
  state.skills = {};
  state.fodder = 0;
  state.formation = starterFormation();
  state.enemy = [];
  state.lastBattle = null;
  state.activeBattle = null;
}

function starterFormation() {
  return [
    { heroId: "cao-cao", skills: ["grand-reward", "avoid-edge"] },
    { heroId: "guan-yu", skills: ["one-rider", "return-horse"] },
    { heroId: "liu-bei", skills: ["calm-army", "counter-plan"] },
  ];
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem("heluozhanzhen") || "{}");
    Object.assign(state, saved);
    state.fodder = Number(state.fodder) || 0;
  } catch {
    localStorage.removeItem("heluozhanzhen");
  }
}

function saveState() {
  localStorage.setItem("heluozhanzhen", JSON.stringify({
    roster: state.roster,
    skills: state.skills,
    fodder: state.fodder,
    formation: state.formation,
    enemy: state.enemy,
  }));
}

function drawHeroes(count) {
  const pulls = [];
  for (let i = 0; i < count; i += 1) {
    const hero = weightedHero();
    const converted = hero.rarity <= 4;
    if (converted) {
      state.fodder += 1;
    } else {
      state.roster[hero.id] = (state.roster[hero.id] || 0) + 1;
    }
    pulls.push({ hero, converted });
  }
  const names = pulls.map(({ hero, converted }) => `${hero.name}${"★".repeat(hero.rarity)}${converted ? "→狗粮" : ""}`).join("、");
  const convertedCount = pulls.filter((pull) => pull.converted).length;
  writeReport([{ type: "system", text: `招募结果：${names}${convertedCount ? `。狗粮 +${convertedCount}，当前 ${state.fodder}` : ""}` }]);
  showGacha(pulls);
  saveState();
  renderAll();
}

function weightedHero() {
  const pool = HEROES.flatMap((hero) => Array(Math.max(1, Math.round(9 - hero.rarity * 1.45))).fill(hero));
  return pool[Math.floor(Math.random() * pool.length)];
}

function autoTeam() {
  const owned = ownedHeroes().sort((a, b) => b.rarity - a.rarity || b.stats.attack + b.stats.strategy - (a.stats.attack + a.stats.strategy));
  const fallback = ["cao-cao", "guan-yu", "liu-bei"];
  state.formation = POSITIONS.map((_, index) => ({
    heroId: owned[index]?.id || fallback[index],
    skills: suggestSkills(index),
  }));
  normalizeFormationSkills();
  state.activeBattle = null;
  state.lastBattle = null;
  writeReport([{ type: "system", text: "军师完成整备：已按星级与战力自动上阵。" }]);
  saveState();
  renderAll();
}

function suggestSkills(index) {
  const sets = [
    ["grand-reward", "avoid-edge"],
    ["one-rider", "feint"],
    ["return-horse", "golden-lock"],
  ];
  return sets[index];
}

function randomEnemyTeam() {
  const heroes = shuffle([...HEROES]).slice(0, 3);
  return heroes.map((hero, index) => ({
    heroId: hero.id,
    skills: shuffle(EQUIPPABLE_SKILLS.map((skill) => skill.id)).slice(0, 2),
    position: POSITIONS[index].id,
  }));
}

function getPlayerTeam() {
  return state.formation.map((slot, index) => ({ ...slot, position: POSITIONS[index].id }));
}

function renderAll() {
  normalizeFormationSkills();
  renderFormationEditor();
  renderRoster();
  renderBattle(currentBattle());
}

function currentBattle() {
  return state.activeBattle || state.lastBattle;
}

function advanceBattleFlow() {
  if (!state.activeBattle) {
    state.activeBattle = createBattle(getPlayerTeam(), state.enemy);
    state.lastBattle = null;
    writeReport(state.activeBattle.log);
    renderBattle(state.activeBattle);
    return;
  }

  advanceBattleRound(state.activeBattle);
  if (state.activeBattle.complete) {
    state.lastBattle = state.activeBattle;
    state.activeBattle = null;
  }
  writeReport(currentBattle().log);
  renderBattle(currentBattle());
}

function renderFormationEditor() {
  const owned = ownedHeroes();
  els.formationEditor.innerHTML = POSITIONS.map((position, index) => {
    const slot = state.formation[index] || {};
    return `
      <div class="slot-editor">
        <div class="slot-title">
          <span>${position.label}</span>
          <span>${slot.heroId ? heroById(slot.heroId).name : "空位"}</span>
        </div>
        <select data-kind="hero" data-index="${index}" aria-label="${position.label}武将">
          ${owned.map((hero) => `<option value="${hero.id}" ${hero.id === slot.heroId ? "selected" : ""}>${hero.name} · ${hero.faction}${hero.arm} · ${hero.rarity}星 · 攻距${Number(hero.distance) || defaultAttackDistance(hero.arm)}</option>`).join("")}
        </select>
        <select data-kind="skill" data-skill-index="0" data-index="${index}" aria-label="${position.label}战法一">
          ${skillOptions(slot.skills?.[0], index, 0)}
        </select>
        <select data-kind="skill" data-skill-index="1" data-index="${index}" aria-label="${position.label}战法二">
          ${skillOptions(slot.skills?.[1], index, 1)}
        </select>
      </div>
    `;
  }).join("");

  els.formationEditor.querySelectorAll("select").forEach((select) => {
    select.addEventListener("change", (event) => {
      const index = Number(event.target.dataset.index);
      const kind = event.target.dataset.kind;
      state.formation[index] ||= { heroId: owned[0].id, skills: suggestSkills(index) };
      if (kind === "hero") state.formation[index].heroId = event.target.value;
      if (kind === "skill") state.formation[index].skills[Number(event.target.dataset.skillIndex)] = event.target.value || null;
      normalizeFormationSkills();
      state.lastBattle = null;
      state.activeBattle = null;
      saveState();
      renderAll();
    });
  });
}

function skillOptions(selected, slotIndex, skillIndex) {
  const options = unlockedEquippableSkills(selected, slotIndex, skillIndex);
  return `<option value="" ${selected ? "" : "selected"}>未配置</option>` + options.map((skill) => (
    `<option value="${skill.id}" ${skill.id === selected ? "selected" : ""}>${skill.name} · ${[skillGradeText(skill), skill.type, skill.distance ? `距${skill.distance}` : ""].filter(Boolean).join(" · ")}</option>`
  )).join("");
}

function unlockedEquippableSkills(selected, slotIndex = -1, skillIndex = -1) {
  const occupied = assignedSkillIds(slotIndex, skillIndex);
  const unlocked = EQUIPPABLE_SKILLS.filter((skill) => state.skills[skill.id] > 0 && (!occupied.has(skill.id) || skill.id === selected));
  if (selected && !unlocked.some((skill) => skill.id === selected)) {
    const selectedSkill = skillById(selected);
    if (selectedSkill) unlocked.unshift(selectedSkill);
  }
  return unlocked.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
}

function assignedSkillIds(exceptSlotIndex = -1, exceptSkillIndex = -1) {
  const ids = new Set();
  state.formation.forEach((slot, slotIndex) => {
    (slot.skills || []).forEach((skillId, skillIndex) => {
      if (!skillId) return;
      if (slotIndex === exceptSlotIndex && skillIndex === exceptSkillIndex) return;
      ids.add(skillId);
    });
  });
  return ids;
}

function normalizeFormationSkills() {
  const used = new Set();
  state.formation.forEach((slot) => {
    slot.skills ||= [];
    slot.skills = [slot.skills[0] || null, slot.skills[1] || null].map((skillId) => {
      if (!skillId) return null;
      if (used.has(skillId)) return null;
      used.add(skillId);
      return skillId;
    });
  });
}

function renderRoster() {
  const owned = ownedHeroes().sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name, "zh-Hans-CN"));
  els.rosterCount.textContent = owned.length;
  els.fodderCount.textContent = `狗粮 ${state.fodder || 0}`;
  els.roster.innerHTML = owned.map((hero) => {
    const innate = skillById(hero.innate);
    const dismantles = dismantleSkillsForHero(hero);
    const canDismantle = (state.roster[hero.id] || 0) > 0 && dismantles.length;
    return `
      <article class="hero-card" data-hero-id="${hero.id}">
        ${avatarMarkup(hero)}
        <div>
          <div class="hero-name-row">
            <span class="hero-name">${hero.name}</span>
            <span class="rarity">${"★".repeat(hero.rarity)}</span>
          </div>
          <div class="hero-meta">${hero.faction} · ${hero.arm} · 自带 <button class="text-link" data-skill-id="${innate.id}" type="button">${skillNameWithGrade(innate)}</button></div>
          <div class="hero-meta">可拆 ${dismantles.length ? dismantles.map((skill) => `<button class="text-link" data-skill-id="${skill.id}" type="button">${skillNameWithGrade(skill)}</button>`).join(" / ") : "暂无"}</div>
        </div>
        <div class="hero-actions">
          <div class="count-badge">x${state.roster[hero.id]}</div>
          <button class="mini-btn" data-dismantle-hero="${hero.id}" type="button" ${canDismantle ? "" : "disabled"}>拆</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderBattle(result) {
  const playerUnits = result?.player || createPreviewUnits(getPlayerTeam(), "player");
  const enemyUnits = result?.enemy || createPreviewUnits(state.enemy, "enemy");
  els.playerLine.innerHTML = playerUnits.map(unitTemplate).join("");
  els.enemyLine.innerHTML = enemyUnits.map(unitTemplate).join("");
  els.playerTroops.textContent = formatNumber(totalTroops(playerUnits));
  els.enemyTroops.textContent = formatNumber(totalTroops(enemyUnits));
  els.roundCount.textContent = `${result?.rounds || 0}/8`;
  els.battleSubtitle.textContent = result ? result.subtitle : "双方列阵，尚未交锋";
  els.battleResult.textContent = result ? result.label : "未交锋";
  els.battleResult.style.borderColor = result?.winner === "player" ? "rgba(90, 161, 132, 0.7)" : result?.winner === "enemy" ? "rgba(184, 63, 53, 0.7)" : "rgba(215, 170, 71, 0.3)";
  updateBattleButton(result);
}

function createPreviewUnits(team, side) {
  const units = createUnits(team, side, false);
  applyFormationBonuses(units);
  return units;
}

function updateBattleButton(result) {
  if (!state.activeBattle && result?.complete) {
    els.startBattle.textContent = "再战";
    return;
  }
  if (state.activeBattle) {
    els.startBattle.textContent = result?.rounds ? "下一回合" : "第一回合";
    return;
  }
  els.startBattle.textContent = "开战";
}

function unitTemplate(unit) {
  const troopPct = Math.max(0, Math.round((unit.troops / unit.maxTroops) * 100));
  const positionLabel = POSITIONS.find((position) => position.id === unit.position)?.label || "";
  const skillNames = unit.skills.map((skill) => skill.name);
  const baseRange = baseAttackRange(unit);
  const attackRange = getAttackRange(unit);
  const rangeText = attackRange === baseRange ? `攻距 ${attackRange}` : `攻距 ${baseRange}→${attackRange}`;
  const bonusText = unit.bonuses?.length ? ` · ${unit.bonuses.join(" / ")}` : "";
  const portrait = portraitForHero(unit);
  return `
    <article class="unit-card ${unit.position} ${unit.troops <= 0 ? "fallen" : ""}" data-hero-id="${unit.heroId}" ${portrait ? `style="--unit-portrait: url('${portrait}')"` : ""}>
      <div class="unit-content">
        <div class="unit-top">
          <div class="unit-identity">
            ${avatarMarkup(unit, "avatar unit-avatar")}
            <span class="unit-name">${unit.name}</span>
          </div>
          <span class="role-tag">${positionLabel}</span>
        </div>
        <div class="unit-meta">${unit.faction} · ${unit.arm} · ${"★".repeat(unit.rarity)} · ${rangeText}${bonusText}</div>
      </div>
      <div class="unit-content unit-bottom">
        <div class="troop-bar" aria-label="${unit.name}兵力">
          <div class="troop-fill" style="width: ${troopPct}%"></div>
        </div>
        <div class="skill-row">
          <span>${formatNumber(Math.max(0, Math.round(unit.troops)))}</span>
          <span>${troopPct}%</span>
        </div>
        <div class="unit-stats">
          <span>攻 <b>${unit.stats.attack}</b></span>
          <span>谋 <b>${unit.stats.strategy}</b></span>
          <span>防 <b>${unit.stats.defense}</b></span>
          <span>速 <b>${unit.stats.speed}</b></span>
        </div>
        <div class="skill-list">
          ${unit.skills.map((skill) => `<button class="skill-chip" data-skill-id="${skill.id}" type="button">${skillNameWithGrade(skill)}</button>`).join("")}
        </div>
      </div>
    </article>
  `;
}

function createBattle(playerTeam, enemyTeam) {
  const logEntries = [];
  const ctx = { log: logEntries, round: 0 };
  const player = createUnits(playerTeam, "player", true);
  const enemy = createUnits(enemyTeam, "enemy", true);
  linkSides(player, enemy);
  applyFormationBonuses(player, ctx, "我军");
  applyFormationBonuses(enemy, ctx, "守军");

  log(ctx, "system", "战斗开始：双方大营、中军、前锋各领一万兵。");
  [...player, ...enemy].forEach((unit) => {
    unit.skills.filter((skill) => skill.trigger === "command" || skill.trigger === "passive")
      .forEach((skill) => skill.apply?.(ctx, unit));
  });

  return {
    ctx,
    winner: null,
    label: "交战中",
    subtitle: "指挥战法已生效，点击第一回合推进战斗",
    rounds: 0,
    player,
    enemy,
    log: logEntries,
    complete: false,
    finishReason: null,
  };
}

function advanceBattleRound(battle) {
  if (!battle || battle.complete) return battle;
  battle.rounds += 1;
  battle.ctx.round = battle.rounds;
  log(battle.ctx, "round", `第${battle.rounds}回合`);
  [...battle.player, ...battle.enemy].forEach((unit) => applyRoundStart(battle.ctx, unit));

  let winner = checkCampWinner(battle.player, battle.enemy);
  if (!winner) {
    const order = [...alive(battle.player), ...alive(battle.enemy)].sort((a, b) => actionSpeed(b) - actionSpeed(a));
    for (const unit of order) {
      if (!unit.troops || campDown(battle.player) || campDown(battle.enemy)) continue;
      takeAction(battle.ctx, unit);
      winner = checkCampWinner(battle.player, battle.enemy);
      if (winner) break;
    }
  }

  [...battle.player, ...battle.enemy].forEach(tickStatuses);

  if (winner) {
    finishBattle(battle, winner, winner === "player" ? "enemyCampDown" : winner === "enemy" ? "playerCampDown" : "bothCampDown");
    return battle;
  }

  if (battle.rounds >= 8) {
    const diff = totalTroops(battle.player) - totalTroops(battle.enemy);
    const endWinner = Math.abs(diff) < 1200 ? "draw" : diff > 0 ? "player" : "enemy";
    finishBattle(battle, endWinner, "roundLimit");
    return battle;
  }

  battle.label = "交战中";
  battle.subtitle = `第${battle.rounds}回合结束，点击下一回合继续`;
  return battle;
}

function finishBattle(battle, winner, reason) {
  battle.winner = winner;
  battle.complete = true;
  battle.finishReason = reason;
  battle.label = winner === "player" ? "胜利" : winner === "enemy" ? "战败" : "平局";
  battle.subtitle = battleEndSubtitle(winner, reason, battle.player, battle.enemy);
  log(battle.ctx, winner === "player" ? "heal" : winner === "enemy" ? "hit" : "system", `战斗结束：${battle.label}。${battle.subtitle}。`);
}

function battleEndSubtitle(winner, reason, player, enemy) {
  if (reason === "enemyCampDown") return "敌方大营溃散，我军取胜";
  if (reason === "playerCampDown") return "我方大营溃散，守军获胜";
  if (reason === "bothCampDown") return "双方大营同时溃散，按战损判定";
  if (winner === "draw") return "八回合未破大营，双方战损接近，进入平局";
  const playerTroops = totalTroops(player);
  const enemyTroops = totalTroops(enemy);
  if (winner === "player") return `八回合结束，我军剩余${formatNumber(playerTroops)}兵，守军剩余${formatNumber(enemyTroops)}兵，按战损取胜`;
  return `八回合结束，我军剩余${formatNumber(playerTroops)}兵，守军剩余${formatNumber(enemyTroops)}兵，按战损战败`;
}

function checkCampWinner(player, enemy) {
  const playerCampDown = campDown(player);
  const enemyCampDown = campDown(enemy);
  if (playerCampDown && enemyCampDown) return "draw";
  if (enemyCampDown) return "player";
  if (playerCampDown) return "enemy";
  return null;
}

function simulateBattle(playerTeam, enemyTeam) {
  const battle = createBattle(playerTeam, enemyTeam);
  let winner = null;
  while (!battle.complete) {
    advanceBattleRound(battle);
    winner = battle.winner;
  }
  return battle;
}

function createUnits(team, side, freshTroops) {
  return team.map((slot, index) => {
    const hero = heroById(slot.heroId);
    const skills = [hero.innate, ...(slot.skills || [])].map(skillById).filter(Boolean);
    return {
      id: `${side}-${index}-${hero.id}`,
      heroId: hero.id,
      side,
      position: slot.position || POSITIONS[index].id,
      name: hero.name,
      faction: hero.faction,
      arm: hero.arm,
      rarity: hero.rarity,
      portrait: portraitForHero(hero),
      distance: Number(hero.distance) || defaultAttackDistance(hero.arm),
      stats: { ...hero.stats },
      baseStats: { ...hero.stats },
      statBonus: { attack: 0, strategy: 0, defense: 0, speed: 0 },
      bonuses: [],
      skills,
      troops: freshTroops ? 10000 : slot.troops || 10000,
      maxTroops: 10000,
      statuses: [],
      sideUnits: [],
      enemyUnits: [],
    };
  });
}

function applyFormationBonuses(units, ctx, sideLabel) {
  applyGroupBonus(units, "faction", FACTION_BONUS_STATS, (value) => `${value}阵营`, ctx, sideLabel);
  Object.entries(groupUnitsBy(units, "arm")).forEach(([arm, members]) => {
    if (members.length < 2) return;
    const stats = ARM_BONUS_STATS[arm];
    if (!stats) return;
    const rate = formationBonusRate(members.length);
    members.forEach((unit) => {
      addStatBonus(unit, stats, rate);
      unit.bonuses.push(`${arm}兵种`);
    });
    if (ctx) log(ctx, "system", `${sideLabel}${arm}兵达到${members.length}人，触发同兵种加成：${statNames(stats)} +${Math.round(rate * 100)}%。`);
  });
  units.forEach(applyStatBonuses);
}

function applyGroupBonus(units, key, stats, labelFor, ctx, sideLabel) {
  Object.entries(groupUnitsBy(units, key)).forEach(([value, members]) => {
    if (members.length < 2) return;
    const rate = formationBonusRate(members.length);
    members.forEach((unit) => {
      addStatBonus(unit, stats, rate);
      unit.bonuses.push(labelFor(value));
    });
    if (ctx) log(ctx, "system", `${sideLabel}${value}达到${members.length}人，触发同阵营加成：攻谋防速 +${Math.round(rate * 100)}%。`);
  });
}

function formationBonusRate(count) {
  if (count >= 3) return 0.1;
  if (count >= 2) return 0.05;
  return 0;
}

function groupUnitsBy(units, key) {
  return units.reduce((groups, unit) => {
    const value = unit[key] || "未知";
    groups[value] ||= [];
    groups[value].push(unit);
    return groups;
  }, {});
}

function addStatBonus(unit, stats, rate) {
  stats.forEach((stat) => {
    unit.statBonus[stat] += rate;
  });
}

function applyStatBonuses(unit) {
  Object.entries(unit.baseStats).forEach(([stat, value]) => {
    unit.stats[stat] = Math.round(value * (1 + (unit.statBonus[stat] || 0)));
  });
}

function statNames(stats) {
  const labels = { attack: "攻", strategy: "谋", defense: "防", speed: "速" };
  return stats.map((stat) => labels[stat] || stat).join("/");
}

function linkSides(player, enemy) {
  player.forEach((unit) => {
    unit.sideUnits = player;
    unit.enemyUnits = enemy;
  });
  enemy.forEach((unit) => {
    unit.sideUnits = enemy;
    unit.enemyUnits = player;
  });
}

function takeAction(ctx, unit) {
  const activeBlocked = hasStatus(unit, "silence") || (hasStatus(unit, "activeSealAura") && Math.random() < statusValue(unit, "activeSealAura"));
  const activeSkills = unit.skills.filter((skill) => skill.use && skill.trigger !== "pursuit");
  for (const skill of activeSkills) {
    if (activeBlocked) {
      log(ctx, "control", `${unit.name}受到扰乱，【${skill.name}】未能发动。`);
      break;
    }
    if (Math.random() < (skill.chance || 0)) {
      skill.use(ctx, unit);
      if (campDown(unit.enemyUnits)) return;
    }
  }

  const attackBlocked = hasStatus(unit, "disarm") || (hasStatus(unit, "disarmAura") && Math.random() < statusValue(unit, "disarmAura"));
  if (attackBlocked) {
    log(ctx, "control", `${unit.name}陷入怯战，无法普通攻击。`);
    return;
  }

  const target = pickNormalAttackTarget(unit);
  if (!target) {
    log(ctx, "control", `${unit.name}攻击距离${getAttackRange(unit)}，没有可普通攻击的目标。`);
    return;
  }
  dealDamage(ctx, unit, target, 0.62, "attack", "普通攻击", true);
  unit.skills.filter((skill) => skill.trigger === "pursuit").forEach((skill) => {
    if (target.troops > 0 && Math.random() < (skill.chance || 0)) skill.use(ctx, unit, target);
  });
}

function applyRoundStart(ctx, unit) {
  if (!unit.troops) return;
  const burn = statusValue(unit, "burn");
  if (burn) {
    const loss = Math.min(unit.troops, burn);
    unit.troops -= loss;
    log(ctx, "hit", `${unit.name}受到灼烧，损失${Math.round(loss)}兵。`);
  }
}

function dealDamage(ctx, attacker, defender, rate, mode, source, isNormal = false) {
  if (!attacker.troops || !defender?.troops) return 0;
  const evade = statusValue(defender, "evade");
  if (evade && Math.random() < evade) {
    log(ctx, "control", `${defender.name}规避了${attacker.name}的【${source}】。`);
    return 0;
  }
  const offense = mode === "strategy"
    ? attacker.stats.strategy + statusValue(attacker, "strategyUp")
    : attacker.stats.attack + statusValue(attacker, "attackUp");
  const defense = Math.max(40, defender.stats.defense + statusValue(defender, "defenseUp") - statusValue(defender, "defenseDown"));
  const troopFactor = 0.72 + (attacker.troops / attacker.maxTroops) * 0.48;
  const variance = 0.9 + Math.random() * 0.2;
  const arm = armCounterModifier(attacker.arm, defender.arm);
  let damage = (430 + offense * 9.3) * rate * troopFactor * variance * (100 / (80 + defense));
  damage *= 1 + statusValue(attacker, "damageUp");
  damage *= 1 + statusValue(defender, "damageTakenUp");
  damage *= 1 - statusValue(defender, "damageDown");
  damage *= arm.multiplier;
  damage = Math.max(90, Math.round(damage));
  defender.troops = Math.max(0, defender.troops - damage);
  log(ctx, "hit", `${attacker.name}以【${source}】攻击${defender.name}${arm.text ? `（${arm.text}）` : ""}，造成${damage}兵损。`);

  if (isNormal && defender.troops > 0 && hasStatus(defender, "counter")) {
    const counterRate = statusValue(defender, "counter");
    if (Math.random() < counterRate) {
      if (canReachByAttack(defender, attacker)) {
        dealDamage(ctx, defender, attacker, 0.36, "attack", "回马");
      } else {
        log(ctx, "control", `${defender.name}触发【回马】，但攻击距离${getAttackRange(defender)}不足，无法反击${attacker.name}。`);
      }
    }
  }
  return damage;
}

function armCounterModifier(attackerArm, defenderArm) {
  if (!ARM_COUNTERS[attackerArm] || !ARM_COUNTERS[defenderArm]) return { multiplier: 1, text: "" };
  if (ARM_COUNTERS[attackerArm] === defenderArm) {
    return { multiplier: 1 + ARM_COUNTER_BONUS, text: `${attackerArm}克${defenderArm}，伤害+${Math.round(ARM_COUNTER_BONUS * 100)}%` };
  }
  if (ARM_COUNTERS[defenderArm] === attackerArm) {
    return { multiplier: 1 - ARM_COUNTER_PENALTY, text: `${defenderArm}克${attackerArm}，伤害-${Math.round(ARM_COUNTER_PENALTY * 100)}%` };
  }
  return { multiplier: 1, text: "" };
}

function armCounterText(arm) {
  return ARM_COUNTERS[arm] ? `${arm}克${ARM_COUNTERS[arm]}` : "";
}

function defaultAttackDistance(arm) {
  return DEFAULT_ATTACK_DISTANCE[arm] || 2;
}

function baseAttackRange(unit) {
  return Number(unit?.distance) || defaultAttackDistance(unit?.arm);
}

function getAttackRange(unit) {
  return Math.max(1, baseAttackRange(unit) + statusValue(unit, "rangeUp") - statusValue(unit, "rangeDown"));
}

function attackRangeDelta(text = "") {
  const increase = text.match(/攻击距离\s*\+\s*(\d+)/);
  return increase ? Number(increase[1]) : 0;
}

function positionDistance(attacker, defender) {
  const attackerCoord = compressedPositionCoord(attacker);
  const defenderCoord = compressedPositionCoord(defender);
  if (!Number.isFinite(attackerCoord) || !Number.isFinite(defenderCoord)) return Infinity;
  return Math.abs(attackerCoord - defenderCoord);
}

function compressedPositionCoord(unit) {
  const sideUnits = unit.sideUnits?.length ? unit.sideUnits : [unit];
  const line = ["front", "middle", "camp"]
    .map((position) => sideUnits.find((candidate) => candidate.position === position && candidate.troops > 0))
    .filter(Boolean);
  const index = line.findIndex((candidate) => candidate.id === unit.id);
  if (index === -1) return POSITION_COORDS[unit.side]?.[unit.position] ?? Infinity;
  return unit.side === "enemy" ? 3 + index : 2 - index;
}

function canReachByAttack(attacker, defender) {
  return positionDistance(attacker, defender) <= getAttackRange(attacker);
}

function pickNormalAttackTarget(unit) {
  const targets = alive(unit.enemyUnits).filter((target) => canReachByAttack(unit, target));
  return targets[Math.floor(Math.random() * targets.length)];
}

function skillDistanceFromText(text = "") {
  const explicit = text.match(/(?:有效距离|距离)\s*(\d+)\s*以内/);
  if (explicit) return Number(explicit[1]);
  const promoted = text.match(/战法距离提升至\s*(\d+)/);
  return promoted ? Number(promoted[1]) : null;
}

function targetCountFromText(text = "") {
  if (/全体|3个目标|2-3个目标|2~3个目标/.test(text)) return 3;
  if (/群体|2个目标|1-2个目标|1~2个目标/.test(text)) return 2;
  return 1;
}

function pickSkillTargets(unit, units, count, text = "", explicitDistance = null) {
  return pickTargets(filterSkillTargets(unit, units, text, explicitDistance), count);
}

function filterSkillTargets(unit, units, text = "", explicitDistance = null) {
  const distance = Number(explicitDistance) || skillDistanceFromText(text);
  return distance
    ? units.filter((target) => positionDistance(unit, target) <= distance)
    : units;
}

function heal(ctx, caster, target, amount, source) {
  if (!target?.troops) return 0;
  const healAmount = Math.min(target.maxTroops - target.troops, Math.round(amount));
  if (healAmount <= 0) return 0;
  target.troops += healAmount;
  log(ctx, "heal", `${caster.name}以【${source}】恢复${target.name}${healAmount}兵。`);
  return healAmount;
}

function pickTargets(units, count, exclude = []) {
  const order = ["front", "middle", "camp"];
  return alive(units)
    .filter((unit) => !exclude.includes(unit.id))
    .sort((a, b) => order.indexOf(a.position) - order.indexOf(b.position) || a.troops - b.troops)
    .slice(0, count);
}

function addStatus(unit, type, rounds, value) {
  unit.statuses = unit.statuses.filter((status) => status.type !== type);
  unit.statuses.push({ type, rounds, value });
}

function tickStatuses(unit) {
  unit.statuses.forEach((status) => {
    status.rounds -= 1;
  });
  unit.statuses = unit.statuses.filter((status) => status.rounds > 0);
}

function clearBadStatuses(unit) {
  const bad = new Set(["burn", "disarm", "silence", "activeSealAura", "disarmAura", "defenseDown"]);
  unit.statuses = unit.statuses.filter((status) => !bad.has(status.type));
}

function hasStatus(unit, type) {
  return unit.statuses.some((status) => status.type === type);
}

function statusValue(unit, type) {
  return unit.statuses.filter((status) => status.type === type).reduce((sum, status) => sum + status.value, 0);
}

function actionSpeed(unit) {
  return unit.stats.speed + statusValue(unit, "priority") + Math.random() * 8;
}

function campDown(units) {
  return units.find((unit) => unit.position === "camp")?.troops <= 0;
}

function alive(units) {
  return units.filter((unit) => unit.troops > 0);
}

function totalTroops(units) {
  return units.reduce((sum, unit) => sum + Math.max(0, unit.troops), 0);
}

function heroById(id) {
  return HEROES.find((hero) => hero.id === id) || HEROES[0];
}

function skillById(id) {
  return SKILLS.find((skill) => skill.id === id);
}

function ownedHeroes() {
  return HEROES.filter((hero) => state.roster[hero.id] > 0);
}

function shuffle(items) {
  return items
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);
}

function formatNumber(number) {
  return Math.round(number).toLocaleString("zh-CN");
}

function log(ctx, type, text) {
  ctx.log.push({ type, text });
}

function writeReport(entries) {
  els.report.innerHTML = entries.map((entry) => `<div class="log-line ${entry.type}">${entry.text}</div>`).join("");
  els.report.scrollTop = els.report.scrollHeight || 0;
}

init();
