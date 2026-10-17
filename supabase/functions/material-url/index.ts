import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const URL=Deno.env.get("SUPABASE_URL")!, SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, ALLOWED_ORIGIN=Deno.env.get("ALLOWED_ORIGIN")??"";
const cors=(o:string|null)=>({"Access-Control-Allow-Origin":o===ALLOWED_ORIGIN?o:ALLOWED_ORIGIN,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"});
const out=(b:unknown,s:number,o:string|null)=>new Response(JSON.stringify(b),{status:s,headers:{...cors(o),"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async req=>{
 const origin=req.headers.get("origin");
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors(origin)});
 if(req.method!=="POST")return out({error:"Method not allowed."},405,origin);
 if(!origin||origin!==ALLOWED_ORIGIN)return out({error:"Origin not allowed."},403,origin);
 let body:{materialId?:string};try{body=await req.json()}catch{return out({error:"Invalid request."},400,origin)}
 if(!body.materialId||!/^[0-9a-f-]{36}$/i.test(body.materialId))return out({error:"A valid resource ID is required."},400,origin);
 const db=createClient(URL,SERVICE,{auth:{persistSession:false}});
 const {data:m,error}=await db.from("study_materials").select("id,title,storage_path,is_published,resource_type").eq("id",body.materialId).maybeSingle();
 if(error||!m||!m.is_published)return out({error:"Resource is not available."},404,origin);
 if(m.resource_type==="link")return out({error:"This resource does not contain a stored file."},400,origin);
 if(!m.storage_path)return out({error:"File is not configured."},404,origin);
 const {data:signed,error:signError}=await db.storage.from("study-materials").createSignedUrl(m.storage_path,300,{download:false});
 if(signError||!signed?.signedUrl)return out({error:"Could not create a secure file link."},500,origin);
 return out({url:signed.signedUrl,title:m.title,expiresInSeconds:300},200,origin);
});
