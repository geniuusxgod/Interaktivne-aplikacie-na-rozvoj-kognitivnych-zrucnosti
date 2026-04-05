<template>
  <div class="module">
    <h2>Task Switching</h2>

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
      <div><b>Rule:</b></div>
      <div>Blue frame → choose <b>color</b></div>
      <div>Green frame → choose <b>shape</b></div>

      <template v-if="showDebug">
        <div><b>Success streak:</b> {{ successStreak }}</div>
        <div><b>Stimulus duration:</b> {{ levelConfig.stimulusDurationMs }} ms</div>
        <div><b>ISI:</b> {{ levelConfig.isiMs }} ms</div>
        <div><b>Switch probability:</b> {{ (levelConfig.switchProbability * 100).toFixed(0) }}%</div>
      </template>
    </div>

    <div class="game-shell" ref="gameShellRef">
      <div class="game-shell-header">
        <div class="game-shell-title-wrap">
          <div class="game-shell-title">Task Switching</div>
          <div class="game-shell-subtitle">
            {{
              currentStimulus
                ? currentStimulus.rule === "color"
                  ? "Choose the color"
                  : "Choose the shape"
                : phase === "running"
                  ? "Wait for the next stimulus"
                  : "Ready"
            }}
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

        <div
          class="stimulus-box"
          :class="currentStimulus ? currentStimulus.rule : ''"
        >
          <div v-if="currentStimulus" class="stimulus-content">
            <div class="stimulus-shape" :class="[currentStimulus.shape, currentStimulus.color]"></div>

            <div class="stimulus-meta">
              <div><b>Rule:</b> {{ currentStimulus.rule === 'color' ? 'Choose color' : 'Choose shape' }}</div>
              <div><b>Stimulus:</b> {{ currentStimulus.color }} {{ currentStimulus.shape }}</div>
              <div><b>Trial type:</b> {{ currentStimulus.isSwitchTrial ? 'Switch' : 'Repeat' }}</div>
            </div>
          </div>

          <div v-else class="placeholder">—</div>
        </div>

        <div class="answers">
          <button
            v-for="option in currentOptions"
            :key="option.key"
            :disabled="phase !== 'running' || !currentStimulus || answered"
            @click="submitAnswer(option.key)"
          >
            {{ option.label }}
          </button>
        </div>

        <div class="controls controls-centered">
          <button class="btn btn-start" :disabled="phase === 'running'" @click="start">Start</button>
          <button class="btn btn-stop" :disabled="phase !== 'running'" @click="stop">Stop</button>
          <button class="btn btn-reset" :disabled="phase !== 'finished'" @click="reset">Reset</button>
        </div>

        <div class="hint hint-centered">
          Goal: react quickly and correctly, especially on switch trials.
        </div>
      </div>
    </div>

    <div v-if="phase === 'finished'" class="results">
      <h3>Results</h3>
      <ul>
        <li>Correct: {{ summary.correct }}</li>
        <li>Incorrect: {{ summary.incorrect }}</li>
        <li>Timeouts: {{ summary.timeouts }}</li>
        <li>Accuracy: {{ summary.accuracy.toFixed(1) }}%</li>
        <li>Switch accuracy: {{ summary.switchAccuracy.toFixed(1) }}%</li>
        <li>Repeat accuracy: {{ summary.repeatAccuracy.toFixed(1) }}%</li>
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

const MODULE_ID = "attention_task_switching";
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
  fastThresholdMs: 820,
  slowThresholdMs: 2200,
  targetAccuracyMin: 0.72,
  targetAccuracyMax: 0.88,
  windowSize: 4,
  evaluateEvery: 2,
  scoreIncreaseThreshold: 72,
  scoreDecreaseThreshold: 42
});

const { score, bestScore, lastDelta, awardScore, resetScore } = useGameScoring(MODULE_ID, {
  fastThresholdMs: 820,
  slowThresholdMs: 2200
});

const totalTrials = ref(24);

const difficultySettings = [
  { stimulusDurationMs: 3000, isiMs: 560, switchProbability: 0.28 },
  { stimulusDurationMs: 2700, isiMs: 520, switchProbability: 0.34 },
  { stimulusDurationMs: 2400, isiMs: 480, switchProbability: 0.40 },
  { stimulusDurationMs: 2150, isiMs: 450, switchProbability: 0.46 },
  { stimulusDurationMs: 1900, isiMs: 420, switchProbability: 0.52 },
  { stimulusDurationMs: 1700, isiMs: 390, switchProbability: 0.58 },
  { stimulusDurationMs: 1500, isiMs: 360, switchProbability: 0.64 },
  { stimulusDurationMs: 1320, isiMs: 330, switchProbability: 0.70 },
  { stimulusDurationMs: 1160, isiMs: 300, switchProbability: 0.76 },
  { stimulusDurationMs: 1000, isiMs: 270, switchProbability: 0.82 }
];

