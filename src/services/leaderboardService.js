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