import { useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, Printer } from 'lucide-react';
import {
  exportMatchSheetPdf,
  exportToExcel,
  exportToPdf,
  type ExportTablePayload,
} from '../engines/exportEngine';
import { useSigdData } from '../context/SigdDataContext';

type ReportType =
  | 'roles_categoria'
  | 'calendario_general'
  | 'calendario_equipo'
  | 'resultados_jornada'
  | 'tabla_posiciones'
  | 'stats_individuales'
  | 'stats_colectivas'
  | 'goleadores'
  | 'actas_partidos'
  | 'historial_campeones'
  | 'reporte_general';

const REPORT_CATALOG: { id: ReportType; title: string; desc: string }[] = [
  { id: 'roles_categoria', title: 'Roles de juego por categoría', desc: 'Jornadas, fechas, horarios, canchas y árbitros por categoría.' },
  { id: 'calendario_general', title: 'Calendario general', desc: 'Programación completa ordenada cronológicamente.' },
  { id: 'calendario_equipo', title: 'Calendario por equipo', desc: 'Encuentros filtrados para un club específico.' },
  { id: 'resultados_jornada', title: 'Resultados por jornada', desc: 'Marcadores oficiales validados por jornada.' },
  { id: 'tabla_posiciones', title: 'Tablas de posiciones', desc: 'POS, PJ, PG, PE, PP, GF, GC, DG y PTS oficiales.' },
  { id: 'stats_individuales', title: 'Estadísticas individuales', desc: 'Goles, asistencias, tarjetas, titularidades y minutos.' },
  { id: 'stats_colectivas', title: 'Estadísticas colectivas', desc: '% victorias, efectividad, promedios y vallas invictas.' },
  { id: 'goleadores', title: 'Tabla de goleadores', desc: 'Clasificación oficial de anotadores y promedio por partido.' },
  { id: 'actas_partidos', title: 'Actas de partidos', desc: 'Acta digital individual oficial con incidencias por minuto.' },
  { id: 'historial_campeones', title: 'Historial de campeones', desc: 'Campeones históricos por temporada y torneo.' },
  { id: 'reporte_general', title: 'Reporte general del torneo', desc: 'Resumen ejecutivo de equipos, partidos, actas y líder.' },
];

