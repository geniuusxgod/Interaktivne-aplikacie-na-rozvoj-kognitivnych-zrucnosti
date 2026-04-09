<template>
  <div class="module">
    <h2>Visual Search</h2>
    <p class="module-description">
      <b>Rule: </b>Na obrazovke sa zobrazí skupina veľmi podobných symbolov, z ktorých jeden sa od ostatných odlišuje. Používateľ má tento odlišný prvok čo najrýchlejšie nájsť a označiť, čím sa precvičuje vizuálne vyhľadávanie a koncentrácia na detail.
    </p>

    <div class="topbar">
      <div><b>Round:</b> {{ trialIndex }} / {{ totalTrials }}</div>
    </div>

    <div class="scorebar">
      <div><b>Score:</b> {{ score }}</div>
      <div><b>Best score:</b> {{ bestScore }}</div>
    </div>

    <div class="game-shell" ref="gameShellRef">
      <div class="game-shell-header">
        <div class="game-shell-title-wrap">
          <div class="game-shell-title">Visual Search</div>
          <div class="game-shell-subtitle">
            {{
              currentItems.length > 0
                ? "Find the different symbol"
                : phase === "running"
                  ? "Wait for the next grid"
                  : "Ready"
            }}
          </div>
        </div>

        <button class="fullscreen-btn" @click="toggleFullscreen">
          {{ isFullscreen ? "Exit fullscreen" : "Fullscreen" }}
        </button>
      </div>

      <div class="game-shell-body">
        <div class="shell-top-status">
          <div v-if="combo >= 2" class="combo-badge">
            🔥 Combo x{{ combo }} • {{ comboMultiplier.toFixed(1) }}x
          </div>
        </div>

        <transition name="score-pop">
          <div
            v-if="floatingScore"
            class="floating-score"
            :class="{ negative: floatingScore.value < 0 }"
          >
            {{ floatingScore.value >= 0 ? `+${floatingScore.value}` : floatingScore.value }}
          </div>
        </transition>

        <div class="progress">
          <div
            class="progress-fill"
            :style="{ width: `${Math.min(100, (trialIndex / totalTrials) * 100)}%` }"
          ></div>
        </div>
        <div class="game-main">
          <div
            class="search-area"
            :style="{ gridTemplateColumns: `repeat(${levelConfig.gridColumns}, 70px)` }"
          >
            <button
              v-for="item in currentItems"
              :key="item.id"
              class="search-item"
              :class="{ targetClicked: clicked && item.id === clickedItemId }"
              :disabled="phase !== 'running' || currentItems.length === 0 || clicked"
              @click="handleItemClick(item)"
            >
              {{ item.symbol }}
            </button>
          </div>
        </div>

        <div class="controls controls-centered">
          <button class="btn btn-start" :disabled="phase === 'running'" @click="start">Start</button>
          <button class="btn btn-stop" :disabled="phase !== 'running'" @click="stop">Stop</button>
          <button class="btn btn-reset" :disabled="phase !== 'finished'" @click="reset">Reset</button>
        </div>
      </div>
    </div>

    <div v-if="phase === 'finished'" class="results">
      <h3>Results</h3>
      <ul>
        <li>Hits: {{ summary.hits }}</li>
        <li>Wrong clicks: {{ summary.wrongClicks }}</li>
        <li>Misses: {{ summary.misses }}</li>
        <li>Accuracy: {{ summary.accuracy.toFixed(1) }}%</li>
        <li>Avg RT: {{ summary.avgRTms === null ? "—" : summary.avgRTms.toFixed(0) + " ms" }}</li>
        <li>Final difficulty: {{ summary.finalDifficulty }}</li>
        <li>Final score: {{ score }}</li>
        <li>Best score: {{ bestScore }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import { useGameSession } from "../composables/useGameSession";
import { useTimeout } from "../composables/useTimeout";
import { useAdaptiveDifficulty } from "../composables/useAdaptiveDifficulty";
import { useGameScoring } from "../composables/useGameScoring";
import { auth } from "../firebase";
import { getUserGameStat, saveAttempt } from "../services/gameResultsService";

const MODULE_ID = "perception_visual_search";
const CATEGORY = "vnimanie";
const GAME_KEY = "visualsearch";

const {
  phase,
  trialIndex,
  responses,
  startSession,
  stopSession,
  resetSession,
  nextTrial,
  addResponse
} = useGameSession(MODULE_ID, CATEGORY);

const { setManagedTimeout, clearAllTimeouts } = useTimeout();

const {
  difficulty,
  difficultyLabel,
  resetDifficulty,
  updateDifficulty
} = useAdaptiveDifficulty({
  minDifficulty: 1,
  maxDifficulty: 10,
  startDifficulty: 3,
  fastThresholdMs: 700,
  slowThresholdMs: 2200,
  targetAccuracyMin: 0.72,
  targetAccuracyMax: 0.88,
  windowSize: 4,
  evaluateEvery: 2,
  scoreIncreaseThreshold: 72,
  scoreDecreaseThreshold: 42
});

const { score, bestScore, lastDelta, awardScore, resetScore, setBestScore } = useGameScoring(MODULE_ID, {
  fastThresholdMs: 700,
  slowThresholdMs: 2200
});

const totalTrials = ref(18);

const difficultySettings = [
  { gridColumns: 4, gridRows: 3, stimulusDurationMs: 2400, isiMs: 520, targetMode: "shape" },
  { gridColumns: 4, gridRows: 4, stimulusDurationMs: 2200, isiMs: 500, targetMode: "shape" },
  { gridColumns: 5, gridRows: 4, stimulusDurationMs: 2000, isiMs: 470, targetMode: "shape" },
  { gridColumns: 5, gridRows: 5, stimulusDurationMs: 1800, isiMs: 440, targetMode: "shape" },
  { gridColumns: 5, gridRows: 5, stimulusDurationMs: 1650, isiMs: 410, targetMode: "orientation" },
  { gridColumns: 6, gridRows: 5, stimulusDurationMs: 1500, isiMs: 380, targetMode: "orientation" },
  { gridColumns: 6, gridRows: 6, stimulusDurationMs: 1350, isiMs: 350, targetMode: "orientation" },
  { gridColumns: 7, gridRows: 6, stimulusDurationMs: 1200, isiMs: 320, targetMode: "orientation" },
  { gridColumns: 7, gridRows: 7, stimulusDurationMs: 1050, isiMs: 290, targetMode: "orientation" },
  { gridColumns: 8, gridRows: 7, stimulusDurationMs: 900, isiMs: 260, targetMode: "orientation" }
];

const levelConfig = computed(() => {
  const index = Math.max(0, Math.min(difficultySettings.length - 1, difficulty.value - 1));
  return difficultySettings[index];
});

const itemCount = computed(() => levelConfig.value.gridColumns * levelConfig.value.gridRows);

const currentItems = ref([]);
const targetId = ref(null);

const shownAtMs = ref(null);
const clicked = ref(false);
const clickedAtMs = ref(null);
const clickedCorrect = ref(false);
const clickedItemId = ref(null);

const combo = ref(0);
const comboMultiplier = computed(() => 1 + combo.value * 0.1);
const floatingScore = ref(null);

const gameShellRef = ref(null);
const isFullscreen = ref(false);

const attemptSaved = ref(false);
const saveError = ref(null);

function nowMs() {
  return performance.now();
}

function updateCombo(correct) {
  combo.value = correct ? combo.value + 1 : 0;
}

function showFloatingScore(value) {
  floatingScore.value = { value };

  setManagedTimeout(() => {
    floatingScore.value = null;
  }, 650);
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) {
    await gameShellRef.value?.requestFullscreen();
  } else {
    await document.exitFullscreen();
  }
}

