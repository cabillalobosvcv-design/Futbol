import React, { useState } from 'react';
import {
  AlertCircle,
  CalendarRange,
  CheckCircle2,
  Crown,
  Dumbbell,
  Edit3,
  Layers,
  Plus,
  Settings2,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import { TIEBREAKER_LABELS } from '../engines/sportsCatalog';
import { useAuth } from '../context/AuthContext';
import { useSigdData } from '../context/SigdDataContext';
import {
  bootstrapDefaultCatalog,
  createAuditLog,
  deleteEntityDoc,
  makeId,
  saveEntityDoc,
} from '../services/firestoreService';
import {
  ROLE_PERMISSIONS,
  type Season,
  type Sport,
  type SportEngineType,
  type TiebreakerCriterion,
  type Tournament,
  type TournamentFormat,
} from '../types/sigd';

type SectionTab = 'tournaments' | 'seasons' | 'sports';

const FORMAT_LABELS: Record<TournamentFormat, string> = {
  round_robin: 'Todos contra Todos',
  knockout: 'Eliminación Directa',
  groups: 'Fase de Grupos',
  mixed: 'Modalidad Mixta (Grupos + Eliminación)',
};

const TOURNAMENT_STATUS_LABELS: Record<Tournament['status'], string> = {
  borrador: 'Borrador',
  inscripciones: 'Inscripciones',
  en_curso: 'En curso',
  finalizado: 'Finalizado',
  suspendido: 'Suspendido',
};

const SEASON_STATUS_LABELS: Record<Season['status'], string> = {
  planificada: 'Planificada',
  activa: 'Activa',
  finalizada: 'Finalizada',
};

export function TournamentsPage() {
  const { profile, role } = useAuth();
  const { sports, sportRules, seasons, tournaments, categories, teams, matches } = useSigdData();

  const [tab, setTab] = useState<SectionTab>('tournaments');
  const [msg, setMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canManageTournaments = ROLE_PERMISSIONS.canManageTournaments(role);
  const canManageSports = ROLE_PERMISSIONS.canManageSportsAndRules(role);
  const canDeleteTopLevel = role === 'admin_general';

  // Season form
  const [seasonName, setSeasonName] = useState('');
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear());
  const [seasonStart, setSeasonStart] = useState('2026-01-15');
  const [seasonEnd, setSeasonEnd] = useState('2026-12-15');

  // Tournament form
  const [tName, setTName] = useState('');
  const [tSportId, setTSportId] = useState('');
  const [tSeasonId, setTSeasonId] = useState('');
  const [tFormat, setTFormat] = useState<TournamentFormat>('round_robin');
  const [tDoubleRound, setTDoubleRound] = useState(false);
  const [tTeamsPerGroup, setTTeamsPerGroup] = useState(4);
  const [tQualifiers, setTQualifiers] = useState(2);
  const [tWinPts, setTWinPts] = useState(3);
  const [tDrawPts, setTDrawPts] = useState(1);
  const [tLossPts, setTLossPts] = useState(0);
  const [tMinRest, setTMinRest] = useState(24);
  const [tTiebreakers, setTTiebreakers] = useState<TiebreakerCriterion[]>([
    'points',
    'goal_difference',
    'goals_for',
    'head_to_head',
    'wins',
  ]);

  // New Sport form
  const [sName, setSName] = useState('');
  const [sKey, setSKey] = useState('');
  const [sEngine, setSEngine] = useState<SportEngineType>('generic');
  const [sPeriods, setSPeriods] = useState(2);
  const [sPeriodLabel, setSPeriodLabel] = useState('Periodo');
  const [sAllowDraws, setSAllowDraws] = useState(false);

  // Edit / Delete states — Tournaments
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [etName, setEtName] = useState('');
  const [etSportId, setEtSportId] = useState('');
  const [etSeasonId, setEtSeasonId] = useState('');
  const [etFormat, setEtFormat] = useState<TournamentFormat>('round_robin');
  const [etDoubleRound, setEtDoubleRound] = useState(false);
  const [etTeamsPerGroup, setEtTeamsPerGroup] = useState(4);
  const [etQualifiers, setEtQualifiers] = useState(2);
  const [etWinPts, setEtWinPts] = useState(3);
  const [etDrawPts, setEtDrawPts] = useState(1);
  const [etLossPts, setEtLossPts] = useState(0);
  const [etMinRest, setEtMinRest] = useState(24);
  const [etStatus, setEtStatus] = useState<Tournament['status']>('inscripciones');
  const [etTiebreakers, setEtTiebreakers] = useState<TiebreakerCriterion[]>(['points']);
  const [deletingTournament, setDeletingTournament] = useState<Tournament | null>(null);

  // Edit / Delete states — Seasons
  const [editingSeason, setEditingSeason] = useState<Season | null>(null);
  const [esName, setEsName] = useState('');
  const [esYear, setEsYear] = useState(new Date().getFullYear());
  const [esStart, setEsStart] = useState('');
  const [esEnd, setEsEnd] = useState('');
  const [esStatus, setEsStatus] = useState<Season['status']>('activa');
  const [deletingSeason, setDeletingSeason] = useState<Season | null>(null);

  // Edit / Delete states — Sports
  const [editingSport, setEditingSport] = useState<Sport | null>(null);
  const [espName, setEspName] = useState('');
  const [espEngine, setEspEngine] = useState<SportEngineType>('generic');
  const [espPeriods, setEspPeriods] = useState(2);
  const [espPeriodLabel, setEspPeriodLabel] = useState('Periodo');
  const [espAllowDraws, setEspAllowDraws] = useState(false);
  const [espActive, setEspActive] = useState(true);
  const [espIsPrimary, setEspIsPrimary] = useState(false);
  const [deletingSport, setDeletingSport] = useState<Sport | null>(null);

  const handleBootstrap = async () => {
    if (!profile) return;
    setSaving(true);
    setMsg(null);
    setErrMsg(null);
    try {
      await bootstrapDefaultCatalog(profile.uid, profile.displayName);
      setMsg('Catálogo multideporte y reglamentos base creados.');
    } catch {
      setErrMsg('No se pudo inicializar el catálogo multideporte.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !seasonName.trim()) return;
    setSaving(true);
    setMsg(null);
    setErrMsg(null);
    try {
      const id = makeId('sea');
      await saveEntityDoc('seasons', id, {
        name: seasonName.trim(),
        year: Number(seasonYear),
        startDate: seasonStart,
        endDate: seasonEnd,
        status: 'activa',
        createdBy: profile.uid,
      }, true);
      await createAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        action: 'CREATE_SEASON',
        entity: 'seasons',
        entityId: id,
        summary: `Temporada creada: ${seasonName.trim()} (${seasonYear})`,
      });
      setSeasonName('');
      setMsg('Temporada registrada correctamente.');
    } catch {
      setErrMsg('No se pudo registrar la temporada. Verifica los datos y permisos.');
    } finally {
      setSaving(false);
    }
  };

  const openEditSeason = (s: Season) => {
    setEditingSeason(s);
    setEsName(s.name);
    setEsYear(s.year);
    setEsStart(s.startDate);
    setEsEnd(s.endDate);
    setEsStatus(s.status);
  };

  const handleSaveEditSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !editingSeason || !esName.trim()) return;
    setSaving(true);
    setMsg(null);
    setErrMsg(null);
    try {
      await saveEntityDoc(
        'seasons',
        editingSeason.id,
        {
          name: esName.trim().slice(0, 100),
          year: Number(esYear),
          startDate: esStart,
          endDate: esEnd,
          status: esStatus,
        },
        false
      );
      await createAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        action: 'UPDATE_SEASON',
        entity: 'seasons',
        entityId: editingSeason.id,
        summary: `Temporada modificada: ${esName.trim()} (${esYear}) · estado ${esStatus}.`,
      });
      setEditingSeason(null);
      setMsg(`Temporada "${esName.trim()}" actualizada correctamente.`);
    } catch {
      setErrMsg('No se pudo actualizar la temporada. Verifica tus permisos.');
    } finally {
      setSaving(false);
    }
  };

  const handleCloseSeason = async (s: Season) => {
    if (!profile || !canManageTournaments) return;
    setSaving(true);
    setMsg(null);
    setErrMsg(null);
    try {
      await saveEntityDoc('seasons', s.id, { status: 'finalizada' }, false);
      await createAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        action: 'UPDATE_SEASON',
        entity: 'seasons',
        entityId: s.id,
        summary: `Temporada cerrada: ${s.name}.`,
      });
      setMsg(`Temporada "${s.name}" marcada como finalizada.`);
    } catch {
      setErrMsg('No se pudo cerrar la temporada.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDeleteSeason = async () => {
    if (!profile || !deletingSeason || !canDeleteTopLevel) return;
    setSaving(true);
    setMsg(null);
    setErrMsg(null);
    try {
      await deleteEntityDoc('seasons', deletingSeason.id);
      await createAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        action: 'DELETE_SEASON',
        entity: 'seasons',
        entityId: deletingSeason.id,
        summary: `Temporada eliminada: ${deletingSeason.name} (${deletingSeason.year}).`,
      });
      setDeletingSeason(null);
      setMsg(`Temporada "${deletingSeason.name}" eliminada.`);
    } catch {
      setErrMsg('No se pudo eliminar la temporada. Verifica tus permisos de Administrador General.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !tName.trim()) return;
    const sportId = tSportId || sports[0]?.id;
    const seasonId = tSeasonId || seasons[0]?.id;
    if (!sportId || !seasonId) {
      setErrMsg('Primero asegúrate de tener al menos un deporte y una temporada registrados.');
      return;
    }

    setSaving(true);
    setMsg(null);
    setErrMsg(null);
    try {
      const id = makeId('trn');
      await saveEntityDoc('tournaments', id, {
        name: tName.trim(),
        sportId,
        seasonId,
        format: tFormat,
        doubleRound: tDoubleRound,
        teamsPerGroup: Number(tTeamsPerGroup),
        qualifiersPerGroup: Number(tQualifiers),
        winPoints: Number(tWinPts),
        drawPoints: Number(tDrawPts),
        lossPoints: Number(tLossPts),
        tiebreakers: tTiebreakers,
        minRestHours: Number(tMinRest),
        schedulePublished: false,
        status: 'inscripciones',
        createdBy: profile.uid,
      }, true);
      await createAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        action: 'CREATE_TOURNAMENT',
        entity: 'tournaments',
        entityId: id,
        summary: `Torneo creado: ${tName.trim()} (${FORMAT_LABELS[tFormat]})`,
      });
      setTName('');
      setMsg('Torneo creado con reglamento independiente.');
    } catch {
      setErrMsg('No se pudo crear el torneo. Verifica tus permisos.');
    } finally {
      setSaving(false);
    }
  };

  const openEditTournament = (t: Tournament) => {
    setEditingTournament(t);
    setEtName(t.name);
    setEtSportId(t.sportId);
    setEtSeasonId(t.seasonId);
    setEtFormat(t.format);
    setEtDoubleRound(Boolean(t.doubleRound));
    setEtTeamsPerGroup(t.teamsPerGroup ?? 4);
    setEtQualifiers(t.qualifiersPerGroup ?? 2);
    setEtWinPts(t.winPoints);
    setEtDrawPts(t.drawPoints);
    setEtLossPts(t.lossPoints);
    setEtMinRest(t.minRestHours ?? 24);
    setEtStatus(t.status);
    setEtTiebreakers(t.tiebreakers?.length ? [...t.tiebreakers] : ['points']);
  };

  const handleSaveEditTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !editingTournament || !etName.trim()) return;
    setSaving(true);
    setMsg(null);
    setErrMsg(null);
    try {
      await saveEntityDoc(
        'tournaments',
        editingTournament.id,
        {
          name: etName.trim().slice(0, 140),
          sportId: etSportId,
          seasonId: etSeasonId,
          format: etFormat,
          doubleRound: etDoubleRound,
          teamsPerGroup: Number(etTeamsPerGroup),
          qualifiersPerGroup: Number(etQualifiers),
          winPoints: Number(etWinPts),
          drawPoints: Number(etDrawPts),
          lossPoints: Number(etLossPts),
          tiebreakers: etTiebreakers.length > 0 ? etTiebreakers : ['points'],
          minRestHours: Number(etMinRest),
          status: etStatus,
        },
        false
      );
      await createAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        action: 'UPDATE_TOURNAMENT',
        entity: 'tournaments',
        entityId: editingTournament.id,
        summary: `Torneo modificado: ${etName.trim()} (${FORMAT_LABELS[etFormat]} · ${TOURNAMENT_STATUS_LABELS[etStatus]}).`,
      });
      setEditingTournament(null);
      setMsg(`Torneo "${etName.trim()}" actualizado correctamente.`);
    } catch {
      setErrMsg('No se pudo actualizar el torneo. Verifica los campos y tus permisos.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDeleteTournament = async () => {
    if (!profile || !deletingTournament || !canDeleteTopLevel) return;
    setSaving(true);
    setMsg(null);
    setErrMsg(null);
    try {
      await deleteEntityDoc('tournaments', deletingTournament.id);
      await createAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        action: 'DELETE_TOURNAMENT',
        entity: 'tournaments',
        entityId: deletingTournament.id,
        summary: `Torneo eliminado: ${deletingTournament.name}.`,
      });
      setDeletingTournament(null);
      setMsg(`Torneo "${deletingTournament.name}" eliminado.`);
    } catch {
      setErrMsg('No se pudo eliminar el torneo. Verifica tus permisos de Administrador General.');
    } finally {
      setSaving(false);
    }
  };

  const handleSetTournamentChampion = async (t: Tournament, teamId: string) => {
    if (!profile || !canManageTournaments) return;
    const team = teams.find((tm) => tm.id === teamId);
    await saveEntityDoc('tournaments', t.id, {
      status: 'finalizado',
      championTeamId: teamId,
      championTeamName: team?.name || '',
    }, false);
    await createAuditLog({
      actorUid: profile.uid,
      actorName: profile.displayName,
      action: 'SET_CHAMPION',
      entity: 'tournaments',
      entityId: t.id,
      summary: `Torneo ${t.name} finalizado. Campeón: ${team?.name || teamId}`,
    });
    setMsg(`Campeón oficial asignado para ${t.name}.`);
  };

  const handleCreateSport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !sName.trim() || !sKey.trim()) return;
    setSaving(true);
    setMsg(null);
    setErrMsg(null);
    try {
      const cleanKey = sKey.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const id = `sport_${cleanKey.replace(/-/g, '_')}`;
      await saveEntityDoc('sports', id, {
        key: cleanKey,
        name: sName.trim(),
        engineType: sEngine,
        periodsCount: Number(sPeriods),
        periodLabel: sPeriodLabel.trim() || 'Periodo',
        allowDraws: sAllowDraws,
        statSchema: [],
        active: true,
        isPrimary: false,
      }, true);
      await createAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        action: 'CREATE_SPORT',
        entity: 'sports',
        entityId: id,
        summary: `Disciplina deportiva creada: ${sName.trim()} (${sEngine}).`,
      });
      setSName('');
      setSKey('');
      setMsg('Disciplina agregada al catálogo multideporte.');
    } catch {
      setErrMsg('No se pudo registrar la disciplina deportiva.');
    } finally {
      setSaving(false);
    }
  };

  const openEditSport = (sp: Sport) => {
    setEditingSport(sp);
    setEspName(sp.name);
    setEspEngine(sp.engineType);
    setEspPeriods(sp.periodsCount);
    setEspPeriodLabel(sp.periodLabel || 'Periodo');
    setEspAllowDraws(Boolean(sp.allowDraws));
    setEspActive(Boolean(sp.active));
    setEspIsPrimary(Boolean(sp.isPrimary));
  };

  const handleSaveEditSport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !editingSport || !espName.trim()) return;
    setSaving(true);
    setMsg(null);
    setErrMsg(null);
    try {
      await saveEntityDoc(
        'sports',
        editingSport.id,
        {
          name: espName.trim().slice(0, 80),
          engineType: espEngine,
          periodsCount: Math.max(1, Math.min(12, Number(espPeriods) || 2)),
          periodLabel: (espPeriodLabel.trim() || 'Periodo').slice(0, 40),
          allowDraws: espAllowDraws,
          active: espActive,
          isPrimary: espIsPrimary,
        },
        false
      );
      await createAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        action: 'UPDATE_SPORT',
        entity: 'sports',
        entityId: editingSport.id,
        summary: `Disciplina actualizada: ${espName.trim()} (${espEngine} · ${espPeriods} ${espPeriodLabel || 'periodos'}).`,
      });
      setEditingSport(null);
      setMsg(`Disciplina "${espName.trim()}" actualizada.`);
    } catch {
      setErrMsg('No se pudo actualizar la disciplina.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDeleteSport = async () => {
    if (!profile || !deletingSport || !canManageSports) return;
    setSaving(true);
    setMsg(null);
    setErrMsg(null);
    try {
      await deleteEntityDoc('sports', deletingSport.id);
      await createAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        action: 'DELETE_SPORT',
        entity: 'sports',
        entityId: deletingSport.id,
        summary: `Disciplina eliminada del catálogo: ${deletingSport.name}.`,
      });
      setDeletingSport(null);
      setMsg(`Disciplina "${deletingSport.name}" eliminada.`);
    } catch {
      setErrMsg('No se pudo eliminar la disciplina.');
    } finally {
      setSaving(false);
    }
  };

  const toggleTiebreaker = (crit: TiebreakerCriterion) => {
    setTTiebreakers((prev) =>
      prev.includes(crit) ? (prev.length > 1 ? prev.filter((c) => c !== crit) : prev) : [...prev, crit]
    );
  };

  const toggleEditTiebreaker = (crit: TiebreakerCriterion) => {
    setEtTiebreakers((prev) =>
      prev.includes(crit) ? (prev.length > 1 ? prev.filter((c) => c !== crit) : prev) : [...prev, crit]
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors">
        <div>
          <h1 className="text-xl font-display font-bold text-navy-900 dark:text-white">
            Temporadas, Torneos y Arquitectura Multideporte
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            Administra temporadas históricas, torneos independientes y reglamentos configurables por disciplina.
          </p>
        </div>
        {sports.length === 0 && canManageSports && (
          <button
            type="button"
            disabled={saving}
            onClick={handleBootstrap}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium shrink-0"
          >
            <Plus className="w-4 h-4" />
            Cargar Catálogo Multideporte
          </button>
        )}
      </div>

      {msg && (
        <div className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{msg}</span>
        </div>
      )}

      {errMsg && (
        <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errMsg}</span>
        </div>
      )}

      {/* Segmented Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-fit transition-colors">
        <button
          type="button"
          onClick={() => setTab('tournaments')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'tournaments'
              ? 'bg-navy-900 dark:bg-electric-500 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Trophy className="w-4 h-4" />
          Torneos ({tournaments.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('seasons')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'seasons'
              ? 'bg-navy-900 dark:bg-electric-500 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <CalendarRange className="w-4 h-4" />
          Temporadas ({seasons.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('sports')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'sports'
              ? 'bg-navy-900 dark:bg-electric-500 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Dumbbell className="w-4 h-4" />
          Catálogo de Deportes ({sports.length})
        </button>
      </div>

      {tab === 'tournaments' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {canManageTournaments && (
            <form
              onSubmit={handleCreateTournament}
              className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 h-fit transition-colors"
            >
              <div className="flex items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                <Plus className="w-4 h-4 text-electric-500" />
                <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
                  Crear Nuevo Torneo
                </h2>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nombre del Torneo
                </label>
                <input
                  type="text"
                  required
                  value={tName}
                  onChange={(e) => setTName(e.target.value)}
                  placeholder="Ej. Torneo Apertura Fútbol 2026"
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Disciplina
                  </label>
                  <select
                    value={tSportId || sports[0]?.id || ''}
                    onChange={(e) => setTSportId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    {sports.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Temporada
                  </label>
                  <select
                    value={tSeasonId || seasons[0]?.id || ''}
                    onChange={(e) => setTSeasonId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    {seasons.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Modalidad de Competencia
                </label>
                <select
                  value={tFormat}
                  onChange={(e) => setTFormat(e.target.value as TournamentFormat)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="round_robin">Todos contra todos</option>
                  <option value="knockout">Eliminación directa</option>
                  <option value="groups">Fase de grupos</option>
                  <option value="mixed">Modalidad mixta (Grupos + Finales)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 pt-1">
                  <input
                    type="checkbox"
                    checked={tDoubleRound}
                    onChange={(e) => setTDoubleRound(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-600"
                  />
                  Ida y vuelta (2 vueltas)
                </label>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Descanso mínimo (hrs)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={240}
                    value={tMinRest}
                    onChange={(e) => setTMinRest(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                  />
                </div>
              </div>

              {(tFormat === 'groups' || tFormat === 'mixed') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Equipos por grupo
                    </label>
                    <input
                      type="number"
                      min={2}
                      max={16}
                      value={tTeamsPerGroup}
                      onChange={(e) => setTTeamsPerGroup(Number(e.target.value))}
                      className="w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Clasificados por grupo
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={tQualifiers}
                      onChange={(e) => setTQualifiers(Number(e.target.value))}
                      className="w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                    />
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Sistema de Puntuación Configurable
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                      Victoria
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={tWinPts}
                      onChange={(e) => setTWinPts(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                      Empate
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={tDrawPts}
                      onChange={(e) => setTDrawPts(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                      Derrota
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={tLossPts}
                      onChange={(e) => setTLossPts(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                    />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Criterios de Desempate
                </p>
                <div className="space-y-1.5">
                  {(Object.keys(TIEBREAKER_LABELS) as TiebreakerCriterion[]).map((crit) => (
                    <label
                      key={crit}
                      className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300"
                    >
                      <input
                        type="checkbox"
                        checked={tTiebreakers.includes(crit)}
                        onChange={() => toggleTiebreaker(crit)}
                        className="rounded border-slate-300 dark:border-slate-600"
                      />
                      {TIEBREAKER_LABELS[crit]}
                    </label>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 px-4 bg-electric-500 hover:bg-electric-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
              >
                {saving ? 'Guardando...' : 'Crear Torneo'}
              </button>
            </form>
          )}

          <div className={`${canManageTournaments ? 'lg:col-span-7' : 'lg:col-span-12'} space-y-4`}>
            {tournaments.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                No hay torneos registrados todavía. Crea una temporada y registra tu primer torneo.
              </div>
            ) : (
              tournaments.map((t) => {
                const sport = sports.find((s) => s.id === t.sportId);
                const season = seasons.find((s) => s.id === t.seasonId);
                const tTeams = teams.filter((tm) => tm.tournamentId === t.id);
                return (
                  <div
                    key={t.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h3 className="font-display font-bold text-base text-navy-900 dark:text-white">
                          {t.name}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {sport?.name || t.sportId} · {season?.name || t.seasonId} ·{' '}
                          {FORMAT_LABELS[t.format]}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-electric-600 dark:text-blue-400">
                          Estado: {TOURNAMENT_STATUS_LABELS[t.status] || t.status}
                        </span>
                        {canManageTournaments && (
                          <button
                            type="button"
                            onClick={() => openEditTournament(t)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            Editar
                          </button>
                        )}
                        {canDeleteTopLevel && (
                          <button
                            type="button"
                            onClick={() => setDeletingTournament(t)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Eliminar
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block">Puntuación</span>
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                          V:{t.winPoints} · E:{t.drawPoints} · D:{t.lossPoints}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block">Equipos</span>
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                          {tTeams.length}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block">Calendario</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {t.schedulePublished ? 'Publicado' : 'Pendiente'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-slate-500 block">Campeón</span>
                        <span className="font-medium text-amber-700 dark:text-amber-400">
                          {t.championTeamName || 'En competencia'}
                        </span>
                      </div>
                    </div>

                    {canManageTournaments && tTeams.length > 0 && (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
                        <Crown className="w-4 h-4 text-amber-500" />
                        <span className="text-xs text-slate-600 dark:text-slate-300">
                          Cerrar y declarar campeón:
                        </span>
                        <select
                          value={t.championTeamId || ''}
                          onChange={(e) => {
                            if (e.target.value) handleSetTournamentChampion(t, e.target.value);
                          }}
                          className="px-2.5 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded-md bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                        >
                          <option value="">Seleccionar equipo campeón...</option>
                          {tTeams.map((tm) => (
                            <option key={tm.id} value={tm.id}>
                              {tm.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {tab === 'seasons' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {canManageTournaments && (
            <form
              onSubmit={handleCreateSeason}
              className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 h-fit transition-colors"
            >
              <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
                Nueva Temporada
              </h2>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nombre
                </label>
                <input
                  type="text"
                  required
                  value={seasonName}
                  onChange={(e) => setSeasonName(e.target.value)}
                  placeholder="Ej. Temporada 2026-2027"
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Año
                </label>
                <input
                  type="number"
                  required
                  value={seasonYear}
                  onChange={(e) => setSeasonYear(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Inicio
                  </label>
                  <input
                    type="date"
                    value={seasonStart}
                    onChange={(e) => setSeasonStart(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Fin
                  </label>
                  <input
                    type="date"
                    value={seasonEnd}
                    onChange={(e) => setSeasonEnd(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 px-4 bg-navy-900 dark:bg-electric-500 hover:bg-navy-800 dark:hover:bg-electric-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Registrar Temporada
              </button>
            </form>
          )}

          <div
            className={`${canManageTournaments ? 'lg:col-span-8' : 'lg:col-span-12'} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden transition-colors`}
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
                Historial y Vigencia de Temporadas
              </h2>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {seasons.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No hay temporadas registradas todavía.
                </div>
              ) : (
                seasons.map((s) => (
                  <div key={s.id} className="p-4 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{s.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        {s.startDate} → {s.endDate} · Año {s.year}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        {SEASON_STATUS_LABELS[s.status] || s.status}
                      </span>
                      {canManageTournaments && s.status !== 'finalizada' && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => handleCloseSeason(s)}
                          className="px-2.5 py-1 text-xs border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          Cerrar temporada
                        </button>
                      )}
                      {canManageTournaments && (
                        <button
                          type="button"
                          onClick={() => openEditSeason(s)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          Editar
                        </button>
                      )}
                      {canDeleteTopLevel && (
                        <button
                          type="button"
                          onClick={() => setDeletingSeason(s)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'sports' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {canManageSports && (
            <form
              onSubmit={handleCreateSport}
              className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 h-fit transition-colors"
            >
              <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                <Settings2 className="w-4 h-4 text-electric-500" />
                <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
                  Agregar Disciplina Deportiva
                </h2>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nombre
                </label>
                <input
                  type="text"
                  required
                  value={sName}
                  onChange={(e) => setSName(e.target.value)}
                  placeholder="Ej. Handball"
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Clave técnica
                </label>
                <input
                  type="text"
                  required
                  value={sKey}
                  onChange={(e) => setSKey(e.target.value)}
                  placeholder="handball"
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Motor
                  </label>
                  <select
                    value={sEngine}
                    onChange={(e) => setSEngine(e.target.value as SportEngineType)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    <option value="football">Fútbol</option>
                    <option value="basketball">Básquetbol</option>
                    <option value="volleyball">Voleibol</option>
                    <option value="baseball">Béisbol/Softbol</option>
                    <option value="athletics">Atletismo</option>
                    <option value="racquet">Raqueta</option>
                    <option value="generic">Genérico</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Periodos
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={sPeriods}
                    onChange={(e) => setSPeriods(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Etiqueta de periodo
                </label>
                <input
                  type="text"
                  value={sPeriodLabel}
                  onChange={(e) => setSPeriodLabel(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={sAllowDraws}
                  onChange={(e) => setSAllowDraws(e.target.checked)}
                />
                Permite empates en tiempo regular
              </label>
              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 px-4 bg-navy-900 dark:bg-electric-500 hover:bg-navy-800 dark:hover:bg-electric-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Registrar Disciplina
              </button>
            </form>
          )}

          <div className={`${canManageSports ? 'lg:col-span-8' : 'lg:col-span-12'} grid grid-cols-1 md:grid-cols-2 gap-4`}>
            {sports.map((sp) => {
              const rule = sportRules.find((r) => r.sportId === sp.id && !r.tournamentId);
              return (
                <div
                  key={sp.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-electric-500" />
                      <h3 className="font-display font-semibold text-slate-900 dark:text-white">
                        {sp.name}
                      </h3>
                    </div>
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      {sp.engineType}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {sp.periodsCount} {sp.periodLabel || 'periodos'} ·{' '}
                    {sp.allowDraws ? 'Permite empate' : 'Sin empates'}
                    {sp.isPrimary ? ' · Disciplina principal' : ''}
                  </p>
                  {rule && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
                      <span>{rule.name}</span>
                      <span className="font-mono tabular-nums">
                        {rule.winPoints}/{rule.drawPoints}/{rule.lossPoints} pts
                      </span>
                    </div>
                  )}
                  {canManageSports && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEditSport(sp)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingSport(sp)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal Editar Torneo */}
      {canManageTournaments && editingTournament && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEditTournament}
            className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-amber-500" />
                  Editar Torneo
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Modifica la configuración general, estado y reglas de puntuación del torneo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingTournament(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nombre del Torneo
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={140}
                  value={etName}
                  onChange={(e) => setEtName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Disciplina
                </label>
                <select
                  value={etSportId}
                  onChange={(e) => setEtSportId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  {sports.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Temporada
                </label>
                <select
                  value={etSeasonId}
                  onChange={(e) => setEtSeasonId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Modalidad
                </label>
                <select
                  value={etFormat}
                  onChange={(e) => setEtFormat(e.target.value as TournamentFormat)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="round_robin">Todos contra todos</option>
                  <option value="knockout">Eliminación directa</option>
                  <option value="groups">Fase de grupos</option>
                  <option value="mixed">Modalidad mixta (Grupos + Finales)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Estado
                </label>
                <select
                  value={etStatus}
                  onChange={(e) => setEtStatus(e.target.value as Tournament['status'])}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  {(Object.keys(TOURNAMENT_STATUS_LABELS) as Tournament['status'][]).map((st) => (
                    <option key={st} value={st}>
                      {TOURNAMENT_STATUS_LABELS[st]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 pt-1">
                <input
                  type="checkbox"
                  checked={etDoubleRound}
                  onChange={(e) => setEtDoubleRound(e.target.checked)}
                />
                Ida y vuelta (2 vueltas)
              </label>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Descanso mínimo (hrs)
                </label>
                <input
                  type="number"
                  min={0}
                  max={240}
                  value={etMinRest}
                  onChange={(e) => setEtMinRest(Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                />
              </div>
            </div>

            {(etFormat === 'groups' || etFormat === 'mixed') && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Equipos por grupo
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={16}
                    value={etTeamsPerGroup}
                    onChange={(e) => setEtTeamsPerGroup(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Clasificados por grupo
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={etQualifiers}
                    onChange={(e) => setEtQualifiers(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Victoria</span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={etWinPts}
                  onChange={(e) => setEtWinPts(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                />
              </div>
              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Empate</span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={etDrawPts}
                  onChange={(e) => setEtDrawPts(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                />
              </div>
              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Derrota</span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={etLossPts}
                  onChange={(e) => setEtLossPts(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                />
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Criterios de Desempate
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {(Object.keys(TIEBREAKER_LABELS) as TiebreakerCriterion[]).map((crit) => (
                  <label
                    key={crit}
                    className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300"
                  >
                    <input
                      type="checkbox"
                      checked={etTiebreakers.includes(crit)}
                      onChange={() => toggleEditTiebreaker(crit)}
                    />
                    {TIEBREAKER_LABELS[crit]}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditingTournament(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-electric-500 hover:bg-electric-600 disabled:opacity-60 text-white text-xs font-semibold rounded-lg"
              >
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Confirmar Eliminación de Torneo */}
      {canDeleteTopLevel && deletingTournament && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                    Eliminar Torneo
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Esta acción elimina permanentemente el torneo.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeletingTournament(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-xs space-y-1">
              <p className="font-semibold text-slate-900 dark:text-white">
                {deletingTournament.name}
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                Vinculado actualmente a {categories.filter((c) => c.tournamentId === deletingTournament.id).length} categoría(s),{' '}
                {teams.filter((t) => t.tournamentId === deletingTournament.id).length} equipo(s) y{' '}
                {matches.filter((m) => m.tournamentId === deletingTournament.id).length} partido(s).
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setDeletingTournament(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleConfirmDeleteTournament}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {saving ? 'Eliminando...' : 'Eliminar torneo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Temporada */}
      {canManageTournaments && editingSeason && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEditSeason}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-6 space-y-4"
          >
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-amber-500" />
                Editar Temporada
              </h3>
              <button
                type="button"
                onClick={() => setEditingSeason(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nombre
              </label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={100}
                value={esName}
                onChange={(e) => setEsName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Año
                </label>
                <input
                  type="number"
                  required
                  min={2000}
                  max={2100}
                  value={esYear}
                  onChange={(e) => setEsYear(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Estado
                </label>
                <select
                  value={esStatus}
                  onChange={(e) => setEsStatus(e.target.value as Season['status'])}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="planificada">Planificada</option>
                  <option value="activa">Activa</option>
                  <option value="finalizada">Finalizada</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Fecha inicio
                </label>
                <input
                  type="date"
                  required
                  value={esStart}
                  onChange={(e) => setEsStart(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Fecha fin
                </label>
                <input
                  type="date"
                  required
                  value={esEnd}
                  onChange={(e) => setEsEnd(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditingSeason(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-electric-500 hover:bg-electric-600 disabled:opacity-60 text-white text-xs font-semibold rounded-lg"
              >
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Confirmar Eliminación de Temporada */}
      {canDeleteTopLevel && deletingSeason && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                    Eliminar Temporada
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Confirma la eliminación permanente de esta temporada.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeletingSeason(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-xs space-y-1">
              <p className="font-semibold text-slate-900 dark:text-white">
                {deletingSeason.name} ({deletingSeason.year})
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                Tiene {tournaments.filter((t) => t.seasonId === deletingSeason.id).length} torneo(s) asociados.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setDeletingSeason(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleConfirmDeleteSeason}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {saving ? 'Eliminando...' : 'Eliminar temporada'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Disciplina */}
      {canManageSports && editingSport && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEditSport}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-6 space-y-4"
          >
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-amber-500" />
                  Editar Disciplina Deportiva
                </h3>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  Clave: {editingSport.key}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingSport(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nombre
              </label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={80}
                value={espName}
                onChange={(e) => setEspName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Motor
                </label>
                <select
                  value={espEngine}
                  onChange={(e) => setEspEngine(e.target.value as SportEngineType)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="football">Fútbol</option>
                  <option value="basketball">Básquetbol</option>
                  <option value="volleyball">Voleibol</option>
                  <option value="baseball">Béisbol/Softbol</option>
                  <option value="athletics">Atletismo</option>
                  <option value="racquet">Raqueta</option>
                  <option value="generic">Genérico</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Periodos
                </label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={espPeriods}
                  onChange={(e) => setEspPeriods(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Etiqueta de periodo
              </label>
              <input
                type="text"
                maxLength={40}
                value={espPeriodLabel}
                onChange={(e) => setEspPeriodLabel(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={espAllowDraws}
                  onChange={(e) => setEspAllowDraws(e.target.checked)}
                />
                Permite empates en tiempo regular
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={espActive}
                  onChange={(e) => setEspActive(e.target.checked)}
                />
                Disciplina activa en el catálogo
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={espIsPrimary}
                  onChange={(e) => setEspIsPrimary(e.target.checked)}
                />
                Disciplina principal
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditingSport(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-electric-500 hover:bg-electric-600 disabled:opacity-60 text-white text-xs font-semibold rounded-lg"
              >
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Confirmar Eliminación de Disciplina */}
      {canManageSports && deletingSport && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                    Eliminar Disciplina
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Esta acción elimina la disciplina del catálogo.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeletingSport(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-xs space-y-1">
              <p className="font-semibold text-slate-900 dark:text-white">
                {deletingSport.name} ({deletingSport.engineType})
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                Torneos vinculados: {tournaments.filter((t) => t.sportId === deletingSport.id).length} · Reglamentos:{' '}
                {sportRules.filter((r) => r.sportId === deletingSport.id).length}.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setDeletingSport(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleConfirmDeleteSport}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {saving ? 'Eliminando...' : 'Eliminar disciplina'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
