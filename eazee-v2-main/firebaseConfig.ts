import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence, getAuth, Auth } from 'firebase/auth';
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: 'AIzaSyB4rgz75RZ6-2s3toXX2bTZAKhsyBpDkVY',
  authDomain: 'wave-9b0c3.firebaseapp.com',
  projectId: 'wave-9b0c3',
  storageBucket: 'wave-9b0c3.appspot.com',
  messagingSenderId: '730804993815',
  appId: '1:730804993815:web:3d26884881faa22f1b0152',
  measurementId: 'G-RKB7T8X16X',
};

// Initialize Primary App
let app: FirebaseApp;
const existingApps = getApps();
if (existingApps.length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  // If apps exist, get the default app.
  app = getApp();
}

// Initialize Primary Auth with Persistence
let auth: Auth;
try {
  // Initialize auth with persistence settings.
  // This configures the auth service for the 'app' instance.
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} catch (error: any) {
  if (error.code === 'auth/already-initialized') {
    // This can happen with hot reloading. Get the existing auth instance.
    auth = getAuth(app);
  } else {
    // For other errors, log them.
    console.error("Firebase Auth initialization error:", error);
    auth = getAuth(app); // Fallback, persistence may not be configured.
  }
}

export default app;
export { auth };