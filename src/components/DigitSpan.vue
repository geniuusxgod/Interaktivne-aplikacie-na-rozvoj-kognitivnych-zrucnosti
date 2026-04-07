<template>
  <div class="module">
    <h2>Digit Span</h2>
    <p class="module-description">
      <b>Rule: </b>V tejto miniaplikácii sa používateľovi postupne zobrazí séria číslic, ktoré si musí zapamätať. Po skončení prezentácie ich má zadať v správnom poradí, prípadne v opačnom poradí podľa zvoleného režimu, čím sa precvičuje krátkodobá a pracovná pamäť.
    </p>

    <div class="topbar">
      <div><b>Kategória:</b> Pamäť</div>
      <div><b>Mode:</b> {{ modeLabel }}</div>
      <div><b>Obtiažnosť:</b> {{ difficultyLabel }}</div>
      <div><b>Round:</b> {{ trialIndex }} / {{ totalRounds }}</div>
    </div>

    <div class="scorebar">
      <div><b>Score:</b> {{ score }}</div>
      <div><b>Best score:</b> {{ bestScore }}</div>
      <div><b>Last delta:</b> {{ lastDelta >= 0 ? `+${lastDelta}` : lastDelta }}</div>
    </div>

    <div class="game-shell" ref="gameShellRef">
      <div class="game-shell-header">
        <div class="game-shell-title-wrap">
          <div class="game-shell-title">Digit Span</div>
          <div class="game-shell-subtitle">
            {{
              phase === "showing"
                ? "Memorize the digits"
                : phase === "answering"
                  ? "Type the sequence and submit"
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

        <div class="mode-row">
          <label class="select select-dark">
            Mode:
            <select v-model="mode" :disabled="phase !== 'idle' && phase !== 'finished'">
              <option value="forward">Forward</option>
              <option value="backward">Backward</option>
            </select>
          </label>
        </div>

        <div class="stimulusBox">
          <div class="stimulus" v-if="phase === 'showing'">
            {{ displayDigit }}
          </div>
          <div class="stimulus" v-else>
            {{ phase === 'idle' ? "—" : "Ready" }}
          </div>

          <div class="subhint subhint-dark">
            {{
              phase === "showing"
                ? "Zapamätaj si čísla…"
                : phase === "answering"
                  ? "Napíš sekvenciu a potvrď."
                  : "Stlač Start."
            }}
          </div>
        </div>

        <div v-if="phase === 'answering'" class="answer">
          <div class="answerRow">
            <input
              v-model="answer"
              class="input input-dark"
              placeholder="Enter digits (e.g. 49271)"
              inputmode="numeric"
              autocomplete="off"
              @keydown.enter.prevent="submitAnswer"
            />
            <button class="btn btn-submit" @click="submitAnswer">Submit</button>
          </div>
        </div>

        <div class="controls controls-centered">
          <button class="btn btn-start" :disabled="phase !== 'idle' && phase !== 'finished'" @click="start">
            Start
          </button>
          <button class="btn btn-stop" :disabled="phase === 'idle'" @click="stop">
            Stop
          </button>
          <button class="btn btn-reset" :disabled="phase !== 'finished'" @click="reset">
            Reset
          </button>
        </div>

        <div v-if="showDebug" class="debug debug-dark">
          <div><b>Span length:</b> {{ levelConfig.spanLength }}</div>
          <div><b>Digit duration:</b> {{ levelConfig.digitDurationMs }} ms</div>
          <div><b>Gap:</b> {{ levelConfig.gapMs }} ms</div>
          <div><b>Mode:</b> {{ modeLabel }}</div>
        </div>

        <div class="hint hint-centered">
          Higher difficulty increases span length and speeds up digit presentation.
        </div>
      </div>
    </div>

    <div v-if="phase === 'finished'" class="results">
      <h3>Results</h3>
      <ul>
        <li>Max span reached: {{ summary.maxSpanReached }}</li>
        <li>Accuracy: {{ summary.accuracy.toFixed(1) }}%</li>
        <li>Correct rounds: {{ summary.correctRounds }} / {{ summary.totalRounds }}</li>
        <li>Avg answer time: {{ summary.avgAnswerTimeMs === null ? "—" : summary.avgAnswerTimeMs.toFixed(0) + " ms" }}</li>
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

const MODULE_ID = "memory_digit_span";
const CATEGORY = "pamat";
const GAME_KEY = "digitspan";

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
  updateDifficulty,
  showDebug
} = useAdaptiveDifficulty({
  minDifficulty: 1,
  maxDifficulty: 10,
  startDifficulty: 3,
  fastThresholdMs: 1800,
  slowThresholdMs: 8000,
  targetAccuracyMin: 0.68,
  targetAccuracyMax: 0.86,
  windowSize: 4,
  evaluateEvery: 2,
  scoreIncreaseThreshold: 72,
  scoreDecreaseThreshold: 42
});

const { score, bestScore, lastDelta, awardScore, resetScore, setBestScore } = useGameScoring(MODULE_ID, {
  fastThresholdMs: 1800,
  slowThresholdMs: 8000
});

const mode = ref("forward");
const totalRounds = ref(10);

const difficultySettings = [
  { spanLength: 4, digitDurationMs: 760, gapMs: 280 },
  { spanLength: 4, digitDurationMs: 700, gapMs: 260 },
  { spanLength: 5, digitDurationMs: 660, gapMs: 240 },
  { spanLength: 5, digitDurationMs: 610, gapMs: 220 },
  { spanLength: 6, digitDurationMs: 570, gapMs: 200 },
  { spanLength: 6, digitDurationMs: 520, gapMs: 180 },
  { spanLength: 7, digitDurationMs: 480, gapMs: 160 },
  { spanLength: 7, digitDurationMs: 430, gapMs: 150 },
  { spanLength: 8, digitDurationMs: 390, gapMs: 140 },
  { spanLength: 9, digitDurationMs: 350, gapMs: 130 }
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
    const stat = await getUserGameStat(
      auth.currentUser.uid,
      GAME_KEY,
      mode.value
    );
    setBestScore(stat?.bestScore ?? 0);
  } catch (error) {
    console.error("Failed to load Digit Span best score:", error);
    setBestScore(0);
  }
}
watch(mode, () => {
  if (phase.value === "idle" || phase.value === "finished") {
    loadBestScore();
  }
});

