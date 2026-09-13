const audio = document.getElementById("audio");
const playButton = document.getElementById("play-pause");
const seekBar = document.getElementById("seek-bar");
const volumeSlider = document.getElementById("volume-slider");
const titleEl = document.getElementById("track-title");
const artistEl = document.getElementById("track-artist");
const timeEl = document.getElementById("track-time");
const recordArt = document.getElementById("record-art");
const artEl = document.getElementById("record-art-current");
const nextArtEl = document.getElementById("record-art-next");
const fallbackArt = "assets/img/black.png";

const trackNames = [
  ["Playboi Carti", "24 Songs", "24Songs"], ["Yeat", "Cali", "Cali"], ["PIXY", "LEGACY", "LEGACY"],
  ["mikeeysmind", "Ethereal", "Ethereal"], ["fakemink", "Look At Me", "LookAtMe"], ["LONOWN", "addiction", "addiction"],
  ["ADTurnUp", "majestic", "majestic"], ["LONOWN", "worry", "worry"], ["LONOWN", "starly", "starly"],
  ["SUNSHXNE", "I Lose It", "ILoseIt"], ["Yeat", "TURNMEUP", "TURNMEUP"]
].map(([artist, title, file]) => ({ artist, title, path: `assets/music/${file}.mp3` }));

function shuffleTracks(tracks) {
  const shuffled = [...tracks];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

const mixQueue = shuffleTracks(trackNames);
let current = 0;
let playing = false;
let transitionStarted = false;
let transitionId = 0;
let transitionTimer = null;
let targetVolume = Number(volumeSlider.value);
let nextAudio = new Audio();
nextAudio.preload = "auto";
let activeAudio = audio;
let standbyAudio = nextAudio;
let artworkRequest = 0;

const analyserState = { context: null, analyser: null, data: null, lastEnergy: 0, lastBeat: 0, lastBeatAudioTime: null };
const audioEffects = new Map();
const trackAnalysis = new Map();
const DEFAULT_BPM = 120;
const MIN_BPM = 70;
const MAX_BPM = 180;
const MIX_BASS_CUT = -10;
const MAX_CROSSFADE_MS = 10000;

function formatTime(seconds) {
  return Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}` : "0:00";
}

function estimateBpm(buffer) {
  const channel = buffer.getChannelData(0);
  const windowSize = 2048;
  const hopSize = 1024;
  const energies = [];
  for (let offset = 0; offset + windowSize < channel.length; offset += hopSize) {
    let energy = 0;
    for (let sample = offset; sample < offset + windowSize; sample += 32) {
      energy += Math.abs(channel[sample]);
    }
    energies.push(energy / (windowSize / 32));
  }
  if (energies.length < 8) return DEFAULT_BPM;

  const average = energies.reduce((sum, energy) => sum + energy, 0) / energies.length;
  const variance = energies.reduce((sum, energy) => sum + (energy - average) ** 2, 0) / energies.length;
  const deviation = Math.sqrt(variance);
  const onsets = [];
  for (let index = 1; index < energies.length; index += 1) {
    const rise = energies[index] - energies[index - 1];
    if (rise > deviation * 0.7 && energies[index] > average * 1.1) onsets.push(index);
  }
  if (onsets.length < 3) return DEFAULT_BPM;

  const intervals = [];
  for (let index = 1; index < onsets.length; index += 1) {
    const seconds = (onsets[index] - onsets[index - 1]) * hopSize / buffer.sampleRate;
    if (seconds >= 60 / MAX_BPM && seconds <= 60 / MIN_BPM) intervals.push(seconds);
  }
  if (!intervals.length) return DEFAULT_BPM;
  intervals.sort((a, b) => a - b);
  const interval = intervals[Math.floor(intervals.length / 2)];
  let bpm = 60 / interval;
  while (bpm < MIN_BPM) bpm *= 2;
  while (bpm > MAX_BPM) bpm /= 2;
  return Math.round(bpm);
}

async function analyseTrack(track) {
  if (trackAnalysis.has(track.path)) return trackAnalysis.get(track.path);
  const pending = (async () => {
    try {
      if (!["http:", "https:"].includes(window.location.protocol)) return { bpm: DEFAULT_BPM };
      const response = await fetch(track.path);
      if (!response.ok) throw new Error(`Track analysis failed: ${response.status}`);
      const bytes = await response.arrayBuffer();
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return { bpm: DEFAULT_BPM };
      const context = new AudioContext();
      try {
        const buffer = await context.decodeAudioData(bytes);
        return { bpm: estimateBpm(buffer) };
      } finally {
        await context.close();
      }
    } catch (error) {
      console.warn(`Unable to analyse BPM for ${track.title}; using ${DEFAULT_BPM} BPM.`, error);
      return { bpm: DEFAULT_BPM };
    }
  })();
  trackAnalysis.set(track.path, pending);
  return pending;
}

function getTempoRatio(currentBpm, nextBpm) {
  if (!currentBpm || !nextBpm) return 1;
  return Math.min(1.08, Math.max(0.92, currentBpm / nextBpm));
}

function renderTrack() {
  const track = mixQueue[current];
  titleEl.textContent = track.title;
  artistEl.textContent = track.artist;
  recordArt.classList.remove("is-crossfading");
  if (!activeAudio.src || !activeAudio.src.endsWith(track.path)) activeAudio.src = track.path;
  document.getElementById("track-count").textContent = `${mixQueue.length} tracks`;
  loadArtwork(track, artEl);
}

async function loadArtwork(track, imageElement) {
  const requestId = ++artworkRequest;
  imageElement.dataset.artworkRequest = String(requestId);
  const cacheKey = `${track.artist}:${track.title}`;
  if (loadArtwork.cache.has(cacheKey)) {
    imageElement.src = loadArtwork.cache.get(cacheKey);
    imageElement.classList.remove("is-loading");
    return;
  }
  imageElement.classList.add("is-loading");
  try {
    const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(`${track.artist} ${track.title}`)}&entity=song&limit=10`);
    if (!response.ok) throw new Error(`Artwork request failed: ${response.status}`);
    const data = await response.json();
    const result = data.results?.find((candidate) =>
      matchesArtworkTrack(candidate, track.artist, track.title)
    );
    const artwork = result?.artworkUrl100?.replace("100x100", "600x600");
    if (!artwork || imageElement.dataset.artworkRequest !== String(requestId)) throw new Error("Artwork not found");
    await setImageSource(imageElement, artwork);
    loadArtwork.cache.set(cacheKey, artwork);
  } catch (error) {
    if (imageElement.dataset.artworkRequest === String(requestId)) imageElement.src = fallbackArt;
  } finally {
    imageElement.classList.remove("is-loading");
  }
}
loadArtwork.cache = new Map();

function normalizeSearchValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function matchesArtworkTrack(candidate, artist, title) {
  const expectedArtist = normalizeSearchValue(artist);
  const expectedTitle = normalizeSearchValue(title);
  const actualArtist = normalizeSearchValue(candidate.artistName);
  const actualTitle = normalizeSearchValue(candidate.trackName);
  if (!actualArtist || !actualTitle) return false;
  const artistMatches = actualArtist === expectedArtist ||
    actualArtist.includes(expectedArtist) ||
    expectedArtist.includes(actualArtist);
  const titleMatches = actualTitle === expectedTitle ||
    actualTitle.replace(/\s+(feat|ft)\s+.*$/, "") === expectedTitle;
  return artistMatches && titleMatches;
}

function setImageSource(imageElement, source) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => { imageElement.src = source; resolve(); };
    image.onerror = () => { imageElement.src = fallbackArt; resolve(); };
    image.src = source;
  });
}

function setPlaying(value) {
  playing = value;
  playButton.innerHTML = `<i class="fa-solid fa-${value ? "pause" : "play"}"></i>`;
  document.getElementById("record-art").classList.toggle("is-playing", value);
}

function setupAnalyser() {
  if (analyserState.context) return;
  // MediaElementAudioSource is muted by browsers for file:// documents.
  // Native HTMLAudio playback remains supported, so only analyse hosted pages.
  if (!["http:", "https:"].includes(window.location.protocol)) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  try {
    analyserState.context = new AudioContext();
    analyserState.analyser = analyserState.context.createAnalyser();
    analyserState.analyser.fftSize = 256;
    analyserState.data = new Uint8Array(analyserState.analyser.frequencyBinCount);
    [activeAudio, standbyAudio].forEach((deck) => {
      const source = analyserState.context.createMediaElementSource(deck);
      const bassFilter = analyserState.context.createBiquadFilter();
      bassFilter.type = "lowshelf";
      bassFilter.frequency.value = 180;
      bassFilter.gain.value = 0;
      source.connect(bassFilter);
      bassFilter.connect(analyserState.analyser);
      audioEffects.set(deck, { bassFilter });
    });
    analyserState.analyser.connect(analyserState.context.destination);
  } catch (error) {
    analyserState.context?.close();
    analyserState.context = null;
    analyserState.analyser = null;
    analyserState.data = null;
    console.warn("Beat analysis unavailable; using native audio playback.", error);
  }

}

