<template>
  <div class="module">
    <h2>Stroop Task</h2>

    <div class="panel">
      <div><b>Kategória:</b> Logické myslenie</div>
      <div><b>Status:</b> {{ phase }}</div>
      <div><b>Obtiažnosť:</b> {{ difficultyLabel }}</div>
      <div><b>Success streak:</b> {{ successStreak }}</div>
      <div><b>Trial:</b> {{ trialIndex }} / {{ totalTrials }}</div>
      <div><b>Stimulus duration:</b> {{ levelConfig.stimulusDurationMs }} ms</div>
      <div><b>ISI:</b> {{ levelConfig.isiMs }} ms</div>
      <div><b>Incongruent ratio:</b> {{ (levelConfig.incongruentProbability * 100).toFixed(0) }}%</div>
      <div><b>Rule:</b> Choose the <u>ink color</u>, not the written word.</div>
    </div>

    <div class="stimulus-box">
      <div
        v-if="currentStimulus"
        class="stroop-word"
        :style="{ color: currentStimulus.inkColorCss }"
      >
        {{ currentStimulus.wordLabel }}
      </div>
      <div v-else class="placeholder">—</div>
    </div>

    <div class="answers">
      <button
        v-for="option in answerOptions"
        :key="option.key"
        :disabled="phase !== 'running' || !currentStimulus || answered"
        @click="submitAnswer(option.key)"
      >
        {{ option.label }}
      </button>
    </div>

    <div class="controls">
      <button :disabled="phase === 'running'" @click="start">Start</button>
      <button :disabled="phase !== 'running'" @click="stop">Stop</button>
      <button :disabled="phase !== 'finished'" @click="reset">Reset</button>
    </div>

    <div class="hint">
      Higher difficulty increases time pressure and incongruent trials.
    </div>

    <div v-if="phase === 'finished'" class="results">
      <h3>Results</h3>
      <ul>
        <li>Correct: {{ summary.correct }}</li>
        <li>Incorrect: {{ summary.incorrect }}</li>
        <li>Timeouts: {{ summary.timeouts }}</li>
        <li>Accuracy: {{ summary.accuracy.toFixed(1) }}%</li>
        <li>Congruent trials: {{ summary.congruentTrials }}</li>
        <li>Incongruent trials: {{ summary.incongruentTrials }}</li>
        <li>Congruent accuracy: {{ summary.congruentAccuracy.toFixed(1) }}%</li>
        <li>Incongruent accuracy: {{ summary.incongruentAccuracy.toFixed(1) }}%</li>
        <li>Avg RT: {{ summary.avgRTms === null ? "—" : summary.avgRTms.toFixed(0) + " ms" }}</li>
        <li>Avg RT (incongruent): {{ summary.avgIncongruentRT === null ? "—" : summary.avgIncongruentRT.toFixed(0) + " ms" }}</li>
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

const MODULE_ID = "logic_stroop";
const CATEGORY = "logicke_myslenie";

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
  fastThresholdMs: 700,
  slowThresholdMs: 2200,
  targetAccuracyMin: 0.76,
  targetAccuracyMax: 0.92,
  windowSize: 6,
  evaluateEvery: 3,
  scoreIncreaseThreshold: 80,
  scoreDecreaseThreshold: 50,
  maxPendingPenalty: 2
});

const totalTrials = ref(24);

const difficultySettings = [
  { stimulusDurationMs: 4200, isiMs: 700, incongruentProbability: 0.20 },
  { stimulusDurationMs: 3700, isiMs: 660, incongruentProbability: 0.26 },
  { stimulusDurationMs: 3300, isiMs: 620, incongruentProbability: 0.34 },
  { stimulusDurationMs: 2950, isiMs: 580, incongruentProbability: 0.42 },
  { stimulusDurationMs: 2600, isiMs: 540, incongruentProbability: 0.50 },
  { stimulusDurationMs: 2250, isiMs: 500, incongruentProbability: 0.58 },
  { stimulusDurationMs: 1950, isiMs: 460, incongruentProbability: 0.66 },
  { stimulusDurationMs: 1700, isiMs: 420, incongruentProbability: 0.74 },
  { stimulusDurationMs: 1450, isiMs: 380, incongruentProbability: 0.80 },
  { stimulusDurationMs: 1250, isiMs: 340, incongruentProbability: 0.86 }
];

const levelConfig = computed(() => {
  const index = Math.max(0, Math.min(difficultySettings.length - 1, difficulty.value - 1));
  return difficultySettings[index];
});

const colorDefs = [
  { key: "red", label: "Red", css: "#ef4444" },
  { key: "blue", label: "Blue", css: "#3b82f6" },
  { key: "green", label: "Green", css: "#22c55e" },
  { key: "yellow", label: "Yellow", css: "#eab308" }
];

const answerOptions = computed(() =>
  colorDefs.map(c => ({ key: c.key, label: c.label }))
);

const currentStimulus = ref(null);
const shownAtMs = ref(null);
const answered = ref(false);
const answeredAtMs = ref(null);

