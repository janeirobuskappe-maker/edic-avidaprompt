/* EDIc avidaPROMPT IA — Éditeur visuel
   Construit un prompt en blocs. Par Darcy · MIT */

import { t } from "./i18n.js";

/* ── MODÈLE DE BLOCS ── */
const BLOCK_TYPES = {
  trigger: { icon: "🎬", label: "TRIGGER", placeholder: "Sujet entrant : [QUESTION]" },
  logic:   { icon: "🧠", label: "LOGIC",   placeholder: "Rôle et contraintes : Expert en [DOMAINE]" },
  action:  { icon: "🔍", label: "ACTION",  placeholder: "Vérification : marquer [FAIT][INCONNU]" },
  output:  { icon: "📤", label: "OUTPUT",  placeholder: "Format : Markdown structuré" }
};

let blocks = [
  { id: 1, type: "trigger", value: "Sujet entrant : [QUESTION]" },
  { id: 2, type: "logic",   value: "Rôle : Expert en [DOMAINE], non-complaisant" },
  { id: 3, type: "action",  value: "Marquer : [FAIT][PROBABLE][SPÉCULATIF][INCONNU]" },
  { id: 4, type: "output",  value: "Format : Markdown structuré" }
];

let nextId = 5;

/* ── RENDU ── */
export function renderEditor() {
  return `
    <div class="topbar">
      <h1 class="topbar__title">🧪 Éditeur de script</h1>
      <div class="topbar__actions">
        <button class="btn btn--ghost" id="editor-reset">↺</button>
        <button class="btn btn--primary" id="editor-save">💾 ${t("btn.save")}</button>
      </div>
    </div>

    <div class="editor">
      <div class="editor__canvas" id="editor-canvas">
        ${blocks.map(renderBlock).join('<div class="editor__arrow">▼</div>')}
        <button class="btn btn--ghost" id="editor-add" style="margin-top:var(--s-4);align-self:flex-start;">+ Bloc</button>
      </div>

      <div class="preview">
        <div class="preview__head">
          <span class="preview__title">Aperçu du prompt généré</span>
          <button class="btn btn--ghost" id="editor-copy" style="padding:4px 10px;font-size:11px;">📋 Copier</button>
        </div>
        <div class="preview__body" id="editor-preview"></div>
      </div>
    </div>
  `;
}

function renderBlock(b) {
  const meta = BLOCK_TYPES[b.type];
  return `
    <div class="editor__block" data-id="${b.id}" data-type="${b.type}">
      <span class="editor__block-icon">${meta.icon}</span>
      <div class="editor__block-body">
        <div class="editor__block-label">${meta.label}</div>
        <input class="editor__block-input" value="${escapeAttr(b.value)}"
               data-block-input="${b.id}" />
      </div>
      <div class="editor__block-actions">
        <button class="btn btn--icon" data-mic="${b.id}" title="Dicter à la voix">🎤</button>
        <button class="btn btn--icon" data-remove="${b.id}" title="Supprimer">✕</button>
      </div>
    </div>
  `;
}

function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/* ── DICTÉE VOCALE (Web Speech API) ──
   Fonctionne dans Chrome/Edge (navigator.webkitSpeechRecognition).
   Non supporté par Firefox/Safari : on prévient l'utilisateur sans casser l'app. */
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
let activeRecognition = null;
let activeMicId = null;

function startDictation(blockId, micBtn) {
  if (!SpeechRecognitionAPI) {
    alert("La dictée vocale n'est pas prise en charge par ce navigateur (essayez Chrome ou Edge).");
    return;
  }

  // Si ce micro était déjà en train d'enregistrer, on arrête.
  if (activeRecognition && activeMicId === blockId) {
    activeRecognition.stop();
    return;
  }
  // Si un autre micro tournait, on l'arrête d'abord.
  if (activeRecognition) activeRecognition.stop();

  const recognition = new SpeechRecognitionAPI();
  recognition.lang = document.documentElement.lang === "en" ? "en-US" : "fr-FR";
  recognition.continuous = true;
  recognition.interimResults = true;

  const input = document.querySelector(`[data-block-input="${blockId}"]`);
  const baseValue = input ? input.value : "";
  let finalTranscript = "";

  activeRecognition = recognition;
  activeMicId = blockId;
  micBtn.classList.add("mic--recording");
  micBtn.textContent = "⏺";

  recognition.onresult = e => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const chunk = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalTranscript += chunk;
      else interim += chunk;
    }
    if (input) {
      input.value = (baseValue + " " + finalTranscript + interim).trim();
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  };

  recognition.onerror = () => {
    micBtn.classList.remove("mic--recording");
    micBtn.textContent = "🎤";
    activeRecognition = null;
    activeMicId = null;
  };

  recognition.onend = () => {
    micBtn.classList.remove("mic--recording");
    micBtn.textContent = "🎤";
    activeRecognition = null;
    activeMicId = null;
  };

  recognition.start();
}

