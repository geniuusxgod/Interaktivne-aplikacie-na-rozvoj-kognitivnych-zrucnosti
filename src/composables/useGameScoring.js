import { ref } from "vue";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function useGameScoring(moduleId, options = {}) {
  const score = ref(0);
  const bestScore = ref(0);
  const lastDelta = ref(0);

  const fastThresholdMs = options.fastThresholdMs ?? 600;
  const slowThresholdMs = options.slowThresholdMs ?? 2200;

  function normalizeSpeed(rtMs) {
    if (rtMs === null || rtMs === undefined) return 0;
    if (rtMs <= fastThresholdMs) return 1;
    if (rtMs >= slowThresholdMs) return 0;
    return 1 - (rtMs - fastThresholdMs) / Math.max(1, slowThresholdMs - fastThresholdMs);
  }

  function computeDelta(input = {}) {
    const correct = Boolean(input.correct);
    const difficulty = input.difficulty ?? 1;
    const rtMs = input.rtMs ?? null;
    const accuracy = input.accuracy ?? null;
    const penalty = input.penalty ?? 0;
    const bonus = input.bonus ?? 0;

    const difficultyBonus = difficulty * 18;
    const speedBonus = Math.round(normalizeSpeed(rtMs) * 40);
    const accuracyBonus =
      accuracy === null || accuracy === undefined
        ? 0
        : Math.round(clamp(accuracy, 0, 1) * 30);

    if (correct) {
      return Math.max(
        25,
        Math.round(100 + difficultyBonus + speedBonus + accuracyBonus + bonus - penalty * 25)
      );
    }

    return Math.round(-35 - penalty * 30 + bonus);
  }

  function awardScore(input = {}) {
    const delta = computeDelta(input);
    score.value = Math.max(0, score.value + delta);
    lastDelta.value = delta;
    return delta;
  }

  function setBestScore(value) {
    bestScore.value = Number(value) || 0;
  }

  function resetScore() {
    score.value = 0;
    lastDelta.value = 0;
  }

  return {
    score,
    bestScore,
    lastDelta,
    awardScore,
    resetScore,
    setBestScore,
  };
}