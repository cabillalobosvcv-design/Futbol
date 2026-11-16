import { useMemo, useState } from 'react';
import {
  Award,
  BarChart3,
  ChevronDown,
  Filter,
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
import { CollapsibleSection } from '../components/CollapsibleSection';
import { MobileCollapsibleStandings } from '../components/MobileCollapsibleStandings';
import { TeamCrest } from '../components/TeamCrest';
import { useSigdData } from '../context/SigdDataContext';
import { useTheme } from '../context/ThemeContext';

type StatView = 'standings' | 'teams' | 'players' | 'rankings';
type RankingMetric =
  | 'scorers'
  | 'assists'
  | 'appearances'
  | 'goalkeepers'
  | 'team_attack'
  | 'team_defense'
  | 'team_wins'
  | 'team_gd';

export function StatisticsStandingsPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const gridStroke = isDark ? '#1e293b' : '#E2E8F0';
  const axisColor = isDark ? '#94a3b8' : '#475569';
  const tooltipStyle = {
    backgroundColor: isDark ? '#0f172a' : '#ffffff',
    borderColor: isDark ? '#334155' : '#e2e8f0',
    borderRadius: '0.5rem',
    color: isDark ? '#f1f5f9' : '#0f172a',
    fontSize: '12px',
  };
  const {
    tournaments,
    sportRules,
    categories,
    teams,
    players,
    standings,
    teamStatistics,
    playerStatistics,
  } = useSigdData();

  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [view, setView] = useState<StatView>('standings');
  const [rankingMetric, setRankingMetric] = useState<RankingMetric>('scorers');

  // Mobile collapsible states
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [chartOpen, setChartOpen] = useState(true);
  const [mobileRankingsMenuOpen, setMobileRankingsMenuOpen] = useState(false);
  const [expandedTeamStatIds, setExpandedTeamStatIds] = useState<Record<string, boolean>>({});
  const [expandedPlayerStatIds, setExpandedPlayerStatIds] = useState<Record<string, boolean>>({});
  const [expandedRankingIds, setExpandedRankingIds] = useState<Record<string, boolean>>({});

  const activeTournament =
    tournaments.find((t) => t.id === selectedTournamentId) || tournaments[0];
  const activeTournamentRule = useMemo(
    () =>
      sportRules.find((r) => r.tournamentId === activeTournament?.id) ||
      sportRules.find((r) => r.sportId === activeTournament?.sportId && !r.tournamentId),
    [sportRules, activeTournament?.id, activeTournament?.sportId]
  );
  const hasDrawPenaltyRule = Boolean(
    activeTournament?.drawPenaltyShootout ?? activeTournamentRule?.drawPenaltyShootout
  );
  const drawPenaltyBonus =
    activeTournament?.drawPenaltyWinBonusPoints ??
    activeTournamentRule?.drawPenaltyWinBonusPoints ??
    1;
  const tournamentCategories = useMemo(
    () => categories.filter((c) => c.tournamentId === activeTournament?.id),
    [categories, activeTournament?.id]
  );
  const activeCategory =
    tournamentCategories.find((c) => c.id === selectedCategoryId) || tournamentCategories[0];

  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const catStandings = useMemo(
    () =>
      standings
        .filter((s) => s.categoryId === activeCategory?.id)
        .sort((a, b) => a.position - b.position),
    [standings, activeCategory?.id]
  );

  const catTeamStats = useMemo(
    () =>
      teamStatistics
        .filter((ts) => ts.categoryId === activeCategory?.id)
        .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference),
    [teamStatistics, activeCategory?.id]
  );

  const catPlayerStats = useMemo(
    () =>
      playerStatistics
        .filter((ps) => ps.categoryId === activeCategory?.id)
        .sort((a, b) => b.goals - a.goals || b.assists - a.assists),
    [playerStatistics, activeCategory?.id]
  );

  const chartData = useMemo(
    () =>
      catTeamStats.map((ts) => ({
        equipo: teamMap.get(ts.teamId)?.shortCode || ts.teamId,
        efectividad: ts.effectivenessRate,
        gf: ts.goalsFor,
        gc: ts.goalsAgainst,
      })),
    [catTeamStats, teamMap]
  );

  const rankingOptions: { id: RankingMetric; label: string }[] = [
    { id: 'scorers', label: 'Tabla de Goleadores' },
    { id: 'assists', label: 'Máximos Asistentes' },
    { id: 'appearances', label: 'Más Partidos' },
    { id: 'goalkeepers', label: 'Porteros Destacados' },
    { id: 'team_attack', label: 'Equipos Más Goleadores' },
    { id: 'team_defense', label: 'Menos Goles Recibidos' },
    { id: 'team_wins', label: 'Más Victorias' },
    { id: 'team_gd', label: 'Mejor Diferencia de Goles' },
  ];

  const activeRankingLabel =
    rankingOptions.find((o) => o.id === rankingMetric)?.label || 'Tabla de Goleadores';

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-display font-bold text-navy-900 dark:text-white">
              Motor Estadístico y Tablas de Posiciones
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-0.5">
              Indicadores colectivos e individuales calculados desde actas oficiales aprobadas.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((v) => !v)}
            aria-expanded={mobileFiltersOpen}
            className="sm:hidden inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 shrink-0"
          >
            <Filter className="w-3.5 h-3.5 text-electric-500" />
            <span>Filtros</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-150 ${
                mobileFiltersOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        <div className="sm:hidden text-xs text-slate-500 dark:text-slate-400 truncate">
          {activeTournament?.name || 'Torneo'} · {activeCategory?.name || 'Categoría'}
        </div>

        <div
          className={`${
            mobileFiltersOpen ? 'grid' : 'hidden'
          } sm:flex grid-cols-1 sm:flex-wrap items-center gap-2`}
        >
          <select
            value={activeTournament?.id || ''}
            onChange={(e) => {
              setSelectedTournamentId(e.target.value);
              setSelectedCategoryId('');
            }}
            className="w-full sm:w-auto px-3 py-2 min-h-[42px] text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          >
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={activeCategory?.id || ''}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 min-h-[42px] text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          >
            {tournamentCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Navigation Tabs (Horizontally scrollable on mobile, wrapping cleanly on desktop) */}
      <div className="flex items-center gap-1.5 overflow-x-auto p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full sm:w-fit">
        <button
          type="button"
          onClick={() => setView('standings')}
          className={`inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 min-h-[40px] rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 ${
            view === 'standings'
              ? 'bg-navy-900 dark:bg-electric-500 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Trophy className="w-4 h-4 shrink-0" />
          Tabla de Posiciones
        </button>
        <button
          type="button"
          onClick={() => setView('teams')}
          className={`inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 min-h-[40px] rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 ${
            view === 'teams'
              ? 'bg-navy-900 dark:bg-electric-500 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Shield className="w-4 h-4 shrink-0" />
          Estadísticas por Equipo
        </button>
        <button
          type="button"
          onClick={() => setView('players')}
          className={`inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 min-h-[40px] rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 ${
            view === 'players'
              ? 'bg-navy-900 dark:bg-electric-500 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Users className="w-4 h-4 shrink-0" />
          Estadísticas Individuales
        </button>
        <button
          type="button"
          onClick={() => setView('rankings')}
          className={`inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 min-h-[40px] rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 ${
            view === 'rankings'
              ? 'bg-navy-900 dark:bg-electric-500 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Award className="w-4 h-4 shrink-0" />
          Goleadores y Rankings
        </button>
      </div>

      {view === 'standings' && (() => {
        const showPenCol =
          hasDrawPenaltyRule || catStandings.some((st) => (st.penaltyWins ?? 0) > 0);
        return (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display font-semibold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                Posiciones Oficiales — {activeCategory?.name || 'Categoría'}
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Sistema: {activeTournamentRule?.winPoints ?? activeTournament?.winPoints ?? 3}V /{' '}
                {activeTournamentRule?.drawPoints ?? activeTournament?.drawPoints ?? 1}E
                {hasDrawPenaltyRule ? ` (+${drawPenaltyBonus} Pen)` : ''} /{' '}
                {activeTournamentRule?.lossPoints ?? activeTournament?.lossPoints ?? 0}D
              </span>
            </div>
            {catStandings.length === 0 ? (
              <div className="p-8 sm:p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                No hay posiciones oficiales calculadas aún. Aprueba al menos un acta para calcular la tabla.
              </div>
            ) : (
              <>
                <MobileCollapsibleStandings
                  standings={catStandings}
                  teamMap={teamMap}
                  showPenCol={showPenCol}
                />

                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                        <th className="py-3 px-4 text-left font-semibold">POS</th>
                        <th className="py-3 px-4 text-left font-semibold">EQUIPO</th>
                        <th className="py-3 px-3 text-right font-semibold">PJ</th>
                        <th className="py-3 px-3 text-right font-semibold">PG</th>
                        <th className="py-3 px-3 text-right font-semibold">PE</th>
                        {showPenCol && (
                          <th
                            className="py-3 px-3 text-right font-semibold text-amber-700 dark:text-amber-400"
                            title="Ganados en Penales (+1 pt extra)"
                          >
                            PEN
                          </th>
                        )}
                        <th className="py-3 px-3 text-right font-semibold">PP</th>
                        <th className="py-3 px-3 text-right font-semibold">GF</th>
                        <th className="py-3 px-3 text-right font-semibold">GC</th>
                        <th className="py-3 px-3 text-right font-semibold">DG</th>
                        <th className="py-3 px-4 text-right font-semibold">PTS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {catStandings.map((st) => {
                        const tm = teamMap.get(st.teamId);
                        return (
                          <tr key={st.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="py-3 px-4 font-mono font-bold tabular-nums text-navy-900 dark:text-white">
                              {st.position}
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                              <div className="flex items-center gap-2.5">
                                <TeamCrest
                                  name={tm?.name || st.teamId}
                                  shortCode={tm?.shortCode || 'EQ'}
                                  primaryColor={tm?.primaryColor}
                                  secondaryColor={tm?.secondaryColor}
                                  crestUrl={tm?.crestUrl}
                                  size="sm"
                                />
                                <span>{tm?.name || st.teamId}</span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums">{st.played}</td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                              {st.wins}
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums">{st.draws}</td>
                            {showPenCol && (
                              <td className="py-3 px-3 text-right font-mono tabular-nums text-amber-700 dark:text-amber-400">
                                {st.penaltyWins ?? 0}
                              </td>
                            )}
                            <td className="py-3 px-3 text-right font-mono tabular-nums text-red-600 dark:text-red-400">
                              {st.losses}
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums">{st.goalsFor}</td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums">{st.goalsAgainst}</td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums">
                              {st.goalDifference > 0 ? `+${st.goalDifference}` : st.goalDifference}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-navy-900 dark:text-white">
                              {st.points}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {view === 'teams' && (
        <div className="space-y-5 sm:space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-display font-semibold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                Indicadores Avanzados por Equipo
              </h2>
            </div>

            {catTeamStats.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                Sin estadísticas colectivas registradas para esta categoría.
              </div>
            ) : (
              <>
                {/* Mobile Collapsible Team Stats */}
                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                  <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                    <span>Equipo</span>
                    <span>PJ · % Efect · PTS</span>
                  </div>
                  {catTeamStats.map((ts) => {
                    const team = teamMap.get(ts.teamId);
                    const isOpen = Boolean(expandedTeamStatIds[ts.id]);
                    return (
                      <div key={ts.id}>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedTeamStatIds((prev) => ({ ...prev, [ts.id]: !prev[ts.id] }))
                          }
                          aria-expanded={isOpen}
                          className="w-full min-h-[54px] px-4 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <TeamCrest
                              name={team?.name || ts.teamId}
                              shortCode={team?.shortCode || 'EQ'}
                              primaryColor={team?.primaryColor}
                              secondaryColor={team?.secondaryColor}
                              crestUrl={team?.crestUrl}
                              size="sm"
                            />
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                              {team?.name || ts.teamId}
                            </span>
                          </div>
                          <div className="flex items-center gap-2.5 shrink-0 font-mono tabular-nums text-xs">
                            <span className="text-slate-600 dark:text-slate-300">{ts.played}</span>
                            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                              {ts.effectivenessRate}%
                            </span>
                            <span className="text-sm font-bold text-navy-900 dark:text-white w-7 text-right">
                              {ts.points}
                            </span>
                            <ChevronDown
                              className={`w-4 h-4 text-slate-400 transition-transform duration-150 ${
                                isOpen ? 'rotate-180 text-electric-500' : ''
                              }`}
                            />
                          </div>
                        </button>
                        {isOpen && (
                          <div className="px-4 pb-3 pt-2 bg-slate-50/80 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 grid grid-cols-4 gap-2 text-center font-mono tabular-nums">
                            <div className="py-1.5 px-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                              <span className="block text-[10px] font-sans text-slate-500 dark:text-slate-400">
                                % Vic.
                              </span>
                              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                {ts.winRate}%
                              </span>
                            </div>
                            <div className="py-1.5 px-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                              <span className="block text-[10px] font-sans text-slate-500 dark:text-slate-400">
                                Prom. GF
                              </span>
                              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                {ts.avgGoalsFor}
                              </span>
                            </div>
                            <div className="py-1.5 px-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                              <span className="block text-[10px] font-sans text-slate-500 dark:text-slate-400">
                                Prom. GC
                              </span>
                              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                {ts.avgGoalsAgainst}
                              </span>
                            </div>
                            <div className="py-1.5 px-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                              <span className="block text-[10px] font-sans text-slate-500 dark:text-slate-400">
                                V. Invictas
                              </span>
                              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                {ts.cleanSheets}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                        <th className="py-3 px-4 text-left font-semibold">Equipo</th>
                        <th className="py-3 px-2.5 text-right font-semibold">PJ</th>
                        <th className="py-3 px-2.5 text-right font-semibold">PTS</th>
                        <th className="py-3 px-2.5 text-right font-semibold">% Vic.</th>
                        <th className="py-3 px-2.5 text-right font-semibold">% Efect.</th>
                        <th className="py-3 px-2.5 text-right font-semibold">Prom. GF</th>
                        <th className="py-3 px-2.5 text-right font-semibold">Prom. GC</th>
                        <th className="py-3 px-4 text-right font-semibold">Vallas Inv.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {catTeamStats.map((ts) => {
                        const team = teamMap.get(ts.teamId);
                        return (
                          <tr key={ts.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                              <div className="flex items-center gap-2.5">
                                <TeamCrest
                                  name={team?.name || ts.teamId}
                                  shortCode={team?.shortCode || 'EQ'}
                                  primaryColor={team?.primaryColor}
                                  secondaryColor={team?.secondaryColor}
                                  crestUrl={team?.crestUrl}
                                  size="sm"
                                />
                                <span>{team?.name || ts.teamId}</span>
                              </div>
                            </td>
                            <td className="py-3 px-2.5 text-right font-mono tabular-nums">{ts.played}</td>
                            <td className="py-3 px-2.5 text-right font-mono font-bold tabular-nums">
                              {ts.points}
                            </td>
                            <td className="py-3 px-2.5 text-right font-mono tabular-nums">
                              {ts.winRate}%
                            </td>
                            <td className="py-3 px-2.5 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                              {ts.effectivenessRate}%
                            </td>
                            <td className="py-3 px-2.5 text-right font-mono tabular-nums">
                              {ts.avgGoalsFor}
                            </td>
                            <td className="py-3 px-2.5 text-right font-mono tabular-nums">
                              {ts.avgGoalsAgainst}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              {ts.cleanSheets}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {chartData.length > 0 && (
            <CollapsibleSection
              title="Comparativa de Goles a Favor vs Goles en Contra"
              summary={`${chartData.length} equipos analizados`}
              icon={<BarChart3 className="w-4 h-4 text-electric-500" />}
              open={chartOpen}
              onToggle={() => setChartOpen((v) => !v)}
              bodyClassName="p-4 sm:p-5"
            >
              <div className="h-60 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis dataKey="equipo" tick={{ fontSize: 12, fill: axisColor }} />
                    <YAxis tick={{ fontSize: 12, fill: axisColor }} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="gf" name="Goles a favor" fill="#16A34A" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="gc" name="Goles en contra" fill="#DC2626" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CollapsibleSection>
          )}
        </div>
      )}

      {view === 'players' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="font-display font-semibold text-sm sm:text-base text-slate-900 dark:text-slate-100">
              Estadísticas Individuales de Jugadores
            </h2>
          </div>

          {catPlayerStats.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Sin estadísticas individuales registradas para esta categoría.
            </div>
          ) : (
            <>
              {/* Mobile Collapsible Player Stats */}
              <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                  <span>Jugador / Equipo</span>
                  <span>PJ · G · A</span>
                </div>
                {catPlayerStats.map((ps) => {
                  const pl = playerMap.get(ps.playerId);
                  const team = teamMap.get(ps.teamId);
                  const isOpen = Boolean(expandedPlayerStatIds[ps.id]);
                  return (
                    <div key={ps.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedPlayerStatIds((prev) => ({ ...prev, [ps.id]: !prev[ps.id] }))
                        }
                        aria-expanded={isOpen}
                        className="w-full min-h-[54px] px-4 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <TeamCrest
                            name={team?.name || ps.teamId}
                            shortCode={team?.shortCode || 'EQ'}
                            primaryColor={team?.primaryColor}
                            secondaryColor={team?.secondaryColor}
                            crestUrl={team?.crestUrl}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                              {pl?.fullName || ps.playerId}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {team?.name || ps.teamId}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0 font-mono tabular-nums text-xs">
                          <span className="text-slate-600 dark:text-slate-300">{ps.matchesPlayed}</span>
                          <span className="font-bold text-emerald-700 dark:text-emerald-400">
                            {ps.goals}G
                          </span>
                          <span className="text-slate-700 dark:text-slate-200">{ps.assists}A</span>
                          <ChevronDown
                            className={`w-4 h-4 text-slate-400 transition-transform duration-150 ${
                              isOpen ? 'rotate-180 text-electric-500' : ''
                            }`}
                          />
                        </div>
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-3 pt-2 bg-slate-50/80 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 grid grid-cols-5 gap-1.5 text-center font-mono tabular-nums">
                          <div className="py-1.5 px-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                            <span className="block text-[10px] font-sans text-slate-500 dark:text-slate-400">
                              TA
                            </span>
                            <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                              {ps.yellowCards}
                            </span>
                          </div>
                          <div className="py-1.5 px-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                            <span className="block text-[10px] font-sans text-slate-500 dark:text-slate-400">
                              TR
                            </span>
                            <span className="text-xs font-bold text-red-600 dark:text-red-400">
                              {ps.redCards}
                            </span>
                          </div>
                          <div className="py-1.5 px-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                            <span className="block text-[10px] font-sans text-slate-500 dark:text-slate-400">
                              Tit.
                            </span>
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {ps.starts}
                            </span>
                          </div>
                          <div className="py-1.5 px-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                            <span className="block text-[10px] font-sans text-slate-500 dark:text-slate-400">
                              Sup.
                            </span>
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {ps.subs}
                            </span>
                          </div>
                          <div className="py-1.5 px-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                            <span className="block text-[10px] font-sans text-slate-500 dark:text-slate-400">
                              Min.
                            </span>
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {ps.minutesPlayed}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                      <th className="py-3 px-4 text-left font-semibold">Jugador</th>
                      <th className="py-3 px-4 text-left font-semibold">Equipo</th>
                      <th className="py-3 px-2.5 text-right font-semibold">PJ</th>
                      <th className="py-3 px-2.5 text-right font-semibold">Goles</th>
                      <th className="py-3 px-2.5 text-right font-semibold">Asist.</th>
                      <th className="py-3 px-2.5 text-right font-semibold">TA</th>
                      <th className="py-3 px-2.5 text-right font-semibold">TR</th>
                      <th className="py-3 px-2.5 text-right font-semibold">Tit.</th>
                      <th className="py-3 px-2.5 text-right font-semibold">Sup.</th>
                      <th className="py-3 px-4 text-right font-semibold">Min.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {catPlayerStats.map((ps) => {
                      const pl = playerMap.get(ps.playerId);
                      const team = teamMap.get(ps.teamId);
                      return (
                        <tr key={ps.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                            {pl?.fullName || ps.playerId}
                          </td>
                          <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                            <div className="flex items-center gap-2">
                              <TeamCrest
                                name={team?.name || ps.teamId}
                                shortCode={team?.shortCode || 'EQ'}
                                primaryColor={team?.primaryColor}
                                secondaryColor={team?.secondaryColor}
                                crestUrl={team?.crestUrl}
                                size="sm"
                              />
                              <span>{team?.name || ps.teamId}</span>
                            </div>
                          </td>
                          <td className="py-3 px-2.5 text-right font-mono tabular-nums">
                            {ps.matchesPlayed}
                          </td>
                          <td className="py-3 px-2.5 text-right font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                            {ps.goals}
                          </td>
                          <td className="py-3 px-2.5 text-right font-mono tabular-nums">{ps.assists}</td>
                          <td className="py-3 px-2.5 text-right font-mono tabular-nums text-amber-600 dark:text-amber-400">
                            {ps.yellowCards}
                          </td>
                          <td className="py-3 px-2.5 text-right font-mono tabular-nums text-red-600 dark:text-red-400">
                            {ps.redCards}
                          </td>
                          <td className="py-3 px-2.5 text-right font-mono tabular-nums">{ps.starts}</td>
                          <td className="py-3 px-2.5 text-right font-mono tabular-nums">{ps.subs}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            {ps.minutesPlayed}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {view === 'rankings' && (() => {
        const sortedTeamRankings = [...catTeamStats].sort((a, b) => {
          if (rankingMetric === 'team_attack') return b.goalsFor - a.goalsFor;
          if (rankingMetric === 'team_defense') return a.goalsAgainst - b.goalsAgainst;
          if (rankingMetric === 'team_wins') return b.wins - a.wins;
          return b.goalDifference - a.goalDifference;
        });

        const sortedPlayerRankings = [...catPlayerStats]
          .filter((ps) => {
            if (rankingMetric === 'goalkeepers') {
              return playerMap.get(ps.playerId)?.position === 'Portero';
            }
            return true;
          })
          .sort((a, b) => {
            if (rankingMetric === 'assists') return b.assists - a.assists;
            if (rankingMetric === 'appearances')
              return b.matchesPlayed - a.matchesPlayed || b.minutesPlayed - a.minutesPlayed;
            if (rankingMetric === 'goalkeepers')
              return (
                b.cleanSheetsGoalkeeper - a.cleanSheetsGoalkeeper ||
                a.goalsConcededGoalkeeper - b.goalsConcededGoalkeeper
              );
            return b.goals - a.goals;
          });

        return (
          <div className="space-y-4">
            {/* Mobile collapsible ranking metric picker + desktop inline chips */}
            <div className="md:hidden">
              <CollapsibleSection
                title="Criterio de Ranking"
                summary={activeRankingLabel}
                icon={<Award className="w-4 h-4 text-electric-500" />}
                open={mobileRankingsMenuOpen}
                onToggle={() => setMobileRankingsMenuOpen((v) => !v)}
                bodyClassName="p-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {rankingOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setRankingMetric(opt.id);
                        setMobileRankingsMenuOpen(false);
                      }}
                      className={`px-3 py-2.5 min-h-[42px] rounded-lg text-xs font-medium text-left ${
                        rankingMetric === opt.id
                          ? 'bg-electric-500 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </CollapsibleSection>
            </div>

            <div className="hidden md:flex bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex-wrap items-center gap-2">
              {rankingOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setRankingMetric(opt.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                    rankingMetric === opt.id
                      ? 'bg-electric-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              {rankingMetric.startsWith('team_') ? (
                <>
                  {/* Mobile Team Rankings Collapsible */}
                  <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                    <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                      <span>Pos · Equipo</span>
                      <span>GF · GC · DG</span>
                    </div>
                    {sortedTeamRankings.map((ts, idx) => {
                      const team = teamMap.get(ts.teamId);
                      const isOpen = Boolean(expandedRankingIds[ts.id]);
                      return (
                        <div key={ts.id}>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedRankingIds((prev) => ({ ...prev, [ts.id]: !prev[ts.id] }))
                            }
                            aria-expanded={isOpen}
                            className="w-full min-h-[54px] px-4 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <span className="w-5 text-center font-mono font-bold tabular-nums text-sm text-navy-900 dark:text-white shrink-0">
                                {idx + 1}
                              </span>
                              <TeamCrest
                                name={team?.name || ts.teamId}
                                shortCode={team?.shortCode || 'EQ'}
                                primaryColor={team?.primaryColor}
                                secondaryColor={team?.secondaryColor}
                                crestUrl={team?.crestUrl}
                                size="sm"
                              />
                              <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                {team?.name || ts.teamId}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 font-mono tabular-nums text-xs">
                              <span className="text-emerald-700 dark:text-emerald-400">{ts.goalsFor}</span>
                              <span className="text-slate-500 dark:text-slate-400">{ts.goalsAgainst}</span>
                              <span className="font-bold text-navy-900 dark:text-white w-7 text-right">
                                {ts.goalDifference > 0 ? `+${ts.goalDifference}` : ts.goalDifference}
                              </span>
                              <ChevronDown
                                className={`w-4 h-4 text-slate-400 transition-transform duration-150 ${
                                  isOpen ? 'rotate-180 text-electric-500' : ''
                                }`}
                              />
                            </div>
                          </button>
                          {isOpen && (
                            <div className="px-4 pb-3 pt-2 bg-slate-50/80 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-2 text-center font-mono tabular-nums">
                              <div className="py-1.5 px-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                                <span className="block text-[10px] font-sans text-slate-500 dark:text-slate-400">
                                  Jugados
                                </span>
                                <span className="text-xs font-bold">{ts.played}</span>
                              </div>
                              <div className="py-1.5 px-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                                <span className="block text-[10px] font-sans text-slate-500 dark:text-slate-400">
                                  Victorias
                                </span>
                                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                                  {ts.wins}
                                </span>
                              </div>
                              <div className="py-1.5 px-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                                <span className="block text-[10px] font-sans text-slate-500 dark:text-slate-400">
                                  Puntos
                                </span>
                                <span className="text-xs font-bold">{ts.points}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop Team Rankings Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                          <th className="py-3 px-4 text-left font-semibold">Pos</th>
                          <th className="py-3 px-4 text-left font-semibold">Equipo</th>
                          <th className="py-3 px-3 text-right font-semibold">PJ</th>
                          <th className="py-3 px-3 text-right font-semibold">PG</th>
                          <th className="py-3 px-3 text-right font-semibold">GF</th>
                          <th className="py-3 px-3 text-right font-semibold">GC</th>
                          <th className="py-3 px-4 text-right font-semibold">DG</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {sortedTeamRankings.map((ts, idx) => {
                          const team = teamMap.get(ts.teamId);
                          return (
                            <tr key={ts.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                              <td className="py-3 px-4 font-mono font-bold tabular-nums">{idx + 1}</td>
                              <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                                <div className="flex items-center gap-2.5">
                                  <TeamCrest
                                    name={team?.name || ts.teamId}
                                    shortCode={team?.shortCode || 'EQ'}
                                    primaryColor={team?.primaryColor}
                                    secondaryColor={team?.secondaryColor}
                                    crestUrl={team?.crestUrl}
                                    size="sm"
                                  />
                                  <span>{team?.name || ts.teamId}</span>
                                </div>
                              </td>
                              <td className="py-3 px-3 text-right font-mono tabular-nums">{ts.played}</td>
                              <td className="py-3 px-3 text-right font-mono tabular-nums">{ts.wins}</td>
                              <td className="py-3 px-3 text-right font-mono tabular-nums">{ts.goalsFor}</td>
                              <td className="py-3 px-3 text-right font-mono tabular-nums">
                                {ts.goalsAgainst}
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                                {ts.goalDifference > 0 ? `+${ts.goalDifference}` : ts.goalDifference}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <>
                  {/* Mobile Player Rankings Collapsible */}
                  <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                    <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                      <span>Pos · Jugador</span>
                      <span>
                        {rankingMetric === 'assists'
                          ? 'Asist.'
                          : rankingMetric === 'appearances'
                            ? 'Min.'
                            : rankingMetric === 'goalkeepers'
                              ? 'V. Inv.'
                              : 'Goles'}
                      </span>
                    </div>
                    {sortedPlayerRankings.map((ps, idx) => {
                      const pl = playerMap.get(ps.playerId);
                      const team = teamMap.get(ps.teamId);
                      const isOpen = Boolean(expandedRankingIds[ps.id]);
                      const primaryVal =
                        rankingMetric === 'assists'
                          ? ps.assists
                          : rankingMetric === 'appearances'
                            ? ps.minutesPlayed
                            : rankingMetric === 'goalkeepers'
                              ? ps.cleanSheetsGoalkeeper
                              : ps.goals;
                      const secondaryVal =
                        rankingMetric === 'goalkeepers'
                          ? ps.goalsConcededGoalkeeper
                          : ps.matchesPlayed > 0
                            ? (primaryVal / ps.matchesPlayed).toFixed(2)
                            : '0.00';

                      return (
                        <div key={ps.id}>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedRankingIds((prev) => ({ ...prev, [ps.id]: !prev[ps.id] }))
                            }
                            aria-expanded={isOpen}
                            className="w-full min-h-[54px] px-4 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <span className="w-5 text-center font-mono font-bold tabular-nums text-sm text-navy-900 dark:text-white shrink-0">
                                {idx + 1}
                              </span>
                              <TeamCrest
                                name={team?.name || ps.teamId}
                                shortCode={team?.shortCode || 'EQ'}
                                primaryColor={team?.primaryColor}
                                secondaryColor={team?.secondaryColor}
                                crestUrl={team?.crestUrl}
                                size="sm"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                  {pl?.fullName || ps.playerId}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                  {team?.name || ps.teamId}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 font-mono tabular-nums">
                              <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                                {primaryVal}
                              </span>
                              <ChevronDown
                                className={`w-4 h-4 text-slate-400 transition-transform duration-150 ${
                                  isOpen ? 'rotate-180 text-electric-500' : ''
                                }`}
                              />
                            </div>
                          </button>
                          {isOpen && (
                            <div className="px-4 pb-3 pt-2 bg-slate-50/80 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-2 text-center font-mono tabular-nums">
                              <div className="py-1.5 px-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                                <span className="block text-[10px] font-sans text-slate-500 dark:text-slate-400">
                                  Categoría
                                </span>
                                <span className="text-xs font-sans font-semibold truncate block">
                                  {catMap.get(ps.categoryId)?.name || '—'}
                                </span>
                              </div>
                              <div className="py-1.5 px-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                                <span className="block text-[10px] font-sans text-slate-500 dark:text-slate-400">
                                  PJ
                                </span>
                                <span className="text-xs font-bold">{ps.matchesPlayed}</span>
                              </div>
                              <div className="py-1.5 px-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                                <span className="block text-[10px] font-sans text-slate-500 dark:text-slate-400">
                                  {rankingMetric === 'goalkeepers' ? 'Goles Rec.' : 'Prom/PJ'}
                                </span>
                                <span className="text-xs font-bold">{secondaryVal}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop Player Rankings Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                          <th className="py-3 px-4 text-left font-semibold">Pos</th>
                          <th className="py-3 px-4 text-left font-semibold">Jugador</th>
                          <th className="py-3 px-4 text-left font-semibold">Equipo</th>
                          <th className="py-3 px-4 text-left font-semibold">Categoría</th>
                          <th className="py-3 px-3 text-right font-semibold">PJ</th>
                          <th className="py-3 px-3 text-right font-semibold">
                            {rankingMetric === 'assists'
                              ? 'Asist.'
                              : rankingMetric === 'appearances'
                                ? 'Minutos'
                                : rankingMetric === 'goalkeepers'
                                  ? 'Vallas Inv.'
                                  : 'Goles'}
                          </th>
                          <th className="py-3 px-4 text-right font-semibold">
                            {rankingMetric === 'goalkeepers' ? 'Goles Rec.' : 'Prom/PJ'}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {sortedPlayerRankings.map((ps, idx) => {
                          const pl = playerMap.get(ps.playerId);
                          const team = teamMap.get(ps.teamId);
                          const primaryVal =
                            rankingMetric === 'assists'
                              ? ps.assists
                              : rankingMetric === 'appearances'
                                ? ps.minutesPlayed
                                : rankingMetric === 'goalkeepers'
                                  ? ps.cleanSheetsGoalkeeper
                                  : ps.goals;
                          const secondaryVal =
                            rankingMetric === 'goalkeepers'
                              ? ps.goalsConcededGoalkeeper
                              : ps.matchesPlayed > 0
                                ? (primaryVal / ps.matchesPlayed).toFixed(2)
                                : '0.00';

                          return (
                            <tr key={ps.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                              <td className="py-3 px-4 font-mono font-bold tabular-nums">{idx + 1}</td>
                              <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                                {pl?.fullName || ps.playerId}
                              </td>
                              <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                                <div className="flex items-center gap-2">
                                  <TeamCrest
                                    name={team?.name || ps.teamId}
                                    shortCode={team?.shortCode || 'EQ'}
                                    primaryColor={team?.primaryColor}
                                    secondaryColor={team?.secondaryColor}
                                    crestUrl={team?.crestUrl}
                                    size="sm"
                                  />
                                  <span>{team?.name || ps.teamId}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-slate-500 dark:text-slate-400 text-xs">
                                {catMap.get(ps.categoryId)?.name}
                              </td>
                              <td className="py-3 px-3 text-right font-mono tabular-nums">
                                {ps.matchesPlayed}
                              </td>
                              <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                                {primaryVal}
                              </td>
                              <td className="py-3 px-4 text-right font-mono tabular-nums">
                                {secondaryVal}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

