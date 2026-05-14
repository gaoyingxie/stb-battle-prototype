const {
  POSITIONS,
  DAMAGE_MODEL,
} = globalThis.STZB_BATTLE_RULES;

const {
  HEROES,
  SKILLS,
  OFFICIAL_SKILL_ALIASES,
} = globalThis.STZB_SEED_DATA;

const {
  buildEnemyTeam,
  recommendTeam,
} = globalThis.STZB_TEAM_AI;

mergeOfficialData();

const INNATE_SKILL_IDS = new Set();
let EQUIPPABLE_SKILLS = [];
refreshSkillMetadata();
const STARTER_SKILL_GRADES = new Set(["B", "C"]);
const SKILL_GRADE_ORDER = { S: 0, A: 1, B: 2, C: 3 };
const SYSTEM_MESSAGE_LIMIT = 24;
const BATTLE_REPORT_LIMIT = 20;
const BATTLE_MAX_ENCOUNTERS = DAMAGE_MODEL.maxDrawEncounters || 4;
const PRIORITY_SPEED_BONUS = 80;
const state = {
  roster: {},
  skills: {},
  fodder: 0,
  formation: starterFormation(),
  enemy: [],
  systemMessages: [],
  battleReports: [],
  lastBattle: null,
  activeBattle: null,
};

let selectedBattleReportId = null;
let battleReportView = "list";
let battleReportStatsTab = "hero";
let battleReportFormationSide = "player";

globalThis.STZB_DEBUG = { state };

const els = {
  formationEditor: document.querySelector("#formationEditor"),
  roster: document.querySelector("#roster"),
  rosterCount: document.querySelector("#rosterCount"),
  fodderCount: document.querySelector("#fodderCount"),
  skillCodex: document.querySelector("#skillCodex"),
  skillCodexCount: document.querySelector("#skillCodexCount"),
  enemyLine: document.querySelector("#enemyLine"),
  playerLine: document.querySelector("#playerLine"),
  playerTroops: document.querySelector("#playerTroops"),
  enemyTroops: document.querySelector("#enemyTroops"),
  roundCount: document.querySelector("#roundCount"),
  openBattleReports: document.querySelector("#openBattleReports"),
  reportBadge: document.querySelector("#reportBadge"),
  battleReportModal: document.querySelector("#battleReportModal"),
  battleReportTitle: document.querySelector("#battleReportTitle"),
  battleReportEyebrow: document.querySelector("#battleReportEyebrow"),
  battleReportContent: document.querySelector("#battleReportContent"),
  battleReportClose: document.querySelector("#battleReportClose"),
  systemMessages: document.querySelector("#systemMessages"),
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
  normalizeFormationHeroes();
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
    writeSystemMessage("斥候回报：新的郊野守军已经出现。");
    saveState();
    renderAll();
  });
  document.querySelector("#resetAll").addEventListener("click", resetAll);
  els.startBattle.addEventListener("click", advanceBattleFlow);
  els.openBattleReports.addEventListener("click", openBattleReportList);
  document.querySelector("#autoTeam").addEventListener("click", autoTeam);
  document.querySelector("#clearSystemMessages").addEventListener("click", () => {
    state.systemMessages = [];
    saveState();
    renderSystemMessages();
  });
  document.body.addEventListener("click", handleBodyClick);
  els.skillModalClose.addEventListener("click", () => els.skillModal.close());
  els.heroModalClose.addEventListener("click", () => els.heroModal.close());
  els.gachaClose.addEventListener("click", () => els.gachaModal.close());
  els.battleReportClose.addEventListener("click", handleBattleReportClose);
  [els.skillModal, els.heroModal, els.gachaModal, els.battleReportModal].forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) modal.close();
    });
  });
  els.battleReportModal.addEventListener("close", stopBattleReplay);
}

function mergeOfficialData() {
  const official = globalThis.STZB_OFFICIAL_DATA;
  if (!official?.heroes?.length || !official?.skills?.length) return;
  const skillIds = new Set(SKILLS.map((skill) => skill.id));
  const localSkillByName = new Map(SKILLS.map((skill) => [skill.name, skill]));
  official.skills.forEach((skill) => {
    const officialFields = officialSkillFields(skill);
    const localSkill = localSkillByName.get(skill.name) || aliasLocalSkill(skill.name, localSkillByName);
    if (localSkill) {
      Object.assign(localSkill, {
        ...officialFields,
        id: skill.id,
        trigger: localSkill.trigger,
        chance: chanceFromProbability(officialFields.probability, localSkill.chance),
        apply: localSkill.apply,
        use: localSkill.use,
      });
      attachSpecificOfficialSkillBehavior(localSkill);
      skillIds.add(skill.id);
      localSkillByName.set(skill.name, localSkill);
      return;
    }
    if (skillIds.has(skill.id) || !skill.name) return;
    const mergedSkill = attachOfficialSkillBehavior({
      id: skill.id,
      trigger: "official",
      ...officialFields,
    });
    SKILLS.push(mergedSkill);
    skillIds.add(skill.id);
    localSkillByName.set(skill.name, mergedSkill);
  });
  removeNonOfficialEntries(SKILLS);

  const heroKeys = new Set(HEROES.map((hero) => `${hero.name}-${hero.faction}-${hero.arm}-${hero.innate}`));
  official.heroes.forEach((hero) => {
    if (!skillById(hero.innate)) return;
    const key = `${hero.name}-${hero.faction}-${hero.arm}-${hero.innate}`;
    const localSeed = HEROES.find((candidate) =>
      !candidate.officialId
      && candidate.name === hero.name
      && candidate.faction === hero.faction
      && candidate.arm === hero.arm
      && candidate.rarity === hero.rarity
    );
    if (localSeed) {
      Object.assign(localSeed, officialHeroToLocal(hero));
      heroKeys.add(key);
      return;
    }
    if (heroKeys.has(key)) return;
    HEROES.push(officialHeroToLocal(hero));
    heroKeys.add(key);
  });
  removeNonOfficialEntries(HEROES);
}

function removeNonOfficialEntries(items) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (!isOfficialId(items[index]?.id)) items.splice(index, 1);
  }
}

function officialHeroToLocal(hero) {
  return {
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
  };
}

function aliasLocalSkill(officialName, skillMap) {
  for (const [localName, mappedOfficialName] of OFFICIAL_SKILL_ALIASES) {
    if (mappedOfficialName === officialName) return skillMap.get(localName);
  }
  return null;
}

function officialSkillFields(skill) {
  return {
    officialId: skill.officialId,
    name: skill.name,
    type: skill.type || "未知",
    grade: skill.grade || "",
    target: skill.target || "",
    desc: skill.desc || "官方战法库条目暂无效果描述。",
    soldierType: skill.soldierType || "",
    distance: skill.distance ?? null,
    probability: skill.probability || "",
    effect: skill.effect || "",
    icon: skill.icon || "",
    skillCount: skill.skillCount ?? null,
    studyDesc: skill.studyDesc || "",
    studyDesc2: skill.studyDesc2 || "",
    source: skill.source || "official",
    tags: skill.tags || [],
    isInnate: Boolean(skill.isInnate),
  };
}

function refreshSkillMetadata() {
  INNATE_SKILL_IDS.clear();
  HEROES.forEach((hero) => {
    if (hero?.innate) INNATE_SKILL_IDS.add(hero.innate);
  });
  SKILLS.forEach((skill) => {
    if (!skill?.id) return;
    const tags = skillTags(skill);
    if (INNATE_SKILL_IDS.has(skill.id)) {
      skill.isInnate = true;
      if (!tags.includes("自带")) tags.push("自带");
    }
    skill.tags = tags;
  });
  EQUIPPABLE_SKILLS = SKILLS.filter(isEquippableSkill);
}

function skillTags(skill) {
  const tags = Array.isArray(skill?.tags) ? [...skill.tags] : [];
  if (skill?.isInnate && !tags.includes("自带")) tags.push("自带");
  return [...new Set(tags.filter(Boolean))];
}

