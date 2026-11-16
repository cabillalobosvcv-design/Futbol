import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  FileDown,
  History,
  Plus,
  Send,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { exportMatchSheetPdf } from '../engines/exportEngine';
import {
  MATCH_EVENT_STYLE,
  MatchEventIcon,
  MatchStatusIndicator,
} from '../components/SemanticIcons';
import { TeamCrest } from '../components/TeamCrest';
import { useAuth } from '../context/AuthContext';
import { useSigdData } from '../context/SigdDataContext';
import {
  approveOrRejectMatchResult,
  deleteMatchResultActa,
  submitMatchSheetForValidation,
} from '../services/firestoreService';
import {
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
  isStarter?: boolean;
  minutesPlayed?: number;
}

export function MatchResultsPage() {
  const { profile, role } = useAuth();
  const {
    organizations,
    sports,
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

  const [selectedMatchId, setSelectedMatchId] = useState<string>('');
  const [filterTournamentId, setFilterTournamentId] = useState<string>('all');

  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [periodScores, setPeriodScores] = useState<PeriodScore[]>([
    { period: '1er Tiempo', home: 0, away: 0 },
    { period: '2do Tiempo', home: 0, away: 0 },
  ]);
  const [observations, setObservations] = useState('');
  const [draftEvents, setDraftEvents] = useState<DraftEvent[]>([]);

  // New event inputs
  const [evTeamId, setEvTeamId] = useState('');
  const [evPlayerId, setEvPlayerId] = useState('');
  const [evType, setEvType] = useState<MatchEventType>('gol');
  const [evGoalType, setEvGoalType] = useState('Normal');
  const [evMinute, setEvMinute] = useState(15);
  const [evAssistId, setEvAssistId] = useState('');
  const [evStarter, setEvStarter] = useState(true);
  const [evMinPlayed, setEvMinPlayed] = useState(90);
  const [editingEventIndex, setEditingEventIndex] = useState<number | null>(null);
  const [confirmDeleteActa, setConfirmDeleteActa] = useState(false);

  const [correctionReason, setCorrectionReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canSubmit = ROLE_PERMISSIONS.canSubmitMatchSheet(role);
  const canValidate = ROLE_PERMISSIONS.canValidateResults(role);
  const canDeleteActa = role === 'admin_general';

  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const fieldMap = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);
  const refMap = useMemo(() => new Map(referees.map((r) => [r.id, r])), [referees]);
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const tournamentMap = useMemo(() => new Map(tournaments.map((t) => [t.id, t])), [tournaments]);

  const filteredMatches = useMemo(() => {
    return matches
      .filter((m) => (filterTournamentId === 'all' ? true : m.tournamentId === filterTournamentId))
      .sort((a, b) => a.matchNumber - b.matchNumber);
  }, [matches, filterTournamentId]);

  const activeMatch: Match | undefined =
    filteredMatches.find((m) => m.id === selectedMatchId) || filteredMatches[0];

  const existingResult = useMemo(
    () => matchResults.find((r) => r.matchId === activeMatch?.id),
    [matchResults, activeMatch?.id]
  );

  const existingMatchEvents = useMemo(
    () => matchEvents.filter((e) => e.matchId === activeMatch?.id),
    [matchEvents, activeMatch?.id]
  );

  const loadMatchIntoForm = (m: Match) => {
    setSelectedMatchId(m.id);
    const res = matchResults.find((r) => r.matchId === m.id);
    const evs = matchEvents.filter((e) => e.matchId === m.id);
    setHomeScore(res?.homeScore ?? m.homeScore ?? 0);
    setAwayScore(res?.awayScore ?? m.awayScore ?? 0);
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
        isStarter: e.isStarter,
        minutesPlayed: e.minutesPlayed,
      }))
    );
    setEvTeamId(m.homeTeamId);
    setEvPlayerId('');
    setEvAssistId('');
    setEditingEventIndex(null);
    setConfirmDeleteActa(false);
  };

  useEffect(() => {
    if (!activeMatch) return;
    loadMatchIntoForm(activeMatch);
  }, [activeMatch?.id]);

  const matchTeamPlayers = useMemo(() => {
    const tid = evTeamId || activeMatch?.homeTeamId;
    return players.filter((p) => p.teamId === tid);
  }, [players, evTeamId, activeMatch?.homeTeamId]);

  const handleStartEditEvent = (index: number) => {
    const ev = draftEvents[index];
    if (!ev) return;
    setEditingEventIndex(index);
    setEvTeamId(ev.teamId);
    setEvPlayerId(ev.playerId);
    setEvType(ev.eventType);
    setEvGoalType(ev.goalType || 'Normal');
    setEvMinute(ev.minute);
    setEvAssistId(ev.assistPlayerId || '');
    setEvStarter(ev.isStarter ?? true);
    setEvMinPlayed(ev.minutesPlayed ?? 90);
    setErrorMsg(null);
  };

  const handleCancelEditEvent = () => {
    setEditingEventIndex(null);
    setEvPlayerId('');
    setEvAssistId('');
  };

  const handleAddEvent = () => {
    if (!activeMatch) return;
    const tid = evTeamId || activeMatch.homeTeamId;
    const pid = evPlayerId || matchTeamPlayers[0]?.id;
    if (!pid) {
      setFeedback('Registra jugadores en este equipo antes de capturar eventos individuales.');
      return;
    }
    const nextItem: DraftEvent = {
      teamId: tid,
      playerId: pid,
      eventType: evType,
      goalType: evType === 'gol' || evType === 'penal' || evType === 'autogol' ? evGoalType : undefined,
      minute: Number(evMinute),
      assistPlayerId: evAssistId || undefined,
      isStarter: evType === 'participacion' ? evStarter : undefined,
      minutesPlayed: evType === 'participacion' ? Number(evMinPlayed) : undefined,
    };

    if (editingEventIndex !== null) {
      setDraftEvents((prev) =>
        prev.map((item, idx) => (idx === editingEventIndex ? nextItem : item))
      );
      setEditingEventIndex(null);
      setEvAssistId('');
    } else {
      setDraftEvents((prev) => [...prev, nextItem]);
      setEvAssistId('');
    }
  };

  const handleSubmitSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !activeMatch) return;
    setBusy(true);
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
        isStarter: ev.isStarter,
        minutesPlayed: ev.minutesPlayed,
      }));

      await submitMatchSheetForValidation({
        match: activeMatch,
        existingResult,
        homeScore: Number(homeScore),
        awayScore: Number(awayScore),
        periodScores,
        observations,
        events: payloadEvents,
        actorUid: profile.uid,
        actorName: profile.displayName,
      });

      setFeedback('Acta digital enviada a validación oficial.');
    } catch {
      setErrorMsg('No se pudo guardar el acta en Firestore. Verifica tus permisos e intenta nuevamente.');
    } finally {
      setBusy(false);
    }
  };

  const handleValidate = async (approve: boolean) => {
    if (!profile || !activeMatch || !existingResult) return;
    const tournament = tournamentMap.get(activeMatch.tournamentId);
    const sport = sports.find((s) => s.id === tournament?.sportId);
    if (!tournament || !sport) return;

    setBusy(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await approveOrRejectMatchResult({
        approve,
        match: activeMatch,
        result: existingResult,
        correctionReason: correctionReason.trim() || undefined,
        tournament,
        sport,
        teams,
        players,
        allMatches: matches,
        allResults: matchResults,
        allEvents: matchEvents,
        actorUid: profile.uid,
        actorName: profile.displayName,
      });
      setCorrectionReason('');
      setFeedback(
        approve
          ? 'Resultado aprobado oficialmente. Tablas de posiciones y estadísticas recalculadas.'
          : 'Acta devuelta para corrección.'
      );
    } catch {
      setErrorMsg('No se pudo validar el resultado. Verifica tus permisos e intenta nuevamente.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDeleteActa = async () => {
    if (!profile || !canDeleteActa || !activeMatch || !existingResult) return;
    setBusy(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await deleteMatchResultActa({
        match: activeMatch,
        result: existingResult,
        actorUid: profile.uid,
        actorName: profile.displayName,
      });
      setHomeScore(0);
      setAwayScore(0);
      setPeriodScores([
        { period: '1er Tiempo', home: 0, away: 0 },
        { period: '2do Tiempo', home: 0, away: 0 },
      ]);
      setObservations('');
      setDraftEvents([]);
      setEditingEventIndex(null);
      setConfirmDeleteActa(false);
      setFeedback(
        `Acta digital del partido #${activeMatch.matchNumber} eliminada. El encuentro regresó a estado Programado.`
      );
    } catch {
      setErrorMsg('No se pudo eliminar el acta digital. Verifica tus permisos de Administrador General.');
    } finally {
      setBusy(false);
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

    exportMatchSheetPdf({
      match: activeMatch,
      result: existingResult,
      events: existingMatchEvents,
      tournamentName: tournamentMap.get(activeMatch.tournamentId)?.name || 'Torneo',
      categoryName: catMap.get(activeMatch.categoryId)?.name || 'Categoría',
      homeTeamName: teamNames[activeMatch.homeTeamId] || activeMatch.homeTeamId,
      awayTeamName: teamNames[activeMatch.awayTeamId] || activeMatch.awayTeamId,
      homeTeamLogoUrl: teamMap.get(activeMatch.homeTeamId)?.crestUrl || '',
      awayTeamLogoUrl: teamMap.get(activeMatch.awayTeamId)?.crestUrl || '',
      fieldName: activeMatch.fieldId ? fieldMap.get(activeMatch.fieldId)?.name || 'N/A' : 'N/A',
      refereeName: activeMatch.refereeId
        ? refMap.get(activeMatch.refereeId)?.fullName || 'N/A'
        : 'N/A',
      playerNames,
      teamNames,
      organizationName: organizations[0]?.name || 'SIGD — Sistema Integral de Gestión Deportiva',
      organizationLogoUrl: organizations[0]?.logoUrl || '',
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors">
        <div>
          <h1 className="text-xl font-display font-bold text-navy-900 dark:text-white">
            Administración de Partidos, Actas Digitales y Validación
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            Captura marcadores, incidencias individuales y valida resultados oficiales que actualizan tablas y rankings.
          </p>
        </div>
        <select
          value={filterTournamentId}
          onChange={(e) => setFilterTournamentId(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
        >
          <option value="all">Todos los torneos</option>
          {tournaments.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

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
        {/* Match Selector Sidebar */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden h-fit transition-colors">
          <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800">
            <h2 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
              Ficha de Encuentros ({filteredMatches.length})
            </h2>
          </div>
          <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {filteredMatches.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
                No hay partidos programados.
              </div>
            ) : (
              filteredMatches.map((m) => {
                const isSelected = m.id === activeMatch?.id;
                const res = matchResults.find((r) => r.matchId === m.id);
                const homeTeam = teamMap.get(m.homeTeamId);
                const awayTeam = teamMap.get(m.awayTeamId);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => loadMatchIntoForm(m)}
                    className={`w-full text-left p-3.5 transition-colors ${
                      isSelected
                        ? 'bg-blue-50/70 dark:bg-blue-950/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono">
                        #{m.matchNumber} · J{m.roundNumber}
                      </span>
                      <MatchStatusIndicator
                        status={m.status}
                        rejected={res?.validationStatus === 'rechazado'}
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 min-w-0">
                      <TeamCrest
                        name={homeTeam?.name || m.homeTeamId}
                        shortCode={homeTeam?.shortCode || 'LOC'}
                        primaryColor={homeTeam?.primaryColor}
                        secondaryColor={homeTeam?.secondaryColor}
                        crestUrl={homeTeam?.crestUrl}
                        size="sm"
                      />
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {homeTeam?.name || m.homeTeamId} vs {awayTeam?.name || m.awayTeamId}
                      </span>
                      <TeamCrest
                        name={awayTeam?.name || m.awayTeamId}
                        shortCode={awayTeam?.shortCode || 'VIS'}
                        primaryColor={awayTeam?.primaryColor}
                        secondaryColor={awayTeam?.secondaryColor}
                        crestUrl={awayTeam?.crestUrl}
                        size="sm"
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mt-1">
                      <span className="font-mono tabular-nums">
                        {m.date} · {m.time}
                      </span>
                      {res && (
                        <span className="font-mono font-bold text-navy-900 dark:text-blue-400 tabular-nums">
                          {res.homeScore}-{res.awayScore}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Digital Match Sheet Editor */}
        <div className="lg:col-span-8 space-y-6">
          {!activeMatch ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              Selecciona un encuentro de la lista para capturar o validar su acta digital.
            </div>
          ) : (
            <form
              onSubmit={handleSubmitSheet}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-6 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Partido #{activeMatch.matchNumber} ·{' '}
                    {tournamentMap.get(activeMatch.tournamentId)?.name} ·{' '}
                    {catMap.get(activeMatch.categoryId)?.name}
                  </p>
                  <div className="flex items-center gap-2.5 flex-wrap mt-1">
                    <TeamCrest
                      name={teamMap.get(activeMatch.homeTeamId)?.name || activeMatch.homeTeamId}
                      shortCode={teamMap.get(activeMatch.homeTeamId)?.shortCode || 'LOC'}
                      primaryColor={teamMap.get(activeMatch.homeTeamId)?.primaryColor}
                      secondaryColor={teamMap.get(activeMatch.homeTeamId)?.secondaryColor}
                      crestUrl={teamMap.get(activeMatch.homeTeamId)?.crestUrl}
                      size="sm"
                    />
                    <h2 className="font-display font-bold text-lg text-navy-900 dark:text-white">
                      {teamMap.get(activeMatch.homeTeamId)?.name || activeMatch.homeTeamId} vs{' '}
                      {teamMap.get(activeMatch.awayTeamId)?.name || activeMatch.awayTeamId}
                    </h2>
                    <TeamCrest
                      name={teamMap.get(activeMatch.awayTeamId)?.name || activeMatch.awayTeamId}
                      shortCode={teamMap.get(activeMatch.awayTeamId)?.shortCode || 'VIS'}
                      primaryColor={teamMap.get(activeMatch.awayTeamId)?.primaryColor}
                      secondaryColor={teamMap.get(activeMatch.awayTeamId)?.secondaryColor}
                      crestUrl={teamMap.get(activeMatch.awayTeamId)?.crestUrl}
                      size="sm"
                    />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {activeMatch.date} {activeMatch.time} · Cancha:{' '}
                    {activeMatch.fieldId ? fieldMap.get(activeMatch.fieldId)?.name : 'Por asignar'} ·
                    Árbitro:{' '}
                    {activeMatch.refereeId ? refMap.get(activeMatch.refereeId)?.fullName : 'Por asignar'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleDownloadActaPdf}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    <FileDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                    Descargar Acta PDF
                  </button>
                  {canDeleteActa && existingResult && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmDeleteActa(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/60"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Eliminar Acta
                    </button>
                  )}
                </div>
              </div>

              {/* Final Scoreboard */}
              <div className="grid grid-cols-3 gap-4 items-center bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <div className="text-center flex flex-col items-center gap-1.5">
                  <TeamCrest
                    name={teamMap.get(activeMatch.homeTeamId)?.name || activeMatch.homeTeamId}
                    shortCode={teamMap.get(activeMatch.homeTeamId)?.shortCode || 'LOC'}
                    primaryColor={teamMap.get(activeMatch.homeTeamId)?.primaryColor}
                    secondaryColor={teamMap.get(activeMatch.homeTeamId)?.secondaryColor}
                    crestUrl={teamMap.get(activeMatch.homeTeamId)?.crestUrl}
                    size="md"
                  />
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Local ({teamMap.get(activeMatch.homeTeamId)?.shortCode || 'LOC'})
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    disabled={!canSubmit}
                    value={homeScore}
                    onChange={(e) => setHomeScore(Number(e.target.value))}
                    className="w-20 mx-auto text-center py-2 text-2xl font-mono font-bold border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white tabular-nums"
                  />
                </div>
                <div className="text-center text-xs font-mono text-slate-400 dark:text-slate-500">
                  MARCADOR FINAL
                  <span className="block text-[11px] mt-1 text-slate-600 dark:text-slate-300">
                    Validación: {existingResult?.validationStatus || 'sin capturar'}
                  </span>
                </div>
                <div className="text-center flex flex-col items-center gap-1.5">
                  <TeamCrest
                    name={teamMap.get(activeMatch.awayTeamId)?.name || activeMatch.awayTeamId}
                    shortCode={teamMap.get(activeMatch.awayTeamId)?.shortCode || 'VIS'}
                    primaryColor={teamMap.get(activeMatch.awayTeamId)?.primaryColor}
                    secondaryColor={teamMap.get(activeMatch.awayTeamId)?.secondaryColor}
                    crestUrl={teamMap.get(activeMatch.awayTeamId)?.crestUrl}
                    size="md"
                  />
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Visitante ({teamMap.get(activeMatch.awayTeamId)?.shortCode || 'VIS'})
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    disabled={!canSubmit}
                    value={awayScore}
                    onChange={(e) => setAwayScore(Number(e.target.value))}
                    className="w-20 mx-auto text-center py-2 text-2xl font-mono font-bold border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white tabular-nums"
                  />
                </div>
              </div>

              {/* Period Scores */}
              <div>
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Goles por Periodo
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {periodScores.map((ps, idx) => (
                    <div
                      key={ps.period}
                      className="flex items-center justify-between gap-2 p-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800/40"
                    >
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        {ps.period}
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          value={ps.home}
                          disabled={!canSubmit}
                          onChange={(e) => {
                            const next = [...periodScores];
                            next[idx] = { ...ps, home: Number(e.target.value) };
                            setPeriodScores(next);
                          }}
                          className="w-14 text-center py-1 text-sm border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                        />
                        <span className="text-slate-400 dark:text-slate-500">-</span>
                        <input
                          type="number"
                          min={0}
                          value={ps.away}
                          disabled={!canSubmit}
                          onChange={(e) => {
                            const next = [...periodScores];
                            next[idx] = { ...ps, away: Number(e.target.value) };
                            setPeriodScores(next);
                          }}
                          className="w-14 text-center py-1 text-sm border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Individual Match Events Capture */}
              {canSubmit && (
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3 bg-slate-50/60 dark:bg-slate-800/50">
                  <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Capturar Estadísticas e Incidencias Individuales
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <select
                      value={evTeamId || activeMatch.homeTeamId}
                      onChange={(e) => {
                        setEvTeamId(e.target.value);
                        setEvPlayerId('');
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
                        <option value="">Sin jugadores registrados</option>
                      ) : (
                        matchTeamPlayers.map((p) => (
                          <option key={p.id} value={p.id}>
                            #{p.jerseyNumber} {p.fullName} ({p.position})
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(MATCH_EVENT_STYLE) as MatchEventType[]).map((typeKey) => {
                      const style = MATCH_EVENT_STYLE[typeKey];
                      const isSelected = evType === typeKey;
                      return (
                        <button
                          key={typeKey}
                          type="button"
                          onClick={() => setEvType(typeKey)}
                          aria-pressed={isSelected}
                          className={`group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            isSelected
                              ? style.activeBgClass
                              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                          }`}
                        >
                          <MatchEventIcon
                            eventType={typeKey}
                            inheritColor={isSelected}
                            className="w-3.5 h-3.5 transition-transform duration-150 group-hover:scale-115"
                          />
                          <span>{style.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 items-center">
                    <div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                        Minuto
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={130}
                        value={evMinute}
                        onChange={(e) => setEvMinute(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                      />
                    </div>

                    {(evType === 'gol' || evType === 'penal' || evType === 'autogol') && (
                      <>
                        <div>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
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
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
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

                    {evType === 'participacion' && (
                      <>
                        <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 pt-4">
                          <input
                            type="checkbox"
                            checked={evStarter}
                            onChange={(e) => setEvStarter(e.target.checked)}
                          />
                          Titular
                        </label>
                        <div>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                            Min. jugados
                          </span>
                          <input
                            type="number"
                            min={0}
                            max={130}
                            value={evMinPlayed}
                            onChange={(e) => setEvMinPlayed(Number(e.target.value))}
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                          />
                        </div>
                      </>
                    )}

                    <div className="flex items-center gap-1.5 mt-4">
                      <button
                        type="button"
                        onClick={handleAddEvent}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-navy-900 dark:bg-electric-500 hover:bg-navy-800 dark:hover:bg-electric-600 rounded-lg"
                      >
                        {editingEventIndex !== null ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        {editingEventIndex !== null ? 'Actualizar evento' : 'Agregar al acta'}
                      </button>
                      {editingEventIndex !== null && (
                        <button
                          type="button"
                          onClick={handleCancelEditEvent}
                          className="px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Draft Events List */}
              <div>
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Eventos Registrados en el Acta ({draftEvents.length})
                </h3>
                {draftEvents.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Sin incidencias capturadas todavía.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
                    {draftEvents.map((ev, i) => (
                      <div
                        key={i}
                        className={`px-3 py-2 flex items-center justify-between text-xs ${
                          editingEventIndex === i ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono font-bold text-navy-900 dark:text-blue-400 tabular-nums">
                            {ev.minute}&apos;
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 font-semibold ${MATCH_EVENT_STYLE[ev.eventType].colorClass}`}
                          >
                            <MatchEventIcon eventType={ev.eventType} className="w-3.5 h-3.5" />
                            {MATCH_EVENT_STYLE[ev.eventType].label}
                          </span>
                          <span className="text-slate-900 dark:text-slate-100 font-medium">
                            {playerMap.get(ev.playerId)?.fullName || ev.playerId}
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">
                            ({teamMap.get(ev.teamId)?.shortCode || ev.teamId})
                          </span>
                        </div>
                        {canSubmit && (
                          <div className="inline-flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleStartEditEvent(i)}
                              title="Editar incidencia"
                              className="text-navy-900 dark:text-blue-300 hover:text-electric-600 dark:hover:text-blue-200"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (editingEventIndex === i) handleCancelEditEvent();
                                else if (editingEventIndex !== null && i < editingEventIndex) {
                                  setEditingEventIndex(editingEventIndex - 1);
                                }
                                setDraftEvents((prev) => prev.filter((_, idx) => idx !== i));
                              }}
                              title="Eliminar incidencia"
                              className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Observaciones del Árbitro / Incidencias
                </label>
                <textarea
                  rows={2}
                  disabled={!canSubmit}
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  placeholder="Reporte arbitral, comportamiento de porras, estado del terreno..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>

              {canSubmit && (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-electric-500 hover:bg-electric-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    Enviar a Validación
                  </button>

                  {canValidate && existingResult && (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={correctionReason}
                        onChange={(e) => setCorrectionReason(e.target.value)}
                        placeholder="Motivo de validación/corrección (opcional)"
                        className="px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleValidate(false)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 hover:bg-red-100 dark:hover:bg-red-900/60 rounded-lg"
                      >
                        <XCircle className="w-4 h-4" />
                        Rechazar
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleValidate(true)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                      >
                        <ClipboardCheck className="w-4 h-4" />
                        Aprobar Resultado Oficial
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Correction History */}
              {existingResult?.correctionHistory && existingResult.correctionHistory.length > 0 && (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <History className="w-3.5 h-3.5" />
                    <span>Historial de Correcciones y Validaciones</span>
                  </div>
                  <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    {existingResult.correctionHistory.map((ch, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/70 px-3 py-1.5 rounded"
                      >
                        <span>
                          {ch.correctedByName}: {ch.reason} ({ch.previousScore} → {ch.newScore})
                        </span>
                        <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                          {new Date(ch.correctedAt).toLocaleString('es-MX')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </form>
          )}
        </div>
      </div>

      {/* Modal Confirmar Eliminación de Acta */}
      {canDeleteActa && confirmDeleteActa && activeMatch && existingResult && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                    Eliminar Acta Digital
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Elimina el marcador registrado, incidencias y devuelve el partido a Programado.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmDeleteActa(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-xs space-y-1">
              <p className="font-semibold text-slate-900 dark:text-white">
                Partido #{activeMatch.matchNumber}:{' '}
                {teamMap.get(activeMatch.homeTeamId)?.name || activeMatch.homeTeamId} vs{' '}
                {teamMap.get(activeMatch.awayTeamId)?.name || activeMatch.awayTeamId}
              </p>
              <p className="font-mono text-rose-700 dark:text-rose-300">
                Marcador actual: {existingResult.homeScore} - {existingResult.awayScore} ({existingMatchEvents.length} incidencias)
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmDeleteActa(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirmDeleteActa}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {busy ? 'Eliminando...' : 'Sí, eliminar acta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
