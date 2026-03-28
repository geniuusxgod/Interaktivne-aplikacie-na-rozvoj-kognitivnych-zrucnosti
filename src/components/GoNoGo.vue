<template>
  <div class="module">
    <h2>Go / No-Go Task</h2>

    <div class="panel">
      <div><b>Kategória:</b> Pozornosť</div>
      <div><b>Status:</b> {{ phase }}</div>
      <div><b>Obtiažnosť:</b> {{ difficultyLabel }}</div>
      <div><b>Success streak:</b> {{ successStreak }}</div>
      <div><b>Trial:</b> {{ trialIndex }} / {{ totalTrials }}</div>
      <div><b>Stimulus duration:</b> {{ levelConfig.stimulusDurationMs }} ms</div>
      <div><b>ISI:</b> {{ levelConfig.isiMs }} ms</div>
      <div><b>NO-GO ratio:</b> {{ (levelConfig.noGoProbability * 100).toFixed(0) }}%</div>
      <div><b>Rule:</b> Press only for <u>GO</u> stimulus (green circle). Do not press for <u>NO-GO</u> stimulus (red square).</div>
    </div>

    <div class="stimulusBox">
      <div
        v-if="currentStimulus"
        class="shape"
        :class="[currentStimulus.kind, currentStimulus.shape]"
      ></div>
      <div v-else class="placeholder">—</div>
    </div>

    <div class="controls">
      <button :disabled="phase === 'running'" @click="start">Start</button>
      <button :disabled="phase !== 'running'" @click="stop">Stop</button>
      <button :disabled="phase !== 'running'" @click="submitPress">Press</button>
      <button :disabled="phase !== 'finished'" @click="reset">Reset</button>
    </div>

    <div class="hint">You can also press <b>Space</b> for GO trials.</div>

    <div v-if="phase === 'finished'" class="results">
      <h3>Results</h3>
      <ul>
        <li>Accuracy: {{ summary.accuracy.toFixed(1) }}%</li>
        <li>Hits (GO + press): {{ summary.hits }}</li>
        <li>Misses (GO + no press): {{ summary.misses }}</li>
        <li>False alarms (NO-GO + press): {{ summary.falseAlarms }}</li>
        <li>Correct inhibitions: {{ summary.correctInhibitions }}</li>
        <li>GO accuracy: {{ summary.goAccuracy.toFixed(1) }}%</li>
        <li>NO-GO accuracy: {{ summary.noGoAccuracy.toFixed(1) }}%</li>
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
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { useGameSession } from "../composables/useGameSession";
import { useTimeout } from "../composables/useTimeout";
import { useAdaptiveDifficulty } from "../composables/useAdaptiveDifficulty";

const MODULE_ID = "attention_go_no_go";
const CATEGORY = "pozornost";

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
  fastThresholdMs: 420,
  slowThresholdMs: 1100,
  targetAccuracyMin: 0.78,
  targetAccuracyMax: 0.93,
  windowSize: 8,
  evaluateEvery: 4,
  scoreIncreaseThreshold: 82,
  scoreDecreaseThreshold: 50,
  maxPendingPenalty: 2
});

const totalTrials = ref(36);

const difficultySettings = [
  { stimulusDurationMs: 1800, isiMs: 650, noGoProbability: 0.18 },
  { stimulusDurationMs: 1600, isiMs: 620, noGoProbability: 0.20 },
  { stimulusDurationMs: 1450, isiMs: 580, noGoProbability: 0.24 },
  { stimulusDurationMs: 1300, isiMs: 540, noGoProbability: 0.28 },
  { stimulusDurationMs: 1150, isiMs: 500, noGoProbability: 0.32 },
  { stimulusDurationMs: 1000, isiMs: 460, noGoProbability: 0.36 },
  { stimulusDurationMs: 850, isiMs: 420, noGoProbability: 0.40 },
  { stimulusDurationMs: 725, isiMs: 380, noGoProbability: 0.44 },
  { stimulusDurationMs: 625, isiMs: 340, noGoProbability: 0.48 },
  { stimulusDurationMs: 525, isiMs: 300, noGoProbability: 0.52 }
];

const levelConfig = computed(() => {
  const index = Math.max(0, Math.min(difficultySettings.length - 1, difficulty.value - 1));
  return difficultySettings[index];
});

const currentStimulus = ref(null);
const currentShownAtMs = ref(null);
const currentAnswered = ref(false);
const currentPressedAtMs = ref(null);

function nowMs() {
  return performance.now();
}

function reset() {
  clearAllTimeouts();
  resetSession();
  resetDifficulty();

  currentStimulus.value = null;
  currentShownAtMs.value = null;
  currentAnswered.value = false;
  currentPressedAtMs.value = null;
}

