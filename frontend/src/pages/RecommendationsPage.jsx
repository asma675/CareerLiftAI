import { useEffect, useState } from "react";
import { Award, Loader, Search, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import IconCard from "../components/IconCard";
import { fetchLearningResources } from "../services/api";
import "./RecommendationsPage.scss";

const RecommendationsPage = ({ analysisData }) => {
  const navigate = useNavigate();
  const [learning, setLearning] = useState(null);
  const [isFetchingCourses, setIsFetchingCourses] = useState(false);
  const [courseError, setCourseError] = useState(null);

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

  const { recommendations, sources = [], careerGoal, missingSkills = [] } =
    analysisData;

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
    <div className="recommendations-page">
      <h2 className="section-title">Personalized Action Plan</h2>
      <p className="section-subtitle">Based on your skill gaps and target career.</p>

      <div className="rec-grid">
        <IconCard icon={Award} title="Top Certifications & Courses">
          <p className="muted">Gain formal knowledge and credentials:</p>
          <ul className="list">
            {recommendations.certifications.map((cert, index) => (
              <li key={index} className="list__item list__item--gold">
                {cert}
              </li>
            ))}
          </ul>
        </IconCard>

        <IconCard icon={Zap} title="Real-World Opportunities">
          <p className="muted">Build a strong portfolio through hands-on experience:</p>
          <ul className="list">
            {recommendations.opportunities.map((opp, index) => (
              <li key={index} className="list__item list__item--blue">
                {opp}
              </li>
            ))}
          </ul>
        </IconCard>
      </div>

      <div className="rec-grid">
        <IconCard icon={Award} title="Live Course Picks (Gemini + Google Search)">
          {isFetchingCourses ? (
            <div className="loading-inline">
              <Loader className="icon-sm" /> Fetching real courses...
            </div>
          ) : courseError ? (
            <div className="alert alert-error">{courseError}</div>
          ) : learning?.courses?.length ? (
            <ul className="resource-list">
              {learning.courses.map((course, idx) => (
                <li key={idx} className="resource-card">
                  <div className="resource-card__title">{course.title}</div>
                  <div className="resource-card__meta">
                    {course.provider} • {course.duration || "Duration TBC"}
                  </div>
                  <div className="resource-card__meta">{course.cost || ""}</div>
                  <a
                    className="resource-card__link"
                    href={course.link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">No live courses returned yet.</p>
          )}
        </IconCard>

        <IconCard icon={Zap} title="Live Opportunities">
          {isFetchingCourses ? (
            <div className="loading-inline">
              <Loader className="icon-sm" /> Fetching opportunities...
            </div>
          ) : courseError ? (
            <div className="alert alert-error">{courseError}</div>
          ) : learning?.opportunities?.length ? (
            <ul className="resource-list">
              {learning.opportunities.map((opp, idx) => (
                <li key={idx} className="resource-card">
                  <div className="resource-card__title">{opp.name}</div>
                  <div className="resource-card__meta">{opp.description || ""}</div>
                  <div className="resource-card__meta">{opp.difficulty || ""}</div>
                  <a
                    className="resource-card__link"
                    href={opp.link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">No live opportunities returned yet.</p>
          )}
        </IconCard>
      </div>

      <IconCard icon={Search} title="AI Grounding Sources (Google Search)">
        <p className="muted">The AI used the following current web sources to generate accurate advice:</p>
        <ul className="sources">
          {sources.length > 0 ? (
            sources.map((source, index) => (
              <li key={index} className="sources__item">
                <a
                  href={source.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={source.title}
                  className="sources__link"
                >
                  {source.title || source.uri}
                </a>
              </li>
            ))
          ) : (
            <li className="muted small">
              No direct web sources cited (information based on the model's general knowledge and structured response logic).
            </li>
          )}
        </ul>
      </IconCard>
    </div>
  );
};

export default RecommendationsPage;
