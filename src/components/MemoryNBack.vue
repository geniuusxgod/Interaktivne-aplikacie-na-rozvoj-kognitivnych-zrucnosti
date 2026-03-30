<template>
  <div class="module" :class="flashKind">
    <h2>Memory N-Back</h2>

    <div class="topbar">
      <div><b>Kategória:</b> Pamäť</div>
      <div><b>Obtiažnosť:</b> {{ difficultyLabel }}</div>
      <div><b>N:</b> {{ levelConfig.n }}</div>
      <div><b>Trial:</b> {{ trialIndex }} / {{ totalTrials }}</div>
      <div><b>Block:</b> {{ currentBlockIndex }} / {{ totalBlocks }}</div>
    </div>

    <div class="scorebar">
      <div><b>Score:</b> {{ score }}</div>
      <div><b>Best score:</b> {{ bestScore }}</div>
      <div><b>Last delta:</b> {{ lastDelta >= 0 ? `+${lastDelta}` : lastDelta }}</div>
    </div>

    <div class="panel">
      <div><b>Status:</b> {{ phase }}</div>
      <div><b>Success streak:</b> {{ successStreak }}</div>
      <div><b>Stimulus:</b> <span class="stimulus">{{ currentStimulus ?? "—" }}</span></div>

      <div class="hint">
        Press <b>Space</b> or click <b>Match</b> when the current stimulus matches the one {{ levelConfig.n }} step(s) back.
      </div>

      <div v-if="feedback" class="feedback" :class="feedback.kind">
        {{ feedback.text }}
      </div>
    </div>

    <div class="controls">
      <button :disabled="phase === 'running'" @click="start">Start</button>
      <button :disabled="phase !== 'running'" @click="stop">Stop</button>
      <button :disabled="phase !== 'running'" @click="registerResponse">Match</button>
      <button :disabled="phase !== 'finished'" @click="reset">Reset</button>
    </div>

    <div v-if="showDebug" class="debug">
      <div><b>Stimulus duration:</b> {{ levelConfig.stimulusDurationMs }} ms</div>
      <div><b>ISI:</b> {{ levelConfig.isiMs }} ms</div>
    </div>

    <div v-if="phase === 'finished'" class="results">
      <h3>Results</h3>
      <ul>
        <li>Accuracy: {{ summary.accuracy.toFixed(1) }}%</li>
        <li>Hits: {{ summary.hits }}</li>
        <li>Misses: {{ summary.misses }}</li>
        <li>False alarms: {{ summary.falseAlarms }}</li>
        <li>Correct rejections: {{ summary.correctRejections }}</li>
        <li>Target rate: {{ summary.targetRate.toFixed(1) }}%</li>
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

const MODULE_ID = "memory_nback";
const CATEGORY = "pamat";

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
  fastThresholdMs: 420,
  slowThresholdMs: 1300,
  targetAccuracyMin: 0.68,
  targetAccuracyMax: 0.86,
  windowSize: 4,
  evaluateEvery: 2,
  scoreIncreaseThreshold: 72,
  scoreDecreaseThreshold: 42
});

const { score, bestScore, lastDelta, awardScore, resetScore } = useGameScoring(MODULE_ID, {
  fastThresholdMs: 420,
  slowThresholdMs: 1300
});

const { feedback, flashKind, showFeedback, clearFeedback } = useInstantFeedback({
  durationMs: 700
});

const totalTrials = ref(30);
const blockSize = ref(5);

const difficultySettings = [
  { n: 1, stimulusDurationMs: 980, isiMs: 560 },
  { n: 2, stimulusDurationMs: 900, isiMs: 520 },
  { n: 2, stimulusDurationMs: 820, isiMs: 480 },
  { n: 2, stimulusDurationMs: 740, isiMs: 440 },
  { n: 3, stimulusDurationMs: 680, isiMs: 410 },
  { n: 3, stimulusDurationMs: 620, isiMs: 380 },
  { n: 3, stimulusDurationMs: 570, isiMs: 350 },
  { n: 4, stimulusDurationMs: 530, isiMs: 320 },
  { n: 4, stimulusDurationMs: 490, isiMs: 300 },
  { n: 4, stimulusDurationMs: 450, isiMs: 280 }
];

