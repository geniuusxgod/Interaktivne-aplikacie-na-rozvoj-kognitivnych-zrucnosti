<template>
  <div class="module">
    <h2>Digit Span</h2>

    <div class="panel">
      <div><b>Kategória:</b> Pamäť</div>
      <div><b>Status:</b> {{ phase }}</div>
      <div><b>Mode:</b> {{ modeLabel }}</div>
      <div><b>Obtiažnosť:</b> {{ difficultyLabel }}</div>
      <div><b>Success streak:</b> {{ successStreak }}</div>
      <div><b>Span length:</b> {{ levelConfig.spanLength }}</div>
      <div><b>Digit duration:</b> {{ levelConfig.digitDurationMs }} ms</div>
      <div><b>Gap:</b> {{ levelConfig.gapMs }} ms</div>
      <div><b>Round:</b> {{ trialIndex }} / {{ totalRounds }}</div>

      <div class="stimulusBox" v-if="phase === 'showing'">
        <div class="stimulus">{{ displayDigit }}</div>
        <div class="subhint">Memorize digits…</div>
      </div>

      <div class="stimulusBox" v-else>
        <div class="stimulus">{{ phase === 'idle' ? "—" : "Ready" }}</div>
        <div class="subhint">
          {{ phase === 'answering' ? "Type the sequence and submit." : "Press Start to begin." }}
        </div>
      </div>
    </div>

    <div class="controls">
      <label class="select">
        Mode:
        <select v-model="mode" :disabled="phase !== 'idle' && phase !== 'finished'">
          <option value="forward">Forward</option>
          <option value="backward">Backward</option>
        </select>
      </label>

      <button :disabled="phase !== 'idle' && phase !== 'finished'" @click="start">Start</button>
      <button :disabled="phase === 'idle'" @click="stop">Stop</button>
      <button :disabled="phase !== 'finished'" @click="reset">Reset</button>
    </div>

    <div class="answer" v-if="phase === 'answering'">
      <div class="answerRow">
        <input
          v-model="answer"
          class="input"
          placeholder="Enter digits (e.g. 49271)"
          inputmode="numeric"
          autocomplete="off"
          @keydown.enter.prevent="submitAnswer"
        />
        <button @click="submitAnswer">Submit</button>
      </div>
      <div class="hint">Tip: write digits without spaces.</div>
    </div>

    <div v-if="lastFeedback" class="feedback" :class="lastFeedback.kind">
      {{ lastFeedback.text }}
    </div>

    <div v-if="phase === 'finished'" class="results">
      <h3>Results</h3>
      <ul>
        <li>Max span reached: {{ summary.maxSpanReached }}</li>
        <li>Accuracy: {{ summary.accuracy.toFixed(1) }}%</li>
        <li>Correct rounds: {{ summary.correctRounds }} / {{ summary.totalRounds }}</li>
        <li>Avg answer time: {{ summary.avgAnswerTimeMs === null ? "—" : summary.avgAnswerTimeMs.toFixed(0) + " ms" }}</li>
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

const MODULE_ID = "memory_digit_span";
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
  fastThresholdMs: 2200,
  slowThresholdMs: 9000,
  targetAccuracyMin: 0.72,
  targetAccuracyMax: 0.92,
  windowSize: 4,
  evaluateEvery: 2,
  scoreIncreaseThreshold: 78,
  scoreDecreaseThreshold: 48,
  maxPendingPenalty: 2
});

const mode = ref("forward");
const totalRounds = ref(10);

const difficultySettings = [
  { spanLength: 3, digitDurationMs: 900, gapMs: 350 },
  { spanLength: 4, digitDurationMs: 850, gapMs: 320 },
  { spanLength: 4, digitDurationMs: 760, gapMs: 300 },
  { spanLength: 5, digitDurationMs: 720, gapMs: 280 },
  { spanLength: 5, digitDurationMs: 650, gapMs: 260 },
  { spanLength: 6, digitDurationMs: 620, gapMs: 240 },
  { spanLength: 6, digitDurationMs: 560, gapMs: 220 },
  { spanLength: 7, digitDurationMs: 520, gapMs: 200 },
  { spanLength: 7, digitDurationMs: 470, gapMs: 180 },
  { spanLength: 8, digitDurationMs: 430, gapMs: 160 }
];

const levelConfig = computed(() => {
  const index = Math.max(0, Math.min(difficultySettings.length - 1, difficulty.value - 1));
  return difficultySettings[index];
});

const currentSequence = ref([]);
const displayDigit = ref("");
const answer = ref("");

const answerShownAtMs = ref(null);
const answeredAtMs = ref(null);

const lastFeedback = ref(null);

function nowMs() {
  return performance.now();
}

function reset() {
  clearAllTimeouts();
  resetSession();
  resetDifficulty();

  currentSequence.value = [];
  displayDigit.value = "";
  answer.value = "";
  answerShownAtMs.value = null;
  answeredAtMs.value = null;
  lastFeedback.value = null;
}

function stop() {
  clearAllTimeouts();
  displayDigit.value = "";
  stopSession();
}

