const CONFIG = {
  UNSPLASH_API_KEY: "kEBBmYjyCeeGepXk3XwoxiRqfusM2a98Xuw_EtEG7nE",   // <- paste your Unsplash Access Key here
  COUNTRIES_URL: "https://restcountries.com/v3.1/all?fields=name,capital,region,subregion,population,languages,currencies,flags,cca2,latlng",
  RATES_URL: "https://open.er-api.com/v6/latest/USD",
  SHAKE_THRESHOLD: 18,    // acceleration delta (m/s²)
  SHAKE_COOLDOWN_MS: 1500,
  DEFAULT_HOME: "USD",
  BUDGET_AMOUNT: 100,
};

const $ = id => document.getElementById(id);
const state = { countries: [], rates: null, current: null, busy: false, last: 0, lastAcc: null, deferredPrompt: null, listening: false };

const toast = msg => { const t = $("toast"); t.textContent = msg; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2400); };
const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };
const fmt = (n, d = 2) => new Intl.NumberFormat(undefined, { maximumFractionDigits: d }).format(n);
const home = () => { try { return localStorage.getItem("home") || CONFIG.DEFAULT_HOME; } catch { return CONFIG.DEFAULT_HOME; } };

async function loadData() {
  const [c, r] = await Promise.all([
    fetch(CONFIG.COUNTRIES_URL).then(x => x.json()),
    fetch(CONFIG.RATES_URL).then(x => x.json()).catch(() => null),
  ]);
  state.countries = Array.isArray(c) ? c : [];
  state.rates = r && r.rates ? r.rates : { USD: 1 };
  const sel = $("homeCurrency");
  sel.innerHTML = Object.keys(state.rates).sort().map(k => `<option value="${k}">${k}</option>`).join("");
  sel.value = state.rates[home()] ? home() : "USD";
  sel.addEventListener("change", () => { try { localStorage.setItem("home", sel.value); } catch {} state.current && renderBudget(state.current); });
}

const flagEmoji = cc => cc ? [...cc.toUpperCase()].map(c => String.fromCodePoint(127397 + c.charCodeAt(0))).join("") : "🌍";

function hueFrom(s) { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; }

async function setBackground(country) {
  const bg = $("bg"), credit = $("credit");
  const hue = hueFrom(country.name.common);
  const fallback = `linear-gradient(160deg,hsl(${hue},60%,32%),hsl(${(hue + 60) % 360},55%,14%))`;
  credit.textContent = "";
  if (!CONFIG.UNSPLASH_API_KEY) { bg.style.backgroundImage = fallback; return; }
  try {
    const q = encodeURIComponent(country.name.common + " landscape");
    const res = await fetch(`https://api.unsplash.com/photos/random?query=${q}&orientation=portrait&client_id=${CONFIG.UNSPLASH_API_KEY}`);
    if (!res.ok) throw new Error(res.status);
    const p = await res.json();
    const url = p.urls.regular;
    await new Promise((ok, no) => { const i = new Image(); i.onload = ok; i.onerror = no; i.src = url; });
    bg.style.backgroundImage = `url(${url})`;
    bg.classList.remove("swap"); void bg.offsetWidth; bg.classList.add("swap");
    if (p.links && p.links.download_location) fetch(`${p.links.download_location}${p.links.download_location.includes('?') ? '&' : '?'}client_id=${CONFIG.UNSPLASH_API_KEY}`).catch(() => {}); // Unsplash requires this download ping
    const u = p.user;
    credit.innerHTML = `Photo by <a href="${u.links.html}?utm_source=wanderlust_roulette&utm_medium=referral" target="_blank" rel="noopener">${u.name}</a> on <a href="https://unsplash.com/?utm_source=wanderlust_roulette&utm_medium=referral" target="_blank" rel="noopener">Unsplash</a>`;
  } catch { bg.style.backgroundImage = fallback; }
}

function renderBudget(c) {
  const cur = Object.entries(c.currencies || {})[0];
  const out = $("budgetText");
  if (!cur || !state.rates) { out.textContent = "Exchange rate unavailable."; return; }
  const h = $("homeCurrency").value, code = cur[0];
  if (!state.rates[h] || !state.rates[code]) { out.textContent = `No live rate for ${code}.`; return; }
  const v = CONFIG.BUDGET_AMOUNT / state.rates[h] * state.rates[code];
  out.textContent = `Budget Check: ${CONFIG.BUDGET_AMOUNT} ${h} = ${fmt(v, v < 10 ? 2 : 0)} ${code}`;
}

