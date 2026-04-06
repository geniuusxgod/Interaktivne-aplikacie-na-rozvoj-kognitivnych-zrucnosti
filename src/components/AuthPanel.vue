<template>
  <div class="auth-card">
    <div v-if="loading" class="auth-loading">
      Проверка пользователя...
    </div>

    <template v-else>
      <div v-if="user" class="auth-user">
        <div class="auth-user-info">
          <div class="auth-label">Пользователь</div>
          <div class="auth-name">
            {{ user.displayName || user.email }}
          </div>
          <div class="auth-email">{{ user.email }}</div>
        </div>

        <button class="auth-logout" @click="handleLogout" :disabled="pending">
          {{ pending ? "Выход..." : "Выйти" }}
        </button>
      </div>

      <div v-else>
        <div class="auth-tabs">
          <button
            :class="['auth-tab', { active: mode === 'login' }]"
            @click="setMode('login')"
            type="button"
          >
            Вход
          </button>
          <button
            :class="['auth-tab', { active: mode === 'register' }]"
            @click="setMode('register')"
            type="button"
          >
            Регистрация
          </button>
        </div>

        <form class="auth-form" @submit.prevent="handleSubmit">
          <input
            v-if="mode === 'register'"
            v-model.trim="username"
            type="text"
            placeholder="Имя пользователя"
          />

          <input
            v-model.trim="email"
            type="email"
            placeholder="Email"
          />

          <input
            v-model="password"
            type="password"
            placeholder="Пароль"
          />

          <p v-if="errorMessage" class="auth-error">
            {{ errorMessage }}
          </p>

          <button class="auth-submit" type="submit" :disabled="pending">
            {{ pending ? "Подождите..." : mode === 'login' ? "Войти" : "Зарегистрироваться" }}
          </button>
        </form>
      </div>
    </template>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import {
  loginUser,
  logoutUser,
  registerUser,
  subscribeToAuth,
} from "../services/authService";

const mode = ref("login");
const user = ref(null);
const loading = ref(true);
const pending = ref(false);

const username = ref("");
const email = ref("");
const password = ref("");
const errorMessage = ref("");

let unsubscribe = null;

onMounted(() => {
  unsubscribe = subscribeToAuth((firebaseUser) => {
    user.value = firebaseUser;
    loading.value = false;
  });
});

onUnmounted(() => {
  if (unsubscribe) unsubscribe();
});

function setMode(nextMode) {
  mode.value = nextMode;
  errorMessage.value = "";
}

function mapFirebaseError(error) {
  const code = error?.code || "";

  if (code.includes("auth/email-already-in-use")) {
    return "Этот email уже используется.";
  }

  if (code.includes("auth/invalid-email")) {
    return "Неверный формат email.";
  }

  if (code.includes("auth/user-not-found") || code.includes("auth/wrong-password") || code.includes("auth/invalid-credential")) {
    return "Неверный email или пароль.";
  }

  if (code.includes("auth/weak-password")) {
    return "Пароль слишком слабый. Используй минимум 6 символов.";
  }

  if (code.includes("auth/missing-password")) {
    return "Введите пароль.";
  }

  return "Произошла ошибка. Проверь данные и попробуй снова.";
}

async function handleSubmit() {
  errorMessage.value = "";

  if (!email.value || !password.value) {
    errorMessage.value = "Введите email и пароль.";
    return;
  }

  if (mode.value === "register" && !username.value) {
    errorMessage.value = "Введите имя пользователя.";
    return;
  }

  pending.value = true;

  try {
    if (mode.value === "register") {
      await registerUser(email.value, password.value, username.value);
    } else {
      await loginUser(email.value, password.value);
    }

    username.value = "";
    email.value = "";
    password.value = "";
  } catch (error) {
  console.error("FIREBASE ERROR:", error)
  errorMessage.value = `${error.code || "unknown"}: ${error.message || "No message"}`

  } finally {
    pending.value = false;
  }
}

async function handleLogout() {
  errorMessage.value = "";
  pending.value = true;

  try {
    await logoutUser();
  } catch (error) {
    errorMessage.value = mapFirebaseError(error);
  } finally {
    pending.value = false;
  }
}
</script>

<style scoped>
.auth-card {
  margin-bottom: 18px;
  padding: 16px;
  border: 1px solid #dbe2ea;
  border-radius: 16px;
  background: #f8fafc;
}

.auth-loading {
  color: #475569;
}

.auth-user {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
}

.auth-user-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.auth-label {
  font-size: 12px;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.auth-name {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.auth-email {
  font-size: 14px;
  color: #475569;
}

.auth-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}

.auth-tab {
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  background: white;
  cursor: pointer;
}

.auth-tab.active {
  background: #e2e8f0;
  border-color: #94a3b8;
  font-weight: 600;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.auth-form input {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  outline: none;
  font: inherit;
}

.auth-form input:focus {
  border-color: #64748b;
}

.auth-error {
  margin: 0;
  color: #b91c1c;
  font-size: 14px;
}

.auth-submit,
.auth-logout {
  align-self: flex-start;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  background: white;
  cursor: pointer;
}

.auth-submit:disabled,
.auth-logout:disabled {
  opacity: 0.7;
  cursor: default;
}
</style>