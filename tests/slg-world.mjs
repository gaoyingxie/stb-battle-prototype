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

function playerArmy(state, index = 0) {
  return world.armiesForFaction(state, rules.PLAYER_FACTION_ID)[index];
}

function winBattle(attackerTroops = 7600) {
  return () => ({
    winner: "attacker",
    attackerTroops,
    defenderTroops: 0,
  });
}

let state = world.createInitialSlgState({ seed: 20260516 });

assert(state.version === 3, "SLG V2 存档版本应启用军团状态");
assert(state.tiles.length === rules.MAP_WIDTH * rules.MAP_HEIGHT, "SLG 地图应为 25x25");
assert(Object.values(state.factions).length === 4, "SLG 应有 4 个势力");
assert(Object.keys(state.armies).length === 4, "每个势力初始应有 1 支军团");
assert(world.armyTotalTroops(playerArmy(state)) === rules.INITIAL_ARMY_TROOPS, "玩家首支军团应带初始兵力");
assert(player(state).armyTroops === 0, "V2 势力兵力字段应作为预备兵池");
assert(state.commands.length === 0, "初始不应有进行中命令");

const resetFromOld = world.normalizeSlgState({ version: 2, seed: 20260516, tiles: [] });
assert(resetFromOld.version === 3 && Object.keys(resetFromOld.armies).length === 4, "旧 SLG 存档应重置为 V2 新结构");

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

const upgraded = world.upgradeMainCity(state, rules.PLAYER_FACTION_ID);
assert(upgraded.ok, "玩家初始木石应足够升级到 2 级");
assert(player(upgraded.state).cityLevel === 2, "升级后主城应为 2 级");
assert(world.armiesForFaction(upgraded.state, rules.PLAYER_FACTION_ID).length === 2, "2 级主城应解锁第 2 支军团");
assert(world.armyTotalTroops(playerArmy(upgraded.state, 1)) === 0, "新军团初始应为空兵，等待补员");

const recruited = world.recruitFactionArmy(state, rules.PLAYER_FACTION_ID);
assert(recruited.ok, "玩家初始粮草应足够征兵");
assert(player(recruited.state).resources.food < player(state).resources.food, "征兵应消耗粮草");
assert(player(recruited.state).armyTroops > player(state).armyTroops, "征兵应增加预备兵池");
assert(world.armyTotalTroops(playerArmy(recruited.state)) === rules.INITIAL_ARMY_TROOPS, "征兵不应直接改变已编军团兵力");

const adjacentEmpty = world.tileById(state, "1-3");
assert(adjacentEmpty?.type === rules.TILE_TYPES.EMPTY, "玩家主城旁应有可铺路空地");
assert(world.isAttackableTile(state, rules.PLAYER_FACTION_ID, adjacentEmpty.id, playerArmy(state).id), "选中军团应可占领相邻空地");
const occupiedOrder = world.issueArmyCommand(state, rules.PLAYER_FACTION_ID, playerArmy(state).id, rules.COMMAND_TYPES.OCCUPY, adjacentEmpty.id);
assert(occupiedOrder.ok, "占领空地应进入命令队列");
assert(occupiedOrder.state.commands.length === 1, "占领命令应记录为进行中命令");
assert(world.tileById(occupiedOrder.state, adjacentEmpty.id).ownerId !== rules.PLAYER_FACTION_ID, "命令到达前不应立即占领");
assert(playerArmy(occupiedOrder.state).stamina === rules.ARMY_STAMINA_MAX - rules.ARMY_STAMINA_COSTS.occupy, "下令应立即消耗体力");
const occupiedTurn = world.advanceSlgTurn(occupiedOrder.state, { skipAi: true });
assert(world.tileById(occupiedTurn.state, adjacentEmpty.id).ownerId === rules.PLAYER_FACTION_ID, "命令到达后空地应归属玩家");
assert(playerArmy(occupiedTurn.state).locationTileId === adjacentEmpty.id, "占领成功后军团应停留目标地");
assert(occupiedTurn.events.some((event) => event.type === "occupy"), "空地占领应记录事件");

const adjacentFood = world.tileById(state, "5-3");
assert(adjacentFood?.type === rules.TILE_TYPES.RESOURCE, "玩家主城旁应有首个可验证资源点");
const attackOrder = world.issueArmyCommand(state, rules.PLAYER_FACTION_ID, playerArmy(state).id, rules.COMMAND_TYPES.ATTACK, adjacentFood.id, {
  resolveBattle: winBattle(8200),
});
assert(attackOrder.ok, "资源点出征应进入命令队列");
const captured = world.advanceSlgTurn(attackOrder.state, { skipAi: true, resolveBattle: winBattle(8200) });
assert(world.tileById(captured.state, adjacentFood.id).ownerId === rules.PLAYER_FACTION_ID, "战胜守军后资源点应归属玩家");
assert(world.armyTotalTroops(playerArmy(captured.state)) === 8200, "战后应写回具体军团兵力");
assert(captured.events.some((event) => event.type === "battle"), "资源点战斗应记录战斗事件");