function isInnateSkill(skill) {
  return Boolean(skill?.id && (
    skill.isInnate
    || INNATE_SKILL_IDS.has(skill.id)
    || skillTags(skill).includes("自带")
  ));
}

function isEquippableSkill(skill) {
  return Boolean(skill?.id && !isInnateSkill(skill));
}

function chanceFromProbability(value, fallback) {
  const numbers = String(value || "").match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  if (!numbers.length) return fallback;
  return Math.max(...numbers) / 100;
}

function probabilityText(skill) {
  const raw = skill.probability || "";
  const numbers = String(raw).match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  if (numbers.length > 1) return `${raw}（满级按 ${Math.max(...numbers)}%）`;
  if (raw && !/^--$/.test(raw)) return raw;
  return skill.chance ? `${Math.round(skill.chance * 100)}%` : triggerIsAlways(skill) ? "100%" : "按战法类型推断";
}

function attachOfficialSkillBehavior(skill) {
  const desc = skill.desc || "";
  if (attachSpecificOfficialSkillBehavior(skill)) return skill;
  if (/指挥|被动/.test(skill.type)) {
    skill.trigger = /被动/.test(skill.type) ? "passive" : "command";
    skill.apply = (ctx, unit) => {
      const targetText = `${skill.target || ""} ${skill.effect || ""} ${desc}`;
      const allies = officialFriendlyTargets(unit, targetText);
      const enemies = officialEnemyTargets(unit, targetText);
      const hasFriendlyScope = /我军|友军|自身|自己/.test(targetText) || !/敌军|敌方/.test(targetText);
      if (hasFriendlyScope && /造成.*伤害.*提高|进行.*伤害.*提高|攻击伤害提高|策略攻击伤害提高/.test(targetText)) allies.forEach((ally) => addStatus(ally, "damageUp", durationFromText(desc, 2), 0.1));
      if (/受到.*伤害.*提高/.test(targetText)) enemies.forEach((enemy) => addStatus(enemy, "damageTakenUp", durationFromText(desc, 2), 0.12, ctx, skill.name));
      if (hasFriendlyScope && /攻击属性.*提高/.test(targetText)) allies.forEach((ally) => addStatus(ally, "attackUp", durationFromText(desc, 2), 10));
      if (hasFriendlyScope && /谋略属性.*提高|谋略.*提高/.test(targetText)) allies.forEach((ally) => addStatus(ally, "strategyUp", durationFromText(desc, 2), 10));
      if (/攻击属性.*降低/.test(targetText)) enemies.forEach((enemy) => addStatus(enemy, "attackDown", durationFromText(desc, 2), 10, ctx, skill.name));
      if (/谋略属性.*降低/.test(targetText)) enemies.forEach((enemy) => addStatus(enemy, "strategyDown", durationFromText(desc, 2), 10, ctx, skill.name));
      if (/速度属性.*降低/.test(targetText)) enemies.forEach((enemy) => addStatus(enemy, "speedDown", durationFromText(desc, 2), 10, ctx, skill.name));
      if (/防御属性.*降低/.test(targetText)) enemies.forEach((enemy) => addStatus(enemy, "defenseDown", durationFromText(desc, 2), 10, ctx, skill.name));
      const rangeUp = attackRangeDelta(targetText);
      if (hasFriendlyScope && rangeUp > 0) allies.forEach((ally) => addStatus(ally, "rangeUp", 2, rangeUp));
      if (hasFriendlyScope && /战法有效距离提高|战法距离提升/.test(targetText)) allies.forEach((ally) => addStatus(ally, "skillRangeUp", durationFromText(desc, 2), 1));
      if (hasFriendlyScope && /防御.*提高|规避|减伤|伤害降低|受到.*伤害.*降低/.test(targetText)) allies.forEach((ally) => addStatus(ally, "damageDown", durationFromText(desc, 2), 0.1));
      if (hasFriendlyScope && /先手|优先行动/.test(targetText)) {
        const duration = openingDurationFromText(desc, durationFromText(desc, 2));
        allies.forEach((ally) => addStatus(ally, "priority", duration, PRIORITY_SPEED_BONUS));
      }
      if (hasFriendlyScope && /洞察/.test(targetText)) allies.forEach((ally) => addStatus(ally, "insight", durationFromText(desc, 8), 1));
      if (hasFriendlyScope && /援护/.test(targetText)) allies.forEach((ally) => addStatus(ally, "guard", durationFromText(desc, 2), 1));
      if (hasFriendlyScope && /分兵/.test(targetText)) allies.forEach((ally) => addStatus(ally, "split", durationFromText(desc, 1), damageRateFromText(desc, 0.35)));
      if (hasFriendlyScope && /连击/.test(targetText)) allies.forEach((ally) => addStatus(ally, "combo", durationFromText(desc, 2), 1));
      if (hasFriendlyScope && /急救|休整/.test(targetText)) allies.forEach((ally) => addStatus(ally, "emergencyHeal", durationFromText(desc, 2), 0.35, null, skill.name, { source: skill.name, strategy: unit.stats.strategy }));
      if (/不可回复兵力/.test(targetText)) enemies.forEach((enemy) => addStatus(enemy, "healBlocked", durationFromText(desc, 1), 1, ctx, skill.name));
      if (/怯战|无法进行普通攻击/.test(targetText)) enemies.forEach((enemy) => addStatus(enemy, "disarm", durationFromText(desc, 1), 1, ctx, skill.name));
      if (/犹豫|无法发动主动/.test(targetText)) enemies.forEach((enemy) => addStatus(enemy, "silence", durationFromText(desc, 1), 1, ctx, skill.name));
      if (/混乱/.test(targetText)) enemies.forEach((enemy) => addStatus(enemy, "confusion", durationFromText(desc, 1), 1, ctx, skill.name));
      if (/暴走/.test(targetText)) enemies.forEach((enemy) => addStatus(enemy, "berserk", durationFromText(desc, 1), 1, ctx, skill.name));
      if (/动摇/.test(targetText)) enemies.forEach((enemy) => addStatus(enemy, "defenseDown", durationFromText(desc, 2), 12, ctx, skill.name));
      log(ctx, "system", `${unit.name}发动【${skill.name}】：${reportDesc(desc)}`);
    };
    return skill;
  }

  skill.chance = chanceFromProbability(skill.probability, /追击/.test(skill.type) ? 0.4 : 0.35);
  skill.trigger = /追击/.test(skill.type) ? "pursuit" : "active";
  skill.prepareRounds = prepareRoundsFromText(desc);
  skill.use = (ctx, unit, pursuedTarget) => {
    if (/自身.*分兵|进入分兵/.test(desc)) addStatus(unit, "split", durationFromText(desc, 1), damageRateFromText(desc, 0.35));
    if (/自身.*洞察|进入洞察/.test(desc)) addStatus(unit, "insight", durationFromText(desc, 2), 1);
    if (/自身.*援护|进入援护/.test(desc)) addStatus(unit, "guard", durationFromText(desc, 2), 1);
    const targetText = `${skill.target || ""} ${desc}`;
    const selfTarget = /自身|自己/.test(skill.target || "");
    const selfBuffApplied = selfTarget ? applySelfTargetActiveBuffs(ctx, unit, skill, desc) : false;
    if (selfBuffApplied && !pursuedTarget) return true;
    const distance = Number(skill.distance) || skillDistanceFromText(targetText);
    const hostile = /敌军|敌方|攻击目标/.test(targetText);
    const healing = /恢复|休整|急救/.test(desc);
    const damaging = !selfTarget && /伤害|攻击|恐慌|妖术|燃烧|灼烧|火攻/.test(desc);
    const count = targetCountFromText(targetText);
    const targetPool = hostile && hasStatus(unit, "berserk")
      ? [...unit.enemyUnits, ...unit.sideUnits.filter((ally) => ally.id !== unit.id)]
      : hostile ? unit.enemyUnits : unit.sideUnits;
    const targets = healing
      ? filterSkillTargets(unit, unit.sideUnits, targetText, distance).sort((a, b) => a.troops - b.troops).slice(0, count)
      : pursuedTarget
        ? [pursuedTarget]
        : pickSkillTargets(unit, targetPool, count, targetText, distance);
    if (!targets.length) return false;

    targets.forEach((target) => {
      if (healing) {
        heal(ctx, unit, target, 520 + unit.stats.strategy * 4.2, skill.name);
      } else if (damaging) {
        dealDamage(ctx, unit, target, /强力|猛烈|全体/.test(desc) ? 1.05 : 0.78, /策略|谋略|恐慌|妖术/.test(desc) ? "strategy" : "attack", skill.name);
      }
      if (/怯战|无法进行普通攻击/.test(desc)) addStatus(target, "disarm", durationFromText(desc, 1), 1, ctx, skill.name);
      if (/犹豫|无法发动主动/.test(desc)) addStatus(target, "silence", durationFromText(desc, 1), 1, ctx, skill.name);
      if (/混乱/.test(desc)) addStatus(target, "confusion", durationFromText(desc, 1), 1, ctx, skill.name);
      if (/暴走/.test(desc)) addStatus(target, "berserk", durationFromText(desc, 1), 1, ctx, skill.name);
      if (/燃烧|灼烧|火攻/.test(desc)) addStatus(target, "burn", 2, 360 + unit.stats.strategy * 2);
      if (/防御.*降低/.test(desc)) addStatus(target, "defenseDown", 2, 10);
      if (/攻击属性.*降低/.test(desc)) addStatus(target, "attackDown", durationFromText(desc, 2), 10, ctx, skill.name);
      if (/谋略属性.*降低/.test(desc)) addStatus(target, "strategyDown", durationFromText(desc, 2), 10, ctx, skill.name);
      if (/速度属性.*降低/.test(desc)) addStatus(target, "speedDown", durationFromText(desc, 2), 10, ctx, skill.name);
      if (/攻击距离.*降低/.test(desc)) addStatus(target, "rangeDown", durationFromText(desc, 2), 1, ctx, skill.name);
      if (/受到.*伤害.*提高/.test(desc)) addStatus(target, "damageTakenUp", durationFromText(desc, 2), 0.12, ctx, skill.name);
      if (/不可回复兵力/.test(desc)) addStatus(target, "healBlocked", durationFromText(desc, 1), 1, ctx, skill.name);
      if (/动摇/.test(desc)) addStatus(target, "defenseDown", durationFromText(desc, 2), 12, ctx, skill.name);
      if (/镇静|看破/.test(desc)) clearBadStatuses(target);
      if (/规避/.test(desc)) addStatus(target, "evade", durationFromText(desc, 1), 1);
    });
    return true;
  };
  return skill;
}

