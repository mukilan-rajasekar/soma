"use client";

// /upload — the batch intake. The front door of the delivery loop.
//
// WHAT THIS ASKS FOR, AND WHY IT IS MORE THAN A FILE PICKER. demo/process_batch.py
// cannot score a batch without six message fields: Communication Clarity is 25% of the
// score and is computed by checking the ad's own words (OCR off the screen, ASR out of
// the audio) against what the advertiser SAYS the ad is meant to communicate. There is
// no way to infer those from the footage — that is the whole point of the check. So the
// brief is not friction added to an upload, it is a quarter of the deliverable.
//
// The landing page's one-click dialog is deliberately untouched and still handles
// one-off "here's an ad, take a look" intake. This is the path that produces a ranked,
// delivered read-out at /r/<token>.
//
// EVERYTHING IS VALIDATED HERE THAT CAN BE. A batch whose cuts span two duration buckets
// is rejected by the pipeline after the files are uploaded and the box has been paid for;
// the browser can know that in about a second by reading each file's metadata locally
// (readDuration). Same for the message fields. The server re-validates all of it through
// the SAME module (src/lib/batch.ts), so the two can't drift — this copy exists to make
// the failure fast and legible, never to be the enforcement.

import { useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  MAX_BATCH_ADS,
  MESSAGE_FIELDS,
  MESSAGE_FIELD_COPY,
  RANKING_FLOOR,
  OBJECTIVES,
  PLACEMENTS,
  PLATFORMS,
  briefFieldProblems,
  durationBucket,
  emptyBrief,
  normaliseAliases,
  validateAds,
  validateBrief,
  type Brief,
} from "@/lib/batch";
import { ACCEPT_ATTR } from "@/lib/upload";
import {
  isValidEmail,
  putWithProgress,
  readDuration,
  rejectFile,
  signUpload,
} from "@/lib/upload-client";

type Picked = {
  /** Stable key for React and for progress lookup. */
  key: string;
  file: File;
  title: string;
  durationS: number;
};

type Phase = "idle" | "uploading" | "creating" | "error";

