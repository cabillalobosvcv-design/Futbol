import { useEffect, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout, type PageId } from './components/Layout';
import { NotificationToastContainer } from './components/NotificationToastContainer';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { SigdDataProvider } from './context/SigdDataContext';
import { ThemeProvider } from './context/ThemeContext';
import { ActivityHistoryPage } from './pages/ActivityHistoryPage';
import { DashboardPage } from './pages/DashboardPage';
import { FacilitiesRefereesPage } from './pages/FacilitiesRefereesPage';
import { MatchResultsPage } from './pages/MatchResultsPage';
import { OrganizationConfigPage } from './pages/OrganizationConfigPage';
import { PublicPortalPage } from './pages/PublicPortalPage';
import { RefereeAssignmentsPage } from './pages/RefereeAssignmentsPage';
import { RefereeCapturePage } from './pages/RefereeCapturePage';
import { ReportsPage } from './pages/ReportsPage';
import { RulesConfigPage } from './pages/RulesConfigPage';
import { ScheduleGeneratorPage } from './pages/ScheduleGeneratorPage';
import { StatisticsStandingsPage } from './pages/StatisticsStandingsPage';
import { TeamsPlayersPage } from './pages/TeamsPlayersPage';
import { TournamentsPage } from './pages/TournamentsPage';
import { UsersPermissionsPage } from './pages/UsersPermissionsPage';

function SigdAppRouter() {
  const { firebaseUser, role, authReady } = useAuth();
  const [activePage, setActivePage] = useState<PageId>('public_portal');
  const [captureMatchId, setCaptureMatchId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (authReady && firebaseUser && activePage === 'public_portal') {
      setActivePage(role === 'arbitro' ? 'referee_capture' : 'dashboard');
    } else if (authReady && !firebaseUser && activePage !== 'public_portal') {
      setActivePage('public_portal');
    }
  }, [authReady, firebaseUser, role]);

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
      {activePage === 'rules' && <RulesConfigPage />}
      {activePage === 'teams' && <TeamsPlayersPage />}
      {activePage === 'facilities' && <FacilitiesRefereesPage />}
      {activePage === 'schedule' && <ScheduleGeneratorPage />}
      {activePage === 'referee_assignments' && (
        <RefereeAssignmentsPage
          onNavigate={setActivePage}
          onOpenCapture={(matchId) => {
            setCaptureMatchId(matchId);
            setActivePage('referee_capture');
          }}
        />
      )}
      {activePage === 'referee_capture' && (
        <RefereeCapturePage initialMatchId={captureMatchId} onNavigate={setActivePage} />
      )}
      {activePage === 'results' && <MatchResultsPage />}
      {activePage === 'stats' && <StatisticsStandingsPage />}
      {activePage === 'reports' && <ReportsPage />}
      {activePage === 'organization' && <OrganizationConfigPage />}
      {activePage === 'activity_history' && <ActivityHistoryPage />}
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
