globalThis.window = globalThis;

await import("../src/slg-rules.js");
await import("../src/slg-world.js");

const rules = globalThis.STZB_SLG_RULES;
const world = globalThis.STZB_SLG_WORLD;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function player(state) {
  return state.factions[rules.PLAYER_FACTION_ID];
}

const state = world.createInitialSlgState({ seed: 20260516 });

assert(state.tiles.length === rules.MAP_WIDTH * rules.MAP_HEIGHT, "SLG 地图应为 25x25");
assert(Object.values(state.factions).length === 4, "SLG 首版应有 4 个势力");

for (const faction of Object.values(state.factions)) {
  const cityTiles = state.tiles.filter((tile) => tile.type === rules.TILE_TYPES.MAIN_CITY && tile.cityFactionId === faction.id);
  const center = world.tileAt(state, faction.homeCenter.x, faction.homeCenter.y);
  assert(cityTiles.length === 9, `${faction.label}主城应占 9 格`);
  assert(center.cityPart === rules.CITY_PARTS.CENTER, `${faction.label}主城中心缺失`);
}

for (const resourceType of Object.keys(rules.RESOURCE_POINT_COUNTS)) {
  const count = state.tiles.filter((tile) => tile.type === rules.TILE_TYPES.RESOURCE && tile.resourceType === resourceType).length;
  assert(count === rules.RESOURCE_POINT_COUNTS[resourceType], `${resourceType}资源点数量不正确`);
}

const adjacentFood = world.tileById(state, "5-3");
assert(adjacentFood?.type === rules.TILE_TYPES.RESOURCE, "玩家主城旁应有首个可验证资源点");
assert(world.isAttackableTile(state, rules.PLAYER_FACTION_ID, adjacentFood.id), "相邻资源点应可出征");

const adjacentEmpty = world.tileById(state, "1-3");
assert(adjacentEmpty?.type === rules.TILE_TYPES.EMPTY, "玩家主城旁应有可铺路空地");
assert(world.isAttackableTile(state, rules.PLAYER_FACTION_ID, adjacentEmpty.id), "相邻空地应可出征铺路");
const occupiedEmpty = world.attackTile(state, rules.PLAYER_FACTION_ID, adjacentEmpty.id);
assert(occupiedEmpty.ok, "出征空地应直接完成占领");
assert(occupiedEmpty.events.some((event) => event.type === "occupy"), "空地占领应记录铺路事件");
assert(world.tileById(occupiedEmpty.state, adjacentEmpty.id).ownerId === rules.PLAYER_FACTION_ID, "空地占领后应归属玩家");
assert(world.normalizeSlgState(occupiedEmpty.state).tiles.find((tile) => tile.id === adjacentEmpty.id).ownerId === rules.PLAYER_FACTION_ID, "已占空地应能存档恢复");

const recruited = world.recruitFactionArmy(state, rules.PLAYER_FACTION_ID);
assert(recruited.ok, "玩家初始粮草应足够征兵");
assert(player(recruited.state).resources.food < player(state).resources.food, "征兵应消耗粮草");
assert(player(recruited.state).armyTroops > player(state).armyTroops, "征兵应增加兵力");

const reserveBase = world.createInitialSlgState({ seed: 20260516 });
player(reserveBase).armyTroops = 52000;
player(reserveBase).resources.food = 1000;
const reserveRecruit = world.recruitFactionArmy(reserveBase, rules.PLAYER_FACTION_ID);
assert(reserveRecruit.ok, "势力兵力超过单队上限后仍应允许继续征兵");
assert(player(reserveRecruit.state).armyTroops === 62000, "征兵应增加势力总兵力，不受 3 万单队上限限制");
assert(world.deployableTeamTroops(player(reserveRecruit.state).armyTroops) === rules.TEAM_TROOP_CAP, "单次出征可投入兵力应封顶为一队 3 万");

const upgraded = world.upgradeMainCity(state, rules.PLAYER_FACTION_ID);
assert(upgraded.ok, "玩家初始木石应足够升级到 2 级");
assert(player(upgraded.state).cityLevel === 2, "升级后主城应为 2 级");
assert(player(upgraded.state).resources.wood < player(state).resources.wood, "升级应消耗木材");
assert(player(upgraded.state).resources.stone < player(state).resources.stone, "升级应消耗石料");

