// app.js - Tap Grid PWA
let GRID_COLUMNS = 10;
let GRID_ROWS = 5;
let TILE_COUNT = GRID_COLUMNS * GRID_ROWS;
const IMAGE_DISPLAY_MS = 60000; // 1 minute
const INITIAL_TARGET = 300;
const SPEED_SEGMENTS = 5;
const BASE_TAP_TIMEOUT_MS = 900;
const MIN_TAP_TIMEOUT_MS = 500;
const TIMEOUT_STEP_MS = 100;
const STORAGE_KEY = 'tap_state_daily_v1';
const TILE_INCREMENT = 100; // increase target by 100 after each successful run=

let state = {
  currentTarget: INITIAL_TARGET,
  tapsCount: 0,
  lastResetDay: null,
  inImagePhase: false,
  imagePhaseStartedAt: null,
  imageInterrupted: false,
  highlightedIndex: 0
};

let imageTimer = null;
let tapTimer = null;
let tapTimerStart = null;
let tapTimerDuration = null;
let tapRaf = null;
let imageOverlayEl, counterEl, msEl;
let activeSpeedSegment = 0;
let speedupAnimationTimeout = null;

// ISO day id (year-month-day)
function nowDay() {
  const date = new Date();
  const isoDateOnly = date.toISOString().split("T")[0];
  return isoDateOnly;
}

// function nowWeek() {
//   const d = new Date();
//   const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
//   // set to nearest Thursday (ISO week)
//   const day = date.getUTCDay() || 7;
//   date.setUTCDate(date.getUTCDate() + 4 - day);
//   const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
//   const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1)/7);
//   return `${date.getUTCFullYear()}-${String(weekNo).padStart(2,'0')}`;
// }

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { }
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try { Object.assign(state, JSON.parse(raw)); } catch (e) { }
  }
  // daily reset
  const day = nowDay();
  if (state.lastResetDay !== day) {
    state.currentTarget = INITIAL_TARGET;
    state.tapsCount = 0;
    state.lastResetDay = day;
    state.inImagePhase = false;
    state.imageInterrupted = false;
    state.imagePhaseStartedAt = null;
    saveState();
  }
}

function createGrid() {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  for (let i = 0; i < TILE_COUNT; i++) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.index = i;
    tile.setAttribute('role', 'button');
    tile.setAttribute('tabindex', '0');
    tile.addEventListener('click', () => onTileClick(i));
    tile.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTileClick(i); } });
    grid.appendChild(tile);
  }
  renderHighlight();
}

function renderHighlight() {
  const tiles = document.querySelectorAll('.tile');
  tiles.forEach(t => t.classList.remove('highlight'));
  const el = tiles[state.highlightedIndex];
  if (el) el.classList.add('highlight');
  updateCounter();
}

function randomDifferentIndex(exclude) {
  let idx = Math.floor(Math.random() * TILE_COUNT);
  while (idx === exclude && TILE_COUNT > 1) {
    idx = Math.floor(Math.random() * TILE_COUNT);
  }
  return idx;
}

function onTileClick(index) {
  const previousHighlight = state.highlightedIndex;
  const isCorrectTap = index === previousHighlight;

  if (isCorrectTap) {
    const previousSegment = getSegmentIndex(state.tapsCount, state.currentTarget);
    state.tapsCount += 1;
    const newSegment = getSegmentIndex(state.tapsCount, state.currentTarget);
    
    // Trigger speed-up animation when reaching a new one-fifth milestone
    if (newSegment > previousSegment) {
      triggerSpeedupAnimation();
    }
  }

  const reachedTarget = isCorrectTap && state.tapsCount >= state.currentTarget;
  state.highlightedIndex = randomDifferentIndex(previousHighlight);
  saveState();
  renderHighlight();

  if (reachedTarget) {
    clearTapTimer();
    startImagePhase();
    return;
  }

  if (!isCorrectTap) {
    return;
  }

  if (state.tapsCount >= 1) {
    startTapTimer();
  }
}

