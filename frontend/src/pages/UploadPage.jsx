import { useEffect, useState } from "react";
import { Loader, Search, UploadCloud, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import IconCard from "../components/IconCard";
import { analyzeResumeWithGemini, uploadResumeFile } from "../services/api";
import "./UploadPage.scss";

/**
 * UploadPage with:
 * - extra roles for Scotiabank & Dayforce
 * - “Other (custom)” option + text box
 */
const UploadPage = ({ setAnalysisData, db, userId }) => {
  const navigate = useNavigate();
  const storedResume =
    typeof window !== "undefined"
      ? localStorage.getItem("upload_resumeText")
      : "";
  const storedGoal =
    typeof window !== "undefined"
      ? localStorage.getItem("upload_careerGoal")
      : null;
  const storedCustomGoal =
    typeof window !== "undefined"
      ? localStorage.getItem("upload_customCareerGoal")
      : "";

  const [resumeText, setResumeText] = useState(storedResume || "");
  const [careerGoal, setCareerGoal] = useState(
    storedGoal || "Software Engineer (Full-Stack)"
  );
  const [customCareerGoal, setCustomCareerGoal] = useState(
    storedCustomGoal || ""
  );

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [analysisStatus, setAnalysisStatus] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem("upload_resumeText", resumeText);
      localStorage.setItem("upload_careerGoal", careerGoal);
      localStorage.setItem("upload_customCareerGoal", customCareerGoal);
    } catch (e) {
      // ignore storage failures
    }
  }, [resumeText, careerGoal, customCareerGoal]);

  const careerGoals = [
    "Software Engineer (Full-Stack)",
    "Cybersecurity Analyst",
    "Data Scientist",
    "UX/UI Designer",
    "Financial Analyst",
    "Marketing Manager (Digital)",
    "Mechanical Engineer",
    "Scotiabank – Software Engineer",
    "Dayforce – Software Engineer",
    "Other (custom)",
  ];

  const handleAnalyze = async () => {
    if (resumeText.length < 50) {
      setError(
        "Please paste a more complete resume (at least 50 characters) to get an accurate analysis."
      );
      return;
    }

    if (careerGoal === "Other (custom)" && customCareerGoal.trim().length < 3) {
      setError("Please enter your custom career goal in the text box.");
      return;
    }

    const finalCareerGoal =
      careerGoal === "Other (custom)" ? customCareerGoal.trim() : careerGoal;

    setError(null);
    setIsAnalyzing(true);
    setAnalysisStatus("Sending resume to backend...");

    try {
      setAnalysisStatus("Waiting for Gemini analysis...");
      const result = await analyzeResumeWithGemini(
        db,
        userId,
        resumeText,
        finalCareerGoal
      );
      setAnalysisData(result);
      setAnalysisStatus("Analysis complete.");
      navigate("/dashboard");
    } catch (e) {
      console.error(e);
      setError(`Analysis failed. Please try again. Error: ${e.message}`);
    } finally {
      setIsAnalyzing(false);
      setAnalysisStatus("");
    }
  };

  const handleUploadFile = async () => {
    if (!selectedFile) {
      setUploadError("Please choose a file first.");
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
    <div className="upload-page">
      <h2 className="section-title">Analyze Your Career Path</h2>
      <p className="section-subtitle">
        Upload your resume or paste the content, choose a target role, and let CareerLift generate a tailored action plan.
      </p>

      <div className="upload-grid">
        <IconCard icon={UploadCloud} title="Resume Content" className="upload-card">
          <p className="muted">Paste your resume text here or upload a file to extract text.</p>
          <div className="upload-actions">
            <input
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              className="file-input"
              onChange={(e) => {
                setSelectedFile(e.target.files?.[0] || null);
                setUploadError(null);
              }}
              disabled={isAnalyzing || isUploading}
            />
            <button
              type="button"
              onClick={handleUploadFile}
              className="btn btn-secondary shadow-glow"
              disabled={!selectedFile || isUploading || isAnalyzing}
            >
              {isUploading ? (
                <>
                  <Loader className="icon-sm" />
                  Extracting...
                </>
              ) : (
                "Extract text"
              )}
            </button>
          </div>
          {selectedFile?.name && (
            <div className="file-name" title={selectedFile.name}>
              Selected file: {selectedFile.name}
            </div>
          )}
          {uploadError && <div className="alert alert-error">{uploadError}</div>}
          <textarea
            className="textarea resume-input"
            placeholder="Start by pasting your full resume content (experience, education, skills, projects)..."
            value={resumeText}
            onChange={(e) => {
              setResumeText(e.target.value);
              if (e.target.value.length > 50) setError(null);
            }}
            disabled={isAnalyzing}
          />
        </IconCard>

        <IconCard icon={Search} title="Career Goal & Action" className="upload-card">
          <div className="goal-block">
            <label htmlFor="career-goal" className="field-label">
              Target Career Goal
            </label>
            <select
              id="career-goal"
              className="select"
              value={careerGoal}
              onChange={(e) => setCareerGoal(e.target.value)}
              disabled={isAnalyzing}
            >
              {careerGoals.map((goal) => (
                <option key={goal} value={goal}>
                  {goal}
                </option>
              ))}
            </select>

            {careerGoal === "Other (custom)" && (
              <div className="custom-goal">
                <label htmlFor="custom-career-goal" className="field-label">
                  Enter your own career goal
                </label>
                <input
                  id="custom-career-goal"
                  type="text"
                  className="input"
                  placeholder="e.g., AI Product Manager at Google"
                  value={customCareerGoal}
                  onChange={(e) => {
                    setCustomCareerGoal(e.target.value);
                    if (e.target.value.trim().length > 2) setError(null);
                  }}
                  disabled={isAnalyzing}
                />
              </div>
            )}

            <p className="muted small">
              The AI will benchmark your skills against this specific industry role.
            </p>
          </div>

          <div className="goal-actions">
            {error && <div className="alert alert-error">{error}</div>}
            {isAnalyzing && (
              <div className="progress">
                <div className="progress__bar" />
                <p className="progress__text">{analysisStatus || "Analyzing..."}</p>
              </div>
            )}
            <button
              onClick={handleAnalyze}
              className="btn btn-primary shadow-glow analyze-btn"
              disabled={isAnalyzing || isUploading || resumeText.length < 50}
            >
              {isAnalyzing ? (
                <>
                  <Loader className="icon-md" />
                  Analyzing with Gemini...
                </>
              ) : (
                <>
                  <Zap className="icon-md" />
                  Analyze &amp; Get Personalized Plan
                </>
              )}
            </button>
          </div>
        </IconCard>
      </div>
    </div>
  );
};

export default UploadPage;