function attachSpecificOfficialSkillBehavior(skill) {
  const desc = skill.desc || "";
  const specificHandlers = {
    魏武之世: attachWeiWuZhiShiBehavior,
    皇裔流离: attachHuangyiLiuliBehavior,
    九锡黄龙: attachJiuxiHuanglongBehavior,
    天下无双: attachTianxiaWushuangBehavior,
    天妒英才XP: attachTianduYingcaiBehavior,
    先驱突击: attachXianquTujiBehavior,
    当阳桥: attachDangyangqiaoBehavior,
    八门金锁: attachBamenJinsuoBehavior,
    一骑当千: attachYiqiDangqianBehavior,
    其徐如林: attachQixuRulinBehavior,
  };
  const handler = specificHandlers[skill.name];
  if (!handler && !isQixuRulinSkill(skill, desc)) return false;
  (handler || attachQixuRulinBehavior)(skill, desc);
  return true;
}

function officialFriendlyTargets(unit, text = "") {
  const count = targetCountFromText(text);
  if (/自身|自己/.test(text) && !/我军|友军/.test(text)) return [unit];
  if (/我军|友军/.test(text)) return pickSkillTargets(unit, unit.sideUnits, count, text);
  return [unit];
}

function officialEnemyTargets(unit, text = "") {
  if (!/敌军|敌方/.test(text)) return [];
  return pickSkillTargets(unit, unit.enemyUnits, targetCountFromText(text), text);
}

function isQixuRulinSkill(skill, desc = "") {
  return skill.name === "其徐如林" || /目标相邻的敌军额外造成一次策略伤害/.test(desc);
}

function attachWeiWuZhiShiBehavior(skill) {
  skill.trigger = "command";
  delete skill.use;
  delete skill.chance;
  skill.apply = (ctx, unit) => {
    unit.enemyUnits.forEach((enemy) => {
      addStatus(enemy, "attackDown", DAMAGE_MODEL.maxRounds + 1, Math.round(enemy.baseStats.attack * 0.15), ctx, skill.name);
      addStatus(enemy, "defenseDown", DAMAGE_MODEL.maxRounds + 1, Math.round(enemy.baseStats.defense * 0.15), ctx, skill.name);
      addStatus(enemy, "strategyDown", DAMAGE_MODEL.maxRounds + 1, Math.round(enemy.baseStats.strategy * 0.15), ctx, skill.name);
      addStatus(enemy, "speedDown", DAMAGE_MODEL.maxRounds + 1, Math.round(enemy.baseStats.speed * 0.15), ctx, skill.name);
    });
    unit.sideUnits.forEach((ally) => {
      addStatus(ally, "rangeUp", DAMAGE_MODEL.maxRounds + 1, 1);
      addStatus(ally, "skillRangeUp", DAMAGE_MODEL.maxRounds + 1, 1);
    });
    log(ctx, "system", `${unit.name}发动【${skill.name}】，敌军全属性下降，我军攻击与主动战法距离提升。`);
  };
  return skill;
}

function attachHuangyiLiuliBehavior(skill) {
  skill.trigger = "command";
  delete skill.use;
  delete skill.chance;
  skill.apply = (ctx, unit) => {
    unit.sideUnits.forEach((ally) => {
      addStatus(ally, "emergencyHeal", DAMAGE_MODEL.maxRounds + 1, 0.5, null, skill.name, {
        source: skill.name,
        rate: 0.68,
        strategy: unit.stats.strategy,
        growth: 0.05,
        growthInterval: 3,
      });
    });
    log(ctx, "system", `${unit.name}发动【${skill.name}】，我军受伤时有几率急救，触发数次后几率提升。`);
  };
  return skill;
}

function attachJiuxiHuanglongBehavior(skill) {
  skill.trigger = "active";
  delete skill.apply;
  skill.chance = chanceFromProbability(skill.probability, 0.35);
  skill.use = (ctx, unit) => {
    alive(unit.sideUnits).forEach((ally) => {
      clearBadStatuses(ally);
      addStatus(ally, "evade", 2, 1);
    });
    log(ctx, "system", `${unit.name}发动【${skill.name}】，移除我军有害效果并施加规避。`);
    return true;
  };
  return skill;
}

function attachTianxiaWushuangBehavior(skill) {
  skill.trigger = "passive";
  delete skill.use;
  delete skill.chance;
  skill.apply = (ctx, unit) => {
    addStatus(unit, "attackUp", 4, 45);
    addStatus(unit, "rangeUp", 4, 2);
    addStatus(unit, "insight", 4, 1);
    addStatus(unit, "counter", 4, 1, null, skill.name, { source: skill.name, rate: 2 });
    unit.enemyUnits.forEach((enemy) => addStatus(enemy, "taunt", 4, 1, ctx, skill.name, { sourceUnitId: unit.id }));
    log(ctx, "system", `${unit.name}发动【${skill.name}】，前四回合获得攻击距离、洞察、反击，并挑衅敌军。`);
  };
  return skill;
}

function attachTianduYingcaiBehavior(skill) {
  skill.trigger = "active";
  delete skill.apply;
  skill.chance = chanceFromProbability(skill.probability, 0.3);
  skill.use = (ctx, unit) => {
    [...unit.sideUnits, ...unit.enemyUnits].forEach((target) => addStatus(target, "healBlocked", 1, 1, ctx, skill.name));
    pickSkillTargets(unit, unit.enemyUnits, 2, `${skill.target || ""} ${skill.desc || ""}`, Number(skill.distance)).forEach((target) => {
      dealDamage(ctx, unit, target, 1.5, "strategy", skill.name);
    });
    return true;
  };
  return skill;
}

