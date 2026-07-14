import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";

// Le WebSocket temps reel tourne cote RUST (thread natif, jamais gele par le hide
// de fenetre). Le frontend ne fait qu'ecouter les events pousses par le backend :
//   "clip-received" -> un clip chiffre a rattraper, "ws-status" -> etat de la co.

// --- Types ---
interface FrontendConfig {
  server_url: string;
  device_id: string;
  device_token: string;
  user_id: number;
  reverb_app_key: string;
  reverb_host: string;
  reverb_port: number;
  reverb_scheme: string;
}
interface RawClip {
  id: string;
  origin_device_id: string;
  kind?: string;
  blob_id?: string | null;
  ciphertext: string;
  nonce: string;
  is_sensitive: boolean;
  created_at: string;
}
interface Clip {
  id: string;
  origin_device_id: string;
  kind: "text" | "image";
  text: string;
  imageB64?: string;
  is_sensitive: boolean;
  created_at: string;
  mine: boolean;
}

// --- Icons (SVG stroke, Lucide-like, currentColor) ---
const icon = {
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`,
  mac: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>`,
  remote: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  clip: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>`,
};

// --- Illustrations onboarding (SVG + anim CSS) ---
const illuSync = `
  <svg viewBox="0 0 220 120" fill="none">
    <rect x="16" y="34" width="70" height="46" rx="7" stroke="var(--accent)" stroke-width="2.5"/>
    <path d="M34 88h34" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="150" y="26" width="42" height="66" rx="8" stroke="var(--accent)" stroke-width="2.5"/>
    <path d="M167 82h8" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/>
    <path class="sync-line" d="M92 57h52" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="4 6"/>
    <circle class="sync-dot" cx="0" cy="57" r="5" fill="var(--accent)"/>
  </svg>`;
const illuServer = `
  <svg viewBox="0 0 160 120" fill="none">
    <circle class="pulse-ring" cx="80" cy="60" r="30" stroke="var(--accent)" stroke-width="2"/>
    <rect x="52" y="40" width="56" height="16" rx="4" stroke="var(--accent)" stroke-width="2.5"/>
    <rect x="52" y="64" width="56" height="16" rx="4" stroke="var(--accent)" stroke-width="2.5"/>
    <circle cx="62" cy="48" r="2.2" fill="var(--accent)"/>
    <circle cx="62" cy="72" r="2.2" fill="var(--accent)"/>
  </svg>`;
const illuDevice = `
  <svg viewBox="0 0 160 120" fill="none">
    <rect x="40" y="34" width="80" height="52" rx="8" stroke="var(--accent)" stroke-width="2.5"/>
    <path d="M62 96h36" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/>
    <path class="check-draw" d="M66 60l9 9 16-18" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
const illuLock = `
  <svg viewBox="0 0 160 120" fill="none">
    <circle class="pulse-ring" cx="80" cy="62" r="34" stroke="var(--accent)" stroke-width="2"/>
    <path d="M80 30l26 10v16c0 18-13 28-26 34-13-6-26-16-26-34V40z" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M80 56v10" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="80" cy="72" r="2.6" fill="var(--accent)"/>
  </svg>`;

const app = document.querySelector<HTMLDivElement>("#app")!;
let config: FrontendConfig | null = null;
let clips: Clip[] = [];
let filtered: Clip[] = [];
let search = "";
let selected = 0;
let view: "history" | "settings" | "onboarding" = "history";
let soundOn = localStorage.getItem("clipd_sound") !== "off";
// Cards masquées (contenu caché sur place), local à ce Mac. Ne supprime rien.
let hidden: Set<string> = new Set(JSON.parse(localStorage.getItem("clipd_hidden") || "[]"));

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// --- Bootstrap ---
async function main() {
  const configured = await invoke<boolean>("is_configured");
  if (!configured) {
    renderOnboarding();
  } else {
    await startHistory();
  }
  // Refocus + reset a chaque ouverture (hotkey / tray).
  getCurrentWindow().listen("tauri://focus", () => {
    if (view === "history") {
      selected = 0;
      focusSearch();
      renderList();
      // Fenetre reouverte : le WS Rust n'a jamais coupe, mais on resync l'historique
      // par securite (rattrape tout clip arrive pendant que la webview etait gelee).
      if (config) loadHistory();
    }
  });
}

// --- Onboarding (wizard multi-étapes) ---
const onboard = {
  step: 0, server: "", email: "", password: "", passphrase: "",
  mode: "register" as "register" | "login",
  error: "", busy: false,
};
const OB_STEPS = 4;

function stepContent(step: number): { illu: string; title: string; sub: string; body: string; cta: string } {
  switch (step) {
    case 0:
      return {
        illu: illuSync,
        title: "Ton presse-papier,<br/>partout.",
        sub: "Copie sur ton téléphone, colle sur ton Mac. Chiffré de bout en bout, sur ton propre serveur.",
        body: "",
        cta: "Commencer",
      };
    case 1:
      return {
        illu: illuServer,
        title: "Ton serveur",
        sub: "L'adresse de ton instance Clipd. C'est le seul point de rendez-vous — il ne voit jamais tes données en clair.",
        body: `<input id="ob-input" class="ob-field" placeholder="https://clipd.exemple.com" spellcheck="false" autocomplete="off" value="${escapeHtml(onboard.server)}" />`,
        cta: "Continuer",
      };
    case 2:
      return {
        illu: illuDevice,
        title: onboard.mode === "register" ? "Crée ton compte" : "Connecte-toi",
        sub: "Ton compte relie tous tes appareils. Historique isolé, rien que le tien.",
        body: `
          <input id="ob-input" class="ob-field" type="email" placeholder="Email" spellcheck="false" autocomplete="off" value="${escapeHtml(onboard.email)}" />
          <input id="ob-input2" class="ob-field" type="password" placeholder="Mot de passe" autocomplete="off" value="${escapeHtml(onboard.password)}" />
          <div class="ob-hint">${onboard.mode === "register" ? "Déjà un compte ?" : "Pas de compte ?"} <a id="ob-toggle" href="#">${onboard.mode === "register" ? "Se connecter" : "Créer un compte"}</a></div>`,
        cta: "Continuer",
      };
    default:
      return {
        illu: illuLock,
        title: "La clé secrète",
        sub: "Une passphrase que tu tapes sur chacun de tes appareils. Elle chiffre tout et ne quitte jamais ce Mac.",
        body: `<input id="ob-input" class="ob-field" type="password" placeholder="Passphrase partagée" autocomplete="off" value="${escapeHtml(onboard.passphrase)}" />`,
        cta: onboard.busy ? "Connexion…" : "Terminer",
      };
  }
}

function renderOnboarding() {
  view = "onboarding";
  const s = stepContent(onboard.step);
  const dots = Array.from({ length: OB_STEPS }, (_, i) =>
    `<span class="ob-dot${i === onboard.step ? " on" : ""}${i < onboard.step ? " done" : ""}"></span>`
  ).join("");

  app.innerHTML = `
    <div class="panel onboarding">
      <div class="ob-top">
        ${onboard.step > 0 ? `<button id="ob-back" class="ghost" aria-label="Retour">${icon.back}</button>` : `<span class="ob-brand"><span class="dot"></span> Clipd</span>`}
        <div class="ob-dots">${dots}</div>
        <span style="width:32px"></span>
      </div>
      <div class="ob-body" id="ob-card">
        <div class="ob-illu">${s.illu}</div>
        <h1 class="ob-title">${s.title}</h1>
        <p class="ob-sub">${s.sub}</p>
        <div class="ob-fields">${s.body}</div>
        ${onboard.error ? `<div class="error">${escapeHtml(onboard.error)}</div>` : ""}
      </div>
      <div class="ob-foot">
        <button id="ob-next" class="primary"${onboard.busy ? " disabled" : ""}>${s.cta}</button>
      </div>
    </div>`;

  document.querySelector("#ob-next")!.addEventListener("click", obNext);
  document.querySelector("#ob-back")?.addEventListener("click", () => { onboard.error = ""; onboard.step--; renderOnboarding(); });
  document.querySelector("#ob-toggle")?.addEventListener("click", (e) => {
    e.preventDefault();
    onboard.email = (document.querySelector<HTMLInputElement>("#ob-input")?.value || "").trim();
    onboard.password = document.querySelector<HTMLInputElement>("#ob-input2")?.value || "";
    onboard.mode = onboard.mode === "register" ? "login" : "register";
    renderOnboarding();
  });
  requestAnimationFrame(() => document.querySelector<HTMLInputElement>("#ob-input")?.focus());
}

async function obNext() {
  onboard.error = "";
  const v = (id: string) => (document.querySelector<HTMLInputElement>("#" + id)?.value || "").trim();

  if (onboard.step === 1) {
    const s = v("ob-input").replace(/\/+$/, "");
    if (!s) return setObError("Renseigne l'adresse du serveur.");
    onboard.server = s;
  } else if (onboard.step === 2) {
    const email = v("ob-input");
    const pw = document.querySelector<HTMLInputElement>("#ob-input2")?.value || "";
    if (!email || !pw) return setObError("Email et mot de passe requis.");
    onboard.email = email;
    onboard.password = pw;
  } else if (onboard.step === 3) {
    const p = document.querySelector<HTMLInputElement>("#ob-input")!.value || "";
    if (!p) return setObError("La passphrase est requise.");
    onboard.passphrase = p;
    return doPair();
  }
  onboard.step++;
  renderOnboarding();
}

function setObError(msg: string) {
  onboard.error = msg;
  renderOnboarding();
}

async function doPair() {
  onboard.busy = true;
  renderOnboarding();
  try {
    const deviceId = crypto.randomUUID();
    const res = await fetch(`${onboard.server}/api/${onboard.mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        email: onboard.email, password: onboard.password,
        device_id: deviceId, device_name: "Desktop", platform: "macos",
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = body?.message || (res.status === 422 ? "identifiants invalides" : `erreur ${res.status}`);
      throw new Error(msg);
    }
    const r = await res.json();
    await invoke("setup", {
      serverUrl: onboard.server, deviceId, deviceToken: r.token, userId: r.user_id,
      passphrase: onboard.passphrase,
      reverbAppKey: r.reverb_app_key, reverbHost: r.reverb_host,
      reverbPort: r.reverb_port, reverbScheme: r.reverb_scheme,
    });
    onboard.busy = false;
    await startHistory();
  } catch (e: any) {
    onboard.busy = false;
    onboard.step = 3;
    setObError(`Échec : ${e.message ?? e}`);
  }
}

// --- History ---
async function startHistory() {
  config = await invoke<FrontendConfig>("get_config");
  renderHistory();
  await loadHistory();
  await setupRealtimeListeners();
}

async function loadHistory() {
  try {
    const res = await fetch(`${config!.server_url}/api/clips`, {
      headers: { Authorization: `Bearer ${config!.device_token}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const body = await res.json();
    const raws: RawClip[] = body.data ?? [];
    clips = [];
    for (const raw of raws) {
      const c = await decryptRaw(raw);
      if (c) clips.push(c);
    }
    renderList();
  } catch (e) {
    console.error("loadHistory", e);
  }
}

async function decryptRaw(raw: RawClip): Promise<Clip | null> {
  try {
    const text = await invoke<string>("decrypt_clip", { ciphertext: raw.ciphertext, nonce: raw.nonce });
    const isImage = raw.kind === "image" && !!raw.blob_id;
    let imageB64: string | undefined;
    if (isImage) {
      try { imageB64 = await invoke<string>("fetch_image", { blobId: raw.blob_id }); }
      catch (e) { console.error("fetch_image", raw.id, e); return null; }
    }
    return {
      id: raw.id, origin_device_id: raw.origin_device_id,
      kind: isImage ? "image" : "text", text, imageB64,
      is_sensitive: raw.is_sensitive, created_at: raw.created_at,
      mine: raw.origin_device_id === config!.device_id,
    };
  } catch (e) {
    console.error("decrypt", raw.id, e);
    return null;
  }
}

function setWsStatus(state: "connecting" | "connected" | "error") {
  const dot = document.querySelector<HTMLSpanElement>("#ws-dot");
  if (dot) { dot.className = `ws-dot ${state}`; dot.title = "WebSocket : " + state; }
}

// Le WS vit cote Rust : on s'abonne une seule fois aux events pousses par le backend.
let realtimeReady = false;
async function setupRealtimeListeners() {
  if (realtimeReady) return;
  realtimeReady = true;

  // Etat de la co (dot dans le footer) pilote par le thread Rust.
  await listen<string>("ws-status", (e) => {
    const s = e.payload;
    setWsStatus(s === "connected" ? "connected" : s === "error" ? "error" : "connecting");
  });

  // Nouveau clip pousse par le backend : dechiffre + affiche (anti-echo/dedup deja
  // fait cote Rust pour l'echo, on rededup ici par securite).
  await listen<RawClip>("clip-received", async (e) => {
    const raw = e.payload;
    if (!config || raw.origin_device_id === config.device_id) return;
    if (clips.some((x) => x.id === raw.id)) return;
    const clip = await decryptRaw(raw);
    if (!clip) return;
    clips.unshift(clip);
    if (soundOn) pop();
    renderList(clip.id);
  });

  // Clips supprimes cote serveur (cap/TTL) : retire-les de la liste, live.
  await listen<string[]>("clips-deleted", (e) => {
    const ids = new Set(e.payload ?? []);
    if (!ids.size) return;
    const before = clips.length;
    clips = clips.filter((c) => !ids.has(c.id));
    if (clips.length !== before) renderList();
  });
}

// --- Render: history shell ---
function renderHistory() {
  view = "history";
  app.innerHTML = `
    <div class="panel history">
      <header data-tauri-drag-region>
        <div class="search-wrap">
          <span class="search-icon">${icon.search}</span>
          <input id="search" placeholder="Rechercher…" autocomplete="off" spellcheck="false" />
        </div>
        <button id="settings-btn" class="ghost" title="Réglages" aria-label="Réglages">${icon.gear}</button>
      </header>
      <div id="list" class="list"></div>
      <footer>
        <span class="hint"><kbd>↑</kbd><kbd>↓</kbd> naviguer</span>
        <span class="hint"><kbd>↵</kbd> copier</span>
        <span class="hint"><kbd>esc</kbd> fermer</span>
        <span class="hint" style="margin-left:auto"><span id="ws-dot" class="ws-dot connecting"></span></span>
      </footer>
    </div>`;
  const s = document.querySelector<HTMLInputElement>("#search")!;
  s.addEventListener("input", () => {
    search = s.value.toLowerCase();
    selected = 0;
    renderList();
  });
  document.querySelector("#settings-btn")!.addEventListener("click", renderSettings);
  focusSearch();
}

function renderList(freshId?: string) {
  const list = document.querySelector<HTMLDivElement>("#list");
  if (!list) return;
  filtered = search ? clips.filter((c) => c.text.toLowerCase().includes(search)) : clips;
  if (selected >= filtered.length) selected = Math.max(0, filtered.length - 1);

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty">${icon.clip}<p>${search ? "Aucun résultat." : "Rien pour l'instant."}</p><span>Copie sur un appareil → ça arrive ici.</span></div>`;
    return;
  }
  list.innerHTML = filtered.map((c, i) => cardHtml(c, i, c.id === freshId)).join("");
  list.querySelectorAll<HTMLDivElement>(".card").forEach((el) => {
    const i = Number(el.dataset.i);
    if (el.classList.contains("masked")) {
      el.addEventListener("click", () => toggleHide(el.dataset.id!)); // clic = révéler
      return;
    }
    el.addEventListener("click", () => { selected = i; commitSelected(); });
    el.addEventListener("mousemove", () => { if (selected !== i) { selected = i; paintSelection(); } });
  });
  list.querySelectorAll<HTMLButtonElement>(".card-del").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); removeClip(btn.dataset.del!); });
  });
  list.querySelectorAll<HTMLButtonElement>(".card-hide").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); toggleHide(btn.dataset.hide!); });
  });
  paintSelection();
}

