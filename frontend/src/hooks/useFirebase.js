import { useEffect, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { firebaseConfig, initialAuthToken } from "../config/appConfig";

/**
 * Initializes Firebase, authenticates, and returns core services.
 */
export const useFirebase = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    try {
      if (!firebaseConfig || Object.keys(firebaseConfig).length === 0) {
        console.error("Firebase config is missing or empty.");
        // We still set isAuthReady to true to allow the app to render, but storage will fail.
        setIsAuthReady(true);
        return;
      }
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const authService = getAuth(app);

      setDb(firestore);
      setAuth(authService);

      const unsubscribe = onAuthStateChanged(authService, (user) => {
        if (user) {
          setUserId(user.uid);
        } else {
          // Attempt anonymous sign-in if no user is present
          const signIn = initialAuthToken
            ? signInWithCustomToken(authService, initialAuthToken)
            : signInAnonymously(authService);

          signIn
            .then((credential) => setUserId(credential.user.uid))
            .catch((error) => {
              console.error("Firebase sign-in failed:", error);
              // Fallback userId if sign-in fails
              try {
                setUserId(crypto.randomUUID());
              } catch {
                setUserId(`anon-${Date.now()}`);
              }
            });
        }
        setIsAuthReady(true);
      });

      return () => unsubscribe();
    } catch (e) {
      console.error("Error initializing Firebase:", e);
      setIsAuthReady(true);
      try {
        setUserId(crypto.randomUUID());
      } catch {
        setUserId(`anon-${Date.now()}`);
      }
    }
  }, []);

  return { db, auth, userId, isAuthReady };
};
