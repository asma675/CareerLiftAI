import { useEffect, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { appId } from "../config/appConfig";

/**
 * Fetches the latest analysis data from Firestore for the current user.
 */
export const useAnalysisData = (db, userId, isAuthReady) => {
  const [analysis, setAnalysis] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!db || !userId || !isAuthReady) {
      setIsLoading(false);
      return;
    }

    const analysisCollectionPath = `/artifacts/${appId}/users/${userId}/career_analyses`;
    const analysisQuery = query(
      collection(db, analysisCollectionPath),
      orderBy("timestamp", "desc"),
      limit(1)
    );

    const unsubscribe = onSnapshot(
      analysisQuery,
      (snapshot) => {
        setIsLoading(false);
        if (!snapshot.empty) {
          const latestDoc = snapshot.docs[0].data();
          setAnalysis(latestDoc);
        } else {
          setAnalysis(null);
        }
      },
      (error) => {
        console.error("Error fetching analysis data:", error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [db, userId, isAuthReady]);

  return { analysis, isLoading };
};