const levelConfig = computed(() => {
  const index = Math.max(0, Math.min(difficultySettings.length - 1, difficulty.value - 1));
  return difficultySettings[index];
});

const stimulusSet = ["A", "B", "C", "D", "E", "F", "G", "H"];

const currentStimulus = ref(null);
const sequence = ref([]);

const currentTrialShownAtMs = ref(null);
const currentTrialResponded = ref(false);
const currentTrialResponseAtMs = ref(null);

const currentBlockIndex = ref(1);
const totalBlocks = computed(() => Math.ceil(totalTrials.value / blockSize.value));

function nowMs() {
  return performance.now();
}

function randomStimulus() {
  const idx = Math.floor(Math.random() * stimulusSet.length);
  return stimulusSet[idx];
}

function buildStimulusForTrial(trialNumber1Based) {
  const index = trialNumber1Based - 1;
  const n = levelConfig.value.n;

  if (index >= n && Math.random() < 0.35) {
    return sequence.value[index - n];
  }

  let candidate = randomStimulus();
  if (index >= n) {
    while (candidate === sequence.value[index - n]) {
      candidate = randomStimulus();
    }
  }
  return candidate;
}

function computeIsTarget(stimulus, trialNumber1Based, n) {
  const idx = trialNumber1Based - 1;
  const backIdx = idx - n;
  if (backIdx < 0) return false;
  return sequence.value[backIdx] === stimulus;
}

function reset() {
  clearAllTimeouts();
  resetSession();
  resetDifficulty();
  resetScore();
  clearFeedback();

  currentStimulus.value = null;
  sequence.value = [];
  currentTrialShownAtMs.value = null;
  currentTrialResponded.value = false;
  currentTrialResponseAtMs.value = null;
  currentBlockIndex.value = 1;
}

function stop() {
  clearAllTimeouts();
  currentStimulus.value = null;
  stopSession();
}

function start() {
  reset();
  startSession();
  nextNBackTrial();
}

function finalizeTrial(trialNumber1Based) {
  const stimulus = currentStimulus.value;
  const shownAt = currentTrialShownAtMs.value;

  if (stimulus === null || shownAt === null) return;

  const isTarget = computeIsTarget(stimulus, trialNumber1Based, levelConfig.value.n);
  const userPressed = currentTrialResponded.value;
  const correct = (isTarget && userPressed) || (!isTarget && !userPressed);

  const falseAlarm = !isTarget && userPressed;
  const miss = isTarget && !userPressed;

  const respondedAt = currentTrialResponseAtMs.value;
  const rtMs = userPressed && respondedAt !== null
    ? Math.max(0, respondedAt - shownAt)
    : null;

  addResponse({
    trial: trialNumber1Based,
    stimulus,
    n: levelConfig.value.n,
    difficulty: difficulty.value,
    isTarget,
    userPressed,
    correct,
    falseAlarm,
    miss,
    rtMs,
    shownAtMs: shownAt,
    respondedAtMs: respondedAt
  });

  awardScore({
    correct,
    difficulty: difficulty.value,
    rtMs,
    penalty: falseAlarm ? 0.4 : miss ? 0.28 : 0
  });

  showFeedback({
    correct,
    correctText: "Správne",
    incorrectText: falseAlarm ? "Nesprávne - false alarm" : miss ? "Nesprávne - miss" : "Nesprávne"
  });
}

