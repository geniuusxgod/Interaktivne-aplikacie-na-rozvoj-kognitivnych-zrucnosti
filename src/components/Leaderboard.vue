<template>
  <div class="leaderboard-card">
    <div class="leaderboard-header">
      <h2>Rebríček</h2>

      <div class="leaderboard-controls">
        <select v-model="selectedGame" @change="handleGameChange">
          <option value="stroop">Stroop</option>
          <option value="nback">N-Back</option>
          <option value="digitspan">Digit Span</option>
          <option value="gonogo">Go / No-Go</option>
          <option value="reaction">Reaction Time</option>
          <option value="visualsearch">Visual Search</option>
          <option value="patternreasoning">Pattern Reasoning</option>
          <option value="taskswitching">Task Switching</option>
        </select>

        <select
          v-if="availableModes.length"
          v-model="selectedMode"
          @change="fetchLeaderboard"
        >
          <option
            v-for="mode in availableModes"
            :key="mode.value"
            :value="mode.value"
          >
            {{ mode.label }}
          </option>
        </select>

        <button @click="fetchLeaderboard" :disabled="loading">
          {{ loading ? "Načítavam..." : "Obnoviť" }}
        </button>
      </div>
    </div>

    <p v-if="loading" class="leaderboard-empty">
      Načítavam rebríček...
    </p>

    <p v-else-if="errorMessage" class="leaderboard-error">
      {{ errorMessage }}
    </p>

    <p v-else-if="rows.length === 0" class="leaderboard-empty">
      Zatiaľ nie sú dostupné žiadne výsledky.
    </p>

    <div v-else class="leaderboard-list">
      <div
        v-for="(row, index) in rows"
        :key="row.id"
        class="leaderboard-item"
      >
        <div class="leaderboard-rank">
          #{{ index + 1 }}
        </div>

        <div class="leaderboard-main">
          <div class="leaderboard-name">
            {{ row.username || row.uid }}
          </div>

          <div class="leaderboard-meta">
            <span>Best score: {{ row.bestScore }}</span>
            <span>Attempts: {{ row.totalAttempts }}</span>
            <span>Avg score: {{ formatNumber(row.avgScore) }}</span>
            <span v-if="row.modeKey">Mode: {{ formatMode(row.modeKey) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { loadLeaderboard } from '../services/leaderboardService'

const selectedGame = ref('stroop')
const selectedMode = ref('')
const rows = ref([])
const loading = ref(false)
const errorMessage = ref('')

const modeMap = {
  nback: [
    { value: '1back', label: '1-back' },
    { value: '2back', label: '2-back' },
    { value: '3back', label: '3-back' },
    { value: '4back', label: '4-back' },
  ],
  digitspan: [
    { value: 'forward', label: 'Forward' },
    { value: 'backward', label: 'Backward' },
  ],
}

const availableModes = computed(() => modeMap[selectedGame.value] || [])

onMounted(() => {
  handleGameChange()
})

function handleGameChange() {
  selectedMode.value = availableModes.value.length
    ? availableModes.value[0].value
    : ''
  fetchLeaderboard()
}

async function fetchLeaderboard() {
  loading.value = true
  errorMessage.value = ''

  try {
    rows.value = await loadLeaderboard(
      selectedGame.value,
      selectedMode.value || null,
      10
    )
  } catch (error) {
    console.error('Failed to load leaderboard:', error)
    errorMessage.value = 'Nepodarilo sa načítať rebríček.'
  } finally {
    loading.value = false
  }
}

function formatNumber(value) {
  if (value === null || value === undefined) return '—'
  return Number(value).toFixed(1)
}

function formatMode(modeKey) {
  const labels = {
    '2back': '2-back',
    '3back': '3-back',
    '4back': '4-back',
    forward: 'Forward',
    backward: 'Backward',
  }

  return labels[modeKey] || modeKey
}
</script>

<style scoped>
.leaderboard-card {
  margin-top: 18px;
  padding: 16px;
  border: 1px solid #dbe2ea;
  border-radius: 16px;
  background: #f8fafc;
}

.leaderboard-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.leaderboard-header h2 {
  margin: 0;
  font-size: 22px;
}

.leaderboard-controls {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.leaderboard-controls select,
.leaderboard-controls button {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  background: white;
  font: inherit;
}

.leaderboard-controls button {
  cursor: pointer;
}

.leaderboard-empty {
  margin: 0;
  color: #475569;
}

.leaderboard-error {
  margin: 0;
  color: #b91c1c;
}

.leaderboard-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.leaderboard-item {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 14px;
  border-radius: 14px;
  background: white;
  border: 1px solid #e2e8f0;
}

.leaderboard-rank {
  min-width: 54px;
  font-size: 20px;
  font-weight: 800;
  color: #1d4ed8;
}

.leaderboard-main {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.leaderboard-name {
  font-weight: 700;
  color: #0f172a;
}

.leaderboard-meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  color: #475569;
  font-size: 14px;
}
</style>