// Browser-only upload helpers. The sibling of src/lib/upload.ts, split out because that
// file is imported by Route Handlers and must stay environment-agnostic — this one
// touches XMLHttpRequest and can only ever run in a browser.
//
// ONE UPLOADER, TWO INTAKES. The landing page's single-MP4 dialog and the /upload batch
// form both put bytes in the same bucket, the same way, through the same signed-URL
// dance. They were always going to be two components (a one-click modal and a six-field
// brief are different products) but they must not become two uploaders: the retry
// behaviour, the header set and the progress contract are exactly the things that drift
// apart silently and are then debugged twice.

import { MAX_UPLOAD_BYTES, isValidEmail, looksLikeMp4 } from "./upload";

/**
 * PUT a file straight to Supabase Storage with the token embedded in the signed URL —
 * no apikey or Authorization header needed, and no Supabase key in the browser.
 *
 * XMLHttpRequest rather than fetch, deliberately: fetch still cannot report upload
 * progress, and a 150 MB ad uploading behind a silent spinner is indistinguishable from
 * a hung page. The bytes go browser → Storage and never through a Function (Vercel caps
 * serverless request bodies around 4.5 MB, so routing them through one would 413).
 */
export function putWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
    // false: a signed upload URL is minted for a fresh key, so an existing object at
    // that key means something is wrong and should surface rather than be overwritten.
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("Upload failed."));
    };
    xhr.onerror = () => reject(new Error("Upload failed."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(file);
  });
}

/** Mint a signed upload URL for one file. Throws with the server's own message so the
 *  caller can show it verbatim rather than inventing a generic one. */
export async function signUpload(file: File, email: string): Promise<{ path: string; signedUrl: string }> {
  const res = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || "video/mp4",
      sizeBytes: file.size,
      email,
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.signedUrl) {
    throw new Error(body?.error ?? "Could not start upload.");
  }
  return { path: body.path as string, signedUrl: body.signedUrl as string };
}

/**
 * Read a video's duration in the browser, without uploading it.
 *
 * This is what lets /upload reject a length-mismatched batch in about a second instead
 * of twenty minutes into a GPU run: demo/process_batch.py hard-fails a batch whose cuts
 * span more than one duration bucket, and until now the only way to find that out was to
 * run it. Resolves NaN rather than rejecting when the browser cannot decode the file —
 * a duration we could not read must not block an upload, it just skips the bucket check.
 */
export function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    const done = (value: number) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.onloadedmetadata = () => done(video.duration);
    video.onerror = () => done(NaN);
    // Some browsers never fire either event for an unsupported container. Without this
    // the promise never settles and the form waits forever on a file it cannot read.
    setTimeout(() => done(NaN), 10_000);
    video.src = url;
  });
}

/** The client-side gate a file must pass before it is worth signing anything for.
 *  Returns null when the file is fine, or the sentence to show the person. */
export function rejectFile(file: File): string | null {
  if (!looksLikeMp4(file.name, file.type)) return `${file.name} is not an MP4.`;
  if (file.size <= 0) return `${file.name} looks empty.`;
  if (file.size > MAX_UPLOAD_BYTES) return `${file.name} is over 150 MB.`;
  return null;
}

export { isValidEmail };
