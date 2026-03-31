<template>
  <div class="module" :class="flashKind">
    <h2>Task Switching</h2>

    <div class="topbar">
      <div><b>Kategória:</b> Logické myslenie</div>
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
      <div><b>Rule:</b></div>
      <div>Blue frame → choose <b>color</b></div>
      <div>Green frame → choose <b>shape</b></div>

      <div v-if="feedback" class="feedback" :class="feedback.kind">
        {{ feedback.text }}
      </div>

      <template v-if="showDebug">
        <div><b>Success streak:</b> {{ successStreak }}</div>
        <div><b>Stimulus duration:</b> {{ levelConfig.stimulusDurationMs }} ms</div>
        <div><b>ISI:</b> {{ levelConfig.isiMs }} ms</div>
        <div><b>Switch probability:</b> {{ (levelConfig.switchProbability * 100).toFixed(0) }}%</div>
      </template>
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
          <div><b>Trial type:</b> {{ currentStimulus.isSwitchTrial ? 'Switch' : 'Repeat' }}</div>
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

    <div class="hint">
      Goal: react quickly and correctly, especially on switch trials.
    </div>

    <div v-if="phase === 'finished'" class="results">
      <h3>Results</h3>
      <ul>
        <li>Correct: {{ summary.correct }}</li>
        <li>Incorrect: {{ summary.incorrect }}</li>
        <li>Timeouts: {{ summary.timeouts }}</li>
        <li>Accuracy: {{ summary.accuracy.toFixed(1) }}%</li>
        <li>Switch accuracy: {{ summary.switchAccuracy.toFixed(1) }}%</li>
        <li>Repeat accuracy: {{ summary.repeatAccuracy.toFixed(1) }}%</li>
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
import { ref, computed, onBeforeUnmount } from "vue";
import { useGameSession } from "../composables/useGameSession";
import { useTimeout } from "../composables/useTimeout";
import { useAdaptiveDifficulty } from "../composables/useAdaptiveDifficulty";
import { useGameScoring } from "../composables/useGameScoring";
import { useInstantFeedback } from "../composables/useInstantFeedback";

const MODULE_ID = "attention_task_switching";
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
  updateDifficulty,
  showDebug
} = useAdaptiveDifficulty({
  minDifficulty: 1,
  maxDifficulty: 10,
  startDifficulty: 3,
  fastThresholdMs: 820,
  slowThresholdMs: 2200,
  targetAccuracyMin: 0.72,
  targetAccuracyMax: 0.88,
  windowSize: 4,
  evaluateEvery: 2,
  scoreIncreaseThreshold: 72,
  scoreDecreaseThreshold: 42
});

const { score, bestScore, lastDelta, awardScore, resetScore } = useGameScoring(MODULE_ID, {
  fastThresholdMs: 820,
  slowThresholdMs: 2200
});

const { feedback, flashKind, showFeedback, clearFeedback } = useInstantFeedback({
  durationMs: 750
});

const totalTrials = ref(24);

const difficultySettings = [
  { stimulusDurationMs: 3000, isiMs: 560, switchProbability: 0.28 },
  { stimulusDurationMs: 2700, isiMs: 520, switchProbability: 0.34 },
  { stimulusDurationMs: 2400, isiMs: 480, switchProbability: 0.40 },
  { stimulusDurationMs: 2150, isiMs: 450, switchProbability: 0.46 },
  { stimulusDurationMs: 1900, isiMs: 420, switchProbability: 0.52 },
  { stimulusDurationMs: 1700, isiMs: 390, switchProbability: 0.58 },
  { stimulusDurationMs: 1500, isiMs: 360, switchProbability: 0.64 },
  { stimulusDurationMs: 1320, isiMs: 330, switchProbability: 0.70 },
  { stimulusDurationMs: 1160, isiMs: 300, switchProbability: 0.76 },
  { stimulusDurationMs: 1000, isiMs: 270, switchProbability: 0.82 }
];

const levelConfig = computed(() => {
  const index = Math.max(0, Math.min(difficultySettings.length - 1, difficulty.value - 1));
  return difficultySettings[index];
});

const colors = ["red", "blue"];
const shapes = ["circle", "square"];

const currentStimulus = ref(null);
const currentOptions = ref([]);
const previousRule = ref(null);