function stop() {
  clearAllTimeouts();
  currentStimulus.value = null;
  stopSession();
}

function start() {
  reset();
  startSession();
  nextGoNoGoTrial();
}

function generateStimulus() {
  const isNoGo = Math.random() < levelConfig.value.noGoProbability;

  if (!isNoGo) {
    return {
      type: "go",
      shape: "circle",
      kind: "green"
    };
  }

  return {
    type: "no-go",
    shape: "square",
    kind: "red"
  };
}

function finalizeTrial() {
  if (!currentStimulus.value || currentShownAtMs.value === null) return;

  const isGo = currentStimulus.value.type === "go";
  const userPressed = currentAnswered.value;
  const rtMs = userPressed && currentPressedAtMs.value !== null
    ? Math.max(0, currentPressedAtMs.value - currentShownAtMs.value)
    : null;

  const correct = (isGo && userPressed) || (!isGo && !userPressed);
  const falseAlarm = !isGo && userPressed;
  const lapse = isGo && !userPressed;

  addResponse({
    trial: trialIndex.value,
    stimulusType: currentStimulus.value.type,
    shape: currentStimulus.value.shape,
    color: currentStimulus.value.kind,
    userPressed,
    correct,
    falseAlarm,
    lapse,
    difficulty: difficulty.value,
    stimulusDurationMs: levelConfig.value.stimulusDurationMs,
    isiMs: levelConfig.value.isiMs,
    noGoProbability: levelConfig.value.noGoProbability,
    rtMs
  });

  updateDifficulty({
    correct,
    rtMs: isGo ? rtMs : null,
    falseAlarm,
    lapse,
    penalty: falseAlarm ? 0.28 : lapse ? 0.16 : 0
  });
}

function nextGoNoGoTrial() {
  if (phase.value !== "running") return;

  if (trialIndex.value >= totalTrials.value) {
    currentStimulus.value = null;
    stopSession();
    return;
  }

  nextTrial();
  currentStimulus.value = generateStimulus();
  currentShownAtMs.value = nowMs();
  currentAnswered.value = false;
  currentPressedAtMs.value = null;

  setManagedTimeout(() => {
    finalizeTrial();
    currentStimulus.value = null;

    setManagedTimeout(() => {
      nextGoNoGoTrial();
    }, levelConfig.value.isiMs);
  }, levelConfig.value.stimulusDurationMs);
}

function submitPress() {
  if (phase.value !== "running") return;
  if (!currentStimulus.value) return;
  if (currentAnswered.value) return;

  currentAnswered.value = true;
  currentPressedAtMs.value = nowMs();
}

function onKeydown(e) {
  if (e.code === "Space") {
    e.preventDefault();
    submitPress();
  }
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  clearAllTimeouts();
});

const summary = computed(() => {
  let hits = 0;
  let misses = 0;
  let falseAlarms = 0;
  let correctInhibitions = 0;
  let goTrials = 0;
  let noGoTrials = 0;
  const rts = [];

  for (const r of responses.value) {
    if (r.stimulusType === "go") goTrials += 1;
    if (r.stimulusType === "no-go") noGoTrials += 1;

    if (r.stimulusType === "go" && r.userPressed) hits++;
    else if (r.stimulusType === "go" && !r.userPressed) misses++;
    else if (r.stimulusType === "no-go" && r.userPressed) falseAlarms++;
    else if (r.stimulusType === "no-go" && !r.userPressed) correctInhibitions++;

    if (r.stimulusType === "go" && r.rtMs !== null) {
      rts.push(r.rtMs);
    }
  }

  return {
    hits,
    misses,
    falseAlarms,
    correctInhibitions,
    accuracy: responses.value.length
      ? ((hits + correctInhibitions) / responses.value.length) * 100
      : 0,
    goAccuracy: goTrials ? (hits / goTrials) * 100 : 0,
    noGoAccuracy: noGoTrials ? (correctInhibitions / noGoTrials) * 100 : 0,
    avgRTms: rts.length ? rts.reduce((a, b) => a + b, 0) / rts.length : null,
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
      noGoProbability: levelConfig.value.noGoProbability,
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

.stimulusBox {
  height: 260px;
  border: 1px dashed #ccc;
  border-radius: 12px;
  display: grid;
  place-items: center;
  margin: 16px 0;
  background: #fafafa;
}

.placeholder {
  font-size: 48px;
  color: #999;
}

.shape {
  width: 120px;
  height: 120px;
}

.circle {
  border-radius: 999px;
}

.square {
  border-radius: 18px;
}

.green {
  background: #28a745;
}

.red {
  background: #dc3545;
}

.controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

button {
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid #ccc;
  cursor: pointer;
  background: white;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.hint {
  margin-top: 10px;
  color: #555;
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
</style>