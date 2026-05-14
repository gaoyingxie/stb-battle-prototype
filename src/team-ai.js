// Team recommendation helpers. Keep this standalone so guard teams and future
// roster suggestions can share the same scoring pipeline.
(function registerTeamAI(global) {
  const DEFAULT_SAMPLE_SIZE = 20;
  const DEFAULT_SKILL_GRADES = ["S", "A"];
  const DEFAULT_SKILLS_PER_HERO = 2;
  const POSITION_CANDIDATE_LIMIT = 18;
  const TOTAL_CANDIDATE_LIMIT = 54;
  const GRADE_SCORE = { S: 180, A: 135, B: 85, C: 45 };
  const PROFILE_KEYS = ["damage", "sustain", "control", "support", "defense", "range"];
  const TEAM_ROLE_TARGETS = {
    damage: 2,
    sustain: 1,
    control: 1,
    support: 1,
    defense: 1,
  };
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
    const context = buildScoringContext(options.skills || []);
    const heroes = usableHeroes(options.heroes || [], {
      minRarity: options.minHeroRarity ?? 5,
    });
    const skills = usableSkills(options.skills || [], {
      grades: options.skillGrades === undefined ? DEFAULT_SKILL_GRADES : options.skillGrades,
    });
    const teamHeroes = chooseLineup(heroes, positions, rng, context);
    const skillAssignments = chooseTeamSkills(teamHeroes, positions, skills, {
      count: options.skillsPerHero || DEFAULT_SKILLS_PER_HERO,
      rng,
      context,
    });

    return teamHeroes.map((hero, index) => {
      const position = positions[index] || positions[positions.length - 1] || {};
      return {
        heroId: hero.id,
        skills: (skillAssignments[index] || []).map((skill) => skill.id),
        position: position.id,
      };
    });
  }

  function chooseLineup(heroes, positions, rng, context = buildScoringContext()) {
    const slots = positions.slice(0, 3);
    if (!heroes.length) return [];
    const candidates = lineupCandidates(heroes, slots, rng, context);
    const fallback = bestDistinctHeroes(candidates, slots, rng, context);
    let best = fallback;
    let bestScore = -Infinity;

    for (let a = 0; a < candidates.length; a += 1) {
      for (let b = 0; b < candidates.length; b += 1) {
        if (b === a) continue;
        for (let c = 0; c < candidates.length; c += 1) {
          if (c === a || c === b) continue;
          const candidate = [candidates[a], candidates[b], candidates[c]].slice(0, slots.length);
          if (hasDuplicateIdentity(candidate)) continue;
          const score = scoreLineup(candidate, slots, context);
          if (score > bestScore || (score === bestScore && randomTie(rng) > 0)) {
            best = candidate;
            bestScore = score;
          }
        }
      }
    }

    return best;
  }

  function lineupCandidates(heroes, slots, rng, context) {
    const ranked = new Map();
    slots.forEach((position) => {
      [...heroes]
        .sort((a, b) =>
          scoreHeroForPosition(b, position, context) - scoreHeroForPosition(a, position, context)
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

  function bestDistinctHeroes(heroes, slots, rng, context) {
    const picked = [];
    const used = new Set();
    slots.forEach((position) => {
      const hero = [...heroes]
        .filter((candidate) => !used.has(heroIdentityKey(candidate)))
        .sort((a, b) =>
          scoreHeroForPosition(b, position, context) - scoreHeroForPosition(a, position, context)
          || randomTie(rng)
        )[0];
      if (hero) {
        picked.push(hero);
        used.add(heroIdentityKey(hero));
      }
    });
    return picked;
  }

  function scoreLineup(heroes, slots, context) {
    const positionScore = heroes.reduce((sum, hero, index) =>
      sum + scoreHeroForPosition(hero, slots[index], context), 0);
    return positionScore
      + synergyScore(heroes, context)
      + teamBalanceScore(heroes, slots, context)
      + lineupCombatPlanScore(heroes, slots, context);
  }

  function chooseTeamSkills(heroes, positions, skills, options = {}) {
    const count = options.count || DEFAULT_SKILLS_PER_HERO;
    const rng = options.rng || Math.random;
    const context = {
      ...(options.context || buildScoringContext(skills)),
      availableSkills: skills,
    };
    const assignments = heroes.map(() => []);
    const usedSkillIds = new Set();
    const maxSlots = heroes.length * count;

    for (let picked = 0; picked < maxSlots; picked += 1) {
      let best = null;
      heroes.forEach((hero, heroIndex) => {
        if (!hero || assignments[heroIndex].length >= count) return;
        const position = positions[heroIndex] || positions[positions.length - 1] || {};
        skills.forEach((skill) => {
          if (!skill?.id || skill.id === hero.innate || usedSkillIds.has(skill.id)) return;
          const score = scoreSkillForHero(skill, hero, position, {
            ...context,
            heroes,
            positions,
            assignments,
            heroIndex,
          }) + randomTie(rng) * 0.01;
          if (!best || score > best.score) best = { heroIndex, skill, score };
        });
      });
      if (!best) break;
      assignments[best.heroIndex].push(best.skill);
      usedSkillIds.add(best.skill.id);
    }

    return assignments;
  }

  function chooseSkillsForHero(hero, position, skills, usedSkillIds, options = {}) {
    const count = options.count || DEFAULT_SKILLS_PER_HERO;
    const rng = options.rng || Math.random;
    const context = {
      ...buildScoringContext(skills),
      availableSkills: skills,
    };
    const ranked = skills
      .filter((skill) => skill?.id && skill.id !== hero.innate && !usedSkillIds.has(skill.id))
      .map((skill) => ({
        skill,
        score: scoreSkillForHero(skill, hero, position, context) + randomTie(rng) * 0.01,
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
    const innateSkillIds = new Set((global.STZB_SEED_DATA?.HEROES || [])
      .map((hero) => hero?.innate)
      .filter(Boolean));
    return skills.filter((skill) => {
      if (!skill?.id) return false;
      if (innateSkillIds.has(skill.id)) return false;
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

  function scoreHeroForPosition(hero, position, context = buildScoringContext()) {
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
    const innateFit = heroInnateFitBonus(hero, position, context);

    return rarity * 42
      + attack * weights.attack
      + strategy * weights.strategy
      + defense * weights.defense
      + speed * weights.speed
      + hybridValue
      + distanceScore
      + roleBonus
      + innateFit;
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

  function synergyScore(heroes, context = buildScoringContext()) {
    const factionCounts = countBy(heroes, "faction");
    const armCounts = countBy(heroes, "arm");
    const sameFaction = Math.max(0, ...Object.values(factionCounts));
    const sameArm = Math.max(0, ...Object.values(armCounts));
    const profiles = heroes.map((hero) => heroCombatProfile(hero, context));
    const damageThreat = sum(profiles, (profile) => profile.damageThreat);
    const supportPressure = sum(profiles, (profile) => profile.support + profile.amplify);
    const rangeSupport = sum(profiles, (profile) => profile.range);
    const shortRangeBackline = heroes.some((hero, index) => index < 2 && Number(hero.distance) <= 2);
    const hasCarry = profiles.some((profile) => profile.damageThreat >= 130);
    const supportCarryLink = hasCarry ? Math.min(72, supportPressure * 0.34) : 0;
    const rangeLink = shortRangeBackline ? Math.min(38, rangeSupport * 0.42) : 0;
    return Math.max(0, sameFaction - 1) * 58
      + Math.max(0, sameArm - 1) * 32
      + supportCarryLink
      + rangeLink
      + Math.min(34, damageThreat * supportPressure * 0.0009);
  }

  function teamBalanceScore(heroes, slots, context = buildScoringContext()) {
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
    const profiles = heroes.map((hero) => heroCombatProfile(hero, context));
    const hasSustain = profiles.some((profile) => profile.sustain >= 44);
    const hasControl = profiles.some((profile) => profile.control >= 36);
    const hasProtection = profiles.some((profile) => profile.protection >= 40);

    return offenseBalance * 46
      + Math.min(42, defense / heroes.length * 0.22)
      + Math.min(26, speed / heroes.length * 0.13)
      + (frontDefense >= 88 ? 36 : -Math.max(0, 82 - frontDefense) * 1.6)
      + (campDistance >= 4 ? 26 : -Math.max(0, 3 - campDistance) * 28)
      + (hasFastUnit ? 18 : 0)
      + (hasSustain ? 24 : 0)
      + (hasControl ? 18 : 0)
      + (hasProtection ? 16 : 0);
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

  function buildScoringContext(sourceSkills = []) {
    const skillById = new Map();
    const addSkill = (skill) => {
      if (skill?.id && !skillById.has(skill.id)) skillById.set(skill.id, skill);
    };
    (global.STZB_SEED_DATA?.SKILLS || []).forEach(addSkill);
    sourceSkills.forEach(addSkill);
    return { skillById };
  }

  function heroInnateFitBonus(hero, position, context) {
    const innate = context.skillById?.get(hero?.innate);
    if (!innate) return 0;
    const profile = skillProfile(innate);
    const expectation = skillExpectedValues(innate, hero, profile);
    return skillRoleFit(profile, normalizedTrigger(innate), position?.id) * 0.72
      + positionedExpectationScore(expectation, position?.id) * 0.56
      + skillTeamFitBonus(innate, hero, position, profile, expectation, context) * 0.44;
  }

  function lineupCombatPlanScore(heroes, slots, context) {
    const profiles = heroes.map((hero) => heroCombatProfile(hero, context));
    const totals = profiles.reduce((acc, profile) => {
      acc.damage += profile.damageThreat;
      acc.sustain += profile.sustain;
      acc.control += profile.control;
      acc.support += profile.support + profile.amplify;
      acc.defense += profile.protection;
      acc.range += profile.range;
      return acc;
    }, { damage: 0, sustain: 0, control: 0, support: 0, defense: 0, range: 0 });
    const roleCoverage = roleCoverageScore(profiles);
    const campIndex = slots.findIndex((slot) => slot?.id === "camp");
    const frontIndex = slots.findIndex((slot) => slot?.id === "front");
    const campProfile = profiles[campIndex >= 0 ? campIndex : 0] || {};
    const frontProfile = profiles[frontIndex >= 0 ? frontIndex : profiles.length - 1] || {};
    const hasHighCeilingCarry = profiles.some((profile) => profile.damageThreat >= 150);
    const hasTeamSustain = totals.sustain >= 58;
    const hasOpeningPlan = totals.support + totals.control + totals.defense >= 116;

    return roleCoverage
      + Math.min(92, totals.damage * 0.18)
      + Math.min(54, totals.sustain * 0.22)
      + Math.min(48, totals.control * 0.24)
      + Math.min(50, totals.support * 0.18)
      + (campProfile.damageThreat >= 118 ? 28 : -Math.max(0, 90 - (campProfile.damageThreat || 0)) * 0.22)
      + (frontProfile.protection >= 48 || frontProfile.sustain >= 44 ? 24 : -18)
      + (hasHighCeilingCarry && totals.support >= 55 ? 36 : 0)
      + (hasTeamSustain && totals.defense >= 54 ? 24 : 0)
      + (hasOpeningPlan ? 22 : 0);
  }

  function roleCoverageScore(profiles) {
    const counts = {
      damage: profiles.filter((profile) => profile.damageThreat >= 90).length,
      sustain: profiles.filter((profile) => profile.sustain >= 44).length,
      control: profiles.filter((profile) => profile.control >= 36).length,
      support: profiles.filter((profile) => profile.support + profile.amplify >= 44).length,
      defense: profiles.filter((profile) => profile.protection >= 42).length,
    };
    return Object.entries(TEAM_ROLE_TARGETS).reduce((score, [role, target]) => {
      const have = counts[role] || 0;
      const missing = Math.max(0, target - have);
      const excess = Math.max(0, have - target);
      return score + Math.min(have, target) * 24 - missing * 18 - excess * 6;
    }, 0);
  }

  function heroCombatProfile(hero, context) {
    const stats = hero.stats || {};
    const attack = Number(stats.attack) || 0;
    const strategy = Number(stats.strategy) || 0;
    const defense = Number(stats.defense) || 0;
    const speed = Number(stats.speed) || 0;
    const distance = Number(hero.distance) || 0;
    const innate = context.skillById?.get(hero.innate);
    const innateProfile = innate ? skillProfile(innate) : {};
    const innateExpectation = innate ? skillExpectedValues(innate, hero, innateProfile) : emptyExpectation();
    const baseDamage = Math.max(attack, strategy) * 0.72
      + Math.min(attack, strategy) * 0.18
      + Math.max(0, distance - 2) * 18
      + speed * 0.08;
    const protection = defense * 0.42
      + speed * 0.1
      + (distance <= 2 ? 18 : 0)
      + innateExpectation.protection * 0.56;

    return {
      damageThreat: baseDamage + innateExpectation.damage * 0.44,
      sustain: innateExpectation.healing * 0.5,
      control: innateExpectation.control,
      support: innateExpectation.support,
      amplify: innateExpectation.amplify,
      protection,
      range: innateExpectation.range + (distance >= 4 ? 16 : 0),
    };
  }

  function skillExpectedValues(skill, hero, profile = skillProfile(skill)) {
    const stats = hero.stats || {};
    const attack = Number(stats.attack) || 0;
    const strategy = Number(stats.strategy) || 0;
    const defense = Number(stats.defense) || 0;
    const trigger = normalizedTrigger(skill);
    const reliability = triggerReliability(skill, trigger);
    const targetCount = estimatedTargetCount(skill, profile);
    const damageRate = estimatedDamageRate(skill, profile);
    const offense = profile.strategy && !profile.attack
      ? strategy
      : profile.attack && !profile.strategy
        ? attack
        : Math.max(attack, strategy) * 0.74 + Math.min(attack, strategy) * 0.26;
    const damage = profile.damage ? reliability * targetCount * damageRate * offense : 0;
    const healing = profile.sustain ? reliability * targetCount * (82 + strategy * 1.26) : 0;
    const control = profile.control ? reliability * targetCount * (trigger === "command" ? 78 : 58) : 0;
    const support = profile.support ? reliability * targetCount * (58 + strategy * 0.18) : 0;
    const protection = profile.defense ? reliability * targetCount * (44 + defense * 0.32) : 0;
    const amplify = profile.amplify ? reliability * targetCount * (70 + strategy * 0.22) : 0;
    const range = profile.range ? reliability * targetCount * 42 : 0;

    return { damage, healing, control, support, protection, amplify, range };
  }

  function emptyExpectation() {
    return { damage: 0, healing: 0, control: 0, support: 0, protection: 0, amplify: 0, range: 0 };
  }

  function skillExpectationScore(expectation) {
    return expectation.damage * 0.34
      + expectation.healing * 0.3
      + expectation.control * 0.72
      + expectation.support * 0.46
      + expectation.protection * 0.48
      + expectation.amplify * 0.58
      + expectation.range * 0.36;
  }

  function positionedExpectationScore(expectation, positionId) {
    if (positionId === "camp") {
      return expectation.damage * 0.42
        + expectation.healing * 0.14
        + expectation.control * 0.46
        + expectation.support * 0.34
        + expectation.protection * 0.16
        + expectation.amplify * 0.62
        + expectation.range * 0.42;
    }
    if (positionId === "front") {
      return expectation.damage * 0.18
        + expectation.healing * 0.34
        + expectation.control * 0.64
        + expectation.support * 0.3
        + expectation.protection * 0.62
        + expectation.amplify * 0.36
        + expectation.range * 0.18;
    }
    return skillExpectationScore(expectation);
  }

  function skillTeamFitBonus(skill, hero, position, profile, expectation, context) {
    const heroes = context.heroes || [];
    const assignments = context.assignments || [];
    const heroIndex = Number.isInteger(context.heroIndex) ? context.heroIndex : heroes.indexOf(hero);
    const currentHeroSkills = assignments[heroIndex] || [];
    const teamSkills = assignments.flat();
    const teamProfileCounts = skillProfileCounts(teamSkills);
    const heroProfileCounts = skillProfileCounts(currentHeroSkills);
    const teamProfiles = heroes.map((item) => heroCombatProfile(item, context));
    const alliedDamage = sum(teamProfiles, (item, index) => index === heroIndex ? 0 : item.damageThreat);
    const frontIndex = (context.positions || []).findIndex((slot) => slot?.id === "front");
    const frontHero = heroes[frontIndex >= 0 ? frontIndex : heroes.length - 1];
    const frontDefense = Number(frontHero?.stats?.defense) || 0;
    const hasShortRangeBackline = heroes.some((item, index) => index < 2 && Number(item.distance) <= 2);
    const roleNeed = (role) => Math.max(0, (TEAM_ROLE_TARGETS[role] || 1) - (teamProfileCounts[role] || 0));
    let score = 0;

    if (profile.damage) score += roleNeed("damage") * 16 + Math.min(38, expectation.damage * 0.08);
    if (profile.sustain) score += roleNeed("sustain") * 30 + (frontDefense < 88 ? 18 : 0);
    if (profile.control) score += roleNeed("control") * 24;
    if (profile.support) score += roleNeed("support") * 20 + Math.min(42, alliedDamage * 0.08);
    if (profile.defense) score += roleNeed("defense") * 18 + (position?.id === "front" ? 14 : 0);
    if (profile.range && hasShortRangeBackline) score += 24;
    if (profile.amplify && alliedDamage >= 160) score += 34;
    if (profile.sustain && heroProfileCounts.sustain) score -= 28;
    if ((profile.support || profile.defense || profile.control) && heroProfileCounts.support + heroProfileCounts.defense + heroProfileCounts.control >= 2) score -= 18;
    if (profile.damage && heroProfileCounts.damage >= 2) score -= 12;
    if (skill.id === hero.innate) score -= 120;

    return score;
  }

  function skillProfileCounts(skills) {
    return skills.reduce((counts, skill) => {
      const profile = skillProfile(skill);
      PROFILE_KEYS.forEach((key) => {
        if (profile[key]) counts[key] = (counts[key] || 0) + 1;
      });
      return counts;
    }, { damage: 0, sustain: 0, control: 0, support: 0, defense: 0, range: 0 });
  }

  function scoreSkillForHero(skill, hero, position, context = buildScoringContext()) {
    const stats = hero.stats || {};
    const attack = Number(stats.attack) || 0;
    const strategy = Number(stats.strategy) || 0;
    const heroDistance = Number(hero.distance) || 0;
    const grade = GRADE_SCORE[normalizeGrade(skill.grade)] || 60;
    const chance = Number(skill.chance) || chanceFromText(skill.probability) || 0;
    const trigger = normalizedTrigger(skill);
    const profile = skillProfile(skill);
    const expectation = skillExpectedValues(skill, hero, profile);
    const triggerScore = scoreTrigger(trigger, chance, profile);
    const statFit = skillStatFit(profile, { attack, strategy });
    const rangeFit = skillRangeFit(skill, heroDistance, position?.id);
    const roleFit = skillRoleFit(profile, trigger, position?.id);
    const armFit = skillArmFit(skill, hero);
    const expectationScore = skillExpectationScore(expectation);
    const teamFit = skillTeamFitBonus(skill, hero, position, profile, expectation, context);
    const conditionalFit = conditionalSkillFitBonus(skill, context);

    return grade + triggerScore + statFit + rangeFit + roleFit + armFit + expectationScore + teamFit + conditionalFit;
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

  function scoreTrigger(trigger, chance, profile) {
    if (trigger === "command") return 58 + (profile.control || profile.support ? 12 : 0);
    if (trigger === "passive") return 52 + (profile.defense ? 10 : 0);
    if (trigger === "pursuit") return 34 + (profile.attack ? 10 : 0);
    if (trigger === "active") return 26 + Math.min(34, chance * 68);
    return 18;
  }

  function skillProfile(skill) {
    const text = skillText(skill);
    const profile = {
      attack: /攻击|兵刃|追击|分兵|连击|反击|physical|attack|strike|assault|counter/i.test(text),
      strategy: /策略|谋略|火攻|妖术|恐慌|燃烧|灼烧|strategy|tactic|spell|burn/i.test(text),
      control: /犹豫|怯战|混乱|暴走|动摇|封锁|控制|disarm|silence|confusion|control|seal/i.test(text),
      defense: /规避|减伤|防御|援护|免疫|洞察|guard|evade|defense|mitigation|protect/i.test(text),
      support: /提高|提升|增益|攻击属性|谋略属性|速度属性|先手|净化|buff|boost|support|cleanse/i.test(text),
      sustain: /恢复|治疗|休整|急救|援军|heal|recover|sustain/i.test(text),
      range: /距离|射程|远攻|range|distance/i.test(text),
      area: /群体|全体|敌军.{0,3}体|我军.{0,3}体|multi|group|all/i.test(text),
      amplify: /伤害提高|造成.*提高|受到.*伤害.*提高|易伤|增伤|amplify|vulnerable|damage up/i.test(text),
    };
    profile.damage = profile.attack || profile.strategy;
    return profile;
  }

  function conditionalSkillFitBonus(skill, context) {
    const requiredNames = conditionalRequiredSkillNames(skill);
    if (!requiredNames.length) return 0;
    const activeNames = activeTeamSkillNames(context);
    if (requiredNames.some((name) => activeNames.has(name))) return 76;
    const availableNames = new Set((context.availableSkills || []).map((item) => item?.name).filter(Boolean));
    const hasAvailablePrerequisite = requiredNames.some((name) => availableNames.has(name));
    return hasAvailablePrerequisite ? -180 : -360;
  }

  function conditionalRequiredSkillNames(skill) {
    const text = skillText(skill);
    const names = [];
    const collect = (segment) => {
      const matched = segment.match(/【([^】]+)】/g) || [];
      matched.forEach((item) => {
        const name = item.slice(1, -1).trim();
        if (name) names.push(name);
      });
    };
    for (const match of text.matchAll(/发动((?:【[^】]+】)+)(?:时|后)/g)) {
      collect(match[1]);
    }
    for (const match of text.matchAll(/((?:【[^】]+】)+)发动(?:率|后|时)/g)) {
      collect(match[1]);
    }
    return [...new Set(names)];
  }

  function activeTeamSkillNames(context) {
    const names = new Set();
    const addSkillName = (skill) => {
      if (skill?.name) names.add(skill.name);
    };
    (context.assignments || []).flat().forEach(addSkillName);
    (context.heroes || []).forEach((hero) => addSkillName(context.skillById?.get(hero?.innate)));
    return names;
  }

  function skillText(skill) {
    return `${skill?.name || ""} ${skill?.type || ""} ${skill?.effect || ""} ${skill?.desc || ""} ${skill?.target || ""}`;
  }

  function triggerReliability(skill, trigger) {
    const chance = Number(skill.chance) || chanceFromText(skill.probability) || 0;
    if (trigger === "command" || trigger === "passive") return 1;
    if (trigger === "pursuit") return Math.max(0.18, chance || 0.4) * 0.88;
    if (trigger === "active") {
      const preparePenalty = Number(skill.prepareRounds) > 0 || /准备/.test(skillText(skill)) ? 0.74 : 1;
      return Math.max(0.16, chance || 0.35) * preparePenalty;
    }
    return Math.max(0.12, chance || 0.28);
  }

  function estimatedTargetCount(skill, profile) {
    const text = skillText(skill);
    const explicit = text.match(/(?:敌军|我军|友军|目标|targets?)\D{0,6}([123一二三])(?:个|名|体|人)?/i)?.[1];
    if (explicit) return numberFromToken(explicit);
    if (/全体|全军|all/i.test(text)) return 3;
    if (profile.area || /群体|multi|group/i.test(text)) return 2;
    return 1;
  }

  function estimatedDamageRate(skill, profile) {
    const text = skillText(skill);
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

  function numberFromToken(value) {
    if (value === "一") return 1;
    if (value === "二") return 2;
    if (value === "三") return 3;
    return Math.max(1, Math.min(3, Number(value) || 1));
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
    if (!soldierType || !arm || /全|无|不限|--|all/i.test(soldierType)) return 0;
    return soldierType.includes(arm) ? 28 : -140;
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
    chooseTeamSkills,
    chooseSkillsForHero,
    scoreHeroForPosition,
    scoreSkillForHero,
    usableHeroes,
    usableSkills,
    samplePool,
  });
})(globalThis);
