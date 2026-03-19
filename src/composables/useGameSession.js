import { ref, computed } from "vue";

export function useGameSession(moduleId, category, version = "1.0") {
  const phase = ref("idle");
  const trialIndex = ref(0);
  const responses = ref([]);

  function startSession() {
    phase.value = "running";
    trialIndex.value = 0;
    responses.value = [];
  }

  function stopSession() {
    phase.value = "finished";
  }

  function resetSession() {
    phase.value = "idle";
    trialIndex.value = 0;
    responses.value = [];
  }

  function nextTrial() {
    trialIndex.value += 1;
  }

  function addResponse(response) {
    responses.value.push(response);
  }

  function buildPayload(summary, extra = {}) {
    return {
      module: moduleId,
      category,
      version,
      total_trials: responses.value.length,
      summary,
      responses: responses.value,
      ...extra,
      timestamp_iso: new Date().toISOString()
    };
  }

  const basePayload = computed(() => ({
    module: moduleId,
    category,
    version,
    total_trials: responses.value.length,
    responses: responses.value,
    timestamp_iso: new Date().toISOString()
  }));

  return {
    phase,
    trialIndex,
    responses,
    startSession,
    stopSession,
    resetSession,
    nextTrial,
    addResponse,
    buildPayload,
    basePayload
  };
}