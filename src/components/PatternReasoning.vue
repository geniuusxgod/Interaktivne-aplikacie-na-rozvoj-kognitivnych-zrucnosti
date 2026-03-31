<template>
  <div class="module" :class="flashKind">
    <h2>Pattern Reasoning</h2>

    <div class="topbar">
      <div><b>Kategória:</b> Logické myslenie</div>
      <div><b>Status:</b> {{ phase }}</div>
      <div><b>Obtiažnosť:</b> {{ difficultyLabel }}</div>
      <div><b>Round:</b> {{ trialIndex }} / {{ totalRounds }}</div>
    </div>

    <div class="scorebar">
      <div><b>Score:</b> {{ score }}</div>
      <div><b>Best score:</b> {{ bestScore }}</div>
      <div><b>Last delta:</b> {{ lastDelta >= 0 ? `+${lastDelta}` : lastDelta }}</div>
    </div>

    <div class="panel">
      <div><b>Rule:</b> Choose the missing next symbol in the sequence.</div>

      <div v-if="feedback" class="feedback" :class="feedback.kind">
        {{ feedback.text }}
      </div>

      <template v-if="showDebug">
        <div><b>Success streak:</b> {{ successStreak }}</div>
        <div><b>Rule complexity:</b> {{ levelConfig.ruleComplexity }}</div>
        <div><b>Sequence length:</b> {{ levelConfig.sequenceLength }}</div>
        <div><b>Options:</b> {{ levelConfig.optionCount }}</div>
        <div><b>Time limit:</b> {{ levelConfig.timeLimitMs }} ms</div>
      </template>
    </div>

    <div class="sequence-box">
      <div v-if="currentPuzzle" class="sequence">
        <div
          v-for="(item, idx) in currentPuzzle.sequence"
          :key="idx"
          class="sequence-item"
        >
          {{ item }}
        </div>
        <div class="sequence-item missing">?</div>
      </div>
      <div v-else class="placeholder">—</div>
    </div>

    <div class="options" v-if="currentPuzzle">
      <button
        v-for="option in currentPuzzle.options"
        :key="option.id"
        :disabled="phase !== 'running' || answered"
        @click="submitAnswer(option.value)"
      >
        {{ option.value }}
      </button>
    </div>

    <div class="controls">
      <button :disabled="phase === 'running'" @click="start">Start</button>
      <button :disabled="phase !== 'running'" @click="stop">Stop</button>
      <button :disabled="phase !== 'finished'" @click="reset">Reset</button>
    </div>

    <div class="hint">
      Difficulty rises by increasing pattern complexity, distractors, and time pressure.
    </div>

    <div v-if="phase === 'finished'" class="results">
      <h3>Results</h3>
      <ul>
        <li>Correct: {{ summary.correct }}</li>
        <li>Incorrect: {{ summary.incorrect }}</li>
        <li>Timeouts: {{ summary.timeouts }}</li>
        <li>Accuracy: {{ summary.accuracy.toFixed(1) }}%</li>
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

const MODULE_ID = "logic_pattern_reasoning";
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
  startDifficulty: 2,
  fastThresholdMs: 1200,
  slowThresholdMs: 6000,
  targetAccuracyMin: 0.68,
  targetAccuracyMax: 0.86,
  windowSize: 4,
  evaluateEvery: 2,
  scoreIncreaseThreshold: 72,
  scoreDecreaseThreshold: 42
});

const { score, bestScore, lastDelta, awardScore, resetScore } = useGameScoring(MODULE_ID, {
  fastThresholdMs: 1200,
  slowThresholdMs: 6000
});

const { feedback, flashKind, showFeedback, clearFeedback } = useInstantFeedback({
  durationMs: 900
});

const totalRounds = ref(14);

