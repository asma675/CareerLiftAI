import React, { useState, useEffect, useCallback } from 'react';
import { Loader, UploadCloud, PieChart, Award, Search, Home, Zap } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection, query, limit, orderBy } from 'firebase/firestore';

// --- Global Setup & Configuration ---

// Global variables provided by the environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'careerlift-default-app';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// The model to use for analysis
const GEMINI_MODEL = 'gemini-2.5-flash-preview-09-2025';

// Define the structured JSON schema for the AI output
const ANALYSIS_SCHEMA = {
  type: "OBJECT",
  properties: {
    "resumeScore": { "type": "INTEGER", "description": "The resume score out of 100, focusing on the career goal." },
    "missingSkills": {
      "type": "ARRAY",
      "items": { "type": "STRING" },
      "description": "3 crucial skills missing for the target role, grounded in current industry needs."
    },
    "recommendations": {
      "type": "OBJECT",
      "properties": {
        "certifications": {
          "type": "ARRAY",
          "items": { "type": "STRING" },
          "description": "3 highly relevant certifications or courses (e.g., Coursera, AWS, Google) to bridge the skill gap."
        },
        "opportunities": {
          "type": "ARRAY",
          "items": { "type": "STRING" },
          "description": "3 real-world opportunities (e.g., hackathons, open-source projects, specialized internships) to gain experience."
        }
      }
    },
    "summary": { "type": "STRING", "description": "A concise, 3-sentence summary of the resume's strengths and weaknesses against the career goal." }
  },
  required: ["resumeScore", "missingSkills", "recommendations", "summary"]
};

// --- Firebase Utilities ---

/**
 * Initializes Firebase, authenticates, and returns core services.
 */
const useFirebase = () => {
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
          
          signIn.then(credential => setUserId(credential.user.uid)).catch(error => {
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

/**
 * Fetches the latest analysis data from Firestore for the current user.
 */
const useAnalysisData = (db, userId, isAuthReady) => {
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
      orderBy('timestamp', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(analysisQuery, (snapshot) => {
      setIsLoading(false);
      if (!snapshot.empty) {
        const latestDoc = snapshot.docs[0].data();
        setAnalysis(latestDoc);
      } else {
        setAnalysis(null);
      }
    }, (error) => {
      console.error("Error fetching analysis data:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [db, userId, isAuthReady]);

  return { analysis, isLoading };
};

// --- Gemini API Call and Persistence Logic ---

const analyzeResumeWithGemini = async (db, userId, resumeText, careerGoal) => {
  const maxRetries = 5;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText, careerGoal })
      });

      if (!response.ok) {
        throw new Error(`API call failed with status: ${response.status}`);
      }

      const analysisWithMetadata = await response.json();

      // Persist result to Firestore (best effort)
      if (db && userId) {
        const docRef = doc(collection(db, `/artifacts/${appId}/users/${userId}/career_analyses`));
        await setDoc(docRef, analysisWithMetadata);
      }

      return analysisWithMetadata;
    } catch (error) {
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw new Error(`Failed to analyze resume after ${maxRetries} attempts: ${error.message}`);
      }
    }
  }
};

// Upload resume file to backend for text extraction (and optional inline analysis)
const uploadResumeFile = async (file, careerGoal) => {
  const formData = new FormData();
  formData.append('file', file);
  if (careerGoal) {
    formData.append('careerGoal', careerGoal);
  }

  const response = await fetch('/api/upload-resume', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Upload failed (${response.status}): ${message}`);
  }

  const result = await response.json();
  if (!result.extractedText) {
    throw new Error('Resume text was empty in the upload response.');
  }

  return result;
};

// Fetch live courses/opportunities from backend (/api/courses/external)
const fetchLearningResources = async (role, skills = []) => {
  const response = await fetch('/api/courses/external', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, skills })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Course lookup failed (${response.status}): ${message}`);
  }

  return response.json();
};

// --- Component Helpers ---

