import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT_FILE = path.join(ROOT, "official-data.js");
const HERO_EXTRA = "https://g0.gph.netease.com/ngsocial/community/stzb/cfg/hero_extra.json?gameid=g10";
const SKILL_LIST = "https://stzb.163.com/json/jineng_list.json";

const decodeHtml = (value = "") =>
  String(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const stripTags = (value = "") =>
  decodeHtml(value)
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

const skillId = (name, fallback) =>
  `official-skill-${String(fallback || name)
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-|-$/g, "")}`;

const heroId = (id) => `official-hero-${id}`;

const rarityFromQuality = (quality = "0-CS") => {
  const rank = Number(String(quality).split("-")[0]);
  return Number.isFinite(rank) ? Math.max(1, Math.min(5, rank + 1)) : 3;
};

const skillGrade = (value) => {
  const grade = String(value || "").trim().toUpperCase();
  return ["S", "A", "B", "C"].includes(grade) ? grade : "";
};

const toNumber = (value, fallback = 60) => {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
};

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

function parseSkillBlock(html, title) {
  const match = html.match(new RegExp(`<dt>\\s*${title}：?\\s*<\\/dt>\\s*<dd>([\\s\\S]*?)<\\/dd>`));
  if (!match) return null;
  const text = stripTags(match[1]);
  const splitAt = text.indexOf("：");
  if (splitAt === -1) return { name: text, desc: "" };
  return {
    name: text.slice(0, splitAt).trim(),
    desc: text.slice(splitAt + 1).trim(),
  };
}

function parseSkillBlocks(html, titlePrefix) {
  const blocks = [];
  const pattern = /<dt>\s*([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g;
  for (const match of html.matchAll(pattern)) {
    const title = stripTags(match[1]).replace(/：$/, "");
    if (!title.startsWith(titlePrefix)) continue;
    const text = stripTags(match[2]);
    const splitAt = text.indexOf("：");
    if (splitAt === -1) blocks.push({ name: text, desc: "" });
    else blocks.push({
      name: text.slice(0, splitAt).trim(),
      desc: text.slice(splitAt + 1).trim(),
    });
  }
  return blocks;
}

async function scrapeDetails(heroes) {
  const details = new Map();
  let cursor = 0;
  const workers = Array.from({ length: 10 }, async () => {
    while (cursor < heroes.length) {
      const hero = heroes[cursor++];
      try {
        const html = await fetchText(`https://stzb.163.com/herolist/${hero.id}.html`);
        details.set(hero.id, {
          baseSkill: parseSkillBlock(html, "基础战法"),
          dismantleSkills: parseSkillBlocks(html, "可拆战法"),
        });
      } catch (error) {
        details.set(hero.id, { error: String(error.message || error) });
      }
    }
  });
  await Promise.all(workers);
  return details;
}

function upsertSkill(map, raw) {
  if (!raw?.name) return null;
  const id = raw.id || skillId(raw.name, raw.methodId);
  const existing = map.get(id) || {};
  map.set(id, {
    id,
    officialId: raw.officialId || existing.officialId || raw.methodId || null,
    name: raw.name,
    type: raw.type || existing.type || "未知",
    target: raw.target || existing.target || "",
    desc: raw.desc || existing.desc || "",
    grade: skillGrade(raw.grade || raw.quality || raw.rank || existing.grade),
    source: raw.source || existing.source || "official",
    trigger: "official",
  });
  return id;
}

const heroesRaw = await fetchJson(HERO_EXTRA);
const skillRaw = await fetchJson(SKILL_LIST);
const details = await scrapeDetails(heroesRaw);
const skills = new Map();

for (const skill of skillRaw) {
  upsertSkill(skills, {
    id: skillId(decodeHtml(skill.name), skill.id),
    officialId: skill.id,
    name: decodeHtml(skill.name),
    type: decodeHtml(skill.type),
    target: decodeHtml(skill.targetShow || skill.targetType || ""),
    grade: skillGrade(skill.grade || skill.quality || skill.rank),
    source: "official-skill-list",
  });
}

const heroes = heroesRaw.map((hero) => {
  const detail = details.get(hero.id) || {};
  const baseSkill = detail.baseSkill || {
    name: hero.methodName || hero.methodName1,
    desc: hero.methodDesc || hero.methodDesc1,
  };
  const dismantles = (detail.dismantleSkills || []).map((dismantleSkill) => upsertSkill(skills, {
    name: dismantleSkill?.name,
    desc: dismantleSkill?.desc,
    type: "可拆",
    source: "official-hero-dismantle",
  })).filter(Boolean);
  const innate = upsertSkill(skills, {
    id: skillId(baseSkill?.name, hero.methodId || hero.methodId1),
    officialId: hero.methodId || hero.methodId1 || null,
    name: baseSkill?.name,
    desc: baseSkill?.desc,
    type: "自带",
    source: "official-hero-base",
  });

  return {
    id: heroId(hero.id),
    officialId: hero.id,
    iconId: hero.iconId || hero.id,
    portrait: `assets/portraits/${hero.iconId || hero.id}.jpg`,
    name: hero.name,
    faction: hero.country,
    arm: hero.type,
    rarity: rarityFromQuality(hero.quality),
    innate,
    dismantle: dismantles[0] || null,
    dismantles,
    cost: Number.parseFloat(hero.cost),
    distance: Number(hero.distance),
    stats: {
      attack: toNumber(hero.attack),
      strategy: toNumber(hero.ruse),
      defense: toNumber(hero.def),
      speed: toNumber(hero.speed),
    },
    desc: hero.desc,
  };
});

const output = {
  source: {
    heroes: HERO_EXTRA,
    skills: SKILL_LIST,
    details: "https://stzb.163.com/herolist/{id}.html",
    note: "网易官网公开资料；页面提示官网数据仅供参考，以游戏内设定为准。",
  },
  generatedAt: new Date().toISOString(),
  heroes,
  skills: [...skills.values()],
};

await fs.writeFile(
  OUT_FILE,
  `window.STZB_OFFICIAL_DATA = ${JSON.stringify(output, null, 2)};\n`,
  "utf8",
);

console.log(`Wrote ${OUT_FILE}`);
console.log(`Heroes: ${heroes.length}`);
console.log(`Skills: ${output.skills.length}`);
