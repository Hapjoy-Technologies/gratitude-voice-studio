const MODAL_BASE_URL = "https://pritesh--omnivoice-web-studio-web-app.modal.run";
// Filled with the isolated GratitudeVoiceStudioApi Lambda Function URL at deploy time.
const AWS_API_BASE_URL = "https://a6c42ttu3mqldnamijycyue27m0jgbae.lambda-url.us-east-1.on.aws";
const AWS_CONFIGURED = !AWS_API_BASE_URL.startsWith("__");
const STAGING_CATALOG_SOURCE = "v3_dev";
const LOCAL_FOLDER_STORAGE_KEY = "gratitude-voice-studio-folders-v1";
const FOLDER_VOICE_STORAGE_KEY = "gratitude-voice-studio-folder-voices-v1";
const BACKGROUND_MUSIC_STORAGE_KEY = "gratitude-voice-studio-background-music-v1";
const PLAY_ALL_PAUSE_STORAGE_KEY = "gratitude-voice-studio-play-all-pause-v1";
const DEFAULT_BACKGROUND_MUSIC_VOLUME = 0.18;
const DEFAULT_PLAY_ALL_PAUSE_SECONDS = 3;
const PLAY_ALL_PAUSE_OPTIONS = [2, 3, 6, 8, 12];
const MAX_BACKGROUND_MUSIC_BYTES = 30 * 1024 * 1024;
const MAX_FOLDER_COVER_BYTES = 8 * 1024 * 1024;
const MAX_VOICE_SAMPLE_BYTES = 12 * 1024 * 1024;
const MIN_VOICE_SAMPLE_SECONDS = 3;
const MAX_VOICE_SAMPLE_SECONDS = 30;
const GENERATION_POLL_INTERVAL_MS = 2500;
const VOICE_CLONE_SCRIPT = "As I begin this moment, I take a slow and steady breath. I allow my shoulders to soften and my thoughts to become quiet. I am safe, I am present, and I trust myself to move through today with calm, courage, and kindness.";
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
const FOLDER_COVER_PALETTES = [
  ["#c98fa4", "#73527d", "#f0c7a9"],
  ["#78a9a6", "#355e68", "#c7dcae"],
  ["#d9a06f", "#8b565e", "#f1d29a"],
  ["#91a0c7", "#514e79", "#d7b7ce"],
  ["#a9b985", "#566b58", "#e2caa2"],
  ["#c98b79", "#704757", "#eac6b6"],
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const voiceDisplayName = (name) => VOICE_DISPLAY_NAMES[String(name || "").trim().toLocaleLowerCase()] || name;

let accessCode = sessionStorage.getItem("gratitude-voice-access") || "";
let folders = [];
let stagingFolders = [];
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
let playerAffirmationId = null;
let playerActiveWord = -1;
let libraryDetailOpen = false;
let libraryVolume = 1;
let isPlayingAll = false;
let playlistIndex = 0;
let playAllPauseSeconds = DEFAULT_PLAY_ALL_PAUSE_SECONDS;
let playAllPauseTimer = null;
let draggedAffirmationId = null;
let orderChanged = false;
let orderSaving = false;
let selectedFolderVoiceId = null;
let folderVoiceBatch = null;
let folderVoiceBusy = false;
let folderVoiceDeleteBusy = false;
let folderVoiceDeleteId = null;
let folderVoiceDeleteReplacementId = null;
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
let voiceSourceMode = "record";
let voiceMediaRecorder = null;
let voiceMediaStream = null;
let voiceRecordingChunks = [];
let voiceRecordingFile = null;
let voiceRecordingUrl = null;
let voiceRecordingStartedAt = 0;
let voiceRecordingSeconds = 0;
let voiceRecordingTimer = null;
let voiceCloneSaving = false;
let folderCoverPreviewUrl = null;
let folderCoverRemoveRequested = false;
let folderCustomizeBusy = false;
let folderCustomizeId = null;
let openFolderMenuId = null;
let folderMenuLastTrigger = null;
let folderDeleteId = null;
let folderDeleteBusy = false;

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

function loadPlayAllPausePreferences() {
  try {
    const value = JSON.parse(localStorage.getItem(PLAY_ALL_PAUSE_STORAGE_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch (_) {
    return {};
  }
}

function restorePlayAllPausePreference() {
  const seconds = Number(loadPlayAllPausePreferences()[selectedFolderId]);
  playAllPauseSeconds = PLAY_ALL_PAUSE_OPTIONS.includes(seconds)
    ? seconds
    : DEFAULT_PLAY_ALL_PAUSE_SECONDS;
}

function rememberPlayAllPausePreference() {
  if (!selectedFolderId) return;
  const preferences = loadPlayAllPausePreferences();
  preferences[selectedFolderId] = playAllPauseSeconds;
  localStorage.setItem(PLAY_ALL_PAUSE_STORAGE_KEY, JSON.stringify(preferences));
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
      const current = available.get(voice.voiceId) || {
        id: voice.voiceId,
        name: voice.voiceName || "Voice",
        count: 0,
        imageUrl: voice.imageUrl || "",
        order: Number.isInteger(voice.order) ? voice.order : 999,
        readOnly: Boolean(voice.readOnly),
        source: voice.source || "",
      };
      current.count += 1;
      current.readOnly = current.readOnly && Boolean(voice.readOnly);
      available.set(voice.voiceId, current);
    });
  });
  return [...available.values()].sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
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

function folderCoverPalette(folder) {
  const seed = String(folder?.id || folder?.name || "gratitude");
  let hash = 0;
  for (const character of seed) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return FOLDER_COVER_PALETTES[Math.abs(hash) % FOLDER_COVER_PALETTES.length];
}

function folderCoverStyle(folder) {
  const [first, second, accent] = folderCoverPalette(folder);
  return `--cover-a:${first};--cover-b:${second};--cover-c:${accent}`;
}

function folderMark(folder) {
  return String(folder?.name || "G").trim().slice(0, 1).toLocaleUpperCase() || "G";
}

function folderSectionName(folder) {
  return String(folder?.section || "").trim() || "Your collections";
}

function folderCoverContent(folder, {withPlay = true} = {}) {
  const image = folder?.coverUrl
    ? `<img src="${escapeHtml(folder.coverUrl)}" alt="">`
    : `<span>${escapeHtml(folderMark(folder))}</span>`;
  return `${image}${withPlay ? '<i aria-hidden="true"></i>' : ""}`;
}

function applyFolderCover(element, folder, {withPlay = true} = {}) {
  if (!element) return;
  element.setAttribute("style", folderCoverStyle(folder));
  element.classList.toggle("has-cover-image", Boolean(folder?.coverUrl));
  element.innerHTML = folderCoverContent(folder, {withPlay});
}

function closeFolderCardMenus(focusTrigger = false) {
  openFolderMenuId = null;
  $$("[data-folder-menu]").forEach((menu) => { menu.hidden = true; });
  $$("[data-folder-menu-trigger]").forEach((trigger) => trigger.setAttribute("aria-expanded", "false"));
  $$(".collection-card.menu-open").forEach((card) => card.classList.remove("menu-open"));
  if (focusTrigger && folderMenuLastTrigger?.isConnected) folderMenuLastTrigger.focus();
  if (!focusTrigger) folderMenuLastTrigger = null;
}

function toggleFolderCardMenu(folderId, trigger, focusFirst = false) {
  const opening = openFolderMenuId !== folderId;
  closeFolderCardMenus(false);
  if (!opening) return;
  openFolderMenuId = folderId;
  folderMenuLastTrigger = trigger;
  trigger.setAttribute("aria-expanded", "true");
  const menu = document.querySelector(`[data-folder-menu="${CSS.escape(folderId)}"]`);
  if (!menu) return;
  menu.hidden = false;
  trigger.closest(".collection-card")?.classList.add("menu-open");
  if (focusFirst) menu.querySelector("button")?.focus();
}

function renderLibraryMode() {
  const overview = $("#collection-browser");
  const detail = $("#folder-detail");
  const heading = $(".library-page-heading");
  if (!overview || !detail) return;
  overview.hidden = libraryDetailOpen;
  detail.hidden = !libraryDetailOpen;
  if (heading) heading.hidden = libraryDetailOpen;
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
  const playerMusicName = $("#player-music-name");
  if (playerMusicName) playerMusicName.textContent = track?.name || "No background music";
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
  renderPlayerPanel();
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
    $("#music-file-name").textContent = "Choose an MP3 file";
    $("#music-upload-status").textContent = name + " was saved in AWS.";
  } catch (error) {
    $("#music-error").textContent = error.message || "Could not add this music.";
    $("#music-upload-status").textContent = "";
  } finally {
    musicUploadBusy = false;
    button.disabled = false;
    button.innerHTML = '<span aria-hidden="true">＋</span> Add music';
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
  $("#storage-mode").textContent = AWS_CONFIGURED ? "v3 staging · AWS dev audio" : "Browser draft";
  renderFolders();
  await Promise.all([loadVoices(), refreshFolders(), loadBackgroundMusic()]);
  restoreBackgroundMusicPreference();
  restorePlayAllPausePreference();
  renderBackgroundMusicButton();
  renderPlayAllPausePicker();
  renderBackgroundMusicDialog();
}

function mergeStagingFolders(savedFolders, catalogFolders) {
  const savedById = new Map(savedFolders.map((folder) => [folder.id, folder]));
  const mergedStaging = catalogFolders.map((catalogFolder) => {
    const saved = savedById.get(catalogFolder.id);
    savedById.delete(catalogFolder.id);
    return {
      ...(saved || {}),
      ...catalogFolder,
      source: STAGING_CATALOG_SOURCE,
      prepared: Boolean(saved),
      coverKey: saved?.coverKey,
      coverUrl: saved?.coverUrl || catalogFolder.coverUrl,
    };
  });
  return [...mergedStaging, ...savedById.values()];
}

function showView(name) {
  if (name !== "library") stopLibraryPlayback();
  $("#library-view").hidden = name !== "library";
  $("#generate-view").hidden = name !== "generate";
  $$(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
  if (name === "generate") renderFolderSelect();
  if (name === "library") renderLibraryMode();
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
    restorePlayAllPausePreference();
    rememberFolder();
    renderFolders();
    return refreshAffirmations();
  }
  try {
    const savedPayload = await awsApi("/folders", {cache: "no-store"});
    let catalogError = null;
    try {
      const catalogPayload = await awsApi("/staging-catalog", {cache: "no-store"});
      stagingFolders = catalogPayload.folders || [];
    } catch (error) {
      stagingFolders = [];
      catalogError = error;
    }
    folders = mergeStagingFolders(savedPayload.folders || [], stagingFolders);
    selectedFolderId = folders.some((folder) => folder.id === preferredId) ? preferredId : folders[0]?.id || null;
    restoreBackgroundMusicPreference();
    restorePlayAllPausePreference();
    rememberFolder();
    if (!libraryDetailOpen) affirmations = [];
    renderFolders();
    if (libraryDetailOpen) await refreshAffirmations();
    if (catalogError) {
      $("#library-status").textContent = catalogError.message || "The v3 staging categories could not be loaded.";
    }
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
    const folder = folders.find((item) => item.id === selectedFolderId);
    if (folder?.source === STAGING_CATALOG_SOURCE) {
      const prepared = await awsApi(`/staging-catalog/folders/${encodeURIComponent(selectedFolderId)}/prepare`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      Object.assign(folder, prepared.folder || {}, {source: STAGING_CATALOG_SOURCE, prepared: true});
    }
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
  libraryAudio.onloadedmetadata = null;
  libraryAudio.ontimeupdate = null;
  libraryAudio.onplay = null;
  libraryAudio.onpause = null;
  libraryAudio.pause();
  libraryAudio.currentTime = 0;
  libraryAudio = null;
}

function clearPlayAllPauseTimer() {
  if (playAllPauseTimer) clearTimeout(playAllPauseTimer);
  playAllPauseTimer = null;
}

function stopLibraryPlayback(render = true) {
  clearPlayAllPauseTimer();
  releaseLibraryAudio();
  releaseBackgroundMusic();
  activeAffirmationId = null;
  isPlayingAll = false;
  playlistIndex = 0;
  $("#library-status").textContent = "";
  if (render) renderAffirmations();
  else renderPlayerPanel();
}

function scheduleNextPlaylistItem() {
  const nextIndex = playlistIndex + 1;
  if (!isPlayingAll || nextIndex >= affirmations.length) {
    stopLibraryPlayback();
    return;
  }

  releaseLibraryAudio();
  activeAffirmationId = null;
  $("#library-status").textContent = `Pausing ${playAllPauseSeconds} seconds · next is ${nextIndex + 1} of ${affirmations.length}`;
  renderAffirmations();
  playAllPauseTimer = setTimeout(() => {
    playAllPauseTimer = null;
    if (!isPlayingAll) return;
    playlistIndex = nextIndex;
    playLibraryItem(affirmations[playlistIndex]);
  }, playAllPauseSeconds * 1000);
}

async function playLibraryItem(item) {
  const voice = selectedVoiceVersion(item);
  if (!voice?.audioUrl) return;
  releaseLibraryAudio();
  activeAffirmationId = item.identifier;
  playerAffirmationId = item.identifier;
  playerActiveWord = -1;
  libraryAudio = new Audio(voice.audioUrl);
  libraryAudio.preload = "metadata";
  libraryAudio.volume = libraryVolume;
  libraryAudio.onloadedmetadata = updatePlayerProgress;
  libraryAudio.ontimeupdate = updatePlayerProgress;
  libraryAudio.onplay = renderPlayerPanel;
  libraryAudio.onpause = renderPlayerPanel;
  libraryAudio.onended = () => {
    if (isPlayingAll && playlistIndex + 1 < affirmations.length) {
      scheduleNextPlaylistItem();
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
  renderPlayerPanel();
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

function formatPlaybackTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function currentPlayerItem() {
  return affirmations.find((item) => item.identifier === (activeAffirmationId || playerAffirmationId))
    || affirmations[0]
    || null;
}

function renderPlayerTranscript(item) {
  const transcript = $("#player-transcript");
  if (!transcript) return;
  const words = String(item?.title || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    transcript.classList.remove("long", "very-long");
    transcript.removeAttribute("aria-label");
    transcript.textContent = "Select any affirmation to see each word flow with the voice.";
    return;
  }
  transcript.classList.toggle("long", words.length > 16);
  transcript.classList.toggle("very-long", words.length > 30);
  transcript.setAttribute("aria-label", item.title);
  transcript.innerHTML = words.map((word, index) => `<span class="word" data-player-word="${index}" aria-hidden="true">${escapeHtml(word)}</span>`).join(" ");
}

function renderPlayerPanel() {
  const panel = $("#player-panel");
  if (!panel) return;
  const folder = folders.find((item) => item.id === selectedFolderId);
  const item = currentPlayerItem();
  const track = selectedBackgroundMusicTrack();
  const playing = Boolean(item && activeAffirmationId === item.identifier && libraryAudio && !libraryAudio.paused);
  const voice = selectedVoiceVersion(item);
  const itemIndex = item ? affirmations.findIndex((candidate) => candidate.identifier === item.identifier) : -1;
  $("#player-title").textContent = item ? `Affirmation ${itemIndex + 1}` : "Mindful session";
  $("#player-voice").textContent = item
    ? `${voice?.voiceName || "Voice unavailable"} · ${itemIndex + 1} of ${affirmations.length}`
    : "Tap play to begin a mindful listening session.";
  $("#player-state").textContent = playing
    ? "Playing now"
    : isPlayingAll && !libraryAudio
      ? `A ${playAllPauseSeconds}-second mindful pause`
      : item
        ? "Ready to listen"
        : "Choose an affirmation";
  $("#player-toggle").textContent = playing ? "■" : "▶";
  $("#player-toggle").setAttribute("aria-label", playing ? "Stop affirmation" : "Play affirmation");
  $("#player-toggle").disabled = !voice?.audioUrl;
  $("#player-previous").disabled = itemIndex <= 0;
  $("#player-next").disabled = itemIndex < 0 || itemIndex >= affirmations.length - 1;
  $("#player-music-name").textContent = track?.name || "No background music";
  $("#player-volume").value = String(Math.round(libraryVolume * 100));
  renderPlayerTranscript(item);
  updatePlayerProgress();
}

function updatePlayerProgress() {
  const seek = $("#player-seek");
  if (!seek) return;
  const item = currentPlayerItem();
  const isCurrentAudio = Boolean(item && libraryAudio && activeAffirmationId === item.identifier);
  const duration = isCurrentAudio && Number.isFinite(libraryAudio.duration) ? libraryAudio.duration : 0;
  const currentTime = isCurrentAudio ? libraryAudio.currentTime : 0;
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  seek.value = String(Math.round(progress * 1000));
  seek.disabled = !duration;
  $("#player-current-time").textContent = formatPlaybackTime(currentTime);
  $("#player-duration").textContent = formatPlaybackTime(duration);

  const wordElements = $$("#player-transcript [data-player-word]");
  const nextActiveWord = currentTime > 0 && wordElements.length
    ? Math.min(wordElements.length - 1, Math.floor(progress * wordElements.length))
    : -1;
  wordElements.forEach((word, index) => {
    word.classList.toggle("past", index < nextActiveWord);
    word.classList.toggle("active", index === nextActiveWord);
  });
  if (nextActiveWord !== playerActiveWord) {
    playerActiveWord = nextActiveWord;
  }
}

function togglePlayerPlayback() {
  const item = currentPlayerItem();
  if (!item) return;
  if (activeAffirmationId === item.identifier && libraryAudio && !libraryAudio.paused) {
    stopLibraryPlayback();
    return;
  }
  stopLibraryPlayback(false);
  playLibraryItem(item);
}

function playRelativeAffirmation(direction) {
  const item = currentPlayerItem();
  const currentIndex = item ? affirmations.findIndex((candidate) => candidate.identifier === item.identifier) : -1;
  const nextItem = affirmations[currentIndex + direction];
  if (!nextItem || !selectedVoiceVersion(nextItem)?.audioUrl) return;
  stopLibraryPlayback(false);
  playerAffirmationId = nextItem.identifier;
  playLibraryItem(nextItem);
}

function closePlayAllPauseMenu(focusTrigger = false) {
  const menu = $("#play-all-pause-menu");
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  $("#play-all-pause-trigger").setAttribute("aria-expanded", "false");
  if (focusTrigger) $("#play-all-pause-trigger").focus();
}

function togglePlayAllPauseMenu() {
  const menu = $("#play-all-pause-menu");
  const opening = menu.hidden;
  closeFolderVoiceMenu();
  menu.hidden = !opening;
  $("#play-all-pause-trigger").setAttribute("aria-expanded", String(opening));
  if (opening) menu.querySelector(".selected")?.focus();
}

function renderPlayAllPausePicker() {
  const trigger = $("#play-all-pause-trigger");
  if (!trigger) return;
  trigger.disabled = !selectedFolderId || !affirmations.length;
  $("#play-all-pause-label").textContent = `${playAllPauseSeconds}s`;
  $$('[data-play-all-pause]').forEach((option) => {
    const selected = Number(option.dataset.playAllPause) === playAllPauseSeconds;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-selected", String(selected));
  });
  if (trigger.disabled) closePlayAllPauseMenu();
}

function selectPlayAllPause(seconds) {
  const value = Number(seconds);
  if (!PLAY_ALL_PAUSE_OPTIONS.includes(value)) return;
  playAllPauseSeconds = value;
  rememberPlayAllPausePreference();
  renderPlayAllPausePicker();
  closePlayAllPauseMenu(true);
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
    list.innerHTML = '<div class="empty-state small">No collections yet.<br>Create your first affirmation folder.</div>';
  } else {
    const groups = new Map();
    folders.forEach((folder) => {
      const section = folderSectionName(folder);
      if (!groups.has(section)) groups.set(section, []);
      groups.get(section).push(folder);
    });
    list.innerHTML = [...groups.entries()].map(([section, sectionFolders]) => {
      const cards = sectionFolders.map((folder) => {
      const storedCount = Number(folder.affirmationCount ?? folder.recordingCount ?? folder.count);
      const count = Number.isFinite(storedCount) && storedCount >= 0
        ? storedCount
        : folder.id === selectedFolderId
          ? affirmations.length
          : null;
      const subtitle = count === null
        ? "Open affirmation collection"
        : `${count} affirmation${count === 1 ? "" : "s"}${folder.source === STAGING_CATALOG_SOURCE ? ` · ${folder.existingVoiceCount || 0} existing voice${folder.existingVoiceCount === 1 ? "" : "s"}` : ""}`;
      const managedByStaging = folder.source === STAGING_CATALOG_SOURCE;
      const menuOpen = !managedByStaging && openFolderMenuId === folder.id;
      const managementMenu = managedByStaging ? "" : `
        <button class="collection-card-menu-trigger" data-folder-menu-trigger="${escapeHtml(folder.id)}" type="button" aria-label="More options for ${escapeHtml(folder.name)}" aria-haspopup="menu" aria-expanded="${menuOpen}"${AWS_CONFIGURED ? "" : " disabled"}><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.8"></circle><circle cx="12" cy="12" r="1.8"></circle><circle cx="12" cy="19" r="1.8"></circle></svg></button>
        <div class="collection-card-menu" data-folder-menu="${escapeHtml(folder.id)}" role="menu"${menuOpen ? "" : " hidden"}>
          <div class="collection-card-menu-label">
            <span class="collection-menu-cover${folder.coverUrl ? " has-cover-image" : ""}" style="${folderCoverStyle(folder)}">${folderCoverContent(folder, {withPlay: false})}</span>
            <span class="collection-menu-heading"><strong>${escapeHtml(folder.name)}</strong><small>Manage folder</small></span>
          </div>
          <button data-folder-action="edit" data-folder-id="${escapeHtml(folder.id)}" type="button" role="menuitem"><span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 20h4l10.4-10.4a2.1 2.1 0 0 0-4-4L4 16v4Z"></path><path d="m13.5 6.5 4 4"></path></svg></span><span>Edit name &amp; section</span></button>
          <button data-folder-action="image" data-folder-id="${escapeHtml(folder.id)}" type="button" role="menuitem"><span aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"></rect><circle cx="9" cy="10" r="2"></circle><path d="m4 17 4.5-4 3.5 3 3-2.5 5 4.5"></path></svg></span><span>${folder.coverKey ? "Change image" : "Upload image"}</span></button>
          <div class="collection-card-menu-divider" role="separator"></div>
          <button class="danger" data-folder-action="delete" data-folder-id="${escapeHtml(folder.id)}" type="button" role="menuitem"><span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h16"></path><path d="M9 7V4h6v3"></path><path d="m7 7 1 13h8l1-13"></path><path d="M10 11v5M14 11v5"></path></svg></span><span>Delete folder</span></button>
        </div>`;
      return `<article class="collection-card${menuOpen ? " menu-open" : ""}">
        <button class="collection-card-open" data-folder="${escapeHtml(folder.id)}" type="button" aria-label="Open ${escapeHtml(folder.name)}">
          <span class="collection-card-art${folder.coverUrl ? " has-cover-image" : ""}" style="${folderCoverStyle(folder)}">${folderCoverContent(folder)}</span>
          <span class="collection-card-copy"><strong>${escapeHtml(folder.name)}</strong><small>${escapeHtml(subtitle)}</small></span>
        </button>
        ${managementMenu}
      </article>`;
      }).join("");
      return `<section class="collection-section"><div class="collection-section-heading"><h4>${escapeHtml(section)}</h4><span>${sectionFolders.length} folder${sectionFolders.length === 1 ? "" : "s"}</span></div><div class="collection-grid">${cards}</div></section>`;
    }).join("");
  }
  const folder = folders.find((item) => item.id === selectedFolderId);
  if (folder) {
    const coverStyle = folderCoverStyle(folder);
    $("#folder-hero").setAttribute("style", coverStyle);
    applyFolderCover($("#folder-hero-art"), folder);
  }
  renderLibraryMode();
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
  const trigger = $("#folder-voice-trigger");
  const menu = $("#folder-voice-menu");
  const options = $("#folder-voice-options");
  const avatar = $("#folder-voice-avatar");
  const name = $("#folder-voice-name");
  const complete = completeFolderVoices();
  picker.hidden = !affirmations.length || !complete.length;
  if (!complete.length) {
    options.innerHTML = "";
    avatar.innerHTML = "";
    name.textContent = "Select voice";
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    return;
  }
  if (!complete.some((voice) => voice.id === selectedFolderVoiceId)) ensureSelectedFolderVoice();
  const selected = complete.find((voice) => voice.id === selectedFolderVoiceId) || complete[0];
  const selectedImage = selected?.imageUrl || voiceImageUrl(selected?.id);
  avatar.innerHTML = selectedImage
    ? `<img src="${escapeHtml(selectedImage)}" alt="">`
    : escapeHtml(selected.name.slice(0, 1).toUpperCase());
  name.textContent = selected.name;
  trigger.setAttribute("aria-label", `Voice: ${selected.name}`);
  const managedVoiceCount = complete.filter((voice) => !voice.readOnly).length;
  options.innerHTML = complete.map((voice) => {
    const isSelected = voice.id === selected.id;
    const removeDisabled = voice.readOnly || !AWS_CONFIGURED || managedVoiceCount < 2 || folderVoiceDeleteBusy;
    const removeTitle = voice.readOnly
      ? "Existing v3 audio is read-only"
      : managedVoiceCount < 2
        ? "Add another complete AWS voice before removing this one"
        : `Remove ${voice.name} from this folder`;
    const image = voice.imageUrl || voiceImageUrl(voice.id);
    const portrait = image
      ? `<img src="${escapeHtml(image)}" alt="">`
      : escapeHtml(voice.name.slice(0, 1).toUpperCase());
    const sourceLabel = voice.readOnly ? " · existing v3 audio" : " · AWS dev";
    return `<div class="folder-voice-option-row${isSelected ? " selected" : ""}"><button class="folder-voice-inline-remove" data-folder-voice-remove="${escapeHtml(voice.id)}" type="button" aria-label="Remove ${escapeHtml(voice.name)}" title="${escapeHtml(removeTitle)}"${removeDisabled ? " disabled" : ""}>×</button><button class="folder-voice-option${isSelected ? " selected" : ""}" data-folder-voice-option="${escapeHtml(voice.id)}" type="button" role="option" aria-selected="${isSelected}"><span class="folder-voice-option-avatar" aria-hidden="true">${portrait}</span><span class="folder-voice-option-copy"><strong>${escapeHtml(voice.name)}</strong><small>${voice.count} recording${voice.count === 1 ? "" : "s"}${escapeHtml(sourceLabel)}</small></span><span class="folder-voice-option-check" aria-hidden="true">✓</span></button></div>`;
  }).join("");
}

function closeFolderVoiceMenu(focusTrigger = false) {
  const menu = $("#folder-voice-menu");
  const trigger = $("#folder-voice-trigger");
  menu.hidden = true;
  trigger.setAttribute("aria-expanded", "false");
  if (focusTrigger) trigger.focus();
}

function toggleFolderVoiceMenu() {
  const menu = $("#folder-voice-menu");
  const opening = menu.hidden;
  if (opening) closePlayAllPauseMenu();
  menu.hidden = !opening;
  $("#folder-voice-trigger").setAttribute("aria-expanded", String(opening));
  if (opening) $("#folder-voice-options").querySelector(".selected")?.focus();
}

function selectFolderVoice(voiceId) {
  if (!completeFolderVoices().some((voice) => voice.id === voiceId)) return;
  stopLibraryPlayback(false);
  selectedFolderVoiceId = voiceId;
  rememberFolderVoice();
  closeFolderVoiceMenu();
  renderAffirmations();
}

function openDeleteFolderVoiceDialog(voiceId) {
  const folder = folders.find((item) => item.id === selectedFolderId);
  const complete = completeFolderVoices();
  const target = complete.find((voice) => voice.id === voiceId);
  const remaining = complete.filter((voice) => voice.id !== voiceId && !voice.readOnly);
  if (target?.readOnly) {
    $("#library-status").textContent = "Existing v3 audio is read-only and cannot be removed here.";
    return;
  }
  if (!folder || !target || !remaining.length) {
    $("#library-status").textContent = "Add another complete AWS voice before removing this one.";
    return;
  }
  const replacement = remaining.find((voice) => voice.id === selectedFolderVoiceId) || remaining[0];
  folderVoiceDeleteId = target.id;
  folderVoiceDeleteReplacementId = replacement.id;
  $("#delete-folder-voice-title").textContent = `Delete ${target.name}?`;
  $("#delete-folder-voice-description").textContent = `This will delete all ${affirmations.length} “${target.name}” recordings from “${folder.name}”.`;
  $("#delete-folder-voice-error").textContent = "";
  $("#confirm-delete-folder-voice").disabled = false;
  $("#confirm-delete-folder-voice").textContent = "Yes, delete voice";
  $("#delete-folder-voice-dialog").showModal();
}

async function deleteSelectedFolderVoice(event) {
  event.preventDefault();
  if (folderVoiceDeleteBusy || !selectedFolderId || !folderVoiceDeleteId || !folderVoiceDeleteReplacementId) return;
  const folderId = selectedFolderId;
  const voiceId = folderVoiceDeleteId;
  const replacementVoiceId = folderVoiceDeleteReplacementId;
  const selected = completeFolderVoices().find((voice) => voice.id === voiceId);

  folderVoiceDeleteBusy = true;
  const button = $("#confirm-delete-folder-voice");
  button.disabled = true;
  button.textContent = "Removing from AWS…";
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
    folderVoiceDeleteId = null;
    folderVoiceDeleteReplacementId = null;
  } catch (error) {
    $("#delete-folder-voice-error").textContent = error.message || "Could not remove this voice.";
  } finally {
    folderVoiceDeleteBusy = false;
    button.disabled = false;
    button.textContent = "Yes, delete voice";
    renderFolderVoicePicker();
  }
}

function renderAffirmations(loading = false, error = "") {
  const folder = folders.find((item) => item.id === selectedFolderId);
  const managedByStaging = folder?.source === STAGING_CATALOG_SOURCE;
  const voiceCount = folderVoiceAvailability().length;
  $("#folder-title").textContent = folder?.name || "Select a folder";
  $("#folder-summary").textContent = `${affirmations.length} affirmation${affirmations.length === 1 ? "" : "s"}${voiceCount ? ` · ${voiceCount} voice${voiceCount === 1 ? "" : "s"}` : ""}`;
  $("#add-to-folder").hidden = managedByStaging;
  $("#add-to-folder").disabled = !folder || managedByStaging;
  $("#folder-customize").hidden = managedByStaging;
  $("#folder-customize").disabled = !AWS_CONFIGURED || !folder || managedByStaging;
  $("#add-folder-voice").disabled = !AWS_CONFIGURED || !folder || !affirmations.length || !voices.length;
  $("#generate-staging-voice").hidden = !managedByStaging;
  $("#generate-staging-voice").disabled = !AWS_CONFIGURED || !folder || !affirmations.length || !voices.length || folderVoiceBusy;
  $("#play-all").disabled = !folder || !affirmations.length;
  $("#play-all").innerHTML = isPlayingAll
    ? '<span aria-hidden="true">■</span><span>Stop all</span>'
    : '<span aria-hidden="true">▶</span><span>Play all</span>';
  $("#save-order").hidden = managedByStaging || !orderChanged;
  $("#save-order").disabled = orderSaving;
  $("#save-order").textContent = orderSaving ? "Saving…" : "Save changes to AWS";
  renderBackgroundMusicButton();
  renderPlayAllPausePicker();
  renderFolderVoicePicker();
  renderPlayerPanel();
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
      const voiceImage = voice?.imageUrl || voiceImageUrl(voice?.voiceId);
      const voiceLabel = voiceImage
        ? `<span class="affirmation-voice"><img src="${escapeHtml(voiceImage)}" alt="">${escapeHtml(voiceName)}</span>`
        : `<span>${escapeHtml(voiceName)}</span>`;
      const savedLabel = item.local
        ? "Browser preview"
        : voice?.readOnly
          ? "Existing v3 audio"
          : voice
            ? "Saved in AWS dev"
            : "Loaded from v3 staging";
      const savedDate = createdAt ? new Date(createdAt).toLocaleDateString() : "";
      const reorderControls = managedByStaging ? '<span aria-hidden="true"></span>' : `<span class="drag-handle" data-drag-id="${escapeHtml(item.identifier)}" draggable="true" aria-hidden="true" title="Drag to reorder">⋮⋮</span>`;
      const moveControls = managedByStaging ? "" : `<button data-move-id="${escapeHtml(item.identifier)}" data-direction="-1" type="button" aria-label="Move affirmation up" title="Move up"${index === 0 ? " disabled" : ""}>↑</button><button data-move-id="${escapeHtml(item.identifier)}" data-direction="1" type="button" aria-label="Move affirmation down" title="Move down"${index === affirmations.length - 1 ? " disabled" : ""}>↓</button>`;
      return `<article class="affirmation-card${playing ? " playing" : ""}" data-affirmation-id="${escapeHtml(item.identifier)}">${reorderControls}<div class="affirmation-main"><p>${escapeHtml(item.title)}</p><div class="affirmation-meta">${voiceLabel}<span>${escapeHtml(savedLabel)}</span></div></div><div class="affirmation-track-meta"><strong>${escapeHtml(voiceName)}</strong><span>${escapeHtml([savedLabel, savedDate].filter(Boolean).join(" · "))}</span></div><div class="card-actions">${moveControls}<button data-play-id="${escapeHtml(item.identifier)}" type="button" aria-label="${playing ? "Stop" : "Play"} ${escapeHtml(item.title)}" title="${playing ? "Stop" : "Play"}"${playDisabled ? " disabled" : ""}>${playing ? "■" : "▶"}</button>${download}</div></article>`;
    }).join("");
  }
}

async function createFolder(name, section = "") {
  if (!AWS_CONFIGURED) {
    const folder = {id: `folder-${crypto.randomUUID()}`, name: name.trim(), section: section.trim(), createdAt: new Date().toISOString()};
    folders.push(folder);
    selectedFolderId = folder.id;
    libraryDetailOpen = true;
    playerAffirmationId = null;
    affirmations = [];
    restorePlayAllPausePreference();
    saveLocalFolders();
    rememberFolder();
    return renderFolders();
  }
  const payload = await awsApi("/folders", {method: "POST", body: JSON.stringify({name: name.trim(), section: section.trim()})});
  folders.push(payload.folder);
  selectedFolderId = payload.folder.id;
  libraryDetailOpen = true;
  playerAffirmationId = null;
  affirmations = [];
  restorePlayAllPausePreference();
  rememberFolder();
  renderFolders();
}

function releaseFolderCoverPreview() {
  if (folderCoverPreviewUrl) URL.revokeObjectURL(folderCoverPreviewUrl);
  folderCoverPreviewUrl = null;
}

function renderFolderCoverPreview(folder, imageUrl = folder?.coverUrl || "") {
  const preview = $("#folder-cover-preview");
  if (!preview) return;
  preview.setAttribute("style", folderCoverStyle(folder));
  preview.innerHTML = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="">`
    : `<span>${escapeHtml(folderMark(folder))}</span>`;
}

function openFolderCustomizeDialog(folderId = selectedFolderId, focusTarget = "name") {
  const folder = folders.find((item) => item.id === folderId);
  if (!AWS_CONFIGURED || !folder || folderCustomizeBusy) return;
  folderCustomizeId = folder.id;
  releaseFolderCoverPreview();
  folderCoverRemoveRequested = false;
  $("#folder-cover-file").value = "";
  $("#folder-customize-name").value = folder.name || "";
  $("#folder-customize-section").value = folder.section || "";
  $("#folder-customize-status").textContent = "";
  $("#folder-customize-error").textContent = "";
  $("#remove-folder-cover").hidden = !folder.coverKey;
  renderFolderCoverPreview(folder);
  $("#folder-customize-dialog").showModal();
  if (focusTarget === "image") $("#folder-cover-file").click();
  else requestAnimationFrame(() => $("#folder-customize-name").focus());
}

function previewFolderCoverFile(file) {
  const folder = folders.find((item) => item.id === folderCustomizeId);
  $("#folder-customize-error").textContent = "";
  if (!file || !folder) return renderFolderCoverPreview(folder);
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    $("#folder-cover-file").value = "";
    $("#folder-customize-error").textContent = "Choose a JPG, PNG, or WebP image.";
    return renderFolderCoverPreview(folder);
  }
  if (file.size > MAX_FOLDER_COVER_BYTES) {
    $("#folder-cover-file").value = "";
    $("#folder-customize-error").textContent = "Folder cover must be 8 MB or smaller.";
    return renderFolderCoverPreview(folder);
  }
  releaseFolderCoverPreview();
  folderCoverPreviewUrl = URL.createObjectURL(file);
  folderCoverRemoveRequested = false;
  renderFolderCoverPreview(folder, folderCoverPreviewUrl);
  $("#remove-folder-cover").hidden = false;
}

function removeFolderCoverSelection() {
  const folder = folders.find((item) => item.id === folderCustomizeId);
  releaseFolderCoverPreview();
  folderCoverRemoveRequested = true;
  $("#folder-cover-file").value = "";
  $("#remove-folder-cover").hidden = true;
  $("#folder-customize-error").textContent = "";
  $("#folder-customize-status").textContent = "The current cover will be removed when you save.";
  renderFolderCoverPreview(folder, "");
}

async function saveFolderCustomization(event) {
  event.preventDefault();
  const folder = folders.find((item) => item.id === folderCustomizeId);
  if (!AWS_CONFIGURED || !folder || folderCustomizeBusy) return;
  const file = $("#folder-cover-file").files[0];
  const name = $("#folder-customize-name").value.trim();
  const section = $("#folder-customize-section").value.trim();
  const button = $("#save-folder-customize");
  const update = {name, section};
  folderCustomizeBusy = true;
  button.disabled = true;
  $("#folder-customize-error").textContent = "";
  try {
    if (file) {
      $("#folder-customize-status").textContent = "Preparing secure AWS upload…";
      const upload = await awsApi(`/folders/${encodeURIComponent(folder.id)}/cover/presign`, {
        method: "POST",
        body: JSON.stringify({contentType: file.type, fileSize: file.size}),
      });
      $("#folder-customize-status").textContent = "Uploading cover to AWS…";
      const uploaded = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: upload.requiredHeaders,
        body: file,
      });
      if (!uploaded.ok) throw new Error(`Cover upload failed (${uploaded.status}).`);
      update.coverKey = upload.coverKey;
    } else if (folderCoverRemoveRequested) {
      update.coverKey = null;
    }
    $("#folder-customize-status").textContent = "Saving folder details…";
    const result = await awsApi(`/folders/${encodeURIComponent(folder.id)}`, {
      method: "PUT",
      body: JSON.stringify(update),
    });
    folders = folders.map((item) => item.id === folder.id ? result.folder : item);
    releaseFolderCoverPreview();
    folderCoverRemoveRequested = false;
    folderCustomizeId = null;
    $("#folder-customize-dialog").close();
    renderFolders();
    $("#library-status").textContent = "Folder details saved in AWS.";
  } catch (error) {
    $("#folder-customize-error").textContent = error.message || "Could not update this folder.";
    $("#folder-customize-status").textContent = "";
  } finally {
    folderCustomizeBusy = false;
    button.disabled = false;
  }
}

function openDeleteFolderDialog(folderId) {
  const folder = folders.find((item) => item.id === folderId);
  if (!AWS_CONFIGURED || !folder || folderDeleteBusy) return;
  folderDeleteId = folder.id;
  $("#delete-folder-description").textContent = `Delete “${folder.name}” and all of its saved audio?`;
  $("#delete-folder-error").textContent = "";
  $("#confirm-delete-folder").disabled = false;
  $("#confirm-delete-folder").textContent = "Delete folder";
  $("#delete-folder-dialog").showModal();
}

async function deleteFolder(event) {
  event.preventDefault();
  const folder = folders.find((item) => item.id === folderDeleteId);
  if (!AWS_CONFIGURED || !folder || folderDeleteBusy) return;
  const button = $("#confirm-delete-folder");
  folderDeleteBusy = true;
  button.disabled = true;
  button.textContent = "Deleting…";
  $("#delete-folder-error").textContent = "";
  try {
    await awsApi(`/folders/${encodeURIComponent(folder.id)}`, {method: "DELETE"});
    [FOLDER_VOICE_STORAGE_KEY, BACKGROUND_MUSIC_STORAGE_KEY, PLAY_ALL_PAUSE_STORAGE_KEY].forEach((storageKey) => {
      try {
        const preferences = JSON.parse(localStorage.getItem(storageKey) || "{}");
        delete preferences[folder.id];
        localStorage.setItem(storageKey, JSON.stringify(preferences));
      } catch (_error) {
        localStorage.removeItem(storageKey);
      }
    });
    if (selectedFolderId === folder.id) {
      stopLibraryPlayback(false);
      selectedFolderId = null;
      selectedFolderVoiceId = null;
      affirmations = [];
      libraryDetailOpen = false;
      playerAffirmationId = null;
      localStorage.removeItem(LAST_FOLDER_KEY);
    }
    folders = folders.filter((item) => item.id !== folder.id);
    folderDeleteId = null;
    $("#delete-folder-dialog").close();
    renderFolders();
  } catch (error) {
    $("#delete-folder-error").textContent = error.message || "Could not delete this folder.";
  } finally {
    folderDeleteBusy = false;
    button.disabled = false;
    button.textContent = "Delete folder";
  }
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

function preferredVoiceRecordingMimeType() {
  if (!window.MediaRecorder) return "";
  return ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/ogg"]
    .find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function voiceRecordingExtension(mimeType) {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4")) return "m4a";
  return "webm";
}

function formatVoiceRecordingTime(seconds) {
  const whole = Math.max(0, Math.min(MAX_VOICE_SAMPLE_SECONDS, Math.floor(seconds)));
  return `00:${String(whole).padStart(2, "0")} / 00:${MAX_VOICE_SAMPLE_SECONDS}`;
}

function clearVoiceRecordingTimer() {
  if (voiceRecordingTimer) clearInterval(voiceRecordingTimer);
  voiceRecordingTimer = null;
}

function stopVoiceMediaStream() {
  voiceMediaStream?.getTracks().forEach((track) => track.stop());
  voiceMediaStream = null;
}

function updateVoiceRecorderUI() {
  const recording = voiceMediaRecorder?.state === "recording";
  const hasSample = Boolean(voiceRecordingFile);
  $("#voice-recorder-card").classList.toggle("recording", recording);
  $("#start-voice-recording").hidden = recording || hasSample;
  $("#stop-voice-recording").hidden = !recording;
  $("#rerecord-voice").hidden = recording || !hasSample;
  $("#voice-recording-preview").hidden = recording || !hasSample;
  $("#voice-record-status").textContent = recording ? "Recording…" : hasSample ? "Sample ready" : "Ready to record";
  $("#voice-record-timer").textContent = formatVoiceRecordingTime(voiceRecordingSeconds);
}

function discardVoiceRecording(message = "Your browser will ask for microphone permission.") {
  clearVoiceRecordingTimer();
  if (voiceMediaRecorder && voiceMediaRecorder.state !== "inactive") {
    voiceMediaRecorder.ondataavailable = null;
    voiceMediaRecorder.onstop = null;
    try { voiceMediaRecorder.stop(); } catch (_) {}
  }
  voiceMediaRecorder = null;
  voiceRecordingChunks = [];
  stopVoiceMediaStream();
  if (voiceRecordingUrl) URL.revokeObjectURL(voiceRecordingUrl);
  voiceRecordingUrl = null;
  voiceRecordingFile = null;
  voiceRecordingStartedAt = 0;
  voiceRecordingSeconds = 0;
  const preview = $("#voice-recording-preview");
  preview.pause();
  preview.removeAttribute("src");
  preview.load();
  $("#voice-capture-message").textContent = message;
  updateVoiceRecorderUI();
}

function setVoiceSourceMode(mode) {
  if (!["record", "upload"].includes(mode)) return;
  if (voiceMediaRecorder?.state === "recording") stopVoiceRecording();
  voiceSourceMode = mode;
  $$('[data-voice-source]').forEach((tab) => {
    const active = tab.dataset.voiceSource === mode;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  $("#voice-record-panel").hidden = mode !== "record";
  $("#voice-upload-panel").hidden = mode !== "upload";
  $("#voice-error").textContent = "";
}

function resetVoiceCloneDialog() {
  $("#voice-form").reset();
  discardVoiceRecording();
  voiceSourceMode = "record";
  $("#voice-upload-filename").textContent = "Choose a clear voice sample";
  $("#voice-error").textContent = "";
  $("#voice-save-status").textContent = "";
  const button = $("#add-voice-button");
  button.disabled = false;
  button.innerHTML = 'Save voice <span aria-hidden="true">→</span>';
  setVoiceSourceMode("record");
}

function openVoiceCloneDialog() {
  resetVoiceCloneDialog();
  $("#voice-dialog").showModal();
}

async function startVoiceRecording() {
  if (voiceCloneSaving || voiceMediaRecorder?.state === "recording") return;
  $("#voice-error").textContent = "";
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    $("#voice-capture-message").textContent = "Microphone recording is not supported in this browser. Use Upload a sample instead.";
    return;
  }
  discardVoiceRecording("Requesting microphone permission…");
  try {
    voiceMediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true},
      video: false,
    });
    const mimeType = preferredVoiceRecordingMimeType();
    voiceMediaRecorder = new MediaRecorder(
      voiceMediaStream,
      mimeType ? {mimeType, audioBitsPerSecond: 128000} : undefined,
    );
    voiceRecordingChunks = [];
    voiceRecordingSeconds = 0;
    voiceMediaRecorder.ondataavailable = (event) => { if (event.data.size) voiceRecordingChunks.push(event.data); };
    voiceMediaRecorder.onstop = finalizeVoiceRecording;
    voiceMediaRecorder.start(250);
    voiceRecordingStartedAt = Date.now();
    $("#voice-capture-message").textContent = "Speak naturally and finish the paragraph before stopping.";
    clearVoiceRecordingTimer();
    voiceRecordingTimer = setInterval(() => {
      voiceRecordingSeconds = Math.min(MAX_VOICE_SAMPLE_SECONDS, (Date.now() - voiceRecordingStartedAt) / 1000);
      $("#voice-record-timer").textContent = formatVoiceRecordingTime(voiceRecordingSeconds);
      if (voiceRecordingSeconds >= MAX_VOICE_SAMPLE_SECONDS) stopVoiceRecording();
    }, 200);
    updateVoiceRecorderUI();
  } catch (error) {
    stopVoiceMediaStream();
    voiceMediaRecorder = null;
    $("#voice-capture-message").textContent = error?.name === "NotAllowedError"
      ? "Microphone permission was blocked. Allow it in your browser or upload a sample."
      : "The microphone could not start. Check your device and try again.";
    updateVoiceRecorderUI();
  }
}

function stopVoiceRecording() {
  if (!voiceMediaRecorder || voiceMediaRecorder.state !== "recording") return;
  voiceRecordingSeconds = Math.min(MAX_VOICE_SAMPLE_SECONDS, (Date.now() - voiceRecordingStartedAt) / 1000);
  clearVoiceRecordingTimer();
  voiceMediaRecorder.stop();
  stopVoiceMediaStream();
  updateVoiceRecorderUI();
}

function finalizeVoiceRecording() {
  const mimeType = voiceMediaRecorder?.mimeType || preferredVoiceRecordingMimeType() || "audio/webm";
  const blob = new Blob(voiceRecordingChunks, {type: mimeType});
  voiceMediaRecorder = null;
  voiceRecordingChunks = [];
  stopVoiceMediaStream();
  if (voiceRecordingSeconds < MIN_VOICE_SAMPLE_SECONDS || !blob.size) {
    discardVoiceRecording(`Record for at least ${MIN_VOICE_SAMPLE_SECONDS} seconds so Modal has enough voice detail.`);
    return;
  }
  if (blob.size > MAX_VOICE_SAMPLE_BYTES) {
    discardVoiceRecording("The recording is larger than 12 MB. Please record a shorter sample.");
    return;
  }
  const extension = voiceRecordingExtension(mimeType);
  voiceRecordingFile = new File([blob], `voice-sample-${Date.now()}.${extension}`, {type: mimeType});
  if (voiceRecordingUrl) URL.revokeObjectURL(voiceRecordingUrl);
  voiceRecordingUrl = URL.createObjectURL(blob);
  const preview = $("#voice-recording-preview");
  preview.src = voiceRecordingUrl;
  $("#voice-capture-message").textContent = `${Math.round(voiceRecordingSeconds)}-second sample ready. Listen once, then save your voice.`;
  updateVoiceRecorderUI();
}

async function saveClonedVoice(event) {
  event.preventDefault();
  if (voiceCloneSaving) return;
  const file = voiceSourceMode === "record" ? voiceRecordingFile : $("#voice-upload-file").files[0];
  const name = event.target.elements.name.value.trim();
  const style = event.target.elements.style.value.trim();
  $("#voice-error").textContent = "";
  $("#voice-save-status").textContent = "";
  if (!file) {
    $("#voice-error").textContent = voiceSourceMode === "record" ? "Record your voice sample first." : "Choose a voice sample to upload.";
    return;
  }
  if (file.size > MAX_VOICE_SAMPLE_BYTES) {
    $("#voice-error").textContent = "Voice sample must be 12 MB or smaller.";
    return;
  }
  if (!$("#voice-consent").checked) {
    $("#voice-error").textContent = "Confirm that you have permission to clone and use this voice.";
    return;
  }

  voiceCloneSaving = true;
  const button = $("#add-voice-button");
  button.disabled = true;
  button.textContent = "Saving voice…";
  $("#voice-save-status").textContent = "Preparing your reusable voice…";
  try {
    const data = new FormData();
    data.set("name", name);
    data.set("style", style);
    data.set("reference_text", voiceSourceMode === "record" ? VOICE_CLONE_SCRIPT : "");
    data.set("consent", "true");
    data.set("reference_audio", file, file.name);
    const voice = (await (await modalApi("/api/voices", {method: "POST", body: data})).json()).voice;
    $("#voice-save-status").textContent = "Voice saved. Adding it to your library…";
    $("#voice-dialog").close();
    discardVoiceRecording();
    await loadVoices(voice.id);
    showStatus(`${voice.name} is ready to use for new affirmations.`);
  } catch (error) {
    $("#voice-error").textContent = error.message || "Could not save this voice.";
    $("#voice-save-status").textContent = "";
  } finally {
    voiceCloneSaving = false;
    button.disabled = false;
    button.innerHTML = 'Save voice <span aria-hidden="true">→</span>';
  }
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
  const sentencePauseMs = Number($("#sentence-pause").value);
  const sentencePauseLabel = sentencePauseMs
    ? `${sentencePauseMs / 1000}s`
    : "Natural";
  $("#speed-output").textContent = Number($("#speed").value).toFixed(2);
  $("#steps-output").textContent = $("#steps").value;
  $("#guidance-output").textContent = Number($("#guidance").value).toFixed(1);
  $("#gap-output").textContent = `${$("#word-gap").value} ms`;
  $("#sentence-pause-output").textContent = sentencePauseLabel;
  $("#settings-summary").textContent = `${Number($("#speed").value).toFixed(2)} speed · ${$("#steps").value} steps${sentencePauseMs ? ` · ${sentencePauseLabel} sentence pause` : ""}`;
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
  data.set("sentence_pause_ms", $("#sentence-pause").value);
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
  return generateVoiceBlobFromData(voiceGenerationData(text, voiceId));
}

async function generateVoiceBlobFromData(data) {
  const submitted = await modalApi("/api/generation-jobs", {
    method: "POST",
    body: data,
  });
  const payload = await submitted.json();
  if (!payload.jobId) throw new Error("Modal did not return a generation job.");

  while (true) {
    await new Promise((resolve) => setTimeout(resolve, GENERATION_POLL_INTERVAL_MS));
    const response = await modalApi(
      `/api/generation-jobs/${encodeURIComponent(payload.jobId)}?output_format=mp3`,
      {cache: "no-store"},
    );
    if (response.status === 202) continue;
    return response.blob();
  }
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
    const blob = await generateVoiceBlobFromData(data);
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
    libraryDetailOpen = true;
    playerAffirmationId = saved.affirmation.identifier;
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

function selectedFolderVoices() {
  const selectedIds = new Set($$("#folder-new-voices input[type='checkbox']:checked").map((input) => input.value));
  return voices.filter((voice) => selectedIds.has(voice.id));
}

function updateSelectedFolderVoiceSummary() {
  const selected = selectedFolderVoices();
  const availability = new Map(folderVoiceAvailability().map((voice) => [voice.id, voice.count]));
  const recordingCount = selected.reduce((total, voice) => total + Math.max(0, affirmations.length - (availability.get(voice.id) || 0)), 0);
  const avatar = $("#selected-folder-voice-avatar");
  const generateButton = $("#generate-folder-voice");

  if (selected.length === 1) {
    setVoiceAvatar(avatar, selected[0]);
    $("#selected-folder-voice-name").textContent = selected[0].name;
    $("#selected-folder-voice-style").textContent = selected[0].style || "Selected voice";
  } else {
    setVoiceAvatar(avatar, null);
    avatar.textContent = selected.length ? String(selected.length) : "—";
    $("#selected-folder-voice-name").textContent = selected.length ? `${selected.length} voices selected` : "Choose one or more voices";
    $("#selected-folder-voice-style").textContent = selected.length ? selected.map((voice) => voice.name).join(" · ") : "Tick the voices you want above";
  }

  $("#folder-recording-count").textContent = `${recordingCount} recording${recordingCount === 1 ? "" : "s"}`;
  if (!folderVoiceBatch) {
    generateButton.disabled = folderVoiceBusy || !selected.length;
    generateButton.textContent = selected.length
      ? `Generate and save ${recordingCount} recording${recordingCount === 1 ? "" : "s"}`
      : "Select voices to continue";
  }
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
  const completed = items.filter((item) => ["existing", "saved"].includes(item.status)).length;
  const percent = items.length ? Math.round((completed / items.length) * 100) : 0;
  const remaining = Math.max(0, items.length - completed);

  $("#folder-voice-progress").hidden = false;
  $("#folder-voice-progress-title").textContent = saving
    ? `Saving recording ${activeIndex} of ${items.length} to AWS`
    : generating
      ? `Generating recording ${activeIndex} of ${items.length}`
      : failures
        ? `${failures} recording${failures === 1 ? " needs" : "s need"} attention`
        : "Voice generated and saved to AWS";
  $("#folder-voice-progress-detail").textContent = generating || saving
    ? `${completed} completed · ${remaining} remaining · ${activeItem?.voice?.name || "Selected voices"}`
    : `${completed} of ${items.length} recordings completed`;
  $("#folder-voice-progress-percent").textContent = `${percent}%`;
  $("#folder-voice-progress-fill").style.width = `${percent}%`;
  $("#folder-voice-progress-track").setAttribute("aria-valuenow", String(percent));
  $("#folder-voice-progress-track").classList.toggle("active", generating || saving);
  $("#folder-voice-list").innerHTML = items.map((item, index) => {
    const canPreview = ["ready", "save-error", "saved"].includes(item.status);
    const error = item.error ? `<small>${escapeHtml(item.error)}</small>` : "";
    const status = folderVoiceStatusLabel(item);
    const statusWithVoice = `${item.voice.name} · ${status}`;
    return `<div class="batch-row batch-${escapeHtml(item.status)}"><span class="batch-index">${index + 1}</span><span class="batch-copy"><strong>${escapeHtml(item.title)}</strong><span class="batch-status" data-default-status="${escapeHtml(statusWithVoice)}">${escapeHtml(statusWithVoice)}</span>${error}</span>${canPreview ? `<button class="batch-play" data-batch-play="${escapeHtml(item.key)}" data-default-label="Play ${escapeHtml(item.title)} with ${escapeHtml(item.voice.name)}" type="button" aria-label="Play ${escapeHtml(item.title)} with ${escapeHtml(item.voice.name)}" aria-pressed="false">▶</button>` : ""}</div>`;
  }).join("");

  const generateButton = $("#generate-folder-voice");
  const retryable = items.filter((item) => ["generation-error", "save-error"].includes(item.status)).length;
  generateButton.hidden = !retryable && items.every((item) => item.status !== "pending");
  generateButton.textContent = retryable ? `Retry ${retryable} failed recording${retryable === 1 ? "" : "s"}` : "Generate and save voice";
  generateButton.disabled = folderVoiceBusy;
  $$("#folder-new-voices input[type='checkbox']").forEach((input) => input.disabled = folderVoiceBusy || Boolean(folderVoiceBatch));
  $$('[data-preview-folder-voice]').forEach((button) => button.disabled = folderVoiceBusy || Boolean(folderVoiceBatch));
  $("#cancel-folder-voice").disabled = folderVoiceBusy;
}

function openFolderVoiceDialog() {
  const folder = folders.find((item) => item.id === selectedFolderId);
  if (!folder || !affirmations.length) return;
  clearFolderVoiceBatch();
  const availability = new Map(folderVoiceAvailability().map((voice) => [voice.id, voice.count]));
  const candidates = voices.filter((voice) => (availability.get(voice.id) || 0) < affirmations.length);
  $("#folder-voice-description").textContent = `Generate all ${affirmations.length} “${folder.name}” affirmations with another voice. Each MP3 is saved to AWS automatically before the next recording starts.`;
  $("#folder-new-voices").innerHTML = candidates.map((voice) => {
    const count = availability.get(voice.id) || 0;
    const suffix = count ? ` · resume ${count}/${affirmations.length}` : ` · ${affirmations.length} new`;
    return `<div class="folder-new-voice-row"><label class="folder-new-voice-choice"><input type="checkbox" value="${escapeHtml(voice.id)}">${voiceAvatarMarkup(voice)}<span class="folder-new-voice-copy"><strong>${escapeHtml(voice.name)}</strong><small>${escapeHtml(voice.style || "Voice")}${suffix}</small></span></label><button class="folder-new-voice-preview" data-preview-folder-voice="${escapeHtml(voice.id)}" data-idle-text="▶" data-default-label="Preview ${escapeHtml(voice.name)}" type="button" aria-label="Preview ${escapeHtml(voice.name)}" aria-pressed="false">▶</button></div>`;
  }).join("") || `<div class="folder-new-voice-empty">Every available voice is already complete for this folder.</div>`;
  $("#folder-voice-error").textContent = candidates.length ? "" : "Every available voice is already complete for this folder.";
  $("#generate-folder-voice").hidden = !candidates.length;
  $("#generate-folder-voice").disabled = true;
  $("#generate-folder-voice").textContent = "Select voices to continue";
  updateSelectedFolderVoiceSummary();
  $("#folder-voice-dialog").showModal();
}

function buildFolderVoiceBatch(selectedVoices) {
  return {
    folderId: selectedFolderId,
    voices: selectedVoices,
    selectionKey: selectedVoices.map((voice) => voice.id).join("|"),
    phase: "idle",
    items: selectedVoices.flatMap((voice) => affirmations.map((affirmation) => {
        const existing = itemVoiceVersions(affirmation).find((item) => item.voiceId === voice.id);
        return {
          key: `${voice.id}:${affirmation.identifier}`,
          voice,
          affirmationId: affirmation.identifier,
          title: affirmation.title,
          status: existing ? "existing" : "pending",
          existing,
          blob: null,
          previewUrl: null,
          error: "",
        };
      })),
  };
}

async function generateFolderVoiceVersion(event) {
  event.preventDefault();
  if (folderVoiceBusy) return;
  const selectedVoices = selectedFolderVoices();
  if (!selectedVoices.length) return $("#folder-voice-error").textContent = "Tick at least one available voice.";
  const selectionKey = selectedVoices.map((voice) => voice.id).join("|");
  if (!folderVoiceBatch || folderVoiceBatch.selectionKey !== selectionKey) folderVoiceBatch = buildFolderVoiceBatch(selectedVoices);

  stopActivePreview();
  folderVoiceBusy = true;
  folderVoiceBatch.phase = "generating";
  $("#folder-voice-error").textContent = "";
  renderFolderVoiceBatch();
  const targets = folderVoiceBatch.items.filter((item) => ["pending", "generation-error", "save-error"].includes(item.status));
  for (const item of targets) {
    item.error = "";
    try {
      if (item.status !== "save-error" || !item.blob) {
        item.status = "generating";
        renderFolderVoiceBatch();
        item.blob = await generateVoiceBlob(item.title, item.voice.id);
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        item.previewUrl = URL.createObjectURL(item.blob);
      }
      item.status = "saving";
      renderFolderVoiceBatch();
      const upload = await awsApi("/voice-uploads/presign", {
        method: "POST",
        body: JSON.stringify({
          folderId: folderVoiceBatch.folderId,
          affirmationId: item.affirmationId,
          voiceId: item.voice.id,
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
          voiceId: item.voice.id,
          voiceName: item.voice.name,
          audioKey: upload.audioKey,
        }),
      });
      item.status = "saved";
    } catch (error) {
      item.status = item.blob ? "save-error" : "generation-error";
      item.error = error.message || (item.blob ? "AWS could not save this recording." : "Modal could not generate this recording.");
    }
    renderFolderVoiceBatch();
  }
  folderVoiceBusy = false;
  const failed = folderVoiceBatch.items.filter((item) => item.status.endsWith("error")).length;
  if (failed) {
    folderVoiceBatch.phase = "blocked";
    $("#folder-voice-error").textContent = `${failed} recording${failed === 1 ? " needs" : "s need"} attention. Retry to continue without regenerating successfully saved audio.`;
    return renderFolderVoiceBatch();
  }

  const completedVoices = folderVoiceBatch.voices;
  const completedVoice = completedVoices[0];
  const folderId = folderVoiceBatch.folderId;
  selectedFolderVoiceId = completedVoice.id;
  rememberFolderVoice(completedVoice.id);
  await refreshFolders(folderId);
  selectedFolderVoiceId = completedVoice.id;
  rememberFolderVoice(completedVoice.id);
  $("#folder-voice-dialog").close();
  clearFolderVoiceBatch();
  const completedNames = completedVoices.map((voice) => voice.name).join(", ");
  $("#library-status").textContent = `${completedNames} ${completedVoices.length === 1 ? "was" : "were"} added to the same folder and saved in AWS.`;
  renderAffirmations();
}

async function playBatchPreview(itemKey, button) {
  const item = folderVoiceBatch?.items.find((candidate) => candidate.key === itemKey);
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
$$('[data-view], [data-view-link]').forEach((element) => element.addEventListener("click", (event) => {
  event.preventDefault();
  const view = element.dataset.view || element.dataset.viewLink;
  if (view === "library" && (element.classList.contains("nav-button") || element.hasAttribute("data-view-link"))) {
    libraryDetailOpen = false;
    renderLibraryMode();
  }
  showView(view);
}));
$("#folder-list").addEventListener("click", async (event) => {
  const menuTrigger = event.target.closest("[data-folder-menu-trigger]");
  if (menuTrigger) {
    event.preventDefault();
    event.stopPropagation();
    return toggleFolderCardMenu(menuTrigger.dataset.folderMenuTrigger, menuTrigger, event.detail === 0);
  }
  const action = event.target.closest("[data-folder-action]");
  if (action) {
    event.preventDefault();
    event.stopPropagation();
    const folderId = action.dataset.folderId;
    const actionName = action.dataset.folderAction;
    closeFolderCardMenus(false);
    if (actionName === "edit") return openFolderCustomizeDialog(folderId, "name");
    if (actionName === "image") return openFolderCustomizeDialog(folderId, "image");
    if (actionName === "delete") return openDeleteFolderDialog(folderId);
  }
  const button = event.target.closest("[data-folder]");
  if (!button) return;
  closeFolderCardMenus(false);
  closeFolderVoiceMenu();
  closePlayAllPauseMenu();
  stopLibraryPlayback(false);
  orderChanged = false;
  libraryDetailOpen = true;
  playerAffirmationId = null;
  playerActiveWord = -1;
  selectedFolderId = button.dataset.folder;
  selectedFolderVoiceId = loadFolderVoicePreferences()[selectedFolderId] || null;
  restoreBackgroundMusicPreference();
  restorePlayAllPausePreference();
  rememberFolder();
  renderFolders();
  await refreshAffirmations();
});
$("#folder-list").addEventListener("keydown", (event) => {
  const menu = event.target.closest("[data-folder-menu]");
  if (!menu || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const options = [...menu.querySelectorAll("button[role='menuitem']")];
  if (!options.length) return;
  event.preventDefault();
  const current = options.indexOf(document.activeElement);
  const next = event.key === "Home"
    ? 0
    : event.key === "End"
      ? options.length - 1
      : (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
  options[next].focus();
});
$("#library-back").addEventListener("click", () => { stopLibraryPlayback(false); libraryDetailOpen = false; playerAffirmationId = null; renderLibraryMode(); renderPlayerPanel(); });
$("#new-folder").addEventListener("click", () => $("#folder-dialog").showModal());
$("#folder-form").addEventListener("submit", async (event) => { event.preventDefault(); const button = event.submitter; button.disabled = true; $("#folder-error").textContent = ""; try { await createFolder($("#folder-name").value, $("#folder-section").value); event.target.reset(); $("#folder-dialog").close(); } catch (error) { $("#folder-error").textContent = error.message; } finally { button.disabled = false; } });
$("#folder-customize").addEventListener("click", () => openFolderCustomizeDialog(selectedFolderId, "name"));
$("#folder-cover-file").addEventListener("change", (event) => previewFolderCoverFile(event.target.files[0]));
$("#remove-folder-cover").addEventListener("click", removeFolderCoverSelection);
$("#folder-customize-form").addEventListener("submit", saveFolderCustomization);
$("#delete-folder-form").addEventListener("submit", deleteFolder);
$("#new-affirmation").addEventListener("click", () => { if (!folders.length) return $("#folder-dialog").showModal(); showView("generate"); });
$("#add-to-folder").addEventListener("click", () => { if (!selectedFolderId) return; showView("generate"); });
$("#play-all").addEventListener("click", togglePlayAll);
$("#background-music").addEventListener("click", openBackgroundMusicDialog);
$("#player-music").addEventListener("click", openBackgroundMusicDialog);
$("#player-music-summary").addEventListener("click", openBackgroundMusicDialog);
$("#player-toggle").addEventListener("click", togglePlayerPlayback);
$("#player-previous").addEventListener("click", () => playRelativeAffirmation(-1));
$("#player-next").addEventListener("click", () => playRelativeAffirmation(1));
$("#player-seek").addEventListener("input", (event) => {
  if (!libraryAudio || !Number.isFinite(libraryAudio.duration)) return;
  libraryAudio.currentTime = libraryAudio.duration * (Number(event.target.value) / 1000);
  updatePlayerProgress();
});
$("#player-volume").addEventListener("input", (event) => {
  libraryVolume = Math.min(1, Math.max(0, Number(event.target.value) / 100));
  if (libraryAudio) libraryAudio.volume = libraryVolume;
});
$("#play-all-pause-trigger").addEventListener("click", (event) => { event.stopPropagation(); togglePlayAllPauseMenu(); });
$("#play-all-pause-menu").addEventListener("click", (event) => {
  const option = event.target.closest("[data-play-all-pause]");
  if (option) selectPlayAllPause(option.dataset.playAllPause);
});
$("#music-volume").addEventListener("input", (event) => updateBackgroundMusicVolume(event.target.value));
$("#music-file").addEventListener("change", (event) => {
  const file = event.target.files[0];
  $("#music-file-name").textContent = file?.name || "Choose an MP3 file";
});
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
$("#add-folder-voice").addEventListener("click", () => { closeFolderVoiceMenu(); openFolderVoiceDialog(); });
$("#generate-staging-voice").addEventListener("click", openFolderVoiceDialog);
$("#folder-voice-trigger").addEventListener("click", (event) => { event.stopPropagation(); toggleFolderVoiceMenu(); });
$("#folder-voice-options").addEventListener("click", (event) => {
  const remove = event.target.closest("[data-folder-voice-remove]");
  if (remove) {
    closeFolderVoiceMenu();
    openDeleteFolderVoiceDialog(remove.dataset.folderVoiceRemove);
    return;
  }
  const option = event.target.closest("[data-folder-voice-option]");
  if (option) selectFolderVoice(option.dataset.folderVoiceOption);
});
$("#folder-voice-options").addEventListener("keydown", (event) => {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const options = $$("#folder-voice-options [data-folder-voice-option]");
  const current = options.indexOf(document.activeElement);
  if (!options.length) return;
  event.preventDefault();
  const next = event.key === "Home"
    ? 0
    : event.key === "End"
      ? options.length - 1
      : (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
  options[next].focus();
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".collection-card")) closeFolderCardMenus(false);
  if (!event.target.closest("#folder-voice-picker")) closeFolderVoiceMenu();
  if (!event.target.closest("#play-all-pause-picker")) closePlayAllPauseMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (openFolderMenuId) closeFolderCardMenus(true);
  if (!$("#folder-voice-menu").hidden) closeFolderVoiceMenu(true);
  if (!$("#play-all-pause-menu").hidden) closePlayAllPauseMenu(true);
});
$("#folder-select").addEventListener("change", (event) => { selectedFolderId = event.target.value; rememberFolder(); });
$("#affirmation-list").addEventListener("click", (event) => { const play = event.target.closest("[data-play-id]"); const move = event.target.closest("[data-move-id]"); const card = event.target.closest("[data-affirmation-id]"); if (play) return toggleAffirmationPlayback(play.dataset.playId); if (move) return moveAffirmation(move.dataset.moveId, Number(move.dataset.direction)); if (card && !event.target.closest("a")) { playerAffirmationId = card.dataset.affirmationId; playerActiveWord = -1; renderPlayerPanel(); } });
$("#affirmation-list").addEventListener("dragstart", (event) => { const handle = event.target.closest("[data-drag-id]"); if (!handle || orderSaving) return event.preventDefault(); draggedAffirmationId = handle.dataset.dragId; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", draggedAffirmationId); handle.closest(".affirmation-card")?.classList.add("dragging"); });
$("#affirmation-list").addEventListener("dragover", (event) => { const card = event.target.closest("[data-affirmation-id]"); if (!card || !draggedAffirmationId || card.dataset.affirmationId === draggedAffirmationId) return; event.preventDefault(); clearDropIndicators(); const placeAfter = event.clientY > card.getBoundingClientRect().top + card.offsetHeight / 2; card.classList.add(placeAfter ? "drop-after" : "drop-before"); event.dataTransfer.dropEffect = "move"; });
$("#affirmation-list").addEventListener("drop", (event) => { const card = event.target.closest("[data-affirmation-id]"); if (!card || !draggedAffirmationId) return; event.preventDefault(); const placeAfter = event.clientY > card.getBoundingClientRect().top + card.offsetHeight / 2; moveAffirmationByDrop(draggedAffirmationId, card.dataset.affirmationId, placeAfter); draggedAffirmationId = null; clearDropIndicators(); });
$("#affirmation-list").addEventListener("dragend", () => { draggedAffirmationId = null; clearDropIndicators(); $$(".affirmation-card.dragging").forEach((card) => card.classList.remove("dragging")); });
$("#voice-grid").addEventListener("click", async (event) => { const preview = event.target.closest("[data-preview]"); const remove = event.target.closest("[data-delete-voice]"); if (preview) { event.stopPropagation(); return previewVoice(preview.dataset.preview, preview); } if (remove) { event.stopPropagation(); const voice = voices.find((item) => item.id === remove.dataset.deleteVoice); if (!voice || !confirm(`Delete voice “${voice.name}”? This cannot be undone.`)) return; try { await modalApi(`/api/voices/${encodeURIComponent(voice.id)}`, {method: "DELETE"}); await loadVoices(); } catch (error) { showStatus(error.message, true); } return; } const card = event.target.closest("[data-voice]"); if (card) { customMode = false; $("#custom-upload").hidden = true; selectedVoiceId = card.dataset.voice; renderVoices(); } });
$("#toggle-custom").addEventListener("click", () => { customMode = !customMode; $("#custom-upload").hidden = !customMode; $("#toggle-custom").textContent = customMode ? "Use a saved voice instead" : "Use a one-time voice sample instead"; renderVoices(); });
$("#custom-audio").addEventListener("change", (event) => { $("#custom-filename").textContent = event.target.files[0]?.name || ""; });
[$("#speed"), $("#steps"), $("#guidance")].forEach((input) => input.addEventListener("input", updateSettings));
$("#word-gap").addEventListener("input", () => {
  if (Number($("#word-gap").value) > 0) $("#sentence-pause").value = "0";
  updateSettings();
});
$("#sentence-pause").addEventListener("input", () => {
  if (Number($("#sentence-pause").value) > 0) $("#word-gap").value = "0";
  updateSettings();
});
$("#generate-form").addEventListener("submit", generate);
$("#confirm-save").addEventListener("click", confirmSave);
$("#folder-voice-form").addEventListener("submit", generateFolderVoiceVersion);
$("#delete-folder-voice-form").addEventListener("submit", deleteSelectedFolderVoice);
$("#folder-new-voices").addEventListener("change", (event) => {
  if (!event.target.matches("input[type='checkbox']")) return;
  stopActivePreview();
  updateSelectedFolderVoiceSummary();
});
$("#folder-new-voices").addEventListener("click", (event) => {
  const button = event.target.closest("[data-preview-folder-voice]");
  if (button) previewVoice(button.dataset.previewFolderVoice, button);
});
$("#folder-voice-list").addEventListener("click", (event) => { const button = event.target.closest("[data-batch-play]"); if (button) playBatchPreview(button.dataset.batchPlay, button); });
$("#open-voice-manager").addEventListener("click", openVoiceCloneDialog);
$$('[data-voice-source]').forEach((tab) => tab.addEventListener("click", () => setVoiceSourceMode(tab.dataset.voiceSource)));
$("#start-voice-recording").addEventListener("click", startVoiceRecording);
$("#stop-voice-recording").addEventListener("click", stopVoiceRecording);
$("#rerecord-voice").addEventListener("click", () => discardVoiceRecording("Ready for a fresh recording."));
$("#voice-upload-file").addEventListener("change", (event) => {
  const file = event.target.files[0];
  $("#voice-upload-filename").textContent = file?.name || "Choose a clear voice sample";
  $("#voice-error").textContent = file && file.size > MAX_VOICE_SAMPLE_BYTES ? "Voice sample must be 12 MB or smaller." : "";
});
$("#voice-form").addEventListener("submit", saveClonedVoice);
$$('[data-close-dialog]').forEach((button) => button.addEventListener("click", () => {
  const dialog = button.closest("dialog");
  if (dialog.id === "folder-voice-dialog") {
    if (folderVoiceBusy) return;
    clearFolderVoiceBatch();
  }
  if (dialog.id === "delete-folder-voice-dialog") {
    if (folderVoiceDeleteBusy) return;
    folderVoiceDeleteId = null;
    folderVoiceDeleteReplacementId = null;
  }
  if (dialog.id === "delete-folder-dialog" && folderDeleteBusy) return;
  if (dialog.id === "music-dialog") {
    if (musicUploadBusy || musicDeleteBusyId) return;
    stopMusicPreview(false);
  }
  if (dialog.id === "voice-dialog") {
    if (voiceCloneSaving) return;
    discardVoiceRecording();
  }
  if (dialog.id === "folder-customize-dialog") {
    if (folderCustomizeBusy) return;
    releaseFolderCoverPreview();
    folderCoverRemoveRequested = false;
    folderCustomizeId = null;
  }
  if (dialog.id === "delete-folder-dialog") folderDeleteId = null;
  dialog.close();
}));
$("#folder-voice-dialog").addEventListener("cancel", (event) => {
  if (folderVoiceBusy) return event.preventDefault();
  clearFolderVoiceBatch();
});
$("#delete-folder-voice-dialog").addEventListener("cancel", (event) => {
  if (folderVoiceDeleteBusy) return event.preventDefault();
  folderVoiceDeleteId = null;
  folderVoiceDeleteReplacementId = null;
});
$("#delete-folder-dialog").addEventListener("cancel", (event) => {
  if (folderDeleteBusy) return event.preventDefault();
  folderDeleteId = null;
});
$("#folder-customize-dialog").addEventListener("cancel", (event) => {
  if (folderCustomizeBusy) return event.preventDefault();
  releaseFolderCoverPreview();
  folderCoverRemoveRequested = false;
  folderCustomizeId = null;
});
$("#music-dialog").addEventListener("cancel", (event) => {
  if (musicUploadBusy || musicDeleteBusyId) return event.preventDefault();
  stopMusicPreview(false);
});
$("#voice-dialog").addEventListener("cancel", (event) => {
  if (voiceCloneSaving) return event.preventDefault();
  discardVoiceRecording();
});

updateSettings();
if (accessCode) {
  modalApi("/api/auth/check", {cache: "no-store"}).then(showApp).catch(() => { sessionStorage.removeItem("gratitude-voice-access"); accessCode = ""; });
}
