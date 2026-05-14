globalThis.window = globalThis;

await import("../src/team-ai.js");

const {
  chooseLineup,
  recommendTeam,
  scoreHeroForPosition,
  scoreSkillForHero,
} = globalThis.STZB_TEAM_AI;

const positions = [{ id: "camp" }, { id: "middle" }, { id: "front" }];
const fixedRng = () => 0.5;

function hero(id, overrides = {}) {
  return {
    id,
    name: id,
    faction: "测",
    arm: "骑",
    rarity: 5,
    innate: `${id}-innate`,
    cost: 3,
    distance: 3,
    stats: { attack: 80, strategy: 80, defense: 80, speed: 80 },
    ...overrides,
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const lowCostCarry = hero("low-cost-carry", {
  cost: 2,
  distance: 4,
  stats: { attack: 105, strategy: 91, defense: 84, speed: 88 },
});
const highCostBench = hero("high-cost-bench", {
  cost: 5.5,
  distance: 4,
  stats: { attack: 68, strategy: 64, defense: 70, speed: 52 },
});

assert(
  scoreHeroForPosition(lowCostCarry, { id: "camp" }) > scoreHeroForPosition(highCostBench, { id: "camp" }),
  "AI 不应把高 cost 弱将判得比低 cost 强将更强",
);

const lineup = chooseLineup([
  hero("duplicate-a", {
    name: "卢植",
    faction: "汉",
    arm: "骑",
    distance: 4,
    stats: { attack: 108, strategy: 123, defense: 132, speed: 89 },
  }),
  hero("duplicate-b", {
    name: "卢植",
    faction: "汉",
    arm: "骑",
    distance: 1,
    stats: { attack: 108, strategy: 123, defense: 132, speed: 89 },
  }),
  hero("backline", {
    name: "后排",
    distance: 5,
    stats: { attack: 98, strategy: 112, defense: 72, speed: 76 },
  }),
  hero("middle", {
    name: "中军",
    distance: 3,
    stats: { attack: 92, strategy: 94, defense: 88, speed: 86 },
  }),
  hero("frontline", {
    name: "前锋",
    distance: 1,
    stats: { attack: 78, strategy: 65, defense: 118, speed: 93 },
  }),
], positions, fixedRng);
const identityKeys = lineup.map((item) => `${item.name}|${item.faction}|${item.arm}`);
assert(new Set(identityKeys).size === identityKeys.length, "AI 不应把同名同阵营同兵种的重复卡同时上阵");
assert(lineup[2].id === "frontline", "前锋应优先选择高防御高速度的承伤位");

const attackSkill = {
  id: "attack-skill",
  name: "强攻",
  type: "主动",
  trigger: "active",
  chance: 0.45,
  grade: "S",
  distance: 4,
  soldierType: "骑",
  desc: "对敌军群体发动一次攻击伤害",
};
const wrongArmSkill = {
  ...attackSkill,
  id: "wrong-arm",
  soldierType: "弓",
};
assert(
  scoreSkillForHero(attackSkill, lowCostCarry, { id: "camp" }) > scoreSkillForHero(wrongArmSkill, lowCostCarry, { id: "camp" }),
  "战法评分应惩罚兵种不适配",
);

const pureAttacker = hero("pure-attacker", {
  distance: 4,
  stats: { attack: 124, strategy: 55, defense: 80, speed: 84 },
});
const strategist = hero("strategist", {
  distance: 3,
  stats: { attack: 58, strategy: 122, defense: 82, speed: 76 },
});
const physicalBurst = {
  id: "physical-burst",
  name: "Physical Burst",
  type: "active",
  trigger: "active",
  chance: 0.45,
  grade: "S",
  distance: 4,
  soldierType: "骑",
  desc: "heavy attack damage to enemy group",
};
const groupHeal = {
  id: "group-heal",
  name: "Group Heal",
  type: "active",
  trigger: "active",
  chance: 0.42,
  grade: "A",
  distance: 3,
  desc: "heal recover two allies",
};

assert(
  scoreSkillForHero(physicalBurst, pureAttacker, { id: "camp" }) > scoreSkillForHero(physicalBurst, strategist, { id: "camp" }),
  "攻击型战法应更偏好高攻击武将",
);
assert(
  scoreSkillForHero(groupHeal, strategist, { id: "middle" }) > scoreSkillForHero(groupHeal, pureAttacker, { id: "middle" }),
  "治疗型战法应更偏好高谋略武将",
);

const carry = hero("carry", {
  innate: "carry-innate",
  distance: 5,
  stats: { attack: 126, strategy: 62, defense: 72, speed: 88 },
});
const support = hero("support", {
  innate: "team-boost",
  distance: 3,
  stats: { attack: 70, strategy: 104, defense: 82, speed: 84 },
});
const rawFlex = hero("raw-flex", {
  innate: "raw-flex-innate",
  distance: 3,
  stats: { attack: 92, strategy: 88, defense: 88, speed: 82 },
});
const tank = hero("tank-synergy", {
  innate: "tank-innate",
  distance: 1,
  stats: { attack: 70, strategy: 62, defense: 124, speed: 78 },
});
const synergyTeam = recommendTeam({
  heroes: [carry, support, rawFlex, tank],
  skills: [
    { id: "carry-innate", isInnate: true, type: "active", chance: 0.45, desc: "attack damage group" },
    { id: "team-boost", isInnate: true, type: "command", desc: "damage up buff support all allies" },
    { id: "raw-flex-innate", isInnate: true, type: "active", chance: 0.35, desc: "attack damage" },
    { id: "tank-innate", isInnate: true, type: "passive", desc: "guard defense mitigation" },
  ],
  positions,
  minHeroRarity: 0,
  skillGrades: null,
  rng: fixedRng,
});
assert(
  synergyTeam.some((slot) => slot.heroId === "support") && !synergyTeam.some((slot) => slot.heroId === "raw-flex"),
  "阵容评分应能为了输出核心选择增伤辅助，而不是只选单体面板更高的泛用武将",
);

const team = recommendTeam({
  heroes: [highCostBench, lowCostCarry, hero("tank", {
    distance: 1,
    stats: { attack: 74, strategy: 70, defense: 116, speed: 92 },
  })],
  skills: [attackSkill, wrongArmSkill],
  positions,
  minHeroRarity: 0,
  skillGrades: null,
  rng: fixedRng,
});
assert(team.some((slot) => slot.heroId === lowCostCarry.id), "自动推荐应保留低 cost 强将");

const deadComboTeam = recommendTeam({
  heroes: [strategist],
  skills: [
    {
      id: "dead-combo",
      name: "Combo Booster",
      type: "passive",
      trigger: "passive",
      grade: "A",
      desc: "我军全体发动【落雷】【迷阵】时，额外发动一次策略攻击",
    },
    {
      id: "plain-strategy",
      name: "Plain Strategy",
      type: "active",
      trigger: "active",
      chance: 0.42,
      grade: "A",
      distance: 4,
      desc: "strategy damage to enemy group",
    },
  ],
  positions,
  minHeroRarity: 0,
  skillGrades: null,
  skillsPerHero: 1,
  rng: fixedRng,
});
assert(
  deadComboTeam[0]?.skills?.[0] === "plain-strategy",
  "没有前置战法时，条件联动战法不应挤掉可直接生效的战法",
);

console.log(JSON.stringify({
  lowCostCarryCampScore: scoreHeroForPosition(lowCostCarry, { id: "camp" }),
  highCostBenchCampScore: scoreHeroForPosition(highCostBench, { id: "camp" }),
  lineup: lineup.map((item) => item.id),
  recommended: team.map((slot) => slot.heroId),
}, null, 2));
