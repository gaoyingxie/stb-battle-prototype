// Shared battle rule constants and formula helpers.
// Keep this file free of DOM/state access so the simulator rules stay inspectable.
(function registerBattleRules(global) {
  const POSITIONS = [
    { id: "camp", label: "大营" },
    { id: "middle", label: "中军" },
    { id: "front", label: "前锋" },
  ];

  const ARM_COUNTERS = {
    骑: "步",
    步: "弓",
    弓: "骑",
  };

  const ARM_COUNTER_BONUS = 0.15;
  const ARM_COUNTER_PENALTY = 0.1;

  const POSITION_COORDS = {
    player: { camp: 0, middle: 1, front: 2 },
    enemy: { front: 3, middle: 4, camp: 5 },
  };

  const DEFAULT_ATTACK_DISTANCE = 2;

  const FACTION_BONUS_STATS = ["attack", "strategy", "defense", "speed"];
  const ARM_BONUS_STATS = {
    步: ["attack", "defense"],
    骑: ["attack", "speed"],
    弓: ["defense", "speed"],
  };

  const STATUS_DEFINITIONS = {
    attackUp: { label: "攻击提高", category: "attribute", summary: "提高攻击属性，参与攻击伤害的攻方属性计算。" },
    strategyUp: { label: "谋略提高", category: "attribute", summary: "提高谋略属性，参与策略伤害和治疗量计算。" },
    defenseUp: { label: "防御提高", category: "attribute", summary: "提高防御属性，降低受到的攻击伤害。" },
    defenseDown: { label: "防御降低", category: "attribute", negative: true, summary: "降低防御属性，使受到的攻击伤害提高。" },
    priority: { label: "先手", category: "turn-order", summary: "行动速度临时提高，影响本回合行动顺序。" },
    rangeUp: { label: "攻击距离提高", category: "range", summary: "普通攻击距离增加。" },
    rangeDown: { label: "攻击距离降低", category: "range", negative: true, summary: "普通攻击距离降低。" },
    damageUp: { label: "造成伤害提高", category: "damage", summary: "作为攻方增伤乘区，提高最终伤害。" },
    damageDown: { label: "受到伤害降低", category: "damage", summary: "作为守方减伤乘区，降低最终伤害。" },
    damageTakenUp: { label: "受到伤害提高", category: "damage", negative: true, summary: "作为守方易伤乘区，提高最终伤害。" },
    evade: { label: "规避", category: "defense", summary: "受到伤害前按概率完全规避本次伤害。" },
    burn: { label: "灼烧", category: "damage-over-time", negative: true, summary: "回合开始时造成固定兵损，兵损同样进入伤兵池。" },
    disarm: { label: "怯战", category: "control", negative: true, control: true, summary: "无法进行普通攻击。" },
    silence: { label: "犹豫", category: "control", negative: true, control: true, summary: "无法发动主动战法；准备完成的主动战法也会失效。" },
    confusion: { label: "混乱", category: "control", negative: true, control: true, summary: "本回合无法行动。" },
    berserk: { label: "暴走", category: "control", negative: true, control: true, summary: "攻击类目标会在敌我存活单位中随机选择。" },
    insight: { label: "洞察", category: "immunity", summary: "免疫负面状态。" },
    guard: { label: "援护", category: "defense", summary: "替友军承受普通攻击。" },
    split: { label: "分兵", category: "attack", summary: "普通攻击后对原目标相邻存活单位造成额外攻击伤害。" },
    counter: { label: "反击", category: "attack", summary: "受到普通攻击后按概率反击，仍需满足攻击距离。" },
    activeSealAura: { label: "主动封锁", category: "control-aura", negative: true, summary: "行动时按概率使主动战法发动失败。" },
    disarmAura: { label: "怯战光环", category: "control-aura", negative: true, summary: "行动时按概率使普通攻击失败。" },
  };

  const NEGATIVE_STATUS_TYPES = new Set(Object.entries(STATUS_DEFINITIONS)
    .filter(([, definition]) => definition.negative)
    .map(([type]) => type));

  const CONTROL_STATUS_TYPES = new Set(Object.entries(STATUS_DEFINITIONS)
    .filter(([, definition]) => definition.control)
    .map(([type]) => type));

  const DAMAGE_MODEL = {
    maxRounds: 8,
    drawTroopDiffThreshold: 1200,
    normalAttackRate: 0.62,
    counterAttackRate: 0.36,
    woundedRate: 0.95,
    routedWoundedRetention: 0.6,
    minDamage: 60,
    troopCurveScale: 300,
    troopCurveOffset: 3500,
    attackBasePressure: 373,
    attackBasePressureOffset: 7700,
    strategyBasePressure: 178,
    strategyBasePressureOffset: 6459,
    offenseScale: 0.075,
    minDefense: 40,
    defenseBaseline: 65,
    defenseSlope: 0.62,
    strategyGuardBaseline: 80,
    strategyGuardDivisor: 520,
    maxStrategyGuard: 0.42,
    minOffenseAfterGuard: 20,
    varianceMin: 0.96,
    varianceMax: 1.04,
    minDamageReductionMultiplier: 0.15,
  };

  function statusLabel(type) {
    return STATUS_DEFINITIONS[type]?.label || type;
  }

  function damageVariance(random = Math.random) {
    return DAMAGE_MODEL.varianceMin + random() * (DAMAGE_MODEL.varianceMax - DAMAGE_MODEL.varianceMin);
  }

  function calculateDamageFormula(input) {
    const model = DAMAGE_MODEL;
    const mode = input.mode === "strategy" ? "strategy" : "attack";
    const attackerTroops = Math.max(0, Number(input.attackerTroops) || 0);
    const rate = Math.max(0, Number(input.rate) || 0);
    const offense = Math.max(0, Number(input.offense) || 0);
    const defenderDefense = Math.max(model.minDefense, Number(input.defenderDefense) || 0);
    const defenderStrategy = Number(input.defenderStrategy) || 0;
    const armMultiplier = Number(input.armMultiplier) || 1;
    const variance = Number(input.variance) || 1;

    const troopCurve = (model.troopCurveScale * attackerTroops) / (model.troopCurveOffset + attackerTroops);
    const basePressure = mode === "strategy"
      ? (model.strategyBasePressure * attackerTroops) / (model.strategyBasePressureOffset + attackerTroops)
      : (model.attackBasePressure * attackerTroops) / (model.attackBasePressureOffset + attackerTroops);
    const strategyGuard = mode === "strategy"
      ? Math.min(model.maxStrategyGuard, Math.max(0, (defenderStrategy - model.strategyGuardBaseline) / model.strategyGuardDivisor))
      : 0;
    const effectiveOffense = Math.max(model.minOffenseAfterGuard, offense * (1 - strategyGuard));
    const defenseFactor = mode === "attack"
      ? 100 / (100 + Math.max(0, defenderDefense - model.defenseBaseline) * model.defenseSlope)
      : 1;
    const damageUp = Number(input.attackerBonus) || 0;
    const damageTakenUp = Number(input.takenBonus) || 0;
    const damageDown = Number(input.defenderReduction) || 0;
    const reductionMultiplier = Math.max(model.minDamageReductionMultiplier, 1 - damageDown);

    let rawDamage = (basePressure + rate * troopCurve * effectiveOffense * model.offenseScale) * defenseFactor;
    rawDamage *= 1 + damageUp;
    rawDamage *= 1 + damageTakenUp;
    rawDamage *= reductionMultiplier;
    rawDamage *= armMultiplier;
    rawDamage *= variance;

    return {
      damage: Math.max(model.minDamage, Math.round(rawDamage)),
      components: {
        troopCurve,
        basePressure,
        strategyGuard,
        effectiveOffense,
        defenseFactor,
        damageUp,
        damageTakenUp,
        damageDown,
        reductionMultiplier,
        armMultiplier,
        variance,
      },
    };
  }

  global.STZB_BATTLE_RULES = Object.freeze({
    POSITIONS,
    ARM_COUNTERS,
    ARM_COUNTER_BONUS,
    ARM_COUNTER_PENALTY,
    POSITION_COORDS,
    DEFAULT_ATTACK_DISTANCE,
    FACTION_BONUS_STATS,
    ARM_BONUS_STATS,
    STATUS_DEFINITIONS,
    NEGATIVE_STATUS_TYPES,
    CONTROL_STATUS_TYPES,
    DAMAGE_MODEL,
    statusLabel,
    damageVariance,
    calculateDamageFormula,
  });
})(globalThis);