function handleFullscreenChange() {
  isFullscreen.value = Boolean(document.fullscreenElement);
}

function reset() {
  clearAllTimeouts();
  resetSession();
  resetDifficulty();
  resetScore();

  currentItems.value = [];
  targetId.value = null;
  shownAtMs.value = null;
  clicked.value = false;
  clickedAtMs.value = null;
  clickedCorrect.value = false;
  clickedItemId.value = null;

  combo.value = 0;
  floatingScore.value = null;
  attemptSaved.value = false;
  saveError.value = null;
}

function stop() {
  clearAllTimeouts();
  currentItems.value = [];
  targetId.value = null;
  floatingScore.value = null;
  stopSession();
}

function start() {
  reset();
  startSession();
  nextVisualSearchTrial();
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
  return arr;
}

function generateShapeModeItems(count) {
  const baseSymbol = Math.random() < 0.5 ? "●" : "■";
  const targetSymbol = baseSymbol === "●" ? "■" : "●";

  const targetIndex = Math.floor(Math.random() * count);
  const items = [];

  for (let i = 0; i < count; i++) {
    items.push({
      id: i + 1,
      symbol: i === targetIndex ? targetSymbol : baseSymbol,
      isTarget: i === targetIndex
    });
  }

  return shuffle(items);
}

function generateOrientationModeItems(count) {
  const baseSymbol = Math.random() < 0.5 ? "▲" : "▶";
  const targetSymbol = baseSymbol === "▲" ? "▶" : "▲";

  const targetIndex = Math.floor(Math.random() * count);
  const items = [];

  for (let i = 0; i < count; i++) {
    items.push({
      id: i + 1,
      symbol: i === targetIndex ? targetSymbol : baseSymbol,
      isTarget: i === targetIndex
    });
  }

  return shuffle(items);
}

