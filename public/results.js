(() => {
"use strict";
const cfg=window.SSA_CONFIG||{},ready=cfg.supabaseUrl&&!cfg.supabaseUrl.includes("YOUR_PROJECT_REF")&&cfg.supabaseAnonKey&&!cfg.supabaseAnonKey.includes("YOUR_SUPABASE")&&window.supabase;
const db=ready?window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:false,autoRefreshToken:false}}):null;
const $=s=>document.querySelector(s);let rows=[];
function render(){
 const term=$("#result-search").value.trim().toLowerCase(),testId=$("#result-test").value;
 const shown=rows.filter(r=>(!testId||r.test_id===testId)&&(!term||r.display_name.toLowerCase().includes(term)));
 const root=$("#public-results");root.replaceChildren();
 if(!shown.length){const empty=document.createElement("div");empty.className="empty-card";empty.textContent="No publicly approved results are available for this selection.";root.append(empty);$("#results-note").textContent="Only authorized, released public result entries appear here.";return}
 shown.forEach((r,i)=>{
  const card=document.createElement("article");card.className="test-card";
  const rank=document.createElement("span");rank.className="pill";rank.textContent=testId?"Rank "+(rows.filter(x=>x.test_id===r.test_id).findIndex(x=>x.id===r.id)+1):"Approved result";
  const name=document.createElement("h3");name.textContent=r.display_name;
  const test=document.createElement("p");const nested=Array.isArray(r.tests)?r.tests[0]:r.tests;test.textContent=nested?.title||"Practice test";
  const score=document.createElement("div");score.className="test-meta";score.textContent=Number(r.score).toFixed(2)+" marks · "+Number(r.percentage).toFixed(2)+"%";
  const date=document.createElement("p");date.className="muted";date.textContent=r.published_at?"Published "+new Date(r.published_at).toLocaleDateString():"Approved result";
  card.append(rank,name,test,score,date);root.append(card);
 });
 $("#results-note").textContent=shown.length+" approved public result entr"+(shown.length===1?"y":"ies")+".";
}
async function init(){
 if(!db){$("#public-results").innerHTML='<div class="empty-card">Connect Supabase in public/config.js to load published results.</div>';$("#results-note").textContent="The public result list is not connected yet.";return}
 const {data,error}=await db.from("public_result_entries").select("id,test_id,display_name,score,percentage,published_at,tests(title)").eq("is_published",true).order("score",{ascending:false}).limit(1000);
 if(error){$("#public-results").innerHTML='<div class="empty-card">Published results could not be loaded. Please try again later.</div>';$("#results-note").textContent="Check the public results migration and Row Level Security policies.";return}
 rows=data||[];
 const tests=new Map();rows.forEach(r=>{const t=Array.isArray(r.tests)?r.tests[0]:r.tests;if(t?.title)tests.set(r.test_id,t.title)});
 const select=$("#result-test");tests.forEach((title,id)=>select.add(new Option(title,id)));
 render();
}
$("#result-test").addEventListener("change",render);$("#result-search").addEventListener("input",render);init();
})();