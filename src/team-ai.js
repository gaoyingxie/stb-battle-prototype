// Team recommendation helpers. Keep this standalone so guard teams and future
// roster suggestions can share the same scoring pipeline.
(function registerTeamAI(global) {
  const DEFAULT_SAMPLE_SIZE = 40;
  const DEFAULT_SKILL_GRADES = ["S", "A"];
  const DEFAULT_SKILLS_PER_HERO = 2;
  const POSITION_CANDIDATE_LIMIT = 18;
  const TOTAL_CANDIDATE_LIMIT = 54;
  const GRADE_SCORE = { S: 180, A: 135, B: 85, C: 45 };
  const DEFAULT_WEIGHTS = global.STZB_TEAM_AI_WEIGHTS;
  const PROFILE_KEYS = [
    "damage",
    "sustain",
    "control",
    "support",
    "defense",
    "range",
    "tempo",
    "deny",
    "debuff",
    "cleanse",
    "combo",
    "taunt",
    "splash",
  ];
  if (!DEFAULT_WEIGHTS) {
    throw new Error("STZB_TEAM_AI_WEIGHTS must be loaded before team-ai.js");
  }

  function resolveWeights(overrides = null) {
    return mergeWeights(DEFAULT_WEIGHTS, overrides);
  }

  function mergeWeights(base, overrides) {
    if (!overrides || typeof overrides !== "object") return base;
    if (!base || typeof base !== "object") return cloneWeight(overrides);
    const merged = Array.isArray(base) ? [...base] : { ...base };
    Object.entries(overrides).forEach(([key, value]) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        merged[key] = mergeWeights(base[key] || {}, value);
      } else {
        merged[key] = value;
      }
    });
    return merged;
  }

  function cloneWeight(value) {
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(cloneWeight);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneWeight(item)]));
  }

  function scoringWeights(context) {
    return context?.weights || DEFAULT_WEIGHTS;
  }

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
      weights: options.weights,
    });
  }

  function recommendTeam(options = {}) {
    const positions = options.positions || defaultPositions();
    const rng = options.rng || Math.random;
    const context = buildScoringContext(options.skills || [], { weights: options.weights });
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
    const plan = buildLineupScorePlan(heroes, slots, context);
    const candidates = lineupCandidates(heroes, slots, rng, context, plan);
    const fallback = bestDistinctHeroes(candidates, slots, rng, context, plan);
    let best = fallback;
    let bestScore = -Infinity;

    for (let a = 0; a < candidates.length; a += 1) {
      for (let b = 0; b < candidates.length; b += 1) {
        if (b === a) continue;
        for (let c = 0; c < candidates.length; c += 1) {
          if (c === a || c === b) continue;
          const candidate = [candidates[a], candidates[b], candidates[c]].slice(0, slots.length);
          const entries = candidate.map((hero) => plan.entries.get(hero));
          if (hasDuplicateIdentity(candidate, entries)) continue;
          const score = scoreLineup(candidate, slots, context, entries);
          if (score > bestScore || (score === bestScore && randomTie(rng) > 0)) {
            best = candidate;
            bestScore = score;
          }
        }
      }
    }

    return best;
  }

  function buildLineupScorePlan(heroes, slots, context) {
    const positionKeys = new Map();
    [...slots, { id: "camp" }, { id: "middle" }, { id: "front" }].forEach((position) => {
      positionKeys.set(positionKey(position), position);
    });
    const entries = new Map();
    heroes.forEach((hero) => {
      const positionScores = new Map();
      positionKeys.forEach((position, key) => {
        positionScores.set(key, scoreHeroForPosition(hero, position, context));
      });
      entries.set(hero, {
        hero,
        identityKey: heroIdentityKey(hero),
        combatProfile: heroCombatProfile(hero, context),
        positionScores,
        totalScore: Math.max(
          positionScores.get("camp") ?? scoreHeroForPosition(hero, { id: "camp" }, context),
          positionScores.get("middle") ?? scoreHeroForPosition(hero, { id: "middle" }, context),
          positionScores.get("front") ?? scoreHeroForPosition(hero, { id: "front" }, context),
        ),
      });
    });
    return { entries };
  }

  function positionKey(position) {
    return position?.id || "";
  }

  function lineupEntryPositionScore(entry, hero, position, context) {
    if (entry?.positionScores?.has(positionKey(position))) return entry.positionScores.get(positionKey(position));
    return scoreHeroForPosition(entry?.hero || hero, position, context);
  }

  function rankedHeroes(heroes, scoreForHero, rng) {
    return heroes
      .map((hero) => ({ hero, score: scoreForHero(hero) }))
      .sort((a, b) => b.score - a.score || randomTie(rng))
      .map((entry) => entry.hero);
  }

  function lineupCandidates(heroes, slots, rng, context, plan = buildLineupScorePlan(heroes, slots, context)) {
    const ranked = new Map();
    slots.forEach((position) => {
      rankedHeroes(heroes, (hero) => lineupEntryPositionScore(plan.entries.get(hero), hero, position, context), rng)
        .slice(0, POSITION_CANDIDATE_LIMIT)
        .forEach((hero) => ranked.set(hero.id, hero));
    });
    rankedHeroes(heroes, (hero) => plan.entries.get(hero)?.totalScore ?? heroTotalScore(hero, context), rng)
      .slice(0, POSITION_CANDIDATE_LIMIT)
      .forEach((hero) => ranked.set(hero.id, hero));
    return rankedHeroes([...ranked.values()], (hero) => plan.entries.get(hero)?.totalScore ?? heroTotalScore(hero, context), rng)
      .slice(0, TOTAL_CANDIDATE_LIMIT);
  }

  function bestDistinctHeroes(heroes, slots, rng, context, plan = buildLineupScorePlan(heroes, slots, context)) {
    const picked = [];
    const used = new Set();
    slots.forEach((position) => {
      const hero = rankedHeroes(
        heroes.filter((candidate) => !used.has(plan.entries.get(candidate)?.identityKey || heroIdentityKey(candidate))),
        (candidate) => lineupEntryPositionScore(plan.entries.get(candidate), candidate, position, context),
        rng,
      )[0];
      if (hero) {
        picked.push(hero);
        used.add(plan.entries.get(hero)?.identityKey || heroIdentityKey(hero));
      }
    });
    return picked;
  }

  function scoreLineup(heroes, slots, context, entries = null) {
    const positionScore = heroes.reduce((sum, hero, index) => {
      const score = entries
        ? lineupEntryPositionScore(entries[index], hero, slots[index], context)
        : scoreHeroForPosition(hero, slots[index], context);
      return sum + score;
    }, 0);
    return positionScore
      + synergyScore(heroes, context, entries)
      + teamBalanceScore(heroes, slots, context, entries)
      + lineupCombatPlanScore(heroes, slots, context, entries);
  }

  function chooseTeamSkills(heroes, positions, skills, options = {}) {
    const count = options.count || DEFAULT_SKILLS_PER_HERO;
    const rng = options.rng || Math.random;
    const context = {
      ...(options.context || buildScoringContext(skills)),
      availableSkills: skills,
    };
    context.heroProfiles = heroes.map((hero) => heroCombatProfile(hero, context));
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
      ...buildScoringContext(skills, { weights: options.weights }),
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
    const allWeights = scoringWeights(context);
    const weights = allWeights.positionWeights[position?.id] || allWeights.positionWeights.middle;
    const heroWeights = allWeights.hero;
    const stats = hero.stats || {};
    const attack = Number(stats.attack) || 0;
    const strategy = Number(stats.strategy) || 0;
    const defense = Number(stats.defense) || 0;
    const speed = Number(stats.speed) || 0;
    const distance = Number(hero.distance) || 0;
    const rarity = Number(hero.rarity) || 0;
    const primaryOffense = Math.max(attack, strategy);
    const secondaryOffense = Math.min(attack, strategy);
    const hybridValue = primaryOffense * heroWeights.hybridPrimary + secondaryOffense * heroWeights.hybridSecondary;
    const roleBonus = roleFitBonus({ attack, strategy, defense, speed, distance }, weights.role, heroWeights);
    const distanceScore = rangeFitScore(distance, position?.id, weights, heroWeights);
    const innateFit = heroInnateFitBonus(hero, position, context);

    return rarity * heroWeights.rarity
      + attack * weights.attack
      + strategy * weights.strategy
      + defense * weights.defense
      + speed * weights.speed
      + hybridValue
      + distanceScore
      + roleBonus
      + innateFit;
  }

  function roleFitBonus(stats, role, heroWeights) {
    const weights = heroWeights.roleFit;
    if (role === "backline") {
      const damageCeiling = Math.max(stats.attack, stats.strategy);
      return Math.max(0, damageCeiling - weights.backlineDamageThreshold) * weights.backlineDamageScale
        + Math.max(0, stats.distance - 3) * weights.backlineLongDistance
        - Math.max(0, 3 - stats.distance) * weights.backlineShortDistancePenalty;
    }
    if (role === "vanguard") {
      return Math.max(0, stats.defense - weights.vanguardDefenseThreshold) * weights.vanguardDefenseScale
        + Math.max(0, stats.speed - weights.vanguardSpeedThreshold) * weights.vanguardSpeedScale
        - Math.max(0, weights.vanguardLowDefenseThreshold - stats.defense) * weights.vanguardLowDefensePenalty;
    }
    return Math.max(0, stats.attack - weights.flexAttackThreshold) * weights.flexAttackScale
      + Math.max(0, stats.strategy - weights.flexStrategyThreshold) * weights.flexStrategyScale
      + Math.max(0, stats.defense - weights.flexDefenseThreshold) * weights.flexDefenseScale
      + Math.max(0, stats.speed - weights.flexSpeedThreshold) * weights.flexSpeedScale;
  }

  function rangeFitScore(distance, positionId, weights, heroWeights) {
    if (!distance) return heroWeights.missingDistancePenalty;
    const weighted = distance * weights.distance;
    if (positionId === "camp") return weighted - Math.max(0, 4 - distance) * weights.shortRangePenalty;
    if (positionId === "middle") return weighted - Math.max(0, 3 - distance) * weights.shortRangePenalty;
    return weighted + (distance <= 2 ? heroWeights.frontShortDistanceBonus : 0);
  }

  function heroTotalScore(hero, context = buildScoringContext()) {
    return Math.max(
      scoreHeroForPosition(hero, { id: "camp" }, context),
      scoreHeroForPosition(hero, { id: "middle" }, context),
      scoreHeroForPosition(hero, { id: "front" }, context),
    );
  }

  function preparedCombatProfiles(heroes, context, entries = null) {
    return entries
      ? entries.map((entry, index) => entry?.combatProfile || heroCombatProfile(heroes[index], context))
      : heroes.map((hero) => heroCombatProfile(hero, context));
  }

  function synergyScore(heroes, context = buildScoringContext(), entries = null) {
    const weights = scoringWeights(context).synergy;
    const factionCounts = countBy(heroes, "faction");
    const armCounts = countBy(heroes, "arm");
    const sameFaction = Math.max(0, ...Object.values(factionCounts));
    const sameArm = Math.max(0, ...Object.values(armCounts));
    const profiles = preparedCombatProfiles(heroes, context, entries);
    const damageThreat = sum(profiles, (profile) => profile.damageThreat);
    const supportPressure = sum(profiles, (profile) =>
      profile.support + profile.amplify + profile.debuff * weights.supportDebuff + profile.tempo * weights.supportTempo
    );
    const rangeSupport = sum(profiles, (profile) => profile.range);
    const tempoPressure = sum(profiles, (profile) => profile.tempo);
    const shortRangeBackline = heroes.some((hero, index) => index < 2 && Number(hero.distance) <= 2);
    const hasCarry = profiles.some((profile) => profile.damageThreat >= weights.carryThreshold);
    const supportCarryLink = hasCarry ? Math.min(weights.supportCarryCap, supportPressure * weights.supportCarryScale) : 0;
    const rangeLink = shortRangeBackline ? Math.min(weights.rangeCap, rangeSupport * weights.rangeScale) : 0;
    const tempoLink = hasCarry ? Math.min(weights.tempoCap, tempoPressure * weights.tempoScale) : 0;
    return Math.max(0, sameFaction - 1) * weights.sameFaction
      + Math.max(0, sameArm - 1) * weights.sameArm
      + supportCarryLink
      + rangeLink
      + tempoLink
      + Math.min(weights.pressureCap, damageThreat * supportPressure * weights.pressureScale);
  }

  function teamBalanceScore(heroes, slots, context = buildScoringContext(), entries = null) {
    if (!heroes.length) return 0;
    const weights = scoringWeights(context).balance;
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
    const hasFastUnit = heroes.some((hero) => Number(hero.stats?.speed) >= weights.fastSpeedThreshold);
    const profiles = preparedCombatProfiles(heroes, context, entries);
    const hasSustain = profiles.some((profile) => profile.sustain >= weights.sustainThreshold);
    const hasControl = profiles.some((profile) => profile.control + profile.deny >= weights.controlThreshold);
    const hasProtection = profiles.some((profile) => profile.protection >= weights.protectionThreshold);
    const hasTempo = profiles.some((profile) => profile.tempo >= weights.tempoThreshold);
    const hasDebuff = profiles.some((profile) => profile.debuff >= weights.debuffThreshold);

    return offenseBalance * weights.offenseBalance
      + Math.min(weights.defenseCap, defense / heroes.length * weights.defenseScale)
      + Math.min(weights.speedCap, speed / heroes.length * weights.speedScale)
      + (frontDefense >= weights.frontDefenseThreshold ? weights.frontDefenseBonus : -Math.max(0, weights.frontLowDefenseThreshold - frontDefense) * weights.frontLowDefensePenalty)
      + (campDistance >= weights.campDistanceThreshold ? weights.campDistanceBonus : -Math.max(0, weights.campShortDistanceThreshold - campDistance) * weights.campShortDistancePenalty)
      + (hasFastUnit ? weights.fastBonus : 0)
      + (hasSustain ? weights.sustainBonus : 0)
      + (hasControl ? weights.controlBonus : 0)
      + (hasProtection ? weights.protectionBonus : 0)
      + (hasTempo ? weights.tempoBonus : 0)
      + (hasDebuff ? weights.debuffBonus : 0);
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

  function hasDuplicateIdentity(heroes, entries = null) {
    const seen = new Set();
    return heroes.some((hero, index) => {
      const key = entries?.[index]?.identityKey || heroIdentityKey(hero);
      if (seen.has(key)) return true;
      seen.add(key);
      return false;
    });
  }

  function heroIdentityKey(hero) {
    return [hero?.name || hero?.id, hero?.faction || "", hero?.arm || ""].join("|");
  }

  function buildScoringContext(sourceSkills = [], options = {}) {
    const skillById = new Map();
    const addSkill = (skill) => {
      if (skill?.id && !skillById.has(skill.id)) skillById.set(skill.id, skill);
    };
    (global.STZB_SEED_DATA?.SKILLS || []).forEach(addSkill);
    sourceSkills.forEach(addSkill);
    return {
      skillById,
      weights: resolveWeights(options.weights),
    };
  }

  function heroInnateFitBonus(hero, position, context) {
    const weights = scoringWeights(context).innateFit;
    const innate = context.skillById?.get(hero?.innate);
    if (!innate) return 0;
    const profile = skillProfile(innate);
    const expectation = skillExpectedValues(innate, hero, profile, context);
    return skillRoleFit(profile, normalizedTrigger(innate), position?.id) * weights.role
      + positionedExpectationScore(expectation, position?.id, context) * weights.positionedExpectation
      + skillTeamFitBonus(innate, hero, position, profile, expectation, context) * weights.teamFit;
  }

  function lineupCombatPlanScore(heroes, slots, context, entries = null) {
    const weights = scoringWeights(context).plan;
    const profiles = preparedCombatProfiles(heroes, context, entries);
    const totals = profiles.reduce((acc, profile) => {
      acc.damage += profile.damageThreat;
      acc.sustain += profile.sustain;
      acc.control += profile.control + profile.deny * 0.62;
      acc.support += profile.support + profile.amplify + profile.debuff * 0.5 + profile.tempo * 0.35 + profile.cleanse * 0.32;
      acc.defense += profile.protection;
      acc.range += profile.range;
      acc.tempo += profile.tempo;
      acc.debuff += profile.debuff;
      return acc;
    }, { damage: 0, sustain: 0, control: 0, support: 0, defense: 0, range: 0, tempo: 0, debuff: 0 });
    const roleCoverage = roleCoverageScore(profiles, context);
    const campIndex = slots.findIndex((slot) => slot?.id === "camp");
    const frontIndex = slots.findIndex((slot) => slot?.id === "front");
    const campProfile = profiles[campIndex >= 0 ? campIndex : 0] || {};
    const frontProfile = profiles[frontIndex >= 0 ? frontIndex : profiles.length - 1] || {};
    const hasHighCeilingCarry = profiles.some((profile) => profile.damageThreat >= weights.highCarryThreshold);
    const hasTeamSustain = totals.sustain >= weights.teamSustainThreshold;
    const hasOpeningPlan = totals.support + totals.control + totals.defense + totals.tempo + totals.debuff >= weights.openingPlanThreshold;

    return roleCoverage
      + Math.min(weights.totalDamageCap, totals.damage * weights.totalDamageScale)
      + Math.min(weights.sustainCap, totals.sustain * weights.sustainScale)
      + Math.min(weights.controlCap, totals.control * weights.controlScale)
      + Math.min(weights.supportCap, totals.support * weights.supportScale)
      + Math.min(weights.tempoCap, totals.tempo * weights.tempoScale)
      + Math.min(weights.debuffCap, totals.debuff * weights.debuffScale)
      + (campProfile.damageThreat >= weights.campDamageThreshold ? weights.campDamageBonus : -Math.max(0, weights.campLowDamageThreshold - (campProfile.damageThreat || 0)) * weights.campLowDamagePenalty)
      + (frontProfile.protection >= weights.frontProtectionThreshold || frontProfile.sustain >= weights.frontSustainThreshold ? weights.frontPlanBonus : -weights.frontPlanPenalty)
      + (hasHighCeilingCarry && totals.support >= weights.carrySupportThreshold ? weights.carrySupportBonus : 0)
      + (hasTeamSustain && totals.defense >= weights.teamDefenseThreshold ? weights.teamSustainDefenseBonus : 0)
      + (hasOpeningPlan ? weights.openingPlanBonus : 0);
  }

  function roleCoverageScore(profiles, context) {
    const weights = scoringWeights(context);
    const roleTargets = weights.roleTargets;
    const planWeights = weights.plan;
    const counts = {
      damage: profiles.filter((profile) => profile.damageThreat >= 90).length,
      sustain: profiles.filter((profile) => profile.sustain >= 44).length,
      control: profiles.filter((profile) => profile.control + profile.deny >= 36).length,
      support: profiles.filter((profile) =>
        profile.support + profile.amplify + profile.debuff + profile.tempo + profile.cleanse >= 44
      ).length,
      defense: profiles.filter((profile) => profile.protection + profile.cleanse * 0.36 >= 42).length,
    };
    return Object.entries(roleTargets).reduce((score, [role, target]) => {
      const have = counts[role] || 0;
      const missing = Math.max(0, target - have);
      const excess = Math.max(0, have - target);
      return score + Math.min(have, target) * planWeights.roleCoverageHit - missing * planWeights.roleCoverageMissingPenalty - excess * planWeights.roleCoverageExcessPenalty;
    }, 0);
  }

  function heroCombatProfile(hero, context) {
    const weights = scoringWeights(context).combatProfile;
    const stats = hero.stats || {};
    const attack = Number(stats.attack) || 0;
    const strategy = Number(stats.strategy) || 0;
    const defense = Number(stats.defense) || 0;
    const speed = Number(stats.speed) || 0;
    const distance = Number(hero.distance) || 0;
    const innate = context.skillById?.get(hero.innate);
    const innateProfile = innate ? skillProfile(innate) : {};
    const innateExpectation = innate ? skillExpectedValues(innate, hero, innateProfile, context) : emptyExpectation();
    const baseDamage = Math.max(attack, strategy) * weights.damagePrimary
      + Math.min(attack, strategy) * weights.damageSecondary
      + Math.max(0, distance - 2) * weights.distanceScale
      + speed * weights.speedDamage;
    const protection = defense * weights.defenseProtection
      + speed * weights.speedProtection
      + (distance <= 2 ? weights.shortDistanceProtection : 0)
      + innateExpectation.protection * weights.innateProtection;

    return {
      damageThreat: baseDamage + innateExpectation.damage * weights.innateDamage + innateExpectation.splash * weights.innateSplash + innateExpectation.tempo * weights.innateTempoDamage,
      sustain: innateExpectation.healing * weights.innateHealing,
      control: innateExpectation.control + innateExpectation.deny * weights.innateDenyControl,
      support: innateExpectation.support + innateExpectation.tempo * weights.innateTempoSupport + innateExpectation.cleanse * weights.innateCleanseSupport,
      amplify: innateExpectation.amplify + innateExpectation.debuff * weights.innateDebuffAmplify,
      protection: protection + innateExpectation.cleanse * weights.innateCleanseProtection,
      range: innateExpectation.range + (distance >= 4 ? weights.longRangeSupport : 0),
      tempo: innateExpectation.tempo,
      deny: innateExpectation.deny,
      debuff: innateExpectation.debuff,
      cleanse: innateExpectation.cleanse,
    };
  }

  function skillExpectedValues(skill, hero, profile = skillProfile(skill), context = buildScoringContext()) {
    const stats = hero.stats || {};
    const attack = Number(stats.attack) || 0;
    const strategy = Number(stats.strategy) || 0;
    const defense = Number(stats.defense) || 0;
    const speed = Number(stats.speed) || 0;
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
    const tempo = profile.tempo ? reliability * targetCount * (42 + speed * 0.24 + (profile.combo ? attack * 0.16 : 0)) : 0;
    const deny = profile.deny ? reliability * targetCount * (62 + strategy * 0.16) : 0;
    const debuff = profile.debuff ? reliability * targetCount * (52 + strategy * 0.22) : 0;
    const cleanse = profile.cleanse ? reliability * targetCount * (48 + strategy * 0.16) : 0;
    const splash = profile.splash ? reliability * Math.max(1.4, targetCount) * Math.max(0.36, damageRate) * Math.max(strategy, offense * 0.72) * 0.5 : 0;

    return { damage, healing, control, support, protection, amplify, range, tempo, deny, debuff, cleanse, splash };
  }

  function emptyExpectation() {
    return {
      damage: 0,
      healing: 0,
      control: 0,
      support: 0,
      protection: 0,
      amplify: 0,
      range: 0,
      tempo: 0,
      deny: 0,
      debuff: 0,
      cleanse: 0,
      splash: 0,
    };
  }

  function skillExpectationScore(expectation, context = buildScoringContext()) {
    const weights = scoringWeights(context).skillExpectation;
    return expectation.damage * weights.damage
      + expectation.healing * weights.healing
      + expectation.control * weights.control
      + expectation.support * weights.support
      + expectation.protection * weights.protection
      + expectation.amplify * weights.amplify
      + expectation.range * weights.range
      + expectation.tempo * weights.tempo
      + expectation.deny * weights.deny
      + expectation.debuff * weights.debuff
      + expectation.cleanse * weights.cleanse
      + expectation.splash * weights.splash;
  }

  function positionedExpectationScore(expectation, positionId, context = buildScoringContext()) {
    const positionedWeights = scoringWeights(context).positionedExpectation;
    if (positionId === "camp") {
      const weights = positionedWeights.camp;
      return expectation.damage * weights.damage
        + expectation.healing * weights.healing
        + expectation.control * weights.control
        + expectation.support * weights.support
        + expectation.protection * weights.protection
        + expectation.amplify * weights.amplify
        + expectation.range * weights.range
        + expectation.tempo * weights.tempo
        + expectation.deny * weights.deny
        + expectation.debuff * weights.debuff
        + expectation.cleanse * weights.cleanse
        + expectation.splash * weights.splash;
    }
    if (positionId === "front") {
      const weights = positionedWeights.front;
      return expectation.damage * weights.damage
        + expectation.healing * weights.healing
        + expectation.control * weights.control
        + expectation.support * weights.support
        + expectation.protection * weights.protection
        + expectation.amplify * weights.amplify
        + expectation.range * weights.range
        + expectation.tempo * weights.tempo
        + expectation.deny * weights.deny
        + expectation.debuff * weights.debuff
        + expectation.cleanse * weights.cleanse
        + expectation.splash * weights.splash;
    }
    return skillExpectationScore(expectation, context);
  }

  function skillTeamFitBonus(skill, hero, position, profile, expectation, context) {
    const weights = scoringWeights(context).skillTeamFit;
    const roleTargets = scoringWeights(context).roleTargets;
    const heroes = context.heroes || [];
    const assignments = context.assignments || [];
    const heroIndex = Number.isInteger(context.heroIndex) ? context.heroIndex : heroes.indexOf(hero);
    const currentHeroSkills = assignments[heroIndex] || [];
    const teamSkills = assignments.flat();
    const teamProfileCounts = skillProfileCounts(teamSkills);
    const heroProfileCounts = skillProfileCounts(currentHeroSkills);
    const teamProfiles = context.heroProfiles || heroes.map((item) => heroCombatProfile(item, context));
    const alliedDamage = sum(teamProfiles, (item, index) => index === heroIndex ? 0 : item.damageThreat);
    const alliedTempo = sum(teamProfiles, (item, index) => index === heroIndex ? 0 : item.tempo);
    const frontIndex = (context.positions || []).findIndex((slot) => slot?.id === "front");
    const frontHero = heroes[frontIndex >= 0 ? frontIndex : heroes.length - 1];
    const frontDefense = Number(frontHero?.stats?.defense) || 0;
    const stats = hero.stats || {};
    const attack = Number(stats.attack) || 0;
    const strategy = Number(stats.strategy) || 0;
    const defense = Number(stats.defense) || 0;
    const speed = Number(stats.speed) || 0;
    const hasShortRangeBackline = heroes.some((item, index) => index < 2 && Number(item.distance) <= 2);
    const roleNeed = (role) => Math.max(0, (roleTargets[role] || 1) - (teamProfileCounts[role] || 0));
    let score = 0;

    if (profile.damage) score += roleNeed("damage") * weights.damageNeed + Math.min(weights.damageCap, expectation.damage * weights.damageExpectationScale);
    if (profile.sustain) score += roleNeed("sustain") * weights.sustainNeed + (frontDefense < weights.sustainLowFrontDefenseThreshold ? weights.sustainLowFrontDefenseBonus : 0);
    if (profile.control) score += roleNeed("control") * weights.controlNeed;
    if (profile.support) score += roleNeed("support") * weights.supportNeed + Math.min(weights.supportAlliedDamageCap, alliedDamage * weights.supportAlliedDamageScale);
    if (profile.defense) score += roleNeed("defense") * weights.defenseNeed + (position?.id === "front" ? weights.defenseFrontBonus : 0);
    if (profile.range && hasShortRangeBackline) score += weights.rangeShortBacklineBonus;
    if (profile.amplify && alliedDamage >= weights.amplifyAlliedDamageThreshold) score += weights.amplifyBonus;
    if (profile.tempo) score += (teamProfileCounts.tempo ? -weights.tempoDuplicatePenalty : weights.tempoFirstBonus) + Math.min(weights.tempoStatCap, (speed + (profile.combo ? attack : 0)) * weights.tempoStatScale);
    if (profile.combo) score += Math.min(weights.comboAttackCap, attack * weights.comboAttackScale) + (position?.id === "front" ? weights.comboFrontBonus : 0);
    if (profile.taunt) score += (position?.id === "front" ? weights.tauntFrontBonus : -weights.tauntBacklinePenalty) + Math.min(weights.tauntDefenseCap, defense * weights.tauntDefenseScale);
    if (profile.deny) score += Math.max(roleNeed("control"), roleNeed("deny")) * weights.denyNeed + (alliedDamage >= weights.denyAlliedDamageThreshold ? weights.denyAlliedDamageBonus : 0);
    if (profile.debuff) score += roleNeed("support") * weights.debuffSupportNeed + Math.min(weights.debuffAlliedDamageCap, alliedDamage * weights.debuffAlliedDamageScale) + (strategy >= weights.debuffHighStrategyThreshold ? weights.debuffHighStrategyBonus : 0);
    if (profile.cleanse) score += roleNeed("defense") * weights.cleanseDefenseNeed + (frontDefense < weights.cleanseLowFrontDefenseThreshold ? weights.cleanseLowFrontDefenseBonus : 0);
    if (profile.splash) score += Math.min(weights.splashCap, (strategy + alliedDamage + alliedTempo) * weights.splashScale);
    if (profile.sustain && heroProfileCounts.sustain) score -= weights.duplicateSustainPenalty;
    if ((profile.support || profile.defense || profile.control) && heroProfileCounts.support + heroProfileCounts.defense + heroProfileCounts.control >= 2) score -= weights.crowdedUtilityPenalty;
    if (profile.damage && heroProfileCounts.damage >= 2) score -= weights.duplicateDamagePenalty;
    if ((profile.deny || profile.debuff || profile.cleanse) && heroProfileCounts.deny + heroProfileCounts.debuff + heroProfileCounts.cleanse >= 2) score -= weights.crowdedDebuffPenalty;
    if (skill.id === hero.innate) score -= weights.innateDuplicatePenalty;

    return score;
  }

  function skillProfileCounts(skills) {
    const initialCounts = PROFILE_KEYS.reduce((counts, key) => {
      counts[key] = 0;
      return counts;
    }, {});
    return skills.reduce((counts, skill) => {
      const profile = skillProfile(skill);
      PROFILE_KEYS.forEach((key) => {
        if (profile[key]) counts[key] = (counts[key] || 0) + 1;
      });
      return counts;
    }, initialCounts);
  }

  function scoreSkillForHero(skill, hero, position, context = buildScoringContext()) {
    const stats = hero.stats || {};
    const attack = Number(stats.attack) || 0;
    const strategy = Number(stats.strategy) || 0;
    const defense = Number(stats.defense) || 0;
    const speed = Number(stats.speed) || 0;
    const heroDistance = Number(hero.distance) || 0;
    const grade = GRADE_SCORE[normalizeGrade(skill.grade)] || 60;
    const chance = Number(skill.chance) || chanceFromText(skill.probability) || 0;
    const trigger = normalizedTrigger(skill);
    const profile = skillProfile(skill);
    const expectation = skillExpectedValues(skill, hero, profile, context);
    const triggerScore = scoreTrigger(trigger, chance, profile);
    const statFit = skillStatFit(profile, { attack, strategy, defense, speed });
    const rangeFit = skillRangeFit(skill, heroDistance, position?.id);
    const roleFit = skillRoleFit(profile, trigger, position?.id);
    const armFit = skillArmFit(skill, hero);
    const expectationScore = skillExpectationScore(expectation, context);
    const teamFit = skillTeamFitBonus(skill, hero, position, profile, expectation, context);
    const conditionalFit = conditionalSkillFitBonus(skill, context);

    return grade + triggerScore + statFit + rangeFit + roleFit + armFit + expectationScore + teamFit + conditionalFit;
  }

  function normalizedTrigger(skill) {
    const taxonomy = skillTaxonomy(skill);
    if (taxonomy?.trigger) return taxonomy.trigger;

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
    if (trigger === "command") return 58 + (profile.control || profile.support || profile.debuff || profile.deny || profile.tempo || profile.range ? 12 : 0);
    if (trigger === "passive") return 52 + (profile.defense || profile.taunt || profile.combo ? 10 : 0);
    if (trigger === "pursuit") return 34 + (profile.attack || profile.combo ? 10 : 0);
    if (trigger === "active") return 26 + Math.min(34, chance * 68);
    return 18;
  }

  function skillTaxonomy(skill) {
    const taxonomy = global.STZB_SKILL_TAXONOMY;
    if (taxonomy?.profileFor) return taxonomy.profileFor(skill);
    if (skill?.aiTaxonomy || skill?.aiProfile) {
      return {
        profile: skill.aiProfile || {},
        targetCount: skill.aiTaxonomy?.targetCount,
        damageRate: skill.aiTaxonomy?.damageRate,
        requiredSkillNames: skill.aiTaxonomy?.requiredSkillNames || [],
        trigger: skill.aiTaxonomy?.trigger,
        reliability: skill.aiTaxonomy?.reliability,
      };
    }
    return null;
  }

  function skillProfile(skill) {
    const taxonomy = skillTaxonomy(skill);
    if (taxonomy?.profile) {
      const profile = { ...taxonomy.profile };
      profile.damage = Boolean(profile.damage || profile.attack || profile.strategy || profile.splash);
      return profile;
    }

    const text = skillText(skill);
    const combo = /连击|再次普通攻击|普通攻击.*再次|combo/i.test(text);
    const taunt = /挑衅|taunt/i.test(text);
    const deny = /禁疗|不可回复|无法回复|无法恢复|不能恢复|heal.?block|anti.?heal/i.test(text);
    const debuff = /属性降低|降低.{0,8}(?:攻击|防御|谋略|速度|属性)|(?:攻击|防御|谋略|速度|属性).{0,8}降低|削弱|受到.*伤害.*提高|伤害.*提高.*受到|易伤|vulnerable|debuff/i.test(text);
    const cleanse = /净化|镇静|看破|清除.{0,6}有害|移除.{0,6}有害|解除.{0,6}有害|cleanse|purify|dispel/i.test(text);
    const tempo = combo || /先手|优先行动|发动率提高|再次发动|跳过.*准备|准备.{0,4}(?:减少|缩短)|无需准备|tempo|initiative/i.test(text);
    const splash = /策略溅射|溅射|相邻|额外造成一次策略伤害|splash/i.test(text);
    const attack = /兵刃|追击|分兵|连击|反击|普通攻击|攻击伤害|发动(?![^，。；,.;]*策略)[^，。；,.;]*攻击|attack damage|physical|strike|assault|counter/i.test(text);
    const profile = {
      attack,
      strategy: /策略|谋略|火攻|妖术|恐慌|燃烧|灼烧|strategy|tactic|spell|burn/i.test(text),
      control: /犹豫|怯战|混乱|暴走|动摇|封锁|控制|挑衅|disarm|silence|confusion|control|seal|taunt/i.test(text),
      defense: /规避|减伤|防御|援护|免疫|洞察|镇静|看破|净化|清除.{0,6}有害|移除.{0,6}有害|guard|evade|defense|mitigation|protect/i.test(text),
      support: /提高|提升|增益|攻击属性|谋略属性|速度属性|先手|净化|镇静|看破|buff|boost|support|cleanse/i.test(text),
      sustain: /恢复|治疗|休整|急救|援军|heal|recover|sustain/i.test(text),
      range: /距离|射程|远攻|战法有效距离|攻击距离|range|distance/i.test(text),
      area: /群体|全体|敌军.{0,3}体|我军.{0,3}体|multi|group|all/i.test(text),
      amplify: /伤害提高|造成.*提高|受到.*伤害.*提高|易伤|增伤|amplify|vulnerable|damage up/i.test(text),
      tempo,
      deny,
      debuff,
      cleanse,
      combo,
      taunt,
      splash,
    };
    profile.damage = profile.attack || profile.strategy || profile.splash;
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
    const taxonomy = skillTaxonomy(skill);
    if (Array.isArray(taxonomy?.requiredSkillNames)) return [...taxonomy.requiredSkillNames];

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
    const taxonomy = skillTaxonomy(skill);
    if (Number.isFinite(Number(taxonomy?.reliability))) return Number(taxonomy.reliability);

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
    const taxonomy = skillTaxonomy(skill);
    if (Number.isFinite(Number(taxonomy?.targetCount))) return Number(taxonomy.targetCount);

    const text = skillText(skill);
    const explicit = text.match(/(?:敌军|我军|友军|目标|targets?)\D{0,6}([123一二三])(?:个|名|体|人)?/i)?.[1];
    if (explicit) return numberFromToken(explicit);
    if (/全体|全军|all/i.test(text)) return 3;
    if (profile.area || /群体|multi|group/i.test(text)) return 2;
    return 1;
  }

  function estimatedDamageRate(skill, profile) {
    const taxonomy = skillTaxonomy(skill);
    if (Number.isFinite(Number(taxonomy?.damageRate))) return Number(taxonomy.damageRate);

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
    const attackFit = (profile.attack || profile.combo || profile.taunt) ? stats.attack * 0.18 : stats.attack * 0.04;
    const strategyFit = (profile.strategy || profile.control || profile.sustain || profile.support || profile.debuff || profile.deny || profile.cleanse || profile.splash)
      ? stats.strategy * 0.18
      : stats.strategy * 0.04;
    const defenseFit = (profile.defense || profile.taunt) ? (stats.defense || 0) * 0.1 : 0;
    const speedFit = profile.tempo ? (stats.speed || 0) * 0.11 : 0;
    const hybrid = profile.attack && (profile.strategy || profile.control || profile.debuff || profile.deny)
      ? Math.min(stats.attack, stats.strategy) * 0.06
      : 0;
    return attackFit + strategyFit + defenseFit + speedFit + hybrid;
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
        + (profile.splash ? 14 : 0)
        + (profile.debuff || profile.amplify ? 10 : 0)
        + (profile.range ? 8 : 0)
        + (profile.defense ? -8 : 0);
    }
    if (positionId === "front") {
      return (profile.defense || profile.control ? 20 : 0)
        + (profile.sustain ? 12 : 0)
        + (profile.taunt || profile.deny ? 14 : 0)
        + (profile.combo ? 10 : 0)
        + (trigger === "pursuit" ? 8 : 0)
        + (profile.range ? -8 : 0);
    }
    return (profile.support || profile.control ? 14 : 0)
      + (profile.tempo || profile.debuff || profile.cleanse ? 10 : 0)
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
    defaultWeights: DEFAULT_WEIGHTS,
    resolveWeights,
    usableHeroes,
    usableSkills,
    samplePool,
  });
})(globalThis);