function nowMs() {
  return performance.now();
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickDifferentColor(exceptKey) {
  const pool = colorDefs.filter(c => c.key !== exceptKey);
  return randomItem(pool);
}

function generateStimulus() {
  const wordColor = randomItem(colorDefs);
  const incongruent = Math.random() < levelConfig.value.incongruentProbability;

  const inkColor = incongruent ? pickDifferentColor(wordColor.key) : wordColor;

  return {
    wordKey: wordColor.key,
    wordLabel: wordColor.label.toUpperCase(),
    inkColorKey: inkColor.key,
    inkColorCss: inkColor.css,
    congruent: wordColor.key === inkColor.key
  };
}

function reset() {
  clearAllTimeouts();
  resetSession();
  resetDifficulty();

  currentStimulus.value = null;
  shownAtMs.value = null;
  answered.value = false;
  answeredAtMs.value = null;
}

function stop() {
  clearAllTimeouts();
  currentStimulus.value = null;
  stopSession();
}

function start() {
  reset();
  startSession();
  nextStroopTrial();
}

function finalizeTrial(answerKey = null) {
  if (!currentStimulus.value || shownAtMs.value === null) return;

  const responded = answerKey !== null;
  const timedOut = !responded;
  const correct = responded && answerKey === currentStimulus.value.inkColorKey;
  const rtMs = responded && answeredAtMs.value !== null
    ? Math.max(0, answeredAtMs.value - shownAtMs.value)
    : null;

  const incongruentPenalty = !currentStimulus.value.congruent && !correct ? 0.10 : 0;
  const timeoutPenalty = timedOut ? 0.18 : 0;
  const wrongPenalty = responded && !correct ? 0.14 : 0;

  addResponse({
    trial: trialIndex.value,
    wordKey: currentStimulus.value.wordKey,
    wordLabel: currentStimulus.value.wordLabel,
    inkColorKey: currentStimulus.value.inkColorKey,
    congruent: currentStimulus.value.congruent,
    answerKey,
    responded,
    timedOut,
    correct,
    difficulty: difficulty.value,
    stimulusDurationMs: levelConfig.value.stimulusDurationMs,
    isiMs: levelConfig.value.isiMs,
    incongruentProbability: levelConfig.value.incongruentProbability,
    rtMs
  });

  updateDifficulty({
    correct,
    rtMs,
    lapse: timedOut,
    penalty: incongruentPenalty + timeoutPenalty + wrongPenalty
  });
}

function nextStroopTrial() {
  if (phase.value !== "running") return;

  if (trialIndex.value >= totalTrials.value) {
    currentStimulus.value = null;
    stopSession();
    return;
  }

  nextTrial();
  currentStimulus.value = generateStimulus();
  shownAtMs.value = nowMs();
  answered.value = false;
  answeredAtMs.value = null;

  setManagedTimeout(() => {
    if (!answered.value) {
      finalizeTrial(null);
      currentStimulus.value = null;

      setManagedTimeout(() => {
        nextStroopTrial();
      }, levelConfig.value.isiMs);
    }
  }, levelConfig.value.stimulusDurationMs);
}

function submitAnswer(answerKey) {
  if (phase.value !== "running") return;
  if (!currentStimulus.value) return;
  if (answered.value) return;

  answered.value = true;
  answeredAtMs.value = nowMs();

  clearAllTimeouts();
  finalizeTrial(answerKey);
  currentStimulus.value = null;

  setManagedTimeout(() => {
    nextStroopTrial();
  }, levelConfig.value.isiMs);
}

function onKeydown(e) {
  if (phase.value !== "running") return;
  if (answered.value) return;

  const keyMap = {
    Digit1: "red",
    Digit2: "blue",
    Digit3: "green",
    Digit4: "yellow"
  };

  const answerKey = keyMap[e.code];
  if (answerKey) {
    e.preventDefault();
    submitAnswer(answerKey);
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
  const correct = responses.value.filter(r => r.correct).length;
  const incorrect = responses.value.filter(r => !r.correct && !r.timedOut).length;
  const timeouts = responses.value.filter(r => r.timedOut).length;

  const congruentTrials = responses.value.filter(r => r.congruent).length;
  const incongruentTrials = responses.value.filter(r => !r.congruent).length;

  const congruentCorrect = responses.value.filter(r => r.congruent && r.correct).length;
  const incongruentCorrect = responses.value.filter(r => !r.congruent && r.correct).length;

  const allRTs = responses.value.map(r => r.rtMs).filter(v => v !== null);
  const incongruentRTs = responses.value.filter(r => !r.congruent && r.rtMs !== null).map(r => r.rtMs);

  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  return {
    correct,
    incorrect,
    timeouts,
    accuracy: responses.value.length ? (correct / responses.value.length) * 100 : 0,
    congruentTrials,
    incongruentTrials,
    congruentAccuracy: congruentTrials ? (congruentCorrect / congruentTrials) * 100 : 0,
    incongruentAccuracy: incongruentTrials ? (incongruentCorrect / incongruentTrials) * 100 : 0,
    avgRTms: avg(allRTs),
    avgIncongruentRT: avg(incongruentRTs),
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
      incongruentProbability: levelConfig.value.incongruentProbability,
      answerKeys: {
        1: "Red",
        2: "Blue",
        3: "Green",
        4: "Yellow"
      },
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

.stimulus-box {
  min-height: 180px;
  border: 1px dashed #ccc;
  border-radius: 12px;
  display: grid;
  place-items: center;
  margin-bottom: 12px;
  background: #fafafa;
}

.stroop-word {
  font-size: 52px;
  font-weight: 800;
  letter-spacing: 2px;
}

.placeholder {
  font-size: 42px;
  color: #999;
}

.answers {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
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
  color: #555;
  margin-bottom: 12px;
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