const IconCard = ({ icon: Icon, title, children, className = "" }) => (
  <div className={`p-5 bg-white rounded-xl shadow-lg border border-gray-100 ${className}`}>
    <div className="flex items-center text-blue-600 mb-3">
      <Icon className="w-6 h-6 mr-3" />
      <h3 className="text-xl font-semibold text-gray-800">{title}</h3>
    </div>
    {children}
  </div>
);

// --- Page Components (Single-File Navigation) ---

const LandingPage = ({ setCurrentPage }) => (
  <div className="p-8 md:p-12 text-center bg-white m-4 md:m-8 rounded-2xl shadow-xl">
    <Zap className="w-16 h-16 text-blue-600 mx-auto mb-6 animate-pulse" />
    <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900">CareerLift AI</h1>
    <p className="mt-4 text-xl text-gray-600 max-w-2xl mx-auto">
      Unlock your potential with personalized career growth plans. Analyze your resume against industry standards, powered by Gemini AI and real-time Google grounding.
    </p>
    <p className="text-sm mt-6 text-gray-500">Supporting UN SDG 4 (Quality Education), 8 (Decent Work), and 10 (Reduced Inequalities).</p>
    <button
      onClick={() => setCurrentPage('upload')}
      className="inline-block mt-8 bg-blue-600 hover:bg-blue-700 transition-colors text-white font-bold px-8 py-3 rounded-full shadow-lg transform hover:scale-105"
    >
      Start Your Analysis
    </button>
  </div>
);

/**
 * UploadPage now persists its form state (resumeText & careerGoal) into localStorage
 * so the form is restored across refreshes. It also uses the provided setCurrentPage
 * wrapper (which preserves scroll positions) — nothing else in the app needs to change.
 */