function updateCounter() {
  counterEl.textContent = `${state.tapsCount} / ${state.currentTarget}`;
}

function setProgressBar(percent) {
  const bar = document.getElementById('tapTimerBar');
  if (bar) bar.style.transform = `scaleX(${percent / 100})`;
}



function getSegmentSize(target = state.currentTarget) {
  return Math.max(1, Math.ceil(target / SPEED_SEGMENTS));
}

function getSegmentIndex(tapsCount = state.tapsCount, target = state.currentTarget) {
  const segmentSize = getSegmentSize(target);
  const idx = Math.floor(tapsCount / segmentSize);
  return Math.min(SPEED_SEGMENTS - 1, Math.max(0, idx));
}

function getTimeoutForSegment(segmentIndex) {
  const timeout = BASE_TAP_TIMEOUT_MS - (segmentIndex * TIMEOUT_STEP_MS);
  return Math.max(MIN_TAP_TIMEOUT_MS, timeout);
}

function getCurrentTimeout() {
  return getTimeoutForSegment(getSegmentIndex());
}

function updateIdleTimerDisplay() {
  if (!msEl) return;
  const nextTimeout = getTimeoutForSegment(getSegmentIndex(state.tapsCount, state.currentTarget));
  msEl.textContent = `${nextTimeout} ms`;
}

function triggerSpeedupAnimation() {
  const body = document.body;
  if (!body) return;
  body.classList.remove('speedup');
  if (speedupAnimationTimeout) {
    clearTimeout(speedupAnimationTimeout);
    speedupAnimationTimeout = null;
  }
  // force reflow so animation retriggers
  void body.offsetWidth;
  body.classList.add('speedup');
  speedupAnimationTimeout = setTimeout(() => {
    body.classList.remove('speedup');
    speedupAnimationTimeout = null;
  }, 400);
}

function refreshSpeedSegment() {
  activeSpeedSegment = getSegmentIndex();
  updateIdleTimerDisplay();
}

// update progress and ms display
function updateTapProgress() {
  if (!tapTimerStart || !tapTimerDuration) {
    setProgressBar(0);
    updateIdleTimerDisplay();
    return;
  }
  const elapsed = Date.now() - tapTimerStart;
  const remaining = Math.max(0, tapTimerDuration - elapsed);
  const percent = (remaining / tapTimerDuration) * 100;
  setProgressBar(percent);
  msEl.textContent = Math.ceil(remaining) + ' ms';
  if (remaining <= 0) {
    tapRaf = null;
    return;
  }
  tapRaf = requestAnimationFrame(updateTapProgress);
}

function startTapTimer() {
  clearTapTimer();
  const segmentIndex = getSegmentIndex();
  if (segmentIndex > activeSpeedSegment) {
    triggerSpeedupAnimation();
  }
  activeSpeedSegment = segmentIndex;
  const durationMs = getTimeoutForSegment(segmentIndex);
  tapTimerStart = Date.now();
  tapTimerDuration = durationMs;
  tapTimer = setTimeout(() => {
    resetRunDueToTimeout();
  }, durationMs);
  updateTapProgress();
}

function clearTapTimer() {
  if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; }
  if (tapRaf) { cancelAnimationFrame(tapRaf); tapRaf = null; }
  tapTimerStart = null;
  tapTimerDuration = null;
  setProgressBar(0);
  updateIdleTimerDisplay();
}

function resetRunDueToTimeout() {
  clearTapTimer();
  state.currentTarget = INITIAL_TARGET;
  state.tapsCount = 0;
  state.highlightedIndex = Math.floor(Math.random() * TILE_COUNT);
  saveState();
  renderHighlight();
  refreshSpeedSegment();
  // no sound
}

