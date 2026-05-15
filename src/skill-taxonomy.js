// Shared skill taxonomy helpers for AI scoring, UI metadata, and future offline
// recommendation benchmarks. This file derives runtime-only metadata and does
// not modify generated official-data.js.
(function registerSkillTaxonomy(global) {
  const PROFILE_KEYS = [
    "attack",
    "strategy",
    "control",
    "defense",
    "support",
    "sustain",
    "range",
    "area",
    "amplify",
    "tempo",
    "deny",
    "debuff",
    "cleanse",
    "combo",
    "taunt",
    "splash",
    "damage",
  ];

  const TAG_LABELS = {
    attack: "兵刃",
    strategy: "策略",
    control: "控制",
    defense: "防御",
    support: "辅助",
    sustain: "治疗",
    range: "射程",
    area: "群体",
    amplify: "增伤",
    tempo: "先手",
    deny: "禁疗",
    debuff: "减益",
    cleanse: "净化",
    combo: "连击",
    taunt: "挑衅",
    splash: "策略溅射",
  };

  function profileFor(skill = {}) {
    const text = skillText(skill);
    const trigger = normalizedTrigger(skill);
    const chance = Number(skill.chance) || chanceFromText(skill.probability) || 0;
    const prepareRounds = prepareRoundsFromText(text);
    const requiredSkillNames = requiredSkillNamesFromText(text);
    const profile = normalizeProfile({
      ...deriveProfile(text),
      ...(skill.aiProfile || {}),
    });
    profile.damage = Boolean(profile.damage || profile.attack || profile.strategy || profile.splash);
    const targetCount = estimatedTargetCount(text, profile);
    const damageRate = estimatedDamageRate(text, profile);
    const reliability = triggerReliability({ trigger, chance, prepareRounds, text });
    const mechanics = {
      trigger,
      chance,
      prepareRounds,
      targetCount,
      damageRate,
      requiredSkillNames,
      conditional: requiredSkillNames.length > 0,
      alwaysOn: trigger === "command" || trigger === "passive",
      pursuit: trigger === "pursuit",
      active: trigger === "active",
      negative: Boolean(profile.control || profile.deny || profile.debuff),
      positive: Boolean(profile.support || profile.defense || profile.sustain || profile.cleanse || profile.amplify),
    };
    const tags = buildTags(skill, profile, mechanics);

    return {
      profile,
      tags,
      mechanics,
      targetCount,
      damageRate,
      requiredSkillNames,
      trigger,
      reliability,
    };
  }

  function enrichSkill(skill) {
    if (!skill || typeof skill !== "object") return skill;
    const taxonomy = profileFor(skill);
    skill.aiProfile = { ...taxonomy.profile };
    skill.aiTaxonomy = {
      tags: [...taxonomy.tags],
      mechanics: {
        ...taxonomy.mechanics,
        requiredSkillNames: [...taxonomy.requiredSkillNames],
      },
      targetCount: taxonomy.targetCount,
      damageRate: taxonomy.damageRate,
      requiredSkillNames: [...taxonomy.requiredSkillNames],
      trigger: taxonomy.trigger,
      reliability: taxonomy.reliability,
    };
    skill.tags = unique([
      ...(Array.isArray(skill.tags) ? skill.tags : []),
      ...taxonomy.tags,
    ]);
    return skill;
  }

  function requiredSkillNames(skill = {}) {
    if (Array.isArray(skill.aiTaxonomy?.requiredSkillNames)) return [...skill.aiTaxonomy.requiredSkillNames];
    return requiredSkillNamesFromText(skillText(skill));
  }

  function deriveProfile(text) {
    const combo = /连击|再次普通攻击|普通攻击.*再次|combo/i.test(text);
    const taunt = /挑衅|taunt/i.test(text);
    const deny = /禁疗|不可回复|无法回复|无法恢复|不能恢复|heal.?block|anti.?heal/i.test(text);
    const debuff = /属性降低|降低.{0,8}(?:攻击|防御|谋略|速度|属性)|(?:攻击|防御|谋略|速度|属性).{0,8}降低|削弱|受到.*伤害.*提高|伤害.*提高.*受到|易伤|vulnerable|debuff/i.test(text);
    const cleanse = /净化|镇静|看破|清除.{0,6}有害|移除.{0,6}有害|解除.{0,6}有害|cleanse|purify|dispel/i.test(text);
    const tempo = combo || /先手|优先行动|发动率提高|再次发动|跳过.*准备|准备.{0,4}(?:减少|缩短)|无需准备|tempo|initiative/i.test(text);
    const splash = /策略溅射|溅射|相邻|额外造成一次策略伤害|splash/i.test(text);
    const attack = /兵刃|追击|分兵|连击|反击|普通攻击|攻击伤害|发动(?![^，。；,.;]*策略)[^，。；,.;]*攻击|attack damage|physical|strike|assault|counter/i.test(text);

    return {
      attack,
      strategy: /策略|谋略|火攻|妖术|恐慌|燃烧|灼烧|strategy|tactic|spell|burn/i.test(text),
      control: /犹豫|怯战|混乱|暴走|动摇|封锁|控制|挑衅|disarm|silence|confusion|control|seal|taunt/i.test(text),
      defense: /规避|减伤|防御|援护|免疫|洞察|镇静|看破|净化|清除.{0,6}有害|移除.{0,6}有害|guard|evade|defense|mitigation|protect/i.test(text),
      support: /提高|提升|增益|攻击属性|谋略属性|速度属性|先手|净化|镇静|看破|buff|boost|support|cleanse/i.test(text),
      sustain: /恢复|治疗|休整|急救|援军|heal|recover|sustain/i.test(text),
      range: /距离|射程|远攻|战法有效距离|攻击距离|range|distance/i.test(text),
      area: /群体|全体|敌军.{0,3}体|我军.{0,3}体|multi|group|all/i.test(text),
      amplify: /伤害提高|造成.*提高|受到.*伤害.*提高|易伤|增伤|amplify|vulnerable|damage up/i.test(text),
      tempo,
      deny,
      debuff,
      cleanse,
      combo,
      taunt,
      splash,
    };
  }

  function normalizeProfile(profile) {
    return PROFILE_KEYS.reduce((normalized, key) => {
      normalized[key] = Boolean(profile[key]);
      return normalized;
    }, {});
  }

  function buildTags(skill, profile, mechanics) {
    const tags = [];
    if (skill.isInnate || (Array.isArray(skill.tags) && skill.tags.includes("自带"))) tags.push("自带");
    Object.entries(TAG_LABELS).forEach(([key, label]) => {
      if (profile[key]) tags.push(label);
    });
    if (mechanics.prepareRounds > 0) tags.push("准备");
    if (mechanics.conditional) tags.push("条件联动");
    return unique(tags);
  }

  function skillText(skill) {
    return `${skill?.name || ""} ${skill?.type || ""} ${skill?.effect || ""} ${skill?.desc || ""} ${skill?.target || ""}`;
  }

  function normalizedTrigger(skill) {
    const trigger = String(skill.trigger || "").toLowerCase();
    const type = String(skill.type || "");
    if (trigger && trigger !== "official") return trigger;
    if (/指挥|command/i.test(type)) return "command";
    if (/被动|passive/i.test(type)) return "passive";
    if (/追击|pursuit/i.test(type)) return "pursuit";
    if (/主动|active/i.test(type)) return "active";
    return trigger || "unknown";
  }

  function triggerReliability({ trigger, chance, prepareRounds, text }) {
    if (trigger === "command" || trigger === "passive") return 1;
    if (trigger === "pursuit") return Math.max(0.18, chance || 0.4) * 0.88;
    if (trigger === "active") {
      const preparePenalty = prepareRounds > 0 || /准备/.test(text) ? 0.74 : 1;
      return Math.max(0.16, chance || 0.35) * preparePenalty;
    }
    return Math.max(0.12, chance || 0.28);
  }

  function estimatedTargetCount(text, profile) {
    const explicit = text.match(/(?:敌军|我军|友军|目标|targets?)\D{0,10}([123一二三])(?:个|名|体|人|目标)?/i)?.[1];
    if (explicit) return numberFromToken(explicit);
    if (/全体|全军|all/i.test(text)) return 3;
    if (profile.area || /群体|multi|group/i.test(text)) return 2;
    return 1;
  }

  function estimatedDamageRate(text, profile) {
    const percentValues = text.match(/\d+(?:\.\d+)?%/g)
      ?.map((part) => Number(part.replace("%", "")))
      .filter((value) => Number.isFinite(value) && value >= 40 && value <= 300) || [];
    if (percentValues.length) return Math.max(...percentValues) / 100;
    if (profile.area && /强力|猛烈|power|heavy/i.test(text)) return 1.08;
    if (/强力|猛烈|power|heavy/i.test(text)) return 1.18;
    if (profile.area) return 0.9;
    if (profile.damage) return 0.82;
    return 0;
  }

  function prepareRoundsFromText(text = "") {
    const normalized = String(text || "");
    const direct = normalized.match(/(?:需|经过)?([一二三123])回合准备|准备([一二三123])回合/);
    if (!direct) return 0;
    return numberFromToken(direct[1] || direct[2]);
  }

  function requiredSkillNamesFromText(text) {
    const names = [];
    const collect = (segment) => {
      const matched = segment.match(/【([^】]+)】/g) || [];
      matched.forEach((item) => {
        const name = item.slice(1, -1).trim();
        if (name) names.push(name);
      });
    };
    for (const match of String(text || "").matchAll(/发动((?:【[^】]+】)+)(?:时|后)/g)) {
      collect(match[1]);
    }
    for (const match of String(text || "").matchAll(/((?:【[^】]+】)+)发动(?:率|后|时)/g)) {
      collect(match[1]);
    }
    return unique(names);
  }

  function chanceFromText(text) {
    const numbers = String(text || "").match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
    if (!numbers.length) return 0;
    return Math.max(...numbers) / 100;
  }

  function numberFromToken(value) {
    if (value === "一") return 1;
    if (value === "二") return 2;
    if (value === "三") return 3;
    return Math.max(1, Math.min(3, Number(value) || 1));
  }

  function unique(items) {
    return [...new Set(items.filter(Boolean))];
  }

  global.STZB_SKILL_TAXONOMY = Object.freeze({
    profileFor,
    enrichSkill,
    requiredSkillNames,
  });
})(globalThis);
