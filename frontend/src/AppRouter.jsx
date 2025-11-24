import { useCallback, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import AddCoursePage from "./pages/AddCoursePage";
import DashboardPage from "./pages/DashboardPage";
import JobMatchPage from "./pages/JobMatchPage";
import LandingPage from "./pages/LandingPage";
import RecommendationsPage from "./pages/RecommendationsPage";
import UploadPage from "./pages/UploadPage";

const AppRouter = ({
    analysisData,
    setAnalysisData,
    db,
    userId,
    isAuthReady,
    isLoadingAnalysis,
}) =>
{
    const location = useLocation();

    const saveScrollForPath = useCallback((pathKey) =>
    {
        try
        {
            if (typeof window === "undefined") return;
            const scrollY = window.scrollY || window.pageYOffset || 0;
            localStorage.setItem(`scrollPos_${pathKey}`, String(Math.floor(scrollY)));
        } catch
        {
            // ignore
        }
    }, []);

    const restoreScrollForPath = useCallback((pathKey) =>
    {
        try
        {
            if (typeof window === "undefined") return;
            const key = `scrollPos_${pathKey}`;
            const raw = localStorage.getItem(key);
            const pos = raw ? parseInt(raw, 10) : 0;
            setTimeout(() =>
            {
                window.scrollTo(0, isNaN(pos) ? 0 : pos);
            }, 0);
        } catch
        {
            // ignore
        }
    }, []);

    useEffect(() =>
    {
        restoreScrollForPath(location.pathname);
        return () => saveScrollForPath(location.pathname);
    }, [location.pathname, restoreScrollForPath, saveScrollForPath]);

    useEffect(() =>
    {
        const handler = () =>
        {
            try
            {
                saveScrollForPath(location.pathname);
            } catch { }
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [location.pathname, saveScrollForPath]);

    return (
        <Routes>
            <Route path="/" element={<LandingPage />} />

            <Route path="/upload" element={<UploadPage setAnalysisData={setAnalysisData} db={db} userId={userId} />} />
            <Route path="/dashboard" element={<DashboardPage analysisData={analysisData} isAuthReady={isAuthReady} isLoading={isLoadingAnalysis} />} />
            <Route path="/recommendations" element={<RecommendationsPage analysisData={analysisData} />} />
            <Route path="/jobs" element={<JobMatchPage analysisData={analysisData} />} />
            <Route path="/courses" element={<AddCoursePage db={db} userId={userId} />} />

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
};

export default AppRouter;
