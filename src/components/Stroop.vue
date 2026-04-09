<template>
  <div class="module">
    <h2>Stroop Task</h2>
    <p class="module-description">
      <b>Rule: </b>Používateľ vidí slovo označujúce farbu, ale text je zobrazený inou farbou atramentu. Úlohou je čo najrýchlejšie a čo najpresnejšie vybrať farbu atramentu, nie prečítané slovo, takže aplikácia precvičuje selektívnu pozornosť a potláčanie automatickej reakcie.
    </p>
    
    <div class="topbar">
      <div><b>Round:</b> {{ trialIndex }} / {{ totalTrials }}</div>
    </div>

    <div class="scorebar">
      <div><b>Score:</b> {{ score }}</div>
      <div><b>Best score:</b> {{ bestScore }}</div>
    </div>

    <div class="game-shell" ref="gameShellRef">
      <div class="game-shell-header">
        <div class="game-shell-title-wrap">
          <div class="game-shell-title">Stroop Task</div>
          <div class="game-shell-subtitle">
            {{ phase === "running" ? "Choose the ink color" : "Ready" }}
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

        <div class="game-main">
          <div class="stimulus-box">
            <div
              v-if="currentStimulus"
              class="stroop-word"
              :style="{ color: currentStimulus.inkColorCss }"
            >
              {{ currentStimulus.wordLabel }}
            </div>
            <div v-else class="placeholder">—</div>
          </div>

          <div class="answers">
            <button
              v-for="option in answerOptions"
              :key="option.key"
              :disabled="phase !== 'running' || !currentStimulus || answered"
              @click="submitAnswer(option.key)"
            >
              {{ option.label }}
            </button>
          </div>
        </div>  

        <div class="controls controls-centered">
          <button class="btn btn-start" :disabled="phase === 'running'" @click="start">Start</button>
          <button class="btn btn-stop" :disabled="phase !== 'running'" @click="stop">Stop</button>
          <button class="btn btn-reset" :disabled="phase !== 'finished'" @click="reset">Reset</button>
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
        <li>Congruent accuracy: {{ summary.congruentAccuracy.toFixed(1) }}%</li>
        <li>Incongruent accuracy: {{ summary.incongruentAccuracy.toFixed(1) }}%</li>
        <li>Avg RT: {{ summary.avgRTms === null ? "—" : summary.avgRTms.toFixed(0) + " ms" }}</li>
        <li>Final difficulty: {{ summary.finalDifficulty }}</li>
        <li>Final score: {{ score }}</li>
        <li>Best score: {{ bestScore }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import { useGameSession } from "../composables/useGameSession";
import { useTimeout } from "../composables/useTimeout";
import { useAdaptiveDifficulty } from "../composables/useAdaptiveDifficulty";
import { useGameScoring } from "../composables/useGameScoring";
import { auth } from "../firebase";
import { getUserGameStat, saveAttempt } from "../services/gameResultsService";

const MODULE_ID = "logic_stroop";
const CATEGORY = "logicke_myslenie";
const GAME_KEY = "stroop";

const {
  phase,
  trialIndex,
  responses,
  startSession,
  stopSession,
  resetSession,
  nextTrial,
  addResponse
} = useGameSession(MODULE_ID, CATEGORY);

const { setManagedTimeout, clearAllTimeouts } = useTimeout();

const {
  difficulty,
  resetDifficulty,
  updateDifficulty
} = useAdaptiveDifficulty({
  minDifficulty: 1,
  maxDifficulty: 10,
  startDifficulty: 3,
  fastThresholdMs: 620,
  slowThresholdMs: 1800,
  targetAccuracyMin: 0.72,
  targetAccuracyMax: 0.88,
  windowSize: 4,
  evaluateEvery: 2,
  scoreIncreaseThreshold: 72,
  scoreDecreaseThreshold: 42
});

const { score, bestScore, lastDelta, awardScore, resetScore, setBestScore } = useGameScoring(MODULE_ID, {
  fastThresholdMs: 620,
  slowThresholdMs: 1800
});

const totalTrials = ref(24);

const difficultySettings = [
  { stimulusDurationMs: 2800, isiMs: 560, incongruentProbability: 0.28 },
  { stimulusDurationMs: 2500, isiMs: 520, incongruentProbability: 0.36 },
  { stimulusDurationMs: 2200, isiMs: 480, incongruentProbability: 0.44 },
  { stimulusDurationMs: 1950, isiMs: 450, incongruentProbability: 0.52 },
  { stimulusDurationMs: 1700, isiMs: 420, incongruentProbability: 0.60 },
  { stimulusDurationMs: 1500, isiMs: 390, incongruentProbability: 0.68 },
  { stimulusDurationMs: 1320, isiMs: 360, incongruentProbability: 0.74 },
  { stimulusDurationMs: 1160, isiMs: 330, incongruentProbability: 0.80 },
  { stimulusDurationMs: 1020, isiMs: 300, incongruentProbability: 0.86 },
  { stimulusDurationMs: 900, isiMs: 270, incongruentProbability: 0.90 }
];

const levelConfig = computed(() => {
  const index = Math.max(0, Math.min(difficultySettings.length - 1, difficulty.value - 1));
  return difficultySettings[index];
});

const colorDefs = [
  { key: "red", label: "Red", css: "#ef4444" },
  { key: "blue", label: "Blue", css: "#3b82f6" },
  { key: "green", label: "Green", css: "#22c55e" },
  { key: "yellow", label: "Yellow", css: "#eab308" }
];

const answerOptions = computed(() =>
  colorDefs.map(c => ({ key: c.key, label: c.label }))
);

const currentStimulus = ref(null);
const shownAtMs = ref(null);
const answered = ref(false);
const answeredAtMs = ref(null);

const combo = ref(0);
const comboMultiplier = computed(() => 1 + combo.value * 0.1);
const floatingScore = ref(null);

const gameShellRef = ref(null);
const isFullscreen = ref(false);

const attemptSaved = ref(false);
const saveError = ref(null);

function nowMs() {
  return performance.now();
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickDifferentColor(exceptKey) {
  const pool = colorDefs.filter(c => c.key !== exceptKey);
  return randomItem(pool);
}

function generateStimulus() {
  const wordColor = randomItem(colorDefs);
  const incongruent = Math.random() < levelConfig.value.incongruentProbability;
  const inkColor = incongruent ? pickDifferentColor(wordColor.key) : wordColor;

  return {
    wordKey: wordColor.key,
    wordLabel: wordColor.label.toUpperCase(),
    inkColorKey: inkColor.key,
    inkColorCss: inkColor.css,
    congruent: wordColor.key === inkColor.key
  };
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

function reset() {
  clearAllTimeouts();
  resetSession();
  resetDifficulty();
  resetScore();

  currentStimulus.value = null;
  shownAtMs.value = null;
  answered.value = false;
  answeredAtMs.value = null;

  combo.value = 0;
  floatingScore.value = null;
  attemptSaved.value = false;
  saveError.value = null;
}

function stop() {
  clearAllTimeouts();
  currentStimulus.value = null;
  floatingScore.value = null;
  stopSession();
}

function start() {
  reset();
  startSession();
  nextStroopTrial();
}

function finalizeTrial(answerKey = null) {
  if (!currentStimulus.value || shownAtMs.value === null) return;

  const responded = answerKey !== null;
  const timedOut = !responded;
  const correct = responded && answerKey === currentStimulus.value.inkColorKey;
  const rtMs = responded && answeredAtMs.value !== null
    ? Math.max(0, answeredAtMs.value - shownAtMs.value)
    : null;

  const incongruentPenalty = !currentStimulus.value.congruent && !correct ? 0.10 : 0;
  const timeoutPenalty = timedOut ? 0.18 : 0;
  const wrongPenalty = responded && !correct ? 0.14 : 0;
  const totalPenalty = incongruentPenalty + timeoutPenalty + wrongPenalty;

  addResponse({
    trial: trialIndex.value,
    wordKey: currentStimulus.value.wordKey,
    wordLabel: currentStimulus.value.wordLabel,
    inkColorKey: currentStimulus.value.inkColorKey,
    congruent: currentStimulus.value.congruent,
    answerKey,
    responded,
    timedOut,
    correct,
    difficulty: difficulty.value,
    stimulusDurationMs: levelConfig.value.stimulusDurationMs,
    isiMs: levelConfig.value.isiMs,
    incongruentProbability: levelConfig.value.incongruentProbability,
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

  updateCombo(correct);
  showFloatingScore(lastDelta.value);
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
  shownAtMs.value = nowMs();
  answered.value = false;
  answeredAtMs.value = null;

  setManagedTimeout(() => {
    if (!answered.value) {
      finalizeTrial(null);
      currentStimulus.value = null;

      setManagedTimeout(() => {
        nextStroopTrial();
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

  setManagedTimeout(() => {
    nextStroopTrial();
  }, levelConfig.value.isiMs);
}

function onKeydown(e) {
  if (phase.value !== "running" || answered.value) return;

  const keyMap = {
    Digit1: "red",
    Digit2: "blue",
    Digit3: "green",
    Digit4: "yellow"
  };

  const answerKey = keyMap[e.code];
  if (answerKey) {
    e.preventDefault();
    submitAnswer(answerKey);
  }
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) {
    await gameShellRef.value?.requestFullscreen();
  } else {
    await document.exitFullscreen();
  }
}
async function loadBestScore() {
  if (!auth.currentUser) {
    setBestScore(0);
    return;
  }

  try {
    const stat = await getUserGameStat(auth.currentUser.uid, GAME_KEY);
    setBestScore(stat?.bestScore ?? 0);
  } catch (error) {
    console.error("Failed to load best score:", error);
    setBestScore(0);
  }
}

function handleFullscreenChange() {
  isFullscreen.value = Boolean(document.fullscreenElement);
}

onMounted(() => {
  loadBestScore();
  window.addEventListener("keydown", onKeydown);
  document.addEventListener("fullscreenchange", handleFullscreenChange);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
  clearAllTimeouts();
});

const summary = computed(() => {
  const correct = responses.value.filter(r => r.correct).length;
  const incorrect = responses.value.filter(r => !r.correct && !r.timedOut).length;
  const timeouts = responses.value.filter(r => r.timedOut).length;

  const congruentTrials = responses.value.filter(r => r.congruent).length;
  const incongruentTrials = responses.value.filter(r => !r.congruent).length;

  const congruentCorrect = responses.value.filter(r => r.congruent && r.correct).length;
  const incongruentCorrect = responses.value.filter(r => !r.congruent && r.correct).length;

  const allRTs = responses.value.map(r => r.rtMs).filter(v => v !== null);
  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  return {
    correct,
    incorrect,
    timeouts,
    accuracy: responses.value.length ? (correct / responses.value.length) * 100 : 0,
    congruentAccuracy: congruentTrials ? (congruentCorrect / congruentTrials) * 100 : 0,
    incongruentAccuracy: incongruentTrials ? (incongruentCorrect / incongruentTrials) * 100 : 0,
    avgRTms: avg(allRTs),
    finalDifficulty: difficulty.value
  };
});

watch(
  () => phase.value,
  async (newPhase) => {
    if (newPhase !== "finished") return;
    if (attemptSaved.value) return;
    if (!auth.currentUser) return;
    if (!responses.value.length) return;

    attemptSaved.value = true;
    saveError.value = null;

    try {
      const stat = await saveAttempt({
        uid: auth.currentUser.uid,
        username: auth.currentUser.displayName || auth.currentUser.email,
        gameKey: GAME_KEY,
        score: score.value,
        accuracy: summary.value.accuracy,
        durationMs: summary.value.avgRTms ? Math.round(summary.value.avgRTms) : null,
        difficultyStart: 3,
        difficultyEnd: difficulty.value,
        rawPayload: {
          correct: summary.value.correct,
          incorrect: summary.value.incorrect,
          timeouts: summary.value.timeouts,
          congruentAccuracy: summary.value.congruentAccuracy,
          incongruentAccuracy: summary.value.incongruentAccuracy,
          avgRTms: summary.value.avgRTms
        }
      });
      setBestScore(stat?.bestScore ?? 0);
    } catch (error) {
      console.error("Failed to save Stroop attempt:", error);
      saveError.value = error;
      attemptSaved.value = false;
    }
  }
);
</script>

<style scoped>
.module {
  max-width: 760px;
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
  min-height: 180px;
  border: 1px dashed rgba(255, 255, 255, 0.18);
  border-radius: 18px;
  display: grid;
  place-items: center;
  margin-bottom: 16px;
  background: rgba(255, 255, 255, 0.03);
}

.stroop-word {
  font-size: 52px;
  font-weight: 800;
  letter-spacing: 2px;
}

.placeholder {
  font-size: 42px;
  color: rgba(255, 255, 255, 0.45);
}

.answers {
  display: flex;
  gap: 8px;
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
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 12px;
  padding: 20px 20px 24px;
  overflow: hidden;
  box-sizing: border-box;
  align-items: stretch;
}

.game-shell:fullscreen .shell-top-status {
  min-height: auto;
  margin: 0;
}

.game-shell:fullscreen .progress {
  width: 100%;
  max-width: 1100px;
  justify-self: center;
  margin: 0;
  flex-shrink: 0;
  z-index: 2;
}

.game-shell:fullscreen .game-main {
  width: 100%;
  max-width: 1100px;
  min-height: 0;
  overflow: auto;
  justify-self: center;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;

  padding: 6px 0;
  box-sizing: border-box;
}

.game-shell:fullscreen .controls {
  width: 100%;
  max-width: 1100px;
  justify-self: center;
  justify-content: center;
  flex-shrink: 0;
  margin: 0;
  padding-top: 8px;
  z-index: 2;
}

.game-shell:fullscreen .controls button,
.game-shell:fullscreen .fullscreen-btn {
  font-size: 16px;
  padding: 12px 18px;
}

.game-shell:fullscreen .game-shell-title {
  font-size: 26px;
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
.game-shell:fullscreen .answers {
  width: 100%;
  max-width: 980px;
  flex-shrink: 0;
}

.game-shell:fullscreen .stroop-word {
  font-size: clamp(42px, 8vh, 64px);
}

.module-description {
  margin: 10px 0 14px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #334155;
  line-height: 1.6;
}
</style>