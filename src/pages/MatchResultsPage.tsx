import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  FileDown,
  History,
  Plus,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';
import { exportMatchSheetPdf } from '../engines/exportEngine';
import { useAuth } from '../context/AuthContext';
import { useSigdData } from '../context/SigdDataContext';
import {
  approveOrRejectMatchResult,
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

  const [correctionReason, setCorrectionReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const canSubmit = ROLE_PERMISSIONS.canSubmitMatchSheet(role);
  const canValidate = ROLE_PERMISSIONS.canValidateResults(role);

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
  };

  const matchTeamPlayers = useMemo(() => {
    const tid = evTeamId || activeMatch?.homeTeamId;
    return players.filter((p) => p.teamId === tid);
  }, [players, evTeamId, activeMatch?.homeTeamId]);

  const handleAddEvent = () => {
    if (!activeMatch) return;
    const tid = evTeamId || activeMatch.homeTeamId;
    const pid = evPlayerId || matchTeamPlayers[0]?.id;
    if (!pid) {
      setFeedback('Registra jugadores en este equipo antes de capturar eventos individuales.');
      return;
    }
    setDraftEvents((prev) => [
      ...prev,
      {
        teamId: tid,
        playerId: pid,
        eventType: evType,
        goalType: evType === 'gol' || evType === 'penal' || evType === 'autogol' ? evGoalType : undefined,
        minute: Number(evMinute),
        assistPlayerId: evAssistId || undefined,
        isStarter: evType === 'participacion' ? evStarter : undefined,
        minutesPlayed: evType === 'participacion' ? Number(evMinPlayed) : undefined,
      },
    ]);
  };

  const handleSubmitSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !activeMatch) return;
    setBusy(true);
    setFeedback(null);
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
      fieldName: activeMatch.fieldId ? fieldMap.get(activeMatch.fieldId)?.name || 'N/A' : 'N/A',
      refereeName: activeMatch.refereeId
        ? refMap.get(activeMatch.refereeId)?.fullName || 'N/A'
        : 'N/A',
      playerNames,
      teamNames,
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-display font-bold text-navy-900">
            Administración de Partidos, Actas Digitales y Validación
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Captura marcadores, incidencias individuales y valida resultados oficiales que actualizan tablas y rankings.
          </p>
        </div>
        <select
          value={filterTournamentId}
          onChange={(e) => setFilterTournamentId(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50"
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
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Match Selector Sidebar */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden h-fit">
          <div className="px-4 py-3.5 border-b border-slate-200">
            <h2 className="font-display font-semibold text-sm text-slate-900">
              Ficha de Encuentros ({filteredMatches.length})
            </h2>
          </div>
          <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-100">
            {filteredMatches.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                No hay partidos programados.
              </div>
            ) : (
              filteredMatches.map((m) => {
                const isSelected = m.id === activeMatch?.id;
                const res = matchResults.find((r) => r.matchId === m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => loadMatchIntoForm(m)}
                    className={`w-full text-left p-3.5 transition-colors ${
                      isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-mono">
                        #{m.matchNumber} · J{m.roundNumber}
                      </span>
                      <span
                        className={`font-medium ${
                          m.status === 'Pendiente de validación'
                            ? 'text-amber-700'
                            : m.status === 'Finalizado'
                              ? 'text-emerald-700'
                              : 'text-slate-600'
                        }`}
                      >
                        {m.status}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 mt-1">
                      {teamMap.get(m.homeTeamId)?.name || m.homeTeamId} vs{' '}
                      {teamMap.get(m.awayTeamId)?.name || m.awayTeamId}
                    </p>
                    <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
                      <span className="font-mono tabular-nums">
                        {m.date} · {m.time}
                      </span>
                      {res && (
                        <span className="font-mono font-bold text-navy-900 tabular-nums">
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
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
              Selecciona un encuentro de la lista para capturar o validar su acta digital.
            </div>
          ) : (
            <form
              onSubmit={handleSubmitSheet}
              className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
                <div>
                  <p className="text-xs text-slate-500">
                    Partido #{activeMatch.matchNumber} ·{' '}
                    {tournamentMap.get(activeMatch.tournamentId)?.name} ·{' '}
                    {catMap.get(activeMatch.categoryId)?.name}
                  </p>
                  <h2 className="font-display font-bold text-lg text-navy-900 mt-0.5">
                    {teamMap.get(activeMatch.homeTeamId)?.name || activeMatch.homeTeamId} vs{' '}
                    {teamMap.get(activeMatch.awayTeamId)?.name || activeMatch.awayTeamId}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {activeMatch.date} {activeMatch.time} · Cancha:{' '}
                    {activeMatch.fieldId ? fieldMap.get(activeMatch.fieldId)?.name : 'Por asignar'} ·
                    Árbitro:{' '}
                    {activeMatch.refereeId ? refMap.get(activeMatch.refereeId)?.fullName : 'Por asignar'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadActaPdf}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 shrink-0"
                >
                  <FileDown className="w-4 h-4 text-red-600" />
                  Descargar Acta PDF
                </button>
              </div>

              {/* Final Scoreboard */}
              <div className="grid grid-cols-3 gap-4 items-center bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="text-center">
                  <span className="text-xs font-medium text-slate-600 block mb-1">
                    Local ({teamMap.get(activeMatch.homeTeamId)?.shortCode || 'LOC'})
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    disabled={!canSubmit}
                    value={homeScore}
                    onChange={(e) => setHomeScore(Number(e.target.value))}
                    className="w-20 mx-auto text-center py-2 text-2xl font-mono font-bold border border-slate-300 rounded-lg bg-white tabular-nums"
                  />
                </div>
                <div className="text-center text-xs font-mono text-slate-400">
                  MARCADOR FINAL
                  <span className="block text-[11px] mt-1 text-slate-600">
                    Validación: {existingResult?.validationStatus || 'sin capturar'}
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-xs font-medium text-slate-600 block mb-1">
                    Visitante ({teamMap.get(activeMatch.awayTeamId)?.shortCode || 'VIS'})
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    disabled={!canSubmit}
                    value={awayScore}
                    onChange={(e) => setAwayScore(Number(e.target.value))}
                    className="w-20 mx-auto text-center py-2 text-2xl font-mono font-bold border border-slate-300 rounded-lg bg-white tabular-nums"
                  />
                </div>
              </div>

              {/* Period Scores */}
              <div>
                <h3 className="text-xs font-semibold text-slate-700 mb-2">Goles por Periodo</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {periodScores.map((ps, idx) => (
                    <div
                      key={ps.period}
                      className="flex items-center justify-between gap-2 p-2.5 border border-slate-200 rounded-lg"
                    >
                      <span className="text-xs font-medium text-slate-700">{ps.period}</span>
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
                          className="w-14 text-center py-1 text-sm border border-slate-200 rounded font-mono tabular-nums"
                        />
                        <span className="text-slate-400">-</span>
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
                          className="w-14 text-center py-1 text-sm border border-slate-200 rounded font-mono tabular-nums"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Individual Match Events Capture */}
              {canSubmit && (
                <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/60">
                  <h3 className="text-xs font-semibold text-slate-800">
                    Capturar Estadísticas e Incidencias Individuales
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <select
                      value={evTeamId || activeMatch.homeTeamId}
                      onChange={(e) => {
                        setEvTeamId(e.target.value);
                        setEvPlayerId('');
                      }}
                      className="px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-white"
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
                      className="px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-white"
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

                    <select
                      value={evType}
                      onChange={(e) => setEvType(e.target.value as MatchEventType)}
                      className="px-2.5 py-2 text-xs border border-slate-200 rounded-lg bg-white"
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

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 items-center">
                    <div>
                      <span className="text-[11px] text-slate-500 block">Minuto</span>
                      <input
                        type="number"
                        min={0}
                        max={130}
                        value={evMinute}
                        onChange={(e) => setEvMinute(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white font-mono tabular-nums"
                      />
                    </div>

                    {(evType === 'gol' || evType === 'penal' || evType === 'autogol') && (
                      <>
                        <div>
                          <span className="text-[11px] text-slate-500 block">Tipo anotación</span>
                          <select
                            value={evGoalType}
                            onChange={(e) => setEvGoalType(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                          >
                            <option value="Normal">Jugada</option>
                            <option value="Cabeza">Cabeza</option>
                            <option value="Tiro Libre">Tiro Libre</option>
                            <option value="Penal">Penal</option>
                            <option value="Autogol">Autogol</option>
                          </select>
                        </div>
                        <div>
                          <span className="text-[11px] text-slate-500 block">Asistencia (opc.)</span>
                          <select
                            value={evAssistId}
                            onChange={(e) => setEvAssistId(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
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
                        <label className="flex items-center gap-1.5 text-xs text-slate-700 pt-4">
                          <input
                            type="checkbox"
                            checked={evStarter}
                            onChange={(e) => setEvStarter(e.target.checked)}
                          />
                          Titular
                        </label>
                        <div>
                          <span className="text-[11px] text-slate-500 block">Min. jugados</span>
                          <input
                            type="number"
                            min={0}
                            max={130}
                            value={evMinPlayed}
                            onChange={(e) => setEvMinPlayed(Number(e.target.value))}
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white font-mono tabular-nums"
                          />
                        </div>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={handleAddEvent}
                      className="mt-4 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-navy-900 hover:bg-navy-800 rounded-lg"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Agregar al acta
                    </button>
                  </div>
                </div>
              )}

              {/* Draft Events List */}
              <div>
                <h3 className="text-xs font-semibold text-slate-700 mb-2">
                  Eventos Registrados en el Acta ({draftEvents.length})
                </h3>
                {draftEvents.length === 0 ? (
                  <p className="text-xs text-slate-500">Sin incidencias capturadas todavía.</p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                    {draftEvents.map((ev, i) => (
                      <div key={i} className="px-3 py-2 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono font-bold text-navy-900 tabular-nums">
                            {ev.minute}&apos;
                          </span>
                          <span className="font-semibold uppercase text-electric-600">
                            {ev.eventType}
                          </span>
                          <span className="text-slate-900 font-medium">
                            {playerMap.get(ev.playerId)?.fullName || ev.playerId}
                          </span>
                          <span className="text-slate-500">
                            ({teamMap.get(ev.teamId)?.shortCode || ev.teamId})
                          </span>
                        </div>
                        {canSubmit && (
                          <button
                            type="button"
                            onClick={() =>
                              setDraftEvents((prev) => prev.filter((_, idx) => idx !== i))
                            }
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observaciones del Árbitro / Incidencias
                </label>
                <textarea
                  rows={2}
                  disabled={!canSubmit}
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  placeholder="Reporte arbitral, comportamiento de porras, estado del terreno..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              {canSubmit && (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
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
                        className="px-3 py-2 text-xs border border-slate-200 rounded-lg"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleValidate(false)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 border border-red-200 bg-red-50 hover:bg-red-100 rounded-lg"
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
                <div className="pt-3 border-t border-slate-200 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <History className="w-3.5 h-3.5" />
                    <span>Historial de Correcciones y Validaciones</span>
                  </div>
                  <div className="space-y-1 text-xs text-slate-600">
                    {existingResult.correctionHistory.map((ch, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-slate-50 px-3 py-1.5 rounded">
                        <span>
                          {ch.correctedByName}: {ch.reason} ({ch.previousScore} → {ch.newScore})
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">
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
    </div>
  );
}
