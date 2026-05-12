const {
  POSITIONS,
} = globalThis.STZB_BATTLE_RULES;

const {
  HEROES,
  SKILLS,
  OFFICIAL_SKILL_ALIASES,
} = globalThis.STZB_SEED_DATA;

mergeOfficialData();

const EQUIPPABLE_SKILLS = SKILLS;
const STARTER_SKILL_GRADES = new Set(["B", "C"]);
const LEGACY_FREE_SKILL_IDS = new Set([
  "grand-reward",
  "avoid-edge",
  "one-rider",
  "counter-plan",
  "golden-lock",
]);
const STARTER_SKILL_MIGRATION = "starter-bc-only";
const state = {
  roster: {},
  skills: {},
  migrations: {},
  fodder: 0,
  formation: starterFormation(),
  enemy: [],
  lastBattle: null,
  activeBattle: null,
};

globalThis.STZB_DEBUG = { state };

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
  skillCodex: document.querySelector("#skillCodex"),
  skillCodexCount: document.querySelector("#skillCodexCount"),
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
  const localSkillByName = new Map(SKILLS.map((skill) => [skill.name, skill]));
  official.skills.forEach((skill) => {
    const officialFields = officialSkillFields(skill);
    const localSkill = localSkillByName.get(skill.name) || aliasLocalSkill(skill.name, localSkillByName);
    if (localSkill) {
      Object.assign(localSkill, {
        ...officialFields,
        id: localSkill.id,
        trigger: localSkill.trigger,
        chance: chanceFromProbability(officialFields.probability, localSkill.chance),
        apply: localSkill.apply,
        use: localSkill.use,
      });
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
      applyOfficialHeroFields(localSeed, hero);
      heroKeys.add(key);
      return;
    }
    if (heroKeys.has(key)) return;
    HEROES.push(officialHeroToLocal(hero));
    heroKeys.add(key);
  });
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

function applyOfficialHeroFields(target, hero) {
  Object.assign(target, {
    ...officialHeroToLocal(hero),
    id: target.id,
  });
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
  };
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
      if (/洞察/.test(desc)) allies.forEach((ally) => addStatus(ally, "insight", durationFromText(desc, 8), 1));
      if (/援护/.test(desc)) allies.forEach((ally) => addStatus(ally, "guard", durationFromText(desc, 2), 1));
      if (/分兵/.test(desc)) allies.forEach((ally) => addStatus(ally, "split", durationFromText(desc, 1), damageRateFromText(desc, 0.35)));
      log(ctx, "system", `${unit.name}发动【${skill.name}】：${summarizeDesc(desc)}`);
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
    const distance = Number(skill.distance) || skillDistanceFromText(targetText);
    const hostile = /敌军|敌方|攻击目标/.test(targetText);
    const healing = /恢复|休整|急救/.test(desc);
    const damaging = /伤害|攻击|恐慌|妖术|燃烧|灼烧|火攻/.test(desc);
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

function dismantleHero(heroId) {
  const hero = heroById(heroId);
  const skills = dismantleSkillsForHero(hero);
  if (!hero || !skills.length || (state.roster[hero.id] || 0) <= 0) return;
  state.roster[hero.id] -= 1;
  removeHeroFromFormation(hero.id);
  unlockDismantleSkills(hero);
  state.activeBattle = null;
  state.lastBattle = null;
  writeReport([{ type: "system", text: `拆解${hero.name}，获得战法【${skills.map((skill) => skill.name).join("】、【")}】。` }]);
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
  return [...new Set(ids)].map(skillById).filter(Boolean);
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
  migrateLegacyFreeSkills();
}

function migrateLegacyFreeSkills() {
  if (state.migrations?.[STARTER_SKILL_MIGRATION]) return;
  LEGACY_FREE_SKILL_IDS.forEach((id) => {
    const skill = skillById(id);
    if (!skill || isStarterUnlockedSkill(skill)) return;
    const count = Number(state.skills[id]) || 0;
    if (count <= 1) {
      delete state.skills[id];
      return;
    }
    state.skills[id] = count - 1;
  });
  state.formation?.forEach((slot, index) => {
    const legacyLocked = (slot.skills || []).some((skillId) => (
      LEGACY_FREE_SKILL_IDS.has(skillId)
      && !isSkillUnlocked(skillById(skillId))
    ));
    if (legacyLocked) slot.skills = suggestSkills(index);
  });
  state.migrations ||= {};
  state.migrations[STARTER_SKILL_MIGRATION] = true;
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
  state.migrations = {};
  state.fodder = 0;
  state.formation = starterFormation();
  state.enemy = [];
  state.lastBattle = null;
  state.activeBattle = null;
}

function starterFormation() {
  return [
    { heroId: "cao-cao", skills: ["empty-fort", "calm-army"] },
    { heroId: "guan-yu", skills: ["return-horse", "feint"] },
    { heroId: "liu-bei", skills: ["moon-snare", "cliff"] },
  ];
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem("heluozhanzhen") || "{}");
    Object.assign(state, saved);
    state.fodder = Number(state.fodder) || 0;
    state.skills ||= {};
    state.migrations ||= {};
  } catch {
    localStorage.removeItem("heluozhanzhen");
  }
}

