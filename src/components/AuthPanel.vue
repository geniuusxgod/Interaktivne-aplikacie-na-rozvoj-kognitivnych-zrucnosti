<template>
  <div class="auth-card">
    <div v-if="loading" class="auth-loading">
      Verifying the user...
    </div>

    <template v-else>
      <div v-if="user" class="auth-user">
        <div class="auth-user-info">
          <div class="auth-label">User</div>
          <div class="auth-name">
            {{ user.displayName || user.email }}
          </div>
          <div class="auth-email">{{ user.email }}</div>
        </div>

        <button class="auth-logout" @click="handleLogout" :disabled="pending">
          {{ pending ? "Logging out..." : "Logout" }}
        </button>
      </div>

      <div v-else>
        <div class="auth-tabs">
          <button
            :class="['auth-tab', { active: mode === 'login' }]"
            @click="setMode('login')"
            type="button"
          >
            Login
          </button>
          <button
            :class="['auth-tab', { active: mode === 'register' }]"
            @click="setMode('register')"
            type="button"
          >
            Registration
          </button>
        </div>

        <form class="auth-form" @submit.prevent="handleSubmit">
          <input
            v-if="mode === 'register'"
            v-model.trim="username"
            type="text"
            placeholder="Username"
          />

          <input
            v-model.trim="email"
            type="email"
            placeholder="Email"
          />

          <input
            v-model="password"
            type="password"
            placeholder="Password"
          />

          <p v-if="errorMessage" class="auth-error">
            {{ errorMessage }}
          </p>

          <button class="auth-submit" type="submit" :disabled="pending">
            {{ pending ? "Waiting..." : mode === 'login' ? "Login" : "Registration" }}
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
import { map } from "firebase/firestore/pipelines";

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
    return "This email is already in use.";
  }

  if (code.includes("auth/invalid-email")) {
    return "Invalid email format.";
  }

  if (code.includes("auth/user-not-found") || code.includes("auth/wrong-password") || code.includes("auth/invalid-credential")) {
    return "Invalid email or password.";
  }

  if (code.includes("auth/weak-password")) {
    return "Password is too weak. Use at least 6 characters.";
  }

  if (code.includes("auth/missing-password")) {
    return "Please enter a password.";
  }

  return "An error occurred. Please check your details and try again.";
}

async function handleSubmit() {
  errorMessage.value = "";

  if (!email.value || !password.value) {
    errorMessage.value = "Please enter email and password.";
    return;
  }

  if (mode.value === "register" && !username.value) {
    errorMessage.value = "Please enter a username.";
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
  errorMessage.value = mapFirebaseError(error);

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
  max-width: 760px;
  margin: 0 auto 18px;
  padding: 20px;
  border: 1px solid #dbe2ea;
  border-radius: 16px;
  background: #f8fafc;
}

.auth-loading {
  color: #475569;
  text-align: center;
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
  justify-content: center;
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
  max-width: 560px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.auth-form input {
  width: 100%;
  box-sizing: border-box;
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
  text-align: center;
}

.auth-submit,
.auth-logout {
  align-self: center;
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