function attachXianquTujiBehavior(skill) {
  skill.trigger = "command";
  delete skill.use;
  delete skill.chance;
  skill.apply = (ctx, unit) => {
    addStatus(unit, "priority", 3, PRIORITY_SPEED_BONUS);
    addStatus(unit, "attackUp", 3, 30);
    addStatus(unit, "combo", 3, 1);
    log(ctx, "system", `${unit.name}发动【${skill.name}】，前三回合获得先手、攻击提高和连击。`);
  };
  return skill;
}

function attachDangyangqiaoBehavior(skill) {
  skill.trigger = "active";
  delete skill.apply;
  skill.chance = chanceFromProbability(skill.probability, 0.4);
  skill.prepareRounds = 1;
  skill.use = (ctx, unit) => {
    const primary = pickSkillTargets(unit, unit.enemyUnits, 1, `${skill.target || ""} ${skill.desc || ""}`, Number(skill.distance))[0];
    if (primary) addStatus(primary, "confusion", Math.random() < 0.5 ? 1 : 2, 1, ctx, skill.name);
    pickTargets(unit.enemyUnits, 2).forEach((enemy) => addStatus(enemy, "silence", 1, 1, ctx, skill.name));
    pickTargets(unit.enemyUnits, 2).forEach((enemy) => addStatus(enemy, "disarm", 1, 1, ctx, skill.name));
    if (unit.name === "张飞") addStatus(unit, "damageUp", 3, 0.1);
    log(ctx, "control", `${unit.name}发动【${skill.name}】，敌军陷入混乱、犹豫和怯战。`);
    return true;
  };
  return skill;
}

function attachBamenJinsuoBehavior(skill) {
  skill.trigger = "active";
  delete skill.apply;
  skill.chance = chanceFromProbability(skill.probability, 0.36);
  skill.use = (ctx, unit) => {
    const targets = pickSkillTargets(unit, unit.enemyUnits, 2, `${skill.target || ""} ${skill.desc || ""}`, Number(skill.distance));
    targets.forEach((enemy) => addStatus(enemy, "disarm", 2, 1, ctx, skill.name));
    return targets.length > 0;
  };
  return skill;
}

function attachYiqiDangqianBehavior(skill) {
  skill.trigger = "active";
  delete skill.apply;
  skill.chance = chanceFromProbability(skill.probability, 0.3);
  skill.prepareRounds = 1;
  skill.use = (ctx, unit) => {
    const targets = pickSkillTargets(unit, unit.enemyUnits, 3, `${skill.target || ""} ${skill.desc || ""}`, Number(skill.distance));
    targets.forEach((target) => dealDamage(ctx, unit, target, 2.8, "attack", skill.name));
    return targets.length > 0;
  };
  return skill;
}

function attachQixuRulinBehavior(skill, desc = "") {
  skill.trigger = "command";
  delete skill.use;
  delete skill.chance;
  skill.apply = (ctx, unit) => {
    const splashRate = strategySplashRateFromText(desc, 0.15);
    const growth = strategySplashGrowthFromText(desc, 0.05);
    const rounds = DAMAGE_MODEL.maxRounds + 1;
    unit.sideUnits.forEach((ally) => {
      addStatus(ally, "strategySplash", rounds, splashRate, null, skill.name, {
        source: skill.name,
        growth,
      });
    });
    log(ctx, "system", `${unit.name}发动【${skill.name}】，我军策略伤害会波及目标相邻敌军，比例每回合提升。`);
  };
  return skill;
}

function applySelfTargetActiveBuffs(ctx, unit, skill, desc) {
  let applied = false;
  const duration = durationFromText(desc, 1);
  if (/伤害.*提高|造成.*提高/.test(desc)) {
    addStatus(unit, "damageUp", duration, activeDamageBoostFromText(desc, 0.1));
    applied = true;
  }
  if (/攻击属性.*提高/.test(desc)) {
    addStatus(unit, "attackUp", duration, 10);
    applied = true;
  }
  if (/谋略属性.*提高|谋略.*提高/.test(desc)) {
    addStatus(unit, "strategyUp", duration, 10);
    applied = true;
  }
  if (/防御.*提高|规避|减伤|伤害降低/.test(desc)) {
    addStatus(unit, "damageDown", duration, 0.1);
    applied = true;
  }
  if (applied) log(ctx, "system", `${unit.name}发动【${skill.name}】：${reportDesc(desc)}`);
  return applied;
}

function activeDamageBoostFromText(text = "", fallback = 0.1) {
  const values = String(text).match(/提高\s*(\d+(?:\.\d+)?)%/g)
    ?.map((part) => Number(part.match(/\d+(?:\.\d+)?/)?.[0]))
    .filter(Number.isFinite) || [];
  return values.length ? Math.max(...values) / 100 : fallback;
}

function strategySplashRateFromText(text = "", fallback = 0.15) {
  const match = String(text).match(/原伤害率的\s*(\d+(?:\.\d+)?)%/);
  return match ? Number(match[1]) / 100 : fallback;
}

function strategySplashGrowthFromText(text = "", fallback = 0.05) {
  const match = String(text).match(/每回合结束时额外提升\s*(\d+(?:\.\d+)?)%/);
  return match ? Number(match[1]) / 100 : fallback;
}

function handleBodyClick(event) {
  const reportAction = event.target.closest("[data-report-action]");
  if (reportAction) {
    handleBattleReportAction(reportAction);
    return;
  }

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
    skillTags(skill).length ? `标签：${skillTags(skill).join("、")}` : "",
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
  fillHeroSkillList(els.heroModalDismantle, "可拆战法", dismantles);
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
  button.innerHTML = `<span>${label}</span><strong>${list.map((item) => item.name).join(" / ")}</strong><em>${[skillGradeText(skill), skill.type || "战法", ...skillTags(skill)].filter(Boolean).join(" · ")}</em>`;
}

function fillHeroSkillList(container, label, skills) {
  const list = Array.isArray(skills) ? skills.filter(Boolean) : [skills].filter(Boolean);
  if (!list.length) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }
  container.hidden = false;
  container.innerHTML = list.map((skill, index) => `
    <button class="detail-skill" data-skill-id="${escapeHtml(skill.id)}" type="button">
      <span>${list.length > 1 ? `${label} ${index + 1}` : label}</span>
      <strong>${escapeHtml(skill.name)}</strong>
      <em>${escapeHtml([skillGradeText(skill), skill.type || "战法", ...skillTags(skill)].filter(Boolean).join(" · "))}</em>
    </button>
  `).join("");
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
    ["发动率", probabilityText(skill)],
    ["效果", skill.effect || "按描述"],
    ["伤害类型", /恢复|休整|急救/.test(desc) ? "恢复" : /策略|谋略|恐慌|妖术/.test(desc) ? "策略伤害" : /攻击|伤害率|猛攻/.test(desc) ? "攻击伤害" : "按描述"],
  ];
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

function prepareRoundsFromText(text = "") {
  const match = text.match(/(\d+)\s*回合准备/);
  return match ? Number(match[1]) : 0;
}

function durationFromText(text = "", fallback = 1) {
  const match = text.match(/持续\s*(\d+)\s*回合/);
  return match ? Number(match[1]) : fallback;
}

function openingDurationFromText(text = "", fallback = 1) {
  const match = text.match(/(?:战斗开始后)?前\s*(\d+)\s*回合/);
  return match ? Number(match[1]) : fallback;
}

