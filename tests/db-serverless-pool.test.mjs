import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

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
        return captured;
      } }), loaded, loaded.exports);
      loaded.exports.getSql();
      assert.equal(new URL(captured.url).port, expectedPort);
      assert.equal(captured.options.prepare, false);
      assert.equal(captured.options.max_pipeline, 1);
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
