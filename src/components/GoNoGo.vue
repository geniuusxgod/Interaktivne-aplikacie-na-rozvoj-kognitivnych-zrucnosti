<template>
  <div class="module">
    <h2>Go / No-Go Task</h2>

    <div class="topbar">
      <div><b>Kategória:</b> Pozornosť</div>
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
      <div><b>Rule:</b> Press only for <u>GO</u> stimulus.</div>

      <template v-if="showDebug">
        <div><b>Success streak:</b> {{ successStreak }}</div>
        <div><b>Stimulus duration:</b> {{ levelConfig.stimulusDurationMs }} ms</div>
        <div><b>ISI:</b> {{ levelConfig.isiMs }} ms</div>
        <div><b>NO-GO ratio:</b> {{ (levelConfig.noGoProbability * 100).toFixed(0) }}%</div>
      </template>
    </div>

    <div class="game-shell" ref="gameShellRef">
      <div class="game-shell-header">
        <div class="game-shell-title-wrap">
          <div class="game-shell-title">Go / No-Go</div>
          <div class="game-shell-subtitle">
            {{ currentStimulus?.type === "go" ? "GO stimulus" : currentStimulus?.type === "no-go" ? "NO-GO stimulus" : "Ready" }}
          </div>
        </div>

        <button class="fullscreen-btn" @click="toggleFullscreen">
          {{ isFullscreen ? "Exit fullscreen" : "Fullscreen" }}
        </button>
      </div>

      <div class="game-shell-body">
        <div class="shell-top-status">
          <div v-if="combo >= 2" class="combo-badge">
            🔥 Combo x{{ combo }} • {{ comboMultiplier.toFixed(1) }}x
          </div>
        </div>

        <transition name="score-pop">
          <div
            v-if="floatingScore"
            class="floating-score"
            :class="{ negative: floatingScore.value < 0 }"
          >
            {{ floatingScore.value >= 0 ? `+${floatingScore.value}` : floatingScore.value }}
          </div>
        </transition>

        <div class="progress">
          <div
            class="progress-fill"
            :style="{ width: `${Math.min(100, (trialIndex / totalTrials) * 100)}%` }"
          ></div>
        </div>

        <div class="stimulusBox">
          <div
            v-if="currentStimulus"
            class="shape"
            :class="[currentStimulus.kind, currentStimulus.shape]"
          ></div>
          <div v-else class="placeholder">—</div>
        </div>

        <div class="controls controls-centered">
          <button class="btn btn-start" :disabled="phase === 'running'" @click="start">Start</button>
          <button class="btn btn-stop" :disabled="phase !== 'running'" @click="stop">Stop</button>
          <button class="btn btn-press" :disabled="phase !== 'running'" @click="submitPress">Press</button>
          <button class="btn btn-reset" :disabled="phase !== 'finished'" @click="reset">Reset</button>
        </div>

        <div class="hint hint-centered">
          You can also press <b>Space</b>.
        </div>
      </div>
    </div>

    <div v-if="phase === 'finished'" class="results">
      <h3>Results</h3>
      <ul>
        <li>Accuracy: {{ summary.accuracy.toFixed(1) }}%</li>
        <li>Hits: {{ summary.hits }}</li>
        <li>Misses: {{ summary.misses }}</li>
        <li>False alarms: {{ summary.falseAlarms }}</li>
        <li>Correct inhibitions: {{ summary.correctInhibitions }}</li>
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

const MODULE_ID = "attention_go_no_go";
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
  fastThresholdMs: 360,
  slowThresholdMs: 950,
  targetAccuracyMin: 0.72,
  targetAccuracyMax: 0.88,
  windowSize: 4,
  evaluateEvery: 2,
  scoreIncreaseThreshold: 72,
  scoreDecreaseThreshold: 42
});

const { score, bestScore, lastDelta, awardScore, resetScore } = useGameScoring(MODULE_ID, {
  fastThresholdMs: 360,
  slowThresholdMs: 950
});

const totalTrials = ref(36);

