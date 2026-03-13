<template>
  <div class="stroop">
    <h2>Stroop Task</h2>

    <div class="panel">
      <div><b>Kategória:</b> Pozornosť</div>
      <div><b>Status:</b> {{ phase }}</div>
      <div><b>Trial:</b> {{ trialIndex }} / {{ totalTrials }}</div>
      <div><b>Rule:</b> Select the <u>color of the text</u>, not the word.</div>
    </div>

    <div class="stimulusBox">
      <div
        class="stimulus"
        :style="{ color: currentStimulus ? currentStimulus.displayColor : '#111' }"
      >
        {{ currentStimulus ? currentStimulus.word : "—" }}
      </div>
    </div>

    <div class="controls">
      <button :disabled="phase === 'running'" @click="start">Start</button>
      <button :disabled="phase !== 'running'" @click="stop">Stop</button>
      <button :disabled="phase !== 'finished'" @click="reset">Reset</button>
    </div>

    <div class="answers">
      <button
        v-for="color in colorOptions"
        :key="color.key"
        :disabled="phase !== 'running' || !currentStimulus"
        @click="submitAnswer(color.key)"
      >
        {{ color.label }}
      </button>
    </div>

    <div v-if="phase === 'finished'" class="results">
      <h3>Results</h3>
      <ul>
        <li>Accuracy: {{ summary.accuracy.toFixed(1) }}%</li>
        <li>Correct: {{ summary.correct }}</li>
        <li>Incorrect: {{ summary.incorrect }}</li>
        <li>Congruent trials: {{ summary.congruentCount }}</li>
        <li>Incongruent trials: {{ summary.incongruentCount }}</li>
        <li>Avg RT: {{ summary.avgRTms === null ? "—" : summary.avgRTms.toFixed(0) + " ms" }}</li>
        <li>Avg RT (congruent): {{ summary.avgCongruentRT === null ? "—" : summary.avgCongruentRT.toFixed(0) + " ms" }}</li>
        <li>Avg RT (incongruent): {{ summary.avgIncongruentRT === null ? "—" : summary.avgIncongruentRT.toFixed(0) + " ms" }}</li>
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

const MODULE_ID = "attention_stroop";
const CATEGORY = "pozornost";

const phase = ref("idle");
const trialIndex = ref(0);
const totalTrials = ref(24);

const stimulusDurationMs = ref(2500);
const isiMs = ref(500);

const responses = ref([]);
const currentStimulus = ref(null);
const currentShownAtMs = ref(null);
const currentAnswered = ref(false);

let trialTimer = null;
let isiTimer = null;

const colorOptions = [
  { key: "red", label: "Red" },
  { key: "blue", label: "Blue" },
  { key: "green", label: "Green" },
  { key: "yellow", label: "Yellow" }
];

const words = ["RED", "BLUE", "GREEN", "YELLOW"];
const colorMap = {
  RED: "red",
  BLUE: "blue",
  GREEN: "green",
  YELLOW: "yellow"
};

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
  responses.value = [];
  currentStimulus.value = null;
  currentShownAtMs.value = null;
  currentAnswered.value = false;
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

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateStimulus() {
  const congruent = Math.random() < 0.5;
  const word = randomItem(words);

  let displayColor;
  if (congruent) {
    displayColor = colorMap[word];
  } else {
    const otherColors = colorOptions.map(c => c.key).filter(c => c !== colorMap[word]);
    displayColor = randomItem(otherColors);
  }

  return {
    word,
    displayColor,
    congruent
  };
}

function finalizeTrial(userAnswer = null) {
  if (!currentStimulus.value || currentShownAtMs.value === null) return;

  const correctAnswer = currentStimulus.value.displayColor;
  const correct = userAnswer === correctAnswer;
  const rtMs = userAnswer ? Math.max(0, nowMs() - currentShownAtMs.value) : null;

  responses.value.push({
    trial: trialIndex.value,
    word: currentStimulus.value.word,
    displayColor: currentStimulus.value.displayColor,
    congruent: currentStimulus.value.congruent,
    userAnswer,
    correctAnswer,
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

  trialTimer = setTimeout(() => {
    if (!currentAnswered.value) {
      finalizeTrial(null);
      currentStimulus.value = null;

      isiTimer = setTimeout(() => {
        nextTrial();
      }, isiMs.value);
    }
  }, stimulusDurationMs.value);
}

function submitAnswer(answer) {
  if (phase.value !== "running") return;
  if (!currentStimulus.value) return;
  if (currentAnswered.value) return;

  currentAnswered.value = true;
  clearTimers();
  finalizeTrial(answer);
  currentStimulus.value = null;

  isiTimer = setTimeout(() => {
    nextTrial();
  }, isiMs.value);
}

onBeforeUnmount(() => {
  clearTimers();
});

const summary = computed(() => {
  const recs = responses.value;
  const correct = recs.filter(r => r.correct).length;
  const incorrect = recs.length - correct;

  const congruent = recs.filter(r => r.congruent);
  const incongruent = recs.filter(r => !r.congruent);

  const rts = recs.map(r => r.rtMs).filter(v => v !== null);
  const congruentRTs = congruent.map(r => r.rtMs).filter(v => v !== null);
  const incongruentRTs = incongruent.map(r => r.rtMs).filter(v => v !== null);

  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  return {
    correct,
    incorrect,
    accuracy: recs.length ? (correct / recs.length) * 100 : 0,
    congruentCount: congruent.length,
    incongruentCount: incongruent.length,
    avgRTms: avg(rts),
    avgCongruentRT: avg(congruentRTs),
    avgIncongruentRT: avg(incongruentRTs)
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
.stroop { max-width: 760px; margin: 0 auto; padding: 16px; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; }
.panel { border: 1px solid #ddd; border-radius: 12px; padding: 12px; margin-bottom: 12px; }
.stimulusBox { border: 1px solid #ddd; border-radius: 12px; padding: 24px; min-height: 120px; display: flex; align-items: center; justify-content: center; margin-bottom: 12px; }
.stimulus { font-size: 44px; font-weight: 700; letter-spacing: 1px; }
.controls, .answers { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
button { padding: 8px 12px; border-radius: 10px; border: 1px solid #ccc; background: white; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.results { border-top: 1px solid #eee; padding-top: 12px; margin-top: 12px; }
.pre { white-space: pre-wrap; font-size: 12px; background: #fafafa; padding: 12px; border-radius: 12px; border: 1px solid #eee; }
</style>