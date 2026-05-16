// Turn-based SLG world constants. Keep this module free of DOM and battle runtime state.
(function registerSlgRules(global) {
  const MAP_WIDTH = 25;
  const MAP_HEIGHT = 25;
  const MAIN_CITY_SIZE = 3;
  const MAX_CITY_LEVEL = 5;
  const PLAYER_FACTION_ID = "player";
  const NEUTRAL_FACTION_ID = "neutral";

  const RESOURCE_TYPES = [
    { id: "food", label: "粮草", shortLabel: "粮" },
    { id: "wood", label: "木材", shortLabel: "木" },
    { id: "stone", label: "石料", shortLabel: "石" },
  ];

  const RESOURCE_LABELS = Object.fromEntries(RESOURCE_TYPES.map((item) => [item.id, item.label]));
  const RESOURCE_SHORT_LABELS = Object.fromEntries(RESOURCE_TYPES.map((item) => [item.id, item.shortLabel]));

  const FACTIONS = [
    {
      id: PLAYER_FACTION_ID,
      label: "玩家",
      shortLabel: "我",
      kind: "player",
      color: "#4f8cff",
      homeCenter: { x: 3, y: 3 },
    },
    {
      id: "ai-north",
      label: "北府",
      shortLabel: "北",
      kind: "ai",
      color: "#c65b5b",
      homeCenter: { x: 21, y: 3 },
    },
    {
      id: "ai-west",
      label: "西凉",
      shortLabel: "西",
      kind: "ai",
      color: "#b88a2f",
      homeCenter: { x: 3, y: 21 },
    },
    {
      id: "ai-east",
      label: "东吴",
      shortLabel: "东",
      kind: "ai",
      color: "#3aa66e",
      homeCenter: { x: 21, y: 21 },
    },
  ];

  const INITIAL_RESOURCES = Object.freeze({ food: 1200, wood: 800, stone: 800 });
  const INITIAL_ARMY_TROOPS = 9000;
  const MAX_ARMY_TROOPS = 30000;
  const TROOPS_PER_FOOD = 10;

  const CITY_PRODUCTION_BY_LEVEL = Object.freeze({
    1: Object.freeze({ food: 120, wood: 80, stone: 80 }),
    2: Object.freeze({ food: 180, wood: 120, stone: 120 }),
    3: Object.freeze({ food: 260, wood: 175, stone: 175 }),
    4: Object.freeze({ food: 360, wood: 240, stone: 240 }),
    5: Object.freeze({ food: 480, wood: 320, stone: 320 }),
  });

  const CITY_UPGRADE_COSTS = Object.freeze({
    2: Object.freeze({ wood: 300, stone: 260 }),
    3: Object.freeze({ wood: 720, stone: 640 }),
    4: Object.freeze({ wood: 1420, stone: 1320 }),
    5: Object.freeze({ wood: 2400, stone: 2300 }),
  });

  const RESOURCE_POINT_COUNTS = Object.freeze({
    food: 26,
    wood: 22,
    stone: 22,
  });

  const RESOURCE_POINT_PRODUCTION = Object.freeze({
    1: 45,
    2: 70,
    3: 100,
    4: 140,
  });

  const RESOURCE_GARRISON_TROOPS = Object.freeze({
    1: 4200,
    2: 7200,
    3: 10200,
    4: 13500,
  });

  const TILE_TYPES = Object.freeze({
    EMPTY: "empty",
    MAIN_CITY: "mainCity",
    RESOURCE: "resource",
  });

  const CITY_PARTS = Object.freeze({
    CENTER: "center",
    DISTRICT: "district",
  });

  global.STZB_SLG_RULES = Object.freeze({
    MAP_WIDTH,
    MAP_HEIGHT,
    MAIN_CITY_SIZE,
    MAX_CITY_LEVEL,
    PLAYER_FACTION_ID,
    NEUTRAL_FACTION_ID,
    RESOURCE_TYPES,
    RESOURCE_LABELS,
    RESOURCE_SHORT_LABELS,
    FACTIONS,
    INITIAL_RESOURCES,
    INITIAL_ARMY_TROOPS,
    MAX_ARMY_TROOPS,
    TROOPS_PER_FOOD,
    CITY_PRODUCTION_BY_LEVEL,
    CITY_UPGRADE_COSTS,
    RESOURCE_POINT_COUNTS,
    RESOURCE_POINT_PRODUCTION,
    RESOURCE_GARRISON_TROOPS,
    TILE_TYPES,
    CITY_PARTS,
  });
})(globalThis);