const difficultySettings = [
  { stimulusDurationMs: 1400, isiMs: 600, noGoProbability: 0.18 },
  { stimulusDurationMs: 1300, isiMs: 580, noGoProbability: 0.22 },
  { stimulusDurationMs: 1200, isiMs: 550, noGoProbability: 0.26 },
  { stimulusDurationMs: 1100, isiMs: 520, noGoProbability: 0.30 },
  { stimulusDurationMs: 1000, isiMs: 480, noGoProbability: 0.34 },
  { stimulusDurationMs: 900, isiMs: 450, noGoProbability: 0.38 },
  { stimulusDurationMs: 820, isiMs: 420, noGoProbability: 0.42 },
  { stimulusDurationMs: 750, isiMs: 390, noGoProbability: 0.46 },
  { stimulusDurationMs: 680, isiMs: 360, noGoProbability: 0.50 },
  { stimulusDurationMs: 620, isiMs: 330, noGoProbability: 0.54 }
];

const levelConfig = computed(() => {
  const index = Math.max(0, Math.min(difficultySettings.length - 1, difficulty.value - 1));
  return difficultySettings[index];
});

const currentStimulus = ref(null);
const currentShownAtMs = ref(null);
const currentAnswered = ref(false);
const currentPressedAtMs = ref(null);

const gameShellRef = ref(null);
const isFullscreen = ref(false);

const combo = ref(0);
const comboMultiplier = ref(1);
const floatingScore = ref(null);

function nowMs() {
  return performance.now();
}

function updateCombo(correct) {
  if (correct) {
    combo.value += 1;
    comboMultiplier.value = 1 + Math.floor(combo.value / 3) * 0.2;
  } else {
    combo.value = 0;
    comboMultiplier.value = 1;
  }
}

function showFloatingScore(delta) {
  floatingScore.value = {
    id: Date.now(),
    value: delta
  };

  setManagedTimeout(() => {
    floatingScore.value = null;
  }, 900);
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await gameShellRef.value?.requestFullscreen();
      isFullscreen.value = true;
    } else {
      await document.exitFullscreen();
      isFullscreen.value = false;
    }
  } catch (error) {
    console.error("Fullscreen error:", error);
  }
}

function handleFullscreenChange() {
  isFullscreen.value = Boolean(document.fullscreenElement);
}

function reset() {
  clearAllTimeouts();
  resetSession();
  resetDifficulty();
  resetScore();

  currentStimulus.value = null;
  currentShownAtMs.value = null;
  currentAnswered.value = false;
  currentPressedAtMs.value = null;

  combo.value = 0;
  comboMultiplier.value = 1;
  floatingScore.value = null;
}

function stop() {
  clearAllTimeouts();
  currentStimulus.value = null;
  stopSession();
}

function start() {
  reset();
  startSession();
  nextGoNoGoTrial();
}

function generateStimulus() {
  const isNoGo = Math.random() < levelConfig.value.noGoProbability;
  if (!isNoGo) {
    return { type: "go", shape: "circle", kind: "green" };
  }
  return { type: "no-go", shape: "square", kind: "red" };
}

function finalizeTrial() {
  if (!currentStimulus.value || currentShownAtMs.value === null) return;

  const isGo = currentStimulus.value.type === "go";
  const userPressed = currentAnswered.value;
  const rtMs = userPressed && currentPressedAtMs.value !== null
    ? Math.max(0, currentPressedAtMs.value - currentShownAtMs.value)
    : null;

  const correct = (isGo && userPressed) || (!isGo && !userPressed);
  const falseAlarm = !isGo && userPressed;
  const lapse = isGo && !userPressed;

  addResponse({
    trial: trialIndex.value,
    stimulusType: currentStimulus.value.type,
    shape: currentStimulus.value.shape,
    color: currentStimulus.value.kind,
    userPressed,
    correct,
    falseAlarm,
    lapse,
    difficulty: difficulty.value,
    stimulusDurationMs: levelConfig.value.stimulusDurationMs,
    isiMs: levelConfig.value.isiMs,
    noGoProbability: levelConfig.value.noGoProbability,
    rtMs
  });

  updateDifficulty({
    correct,
    rtMs: isGo ? rtMs : null,
    falseAlarm,
    lapse,
    penalty: falseAlarm ? 0.28 : lapse ? 0.16 : 0
  });

  const baseDelta = awardScore({
    correct,
    difficulty: difficulty.value,
    rtMs: isGo ? rtMs : null,
    penalty: falseAlarm ? 0.42 : lapse ? 0.24 : 0
  });

  updateCombo(correct);

  const boostedDelta = correct
    ? Math.round(baseDelta * comboMultiplier.value)
    : baseDelta;

  lastDelta.value = boostedDelta;
  showFloatingScore(boostedDelta);
}

