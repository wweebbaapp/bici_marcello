// bici_marcello — interval training in bici, senza Bluetooth.
// Struttura fissa + preset 30'/45'/60' + personalizzato.
// Video locale, YouTube o RaiPlay nel riquadro.

import {
  buildWorkout,
  PRESETS,
  FIXED,
  fmt,
  shortDuration,
  segmentColor,
  findSegmentIndex,
  nextSegment,
  clamp,
} from "./workout.js";
import {
  surgeMessage,
  recoveryMessage,
  finishMessage,
  idleMessage,
} from "./messages.js";

const $ = (id) => document.getElementById(id);

const STORAGE = {
  ftp: "bici_marcello_ftp",
  custom: "bici_marcello_custom",
  audio: "bici_marcello_audio",
  preset: "bici_marcello_preset",
};

const state = {
  selected: "w30",
  custom: { reps: 3, surgeSec: 60, surgeFtpPct: 85 },
  ftpW: 250,
  workout: null,
  playing: false,
  started: false,
  elapsed: 0,
  startWall: 0,
  segIndex: -1,
  lastHighMsgAt: -999,
  lastBeepSec: -1,
  lastUiUpdate: 0,
  lastTimelineDraw: 0,
  audio: true,
  wakeLock: null,
  videoObjectUrl: null,
  hasMedia: false,
  toastTimer: null,
};

let audioCtx = null;

// ---------------------------------------------------------------- init

function init() {
  state.ftpW = loadNumber(STORAGE.ftp, 250, 80, 600);
  state.audio = loadBool(STORAGE.audio, true);

  const savedCustom = loadJSON(STORAGE.custom, null);
  if (savedCustom && typeof savedCustom === "object") {
    state.custom = {
      reps: clampInt(savedCustom.reps, 3, 12, 3),
      surgeSec: clampInt(savedCustom.surgeSec, 10, 300, 60),
      surgeFtpPct: clampInt(savedCustom.surgeFtpPct, 70, 100, 85),
    };
  }

  try {
    const savedPreset = localStorage.getItem(STORAGE.preset);
    if (savedPreset && (PRESETS[savedPreset] || savedPreset === "custom")) {
      state.selected = savedPreset;
    }
  } catch (e) {
    // storage non disponibile
  }

  $("ftpW").value = state.ftpW;
  $("customReps").value = state.custom.reps;
  $("customSurge").value = state.custom.surgeSec;
  $("customFtp").value = state.custom.surgeFtpPct;
  $("customFtpVal").textContent = `${state.custom.surgeFtpPct}%`;

  updateAudioButton();
  updatePresetButtons();
  updateCustomFormVisibility();
  wireEvents();
  rebuildWorkout({ reset: true, silent: true });
  setStatus("Pronto — scegli un allenamento e premi Start");

  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisibilityChange);

  if ("ResizeObserver" in window) {
    const ro = new ResizeObserver(onResize);
    const wrap = $("videoWrap");
    const timeline = $("timelineWrap");
    if (wrap) ro.observe(wrap);
    if (timeline) ro.observe(timeline);
  }

  registerServiceWorker();
}

// ---------------------------------------------------------------- events

function wireEvents() {
  // Video
  $("videoInput").addEventListener("change", onFileChosen);
  $("videoInputBar").addEventListener("change", onFileChosen);
  $("btnLoadUrl").addEventListener("click", loadFromUrl);
  $("videoUrl").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      loadFromUrl();
    }
  });
  $("btnFocusUrl").addEventListener("click", () => {
    const input = $("videoUrl");
    input.focus();
    input.select();
    input.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  // Allenamento
  $("btnStart").addEventListener("click", toggleStart);
  $("btnReset").addEventListener("click", () => resetWorkout(true));
  $("btnSkip").addEventListener("click", skipPhase);
  $("btnAudio").addEventListener("click", toggleAudio);

  $("ftpW").addEventListener("change", applyFtp);
  $("ftpW").addEventListener("input", () => {
    const v = Number($("ftpW").value);
    if (Number.isFinite(v) && v >= 80 && v <= 600) {
      state.ftpW = Math.round(v);
      updateUI(state.elapsed);
    }
  });

  // Personalizzato
  $("customReps").addEventListener("change", applyCustomInputs);
  $("customSurge").addEventListener("change", applyCustomInputs);
  $("customFtp").addEventListener("input", () => {
    $("customFtpVal").textContent = `${$("customFtp").value}%`;
  });
  $("customFtp").addEventListener("change", applyCustomInputs);

  document.querySelectorAll(".preset").forEach((btn) => {
    btn.addEventListener("click", () => selectPreset(btn.dataset.preset));
  });
}

// ---------------------------------------------------------------- preferences

function save(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch (e) {
    // storage non disponibile (modalità privata)
  }
}

function loadNumber(key, fallback, min, max) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const v = Number(raw);
    if (Number.isFinite(v)) return clamp(Math.round(v), min, max);
  } catch (e) {
    // ignore
  }
  return fallback;
}

