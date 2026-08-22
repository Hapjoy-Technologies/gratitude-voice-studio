const MODAL_BASE_URL = "https://diksangisomu215--omnivoice-web-studio-web-app.modal.run";
const STORAGE_KEY = "gratitude-voice-studio-folders-v1";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let accessCode = sessionStorage.getItem("gratitude-voice-access") || "";
let folders = loadFolders();
let selectedFolderId = localStorage.getItem("gratitude-voice-selected-folder") || folders[0]?.id || null;
let affirmations = [];
let voices = [];
let selectedVoiceId = null;
let customMode = false;
let activeAudio = null;
let resultUrl = null;

function loadFolders() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (_) {
    return [];
  }
}

function saveFolders() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(folders));
  if (selectedFolderId) localStorage.setItem("gratitude-voice-selected-folder", selectedFolderId);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[character]);
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0,2).map((part) => part[0]).join("").toUpperCase();
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (accessCode) headers.set("X-Access-Token", accessCode);
  const response = await fetch(`${MODAL_BASE_URL}${path}`, {...options, headers});
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try { message = (await response.json()).detail || message; } catch (_) {}
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return response;
}

function showApp() {
  $("#login-screen").hidden = true;
  $("#app-shell").hidden = false;
  renderFolders();
  loadVoices();
}

