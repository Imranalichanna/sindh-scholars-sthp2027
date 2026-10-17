(() => {
  "use strict";
  const cfg = window.SSA_CONFIG || {};
  const configured = cfg.supabaseUrl && !cfg.supabaseUrl.includes("YOUR_PROJECT_REF") &&
    cfg.supabaseAnonKey && !cfg.supabaseAnonKey.includes("YOUR_SUPABASE");
  const client = configured && window.supabase ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;
  const $ = (selector) => document.querySelector(selector);
  const state = { mode: "login", categories: [], tests: [], materials: [], announcements: [], user: null, activeAttempt: null, timerId: null, remaining: 0, answers: {} };
  $("#year").textContent = new Date().getFullYear();
  if (cfg.whatsappCommunityUrl && /^https:\/\//i.test(cfg.whatsappCommunityUrl)) $("#community-link").href = cfg.whatsappCommunityUrl;
  else $("#community-link").addEventListener("click", (e) => { e.preventDefault(); toast("The academy community link has not been configured yet."); });

  function toast(message) {
    const el = $("#toast"); el.textContent = message; el.classList.remove("hidden");
    window.setTimeout(() => el.classList.add("hidden"), 3800);
  }
  function safeText(value, fallback = "") { return typeof value === "string" && value.trim() ? value : fallback; }
  function formatDate(value) {
    if (!value) return "Date to be announced";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "Date to be announced" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  }
  function renderCategories() {
    const grid = $("#category-grid");
    if (!state.categories.length) return;
    grid.replaceChildren();
    state.categories.forEach((category, i) => {
      const card = document.createElement("article"); card.className = "content-card";
      const symbol = document.createElement("span"); symbol.className = "card-symbol"; symbol.textContent = String(i + 1).padStart(2, "0");
      const title = document.createElement("h3"); title.textContent = category.name;
      const desc = document.createElement("p"); desc.textContent = safeText(category.description, "Explore resources and practice tests for this programme.");
      card.append(symbol, title, desc); grid.append(card);
    });
    const filter = $("#test-filter"); const selected = filter.value;
    filter.replaceChildren(new Option("All programmes", ""));
    state.categories.forEach(c => filter.add(new Option(c.name, c.id)));
    filter.value = selected;
  }
  function renderTests() {
    const grid = $("#test-grid"); const term = $("#test-search").value.trim().toLowerCase(); const category = $("#test-filter").value;
    const list = state.tests.filter(t => (!category || t.category_id === category) && (!term || (t.title + " " + (t.description || "")).toLowerCase().includes(term)));
    grid.replaceChildren();
    if (!list.length) { const empty = document.createElement("div"); empty.className = "empty-card"; empty.textContent = configured ? "No published tests match your search right now." : "Connect Supabase in public/config.js to load real published tests."; grid.append(empty); return; }
    list.forEach(test => {
      const card = document.createElement("article"); card.className = "test-card";
      const cat = state.categories.find(c => c.id === test.category_id);
      const badge = document.createElement("span"); badge.className = "pill"; badge.textContent = cat ? cat.name : "Practice test";
      const h = document.createElement("h3"); h.textContent = test.title;
      const p = document.createElement("p"); p.textContent = safeText(test.description, "Build confidence with focused practice.");
      const meta = document.createElement("div"); meta.className = "test-meta";
      [Math.round((test.duration_seconds || 0) / 60) + " min", Number(test.total_marks || 0) + " marks", test.max_attempts + " attempt(s)"].forEach(x => { const s = document.createElement("span"); s.textContent = x; meta.append(s); });
      const btn = document.createElement("button"); btn.className = "btn"; btn.textContent = state.user ? "Start test →" : "Log in to start →";
      btn.addEventListener("click", () => state.user ? startTest(test) : openAuth("login"));
      card.append(badge, h, p, meta, btn); grid.append(card);
    });
  }
  function renderMaterials() {
    const grid = $("#material-grid"); grid.replaceChildren();
    if (!state.materials.length) { const empty = document.createElement("div"); empty.className = "empty-card"; empty.textContent = configured ? "No published resources are available yet." : "Published PDF resources will appear when Supabase is configured."; grid.append(empty); return; }
    state.materials.forEach(m => {
      const card = document.createElement("article"); card.className = "material-card";
      const badge = document.createElement("span"); badge.className = "pill"; badge.textContent = m.resource_type.toUpperCase();
      const h = document.createElement("h3"); h.textContent = m.title;
      const p = document.createElement("p"); p.textContent = safeText(m.description, "Study resource from the academy library.");
      card.append(badge, h, p);
      const button = document.createElement("button"); button.className = "btn"; button.textContent = "Open resource ↗";
      button.addEventListener("click", async () => {
        if (m.external_url && /^https:\/\//i.test(m.external_url)) window.open(m.external_url, "_blank", "noopener,noreferrer");
        else if (client && m.storage_path) {
          const { data, error } = await client.functions.invoke("material-url", { body: { materialId: m.id } });
          if (error || !data?.url) toast("Could not open this file. Please try again later.");
          else window.open(data.url, "_blank", "noopener,noreferrer");
        } else toast("This resource is not configured for public access.");
      }); card.append(button); grid.append(card);
    });
  }
  function renderAnnouncements() {
    const list = $("#updates-list"); list.replaceChildren();
    if (!state.announcements.length) { const empty = document.createElement("div"); empty.className = "empty-card"; empty.textContent = "No announcements to show yet."; list.append(empty); return; }
    state.announcements.forEach(a => {
      const item = document.createElement("article"); item.className = "update-item";
      const time = document.createElement("time"); time.textContent = formatDate(a.publish_at || a.created_at);
      const h = document.createElement("h3"); h.textContent = a.title;
      const p = document.createElement("p"); p.textContent = a.body;
      item.append(time, h, p); list.append(item);
    });
  }
  async function loadPublicContent() {
    if (!client) { renderTests(); renderMaterials(); return; }
    const [categories, tests, materials, announcements, settings] = await Promise.all([
      client.from("exam_categories").select("id,name,slug,description,sort_order").eq("is_published", true).order("sort_order"),
      client.from("tests").select("id,title,slug,description,instructions,syllabus,eligibility,category_id,duration_seconds,total_marks,max_attempts,starts_at,closes_at,status").eq("status", "published").order("created_at", { ascending: false }),
      client.from("study_materials").select("id,title,description,category_id,subject,resource_type,storage_path,external_url,created_at").eq("is_published", true).order("created_at", { ascending: false }),
      client.from("announcements").select("id,title,body,publish_at,created_at").eq("is_published", true).order("publish_at", { ascending: false }).limit(5),
      client.from("site_settings").select("key,value").eq("is_public", true)
    ]);
    if (!categories.error) state.categories = categories.data || [];
    if (!tests.error) state.tests = tests.data || [];
    if (!materials.error) state.materials = materials.data || [];
    if (!announcements.error) state.announcements = announcements.data || [];
    if (settings.data) settings.data.forEach(s => {
      if (s.key === "announcement_banner" && typeof s.value?.text === "string" && s.value.text.trim()) {
        const banner = $("#announcement-bar"); banner.textContent = s.value.text; banner.classList.remove("hidden");
      }
      if (s.key === "whatsapp_community_url" && typeof s.value?.url === "string" && /^https:\/\//i.test(s.value.url)) $("#community-link").href = s.value.url;
    });
    renderCategories(); renderTests(); renderMaterials(); renderAnnouncements();
    if (categories.error || tests.error || materials.error || announcements.error) console.warn("Some published content could not be loaded. Check Supabase schema, RLS, and configuration.");
  }
  function openAuth(mode) {
    state.mode = mode || "login"; syncAuthMode();
    if (!$("#auth-dialog").open) $("#auth-dialog").showModal();
  }
  function syncAuthMode() {
    const signup = state.mode === "signup";
    $("#auth-title").textContent = signup ? "Create your free account" : "Welcome back";
    $("#name-label").classList.toggle("hidden", !signup); $("#auth-name").classList.toggle("hidden", !signup);
    $("#auth-name").required = signup; $("#auth-password").autocomplete = signup ? "new-password" : "current-password";
    $("#auth-submit").textContent = signup ? "Create account" : "Log in";
    $("#auth-message").textContent = "";
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.mode === state.mode));
  }
  document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => { state.mode = t.dataset.mode; syncAuthMode(); }));
  $("#open-auth").addEventListener("click", () => state.user ? showStudentDashboard() : openAuth("login"));
  $("#auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client) { $("#auth-message").textContent = "Supabase is not configured. Add your project URL and public key in config.js."; return; }
    const email = $("#auth-email").value.trim(); const password = $("#auth-password").value; const name = $("#auth-name").value.trim();
    const submit = $("#auth-submit"); submit.disabled = true; submit.textContent = "Please wait…";
    try {
      if (state.mode === "signup") {
        const { data, error } = await client.auth.signUp({ email, password, options: { data: { display_name: name } } });
        if (error) throw error;
        $("#auth-message").textContent = data.session ? "Account created. You can start practising." : "Check your email to confirm your account, then log in.";
        if (data.session) { state.user = data.user; $("#auth-dialog").close(); updateAuthButton(); renderTests(); toast("Welcome to Sindh Scholars Academy!"); }
      } else {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        state.user = data.user; $("#auth-dialog").close(); updateAuthButton(); renderTests(); toast("You are signed in.");
      }
    } catch (e) { $("#auth-message").textContent = safeText(e.message, "Authentication failed. Please try again."); }
    finally { submit.disabled = false; syncAuthMode(); }
  });
  async function showStudentDashboard() {
    if (!client || !state.user) return openAuth("login");
    let dialog = $("#student-dashboard-dialog");
    if (!dialog) {
      dialog = document.createElement("dialog"); dialog.id = "student-dashboard-dialog"; dialog.className = "auth-dialog dashboard-dialog";
      dialog.innerHTML = '<form method="dialog" class="dialog-close-row"><button class="icon-button" aria-label="Close dashboard">×</button></form><span class="eyebrow">STUDENT DASHBOARD</span><h2>My learning</h2><p class="muted">Your saved test attempts and result publication status.</p><div id="student-results-list"><p class="muted">Loading your history…</p></div><button id="student-signout" class="btn btn-ghost btn-full" type="button">Sign out</button>';
      document.body.append(dialog);
      dialog.querySelector("#student-signout").addEventListener("click", async () => { await client.auth.signOut(); dialog.close(); state.user = null; updateAuthButton(); renderTests(); toast("You have signed out."); });
    }
    const list = dialog.querySelector("#student-results-list"); list.textContent = "Loading your history…";
    dialog.showModal();
    try {
      const { data, error } = await client.functions.invoke("my-results", { method: "GET" });
      if (error || !Array.isArray(data?.results)) throw new Error(data?.error || error?.message || "History is unavailable.");
      list.replaceChildren();
      if (!data.results.length) { const p=document.createElement("p");p.className="empty-card";p.textContent="You have not submitted any tests yet. Explore the available practice tests to begin.";list.append(p);return; }
      data.results.forEach(r => {
        const card=document.createElement("article");card.className="student-result-card";
        const title=document.createElement("h3");title.textContent=r.testTitle;
        const status=document.createElement("p");status.className="muted";status.textContent="Attempt "+r.attemptNumber+" · "+r.status+" · "+formatDate(r.submittedAt);
        const score=document.createElement("p");score.className="student-result-score";score.textContent=r.resultVisible ? (r.result.score+" / marks · "+r.result.percentage+"%") : "Result hidden until authorized release";
        card.append(title,status,score);list.append(card);
      });
    } catch(e) { list.textContent = safeText(e.message,"Could not load your history. Please try again."); }
  }
  function updateAuthButton() { $("#open-auth").textContent = state.user ? "Signed in" : "Student login"; $("#open-auth").title = state.user ? "Signed in student account" : "Student login"; }
  async function startTest(test) {
    if (!client || !state.user) return openAuth("login");
    const intro = "Start " + test.title + "?\\n\\nDuration: " + Math.round((test.duration_seconds || 0) / 60) + " minutes\\nTotal marks: " + (test.total_marks || "Calculated on publish") + "\\n\\n" + [test.instructions, test.eligibility ? "Eligibility: " + test.eligibility : "", test.syllabus ? "Syllabus: " + test.syllabus : ""].filter(Boolean).join("\\n\\n") + "\\n\\nThe timer starts after the server creates your attempt. Submit before time expires.";
    if (!window.confirm(intro)) return;
    const btn = null;
    try {
      const { data, error } = await client.functions.invoke("start-test", { body: { testId: test.id } });
      if (error || !data?.attemptId || !Array.isArray(data.questions)) throw new Error(data?.error || error?.message || "Test could not be started.");
      state.activeAttempt = data; state.answers = data.savedAnswers || {};
      state.remaining = Math.max(0, data.remainingSeconds ?? data.test.duration_seconds);
      renderExam();
    } catch (e) { toast(safeText(e.message, "Unable to start test. Check your connection and eligibility.")); }
    finally { if (btn) btn.disabled = false; }
  }
  function renderExam() {
    let dialog = $("#exam-dialog");
    if (!dialog) {
      dialog = document.createElement("dialog"); dialog.id = "exam-dialog"; dialog.className = "auth-dialog exam-dialog";
      dialog.innerHTML = '<div id="exam-content"></div>'; document.body.append(dialog);
      dialog.addEventListener("cancel", e => { e.preventDefault(); toast("Submit your test before closing the examination."); });
    }
    const data = state.activeAttempt; const test = data.test; const questions = data.questions;
    const content = $("#exam-content"); content.replaceChildren();
    const head = document.createElement("div"); head.className = "exam-head";
    const h = document.createElement("h2"); h.textContent = test.title;
    const timer = document.createElement("span"); timer.id = "exam-timer"; timer.className = "pill";
    head.append(h, timer); content.append(head);
    const note = document.createElement("p"); note.className = "muted"; note.textContent = "Your answers are saved when you submit. Do not refresh unless you need to reconnect; your attempt is managed by the server."; content.append(note);
    const nav = document.createElement("div"); nav.className = "question-nav";
    const form = document.createElement("form"); form.id = "exam-form";
    questions.forEach((q, index) => {
      const field = document.createElement("fieldset"); field.className = "exam-question"; field.id = "question-" + index;
      const legend = document.createElement("legend"); legend.textContent = (index + 1) + ". " + q.statement;
      field.append(legend);
      q.options.forEach((option, oi) => {
        const label = document.createElement("label"); label.className = "option-label";
        const radio = document.createElement("input"); radio.type = "radio"; radio.name = q.id; radio.value = String(oi);
        radio.checked = q.optionMap ? state.answers[q.id] === q.optionMap[oi] : Number(state.answers[q.id]) === oi;
        radio.addEventListener("change", async () => { const originalIndex = q.optionMap ? q.optionMap[oi] : oi; state.answers[q.id] = originalIndex; updateExamProgress(); const { error } = await client.functions.invoke("save-progress", { body: { attemptId: state.activeAttempt.attemptId, questionId: q.id, selectedOptionIndex: originalIndex } }); if (error) toast("Answer not saved yet. Check your connection and select again."); });
        label.append(radio, document.createTextNode(" " + option)); field.append(label);
      });
      form.append(field);
      const b = document.createElement("button"); b.type = "button"; b.className = "question-jump" + (state.answers[q.id] !== undefined ? " answered" : ""); b.textContent = String(index + 1); b.setAttribute("aria-label", "Go to question " + (index + 1)); b.addEventListener("click", () => field.scrollIntoView({ behavior: "smooth", block: "start" })); nav.append(b);
    });
    const navLabel = document.createElement("p"); navLabel.textContent = "Question navigation · Green numbers are answered"; navLabel.className = "muted"; content.append(navLabel, nav, form);
    const footer = document.createElement("div"); footer.className = "exam-footer";
    const count = document.createElement("span"); count.id = "answered-count"; count.className = "muted";
    const submit = document.createElement("button"); submit.type = "button"; submit.className = "btn"; submit.textContent = "Submit test"; submit.addEventListener("click", () => submitTest(false));
    footer.append(count, submit); content.append(footer); updateExamProgress();
    dialog.showModal(); startTimer();
  }
  function updateExamProgress() {
    if (!state.activeAttempt) return;
    const total = state.activeAttempt.questions.length; const answered = Object.keys(state.answers).filter(k => state.activeAttempt.questions.some(q => q.id === k)).length;
    const el = $("#answered-count"); if (el) el.textContent = answered + " of " + total + " answered";
    document.querySelectorAll(".question-jump").forEach((b, i) => { const q = state.activeAttempt.questions[i]; b.classList.toggle("answered", state.answers[q.id] !== undefined); });
  }
  function startTimer() {
    if (state.timerId) clearInterval(state.timerId);
    const tick = () => {
      const el = $("#exam-timer"); if (el) el.textContent = Math.floor(state.remaining / 60) + ":" + String(state.remaining % 60).padStart(2, "0") + " remaining";
      if (state.remaining <= 0) { clearInterval(state.timerId); state.timerId = null; submitTest(true); return; }
      state.remaining -= 1;
    };
    tick(); state.timerId = setInterval(tick, 1000);
  }
  async function submitTest(timedOut) {
    if (!state.activeAttempt || !client) return;
    if (!timedOut && !window.confirm("Submit your test now? You cannot change answers after submission.")) return;
    const dialog = $("#exam-dialog"); const submit = dialog.querySelector(".exam-footer .btn"); if (submit) { submit.disabled = true; submit.textContent = "Submitting…"; }
    try {
      const payload = { attemptId: state.activeAttempt.attemptId, timedOut, answers: state.activeAttempt.questions.map(q => ({ questionId: q.id, selectedOptionIndex: state.answers[q.id] === undefined ? null : state.answers[q.id] })) };
      const { data, error } = await client.functions.invoke("submit-test", { body: payload });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "Submission failed.");
      if (state.timerId) clearInterval(state.timerId); state.timerId = null; dialog.close(); state.activeAttempt = null;
      toast(data.message || "Your answers have been submitted securely.");
      if (data.resultVisible) toast("Your result is available in your student dashboard.");
    } catch (e) {
      toast(safeText(e.message, "Submission failed. Your attempt is still open; reconnect and retry."));
      if (submit) { submit.disabled = false; submit.textContent = "Retry submission"; }
      if (timedOut) { state.remaining = 5; startTimer(); }
    }
  }
  $("#test-search").addEventListener("input", renderTests); $("#test-filter").addEventListener("change", renderTests);
  $("#menu-toggle").addEventListener("click", () => { const nav = $("#main-nav"); const open = nav.classList.toggle("open"); $("#menu-toggle").setAttribute("aria-expanded", String(open)); });
  document.querySelectorAll("#main-nav a").forEach(a => a.addEventListener("click", () => { $("#main-nav").classList.remove("open"); $("#menu-toggle").setAttribute("aria-expanded", "false"); }));
  async function initAuth() {
    if (!client) { renderTests(); renderMaterials(); return; }
    const { data } = await client.auth.getSession(); state.user = data.session?.user || null; updateAuthButton();
    client.auth.onAuthStateChange((_event, session) => { state.user = session?.user || null; updateAuthButton(); renderTests(); });
  }
  // Small exam layout rules are scoped here to keep the main stylesheet easy to scan.
  const examStyle = document.createElement("style"); examStyle.textContent = '.dashboard-dialog{width:min(620px,calc(100% - 24px));max-height:88vh;overflow:auto}.student-result-card{border:1px solid var(--line);border-radius:12px;padding:14px;margin:10px 0}.student-result-card h3{margin:0 0 4px}.student-result-card p{margin:5px 0}.student-result-score{font-weight:800;color:var(--green)}.exam-dialog{width:min(860px,calc(100% - 24px));max-height:92vh;overflow:auto}.exam-head,.exam-footer{display:flex;align-items:center;justify-content:space-between;gap:16px}.exam-head h2{font-size:1.45rem}.question-nav{display:flex;flex-wrap:wrap;gap:7px;margin:12px 0 24px}.question-jump{border:1px solid var(--line);background:#fff;border-radius:8px;width:36px;height:36px;color:var(--ink)}.question-jump.answered{background:var(--mint);border-color:#80b69a;color:var(--green);font-weight:800}.exam-question{border:1px solid var(--line);border-radius:14px;margin:14px 0;padding:18px}.exam-question legend{font-weight:700;padding:0 5px}.option-label{display:flex;gap:8px;align-items:flex-start;padding:10px;border-radius:8px;cursor:pointer}.option-label:hover{background:var(--bg)}.option-label input{margin-top:5px}.exam-footer{position:sticky;bottom:0;background:#fff;padding:14px 0 0;border-top:1px solid var(--line);margin-top:16px}'; document.head.append(examStyle);
  initAuth().then(loadPublicContent).catch(() => { renderTests(); renderMaterials(); });
})();