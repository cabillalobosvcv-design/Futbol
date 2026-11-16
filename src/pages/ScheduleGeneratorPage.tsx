import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Edit3,
  FileSpreadsheet,
  FileText,
  Plus,
  RefreshCw,
  Send,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { exportToExcel, exportToPdf } from '../engines/exportEngine';
import {
  detectScheduleConflicts,
  generateTournamentFixtures,
  getValidDatesInRange,
  WEEKDAY_ORDER,
} from '../engines/fixtureGenerator';
import { useAuth } from '../context/AuthContext';
import { useSigdData } from '../context/SigdDataContext';
import {
  createAuditLog,
  deleteCategorySchedule,
  deleteMatchFromSchedule,
  deleteRoundMatches,
  makeId,
  persistGeneratedSchedule,
  publishCategorySchedule,
  saveEntityDoc,
  sendNotification,
  updateRoundMatchesDate,
} from '../services/firestoreService';
import type { Match, MatchStage, MatchStatus, TournamentFormat } from '../types/sigd';

type ScheduleViewMode = 'rounds' | 'calendar' | 'category' | 'team' | 'field';

const HOURLY_TIME_SLOTS = [
  '06:00',
  '07:00',
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
  '21:00',
  '22:00',
  '23:00',
];

const WEEKDAY_SHORT_LABELS: Record<string, string> = {
  Lunes: 'Lun',
  Martes: 'Mar',
  Miércoles: 'Mié',
  Jueves: 'Jue',
  Viernes: 'Vie',
  Sábado: 'Sáb',
  Domingo: 'Dom',
};

