"use client";

import { useEffect, useRef, useState } from "react";
import {
  ACCEPT_ATTR,
  MAX_UPLOAD_BYTES,
  isValidEmail,
  looksLikeMp4,
} from "@/lib/upload";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Prefill from the waitlist email if the visitor already typed one. */
  initialEmail?: string;
};

type Phase = "idle" | "uploading" | "success" | "error";

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// PUT the file straight to Supabase Storage using the token embedded in the signed
// URL — no apikey/Authorization header needed. XMLHttpRequest (not fetch) so we can
// report real upload progress. The 150 MB flows here, NOT through our function.
function putWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("Upload failed."));
    };
    xhr.onerror = () => reject(new Error("Upload failed."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.send(file);
  });
}

export default function UploadDialog({ open, onClose, initialEmail }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");

  const pending = phase === "uploading";

  // Seed the email from the waitlist field the first time the dialog opens, only if
  // the visitor hasn't typed one here yet ("asks for email if not already provided").
  // Done during render (not in an effect) per React's "adjust state when a prop
  // changes" pattern, so it runs exactly once per open without a cascading render.
  const [seeded, setSeeded] = useState(false);
  if (open && !seeded) {
    setSeeded(true);
    if (!email && initialEmail) setEmail(initialEmail);
  } else if (!open && seeded) {
    setSeeded(false);
  }

  // Escape closes when not mid-upload.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onClose]);

  if (!open) return null;

  const reset = () => {
    setFile(null);
    setNote("");
    setPhase("idle");
    setProgress(0);
    setMessage("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const close = () => {
    if (pending) return;
    reset();
    onClose();
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage("");
    setPhase("idle");
    const picked = e.target.files?.[0] ?? null;
    if (!picked) {
      setFile(null);
      return;
    }
    if (!looksLikeMp4(picked.name, picked.type)) {
      setFile(null);
      setPhase("error");
      setMessage("Please choose an MP4 video file.");
      return;
    }
    if (picked.size <= 0) {
      setFile(null);
      setPhase("error");
      setMessage("That file looks empty.");
      return;
    }
    if (picked.size > MAX_UPLOAD_BYTES) {
      setFile(null);
      setPhase("error");
      setMessage("That file is over 150 MB. Trim it and try again.");
      return;
    }
    setFile(picked);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");

    if (!file) {
      setPhase("error");
      setMessage("Choose an MP4 first.");
      return;
    }
    if (!isValidEmail(email)) {
      setPhase("error");
      setMessage("Enter a valid email so we can send you the arc.");
      return;
    }

    setPhase("uploading");
    setProgress(0);

    try {
      // 1) get a signed URL (small JSON only)
      const signRes = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || "video/mp4",
          sizeBytes: file.size,
          email: email.trim(),
        }),
      });
      if (!signRes.ok) {
        const b = await signRes.json().catch(() => null);
        throw new Error(b?.error ?? "Could not start upload.");
      }
      const { path, signedUrl } = (await signRes.json()) as {
        path: string;
        signedUrl: string;
      };

      // 2) PUT the bytes straight to Storage (bypasses Vercel's 4.5 MB body cap)
      await putWithProgress(signedUrl, file, setProgress);

      // 3) record the intake row
      await fetch("/api/uploads/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim() || null,
          filename: file.name,
          sizeBytes: file.size,
          contentType: file.type || "video/mp4",
          path,
          note: note.trim() || null,
        }),
      });

      setPhase("success");
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "Upload failed.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[50] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-title"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="absolute inset-0 cursor-default bg-black/30"
      />

      <div className="relative z-[1] w-full max-w-[440px] rounded-2xl border border-[#e2e2e2] bg-paper p-7 shadow-[0_24px_70px_rgba(0,0,0,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <h2
            id="upload-title"
            className="m-0 text-[20px] font-medium tracking-[-0.01em] text-[#0a0a0a]"
          >
            Upload an MP4
          </h2>
          <button
            type="button"
            onClick={close}
            disabled={pending}
            aria-label="Close"
            className="-mr-1 -mt-1 cursor-pointer rounded-md px-2 py-1 text-[18px] leading-none text-ink-3 transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            &times;
          </button>
        </div>

        {phase === "success" ? (
          <div className="mt-4">
            <p className="m-0 text-[15px] leading-[1.5] text-[#0a0a0a]">
              Queued. We&rsquo;ll analyze your ad against real fMRI attention data
              and email the arc to{" "}
              <span className="font-medium">{email.trim()}</span>.
            </p>
            <button
              type="button"
              onClick={close}
              className="mt-6 cursor-pointer rounded-xl border border-[#0a0a0a] bg-[#0a0a0a] px-5 py-[13px] text-[15px] font-medium text-paper transition-colors hover:border-[#333] hover:bg-[#333]"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-4">
            <p className="m-0 mb-5 text-[14px] leading-[1.5] text-[#4a4a4a]">
              Send us your ad and we&rsquo;ll analyze it for attention, then email
              you the arc. MP4, up to 150&nbsp;MB.
            </p>

            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT_ATTR}
              onChange={onPick}
              disabled={pending}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={pending}
              className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-[#d0d0d0] bg-[#fafafa] px-4 py-[15px] text-left text-[14px] text-[#4a4a4a] transition-colors hover:border-[#0a0a0a] hover:text-[#0a0a0a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="min-w-0 truncate">
                {file ? file.name : "Choose an MP4…"}
              </span>
              <span className="shrink-0 text-[13px] text-ink-3">
                {file ? formatSize(file.size) : "Browse"}
              </span>
            </button>

            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="you@company.com"
              disabled={pending}
              className="mt-3 w-full rounded-xl border border-[#d8d8d8] bg-paper px-[15px] py-[13px] text-[15px] text-[#0a0a0a] outline-none disabled:opacity-60"
            />

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything we should know? (optional)"
              rows={2}
              disabled={pending}
              className="mt-3 w-full resize-none rounded-xl border border-[#d8d8d8] bg-paper px-[15px] py-[11px] text-[14px] leading-[1.4] text-[#0a0a0a] outline-none disabled:opacity-60"
            />

            {pending ? (
              <div className="mt-4">
                <div className="h-[6px] w-full overflow-hidden rounded-full bg-[#ececec]">
                  <div
                    className="h-full rounded-full bg-[#0a0a0a] transition-[width] duration-150 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="mt-2 text-[13px] text-[#4a4a4a]">
                  Uploading&hellip; {progress}%
                </div>
              </div>
            ) : null}

            {phase === "error" && message ? (
              <div className="mt-3 text-[13px] text-[#b42318]">{message}</div>
            ) : null}

            <div className="mt-6 flex gap-2">
              <button
                type="submit"
                disabled={pending || !file}
                className="cursor-pointer whitespace-nowrap rounded-xl border border-[#0a0a0a] bg-[#0a0a0a] px-5 py-[13px] text-[15px] font-medium text-paper transition-colors hover:border-[#333] hover:bg-[#333] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? "Uploading…" : "Upload"}
              </button>
              <button
                type="button"
                onClick={close}
                disabled={pending}
                className="cursor-pointer rounded-xl border border-[#d8d8d8] bg-paper px-5 py-[13px] text-[15px] font-medium text-[#4a4a4a] transition-colors hover:border-[#0a0a0a] hover:text-[#0a0a0a] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
