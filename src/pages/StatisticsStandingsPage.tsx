import { useMemo, useState } from 'react';
import { Award, BarChart3, Shield, Trophy, Users } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TeamCrest } from '../components/TeamCrest';
import { useSigdData } from '../context/SigdDataContext';

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
  const {
    tournaments,
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

  const activeTournament =
    tournaments.find((t) => t.id === selectedTournamentId) || tournaments[0];
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

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-display font-bold text-navy-900">
            Motor Estadístico y Tablas de Posiciones
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Indicadores colectivos e individuales calculados automáticamente desde actas oficiales aprobadas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={activeTournament?.id || ''}
            onChange={(e) => {
              setSelectedTournamentId(e.target.value);
              setSelectedCategoryId('');
            }}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50"
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
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50"
          >
            {tournamentCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-white border border-slate-200 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => setView('standings')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
            view === 'standings' ? 'bg-navy-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Trophy className="w-4 h-4" />
          Tabla de Posiciones
        </button>
        <button
          type="button"
          onClick={() => setView('teams')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
            view === 'teams' ? 'bg-navy-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Shield className="w-4 h-4" />
          Estadísticas por Equipo
        </button>
        <button
          type="button"
          onClick={() => setView('players')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
            view === 'players' ? 'bg-navy-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          Estadísticas Individuales
        </button>
        <button
          type="button"
          onClick={() => setView('rankings')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
            view === 'rankings' ? 'bg-navy-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Award className="w-4 h-4" />
          Goleadores y Rankings
        </button>
      </div>

      {view === 'standings' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-display font-semibold text-base text-slate-900">
              Posiciones Oficiales — {activeCategory?.name || 'Categoría'}
            </h2>
            <span className="text-xs text-slate-500">
              Sistema: {activeTournament?.winPoints ?? 3}V / {activeTournament?.drawPoints ?? 1}E /{' '}
              {activeTournament?.lossPoints ?? 0}D
            </span>
          </div>
          {catStandings.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No hay posiciones oficiales calculadas aún. Aprueba al menos un acta para calcular la tabla.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                    <th className="py-3 px-4 text-left font-semibold">POS</th>
                    <th className="py-3 px-4 text-left font-semibold">EQUIPO</th>
                    <th className="py-3 px-3 text-right font-semibold">PJ</th>
                    <th className="py-3 px-3 text-right font-semibold">PG</th>
                    <th className="py-3 px-3 text-right font-semibold">PE</th>
                    <th className="py-3 px-3 text-right font-semibold">PP</th>
                    <th className="py-3 px-3 text-right font-semibold">GF</th>
                    <th className="py-3 px-3 text-right font-semibold">GC</th>
                    <th className="py-3 px-3 text-right font-semibold">DG</th>
                    <th className="py-3 px-4 text-right font-semibold">PTS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {catStandings.map((st) => {
                    const tm = teamMap.get(st.teamId);
                    return (
                      <tr key={st.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono font-bold tabular-nums text-navy-900">
                          {st.position}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900">
                          <div className="flex items-center gap-2.5">
                            <TeamCrest
                              name={tm?.name || st.teamId}
                              shortCode={tm?.shortCode || 'EQ'}
                              primaryColor={tm?.primaryColor}
                              secondaryColor={tm?.secondaryColor}
                              size="sm"
                            />
                            <span>{tm?.name || st.teamId}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">{st.played}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-700">
                          {st.wins}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">{st.draws}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-red-600">
                          {st.losses}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">{st.goalsFor}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">{st.goalsAgainst}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">
                          {st.goalDifference > 0 ? `+${st.goalDifference}` : st.goalDifference}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-navy-900">
                          {st.points}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === 'teams' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="font-display font-semibold text-base text-slate-900">
                Indicadores Avanzados por Equipo
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
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
                <tbody className="divide-y divide-slate-100">
                  {catTeamStats.map((ts) => (
                    <tr key={ts.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {teamMap.get(ts.teamId)?.name || ts.teamId}
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono tabular-nums">{ts.played}</td>
                      <td className="py-3 px-2.5 text-right font-mono font-bold tabular-nums">
                        {ts.points}
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono tabular-nums">
                        {ts.winRate}%
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono tabular-nums text-emerald-700">
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {chartData.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-electric-500" />
                <h3 className="font-display font-semibold text-base text-slate-900">
                  Comparativa de Goles a Favor vs Goles en Contra
                </h3>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="equipo" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="gf" name="Goles a favor" fill="#16A34A" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="gc" name="Goles en contra" fill="#DC2626" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {view === 'players' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="font-display font-semibold text-base text-slate-900">
              Estadísticas Individuales de Jugadores
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
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
              <tbody className="divide-y divide-slate-100">
                {catPlayerStats.map((ps) => {
                  const pl = playerMap.get(ps.playerId);
                  return (
                    <tr key={ps.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {pl?.fullName || ps.playerId}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {teamMap.get(ps.teamId)?.name || ps.teamId}
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono tabular-nums">
                        {ps.matchesPlayed}
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono font-bold tabular-nums text-emerald-700">
                        {ps.goals}
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono tabular-nums">{ps.assists}</td>
                      <td className="py-3 px-2.5 text-right font-mono tabular-nums text-amber-600">
                        {ps.yellowCards}
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono tabular-nums text-red-600">
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
        </div>
      )}

      {view === 'rankings' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-2">
            {(
              [
                { id: 'scorers', label: 'Tabla de Goleadores' },
                { id: 'assists', label: 'Máximos Asistentes' },
                { id: 'appearances', label: 'Más Partidos' },
                { id: 'goalkeepers', label: 'Porteros Destacados' },
                { id: 'team_attack', label: 'Equipos Más Goleadores' },
                { id: 'team_defense', label: 'Menos Goles Recibidos' },
                { id: 'team_wins', label: 'Más Victorias' },
                { id: 'team_gd', label: 'Mejor Diferencia de Goles' },
              ] as { id: RankingMetric; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRankingMetric(opt.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                  rankingMetric === opt.id
                    ? 'bg-electric-500 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {rankingMetric.startsWith('team_') ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                    <th className="py-3 px-4 text-left font-semibold">Pos</th>
                    <th className="py-3 px-4 text-left font-semibold">Equipo</th>
                    <th className="py-3 px-3 text-right font-semibold">PJ</th>
                    <th className="py-3 px-3 text-right font-semibold">PG</th>
                    <th className="py-3 px-3 text-right font-semibold">GF</th>
                    <th className="py-3 px-3 text-right font-semibold">GC</th>
                    <th className="py-3 px-4 text-right font-semibold">DG</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...catTeamStats]
                    .sort((a, b) => {
                      if (rankingMetric === 'team_attack') return b.goalsFor - a.goalsFor;
                      if (rankingMetric === 'team_defense') return a.goalsAgainst - b.goalsAgainst;
                      if (rankingMetric === 'team_wins') return b.wins - a.wins;
                      return b.goalDifference - a.goalDifference;
                    })
                    .map((ts, idx) => (
                      <tr key={ts.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono font-bold tabular-nums">{idx + 1}</td>
                        <td className="py-3 px-4 font-medium">
                          {teamMap.get(ts.teamId)?.name || ts.teamId}
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
                    ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
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
                <tbody className="divide-y divide-slate-100">
                  {[...catPlayerStats]
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
                    })
                    .map((ps, idx) => {
                      const pl = playerMap.get(ps.playerId);
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
                        <tr key={ps.id} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-mono font-bold tabular-nums">{idx + 1}</td>
                          <td className="py-3 px-4 font-medium text-slate-900">
                            {pl?.fullName || ps.playerId}
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {teamMap.get(ps.teamId)?.name || ps.teamId}
                          </td>
                          <td className="py-3 px-4 text-slate-500 text-xs">
                            {catMap.get(ps.categoryId)?.name}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums">
                            {ps.matchesPlayed}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-emerald-700">
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
            )}
          </div>
        </div>
      )}
    </div>
  );
}
