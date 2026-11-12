import { useMemo, useState } from 'react';
import {
  Award,
  BarChart3,
  CalendarDays,
  Crown,
  Filter,
  MapPin,
  Search,
  Shield,
  Target,
  Trophy,
  Users,
} from 'lucide-react';
import { TeamCrest } from '../components/TeamCrest';
import { useSigdData } from '../context/SigdDataContext';

type PublicTab = 'resumen' | 'calendario' | 'resultados' | 'posiciones' | 'goleadores' | 'equipos' | 'campeones';

export function PublicPortalPage() {
  const {
    sports,
    seasons,
    tournaments,
    categories,
    teams,
    players,
    matches,
    matchResults,
    standings,
    playerStatistics,
    teamStatistics,
    fields,
  } = useSigdData();

  const [activeTab, setActiveTab] = useState<PublicTab>('resumen');
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('all');
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const tournamentMap = useMemo(() => new Map(tournaments.map((t) => [t.id, t])), [tournaments]);
  const seasonMap = useMemo(() => new Map(seasons.map((s) => [s.id, s])), [seasons]);
  const fieldMap = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);
  const sportMap = useMemo(() => new Map(sports.map((s) => [s.id, s])), [sports]);

  const filteredTournaments = useMemo(() => {
    return tournaments.filter((t) =>
      selectedSeasonId === 'all' ? true : t.seasonId === selectedSeasonId
    );
  }, [tournaments, selectedSeasonId]);

  const filteredCategories = useMemo(() => {
    return categories.filter((c) => {
      if (selectedTournamentId !== 'all' && c.tournamentId !== selectedTournamentId) return false;
      if (selectedSeasonId !== 'all') {
        const t = tournamentMap.get(c.tournamentId);
        if (t && t.seasonId !== selectedSeasonId) return false;
      }
      return true;
    });
  }, [categories, selectedTournamentId, selectedSeasonId, tournamentMap]);

  const approvedResultByMatch = useMemo(() => {
    const map = new Map<string, (typeof matchResults)[number]>();
    matchResults
      .filter((r) => r.validationStatus === 'aprobado')
      .forEach((r) => map.set(r.matchId, r));
    return map;
  }, [matchResults]);

  const filteredMatches = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return matches
      .filter((m) => {
        if (!m.published && m.status !== 'Finalizado') return false;
        if (selectedTournamentId !== 'all' && m.tournamentId !== selectedTournamentId) return false;
        if (selectedCategoryId !== 'all' && m.categoryId !== selectedCategoryId) return false;
        if (selectedSeasonId !== 'all') {
          const t = tournamentMap.get(m.tournamentId);
          if (t && t.seasonId !== selectedSeasonId) return false;
        }
        if (q) {
          const h = teamMap.get(m.homeTeamId)?.name.toLowerCase() || '';
          const a = teamMap.get(m.awayTeamId)?.name.toLowerCase() || '';
          const cat = categoryMap.get(m.categoryId)?.name.toLowerCase() || '';
          if (!h.includes(q) && !a.includes(q) && !cat.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  }, [
    matches,
    selectedTournamentId,
    selectedCategoryId,
    selectedSeasonId,
    searchTerm,
    tournamentMap,
    teamMap,
    categoryMap,
  ]);

  const upcomingMatches = useMemo(
    () =>
      filteredMatches.filter(
        (m) => m.status === 'Programado' || m.status === 'Reprogramado' || m.status === 'En juego'
      ),
    [filteredMatches]
  );

  const officialResults = useMemo(
    () =>
      filteredMatches
        .filter((m) => m.status === 'Finalizado' && approvedResultByMatch.has(m.id))
        .reverse(),
    [filteredMatches, approvedResultByMatch]
  );

  const filteredStandings = useMemo(() => {
    return standings
      .filter((s) => {
        if (selectedTournamentId !== 'all' && s.tournamentId !== selectedTournamentId) return false;
        if (selectedCategoryId !== 'all' && s.categoryId !== selectedCategoryId) return false;
        return true;
      })
      .sort((a, b) => a.position - b.position);
  }, [standings, selectedTournamentId, selectedCategoryId]);

  const topScorers = useMemo(() => {
    return playerStatistics
      .filter((ps) => {
        if (ps.goals <= 0) return false;
        if (selectedTournamentId !== 'all' && ps.tournamentId !== selectedTournamentId) return false;
        if (selectedCategoryId !== 'all' && ps.categoryId !== selectedCategoryId) return false;
        return true;
      })
      .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
      .slice(0, 25);
  }, [playerStatistics, selectedTournamentId, selectedCategoryId]);

  const filteredTeams = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return teams.filter((t) => {
      if (selectedTournamentId !== 'all' && t.tournamentId !== selectedTournamentId) return false;
      if (selectedCategoryId !== 'all' && t.categoryId !== selectedCategoryId) return false;
      if (q && !t.name.toLowerCase().includes(q) && !t.shortCode.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [teams, selectedTournamentId, selectedCategoryId, searchTerm]);

  const historicalChampions = useMemo(() => {
    return tournaments.filter((t) => t.status === 'finalizado' || Boolean(t.championTeamId));
  }, [tournaments]);

  const tabs: { id: PublicTab; label: string; icon: typeof Trophy }[] = [
    { id: 'resumen', label: 'Resumen', icon: Trophy },
    { id: 'calendario', label: 'Próximos Partidos', icon: CalendarDays },
    { id: 'resultados', label: 'Resultados', icon: Target },
    { id: 'posiciones', label: 'Posiciones', icon: BarChart3 },
    { id: 'goleadores', label: 'Goleadores', icon: Award },
    { id: 'equipos', label: 'Equipos', icon: Shield },
    { id: 'campeones', label: 'Campeones', icon: Crown },
  ];

  return (
    <div className="space-y-6">
      {/* Hero Banner with Generated Stadium Photograph */}
      <section className="relative rounded-2xl overflow-hidden border border-slate-200 bg-navy-900 text-white">
        <img
          src="/src/assets/images/sigd_stadium_hero_1794523620472.jpg"
          alt="Estadio iluminado SIGD"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-navy-950/95 via-navy-900/80 to-navy-900/40" />
        <div className="relative z-10 p-6 sm:p-8 lg:p-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="max-w-2xl space-y-2.5">
            <p className="text-xs font-medium tracking-wide text-emerald-400">
              Portal Oficial de Consulta Pública · Acceso Libre
            </p>
            <h1 className="text-2xl sm:text-4xl font-display font-bold tracking-tight text-balance text-white">
              Torneos, Calendarios, Resultados y Estadísticas Oficiales
            </h1>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Consulta en tiempo real tablas de posiciones validadas, tabla de goleo, próximos
              encuentros, sedes e historial de campeones sin necesidad de iniciar sesión.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 sm:gap-6 shrink-0 bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl p-4">
            <div>
              <span className="text-xs text-slate-300 block">Torneos</span>
              <span className="text-2xl font-display font-bold tabular-nums">{tournaments.length}</span>
            </div>
            <div>
              <span className="text-xs text-slate-300 block">Equipos</span>
              <span className="text-2xl font-display font-bold tabular-nums">{teams.length}</span>
            </div>
            <div>
              <span className="text-xs text-slate-300 block">Partidos</span>
              <span className="text-2xl font-display font-bold tabular-nums">{filteredMatches.length}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Filter Toolbar */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700 shrink-0">
          <Filter className="w-4 h-4 text-electric-500" />
          <span>Filtros de consulta:</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-1">
          <select
            value={selectedSeasonId}
            onChange={(e) => {
              setSelectedSeasonId(e.target.value);
              setSelectedTournamentId('all');
              setSelectedCategoryId('all');
            }}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-electric-500"
          >
            <option value="all">Todas las temporadas</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.year})
              </option>
            ))}
          </select>

          <select
            value={selectedTournamentId}
            onChange={(e) => {
              setSelectedTournamentId(e.target.value);
              setSelectedCategoryId('all');
            }}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-electric-500"
          >
            <option value="all">Todos los torneos</option>
            {filteredTournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <select
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-electric-500"
          >
            <option value="all">Todas las categorías</option>
            {filteredCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.branchName ? `(${c.branchName})` : ''}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar equipo o categoría..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-electric-500"
            />
          </div>
        </div>
      </section>

      {/* Segmented Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto p-1.5 bg-white border border-slate-200 rounded-xl">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${
                isActive
                  ? 'bg-navy-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'resumen' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Upcoming Matches */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-electric-500" />
                <h2 className="font-display font-semibold text-base text-slate-900">
                  Próximos Encuentros
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('calendario')}
                className="text-xs font-medium text-electric-600 hover:underline"
              >
                Ver calendario completo
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {upcomingMatches.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No hay próximos partidos publicados para los filtros seleccionados.
                </div>
              ) : (
                upcomingMatches.slice(0, 6).map((m) => {
                  const home = teamMap.get(m.homeTeamId);
                  const away = teamMap.get(m.awayTeamId);
                  const cat = categoryMap.get(m.categoryId);
                  const field = m.fieldId ? fieldMap.get(m.fieldId) : undefined;
                  return (
                    <div key={m.id} className="p-4 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                        <span>
                          {cat?.name || 'Categoría'} · Jornada {m.roundNumber}
                        </span>
                        <span className="font-mono tabular-nums">
                          {m.date} · {m.time}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <TeamCrest
                            name={home?.name || m.homeTeamId}
                            shortCode={home?.shortCode || 'LOC'}
                            primaryColor={home?.primaryColor}
                            secondaryColor={home?.secondaryColor}
                            crestUrl={home?.crestUrl}
                            size="sm"
                          />
                          <span className="font-medium text-sm text-slate-900 truncate">
                            {home?.name || m.homeTeamId}
                          </span>
                        </div>
                        <span className="text-xs font-mono font-semibold text-slate-400 px-2">
                          vs
                        </span>
                        <div className="flex items-center justify-end gap-2.5 min-w-0 flex-1">
                          <span className="font-medium text-sm text-slate-900 truncate text-right">
                            {away?.name || m.awayTeamId}
                          </span>
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
                      {field && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                          <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{field.name}</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Standings Preview */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-emerald-600" />
                <h2 className="font-display font-semibold text-base text-slate-900">
                  Tabla de Posiciones
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('posiciones')}
                className="text-xs font-medium text-electric-600 hover:underline"
              >
                Tabla completa
              </button>
            </div>
            {filteredStandings.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                Las posiciones oficiales se publicarán al validar el primer resultado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                      <th className="py-2.5 px-3 text-left font-medium">Pos</th>
                      <th className="py-2.5 px-3 text-left font-medium">Equipo</th>
                      <th className="py-2.5 px-2 text-right font-medium">PJ</th>
                      <th className="py-2.5 px-2 text-right font-medium">DG</th>
                      <th className="py-2.5 px-3 text-right font-medium">PTS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStandings.slice(0, 8).map((st) => {
                      const team = teamMap.get(st.teamId);
                      return (
                        <tr key={st.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-mono font-semibold tabular-nums text-slate-700">
                            {st.position}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-900">
                            <div className="flex items-center gap-2">
                              <TeamCrest
                                name={team?.name || st.teamId}
                                shortCode={team?.shortCode || 'EQ'}
                                primaryColor={team?.primaryColor}
                                secondaryColor={team?.secondaryColor}
                                size="sm"
                              />
                              <span className="truncate max-w-[140px]">{team?.name || st.teamId}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-600">
                            {st.played}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-600">
                            {st.goalDifference > 0 ? `+${st.goalDifference}` : st.goalDifference}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums text-navy-900">
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

          {/* Active Tournaments & Official Results */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-600" />
              <h2 className="font-display font-semibold text-base text-slate-900">
                Resultados Oficiales Recientes
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {officialResults.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  Aún no hay resultados oficiales validados.
                </div>
              ) : (
                officialResults.slice(0, 5).map((m) => {
                  const res = approvedResultByMatch.get(m.id);
                  const home = teamMap.get(m.homeTeamId);
                  const away = teamMap.get(m.awayTeamId);
                  return (
                    <div key={m.id} className="p-4 flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-slate-500 mb-1">
                          {categoryMap.get(m.categoryId)?.name} · {m.date}
                        </p>
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {home?.name || m.homeTeamId} vs {away?.name || m.awayTeamId}
                        </p>
                      </div>
                      <div className="px-3 py-1.5 rounded-lg bg-navy-900 text-white font-mono font-bold text-base tabular-nums shrink-0">
                        {res?.homeScore ?? m.homeScore ?? 0} - {res?.awayScore ?? m.awayScore ?? 0}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
              <Award className="w-4 h-4 text-electric-500" />
              <h2 className="font-display font-semibold text-base text-slate-900">
                Líderes de Goleo
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {topScorers.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No hay anotaciones oficiales registradas todavía.
                </div>
              ) : (
                topScorers.slice(0, 5).map((ps, idx) => {
                  const pl = playerMap.get(ps.playerId);
                  const tm = teamMap.get(ps.teamId);
                  return (
                    <div key={ps.id} className="p-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-6 text-center font-mono font-bold text-slate-400 tabular-nums">
                          {idx + 1}
                        </span>
                        <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center font-display font-bold text-xs text-navy-900 shrink-0">
                          {pl?.fullName?.slice(0, 2).toUpperCase() || 'JG'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {pl?.fullName || ps.playerId}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {tm?.name || ps.teamId} · {ps.matchesPlayed} PJ
                          </p>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-lg text-emerald-700 tabular-nums shrink-0">
                        {ps.goals}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'calendario' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="font-display font-semibold text-base text-slate-900">
              Calendario de Próximos Partidos ({upcomingMatches.length})
            </h2>
          </div>
          {upcomingMatches.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No existen partidos programados para este filtro.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                    <th className="py-3 px-4 text-left font-medium">#</th>
                    <th className="py-3 px-4 text-left font-medium">Fecha / Hora</th>
                    <th className="py-3 px-4 text-left font-medium">Categoría</th>
                    <th className="py-3 px-4 text-left font-medium">Encuentro</th>
                    <th className="py-3 px-4 text-left font-medium">Cancha</th>
                    <th className="py-3 px-4 text-left font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {upcomingMatches.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-500">
                        {m.matchNumber}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-800 whitespace-nowrap">
                        {m.date} · {m.time}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {categoryMap.get(m.categoryId)?.name || m.categoryId} · J{m.roundNumber}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {teamMap.get(m.homeTeamId)?.name || m.homeTeamId} vs{' '}
                        {teamMap.get(m.awayTeamId)?.name || m.awayTeamId}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {m.fieldId ? fieldMap.get(m.fieldId)?.name || 'Por definir' : 'Por definir'}
                      </td>
                      <td className="py-3 px-4 text-xs font-medium text-electric-600">
                        {m.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'resultados' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="font-display font-semibold text-base text-slate-900">
              Resultados Oficiales Validados ({officialResults.length})
            </h2>
          </div>
          {officialResults.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No hay resultados oficiales aprobados todavía.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {officialResults.map((m) => {
                const res = approvedResultByMatch.get(m.id)!;
                const home = teamMap.get(m.homeTeamId);
                const away = teamMap.get(m.awayTeamId);
                return (
                  <div
                    key={m.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50"
                  >
                    <div>
                      <p className="text-xs text-slate-500">
                        {tournamentMap.get(m.tournamentId)?.name} ·{' '}
                        {categoryMap.get(m.categoryId)?.name} · Jornada {m.roundNumber} · {m.date}
                      </p>
                      <p className="text-base font-display font-semibold text-slate-900 mt-1">
                        {home?.name || m.homeTeamId} vs {away?.name || m.awayTeamId}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="px-3.5 py-1.5 rounded-lg bg-navy-900 text-white font-mono font-bold text-lg tabular-nums">
                        {res.homeScore} - {res.awayScore}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'posiciones' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-display font-semibold text-base text-slate-900">
              Tabla Oficial de Posiciones
            </h2>
            <span className="text-xs text-slate-500">Actualizada tras validación oficial</span>
          </div>
          {filteredStandings.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No hay posiciones calculadas para los filtros seleccionados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                    <th className="py-3 px-4 text-left font-semibold">POS</th>
                    <th className="py-3 px-4 text-left font-semibold">EQUIPO</th>
                    <th className="py-3 px-3 text-left font-semibold">CATEGORÍA</th>
                    <th className="py-3 px-2.5 text-right font-semibold">PJ</th>
                    <th className="py-3 px-2.5 text-right font-semibold">PG</th>
                    <th className="py-3 px-2.5 text-right font-semibold">PE</th>
                    <th className="py-3 px-2.5 text-right font-semibold">PP</th>
                    <th className="py-3 px-2.5 text-right font-semibold">GF</th>
                    <th className="py-3 px-2.5 text-right font-semibold">GC</th>
                    <th className="py-3 px-2.5 text-right font-semibold">DG</th>
                    <th className="py-3 px-4 text-right font-semibold">PTS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStandings.map((st) => {
                    const team = teamMap.get(st.teamId);
                    return (
                      <tr key={st.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono font-bold tabular-nums text-navy-900">
                          {st.position}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900">
                          <div className="flex items-center gap-2.5">
                            <TeamCrest
                              name={team?.name || st.teamId}
                              shortCode={team?.shortCode || 'EQ'}
                              primaryColor={team?.primaryColor}
                              secondaryColor={team?.secondaryColor}
                              size="sm"
                            />
                            <span>{team?.name || st.teamId}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-500 text-xs">
                          {categoryMap.get(st.categoryId)?.name}
                        </td>
                        <td className="py-3 px-2.5 text-right font-mono tabular-nums">{st.played}</td>
                        <td className="py-3 px-2.5 text-right font-mono tabular-nums text-emerald-700">
                          {st.wins}
                        </td>
                        <td className="py-3 px-2.5 text-right font-mono tabular-nums">{st.draws}</td>
                        <td className="py-3 px-2.5 text-right font-mono tabular-nums text-red-600">
                          {st.losses}
                        </td>
                        <td className="py-3 px-2.5 text-right font-mono tabular-nums">{st.goalsFor}</td>
                        <td className="py-3 px-2.5 text-right font-mono tabular-nums">{st.goalsAgainst}</td>
                        <td className="py-3 px-2.5 text-right font-mono tabular-nums">
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

      {activeTab === 'goleadores' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="font-display font-semibold text-base text-slate-900">
              Tabla Oficial de Goleadores
            </h2>
          </div>
          {topScorers.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No hay goles registrados en actas oficiales todavía.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                    <th className="py-3 px-4 text-left font-semibold">Pos</th>
                    <th className="py-3 px-4 text-left font-semibold">Jugador</th>
                    <th className="py-3 px-4 text-left font-semibold">Equipo</th>
                    <th className="py-3 px-4 text-left font-semibold">Categoría</th>
                    <th className="py-3 px-3 text-right font-semibold">PJ</th>
                    <th className="py-3 px-3 text-right font-semibold">Goles</th>
                    <th className="py-3 px-4 text-right font-semibold">Prom/PJ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topScorers.map((ps, idx) => {
                    const pl = playerMap.get(ps.playerId);
                    const tm = teamMap.get(ps.teamId);
                    const avg = ps.matchesPlayed > 0 ? (ps.goals / ps.matchesPlayed).toFixed(2) : '0.00';
                    return (
                      <tr key={ps.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono font-bold tabular-nums text-slate-700">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900">
                          <div className="flex items-center gap-2.5">
                            {pl?.photoUrl ? (
                              <img
                                src={pl.photoUrl}
                                alt={pl.fullName}
                                referrerPolicy="no-referrer"
                                className="w-8 h-8 rounded-lg object-cover border border-slate-200"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-navy-900 text-white flex items-center justify-center text-xs font-bold">
                                #{pl?.jerseyNumber ?? '-'}
                              </div>
                            )}
                            <span>{pl?.fullName || ps.playerId}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-700">{tm?.name || ps.teamId}</td>
                        <td className="py-3 px-4 text-slate-500 text-xs">
                          {categoryMap.get(ps.categoryId)?.name}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">{ps.matchesPlayed}</td>
                        <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-emerald-700">
                          {ps.goals}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                          {avg}
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

      {activeTab === 'equipos' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTeams.length === 0 ? (
            <div className="col-span-full bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
              No hay equipos registrados para los filtros seleccionados.
            </div>
          ) : (
            filteredTeams.map((team) => {
              const rosterCount = players.filter((p) => p.teamId === team.id).length;
              const stat = teamStatistics.find((ts) => ts.teamId === team.id);
              return (
                <div
                  key={team.id}
                  className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <TeamCrest
                      name={team.name}
                      shortCode={team.shortCode}
                      primaryColor={team.primaryColor}
                      secondaryColor={team.secondaryColor}
                      crestUrl={team.crestUrl}
                      size="lg"
                    />
                    <div className="min-w-0">
                      <h3 className="font-display font-semibold text-slate-900 truncate">
                        {team.name}
                      </h3>
                      <p className="text-xs text-slate-500 truncate">
                        {categoryMap.get(team.categoryId)?.name || 'Categoría'} ·{' '}
                        <span className="font-mono tabular-nums">{rosterCount}</span> jugadores
                      </p>
                      {team.coachName && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          DT: {team.coachName}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs text-slate-400 block">Puntos</span>
                    <span className="font-mono font-bold text-lg text-navy-900 tabular-nums">
                      {stat?.points ?? 0}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'campeones' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
            <Crown className="w-4 h-4 text-amber-500" />
            <h2 className="font-display font-semibold text-base text-slate-900">
              Historial de Campeones por Temporada
            </h2>
          </div>
          {historicalChampions.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              Cuando finalicen los torneos se conservará aquí el historial oficial de campeones.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {historicalChampions.map((t) => {
                const champ = t.championTeamId ? teamMap.get(t.championTeamId) : undefined;
                const season = seasonMap.get(t.seasonId);
                const sport = sportMap.get(t.sportId);
                return (
                  <div key={t.id} className="p-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600">
                        <Trophy className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-display font-semibold text-slate-900">
                          {champ?.name || t.championTeamName || 'Por definir'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {t.name} · {sport?.name || 'Deporte'} · {season?.name || 'Temporada'}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-slate-500 tabular-nums">
                      {season?.year || ''}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Active Tournaments Footer Strip */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-navy-800" />
          <h3 className="font-display font-semibold text-sm text-slate-900">
            Torneos Activos Registrados
          </h3>
        </div>
        {filteredTournaments.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aún no hay torneos creados en la plataforma.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredTournaments.map((t) => (
              <div
                key={t.id}
                className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 flex flex-col justify-between gap-2"
              >
                <div>
                  <p className="font-semibold text-sm text-slate-900">{t.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {sportMap.get(t.sportId)?.name || 'Deporte'} ·{' '}
                    {seasonMap.get(t.seasonId)?.name || 'Temporada'}
                  </p>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-600 pt-2 border-t border-slate-200/70">
                  <span>Estado: {t.status}</span>
                  <span className="font-mono tabular-nums">
                    {categories.filter((c) => c.tournamentId === t.id).length} categorías
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