export function ScheduleGeneratorPage() {
  const { profile } = useAuth();
  const { organizations, tournaments, categories, teams, fields, referees, matches } = useSigdData();

  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [viewMode, setViewMode] = useState<ScheduleViewMode>('rounds');
  const [filterTeamId, setFilterTeamId] = useState<string>('all');
  const [filterFieldId, setFilterFieldId] = useState<string>('all');

  // Generator Options
  const [startDate, setStartDate] = useState('2026-11-21');
  const [endDate, setEndDate] = useState('2027-01-31');
  const [allowedWeekdays, setAllowedWeekdays] = useState<string[]>(['Sábado', 'Domingo']);
  const [selectedTimes, setSelectedTimes] = useState<string[]>(['09:00', '11:00', '13:00', '15:00']);
  const [formatOverride, setFormatOverride] = useState<TournamentFormat | ''>('');
  const [doubleRoundOverride, setDoubleRoundOverride] = useState(false);

  // Confirm modal before modifying published calendar
  const [confirmPublishedModal, setConfirmPublishedModal] = useState<{
    open: boolean;
    actionLabel: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  // Edit / Create individual match modal
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [editHomeTeamId, setEditHomeTeamId] = useState('');
  const [editAwayTeamId, setEditAwayTeamId] = useState('');
  const [editRoundNumber, setEditRoundNumber] = useState(1);
  const [editStage, setEditStage] = useState<MatchStage>('regular');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editFieldId, setEditFieldId] = useState('');
  const [editRefereeId, setEditRefereeId] = useState('');
  const [editStatus, setEditStatus] = useState<MatchStatus>('Programado');

  // Edit entire round date modal
  const [editingRound, setEditingRound] = useState<{
    roundNumber: number;
    currentDate: string;
    matchCount: number;
  } | null>(null);
  const [roundNewDate, setRoundNewDate] = useState('');

  // Delete confirmation modal (single match, full round, or full category schedule)
  const [deletingTarget, setDeletingTarget] = useState<
    | { type: 'match'; match: Match }
    | { type: 'round'; roundNumber: number; matchCount: number }
    | { type: 'category'; matchCount: number }
    | null
  >(null);

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  const activeCategoryAllMatches = useMemo(() => {
    if (!activeCategory) return [];
    return matches
      .filter((m) => m.categoryId === activeCategory.id)
      .sort(
        (a, b) =>
          a.roundNumber - b.roundNumber ||
          `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)
      );
  }, [matches, activeCategory]);

  const categoryRoundsSummary = useMemo(() => {
    const map = new Map<
      number,
      { roundNumber: number; matchCount: number; firstDate: string; stage: MatchStage }
    >();
    for (const m of activeCategoryAllMatches) {
      const existing = map.get(m.roundNumber);
      if (!existing) {
        map.set(m.roundNumber, {
          roundNumber: m.roundNumber,
          matchCount: 1,
          firstDate: m.date,
          stage: m.stage,
        });
      } else {
        existing.matchCount += 1;
        if (m.date < existing.firstDate) existing.firstDate = m.date;
      }
    }
    return Array.from(map.values()).sort((a, b) => a.roundNumber - b.roundNumber);
  }, [activeCategoryAllMatches]);

  const conflicts = useMemo(
    () =>
      detectScheduleConflicts(
        matches.filter((m) => m.tournamentId === activeTournament?.id),
        fields,
        referees,
        0
      ),
    [matches, activeTournament?.id, fields, referees]
  );

  const validPlayDates = useMemo(
    () => getValidDatesInRange(startDate, endDate, allowedWeekdays),
    [startDate, endDate, allowedWeekdays]
  );

  const dynamicPreview = useMemo(() => {
    if (!activeTournament || !activeCategory || categoryTeams.length < 2) {
      return null;
    }
    return generateTournamentFixtures({
      tournamentId: activeTournament.id,
      categoryId: activeCategory.id,
      teams: categoryTeams,
      format: formatOverride || activeTournament.format,
      doubleRound: doubleRoundOverride || Boolean(activeTournament.doubleRound),
      teamsPerGroup: activeTournament.teamsPerGroup || 4,
      qualifiersPerGroup: activeTournament.qualifiersPerGroup || 2,
      startDate,
      endDate,
      allowedWeekdays,
      daysBetweenRounds: 1,
      defaultTimes: selectedTimes.length > 0 ? selectedTimes : ['09:00'],
      fields,
      referees,
      minRestHours: 0,
    });
  }, [
    activeTournament,
    activeCategory,
    categoryTeams,
    formatOverride,
    doubleRoundOverride,
    startDate,
    endDate,
    allowedWeekdays,
    selectedTimes,
    fields,
    referees,
  ]);

  const toggleWeekday = (day: string) => {
    setAllowedWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const toggleHourSlot = (hour: string) => {
    setSelectedTimes((prev) => {
      const next = prev.includes(hour) ? prev.filter((t) => t !== hour) : [...prev, hour];
      return next.sort((a, b) => a.localeCompare(b));
    });
  };

  const executeGenerate = async (replaceExisting: boolean) => {
    if (!profile || !activeTournament || !activeCategory) return;
    if (categoryTeams.length < 2) {
      setErrorMsg('Se necesitan al menos 2 equipos activos en la categoría para generar roles.');
      return;
    }
    if (!startDate || !endDate || endDate < startDate) {
      setErrorMsg('La fecha de fin debe ser igual o posterior a la fecha de inicio.');
      return;
    }
    if (allowedWeekdays.length === 0) {
      setErrorMsg('Selecciona al menos un día de la semana para jugar.');
      return;
    }
    if (validPlayDates.length === 0) {
      setErrorMsg(
        'No existen fechas disponibles entre la fecha de inicio y fin para los días de la semana seleccionados.'
      );
      return;
    }
    if (selectedTimes.length === 0) {
      setErrorMsg('Selecciona al menos un horario permitido de la lista por hora.');
      return;
    }

    setBusy(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const result = generateTournamentFixtures({
        tournamentId: activeTournament.id,
        categoryId: activeCategory.id,
        teams: categoryTeams,
        format: formatOverride || activeTournament.format,
        doubleRound: doubleRoundOverride || Boolean(activeTournament.doubleRound),
        teamsPerGroup: activeTournament.teamsPerGroup || 4,
        qualifiersPerGroup: activeTournament.qualifiersPerGroup || 2,
        startDate,
        endDate,
        allowedWeekdays,
        daysBetweenRounds: 1,
        defaultTimes: selectedTimes,
        fields,
        referees,
        minRestHours: 0,
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
        `Calendario generado con ${result.matches.length} encuentros en ${result.rounds.length} jornadas (${startDate} al ${endDate}). Conflictos detectados: ${result.conflicts.length}.`
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
      setErrorMsg(null);
      setEditingMatch(m);
      setEditHomeTeamId(m.homeTeamId);
      setEditAwayTeamId(m.awayTeamId);
      setEditRoundNumber(m.roundNumber);
      setEditStage(m.stage);
      setEditDate(m.date);
      setEditTime(m.time);
      setEditFieldId(m.fieldId || '');
      setEditRefereeId(m.refereeId || '');
      setEditStatus(m.status);
      setMatchModalOpen(true);
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

  const openNewMatchCreator = () => {
    if (!activeTournament || !activeCategory) return;
    if (categoryTeams.length < 2) {
      setErrorMsg('Se necesitan al menos 2 equipos registrados en la categoría para crear un partido.');
      return;
    }
    setErrorMsg(null);
    setEditingMatch(null);
    setEditHomeTeamId(categoryTeams[0]?.id || '');
    setEditAwayTeamId(categoryTeams[1]?.id || '');
    setEditRoundNumber((categoryRoundsSummary[categoryRoundsSummary.length - 1]?.roundNumber || 0) + 1);
    setEditStage('regular');
    setEditDate(startDate);
    setEditTime('09:00');
    setEditFieldId(fields[0]?.id || '');
    setEditRefereeId('');
    setEditStatus('Programado');
    setMatchModalOpen(true);
  };

  const handleSaveMatchEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !activeTournament || !activeCategory) return;

    if (!editHomeTeamId || !editAwayTeamId || editHomeTeamId === editAwayTeamId) {
      setErrorMsg('Selecciona dos equipos distintos (Local y Visitante).');
      return;
    }

    setBusy(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      const selectedField = fields.find((f) => f.id === editFieldId);
      const safeRound = Math.min(100, Math.max(1, Number(editRoundNumber) || 1));

      if (editingMatch) {
        await saveEntityDoc(
          'matches',
          editingMatch.id,
          {
            homeTeamId: editHomeTeamId,
            awayTeamId: editAwayTeamId,
            roundNumber: safeRound,
            stage: editStage,
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
          summary: `Partido #${editingMatch.matchNumber} modificado (J${safeRound} · ${editDate} ${editTime} · ${editStatus}).`,
        });
        if (editingMatch.published) {
          await sendNotification({
            isBroadcast: true,
            title: `Cambio de programación · Partido #${editingMatch.matchNumber}`,
            message: `Actualización: ${teamMap.get(editHomeTeamId)?.name || 'Local'} vs ${teamMap.get(editAwayTeamId)?.name || 'Visitante'} · ${editDate} ${editTime} · Estado: ${editStatus}.`,
            type: editStatus === 'Suspendido' || editStatus === 'Cancelado' ? 'alert' : 'warning',
            entityType: 'matches',
            entityId: editingMatch.id,
            createdByUid: profile.uid,
          });
        }
        setFeedback(`Partido #${editingMatch.matchNumber} modificado correctamente.`);
      } else {
        const nextMatchNumber =
          activeCategoryAllMatches.reduce((max, m) => Math.max(max, m.matchNumber), 0) + 1;
        const newMatchId = makeId('mat');
        await saveEntityDoc(
          'matches',
          newMatchId,
          {
            matchNumber: nextMatchNumber,
            tournamentId: activeTournament.id,
            categoryId: activeCategory.id,
            roundNumber: safeRound,
            stage: editStage,
            date: editDate,
            time: editTime,
            venueId: selectedField?.venueId || '',
            fieldId: editFieldId || '',
            homeTeamId: editHomeTeamId,
            awayTeamId: editAwayTeamId,
            refereeId: editRefereeId || '',
            status: editStatus,
            published: Boolean(activeCategory.schedulePublished),
          },
          true
        );
        await createAuditLog({
          actorUid: profile.uid,
          actorName: profile.displayName,
          action: 'CREATE_MANUAL_MATCH',
          entity: 'matches',
          entityId: newMatchId,
          summary: `Partido manual #${nextMatchNumber} agregado a J${safeRound} de ${activeCategory.name} (${editDate} ${editTime}).`,
        });
        setFeedback(`Partido #${nextMatchNumber} agregado al rol de ${activeCategory.name}.`);
      }

      setMatchModalOpen(false);
      setEditingMatch(null);
    } catch {
      setErrorMsg('No se pudieron guardar los cambios del encuentro. Verifica tus permisos.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveRoundDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !activeCategory || !editingRound || !roundNewDate) return;
    setBusy(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      const updatedCount = await updateRoundMatchesDate({
        categoryId: activeCategory.id,
        categoryName: activeCategory.name,
        roundNumber: editingRound.roundNumber,
        newDate: roundNewDate,
        wasPublished: Boolean(activeCategory.schedulePublished),
        actorUid: profile.uid,
        actorName: profile.displayName,
      });
      setEditingRound(null);
      setFeedback(
        `Jornada ${editingRound.roundNumber} reprogramada al ${roundNewDate} (${updatedCount} partidos actualizados).`
      );
    } catch {
      setErrorMsg('No se pudo reprogramar la fecha de la jornada.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDeletion = async () => {
    if (!profile || !activeCategory || !deletingTarget) return;
    setBusy(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      if (deletingTarget.type === 'match') {
        const remainingCount = activeCategoryAllMatches.length - 1;
        await deleteMatchFromSchedule({
          match: deletingTarget.match,
          remainingCategoryMatchesCount: remainingCount,
          categoryName: catMap.get(deletingTarget.match.categoryId)?.name || activeCategory.name,
          actorUid: profile.uid,
          actorName: profile.displayName,
        });
        setFeedback(`Partido #${deletingTarget.match.matchNumber} eliminado del rol.`);
      } else if (deletingTarget.type === 'round') {
        const count = await deleteRoundMatches({
          categoryId: activeCategory.id,
          categoryName: activeCategory.name,
          roundNumber: deletingTarget.roundNumber,
          wasPublished: Boolean(activeCategory.schedulePublished),
          actorUid: profile.uid,
          actorName: profile.displayName,
        });
        setFeedback(`Jornada ${deletingTarget.roundNumber} (${count} partidos) eliminada del rol.`);
      } else {
        const count = await deleteCategorySchedule({
          categoryId: activeCategory.id,
          categoryName: activeCategory.name,
          wasPublished: Boolean(activeCategory.schedulePublished),
          actorUid: profile.uid,
          actorName: profile.displayName,
        });
        setFeedback(
          `Se eliminó por completo el rol de ${activeCategory.name} (${count} partidos removidos).`
        );
      }
      setDeletingTarget(null);
    } catch {
      setErrorMsg('No se pudo completar la eliminación solicitada.');
    } finally {
      setBusy(false);
    }
  };

  const buildExportPayload = () => ({
    title: `Roles de Juego — ${activeTournament?.name || 'Torneo'}`,
    subtitle: `Categoría: ${activeCategory?.name || 'Todas'}`,
    organizationName: organizations[0]?.name || 'SIGD — Sistema Integral de Gestión Deportiva',
    organizationLogoUrl: organizations[0]?.logoUrl || '',
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
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-colors">
        <div>
          <h1 className="text-xl font-display font-bold text-navy-900 dark:text-white">
            Generador Automático de Roles y Calendario
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            Configura fechas, días de juego, horarios disponibles, disponibilidad de canchas/árbitros y publica roles oficiales.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={categoryMatches.length === 0}
            onClick={() => exportToPdf(buildExportPayload())}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg disabled:opacity-50"
          >
            <FileText className="w-4 h-4 text-red-600 dark:text-red-400" />
            Exportar PDF
          </button>
          <button
            type="button"
            disabled={categoryMatches.length === 0}
            onClick={() => exportToExcel(buildExportPayload())}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
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

      {/* Generator Parameters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5 transition-colors">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-electric-500" />
            <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
              Parámetros y Restricciones del Generador Dinámico
            </h2>
          </div>
          {dynamicPreview && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/50 text-electric-600 dark:text-blue-300">
              Estimación: {dynamicPreview.matches.length} partidos · {dynamicPreview.rounds.length}{' '}
              jornadas · {validPlayDates.length} fecha(s) hábiles
            </span>
          )}
        </div>

        {/* Torneo, Categoría y Modalidad */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Torneo
            </label>
            <select
              value={activeTournament?.id || ''}
              onChange={(e) => {
                setSelectedTournamentId(e.target.value);
                setSelectedCategoryId('');
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
              Categoría ({categoryTeams.length} equipos)
            </label>
            <select
              value={activeCategory?.id || ''}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              {tournamentCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Modalidad
            </label>
            <select
              value={formatOverride || activeTournament?.format || 'round_robin'}
              onChange={(e) => setFormatOverride(e.target.value as TournamentFormat)}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="round_robin">Todos contra todos</option>
              <option value="knockout">Eliminación directa</option>
              <option value="groups">Fase de grupos</option>
              <option value="mixed">Modalidad mixta</option>
            </select>
          </div>
        </div>

        {/* Rango de Fechas y Días de la Semana */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start pt-1">
          <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Fecha de inicio
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Fecha de fin
              </label>
              <input
                type="date"
                min={startDate}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>
            <label className="sm:col-span-2 flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 pt-1">
              <input
                type="checkbox"
                checked={doubleRoundOverride}
                onChange={(e) => setDoubleRoundOverride(e.target.checked)}
              />
              Forzar Ida y Vuelta (doble vuelta)
            </label>
          </div>

          <div className="lg:col-span-7 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Días de la semana a jugar ({allowedWeekdays.length} seleccionados)
              </span>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setAllowedWeekdays(['Sábado', 'Domingo'])}
                  className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Fin de semana
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setAllowedWeekdays(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'])
                  }
                  className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Entre semana
                </button>
                <button
                  type="button"
                  onClick={() => setAllowedWeekdays([...WEEKDAY_ORDER])}
                  className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Todos
                </button>
              </div>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {WEEKDAY_ORDER.map((day) => {
                const active = allowedWeekdays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleWeekday(day)}
                    className={`px-2.5 py-2 rounded-lg text-xs font-medium border transition-colors flex items-center justify-center gap-1 ${
                      active
                        ? 'bg-navy-900 dark:bg-electric-500 text-white border-navy-900 dark:border-electric-500'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {active && <Check className="w-3 h-3 shrink-0" />}
                    <span className="truncate">{WEEKDAY_SHORT_LABELS[day] || day}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Lista de Horarios Permitidos por Hora */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-electric-500" />
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Horarios permitidos (lista por hora · {selectedTimes.length} seleccionados)
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => setSelectedTimes(['08:00', '09:00', '10:00', '11:00', '12:00'])}
                className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Mañana (08–12)
              </button>
              <button
                type="button"
                onClick={() =>
                  setSelectedTimes(['13:00', '14:00', '15:00', '16:00', '17:00', '18:00'])
                }
                className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Tarde (13–18)
              </button>
              <button
                type="button"
                onClick={() => setSelectedTimes(['19:00', '20:00', '21:00', '22:00'])}
                className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Noche (19–22)
              </button>
              <button
                type="button"
                onClick={() => setSelectedTimes([...HOURLY_TIME_SLOTS])}
                className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setSelectedTimes([])}
                className="px-2.5 py-1 rounded border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
              >
                Limpiar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-9 gap-2">
            {HOURLY_TIME_SLOTS.map((hour) => {
              const checked = selectedTimes.includes(hour);
              return (
                <label
                  key={hour}
                  className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-mono cursor-pointer transition-colors select-none ${
                    checked
                      ? 'bg-navy-900 dark:bg-electric-500 text-white border-navy-900 dark:border-electric-500 font-semibold'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleHourSlot(hour)}
                    className="sr-only"
                  />
                  {checked && <Check className="w-3 h-3 shrink-0" />}
                  <span>{hour}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Dynamic Range & Capacity Diagnostics */}
        {(!startDate || !endDate || endDate < startDate) && (
          <div className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2">
            Verifica que la Fecha de fin sea igual o posterior a la Fecha de inicio.
          </div>
        )}
        {startDate && endDate && endDate >= startDate && validPlayDates.length === 0 && (
          <div className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
            No hay días válidos para jugar entre {startDate} y {endDate} con los días de la semana seleccionados.
          </div>
        )}
        {dynamicPreview &&
          validPlayDates.length > 0 &&
          dynamicPreview.rounds.length > validPlayDates.length && (
            <div className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
              El torneo requiere {dynamicPreview.rounds.length} jornadas, pero solo hay{' '}
              {validPlayDates.length} fecha(s) hábiles en el rango seleccionado. Algunas jornadas
              compartirán fecha o puedes ampliar la Fecha de fin / agregar más días de juego.
            </div>
          )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            disabled={
              busy ||
              !activeCategory ||
              !startDate ||
              !endDate ||
              endDate < startDate ||
              validPlayDates.length === 0 ||
              selectedTimes.length === 0
            }
            onClick={() => handleGenerateClick(categoryMatches.length > 0)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-electric-500 hover:bg-electric-600 text-white text-sm font-medium disabled:opacity-50"
          >
            <CalendarDays className="w-4 h-4" />
            {categoryMatches.length > 0 ? 'Regenerar Calendario' : 'Generar Roles Automáticamente'}
          </button>
          {categoryMatches.length > 0 && (
            <button
              type="button"
              disabled={
                busy ||
                !startDate ||
                !endDate ||
                endDate < startDate ||
                validPlayDates.length === 0 ||
                selectedTimes.length === 0
              }
              onClick={() => handleGenerateClick(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" />
              Reemplazar roles actuales
            </button>
          )}
        </div>
      </div>

      {/* Conflict Detector Panel */}
      {conflicts.length > 0 && (
        <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-red-800 dark:text-red-200 font-display font-semibold text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>
              Detector de Conflictos previo a publicación ({conflicts.length} observaciones)
            </span>
          </div>
          <ul className="space-y-1 text-xs text-red-700 dark:text-red-300 list-disc pl-5">
            {conflicts.map((c) => (
              <li key={c.id}>{c.description}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Multi-view Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 transition-colors">
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
                  ? 'bg-navy-900 dark:bg-electric-500 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
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
            className="px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
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
            className="px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
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
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden transition-colors">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
              Encuentros Programados ({categoryMatches.length})
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {activeCategory?.schedulePublished ? 'Calendario publicado' : 'Borrador interno'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeCategory && (
              <button
                type="button"
                disabled={busy}
                onClick={openNewMatchCreator}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-electric-500" />
                Agregar partido
              </button>
            )}
            {activeCategory && activeCategoryAllMatches.length > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setDeletingTarget({
                    type: 'category',
                    matchCount: activeCategoryAllMatches.length,
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/70 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950/60 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Eliminar rol completo
              </button>
            )}
          </div>
        </div>

        {/* Round-level Modify & Delete Bar */}
        {activeCategory && categoryRoundsSummary.length > 0 && viewMode !== 'category' && (
          <div className="px-5 py-3 bg-slate-50/80 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 mr-1">
              Jornadas creadas:
            </span>
            {categoryRoundsSummary.map((rnd) => (
              <div
                key={rnd.roundNumber}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
              >
                <span className="font-semibold text-navy-900 dark:text-white">
                  J{rnd.roundNumber}
                </span>
                <span className="text-slate-500 dark:text-slate-400 font-mono">
                  ({rnd.matchCount}) · {rnd.firstDate}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  title={`Cambiar fecha de Jornada ${rnd.roundNumber}`}
                  onClick={() => {
                    setEditingRound({
                      roundNumber: rnd.roundNumber,
                      currentDate: rnd.firstDate,
                      matchCount: rnd.matchCount,
                    });
                    setRoundNewDate(rnd.firstDate);
                  }}
                  className="p-1 rounded text-electric-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50"
                >
                  <Edit3 className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  title={`Eliminar Jornada ${rnd.roundNumber}`}
                  onClick={() =>
                    setDeletingTarget({
                      type: 'round',
                      roundNumber: rnd.roundNumber,
                      matchCount: rnd.matchCount,
                    })
                  }
                  className="p-1 rounded text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {categoryMatches.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No hay encuentros generados para esta selección. Configura los parámetros arriba y presiona "Generar Roles Automáticamente" o agrega un partido manual.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
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
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {categoryMatches.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {m.matchNumber}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300">
                      J{m.roundNumber} · {m.stage}
                      {viewMode === 'category' ? ` (${catMap.get(m.categoryId)?.name})` : ''}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      {m.date} · {m.time}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                      {teamMap.get(m.homeTeamId)?.name || m.homeTeamId} vs{' '}
                      {teamMap.get(m.awayTeamId)?.name || m.awayTeamId}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300 text-xs">
                      {m.fieldId ? fieldMap.get(m.fieldId)?.name || 'Sin asignar' : 'Sin asignar'}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300 text-xs">
                      {m.refereeId ? refMap.get(m.refereeId)?.fullName || 'Sin asignar' : 'Sin asignar'}
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-slate-700 dark:text-slate-300">
                      {m.status}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => openMatchEditor(m)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-electric-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-md"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Modificar
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setDeletingTarget({ type: 'match', match: m })}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-md"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Eliminar
                        </button>
                      </div>
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
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                  Advertencia: Calendario Ya Publicado
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                  Estás por <strong>{confirmPublishedModal.actionLabel}</strong>. Los equipos, árbitros y visitantes públicos ya consultan este calendario. ¿Deseas continuar?
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmPublishedModal(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
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

      {/* Individual Match Editor / Manual Match Modal */}
      {matchModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[1px] flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveMatchEdit}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-display font-bold text-lg text-navy-900 dark:text-white">
                  {editingMatch
                    ? `Modificar Encuentro #${editingMatch.matchNumber}`
                    : 'Agregar Partido al Rol'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ajusta equipos, jornada, fase, horario, sede o estado del partido según sea necesario.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMatchModalOpen(false);
                  setEditingMatch(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Equipo Local
                  </label>
                  <select
                    required
                    value={editHomeTeamId}
                    onChange={(e) => setEditHomeTeamId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    <option value="">Selecciona equipo local</option>
                    {(editingMatch
                      ? teams.filter((t) => t.categoryId === editingMatch.categoryId)
                      : categoryTeams
                    ).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Equipo Visitante
                  </label>
                  <select
                    required
                    value={editAwayTeamId}
                    onChange={(e) => setEditAwayTeamId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    <option value="">Selecciona equipo visitante</option>
                    {(editingMatch
                      ? teams.filter((t) => t.categoryId === editingMatch.categoryId)
                      : categoryTeams
                    ).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  const tmp = editHomeTeamId;
                  setEditHomeTeamId(editAwayTeamId);
                  setEditAwayTeamId(tmp);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-electric-600 dark:text-blue-400 hover:underline"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                Intercambiar Local ↔ Visitante
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Jornada
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  required
                  value={editRoundNumber}
                  onChange={(e) => setEditRoundNumber(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Fase
                </label>
                <select
                  value={editStage}
                  onChange={(e) => setEditStage(e.target.value as MatchStage)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="regular">Regular</option>
                  <option value="grupos">Grupos</option>
                  <option value="octavos">Octavos</option>
                  <option value="cuartos">Cuartos</option>
                  <option value="semifinal">Semifinal</option>
                  <option value="final">Final</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Fecha
                </label>
                <input
                  type="date"
                  required
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Hora
                </label>
                <input
                  type="time"
                  required
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Cancha
              </label>
              <select
                value={editFieldId}
                onChange={(e) => setEditFieldId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
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
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Árbitro
              </label>
              <select
                value={editRefereeId}
                onChange={(e) => setEditRefereeId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
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
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Estado
              </label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as MatchStatus)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
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
                onClick={() => {
                  setMatchModalOpen(false);
                  setEditingMatch(null);
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 text-sm font-medium text-white bg-navy-900 dark:bg-electric-500 hover:bg-navy-800 dark:hover:bg-electric-600 rounded-lg"
              >
                {busy ? 'Guardando...' : editingMatch ? 'Guardar cambios' : 'Crear partido'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Round Date Reprogramming Modal */}
      {editingRound && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[1px] flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveRoundDate}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h3 className="font-display font-bold text-base text-navy-900 dark:text-white">
              Modificar Fecha de Jornada {editingRound.roundNumber}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Se actualizará la fecha de los <strong>{editingRound.matchCount}</strong> partidos pertenecientes a la Jornada {editingRound.roundNumber} de {activeCategory?.name}.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nueva fecha para la jornada
              </label>
              <input
                type="date"
                required
                value={roundNewDate}
                onChange={(e) => setRoundNewDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditingRound(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 text-sm font-medium text-white bg-navy-900 dark:bg-electric-500 hover:bg-navy-800 dark:hover:bg-electric-600 rounded-lg"
              >
                {busy ? 'Actualizando...' : 'Aplicar nueva fecha'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Match / Round / Full Schedule Confirmation Modal */}
      {deletingTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                  {deletingTarget.type === 'match'
                    ? `Eliminar Partido #${deletingTarget.match.matchNumber}`
                    : deletingTarget.type === 'round'
                      ? `Eliminar Jornada ${deletingTarget.roundNumber}`
                      : `Eliminar Rol Completo de ${activeCategory?.name}`}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                  {deletingTarget.type === 'match' ? (
                    <>
                      Se eliminará el encuentro{' '}
                      <strong>
                        {teamMap.get(deletingTarget.match.homeTeamId)?.name ||
                          deletingTarget.match.homeTeamId}{' '}
                        vs{' '}
                        {teamMap.get(deletingTarget.match.awayTeamId)?.name ||
                          deletingTarget.match.awayTeamId}
                      </strong>{' '}
                      ({deletingTarget.match.date} {deletingTarget.match.time}).
                    </>
                  ) : deletingTarget.type === 'round' ? (
                    <>
                      Se eliminarán los <strong>{deletingTarget.matchCount}</strong> encuentros de la
                      Jornada {deletingTarget.roundNumber} de {activeCategory?.name}.
                    </>
                  ) : (
                    <>
                      Se eliminarán todos los <strong>{deletingTarget.matchCount}</strong> encuentros,
                      jornadas y grupos generados para <strong>{activeCategory?.name}</strong>.
                    </>
                  )}
                </p>
                {activeCategory?.schedulePublished && (
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mt-2">
                    Nota: Este calendario ya se encuentra publicado; los usuarios recibirán una notificación del retiro.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setDeletingTarget(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirmDeletion}
                className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg"
              >
                {busy ? 'Eliminando...' : 'Confirmar eliminación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