function damageRateFromText(text = "", fallback = 0.35) {
  const match = text.match(/伤害率\s*(\d+(?:\.\d+)?)%/);
  return match ? Number(match[1]) / 100 : fallback;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stylesheetImageUrl(path) {
  if (!path) return "";
  if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(path)) return path;
  const normalized = path.replace(/^\.\//, "");
  return normalized.startsWith("../") ? normalized : `../${normalized}`;
}

function cssImageValue(path) {
  const url = stylesheetImageUrl(path)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");
  return `url('${url}')`;
}

function dismantleHero(heroId) {
  const hero = heroById(heroId);
  const skills = dismantleSkillsForHero(hero);
  if (!hero || !skills.length || (state.roster[hero.id] || 0) <= 0) return;
  state.roster[hero.id] -= 1;
  removeHeroFromFormation(hero.id);
  unlockDismantleSkills(hero);
  state.activeBattle = null;
  state.lastBattle = null;
  writeSystemMessage(`拆解${hero.name}，获得战法【${skills.map((skill) => skill.name).join("】、【")}】。`);
  saveState();
  renderAll();
}

function unlockDismantleSkills(hero) {
  const skills = dismantleSkillsForHero(hero);
  skills.forEach((skill) => {
    state.skills[skill.id] = (state.skills[skill.id] || 0) + 1;
  });
  return skills;
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

function dismantleSkillsForHero(hero) {
  const reference = heroReference(hero);
  const ids = [
    ...(hero?.dismantles || []),
    ...(reference?.dismantles || []),
    hero?.dismantle,
    reference?.dismantle,
  ].filter(Boolean);
  return [...new Set(ids)].map(skillById).filter(isEquippableSkill);
}

function showGacha(pulls) {
  const results = pulls.map((pull) => pull.hero ? pull : { hero: pull, converted: false });
  const convertedCount = results.filter((pull) => pull.converted).length;
  const dismantledNames = [...new Set(results.flatMap((pull) => pull.dismantledSkills || []).map((skill) => skill.name))];
  els.gachaSubtitle.textContent = results.some((pull) => pull.hero.rarity >= 5)
    ? `金印显耀，名将入营${convertedCount ? `；${convertedCount}名低星武将转为狗粮` : ""}`
    : convertedCount ? `${convertedCount}名低星武将已转为狗粮` : "名将已入册";
  els.gachaResults.innerHTML = results.map((pull, index) => {
    const hero = pull.hero;
    const skillText = pull.dismantledSkills?.length ? ` · 拆${pull.dismantledSkills.length}战法` : "";
    return `
    <article class="gacha-result rarity-${hero.rarity} ${pull.converted ? "converted" : ""}" data-hero-id="${hero.id}" style="--delay: ${index * 42}ms">
      ${avatarMarkup(hero)}
      <strong>${hero.name}</strong>
      <span>${hero.faction} · ${hero.arm}</span>
      <em>${"★".repeat(hero.rarity)}</em>
      ${pull.converted ? `<small>转为狗粮${skillText}</small>` : ""}
    </article>
  `;
  }).join("");
  if (dismantledNames.length) {
    els.gachaSubtitle.textContent += `；已解锁${dismantledNames.slice(0, 3).map((name) => `【${name}】`).join("")}${dismantledNames.length > 3 ? "等战法" : ""}`;
  }
  els.gachaModal.showModal();
}

function summarizeDesc(desc) {
  return desc ? `${desc.slice(0, 42)}${desc.length > 42 ? "…" : ""}` : "效果已生效";
}

function reportDesc(desc) {
  return desc?.trim() || "效果已生效";
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
  const candidates = HEROES.filter((candidate) =>
    candidate !== hero
    && candidate.officialId
    && candidate.name === hero.name
  );
  const exact = candidates.find((candidate) =>
    candidate.faction === hero.faction
    && candidate.arm === hero.arm
    && (!hero.rarity || candidate.rarity === hero.rarity)
  );
  if (exact || hero.officialId) return exact || null;
  return bestHeroReference(hero, candidates);
}

function bestHeroReference(hero, candidates) {
  if (!candidates.length) return null;
  const ranked = candidates
    .map((candidate) => ({
      hero: candidate,
      score: heroReferenceScore(hero, candidate),
    }))
    .sort((a, b) =>
      b.score - a.score
      || Number(b.hero.rarity || 0) - Number(a.hero.rarity || 0)
      || Number(a.hero.officialId || 0) - Number(b.hero.officialId || 0)
    );
  return ranked[0]?.score > 0 ? ranked[0].hero : null;
}

function heroReferenceScore(hero, candidate) {
  const rarityDelta = Math.abs(Number(hero.rarity || 0) - Number(candidate.rarity || 0));
  return (candidate.faction === hero.faction ? 40 : 0)
    + (candidate.rarity === hero.rarity ? 32 : 0)
    + (candidate.arm === hero.arm ? 24 : 0)
    + (candidate.innate === hero.innate ? 8 : 0)
    + (candidate.portrait ? 4 : 0)
    + (candidate.desc ? 2 : 0)
    + ((candidate.dismantles?.length || candidate.dismantle) ? 1 : 0)
    - rarityDelta;
}

function ensureStarterRoster() {
  [
    ["曹操", "魏", "骑"],
    ["关羽", "蜀", "骑"],
    ["刘备", "蜀", "步"],
    ["孙尚香", "吴", "弓"],
    ["曹仁", "魏", "步"],
  ].map(([name, faction, arm]) => starterHeroId(name, faction, arm)).forEach((id) => {
    state.roster[id] = Math.max(1, state.roster[id] || 0);
  });
}

function resetAll() {
  if (typeof confirm === "function" && !confirm("确定要重置所有武将、战法、编队、抽卡记录和战斗记录吗？")) return;
  localStorage.removeItem("heluozhanzhen");
  resetRuntimeState();
  ensureStarterRoster();
  state.enemy = randomEnemyTeam();
  normalizeFormationSkills();
  writeSystemMessage("已重置所有记录，回到初始阵容。");
  saveState();
  renderAll();
}

function resetRuntimeState() {
  state.roster = {};
  state.skills = {};
  state.fodder = 0;
  state.formation = starterFormation();
  state.enemy = [];
  state.systemMessages = [];
  state.battleReports = [];
  state.lastBattle = null;
  state.activeBattle = null;
}

function starterFormation() {
  return [
    { heroId: starterHeroId("曹操", "魏", "骑"), skills: [starterSkillId("空城"), starterSkillId("安抚军心")] },
    { heroId: starterHeroId("关羽", "蜀", "骑"), skills: [starterSkillId("回马"), starterSkillId("车悬")] },
    { heroId: starterHeroId("刘备", "蜀", "步"), skills: [starterSkillId("美人计"), starterSkillId("危崖困军")] },
  ];
}

function starterHeroId(name, faction, arm) {
  const hero = sortedHeroesByRarity(HEROES).find((candidate) =>
    candidate.name === name
    && candidate.faction === faction
    && candidate.arm === arm
  );
  if (!hero) throw new Error(`缺少初始武将：${name}`);
  return hero.id;
}

function starterSkillId(name) {
  const skill = bestSkillsByName(
    EQUIPPABLE_SKILLS.filter((skill) => isStarterUnlockedSkill(skill) && skill.name === name),
  )[0];
  if (!skill) throw new Error(`缺少初始战法：${name}`);
  return skill.id;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem("heluozhanzhen") || "{}");
    Object.assign(state, saved);
    state.fodder = Number(state.fodder) || 0;
    state.skills ||= {};
    state.systemMessages = Array.isArray(state.systemMessages) ? state.systemMessages.slice(-SYSTEM_MESSAGE_LIMIT) : [];
    state.battleReports = Array.isArray(state.battleReports) ? state.battleReports.slice(-BATTLE_REPORT_LIMIT) : [];
    state.lastBattle = state.battleReports.at(-1)?.battle || null;
    state.activeBattle = null;
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
    systemMessages: state.systemMessages,
    battleReports: state.battleReports,
  }));
}

