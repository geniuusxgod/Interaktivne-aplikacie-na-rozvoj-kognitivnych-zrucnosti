import {
  addDoc,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

function buildStatId(uid, gameKey, modeKey = null) {
  return modeKey ? `${uid}_${gameKey}_${modeKey}` : `${uid}_${gameKey}`;
}

export async function getUserGameStat(uid, gameKey, modeKey = null) {
  const statId = buildStatId(uid, gameKey, modeKey);
  const statRef = doc(db, "gameStats", statId);
  const statSnap = await getDoc(statRef);

  if (!statSnap.exists()) return null;
  return { id: statSnap.id, ...statSnap.data() };
}

export async function saveAttempt({
  uid,
  username,
  gameKey,
  modeKey = null,
  score,
  accuracy = null,
  durationMs = null,
  difficultyStart = null,
  difficultyEnd = null,
  rawPayload = null,
}) {
  await addDoc(collection(db, "users", uid, "attempts"), {
    gameKey,
    modeKey,
    score,
    accuracy,
    durationMs,
    difficultyStart,
    difficultyEnd,
    rawPayload,
    createdAt: serverTimestamp(),
  });

  const statId = buildStatId(uid, gameKey, modeKey);
  const statRef = doc(db, "gameStats", statId);
  const statSnap = await getDoc(statRef);

  if (!statSnap.exists()) {
    const newStat = {
      uid,
      username,
      gameKey,
      modeKey,
      bestScore: score,
      totalAttempts: 1,
      avgScore: score,
      lastPlayedAt: serverTimestamp(),
    };

    await setDoc(statRef, newStat);

    return {
      ...newStat,
      bestScore: score,
    };
  }

  const old = statSnap.data();
  const totalAttempts = (old.totalAttempts || 0) + 1;
  const avgScore =
    (((old.avgScore || 0) * (totalAttempts - 1)) + score) / totalAttempts;
  const bestScore = Math.max(old.bestScore || 0, score);

  await updateDoc(statRef, {
    username,
    modeKey,
    bestScore,
    totalAttempts,
    avgScore,
    lastPlayedAt: serverTimestamp(),
  });

  return {
    ...old,
    username,
    modeKey,
    bestScore,
    totalAttempts,
    avgScore,
  };
}