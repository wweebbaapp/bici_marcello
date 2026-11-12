// Costruzione e gestione della timeline di allenamento.
// Struttura fissa richiesta:
//   5' riscaldamento
//   5' alternati FTP 50% / pedalata agile (>= 90 rpm)
//   4 serie di interval training
//      - ogni serie ha almeno 3 ripetizioni
//      - ogni ripetizione = allungo + recupero di UGUALE durata
//      - tra una serie e l'altra 3' di recupero
//   5' defaticamento
// L'allungo e' regolabile dal 70% al 100% dell'FTP (default 85%).

export const FIXED = {
  warmupMin: 5,
  activationMin: 5,
  cooldownMin: 5,
  series: 4,
  betweenSeriesMin: 3,
  minReps: 3,
};

export const PRESETS = {
  w30: {
    id: "w30",
    name: "30 minuti",
    reps: 3,
    surgeSec: 15,
    surgeFtpPct: 85,
  },
  w45: {
    id: "w45",
    name: "45 minuti",
    reps: 3,
    surgeSec: 52,
    surgeFtpPct: 85,
  },
  w60: {
    id: "w60",
    name: "1 ora",
    reps: 3,
    surgeSec: 90,
    surgeFtpPct: 85,
  },
};

const COLORS = {
  warmup: "#38bdf8",
  ftp50: "#0ea5e9",
  agile: "#22c55e",
  surge: "#ff5252",
  recovery: "#3b82f6",
  between: "#6366f1",
  cooldown: "#a78bfa",
};

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export function segmentColor(seg) {
  if (!seg) return "#334155";
  if (seg.type === "surge") {
    if (seg.ftpPct >= 95) return "#ff2d55";
    if (seg.ftpPct >= 85) return "#ff5252";
    if (seg.ftpPct >= 78) return "#ff7a45";
    return "#ff9f43";
  }
  return COLORS[seg.type] || "#64748b";
}

export function fmt(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function shortDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s}"`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${m}'${String(rest).padStart(2, "0")}"` : `${m}'`;
}

export function buildWorkout(input = {}) {
  const reps = Math.max(FIXED.minReps, Math.round(Number(input.reps) || 3));
  const surgeSec = Math.max(
    5,
    Math.round(Number(input.surgeSec) || 60)
  );
  const surgeFtpPct = Math.round(
    clamp(Number(input.surgeFtpPct) || 85, 70, 100)
  );

  const segments = [];
  let t = 0;

  const add = (duration, type, label, ftpPct, rpmText, extra = {}) => {
    const d = Math.max(1, Math.round(duration));
    segments.push({
      start: t,
      end: t + d,
      duration: d,
      type,
      label,
      ftpPct,
      rpmText,
      series: 0,
      rep: 0,
      high: ftpPct >= 80,
      ...extra,
    });
    t += d;
  };

  // 1) Riscaldamento
  add(
    FIXED.warmupMin * 60,
    "warmup",
    "Riscaldamento",
    50,
    "≈ 85 rpm",
    { hint: "Parti morbido, sciogli le gambe" }
  );

  // 2) 5 minuti alternati: 30" FTP 50% / 30" pedalata agile
  const activationBlocks = FIXED.activationMin * 2;
  for (let i = 0; i < activationBlocks; i++) {
    const agile = i % 2 === 1;
    add(
      30,
      agile ? "agile" : "ftp50",
      agile ? "Pedalata agile" : "FTP 50%",
      50,
      agile ? "≥ 90 rpm" : "≈ 85 rpm",
      { hint: agile ? "Gamba veloce e leggera" : "Respira e preparati" }
    );
  }

  // 3) 4 serie di interval training
  for (let s = 1; s <= FIXED.series; s++) {
    for (let r = 1; r <= reps; r++) {
      add(surgeSec, "surge", "Allungo", surgeFtpPct, "85–90 rpm", {
        series: s,
        rep: r,
        hint:
          surgeFtpPct >= 85
            ? "Spingi forte, non mollare"
            : "Allungo controllato",
      });
      add(surgeSec, "recovery", "Recupero", 50, "≥ 90 rpm", {
        series: s,
        rep: r,
        hint: "Gambe agili, respiro profondo",
      });
    }
    if (s < FIXED.series) {
      add(
        FIXED.betweenSeriesMin * 60,
        "between",
        "Recupero tra serie",
        45,
        "≥ 85 rpm",
        { series: s, hint: "Bevi, recupera e preparati alla serie dopo" }
      );
    }
  }

  // 4) Defaticamento
  add(
    FIXED.cooldownMin * 60,
    "cooldown",
    "Defaticamento",
    40,
    "≈ 80 rpm",
    { hint: "Rilassa le gambe, respira" }
  );

  return {
    segments,
    total: t,
    config: { reps, surgeSec, surgeFtpPct },
    series: FIXED.series,
  };
}

export function findSegmentIndex(segments, elapsed) {
  if (!segments.length) return -1;
  const t = clamp(Number(elapsed) || 0, 0, segments[segments.length - 1].end);
  let lo = 0;
  let hi = segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t < segments[mid].end) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

export function segmentAt(segments, elapsed) {
  const i = findSegmentIndex(segments, elapsed);
  return { index: i, segment: i >= 0 ? segments[i] : null };
}

export function nextSegment(segments, elapsed) {
  const i = findSegmentIndex(segments, elapsed);
  return i >= 0 && i + 1 < segments.length ? segments[i + 1] : null;
}
