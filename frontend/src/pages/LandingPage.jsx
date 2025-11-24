import { Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import "./LandingPage.scss";

const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="landing">
      <Zap className="landing__icon drop-shadow-glow" />
      <h1 className="section-title">CareerLift AI</h1>
      <p className="landing__lede">
        Unlock your potential with personalized career growth plans. Analyze your
        resume against industry standards, powered by Gemini AI and real-time
        Google grounding.
      </p>
      <p className="landing__sdg">
        Supporting UN SDG 4 (Quality Education), 8 (Decent Work), and 10 (Reduced
        Inequalities).
      </p>
      <button
        onClick={() => navigate("/upload")}
        className="btn btn-primary shadow-glow landing__cta"
      >
        Start Your Analysis
      </button>
    </div>
  );
};

export default LandingPage;
