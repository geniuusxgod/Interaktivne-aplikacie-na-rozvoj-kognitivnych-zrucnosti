<template>
  <div class="module">
    <h2>Stroop Task</h2>

    <div class="panel">
      <div><b>Kategória:</b> Pozornosť</div>
      <div><b>Status:</b> {{ phase }}</div>
      <div><b>Obtiažnosť:</b> {{ difficultyLabel }}</div>
      <div><b>Success streak:</b> {{ successStreak }}</div>
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

const MODULE_ID = "attention_stroop";
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
  maxDifficulty: 5,
  startDifficulty: 1,
  successThreshold: 2
});

const totalTrials = ref(24);
const isiMs = ref(500);

const stimulusDurationMs = computed(() => {
  if (difficulty.value === 1) return 2600;
  if (difficulty.value === 2) return 2200;
  if (difficulty.value === 3) return 1800;
  if (difficulty.value === 4) return 1500;
  return 1200;
});

const incongruentProbability = computed(() => {
  if (difficulty.value === 1) return 0.4;
  if (difficulty.value === 2) return 0.5;
  if (difficulty.value === 3) return 0.6;
  if (difficulty.value === 4) return 0.7;
  return 0.8;
});

const currentStimulus = ref(null);
const currentShownAtMs = ref(null);
const currentAnswered = ref(false);

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

function reset() {
  clearAllTimeouts();
  resetSession();
  resetDifficulty();

  currentStimulus.value = null;
  currentShownAtMs.value = null;
  currentAnswered.value = false;
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

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateStimulus() {
  const incongruent = Math.random() < incongruentProbability.value;
  const word = randomItem(words);

  let displayColor;

  if (!incongruent) {
    displayColor = colorMap[word];
  } else {
    const otherColors = colorOptions
      .map(c => c.key)
      .filter(c => c !== colorMap[word]);

    displayColor = randomItem(otherColors);
  }

  return {
    word,
    displayColor,
    congruent: !incongruent
  };
}

function finalizeTrial(userAnswer = null) {
  if (!currentStimulus.value || currentShownAtMs.value === null) return;

  const correctAnswer = currentStimulus.value.displayColor;
  const correct = userAnswer === correctAnswer;
  const rtMs = userAnswer ? Math.max(0, nowMs() - currentShownAtMs.value) : null;

  addResponse({
    trial: trialIndex.value,
    word: currentStimulus.value.word,
    displayColor: currentStimulus.value.displayColor,
    congruent: currentStimulus.value.congruent,
    userAnswer,
    correctAnswer,
    correct,
    difficulty: difficulty.value,
    rtMs
  });

  updateDifficulty(correct);
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
  currentShownAtMs.value = nowMs();
  currentAnswered.value = false;

  setManagedTimeout(() => {
    if (!currentAnswered.value) {
      finalizeTrial(null);
      currentStimulus.value = null;

      setManagedTimeout(() => {
        nextStroopTrial();
      }, isiMs.value);
    }
  }, stimulusDurationMs.value);
}

function submitAnswer(answer) {
  if (phase.value !== "running") return;
  if (!currentStimulus.value) return;
  if (currentAnswered.value) return;

  currentAnswered.value = true;
  clearAllTimeouts();
  finalizeTrial(answer);
  currentStimulus.value = null;

  setManagedTimeout(() => {
    nextStroopTrial();
  }, isiMs.value);
}

onBeforeUnmount(() => {
  clearAllTimeouts();
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
    avgIncongruentRT: avg(incongruentRTs),
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
      incongruentProbability: incongruentProbability.value,
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
  border: 1px solid #ddd;
  border-radius: 12px;
  padding: 24px;
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.stimulus {
  font-size: 44px;
  font-weight: 700;
  letter-spacing: 1px;
}

.controls,
.answers {
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