const incomeBefore = player(upgraded.state).resources.food;
const incomeTurn = world.advanceSlgTurn(upgraded.state, { skipAi: true });
assert(incomeTurn.state.turn === upgraded.state.turn + 1, "结束回合应推进回合数");
assert(player(incomeTurn.state).resources.food > incomeBefore, "结束回合应结算粮草产出");

const captured = world.attackTile(recruited.state, rules.PLAYER_FACTION_ID, adjacentFood.id, {
  resolveBattle: () => ({
    winner: "attacker",
    attackerTroops: 8200,
    defenderTroops: 0,
  }),
});
assert(captured.ok, "战胜守军后应完成出征结算");
assert(world.tileById(captured.state, adjacentFood.id).ownerId === rules.PLAYER_FACTION_ID, "胜利后资源点应归属玩家");
assert(player(captured.state).armyTroops === 8200, "战后玩家兵力应写回长期状态");

const reserveAttack = world.attackTile(reserveRecruit.state, rules.PLAYER_FACTION_ID, adjacentFood.id, {
  resolveBattle: ({ attackerTroops }) => {
    assert(attackerTroops === rules.TEAM_TROOP_CAP, "出征战斗只能抽调单队 3 万兵力");
    return {
      winner: "attacker",
      attackerTroops: 18000,
      defenderTroops: 0,
    };
  },
});
assert(reserveAttack.ok, "有预备兵时仍应正常出征");
assert(player(reserveAttack.state).armyTroops === 50000, "战后只扣除参战队伍损失，未出征的势力预备兵应保留");

let siegeState = world.captureTile(state, rules.PLAYER_FACTION_ID, "19-3").state;
const northCenter = world.tileById(siegeState, "21-3");
assert(world.isAttackableTile(siegeState, rules.PLAYER_FACTION_ID, northCenter.id), "贴住敌方城域后应能攻打主城中心");
const capitalAttack = world.attackTile(siegeState, rules.PLAYER_FACTION_ID, northCenter.id, {
  resolveBattle: () => ({
    winner: "attacker",
    attackerTroops: 7600,
    defenderTroops: 0,
  }),
});
assert(capitalAttack.ok, "攻城胜利后应完成主城占领");
assert(!capitalAttack.state.factions["ai-north"].alive, "主城中心被攻陷后 AI 势力应覆灭");

let victoryState = captured.state;
for (const faction of Object.values(victoryState.factions).filter((item) => item.kind === "ai")) {
  const center = world.tileAt(victoryState, faction.homeCenter.x, faction.homeCenter.y);
  victoryState = world.captureTile(victoryState, rules.PLAYER_FACTION_ID, center.id).state;
}
assert(victoryState.gameStatus === "victory", "攻灭三个 AI 主城后应胜利");
assert(victoryState.winnerFactionId === rules.PLAYER_FACTION_ID, "胜利方应为玩家");

const defeatBase = world.createInitialSlgState({ seed: 20260516 });
const playerCenter = world.tileAt(defeatBase, player(defeatBase).homeCenter.x, player(defeatBase).homeCenter.y);
const defeated = world.captureTile(defeatBase, "ai-north", playerCenter.id);
assert(defeated.state.gameStatus === "defeat", "玩家主城中心被占领后应失败");
assert(!player(defeated.state).alive, "失败后玩家势力应被标记为覆灭");

const aiTurn = world.advanceSlgTurn(world.createInitialSlgState({ seed: 20260516 }), {
  resolveBattle: ({ attackerTroops, defenderTroops }) => ({
    winner: attackerTroops >= defenderTroops ? "attacker" : "defender",
    attackerTroops: Math.max(1, attackerTroops - 1000),
    defenderTroops: attackerTroops >= defenderTroops ? 0 : Math.max(1, defenderTroops - 1000),
  }),
});
assert(aiTurn.state.turn === 2, "AI 回合后应推进到第 2 回合");
assert(aiTurn.events.some((event) => event.type === "income"), "AI 回合应包含产出事件");

console.log(JSON.stringify({
  tiles: state.tiles.length,
  resources: Object.fromEntries(Object.keys(rules.RESOURCE_POINT_COUNTS).map((type) => [
    type,
    state.tiles.filter((tile) => tile.resourceType === type).length,
  ])),
  victory: victoryState.gameStatus,
  defeat: defeated.state.gameStatus,
  aiEvents: aiTurn.events.length,
}, null, 2));
