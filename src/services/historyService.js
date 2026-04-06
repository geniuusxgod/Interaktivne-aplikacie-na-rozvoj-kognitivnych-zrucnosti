import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { auth, db } from '../firebase'

export async function loadMyAttempts() {
  if (!auth.currentUser) return []

  const q = query(
    collection(db, 'users', auth.currentUser.uid, 'attempts'),
    orderBy('createdAt', 'desc')
  )

  const snap = await getDocs(q)

  return snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }))
}