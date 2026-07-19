import { SCHEMA_STATEMENTS } from "./schema-statements.js";

export type SqlValue = string | number | null;
export type SqlStatement = { sql: string; params?: SqlValue[] };

export type RuntimeDatabase = {
  kind: "d1" | "sqlite";
  first<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  run(sql: string, params?: SqlValue[]): Promise<void>;
  batch(statements: SqlStatement[]): Promise<void>;
  close?(): Promise<void>;
};

type D1PreparedStatementLike = {
  bind(...params: SqlValue[]): D1PreparedStatementLike;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
};

type D1DatabaseLike = {
  prepare(sql: string): D1PreparedStatementLike;
  batch(statements: D1PreparedStatementLike[]): Promise<unknown>;
};

let databasePromise: Promise<RuntimeDatabase | null> | null = null;
let schemaPromise: Promise<void> | null = null;

async function d1Database(): Promise<RuntimeDatabase | null> {
  try {
    const cloudflareSpecifier = "cloudflare:workers";
    const { env } = await import(/* @vite-ignore */ cloudflareSpecifier) as unknown as {
      env: { DB?: D1DatabaseLike };
    };
    if (!env.DB) return null;
    const database = env.DB;
    return {
      kind: "d1",
      async first<T>(sql: string, params: SqlValue[] = []) {
        return database.prepare(sql).bind(...params).first<T>();
      },
      async all<T>(sql: string, params: SqlValue[] = []) {
        const result = await database.prepare(sql).bind(...params).all<T>();
        return result.results || [];
      },
      async run(sql: string, params: SqlValue[] = []) {
        await database.prepare(sql).bind(...params).run();
      },
      async batch(statements: SqlStatement[]) {
        if (!statements.length) return;
        await database.batch(statements.map((statement) => database.prepare(statement.sql).bind(...(statement.params || []))));
      },
    };
  } catch {
    return null;
  }
}

async function sqliteDatabase(filePath: string): Promise<RuntimeDatabase> {
  const [{ mkdir }, { dirname }] = await Promise.all([import("node:fs/promises"), import("node:path")]);
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  const sqliteSpecifier = "node:sqlite";
  const sqliteModule = await import(/* @vite-ignore */ sqliteSpecifier) as unknown as {
    DatabaseSync: new (path: string) => {
      close(): void;
      exec(sql: string): void;
      prepare(sql: string): {
        get(...params: SqlValue[]): unknown;
        all(...params: SqlValue[]): unknown[];
        run(...params: SqlValue[]): unknown;
      };
    };
  };
  const database = new sqliteModule.DatabaseSync(filePath);
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA synchronous = NORMAL");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA busy_timeout = 5000");
  return {
    kind: "sqlite",
    async first<T>(sql: string, params: SqlValue[] = []) {
      return (database.prepare(sql).get(...params) as T | undefined) || null;
    },
    async all<T>(sql: string, params: SqlValue[] = []) {
      return database.prepare(sql).all(...params) as T[];
    },
    async run(sql: string, params: SqlValue[] = []) {
      database.prepare(sql).run(...params);
    },
    async batch(statements: SqlStatement[]) {
      if (!statements.length) return;
      database.exec("BEGIN IMMEDIATE");
      try {
        for (const statement of statements) database.prepare(statement.sql).run(...(statement.params || []));
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    async close() {
      database.close();
    },
  };
}

export async function getRuntimeDatabase() {
  if (!databasePromise) {
    databasePromise = (async () => {
      const d1 = await d1Database();
      if (d1) return d1;
      const filePath = process.env.APP_DATABASE_FILE?.trim();
      return filePath ? sqliteDatabase(filePath) : null;
    })();
  }
  return databasePromise;
}

export async function ensureAppSchema(database: RuntimeDatabase) {
  if (!schemaPromise) schemaPromise = database.batch(SCHEMA_STATEMENTS.map((sql) => ({ sql })));
  await schemaPromise;
}

export async function readyRuntimeDatabase() {
  const database = await getRuntimeDatabase();
  if (database) await ensureAppSchema(database);
  return database;
}
