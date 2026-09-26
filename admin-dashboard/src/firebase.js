import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

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