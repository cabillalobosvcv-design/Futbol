import { useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Shield,
  Trophy,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PageId } from '../components/Layout';
import { TeamCrest } from '../components/TeamCrest';
import { useAuth } from '../context/AuthContext';
import { useSigdData } from '../context/SigdDataContext';
import { bootstrapDefaultCatalog } from '../services/firestoreService';
import { ROLE_LABELS, ROLE_PERMISSIONS } from '../types/sigd';

interface DashboardPageProps {
  onNavigate: (page: PageId) => void;
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { profile, role } = useAuth();
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

  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

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

  // Chart 1: Goals scored per Round from approved match results
  const goalsByRoundData = useMemo(() => {
    const approvedIds = new Set(
      matchResults.filter((r) => r.validationStatus === 'aprobado').map((r) => r.matchId)
    );
    const roundAgg = new Map<number, { jornada: string; goles: number; partidos: number }>();

    matches.forEach((m) => {
      if (!approvedIds.has(m.id)) return;
      const res = matchResults.find((r) => r.matchId === m.id && r.validationStatus === 'aprobado');
      if (!res) return;
      const entry = roundAgg.get(m.roundNumber) || {
        jornada: `J${m.roundNumber}`,
        goles: 0,
        partidos: 0,
      };
      entry.goles += res.homeScore + res.awayScore;
      entry.partidos += 1;
      roundAgg.set(m.roundNumber, entry);
    });

    return Array.from(roundAgg.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, val]) => val);
  }, [matches, matchResults]);

  // Chart 2: Top teams by Points & Goal Difference
  const topTeamsChartData = useMemo(() => {
    return [...teamStatistics]
      .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference)
      .slice(0, 6)
      .map((ts) => ({
        equipo: teamMap.get(ts.teamId)?.shortCode || ts.teamId,
        puntos: ts.points,
        gf: ts.goalsFor,
      }));
  }, [teamStatistics, teamMap]);

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
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-emerald-700">
            Panel de Control Administrativo · {ROLE_LABELS[role]}
          </p>
          <h1 className="text-2xl font-display font-bold text-navy-900 mt-1">
            Bienvenido, {profile?.displayName || 'Administrador'}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
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
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Torneos Registrados</p>
            <p className="text-3xl font-display font-bold text-navy-900 mt-1.5 tabular-nums">
              {tournaments.length}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {categories.length} categorías · {sports.length} deportes
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-blue-50 text-electric-600">
            <Trophy className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Equipos y Jugadores</p>
            <p className="text-3xl font-display font-bold text-navy-900 mt-1.5 tabular-nums">
              {teams.length}
            </p>
            <p className="text-xs text-slate-500 mt-1 tabular-nums">
              {players.length} jugadores inscritos
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-700">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Encuentros Totales</p>
            <p className="text-3xl font-display font-bold text-navy-900 mt-1.5 tabular-nums">
              {matches.length}
            </p>
            <p className="text-xs text-slate-500 mt-1 tabular-nums">
              {fields.filter((f) => f.status === 'disponible').length} canchas disponibles
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-100 text-navy-900">
            <Shield className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Actas por Validar</p>
            <p
              className={`text-3xl font-display font-bold mt-1.5 tabular-nums ${
                pendingValidationMatches.length > 0 ? 'text-red-600' : 'text-emerald-700'
              }`}
            >
              {pendingValidationMatches.length}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {matchResults.filter((r) => r.validationStatus === 'aprobado').length} actas aprobadas
            </p>
          </div>
          <div
            className={`p-2.5 rounded-lg ${
              pendingValidationMatches.length > 0
                ? 'bg-red-50 text-red-600'
                : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            <ClipboardCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Analytics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-electric-500" />
              <h2 className="font-display font-semibold text-base text-slate-900">
                Goles Oficiales por Jornada
              </h2>
            </div>
            <span className="text-xs text-slate-500">Solo actas aprobadas</span>
          </div>
          <div className="h-64">
            {goalsByRoundData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg">
                Captura y aprueba actas para visualizar el comportamiento de goles por jornada.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={goalsByRoundData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="jornada" tick={{ fontSize: 12, fill: '#475569' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#475569' }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="goles" name="Goles totales" fill="#2563EB" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-emerald-600" />
              <h2 className="font-display font-semibold text-base text-slate-900">
                Líderes por Puntuación Oficial
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('stats')}
              className="text-xs font-medium text-electric-600 hover:underline"
            >
              Ver estadísticas
            </button>
          </div>
          <div className="h-64">
            {topTeamsChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg">
                Aún no existen estadísticas colectivas calculadas.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topTeamsChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="equipo" tick={{ fontSize: 12, fill: '#475569' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#475569' }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="puntos" name="Puntos" fill="#0A192F" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="gf" name="Goles a favor" fill="#16A34A" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Pending Validations & Upcoming Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <h2 className="font-display font-semibold text-base text-slate-900">
                Actas Pendientes de Validación
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('results')}
              className="text-xs font-medium text-electric-600 hover:underline"
            >
              Revisar actas
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {pendingValidationMatches.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No hay actas pendientes de aprobación en este momento.
              </div>
            ) : (
              pendingValidationMatches.map((m) => (
                <div key={m.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">
                      Partido #{m.matchNumber} · {categoryMap.get(m.categoryId)?.name}
                    </p>
                    <p className="text-sm font-semibold text-slate-900 truncate mt-0.5">
                      {teamMap.get(m.homeTeamId)?.name} vs {teamMap.get(m.awayTeamId)?.name}
                    </p>
                  </div>
                  <span className="font-mono font-bold text-sm px-2.5 py-1 rounded bg-red-50 text-red-700 tabular-nums shrink-0">
                    {m.homeScore ?? 0} - {m.awayScore ?? 0}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-electric-500" />
              <h2 className="font-display font-semibold text-base text-slate-900">
                Agenda Próxima de Partidos
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('schedule')}
              className="text-xs font-medium text-electric-600 hover:underline"
            >
              Administrar calendario
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {upcomingMatches.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No hay encuentros programados. Crea un torneo y genera los roles desde el Generador.
              </div>
            ) : (
              upcomingMatches.map((m) => {
                const home = teamMap.get(m.homeTeamId);
                const away = teamMap.get(m.awayTeamId);
                return (
                  <div key={m.id} className="p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <TeamCrest
                        name={home?.name || m.homeTeamId}
                        shortCode={home?.shortCode || 'LOC'}
                        primaryColor={home?.primaryColor}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {home?.name || m.homeTeamId} vs {away?.name || m.awayTeamId}
                        </p>
                        <p className="text-xs text-slate-500">
                          {categoryMap.get(m.categoryId)?.name} · Jornada {m.roundNumber}
                        </p>
                      </div>
                    </div>
                    <div className="text-right font-mono text-xs text-slate-700 tabular-nums shrink-0">
                      <span className="block font-semibold">{m.date}</span>
                      <span className="text-slate-500">{m.time}</span>
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
