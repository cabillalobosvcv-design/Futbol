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
  Flag,
  Layers,
  MapPin,
  Moon,
  Plus,
  RefreshCw,
  Send,
  SlidersHorizontal,
  Sun,
  Trash2,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { FieldStatusIcon, MatchStatusIndicator } from '../components/SemanticIcons';
import { TeamCrest } from '../components/TeamCrest';
import { exportToExcel, exportToPdf } from '../engines/exportEngine';
import {
  addDaysToIsoDate,
  detectScheduleConflicts,
  generateTournamentFixtures,
  getValidDatesInRange,
  getWeekdayName,
  getWeekStartMonday,
  groupDatesByWeek,
  type ScheduleGenerationMode,
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
  shiftRoundMatchesByDays,
  updateRoundMatchesDate,
} from '../services/firestoreService';
import type {
  Field,
  Group,
  Match,
  MatchStage,
  MatchStatus,
  Round,
  TournamentFormat,
} from '../types/sigd';

type ScheduleViewMode = 'rounds' | 'calendar' | 'category' | 'team' | 'field';
type FieldAllocationMode = 'ask' | 'specific' | 'unassigned';

interface WeeklyDraftState {
  tournamentId: string;
  categoryId: string;
  replaceExisting: boolean;
  replaceRoundNumbers?: number[];
  fieldSummaryLabel: string;
  rounds: Omit<Round, 'id'>[];
  groups: Omit<Group, 'id'>[];
  teamGroupAssignments: Record<string, string>;
  matches: (Omit<Match, 'id' | 'createdAt' | 'updatedAt'> & { tempId: string })[];
}

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
  const { profile, role } = useAuth();
  const { organizations, tournaments, categories, teams, venues, fields, referees, matches } =
    useSigdData();

  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [viewMode, setViewMode] = useState<ScheduleViewMode>('rounds');
  const [filterTeamId, setFilterTeamId] = useState<string>('all');
  const [filterFieldId, setFilterFieldId] = useState<string>('all');

  // Generator Options (Weekly-oriented)
  const [scheduleMode, setScheduleMode] = useState<ScheduleGenerationMode>('weekly_all');
  const [roundsPerWeek, setRoundsPerWeek] = useState<number>(1);
  const [targetRoundNumber, setTargetRoundNumber] = useState<number>(1);
  const [startDate, setStartDate] = useState('2026-11-21');
  const [endDate, setEndDate] = useState('2027-01-31');
  const [allowedWeekdays, setAllowedWeekdays] = useState<string[]>(['Sábado', 'Domingo']);
  const [selectedTimes, setSelectedTimes] = useState<string[]>(['09:00', '11:00', '13:00', '15:00']);
  const [formatOverride, setFormatOverride] = useState<TournamentFormat | ''>('');
  const [doubleRoundOverride, setDoubleRoundOverride] = useState(false);

  // Editable Weekly Draft Workbench (before persisting to Firestore)
  const [weeklyDraft, setWeeklyDraft] = useState<WeeklyDraftState | null>(null);

  // Specific Field Selection & Interactive Question Prompt
  const [fieldMode, setFieldMode] = useState<FieldAllocationMode>('ask');
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
  const [fieldPromptModal, setFieldPromptModal] = useState<{
    open: boolean;
    replaceExisting: boolean;
    mode: 'specific' | 'unassigned';
    pickedFieldIds: string[];
  } | null>(null);
  const [showQuickFieldForm, setShowQuickFieldForm] = useState(false);
  const [quickFieldName, setQuickFieldName] = useState('');
  const [quickFieldVenueId, setQuickFieldVenueId] = useState('');
  const [quickVenueName, setQuickVenueName] = useState('');
  const [quickFieldSurface, setQuickFieldSurface] = useState('Pasto Sintético');

  const canCreateField = role === 'admin_general' || role === 'admin_deportivo';

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
  const venueMap = useMemo(() => new Map(venues.map((v) => [v.id, v])), [venues]);
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

  const weekBuckets = useMemo(
    () => groupDatesByWeek(startDate, endDate, allowedWeekdays),
    [startDate, endDate, allowedWeekdays]
  );

  const estimatedTotalRounds = useMemo(() => {
    const activeCount = categoryTeams.filter((t) => t.active).length;
    if (activeCount < 2) return 1;
    const fmt = formatOverride || activeTournament?.format || 'round_robin';
    const dbl = doubleRoundOverride || Boolean(activeTournament?.doubleRound);
    if (fmt === 'round_robin') {
      const base = activeCount % 2 === 0 ? activeCount - 1 : activeCount;
      return dbl ? base * 2 : base;
    }
    if (fmt === 'knockout') {
      let size = 2;
      while (size < activeCount) size *= 2;
      return Math.log2(size);
    }
    const perGroup = Math.max(2, activeTournament?.teamsPerGroup || 4);
    const groupBase = perGroup % 2 === 0 ? perGroup - 1 : perGroup;
    const grpRounds = dbl ? groupBase * 2 : groupBase;
    return fmt === 'mixed' ? grpRounds + 2 : grpRounds;
  }, [categoryTeams, formatOverride, doubleRoundOverride, activeTournament]);

  const selectedSpecificFields = useMemo(
    () => fields.filter((f) => selectedFieldIds.includes(f.id)),
    [fields, selectedFieldIds]
  );

  const dynamicPreview = useMemo(() => {
    if (!activeTournament || !activeCategory || categoryTeams.length < 2) {
      return null;
    }
    const previewFields =
      fieldMode === 'specific'
        ? selectedSpecificFields
        : fieldMode === 'unassigned'
          ? []
          : selectedSpecificFields;
    const maxExistingMatchNum = activeCategoryAllMatches.reduce(
      (max, m) => Math.max(max, m.matchNumber),
      0
    );
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
      scheduleMode,
      roundsPerWeek,
      targetRoundNumber,
      daysBetweenRounds: 7,
      defaultTimes: selectedTimes.length > 0 ? selectedTimes : ['09:00'],
      fields: previewFields,
      referees,
      minRestHours: 0,
      startingMatchNumber: scheduleMode === 'single_week' ? maxExistingMatchNum + 1 : 1,
      explicitFields: true,
      occupiedMatches: matches.filter((m) => m.categoryId !== activeCategory.id),
    });
  }, [
    activeTournament,
    activeCategory,
    categoryTeams,
    activeCategoryAllMatches,
    formatOverride,
    doubleRoundOverride,
    startDate,
    endDate,
    allowedWeekdays,
    scheduleMode,
    roundsPerWeek,
    targetRoundNumber,
    selectedTimes,
    fieldMode,
    selectedSpecificFields,
    referees,
    matches,
  ]);

  const draftConflicts = useMemo(() => {
    if (!weeklyDraft) return [];
    const occupied = matches.filter((m) => {
      if (m.categoryId !== weeklyDraft.categoryId) return true;
      if (weeklyDraft.replaceExisting) return false;
      if (weeklyDraft.replaceRoundNumbers?.includes(m.roundNumber)) return false;
      return true;
    });
    const draftAsMatches: Match[] = weeklyDraft.matches.map((m) => ({
      ...m,
      id: m.tempId,
    }));
    return detectScheduleConflicts([...occupied, ...draftAsMatches], fields, referees, 0);
  }, [weeklyDraft, matches, fields, referees]);

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

  const toggleSelectedField = (fieldId: string) => {
    setSelectedFieldIds((prev) =>
      prev.includes(fieldId) ? prev.filter((id) => id !== fieldId) : [...prev, fieldId]
    );
  };

  const handleCreateQuickField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !canCreateField || !quickFieldName.trim()) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      let targetVenueId = quickFieldVenueId || venues[0]?.id || '';
      if (!targetVenueId || quickFieldVenueId === '__NEW_VENUE__') {
        const venueLabel = quickVenueName.trim() || 'Sede Principal';
        targetVenueId = makeId('ven');
        await saveEntityDoc(
          'venues',
          targetVenueId,
          {
            name: venueLabel,
            address: 'Por especificar',
            facilityType: 'Unidad Deportiva',
            active: true,
          },
          true
        );
      }

      const newFieldId = makeId('fld');
      await saveEntityDoc(
        'fields',
        newFieldId,
        {
          venueId: targetVenueId,
          name: quickFieldName.trim(),
          surfaceType: quickFieldSurface.trim() || 'Pasto Sintético',
          capacity: 400,
          availableDays: allowedWeekdays.length > 0 ? allowedWeekdays : [...WEEKDAY_ORDER],
          openTime: '06:00',
          closeTime: '23:00',
          slotDurationMinutes: 60,
          status: 'disponible',
        },
        true
      );
      await createAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        action: 'CREATE_FIELD',
        entity: 'fields',
        entityId: newFieldId,
        summary: `Campo específico registrado desde Generador de Roles: ${quickFieldName.trim()}`,
      });

      setFieldMode('specific');
      setSelectedFieldIds((prev) => Array.from(new Set([...prev, newFieldId])));
      setFieldPromptModal((prev) =>
        prev
          ? {
              ...prev,
              mode: 'specific',
              pickedFieldIds: Array.from(new Set([...prev.pickedFieldIds, newFieldId])),
            }
          : prev
      );
      setQuickFieldName('');
      setQuickVenueName('');
      setShowQuickFieldForm(false);
    } catch {
      setErrorMsg('No se pudo registrar el nuevo campo. Verifica tus permisos.');
    } finally {
      setBusy(false);
    }
  };

  const buildWeeklyResult = (
    replaceExisting: boolean,
    targetFields: Field[],
    targetMode: 'specific' | 'unassigned'
  ) => {
    if (!activeTournament || !activeCategory) return null;
    const effectiveFields = targetMode === 'unassigned' ? [] : targetFields;
    const replaceRoundNumbers =
      !replaceExisting && scheduleMode === 'single_week' ? [targetRoundNumber] : undefined;

    const existingRemaining = activeCategoryAllMatches.filter((m) => {
      if (replaceExisting) return false;
      if (replaceRoundNumbers?.includes(m.roundNumber)) return false;
      return true;
    });
    const nextMatchNum =
      existingRemaining.reduce((max, m) => Math.max(max, m.matchNumber), 0) + 1;

    const occupied = matches.filter((m) => {
      if (m.categoryId !== activeCategory.id) return true;
      if (replaceExisting) return false;
      if (replaceRoundNumbers?.includes(m.roundNumber)) return false;
      return true;
    });

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
      scheduleMode,
      roundsPerWeek,
      targetRoundNumber,
      daysBetweenRounds: 7,
      defaultTimes: selectedTimes,
      fields: effectiveFields,
      referees,
      minRestHours: 0,
      startingMatchNumber: replaceExisting ? 1 : nextMatchNum,
      explicitFields: true,
      occupiedMatches: occupied,
    });

    const fieldSummaryLabel =
      targetMode === 'unassigned' || effectiveFields.length === 0
        ? 'Sin campo asignado'
        : `Campo(s): ${effectiveFields.map((f) => f.name).join(', ')}`;

    return {
      result,
      replaceRoundNumbers,
      fieldSummaryLabel,
    };
  };

  const executeGenerate = async (
    replaceExisting: boolean,
    targetFields: Field[],
    targetMode: 'specific' | 'unassigned',
    openDraftFirst = true
  ) => {
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

    const built = buildWeeklyResult(replaceExisting, targetFields, targetMode);
    if (!built) return;
    const { result, replaceRoundNumbers, fieldSummaryLabel } = built;

    if (openDraftFirst) {
      setErrorMsg(null);
      setWeeklyDraft({
        tournamentId: activeTournament.id,
        categoryId: activeCategory.id,
        replaceExisting,
        replaceRoundNumbers,
        fieldSummaryLabel,
        rounds: result.rounds,
        groups: result.groups,
        teamGroupAssignments: result.teamGroupAssignments,
        matches: result.matches,
      });
      setFeedback(
        `Borrador semanal generado (${result.matches.length} partidos en ${result.rounds.length} jornada(s)). Realiza los ajustes que necesites y presiona "Guardar Roles en Calendario".`
      );
      return;
    }

    setBusy(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      await persistGeneratedSchedule({
        tournamentId: activeTournament.id,
        categoryId: activeCategory.id,
        rounds: result.rounds,
        groups: result.groups,
        teamGroupAssignments: result.teamGroupAssignments,
        matches: result.matches,
        replaceExisting,
        replaceRoundNumbers,
        actorUid: profile.uid,
        actorName: profile.displayName,
      });

      setWeeklyDraft(null);
      setFeedback(
        `Calendario semanal guardado con ${result.matches.length} encuentros en ${result.rounds.length} jornada(s) (${startDate} al ${endDate}) · ${fieldSummaryLabel}. Conflictos detectados: ${result.conflicts.length}.`
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSaveWeeklyDraft = async () => {
    if (!profile || !weeklyDraft) return;
    if (weeklyDraft.matches.length === 0) {
      setErrorMsg('El borrador no contiene partidos. Agrega al menos un partido o descarta el borrador.');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    setFeedback(null);
    try {
      // Derive clean rounds metadata from current draft matches
      const roundsByNum = new Map<number, Omit<Round, 'id'>>();
      weeklyDraft.rounds.forEach((r) => roundsByNum.set(r.roundNumber, { ...r }));
      weeklyDraft.matches.forEach((m) => {
        const existing = roundsByNum.get(m.roundNumber);
        if (!existing) {
          roundsByNum.set(m.roundNumber, {
            tournamentId: weeklyDraft.tournamentId,
            categoryId: weeklyDraft.categoryId,
            roundNumber: m.roundNumber,
            name: `Jornada ${m.roundNumber}`,
            stage: m.stage,
            startDate: m.date,
          });
        } else if (!existing.startDate || m.date < existing.startDate) {
          existing.startDate = m.date;
        }
      });
      const activeRoundNumbers = new Set(weeklyDraft.matches.map((m) => m.roundNumber));
      const finalRounds = Array.from(roundsByNum.values())
        .filter((r) => activeRoundNumbers.has(r.roundNumber))
        .sort((a, b) => a.roundNumber - b.roundNumber);

      await persistGeneratedSchedule({
        tournamentId: weeklyDraft.tournamentId,
        categoryId: weeklyDraft.categoryId,
        rounds: finalRounds,
        groups: weeklyDraft.groups,
        teamGroupAssignments: weeklyDraft.teamGroupAssignments,
        matches: weeklyDraft.matches,
        replaceExisting: weeklyDraft.replaceExisting,
        replaceRoundNumbers: weeklyDraft.replaceRoundNumbers,
        actorUid: profile.uid,
        actorName: profile.displayName,
      });

      const savedCount = weeklyDraft.matches.length;
      const savedRoundsCount = finalRounds.length;
      const label = weeklyDraft.fieldSummaryLabel;
      setWeeklyDraft(null);
      setFeedback(
        `Roles guardados oficialmente en el calendario: ${savedCount} encuentros en ${savedRoundsCount} jornada(s) · ${label}.`
      );
    } catch {
      setErrorMsg('No se pudieron guardar los roles ajustados en Firestore.');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateDraftMatch = (
    tempId: string,
    patch: Partial<Omit<Match, 'id' | 'createdAt' | 'updatedAt'>>
  ) => {
    setWeeklyDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        matches: prev.matches.map((m) => {
          if (m.tempId !== tempId) return m;
          const updated = { ...m, ...patch };
          if (patch.fieldId !== undefined) {
            updated.venueId = patch.fieldId
              ? fieldMap.get(patch.fieldId)?.venueId || ''
              : '';
          }
          return updated;
        }),
      };
    });
  };

  const handleSwapDraftTeams = (tempId: string) => {
    setWeeklyDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        matches: prev.matches.map((m) =>
          m.tempId === tempId
            ? { ...m, homeTeamId: m.awayTeamId, awayTeamId: m.homeTeamId }
            : m
        ),
      };
    });
  };

  const handleShiftDraftRound = (roundNumber: number, deltaDays: number) => {
    setWeeklyDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rounds: prev.rounds.map((r) =>
          r.roundNumber === roundNumber && r.startDate
            ? { ...r, startDate: addDaysToIsoDate(r.startDate, deltaDays) }
            : r
        ),
        matches: prev.matches.map((m) =>
          m.roundNumber === roundNumber
            ? { ...m, date: addDaysToIsoDate(m.date, deltaDays) }
            : m
        ),
      };
    });
  };

  const handleAddDraftMatch = (roundNumber: number) => {
    if (!weeklyDraft || categoryTeams.length < 2) return;
    const roundSample = weeklyDraft.matches.find((m) => m.roundNumber === roundNumber);
    const nextSeq =
      weeklyDraft.matches.reduce((max, m) => Math.max(max, m.matchNumber), 0) + 1;
    const defaultFieldId =
      roundSample?.fieldId || selectedFieldIds[0] || fields[0]?.id || '';
    const defaultVenueId = defaultFieldId ? fieldMap.get(defaultFieldId)?.venueId || '' : '';
    const newMatch: Omit<Match, 'id' | 'createdAt' | 'updatedAt'> & { tempId: string } = {
      tempId: `tmp_manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      matchNumber: nextSeq,
      tournamentId: weeklyDraft.tournamentId,
      categoryId: weeklyDraft.categoryId,
      roundNumber,
      stage: roundSample?.stage || 'regular',
      date: roundSample?.date || startDate,
      time: selectedTimes[0] || '09:00',
      venueId: defaultVenueId,
      fieldId: defaultFieldId,
      homeTeamId: categoryTeams[0].id,
      awayTeamId: categoryTeams[1].id,
      refereeId: '',
      status: 'Programado',
      published: false,
    };
    setWeeklyDraft((prev) =>
      prev ? { ...prev, matches: [...prev.matches, newMatch] } : prev
    );
  };

  const handleRemoveDraftMatch = (tempId: string) => {
    setWeeklyDraft((prev) =>
      prev
        ? { ...prev, matches: prev.matches.filter((m) => m.tempId !== tempId) }
        : prev
    );
  };

  const handleGenerateClick = (replaceExisting: boolean, overrideRound?: number) => {
    setErrorMsg(null);
    if (!activeTournament || !activeCategory) return;
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

    if (overrideRound !== undefined) {
      setScheduleMode('single_week');
      setTargetRoundNumber(overrideRound);
    }

    setShowQuickFieldForm(false);
    setFieldPromptModal({
      open: true,
      replaceExisting,
      mode: fieldMode === 'unassigned' ? 'unassigned' : 'specific',
      pickedFieldIds: fieldMode === 'specific' ? [...selectedFieldIds] : [],
    });
  };

  const handleQuickSwapSavedMatch = async (m: Match) => {
    if (!profile) return;
    const runSwap = async () => {
      setBusy(true);
      setErrorMsg(null);
      setFeedback(null);
      try {
        await saveEntityDoc(
          'matches',
          m.id,
          {
            homeTeamId: m.awayTeamId,
            awayTeamId: m.homeTeamId,
          },
          false
        );
        await createAuditLog({
          actorUid: profile.uid,
          actorName: profile.displayName,
          action: 'SWAP_MATCH_SIDES',
          entity: 'matches',
          entityId: m.id,
          summary: `Localía intercambiada en partido #${m.matchNumber} (J${m.roundNumber}).`,
        });
        setFeedback(`Localía intercambiada en el partido #${m.matchNumber}.`);
      } catch {
        setErrorMsg('No se pudo intercambiar la localía del encuentro.');
      } finally {
        setBusy(false);
      }
    };

    if (m.published) {
      setConfirmPublishedModal({
        open: true,
        actionLabel: `Intercambiar Local ↔ Visitante del partido #${m.matchNumber} en un calendario publicado`,
        onConfirm: async () => {
          setConfirmPublishedModal(null);
          await runSwap();
        },
      });
      return;
    }
    await runSwap();
  };

  const handleShiftSavedRoundWeek = async (roundNumber: number, deltaDays: number) => {
    if (!profile || !activeCategory) return;
    const runShift = async () => {
      setBusy(true);
      setErrorMsg(null);
      setFeedback(null);
      try {
        const count = await shiftRoundMatchesByDays({
          categoryId: activeCategory.id,
          categoryName: activeCategory.name,
          roundNumber,
          deltaDays,
          wasPublished: Boolean(activeCategory.schedulePublished),
          actorUid: profile.uid,
          actorName: profile.displayName,
        });
        const label = deltaDays > 0 ? `+${deltaDays}` : `${deltaDays}`;
        setFeedback(
          `Jornada ${roundNumber} recorrida ${label} días (${count} partidos actualizados manteniendo sus días).`
        );
      } catch {
        setErrorMsg('No se pudo recorrer la semana de la jornada.');
      } finally {
        setBusy(false);
      }
    };

    if (activeCategory.schedulePublished) {
      setConfirmPublishedModal({
        open: true,
        actionLabel: `Recorrer ${deltaDays > 0 ? `+${deltaDays}` : deltaDays} días la Jornada ${roundNumber} de un calendario ya publicado`,
        onConfirm: async () => {
          setConfirmPublishedModal(null);
          await runShift();
        },
      });
      return;
    }
    await runShift();
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
              Parámetros del Generador Semanal de Roles
            </h2>
          </div>
          {dynamicPreview && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/50 text-electric-600 dark:text-blue-300">
              Estimación: {dynamicPreview.matches.length} partidos · {dynamicPreview.rounds.length}{' '}
              jornada(s) · {weekBuckets.length} semana(s) hábiles
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
                setWeeklyDraft(null);
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
              onChange={(e) => {
                setSelectedCategoryId(e.target.value);
                setWeeklyDraft(null);
              }}
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

        {/* Planificación por Semana */}
        <div className="p-4 rounded-xl border border-blue-200/80 dark:border-blue-900/70 bg-blue-50/40 dark:bg-blue-950/20 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-electric-500" />
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Modo de generación por semana
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => setScheduleMode('weekly_all')}
                className={`px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                  scheduleMode === 'weekly_all'
                    ? 'bg-navy-900 dark:bg-electric-500 text-white border-navy-900 dark:border-electric-500'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Rol semanal completo (todas las jornadas)
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextPendingRound =
                    (categoryRoundsSummary[categoryRoundsSummary.length - 1]?.roundNumber || 0) + 1;
                  setScheduleMode('single_week');
                  setTargetRoundNumber(Math.min(estimatedTotalRounds, nextPendingRound));
                }}
                className={`px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                  scheduleMode === 'single_week'
                    ? 'bg-navy-900 dark:bg-electric-500 text-white border-navy-900 dark:border-electric-500'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Solo una semana / jornada específica
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            {scheduleMode === 'weekly_all' ? (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Ritmo semanal
                </label>
                <select
                  value={roundsPerWeek}
                  onChange={(e) => setRoundsPerWeek(Number(e.target.value) || 1)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                >
                  <option value={1}>1 jornada por semana (estándar)</option>
                  <option value={2}>2 jornadas por semana (doble)</option>
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Jornada a generar para esta semana
                </label>
                <select
                  value={targetRoundNumber}
                  onChange={(e) => setTargetRoundNumber(Number(e.target.value) || 1)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                >
                  {Array.from({ length: Math.max(1, estimatedTotalRounds) }, (_, i) => i + 1).map(
                    (rn) => {
                      const alreadySaved = categoryRoundsSummary.some((r) => r.roundNumber === rn);
                      return (
                        <option key={rn} value={rn}>
                          Jornada {rn} {alreadySaved ? '(ya existe — se actualizará)' : '(pendiente)'}
                        </option>
                      );
                    }
                  )}
                </select>
              </div>
            )}

            <div className="sm:col-span-1 lg:col-span-3 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              {scheduleMode === 'single_week' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (startDate) setEndDate(addDaysToIsoDate(startDate, 6));
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                  >
                    Ajustar rango a 1 semana (+6 días)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (startDate) {
                        const nextStart = addDaysToIsoDate(startDate, 7);
                        setStartDate(nextStart);
                        setEndDate(addDaysToIsoDate(nextStart, 6));
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                  >
                    Avanzar a semana siguiente (+7d)
                  </button>
                </>
              )}
              {weekBuckets.length > 0 && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Semanas detectadas: <strong>{weekBuckets.length}</strong> (
                  {weekBuckets
                    .slice(0, 4)
                    .map((wb) => `S${wb.weekNumber}: ${wb.dates[0].slice(5)}`)
                    .join(' · ')}
                  {weekBuckets.length > 4 ? ` · +${weekBuckets.length - 4} más` : ''})
                </span>
              )}
            </div>
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
                className="group inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Sun className="w-3 h-3 text-amber-500 transition-transform duration-150 group-hover:scale-110" />
                Mañana (08–12)
              </button>
              <button
                type="button"
                onClick={() =>
                  setSelectedTimes(['13:00', '14:00', '15:00', '16:00', '17:00', '18:00'])
                }
                className="group inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Clock className="w-3 h-3 text-orange-500 transition-transform duration-150 group-hover:scale-110" />
                Tarde (13–18)
              </button>
              <button
                type="button"
                onClick={() => setSelectedTimes(['19:00', '20:00', '21:00', '22:00'])}
                className="group inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Moon className="w-3 h-3 text-indigo-500 dark:text-indigo-400 transition-transform duration-150 group-hover:scale-110" />
                Noche (19–22)
              </button>
              <button
                type="button"
                onClick={() => setSelectedTimes([...HOURLY_TIME_SLOTS])}
                className="group inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 transition-transform duration-150 group-hover:scale-110" />
                Todos
              </button>
              <button
                type="button"
                onClick={() => setSelectedTimes([])}
                className="group inline-flex items-center gap-1 px-2.5 py-1 rounded border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
              >
                <Trash2 className="w-3 h-3 transition-transform duration-150 group-hover:scale-110" />
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

        {/* Apartado: Campo / Cancha específica para el rol */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-electric-500" />
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Campo / Cancha donde se generará el rol
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => setFieldMode('ask')}
                className={`px-2.5 py-1 rounded-md border font-medium transition-colors ${
                  fieldMode === 'ask'
                    ? 'bg-navy-900 dark:bg-electric-500 text-white border-navy-900 dark:border-electric-500'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Preguntar al generar
              </button>
              <button
                type="button"
                onClick={() => setFieldMode('specific')}
                className={`px-2.5 py-1 rounded-md border font-medium transition-colors ${
                  fieldMode === 'specific'
                    ? 'bg-navy-900 dark:bg-electric-500 text-white border-navy-900 dark:border-electric-500'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Campo específico ({selectedFieldIds.length})
              </button>
              <button
                type="button"
                onClick={() => setFieldMode('unassigned')}
                className={`px-2.5 py-1 rounded-md border font-medium transition-colors ${
                  fieldMode === 'unassigned'
                    ? 'bg-navy-900 dark:bg-electric-500 text-white border-navy-900 dark:border-electric-500'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Sin campo asignado
              </button>
            </div>
          </div>

          {fieldMode === 'ask' && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2.5">
              <span>
                El rol <strong>no</strong> se asignará automáticamente a los campos existentes: al presionar{' '}
                <strong>Generar Roles</strong> se te preguntará en qué campo específico deseas generarlo.
              </span>
              <button
                type="button"
                onClick={() => setFieldMode('specific')}
                className="text-xs font-semibold text-electric-600 dark:text-blue-400 hover:underline shrink-0"
              >
                Preseleccionar campo ahora
              </button>
            </div>
          )}

          {fieldMode === 'unassigned' && (
            <div className="text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2.5">
              Los partidos se crearán con la cancha en <strong>Sin asignar</strong> (al confirmar al generar podrás cambiar de opinión si lo deseas).
            </div>
          )}

          {fieldMode === 'specific' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Marca el o los campos específicos que se usarán (al generar también se te pedirá confirmar):
                </span>
                {canCreateField && (
                  <button
                    type="button"
                    onClick={() => setShowQuickFieldForm((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-electric-600 dark:text-blue-400 hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {showQuickFieldForm ? 'Cerrar registro rápido' : 'Registrar otro campo específico'}
                  </button>
                )}
              </div>

              {showQuickFieldForm && canCreateField && (
                <form
                  onSubmit={handleCreateQuickField}
                  className="grid grid-cols-1 sm:grid-cols-4 gap-2 p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                >
                  <input
                    type="text"
                    required
                    value={quickFieldName}
                    onChange={(e) => setQuickFieldName(e.target.value)}
                    placeholder="Nombre del campo (ej. Campo Norte)"
                    className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                  <select
                    value={quickFieldVenueId || venues[0]?.id || '__NEW_VENUE__'}
                    onChange={(e) => setQuickFieldVenueId(e.target.value)}
                    className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    {venues.map((v) => (
                      <option key={v.id} value={v.id}>
                        Sede: {v.name}
                      </option>
                    ))}
                    <option value="__NEW_VENUE__">+ Nueva sede</option>
                  </select>
                  {(quickFieldVenueId === '__NEW_VENUE__' || venues.length === 0) ? (
                    <input
                      type="text"
                      required
                      value={quickVenueName}
                      onChange={(e) => setQuickVenueName(e.target.value)}
                      placeholder="Nombre de nueva sede"
                      className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  ) : (
                    <input
                      type="text"
                      value={quickFieldSurface}
                      onChange={(e) => setQuickFieldSurface(e.target.value)}
                      placeholder="Superficie (ej. Pasto Sintético)"
                      className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  )}
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-navy-900 dark:bg-electric-500 hover:bg-navy-800 dark:hover:bg-electric-600 rounded-lg"
                  >
                    {busy ? 'Guardando...' : 'Guardar campo'}
                  </button>
                </form>
              )}

              {fields.length === 0 ? (
                <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
                  No hay campos registrados aún. Registra uno arriba o genera el rol sin campo asignado.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {fields.map((f) => {
                    const checked = selectedFieldIds.includes(f.id);
                    const venueName = venueMap.get(f.venueId)?.name || 'Sede';
                    return (
                      <label
                        key={f.id}
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          checked
                            ? 'bg-navy-900 dark:bg-electric-500/20 text-white dark:text-white border-navy-900 dark:border-electric-500'
                            : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelectedField(f.id)}
                          className="mt-0.5 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-xs font-semibold truncate">{f.name}</span>
                            <FieldStatusIcon status={f.status} className="w-3.5 h-3.5" />
                          </div>
                          <div
                            className={`text-[11px] truncate ${
                              checked ? 'text-slate-200' : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {venueName} · {f.openTime}–{f.closeTime} · {f.status}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
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
          scheduleMode === 'weekly_all' &&
          weekBuckets.length > 0 &&
          dynamicPreview.rounds.length > weekBuckets.length * roundsPerWeek && (
            <div className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
              El rol completo requiere {dynamicPreview.rounds.length} jornadas (1 cada semana), pero
              el rango seleccionado abarca {weekBuckets.length} semana(s) hábil(es). Las últimas
              jornadas compartirán semana o puedes ampliar la Fecha de fin.
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
            onClick={() =>
              handleGenerateClick(
                scheduleMode === 'weekly_all' && categoryMatches.length > 0
              )
            }
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-electric-500 hover:bg-electric-600 text-white text-sm font-medium disabled:opacity-50"
          >
            <CalendarDays className="w-4 h-4" />
            {scheduleMode === 'single_week'
              ? `Generar Jornada ${targetRoundNumber} (Semana)`
              : categoryMatches.length > 0
                ? 'Generar Borrador Semanal Completo'
                : 'Generar Roles por Semana'}
          </button>
          {categoryMatches.length > 0 && scheduleMode === 'weekly_all' && (
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
              Reemplazar todo el calendario
            </button>
          )}
        </div>
      </div>

      {/* Editable Weekly Draft Workbench (Ajustes antes de guardar) */}
      {weeklyDraft && (
        <div className="bg-white dark:bg-slate-900 border-2 border-electric-500 dark:border-blue-500 rounded-xl overflow-hidden shadow-sm transition-colors">
          <div className="px-5 py-4 bg-blue-50/80 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-900 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-electric-500 text-white text-[11px] font-semibold uppercase tracking-wide">
                  Borrador Semanal Editable
                </span>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {weeklyDraft.matches.length} partido(s) · {weeklyDraft.fieldSummaryLabel}
                </span>
                {draftConflicts.length > 0 ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-xs font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {draftConflicts.length} observación(es) de horario/cancha
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Sin conflictos
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                Ajusta directamente equipos, localía, fecha, hora, cancha, árbitro o jornada de cualquier encuentro antes de guardar en el calendario.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={busy}
                onClick={() => setWeeklyDraft(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Descartar borrador
              </button>
              <button
                type="button"
                disabled={busy || weeklyDraft.matches.length === 0}
                onClick={handleSaveWeeklyDraft}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {busy ? 'Guardando...' : 'Confirmar y Guardar Roles'}
              </button>
            </div>
          </div>

          {draftConflicts.length > 0 && (
            <div className="px-5 py-2.5 bg-amber-50/70 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-200">
              <ul className="list-disc pl-4 space-y-0.5">
                {draftConflicts.slice(0, 5).map((c) => (
                  <li key={c.id}>{c.description}</li>
                ))}
                {draftConflicts.length > 5 && (
                  <li>... y {draftConflicts.length - 5} observación(es) adicional(es).</li>
                )}
              </ul>
            </div>
          )}

          <div className="p-4 space-y-4">
            {Array.from(new Set(weeklyDraft.matches.map((m) => m.roundNumber)))
              .sort((a, b) => a - b)
              .map((rn) => {
                const roundMatches = weeklyDraft.matches
                  .filter((m) => m.roundNumber === rn)
                  .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
                const firstDate = roundMatches[0]?.date || startDate;
                const weekStart = getWeekStartMonday(firstDate);
                const weekEnd = addDaysToIsoDate(weekStart, 6);

                return (
                  <div
                    key={rn}
                    className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
                  >
                    <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display font-bold text-sm text-navy-900 dark:text-white">
                          Jornada {rn}
                        </span>
                        <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                          Semana del {weekStart} al {weekEnd} ({roundMatches.length} partido(s))
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <button
                          type="button"
                          onClick={() => handleShiftDraftRound(rn, -7)}
                          className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                        >
                          -7 días
                        </button>
                        <button
                          type="button"
                          onClick={() => handleShiftDraftRound(rn, 7)}
                          className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                        >
                          +7 días
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddDraftMatch(rn)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-electric-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/60 font-medium"
                        >
                          <Plus className="w-3 h-3" />
                          Agregar partido
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                            <th className="py-2 px-3 text-left">#</th>
                            <th className="py-2 px-3 text-left">Local vs Visitante</th>
                            <th className="py-2 px-3 text-left">Fecha</th>
                            <th className="py-2 px-3 text-left">Hora</th>
                            <th className="py-2 px-3 text-left">Cancha</th>
                            <th className="py-2 px-3 text-left">Árbitro</th>
                            <th className="py-2 px-3 text-left">Jor.</th>
                            <th className="py-2 px-3 text-right">Quitar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {roundMatches.map((dm) => {
                            const draftTeamOptions = categoryTeams;
                            const hourChoices = Array.from(
                              new Set([dm.time, ...HOURLY_TIME_SLOTS])
                            ).sort((a, b) => a.localeCompare(b));
                            return (
                              <tr key={dm.tempId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                                <td className="py-2 px-3 font-mono text-slate-500 dark:text-slate-400">
                                  #{dm.matchNumber}
                                </td>
                                <td className="py-2 px-3">
                                  <div className="flex items-center gap-1.5 min-w-[270px]">
                                    <select
                                      value={dm.homeTeamId}
                                      onChange={(e) =>
                                        handleUpdateDraftMatch(dm.tempId, {
                                          homeTeamId: e.target.value,
                                        })
                                      }
                                      className="flex-1 min-w-0 px-2 py-1 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
                                    >
                                      {dm.homeTeamId.startsWith('TBD') && (
                                        <option value={dm.homeTeamId}>{dm.homeTeamId}</option>
                                      )}
                                      {draftTeamOptions.map((t) => (
                                        <option key={t.id} value={t.id}>
                                          {t.name}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => handleSwapDraftTeams(dm.tempId)}
                                      title="Intercambiar Local ↔ Visitante"
                                      className="p-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-electric-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 shrink-0"
                                    >
                                      <ArrowLeftRight className="w-3.5 h-3.5" />
                                    </button>
                                    <select
                                      value={dm.awayTeamId}
                                      onChange={(e) =>
                                        handleUpdateDraftMatch(dm.tempId, {
                                          awayTeamId: e.target.value,
                                        })
                                      }
                                      className="flex-1 min-w-0 px-2 py-1 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
                                    >
                                      {dm.awayTeamId.startsWith('TBD') && (
                                        <option value={dm.awayTeamId}>{dm.awayTeamId}</option>
                                      )}
                                      {draftTeamOptions.map((t) => (
                                        <option key={t.id} value={t.id}>
                                          {t.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </td>
                                <td className="py-2 px-3">
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="date"
                                      value={dm.date}
                                      onChange={(e) =>
                                        handleUpdateDraftMatch(dm.tempId, { date: e.target.value })
                                      }
                                      className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                                    />
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                      {WEEKDAY_SHORT_LABELS[getWeekdayName(dm.date)] || ''}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2 px-3">
                                  <select
                                    value={dm.time}
                                    onChange={(e) =>
                                      handleUpdateDraftMatch(dm.tempId, { time: e.target.value })
                                    }
                                    className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                                  >
                                    {hourChoices.map((hr) => (
                                      <option key={hr} value={hr}>
                                        {hr}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="py-2 px-3">
                                  <select
                                    value={dm.fieldId || ''}
                                    onChange={(e) =>
                                      handleUpdateDraftMatch(dm.tempId, {
                                        fieldId: e.target.value,
                                      })
                                    }
                                    className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 max-w-[150px]"
                                  >
                                    <option value="">Sin asignar</option>
                                    {fields.map((f) => (
                                      <option key={f.id} value={f.id}>
                                        {f.name}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="py-2 px-3">
                                  <select
                                    value={dm.refereeId || ''}
                                    onChange={(e) =>
                                      handleUpdateDraftMatch(dm.tempId, {
                                        refereeId: e.target.value,
                                      })
                                    }
                                    className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 max-w-[140px]"
                                  >
                                    <option value="">Sin asignar</option>
                                    {referees.map((r) => (
                                      <option key={r.id} value={r.id}>
                                        {r.fullName}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="py-2 px-3">
                                  <input
                                    type="number"
                                    min={1}
                                    max={100}
                                    value={dm.roundNumber}
                                    onChange={(e) =>
                                      handleUpdateDraftMatch(dm.tempId, {
                                        roundNumber: Math.max(1, Number(e.target.value) || 1),
                                      })
                                    }
                                    className="w-14 px-2 py-1 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-center"
                                  />
                                </td>
                                <td className="py-2 px-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveDraftMatch(dm.tempId)}
                                    title="Quitar encuentro del borrador"
                                    className="p-1 rounded text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

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
              {
                id: 'rounds',
                label: 'Vista de Jornadas',
                icon: Layers,
                color: 'text-violet-600 dark:text-violet-400',
              },
              {
                id: 'calendar',
                label: 'Vista de Calendario',
                icon: CalendarDays,
                color: 'text-blue-600 dark:text-blue-400',
              },
              {
                id: 'category',
                label: 'Vista por Categoría',
                icon: Trophy,
                color: 'text-amber-600 dark:text-amber-400',
              },
              {
                id: 'team',
                label: 'Vista por Equipo',
                icon: Users,
                color: 'text-emerald-600 dark:text-emerald-400',
              },
              {
                id: 'field',
                label: 'Vista por Cancha',
                icon: MapPin,
                color: 'text-teal-600 dark:text-teal-400',
              },
            ] as { id: ScheduleViewMode; label: string; icon: typeof Layers; color: string }[]
          ).map((v) => {
            const ViewIcon = v.icon;
            const isActive = viewMode === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setViewMode(v.id)}
                className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-navy-900 dark:bg-electric-500 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <ViewIcon
                  className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 group-hover:scale-110 ${
                    isActive ? 'text-white' : v.color
                  }`}
                />
                {v.label}
              </button>
            );
          })}
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

        {/* Round-level Modify, Shift Week & Delete Bar */}
        {activeCategory && categoryRoundsSummary.length > 0 && viewMode !== 'category' && (
          <div className="px-5 py-3 bg-slate-50/80 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 mr-1">
              Semanas / Jornadas:
            </span>
            {categoryRoundsSummary.map((rnd) => (
              <div
                key={rnd.roundNumber}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
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
                  title={`Recorrer Jornada ${rnd.roundNumber} una semana atrás (-7 días)`}
                  onClick={() => handleShiftSavedRoundWeek(rnd.roundNumber, -7)}
                  className="px-1 py-0.5 rounded text-[10px] font-mono text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  -7d
                </button>
                <button
                  type="button"
                  disabled={busy}
                  title={`Recorrer Jornada ${rnd.roundNumber} una semana adelante (+7 días)`}
                  onClick={() => handleShiftSavedRoundWeek(rnd.roundNumber, 7)}
                  className="px-1 py-0.5 rounded text-[10px] font-mono text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  +7d
                </button>
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
                  title={`Regenerar Jornada ${rnd.roundNumber}`}
                  onClick={() => handleGenerateClick(false, rnd.roundNumber)}
                  className="p-1 rounded text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                >
                  <RefreshCw className="w-3 h-3" />
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
            No hay encuentros generados para esta selección. Configura los parámetros arriba y presiona "Generar Roles por Semana" o agrega un partido manual.
          </div>
        ) : viewMode === 'rounds' ? (
          <div className="p-4 space-y-4">
            {Array.from(new Set(categoryMatches.map((m) => m.roundNumber)))
              .sort((a, b) => a - b)
              .map((rn) => {
                const roundList = categoryMatches.filter((m) => m.roundNumber === rn);
                const firstDate = roundList[0]?.date || startDate;
                const weekStart = getWeekStartMonday(firstDate);
                const weekEnd = addDaysToIsoDate(weekStart, 6);
                return (
                  <div
                    key={rn}
                    className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
                  >
                    <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display font-bold text-sm text-navy-900 dark:text-white">
                          Jornada {rn}
                        </span>
                        <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                          Semana del {weekStart} al {weekEnd} · {roundList.length} partido(s)
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleShiftSavedRoundWeek(rn, -7)}
                          className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                        >
                          -7 días
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleShiftSavedRoundWeek(rn, 7)}
                          className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium"
                        >
                          +7 días
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setEditingRound({
                              roundNumber: rn,
                              currentDate: firstDate,
                              matchCount: roundList.length,
                            });
                            setRoundNewDate(firstDate);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-electric-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 font-medium"
                        >
                          <Edit3 className="w-3 h-3" />
                          Cambiar fecha
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleGenerateClick(false, rn)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 font-medium"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Regenerar jornada
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-white dark:bg-slate-900 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                            <th className="py-2.5 px-4 text-left font-medium">#</th>
                            <th className="py-2.5 px-4 text-left font-medium">Fecha y Hora</th>
                            <th className="py-2.5 px-4 text-left font-medium">Local vs Visitante</th>
                            <th className="py-2.5 px-4 text-left font-medium">Cancha</th>
                            <th className="py-2.5 px-4 text-left font-medium">Árbitro</th>
                            <th className="py-2.5 px-4 text-left font-medium">Estado</th>
                            <th className="py-2.5 px-4 text-right font-medium">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {roundList.map((m) => (
                            <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                              <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                                {m.matchNumber}
                              </td>
                              <td className="py-2.5 px-4 font-mono tabular-nums text-slate-800 dark:text-slate-200 whitespace-nowrap text-xs">
                                <span className="inline-flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                                  <span>
                                    {WEEKDAY_SHORT_LABELS[getWeekdayName(m.date)] || ''} {m.date} ·{' '}
                                    {m.time}
                                  </span>
                                </span>
                              </td>
                              <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-slate-100">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <TeamCrest
                                    name={teamMap.get(m.homeTeamId)?.name || m.homeTeamId}
                                    shortCode={teamMap.get(m.homeTeamId)?.shortCode || 'LOC'}
                                    primaryColor={teamMap.get(m.homeTeamId)?.primaryColor}
                                    secondaryColor={teamMap.get(m.homeTeamId)?.secondaryColor}
                                    crestUrl={teamMap.get(m.homeTeamId)?.crestUrl}
                                    size="sm"
                                  />
                                  <span>{teamMap.get(m.homeTeamId)?.name || m.homeTeamId}</span>
                                  <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
                                    vs
                                  </span>
                                  <TeamCrest
                                    name={teamMap.get(m.awayTeamId)?.name || m.awayTeamId}
                                    shortCode={teamMap.get(m.awayTeamId)?.shortCode || 'VIS'}
                                    primaryColor={teamMap.get(m.awayTeamId)?.primaryColor}
                                    secondaryColor={teamMap.get(m.awayTeamId)?.secondaryColor}
                                    crestUrl={teamMap.get(m.awayTeamId)?.crestUrl}
                                    size="sm"
                                  />
                                  <span>{teamMap.get(m.awayTeamId)?.name || m.awayTeamId}</span>
                                </div>
                              </td>
                              <td className="py-2.5 px-4 text-xs">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => openMatchEditor(m)}
                                  title="Clic para cambiar la cancha de este partido"
                                  className="group inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300 hover:text-teal-700 dark:hover:text-teal-300 transition-colors cursor-pointer"
                                >
                                  <MapPin
                                    className={`w-3.5 h-3.5 shrink-0 ${
                                      m.fieldId
                                        ? 'text-teal-600 dark:text-teal-400'
                                        : 'text-slate-400 dark:text-slate-500'
                                    }`}
                                  />
                                  <span>
                                    {m.fieldId
                                      ? fieldMap.get(m.fieldId)?.name || 'Sin asignar'
                                      : 'Sin asignar'}
                                  </span>
                                </button>
                              </td>
                              <td className="py-2.5 px-4 text-xs">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => openMatchEditor(m)}
                                  title="Clic para asignar o cambiar el árbitro"
                                  className="group inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300 hover:text-amber-700 dark:hover:text-amber-300 transition-colors cursor-pointer"
                                >
                                  <Flag
                                    className={`w-3.5 h-3.5 shrink-0 ${
                                      m.refereeId
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : 'text-slate-400 dark:text-slate-500'
                                    }`}
                                  />
                                  <span>
                                    {m.refereeId
                                      ? refMap.get(m.refereeId)?.fullName || 'Sin asignar'
                                      : 'Sin asignar'}
                                  </span>
                                </button>
                              </td>
                              <td className="py-2.5 px-4 text-xs">
                                <MatchStatusIndicator
                                  status={m.status}
                                  onClick={() => openMatchEditor(m)}
                                  title="Clic para editar el estado del partido"
                                />
                              </td>
                              <td className="py-2.5 px-4 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    disabled={busy}
                                    title="Intercambiar Local ↔ Visitante"
                                    onClick={() => handleQuickSwapSavedMatch(m)}
                                    className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md"
                                  >
                                    <ArrowLeftRight className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => openMatchEditor(m)}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-electric-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-md"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                    Modificar
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => setDeletingTarget({ type: 'match', match: m })}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-md"
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
                  </div>
                );
              })}
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
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span>
                          {m.date} · {m.time}
                        </span>
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                      <div className="flex items-center gap-2 flex-wrap">
                        <TeamCrest
                          name={teamMap.get(m.homeTeamId)?.name || m.homeTeamId}
                          shortCode={teamMap.get(m.homeTeamId)?.shortCode || 'LOC'}
                          primaryColor={teamMap.get(m.homeTeamId)?.primaryColor}
                          secondaryColor={teamMap.get(m.homeTeamId)?.secondaryColor}
                          crestUrl={teamMap.get(m.homeTeamId)?.crestUrl}
                          size="sm"
                        />
                        <span>{teamMap.get(m.homeTeamId)?.name || m.homeTeamId}</span>
                        <span className="text-xs font-normal text-slate-400 dark:text-slate-500">vs</span>
                        <TeamCrest
                          name={teamMap.get(m.awayTeamId)?.name || m.awayTeamId}
                          shortCode={teamMap.get(m.awayTeamId)?.shortCode || 'VIS'}
                          primaryColor={teamMap.get(m.awayTeamId)?.primaryColor}
                          secondaryColor={teamMap.get(m.awayTeamId)?.secondaryColor}
                          crestUrl={teamMap.get(m.awayTeamId)?.crestUrl}
                          size="sm"
                        />
                        <span>{teamMap.get(m.awayTeamId)?.name || m.awayTeamId}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => openMatchEditor(m)}
                        title="Clic para cambiar la cancha de este partido"
                        className="group inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300 hover:text-teal-700 dark:hover:text-teal-300 transition-colors cursor-pointer"
                      >
                        <MapPin
                          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 group-hover:scale-110 ${
                            m.fieldId
                              ? 'text-teal-600 dark:text-teal-400'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        />
                        <span>
                          {m.fieldId ? fieldMap.get(m.fieldId)?.name || 'Sin asignar' : 'Sin asignar'}
                        </span>
                      </button>
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => openMatchEditor(m)}
                        title="Clic para asignar o cambiar el árbitro"
                        className="group inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300 hover:text-amber-700 dark:hover:text-amber-300 transition-colors cursor-pointer"
                      >
                        <Flag
                          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 group-hover:scale-110 ${
                            m.refereeId
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        />
                        <span>
                          {m.refereeId ? refMap.get(m.refereeId)?.fullName || 'Sin asignar' : 'Sin asignar'}
                        </span>
                      </button>
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <MatchStatusIndicator
                        status={m.status}
                        onClick={() => openMatchEditor(m)}
                        title="Clic para editar el estado del partido"
                      />
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={busy}
                          title="Intercambiar Local ↔ Visitante"
                          onClick={() => handleQuickSwapSavedMatch(m)}
                          className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md"
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5" />
                        </button>
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

      {/* Interactive Prompt Modal: Ask Which Specific Field to Generate In */}
      {fieldPromptModal?.open && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-xl w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-electric-600 dark:text-blue-400 shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                    ¿En qué campo deseas generar el rol?
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    {activeTournament?.name} · {activeCategory?.name} ({startDate} al {endDate})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFieldPromptModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {activeCategory?.schedulePublished && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <span>
                  <strong>Calendario ya publicado:</strong> Al confirmar se regenerará el rol de esta categoría y quedará en estado borrador hasta volver a publicarlo.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  setFieldPromptModal((prev) => (prev ? { ...prev, mode: 'specific' } : prev))
                }
                className={`p-3 rounded-lg border text-left transition-colors ${
                  fieldPromptModal.mode === 'specific'
                    ? 'bg-navy-900 dark:bg-electric-500/20 text-white border-navy-900 dark:border-electric-500'
                    : 'bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="text-xs font-semibold">Campo(s) específico(s)</div>
                <div
                  className={`text-[11px] mt-0.5 ${
                    fieldPromptModal.mode === 'specific'
                      ? 'text-slate-200'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Elige exactamente en qué campo(s) se programarán los partidos.
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  setFieldPromptModal((prev) => (prev ? { ...prev, mode: 'unassigned' } : prev))
                }
                className={`p-3 rounded-lg border text-left transition-colors ${
                  fieldPromptModal.mode === 'unassigned'
                    ? 'bg-navy-900 dark:bg-electric-500/20 text-white border-navy-900 dark:border-electric-500'
                    : 'bg-slate-50 dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="text-xs font-semibold">Sin campo asignado</div>
                <div
                  className={`text-[11px] mt-0.5 ${
                    fieldPromptModal.mode === 'unassigned'
                      ? 'text-slate-200'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Generar encuentros sin usar los campos actuales para asignarlos luego.
                </div>
              </button>
            </div>

            {fieldPromptModal.mode === 'specific' && (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Selecciona el campo específico ({fieldPromptModal.pickedFieldIds.length} seleccionado(s)):
                  </span>
                  {canCreateField && (
                    <button
                      type="button"
                      onClick={() => setShowQuickFieldForm((v) => !v)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-electric-600 dark:text-blue-400 hover:underline"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {showQuickFieldForm ? 'Ocultar formulario' : 'Crear campo nuevo'}
                    </button>
                  )}
                </div>

                {showQuickFieldForm && canCreateField && (
                  <form
                    onSubmit={handleCreateQuickField}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700"
                  >
                    <input
                      type="text"
                      required
                      value={quickFieldName}
                      onChange={(e) => setQuickFieldName(e.target.value)}
                      placeholder="Nombre del nuevo campo"
                      className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    />
                    <select
                      value={quickFieldVenueId || venues[0]?.id || '__NEW_VENUE__'}
                      onChange={(e) => setQuickFieldVenueId(e.target.value)}
                      className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    >
                      {venues.map((v) => (
                        <option key={v.id} value={v.id}>
                          Sede: {v.name}
                        </option>
                      ))}
                      <option value="__NEW_VENUE__">+ Nueva sede</option>
                    </select>
                    {(quickFieldVenueId === '__NEW_VENUE__' || venues.length === 0) && (
                      <input
                        type="text"
                        required
                        value={quickVenueName}
                        onChange={(e) => setQuickVenueName(e.target.value)}
                        placeholder="Nombre de la nueva sede"
                        className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 sm:col-span-2"
                      />
                    )}
                    <div className="sm:col-span-2 flex justify-end">
                      <button
                        type="submit"
                        disabled={busy}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-electric-500 hover:bg-electric-600 rounded-lg"
                      >
                        {busy ? 'Guardando...' : 'Guardar y seleccionar campo'}
                      </button>
                    </div>
                  </form>
                )}

                {fields.length === 0 ? (
                  <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
                    No existen campos registrados. Crea un campo nuevo o selecciona "Sin campo asignado".
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {fields.map((f) => {
                      const checked = fieldPromptModal.pickedFieldIds.includes(f.id);
                      const venueName = venueMap.get(f.venueId)?.name || 'Sede';
                      return (
                        <label
                          key={f.id}
                          className={`flex items-center justify-between gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            checked
                              ? 'bg-blue-50 dark:bg-electric-500/20 border-electric-500 text-navy-900 dark:text-white'
                              : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setFieldPromptModal((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        pickedFieldIds: checked
                                          ? prev.pickedFieldIds.filter((id) => id !== f.id)
                                          : [...prev.pickedFieldIds, f.id],
                                      }
                                    : prev
                                )
                              }
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold truncate">{f.name}</div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                {venueName} · {f.surfaceType || 'Superficie estándar'} · {f.openTime}–{f.closeTime}
                              </div>
                            </div>
                          </div>
                          <span
                            className={`text-[10px] font-medium px-2 py-0.5 rounded shrink-0 ${
                              f.status === 'disponible'
                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                                : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {f.status}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {fieldPromptModal.pickedFieldIds.length === 0 && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400">
                    Selecciona al menos un campo específico para continuar o cambia a "Sin campo asignado".
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                disabled={busy}
                onClick={() => setFieldPromptModal(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  busy ||
                  (fieldPromptModal.mode === 'specific' &&
                    fieldPromptModal.pickedFieldIds.length === 0)
                }
                onClick={async () => {
                  const chosenMode = fieldPromptModal.mode;
                  const chosenIds = fieldPromptModal.pickedFieldIds;
                  const replace = fieldPromptModal.replaceExisting;
                  const chosenFields = fields.filter((f) => chosenIds.includes(f.id));
                  setFieldMode(chosenMode);
                  setSelectedFieldIds(chosenIds);
                  setFieldPromptModal(null);
                  await executeGenerate(replace, chosenFields, chosenMode, false);
                }}
                className="px-3.5 py-2 text-sm font-medium text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg disabled:opacity-50"
              >
                {busy ? 'Guardando...' : 'Guardar Directo'}
              </button>
              <button
                type="button"
                disabled={
                  busy ||
                  (fieldPromptModal.mode === 'specific' &&
                    fieldPromptModal.pickedFieldIds.length === 0)
                }
                onClick={async () => {
                  const chosenMode = fieldPromptModal.mode;
                  const chosenIds = fieldPromptModal.pickedFieldIds;
                  const replace = fieldPromptModal.replaceExisting;
                  const chosenFields = fields.filter((f) => chosenIds.includes(f.id));
                  setFieldMode(chosenMode);
                  setSelectedFieldIds(chosenIds);
                  setFieldPromptModal(null);
                  await executeGenerate(replace, chosenFields, chosenMode, true);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-electric-500 hover:bg-electric-600 rounded-lg disabled:opacity-50"
              >
                {busy ? 'Generando...' : 'Generar Borrador para Ajustar'}
              </button>
            </div>
          </div>
        </div>
      )}

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
