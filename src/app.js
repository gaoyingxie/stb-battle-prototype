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
  if (/指挥|被动/.test(skill.type)) {
    skill.trigger = /被动/.test(skill.type) ? "passive" : "command";
    skill.apply = (ctx, unit) => {
      const allies = /我军|友军|自身/.test(desc) ? unit.sideUnits : [unit];
      if (/伤害.*提高|造成.*提高/.test(desc)) allies.forEach((ally) => addStatus(ally, "damageUp", 2, 0.1));
      if (/攻击属性.*提高/.test(desc)) allies.forEach((ally) => addStatus(ally, "attackUp", 2, 10));
      if (/谋略属性.*提高|谋略.*提高/.test(desc)) allies.forEach((ally) => addStatus(ally, "strategyUp", 2, 10));
      const rangeUp = attackRangeDelta(desc);
      if (rangeUp > 0) allies.forEach((ally) => addStatus(ally, "rangeUp", 2, rangeUp));
      if (/防御.*提高|规避|减伤|伤害降低/.test(desc)) allies.forEach((ally) => addStatus(ally, "damageDown", 2, 0.1));
      if (/先手|优先行动/.test(desc)) {
        const duration = openingDurationFromText(desc, durationFromText(desc, 2));
        allies.forEach((ally) => addStatus(ally, "priority", duration, PRIORITY_SPEED_BONUS));
      }
      if (/洞察/.test(desc)) allies.forEach((ally) => addStatus(ally, "insight", durationFromText(desc, 8), 1));
      if (/援护/.test(desc)) allies.forEach((ally) => addStatus(ally, "guard", durationFromText(desc, 2), 1));
      if (/分兵/.test(desc)) allies.forEach((ally) => addStatus(ally, "split", durationFromText(desc, 1), damageRateFromText(desc, 0.35)));
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
    });
    return true;
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

