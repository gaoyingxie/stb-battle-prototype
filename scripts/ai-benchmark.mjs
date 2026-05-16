import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { startStaticServer } from "./dev-server.mjs";

const DEFAULT_CONFIG = {
  battleSeeds: 2,
  candidates: 6,
  enemyPoolSize: 20,
  improvementThreshold: 1.5,
  output: "reports/ai-benchmark-latest.json",
  playerPoolSize: 24,
  samples: 4,
  seed: 20260515,
  seedList: null,
  tune: false,
};

const TUNABLE_PATHS = [
  ["positionWeights", "camp", "attack"],
  ["positionWeights", "camp", "strategy"],
  ["positionWeights", "camp", "distance"],
  ["positionWeights", "camp", "shortRangePenalty"],
  ["positionWeights", "middle", "attack"],
  ["positionWeights", "middle", "strategy"],
  ["positionWeights", "middle", "defense"],
  ["positionWeights", "middle", "speed"],
  ["positionWeights", "front", "attack"],
  ["positionWeights", "front", "defense"],
  ["positionWeights", "front", "speed"],
  ["synergy", "sameFaction"],
  ["synergy", "sameArm"],
  ["synergy", "supportCarryScale"],
  ["synergy", "rangeScale"],
  ["synergy", "tempoScale"],
  ["balance", "offenseBalance"],
  ["balance", "frontDefenseBonus"],
  ["balance", "campDistanceBonus"],
  ["balance", "sustainBonus"],
  ["balance", "controlBonus"],
  ["balance", "protectionBonus"],
  ["plan", "totalDamageScale"],
  ["plan", "sustainScale"],
  ["plan", "controlScale"],
  ["plan", "supportScale"],
  ["plan", "carrySupportBonus"],
  ["combatProfile", "damagePrimary"],
  ["combatProfile", "defenseProtection"],
  ["combatProfile", "innateDamage"],
  ["combatProfile", "innateHealing"],
  ["skillExpectation", "damage"],
  ["skillExpectation", "healing"],
  ["skillExpectation", "control"],
  ["skillExpectation", "support"],
  ["skillTeamFit", "damageNeed"],
  ["skillTeamFit", "sustainNeed"],
  ["skillTeamFit", "controlNeed"],
  ["skillTeamFit", "supportNeed"],
  ["skillTeamFit", "amplifyBonus"],
  ["skillTeamFit", "tauntFrontBonus"],
  ["skillTeamFit", "debuffAlliedDamageScale"],
  ["skillTeamFit", "splashScale"],
];

function parseArgs(argv) {
  const config = { ...DEFAULT_CONFIG };
  argv.forEach((arg) => {
    if (arg === "--tune") config.tune = true;
    if (arg === "--dry-run") config.dryRun = true;
    if (arg.startsWith("--samples=")) config.samples = positiveInt(arg, "samples", config.samples);
    if (arg.startsWith("--candidates=")) config.candidates = positiveInt(arg, "candidates", config.candidates);
    if (arg.startsWith("--battle-seeds=")) config.battleSeeds = positiveInt(arg, "battle-seeds", config.battleSeeds);
    if (arg.startsWith("--seed=")) config.seed = positiveInt(arg, "seed", config.seed);
    if (arg.startsWith("--seed-list=")) config.seedList = positiveIntList(arg.slice("--seed-list=".length), config.seedList);
    if (arg.startsWith("--seeds=")) config.seedList = positiveIntList(arg.slice("--seeds=".length), config.seedList);
    if (arg.startsWith("--player-pool-size=")) config.playerPoolSize = positiveInt(arg, "player-pool-size", config.playerPoolSize);
    if (arg.startsWith("--enemy-pool-size=")) config.enemyPoolSize = positiveInt(arg, "enemy-pool-size", config.enemyPoolSize);
    if (arg.startsWith("--threshold=")) config.improvementThreshold = nonNegativeNumber(arg, "threshold", config.improvementThreshold);
    if (arg.startsWith("--output=")) config.output = arg.slice("--output=".length) || config.output;
  });
  if (!config.tune) config.candidates = 0;
  return config;
}

