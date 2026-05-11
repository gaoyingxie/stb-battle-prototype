import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA_FILE = path.join(ROOT, "official-data.js");
const OUT_DIR = path.join(ROOT, "assets", "portraits");
const BASE_URL = "https://g0.gph.netease.com/ngsocial/community/stzb/cn/cards/cut";

function readOfficialData(source) {
  const match = source.match(/window\.STZB_OFFICIAL_DATA\s*=\s*(\{[\s\S]*\});?\s*$/);
  if (!match) throw new Error("official-data.js format not recognized");
  return JSON.parse(match[1]);
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function download(hero) {
  const imageId = hero.iconId || hero.officialId;
  const filename = `${imageId}.jpg`;
  const file = path.join(OUT_DIR, filename);
  if (await exists(file)) return { status: "skip", file, hero };

  const url = `${BASE_URL}/card_medium_${imageId}.jpg?gameid=g10`;
  const response = await fetch(url);
  if (!response.ok) return { status: "fail", hero, error: `${response.status} ${url}` };
  const type = response.headers.get("content-type") || "";
  if (!type.includes("image")) return { status: "fail", hero, error: `non-image ${type} ${url}` };

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(file, buffer);
  return { status: "ok", file, hero, bytes: buffer.length };
}

await fs.mkdir(OUT_DIR, { recursive: true });
const data = readOfficialData(await fs.readFile(DATA_FILE, "utf8"));
const heroes = data.heroes.filter((hero) => hero.officialId);

let cursor = 0;
const results = [];
const workers = Array.from({ length: 16 }, async () => {
  while (cursor < heroes.length) {
    const hero = heroes[cursor++];
    results.push(await download(hero));
  }
});

await Promise.all(workers);

const counts = results.reduce((acc, result) => {
  acc[result.status] = (acc[result.status] || 0) + 1;
  return acc;
}, {});
const failures = results.filter((result) => result.status === "fail");

console.log(`Portrait dir: ${OUT_DIR}`);
console.log(`Downloaded: ${counts.ok || 0}`);
console.log(`Skipped: ${counts.skip || 0}`);
console.log(`Failed: ${counts.fail || 0}`);
if (failures.length) {
  console.log("Failures:");
  failures.slice(0, 20).forEach((failure) => {
    console.log(`- ${failure.hero.name} ${failure.hero.officialId}: ${failure.error}`);
  });
}
