import { Award, Loader, PieChart, Search, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import IconCard from "../components/IconCard";
import "./DashboardPage.scss";

const DashboardPage = ({ analysisData, isAuthReady, isLoading }) => {
  const navigate = useNavigate();

  if (!isAuthReady || isLoading) {
    return (
      <div className="loading-state">
        <Loader className="loading-state__icon" />
        <p>Loading analysis data...</p>
      </div>
    );
  }

  if (!analysisData) {
    return (
      <div className="empty-state">
        <h2 className="section-title">No Analysis Found</h2>
        <p className="section-subtitle">It looks like you haven't completed an analysis yet.</p>
        <button onClick={() => navigate("/upload")} className="btn btn-primary shadow-glow">
          Start a New Analysis
        </button>
      </div>
    );
  }

  const { resumeScore, missingSkills, summary, careerGoal } = analysisData;
  const scoreColor =
    resumeScore >= 80 ? "score--great" : resumeScore >= 60 ? "score--good" : "score--warn";

  return (
    <div className="dashboard-page">
      <h2 className="section-title">Your Career Report</h2>
      <p className="section-subtitle">
        Analysis for target role: <span className="accent">{careerGoal}</span>
      </p>

      <div className="dashboard-grid">
        <IconCard icon={PieChart} title="Resume Score" className="dashboard-card">
          <div className={`score ${scoreColor}`}>{resumeScore}%</div>
          <p className="muted text-center">Benchmark against current market needs.</p>
        </IconCard>

        <IconCard icon={Award} title="AI Summary" className="dashboard-card dashboard-card--wide">
          <p className="summary">{summary}</p>
        </IconCard>
      </div>

      <div className="dashboard-grid dashboard-grid--two">
        <IconCard icon={Search} title="Crucial Missing Skills" className="dashboard-card">
          <p className="muted">Focus on mastering these high-demand areas to bridge your gap:</p>
          <ul className="skill-list">
            {missingSkills.map((skill, index) => (
              <li key={index} className="skill-list__item">
                <span className="bullet">•</span>
                {skill}
              </li>
            ))}
          </ul>
        </IconCard>

        <IconCard icon={Zap} title="Next Steps" className="dashboard-card">
          <p className="muted">
            You have a clear path forward. Dive into the detailed plan to start leveling up your
            profile today.
          </p>
          <button
            onClick={() => navigate("/recommendations")}
            className="btn btn-primary shadow-glow full-width"
          >
            View Personalized Recommendations →
          </button>
        </IconCard>
      </div>
    </div>
  );
};

export default DashboardPage;
