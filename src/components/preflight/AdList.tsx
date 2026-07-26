"use client";

// Picker AND legend — one component, two orientations. Section A needs a row of five to
// choose from; Section B needs a column of five beside the overlay explaining which
// curve is which. Those are the same list with the same swatches and the same click
// target, so they are the same component.

import { roleOf, type PreflightAd, type PreflightReport } from "./types";
import { roleVar } from "./tokens";

type Props = {
  ads: PreflightAd[];
  report: PreflightReport;
  selectedId: string;
  onSelect: (id: string) => void;
  orientation?: "row" | "column";
  showScore?: boolean;
  active?: boolean;
};

export default function AdList({
  ads,
  report,
  selectedId,
  onSelect,
  orientation = "row",
  showScore = true,
  active = true,
}: Props) {
  const isRow = orientation === "row";

  return (
    <div
      role="radiogroup"
      aria-label="Choose an ad from the batch"
      className={
        isRow
          ? "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
          : "flex flex-col gap-1.5"
      }
    >
      {ads.map((ad, i) => {
        const role = roleOf(ad, report);
        const selected = ad.id === selectedId;
        return (
          <button
            key={ad.id}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(ad.id)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft"
                && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
              e.preventDefault();
              const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
              onSelect(ads[(i + d + ads.length) % ads.length].id);
            }}
            style={{
              opacity: active ? 1 : 0,
              transform: active ? "none" : "translateY(6px)",
              transition: `opacity .45s ${i * 55}ms, transform .45s ${i * 55}ms`,
            }}
            className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
              selected
                ? "border-ink bg-fill"
                : "border-line bg-paper hover:border-line-2"
            }`}
          >
            <span
              aria-hidden
              className="inline-block h-[3px] w-4 shrink-0 rounded-full"
              style={{ background: roleVar(role) }}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-1.5">
                <span className="text-[10px] tabular-nums text-ink-3">{ad.rank}</span>
                <span
                  className={`truncate text-[13px] ${selected ? "font-medium text-ink" : "text-ink-2"}`}
                >
                  {ad.title}
                </span>
                {/* Weak spots are the most interesting thing on the page and the
                    default (best-ranked) ad often has none — without a marker here
                    they'd be undiscoverable without clicking through all five. */}
                {ad.weakSpots.length ? (
                  <span
                    title={`${ad.weakSpots.length} weak spot${ad.weakSpots.length > 1 ? "s" : ""}`}
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: "var(--color-neg)", opacity: 0.55 }}
                  />
                ) : null}
              </span>
            </span>
            {showScore ? (
              <span
                className={`shrink-0 tabular-nums text-[13px] ${
                  selected ? "font-medium text-ink" : "text-ink-3"
                }`}
              >
                {Math.round(ad.scores.preflight)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
