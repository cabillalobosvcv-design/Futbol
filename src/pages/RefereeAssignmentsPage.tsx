import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ClipboardEdit,
  Flag,
  Link2,
  Search,
  UserCheck,
  Users,
} from 'lucide-react';
import type { PageId } from '../components/Layout';
import { TeamCrest } from '../components/TeamCrest';
import { useAuth } from '../context/AuthContext';
import { useSigdData } from '../context/SigdDataContext';
import {
  assignRefereeToMatches,
  linkRefereeUserAccount,
} from '../services/firestoreService';
import {
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  type Match,
  type Referee,
} from '../types/sigd';

interface RefereeAssignmentsPageProps {
  onNavigate: (page: PageId) => void;
  onOpenCapture: (matchId: string) => void;
}

export function RefereeAssignmentsPage({
  onNavigate,
  onOpenCapture,
}: RefereeAssignmentsPageProps) {
  const { profile, role } = useAuth();
  const {
    tournaments,
    categories,
    teams,
    fields,
    venues,
    referees,
    matches,
    matchResults,
    users,
  } = useSigdData();

  const canManage = ROLE_PERMISSIONS.canManageFacilitiesAndReferees(role);

  const [activeTab, setActiveTab] = useState<'assignments' | 'referees'>('assignments');
  const [filterTournamentId, setFilterTournamentId] = useState<string>('all');
  const [filterCategoryId, setFilterCategoryId] = useState<string>('all');
  const [filterAssignment, setFilterAssignment] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([]);
  const [bulkRefereeId, setBulkRefereeId] = useState<string>('');
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [linkBusyId, setLinkBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const tournamentMap = useMemo(
    () => new Map(tournaments.map((t) => [t.id, t])),
    [tournaments]
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );
  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const fieldMap = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);
  const venueMap = useMemo(() => new Map(venues.map((v) => [v.id, v])), [venues]);
  const refMap = useMemo(() => new Map(referees.map((r) => [r.id, r])), [referees]);
  const userMap = useMemo(() => new Map(users.map((u) => [u.uid, u])), [users]);
  const resultByMatchId = useMemo(
    () => new Map(matchResults.map((r) => [r.matchId, r])),
    [matchResults]
  );

  // Detect simultaneous referee assignments (same refereeId + date + time)
  const refereeSlotMap = useMemo(() => {
    const map = new Map<string, Match[]>();
    matches.forEach((m) => {
      if (!m.refereeId || m.status === 'Cancelado') return;
      const key = `${m.refereeId}__${m.date}__${m.time}`;
      const list = map.get(key) || [];
      list.push(m);
      map.set(key, list);
    });
    return map;
  }, [matches]);

  const conflictMatchIds = useMemo(() => {
    const ids = new Set<string>();
    refereeSlotMap.forEach((group) => {
      if (group.length > 1) {
        group.forEach((m) => ids.add(m.id));
      }
    });
    return ids;
  }, [refereeSlotMap]);

  const kpis = useMemo(() => {
    const activeMatches = matches.filter((m) => m.status !== 'Cancelado');
    const unassigned = activeMatches.filter(
      (m) => !m.refereeId && m.status !== 'Finalizado'
    ).length;
    const assigned = activeMatches.filter((m) => Boolean(m.refereeId)).length;
    const activeReferees = referees.filter((r) => r.status === 'activo').length;
    return {
      total: activeMatches.length,
      unassigned,
      assigned,
      activeReferees,
      conflicts: conflictMatchIds.size,
    };
  }, [matches, referees, conflictMatchIds]);

  const availableCategories = useMemo(() => {
    if (filterTournamentId === 'all') return categories;
    return categories.filter((c) => c.tournamentId === filterTournamentId);
  }, [categories, filterTournamentId]);

  const filteredMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return matches
      .filter((m) => {
        if (filterTournamentId !== 'all' && m.tournamentId !== filterTournamentId) {
          return false;
        }
        if (filterCategoryId !== 'all' && m.categoryId !== filterCategoryId) {
          return false;
        }
        if (filterStatus !== 'all' && m.status !== filterStatus) {
          return false;
        }
        if (filterAssignment === 'unassigned' && m.refereeId) {
          return false;
        }
        if (filterAssignment === 'assigned' && !m.refereeId) {
          return false;
        }
        if (
          filterAssignment !== 'all' &&
          filterAssignment !== 'unassigned' &&
          filterAssignment !== 'assigned' &&
          m.refereeId !== filterAssignment
        ) {
          return false;
        }
        if (q) {
          const home = teamMap.get(m.homeTeamId)?.name || m.homeTeamId;
          const away = teamMap.get(m.awayTeamId)?.name || m.awayTeamId;
          const refName = m.refereeId ? refMap.get(m.refereeId)?.fullName || '' : '';
          const fieldName = m.fieldId ? fieldMap.get(m.fieldId)?.name || '' : '';
          const haystack =
            `#${m.matchNumber} ${home} ${away} ${refName} ${fieldName} ${m.date}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const dateCmp = a.date.localeCompare(b.date);
        if (dateCmp !== 0) return dateCmp;
        const timeCmp = a.time.localeCompare(b.time);
        if (timeCmp !== 0) return timeCmp;
        return a.matchNumber - b.matchNumber;
      });
  }, [
    matches,
    filterTournamentId,
    filterCategoryId,
    filterStatus,
    filterAssignment,
    searchQuery,
    teamMap,
    refMap,
    fieldMap,
  ]);

  const selectableVisibleIds = useMemo(
    () =>
      filteredMatches
        .filter((m) => m.status !== 'Finalizado' && m.status !== 'Cancelado')
        .map((m) => m.id),
    [filteredMatches]
  );

  const allVisibleSelected =
    selectableVisibleIds.length > 0 &&
    selectableVisibleIds.every((id) => selectedMatchIds.includes(id));

  // Sorted users so 'arbitro' role accounts appear first when linking
  const sortedUsersForLinking = useMemo(() => {
    return [...users].sort((a, b) => {
      if (a.role === 'arbitro' && b.role !== 'arbitro') return -1;
      if (a.role !== 'arbitro' && b.role === 'arbitro') return 1;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [users]);

  const refereeWorkloads = useMemo(() => {
    const map = new Map<
      string,
      { total: number; pendingCapture: number; finalized: number; hasConflict: boolean }
    >();
    referees.forEach((r) => {
      const assigned = matches.filter((m) => m.refereeId === r.id && m.status !== 'Cancelado');
      const pendingCapture = assigned.filter((m) => m.status !== 'Finalizado').length;
      const finalized = assigned.filter((m) => m.status === 'Finalizado').length;
      const hasConflict = assigned.some((m) => conflictMatchIds.has(m.id));
      map.set(r.id, {
        total: assigned.length,
        pendingCapture,
        finalized,
        hasConflict,
      });
    });
    return map;
  }, [referees, matches, conflictMatchIds]);

  const bulkConflictWarning = useMemo(() => {
    if (!bulkRefereeId || selectedMatchIds.length === 0) return null;
    const selected = matches.filter((m) => selectedMatchIds.includes(m.id));
    const slotCounts = new Map<string, number>();
    for (const m of selected) {
      const slot = `${m.date}__${m.time}`;
      slotCounts.set(slot, (slotCounts.get(slot) || 0) + 1);
      const existingAtSlot = refereeSlotMap.get(`${bulkRefereeId}__${slot}`) || [];
      if (existingAtSlot.some((em) => em.id !== m.id)) {
        return `El árbitro seleccionado ya tiene otro encuentro asignado el ${m.date} a las ${m.time}.`;
      }
    }
    for (const [slot, count] of slotCounts.entries()) {
      if (count > 1) {
        const [d, t] = slot.split('__');
        return `Seleccionaste ${count} partidos en el mismo horario (${d} ${t}); se generará un cruce arbitral.`;
      }
    }
    return null;
  }, [bulkRefereeId, selectedMatchIds, matches, refereeSlotMap]);

  const toggleSelectMatch = (matchId: string) => {
    setSelectedMatchIds((prev) =>
      prev.includes(matchId) ? prev.filter((id) => id !== matchId) : [...prev, matchId]
    );
  };

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedMatchIds((prev) =>
        prev.filter((id) => !selectableVisibleIds.includes(id))
      );
    } else {
      setSelectedMatchIds((prev) =>
        Array.from(new Set([...prev, ...selectableVisibleIds]))
      );
    }
  };

  const handleAssignSingle = async (match: Match, targetRefId: string) => {
    if (!profile || !canManage) return;
    setRowBusyId(match.id);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const refObj = targetRefId ? refMap.get(targetRefId) : undefined;
      await assignRefereeToMatches({
        matchIds: [match.id],
        refereeId: targetRefId,
        refereeName: refObj?.fullName || '',
        refereeUserUid: refObj?.userUid,
        matches,
        actorUid: profile.uid,
        actorName: profile.displayName,
      });
      setFeedback(
        targetRefId
          ? `Partido #${match.matchNumber} asignado a ${refObj?.fullName || 'árbitro'}.`
          : `Se removió el árbitro del partido #${match.matchNumber}.`
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : '';
      setErrorMsg(
        detail.includes('permission') || detail.includes('PERMISSION_DENIED')
          ? 'Permiso denegado en Firestore al asignar el árbitro.'
          : 'No se pudo actualizar la asignación arbitral.'
      );
    } finally {
      setRowBusyId(null);
    }
  };

  const handleBulkAssign = async () => {
    if (!profile || !canManage || selectedMatchIds.length === 0) return;
    setBulkBusy(true);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const targetRefId = bulkRefereeId === '__unassign__' ? '' : bulkRefereeId;
      const refObj = targetRefId ? refMap.get(targetRefId) : undefined;
      await assignRefereeToMatches({
        matchIds: selectedMatchIds,
        refereeId: targetRefId,
        refereeName: refObj?.fullName || '',
        refereeUserUid: refObj?.userUid,
        matches,
        actorUid: profile.uid,
        actorName: profile.displayName,
      });
      setFeedback(
        targetRefId
          ? `${selectedMatchIds.length} partido(s) asignado(s) a ${refObj?.fullName || 'árbitro'}.`
          : `Asignación arbitral removida de ${selectedMatchIds.length} partido(s).`
      );
      setSelectedMatchIds([]);
      setBulkRefereeId('');
    } catch (err) {
      const detail = err instanceof Error ? err.message : '';
      setErrorMsg(
        detail.includes('permission') || detail.includes('PERMISSION_DENIED')
          ? 'Permiso denegado en Firestore al realizar la asignación masiva.'
          : 'No se pudo completar la asignación masiva.'
      );
    } finally {
      setBulkBusy(false);
    }
  };

  const handleLinkUser = async (refObj: Referee, userUid: string) => {
    if (!profile || !canManage) return;
    setLinkBusyId(refObj.id);
    setFeedback(null);
    setErrorMsg(null);
    try {
      const linkedUser = userUid ? userMap.get(userUid) : undefined;
      await linkRefereeUserAccount({
        referee: refObj,
        userUid,
        userName: linkedUser ? `${linkedUser.displayName} (${linkedUser.email})` : undefined,
        actorUid: profile.uid,
        actorName: profile.displayName,
      });
      setFeedback(
        userUid
          ? `${refObj.fullName} quedó vinculado a ${linkedUser?.displayName || 'la cuenta seleccionada'}. Sus partidos aparecerán en "Mis Asignados".`
          : `Se desvinculó la cuenta de usuario de ${refObj.fullName}.`
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : '';
      setErrorMsg(
        detail.includes('permission') || detail.includes('PERMISSION_DENIED')
          ? 'Permiso denegado en Firestore al vincular la cuenta del árbitro.'
          : 'No se pudo actualizar el vínculo de cuenta del árbitro.'
      );
    } finally {
      setLinkBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-colors">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium text-electric-600 dark:text-blue-400">
            <UserCheck className="w-3.5 h-3.5 shrink-0" />
            <span>Coordinación Arbitral · {ROLE_LABELS[role]}</span>
          </div>
          <h1 className="text-xl font-display font-bold text-navy-900 dark:text-white mt-1">
            Asignación de Juegos a Árbitros
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            Designa árbitros por encuentro o de forma masiva, detecta cruces de horario y conecta cada juego con su captura de resultados.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('facilities')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
          >
            <Users className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            Alta de Árbitros
          </button>
          <button
            type="button"
            onClick={() => onNavigate('referee_capture')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-electric-500 hover:bg-electric-600 text-white text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <Flag className="w-4 h-4" />
            Ir a Captura Arbitral
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Partidos Activos</p>
          <p className="text-2xl font-display font-bold text-navy-900 dark:text-white mt-1 tabular-nums">
            {kpis.total}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            {kpis.assigned} con árbitro asignado
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Sin Árbitro Asignado</p>
          <p
            className={`text-2xl font-display font-bold mt-1 tabular-nums ${
              kpis.unassigned > 0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {kpis.unassigned}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {kpis.unassigned > 0 ? 'Pendientes por designar' : 'Todos cubiertos'}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Árbitros Activos</p>
          <p className="text-2xl font-display font-bold text-navy-900 dark:text-white mt-1 tabular-nums">
            {kpis.activeReferees}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            De {referees.length} registrados
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Cruces de Horario</p>
          <p
            className={`text-2xl font-display font-bold mt-1 tabular-nums ${
              kpis.conflicts > 0
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {kpis.conflicts}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {kpis.conflicts > 0 ? 'Mismo árbitro a la misma hora' : 'Sin colisiones'}
          </p>
        </div>
      </div>

      {!canManage && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            Tu rol actual ({ROLE_LABELS[role]}) es de solo lectura. Los coordinadores y administradores pueden asignar partidos a los árbitros.
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

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-fit transition-colors">
        <button
          type="button"
          onClick={() => setActiveTab('assignments')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'assignments'
              ? 'bg-navy-900 dark:bg-electric-500 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <ClipboardEdit className="w-4 h-4" />
          Asignación de Partidos ({filteredMatches.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('referees')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'referees'
              ? 'bg-navy-900 dark:bg-electric-500 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Link2 className="w-4 h-4" />
          Cuerpo Arbitral y Vinculación ({referees.length})
        </button>
      </div>

      {activeTab === 'assignments' && (
        <div className="space-y-4">
          {/* Filters Toolbar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 transition-colors">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar equipo, # partido o árbitro..."
                  className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>

              <select
                value={filterTournamentId}
                onChange={(e) => {
                  setFilterTournamentId(e.target.value);
                  setFilterCategoryId('all');
                }}
                aria-label="Filtrar por torneo"
                className="px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="all">Todos los torneos</option>
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              <select
                value={filterCategoryId}
                onChange={(e) => setFilterCategoryId(e.target.value)}
                aria-label="Filtrar por categoría"
                className="px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="all">Todas las categorías</option>
                {availableCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                value={filterAssignment}
                onChange={(e) => setFilterAssignment(e.target.value)}
                aria-label="Filtrar por asignación arbitral"
                className="px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="all">Cualquier asignación</option>
                <option value="unassigned">Sin árbitro asignado</option>
                <option value="assigned">Con árbitro asignado</option>
                {referees.map((r) => (
                  <option key={r.id} value={r.id}>
                    Árbitro: {r.fullName}
                  </option>
                ))}
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                aria-label="Filtrar por estado"
                className="px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="all">Todos los estados</option>
                <option value="Programado">Programado</option>
                <option value="Reprogramado">Reprogramado</option>
                <option value="En juego">En juego</option>
                <option value="Pendiente de validación">Pendiente de validación</option>
                <option value="Finalizado">Finalizado</option>
              </select>
            </div>

            {/* Bulk Assignment Bar */}
            {canManage && selectedMatchIds.length > 0 && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-navy-900 dark:text-blue-300 tabular-nums">
                    {selectedMatchIds.length} partido(s) seleccionado(s) para asignación masiva
                  </p>
                  {bulkConflictWarning && (
                    <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{bulkConflictWarning}</span>
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={bulkRefereeId}
                    onChange={(e) => setBulkRefereeId(e.target.value)}
                    aria-label="Árbitro para asignación masiva"
                    className="px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    <option value="">Seleccionar árbitro...</option>
                    {referees.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.fullName} {r.status !== 'activo' ? `(${r.status})` : ''}
                      </option>
                    ))}
                    <option value="__unassign__">Quitar árbitro asignado</option>
                  </select>

                  <button
                    type="button"
                    disabled={!bulkRefereeId || bulkBusy}
                    onClick={handleBulkAssign}
                    className="px-4 py-2 rounded-lg bg-electric-500 hover:bg-electric-600 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
                  >
                    {bulkBusy ? 'Guardando...' : 'Aplicar Asignación'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedMatchIds([])}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Limpiar selección
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Matches Assignment Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden transition-colors">
            {referees.length === 0 && (
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-amber-50/70 dark:bg-amber-950/30 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-200">
                <span>
                  Aún no hay árbitros registrados en el catálogo. Da de alta al menos un árbitro para poder asignarle juegos.
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('facilities')}
                  className="px-3 py-1.5 rounded-lg bg-amber-700 text-white font-medium hover:bg-amber-800 transition-colors"
                >
                  Ir a Alta de Árbitros
                </button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {canManage && (
                      <th className="py-3 pl-4 pr-2 w-10">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleSelectAllVisible}
                          disabled={selectableVisibleIds.length === 0}
                          aria-label="Seleccionar todos los partidos editables"
                          className="rounded border-slate-300 dark:border-slate-600"
                        />
                      </th>
                    )}
                    <th className="py-3 px-3">Partido</th>
                    <th className="py-3 px-3">Fecha / Sede</th>
                    <th className="py-3 px-3">Encuentro</th>
                    <th className="py-3 px-3">Estado / Marcador</th>
                    <th className="py-3 px-3 min-w-[230px]">Árbitro Asignado</th>
                    <th className="py-3 pl-3 pr-4 text-right">Resultados</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {filteredMatches.length === 0 ? (
                    <tr>
                      <td
                        colSpan={canManage ? 7 : 6}
                        className="py-10 px-4 text-center text-sm text-slate-500 dark:text-slate-400"
                      >
                        No hay partidos que coincidan con los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filteredMatches.map((m) => {
                      const homeTeam = teamMap.get(m.homeTeamId);
                      const awayTeam = teamMap.get(m.awayTeamId);
                      const field = m.fieldId ? fieldMap.get(m.fieldId) : undefined;
                      const venue = m.venueId ? venueMap.get(m.venueId) : undefined;
                      const tournament = tournamentMap.get(m.tournamentId);
                      const category = categoryMap.get(m.categoryId);
                      const result = resultByMatchId.get(m.id);
                      const assignedRef = m.refereeId ? refMap.get(m.refereeId) : undefined;
                      const isLocked =
                        m.status === 'Finalizado' || m.status === 'Cancelado';
                      const isChecked = selectedMatchIds.includes(m.id);
                      const hasConflict = conflictMatchIds.has(m.id);
                      const isBusy = rowBusyId === m.id;

                      return (
                        <tr
                          key={m.id}
                          className={`transition-colors ${
                            isChecked
                              ? 'bg-blue-50/50 dark:bg-blue-950/30'
                              : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          {canManage && (
                            <td className="py-3 pl-4 pr-2 align-middle">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={isLocked}
                                onChange={() => toggleSelectMatch(m.id)}
                                aria-label={`Seleccionar partido #${m.matchNumber}`}
                                className="rounded border-slate-300 dark:border-slate-600 disabled:opacity-40"
                              />
                            </td>
                          )}

                          <td className="py-3 px-3 align-middle whitespace-nowrap">
                            <span className="font-mono font-bold text-xs text-navy-900 dark:text-blue-300 tabular-nums block">
                              #{m.matchNumber} · J{m.roundNumber}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate max-w-[140px]">
                              {category?.name || 'Categoría'}
                            </span>
                          </td>

                          <td className="py-3 px-3 align-middle whitespace-nowrap">
                            <span className="font-mono text-xs font-medium text-slate-800 dark:text-slate-200 tabular-nums block">
                              {m.date} · {m.time}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate max-w-[160px]">
                              {field?.name || 'Cancha por asignar'}
                              {venue ? ` · ${venue.name}` : ''}
                            </span>
                          </td>

                          <td className="py-3 px-3 align-middle">
                            <div className="flex items-center gap-2 min-w-[200px]">
                              <TeamCrest
                                name={homeTeam?.name || m.homeTeamId}
                                shortCode={homeTeam?.shortCode || 'LOC'}
                                primaryColor={homeTeam?.primaryColor}
                                crestUrl={homeTeam?.crestUrl}
                                size="sm"
                              />
                              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[120px]">
                                {homeTeam?.name || m.homeTeamId}
                              </span>
                              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                vs
                              </span>
                              <TeamCrest
                                name={awayTeam?.name || m.awayTeamId}
                                shortCode={awayTeam?.shortCode || 'VIS'}
                                primaryColor={awayTeam?.primaryColor}
                                crestUrl={awayTeam?.crestUrl}
                                size="sm"
                              />
                              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[120px]">
                                {awayTeam?.name || m.awayTeamId}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5 truncate max-w-[260px]">
                              {tournament?.name || 'Torneo'}
                            </span>
                          </td>

                          <td className="py-3 px-3 align-middle whitespace-nowrap">
                            <span
                              className={`text-xs font-semibold block ${
                                m.status === 'Finalizado'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : m.status === 'Pendiente de validación'
                                    ? 'text-amber-700 dark:text-amber-400'
                                    : m.status === 'En juego'
                                      ? 'text-electric-600 dark:text-blue-400'
                                      : 'text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {m.status}
                            </span>
                            {result ? (
                              <span className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                                {result.homeScore} - {result.awayScore} ({result.validationStatus})
                              </span>
                            ) : m.homeScore !== undefined && m.awayScore !== undefined ? (
                              <span className="text-[11px] font-mono text-slate-600 dark:text-slate-400 tabular-nums">
                                {m.homeScore} - {m.awayScore}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                Sin marcador
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3 align-middle">
                            {canManage && !isLocked ? (
                              <div className="space-y-1">
                                <select
                                  value={m.refereeId || ''}
                                  disabled={isBusy}
                                  onChange={(e) => handleAssignSingle(m, e.target.value)}
                                  aria-label={`Asignar árbitro al partido #${m.matchNumber}`}
                                  className={`w-full px-2.5 py-1.5 text-xs border rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-60 ${
                                    hasConflict
                                      ? 'border-rose-400 dark:border-rose-600'
                                      : !m.refereeId
                                        ? 'border-amber-300 dark:border-amber-700'
                                        : 'border-slate-200 dark:border-slate-700'
                                  }`}
                                >
                                  <option value="">-- Sin árbitro asignado --</option>
                                  {referees.map((r) => (
                                    <option key={r.id} value={r.id}>
                                      {r.fullName}
                                      {r.status !== 'activo' ? ` (${r.status})` : ''}
                                      {r.userUid ? '' : ' · sin cuenta'}
                                    </option>
                                  ))}
                                </select>
                                {hasConflict && (
                                  <p className="text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3 shrink-0" />
                                    <span>Cruce de horario con otro juego</span>
                                  </p>
                                )}
                                {assignedRef && assignedRef.status !== 'activo' && (
                                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                                    Estado arbitral: {assignedRef.status}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                                {assignedRef?.fullName || 'Sin asignar'}
                              </span>
                            )}
                          </td>

                          <td className="py-3 pl-3 pr-4 align-middle text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => onOpenCapture(m.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-navy-900 dark:text-blue-300 transition-colors"
                            >
                              <Flag className="w-3.5 h-3.5 text-electric-500" />
                              Capturar
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'referees' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs text-slate-600 dark:text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span>
              Vincula cada árbitro registrado con su cuenta de usuario (rol Árbitro) para que reciba notificaciones y vea sus encuentros automáticamente en la pestaña <strong className="text-slate-900 dark:text-white">Mis Asignados</strong> de Captura Arbitral.
            </span>
            {users.length <= 1 && (
              <span className="text-amber-700 dark:text-amber-300 shrink-0">
                Nota: Los árbitros deben iniciar sesión al menos una vez para aparecer en el selector.
              </span>
            )}
          </div>

          {referees.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-3">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                No hay árbitros registrados todavía.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('facilities')}
                className="px-4 py-2 rounded-lg bg-electric-500 hover:bg-electric-600 text-white text-xs font-semibold transition-colors"
              >
                Registrar Árbitros
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {referees.map((r) => {
                const stats = refereeWorkloads.get(r.id) || {
                  total: 0,
                  pendingCapture: 0,
                  finalized: 0,
                  hasConflict: false,
                };
                const linkedUser = r.userUid ? userMap.get(r.userUid) : undefined;
                const isLinking = linkBusyId === r.id;

                return (
                  <div
                    key={r.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-display font-bold text-base text-navy-900 dark:text-white truncate">
                          {r.fullName}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Disponibilidad: {r.availabilitySlots.join(' · ') || 'No especificada'}
                        </p>
                      </div>

                      <span
                        className={`text-xs font-semibold shrink-0 ${
                          r.status === 'activo'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : r.status === 'suspendido'
                              ? 'text-rose-700 dark:text-rose-400'
                              : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block">
                          Asignados
                        </span>
                        <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                          {stats.total}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block">
                          Por capturar
                        </span>
                        <span className="font-mono font-bold text-electric-600 dark:text-blue-400 tabular-nums">
                          {stats.pendingCapture}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 block">
                          Finalizados
                        </span>
                        <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                          {stats.finalized}
                        </span>
                      </div>
                    </div>

                    {stats.hasConflict && (
                      <p className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Tiene partidos empalmados en el mismo horario.</span>
                      </p>
                    )}

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Cuenta de usuario vinculada
                      </label>
                      {canManage ? (
                        <select
                          value={r.userUid || ''}
                          disabled={isLinking}
                          onChange={(e) => handleLinkUser(r, e.target.value)}
                          className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-50"
                        >
                          <option value="">Sin cuenta vinculada</option>
                          {r.userUid && !linkedUser && (
                            <option value={r.userUid}>
                              UID vinculado ({r.userUid.slice(0, 12)}...)
                            </option>
                          )}
                          {sortedUsersForLinking.map((u) => (
                            <option key={u.uid} value={u.uid}>
                              {u.displayName} ({u.email}) · {ROLE_LABELS[u.role]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          {linkedUser
                            ? `${linkedUser.displayName} (${linkedUser.email})`
                            : r.userUid
                              ? `UID: ${r.userUid}`
                              : 'Sin cuenta vinculada'}
                        </p>
                      )}

                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setFilterAssignment(r.id);
                            setActiveTab('assignments');
                          }}
                          className="text-xs font-medium text-electric-600 dark:text-blue-400 hover:underline"
                        >
                          Ver partidos asignados ({stats.total})
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
