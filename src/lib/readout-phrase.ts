export type ReadoutWindow = {
  startS: number;
  endS: number;
  lane: string;
  depth?: number;
  shotIndex?: number | null;
  shotCount?: number;
  laneVertices?: number;
};

export type ReadoutPhrase = {
  sentence: string;
  badge: string;
};

const BADGE = "PREDICTED · RELATIVE / WITHIN-ITEM · NOT VALIDATED AGAINST OUTCOME";
const SALVENTATTN_VERTICES = 2363;

function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  const minutes = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function laneLabel(lane: string): string {
  const key = lane.trim().toLowerCase();
  // Schaefer SalVentAttn is the preflight / process_batch lane. The demo "surprise"
  // curve is a Destrieux insula/ACC proxy (Dice 0.207 vs SalVentAttn) — naming them
  // the same network is the atlas collision Stage 2.1 forbids.
  if (key === "salventattn" || key === "salience") {
    return "salience-network response (Schaefer-2018 SalVentAttn)";
  }
  if (key === "surprise" || key === "arousal") {
    return "arousal response (Destrieux insula/ACC proxy)";
  }
  if (key === "dorsattn" || key === "attention") {
    return "attention response";
  }
  if (key === "higher_order" || key === "higher-order" || key === "comprehension") {
    return "higher-order response";
  }
  return `${lane || "lane"} response`;
}

function verticesFor(w: ReadoutWindow): number | null {
  if (typeof w.laneVertices === "number" && Number.isFinite(w.laneVertices) && w.laneVertices > 0) {
    return Math.round(w.laneVertices);
  }
  return w.lane.trim().toLowerCase() === "salventattn" ? SALVENTATTN_VERTICES : null;
}

function shotText(w: ReadoutWindow): string {
  if (!w.shotIndex || w.shotIndex < 1) return "";
  if (w.shotCount && w.shotCount >= w.shotIndex) {
    return `, shot ${w.shotIndex} of ${w.shotCount}`;
  }
  return `, shot ${w.shotIndex}`;
}

export function phraseForWindow(w: ReadoutWindow): ReadoutPhrase {
  const vertices = verticesFor(w);
  const vertexText = vertices ? `, ${vertices.toLocaleString("en-US")} fsaverage5 vertices` : "";
  const sentence =
    `Predicted ${laneLabel(w.lane)}${vertexText} falls to a weak relative window ` +
    `between ${formatTime(w.startS)} and ${formatTime(w.endS)}${shotText(w)}.`;

  return { sentence, badge: BADGE };
}