const levelConfig = computed(() => {
  const index = Math.max(0, Math.min(difficultySettings.length - 1, difficulty.value - 1));
  return difficultySettings[index];
});

const colors = ["red", "blue"];
const shapes = ["circle", "square"];

const currentStimulus = ref(null);
const currentOptions = ref([]);
const previousRule = ref(null);

const shownAtMs = ref(null);
const answered = ref(false);
const answeredAtMs = ref(null);

const combo = ref(0);
const comboMultiplier = computed(() => 1 + combo.value * 0.1);
const floatingScore = ref(null);

const gameShellRef = ref(null);
const isFullscreen = ref(false);

function nowMs() {
  return performance.now();
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function updateCombo(correct) {
  combo.value = correct ? combo.value + 1 : 0;
}

function showFloatingScore(value) {
  floatingScore.value = { value };

  setManagedTimeout(() => {
    floatingScore.value = null;
  }, 650);
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) {
    await gameShellRef.value?.requestFullscreen();
  } else {
    await document.exitFullscreen();
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
  currentOptions.value = [];
  previousRule.value = null;
  shownAtMs.value = null;
  answered.value = false;
  answeredAtMs.value = null;

  combo.value = 0;
  floatingScore.value = null;
}

function stop() {
  clearAllTimeouts();
  currentStimulus.value = null;
  currentOptions.value = [];
  floatingScore.value = null;
  stopSession();
}

function start() {
  reset();
  startSession();
  nextTaskTrial();
}

function chooseRule() {
  if (!previousRule.value) return Math.random() < 0.5 ? "color" : "shape";

  const shouldSwitch = Math.random() < levelConfig.value.switchProbability;
  if (shouldSwitch) return previousRule.value === "color" ? "shape" : "color";
  return previousRule.value;
}

function generateStimulus() {
  const rule = chooseRule();
  const color = randomItem(colors);
  const shape = randomItem(shapes);

  const isSwitchTrial = previousRule.value !== null && rule !== previousRule.value;

  let correctAnswer;
  let options;

  if (rule === "color") {
    correctAnswer = color;
    options = [
      { key: "red", label: "Red" },
      { key: "blue", label: "Blue" }
    ];
  } else {
    correctAnswer = shape;
    options = [
      { key: "circle", label: "Circle" },
      { key: "square", label: "Square" }
    ];
  }

  return {
    rule,
    color,
    shape,
    correctAnswer,
    options,
    isSwitchTrial
  };
}

function finalizeTrial(userAnswer = null) {
  if (!currentStimulus.value || shownAtMs.value === null) return;

  const responded = userAnswer !== null;
  const timedOut = !responded;
  const correct = responded && userAnswer === currentStimulus.value.correctAnswer;
  const rtMs = responded && answeredAtMs.value !== null
    ? Math.max(0, answeredAtMs.value - shownAtMs.value)
    : null;

  const switchPenalty = currentStimulus.value.isSwitchTrial && !correct ? 0.12 : 0;
  const timeoutPenalty = timedOut ? 0.18 : 0;
  const wrongPenalty = responded && !correct ? 0.14 : 0;

  addResponse({
    trial: trialIndex.value,
    rule: currentStimulus.value.rule,
    color: currentStimulus.value.color,
    shape: currentStimulus.value.shape,
    correctAnswer: currentStimulus.value.correctAnswer,
    userAnswer,
    responded,
    timedOut,
    correct,
    difficulty: difficulty.value,
    switchTrial: currentStimulus.value.isSwitchTrial,
    stimulusDurationMs: levelConfig.value.stimulusDurationMs,
    isiMs: levelConfig.value.isiMs,
    switchProbability: levelConfig.value.switchProbability,
    rtMs
  });

  updateDifficulty({
    correct,
    rtMs,
    lapse: timedOut,
    penalty: switchPenalty + timeoutPenalty + wrongPenalty
  });

  awardScore({
    correct,
    difficulty: difficulty.value,
    rtMs,
    penalty: switchPenalty + timeoutPenalty + wrongPenalty
  });

  updateCombo(correct);
  showFloatingScore(lastDelta.value);

  previousRule.value = currentStimulus.value.rule;
}

function nextTaskTrial() {
  if (phase.value !== "running") return;

  if (trialIndex.value >= totalTrials.value) {
    currentStimulus.value = null;
    currentOptions.value = [];
    stopSession();
    return;
  }

  nextTrial();

  const stimulus = generateStimulus();
  currentStimulus.value = stimulus;
  currentOptions.value = stimulus.options;

  shownAtMs.value = nowMs();
  answered.value = false;
  answeredAtMs.value = null;

  setManagedTimeout(() => {
    if (!answered.value) {
      finalizeTrial(null);
      currentStimulus.value = null;
      currentOptions.value = [];

      setManagedTimeout(() => {
        nextTaskTrial();
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
  currentOptions.value = [];

  setManagedTimeout(() => {
    nextTaskTrial();
  }, levelConfig.value.isiMs);
}

onMounted(() => {
  document.addEventListener("fullscreenchange", handleFullscreenChange);
});

onBeforeUnmount(() => {
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
  clearAllTimeouts();
});

const summary = computed(() => {
  const correct = responses.value.filter(r => r.correct).length;
  const incorrect = responses.value.filter(r => !r.correct && !r.timedOut).length;
  const timeouts = responses.value.filter(r => r.timedOut).length;

  const switchTrials = responses.value.filter(r => r.switchTrial).length;
  const repeatTrials = responses.value.filter(r => !r.switchTrial).length;

  const switchCorrect = responses.value.filter(r => r.switchTrial && r.correct).length;
  const repeatCorrect = responses.value.filter(r => !r.switchTrial && r.correct).length;

  const allRTs = responses.value.map(r => r.rtMs).filter(v => v !== null);

  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  return {
    correct,
    incorrect,
    timeouts,
    accuracy: responses.value.length ? (correct / responses.value.length) * 100 : 0,
    switchAccuracy: switchTrials ? (switchCorrect / switchTrials) * 100 : 0,
    repeatAccuracy: repeatTrials ? (repeatCorrect / repeatTrials) * 100 : 0,
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
      switchProbability: levelConfig.value.switchProbability,
      rules: ["color", "shape"],
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
  max-width: 820px;
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

.stimulus-box {
  border: 4px solid rgba(255, 255, 255, 0.14);
  border-radius: 18px;
  padding: 20px;
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  background: rgba(255, 255, 255, 0.03);
}

.stimulus-box.color {
  border-color: #60a5fa;
}

.stimulus-box.shape {
  border-color: #22c55e;
}

.stimulus-content {
  display: flex;
  align-items: center;
  gap: 24px;
}

.stimulus-shape {
  width: 70px;
  height: 70px;
  border: 2px solid rgba(255, 255, 255, 0.85);
}

.circle {
  border-radius: 50%;
}

.square {
  border-radius: 10px;
}

.red {
  background: #ef4444;
}

.blue {
  background: #3b82f6;
}

.stimulus-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: rgba(255, 255, 255, 0.9);
}

.placeholder {
  font-size: 40px;
  color: rgba(255, 255, 255, 0.45);
}

.answers {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  justify-content: center;
}

.answers button {
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.08);
  color: white;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.18s ease;
}

.answers button:hover:not(:disabled) {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.14);
}

.controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.controls-centered {
  justify-content: center;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hint {
  margin-bottom: 12px;
  color: #555;
}

.hint-centered {
  text-align: center;
  color: rgba(255, 255, 255, 0.75);
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

.btn {
  padding: 12px 18px;
  border-radius: 14px;
  border: none;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.18s ease;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.15);
  color: white;
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
}

.btn-stop {
  background: linear-gradient(135deg, #ef4444, #dc2626);
}

.btn-reset {
  background: linear-gradient(135deg, #64748b, #475569);
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

.game-shell:fullscreen .stimulus-box {
  flex: 1;
  width: 100%;
  max-width: 1000px;
}

.game-shell:fullscreen .game-shell-title {
  font-size: 26px;
}

.game-shell:fullscreen .controls button,
.game-shell:fullscreen .fullscreen-btn,
.game-shell:fullscreen .answers button {
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

.game-shell:fullscreen .stimulus-shape {
  width: 86px;
  height: 86px;
}

.game-shell:fullscreen .stimulus-meta {
  font-size: 18px;
}
</style>