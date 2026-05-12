// Team recommendation helpers. Keep this standalone so guard teams and future
// roster suggestions can share the same scoring pipeline.
(function registerTeamAI(global) {
  const DEFAULT_SAMPLE_SIZE = 20;
  const DEFAULT_SKILL_GRADES = ["S", "A"];
  const DEFAULT_SKILLS_PER_HERO = 2;
  const GRADE_SCORE = { S: 180, A: 135, B: 85, C: 45 };
  const POSITION_WEIGHTS = {
    camp: { attack: 0.65, strategy: 1.25, defense: 0.72, speed: 0.58, distance: 28 },
    middle: { attack: 0.92, strategy: 0.98, defense: 0.88, speed: 0.82, distance: 16 },
    front: { attack: 1.08, strategy: 0.62, defense: 1.24, speed: 0.96, distance: 4 },
  };

  function buildEnemyTeam(options = {}) {
    const heroes = options.heroes || [];
    const skills = options.skills || [];
    const positions = options.positions || defaultPositions();
    const sampleSize = options.sampleSize || DEFAULT_SAMPLE_SIZE;
    const rng = options.rng || Math.random;
    const heroPool = samplePool(
      usableHeroes(heroes, { minRarity: 5 }),
      sampleSize,
      rng,
    );

    return recommendTeam({
      heroes: heroPool,
      skills,
      positions,
      rng,
      minHeroRarity: 5,
      skillGrades: options.skillGrades || DEFAULT_SKILL_GRADES,
      skillsPerHero: options.skillsPerHero || DEFAULT_SKILLS_PER_HERO,
    });
  }

  function recommendTeam(options = {}) {
    const positions = options.positions || defaultPositions();
    const rng = options.rng || Math.random;
    const heroes = usableHeroes(options.heroes || [], {
      minRarity: options.minHeroRarity ?? 5,
    });
    const skills = usableSkills(options.skills || [], {
      grades: options.skillGrades === undefined ? DEFAULT_SKILL_GRADES : options.skillGrades,
    });
    const teamHeroes = chooseLineup(heroes, positions, rng);
    const usedSkillIds = new Set();

    return teamHeroes.map((hero, index) => {
      const position = positions[index] || positions[positions.length - 1] || {};
      return {
        heroId: hero.id,
        skills: chooseSkillsForHero(hero, position, skills, usedSkillIds, {
          count: options.skillsPerHero || DEFAULT_SKILLS_PER_HERO,
          rng,
        }).map((skill) => skill.id),
        position: position.id,
      };
    });
  }

  function chooseLineup(heroes, positions, rng) {
    const slots = positions.slice(0, 3);
    if (!heroes.length) return [];
    const fallback = [...heroes]
      .sort((a, b) => heroTotalScore(b) - heroTotalScore(a) || randomTie(rng))
      .slice(0, slots.length);
    let best = fallback;
    let bestScore = -Infinity;

    for (let a = 0; a < heroes.length; a += 1) {
      for (let b = 0; b < heroes.length; b += 1) {
        if (b === a) continue;
        for (let c = 0; c < heroes.length; c += 1) {
          if (c === a || c === b) continue;
          const candidate = [heroes[a], heroes[b], heroes[c]].slice(0, slots.length);
          const score = candidate.reduce((sum, hero, index) =>
            sum + scoreHeroForPosition(hero, slots[index]), 0) + synergyScore(candidate);
          if (score > bestScore || (score === bestScore && randomTie(rng) > 0)) {
            best = candidate;
            bestScore = score;
          }
        }
      }
    }

    return best;
  }

  function chooseSkillsForHero(hero, position, skills, usedSkillIds, options = {}) {
    const count = options.count || DEFAULT_SKILLS_PER_HERO;
    const rng = options.rng || Math.random;
    const ranked = skills
      .filter((skill) => skill?.id && skill.id !== hero.innate && !usedSkillIds.has(skill.id))
      .map((skill) => ({
        skill,
        score: scoreSkillForHero(skill, hero, position) + randomTie(rng) * 0.01,
      }))
      .sort((a, b) => b.score - a.score);
    const picked = ranked.slice(0, count).map((entry) => entry.skill);
    picked.forEach((skill) => usedSkillIds.add(skill.id));
    return picked;
  }

  function usableHeroes(heroes, options = {}) {
    const minRarity = options.minRarity ?? 0;
    return heroes.filter((hero) =>
      hero?.id
      && hero.innate
      && Number(hero.rarity) >= minRarity
      && hero.stats
      && Number.isFinite(Number(hero.stats.attack))
      && Number.isFinite(Number(hero.stats.strategy))
      && Number.isFinite(Number(hero.stats.defense))
      && Number.isFinite(Number(hero.stats.speed))
    );
  }

  function usableSkills(skills, options = {}) {
    const grades = Array.isArray(options.grades) && options.grades.length
      ? new Set(options.grades.map(normalizeGrade))
      : null;
    return skills.filter((skill) => {
      if (!skill?.id) return false;
      if (skill.isInnate || (Array.isArray(skill.tags) && skill.tags.includes("自带"))) return false;
      if (!grades) return true;
      return grades.has(normalizeGrade(skill.grade));
    });
  }

  function samplePool(pool, size, rng) {
    if (pool.length <= size) return shuffle(pool, rng);
    return shuffle(pool, rng).slice(0, size);
  }

  function shuffle(items, rng) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function scoreHeroForPosition(hero, position) {
    const weights = POSITION_WEIGHTS[position?.id] || POSITION_WEIGHTS.middle;
    const stats = hero.stats || {};
    const distance = Number(hero.distance) || 0;
    const rarity = Number(hero.rarity) || 0;
    const cost = Number(hero.cost) || 0;
    return rarity * 120
      + (Number(stats.attack) || 0) * weights.attack
      + (Number(stats.strategy) || 0) * weights.strategy
      + (Number(stats.defense) || 0) * weights.defense
      + (Number(stats.speed) || 0) * weights.speed
      + distance * weights.distance
      + cost * 8;
  }

  function heroTotalScore(hero) {
    return scoreHeroForPosition(hero, { id: "middle" });
  }

  function synergyScore(heroes) {
    const factionCounts = countBy(heroes, "faction");
    const armCounts = countBy(heroes, "arm");
    const sameFaction = Math.max(0, ...Object.values(factionCounts));
    const sameArm = Math.max(0, ...Object.values(armCounts));
    return Math.max(0, sameFaction - 1) * 52 + Math.max(0, sameArm - 1) * 34;
  }

  function countBy(items, key) {
    return items.reduce((counts, item) => {
      const value = item?.[key];
      if (value) counts[value] = (counts[value] || 0) + 1;
      return counts;
    }, {});
  }

  function scoreSkillForHero(skill, hero, position) {
    const stats = hero.stats || {};
    const attack = Number(stats.attack) || 0;
    const strategy = Number(stats.strategy) || 0;
    const grade = GRADE_SCORE[normalizeGrade(skill.grade)] || 60;
    const chance = Number(skill.chance) || chanceFromText(skill.probability) || 0;
    const distance = Number(skill.distance) || 0;
    const trigger = skill.trigger || "";
    const triggerScore = trigger === "command" ? 58
      : trigger === "passive" ? 50
        : trigger === "pursuit" ? 34
          : trigger === "active" ? 28 + chance * 45
            : 18;
    const statFit = attack >= strategy
      ? attack * 0.12 + (trigger === "pursuit" ? 28 : 0)
      : strategy * 0.12 + (trigger === "command" || trigger === "active" ? 18 : 0);
    const rangeFit = position?.id === "camp" && distance >= 4 ? 28
      : position?.id === "middle" && distance >= 3 ? 14
        : position?.id === "front" ? 8
          : 0;
    return grade + triggerScore + statFit + rangeFit + distance * 4;
  }

  function chanceFromText(text) {
    const numbers = String(text || "").match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
    if (!numbers.length) return 0;
    return Math.max(...numbers) / 100;
  }

  function normalizeGrade(value) {
    return String(value || "").trim().toUpperCase();
  }

  function randomTie(rng) {
    return rng() - 0.5;
  }

  function defaultPositions() {
    return [
      { id: "camp" },
      { id: "middle" },
      { id: "front" },
    ];
  }

  global.STZB_TEAM_AI = Object.freeze({
    buildEnemyTeam,
    recommendTeam,
    chooseLineup,
    chooseSkillsForHero,
    scoreHeroForPosition,
    scoreSkillForHero,
    usableHeroes,
    usableSkills,
    samplePool,
  });
})(globalThis);