function assignedHeroKeys(exceptSlotIndex = -1) {
  const keys = new Set();
  state.formation.forEach((slot, slotIndex) => {
    if (!slot?.heroId || slotIndex === exceptSlotIndex) return;
    keys.add(heroKey(heroById(slot.heroId)));
  });
  return keys;
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

function toBattleSnapshot(battle) {
  return {
    winner: battle.winner,
    label: battle.label,
    subtitle: battle.subtitle,
    rounds: battle.rounds,
    complete: battle.complete,
    finishReason: battle.finishReason,
    encounter: battle.encounter || 1,
    maxEncounters: battle.maxEncounters || 1,
    player: (battle.player || []).map(unitSnapshot),
    enemy: (battle.enemy || []).map(unitSnapshot),
    log: (battle.log || []).map(reportEntrySnapshot),
  };
}

function unitSnapshot(unit) {
  return {
    id: unit.id,
    heroId: unit.heroId,
    side: unit.side,
    position: unit.position,
    name: unit.name,
    faction: unit.faction,
    arm: unit.arm,
    rarity: unit.rarity,
    portrait: unit.portrait || portraitForHero(unit),
    distance: unit.distance,
    stats: { ...(unit.stats || {}) },
    bonuses: [...(unit.bonuses || [])],
    skills: (unit.skills || []).map(skillSnapshot),
    troops: Math.max(0, Math.round(unit.troops || 0)),
    wounded: Math.max(0, Math.round(unit.wounded || 0)),
    maxTroops: unit.maxTroops || 10000,
    statuses: [...(unit.statuses || [])],
  };
}

function skillSnapshot(skill) {
  return {
    id: skill.id,
    name: skill.name,
    grade: skill.grade,
    type: skill.type,
    distance: skill.distance,
    icon: skill.icon,
  };
}

function reportEntrySnapshot(entry) {
  return {
    ...entry,
    participants: (entry.participants || []).map((participant) => ({ ...participant })),
    details: [...(entry.details || [])],
  };
}

function addBattleReport(battle) {
  const report = {
    id: `battle-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: battleReportTitle(battle),
    createdAt: Date.now(),
    read: false,
    battle,
  };
  state.battleReports = [...(state.battleReports || []), report].slice(-BATTLE_REPORT_LIMIT);
  selectedBattleReportId = report.id;
  battleReportView = "summary";
  battleReportStatsTab = "hero";
}

function battleReportTitle(battle) {
  const playerName = battle?.player?.[0]?.name || "我军";
  const enemyName = battle?.enemy?.[0]?.name || "守军";
  const encounter = Number(battle?.encounter) || 1;
  return `${playerName} 对阵 ${enemyName}${encounter > 1 ? `（第${encounter}轮）` : ""}`;
}

function renderBattleReportBadge() {
  const unread = (state.battleReports || []).filter((report) => !report.read).length;
  els.reportBadge.textContent = unread;
  els.reportBadge.hidden = unread <= 0;
  els.openBattleReports.classList.toggle("has-unread", unread > 0);
}

function openBattleReportList() {
  battleReportView = "list";
  selectedBattleReportId ||= latestBattleReport()?.id || null;
  renderBattleReportModal();
  els.battleReportModal.showModal();
}

function handleBattleReportAction(button) {
  const action = button.dataset.reportAction;
  if (action === "open") {
    selectedBattleReportId = button.dataset.reportId;
    battleReportView = "summary";
    battleReportStatsTab = "hero";
    battleReportFormationSide = "player";
    markBattleReportRead(selectedBattleReportId);
    saveState();
    renderBattleReportBadge();
    renderBattleReportModal();
    return;
  }
  if (action === "back") {
    battleReportView = "list";
    renderBattleReportModal();
    return;
  }
  if (action === "summary" || action === "log" || action === "stats" || action === "formation") {
    battleReportView = action;
    renderBattleReportModal();
    return;
  }
  if (action === "formation-side") {
    battleReportFormationSide = button.dataset.side === "enemy" ? "enemy" : "player";
    battleReportView = "formation";
    renderBattleReportModal();
    return;
  }
  if (action === "hero-stats" || action === "skill-stats") {
    battleReportStatsTab = action === "hero-stats" ? "hero" : "skill";
    battleReportView = "stats";
    renderBattleReportModal();
    return;
  }
  if (action === "mark-all-read") {
    (state.battleReports || []).forEach((report) => {
      report.read = true;
    });
    saveState();
    renderBattleReportBadge();
    renderBattleReportModal();
  }
}

function handleBattleReportClose() {
  if (battleReportView === "log" || battleReportView === "stats" || battleReportView === "formation") {
    battleReportView = "summary";
    renderBattleReportModal();
    return;
  }
  els.battleReportModal.close();
}

function markBattleReportRead(reportId) {
  const report = state.battleReports.find((item) => item.id === reportId);
  if (report) report.read = true;
}

function latestBattleReport() {
  return (state.battleReports || []).at(-1) || null;
}

function selectedBattleReport() {
  return state.battleReports.find((report) => report.id === selectedBattleReportId) || latestBattleReport();
}

function renderBattleReportModal() {
  const report = selectedBattleReport();
  if (battleReportView === "list" || !report) {
    els.battleReportEyebrow.textContent = `${state.battleReports.length} 封战报`;
    els.battleReportTitle.textContent = "个人战报";
    els.battleReportContent.innerHTML = battleReportListHtml();
    return;
  }

  const viewTitle = battleReportView === "stats" ? "统计" : battleReportView === "log" ? "战报详情" : battleReportView === "formation" ? "阵容详情" : "战斗地点";
  els.battleReportEyebrow.textContent = `id:${report.id.slice(-8)}`;
  els.battleReportTitle.textContent = viewTitle;
  els.battleReportContent.innerHTML = battleReportDetailHtml(report);
}

function battleReportListHtml() {
  const reports = [...(state.battleReports || [])].reverse();
  return `
    <div class="battle-report-list-view">
      <div class="battle-report-toolbar">
        <div class="battle-report-tabs" aria-label="战报分类">
          <button class="active" type="button">个人</button>
          <button type="button" disabled>收藏</button>
        </div>
        <div class="battle-report-tools">
          <button class="battle-report-tool" type="button" disabled>搜索</button>
          <button class="battle-report-tool" data-report-action="mark-all-read" type="button">设为全部已读</button>
        </div>
      </div>
      <div class="battle-report-list">
        ${reports.length ? reports.map(battleReportListCardHtml).join("") : '<div class="empty-report">暂无战报。点击开战后会生成一封完整战报。</div>'}
      </div>
    </div>
  `;
}

function battleReportListCardHtml(report) {
  const battle = report.battle;
  const playerTroops = totalUnitsTroops(battle.player);
  const enemyTroops = totalUnitsTroops(battle.enemy);
  const resultClass = battle.winner || "draw";
  return `
    <button class="battle-report-card ${report.read ? "" : "unread"}" data-report-action="open" data-report-id="${escapeHtml(report.id)}" type="button">
      <span class="battle-report-shield" aria-hidden="true"></span>
      <div class="battle-report-card-main">
        <div class="battle-report-card-head">
          <strong>${escapeHtml(report.title)}</strong>
          <span>土地 Lv.${Math.max(1, battle.rounds || 1)}</span>
          <em>${formatBattleReportTime(report.createdAt)}</em>
        </div>
        <div class="battle-report-card-body">
          <div class="battle-report-list-side player">
            <span>${formatNumber(playerTroops.current)}/${formatNumber(playerTroops.max)}</span>
            <div class="battle-report-mini-line">${battle.player.map(reportMiniUnitHtml).join("")}</div>
          </div>
          <div class="battle-report-result ${resultClass}">${escapeHtml(battle.label)}</div>
          <div class="battle-report-list-side enemy">
            <span>${formatNumber(enemyTroops.current)}/${formatNumber(enemyTroops.max)}</span>
            <div class="battle-report-mini-line">${battle.enemy.map(reportMiniUnitHtml).join("")}</div>
          </div>
        </div>
      </div>
    </button>
  `;
}

function reportMiniUnitHtml(unit) {
  const portrait = unit.portrait || portraitForHero(unit);
  return `
    <span class="battle-report-mini-unit ${unit.troops <= 0 ? "fallen" : ""}" title="${escapeHtml(unit.name)}">
      ${portrait ? `<img src="${escapeHtml(portrait)}" alt="">` : escapeHtml(unit.name.slice(0, 1))}
      <b>${"★".repeat(Number(unit.rarity) || 0)}</b>
    </span>
  `;
}

function battleReportDetailHtml(report) {
  const battle = report.battle;
  const body = battleReportView === "stats"
    ? battleReportStatsHtml(battle)
    : battleReportView === "formation"
      ? battleReportFormationHtml(battle)
      : battleReportView === "log"
        ? visibleReportLogHtml(battle.log, battle)
        : battleReportSummaryHtml(report);
  const match = battleReportView === "summary"
    ? `
      <div class="battle-report-match">
        ${battleReportScoreBarHtml(battle.player, "player")}
        <div class="battle-report-match-result ${battle.winner || "draw"}">${escapeHtml(battleReportResultGlyph(battle))}</div>
        ${battleReportScoreBarHtml(battle.enemy, "enemy")}
      </div>
    `
    : "";
  return `
    <div class="battle-report-detail-view ${battleReportView}-page">
      <button class="battle-report-back" data-report-action="back" type="button">个人战报</button>
      ${match}
      ${body}
      ${battleReportNavHtml()}
    </div>
  `;
}
function battleReportResultGlyph(battle) {
  if (battle.winner === "player") return "胜";
  if (battle.winner === "enemy") return "败";
  return "平";
}

function battleReportScoreBarHtml(units, side) {
  const totals = totalUnitsTroops(units);
  const title = side === "player" ? "我方" : "守军";
  return `
    <div class="battle-report-score ${side}">
      <span>${formatNumber(totals.current)}/${formatNumber(totals.max)}</span>
      <strong>${title}</strong>
      ${battleReportTroopBarHtml(totals, side)}
    </div>
  `;
}

function battleReportTroopBarHtml(totals, side, className = "battle-report-score-bar") {
  return `
    <div class="${className} ${side}" style="${troopBarStyle(totals.current, totals.wounded, totals.max)}">
      <span class="death-fill"></span>
      <span class="wounded-fill"></span>
      <span class="troop-fill"></span>
    </div>
  `;
}

function battleReportSummaryHtml(report) {
  const battle = report.battle;
  return `
    <div class="battle-report-stage">
      <div class="battle-report-army player">${battle.player.map(reportUnitCardHtml).join("")}</div>
      <div class="battle-report-center">
        <strong>【${battle.winner === "player" ? "我方胜利" : battle.winner === "enemy" ? "守军胜利" : "平局"}】</strong>
        <span>历经 ${battle.rounds} 回合</span>
        <span>获得 铜币 1</span>
        <button class="battle-report-replay" data-report-action="log" type="button">战况回放</button>
      </div>
      <div class="battle-report-army enemy">${battle.enemy.map(reportUnitCardHtml).join("")}</div>
    </div>
  `;
}

function reportUnitCardHtml(unit) {
  const portrait = unit.portrait || portraitForHero(unit);
  const totals = {
    current: Math.max(0, Number(unit.troops) || 0),
    wounded: Math.max(0, Number(unit.wounded) || 0),
    max: Math.max(0, Number(unit.maxTroops) || 0),
  };
  return `
    <article class="battle-report-unit ${unit.side} ${unit.troops <= 0 ? "fallen" : ""}">
      <div class="battle-report-unit-portrait">
        ${portrait ? `<img src="${escapeHtml(portrait)}" alt="${escapeHtml(unit.name)}">` : ""}
        <span>${"★".repeat(Number(unit.rarity) || 0)}</span>
      </div>
      <div class="battle-report-unit-name">
        <small>${escapeHtml(unit.faction || "")}</small>
        <strong>${escapeHtml(unit.name)}</strong>
        <em>${Number(unit.distance) || defaultAttackDistance()}</em>
      </div>
      <div class="battle-report-unit-troops">
        <span>兵力${formatNumber(unit.troops)}</span>
        <b>伤${formatNumber(unit.wounded || 0)}</b>
      </div>
      ${battleReportTroopBarHtml(totals, unit.side)}
    </article>
  `;
}

function battleReportFormationHtml(battle) {
  const side = battleReportFormationSide === "enemy" ? "enemy" : "player";
  const units = visualLineUnits(battle[side] || []);
  return `
    <section class="battle-report-formation-view">
      <div class="battle-report-formation-tabs" aria-label="阵容方">
        <button class="${side === "player" ? "active" : ""}" data-report-action="formation-side" data-side="player" type="button">我方</button>
        <button class="${side === "enemy" ? "active" : ""}" data-report-action="formation-side" data-side="enemy" type="button">敌方</button>
      </div>
      <div class="battle-report-formation-panel ${side}">
        ${POSITIONS.map((position) => battleReportFormationRowHtml(units.find((unit) => unit.position === position.id), position, side)).join("")}
      </div>
    </section>
  `;
}

function battleReportFormationRowHtml(unit, position, side) {
  const empty = !unit;
  const portrait = unit ? unit.portrait || portraitForHero(unit) : "";
  const skills = unit ? unit.skills || [] : [];
  return `
    <article class="battle-report-formation-row ${side} ${empty ? "empty" : ""}">
      <div class="battle-report-formation-position">${escapeHtml(position.label)}</div>
      <div class="battle-report-formation-hero">
        ${portrait ? `<img src="${escapeHtml(portrait)}" alt="${escapeHtml(unit.name)}">` : ""}
        <span>
          <strong>${empty ? "未配置" : escapeHtml(unit.name)}</strong>
          <small>${empty ? "" : `Lv.30 · ${escapeHtml(unit.faction || "")}${escapeHtml(unit.arm || "")} · 距${Number(unit.distance) || defaultAttackDistance()}`}</small>
        </span>
        ${empty ? "" : `<em>${"★".repeat(Number(unit.rarity) || 0)}</em>`}
      </div>
      <div class="battle-report-formation-skills">
        ${[0, 1, 2].map((index) => battleReportFormationSkillHtml(skills[index], index)).join("")}
      </div>
      <div class="battle-report-formation-reserve" aria-hidden="true"></div>
    </article>
  `;
}

function battleReportFormationSkillHtml(skill, index) {
  if (!skill) {
    return `
      <span class="battle-report-formation-skill empty">
        <i></i>
        <b>${index === 0 ? "未配置" : "空"}</b>
      </span>
    `;
  }
  return `
    <button class="battle-report-formation-skill" data-skill-id="${escapeHtml(skill.id)}" type="button" title="${escapeHtml(skill.name)}">
      ${skill.icon ? `<img src="${escapeHtml(skill.icon)}" alt="">` : `<i>${escapeHtml(skill.grade || "战")}</i>`}
      <b>${escapeHtml(skill.name)}</b>
      ${skill.grade ? `<em>${escapeHtml(skill.grade)}</em>` : ""}
    </button>
  `;
}

function visibleReportLogHtml(entries, battle) {
  return `
    <section class="battle-report-log-panel">
      ${reportLogInnerHtml(entries, battle, false)}
    </section>
  `;
}

function battleReportStatsHtml(battle) {
  return `
    <section class="battle-report-stats-view">
      <nav class="battle-report-stat-nav" aria-label="统计分类">
        <button class="${battleReportStatsTab === "hero" ? "active" : ""}" data-report-action="hero-stats" type="button">武将统计</button>
        <button class="${battleReportStatsTab === "skill" ? "active" : ""}" data-report-action="skill-stats" type="button">战法统计</button>
      </nav>
      <div class="battle-report-stat-panel">
        ${battleReportStatsTab === "hero" ? battleHeroStatsHtml(battle) : battleSkillStatsHtml(battle)}
      </div>
    </section>
  `;
}

function battleHeroStatsHtml(battle) {
  const stats = collectBattleStats(battle);
  return `
    <div class="battle-hero-stat-table">
      <div class="battle-hero-stat-head">
        <span></span>
        <span>普通杀伤</span>
        <span>战法杀伤</span>
        <span>战法释放</span>
        <span>救援</span>
        <span>损失</span>
        <span>本场伤兵</span>
        <span>总伤兵</span>
      </div>
      ${stats.map(heroStatRowHtml).join("")}
    </div>
  `;
}

function heroStatRowHtml(unit) {
  const totalWounded = Math.max(unit.wounded, unit.loss + unit.wounded);
  return `
    <article class="battle-hero-stat-row ${unit.side}">
      ${statUnitIdentityHtml(unit)}
      <span>${formatNumber(unit.attackDamage)}</span>
      <span>${formatNumber(unit.skillDamage)}</span>
      <span>${formatNumber(unit.skillCasts)}</span>
      <span>${formatNumber(unit.healing)}</span>
      <span class="danger">${formatNumber(unit.loss)}</span>
      <span class="danger">${formatNumber(unit.wounded)}</span>
      <span class="danger">${formatNumber(totalWounded)}</span>
    </article>
  `;
}

function battleSkillStatsHtml(battle) {
  const stats = collectBattleStats(battle);
  return `<div class="battle-skill-stat-list">${stats.map(skillStatRowHtml).join("")}</div>`;
}

function skillStatRowHtml(unit) {
  const skills = [...unit.skills.values()]
    .sort((a, b) => (b.count - a.count) || (b.damage + b.healing) - (a.damage + a.healing) || a.name.localeCompare(b.name, "zh-Hans-CN"));
  const cells = skills.length ? skills.slice(0, 4).map(skillStatCellHtml).join("") : '<span class="battle-skill-stat-empty">-</span>';
  return `
    <article class="battle-skill-stat-row ${unit.side}">
      ${statUnitIdentityHtml(unit)}
      <div class="battle-skill-stat-cells">${cells}</div>
    </article>
  `;
}

function skillStatCellHtml(skill) {
  return `
    <span class="battle-skill-stat-cell">
      <strong>${escapeHtml(skill.name)}</strong>
      <em>${formatNumber(skill.count)}次</em>
      <small>${skill.healing ? "救援" : "杀伤"} ${formatNumber(skill.damage + skill.healing)}</small>
    </span>
  `;
}

function statUnitIdentityHtml(unit) {
  const portrait = unit.portrait || portraitForHero(unit);
  return `
    <span class="battle-stat-unit">
      ${portrait ? `<img src="${escapeHtml(portrait)}" alt="">` : ""}
      <b>${escapeHtml(positionLabel(unit.position))}</b>
      <strong>${escapeHtml(unit.name)}</strong>
    </span>
  `;
}

function battleReportNavHtml() {
  const item = (action, label) => `<button class="${battleReportView === action ? "active" : ""}" data-report-action="${action}" type="button">${label}</button>`;
  return `
    <nav class="battle-report-bottom-nav" aria-label="战报视图">
      ${item("log", "战报详情")}
      ${item("stats", "统计")}
      ${item("formation", "阵容详情")}
    </nav>
  `;
}

function totalUnitsTroops(units) {
  return {
    current: (units || []).reduce((sum, unit) => sum + Math.max(0, Number(unit.troops) || 0), 0),
    wounded: (units || []).reduce((sum, unit) => sum + Math.max(0, Number(unit.wounded) || 0), 0),
    max: (units || []).reduce((sum, unit) => sum + Math.max(0, Number(unit.maxTroops) || 0), 0),
  };
}

function formatBattleReportTime(timestamp) {
  return new Date(timestamp || Date.now()).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function shuffle(items) {
  return items
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);
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
  if (typeof unitLogParticipant === "function") return unitLogParticipant(unit, role);
  return { id: unit.id, heroId: unit.heroId, name: unit.name, side: unit.side, role };
}

function reportParticipantPortrait(participant) {
  if (!participant) return "";
  if (participant.portrait) return participant.portrait;
  const hero = HEROES.find((candidate) => (
    candidate.id === participant.heroId
    || candidate.id === participant.id
    || candidate.name === participant.name
  ));
  return portraitForHero(hero);
}

function writeReport(entries, battle = null) {
  const report = ensureReportRenderTarget();
  report.innerHTML = reportLogInnerHtml(entries, battle, true);
  report.scrollTop = report.scrollHeight || 0;
}

function reportLogInnerHtml(entries, battle = null, includeStats = true) {
  const round = [...entries].reverse().find((entry) => entry.type === "round")?.text
    || "准备回合";
  return `
    <div class="report-detail-title">
      <span>战报详情</span>
      <b>${escapeHtml(round)}</b>
    </div>
    ${includeStats && battle?.complete ? battleStatsHtml(battle) : ""}
    ${reportRoundsHtml(entries)}
  `;
}

function reportRoundsHtml(entries) {
  const rounds = groupReportRounds(entries || []);
  if (!rounds.length) return '<div class="empty-report">暂无战斗记录。</div>';
  return `<div class="report-rounds">${rounds.map(reportRoundHtml).join("")}</div>`;
}

function groupReportRounds(entries) {
  const rounds = [];
  let current = null;
  entries.forEach((entry, index) => {
    if (entry.type === "round" || !current) {
      current = {
        id: `report-round-${rounds.length + 1}`,
        title: entry.type === "round" ? entry.text : "准备阶段",
        roundEntry: entry.type === "round" ? entry : null,
        groups: [],
      };
      rounds.push(current);
      if (entry.type === "round") return;
    }

    const actor = reportEntryActionUnit(entry);
    const actorKey = actor ? `${actor.side}:${actor.id || actor.heroId || actor.name}` : `system:${entry.type}`;
    const previous = current.groups.at(-1);
    if (previous && previous.actorKey === actorKey) {
      previous.entries.push(entry);
      previous.actor = previous.actor || actor;
      previous.lastEntryIndex = index;
      return;
    }
    current.groups.push({
      id: `${current.id}-action-${current.groups.length + 1}`,
      actorKey,
      actor,
      entries: [entry],
      firstEntryIndex: index,
      lastEntryIndex: index,
    });
  });
  return rounds;
}

function reportRoundHtml(round, roundIndex) {
  const actions = round.groups.filter((group) => group.entries.length);
  const jumps = actions.filter((group) => group.actor);
  return `
    <section class="report-round-block" aria-labelledby="${escapeHtml(round.id)}-title">
      <aside class="report-turn-rail" aria-label="${escapeHtml(round.title)}行动顺序">
        <strong id="${escapeHtml(round.id)}-title">${escapeHtml(round.title)}</strong>
        <div class="report-turn-list">
          ${jumps.length ? jumps.map((group, index) => reportTurnJumpHtml(group, roundIndex, index)).join("") : '<span class="report-turn-empty">无武将行动</span>'}
        </div>
      </aside>
      <div class="report-round-actions">
        <div class="log-line round"><span>${escapeHtml(round.title)}</span><em>行动阶段</em></div>
        ${actions.map((group, index) => reportActionGroupHtml(group, roundIndex, index)).join("")}
      </div>
    </section>
  `;
}

function reportTurnJumpHtml(group, roundIndex, groupIndex) {
  const actor = group.actor;
  const side = actor?.side === "enemy" ? "enemy" : actor?.side === "player" ? "player" : "system";
  const portrait = actor?.portrait || reportParticipantPortrait(actor);
  const label = actor?.name || reportActionTypeLabel(group.entries[0]);
  const troopText = actor?.troops !== undefined ? `兵力 ${formatNumber(actor.troops)}` : "行动";
  return `
    <a class="report-turn-jump ${side}" href="#${escapeHtml(group.id)}" title="${escapeHtml(label)} ${escapeHtml(troopText)}">
      <span class="report-turn-order">${roundIndex + 1}.${groupIndex + 1}</span>
      <span class="report-turn-avatar">
        ${portrait ? `<img src="${escapeHtml(portrait)}" alt="${escapeHtml(label)}头像" loading="lazy">` : escapeHtml(label.slice(0, 1))}
      </span>
    </a>
  `;
}

function reportActionGroupHtml(group, roundIndex, groupIndex) {
  const actor = group.actor;
  const side = actor?.side === "enemy" ? "enemy" : actor?.side === "player" ? "player" : "system";
  const portrait = actor?.portrait || reportParticipantPortrait(actor);
  const label = actor?.name || reportActionTypeLabel(group.entries[0]);
  const troopText = actor?.troops !== undefined ? `兵力 ${formatNumber(actor.troops)}` : "战况";
  const stepText = actor ? `第 ${roundIndex + 1} 回合 · 第 ${groupIndex + 1} 次行动` : "战斗记录";
  return `
    <article id="${escapeHtml(group.id)}" class="report-action-group ${side}">
      <header class="report-action-head">
        <div class="report-action-hero">
          <span class="report-action-portrait">
            ${portrait ? `<img src="${escapeHtml(portrait)}" alt="${escapeHtml(label)}头像" loading="lazy">` : escapeHtml(label.slice(0, 1))}
          </span>
          <div>
            <strong>${escapeHtml(label)}</strong>
            <small>${escapeHtml(stepText)}</small>
          </div>
        </div>
        <b>${escapeHtml(troopText)}</b>
      </header>
      <div class="report-action-events">
        ${group.entries.map(reportLineHtml).join("")}
      </div>
    </article>
  `;
}

function reportEntryActionUnit(entry) {
  return entry.actorState
    || reportParticipantState(entry, "actor")
    || reportParticipantState(entry, "attacker")
    || reportParticipantState(entry, "target")
    || null;
}

function reportParticipantState(entry, role) {
  const participant = (entry.participants || []).find((item) => item.role === role);
  if (!participant) return null;
  return {
    id: participant.id || "",
    heroId: participant.heroId || "",
    name: participant.name || "",
    side: participant.side || "",
    portrait: participant.portrait || reportParticipantPortrait(participant),
  };
}

function reportActionTypeLabel(entry) {
  return {
    hit: "攻击",
    heal: "恢复",
    control: "状态",
    result: "终",
    system: "令",
  }[entry?.type] || "战";
}

function ensureReportRenderTarget() {
  let report = document.querySelector("#report");
  if (report) return report;
  report = document.createElement("div");
  report.id = "report";
  report.className = "report report-test-buffer";
  report.setAttribute("aria-hidden", "true");
  document.body.append(report);
  return report;
}

function battleStatsHtml(battle) {
  const stats = collectBattleStats(battle);
  const totalDamage = stats.reduce((sum, unit) => sum + unit.damage, 0);
  const totalHealing = stats.reduce((sum, unit) => sum + unit.healing, 0);
  return `
    <section class="battle-stats" aria-label="战后数据统计">
      <div class="battle-stats-head">
        <div>
          <strong>战后统计</strong>
          <span>只统计已产生数值的伤害和治疗</span>
        </div>
        <div class="battle-stats-total">
          <span>总输出 <b>${formatNumber(totalDamage)}</b></span>
          <span>总治疗 <b>${formatNumber(totalHealing)}</b></span>
        </div>
      </div>
      <div class="battle-stats-grid">
        ${stats.map(battleStatCardHtml).join("")}
      </div>
    </section>
  `;
}

function collectBattleStats(battle) {
  const unitStats = [...(battle?.player || []), ...(battle?.enemy || [])].map((unit) => ({
    id: unit.id,
    heroId: unit.heroId,
    name: unit.name,
    side: unit.side,
    position: unit.position,
    portrait: unit.portrait || portraitForHero(unit),
    rarity: unit.rarity,
    troops: Math.max(0, Number(unit.troops) || 0),
    wounded: Math.max(0, Number(unit.wounded) || 0),
    maxTroops: Math.max(0, Number(unit.maxTroops) || 0),
    loss: Math.max(0, (Number(unit.maxTroops) || 0) - (Number(unit.troops) || 0)),
    damage: 0,
    attackDamage: 0,
    skillDamage: 0,
    skillCasts: 0,
    healing: 0,
    skills: new Map(),
  }));
  const statsById = new Map(unitStats.map((unit) => [unit.id, unit]));
  const statsBySideAndName = new Map(unitStats.map((unit) => [`${unit.side}:${unit.name}`, unit]));

  (battle?.log || []).forEach((entry) => {
    const amount = Math.max(0, Number(entry.amount) || 0);
    if (!amount || !["hit", "heal"].includes(entry.type)) return;
    const actor = reportEntryActor(entry);
    const unit = actor?.id ? statsById.get(actor.id) : statsBySideAndName.get(`${actor?.side || ""}:${entry.actor || ""}`);
    const target = reportEntryTarget(entry);
    const targetUnit = target?.id ? statsById.get(target.id) : statsBySideAndName.get(`${target?.side || ""}:${entry.target || ""}`);
    if (entry.type === "hit" && targetUnit) targetUnit.received = (targetUnit.received || 0) + amount;
    if (!unit) return;

    const skillName = entry.skill || (entry.type === "heal" ? "治疗" : "未标注来源");
    const skill = unit.skills.get(skillName) || { name: skillName, count: 0, damage: 0, healing: 0 };
    skill.count += 1;
    if (entry.type === "heal") {
      unit.healing += amount;
      skill.healing += amount;
    } else {
      const isNormalAttack = skillName === "普通攻击";
      unit.damage += amount;
      if (isNormalAttack) {
        unit.attackDamage += amount;
      } else {
        unit.skillDamage += amount;
        unit.skillCasts += 1;
      }
      skill.damage += amount;
    }
    unit.skills.set(skillName, skill);
  });

  return unitStats;
}

function reportEntryActor(entry) {
  const participants = entry.participants || [];
  return participants.find((participant) => participant.role === "actor")
    || participants.find((participant) => participant.name === entry.actor)
    || null;
}

function reportEntryTarget(entry) {
  const participants = entry.participants || [];
  return participants.find((participant) => participant.role === "target")
    || participants.find((participant) => participant.name === entry.target)
    || null;
}

function battleStatCardHtml(unit) {
  const side = unit.side === "player" ? "我方" : "敌方";
  const skills = [...unit.skills.values()]
    .filter((skill) => skill.damage || skill.healing)
    .sort((a, b) => (b.damage + b.healing) - (a.damage + a.healing) || a.name.localeCompare(b.name, "zh-Hans-CN"));
  return `
    <article class="battle-stat-card battle-stat-${unit.side}">
      <div class="battle-stat-title">
        <span>${escapeHtml(side)} · ${escapeHtml(positionLabel(unit.position))}</span>
        <strong>${escapeHtml(unit.name)}</strong>
      </div>
      <div class="battle-stat-values">
        <span><small>总输出</small><b class="damage">${formatNumber(unit.damage)}</b></span>
        <span><small>总治疗</small><b class="heal">${formatNumber(unit.healing)}</b></span>
      </div>
      <div class="battle-skill-totals">
        ${skills.length ? skills.map(battleSkillStatHtml).join("") : '<span class="battle-stat-empty">本场暂无输出/治疗</span>'}
      </div>
    </article>
  `;
}

function battleSkillStatHtml(skill) {
  return `
    <span class="battle-skill-total">
      <b>【${escapeHtml(skill.name)}】</b>
      ${skill.damage ? `<em class="damage">伤 ${formatNumber(skill.damage)}</em>` : ""}
      ${skill.healing ? `<em class="heal">疗 ${formatNumber(skill.healing)}</em>` : ""}
    </span>
  `;
}

function positionLabel(position) {
  return POSITIONS.find((item) => item.id === position)?.label || "位置";
}

function writeEmptyReport() {
  ensureReportRenderTarget().innerHTML = `
    <div class="report-detail-title">
      <span>战报详情</span>
      <b>未开战</b>
    </div>
    <div class="empty-report">暂无战斗记录。开战后这里会按回合记录伤害、治疗和控制。</div>
  `;
}

function writeSystemMessage(text, type = "system") {
  state.systemMessages = [
    ...(state.systemMessages || []),
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      text,
      createdAt: Date.now(),
    },
  ].slice(-SYSTEM_MESSAGE_LIMIT);
}

function renderSystemMessages() {
  const messages = [...(state.systemMessages || [])].reverse();
  if (!messages.length) {
    els.systemMessages.innerHTML = `<div class="empty-report">暂无系统消息。</div>`;
    return;
  }
  els.systemMessages.innerHTML = messages.map(systemMessageHtml).join("");
}

function systemMessageHtml(message) {
  const time = new Date(message.createdAt || Date.now()).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `
    <article class="system-message ${message.type || "system"}">
      <span>${escapeHtml(time)}</span>
      <p>${decorateSystemMessageText(message.text)}</p>
    </article>
  `;
}

function decorateSystemMessageText(text) {
  return escapeHtml(text).replace(/【([^】]+)】/g, '<b class="report-skill">【$1】</b>');
}

function reportLineHtml(entry) {
  if (entry.type === "round") {
    return `<div class="log-line round"><span>${escapeHtml(entry.text)}</span><em>行动阶段</em></div>`;
  }
  const details = entry.details?.length
    ? `<div class="report-modifiers">${entry.details.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`
    : "";
  return `
    <div class="log-line ${entry.type}">
      ${reportAvatarHtml(entry)}
      <span class="report-text">${decorateReportText(entry)}${reportTroopAfterHtml(entry)}${details}</span>
    </div>
  `;
}

function reportTroopAfterHtml(entry) {
  if (entry.type === "hit" && entry.targetState) {
    return `<em class="report-troop-after">（余兵${formatNumber(entry.targetState.troops)}）</em>`;
  }
  if (entry.type === "heal" && entry.targetState) {
    return `<em class="report-troop-after heal">（兵力${formatNumber(entry.targetState.troops)}）</em>`;
  }
  return "";
}

function reportAvatarHtml(entry) {
  const participant = reportAvatarParticipant(entry);
  const side = participant?.side === "player" ? "player" : participant?.side === "enemy" ? "enemy" : "";
  const portrait = reportParticipantPortrait(participant);
  const classes = [
    "report-avatar",
    side ? `report-avatar-${side}` : "",
    portrait ? "report-avatar-portrait" : "",
  ].filter(Boolean).join(" ");
  const label = participant?.name || reportGlyph(entry);
  const content = portrait
    ? `<img src="${escapeHtml(portrait)}" alt="${escapeHtml(label)}画像" loading="lazy">`
    : escapeHtml(reportGlyph(entry));
  return `<span class="${classes}" title="${escapeHtml(label)}">${content}</span>`;
}

function reportAvatarParticipant(entry) {
  const participants = entry.participants || [];
  if (!participants.length) return null;
  return participants.find((participant) => participant.role === "actor")
    || participants.find((participant) => participant.name === entry.actor)
    || participants.find((participant) => participant.role === "target")
    || participants[0];
}

function reportGlyph(entry) {
  if (entry.actor) return entry.actor.slice(0, 1);
  return {
    hit: "伤",
    heal: "疗",
    control: "控",
    result: "终",
    system: "令",
  }[entry.type] || "记";
}

function decorateReportText(entry) {
  let text = decorateReportUnitNames(entry.text, entry.participants || []);
  text = text.replace(/【([^】]+)】/g, '<b class="report-skill">【$1】</b>');
  if (entry.type === "heal") {
    text = text.replace(/(恢复)(\d[\d,]*)兵/g, '$1<strong class="report-number heal">$2</strong>兵');
  } else {
    text = text.replace(/(造成|损失)(\d[\d,]*)兵/g, '$1<strong class="report-number damage">$2</strong>兵');
  }
  return text;
}

function decorateReportUnitNames(text, participants) {
  const raw = String(text || "");
  const namedParticipants = participants
    .filter((participant) => participant?.name && participant.side)
    .sort((a, b) => b.name.length - a.name.length);
  if (!namedParticipants.length) return escapeHtml(raw);

  const participantsByName = namedParticipants.reduce((groups, participant) => {
    groups[participant.name] ||= [];
    groups[participant.name].push(participant);
    return groups;
  }, {});
  const names = Object.keys(participantsByName).sort((a, b) => b.length - a.length);
  const usedCount = {};
  let html = "";
  let index = 0;

  while (index < raw.length) {
    const name = names.find((candidate) => raw.startsWith(candidate, index));
    if (!name) {
      html += escapeHtml(raw[index]);
      index += 1;
      continue;
    }
    const group = participantsByName[name];
    const occurrence = usedCount[name] || 0;
    usedCount[name] = occurrence + 1;
    const participant = group[Math.min(occurrence, group.length - 1)];
    html += reportUnitNameHtml(name, participant);
    index += name.length;
  }
  return html;
}

function reportUnitNameHtml(name, participant) {
  const side = participant.side === "player" ? "player" : "enemy";
  const label = side === "player" ? "我方" : "敌方";
  return `<span class="report-unit report-unit-${side}" title="${label}${escapeHtml(name)}">${escapeHtml(name)}</span>`;
}

init();
