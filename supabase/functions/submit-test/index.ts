import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "";
const cors = (o: string | null) => ({ "Access-Control-Allow-Origin": o === ALLOWED_ORIGIN ? o : ALLOWED_ORIGIN, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" });
const response = (body: unknown, status: number, o: string | null) => new Response(JSON.stringify(body), { status, headers: { ...cors(o), "Content-Type": "application/json", "Cache-Control": "no-store" } });
Deno.serve(async req => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return response({ error: "Method not allowed." }, 405, origin);
  if (!origin || origin !== ALLOWED_ORIGIN) return response({ error: "Origin not allowed." }, 403, origin);
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return response({ error: "Sign in required." }, 401, origin);
  let body: { attemptId?: string; answers?: Array<{ questionId: string; selectedOptionIndex: number | null }>; timedOut?: boolean };
  try { body = await req.json(); } catch { return response({ error: "Invalid request body." }, 400, origin); }
  if (!body.attemptId || !Array.isArray(body.answers) || body.answers.length > 500 || typeof body.timedOut !== "boolean") return response({ error: "Invalid submission payload." }, 400, origin);
  const seen = new Set<string>();
  for (const answer of body.answers) {
    if (!answer || typeof answer.questionId !== "string" || !(answer.selectedOptionIndex === null || Number.isInteger(answer.selectedOptionIndex))) return response({ error: "An answer is malformed." }, 400, origin);
    if (seen.has(answer.questionId)) return response({ error: "Duplicate question answer." }, 400, origin);
    seen.add(answer.questionId);
  }
  const auth = createClient(URL, ANON, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: ud, error: ue } = await auth.auth.getUser();
  if (ue || !ud.user) return response({ error: "Session expired. Sign in again." }, 401, origin);
  const db = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: attempt } = await db.from("test_attempts").select("id,user_id,status,started_at,test_id").eq("id", body.attemptId).maybeSingle();
  if (!attempt || attempt.user_id !== ud.user.id) return response({ error: "Attempt not found." }, 404, origin);
  if (attempt.status !== "in_progress") return response({ error: "This attempt has already been submitted." }, 409, origin);
  const { data: result, error } = await db.rpc("submit_test_attempt", {
    p_attempt_id: attempt.id, p_user_id: ud.user.id, p_answers: body.answers, p_timed_out: body.timedOut
  });
  if (error || !result?.success) {
    const message = error?.message || "Evaluation failed.";
    const status = /forbidden/i.test(message) ? 403 : /already_submitted|not_expired/i.test(message) ? 409 : 400;
    return response({ error: status === 409 ? "This attempt cannot be submitted again." : "We could not evaluate this submission. Please contact support if the issue continues." }, status, origin);
  }
  const { data: test } = await db.from("tests").select("result_policy,results_released").eq("id", attempt.test_id).single();
  const resultVisible = !!test?.results_released && test.result_policy === "personal_result";
  return response({ success: true, message: "Your submission has been saved securely.", resultVisible }, 200, origin);
});