function generateItems(count) {
  if (levelConfig.value.targetMode === "orientation") {
    return generateOrientationModeItems(count);
  }
  return generateShapeModeItems(count);
}

function finalizeTrial() {
  if (shownAtMs.value === null) return;

  const rtMs =
    clicked.value && clickedAtMs.value !== null
      ? Math.max(0, clickedAtMs.value - shownAtMs.value)
      : null;

  const correct = clickedCorrect.value;
  const missed = !clicked.value;
  const wrongClick = clicked.value && !clickedCorrect.value;

  addResponse({
    trial: trialIndex.value,
    itemCount: itemCount.value,
    difficulty: difficulty.value,
    gridColumns: levelConfig.value.gridColumns,
    gridRows: levelConfig.value.gridRows,
    targetMode: levelConfig.value.targetMode,
    clicked: clicked.value,
    correct,
    missed,
    wrongClick,
    rtMs
  });

  updateDifficulty({
    correct,
    rtMs: correct ? rtMs : null,
    lapse: missed,
    penalty: wrongClick ? 0.24 : missed ? 0.14 : 0
  });

  awardScore({
    correct,
    difficulty: difficulty.value,
    rtMs: correct ? rtMs : null,
    penalty: wrongClick ? 0.34 : missed ? 0.18 : 0
  });

  updateCombo(correct);
  showFloatingScore(lastDelta.value);
}

async function loadBestScore() {
  if (!auth.currentUser) {
    setBestScore(0);
    return;
  }

  try {
    const stat = await getUserGameStat(auth.currentUser.uid, GAME_KEY);
    setBestScore(stat?.bestScore ?? 0);
  } catch (error) {
    console.error("Failed to load best score:", error);
    setBestScore(0);
  }
}

function nextVisualSearchTrial() {
  if (phase.value !== "running") return;

  if (trialIndex.value >= totalTrials.value) {
    currentItems.value = [];
    targetId.value = null;
    stopSession();
    return;
  }

  nextTrial();

  const items = generateItems(itemCount.value);
  currentItems.value = items;

  const target = items.find(item => item.isTarget);
  targetId.value = target ? target.id : null;

  shownAtMs.value = nowMs();
  clicked.value = false;
  clickedAtMs.value = null;
  clickedCorrect.value = false;
  clickedItemId.value = null;

  setManagedTimeout(() => {
    finalizeTrial();
    currentItems.value = [];
    targetId.value = null;

    setManagedTimeout(() => {
      nextVisualSearchTrial();
    }, levelConfig.value.isiMs);
  }, levelConfig.value.stimulusDurationMs);
}

function handleItemClick(item) {
  if (phase.value !== "running") return;
  if (currentItems.value.length === 0) return;
  if (clicked.value) return;

  clicked.value = true;
  clickedAtMs.value = nowMs();
  clickedCorrect.value = item.isTarget;
  clickedItemId.value = item.id;
}

onMounted(() => {
  loadBestScore();
  document.addEventListener("fullscreenchange", handleFullscreenChange);
});

onBeforeUnmount(() => {
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
  clearAllTimeouts();
});

const summary = computed(() => {
  const hits = responses.value.filter(r => r.correct).length;
  const wrongClicks = responses.value.filter(r => r.wrongClick).length;
  const misses = responses.value.filter(r => r.missed).length;

  const rts = responses.value
    .filter(r => r.correct && r.rtMs !== null)
    .map(r => r.rtMs);

  return {
    hits,
    wrongClicks,
    misses,
    accuracy: responses.value.length ? (hits / responses.value.length) * 100 : 0,
    avgRTms: rts.length ? rts.reduce((a, b) => a + b, 0) / rts.length : null,
    finalDifficulty: difficulty.value
  };
});

watch(
  () => phase.value,
  async (newPhase) => {
    if (newPhase !== "finished") return;
    if (attemptSaved.value) return;
    if (!auth.currentUser) return;
    if (!responses.value.length) return;

    attemptSaved.value = true;
    saveError.value = null;

    try {
      const stat = await saveAttempt({
        uid: auth.currentUser.uid,
        username: auth.currentUser.displayName || auth.currentUser.email,
        gameKey: GAME_KEY,
        score: score.value,
        accuracy: summary.value.accuracy,
        durationMs: summary.value.avgRTms ? Math.round(summary.value.avgRTms) : null,
        difficultyStart: 3,
        difficultyEnd: difficulty.value,
        rawPayload: {
          hits: summary.value.hits,
          wrongClicks: summary.value.wrongClicks,
          misses: summary.value.misses,
          avgRTms: summary.value.avgRTms
        }
      });
      setBestScore(stat?.bestScore ?? 0);
    } catch (error) {
      console.error("Failed to save Visual Search attempt:", error);
      saveError.value = error;
      attemptSaved.value = false;
    }
  }
);
</script>