function loadBool(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
  } catch (e) {
    // ignore
  }
  return fallback;
}

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // ignore
  }
  return fallback;
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return clamp(Math.round(n), min, max);
}

// ---------------------------------------------------------------- workouts

function selectPreset(id) {
  if (id !== "custom" && !PRESETS[id]) return;
  state.selected = id;
  save(STORAGE.preset, id);
  updatePresetButtons();
  updateCustomFormVisibility();
  rebuildWorkout({ reset: true });
  setStatus(
    `Allenamento: ${workoutLabel()} — ${fmt(state.workout.total)} totali`
  );
}

function updatePresetButtons() {
  document.querySelectorAll(".preset").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.preset === state.selected);
  });
}

function updateCustomFormVisibility() {
  $("customForm").hidden = state.selected !== "custom";
}

function workoutLabel() {
  if (state.selected === "custom") return "Personalizzato";
  return PRESETS[state.selected] ? PRESETS[state.selected].name : "Allenamento";
}

function rebuildWorkout({ reset = true, silent = false } = {}) {
  const cfg =
    state.selected === "custom" ? state.custom : PRESETS[state.selected];
  state.workout = buildWorkout(cfg);
  state.workout.presetId = state.selected;
  state.workout.name = workoutLabel();

  if (reset) {
    state.playing = false;
    state.started = false;
    state.elapsed = 0;
    state.segIndex = -1;
    state.lastBeepSec = -1;
    state.lastHighMsgAt = -999;
    state.lastUiUpdate = 0;
    releaseWakeLock();
    updateStartButton();
  }

  updateSummary();
  updateCustomTotal();
  updateUI(state.elapsed);
  drawTimeline();

  if (!silent) {
    setStatus(`Allenamento pronto: ${fmt(state.workout.total)} — premi Start`);
  }
}

function resetWorkout(verbose = true) {
  state.playing = false;
  state.started = false;
  state.elapsed = 0;
  state.segIndex = -1;
  state.lastBeepSec = -1;
  state.lastHighMsgAt = -999;
  state.lastUiUpdate = 0;
  releaseWakeLock();
  updateStartButton();
  updateUI(0);
  drawTimeline();
  if (verbose) setStatus("Reset — premi Start quando sei pronto");
}

function applyFtp() {
  const raw = Number($("ftpW").value);
  if (!Number.isFinite(raw)) return;
  state.ftpW = clamp(Math.round(raw), 80, 600);
  $("ftpW").value = state.ftpW;
  save(STORAGE.ftp, state.ftpW);
  updateUI(state.elapsed);
}

function applyCustomInputs() {
  const reps = clampInt($("customReps").value, 3, 12, 3);
  const surgeSec = clampInt($("customSurge").value, 10, 300, 60);
  const surgeFtpPct = clampInt($("customFtp").value, 70, 100, 85);

  $("customReps").value = reps;
  $("customSurge").value = surgeSec;
  $("customFtp").value = surgeFtpPct;
  $("customFtpVal").textContent = `${surgeFtpPct}%`;

  state.custom = { reps, surgeSec, surgeFtpPct };
  save(STORAGE.custom, JSON.stringify(state.custom));

  if (state.selected === "custom") {
    rebuildWorkout({ reset: true });
  } else {
    updateCustomTotal();
  }
}

function updateCustomTotal() {
  const preview = buildWorkout(state.custom);
  $("customTotal").textContent = `Totale: ${fmt(preview.total)}`;
}

