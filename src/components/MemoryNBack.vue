<template>
  <div class="module">
    <h2>Memory N-Back</h2>
    <p class="module-description">
      <b>Rule: </b>V tejto úlohe sa postupne zobrazujú symboly a tvojou úlohou je označiť zhodu vtedy, keď sa aktuálny symbol zhoduje so symbolom, ktorý sa zobrazil o <b>{{ selectedN }}</b> kroky späť. Používateľ musí priebežne sledovať celú sériu podnetov, porovnávať ich s predchádzajúcimi a reagovať iba v správnom okamihu.
    </p>

    <div class="topbar">
      <div><b>Kategória:</b> Pamäť</div>
      <div><b>Status:</b> {{ phase }}</div>
      <div><b>Obtiažnosť:</b> {{ difficultyLabel }}</div>
      <div><b>N:</b> {{ selectedN }}</div>
      <div><b>Trial:</b> {{ trialIndex }} / {{ totalTrials }}</div>
      <div><b>Block:</b> {{ currentBlockIndex }} / {{ totalBlocks }}</div>
    </div>

    <div class="scorebar">
      <div><b>Score:</b> {{ score }}</div>
      <div><b>Best score:</b> {{ bestScore }}</div>
      <div><b>Last delta:</b> {{ lastDelta >= 0 ? `+${lastDelta}` : lastDelta }}</div>
    </div>

    <div class="game-shell" ref="gameShellRef">
      <div class="game-shell-header">
        <div class="game-shell-title-wrap">
          <div class="game-shell-title">Memory N-Back</div>
          <div class="game-shell-subtitle">
            {{
              currentStimulus !== null
                ? `Match if equal to ${selectedN}-back`
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

        <div class="mode-row">
          <label class="select select-dark">
            N level:
            <select v-model.number="selectedN" :disabled="phase === 'running'">
              <option v-for="n in nOptions" :key="n" :value="n">{{ n }}-Back</option>
            </select>
          </label>
        </div>

        <div class="stimulusBox">
          <div class="stimulus">
            {{ currentStimulus ?? "—" }}
          </div>

          <div class="subhint subhint-dark">
            {{
              phase === "running"
                ? `Press Match if current letter equals the one ${selectedN} step(s) back.`
                : "Press Start."
            }}
          </div>
        </div>

        <div class="controls controls-centered">
          <button class="btn btn-start" :disabled="phase === 'running'" @click="start">Start</button>
          <button class="btn btn-stop" :disabled="phase !== 'running'" @click="stop">Stop</button>
          <button class="btn btn-match" :disabled="phase !== 'running'" @click="registerResponse">Match</button>
          <button class="btn btn-reset" :disabled="phase !== 'finished'" @click="reset">Reset</button>
        </div>

        <div v-if="showDebug" class="debug debug-dark">
          <div><b>Stimulus duration:</b> {{ levelConfig.stimulusDurationMs }} ms</div>
          <div><b>ISI:</b> {{ levelConfig.isiMs }} ms</div>
          <div><b>N:</b> {{ selectedN }}</div>
        </div>

        <div class="hint hint-centered">
          Difficulty changes speed only. N is selected manually.
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
        <li>Correct rejections: {{ summary.correctRejections }}</li>
        <li>Target rate: {{ summary.targetRate.toFixed(1) }}%</li>
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

const MODULE_ID = "memory_nback";
const CATEGORY = "pamat";
const GAME_KEY = "nback";

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
  fastThresholdMs: 420,
  slowThresholdMs: 1300,
  targetAccuracyMin: 0.68,
  targetAccuracyMax: 0.86,
  windowSize: 4,
  evaluateEvery: 2,
  scoreIncreaseThreshold: 72,
  scoreDecreaseThreshold: 42
});

const { score, bestScore, lastDelta, awardScore, resetScore, setBestScore } = useGameScoring(MODULE_ID, {
  fastThresholdMs: 420,
  slowThresholdMs: 1300
});

const totalTrials = ref(30);
const blockSize = ref(5);

const nOptions = [1, 2, 3, 4];
const selectedN = ref(2);

