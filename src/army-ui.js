// DOM renderer for the SLG army management strip. App code owns state mutations.
(function registerArmyUi(global) {
  const rules = global.STZB_SLG_RULES;
  const world = global.STZB_SLG_WORLD;
  if (!rules || !world) throw new Error("SLG rules and world modules must load before army-ui");

  const {
    PLAYER_FACTION_ID,
    ARMY_STAMINA_MAX,
  } = rules;

  function createArmyUi({ container, callbacks = {} }) {
    container?.addEventListener("click", (event) => {
      const selectButton = event.target.closest("[data-army-select]");
      if (selectButton) {
        callbacks.onSelectArmy?.(selectButton.dataset.armySelect);
        return;
      }
      const actionButton = event.target.closest("[data-army-action]");
      if (!actionButton || actionButton.disabled) return;
      const armyId = actionButton.dataset.armyId;
      if (actionButton.dataset.armyAction === "replenish") callbacks.onReplenishArmy?.(armyId);
    });

    return {
      render(state, selectedArmyId) {
        renderArmyPanel(container, state, selectedArmyId);
      },
    };
  }

  function renderArmyPanel(container, state, selectedArmyId) {
    if (!container) return;
    const player = state.factions[PLAYER_FACTION_ID];
    const armies = world.armiesForFaction(state, PLAYER_FACTION_ID);
    const reserve = Math.max(0, Number(player.armyTroops) || 0);
    const totalTroops = armies.reduce((sum, army) => sum + world.armyTotalTroops(army), 0);
    const totalWounded = armies.reduce((sum, army) => sum + world.armyTotalWounded(army), 0);
    container.innerHTML = `
      <div class="army-panel-head">
        <div>
          <span>军团</span>
          <strong>${formatNumber(totalTroops)} 战力</strong>
        </div>
        <div class="army-reserve">
          <span>预备兵</span>
          <b>${formatNumber(reserve)}</b>
          ${totalWounded ? `<em>伤兵 ${formatNumber(totalWounded)}</em>` : "<em>可轮换补员</em>"}
        </div>
      </div>
      <div class="army-list">
        ${armies.map((army) => armyCardHtml(state, army, selectedArmyId)).join("")}
      </div>
    `;
  }

  function armyCardHtml(state, army, selectedArmyId) {
    const selected = army.id === selectedArmyId;
    const tile = world.tileById(state, army.locationTileId);
    const command = (state.commands || []).find((item) => item.id === army.currentCommandId);
    const troops = world.armyTotalTroops(army);
    const wounded = world.armyTotalWounded(army);
    const canReplenish = !army.currentCommandId && world.isSupplyTileForFaction(state, tile, army.factionId);
    const heroes = army.formation
      .map((slot) => slot.heroId ? heroName(slot.heroId) : "空位")
      .join(" / ");
    return `
      <article class="army-card ${selected ? "selected" : ""} ${army.currentCommandId ? "busy" : ""}">
        <button class="army-card-main" data-army-select="${escapeHtml(army.id)}" type="button">
          <span class="army-name">${escapeHtml(army.name)}</span>
          <b>${formatNumber(troops)}</b>
          <em>${escapeHtml(tileLabel(state, tile))}</em>
          <small>${escapeHtml(commandText(command))}</small>
        </button>
        <div class="army-card-stats">
          <span style="--army-pct:${percent(troops, world.armyCapacity(army))}%">兵 ${formatNumber(troops)}</span>
          <span style="--army-pct:${percent(army.stamina, ARMY_STAMINA_MAX)}%">体 ${formatNumber(army.stamina)}</span>
          <span style="--army-pct:${percent(wounded, Math.max(1, troops + wounded))}%">伤 ${formatNumber(wounded)}</span>
        </div>
        <p title="${escapeHtml(heroes)}">${escapeHtml(heroes)}</p>
        <button class="btn secondary army-replenish" data-army-action="replenish" data-army-id="${escapeHtml(army.id)}" type="button" ${canReplenish ? "" : "disabled"}>补员</button>
      </article>
    `;
  }

  function commandText(command) {
    if (!command) return "待命";
    const label = {
      occupy: "占领",
      attack: "出征",
      march: "调动",
      return: "返回",
      garrison: "驻守",
      buildFort: "建塞",
    }[command.type] || "命令";
    return `${label} · ${command.remainingTurns}回合`;
  }

  function tileLabel(state, tile) {
    if (!tile) return "未知";
    if (tile.type === "mainCity") {
      const faction = state.factions[tile.cityFactionId] || state.factions[tile.ownerId];
      return `${faction?.label || "未知"}主城`;
    }
    if (tile.type === "resource") return `${tile.x},${tile.y}资源`;
    if (tile.fort) return `${tile.x},${tile.y}要塞`;
    return `${tile.x},${tile.y}空地`;
  }

  function heroName(heroId) {
    return global.STZB_SEED_DATA?.HEROES?.find((hero) => hero.id === heroId)?.name || "武将";
  }

  function percent(value, max) {
    return Math.max(0, Math.min(100, Math.round((Number(value) || 0) / Math.max(1, Number(max) || 1) * 100)));
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

  global.STZB_ARMY_UI = Object.freeze({ createArmyUi });
})(globalThis);
