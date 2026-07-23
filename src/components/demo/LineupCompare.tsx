// "Across the lineup" — the whole demo roster's cortical profiles in one comparison
// chart, on a SHARED scale so magnitudes are comparable ad-to-ad (unlike the per-card
// panel, which scales to its own max). Each ad also carries a one-line plain-english
// read of what its profile means. Attention / language / default-mode only — emotion
// nets are never surfaced. Values are the mean ROI activation from the frozen-TRIBE
// preds; the tick on each bar is that ad's whole-cortex baseline.

type Row = {
  name: string;
  attention: number;
  language: number;
  dmn: number;
  base: number;
  read: string;
};

// Grouped by which system leads: eye-first (attention on top) vs copy-first (language on top).
const VISUAL_LED: Row[] = [
  { name: "Welding-gear DR ad", attention: 0.2495, language: 0.2084, dmn: 0.1942, base: 0.1806,
    read: "Grabs and holds — attention leads with the message landing right behind it. A tight direct-response cut." },
  { name: "Streetwear cap", attention: 0.2451, language: 0.1858, dmn: 0.1851, base: 0.1775,
    read: "Fires broadly — strong attention and the message reads too. Product and copy both working." },
  { name: "3-step skincare", attention: 0.213, language: 0.183, dmn: 0.171, base: 0.169,
    read: "Everything engages — attention leads while the routine's steps read as language." },
  { name: "Ice-cream shop", attention: 0.201, language: 0.134, dmn: 0.118, base: 0.148,
    read: "Pure visual — attention spikes while the language read sits below baseline. Nothing to read, all to look at." },
  { name: "Fashion drop", attention: 0.1615, language: 0.1101, dmn: 0.0989, base: 0.1187,
    read: "Visual-first — the eye is grabbed; almost no language processing." },
  { name: "Charm bracelet", attention: 0.155, language: 0.133, dmn: 0.123, base: 0.129,
    read: "Attention-led — the product carries it more than the copy." },
  { name: "Tool clearance", attention: 0.152, language: 0.115, dmn: 0.105, base: 0.107,
    read: "Attention-led clearance push; light on language." },
  { name: "Sofa showroom", attention: 0.148, language: 0.121, dmn: 0.109, base: 0.113,
    read: "Showcase — attention leads on a modest message." },
];

const COPY_LED: Row[] = [
  { name: "Whey protein", attention: 0.173, language: 0.225, dmn: 0.215, base: 0.185,
    read: "Claims-heavy — the language system leads and raw attention dips below baseline. It works your reading brain, not your eyes." },
  { name: "Lip tint", attention: 0.105, language: 0.126, dmn: 0.128, base: 0.112,
    read: "Message-forward — language and default-mode edge out attention." },
  { name: "Evening-wear", attention: 0.093, language: 0.116, dmn: 0.099, base: 0.097,
    read: "Copy-driven — language leads on modest attention." },
];

// shared scale across every bar in the chart, so a longer bar always means more activation
const SCALE =
  Math.max(...[...VISUAL_LED, ...COPY_LED].flatMap((r) => [r.attention, r.language, r.dmn, r.base])) * 1.08;

const NETS: { key: "attention" | "language" | "dmn"; label: string }[] = [
  { key: "attention", label: "attention" },
  { key: "language", label: "language" },
  { key: "dmn", label: "default-mode" },
];

function Bars({ row }: { row: Row }) {
  return (
    <div className="flex flex-col gap-[5px]">
      {NETS.map((n) => {
        const v = row[n.key];
        const lit = v > row.base;
        return (
          <div key={n.key} className="grid grid-cols-[68px_1fr_36px] items-center gap-2 text-[10px]">
            <span className="truncate text-right text-ink-2">{n.label}</span>
            <span className="relative block h-2 rounded-sm border border-line bg-paper">
              <i
                className="absolute inset-y-0 left-0 rounded-[1px]"
                style={{ width: `${Math.max(2, (v / SCALE) * 100)}%`, background: "var(--color-accent)", opacity: lit ? 1 : 0.4 }}
              />
              <span
                className="absolute -inset-y-[2px] z-[2] w-px bg-ink-3"
                style={{ left: `${(row.base / SCALE) * 100}%` }}
                aria-hidden="true"
              />
            </span>
            <span className="text-right tabular-nums text-ink">{v.toFixed(3)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Card({ row }: { row: Row }) {
  return (
    <div className="rounded-xl border border-line bg-fill p-3">
      <div className="mb-2 text-[12px] font-medium tracking-[-0.01em] text-ink">{row.name}</div>
      <Bars row={row} />
      <p className="mt-2.5 text-[11px] leading-[1.5] tracking-[0.01em] text-ink-2">{row.read}</p>
    </div>
  );
}

function Group({ title, sub, rows }: { title: string; sub: string; rows: Row[] }) {
  return (
    <div>
      <div className="mb-2.5 flex items-baseline gap-2">
        <span className="text-[12px] font-semibold tracking-[-0.01em] text-ink">{title}</span>
        <span className="text-[11px] text-ink-3">{sub}</span>
      </div>
      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(248px,1fr))]">
        {rows.map((r) => (
          <Card key={r.name} row={r} />
        ))}
      </div>
    </div>
  );
}

export default function LineupCompare() {
  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-[70ch] text-[13px] leading-[1.6] text-ink-2">
        Every ad&rsquo;s cortical profile on one shared scale — which brain systems each one drives, read
        straight off the model. A longer bar is more activation; the{" "}
        <span className="text-ink">&#9474;</span> tick is that ad&rsquo;s whole-cortex baseline, so a bar past
        the tick means that system lights up above average. Faded bars sit below baseline.
      </p>
      <Group
        title="Visual-led"
        sub="attention on top — the eye does the work"
        rows={VISUAL_LED}
      />
      <Group
        title="Copy-led"
        sub="language on top — the reading brain does the work"
        rows={COPY_LED}
      />
    </div>
  );
}
