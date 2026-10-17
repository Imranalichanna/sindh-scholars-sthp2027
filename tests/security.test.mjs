import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), "utf8");

test("answer-key JSON is not committed in the working tree", () => {
  assert.equal(existsSync(join(root, "question-bank.json")), false);
  assert.equal(existsSync(join(root, "public", "question-bank.json")), false);
  assert.equal(existsSync(join(root, "public", "questions.json")), false);
});

test("public frontend does not contain service-role credential names or secret-like assignments", () => {
  const files = ["public/config.js", "public/app.js", "public/admin.js"];
  for (const file of files) {
    const text = read(file);
    assert.equal(/SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'][^"']{12,}/i.test(text), false, file);
    assert.equal(/sb_secret_[A-Za-z0-9_-]{20,}/.test(text), false, file);
  }
});

test("database migrations enable RLS and keep answer keys out of browser grants", () => {
  const migrationsDir = join(root, "supabase", "migrations");
  const migrations = readdirSync(migrationsDir).filter(n => n.endsWith(".sql")).sort();
  assert.ok(migrations.length >= 3, "expected schema, hardening, and scoring migrations");
  const sql = migrations.map(n => readFileSync(join(migrationsDir, n), "utf8")).join("\n");
  for (const table of ["profiles", "user_roles", "tests", "questions", "question_answer_keys", "test_attempts", "submitted_answers", "study_materials", "announcements", "public_result_entries"]) {
    assert.match(sql, new RegExp("alter table public\\." + table + " enable row level security", "i"), table + " must enable RLS");
  }
  assert.match(sql, /revoke all on public\.question_answer_keys from anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.submit_test_attempt[\s\S]*?to service_role/i);
});

test("all edge functions use server-side origin and authorization checks", () => {
  const dir = join(root, "supabase", "functions");
  const names = readdirSync(dir);
  for (const name of ["start-test", "save-progress", "submit-test", "my-results", "admin-results", "admin-content", "material-url"]) {
    assert.ok(names.includes(name), "missing function " + name);
    const source = readFileSync(join(dir, name, "index.ts"), "utf8");
    assert.match(source, /ALLOWED_ORIGIN/, name + " must check configured origin");
    if (name !== "material-url") assert.match(source, /Authorization/, name + " must require a user session");
  }
});
