<template>
  <div class="app">
    <div class="menu">
      <button @click="current = 'nback'">N-Back</button>
      <button @click="current = 'digit'">Digit Span</button>
      <button @click="current = 'stroop'">Stroop</button>
      <button @click="current = 'gonogo'">Go / No-Go</button>
      <button @click="current = 'reaction'">Reaction Time</button>
    </div>

    <MemoryNBack v-if="current === 'nback'" />
    <DigitSpan v-else-if="current === 'digit'" />
    <StroopTask v-else-if="current === 'stroop'" />
    <GoNoGoTask v-else-if="current === 'gonogo'" />
    <ReactionTime v-else-if="current === 'reaction'" />
  </div>
</template>

<script setup>
import { ref } from "vue";
import MemoryNBack from "./components/MemoryNBack.vue";
import DigitSpan from "./components/DigitSpan.vue";
import StroopTask from "./components/Stroop.vue";
import GoNoGoTask from "./components/GoNoGo.vue";
import ReactionTime from "./components/ReactionTime.vue";

const current = ref("nback");
</script>

<style scoped>
.app {
  padding: 20px;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial;
}
.menu {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
button {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid #ccc;
  background: white;
  cursor: pointer;
}
</style>