const difficultySettings = [
  { stimulusDurationMs: 980, isiMs: 560 },
  { stimulusDurationMs: 900, isiMs: 520 },
  { stimulusDurationMs: 820, isiMs: 480 },
  { stimulusDurationMs: 740, isiMs: 440 },
  { stimulusDurationMs: 680, isiMs: 410 },
  { stimulusDurationMs: 620, isiMs: 380 },
  { stimulusDurationMs: 570, isiMs: 350 },
  { stimulusDurationMs: 530, isiMs: 320 },
  { stimulusDurationMs: 490, isiMs: 300 },
  { stimulusDurationMs: 450, isiMs: 280 }
];

const levelConfig = computed(() => {
  const index = Math.max(0, Math.min(difficultySettings.length - 1, difficulty.value - 1));
  return difficultySettings[index];
});

const stimulusSet = ["A", "B", "C", "D", "E", "F", "G", "H"];

const currentStimulus = ref(null);
const sequence = ref([]);

const currentTrialShownAtMs = ref(null);
const currentTrialResponded = ref(false);
const currentTrialResponseAtMs = ref(null);

const currentBlockIndex = ref(1);
const totalBlocks = computed(() => Math.ceil(totalTrials.value / blockSize.value));

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

function randomStimulus() {
  const idx = Math.floor(Math.random() * stimulusSet.length);
  return stimulusSet[idx];
}

function buildStimulusForTrial(trialNumber1Based) {
  const index = trialNumber1Based - 1;
  const n = selectedN.value;

  if (index >= n && Math.random() < 0.35) {
    return sequence.value[index - n];
  }

  let candidate = randomStimulus();
  if (index >= n) {
    while (candidate === sequence.value[index - n]) {
      candidate = randomStimulus();
    }
  }
  return candidate;
}

