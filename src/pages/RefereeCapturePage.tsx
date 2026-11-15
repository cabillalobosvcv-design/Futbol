import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardEdit,
  FileDown,
  Flag,
  Lock,
  Minus,
  Play,
  Plus,
  Save,
  Search,
  Send,
  Trash2,
} from 'lucide-react';
import type { PageId } from '../components/Layout';
import { TeamCrest } from '../components/TeamCrest';
import { useAuth } from '../context/AuthContext';
import { useSigdData } from '../context/SigdDataContext';
import { exportMatchSheetPdf } from '../engines/exportEngine';
import { submitMatchSheetForValidation } from '../services/firestoreService';
import {
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  type Match,
  type MatchEvent,
  type MatchEventType,
  type PeriodScore,
} from '../types/sigd';

interface DraftEvent {
  teamId: string;
  playerId: string;
  eventType: MatchEventType;
  goalType?: string;
  minute: number;
  assistPlayerId?: string;
  subOutPlayerId?: string;
  isStarter?: boolean;
  minutesPlayed?: number;
}

const EVENT_LABELS: Record<MatchEventType, string> = {
  gol: 'Gol',
  penal: 'Gol de Penal',
  autogol: 'Autogol',
  asistencia: 'Asistencia',
  amarilla: 'Tarjeta Amarilla',
  roja: 'Tarjeta Roja',
  sustitucion: 'Sustitución',
  participacion: 'Participación / Minutos',
};

interface RefereeCapturePageProps {
  initialMatchId?: string;
  onNavigate?: (page: PageId) => void;
}

