import { useEffect, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout, type PageId } from './components/Layout';
import { NotificationToastContainer } from './components/NotificationToastContainer';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { SigdDataProvider } from './context/SigdDataContext';
import { ThemeProvider } from './context/ThemeContext';
import { DashboardPage } from './pages/DashboardPage';
import { FacilitiesRefereesPage } from './pages/FacilitiesRefereesPage';
import { MatchResultsPage } from './pages/MatchResultsPage';
import { PublicPortalPage } from './pages/PublicPortalPage';
import { ReportsPage } from './pages/ReportsPage';
import { ScheduleGeneratorPage } from './pages/ScheduleGeneratorPage';
import { StatisticsStandingsPage } from './pages/StatisticsStandingsPage';
import { TeamsPlayersPage } from './pages/TeamsPlayersPage';
import { TournamentsPage } from './pages/TournamentsPage';
import { UsersPermissionsPage } from './pages/UsersPermissionsPage';

function SigdAppRouter() {
  const { firebaseUser, authReady } = useAuth();
  const [activePage, setActivePage] = useState<PageId>('public_portal');

  useEffect(() => {
    if (authReady && firebaseUser && activePage === 'public_portal') {
      setActivePage('dashboard');
    } else if (authReady && !firebaseUser && activePage !== 'public_portal') {
      setActivePage('public_portal');
    }
  }, [authReady, firebaseUser]);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-pitch-canvas flex items-center justify-center">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-6 py-4 text-sm font-medium text-slate-700 dark:text-slate-200">
          Cargando plataforma SIGD...
        </div>
      </div>
    );
  }

  return (
    <Layout activePage={activePage} onNavigate={setActivePage}>
      {activePage === 'public_portal' && <PublicPortalPage />}
      {activePage === 'dashboard' && <DashboardPage onNavigate={setActivePage} />}
      {activePage === 'tournaments' && <TournamentsPage />}
      {activePage === 'teams' && <TeamsPlayersPage />}
      {activePage === 'facilities' && <FacilitiesRefereesPage />}
      {activePage === 'schedule' && <ScheduleGeneratorPage />}
      {activePage === 'results' && <MatchResultsPage />}
      {activePage === 'stats' && <StatisticsStandingsPage />}
      {activePage === 'reports' && <ReportsPage />}
      {activePage === 'users' && <UsersPermissionsPage />}
      <NotificationToastContainer onNavigate={setActivePage} />
    </Layout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <NotificationProvider>
            <SigdDataProvider>
              <SigdAppRouter />
            </SigdDataProvider>
          </NotificationProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