function updateSummary() {
  const w = state.workout;
  if (!w) return;
  const c = w.config;
  const rows = [
    [
      segmentColor({ type: "warmup" }),
      `<b>${FIXED.warmupMin}'</b> riscaldamento`,
    ],
    [
      segmentColor({ type: "agile" }),
      `<b>${FIXED.activationMin}'</b> alternati FTP 50% / agile ≥ 90 rpm`,
    ],
    [
      segmentColor({ type: "surge" }),
      `<b>${FIXED.series} serie</b> × ${c.reps} ripetizioni`,
    ],
    [
      segmentColor({ type: "surge" }),
      `Allungo <b>${shortDuration(c.surgeSec)}</b> @ <b>${c.surgeFtpPct}% FTP</b> + recupero uguale`,
    ],
    [
      segmentColor({ type: "between" }),
      `<b>${FIXED.betweenSeriesMin}'</b> recupero tra le serie`,
    ],
    [
      segmentColor({ type: "cooldown" }),
      `<b>${FIXED.cooldownMin}'</b> defaticamento`,
    ],
    [
      "var(--yellow)",
      `<b>Totale ${fmt(w.total)}</b>`,
    ],
  ];

  $("summary").innerHTML = rows
    .map(
      ([color, html]) =>
        `<div class="sum-row"><span class="dot" style="background:${color}"></span><span>${html}</span></div>`
    )
    .join("");
}

// ---------------------------------------------------------------- timer

async function toggleStart() {
  if (!state.workout) return;

  if (state.playing) {
    state.playing = false;
    releaseWakeLock();
    updateStartButton();
    updateUI(state.elapsed);
    setStatus("In pausa — respira e riparti quando vuoi");
    return;
  }

  if (state.elapsed >= state.workout.total - 0.05) {
    state.elapsed = 0;
    state.segIndex = -1;
    state.lastBeepSec = -1;
  }

  ensureAudio();
  state.started = true;
  state.playing = true;
  state.startWall = performance.now() - state.elapsed * 1000;
  state.lastUiUpdate = 0;
  state.lastHighMsgAt = -999;

  await requestWakeLock();
  updateStartButton();
  updateUI(state.elapsed);
  showMotivation(idleMessage(), "soft");
  setStatus("Allenamento in corso — Vai Marcello!!!");
  requestAnimationFrame(loop);
}

function loop(now) {
  if (!state.playing || !state.workout) return;
  const w = state.workout;

  state.elapsed = Math.min(w.total, (now - state.startWall) / 1000);

  const idx = findSegmentIndex(
    w.segments,
    Math.min(state.elapsed, w.total - 0.0001)
  );

  if (idx !== state.segIndex) {
    const prev = state.segIndex >= 0 ? w.segments[state.segIndex] : null;
    state.segIndex = idx;
    onSegmentChange(w.segments[idx], prev);
  }

  const seg = w.segments[idx];

  // Messaggi durante gli allunghi ad alta intensità.
  if (seg && seg.type === "surge" && seg.ftpPct >= 80) {
    if (state.lastHighMsgAt < 0) state.lastHighMsgAt = state.elapsed;
    if (state.elapsed - state.lastHighMsgAt >= 12) {
      state.lastHighMsgAt = state.elapsed;
      showMotivation(surgeMessage(), "hot");
    }
  }

  // Beep negli ultimi 3 secondi di ogni allungo.
  if (seg && seg.type === "surge") {
    const rem = Math.ceil(seg.end - state.elapsed);
    const absSec = Math.floor(state.elapsed);
    if (rem > 0 && rem <= 3 && absSec !== state.lastBeepSec) {
      state.lastBeepSec = absSec;
      beep(980, 0.055, 0.05);
    }
  }

  if (state.elapsed >= w.total) {
    finishWorkout();
    return;
  }

  if (now - state.lastUiUpdate >= 100) {
    state.lastUiUpdate = now;
    updateUI(state.elapsed);
    maybeDrawTimeline();
  }

  requestAnimationFrame(loop);
}

function onSegmentChange(seg, prev) {
  state.lastBeepSec = -1;
  if (!seg) return;

  if (seg.type === "surge") {
    state.lastHighMsgAt = state.elapsed;
    if (seg.ftpPct >= 80) {
      showMotivation(surgeMessage(), "hot");
      beep(1080, 0.09, 0.075);
    } else {
      showMotivation("Allungo controllato: spingi bene, non a caso.", "hot");
      beep(880, 0.09, 0.06);
    }
  } else if (seg.type === "recovery") {
    beep(640, 0.075, 0.045);
  } else if (seg.type === "between") {
    beep(560, 0.12, 0.055);
    showMotivation(recoveryMessage(), "soft");
  } else if (seg.type === "cooldown") {
    beep(520, 0.12, 0.05);
    showMotivation("Defaticamento: respira, Marcello. Hai fatto il pieno!", "soft");
  } else if (seg.type === "warmup" && !prev) {
    beep(700, 0.1, 0.05);
  } else {
    beep(760, 0.045, 0.035);
  }

  updateUI(state.elapsed);
  drawTimeline();
}

