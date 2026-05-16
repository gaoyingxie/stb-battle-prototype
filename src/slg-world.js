// Saveable four-faction SLG world simulation. This module owns no DOM state.
(function registerSlgWorld(global) {
  const rules = global.STZB_SLG_RULES;
  if (!rules) throw new Error("STZB_SLG_RULES must load before STZB_SLG_WORLD");

  const {
    MAP_WIDTH,
    MAP_HEIGHT,
    MAIN_CITY_SIZE,
    MAX_CITY_LEVEL,
    PLAYER_FACTION_ID,
    NEUTRAL_FACTION_ID,
    RESOURCE_LABELS,
    FACTIONS,
    INITIAL_RESOURCES,
    INITIAL_ARMY_TROOPS,
    TEAM_TROOP_CAP,
    ARMY_SLOT_TROOP_CAP,
    TROOPS_PER_FOOD,
    ARMY_LIMIT_BY_CITY_LEVEL,
    ARMY_STAMINA_MAX,
    ARMY_STAMINA_COSTS,
    ARMY_STAMINA_RECOVERY,
    ARMY_WOUNDED_RECOVERY_RATE,
    FORT_BUILD_COST,
    FORT_BUILD_TURNS,
    COMMAND_TYPES,
    CITY_PRODUCTION_BY_LEVEL,
    CITY_UPGRADE_COSTS,
    RESOURCE_POINT_COUNTS,
    RESOURCE_POINT_PRODUCTION,
    RESOURCE_GARRISON_TROOPS,
    TILE_TYPES,
    CITY_PARTS,
  } = rules;

  const VERSION = 3;
  const DEFAULT_SEED = 20260516;
  const POSITION_IDS = ["camp", "middle", "front"];
  const RECOVERY_ORDER = ["front", "middle", "camp"];

  function createInitialSlgState(options = {}) {
    const seed = Number.isFinite(Number(options.seed)) ? Number(options.seed) : Date.now();
    const rng = typeof options.rng === "function" ? options.rng : createSeededRng(seed || DEFAULT_SEED);
    const factions = Object.fromEntries(FACTIONS.map((faction) => [faction.id, createFaction(faction)]));
    const state = {
      version: VERSION,
      seed,
      turn: 1,
      gameStatus: "playing",
      winnerFactionId: null,
      map: { width: MAP_WIDTH, height: MAP_HEIGHT },
      factions,
      tiles: createEmptyTiles(),
      armies: {},
      commands: [],
      nextCommandId: 1,
      eventLog: [],
    };

    placeMainCities(state);
    placeGuaranteedResourcePoints(state);
    placeRandomResourcePoints(state, rng);
    for (const faction of Object.values(state.factions)) {
      ensureFactionArmyLimitInPlace(state, faction.id, { initial: true });
    }
    return normalizeSlgState(state);
  }

  function createFaction(faction) {
    return {
      id: faction.id,
      label: faction.label,
      shortLabel: faction.shortLabel,
      kind: faction.kind,
      color: faction.color,
      homeCenter: { ...faction.homeCenter },
      resources: { ...INITIAL_RESOURCES },
      cityLevel: 1,
      armyTroops: 0,
      alive: true,
      eliminatedTurn: null,
    };
  }

  function createEmptyTiles() {
    const tiles = [];
    for (let y = 0; y < MAP_HEIGHT; y += 1) {
      for (let x = 0; x < MAP_WIDTH; x += 1) {
        tiles.push({
          id: tileId(x, y),
          x,
          y,
          type: TILE_TYPES.EMPTY,
          ownerId: null,
          resourceType: null,
          level: 0,
          garrison: null,
          garrisonArmyIds: [],
          fort: null,
          cityFactionId: null,
          cityPart: null,
        });
      }
    }
    return tiles;
  }

  function placeMainCities(state) {
    const radius = Math.floor(MAIN_CITY_SIZE / 2);
    for (const faction of FACTIONS) {
      for (let y = faction.homeCenter.y - radius; y <= faction.homeCenter.y + radius; y += 1) {
        for (let x = faction.homeCenter.x - radius; x <= faction.homeCenter.x + radius; x += 1) {
          const tile = tileAt(state, x, y);
          if (!tile) continue;
          tile.type = TILE_TYPES.MAIN_CITY;
          tile.ownerId = faction.id;
          tile.cityFactionId = faction.id;
          tile.cityPart = x === faction.homeCenter.x && y === faction.homeCenter.y
            ? CITY_PARTS.CENTER
            : CITY_PARTS.DISTRICT;
          tile.level = 1;
          tile.resourceType = null;
          tile.garrison = null;
          tile.garrisonArmyIds = [];
          tile.fort = null;
        }
      }
    }
  }

  function placeGuaranteedResourcePoints(state) {
    [
      { x: 5, y: 3, resourceType: "food", level: 1 },
      { x: 19, y: 3, resourceType: "wood", level: 1 },
      { x: 5, y: 21, resourceType: "stone", level: 1 },
      { x: 19, y: 21, resourceType: "food", level: 1 },
    ].forEach((placement) => placeResourcePoint(state, placement));
  }

  function placeRandomResourcePoints(state, rng) {
    const placed = state.tiles.reduce((counts, tile) => {
      if (tile.type === TILE_TYPES.RESOURCE) counts[tile.resourceType] = (counts[tile.resourceType] || 0) + 1;
      return counts;
    }, {});

    for (const [resourceType, count] of Object.entries(RESOURCE_POINT_COUNTS)) {
      let remaining = Math.max(0, count - (placed[resourceType] || 0));
      while (remaining > 0) {
        const tile = randomEmptyTile(state, rng);
        if (!tile) break;
        placeResourcePoint(state, {
          x: tile.x,
          y: tile.y,
          resourceType,
          level: randomResourceLevel(rng),
        });
        remaining -= 1;
      }
    }
  }

  function randomEmptyTile(state, rng) {
    const candidates = state.tiles.filter((tile) => (
      tile.type === TILE_TYPES.EMPTY
      && !isAdjacentToAnyCity(state, tile)
    ));
    if (!candidates.length) return null;
    return candidates[Math.floor(rng() * candidates.length)];
  }

  function isAdjacentToAnyCity(state, tile) {
    return adjacentTiles(state, tile).some((candidate) => candidate.type === TILE_TYPES.MAIN_CITY);
  }

  function randomResourceLevel(rng) {
    const roll = rng();
    if (roll < 0.46) return 1;
    if (roll < 0.76) return 2;
    if (roll < 0.93) return 3;
    return 4;
  }

  function placeResourcePoint(state, placement) {
    const tile = tileAt(state, placement.x, placement.y);
    if (!tile || tile.type !== TILE_TYPES.EMPTY) return false;
    const level = clampInt(placement.level, 1, 4);
    tile.type = TILE_TYPES.RESOURCE;
    tile.ownerId = NEUTRAL_FACTION_ID;
    tile.resourceType = placement.resourceType;
    tile.level = level;
    tile.garrison = {
      troops: RESOURCE_GARRISON_TROOPS[level],
      maxTroops: RESOURCE_GARRISON_TROOPS[level],
    };
    tile.garrisonArmyIds = [];
    tile.fort = null;
    tile.cityFactionId = null;
    tile.cityPart = null;
    return true;
  }

  function normalizeSlgState(raw) {
    if (
      !raw
      || typeof raw !== "object"
      || raw.version !== VERSION
      || !Array.isArray(raw.tiles)
      || !raw.armies
      || !Array.isArray(raw.commands)
    ) {
      return createInitialSlgState({ seed: raw?.seed || DEFAULT_SEED });
    }

    const state = cloneState(raw);
    state.version = VERSION;
    state.turn = Math.max(1, Number(state.turn) || 1);
    state.gameStatus = ["playing", "victory", "defeat"].includes(state.gameStatus) ? state.gameStatus : "playing";
    state.winnerFactionId = state.winnerFactionId || null;
    state.map = { width: MAP_WIDTH, height: MAP_HEIGHT };
    state.factions = normalizeFactions(state.factions);
    state.tiles = normalizeTiles(state.tiles);
    state.armies = normalizeArmies(state.armies, state);
    state.commands = normalizeCommands(state.commands, state);
    state.nextCommandId = Math.max(
      Number(state.nextCommandId) || 1,
      state.commands.reduce((max, command) => Math.max(max, numericCommandId(command.id) + 1), 1),
    );
    state.eventLog = Array.isArray(state.eventLog) ? state.eventLog.slice(-60) : [];

    for (const faction of Object.values(state.factions)) {
      ensureFactionArmyLimitInPlace(state, faction.id);
    }
    normalizeTileArmyRefsInPlace(state);
    checkVictoryStateInPlace(state);
    return state;
  }

  function normalizeFactions(rawFactions = {}) {
    const normalized = {};
    for (const factionTemplate of FACTIONS) {
      const fallback = createFaction(factionTemplate);
      const faction = rawFactions[factionTemplate.id] || {};
      const { maxArmyTroops, ...savedFaction } = faction;
      normalized[factionTemplate.id] = {
        ...fallback,
        ...savedFaction,
        id: factionTemplate.id,
        label: factionTemplate.label,
        shortLabel: factionTemplate.shortLabel,
        kind: factionTemplate.kind,
        color: factionTemplate.color,
        homeCenter: { ...factionTemplate.homeCenter },
        resources: normalizeResources(savedFaction.resources),
        cityLevel: clampInt(savedFaction.cityLevel, 1, MAX_CITY_LEVEL),
        armyTroops: normalizeTroops(savedFaction.armyTroops),
        alive: faction.alive !== false,
        eliminatedTurn: savedFaction.eliminatedTurn || null,
      };
    }
    return normalized;
  }

  function normalizeTiles(rawTiles) {
    const byId = new Map(rawTiles.map((tile) => [tile.id || tileId(tile.x, tile.y), tile]));
    return createEmptyTiles().map((empty) => {
      const tile = byId.get(empty.id) || empty;
      const type = Object.values(TILE_TYPES).includes(tile.type) ? tile.type : TILE_TYPES.EMPTY;
      const normalized = {
        ...empty,
        ...tile,
        id: empty.id,
        x: empty.x,
        y: empty.y,
        type,
        ownerId: tile.ownerId || null,
        resourceType: tile.resourceType || null,
        level: Math.max(0, Math.floor(Number(tile.level) || 0)),
        cityFactionId: tile.cityFactionId || null,
        cityPart: tile.cityPart || null,
        garrison: tile.garrison ? {
          troops: Math.max(0, Math.round(Number(tile.garrison.troops) || 0)),
          maxTroops: Math.max(0, Math.round(Number(tile.garrison.maxTroops) || Number(tile.garrison.troops) || 0)),
        } : null,
        garrisonArmyIds: Array.isArray(tile.garrisonArmyIds) ? tile.garrisonArmyIds.filter(Boolean).map(String) : [],
        fort: normalizeFort(tile.fort),
      };
      if (normalized.type === TILE_TYPES.EMPTY) {
        normalized.ownerId = isFactionId(normalized.ownerId) ? normalized.ownerId : null;
        normalized.resourceType = null;
        normalized.level = 0;
        normalized.cityFactionId = null;
        normalized.cityPart = null;
        normalized.garrison = null;
        if (!normalized.ownerId || normalized.fort?.factionId !== normalized.ownerId) normalized.fort = null;
      }
      if (normalized.type !== TILE_TYPES.EMPTY && normalized.fort) normalized.fort = null;
      return normalized;
    });
  }

  function normalizeFort(rawFort) {
    if (!rawFort || typeof rawFort !== "object") return null;
    const factionId = isFactionId(rawFort.factionId) ? rawFort.factionId : null;
    if (!factionId) return null;
    return {
      factionId,
      builtTurn: Math.max(1, Math.floor(Number(rawFort.builtTurn) || 1)),
    };
  }

  function normalizeArmies(rawArmies = {}, state) {
    const normalized = {};
    Object.values(rawArmies || {}).forEach((army) => {
      const faction = state.factions[army?.factionId];
      if (!faction) return;
      normalized[String(army.id)] = normalizeArmy(army, state);
    });
    return normalized;
  }

  function normalizeArmy(rawArmy, state) {
    const faction = state.factions[rawArmy.factionId];
    const homeTileId = tileById(state, rawArmy.homeTileId)?.id || homeTileIdForFaction(faction);
    const locationTileId = tileById(state, rawArmy.locationTileId)?.id || homeTileId;
    const status = ["idle", "occupy", "attack", "march", "return", "garrison", "buildFort"].includes(rawArmy.status)
      ? rawArmy.status
      : "idle";
    return {
      id: String(rawArmy.id),
      factionId: faction.id,
      name: String(rawArmy.name || `${faction.shortLabel}${armyIndexFromId(rawArmy.id) || 1}军`),
      homeTileId,
      locationTileId,
      status,
      stamina: clampInt(rawArmy.stamina, 0, ARMY_STAMINA_MAX, ARMY_STAMINA_MAX),
      currentCommandId: rawArmy.currentCommandId || null,
      formation: normalizeArmyFormation(rawArmy.formation),
    };
  }

  function normalizeCommands(rawCommands = [], state) {
    return rawCommands
      .filter((command) => command && command.status === "active" && state.armies[command.armyId])
      .map((command) => ({
        id: String(command.id || `cmd-${state.nextCommandId || 1}`),
        type: normalizeCommandType(command.type),
        factionId: command.factionId,
        armyId: command.armyId,
        originTileId: tileById(state, command.originTileId)?.id || state.armies[command.armyId].locationTileId,
        targetTileId: tileById(state, command.targetTileId)?.id || state.armies[command.armyId].locationTileId,
        remainingTurns: Math.max(0, Math.floor(Number(command.remainingTurns) || 0)),
        totalTurns: Math.max(1, Math.floor(Number(command.totalTurns) || Number(command.remainingTurns) || 1)),
        status: "active",
        createdTurn: Math.max(1, Math.floor(Number(command.createdTurn) || state.turn || 1)),
      }))
      .filter((command) => command.type);
  }

  function normalizeArmyFormation(rawFormation = [], totalTroops = 0) {
    const byPosition = new Map((Array.isArray(rawFormation) ? rawFormation : []).map((slot) => [slot.position, slot]));
    const distributed = distributeTroops(totalTroops);
    return POSITION_IDS.map((position, index) => {
      const slot = byPosition.get(position) || rawFormation[index] || {};
      const maxTroops = ARMY_SLOT_TROOP_CAP;
      const troops = totalTroops > 0
        ? distributed[index]
        : clampInt(slot.troops, 0, maxTroops, 0);
      const wounded = clampInt(slot.wounded, 0, maxTroops - troops, 0);
      return {
        position,
        heroId: slot.heroId || null,
        skills: [slot.skills?.[0] || null, slot.skills?.[1] || null],
        troops,
        wounded,
        maxTroops,
      };
    });
  }

  function distributeTroops(totalTroops) {
    const values = [];
    let remaining = Math.max(0, Math.min(TEAM_TROOP_CAP, Math.round(Number(totalTroops) || 0)));
    for (let index = 0; index < POSITION_IDS.length; index += 1) {
      const slotsLeft = POSITION_IDS.length - index;
      const troops = Math.min(ARMY_SLOT_TROOP_CAP, Math.ceil(remaining / slotsLeft));
      values.push(troops);
      remaining = Math.max(0, remaining - troops);
    }
    return values;
  }

  function ensureFactionArmyLimitInPlace(state, factionId, options = {}) {
    const faction = state.factions[factionId];
    if (!faction) return [];
    const limit = armyLimitForFaction(faction);
    const current = armiesForFaction(state, factionId);
    const created = [];
    for (let index = current.length + 1; index <= limit; index += 1) {
      const army = createArmyForFaction(state, factionId, index, {
        troops: options.initial && index === 1 ? INITIAL_ARMY_TROOPS : 0,
      });
      state.armies[army.id] = army;
      created.push(army);
    }
    return created;
  }

  function createArmyForFaction(state, factionId, index, options = {}) {
    const faction = state.factions[factionId];
    const homeTileId = homeTileIdForFaction(faction);
    return {
      id: `${factionId}-${index}`,
      factionId,
      name: `${faction.shortLabel}${index}军`,
      homeTileId,
      locationTileId: homeTileId,
      status: "idle",
      stamina: ARMY_STAMINA_MAX,
      currentCommandId: null,
      formation: normalizeArmyFormation([], options.troops || 0),
    };
  }

  function advanceSlgTurn(inputState, options = {}) {
    const state = normalizeSlgState(inputState);
    const events = [];
    if (state.gameStatus !== "playing") return result(state, events);

    collectIncomeInPlace(state, events);
    recoverArmiesInPlace(state, events);
    processCommandsInPlace(state, options, events);

    if (!options.skipAi) {
      for (const faction of aiFactions(state)) {
        if (state.gameStatus !== "playing" || !faction.alive) continue;
        recruitFactionArmyInPlace(state, faction.id, {}, events);
        upgradeMainCityInPlace(state, faction.id, events, { silentIfBlocked: true });
        replenishAiArmiesInPlace(state, faction.id, events);
        issueAiCommandInPlace(state, faction.id, options, events);
      }
    }

    state.turn += 1;
    checkVictoryStateInPlace(state);
    return result(state, events);
  }

  function collectIncomeInPlace(state, events) {
    for (const faction of aliveFactions(state)) {
      const income = factionIncome(state, faction.id);
      addResources(faction.resources, income);
      events.push({
        type: "income",
        factionId: faction.id,
        amount: income,
        text: `${faction.label}获得粮草${income.food}、木材${income.wood}、石料${income.stone}`,
      });
    }
  }

  function recoverArmiesInPlace(state, events) {
    for (const army of Object.values(state.armies)) {
      const faction = state.factions[army.factionId];
      if (!faction?.alive || army.currentCommandId) continue;
      const tile = tileById(state, army.locationTileId);
      const atSupply = isSupplyTileForFaction(state, tile, army.factionId);
      const recovery = atSupply ? ARMY_STAMINA_RECOVERY.supply : ARMY_STAMINA_RECOVERY.field;
      const beforeStamina = army.stamina;
      army.stamina = Math.min(ARMY_STAMINA_MAX, army.stamina + recovery);
      if (!atSupply) {
        if (army.stamina !== beforeStamina) {
          events.push({ type: "armyRest", factionId: army.factionId, armyId: army.id, stamina: army.stamina });
        }
        continue;
      }
      const recovered = recoverArmyWoundedInPlace(state, faction, army, ARMY_WOUNDED_RECOVERY_RATE);
      if (recovered.recovered > 0 || army.stamina !== beforeStamina) {
        events.push({
          type: "armyRecovered",
          factionId: army.factionId,
          armyId: army.id,
          recovered: recovered.recovered,
          foodCost: recovered.foodCost,
          stamina: army.stamina,
          text: `${army.name}休整恢复${recovered.recovered}兵，体力${army.stamina}`,
        });
      }
    }
  }

  function processCommandsInPlace(state, options, events) {
    for (const command of [...state.commands]) {
      if (command.status !== "active") continue;
      command.remainingTurns = Math.max(0, command.remainingTurns - 1);
      if (command.remainingTurns <= 0) completeCommandInPlace(state, command, options, events);
    }
    state.commands = state.commands.filter((command) => command.status === "active");
    normalizeTileArmyRefsInPlace(state);
  }

  function completeCommandInPlace(state, command, options = {}, events = []) {
    const army = state.armies[command.armyId];
    const target = tileById(state, command.targetTileId);
    if (!army || !target) {
      command.status = "failed";
      return;
    }
    army.currentCommandId = null;
    army.status = "idle";
    command.status = "resolved";

    if (command.type === COMMAND_TYPES.OCCUPY) {
      if (target.type === TILE_TYPES.EMPTY && target.ownerId !== command.factionId) {
        captureTileInPlace(state, command.factionId, target.id, events);
        army.locationTileId = target.id;
      } else {
        events.push({ type: "commandFailed", factionId: command.factionId, armyId: army.id, commandType: command.type, reason: "targetChanged" });
      }
      checkVictoryStateInPlace(state);
      return;
    }

    if (command.type === COMMAND_TYPES.ATTACK) {
      resolveArmyAttackInPlace(state, command, options, events);
      checkVictoryStateInPlace(state);
      return;
    }

    if (command.type === COMMAND_TYPES.MARCH || command.type === COMMAND_TYPES.RETURN) {
      army.locationTileId = target.id;
      events.push({
        type: command.type === COMMAND_TYPES.RETURN ? "armyReturned" : "armyMarched",
        factionId: command.factionId,
        armyId: army.id,
        tileId: target.id,
        text: `${army.name}${command.type === COMMAND_TYPES.RETURN ? "返回" : "调动至"}${tileLabel(state, target)}`,
      });
      return;
    }

    if (command.type === COMMAND_TYPES.GARRISON) {
      army.locationTileId = target.id;
      addGarrisonArmy(target, army.id);
      events.push({
        type: "armyGarrisoned",
        factionId: command.factionId,
        armyId: army.id,
        tileId: target.id,
        text: `${army.name}驻守${tileLabel(state, target)}`,
      });
      return;
    }

    if (command.type === COMMAND_TYPES.BUILD_FORT) {
      if (target.type === TILE_TYPES.EMPTY && target.ownerId === command.factionId && !target.fort) {
        target.fort = { factionId: command.factionId, builtTurn: state.turn };
        army.locationTileId = target.id;
        addGarrisonArmy(target, army.id);
        events.push({
          type: "fortBuilt",
          factionId: command.factionId,
          armyId: army.id,
          tileId: target.id,
          text: `${army.name}建成要塞${target.x},${target.y}`,
        });
      } else {
        events.push({ type: "commandFailed", factionId: command.factionId, armyId: army.id, commandType: command.type, reason: "targetChanged" });
      }
    }
  }

  function resolveArmyAttackInPlace(state, command, options = {}, events = []) {
    const army = state.armies[command.armyId];
    const tile = tileById(state, command.targetTileId);
    if (!army || !tile) return { ok: false, reason: "missingTarget" };
    if (tile.type === TILE_TYPES.EMPTY) {
      captureTileInPlace(state, command.factionId, tile.id, events);
      army.locationTileId = tile.id;
      return { ok: true };
    }

    const defenderId = tile.ownerId && tile.ownerId !== command.factionId ? tile.ownerId : NEUTRAL_FACTION_ID;
    const defenderArmy = primaryDefenderArmyForTile(state, tile, command.factionId);
    const attackerTroopsBefore = armyTotalTroops(army);
    const defenderTroopsBefore = defenderTroopsForTile(state, tile);
    const resolver = typeof options.resolveBattle === "function" ? options.resolveBattle : defaultResolveBattle;
    const outcome = resolver({
      state: cloneState(state),
      attackerId: command.factionId,
      defenderId,
      tile: cloneState(tile),
      army: cloneState(army),
      defenderArmy: defenderArmy ? cloneState(defenderArmy) : null,
      attackerTroops: attackerTroopsBefore,
      defenderTroops: defenderTroopsBefore,
      random: options.rng || Math.random,
    }) || {};
    const attackerWon = outcome.winner === "attacker" || outcome.winner === "player";
    const attackerTroopsAfter = clampInt(
      outcome.attackerTroops,
      0,
      attackerTroopsBefore,
      attackerWon ? Math.max(1, attackerTroopsBefore - Math.ceil(defenderTroopsBefore * 0.35)) : Math.max(0, attackerTroopsBefore - Math.ceil(defenderTroopsBefore * 0.45)),
    );
    const defenderTroopsAfter = clampInt(
      outcome.defenderTroops,
      0,
      defenderTroopsBefore,
      attackerWon ? 0 : Math.max(1, defenderTroopsBefore - Math.ceil(attackerTroopsBefore * 0.25)),
    );

    updateArmyFromBattleOutcome(army, outcome.attackerUnits, attackerTroopsAfter);
    if (defenderArmy) {
      updateArmyFromBattleOutcome(defenderArmy, outcome.defenderUnits, defenderTroopsAfter);
    } else {
      updateDefenderTroopsInPlace(state, tile, defenderId, defenderTroopsAfter, defenderTroopsBefore);
    }

    if (attackerWon) {
      captureTileInPlace(state, command.factionId, tile.id, events);
      army.locationTileId = tile.id;
    } else {
      army.locationTileId = fallbackRetreatTileId(state, army, command.originTileId);
    }

    const event = {
      type: "battle",
      attackerId: command.factionId,
      defenderId,
      armyId: army.id,
      tileId: tile.id,
      winner: attackerWon ? "attacker" : "defender",
      attackerTroopsBefore,
      attackerTroopsAfter: armyTotalTroops(army),
      defenderTroopsBefore,
      defenderTroopsAfter: defenderArmy ? armyTotalTroops(defenderArmy) : defenderTroopsAfter,
      battle: outcome.battle || null,
      text: battleEventText(state, command.factionId, defenderId, tile, attackerWon, army),
    };
    events.push(event);
    return { ok: true, ...event };
  }

  function defaultResolveBattle({ attackerTroops, defenderTroops, random = Math.random }) {
    const attackPower = attackerTroops * (0.9 + random() * 0.24);
    const defensePower = defenderTroops * (0.94 + random() * 0.16);
    if (attackPower >= defensePower) {
      return {
        winner: "attacker",
        attackerTroops: Math.max(1, Math.round(attackerTroops - defenderTroops * 0.42)),
        defenderTroops: 0,
      };
    }
    return {
      winner: "defender",
      attackerTroops: Math.max(0, Math.round(attackerTroops - defenderTroops * 0.52)),
      defenderTroops: Math.max(1, Math.round(defenderTroops - attackerTroops * 0.28)),
    };
  }

  function issueArmyCommand(inputState, factionId, armyId, type, targetTileId, options = {}) {
    const state = normalizeSlgState(inputState);
    const events = [];
    const payload = issueArmyCommandInPlace(state, factionId, armyId, type, targetTileId, options, events);
    return result(state, events, payload);
  }

  function issueArmyCommandInPlace(state, factionId, armyId, type, targetTileId, options = {}, events = []) {
    const army = state.armies[armyId];
    const target = tileById(state, targetTileId) || (type === COMMAND_TYPES.RETURN ? nearestSupplyTile(state, army) : null);
    const commandType = normalizeCommandType(type || commandTypeForTarget(target));
    const validation = validateArmyCommand(state, factionId, armyId, commandType, target?.id, options);
    if (!validation.ok) return validation;

    const faction = state.factions[factionId];
    if (commandType === COMMAND_TYPES.BUILD_FORT) spendResources(faction.resources, FORT_BUILD_COST);
    const cost = ARMY_STAMINA_COSTS[commandType] || 0;
    army.stamina = Math.max(0, army.stamina - cost);
    removeArmyFromGarrisons(state, army.id);

    const turns = options.immediate ? 0 : commandTurns(state, army, target, commandType);
    const command = {
      id: `cmd-${state.nextCommandId++}`,
      type: commandType,
      factionId,
      armyId,
      originTileId: army.locationTileId,
      targetTileId: target.id,
      remainingTurns: turns,
      totalTurns: Math.max(1, turns),
      status: "active",
      createdTurn: state.turn,
    };
    state.commands.push(command);
    army.currentCommandId = command.id;
    army.status = commandType;
    events.push({
      type: "commandIssued",
      factionId,
      armyId,
      commandId: command.id,
      commandType,
      targetTileId: target.id,
      remainingTurns: turns,
      text: `${army.name}下达${commandLabel(commandType)}：${tileLabel(state, target)}`,
    });
    if (options.immediate) completeCommandInPlace(state, command, options, events);
    return { ok: true, command };
  }

  function validateArmyCommand(state, factionId, armyId, type, targetTileId, options = {}) {
    const faction = state.factions[factionId];
    const army = state.armies[armyId];
    const target = tileById(state, targetTileId);
    if (state.gameStatus !== "playing") return { ok: false, reason: "gameOver" };
    if (!faction?.alive) return { ok: false, reason: "factionInactive" };
    if (!army || army.factionId !== factionId) return { ok: false, reason: "missingArmy" };
    if (army.currentCommandId) return { ok: false, reason: "armyBusy" };
    if (!target) return { ok: false, reason: "missingTile" };
    const commandType = normalizeCommandType(type);
    if (!commandType) return { ok: false, reason: "badCommand" };
    if ((ARMY_STAMINA_COSTS[commandType] || 0) > army.stamina) return { ok: false, reason: "stamina" };

    if (commandType === COMMAND_TYPES.OCCUPY) {
      if (target.type !== TILE_TYPES.EMPTY || target.ownerId === factionId) return { ok: false, reason: "notOccupiable" };
      if (!options.ignoreAdjacency && !canArmyReachAttackTarget(state, army, target)) return { ok: false, reason: "notAdjacent" };
      return { ok: true };
    }

    if (commandType === COMMAND_TYPES.ATTACK) {
      const isResource = target.type === TILE_TYPES.RESOURCE;
      const isCapital = target.type === TILE_TYPES.MAIN_CITY && target.cityPart === CITY_PARTS.CENTER;
      if ((!isResource && !isCapital) || target.ownerId === factionId) return { ok: false, reason: "notAttackable" };
      if (armyTotalTroops(army) <= 0) return { ok: false, reason: "noTroops" };
      if (!options.ignoreAdjacency && !canArmyReachAttackTarget(state, army, target)) return { ok: false, reason: "notAdjacent" };
      return { ok: true };
    }

    if (commandType === COMMAND_TYPES.MARCH) {
      if (target.ownerId !== factionId && target.fort?.factionId !== factionId) return { ok: false, reason: "notOwned" };
      return { ok: true };
    }

    if (commandType === COMMAND_TYPES.RETURN) {
      if (!isSupplyTileForFaction(state, target, factionId)) return { ok: false, reason: "notSupply" };
      return { ok: true };
    }

    if (commandType === COMMAND_TYPES.GARRISON) {
      if (target.ownerId !== factionId) return { ok: false, reason: "notOwned" };
      return { ok: true };
    }

    if (commandType === COMMAND_TYPES.BUILD_FORT) {
      if (target.type !== TILE_TYPES.EMPTY || target.ownerId !== factionId || target.fort) return { ok: false, reason: "badFortTile" };
      if (!canAfford(faction.resources, FORT_BUILD_COST)) return { ok: false, reason: "fortCost", cost: FORT_BUILD_COST };
      return { ok: true };
    }

    return { ok: false, reason: "badCommand" };
  }

  function canIssueArmyCommand(state, factionId, armyId, type, targetTileId, options = {}) {
    const normalized = normalizeSlgState(state);
    return validateArmyCommand(normalized, factionId, armyId, normalizeCommandType(type), targetTileId, options);
  }

  function replenishArmy(inputState, factionId, armyId) {
    const state = normalizeSlgState(inputState);
    const events = [];
    const army = state.armies[armyId];
    const faction = state.factions[factionId];
    if (!army || army.factionId !== factionId || !faction?.alive) return result(state, events, { ok: false, reason: "missingArmy" });
    const tile = tileById(state, army.locationTileId);
    if (!isSupplyTileForFaction(state, tile, factionId)) return result(state, events, { ok: false, reason: "notSupply" });
    const recovered = recoverArmyWoundedInPlace(state, faction, army, 1);
    const filled = fillArmyTroopsInPlace(faction, army);
    const payload = {
      ok: recovered.recovered > 0 || filled.filled > 0,
      recovered: recovered.recovered,
      filled: filled.filled,
      foodCost: recovered.foodCost + filled.foodCost,
    };
    if (payload.ok) {
      events.push({
        type: "armyReplenished",
        factionId,
        armyId,
        recovered: recovered.recovered,
        filled: filled.filled,
        foodCost: payload.foodCost,
        text: `${army.name}补员${filled.filled}，恢复伤兵${recovered.recovered}`,
      });
    }
    return result(state, events, payload);
  }

  function updateArmyFormation(inputState, factionId, armyId, formation) {
    const state = normalizeSlgState(inputState);
    const army = state.armies[armyId];
    if (!army || army.factionId !== factionId) return result(state, [], { ok: false, reason: "missingArmy" });
    const oldByPosition = new Map(army.formation.map((slot) => [slot.position, slot]));
    army.formation = POSITION_IDS.map((position, index) => {
      const incoming = (formation || []).find((slot) => slot.position === position) || formation?.[index] || {};
      const old = oldByPosition.get(position) || {};
      return {
        position,
        heroId: incoming.heroId || null,
        skills: [incoming.skills?.[0] || null, incoming.skills?.[1] || null],
        troops: clampInt(old.troops, 0, ARMY_SLOT_TROOP_CAP, 0),
        wounded: clampInt(old.wounded, 0, ARMY_SLOT_TROOP_CAP - clampInt(old.troops, 0, ARMY_SLOT_TROOP_CAP, 0), 0),
        maxTroops: ARMY_SLOT_TROOP_CAP,
      };
    });
    return result(state, [], { ok: true, army });
  }

  function recruitFactionArmy(inputState, factionId, options = {}) {
    const state = normalizeSlgState(inputState);
    const events = [];
    const payload = recruitFactionArmyInPlace(state, factionId, options, events);
    return result(state, events, payload);
  }

  function recruitFactionArmyInPlace(state, factionId, options = {}, events = []) {
    const faction = state.factions[factionId];
    if (!faction?.alive) return { ok: false, reason: "factionInactive", recruited: 0 };
    const wantedFood = Number.isFinite(Number(options.foodAmount))
      ? Math.max(0, Math.floor(Number(options.foodAmount)))
      : faction.resources.food;
    const foodCost = Math.min(faction.resources.food, wantedFood);
    const recruited = foodCost * TROOPS_PER_FOOD;
    if (foodCost <= 0 || recruited <= 0) {
      return { ok: false, reason: "noFood", recruited: 0 };
    }
    faction.resources.food -= foodCost;
    faction.armyTroops = normalizeTroops(faction.armyTroops + recruited);
    const event = {
      type: "recruit",
      factionId,
      foodCost,
      recruited,
      text: `${faction.label}征兵${recruited}，加入预备兵池`,
    };
    events.push(event);
    return { ok: true, ...event };
  }

  function upgradeMainCity(inputState, factionId) {
    const state = normalizeSlgState(inputState);
    const events = [];
    const payload = upgradeMainCityInPlace(state, factionId, events);
    return result(state, events, payload);
  }

  function upgradeMainCityInPlace(state, factionId, events = [], options = {}) {
    const faction = state.factions[factionId];
    if (!faction?.alive) return { ok: false, reason: "factionInactive" };
    if (faction.cityLevel >= MAX_CITY_LEVEL) return { ok: false, reason: "maxLevel" };
    const nextLevel = faction.cityLevel + 1;
    const cost = CITY_UPGRADE_COSTS[nextLevel];
    if (!canAfford(faction.resources, cost)) {
      if (!options.silentIfBlocked) events.push({ type: "blocked", factionId, reason: "upgradeCost" });
      return { ok: false, reason: "upgradeCost", cost };
    }
    spendResources(faction.resources, cost);
    faction.cityLevel = nextLevel;
    state.tiles
      .filter((tile) => tile.type === TILE_TYPES.MAIN_CITY && tile.cityFactionId === factionId)
      .forEach((tile) => {
        tile.level = nextLevel;
      });
    const createdArmies = ensureFactionArmyLimitInPlace(state, factionId);
    const event = {
      type: "upgrade",
      factionId,
      level: nextLevel,
      cost: { ...cost },
      createdArmyIds: createdArmies.map((army) => army.id),
      text: `${faction.label}主城升至${nextLevel}级`,
    };
    events.push(event);
    return { ok: true, ...event };
  }

  function attackTile(inputState, attackerId, targetTileId, options = {}) {
    const state = normalizeSlgState(inputState);
    const events = [];
    const target = tileById(state, targetTileId);
    const commandType = commandTypeForTarget(target);
    const army = readyArmiesForFaction(state, attackerId)
      .find((item) => validateArmyCommand(state, attackerId, item.id, commandType, targetTileId, options).ok);
    if (!army) return result(state, events, { ok: false, reason: "noReadyArmy" });
    const payload = issueArmyCommandInPlace(state, attackerId, army.id, commandType, targetTileId, { ...options, immediate: true }, events);
    return result(state, events, payload);
  }

  function captureTile(inputState, factionId, targetTileId) {
    const state = normalizeSlgState(inputState);
    const events = [];
    const payload = captureTileInPlace(state, factionId, targetTileId, events);
    checkVictoryStateInPlace(state);
    return result(state, events, payload);
  }

  function captureTileInPlace(state, factionId, targetTileId, events = []) {
    const tile = tileById(state, targetTileId);
    const faction = state.factions[factionId];
    if (!tile || !faction?.alive) return { ok: false, reason: "invalidCapture" };
    const oldOwnerId = tile.ownerId;
    removeEnemyGarrisonsFromTile(state, tile, factionId);
    if (tile.fort?.factionId && tile.fort.factionId !== factionId) tile.fort = null;

    if (tile.type === TILE_TYPES.RESOURCE) {
      tile.ownerId = factionId;
      if (tile.garrison) {
        const base = RESOURCE_GARRISON_TROOPS[tile.level] || RESOURCE_GARRISON_TROOPS[1];
        tile.garrison.troops = Math.max(1000, Math.round(base * 0.55));
        tile.garrison.maxTroops = base;
      }
      const event = {
        type: "capture",
        factionId,
        oldOwnerId,
        tileId: tile.id,
        text: `${faction.label}占领${RESOURCE_LABELS[tile.resourceType]}资源点`,
      };
      events.push(event);
      return { ok: true, ...event };
    }

    if (tile.type === TILE_TYPES.EMPTY) {
      tile.ownerId = factionId;
      const event = {
        type: "occupy",
        factionId,
        oldOwnerId,
        tileId: tile.id,
        text: `${faction.label}占领空地${tile.x},${tile.y}`,
      };
      events.push(event);
      return { ok: true, ...event };
    }

    if (tile.type === TILE_TYPES.MAIN_CITY && tile.cityPart === CITY_PARTS.CENTER) {
      const defeatedFactionId = tile.cityFactionId || oldOwnerId;
      state.tiles
        .filter((item) => item.type === TILE_TYPES.MAIN_CITY && item.cityFactionId === defeatedFactionId)
        .forEach((item) => {
          item.ownerId = factionId;
          removeEnemyGarrisonsFromTile(state, item, factionId);
        });
      eliminateFactionInPlace(state, defeatedFactionId, factionId);
      const event = {
        type: "capitalCaptured",
        factionId,
        defeatedFactionId,
        tileId: tile.id,
        text: `${faction.label}攻陷${state.factions[defeatedFactionId]?.label || "敌方"}主城`,
      };
      events.push(event);
      return { ok: true, ...event };
    }

    return { ok: false, reason: "notCapturable" };
  }

  function eliminateFactionInPlace(state, defeatedFactionId, winnerFactionId) {
    const defeated = state.factions[defeatedFactionId];
    if (!defeated || defeatedFactionId === winnerFactionId) return;
    defeated.alive = false;
    defeated.armyTroops = 0;
    defeated.eliminatedTurn = state.turn;
    Object.values(state.armies)
      .filter((army) => army.factionId === defeatedFactionId)
      .forEach((army) => {
        army.currentCommandId = null;
        army.status = "idle";
        army.stamina = 0;
        army.formation.forEach((slot) => {
          slot.troops = 0;
          slot.wounded = 0;
        });
      });
    state.commands = state.commands.filter((command) => command.factionId !== defeatedFactionId);
    state.tiles
      .filter((tile) => tile.ownerId === defeatedFactionId && tile.type !== TILE_TYPES.MAIN_CITY)
      .forEach((tile) => {
        tile.ownerId = winnerFactionId;
        if (tile.fort?.factionId === defeatedFactionId) tile.fort = null;
        removeEnemyGarrisonsFromTile(state, tile, winnerFactionId);
      });
  }

  function updateDefenderTroopsInPlace(state, tile, defenderId, troops, committedTroops = troops) {
    if (tile.type === TILE_TYPES.RESOURCE) {
      tile.garrison ||= { troops, maxTroops: Math.max(troops, RESOURCE_GARRISON_TROOPS[tile.level] || troops) };
      tile.garrison.troops = troops;
      return;
    }
    if (state.factions[defenderId]) {
      const faction = state.factions[defenderId];
      faction.armyTroops = normalizeTroops(faction.armyTroops - committedTroops + troops);
    }
  }

  function updateArmyFromBattleOutcome(army, units, aggregateTroops) {
    if (Array.isArray(units) && units.length) {
      const byPosition = new Map(units.map((unit) => [unit.position, unit]));
      army.formation.forEach((slot) => {
        const unit = byPosition.get(slot.position);
        slot.troops = clampInt(unit?.troops, 0, ARMY_SLOT_TROOP_CAP, 0);
        slot.wounded = clampInt(unit?.wounded, 0, ARMY_SLOT_TROOP_CAP - slot.troops, 0);
        slot.maxTroops = ARMY_SLOT_TROOP_CAP;
      });
      return;
    }
    const distributed = distributeTroops(aggregateTroops);
    army.formation.forEach((slot, index) => {
      const before = slot.troops;
      slot.troops = distributed[index] || 0;
      slot.wounded = clampInt(Math.round(Math.max(0, before - slot.troops) * 0.95), 0, ARMY_SLOT_TROOP_CAP - slot.troops, 0);
      slot.maxTroops = ARMY_SLOT_TROOP_CAP;
    });
  }

  function recoverArmyWoundedInPlace(state, faction, army, rate) {
    let recovered = 0;
    let foodCost = 0;
    for (const position of RECOVERY_ORDER) {
      const slot = army.formation.find((item) => item.position === position);
      if (!slot || slot.wounded <= 0 || faction.armyTroops <= 0 || faction.resources.food <= 0) continue;
      const target = Math.max(1, Math.ceil(slot.wounded * rate));
      const byReserve = Math.min(target, faction.armyTroops);
      const byFood = Math.min(byReserve, faction.resources.food * TROOPS_PER_FOOD);
      const amount = Math.min(byFood, slot.wounded, ARMY_SLOT_TROOP_CAP - slot.troops);
      if (amount <= 0) continue;
      const cost = Math.ceil(amount / TROOPS_PER_FOOD);
      faction.resources.food = Math.max(0, faction.resources.food - cost);
      faction.armyTroops = Math.max(0, faction.armyTroops - amount);
      slot.troops += amount;
      slot.wounded -= amount;
      recovered += amount;
      foodCost += cost;
    }
    return { recovered, foodCost };
  }

  function fillArmyTroopsInPlace(faction, army) {
    let filled = 0;
    let foodCost = 0;
    for (const position of RECOVERY_ORDER) {
      const slot = army.formation.find((item) => item.position === position);
      if (!slot || faction.armyTroops <= 0 || faction.resources.food <= 0) continue;
      const missing = Math.max(0, ARMY_SLOT_TROOP_CAP - slot.troops - slot.wounded);
      const byReserve = Math.min(missing, faction.armyTroops);
      const byFood = Math.min(byReserve, faction.resources.food * TROOPS_PER_FOOD);
      if (byFood <= 0) continue;
      const cost = Math.ceil(byFood / TROOPS_PER_FOOD);
      faction.resources.food = Math.max(0, faction.resources.food - cost);
      faction.armyTroops = Math.max(0, faction.armyTroops - byFood);
      slot.troops += byFood;
      filled += byFood;
      foodCost += cost;
    }
    return { filled, foodCost };
  }

  function replenishAiArmiesInPlace(state, factionId, events) {
    const faction = state.factions[factionId];
    if (!faction?.alive) return;
    for (const army of armiesForFaction(state, factionId)) {
      if (faction.armyTroops <= 0 || faction.resources.food <= 0) break;
      const tile = tileById(state, army.locationTileId);
      if (!isSupplyTileForFaction(state, tile, factionId)) continue;
      const filled = fillArmyTroopsInPlace(faction, army);
      if (filled.filled > 0) {
        events.push({ type: "armyReplenished", factionId, armyId: army.id, filled: filled.filled, foodCost: filled.foodCost });
      }
    }
  }

  function issueAiCommandInPlace(state, factionId, options, events) {
    const candidates = [];
    for (const army of readyArmiesForFaction(state, factionId)) {
      if (armyTotalTroops(army) <= 1600) continue;
      for (const tile of state.tiles) {
        const type = commandTypeForTarget(tile);
        if (!type) continue;
        const validation = validateArmyCommand(state, factionId, army.id, type, tile.id);
        if (!validation.ok) continue;
        candidates.push({ army, tile, type, score: aiTargetScore(state, factionId, army, tile) });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (!best) return null;
    return issueArmyCommandInPlace(state, factionId, best.army.id, best.type, best.tile.id, options, events);
  }

  function aiTargetScore(state, factionId, army, tile) {
    if (tile.type === TILE_TYPES.EMPTY) return 6 - manhattanDistance(tileById(state, army.locationTileId), tile) * 0.3;
    const defenderTroops = defenderTroopsForTile(state, tile);
    const troopRatio = armyTotalTroops(army) / Math.max(1, defenderTroops);
    let score = troopRatio * 35 - defenderTroops / 700;
    if (tile.type === TILE_TYPES.RESOURCE) {
      score += tile.level * 18;
      if (tile.resourceType === "food") score += 8;
    }
    if (tile.type === TILE_TYPES.MAIN_CITY && tile.cityPart === CITY_PARTS.CENTER) {
      score += 180;
      if (tile.ownerId === PLAYER_FACTION_ID) score += 30;
      if (troopRatio < 0.8) score -= 220;
    }
    if (army.stamina < 45) score -= 18;
    if (armyTotalWounded(army) > armyTotalTroops(army) * 0.35) score -= 22;
    return score;
  }

  function isAttackableTile(state, attackerId, targetTileId, armyId = null) {
    const normalized = normalizeSlgState(state);
    const target = tileById(normalized, targetTileId);
    const type = commandTypeForTarget(target);
    if (!type) return false;
    const armies = armyId ? [normalized.armies[armyId]].filter(Boolean) : readyArmiesForFaction(normalized, attackerId);
    return armies.some((army) => validateArmyCommand(normalized, attackerId, army.id, type, targetTileId).ok);
  }

  function commandTypeForTarget(tile) {
    if (!tile) return null;
    if (tile.type === TILE_TYPES.EMPTY) return COMMAND_TYPES.OCCUPY;
    if (tile.type === TILE_TYPES.RESOURCE) return COMMAND_TYPES.ATTACK;
    if (tile.type === TILE_TYPES.MAIN_CITY && tile.cityPart === CITY_PARTS.CENTER) return COMMAND_TYPES.ATTACK;
    return null;
  }

  function defenderTroopsForTile(state, tile) {
    if (!tile) return 0;
    const garrisonTroops = garrisonArmiesForTile(state, tile)
      .reduce((sum, army) => sum + armyTotalTroops(army), 0);
    if (garrisonTroops > 0) return garrisonTroops;
    if (tile.type === TILE_TYPES.RESOURCE) {
      const base = RESOURCE_GARRISON_TROOPS[tile.level] || RESOURCE_GARRISON_TROOPS[1];
      if (!tile.ownerId || tile.ownerId === NEUTRAL_FACTION_ID) return Math.max(1, tile.garrison?.troops || base);
      return Math.max(1, tile.garrison?.troops || Math.round(base * 0.55));
    }
    if (tile.type === TILE_TYPES.MAIN_CITY) {
      const ownerId = tile.ownerId || tile.cityFactionId;
      const homeArmies = armiesForFaction(state, ownerId)
        .filter((army) => army.locationTileId === tile.id || isSupplyTileForFaction(state, tileById(state, army.locationTileId), ownerId))
        .reduce((sum, army) => sum + Math.min(TEAM_TROOP_CAP, armyTotalTroops(army)), 0);
      if (homeArmies > 0) return deployableTeamTroops(homeArmies);
      return deployableTeamTroops(state.factions[ownerId]?.armyTroops || INITIAL_ARMY_TROOPS);
    }
    return 0;
  }

  function primaryDefenderArmyForTile(state, tile, attackerId) {
    return garrisonArmiesForTile(state, tile).find((army) => army.factionId !== attackerId) || null;
  }

  function garrisonArmiesForTile(state, tile) {
    return (tile?.garrisonArmyIds || []).map((id) => state.armies[id]).filter(Boolean);
  }

  function factionIncome(state, factionId) {
    const faction = state.factions[factionId];
    const income = { food: 0, wood: 0, stone: 0 };
    if (!faction?.alive) return income;
    addResources(income, CITY_PRODUCTION_BY_LEVEL[faction.cityLevel] || CITY_PRODUCTION_BY_LEVEL[1]);
    state.tiles.forEach((tile) => {
      if (tile.type !== TILE_TYPES.RESOURCE || tile.ownerId !== factionId) return;
      income[tile.resourceType] += RESOURCE_POINT_PRODUCTION[tile.level] || RESOURCE_POINT_PRODUCTION[1];
    });
    return income;
  }

  function canUpgradeMainCity(state, factionId) {
    const faction = state.factions[factionId];
    if (!faction?.alive || faction.cityLevel >= MAX_CITY_LEVEL) return false;
    return canAfford(faction.resources, CITY_UPGRADE_COSTS[faction.cityLevel + 1]);
  }

  function armyLimitForFaction(faction) {
    return ARMY_LIMIT_BY_CITY_LEVEL[faction?.cityLevel] || 1;
  }

  function armiesForFaction(state, factionId) {
    return Object.values(state.armies || {})
      .filter((army) => army.factionId === factionId)
      .sort((a, b) => armyIndexFromId(a.id) - armyIndexFromId(b.id) || a.id.localeCompare(b.id));
  }

  function readyArmiesForFaction(state, factionId) {
    return armiesForFaction(state, factionId).filter((army) => !army.currentCommandId && state.factions[factionId]?.alive);
  }

  function armyTotalTroops(army) {
    return (army?.formation || []).reduce((sum, slot) => sum + normalizeTroops(slot.troops), 0);
  }

  function armyTotalWounded(army) {
    return (army?.formation || []).reduce((sum, slot) => sum + normalizeTroops(slot.wounded), 0);
  }

  function armyCapacity(army) {
    return (army?.formation || []).reduce((sum, slot) => sum + normalizeTroops(slot.maxTroops || ARMY_SLOT_TROOP_CAP), 0);
  }

  function deployableTeamTroops(totalTroops) {
    return Math.max(0, Math.min(TEAM_TROOP_CAP, normalizeTroops(totalTroops)));
  }

  function canAfford(resources, cost = {}) {
    return Object.entries(cost).every(([key, value]) => (Number(resources[key]) || 0) >= value);
  }

  function spendResources(resources, cost = {}) {
    Object.entries(cost).forEach(([key, value]) => {
      resources[key] = Math.max(0, (Number(resources[key]) || 0) - value);
    });
  }

  function addResources(resources, amount = {}) {
    Object.entries(amount).forEach(([key, value]) => {
      resources[key] = Math.max(0, Math.floor((Number(resources[key]) || 0) + (Number(value) || 0)));
    });
  }

  function aliveFactions(state) {
    return Object.values(state.factions).filter((faction) => faction.alive);
  }

  function aiFactions(state) {
    return Object.values(state.factions).filter((faction) => faction.kind === "ai" && faction.alive);
  }

  function checkVictoryStateInPlace(state) {
    const player = state.factions[PLAYER_FACTION_ID];
    if (!player?.alive) {
      state.gameStatus = "defeat";
      state.winnerFactionId = Object.values(state.factions).find((faction) => faction.kind === "ai" && faction.alive)?.id || null;
      return;
    }
    const aliveAi = Object.values(state.factions).filter((faction) => faction.kind === "ai" && faction.alive);
    if (!aliveAi.length) {
      state.gameStatus = "victory";
      state.winnerFactionId = PLAYER_FACTION_ID;
      return;
    }
    if (state.gameStatus !== "playing") return;
    state.winnerFactionId = null;
  }

  function isAdjacentToFaction(state, tile, factionId) {
    return adjacentTiles(state, tile).some((candidate) => candidate.ownerId === factionId);
  }

  function canArmyReachAttackTarget(state, army, target) {
    const origin = tileById(state, army.locationTileId);
    if (!origin || !target) return false;
    if (isAdjacent(origin, target)) return true;
    if (origin.type === TILE_TYPES.MAIN_CITY && origin.ownerId === army.factionId) {
      const cityFactionId = origin.cityFactionId || origin.ownerId;
      if (state.tiles
        .filter((candidate) => candidate.type === TILE_TYPES.MAIN_CITY && candidate.cityFactionId === cityFactionId)
        .some((candidate) => isAdjacent(candidate, target))) {
        return true;
      }
    }
    if (target.type !== TILE_TYPES.MAIN_CITY || target.cityPart !== CITY_PARTS.CENTER) return false;
    const cityFactionId = target.cityFactionId || target.ownerId;
    return state.tiles
      .filter((candidate) => candidate.type === TILE_TYPES.MAIN_CITY && candidate.cityFactionId === cityFactionId)
      .some((candidate) => isAdjacent(origin, candidate));
  }

  function isSupplyTileForFaction(state, tile, factionId) {
    if (!tile) return false;
    if (tile.type === TILE_TYPES.MAIN_CITY && tile.ownerId === factionId) return true;
    return tile.fort?.factionId === factionId && tile.ownerId === factionId;
  }

  function nearestSupplyTile(state, army) {
    if (!army) return null;
    const origin = tileById(state, army.locationTileId);
    const faction = state.factions[army.factionId];
    return state.tiles
      .filter((tile) => isSupplyTileForFaction(state, tile, army.factionId))
      .sort((a, b) => manhattanDistance(origin, a) - manhattanDistance(origin, b))[0]
      || tileById(state, homeTileIdForFaction(faction));
  }

  function fallbackRetreatTileId(state, army, originTileId) {
    const origin = tileById(state, originTileId);
    if (origin?.ownerId === army.factionId || origin?.fort?.factionId === army.factionId) return origin.id;
    return nearestSupplyTile(state, army)?.id || army.homeTileId;
  }

  function commandTurns(state, army, target, commandType) {
    const origin = tileById(state, army.locationTileId);
    if (
      (commandType === COMMAND_TYPES.OCCUPY || commandType === COMMAND_TYPES.ATTACK)
      && canArmyReachAttackTarget(state, army, target)
    ) {
      return 1;
    }
    const travel = Math.max(1, manhattanDistance(origin, target));
    if (commandType === COMMAND_TYPES.BUILD_FORT) return travel + FORT_BUILD_TURNS - 1;
    return travel;
  }

  function adjacentTiles(state, tile) {
    if (!tile) return [];
    return [
      tileAt(state, tile.x + 1, tile.y),
      tileAt(state, tile.x - 1, tile.y),
      tileAt(state, tile.x, tile.y + 1),
      tileAt(state, tile.x, tile.y - 1),
    ].filter(Boolean);
  }

  function tileAt(state, x, y) {
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return null;
    return state.tiles[y * MAP_WIDTH + x] || null;
  }

  function tileById(state, id) {
    return state?.tiles?.find((tile) => tile.id === id) || null;
  }

  function tileId(x, y) {
    return `${x}-${y}`;
  }

  function tileLabel(state, tile) {
    if (!tile) return "未知地块";
    if (tile.type === TILE_TYPES.MAIN_CITY) {
      const faction = state.factions[tile.cityFactionId] || state.factions[tile.ownerId];
      return `${faction?.label || "未知"}主城${tile.cityPart === CITY_PARTS.CENTER ? "中心" : "城域"}`;
    }
    if (tile.type === TILE_TYPES.RESOURCE) return `${RESOURCE_LABELS[tile.resourceType]}${tile.level}级`;
    return `空地${tile.x},${tile.y}`;
  }

  function battleEventText(state, attackerId, defenderId, tile, attackerWon, army) {
    const attacker = state.factions[attackerId];
    const defender = state.factions[defenderId];
    const target = tile.type === TILE_TYPES.RESOURCE
      ? `${RESOURCE_LABELS[tile.resourceType]}资源点`
      : `${defender?.label || "中立"}主城`;
    return attackerWon
      ? `${army?.name || attacker?.label || "未知势力"}攻占${target}`
      : `${army?.name || attacker?.label || "未知势力"}进攻${target}失利`;
  }

  function commandLabel(type) {
    return ({
      [COMMAND_TYPES.OCCUPY]: "占领",
      [COMMAND_TYPES.ATTACK]: "出征",
      [COMMAND_TYPES.MARCH]: "调动",
      [COMMAND_TYPES.RETURN]: "返回",
      [COMMAND_TYPES.GARRISON]: "驻守",
      [COMMAND_TYPES.BUILD_FORT]: "建要塞",
    })[type] || "命令";
  }

  function normalizeCommandType(type) {
    return Object.values(COMMAND_TYPES).includes(type) ? type : null;
  }

  function addGarrisonArmy(tile, armyId) {
    tile.garrisonArmyIds ||= [];
    if (!tile.garrisonArmyIds.includes(armyId)) tile.garrisonArmyIds.push(armyId);
  }

  function removeArmyFromGarrisons(state, armyId) {
    state.tiles.forEach((tile) => {
      tile.garrisonArmyIds = (tile.garrisonArmyIds || []).filter((id) => id !== armyId);
    });
  }

  function removeEnemyGarrisonsFromTile(state, tile, factionId) {
    (tile.garrisonArmyIds || []).forEach((armyId) => {
      const army = state.armies[armyId];
      if (!army || army.factionId === factionId) return;
      army.locationTileId = fallbackRetreatTileId(state, army, army.homeTileId);
      army.currentCommandId = null;
      army.status = "idle";
    });
    tile.garrisonArmyIds = (tile.garrisonArmyIds || []).filter((armyId) => state.armies[armyId]?.factionId === factionId);
  }

  function normalizeTileArmyRefsInPlace(state) {
    state.tiles.forEach((tile) => {
      tile.garrisonArmyIds = (tile.garrisonArmyIds || []).filter((armyId) => {
        const army = state.armies[armyId];
        return army && army.locationTileId === tile.id && army.factionId === tile.ownerId;
      });
    });
  }

  function homeTileIdForFaction(faction) {
    return tileId(faction.homeCenter.x, faction.homeCenter.y);
  }

  function armyIndexFromId(id) {
    const match = String(id || "").match(/-(\d+)$/);
    return match ? Number(match[1]) : 0;
  }

  function numericCommandId(id) {
    const match = String(id || "").match(/(\d+)$/);
    return match ? Number(match[1]) : 0;
  }

  function isFactionId(ownerId) {
    return FACTIONS.some((faction) => faction.id === ownerId);
  }

  function isAdjacent(a, b) {
    return Boolean(a && b && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1);
  }

  function manhattanDistance(a, b) {
    if (!a || !b) return 1;
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  function normalizeTroops(value) {
    return clampInt(value, 0, Number.MAX_SAFE_INTEGER);
  }

  function normalizeResources(resources = {}) {
    return {
      food: Math.max(0, Math.floor(Number(resources.food) || 0)),
      wood: Math.max(0, Math.floor(Number(resources.wood) || 0)),
      stone: Math.max(0, Math.floor(Number(resources.stone) || 0)),
    };
  }

  function cloneState(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function result(state, events = [], extra = {}) {
    state.eventLog = [...(state.eventLog || []), ...events].slice(-60);
    return { state, events, ...extra };
  }

  function clampInt(value, min, max, fallback = min) {
    const numeric = Number(value);
    const source = Number.isFinite(numeric) ? numeric : fallback;
    return Math.max(min, Math.min(max, Math.round(source)));
  }

  function createSeededRng(seed) {
    let value = Math.floor(Number(seed) || DEFAULT_SEED) >>> 0;
    return () => {
      value += 0x6D2B79F5;
      let next = value;
      next = Math.imul(next ^ (next >>> 15), next | 1);
      next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
      return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
    };
  }

  global.STZB_SLG_WORLD = Object.freeze({
    createInitialSlgState,
    normalizeSlgState,
    advanceSlgTurn,
    recruitFactionArmy,
    upgradeMainCity,
    issueArmyCommand,
    canIssueArmyCommand,
    replenishArmy,
    updateArmyFormation,
    attackTile,
    captureTile,
    isAttackableTile,
    factionIncome,
    canUpgradeMainCity,
    defenderTroopsForTile,
    deployableTeamTroops,
    armiesForFaction,
    readyArmiesForFaction,
    armyTotalTroops,
    armyTotalWounded,
    armyCapacity,
    commandTypeForTarget,
    isSupplyTileForFaction,
    adjacentTiles,
    isAdjacentToFaction,
    tileAt,
    tileById,
    tileId,
    createSeededRng,
  });
})(globalThis);
