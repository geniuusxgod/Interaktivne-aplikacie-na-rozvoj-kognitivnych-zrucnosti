<template>
  <div class="module">
    <h2>Pattern Reasoning</h2>

    <div class="panel">
      <div><b>Kategória:</b> Logické myslenie</div>
      <div><b>Status:</b> {{ phase }}</div>
      <div><b>Trial:</b> {{ trialIndex }} / {{ totalTrials }}</div>
      <div><b>Rule:</b> Choose the symbol that correctly completes the pattern.</div>
    </div>

    <div class="pattern-box">
      <div
        v-for="(item, index) in currentPattern"
        :key="index"
        class="pattern-item"
      >
        {{ item }}
      </div>
    </div>

    <div class="answers">
      <button
        v-for="option in currentOptions"
        :key="option.id"
        :disabled="phase !== 'running' || currentOptions.length === 0 || answered"
        @click="submitAnswer(option)"
      >
        {{ option.value }}
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
        <li>Avg RT: {{ summary.avgRTms === null ? "—" : summary.avgRTms.toFixed(0) + " ms" }}</li>
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

const totalTrials = ref(12);
const stimulusDurationMs = ref(8000);
const isiMs = ref(800);

const currentPattern = ref([]);
const currentOptions = ref([]);
const correctOptionId = ref(null);

const shownAtMs = ref(null);
const answered = ref(false);
const answeredAtMs = ref(null);

function nowMs() {
  return performance.now();
}

function reset() {
  clearAllTimeouts();
  resetSession();

  currentPattern.value = [];
  currentOptions.value = [];
  correctOptionId.value = null;
  shownAtMs.value = null;
  answered.value = false;
  answeredAtMs.value = null;
}

function stop() {
  clearAllTimeouts();
  currentPattern.value = [];
  currentOptions.value = [];
  correctOptionId.value = null;
  stopSession();
}

function start() {
  reset();
  startSession();
  nextPatternTrial();
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}

function generateRule() {
  const rules = [
    {
      type: "alternating-circles",
      pattern: ["●", "○", "●", "○", "?"],
      answer: "●",
      distractors: ["○", "■", "▲"]
    },
    {
      type: "alternating-squares",
      pattern: ["■", "□", "■", "□", "?"],
      answer: "■",
      distractors: ["□", "●", "▲"]
    },
    {
      type: "triple-repeat",
      pattern: ["▲", "▲", "●", "▲", "▲", "?"],
      answer: "●",
      distractors: ["▲", "■", "○"]
    },
    {
      type: "block-repeat",
      pattern: ["●", "●", "○", "●", "●", "?"],
      answer: "○",
      distractors: ["●", "■", "▲"]
    },
    {
      type: "pair-alternation",
      pattern: ["■", "■", "●", "●", "■", "■", "?"],
      answer: "●",
      distractors: ["■", "▲", "○"]
    },
    {
      type: "mirror-repeat",
      pattern: ["▲", "●", "▲", "●", "?"],
      answer: "▲",
      distractors: ["●", "■", "□"]
    }
  ];

  return randomItem(rules);
}

function buildOptions(correctAnswer, distractors) {
  const options = [
    { id: 1, value: correctAnswer, correct: true },
    { id: 2, value: distractors[0], correct: false },
    { id: 3, value: distractors[1], correct: false },
    { id: 4, value: distractors[2], correct: false }
  ];

  return shuffle(options).map((option, index) => ({
    ...option,
    id: index + 1
  }));
}

function finalizeTrial(selectedOption = null) {
  if (shownAtMs.value === null) return;

  const correct = selectedOption ? selectedOption.id === correctOptionId.value : false;
  const rtMs = selectedOption && answeredAtMs.value !== null
    ? Math.max(0, answeredAtMs.value - shownAtMs.value)
    : null;

  addResponse({
    trial: trialIndex.value,
    pattern: [...currentPattern.value],
    selected: selectedOption ? selectedOption.value : null,
    correct,
    rtMs
  });
}

function nextPatternTrial() {
  if (phase.value !== "running") return;

  if (trialIndex.value >= totalTrials.value) {
    currentPattern.value = [];
    currentOptions.value = [];
    correctOptionId.value = null;
    stopSession();
    return;
  }

  nextTrial();

  const rule = generateRule();
  const options = buildOptions(rule.answer, rule.distractors);
  const correctOption = options.find(option => option.correct);

  currentPattern.value = rule.pattern;
  currentOptions.value = options;
  correctOptionId.value = correctOption ? correctOption.id : null;

  shownAtMs.value = nowMs();
  answered.value = false;
  answeredAtMs.value = null;

  setManagedTimeout(() => {
    if (!answered.value) {
      finalizeTrial(null);
      currentPattern.value = [];
      currentOptions.value = [];
      correctOptionId.value = null;

      setManagedTimeout(() => {
        nextPatternTrial();
      }, isiMs.value);
    }
  }, stimulusDurationMs.value);
}

function submitAnswer(option) {
  if (phase.value !== "running") return;
  if (answered.value) return;

  answered.value = true;
  answeredAtMs.value = nowMs();

  clearAllTimeouts();
  finalizeTrial(option);

  currentPattern.value = [];
  currentOptions.value = [];
  correctOptionId.value = null;

  setManagedTimeout(() => {
    nextPatternTrial();
  }, isiMs.value);
}

onBeforeUnmount(() => {
  clearAllTimeouts();
});

const summary = computed(() => {
  const correct = responses.value.filter(r => r.correct).length;
  const incorrect = responses.value.length - correct;

  const rts = responses.value
    .map(r => r.rtMs)
    .filter(v => v !== null);

  return {
    correct,
    incorrect,
    accuracy: responses.value.length
      ? (correct / responses.value.length) * 100
      : 0,
    avgRTms: rts.length
      ? rts.reduce((a, b) => a + b, 0) / rts.length
      : null
  };
});

const payload = computed(() =>
  buildPayload(summary.value, {
    settings: {
      totalTrials: totalTrials.value,
      stimulusDurationMs: stimulusDurationMs.value,
      isiMs: isiMs.value,
      optionCount: 4
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

.pattern-box {
  display: flex;
  gap: 12px;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  min-height: 90px;
  margin: 20px 0;
}

.pattern-item {
  min-width: 52px;
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #ddd;
  border-radius: 12px;
  font-size: 28px;
  background: white;
}

.answers {
  display: flex;
  gap: 10px;
  justify-content: center;
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