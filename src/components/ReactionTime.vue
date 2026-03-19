<template>
  <div class="module">
    <h2>Reaction Time Grid</h2>

    <div class="panel">
      <div><b>Kategória:</b> Vnímanie</div>
      <div><b>Status:</b> {{ phase }}</div>
      <div><b>Trial:</b> {{ trialIndex }} / {{ totalTrials }}</div>
      <div><b>Rule:</b> Click the highlighted cell as quickly as possible.</div>
    </div>

    <div class="grid">
      <button
        v-for="cell in cells"
        :key="cell"
        class="cell"
        :class="{ active: activeCell === cell }"
        :disabled="phase !== 'running' || activeCell === null"
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

    <div v-if="phase === 'finished'" class="results">
      <h3>Results</h3>
      <ul>
        <li>Hits: {{ summary.hits }}</li>
        <li>Misses: {{ summary.misses }}</li>
        <li>Accuracy: {{ summary.accuracy.toFixed(1) }}%</li>
        <li>Avg RT: {{ summary.avgRTms === null ? "—" : summary.avgRTms.toFixed(0) + " ms" }}</li>
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

const totalTrials = ref(20);
const stimulusDurationMs = ref(1500);
const isiMs = ref(700);

const cells = [1, 2, 3, 4, 5, 6, 7, 8, 9];
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
  const index = Math.floor(Math.random() * cells.length);
  return cells[index];
}

function finalizeTrial() {
  if (activeCell.value === null || shownAtMs.value === null) return;

  const rtMs =
    clicked.value && clickedAtMs.value !== null
      ? Math.max(0, clickedAtMs.value - shownAtMs.value)
      : null;

  addResponse({
    trial: trialIndex.value,
    activeCell: activeCell.value,
    clicked: clicked.value,
    correct: clicked.value,
    rtMs
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
    }, isiMs.value);
  }, stimulusDurationMs.value);
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
      : null
  };
});

const payload = computed(() =>
  buildPayload(summary.value, {
    settings: {
      totalTrials: totalTrials.value,
      stimulusDurationMs: stimulusDurationMs.value,
      isiMs: isiMs.value,
      gridSize: "3x3"
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
  grid-template-columns: repeat(3, 90px);
  gap: 10px;
  justify-content: center;
  margin: 16px 0;
}

.cell {
  width: 90px;
  height: 90px;
  border-radius: 12px;
  border: 1px solid #ccc;
  background: white;
  font-size: 18px;
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