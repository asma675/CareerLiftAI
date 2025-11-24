import { useEffect, useState } from "react";
import { Award, Loader, PieChart, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import IconCard from "../components/IconCard";
import { fetchJobMatches } from "../services/api";
import "./JobMatchPage.scss";

const JobMatchPage = ({ analysisData }) => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [location, setLocation] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const skills = analysisData?.missingSkills || [];
  const jobTitle = analysisData?.careerGoal || "";

  const loadJobs = async (loc) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchJobMatches({
        skills,
        location: loc || location,
        jobTitle,
      });
      setJobs(result.jobs || []);
    } catch (e) {
      setError(e.message);
      setJobs([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (jobTitle) {
      loadJobs(location);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobTitle, JSON.stringify(skills)]);

  if (!analysisData) {
    return (
      <div className="empty-state">
        <p className="section-subtitle warning">Analysis data is missing.</p>
        <button
          onClick={() => navigate("/upload")}
          className="btn btn-primary shadow-glow"
        >
          Go to Upload Page
        </button>
      </div>
    );
  }

  return (
    <div className="jobs-page">
      <div className="jobs-header">
        <div>
          <h2 className="section-title">Job Matches</h2>
          <p className="section-subtitle">
            Tailored to: <span className="accent">{jobTitle}</span>
          </p>
        </div>
        <button
          onClick={() => navigate("/recommendations")}
          className="btn btn-ghost"
        >
          Back to Plan
        </button>
      </div>

      <IconCard icon={Search} title="Filters" className="jobs-card">
        <div className="filters">
          <div>
            <label className="field-label">Preferred Location (optional)</label>
            <input
              className="input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., Toronto, Remote"
            />
          </div>
          <div className="filter-action">
            <button
              onClick={() => loadJobs(location)}
              className="btn btn-secondary shadow-glow full-width"
              disabled={isLoading}
            >
              {isLoading ? "Searching…" : "Find Jobs"}
            </button>
          </div>
        </div>
        <p className="muted small">Using your missing skills and target role to find relevant openings.</p>
      </IconCard>

      <div className="jobs-list">
        {error && <div className="alert alert-error">{error}</div>}
        {isLoading ? (
          <IconCard icon={Loader} title="Loading jobs..." className="jobs-card">
            <div className="progress">
              <div className="progress__bar" />
            </div>
          </IconCard>
        ) : jobs.length ? (
          jobs.map((job, idx) => (
            <IconCard
              key={idx}
              icon={PieChart}
              title={`${job.job_title || "Role"} @ ${job.company || "Company"}`}
              className="jobs-card"
            >
              <div className="job-meta">
                <p><span className="meta-label">Location:</span> {job.location || "N/A"}</p>
                <p><span className="meta-label">Skills:</span> {job.skills || "N/A"}</p>
                <p><span className="meta-label">Qualifications:</span> {job.qualifications || "N/A"}</p>
                <p><span className="meta-label">Salary:</span> {job.salary_range || "N/A"}</p>
                <p><span className="meta-label">Work Type:</span> {job.work_type || "N/A"}</p>
              </div>
            </IconCard>
          ))
        ) : (
          <IconCard icon={Award} title="No jobs found" className="jobs-card">
            <p className="muted small">
              We couldn't find matches right now. Try adjusting the location or check back later.
            </p>
          </IconCard>
        )}
      </div>
    </div>
  );
};

export default JobMatchPage;
