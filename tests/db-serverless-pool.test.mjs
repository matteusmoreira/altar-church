import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import postgres from "postgres";

test("serverless uses transaction pooling without changing local or direct connections", () => {
  const originalUrl = process.env.POSTGRES_URL;
  const originalVercel = process.env.VERCEL;
  const originalSql = globalThis.ecclesiaHubSql;
  const source = ts.transpileModule(readFileSync("src/lib/db/client.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  try {
    for (const [serverless, host, port, expectedPort] of [
      [true, "aws-0-test.pooler.supabase.com", "5432", "6543"],
      [false, "aws-0-test.pooler.supabase.com", "5432", "5432"],
      [true, "aws-0-test.pooler.supabase.com", "6543", "6543"],
      [true, "db.test.supabase.co", "5432", "5432"],
      [true, "localhost", "5432", "5432"],
    ]) {
      process.env.POSTGRES_URL = `postgresql://test:fake-password@${host}:${port}/postgres`;
      if (serverless) process.env.VERCEL = "1";
      else delete process.env.VERCEL;
      delete globalThis.ecclesiaHubSql;
      let captured;
      const loaded = { exports: {} };
      new Function("require", "module", "exports", source)(() => ({ default: (url, options) => {
        captured = { url, options };
        return { ...captured, begin() {}, async end() {} };
      } }), loaded, loaded.exports);
      loaded.exports.getSql();
      assert.equal(new URL(captured.url).port, expectedPort);
      assert.equal(captured.options.prepare, false);
      assert.equal(captured.options.max_pipeline, 0);
      assert.equal(new URL(process.env.POSTGRES_URL).port, port);
    }
  } finally {
    if (originalUrl === undefined) delete process.env.POSTGRES_URL;
    else process.env.POSTGRES_URL = originalUrl;
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
    globalThis.ecclesiaHubSql = originalSql;
  }
});

test("application pool reserves transactions for commit, rollback and concurrent queries", {
  skip: !process.env.POSTGRES_URL && "POSTGRES_URL não configurado",
  timeout: 30_000,
}, async () => {
  const originalSql = globalThis.ecclesiaHubSql;
  const source = ts.transpileModule(readFileSync("src/lib/db/client.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  let sql;
  try {
    delete globalThis.ecclesiaHubSql;
    new Function("require", "module", "exports", source)(() => ({ default: (url, options) =>
      postgres(url, { ...options, max: 2 })
    }), loaded, loaded.exports);
    sql = loaded.exports.getSql();
    // Warm connections previously pipelined autocommit queries and stalled on Supavisor.
    await sql`select 1`;
    const parallel = await Promise.all(Array.from({ length: 8 }, (_, value) => sql`select ${value}::int as value`));
    assert.deepEqual(parallel.map(rows => rows[0].value), [0, 1, 2, 3, 4, 5, 6, 7]);
    const transactions = await Promise.all([1, 2].map((value) => sql.begin(async (tx) => {
      await tx`set transaction read only`;
      const [first] = await tx`select pg_backend_pid() as pid, ${value}::int as value`;
      const [second] = await tx`select pg_backend_pid() as pid`;
      assert.equal(first.pid, second.pid, "transaction must retain its connection");
      return first.value;
    })));
    assert.deepEqual(transactions, [1, 2]);
    const alongside = await Promise.all([
      sql.begin(async tx => {
        await tx`set transaction read only`;
        const rows = await Promise.all([tx`select 1::int as value`, tx`select 2::int as value`]);
        return rows.map(r => r[0].value);
      }),
      sql`select 3::int as value`,
    ]);
    assert.deepEqual(alongside[0], [1, 2]);
    assert.equal(alongside[1][0].value, 3);
    const rollback = new Error("intentional rollback");
    await assert.rejects(sql.begin(async (tx) => {
      await tx`set transaction read only`;
      await tx`select 1`;
      throw rollback;
    }), (error) => error === rollback);
    const [row] = await sql`select 1::int as value`;
    assert.equal(row.value, 1, "pool remains usable after rollback");
  } finally {
    if (sql) await sql.end({ timeout: 5 });
    globalThis.ecclesiaHubSql = originalSql;
  }
});
