import { ref, computed } from "vue";

export function useAdaptiveDifficulty(options = {}) {
  const minDifficulty = options.minDifficulty ?? 1;
  const maxDifficulty = options.maxDifficulty ?? 5;
  const startDifficulty = options.startDifficulty ?? 1;
  const successThreshold = options.successThreshold ?? 2;

  const difficulty = ref(startDifficulty);
  const successStreak = ref(0);

  function resetDifficulty() {
    difficulty.value = startDifficulty;
    successStreak.value = 0;
  }

  function updateDifficulty(wasSuccessful) {
    if (wasSuccessful) {
      successStreak.value += 1;

      if (successStreak.value >= successThreshold) {
        difficulty.value = Math.min(maxDifficulty, difficulty.value + 1);
        successStreak.value = 0;
      }
    } else {
      difficulty.value = Math.max(minDifficulty, difficulty.value - 1);
      successStreak.value = 0;
    }
  }

  const difficultyLabel = computed(() => {
    if (difficulty.value === 1) return "1 - nízka";
    if (difficulty.value === 2) return "2 - mierna";
    if (difficulty.value === 3) return "3 - stredná";
    if (difficulty.value === 4) return "4 - vyššia";
    return "5 - vysoká";
  });

  return {
    difficulty,
    difficultyLabel,
    successStreak,
    resetDifficulty,
    updateDifficulty
  };
}