let recoveryState = world.createInitialSlgState({ seed: 20260516 });
player(recoveryState).armyTroops = 1000;
player(recoveryState).resources.food = 100;
playerArmy(recoveryState).stamina = 40;
playerArmy(recoveryState).formation[2].troops = 5000;
playerArmy(recoveryState).formation[2].wounded = 1000;
const recovered = world.advanceSlgTurn(recoveryState, { skipAi: true });
assert(playerArmy(recovered.state).stamina === 60, "主城休整应恢复 20 体力");
assert(playerArmy(recovered.state).formation[2].troops === 5350, "主城应按 35% 恢复伤兵");
assert(player(recovered.state).armyTroops === 650, "恢复伤兵应消耗预备兵");
assert(player(recovered.state).resources.food === 185, "恢复伤兵应在本回合产出后消耗粮草");

let fortState = occupiedTurn.state;
player(fortState).resources.wood = 1000;
player(fortState).resources.stone = 1000;
playerArmy(fortState).stamina = rules.ARMY_STAMINA_MAX;
const fortOrder = world.issueArmyCommand(fortState, rules.PLAYER_FACTION_ID, playerArmy(fortState).id, rules.COMMAND_TYPES.BUILD_FORT, adjacentEmpty.id);
assert(fortOrder.ok, "己方空地应可建造要塞");
assert(player(fortOrder.state).resources.wood === 400 && player(fortOrder.state).resources.stone === 500, "建造要塞应先扣除木石");
const fortHalf = world.advanceSlgTurn(fortOrder.state, { skipAi: true });
assert(!world.tileById(fortHalf.state, adjacentEmpty.id).fort, "要塞建造第 1 回合不应完成");
const fortDone = world.advanceSlgTurn(fortHalf.state, { skipAi: true });
assert(world.tileById(fortDone.state, adjacentEmpty.id).fort?.factionId === rules.PLAYER_FACTION_ID, "要塞建造完成后应写入地块");
assert(world.tileById(fortDone.state, adjacentEmpty.id).garrisonArmyIds.includes(playerArmy(fortDone.state).id), "建成要塞后军团应驻扎该地");

const returnOrder = world.issueArmyCommand(fortDone.state, rules.PLAYER_FACTION_ID, playerArmy(fortDone.state).id, rules.COMMAND_TYPES.RETURN, playerArmy(fortDone.state).homeTileId);
assert(returnOrder.ok, "军团应可返回主城补给");
const returnedOnce = world.advanceSlgTurn(returnOrder.state, { skipAi: true });
const returned = world.advanceSlgTurn(returnedOnce.state, { skipAi: true });
assert(playerArmy(returned.state).locationTileId === playerArmy(returned.state).homeTileId, "返回命令到达后军团应回到主城");

let garrisonState = world.captureTile(state, rules.PLAYER_FACTION_ID, adjacentFood.id).state;
playerArmy(garrisonState).locationTileId = adjacentFood.id;
world.tileById(garrisonState, adjacentFood.id).garrisonArmyIds = [playerArmy(garrisonState).id];
assert(world.defenderTroopsForTile(garrisonState, world.tileById(garrisonState, adjacentFood.id)) === world.armyTotalTroops(playerArmy(garrisonState)), "驻守部队应优先作为地块防守兵力");

let siegeState = world.captureTile(state, rules.PLAYER_FACTION_ID, "19-3").state;
playerArmy(siegeState).locationTileId = "19-3";
const northCenter = world.tileById(siegeState, "21-3");
const siegeOrder = world.issueArmyCommand(siegeState, rules.PLAYER_FACTION_ID, playerArmy(siegeState).id, rules.COMMAND_TYPES.ATTACK, northCenter.id, {
  resolveBattle: winBattle(7600),
});
assert(siegeOrder.ok, "贴住敌方城域后应能对主城中心下达攻城命令");
const capitalAttack = world.advanceSlgTurn(siegeOrder.state, { skipAi: true, resolveBattle: winBattle(7600) });
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
assert(aiTurn.state.commands.some((command) => command.factionId !== rules.PLAYER_FACTION_ID), "AI 应使用同一套命令队列下达行动");

console.log(JSON.stringify({
  tiles: state.tiles.length,
  armies: Object.keys(state.armies).length,
  playerReserve: player(recruited.state).armyTroops,
  occupiedTile: world.tileById(occupiedTurn.state, adjacentEmpty.id).ownerId,
  fort: world.tileById(fortDone.state, adjacentEmpty.id).fort?.factionId,
  victory: victoryState.gameStatus,
  defeat: defeated.state.gameStatus,
  aiCommands: aiTurn.state.commands.length,
}, null, 2));
