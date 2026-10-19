import { toBase64, toHex } from "./encoding";

export const SESSION_COOKIE = "mp_session";
const SESSION_DAYS = 30;
const DAY = 86_400_000;

const ATTEMPT_WINDOW = 15 * 60_000;
const MAX_ATTEMPTS_PER_IP = 5;
const MAX_ATTEMPTS_TOTAL = 30;

async function sha256(text: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));
}

function newToken(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]!);
}

export async function createSession(db: D1Database, userAgent: string): Promise<{ token: string; expires: Date }> {
  const token = newToken();
  const now = Date.now();
  const expires = now + SESSION_DAYS * DAY;
  await db
    .prepare("INSERT INTO sessions (token_hash, expires_at, created_at, user_agent) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), expires, now, userAgent.slice(0, 200))
    .run();
  return { token, expires: new Date(expires) };
}

/**
 * Returns null when the token is unknown or expired. Sessions slide: once a day
 * the expiry is pushed forward and `renewedUntil` tells the caller to reset the cookie.
 */
export async function getSession(db: D1Database, token: string): Promise<{ renewedUntil: Date | null } | null> {
  const hash = await sha256(token);
  const row = await db.prepare("SELECT expires_at FROM sessions WHERE token_hash = ?").bind(hash).first<{ expires_at: number }>();
  const now = Date.now();
  if (!row) return null;
  if (row.expires_at < now) {
    await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(hash).run();
    return null;
  }
  if (row.expires_at - now < (SESSION_DAYS - 1) * DAY) {
    const expires = now + SESSION_DAYS * DAY;
    await db.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?").bind(expires, hash).run();
    return { renewedUntil: new Date(expires) };
  }
  return { renewedUntil: null };
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

export async function deleteAllSessions(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM sessions").run();
}

export async function countSessions(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?").bind(Date.now()).first<{ n: number }>();
  return row?.n ?? 0;
}

export async function isLockedOut(db: D1Database, ip: string): Promise<boolean> {
  const since = Date.now() - ATTEMPT_WINDOW;
  await db.prepare("DELETE FROM login_attempts WHERE at < ?").bind(since).run();
  const row = await db
    .prepare("SELECT SUM(ip = ?) AS mine, COUNT(*) AS total FROM login_attempts WHERE at >= ?")
    .bind(ip, since)
    .first<{ mine: number | null; total: number }>();
  return (row?.mine ?? 0) >= MAX_ATTEMPTS_PER_IP || (row?.total ?? 0) >= MAX_ATTEMPTS_TOTAL;
}

export async function recordFailedLogin(db: D1Database, ip: string): Promise<void> {
  await db.prepare("INSERT INTO login_attempts (ip, at) VALUES (?, ?)").bind(ip, Date.now()).run();
}

export async function clearFailedLogins(db: D1Database, ip: string): Promise<void> {
  await db.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip).run();
}
