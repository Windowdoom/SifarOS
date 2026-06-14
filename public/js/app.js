// app.js — The Navigator PWA. Vanilla ES module, no framework, low-bandwidth.
//
// Principles in code:
// - Every screen shows the official channel + a human phone (the footer help strip).
// - All user data lives in localStorage on this device; one tap deletes it.
// - We ask the minimum and explain why; free text is never stored.
// - When numbers aren't operator-verified, we label results as an estimate.
// - The deterministic screener runs on-device so the core works offline.

import { screen, formatMoney } from "./screener.js";

// ---------- State (on-device only) ----------
const STATE_KEY = "navigator.state.v1";
const defaultState = () => ({
  v: 1,
  lang: null,
  jurisdiction: null,
  consent: false,
  profile: {},
  lastEstimate: null,
  lastRoute: [],
  application: { answers: {}, notes: {}, index: 0, docsHave: {} },
  preparation: { interviewDate: null, bringHave: {}, checklist: {}, practiceNotes: {} },
  retention: { enrolledDate: null, certEndDate: null, recert: { index: 0, notes: {} } },
});

let state = loadState();
function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
    const d = defaultState();
    const s = { ...d, ...parsed };
    // Merge nested defaults so older saved states gain new fields without losing data.
    s.application = { ...d.application, ...(parsed.application || {}) };
    s.preparation = { ...d.preparation, ...(parsed.preparation || {}) };
    s.retention = { ...d.retention, ...(parsed.retention || {}) };
    if (!s.retention.recert) s.retention.recert = { index: 0, notes: {} };
    return s;
  } catch {
    return defaultState();
  }
}
function saveState() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {}
}
async function deleteAllData() {
  try {
    localStorage.removeItem(STATE_KEY);
  } catch {}
  try {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {}
  const lang = state.lang; // keep language so the confirmation reads correctly
  state = defaultState();
  state.lang = lang;
  saveState();
}
function setPath(path, value) {
  const parts = path.split(".");
  let o = state;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof o[parts[i]] !== "object" || o[parts[i]] === null) o[parts[i]] = {};
    o = o[parts[i]];
  }
  o[parts[parts.length - 1]] = value;
  saveState();
}
function getPath(path) {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), state);
}

// ---------- i18n ----------
let dict = {};
async function loadI18n(lang) {
  const res = await fetch(`/i18n/${lang}.json`);
  dict = await res.json();
  document.documentElement.lang = lang;
}
function t(path, vars) {
  let s = path.split(".").reduce((o, k) => (o == null ? o : o[k]), dict);
  if (s == null) s = path;
  if (vars) for (const k in vars) s = String(s).replace(`{${k}}`, vars[k]);
  return s;
}
function pick(obj) {
  if (obj == null) return "";
  if (typeof obj === "string") return obj;
  return obj[state.lang] || obj.en || "";
}

// ---------- Rules / API ----------
let rules = null;
let verification = { unverified: 0, allVerified: false };
let modelAvailable = false;
let online = navigator.onLine;

async function loadRules() {
  try {
    const res = await fetch(`/api/rules?j=${encodeURIComponent(state.jurisdiction)}`);
    const data = await res.json();
    rules = data.rules;
    verification = data.verification || verification;
    modelAvailable = !!data.modelAvailable;
  } catch (e) {
    // Offline with no cache yet — rules stay null; views guard for this.
  }
}
async function fetchJurisdictions() {
  const res = await fetch("/api/jurisdictions");
  return res.json();
}
async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("request failed");
  return res.json();
}

