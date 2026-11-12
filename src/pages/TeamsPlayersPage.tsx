import React, { useMemo, useState } from 'react';
import { CheckCircle2, FolderKanban, Shield, Shirt, UserPlus, Users } from 'lucide-react';
import { TeamCrest } from '../components/TeamCrest';
import { useAuth } from '../context/AuthContext';
import { useSigdData } from '../context/SigdDataContext';
import { createAuditLog, makeId, saveEntityDoc } from '../services/firestoreService';
import { ROLE_PERMISSIONS, type PlayerPosition } from '../types/sigd';

type Tab = 'categories' | 'teams' | 'players';

export function TeamsPlayersPage() {
  const { profile, role } = useAuth();
  const { tournaments, branches, categories, teams, players } = useSigdData();

  const [tab, setTab] = useState<Tab>('teams');
  const [filterTournamentId, setFilterTournamentId] = useState<string>('all');
  const [filterTeamId, setFilterTeamId] = useState<string>('all');
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canManage = ROLE_PERMISSIONS.canManageTeamsAndPlayers(role);

  // Category form
  const [cTournamentId, setCTournamentId] = useState('');
  const [cBranchId, setCBranchId] = useState('');
  const [cName, setCName] = useState('');
  const [cMinAge, setCMinAge] = useState(15);
  const [cMaxAge, setCMaxAge] = useState(99);

  // Team form
  const [tmTournamentId, setTmTournamentId] = useState('');
  const [tmCategoryId, setTmCategoryId] = useState('');
  const [tmName, setTmName] = useState('');
  const [tmCode, setTmCode] = useState('');
  const [tmPrimary, setTmPrimary] = useState('#0A192F');
  const [tmSecondary, setTmSecondary] = useState('#2563EB');
  const [tmCoach, setTmCoach] = useState('');

  // Player form
  const [plTeamId, setPlTeamId] = useState('');
  const [plName, setPlName] = useState('');
  const [plNumber, setPlNumber] = useState(10);
  const [plPosition, setPlPosition] = useState<PlayerPosition>('Delantero');
  const [plBirthYear, setPlBirthYear] = useState(2002);

  const tournamentMap = useMemo(() => new Map(tournaments.map((t) => [t.id, t])), [tournaments]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const effectiveTournamentForCat = cTournamentId || tournaments[0]?.id || '';
  const effectiveTournamentForTeam = tmTournamentId || tournaments[0]?.id || '';
  const categoriesForTeamForm = categories.filter(
    (c) => c.tournamentId === effectiveTournamentForTeam
  );
  const effectiveCategoryForTeam = tmCategoryId || categoriesForTeamForm[0]?.id || '';

  const filteredTeams = teams.filter((t) =>
    filterTournamentId === 'all' ? true : t.tournamentId === filterTournamentId
  );

  const filteredPlayers = players.filter((p) => {
    if (filterTournamentId !== 'all' && p.tournamentId !== filterTournamentId) return false;
    if (filterTeamId !== 'all' && p.teamId !== filterTeamId) return false;
    return true;
  });

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !cName.trim() || !effectiveTournamentForCat) return;
    setSaving(true);
    try {
      const id = makeId('cat');
      const branch = branches.find((b) => b.id === cBranchId) || branches[0];
      await saveEntityDoc(
        'categories',
        id,
        {
          tournamentId: effectiveTournamentForCat,
          branchId: branch?.id || 'branch_varonil',
          branchName: branch?.name || 'Varonil',
          name: cName.trim(),
          minAge: Number(cMinAge),
          maxAge: Number(cMaxAge),
          schedulePublished: false,
        },
        true
      );
      await createAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        action: 'CREATE_CATEGORY',
        entity: 'categories',
        entityId: id,
        summary: `Categoría registrada: ${cName.trim()}`,
      });
      setCName('');
      setMsg('Categoría creada correctamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !tmName.trim() || !effectiveCategoryForTeam) return;
    setSaving(true);
    try {
      const id = makeId('tm');
      const code = (tmCode.trim() || tmName.trim().slice(0, 3)).toUpperCase().slice(0, 6);
      await saveEntityDoc(
        'teams',
        id,
        {
          tournamentId: effectiveTournamentForTeam,
          categoryId: effectiveCategoryForTeam,
          name: tmName.trim(),
          shortCode: code,
          primaryColor: tmPrimary,
          secondaryColor: tmSecondary,
          coachName: tmCoach.trim(),
          active: true,
        },
        true
      );
      await createAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        action: 'CREATE_TEAM',
        entity: 'teams',
        entityId: id,
        summary: `Equipo inscrito: ${tmName.trim()} (${code})`,
      });
      setTmName('');
      setTmCode('');
      setTmCoach('');
      setMsg('Equipo inscrito correctamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    const chosenTeamId = plTeamId || teams[0]?.id;
    const team = teamMap.get(chosenTeamId || '');
    if (!profile || !plName.trim() || !team) return;
    setSaving(true);
    try {
      const id = makeId('ply');
      await saveEntityDoc(
        'players',
        id,
        {
          tournamentId: team.tournamentId,
          categoryId: team.categoryId,
          teamId: team.id,
          fullName: plName.trim(),
          jerseyNumber: Number(plNumber),
          position: plPosition,
          birthYear: Number(plBirthYear),
          active: true,
        },
        true
      );
      setPlName('');
      setMsg('Jugador agregado al plantel.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-display font-bold text-navy-900">
            Categorías, Equipos y Planteles de Jugadores
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Gestiona categorías por torneo y rama, identidad visual de equipos y registro oficial de jugadores.
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

      {msg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{msg}</span>
        </div>
      )}

      <div className="flex items-center gap-1.5 p-1.5 bg-white border border-slate-200 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => setTab('categories')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
            tab === 'categories' ? 'bg-navy-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FolderKanban className="w-4 h-4" />
          Categorías ({categories.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('teams')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
            tab === 'teams' ? 'bg-navy-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Shield className="w-4 h-4" />
          Equipos ({filteredTeams.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('players')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
            tab === 'players' ? 'bg-navy-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          Jugadores ({filteredPlayers.length})
        </button>
      </div>

      {tab === 'categories' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {canManage && (
            <form
              onSubmit={handleCreateCategory}
              className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4 h-fit"
            >
              <h2 className="font-display font-semibold text-base text-slate-900">
                Registrar Categoría
              </h2>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Torneo</label>
                <select
                  value={effectiveTournamentForCat}
                  onChange={(e) => setCTournamentId(e.target.value)}
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
                <label className="block text-xs font-medium text-slate-700 mb-1">Rama</label>
                <select
                  value={cBranchId || branches[0]?.id || ''}
                  onChange={(e) => setCBranchId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50"
                >
                  <option value="branch_varonil">Varonil</option>
                  <option value="branch_femenil">Femenil</option>
                  <option value="branch_mixta">Mixta</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nombre de Categoría
                </label>
                <input
                  type="text"
                  required
                  value={cName}
                  onChange={(e) => setCName(e.target.value)}
                  placeholder="Ej. Libre / Sub-17 / Primera Fuerza"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Edad mín.</label>
                  <input
                    type="number"
                    value={cMinAge}
                    onChange={(e) => setCMinAge(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Edad máx.</label>
                  <input
                    type="number"
                    value={cMaxAge}
                    onChange={(e) => setCMaxAge(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono tabular-nums"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={saving || tournaments.length === 0}
                className="w-full py-2.5 px-4 bg-electric-500 hover:bg-electric-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
              >
                Crear Categoría
              </button>
            </form>
          )}

          <div className={`${canManage ? 'lg:col-span-8' : 'lg:col-span-12'} grid grid-cols-1 md:grid-cols-2 gap-4`}>
            {categories.map((c) => (
              <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-semibold text-slate-900">{c.name}</h3>
                  <span className="text-xs text-slate-500">{c.branchName || 'General'}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {tournamentMap.get(c.tournamentId)?.name || c.tournamentId}
                </p>
                <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <span className="font-mono tabular-nums">
                    {teams.filter((t) => t.categoryId === c.id).length} equipos
                  </span>
                  <span>{c.schedulePublished ? 'Calendario publicado' : 'Sin publicar'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'teams' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {canManage && (
            <form
              onSubmit={handleCreateTeam}
              className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4 h-fit"
            >
              <h2 className="font-display font-semibold text-base text-slate-900">
                Inscribir Equipo
              </h2>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Torneo</label>
                <select
                  value={effectiveTournamentForTeam}
                  onChange={(e) => {
                    setTmTournamentId(e.target.value);
                    setTmCategoryId('');
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
                <label className="block text-xs font-medium text-slate-700 mb-1">Categoría</label>
                <select
                  value={effectiveCategoryForTeam}
                  onChange={(e) => setTmCategoryId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50"
                >
                  {categoriesForTeamForm.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.branchName || 'Gral'})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nombre</label>
                  <input
                    type="text"
                    required
                    value={tmName}
                    onChange={(e) => setTmName(e.target.value)}
                    placeholder="Atlético Norte"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Siglas</label>
                  <input
                    type="text"
                    maxLength={5}
                    value={tmCode}
                    onChange={(e) => setTmCode(e.target.value.toUpperCase())}
                    placeholder="ATN"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono uppercase"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Director Técnico
                </label>
                <input
                  type="text"
                  value={tmCoach}
                  onChange={(e) => setTmCoach(e.target.value)}
                  placeholder="Nombre del DT"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Color principal
                  </label>
                  <input
                    type="color"
                    value={tmPrimary}
                    onChange={(e) => setTmPrimary(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-200 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Color secundario
                  </label>
                  <input
                    type="color"
                    value={tmSecondary}
                    onChange={(e) => setTmSecondary(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-200 cursor-pointer"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={saving || !effectiveCategoryForTeam}
                className="w-full py-2.5 px-4 bg-electric-500 hover:bg-electric-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
              >
                Inscribir Equipo
              </button>
            </form>
          )}

          <div className={`${canManage ? 'lg:col-span-8' : 'lg:col-span-12'} grid grid-cols-1 md:grid-cols-2 gap-4`}>
            {filteredTeams.map((tm) => (
              <div
                key={tm.id}
                className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <TeamCrest
                    name={tm.name}
                    shortCode={tm.shortCode}
                    primaryColor={tm.primaryColor}
                    secondaryColor={tm.secondaryColor}
                    size="lg"
                  />
                  <div className="min-w-0">
                    <h3 className="font-display font-semibold text-slate-900 truncate">
                      {tm.name}
                    </h3>
                    <p className="text-xs text-slate-500 truncate">
                      {categoryMap.get(tm.categoryId)?.name} · {tournamentMap.get(tm.tournamentId)?.name}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      DT: {tm.coachName || 'Sin asignar'} ·{' '}
                      <span className="font-mono tabular-nums">
                        {players.filter((p) => p.teamId === tm.id).length} jugadores
                      </span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFilterTeamId(tm.id);
                    setPlTeamId(tm.id);
                    setTab('players');
                  }}
                  className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 shrink-0"
                >
                  Ver plantel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'players' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {canManage && (
            <form
              onSubmit={handleCreatePlayer}
              className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4 h-fit"
            >
              <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                <UserPlus className="w-4 h-4 text-electric-500" />
                <h2 className="font-display font-semibold text-base text-slate-900">
                  Registrar Jugador
                </h2>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Equipo</label>
                <select
                  value={plTeamId || teams[0]?.id || ''}
                  onChange={(e) => setPlTeamId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50"
                >
                  {teams.map((tm) => (
                    <option key={tm.id} value={tm.id}>
                      {tm.name} ({categoryMap.get(tm.categoryId)?.name})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nombre completo
                </label>
                <input
                  type="text"
                  required
                  value={plName}
                  onChange={(e) => setPlName(e.target.value)}
                  placeholder="Carlos Mendoza"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Dorsal</label>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={plNumber}
                    onChange={(e) => setPlNumber(Number(e.target.value))}
                    className="w-full px-2.5 py-2 text-sm border border-slate-200 rounded-lg font-mono tabular-nums"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Posición</label>
                  <select
                    value={plPosition}
                    onChange={(e) => setPlPosition(e.target.value as PlayerPosition)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50"
                  >
                    <option value="Portero">Portero</option>
                    <option value="Defensa">Defensa</option>
                    <option value="Mediocampista">Mediocampista</option>
                    <option value="Delantero">Delantero</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Año de nacimiento
                </label>
                <input
                  type="number"
                  min={1950}
                  max={2022}
                  value={plBirthYear}
                  onChange={(e) => setPlBirthYear(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono tabular-nums"
                />
              </div>
              <button
                type="submit"
                disabled={saving || teams.length === 0}
                className="w-full py-2.5 px-4 bg-navy-900 hover:bg-navy-800 text-white text-sm font-medium rounded-lg disabled:opacity-50"
              >
                Agregar Jugador
              </button>
            </form>
          )}

          <div className={`${canManage ? 'lg:col-span-8' : 'lg:col-span-12'} bg-white border border-slate-200 rounded-xl overflow-hidden`}>
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Shirt className="w-4 h-4 text-electric-500" />
                <h2 className="font-display font-semibold text-base text-slate-900">
                  Planteles Registrados
                </h2>
              </div>
              <select
                value={filterTeamId}
                onChange={(e) => setFilterTeamId(e.target.value)}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50"
              >
                <option value="all">Todos los equipos</option>
                {teams.map((tm) => (
                  <option key={tm.id} value={tm.id}>
                    {tm.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                    <th className="py-2.5 px-4 text-left font-medium">#</th>
                    <th className="py-2.5 px-4 text-left font-medium">Jugador</th>
                    <th className="py-2.5 px-4 text-left font-medium">Posición</th>
                    <th className="py-2.5 px-4 text-left font-medium">Equipo</th>
                    <th className="py-2.5 px-4 text-right font-medium">Año</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPlayers.map((pl) => (
                    <tr key={pl.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-mono font-bold tabular-nums text-navy-900">
                        {pl.jerseyNumber}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900">{pl.fullName}</td>
                      <td className="py-2.5 px-4 text-slate-600">{pl.position}</td>
                      <td className="py-2.5 px-4 text-slate-700">
                        {teamMap.get(pl.teamId)?.name || pl.teamId}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500">
                        {pl.birthYear || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
