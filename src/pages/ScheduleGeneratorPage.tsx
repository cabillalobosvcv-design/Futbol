import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Edit3,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Send,
  SlidersHorizontal,
} from 'lucide-react';
import { exportToExcel, exportToPdf } from '../engines/exportEngine';
import { detectScheduleConflicts, generateTournamentFixtures } from '../engines/fixtureGenerator';
import { useAuth } from '../context/AuthContext';
import { useSigdData } from '../context/SigdDataContext';
import {
  createAuditLog,
  persistGeneratedSchedule,
  publishCategorySchedule,
  saveEntityDoc,
  sendNotification,
} from '../services/firestoreService';
import type { Match, MatchStatus, TournamentFormat } from '../types/sigd';

type ScheduleViewMode = 'rounds' | 'calendar' | 'category' | 'team' | 'field';

export function ScheduleGeneratorPage() {
  const { profile } = useAuth();
  const { tournaments, categories, teams, fields, referees, matches } = useSigdData();

  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [viewMode, setViewMode] = useState<ScheduleViewMode>('rounds');
  const [filterTeamId, setFilterTeamId] = useState<string>('all');
  const [filterFieldId, setFilterFieldId] = useState<string>('all');

  // Generator Options
  const [startDate, setStartDate] = useState('2026-11-21');
  const [daysBetweenRounds, setDaysBetweenRounds] = useState(7);
  const [timesInput, setTimesInput] = useState('09:00, 11:00, 13:00, 15:00');
  const [minRestHours, setMinRestHours] = useState(24);
  const [formatOverride, setFormatOverride] = useState<TournamentFormat | ''>('');
  const [doubleRoundOverride, setDoubleRoundOverride] = useState(false);

  // Confirm modal before modifying published calendar
  const [confirmPublishedModal, setConfirmPublishedModal] = useState<{
    open: boolean;
    actionLabel: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  // Edit match modal
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editFieldId, setEditFieldId] = useState('');
  const [editRefereeId, setEditRefereeId] = useState('');
  const [editStatus, setEditStatus] = useState<MatchStatus>('Programado');

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const activeTournament =
    tournaments.find((t) => t.id === selectedTournamentId) || tournaments[0];
  const tournamentCategories = useMemo(
    () => categories.filter((c) => c.tournamentId === activeTournament?.id),
    [categories, activeTournament?.id]
  );
  const activeCategory =
    tournamentCategories.find((c) => c.id === selectedCategoryId) || tournamentCategories[0];

  const categoryTeams = useMemo(
    () => teams.filter((t) => t.categoryId === activeCategory?.id),
    [teams, activeCategory?.id]
  );

  const categoryMatches = useMemo(() => {
    return matches
      .filter((m) => {
        if (activeTournament && m.tournamentId !== activeTournament.id) return false;
        if (viewMode !== 'category' && activeCategory && m.categoryId !== activeCategory.id)
          return false;
        if (viewMode === 'team' && filterTeamId !== 'all') {
          if (m.homeTeamId !== filterTeamId && m.awayTeamId !== filterTeamId) return false;
        }
        if (viewMode === 'field' && filterFieldId !== 'all') {
          if (m.fieldId !== filterFieldId) return false;
        }
        return true;
      })
      .sort((a, b) => a.roundNumber - b.roundNumber || `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  }, [matches, activeTournament, activeCategory, viewMode, filterTeamId, filterFieldId]);

  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const fieldMap = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);
  const refMap = useMemo(() => new Map(referees.map((r) => [r.id, r])), [referees]);
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const conflicts = useMemo(
    () =>
      detectScheduleConflicts(
        matches.filter((m) => m.tournamentId === activeTournament?.id),
        fields,
        referees,
        minRestHours
      ),
    [matches, activeTournament?.id, fields, referees, minRestHours]
  );

  const executeGenerate = async (replaceExisting: boolean) => {
    if (!profile || !activeTournament || !activeCategory) return;
    if (categoryTeams.length < 2) {
      setFeedback('Se necesitan al menos 2 equipos activos en la categoría para generar roles.');
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const defaultTimes = timesInput
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^\d{2}:\d{2}$/.test(s));

      const result = generateTournamentFixtures({
        tournamentId: activeTournament.id,
        categoryId: activeCategory.id,
        teams: categoryTeams,
        format: formatOverride || activeTournament.format,
        doubleRound: doubleRoundOverride || Boolean(activeTournament.doubleRound),
        teamsPerGroup: activeTournament.teamsPerGroup || 4,
        qualifiersPerGroup: activeTournament.qualifiersPerGroup || 2,
        startDate,
        daysBetweenRounds: Number(daysBetweenRounds),
        defaultTimes: defaultTimes.length > 0 ? defaultTimes : ['09:00', '11:00', '13:00'],
        fields,
        referees,
        minRestHours: Number(minRestHours),
      });

      await persistGeneratedSchedule({
        tournamentId: activeTournament.id,
        categoryId: activeCategory.id,
        rounds: result.rounds,
        groups: result.groups,
        teamGroupAssignments: result.teamGroupAssignments,
        matches: result.matches,
        replaceExisting,
        actorUid: profile.uid,
        actorName: profile.displayName,
      });

      setFeedback(
        `Calendario generado con ${result.matches.length} encuentros en ${result.rounds.length} jornadas. Conflictos detectados: ${result.conflicts.length}.`
      );
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateClick = (replaceExisting: boolean) => {
    if (activeCategory?.schedulePublished) {
      setConfirmPublishedModal({
        open: true,
        actionLabel: 'Regenerar un calendario ya publicado',
        onConfirm: async () => {
          setConfirmPublishedModal(null);
          await executeGenerate(replaceExisting);
        },
      });
      return;
    }
    executeGenerate(replaceExisting);
  };

  const handlePublish = async () => {
    if (!profile || !activeTournament || !activeCategory) return;
    setBusy(true);
    try {
      await publishCategorySchedule({
        tournamentId: activeTournament.id,
        categoryId: activeCategory.id,
        categoryName: activeCategory.name,
        matches: categoryMatches,
        actorUid: profile.uid,
        actorName: profile.displayName,
      });
      setFeedback('Calendario publicado oficialmente y notificación enviada a los usuarios.');
    } finally {
      setBusy(false);
    }
  };

  const openMatchEditor = (m: Match) => {
    const startEdit = () => {
      setEditingMatch(m);
      setEditDate(m.date);
      setEditTime(m.time);
      setEditFieldId(m.fieldId || '');
      setEditRefereeId(m.refereeId || '');
      setEditStatus(m.status);
    };

    if (m.published) {
      setConfirmPublishedModal({
        open: true,
        actionLabel: `Modificar el partido #${m.matchNumber} de un calendario ya publicado`,
        onConfirm: async () => {
          setConfirmPublishedModal(null);
          startEdit();
        },
      });
      return;
    }
    startEdit();
  };

  const handleSaveMatchEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !editingMatch) return;
    setBusy(true);
    try {
      const selectedField = fields.find((f) => f.id === editFieldId);
      await saveEntityDoc(
        'matches',
        editingMatch.id,
        {
          date: editDate,
          time: editTime,
          fieldId: editFieldId || '',
          venueId: selectedField?.venueId || '',
          refereeId: editRefereeId || '',
          status: editStatus,
        },
        false
      );
      await createAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        action: 'UPDATE_MATCH',
        entity: 'matches',
        entityId: editingMatch.id,
        summary: `Partido #${editingMatch.matchNumber} actualizado (${editDate} ${editTime} · ${editStatus}).`,
      });
      if (editingMatch.published) {
        await sendNotification({
          isBroadcast: true,
          title: `Cambio de programación · Partido #${editingMatch.matchNumber}`,
          message: `Actualización: ${editDate} ${editTime} · Estado: ${editStatus}.`,
          type: editStatus === 'Suspendido' ? 'alert' : 'warning',
          entityType: 'matches',
          entityId: editingMatch.id,
          createdByUid: profile.uid,
        });
      }
      setEditingMatch(null);
      setFeedback(`Partido #${editingMatch.matchNumber} actualizado.`);
    } finally {
      setBusy(false);
    }
  };

  const buildExportPayload = () => ({
    title: `Roles de Juego — ${activeTournament?.name || 'Torneo'}`,
    subtitle: `Categoría: ${activeCategory?.name || 'Todas'}`,
    fileName: `Roles_${activeCategory?.name || 'SIGD'}`.replace(/\s+/g, '_'),
    headers: ['#', 'Jornada', 'Fecha', 'Hora', 'Local', 'Visitante', 'Cancha', 'Árbitro', 'Estado'],
    rows: categoryMatches.map((m) => [
      m.matchNumber,
      `J${m.roundNumber}`,
      m.date,
      m.time,
      teamMap.get(m.homeTeamId)?.name || m.homeTeamId,
      teamMap.get(m.awayTeamId)?.name || m.awayTeamId,
      m.fieldId ? fieldMap.get(m.fieldId)?.name || 'Por asignar' : 'Por asignar',
      m.refereeId ? refMap.get(m.refereeId)?.fullName || 'Por asignar' : 'Por asignar',
      m.status,
    ]),
  });

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-display font-bold text-navy-900">
            Generador Automático de Roles y Calendario
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Configura restricciones de descanso, disponibilidad de canchas/árbitros, detecta conflictos y publica roles oficiales.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={categoryMatches.length === 0}
            onClick={() => exportToPdf(buildExportPayload())}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 bg-white hover:bg-slate-50 rounded-lg disabled:opacity-50"
          >
            <FileText className="w-4 h-4 text-red-600" />
            Exportar PDF
          </button>
          <button
            type="button"
            disabled={categoryMatches.length === 0}
            onClick={() => exportToExcel(buildExportPayload())}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 bg-white hover:bg-slate-50 rounded-lg disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            Exportar Excel
          </button>
          <button
            type="button"
            disabled={busy || categoryMatches.length === 0}
            onClick={handlePublish}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            Publicar Roles
          </button>
        </div>
      </div>

      {feedback && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Generator Parameters */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
          <SlidersHorizontal className="w-4 h-4 text-electric-500" />
          <h2 className="font-display font-semibold text-base text-slate-900">
            Parámetros y Restricciones del Generador
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Torneo</label>
            <select
              value={activeTournament?.id || ''}
              onChange={(e) => {
                setSelectedTournamentId(e.target.value);
                setSelectedCategoryId('');
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
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Categoría ({categoryTeams.length} equipos)
            </label>
            <select
              value={activeCategory?.id || ''}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50"
            >
              {tournamentCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Modalidad</label>
            <select
              value={formatOverride || activeTournament?.format || 'round_robin'}
              onChange={(e) => setFormatOverride(e.target.value as TournamentFormat)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50"
            >
              <option value="round_robin">Todos contra todos</option>
              <option value="knockout">Eliminación directa</option>
              <option value="groups">Fase de grupos</option>
              <option value="mixed">Modalidad mixta</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Fecha de inicio</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Días entre jornadas
            </label>
            <input
              type="number"
              min={1}
              max={30}
              value={daysBetweenRounds}
              onChange={(e) => setDaysBetweenRounds(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Descanso mínimo (horas)
            </label>
            <input
              type="number"
              min={0}
              max={168}
              value={minRestHours}
              onChange={(e) => setMinRestHours(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Horarios permitidos (HH:MM)
            </label>
            <input
              type="text"
              value={timesInput}
              onChange={(e) => setTimesInput(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700 pb-2.5">
            <input
              type="checkbox"
              checked={doubleRoundOverride}
              onChange={(e) => setDoubleRoundOverride(e.target.checked)}
            />
            Forzar Ida y Vuelta
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            disabled={busy || !activeCategory}
            onClick={() => handleGenerateClick(categoryMatches.length > 0)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-electric-500 hover:bg-electric-600 text-white text-sm font-medium disabled:opacity-50"
          >
            <CalendarDays className="w-4 h-4" />
            {categoryMatches.length > 0 ? 'Regenerar Calendario' : 'Generar Roles Automáticamente'}
          </button>
          {categoryMatches.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => handleGenerateClick(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm font-medium text-slate-700"
            >
              <RefreshCw className="w-4 h-4" />
              Reemplazar roles actuales
            </button>
          )}
        </div>
      </div>

      {/* Conflict Detector Panel */}
      {conflicts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-red-800 font-display font-semibold text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>
              Detector de Conflictos previo a publicación ({conflicts.length} observaciones)
            </span>
          </div>
          <ul className="space-y-1 text-xs text-red-700 list-disc pl-5">
            {conflicts.map((c) => (
              <li key={c.id}>{c.description}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Multi-view Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-3">
        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              { id: 'rounds', label: 'Vista de Jornadas' },
              { id: 'calendar', label: 'Vista de Calendario' },
              { id: 'category', label: 'Vista por Categoría' },
              { id: 'team', label: 'Vista por Equipo' },
              { id: 'field', label: 'Vista por Cancha' },
            ] as { id: ScheduleViewMode; label: string }[]
          ).map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setViewMode(v.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                viewMode === v.id
                  ? 'bg-navy-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        {viewMode === 'team' && (
          <select
            value={filterTeamId}
            onChange={(e) => setFilterTeamId(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50"
          >
            <option value="all">Todos los equipos</option>
            {categoryTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}

        {viewMode === 'field' && (
          <select
            value={filterFieldId}
            onChange={(e) => setFilterFieldId(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50"
          >
            <option value="all">Todas las canchas</option>
            {fields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Matches Grid / Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-display font-semibold text-base text-slate-900">
            Encuentros Programados ({categoryMatches.length})
          </h2>
          <span className="text-xs text-slate-500">
            {activeCategory?.schedulePublished ? 'Calendario publicado' : 'Borrador interno'}
          </span>
        </div>

        {categoryMatches.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No hay encuentros generados para esta selección. Configura los parámetros arriba y presiona "Generar Roles Automáticamente".
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                  <th className="py-3 px-4 text-left font-medium">#</th>
                  <th className="py-3 px-4 text-left font-medium">Jornada / Fase</th>
                  <th className="py-3 px-4 text-left font-medium">Fecha y Hora</th>
                  <th className="py-3 px-4 text-left font-medium">Local vs Visitante</th>
                  <th className="py-3 px-4 text-left font-medium">Cancha</th>
                  <th className="py-3 px-4 text-left font-medium">Árbitro</th>
                  <th className="py-3 px-4 text-left font-medium">Estado</th>
                  <th className="py-3 px-4 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categoryMatches.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-500">
                      {m.matchNumber}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700">
                      J{m.roundNumber} · {m.stage}
                      {viewMode === 'category' ? ` (${catMap.get(m.categoryId)?.name})` : ''}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-800 whitespace-nowrap">
                      {m.date} · {m.time}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {teamMap.get(m.homeTeamId)?.name || m.homeTeamId} vs{' '}
                      {teamMap.get(m.awayTeamId)?.name || m.awayTeamId}
                    </td>
                    <td className="py-3 px-4 text-slate-600 text-xs">
                      {m.fieldId ? fieldMap.get(m.fieldId)?.name || 'Sin asignar' : 'Sin asignar'}
                    </td>
                    <td className="py-3 px-4 text-slate-600 text-xs">
                      {m.refereeId ? refMap.get(m.refereeId)?.fullName || 'Sin asignar' : 'Sin asignar'}
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-slate-700">{m.status}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => openMatchEditor(m)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-electric-600 hover:bg-blue-50 rounded-md"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Warning Modal for Published Calendar Modification */}
      {confirmPublishedModal?.open && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-base text-slate-900">
                  Advertencia: Calendario Ya Publicado
                </h3>
                <p className="text-sm text-slate-600 mt-1">
                  Estás por <strong>{confirmPublishedModal.actionLabel}</strong>. Los equipos, árbitros y visitantes públicos ya consultan este calendario. ¿Deseas continuar?
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmPublishedModal(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => confirmPublishedModal.onConfirm()}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg"
              >
                Confirmar modificación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Individual Match Editor Modal */}
      {editingMatch && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveMatchEdit}
            className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl"
          >
            <h3 className="font-display font-bold text-lg text-navy-900">
              Editar / Reprogramar Partido #{editingMatch.matchNumber}
            </h3>
            <p className="text-xs text-slate-500">
              {teamMap.get(editingMatch.homeTeamId)?.name || editingMatch.homeTeamId} vs{' '}
              {teamMap.get(editingMatch.awayTeamId)?.name || editingMatch.awayTeamId}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Fecha</label>
                <input
                  type="date"
                  required
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Hora</label>
                <input
                  type="time"
                  required
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Cancha</label>
              <select
                value={editFieldId}
                onChange={(e) => setEditFieldId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50"
              >
                <option value="">Sin cancha asignada</option>
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.status})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Árbitro</label>
              <select
                value={editRefereeId}
                onChange={(e) => setEditRefereeId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50"
              >
                <option value="">Sin árbitro asignado</option>
                {referees.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fullName} ({r.status})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Estado</label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as MatchStatus)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50"
              >
                <option value="Programado">Programado</option>
                <option value="En juego">En juego</option>
                <option value="Reprogramado">Reprogramado</option>
                <option value="Suspendido">Suspendido</option>
                <option value="Cancelado">Cancelado</option>
                <option value="Pendiente de validación">Pendiente de validación</option>
                <option value="Finalizado">Finalizado</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingMatch(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 text-sm font-medium text-white bg-navy-900 hover:bg-navy-800 rounded-lg"
              >
                Guardar cambios
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