const difficultySettings = [
  { ruleComplexity: 1, sequenceLength: 4, optionCount: 3, timeLimitMs: 9000 },
  { ruleComplexity: 1, sequenceLength: 4, optionCount: 4, timeLimitMs: 8200 },
  { ruleComplexity: 2, sequenceLength: 5, optionCount: 4, timeLimitMs: 7600 },
  { ruleComplexity: 2, sequenceLength: 5, optionCount: 5, timeLimitMs: 7000 },
  { ruleComplexity: 2, sequenceLength: 6, optionCount: 5, timeLimitMs: 6400 },
  { ruleComplexity: 3, sequenceLength: 6, optionCount: 5, timeLimitMs: 5800 },
  { ruleComplexity: 3, sequenceLength: 6, optionCount: 6, timeLimitMs: 5200 },
  { ruleComplexity: 3, sequenceLength: 7, optionCount: 6, timeLimitMs: 4700 },
  { ruleComplexity: 4, sequenceLength: 7, optionCount: 6, timeLimitMs: 4200 },
  { ruleComplexity: 4, sequenceLength: 8, optionCount: 6, timeLimitMs: 3800 }
];

const levelConfig = computed(() => {
  const index = Math.max(0, Math.min(difficultySettings.length - 1, difficulty.value - 1));
  return difficultySettings[index];
});

const symbolPool = ["▲", "■", "●", "◆", "★", "▶", "◀", "✚"];

const currentPuzzle = ref(null);
const shownAtMs = ref(null);
const answered = ref(false);
const answeredAtMs = ref(null);

function nowMs() {
  return performance.now();
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
  return arr;
}

function uniqueDistractors(correctValue, count) {
  const pool = symbolPool.filter(s => s !== correctValue);
  return shuffle(pool).slice(0, count);
}

function buildRuleComplexity1(length) {
  const cycle = shuffle(symbolPool).slice(0, 2);
  const full = [];
  for (let i = 0; i < length + 1; i++) full.push(cycle[i % cycle.length]);
  return { ruleType: "alternation_2", sequence: full.slice(0, length), answer: full[length] };
}

function buildRuleComplexity2(length) {
  const cycle = shuffle(symbolPool).slice(0, 3);
  const full = [];
  for (let i = 0; i < length + 1; i++) full.push(cycle[i % cycle.length]);
  return { ruleType: "alternation_3", sequence: full.slice(0, length), answer: full[length] };
}

function buildRuleComplexity3(length) {
  const block = shuffle(symbolPool).slice(0, 3);
  const pattern = [block[0], block[0], block[1], block[1], block[2], block[2]];
  const full = [];
  for (let i = 0; i < length + 1; i++) full.push(pattern[i % pattern.length]);
  return { ruleType: "double_repeat", sequence: full.slice(0, length), answer: full[length] };
}

function buildRuleComplexity4(length) {
  const cycle = shuffle(symbolPool).slice(0, 4);
  const full = [];
  for (let i = 0; i < length + 1; i++) full.push(cycle[i % cycle.length]);
  return { ruleType: "alternation_4", sequence: full.slice(0, length), answer: full[length] };
}

function generatePuzzle() {
  const complexity = levelConfig.value.ruleComplexity;
  const length = levelConfig.value.sequenceLength;

  let base;
  if (complexity === 1) base = buildRuleComplexity1(length);
  else if (complexity === 2) base = buildRuleComplexity2(length);
  else if (complexity === 3) base = buildRuleComplexity3(length);
  else base = buildRuleComplexity4(length);

  const distractorCount = levelConfig.value.optionCount - 1;
  const options = shuffle([
    { id: 1, value: base.answer },
    ...uniqueDistractors(base.answer, distractorCount).map((value, idx) => ({
      id: idx + 2,
      value
    }))
  ]);

  return { ...base, options };
}

function reset() {
  clearAllTimeouts();
  resetSession();
  resetDifficulty();
  resetScore();
  clearFeedback();

  currentPuzzle.value = null;
  shownAtMs.value = null;
  answered.value = false;
  answeredAtMs.value = null;
}

function stop() {
  clearAllTimeouts();
  currentPuzzle.value = null;
  stopSession();
}

function start() {
  reset();
  startSession();
  nextPatternRound();
}

