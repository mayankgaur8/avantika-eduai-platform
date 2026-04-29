import { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import PageLoader from "./components/PageLoader";

// Pages
const LandingPage = lazy(() => import("./pages/LandingPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const SignupPage = lazy(() => import("./pages/SignupPage"));
const DashboardLayout = lazy(() => import("./layouts/DashboardLayout"));
const DashboardHome = lazy(() => import("./pages/dashboard/DashboardHome"));
const QuizGenerator = lazy(() => import("./pages/dashboard/QuizGenerator"));
const AssignmentGenerator = lazy(() => import("./pages/dashboard/AssignmentGenerator"));
const PaperGenerator = lazy(() => import("./pages/dashboard/PaperGenerator"));
const SavedPapers = lazy(() => import("./pages/dashboard/SavedPapers"));
const Analytics = lazy(() => import("./pages/dashboard/Analytics"));
const Subscription = lazy(() => import("./pages/dashboard/Subscription"));
const AdminPanel = lazy(() => import("./pages/admin/AdminPanel"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const CATHub = lazy(() => import("./pages/dashboard/cat/CATHub"));
const CATPractice = lazy(() => import("./pages/dashboard/cat/CATPractice"));
const CATMockTest = lazy(() => import("./pages/dashboard/cat/CATMockTest"));
const CATStudyPlan = lazy(() => import("./pages/dashboard/cat/CATStudyPlan"));
const CATAnalytics = lazy(() => import("./pages/dashboard/cat/CATAnalytics"));

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;
  return user ? children : <Navigate to="/login" replace />;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user?.role === "admin" ? children : <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/dashboard" element={<PrivateRoute><DashboardLayout /></PrivateRoute>}>
          <Route index element={<DashboardHome />} />
          <Route path="quiz" element={<QuizGenerator />} />
          <Route path="assignment" element={<AssignmentGenerator />} />
          <Route path="paper" element={<PaperGenerator />} />
          <Route path="saved" element={<SavedPapers />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="subscription" element={<Subscription />} />
          <Route path="cat" element={<CATHub />} />
          <Route path="cat/practice/:module" element={<CATPractice />} />
          <Route path="cat/mock" element={<CATMockTest />} />
          <Route path="cat/study-plan" element={<CATStudyPlan />} />
          <Route path="cat/analytics" element={<CATAnalytics />} />
        </Route>
        <Route path="/admin" element={<AdminRoute><AdminPanel /></AdminRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