function skipPhase() {
  const w = state.workout;
  if (!w) return;
  const idx = findSegmentIndex(
    w.segments,
    Math.min(state.elapsed, w.total - 0.0001)
  );
  const seg = w.segments[idx];
  if (!seg) return;

  state.elapsed = Math.min(w.total, seg.end + 0.001);
  state.segIndex = -1;
  state.lastBeepSec = -1;
  if (state.playing) {
    state.startWall = performance.now() - state.elapsed * 1000;
    state.lastUiUpdate = 0;
  }
  updateUI(state.elapsed);
  drawTimeline();
  setStatus(`Fase saltata — ${seg.label}`);

  if (state.elapsed >= w.total) {
    finishWorkout();
    return;
  }
  updateStartButton();
}

function finishWorkout() {
  const w = state.workout;
  if (!w) return;
  state.playing = false;
  state.started = true;
  state.elapsed = w.total;
  state.segIndex = w.segments.length - 1;
  releaseWakeLock();
  updateStartButton();
  updateUI(state.elapsed);
  drawTimeline();
  showMotivation(finishMessage(), "hot");
  beepSequence();
  setStatus("🏁 Allenamento completato — Vai Marcello!!!");
}

function updateStartButton() {
  const btn = $("btnStart");
  if (!btn) return;
  const total = state.workout ? state.workout.total : 0;
  if (state.playing) {
    btn.textContent = "⏸ Pausa";
  } else if (state.elapsed >= total - 0.05 && total > 0) {
    btn.textContent = "▶ Rigioca";
  } else if (state.elapsed > 0.5) {
    btn.textContent = "▶ Riprendi";
  } else {
    btn.textContent = "▶ Start";
  }
}

// ---------------------------------------------------------------- UI

