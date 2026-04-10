import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import { db } from '../firebase'

export async function loadLeaderboard(gameKey, modeKey = null, topN = 10) {
  let q

  if (modeKey) {
    q = query(
      collection(db, 'gameStats'),
      where('gameKey', '==', gameKey),
      where('modeKey', '==', modeKey),
      orderBy('bestScore', 'desc'),
      limit(topN)
    )
  } else {
    q = query(
      collection(db, 'gameStats'),
      where('gameKey', '==', gameKey),
      orderBy('bestScore', 'desc'),
      limit(topN)
    )
  }

  const snap = await getDocs(q)

  return snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }))
}

export async function loadLeaderboardRanksForUser(uid, gameKeys = []) {
  if (!uid || !Array.isArray(gameKeys) || gameKeys.length === 0) {
    return {}
  }

  const uniqueGameKeys = [...new Set(gameKeys)].slice(0, 10)
  const q = query(
    collection(db, 'gameStats'),
    where('gameKey', 'in', uniqueGameKeys)
  )

  const snap = await getDocs(q)
  const scoresByGame = new Map()

  console.log("UID:", uid)
  console.log("GAME KEYS:", uniqueGameKeys)
  console.log("DOCS COUNT:", snap.docs.length)
  snap.docs.forEach((d) => console.log(d.id, d.data()))

  snap.forEach((docSnap) => {
    const data = docSnap.data()
    const gameKey = data.gameKey
    const rowUid = data.uid || docSnap.id.split('_')[0]
    const bestScore = Number(data.bestScore)

    if (!gameKey || !rowUid || !Number.isFinite(bestScore)) return

    if (!scoresByGame.has(gameKey)) {
      scoresByGame.set(gameKey, new Map())
    }

    const gameScores = scoresByGame.get(gameKey)
    const previousScore = gameScores.get(rowUid)

    if (previousScore === undefined || bestScore > previousScore) {
      gameScores.set(rowUid, bestScore)
    }
  })

  const ranks = {}

  for (const gameKey of uniqueGameKeys) {
    const gameScores = scoresByGame.get(gameKey)

    console.log("CHECK GAME:", gameKey)
    console.log("GAME SCORES EXISTS:", !!gameScores)

    if (gameScores) {
      console.log("AVAILABLE UIDS:", Array.from(gameScores.keys()).slice(0, 20))
      console.log("CURRENT USER SCORE:", gameScores.get(uid))
    }

    if (!gameScores || !gameScores.has(uid)) {
      ranks[gameKey] = null
      continue
    }

    const sorted = Array.from(gameScores.entries()).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]
      return a[0].localeCompare(b[0])
    })

    console.log("SORTED TOP:", sorted.slice(0, 10))

    const rankIndex = sorted.findIndex(([rowUid]) => rowUid === uid)
    ranks[gameKey] = rankIndex >= 0 ? rankIndex + 1 : null
  }

  console.log("FINAL RANKS:", ranks)
  return ranks
  
}