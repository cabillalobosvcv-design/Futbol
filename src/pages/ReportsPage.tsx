import { useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Loader2,
  Printer,
} from 'lucide-react';
import {
  exportMatchSheetPdf,
  exportOfficialArchivePdf,
  exportToExcel,
  exportToPdf,
  type ExportTablePayload,
  type OfficialArchiveMatchItem,
  type OfficialArchiveTableSection,
} from '../engines/exportEngine';
import { useAuth } from '../context/AuthContext';
import { useSigdData } from '../context/SigdDataContext';
import { TeamCrest } from '../components/TeamCrest';
import type { MatchEventType } from '../types/sigd';

type ReportType =
  | 'archivo_oficial'
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

type ArchiveScope = 'category' | 'tournament';
type ArchiveMatchFilter = 'with_result_or_finished' | 'approved_only' | 'all_matches';

const REPORT_CATALOG: { id: ReportType; title: string; desc: string }[] = [
  {
    id: 'archivo_oficial',
    title: 'Archivo Oficial (Estadísticas + Actas)',
    desc: 'Expediente PDF imprimible con estadísticas actuales y actas de juego para el archivo oficial.',
  },
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

const EVENT_TYPE_LABELS: Record<MatchEventType, string> = {
  gol: 'Gol',
  penal: 'Gol de Penal',
  autogol: 'Autogol',
  asistencia: 'Asistencia',
  amarilla: 'Tarjeta Amarilla',
  roja: 'Tarjeta Roja',
  sustitucion: 'Sustitución',
  participacion: 'Participación',
};

export function ReportsPage() {
  const { profile } = useAuth();
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

  const [reportType, setReportType] = useState<ReportType>('archivo_oficial');
  const [tournamentId, setTournamentId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [matchId, setMatchId] = useState('');

  // Official Archive PDF options
  const [archiveScope, setArchiveScope] = useState<ArchiveScope>('category');
  const [archiveMatchFilter, setArchiveMatchFilter] =
    useState<ArchiveMatchFilter>('with_result_or_finished');
  const [includeStandings, setIncludeStandings] = useState(true);
  const [includeTeamStats, setIncludeTeamStats] = useState(true);
  const [includeTopScorers, setIncludeTopScorers] = useState(true);
  const [includePlayerStats, setIncludePlayerStats] = useState(true);
  const [includeMatchSheets, setIncludeMatchSheets] = useState(true);
  const [exportingArchive, setExportingArchive] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

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
  const resultByMatchId = useMemo(
    () => new Map(matchResults.map((r) => [r.matchId, r])),
    [matchResults]
  );

  const orgName = organizations[0]?.name || 'SIGD — Sistema Integral de Gestión Deportiva';
  const orgLogoUrl = organizations[0]?.logoUrl || '';

  const filteredMatchesForScope = useMemo(() => {
    const list = matches.filter((m) => {
      if (activeTournament && m.tournamentId !== activeTournament.id) return false;
      if (
        (reportType === 'actas_partidos' || archiveScope === 'category') &&
        activeCategory &&
        m.categoryId !== activeCategory.id
      ) {
        return false;
      }
      return true;
    });
    return list.sort((a, b) =>
      a.roundNumber !== b.roundNumber
        ? a.roundNumber - b.roundNumber
        : a.matchNumber - b.matchNumber
    );
  }, [matches, activeTournament, activeCategory, reportType, archiveScope]);

  const selectedSingleMatch =
    filteredMatchesForScope.find((m) => m.id === matchId) ||
    filteredMatchesForScope[0] ||
    matches.find((m) => m.id === matchId) ||
    matches[0];

  // Archive data computation
  const archiveData = useMemo(() => {
    const filterByScope = <T extends { tournamentId: string; categoryId: string }>(arr: T[]) =>
      arr.filter((item) => {
        if (activeTournament && item.tournamentId !== activeTournament.id) return false;
        if (archiveScope === 'category' && activeCategory && item.categoryId !== activeCategory.id) {
          return false;
        }
        return true;
      });

    const scopedStandings = filterByScope(standings).sort((a, b) =>
      a.categoryId === b.categoryId
        ? a.position - b.position
        : (catMap.get(a.categoryId)?.name || '').localeCompare(catMap.get(b.categoryId)?.name || '')
    );

    const includePen =
      Boolean(activeTournament?.drawPenaltyShootout) ||
      scopedStandings.some((s) => (s.penaltyWins ?? 0) > 0);

    const standingsSection: OfficialArchiveTableSection = {
      title: '1. Tabla de Posiciones Actual',
      subtitle: archiveScope === 'category' && activeCategory ? activeCategory.name : 'Todas las categorías',
      headers: includePen
        ? archiveScope === 'tournament'
          ? ['Cat.', 'POS', 'EQUIPO', 'PJ', 'PG', 'PE', 'PEN', 'PP', 'GF', 'GC', 'DG', 'PTS']
          : ['POS', 'EQUIPO', 'PJ', 'PG', 'PE', 'PEN', 'PP', 'GF', 'GC', 'DG', 'PTS']
        : archiveScope === 'tournament'
          ? ['Cat.', 'POS', 'EQUIPO', 'PJ', 'PG', 'PE', 'PP', 'GF', 'GC', 'DG', 'PTS']
          : ['POS', 'EQUIPO', 'PJ', 'PG', 'PE', 'PP', 'GF', 'GC', 'DG', 'PTS'],
      rows: scopedStandings.map((s) => {
        const base = includePen
          ? [
              s.position,
              teamMap.get(s.teamId)?.name || s.teamId,
              s.played,
              s.wins,
              s.draws,
              s.penaltyWins ?? 0,
              s.losses,
              s.goalsFor,
              s.goalsAgainst,
              s.goalDifference,
              s.points,
            ]
          : [
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
            ];
        return archiveScope === 'tournament'
          ? [catMap.get(s.categoryId)?.name || '-', ...base]
          : base;
      }),
    };

    const scopedTeamStats = filterByScope(teamStatistics).sort((a, b) => b.points - a.points);
    const teamStatsSection: OfficialArchiveTableSection = {
      title: '2. Estadísticas Colectivas Actuales',
      headers:
        archiveScope === 'tournament'
          ? ['Cat.', 'Equipo', 'PJ', 'PTS', '% Vic.', '% Efect.', 'Prom. GF', 'Prom. GC', 'Vallas Inv.']
          : ['Equipo', 'PJ', 'PTS', '% Vic.', '% Efect.', 'Prom. GF', 'Prom. GC', 'Vallas Inv.'],
      rows: scopedTeamStats.map((ts) => {
        const base = [
          teamMap.get(ts.teamId)?.name || ts.teamId,
          ts.played,
          ts.points,
          `${ts.winRate}%`,
          `${ts.effectivenessRate}%`,
          ts.avgGoalsFor,
          ts.avgGoalsAgainst,
          ts.cleanSheets,
        ];
        return archiveScope === 'tournament'
          ? [catMap.get(ts.categoryId)?.name || '-', ...base]
          : base;
      }),
    };

    const scopedPlayerStats = filterByScope(playerStatistics);
    const topScorers = scopedPlayerStats
      .filter((ps) => ps.goals > 0)
      .sort((a, b) => b.goals - a.goals || b.assists - a.assists);

    const topScorersSection: OfficialArchiveTableSection = {
      title: '3. Tabla de Goleadores Oficial',
      headers: ['Pos', 'Jugador', 'Equipo', 'Categoría', 'PJ', 'Goles', 'Asist.', 'Prom.'],
      rows: topScorers.map((ps, idx) => [
        idx + 1,
        playerMap.get(ps.playerId)?.fullName || ps.playerId,
        teamMap.get(ps.teamId)?.name || ps.teamId,
        catMap.get(ps.categoryId)?.name || '-',
        ps.matchesPlayed,
        ps.goals,
        ps.assists,
        ps.matchesPlayed > 0 ? (ps.goals / ps.matchesPlayed).toFixed(2) : '0.00',
      ]),
    };

    const sortedIndividualStats = [...scopedPlayerStats].sort(
      (a, b) => b.goals - a.goals || b.minutesPlayed - a.minutesPlayed
    );
    const playerStatsSection: OfficialArchiveTableSection = {
      title: '4. Estadísticas Individuales de Jugadores',
      headers: ['Jugador', 'Equipo', 'PJ', 'Goles', 'Asist.', 'TA', 'TR', 'Tit.', 'Min.'],
      rows: sortedIndividualStats.map((ps) => [
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

    const scopedMatches = filterByScope(matches).sort((a, b) =>
      a.roundNumber !== b.roundNumber
        ? a.roundNumber - b.roundNumber
        : a.matchNumber - b.matchNumber
    );

    const filteredArchiveMatches = scopedMatches.filter((m) => {
      const res = resultByMatchId.get(m.id);
      if (archiveMatchFilter === 'approved_only') {
        return res?.validationStatus === 'aprobado';
      }
      if (archiveMatchFilter === 'with_result_or_finished') {
        return m.status === 'Finalizado' || Boolean(res);
      }
      return true;
    });

    const matchSheets: OfficialArchiveMatchItem[] = filteredArchiveMatches.map((m) => {
      const home = teamMap.get(m.homeTeamId);
      const away = teamMap.get(m.awayTeamId);
      return {
        match: m,
        result: resultByMatchId.get(m.id),
        events: matchEvents.filter((ev) => ev.matchId === m.id),
        categoryName: catMap.get(m.categoryId)?.name || 'Categoría',
        homeTeamName: home?.name || m.homeTeamId,
        awayTeamName: away?.name || m.awayTeamId,
        homeTeamLogoUrl: home?.crestUrl || '',
        awayTeamLogoUrl: away?.crestUrl || '',
        fieldName: m.fieldId ? fieldMap.get(m.fieldId)?.name || '-' : '-',
        refereeName: m.refereeId ? refMap.get(m.refereeId)?.fullName || '-' : '-',
      };
    });

    const scopedTeamsCount = teams.filter((t) => {
      if (activeTournament && t.tournamentId !== activeTournament.id) return false;
      if (archiveScope === 'category' && activeCategory && t.categoryId !== activeCategory.id) {
        return false;
      }
      return true;
    }).length;

    const totalGoals = scopedStandings.reduce((acc, s) => acc + s.goalsFor, 0);

    return {
      scopedStandings,
      scopedTeamsCount,
      scopedMatchesCount: scopedMatches.length,
      totalGoals,
      standingsSection,
      teamStatsSection,
      topScorersSection,
      playerStatsSection,
      matchSheets,
    };
  }, [
    activeTournament,
    activeCategory,
    archiveScope,
    archiveMatchFilter,
    standings,
    teamStatistics,
    playerStatistics,
    matches,
    matchEvents,
    teams,
    resultByMatchId,
    teamMap,
    catMap,
    playerMap,
    fieldMap,
    refMap,
  ]);

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
          organizationLogoUrl: orgLogoUrl,
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
          organizationLogoUrl: orgLogoUrl,
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
          organizationLogoUrl: orgLogoUrl,
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
        const includePen =
          Boolean(activeTournament?.drawPenaltyShootout) ||
          list.some((s) => (s.penaltyWins ?? 0) > 0);
        return {
          title: `Tabla de Posiciones — ${cName}`,
          subtitle: tName,
          organizationName: orgName,
          organizationLogoUrl: orgLogoUrl,
          fileName: `Posiciones_${cName}`.replace(/\s+/g, '_'),
          headers: includePen
            ? ['POS', 'EQUIPO', 'PJ', 'PG', 'PE', 'PEN', 'PP', 'GF', 'GC', 'DG', 'PTS']
            : ['POS', 'EQUIPO', 'PJ', 'PG', 'PE', 'PP', 'GF', 'GC', 'DG', 'PTS'],
          rows: list.map((s) =>
            includePen
              ? [
                  s.position,
                  teamMap.get(s.teamId)?.name || s.teamId,
                  s.played,
                  s.wins,
                  s.draws,
                  s.penaltyWins ?? 0,
                  s.losses,
                  s.goalsFor,
                  s.goalsAgainst,
                  s.goalDifference,
                  s.points,
                ]
              : [
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
                ]
          ),
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
          organizationLogoUrl: orgLogoUrl,
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
          organizationLogoUrl: orgLogoUrl,
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
          organizationLogoUrl: orgLogoUrl,
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
          organizationLogoUrl: orgLogoUrl,
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
        return {
          title: `Reporte General del Torneo — ${tName}`,
          subtitle: orgName,
          organizationName: orgName,
          organizationLogoUrl: orgLogoUrl,
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
    orgLogoUrl,
    teamMap,
    fieldMap,
    catMap,
    playerMap,
    seasonMap,
  ]);

  const handleExportMatchPdf = () => {
    const m = selectedSingleMatch;
    if (!m) return;
    const res = resultByMatchId.get(m.id);
    const evs = matchEvents.filter((e) => e.matchId === m.id);
    const playerNames: Record<string, string> = {};
    players.forEach((p) => {
      playerNames[p.id] = `#${p.jerseyNumber} ${p.fullName}`;
    });
    const teamNames: Record<string, string> = {};
    teams.forEach((t) => {
      teamNames[t.id] = t.name;
    });

    void exportMatchSheetPdf({
      match: m,
      result: res,
      events: evs,
      tournamentName: tournaments.find((t) => t.id === m.tournamentId)?.name || 'Torneo',
      categoryName: catMap.get(m.categoryId)?.name || 'Categoría',
      homeTeamName: teamNames[m.homeTeamId] || m.homeTeamId,
      awayTeamName: teamNames[m.awayTeamId] || m.awayTeamId,
      homeTeamLogoUrl: teams.find((t) => t.id === m.homeTeamId)?.crestUrl || '',
      awayTeamLogoUrl: teams.find((t) => t.id === m.awayTeamId)?.crestUrl || '',
      fieldName: m.fieldId ? fieldMap.get(m.fieldId)?.name || '-' : '-',
      refereeName: m.refereeId ? refMap.get(m.refereeId)?.fullName || '-' : '-',
      playerNames,
      teamNames,
      organizationName: orgName,
      organizationLogoUrl: orgLogoUrl,
    });
  };

  const handleExportOfficialArchivePdf = async () => {
    setExportingArchive(true);
    setExportFeedback(null);
    try {
      const statSections: OfficialArchiveTableSection[] = [];
      if (includeStandings) statSections.push(archiveData.standingsSection);
      if (includeTeamStats) statSections.push(archiveData.teamStatsSection);
      if (includeTopScorers) statSections.push(archiveData.topScorersSection);
      if (includePlayerStats) statSections.push(archiveData.playerStatsSection);

      const sheets = includeMatchSheets ? archiveData.matchSheets : [];

      if (statSections.length === 0 && sheets.length === 0) {
        setExportFeedback('Selecciona al menos una sección de estadísticas o actas para exportar.');
        return;
      }

      const playerNames: Record<string, string> = {};
      players.forEach((p) => {
        playerNames[p.id] = `#${p.jerseyNumber} ${p.fullName}`;
      });
      const teamNames: Record<string, string> = {};
      teams.forEach((t) => {
        teamNames[t.id] = t.name;
      });

      const tName = activeTournament?.name || 'Torneo_SIGD';
      const sName = activeTournament ? seasonMap.get(activeTournament.seasonId)?.name : undefined;
      const scopeLabel =
        archiveScope === 'category' && activeCategory
          ? `Categoría: ${activeCategory.name}`
          : 'Todas las categorías del torneo';

      const cleanFileName = `Archivo_Oficial_${tName}_${
        archiveScope === 'category' && activeCategory ? activeCategory.name : 'General'
      }`
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_\-áéíóúÁÉÍÓÚñÑ]/g, '');

      await exportOfficialArchivePdf({
        fileName: cleanFileName,
        organizationName: orgName,
        organizationLogoUrl: orgLogoUrl,
        tournamentName: tName,
        seasonName: sName,
        scopeLabel,
        summaryMetrics: [
          { label: 'Equipos', value: archiveData.scopedTeamsCount },
          { label: 'Partidos Prog.', value: archiveData.scopedMatchesCount },
          { label: 'Actas Incluidas', value: sheets.length },
          { label: 'Goles Totales', value: archiveData.totalGoals },
        ],
        statSections,
        matchSheets: sheets,
        playerNames,
        teamNames,
        generatedBy: profile?.displayName,
      });

      setExportFeedback(
        `Archivo Oficial PDF generado con ${statSections.length} bloque(s) de estadísticas y ${sheets.length} acta(s) de juego.`
      );
    } finally {
      setExportingArchive(false);
    }
  };

  const singleMatchResult = selectedSingleMatch
    ? resultByMatchId.get(selectedSingleMatch.id)
    : undefined;
  const singleMatchEvents = useMemo(
    () =>
      selectedSingleMatch
        ? matchEvents
            .filter((e) => e.matchId === selectedSingleMatch.id)
            .slice()
            .sort((a, b) => a.minute - b.minute)
        : [],
    [selectedSingleMatch, matchEvents]
  );

  return (
    <div className="space-y-6">
      <div className="no-print bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-colors">
        <div>
          <h1 className="text-xl font-display font-bold text-navy-900 dark:text-white">
            Centro de Reportes y Exportaciones Oficiales
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            Genera el expediente PDF imprimible para archivo oficial, hojas de cálculo Excel (.xlsx) y actas individuales.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={exportingArchive}
            onClick={handleExportOfficialArchivePdf}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-navy-900 dark:bg-electric-500 hover:bg-navy-800 dark:hover:bg-electric-600 rounded-lg disabled:opacity-50 transition-colors"
          >
            {exportingArchive ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Archive className="w-4 h-4" />
            )}
            {exportingArchive ? 'Generando Archivo PDF...' : 'Exportar Archivo Oficial PDF'}
          </button>

          {reportType === 'actas_partidos' ? (
            <>
              <button
                type="button"
                disabled={!selectedSingleMatch}
                onClick={handleExportMatchPdf}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
              >
                <FileText className="w-4 h-4" />
                Descargar Acta PDF
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg"
              >
                <Printer className="w-4 h-4" />
                Imprimir
              </button>
            </>
          ) : reportType === 'archivo_oficial' ? (
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg"
            >
              <Printer className="w-4 h-4" />
              Imprimir Expediente
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => exportToPdf(currentPayload)}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-white bg-electric-600 hover:bg-electric-700 rounded-lg"
              >
                <FileText className="w-4 h-4" />
                PDF Tabla Actual
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
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg"
              >
                <Printer className="w-4 h-4" />
                Imprimir
              </button>
            </>
          )}
        </div>
      </div>

      {exportFeedback && (
        <div className="no-print bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{exportFeedback}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="no-print lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 h-fit overflow-hidden transition-colors">
          {REPORT_CATALOG.map((rep) => (
            <button
              key={rep.id}
              type="button"
              onClick={() => setReportType(rep.id)}
              className={`w-full text-left p-3.5 transition-colors ${
                reportType === rep.id
                  ? 'bg-blue-50/70 dark:bg-blue-950/40'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <p className="font-display font-semibold text-sm text-slate-900 dark:text-white">
                {rep.title}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{rep.desc}</p>
            </button>
          ))}
        </div>

        <div className="lg:col-span-8 print:col-span-12 space-y-4">
          <div className="no-print bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4 transition-colors">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Torneo
                </label>
                <select
                  value={activeTournament?.id || ''}
                  onChange={(e) => {
                    setTournamentId(e.target.value);
                    setCategoryId('');
                    setMatchId('');
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  {tournaments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Categoría
                </label>
                <select
                  value={activeCategory?.id || ''}
                  onChange={(e) => {
                    setCategoryId(e.target.value);
                    setMatchId('');
                  }}
                  disabled={reportType === 'archivo_oficial' && archiveScope === 'tournament'}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-50"
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
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Equipo
                  </label>
                  <select
                    value={activeTeam?.id || ''}
                    onChange={(e) => setTeamId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
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
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Partido
                  </label>
                  <select
                    value={selectedSingleMatch?.id || ''}
                    onChange={(e) => setMatchId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    {filteredMatchesForScope.map((m) => (
                      <option key={m.id} value={m.id}>
                        #{m.matchNumber} (J{m.roundNumber}) {teamMap.get(m.homeTeamId)?.shortCode || m.homeTeamId} vs{' '}
                        {teamMap.get(m.awayTeamId)?.shortCode || m.awayTeamId}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {reportType === 'archivo_oficial' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Alcance del Archivo
                  </label>
                  <select
                    value={archiveScope}
                    onChange={(e) => setArchiveScope(e.target.value as ArchiveScope)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    <option value="category">Categoría seleccionada</option>
                    <option value="tournament">Todo el torneo</option>
                  </select>
                </div>
              )}
            </div>

            {reportType === 'archivo_oficial' && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Actas de juego a incluir en el PDF
                    </label>
                    <select
                      value={archiveMatchFilter}
                      onChange={(e) => setArchiveMatchFilter(e.target.value as ArchiveMatchFilter)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    >
                      <option value="with_result_or_finished">
                        Partidos finalizados / con acta capturada
                      </option>
                      <option value="approved_only">Solo actas aprobadas oficialmente</option>
                      <option value="all_matches">Todos los partidos programados</option>
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-start sm:justify-end">
                    <button
                      type="button"
                      disabled={exportingArchive}
                      onClick={handleExportOfficialArchivePdf}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
                    >
                      {exportingArchive ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <FileText className="w-4 h-4" />
                      )}
                      {exportingArchive ? 'Generando PDF...' : 'Descargar Archivo Oficial PDF'}
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Secciones incluidas en el expediente imprimible:
                  </p>
                  <div className="flex flex-wrap gap-3 text-xs">
                    {[
                      {
                        label: 'Tabla de Posiciones',
                        checked: includeStandings,
                        toggle: setIncludeStandings,
                      },
                      {
                        label: 'Estadísticas Colectivas',
                        checked: includeTeamStats,
                        toggle: setIncludeTeamStats,
                      },
                      {
                        label: 'Tabla de Goleadores',
                        checked: includeTopScorers,
                        toggle: setIncludeTopScorers,
                      },
                      {
                        label: 'Estadísticas Individuales',
                        checked: includePlayerStats,
                        toggle: setIncludePlayerStats,
                      },
                      {
                        label: `Actas de Juego (${archiveData.matchSheets.length})`,
                        checked: includeMatchSheets,
                        toggle: setIncludeMatchSheets,
                      },
                    ].map((opt) => (
                      <label
                        key={opt.label}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={opt.checked}
                          onChange={(e) => opt.toggle(e.target.checked)}
                          className="rounded border-slate-300 text-electric-600 focus:ring-electric-500"
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Live Print / Report Preview */}
          {reportType === 'archivo_oficial' ? (
            <div className="space-y-4">
              {/* Executive Dossier Header & Summary */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden transition-colors print:border-slate-300">
                <div className="px-5 py-4 bg-navy-900 dark:bg-slate-950 text-white flex items-center justify-between gap-4 border-b border-transparent dark:border-slate-800">
                  <div className="flex items-center gap-3 min-w-0">
                    {orgLogoUrl && (
                      <div className="w-11 h-11 rounded-lg bg-white p-1 flex items-center justify-center shrink-0 overflow-hidden">
                        <img
                          src={orgLogoUrl}
                          alt={orgName}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs text-blue-300 truncate">{orgName}</p>
                      <h2 className="font-display font-bold text-base mt-0.5 truncate">
                        Expediente de Archivo Oficial — {activeTournament?.name || 'Torneo'}
                      </h2>
                      <p className="text-xs text-slate-300 truncate">
                        {archiveScope === 'category' && activeCategory
                          ? `Categoría: ${activeCategory.name}`
                          : 'Todas las categorías'}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-slate-300 shrink-0">
                    {new Date().toLocaleDateString('es-MX')}
                  </span>
                </div>

                <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                  <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Equipos
                    </p>
                    <p className="text-lg font-display font-bold text-navy-900 dark:text-white mt-0.5 tabular-nums">
                      {archiveData.scopedTeamsCount}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Partidos Prog.
                    </p>
                    <p className="text-lg font-display font-bold text-navy-900 dark:text-white mt-0.5 tabular-nums">
                      {archiveData.scopedMatchesCount}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Actas en Archivo
                    </p>
                    <p className="text-lg font-display font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 tabular-nums">
                      {includeMatchSheets ? archiveData.matchSheets.length : 0}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Goles Totales
                    </p>
                    <p className="text-lg font-display font-bold text-navy-900 dark:text-white mt-0.5 tabular-nums">
                      {archiveData.totalGoals}
                    </p>
                  </div>
                </div>

                {/* Stat Sections Preview */}
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {[
                    includeStandings ? archiveData.standingsSection : null,
                    includeTeamStats ? archiveData.teamStatsSection : null,
                    includeTopScorers ? archiveData.topScorersSection : null,
                    includePlayerStats ? archiveData.playerStatsSection : null,
                  ]
                    .filter((sec): sec is OfficialArchiveTableSection => Boolean(sec))
                    .map((sec) => (
                      <div key={sec.title} className="p-4 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-display font-semibold text-sm text-navy-900 dark:text-white">
                            {sec.title}
                          </h3>
                          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            {sec.rows.length} registro(s)
                          </span>
                        </div>
                        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                                {sec.headers.map((h) => (
                                  <th key={h} className="py-2 px-2.5 text-left font-semibold whitespace-nowrap">
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {sec.rows.length === 0 ? (
                                <tr>
                                  <td
                                    colSpan={sec.headers.length}
                                    className="py-5 text-center text-slate-500 dark:text-slate-400"
                                  >
                                    Sin datos registrados en este bloque.
                                  </td>
                                </tr>
                              ) : (
                                sec.rows.map((row, rIdx) => (
                                  <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                    {row.map((cell, cIdx) => (
                                      <td
                                        key={cIdx}
                                        className="py-1.5 px-2.5 font-mono tabular-nums text-slate-800 dark:text-slate-200 whitespace-nowrap"
                                      >
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
                    ))}
                </div>
              </div>

              {/* Match Sheets Index & Printable Preview */}
              {includeMatchSheets && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden transition-colors print:border-slate-300">
                  <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="font-display font-semibold text-sm text-navy-900 dark:text-white">
                      5. Actas de Juego Incluidas en el Archivo PDF
                    </h3>
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      {archiveData.matchSheets.length} acta(s) · 1 página oficial por encuentro
                    </span>
                  </div>

                  {archiveData.matchSheets.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
                      No hay actas que coincidan con el filtro seleccionado ({archiveMatchFilter === 'approved_only' ? 'solo aprobadas' : 'finalizadas / capturadas'}).
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {archiveData.matchSheets.map((item) => {
                        const hScore = item.result?.homeScore ?? item.match.homeScore ?? 0;
                        const aScore = item.result?.awayScore ?? item.match.awayScore ?? 0;
                        const hasPen =
                          hScore === aScore &&
                          item.result?.penaltyHomeScore !== undefined &&
                          item.result?.penaltyAwayScore !== undefined;
                        return (
                          <div
                            key={item.match.id}
                            className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
                                <span className="font-semibold text-navy-900 dark:text-white">
                                  Partido #{item.match.matchNumber}
                                </span>
                                <span>· J{item.match.roundNumber}</span>
                                <span>· {item.categoryName}</span>
                                <span>
                                  · {item.match.date} {item.match.time}
                                </span>
                              </div>
                              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                {item.homeTeamName}{' '}
                                <span className="font-mono text-electric-600 dark:text-blue-400 mx-1">
                                  {item.match.status === 'Finalizado' || item.result
                                    ? `${hScore} - ${aScore}`
                                    : 'vs'}
                                </span>{' '}
                                {item.awayTeamName}
                                {hasPen && (
                                  <span className="ml-2 text-xs font-mono text-amber-600 dark:text-amber-400">
                                    (Pen. {item.result?.penaltyHomeScore}-{item.result?.penaltyAwayScore})
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                Cancha: {item.fieldName} · Árbitro: {item.refereeName} · Incidencias:{' '}
                                {item.events.length}
                              </p>
                            </div>
                            <span
                              className={`px-2.5 py-1 rounded-md text-xs font-medium shrink-0 self-start sm:self-center ${
                                item.result?.validationStatus === 'aprobado'
                                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {item.result?.validationStatus
                                ? item.result.validationStatus.toUpperCase()
                                : item.match.status.toUpperCase()}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : reportType === 'actas_partidos' ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden transition-colors print:border-slate-300">
              <div className="px-5 py-4 bg-navy-900 dark:bg-slate-950 text-white flex items-center justify-between gap-4 border-b border-transparent dark:border-slate-800">
                <div className="flex items-center gap-3 min-w-0">
                  {orgLogoUrl && (
                    <div className="w-10 h-10 rounded-lg bg-white p-1 flex items-center justify-center shrink-0 overflow-hidden">
                      <img src={orgLogoUrl} alt={orgName} className="w-full h-full object-contain" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs text-blue-300 truncate">{orgName}</p>
                    <h2 className="font-display font-bold text-base mt-0.5 truncate">
                      {selectedSingleMatch
                        ? `Acta Digital Oficial — Partido #${selectedSingleMatch.matchNumber}`
                        : 'Acta Digital Oficial'}
                    </h2>
                  </div>
                </div>
                {selectedSingleMatch && (
                  <span className="text-xs font-mono text-emerald-300 uppercase shrink-0">
                    {singleMatchResult?.validationStatus || selectedSingleMatch.status}
                  </span>
                )}
              </div>

              {!selectedSingleMatch ? (
                <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No hay partidos registrados para los filtros seleccionados.
                </div>
              ) : (
                <div className="p-5 space-y-5">
                  {/* Match Scoreboard */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4 grid grid-cols-3 items-center gap-3 text-center">
                    <div className="flex flex-col items-center gap-1.5">
                      <TeamCrest
                        name={teamMap.get(selectedSingleMatch.homeTeamId)?.name || 'Local'}
                        shortCode={teamMap.get(selectedSingleMatch.homeTeamId)?.shortCode || 'LOC'}
                        primaryColor={teamMap.get(selectedSingleMatch.homeTeamId)?.primaryColor}
                        crestUrl={teamMap.get(selectedSingleMatch.homeTeamId)?.crestUrl}
                        size="md"
                      />
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                        {teamMap.get(selectedSingleMatch.homeTeamId)?.name ||
                          selectedSingleMatch.homeTeamId}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="text-2xl font-mono font-bold text-navy-900 dark:text-white tabular-nums">
                        {singleMatchResult?.homeScore ?? selectedSingleMatch.homeScore ?? 0} -{' '}
                        {singleMatchResult?.awayScore ?? selectedSingleMatch.awayScore ?? 0}
                      </div>
                      {(singleMatchResult?.homeScore ?? selectedSingleMatch.homeScore ?? 0) ===
                        (singleMatchResult?.awayScore ?? selectedSingleMatch.awayScore ?? 0) &&
                        singleMatchResult?.penaltyHomeScore !== undefined &&
                        singleMatchResult?.penaltyAwayScore !== undefined && (
                          <p className="text-xs font-mono text-amber-700 dark:text-amber-300">
                            Penales: {singleMatchResult.penaltyHomeScore} -{' '}
                            {singleMatchResult.penaltyAwayScore}
                          </p>
                        )}
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        J{selectedSingleMatch.roundNumber} · {selectedSingleMatch.date}{' '}
                        {selectedSingleMatch.time}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {selectedSingleMatch.fieldId
                          ? fieldMap.get(selectedSingleMatch.fieldId)?.name || '-'
                          : '-'}{' '}
                        · Árbitro:{' '}
                        {selectedSingleMatch.refereeId
                          ? refMap.get(selectedSingleMatch.refereeId)?.fullName || '-'
                          : '-'}
                      </p>
                    </div>

                    <div className="flex flex-col items-center gap-1.5">
                      <TeamCrest
                        name={teamMap.get(selectedSingleMatch.awayTeamId)?.name || 'Visitante'}
                        shortCode={teamMap.get(selectedSingleMatch.awayTeamId)?.shortCode || 'VIS'}
                        primaryColor={teamMap.get(selectedSingleMatch.awayTeamId)?.primaryColor}
                        crestUrl={teamMap.get(selectedSingleMatch.awayTeamId)?.crestUrl}
                        size="md"
                      />
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                        {teamMap.get(selectedSingleMatch.awayTeamId)?.name ||
                          selectedSingleMatch.awayTeamId}
                      </span>
                    </div>
                  </div>

                  {/* Period Scores */}
                  {singleMatchResult?.periodScores && singleMatchResult.periodScores.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                        Marcador por Periodo
                      </h3>
                      <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                              <th className="py-2 px-3 text-left">Periodo</th>
                              <th className="py-2 px-3 text-left">
                                {teamMap.get(selectedSingleMatch.homeTeamId)?.name || 'Local'}
                              </th>
                              <th className="py-2 px-3 text-left">
                                {teamMap.get(selectedSingleMatch.awayTeamId)?.name || 'Visitante'}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {singleMatchResult.periodScores.map((ps) => (
                              <tr key={ps.period}>
                                <td className="py-2 px-3 font-medium">{ps.period}</td>
                                <td className="py-2 px-3 font-mono">{ps.home}</td>
                                <td className="py-2 px-3 font-mono">{ps.away}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Match Events */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                      Incidencias Registradas ({singleMatchEvents.length})
                    </h3>
                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                            <th className="py-2 px-3 text-left">Min</th>
                            <th className="py-2 px-3 text-left">Evento</th>
                            <th className="py-2 px-3 text-left">Equipo</th>
                            <th className="py-2 px-3 text-left">Jugador</th>
                            <th className="py-2 px-3 text-left">Detalle</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {singleMatchEvents.length === 0 ? (
                            <tr>
                              <td
                                colSpan={5}
                                className="py-5 text-center text-slate-500 dark:text-slate-400"
                              >
                                Sin incidencias registradas en este encuentro.
                              </td>
                            </tr>
                          ) : (
                            singleMatchEvents.map((ev) => {
                              const pl = playerMap.get(ev.playerId);
                              return (
                                <tr key={ev.id}>
                                  <td className="py-2 px-3 font-mono">{ev.minute}&apos;</td>
                                  <td className="py-2 px-3 font-medium">
                                    {EVENT_TYPE_LABELS[ev.eventType] || ev.eventType}
                                  </td>
                                  <td className="py-2 px-3">
                                    {teamMap.get(ev.teamId)?.name || ev.teamId}
                                  </td>
                                  <td className="py-2 px-3">
                                    {pl ? `#${pl.jerseyNumber} ${pl.fullName}` : ev.playerId}
                                  </td>
                                  <td className="py-2 px-3 text-slate-500 dark:text-slate-400">
                                    {ev.goalType ||
                                      (ev.isStarter
                                        ? 'Titular'
                                        : ev.minutesPlayed
                                          ? `${ev.minutesPlayed} min`
                                          : '-')}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {singleMatchResult?.observations && (
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs">
                      <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">
                        Observaciones del Árbitro
                      </p>
                      <p className="text-slate-600 dark:text-slate-300">
                        {singleMatchResult.observations}
                      </p>
                    </div>
                  )}

                  {/* Signature Lines */}
                  <div className="pt-6 grid grid-cols-3 gap-6 text-center text-[11px] text-slate-600 dark:text-slate-400">
                    <div className="border-t border-slate-300 dark:border-slate-700 pt-2 font-medium">
                      Árbitro Central
                    </div>
                    <div className="border-t border-slate-300 dark:border-slate-700 pt-2 font-medium">
                      Capitán / Rep. Local
                    </div>
                    <div className="border-t border-slate-300 dark:border-slate-700 pt-2 font-medium">
                      Coordinación / Archivo Oficial
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden transition-colors print:border-slate-300">
              <div className="px-5 py-4 bg-navy-900 dark:bg-slate-950 text-white flex items-center justify-between gap-4 border-b border-transparent dark:border-slate-800">
                <div className="flex items-center gap-3 min-w-0">
                  {orgLogoUrl && (
                    <div className="w-10 h-10 rounded-lg bg-white p-1 flex items-center justify-center shrink-0 overflow-hidden">
                      <img
                        src={orgLogoUrl}
                        alt={orgName}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs text-blue-300 truncate">{orgName}</p>
                    <h2 className="font-display font-bold text-base mt-0.5 truncate">
                      {currentPayload.title}
                    </h2>
                  </div>
                </div>
                <span className="text-xs font-mono text-slate-300 shrink-0">
                  {new Date().toLocaleDateString('es-MX')}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                      {currentPayload.headers.map((h) => (
                        <th key={h} className="py-2.5 px-3 text-left font-semibold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {currentPayload.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={currentPayload.headers.length}
                          className="py-8 text-center text-sm text-slate-500 dark:text-slate-400"
                        >
                          No hay registros disponibles para este reporte con los filtros actuales.
                        </td>
                      </tr>
                    ) : (
                      currentPayload.rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          {row.map((cell, cIdx) => (
                            <td
                              key={cIdx}
                              className="py-2.5 px-3 font-mono text-xs tabular-nums text-slate-800 dark:text-slate-200"
                            >
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
          )}
        </div>
      </div>
    </div>
  );
}
