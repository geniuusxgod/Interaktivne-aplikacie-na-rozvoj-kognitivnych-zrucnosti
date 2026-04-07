<template>
  <div class="app">
    <h1>Kognitívne aplikácie</h1>

    <AuthPanel />

    <div v-if="authLoading" class="state-card">
      Overujem prihlásenie...
    </div>

    <template v-else-if="!currentUser">
      <div class="state-card">
        Prihláste sa alebo sa zaregistrujte, aby ste mohli hrať miniaplikácie,
        ukladať výsledky, prezerať históriu pokusov a rebríček.
      </div>
    </template>

    <template v-else>
      <div class="top-tabs">
        <button
          :class="['top-tab', { active: activeTab === 'games' }]"
          @click="activeTab = 'games'"
        >
          Hry
        </button>

        <button
          :class="['top-tab', { active: activeTab === 'stats' }]"
          @click="activeTab = 'stats'"
        >
          Moja štatistika
        </button>

        <button
          :class="['top-tab', { active: activeTab === 'leaderboard' }]"
          @click="activeTab = 'leaderboard'"
        >
          Rebríček
        </button>
      </div>

      <section v-if="activeTab === 'games'" class="section-card">
        <div class="section-header">
          <div>
            <h2>Miniaplikácie</h2>
            <p>Vyberte si hru, ktorú chcete spustiť.</p>
          </div>
        </div>

        <div class="game-menu">
          <button :class="gameBtnClass('nback')" @click="currentGame = 'nback'">N-Back</button>
          <button :class="gameBtnClass('digit')" @click="currentGame = 'digit'">Digit Span</button>
          <button :class="gameBtnClass('stroop')" @click="currentGame = 'stroop'">Stroop</button>
          <button :class="gameBtnClass('gonogo')" @click="currentGame = 'gonogo'">Go / No-Go</button>
          <button :class="gameBtnClass('reaction')" @click="currentGame = 'reaction'">Reaction Time</button>
          <button :class="gameBtnClass('visual')" @click="currentGame = 'visual'">Visual Search</button>
          <button :class="gameBtnClass('pattern')" @click="currentGame = 'pattern'">Pattern Reasoning</button>
          <button :class="gameBtnClass('taskswitch')" @click="currentGame = 'taskswitch'">Task Switching</button>
        </div>

        <div class="game-panel">
          <MemoryNBack v-if="currentGame === 'nback'" />
          <DigitSpan v-else-if="currentGame === 'digit'" />
          <StroopTask v-else-if="currentGame === 'stroop'" />
          <GoNoGoTask v-else-if="currentGame === 'gonogo'" />
          <ReactionTime v-else-if="currentGame === 'reaction'" />
          <VisualSearch v-else-if="currentGame === 'visual'" />
          <PatternReasoning v-else-if="currentGame === 'pattern'" />
          <TaskSwitching v-else-if="currentGame === 'taskswitch'" />
        </div>
      </section>

      <section v-else-if="activeTab === 'stats'" class="section-card">
        <div class="section-header">
          <div>
            <h2>Moja štatistika</h2>
            <p>Prehľad používateľa a história pokusov.</p>
          </div>
        </div>

        <div class="profile-card">
          <div class="profile-item">
            <span class="profile-label">Používateľ</span>
            <span class="profile-value">
              {{ currentUser.displayName || 'Bez mena' }}
            </span>
          </div>

          <div class="profile-item">
            <span class="profile-label">Email</span>
            <span class="profile-value">{{ currentUser.email }}</span>
          </div>

          <div class="profile-item">
            <span class="profile-label">UID</span>
            <span class="profile-value uid">{{ currentUser.uid }}</span>
          </div>
        </div>

        <UserHistory />
      </section>

      <section v-else-if="activeTab === 'leaderboard'" class="section-card">
        <div class="section-header">
          <div>
            <h2>Rebríček</h2>
            <p>Porovnanie najlepších výsledkov medzi používateľmi.</p>
          </div>
        </div>

        <Leaderboard />
      </section>
    </template>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import AuthPanel from "./components/AuthPanel.vue";
import UserHistory from "./components/UserHistory.vue";
import Leaderboard from "./components/Leaderboard.vue";

import MemoryNBack from "./components/MemoryNBack.vue";
import DigitSpan from "./components/DigitSpan.vue";
import StroopTask from "./components/Stroop.vue";
import GoNoGoTask from "./components/GoNoGo.vue";
import ReactionTime from "./components/ReactionTime.vue";
import VisualSearch from "./components/VisualSearch.vue";
import PatternReasoning from "./components/PatternReasoning.vue";
import TaskSwitching from "./components/TaskSwitching.vue";

import { subscribeToAuth } from "./services/authService";

const authLoading = ref(true);
const currentUser = ref(null);

const activeTab = ref("games");
const currentGame = ref("nback");

let unsubscribe = null;

onMounted(() => {
  unsubscribe = subscribeToAuth((user) => {
    currentUser.value = user;
    authLoading.value = false;

    if (!user) {
      activeTab.value = "games";
      currentGame.value = "nback";
    }
  });
});

onUnmounted(() => {
  if (unsubscribe) unsubscribe();
});

function gameBtnClass(gameKey) {
  return ["game-btn", { active: currentGame.value === gameKey }];
}
</script>

<style scoped>
.app {
  max-width: 1280px;
  margin: 0 auto;
  padding: 20px;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
}

h1 {
  margin: 0 0 18px;
}

.state-card,
.section-card {
  margin-top: 18px;
  padding: 18px;
  border: 1px solid #dbe2ea;
  border-radius: 18px;
  background: #f8fafc;
}

.top-tabs {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 18px;
}

.top-tab {
  padding: 10px 16px;
  border-radius: 12px;
  border: 1px solid #cbd5e1;
  background: white;
  cursor: pointer;
  font: inherit;
  font-weight: 600;
}

.top-tab.active {
  background: #e2e8f0;
  border-color: #94a3b8;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}

.section-header h2 {
  margin: 0 0 4px;
}

.section-header p {
  margin: 0;
  color: #475569;
}

.game-menu {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}

.game-btn {
  padding: 9px 14px;
  border-radius: 12px;
  border: 1px solid #cbd5e1;
  background: white;
  cursor: pointer;
  font: inherit;
}

.game-btn.active {
  background: #dbeafe;
  border-color: #93c5fd;
  font-weight: 700;
}

.game-panel {
  margin-top: 4px;
}

.profile-card {
  display: grid;
  gap: 12px;
  margin-bottom: 18px;
  padding: 16px;
  border-radius: 16px;
  background: white;
  border: 1px solid #e2e8f0;
}

.profile-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
}

.profile-value {
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}

.profile-value.uid {
  font-size: 14px;
  word-break: break-all;
}
</style>