import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyBzbIXmeNlVnq5GkA6xp1OpKh-MceVWoDs",
  authDomain: "kognitivne-aplikacie.firebaseapp.com",
  projectId: "kognitivne-aplikacie",
  storageBucket: "kognitivne-aplikacie.firebasestorage.app",
  messagingSenderId: "878224346216",
  appId: "1:878224346216:web:099358035feadeb8dc7fdd",
  measurementId: "G-GL0W3H14VV"
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)