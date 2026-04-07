<template>
  <div class="module">
    <h2>Pattern Reasoning</h2>
    <p class="module-description">
      <b>Rule: </b>Používateľ sleduje postupnosť symbolov alebo tvarov, v ktorej chýba ďalší správny prvok. Jeho úlohou je rozpoznať pravidlo v sekvencii a z ponúknutých možností vybrať správne pokračovanie, takže ide o cvičenie logického uvažovania a práce so vzormi.
    </p>

    <div class="topbar">
      <div><b>Round:</b> {{ trialIndex }} / {{ totalRounds }}</div>
    </div>

    <div class="scorebar">
      <div><b>Score:</b> {{ score }}</div>
      <div><b>Best score:</b> {{ bestScore }}</div>
    </div>

    <div class="game-shell" ref="gameShellRef">
      <div class="game-shell-header">
        <div class="game-shell-title-wrap">
          <div class="game-shell-title">Pattern Reasoning</div>
          <div class="game-shell-subtitle">
            {{
              currentPuzzle
                ? "Choose the missing symbol"
                : phase === "running"
                  ? "Wait for the next pattern"
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
            :style="{ width: `${Math.min(100, (trialIndex / totalRounds) * 100)}%` }"
          ></div>
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

        <div v-if="currentPuzzle" class="options">
          <button
            v-for="option in currentPuzzle.options"
            :key="option.id"
            class="option-btn"
            :disabled="phase !== 'running' || answered"
            @click="submitAnswer(option.value)"
          >
            {{ option.value }}
          </button>
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

const MODULE_ID = "logic_pattern_reasoning";
const CATEGORY = "logicke_myslenie";
const GAME_KEY = "patternreasoning";

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
  difficultyLabel,
  resetDifficulty,
  updateDifficulty
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

const { score, bestScore, lastDelta, awardScore, resetScore, setBestScore } = useGameScoring(MODULE_ID, {
  fastThresholdMs: 1200,
  slowThresholdMs: 6000
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

function reset() {
  clearAllTimeouts();
  resetSession();
  resetDifficulty();
  resetScore();

  currentPuzzle.value = null;
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
  currentPuzzle.value = null;
  floatingScore.value = null;
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

  updateCombo(correct);
  showFloatingScore(lastDelta.value);
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

onMounted(() => {
  loadBestScore();
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
        difficultyStart: 2,
        difficultyEnd: difficulty.value,
        rawPayload: {
          correct: summary.value.correct,
          incorrect: summary.value.incorrect,
          timeouts: summary.value.timeouts,
          avgRTms: summary.value.avgRTms
        }
      });
      setBestScore(stat?.bestScore ?? 0);
    } catch (error) {
      console.error("Failed to save Pattern Reasoning attempt:", error);
      saveError.value = error;
      attemptSaved.value = false;
    }
  }
);
</script>

<style scoped>
.module {
  max-width: 860px;
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

.sequence-box {
  min-height: 150px;
  border: 1px dashed rgba(255, 255, 255, 0.18);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.03);
  display: grid;
  place-items: center;
  margin-bottom: 16px;
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
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: #1e293b;
  display: grid;
  place-items: center;
  font-size: 28px;
  font-weight: 700;
  color: white;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);
}

.sequence-item.missing {
  background: #1d4ed8;
  border-color: rgba(96, 165, 250, 0.55);
  box-shadow: 0 0 20px rgba(96, 165, 250, 0.18);
}

.placeholder {
  font-size: 42px;
  color: rgba(255, 255, 255, 0.45);
}

.options {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
  justify-content: center;
}

.option-btn {
  min-width: 70px;
  min-height: 70px;
  padding: 12px 16px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.08);
  color: white;
  cursor: pointer;
  font-weight: 700;
  font-size: 24px;
  transition: all 0.18s ease;
}

.option-btn:hover:not(:disabled) {
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
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: center;
  overflow-y: auto;
  padding: 24px 20px 28px;
  gap: 10px;
}

.game-shell:fullscreen .sequence-box {
  flex: 1;
  width: 100%;
  max-width: 1100px;
}

.game-shell:fullscreen .game-shell-title {
  font-size: 26px;
}

.game-shell:fullscreen .controls button,
.game-shell:fullscreen .fullscreen-btn,
.game-shell:fullscreen .option-btn {
  font-size: 16px;
  padding: 12px 18px;
}

.game-shell:fullscreen .option-btn {
  min-width: 84px;
  min-height: 84px;
  font-size: 28px;
}

.game-shell:fullscreen .sequence-item {
  width: 84px;
  height: 84px;
  font-size: 32px;
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