<template>
  <div class="module">
    <h2>Reaction Time Grid</h2>

    <div class="panel">
      <div><b>Kategória:</b> Vnímanie</div>
      <div><b>Status:</b> {{ phase }}</div>
      <div><b>Obtiažnosť:</b> {{ difficultyLabel }}</div>
      <div><b>Success streak:</b> {{ successStreak }}</div>
      <div><b>Trial:</b> {{ trialIndex }} / {{ totalTrials }}</div>
      <div><b>Grid:</b> {{ gridSize }} x {{ gridSize }}</div>
      <div><b>Stimulus duration:</b> {{ levelConfig.stimulusDurationMs }} ms</div>
      <div><b>ISI:</b> {{ levelConfig.isiMs }} ms</div>
      <div><b>Rule:</b> Click the highlighted cell as quickly as possible.</div>
    </div>

    <div
      class="grid"
      :style="{ gridTemplateColumns: `repeat(${gridSize}, 70px)` }"
    >
      <button
        v-for="cell in cells"
        :key="cell"
        class="cell"
        :class="{ active: activeCell === cell }"
        :disabled="phase !== 'running' || activeCell === null || clicked"
        @click="handleCellClick(cell)"
      >
        {{ cell }}
      </button>
    </div>

    <div class="controls">
      <button :disabled="phase === 'running'" @click="start">Start</button>
      <button :disabled="phase !== 'running'" @click="stop">Stop</button>
      <button :disabled="phase !== 'finished'" @click="reset">Reset</button>
    </div>

    <div class="hint">
      Difficulty rises through faster presentation and larger grids.
    </div>

    <div v-if="phase === 'finished'" class="results">
      <h3>Results</h3>
      <ul>
        <li>Hits: {{ summary.hits }}</li>
        <li>Misses: {{ summary.misses }}</li>
        <li>Accuracy: {{ summary.accuracy.toFixed(1) }}%</li>
        <li>Avg RT: {{ summary.avgRTms === null ? "—" : summary.avgRTms.toFixed(0) + " ms" }}</li>
        <li>Final difficulty: {{ summary.finalDifficulty }}</li>
      </ul>

      <details>
        <summary>Payload</summary>
        <pre class="pre">{{ payload }}</pre>
      </details>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from "vue";
import { useGameSession } from "../composables/useGameSession";
import { useTimeout } from "../composables/useTimeout";
import { useAdaptiveDifficulty } from "../composables/useAdaptiveDifficulty";

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
  updateDifficulty
} = useAdaptiveDifficulty({
  minDifficulty: 1,
  maxDifficulty: 10,
  startDifficulty: 2,
  fastThresholdMs: 320,
  slowThresholdMs: 1000,
  targetAccuracyMin: 0.82,
  targetAccuracyMax: 0.96,
  windowSize: 8,
  evaluateEvery: 4,
  scoreIncreaseThreshold: 84,
  scoreDecreaseThreshold: 52,
  maxPendingPenalty: 2
});

const totalTrials = ref(22);

const difficultySettings = [
  { gridSize: 3, stimulusDurationMs: 2200, isiMs: 700 },
  { gridSize: 3, stimulusDurationMs: 1900, isiMs: 650 },
  { gridSize: 4, stimulusDurationMs: 1700, isiMs: 620 },
  { gridSize: 4, stimulusDurationMs: 1500, isiMs: 580 },
  { gridSize: 4, stimulusDurationMs: 1300, isiMs: 540 },
  { gridSize: 5, stimulusDurationMs: 1150, isiMs: 500 },
  { gridSize: 5, stimulusDurationMs: 1000, isiMs: 460 },
  { gridSize: 5, stimulusDurationMs: 900, isiMs: 420 },
  { gridSize: 6, stimulusDurationMs: 800, isiMs: 380 },
  { gridSize: 6, stimulusDurationMs: 700, isiMs: 340 }
];

const levelConfig = computed(() => {
  const index = Math.max(0, Math.min(difficultySettings.length - 1, difficulty.value - 1));
  return difficultySettings[index];
});

const gridSize = computed(() => levelConfig.value.gridSize);

const cells = computed(() => {
  const total = gridSize.value * gridSize.value;
  return Array.from({ length: total }, (_, i) => i + 1);
});

const activeCell = ref(null);

const shownAtMs = ref(null);
const clicked = ref(false);
const clickedAtMs = ref(null);

function nowMs() {
  return performance.now();
}

function reset() {
  clearAllTimeouts();
  resetSession();
  resetDifficulty();

  activeCell.value = null;
  shownAtMs.value = null;
  clicked.value = false;
  clickedAtMs.value = null;
}

function stop() {
  clearAllTimeouts();
  activeCell.value = null;
  stopSession();
}

function start() {
  reset();
  startSession();
  nextReactionTrial();
}

function randomCell() {
  const index = Math.floor(Math.random() * cells.value.length);
  return cells.value[index];
}

function finalizeTrial() {
  if (activeCell.value === null || shownAtMs.value === null) return;

  const rtMs =
    clicked.value && clickedAtMs.value !== null
      ? Math.max(0, clickedAtMs.value - shownAtMs.value)
      : null;

  const correct = clicked.value;
  const lapse = !clicked.value;

  addResponse({
    trial: trialIndex.value,
    activeCell: activeCell.value,
    clicked: clicked.value,
    correct,
    lapse,
    difficulty: difficulty.value,
    gridSize: gridSize.value,
    stimulusDurationMs: levelConfig.value.stimulusDurationMs,
    isiMs: levelConfig.value.isiMs,
    rtMs
  });

  updateDifficulty({
    correct,
    rtMs,
    lapse,
    penalty: lapse ? 0.16 : 0
  });
}

function nextReactionTrial() {
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

  setManagedTimeout(() => {
    finalizeTrial();
    activeCell.value = null;

    setManagedTimeout(() => {
      nextReactionTrial();
    }, levelConfig.value.isiMs);
  }, levelConfig.value.stimulusDurationMs);
}

function handleCellClick(cell) {
  if (phase.value !== "running") return;
  if (activeCell.value === null) return;
  if (clicked.value) return;

  if (cell === activeCell.value) {
    clicked.value = true;
    clickedAtMs.value = nowMs();
  }
}

onBeforeUnmount(() => {
  clearAllTimeouts();
});

const summary = computed(() => {
  const hits = responses.value.filter(r => r.clicked).length;
  const misses = responses.value.filter(r => !r.clicked).length;

  const rts = responses.value
    .map(r => r.rtMs)
    .filter(v => v !== null);

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
    settings: {
      totalTrials: totalTrials.value,
      stimulusDurationMs: levelConfig.value.stimulusDurationMs,
      isiMs: levelConfig.value.isiMs,
      gridSize: `${gridSize.value}x${gridSize.value}`,
      adaptive: true
    }
  })
);
</script>

<style scoped>
.module {
  max-width: 760px;
  margin: 0 auto;
  padding: 16px;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial;
}

.panel {
  border: 1px solid #ddd;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 12px;
}

.grid {
  display: grid;
  gap: 10px;
  justify-content: center;
  margin: 16px 0;
}

.cell {
  width: 70px;
  height: 70px;
  border-radius: 12px;
  border: 1px solid #ccc;
  background: white;
  font-size: 16px;
  cursor: pointer;
}

.cell.active {
  background: #dbeafe;
  border-color: #60a5fa;
  font-weight: 700;
}

.controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

button {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid #ccc;
  background: white;
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hint {
  margin-bottom: 12px;
  color: #555;
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
</style>