import { ref } from "vue";

export function useInstantFeedback(options = {}) {
  const defaultDurationMs = options.durationMs ?? 700;

  const feedback = ref(null);
  const flashKind = ref("");
  let clearTimer = null;

  function clearFeedback() {
    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
    feedback.value = null;
    flashKind.value = "";
  }

  function showFeedback(input = {}) {
    const correct = Boolean(input.correct);
    const durationMs = input.durationMs ?? defaultDurationMs;

    clearFeedback();

    feedback.value = {
      kind: correct ? "ok" : "bad",
      text: correct
        ? (input.correctText ?? "Správne")
        : (input.incorrectText ?? "Nesprávne")
    };

    flashKind.value = correct ? "flash-ok" : "flash-bad";

    clearTimer = setTimeout(() => {
      feedback.value = null;
      flashKind.value = "";
      clearTimer = null;
    }, durationMs);
  }

  return {
    feedback,
    flashKind,
    showFeedback,
    clearFeedback
  };
}