function startImagePhase() {
  if (document.hidden) {
    state.imageInterrupted = true;
    finalizeAfterImageSkip();
    return;
  }
  state.inImagePhase = true;
  state.imagePhaseStartedAt = Date.now();
  state.imageInterrupted = false;
  saveState();
  imageOverlayEl.style.display = 'flex';
  imageOverlayEl.setAttribute('aria-hidden', 'false');
  imageTimer = setTimeout(() => {
    completeImagePhase();
  }, IMAGE_DISPLAY_MS);
}

function completeImagePhase() {
  clearTimeout(imageTimer);
  imageTimer = null;
  imageOverlayEl.style.display = 'none';
  imageOverlayEl.setAttribute('aria-hidden', 'true');
  state.inImagePhase = false;
  state.imagePhaseStartedAt = null;
  state.tapsCount = 0;
  state.currentTarget += TILE_INCREMENT;
  state.highlightedIndex = Math.floor(Math.random() * TILE_COUNT);
  saveState();
  refreshSpeedSegment();
  renderHighlight();
}

function finalizeAfterImageSkip() {
  if (imageTimer) { clearTimeout(imageTimer); imageTimer = null; }
  imageOverlayEl.style.display = 'none';
  imageOverlayEl.setAttribute('aria-hidden', 'true');
  state.inImagePhase = false;
  state.imagePhaseStartedAt = null;
  state.imageInterrupted = false;
  state.tapsCount = 0;
  state.currentTarget += TILE_INCREMENT;
  state.highlightedIndex = Math.floor(Math.random() * TILE_COUNT);
  saveState();
  refreshSpeedSegment();
  renderHighlight();
}

function onVisibilityChange() {
  if (document.hidden) {
    if (state.inImagePhase) {
      state.imageInterrupted = true;
      saveState();
      if (imageTimer) { clearTimeout(imageTimer); imageTimer = null; }
      imageOverlayEl.style.display = 'none';
      imageOverlayEl.setAttribute('aria-hidden', 'true');
    }
    if (tapTimer) { resetRunDueToTimeout(); }
    localStorage.setItem('tap_last_hidden_at', Date.now().toString());
  } else {
    if (state.imageInterrupted || (state.inImagePhase && state.imagePhaseStartedAt && state.imagePhaseStartedAt + IMAGE_DISPLAY_MS < Date.now())) {
      finalizeAfterImageSkip();
    } else if (state.inImagePhase) {
      const elapsed = Date.now() - (state.imagePhaseStartedAt || Date.now());
      const remaining = Math.max(0, IMAGE_DISPLAY_MS - elapsed);
      if (remaining <= 0) { completeImagePhase(); }
      else { imageOverlayEl.style.display = 'flex'; imageOverlayEl.setAttribute('aria-hidden', 'false'); imageTimer = setTimeout(completeImagePhase, remaining); }
    } else {
      if (state.tapsCount > 0) { startTapTimer(); }
    }
  }
}

// Request persistent storage to reduce eviction risk (best-effort)
async function requestStoragePersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const already = await navigator.storage.persisted();
      if (!already) {
        const granted = await navigator.storage.persist();
        console.log('Storage.persist granted:', granted);
      } else {
        console.log('Storage already persisted.');
      }
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        console.log('Storage estimate:', estimate);
      }
    } else {
      console.log('StorageManager.persist not available.');
    }
  } catch (e) {
    console.warn('Error requesting storage persistence', e);
  }
}

async function updatePersistStatus() {
  try {
    const el = document.getElementById('persistStatus');
    if (!el) return;
    if (navigator.storage && navigator.storage.persisted) {
      const p = await navigator.storage.persisted();
      el.textContent = p ? 'Offline: pinned' : 'Offline: not pinned';
      el.style.display = 'block';
      setTimeout(() => { el.style.display = 'none'; }, 3000);
    }
  } catch (e) { }
}

