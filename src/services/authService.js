import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'

export async function registerUser(email, password, username) {
  const cred = await createUserWithEmailAndPassword(auth, email, password)

  if (username) {
    await updateProfile(cred.user, { displayName: username })
  }

  await setDoc(doc(db, 'users', cred.user.uid), {
    username,
    email,
    createdAt: serverTimestamp(),
  })

  return cred.user
}

export async function loginUser(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password)
  return cred.user
}

export async function logoutUser() {
  await signOut(auth)
}

export function subscribeToAuth(callback) {
  return onAuthStateChanged(auth, callback)
}