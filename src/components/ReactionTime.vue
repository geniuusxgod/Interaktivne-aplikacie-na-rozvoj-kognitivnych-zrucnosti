<template>
  <div class="module">
    <h2>Reaction Time Grid</h2>

    <div class="topbar">
      <div><b>Kategória:</b> Vnímanie</div>
      <div><b>Status:</b> {{ phase }}</div>
      <div><b>Obtiažnosť:</b> {{ difficultyLabel }}</div>
      <div><b>Trial:</b> {{ trialIndex }} / {{ totalTrials }}</div>
    </div>

    <div class="scorebar">
      <div><b>Score:</b> {{ score }}</div>
      <div><b>Best score:</b> {{ bestScore }}</div>
      <div><b>Last delta:</b> {{ lastDelta >= 0 ? `+${lastDelta}` : lastDelta }}</div>
    </div>

    <div class="panel">
      <div><b>Rule:</b> Click the highlighted cell as quickly as possible.</div>

      <template v-if="showDebug">
        <div><b>Success streak:</b> {{ successStreak }}</div>
        <div><b>Grid:</b> {{ gridSize }} x {{ gridSize }}</div>
        <div><b>Stimulus duration:</b> {{ levelConfig.stimulusDurationMs }} ms</div>
        <div><b>ISI:</b> {{ levelConfig.isiMs }} ms</div>
      </template>
    </div>

    <div class="game-shell" ref="gameShellRef">
      <div class="game-shell-header">
        <div class="game-shell-title-wrap">
          <div class="game-shell-title">Reaction Time Grid</div>
          <div class="game-shell-subtitle">
            {{
              activeCell !== null
                ? "Tap the highlighted cell!"
                : phase === "running"
                  ? "Wait for the next stimulus"
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

        <div
          class="grid"
          :style="{ gridTemplateColumns: `repeat(${gridSize}, minmax(56px, 70px))` }"
        >
          <button v-for="cell in cells" :key="cell" class="cell" :class="{ active: activeCell === cell}"
            :disabled="phase !== 'running' || activeCell === null || clicked"
            @click="handleCellClick(cell)"
          >
            {{ cell }}
          </button>
        </div>

        <div class="controls controls-centered">
          <button class="btn btn-start" :disabled="phase === 'running'" @click="start">Start</button>
          <button class="btn btn-stop" :disabled="phase !== 'running'" @click="stop">Stop</button>
          <button class="btn btn-reset" :disabled="phase !== 'finished'" @click="reset">Reset</button>
        </div>

        <div class="hint hint-centered">
          Click the highlighted cell as fast as possible.
        </div>
      </div>
    </div>

    <div v-if="phase === 'finished'" class="results">
      <h3>Results</h3>
      <ul>
        <li>Hits: {{ summary.hits }}</li>
        <li>Misses: {{ summary.misses }}</li>
        <li>Accuracy: {{ summary.accuracy.toFixed(1) }}%</li>
        <li>Avg RT: {{ summary.avgRTms === null ? "—" : summary.avgRTms.toFixed(0) + " ms" }}</li>
        <li>Final difficulty: {{ summary.finalDifficulty }}</li>
        <li>Final score: {{ score }}</li>
        <li>Best score: {{ bestScore }}</li>
      </ul>

      <details>
        <summary>Payload</summary>
        <pre class="pre">{{ payload }}</pre>
      </details>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { useGameSession } from "../composables/useGameSession";
import { useTimeout } from "../composables/useTimeout";
import { useAdaptiveDifficulty } from "../composables/useAdaptiveDifficulty";
import { useGameScoring } from "../composables/useGameScoring";

const MODULE_ID = "perception_reaction_time";
const CATEGORY = "vnimanie";

const {
  phase,
  trialIndex,
  responses,
  startSession,
  stopSession,
  resetSession,
  nextTrial,
  addResponse,
  buildPayload
} = useGameSession(MODULE_ID, CATEGORY);

const { setManagedTimeout, clearAllTimeouts } = useTimeout();

const {
  difficulty,
  difficultyLabel,
  successStreak,
  resetDifficulty,
  updateDifficulty,
  showDebug
} = useAdaptiveDifficulty({
  minDifficulty: 1,
  maxDifficulty: 10,
  startDifficulty: 3,
  fastThresholdMs: 280,
  slowThresholdMs: 900,
  targetAccuracyMin: 0.78,
  targetAccuracyMax: 0.92,
  windowSize: 4,
  evaluateEvery: 2,
  scoreIncreaseThreshold: 74,
  scoreDecreaseThreshold: 44
});

const { score, bestScore, lastDelta, awardScore, resetScore } = useGameScoring(MODULE_ID, {
  fastThresholdMs: 280,
  slowThresholdMs: 900
});

const totalTrials = ref(22);

const difficultySettings = [
  { gridSize: 4, stimulusDurationMs: 1500, isiMs: 500 },
  { gridSize: 4, stimulusDurationMs: 1300, isiMs: 460 },
  { gridSize: 5, stimulusDurationMs: 1100, isiMs: 420 },
  { gridSize: 5, stimulusDurationMs: 950, isiMs: 380 },
  { gridSize: 6, stimulusDurationMs: 820, isiMs: 340 },
  { gridSize: 6, stimulusDurationMs: 720, isiMs: 310 },
  { gridSize: 7, stimulusDurationMs: 650, isiMs: 280 },
  { gridSize: 7, stimulusDurationMs: 580, isiMs: 260 },
  { gridSize: 8, stimulusDurationMs: 520, isiMs: 240 },
  { gridSize: 8, stimulusDurationMs: 480, isiMs: 220 }
];

const levelConfig = computed(() => difficultySettings[difficulty.value - 1]);
const gridSize = computed(() => levelConfig.value.gridSize);

const cells = computed(() =>
  Array.from({ length: gridSize.value * gridSize.value }, (_, i) => i + 1)
);

const activeCell = ref(null);
const shownAtMs = ref(null);
const clicked = ref(false);
const clickedAtMs = ref(null);
const clickedCell = ref(null);

const combo = ref(0);
const comboMultiplier = computed(() => 1 + combo.value * 0.1);
const floatingScore = ref(null);

const gameShellRef = ref(null);
const isFullscreen = ref(false);

function nowMs() {
  return performance.now();
}

function randomCell() {
  return cells.value[Math.floor(Math.random() * cells.value.length)];
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

function resetStateOnly() {
  activeCell.value = null;
  shownAtMs.value = null;
  clicked.value = false;
  clickedAtMs.value = null;
  clickedCell.value = null;
  floatingScore.value = null;
  combo.value = 0;
}

function reset() {
  clearAllTimeouts();
  resetSession();
  resetDifficulty();
  resetScore();
  resetStateOnly();
}

function stop() {
  clearAllTimeouts();
  activeCell.value = null;
  stopSession();
}

function start() {
  reset();
  startSession();
  nextTrialFn();
}

function finalizeTrial() {
  const wasClicked = clicked.value;
  const correct = wasClicked && clickedCell.value === activeCell.value;
  const rtMs = correct && shownAtMs.value !== null && clickedAtMs.value !== null
    ? clickedAtMs.value - shownAtMs.value
    : null;

  addResponse({
    trial: trialIndex.value,
    targetCell: activeCell.value,
    clickedCell: clickedCell.value,
    clicked: wasClicked,
    correct,
    rtMs,
    difficulty: difficulty.value,
    gridSize: gridSize.value,
    stimulusDurationMs: levelConfig.value.stimulusDurationMs
  });

  updateDifficulty({ correct, rtMs });
  awardScore({ correct, rtMs });

  updateCombo(correct);
  showFloatingScore(lastDelta.value);

  setManagedTimeout(() => {
    activeCell.value = null;

    setManagedTimeout(() => {
      nextTrialFn();
    }, levelConfig.value.isiMs);
  }, 220);
}

function nextTrialFn() {
  if (phase.value !== "running") return;

  if (trialIndex.value >= totalTrials.value) {
    activeCell.value = null;
    stopSession();
    return;
  }

  nextTrial();

  activeCell.value = randomCell();
  shownAtMs.value = nowMs();
  clicked.value = false;
  clickedAtMs.value = null;
  clickedCell.value = null;

  setManagedTimeout(() => {
    finalizeTrial();
  }, levelConfig.value.stimulusDurationMs);
}

function handleCellClick(cell) {
  if (phase.value !== "running") return;
  if (activeCell.value === null) return;
  if (clicked.value) return;

  clicked.value = true;
  clickedAtMs.value = nowMs();
  clickedCell.value = cell;
}

onMounted(() => {
  document.addEventListener("fullscreenchange", handleFullscreenChange);
});

onBeforeUnmount(() => {
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
  clearAllTimeouts();
});

const summary = computed(() => {
  const hits = responses.value.filter(r => r.correct).length;
  const misses = responses.value.filter(r => !r.correct).length;
  const rts = responses.value
    .filter(r => r.rtMs !== null)
    .map(r => r.rtMs);

  return {
    hits,
    misses,
    accuracy: responses.value.length
      ? (hits / responses.value.length) * 100
      : 0,
    avgRTms: rts.length
      ? rts.reduce((a, b) => a + b, 0) / rts.length
      : null,
    finalDifficulty: difficulty.value
  };
});

const payload = computed(() =>
  buildPayload(summary.value, {
    difficulty: difficulty.value,
    score: score.value,
    bestScore: bestScore.value,
    settings: {
      totalTrials: totalTrials.value,
      gridSize: gridSize.value,
      stimulusDurationMs: levelConfig.value.stimulusDurationMs,
      isiMs: levelConfig.value.isiMs,
      adaptive: true,
      localScore: true,
      fullscreen: true,
      combo: true,
      scorePopup: true
    }
  })
);
</script>

<style scoped>
.module {
  max-width: 980px;
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

.panel {
  border: 1px solid #ddd;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 12px;
  background: white;
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

.grid {
  display: grid;
  gap: 10px;
  justify-content: center;
  margin: 18px 0 20px;
  width: 100%;
}

.cell {
  width: 70px;
  height: 70px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: #1e293b;
  color: white;
  font-weight: 700;
  transition: all 0.16s ease;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);
}

.cell:hover:not(:disabled) {
  transform: translateY(-1px);
  background: #273449;
}

.cell.active {
  background: #3b82f6;
  box-shadow: 0 0 20px rgba(59, 130, 246, 0.6);
  border-color: rgba(147, 197, 253, 0.6);
}

.cell.correct {
  background: #22c55e;
  color: white;
  box-shadow: 0 0 20px rgba(34, 197, 94, 0.45);
}

.cell.wrong {
  background: #ef4444;
  color: white;
  box-shadow: 0 0 20px rgba(239, 68, 68, 0.45);
}

.controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.controls-centered {
  justify-content: center;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.hint {
  margin-top: 10px;
  color: #555;
}

.hint-centered {
  text-align: center;
  color: rgba(255, 255, 255, 0.75);
}

.results {
  margin-top: 18px;
  border-top: 1px solid #eee;
  padding-top: 12px;
}

.pre {
  background: #0b1020;
  color: #d8e1ff;
  padding: 12px;
  border-radius: 10px;
  overflow: auto;
}

.btn {
  padding: 12px 18px;
  border-radius: 14px;
  border: none;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.18s ease;
  box-shadow: 0 6px 18px rgba(0,0,0,0.15);
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
  color: white;
}

.btn-stop {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: white;
}

.btn-reset {
  background: linear-gradient(135deg, #64748b, #475569);
  color: white;
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
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: center;
  overflow-y: auto;
  padding: 24px 20px 28px;
  gap: 10px;
}

.game-shell:fullscreen .grid {
  flex: 1;
  align-content: center;
}

.game-shell:fullscreen .game-shell-title {
  font-size: 26px;
}

.game-shell:fullscreen .controls button,
.game-shell:fullscreen .fullscreen-btn {
  font-size: 16px;
  padding: 12px 18px;
}

.game-shell:fullscreen .floating-score {
  top: 110px;
  right: 34px;
  font-size: 20px;
  padding: 12px 16px;
}

.game-shell:fullscreen .combo-badge {
  font-size: 15px;
}

.game-shell:fullscreen .cell {
  width: 76px;
  height: 76px;
  font-size: 16px;
}
</style>