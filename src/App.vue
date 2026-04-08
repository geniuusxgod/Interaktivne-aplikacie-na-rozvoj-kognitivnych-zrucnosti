<template>
  <div class="app">
    <template v-if="currentUser">
      <header class="hero hero-logged">
        <div class="hero-center">
          <h1 class="page-title">Kognitívne aplikácie</h1>
        </div>

        <div class="hero-auth">
          <AuthPanel />
        </div>
      </header>
    </template>

    <template v-else>
      <header class="hero hero-guest">
        <h1 class="page-title">Kognitívne aplikácie</h1>
      </header>

      <div class="auth-standalone">
        <AuthPanel />
      </div>
    </template>

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
            <p>Vyberte si kategóriu a spustite jednu z hier.</p>
          </div>
        </div>

        <div class="categories-grid">
          <article
            v-for="category in gameCategories"
            :key="category.key"
            :class="['category-card', { active: currentCategory === category.key }]"
          >
            <button class="category-head" @click="selectCategory(category.key)">
              <h3>{{ category.title }}</h3>
              <p>{{ category.description }}</p>
            </button>

            <div class="category-games">
              <button
                v-for="game in category.games"
                :key="game.key"
                :class="['category-game-btn', { active: currentGame === game.key }]"
                @click="startGame(category.key, game.key)"
              >
                <span class="category-game-name">{{ game.name }}</span>
                <span class="category-game-desc">{{ game.description }}</span>
              </button>
            </div>
          </article>
        </div>

        <div v-if="currentGameMeta" class="selected-game-card">
          <div class="selected-game-header">
            <div>
              <h3>{{ currentGameMeta.name }}</h3>
              <p>{{ currentGameMeta.description }}</p>
            </div>

            <button class="clear-game-btn" @click="currentGame = null">
              Zavrieť hru
            </button>
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
        </div>
      </section>

      <section v-else-if="activeTab === 'stats'" class="section-card">
        <div class="section-header">
          <div>
            <h2>Moja štatistika</h2>
            <p>Prehľad používateľa a história pokusov.</p>
          </div>
        </div>
        <GameStatsOverview />
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
import { computed, onMounted, onUnmounted, ref } from "vue";
import AuthPanel from "./components/AuthPanel.vue";
import UserHistory from "./components/UserHistory.vue";
import Leaderboard from "./components/Leaderboard.vue";
import GameStatsOverview from "./components/GameStatsOverview.vue";

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
const currentCategory = ref("memory");
const currentGame = ref(null);

const gameCategories = [
  {
    key: "memory",
    title: "Pamäť",
    description: "Úlohy zamerané na pracovnú a krátkodobú pamäť.",
    games: [
      {
        key: "nback",
        name: "N-Back",
        description: "Sledovanie a porovnávanie podnetov o N krokov späť.",
      },
      {
        key: "digit",
        name: "Digit Span",
        description: "Zapamätanie a reprodukcia číselných sekvencií.",
      },
    ],
  },
  {
    key: "attention",
    title: "Pozornosť",
    description: "Úlohy na koncentráciu, inhibíciu a kontrolu reakcií.",
    games: [
      {
        key: "stroop",
        name: "Stroop",
        description: "Určenie správnej farby pri konfliktných podnetoch.",
      },
      {
        key: "gonogo",
        name: "Go / No-Go",
        description: "Rýchla reakcia len na správne podnety.",
      },
    ],
  },
  {
    key: "perception",
    title: "Vnímanie",
    description: "Úlohy na rýchlosť spracovania a vizuálne vyhľadávanie.",
    games: [
      {
        key: "reaction",
        name: "Reaction Time",
        description: "Meranie rýchlosti reakcie na vizuálny signál.",
      },
      {
        key: "visual",
        name: "Visual Search",
        description: "Vyhľadávanie cieľového objektu medzi rušivými prvkami.",
      },
    ],
  },
  {
    key: "logic",
    title: "Logické myslenie",
    description: "Úlohy na pravidlá, prepínanie a vzťahy medzi podnetmi.",
    games: [
      {
        key: "pattern",
        name: "Pattern Reasoning",
        description: "Doplnenie správneho vzoru podľa logiky.",
      },
      {
        key: "taskswitch",
        name: "Task Switching",
        description: "Prepínanie medzi pravidlami podľa zadania.",
      },
    ],
  },
];

const currentGameMeta = computed(() => {
  for (const category of gameCategories) {
    const found = category.games.find((game) => game.key === currentGame.value);
    if (found) return found;
  }
  return null;
});

let unsubscribe = null;

onMounted(() => {
  unsubscribe = subscribeToAuth((user) => {
    currentUser.value = user;
    authLoading.value = false;

    if (!user) {
      activeTab.value = "games";
      currentCategory.value = "memory";
      currentGame.value = null;
    }
  });
});

