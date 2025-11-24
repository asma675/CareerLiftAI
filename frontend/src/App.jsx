import { useEffect, useState } from "react";
import { Award, Home, PieChart, Search, UploadCloud, Zap } from "lucide-react";
import { NavLink } from "react-router-dom";
import AppRouter from "./AppRouter";
import { useAnalysisData } from "./hooks/useAnalysisData";
import { useFirebase } from "./hooks/useFirebase";
import "./App.scss";

export default function App()
{
    // Analysis data stored in memory and persisted to localStorage
    const [analysisData, setAnalysisData] = useState(() =>
    {
        try
        {
            const raw = localStorage.getItem("analysisData");
            return raw ? JSON.parse(raw) : null;
        } catch
        {
            return null;
        }
    });

    // Firebase Hook
    const { db, userId, isAuthReady } = useFirebase();
    const { analysis: latestAnalysis, isLoading: isLoadingAnalysis } =
        useAnalysisData(db, userId, isAuthReady);

    // When Firestore yields the latestAnalysis, update local and persist it
    useEffect(() =>
    {
        if (isAuthReady && latestAnalysis)
        {
            setAnalysisData(latestAnalysis);
            try
            {
                localStorage.setItem("analysisData", JSON.stringify(latestAnalysis));
            } catch
            {
                // ignore localStorage failures
            }
        }
    }, [isAuthReady, latestAnalysis]);

    // Set the latest loaded analysis data once Firebase is ready if not already set
    useEffect(() =>
    {
        if (!analysisData && isAuthReady && latestAnalysis)
        {
            setAnalysisData(latestAnalysis);
        }
    }, [isAuthReady, latestAnalysis, analysisData]);

    // Whenever analysisData is updated in memory persist it
    useEffect(() =>
    {
        try
        {
            if (analysisData)
            {
                localStorage.setItem("analysisData", JSON.stringify(analysisData));
            }
        } catch
        {
            // ignore
        }
    }, [analysisData]);

  const navItems = [
    { name: "Home", path: "/", icon: Home },
    { name: "Analyze", path: "/upload", icon: UploadCloud },
    { name: "Report", path: "/dashboard", icon: PieChart },
    { name: "Jobs", path: "/jobs", icon: Search },
    { name: "All Courses", path: "/courses", icon: Award },
  ];

    return (
      <div className="app-shell">
        <header className="app-header">
          <div className="app-header__inner">
            <div className="brand">
              <Zap className="brand__icon drop-shadow-glow" />
              <span className="brand__text">CareerLift AI</span>
            </div>

            <div className="nav-links">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    isActive ? "nav-link nav-link--active" : "nav-link"
                  }
                >
                  <item.icon className="nav-link__icon" />
                  <span className="nav-link__label">{item.name}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </header>

        <div className="user-id-bar">
          User ID (for persistence):{" "}
          <span className="user-id-bar__id">{userId || "Authenticating..."}</span>
        </div>

        <main className="main-content">
          <AppRouter
            analysisData={analysisData}
            setAnalysisData={setAnalysisData}
            db={db}
            userId={userId}
            isAuthReady={isAuthReady}
            isLoadingAnalysis={isLoadingAnalysis}
          />
        </main>

        <footer className="app-footer">
          © {new Date().getFullYear()} CareerLift AI. Powered by Gemini & BigQuery. Designed by our team 💜
        </footer>
      </div>
    );
}
