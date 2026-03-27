<template>
  <div class="module">
    <h2>Task Switching</h2>

    <div class="panel">
      <div><b>Kategória:</b> Logické myslenie</div>
      <div><b>Status:</b> {{ phase }}</div>
      <div><b>Obtiažnosť:</b> {{ difficultyLabel }}</div>
      <div><b>Success streak:</b> {{ successStreak }}</div>
      <div><b>Trial:</b> {{ trialIndex }} / {{ totalTrials }}</div>
      <div><b>Rule:</b></div>
      <div>Blue frame → choose <b>color</b></div>
      <div>Green frame → choose <b>shape</b></div>
    </div>

    <div
      class="stimulus-box"
      :class="currentStimulus ? currentStimulus.rule : ''"
    >
      <div v-if="currentStimulus" class="stimulus-content">
        <div class="stimulus-shape" :class="[currentStimulus.shape, currentStimulus.color]"></div>
        <div class="stimulus-meta">
          <div><b>Rule:</b> {{ currentStimulus.rule === 'color' ? 'Choose color' : 'Choose shape' }}</div>
          <div><b>Stimulus:</b> {{ currentStimulus.color }} {{ currentStimulus.shape }}</div>
        </div>
      </div>

      <div v-else class="placeholder">—</div>
    </div>

    <div class="answers">
      <button
        v-for="option in currentOptions"
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

    <div v-if="phase === 'finished'" class="results">
      <h3>Results</h3>
      <ul>
        <li>Correct: {{ summary.correct }}</li>
        <li>Incorrect: {{ summary.incorrect }}</li>
        <li>Accuracy: {{ summary.accuracy.toFixed(1) }}%</li>
        <li>Switch trials: {{ summary.switchTrials }}</li>
        <li>Repeat trials: {{ summary.repeatTrials }}</li>
        <li>Avg RT: {{ summary.avgRTms === null ? "—" : summary.avgRTms.toFixed(0) + " ms" }}</li>
        <li>Avg RT (switch): {{ summary.avgSwitchRT === null ? "—" : summary.avgSwitchRT.toFixed(0) + " ms" }}</li>
        <li>Avg RT (repeat): {{ summary.avgRepeatRT === null ? "—" : summary.avgRepeatRT.toFixed(0) + " ms" }}</li>
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

const MODULE_ID = "logic_task_switching";
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
  maxDifficulty: 5,
  startDifficulty: 1,
  successThreshold: 2
});

const totalTrials = ref(20);
const isiMs = ref(600);

const stimulusDurationMs = computed(() => {
  if (difficulty.value === 1) return 4200;
  if (difficulty.value === 2) return 3600;
  if (difficulty.value === 3) return 3000;
  if (difficulty.value === 4) return 2400;
  return 1800;
});

const switchProbability = computed(() => {
  if (difficulty.value === 1) return 0.25;
  if (difficulty.value === 2) return 0.35;
  if (difficulty.value === 3) return 0.45;
  if (difficulty.value === 4) return 0.55;
  return 0.65;
});

const currentStimulus = ref(null);
const currentOptions = ref([]);
const previousRule = ref(null);

const shownAtMs = ref(null);
const answered = ref(false);
const answeredAtMs = ref(null);

const colors = ["red", "blue"];
const shapes = ["circle", "square"];

