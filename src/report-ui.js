// Battle report modal and log/message rendering helpers. Loaded before app.js; functions read app globals when invoked.

const BATTLE_REPLAY_SPEEDS = [1, 2, 3];
const BATTLE_REPLAY_STEP_MS = 1350;
let battleReplayState = {
  reportId: null,
  step: 0,
  playing: false,
  speed: 1,
  timer: null,
};

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
    maxTroops: unit.maxTroops || 10000,
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

function addBattleReport(battle) {
  const report = {
    id: `battle-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: battleReportTitle(battle),
    createdAt: Date.now(),
    read: false,
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
    const total = battleReplayTimeline(report?.battle).length;
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
    const state = ensureBattleReplayState(report);
    const speed = Number(button.dataset.speed) || 1;
    state.speed = BATTLE_REPLAY_SPEEDS.includes(speed) ? speed : 1;
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

function ensureBattleReplayState(report, reset = false) {
  const reportId = report?.id || "";
  if (reset || battleReplayState.reportId !== reportId) {
    clearBattleReplayTimer();
    battleReplayState = {
      reportId,
      step: 0,
      playing: false,
      speed: 1,
      timer: null,
    };
  }
  return battleReplayState;
}

function clearBattleReplayTimer() {
  if (!battleReplayState.timer) return;
  clearTimeout(battleReplayState.timer);
  battleReplayState.timer = null;
}

function stopBattleReplay() {
  clearBattleReplayTimer();
  battleReplayState.playing = false;
}

function scheduleBattleReplay(report) {
  clearBattleReplayTimer();
  const state = ensureBattleReplayState(report);
  if (!state.playing || battleReportView !== "replay") return;
  const total = battleReplayTimeline(report?.battle).length;
  if (state.step >= total) {
    state.playing = false;
    return;
  }
  state.timer = setTimeout(() => {
    setBattleReplayStep(report, state.step + 1);
    if (state.step >= total) state.playing = false;
    renderBattleReportModal();
    scheduleBattleReplay(report);
  }, Math.max(260, BATTLE_REPLAY_STEP_MS / Math.max(1, state.speed)));
}

function setBattleReplayStep(report, step) {
  const state = ensureBattleReplayState(report);
  const total = battleReplayTimeline(report?.battle).length;
  state.step = Math.max(0, Math.min(total, Math.round(step)));
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

function battleReportCanReplay(battle) {
  return Boolean(
    battle?.initialPlayer?.length
    && battle?.initialEnemy?.length
    && battleReplayTimeline(battle).length
  );
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
  const reports = [...(state.battleReports || [])].reverse();
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
        ${reports.length ? reports.map(battleReportListCardHtml).join("") : '<div class="empty-report">暂无战报。点击开战后会生成一封完整战报。</div>'}
      </div>
    </div>
  `;
}

function battleReportListCardHtml(report) {
  const battle = report.battle;
  const playerTroops = totalUnitsTroops(battle.player);
  const enemyTroops = totalUnitsTroops(battle.enemy);
  const resultClass = battle.winner || "draw";
  return `
    <button class="battle-report-card ${report.read ? "" : "unread"}" data-report-action="open" data-report-id="${escapeHtml(report.id)}" type="button">
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

function battleReportReplayHtml(report) {
  const battle = report?.battle || {};
  const replayState = ensureBattleReplayState(report);
  const timeline = battleReplayTimeline(battle);
  const total = timeline.length;
  setBattleReplayStep(report, replayState.step);
  const frame = buildBattleReplayFrame(battle, replayState.step);
  const currentEntry = frame.entry;
  const playLabel = replayState.playing ? "暂停" : replayState.step >= total ? "重播" : "播放";
  const subtitle = currentEntry
    ? decorateReportText(currentEntry)
    : escapeHtml(battle.subtitle || "战况回放就绪");
  const progress = total ? Math.round((replayState.step / total) * 100) : 0;
  return `
    <section class="battle-replay" data-replay-report-id="${escapeHtml(report?.id || "")}" data-step="${replayState.step}" data-total="${total}">
      <div class="battle-replay-scoreboard">
        ${battleReportScoreBarHtml(frame.player, "player")}
        <div class="battle-replay-round">
          <strong>${escapeHtml(frame.roundLabel)}</strong>
          <span>${replayState.step}/${total}</span>
        </div>
        ${battleReportScoreBarHtml(frame.enemy, "enemy")}
      </div>
      <div class="battle-replay-field">
        <div class="battle-replay-horizon" aria-hidden="true"></div>
        <div class="battle-replay-army player">
          ${visualLineUnits(frame.player).map((unit) => battleReplayUnitHtml(unit, frame)).join("")}
        </div>
        <div class="battle-replay-centerline" aria-hidden="true">
          <span></span>
          <b>交锋</b>
          <span></span>
        </div>
        <div class="battle-replay-army enemy">
          ${visualLineUnits(frame.enemy).map((unit) => battleReplayUnitHtml(unit, frame)).join("")}
        </div>
        <div class="battle-replay-caption ${currentEntry?.type || "system"}">
          <span>${escapeHtml(battleReplayEntryType(currentEntry))}</span>
          <p>${subtitle}</p>
        </div>
      </div>
      <div class="battle-replay-controls">
        <button class="battle-replay-control" data-report-action="replay-step" data-step="prev" type="button" ${replayState.step <= 0 ? "disabled" : ""}>上一步</button>
        <button class="battle-replay-control primary" data-report-action="replay-toggle" type="button">${escapeHtml(playLabel)}</button>
        <button class="battle-replay-control" data-report-action="replay-step" data-step="next" type="button" ${replayState.step >= total ? "disabled" : ""}>下一步</button>
        <label class="battle-replay-scrubber">
          <span>${progress}%</span>
          <input class="battle-replay-progress" data-report-action="replay-scrub" data-step="${replayState.step}" type="range" min="0" max="${total}" value="${replayState.step}">
        </label>
        <div class="battle-replay-speeds" aria-label="回放速度">
          ${BATTLE_REPLAY_SPEEDS.map((speed) => `
            <button class="${replayState.speed === speed ? "active" : ""}" data-report-action="replay-speed" data-speed="${speed}" type="button">x${speed}</button>
          `).join("")}
        </div>
      </div>
    </section>
  `;
}

function battleReplayTimeline(battle) {
  return (battle?.log || []).filter((entry) => entry?.type);
}

function buildBattleReplayFrame(battle, step) {
  const timeline = battleReplayTimeline(battle);
  const frame = {
    player: cloneReplayUnits(battle?.initialPlayer?.length ? battle.initialPlayer : battle?.player || []),
    enemy: cloneReplayUnits(battle?.initialEnemy?.length ? battle.initialEnemy : battle?.enemy || []),
    entry: timeline[Math.max(0, step - 1)] || null,
    activeUnitId: "",
    targetUnitId: "",
    effects: [],
    roundLabel: "准备回合",
  };

  for (let index = 0; index < Math.min(step, timeline.length); index += 1) {
    applyBattleReplayEntry(frame, timeline[index], index === step - 1);
  }
  return frame;
}

function cloneReplayUnits(units) {
  return (units || []).map((unit) => ({
    ...unit,
    stats: { ...(unit.stats || {}) },
    bonuses: [...(unit.bonuses || [])],
    skills: (unit.skills || []).map((skill) => ({ ...skill })),
    statuses: [...(unit.statuses || [])],
  }));
}

function applyBattleReplayEntry(frame, entry, isCurrent) {
  if (entry.type === "round") frame.roundLabel = entry.text || frame.roundLabel;
  const actor = entry.actorState || reportEntryActor(entry);
  const target = entry.targetState || reportEntryTarget(entry);
  if (actor) updateBattleReplayUnit(frame, actor);
  if (target) updateBattleReplayUnit(frame, target);
  if (!isCurrent) return;

  frame.entry = entry;
  frame.activeUnitId = actor?.id || "";
  frame.targetUnitId = target?.id || "";
  if (entry.type === "hit" || entry.type === "heal") {
    const effectTarget = target || actor;
    if (effectTarget?.id) {
      frame.effects.push({
        unitId: effectTarget.id,
        type: entry.type,
        amount: Math.max(0, Number(entry.amount) || 0),
      });
    }
  } else if (actor?.id || target?.id) {
    frame.effects.push({
      unitId: actor?.id || target?.id,
      type: entry.type,
      amount: 0,
    });
  }
}

function updateBattleReplayUnit(frame, unitState) {
  const unit = [...frame.player, ...frame.enemy].find((candidate) =>
    candidate.id === unitState.id
    || (unitState.heroId && candidate.heroId === unitState.heroId && candidate.side === unitState.side)
  );
  if (!unit) return;
  const troops = Number(unitState.troops);
  const wounded = Number(unitState.wounded);
  const maxTroops = Number(unitState.maxTroops);
  if (Number.isFinite(troops)) unit.troops = Math.max(0, Math.round(troops));
  if (Number.isFinite(wounded)) unit.wounded = Math.max(0, Math.round(wounded));
  if (Number.isFinite(maxTroops)) unit.maxTroops = Math.max(0, Math.round(maxTroops));
}

function battleReplayUnitHtml(unit, frame) {
  const portrait = unit.portrait || portraitForHero(unit);
  const totals = {
    current: Math.max(0, Number(unit.troops) || 0),
    wounded: Math.max(0, Number(unit.wounded) || 0),
    max: Math.max(0, Number(unit.maxTroops) || 0),
  };
  const effect = frame.effects.find((item) => item.unitId === unit.id);
  const classes = [
    "battle-replay-unit",
    unit.side,
    unit.position,
    unit.troops <= 0 ? "fallen" : "",
    frame.activeUnitId === unit.id ? "active" : "",
    frame.targetUnitId === unit.id ? "target" : "",
    effect ? `effect-${effect.type}` : "",
  ].filter(Boolean).join(" ");
  return `
    <article class="${classes}" data-replay-unit-id="${escapeHtml(unit.id || "")}">
      <div class="battle-replay-token">
        ${portrait ? `<img src="${escapeHtml(portrait)}" alt="${escapeHtml(unit.name)}">` : `<span>${escapeHtml((unit.name || "?").slice(0, 1))}</span>`}
        <i>${escapeHtml(positionLabel(unit.position))}</i>
        ${effect ? battleReplayFloatHtml(effect) : ""}
      </div>
      <div class="battle-replay-name">
        <strong>${escapeHtml(unit.name)}</strong>
        <span>${formatNumber(totals.current)}</span>
      </div>
      ${battleReportTroopBarHtml(totals, unit.side, "battle-report-score-bar battle-replay-unit-bar")}
    </article>
  `;
}

function battleReplayFloatHtml(effect) {
  if (effect.type === "hit") return `<em class="battle-replay-float damage">-${formatNumber(effect.amount)}</em>`;
  if (effect.type === "heal") return `<em class="battle-replay-float heal">+${formatNumber(effect.amount)}</em>`;
  return `<em class="battle-replay-float status">${escapeHtml(battleReplayEntryType(effect))}</em>`;
}

function battleReplayEntryType(entry) {
  return {
    hit: "伤害",
    heal: "治疗",
    control: "控制",
    system: "战法",
    round: "回合",
    result: "结算",
  }[entry?.type] || "战况";
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
