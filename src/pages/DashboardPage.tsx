import { useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Database,
  MapPin,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PageId } from '../components/Layout';
import { MatchStatusIndicator } from '../components/SemanticIcons';
import { TeamCrest } from '../components/TeamCrest';
import { useAuth } from '../context/AuthContext';
import { useSigdData } from '../context/SigdDataContext';
import { useTheme } from '../context/ThemeContext';
import { bootstrapDefaultCatalog } from '../services/firestoreService';
import { ROLE_LABELS, ROLE_PERMISSIONS } from '../types/sigd';

interface DashboardPageProps {
  onNavigate: (page: PageId) => void;
}

type GrowthViewMode = 'cumulative' | 'per_round';
type TournamentChartMetric = 'ambos' | 'partidos' | 'goles';

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { profile, role } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const gridStroke = isDark ? '#1e293b' : '#E2E8F0';
  const axisColor = isDark ? '#94a3b8' : '#475569';
  const secondarySeriesColor = isDark ? '#38bdf8' : '#0A192F';
  const tooltipStyle = {
    backgroundColor: isDark ? '#0f172a' : '#ffffff',
    borderColor: isDark ? '#334155' : '#e2e8f0',
    borderRadius: '0.5rem',
    color: isDark ? '#f1f5f9' : '#0f172a',
    fontSize: '12px',
  };
  const {
    sports,
    tournaments,
    categories,
    teams,
    players,
    matches,
    matchResults,
    teamStatistics,
    fields,
  } = useSigdData();

  const [bootstrapping, setBootstrapping] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('all');
  const [growthViewMode, setGrowthViewMode] = useState<GrowthViewMode>('cumulative');
  const [tournamentChartMetric, setTournamentChartMetric] =
    useState<TournamentChartMetric>('ambos');

  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const approvedResultByMatch = useMemo(() => {
    const map = new Map<string, (typeof matchResults)[number]>();
    matchResults
      .filter((r) => r.validationStatus === 'aprobado')
      .forEach((r) => map.set(r.matchId, r));
    return map;
  }, [matchResults]);

  const pendingValidationMatches = useMemo(
    () => matches.filter((m) => m.status === 'Pendiente de validación'),
    [matches]
  );

  const upcomingMatches = useMemo(
    () =>
      matches
        .filter((m) => m.status === 'Programado' || m.status === 'Reprogramado')
        .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
        .slice(0, 6),
    [matches]
  );

  // Scoped matches & goals for interactive tournament filter
  const scopedMatches = useMemo(
    () =>
      selectedTournamentId === 'all'
        ? matches
        : matches.filter((m) => m.tournamentId === selectedTournamentId),
    [matches, selectedTournamentId]
  );

  const growthSummary = useMemo(() => {
    let finishedMatches = 0;
    let totalGoals = 0;

    scopedMatches.forEach((m) => {
      const res = approvedResultByMatch.get(m.id);
      if (res) {
        finishedMatches += 1;
        totalGoals += res.homeScore + res.awayScore;
      }
    });

    const totalScheduled = scopedMatches.length;
    const completionPct =
      totalScheduled > 0 ? Math.round((finishedMatches / totalScheduled) * 100) : 0;
    const avgGoalsPerMatch =
      finishedMatches > 0 ? (totalGoals / finishedMatches).toFixed(2) : '0.00';

    return {
      totalScheduled,
      finishedMatches,
      totalGoals,
      completionPct,
      avgGoalsPerMatch,
    };
  }, [scopedMatches, approvedResultByMatch]);

  // Growth progression series across rounds (cumulative or per round)
  const roundProgressionData = useMemo(() => {
    const roundMap = new Map<
      number,
      { roundNumber: number; jornada: string; partidos: number; finalizados: number; goles: number }
    >();

    scopedMatches.forEach((m) => {
      const entry = roundMap.get(m.roundNumber) || {
        roundNumber: m.roundNumber,
        jornada: `J${m.roundNumber}`,
        partidos: 0,
        finalizados: 0,
        goles: 0,
      };
      entry.partidos += 1;
      const res = approvedResultByMatch.get(m.id);
      if (res) {
        entry.finalizados += 1;
        entry.goles += res.homeScore + res.awayScore;
      }
      roundMap.set(m.roundNumber, entry);
    });

    const sorted = Array.from(roundMap.values()).sort((a, b) => a.roundNumber - b.roundNumber);
    if (growthViewMode === 'per_round') {
      return sorted;
    }

    let accPartidos = 0;
    let accFinalizados = 0;
    let accGoles = 0;
    return sorted.map((item) => {
      accPartidos += item.partidos;
      accFinalizados += item.finalizados;
      accGoles += item.goles;
      return {
        ...item,
        partidos: accPartidos,
        finalizados: accFinalizados,
        goles: accGoles,
      };
    });
  }, [scopedMatches, approvedResultByMatch, growthViewMode]);

  // Matches and goals comparison per tournament
  const tournamentComparisonData = useMemo(() => {
    return tournaments.map((t) => {
      const tMatches = matches.filter((m) => m.tournamentId === t.id);
      let finalizados = 0;
      let goles = 0;
      tMatches.forEach((m) => {
        const res = approvedResultByMatch.get(m.id);
        if (res) {
          finalizados += 1;
          goles += res.homeScore + res.awayScore;
        }
      });
      const shortName = t.name.length > 18 ? `${t.name.slice(0, 16)}…` : t.name;
      return {
        id: t.id,
        torneo: shortName,
        nombreCompleto: t.name,
        partidos: tMatches.length,
        finalizados,
        goles,
        promedioGoles: finalizados > 0 ? Number((goles / finalizados).toFixed(2)) : 0,
      };
    });
  }, [tournaments, matches, approvedResultByMatch]);

  // Top teams by Points & Goal Difference
  const topTeamsChartData = useMemo(() => {
    return [...teamStatistics]
      .filter((ts) =>
        selectedTournamentId === 'all' ? true : ts.tournamentId === selectedTournamentId
      )
      .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference)
      .slice(0, 6)
      .map((ts) => ({
        equipo: teamMap.get(ts.teamId)?.shortCode || ts.teamId,
        puntos: ts.points,
        gf: ts.goalsFor,
      }));
  }, [teamStatistics, teamMap, selectedTournamentId]);

  const handleBootstrapCatalog = async () => {
    if (!profile) return;
    setBootstrapping(true);
    setFeedback(null);
    try {
      await bootstrapDefaultCatalog(profile.uid, profile.displayName);
      setFeedback('Catálogo multideporte, ramas y reglamentos base inicializados en Firestore.');
    } finally {
      setBootstrapping(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Welcome & Action */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            Panel de Control Administrativo · {ROLE_LABELS[role]}
          </p>
          <h1 className="text-2xl font-display font-bold text-navy-900 dark:text-white mt-1">
            Bienvenido, {profile?.displayName || 'Administrador'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Monitoreo en tiempo real de torneos, programación de roles, actas pendientes y métricas oficiales.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {sports.length === 0 && ROLE_PERMISSIONS.canManageSportsAndRules(role) && (
            <button
              type="button"
              disabled={bootstrapping}
              onClick={handleBootstrapCatalog}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
            >
              <Database className="w-4 h-4" />
              {bootstrapping ? 'Inicializando...' : 'Inicializar Catálogo Base'}
            </button>
          )}
          {ROLE_PERMISSIONS.canGenerateSchedule(role) && (
            <button
              type="button"
              onClick={() => onNavigate('schedule')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-electric-500 hover:bg-electric-600 text-white text-sm font-medium transition-colors"
            >
              <CalendarDays className="w-4 h-4" />
              Generar Roles
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Interactive Color-Coded KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('tournaments')}
          className="group text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-400 dark:hover:border-amber-500/70 rounded-xl p-5 flex items-start justify-between transition-colors cursor-pointer"
        >
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Torneos Registrados</p>
            <p className="text-3xl font-display font-bold text-navy-900 dark:text-white mt-1.5 tabular-nums">
              {tournaments.length}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {categories.length} categorías · {sports.length} deportes
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 transition-transform duration-150 group-hover:scale-110">
            <Trophy className="w-5 h-5" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('teams')}
          className="group text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-500/70 rounded-xl p-5 flex items-start justify-between transition-colors cursor-pointer"
        >
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Equipos y Jugadores</p>
            <p className="text-3xl font-display font-bold text-navy-900 dark:text-white mt-1.5 tabular-nums">
              {teams.length}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
              {players.length} jugadores inscritos
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 transition-transform duration-150 group-hover:scale-110">
            <Users className="w-5 h-5" />
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            onNavigate(ROLE_PERMISSIONS.canGenerateSchedule(role) ? 'schedule' : 'public_portal')
          }
          className="group text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-violet-400 dark:hover:border-violet-500/70 rounded-xl p-5 flex items-start justify-between transition-colors cursor-pointer"
        >
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Encuentros Totales</p>
            <p className="text-3xl font-display font-bold text-navy-900 dark:text-white mt-1.5 tabular-nums">
              {matches.length}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
              {fields.filter((f) => f.status === 'disponible').length} canchas disponibles
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 transition-transform duration-150 group-hover:scale-110">
            <CalendarDays className="w-5 h-5" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('results')}
          className={`group text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-start justify-between transition-colors cursor-pointer ${
            pendingValidationMatches.length > 0
              ? 'hover:border-rose-400 dark:hover:border-rose-500/70'
              : 'hover:border-emerald-400 dark:hover:border-emerald-500/70'
          }`}
        >
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Actas por Validar</p>
            <p
              className={`text-3xl font-display font-bold mt-1.5 tabular-nums ${
                pendingValidationMatches.length > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {pendingValidationMatches.length}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {matchResults.filter((r) => r.validationStatus === 'aprobado').length} actas aprobadas
            </p>
          </div>
          <div
            className={`p-2.5 rounded-lg transition-transform duration-150 group-hover:scale-110 ${
              pendingValidationMatches.length > 0
                ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
            }`}
          >
            <ClipboardCheck className="w-5 h-5" />
          </div>
        </button>
      </div>

      {/* Interactive Recharts Growth Section */}
      <section className="space-y-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <TrendingUp className="w-4 h-4 text-electric-500 shrink-0" />
            <div>
              <h2 className="font-display font-semibold text-base text-slate-900 dark:text-slate-100">
                Crecimiento de Partidos y Goles por Torneo
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Filtra por torneo y alterna entre evolución acumulada o por jornada.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              aria-label="Filtrar gráficas por torneo"
              value={selectedTournamentId}
              onChange={(e) => setSelectedTournamentId(e.target.value)}
              className="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric-500"
            >
              <option value="all">Todos los torneos ({tournaments.length})</option>
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setGrowthViewMode('cumulative')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  growthViewMode === 'cumulative'
                    ? 'bg-white dark:bg-slate-700 text-navy-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Acumulado
              </button>
              <button
                type="button"
                onClick={() => setGrowthViewMode('per_round')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  growthViewMode === 'per_round'
                    ? 'bg-white dark:bg-slate-700 text-navy-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Por jornada
              </button>
            </div>
          </div>
        </div>

        {/* Two Interactive Sparkline Statistical Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Interactive Card 1: Match Growth */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Crecimiento de Partidos {selectedTournamentId === 'all' ? '(Global)' : '(Torneo)'}
                </p>
                <div className="flex items-baseline gap-3 mt-1">
                  <span className="text-3xl font-display font-bold text-navy-900 dark:text-white tabular-nums">
                    {growthSummary.totalScheduled}
                  </span>
                  <span className="text-xs font-mono text-electric-600 dark:text-blue-400 tabular-nums">
                    {growthSummary.finishedMatches} finalizados ({growthSummary.completionPct}%)
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('schedule')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 shrink-0"
              >
                <CalendarDays className="w-3.5 h-3.5 text-electric-500" />
                Ver calendario
              </button>
            </div>

            <div className="h-52">
              {roundProgressionData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg px-4 text-center">
                  Genera roles de juego en el torneo para visualizar el crecimiento de encuentros.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={roundProgressionData}>
                    <defs>
                      <linearGradient id="gradPartidos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563EB" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#2563EB" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gradFinalizados" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={secondarySeriesColor} stopOpacity={0.24} />
                        <stop offset="95%" stopColor={secondarySeriesColor} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis dataKey="jornada" tick={{ fontSize: 11, fill: axisColor }} />
                    <YAxis tick={{ fontSize: 11, fill: axisColor }} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: '12px', color: axisColor }} />
                    <Area
                      type="monotone"
                      dataKey="partidos"
                      name="Partidos programados"
                      stroke="#2563EB"
                      strokeWidth={2}
                      fill="url(#gradPartidos)"
                    />
                    <Area
                      type="monotone"
                      dataKey="finalizados"
                      name="Partidos validados"
                      stroke={secondarySeriesColor}
                      strokeWidth={2}
                      fill="url(#gradFinalizados)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Interactive Card 2: Goal Growth */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Crecimiento de Goles Oficiales (Actas Aprobadas)
                </p>
                <div className="flex items-baseline gap-3 mt-1">
                  <span className="text-3xl font-display font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {growthSummary.totalGoals}
                  </span>
                  <span className="text-xs font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                    {growthSummary.avgGoalsPerMatch} goles/partido
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('results')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 shrink-0"
              >
                <Target className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Capturar actas
              </button>
            </div>

            <div className="h-52">
              {roundProgressionData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg px-4 text-center">
                  Aprueba resultados oficiales para visualizar el crecimiento de goles por jornada.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={roundProgressionData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis dataKey="jornada" tick={{ fontSize: 11, fill: axisColor }} />
                    <YAxis tick={{ fontSize: 11, fill: axisColor }} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: '12px', color: axisColor }} />
                    <Line
                      type="monotone"
                      dataKey="goles"
                      name={growthViewMode === 'cumulative' ? 'Goles acumulados' : 'Goles en jornada'}
                      stroke="#16A34A"
                      strokeWidth={2.5}
                      dot={{
                        r: 4,
                        fill: '#16A34A',
                        strokeWidth: 2,
                        stroke: isDark ? '#0f172a' : '#FFFFFF',
                      }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Analytics Row: Per-Tournament Comparison & Top Teams */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-electric-500" />
              <h2 className="font-display font-semibold text-base text-slate-900 dark:text-slate-100">
                Comparativa de Partidos y Goles por Torneo
              </h2>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
              {(
                [
                  { id: 'ambos', label: 'Ambos' },
                  { id: 'partidos', label: 'Partidos' },
                  { id: 'goles', label: 'Goles' },
                ] as { id: TournamentChartMetric; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTournamentChartMetric(opt.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    tournamentChartMetric === opt.id
                      ? 'bg-white dark:bg-slate-700 text-navy-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-64">
            {tournamentComparisonData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                Crea un torneo y programa encuentros para comparar métricas entre torneos.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tournamentComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis dataKey="torneo" tick={{ fontSize: 11, fill: axisColor }} />
                  <YAxis tick={{ fontSize: 11, fill: axisColor }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: '12px', color: axisColor }} />
                  {(tournamentChartMetric === 'ambos' || tournamentChartMetric === 'partidos') && (
                    <Bar
                      dataKey="partidos"
                      name="Partidos"
                      fill="#2563EB"
                      radius={[6, 6, 0, 0]}
                      onClick={(data) => {
                        if (data?.id) setSelectedTournamentId(String(data.id));
                      }}
                      className="cursor-pointer"
                    />
                  )}
                  {(tournamentChartMetric === 'ambos' || tournamentChartMetric === 'goles') && (
                    <Bar
                      dataKey="goles"
                      name="Goles oficiales"
                      fill="#16A34A"
                      radius={[6, 6, 0, 0]}
                      onClick={(data) => {
                        if (data?.id) setSelectedTournamentId(String(data.id));
                      }}
                      className="cursor-pointer"
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="font-display font-semibold text-base text-slate-900 dark:text-slate-100">
                Líderes por Puntuación Oficial
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('stats')}
              className="text-xs font-medium text-electric-600 dark:text-blue-400 hover:underline"
            >
              Ver estadísticas
            </button>
          </div>
          <div className="h-64">
            {topTeamsChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                Aún no existen estadísticas colectivas calculadas.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topTeamsChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis dataKey="equipo" tick={{ fontSize: 12, fill: axisColor }} />
                  <YAxis tick={{ fontSize: 12, fill: axisColor }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: '12px', color: axisColor }} />
                  <Bar
                    dataKey="puntos"
                    name="Puntos"
                    fill={secondarySeriesColor}
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar dataKey="gf" name="Goles a favor" fill="#16A34A" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Pending Validations & Upcoming Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
              <h2 className="font-display font-semibold text-base text-slate-900 dark:text-slate-100">
                Actas Pendientes de Validación
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('results')}
              className="text-xs font-medium text-electric-600 dark:text-blue-400 hover:underline"
            >
              Revisar actas
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {pendingValidationMatches.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No hay actas pendientes de aprobación en este momento.
              </div>
            ) : (
              pendingValidationMatches.map((m) => {
                const home = teamMap.get(m.homeTeamId);
                const away = teamMap.get(m.awayTeamId);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onNavigate('results')}
                    className="group w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span>
                          Partido #{m.matchNumber} · {categoryMap.get(m.categoryId)?.name}
                        </span>
                        <MatchStatusIndicator status={m.status} />
                      </div>
                      <div className="flex items-center gap-2 mt-1 min-w-0">
                        <TeamCrest
                          name={home?.name || m.homeTeamId}
                          shortCode={home?.shortCode || 'LOC'}
                          primaryColor={home?.primaryColor}
                          secondaryColor={home?.secondaryColor}
                          crestUrl={home?.crestUrl}
                          size="sm"
                        />
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {home?.name || m.homeTeamId} vs {away?.name || m.awayTeamId}
                        </p>
                        <TeamCrest
                          name={away?.name || m.awayTeamId}
                          shortCode={away?.shortCode || 'VIS'}
                          primaryColor={away?.primaryColor}
                          secondaryColor={away?.secondaryColor}
                          crestUrl={away?.crestUrl}
                          size="sm"
                        />
                      </div>
                    </div>
                    <span className="font-mono font-bold text-sm px-2.5 py-1 rounded bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 tabular-nums shrink-0 transition-transform duration-150 group-hover:scale-105">
                      {m.homeScore ?? 0} - {m.awayScore ?? 0}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              <h2 className="font-display font-semibold text-base text-slate-900 dark:text-slate-100">
                Agenda Próxima de Partidos
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('schedule')}
              className="text-xs font-medium text-electric-600 dark:text-blue-400 hover:underline"
            >
              Administrar calendario
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {upcomingMatches.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No hay encuentros programados. Crea un torneo y genera los roles desde el Generador.
              </div>
            ) : (
              upcomingMatches.map((m) => {
                const home = teamMap.get(m.homeTeamId);
                const away = teamMap.get(m.awayTeamId);
                const assignedField = m.fieldId ? fields.find((f) => f.id === m.fieldId) : undefined;
                return (
                  <div
                    key={m.id}
                    className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center gap-1.5 shrink-0">
                        <TeamCrest
                          name={home?.name || m.homeTeamId}
                          shortCode={home?.shortCode || 'LOC'}
                          primaryColor={home?.primaryColor}
                          secondaryColor={home?.secondaryColor}
                          crestUrl={home?.crestUrl}
                          size="sm"
                        />
                        <TeamCrest
                          name={away?.name || m.awayTeamId}
                          shortCode={away?.shortCode || 'VIS'}
                          primaryColor={away?.primaryColor}
                          secondaryColor={away?.secondaryColor}
                          crestUrl={away?.crestUrl}
                          size="sm"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {home?.name || m.homeTeamId} vs {away?.name || m.awayTeamId}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          <span>
                            {categoryMap.get(m.categoryId)?.name} · Jornada {m.roundNumber}
                          </span>
                          {assignedField && (
                            <span className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400">
                              <MapPin className="w-3 h-3 shrink-0" />
                              {assignedField.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right font-mono text-xs text-slate-700 dark:text-slate-200 tabular-nums shrink-0">
                      <span className="block font-semibold">{m.date}</span>
                      <span className="inline-flex items-center justify-end gap-1 text-blue-600 dark:text-blue-400">
                        <Clock className="w-3 h-3 shrink-0" />
                        {m.time}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