function nowMs() {
  return performance.now();
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function reset() {
  clearAllTimeouts();
  resetSession();
  resetDifficulty();

  currentStimulus.value = null;
  currentOptions.value = [];
  previousRule.value = null;
  shownAtMs.value = null;
  answered.value = false;
  answeredAtMs.value = null;
}

function stop() {
  clearAllTimeouts();
  currentStimulus.value = null;
  currentOptions.value = [];
  stopSession();
}

function start() {
  reset();
  startSession();
  nextTaskTrial();
}

function chooseRule() {
  if (!previousRule.value) {
    return Math.random() < 0.5 ? "color" : "shape";
  }

  const shouldSwitch = Math.random() < switchProbability.value;
  if (shouldSwitch) {
    return previousRule.value === "color" ? "shape" : "color";
  }

  return previousRule.value;
}

function generateStimulus() {
  const rule = chooseRule();
  const color = randomItem(colors);
  const shape = randomItem(shapes);

  let correctAnswer;
  let options;

  if (rule === "color") {
    correctAnswer = color;
    options = [
      { key: "red", label: "Red" },
      { key: "blue", label: "Blue" }
    ];
  } else {
    correctAnswer = shape;
    options = [
      { key: "circle", label: "Circle" },
      { key: "square", label: "Square" }
    ];
  }

  return {
    rule,
    color,
    shape,
    correctAnswer,
    options
  };
}

function finalizeTrial(userAnswer = null) {
  if (!currentStimulus.value || shownAtMs.value === null) return;

  const correct = userAnswer === currentStimulus.value.correctAnswer;
  const rtMs = userAnswer && answeredAtMs.value !== null
    ? Math.max(0, answeredAtMs.value - shownAtMs.value)
    : null;

  const isSwitchTrial =
    previousRule.value !== null &&
    currentStimulus.value.rule !== previousRule.value;

  addResponse({
    trial: trialIndex.value,
    rule: currentStimulus.value.rule,
    color: currentStimulus.value.color,
    shape: currentStimulus.value.shape,
    correctAnswer: currentStimulus.value.correctAnswer,
    userAnswer,
    correct,
    difficulty: difficulty.value,
    switchTrial: isSwitchTrial,
    rtMs
  });

  updateDifficulty(correct);
  previousRule.value = currentStimulus.value.rule;
}

function nextTaskTrial() {
  if (phase.value !== "running") return;

  if (trialIndex.value >= totalTrials.value) {
    currentStimulus.value = null;
    currentOptions.value = [];
    stopSession();
    return;
  }

  nextTrial();

  const stimulus = generateStimulus();
  currentStimulus.value = stimulus;
  currentOptions.value = stimulus.options;

  shownAtMs.value = nowMs();
  answered.value = false;
  answeredAtMs.value = null;

  setManagedTimeout(() => {
    if (!answered.value) {
      finalizeTrial(null);
      currentStimulus.value = null;
      currentOptions.value = [];

      setManagedTimeout(() => {
        nextTaskTrial();
      }, isiMs.value);
    }
  }, stimulusDurationMs.value);
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
  currentOptions.value = [];

  setManagedTimeout(() => {
    nextTaskTrial();
  }, isiMs.value);
}

onBeforeUnmount(() => {
  clearAllTimeouts();
});

const summary = computed(() => {
  const correct = responses.value.filter(r => r.correct).length;
  const incorrect = responses.value.length - correct;

  const switchTrials = responses.value.filter(r => r.switchTrial).length;
  const repeatTrials = responses.value.filter(r => !r.switchTrial).length;

  const allRTs = responses.value.map(r => r.rtMs).filter(v => v !== null);
  const switchRTs = responses.value.filter(r => r.switchTrial && r.rtMs !== null).map(r => r.rtMs);
  const repeatRTs = responses.value.filter(r => !r.switchTrial && r.rtMs !== null).map(r => r.rtMs);

  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  return {
    correct,
    incorrect,
    accuracy: responses.value.length
      ? (correct / responses.value.length) * 100
      : 0,
    switchTrials,
    repeatTrials,
    avgRTms: avg(allRTs),
    avgSwitchRT: avg(switchRTs),
    avgRepeatRT: avg(repeatRTs),
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
      switchProbability: switchProbability.value,
      rules: ["color", "shape"],
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

.stimulus-box {
  border: 4px solid #ddd;
  border-radius: 16px;
  padding: 20px;
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  background: #fff;
}

.stimulus-box.color {
  border-color: #60a5fa;
}

.stimulus-box.shape {
  border-color: #22c55e;
}

.stimulus-content {
  display: flex;
  align-items: center;
  gap: 24px;
}

.stimulus-shape {
  width: 70px;
  height: 70px;
  border: 2px solid #222;
}

.circle {
  border-radius: 50%;
}

.square {
  border-radius: 10px;
}

.red {
  background: #ef4444;
}

.blue {
  background: #3b82f6;
}

.stimulus-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.placeholder {
  font-size: 40px;
  color: #999;
}

.answers {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 16px;
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