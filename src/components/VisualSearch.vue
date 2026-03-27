<template>
  <div class="module">
    <h2>Visual Search</h2>

    <div class="panel">
      <div><b>Kategória:</b> Vnímanie</div>
      <div><b>Status:</b> {{ phase }}</div>
      <div><b>Obtiažnosť:</b> {{ difficultyLabel }}</div>
      <div><b>Success streak:</b> {{ successStreak }}</div>
      <div><b>Trial:</b> {{ trialIndex }} / {{ totalTrials }}</div>
      <div><b>Grid:</b> {{ gridColumns }} x {{ gridRows }}</div>
      <div><b>Rule:</b> Find and click the different symbol as quickly as possible.</div>
    </div>

    <div
      class="search-area"
      :style="{ gridTemplateColumns: `repeat(${gridColumns}, 70px)` }"
    >
      <button
        v-for="item in currentItems"
        :key="item.id"
        class="search-item"
        :disabled="phase !== 'running' || currentItems.length === 0"
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
  maxDifficulty: 5,
  startDifficulty: 1,
  successThreshold: 2
});

const totalTrials = ref(16);
const isiMs = ref(500);

const gridColumns = computed(() => {
  if (difficulty.value === 1) return 3;
  if (difficulty.value === 2) return 4;
  if (difficulty.value === 3) return 4;
  if (difficulty.value === 4) return 5;
  return 5;
});

const gridRows = computed(() => {
  if (difficulty.value === 1) return 3;
  if (difficulty.value === 2) return 3;
  if (difficulty.value === 3) return 4;
  if (difficulty.value === 4) return 4;
  return 5;
});

const itemCount = computed(() => gridColumns.value * gridRows.value);

const stimulusDurationMs = computed(() => {
  if (difficulty.value === 1) return 2800;
  if (difficulty.value === 2) return 2400;
  if (difficulty.value === 3) return 2000;
  if (difficulty.value === 4) return 1700;
  return 1400;
});

const currentItems = ref([]);
const targetId = ref(null);

const shownAtMs = ref(null);
const clicked = ref(false);
const clickedAtMs = ref(null);
const clickedCorrect = ref(false);

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

function generateItems(count) {
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

function finalizeTrial() {
  if (shownAtMs.value === null) return;

  const rtMs =
    clicked.value && clickedAtMs.value !== null
      ? Math.max(0, clickedAtMs.value - shownAtMs.value)
      : null;

  const wasSuccessful = clickedCorrect.value;

  addResponse({
    trial: trialIndex.value,
    itemCount: itemCount.value,
    difficulty: difficulty.value,
    gridColumns: gridColumns.value,
    gridRows: gridRows.value,
    clicked: clicked.value,
    correct: clickedCorrect.value,
    rtMs
  });

  updateDifficulty(wasSuccessful);
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

  setManagedTimeout(() => {
    finalizeTrial();
    currentItems.value = [];
    targetId.value = null;

    setManagedTimeout(() => {
      nextVisualSearchTrial();
    }, isiMs.value);
  }, stimulusDurationMs.value);
}

function handleItemClick(item) {
  if (phase.value !== "running") return;
  if (currentItems.value.length === 0) return;
  if (clicked.value) return;

  clicked.value = true;
  clickedAtMs.value = nowMs();
  clickedCorrect.value = item.isTarget;
}

onBeforeUnmount(() => {
  clearAllTimeouts();
});

const summary = computed(() => {
  const hits = responses.value.filter(r => r.correct).length;
  const misses = responses.value.filter(r => !r.correct).length;

  const rts = responses.value
    .filter(r => r.correct && r.rtMs !== null)
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
    settings: {
      totalTrials: totalTrials.value,
      stimulusDurationMs: stimulusDurationMs.value,
      isiMs: isiMs.value,
      itemCount: itemCount.value,
      gridSize: `${gridColumns.value}x${gridRows.value}`,
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