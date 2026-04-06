<template>
  <div class="history-card">
    <div class="history-header">
      <h2>História pokusov</h2>
      <button @click="fetchAttempts" :disabled="loading">
        {{ loading ? "Načítavam..." : "Obnoviť" }}
      </button>
    </div>

    <p v-if="!user" class="history-empty">
      Pre zobrazenie histórie sa najprv prihláste.
    </p>

    <p v-else-if="loading" class="history-empty">
      Načítavam históriu...
    </p>

    <p v-else-if="errorMessage" class="history-error">
      {{ errorMessage }}
    </p>

    <p v-else-if="attempts.length === 0" class="history-empty">
      Zatiaľ nemáte žiadne uložené pokusy.
    </p>

    <div v-else class="history-list">
      <div v-for="attempt in attempts" :key="attempt.id" class="history-item">
        <div class="history-top">
          <div class="history-game">{{ formatGameKey(attempt.gameKey) }}</div>
          <div class="history-score">Score: {{ attempt.score }}</div>
        </div>

        <div class="history-meta">
            <span>Accuracy: {{ formatNumber(attempt.accuracy) }}%</span>
            <span v-if="attempt.modeKey">Mode: {{ formatMode(attempt.modeKey) }}</span>
            <span>Difficulty: {{ attempt.difficultyStart ?? "—" }} → {{ attempt.difficultyEnd ?? "—" }}</span>
            <span>Avg RT: {{ attempt.durationMs ?? "—" }} ms</span>
        </div>

        <div class="history-date">
          {{ formatDate(attempt.createdAt) }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { subscribeToAuth } from '../services/authService'
import { loadMyAttempts } from '../services/historyService'

const user = ref(null)
const attempts = ref([])
const loading = ref(false)
const errorMessage = ref('')

let unsubscribe = null

onMounted(() => {
  unsubscribe = subscribeToAuth(async (firebaseUser) => {
    user.value = firebaseUser

    if (firebaseUser) {
      await fetchAttempts()
    } else {
      attempts.value = []
    }
  })
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
})

async function fetchAttempts() {
  if (!user.value) return

  loading.value = true
  errorMessage.value = ''

  try {
    attempts.value = await loadMyAttempts()
  } catch (error) {
    console.error('Failed to load attempts:', error)
    errorMessage.value = 'Nepodarilo sa načítať históriu pokusov.'
  } finally {
    loading.value = false
  }
}

function formatGameKey(gameKey) {
  const labels = {
    stroop: 'Stroop',
    nback: 'N-Back',
    digitspan: 'Digit Span',
    gonogo: 'Go / No-Go',
    reaction: 'Reaction Time',
    visualsearch: 'Visual Search',
    patternreasoning: 'Pattern Reasoning',
    taskswitching: 'Task Switching',
  }

  return labels[gameKey] || gameKey
}
function formatMode(modeKey) {
  const labels = {
    '1back': '1-back',
    '2back': '2-back',
    '3back': '3-back',
    '4back': '4-back',
    forward: 'Forward',
    backward: 'Backward',
  }

  return labels[modeKey] || modeKey
}

function formatNumber(value) {
  if (value === null || value === undefined) return '—'
  return Number(value).toFixed(1)
}

function formatDate(timestamp) {
  if (!timestamp) return '—'

  const date =
    typeof timestamp.toDate === 'function'
      ? timestamp.toDate()
      : new Date(timestamp)

  return date.toLocaleString()
}
</script>

<style scoped>
.history-card {
  margin-top: 18px;
  padding: 16px;
  border: 1px solid #dbe2ea;
  border-radius: 16px;
  background: #f8fafc;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.history-header h2 {
  margin: 0;
  font-size: 22px;
}

.history-header button {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  background: white;
  cursor: pointer;
}

.history-empty {
  margin: 0;
  color: #475569;
}

.history-error {
  margin: 0;
  color: #b91c1c;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.history-item {
  padding: 14px;
  border-radius: 14px;
  background: white;
  border: 1px solid #e2e8f0;
}

.history-top {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.history-game {
  font-weight: 700;
  color: #0f172a;
}

.history-score {
  font-weight: 700;
  color: #1d4ed8;
}

.history-meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  color: #475569;
  font-size: 14px;
  margin-bottom: 8px;
}

.history-date {
  font-size: 13px;
  color: #64748b;
}
</style>