function positiveInt(arg, label, fallback) {
  const value = Number(arg.slice(`--${label}=`.length));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function nonNegativeNumber(arg, label, fallback) {
  const value = Number(arg.slice(`--${label}=`.length));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function positiveIntList(value, fallback) {
  const seeds = value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0)
    .map((item) => Math.floor(item));
  return seeds.length ? [...new Set(seeds)] : fallback;
}

function makeRng(seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getPath(object, segments) {
  return segments.reduce((current, segment) => current?.[segment], object);
}

function setPath(object, segments, value) {
  let current = object;
  segments.slice(0, -1).forEach((segment) => {
    current[segment] ||= {};
    current = current[segment];
  });
  current[segments.at(-1)] = value;
}

function sum(items, selector) {
  return items.reduce((total, item) => total + selector(item), 0);
}

function candidateWeights(baseWeights, rng, index) {
  const weights = clone(baseWeights);
  const changes = [];
  const changeCount = 6 + Math.floor(rng() * 7);
  for (let step = 0; step < changeCount; step += 1) {
    const pathSegments = TUNABLE_PATHS[Math.floor(rng() * TUNABLE_PATHS.length)];
    const current = Number(getPath(weights, pathSegments));
    if (!Number.isFinite(current)) continue;
    const factor = 0.82 + rng() * 0.36;
    const next = Math.max(0, Number((current * factor).toFixed(4)));
    setPath(weights, pathSegments, next);
    changes.push({ path: pathSegments.join("."), from: current, to: next });
  }
  return { id: `candidate-${index}`, weights, changes };
}

async function evaluateWeights(page, weights, config, label) {
  return page.evaluate(({ weights: candidateWeightsValue, config: benchmarkConfig, label: benchmarkLabel }) => {
    const positions = globalThis.STZB_BATTLE_RULES.POSITIONS;
    const allHeroes = globalThis.STZB_SEED_DATA.HEROES.filter((hero) => (
      Number(hero.rarity) >= 5
      && hero.stats
      && Number.isFinite(Number(hero.stats.attack))
      && Number.isFinite(Number(hero.stats.strategy))
      && Number.isFinite(Number(hero.stats.defense))
      && Number.isFinite(Number(hero.stats.speed))
    ));
    const allSkills = globalThis.STZB_SEED_DATA.SKILLS.filter((skill) => (
      skill?.id
      && !skill.isInnate
      && !(Array.isArray(skill.tags) && skill.tags.includes("自带"))
      && ["S", "A"].includes(String(skill.grade || ""))
    ));

    function makeBrowserRng(seed) {
      let state = Number(seed) >>> 0;
      return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let next = state;
        next = Math.imul(next ^ (next >>> 15), next | 1);
        next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
        return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
      };
    }

    function shuffled(items, rng) {
      const copy = [...items];
      for (let index = copy.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(rng() * (index + 1));
        [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
      }
      return copy;
    }

    function sample(items, count, rng) {
      return shuffled(items, rng).slice(0, Math.min(count, items.length));
    }

    function withRandom(seed, action) {
      const originalRandom = Math.random;
      const rng = makeBrowserRng(seed);
      Math.random = rng;
      try {
        return action(rng);
      } finally {
        Math.random = originalRandom;
      }
    }

    function troopTotal(units) {
      return units.reduce((total, unit) => total + Math.max(0, Number(unit.troops) || 0), 0);
    }

    function battleScore(battle) {
      const playerTroops = troopTotal(battle.player);
      const enemyTroops = troopTotal(battle.enemy);
      const troopDelta = (playerTroops - enemyTroops) / 30000;
      const playerCampAlive = (battle.player.find((unit) => unit.position === "camp")?.troops || 0) > 0;
      const enemyCampAlive = (battle.enemy.find((unit) => unit.position === "camp")?.troops || 0) > 0;
      const resultScore = battle.winner === "player" ? 100 : battle.winner === "draw" ? 52 : 8;
      const roundBonus = battle.winner === "player" ? Math.max(0, 8 - battle.rounds) * 2 : battle.winner === "enemy" ? -Math.max(0, 8 - battle.rounds) * 1.4 : 0;
      const campBonus = (playerCampAlive ? 5 : -10) + (!enemyCampAlive ? 8 : 0);
      const score = resultScore + troopDelta * 30 + roundBonus + campBonus;
      return {
        score,
        playerTroops,
        enemyTroops,
        troopDelta,
        winner: battle.winner,
        rounds: battle.rounds,
      };
    }

    const totals = {
      score: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      rounds: 0,
      playerTroops: 0,
      enemyTroops: 0,
      battles: 0,
    };
    const examples = [];

    for (let sampleIndex = 0; sampleIndex < benchmarkConfig.samples; sampleIndex += 1) {
      const sampleSeed = benchmarkConfig.seed + sampleIndex * 4099;
      const playerPool = sample(allHeroes, benchmarkConfig.playerPoolSize, makeBrowserRng(sampleSeed + 11));
      const enemyPool = sample(allHeroes, benchmarkConfig.enemyPoolSize, makeBrowserRng(sampleSeed + 29));
      const playerTeam = withRandom(sampleSeed + 47, (rng) => globalThis.STZB_TEAM_AI.recommendTeam({
        heroes: playerPool,
        skills: allSkills,
        positions,
        minHeroRarity: 5,
        skillGrades: ["S", "A"],
        rng,
        weights: candidateWeightsValue || undefined,
      }));
      const enemyTeam = withRandom(sampleSeed + 83, (rng) => globalThis.STZB_TEAM_AI.buildEnemyTeam({
        heroes: enemyPool,
        skills: allSkills,
        positions,
        sampleSize: Math.min(benchmarkConfig.enemyPoolSize, enemyPool.length),
        skillGrades: ["S", "A"],
        rng,
        weights: candidateWeightsValue || undefined,
      }));

      for (let seedIndex = 0; seedIndex < benchmarkConfig.battleSeeds; seedIndex += 1) {
        const battle = withRandom(sampleSeed + 1009 + seedIndex * 131, () =>
          globalThis.simulateBattle(playerTeam, enemyTeam)
        );
        const scored = battleScore(battle);
        totals.score += scored.score;
        totals.rounds += scored.rounds;
        totals.playerTroops += scored.playerTroops;
        totals.enemyTroops += scored.enemyTroops;
        totals.battles += 1;
        if (scored.winner === "player") totals.wins += 1;
        else if (scored.winner === "draw") totals.draws += 1;
        else totals.losses += 1;
        if (examples.length < 4) {
          examples.push({
            sample: sampleIndex,
            seed: sampleSeed,
            winner: scored.winner,
            score: Number(scored.score.toFixed(2)),
            rounds: scored.rounds,
            playerTeam: playerTeam.map((slot) => slot.heroId),
            enemyTeam: enemyTeam.map((slot) => slot.heroId),
          });
        }
      }
    }

    const battles = Math.max(1, totals.battles);
    return {
      label: benchmarkLabel,
      score: Number((totals.score / battles).toFixed(3)),
      winRate: Number((totals.wins / battles).toFixed(3)),
      drawRate: Number((totals.draws / battles).toFixed(3)),
      lossRate: Number((totals.losses / battles).toFixed(3)),
      averageRounds: Number((totals.rounds / battles).toFixed(2)),
      averagePlayerTroops: Math.round(totals.playerTroops / battles),
      averageEnemyTroops: Math.round(totals.enemyTroops / battles),
      battles,
      examples,
      heroPoolSize: allHeroes.length,
      skillPoolSize: allSkills.length,
    };
  }, { weights, config, label });
}

function evaluationSeeds(config) {
  return Array.isArray(config.seedList) && config.seedList.length ? config.seedList : [config.seed];
}

async function evaluateWeightSet(page, weights, config, label) {
  const seeds = evaluationSeeds(config);
  if (seeds.length === 1) return evaluateWeights(page, weights, config, label);

  const seedResults = [];
  for (const seed of seeds) {
    seedResults.push(await evaluateWeights(page, weights, { ...config, seed }, `${label}@${seed}`));
  }
  return aggregateSeedResults(label, seedResults);
}

function aggregateSeedResults(label, seedResults) {
  const battles = Math.max(1, sum(seedResults, (result) => result.battles));
  const weighted = (key, digits = 3) => Number((sum(seedResults, (result) => result[key] * result.battles) / battles).toFixed(digits));
  const examples = seedResults
    .flatMap((result) => result.examples.map((example) => ({
      ...example,
      evaluationSeed: Number(result.label.split("@").at(-1)),
    })))
    .slice(0, 4);

  return {
    label,
    score: weighted("score"),
    winRate: weighted("winRate"),
    drawRate: weighted("drawRate"),
    lossRate: weighted("lossRate"),
    averageRounds: weighted("averageRounds", 2),
    averagePlayerTroops: Math.round(sum(seedResults, (result) => result.averagePlayerTroops * result.battles) / battles),
    averageEnemyTroops: Math.round(sum(seedResults, (result) => result.averageEnemyTroops * result.battles) / battles),
    battles,
    examples,
    heroPoolSize: seedResults[0]?.heroPoolSize || 0,
    skillPoolSize: seedResults[0]?.skillPoolSize || 0,
    seedResults: seedResults.map((result) => ({
      label: result.label,
      score: result.score,
      winRate: result.winRate,
      drawRate: result.drawRate,
      lossRate: result.lossRate,
      averageRounds: result.averageRounds,
      battles: result.battles,
    })),
  };
}

function formatSummary(result) {
  return `${result.label}: score=${result.score}, win=${Math.round(result.winRate * 100)}%, draw=${Math.round(result.drawRate * 100)}%, rounds=${result.averageRounds}`;
}

function serializeWeights(weights) {
  return `// Default tunable weights for the recommendation AI. Offline benchmark scripts
// may rewrite this file after validating candidate weights against simulations.
(function registerTeamAIWeights(global) {
  const TEAM_AI_WEIGHTS = ${JSON.stringify(weights, null, 2)};

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
    return value;
  }

  global.STZB_TEAM_AI_WEIGHTS = deepFreeze(TEAM_AI_WEIGHTS);
})(globalThis);
`;
}

async function writeReport(outputPath, report) {
  const absolutePath = path.resolve(outputPath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function writeWeights(weights) {
  const weightsPath = path.resolve("src/team-ai-weights.js");
  await fs.writeFile(weightsPath, serializeWeights(weights), "utf8");
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const localServer = await startStaticServer({ root, port: 0 });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

  try {
    await page.goto(localServer.url);
    await page.waitForFunction(() => (
      globalThis.STZB_TEAM_AI?.recommendTeam
      && globalThis.STZB_TEAM_AI_WEIGHTS
      && globalThis.simulateBattle
    ));

    const baseWeights = await page.evaluate(() => globalThis.STZB_TEAM_AI_WEIGHTS);
    const baseline = await evaluateWeightSet(page, null, config, "baseline");
    let best = { id: "baseline", result: baseline, weights: baseWeights, changes: [] };
    const candidates = [];

    if (config.tune) {
      const rng = makeRng(evaluationSeeds(config)[0] + 7001);
      for (let index = 1; index <= config.candidates; index += 1) {
        const candidate = candidateWeights(baseWeights, rng, index);
        const result = await evaluateWeightSet(page, candidate.weights, config, candidate.id);
        const entry = { ...candidate, result };
        candidates.push({
          id: entry.id,
          result,
          changes: entry.changes,
        });
        if (result.score > best.result.score) best = entry;
      }
    }

    const delta = Number((best.result.score - baseline.score).toFixed(3));
    const shouldWrite = Boolean(config.tune && delta >= config.improvementThreshold && !config.dryRun);
    if (shouldWrite) await writeWeights(best.weights);

    const report = {
      generatedAt: new Date().toISOString(),
      config,
      baseline,
      bestCandidate: {
        id: best.id,
        result: best.result,
        delta,
        changes: best.changes,
      },
      candidates,
      writeBack: {
        attempted: Boolean(config.tune),
        applied: shouldWrite,
        dryRun: Boolean(config.dryRun),
        threshold: config.improvementThreshold,
        path: shouldWrite ? "src/team-ai-weights.js" : null,
      },
    };

    await writeReport(config.output, report);
    console.log(formatSummary(baseline));
    if (config.tune) {
      console.log(formatSummary(best.result));
      console.log(`delta=${delta}; writeBack=${shouldWrite ? "applied" : "skipped"}`);
    }
    console.log(`report=${path.resolve(config.output)}`);
  } finally {
    await browser.close();
    await localServer.close();
  }
}

await main();
