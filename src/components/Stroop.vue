<template>
  <div class="module" :class="flashKind">
    <h2>Stroop Task</h2>

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
      <div><b>Rule:</b> Choose the <u>ink color</u>, not the written word.</div>

      <div v-if="feedback" class="feedback" :class="feedback.kind">
        {{ feedback.text }}
      </div>

      <template v-if="showDebug">
        <div><b>Success streak:</b> {{ successStreak }}</div>
        <div><b>Stimulus duration:</b> {{ levelConfig.stimulusDurationMs }} ms</div>
        <div><b>ISI:</b> {{ levelConfig.isiMs }} ms</div>
        <div><b>Incongruent ratio:</b> {{ (levelConfig.incongruentProbability * 100).toFixed(0) }}%</div>
      </template>
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
        <li>Congruent accuracy: {{ summary.congruentAccuracy.toFixed(1) }}%</li>
        <li>Incongruent accuracy: {{ summary.incongruentAccuracy.toFixed(1) }}%</li>
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
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { useGameSession } from "../composables/useGameSession";
import { useTimeout } from "../composables/useTimeout";
import { useAdaptiveDifficulty } from "../composables/useAdaptiveDifficulty";
import { useGameScoring } from "../composables/useGameScoring";
import { useInstantFeedback } from "../composables/useInstantFeedback";

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
  updateDifficulty,
  showDebug
} = useAdaptiveDifficulty({
  minDifficulty: 1,
  maxDifficulty: 10,
  startDifficulty: 3,
  fastThresholdMs: 620,
  slowThresholdMs: 1800,
  targetAccuracyMin: 0.72,
  targetAccuracyMax: 0.88,
  windowSize: 4,
  evaluateEvery: 2,
  scoreIncreaseThreshold: 72,
  scoreDecreaseThreshold: 42
});

const { score, bestScore, lastDelta, awardScore, resetScore } = useGameScoring(MODULE_ID, {
  fastThresholdMs: 620,
  slowThresholdMs: 1800
});

const { feedback, flashKind, showFeedback, clearFeedback } = useInstantFeedback({
  durationMs: 750
});

const totalTrials = ref(24);

const difficultySettings = [
  { stimulusDurationMs: 2800, isiMs: 560, incongruentProbability: 0.28 },
  { stimulusDurationMs: 2500, isiMs: 520, incongruentProbability: 0.36 },
  { stimulusDurationMs: 2200, isiMs: 480, incongruentProbability: 0.44 },
  { stimulusDurationMs: 1950, isiMs: 450, incongruentProbability: 0.52 },
  { stimulusDurationMs: 1700, isiMs: 420, incongruentProbability: 0.60 },
  { stimulusDurationMs: 1500, isiMs: 390, incongruentProbability: 0.68 },
  { stimulusDurationMs: 1320, isiMs: 360, incongruentProbability: 0.74 },
  { stimulusDurationMs: 1160, isiMs: 330, incongruentProbability: 0.80 },
  { stimulusDurationMs: 1020, isiMs: 300, incongruentProbability: 0.86 },
  { stimulusDurationMs: 900, isiMs: 270, incongruentProbability: 0.90 }
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
  resetScore();
  clearFeedback();

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
  const totalPenalty = incongruentPenalty + timeoutPenalty + wrongPenalty;

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
    penalty: totalPenalty
  });

  awardScore({
    correct,
    difficulty: difficulty.value,
    rtMs,
    penalty: totalPenalty
  });

  showFeedback({
    correct,
    correctText: currentStimulus.value.congruent ? "Správne" : "Správne - incongruent",
    incorrectText: timedOut ? "Nesprávne - timeout" : !currentStimulus.value.congruent ? "Nesprávne - incongruent" : "Nesprávne"
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
  if (phase.value !== "running" || answered.value) return;

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
  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  return {
    correct,
    incorrect,
    timeouts,
    accuracy: responses.value.length ? (correct / responses.value.length) * 100 : 0,
    congruentAccuracy: congruentTrials ? (congruentCorrect / congruentTrials) * 100 : 0,
    incongruentAccuracy: incongruentTrials ? (incongruentCorrect / incongruentTrials) * 100 : 0,
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
      incongruentProbability: levelConfig.value.incongruentProbability,
      adaptive: true,
      localScore: true
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