<style scoped>
.module {
  max-width: 820px;
  margin: 0 auto;
  padding: 16px;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial;
}

.topbar,
.scorebar {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.game-shell {
  position: relative;
  background: #0f172a;
  color: white;
  border-radius: 24px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
  max-width: 980px;
  margin: 20px auto;
}

.game-shell-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.game-shell-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.game-shell-title {
  font-size: 22px;
  font-weight: 700;
}

.game-shell-subtitle {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
}

.fullscreen-btn {
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.08);
  color: white;
  cursor: pointer;
}

.fullscreen-btn:hover {
  background: rgba(255, 255, 255, 0.14);
}

.game-shell-body {
  padding: 24px;
}

.shell-top-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  margin-bottom: 8px;
}

.combo-badge {
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.14);
  color: #fcd34d;
  border: 1px solid rgba(245, 158, 11, 0.3);
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.2px;
}

.floating-score {
  position: absolute;
  top: 98px;
  right: 28px;
  z-index: 5;
  padding: 10px 14px;
  border-radius: 14px;
  background: rgba(34, 197, 94, 0.18);
  color: #bbf7d0;
  border: 1px solid rgba(34, 197, 94, 0.35);
  font-weight: 800;
  font-size: 18px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
}

.floating-score.negative {
  background: rgba(239, 68, 68, 0.18);
  color: #fecaca;
  border: 1px solid rgba(239, 68, 68, 0.35);
}

.score-pop-enter-active,
.score-pop-leave-active {
  transition: all 0.35s ease;
}

.score-pop-enter-from,
.score-pop-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.96);
}

.progress {
  height: 8px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 18px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #f59e0b, #fb923c);
  transition: width 0.3s ease;
}

.search-area {
  display: grid;
  gap: 10px;
  justify-content: center;
  margin: 16px 0 20px;
  min-height: 340px;
}

.search-item {
  width: 70px;
  height: 70px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: #1e293b;
  color: white;
  font-size: 28px;
  cursor: pointer;
  transition: all 0.16s ease;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);
}

.search-item:hover:not(:disabled) {
  transform: translateY(-1px);
  background: #273449;
}

.targetClicked {
  border-color: #60a5fa;
  background: #1d4ed8;
  box-shadow: 0 0 20px rgba(96, 165, 250, 0.35);
}

.controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.controls-centered {
  justify-content: center;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.results {
  border-top: 1px solid #eee;
  padding-top: 12px;
  margin-top: 12px;
}

.pre {
  white-space: pre-wrap;
  font-size: 12px;
  background: #fafafa;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid #eee;
}

.btn {
  padding: 12px 18px;
  border-radius: 14px;
  border: none;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.18s ease;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.15);
  color: white;
}

.btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.05);
}

.btn:active {
  transform: scale(0.96);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.btn-start {
  background: linear-gradient(135deg, #22c55e, #16a34a);
}

.btn-stop {
  background: linear-gradient(135deg, #ef4444, #dc2626);
}

.btn-reset {
  background: linear-gradient(135deg, #64748b, #475569);
}

.game-shell:fullscreen {
  max-width: none;
  width: 100vw;
  height: 100vh;
  border-radius: 0;
  margin: 0;
  background: #020617;
}

.game-shell:fullscreen .game-shell-body {
  height: calc(100vh - 73px);
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 12px;
  padding: 20px 20px 24px;
  overflow: hidden;
  box-sizing: border-box;
  align-items: stretch;
}

.game-shell:fullscreen .shell-top-status {
  margin: 0;
}

.game-shell:fullscreen .progress {
  width: 100%;
  max-width: 1100px;
  justify-self: center;
  margin: 0;
  flex-shrink: 0;
}

.game-shell:fullscreen .game-main {
  width: 100%;
  max-width: 1100px;
  min-height: 0;
  overflow: auto;
  justify-self: center;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;

  padding: 6px 0;
  box-sizing: border-box;
}

.game-shell:fullscreen .controls {
  width: 100%;
  max-width: 1100px;
  justify-self: center;
  justify-content: center;
  flex-shrink: 0;
  margin: 0;
  padding-top: 8px;
}

.game-shell:fullscreen .game-shell-title {
  font-size: 26px;
}

.game-shell:fullscreen .controls button,
.game-shell:fullscreen .fullscreen-btn {
  font-size: 16px;
  padding: 12px 18px;
}


.module-description {
  margin: 10px 0 14px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #334155;
  line-height: 1.6;
}
</style>