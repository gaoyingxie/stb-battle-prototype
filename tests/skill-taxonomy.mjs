globalThis.window = globalThis;

await import("../src/skill-taxonomy.js");

const { profileFor, enrichSkill, requiredSkillNames } = globalThis.STZB_SKILL_TAXONOMY;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const healBlock = profileFor({
  name: "天妒英才XP",
  type: "主动",
  probability: "45%",
  desc: "对敌军群体发动策略攻击，并使其禁疗，不可回复兵力",
});
assert(healBlock.profile.strategy && !healBlock.profile.attack, "策略攻击不应被误判为兵刃攻击");
assert(healBlock.profile.deny && healBlock.tags.includes("禁疗"), "禁疗战法应生成禁疗画像和标签");
assert(healBlock.targetCount === 2, "敌军群体应按 2 个目标估算");

const tempoCombo = profileFor({
  name: "先驱突击",
  type: "指挥",
  desc: "战斗开始后前3回合，使自身优先行动，攻击属性提高并进入连击状态",
});
assert(tempoCombo.trigger === "command" && tempoCombo.reliability === 1, "指挥战法应按稳定触发处理");
assert(tempoCombo.profile.tempo && tempoCombo.profile.combo, "先手连击战法应生成 tempo/combo 画像");

const tauntPassive = profileFor({
  name: "天下无双",
  type: "被动",
  desc: "自身攻击距离提高，获得洞察、反击，并挑衅敌军",
});
assert(tauntPassive.profile.taunt && tauntPassive.profile.defense && tauntPassive.profile.range, "挑衅被动应识别挑衅、防御和射程");

const cleanseHeal = profileFor({
  name: "安抚军心",
  type: "主动",
  desc: "净化我军群体有害效果，并恢复一定兵力",
});
assert(cleanseHeal.profile.cleanse && cleanseHeal.profile.sustain && cleanseHeal.profile.area, "净化治疗应识别净化、治疗和群体");

const strategySplash = profileFor({
  name: "其徐如林",
  type: "指挥",
  desc: "我军全体造成策略伤害后，对目标相邻的敌军额外造成一次策略伤害",
});
assert(strategySplash.profile.splash && strategySplash.profile.strategy, "策略溅射应生成 splash 和 strategy 画像");

const statDebuff = profileFor({
  name: "全属性压制",
  type: "指挥",
  desc: "使敌军群体攻击属性、谋略属性、速度属性降低",
});
assert(statDebuff.profile.debuff && statDebuff.tags.includes("减益"), "属性降低应生成减益画像");

const preparedStrike = profileFor({
  name: "一骑当千",
  type: "主动",
  desc: "1回合准备，对敌军全体发动攻击伤害",
});
assert(preparedStrike.mechanics.prepareRounds === 1, "准备回合应被结构化提取");
assert(preparedStrike.targetCount === 3 && preparedStrike.profile.attack, "全体兵刃准备战法应识别目标数和兵刃");

const conditional = {
  name: "惊雷破阵",
  type: "被动",
  desc: "我军全体发动【落雷】【迷阵】时，额外发动一次策略攻击",
};
assert(requiredSkillNames(conditional).join(",") === "落雷,迷阵", "条件前置战法名应被提取");
assert(profileFor(conditional).tags.includes("条件联动"), "条件联动应生成标签");

const original = { name: "样例", type: "自带", tags: ["自带"], isInnate: true, desc: "造成攻击伤害" };
const enriched = enrichSkill({ ...original, tags: [...original.tags] });
assert(enriched.tags.includes("自带") && enriched.aiProfile.attack, "enrichSkill 应保留自带标签并写入画像");
assert(original.aiProfile === undefined, "profile/enrich 测试不应意外修改原对象");

console.log(JSON.stringify({
  healBlockTags: healBlock.tags,
  conditional: requiredSkillNames(conditional),
  preparedStrike: preparedStrike.mechanics.prepareRounds,
}, null, 2));