function showView(name) {
  $("#library-view").hidden = name !== "library";
  $("#generate-view").hidden = name !== "generate";
  $$(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
  if (name === "generate") renderFolderSelect();
  location.hash = name;
}

async function verifyLogin(event) {
  event?.preventDefault();
  const code = $("#access-code").value.trim();
  const button = $("#login-button");
  $("#login-error").textContent = "";
  button.disabled = true;
  button.textContent = "Checking…";
  accessCode = code;
  try {
    await api("/api/auth/check", {cache:"no-store"});
    sessionStorage.setItem("gratitude-voice-access", code);
    showApp();
  } catch (error) {
    accessCode = "";
    $("#login-error").textContent = error.message || "Incorrect access code.";
  } finally {
    button.disabled = false;
    button.textContent = "Sign in";
  }
}

function renderFolders() {
  if (selectedFolderId && !folders.some((folder) => folder.id === selectedFolderId)) selectedFolderId = folders[0]?.id || null;
  const list = $("#folder-list");
  if (!folders.length) {
    list.innerHTML = '<div class="empty-state small">No folders yet.<br>Create your first folder.</div>';
  } else {
    list.innerHTML = folders.map((folder) => {
      const count = affirmations.filter((item) => item.folderId === folder.id).length;
      return `<button class="folder-button${folder.id === selectedFolderId ? " active" : ""}" data-folder="${folder.id}" type="button"><span class="folder-icon">▰</span><span class="folder-copy"><strong>${escapeHtml(folder.name)}</strong><small>${count} affirmation${count === 1 ? "" : "s"}</small></span></button>`;
    }).join("");
  }
  renderAffirmations();
  renderFolderSelect();
}

function renderFolderSelect() {
  const select = $("#folder-select");
  if (!folders.length) {
    select.innerHTML = '<option value="">Create a folder first</option>';
    select.value = "";
    return;
  }
  select.innerHTML = folders.map((folder) => `<option value="${folder.id}">${escapeHtml(folder.name)}</option>`).join("");
  select.value = selectedFolderId || folders[0].id;
}

function renderAffirmations() {
  const folder = folders.find((item) => item.id === selectedFolderId);
  const items = affirmations.filter((item) => item.folderId === selectedFolderId);
  $("#folder-title").textContent = folder?.name || "Select a folder";
  $("#folder-summary").textContent = `${items.length} affirmation${items.length === 1 ? "" : "s"}`;
  $("#delete-folder").hidden = !folder;
  const list = $("#affirmation-list");
  if (!folder) {
    list.innerHTML = '<div class="empty-state">Create or select a folder to begin.</div>';
  } else if (!items.length) {
    list.innerHTML = '<div class="empty-state">No generated affirmations in this folder yet.<br>Click “New affirmation” to create one.</div>';
  } else {
    list.innerHTML = items.map((item) => `<article class="affirmation-card"><div><p>${escapeHtml(item.text)}</p><div class="affirmation-meta"><span>${escapeHtml(item.voiceName)}</span><span>${new Date(item.createdAt).toLocaleString()}</span><span>Not saved to AWS</span></div></div><div class="card-actions"><button data-play-affirmation="${item.id}" type="button" title="Play">▶</button><a href="${item.url}" download="affirmation.wav" title="Download">↓</a><button data-delete-affirmation="${item.id}" type="button" title="Remove">×</button></div></article>`).join("");
  }
}

function createFolder(name) {
  const folder = {id:`folder-${crypto.randomUUID()}`, name:name.trim(), createdAt:new Date().toISOString()};
  folders.push(folder);
  selectedFolderId = folder.id;
  saveFolders();
  renderFolders();
}

async function loadVoices(preferredId = selectedVoiceId) {
  const grid = $("#voice-grid");
  try {
    voices = (await (await api("/api/voices", {cache:"no-store"})).json()).voices || [];
    selectedVoiceId = voices.some((voice) => voice.id === preferredId) ? preferredId : voices[0]?.id || null;
    renderVoices();
  } catch (error) {
    grid.innerHTML = `<div class="empty-state small">${escapeHtml(error.message)}</div>`;
  }
}

function renderVoices() {
  const grid = $("#voice-grid");
  if (!voices.length) {
    grid.innerHTML = '<div class="empty-state small">No voices available.</div>';
    return;
  }
  grid.innerHTML = voices.map((voice) => `<div class="voice-card${voice.id === selectedVoiceId && !customMode ? " selected" : ""}" data-voice="${voice.id}" role="radio" aria-checked="${voice.id === selectedVoiceId && !customMode}"><span class="voice-avatar">${escapeHtml(initials(voice.name))}</span><span class="voice-copy"><strong>${escapeHtml(voice.name)}</strong><small>${escapeHtml(voice.style)}</small></span><span class="voice-actions"><button data-preview="${voice.id}" type="button" aria-label="Preview ${escapeHtml(voice.name)}">▶</button><button class="delete-voice" data-delete-voice="${voice.id}" type="button" aria-label="Delete ${escapeHtml(voice.name)}">×</button></span></div>`).join("");
}

async function previewVoice(voiceId, button) {
  try {
    if (activeAudio) { activeAudio.pause(); activeAudio = null; }
    button.textContent = "…";
    const blob = await (await api(`/voices/${encodeURIComponent(voiceId)}/preview`)).blob();
    const url = URL.createObjectURL(blob);
    activeAudio = new Audio(url);
    button.textContent = "Ⅱ";
    activeAudio.onended = () => { button.textContent = "▶"; URL.revokeObjectURL(url); };
    await activeAudio.play();
  } catch (error) {
    button.textContent = "▶";
    showStatus(error.message, true);
  }
}

function updateSettings() {
  $("#speed-output").textContent = Number($("#speed").value).toFixed(2);
  $("#steps-output").textContent = $("#steps").value;
  $("#guidance-output").textContent = Number($("#guidance").value).toFixed(1);
  $("#gap-output").textContent = `${$("#word-gap").value} ms`;
  $("#settings-summary").textContent = `Speed ${Number($("#speed").value).toFixed(2)} · ${$("#steps").value} steps`;
}

function showStatus(message, error = false) {
  const status = $("#status");
  status.textContent = message;
  status.className = `status show${error ? " error" : ""}`;
}

async function generate(event) {
  event.preventDefault();
  const folderId = $("#folder-select").value;
  if (!folderId) return showStatus("Create a folder before generating an affirmation.", true);
  const file = $("#custom-audio").files[0];
  if (customMode && !file) return showStatus("Choose a custom voice sample.", true);
  if (customMode && !$("#custom-consent").checked) return showStatus("Confirm that you have permission to use the custom voice.", true);
  if (!customMode && !selectedVoiceId) return showStatus("Choose a voice.", true);

  const data = new FormData();
  data.set("text", $("#affirmation-text").value.trim());
  data.set("consent", customMode ? String($("#custom-consent").checked) : "true");
  if (customMode) data.set("reference_audio", file, file.name); else data.set("voice_id", selectedVoiceId);
  data.set("speed", $("#speed").value);
  data.set("duration", "0");
  data.set("num_step", $("#steps").value);
  data.set("guidance_scale", $("#guidance").value);
  data.set("word_pause_ms", $("#word-gap").value);
  data.set("clear_pronunciation", String($("#clear-pronunciation").checked));
  data.set("denoise", String($("#denoise").checked));
  data.set("preprocess_prompt", String($("#preprocess").checked));
  data.set("postprocess_output", String($("#postprocess").checked));
  data.set("t_shift", "0.1");
  data.set("layer_penalty_factor", "5");
  data.set("position_temperature", "5");
  data.set("class_temperature", "0");
  data.set("audio_chunk_duration", "15");
  data.set("audio_chunk_threshold", "30");

  const button = $("#generate-button");
  button.disabled = true;
  button.textContent = "Generating on Modal…";
  $("#result-card").hidden = true;
  showStatus("Starting the GPU and generating your audio. The first request may take longer.");
  try {
    const blob = await (await api("/generate", {method:"POST", body:data})).blob();
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(blob);
    $("#result-player").src = resultUrl;
    $("#download-result").href = resultUrl;
    $("#result-card").hidden = false;
    $("#status").className = "status";
    const voice = voices.find((item) => item.id === selectedVoiceId);
    affirmations.unshift({id:crypto.randomUUID(), folderId, text:$("#affirmation-text").value.trim(), voiceName:customMode ? "Custom voice" : voice?.name || "Voice", createdAt:new Date().toISOString(), url:resultUrl});
    selectedFolderId = folderId;
    renderFolders();
  } catch (error) {
    showStatus(error.message || "Generation failed.", true);
  } finally {
    button.disabled = false;
    button.textContent = "Generate voice";
  }
}

$("#login-form").addEventListener("submit", verifyLogin);
$("#sign-out").addEventListener("click", () => { sessionStorage.removeItem("gratitude-voice-access"); location.reload(); });
$$('[data-view], [data-view-link]').forEach((element) => element.addEventListener("click", (event) => { event.preventDefault(); showView(element.dataset.view || element.dataset.viewLink); }));
$("#folder-list").addEventListener("click", (event) => { const button = event.target.closest("[data-folder]"); if (!button) return; selectedFolderId = button.dataset.folder; saveFolders(); renderFolders(); });
$("#new-folder").addEventListener("click", () => $("#folder-dialog").showModal());
$("#folder-form").addEventListener("submit", (event) => { event.preventDefault(); createFolder($("#folder-name").value); event.target.reset(); $("#folder-dialog").close(); });
$("#delete-folder").addEventListener("click", () => { const folder = folders.find((item) => item.id === selectedFolderId); if (!folder || !confirm(`Delete “${folder.name}”? Generated browser previews in it will also be removed.`)) return; affirmations = affirmations.filter((item) => item.folderId !== folder.id); folders = folders.filter((item) => item.id !== folder.id); selectedFolderId = folders[0]?.id || null; saveFolders(); renderFolders(); });
$("#new-affirmation").addEventListener("click", () => { if (!folders.length) return $("#folder-dialog").showModal(); showView("generate"); });
$("#folder-select").addEventListener("change", (event) => { selectedFolderId = event.target.value; saveFolders(); });
$("#affirmation-list").addEventListener("click", (event) => { const play = event.target.closest("[data-play-affirmation]"); const remove = event.target.closest("[data-delete-affirmation]"); if (play) { const item = affirmations.find((entry) => entry.id === play.dataset.playAffirmation); if (item) new Audio(item.url).play(); } if (remove) { affirmations = affirmations.filter((entry) => entry.id !== remove.dataset.deleteAffirmation); renderAffirmations(); } });
$("#voice-grid").addEventListener("click", async (event) => { const preview = event.target.closest("[data-preview]"); const remove = event.target.closest("[data-delete-voice]"); if (preview) { event.stopPropagation(); return previewVoice(preview.dataset.preview, preview); } if (remove) { event.stopPropagation(); const voice = voices.find((item) => item.id === remove.dataset.deleteVoice); if (!voice || !confirm(`Delete voice “${voice.name}”?`)) return; try { await api(`/api/voices/${encodeURIComponent(voice.id)}`, {method:"DELETE"}); await loadVoices(); } catch (error) { showStatus(error.message, true); } return; } const card = event.target.closest("[data-voice]"); if (card) { customMode = false; $("#custom-upload").hidden = true; selectedVoiceId = card.dataset.voice; renderVoices(); } });
$("#toggle-custom").addEventListener("click", () => { customMode = !customMode; $("#custom-upload").hidden = !customMode; $("#toggle-custom").textContent = customMode ? "Use a prebuilt voice instead" : "Or upload a custom voice sample"; renderVoices(); });
$("#custom-audio").addEventListener("change", (event) => { $("#custom-filename").textContent = event.target.files[0]?.name || ""; });
$("#affirmation-text").addEventListener("input", (event) => { $("#text-count").textContent = event.target.value.length; });
[$("#speed"),$("#steps"),$("#guidance"),$("#word-gap")].forEach((input) => input.addEventListener("input", updateSettings));
$("#generate-form").addEventListener("submit", generate);
$("#open-voice-manager").addEventListener("click", () => $("#voice-dialog").showModal());
$("#voice-form").addEventListener("submit", async (event) => { event.preventDefault(); const button = $("#add-voice-button"); $("#voice-error").textContent = ""; button.disabled = true; button.textContent = "Adding…"; try { const data = new FormData(event.target); data.set("consent", String($("#voice-consent").checked)); const voice = (await (await api("/api/voices", {method:"POST",body:data})).json()).voice; event.target.reset(); $("#voice-dialog").close(); await loadVoices(voice.id); } catch (error) { $("#voice-error").textContent = error.message; } finally { button.disabled = false; button.textContent = "Add to library"; } });
$$('[data-close-dialog]').forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));

updateSettings();
if (accessCode) {
  api("/api/auth/check", {cache:"no-store"}).then(showApp).catch(() => { sessionStorage.removeItem("gratitude-voice-access"); accessCode = ""; });
}