function nextGoNoGoTrial() {
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
  currentPressedAtMs.value = null;

  setManagedTimeout(() => {
    finalizeTrial();
    currentStimulus.value = null;

    setManagedTimeout(() => {
      nextGoNoGoTrial();
    }, levelConfig.value.isiMs);
  }, levelConfig.value.stimulusDurationMs);
}

function submitPress() {
  if (phase.value !== "running") return;
  if (!currentStimulus.value) return;
  if (currentAnswered.value) return;

  currentAnswered.value = true;
  currentPressedAtMs.value = nowMs();
}

function onKeydown(e) {
  if (e.code === "Space") {
    e.preventDefault();
    submitPress();
  }
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  document.addEventListener("fullscreenchange", handleFullscreenChange);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
  clearAllTimeouts();
});

const summary = computed(() => {
  let hits = 0;
  let misses = 0;
  let falseAlarms = 0;
  let correctInhibitions = 0;
  const rts = [];

  for (const r of responses.value) {
    if (r.stimulusType === "go" && r.userPressed) hits++;
    else if (r.stimulusType === "go" && !r.userPressed) misses++;
    else if (r.stimulusType === "no-go" && r.userPressed) falseAlarms++;
    else if (r.stimulusType === "no-go" && !r.userPressed) correctInhibitions++;

    if (r.stimulusType === "go" && r.rtMs !== null) rts.push(r.rtMs);
  }

  return {
    hits,
    misses,
    falseAlarms,
    correctInhibitions,
    accuracy: responses.value.length
      ? ((hits + correctInhibitions) / responses.value.length) * 100
      : 0,
    avgRTms: rts.length ? rts.reduce((a, b) => a + b, 0) / rts.length : null,
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
      noGoProbability: levelConfig.value.noGoProbability,
      adaptive: true,
      localScore: true,
      fullscreen: true,
      combo: true,
      scorePopup: true
    }
  })
);
</script>

<style scoped>
.module {
  max-width: 980px;
  margin: 0 auto;
  padding: 16px;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial;
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
  background: white;
}

.game-shell {
  position: relative;
  background: #0f172a;
  color: white;
  border-radius: 24px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
  max-width: 980px;
  margin: 20px auto;
}

.game-shell-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.game-shell-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.game-shell-title {
  font-size: 22px;
  font-weight: 700;
}

.game-shell-subtitle {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
}

.fullscreen-btn {
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.08);
  color: white;
  cursor: pointer;
}

.fullscreen-btn:hover {
  background: rgba(255, 255, 255, 0.14);
}

.game-shell-body {
  padding: 24px;
}

.shell-top-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  margin-bottom: 8px;
}

.combo-badge {
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.14);
  color: #fcd34d;
  border: 1px solid rgba(245, 158, 11, 0.3);
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.2px;
}

.floating-score {
  position: absolute;
  top: 98px;
  right: 28px;
  z-index: 5;
  padding: 10px 14px;
  border-radius: 14px;
  background: rgba(34, 197, 94, 0.18);
  color: #bbf7d0;
  border: 1px solid rgba(34, 197, 94, 0.35);
  font-weight: 800;
  font-size: 18px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
}

.floating-score.negative {
  background: rgba(239, 68, 68, 0.18);
  color: #fecaca;
  border: 1px solid rgba(239, 68, 68, 0.35);
}

.score-pop-enter-active,
.score-pop-leave-active {
  transition: all 0.35s ease;
}