export default function BatchUpload({
  initialEmail,
  brands,
}: {
  /** Session email, when the dashboard renders this. Replaces the email field —
   *  the API takes the owner from the verified session anyway, so asking a signed-in
   *  person to retype their address was pure noise. */
  initialEmail?: string;
  /** The account's brand names, when the dashboard renders this. Prefills the brief. */
  brands?: string[];
} = {}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [files, setFiles] = useState<Picked[]>([]);
  const [brief, setBrief] = useState<Brief>(() => {
    const b = emptyBrief();
    // The account already named its brand — start from it rather than an empty box.
    return brands?.length ? { ...b, brand_name: brands[0] } : b;
  });
  const [email, setEmail] = useState(initialEmail ?? "");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState(false);

  const busy = phase === "uploading" || phase === "creating";

  // Live problems, recomputed as the form changes. Shown only once the person has tried
  // to submit — a form that turns red before anyone has typed anything is hostile.
  const problems = useMemo(
    () => [
      ...validateAds(files.map((f) => ({
        path: "",
        filename: f.file.name,
        title: f.title,
        durationS: f.durationS,
      }))),
      ...validateBrief(brief),
      ...(isValidEmail(email) ? [] : ["A valid email, so we can reach you about this run."]),
    ],
    [files, brief, email],
  );

  // The same problems, pinned to their inputs — rendered inline so nobody has to
  // scroll from the summary at the submit button back up to find the empty field.
  const fieldProblems = useMemo(() => briefFieldProblems(brief), [brief]);

  const buckets = useMemo(() => {
    const seen = new Set<string>();
    for (const f of files) {
      if (Number.isFinite(f.durationS) && f.durationS > 0) seen.add(durationBucket(f.durationS));
    }
    return seen;
  }, [files]);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage("");
    const picked = Array.from(e.target.files ?? []);
    if (inputRef.current) inputRef.current.value = "";
    if (!picked.length) return;

    const rejected: string[] = [];
    const accepted: Picked[] = [];
    for (const file of picked) {
      const why = rejectFile(file);
      if (why) {
        rejected.push(why);
        continue;
      }
      accepted.push({
        key: `${file.name}-${file.size}-${file.lastModified}`,
        file,
        // A sensible default the person can overwrite: the filename without its
        // extension, which is usually already how they refer to the cut.
        title: file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 60),
        durationS: NaN,
      });
    }

    // De-dupe against what is already staged, so picking the same file twice (easy to
    // do across two trips to the file dialog) does not create two ads of one cut.
    setFiles((prev) => {
      const have = new Set(prev.map((p) => p.key));
      const next = [...prev, ...accepted.filter((a) => !have.has(a.key))];
      return next.slice(0, MAX_BATCH_ADS);
    });
    if (rejected.length) setMessage(rejected.join(" "));

    // Durations resolve asynchronously and independently; each lands as it arrives.
    for (const a of accepted) {
      readDuration(a.file).then((d) =>
        setFiles((prev) => prev.map((p) => (p.key === a.key ? { ...p, durationS: d } : p))),
      );
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setMessage("");
    if (problems.length) {
      setMessage(problems[0]);
      // Put focus where the fixing starts. The inline errors render on the next
      // frame (touched just flipped), so the query waits one frame too.
      requestAnimationFrame(() => {
        formRef.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus();
      });
      return;
    }

    setPhase("uploading");
    setProgress({});

    try {
      // Sequential, not parallel. Ten 150 MB files at once will saturate an office
      // connection and make every individual progress bar meaningless; one at a time is
      // slower in theory and far more legible in practice, and it means a failure names
      // the file it happened on.
      const uploaded: { path: string; filename: string; title: string; durationS: number }[] = [];
      for (const f of files) {
        const { path, signedUrl } = await signUpload(f.file, email);
        await putWithProgress(signedUrl, f.file, (pct) =>
          setProgress((p) => ({ ...p, [f.key]: pct })),
        );
        uploaded.push({
          path,
          filename: f.file.name,
          title: f.title,
          durationS: Number.isFinite(f.durationS) ? f.durationS : 0,
        });
      }

      setPhase("creating");
      const res = await fetch("/api/batches/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          brief: {
            ...brief,
            brand_aliases: normaliseAliases(brief.brand_aliases),
            product_aliases: normaliseAliases(brief.product_aliases),
          },
          ads: uploaded,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.token) {
        throw new Error(body?.error ?? "Could not queue these ads.");
      }

      // The address IS the confirmation. No interstitial "thanks" screen: the run has a
      // page, it already knows its own status, and sending them anywhere else would mean
      // building a second thing that says less.
      router.push(`/r/${body.token}`);
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  const set = (k: keyof Brief) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setBrief((b) => ({ ...b, [k]: e.target.value }));

  return (
    <form ref={formRef} onSubmit={submit} className="mx-auto max-w-[860px] px-[clamp(16px,4vw,24px)] pb-24 pt-[clamp(26px,5vw,44px)]">
      <div className="mb-5 inline-flex items-center gap-[9px] text-[11px] uppercase tracking-[0.18em] text-ink-3">
        <span className="h-[6px] w-[6px] rounded-full bg-accent-2" />
        Send your ads
      </div>
      <h1 className="max-w-[20ch] text-balance text-hero text-ink">
        Send an ad. See where it earns{" "}
        <span className="font-serif font-normal italic">attention</span>.
      </h1>
      {/* ONE ad is a supported run, not a degraded one, and the copy leads with that.
          The old headline ("Send the cuts. Get back the one that wins.") described a
          bake-off, which is the only thing the form used to accept — MIN_BATCH_ADS was 2
          and a single ad was rejected at validation. It now scores within-item, so the
          page has to offer both jobs and be precise about which one you get. */}
      <p className="mt-[18px] max-w-[62ch] text-pretty text-[clamp(16px,1.7vw,18px)] leading-[1.5] text-ink-2">
        One ad, or up to {MAX_BATCH_ADS} of them. We read how a brain watches every second
        of your creative and hand back the timestamps where attention leaks. Send{" "}
        {RANKING_FLOOR} or more from the same campaign and we rank them against each other
        too. Turnaround is measured in hours.
      </p>

      {/* ── 1 · the ads ──────────────────────────────────────────────────── */}
      <Step n="01" title="Your ads">
        <p className="mb-4 max-w-[62ch] text-body text-ink-2">
          MP4, up to 150 MB each. A single ad is scored against{" "}
          <span className="font-serif italic">itself</span> — how its opening seconds rank
          among its own, and how much of it holds attention. To get a ranking as well, send{" "}
          {RANKING_FLOOR} or more from the same campaign at roughly the same length: a
          ranking is a percentile against the others in the run, so mixing creative jobs or
          a 9-second ad with a 45-second one makes it meaningless.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          multiple
          onChange={onPick}
          disabled={busy || files.length >= MAX_BATCH_ADS}
          className="hidden"
          id="batch-files"
        />
        <label
          htmlFor="batch-files"
          className={`flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-line-2 bg-fill px-4 py-[15px] text-left text-[14px] transition-colors ${
            busy || files.length >= MAX_BATCH_ADS
              ? "cursor-not-allowed opacity-60"
              : "cursor-pointer text-ink-2 hover:border-ink hover:text-ink"
          }`}
        >
          <span>
            {files.length >= MAX_BATCH_ADS
              ? `That's the maximum of ${MAX_BATCH_ADS}.`
              : files.length
                ? "Add more ads"
                : "Choose your ads"}
          </span>
          <span className="shrink-0 text-[13px] text-ink-3">
            {files.length}/{MAX_BATCH_ADS}
          </span>
        </label>

        {files.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-px overflow-hidden rounded-2xl border border-line bg-line">
            {files.map((f, i) => {
              const bucket =
                Number.isFinite(f.durationS) && f.durationS > 0 ? durationBucket(f.durationS) : null;
              const odd = bucket !== null && buckets.size > 1;
              const pct = progress[f.key];
              return (
                <li key={f.key} className="bg-paper p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[12px] tabular-nums tracking-[0.1em] text-ink-3">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <input
                      value={f.title}
                      onChange={(e) =>
                        setFiles((prev) =>
                          prev.map((p) => (p.key === f.key ? { ...p, title: e.target.value } : p)),
                        )
                      }
                      disabled={busy}
                      placeholder="Name this cut"
                      aria-label={`Name for ${f.file.name}`}
                      className="min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 py-2 text-[14px] text-ink outline-none focus:border-ink-3 disabled:opacity-60"
                    />
                    <span className="shrink-0 text-[12.5px] tabular-nums text-ink-3">
                      {(f.file.size / 1e6).toFixed(1)} MB
                    </span>
                    <span
                      className={`shrink-0 text-[12.5px] tabular-nums ${odd ? "text-neg" : "text-ink-3"}`}
                    >
                      {bucket ? `${Math.round(f.durationS)}s · ${bucket}` : "reading…"}
                    </span>
                    {!busy ? (
                      <button
                        type="button"
                        onClick={() => setFiles((prev) => prev.filter((p) => p.key !== f.key))}
                        aria-label={`Remove ${f.file.name}`}
                        className="shrink-0 cursor-pointer rounded-md px-2 py-1 text-[16px] leading-none text-ink-3 transition-colors hover:text-ink"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-1.5 pl-[30px] text-[12px] text-ink-3">{f.file.name}</div>
                  {pct !== undefined ? (
                    <div className="mt-2 ml-[30px] h-1 overflow-hidden rounded-full bg-line">
                      <div
                        className="h-full rounded-full bg-ink transition-[width] duration-200"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}

        {buckets.size > 1 ? (
          <p className="mt-3 text-[13px] leading-[1.6] text-neg">
            These ads span more than one length category ({[...buckets].join(", ")}). Length
            is a confound, so the batch has to be length-matched before it can be ranked.
          </p>
        ) : null}
      </Step>

      {/* ── 2 · the brief ────────────────────────────────────────────────── */}
      <Step n="02" title="What the ads are meant to say">
        <p className="mb-5 max-w-[62ch] text-body text-ink-2">
          Comprehension is a quarter of the score, and it is measured by checking the ad&rsquo;s
          own words against these. We cannot read them off the footage: knowing whether the
          message landed means knowing what the message was.
        </p>

        {brands && brands.length > 1 ? (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] text-ink-3">Your brands:</span>
            {brands.map((b) => (
              <button
                key={b}
                type="button"
                disabled={busy}
                onClick={() => setBrief((prev) => ({ ...prev, brand_name: b }))}
                aria-pressed={brief.brand_name === b}
                className={`cursor-pointer rounded-full border px-3 py-1 text-[12.5px] transition-colors ${
                  brief.brand_name === b
                    ? "border-ink bg-ink text-paper"
                    : "border-line-2 bg-paper text-ink-2 hover:border-ink hover:text-ink"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {MESSAGE_FIELDS.map((f) => (
            <Field
              key={f}
              label={MESSAGE_FIELD_COPY[f].label}
              hint={MESSAGE_FIELD_COPY[f].hint}
              placeholder={MESSAGE_FIELD_COPY[f].placeholder}
              value={brief[f]}
              onChange={set(f)}
              disabled={busy}
              required
              error={touched ? fieldProblems[f] : undefined}
            />
          ))}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Other names for the brand"
            hint="Optional. Stylised spellings that text recognition might return."
            placeholder="kova, kovafit"
            value={
              Array.isArray(brief.brand_aliases) ? brief.brand_aliases.join(", ") : brief.brand_aliases
            }
            onChange={(e) =>
              setBrief((b) => ({ ...b, brand_aliases: e.target.value.split(",") }))
            }
            disabled={busy}
          />
          <Field
            label="Other names for the product"
            hint="Optional."
            placeholder="whey, isolate"
            value={
              Array.isArray(brief.product_aliases)
                ? brief.product_aliases.join(", ")
                : brief.product_aliases
            }
            onChange={(e) =>
              setBrief((b) => ({ ...b, product_aliases: e.target.value.split(",") }))
            }
            disabled={busy}
          />
        </div>
      </Step>

      {/* ── 3 · where it runs ────────────────────────────────────────────── */}
      <Step n="03" title="Where these run">
        <p className="mb-5 max-w-[62ch] text-body text-ink-2">
          Asked once for the whole batch rather than per cut, which is what makes the
          comparison fair by construction: ads competing for different placements or
          audiences are not doing the same job and cannot be ranked against each other.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Platform" value={brief.platform} onChange={set("platform")} options={PLATFORMS} disabled={busy} />
          <Select label="Placement" value={brief.placement} onChange={set("placement")} options={PLACEMENTS} disabled={busy} />
          <Select label="Objective" value={brief.objective} onChange={set("objective")} options={OBJECTIVES} disabled={busy} />
          <Field
            label="Audience"
            hint="However you describe it internally."
            placeholder="cold US 25-44"
            value={brief.audience}
            onChange={set("audience")}
            disabled={busy}
            required
            error={touched ? fieldProblems.audience : undefined}
          />
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Name this run"
            hint="Optional. What you'll recognise it by."
            placeholder="Q3 hook test"
            value={brief.batch_name}
            onChange={set("batch_name")}
            disabled={busy}
          />
          {initialEmail ? (
            /* Signed in: the address is already known and the API takes the owner from
               the session, so there is nothing to type. Say where the run will land. */
            <div className="flex flex-col">
              <span className="text-[12px] uppercase tracking-[0.07em] text-ink-3">
                Your email
              </span>
              <p className="mt-2 text-[15px] text-ink">{email}</p>
              <span className="mt-1.5 text-[12.5px] leading-[1.5] text-ink-3">
                From your account — we&rsquo;ll reach you here about this run.
              </span>
            </div>
          ) : (
            <Field
              label="Your email"
              hint="Where we reach you about this run."
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              type="email"
              required
              error={
                touched && !isValidEmail(email)
                  ? "A valid email, so we can reach you about this run."
                  : undefined
              }
            />
          )}
        </div>
      </Step>

      {/* ── submit ───────────────────────────────────────────────────────── */}
      <div className="mt-10 border-t border-line pt-8">
        {touched && problems.length ? (
          /* role="alert" so the summary is announced when it appears on submit; the
             per-field copies of these live inline next to their inputs. */
          <div role="alert">
            <ul className="mb-5 flex flex-col gap-2">
              {problems.map((p) => (
                <li key={p} className="flex gap-2.5 text-[13.5px] leading-[1.55] text-neg">
                  <span aria-hidden className="mt-[8px] h-px w-2.5 shrink-0 bg-neg" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {message ? (
          <p className="mb-5 text-[13.5px] leading-[1.55] text-neg">{message}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={busy}
            className="cursor-pointer rounded-xl bg-ink px-6 py-[14px] text-ui font-medium text-paper transition-colors hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {phase === "uploading"
              ? "Uploading…"
              : phase === "creating"
                ? "Queueing…"
                : "Send these ads"}
          </button>
          <span className="text-[13px] text-ink-3">
            {busy
              ? "Keep this tab open until the upload finishes."
              : "You'll get a private link that updates itself as the run progresses."}
          </span>
        </div>
      </div>
    </form>
  );
}

// ── pieces ──────────────────────────────────────────────────────────────────────

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-[clamp(34px,6vw,56px)] border-t border-line pt-8">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="text-[12px] tabular-nums tracking-[0.1em] text-ink-3">{n}</span>
        <h2 className="text-section text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Field({
  label, hint, placeholder, value, onChange, disabled, required, type = "text", error,
}: {
  label: string;
  hint?: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  required?: boolean;
  type?: string;
  /** Inline problem for THIS field. Replaces the hint while present — the two say
   *  related things and stacking them doubles the row height for no information. */
  error?: string;
}) {
  const errorId = useId();
  return (
    <label className="flex flex-col">
      <span className="text-[12px] uppercase tracking-[0.07em] text-ink-3">
        {label}
        {required ? <span className="text-neg"> *</span> : null}
      </span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`mt-2 w-full rounded-xl border bg-paper px-[15px] py-[12px] text-[15px] text-ink outline-none transition-colors disabled:opacity-60 ${
          error ? "border-neg focus:border-neg" : "border-line focus:border-ink-3"
        }`}
      />
      {error ? (
        <span id={errorId} className="mt-1.5 text-[12.5px] leading-[1.5] text-neg">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1.5 text-[12.5px] leading-[1.5] text-ink-3">{hint}</span>
      ) : null}
    </label>
  );
}

function Select({
  label, value, onChange, options, disabled,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: readonly string[];
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col">
      <span className="text-[12px] uppercase tracking-[0.07em] text-ink-3">
        {label}
        <span className="text-neg"> *</span>
      </span>
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="mt-2 w-full cursor-pointer rounded-xl border border-line bg-paper px-[15px] py-[12px] text-[15px] text-ink outline-none transition-colors focus:border-ink-3 disabled:opacity-60"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
