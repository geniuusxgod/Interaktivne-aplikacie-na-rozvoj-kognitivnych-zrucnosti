<template>
  <div class="nback">
    <h2>Memory N-Back (MVP)</h2>

    <div class="panel">
      <div><b>Status:</b> {{ phase }}</div>
      <div><b>N:</b> {{ levelN }}</div>
      <div><b>Trial:</b> {{ trialIndex }} / {{ totalTrials }}</div>
      <div><b>Stimulus:</b> <span class="stimulus">{{ currentStimulus ?? "—" }}</span></div>
      <div class="hint">Press <b>Space</b> or click <b>Match</b> when current stimulus matches N-back.</div>
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
        <li>Avg RT: {{ summary.avgRTms === null ? "—" : (summary.avgRTms.toFixed(0) + " ms") }}</li>
      </ul>

      <details>
        <summary>Raw responses (debug)</summary>
        <pre class="pre">{{ responses }}</pre>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, reactive, ref, computed } from "vue";

type Phase = "idle" | "running" | "finished";

type TrialRecord = {
  trial: number;
  stimulus: string;
  n: number;
  isTarget: boolean;
  userPressed: boolean;
  correct: boolean;
  rtMs: number | null;
  shownAtMs: number;
  respondedAtMs: number | null;
};

const phase = ref<Phase>("idle");

const levelN = ref<number>(1);
const totalTrials = ref<number>(30);

const stimulusDurationMs = ref<number>(900);
const isiMs = ref<number>(600);

const stimulusSet = ["A", "B", "C", "D", "E", "F", "G", "H"];

const trialIndex = ref<number>(0); // 0..totalTrials
const currentStimulus = ref<string | null>(null);
const sequence = ref<string[]>([]);

const responses = ref<TrialRecord[]>([]);

const currentTrialShownAtMs = ref<number | null>(null);
const currentTrialResponded = ref<boolean>(false);
const currentTrialResponseAtMs = ref<number | null>(null);

let stimTimer: number | null = null;
let isiTimer: number | null = null;

function nowMs(): number {
  return performance.now();
}

function randomStimulus(): string {
  const idx = Math.floor(Math.random() * stimulusSet.length);
  return stimulusSet[idx];
}

function computeIsTarget(stimulus: string, trialNumber1Based: number, n: number): boolean {
  // trialNumber1Based: 1..totalTrials
  const idx = trialNumber1Based - 1; // index in sequence
  const backIdx = idx - n;
  if (backIdx < 0) return false;
  return sequence.value[backIdx] === stimulus;
}

function clearTimers() {
  if (stimTimer !== null) {
    window.clearTimeout(stimTimer);
    stimTimer = null;
  }
  if (isiTimer !== null) {
    window.clearTimeout(isiTimer);
    isiTimer = null;
  }
}

function reset() {
  clearTimers();
  phase.value = "idle";
  trialIndex.value = 0;
  currentStimulus.value = null;
  sequence.value = [];
  responses.value = [];
  currentTrialShownAtMs.value = null;
  currentTrialResponded.value = false;
  currentTrialResponseAtMs.value = null;
}

function stop() {
  if (phase.value !== "running") return;
  clearTimers();
  // If we stop mid-trial, finalize as finished without forcing correctness.
  phase.value = "finished";
}

function start() {
  reset();
  phase.value = "running";
  nextTrial();
}

function finalizeTrial(trialNumber1Based: number) {
  const stimulus = currentStimulus.value;
  const shownAt = currentTrialShownAtMs.value;

  if (stimulus === null || shownAt === null) return;

  const isTarget = computeIsTarget(stimulus, trialNumber1Based, levelN.value);
  const userPressed = currentTrialResponded.value;
  const correct = (isTarget && userPressed) || (!isTarget && !userPressed);

  const respondedAt = currentTrialResponseAtMs.value;
  const rtMs = userPressed && respondedAt !== null ? Math.max(0, respondedAt - shownAt) : null;

  responses.value.push({
    trial: trialNumber1Based,
    stimulus,
    n: levelN.value,
    isTarget,
    userPressed,
    correct,
    rtMs,
    shownAtMs: shownAt,
    respondedAtMs: respondedAt,
  });
}

function nextTrial() {
  if (phase.value !== "running") return;

  if (trialIndex.value >= totalTrials.value) {
    // finished
    currentStimulus.value = null;
    phase.value = "finished";
    clearTimers();
    return;
  }

  // Start new trial
  trialIndex.value += 1;
  const stim = randomStimulus();
  currentStimulus.value = stim;
  sequence.value.push(stim);

  currentTrialShownAtMs.value = nowMs();
  currentTrialResponded.value = false;
  currentTrialResponseAtMs.value = null;

  // After stimulusDuration -> finalize trial and hide stimulus, then ISI, then next trial
  stimTimer = window.setTimeout(() => {
    finalizeTrial(trialIndex.value);
    currentStimulus.value = null;

    isiTimer = window.setTimeout(() => {
      nextTrial();
    }, isiMs.value);
  }, stimulusDurationMs.value);
}

function registerResponse() {
  if (phase.value !== "running") return;
  // Allow only one response per trial
  if (currentTrialResponded.value) return;
  if (currentTrialShownAtMs.value === null) return;

  currentTrialResponded.value = true;
  currentTrialResponseAtMs.value = nowMs();
}

function onKeydown(e: KeyboardEvent) {
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
  clearTimers();
});

const summary = computed(() => {
  const recs = responses.value;
  let hits = 0;
  let misses = 0;
  let falseAlarms = 0;
  let correctRejections = 0;

  const rts: number[] = [];

  for (const r of recs) {
    if (r.isTarget && r.userPressed) hits++;
    else if (r.isTarget && !r.userPressed) misses++;
    else if (!r.isTarget && r.userPressed) falseAlarms++;
    else if (!r.isTarget && !r.userPressed) correctRejections++;

    if (r.rtMs !== null) rts.push(r.rtMs);
  }

  const correct = recs.filter(r => r.correct).length;
  const accuracy = recs.length ? (correct / recs.length) * 100 : 0;

  const avgRTms = rts.length ? rts.reduce((a, b) => a + b, 0) / rts.length : null;

  return { hits, misses, falseAlarms, correctRejections, accuracy, avgRTms };
});
</script>

<style scoped>
.nback { max-width: 720px; margin: 0 auto; padding: 16px; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; }
.panel { border: 1px solid #ddd; border-radius: 12px; padding: 12px; margin: 12px 0; }
.stimulus { font-size: 28px; display: inline-block; min-width: 24px; }
.hint { margin-top: 8px; opacity: 0.8; }
.controls { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0; }
button { padding: 8px 12px; border-radius: 10px; border: 1px solid #ccc; background: #fff; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.results { border-top: 1px solid #eee; margin-top: 16px; padding-top: 12px; }
.pre { white-space: pre-wrap; font-size: 12px; background: #fafafa; padding: 12px; border-radius: 12px; border: 1px solid #eee; }
</style>