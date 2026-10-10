import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getDatabase, connectDatabaseEmulator } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCTL9eEsRsWrgEj6a6Tt7PVKyr8f9vrJd4",
  authDomain: "smartcurb-d174e.firebaseapp.com",
  projectId: "smartcurb-d174e",
  storageBucket: "smartcurb-d174e.firebasestorage.app",
  messagingSenderId: "340226665938",
  appId: "1:340226665938:web:1d3139eaacb8b722aa6c0b",
  measurementId: "G-RK4N8WVDBM"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const database = getDatabase(app);

// npm run dev:emulator talks to local emulators instead of the real project.
export const USING_EMULATORS = import.meta.env.VITE_USE_EMULATORS === "true";
if (USING_EMULATORS) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectDatabaseEmulator(database, "127.0.0.1", 9000);
}

export const emailKey = (email) => email.trim().toLowerCase().replace(/\./g, ",");
export const DATA_ROOT = import.meta.env.VITE_DATA_ROOT || "";
export const dataPath = (path) => DATA_ROOT + path;
