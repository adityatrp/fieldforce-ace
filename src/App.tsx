import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import AuthPage from "@/pages/AuthPage";
import Dashboard from "@/pages/Dashboard";
import VisitsPage from "@/pages/VisitsPage";
import ExpensesPage from "@/pages/ExpensesPage";
import LeaderboardPage from "@/pages/LeaderboardPage";
import TeamPage from "@/pages/TeamPage";
import ReportsPage from "@/pages/ReportsPage";
import TrackingPage from "@/pages/TrackingPage";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const ProtectedTeamPage = () => {
  const { role } = useAuth();
  if (role === 'salesperson') return <Navigate to="/" replace />;
  return <TeamPage />;
};

const ProtectedReportsPage = () => {
  const { role } = useAuth();
  if (role !== 'admin') return <Navigate to="/" replace />;
  return <ReportsPage />;
};

const AppRoutes = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-primary font-semibold">Loading...</div>
      </div>
    );
  }

  if (!user) return <AuthPage />;

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/visits" element={<VisitsPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/team" element={<ProtectedTeamPage />} />
        <Route path="/reports" element={<ProtectedReportsPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