function drawHeroes(count) {
  const pulls = [];
  for (let i = 0; i < count; i += 1) {
    const hero = weightedHero();
    const converted = hero.rarity <= 4;
    let dismantledSkills = [];
    if (converted) {
      state.fodder += 1;
      dismantledSkills = unlockDismantleSkills(hero);
    } else {
      state.roster[hero.id] = (state.roster[hero.id] || 0) + 1;
    }
    pulls.push({ hero, converted, dismantledSkills });
  }
  const names = pulls.map(({ hero, converted, dismantledSkills }) => {
    const skillText = dismantledSkills?.length ? `，拆出${dismantledSkills.map((skill) => `【${skill.name}】`).join("")}` : "";
    return `${hero.name}${"★".repeat(hero.rarity)}${converted ? `→狗粮${skillText}` : ""}`;
  }).join("、");
  const convertedCount = pulls.filter((pull) => pull.converted).length;
  writeSystemMessage(`招募结果：${names}${convertedCount ? `。狗粮 +${convertedCount}，当前 ${state.fodder}` : ""}`);
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
  const fallback = [
    starterHeroId("曹操", "魏", "骑"),
    starterHeroId("关羽", "蜀", "骑"),
    starterHeroId("刘备", "蜀", "步"),
  ];
  const fallbackHeroes = fallback.map(heroById).filter(Boolean);
  const heroPool = owned.length >= POSITIONS.length
    ? owned
    : [...owned, ...fallbackHeroes.filter((hero) => !owned.some((ownedHero) => ownedHero.id === hero.id))];
  const recommended = recommendTeam({
    heroes: heroPool,
    skills: EQUIPPABLE_SKILLS.filter(isSkillUnlocked),
    positions: POSITIONS,
    minHeroRarity: 0,
    skillGrades: null,
  });
  state.formation = POSITIONS.map((position, index) => ({
    heroId: recommended[index]?.heroId || owned[index]?.id || fallback[index],
    skills: recommended[index]?.skills?.length ? recommended[index].skills : suggestSkills(index),
    position: position.id,
  }));
  normalizeFormationSkills();
  state.activeBattle = null;
  state.lastBattle = null;
  writeSystemMessage("军师完成整备：已按站位职责、属性互补和战法适配自动上阵。");
  saveState();
  renderAll();
}

function suggestSkills(index) {
  const sets = [
    ["空城", "安抚军心"],
    ["回马", "车悬"],
    ["美人计", "危崖困军"],
  ];
  return (sets[index] || []).map(starterSkillId);
}

function randomEnemyTeam() {
  return buildEnemyTeam({
    heroes: HEROES,
    skills: EQUIPPABLE_SKILLS,
    positions: POSITIONS,
    sampleSize: 20,
    skillGrades: ["S", "A"],
  });
}

function getPlayerTeam() {
  normalizeFormationHeroes();
  normalizeFormationSkills();
  return state.formation.map((slot, index) => ({ ...slot, position: POSITIONS[index].id }));
}

function renderAll() {
  normalizeFormationHeroes();
  normalizeFormationSkills();
  renderFormationEditor();
  renderRoster();
  renderSkillCodex();
  renderBattle(currentBattle());
  renderBattleReportBadge();
  renderSystemMessages();
}

function currentBattle() {
  return state.activeBattle || state.lastBattle;
}

function advanceBattleFlow() {
  const battles = runBattleEncounters(getPlayerTeam(), state.enemy);
  const snapshots = battles.map(toBattleSnapshot);
  state.lastBattle = snapshots.at(-1);
  state.activeBattle = null;
  snapshots.forEach(addBattleReport);
  saveState();
  renderAll();
}

function runBattleEncounters(playerTeam, enemyTeam) {
  let playerSlots = cloneTeamForEncounter(playerTeam);
  let enemySlots = cloneTeamForEncounter(enemyTeam);
  const battles = [];

  for (let encounter = 1; encounter <= BATTLE_MAX_ENCOUNTERS; encounter += 1) {
    const battle = createBattle(playerSlots, enemySlots, {
      freshTroops: encounter === 1,
      encounter,
      maxEncounters: BATTLE_MAX_ENCOUNTERS,
    });
    battle.initialPlayer = battle.player.map(unitSnapshot);
    battle.initialEnemy = battle.enemy.map(unitSnapshot);
    while (!battle.complete) advanceBattleRound(battle);
    battles.push(battle);

    if (battle.winner !== "draw" || battle.finishReason !== "roundLimit" || encounter >= BATTLE_MAX_ENCOUNTERS) {
      break;
    }

    playerSlots = carryTeamForward(playerSlots, battle.player);
    enemySlots = carryTeamForward(enemySlots, battle.enemy);
  }

  return battles;
}

function cloneTeamForEncounter(team) {
  return (team || []).map((slot) => ({
    ...slot,
    skills: [...(slot.skills || [])],
  }));
}

function carryTeamForward(team, units) {
  return (team || []).map((slot, index) => ({
    ...slot,
    troops: Math.max(0, Math.round(units[index]?.troops || 0)),
    wounded: Math.max(0, Math.round(units[index]?.wounded || 0)),
  }));
}