export function ReportsPage() {
  const {
    organizations,
    seasons,
    tournaments,
    categories,
    teams,
    players,
    fields,
    referees,
    matches,
    matchResults,
    matchEvents,
    standings,
    teamStatistics,
    playerStatistics,
  } = useSigdData();

  const [reportType, setReportType] = useState<ReportType>('tabla_posiciones');
  const [tournamentId, setTournamentId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [matchId, setMatchId] = useState('');

  const activeTournament = tournaments.find((t) => t.id === tournamentId) || tournaments[0];
  const tournamentCats = useMemo(
    () => categories.filter((c) => c.tournamentId === activeTournament?.id),
    [categories, activeTournament?.id]
  );
  const activeCategory = tournamentCats.find((c) => c.id === categoryId) || tournamentCats[0];
  const activeTeams = useMemo(
    () => teams.filter((t) => !activeTournament || t.tournamentId === activeTournament.id),
    [teams, activeTournament]
  );
  const activeTeam = activeTeams.find((t) => t.id === teamId) || activeTeams[0];

  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const fieldMap = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);
  const refMap = useMemo(() => new Map(referees.map((r) => [r.id, r])), [referees]);
  const seasonMap = useMemo(() => new Map(seasons.map((s) => [s.id, s])), [seasons]);

  const orgName = organizations[0]?.name || 'SIGD — Sistema Integral de Gestión Deportiva';

  const currentPayload: ExportTablePayload = useMemo(() => {
    const tName = activeTournament?.name || 'Todos los torneos';
    const cName = activeCategory?.name || 'Todas las categorías';

    switch (reportType) {
      case 'roles_categoria':
      case 'calendario_general': {
        const list = matches
          .filter((m) =>
            reportType === 'roles_categoria' && activeCategory
              ? m.categoryId === activeCategory.id
              : !activeTournament || m.tournamentId === activeTournament.id
          )
          .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
        return {
          title:
            reportType === 'roles_categoria'
              ? `Roles de Juego — ${cName}`
              : `Calendario General — ${tName}`,
          subtitle: tName,
          organizationName: orgName,
          fileName: `${reportType}_${cName}`.replace(/\s+/g, '_'),
          headers: ['#', 'Jornada', 'Fecha', 'Hora', 'Local', 'Visitante', 'Cancha', 'Estado'],
          rows: list.map((m) => [
            m.matchNumber,
            `J${m.roundNumber}`,
            m.date,
            m.time,
            teamMap.get(m.homeTeamId)?.name || m.homeTeamId,
            teamMap.get(m.awayTeamId)?.name || m.awayTeamId,
            m.fieldId ? fieldMap.get(m.fieldId)?.name || '-' : '-',
            m.status,
          ]),
        };
      }

      case 'calendario_equipo': {
        const list = matches.filter(
          (m) => activeTeam && (m.homeTeamId === activeTeam.id || m.awayTeamId === activeTeam.id)
        );
        return {
          title: `Calendario por Equipo — ${activeTeam?.name || 'Equipo'}`,
          subtitle: tName,
          organizationName: orgName,
          fileName: `Calendario_${activeTeam?.shortCode || 'EQ'}`,
          headers: ['#', 'Jornada', 'Fecha', 'Hora', 'Local', 'Visitante', 'Marcador', 'Estado'],
          rows: list.map((m) => [
            m.matchNumber,
            `J${m.roundNumber}`,
            m.date,
            m.time,
            teamMap.get(m.homeTeamId)?.name || m.homeTeamId,
            teamMap.get(m.awayTeamId)?.name || m.awayTeamId,
            m.status === 'Finalizado' ? `${m.homeScore ?? 0}-${m.awayScore ?? 0}` : '-',
            m.status,
          ]),
        };
      }

      case 'resultados_jornada': {
        const list = matches.filter(
          (m) =>
            (!activeTournament || m.tournamentId === activeTournament.id) &&
            m.status === 'Finalizado'
        );
        return {
          title: `Resultados Oficiales por Jornada — ${tName}`,
          subtitle: cName,
          organizationName: orgName,
          fileName: `Resultados_${tName}`.replace(/\s+/g, '_'),
          headers: ['Jornada', 'Fecha', 'Categoría', 'Local', 'Marcador', 'Visitante'],
          rows: list.map((m) => [
            `J${m.roundNumber}`,
            m.date,
            catMap.get(m.categoryId)?.name || '-',
            teamMap.get(m.homeTeamId)?.name || m.homeTeamId,
            `${m.homeScore ?? 0} - ${m.awayScore ?? 0}`,
            teamMap.get(m.awayTeamId)?.name || m.awayTeamId,
          ]),
        };
      }

      case 'tabla_posiciones': {
        const list = standings
          .filter((s) => (!activeCategory ? true : s.categoryId === activeCategory.id))
          .sort((a, b) => a.position - b.position);
        return {
          title: `Tabla de Posiciones — ${cName}`,
          subtitle: tName,
          organizationName: orgName,
          fileName: `Posiciones_${cName}`.replace(/\s+/g, '_'),
          headers: ['POS', 'EQUIPO', 'PJ', 'PG', 'PE', 'PP', 'GF', 'GC', 'DG', 'PTS'],
          rows: list.map((s) => [
            s.position,
            teamMap.get(s.teamId)?.name || s.teamId,
            s.played,
            s.wins,
            s.draws,
            s.losses,
            s.goalsFor,
            s.goalsAgainst,
            s.goalDifference,
            s.points,
          ]),
        };
      }

      case 'stats_colectivas': {
        const list = teamStatistics.filter((ts) =>
          !activeCategory ? true : ts.categoryId === activeCategory.id
        );
        return {
          title: `Estadísticas Colectivas — ${cName}`,
          subtitle: tName,
          organizationName: orgName,
          fileName: `Stats_Equipos_${cName}`.replace(/\s+/g, '_'),
          headers: ['Equipo', 'PJ', 'PTS', '% Vic.', '% Efect.', 'Prom. GF', 'Prom. GC', 'Vallas Inv.'],
          rows: list.map((ts) => [
            teamMap.get(ts.teamId)?.name || ts.teamId,
            ts.played,
            ts.points,
            `${ts.winRate}%`,
            `${ts.effectivenessRate}%`,
            ts.avgGoalsFor,
            ts.avgGoalsAgainst,
            ts.cleanSheets,
          ]),
        };
      }

      case 'stats_individuales': {
        const list = playerStatistics.filter((ps) =>
          !activeCategory ? true : ps.categoryId === activeCategory.id
        );
        return {
          title: `Estadísticas Individuales — ${cName}`,
          subtitle: tName,
          organizationName: orgName,
          fileName: `Stats_Jugadores_${cName}`.replace(/\s+/g, '_'),
          headers: ['Jugador', 'Equipo', 'PJ', 'Goles', 'Asist.', 'TA', 'TR', 'Tit.', 'Min.'],
          rows: list.map((ps) => [
            playerMap.get(ps.playerId)?.fullName || ps.playerId,
            teamMap.get(ps.teamId)?.name || ps.teamId,
            ps.matchesPlayed,
            ps.goals,
            ps.assists,
            ps.yellowCards,
            ps.redCards,
            ps.starts,
            ps.minutesPlayed,
          ]),
        };
      }

      case 'goleadores': {
        const list = playerStatistics
          .filter((ps) => ps.goals > 0 && (!activeCategory || ps.categoryId === activeCategory.id))
          .sort((a, b) => b.goals - a.goals);
        return {
          title: `Tabla de Goleadores — ${cName}`,
          subtitle: tName,
          organizationName: orgName,
          fileName: `Goleadores_${cName}`.replace(/\s+/g, '_'),
          headers: ['Pos', 'Jugador', 'Equipo', 'Categoría', 'PJ', 'Goles', 'Promedio'],
          rows: list.map((ps, idx) => [
            idx + 1,
            playerMap.get(ps.playerId)?.fullName || ps.playerId,
            teamMap.get(ps.teamId)?.name || ps.teamId,
            catMap.get(ps.categoryId)?.name || '-',
            ps.matchesPlayed,
            ps.goals,
            ps.matchesPlayed > 0 ? (ps.goals / ps.matchesPlayed).toFixed(2) : '0.00',
          ]),
        };
      }

      case 'historial_campeones': {
        const champs = tournaments.filter((t) => t.status === 'finalizado' || Boolean(t.championTeamId));
        return {
          title: 'Historial Oficial de Campeones',
          subtitle: orgName,
          organizationName: orgName,
          fileName: 'Historial_Campeones_SIGD',
          headers: ['Temporada', 'Año', 'Torneo', 'Campeón', 'Estado'],
          rows: champs.map((t) => [
            seasonMap.get(t.seasonId)?.name || '-',
            seasonMap.get(t.seasonId)?.year || '-',
            t.name,
            t.championTeamName || teamMap.get(t.championTeamId || '')?.name || 'Por definir',
            t.status,
          ]),
        };
      }

      default: {
        // reporte_general or actas_partidos preview
        return {
          title: `Reporte General del Torneo — ${tName}`,
          subtitle: orgName,
          organizationName: orgName,
          fileName: `Reporte_General_${tName}`.replace(/\s+/g, '_'),
          headers: ['Categoría', 'Equipos', 'Partidos Prog.', 'Finalizados', 'Actas Aprobadas'],
          rows: tournamentCats.map((cat) => {
            const cTeams = teams.filter((t) => t.categoryId === cat.id).length;
            const cMatches = matches.filter((m) => m.categoryId === cat.id);
            const cFin = cMatches.filter((m) => m.status === 'Finalizado').length;
            const cApr = matchResults.filter(
              (r) => r.categoryId === cat.id && r.validationStatus === 'aprobado'
            ).length;
            return [cat.name, cTeams, cMatches.length, cFin, cApr];
          }),
        };
      }
    }
  }, [
    reportType,
    activeTournament,
    activeCategory,
    activeTeam,
    matches,
    standings,
    teamStatistics,
    playerStatistics,
    tournaments,
    tournamentCats,
    teams,
    matchResults,
    orgName,
    teamMap,
    fieldMap,
    catMap,
    playerMap,
    seasonMap,
  ]);

  const handleExportMatchPdf = () => {
    const m = matches.find((item) => item.id === matchId) || matches[0];
    if (!m) return;
    const res = matchResults.find((r) => r.matchId === m.id);
    const evs = matchEvents.filter((e) => e.matchId === m.id);
    const playerNames: Record<string, string> = {};
    players.forEach((p) => {
      playerNames[p.id] = `#${p.jerseyNumber} ${p.fullName}`;
    });
    const teamNames: Record<string, string> = {};
    teams.forEach((t) => {
      teamNames[t.id] = t.name;
    });

    exportMatchSheetPdf({
      match: m,
      result: res,
      events: evs,
      tournamentName: tournaments.find((t) => t.id === m.tournamentId)?.name || 'Torneo',
      categoryName: catMap.get(m.categoryId)?.name || 'Categoría',
      homeTeamName: teamNames[m.homeTeamId] || m.homeTeamId,
      awayTeamName: teamNames[m.awayTeamId] || m.awayTeamId,
      fieldName: m.fieldId ? fieldMap.get(m.fieldId)?.name || '-' : '-',
      refereeName: m.refereeId ? refMap.get(m.refereeId)?.fullName || '-' : '-',
      playerNames,
      teamNames,
    });
  };

  return (
    <div className="space-y-6">
      <div className="no-print bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-display font-bold text-navy-900">
            Centro de Reportes y Exportaciones Oficiales
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Genera documentos profesionales en PDF, hojas de cálculo Excel (.xlsx) e impresión directa.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {reportType === 'actas_partidos' ? (
            <button
              type="button"
              disabled={matches.length === 0}
              onClick={handleExportMatchPdf}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-navy-900 hover:bg-navy-800 rounded-lg disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              Descargar Acta PDF
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => exportToPdf(currentPayload)}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-white bg-navy-900 hover:bg-navy-800 rounded-lg"
              >
                <FileText className="w-4 h-4" />
                Exportar PDF
              </button>
              <button
                type="button"
                onClick={() => exportToExcel(currentPayload)}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Exportar Excel
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium border border-slate-200 bg-white hover:bg-slate-50 rounded-lg"
              >
                <Printer className="w-4 h-4" />
                Imprimir
              </button>
            </>
          )}
        </div>
      </div>

      <div className="no-print grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 h-fit">
          {REPORT_CATALOG.map((rep) => (
            <button
              key={rep.id}
              type="button"
              onClick={() => setReportType(rep.id)}
              className={`w-full text-left p-3.5 transition-colors ${
                reportType === rep.id ? 'bg-blue-50/70' : 'hover:bg-slate-50'
              }`}
            >
              <p className="font-display font-semibold text-sm text-slate-900">{rep.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{rep.desc}</p>
            </button>
          ))}
        </div>

        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Torneo</label>
              <select
                value={activeTournament?.id || ''}
                onChange={(e) => {
                  setTournamentId(e.target.value);
                  setCategoryId('');
                }}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50"
              >
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Categoría</label>
              <select
                value={activeCategory?.id || ''}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50"
              >
                {tournamentCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {reportType === 'calendario_equipo' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Equipo</label>
                <select
                  value={activeTeam?.id || ''}
                  onChange={(e) => setTeamId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50"
                >
                  {activeTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {reportType === 'actas_partidos' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Partido</label>
                <select
                  value={matchId || matches[0]?.id || ''}
                  onChange={(e) => setMatchId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50"
                >
                  {matches.map((m) => (
                    <option key={m.id} value={m.id}>
                      #{m.matchNumber} {teamMap.get(m.homeTeamId)?.shortCode} vs{' '}
                      {teamMap.get(m.awayTeamId)?.shortCode}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Live Print/Report Preview */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 bg-navy-900 text-white flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-300">{orgName}</p>
                <h2 className="font-display font-bold text-base mt-0.5">
                  {currentPayload.title}
                </h2>
              </div>
              <span className="text-xs font-mono text-slate-300">
                {new Date().toLocaleDateString('es-MX')}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                    {currentPayload.headers.map((h) => (
                      <th key={h} className="py-2.5 px-3 text-left font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentPayload.rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={currentPayload.headers.length}
                        className="py-8 text-center text-sm text-slate-500"
                      >
                        No hay registros disponibles para este reporte con los filtros actuales.
                      </td>
                    </tr>
                  ) : (
                    currentPayload.rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="py-2.5 px-3 font-mono text-xs tabular-nums">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
