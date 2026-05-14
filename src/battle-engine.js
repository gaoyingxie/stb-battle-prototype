// Battle simulation engine. Depends on seed data and rule helpers; owns no DOM state.
(function registerBattleEngine(global) {
  const {
    ARM_COUNTERS,
    ARM_COUNTER_BONUS,
    ARM_COUNTER_PENALTY,
    POSITION_COORDS,
    DEFAULT_ATTACK_DISTANCE,
    FACTION_BONUS_STATS,
    ARM_BONUS_STATS,
    NEGATIVE_STATUS_TYPES,
    CONTROL_STATUS_TYPES,
    DAMAGE_MODEL,
    damageVariance,
    calculateDamageFormula,
  } = global.STZB_BATTLE_RULES;

  function createBattle(playerTeam, enemyTeam, options = {}) {
    const config = typeof options === "boolean" ? { freshTroops: options } : options;
    const freshTroops = config.freshTroops !== false;
    const encounter = Math.max(1, Number(config.encounter) || 1);
    const maxEncounters = Math.max(encounter, Number(config.maxEncounters) || encounter);
    const logEntries = [];
    const ctx = { log: logEntries, round: 0, units: [] };
    const player = createUnits(playerTeam, "player", freshTroops);
    const enemy = createUnits(enemyTeam, "enemy", freshTroops);
    linkSides(player, enemy);
    ctx.units = [...player, ...enemy];
    applyFormationBonuses(player, ctx, "我军");
    applyFormationBonuses(enemy, ctx, "守军");

    log(ctx, "system", "战斗开始：双方大营、中军、前锋各领一万兵。");
    log(ctx, "round", "准备回合");
    applyPrepRoundSkills(ctx, [...player, ...enemy]);

    return {
      ctx,
      winner: null,
      label: "交战中",
      subtitle: "指挥战法已生效，点击第一回合推进战斗",
      rounds: 0,
      player,
      enemy,
      log: logEntries,
      complete: false,
      finishReason: null,
      encounter,
      maxEncounters,
    };
  }

  function applyPrepRoundSkills(ctx, units) {
    ["passive", "command"].forEach((trigger) => {
      alive(units)
        .sort((a, b) => actionSpeed(b) - actionSpeed(a))
        .forEach((unit) => {
          unit.skills
            .filter((skill) => skill.trigger === trigger)
            .forEach((skill) => withActionUnit(ctx, unit, () => skill.apply?.(ctx, unit)));
        });
    });
  }

  function withActionUnit(ctx, unit, action) {
    if (!ctx) return action();
    const previous = ctx.actionUnit;
    ctx.actionUnit = unit;
    try {
      return action();
    } finally {
      ctx.actionUnit = previous;
    }
  }

  function advanceBattleRound(battle) {
    if (!battle || battle.complete) return battle;
    battle.rounds += 1;
    battle.ctx.round = battle.rounds;
    log(battle.ctx, "round", `第${battle.rounds}回合`);
    [...battle.player, ...battle.enemy].forEach((unit) => applyRoundStart(battle.ctx, unit));

    let winner = checkCampWinner(battle.player, battle.enemy);
    if (!winner) {
      const order = [...alive(battle.player), ...alive(battle.enemy)].sort((a, b) => actionSpeed(b) - actionSpeed(a));
      for (const unit of order) {
        if (!unit.troops || campDown(battle.player) || campDown(battle.enemy)) continue;
        withActionUnit(battle.ctx, unit, () => takeAction(battle.ctx, unit));
        winner = checkCampWinner(battle.player, battle.enemy);
        if (winner) break;
      }
    }

    [...battle.player, ...battle.enemy].forEach(tickStatuses);

    if (winner) {
      finishBattle(battle, winner, winner === "player" ? "enemyCampDown" : winner === "enemy" ? "playerCampDown" : "bothCampDown");
      return battle;
    }

    if (battle.rounds >= DAMAGE_MODEL.maxRounds) {
      finishBattle(battle, "draw", "roundLimit");
      return battle;
    }

    battle.label = "交战中";
    battle.subtitle = `第${battle.rounds}回合结束，点击下一回合继续`;
    return battle;
  }

  function finishBattle(battle, winner, reason) {
    battle.winner = winner;
    battle.complete = true;
    battle.finishReason = reason;
    battle.label = winner === "player" ? "胜利" : winner === "enemy" ? "战败" : "平局";
    battle.subtitle = battleEndSubtitle(winner, reason, battle.player, battle.enemy, battle);
    log(battle.ctx, "result", `战斗结束：${battle.label}。${battle.subtitle}。`);
  }

  function battleEndSubtitle(winner, reason, player, enemy, battle = null) {
    if (reason === "enemyCampDown") return "敌方大营溃散，我军取胜";
    if (reason === "playerCampDown") return "我方大营溃散，守军获胜";
    if (reason === "bothCampDown") return "双方大营同时溃散，判定平局";
    const playerTroops = totalTroops(player);
    const enemyTroops = totalTroops(enemy);
    if (reason === "roundLimit") {
      const nextEncounter = battle && battle.encounter < battle.maxEncounters
        ? `；${DAMAGE_MODEL.drawWaitMinutes}分钟后进入第${battle.encounter + 1}轮交战`
        : "";
      return `八回合结束双方大营仍在，判定平局。我军剩余${formatNumber(playerTroops)}兵，守军剩余${formatNumber(enemyTroops)}兵${nextEncounter}`;
    }
    if (winner === "draw") return "双方未击溃大营，判定平局";
    if (winner === "player") return `八回合结束，我军剩余${formatNumber(playerTroops)}兵，守军剩余${formatNumber(enemyTroops)}兵，按战损取胜`;
    return `八回合结束，我军剩余${formatNumber(playerTroops)}兵，守军剩余${formatNumber(enemyTroops)}兵，按战损战败`;
  }

  function checkCampWinner(player, enemy) {
    const playerCampDown = campDown(player);
    const enemyCampDown = campDown(enemy);
    if (playerCampDown && enemyCampDown) return "draw";
    if (enemyCampDown) return "player";
    if (playerCampDown) return "enemy";
    return null;
  }

  function simulateBattle(playerTeam, enemyTeam) {
    const battle = createBattle(playerTeam, enemyTeam);
    let winner = null;
    while (!battle.complete) {
      advanceBattleRound(battle);
      winner = battle.winner;
    }
    return battle;
  }

  function createUnits(team, side, freshTroops) {
    return team.map((slot, index) => {
      const hero = heroById(slot.heroId);
      const skills = [hero.innate, ...(slot.skills || [])].map(skillById).filter(Boolean);
      return {
        id: `${side}-${index}-${hero.id}`,
        heroId: hero.id,
        side,
        position: slot.position || POSITIONS[index].id,
        name: hero.name,
        faction: hero.faction,
        arm: hero.arm,
        rarity: hero.rarity,
        portrait: portraitForHero(hero),
        distance: Number(hero.distance) || defaultAttackDistance(),
        stats: { ...hero.stats },
        baseStats: { ...hero.stats },
        statBonus: { attack: 0, strategy: 0, defense: 0, speed: 0 },
        bonuses: [],
        skills,
        troops: freshTroops ? 10000 : Number.isFinite(Number(slot.troops)) ? Number(slot.troops) : 10000,
        wounded: freshTroops ? 0 : Number.isFinite(Number(slot.wounded)) ? Number(slot.wounded) : 0,
        maxTroops: 10000,
        statuses: [],
        pendingSkills: [],
        sideUnits: [],
        enemyUnits: [],
      };
    });
  }

  function applyFormationBonuses(units, ctx, sideLabel) {
    applyGroupBonus(units, "faction", FACTION_BONUS_STATS, (value) => `${value}阵营`, ctx, sideLabel);
    Object.entries(groupUnitsBy(units, "arm")).forEach(([arm, members]) => {
      if (members.length < 2) return;
      const stats = ARM_BONUS_STATS[arm];
      if (!stats) return;
      const rate = formationBonusRate(members.length);
      members.forEach((unit) => {
        addStatBonus(unit, stats, rate);
        unit.bonuses.push(`${arm}兵种`);
      });
      if (ctx) log(ctx, "system", `${sideLabel}${arm}兵达到${members.length}人，触发同兵种加成：${statNames(stats)} +${Math.round(rate * 100)}%。`);
    });
    units.forEach(applyStatBonuses);
  }

  function applyGroupBonus(units, key, stats, labelFor, ctx, sideLabel) {
    Object.entries(groupUnitsBy(units, key)).forEach(([value, members]) => {
      if (members.length < 2) return;
      const rate = formationBonusRate(members.length);
      members.forEach((unit) => {
        addStatBonus(unit, stats, rate);
        unit.bonuses.push(labelFor(value));
      });
      if (ctx) log(ctx, "system", `${sideLabel}${value}达到${members.length}人，触发同阵营加成：攻谋防速 +${Math.round(rate * 100)}%。`);
    });
  }

  function formationBonusRate(count) {
    if (count >= 3) return 0.1;
    if (count >= 2) return 0.05;
    return 0;
  }

  function groupUnitsBy(units, key) {
    return units.reduce((groups, unit) => {
      const value = unit[key] || "未知";
      groups[value] ||= [];
      groups[value].push(unit);
      return groups;
    }, {});
  }

  function addStatBonus(unit, stats, rate) {
    stats.forEach((stat) => {
      unit.statBonus[stat] += rate;
    });
  }

  function applyStatBonuses(unit) {
    Object.entries(unit.baseStats).forEach(([stat, value]) => {
      unit.stats[stat] = Math.round(value * (1 + (unit.statBonus[stat] || 0)));
    });
  }

  function statNames(stats) {
    const labels = { attack: "攻", strategy: "谋", defense: "防", speed: "速" };
    return stats.map((stat) => labels[stat] || stat).join("/");
  }

  function linkSides(player, enemy) {
    player.forEach((unit) => {
      unit.sideUnits = player;
      unit.enemyUnits = enemy;
    });
    enemy.forEach((unit) => {
      unit.sideUnits = enemy;
      unit.enemyUnits = player;
    });
  }

  function takeAction(ctx, unit) {
    if (hasStatus(unit, "confusion")) {
      log(ctx, "control", `${unit.name}陷入混乱，无法行动。`);
      return;
    }

    const activeBlocked = hasStatus(unit, "silence") || (hasStatus(unit, "activeSealAura") && Math.random() < statusValue(unit, "activeSealAura"));
    resolvePreparedSkills(ctx, unit, activeBlocked);
    if (campDown(unit.enemyUnits)) return;

    const activeSkills = unit.skills.filter((skill) => skill.use && skill.trigger !== "pursuit");
    for (const skill of activeSkills) {
      if (activeBlocked) {
        log(ctx, "control", `${unit.name}受到犹豫/封锁，【${skill.name}】未能发动。`);
        break;
      }
      if (Math.random() < (skill.chance || 0)) {
        const prepareRounds = skill.prepareRounds ?? prepareRoundsFromText(skill.desc || "");
        if (prepareRounds > 0) {
          if (unit.pendingSkills.some((pending) => pending.skill.id === skill.id)) {
            log(ctx, "system", `${unit.name}正在准备【${skill.name}】，本回合不重复进入准备。`);
            continue;
          }
          unit.pendingSkills.push({ skill, rounds: prepareRounds });
          log(ctx, "system", `${unit.name}开始准备【${skill.name}】，需${prepareRounds}回合。`);
          continue;
        }
        skill.use(ctx, unit);
        if (campDown(unit.enemyUnits)) return;
      }
    }

    const attackBlocked = hasStatus(unit, "disarm") || (hasStatus(unit, "disarmAura") && Math.random() < statusValue(unit, "disarmAura"));
    if (attackBlocked) {
      log(ctx, "control", `${unit.name}陷入怯战，无法普通攻击。`);
      return;
    }

    const target = pickNormalAttackTarget(unit);
    if (!target) {
      log(ctx, "control", `${unit.name}攻击距离${getAttackRange(unit)}，没有可普通攻击的目标。`);
      return;
    }
    dealDamage(ctx, unit, target, DAMAGE_MODEL.normalAttackRate, "attack", "普通攻击", true);
    unit.skills.filter((skill) => skill.trigger === "pursuit").forEach((skill) => {
      if (target.troops > 0 && Math.random() < (skill.chance || 0)) skill.use(ctx, unit, target);
    });
  }

  function resolvePreparedSkills(ctx, unit, activeBlocked) {
    if (!unit.pendingSkills?.length) return;
    const ready = unit.pendingSkills.filter((pending) => pending.rounds <= 0);
    unit.pendingSkills = unit.pendingSkills.filter((pending) => pending.rounds > 0);
    ready.forEach(({ skill }) => {
      if (activeBlocked) {
        log(ctx, "control", `${unit.name}受到犹豫/封锁，准备完成的【${skill.name}】未能发动。`);
        return;
      }
      log(ctx, "system", `${unit.name}准备完成，发动【${skill.name}】。`);
      skill.use?.(ctx, unit);
    });
  }

  function applyRoundStart(ctx, unit) {
    if (!unit.troops) return;
    const burn = statusValue(unit, "burn");
    if (burn) {
      const loss = applyTroopLoss(unit, burn);
      log(ctx, "hit", `${unit.name}受到灼烧，损失${Math.round(loss)}兵。`, {
        target: unit.name,
        targetUnit: unit,
        amount: loss,
        details: troopLossDetails(unit, loss),
      });
    }
  }

  function dealDamage(ctx, attacker, defender, rate, mode, source, isNormal = false) {
    if (!attacker.troops || !defender?.troops) return 0;
    const originalDefender = defender;
    if (isNormal) defender = guardTarget(ctx, attacker, defender);
    const evade = statusValue(defender, "evade");
    if (evade && Math.random() < evade) {
      log(ctx, "control", `${defender.name}规避了${attacker.name}的【${source}】。`, {
        actor: attacker.name,
        actorUnit: attacker,
        target: defender.name,
        targetUnit: defender,
        skill: source,
      });
      return 0;
    }
    const arm = armCounterModifier(attacker.arm, defender.arm);
    const result = calculateDamage(attacker, defender, rate, mode, arm);
    const damage = applyTroopLoss(defender, result.damage);
    log(ctx, "hit", `${attacker.name}以【${source}】攻击${defender.name}${arm.text ? `（${arm.text}）` : ""}，造成${damage}兵损。`, {
      actor: attacker.name,
      actorUnit: attacker,
      target: defender.name,
      targetUnit: defender,
      skill: source,
      amount: damage,
      details: [...result.details, ...troopLossDetails(defender, damage)],
    });

    if (damage > 0 && mode === "strategy") applyStrategySplash(ctx, attacker, defender, rate, source);

    if (isNormal) applySplitDamage(ctx, attacker, originalDefender, source);

    if (isNormal && defender.troops > 0 && hasStatus(defender, "counter")) {
      const counterRate = statusValue(defender, "counter");
      if (Math.random() < counterRate) {
        if (canReachByAttack(defender, attacker)) {
          dealDamage(ctx, defender, attacker, DAMAGE_MODEL.counterAttackRate, "attack", "回马");
        } else {
          log(ctx, "control", `${defender.name}触发【回马】，但攻击距离${getAttackRange(defender)}不足，无法反击${attacker.name}。`, {
            actor: defender.name,
            actorUnit: defender,
            target: attacker.name,
            targetUnit: attacker,
            skill: "回马",
          });
        }
      }
    }
    return damage;
  }

  function applyStrategySplash(ctx, attacker, defender, baseRate, source) {
    if (!ctx || ctx.round <= 0 || ctx.strategySplashing || !attacker?.statuses?.length || !defender?.sideUnits) return;
    const splashStatuses = attacker.statuses.filter((status) =>
      status.type === "strategySplash" && Number(status.value) > 0
    );
    if (!splashStatuses.length) return;
    const targets = adjacentUnits(defender);
    if (!targets.length) return;

    splashStatuses.forEach((status) => {
      const splashSource = status.source || "策略溅射";
      if (source === splashSource) return;
      const splashRate = Math.max(0, Number(baseRate) || 0) * Number(status.value);
      if (splashRate <= 0) return;
      const previousSplashing = ctx.strategySplashing;
      ctx.strategySplashing = true;
      try {
        targets.forEach((target) => {
          dealDamage(ctx, attacker, target, splashRate, "strategy", splashSource);
        });
      } finally {
        ctx.strategySplashing = previousSplashing;
      }
    });
  }

  function applyTroopLoss(unit, amount, woundedRate = DAMAGE_MODEL.woundedRate) {
    const loss = Math.min(unit.troops, Math.max(0, Math.round(amount)));
    if (!loss) return 0;
    unit.troops = Math.max(0, unit.troops - loss);
    unit.wounded = Math.min(unit.maxTroops - unit.troops, (unit.wounded || 0) + Math.floor(loss * woundedRate));
    if (unit.troops <= 0) {
      unit.wounded = Math.floor(unit.wounded * DAMAGE_MODEL.routedWoundedRetention);
    }
    return loss;
  }

  function troopLossDetails(unit, loss) {
    if (!loss) return [];
    return [
      `伤兵+${formatNumber(Math.floor(loss * DAMAGE_MODEL.woundedRate))}`,
      unit.wounded ? `现有伤兵${formatNumber(unit.wounded)}` : "",
    ].filter(Boolean);
  }

  function calculateDamage(attacker, defender, rate, mode, arm) {
    const attackUp = statusValue(attacker, "attackUp");
    const strategyUp = statusValue(attacker, "strategyUp");
    const offense = mode === "strategy"
      ? attacker.stats.strategy + strategyUp
      : attacker.stats.attack + attackUp;
    const attackerBonus = statusValue(attacker, "damageUp");
    const takenBonus = statusValue(defender, "damageTakenUp");
    const defenderReduction = statusValue(defender, "damageDown");
    const result = calculateDamageFormula({
      attackerTroops: attacker.troops,
      offense,
      defenderDefense: defender.stats.defense + statusValue(defender, "defenseUp") - statusValue(defender, "defenseDown"),
      defenderStrategy: defender.stats.strategy,
      rate,
      mode,
      armMultiplier: arm.multiplier,
      attackerBonus,
      takenBonus,
      defenderReduction,
      variance: damageVariance(),
    });
    const { components } = result;

    const details = [
      `伤害率${Math.round(rate * 100)}%`,
      `兵力曲线${Math.round(components.troopCurve)}`,
      mode === "attack" ? `防御修正${Math.round(components.defenseFactor * 100)}%` : "",
      components.strategyGuard ? `谋略抵消${Math.round(components.strategyGuard * 100)}%` : "",
      attackerBonus ? `攻方增伤+${Math.round(attackerBonus * 100)}%` : "",
      takenBonus ? `守方易伤+${Math.round(takenBonus * 100)}%` : "",
      defenderReduction ? `守方减伤-${Math.round(defenderReduction * 100)}%` : "",
      arm.text,
    ].filter(Boolean);

    return {
      damage: result.damage,
      details,
    };
  }

  function guardTarget(ctx, attacker, defender) {
    const guards = alive(defender.sideUnits)
      .filter((unit) => unit.id !== defender.id && hasStatus(unit, "guard"));
    if (!guards.length) return defender;
    const guard = guards[Math.floor(Math.random() * guards.length)];
    log(ctx, "control", `${guard.name}发动援护，替${defender.name}承受${attacker.name}的普通攻击。`, {
      actor: guard.name,
      actorUnit: guard,
      target: defender.name,
      targetUnit: defender,
      participants: [unitLogParticipant(guard, "actor"), unitLogParticipant(defender, "target"), unitLogParticipant(attacker, "attacker")],
    });
    return guard;
  }

  function applySplitDamage(ctx, attacker, defender, source) {
    const splitRate = statusValue(attacker, "split");
    if (!splitRate || !defender?.sideUnits) return;
    adjacentUnits(defender).forEach((target) => {
      dealDamage(ctx, attacker, target, splitRate, "attack", `${source}·分兵`);
    });
  }

  function adjacentUnits(unit) {
    const order = ["front", "middle", "camp"];
    const index = order.indexOf(unit.position);
    return alive(unit.sideUnits)
      .filter((candidate) => candidate.id !== unit.id && Math.abs(order.indexOf(candidate.position) - index) === 1);
  }

  function armCounterModifier(attackerArm, defenderArm) {
    if (!ARM_COUNTERS[attackerArm] || !ARM_COUNTERS[defenderArm]) return { multiplier: 1, text: "" };
    if (ARM_COUNTERS[attackerArm] === defenderArm) {
      return { multiplier: 1 + ARM_COUNTER_BONUS, text: `${attackerArm}克${defenderArm}，伤害+${Math.round(ARM_COUNTER_BONUS * 100)}%` };
    }
    if (ARM_COUNTERS[defenderArm] === attackerArm) {
      return { multiplier: 1 - ARM_COUNTER_PENALTY, text: `${defenderArm}克${attackerArm}，伤害-${Math.round(ARM_COUNTER_PENALTY * 100)}%` };
    }
    return { multiplier: 1, text: "" };
  }

  function armCounterText(arm) {
    return ARM_COUNTERS[arm] ? `${arm}克${ARM_COUNTERS[arm]}` : "";
  }

  function defaultAttackDistance() {
    return DEFAULT_ATTACK_DISTANCE;
  }

  function baseAttackRange(unit) {
    return Number(unit?.distance) || defaultAttackDistance();
  }

  function getAttackRange(unit) {
    return Math.max(1, baseAttackRange(unit) + statusValue(unit, "rangeUp") - statusValue(unit, "rangeDown"));
  }

  function attackRangeDelta(text = "") {
    const increase = text.match(/攻击距离\s*\+\s*(\d+)/);
    return increase ? Number(increase[1]) : 0;
  }

  function positionDistance(attacker, defender) {
    const attackerCoord = compressedPositionCoord(attacker);
    const defenderCoord = compressedPositionCoord(defender);
    if (!Number.isFinite(attackerCoord) || !Number.isFinite(defenderCoord)) return Infinity;
    return Math.abs(attackerCoord - defenderCoord);
  }

  function compressedPositionCoord(unit) {
    const sideUnits = unit.sideUnits?.length ? unit.sideUnits : [unit];
    const line = ["front", "middle", "camp"]
      .map((position) => sideUnits.find((candidate) => candidate.position === position && candidate.troops > 0))
      .filter(Boolean);
    const index = line.findIndex((candidate) => candidate.id === unit.id);
    if (index === -1) return POSITION_COORDS[unit.side]?.[unit.position] ?? Infinity;
    return unit.side === "enemy" ? 3 + index : 2 - index;
  }

  function canReachByAttack(attacker, defender) {
    return positionDistance(attacker, defender) <= getAttackRange(attacker);
  }

  function pickNormalAttackTarget(unit) {
    const targetPool = hasStatus(unit, "berserk")
      ? [...unit.enemyUnits, ...unit.sideUnits.filter((ally) => ally.id !== unit.id)]
      : unit.enemyUnits;
    const targets = alive(targetPool).filter((target) => canReachByAttack(unit, target));
    return targets[Math.floor(Math.random() * targets.length)];
  }

  function skillDistanceFromText(text = "") {
    const explicit = text.match(/(?:有效距离|距离)\s*(\d+)\s*以内/);
    if (explicit) return Number(explicit[1]);
    const promoted = text.match(/战法距离提升至\s*(\d+)/);
    return promoted ? Number(promoted[1]) : null;
  }

  function targetCountFromText(text = "") {
    if (/全体|3个目标|2-3个目标|2~3个目标/.test(text)) return 3;
    if (/群体|2个目标|1-2个目标|1~2个目标/.test(text)) return 2;
    return 1;
  }

  function pickSkillTargets(unit, units, count, text = "", explicitDistance = null) {
    return pickTargets(filterSkillTargets(unit, units, text, explicitDistance), count);
  }

  function filterSkillTargets(unit, units, text = "", explicitDistance = null) {
    const distance = Number(explicitDistance) || skillDistanceFromText(text);
    return distance
      ? units.filter((target) => positionDistance(unit, target) <= distance)
      : units;
  }

  function heal(ctx, caster, target, amount, source) {
    if (!target?.troops) return 0;
    const healAmount = Math.min(target.wounded || 0, target.maxTroops - target.troops, Math.round(amount));
    if (healAmount <= 0) return 0;
    target.troops += healAmount;
    target.wounded = Math.max(0, (target.wounded || 0) - healAmount);
    log(ctx, "heal", `${caster.name}以【${source}】恢复${target.name}${healAmount}兵。`, {
      actor: caster.name,
      actorUnit: caster,
      target: target.name,
      targetUnit: target,
      skill: source,
      amount: healAmount,
      details: target.wounded ? [`剩余伤兵${formatNumber(target.wounded)}`] : ["伤兵已恢复完"],
    });
    return healAmount;
  }

  function pickTargets(units, count, exclude = []) {
    return shuffle(alive(units)
      .filter((unit) => !exclude.includes(unit.id))
      .sort((a, b) => positionDistanceFromFront(a) - positionDistanceFromFront(b) || a.troops - b.troops))
      .slice(0, count);
  }

  function shuffle(items) {
    return items
      .map((item) => ({ item, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ item }) => item);
  }

  function positionDistanceFromFront(unit) {
    return ["front", "middle", "camp"].indexOf(unit.position);
  }

  function addStatus(unit, type, rounds, value, ctx = null, source = "", metadata = null) {
    if (NEGATIVE_STATUS_TYPES.has(type) && hasStatus(unit, "insight")) {
      if (ctx) log(ctx, "control", `${unit.name}处于洞察，免疫${source ? `【${source}】` : ""}负面状态。`, {
        target: unit.name,
        targetUnit: unit,
        skill: source,
      });
      return false;
    }
    if (CONTROL_STATUS_TYPES.has(type) && hasStatus(unit, type)) {
      if (ctx) log(ctx, "control", `${unit.name}已有${statusLabel(type)}，后续同类控制未生效。`, {
        target: unit.name,
        targetUnit: unit,
        skill: source,
      });
      return false;
    }
    unit.statuses = unit.statuses.filter((status) => status.type !== type);
    const nextStatus = { type, rounds, value };
    if (metadata && typeof metadata === "object") Object.assign(nextStatus, metadata);
    unit.statuses.push(nextStatus);
    return true;
  }

  function tickStatuses(unit) {
    unit.statuses.forEach((status) => {
      if (status.type === "strategySplash") {
        status.value += Number(status.growth) || 0;
      }
      status.rounds -= 1;
    });
    unit.statuses = unit.statuses.filter((status) => status.rounds > 0);
    unit.pendingSkills?.forEach((pending) => {
      pending.rounds -= 1;
    });
  }

  function clearBadStatuses(unit) {
    unit.statuses = unit.statuses.filter((status) => !NEGATIVE_STATUS_TYPES.has(status.type));
  }

  function hasStatus(unit, type) {
    return unit.statuses.some((status) => status.type === type);
  }

  function statusValue(unit, type) {
    return unit.statuses.filter((status) => status.type === type).reduce((sum, status) => sum + status.value, 0);
  }

  function statusLabel(type) {
    return globalThis.STZB_BATTLE_RULES.statusLabel(type);
  }

  function unitLogParticipant(unit, role = "unit") {
    if (!unit) return null;
    return {
      id: unit.id,
      heroId: unit.heroId,
      name: unit.name,
      side: unit.side,
      role,
    };
  }

  function actionSpeed(unit) {
    return unit.stats.speed + statusValue(unit, "priority") + Math.random() * 8;
  }

  function campDown(units) {
    return units.find((unit) => unit.position === "camp")?.troops <= 0;
  }

  function alive(units) {
    return units.filter((unit) => unit.troops > 0);
  }

  function totalTroops(units) {
    return units.reduce((sum, unit) => sum + Math.max(0, unit.troops), 0);
  }

  function totalWounded(units) {
    return units.reduce((sum, unit) => sum + Math.max(0, unit.wounded || 0), 0);
  }

  function totalMaxTroops(units) {
    return units.reduce((sum, unit) => sum + Math.max(0, unit.maxTroops || 0), 0);
  }

  Object.assign(global, {
    createBattle,
    applyPrepRoundSkills,
    advanceBattleRound,
    finishBattle,
    battleEndSubtitle,
    checkCampWinner,
    simulateBattle,
    createUnits,
    applyFormationBonuses,
    applyGroupBonus,
    formationBonusRate,
    groupUnitsBy,
    addStatBonus,
    applyStatBonuses,
    statNames,
    linkSides,
    withActionUnit,
    takeAction,
    resolvePreparedSkills,
    applyRoundStart,
    dealDamage,
    applyStrategySplash,
    applyTroopLoss,
    troopLossDetails,
    calculateDamage,
    guardTarget,
    applySplitDamage,
    adjacentUnits,
    armCounterModifier,
    armCounterText,
    defaultAttackDistance,
    baseAttackRange,
    getAttackRange,
    attackRangeDelta,
    positionDistance,
    compressedPositionCoord,
    canReachByAttack,
    pickNormalAttackTarget,
    skillDistanceFromText,
    targetCountFromText,
    pickSkillTargets,
    filterSkillTargets,
    heal,
    pickTargets,
    positionDistanceFromFront,
    addStatus,
    tickStatuses,
    clearBadStatuses,
    hasStatus,
    statusValue,
    statusLabel,
    unitLogParticipant,
    actionSpeed,
    campDown,
    alive,
    totalTroops,
    totalWounded,
    totalMaxTroops,
  });
})(globalThis);
