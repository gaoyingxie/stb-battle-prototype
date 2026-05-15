globalThis.window = globalThis;

await import("../official-data.js");
await import("../src/skill-taxonomy.js");

const official = globalThis.STZB_OFFICIAL_DATA;
const skills = official?.skills || [];
const heroes = official?.heroes || [];
const taxonomy = globalThis.STZB_SKILL_TAXONOMY;

const caoWeiwu = skills.find((skill) =>
  String(skill.officialId) === "200023"
  || skill.id === "official-skill-200023"
  || skill.name === "魏武之世"
);

if (!caoWeiwu) {
  throw new Error("缺少曹操自带战法魏武之世");
}

if (caoWeiwu.type !== "指挥") {
  throw new Error(`魏武之世的战法类型应为指挥，实际为 ${caoWeiwu.type}`);
}

if (!caoWeiwu.isInnate || !Array.isArray(caoWeiwu.tags) || !caoWeiwu.tags.includes("自带")) {
  throw new Error("魏武之世应保留自带标签，但不能把自带写进战法类型");
}

const innateIds = new Set(heroes.map((hero) => hero.innate).filter(Boolean));
const typedAsInnate = skills.filter((skill) => innateIds.has(skill.id) && skill.type === "自带");

if (typedAsInnate.length) {
  throw new Error(`仍有 ${typedAsInnate.length} 个自带战法把“自带”写进了战法类型`);
}

const saSkills = skills.filter((skill) => ["S", "A"].includes(String(skill.grade || "")));
const missingTaxonomy = saSkills.filter((skill) => {
  const profile = taxonomy.profileFor(skill);
  return !profile
    || !profile.mechanics
    || !profile.profile
    || !Array.isArray(profile.tags)
    || !profile.tags.length
    || !Number.isFinite(Number(profile.targetCount))
    || !Number.isFinite(Number(profile.damageRate))
    || !Array.isArray(profile.requiredSkillNames);
});

if (missingTaxonomy.length) {
  throw new Error(`有 ${missingTaxonomy.length} 个 S/A 战法没有生成完整 AI 画像：${missingTaxonomy.slice(0, 5).map((skill) => skill.name).join("、")}`);
}

const caoWeiwuTagsBefore = [...caoWeiwu.tags];
taxonomy.profileFor(caoWeiwu);
if (caoWeiwu.tags.join("|") !== caoWeiwuTagsBefore.join("|")) {
  throw new Error("profileFor 不应修改官方战法对象");
}

const enrichedCaoWeiwu = taxonomy.enrichSkill({ ...caoWeiwu, tags: [...caoWeiwu.tags] });
if (!enrichedCaoWeiwu.tags.includes("自带") || !enrichedCaoWeiwu.aiProfile || !enrichedCaoWeiwu.aiTaxonomy) {
  throw new Error("enrichSkill 应保留自带标签并写入 AI 画像");
}

console.log(JSON.stringify({
  heroes: heroes.length,
  skills: skills.length,
  innateSkills: innateIds.size,
  saSkillTaxonomy: saSkills.length,
  caoWeiwuType: caoWeiwu.type,
  caoWeiwuTags: caoWeiwu.tags,
}, null, 2));
