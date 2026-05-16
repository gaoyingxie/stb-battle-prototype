// Battle report modal and log/message rendering helpers. Loaded before app.js; functions read app globals when invoked.

function toBattleSnapshot(battle) {
  return {
    winner: battle.winner,
    label: battle.label,
    subtitle: battle.subtitle,
    rounds: battle.rounds,
    complete: battle.complete,
    finishReason: battle.finishReason,
    encounter: battle.encounter || 1,
    maxEncounters: battle.maxEncounters || 1,
    initialPlayer: (battle.initialPlayer || battle.player || []).map(unitSnapshot),
    initialEnemy: (battle.initialEnemy || battle.enemy || []).map(unitSnapshot),
    player: (battle.player || []).map(unitSnapshot),
    enemy: (battle.enemy || []).map(unitSnapshot),
    log: (battle.log || []).map(reportEntrySnapshot),
  };
}

function unitSnapshot(unit) {
  return {
    id: unit.id,
    heroId: unit.heroId,
    side: unit.side,
    position: unit.position,
    name: unit.name,
    faction: unit.faction,
    arm: unit.arm,
    rarity: unit.rarity,
    portrait: unit.portrait || portraitForHero(unit),
    distance: unit.distance,
    stats: { ...(unit.stats || {}) },
    bonuses: [...(unit.bonuses || [])],
    skills: (unit.skills || []).map(skillSnapshot),
    troops: Math.max(0, Math.round(unit.troops || 0)),
    wounded: Math.max(0, Math.round(unit.wounded || 0)),
    maxTroops: Number.isFinite(Number(unit.maxTroops)) ? Math.max(0, Math.round(Number(unit.maxTroops))) : 10000,
    statuses: [...(unit.statuses || [])],
  };
}

function skillSnapshot(skill) {
  return {
    id: skill.id,
    name: skill.name,
    grade: skill.grade,
    type: skill.type,
    distance: skill.distance,
    icon: skill.icon,
  };
}

function reportEntrySnapshot(entry) {
  return {
    ...entry,
    participants: (entry.participants || []).map((participant) => ({ ...participant })),
    details: [...(entry.details || [])],
  };
}

