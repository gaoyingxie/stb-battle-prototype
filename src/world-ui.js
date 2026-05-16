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
    CITY_UPGRADE_COSTS,
    MAX_CITY_LEVEL,
    TILE_TYPES,
    CITY_PARTS,
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
      });
    });

    return {
      render(state, selectedTileId, uiState = {}) {
        renderWorldSummary(summaryEl, state, uiState);
        renderWorldMap(mapEl, state, selectedTileId);
        renderWorldDetail(detailEl, state, selectedTileId);
      },
    };
  }

  function renderWorldSummary(container, state, uiState = {}) {
    if (!container) return;
    const player = state.factions[PLAYER_FACTION_ID];
    const unreadReports = Math.max(0, Number(uiState.unreadReports) || 0);
    const reportCount = Math.max(0, Number(uiState.reportCount) || 0);
    const statusText = state.gameStatus === "victory"
      ? "天下归一"
      : state.gameStatus === "defeat" ? "主城陷落" : `第 ${state.turn} 回合`;
    container.innerHTML = `
      <div class="world-status">
        <span>天下形势</span>
        <strong>${escapeHtml(statusText)}</strong>
      </div>
      <div class="world-resource-bar">
        ${resourcePill("粮草", player.resources.food, "food")}
        ${resourcePill("木材", player.resources.wood, "wood")}
        ${resourcePill("石料", player.resources.stone, "stone")}
        <span class="world-resource-pill army"><b>兵力</b>${formatNumber(player.armyTroops)}/${formatNumber(player.maxArmyTroops)}</span>
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
      <div class="world-faction-strip" aria-label="势力领地概览">
        ${Object.values(state.factions).map((faction) => factionChipHtml(state, faction)).join("")}
      </div>
    `;
  }

  function resourcePill(label, value, type) {
    return `<span class="world-resource-pill resource-${escapeHtml(type)}"><b>${escapeHtml(label)}</b>${formatNumber(value)}</span>`;
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

  function renderWorldMap(container, state, selectedTileId) {
    if (!container) return;
    container.style.setProperty("--world-size", String(state.map.width));
    container.innerHTML = state.tiles.map((tile) => tileHtml(state, tile, selectedTileId)).join("");
  }

  function tileHtml(state, tile, selectedTileId) {
    const faction = state.factions[tile.ownerId];
    const selected = tile.id === selectedTileId;
    const attackable = world.isAttackableTile(state, PLAYER_FACTION_ID, tile.id);
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

  function renderWorldDetail(container, state, selectedTileId) {
    if (!container) return;
    const selected = world.tileById(state, selectedTileId) || playerHomeTile(state);
    const player = state.factions[PLAYER_FACTION_ID];
    const canAttack = selected && world.isAttackableTile(state, PLAYER_FACTION_ID, selected.id);
    const selectedIsPlayerCenter = selected?.type === TILE_TYPES.MAIN_CITY
      && selected.ownerId === PLAYER_FACTION_ID
      && selected.cityPart === CITY_PARTS.CENTER;
    const upgradeCost = CITY_UPGRADE_COSTS[player.cityLevel + 1] || null;
    const canUpgrade = world.canUpgradeMainCity(state, PLAYER_FACTION_ID);
    const recruitDisabled = player.resources.food <= 0 || player.armyTroops >= player.maxArmyTroops || state.gameStatus !== "playing";
    const owner = state.factions[selected.ownerId];
    const ownerStyle = owner?.color ? ` style="--owner-color:${escapeHtml(owner.color)}"` : "";
    const ownerName = ownerLabel(state, selected.ownerId);

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
          <span>守军</span><b>${formatNumber(world.defenderTroopsForTile(state, selected))}</b>
        </div>
        ${resourceYieldHtml(selected)}
        ${selectedIsPlayerCenter ? playerCityActionsHtml(player, upgradeCost, canUpgrade, recruitDisabled) : ""}
        ${canAttack ? `<button class="btn primary world-wide-action" data-world-action="attack" type="button">出征占领</button>` : ""}
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
    const costText = upgradeCost
      ? `木材${formatNumber(upgradeCost.wood)} / 石料${formatNumber(upgradeCost.stone)}`
      : "已满级";
    return `
      <div class="world-city-actions">
        <button class="btn secondary" data-world-action="recruit" type="button" ${recruitDisabled ? "disabled" : ""}>征兵</button>
        <button class="btn secondary" data-world-action="upgrade" type="button" ${canUpgrade ? "" : "disabled"}>
          升级主城
        </button>
        <small>下级消耗：${escapeHtml(costText)}</small>
      </div>
    `;
  }

  function resourceYieldHtml(tile) {
    if (tile.type !== TILE_TYPES.RESOURCE) return "";
    return `<p class="world-yield">${escapeHtml(RESOURCE_LABELS[tile.resourceType])}资源点，每回合产出随等级提升。</p>`;
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
    if (tile.ownerId === PLAYER_FACTION_ID) return "己方领地：可作为后续出征跳板。";
    if (canAttack && tile.type === TILE_TYPES.EMPTY) return "可占领空地：铺开领地边界。";
    if (canAttack && tile.type === TILE_TYPES.RESOURCE) return "可出征资源点：战胜后获得产出。";
    if (canAttack && tile.type === TILE_TYPES.MAIN_CITY) return "可攻城：胜利后该势力覆灭。";
    if (tile.ownerId && tile.ownerId !== NEUTRAL_FACTION_ID) return "敌方领地：先铺路贴近后再攻打。";
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
