import { collection, doc, setDoc } from "firebase/firestore";
import { appId } from "../config/appConfig";

// Gemini analysis API call and Firestore persistence
export const analyzeResumeWithGemini = async (db, userId, resumeText, careerGoal) => {
  const maxRetries = 5;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText, careerGoal }),
      });

      if (!response.ok) {
        throw new Error(`API call failed with status: ${response.status}`);
      }

      const analysisWithMetadata = await response.json();

      // Persist result to Firestore (best effort)
      if (db && userId) {
        const docRef = doc(
          collection(db, `/artifacts/${appId}/users/${userId}/career_analyses`)
        );
        await setDoc(docRef, analysisWithMetadata);
      }

      return analysisWithMetadata;
    } catch (error) {
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw new Error(
          `Failed to analyze resume after ${maxRetries} attempts: ${error.message}`
        );
      }
    }
  }
};

// Upload resume file to backend for text extraction (and optional inline analysis)
export const uploadResumeFile = async (file, careerGoal) => {
  const formData = new FormData();
  formData.append("file", file);
  if (careerGoal) {
    formData.append("careerGoal", careerGoal);
  }

  const response = await fetch("/api/upload-resume", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Upload failed (${response.status}): ${message}`);
  }

  const result = await response.json();
  if (!result.extractedText) {
    throw new Error("Resume text was empty in the upload response.");
  }

  return result;
};

// Fetch live courses/opportunities from backend (/api/courses)
export const fetchLearningResources = async (role, skills = []) => {
  const response = await fetch("/api/courses/external", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, skills }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Course lookup failed (${response.status}): ${message}`);
  }

  return response.json();
};

// Fetch job matches from backend (/api/jobs)
export const fetchJobMatches = async ({
  skills = [],
  location = "",
  jobTitle = "",
  limit = 10,
}) => {
  const response = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skills, location, jobTitle, limit }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Job lookup failed (${response.status}): ${message}`);
  }

  return response.json();
};