function addBattleReport(battle, series = {}) {
  const report = {
    id: `battle-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: battleReportTitle(battle),
    createdAt: Date.now(),
    read: false,
    seriesId: series.seriesId || null,
    seriesIndex: Math.max(1, Number(series.seriesIndex) || Number(battle?.encounter) || 1),
    seriesSize: Math.max(1, Number(series.seriesSize) || Number(battle?.maxEncounters) || 1),
    battle,
  };
  state.battleReports = [...(state.battleReports || []), report].slice(-BATTLE_REPORT_LIMIT);
  selectedBattleReportId = report.id;
  battleReportView = "summary";
  battleReportStatsTab = "hero";
}

function battleReportTitle(battle) {
  const playerName = battle?.player?.[0]?.name || "我军";
  const enemyName = battle?.enemy?.[0]?.name || "守军";
  const encounter = Number(battle?.encounter) || 1;
  return `${playerName} 对阵 ${enemyName}${encounter > 1 ? `（第${encounter}轮）` : ""}`;
}

function renderBattleReportBadge() {
  const unread = (state.battleReports || []).filter((report) => !report.read).length;
  els.reportBadge.textContent = unread;
  els.reportBadge.hidden = unread <= 0;
  els.openBattleReports.classList.toggle("has-unread", unread > 0);
}

function openBattleReportList() {
  stopBattleReplay();
  battleReportView = "list";
  selectedBattleReportId ||= latestBattleReport()?.id || null;
  renderBattleReportModal();
  els.battleReportModal.showModal();
}

function handleBattleReportAction(button) {
  const action = button.dataset.reportAction;
  if (action === "toggle-series") {
    const seriesId = button.dataset.reportSeriesId;
    if (!seriesId) return;
    if (expandedBattleReportSeriesIds.has(seriesId)) {
      expandedBattleReportSeriesIds.delete(seriesId);
    } else {
      expandedBattleReportSeriesIds.add(seriesId);
    }
    renderBattleReportModal();
    return;
  }
  if (action === "open") {
    stopBattleReplay();
    selectedBattleReportId = button.dataset.reportId;
    battleReportView = "summary";
    battleReportStatsTab = "hero";
    battleReportFormationSide = "player";
    markBattleReportRead(selectedBattleReportId);
    saveState();
    renderBattleReportBadge();
    renderBattleReportModal();
    return;
  }
  if (action === "back") {
    stopBattleReplay();
    battleReportView = "list";
    renderBattleReportModal();
    return;
  }
  if (action === "summary" || action === "log" || action === "stats" || action === "formation" || action === "replay") {
    if (action !== "replay") stopBattleReplay();
    if (action === "replay") {
      const report = selectedBattleReport();
      if (!battleReportCanReplay(report?.battle)) {
        battleReportView = "log";
        renderBattleReportModal();
        return;
      }
      ensureBattleReplayState(report, true);
    }
    battleReportView = action;
    renderBattleReportModal();
    return;
  }
  if (action === "replay-toggle") {
    const report = selectedBattleReport();
    const state = ensureBattleReplayState(report);
    const total = battleReplayStepCount(report?.battle);
    if (!state.playing && state.step >= total) state.step = 0;
    state.playing = !state.playing;
    renderBattleReportModal();
    scheduleBattleReplay(report);
    return;
  }
  if (action === "replay-step") {
    const report = selectedBattleReport();
    const state = ensureBattleReplayState(report);
    const direction = button.dataset.step === "prev" ? -1 : 1;
    state.playing = false;
    setBattleReplayStep(report, state.step + direction);
    renderBattleReportModal();
    return;
  }
  if (action === "replay-scrub") {
    const report = selectedBattleReport();
    const state = ensureBattleReplayState(report);
    state.playing = false;
    setBattleReplayStep(report, Number(button.value) || 0);
    renderBattleReportModal();
    return;
  }
  if (action === "replay-speed") {
    const report = selectedBattleReport();
    setBattleReplaySpeed(report, Number(button.dataset.speed) || 1);
    renderBattleReportModal();
    scheduleBattleReplay(report);
    return;
  }
  if (action === "formation-side") {
    stopBattleReplay();
    battleReportFormationSide = button.dataset.side === "enemy" ? "enemy" : "player";
    battleReportView = "formation";
    renderBattleReportModal();
    return;
  }
  if (action === "hero-stats" || action === "skill-stats") {
    stopBattleReplay();
    battleReportStatsTab = action === "hero-stats" ? "hero" : "skill";
    battleReportView = "stats";
    renderBattleReportModal();
    return;
  }
  if (action === "mark-all-read") {
    (state.battleReports || []).forEach((report) => {
      report.read = true;
    });
    saveState();
    renderBattleReportBadge();
    renderBattleReportModal();
  }
}

function handleBattleReportClose() {
  if (battleReportView === "log" || battleReportView === "stats" || battleReportView === "formation" || battleReportView === "replay") {
    stopBattleReplay();
    battleReportView = "summary";
    renderBattleReportModal();
    return;
  }
  stopBattleReplay();
  els.battleReportModal.close();
}

function markBattleReportRead(reportId) {
  const report = state.battleReports.find((item) => item.id === reportId);
  if (report) report.read = true;
}

function latestBattleReport() {
  return (state.battleReports || []).at(-1) || null;
}

function selectedBattleReport() {
  return state.battleReports.find((report) => report.id === selectedBattleReportId) || latestBattleReport();
}

function renderBattleReportModal() {
  const report = selectedBattleReport();
  if (battleReportView === "list" || !report) {
    els.battleReportEyebrow.textContent = `${state.battleReports.length} 封战报`;
    els.battleReportTitle.textContent = "个人战报";
    els.battleReportContent.innerHTML = battleReportListHtml();
    return;
  }

  const viewTitle = battleReportView === "stats" ? "统计" : battleReportView === "log" ? "战报详情" : battleReportView === "formation" ? "阵容详情" : "战斗地点";
  els.battleReportEyebrow.textContent = `id:${report.id.slice(-8)}`;
  els.battleReportTitle.textContent = viewTitle;
  els.battleReportContent.innerHTML = battleReportDetailHtml(report);
}

function battleReportListHtml() {
  const reportGroups = battleReportListGroups();
  return `
    <div class="battle-report-list-view">
      <div class="battle-report-toolbar">
        <div class="battle-report-tabs" aria-label="战报分类">
          <button class="active" type="button">个人</button>
          <button type="button" disabled>收藏</button>
        </div>
        <div class="battle-report-tools">
          <button class="battle-report-tool" type="button" disabled>搜索</button>
          <button class="battle-report-tool" data-report-action="mark-all-read" type="button">设为全部已读</button>
        </div>
      </div>
      <div class="battle-report-list">
        ${reportGroups.length ? reportGroups.map(battleReportListGroupHtml).join("") : '<div class="empty-report">暂无战报。点击开战后会生成一封完整战报。</div>'}
      </div>
    </div>
  `;
}

function battleReportListGroups() {
  const groups = [];
  let currentGroup = null;
  (state.battleReports || []).forEach((report) => {
    const explicitSeriesId = report.seriesId || "";
    if (explicitSeriesId) {
      if (currentGroup?.explicit && currentGroup.id === explicitSeriesId) {
        currentGroup.reports.push(report);
      } else {
        currentGroup = {
          id: explicitSeriesId,
          explicit: true,
          reports: [report],
        };
        groups.push(currentGroup);
      }
      return;
    }

    if (currentGroup && !currentGroup.explicit && battleReportCanInferSameSeries(currentGroup.reports.at(-1), report)) {
      currentGroup.reports.push(report);
      currentGroup.id = `legacy-${currentGroup.reports[0].id}-${report.id}`;
      return;
    }

    currentGroup = {
      id: `legacy-${report.id}`,
      explicit: false,
      reports: [report],
    };
    groups.push(currentGroup);
  });

  return groups
    .map((group) => ({
      ...group,
      primary: group.reports.at(-1),
    }))
    .reverse();
}

function battleReportListGroupHtml(group) {
  const foldedReports = battleReportFoldedReports(group);
  if (!foldedReports.length) {
    return [...group.reports].reverse().map((report) => battleReportListCardHtml(report)).join("");
  }

  const expanded = expandedBattleReportSeriesIds.has(group.id);
  const hasUnread = group.reports.some((report) => !report.read);
  const children = expanded
    ? `
      <div class="battle-report-series-children">
        ${[...foldedReports].reverse().map((report) => battleReportListCardHtml(report, { variant: "child" })).join("")}
      </div>
    `
    : "";
  const toggleLabel = expanded ? `收起${foldedReports.length}封平局战报` : `展开${foldedReports.length}封平局战报`;

  return `
    <section class="battle-report-series ${expanded ? "expanded" : ""} ${hasUnread ? "unread" : ""}" data-report-series-id="${escapeHtml(group.id)}">
      <div class="battle-report-series-row">
        ${battleReportListCardHtml(group.primary, { forceUnread: hasUnread })}
        <button class="battle-report-series-toggle" data-report-action="toggle-series" data-report-series-id="${escapeHtml(group.id)}" type="button" aria-label="${escapeHtml(toggleLabel)}" aria-expanded="${expanded ? "true" : "false"}">
          <span class="battle-report-series-count">${foldedReports.length}</span>
          <span class="battle-report-series-arrow" aria-hidden="true"></span>
        </button>
      </div>
      ${children}
    </section>
  `;
}

function battleReportFoldedReports(group) {
  const candidates = (group.reports || []).slice(0, -1);
  return candidates.length && candidates.every(isFoldableDrawReport) ? candidates : [];
}

function isFoldableDrawReport(report) {
  const battle = report?.battle || {};
  return battle.winner === "draw" && battle.finishReason === "roundLimit";
}

function battleReportCanInferSameSeries(previousReport, report) {
  if (!isFoldableDrawReport(previousReport)) return false;
  const previousBattle = previousReport?.battle || {};
  const battle = report?.battle || {};
  const previousEncounter = Math.max(1, Number(previousBattle.encounter) || 1);
  const encounter = Math.max(1, Number(battle.encounter) || 1);
  if (encounter !== previousEncounter + 1) return false;
  return battleReportCarriedUnitsMatch(previousBattle.player, battle.initialPlayer)
    && battleReportCarriedUnitsMatch(previousBattle.enemy, battle.initialEnemy);
}

function battleReportCarriedUnitsMatch(previousUnits = [], nextInitialUnits = []) {
  if (!previousUnits.length || previousUnits.length !== nextInitialUnits.length) return false;
  return previousUnits.every((unit) => {
    const next = nextInitialUnits.find((candidate) => battleReportUnitKey(candidate) === battleReportUnitKey(unit));
    if (!next) return false;
    return Math.round(unit.troops || 0) === Math.round(next.troops || 0)
      && Math.round(unit.wounded || 0) === Math.round(next.wounded || 0);
  });
}

function battleReportUnitKey(unit = {}) {
  return [unit.side, unit.position, unit.heroId || unit.id || unit.name].join(":");
}

function battleReportListCardHtml(report, options = {}) {
  const battle = report.battle;
  const playerTroops = totalUnitsTroops(battle.player);
  const enemyTroops = totalUnitsTroops(battle.enemy);
  const resultClass = battle.winner || "draw";
  const classes = [
    "battle-report-card",
    options.variant === "child" ? "series-child" : "",
    options.forceUnread || !report.read ? "unread" : "",
  ].filter(Boolean).join(" ");
  return `
    <button class="${classes}" data-report-action="open" data-report-id="${escapeHtml(report.id)}" type="button">
      <span class="battle-report-shield" aria-hidden="true"></span>
      <div class="battle-report-card-main">
        <div class="battle-report-card-head">
          <strong>${escapeHtml(report.title)}</strong>
          <span>土地 Lv.${Math.max(1, battle.rounds || 1)}</span>
          <em>${formatBattleReportTime(report.createdAt)}</em>
        </div>
        <div class="battle-report-card-body">
          <div class="battle-report-list-side player">
            <span>${formatNumber(playerTroops.current)}/${formatNumber(playerTroops.max)}</span>
            <div class="battle-report-mini-line">${battle.player.map(reportMiniUnitHtml).join("")}</div>
          </div>
          <div class="battle-report-result ${resultClass}">${escapeHtml(battle.label)}</div>
          <div class="battle-report-list-side enemy">
            <span>${formatNumber(enemyTroops.current)}/${formatNumber(enemyTroops.max)}</span>
            <div class="battle-report-mini-line">${battle.enemy.map(reportMiniUnitHtml).join("")}</div>
          </div>
        </div>
      </div>
    </button>
  `;
}

function reportMiniUnitHtml(unit) {
  const portrait = unit.portrait || portraitForHero(unit);
  return `
    <span class="battle-report-mini-unit ${unit.troops <= 0 ? "fallen" : ""}" title="${escapeHtml(unit.name)}">
      ${portrait ? `<img src="${escapeHtml(portrait)}" alt="">` : escapeHtml(unit.name.slice(0, 1))}
      <b>${"★".repeat(Number(unit.rarity) || 0)}</b>
    </span>
  `;
}

function battleReportDetailHtml(report) {
  const battle = report.battle;
  const body = battleReportView === "stats"
    ? battleReportStatsHtml(battle)
    : battleReportView === "formation"
      ? battleReportFormationHtml(battle)
      : battleReportView === "log"
        ? visibleReportLogHtml(battle.log, battle)
        : battleReportView === "replay"
          ? battleReportReplayHtml(report)
          : battleReportSummaryHtml(report);
  const match = battleReportView === "summary"
    ? `
      <div class="battle-report-match">
        ${battleReportScoreBarHtml(battle.player, "player")}
        <div class="battle-report-match-result ${battle.winner || "draw"}">${escapeHtml(battleReportResultGlyph(battle))}</div>
        ${battleReportScoreBarHtml(battle.enemy, "enemy")}
      </div>
    `
    : "";
  return `
    <div class="battle-report-detail-view ${battleReportView}-page">
      <button class="battle-report-back" data-report-action="back" type="button">个人战报</button>
      ${match}
      ${body}
      ${battleReportNavHtml()}
    </div>
  `;
}
function battleReportResultGlyph(battle) {
  if (battle.winner === "player") return "胜";
  if (battle.winner === "enemy") return "败";
  return "平";
}

function battleReportScoreBarHtml(units, side) {
  const totals = totalUnitsTroops(units);
  const title = side === "player" ? "我方" : "守军";
  return `
    <div class="battle-report-score ${side}">
      <span>${formatNumber(totals.current)}/${formatNumber(totals.max)}</span>
      <strong>${title}</strong>
      ${battleReportTroopBarHtml(totals, side)}
    </div>
  `;
}

function battleReportTroopBarHtml(totals, side, className = "battle-report-score-bar") {
  return `
    <div class="${className} ${side}" style="${troopBarStyle(totals.current, totals.wounded, totals.max)}">
      <span class="death-fill"></span>
      <span class="wounded-fill"></span>
      <span class="troop-fill"></span>
    </div>
  `;
}

function battleReportSummaryHtml(report) {
  const battle = report.battle;
  const canReplay = battleReportCanReplay(battle);
  return `
    <div class="battle-report-stage">
      <div class="battle-report-army player">${battle.player.map(reportUnitCardHtml).join("")}</div>
      <div class="battle-report-center">
        <strong>【${battle.winner === "player" ? "我方胜利" : battle.winner === "enemy" ? "守军胜利" : "平局"}】</strong>
        <span>历经 ${battle.rounds} 回合</span>
        <span>获得 铜币 1</span>
        <button class="battle-report-replay" data-report-action="${canReplay ? "replay" : "log"}" type="button" ${canReplay ? "" : "disabled"}>战况回放</button>
      </div>
      <div class="battle-report-army enemy">${battle.enemy.map(reportUnitCardHtml).join("")}</div>
    </div>
  `;
}

function reportUnitCardHtml(unit) {
  const portrait = unit.portrait || portraitForHero(unit);
  const totals = {
    current: Math.max(0, Number(unit.troops) || 0),
    wounded: Math.max(0, Number(unit.wounded) || 0),
    max: Math.max(0, Number(unit.maxTroops) || 0),
  };
  return `
    <article class="battle-report-unit ${unit.side} ${unit.troops <= 0 ? "fallen" : ""}">
      <div class="battle-report-unit-portrait">
        ${portrait ? `<img src="${escapeHtml(portrait)}" alt="${escapeHtml(unit.name)}">` : ""}
        <span>${"★".repeat(Number(unit.rarity) || 0)}</span>
      </div>
      <div class="battle-report-unit-name">
        <small>${escapeHtml(unit.faction || "")}</small>
        <strong>${escapeHtml(unit.name)}</strong>
        <em>${Number(unit.distance) || defaultAttackDistance()}</em>
      </div>
      <div class="battle-report-unit-troops">
        <span>兵力${formatNumber(unit.troops)}</span>
        <b>伤${formatNumber(unit.wounded || 0)}</b>
      </div>
      ${battleReportTroopBarHtml(totals, unit.side)}
    </article>
  `;
}

function battleReportFormationHtml(battle) {
  const side = battleReportFormationSide === "enemy" ? "enemy" : "player";
  const units = visualLineUnits(battle[side] || []);
  return `
    <section class="battle-report-formation-view">
      <div class="battle-report-formation-tabs" aria-label="阵容方">
        <button class="${side === "player" ? "active" : ""}" data-report-action="formation-side" data-side="player" type="button">我方</button>
        <button class="${side === "enemy" ? "active" : ""}" data-report-action="formation-side" data-side="enemy" type="button">敌方</button>
      </div>
      <div class="battle-report-formation-panel ${side}">
        ${POSITIONS.map((position) => battleReportFormationRowHtml(units.find((unit) => unit.position === position.id), position, side)).join("")}
      </div>
    </section>
  `;
}

function battleReportFormationRowHtml(unit, position, side) {
  const empty = !unit;
  const portrait = unit ? unit.portrait || portraitForHero(unit) : "";
  const skills = unit ? unit.skills || [] : [];
  return `
    <article class="battle-report-formation-row ${side} ${empty ? "empty" : ""}">
      <div class="battle-report-formation-position">${escapeHtml(position.label)}</div>
      <div class="battle-report-formation-hero">
        ${portrait ? `<img src="${escapeHtml(portrait)}" alt="${escapeHtml(unit.name)}">` : ""}
        <span>
          <strong>${empty ? "未配置" : escapeHtml(unit.name)}</strong>
          <small>${empty ? "" : `Lv.30 · ${escapeHtml(unit.faction || "")}${escapeHtml(unit.arm || "")} · 距${Number(unit.distance) || defaultAttackDistance()}`}</small>
        </span>
        ${empty ? "" : `<em>${"★".repeat(Number(unit.rarity) || 0)}</em>`}
      </div>
      <div class="battle-report-formation-skills">
        ${[0, 1, 2].map((index) => battleReportFormationSkillHtml(skills[index], index)).join("")}
      </div>
      <div class="battle-report-formation-reserve" aria-hidden="true"></div>
    </article>
  `;
}

function battleReportFormationSkillHtml(skill, index) {
  if (!skill) {
    return `
      <span class="battle-report-formation-skill empty">
        <i></i>
        <b>${index === 0 ? "未配置" : "空"}</b>
      </span>
    `;
  }
  return `
    <button class="battle-report-formation-skill" data-skill-id="${escapeHtml(skill.id)}" type="button" title="${escapeHtml(skill.name)}">
      ${skill.icon ? `<img src="${escapeHtml(skill.icon)}" alt="">` : `<i>${escapeHtml(skill.grade || "战")}</i>`}
      <b>${escapeHtml(skill.name)}</b>
      ${skill.grade ? `<em>${escapeHtml(skill.grade)}</em>` : ""}
    </button>
  `;
}

function visibleReportLogHtml(entries, battle) {
  return `
    <section class="battle-report-log-panel">
      ${reportLogInnerHtml(entries, battle, false)}
    </section>
  `;
}

function battleReportStatsHtml(battle) {
  return `
    <section class="battle-report-stats-view">
      <nav class="battle-report-stat-nav" aria-label="统计分类">
        <button class="${battleReportStatsTab === "hero" ? "active" : ""}" data-report-action="hero-stats" type="button">武将统计</button>
        <button class="${battleReportStatsTab === "skill" ? "active" : ""}" data-report-action="skill-stats" type="button">战法统计</button>
      </nav>
      <div class="battle-report-stat-panel">
        ${battleReportStatsTab === "hero" ? battleHeroStatsHtml(battle) : battleSkillStatsHtml(battle)}
      </div>
    </section>
  `;
}

function battleHeroStatsHtml(battle) {
  const stats = collectBattleStats(battle);
  return `
    <div class="battle-hero-stat-table">
      <div class="battle-hero-stat-head">
        <span></span>
        <span>普通杀伤</span>
        <span>战法杀伤</span>
        <span>战法释放</span>
        <span>救援</span>
        <span>损失</span>
        <span>本场伤兵</span>
        <span>总伤兵</span>
      </div>
      ${stats.map(heroStatRowHtml).join("")}
    </div>
  `;
}

function heroStatRowHtml(unit) {
  const totalWounded = Math.max(unit.wounded, unit.loss + unit.wounded);
  return `
    <article class="battle-hero-stat-row ${unit.side}">
      ${statUnitIdentityHtml(unit)}
      <span>${formatNumber(unit.attackDamage)}</span>
      <span>${formatNumber(unit.skillDamage)}</span>
      <span>${formatNumber(unit.skillCasts)}</span>
      <span>${formatNumber(unit.healing)}</span>
      <span class="danger">${formatNumber(unit.loss)}</span>
      <span class="danger">${formatNumber(unit.wounded)}</span>
      <span class="danger">${formatNumber(totalWounded)}</span>
    </article>
  `;
}

function battleSkillStatsHtml(battle) {
  const stats = collectBattleStats(battle);
  return `<div class="battle-skill-stat-list">${stats.map(skillStatRowHtml).join("")}</div>`;
}

function skillStatRowHtml(unit) {
  const skills = [...unit.skills.values()]
    .sort((a, b) => (b.count - a.count) || (b.damage + b.healing) - (a.damage + a.healing) || a.name.localeCompare(b.name, "zh-Hans-CN"));
  const cells = skills.length ? skills.slice(0, 4).map(skillStatCellHtml).join("") : '<span class="battle-skill-stat-empty">-</span>';
  return `
    <article class="battle-skill-stat-row ${unit.side}">
      ${statUnitIdentityHtml(unit)}
      <div class="battle-skill-stat-cells">${cells}</div>
    </article>
  `;
}

function skillStatCellHtml(skill) {
  return `
    <span class="battle-skill-stat-cell">
      <strong>${escapeHtml(skill.name)}</strong>
      <em>${formatNumber(skill.count)}次</em>
      <small>${skill.healing ? "救援" : "杀伤"} ${formatNumber(skill.damage + skill.healing)}</small>
    </span>
  `;
}

function statUnitIdentityHtml(unit) {
  const portrait = unit.portrait || portraitForHero(unit);
  return `
    <span class="battle-stat-unit">
      ${portrait ? `<img src="${escapeHtml(portrait)}" alt="">` : ""}
      <b>${escapeHtml(positionLabel(unit.position))}</b>
      <strong>${escapeHtml(unit.name)}</strong>
    </span>
  `;
}

function battleReportNavHtml() {
  const canReplay = battleReportCanReplay(selectedBattleReport()?.battle);
  const item = (action, label) => `<button class="${battleReportView === action ? "active" : ""}" data-report-action="${action}" type="button" ${action === "replay" && !canReplay ? "disabled" : ""}>${label}</button>`;
  return `
    <nav class="battle-report-bottom-nav" aria-label="战报视图">
      ${item("replay", "战况回放")}
      ${item("log", "战报详情")}
      ${item("stats", "统计")}
      ${item("formation", "阵容详情")}
    </nav>
  `;
}

function totalUnitsTroops(units) {
  return {
    current: (units || []).reduce((sum, unit) => sum + Math.max(0, Number(unit.troops) || 0), 0),
    wounded: (units || []).reduce((sum, unit) => sum + Math.max(0, Number(unit.wounded) || 0), 0),
    max: (units || []).reduce((sum, unit) => sum + Math.max(0, Number(unit.maxTroops) || 0), 0),
  };
}

function formatBattleReportTime(timestamp) {
  return new Date(timestamp || Date.now()).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function writeReport(entries, battle = null) {
  const report = ensureReportRenderTarget();
  report.innerHTML = reportLogInnerHtml(entries, battle, true);
  report.scrollTop = report.scrollHeight || 0;
}

function reportLogInnerHtml(entries, battle = null, includeStats = true) {
  const round = [...entries].reverse().find((entry) => entry.type === "round")?.text
    || "准备回合";
  return `
    <div class="report-detail-title">
      <span>战报详情</span>
      <b>${escapeHtml(round)}</b>
    </div>
    ${includeStats && battle?.complete ? battleStatsHtml(battle) : ""}
    ${reportRoundsHtml(entries)}
  `;
}

function reportRoundsHtml(entries) {
  const rounds = groupReportRounds(entries || []);
  if (!rounds.length) return '<div class="empty-report">暂无战斗记录。</div>';
  return `<div class="report-rounds">${rounds.map(reportRoundHtml).join("")}</div>`;
}

function groupReportRounds(entries) {
  const rounds = [];
  let current = null;
  entries.forEach((entry, index) => {
    if (entry.type === "round" || !current) {
      current = {
        id: `report-round-${rounds.length + 1}`,
        title: entry.type === "round" ? entry.text : "准备阶段",
        roundEntry: entry.type === "round" ? entry : null,
        groups: [],
      };
      rounds.push(current);
      if (entry.type === "round") return;
    }

    const actor = reportEntryActionUnit(entry);
    const actorKey = actor ? `${actor.side}:${actor.id || actor.heroId || actor.name}` : `system:${entry.type}`;
    const previous = current.groups.at(-1);
    if (previous && previous.actorKey === actorKey) {
      previous.entries.push(entry);
      previous.actor = previous.actor || actor;
      previous.lastEntryIndex = index;
      return;
    }
    current.groups.push({
      id: `${current.id}-action-${current.groups.length + 1}`,
      actorKey,
      actor,
      entries: [entry],
      firstEntryIndex: index,
      lastEntryIndex: index,
    });
  });
  return rounds;
}

function reportRoundHtml(round, roundIndex) {
  const actions = round.groups.filter((group) => group.entries.length);
  const jumps = actions.filter((group) => group.actor);
  const roundNumber = reportRoundNumber(round.title, roundIndex);
  let actionIndex = 0;
  return `
    <section class="report-round-block" aria-labelledby="${escapeHtml(round.id)}-title">
      <aside class="report-turn-rail" aria-label="${escapeHtml(round.title)}行动顺序">
        <strong id="${escapeHtml(round.id)}-title">${escapeHtml(round.title)}</strong>
        <div class="report-turn-list">
          ${jumps.length ? jumps.map((group, index) => reportTurnJumpHtml(group, roundNumber, index + 1)).join("") : '<span class="report-turn-empty">无武将行动</span>'}
        </div>
      </aside>
      <div class="report-round-actions">
        <div class="log-line round"><span>${escapeHtml(round.title)}</span><em>行动阶段</em></div>
        ${actions.map((group) => reportActionGroupHtml(group, roundNumber, group.actor ? ++actionIndex : 0)).join("")}
      </div>
    </section>
  `;
}

function reportRoundNumber(title, roundIndex) {
  const match = String(title || "").match(/第\s*(\d+)\s*回合/);
  if (match) return match[1];
  return String(title || "").includes("准备") ? "准" : String(roundIndex + 1);
}

function reportRoundStepLabel(roundNumber) {
  return roundNumber === "准" ? "准备回合" : `第 ${roundNumber} 回合`;
}

function reportTurnJumpHtml(group, roundNumber, groupIndex) {
  const actor = group.actor;
  const side = actor?.side === "enemy" ? "enemy" : actor?.side === "player" ? "player" : "system";
  const portrait = actor?.portrait || reportParticipantPortrait(actor);
  const label = actor?.name || reportActionTypeLabel(group.entries[0]);
  const troopText = actor?.troops !== undefined ? `兵力 ${formatNumber(actor.troops)}` : "行动";
  return `
    <a class="report-turn-jump ${side}" href="#${escapeHtml(group.id)}" title="${escapeHtml(label)} ${escapeHtml(troopText)}">
      <span class="report-turn-order">${escapeHtml(roundNumber)}.${groupIndex}</span>
      <span class="report-turn-avatar">
        ${portrait ? `<img src="${escapeHtml(portrait)}" alt="${escapeHtml(label)}头像" loading="lazy">` : escapeHtml(label.slice(0, 1))}
      </span>
    </a>
  `;
}

function reportActionGroupHtml(group, roundNumber, groupIndex) {
  const actor = group.actor;
  const side = actor?.side === "enemy" ? "enemy" : actor?.side === "player" ? "player" : "system";
  const portrait = actor?.portrait || reportParticipantPortrait(actor);
  const label = actor?.name || reportActionTypeLabel(group.entries[0]);
  const troopText = actor?.troops !== undefined ? `兵力 ${formatNumber(actor.troops)}` : "战况";
  const stepText = actor ? `${reportRoundStepLabel(roundNumber)} · 第 ${groupIndex} 次行动` : "战斗记录";
  return `
    <article id="${escapeHtml(group.id)}" class="report-action-group ${side}">
      <header class="report-action-head">
        <div class="report-action-hero">
          <span class="report-action-portrait">
            ${portrait ? `<img src="${escapeHtml(portrait)}" alt="${escapeHtml(label)}头像" loading="lazy">` : escapeHtml(label.slice(0, 1))}
          </span>
          <div>
            <strong>${escapeHtml(label)}</strong>
            <small>${escapeHtml(stepText)}</small>
          </div>
        </div>
        <b>${escapeHtml(troopText)}</b>
      </header>
      <div class="report-action-events">
        ${group.entries.map(reportLineHtml).join("")}
      </div>
    </article>
  `;
}

function reportEntryActionUnit(entry) {
  return entry.actorState
    || reportParticipantState(entry, "actor")
    || reportParticipantState(entry, "attacker")
    || reportParticipantState(entry, "target")
    || null;
}

function reportParticipantState(entry, role) {
  const participant = (entry.participants || []).find((item) => item.role === role);
  if (!participant) return null;
  return {
    id: participant.id || "",
    heroId: participant.heroId || "",
    name: participant.name || "",
    side: participant.side || "",
    portrait: participant.portrait || reportParticipantPortrait(participant),
  };
}

function reportActionTypeLabel(entry) {
  return {
    hit: "攻击",
    heal: "恢复",
    control: "状态",
    result: "终",
    system: "令",
  }[entry?.type] || "战";
}

function ensureReportRenderTarget() {
  let report = document.querySelector("#report");
  if (report) return report;
  report = document.createElement("div");
  report.id = "report";
  report.className = "report report-test-buffer";
  report.setAttribute("aria-hidden", "true");
  document.body.append(report);
  return report;
}

function battleStatsHtml(battle) {
  const stats = collectBattleStats(battle);
  const totalDamage = stats.reduce((sum, unit) => sum + unit.damage, 0);
  const totalHealing = stats.reduce((sum, unit) => sum + unit.healing, 0);
  return `
    <section class="battle-stats" aria-label="战后数据统计">
      <div class="battle-stats-head">
        <div>
          <strong>战后统计</strong>
          <span>只统计已产生数值的伤害和治疗</span>
        </div>
        <div class="battle-stats-total">
          <span>总输出 <b>${formatNumber(totalDamage)}</b></span>
          <span>总治疗 <b>${formatNumber(totalHealing)}</b></span>
        </div>
      </div>
      <div class="battle-stats-grid">
        ${stats.map(battleStatCardHtml).join("")}
      </div>
    </section>
  `;
}

function collectBattleStats(battle) {
  const unitStats = [...(battle?.player || []), ...(battle?.enemy || [])].map((unit) => ({
    id: unit.id,
    heroId: unit.heroId,
    name: unit.name,
    side: unit.side,
    position: unit.position,
    portrait: unit.portrait || portraitForHero(unit),
    rarity: unit.rarity,
    troops: Math.max(0, Number(unit.troops) || 0),
    wounded: Math.max(0, Number(unit.wounded) || 0),
    maxTroops: Math.max(0, Number(unit.maxTroops) || 0),
    loss: Math.max(0, (Number(unit.maxTroops) || 0) - (Number(unit.troops) || 0)),
    damage: 0,
    attackDamage: 0,
    skillDamage: 0,
    skillCasts: 0,
    healing: 0,
    skills: new Map(),
  }));
  const statsById = new Map(unitStats.map((unit) => [unit.id, unit]));
  const statsBySideAndName = new Map(unitStats.map((unit) => [`${unit.side}:${unit.name}`, unit]));

  (battle?.log || []).forEach((entry) => {
    const amount = Math.max(0, Number(entry.amount) || 0);
    if (!amount || !["hit", "heal"].includes(entry.type)) return;
    const actor = reportEntryActor(entry);
    const unit = actor?.id ? statsById.get(actor.id) : statsBySideAndName.get(`${actor?.side || ""}:${entry.actor || ""}`);
    const target = reportEntryTarget(entry);
    const targetUnit = target?.id ? statsById.get(target.id) : statsBySideAndName.get(`${target?.side || ""}:${entry.target || ""}`);
    if (entry.type === "hit" && targetUnit) targetUnit.received = (targetUnit.received || 0) + amount;
    if (!unit) return;

    const skillName = entry.skill || (entry.type === "heal" ? "治疗" : "未标注来源");
    const skill = unit.skills.get(skillName) || { name: skillName, count: 0, damage: 0, healing: 0 };
    skill.count += 1;
    if (entry.type === "heal") {
      unit.healing += amount;
      skill.healing += amount;
    } else {
      const isNormalAttack = skillName === "普通攻击";
      unit.damage += amount;
      if (isNormalAttack) {
        unit.attackDamage += amount;
      } else {
        unit.skillDamage += amount;
        unit.skillCasts += 1;
      }
      skill.damage += amount;
    }
    unit.skills.set(skillName, skill);
  });

  return unitStats;
}

function reportEntryActor(entry) {
  const participants = entry.participants || [];
  return participants.find((participant) => participant.role === "actor")
    || participants.find((participant) => participant.name === entry.actor)
    || null;
}

function reportEntryTarget(entry) {
  const participants = entry.participants || [];
  return participants.find((participant) => participant.role === "target")
    || participants.find((participant) => participant.name === entry.target)
    || null;
}

function battleStatCardHtml(unit) {
  const side = unit.side === "player" ? "我方" : "敌方";
  const skills = [...unit.skills.values()]
    .filter((skill) => skill.damage || skill.healing)
    .sort((a, b) => (b.damage + b.healing) - (a.damage + a.healing) || a.name.localeCompare(b.name, "zh-Hans-CN"));
  return `
    <article class="battle-stat-card battle-stat-${unit.side}">
      <div class="battle-stat-title">
        <span>${escapeHtml(side)} · ${escapeHtml(positionLabel(unit.position))}</span>
        <strong>${escapeHtml(unit.name)}</strong>
      </div>
      <div class="battle-stat-values">
        <span><small>总输出</small><b class="damage">${formatNumber(unit.damage)}</b></span>
        <span><small>总治疗</small><b class="heal">${formatNumber(unit.healing)}</b></span>
      </div>
      <div class="battle-skill-totals">
        ${skills.length ? skills.map(battleSkillStatHtml).join("") : '<span class="battle-stat-empty">本场暂无输出/治疗</span>'}
      </div>
    </article>
  `;
}

function battleSkillStatHtml(skill) {
  return `
    <span class="battle-skill-total">
      <b>【${escapeHtml(skill.name)}】</b>
      ${skill.damage ? `<em class="damage">伤 ${formatNumber(skill.damage)}</em>` : ""}
      ${skill.healing ? `<em class="heal">疗 ${formatNumber(skill.healing)}</em>` : ""}
    </span>
  `;
}

function positionLabel(position) {
  return POSITIONS.find((item) => item.id === position)?.label || "位置";
}

function writeSystemMessage(text, type = "system") {
  state.systemMessages = [
    ...(state.systemMessages || []),
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      text,
      createdAt: Date.now(),
    },
  ].slice(-SYSTEM_MESSAGE_LIMIT);
}

function renderSystemMessages() {
  const messages = [...(state.systemMessages || [])].reverse();
  if (!messages.length) {
    els.systemMessages.innerHTML = `<div class="empty-report">暂无系统消息。</div>`;
    return;
  }
  els.systemMessages.innerHTML = messages.map(systemMessageHtml).join("");
}

function systemMessageHtml(message) {
  const time = new Date(message.createdAt || Date.now()).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `
    <article class="system-message ${message.type || "system"}">
      <span>${escapeHtml(time)}</span>
      <p>${decorateSystemMessageText(message.text)}</p>
    </article>
  `;
}

function decorateSystemMessageText(text) {
  return escapeHtml(text).replace(/【([^】]+)】/g, '<b class="report-skill">【$1】</b>');
}

function reportLineHtml(entry) {
  if (entry.type === "round") {
    return `<div class="log-line round"><span>${escapeHtml(entry.text)}</span><em>行动阶段</em></div>`;
  }
  const details = entry.details?.length
    ? `<div class="report-modifiers">${entry.details.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`
    : "";
  return `
    <div class="log-line ${entry.type}">
      ${reportAvatarHtml(entry)}
      <span class="report-text">${decorateReportText(entry)}${reportTroopAfterHtml(entry)}${details}</span>
    </div>
  `;
}

function reportTroopAfterHtml(entry) {
  if (entry.type === "hit" && entry.targetState) {
    return `<em class="report-troop-after">（余兵${formatNumber(entry.targetState.troops)}）</em>`;
  }
  if (entry.type === "heal" && entry.targetState) {
    return `<em class="report-troop-after heal">（兵力${formatNumber(entry.targetState.troops)}）</em>`;
  }
  return "";
}

function reportAvatarHtml(entry) {
  const participant = reportAvatarParticipant(entry);
  const side = participant?.side === "player" ? "player" : participant?.side === "enemy" ? "enemy" : "";
  const portrait = reportParticipantPortrait(participant);
  const classes = [
    "report-avatar",
    side ? `report-avatar-${side}` : "",
    portrait ? "report-avatar-portrait" : "",
  ].filter(Boolean).join(" ");
  const label = participant?.name || reportGlyph(entry);
  const content = portrait
    ? `<img src="${escapeHtml(portrait)}" alt="${escapeHtml(label)}画像" loading="lazy">`
    : escapeHtml(reportGlyph(entry));
  return `<span class="${classes}" title="${escapeHtml(label)}">${content}</span>`;
}

function reportAvatarParticipant(entry) {
  if (entry.actorState) return entry.actorState;
  if (entry.targetState) return entry.targetState;
  const participants = entry.participants || [];
  if (!participants.length) return null;
  return participants.find((participant) => participant.role === "actor")
    || participants.find((participant) => participant.name === entry.actor)
    || participants.find((participant) => participant.role === "attacker")
    || participants.find((participant) => participant.role === "target")
    || participants[0];
}

function reportGlyph(entry) {
  if (entry.actor) return entry.actor.slice(0, 1);
  return {
    hit: "伤",
    heal: "疗",
    control: "控",
    result: "终",
    system: "令",
  }[entry.type] || "记";
}

function decorateReportText(entry) {
  let text = decorateReportUnitNames(entry.text, entry.participants || []);
  text = text.replace(/【([^】]+)】/g, '<b class="report-skill">【$1】</b>');
  if (entry.type === "heal") {
    text = text.replace(/(恢复)(\d[\d,]*)兵/g, '$1<strong class="report-number heal">$2</strong>兵');
  } else {
    text = text.replace(/(造成|损失)(\d[\d,]*)兵/g, '$1<strong class="report-number damage">$2</strong>兵');
  }
  return text;
}

function decorateReportUnitNames(text, participants) {
  const raw = String(text || "");
  const namedParticipants = participants
    .filter((participant) => participant?.name && participant.side)
    .sort((a, b) => b.name.length - a.name.length);
  if (!namedParticipants.length) return escapeHtml(raw);

  const participantsByName = namedParticipants.reduce((groups, participant) => {
    groups[participant.name] ||= [];
    groups[participant.name].push(participant);
    return groups;
  }, {});
  const names = Object.keys(participantsByName).sort((a, b) => b.length - a.length);
  const usedCount = {};
  let html = "";
  let index = 0;

  while (index < raw.length) {
    const name = names.find((candidate) => raw.startsWith(candidate, index));
    if (!name) {
      html += escapeHtml(raw[index]);
      index += 1;
      continue;
    }
    const group = participantsByName[name];
    const occurrence = usedCount[name] || 0;
    usedCount[name] = occurrence + 1;
    const participant = group[Math.min(occurrence, group.length - 1)];
    html += reportUnitNameHtml(name, participant);
    index += name.length;
  }
  return html;
}

function reportUnitNameHtml(name, participant) {
  const side = participant.side === "player" ? "player" : "enemy";
  const label = side === "player" ? "我方" : "敌方";
  return `<span class="report-unit report-unit-${side}" title="${label}${escapeHtml(name)}">${escapeHtml(name)}</span>`;
}