export function RefereeCapturePage({ initialMatchId, onNavigate }: RefereeCapturePageProps = {}) {
  const { profile, role } = useAuth();
  const {
    organizations,
    tournaments,
    categories,
    teams,
    players,
    fields,
    referees,
    matches,
    matchResults,
    matchEvents,
  } = useSigdData();

  const canSubmit = ROLE_PERMISSIONS.canSubmitMatchSheet(role);

  // Match referee record linked to current authenticated user
  const myRefereeIds = useMemo(() => {
    if (!profile) return new Set<string>();
    const ids = new Set<string>();
    if (profile.refereeId) ids.add(profile.refereeId);
    const normalizedName = profile.displayName.trim().toLowerCase();
    referees.forEach((r) => {
      if (
        r.userUid === profile.uid ||
        (normalizedName && r.fullName.trim().toLowerCase() === normalizedName)
      ) {
        ids.add(r.id);
      }
    });
    return ids;
  }, [profile, referees]);

  const hasAssignedMatches = useMemo(
    () => matches.some((m) => m.refereeId && myRefereeIds.has(m.refereeId)),
    [matches, myRefereeIds]
  );

  const [scopeTab, setScopeTab] = useState<'assigned' | 'all'>('all');
  const [scopeInitialized, setScopeInitialized] = useState(false);
  const [filterTournamentId, setFilterTournamentId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedMatchId, setSelectedMatchId] = useState<string>('');

  // Form states
  const [homeScore, setHomeScore] = useState<number>(0);
  const [awayScore, setAwayScore] = useState<number>(0);
  const [periodScores, setPeriodScores] = useState<PeriodScore[]>([
    { period: '1er Tiempo', home: 0, away: 0 },
    { period: '2do Tiempo', home: 0, away: 0 },
  ]);
  const [observations, setObservations] = useState<string>('');
  const [draftEvents, setDraftEvents] = useState<DraftEvent[]>([]);

  // New event capture states
  const [evTeamId, setEvTeamId] = useState<string>('');
  const [evPlayerId, setEvPlayerId] = useState<string>('');
  const [evType, setEvType] = useState<MatchEventType>('gol');
  const [evGoalType, setEvGoalType] = useState<string>('Normal');
  const [evMinute, setEvMinute] = useState<number>(15);
  const [evAssistId, setEvAssistId] = useState<string>('');
  const [evSubOutId, setEvSubOutId] = useState<string>('');
  const [evStarter, setEvStarter] = useState<boolean>(true);
  const [evMinPlayed, setEvMinPlayed] = useState<number>(90);

  const [busyMode, setBusyMode] = useState<'en_juego' | 'borrador' | 'pendiente' | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!scopeInitialized && matches.length > 0) {
      if (initialMatchId) {
        const target = matches.find((m) => m.id === initialMatchId);
        if (target) {
          setSelectedMatchId(target.id);
          setScopeTab(
            target.refereeId && myRefereeIds.has(target.refereeId) ? 'assigned' : 'all'
          );
          setScopeInitialized(true);
          return;
        }
      }
      if (role === 'arbitro' && hasAssignedMatches) {
        setScopeTab('assigned');
      }
      setScopeInitialized(true);
    }
  }, [scopeInitialized, matches, role, hasAssignedMatches, initialMatchId, myRefereeIds]);

  useEffect(() => {
    if (initialMatchId) {
      const target = matches.find((m) => m.id === initialMatchId);
      if (target) {
        setSelectedMatchId(target.id);
        setScopeTab(
          target.refereeId && myRefereeIds.has(target.refereeId) ? 'assigned' : 'all'
        );
      }
    }
  }, [initialMatchId, matches, myRefereeIds]);

  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const fieldMap = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);
  const refMap = useMemo(() => new Map(referees.map((r) => [r.id, r])), [referees]);
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const tournamentMap = useMemo(() => new Map(tournaments.map((t) => [t.id, t])), [tournaments]);
  const resultByMatchId = useMemo(
    () => new Map(matchResults.map((r) => [r.matchId, r])),
    [matchResults]
  );

  const filteredMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return matches
      .filter((m) => {
        if (scopeTab === 'assigned') {
          if (!m.refereeId || !myRefereeIds.has(m.refereeId)) return false;
        }
        if (filterTournamentId !== 'all' && m.tournamentId !== filterTournamentId) {
          return false;
        }
        const res = resultByMatchId.get(m.id);
        if (filterStatus === 'rechazado') {
          if (res?.validationStatus !== 'rechazado') return false;
        } else if (filterStatus !== 'all' && m.status !== filterStatus) {
          return false;
        }
        if (q) {
          const homeName = teamMap.get(m.homeTeamId)?.name || m.homeTeamId;
          const awayName = teamMap.get(m.awayTeamId)?.name || m.awayTeamId;
          const haystack = `#${m.matchNumber} ${homeName} ${awayName} ${m.date}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => a.matchNumber - b.matchNumber);
  }, [
    matches,
    scopeTab,
    myRefereeIds,
    filterTournamentId,
    filterStatus,
    searchQuery,
    resultByMatchId,
    teamMap,
  ]);

  const activeMatch: Match | undefined =
    filteredMatches.find((m) => m.id === selectedMatchId) || filteredMatches[0];

  const existingResult = useMemo(
    () => (activeMatch ? resultByMatchId.get(activeMatch.id) : undefined),
    [activeMatch, resultByMatchId]
  );

  const existingMatchEvents = useMemo(
    () => (activeMatch ? matchEvents.filter((e) => e.matchId === activeMatch.id) : []),
    [matchEvents, activeMatch]
  );

  // Sync form state whenever selected activeMatch changes
  useEffect(() => {
    if (!activeMatch) return;
    setSelectedMatchId(activeMatch.id);
    const res = resultByMatchId.get(activeMatch.id);
    const evs = matchEvents.filter((e) => e.matchId === activeMatch.id);
    setHomeScore(res?.homeScore ?? activeMatch.homeScore ?? 0);
    setAwayScore(res?.awayScore ?? activeMatch.awayScore ?? 0);
    setPeriodScores(
      res?.periodScores && res.periodScores.length > 0
        ? res.periodScores
        : [
            { period: '1er Tiempo', home: 0, away: 0 },
            { period: '2do Tiempo', home: 0, away: 0 },
          ]
    );
    setObservations(res?.observations || '');
    setDraftEvents(
      evs.map((e) => ({
        teamId: e.teamId,
        playerId: e.playerId,
        eventType: e.eventType,
        goalType: e.goalType,
        minute: e.minute,
        assistPlayerId: e.assistPlayerId,
        subOutPlayerId: e.subOutPlayerId,
        isStarter: e.isStarter,
        minutesPlayed: e.minutesPlayed,
      }))
    );
    setEvTeamId(activeMatch.homeTeamId);
    setEvPlayerId('');
    setEvAssistId('');
    setEvSubOutId('');
  }, [activeMatch?.id]);

  const matchTeamPlayers = useMemo(() => {
    const tid = evTeamId || activeMatch?.homeTeamId;
    return players.filter((p) => p.teamId === tid && p.active);
  }, [players, evTeamId, activeMatch?.homeTeamId]);

  const isLockedForReferee =
    role === 'arbitro' &&
    (existingResult?.validationStatus === 'aprobado' || activeMatch?.status === 'Finalizado');

  const isEditable = canSubmit && !isLockedForReferee;

  const eventSummaryCounts = useMemo(() => {
    let goals = 0;
    let yellows = 0;
    let reds = 0;
    let subs = 0;
    draftEvents.forEach((ev) => {
      if (ev.eventType === 'gol' || ev.eventType === 'penal' || ev.eventType === 'autogol') {
        goals += 1;
      } else if (ev.eventType === 'amarilla') {
        yellows += 1;
      } else if (ev.eventType === 'roja') {
        reds += 1;
      } else if (ev.eventType === 'sustitucion') {
        subs += 1;
      }
    });
    return { goals, yellows, reds, subs };
  }, [draftEvents]);

  const handleAddEvent = () => {
    if (!activeMatch || !isEditable) return;
    setErrorMsg(null);
    const tid = evTeamId || activeMatch.homeTeamId;
    const pid = evPlayerId || matchTeamPlayers[0]?.id;
    if (!pid) {
      setErrorMsg('Este equipo no tiene jugadores activos registrados para asociar incidencias.');
      return;
    }
    const cleanMin = Math.max(0, Math.min(150, Number(evMinute) || 0));
    setDraftEvents((prev) => [
      ...prev,
      {
        teamId: tid,
        playerId: pid,
        eventType: evType,
        goalType:
          evType === 'gol' || evType === 'penal' || evType === 'autogol'
            ? evGoalType
            : undefined,
        minute: cleanMin,
        assistPlayerId:
          (evType === 'gol' || evType === 'penal') && evAssistId ? evAssistId : undefined,
        subOutPlayerId:
          evType === 'sustitucion' && evSubOutId ? evSubOutId : undefined,
        isStarter: evType === 'participacion' ? evStarter : undefined,
        minutesPlayed:
          evType === 'participacion'
            ? Math.max(0, Math.min(150, Number(evMinPlayed) || 0))
            : undefined,
      },
    ]);
    setEvAssistId('');
    setEvSubOutId('');
  };

  const handleAddExtraPeriod = () => {
    if (!isEditable || periodScores.length >= 10) return;
    const label =
      periodScores.length === 2
        ? 'Tiempo Extra'
        : periodScores.length === 3
          ? 'Tanda de Penales'
          : `Periodo ${periodScores.length + 1}`;
    setPeriodScores((prev) => [...prev, { period: label, home: 0, away: 0 }]);
  };

  const handlePersistToDatabase = async (mode: 'en_juego' | 'borrador' | 'pendiente') => {
    if (!profile || !activeMatch || !isEditable) return;
    setBusyMode(mode);
    setFeedback(null);
    setErrorMsg(null);

    try {
      const payloadEvents: Omit<MatchEvent, 'id' | 'createdAt'>[] = draftEvents.map((ev) => ({
        matchId: activeMatch.id,
        tournamentId: activeMatch.tournamentId,
        categoryId: activeMatch.categoryId,
        teamId: ev.teamId,
        playerId: ev.playerId,
        eventType: ev.eventType,
        goalType: ev.goalType,
        minute: ev.minute,
        assistPlayerId: ev.assistPlayerId,
        subOutPlayerId: ev.subOutPlayerId,
        isStarter: ev.isStarter,
        minutesPlayed: ev.minutesPlayed,
      }));

      await submitMatchSheetForValidation({
        match: activeMatch,
        existingResult,
        homeScore: Math.max(0, Math.min(99, Number(homeScore) || 0)),
        awayScore: Math.max(0, Math.min(99, Number(awayScore) || 0)),
        periodScores,
        observations,
        events: payloadEvents,
        mode,
        actorUid: profile.uid,
        actorName: profile.displayName,
      });

      if (mode === 'en_juego') {
        setFeedback(
          `Marcador en vivo del partido #${activeMatch.matchNumber} guardado directamente en Firestore (En juego).`
        );
      } else if (mode === 'borrador') {
        setFeedback(
          `Borrador del acta #${activeMatch.matchNumber} e incidencias guardados directamente en la base de datos.`
        );
      } else {
        setFeedback(
          `Acta final del partido #${activeMatch.matchNumber} guardada en Firestore y enviada a validación oficial.`
        );
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : '';
      setErrorMsg(
        detail.includes('permission') || detail.includes('PERMISSION_DENIED')
          ? 'No tienes permisos suficientes en Firestore para modificar este encuentro. Verifica que tu cuenta tenga rol de Árbitro activo.'
          : 'No se pudo guardar la información en la base de datos. Revisa tu conexión e intenta nuevamente.'
      );
    } finally {
      setBusyMode(null);
    }
  };

  const handleDownloadActaPdf = () => {
    if (!activeMatch) return;
    const playerNames: Record<string, string> = {};
    players.forEach((p) => {
      playerNames[p.id] = `#${p.jerseyNumber} ${p.fullName}`;
    });
    const teamNames: Record<string, string> = {};
    teams.forEach((t) => {
      teamNames[t.id] = t.name;
    });

    void exportMatchSheetPdf({
      match: activeMatch,
      result: existingResult,
      events: existingMatchEvents,
      tournamentName: tournamentMap.get(activeMatch.tournamentId)?.name || 'Torneo',
      categoryName: catMap.get(activeMatch.categoryId)?.name || 'Categoría',
      homeTeamName: teamNames[activeMatch.homeTeamId] || activeMatch.homeTeamId,
      awayTeamName: teamNames[activeMatch.awayTeamId] || activeMatch.awayTeamId,
      fieldName: activeMatch.fieldId ? fieldMap.get(activeMatch.fieldId)?.name || 'N/A' : 'N/A',
      refereeName: activeMatch.refereeId
        ? refMap.get(activeMatch.refereeId)?.fullName || 'N/A'
        : profile?.displayName || 'N/A',
      playerNames,
      teamNames,
      organizationName: organizations[0]?.name || 'SIGD — Sistema Integral de Gestión Deportiva',
      organizationLogoUrl: organizations[0]?.logoUrl || '',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-colors">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <Flag className="w-3.5 h-3.5 shrink-0" />
            <span>Módulo Arbitral · {ROLE_LABELS[role]}</span>
          </div>
          <h1 className="text-xl font-display font-bold text-navy-900 dark:text-white mt-1">
            Captura Arbitral de Resultados e Incidencias
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            Registra el marcador en vivo, goles por periodo, tarjetas, sustituciones y observaciones directamente en Firestore.
          </p>
        </div>

        {/* Assigned vs All segmented filter + quick link to assignment */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onNavigate && ROLE_PERMISSIONS.canManageFacilitiesAndReferees(role) && (
            <button
              type="button"
              onClick={() => onNavigate('referee_assignments')}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
            >
              Asignar Juegos a Árbitros
            </button>
          )}
          <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setScopeTab('assigned')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                scopeTab === 'assigned'
                  ? 'bg-white dark:bg-slate-900 text-navy-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Mis Asignados
            </button>
            <button
              type="button"
              onClick={() => setScopeTab('all')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                scopeTab === 'all'
                  ? 'bg-white dark:bg-slate-900 text-navy-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Todos los Partidos ({matches.length})
            </button>
          </div>
        </div>
      </div>

      {!canSubmit && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            Tu cuenta actual tiene rol {ROLE_LABELS[role]}. Solo usuarios con permisos de Árbitro, Coordinador o Administrador pueden guardar actas en la base de datos.
          </span>
        </div>
      )}

      {feedback && (
        <div className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Match List & Filters */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden h-fit transition-colors">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
                Encuentros ({filteredMatches.length})
              </h2>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por equipo o # partido..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={filterTournamentId}
                onChange={(e) => setFilterTournamentId(e.target.value)}
                aria-label="Filtrar por torneo"
                className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="all">Todos los torneos</option>
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                aria-label="Filtrar por estado"
                className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="all">Todos los estados</option>
                <option value="Programado">Programado</option>
                <option value="En juego">En juego</option>
                <option value="Pendiente de validación">Pendiente de validación</option>
                <option value="rechazado">Devuelto / Rechazado</option>
                <option value="Finalizado">Finalizado</option>
              </select>
            </div>
          </div>

          <div className="max-h-[640px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {filteredMatches.length === 0 ? (
              <div className="p-6 text-center space-y-2">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {scopeTab === 'assigned'
                    ? 'No tienes partidos asignados directamente'
                    : 'No hay partidos que coincidan con el filtro'}
                </p>
                {scopeTab === 'assigned' && matches.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setScopeTab('all')}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-navy-900 dark:bg-electric-500 text-white hover:bg-navy-800 dark:hover:bg-electric-600 transition-colors"
                  >
                    Ver todos los partidos ({matches.length})
                  </button>
                )}
              </div>
            ) : (
              filteredMatches.map((m) => {
                const isSelected = m.id === activeMatch?.id;
                const res = resultByMatchId.get(m.id);
                const homeTeam = teamMap.get(m.homeTeamId);
                const awayTeam = teamMap.get(m.awayTeamId);
                const isRejected = res?.validationStatus === 'rechazado';

                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setSelectedMatchId(m.id);
                      setFeedback(null);
                      setErrorMsg(null);
                    }}
                    className={`w-full text-left p-3.5 transition-colors ${
                      isSelected
                        ? 'bg-blue-50/70 dark:bg-blue-950/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono tabular-nums">
                        #{m.matchNumber} · J{m.roundNumber}
                      </span>
                      <span
                        className={`font-medium ${
                          isRejected
                            ? 'text-rose-700 dark:text-rose-400'
                            : m.status === 'En juego'
                              ? 'text-electric-600 dark:text-blue-400'
                              : m.status === 'Pendiente de validación'
                                ? 'text-amber-700 dark:text-amber-400'
                                : m.status === 'Finalizado'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {isRejected ? 'Por corregir' : m.status}
                      </span>
                    </div>

                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1 truncate">
                      {homeTeam?.name || m.homeTeamId} vs {awayTeam?.name || m.awayTeamId}
                    </p>

                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mt-1">
                      <span className="font-mono tabular-nums">
                        {m.date} · {m.time}
                      </span>
                      {res ? (
                        <span className="font-mono font-bold text-navy-900 dark:text-blue-400 tabular-nums">
                          {res.homeScore} - {res.awayScore} ({res.validationStatus})
                        </span>
                      ) : m.homeScore !== undefined && m.awayScore !== undefined ? (
                        <span className="font-mono font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                          {m.homeScore} - {m.awayScore}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Match Capture Sheet */}
        <div className="lg:col-span-8">
          {!activeMatch ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              Selecciona un encuentro de la lista para capturar marcador, goles e incidencias arbitrales.
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-6 transition-colors">
              {/* Match Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div className="min-w-0">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Partido #{activeMatch.matchNumber} ·{' '}
                    {tournamentMap.get(activeMatch.tournamentId)?.name || 'Torneo'} ·{' '}
                    {catMap.get(activeMatch.categoryId)?.name || 'Categoría'}
                  </p>
                  <h2 className="font-display font-bold text-lg text-navy-900 dark:text-white mt-0.5">
                    {teamMap.get(activeMatch.homeTeamId)?.name || activeMatch.homeTeamId} vs{' '}
                    {teamMap.get(activeMatch.awayTeamId)?.name || activeMatch.awayTeamId}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
                    {activeMatch.date} {activeMatch.time} · Cancha:{' '}
                    {activeMatch.fieldId ? fieldMap.get(activeMatch.fieldId)?.name : 'Por asignar'}
                    {' · '}Árbitro:{' '}
                    {activeMatch.refereeId ? refMap.get(activeMatch.refereeId)?.fullName : 'Sin asignar'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadActaPdf}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 shrink-0 whitespace-nowrap"
                >
                  <FileDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                  Acta PDF
                </button>
              </div>

              {isLockedForReferee && (
                <div className="bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl px-4 py-3 text-xs flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    Este encuentro ya fue aprobado oficialmente y finalizado. Los resultados oficiales quedan en modo solo lectura para árbitros.
                  </span>
                </div>
              )}

              {existingResult?.validationStatus === 'rechazado' && (
                <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 rounded-xl px-4 py-3 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    Esta acta fue devuelta por coordinación para corrección. Ajusta el marcador o las incidencias y envíala nuevamente a validación.
                  </span>
                </div>
              )}

              {/* Tactile Live Scoreboard */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-4 sm:p-5">
                {/* Home Team Score */}
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2">
                    <TeamCrest
                      name={teamMap.get(activeMatch.homeTeamId)?.name || 'Local'}
                      shortCode={teamMap.get(activeMatch.homeTeamId)?.shortCode || 'LOC'}
                      primaryColor={teamMap.get(activeMatch.homeTeamId)?.primaryColor}
                      crestUrl={teamMap.get(activeMatch.homeTeamId)?.crestUrl}
                      size="sm"
                    />
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[140px]">
                      {teamMap.get(activeMatch.homeTeamId)?.name || 'Local'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!isEditable || homeScore <= 0}
                      onClick={() => setHomeScore((v) => Math.max(0, v - 1))}
                      aria-label="Restar gol local"
                      className="w-9 h-9 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 flex items-center justify-center text-slate-700 dark:text-slate-200"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      disabled={!isEditable}
                      value={homeScore}
                      onChange={(e) => setHomeScore(Math.max(0, Math.min(99, Number(e.target.value) || 0)))}
                      aria-label="Marcador equipo local"
                      className="w-16 text-center py-2 text-2xl font-mono font-bold border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white tabular-nums"
                    />
                    <button
                      type="button"
                      disabled={!isEditable || homeScore >= 99}
                      onClick={() => setHomeScore((v) => Math.min(99, v + 1))}
                      aria-label="Sumar gol local"
                      className="w-9 h-9 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 flex items-center justify-center text-slate-700 dark:text-slate-200"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Center Match Status */}
                <div className="text-center space-y-1">
                  <span className="block text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    MARCADOR OFICIAL
                  </span>
                  <span className="block text-xs font-semibold text-navy-900 dark:text-blue-300">
                    Estado partido: {activeMatch.status}
                  </span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    Acta: {existingResult?.validationStatus || 'sin capturar'}
                  </span>
                </div>

                {/* Away Team Score */}
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2">
                    <TeamCrest
                      name={teamMap.get(activeMatch.awayTeamId)?.name || 'Visitante'}
                      shortCode={teamMap.get(activeMatch.awayTeamId)?.shortCode || 'VIS'}
                      primaryColor={teamMap.get(activeMatch.awayTeamId)?.primaryColor}
                      crestUrl={teamMap.get(activeMatch.awayTeamId)?.crestUrl}
                      size="sm"
                    />
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[140px]">
                      {teamMap.get(activeMatch.awayTeamId)?.name || 'Visitante'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!isEditable || awayScore <= 0}
                      onClick={() => setAwayScore((v) => Math.max(0, v - 1))}
                      aria-label="Restar gol visitante"
                      className="w-9 h-9 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 flex items-center justify-center text-slate-700 dark:text-slate-200"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      disabled={!isEditable}
                      value={awayScore}
                      onChange={(e) => setAwayScore(Math.max(0, Math.min(99, Number(e.target.value) || 0)))}
                      aria-label="Marcador equipo visitante"
                      className="w-16 text-center py-2 text-2xl font-mono font-bold border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white tabular-nums"
                    />
                    <button
                      type="button"
                      disabled={!isEditable || awayScore >= 99}
                      onClick={() => setAwayScore((v) => Math.min(99, v + 1))}
                      aria-label="Sumar gol visitante"
                      className="w-9 h-9 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 flex items-center justify-center text-slate-700 dark:text-slate-200"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Period Scores */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Desglose de Marcador por Periodo
                  </h3>
                  {isEditable && periodScores.length < 10 && (
                    <button
                      type="button"
                      onClick={handleAddExtraPeriod}
                      className="text-xs font-medium text-electric-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Agregar periodo extra
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {periodScores.map((ps, idx) => (
                    <div
                      key={`${ps.period}-${idx}`}
                      className="flex items-center justify-between gap-2 p-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800/40"
                    >
                      <input
                        type="text"
                        disabled={!isEditable}
                        value={ps.period}
                        onChange={(e) => {
                          const next = [...periodScores];
                          next[idx] = { ...ps, period: e.target.value };
                          setPeriodScores(next);
                        }}
                        className="text-xs font-medium text-slate-700 dark:text-slate-300 bg-transparent border-b border-transparent focus:border-slate-300 dark:focus:border-slate-600 focus:outline-none w-32"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={99}
                          disabled={!isEditable}
                          value={ps.home}
                          onChange={(e) => {
                            const next = [...periodScores];
                            next[idx] = { ...ps, home: Math.max(0, Number(e.target.value) || 0) };
                            setPeriodScores(next);
                          }}
                          className="w-14 text-center py-1 text-sm border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                        />
                        <span className="text-slate-400 dark:text-slate-500">-</span>
                        <input
                          type="number"
                          min={0}
                          max={99}
                          disabled={!isEditable}
                          value={ps.away}
                          onChange={(e) => {
                            const next = [...periodScores];
                            next[idx] = { ...ps, away: Math.max(0, Number(e.target.value) || 0) };
                            setPeriodScores(next);
                          }}
                          className="w-14 text-center py-1 text-sm border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Event Capture Section */}
              {isEditable && (
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3 bg-slate-50/60 dark:bg-slate-800/50">
                  <div className="flex items-center gap-2">
                    <ClipboardEdit className="w-4 h-4 text-electric-500" />
                    <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Registrar Goles, Tarjetas, Sustituciones y Participación
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <select
                      value={evTeamId || activeMatch.homeTeamId}
                      onChange={(e) => {
                        setEvTeamId(e.target.value);
                        setEvPlayerId('');
                        setEvAssistId('');
                        setEvSubOutId('');
                      }}
                      className="px-2.5 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    >
                      <option value={activeMatch.homeTeamId}>
                        Local: {teamMap.get(activeMatch.homeTeamId)?.name}
                      </option>
                      <option value={activeMatch.awayTeamId}>
                        Visitante: {teamMap.get(activeMatch.awayTeamId)?.name}
                      </option>
                    </select>

                    <select
                      value={evPlayerId || matchTeamPlayers[0]?.id || ''}
                      onChange={(e) => setEvPlayerId(e.target.value)}
                      className="px-2.5 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    >
                      {matchTeamPlayers.length === 0 ? (
                        <option value="">Sin jugadores activos en plantilla</option>
                      ) : (
                        matchTeamPlayers.map((p) => (
                          <option key={p.id} value={p.id}>
                            #{p.jerseyNumber} {p.fullName} ({p.position})
                          </option>
                        ))
                      )}
                    </select>

                    <select
                      value={evType}
                      onChange={(e) => setEvType(e.target.value as MatchEventType)}
                      className="px-2.5 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    >
                      <option value="gol">Gol</option>
                      <option value="penal">Gol de Penal</option>
                      <option value="autogol">Autogol</option>
                      <option value="asistencia">Asistencia</option>
                      <option value="amarilla">Tarjeta Amarilla</option>
                      <option value="roja">Tarjeta Roja</option>
                      <option value="sustitucion">Sustitución</option>
                      <option value="participacion">Participación / Minutos</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 items-end">
                    <div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
                        Minuto
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={150}
                        value={evMinute}
                        onChange={(e) => setEvMinute(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                      />
                    </div>

                    {(evType === 'gol' || evType === 'penal' || evType === 'autogol') && (
                      <>
                        <div>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
                            Tipo anotación
                          </span>
                          <select
                            value={evGoalType}
                            onChange={(e) => setEvGoalType(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                          >
                            <option value="Normal">Jugada</option>
                            <option value="Cabeza">Cabeza</option>
                            <option value="Tiro Libre">Tiro Libre</option>
                            <option value="Penal">Penal</option>
                            <option value="Autogol">Autogol</option>
                          </select>
                        </div>

                        <div>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
                            Asistencia (opc.)
                          </span>
                          <select
                            value={evAssistId}
                            onChange={(e) => setEvAssistId(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                          >
                            <option value="">Ninguna</option>
                            {matchTeamPlayers.map((p) => (
                              <option key={p.id} value={p.id}>
                                #{p.jerseyNumber} {p.fullName}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}

                    {evType === 'sustitucion' && (
                      <div className="sm:col-span-2">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
                          Jugador que sale (opcional)
                        </span>
                        <select
                          value={evSubOutId}
                          onChange={(e) => setEvSubOutId(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                        >
                          <option value="">Seleccionar jugador saliente</option>
                          {matchTeamPlayers.map((p) => (
                            <option key={p.id} value={p.id}>
                              #{p.jerseyNumber} {p.fullName}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {evType === 'participacion' && (
                      <>
                        <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 pb-1.5">
                          <input
                            type="checkbox"
                            checked={evStarter}
                            onChange={(e) => setEvStarter(e.target.checked)}
                          />
                          Titular
                        </label>
                        <div>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
                            Min. jugados
                          </span>
                          <input
                            type="number"
                            min={0}
                            max={150}
                            value={evMinPlayed}
                            onChange={(e) => setEvMinPlayed(Number(e.target.value))}
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                          />
                        </div>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={handleAddEvent}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-navy-900 dark:bg-electric-500 hover:bg-navy-800 dark:hover:bg-electric-600 rounded-lg transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Agregar incidencia
                    </button>
                  </div>
                </div>
              )}

              {/* Draft Events List + Quick Tallies */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Incidencias en el Acta ({draftEvents.length})
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                    <span>Goles: {eventSummaryCounts.goals}</span>
                    <span>·</span>
                    <span>Amarillas: {eventSummaryCounts.yellows}</span>
                    <span>·</span>
                    <span>Rojas: {eventSummaryCounts.reds}</span>
                    <span>·</span>
                    <span>Cambios: {eventSummaryCounts.subs}</span>
                  </div>
                </div>

                {draftEvents.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                    No hay incidencias individuales capturadas todavía para este encuentro.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
                    {draftEvents.map((ev, i) => {
                      const player = playerMap.get(ev.playerId);
                      const subOut = ev.subOutPlayerId ? playerMap.get(ev.subOutPlayerId) : null;
                      const assist = ev.assistPlayerId ? playerMap.get(ev.assistPlayerId) : null;
                      return (
                        <div
                          key={i}
                          className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <span className="font-mono font-bold text-navy-900 dark:text-blue-400 tabular-nums">
                              {ev.minute}&apos;
                            </span>
                            <span
                              className={`font-semibold ${
                                ev.eventType === 'roja'
                                  ? 'text-rose-700 dark:text-rose-400'
                                  : ev.eventType === 'amarilla'
                                    ? 'text-amber-700 dark:text-amber-300'
                                    : ev.eventType === 'gol' ||
                                        ev.eventType === 'penal' ||
                                        ev.eventType === 'autogol'
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : 'text-electric-600 dark:text-blue-400'
                              }`}
                            >
                              {EVENT_LABELS[ev.eventType]}
                            </span>
                            <span className="text-slate-900 dark:text-slate-100 font-medium">
                              {player ? `#${player.jerseyNumber} ${player.fullName}` : ev.playerId}
                            </span>
                            <span className="text-slate-500 dark:text-slate-400">
                              ({teamMap.get(ev.teamId)?.shortCode || ev.teamId})
                            </span>
                            {assist && (
                              <span className="text-slate-500 dark:text-slate-400">
                                · Asist: #{assist.jerseyNumber} {assist.fullName}
                              </span>
                            )}
                            {subOut && (
                              <span className="text-slate-500 dark:text-slate-400">
                                · Sale: #{subOut.jerseyNumber} {subOut.fullName}
                              </span>
                            )}
                            {ev.goalType && ev.goalType !== 'Normal' && (
                              <span className="text-slate-500 dark:text-slate-400">
                                · {ev.goalType}
                              </span>
                            )}
                          </div>
                          {isEditable && (
                            <button
                              type="button"
                              onClick={() =>
                                setDraftEvents((prev) => prev.filter((_, idx) => idx !== i))
                              }
                              aria-label="Eliminar incidencia"
                              className="text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Referee Observations */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Observaciones y Reporte Arbitral
                </label>
                <textarea
                  rows={3}
                  maxLength={2000}
                  disabled={!isEditable}
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  placeholder="Incidencias disciplinarias, estado de la cancha, puntualidad de equipos, comportamiento del público..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 disabled:opacity-60"
                />
              </div>

              {/* Direct-to-Database Action Bar */}
              {isEditable && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      disabled={busyMode !== null}
                      onClick={() => handlePersistToDatabase('en_juego')}
                      className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-800 dark:text-slate-100 disabled:opacity-50 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5 text-electric-500" />
                      {busyMode === 'en_juego' ? 'Guardando...' : 'Guardar En Vivo'}
                    </button>

                    <button
                      type="button"
                      disabled={busyMode !== null}
                      onClick={() => handlePersistToDatabase('borrador')}
                      className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-800 dark:text-slate-100 disabled:opacity-50 transition-colors"
                    >
                      <Save className="w-3.5 h-3.5 text-navy-900 dark:text-blue-400" />
                      {busyMode === 'borrador' ? 'Guardando...' : 'Guardar Borrador'}
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={busyMode !== null}
                    onClick={() => handlePersistToDatabase('pendiente')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-electric-500 hover:bg-electric-600 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                    {busyMode === 'pendiente'
                      ? 'Enviando a base de datos...'
                      : 'Enviar Acta Final a Validación'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
