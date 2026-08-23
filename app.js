const MODAL_BASE_URL = "https://diksangisomu215--omnivoice-web-studio-web-app.modal.run";
// Filled with the isolated GratitudeVoiceStudioApi Lambda Function URL at deploy time.
const AWS_API_BASE_URL = "https://a6c42ttu3mqldnamijycyue27m0jgbae.lambda-url.us-east-1.on.aws";
const AWS_CONFIGURED = !AWS_API_BASE_URL.startsWith("__");
const LOCAL_FOLDER_STORAGE_KEY = "gratitude-voice-studio-folders-v1";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let accessCode = sessionStorage.getItem("gratitude-voice-access") || "";
let folders = [];
let selectedFolderId = localStorage.getItem("gratitude-voice-selected-folder") || null;
let affirmations = [];
let voices = [];
let selectedVoiceId = null;
let customMode = false;
let activeAudio = null;
let activePreviewButton = null;
let activePreviewUrl = null;
let previewRequestId = 0;
let resultUrl = null;
let pendingGeneration = null;
let localAffirmations = [];
let generationProgressTimer = null;
let generationProgressHideTimer = null;
let generationProgressValue = 0;

function loadLocalFolders() {
  try {
    const value = JSON.parse(localStorage.getItem(LOCAL_FOLDER_STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (_) {
    return [];
  }
}

function saveLocalFolders() {
  localStorage.setItem(LOCAL_FOLDER_STORAGE_KEY, JSON.stringify(folders));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[character]);
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function apiErrorMessage(payload, status) {
  if (typeof payload?.detail === "string") return payload.detail;
  if (typeof payload?.error === "string") return payload.error;
  return `Request failed (${status}).`;
}

async function modalApi(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (accessCode) headers.set("X-Access-Token", accessCode);
  const response = await fetch(`${MODAL_BASE_URL}${path}`, {...options, headers});
  if (!response.ok) {
    let payload = {};
    try { payload = await response.json(); } catch (_) {}
    throw new Error(apiErrorMessage(payload, response.status));
  }
  return response;
}

async function awsApi(path, options = {}) {
  if (!AWS_CONFIGURED) throw new Error("AWS storage is not deployed yet.");
  const headers = new Headers(options.headers || {});
  headers.set("X-Access-Token", accessCode);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`${AWS_API_BASE_URL.replace(/\/$/, "")}${path}`, {...options, headers});
  if (!response.ok) {
    let payload = {};
    try { payload = await response.json(); } catch (_) {}
    throw new Error(apiErrorMessage(payload, response.status));
  }
  return response.status === 204 ? null : response.json();
}

function rememberFolder() {
  if (selectedFolderId) localStorage.setItem("gratitude-voice-selected-folder", selectedFolderId);
  else localStorage.removeItem("gratitude-voice-selected-folder");
}

async function showApp() {
  $("#login-screen").hidden = true;
  $("#app-shell").hidden = false;
  $("#storage-mode").textContent = AWS_CONFIGURED ? "Shared AWS library" : "Browser draft";
  renderFolders();
  await Promise.all([loadVoices(), refreshFolders()]);
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
    await modalApi("/api/auth/check", {cache: "no-store"});
    sessionStorage.setItem("gratitude-voice-access", code);
    await showApp();
  } catch (error) {
    accessCode = "";
    $("#login-error").textContent = error.message || "Incorrect access code.";
  } finally {
    button.disabled = false;
    button.textContent = "Sign in";
  }
}

async function refreshFolders(preferredId = selectedFolderId) {
  if (!AWS_CONFIGURED) {
    folders = loadLocalFolders();
    selectedFolderId = folders.some((folder) => folder.id === preferredId) ? preferredId : folders[0]?.id || null;
    rememberFolder();
    renderFolders();
    return refreshAffirmations();
  }
  try {
    const payload = await awsApi("/folders", {cache: "no-store"});
    folders = payload.folders || [];
    selectedFolderId = folders.some((folder) => folder.id === preferredId) ? preferredId : folders[0]?.id || null;
    rememberFolder();
    renderFolders();
    await refreshAffirmations();
  } catch (error) {
    folders = [];
    affirmations = [];
    renderFolders();
    showLibraryError(error.message);
  }
}

async function refreshAffirmations() {
  if (!AWS_CONFIGURED) {
    affirmations = localAffirmations.filter((item) => item.folderId === selectedFolderId);
    return renderFolders();
  }
  affirmations = [];
  renderAffirmations(true);
  if (!selectedFolderId) return renderAffirmations();
  try {
    const payload = await awsApi(`/folders/${encodeURIComponent(selectedFolderId)}/affirmations`, {cache: "no-store"});
    affirmations = payload.affirmations || [];
    renderFolders();
  } catch (error) {
    renderAffirmations(false, error.message);
  }
}

function showLibraryError(message) {
  $("#affirmation-list").innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function renderFolders() {
  if (selectedFolderId && !folders.some((folder) => folder.id === selectedFolderId)) selectedFolderId = folders[0]?.id || null;
  const list = $("#folder-list");
  if (!folders.length) {
    list.innerHTML = '<div class="empty-state small">No folders yet.<br>Create your first folder.</div>';
  } else {
    list.innerHTML = folders.map((folder) => {
      const count = folder.id === selectedFolderId ? affirmations.length : null;
      const subtitle = count === null ? "Open folder" : `${count} affirmation${count === 1 ? "" : "s"}`;
      return `<button class="folder-button${folder.id === selectedFolderId ? " active" : ""}" data-folder="${folder.id}" type="button"><span class="folder-icon">▰</span><span class="folder-copy"><strong>${escapeHtml(folder.name)}</strong><small>${subtitle}</small></span></button>`;
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

function renderAffirmations(loading = false, error = "") {
  const folder = folders.find((item) => item.id === selectedFolderId);
  $("#folder-title").textContent = folder?.name || "Select a folder";
  $("#folder-summary").textContent = `${affirmations.length} affirmation${affirmations.length === 1 ? "" : "s"}`;
  const list = $("#affirmation-list");
  if (error) return showLibraryError(error);
  if (loading) {
    list.innerHTML = '<div class="empty-state">Loading saved affirmations…</div>';
  } else if (!folder) {
    list.innerHTML = '<div class="empty-state">Create or select a folder to begin.</div>';
  } else if (!affirmations.length) {
    list.innerHTML = '<div class="empty-state">No saved affirmations in this folder yet.<br>Click “New affirmation” to create one.</div>';
  } else {
    list.innerHTML = affirmations.map((item) => `<article class="affirmation-card"><div><p>${escapeHtml(item.title)}</p><div class="affirmation-meta"><span>${escapeHtml(item.voiceName)}</span><span>${new Date(item.createdAt).toLocaleString()}</span><span>${item.local ? "Browser preview" : "Saved in AWS"}</span></div></div><div class="card-actions"><button data-play-url="${escapeHtml(item.audioUrl)}" type="button" title="Play">▶</button><a href="${escapeHtml(item.audioUrl)}" download="affirmation-${item.identifier}.mp3" title="Download">↓</a></div></article>`).join("");
  }
}

async function createFolder(name) {
  if (!AWS_CONFIGURED) {
    const folder = {id: `folder-${crypto.randomUUID()}`, name: name.trim(), createdAt: new Date().toISOString()};
    folders.push(folder);
    selectedFolderId = folder.id;
    affirmations = [];
    saveLocalFolders();
    rememberFolder();
    return renderFolders();
  }
  const payload = await awsApi("/folders", {method: "POST", body: JSON.stringify({name: name.trim()})});
  folders.push(payload.folder);
  selectedFolderId = payload.folder.id;
  affirmations = [];
  rememberFolder();
  renderFolders();
}

async function loadVoices(preferredId = selectedVoiceId) {
  const grid = $("#voice-grid");
  try {
    voices = (await (await modalApi("/api/voices", {cache: "no-store"})).json()).voices || [];
    selectedVoiceId = voices.some((voice) => voice.id === preferredId) ? preferredId : voices[0]?.id || null;
    renderVoices();
  } catch (error) {
    grid.innerHTML = `<div class="empty-state small">${escapeHtml(error.message)}</div>`;
  }
}

function renderVoices() {
  if (activePreviewButton) stopActivePreview();
  const grid = $("#voice-grid");
  if (!voices.length) {
    grid.innerHTML = '<div class="empty-state small">No voices available.</div>';
    return;
  }
  grid.innerHTML = voices.map((voice) => `<div class="voice-card${voice.id === selectedVoiceId && !customMode ? " selected" : ""}" data-voice="${voice.id}" role="radio" aria-checked="${voice.id === selectedVoiceId && !customMode}"><span class="voice-avatar">${escapeHtml(initials(voice.name))}</span><span class="voice-copy"><strong>${escapeHtml(voice.name)}</strong><small>${escapeHtml(voice.style)}</small></span><span class="voice-actions"><button data-preview="${voice.id}" data-default-label="Preview ${escapeHtml(voice.name)}" type="button" aria-label="Preview ${escapeHtml(voice.name)}" aria-pressed="false">▶</button><button class="delete-voice" data-delete-voice="${voice.id}" type="button" aria-label="Delete ${escapeHtml(voice.name)}">×</button></span></div>`).join("");
}

function stopActivePreview() {
  previewRequestId += 1;
  if (activeAudio) {
    activeAudio.onended = null;
    activeAudio.onerror = null;
    activeAudio.pause();
    activeAudio.currentTime = 0;
  }
  if (activePreviewButton) {
    activePreviewButton.disabled = false;
    activePreviewButton.textContent = "▶";
    activePreviewButton.setAttribute("aria-pressed", "false");
    activePreviewButton.setAttribute("aria-label", activePreviewButton.dataset.defaultLabel || "Preview voice");
  }
  if (activePreviewUrl) URL.revokeObjectURL(activePreviewUrl);
  activeAudio = null;
  activePreviewButton = null;
  activePreviewUrl = null;
}

async function previewVoice(voiceId, button) {
  if (activePreviewButton === button) {
    stopActivePreview();
    return;
  }

  stopActivePreview();
  const requestId = previewRequestId;
  activePreviewButton = button;
  button.textContent = "…";
  button.setAttribute("aria-label", "Loading voice sample");
  try {
    const blob = await (await modalApi(`/voices/${encodeURIComponent(voiceId)}/preview`)).blob();
    const url = URL.createObjectURL(blob);
    if (requestId !== previewRequestId || activePreviewButton !== button) {
      URL.revokeObjectURL(url);
      return;
    }
    activePreviewUrl = url;
    activeAudio = new Audio(url);
    button.textContent = "■";
    button.setAttribute("aria-pressed", "true");
    button.setAttribute("aria-label", "Stop voice sample");
    activeAudio.onended = stopActivePreview;
    activeAudio.onerror = stopActivePreview;
    await activeAudio.play();
  } catch (error) {
    if (requestId === previewRequestId) {
      stopActivePreview();
      showStatus(error.message, true);
    }
  }
}

function setGenerationProgress(value, label) {
  generationProgressValue = Math.max(0, Math.min(100, Math.round(value)));
  $("#generation-progress").setAttribute("aria-valuenow", String(generationProgressValue));
  $("#progress-fill").style.width = `${generationProgressValue}%`;
  $("#progress-percent").textContent = `${generationProgressValue}%`;
  $("#progress-label").textContent = label;
}

function startGenerationProgress() {
  clearInterval(generationProgressTimer);
  clearTimeout(generationProgressHideTimer);
  $("#generation-progress").hidden = false;
  setGenerationProgress(4, "Waking the model");
  generationProgressTimer = setInterval(() => {
    const increment = generationProgressValue < 28 ? 4 : generationProgressValue < 66 ? 2 : 1;
    const nextValue = Math.min(92, generationProgressValue + increment);
    const label = nextValue < 28
      ? "Waking the model"
      : nextValue < 58
        ? "Preparing the selected voice"
        : nextValue < 84
          ? "Generating your affirmation"
          : "Finishing the audio";
    setGenerationProgress(nextValue, label);
  }, 750);
}

function finishGenerationProgress(success) {
  clearInterval(generationProgressTimer);
  generationProgressTimer = null;
  if (!success) {
    $("#generation-progress").hidden = true;
    setGenerationProgress(0, "Preparing your voice");
    return;
  }
  setGenerationProgress(100, "Audio ready");
  generationProgressHideTimer = setTimeout(() => {
    $("#generation-progress").hidden = true;
  }, 900);
}

function updateSettings() {
  $("#speed-output").textContent = Number($("#speed").value).toFixed(2);
  $("#steps-output").textContent = $("#steps").value;
  $("#guidance-output").textContent = Number($("#guidance").value).toFixed(1);
  $("#gap-output").textContent = `${$("#word-gap").value} ms`;
  $("#settings-summary").textContent = `${Number($("#speed").value).toFixed(2)} speed · ${$("#steps").value} steps`;
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

  const text = $("#affirmation-text").value.trim();
  const voice = voices.find((item) => item.id === selectedVoiceId);
  const data = new FormData();
  data.set("text", text);
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
  data.set("output_format", "mp3");
  data.set("t_shift", "0.1");
  data.set("layer_penalty_factor", "5");
  data.set("position_temperature", "5");
  data.set("class_temperature", "0");
  data.set("audio_chunk_duration", "15");
  data.set("audio_chunk_threshold", "30");

  const button = $("#generate-button");
  stopActivePreview();
  startGenerationProgress();
  button.disabled = true;
  button.textContent = "Generating on Modal…";
  $("#result-card").hidden = true;
  showStatus("Starting the GPU and generating your audio. The first request may take longer.");
  try {
    const blob = await (await modalApi("/generate", {method: "POST", body: data})).blob();
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(blob);
    pendingGeneration = {
      blob,
      folderId,
      title: text,
      voiceId: customMode ? "custom" : selectedVoiceId,
      voiceName: customMode ? "Custom voice" : voice?.name || "Voice",
    };
    $("#result-player").src = resultUrl;
    $("#download-result").href = resultUrl;
    $("#result-card").hidden = false;
    $("#confirm-save").hidden = !AWS_CONFIGURED;
    $("#confirm-save").disabled = !AWS_CONFIGURED;
    $("#result-note").textContent = AWS_CONFIGURED
      ? "Listen once before you save it."
      : "Listen or download it. Shared saving will arrive after AWS access is ready.";
    if (!AWS_CONFIGURED) {
      localAffirmations.unshift({
        identifier: crypto.randomUUID(),
        folderId,
        title: text,
        voiceName: pendingGeneration.voiceName,
        createdAt: new Date().toISOString(),
        audioUrl: resultUrl,
        local: true,
      });
      affirmations = localAffirmations.filter((item) => item.folderId === folderId);
      renderFolders();
    }
    finishGenerationProgress(true);
    $("#status").className = "status";
  } catch (error) {
    pendingGeneration = null;
    finishGenerationProgress(false);
    showStatus(error.message || "Generation failed.", true);
  } finally {
    button.disabled = false;
    button.textContent = "Generate voice";
  }
}

async function confirmSave() {
  if (!pendingGeneration) return;
  const button = $("#confirm-save");
  button.disabled = true;
  button.textContent = "Saving securely…";
  showStatus("Uploading the confirmed MP3 to the isolated AWS dev folder.");
  try {
    const upload = await awsApi("/uploads/presign", {
      method: "POST",
      body: JSON.stringify({folderId: pendingGeneration.folderId}),
    });
    const uploaded = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: upload.requiredHeaders,
      body: pendingGeneration.blob,
    });
    if (!uploaded.ok) throw new Error(`Audio upload failed (${uploaded.status}).`);
    const saved = await awsApi("/affirmations/confirm", {
      method: "POST",
      body: JSON.stringify({
        affirmationId: upload.affirmationId,
        folderId: pendingGeneration.folderId,
        audioKey: upload.audioKey,
        title: pendingGeneration.title,
        voiceId: pendingGeneration.voiceId,
        voiceName: pendingGeneration.voiceName,
      }),
    });
    selectedFolderId = pendingGeneration.folderId;
    rememberFolder();
    pendingGeneration = null;
    $("#result-card").hidden = true;
    showStatus("Saved successfully.");
    await refreshFolders(selectedFolderId);
    affirmations = [saved.affirmation, ...affirmations.filter((item) => item.identifier !== saved.affirmation.identifier)];
    renderFolders();
    showView("library");
  } catch (error) {
    showStatus(error.message || "AWS save failed. Your generated preview is still available.", true);
    button.disabled = false;
  } finally {
    button.textContent = "Confirm & save to AWS";
  }
}

$("#login-form").addEventListener("submit", verifyLogin);
$("#sign-out").addEventListener("click", () => { sessionStorage.removeItem("gratitude-voice-access"); location.reload(); });
$$('[data-view], [data-view-link]').forEach((element) => element.addEventListener("click", (event) => { event.preventDefault(); showView(element.dataset.view || element.dataset.viewLink); }));
$("#folder-list").addEventListener("click", async (event) => { const button = event.target.closest("[data-folder]"); if (!button) return; selectedFolderId = button.dataset.folder; rememberFolder(); renderFolders(); await refreshAffirmations(); });
$("#new-folder").addEventListener("click", () => $("#folder-dialog").showModal());
$("#folder-form").addEventListener("submit", async (event) => { event.preventDefault(); const button = event.submitter; button.disabled = true; $("#folder-error").textContent = ""; try { await createFolder($("#folder-name").value); event.target.reset(); $("#folder-dialog").close(); } catch (error) { $("#folder-error").textContent = error.message; } finally { button.disabled = false; } });
$("#new-affirmation").addEventListener("click", () => { if (!folders.length) return $("#folder-dialog").showModal(); showView("generate"); });
$("#folder-select").addEventListener("change", (event) => { selectedFolderId = event.target.value; rememberFolder(); });
$("#affirmation-list").addEventListener("click", (event) => { const play = event.target.closest("[data-play-url]"); if (play) new Audio(play.dataset.playUrl).play(); });
$("#voice-grid").addEventListener("click", async (event) => { const preview = event.target.closest("[data-preview]"); const remove = event.target.closest("[data-delete-voice]"); if (preview) { event.stopPropagation(); return previewVoice(preview.dataset.preview, preview); } if (remove) { event.stopPropagation(); const voice = voices.find((item) => item.id === remove.dataset.deleteVoice); if (!voice || !confirm(`Delete voice “${voice.name}”? This cannot be undone.`)) return; try { await modalApi(`/api/voices/${encodeURIComponent(voice.id)}`, {method: "DELETE"}); await loadVoices(); } catch (error) { showStatus(error.message, true); } return; } const card = event.target.closest("[data-voice]"); if (card) { customMode = false; $("#custom-upload").hidden = true; selectedVoiceId = card.dataset.voice; renderVoices(); } });
$("#toggle-custom").addEventListener("click", () => { customMode = !customMode; $("#custom-upload").hidden = !customMode; $("#toggle-custom").textContent = customMode ? "Use a prebuilt voice instead" : "Or upload a custom voice sample"; renderVoices(); });
$("#custom-audio").addEventListener("change", (event) => { $("#custom-filename").textContent = event.target.files[0]?.name || ""; });
$("#affirmation-text").addEventListener("input", (event) => { $("#text-count").textContent = event.target.value.length; });
[$("#speed"), $("#steps"), $("#guidance"), $("#word-gap")].forEach((input) => input.addEventListener("input", updateSettings));
$("#generate-form").addEventListener("submit", generate);
$("#confirm-save").addEventListener("click", confirmSave);
$("#open-voice-manager").addEventListener("click", () => $("#voice-dialog").showModal());
$("#voice-form").addEventListener("submit", async (event) => { event.preventDefault(); const button = $("#add-voice-button"); $("#voice-error").textContent = ""; button.disabled = true; button.textContent = "Adding…"; try { const data = new FormData(event.target); data.set("consent", String($("#voice-consent").checked)); const voice = (await (await modalApi("/api/voices", {method: "POST", body: data})).json()).voice; event.target.reset(); $("#voice-dialog").close(); await loadVoices(voice.id); } catch (error) { $("#voice-error").textContent = error.message; } finally { button.disabled = false; button.textContent = "Add to library"; } });
$$('[data-close-dialog]').forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));

updateSettings();
if (accessCode) {
  modalApi("/api/auth/check", {cache: "no-store"}).then(showApp).catch(() => { sessionStorage.removeItem("gratitude-voice-access"); accessCode = ""; });
}