function updateUI(elapsed) {
  const w = state.workout;
  if (!w) return;

  const t = clamp(Number(elapsed) || 0, 0, w.total);
  const finished = t >= w.total - 0.001;
  const notStarted = !state.started && t < 0.001;
  const segIdx = findSegmentIndex(
    w.segments,
    Math.min(t, w.total - 0.0001)
  );
  const seg = w.segments[segIdx] || w.segments[w.segments.length - 1];
  const segElapsed = clamp(t - seg.start, 0, seg.duration);
  const segRemaining = Math.max(0, seg.end - t);
  const totalRemaining = Math.max(0, w.total - t);
  const watts = Math.round((state.ftpW * seg.ftpPct) / 100);

  if (finished) {
    $("phaseLabel").textContent = "Completato";
    $("phaseLabel").style.color = "var(--green)";
    $("phaseMeta").textContent = "Grande Marcello! Allenamento finito";
    $("currentRemaining").textContent = "0:00";
    $("currentRemaining").style.color = "var(--green)";
    $("segmentBar").style.width = "100%";
    $("seriesInfo").textContent = `${w.series} serie completate · ${w.config.reps} ripetizioni ciascuna`;
    $("targetFtp").textContent = "—";
    $("targetWatt").textContent = "—";
    $("targetRpm").textContent = "—";
    $("nextInfo").textContent = "—";
    $("totalBar").style.width = "100%";
    $("totalTime").textContent = `${fmt(w.total)} / ${fmt(w.total)}`;
    $("hudPhase").textContent = "Completato";
    $("hudMeta").textContent = "Grande Marcello!";
    $("hudRemaining").textContent = "0:00";
    $("hudTotal").textContent = "0:00";
    $("hudFtp").textContent = "—";
    $("hudWatt").textContent = "—";
    $("hudRpm").textContent = "—";
    return;
  }

  if (notStarted) {
    $("phaseLabel").textContent = "Pronto";
    $("phaseLabel").style.color = "var(--accent)";
    $("phaseMeta").textContent = `${workoutLabel()} · ${fmt(w.total)} totali`;
    $("currentRemaining").textContent = fmt(w.total);
    $("currentRemaining").style.color = "var(--yellow)";
    $("segmentBar").style.width = "0%";
    $("seriesInfo").textContent = "Premi Start quando sei pronto";
    $("targetFtp").textContent = `${seg.ftpPct}%`;
    $("targetWatt").textContent = `${watts} W`;
    $("targetRpm").textContent = seg.rpmText;
    $("nextInfo").textContent = `${seg.label} · ${shortDuration(seg.duration)} · ${seg.ftpPct}% FTP · ${seg.rpmText}`;
    $("totalBar").style.width = "0%";
    $("totalTime").textContent = `0:00 / ${fmt(w.total)}`;
    $("hudPhase").textContent = "Pronto";
    $("hudMeta").textContent = workoutLabel();
    $("hudRemaining").textContent = fmt(w.total);
    $("hudTotal").textContent = fmt(w.total);
    $("hudFtp").textContent = `${seg.ftpPct}%`;
    $("hudWatt").textContent = `${watts} W`;
    $("hudRpm").textContent = seg.rpmText;
    return;
  }

  $("phaseLabel").textContent = phaseTitle(seg);
  $("phaseLabel").style.color = segmentColor(seg);
  $("phaseMeta").textContent = phaseMeta(seg, w);
  $("currentRemaining").textContent = fmt(segRemaining);
  $("currentRemaining").style.color =
    seg.type === "surge" ? segmentColor(seg) : "var(--yellow)";
  $("segmentBar").style.width = `${(segElapsed / seg.duration) * 100}%`;
  $("seriesInfo").textContent = seriesLabel(seg, w);

  $("targetFtp").textContent = `${seg.ftpPct}%`;
  $("targetWatt").textContent = `${watts} W`;
  $("targetRpm").textContent = seg.rpmText;

  const nxt = nextSegment(w.segments, Math.min(t, w.total - 0.0001));
  $("nextInfo").textContent = nxt
    ? `${nxt.label} · ${shortDuration(nxt.duration)} · ${nxt.ftpPct}% FTP · ${nxt.rpmText}`
    : "Ultima fase — chiudi in bellezza";

  $("totalBar").style.width = `${(t / w.total) * 100}%`;
  $("totalTime").textContent = `${fmt(t)} / ${fmt(w.total)}`;

  $("hudPhase").textContent = phaseTitle(seg);
  $("hudMeta").textContent = phaseMeta(seg, w);
  $("hudRemaining").textContent = fmt(segRemaining);
  $("hudTotal").textContent = fmt(totalRemaining);
  $("hudFtp").textContent = `${seg.ftpPct}%`;
  $("hudWatt").textContent = `${watts} W`;
  $("hudRpm").textContent = seg.rpmText;
}

function phaseTitle(seg) {
  switch (seg.type) {
    case "warmup":
      return "Riscaldamento";
    case "ftp50":
      return "FTP 50%";
    case "agile":
      return "Pedalata agile";
    case "surge":
      return "Allungo";
    case "recovery":
      return "Recupero";
    case "between":
      return "Recupero tra serie";
    case "cooldown":
      return "Defaticamento";
    default:
      return seg.label || "Allenamento";
  }
}

function phaseMeta(seg, w) {
  const hint = seg.hint ? ` · ${seg.hint}` : "";
  switch (seg.type) {
    case "warmup":
      return "Prima parte: sciogli le gambe" + hint;
    case "ftp50":
      return "5 minuti alternati FTP 50% / agile" + hint;
    case "agile":
      return "Pedalata agile: almeno 90 rpm" + hint;
    case "surge":
      return `Serie ${seg.series} di ${w.series} · Ripetizione ${seg.rep} di ${w.config.reps}${hint}`;
    case "recovery":
      return `Serie ${seg.series} di ${w.series} · Recupero ripetizione ${seg.rep}${hint}`;
    case "between":
      return `Serie ${seg.series} completata · prossima serie in arrivo${hint}`;
    case "cooldown":
      return "Ultima parte: rilassa le gambe" + hint;
    default:
      return seg.label || "";
  }
}

