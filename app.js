const MODAL_BASE_URL = "https://diksangisomu215--omnivoice-web-studio-web-app.modal.run";
// Filled with the isolated GratitudeVoiceStudioApi Lambda Function URL at deploy time.
const AWS_API_BASE_URL = "https://a6c42ttu3mqldnamijycyue27m0jgbae.lambda-url.us-east-1.on.aws";
const AWS_CONFIGURED = !AWS_API_BASE_URL.startsWith("__");
const LOCAL_FOLDER_STORAGE_KEY = "gratitude-voice-studio-folders-v1";
const FOLDER_VOICE_STORAGE_KEY = "gratitude-voice-studio-folder-voices-v1";
const BACKGROUND_MUSIC_STORAGE_KEY = "gratitude-voice-studio-background-music-v1";
const DEFAULT_BACKGROUND_MUSIC_VOLUME = 0.18;
const MAX_BACKGROUND_MUSIC_BYTES = 30 * 1024 * 1024;
const VOICE_DISPLAY_NAMES = {
  alice: "Amelia",
  "mélanie": "Elena",
  sia: "Maya",
  anika: "Clara",
  britney: "Serena",
  lunaria: "Luna",
  "male voice 1": "Ethan",
  "male voice 2": "Noah",
  "male voice 3": "Adrian",
  "male voice 4": "Leo",
};
const VOICE_IMAGE_ASSETS = {
  alice: "./assets/voices/amelia.png",
  lunaria: "./assets/voices/luna.png",
  "male-voice-2": "./assets/voices/noah.png",
  "male-voice-3": "./assets/voices/adrian.png",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const voiceDisplayName = (name) => VOICE_DISPLAY_NAMES[String(name || "").trim().toLocaleLowerCase()] || name;

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
let libraryAudio = null;
let activeAffirmationId = null;
let isPlayingAll = false;
let playlistIndex = 0;
let draggedAffirmationId = null;
let orderChanged = false;
let orderSaving = false;
let selectedFolderVoiceId = null;
let folderVoiceBatch = null;
let folderVoiceBusy = false;
let folderVoiceDeleteBusy = false;
let batchAudio = null;
let batchAudioUrl = null;
let activeBatchButton = null;
let activeBatchStatus = null;
let backgroundMusicTracks = [];
let selectedBackgroundMusicId = null;
let backgroundMusicVolume = DEFAULT_BACKGROUND_MUSIC_VOLUME;
let backgroundMusicAudio = null;
let backgroundMusicAudioId = null;
let musicPreviewAudio = null;
let activeMusicPreviewId = null;
let musicUploadBusy = false;
let musicDeleteBusyId = null;

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

function loadFolderVoicePreferences() {
  try {
    const value = JSON.parse(localStorage.getItem(FOLDER_VOICE_STORAGE_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch (_) {
    return {};
  }
}

function rememberFolderVoice(voiceId = selectedFolderVoiceId) {
  if (!selectedFolderId || !voiceId) return;
  const preferences = loadFolderVoicePreferences();
  preferences[selectedFolderId] = voiceId;
  localStorage.setItem(FOLDER_VOICE_STORAGE_KEY, JSON.stringify(preferences));
}

function loadBackgroundMusicPreferences() {
  try {
    const value = JSON.parse(localStorage.getItem(BACKGROUND_MUSIC_STORAGE_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch (_) {
    return {};
  }
}

function restoreBackgroundMusicPreference() {
  const preference = loadBackgroundMusicPreferences()[selectedFolderId] || {};
  selectedBackgroundMusicId = preference.musicId || null;
  const volume = Number(preference.volume);
  backgroundMusicVolume = Number.isFinite(volume) && volume >= 0 && volume <= 1
    ? volume
    : DEFAULT_BACKGROUND_MUSIC_VOLUME;
}

function rememberBackgroundMusicPreference() {
  if (!selectedFolderId) return;
  const preferences = loadBackgroundMusicPreferences();
  preferences[selectedFolderId] = {
    musicId: selectedBackgroundMusicId,
    volume: backgroundMusicVolume,
  };
  localStorage.setItem(BACKGROUND_MUSIC_STORAGE_KEY, JSON.stringify(preferences));
}

function removeMusicFromPreferences(musicId) {
  const preferences = loadBackgroundMusicPreferences();
  Object.keys(preferences).forEach((folderId) => {
    if (preferences[folderId]?.musicId === musicId) preferences[folderId].musicId = null;
  });
  localStorage.setItem(BACKGROUND_MUSIC_STORAGE_KEY, JSON.stringify(preferences));
}

function itemVoiceVersions(item) {
  if (Array.isArray(item?.voices) && item.voices.length) {
    return item.voices.map((voice) => ({...voice, voiceName: voiceDisplayName(voice.voiceName)}));
  }
  if (!item?.voiceId || !item?.audioUrl) return [];
  return [{
    affirmationId: item.identifier,
    folderId: item.folderId,
    voiceId: item.voiceId,
    voiceName: voiceDisplayName(item.voiceName),
    audioUrl: item.audioUrl,
    audioKey: item.audioKey,
    createdAt: item.createdAt,
    status: item.status || "active",
    isOriginal: true,
  }];
}

function folderVoiceAvailability() {
  const available = new Map();
  affirmations.forEach((item) => {
    const seen = new Set();
    itemVoiceVersions(item).forEach((voice) => {
      if (!voice.voiceId || seen.has(voice.voiceId)) return;
      seen.add(voice.voiceId);
      const current = available.get(voice.voiceId) || {id: voice.voiceId, name: voice.voiceName || "Voice", count: 0};
      current.count += 1;
      available.set(voice.voiceId, current);
    });
  });
  return [...available.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function completeFolderVoices() {
  return folderVoiceAvailability().filter((voice) => voice.count === affirmations.length);
}

function ensureSelectedFolderVoice(preferredId = selectedFolderVoiceId) {
  const complete = completeFolderVoices();
  const saved = loadFolderVoicePreferences()[selectedFolderId];
  selectedFolderVoiceId = complete.some((voice) => voice.id === preferredId)
    ? preferredId
    : complete.some((voice) => voice.id === saved)
      ? saved
      : complete[0]?.id || null;
  rememberFolderVoice();
}

function selectedVoiceVersion(item, voiceId = selectedFolderVoiceId) {
  const versions = itemVoiceVersions(item);
  return versions.find((voice) => voice.voiceId === voiceId) || versions[0] || null;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[character]);
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function voiceImageUrl(voiceId) {
  return VOICE_IMAGE_ASSETS[String(voiceId || "").trim().toLocaleLowerCase()] || "";
}

function voiceAvatarMarkup(voice, className = "voice-avatar") {
  const imageUrl = voiceImageUrl(voice?.id || voice?.voiceId);
  const name = voice?.name || voice?.voiceName || "Voice";
  if (imageUrl) {
    return `<span class="${className} has-image"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)} portrait"></span>`;
  }
  return `<span class="${className}">${escapeHtml(initials(name))}</span>`;
}

function setVoiceAvatar(element, voice) {
  const imageUrl = voiceImageUrl(voice?.id || voice?.voiceId);
  const name = voice?.name || voice?.voiceName || "Voice";
  element.classList.toggle("has-image", Boolean(imageUrl));
  element.innerHTML = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)} portrait">`
    : escapeHtml(voice ? initials(name) : "—");
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

function formatMusicDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (!total) return "";
  return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
}

function selectedBackgroundMusicTrack() {
  return backgroundMusicTracks.find((track) => track.id === selectedBackgroundMusicId) || null;
}

async function loadBackgroundMusic() {
  if (!AWS_CONFIGURED) {
    backgroundMusicTracks = [];
    renderBackgroundMusicButton();
    renderBackgroundMusicDialog();
    return;
  }
  try {
    const payload = await awsApi("/background-music", {cache: "no-store"});
    backgroundMusicTracks = (payload.tracks || []).filter((track) => track.status === "active" && track.audioUrl);
    if (selectedBackgroundMusicId && !selectedBackgroundMusicTrack()) {
      selectedBackgroundMusicId = null;
      rememberBackgroundMusicPreference();
    }
    renderBackgroundMusicButton();
    renderBackgroundMusicDialog();
  } catch (error) {
    backgroundMusicTracks = [];
    renderBackgroundMusicButton();
    if ($("#music-dialog")?.open) {
      $("#music-error").textContent = error.message || "Could not load music from AWS.";
      renderBackgroundMusicDialog();
    }
  }
}

function renderBackgroundMusicButton() {
  const button = $("#background-music");
  if (!button) return;
  const track = selectedBackgroundMusicTrack();
  button.disabled = !AWS_CONFIGURED || !selectedFolderId;
  button.classList.toggle("active", Boolean(track));
  $("#background-music-label").textContent = track?.name || "Music";
  button.title = track ? "Background music: " + track.name : "Choose background music";
}

function renderBackgroundMusicDialog() {
  const list = $("#music-list");
  if (!list) return;
  const volumePercent = Math.round(backgroundMusicVolume * 100);
  $("#music-volume").value = String(volumePercent);
  $("#music-volume-value").textContent = volumePercent + "%";

  const noneOption = '<div class="music-option' + (selectedBackgroundMusicId ? '' : ' selected') + '"><label class="music-choice"><input type="radio" name="background-music-choice" data-music-select value=""' + (selectedBackgroundMusicId ? '' : ' checked') + '><span class="music-art" aria-hidden="true">∅</span><span class="music-copy"><strong>No background music</strong><small>Play the affirmation voice by itself</small></span></label></div>';
  const trackOptions = backgroundMusicTracks.map((track) => {
    const selected = track.id === selectedBackgroundMusicId;
    const previewing = track.id === activeMusicPreviewId && musicPreviewAudio && !musicPreviewAudio.paused;
    const details = [track.artist, formatMusicDuration(track.durationSeconds)].filter(Boolean).join(" · ") || "Saved in AWS";
    const busy = musicUploadBusy || Boolean(musicDeleteBusyId);
    return '<div class="music-option' + (selected ? ' selected' : '') + '"><label class="music-choice"><input type="radio" name="background-music-choice" data-music-select value="' + escapeHtml(track.id) + '"' + (selected ? ' checked' : '') + '><span class="music-art" aria-hidden="true">♫</span><span class="music-copy"><strong>' + escapeHtml(track.name) + '</strong><small>' + escapeHtml(details) + '</small></span></label><span class="music-track-actions"><button class="' + (previewing ? 'playing' : '') + '" data-music-preview="' + escapeHtml(track.id) + '" type="button"' + (busy ? ' disabled' : '') + '>' + (previewing ? '■ Stop' : '▶ Preview') + '</button><button class="remove-music" data-music-delete="' + escapeHtml(track.id) + '" type="button"' + (busy ? ' disabled' : '') + '>Remove</button></span></div>';
  }).join("");
  list.innerHTML = noneOption + trackOptions;
}

function stopMusicPreview(render = true) {
  if (musicPreviewAudio) {
    musicPreviewAudio.onended = null;
    musicPreviewAudio.onerror = null;
    musicPreviewAudio.pause();
    musicPreviewAudio.currentTime = 0;
  }
  musicPreviewAudio = null;
  activeMusicPreviewId = null;
  if (render) renderBackgroundMusicDialog();
}

function releaseBackgroundMusic() {
  if (backgroundMusicAudio) {
    backgroundMusicAudio.onerror = null;
    backgroundMusicAudio.pause();
    backgroundMusicAudio.currentTime = 0;
  }
  backgroundMusicAudio = null;
  backgroundMusicAudioId = null;
}

async function startBackgroundMusic() {
  const track = selectedBackgroundMusicTrack();
  if (!track?.audioUrl) return false;
  stopMusicPreview(false);
  if (backgroundMusicAudio && backgroundMusicAudioId === track.id) {
    backgroundMusicAudio.volume = backgroundMusicVolume;
    if (backgroundMusicAudio.paused) await backgroundMusicAudio.play();
    return true;
  }
  releaseBackgroundMusic();
  backgroundMusicAudio = new Audio(track.audioUrl);
  backgroundMusicAudioId = track.id;
  backgroundMusicAudio.loop = true;
  backgroundMusicAudio.volume = backgroundMusicVolume;
  backgroundMusicAudio.onerror = () => {
    releaseBackgroundMusic();
    $("#library-status").textContent = "The affirmation is playing, but the selected background music could not be loaded.";
  };
  await backgroundMusicAudio.play();
  return true;
}

async function toggleMusicPreview(musicId) {
  const track = backgroundMusicTracks.find((item) => item.id === musicId);
  if (!track?.audioUrl) return;
  if (activeMusicPreviewId === musicId && musicPreviewAudio && !musicPreviewAudio.paused) {
    stopMusicPreview();
    return;
  }
  stopLibraryPlayback(false);
  stopMusicPreview(false);
  activeMusicPreviewId = musicId;
  musicPreviewAudio = new Audio(track.audioUrl);
  musicPreviewAudio.volume = backgroundMusicVolume;
  musicPreviewAudio.onended = () => stopMusicPreview();
  musicPreviewAudio.onerror = () => {
    stopMusicPreview();
    $("#music-error").textContent = "This music track could not be previewed.";
  };
  try {
    await musicPreviewAudio.play();
    renderBackgroundMusicDialog();
  } catch (_) {
    stopMusicPreview();
    $("#music-error").textContent = "Music playback was blocked. Click Preview again.";
  }
}

function selectBackgroundMusic(musicId) {
  selectedBackgroundMusicId = musicId || null;
  rememberBackgroundMusicPreference();
  renderBackgroundMusicButton();
  renderBackgroundMusicDialog();
  if (!libraryAudio || libraryAudio.paused) {
    releaseBackgroundMusic();
    return;
  }
  releaseBackgroundMusic();
  startBackgroundMusic().catch(() => {
    $("#library-status").textContent = "The affirmation is playing, but the selected background music could not be started.";
  });
}

function updateBackgroundMusicVolume(value) {
  backgroundMusicVolume = Math.min(1, Math.max(0, Number(value) / 100));
  if (backgroundMusicAudio) backgroundMusicAudio.volume = backgroundMusicVolume;
  if (musicPreviewAudio) musicPreviewAudio.volume = backgroundMusicVolume;
  rememberBackgroundMusicPreference();
  $("#music-volume-value").textContent = Math.round(backgroundMusicVolume * 100) + "%";
}

function readMusicDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const finish = (value, error) => {
      URL.revokeObjectURL(url);
      audio.removeAttribute("src");
      error ? reject(error) : resolve(value);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => Number.isFinite(audio.duration)
      ? finish(audio.duration)
      : finish(null, new Error("Could not read this MP3 duration."));
    audio.onerror = () => finish(null, new Error("Choose a valid MP3 file."));
    audio.src = url;
  });
}

async function uploadBackgroundMusic(event) {
  event.preventDefault();
  if (musicUploadBusy) return;
  const file = $("#music-file").files[0];
  const name = $("#music-name").value.trim();
  const artist = $("#music-artist").value.trim();
  $("#music-error").textContent = "";
  $("#music-upload-status").textContent = "";
  if (!file || !name) return;
  if (!file.name.toLowerCase().endsWith(".mp3")) {
    $("#music-error").textContent = "Choose an MP3 file.";
    return;
  }
  if (file.size > MAX_BACKGROUND_MUSIC_BYTES) {
    $("#music-error").textContent = "Music must be 30 MB or smaller.";
    return;
  }

  const button = $("#add-music-button");
  musicUploadBusy = true;
  button.disabled = true;
  button.textContent = "Uploading…";
  $("#music-upload-status").textContent = "Reading MP3…";
  renderBackgroundMusicDialog();
  try {
    const durationSeconds = await readMusicDuration(file);
    const upload = await awsApi("/background-music/uploads/presign", {
      method: "POST",
      body: JSON.stringify({name, artist, fileSize: file.size}),
    });
    $("#music-upload-status").textContent = "Uploading to AWS…";
    const uploaded = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: upload.requiredHeaders,
      body: file,
    });
    if (!uploaded.ok) throw new Error("AWS upload failed (" + uploaded.status + ").");
    $("#music-upload-status").textContent = "Saving music record…";
    const saved = await awsApi("/background-music/confirm", {
      method: "POST",
      body: JSON.stringify({
        musicId: upload.musicId,
        audioKey: upload.audioKey,
        name,
        artist,
        durationSeconds,
      }),
    });
    await loadBackgroundMusic();
    selectedBackgroundMusicId = saved.track.id;
    rememberBackgroundMusicPreference();
    event.target.reset();
    $("#music-upload-status").textContent = name + " was saved in AWS.";
  } catch (error) {
    $("#music-error").textContent = error.message || "Could not add this music.";
    $("#music-upload-status").textContent = "";
  } finally {
    musicUploadBusy = false;
    button.disabled = false;
    button.textContent = "Add music to AWS";
    renderBackgroundMusicButton();
    renderBackgroundMusicDialog();
  }
}

async function deleteBackgroundMusic(musicId) {
  const track = backgroundMusicTracks.find((item) => item.id === musicId);
  if (!track || musicDeleteBusyId) return;
  if (!confirm("Remove “" + track.name + "” from the shared AWS music library?")) return;
  musicDeleteBusyId = musicId;
  $("#music-error").textContent = "";
  $("#music-upload-status").textContent = "Removing " + track.name + " from AWS…";
  if (activeMusicPreviewId === musicId) stopMusicPreview(false);
  if (selectedBackgroundMusicId === musicId) releaseBackgroundMusic();
  renderBackgroundMusicDialog();
  try {
    await awsApi("/background-music/" + encodeURIComponent(musicId), {method: "DELETE"});
    backgroundMusicTracks = backgroundMusicTracks.filter((item) => item.id !== musicId);
    removeMusicFromPreferences(musicId);
    if (selectedBackgroundMusicId === musicId) selectedBackgroundMusicId = null;
    $("#music-upload-status").textContent = track.name + " was removed from AWS.";
  } catch (error) {
    $("#music-error").textContent = error.message || "Could not remove this music.";
    $("#music-upload-status").textContent = "";
  } finally {
    musicDeleteBusyId = null;
    renderBackgroundMusicButton();
    renderBackgroundMusicDialog();
  }
}

async function openBackgroundMusicDialog() {
  if (!selectedFolderId || !AWS_CONFIGURED) return;
  restoreBackgroundMusicPreference();
  $("#music-error").textContent = "";
  $("#music-upload-status").textContent = "Loading music from AWS…";
  renderBackgroundMusicDialog();
  $("#music-dialog").showModal();
  await loadBackgroundMusic();
  $("#music-upload-status").textContent = "";
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
  await Promise.all([loadVoices(), refreshFolders(), loadBackgroundMusic()]);
  restoreBackgroundMusicPreference();
  renderBackgroundMusicButton();
  renderBackgroundMusicDialog();
}

function showView(name) {
  if (name !== "library") stopLibraryPlayback();
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
    restoreBackgroundMusicPreference();
    rememberFolder();
    renderFolders();
    return refreshAffirmations();
  }
  try {
    const payload = await awsApi("/folders", {cache: "no-store"});
    folders = payload.folders || [];
    selectedFolderId = folders.some((folder) => folder.id === preferredId) ? preferredId : folders[0]?.id || null;
    restoreBackgroundMusicPreference();
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
    ensureSelectedFolderVoice();
    return renderFolders();
  }
  affirmations = [];
  renderAffirmations(true);
  if (!selectedFolderId) return renderAffirmations();
  try {
    const payload = await awsApi(`/folders/${encodeURIComponent(selectedFolderId)}/affirmations`, {cache: "no-store"});
    affirmations = payload.affirmations || [];
    ensureSelectedFolderVoice();
    renderFolders();
  } catch (error) {
    renderAffirmations(false, error.message);
  }
}

function showLibraryError(message) {
  $("#affirmation-list").innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function releaseLibraryAudio() {
  if (!libraryAudio) return;
  libraryAudio.onended = null;
  libraryAudio.onerror = null;
  libraryAudio.pause();
  libraryAudio.currentTime = 0;
  libraryAudio = null;
}

function stopLibraryPlayback(render = true) {
  releaseLibraryAudio();
  releaseBackgroundMusic();
  activeAffirmationId = null;
  isPlayingAll = false;
  playlistIndex = 0;
  $("#library-status").textContent = "";
  if (render) renderAffirmations();
}

async function playLibraryItem(item) {
  const voice = selectedVoiceVersion(item);
  if (!voice?.audioUrl) return;
  releaseLibraryAudio();
  activeAffirmationId = item.identifier;
  libraryAudio = new Audio(voice.audioUrl);
  libraryAudio.onended = () => {
    if (isPlayingAll && playlistIndex + 1 < affirmations.length) {
      playlistIndex += 1;
      playLibraryItem(affirmations[playlistIndex]);
      return;
    }
    stopLibraryPlayback();
  };
  libraryAudio.onerror = () => {
    stopLibraryPlayback();
    $("#library-status").textContent = "This recording could not be played. Refresh the folder and try again.";
  };
  $("#library-status").textContent = isPlayingAll
    ? `Playing ${playlistIndex + 1} of ${affirmations.length}`
    : `Playing ${voice.voiceName}`;
  const musicPlayback = startBackgroundMusic().catch(() => false);
  try {
    await libraryAudio.play();
    const musicStarted = await musicPlayback;
    if (selectedBackgroundMusicTrack() && !musicStarted) {
      $("#library-status").textContent += " · background music unavailable";
    }
    renderAffirmations();
  } catch (_) {
    stopLibraryPlayback();
    $("#library-status").textContent = "Playback was blocked. Click play and try again.";
  }
}

function toggleAffirmationPlayback(identifier) {
  if (activeAffirmationId === identifier && libraryAudio && !libraryAudio.paused) {
    stopLibraryPlayback();
    return;
  }
  const item = affirmations.find((affirmation) => affirmation.identifier === identifier);
  if (!selectedVoiceVersion(item)?.audioUrl) return;
  stopLibraryPlayback(false);
  playLibraryItem(item);
}

function togglePlayAll() {
  if (isPlayingAll) {
    stopLibraryPlayback();
    return;
  }
  if (!affirmations.length) return;
  stopLibraryPlayback(false);
  isPlayingAll = true;
  playlistIndex = 0;
  playLibraryItem(affirmations[0]);
}

function markOrderChanged() {
  orderChanged = true;
  $("#library-status").textContent = "Order changed. Save it when you are ready.";
  renderAffirmations();
}

function moveAffirmation(identifier, direction) {
  if (orderSaving) return;
  const fromIndex = affirmations.findIndex((item) => item.identifier === identifier);
  const toIndex = fromIndex + direction;
  if (fromIndex < 0 || toIndex < 0 || toIndex >= affirmations.length) return;
  stopLibraryPlayback(false);
  [affirmations[fromIndex], affirmations[toIndex]] = [affirmations[toIndex], affirmations[fromIndex]];
  markOrderChanged();
}

function moveAffirmationByDrop(sourceId, targetId, placeAfter) {
  if (orderSaving || sourceId === targetId) return;
  const sourceIndex = affirmations.findIndex((item) => item.identifier === sourceId);
  const targetIndex = affirmations.findIndex((item) => item.identifier === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  stopLibraryPlayback(false);
  const [moved] = affirmations.splice(sourceIndex, 1);
  let insertionIndex = affirmations.findIndex((item) => item.identifier === targetId);
  if (placeAfter) insertionIndex += 1;
  affirmations.splice(insertionIndex, 0, moved);
  markOrderChanged();
}

async function saveAffirmationOrder() {
  if (!orderChanged || orderSaving || !selectedFolderId) return;
  orderSaving = true;
  renderAffirmations();
  $("#library-status").textContent = "Saving order to AWS…";
  const identifiers = affirmations.map((item) => item.identifier);
  try {
    if (AWS_CONFIGURED) {
      await awsApi(`/folders/${encodeURIComponent(selectedFolderId)}/order`, {
        method: "PUT",
        body: JSON.stringify({identifiers}),
      });
    } else {
      const rank = new Map(identifiers.map((identifier, index) => [identifier, index]));
      localAffirmations.sort((left, right) => {
        if (left.folderId !== selectedFolderId || right.folderId !== selectedFolderId) return 0;
        return rank.get(left.identifier) - rank.get(right.identifier);
      });
    }
    orderChanged = false;
    $("#library-status").textContent = AWS_CONFIGURED ? "Order saved in AWS." : "Order saved for this session.";
  } catch (error) {
    $("#library-status").textContent = error.message || "Could not save the order.";
    await refreshAffirmations();
  } finally {
    orderSaving = false;
    renderAffirmations();
  }
}

function clearDropIndicators() {
  $$(".affirmation-card.drop-before, .affirmation-card.drop-after").forEach((card) => {
    card.classList.remove("drop-before", "drop-after");
  });
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

function renderFolderVoicePicker() {
  const picker = $("#folder-voice-picker");
  const select = $("#folder-voice-select");
  const avatar = $("#folder-voice-avatar");
  const deleteButton = $("#delete-folder-voice");
  const complete = completeFolderVoices();
  picker.hidden = !affirmations.length || !complete.length;
  deleteButton.hidden = !affirmations.length || !complete.length;
  deleteButton.disabled = !AWS_CONFIGURED || complete.length < 2 || folderVoiceDeleteBusy;
  deleteButton.title = complete.length < 2
    ? "Add another complete voice before deleting this one"
    : "Delete the selected voice from this folder";
  if (!complete.length) {
    select.innerHTML = "";
    avatar.hidden = true;
    return;
  }
  if (!complete.some((voice) => voice.id === selectedFolderVoiceId)) ensureSelectedFolderVoice();
  select.innerHTML = complete.map((voice) => `<option value="${escapeHtml(voice.id)}">Voice: ${escapeHtml(voice.name)}</option>`).join("");
  select.value = selectedFolderVoiceId || complete[0].id;
  const selected = complete.find((voice) => voice.id === select.value) || complete[0];
  const selectedImage = voiceImageUrl(selected?.id);
  avatar.hidden = !selectedImage;
  avatar.innerHTML = selectedImage
    ? `<img src="${escapeHtml(selectedImage)}" alt="${escapeHtml(selected.name)} portrait">`
    : "";
}

function openDeleteFolderVoiceDialog() {
  const folder = folders.find((item) => item.id === selectedFolderId);
  const complete = completeFolderVoices();
  const selected = complete.find((voice) => voice.id === selectedFolderVoiceId);
  const remaining = complete.filter((voice) => voice.id !== selectedFolderVoiceId);
  if (!folder || !selected || !remaining.length) {
    $("#library-status").textContent = "Add another complete voice before deleting this one.";
    return;
  }
  $("#delete-folder-voice-description").textContent = `Delete “${selected.name}” and its ${affirmations.length} recording${affirmations.length === 1 ? "" : "s"} from “${folder.name}”?`;
  $("#replacement-folder-voice").innerHTML = remaining.map((voice) => `<option value="${escapeHtml(voice.id)}">${escapeHtml(voice.name)}</option>`).join("");
  $("#delete-folder-voice-error").textContent = "";
  $("#confirm-delete-folder-voice").disabled = false;
  $("#confirm-delete-folder-voice").textContent = "Delete from this folder";
  $("#delete-folder-voice-dialog").showModal();
}

async function deleteSelectedFolderVoice(event) {
  event.preventDefault();
  if (folderVoiceDeleteBusy || !selectedFolderId || !selectedFolderVoiceId) return;
  const folderId = selectedFolderId;
  const voiceId = selectedFolderVoiceId;
  const replacementVoiceId = $("#replacement-folder-voice").value;
  const selected = completeFolderVoices().find((voice) => voice.id === voiceId);
  if (!replacementVoiceId || replacementVoiceId === voiceId) {
    $("#delete-folder-voice-error").textContent = "Choose a different voice to keep active.";
    return;
  }

  folderVoiceDeleteBusy = true;
  const button = $("#confirm-delete-folder-voice");
  button.disabled = true;
  button.textContent = "Deleting from AWS…";
  $("#delete-folder-voice-error").textContent = "";
  renderFolderVoicePicker();
  try {
    stopLibraryPlayback(false);
    const result = await awsApi(`/folders/${encodeURIComponent(folderId)}/voices/${encodeURIComponent(voiceId)}`, {
      method: "DELETE",
      body: JSON.stringify({replacementVoiceId}),
    });
    selectedFolderVoiceId = replacementVoiceId;
    rememberFolderVoice(replacementVoiceId);
    $("#delete-folder-voice-dialog").close();
    await refreshFolders(folderId);
    $("#library-status").textContent = `${selected?.name || "Voice"} was removed from this folder in AWS (${result.deletedRecordings} recordings).`;
  } catch (error) {
    $("#delete-folder-voice-error").textContent = error.message || "Could not delete this voice.";
  } finally {
    folderVoiceDeleteBusy = false;
    button.disabled = false;
    button.textContent = "Delete from this folder";
    renderFolderVoicePicker();
  }
}

function renderAffirmations(loading = false, error = "") {
  const folder = folders.find((item) => item.id === selectedFolderId);
  const voiceCount = folderVoiceAvailability().length;
  $("#folder-title").textContent = folder?.name || "Select a folder";
  $("#folder-summary").textContent = `${affirmations.length} affirmation${affirmations.length === 1 ? "" : "s"}${voiceCount ? ` · ${voiceCount} voice${voiceCount === 1 ? "" : "s"}` : ""}`;
  $("#add-to-folder").disabled = !folder;
  $("#add-folder-voice").disabled = !AWS_CONFIGURED || !folder || !affirmations.length || !voices.length;
  $("#play-all").disabled = !folder || !affirmations.length;
  $("#play-all").innerHTML = isPlayingAll
    ? '<span aria-hidden="true">■</span> Stop all'
    : '<span aria-hidden="true">▶</span> Play all';
  $("#save-order").hidden = !orderChanged;
  $("#save-order").disabled = orderSaving;
  $("#save-order").textContent = orderSaving ? "Saving…" : "Save changes to AWS";
  renderBackgroundMusicButton();
  renderFolderVoicePicker();
  const list = $("#affirmation-list");
  if (error) return showLibraryError(error);
  if (loading) {
    list.innerHTML = '<div class="empty-state">Loading saved affirmations…</div>';
  } else if (!folder) {
    list.innerHTML = '<div class="empty-state">Create or select a folder to begin.</div>';
  } else if (!affirmations.length) {
    list.innerHTML = '<div class="empty-state">No saved affirmations in this folder yet.<br>Click “New affirmation” to create one.</div>';
  } else {
    list.innerHTML = affirmations.map((item, index) => {
      const playing = activeAffirmationId === item.identifier && libraryAudio && !libraryAudio.paused;
      const voice = selectedVoiceVersion(item);
      const voiceName = voice?.voiceName || "Voice unavailable";
      const createdAt = voice?.createdAt || item.createdAt;
      const playDisabled = !voice?.audioUrl;
      const download = voice?.audioUrl
        ? `<a href="${escapeHtml(voice.audioUrl)}" download="affirmation-${item.identifier}-${escapeHtml(voice.voiceId)}.mp3" title="Download ${escapeHtml(voiceName)}">⇩</a>`
        : "";
      const voiceImage = voiceImageUrl(voice?.voiceId);
      const voiceLabel = voiceImage
        ? `<span class="affirmation-voice"><img src="${escapeHtml(voiceImage)}" alt="">${escapeHtml(voiceName)}</span>`
        : `<span>${escapeHtml(voiceName)}</span>`;
      return `<article class="affirmation-card${playing ? " playing" : ""}" data-affirmation-id="${escapeHtml(item.identifier)}"><span class="drag-handle" data-drag-id="${escapeHtml(item.identifier)}" draggable="true" aria-hidden="true" title="Drag to reorder">⋮⋮</span><div><p>${escapeHtml(item.title)}</p><div class="affirmation-meta">${voiceLabel}<span>${new Date(createdAt).toLocaleString()}</span><span>${item.local ? "Browser preview" : "Saved in AWS"}</span></div></div><div class="card-actions"><button data-move-id="${escapeHtml(item.identifier)}" data-direction="-1" type="button" aria-label="Move affirmation up" title="Move up"${index === 0 ? " disabled" : ""}>↑</button><button data-move-id="${escapeHtml(item.identifier)}" data-direction="1" type="button" aria-label="Move affirmation down" title="Move down"${index === affirmations.length - 1 ? " disabled" : ""}>↓</button><button data-play-id="${escapeHtml(item.identifier)}" type="button" aria-label="${playing ? "Stop" : "Play"} ${escapeHtml(item.title)}" title="${playing ? "Stop" : "Play"}"${playDisabled ? " disabled" : ""}>${playing ? "■" : "▶"}</button>${download}</div></article>`;
    }).join("");
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
    voices = ((await (await modalApi("/api/voices", {cache: "no-store"})).json()).voices || [])
      .map((voice) => ({...voice, name: voiceDisplayName(voice.name)}));
    selectedVoiceId = voices.some((voice) => voice.id === preferredId) ? preferredId : voices[0]?.id || null;
    renderVoices();
    renderAffirmations();
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
  grid.innerHTML = voices.map((voice) => `<div class="voice-card${voice.id === selectedVoiceId && !customMode ? " selected" : ""}" data-voice="${voice.id}" role="radio" aria-checked="${voice.id === selectedVoiceId && !customMode}">${voiceAvatarMarkup(voice)}<span class="voice-copy"><strong>${escapeHtml(voice.name)}</strong><small>${escapeHtml(voice.style)}</small></span><span class="voice-actions"><button data-preview="${voice.id}" data-default-label="Preview ${escapeHtml(voice.name)}" type="button" aria-label="Preview ${escapeHtml(voice.name)}" aria-pressed="false">▶</button><button class="delete-voice" data-delete-voice="${voice.id}" type="button" aria-label="Delete ${escapeHtml(voice.name)}">×</button></span></div>`).join("");
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
    activePreviewButton.textContent = activePreviewButton.dataset.idleText || "▶";
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
  button.textContent = button.classList.contains("voice-preview-button") ? "… Loading sample" : "…";
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
    button.textContent = button.classList.contains("voice-preview-button") ? "■ Stop preview" : "■";
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

function voiceGenerationData(text, voiceId, referenceFile = null, consent = true) {
  const data = new FormData();
  data.set("text", text);
  data.set("consent", String(consent));
  if (referenceFile) data.set("reference_audio", referenceFile, referenceFile.name);
  else data.set("voice_id", voiceId);
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
  return data;
}

async function generateVoiceBlob(text, voiceId) {
  return (await modalApi("/generate", {
    method: "POST",
    body: voiceGenerationData(text, voiceId),
  })).blob();
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
  const data = voiceGenerationData(
    text,
    selectedVoiceId,
    customMode ? file : null,
    customMode ? $("#custom-consent").checked : true,
  );

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

function stopBatchAudio() {
  if (batchAudio) {
    batchAudio.onended = null;
    batchAudio.onerror = null;
    batchAudio.pause();
    batchAudio.removeAttribute("src");
    batchAudio.load();
  }
  if (batchAudioUrl) URL.revokeObjectURL(batchAudioUrl);
  if (activeBatchButton?.isConnected) {
    activeBatchButton.textContent = "▶";
    activeBatchButton.classList.remove("playing");
    activeBatchButton.setAttribute("aria-pressed", "false");
    activeBatchButton.setAttribute("aria-label", activeBatchButton.dataset.defaultLabel || "Play generated recording");
  }
  if (activeBatchStatus?.isConnected) {
    activeBatchStatus.textContent = activeBatchStatus.dataset.defaultStatus || "Ready to review";
  }
  batchAudio = null;
  batchAudioUrl = null;
  activeBatchButton = null;
  activeBatchStatus = null;
}

function clearFolderVoiceBatch() {
  stopBatchAudio();
  folderVoiceBatch?.items?.forEach((item) => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  });
  folderVoiceBatch = null;
  $("#folder-voice-progress").hidden = true;
  $("#folder-voice-list").innerHTML = "";
  $("#save-folder-voice").hidden = true;
  $("#folder-voice-error").textContent = "";
}

function folderVoiceStatusLabel(item) {
  if (item.status === "existing") return "Already saved";
  if (item.status === "generating") return "Generating…";
  if (item.status === "ready") return "Ready to review";
  if (item.status === "saving") return "Saving to AWS…";
  if (item.status === "saved") return "Saved in AWS";
  if (item.status === "generation-error") return "Generation failed";
  if (item.status === "save-error") return "Save failed";
  return "Waiting";
}

function updateSelectedFolderVoiceSummary() {
  const voice = voices.find((item) => item.id === $("#folder-new-voice").value);
  setVoiceAvatar($("#selected-folder-voice-avatar"), voice);
  $("#selected-folder-voice-name").textContent = voice?.name || "Choose a voice";
  $("#selected-folder-voice-style").textContent = voice?.style || "Select a voice above";
  $("#folder-recording-count").textContent = `${affirmations.length} recording${affirmations.length === 1 ? "" : "s"}`;
  const preview = $("#preview-folder-voice");
  preview.disabled = !voice || folderVoiceBusy;
  preview.dataset.idleText = "▶ Preview voice";
  if (activePreviewButton !== preview) preview.textContent = preview.dataset.idleText;
  preview.dataset.defaultLabel = voice ? `Preview ${voice.name}` : "Preview voice";
  preview.setAttribute("aria-label", preview.dataset.defaultLabel);
}

function renderFolderVoiceBatch() {
  if (!folderVoiceBatch) return;
  const items = folderVoiceBatch.items;
  const phase = folderVoiceBatch.phase || "generating";
  const generating = items.some((item) => item.status === "generating");
  const saving = items.some((item) => item.status === "saving");
  const activeItem = items.find((item) => item.status === "generating" || item.status === "saving");
  const activeIndex = activeItem ? items.indexOf(activeItem) + 1 : 0;
  const failures = items.filter((item) => item.status.endsWith("error")).length;
  const ready = items.filter((item) => ["ready", "save-error"].includes(item.status)).length;
  const completed = phase === "saving"
    ? items.filter((item) => ["existing", "saved"].includes(item.status)).length
    : items.filter((item) => ["existing", "ready", "saved", "save-error"].includes(item.status)).length;
  const percent = items.length ? Math.round((completed / items.length) * 100) : 0;
  const remaining = Math.max(0, items.length - completed);

  $("#folder-voice-progress").hidden = false;
  $("#folder-voice-progress-title").textContent = saving
    ? `Saving recording ${activeIndex} of ${items.length} to AWS`
    : generating
      ? `Generating recording ${activeIndex} of ${items.length}`
      : failures
        ? `${failures} recording${failures === 1 ? " needs" : "s need"} attention`
        : ready
          ? "Ready for your review"
          : "Voice version complete";
  $("#folder-voice-progress-detail").textContent = generating || saving
    ? `${completed} completed · ${remaining} remaining · ${folderVoiceBatch.voice.name}`
    : `${completed} of ${items.length} recordings completed`;
  $("#folder-voice-progress-percent").textContent = `${percent}%`;
  $("#folder-voice-progress-fill").style.width = `${percent}%`;
  $("#folder-voice-progress-track").setAttribute("aria-valuenow", String(percent));
  $("#folder-voice-progress-track").classList.toggle("active", generating || saving);
  $("#folder-voice-list").innerHTML = items.map((item, index) => {
    const canPreview = item.status === "ready" || item.status === "save-error";
    const error = item.error ? `<small>${escapeHtml(item.error)}</small>` : "";
    const status = folderVoiceStatusLabel(item);
    return `<div class="batch-row batch-${escapeHtml(item.status)}"><span class="batch-index">${index + 1}</span><span class="batch-copy"><strong>${escapeHtml(item.title)}</strong><span class="batch-status" data-default-status="${escapeHtml(status)}">${status}</span>${error}</span>${canPreview ? `<button class="batch-play" data-batch-play="${escapeHtml(item.affirmationId)}" data-default-label="Play ${escapeHtml(item.title)}" type="button" aria-label="Play ${escapeHtml(item.title)}" aria-pressed="false">▶</button>` : ""}</div>`;
  }).join("");

  const generateButton = $("#generate-folder-voice");
  const generationFailures = items.filter((item) => item.status === "generation-error").length;
  generateButton.hidden = !generationFailures && items.every((item) => item.status !== "pending");
  generateButton.textContent = generationFailures ? `Retry ${generationFailures} failed recording${generationFailures === 1 ? "" : "s"}` : "Generate voice version";
  generateButton.disabled = folderVoiceBusy;
  $("#save-folder-voice").hidden = !ready || generationFailures > 0;
  $("#save-folder-voice").disabled = folderVoiceBusy;
  $("#save-folder-voice").textContent = items.some((item) => item.status === "save-error") ? "Retry saving to AWS" : `Save ${ready} recording${ready === 1 ? "" : "s"} to AWS`;
  $("#folder-new-voice").disabled = folderVoiceBusy || Boolean(folderVoiceBatch);
  $("#cancel-folder-voice").disabled = folderVoiceBusy;
  $("#preview-folder-voice").disabled = folderVoiceBusy || Boolean(folderVoiceBatch);
}

function openFolderVoiceDialog() {
  const folder = folders.find((item) => item.id === selectedFolderId);
  if (!folder || !affirmations.length) return;
  clearFolderVoiceBatch();
  const availability = new Map(folderVoiceAvailability().map((voice) => [voice.id, voice.count]));
  const candidates = voices.filter((voice) => (availability.get(voice.id) || 0) < affirmations.length);
  $("#folder-voice-description").textContent = `Generate all ${affirmations.length} “${folder.name}” affirmations with another voice while keeping this folder and its order.`;
  $("#folder-new-voice").innerHTML = candidates.map((voice) => {
    const count = availability.get(voice.id) || 0;
    const suffix = count ? ` · resume ${count}/${affirmations.length}` : "";
    return `<option value="${escapeHtml(voice.id)}">${escapeHtml(voice.name)} — ${escapeHtml(voice.style)}${suffix}</option>`;
  }).join("");
  $("#folder-voice-error").textContent = candidates.length ? "" : "Every available voice is already complete for this folder.";
  $("#generate-folder-voice").hidden = !candidates.length;
  $("#generate-folder-voice").disabled = !candidates.length;
  $("#generate-folder-voice").textContent = `Generate ${affirmations.length} recordings`;
  $("#folder-new-voice").disabled = !candidates.length;
  updateSelectedFolderVoiceSummary();
  $("#folder-voice-dialog").showModal();
}

function buildFolderVoiceBatch(voice) {
  return {
    folderId: selectedFolderId,
    voice,
    phase: "idle",
    items: affirmations.map((affirmation) => {
      const existing = itemVoiceVersions(affirmation).find((item) => item.voiceId === voice.id);
      return {
        affirmationId: affirmation.identifier,
        title: affirmation.title,
        status: existing ? "existing" : "pending",
        existing,
        blob: null,
        previewUrl: null,
        error: "",
      };
    }),
  };
}

async function generateFolderVoiceVersion(event) {
  event.preventDefault();
  if (folderVoiceBusy) return;
  const voiceId = $("#folder-new-voice").value;
  const voice = voices.find((item) => item.id === voiceId);
  if (!voice) return $("#folder-voice-error").textContent = "Choose an available voice.";
  if (!folderVoiceBatch || folderVoiceBatch.voice.id !== voiceId) folderVoiceBatch = buildFolderVoiceBatch(voice);

  folderVoiceBusy = true;
  folderVoiceBatch.phase = "generating";
  $("#folder-voice-error").textContent = "";
  renderFolderVoiceBatch();
  const targets = folderVoiceBatch.items.filter((item) => ["pending", "generation-error"].includes(item.status));
  for (const item of targets) {
    item.status = "generating";
    item.error = "";
    renderFolderVoiceBatch();
    try {
      item.blob = await generateVoiceBlob(item.title, voice.id);
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      item.previewUrl = URL.createObjectURL(item.blob);
      item.status = "ready";
    } catch (error) {
      item.status = "generation-error";
      item.error = error.message || "Modal could not generate this recording.";
    }
    renderFolderVoiceBatch();
  }
  folderVoiceBusy = false;
  folderVoiceBatch.phase = folderVoiceBatch.items.some((item) => item.status === "generation-error") ? "blocked" : "review";
  renderFolderVoiceBatch();
}

async function saveFolderVoiceVersion() {
  if (!folderVoiceBatch || folderVoiceBusy) return;
  folderVoiceBusy = true;
  folderVoiceBatch.phase = "saving";
  $("#folder-voice-error").textContent = "";
  const targets = folderVoiceBatch.items.filter((item) => ["ready", "save-error"].includes(item.status));
  for (const item of targets) {
    item.status = "saving";
    item.error = "";
    renderFolderVoiceBatch();
    try {
      const upload = await awsApi("/voice-uploads/presign", {
        method: "POST",
        body: JSON.stringify({
          folderId: folderVoiceBatch.folderId,
          affirmationId: item.affirmationId,
          voiceId: folderVoiceBatch.voice.id,
        }),
      });
      const uploaded = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: upload.requiredHeaders,
        body: item.blob,
      });
      if (!uploaded.ok) throw new Error(`Audio upload failed (${uploaded.status}).`);
      await awsApi("/voice-versions/confirm", {
        method: "POST",
        body: JSON.stringify({
          folderId: folderVoiceBatch.folderId,
          affirmationId: item.affirmationId,
          voiceId: folderVoiceBatch.voice.id,
          voiceName: folderVoiceBatch.voice.name,
          audioKey: upload.audioKey,
        }),
      });
      item.status = "saved";
    } catch (error) {
      item.status = "save-error";
      item.error = error.message || "AWS could not save this recording.";
    }
    renderFolderVoiceBatch();
  }
  folderVoiceBusy = false;
  const failed = folderVoiceBatch.items.filter((item) => item.status === "save-error").length;
  if (failed) {
    folderVoiceBatch.phase = "saving";
    $("#folder-voice-error").textContent = `${failed} recording${failed === 1 ? " was" : "s were"} not saved. Your previews are still here; retry when ready.`;
    return renderFolderVoiceBatch();
  }

  const completedVoice = folderVoiceBatch.voice;
  const folderId = folderVoiceBatch.folderId;
  selectedFolderVoiceId = completedVoice.id;
  rememberFolderVoice(completedVoice.id);
  await refreshFolders(folderId);
  selectedFolderVoiceId = completedVoice.id;
  rememberFolderVoice(completedVoice.id);
  $("#folder-voice-dialog").close();
  clearFolderVoiceBatch();
  $("#library-status").textContent = `${completedVoice.name} was added to the same folder and saved in AWS.`;
  renderAffirmations();
}

async function playBatchPreview(affirmationId, button) {
  const item = folderVoiceBatch?.items.find((candidate) => candidate.affirmationId === affirmationId);
  if (!item?.blob && !item?.previewUrl) {
    $("#folder-voice-error").textContent = "This preview is no longer available. Generate the recording again.";
    return;
  }
  if (activeBatchButton === button && batchAudio && !batchAudio.paused) {
    stopBatchAudio();
    return;
  }

  stopBatchAudio();
  stopActivePreview();
  $("#folder-voice-error").textContent = "";
  batchAudioUrl = item.blob ? URL.createObjectURL(item.blob) : null;
  batchAudio = new Audio();
  batchAudio.preload = "auto";
  batchAudio.src = batchAudioUrl || item.previewUrl;
  activeBatchButton = button;
  activeBatchStatus = button.closest(".batch-row")?.querySelector(".batch-status") || null;
  button.textContent = "■";
  button.classList.add("playing");
  button.setAttribute("aria-pressed", "true");
  button.setAttribute("aria-label", `Stop ${item.title}`);
  if (activeBatchStatus) activeBatchStatus.textContent = "Playing preview…";
  batchAudio.onended = stopBatchAudio;
  batchAudio.onerror = () => {
    stopBatchAudio();
    $("#folder-voice-error").textContent = "This generated audio could not be played. Generate it again and retry.";
  };
  try {
    await batchAudio.play();
  } catch (error) {
    stopBatchAudio();
    $("#folder-voice-error").textContent = error?.name === "NotAllowedError"
      ? "Your browser blocked audio playback. Click the play button again."
      : "This generated audio could not be played. Generate it again and retry.";
  }
}

$("#login-form").addEventListener("submit", verifyLogin);
$("#sign-out").addEventListener("click", () => { sessionStorage.removeItem("gratitude-voice-access"); location.reload(); });
$$('[data-view], [data-view-link]').forEach((element) => element.addEventListener("click", (event) => { event.preventDefault(); showView(element.dataset.view || element.dataset.viewLink); }));
$("#folder-list").addEventListener("click", async (event) => { const button = event.target.closest("[data-folder]"); if (!button) return; stopLibraryPlayback(false); orderChanged = false; selectedFolderId = button.dataset.folder; selectedFolderVoiceId = loadFolderVoicePreferences()[selectedFolderId] || null; restoreBackgroundMusicPreference(); rememberFolder(); renderFolders(); await refreshAffirmations(); });
$("#new-folder").addEventListener("click", () => $("#folder-dialog").showModal());
$("#folder-form").addEventListener("submit", async (event) => { event.preventDefault(); const button = event.submitter; button.disabled = true; $("#folder-error").textContent = ""; try { await createFolder($("#folder-name").value); event.target.reset(); $("#folder-dialog").close(); } catch (error) { $("#folder-error").textContent = error.message; } finally { button.disabled = false; } });
$("#new-affirmation").addEventListener("click", () => { if (!folders.length) return $("#folder-dialog").showModal(); showView("generate"); });
$("#add-to-folder").addEventListener("click", () => { if (!selectedFolderId) return; showView("generate"); });
$("#play-all").addEventListener("click", togglePlayAll);
$("#background-music").addEventListener("click", openBackgroundMusicDialog);
$("#music-volume").addEventListener("input", (event) => updateBackgroundMusicVolume(event.target.value));
$("#music-list").addEventListener("change", (event) => {
  const choice = event.target.closest("[data-music-select]");
  if (choice) selectBackgroundMusic(choice.value);
});
$("#music-list").addEventListener("click", (event) => {
  const preview = event.target.closest("[data-music-preview]");
  const remove = event.target.closest("[data-music-delete]");
  if (preview) return toggleMusicPreview(preview.dataset.musicPreview);
  if (remove) return deleteBackgroundMusic(remove.dataset.musicDelete);
});
$("#music-upload-form").addEventListener("submit", uploadBackgroundMusic);
$("#save-order").addEventListener("click", saveAffirmationOrder);
$("#add-folder-voice").addEventListener("click", openFolderVoiceDialog);
$("#delete-folder-voice").addEventListener("click", openDeleteFolderVoiceDialog);
$("#folder-voice-select").addEventListener("change", (event) => { stopLibraryPlayback(false); selectedFolderVoiceId = event.target.value; rememberFolderVoice(); renderAffirmations(); });
$("#folder-select").addEventListener("change", (event) => { selectedFolderId = event.target.value; rememberFolder(); });
$("#affirmation-list").addEventListener("click", (event) => { const play = event.target.closest("[data-play-id]"); const move = event.target.closest("[data-move-id]"); if (play) return toggleAffirmationPlayback(play.dataset.playId); if (move) moveAffirmation(move.dataset.moveId, Number(move.dataset.direction)); });
$("#affirmation-list").addEventListener("dragstart", (event) => { const handle = event.target.closest("[data-drag-id]"); if (!handle || orderSaving) return event.preventDefault(); draggedAffirmationId = handle.dataset.dragId; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", draggedAffirmationId); handle.closest(".affirmation-card")?.classList.add("dragging"); });
$("#affirmation-list").addEventListener("dragover", (event) => { const card = event.target.closest("[data-affirmation-id]"); if (!card || !draggedAffirmationId || card.dataset.affirmationId === draggedAffirmationId) return; event.preventDefault(); clearDropIndicators(); const placeAfter = event.clientY > card.getBoundingClientRect().top + card.offsetHeight / 2; card.classList.add(placeAfter ? "drop-after" : "drop-before"); event.dataTransfer.dropEffect = "move"; });
$("#affirmation-list").addEventListener("drop", (event) => { const card = event.target.closest("[data-affirmation-id]"); if (!card || !draggedAffirmationId) return; event.preventDefault(); const placeAfter = event.clientY > card.getBoundingClientRect().top + card.offsetHeight / 2; moveAffirmationByDrop(draggedAffirmationId, card.dataset.affirmationId, placeAfter); draggedAffirmationId = null; clearDropIndicators(); });
$("#affirmation-list").addEventListener("dragend", () => { draggedAffirmationId = null; clearDropIndicators(); $$(".affirmation-card.dragging").forEach((card) => card.classList.remove("dragging")); });
$("#voice-grid").addEventListener("click", async (event) => { const preview = event.target.closest("[data-preview]"); const remove = event.target.closest("[data-delete-voice]"); if (preview) { event.stopPropagation(); return previewVoice(preview.dataset.preview, preview); } if (remove) { event.stopPropagation(); const voice = voices.find((item) => item.id === remove.dataset.deleteVoice); if (!voice || !confirm(`Delete voice “${voice.name}”? This cannot be undone.`)) return; try { await modalApi(`/api/voices/${encodeURIComponent(voice.id)}`, {method: "DELETE"}); await loadVoices(); } catch (error) { showStatus(error.message, true); } return; } const card = event.target.closest("[data-voice]"); if (card) { customMode = false; $("#custom-upload").hidden = true; selectedVoiceId = card.dataset.voice; renderVoices(); } });
$("#toggle-custom").addEventListener("click", () => { customMode = !customMode; $("#custom-upload").hidden = !customMode; $("#toggle-custom").textContent = customMode ? "Use a prebuilt voice instead" : "Or upload a custom voice sample"; renderVoices(); });
$("#custom-audio").addEventListener("change", (event) => { $("#custom-filename").textContent = event.target.files[0]?.name || ""; });
$("#affirmation-text").addEventListener("input", (event) => { $("#text-count").textContent = event.target.value.length; });
[$("#speed"), $("#steps"), $("#guidance"), $("#word-gap")].forEach((input) => input.addEventListener("input", updateSettings));
$("#generate-form").addEventListener("submit", generate);
$("#confirm-save").addEventListener("click", confirmSave);
$("#folder-voice-form").addEventListener("submit", generateFolderVoiceVersion);
$("#delete-folder-voice-form").addEventListener("submit", deleteSelectedFolderVoice);
$("#save-folder-voice").addEventListener("click", saveFolderVoiceVersion);
$("#folder-new-voice").addEventListener("change", () => { stopActivePreview(); updateSelectedFolderVoiceSummary(); });
$("#preview-folder-voice").addEventListener("click", (event) => { const voiceId = $("#folder-new-voice").value; if (voiceId) previewVoice(voiceId, event.currentTarget); });
$("#folder-voice-list").addEventListener("click", (event) => { const button = event.target.closest("[data-batch-play]"); if (button) playBatchPreview(button.dataset.batchPlay, button); });
$("#open-voice-manager").addEventListener("click", () => $("#voice-dialog").showModal());
$("#voice-form").addEventListener("submit", async (event) => { event.preventDefault(); const button = $("#add-voice-button"); $("#voice-error").textContent = ""; button.disabled = true; button.textContent = "Adding…"; try { const data = new FormData(event.target); data.set("consent", String($("#voice-consent").checked)); const voice = (await (await modalApi("/api/voices", {method: "POST", body: data})).json()).voice; event.target.reset(); $("#voice-dialog").close(); await loadVoices(voice.id); } catch (error) { $("#voice-error").textContent = error.message; } finally { button.disabled = false; button.textContent = "Add to library"; } });
$$('[data-close-dialog]').forEach((button) => button.addEventListener("click", () => {
  const dialog = button.closest("dialog");
  if (dialog.id === "folder-voice-dialog") {
    if (folderVoiceBusy) return;
    clearFolderVoiceBatch();
  }
  if (dialog.id === "delete-folder-voice-dialog" && folderVoiceDeleteBusy) return;
  if (dialog.id === "music-dialog") {
    if (musicUploadBusy || musicDeleteBusyId) return;
    stopMusicPreview(false);
  }
  dialog.close();
}));
$("#folder-voice-dialog").addEventListener("cancel", (event) => {
  if (folderVoiceBusy) return event.preventDefault();
  clearFolderVoiceBatch();
});
$("#delete-folder-voice-dialog").addEventListener("cancel", (event) => {
  if (folderVoiceDeleteBusy) event.preventDefault();
});
$("#music-dialog").addEventListener("cancel", (event) => {
  if (musicUploadBusy || musicDeleteBusyId) return event.preventDefault();
  stopMusicPreview(false);
});

updateSettings();
if (accessCode) {
  modalApi("/api/auth/check", {cache: "no-store"}).then(showApp).catch(() => { sessionStorage.removeItem("gratitude-voice-access"); accessCode = ""; });
}