function renderFormationEditor() {
  const owned = sortedOwnedHeroes();
  els.formationEditor.innerHTML = POSITIONS.map((position, index) => {
    const slot = state.formation[index] || {};
    return `
      <div class="slot-editor">
        <div class="slot-title">
          <span>${position.label}</span>
          <span>${slot.heroId ? heroById(slot.heroId).name : "空位"}</span>
        </div>
        <select data-kind="hero" data-index="${index}" aria-label="${position.label}武将">
          ${owned.map((hero) => `<option value="${hero.id}" ${hero.id === slot.heroId ? "selected" : ""}>${hero.name} · ${hero.faction}${hero.arm} · ${hero.rarity}星 · 攻距${Number(hero.distance) || defaultAttackDistance()}</option>`).join("")}
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
      if (kind === "hero") selectFormationHero(index, event.target.value);
      if (kind === "skill") state.formation[index].skills[Number(event.target.dataset.skillIndex)] = event.target.value || null;
      normalizeFormationSkills();
      state.lastBattle = null;
      state.activeBattle = null;
      saveState();
      renderAll();
    });
  });
}

function selectFormationHero(index, heroId) {
  const selectedHero = heroById(heroId);
  const selectedKey = heroKey(selectedHero);
  const swapIndex = state.formation.findIndex((slot, slotIndex) => (
    slotIndex !== index && selectedKey && heroKey(heroById(slot?.heroId)) === selectedKey
  ));

  if (swapIndex === -1) {
    state.formation[index].heroId = heroId;
    return;
  }

  const currentSlot = {
    ...state.formation[index],
    skills: [...(state.formation[index].skills || [])],
    position: POSITIONS[swapIndex].id,
  };
  const swapSlot = {
    ...state.formation[swapIndex],
    heroId,
    skills: [...(state.formation[swapIndex]?.skills || [])],
    position: POSITIONS[index].id,
  };
  state.formation[index] = swapSlot;
  state.formation[swapIndex] = currentSlot;
}

function skillOptions(selected, slotIndex, skillIndex) {
  const options = unlockedEquippableSkills(selected, slotIndex, skillIndex);
  return `<option value="" ${selected ? "" : "selected"}>未配置</option>` + options.map((skill) => (
    `<option value="${skill.id}" ${skill.id === selected ? "selected" : ""}>${skill.name} · ${[skillGradeText(skill), skill.type, skill.distance ? `距${skill.distance}` : ""].filter(Boolean).join(" · ")}</option>`
  )).join("");
}

function unlockedEquippableSkills(selected, slotIndex = -1, skillIndex = -1) {
  const occupied = assignedSkillKeys(slotIndex, skillIndex);
  const unlocked = bestSkillsByName(
    EQUIPPABLE_SKILLS.filter((skill) => isSkillUnlocked(skill)),
    selected,
  ).filter((skill) => !occupied.has(skillKey(skill)) || skill.id === selected);
  if (selected && !unlocked.some((skill) => skill.id === selected)) {
    const selectedSkill = skillById(selected);
    if (selectedSkill && isSkillUnlocked(selectedSkill) && !occupied.has(skillKey(selectedSkill))) unlocked.unshift(selectedSkill);
  }
  return unlocked.sort(compareSkillsByGrade);
}

function assignedSkillKeys(exceptSlotIndex = -1, exceptSkillIndex = -1) {
  const keys = new Set();
  state.formation.forEach((slot, slotIndex) => {
    (slot.skills || []).forEach((skillId, skillIndex) => {
      if (!skillId) return;
      if (slotIndex === exceptSlotIndex && skillIndex === exceptSkillIndex) return;
      keys.add(skillKey(skillById(skillId) || { id: skillId }));
    });
  });
  return keys;
}

function normalizeFormationHeroes() {
  const owned = sortedOwnedHeroes();
  const ownedIds = new Set(owned.map((hero) => hero.id));
  const used = new Set();
  state.formation.forEach((slot, index) => {
    state.formation[index] ||= { heroId: null, skills: suggestSkills(index) };
    const current = state.formation[index].heroId;
    const currentHero = current ? heroById(current) : null;
    const currentKey = heroKey(currentHero);
    if (current && ownedIds.has(current) && !used.has(currentKey)) {
      used.add(currentKey);
      return;
    }
    const replacement = owned.find((hero) => !used.has(heroKey(hero)));
    if (replacement) {
      state.formation[index].heroId = replacement.id;
      used.add(heroKey(replacement));
    }
  });
}

function normalizeFormationSkills() {
  const used = new Set();
  state.formation.forEach((slot) => {
    slot.skills ||= [];
    slot.skills = [slot.skills[0] || null, slot.skills[1] || null].map((skillId) => {
      if (!skillId) return null;
      const skill = skillById(skillId);
      if (!isEquippableSkill(skill) || !isSkillUnlocked(skill)) return null;
      const key = skillKey(skill);
      if (used.has(key)) return null;
      used.add(key);
      return preferredSkillByName(skill.name)?.id || skillId;
    });
  });
}

function renderRoster() {
  const owned = sortedOwnedHeroes();
  els.rosterCount.textContent = owned.length;
  els.fodderCount.textContent = `狗粮 ${state.fodder || 0}`;
  els.roster.innerHTML = owned.map((hero) => {
    const innate = skillById(hero.innate);
    const dismantles = dismantleSkillsForHero(hero);
    const canDismantle = (state.roster[hero.id] || 0) > 0 && dismantles.length;
    const portrait = portraitForHero(hero);
    const attackDistance = Number(hero.distance) || defaultAttackDistance();
    return `
      <article class="hero-card" data-hero-id="${hero.id}" ${portrait ? `style="--hero-portrait: ${escapeHtml(cssImageValue(portrait))}"` : ""}>
        ${avatarMarkup(hero, "avatar hero-avatar")}
        <div class="hero-card-main">
          <div class="hero-name-row">
            <span class="hero-name">${hero.name}</span>
            <span class="rarity">${"★".repeat(hero.rarity)}</span>
          </div>
          <div class="hero-meta hero-basic-meta">${hero.faction} · ${hero.arm} · 攻击距离 ${attackDistance}</div>
          <div class="hero-meta hero-skill-meta"><span>自带</span><button class="text-link" data-skill-id="${innate.id}" type="button">${skillNameWithGrade(innate)}</button></div>
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

function renderSkillCodex() {
  const skills = skillCodexList();
  els.skillCodexCount.textContent = skills.length;
  els.skillCodex.innerHTML = skills.map((skill) => {
    const meta = [
      skill.grade ? `${skill.grade}级` : "",
      skill.type || "",
      ...skillTags(skill),
      skill.soldierType || "",
      skill.distance ? `距${skill.distance}` : "",
      skill.probability && skill.probability !== "--" ? skill.probability : "",
    ].filter(Boolean).join(" · ");
    return `
      <button class="skill-codex-card" data-skill-id="${skill.id}" type="button">
        ${skill.icon ? `<img src="${escapeHtml(skill.icon)}" alt="">` : `<span class="skill-codex-mark">${escapeHtml((skill.grade || skill.type || "战").slice(0, 1))}</span>`}
        <span>
          <strong>${escapeHtml(skill.name)}</strong>
          <em>${escapeHtml(meta || "官方战法")}</em>
          <small>${escapeHtml(skill.target || skill.effect || summarizeDesc(skill.desc || ""))}</small>
        </span>
      </button>
    `;
  }).join("");
}

function skillCodexList() {
  const gradeOrder = { S: 0, A: 1, B: 2, C: 3 };
  const typeOrder = { 指挥: 0, 主动: 1, 追击: 2, 被动: 3 };
  const byName = new Map();
  SKILLS.filter(isSkillUnlocked).forEach((skill) => {
    const existing = byName.get(skill.name);
    if (!existing || skillInfoScore(skill) > skillInfoScore(existing)) byName.set(skill.name, skill);
  });
  return [...byName.values()].sort((a, b) =>
    (gradeOrder[a.grade] ?? 9) - (gradeOrder[b.grade] ?? 9)
    || (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9)
    || a.name.localeCompare(b.name, "zh-Hans-CN")
  );
}

function skillInfoScore(skill) {
  return ["grade", "target", "desc", "soldierType", "distance", "probability", "effect", "icon"]
    .reduce((score, key) => score + (skill[key] ? 1 : 0), 0);
}

function renderBattle(result) {
  const playerUnits = result?.player || createPreviewUnits(getPlayerTeam(), "player");
  const enemyUnits = result?.enemy || createPreviewUnits(state.enemy, "enemy");
  els.playerLine.innerHTML = visualLineUnits(playerUnits).map(unitTemplate).join("");
  els.enemyLine.innerHTML = visualLineUnits(enemyUnits).map(unitTemplate).join("");
  els.playerTroops.innerHTML = troopSummaryTemplate(playerUnits);
  els.enemyTroops.innerHTML = troopSummaryTemplate(enemyUnits);
  const shownRound = Math.max(1, result?.rounds || 1);
  const reportIndex = Math.max(1, Number(result?.encounter) || 1);
  els.roundCount.innerHTML = `<span>第 <b>${shownRound}</b> 回合${result && !result.complete ? "（当前）" : ""}</span><small>第 ${reportIndex} / ${reportIndex} 封战报</small>`;
  els.battleSubtitle.textContent = result ? result.subtitle : "双方列阵，尚未交锋";
  els.battleResult.textContent = result ? result.label : "未交锋";
  els.battleResult.dataset.result = result?.winner || "pending";
  updateBattleButton(result);
}

function visualLineUnits(units) {
  const order = new Map(POSITIONS.map((position, index) => [position.id, index]));
  return [...units].sort((a, b) => (order.get(a.position) ?? 99) - (order.get(b.position) ?? 99));
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
  const troopPct = percentOf(unit.troops, unit.maxTroops);
  const baseRange = baseAttackRange(unit);
  const attackRange = getAttackRange(unit);
  const rangeText = String(attackRange);
  const troopText = `${formatNumber(Math.max(0, Math.round(unit.troops)))}/${formatNumber(unit.maxTroops)}`;
  const woundedText = unit.wounded ? `伤${formatNumber(unit.wounded)}` : `${troopPct}%`;
  const portrait = portraitForHero(unit);
  return `
    <article class="unit-card ${unit.side} ${unit.position} ${unit.troops <= 0 ? "fallen" : ""}" data-hero-id="${unit.heroId}" ${portrait ? `style="--unit-portrait: ${escapeHtml(cssImageValue(portrait))}"` : ""}>
      <div class="unit-portrait">
        <span class="unit-stars">${"★".repeat(unit.rarity)}</span>
        <div class="skill-list">
          ${unit.skills.map((skill) => `<button class="skill-chip" data-skill-id="${skill.id}" type="button">${skillNameWithGrade(skill)}</button>`).join("")}
        </div>
      </div>
      <div class="unit-nameplate">
        <span class="unit-faction">${unit.faction}</span>
        <strong class="unit-name">${unit.name}</strong>
        <span class="unit-arm">${unit.arm}</span>
        <span class="unit-range">${rangeText}</span>
      </div>
      <div class="unit-troops">
        <div class="unit-troop-row">
          <span>兵力</span>
          <strong>${troopText}</strong>
          <span class="unit-wounded">${woundedText}</span>
        </div>
        <div class="troop-bar" aria-label="${unit.name}兵力" style="${troopBarStyle(unit.troops, unit.wounded, unit.maxTroops)}">
          <div class="death-fill"></div>
          <div class="wounded-fill"></div>
          <div class="troop-fill"></div>
        </div>
      </div>
    </article>
  `;
}

function troopSummaryTemplate(units) {
  const active = totalTroops(units);
  const wounded = totalWounded(units);
  const max = totalMaxTroops(units);
  return `
    <span class="troop-summary-text">
      ${formatNumber(active)}
      <small>/ ${formatNumber(max)}${wounded ? ` · 伤${formatNumber(wounded)}` : ""}</small>
    </span>
    <span class="team-troop-bar" aria-hidden="true" style="${troopBarStyle(active, wounded, max)}">
      <i class="death-fill"></i>
      <i class="wounded-fill"></i>
      <i class="troop-fill"></i>
    </span>
  `;
}

function troopBarStyle(current, wounded, max) {
  const safeMax = Math.max(0, Number(max) || 0);
  const active = Math.max(0, Math.min(safeMax, Number(current) || 0));
  const injured = Math.max(0, Math.min(safeMax - active, Number(wounded) || 0));
  const dead = Math.max(0, safeMax - active - injured);
  return [
    `--dead-pct: ${barPercent(dead, safeMax)}`,
    `--wounded-left: ${barPercent(dead, safeMax)}`,
    `--wounded-pct: ${barPercent(injured, safeMax)}`,
    `--active-left: ${barPercent(dead + injured, safeMax)}`,
    `--active-pct: ${barPercent(active, safeMax)}`,
  ].join("; ");
}

function barPercent(value, max) {
  if (!max) return "0%";
  const percent = Math.max(0, Math.min(100, (value / max) * 100));
  return `${percent.toFixed(2).replace(/\.?0+$/, "")}%`;
}

function percentOf(value, max) {
  return max ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
}

function heroById(id) {
  return HEROES.find((hero) => hero.id === id) || HEROES[0];
}

function skillById(id) {
  return SKILLS.find((skill) => skill.id === id);
}

function resolvedSkillGrade(skill) {
  if (!skill) return "";
  if (skill.grade) return skill.grade;
  return SKILLS.find((candidate) => candidate.name === skill.name && candidate.grade)?.grade || "";
}

function isStarterUnlockedSkill(skill) {
  return STARTER_SKILL_GRADES.has(resolvedSkillGrade(skill));
}

function isSkillUnlocked(skill) {
  if (!skill) return false;
  if (!isEquippableSkill(skill)) return false;
  if (isStarterUnlockedSkill(skill)) return true;
  if ((Number(state.skills[skill.id]) || 0) > 0) return true;
  return SKILLS.some((candidate) => (
    candidate.name === skill.name
    && (Number(state.skills[candidate.id]) || 0) > 0
  ));
}

function ownedHeroes() {
  return HEROES.filter((hero) => state.roster[hero.id] > 0);
}

function sortedOwnedHeroes() {
  return sortedHeroesByRarity(ownedHeroes());
}

function sortedHeroesByRarity(heroes) {
  return [...heroes].sort(compareHeroesByRarity);
}

function heroKey(hero) {
  return hero?.name || hero?.id || "";
}

function compareHeroesByRarity(a, b) {
  return (Number(b.rarity) || 0) - (Number(a.rarity) || 0)
    || a.name.localeCompare(b.name, "zh-Hans-CN");
}

function preferredSkillByName(name) {
  return bestSkillsByName(EQUIPPABLE_SKILLS.filter((skill) => isSkillUnlocked(skill) && skill.name === name))[0] || null;
}

function bestSkillsByName(skills, selected = null) {
  const selectedSkill = selected ? skillById(selected) : null;
  const byName = new Map();
  skills.forEach((skill) => {
    const existing = byName.get(skillKey(skill));
    if (!existing || compareSkillPreference(skill, existing, selectedSkill) < 0) byName.set(skillKey(skill), skill);
  });
  return [...byName.values()];
}

function compareSkillPreference(a, b, selectedSkill = null) {
  if (selectedSkill) {
    if (a.id === selectedSkill.id) return -1;
    if (b.id === selectedSkill.id) return 1;
  }
  return (isOfficialId(a.id) ? 0 : 1) - (isOfficialId(b.id) ? 0 : 1)
    || skillInfoScore(b) - skillInfoScore(a)
    || compareSkillsByGrade(a, b);
}

function isOfficialId(id) {
  return String(id || "").startsWith("official-");
}

function skillKey(skill) {
  return skill?.name || skill?.id || "";
}

function compareSkillsByGrade(a, b) {
  return (SKILL_GRADE_ORDER[resolvedSkillGrade(a)] ?? 9) - (SKILL_GRADE_ORDER[resolvedSkillGrade(b)] ?? 9)
    || a.name.localeCompare(b.name, "zh-Hans-CN");
}

function formatNumber(number) {
  return Math.round(number).toLocaleString("zh-CN");
}

function log(ctx, type, text, meta = {}) {
  const { actorUnit, targetUnit, ...safeMeta } = meta;
  const implicitActor = ctx?.actionUnit && String(text).includes(ctx.actionUnit.name)
    ? ctx.actionUnit
    : null;
  const actorState = reportUnitState(actorUnit || implicitActor);
  const targetState = reportUnitState(targetUnit);
  ctx.log.push({
    type,
    text,
    ...safeMeta,
    ...(actorState ? { actorState } : {}),
    ...(targetState ? { targetState } : {}),
    round: Number(ctx?.round) || 0,
    participants: reportParticipants(ctx, text, { ...safeMeta, actorUnit, targetUnit }),
  });
}

function reportUnitState(unit) {
  if (!unit) return null;
  return {
    id: unit.id || "",
    heroId: unit.heroId || "",
    name: unit.name || "",
    side: unit.side || "",
    position: unit.position || "",
    portrait: unit.portrait || reportParticipantPortrait(unit),
    troops: Math.max(0, Math.round(Number(unit.troops) || 0)),
    wounded: Math.max(0, Math.round(Number(unit.wounded) || 0)),
    maxTroops: Math.max(0, Math.round(Number(unit.maxTroops) || 0)),
  };
}

function reportParticipants(ctx, text, meta = {}) {
  const participants = [];
  const seen = new Set();
  const add = (participant) => {
    if (!participant?.name || !participant.side) return;
    const key = `${participant.role || "unit"}:${participant.id || participant.heroId || participant.name}:${participant.side}`;
    if (seen.has(key)) return;
    seen.add(key);
    participants.push({
      id: participant.id || "",
      heroId: participant.heroId || "",
      name: participant.name,
      side: participant.side,
      role: participant.role || "unit",
      portrait: participant.portrait || reportParticipantPortrait(participant),
    });
  };

  (meta.participants || []).forEach(add);
  add(unitParticipantFromMeta(meta.actorUnit, "actor"));
  add(unitParticipantFromMeta(meta.targetUnit, "target"));
  if (ctx?.actionUnit && String(text).includes(ctx.actionUnit.name)) {
    add(unitParticipantFromMeta(ctx.actionUnit, "actor"));
  }

  const units = ctx?.units || [];
  const nameCounts = units.reduce((counts, unit) => {
    counts[unit.name] = (counts[unit.name] || 0) + 1;
    return counts;
  }, {});
  units.forEach((unit) => {
    if (nameCounts[unit.name] === 1 && String(text).includes(unit.name)) {
      add(unitParticipantFromMeta(unit, "unit"));
    }
  });
  return participants;
}

function unitParticipantFromMeta(unit, role) {
  if (!unit) return null;
  if (typeof unitLogParticipant === "function") {
    const participant = unitLogParticipant(unit, role);
    return participant ? {
      ...participant,
      portrait: participant.portrait || unit.portrait || reportParticipantPortrait(unit),
    } : null;
  }
  return { id: unit.id, heroId: unit.heroId, name: unit.name, side: unit.side, role };
}

function reportParticipantPortrait(participant) {
  if (!participant) return "";
  if (participant.portrait) return participant.portrait;
  const hasStableId = Boolean(participant.heroId || participant.id);
  const hero = hasStableId
    ? HEROES.find((candidate) => candidate.id === participant.heroId || candidate.id === participant.id)
    : HEROES.find((candidate) => candidate.name === participant.name);
  return portraitForHero(hero);
}

init();