onUnmounted(() => {
  if (unsubscribe) unsubscribe();
});

function selectCategory(categoryKey) {
  currentCategory.value = categoryKey;
}

function startGame(categoryKey, gameKey) {
  currentCategory.value = categoryKey;
  currentGame.value = gameKey;
}
</script>

<style scoped>
.app {
  max-width: 1320px;
  margin: 0 auto;
  padding: 28px 24px 40px;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
}

.hero {
  margin-bottom: 24px;
}

.hero-guest {
  display: flex;
  justify-content: center;
}

.hero-logged {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 24px;
}

.hero-center {
  flex: 1;
  display: flex;
  justify-content: flex-start;
}

.page-title {
  margin: 0;
  text-align: left;
  font-size: 42px;
  font-weight: 800;
  line-height: 1.1;
}

.page-title {
  margin: 0;
  text-align: center;
  font-size: 42px;
  font-weight: 800;
  line-height: 1.1;
}

.hero-auth {
  width: 360px;
}

.hero-auth :deep(.auth-card) {
  margin: 0;
  padding: 22px 24px;
  border: 1px solid #e5e7eb;
  border-radius: 24px;
  background: #ffffff;
}

.hero-auth :deep(.auth-logout) {
  align-self: center;
  min-width: 108px;
}

.auth-standalone {
  max-width: 760px;
  margin: 0 auto 18px;
}

.state-card {
  max-width: 760px;
  margin: 18px auto 0;
  padding: 18px;
  border: 1px solid #dbe2ea;
  border-radius: 18px;
  background: #f8fafc;
}

.section-card {
  margin-top: 18px;
  padding: 28px;
  border: 1px solid #dbe2ea;
  border-radius: 28px;
  background: #f8fafc;
}

.top-tabs {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 8px;
  margin-bottom: 18px;
}

.top-tab {
  padding: 10px 18px;
  border-radius: 12px;
  border: 1px solid #d6dbe3;
  background: #fff;
  cursor: pointer;
  font: inherit;
  font-weight: 700;
}

.top-tab.active {
  background: #eef2f7;
  border-color: #b8c1cc;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 22px;
}

.section-header h2 {
  margin: 0 0 4px;
  font-size: 28px;
}

.section-header p {
  margin: 0;
  color: #475569;
}

.categories-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(220px, 1fr));
  gap: 22px;
}

.category-card {
  min-height: 310px;
  padding: 18px;
  border-radius: 24px;
  border: 1px solid #d9dde4;
  background: #ffffff;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.category-card.active {
  border-color: #aeb8c5;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.12);
}

.category-head {
  padding: 0;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.category-head h3 {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 800;
  color: #0f172a;
}

.category-head p {
  margin: 0;
  color: #64748b;
  line-height: 1.45;
}

.category-games {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: auto;
}

.category-game-btn {
  width: 100%;
  padding: 14px 14px;
  border-radius: 16px;
  border: 1px solid #dbe2ea;
  background: #f8fafc;
  text-align: left;
  cursor: pointer;
  transition: 0.15s ease;
}

.category-game-btn:hover {
  transform: translateY(-1px);
  border-color: #c4ced9;
  background: #f1f5f9;
}

.category-game-btn.active {
  border-color: #93c5fd;
  background: #dbeafe;
}

.category-game-name {
  display: block;
  font-size: 16px;
  font-weight: 800;
  color: #0f172a;
  margin-bottom: 4px;
}

.category-game-desc {
  display: block;
  font-size: 13px;
  color: #475569;
  line-height: 1.35;
}

.selected-game-card {
  margin-top: 28px;
  padding: 20px;
  border-radius: 24px;
  border: 1px solid #dbe2ea;
  background: #ffffff;
}

.selected-game-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 18px;
}

.selected-game-header h3 {
  margin: 0 0 6px;
  font-size: 24px;
}

.selected-game-header p {
  margin: 0;
  color: #64748b;
}

.clear-game-btn {
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid #cbd5e1;
  background: #fff;
  cursor: pointer;
  font: inherit;
  font-weight: 600;
}

.game-panel {
  margin-top: 4px;
}

@media (max-width: 1180px) {
  .hero-logged {
    grid-template-columns: 1fr;
  }

  .hero-center {
    justify-content: center;
  }

  .hero-auth {
    width: 100%;
    max-width: 420px;
    margin: 0 auto;
  }

  .categories-grid {
    grid-template-columns: repeat(2, minmax(240px, 1fr));
  }
}

@media (max-width: 700px) {
  .app {
    padding: 20px 14px 28px;
  }

  .page-title {
    font-size: 34px;
  }

  .section-card {
    padding: 18px;
    border-radius: 22px;
  }

  .categories-grid {
    grid-template-columns: 1fr;
  }

  .selected-game-header {
    flex-direction: column;
  }

  .top-tabs {
    gap: 10px;
  }
}
</style>