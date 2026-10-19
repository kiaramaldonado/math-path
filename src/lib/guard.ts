export type Route =
  | { kind: "admin"; target: string } // reached through the secret path; rewrite to /admin/*
  | { kind: "hidden" } // real admin URLs: pretend they don't exist
  | { kind: "api" }
  | { kind: "public" };

/** "/k-abc/" → "/k-abc". Too short or missing → "" (admin unreachable). */
export function normalizeAdminPath(raw: string | undefined): string {
  const p = "/" + (raw ?? "").trim().replace(/^\/+|\/+$/g, "");
  return p.length >= 9 && !p.startsWith("/admin") && !p.startsWith("/api") ? p : "";
}

export function classify(pathname: string, adminPath: string): Route {
  if (adminPath && (pathname === adminPath || pathname.startsWith(adminPath + "/"))) {
    const rest = pathname.slice(adminPath.length).replace(/\/+$/, "");
    return { kind: "admin", target: "/admin" + rest };
  }
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return { kind: "hidden" };
  if (pathname === "/api" || pathname.startsWith("/api/")) return { kind: "api" };
  return { kind: "public" };
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Mutating requests must come from our own pages (CSRF defence on top of SameSite=Strict). */
export function sameOrigin(method: string, origin: string | null, expected: string): boolean {
  if (!MUTATING.has(method)) return true;
  return origin === expected;
}
