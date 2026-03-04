<template>
  <div class="ds">
    <h2>Digit Span</h2>

    <div class="panel">
      <div><b>Kategória:</b> Pamäť</div>
      <div><b>Status:</b> {{ phase }}</div>
      <div><b>Mode:</b> {{ modeLabel }}</div>
      <div><b>Level (span):</b> {{ spanLength }}</div>
      <div><b>Round:</b> {{ roundIndex }} / {{ totalRounds }}</div>

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
      <div class="hint">
        Tip: you can type without spaces. Backspace works.
      </div>
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
        <li>Avg answer time: {{ summary.avgAnswerTimeMs === null ? "—" : (summary.avgAnswerTimeMs.toFixed(0) + " ms") }}</li>
      </ul>

      <details>
        <summary>Payload (for integration)</summary>
        <pre class="pre">{{ payload }}</pre>
      </details>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from "vue";

// --- Metadata ---
const MODULE_ID = "memory_digit_span";
const CATEGORY = "pamat"; // pamat | vnimanie | pozornost | logicke_myslenie

// --- Phases ---
// idle -> showing (digits one by one) -> answering -> feedback -> (next round) ... -> finished
const phase = ref("idle"); // idle | showing | answering | finished

// --- Settings ---
const mode = ref("forward"); // forward | backward
const totalRounds = ref(10);

// Digit presentation timing
const digitDurationMs = ref(650);
const gapMs = ref(250);

// --- Round state ---
const roundIndex = ref(0);
const spanLength = ref(3); // starts at 3 digits, grows with correct answers
const currentSequence = ref([]); // array of digits as strings
const displayDigit = ref(""); // currently displayed digit
const answer = ref("");

const shownAtMs = ref(null);
const answeredAtMs = ref(null);

// responses: each round record
const responses = ref([]);

// feedback
const lastFeedback = ref(null); // { kind: "ok"|"bad", text: string }

let showTimer = null;

function nowMs() {
  return performance.now();
}

function clearTimer() {
  if (showTimer !== null) {
    window.clearTimeout(showTimer);
    showTimer = null;
  }
}

function reset() {
  clearTimer();
  phase.value = "idle";
  roundIndex.value = 0;
  spanLength.value = 3;
  currentSequence.value = [];
  displayDigit.value = "";
  answer.value = "";
  shownAtMs.value = null;
  answeredAtMs.value = null;
  responses.value = [];
  lastFeedback.value = null;
}

function stop() {
  clearTimer();
  phase.value = "finished";
  displayDigit.value = "";
}

function start() {
  reset();
  nextRound();
}

function randomDigit() {
  return String(Math.floor(Math.random() * 10));
}

function generateSequence(len) {
  // allow repeats (common in digit span)
  const seq = [];
  for (let i = 0; i < len; i++) seq.push(randomDigit());
  return seq;
}

function expectedAnswer(seq) {
  if (mode.value === "forward") return seq.join("");
  return [...seq].reverse().join("");
}

const modeLabel = computed(() => (mode.value === "forward" ? "Forward" : "Backward"));

function nextRound() {
  if (roundIndex.value >= totalRounds.value) {
    phase.value = "finished";
    return;
  }

  lastFeedback.value = null;
  answer.value = "";
  displayDigit.value = "";

  roundIndex.value += 1;
  currentSequence.value = generateSequence(spanLength.value);

  phase.value = "showing";
  shownAtMs.value = nowMs();

  // show digits one by one
  let i = 0;
  const showNext = () => {
    if (phase.value !== "showing") return;

    if (i >= currentSequence.value.length) {
      // finished showing, go to answering
      displayDigit.value = "";
      phase.value = "answering";
      // mark "answer start" time from now (not from showing start)
      shownAtMs.value = nowMs();
      return;
    }

    displayDigit.value = currentSequence.value[i];
    i++;

    showTimer = window.setTimeout(() => {
      displayDigit.value = "";
      showTimer = window.setTimeout(showNext, gapMs.value);
    }, digitDurationMs.value);
  };

  showNext();
}

