import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const URL = Deno.env.get("SUPABASE_URL")!, ANON = Deno.env.get("SUPABASE_ANON_KEY")!, SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "";
const cors = (o: string | null) => ({ "Access-Control-Allow-Origin": o === ALLOWED_ORIGIN ? o : ALLOWED_ORIGIN, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "GET, OPTIONS", "Vary": "Origin" });
const out = (b: unknown, s: number, o: string | null) => new Response(JSON.stringify(b), { status:s, headers:{...cors(o),"Content-Type":"application/json","Cache-Control":"no-store"} });
Deno.serve(async req => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok",{headers:cors(origin)});
  if (req.method !== "GET") return out({error:"Method not allowed."},405,origin);
  if (!origin || origin !== ALLOWED_ORIGIN) return out({error:"Origin not allowed."},403,origin);
  const authorization=req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return out({error:"Sign in required."},401,origin);
  const auth=createClient(URL,ANON,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data:ud,error:ue}=await auth.auth.getUser();
  if(ue||!ud.user)return out({error:"Session expired."},401,origin);
  const db=createClient(URL,SERVICE,{auth:{persistSession:false}});
  const {data:rows,error}=await db.from("test_attempts").select("id,test_id,attempt_number,status,started_at,submitted_at,duration_seconds,score,percentage,correct_count,incorrect_count,unanswered_count,result_status,tests(id,title,result_policy,results_released)").eq("user_id",ud.user.id).order("created_at",{ascending:false}).limit(100);
  if(error)return out({error:"Could not load your test history."},500,origin);
  const results=(rows??[]).map(a=>{
    const t=Array.isArray(a.tests)?a.tests[0]:a.tests;
    const visible=!!t?.results_released && (t?.result_policy==="personal_result" || t?.result_policy==="public_results_after_approval");
    return {attemptId:a.id,testId:a.test_id,testTitle:t?.title??"Practice test",attemptNumber:a.attempt_number,status:a.status,startedAt:a.started_at,submittedAt:a.submitted_at,durationSeconds:a.duration_seconds,resultVisible:visible,result:visible?{score:a.score,percentage:a.percentage,correctCount:a.correct_count,incorrectCount:a.incorrect_count,unansweredCount:a.unanswered_count}:null};
  });
  return out({results},200,origin);
});
