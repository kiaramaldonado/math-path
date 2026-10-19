import { describe, expect, it } from "vitest";
import { createSession, deleteAllSessions, getSession, isLockedOut, recordFailedLogin } from "../src/lib/auth";
import { base32Encode } from "../src/lib/encoding";
import { classify, normalizeAdminPath, sameOrigin } from "../src/lib/guard";
import { hashPassword, verifyPassword } from "../src/lib/password";
import { totpAt, verifyTotp } from "../src/lib/totp";
import { testDb } from "./d1";

describe("password", () => {
  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("pbkdf2$100000$")).toBe(true);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batterY", hash)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("totp", () => {
  // RFC 6238 test vectors (SHA-1, secret "12345678901234567890"), last 6 digits.
  const secret = base32Encode(new TextEncoder().encode("12345678901234567890"));
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ])("t=%i → %s", async (t, code) => {
    expect(await totpAt(secret, t)).toBe(code);
  });
  it("accepts ±1 step and rejects older codes", async () => {
    const t = 1_700_000_000;
    expect(await verifyTotp(secret, await totpAt(secret, t - 30), t)).toBe(true);
    expect(await verifyTotp(secret, await totpAt(secret, t + 30), t)).toBe(true);
    expect(await verifyTotp(secret, await totpAt(secret, t - 90), t)).toBe(false);
    expect(await verifyTotp(secret, "abc123", t)).toBe(false);
  });
});

describe("route guard", () => {
  const admin = "/k-secret123";
  it("rewrites the secret path to /admin", () => {
    expect(classify("/k-secret123", admin)).toEqual({ kind: "admin", target: "/admin" });
    expect(classify("/k-secret123/notebooks/4", admin)).toEqual({ kind: "admin", target: "/admin/notebooks/4" });
    expect(classify("/k-secret1234", admin)).toEqual({ kind: "public" });
  });
  it("hides the real admin and treats /api separately", () => {
    expect(classify("/admin", admin).kind).toBe("hidden");
    expect(classify("/admin/login", admin).kind).toBe("hidden");
    expect(classify("/api/pages/1", admin).kind).toBe("api");
    expect(classify("/notebooks", admin).kind).toBe("public");
  });
  it("disables the admin when ADMIN_PATH is missing or weak", () => {
    expect(normalizeAdminPath(undefined)).toBe("");
    expect(normalizeAdminPath("/short")).toBe("");
    expect(normalizeAdminPath("/admin-foo-bar")).toBe("");
    expect(normalizeAdminPath("k-secret123/")).toBe("/k-secret123");
    expect(classify("/", "").kind).toBe("public");
  });
  it("requires same-origin for mutating requests", () => {
    expect(sameOrigin("GET", null, "https://a.com")).toBe(true);
    expect(sameOrigin("POST", "https://a.com", "https://a.com")).toBe(true);
    expect(sameOrigin("POST", "https://evil.com", "https://a.com")).toBe(false);
    expect(sameOrigin("DELETE", null, "https://a.com")).toBe(false);
  });
});

describe("sessions", () => {
  it("creates, finds and revokes sessions", async () => {
    const db = testDb();
    const { token } = await createSession(db, "test");
    expect(await getSession(db, token)).toEqual({ renewedUntil: null });
    expect(await getSession(db, token + "x")).toBeNull();
    await deleteAllSessions(db);
    expect(await getSession(db, token)).toBeNull();
  });
  it("locks an IP out after 5 failures", async () => {
    const db = testDb();
    for (let i = 0; i < 4; i++) await recordFailedLogin(db, "1.2.3.4");
    expect(await isLockedOut(db, "1.2.3.4")).toBe(false);
    await recordFailedLogin(db, "1.2.3.4");
    expect(await isLockedOut(db, "1.2.3.4")).toBe(true);
    expect(await isLockedOut(db, "5.6.7.8")).toBe(false);
  });
});