const UploadPage = ({ setCurrentPage, setAnalysisData, db, userId }) => {
  const storedResume = typeof window !== 'undefined' ? localStorage.getItem('upload_resumeText') : '';
  const storedGoal = typeof window !== 'undefined' ? localStorage.getItem('upload_careerGoal') : null;

  const [resumeText, setResumeText] = useState(storedResume || '');
  const [careerGoal, setCareerGoal] = useState(storedGoal || 'Software Engineer');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [analysisStatus, setAnalysisStatus] = useState('');

  useEffect(() => {
    // Persist form state immediately on change
    try {
      localStorage.setItem('upload_resumeText', resumeText);
      localStorage.setItem('upload_careerGoal', careerGoal);
    } catch (e) {
      // ignore storage failures (e.g., private mode)
    }
  }, [resumeText, careerGoal]);

  const careerGoals = [
    'Software Engineer (Full-Stack)',
    'Cybersecurity Analyst',
    'Data Scientist',
    'UX/UI Designer',
    'Financial Analyst',
    'Marketing Manager (Digital)',
    'Mechanical Engineer',
  ];

  const handleAnalyze = async () => {
    if (resumeText.length < 50) {
      setError("Please paste a more complete resume (at least 50 characters) to get an accurate analysis.");
      return;
    }
    setError(null);
    setIsAnalyzing(true);
    setAnalysisStatus('Sending resume to backend...');

    try {
      setAnalysisStatus('Waiting for Gemini analysis...');
      const result = await analyzeResumeWithGemini(db, userId, resumeText, careerGoal);
      setAnalysisData(result);
      setAnalysisStatus('Analysis complete.');

      // keep the form state but it's safe to clear if you prefer:
      // localStorage.removeItem('upload_resumeText');
      // localStorage.removeItem('upload_careerGoal');

      setCurrentPage('dashboard');
    } catch (e) {
      console.error(e);
      setError(`Analysis failed. Please try again. Error: ${e.message}`);
    } finally {
      setIsAnalyzing(false);
      setAnalysisStatus('');
    }
  };

  const handleUploadFile = async () => {
    if (!selectedFile) {
      setUploadError('Please choose a file first.');
      return;
    }
    setUploadError(null);
    setIsUploading(true);
    try {
      const { extractedText } = await uploadResumeFile(selectedFile, careerGoal);
      setResumeText(extractedText);
      setError(null);
    } catch (e) {
      setUploadError(e.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-6">Analyze Your Career Path</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Input Card */}
        <IconCard icon={UploadCloud} title="Resume Content" className="lg:col-span-1">
          <p className="text-sm text-gray-500 mb-2">Paste your resume text here or upload a file to extract text.</p>
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:space-x-3 space-y-2 sm:space-y-0 mb-3">
            <input
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              className="text-sm text-gray-700 flex-1 min-w-0"
              onChange={(e) => {
                setSelectedFile(e.target.files?.[0] || null);
                setUploadError(null);
              }}
              disabled={isAnalyzing || isUploading}
            />
            <button
              type="button"
              onClick={handleUploadFile}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-3 py-2 rounded-lg shadow disabled:opacity-60 flex items-center justify-center"
              disabled={!selectedFile || isUploading || isAnalyzing}
            >
              {isUploading ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  Extracting...
                </>
              ) : (
                'Extract text'
              )}
            </button>
          </div>
          {selectedFile?.name && (
            <div className="text-xs text-gray-500 truncate max-w-full mb-2" title={selectedFile.name}>
              Selected file: {selectedFile.name}
            </div>
          )}
          {uploadError && (
            <div className="p-2 mb-3 text-red-700 bg-red-100 border border-red-200 rounded-lg text-xs font-medium">
              {uploadError}
            </div>
          )}
          <textarea
            className="w-full h-64 p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 font-mono text-sm shadow-inner"
            placeholder="Start by pasting your full resume content (experience, education, skills, projects)..."
            value={resumeText}
            onChange={(e) => {
              setResumeText(e.target.value);
              if (e.target.value.length > 50) setError(null);
            }}
            disabled={isAnalyzing}
          />
        </IconCard>

        {/* Goal and Action Card */}
        <IconCard icon={Search} title="Career Goal & Action" className="lg:col-span-1 flex flex-col justify-between">
            <div className='flex-grow'>
                <label htmlFor="career-goal" className="block text-md font-medium text-gray-700 mb-2">
                    Target Career Goal
                </label>
                <select
                    id="career-goal"
                    className="border p-3 w-full rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                    value={careerGoal}
                    onChange={(e) => setCareerGoal(e.target.value)}
                    disabled={isAnalyzing}
                >
                    {careerGoals.map(goal => (
                      <option key={goal} value={goal}>{goal}</option>
                    ))}
                </select>

                <p className="text-sm text-gray-500 mt-4">The AI will benchmark your skills against this specific industry role.</p>
            </div>
          
          <div className="mt-8 pt-4 border-t border-gray-200">
            {error && (
              <div className="p-3 mb-4 text-red-700 bg-red-100 border border-red-200 rounded-lg text-sm font-medium">
                {error}
              </div>
            )}
            {isAnalyzing && (
              <div className="mb-3">
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 animate-pulse" style={{ width: '100%' }}></div>
                </div>
                <p className="text-xs text-gray-600 mt-2">{analysisStatus || 'Analyzing...'}</p>
              </div>
            )}
            <button
              onClick={handleAnalyze}
              className="bg-green-600 hover:bg-green-700 transition-colors text-white font-bold px-6 py-3 rounded-xl w-full shadow-md disabled:opacity-50 flex items-center justify-center transform hover:scale-[1.01]"
              disabled={isAnalyzing || isUploading || resumeText.length < 50}
            >
              {isAnalyzing ? (
                <>
                  <Loader className="w-5 h-5 mr-3 animate-spin" />
                  Analyzing with Gemini...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5 mr-2" />
                  Analyze & Get Personalized Plan
                </>
              )}
            </button>
          </div>
        </IconCard>
      </div>
    </div>
  );
};

const DashboardPage = ({ setCurrentPage, analysisData, isAuthReady, isLoading }) => {
  if (!isAuthReady || isLoading) {
    return (
      <div className="p-8 text-center">
        <Loader className="w-8 h-8 mx-auto animate-spin text-blue-600 mb-4" />
        <p className="text-lg text-gray-600">Loading analysis data...</p>
      </div>
    );
  }

  if (!analysisData) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">No Analysis Found</h2>
        <p className="text-lg text-gray-600 mb-6">It looks like you haven't completed an analysis yet.</p>
        <button
          onClick={() => setCurrentPage('upload')}
          className="inline-block bg-blue-600 hover:bg-blue-700 transition-colors text-white font-bold px-6 py-3 rounded-full shadow-md"
        >
          Start a New Analysis
        </button>
      </div>
    );
  }

  const { resumeScore, missingSkills, summary, careerGoal } = analysisData;
  const scoreColor = resumeScore >= 80 ? 'text-green-600' : resumeScore >= 60 ? 'text-yellow-600' : 'text-red-600';
  
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <h2 className="text-4xl font-extrabold text-gray-900 mb-2">Your Career Report</h2>
      <p className="text-lg text-gray-600 mb-8">Analysis for target role: <span className="font-semibold text-blue-600">{careerGoal}</span></p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        
        {/* Resume Score Card */}
        <IconCard icon={PieChart} title="Resume Score" className="md:col-span-1 text-center">
          <div className={`text-6xl font-bold ${scoreColor} my-3`}>{resumeScore}%</div>
          <p className="text-sm text-gray-500">Benchmark against current market needs.</p>
        </IconCard>

        {/* Summary Card */}
        <IconCard icon={Award} title="AI Summary" className="md:col-span-2">
            <p className="text-gray-700 leading-relaxed italic border-l-4 border-blue-200 pl-4 py-1">
                {summary}
            </p>
        </IconCard>

      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
         {/* Missing Skills Card */}
        <IconCard icon={Search} title="Crucial Missing Skills">
          <p className="text-gray-600 mb-3">Focus on mastering these high-demand areas to bridge your gap:</p>
          <ul className="space-y-3">
            {missingSkills.map((skill, index) => (
              <li key={index} className="flex items-center p-3 bg-red-50 rounded-lg text-red-700 font-medium">
                <span className="text-red-400 mr-3">•</span> {skill}
              </li>
            ))}
          </ul>
        </IconCard>

        {/* Action Button */}
        <IconCard icon={Zap} title="Next Steps">
          <p className="text-gray-600 mb-4">You have a clear path forward. Dive into the detailed plan to start leveling up your profile today.</p>
          <button
            onClick={() => setCurrentPage('recommendations')}
            className="bg-blue-600 hover:bg-blue-700 transition-colors text-white font-bold px-6 py-3 rounded-xl w-full shadow-lg transform hover:scale-[1.01]"
          >
            View Personalized Recommendations →
          </button>
        </IconCard>
      </div>
    </div>
  );
};