/* ── GÉNÉRATION DU PROMPT ── */
export function generatePrompt() {
  const parts = [];
  blocks.forEach(b => {
    if (b.type === "trigger") parts.push(`<task>${b.value}</task>`);
    else if (b.type === "logic") parts.push(`<role>${b.value}</role>`);
    else if (b.type === "action") parts.push(`<protocol>${b.value}</protocol>`);
    else if (b.type === "output") parts.push(`<output>${b.value}</output>`);
  });
  return parts.join("\n");
}

function renderPreview() {
  const raw = generatePrompt();
  const html = raw
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/(&lt;\/?[a-z]+&gt;)/g, '<span class="tag">$1</span>')
    .replace(/(\[[A-ZÀ-Ÿ_]+\])/g, '<span class="variable">$1</span>');
  const el = document.getElementById("editor-preview");
  if (el) el.innerHTML = html;
}

/* ── COPIE PRESSE-PAPIER (avec repli pour file:// / contextes non sécurisés) ──
   navigator.clipboard exige HTTPS ou localhost. En ouverture directe du fichier
   (file://), comme le recommande le README, elle est indisponible : on retombe
   sur execCommand via un textarea invisible, qui fonctionne dans ce cas. */
async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch { /* on tente le repli ci-dessous */ }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
export function bindEditor() {
  const canvas = document.getElementById("editor-canvas");
  if (!canvas) return;

  // Saisie
  canvas.addEventListener("input", e => {
    const id = e.target.dataset.blockInput;
    if (!id) return;
    const b = blocks.find(x => x.id == id);
    if (b) { b.value = e.target.value; renderPreview(); }
  });

  // Supprimer
  canvas.addEventListener("click", e => {
    const removeId = e.target.dataset.remove;
    if (removeId) {
      blocks = blocks.filter(b => b.id != removeId);
      refreshCanvas();
      return;
    }
    const micId = e.target.dataset.mic;
    if (micId) {
      startDictation(micId, e.target);
    }
  });

  // Ajouter
  document.getElementById("editor-add")?.addEventListener("click", () => {
    const type = prompt("Type de bloc ? (trigger / logic / action / output)", "action");
    if (!BLOCK_TYPES[type]) return alert("Type invalide");
    blocks.push({ id: nextId++, type, value: BLOCK_TYPES[type].placeholder });
    refreshCanvas();
  });

  // Reset
  document.getElementById("editor-reset")?.addEventListener("click", () => {
    if (!confirm("Réinitialiser l'éditeur ?")) return;
    blocks = [
      { id: 1, type: "trigger", value: "Sujet entrant : [QUESTION]" },
      { id: 2, type: "logic",   value: "Rôle : Expert en [DOMAINE], non-complaisant" },
      { id: 3, type: "action",  value: "Marquer : [FAIT][PROBABLE][SPÉCULATIF][INCONNU]" },
      { id: 4, type: "output",  value: "Format : Markdown structuré" }
    ];
    nextId = 5;
    refreshCanvas();
  });

  // Copier
  document.getElementById("editor-copy")?.addEventListener("click", async () => {
    const ok = await copyToClipboard(generatePrompt());
    const btn = document.getElementById("editor-copy");
    const old = btn.textContent;
    btn.textContent = ok ? "✓ Copié" : "❌ Copie impossible";
    setTimeout(() => btn.textContent = old, 1500);
  });

  // Sauvegarder
  document.getElementById("editor-save")?.addEventListener("click", () => {
    const title = prompt("Nom du script :", "mon-script");
    if (!title) return;
    const zone = prompt("Zone ? (lab / sec / dev / mind / doc)", "lab");
    if (!["lab","sec","dev","mind","doc"].includes(zone)) return alert("Zone invalide");

    window.dispatchEvent(new CustomEvent("edic:save-script", {
      detail: {
        id: title.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now(),
        zone, title,
        desc: blocks[1]?.value.slice(0, 80) || "Script personnalisé",
        score: 7,
        date: new Date().toISOString().slice(0, 10),
        prompt: generatePrompt()
      }
    }));
    alert("Script sauvegardé. Visible dans la zone " + zone);
  });

  renderPreview();
}

function refreshCanvas() {
  const canvas = document.getElementById("editor-canvas");
  if (!canvas) return;
  const addBtn = `<button class="btn btn--ghost" id="editor-add" style="margin-top:var(--s-4);align-self:flex-start;">+ Bloc</button>`;
  canvas.innerHTML = blocks.map(renderBlock).join('<div class="editor__arrow">▼</div>') + addBtn;
  bindEditorOnce();
  renderPreview();
}

function bindEditorOnce() {
  // Évite les doublons : on rebranche seulement le bouton ajouté
  document.getElementById("editor-add")?.addEventListener("click", () => {
    const type = prompt("Type de bloc ? (trigger / logic / action / output)", "action");
    if (!BLOCK_TYPES[type]) return alert("Type invalide");
    blocks.push({ id: nextId++, type, value: BLOCK_TYPES[type].placeholder });
    refreshCanvas();
  });
}