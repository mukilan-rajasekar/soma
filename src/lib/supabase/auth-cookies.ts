// auth-cookies.ts — Set-Cookie onto a 303 the Route Handler built itself.
//
// cookies() from next/headers writes onto an implicit response. Returning
// NextResponse.redirect replaces that object, so the browser never sees the
// cookies. NextResponse.cookies.set / headers.append on that redirect has also
// arrived at the client with no Set-Cookie (recovery then bounced off the
// proxy). A raw Response with Location + appended Set-Cookie is the write that
// actually reaches Chromium.

import type { NextRequest } from "next/server";

/** Matches @supabase/ssr's setAll item (cookie package SerializeOptions). */
type SameSite = boolean | "lax" | "strict" | "none";

export type CookieSet = {
  name: string;
  value: string;
  options?: {
    path?: string;
    domain?: string;
    maxAge?: number;
    expires?: Date;
    sameSite?: SameSite;
    httpOnly?: boolean;
    secure?: boolean;
  };
};

export function cookieJar() {
  const jar = new Map<string, CookieSet>();
  return {
    jar,
    setAll(items: CookieSet[]) {
      for (const item of items) jar.set(item.name, item);
    },
  };
}

function sameSiteAttr(value: SameSite | undefined): string {
  if (value === true || value === "strict") return "Strict";
  if (value === "none") return "None";
  return "Lax";
}

function cookieHeader(
  name: string,
  value: string,
  options: CookieSet["options"],
  secureDefault: boolean,
): string {
  const useSecure = options?.secure ?? secureDefault;
  const parts = [`${name}=${value}`];
  if (options?.maxAge != null) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options?.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  parts.push(`Path=${options?.path ?? "/"}`);
  if (options?.domain) parts.push(`Domain=${options.domain}`);
  parts.push(`SameSite=${sameSiteAttr(options?.sameSite)}`);
  if (useSecure) parts.push("Secure");
  if (options?.httpOnly) parts.push("HttpOnly");
  return parts.join("; ");
}

/** 303 to `next` carrying every cookie in the jar. */
export function redirectWithCookies(
  request: NextRequest,
  next: string,
  jar: Map<string, CookieSet>,
): Response {
  const headers = new Headers();
  headers.set("Location", new URL(next, request.url).toString());
  headers.set("Cache-Control", "no-store");
  const secure = request.nextUrl.protocol === "https:";
  for (const { name, value, options } of jar.values()) {
    headers.append("Set-Cookie", cookieHeader(name, value, options, secure));
  }
  return new Response(null, { status: 303, headers });
}