function seriesLabel(seg, w) {
  if (seg.type === "between") {
    return `Serie ${seg.series} di ${w.series} completata · recupero`;
  }
  if (seg.series > 0) {
    return `Serie ${seg.series} di ${w.series} · Ripetizione ${seg.rep} di ${w.config.reps}`;
  }
  if (seg.type === "warmup") return `Prima fase · ${FIXED.warmupMin} minuti`;
  if (seg.type === "cooldown") return `Ultima fase · ${FIXED.cooldownMin} minuti`;
  return "Attivazione · FTP 50% / agile";
}

// ---------------------------------------------------------------- timeline

function onResize() {
  drawTimeline();
}

function maybeDrawTimeline() {
  const now = performance.now();
  if (now - state.lastTimelineDraw < 160) return;
  state.lastTimelineDraw = now;
  drawTimeline();
}

function drawTimeline() {
  const canvas = $("timeline");
  if (!canvas) return;
  const wrap = canvas.parentElement;
  if (!wrap) return;

  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(1, wrap.clientWidth);
  const H = Math.max(1, wrap.clientHeight);
  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const w = state.workout;
  if (!w) return;

  const padX = 12;
  const x0 = padX;
  const x1 = W - padX;
  const span = Math.max(1, x1 - x0);
  const top = 22;
  const barH = Math.max(18, H - 44);

  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, x0, top, span, barH, 7);
  ctx.fill();

  for (const seg of w.segments) {
    const sx = x0 + (seg.start / w.total) * span;
    const sw = Math.max(1.4, (seg.duration / w.total) * span);
    ctx.fillStyle = segmentColor(seg);
    ctx.globalAlpha = 0.95;
    ctx.fillRect(sx, top, sw, barH);
    ctx.globalAlpha = 1;
  }

  const t = clamp(state.elapsed, 0, w.total);
  const cx = x0 + (t / w.total) * span;

  if (state.started) {
    ctx.fillStyle = "rgba(6, 12, 24, 0.55)";
    ctx.fillRect(cx, top, Math.max(0, x1 - cx), barH);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(Math.max(x0, cx - 1.5), top - 5, 3, barH + 10);
  }

  ctx.font = "700 10px -apple-system, system-ui, sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#9fb3cc";

  const marks = [
    { t: 0, label: "Risc." },
    { t: (FIXED.warmupMin + FIXED.activationMin) * 60, label: "Serie" },
    { t: w.total - FIXED.cooldownMin * 60, label: "Defat." },
  ];
  for (const m of marks) {
    const x = x0 + (m.t / w.total) * span;
    ctx.fillText(m.label, clamp(x, x0, x1 - 32), top - 7);
  }

  ctx.fillStyle = "#7f8ca3";
  ctx.font = "600 10px -apple-system, system-ui, sans-serif";
  ctx.fillText("0:00", x0, H - 8);
  const endLabel = fmt(w.total);
  const endW = ctx.measureText(endLabel).width;
  ctx.fillText(endLabel, x1 - endW, H - 8);

  if (state.started && state.elapsed > 0) {
    const lab = fmt(t);
    const lw = ctx.measureText(lab).width;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(lab, clamp(cx - lw / 2, x0, x1 - lw), H - 8);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ---------------------------------------------------------------- motivation

function showMotivation(text, tone = "hot") {
  const panel = $("motivationPanel");
  if (panel) panel.textContent = text;

  const el = $("motivation");
  if (!el) return;

  el.textContent = text;
  el.classList.remove("show", "soft");
  if (tone === "soft") el.classList.add("soft");

  // Forza un reflow per far ripartire la transizione.
  void el.offsetWidth;
  el.classList.add("show");

  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    el.classList.remove("show");
  }, 4200);
}

// ---------------------------------------------------------------- audio

function ensureAudio() {
  if (!state.audio) return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  } catch (e) {
    audioCtx = null;
  }
}

function beep(freq = 880, dur = 0.1, gain = 0.06) {
  if (!state.audio) return;
  ensureAudio();
  if (!audioCtx) return;
  try {
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  } catch (e) {
    // audio non disponibile
  }
}

function beepSequence() {
  if (!state.audio) return;
  const notes = [660, 880, 1100, 1320];
  notes.forEach((f, i) => {
    setTimeout(() => beep(f, 0.12, 0.07), i * 140);
  });
}

function toggleAudio() {
  state.audio = !state.audio;
  save(STORAGE.audio, state.audio);
  updateAudioButton();
  if (state.audio) {
    ensureAudio();
    beep(880, 0.08, 0.06);
  }
  setStatus(state.audio ? "Audio attivo" : "Audio disattivato");
}