function handleFullscreenChange() {
  isFullscreen.value = Boolean(document.fullscreenElement);
}

function reset() {
  clearAllTimeouts();
  resetSession();
  resetDifficulty();
  resetScore();

  currentSequence.value = [];
  displayDigit.value = "";
  answer.value = "";
  answerShownAtMs.value = null;
  answeredAtMs.value = null;

  combo.value = 0;
  floatingScore.value = null;
  attemptSaved.value = false;
  saveError.value = null;
}

function stop() {
  clearAllTimeouts();
  displayDigit.value = "";
  floatingScore.value = null;
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
  for (let i = 0; i < len; i++) seq.push(randomDigit());
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

  const charsCorrect = [...given].filter((digit, idx) => digit === expected[idx]).length;
  const partialAccuracy = expected.length ? charsCorrect / expected.length : 0;

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

  updateDifficulty({
    aggregate: true,
    accuracy: correct ? 1 : partialAccuracy,
    avgRTms: rtMs,
    penalty: correct ? 0 : 0.14,
    sampleCount: 1
  });

  awardScore({
    correct,
    difficulty: difficulty.value,
    rtMs,
    accuracy: correct ? 1 : partialAccuracy,
    penalty: correct ? 0 : 0.3
  });

  updateCombo(correct);
  showFloatingScore(lastDelta.value);

  phase.value = "showing";
  setManagedTimeout(() => {
    nextDigitSpanRound();
  }, 700);
}

onMounted(() => {
  document.addEventListener("fullscreenchange", handleFullscreenChange);
});

onBeforeUnmount(() => {
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
  clearAllTimeouts();
});

const summary = computed(() => {
  const recs = responses.value;
  const total = recs.length;
  const correctRounds = recs.filter(r => r.correct).length;
  const accuracy = total ? (correctRounds / total) * 100 : 0;

  let maxSpanReached = 0;
  for (const r of recs) {
    if (r.correct && r.span > maxSpanReached) maxSpanReached = r.span;
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
        modeKey: mode.value,
        score: score.value,
        accuracy: summary.value.accuracy,
        durationMs: summary.value.avgAnswerTimeMs ? Math.round(summary.value.avgAnswerTimeMs) : null,
        difficultyStart: 3,
        difficultyEnd: difficulty.value,
        rawPayload: {
          mode: mode.value,
          maxSpanReached: summary.value.maxSpanReached,
          correctRounds: summary.value.correctRounds,
          totalRounds: summary.value.totalRounds,
          avgAnswerTimeMs: summary.value.avgAnswerTimeMs,
          payload: payload.value
        }
      });
      setBestScore(stat?.bestScore ?? 0);
    } catch (error) {
      console.error("Failed to save Digit Span attempt:", error);
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

.mode-row {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}

.select {
  display: flex;
  gap: 8px;
  align-items: center;
}

.select-dark {
  color: rgba(255, 255, 255, 0.9);
  font-weight: 600;
}

.select-dark select {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.08);
  color: white;
}

.select-dark option {
  color: black;
}

.stimulusBox {
  margin-top: 4px;
  border: 1px dashed rgba(255, 255, 255, 0.18);
  border-radius: 18px;
  min-height: 180px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.03);
  padding: 18px;
  margin-bottom: 16px;
}

.stimulus {
  font-size: 52px;
  font-weight: 800;
  letter-spacing: 2px;
}

.subhint-dark {
  color: rgba(255, 255, 255, 0.68);
  margin-top: 6px;
}

.answer {
  margin: 14px 0 18px;
}

.answerRow {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.input {
  min-width: 260px;
  padding: 12px 14px;
  border-radius: 12px;
}

.input-dark {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.08);
  color: white;
}

.input-dark::placeholder {
  color: rgba(255, 255, 255, 0.45);
}

.controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 12px;
}

.controls-centered {
  justify-content: center;
}

button:disabled,
select:disabled,
input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

.btn-submit {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
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
  flex: 1;
  width: 100%;
  max-width: 900px;
}

.game-shell:fullscreen .game-shell-title {
  font-size: 26px;
}

.game-shell:fullscreen .controls button,
.game-shell:fullscreen .fullscreen-btn,
.game-shell:fullscreen .select-dark select,
.game-shell:fullscreen .input {
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

.game-shell:fullscreen .stimulus {
  font-size: 72px;
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