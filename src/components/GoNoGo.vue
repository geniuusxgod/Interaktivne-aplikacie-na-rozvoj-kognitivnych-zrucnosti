<template>
  <div class="gonogo">
    <h2>Go / No-Go Task</h2>

    <div class="panel">
      <div><b>Kategória:</b> Pozornosť</div>
      <div><b>Status:</b> {{ phase }}</div>
      <div><b>Trial:</b> {{ trialIndex }} / {{ totalTrials }}</div>
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
import { ref, computed, onMounted, onBeforeUnmount } from "vue";

const MODULE_ID = "attention_go_no_go";
const CATEGORY = "pozornost";

const phase = ref("idle");
const trialIndex = ref(0);
const totalTrials = ref(30);

const stimulusDurationMs = ref(1200);
const isiMs = ref(500);

const currentStimulus = ref(null);
const currentShownAtMs = ref(null);
const currentAnswered = ref(false);
const currentPressedAtMs = ref(null);

const responses = ref([]);

let trialTimer = null;
let isiTimer = null;

function nowMs() {
  return performance.now();
}

function clearTimers() {
  if (trialTimer !== null) {
    clearTimeout(trialTimer);
    trialTimer = null;
  }
  if (isiTimer !== null) {
    clearTimeout(isiTimer);
    isiTimer = null;
  }
}

function reset() {
  clearTimers();
  phase.value = "idle";
  trialIndex.value = 0;
  currentStimulus.value = null;
  currentShownAtMs.value = null;
  currentAnswered.value = false;
  currentPressedAtMs.value = null;
  responses.value = [];
}

function stop() {
  clearTimers();
  phase.value = "finished";
  currentStimulus.value = null;
}

function start() {
  reset();
  phase.value = "running";
  nextTrial();
}

function generateStimulus() {
  const isGo = Math.random() < 0.7;

  if (isGo) {
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

  const correct =
    (isGo && userPressed) ||
    (!isGo && !userPressed);

  responses.value.push({
    trial: trialIndex.value,
    stimulusType: currentStimulus.value.type,
    shape: currentStimulus.value.shape,
    color: currentStimulus.value.kind,
    userPressed,
    correct,
    rtMs
  });
}

function nextTrial() {
  if (phase.value !== "running") return;

  if (trialIndex.value >= totalTrials.value) {
    phase.value = "finished";
    currentStimulus.value = null;
    clearTimers();
    return;
  }

  trialIndex.value += 1;
  currentStimulus.value = generateStimulus();
  currentShownAtMs.value = nowMs();
  currentAnswered.value = false;
  currentPressedAtMs.value = null;

  trialTimer = setTimeout(() => {
    finalizeTrial();
    currentStimulus.value = null;

    isiTimer = setTimeout(() => {
      nextTrial();
    }, isiMs.value);
  }, stimulusDurationMs.value);
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
  clearTimers();
});

const summary = computed(() => {
  let hits = 0;
  let misses = 0;
  let falseAlarms = 0;
  let correctInhibitions = 0;
  const rts = [];

  for (const r of responses.value) {
    if (r.stimulusType === "go" && r.userPressed) hits++;
    else if (r.stimulusType === "go" && !r.userPressed) misses++;
    else if (r.stimulusType === "no-go" && r.userPressed) falseAlarms++;
    else if (r.stimulusType === "no-go" && !r.userPressed) correctInhibitions++;

    if (r.rtMs !== null) rts.push(r.rtMs);
  }

  return {
    hits,
    misses,
    falseAlarms,
    correctInhibitions,
    accuracy: responses.value.length
      ? ((hits + correctInhibitions) / responses.value.length) * 100
      : 0,
    avgRTms: rts.length ? rts.reduce((a, b) => a + b, 0) / rts.length : null
  };
});

const payload = computed(() => ({
  module: MODULE_ID,
  category: CATEGORY,
  version: "1.0",
  total_trials: responses.value.length,
  settings: {
    stimulusDurationMs: stimulusDurationMs.value,
    isiMs: isiMs.value
  },
  summary: summary.value,
  responses: responses.value,
  timestamp_iso: new Date().toISOString()
}));
</script>

<style scoped>
.gonogo { max-width: 760px; margin: 0 auto; padding: 16px; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; }
.panel { border: 1px solid #ddd; border-radius: 12px; padding: 12px; margin-bottom: 12px; }
.stimulusBox { border: 1px solid #ddd; border-radius: 12px; min-height: 180px; display: flex; align-items: center; justify-content: center; margin-bottom: 12px; }
.shape { width: 100px; height: 100px; }
.circle { border-radius: 50%; }
.square { border-radius: 12px; }
.green { background: #22c55e; }
.red { background: #ef4444; }
.placeholder { font-size: 40px; color: #999; }
.controls { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
button { padding: 8px 12px; border-radius: 10px; border: 1px solid #ccc; background: white; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.hint { opacity: 0.8; margin-bottom: 12px; }
.results { border-top: 1px solid #eee; padding-top: 12px; margin-top: 12px; }
.pre { white-space: pre-wrap; font-size: 12px; background: #fafafa; padding: 12px; border-radius: 12px; border: 1px solid #eee; }
</style>