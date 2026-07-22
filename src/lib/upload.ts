// Shared upload constants + helpers. PURE and environment-agnostic: imported by
// both the server Route Handlers (`src/app/api/uploads/*`) and the client
// `UploadDialog`. It must never import server-only modules or `node:*`
// built-ins — it references only the global `crypto` (Web Crypto), which exists
// in both the browser and Node's runtime.

// 150 MB — matches the `uploads` bucket file_size_limit (157286400) in the migration.
export const MAX_UPLOAD_BYTES = 150 * 1024 * 1024;

// Phase 1 is MP4-only: the button says "Upload an MP4", the picker uses accept="video/mp4",
// and both client and server validate against this single canonical type. The storage
// bucket permits a wider set of video types, so validating stricter here is always safe.
export const ALLOWED_MIME = ["video/mp4"] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];

// Value for the file input's `accept` attribute.
export const ACCEPT_ATTR = "video/mp4";

export function isAllowedMime(type: string): type is AllowedMime {
  return (ALLOWED_MIME as readonly string[]).includes(type);
}

// True for a file the browser reports as MP4, or whose name ends in .mp4 when the
// browser leaves the type blank (some OS/browser combos do). Lets the picker stay
// forgiving without widening the accepted type.
export function looksLikeMp4(name: string, type: string): boolean {
  if (isAllowedMime(type)) return true;
  return type === "" && /\.mp4$/i.test(name);
}

// Collapse anything not word/dot/dash into "_", trim leading underscores, keep the
// tail (extensions live at the end). Empty result falls back to "video".
export function sanitizeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").replace(/^_+/, "").slice(-80) || "video";
}

// queued/{ts}-{uuid}-{safeName} — MUST stay under queued/ (storage RLS: name like 'queued/%').
// Uses crypto.randomUUID() (never Math.random) for the collision-proof random segment.
export function buildStoragePath(name: string): string {
  const rand = crypto.randomUUID();
  return `queued/${Date.now()}-${rand}-${sanitizeName(name)}`;
}

// Same shape the waitlist route uses. Kept here so the client can pre-validate.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}