function start() {
  reset();
  startSession();
  nextDigitSpanRound();
}

function randomDigit() {
  return String(Math.floor(Math.random() * 10));
}

function generateSequence(len) {
  const seq = [];
  for (let i = 0; i < len; i++) {
    seq.push(randomDigit());
  }
  return seq;
}

function expectedAnswer(seq) {
  return mode.value === "forward"
    ? seq.join("")
    : [...seq].reverse().join("");
}

const modeLabel = computed(() => (mode.value === "forward" ? "Forward" : "Backward"));

function nextDigitSpanRound() {
  if (trialIndex.value >= totalRounds.value) {
    stopSession();
    return;
  }

  lastFeedback.value = null;
  answer.value = "";
  displayDigit.value = "";

  nextTrial();
  currentSequence.value = generateSequence(levelConfig.value.spanLength);

  phase.value = "showing";

  let i = 0;

  function showNext() {
    if (phase.value !== "showing") return;

    if (i >= currentSequence.value.length) {
      displayDigit.value = "";
      phase.value = "answering";
      answerShownAtMs.value = nowMs();
      return;
    }

    displayDigit.value = currentSequence.value[i];
    i += 1;

    setManagedTimeout(() => {
      displayDigit.value = "";
      setManagedTimeout(showNext, levelConfig.value.gapMs);
    }, levelConfig.value.digitDurationMs);
  }

  showNext();
}

function submitAnswer() {
  if (phase.value !== "answering") return;

  answeredAtMs.value = nowMs();

  const given = (answer.value || "").replace(/\s+/g, "");
  const expected = expectedAnswer(currentSequence.value);

  const correct = given === expected;
  const rtMs = answerShownAtMs.value !== null
    ? Math.max(0, answeredAtMs.value - answerShownAtMs.value)
    : null;

  const charsCorrect = given.length === expected.length
    ? [...given].filter((digit, idx) => digit === expected[idx]).length
    : [...given].filter((digit, idx) => digit === expected[idx]).length;

  const partialAccuracy = expected.length
    ? charsCorrect / expected.length
    : 0;

  addResponse({
    round: trialIndex.value,
    mode: mode.value,
    difficulty: difficulty.value,
    span: levelConfig.value.spanLength,
    digitDurationMs: levelConfig.value.digitDurationMs,
    gapMs: levelConfig.value.gapMs,
    sequence: currentSequence.value.join(""),
    expected,
    given,
    correct,
    partialAccuracy,
    answerTimeMs: rtMs,
    timestampMs: Date.now()
  });

  lastFeedback.value = correct
    ? { kind: "ok", text: "Correct" }
    : { kind: "bad", text: `Incorrect (expected: ${expected})` };

  updateDifficulty({
    aggregate: true,
    accuracy: correct ? 1 : partialAccuracy,
    avgRTms: rtMs,
    penalty: correct ? 0 : 0.14,
    sampleCount: 1
  });

  phase.value = "showing";
  setManagedTimeout(() => {
    nextDigitSpanRound();
  }, 700);
}

onBeforeUnmount(() => {
  clearAllTimeouts();
});

const summary = computed(() => {
  const recs = responses.value;
  const total = recs.length;
  const correctRounds = recs.filter(r => r.correct).length;
  const accuracy = total ? (correctRounds / total) * 100 : 0;

  let maxSpanReached = 0;
  for (const r of recs) {
    if (r.correct && r.span > maxSpanReached) {
      maxSpanReached = r.span;
    }
  }

  const answerTimes = recs
    .map(r => r.answerTimeMs)
    .filter(v => v !== null && v !== undefined);

  const avgAnswerTimeMs = answerTimes.length
    ? answerTimes.reduce((a, b) => a + b, 0) / answerTimes.length
    : null;

  return {
    maxSpanReached,
    accuracy,
    correctRounds,
    totalRounds: total,
    avgAnswerTimeMs,
    finalDifficulty: difficulty.value
  };
});

const payload = computed(() =>
  buildPayload(summary.value, {
    difficulty: difficulty.value,
    settings: {
      totalRounds: totalRounds.value,
      mode: mode.value,
      spanLength: levelConfig.value.spanLength,
      digitDurationMs: levelConfig.value.digitDurationMs,
      gapMs: levelConfig.value.gapMs,
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
  margin-top: 12px;
  border: 1px dashed #ccc;
  border-radius: 12px;
  min-height: 130px;
  display: grid;
  place-items: center;
  background: #fafafa;
}

.stimulus {
  font-size: 42px;
  font-weight: 700;
}

.subhint {
  color: #666;
  margin-top: 6px;
}

.controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 12px;
}

.select {
  display: flex;
  gap: 8px;
  align-items: center;
}

.answer {
  margin: 14px 0;
}

.answerRow {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.input {
  min-width: 260px;
  padding: 10px 12px;
  border: 1px solid #ccc;
  border-radius: 10px;
}

button,
select {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid #ccc;
  background: white;
}

.feedback {
  margin-top: 10px;
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
  color: #666;
  margin-top: 6px;
}

.results {
  margin-top: 18px;
  border-top: 1px solid #eee;
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