function render(c) {
  const cur = Object.entries(c.currencies || {})[0];
  $("flag").textContent = flagEmoji(c.cca2);
  $("name").textContent = c.name.common;
  $("subregion").textContent = c.name.official !== c.name.common ? c.name.official : (c.subregion || "");
  $("capital").textContent = (c.capital || []).join(", ") || "None";
  $("region").textContent = [c.region, c.subregion].filter(Boolean).join(" / ") || "–";
  $("population").textContent = fmt(c.population, 0);
  $("languages").textContent = Object.values(c.languages || {}).join(", ") || "–";
  $("currency").textContent = cur ? `${cur[1].name} (${cur[0]}${cur[1].symbol ? " · " + cur[1].symbol : ""})` : "–";
  $("mapLink").href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(c.name.common);
  renderBudget(c);
  const card = $("card"); card.classList.remove("enter"); void card.offsetWidth; card.classList.add("enter"); card.focus({ preventScroll: true });
  document.title = `${c.name.common} – Wanderlust Roulette`;
}

async function spin() {
  if (state.busy) return;
  if (!state.countries.length) { toast("Countries still loading, hang on…"); return; }
  state.busy = true; state.last = Date.now();
  buzz([60, 40, 60]);
  $("loader").classList.remove("hidden"); $("spinBtn").classList.add("busy");
  let c; do { c = state.countries[Math.floor(Math.random() * state.countries.length)]; } while (state.countries.length > 1 && state.current && c.cca2 === state.current.cca2);
  const minWait = new Promise(r => setTimeout(r, 900));
  await Promise.all([setBackground(c), minWait]);
  state.current = c; render(c);
  $("loader").classList.add("hidden"); $("app").classList.remove("hidden"); $("spinBtn").classList.remove("hidden"); $("spinBtn").classList.remove("busy");
  buzz(120);
  try { history.replaceState(null, "", "#" + encodeURIComponent(c.name.common)); } catch {}
  state.busy = false;
}

function onMotion(e) {
  const a = e.accelerationIncludingGravity; if (!a) return;
  const p = state.lastAcc; state.lastAcc = { x: a.x || 0, y: a.y || 0, z: a.z || 0 };
  if (!p) return;
  const d = Math.abs(state.lastAcc.x - p.x) + Math.abs(state.lastAcc.y - p.y) + Math.abs(state.lastAcc.z - p.z);
  if (d > CONFIG.SHAKE_THRESHOLD && Date.now() - state.last > CONFIG.SHAKE_COOLDOWN_MS) {
    document.body.classList.add("shake"); setTimeout(() => document.body.classList.remove("shake"), 500);
    spin();
  }
}

async function enableShake() {
  if (state.listening || typeof DeviceMotionEvent === "undefined") return;
  try {
    if (typeof DeviceMotionEvent.requestPermission === "function") {
      const r = await DeviceMotionEvent.requestPermission();
      if (r !== "granted") { toast("Motion denied. Use the Spin button instead."); return; }
    }
    window.addEventListener("devicemotion", onMotion); state.listening = true;
  } catch { toast("Shake unavailable. Use the Spin button."); }
}

async function share() {
  const c = state.current; if (!c) return;
  const data = { title: "Wanderlust Roulette", text: `I rolled ${flagEmoji(c.cca2)} ${c.name.common}! Where will you land?`, url: location.href };
  try {
    if (navigator.share) await navigator.share(data);
    else { await navigator.clipboard.writeText(`${data.text} ${data.url}`); toast("Link copied!"); }
  } catch {}
}

window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); state.deferredPrompt = e; $("installBtn").classList.remove("hidden"); });
window.addEventListener("appinstalled", () => { $("installBtn").classList.add("hidden"); toast("Installed. See you on your home screen!"); });
$("installBtn").addEventListener("click", async () => {
  const p = state.deferredPrompt; if (!p) return;
  p.prompt(); await p.userChoice; state.deferredPrompt = null; $("installBtn").classList.add("hidden");
});

$("startBtn").addEventListener("click", async () => {
  const b = $("startBtn"); b.disabled = true; b.textContent = "Warming up the globe…";
  await enableShake();   // must run inside the tap for iOS 13+
  $("welcome").classList.add("hidden");
  $("loader").classList.remove("hidden");
  try { await loadData(); } catch { $("loader").classList.add("hidden"); $("welcome").classList.remove("hidden"); b.disabled = false; b.textContent = "Tap to Start Roulette"; toast("Couldn't reach the country data. Check your connection."); return; }
  spin();
});
$("spinBtn").addEventListener("click", spin);
$("shareBtn").addEventListener("click", share);
document.addEventListener("keydown", e => { if (e.code === "Space" && $("welcome").classList.contains("hidden") && e.target.tagName !== "SELECT") { e.preventDefault(); spin(); } });

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