function finalizeRound(answerValue = null) {
  if (!currentPuzzle.value || shownAtMs.value === null) return;

  const responded = answerValue !== null;
  const timedOut = !responded;
  const correct = responded && answerValue === currentPuzzle.value.answer;
  const rtMs = responded && answeredAtMs.value !== null
    ? Math.max(0, answeredAtMs.value - shownAtMs.value)
    : null;

  const complexityPenalty = !correct ? currentPuzzle.value.ruleType === "alternation_4" ? 0.10 : 0.06 : 0;
  const timeoutPenalty = timedOut ? 0.18 : 0;
  const wrongPenalty = responded && !correct ? 0.14 : 0;
  const totalPenalty = complexityPenalty + timeoutPenalty + wrongPenalty;

  addResponse({
    round: trialIndex.value,
    difficulty: difficulty.value,
    ruleComplexity: levelConfig.value.ruleComplexity,
    sequenceLength: levelConfig.value.sequenceLength,
    optionCount: levelConfig.value.optionCount,
    timeLimitMs: levelConfig.value.timeLimitMs,
    ruleType: currentPuzzle.value.ruleType,
    sequence: currentPuzzle.value.sequence,
    answer: currentPuzzle.value.answer,
    answerValue,
    responded,
    timedOut,
    correct,
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
    correctText: "Správne",
    incorrectText: timedOut ? `Nesprávne - timeout (správne: ${currentPuzzle.value.answer})` : `Nesprávne (správne: ${currentPuzzle.value.answer})`
  });
}

function nextPatternRound() {
  if (phase.value !== "running") return;

  if (trialIndex.value >= totalRounds.value) {
    currentPuzzle.value = null;
    stopSession();
    return;
  }

  nextTrial();
  currentPuzzle.value = generatePuzzle();
  shownAtMs.value = nowMs();
  answered.value = false;
  answeredAtMs.value = null;

  setManagedTimeout(() => {
    if (!answered.value) {
      finalizeRound(null);
      currentPuzzle.value = null;

      setManagedTimeout(() => {
        nextPatternRound();
      }, 700);
    }
  }, levelConfig.value.timeLimitMs);
}

function submitAnswer(answerValue) {
  if (phase.value !== "running") return;
  if (!currentPuzzle.value) return;
  if (answered.value) return;

  answered.value = true;
  answeredAtMs.value = nowMs();

  clearAllTimeouts();
  finalizeRound(answerValue);
  currentPuzzle.value = null;

  setManagedTimeout(() => {
    nextPatternRound();
  }, 700);
}

onBeforeUnmount(() => {
  clearAllTimeouts();
});

const summary = computed(() => {
  const correct = responses.value.filter(r => r.correct).length;
  const incorrect = responses.value.filter(r => !r.correct && !r.timedOut).length;
  const timeouts = responses.value.filter(r => r.timedOut).length;

  const rts = responses.value.map(r => r.rtMs).filter(v => v !== null);
  const avgRTms = rts.length ? rts.reduce((a, b) => a + b, 0) / rts.length : null;

  return {
    correct,
    incorrect,
    timeouts,
    accuracy: responses.value.length ? (correct / responses.value.length) * 100 : 0,
    avgRTms,
    finalDifficulty: difficulty.value
  };
});

const payload = computed(() =>
  buildPayload(summary.value, {
    difficulty: difficulty.value,
    score: score.value,
    bestScore: bestScore.value,
    settings: {
      totalRounds: totalRounds.value,
      ruleComplexity: levelConfig.value.ruleComplexity,
      sequenceLength: levelConfig.value.sequenceLength,
      optionCount: levelConfig.value.optionCount,
      timeLimitMs: levelConfig.value.timeLimitMs,
      adaptive: true,
      localScore: true
    }
  })
);
</script>

<style scoped>
.module {
  max-width: 860px;
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

.sequence-box {
  min-height: 150px;
  border: 1px dashed #ccc;
  border-radius: 12px;
  background: #fafafa;
  display: grid;
  place-items: center;
  margin-bottom: 12px;
  padding: 16px;
}

.sequence {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: center;
}

.sequence-item {
  width: 70px;
  height: 70px;
  border-radius: 12px;
  border: 1px solid #ccc;
  background: white;
  display: grid;
  place-items: center;
  font-size: 28px;
  font-weight: 700;
}

.sequence-item.missing {
  background: #e0f2fe;
  border-color: #7dd3fc;
}

.placeholder {
  font-size: 42px;
  color: #999;
}

.options {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  justify-content: center;
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