// ---------- Small utilities ----------
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function telHref(phone) {
  return "tel:" + String(phone || "").replace(/[^0-9+]/g, "");
}
function ch() {
  return (rules && rules.channels) || {};
}
function chDoc(id) {
  const cat = (rules && rules.documents && rules.documents.catalog) || [];
  return cat.find((d) => d.id === id) || null;
}
function addMonths(dateStr, months) {
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d)) return null;
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
function daysUntil(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}
function fmtDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString(state.lang === "es" ? "es-US" : "en-US", { year: "numeric", month: "long", day: "numeric" });
}
function downloadICS(title, dateStr, desc) {
  const d = (dateStr || "").replace(/-/g, "");
  if (d.length !== 8) return;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const icsEsc = (s) => String(s || "").replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//The Navigator//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", "UID:nav-" + Date.now() + "@navigator", "DTSTAMP:" + stamp,
    "DTSTART;VALUE=DATE:" + d, "SUMMARY:" + icsEsc(title), "DESCRIPTION:" + icsEsc(desc),
    "BEGIN:VALARM", "TRIGGER:-P3D", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc(title), "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (title || "reminder").replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ---------- Router ----------
function go(route) {
  location.hash = route;
}
function currentRoute() {
  const h = location.hash.replace(/^#\/?/, "");
  return h || "home";
}

// ---------- Shared components ----------
function verifyBanner() {
  if (!verification || verification.unverified === 0) return "";
  return `<div class="banner banner-warn" role="note">${esc(t("verify.banner"))}</div>`;
}
function offlineBanner() {
  if (online) return "";
  return `<div class="banner banner-info" role="note">${esc(t("offline.note"))}</div>`;
}
function helpCard() {
  const c = ch();
  const portal = c.officialApplicationPortal;
  const info = c.statewideInfoLine;
  const community = c.communityResourceLine;
  const legal = c.legalHelp;
  return `
  <section class="card help-card">
    <h3>${esc(t("help.title"))}</h3>
    <div class="help-actions">
      ${portal ? `<a class="btn btn-block" href="${esc(portal.url)}" target="_blank" rel="noopener">${esc(t("help.applyOfficial"))} — ${esc(portal.label)}</a>` : ""}
      ${info ? `<a class="btn btn-block" href="${telHref(info.phone)}">${esc(t("help.call"))} ${esc(info.phone)}</a>` : ""}
      ${community ? `<a class="btn btn-ghost btn-block" href="${telHref(community.phone)}">${esc(t("help.findFood"))}</a>` : ""}
      ${legal ? `<a class="btn btn-ghost btn-block" href="${esc(legal.url)}" target="_blank" rel="noopener">${esc(t("help.legal"))}</a>` : ""}
    </div>
  </section>`;
}
function humanCards(cards) {
  if (!cards || !cards.length) return "";
  const legal = (cards[0] && cards[0].legalHelp) || (ch() && ch().legalHelp);
  const items = cards.map((c) => `<li>${esc(pick(c.label))}</li>`).join("");
  return `
  <section class="card card-human" role="note">
    <h3>⚠️ ${esc(t("human.title"))}</h3>
    <p>${esc(t("human.body"))}</p>
    <ul>${items}</ul>
    ${legal ? `<a class="btn btn-block" href="${esc(legal.url)}" target="_blank" rel="noopener">${esc(t("human.cta"))}</a>` : ""}
  </section>`;
}
function docChip(id) {
  const d = chDoc(id);
  if (!d) return "";
  return `<button class="chip" data-action="explainDoc" data-id="${esc(id)}">📄 ${esc(pick(d.label))}</button>`;
}
function explainBtn(query) {
  return `<button class="link-btn" data-action="explain" data-q="${esc(query)}">❓ ${esc(t("explain.button"))}</button>`;
}

// ---------- Shell ----------
function renderShell() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <header class="topbar">
      <button class="brand" data-action="nav:home" aria-label="${esc(t("app.title"))}">🧭 ${esc(t("app.title"))}</button>
      <button class="lang-toggle" data-action="lang:toggle">${esc(t("lang.toggle"))}</button>
    </header>
    <main id="view" class="view" tabindex="-1"></main>
    <footer class="bottombar">
      <div id="helpStrip" class="help-strip"></div>
      <nav class="tabs" aria-label="Main">
        ${tab("home", "🏠", t("nav.home"))}
        ${tab("discover", "💬", t("nav.discover"))}
        ${tab("apply", "📝", t("nav.apply"))}
        ${tab("prepare", "📞", t("nav.prepare"))}
        ${tab("renew", "🔁", t("nav.renew"))}
      </nav>
    </footer>
    <div id="modal" class="modal hidden" aria-live="polite"></div>
  `;
}
function tab(route, icon, label) {
  const active = currentRoute() === route ? " active" : "";
  return `<button class="tab${active}" data-action="nav:${route}"><span class="tab-icon">${icon}</span><span class="tab-label">${esc(label)}</span></button>`;
}
function renderHelpStrip() {
  const el = document.getElementById("helpStrip");
  if (!el) return;
  const c = ch();
  const portal = c.officialApplicationPortal;
  const info = c.statewideInfoLine || c.communityResourceLine || { phone: "211" };
  el.innerHTML = `
    ${portal ? `<a class="strip-btn" href="${esc(portal.url)}" target="_blank" rel="noopener">🌐 ${esc(t("help.applyOfficial"))}</a>` : `<a class="strip-btn" href="tel:211">🌐 211</a>`}
    <a class="strip-btn" href="${telHref(info.phone)}">📞 ${esc(t("help.call"))} ${esc(info.phone)}</a>
  `;
}

// ---------- Views ----------
function viewState(jurisdictions) {
  const items = (jurisdictions || [])
    .map((j) => `<button class="card card-action" data-action="state:pick" data-code="${esc(j.code)}">
        <span class="card-title">${esc(j.displayName)}</span>
        <span class="card-desc">${esc(j.programName)}</span>
      </button>`)
    .join("");
  return `
    <h1>${esc(t("state.title"))}</h1>
    <p class="lead">${esc(t("state.desc"))}</p>
    <div class="stack">${items || `<p>${esc(t("common.loading"))}</p>`}</div>
  `;
}
function viewConsent() {
  return `
    <h1>${esc(t("consent.title"))}</h1>
    <ul class="consent">
      <li>🤝 ${esc(t("consent.b1"))}</li>
      <li>🔒 ${esc(t("consent.b2"))}</li>
      <li>📱 ${esc(t("consent.b3"))}</li>
      <li>🌐 ${esc(t("consent.b4"))}</li>
    </ul>
    <button class="btn btn-block btn-lg" data-action="consent:agree">${esc(t("consent.agree"))}</button>
  `;
}
function viewHome() {
  const stateName = rules && rules.jurisdiction ? rules.jurisdiction.displayName : "";
  const program = rules && rules.jurisdiction ? rules.jurisdiction.programName : "SNAP";
  return `
    ${offlineBanner()}
    <h1>${esc(t("home.greeting"))}</h1>
    <p class="state-line">${esc(t("home.stateLine"))} <strong>${esc(program)} — ${esc(stateName)}</strong>
      <button class="link-btn" data-action="nav:state">${esc(t("state.change"))}</button></p>
    ${!modelAvailable ? `<div class="banner banner-info">${esc(t("home.modelOff"))}</div>` : ""}
    <h2>${esc(t("home.choose"))}</h2>
    <div class="stack">
      ${homeCard("discover", "💬", t("home.discoverTitle"), t("home.discoverDesc"))}
      ${homeCard("apply", "📝", t("home.applyTitle"), t("home.applyDesc"))}
      ${homeCard("prepare", "📞", t("home.prepareTitle"), t("home.prepareDesc"))}
      ${homeCard("renew", "🔁", t("home.renewTitle"), t("home.renewDesc"))}
    </div>
    ${helpCard()}
    <button class="link-btn block-center" data-action="nav:privacy">🔒 ${esc(t("home.privacy"))}</button>
    <p class="fineprint">${esc(t("footer.disclaimer"))}</p>
  `;
}
function homeCard(route, icon, title, desc) {
  return `<button class="card card-action" data-action="nav:${route}">
    <span class="card-icon">${icon}</span>
    <span class="card-text"><span class="card-title">${esc(title)}</span><span class="card-desc">${esc(desc)}</span></span>
    <span class="card-arrow">›</span>
  </button>`;
}

// Discovery
let discoverMode = "text"; // 'text' | 'questions'
function viewDiscover() {
  if (!modelAvailable || !online) discoverMode = "questions";
  const body = discoverMode === "text" ? discoverText() : discoverQuestions();
  return `
    ${offlineBanner()}
    <h1>${esc(t("discover.title"))}</h1>
    ${body}
    <div id="discoverResult"></div>
    ${helpCard()}
  `;
}
function discoverText() {
  return `
    <p class="lead">${esc(t("discover.prompt"))}</p>
    <textarea id="discoverText" class="input textarea" rows="5" placeholder="${esc(t("discover.placeholder"))}"></textarea>
    <div class="row">
      ${"webkitSpeechRecognition" in window || "SpeechRecognition" in window ? `<button class="btn btn-ghost" data-action="discover:mic" id="micBtn">🎤 ${esc(t("discover.mic"))}</button>` : ""}
      <button class="btn btn-lg" data-action="discover:submit">${esc(t("discover.submit"))}</button>
    </div>
    <p class="fineprint">${esc(t("discover.privacyNote"))}</p>
    <button class="link-btn block-center" data-action="discover:questions">${esc(t("discover.useQuestions"))}</button>
  `;
}
function qField(id, model, label, type, opts) {
  const val = getPath("profile." + model);
  if (type === "yesno") {
    const v = val === true ? "yes" : val === false ? "no" : "";
    return `<div class="field"><label>${esc(label)}</label>
      <div class="seg">
        <button class="seg-btn${v === "yes" ? " on" : ""}" data-action="profile:bool" data-model="${model}" data-val="yes">${esc(t("common.yes"))}</button>
        <button class="seg-btn${v === "no" ? " on" : ""}" data-action="profile:bool" data-model="${model}" data-val="no">${esc(t("common.no"))}</button>
      </div></div>`;
  }
  const suffix = opts && opts.suffix ? `<span class="suffix">${esc(opts.suffix)}</span>` : "";
  return `<div class="field"><label for="f_${id}">${esc(label)}</label>
    <div class="input-wrap">${opts && opts.prefix ? `<span class="prefix">${esc(opts.prefix)}</span>` : ""}
    <input id="f_${id}" class="input" type="${type}" inputmode="${type === "number" ? "decimal" : "text"}" data-model="profile.${model}" value="${val == null ? "" : esc(val)}" />${suffix}</div></div>`;
}
function discoverQuestions() {
  return `
    <p class="lead">${esc(t("discover.qIntro"))}</p>
    ${qField("hh", "householdSize", t("discover.qHousehold"), "number", { suffix: t("discover.people") })}
    ${qField("inc", "monthlyGrossIncome", t("discover.qIncome"), "number", { prefix: "$", suffix: t("discover.perMonth") })}
    ${qField("earn", "monthlyEarnedIncome", t("discover.qEarned"), "number", { prefix: "$", suffix: t("discover.perMonth") })}
    ${qField("rent", "monthlyShelterCost", t("discover.qRent"), "number", { prefix: "$", suffix: t("discover.perMonth") })}
    ${qField("util", "monthlyUtilityCost", t("discover.qUtilities"), "number", { prefix: "$", suffix: t("discover.perMonth") })}
    ${qField("dep", "monthlyDependentCareCost", t("discover.qDepcare"), "number", { prefix: "$", suffix: t("discover.perMonth") })}
    ${qField("eld", "hasElderlyOrDisabled", t("discover.qElderly"), "yesno")}
    ${qField("imm", "_immigration", t("discover.qImmigration"), "yesno")}
    <button class="btn btn-block btn-lg" data-action="discover:calc">${esc(t("discover.calc"))}</button>
    ${modelAvailable && online ? `<button class="link-btn block-center" data-action="discover:text">${esc(t("discover.useText"))}</button>` : ""}
  `;
}
function decisionClass(d) {
  return { likely: "ok", maybe: "warn", unlikely: "muted", unknown: "info" }[d] || "info";
}
function renderResult(result) {
  const e = result.estimate;
  const confKey = { low: "confLow", medium: "confMedium", high: "confHigh" }[e.confidence] || "confLow";
  const reasons = (e.reasons || []).map((r) => `<li>${esc(pick(r))}</li>`).join("");
  const disclaimers = (e.disclaimers || []).map((d) => `<p class="fineprint">• ${esc(pick(d))}</p>`).join("");
  const otherNeeds = (result.otherNeeds || []).filter((n) => t("otherNeeds." + n) !== "otherNeeds." + n);
  const otherHtml = otherNeeds.length
    ? `<section class="card"><h3>${esc(t("result.otherTitle"))}</h3>
        <ul>${otherNeeds.map((n) => `<li>${esc(t("otherNeeds." + n))}</li>`).join("")}</ul>
        <p class="fineprint">${esc(t("result.otherNote"))}</p></section>`
    : "";
  const benefit =
    e.estimatedMonthlyBenefit != null && (e.decision === "likely" || e.decision === "maybe")
      ? `<p class="benefit"><span>${esc(t("result.benefit"))}</span><strong>${esc(formatMoney(e.estimatedMonthlyBenefit))}</strong></p>`
      : "";
  const reflection = result.reflection ? `<p class="reflection">${esc(result.reflection)}</p>` : "";
  const cta =
    e.decision === "unlikely"
      ? `<button class="btn btn-block" data-action="discover:again">${esc(t("result.again"))}</button>`
      : `<button class="btn btn-block btn-lg" data-action="nav:apply">${esc(t("result.nextApply"))}</button>
         <button class="btn btn-ghost btn-block" data-action="nav:prepare">${esc(t("result.nextBring"))}</button>`;
  return `
    ${verifyBanner()}
    ${reflection}
    <section class="card result result-${decisionClass(e.decision)}">
      <h2>${esc(t("result." + e.decision))}</h2>
      <p class="confidence">${esc(t("result.confidence"))} <strong>${esc(t("result." + confKey))}</strong></p>
      ${benefit}
      <ul class="reasons">${reasons}</ul>
      ${disclaimers}
      ${!result.usedModel ? `<p class="fineprint">${esc(t("result.estimatedOnPhone"))}</p>` : ""}
    </section>
    ${humanCards(result.routeToHumanCards)}
    ${otherHtml}
    ${cta}
  `;
}

// Apply
function viewApply() {
  const steps = (rules && rules.applicationSteps && rules.applicationSteps.steps) || [];
  if (!steps.length) return `<h1>${esc(t("apply.title"))}</h1><p>${esc(t("common.loading"))}</p>` + helpCard();
  let i = state.application.index || 0;
  if (i >= steps.length) return applyFinish(steps);
  const step = steps[i];
  const docs = (step.docs || []).map(docChip).join("");
  const mistakes = (step.mistakes || []).map((m) => `<li>${esc(pick(m))}</li>`).join("");
  const note = (state.application.notes && state.application.notes[step.id]) || "";
  const human = step.routeToHuman ? humanCards([{ topicId: step.routeToHuman, label: humanLabel(step.routeToHuman), legalHelp: ch().legalHelp }]) : "";
  return `
    <div class="progress"><div class="progress-bar" style="width:${Math.round((i / steps.length) * 100)}%"></div></div>
    <p class="step-count">${esc(t("apply.step"))} ${i + 1} ${esc(t("apply.of"))} ${steps.length}</p>
    <h1 class="question">${esc(pick(step.plain))}</h1>
    ${explainBtn(pick({ en: step.plain.en, es: step.plain.es }))}
    <p class="official-label">${esc(t("apply.official"))}: <em>${esc(pick(step.official))}</em></p>
    <details class="disclosure"><summary>${esc(t("apply.why"))}</summary><p>${esc(pick(step.why))}</p></details>
    ${docs ? `<div class="chips-label">${esc(t("apply.docs"))}</div><div class="chips">${docs}</div>` : ""}
    ${mistakes ? `<section class="card card-tip"><h3>💡 ${esc(t("apply.mistakes"))}</h3><ul>${mistakes}</ul></section>` : ""}
    ${human}
    <label class="field-label" for="note">${esc(t("apply.notes"))}</label>
    <textarea id="note" class="input textarea" rows="3" placeholder="${esc(t("apply.notesPlaceholder"))}" data-model="application.notes.${esc(step.id)}">${esc(note)}</textarea>
    <div class="row">
      ${i > 0 ? `<button class="btn btn-ghost" data-action="apply:back">${esc(t("common.back"))}</button>` : ""}
      <button class="btn btn-lg" data-action="apply:next">${esc(t("common.next"))}</button>
    </div>
    ${helpCard()}
  `;
}
function humanLabel(topicId) {
  const topics = (rules && rules.routeToHumanTopics && rules.routeToHumanTopics.topics) || [];
  const tpc = topics.find((x) => x.id === topicId);
  return tpc ? { en: tpc.en, es: tpc.es } : { en: topicId, es: topicId };
}
function applyFinish(steps) {
  const allDocs = [...new Set(steps.flatMap((s) => s.docs || []))];
  const checklist = allDocs
    .map((id) => {
      const d = chDoc(id);
      if (!d) return "";
      const have = state.application.docsHave && state.application.docsHave[id];
      return `<li><label class="check"><input type="checkbox" data-action="toggle" data-path="application.docsHave.${esc(id)}" ${have ? "checked" : ""}/> <span>${esc(pick(d.label))}</span></label>
        <details class="disclosure"><summary>${esc(t("docs.how"))}</summary><p><strong>${esc(t("docs.why"))}:</strong> ${esc(pick(d.why))}</p><p>${esc(pick(d.howToGetIfMissing))}</p></details></li>`;
    })
    .join("");
  const portal = ch().officialApplicationPortal;
  return `
    ${verifyBanner()}
    <h1>✅ ${esc(t("apply.finishTitle"))}</h1>
    <p class="lead">${esc(t("apply.finishBody"))}</p>
    <h2>${esc(t("apply.checklist"))}</h2>
    <ul class="checklist">${checklist}</ul>
    ${portal ? `<a class="btn btn-block btn-lg" href="${esc(portal.url)}" target="_blank" rel="noopener">${esc(t("apply.finishCta"))} — ${esc(portal.label)}</a>` : ""}
    <button class="btn btn-ghost btn-block" data-action="nav:prepare">${esc(t("result.nextBring"))}</button>
    <button class="link-btn block-center" data-action="apply:restart">${esc(t("common.back"))} — ${esc(t("apply.step"))} 1</button>
    ${helpCard()}
  `;
}

// Prepare (interview)
function viewPrepare() {
  const iv = (rules && rules.interview) || {};
  const ask = (iv.whatTheyAsk || []).map((a) => `<li>${esc(pick(a))}</li>`).join("");
  const bring = (iv.whatToBring || []).map(docChip).join("");
  const tips = [...(iv.tips || []), ...(iv.stateTips || [])].map((tp) => `<li>${esc(pick(tp))}</li>`).join("");
  const date = state.preparation.interviewDate || "";
  const checklistItems = iv.checklist || [];
  const checklist = checklistItems.length
    ? `<section class="card"><h3>✅ ${esc(t("prepare.checklistTitle"))}</h3><ul class="checklist">${checklistItems
        .map((c, i) => `<li><label class="check"><input type="checkbox" data-action="toggle" data-path="preparation.checklist.${i}" ${state.preparation.checklist && state.preparation.checklist[i] ? "checked" : ""}/> <span>${esc(pick(c))}</span></label></li>`)
        .join("")}</ul></section>`
    : "";
  const practiceItems = iv.practice || [];
  const practice = practiceItems.length
    ? `<section class="card"><h3>🗣️ ${esc(t("prepare.practiceTitle"))}</h3><p class="fineprint">${esc(t("prepare.practiceIntro"))}</p>${practiceItems
        .map((p, i) => `<details class="disclosure"><summary>${esc(pick(p.q))}</summary>
            <p><strong>${esc(t("prepare.answerHint"))}:</strong> ${esc(pick(p.hint))}</p>
            <label class="field-label" for="pa_${i}">${esc(t("prepare.yourAnswer"))}</label>
            <textarea id="pa_${i}" class="input textarea" rows="2" data-model="preparation.practiceNotes.${i}">${esc((state.preparation.practiceNotes && state.preparation.practiceNotes[i]) || "")}</textarea>
          </details>`)
        .join("")}</section>`
    : "";
  const ifMissed = iv.ifMissed
    ? `<section class="card card-tip"><h3>📞 ${esc(t("prepare.ifMissedTitle"))}</h3><p>${esc(pick(iv.ifMissed))}</p></section>`
    : "";
  return `
    <h1>${esc(t("prepare.title"))}</h1>
    <p class="lead">${esc(t("prepare.intro"))}</p>
    ${iv.how ? `<section class="card"><h3>${esc(t("prepare.how"))}</h3><p>${esc(pick(iv.how))}</p></section>` : ""}
    ${iv.when ? `<section class="card"><h3>${esc(t("prepare.when"))}</h3><p>${esc(pick(iv.when))}</p></section>` : ""}
    ${ask ? `<section class="card"><h3>${esc(t("prepare.ask"))}</h3><ul>${ask}</ul></section>` : ""}
    ${bring ? `<section class="card"><h3>${esc(t("prepare.bring"))}</h3><div class="chips">${bring}</div></section>` : ""}
    ${checklist}
    ${practice}
    ${tips ? `<section class="card card-tip"><h3>💡 ${esc(t("prepare.tips"))}</h3><ul>${tips}</ul></section>` : ""}
    ${ifMissed}
    <section class="card">
      <label class="field-label" for="ivdate">${esc(t("prepare.dateLabel"))}</label>
      <input id="ivdate" class="input" type="date" data-model="preparation.interviewDate" value="${esc(date)}" />
      ${date ? `<button class="btn btn-block" data-action="ics:interview" data-date="${esc(date)}">📅 ${esc(t("reminders.calendar"))}</button>` : ""}
    </section>
    ${helpCard()}
  `;
}

// Renew (retention)
function viewRenew() {
  const r = (rules && rules.retention) || {};
  const certMonths = r.certificationPeriodMonths && r.certificationPeriodMonths.value;
  const enrolled = state.retention.enrolledDate || "";
  const certEnd = state.retention.certEndDate || "";
  const report = r.periodicReport || {};
  const cr = r.changeReporting;
  const changeReport = cr
    ? `<section class="card"><h3>🔔 ${esc(t("renew.changeTitle"))}</h3><ul>${(cr.items || []).map((it) => `<li>${esc(pick(it))}</li>`).join("")}</ul>${cr.note ? `<p class="fineprint">${esc(pick(cr.note))}</p>` : ""}</section>`
    : "";
  // compute dates
  let renewalDate = certEnd || (enrolled && certMonths ? addMonths(enrolled, certMonths) : null);
  let renewalEstimated = !certEnd && !!renewalDate;
  let reportDate = enrolled && report.dueAtMonth ? addMonths(enrolled, report.dueAtMonth) : null;
  const upcoming = [];
  if (reportDate && report.dueAtMonth) upcoming.push({ kind: "report", date: reportDate, label: t("renew.reportDue"), estimated: true });
  if (renewalDate) upcoming.push({ kind: "renewal", date: renewalDate, label: t("renew.renewalDue"), estimated: renewalEstimated });
  const upcomingHtml = upcoming
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((u) => {
      const dleft = daysUntil(u.date);
      let badge = "";
      if (dleft == null) badge = "";
      else if (dleft < 0) badge = `<span class="pill pill-danger">${esc(t("renew.overdue"))}</span>`;
      else if (dleft === 0) badge = `<span class="pill pill-danger">${esc(t("renew.dueToday"))}</span>`;
      else badge = `<span class="pill ${dleft <= 30 ? "pill-warn" : ""}">${esc(t("renew.daysLeft", { n: dleft }))}</span>`;
      return `<div class="date-row">
        <div><strong>${esc(u.label)}</strong> ${u.estimated ? `<em class="muted">${esc(t("renew.estimated"))}</em>` : ""}<br><span>${esc(fmtDate(u.date))}</span></div>
        <div class="date-side">${badge}<button class="btn btn-sm" data-action="ics:renew" data-date="${esc(u.date)}" data-kind="${u.kind}">📅</button></div>
      </div>`;
    })
    .join("");
  return `
    ${verifyBanner()}
    <h1>${esc(t("renew.title"))}</h1>
    <p class="lead">${esc(t("renew.intro"))}</p>
    ${r.certificationPeriodMonths ? `<section class="card"><h3>${esc(t("renew.cert"))}</h3><p>${esc(certNoteText(certMonths))}</p></section>` : ""}
    ${report && (report.description) ? `<section class="card"><h3>${esc(t("renew.report"))}${report.name ? " — " + esc(report.name) : ""}</h3><p>${esc(pick(report.description))}</p></section>` : ""}
    ${r.recertification ? `<section class="card"><h3>${esc(t("renew.recert"))}</h3><p>${esc(pick(r.recertification.description))}</p></section>` : ""}
    ${r.recertification && r.recertification.ifMissed ? `<section class="card card-tip"><h3>⚠️ ${esc(t("renew.ifMissed"))}</h3><p>${esc(pick(r.recertification.ifMissed))}</p></section>` : ""}
    <section class="card">
      <h3>${esc(t("renew.addDates"))}</h3>
      <label class="field-label" for="enrolled">${esc(t("renew.enrolledLabel"))}</label>
      <input id="enrolled" class="input" type="date" data-model="retention.enrolledDate" value="${esc(enrolled)}" />
      <label class="field-label" for="certend">${esc(t("renew.certEndLabel"))}</label>
      <input id="certend" class="input" type="date" data-model="retention.certEndDate" value="${esc(certEnd)}" />
      <p class="fineprint">${esc(t("renew.computeNote"))}</p>
    </section>
    ${upcoming.length ? `<section class="card"><h3>${esc(t("renew.upcoming"))}</h3>${upcomingHtml}</section>` : ""}
    ${changeReport}
    <button class="btn btn-block btn-lg" data-action="nav:recert">${esc(t("renew.startRecert"))}</button>
    ${helpCard()}
  `;
}
function certNoteText(months) {
  if (!months) return "";
  return state.lang === "es"
    ? `Muchos hogares están aprobados por unos ${months} meses. Su aviso oficial indica su fecha exacta — confíe en ese aviso.`
    : `Many households are approved for about ${months} months. Your official notice lists your exact date — trust that notice.`;
}

// Recertification walkthrough — the guided renewal (Phase 2 retention depth).
function viewRecert() {
  const steps = (rules && rules.retention && rules.retention.recertSteps) || [];
  if (!steps.length) return `<h1>${esc(t("recert.title"))}</h1><p>${esc(t("common.loading"))}</p>` + helpCard();
  const i = (state.retention.recert && state.retention.recert.index) || 0;
  if (i >= steps.length) return recertFinish();
  const step = steps[i];
  const note = (state.retention.recert.notes && state.retention.recert.notes[step.id]) || "";
  return `
    ${i === 0 ? `<p class="lead">${esc(t("recert.intro"))}</p>` : ""}
    <div class="progress"><div class="progress-bar" style="width:${Math.round((i / steps.length) * 100)}%"></div></div>
    <p class="step-count">${esc(t("apply.step"))} ${i + 1} ${esc(t("apply.of"))} ${steps.length}</p>
    <h1 class="question">${esc(pick(step.prompt))}</h1>
    ${explainBtn(pick(step.prompt))}
    <details class="disclosure"><summary>${esc(t("apply.why"))}</summary><p>${esc(pick(step.why))}</p></details>
    <label class="field-label" for="rn">${esc(t("apply.notes"))}</label>
    <textarea id="rn" class="input textarea" rows="3" placeholder="${esc(t("apply.notesPlaceholder"))}" data-model="retention.recert.notes.${esc(step.id)}">${esc(note)}</textarea>
    <div class="row">
      ${i > 0 ? `<button class="btn btn-ghost" data-action="recert:back">${esc(t("common.back"))}</button>` : ""}
      <button class="btn btn-lg" data-action="recert:next">${esc(t("common.next"))}</button>
    </div>
    ${helpCard()}
  `;
}
function recertFinish() {
  const portal = ch().officialApplicationPortal;
  const failures = (rules && rules.retention && rules.retention.recertCommonFailures) || [];
  return `
    <h1>✅ ${esc(t("recert.finishTitle"))}</h1>
    <p class="lead">${esc(t("recert.finishBody"))}</p>
    ${failures.length ? `<section class="card card-tip"><h3>⚠️ ${esc(t("renew.failuresTitle"))}</h3><ul>${failures.map((f) => `<li>${esc(pick(f))}</li>`).join("")}</ul></section>` : ""}
    ${portal ? `<a class="btn btn-block btn-lg" href="${esc(portal.url)}" target="_blank" rel="noopener">${esc(t("apply.finishCta"))} — ${esc(portal.label)}</a>` : ""}
    <button class="link-btn block-center" data-action="recert:restart">${esc(t("common.back"))} — ${esc(t("apply.step"))} 1</button>
    ${helpCard()}
  `;
}

// Privacy
function viewPrivacy() {
  const fields = [];
  if (state.profile && Object.keys(state.profile).length) fields.push(t("privacy.fields.profile"));
  if (state.application && (Object.keys(state.application.notes || {}).length || state.application.index)) fields.push(t("privacy.fields.application"));
  if (state.preparation && state.preparation.interviewDate) fields.push(t("privacy.fields.preparation"));
  if (state.retention && (state.retention.enrolledDate || state.retention.certEndDate)) fields.push(t("privacy.fields.retention"));
  if (state.lang || state.jurisdiction) fields.push(t("privacy.fields.settings"));
  const list = fields.length ? `<ul>${fields.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : `<p>${esc(t("privacy.nothing"))}</p>`;
  return `
    <h1>🔒 ${esc(t("privacy.title"))}</h1>
    <p class="lead">${esc(t("privacy.minimal"))}</p>
    <section class="card"><h3>${esc(t("privacy.stored"))}</h3>${list}</section>
    <button class="btn btn-danger btn-block btn-lg" data-action="privacy:delete">${esc(t("privacy.delete"))}</button>
    ${helpCard()}
  `;
}

// ---------- Mount / render ----------
function mount(html) {
  const view = document.getElementById("view");
  view.innerHTML = html;
  view.focus();
  window.scrollTo(0, 0);
  // refresh tab active states
  document.querySelectorAll(".tab").forEach((el) => {
    const r = el.getAttribute("data-action").split(":")[1];
    el.classList.toggle("active", r === currentRoute());
  });
  renderHelpStrip();
}

async function render() {
  // First-run gates
  if (!state.jurisdiction) {
    const data = await fetchJurisdictions().catch(() => ({ jurisdictions: [] }));
    mount(viewState(data.jurisdictions));
    return;
  }
  if (!rules) await loadRules();
  if (!state.consent) {
    mount(viewConsent());
    return;
  }
  switch (currentRoute()) {
    case "state": {
      const data = await fetchJurisdictions().catch(() => ({ jurisdictions: [] }));
      mount(viewState(data.jurisdictions));
      break;
    }
    case "discover":
      mount(viewDiscover());
      // re-render last result if present
      if (state.lastEstimate) {
        const box = document.getElementById("discoverResult");
        if (box) box.innerHTML = renderResult(state.lastEstimate);
      }
      break;
    case "apply":
      mount(viewApply());
      break;
    case "prepare":
      mount(viewPrepare());
      break;
    case "renew":
      mount(viewRenew());
      break;
    case "recert":
      mount(viewRecert());
      break;
    case "privacy":
      mount(viewPrivacy());
      break;
    case "home":
    default:
      mount(viewHome());
  }
}

// ---------- Events ----------
let recognizer = null;
async function onClick(ev) {
  const el = ev.target.closest("[data-action]");
  if (!el) return;
  const action = el.getAttribute("data-action");

  if (action.startsWith("nav:")) {
    go(action.slice(4));
    return;
  }
  switch (action) {
    case "lang:toggle": {
      state.lang = state.lang === "es" ? "en" : "es";
      saveState();
      await loadI18n(state.lang);
      renderShell();
      await render();
      return;
    }
    case "state:pick": {
      state.jurisdiction = el.getAttribute("data-code");
      rules = null;
      saveState();
      await loadRules();
      go("home");
      await render();
      return;
    }
    case "consent:agree":
      state.consent = true;
      saveState();
      go("home");
      return;
    case "discover:questions":
      discoverMode = "questions";
      mount(viewDiscover());
      return;
    case "discover:text":
      discoverMode = "text";
      mount(viewDiscover());
      return;
    case "discover:again":
      state.lastEstimate = null;
      saveState();
      mount(viewDiscover());
      return;
    case "discover:mic":
      toggleMic();
      return;
    case "discover:submit":
      await submitDiscoveryText();
      return;
    case "discover:calc":
      runStructuredScreen();
      return;
    case "profile:bool": {
      const model = el.getAttribute("data-model");
      const val = el.getAttribute("data-val") === "yes";
      setPath("profile." + model, val);
      // reflect toggle UI
      el.parentElement.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("on"));
      el.classList.add("on");
      return;
    }
    case "apply:next": {
      const steps = (rules.applicationSteps && rules.applicationSteps.steps) || [];
      state.application.index = Math.min((state.application.index || 0) + 1, steps.length);
      saveState();
      mount(viewApply());
      return;
    }
    case "apply:back":
      state.application.index = Math.max((state.application.index || 0) - 1, 0);
      saveState();
      mount(viewApply());
      return;
    case "apply:restart":
      state.application.index = 0;
      saveState();
      mount(viewApply());
      return;
    case "recert:next": {
      const steps = (rules.retention && rules.retention.recertSteps) || [];
      state.retention.recert.index = Math.min((state.retention.recert.index || 0) + 1, steps.length);
      saveState();
      mount(viewRecert());
      return;
    }
    case "recert:back":
      state.retention.recert.index = Math.max((state.retention.recert.index || 0) - 1, 0);
      saveState();
      mount(viewRecert());
      return;
    case "recert:restart":
      state.retention.recert.index = 0;
      saveState();
      mount(viewRecert());
      return;
    case "toggle": {
      const path = el.getAttribute("data-path");
      setPath(path, el.checked);
      return;
    }
    case "explain":
      openExplain(el.getAttribute("data-q"), false);
      return;
    case "explainDoc": {
      const d = chDoc(el.getAttribute("data-id"));
      if (d) openDocModal(d);
      return;
    }
    case "explain:simpler":
      openExplain(lastExplainQuery, true);
      return;
    case "explain:close":
      closeModal();
      return;
    case "ics:interview": {
      const date = el.getAttribute("data-date");
      const iv = (rules && rules.interview) || {};
      downloadICS(t("prepare.title"), date, pick(iv.how) + " " + pick(iv.when));
      return;
    }
    case "ics:renew": {
      const date = el.getAttribute("data-date");
      const kind = el.getAttribute("data-kind");
      downloadICS(kind === "report" ? t("renew.reportDue") : t("renew.renewalDue"), date, t("renew.title"));
      return;
    }
    case "privacy:delete":
      if (confirm(t("privacy.deleteConfirm"))) {
        await deleteAllData();
        alert(t("privacy.deleted"));
        location.hash = "";
        rules = null;
        renderShell();
        await render();
      }
      return;
  }
}
function onInput(ev) {
  const el = ev.target.closest("[data-model]");
  if (!el || el.classList.contains("seg-btn")) return;
  const model = el.getAttribute("data-model");
  if (model.startsWith("profile._")) return; // handled specially below
  let v = el.value;
  if (el.type === "number") v = v === "" ? "" : parseFloat(v);
  setPath(model, v);
  // The immigration question is not a screener field; track its flag separately
}
function onChange(ev) {
  const el = ev.target.closest("[data-model]");
  if (!el) return;
  if (el.type === "date") {
    setPath(el.getAttribute("data-model"), el.value);
    if (currentRoute() === "renew") mount(viewRenew());
    if (currentRoute() === "prepare") mount(viewPrepare());
  }
}

// ---------- Discovery actions ----------
function collectProfile() {
  const p = { ...state.profile };
  // immigration flag -> sensitive flag, not a numeric field
  const sensitiveFlags = [];
  if (p._immigration === true) sensitiveFlags.push("immigration_status");
  delete p._immigration;
  p.sensitiveFlags = sensitiveFlags;
  return p;
}
function runStructuredScreen() {
  const profile = collectProfile();
  const estimate = screen(rules, profile);
  const result = {
    usedModel: false,
    language: state.lang,
    reflection: "",
    profile,
    estimate,
    otherNeeds: [],
    routeToHumanCards: buildRouteCardsClient(estimate.routeToHuman),
  };
  state.lastEstimate = result;
  saveState();
  const box = document.getElementById("discoverResult");
  if (box) {
    box.innerHTML = renderResult(result);
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
function buildRouteCardsClient(flags) {
  const topics = (rules && rules.routeToHumanTopics && rules.routeToHumanTopics.topics) || [];
  const legal = ch().legalHelp;
  return (flags || [])
    .map((id) => topics.find((t2) => t2.id === id))
    .filter(Boolean)
    .map((tp) => ({ topicId: tp.id, label: { en: tp.en, es: tp.es }, legalHelp: legal }));
}
async function submitDiscoveryText() {
  const ta = document.getElementById("discoverText");
  const text = ta ? ta.value.trim() : "";
  const box = document.getElementById("discoverResult");
  if (!text) {
    if (box) box.innerHTML = `<p class="fineprint">${esc(t("discover.prompt"))}</p>`;
    return;
  }
  if (box) box.innerHTML = `<p class="loading">${esc(t("common.loading"))}</p>`;
  try {
    const result = await postJSON("/api/discovery", {
      j: state.jurisdiction,
      text,
      lang: state.lang,
      profile: collectProfile(),
    });
    // store only the structured result, never the raw text
    state.profile = { ...state.profile, ...(result.profile || {}) };
    delete state.profile.sensitiveFlags;
    state.lastEstimate = result;
    saveState();
    if (box) {
      box.innerHTML = renderResult(result);
      box.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch (e) {
    // fall back to structured questions
    discoverMode = "questions";
    mount(viewDiscover());
    const b2 = document.getElementById("discoverResult");
    if (b2) b2.innerHTML = `<div class="banner banner-info">${esc(t("home.modelOff"))}</div>`;
  }
}
function toggleMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  const btn = document.getElementById("micBtn");
  if (recognizer) {
    recognizer.stop();
    recognizer = null;
    if (btn) btn.textContent = "🎤 " + t("discover.mic");
    return;
  }
  recognizer = new SR();
  recognizer.lang = state.lang === "es" ? "es-US" : "en-US";
  recognizer.interimResults = false;
  recognizer.continuous = false;
  if (btn) btn.textContent = "⏹ " + t("discover.listening");
  recognizer.onresult = (e) => {
    const text = Array.from(e.results).map((r) => r[0].transcript).join(" ");
    const ta = document.getElementById("discoverText");
    if (ta) ta.value = (ta.value ? ta.value + " " : "") + text;
  };
  recognizer.onend = () => {
    recognizer = null;
    if (btn) btn.textContent = "🎤 " + t("discover.mic");
  };
  recognizer.onerror = recognizer.onend;
  recognizer.start();
}

// ---------- Explain modal ----------
let lastExplainQuery = "";
function showModal(html) {
  const m = document.getElementById("modal");
  m.innerHTML = `<div class="modal-card">${html}</div>`;
  m.classList.remove("hidden");
}
function closeModal() {
  const m = document.getElementById("modal");
  m.classList.add("hidden");
  m.innerHTML = "";
}
function openDocModal(d) {
  showModal(`
    <h3>📄 ${esc(pick(d.label))}</h3>
    <p>${esc(pick(d.examples))}</p>
    <p><strong>${esc(t("docs.why"))}:</strong> ${esc(pick(d.why))}</p>
    <p><strong>${esc(t("docs.how"))}:</strong> ${esc(pick(d.howToGetIfMissing))}</p>
    <button class="btn btn-block" data-action="explain:close">${esc(t("explain.close"))}</button>
  `);
}
async function openExplain(query, simpler) {
  lastExplainQuery = query;
  showModal(`<h3>${esc(t("explain.title"))}</h3><p class="loading">${esc(t("common.loading"))}</p>`);
  let text = "";
  try {
    const r = await postJSON("/api/explain", { j: state.jurisdiction, query, lang: state.lang, simpler });
    text = r.text || "";
  } catch (e) {
    text = "";
  }
  if (!text) {
    const info = ch().statewideInfoLine || { phone: "211" };
    text =
      state.lang === "es"
        ? `Una persona puede explicarle esto mejor. Llame al ${info.phone}.`
        : `A real person can explain this best. Call ${info.phone}.`;
  }
  showModal(`
    <h3>${esc(t("explain.title"))}</h3>
    <p class="explain-text">${esc(text)}</p>
    <div class="row">
      <button class="btn btn-ghost" data-action="explain:simpler">${esc(t("explain.simpler"))}</button>
      <button class="btn" data-action="explain:close">${esc(t("explain.close"))}</button>
    </div>
  `);
}

// ---------- Init ----------
async function init() {
  if (!state.lang) {
    const nav = (navigator.language || "en").toLowerCase();
    state.lang = nav.startsWith("es") ? "es" : "en";
    saveState();
  }
  await loadI18n(state.lang);
  renderShell();

  window.addEventListener("hashchange", render);
  window.addEventListener("online", () => {
    online = true;
    if (currentRoute() === "discover" || currentRoute() === "home") render();
  });
  window.addEventListener("offline", () => {
    online = false;
  });
  const app = document.getElementById("app");
  app.addEventListener("click", onClick);
  app.addEventListener("input", onInput);
  app.addEventListener("change", onChange);
  document.getElementById("modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") closeModal();
  });

  await render();

  // Register service worker for offline + low-bandwidth (best effort).
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/sw.js");
    } catch {}
  }
}

init();