function init() {
  counterEl = document.getElementById('counter');
  imageOverlayEl = document.getElementById('imageOverlay');
  msEl = document.getElementById('timeMsLeft');
  msEl.textContent = `${BASE_TAP_TIMEOUT_MS} ms`;
  // set dynamic grid size: maintain consistent tile size, adjust rows/columns to fit screen
  function setGridSizeVar() {
    const bar = document.getElementById('tapTimerBarContainer');
    const barH = bar ? bar.offsetHeight : 48;
    const vw = window.innerWidth;
    const vh = window.innerHeight - barH;
    
    const gapSize = 6; // CSS var --gap
    const targetTileSize = 100; // Fixed tile size similar to original (adjust this value to match your preferred size)
    
    // Calculate how many tiles can fit in each dimension
    const maxColumns = Math.floor((vw + gapSize) / (targetTileSize + gapSize));
    const maxRows = Math.floor((vh + gapSize) / (targetTileSize + gapSize));
    
    // Ensure minimum grid size
    const minColumns = Math.max(5, maxColumns);
    const minRows = Math.max(3, maxRows);
    
    // Use the calculated dimensions
    const bestColumns = Math.min(15, minColumns); // Cap at reasonable maximum
    const bestRows = Math.min(12, minRows); // Cap at reasonable maximum
    
    // Update grid dimensions if they changed
    const oldTileCount = TILE_COUNT;
    GRID_COLUMNS = bestColumns;
    GRID_ROWS = bestRows;
    TILE_COUNT = bestColumns * bestRows;
    
    // If tile count changed, we need to recreate the grid
    if (oldTileCount !== TILE_COUNT) {
      // Ensure highlighted index is still valid
      if (state.highlightedIndex >= TILE_COUNT) {
        state.highlightedIndex = Math.floor(Math.random() * TILE_COUNT);
      }
      createGrid();
    }
    
    // Calculate actual grid dimensions using the target tile size
    const gridWidth = targetTileSize * bestColumns + gapSize * (bestColumns - 1);
    const gridHeight = targetTileSize * bestRows + gapSize * (bestRows - 1);
    
    document.documentElement.style.setProperty('--grid-columns', bestColumns.toString());
    document.documentElement.style.setProperty('--grid-rows', bestRows.toString());
    document.documentElement.style.setProperty('--grid-width', gridWidth + 'px');
    document.documentElement.style.setProperty('--grid-height', gridHeight + 'px');
  }
  setGridSizeVar();
  window.addEventListener('resize', setGridSizeVar);
  window.addEventListener('orientationchange', setGridSizeVar);
  loadState();
  if (typeof state.highlightedIndex !== 'number' || state.highlightedIndex < 0 || state.highlightedIndex >= TILE_COUNT) {
    state.highlightedIndex = Math.floor(Math.random() * TILE_COUNT);
  }
  createGrid();
  refreshSpeedSegment();
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('beforeunload', () => {
    if (state.inImagePhase) {
      state.imageInterrupted = true;
      state.inImagePhase = false;
      saveState();
    }
    if (tapTimer) { clearTapTimer(); state.tapsCount = 0; saveState(); }
    window.removeEventListener('resize', setGridSizeVar);
    window.removeEventListener('orientationchange', setGridSizeVar);
  });
  if (state.inImagePhase) {
    const elapsed = Date.now() - (state.imagePhaseStartedAt || 0);
    if (elapsed >= IMAGE_DISPLAY_MS) { completeImagePhase(); }
    else { imageOverlayEl.style.display = 'flex'; imageOverlayEl.setAttribute('aria-hidden', 'false'); imageTimer = setTimeout(completeImagePhase, IMAGE_DISPLAY_MS - elapsed); }
  } else if (state.imageInterrupted) { finalizeAfterImageSkip(); }
  else { renderHighlight(); if (state.tapsCount > 0) startTapTimer(); }
  if ('serviceWorker' in navigator) { navigator.serviceWorker.register('./service-worker.js').catch(() => { }); }
  try { requestStoragePersistence().then(() => updatePersistStatus()).catch(() => { }); } catch (e) { }
}

document.addEventListener('DOMContentLoaded', init);