.score-pop-enter-from,
.score-pop-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.96);
}

.progress {
  height: 8px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 18px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #f59e0b, #fb923c);
  transition: width 0.3s ease;
}

.stimulusBox {
  height: 320px;
  border: 1px dashed rgba(255, 255, 255, 0.15);
  border-radius: 20px;
  display: grid;
  place-items: center;
  margin: 16px 0;
  background: rgba(255, 255, 255, 0.02);
}

.placeholder {
  font-size: 48px;
  color: rgba(255, 255, 255, 0.4);
}

.shape {
  width: 160px;
  height: 160px;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
}

.circle {
  border-radius: 999px;
}

.square {
  border-radius: 22px;
}

.green {
  background: #22c55e;
  box-shadow: 0 0 30px rgba(34, 197, 94, 0.7);
}

.red {
  background: #ef4444;
  box-shadow: 0 0 30px rgba(239, 68, 68, 0.7);
}

.controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.controls-centered {
  justify-content: center;
}

button {
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid #ccc;
  cursor: pointer;
  background: white;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.hint {
  margin-top: 10px;
  color: #555;
}

.hint-centered {
  text-align: center;
  color: rgba(255, 255, 255, 0.75);
}

.results {
  margin-top: 18px;
  border-top: 1px solid #eee;
  padding-top: 12px;
}

.pre {
  background: #0b1020;
  color: #d8e1ff;
  padding: 12px;
  border-radius: 10px;
  overflow: auto;
}
/* БАЗА */
.btn {
  padding: 12px 18px;
  border-radius: 14px;
  border: none;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.18s ease;
  box-shadow: 0 6px 18px rgba(0,0,0,0.15);
}

.btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.05);
}

.btn:active {
  transform: scale(0.96);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.btn-start {
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: white;
}

.btn-stop {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: white;
}

.btn-reset {
  background: linear-gradient(135deg, #64748b, #475569);
  color: white;
}
.btn-press {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: white;
  font-size: 16px;
  padding: 14px 22px;
  box-shadow: 0 10px 26px rgba(37, 99, 235, 0.35);
}

.btn-press:hover {
  transform: scale(1.05);
}

.btn-press:active {
  transform: scale(0.92);
}

.game-shell:fullscreen {
  max-width: none;
  width: 100vw;
  height: 100vh;
  border-radius: 0;
  margin: 0;
  background: #020617;
}

.game-shell:fullscreen .game-shell-body {
  height: calc(100vh - 73px);
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: center;
  overflow-y: auto;
  padding: 24px 20px 28px;
  gap: 10px;
}

.game-shell:fullscreen .stimulusBox {
  width: 100%;
  max-width: 900px;

  height: 420px;

  display: flex;
  align-items: center;
  justify-content: center;

  margin: 0 auto;
}

.game-shell:fullscreen .shape {
  width: 220px;
  height: 220px;
}

.game-shell:fullscreen .game-shell-title {
  font-size: 26px;
}

.game-shell:fullscreen .controls button,
.game-shell:fullscreen .fullscreen-btn {
  font-size: 16px;
  padding: 12px 18px;
}

.game-shell:fullscreen .floating-score {
  top: 110px;
  right: 34px;
  font-size: 20px;
  padding: 12px 16px;
}

.game-shell:fullscreen .combo-badge {
  font-size: 15px;
}

.btn {
  padding: 12px 18px;
  border-radius: 14px;
  border: none;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.18s ease;
  box-shadow: 0 6px 18px rgba(0,0,0,0.15);
}

.btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.05);
}

.btn:active {
  transform: scale(0.96);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.btn-start {
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: white;
}

.btn-stop {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: white;
}

.btn-reset {
  background: linear-gradient(135deg, #64748b, #475569);
  color: white;
}

.btn-press {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: white;
  font-size: 16px;
  padding: 14px 22px;
  box-shadow: 0 10px 26px rgba(37, 99, 235, 0.35);
}

.btn-press:hover {
  transform: scale(1.05);
}

.btn-press:active {
  transform: scale(0.92);
}
</style>