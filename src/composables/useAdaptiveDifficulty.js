import { ref, computed } from "vue";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values) {
  if (values.length <= 1) return 0;
  const avg = average(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function normalizeSpeed(avgRTms, fastThresholdMs, slowThresholdMs) {
  if (avgRTms === null || avgRTms === undefined) return 0.45;
  if (avgRTms <= fastThresholdMs) return 1;
  if (avgRTms >= slowThresholdMs) return 0;
  return 1 - (avgRTms - fastThresholdMs) / Math.max(1, slowThresholdMs - fastThresholdMs);
}

function normalizeConsistency(rtValues, slowThresholdMs) {
  if (rtValues.length <= 1) return 1;
  const deviation = stdDev(rtValues);
  return clamp(1 - deviation / Math.max(1, slowThresholdMs * 0.28), 0, 1);
}

function buildLabel(level) {
  if (level <= 2) return `${level} - nízka`;
  if (level <= 4) return `${level} - mierna`;
  if (level <= 6) return `${level} - stredná`;
  if (level <= 8) return `${level} - vyššia`;
  return `${level} - vysoká`;
}

export function useAdaptiveDifficulty(options = {}) {
  const minDifficulty = options.minDifficulty ?? 1;
  const maxDifficulty = options.maxDifficulty ?? 10;
  const startDifficulty = options.startDifficulty ?? Math.min(3, maxDifficulty);

  const fastThresholdMs = options.fastThresholdMs ?? 650;
  const slowThresholdMs = options.slowThresholdMs ?? 2000;

  const targetAccuracyMin = options.targetAccuracyMin ?? 0.7;
  const targetAccuracyMax = options.targetAccuracyMax ?? 0.85;

  const windowSize = options.windowSize ?? 4;
  const evaluateEvery = options.evaluateEvery ?? 2;

  const scoreIncreaseThreshold = options.scoreIncreaseThreshold ?? 72;
  const scoreDecreaseThreshold = options.scoreDecreaseThreshold ?? 42;

  const maxPendingPenalty = options.maxPendingPenalty ?? 2;

  const showDebug = ref(options.showDebug ?? false);

  const difficulty = ref(startDifficulty);
  const successStreak = ref(0);
  const recentSamples = ref([]);
  const pendingSinceEvaluation = ref(0);
  const adaptationHistory = ref([]);
  const lastDecision = ref("steady");

  const performanceSnapshot = ref({
    accuracy: 0,
    avgRTms: null,
    consistency: 1,
    speedScore: 0,
    performanceScore: 0,
    penalty: 0,
    sampleCount: 0
  });

  function resetDifficulty() {
    difficulty.value = startDifficulty;
    successStreak.value = 0;
    recentSamples.value = [];
    pendingSinceEvaluation.value = 0;
    adaptationHistory.value = [];
    lastDecision.value = "steady";
    performanceSnapshot.value = {
      accuracy: 0,
      avgRTms: null,
      consistency: 1,
      speedScore: 0,
      performanceScore: 0,
      penalty: 0,
      sampleCount: 0
    };
  }

  function pushSample(sample) {
    recentSamples.value.push(sample);
    if (recentSamples.value.length > windowSize) {
      recentSamples.value.shift();
    }
    pendingSinceEvaluation.value += 1;
  }

  function makeSample(input) {
    if (typeof input === "boolean") {
      return {
        correct: input,
        rtMs: null,
        penalty: input ? 0 : 0.12,
        weight: 1,
        forceEvaluate: false
      };
    }

    if (input && typeof input === "object" && input.aggregate) {
      return {
        correctRate: clamp(input.accuracy ?? 0, 0, 1),
        rtMs: input.avgRTms ?? null,
        consistency: input.consistency ?? null,
        penalty: clamp(input.penalty ?? 0, 0, maxPendingPenalty),
        weight: Math.max(1, input.sampleCount ?? 1),
        forceEvaluate: true
      };
    }

    const correct = Boolean(input?.correct);
    const penalty = clamp(
      (input?.penalty ?? 0)
        + (input?.falseAlarm ? 0.2 : 0)
        + (input?.lapse ? 0.12 : 0)
        + (input?.invalidPress ? 0.2 : 0),
      0,
      maxPendingPenalty
    );

    return {
      correct,
      rtMs: input?.rtMs ?? null,
      penalty,
      weight: Math.max(1, input?.weight ?? 1),
      forceEvaluate: Boolean(input?.forceEvaluate)
    };
  }

  function evaluateWindow() {
    if (!recentSamples.value.length) return;

    const weightedTotal = recentSamples.value.reduce((sum, sample) => sum + sample.weight, 0);
    const weightedCorrect = recentSamples.value.reduce((sum, sample) => {
      const rate = sample.correctRate ?? (sample.correct ? 1 : 0);
      return sum + rate * sample.weight;
    }, 0);

    const accuracy = weightedTotal ? weightedCorrect / weightedTotal : 0;

    const rtValues = recentSamples.value
      .map(sample => sample.rtMs)
      .filter(value => value !== null && value !== undefined);

    const avgRTms = average(rtValues);
    const speedScore = normalizeSpeed(avgRTms, fastThresholdMs, slowThresholdMs);

    const providedConsistency = recentSamples.value
      .map(sample => sample.consistency)
      .filter(value => value !== null && value !== undefined);

    const consistency = providedConsistency.length
      ? average(providedConsistency)
      : normalizeConsistency(rtValues, slowThresholdMs);

    const penalty =
      recentSamples.value.reduce((sum, sample) => sum + (sample.penalty ?? 0), 0) /
      recentSamples.value.length;

    const performanceScore = clamp(
      accuracy * 60 + speedScore * 28 + consistency * 12 - penalty * 20,
      0,
      100
    );

    let nextDecision = "steady";

    const isExcellent =
      accuracy >= 0.95 &&
      performanceScore >= 88 &&
      difficulty.value < maxDifficulty;

    const isVeryPoor =
      accuracy <= 0.45 &&
      performanceScore <= 35 &&
      difficulty.value > minDifficulty;

    if (isExcellent) {
      difficulty.value = Math.min(maxDifficulty, difficulty.value + 2);
      nextDecision = "up";
      successStreak.value += 1;
    } else if (isVeryPoor) {
      difficulty.value = Math.max(minDifficulty, difficulty.value - 2);
      nextDecision = "down";
      successStreak.value = 0;
    } else {
      if (accuracy >= targetAccuracyMax && performanceScore >= scoreIncreaseThreshold) {
        nextDecision = "up";
      } else if (accuracy < targetAccuracyMin || performanceScore <= scoreDecreaseThreshold) {
        nextDecision = "down";
      }

      if (nextDecision === "up") {
        difficulty.value = Math.min(maxDifficulty, difficulty.value + 1);
        successStreak.value += 1;
      } else if (nextDecision === "down") {
        difficulty.value = Math.max(minDifficulty, difficulty.value - 1);
        successStreak.value = 0;
      } else {
        successStreak.value = 0;
      }
    }

    lastDecision.value = nextDecision;

    performanceSnapshot.value = {
      accuracy,
      avgRTms,
      consistency,
      speedScore,
      performanceScore,
      penalty,
      sampleCount: weightedTotal
    };

    adaptationHistory.value.push({
      decision: nextDecision,
      difficulty: difficulty.value,
      accuracy,
      avgRTms,
      performanceScore,
      penalty,
      timestamp: Date.now()
    });

    if (adaptationHistory.value.length > 20) {
      adaptationHistory.value.shift();
    }

    pendingSinceEvaluation.value = 0;
  }

  function updateDifficulty(input) {
    const sample = makeSample(input);
    pushSample(sample);

    const hasEnoughSamples = recentSamples.value.length >= Math.min(windowSize, 2);
    const shouldEvaluate =
      sample.forceEvaluate ||
      (hasEnoughSamples && pendingSinceEvaluation.value >= evaluateEvery);

    if (shouldEvaluate) {
      evaluateWindow();
    }
  }

  const difficultyLabel = computed(() => buildLabel(difficulty.value));

  return {
    difficulty,
    difficultyLabel,
    successStreak,
    performanceSnapshot,
    adaptationHistory,
    lastDecision,
    showDebug,
    resetDifficulty,
    updateDifficulty
  };
}