// Battle report replay state, timeline, and 2.5D rendering helpers. Loaded after report-ui.js and before app.js.

const BATTLE_REPLAY_SPEEDS = [1, 2, 3];
const BATTLE_REPLAY_STEP_MS = 1350;
let battleReplayState = {
  reportId: null,
  step: 0,
  playing: false,
  speed: 1,
  timer: null,
};

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

function setBattleReplaySpeed(report, speed) {
  const state = ensureBattleReplayState(report);
  state.speed = BATTLE_REPLAY_SPEEDS.includes(speed) ? speed : 1;
}

function battleReplayStepCount(battle) {
  return battleReplayTimeline(battle).length;
}

function battleReportCanReplay(battle) {
  return Boolean(
    battle?.initialPlayer?.length
    && battle?.initialEnemy?.length
    && battleReplayTimeline(battle).length
  );
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