function evaluateCurrentBlock() {
  const startIndex = responses.value.length - blockSize.value;
  if (startIndex < 0) return;

  const blockResponses = responses.value.slice(startIndex);
  if (!blockResponses.length) return;

  const correctCount = blockResponses.filter(r => r.correct).length;
  const misses = blockResponses.filter(r => r.isTarget && !r.userPressed).length;
  const falseAlarms = blockResponses.filter(r => !r.isTarget && r.userPressed).length;

  const accuracy = correctCount / blockResponses.length;

  const rts = blockResponses
    .filter(r => r.userPressed && r.rtMs !== null)
    .map(r => r.rtMs);

  const avgRTms = rts.length
    ? rts.reduce((a, b) => a + b, 0) / rts.length
    : null;

  const penalty = falseAlarms * 0.22 + misses * 0.16;

  updateDifficulty({
    aggregate: true,
    accuracy,
    avgRTms,
    penalty,
    sampleCount: blockResponses.length
  });

  currentBlockIndex.value += 1;
}

function nextNBackTrial() {
  if (phase.value !== "running") return;

  if (trialIndex.value >= totalTrials.value) {
    currentStimulus.value = null;
    stopSession();
    return;
  }

  nextTrial();

  const stim = buildStimulusForTrial(trialIndex.value);
  currentStimulus.value = stim;
  sequence.value.push(stim);

  currentTrialShownAtMs.value = nowMs();
  currentTrialResponded.value = false;
  currentTrialResponseAtMs.value = null;

  setManagedTimeout(() => {
    finalizeTrial(trialIndex.value);
    currentStimulus.value = null;

    const isEndOfBlock = trialIndex.value % blockSize.value === 0;
    if (isEndOfBlock) evaluateCurrentBlock();

    setManagedTimeout(() => {
      nextNBackTrial();
    }, levelConfig.value.isiMs);
  }, levelConfig.value.stimulusDurationMs);
}

function registerResponse() {
  if (phase.value !== "running") return;
  if (currentTrialResponded.value) return;
  if (currentTrialShownAtMs.value === null) return;

  currentTrialResponded.value = true;
  currentTrialResponseAtMs.value = nowMs();
}

function onKeydown(e) {
  if (e.code === "Space") {
    e.preventDefault();
    registerResponse();
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
  const recs = responses.value;

  let hits = 0;
  let misses = 0;
  let falseAlarms = 0;
  let correctRejections = 0;

  const rts = [];
  let targetCount = 0;

  for (const r of recs) {
    if (r.isTarget) targetCount += 1;

    if (r.isTarget && r.userPressed) hits += 1;
    else if (r.isTarget && !r.userPressed) misses += 1;
    else if (!r.isTarget && r.userPressed) falseAlarms += 1;
    else if (!r.isTarget && !r.userPressed) correctRejections += 1;

    if (r.rtMs !== null) rts.push(r.rtMs);
  }

  const correct = recs.filter(r => r.correct).length;
  const accuracy = recs.length ? (correct / recs.length) * 100 : 0;
  const avgRTms = rts.length ? rts.reduce((a, b) => a + b, 0) / rts.length : null;

  return {
    hits,
    misses,
    falseAlarms,
    correctRejections,
    accuracy,
    avgRTms,
    targetRate: recs.length ? (targetCount / recs.length) * 100 : 0,
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
      blockSize: blockSize.value,
      n: levelConfig.value.n,
      stimulusDurationMs: levelConfig.value.stimulusDurationMs,
      isiMs: levelConfig.value.isiMs,
      adaptive: true,
      localScore: true
    }
  })
);
</script>

<style scoped>
.module {
  max-width: 720px;
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
  margin: 12px 0;
}

.stimulus {
  font-size: 28px;
  display: inline-block;
  min-width: 24px;
  font-weight: 700;
}

.hint {
  margin-top: 8px;
  opacity: 0.8;
}

.controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 12px 0;
}

button {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid #ccc;
  background: #fff;
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

.debug {
  margin-top: 12px;
  padding: 12px;
  border: 1px dashed #ccc;
  border-radius: 12px;
  display: grid;
  gap: 6px;
  background: #fafafa;
}

.results {
  border-top: 1px solid #eee;
  margin-top: 16px;
  padding-top: 12px;
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