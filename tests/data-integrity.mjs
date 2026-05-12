globalThis.window = globalThis;

await import("../official-data.js");

const official = globalThis.STZB_OFFICIAL_DATA;
const skills = official?.skills || [];
const heroes = official?.heroes || [];

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

console.log(JSON.stringify({
  heroes: heroes.length,
  skills: skills.length,
  innateSkills: innateIds.size,
  caoWeiwuType: caoWeiwu.type,
  caoWeiwuTags: caoWeiwu.tags,
}, null, 2));
