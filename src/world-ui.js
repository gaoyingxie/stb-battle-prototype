// DOM renderer for the SLG world map. App code owns state mutations and callbacks.
(function registerWorldUi(global) {
  const rules = global.STZB_SLG_RULES;
  const world = global.STZB_SLG_WORLD;
  if (!rules || !world) throw new Error("SLG rules and world modules must load before world-ui");

  const {
    PLAYER_FACTION_ID,
    NEUTRAL_FACTION_ID,
    RESOURCE_LABELS,
    RESOURCE_SHORT_LABELS,
    CITY_PRODUCTION_BY_LEVEL,
    CITY_UPGRADE_COSTS,
    MAX_CITY_LEVEL,
    RESOURCE_POINT_PRODUCTION,
    TILE_TYPES,
    CITY_PARTS,
    TEAM_TROOP_CAP,
    TROOPS_PER_FOOD,
    COMMAND_TYPES,
    FORT_BUILD_COST,
  } = rules;

  function createWorldUi({ mapEl, detailEl, summaryEl, callbacks = {} }) {
    mapEl?.addEventListener("click", (event) => {
      const tileButton = event.target.closest("[data-world-tile-id]");
      if (!tileButton) return;
      callbacks.onSelectTile?.(tileButton.dataset.worldTileId);
    });

    [detailEl, summaryEl].filter(Boolean).forEach((root) => {
      root.addEventListener("click", (event) => {
        const button = event.target.closest("[data-world-action]");
        if (!button) return;
        const action = button.dataset.worldAction;
        if (action === "recruit") callbacks.onRecruit?.();
        if (action === "upgrade") callbacks.onUpgrade?.();
        if (action === "attack") callbacks.onAttack?.();
        if (action === "end-turn") callbacks.onEndTurn?.();
        if (action === "reports") callbacks.onOpenReports?.();
        if (action === "reset-world") callbacks.onResetWorld?.();
        if (action === "command") callbacks.onIssueCommand?.(button.dataset.worldCommand, button.dataset.worldTarget);
      });
    });

    return {
      render(state, selectedTileId, uiState = {}) {
        renderWorldSummary(summaryEl, state, uiState);
        renderWorldMap(mapEl, state, selectedTileId, uiState);
        renderWorldDetail(detailEl, state, selectedTileId, uiState);
      },
    };
  }

  function renderWorldSummary(container, state, uiState = {}) {
    if (!container) return;
    const player = state.factions[PLAYER_FACTION_ID];
    const unreadReports = Math.max(0, Number(uiState.unreadReports) || 0);
    const reportCount = Math.max(0, Number(uiState.reportCount) || 0);
    const income = world.factionIncome(state, PLAYER_FACTION_ID);
    const statusText = state.gameStatus === "victory"
      ? "天下归一"
      : state.gameStatus === "defeat" ? "主城陷落" : `第 ${state.turn} 回合`;
    container.innerHTML = `
      <div class="world-status">
        <span>天下形势</span>
        <strong>${escapeHtml(statusText)}</strong>
      </div>
      <div class="world-resource-bar">
        ${resourcePill("粮草", player.resources.food, "food", income.food)}
        ${resourcePill("木材", player.resources.wood, "wood", income.wood)}
        ${resourcePill("石料", player.resources.stone, "stone", income.stone)}
        <span class="world-resource-pill army">
          <b>预备兵</b>
          <span class="world-resource-value">${formatNumber(player.armyTroops)}</span>
          <em class="world-resource-income">${escapeHtml(armyReadinessText(state))}</em>
        </span>
      </div>
      <div class="world-summary-actions">
        <button class="btn secondary world-report-entry" data-world-action="reports" type="button">
          战报
          ${unreadReports > 0 ? `<span class="world-report-badge">${formatNumber(unreadReports)}</span>` : ""}
          ${unreadReports <= 0 && reportCount > 0 ? `<span class="world-report-count">${formatNumber(reportCount)}</span>` : ""}
        </button>
        <button class="btn secondary" data-world-action="reset-world" type="button">重置天下</button>
        <button class="btn primary" data-world-action="end-turn" type="button" ${state.gameStatus === "playing" ? "" : "disabled"}>结束回合</button>
      </div>
      <div class="world-next-step">
        <b>军务</b>
        <span>${escapeHtml(worldNextStepText(state, player))}</span>
      </div>
      <div class="world-faction-strip" aria-label="势力领地概览">
        ${Object.values(state.factions).map((faction) => factionChipHtml(state, faction)).join("")}
      </div>
    `;
  }

  function resourcePill(label, value, type, income = 0) {
    return `
      <span class="world-resource-pill resource-${escapeHtml(type)}" title="${escapeHtml(`${label}每回合 +${formatNumber(income)}`)}">
        <b>${escapeHtml(label)}</b>
        <span class="world-resource-value">${formatNumber(value)}</span>
        <em class="world-resource-income">+${formatNumber(income)} / 回合</em>
      </span>
    `;
  }

  function factionChipHtml(state, faction) {
    const territory = territoryCount(state, faction.id);
    const resources = resourceCount(state, faction.id);
    return `
      <span class="world-faction-chip ${faction.alive ? "" : "fallen"}" style="--owner-color:${escapeHtml(faction.color)}">
        <i>${escapeHtml(faction.shortLabel)}</i>
        <b>${escapeHtml(faction.label)}</b>
        <em>${faction.alive ? `${territory}地 / ${resources}资` : "已覆灭"}</em>
      </span>
    `;
  }

  function renderWorldMap(container, state, selectedTileId, uiState = {}) {
    if (!container) return;
    container.style.setProperty("--world-size", String(state.map.width));
    container.innerHTML = state.tiles.map((tile) => tileHtml(state, tile, selectedTileId, uiState)).join("");
  }

  function tileHtml(state, tile, selectedTileId, uiState = {}) {
    const faction = state.factions[tile.ownerId];
    const selected = tile.id === selectedTileId;
    const attackable = world.isAttackableTile(state, PLAYER_FACTION_ID, tile.id, uiState.selectedArmyId);
    const armies = Object.values(state.armies || {}).filter((army) => army.locationTileId === tile.id && world.armyTotalTroops(army) > 0);
    const commandTarget = (state.commands || []).some((command) => command.targetTileId === tile.id);
    const owned = tile.ownerId && tile.ownerId !== NEUTRAL_FACTION_ID;
    const classes = [
      "world-tile",
      `tile-${tile.type}`,
      owned ? "owned" : "",
      owned && tile.ownerId === PLAYER_FACTION_ID ? "owner-player" : "",
      owned && tile.ownerId !== PLAYER_FACTION_ID ? "owner-rival" : "",
      tile.ownerId && tile.ownerId !== NEUTRAL_FACTION_ID ? `owner-${tile.ownerId}` : "",
      tile.ownerId === NEUTRAL_FACTION_ID ? "owner-neutral" : "",
      tile.cityPart === CITY_PARTS.CENTER ? "city-center" : "",
      selected ? "selected" : "",
      attackable ? "attackable" : "",
      tile.fort ? "has-fort" : "",
      armies.length ? "has-army" : "",
      commandTarget ? "has-command" : "",
    ].filter(Boolean).join(" ");
    return `
      <button
        class="${classes}"
        data-world-tile-id="${tile.id}"
        data-x="${tile.x}"
        data-y="${tile.y}"
        data-owner="${escapeHtml(tile.ownerId || "none")}"
        type="button"
        title="${escapeHtml(tileTitle(state, tile))}"
        style="${faction?.color ? `--owner-color:${escapeHtml(faction.color)}` : ""}"
      >
        <span class="world-tile-glyph">${escapeHtml(tileGlyph(state, tile))}</span>
        ${tileLevelBadge(tile)}
        ${attackable ? `<span class="world-tile-action">${escapeHtml(tileActionLabel(tile))}</span>` : ""}
        ${tile.fort ? `<span class="world-tile-marker fort">塞</span>` : ""}
        ${tile.garrisonArmyIds?.length ? `<span class="world-tile-marker garrison">驻</span>` : ""}
        ${armies.length ? `<span class="world-tile-marker army">军</span>` : ""}
        ${commandTarget ? `<span class="world-tile-marker command">令</span>` : ""}
      </button>
    `;
  }

  function tileGlyph(state, tile) {
    if (tile.type === TILE_TYPES.MAIN_CITY) {
      const faction = state.factions[tile.cityFactionId] || state.factions[tile.ownerId];
      return tile.cityPart === CITY_PARTS.CENTER ? (faction?.shortLabel || "城") : "城";
    }
    if (tile.type === TILE_TYPES.RESOURCE) return RESOURCE_SHORT_LABELS[tile.resourceType] || "资";
    return "";
  }

  function tileLevelBadge(tile) {
    if (tile.type === TILE_TYPES.RESOURCE) return `<span class="world-tile-level">${formatNumber(tile.level)}</span>`;
    if (tile.type === TILE_TYPES.MAIN_CITY && tile.cityPart === CITY_PARTS.CENTER) {
      return `<span class="world-tile-level">${formatNumber(tile.level)}</span>`;
    }
    return "";
  }

  function tileActionLabel(tile) {
    if (tile.type === TILE_TYPES.EMPTY) return "占";
    if (tile.type === TILE_TYPES.MAIN_CITY) return "攻";
    return "征";
  }

  function tileTitle(state, tile) {
    const owner = ownerLabel(state, tile.ownerId);
    if (tile.type === TILE_TYPES.MAIN_CITY) {
      const faction = state.factions[tile.cityFactionId];
      return `${tile.x},${tile.y} ${faction?.label || "未知"}主城 ${tile.cityPart === CITY_PARTS.CENTER ? "中心" : "城域"} 归属：${owner}`;
    }
    if (tile.type === TILE_TYPES.RESOURCE) {
      return `${tile.x},${tile.y} ${RESOURCE_LABELS[tile.resourceType]}${tile.level}级 归属：${owner}`;
    }
    return `${tile.x},${tile.y} 空地 归属：${owner}`;
  }

  function renderWorldDetail(container, state, selectedTileId, uiState = {}) {
    if (!container) return;
    const selected = world.tileById(state, selectedTileId) || playerHomeTile(state);
    const player = state.factions[PLAYER_FACTION_ID];
    const selectedArmy = state.armies?.[uiState.selectedArmyId] || null;
    const canAttack = selected && world.isAttackableTile(state, PLAYER_FACTION_ID, selected.id, selectedArmy?.id);
    const selectedIsPlayerCenter = selected?.type === TILE_TYPES.MAIN_CITY
      && selected.ownerId === PLAYER_FACTION_ID
      && selected.cityPart === CITY_PARTS.CENTER;
    const upgradeCost = CITY_UPGRADE_COSTS[player.cityLevel + 1] || null;
    const canUpgrade = world.canUpgradeMainCity(state, PLAYER_FACTION_ID);
    const recruitDisabled = player.resources.food <= 0 || state.gameStatus !== "playing";
    const owner = state.factions[selected.ownerId];
    const ownerStyle = owner?.color ? ` style="--owner-color:${escapeHtml(owner.color)}"` : "";
    const ownerName = ownerLabel(state, selected.ownerId);
    const defenderTroops = world.defenderTroopsForTile(state, selected);

    container.innerHTML = `
      <div class="world-detail-card">
        <div class="world-detail-head">
          <div>
            <span>${escapeHtml(tileKindLabel(selected))}</span>
            <strong>${escapeHtml(tileMainLabel(state, selected))}</strong>
          </div>
          <b class="world-owner-badge ${selected.ownerId === PLAYER_FACTION_ID ? "player" : ""}"${ownerStyle}>${escapeHtml(ownerName)}</b>
        </div>
        <p class="world-action-hint ${canAttack ? "ready" : ""}">${escapeHtml(tileActionHint(state, selected, canAttack))}</p>
        <div class="world-detail-grid">
          <span>坐标</span><b>${selected.x}, ${selected.y}</b>
          <span>归属</span><b>${escapeHtml(ownerLabel(state, selected.ownerId))}</b>
          <span>等级</span><b>${selected.level || "-"}</b>
          <span>守军</span><b>${defenderTroops > 0 ? formatNumber(defenderTroops) : "无"}</b>
        </div>
        ${resourceYieldHtml(state, selected)}
        ${selectedIsPlayerCenter ? playerCityActionsHtml(player, upgradeCost, canUpgrade, recruitDisabled) : ""}
        ${armyCommandActionsHtml(state, selected, selectedArmy)}
        ${state.gameStatus !== "playing" ? `<p class="world-end-state">${escapeHtml(endStateText(state))}</p>` : ""}
      </div>
      <div class="world-factions">
        ${Object.values(state.factions).map((faction) => factionHtml(state, faction)).join("")}
      </div>
    `;
  }

  function playerHomeTile(state) {
    const player = state.factions[PLAYER_FACTION_ID];
    return world.tileAt(state, player.homeCenter.x, player.homeCenter.y);
  }

  function playerCityActionsHtml(player, upgradeCost, canUpgrade, recruitDisabled) {
    const currentProduction = cityProductionForLevel(player.cityLevel);
    const nextProduction = cityProductionForLevel(player.cityLevel + 1);
    const recruit = recruitPreview(player);
    const costText = upgradeCost
      ? `木材${formatNumber(upgradeCost.wood)} / 石料${formatNumber(upgradeCost.stone)}`
      : "已满级";
    const upgradeText = upgradeCost
      ? `${canUpgrade ? "可升级" : "升级"}：${costText}；下级主城产量 ${resourceLine(nextProduction)}`
      : "主城已满级，主城基础产量已到上限。";
    const recruitText = recruit.recruited > 0
      ? `征兵可新增 ${formatNumber(recruit.recruited)}，消耗粮草 ${formatNumber(recruit.foodCost)}`
      : "粮草不足，结束回合后再征兵。";
    return `
      <div class="world-city-economy">
        <span>主城产量</span>
        <strong>${escapeHtml(resourceLine(currentProduction))} / 回合</strong>
      </div>
      <div class="world-city-actions">
        <button class="btn secondary" data-world-action="recruit" type="button" ${recruitDisabled ? "disabled" : ""}>征兵</button>
        <button class="btn secondary" data-world-action="upgrade" type="button" ${canUpgrade ? "" : "disabled"}>
          升级主城
        </button>
        <small class="world-recruit-preview">${escapeHtml(recruitText)}</small>
        <small>${escapeHtml(upgradeText)}</small>
      </div>
    `;
  }

  function resourceYieldHtml(state, tile) {
    if (tile.type !== TILE_TYPES.RESOURCE) return "";
    const label = RESOURCE_LABELS[tile.resourceType] || "资源";
    const amount = resourcePointYield(tile);
    const ownerText = tile.ownerId === PLAYER_FACTION_ID
      ? "已计入上方每回合产量。"
      : tile.ownerId === NEUTRAL_FACTION_ID
        ? "占领后从下个结束回合开始结算。"
        : `${ownerLabel(state, tile.ownerId)}正在获得这块地产量。`;
    return `
      <div class="world-yield">
        <span>地块产量</span>
        <strong>+${formatNumber(amount)} ${escapeHtml(label)} / 回合</strong>
        <em>${escapeHtml(ownerText)}</em>
      </div>
    `;
  }

  function armyCommandActionsHtml(state, tile, army) {
    if (state.gameStatus !== "playing") return "";
    if (!army) {
      return `<p class="world-command-empty">先在军团栏选择一支部队，再对地块下令。</p>`;
    }
    const command = (state.commands || []).find((item) => item.id === army.currentCommandId);
    if (command) {
      return `<p class="world-command-empty">${escapeHtml(army.name)}正在执行${escapeHtml(commandLabel(command.type))}，剩余 ${formatNumber(command.remainingTurns)} 回合。</p>`;
    }
    const actions = [];
    const addCommand = (type, label, variant = "secondary") => {
      const validation = world.canIssueArmyCommand(state, PLAYER_FACTION_ID, army.id, type, tile.id);
      if (!validation.ok) return;
      actions.push(`<button class="btn ${variant} world-command-btn" data-world-action="command" data-world-command="${escapeHtml(type)}" data-world-target="${escapeHtml(tile.id)}" type="button">${escapeHtml(label)}</button>`);
    };

    if (tile.type === TILE_TYPES.EMPTY && tile.ownerId !== PLAYER_FACTION_ID) {
      addCommand(COMMAND_TYPES.OCCUPY, "占领空地", "primary");
    }
    if (
      tile.ownerId !== PLAYER_FACTION_ID
      && (tile.type === TILE_TYPES.RESOURCE || (tile.type === TILE_TYPES.MAIN_CITY && tile.cityPart === CITY_PARTS.CENTER))
    ) {
      addCommand(COMMAND_TYPES.ATTACK, attackButtonLabel(tile), "primary");
    }
    if (tile.ownerId === PLAYER_FACTION_ID || tile.fort?.factionId === PLAYER_FACTION_ID) {
      if (tile.id !== army.locationTileId) addCommand(COMMAND_TYPES.MARCH, "调动至此");
      addCommand(COMMAND_TYPES.GARRISON, tile.id === army.locationTileId ? "就地驻守" : "调动驻守");
      if (world.isSupplyTileForFaction(state, tile, PLAYER_FACTION_ID) && tile.id !== army.locationTileId) {
        addCommand(COMMAND_TYPES.RETURN, "返回补给");
      }
      if (tile.type === TILE_TYPES.EMPTY && !tile.fort) {
        addCommand(COMMAND_TYPES.BUILD_FORT, `建要塞（木${formatNumber(FORT_BUILD_COST.wood)} 石${formatNumber(FORT_BUILD_COST.stone)}）`);
      }
    }
    if (!actions.length) {
      const location = world.tileById(state, army.locationTileId);
      return `<p class="world-command-empty">${escapeHtml(army.name)}位于 ${location ? `${location.x},${location.y}` : "未知"}，当前地块暂无可执行命令。</p>`;
    }
    return `<div class="world-command-actions">${actions.join("")}</div>`;
  }

  function factionHtml(state, faction) {
    const territory = territoryCount(state, faction.id);
    const resources = resourceCount(state, faction.id);
    return `
      <article class="world-faction ${faction.alive ? "" : "fallen"}" style="--owner-color:${escapeHtml(faction.color)}">
        <span>${escapeHtml(faction.shortLabel)}</span>
        <div>
          <strong>${escapeHtml(faction.label)}</strong>
          <small>${faction.alive ? `主城${faction.cityLevel}级 · 兵力${formatNumber(faction.armyTroops)} · ${territory}地/${resources}资` : "已覆灭"}</small>
        </div>
      </article>
    `;
  }

  function tileActionHint(state, tile, canAttack) {
    if (state.gameStatus !== "playing") return endStateText(state);
    if (tile.ownerId === PLAYER_FACTION_ID && tile.type === TILE_TYPES.RESOURCE) {
      return `己方资源点：每回合 +${formatNumber(resourcePointYield(tile))} ${RESOURCE_LABELS[tile.resourceType]}。`;
    }
    if (tile.ownerId === PLAYER_FACTION_ID && tile.type === TILE_TYPES.MAIN_CITY && tile.cityPart === CITY_PARTS.CENTER) {
      return `主城中心：当前基础产量 ${resourceLine(cityProductionForLevel(state.factions[PLAYER_FACTION_ID].cityLevel))}。`;
    }
    if (tile.ownerId === PLAYER_FACTION_ID) return "己方领地：可作为后续出征跳板。";
    if (canAttack && tile.type === TILE_TYPES.EMPTY) return "可占领空地：铺开领地边界。";
    if (canAttack && tile.type === TILE_TYPES.RESOURCE) {
      return `可出征资源点：战胜后每回合 +${formatNumber(resourcePointYield(tile))} ${RESOURCE_LABELS[tile.resourceType]}。`;
    }
    if (canAttack && tile.type === TILE_TYPES.MAIN_CITY) return "可攻城：胜利后该势力覆灭。";
    if (tile.ownerId && tile.ownerId !== NEUTRAL_FACTION_ID) return "敌方领地：先铺路贴近后再攻打。";
    if (tile.type === TILE_TYPES.RESOURCE) {
      return `尚未接壤：先铺路靠近，再争夺每回合 +${formatNumber(resourcePointYield(tile))} 的产量。`;
    }
    return "尚未接壤：从己方相邻地块向外扩张。";
  }

  function tileKindLabel(tile) {
    if (tile.type === TILE_TYPES.MAIN_CITY) return tile.cityPart === CITY_PARTS.CENTER ? "主城中心" : "主城城域";
    if (tile.type === TILE_TYPES.RESOURCE) return "资源点";
    return "空地";
  }

  function tileMainLabel(state, tile) {
    if (tile.type === TILE_TYPES.MAIN_CITY) {
      const faction = state.factions[tile.cityFactionId] || state.factions[tile.ownerId];
      return `${faction?.label || "未知"}主城`;
    }
    if (tile.type === TILE_TYPES.RESOURCE) return `${RESOURCE_LABELS[tile.resourceType]} ${tile.level}级`;
    return "未开发地块";
  }

  function ownerLabel(state, ownerId) {
    if (!ownerId) return "无";
    if (ownerId === NEUTRAL_FACTION_ID) return "中立";
    return state.factions[ownerId]?.label || ownerId;
  }

  function territoryCount(state, factionId) {
    return Array.isArray(state.tiles) ? state.tiles.filter((tile) => tile.ownerId === factionId).length : 0;
  }

  function resourceCount(state, factionId) {
    return Array.isArray(state.tiles) ? state.tiles.filter((tile) => tile.ownerId === factionId && tile.type === TILE_TYPES.RESOURCE).length : 0;
  }

  function resourcePointYield(tile) {
    return RESOURCE_POINT_PRODUCTION[tile.level] || RESOURCE_POINT_PRODUCTION[1] || 0;
  }

  function cityProductionForLevel(level) {
    return CITY_PRODUCTION_BY_LEVEL[level] || CITY_PRODUCTION_BY_LEVEL[MAX_CITY_LEVEL] || CITY_PRODUCTION_BY_LEVEL[1];
  }

  function resourceLine(values = {}) {
    return `粮草+${formatNumber(values.food)} / 木材+${formatNumber(values.wood)} / 石料+${formatNumber(values.stone)}`;
  }

  function recruitPreview(player) {
    const foodCost = Math.max(0, Math.floor(Number(player.resources.food) || 0));
    return {
      foodCost,
      recruited: foodCost * TROOPS_PER_FOOD,
    };
  }

  function armyReadinessText(state) {
    const armies = world.armiesForFaction(state, PLAYER_FACTION_ID);
    const ready = armies.filter((army) => !army.currentCommandId).length;
    const troops = armies.reduce((sum, army) => sum + world.armyTotalTroops(army), 0);
    return `${formatNumber(ready)}支待命 / 军团${formatNumber(troops)}`;
  }

  function attackButtonLabel(tile) {
    if (tile.type === TILE_TYPES.EMPTY) return "占领空地";
    if (tile.type === TILE_TYPES.MAIN_CITY) return "攻打主城";
    const label = RESOURCE_LABELS[tile.resourceType] || "资源";
    return `出征占领（+${formatNumber(resourcePointYield(tile))}${label}/回合）`;
  }

  function worldNextStepText(state, player) {
    if (state.gameStatus !== "playing") return endStateText(state);
    const recruit = recruitPreview(player);
    const armies = world.armiesForFaction(state, PLAYER_FACTION_ID);
    const weakest = armies.sort((a, b) => world.armyTotalTroops(a) - world.armyTotalTroops(b))[0];
    if (recruit.recruited > 0 && weakest && world.armyTotalTroops(weakest) < Math.ceil(TEAM_TROOP_CAP * 0.82)) {
      return `${weakest.name}兵力 ${formatNumber(world.armyTotalTroops(weakest))}，可征兵新增 ${formatNumber(recruit.recruited)} 预备兵。`;
    }
    if (world.canUpgradeMainCity(state, PLAYER_FACTION_ID)) {
      return `资源已够，升级主城可提升基础产量。`;
    }
    const attackable = state.tiles.filter((tile) => world.isAttackableTile(state, PLAYER_FACTION_ID, tile.id));
    const resourceTargets = attackable.filter((tile) => tile.type === TILE_TYPES.RESOURCE);
    if (resourceTargets.length) {
      const best = resourceTargets
        .map((tile) => ({ tile, amount: resourcePointYield(tile) }))
        .sort((a, b) => b.amount - a.amount)[0];
      return `附近有 ${resourceTargets.length} 个资源点可争夺，最高每回合 +${formatNumber(best.amount)} ${RESOURCE_LABELS[best.tile.resourceType]}。`;
    }
    if (attackable.length) {
      return `附近有 ${attackable.length} 个地块可扩张，先铺路打开资源点。`;
    }
    return "当前没有接壤目标，结束回合观察敌我边界变化。";
  }

  function commandLabel(type) {
    return ({
      occupy: "占领",
      attack: "出征",
      march: "调动",
      return: "返回",
      garrison: "驻守",
      buildFort: "建要塞",
    })[type] || "命令";
  }

  function deployableTeamTroops(totalTroops) {
    return Math.max(0, Math.min(TEAM_TROOP_CAP, Math.round(Number(totalTroops) || 0)));
  }

  function endStateText(state) {
    if (state.gameStatus === "victory") return "你已经统一全国。";
    if (state.gameStatus === "defeat") return "玩家主城陷落，天下易主。";
    return "";
  }

  function formatNumber(value) {
    return Math.round(Number(value) || 0).toLocaleString("zh-CN");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }[char]));
  }

  global.STZB_WORLD_UI = Object.freeze({ createWorldUi });
})(globalThis);
