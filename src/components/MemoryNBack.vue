<template>
  <div class="module">
    <h2>Memory N-Back</h2>

    <div class="panel">
      <div><b>Kategória:</b> Pamäť</div>
      <div><b>Status:</b> {{ phase }}</div>
      <div><b>Obtiažnosť:</b> {{ difficultyLabel }}</div>
      <div><b>N:</b> {{ levelConfig.n }}</div>
      <div><b>Trial:</b> {{ trialIndex }} / {{ totalTrials }}</div>
      <div><b>Block:</b> {{ currentBlockIndex }} / {{ totalBlocks }}</div>
      <div><b>Success streak:</b> {{ successStreak }}</div>
      <div><b>Stimulus duration:</b> {{ levelConfig.stimulusDurationMs }} ms</div>
      <div><b>ISI:</b> {{ levelConfig.isiMs }} ms</div>
      <div><b>Stimulus:</b> <span class="stimulus">{{ currentStimulus ?? "—" }}</span></div>
      <div class="hint">
        Press <b>Space</b> or click <b>Match</b> when current stimulus matches the one {{ levelConfig.n }} step(s) back.
      </div>
    </div>

    <div class="controls">
      <button :disabled="phase === 'running'" @click="start">Start</button>
      <button :disabled="phase !== 'running'" @click="stop">Stop</button>
      <button :disabled="phase !== 'running'" @click="registerResponse">Match</button>
      <button :disabled="phase !== 'finished'" @click="reset">Reset</button>
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
  updateDifficulty
} = useAdaptiveDifficulty({
  minDifficulty: 1,
  maxDifficulty: 10,
  startDifficulty: 2,
  fastThresholdMs: 450,
  slowThresholdMs: 1400,
  targetAccuracyMin: 0.72,
  targetAccuracyMax: 0.9,
  windowSize: 4,
  evaluateEvery: 2,
  scoreIncreaseThreshold: 78,
  scoreDecreaseThreshold: 48,
  maxPendingPenalty: 2
});

const totalTrials = ref(30);
const blockSize = ref(5);

const difficultySettings = [
  { n: 1, stimulusDurationMs: 1200, isiMs: 700 },
  { n: 1, stimulusDurationMs: 1050, isiMs: 650 },
  { n: 2, stimulusDurationMs: 1000, isiMs: 620 },
  { n: 2, stimulusDurationMs: 900, isiMs: 580 },
  { n: 2, stimulusDurationMs: 820, isiMs: 540 },
  { n: 3, stimulusDurationMs: 780, isiMs: 500 },
  { n: 3, stimulusDurationMs: 700, isiMs: 460 },
  { n: 3, stimulusDurationMs: 640, isiMs: 420 },
  { n: 4, stimulusDurationMs: 600, isiMs: 380 },
  { n: 4, stimulusDurationMs: 540, isiMs: 340 }
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
}

function evaluateCurrentBlock() {
  const startIndex = responses.value.length - blockSize.value;
  if (startIndex < 0) return;

  const blockResponses = responses.value.slice(startIndex);
  if (!blockResponses.length) return;

  const correctCount = blockResponses.filter(r => r.correct).length;
  const hits = blockResponses.filter(r => r.isTarget && r.userPressed).length;
  const misses = blockResponses.filter(r => r.isTarget && !r.userPressed).length;
  const falseAlarms = blockResponses.filter(r => !r.isTarget && r.userPressed).length;

  const accuracy = correctCount / blockResponses.length;

  const rts = blockResponses
    .filter(r => r.userPressed && r.rtMs !== null)
    .map(r => r.rtMs);

  const avgRTms = rts.length
    ? rts.reduce((a, b) => a + b, 0) / rts.length
    : null;

  const penalty =
    falseAlarms * 0.22 +
    misses * 0.16;

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
    if (isEndOfBlock) {
      evaluateCurrentBlock();
    }

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
    settings: {
      totalTrials: totalTrials.value,
      blockSize: blockSize.value,
      n: levelConfig.value.n,
      stimulusDurationMs: levelConfig.value.stimulusDurationMs,
      isiMs: levelConfig.value.isiMs,
      adaptive: true
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