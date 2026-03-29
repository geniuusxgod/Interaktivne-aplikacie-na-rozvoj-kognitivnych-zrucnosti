<template>
  <div class="module">
    <h2>Visual Search</h2>

    <div class="panel">
      <div><b>Kategória:</b> Vnímanie</div>
      <div><b>Status:</b> {{ phase }}</div>
      <div><b>Obtiažnosť:</b> {{ difficultyLabel }}</div>
      <div><b>Success streak:</b> {{ successStreak }}</div>
      <div><b>Trial:</b> {{ trialIndex }} / {{ totalTrials }}</div>
      <div><b>Grid:</b> {{ levelConfig.gridColumns }} x {{ levelConfig.gridRows }}</div>
      <div><b>Items:</b> {{ itemCount }}</div>
      <div><b>Stimulus duration:</b> {{ levelConfig.stimulusDurationMs }} ms</div>
      <div><b>ISI:</b> {{ levelConfig.isiMs }} ms</div>
      <div><b>Target mode:</b> {{ levelConfig.targetMode }}</div>
      <div><b>Rule:</b> Find and click the different symbol as quickly as possible.</div>
    </div>

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

    <div class="controls">
      <button :disabled="phase === 'running'" @click="start">Start</button>
      <button :disabled="phase !== 'running'" @click="stop">Stop</button>
      <button :disabled="phase !== 'finished'" @click="reset">Reset</button>
    </div>

    <div class="hint">
      Higher levels increase grid density and reduce display time.
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

const MODULE_ID = "perception_visual_search";
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
  fastThresholdMs: 750,
  slowThresholdMs: 2600,
  targetAccuracyMin: 0.76,
  targetAccuracyMax: 0.92,
  windowSize: 6,
  evaluateEvery: 3,
  scoreIncreaseThreshold: 80,
  scoreDecreaseThreshold: 50,
  maxPendingPenalty: 2
});

const totalTrials = ref(18);

const difficultySettings = [
  { gridColumns: 3, gridRows: 3, stimulusDurationMs: 3200, isiMs: 600, targetMode: "shape" },
  { gridColumns: 4, gridRows: 3, stimulusDurationMs: 2900, isiMs: 580, targetMode: "shape" },
  { gridColumns: 4, gridRows: 4, stimulusDurationMs: 2600, isiMs: 560, targetMode: "shape" },
  { gridColumns: 5, gridRows: 4, stimulusDurationMs: 2350, isiMs: 520, targetMode: "shape" },
  { gridColumns: 5, gridRows: 5, stimulusDurationMs: 2100, isiMs: 500, targetMode: "shape" },
  { gridColumns: 5, gridRows: 5, stimulusDurationMs: 1850, isiMs: 470, targetMode: "orientation" },
  { gridColumns: 6, gridRows: 5, stimulusDurationMs: 1650, isiMs: 440, targetMode: "orientation" },
  { gridColumns: 6, gridRows: 6, stimulusDurationMs: 1450, isiMs: 410, targetMode: "orientation" },
  { gridColumns: 7, gridRows: 6, stimulusDurationMs: 1300, isiMs: 380, targetMode: "orientation" },
  { gridColumns: 7, gridRows: 7, stimulusDurationMs: 1150, isiMs: 340, targetMode: "orientation" }
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

function nowMs() {
  return performance.now();
}

function reset() {
  clearAllTimeouts();
  resetSession();
  resetDifficulty();

  currentItems.value = [];
  targetId.value = null;
  shownAtMs.value = null;
  clicked.value = false;
  clickedAtMs.value = null;
  clickedCorrect.value = false;
  clickedItemId.value = null;
}

function stop() {
  clearAllTimeouts();
  currentItems.value = [];
  targetId.value = null;
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

onBeforeUnmount(() => {
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
      itemCount: itemCount.value,
      gridSize: `${levelConfig.value.gridColumns}x${levelConfig.value.gridRows}`,
      targetMode: levelConfig.value.targetMode,
      adaptive: true
    }
  })
);
</script>

<style scoped>
.module {
  max-width: 820px;
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

.search-area {
  display: grid;
  gap: 10px;
  justify-content: center;
  margin: 16px 0;
  min-height: 340px;
}

.search-item {
  width: 70px;
  height: 70px;
  border-radius: 12px;
  border: 1px solid #ccc;
  background: white;
  font-size: 28px;
  cursor: pointer;
}

.targetClicked {
  border-color: #60a5fa;
  background: #dbeafe;
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