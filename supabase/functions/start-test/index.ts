import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "";

function cors(origin: string | null) {
  const allowed = origin && origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return { "Access-Control-Allow-Origin": allowed, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };
}
function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
function shuffled<T>(items: T[]) { const a = [...items]; for (let i = a.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405, origin);
  if (!origin || origin !== ALLOWED_ORIGIN) return json({ error: "Origin not allowed." }, 403, origin);
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Please sign in to start a test." }, 401, origin);
  let body: { testId?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid request body." }, 400, origin); }
  if (!body.testId || !/^[0-9a-f-]{36}$/i.test(body.testId)) return json({ error: "A valid test ID is required." }, 400, origin);

  const authClient = createClient(URL, ANON, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Your session is invalid. Please sign in again." }, 401, origin);
  const db = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: profile } = await db.from("profiles").select("account_status").eq("id", userData.user.id).maybeSingle();
  if (!profile || profile.account_status !== "active") return json({ error: "Your account is unavailable for testing." }, 403, origin);
  const { data: test, error: testError } = await db.from("tests").select("id,title,description,duration_seconds,total_marks,max_attempts,starts_at,closes_at,status,question_order_randomized,option_order_randomized").eq("id", body.testId).maybeSingle();
  if (testError || !test) return json({ error: "This test is not available." }, 404, origin);
  const now = Date.now();
  const { data: active } = await db.from("test_attempts").select("id,attempt_number,started_at").eq("test_id", test.id).eq("user_id", userData.user.id).eq("status", "in_progress").order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (test.status !== "published" && !active) return json({ error: "This test is not available." }, 404, origin);
  if (!active && test.starts_at && now < Date.parse(test.starts_at)) return json({ error: "This test has not opened yet." }, 403, origin);
  if (!active && test.closes_at && now >= Date.parse(test.closes_at)) return json({ error: "The test closing time has passed." }, 403, origin);
  let attemptId = active?.id as string | undefined;
  let startedAt = active?.started_at as string | undefined;
  if (!active) {
    const { count, error: countError } = await db.from("test_attempts").select("id", { count: "exact", head: true }).eq("test_id", test.id).eq("user_id", userData.user.id).in("status", ["submitted", "expired", "in_progress"]);
    if (countError) return json({ error: "Could not verify attempt eligibility." }, 500, origin);
    if ((count ?? 0) >= test.max_attempts) return json({ error: "You have used all allowed attempts for this test." }, 403, origin);
    const { data: created, error: createError } = await db.from("test_attempts").insert({ test_id: test.id, user_id: userData.user.id, attempt_number: (count ?? 0) + 1, status: "in_progress" }).select("id,started_at").single();
    if (createError || !created) return json({ error: "Could not start the test. Please retry." }, 409, origin);
    attemptId = created.id; startedAt = created.started_at;
  }

  const { data: rows, error: questionsError } = await db.from("questions").select("id,statement,options,marks,position,subject,topic").eq("test_id", test.id).eq("is_active", true).order("position", { ascending: true });
  if (questionsError || !rows?.length) return json({ error: "This test has no available questions." }, 500, origin);
  const { data: drafts } = await db.from("submitted_answers").select("question_id,selected_option_index").eq("attempt_id", attemptId!);
  const savedAnswers: Record<string, number> = {};
  for (const draft of drafts ?? []) if (draft.selected_option_index !== null) savedAnswers[draft.question_id] = draft.selected_option_index;
  let questions = rows.map(q => {
    const original = Array.isArray(q.options) ? q.options : [];
    const indices = original.map((_v: unknown, i: number) => i);
    const order = test.option_order_randomized ? shuffled(indices) : indices;
    return { id: q.id, statement: q.statement, options: order.map(i => original[i]), optionMap: order, marks: q.marks, subject: q.subject, topic: q.topic, position: q.position };
  });
  if (test.question_order_randomized) questions = shuffled(questions);
  const elapsed = Math.max(0, Math.floor((now - Date.parse(startedAt!)) / 1000));
  return json({ attemptId, test: { id: test.id, title: test.title, description: test.description, duration_seconds: test.duration_seconds, total_marks: test.total_marks }, questions, savedAnswers, remainingSeconds: Math.max(0, test.duration_seconds - elapsed) }, 200, origin);
});
