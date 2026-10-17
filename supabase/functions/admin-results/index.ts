import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const URL=Deno.env.get("SUPABASE_URL")!,ANON=Deno.env.get("SUPABASE_ANON_KEY")!,SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,ALLOWED_ORIGIN=Deno.env.get("ALLOWED_ORIGIN")??"";
const cors=(o:string|null)=>({"Access-Control-Allow-Origin":o===ALLOWED_ORIGIN?o:ALLOWED_ORIGIN,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});
const out=(b:unknown,s:number,o:string|null)=>new Response(JSON.stringify(b),{status:s,headers:{...cors(o),"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async req=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});
 if(req.method!=="POST")return out({error:"Method not allowed."},405,origin);
 if(!origin||origin!==ALLOWED_ORIGIN)return out({error:"Origin not allowed."},403,origin);
 const authorization=req.headers.get("Authorization");
 if(!authorization?.startsWith("Bearer "))return out({error:"Sign in required."},401,origin);
 let body:{testId?:string;limit?:number};try{body=await req.json()}catch{return out({error:"Invalid request."},400,origin)}
 const auth=createClient(URL,ANON,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
 const {data:ud,error:ue}=await auth.auth.getUser();
 if(ue||!ud.user)return out({error:"Session expired."},401,origin);
 const db=createClient(URL,SERVICE,{auth:{persistSession:false}});
 const {data:role}=await db.from("user_roles").select("role").eq("user_id",ud.user.id).eq("role","super_admin").maybeSingle();
 if(!role)return out({error:"Super Admin permission required."},403,origin);
 const limit=Math.min(1000,Math.max(1,Number.isInteger(body.limit)?body.limit!:200));
 let query=db.from("test_attempts").select("id,test_id,user_id,attempt_number,status,started_at,submitted_at,duration_seconds,score,percentage,correct_count,incorrect_count,unanswered_count,result_status,tests(title,result_policy,results_released)").order("created_at",{ascending:false}).limit(limit);
 if(body.testId){if(!/^[0-9a-f-]{36}$/i.test(body.testId))return out({error:"Invalid test ID."},400,origin);query=query.eq("test_id",body.testId)}
 const {data:rows,error}=await query;
 if(error)return out({error:"Could not load results."},500,origin);
 const ids=[...new Set((rows??[]).map(a=>a.user_id))]; const {data:profiles}=ids.length?await db.from("profiles").select("id,student_id,display_name,district").in("id",ids):{data:[]}; const byUser=new Map((profiles??[]).map(p=>[p.id,p])); const results=(rows??[]).map(a=>{const p=byUser.get(a.user_id);return {attemptId:a.id,testId:a.test_id,studentId:p?.student_id??null,studentName:p?.display_name??"Student",district:p?.district??null,testTitle:(Array.isArray(a.tests)?a.tests[0]:a.tests)?.title??"Test",attemptNumber:a.attempt_number,status:a.status,startedAt:a.started_at,submittedAt:a.submitted_at,durationSeconds:a.duration_seconds,score:a.score,percentage:a.percentage,correctCount:a.correct_count,incorrectCount:a.incorrect_count,unansweredCount:a.unanswered_count,resultStatus:a.result_status};});
 return out({results},200,origin);
});