const RecommendationsPage = ({ analysisData, setCurrentPage }) => {
  const [learning, setLearning] = useState(null);
  const [isFetchingCourses, setIsFetchingCourses] = useState(false);
  const [courseError, setCourseError] = useState(null);

  if (!analysisData) {
    return (
        <div className="p-8 max-w-2xl mx-auto text-center">
            <p className="text-lg text-red-500 mb-4">Analysis data is missing.</p>
            <button onClick={() => setCurrentPage('upload')}>Go to Upload Page</button>
        </div>
    );
  }

  const { recommendations, sources = [], careerGoal, missingSkills = [] } = analysisData;

  useEffect(() => {
    if (!careerGoal) return;
    setIsFetchingCourses(true);
    fetchLearningResources(careerGoal, missingSkills)
      .then((data) => {
        setLearning(data);
        setCourseError(null);
      })
      .catch((err) => setCourseError(err.message))
      .finally(() => setIsFetchingCourses(false));
  }, [careerGoal, JSON.stringify(missingSkills)]);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <h2 className="text-4xl font-bold text-gray-900 mb-2">Personalized Action Plan</h2>
      <p className="text-lg text-gray-600 mb-8">Based on your skill gaps and target career.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        
        {/* Certifications Card */}
        <IconCard icon={Award} title="Top Certifications & Courses">
          <p className="text-gray-600 mb-3">Gain formal knowledge and credentials:</p>
          <ul className="space-y-4">
            {recommendations.certifications.map((cert, index) => (
              <li key={index} className="p-3 bg-yellow-50 rounded-lg border-l-4 border-yellow-400 text-gray-800 font-medium">
                {cert}
              </li>
            ))}
          </ul>
        </IconCard>

        {/* Opportunities Card */}
        <IconCard icon={Zap} title="Real-World Opportunities">
          <p className="text-gray-600 mb-3">Build a strong portfolio through hands-on experience:</p>
          <ul className="space-y-4">
            {recommendations.opportunities.map((opp, index) => (
              <li key={index} className="p-3 bg-blue-50 rounded-lg border-l-4 border-blue-400 text-gray-800 font-medium">
                {opp}
              </li>
            ))}
          </ul>
        </IconCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <IconCard icon={Award} title="Live Course Picks (Gemini + Google Search)">
          {isFetchingCourses ? (
            <div className="flex items-center text-sm text-gray-600">
              <Loader className="w-4 h-4 mr-2 animate-spin" /> Fetching real courses...
            </div>
          ) : courseError ? (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
              {courseError}
            </div>
          ) : learning?.courses?.length ? (
            <ul className="space-y-3">
              {learning.courses.map((course, idx) => (
                <li key={idx} className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                  <div className="font-semibold text-gray-800">{course.title}</div>
                  <div className="text-xs text-gray-600">{course.provider}</div>
                  <div className="text-xs text-gray-500">{course.duration || ''} {course.cost ? `• ${course.cost}` : ''}</div>
                  <a className="text-xs text-blue-700 underline" href={course.link} target="_blank" rel="noreferrer">Open</a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">No live courses returned yet.</p>
          )}
        </IconCard>

        <IconCard icon={Zap} title="Live Opportunities">
          {isFetchingCourses ? (
            <div className="flex items-center text-sm text-gray-600">
              <Loader className="w-4 h-4 mr-2 animate-spin" /> Fetching opportunities...
            </div>
          ) : courseError ? (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
              {courseError}
            </div>
          ) : learning?.opportunities?.length ? (
            <ul className="space-y-3">
              {learning.opportunities.map((opp, idx) => (
                <li key={idx} className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                  <div className="font-semibold text-gray-800">{opp.name}</div>
                  <div className="text-xs text-gray-600">{opp.description || ''}</div>
                  <div className="text-xs text-gray-500">{opp.difficulty || ''}</div>
                  <a className="text-xs text-blue-700 underline" href={opp.link} target="_blank" rel="noreferrer">Open</a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">No live opportunities returned yet.</p>
          )}
        </IconCard>
      </div>

      <IconCard icon={Search} title="AI Grounding Sources (Google Search)">
        <p className="text-sm text-gray-600 mb-3">The AI used the following current web sources to generate accurate advice:</p>
        <ul className="space-y-2">
            {sources.length > 0 ? (
                sources.map((source, index) => (
                    <li key={index} className="text-xs text-blue-700 hover:text-blue-900 truncate">
                        <a href={source.uri} target="_blank" rel="noopener noreferrer" title={source.title} className='underline'>
                           {source.title || source.uri}
                        </a>
                    </li>
                ))
            ) : (
                <li className='text-xs text-gray-500'>No direct web sources cited (information based on the model's general knowledge and structured response logic).</li>
            )}
        </ul>
      </IconCard>
    </div>
  );
};

const AddCoursePage = ({ db, userId }) => {
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [listError, setListError] = useState(null);

    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [editingCourse, setEditingCourse] = useState(null);

    // Form fields
    const [title, setTitle] = useState("");
    const [category, setCategory] = useState("");
    const [level, setLevel] = useState("");
    const [description, setDescription] = useState("");
    const [url, setUrl] = useState("");

    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);
    const [success, setSuccess] = useState(null);

    const API_BASE = "http://localhost:4000"; // change if your backend uses another port

    // Load all courses
    const fetchCourses = async () => {
        try {
            setLoading(true);
            setListError(null);
            const res = await fetch(`${API_BASE}/api/courses`);
            const data = await res.json();
            setCourses(data || []);
        } catch (err) {
            setListError("Failed to load courses: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCourses();
    }, []);

    // Open drawer for ADD
    const handleOpenAdd = () => {
        setEditingCourse(null);
        setTitle("");
        setCategory("");
        setLevel("");
        setDescription("");
        setUrl("");
        setSaveError(null);
        setSuccess(null);
        setIsDrawerOpen(true);
    };

    // Open drawer for EDIT
    const handleOpenEdit = (course) => {
        setEditingCourse(course);
        setTitle(course.title || "");
        setCategory(course.category || "");
        setLevel(course.level || "");
        setDescription(course.description || "");
        setUrl(course.url || "");
        setSaveError(null);
        setSuccess(null);
        setIsDrawerOpen(true);
    };

    const handleCloseDrawer = () => {
        setIsDrawerOpen(false);
        setEditingCourse(null);
        setSaveError(null);
        setSuccess(null);
    };

    // Save (add or update)
    const handleSave = async () => {
        if (!title || !category || !level) {
            setSaveError("Please fill in all required fields.");
            return;
        }

        setSaving(true);
        setSaveError(null);
        setSuccess(null);

        try {
            const payload = {
                title,
                category,
                level,
                description,
                url,
                createdBy: userId || null,
            };

            let res;
            if (editingCourse) {
                // UPDATE
                res = await fetch(`${API_BASE}/api/courses/${editingCourse.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            } else {
                // CREATE
                res = await fetch(`${API_BASE}/api/courses`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            }

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Failed to save course");
            }

            setSuccess(editingCourse ? "Course updated successfully!" : "Course added successfully!");
            await fetchCourses(); // refresh list
            handleCloseDrawer();
        } catch (err) {
            setSaveError(err.message);
        } finally {
            setSaving(false);
        }
    };

    // Delete
    const handleDelete = async (id) => {
        const confirmDelete = window.confirm("Are you sure you want to delete this course?");
        if (!confirmDelete) return;

        try {
            const res = await fetch(`${API_BASE}/api/courses/${id}`, {
                method: "DELETE",
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Failed to delete course");
            }
            // remove from local state without refetch
            setCourses((prev) => prev.filter((c) => c.id !== id));
        } catch (err) {
            alert("Error deleting course: " + err.message);
        }
    };

    return (
        <div className="flex flex-col lg:flex-row gap-6 relative">
            {/* LEFT: list + header */}
            <div className="flex-1">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-3xl font-bold">Courses</h2>
                    {!isDrawerOpen && (
                        <button
                            onClick={handleOpenAdd}
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700"
                        >
                            + Add Course
                        </button>
                    )}
                </div>

                {listError && <p className="text-red-600 mb-3">{listError}</p>}
                {success && <p className="text-green-600 mb-3">{success}</p>}

                {loading ? (
                    <p>Loading courses...</p>
                ) : courses.length === 0 ? (
                    <p className="text-gray-500">No courses yet. Click “Add Course” to create one.</p>
                ) : (
                    <div className="space-y-3">
                        {courses.map((course) => (
                            <div
                                key={course.id}
                                className="bg-white rounded-lg shadow p-4 flex items-start justify-between gap-4"
                            >
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900">{course.title}</h3>
                                    <p className="text-sm text-gray-600">
                                        <span className="font-semibold">Category:</span> {course.category || "N/A"}
                                    </p>
                                    <p className="text-sm text-gray-600">
                                        <span className="font-semibold">Level:</span> {course.level || "N/A"}
                                    </p>
                                    {course.description && (
                                        <p className="text-sm text-gray-700 mt-2">{course.description}</p>
                                    )}
                                    {course.url && (
                                        <a
                                            href={course.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 text-sm mt-2 inline-block underline"
                                        >
                                            Open Course
                                        </a>
                                    )}
                                </div>

                                <div className="flex flex-col gap-2">
                                    <button
                                        onClick={() => handleOpenEdit(course)}
                                        className="px-3 py-1 text-sm rounded bg-yellow-500 text-white hover:bg-yellow-600"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => handleDelete(course.id)}
                                        className="px-3 py-1 text-sm rounded bg-red-600 text-white hover:bg-red-700"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* RIGHT: drawer panel */}
            {isDrawerOpen && (
                <div className="fixed inset-y-16 right-0 w-full sm:w-[380px] bg-white shadow-2xl border-l border-gray-200 p-6 overflow-y-auto z-20 lg:static lg:h-auto lg:inset-auto lg:w-[380px]">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold">
                            {editingCourse ? "Edit Course" : "Add New Course"}
                        </h3>
                        <button
                            onClick={handleCloseDrawer}
                            className="text-gray-500 hover:text-gray-800 text-sm"
                        >
                            ✕
                        </button>
                    </div>

                    {saveError && <p className="text-red-600 mb-3">{saveError}</p>}

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold mb-1">Course Title *</label>
                            <input
                                className="w-full p-3 border rounded-lg"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Ex: Introduction to Cybersecurity"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold mb-1">Category *</label>
                            <input
                                className="w-full p-3 border rounded-lg"
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                placeholder="Ex: IT / Business / Engineering"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold mb-1">Level *</label>
                            <select
                                className="w-full p-3 border rounded-lg"
                                value={level}
                                onChange={(e) => setLevel(e.target.value)}
                            >
                                <option value="">Select...</option>
                                <option value="Beginner">Beginner</option>
                                <option value="Intermediate">Intermediate</option>
                                <option value="Advanced">Advanced</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold mb-1">Short Description</label>
                            <textarea
                                className="w-full p-3 border rounded-lg h-24"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Add a short summary of the course..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold mb-1">Course URL</label>
                            <input
                                className="w-full p-3 border rounded-lg"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="https://example.com/my-course"
                            />
                        </div>

                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            {saving ? "Saving..." : editingCourse ? "Update Course" : "Save Course"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};



// --- Main Application Component ---

export default function App() {
  // Initialize currentPage from localStorage so refresh restores last page (Option 1)
  const [currentPageState, setCurrentPageState] = useState(() => {
    try {
      return localStorage.getItem('currentPage') || 'landing';
    } catch {
      return 'landing';
    }
  });

  // analysis data (kept in memory but persisted to localStorage when available so dashboard can show after refresh)
  const [analysisData, setAnalysisData] = useState(() => {
    try {
      const raw = localStorage.getItem('analysisData');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // Firebase Hook
  const { db, userId, isAuthReady } = useFirebase();
  const { analysis: latestAnalysis, isLoading: isLoadingAnalysis } = useAnalysisData(db, userId, isAuthReady);

  // When Firestore yields the latestAnalysis, update local and persist it
  useEffect(() => {
    if (isAuthReady && latestAnalysis) {
      setAnalysisData(latestAnalysis);
      try {
        localStorage.setItem('analysisData', JSON.stringify(latestAnalysis));
      } catch {
        // ignore localStorage failures
      }
    }
  }, [isAuthReady, latestAnalysis]);

  // Persist current page whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('currentPage', currentPageState);
    } catch {
      // ignore storage failure
    }
  }, [currentPageState]);

  // Save scroll position for the current page before switching away or before unload
  const saveScrollForPage = useCallback((pageKey) => {
    try {
      if (typeof window === 'undefined') return;
      const scrollY = window.scrollY || window.pageYOffset || 0;
      localStorage.setItem(`scrollPos_${pageKey}`, String(Math.floor(scrollY)));
    } catch {
      // ignore
    }
  }, []);

  // Restore scroll position when currentPageState changes (after render)
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const key = `scrollPos_${currentPageState}`;
      const raw = localStorage.getItem(key);
      const pos = raw ? parseInt(raw, 10) : 0;
      // Wait a tick for content to render
      setTimeout(() => {
        window.scrollTo(0, isNaN(pos) ? 0 : pos);
      }, 0);
    } catch {
      // ignore
    }
  }, [currentPageState, analysisData]); // also re-run when analysisData changes so dashboard can position correctly

  // Save scroll on beforeunload
  useEffect(() => {
    const handler = () => {
      try {
        saveScrollForPage(currentPageState);
      } catch {}
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [currentPageState, saveScrollForPage]);

  // wrapped setter that saves scroll of the outgoing page and updates state
  const setCurrentPage = useCallback((nextPage) => {
    try {
      // save scroll position for the current page
      saveScrollForPage(currentPageState);
    } catch {}
    setCurrentPageState(nextPage);
  }, [currentPageState, saveScrollForPage]);

  // Set the latest loaded analysis data once Firebase is ready if not already set
  useEffect(() => {
    if (!analysisData && isAuthReady && latestAnalysis) {
      setAnalysisData(latestAnalysis);
    }
  }, [isAuthReady, latestAnalysis, analysisData]);

  // Whenever analysisData is updated in memory persist it (so dashboard can show after refresh)
  useEffect(() => {
    try {
      if (analysisData) {
        localStorage.setItem('analysisData', JSON.stringify(analysisData));
      }
    } catch {
      // ignore
    }
  }, [analysisData]);

  const renderPage = useCallback(() => {
    switch (currentPageState) {
      case 'landing':
        return <LandingPage setCurrentPage={setCurrentPage} />;
      case 'upload':
        return <UploadPage setCurrentPage={setCurrentPage} setAnalysisData={setAnalysisData} db={db} userId={userId} />;
      case 'dashboard':
        return <DashboardPage setCurrentPage={setCurrentPage} analysisData={analysisData} isAuthReady={isAuthReady} isLoading={isLoadingAnalysis} />;
      case 'recommendations':
        return (
          <RecommendationsPage
            setCurrentPage={setCurrentPage}
            analysisData={analysisData}
          />
            );
        case 'addCourse':
            return <AddCoursePage db={db} userId={userId} />;

      default:
        return <LandingPage setCurrentPage={setCurrentPage} />;
    }
  }, [currentPageState, analysisData, db, userId, isAuthReady, isLoadingAnalysis, setCurrentPage]);

  const navItems = [
    { name: 'Home', page: 'landing', icon: Home },
    { name: 'Analyze', page: 'upload', icon: UploadCloud },
    { name: 'Report', page: 'dashboard', icon: PieChart },
    { name: 'All Courses', page: 'addCourse', icon: Award },
  ];

  return (
    <>
      {/* Tailwind CSS CDN and viewport meta are assumed to be loaded by the environment */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap');
        body { font-family: 'Inter', sans-serif; }
      `}</style>
      
      <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col">
        {/* Header and Navigation */}
        <header className="bg-blue-700 shadow-xl z-10 sticky top-0">
          <div className="max-w-7xl mx-auto flex justify-between items-center p-4">
            <div className="text-white text-2xl font-extrabold flex items-center">
              <Zap className="w-6 h-6 mr-2 text-yellow-300" />
              CareerLift AI
            </div>
            
            <div className="flex items-center space-x-4">
              {navItems.map((item) => (
                <button
                  key={item.page}
                  onClick={() => setCurrentPage(item.page)}
                  className={`flex items-center px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
                    currentPageState === item.page
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-blue-100 hover:bg-blue-600 hover:text-white'
                  }`}
                >
                    <item.icon className="w-4 h-4 mr-2" />
                    <span className='hidden sm:inline'>{item.name}</span>
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* User ID Display (Mandatory for multi-user apps) */}
        <div className="bg-gray-100 p-2 text-center text-xs text-gray-500 border-b border-gray-200">
            User ID (for persistence): <span className="font-mono text-gray-700 break-all">{userId || 'Authenticating...'}</span>
        </div>

        {/* Main Content Area */}
        <main className="flex-grow p-4 md:p-6">
          {renderPage()}
        </main>

        {/* Footer */}
        <footer className="bg-gray-800 text-white p-4 text-center text-sm">
            <p>&copy; {new Date().getFullYear()} CareerLift AI. Powered by Gemini & Firebase.</p>
        </footer>
      </div>
    </>
  );
}
