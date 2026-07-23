// Canonical Arc type — the single source of truth for arc-shaped data.
// Reproduces the old `validArc`/schema shape from `demo/app.js` (BUILD-SPEC §B).
// Types only, no runtime logic: the `/demo` player, A/B compare, and live Supabase
// rows all import these types. Everything except `timestamps` + `activation`
// (equal length) + a positive duration is optional and defensively guarded.

export type Arc = {
  // --- REQUIRED for a valid arc ---
  timestamps: number[];          // seconds, ~1 Hz, evenly spaced
  activation: number[];          // whole-cortex magnitude 0..1; MUST equal timestamps.length

  // --- duration source: duration_sec || last timestamp; must be > 0 ---
  duration_sec?: number;

  // --- descriptive / provenance ---
  video_id?: string;
  fps_arc?: number;
  feature?: "roi" | "global" | string;
  precomputed?: boolean;
  video_src?: string;            // "" | null => timer mode; non-empty URL => <video> sync mode
  claim?: {
    validated?: string;
    hypothesis?: string;
    attention_hypothesis?: string;
    affect_hypothesis?: string;
    [k: string]: string | undefined;
  };

  // --- attention weak-spot bands + callouts ---
  weak_spots?: Array<{ start: number; end: number; label: string }>;

  // --- trained-head honesty badge on the attention lane ---
  attention_badge?: string;
  attention_status?: string;     // "learned-hypothesis" => teal; anything else => red

  // --- per-lane badge/status alternative location ---
  lanes?: {
    attention?: { badge?: string; status?: string };
    valence?: { badge?: string; status?: string };
    arousal?: { badge?: string; status?: string };
  };

  // --- demoted arithmetic baseline (faint dashed under head arc) ---
  baseline?: { activation: number[] };

  // --- cortical network profile: mean predicted activation per a-priori ROI (the
  // "where it lights up" figure). strong = TRIBE's reliable cortex (attention/
  // language/DMN); !strong = the emotion dead zone (valence/arousal), shown not hidden. ---
  roi_profile?: Array<{ net: string; value: number; strong: boolean }>;
  roi_baseline?: number; // whole-cortex mean, drawn as the profile's baseline tick

  // --- message / semantic-load lane: language-ROI activation 0..1 (trimodal only).
  // "where the copy makes the brain work", never "the viewer understood it". ---
  message?: number[];

  // --- affect lanes ---
  affect?: {
    status?: string;
    method?: string;

    valence?: number[];          // ~[-1,1], "center" mode
    valence_lo?: number[];
    valence_hi?: number[];
    valence_badge?: string;
    valence_status?: string;

    arousal?: number[];          // ~[0,1], "bottom" mode
    arousal_lo?: number[];
    arousal_hi?: number[];
    arousal_badge?: string;
    arousal_status?: string;

    validation?: {
      dataset?: string;
      null?: string;
      n?: number | null;
      r_valence?: number | null;
      p_valence?: number | null;
      r_arousal?: number | null;
      p_arousal?: number | null;
    };

    coarse_states?: {
      labels: string[];          // e.g. ["pleasant·calm","pleasant·intense",…]
      probs: number[][];         // rows per timepoint, length labels.length, each ~sums to 1
      status?: string;
      method?: string;
    };
  };

  // set at runtime, not in the file:
  _baseline?: number[] | null;
};

// Live Supabase row (folded in by mergeLiveArcs, gated by validArc(r.arc)):
export type LiveArcRow = {
  ad_id: string;
  title?: string;
  arc: Arc;
  meta?: { dataset?: string; source?: string };
};