function saveState() {
  localStorage.setItem("heluozhanzhen", JSON.stringify({
    roster: state.roster,
    skills: state.skills,
    migrations: state.migrations,
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
    ["empty-fort", "calm-army"],
    ["return-horse", "feint"],
    ["moon-snare", "cliff"],
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
  renderSkillCodex();
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
  const unlocked = EQUIPPABLE_SKILLS.filter((skill) => isSkillUnlocked(skill) && (!occupied.has(skill.id) || skill.id === selected));
  if (selected && !unlocked.some((skill) => skill.id === selected)) {
    const selectedSkill = skillById(selected);
    if (selectedSkill && isSkillUnlocked(selectedSkill)) unlocked.unshift(selectedSkill);
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
      if (!isSkillUnlocked(skillById(skillId))) return null;
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
    const portrait = portraitForHero(hero);
    return `
      <article class="hero-card" data-hero-id="${hero.id}" ${portrait ? `style="--hero-portrait: url('${portrait}')"` : ""}>
        ${avatarMarkup(hero, "avatar hero-avatar")}
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

function renderSkillCodex() {
  const skills = skillCodexList();
  els.skillCodexCount.textContent = skills.length;
  els.skillCodex.innerHTML = skills.map((skill) => {
    const meta = [
      skill.grade ? `${skill.grade}级` : "",
      skill.type || "",
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
  const typeOrder = { 指挥: 0, 主动: 1, 追击: 2, 被动: 3, 自带: 4 };
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
  els.roundCount.innerHTML = `<span>第 <b>${shownRound}</b> 封战报${result && !result.complete ? "（当前）" : ""}</span><small>共 1 封战报</small>`;
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
  const woundedPct = percentOf(unit.wounded, unit.maxTroops);
  const baseRange = baseAttackRange(unit);
  const attackRange = getAttackRange(unit);
  const rangeText = attackRange === baseRange ? `攻距 ${attackRange}` : `攻距 ${baseRange}→${attackRange}`;
  const troopText = `${formatNumber(Math.max(0, Math.round(unit.troops)))}/${formatNumber(unit.maxTroops)}`;
  const woundedText = unit.wounded ? `伤${formatNumber(unit.wounded)}` : `${troopPct}%`;
  const portrait = portraitForHero(unit);
  return `
    <article class="unit-card ${unit.side} ${unit.position} ${unit.troops <= 0 ? "fallen" : ""}" data-hero-id="${unit.heroId}" ${portrait ? `style="--unit-portrait: url('${portrait}')"` : ""}>
      <div class="unit-portrait" aria-hidden="true">
        <span class="unit-stars">${"★".repeat(unit.rarity)}</span>
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
        <div class="troop-bar" aria-label="${unit.name}兵力" style="--active-pct: ${troopPct}%; --wounded-pct: ${woundedPct}%">
          <div class="troop-fill"></div>
          <div class="wounded-fill"></div>
        </div>
        <div class="skill-list">
          ${unit.skills.map((skill) => `<button class="skill-chip" data-skill-id="${skill.id}" type="button">${skillNameWithGrade(skill)}</button>`).join("")}
        </div>
      </div>
    </article>
  `;
}

function troopSummaryTemplate(units) {
  const active = totalTroops(units);
  const wounded = totalWounded(units);
  const max = totalMaxTroops(units);
  const activePct = percentOf(active, max);
  const woundedPct = percentOf(wounded, max);
  return `
    <span class="troop-summary-text">
      ${formatNumber(active)}
      <small>/ ${formatNumber(max)}${wounded ? ` · 伤${formatNumber(wounded)}` : ""}</small>
    </span>
    <span class="team-troop-bar" aria-hidden="true" style="--active-pct: ${activePct}%; --wounded-pct: ${woundedPct}%">
      <i class="troop-fill"></i>
      <i class="wounded-fill"></i>
    </span>
  `;
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
  ctx.log.push({ type, text, ...meta });
}

function writeReport(entries) {
  const round = [...entries].reverse().find((entry) => entry.type === "round")?.text
    || "准备回合";
  els.report.innerHTML = `
    <div class="report-detail-title">
      <span>战报详情</span>
      <b>${escapeHtml(round)}</b>
    </div>
    ${entries.map(reportLineHtml).join("")}
  `;
  els.report.scrollTop = els.report.scrollHeight || 0;
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
      <span class="report-avatar">${escapeHtml(reportGlyph(entry))}</span>
      <span class="report-text">${decorateReportText(entry)}${details}</span>
    </div>
  `;
}

function reportGlyph(entry) {
  if (entry.actor) return entry.actor.slice(0, 1);
  return {
    hit: "伤",
    heal: "疗",
    control: "控",
    system: "令",
  }[entry.type] || "记";
}

function decorateReportText(entry) {
  let text = escapeHtml(entry.text);
  text = text.replace(/【([^】]+)】/g, '<b class="report-skill">【$1】</b>');
  if (entry.type === "heal") {
    text = text.replace(/(恢复)(\d[\d,]*)兵/g, '$1<strong class="report-number heal">$2</strong>兵');
  } else {
    text = text.replace(/(造成|损失)(\d[\d,]*)兵/g, '$1<strong class="report-number damage">$2</strong>兵');
  }
  return text;
}

init();
