import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';

// Default empty config to prevent build crash
let firebaseConfig: FirebaseOptions & { firestoreDatabaseId?: string } = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || "(default)"
};

// Try to override with local config if exists
try {
  // @ts-ignore
  const localConfig = await import(/* @vite-ignore */ '../../firebase-applet-config.json');
  if (localConfig && localConfig.default) {
    firebaseConfig = { ...firebaseConfig, ...localConfig.default };
  } else if (localConfig) {
    firebaseConfig = { ...firebaseConfig, ...localConfig };
  }
} catch (e) {
  // Config file missing or invalid, using env vars
  console.warn("Firebase config file not found, falling back to environment variables.");
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Access control is now managed via app-level env variable VITE_ACCESS_KEY

// Test connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error: any) {
    if (error.message?.includes('the client is offline')) {
      console.error("Firebase is offline. Check your configuration.");
    }
  }
}
testConnection();