function submitAnswer() {
  if (phase.value !== "answering") return;

  answeredAtMs.value = nowMs();

  const given = (answer.value || "").replace(/\s+/g, "");
  const expected = expectedAnswer(currentSequence.value);
  const correct = given === expected;

  const rtMs = shownAtMs.value !== null ? Math.max(0, answeredAtMs.value - shownAtMs.value) : null;

  responses.value.push({
    round: roundIndex.value,
    mode: mode.value,
    span: spanLength.value,
    sequence: currentSequence.value.join(""),
    expected,
    given,
    correct,
    answerTimeMs: rtMs,
    timestampMs: Date.now()
  });

  lastFeedback.value = correct
    ? { kind: "ok", text: "Correct ✅" }
    : { kind: "bad", text: `Incorrect ❌ (expected: ${expected})` };

  // adaptive span progression (simple, standard)
  // correct -> increase span; wrong -> keep or decrease slightly (safe MVP choice: keep)
  if (correct) spanLength.value += 1;

  // short delay then next round
  phase.value = "showing"; // temporary to prevent double submit
  clearTimer();
  showTimer = window.setTimeout(() => {
    nextRound();
  }, 700);
}

onBeforeUnmount(() => {
  clearTimer();
});

// --- Metrics ---
const summary = computed(() => {
  const recs = responses.value;
  const total = recs.length;
  const correctRounds = recs.filter(r => r.correct).length;
  const accuracy = total ? (correctRounds / total) * 100 : 0;

  // max span reached = max span where correct
  let maxSpanReached = 0;
  for (const r of recs) {
    if (r.correct) maxSpanReached = Math.max(maxSpanReached, r.span);
  }

  const times = recs.map(r => r.answerTimeMs).filter(t => typeof t === "number");
  const avgAnswerTimeMs = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;

  return { totalRounds: total, correctRounds, accuracy, maxSpanReached, avgAnswerTimeMs };
});

// --- Payload for integration ---
const payload = computed(() => {
  return {
    module: MODULE_ID,
    category: CATEGORY,
    version: "1.0",
    mode: mode.value,
    settings: {
      totalRounds: totalRounds.value,
      digitDurationMs: digitDurationMs.value,
      gapMs: gapMs.value,
      startSpan: 3
    },
    summary: summary.value,
    responses: responses.value, // можно потом убрать если нужно меньше данных
    timestamp_iso: new Date().toISOString()
  };
});
</script>

<style scoped>
.ds { max-width: 720px; margin: 0 auto; padding: 16px; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; }
.panel { border: 1px solid #ddd; border-radius: 12px; padding: 12px; margin: 12px 0; }
.stimulusBox { margin-top: 10px; padding: 14px; border: 1px dashed #ddd; border-radius: 12px; text-align: center; }
.stimulus { font-size: 44px; min-height: 56px; display: flex; align-items: center; justify-content: center; }
.subhint { opacity: 0.75; margin-top: 6px; }
.controls { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin: 12px 0; }
.select { display: inline-flex; gap: 6px; align-items: center; }
.answer { border: 1px solid #eee; border-radius: 12px; padding: 12px; }
.answerRow { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.input { padding: 8px 10px; border-radius: 10px; border: 1px solid #ccc; min-width: 220px; }
button { padding: 8px 12px; border-radius: 10px; border: 1px solid #ccc; background: #fff; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.hint { margin-top: 8px; opacity: 0.8; }
.feedback { margin-top: 10px; padding: 10px 12px; border-radius: 12px; border: 1px solid #eee; }
.feedback.ok { background: #f0fdf4; }
.feedback.bad { background: #fef2f2; }
.results { border-top: 1px solid #eee; margin-top: 16px; padding-top: 12px; }
.pre { white-space: pre-wrap; font-size: 12px; background: #fafafa; padding: 12px; border-radius: 12px; border: 1px solid #eee; }
</style>