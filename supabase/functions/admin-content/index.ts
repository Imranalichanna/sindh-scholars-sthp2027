import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const URL=Deno.env.get("SUPABASE_URL")!,ANON=Deno.env.get("SUPABASE_ANON_KEY")!,SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,ALLOWED_ORIGIN=Deno.env.get("ALLOWED_ORIGIN")??"";
const cors=(o:string|null)=>({"Access-Control-Allow-Origin":o===ALLOWED_ORIGIN?o:ALLOWED_ORIGIN,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});
const out=(b:unknown,s:number,o:string|null)=>new Response(JSON.stringify(b),{status:s,headers:{...cors(o),"Content-Type":"application/json","Cache-Control":"no-store"}});
const isUuid=(v:unknown):v is string=>typeof v==="string"&&/^[0-9a-f-]{36}$/i.test(v);
Deno.serve(async req=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});
 if(req.method!=="POST")return out({error:"Method not allowed."},405,origin);
 if(!origin||origin!==ALLOWED_ORIGIN)return out({error:"Origin not allowed."},403,origin);
 const authorization=req.headers.get("Authorization");
 if(!authorization?.startsWith("Bearer "))return out({error:"Sign in required."},401,origin);
 let b:Record<string,any>;try{b=await req.json()}catch{return out({error:"Invalid request."},400,origin)}
 const auth=createClient(URL,ANON,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
 const {data:ud,error:ue}=await auth.auth.getUser();
 if(ue||!ud.user)return out({error:"Session expired."},401,origin);
 const db=createClient(URL,SERVICE,{auth:{persistSession:false}});
 const {data:profile}=await db.from("profiles").select("account_status").eq("id",ud.user.id).maybeSingle();
 if(!profile||profile.account_status!=="active")return out({error:"Your account is unavailable for staff access."},403,origin);
 let {data:role}=await db.from("user_roles").select("role").eq("user_id",ud.user.id).eq("role","super_admin").maybeSingle();
 if(!role){const {data:manager}=await db.from("user_roles").select("role").eq("user_id",ud.user.id).eq("role","content_manager").maybeSingle();role=manager;}
 if(!role)return out({error:"Staff permission required."},403,origin);
 const audit=async(action:string,entity:string,id:string|null,metadata={})=>{await db.from("admin_activity_logs").insert({actor_id:ud.user.id,action,entity_type:entity,entity_id:id,metadata})};
 try {
  if(b.action==="list") {
   const [categories,tests,materials,announcements]=await Promise.all([
    db.from("exam_categories").select("id,name,slug,description,sort_order,is_published").order("sort_order"),
    db.from("tests").select("id,title,slug,description,category_id,duration_seconds,total_marks,max_attempts,negative_marking,negative_penalty,starts_at,closes_at,status,result_policy,results_released").order("created_at",{ascending:false}),
    db.from("study_materials").select("id,title,description,category_id,subject,resource_type,storage_path,external_url,is_published,created_at").order("created_at",{ascending:false}),
    db.from("announcements").select("id,title,body,is_published,publish_at,expires_at").order("created_at",{ascending:false})
   ]);
   if(categories.error||tests.error||materials.error||announcements.error)return out({error:"Could not load admin content."},500,origin);
   return out({categories:categories.data,tests:tests.data,materials:materials.data,announcements:announcements.data,role:role.role},200,origin);
  }
  if(b.action==="saveCategory") {
   const name=String(b.name??"").trim(),slug=String(b.slug??"").trim(),description=String(b.description??"").trim();
   if(name.length<1||name.length>120||!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)||description.length>2000)return out({error:"Enter a valid category name, URL slug, and description."},400,origin);
   const row={name,slug,description,sort_order:Number.isInteger(b.sort_order)?b.sort_order:0,is_published:b.is_published===true};
   const result=b.id&&isUuid(b.id)?await db.from("exam_categories").update(row).eq("id",b.id).select("id").single():await db.from("exam_categories").insert(row).select("id").single();
   if(result.error)return out({error:"Could not save category. Check that its slug is unique."},400,origin);
   await audit("save_category","exam_category",result.data.id,{name});return out({success:true,id:result.data.id},200,origin);
  }
  if(b.action==="saveTest") {
   const title=String(b.title??"").trim(),slug=String(b.slug??"").trim(),duration=Number(b.duration_seconds),marks=Number(b.total_marks),attempts=Number(b.max_attempts);
   if(title.length<1||title.length>180||!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)||!Number.isInteger(duration)||duration<60||duration>86400||!Number.isFinite(marks)||marks<0||!Number.isInteger(attempts)||attempts<1||attempts>100)return out({error:"Review the test title, slug, duration, marks, and attempt limit."},400,origin);
   if(b.category_id&&!isUuid(b.category_id))return out({error:"Invalid category."},400,origin);
   const row={title,slug,description:String(b.description??"").slice(0,5000),instructions:String(b.instructions??"").slice(0,10000),syllabus:String(b.syllabus??"").slice(0,10000),eligibility:String(b.eligibility??"").slice(0,5000),category_id:b.category_id||null,duration_seconds:duration,total_marks:marks,max_attempts:attempts,negative_marking:b.negative_marking===true,negative_penalty:Math.max(0,Number(b.negative_penalty)||0),starts_at:b.starts_at||null,closes_at:b.closes_at||null,result_policy:["admin_only_until_release","personal_result","public_results_after_approval"].includes(b.result_policy)?b.result_policy:"admin_only_until_release",question_order_randomized:b.question_order_randomized!==false,option_order_randomized:b.option_order_randomized!==false,updated_at:new Date().toISOString()};
   if(b.id&&isUuid(b.id)){const {data:existing}=await db.from("tests").select("id,status").eq("id",b.id).maybeSingle();if(!existing)return out({error:"Test not found."},404,origin);if(existing.status!=="draft")return out({error:"Only draft tests can be edited. Create a new test to change a published assessment."},409,origin);}
   const result=b.id&&isUuid(b.id)?await db.from("tests").update(row).eq("id",b.id).select("id").single():await db.from("tests").insert({...row,status:"draft",created_by:ud.user.id}).select("id").single();
   if(result.error)return out({error:"Could not save test. Ensure its slug is unique and date range is valid."},400,origin);
   await audit("save_test","test",result.data.id,{title});return out({success:true,id:result.data.id},200,origin);
  }
  if(b.action==="saveQuestion") {
   if(!isUuid(b.test_id))return out({error:"Select a valid test first."},400,origin);
   const statement=String(b.statement??"").trim(),options=b.options;
   if(statement.length<1||statement.length>10000||!Array.isArray(options)||options.length<2||options.length>10||options.some((v:unknown)=>typeof v!=="string"||!v.trim()||v.length>1000)||!Number.isInteger(b.correct_option_index)||b.correct_option_index<0||b.correct_option_index>=options.length)return out({error:"Enter a question, 2–10 valid options, and select the correct option."},400,origin);
   const {data:test}=await db.from("tests").select("id,status").eq("id",b.test_id).maybeSingle();
   if(!test)return out({error:"Test not found."},404,origin);
   if(test.status!=="draft")return out({error:"Questions can only be changed while the test is a draft. Published assessments are locked to protect existing attempts."},409,origin);
   const row={test_id:b.test_id,statement,options,explanation:String(b.explanation??"").slice(0,5000)||null,subject:String(b.subject??"").slice(0,100)||null,topic:String(b.topic??"").slice(0,100)||null,difficulty:["easy","medium","hard"].includes(b.difficulty)?b.difficulty:"medium",marks:Math.max(0,Number(b.marks)||1),position:Number.isInteger(b.position)?b.position:0,is_active:b.is_active!==false,updated_at:new Date().toISOString()};
   const saved=b.id&&isUuid(b.id)?await db.from("questions").update(row).eq("id",b.id).select("id").single():await db.from("questions").insert(row).select("id").single();
   if(saved.error)return out({error:"Could not save question."},400,origin);
   const {error:keyError}=await db.from("question_answer_keys").upsert({question_id:saved.data.id,correct_option_index:b.correct_option_index,updated_at:new Date().toISOString()},{onConflict:"question_id"});
   if(keyError)return out({error:"Question saved, but its answer key could not be saved. Do not publish until corrected."},500,origin);
   await audit("save_question","question",saved.data.id,{test_id:b.test_id});return out({success:true,id:saved.data.id},200,origin);
  }
  if(b.action==="publishTest") {
   if(!isUuid(b.test_id))return out({error:"Select a valid test."},400,origin);
   const {data:test}=await db.from("tests").select("id,status").eq("id",b.test_id).maybeSingle();
   if(!test)return out({error:"Test not found."},404,origin);
   if(test.status!=="draft")return out({error:"Only draft tests can be published. Close or archive the existing assessment instead."},409,origin);
   const {data:qs,error:qError}=await db.from("questions").select("id,options,marks").eq("test_id",b.test_id).eq("is_active",true);
   if(qError||!qs?.length)return out({error:"Add active questions before publishing."},400,origin);
   const {data:keys,error:kError}=await db.from("question_answer_keys").select("question_id").in("question_id",qs.map(q=>q.id));
   if(kError||!keys||keys.length!==qs.length)return out({error:"Every active question must have one correct answer configured."},400,origin);
   const total=qs.reduce((sum,q)=>sum+Number(q.marks||0),0);
   const {error}=await db.from("tests").update({status:"published",total_marks:total,updated_at:new Date().toISOString()}).eq("id",b.test_id);
   if(error)return out({error:"Could not publish test."},500,origin);
   await audit("publish_test","test",b.test_id,{question_count:qs.length,total_marks:total});return out({success:true,questionCount:qs.length,totalMarks:total},200,origin);
  }
  if(b.action==="setTestStatus") {
   if(!isUuid(b.test_id)||!["draft","closed","archived","published"].includes(b.status))return out({error:"Invalid test status."},400,origin);
   if(b.status==="published")return out({error:"Use publishTest to validate the question bank before publishing."},400,origin);
   const {error}=await db.from("tests").update({status:b.status,updated_at:new Date().toISOString()}).eq("id",b.test_id);
   if(error)return out({error:"Could not update test status."},400,origin);
   await audit("set_test_status","test",b.test_id,{status:b.status});return out({success:true},200,origin);
  }
  if(b.action==="saveAnnouncement") {
   const title=String(b.title??"").trim(),bodyText=String(b.body??"").trim();
   if(title.length<1||title.length>180||bodyText.length<1||bodyText.length>10000)return out({error:"Enter an announcement title and message."},400,origin);
   const row={title,body:bodyText,is_published:b.is_published===true,publish_at:b.publish_at||null,expires_at:b.expires_at||null,created_by:ud.user.id,updated_at:new Date().toISOString()};
   const result=b.id&&isUuid(b.id)?await db.from("announcements").update(row).eq("id",b.id).select("id").single():await db.from("announcements").insert(row).select("id").single();
   if(result.error)return out({error:"Could not save announcement. Check its publication dates."},400,origin);
   await audit("save_announcement","announcement",result.data.id,{title});return out({success:true,id:result.data.id},200,origin);
  }
  if(b.action==="approvePublicResult") {
   if(role.role!=="super_admin")return out({error:"Only a Super Admin can approve public result entries."},403,origin);
   if(!isUuid(b.attempt_id))return out({error:"A valid attempt ID is required."},400,origin);
   const {data:attempt}=await db.from("test_attempts").select("id,test_id,user_id,status,score,percentage,result_status,tests(result_policy)").eq("id",b.attempt_id).maybeSingle();
   if(!attempt||!["submitted","expired"].includes(attempt.status)||attempt.score===null||attempt.percentage===null)return out({error:"This attempt has no finalized result to publish."},404,origin);
   const test=Array.isArray(attempt.tests)?attempt.tests[0]:attempt.tests;
   if(test?.result_policy!=="public_results_after_approval")return out({error:"This test is not configured for public results after approval."},400,origin);
   const {data:profile}=await db.from("profiles").select("display_name").eq("id",attempt.user_id).maybeSingle();
   const displayName=String(profile?.display_name??"Student").trim().slice(0,120)||"Student";
   const {error:publishError}=await db.from("public_result_entries").upsert({test_id:attempt.test_id,attempt_id:attempt.id,display_name:displayName,score:attempt.score,percentage:attempt.percentage,is_published:true,published_at:new Date().toISOString(),approved_by:ud.user.id},{onConflict:"attempt_id"});
   if(publishError)return out({error:"Could not approve this public result."},500,origin);
   await db.from("test_attempts").update({result_status:"approved"}).eq("id",attempt.id);
   await audit("approve_public_result","test_attempt",attempt.id,{test_id:attempt.test_id});
   return out({success:true},200,origin);
  }
  if(b.action==="setResultRelease") {
   if(role.role!=="super_admin")return out({error:"Only a Super Admin can release or unpublish results."},403,origin);
   if(!isUuid(b.test_id)||typeof b.released!=="boolean")return out({error:"Invalid result release request."},400,origin);
   const {error}=await db.from("tests").update({results_released:b.released,updated_at:new Date().toISOString()}).eq("id",b.test_id);
   if(error)return out({error:"Could not update result publication."},400,origin);
   await audit(b.released?"release_results":"unpublish_results","test",b.test_id,{});return out({success:true},200,origin);
  }
  return out({error:"Unknown admin action."},400,origin);
 } catch { return out({error:"The operation failed unexpectedly. No success was confirmed."},500,origin); }
});
