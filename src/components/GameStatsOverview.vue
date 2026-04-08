<template>
  <div class="stats-card">
    <div class="stats-header">
      <h2>Štatistika všetkých hier</h2>
      <button @click="fetchStats" :disabled="loading">
        {{ loading ? "Načítavam..." : "Obnoviť" }}
      </button>
    </div>

    <p v-if="!user" class="stats-empty">
      Pre zobrazenie štatistiky sa najprv prihláste.
    </p>

    <p v-else-if="loading" class="stats-empty">
      Načítavam štatistiky...
    </p>

    <p v-else-if="errorMessage" class="stats-error">
      {{ errorMessage }}
    </p>

    <div v-else class="stats-grid">
      <article
        v-for="game in gameStats"
        :key="game.key"
        class="game-stat-card"
      >
        <div class="game-stat-top">
          <div>
            <h3>{{ game.name }}</h3>
            <p>{{ game.category }}</p>
          </div>
        </div>

        <p v-if="game.totalAttempts === 0" class="game-stat-empty">
          Zatiaľ bez pokusov.
        </p>

        <template v-else>
          <div class="game-stat-values">
            <div class="stat-row">
              <span>Pokusy</span>
              <strong>{{ game.totalAttempts }}</strong>
            </div>

            <div class="stat-row">
              <span>Best score</span>
              <strong>{{ formatNumber(game.bestScore) }}</strong>
            </div>

            <div class="stat-row">
              <span>Priemerné score</span>
              <strong>{{ formatNumber(game.avgScore) }}</strong>
            </div>

            <div class="stat-row">
              <span>Priemerná accuracy</span>
              <strong>{{ formatPercent(game.avgAccuracy) }}</strong>
            </div>

            <div class="stat-row">
              <span>Priemerný čas</span>
              <strong>{{ formatMs(game.avgDuration) }}</strong>
            </div>
          </div>

          <div class="game-stat-date">
            Naposledy hrané: {{ formatDate(game.lastPlayedAt) }}
          </div>
        </template>
      </article>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { subscribeToAuth } from "../services/authService";
import { loadMyAttempts } from "../services/historyService";

const user = ref(null);
const loading = ref(false);
const errorMessage = ref("");
const gameStats = ref([]);

const gameDefinitions = [
  { key: "nback", name: "N-Back", category: "Pamäť" },
  { key: "digitspan", name: "Digit Span", category: "Pamäť" },
  { key: "stroop", name: "Stroop", category: "Pozornosť" },
  { key: "gonogo", name: "Go / No-Go", category: "Pozornosť" },
  { key: "reaction", name: "Reaction Time", category: "Vnímanie" },
  { key: "visualsearch", name: "Visual Search", category: "Vnímanie" },
  { key: "patternreasoning", name: "Pattern Reasoning", category: "Logické myslenie" },
  { key: "taskswitching", name: "Task Switching", category: "Logické myslenie" },
];

let unsubscribe = null;

onMounted(() => {
  unsubscribe = subscribeToAuth(async (firebaseUser) => {
    user.value = firebaseUser;

    if (firebaseUser) {
      await fetchStats();
    } else {
      gameStats.value = buildEmptyStats();
    }
  });
});

onUnmounted(() => {
  if (unsubscribe) unsubscribe();
});

function buildEmptyStats() {
  return gameDefinitions.map((game) => ({
    ...game,
    totalAttempts: 0,
    bestScore: null,
    avgScore: null,
    avgAccuracy: null,
    avgDuration: null,
    lastPlayedAt: null,
  }));
}

async function fetchStats() {
  if (!user.value) return;

  loading.value = true;
  errorMessage.value = "";

  try {
    const attempts = await loadMyAttempts();

    gameStats.value = gameDefinitions.map((game) => {
      const list = attempts.filter((attempt) => attempt.gameKey === game.key);

      if (list.length === 0) {
        return {
          ...game,
          totalAttempts: 0,
          bestScore: null,
          avgScore: null,
          avgAccuracy: null,
          avgDuration: null,
          lastPlayedAt: null,
        };
      }

      const scores = list
        .map((item) => Number(item.score))
        .filter((value) => Number.isFinite(value));

      const accuracies = list
        .map((item) => Number(item.accuracy))
        .filter((value) => Number.isFinite(value));

      const durations = list
        .map((item) => Number(item.durationMs))
        .filter((value) => Number.isFinite(value));

      const lastPlayedAt = list.reduce((latest, item) => {
        const currentTime = getTimestampValue(item.createdAt);
        const latestTime = getTimestampValue(latest);
        return currentTime > latestTime ? item.createdAt : latest;
      }, null);

      return {
        ...game,
        totalAttempts: list.length,
        bestScore: scores.length ? Math.max(...scores) : null,
        avgScore: scores.length ? average(scores) : null,
        avgAccuracy: accuracies.length ? average(accuracies) : null,
        avgDuration: durations.length ? average(durations) : null,
        lastPlayedAt,
      };
    });
  } catch (error) {
    console.error("Failed to load game stats:", error);
    errorMessage.value = "Nepodarilo sa načítať štatistiky hier.";
    gameStats.value = buildEmptyStats();
  } finally {
    loading.value = false;
  }
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getTimestampValue(timestamp) {
  if (!timestamp) return 0;
  if (typeof timestamp.toDate === "function") {
    return timestamp.toDate().getTime();
  }
  return new Date(timestamp).getTime();
}

function formatNumber(value) {
  if (value === null || value === undefined) return "—";
  return Number(value).toFixed(1);
}

function formatPercent(value) {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toFixed(1)}%`;
}

function formatMs(value) {
  if (value === null || value === undefined) return "—";
  return `${Math.round(Number(value))} ms`;
}

function formatDate(timestamp) {
  if (!timestamp) return "—";

  const date =
    typeof timestamp.toDate === "function"
      ? timestamp.toDate()
      : new Date(timestamp);

  return date.toLocaleString();
}
</script>

<style scoped>
.stats-card {
  margin-bottom: 18px;
  padding: 16px;
  border: 1px solid #dbe2ea;
  border-radius: 16px;
  background: #f8fafc;
}

.stats-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.stats-header h2 {
  margin: 0;
  font-size: 22px;
}

.stats-header button {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  background: white;
  cursor: pointer;
}

.stats-empty {
  margin: 0;
  color: #475569;
}

.stats-error {
  margin: 0;
  color: #b91c1c;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(260px, 1fr));
  gap: 14px;
}

.game-stat-card {
  padding: 14px;
  border-radius: 14px;
  background: white;
  border: 1px solid #e2e8f0;
}

.game-stat-top h3 {
  margin: 0 0 4px;
  font-size: 20px;
}

.game-stat-top p {
  margin: 0 0 12px;
  color: #64748b;
  font-size: 14px;
}

.game-stat-values {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid #eef2f7;
}

.stat-row span {
  color: #475569;
}

.stat-row strong {
  color: #0f172a;
}

.game-stat-empty {
  margin: 8px 0 0;
  color: #64748b;
}

.game-stat-date {
  margin-top: 12px;
  font-size: 13px;
  color: #64748b;
}

@media (max-width: 900px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>