const shownAtMs = ref(null);
const answered = ref(false);
const answeredAtMs = ref(null);

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
  resetScore();
  clearFeedback();

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
  if (!previousRule.value) return Math.random() < 0.5 ? "color" : "shape";

  const shouldSwitch = Math.random() < levelConfig.value.switchProbability;
  if (shouldSwitch) return previousRule.value === "color" ? "shape" : "color";
  return previousRule.value;
}

function generateStimulus() {
  const rule = chooseRule();
  const color = randomItem(colors);
  const shape = randomItem(shapes);

  const isSwitchTrial = previousRule.value !== null && rule !== previousRule.value;

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
    options,
    isSwitchTrial
  };
}

function finalizeTrial(userAnswer = null) {
  if (!currentStimulus.value || shownAtMs.value === null) return;

  const responded = userAnswer !== null;
  const timedOut = !responded;
  const correct = responded && userAnswer === currentStimulus.value.correctAnswer;
  const rtMs = responded && answeredAtMs.value !== null
    ? Math.max(0, answeredAtMs.value - shownAtMs.value)
    : null;

  const switchPenalty = currentStimulus.value.isSwitchTrial && !correct ? 0.12 : 0;
  const timeoutPenalty = timedOut ? 0.18 : 0;
  const wrongPenalty = responded && !correct ? 0.14 : 0;

  addResponse({
    trial: trialIndex.value,
    rule: currentStimulus.value.rule,
    color: currentStimulus.value.color,
    shape: currentStimulus.value.shape,
    correctAnswer: currentStimulus.value.correctAnswer,
    userAnswer,
    responded,
    timedOut,
    correct,
    difficulty: difficulty.value,
    switchTrial: currentStimulus.value.isSwitchTrial,
    stimulusDurationMs: levelConfig.value.stimulusDurationMs,
    isiMs: levelConfig.value.isiMs,
    switchProbability: levelConfig.value.switchProbability,
    rtMs
  });

  updateDifficulty({
    correct,
    rtMs,
    lapse: timedOut,
    penalty: switchPenalty + timeoutPenalty + wrongPenalty
  });

  awardScore({
    correct,
    difficulty: difficulty.value,
    rtMs,
    penalty: switchPenalty + timeoutPenalty + wrongPenalty
  });

  showFeedback({
    correct,
    correctText: currentStimulus.value.isSwitchTrial ? "Správne - switch" : "Správne",
    incorrectText: timedOut ? "Nesprávne - timeout" : currentStimulus.value.isSwitchTrial ? "Nesprávne - switch error" : "Nesprávne"
  });

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
  currentOptions.value = [];

  setManagedTimeout(() => {
    nextTaskTrial();
  }, levelConfig.value.isiMs);
}

onBeforeUnmount(() => {
  clearAllTimeouts();
});

const summary = computed(() => {
  const correct = responses.value.filter(r => r.correct).length;
  const incorrect = responses.value.filter(r => !r.correct && !r.timedOut).length;
  const timeouts = responses.value.filter(r => r.timedOut).length;

  const switchTrials = responses.value.filter(r => r.switchTrial).length;
  const repeatTrials = responses.value.filter(r => !r.switchTrial).length;

  const switchCorrect = responses.value.filter(r => r.switchTrial && r.correct).length;
  const repeatCorrect = responses.value.filter(r => !r.switchTrial && r.correct).length;

  const allRTs = responses.value.map(r => r.rtMs).filter(v => v !== null);

  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  return {
    correct,
    incorrect,
    timeouts,
    accuracy: responses.value.length ? (correct / responses.value.length) * 100 : 0,
    switchAccuracy: switchTrials ? (switchCorrect / switchTrials) * 100 : 0,
    repeatAccuracy: repeatTrials ? (repeatCorrect / repeatTrials) * 100 : 0,
    avgRTms: avg(allRTs),
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
      stimulusDurationMs: levelConfig.value.stimulusDurationMs,
      isiMs: levelConfig.value.isiMs,
      switchProbability: levelConfig.value.switchProbability,
      rules: ["color", "shape"],
      adaptive: true,
      localScore: true
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
  transition: background-color 0.25s ease;
}

.flash-ok {
  background: rgba(34, 197, 94, 0.08);
}

.flash-bad {
  background: rgba(239, 68, 68, 0.08);
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

.feedback {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 10px;
}

.feedback.ok {
  background: #ecfdf5;
  color: #166534;
  border: 1px solid #bbf7d0;
}

.feedback.bad {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
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