// Supprime un clip : retire local direct (optimiste) + DELETE serveur. Le broadcast
// clips.deleted revient et retire aussi les autres appareils (idempotent ici).
async function removeClip(id: string) {
  clips = clips.filter((c) => c.id !== id);
  renderList();
  try {
    const res = await fetch(`${config!.server_url}/api/clip/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${config!.device_token}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`${res.status}`);
  } catch (e) {
    console.error("delete clip", e);
    loadHistory(); // resync si l'appel a échoué
  }
}

function deleteSelected() {
  const clip = filtered[selected];
  if (clip) removeClip(clip.id);
}

// Masque / démasque le contenu d'une card sur place (persistant, local).
function toggleHide(id: string) {
  if (hidden.has(id)) hidden.delete(id); else hidden.add(id);
  localStorage.setItem("clipd_hidden", JSON.stringify([...hidden]));
  renderList();
}

function cardHtml(c: Clip, i: number, fresh: boolean): string {
  const delay = reduceMotion ? 0 : Math.min(i, 8) * 28;
  const masked = hidden.has(c.id);

  const src = c.mine
    ? `<span class="src">${icon.mac} ce Mac</span>`
    : `<span class="src">${icon.remote} reçu</span>`;
  const badge = c.is_sensitive ? `<span class="badge">${icon.shield} sensible</span>` : "";
  const body = c.kind === "image" && c.imageB64
    ? `<img class="card-img" src="data:image/png;base64,${c.imageB64}" alt="image" />`
    : `<div class="card-text">${escapeHtml(c.text.length > 200 ? c.text.slice(0, 200) + "…" : c.text)}</div>`;

  // Masqué : contenu flouté + voile avec oeil pour révéler.
  const actions = masked ? "" : `
      <div class="card-actions">
        <button class="card-hide" data-hide="${c.id}" title="Masquer" aria-label="Masquer">${icon.eyeOff}</button>
        <button class="card-del" data-del="${c.id}" title="Supprimer (⌘⌫)" aria-label="Supprimer">✕</button>
      </div>`;
  const overlay = masked ? `<div class="reveal-overlay" data-reveal="${c.id}" title="Afficher"><span class="reveal-badge">${icon.eye}</span></div>` : "";

  return `
    <div class="card${fresh ? " fresh" : ""}${masked ? " masked" : ""}" data-i="${i}" data-id="${c.id}" style="animation-delay:${delay}ms">
      ${actions}
      ${body}
      <div class="card-meta">${src}${badge}<span class="time">${relativeTime(c.created_at)}</span></div>
      ${overlay}
    </div>`;
}

function paintSelection() {
  document.querySelectorAll<HTMLDivElement>(".card").forEach((el) => {
    el.classList.toggle("sel", Number(el.dataset.i) === selected);
  });
  const cur = document.querySelector<HTMLDivElement>(".card.sel");
  cur?.scrollIntoView({ block: "nearest" });
}

async function commitSelected() {
  const clip = filtered[selected];
  if (!clip) return;
  document.querySelectorAll(".card.copied").forEach((c) => c.classList.remove("copied"));
  const el = document.querySelector<HTMLDivElement>(`.card[data-i="${selected}"]`);
  el?.classList.add("copied");
  setTimeout(() => el?.classList.remove("copied"), 900);
  if (clip.kind === "image" && clip.imageB64) {
    await invoke("copy_image", { pngB64: clip.imageB64 });
    showToast("Image copiée");
  } else {
    await invoke("copy_to_clipboard", { text: clip.text });
    showToast("Copié");
  }
  // On ne ferme JAMAIS la fenêtre sur copie.
}

function showToast(msg: string) {
  let t = document.querySelector<HTMLDivElement>("#toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout((t as any)._timer);
  (t as any)._timer = setTimeout(() => t!.classList.remove("show"), 1400);
}

// --- Settings (uniquement une fois appairé) ---
function renderSettings() {
  view = "settings";
  const c = config!;
  app.innerHTML = `
    <div class="panel settings">
      <header>
        <button id="back-btn" class="ghost" title="Retour" aria-label="Retour">${icon.back}</button>
        <div class="title">Réglages</div>
      </header>
      <div class="settings-body">

        <div class="group">
          <div class="group-title">Connexion</div>
          <div class="group-card">
            <div class="row"><span class="label">Serveur</span><span class="val">${escapeHtml(c.server_url)}</span></div>
            <div class="row"><span class="label">Cet appareil</span><span class="val">${escapeHtml(c.device_id.slice(0, 8))}…</span></div>
          </div>
        </div>

        <div class="group">
          <div class="group-title">Préférences</div>
          <div class="group-card">
            <div class="row">
              <div class="row-col">
                <span class="label">Son à l'arrivée d'un clip</span>
                <span class="sub">Petit « pop » quand un clip arrive</span>
              </div>
              <label class="switch">
                <input type="checkbox" id="sound" ${soundOn ? "checked" : ""} />
                <span class="track"></span>
              </label>
            </div>
          </div>
        </div>

        <div class="group">
          <div class="group-title">Sécurité</div>
          <div class="group-card">
            <div class="note-row">${icon.shield}<span>Les copies marquées sensibles (mots de passe) sont ignorées automatiquement — jamais chiffrées ni envoyées.</span></div>
            <div class="note-row" style="border-top:1px solid var(--border)">${icon.clip}<span>Historique : 24 h ou 100 derniers clips. Le serveur ne voit que du contenu chiffré.</span></div>
          </div>
        </div>

        <button id="unpair" class="danger-btn">Désappairer ce Mac</button>
      </div>
    </div>`;

  document.querySelector("#back-btn")!.addEventListener("click", goBackFromSettings);
  document.querySelector<HTMLInputElement>("#sound")!.addEventListener("change", (e) => {
    soundOn = (e.target as HTMLInputElement).checked;
    localStorage.setItem("clipd_sound", soundOn ? "on" : "off");
    if (soundOn) pop();
  });
  document.querySelector("#unpair")!.addEventListener("click", async () => {
    if (confirm("Désappairer ? Il faudra te reconnecter.")) {
      await invoke("unpair");
      config = null;
      clips = [];
      onboard.step = 0; onboard.server = ""; onboard.email = ""; onboard.password = ""; onboard.passphrase = ""; onboard.error = "";
      renderOnboarding();
    }
  });
}

function goBackFromSettings() {
  renderHistory();
  renderList();
}

// --- Global keyboard (Raycast-like) ---
document.addEventListener("keydown", (e) => {
  if (view === "onboarding") {
    if (e.key === "Enter") { e.preventDefault(); if (!onboard.busy) obNext(); }
    else if (e.key === "Escape") {
      if (onboard.step > 0) { onboard.error = ""; onboard.step--; renderOnboarding(); }
      else invoke("hide_window");
    }
    return;
  }
  if (view === "settings") {
    if (e.key === "Escape") goBackFromSettings();
    return;
  }
  if (view !== "history" || !document.querySelector("#list")) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    selected = Math.min(selected + 1, filtered.length - 1);
    paintSelection();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    selected = Math.max(selected - 1, 0);
    paintSelection();
  } else if (e.key === "Enter") {
    e.preventDefault();
    commitSelected();
  } else if (e.key === "Escape") {
    const s = document.querySelector<HTMLInputElement>("#search");
    if (s && s.value) { s.value = ""; search = ""; selected = 0; renderList(); }
    else invoke("hide_window");
  } else if (e.key === "," && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    renderSettings();
  } else if (e.key === "Backspace" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    deleteSelected();
  }
});

// --- Utils ---
function focusSearch() {
  requestAnimationFrame(() => document.querySelector<HTMLInputElement>("#search")?.focus());
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function relativeTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return "à l'instant";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} j`;
}

// Petit "pop" synthetise (WebAudio), sans fichier asset.
let actx: AudioContext | null = null;
function pop() {
  try {
    actx = actx || new AudioContext();
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.connect(g); g.connect(actx.destination);
    o.frequency.setValueAtTime(880, actx.currentTime);
    o.frequency.exponentialRampToValueAtTime(1320, actx.currentTime + 0.06);
    g.gain.setValueAtTime(0.0001, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, actx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.12);
    o.start(); o.stop(actx.currentTime + 0.13);
  } catch {}
}

main();