function updateAudioButton() {
  const btn = $("btnAudio");
  if (!btn) return;
  btn.textContent = state.audio ? "🔔 Audio" : "🔕 Audio";
  btn.classList.toggle("green", state.audio);
  btn.classList.toggle("gray", !state.audio);
}

// ---------------------------------------------------------------- wake lock

async function requestWakeLock() {
  if (!("wakeLock" in navigator) || state.wakeLock) return;
  try {
    const lock = await navigator.wakeLock.request("screen");
    if (!state.playing) {
      lock.release().catch(() => {});
      return;
    }
    state.wakeLock = lock;
    lock.addEventListener("release", () => {
      if (state.wakeLock === lock) state.wakeLock = null;
    });
  } catch (e) {
    state.wakeLock = null;
  }
}

function releaseWakeLock() {
  if (!state.wakeLock) return;
  const lock = state.wakeLock;
  state.wakeLock = null;
  lock.release().catch(() => {});
}

function onVisibilityChange() {
  if (document.visibilityState === "visible" && state.playing) {
    requestWakeLock();
  }
}

// ---------------------------------------------------------------- video

function onFileChosen(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;
  loadLocalVideo(file);
}

function loadLocalVideo(file) {
  const video = $("video");
  const embed = $("embed");

  if (state.videoObjectUrl) {
    try {
      URL.revokeObjectURL(state.videoObjectUrl);
    } catch (e) {
      // ignore
    }
  }
  state.videoObjectUrl = URL.createObjectURL(file);

  embed.hidden = true;
  embed.removeAttribute("src");
  video.hidden = false;
  video.src = state.videoObjectUrl;
  video.load();

  $("placeholder").hidden = true;
  $("openExternal").hidden = true;
  state.hasMedia = true;

  $("videoStatus").textContent = `Video locale: ${file.name}`;
  setStatus(`Video caricato: ${file.name}`);
}

function loadFromUrl() {
  const raw = $("videoUrl").value.trim();
  if (!raw) {
    setStatus("Incolla un link YouTube o RaiPlay");
    return;
  }

  let url;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch (e) {
    setStatus("Link non valido");
    return;
  }

  const info = resolveEmbed(url);
  if (!info) {
    setStatus("Link non riconosciuto");
    return;
  }

  const video = $("video");
  video.pause();
  video.hidden = true;
  video.removeAttribute("src");

  const embed = $("embed");
  embed.src = info.src;
  embed.hidden = false;

  $("placeholder").hidden = true;
  $("openExternal").href = info.original;
  $("openExternal").hidden = false;
  state.hasMedia = true;

  $("videoStatus").textContent = `Video incorporato: ${info.label}`;
  setStatus(info.note || `Video incorporato: ${info.label}`);
}

function resolveEmbed(url) {
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();

  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0];
    if (id) return youtubeInfo(id, url.href);
  }

  if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    const parts = url.pathname.split("/").filter(Boolean);
    let id = url.searchParams.get("v");
    if (!id && (parts[0] === "shorts" || parts[0] === "live" || parts[0] === "embed")) {
      id = parts[1];
    }
    if (id) return youtubeInfo(id, url.href);
  }

  if (host.endsWith("vimeo.com")) {
    const m = url.pathname.match(/(\d{6,})/);
    if (m) {
      return {
        src: `https://player.vimeo.com/video/${m[1]}?autoplay=0`,
        original: url.href,
        label: "Vimeo",
        note: "Video Vimeo incorporato.",
      };
    }
  }

  if (host.endsWith("raiplay.it")) {
    return {
      src: url.href,
      original: url.href,
      label: "RaiPlay",
      note: 'RaiPlay: se il riquadro resta vuoto, RaiPlay blocca l\'incorporamento. Usa il pulsante "Apri".',
    };
  }

  return {
    src: url.href,
    original: url.href,
    label: host,
    note: `Incorporamento generico da ${host}. Se il sito blocca l'iframe, usa il pulsante "Apri".`,
  };
}

function youtubeInfo(id, original) {
  return {
    src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&modestbranding=1`,
    original,
    label: "YouTube",
    note: "Video YouTube incorporato. Se non parte, premi Play dentro il riquadro.",
  };
}

// ---------------------------------------------------------------- misc

function setStatus(msg) {
  $("status").textContent = msg;
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init();