function setBassGain(deck, gain) {
  const effect = audioEffects.get(deck);
  if (!effect || !analyserState.context) return;
  effect.bassFilter.gain.setTargetAtTime(gain, analyserState.context.currentTime, 0.08);
}

function monitorBeat() {
  if (playing && analyserState.analyser) {
    analyserState.analyser.getByteFrequencyData(analyserState.data);
    const energy = analyserState.data.reduce((sum, value) => sum + value, 0) / analyserState.data.length;
    const now = performance.now();
    if (energy > Math.max(105, analyserState.lastEnergy * 1.35) && now - analyserState.lastBeat > 180) {
      analyserState.lastBeat = now;
      analyserState.lastBeatAudioTime = activeAudio.currentTime;
      document.body.classList.remove("beat-hit");
      requestAnimationFrame(() => document.body.classList.add("beat-hit"));
    }
    analyserState.lastEnergy = analyserState.lastEnergy * 0.92 + energy * 0.08;
  }
  requestAnimationFrame(monitorBeat);
}

function preloadNext() {
  const nextTrack = mixQueue[(current + 1) % mixQueue.length];
  standbyAudio.src = nextTrack.path;
  standbyAudio.load();
  analyseTrack(nextTrack);
}

async function startCrossfade() {
  if (transitionStarted || !playing || !Number.isFinite(activeAudio.duration)) return;
  transitionStarted = true;
  seekBar.classList.add("is-crossfading");
  const currentTransitionId = ++transitionId;
  const nextIndex = (current + 1) % mixQueue.length;
  const nextTrack = mixQueue[nextIndex];
  const [currentAnalysis, nextAnalysis] = await Promise.all([
    analyseTrack(mixQueue[current]),
    analyseTrack(nextTrack)
  ]);
  if (currentTransitionId !== transitionId) return;
  recordArt.classList.add("is-crossfading");
  loadArtwork(nextTrack, nextArtEl);
  standbyAudio.volume = 0;
  standbyAudio.playbackRate = 1;
  standbyAudio.currentTime = 0;
  setBassGain(activeAudio, 0);
  setBassGain(standbyAudio, MIX_BASS_CUT);
  let nextStarted = false;
  let incomingStartedAt = null;
  const tempoRatio = getTempoRatio(currentAnalysis.bpm, nextAnalysis.bpm);
  const beatInterval = 60 / currentAnalysis.bpm;
  const beatPhase = Number.isFinite(analyserState.lastBeatAudioTime)
    ? activeAudio.currentTime - analyserState.lastBeatAudioTime
    : activeAudio.currentTime;
  const beatDelay = Math.min(beatInterval, beatInterval - (beatPhase % beatInterval));
  const startIncoming = () => {
    if (nextStarted || currentTransitionId !== transitionId) return;
    nextStarted = true;
    incomingStartedAt = performance.now();
    standbyAudio.play().catch(() => {
      if (currentTransitionId !== transitionId) return;
      nextStarted = false;
      transitionStarted = false;
      skipTo(nextIndex);
    });
  };
  const remainingMs = Math.max(0, (activeAudio.duration - activeAudio.currentTime) * 1000);
  const duration = Math.min(MAX_CROSSFADE_MS, Math.max(800, remainingMs - beatDelay * 1000 - 250));
  if (standbyAudio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
    window.setTimeout(startIncoming, beatDelay * 1000);
  } else {
    standbyAudio.addEventListener("canplay", () => window.setTimeout(startIncoming, beatDelay * 1000), { once: true });
    standbyAudio.load();
    window.setTimeout(startIncoming, Math.max(900, beatDelay * 1000));
  }
  const finishTransition = () => {
    if (currentTransitionId !== transitionId) return;
    activeAudio.pause();
    const oldAudio = activeAudio;
    activeAudio = standbyAudio;
    standbyAudio = oldAudio;
    activeAudio.volume = targetVolume;
    standbyAudio.volume = 0;
    setBassGain(activeAudio, 0);
    setBassGain(standbyAudio, 0);
    current = nextIndex;
    analyserState.lastBeatAudioTime = null;
    transitionStarted = false;
    transitionTimer = null;
    seekBar.classList.remove("is-crossfading");
    setPlaying(true);
    artEl.src = nextArtEl.src || fallbackArt;
    renderTrack();
    preloadNext();
  };
  const fade = () => {
    if (currentTransitionId !== transitionId) return;
    const now = performance.now();
    const progress = incomingStartedAt === null
      ? 0
      : Math.min(1, Math.max(0, (now - incomingStartedAt) / duration));
    activeAudio.volume = targetVolume * (1 - progress);
    standbyAudio.volume = targetVolume * progress;
    setBassGain(activeAudio, MIX_BASS_CUT * progress);
    setBassGain(standbyAudio, MIX_BASS_CUT * (1 - progress));
    const tempoProgress = incomingStartedAt === null
      ? 0
      : Math.min(1, (now - incomingStartedAt) / Math.min(4500, duration));
    standbyAudio.playbackRate = 1 + (tempoRatio - 1) * tempoProgress;
    if (progress < 1) transitionTimer = window.setTimeout(fade, 50);
    else finishTransition();
  };
  fade();
}

