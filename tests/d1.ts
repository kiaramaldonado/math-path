// Minimal D1Database stand-in backed by node:sqlite, with the real migrations applied.
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

class Stmt {
  constructor(private db: DatabaseSync, private sql: string, private args: unknown[] = []) {}
  bind(...args: unknown[]) {
    return new Stmt(this.db, this.sql, args);
  }
  private prep() {
    return this.db.prepare(this.sql);
  }
  async all<T>() {
    return { results: this.prep().all(...(this.args as never[])) as T[], success: true };
  }
  async first<T>() {
    return (this.prep().get(...(this.args as never[])) ?? null) as T | null;
  }
  async run() {
    const r = this.prep().run(...(this.args as never[]));
    return { success: true, meta: { changes: r.changes } };
  }
}

export function testDb(): D1Database {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const f of readdirSync("migrations").sort()) db.exec(readFileSync(`migrations/${f}`, "utf8"));
  return {
    prepare: (sql: string) => new Stmt(db, sql),
    batch: async (stmts: Stmt[]) => Promise.all(stmts.map((s) => (/^\s*select/i.test((s as any).sql) ? s.all() : s.run()))),
    exec: async (sql: string) => db.exec(sql),
  } as unknown as D1Database;
}
