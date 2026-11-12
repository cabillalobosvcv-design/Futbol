import React, { useState } from 'react';
import {
  Award,
  CalendarRange,
  CheckCircle2,
  Crown,
  Dumbbell,
  Layers,
  Plus,
  Settings2,
  Trophy,
} from 'lucide-react';
import { TIEBREAKER_LABELS } from '../engines/sportsCatalog';
import { useAuth } from '../context/AuthContext';
import { useSigdData } from '../context/SigdDataContext';
import {
  bootstrapDefaultCatalog,
  createAuditLog,
  makeId,
  saveEntityDoc,
} from '../services/firestoreService';
import {
  ROLE_PERMISSIONS,
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

export function TournamentsPage() {
  const { profile, role } = useAuth();
  const { sports, sportRules, seasons, tournaments, teams } = useSigdData();

  const [tab, setTab] = useState<SectionTab>('tournaments');
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canManageTournaments = ROLE_PERMISSIONS.canManageTournaments(role);
  const canManageSports = ROLE_PERMISSIONS.canManageSportsAndRules(role);

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

  const handleBootstrap = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      await bootstrapDefaultCatalog(profile.uid, profile.displayName);
      setMsg('Catálogo multideporte y reglamentos base creados.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !seasonName.trim()) return;
    setSaving(true);
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
      setMsg('Primero asegúrate de tener al menos un deporte y una temporada registrados.');
      return;
    }

    setSaving(true);
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
      setSName('');
      setSKey('');
      setMsg('Disciplina agregada al catálogo multideporte.');
    } finally {
      setSaving(false);
    }
  };

  const toggleTiebreaker = (crit: TiebreakerCriterion) => {
    setTTiebreakers((prev) =>
      prev.includes(crit) ? (prev.length > 1 ? prev.filter((c) => c !== crit) : prev) : [...prev, crit]
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-display font-bold text-navy-900">
            Temporadas, Torneos y Arquitectura Multideporte
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
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
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{msg}</span>
        </div>
      )}

      {/* Segmented Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 bg-white border border-slate-200 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => setTab('tournaments')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
            tab === 'tournaments' ? 'bg-navy-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Trophy className="w-4 h-4" />
          Torneos ({tournaments.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('seasons')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
            tab === 'seasons' ? 'bg-navy-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <CalendarRange className="w-4 h-4" />
          Temporadas ({seasons.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('sports')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
            tab === 'sports' ? 'bg-navy-900 text-white' : 'text-slate-600 hover:bg-slate-100'
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
              className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4 h-fit"
            >
              <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
                <Plus className="w-4 h-4 text-electric-500" />
                <h2 className="font-display font-semibold text-base text-slate-900">
                  Crear Nuevo Torneo
                </h2>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nombre del Torneo
                </label>
                <input
                  type="text"
                  required
                  value={tName}
                  onChange={(e) => setTName(e.target.value)}
                  placeholder="Ej. Torneo Apertura Fútbol 2026"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-electric-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Disciplina</label>
                  <select
                    value={tSportId || sports[0]?.id || ''}
                    onChange={(e) => setTSportId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50"
                  >
                    {sports.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Temporada</label>
                  <select
                    value={tSeasonId || seasons[0]?.id || ''}
                    onChange={(e) => setTSeasonId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50"
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
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Modalidad de Competencia
                </label>
                <select
                  value={tFormat}
                  onChange={(e) => setTFormat(e.target.value as TournamentFormat)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50"
                >
                  <option value="round_robin">Todos contra todos</option>
                  <option value="knockout">Eliminación directa</option>
                  <option value="groups">Fase de grupos</option>
                  <option value="mixed">Modalidad mixta (Grupos + Finales)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-xs text-slate-700 pt-1">
                  <input
                    type="checkbox"
                    checked={tDoubleRound}
                    onChange={(e) => setTDoubleRound(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Ida y vuelta (2 vueltas)
                </label>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Descanso mínimo (hrs)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={240}
                    value={tMinRest}
                    onChange={(e) => setTMinRest(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg font-mono tabular-nums"
                  />
                </div>
              </div>

              {(tFormat === 'groups' || tFormat === 'mixed') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Equipos por grupo
                    </label>
                    <input
                      type="number"
                      min={2}
                      max={16}
                      value={tTeamsPerGroup}
                      onChange={(e) => setTTeamsPerGroup(Number(e.target.value))}
                      className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Clasificados por grupo
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={tQualifiers}
                      onChange={(e) => setTQualifiers(Number(e.target.value))}
                      className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg font-mono tabular-nums"
                    />
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-slate-700 mb-1.5">
                  Sistema de Puntuación Configurable
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-[11px] text-slate-500 block">Victoria</span>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={tWinPts}
                      onChange={(e) => setTWinPts(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">Empate</span>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={tDrawPts}
                      onChange={(e) => setTDrawPts(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">Derrota</span>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={tLossPts}
                      onChange={(e) => setTLossPts(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg font-mono tabular-nums"
                    />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-700 mb-1.5">Criterios de Desempate</p>
                <div className="space-y-1.5">
                  {(Object.keys(TIEBREAKER_LABELS) as TiebreakerCriterion[]).map((crit) => (
                    <label key={crit} className="flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={tTiebreakers.includes(crit)}
                        onChange={() => toggleTiebreaker(crit)}
                        className="rounded border-slate-300"
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
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
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
                    className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h3 className="font-display font-bold text-base text-navy-900">{t.name}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {sport?.name || t.sportId} · {season?.name || t.seasonId} ·{' '}
                          {FORMAT_LABELS[t.format]}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-electric-600">
                        Estado: {t.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 text-xs">
                      <div>
                        <span className="text-slate-400 block">Puntuación</span>
                        <span className="font-mono font-semibold text-slate-800 tabular-nums">
                          V:{t.winPoints} · E:{t.drawPoints} · D:{t.lossPoints}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Equipos</span>
                        <span className="font-mono font-semibold text-slate-800 tabular-nums">
                          {tTeams.length}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Calendario</span>
                        <span className="font-medium text-slate-800">
                          {t.schedulePublished ? 'Publicado' : 'Pendiente'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Campeón</span>
                        <span className="font-medium text-amber-700">
                          {t.championTeamName || 'En competencia'}
                        </span>
                      </div>
                    </div>

                    {canManageTournaments && tTeams.length > 0 && (
                      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
                        <Crown className="w-4 h-4 text-amber-500" />
                        <span className="text-xs text-slate-600">Cerrar y declarar campeón:</span>
                        <select
                          value={t.championTeamId || ''}
                          onChange={(e) => {
                            if (e.target.value) handleSetTournamentChampion(t, e.target.value);
                          }}
                          className="px-2.5 py-1 text-xs border border-slate-200 rounded-md bg-slate-50"
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
              className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4 h-fit"
            >
              <h2 className="font-display font-semibold text-base text-slate-900">
                Nueva Temporada
              </h2>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nombre</label>
                <input
                  type="text"
                  required
                  value={seasonName}
                  onChange={(e) => setSeasonName(e.target.value)}
                  placeholder="Ej. Temporada 2026-2027"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Año</label>
                <input
                  type="number"
                  required
                  value={seasonYear}
                  onChange={(e) => setSeasonYear(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono tabular-nums"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Inicio</label>
                  <input
                    type="date"
                    value={seasonStart}
                    onChange={(e) => setSeasonStart(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Fin</label>
                  <input
                    type="date"
                    value={seasonEnd}
                    onChange={(e) => setSeasonEnd(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 px-4 bg-navy-900 hover:bg-navy-800 text-white text-sm font-medium rounded-lg"
              >
                Registrar Temporada
              </button>
            </form>
          )}

          <div className={`${canManageTournaments ? 'lg:col-span-8' : 'lg:col-span-12'} bg-white border border-slate-200 rounded-xl overflow-hidden`}>
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="font-display font-semibold text-base text-slate-900">
                Historial y Vigencia de Temporadas
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {seasons.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No hay temporadas registradas todavía.
                </div>
              ) : (
                seasons.map((s) => (
                  <div key={s.id} className="p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-900">{s.name}</p>
                      <p className="text-xs text-slate-500 font-mono tabular-nums">
                        {s.startDate} → {s.endDate} · Año {s.year}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-emerald-700">{s.status}</span>
                      {canManageTournaments && s.status !== 'finalizada' && (
                        <button
                          type="button"
                          onClick={() =>
                            saveEntityDoc('seasons', s.id, { status: 'finalizada' }, false)
                          }
                          className="px-2.5 py-1 text-xs border border-slate-200 rounded-md hover:bg-slate-50"
                        >
                          Cerrar temporada
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
              className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4 h-fit"
            >
              <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                <Settings2 className="w-4 h-4 text-electric-500" />
                <h2 className="font-display font-semibold text-base text-slate-900">
                  Agregar Disciplina Deportiva
                </h2>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nombre</label>
                <input
                  type="text"
                  required
                  value={sName}
                  onChange={(e) => setSName(e.target.value)}
                  placeholder="Ej. Handball"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Clave técnica</label>
                <input
                  type="text"
                  required
                  value={sKey}
                  onChange={(e) => setSKey(e.target.value)}
                  placeholder="handball"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Motor</label>
                  <select
                    value={sEngine}
                    onChange={(e) => setSEngine(e.target.value as SportEngineType)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50"
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
                  <label className="block text-xs font-medium text-slate-700 mb-1">Periodos</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={sPeriods}
                    onChange={(e) => setSPeriods(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono tabular-nums"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Etiqueta de periodo
                </label>
                <input
                  type="text"
                  value={sPeriodLabel}
                  onChange={(e) => setSPeriodLabel(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700">
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
                className="w-full py-2.5 px-4 bg-navy-900 hover:bg-navy-800 text-white text-sm font-medium rounded-lg"
              >
                Registrar Disciplina
              </button>
            </form>
          )}

          <div className={`${canManageSports ? 'lg:col-span-8' : 'lg:col-span-12'} grid grid-cols-1 md:grid-cols-2 gap-4`}>
            {sports.map((sp) => {
              const rule = sportRules.find((r) => r.sportId === sp.id);
              return (
                <div
                  key={sp.id}
                  className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-electric-500" />
                      <h3 className="font-display font-semibold text-slate-900">{sp.name}</h3>
                    </div>
                    <span className="text-xs font-mono text-slate-500">{sp.engineType}</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    {sp.periodsCount} {sp.periodLabel || 'periodos'} ·{' '}
                    {sp.allowDraws ? 'Permite empate' : 'Sin empates'}
                    {sp.isPrimary ? ' · Disciplina principal' : ''}
                  </p>
                  {rule && (
                    <div className="pt-2 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
                      <span>{rule.name}</span>
                      <span className="font-mono tabular-nums">
                        {rule.winPoints}/{rule.drawPoints}/{rule.lossPoints} pts
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
