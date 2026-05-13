// Team recommendation helpers. Keep this standalone so guard teams and future
// roster suggestions can share the same scoring pipeline.
(function registerTeamAI(global) {
  const DEFAULT_SAMPLE_SIZE = 20;
  const DEFAULT_SKILL_GRADES = ["S", "A"];
  const DEFAULT_SKILLS_PER_HERO = 2;
  const POSITION_CANDIDATE_LIMIT = 18;
  const TOTAL_CANDIDATE_LIMIT = 54;
  const GRADE_SCORE = { S: 180, A: 135, B: 85, C: 45 };
  const POSITION_WEIGHTS = {
    camp: {
      attack: 0.82,
      strategy: 1.12,
      defense: 0.38,
      speed: 0.48,
      distance: 30,
      shortRangePenalty: 46,
      role: "backline",
    },
    middle: {
      attack: 0.92,
      strategy: 0.98,
      defense: 0.78,
      speed: 0.82,
      distance: 16,
      shortRangePenalty: 18,
      role: "flex",
    },
    front: {
      attack: 0.72,
      strategy: 0.58,
      defense: 1.48,
      speed: 1.02,
      distance: 5,
      shortRangePenalty: 0,
      role: "vanguard",
    },
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
    const candidates = lineupCandidates(heroes, slots, rng);
    const fallback = bestDistinctHeroes(candidates, slots, rng);
    let best = fallback;
    let bestScore = -Infinity;

    for (let a = 0; a < candidates.length; a += 1) {
      for (let b = 0; b < candidates.length; b += 1) {
        if (b === a) continue;
        for (let c = 0; c < candidates.length; c += 1) {
          if (c === a || c === b) continue;
          const candidate = [candidates[a], candidates[b], candidates[c]].slice(0, slots.length);
          if (hasDuplicateIdentity(candidate)) continue;
          const score = scoreLineup(candidate, slots);
          if (score > bestScore || (score === bestScore && randomTie(rng) > 0)) {
            best = candidate;
            bestScore = score;
          }
        }
      }
    }

    return best;
  }

  function lineupCandidates(heroes, slots, rng) {
    const ranked = new Map();
    slots.forEach((position) => {
      [...heroes]
        .sort((a, b) =>
          scoreHeroForPosition(b, position) - scoreHeroForPosition(a, position)
          || randomTie(rng)
        )
        .slice(0, POSITION_CANDIDATE_LIMIT)
        .forEach((hero) => ranked.set(hero.id, hero));
    });
    [...heroes]
      .sort((a, b) => heroTotalScore(b) - heroTotalScore(a) || randomTie(rng))
      .slice(0, POSITION_CANDIDATE_LIMIT)
      .forEach((hero) => ranked.set(hero.id, hero));
    return [...ranked.values()]
      .sort((a, b) => heroTotalScore(b) - heroTotalScore(a) || randomTie(rng))
      .slice(0, TOTAL_CANDIDATE_LIMIT);
  }

  function bestDistinctHeroes(heroes, slots, rng) {
    const picked = [];
    const used = new Set();
    slots.forEach((position) => {
      const hero = [...heroes]
        .filter((candidate) => !used.has(heroIdentityKey(candidate)))
        .sort((a, b) =>
          scoreHeroForPosition(b, position) - scoreHeroForPosition(a, position)
          || randomTie(rng)
        )[0];
      if (hero) {
        picked.push(hero);
        used.add(heroIdentityKey(hero));
      }
    });
    return picked;
  }

  function scoreLineup(heroes, slots) {
    const positionScore = heroes.reduce((sum, hero, index) =>
      sum + scoreHeroForPosition(hero, slots[index]), 0);
    return positionScore + synergyScore(heroes) + teamBalanceScore(heroes, slots);
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
    const attack = Number(stats.attack) || 0;
    const strategy = Number(stats.strategy) || 0;
    const defense = Number(stats.defense) || 0;
    const speed = Number(stats.speed) || 0;
    const distance = Number(hero.distance) || 0;
    const rarity = Number(hero.rarity) || 0;
    const primaryOffense = Math.max(attack, strategy);
    const secondaryOffense = Math.min(attack, strategy);
    const hybridValue = primaryOffense * 0.22 + secondaryOffense * 0.1;
    const roleBonus = roleFitBonus({ attack, strategy, defense, speed, distance }, weights.role);
    const distanceScore = rangeFitScore(distance, position?.id, weights);

    return rarity * 42
      + attack * weights.attack
      + strategy * weights.strategy
      + defense * weights.defense
      + speed * weights.speed
      + hybridValue
      + distanceScore
      + roleBonus;
  }

  function roleFitBonus(stats, role) {
    if (role === "backline") {
      const damageCeiling = Math.max(stats.attack, stats.strategy);
      return Math.max(0, damageCeiling - 82) * 0.9
        + Math.max(0, stats.distance - 3) * 28
        - Math.max(0, 3 - stats.distance) * 34;
    }
    if (role === "vanguard") {
      return Math.max(0, stats.defense - 85) * 1.05
        + Math.max(0, stats.speed - 70) * 0.42
        - Math.max(0, 78 - stats.defense) * 1.35;
    }
    return Math.max(0, stats.attack - 78) * 0.28
      + Math.max(0, stats.strategy - 78) * 0.28
      + Math.max(0, stats.defense - 78) * 0.22
      + Math.max(0, stats.speed - 68) * 0.24;
  }

  function rangeFitScore(distance, positionId, weights) {
    if (!distance) return -24;
    const weighted = distance * weights.distance;
    if (positionId === "camp") return weighted - Math.max(0, 4 - distance) * weights.shortRangePenalty;
    if (positionId === "middle") return weighted - Math.max(0, 3 - distance) * weights.shortRangePenalty;
    return weighted + (distance <= 2 ? 12 : 0);
  }

  function heroTotalScore(hero) {
    return Math.max(
      scoreHeroForPosition(hero, { id: "camp" }),
      scoreHeroForPosition(hero, { id: "middle" }),
      scoreHeroForPosition(hero, { id: "front" }),
    );
  }

  function synergyScore(heroes) {
    const factionCounts = countBy(heroes, "faction");
    const armCounts = countBy(heroes, "arm");
    const sameFaction = Math.max(0, ...Object.values(factionCounts));
    const sameArm = Math.max(0, ...Object.values(armCounts));
    return Math.max(0, sameFaction - 1) * 58 + Math.max(0, sameArm - 1) * 32;
  }

  function teamBalanceScore(heroes, slots) {
    if (!heroes.length) return 0;
    const attack = sum(heroes, (hero) => Number(hero.stats?.attack) || 0);
    const strategy = sum(heroes, (hero) => Number(hero.stats?.strategy) || 0);
    const defense = sum(heroes, (hero) => Number(hero.stats?.defense) || 0);
    const speed = sum(heroes, (hero) => Number(hero.stats?.speed) || 0);
    const offenseTotal = Math.max(1, attack + strategy);
    const offenseBalance = 1 - Math.abs(attack - strategy) / offenseTotal;
    const frontHero = heroes[slots.findIndex((slot) => slot?.id === "front")] || heroes[heroes.length - 1];
    const campHero = heroes[slots.findIndex((slot) => slot?.id === "camp")] || heroes[0];
    const frontDefense = Number(frontHero?.stats?.defense) || 0;
    const campDistance = Number(campHero?.distance) || 0;
    const hasFastUnit = heroes.some((hero) => Number(hero.stats?.speed) >= 85);

    return offenseBalance * 46
      + Math.min(42, defense / heroes.length * 0.22)
      + Math.min(26, speed / heroes.length * 0.13)
      + (frontDefense >= 88 ? 36 : -Math.max(0, 82 - frontDefense) * 1.6)
      + (campDistance >= 4 ? 26 : -Math.max(0, 3 - campDistance) * 28)
      + (hasFastUnit ? 18 : 0);
  }

  function countBy(items, key) {
    return items.reduce((counts, item) => {
      const value = item?.[key];
      if (value) counts[value] = (counts[value] || 0) + 1;
      return counts;
    }, {});
  }

  function sum(items, getter) {
    return items.reduce((total, item) => total + getter(item), 0);
  }

  function hasDuplicateIdentity(heroes) {
    const seen = new Set();
    return heroes.some((hero) => {
      const key = heroIdentityKey(hero);
      if (seen.has(key)) return true;
      seen.add(key);
      return false;
    });
  }

  function heroIdentityKey(hero) {
    return [hero?.name || hero?.id, hero?.faction || "", hero?.arm || ""].join("|");
  }

  function scoreSkillForHero(skill, hero, position) {
    const stats = hero.stats || {};
    const attack = Number(stats.attack) || 0;
    const strategy = Number(stats.strategy) || 0;
    const heroDistance = Number(hero.distance) || 0;
    const grade = GRADE_SCORE[normalizeGrade(skill.grade)] || 60;
    const chance = Number(skill.chance) || chanceFromText(skill.probability) || 0;
    const distance = Number(skill.distance) || 0;
    const trigger = normalizedTrigger(skill);
    const profile = skillProfile(skill);
    const triggerScore = scoreTrigger(trigger, chance, profile);
    const statFit = skillStatFit(profile, { attack, strategy });
    const rangeFit = skillRangeFit(skill, heroDistance, position?.id);
    const roleFit = skillRoleFit(profile, trigger, position?.id);
    const armFit = skillArmFit(skill, hero);

    return grade + triggerScore + statFit + rangeFit + roleFit + armFit;
  }

  function normalizedTrigger(skill) {
    const trigger = String(skill.trigger || "").toLowerCase();
    const type = String(skill.type || "");
    if (trigger && trigger !== "official") return trigger;
    if (/指挥/.test(type)) return "command";
    if (/被动/.test(type)) return "passive";
    if (/追击/.test(type)) return "pursuit";
    if (/主动/.test(type)) return "active";
    return trigger || "unknown";
  }

  function scoreTrigger(trigger, chance, profile) {
    if (trigger === "command") return 58 + (profile.control || profile.support ? 12 : 0);
    if (trigger === "passive") return 52 + (profile.defense ? 10 : 0);
    if (trigger === "pursuit") return 34 + (profile.attack ? 10 : 0);
    if (trigger === "active") return 26 + Math.min(34, chance * 68);
    return 18;
  }

  function skillProfile(skill) {
    const text = `${skill.name || ""} ${skill.type || ""} ${skill.effect || ""} ${skill.desc || ""} ${skill.target || ""}`;
    return {
      attack: /攻击|兵刃|追击|分兵|连击|反击/.test(text),
      strategy: /策略|谋略|火攻|妖术|恐慌|燃烧/.test(text),
      control: /犹豫|怯战|混乱|暴走|动摇|封锁|控制/.test(text),
      defense: /规避|减伤|防御|援护|免疫|洞察/.test(text),
      support: /提高|提升|增益|伤害提高|攻击属性|谋略属性|速度属性/.test(text),
      sustain: /恢复|治疗|休整|急救|援军/.test(text),
      range: /距离|射程|远攻/.test(text),
      area: /群体|全体|敌军.{0,3}体|我军.{0,3}体/.test(text),
    };
  }

  function skillStatFit(profile, stats) {
    const attackFit = profile.attack ? stats.attack * 0.18 : stats.attack * 0.04;
    const strategyFit = (profile.strategy || profile.control || profile.sustain || profile.support)
      ? stats.strategy * 0.18
      : stats.strategy * 0.04;
    const hybrid = profile.attack && (profile.strategy || profile.control)
      ? Math.min(stats.attack, stats.strategy) * 0.06
      : 0;
    return attackFit + strategyFit + hybrid;
  }

  function skillRangeFit(skill, heroDistance, positionId) {
    const distance = Number(skill.distance) || 0;
    const required = positionId === "camp" ? 4 : positionId === "middle" ? 3 : 1;
    const heroRangeFit = heroDistance >= required ? 14 : -Math.max(0, required - heroDistance) * 16;
    const skillRangeFit = !distance ? 0
      : positionId === "camp" && distance >= 4 ? 22
        : positionId === "middle" && distance >= 3 ? 13
          : positionId === "front" ? 8
            : -10;
    return heroRangeFit + skillRangeFit + distance * 3;
  }

  function skillRoleFit(profile, trigger, positionId) {
    if (positionId === "camp") {
      return (profile.attack || profile.strategy ? 18 : 0)
        + (profile.area ? 12 : 0)
        + (profile.defense ? -8 : 0);
    }
    if (positionId === "front") {
      return (profile.defense || profile.control ? 20 : 0)
        + (profile.sustain ? 12 : 0)
        + (trigger === "pursuit" ? 8 : 0)
        + (profile.range ? -8 : 0);
    }
    return (profile.support || profile.control ? 14 : 0)
      + (profile.attack || profile.strategy ? 8 : 0);
  }

  function skillArmFit(skill, hero) {
    const soldierType = String(skill.soldierType || "");
    const arm = String(hero.arm || "");
    if (!soldierType || !arm || /全|无|--/.test(soldierType)) return 0;
    return soldierType.includes(arm) ? 16 : -24;
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