function computeIsTarget(stimulus, trialNumber1Based) {
  const idx = trialNumber1Based - 1;
  const backIdx = idx - selectedN.value;
  if (backIdx < 0) return false;
  return sequence.value[backIdx] === stimulus;
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
      `${selectedN.value}back`
    );
    setBestScore(stat?.bestScore ?? 0);
  } catch (error) {
    console.error("Failed to load N-Back best score:", error);
    setBestScore(0);
  }
}
watch(selectedN, () => {
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

  currentStimulus.value = null;
  sequence.value = [];
  currentTrialShownAtMs.value = null;
  currentTrialResponded.value = false;
  currentTrialResponseAtMs.value = null;
  currentBlockIndex.value = 1;

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
  nextNBackTrial();
}

function finalizeTrial(trialNumber1Based) {
  const stimulus = currentStimulus.value;
  const shownAt = currentTrialShownAtMs.value;

  if (stimulus === null || shownAt === null) return;

  const isTarget = computeIsTarget(stimulus, trialNumber1Based);
  const userPressed = currentTrialResponded.value;
  const correct = (isTarget && userPressed) || (!isTarget && !userPressed);

  const falseAlarm = !isTarget && userPressed;
  const miss = isTarget && !userPressed;

  const respondedAt = currentTrialResponseAtMs.value;
  const rtMs = userPressed && respondedAt !== null
    ? Math.max(0, respondedAt - shownAt)
    : null;

  addResponse({
    trial: trialNumber1Based,
    stimulus,
    n: selectedN.value,
    difficulty: difficulty.value,
    isTarget,
    userPressed,
    correct,
    falseAlarm,
    miss,
    rtMs,
    shownAtMs: shownAt,
    respondedAtMs: respondedAt
  });

  awardScore({
    correct,
    difficulty: difficulty.value,
    rtMs,
    penalty: falseAlarm ? 0.4 : miss ? 0.28 : 0
  });

  updateCombo(correct);
  showFloatingScore(lastDelta.value);
}

function evaluateCurrentBlock() {
  const startIndex = responses.value.length - blockSize.value;
  if (startIndex < 0) return;

  const blockResponses = responses.value.slice(startIndex);
  if (!blockResponses.length) return;

  const correctCount = blockResponses.filter(r => r.correct).length;
  const misses = blockResponses.filter(r => r.isTarget && !r.userPressed).length;
  const falseAlarms = blockResponses.filter(r => !r.isTarget && r.userPressed).length;

  const accuracy = correctCount / blockResponses.length;

  const rts = blockResponses
    .filter(r => r.userPressed && r.rtMs !== null)
    .map(r => r.rtMs);

  const avgRTms = rts.length
    ? rts.reduce((a, b) => a + b, 0) / rts.length
    : null;

  const penalty = falseAlarms * 0.22 + misses * 0.16;

  updateDifficulty({
    aggregate: true,
    accuracy,
    avgRTms,
    penalty,
    sampleCount: blockResponses.length
  });

  currentBlockIndex.value += 1;
}

function nextNBackTrial() {
  if (phase.value !== "running") return;

  if (trialIndex.value >= totalTrials.value) {
    currentStimulus.value = null;
    stopSession();
    return;
  }

  nextTrial();

  const stim = buildStimulusForTrial(trialIndex.value);
  currentStimulus.value = stim;
  sequence.value.push(stim);

  currentTrialShownAtMs.value = nowMs();
  currentTrialResponded.value = false;
  currentTrialResponseAtMs.value = null;

  setManagedTimeout(() => {
    finalizeTrial(trialIndex.value);
    currentStimulus.value = null;

    const isEndOfBlock = trialIndex.value % blockSize.value === 0;
    if (isEndOfBlock) evaluateCurrentBlock();

    setManagedTimeout(() => {
      nextNBackTrial();
    }, levelConfig.value.isiMs);
  }, levelConfig.value.stimulusDurationMs);
}

function registerResponse() {
  if (phase.value !== "running") return;
  if (currentTrialResponded.value) return;
  if (currentTrialShownAtMs.value === null) return;

  currentTrialResponded.value = true;
  currentTrialResponseAtMs.value = nowMs();
}

function onKeydown(e) {
  if (e.code === "Space") {
    e.preventDefault();
    registerResponse();
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
  const recs = responses.value;

  let hits = 0;
  let misses = 0;
  let falseAlarms = 0;
  let correctRejections = 0;

  const rts = [];
  let targetCount = 0;

  for (const r of recs) {
    if (r.isTarget) targetCount += 1;

    if (r.isTarget && r.userPressed) hits += 1;
    else if (r.isTarget && !r.userPressed) misses += 1;
    else if (!r.isTarget && r.userPressed) falseAlarms += 1;
    else if (!r.isTarget && !r.userPressed) correctRejections += 1;

    if (r.rtMs !== null) rts.push(r.rtMs);
  }

  const correct = recs.filter(r => r.correct).length;
  const accuracy = recs.length ? (correct / recs.length) * 100 : 0;
  const avgRTms = rts.length ? rts.reduce((a, b) => a + b, 0) / rts.length : null;

  return {
    hits,
    misses,
    falseAlarms,
    correctRejections,
    accuracy,
    avgRTms,
    targetRate: recs.length ? (targetCount / recs.length) * 100 : 0,
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
        modeKey: `${selectedN.value}back`,
        score: score.value,
        accuracy: summary.value.accuracy,
        durationMs: summary.value.avgRTms ? Math.round(summary.value.avgRTms) : null,
        difficultyStart: 3,
        difficultyEnd: difficulty.value,
        rawPayload: {
          n: selectedN.value,
          hits: summary.value.hits,
          misses: summary.value.misses,
          falseAlarms: summary.value.falseAlarms,
          correctRejections: summary.value.correctRejections,
          targetRate: summary.value.targetRate,
          avgRTms: summary.value.avgRTms,
          payload: payload.value
        }
      });
      setBestScore(stat?.bestScore ?? 0);
    } catch (error) {
      console.error("Failed to save N-Back attempt:", error);
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
  min-height: 220px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.03);
  padding: 18px;
  margin-bottom: 16px;
}

.stimulus {
  font-size: 72px;
  display: inline-block;
  min-width: 40px;
  font-weight: 800;
  letter-spacing: 2px;
}

.subhint-dark {
  color: rgba(255, 255, 255, 0.68);
  text-align: center;
  margin-top: 6px;
}

.controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 12px 0;
}

.controls-centered {
  justify-content: center;
}

button:disabled,
select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.debug {
  margin-top: 12px;
  padding: 12px;
  border-radius: 12px;
  display: grid;
  gap: 6px;
}

.debug-dark {
  border: 1px dashed rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.78);
}

.hint-centered {
  text-align: center;
  color: rgba(255, 255, 255, 0.75);
  margin-top: 8px;
}

.results {
  border-top: 1px solid #eee;
  margin-top: 16px;
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

.btn-match {
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
.game-shell:fullscreen .select-dark select {
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
  font-size: 96px;
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