function skipTo(index) {
  transitionId += 1;
  if (transitionTimer !== null) {
    window.clearTimeout(transitionTimer);
    transitionTimer = null;
  }
  current = (index + mixQueue.length) % mixQueue.length;
  analyserState.lastBeatAudioTime = null;
  transitionStarted = false;
  seekBar.classList.remove("is-crossfading");
  activeAudio.pause();
  setBassGain(activeAudio, 0);
  setBassGain(standbyAudio, 0);
  activeAudio.playbackRate = 1;
  standbyAudio.playbackRate = 1;
  activeAudio.src = mixQueue[current].path;
  activeAudio.load();
  renderTrack();
  preloadNext();
  if (playing) activeAudio.play().catch(() => setPlaying(false));
}

playButton.addEventListener("click", () => {
  setupAnalyser();
  analyserState.context?.resume();
  if (activeAudio.paused) {
    activeAudio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  } else {
    activeAudio.pause();
    standbyAudio.pause();
    setPlaying(false);
  }
});
document.getElementById("next").addEventListener("click", () => skipTo(current + 1));
document.getElementById("prev").addEventListener("click", () => skipTo(current - 1));
document.getElementById("volume-button").addEventListener("click", () => {
  activeAudio.muted = !activeAudio.muted;
  document.getElementById("volume-button").innerHTML = `<i class="fa-solid fa-volume-${activeAudio.muted ? "xmark" : "high"}"></i>`;
});
volumeSlider.addEventListener("input", () => {
  targetVolume = Number(volumeSlider.value);
  activeAudio.volume = targetVolume;
  activeAudio.muted = false;
  volumeSlider.style.setProperty("--volume-progress", `${targetVolume * 100}`);
});
seekBar.addEventListener("input", () => {
  seekBar.style.setProperty("--range-progress", seekBar.value);
  if (activeAudio.duration) activeAudio.currentTime = Number(seekBar.value) / 100 * activeAudio.duration;
});
function handleTimeUpdate(event) {
  if (event.currentTarget !== activeAudio) return;
  if (activeAudio.duration) {
    seekBar.value = activeAudio.currentTime / activeAudio.duration * 100;
    seekBar.style.setProperty("--range-progress", seekBar.value);
  }
  timeEl.textContent = `${formatTime(activeAudio.currentTime)} / ${formatTime(activeAudio.duration)}`;
  const timeRemaining = activeAudio.duration - activeAudio.currentTime;
  if (timeRemaining <= 16) startCrossfade();
}
audio.addEventListener("timeupdate", handleTimeUpdate);
standbyAudio.addEventListener("timeupdate", handleTimeUpdate);
function handleEnded(event) {
  if (event.currentTarget !== activeAudio) return;
  if (!transitionStarted) {
    skipTo(current + 1);
    return;
  }
  // Background tabs can delay transition timers. Keep the incoming deck
  // running if the outgoing deck reaches its natural end first.
  if (standbyAudio.paused) standbyAudio.play().catch(() => skipTo(current + 1));
}
audio.addEventListener("ended", handleEnded);
standbyAudio.addEventListener("ended", handleEnded);
function handlePlay(event) {
  if (event.currentTarget === activeAudio) setPlaying(true);
}
function handlePause(event) {
  if (event.currentTarget === activeAudio && !transitionStarted) setPlaying(false);
}
audio.addEventListener("play", handlePlay);
standbyAudio.addEventListener("play", handlePlay);
audio.addEventListener("pause", handlePause);
standbyAudio.addEventListener("pause", handlePause);
function handleError(event) {
  if (event.currentTarget !== activeAudio) return;
  const mediaError = activeAudio.error;
  if (mediaError) {
    artistEl.textContent = "Audio could not be loaded";
    setPlaying(false);
    console.error(`Unable to play ${mixQueue[current].path}: media error ${mediaError.code}`);
  }
}
audio.addEventListener("error", handleError);
standbyAudio.addEventListener("error", handleError);

activeAudio.volume = targetVolume;
volumeSlider.style.setProperty("--volume-progress", `${targetVolume * 100}`);
renderTrack();
activeAudio.load();
preloadNext();
monitorBeat();
