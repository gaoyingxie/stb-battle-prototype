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
    TROOPS_PER_FOOD,
    CITY_PRODUCTION_BY_LEVEL,
    CITY_UPGRADE_COSTS,
    RESOURCE_POINT_COUNTS,
    RESOURCE_POINT_PRODUCTION,
    RESOURCE_GARRISON_TROOPS,
    TILE_TYPES,
    CITY_PARTS,
  } = rules;

  const VERSION = 2;
  const DEFAULT_SEED = 20260516;

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
      eventLog: [],
    };

    placeMainCities(state);
    placeGuaranteedResourcePoints(state);
    placeRandomResourcePoints(state, rng);
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
      armyTroops: INITIAL_ARMY_TROOPS,
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
        }
      }
    }
  }

  function placeGuaranteedResourcePoints(state) {
    const placements = [
      { x: 5, y: 3, resourceType: "food", level: 1 },
      { x: 19, y: 3, resourceType: "wood", level: 1 },
      { x: 5, y: 21, resourceType: "stone", level: 1 },
      { x: 19, y: 21, resourceType: "food", level: 1 },
    ];
    placements.forEach((placement) => placeResourcePoint(state, placement));
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
    tile.cityFactionId = null;
    tile.cityPart = null;
    return true;
  }

  function normalizeSlgState(raw) {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.tiles)) return createInitialSlgState({ seed: DEFAULT_SEED });
    const state = cloneState(raw);
    state.version = VERSION;
    state.turn = Math.max(1, Number(state.turn) || 1);
    state.gameStatus = ["playing", "victory", "defeat"].includes(state.gameStatus) ? state.gameStatus : "playing";
    state.winnerFactionId = state.winnerFactionId || null;
    state.map = { width: MAP_WIDTH, height: MAP_HEIGHT };
    state.factions = normalizeFactions(state.factions);
    state.tiles = normalizeTiles(state.tiles);
    state.eventLog = Array.isArray(state.eventLog) ? state.eventLog.slice(-40) : [];
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
      };
      if (normalized.type === TILE_TYPES.EMPTY) {
        normalized.ownerId = isFactionId(normalized.ownerId) ? normalized.ownerId : null;
        normalized.resourceType = null;
        normalized.level = 0;
        normalized.cityFactionId = null;
        normalized.cityPart = null;
        normalized.garrison = null;
      }
      return normalized;
    });
  }

  function advanceSlgTurn(inputState, options = {}) {
    const state = normalizeSlgState(inputState);
    const events = [];
    if (state.gameStatus !== "playing") return result(state, events);

    collectIncomeInPlace(state, events);

    if (!options.skipAi) {
      for (const faction of aiFactions(state)) {
        if (state.gameStatus !== "playing" || !faction.alive) continue;
        recruitFactionArmyInPlace(state, faction.id, {}, events);
        upgradeMainCityInPlace(state, faction.id, events, { silentIfBlocked: true });
        const target = chooseAiTarget(state, faction.id);
        if (target && faction.armyTroops > 2200) {
          attackTileInPlace(state, faction.id, target.id, options, events);
        }
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
      text: `${faction.label}征兵${recruited}，消耗粮草${foodCost}`,
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
    const event = {
      type: "upgrade",
      factionId,
      level: nextLevel,
      cost: { ...cost },
      text: `${faction.label}主城升至${nextLevel}级`,
    };
    events.push(event);
    return { ok: true, ...event };
  }

  function attackTile(inputState, attackerId, targetTileId, options = {}) {
    const state = normalizeSlgState(inputState);
    const events = [];
    const payload = attackTileInPlace(state, attackerId, targetTileId, options, events);
    return result(state, events, payload);
  }

  function attackTileInPlace(state, attackerId, targetTileId, options = {}, events = []) {
    const attacker = state.factions[attackerId];
    const tile = tileById(state, targetTileId);
    const validation = validateAttack(state, attackerId, tile, options);
    if (!validation.ok) return validation;

    if (tile.type === TILE_TYPES.EMPTY) {
      const payload = captureTileInPlace(state, attackerId, tile.id, events);
      checkVictoryStateInPlace(state);
      return { ok: true, ...payload };
    }

    const defenderId = tile.ownerId && tile.ownerId !== attackerId ? tile.ownerId : NEUTRAL_FACTION_ID;
    const attackerArmyBefore = attacker.armyTroops;
    const attackerTroopsBefore = deployableTeamTroops(attackerArmyBefore);
    const defenderTroopsBefore = defenderTroopsForTile(state, tile);
    const resolver = typeof options.resolveBattle === "function" ? options.resolveBattle : defaultResolveBattle;
    const outcome = resolver({
      state: cloneState(state),
      attackerId,
      defenderId,
      tile: cloneState(tile),
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

    attacker.armyTroops = normalizeTroops(attackerArmyBefore - attackerTroopsBefore + attackerTroopsAfter);
    if (attackerWon) {
      captureTileInPlace(state, attackerId, tile.id, events);
    } else {
      updateDefenderTroopsInPlace(state, tile, defenderId, defenderTroopsAfter, defenderTroopsBefore);
    }

    checkVictoryStateInPlace(state);
    const event = {
      type: "battle",
      attackerId,
      defenderId,
      tileId: tile.id,
      winner: attackerWon ? "attacker" : "defender",
      attackerTroopsBefore,
      attackerTroopsAfter,
      defenderTroopsBefore,
      defenderTroopsAfter,
      battle: outcome.battle || null,
      text: battleEventText(state, attackerId, defenderId, tile, attackerWon),
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

  function battleEventText(state, attackerId, defenderId, tile, attackerWon) {
    const attacker = state.factions[attackerId];
    const defender = state.factions[defenderId];
    const target = tile.type === TILE_TYPES.RESOURCE
      ? `${RESOURCE_LABELS[tile.resourceType]}资源点`
      : `${defender?.label || "中立"}主城`;
    return attackerWon
      ? `${attacker?.label || "未知势力"}攻占${target}`
      : `${attacker?.label || "未知势力"}进攻${target}失利`;
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
    state.tiles
      .filter((tile) => tile.ownerId === defeatedFactionId && tile.type !== TILE_TYPES.MAIN_CITY)
      .forEach((tile) => {
        tile.ownerId = winnerFactionId;
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

  function validateAttack(state, attackerId, tile, options = {}) {
    const attacker = state.factions[attackerId];
    if (state.gameStatus !== "playing") return { ok: false, reason: "gameOver" };
    if (!attacker?.alive) return { ok: false, reason: "attackerInactive" };
    if (!tile) return { ok: false, reason: "missingTile" };
    if (tile.ownerId === attackerId) return { ok: false, reason: "alreadyOwned" };
    if (attacker.armyTroops <= 0) return { ok: false, reason: "noTroops" };
    const isEmpty = tile.type === TILE_TYPES.EMPTY;
    const isResource = tile.type === TILE_TYPES.RESOURCE;
    const isCapital = tile.type === TILE_TYPES.MAIN_CITY && tile.cityPart === CITY_PARTS.CENTER;
    if (!isEmpty && !isResource && !isCapital) return { ok: false, reason: "notAttackable" };
    if (!options.ignoreAdjacency && !canReachAttackTarget(state, tile, attackerId)) {
      return { ok: false, reason: "notAdjacent" };
    }
    return { ok: true };
  }

  function isAttackableTile(state, attackerId, targetTileId) {
    const normalized = normalizeSlgState(state);
    return validateAttack(normalized, attackerId, tileById(normalized, targetTileId)).ok;
  }

  function chooseAiTarget(state, factionId) {
    const candidates = state.tiles
      .filter((tile) => validateAttack(state, factionId, tile).ok)
      .map((tile) => ({ tile, score: aiTargetScore(state, factionId, tile) }))
      .sort((a, b) => b.score - a.score);
    return candidates[0]?.tile || null;
  }

  function aiTargetScore(state, factionId, tile) {
    if (tile.type === TILE_TYPES.EMPTY) return 6;
    const defenderTroops = defenderTroopsForTile(state, tile);
    const faction = state.factions[factionId];
    const troopRatio = deployableTeamTroops(faction.armyTroops) / Math.max(1, defenderTroops);
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
    return score;
  }

  function defenderTroopsForTile(state, tile) {
    if (!tile) return 0;
    if (tile.type === TILE_TYPES.RESOURCE) {
      const base = RESOURCE_GARRISON_TROOPS[tile.level] || RESOURCE_GARRISON_TROOPS[1];
      if (!tile.ownerId || tile.ownerId === NEUTRAL_FACTION_ID) return Math.max(1, tile.garrison?.troops || base);
      return deployableTeamTroops(Math.max(1, Math.round((tile.garrison?.troops || base) + (state.factions[tile.ownerId]?.armyTroops || 0) * 0.18)));
    }
    if (tile.type === TILE_TYPES.MAIN_CITY) {
      const armyTroops = state.factions[tile.ownerId]?.armyTroops;
      return deployableTeamTroops(Number.isFinite(Number(armyTroops)) ? armyTroops : INITIAL_ARMY_TROOPS);
    }
    return 0;
  }

  function deployableTeamTroops(totalTroops) {
    return Math.max(0, Math.min(TEAM_TROOP_CAP, normalizeTroops(totalTroops)));
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

  function canReachAttackTarget(state, tile, factionId) {
    if (isAdjacentToFaction(state, tile, factionId)) return true;
    if (tile?.type !== TILE_TYPES.MAIN_CITY || tile.cityPart !== CITY_PARTS.CENTER) return false;
    const cityFactionId = tile.cityFactionId || tile.ownerId;
    return state.tiles
      .filter((candidate) => candidate.type === TILE_TYPES.MAIN_CITY && candidate.cityFactionId === cityFactionId)
      .some((candidate) => adjacentTiles(state, candidate).some((neighbor) => neighbor.ownerId === factionId));
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
    return state.tiles.find((tile) => tile.id === id) || null;
  }

  function tileId(x, y) {
    return `${x}-${y}`;
  }

  function isFactionId(ownerId) {
    return FACTIONS.some((faction) => faction.id === ownerId);
  }

  function cloneState(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function result(state, events = [], extra = {}) {
    state.eventLog = [...(state.eventLog || []), ...events].slice(-40);
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
    attackTile,
    captureTile,
    isAttackableTile,
    factionIncome,
    canUpgradeMainCity,
    defenderTroopsForTile,
    deployableTeamTroops,
    adjacentTiles,
    isAdjacentToFaction,
    tileAt,
    tileById,
    tileId,
    createSeededRng,
  });
})(globalThis);
