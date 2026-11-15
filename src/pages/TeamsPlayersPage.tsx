import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FolderKanban,
  Image as ImageIcon,
  Link2,
  Shield,
  Shirt,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import { TeamCrest } from '../components/TeamCrest';
import { useAuth } from '../context/AuthContext';
import { useSigdData } from '../context/SigdDataContext';
import {
  createAuditLog,
  makeId,
  saveEntityDoc,
  updateTeamCrestUrl,
  uploadTeamLogo,
} from '../services/firestoreService';
import { ROLE_PERMISSIONS, type PlayerPosition, type Team } from '../types/sigd';

type Tab = 'categories' | 'teams' | 'players';

const MAX_LOGO_BYTES = 3 * 1024 * 1024; // 3 MB

export function TeamsPlayersPage() {
  const { profile, role } = useAuth();
  const { tournaments, branches, categories, teams, players } = useSigdData();

  const [tab, setTab] = useState<Tab>('teams');
  const [filterTournamentId, setFilterTournamentId] = useState<string>('all');
  const [filterTeamId, setFilterTeamId] = useState<string>('all');
  const [msg, setMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canManage = ROLE_PERMISSIONS.canManageTeamsAndPlayers(role);

  // Category form
  const [cTournamentId, setCTournamentId] = useState('');
  const [cBranchId, setCBranchId] = useState('');
  const [cName, setCName] = useState('');
  const [cMinAge, setCMinAge] = useState(15);
  const [cMaxAge, setCMaxAge] = useState(99);

  // Team form (with logo instead of color pickers)
  const [tmDraftId, setTmDraftId] = useState(() => makeId('tm'));
  const [tmTournamentId, setTmTournamentId] = useState('');
  const [tmCategoryId, setTmCategoryId] = useState('');
  const [tmName, setTmName] = useState('');
  const [tmCode, setTmCode] = useState('');
  const [tmLogoUrl, setTmLogoUrl] = useState('');
  const [tmUploadingLogo, setTmUploadingLogo] = useState(false);
  const [tmCoach, setTmCoach] = useState('');
  const teamLogoInputRef = useRef<HTMLInputElement | null>(null);

  // Inline logo editor for existing teams
  const [editingLogoTeamId, setEditingLogoTeamId] = useState<string | null>(null);
  const [editLogoUrl, setEditLogoUrl] = useState('');
  const [editLogoBusy, setEditLogoBusy] = useState(false);

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

  const handleTeamLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !canManage) return;
    setMsg(null);
    setErrMsg(null);

    if (!file.type.startsWith('image/')) {
      setErrMsg('Selecciona una imagen válida (PNG, JPG, WebP o SVG) para el logotipo del equipo.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setErrMsg('El logotipo del equipo no debe superar los 3 MB.');
      return;
    }

    setTmUploadingLogo(true);
    try {
      const downloadUrl = await uploadTeamLogo(tmDraftId, file);
      setTmLogoUrl(downloadUrl);
      setMsg('Logotipo subido a Firebase Storage y listo para asignarse al equipo.');
    } catch (err) {
      const raw = err instanceof Error ? err.message : '';
      setErrMsg(
        raw.includes('storage/')
          ? `No se pudo subir el logotipo a Firebase Storage (${raw}). Puedes pegar una URL directa.`
          : 'No se pudo subir el logotipo a Firebase Storage. Intenta de nuevo o pega una URL directa.'
      );
    } finally {
      setTmUploadingLogo(false);
      if (teamLogoInputRef.current) teamLogoInputRef.current.value = '';
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !tmName.trim() || !effectiveCategoryForTeam) return;
    setSaving(true);
    setMsg(null);
    setErrMsg(null);
    try {
      const id = tmDraftId;
      const code = (tmCode.trim() || tmName.trim().slice(0, 3)).toUpperCase().slice(0, 6);
      const cleanLogoUrl = tmLogoUrl.trim().slice(0, 500);
      await saveEntityDoc(
        'teams',
        id,
        {
          tournamentId: effectiveTournamentForTeam,
          categoryId: effectiveCategoryForTeam,
          name: tmName.trim(),
          shortCode: code,
          primaryColor: '#0A192F',
          ...(cleanLogoUrl ? { crestUrl: cleanLogoUrl } : {}),
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
        summary: `Equipo inscrito: ${tmName.trim()} (${code})${cleanLogoUrl ? ' con logotipo oficial' : ''}`,
      });
      setTmDraftId(makeId('tm'));
      setTmName('');
      setTmCode('');
      setTmLogoUrl('');
      setTmCoach('');
      setMsg('Equipo inscrito correctamente con su logotipo.');
    } catch {
      setErrMsg('No se pudo inscribir el equipo. Verifica tus permisos o la URL del logotipo.');
    } finally {
      setSaving(false);
    }
  };

  const handleExistingTeamLogoFile = async (
    team: Team,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !profile || !canManage) return;
    setMsg(null);
    setErrMsg(null);

    if (!file.type.startsWith('image/')) {
      setErrMsg('Selecciona un archivo de imagen válido (PNG, JPG, WebP o SVG).');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setErrMsg('El logotipo del equipo no debe superar los 3 MB.');
      return;
    }

    setEditLogoBusy(true);
    try {
      const downloadUrl = await uploadTeamLogo(team.id, file);
      setEditLogoUrl(downloadUrl);
      await updateTeamCrestUrl({
        team,
        crestUrl: downloadUrl,
        actorUid: profile.uid,
        actorName: profile.displayName,
      });
      setEditingLogoTeamId(null);
      setMsg(`Logotipo de ${team.name} actualizado correctamente.`);
    } catch {
      setErrMsg('No se pudo subir el nuevo logotipo. Puedes pegar una URL directa.');
    } finally {
      setEditLogoBusy(false);
      e.target.value = '';
    }
  };

  const handleSaveExistingTeamLogoUrl = async (team: Team) => {
    if (!profile || !canManage) return;
    setEditLogoBusy(true);
    setMsg(null);
    setErrMsg(null);
    try {
      await updateTeamCrestUrl({
        team,
        crestUrl: editLogoUrl,
        actorUid: profile.uid,
        actorName: profile.displayName,
      });
      setEditingLogoTeamId(null);
      setMsg(`Logotipo de ${team.name} guardado correctamente.`);
    } catch {
      setErrMsg('No se pudo actualizar el logotipo del equipo.');
    } finally {
      setEditLogoBusy(false);
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
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors">
        <div>
          <h1 className="text-xl font-display font-bold text-navy-900 dark:text-white">
            Categorías, Equipos y Planteles de Jugadores
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            Gestiona categorías por torneo y rama, identidad visual de equipos y registro oficial de jugadores.
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

      <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-fit transition-colors">
        <button
          type="button"
          onClick={() => setTab('categories')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'categories'
              ? 'bg-navy-900 dark:bg-electric-500 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <FolderKanban className="w-4 h-4" />
          Categorías ({categories.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('teams')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'teams'
              ? 'bg-navy-900 dark:bg-electric-500 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Shield className="w-4 h-4" />
          Equipos ({filteredTeams.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('players')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'players'
              ? 'bg-navy-900 dark:bg-electric-500 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
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
              className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 h-fit transition-colors"
            >
              <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
                Registrar Categoría
              </h2>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Torneo
                </label>
                <select
                  value={effectiveTournamentForCat}
                  onChange={(e) => setCTournamentId(e.target.value)}
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
                  Rama
                </label>
                <select
                  value={cBranchId || branches[0]?.id || ''}
                  onChange={(e) => setCBranchId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="branch_varonil">Varonil</option>
                  <option value="branch_femenil">Femenil</option>
                  <option value="branch_mixta">Mixta</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nombre de Categoría
                </label>
                <input
                  type="text"
                  required
                  value={cName}
                  onChange={(e) => setCName(e.target.value)}
                  placeholder="Ej. Libre / Sub-17 / Primera Fuerza"
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Edad mín.
                  </label>
                  <input
                    type="number"
                    value={cMinAge}
                    onChange={(e) => setCMinAge(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Edad máx.
                  </label>
                  <input
                    type="number"
                    value={cMaxAge}
                    onChange={(e) => setCMaxAge(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
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
              <div
                key={c.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-semibold text-slate-900 dark:text-white">
                    {c.name}
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {c.branchName || 'General'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {tournamentMap.get(c.tournamentId)?.name || c.tournamentId}
                </p>
                <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
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
              className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 h-fit transition-colors"
            >
              <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
                Inscribir Equipo
              </h2>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Torneo
                </label>
                <select
                  value={effectiveTournamentForTeam}
                  onChange={(e) => {
                    setTmTournamentId(e.target.value);
                    setTmCategoryId('');
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
                  Categoría
                </label>
                <select
                  value={effectiveCategoryForTeam}
                  onChange={(e) => setTmCategoryId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
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
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nombre
                  </label>
                  <input
                    type="text"
                    required
                    value={tmName}
                    onChange={(e) => setTmName(e.target.value)}
                    placeholder="Atlético Norte"
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Siglas
                  </label>
                  <input
                    type="text"
                    maxLength={5}
                    value={tmCode}
                    onChange={(e) => setTmCode(e.target.value.toUpperCase())}
                    placeholder="ATN"
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono uppercase"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Director Técnico
                </label>
                <input
                  type="text"
                  value={tmCoach}
                  onChange={(e) => setTmCoach(e.target.value)}
                  placeholder="Nombre del DT"
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>
              {/* Team Logo Section (replaces color pickers) */}
              <div className="p-3.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <TeamCrest
                      name={tmName.trim() || 'Nuevo Equipo'}
                      shortCode={(tmCode.trim() || tmName.trim().slice(0, 3) || 'EQ').toUpperCase()}
                      crestUrl={tmLogoUrl.trim() || undefined}
                      size="lg"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-electric-500 shrink-0" />
                        <span>Logotipo del Equipo</span>
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        PNG, JPG, WebP o SVG (máx. 3 MB)
                      </p>
                    </div>
                  </div>

                  <div>
                    <input
                      ref={teamLogoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={handleTeamLogoFileChange}
                      className="hidden"
                      id="team-logo-upload"
                    />
                    <label
                      htmlFor="team-logo-upload"
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-navy-900 dark:bg-electric-500 hover:bg-navy-800 dark:hover:bg-electric-600 cursor-pointer transition-colors whitespace-nowrap ${
                        tmUploadingLogo ? 'opacity-60 pointer-events-none' : ''
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {tmUploadingLogo ? 'Subiendo...' : 'Subir logo'}
                    </label>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1">
                    <Link2 className="w-3 h-3 text-slate-400" />
                    O pegar URL directa del logotipo (opcional)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      maxLength={500}
                      value={tmLogoUrl}
                      onChange={(e) => setTmLogoUrl(e.target.value)}
                      placeholder="https://.../escudo-equipo.png"
                      className="flex-1 px-2.5 py-1.5 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    />
                    {tmLogoUrl.trim() && (
                      <button
                        type="button"
                        onClick={() => setTmLogoUrl('')}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        title="Quitar logotipo"
                        aria-label="Quitar logotipo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={saving || tmUploadingLogo || !effectiveCategoryForTeam}
                className="w-full py-2.5 px-4 bg-electric-500 hover:bg-electric-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
              >
                {saving ? 'Inscribiendo...' : 'Inscribir Equipo'}
              </button>
            </form>
          )}

          <div className={`${canManage ? 'lg:col-span-8' : 'lg:col-span-12'} grid grid-cols-1 md:grid-cols-2 gap-4 h-fit`}>
            {filteredTeams.map((tm) => {
              const isEditingLogo = editingLogoTeamId === tm.id;
              return (
                <div
                  key={tm.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <TeamCrest
                        name={tm.name}
                        shortCode={tm.shortCode}
                        primaryColor={tm.primaryColor}
                        secondaryColor={tm.secondaryColor}
                        crestUrl={tm.crestUrl}
                        size="lg"
                      />
                      <div className="min-w-0">
                        <h3 className="font-display font-semibold text-slate-900 dark:text-white truncate">
                          {tm.name}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {categoryMap.get(tm.categoryId)?.name} · {tournamentMap.get(tm.tournamentId)?.name}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                          DT: {tm.coachName || 'Sin asignar'} ·{' '}
                          <span className="font-mono tabular-nums">
                            {players.filter((p) => p.teamId === tm.id).length} jugadores
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => {
                          if (isEditingLogo) {
                            setEditingLogoTeamId(null);
                          } else {
                            setEditingLogoTeamId(tm.id);
                            setEditLogoUrl(tm.crestUrl || '');
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <ImageIcon className="w-3.5 h-3.5 text-electric-500" />
                        {tm.crestUrl ? 'Cambiar logo' : 'Agregar logo'}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setFilterTeamId(tm.id);
                        setPlTeamId(tm.id);
                        setTab('players');
                      }}
                      className="px-3 py-1 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0 ml-auto"
                    >
                      Ver plantel
                    </button>
                  </div>

                  {canManage && isEditingLogo && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          maxLength={500}
                          value={editLogoUrl}
                          onChange={(e) => setEditLogoUrl(e.target.value)}
                          placeholder="https://.../logo.png"
                          className="flex-1 px-2.5 py-1.5 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                        />
                        <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-navy-900 dark:bg-slate-700 text-white text-xs font-medium cursor-pointer hover:bg-navy-800 whitespace-nowrap">
                          <Upload className="w-3.5 h-3.5" />
                          <span>Subir</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/svg+xml"
                            disabled={editLogoBusy}
                            onChange={(e) => handleExistingTeamLogoFile(tm, e)}
                            className="hidden"
                          />
                        </label>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingLogoTeamId(null)}
                          className="px-2.5 py-1 text-xs text-slate-600 dark:text-slate-300 hover:underline"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={editLogoBusy}
                          onClick={() => handleSaveExistingTeamLogoUrl(tm)}
                          className="px-3 py-1 rounded-lg bg-electric-500 hover:bg-electric-600 text-white text-xs font-medium disabled:opacity-50"
                        >
                          {editLogoBusy ? 'Guardando...' : 'Guardar logo'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'players' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {canManage && (
            <form
              onSubmit={handleCreatePlayer}
              className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 h-fit transition-colors"
            >
              <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                <UserPlus className="w-4 h-4 text-electric-500" />
                <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
                  Registrar Jugador
                </h2>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Equipo
                </label>
                <select
                  value={plTeamId || teams[0]?.id || ''}
                  onChange={(e) => setPlTeamId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  {teams.map((tm) => (
                    <option key={tm.id} value={tm.id}>
                      {tm.name} ({categoryMap.get(tm.categoryId)?.name})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nombre completo
                </label>
                <input
                  type="text"
                  required
                  value={plName}
                  onChange={(e) => setPlName(e.target.value)}
                  placeholder="Carlos Mendoza"
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Dorsal
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={plNumber}
                    onChange={(e) => setPlNumber(Number(e.target.value))}
                    className="w-full px-2.5 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Posición
                  </label>
                  <select
                    value={plPosition}
                    onChange={(e) => setPlPosition(e.target.value as PlayerPosition)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    <option value="Portero">Portero</option>
                    <option value="Defensa">Defensa</option>
                    <option value="Mediocampista">Mediocampista</option>
                    <option value="Delantero">Delantero</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Año de nacimiento
                </label>
                <input
                  type="number"
                  min={1950}
                  max={2022}
                  value={plBirthYear}
                  onChange={(e) => setPlBirthYear(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                />
              </div>
              <button
                type="submit"
                disabled={saving || teams.length === 0}
                className="w-full py-2.5 px-4 bg-navy-900 dark:bg-electric-500 hover:bg-navy-800 dark:hover:bg-electric-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                Agregar Jugador
              </button>
            </form>
          )}

          <div
            className={`${canManage ? 'lg:col-span-8' : 'lg:col-span-12'} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden transition-colors`}
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Shirt className="w-4 h-4 text-electric-500" />
                <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
                  Planteles Registrados
                </h2>
              </div>
              <select
                value={filterTeamId}
                onChange={(e) => setFilterTeamId(e.target.value)}
                className="px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
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
                  <tr className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <th className="py-2.5 px-4 text-left font-medium">#</th>
                    <th className="py-2.5 px-4 text-left font-medium">Jugador</th>
                    <th className="py-2.5 px-4 text-left font-medium">Posición</th>
                    <th className="py-2.5 px-4 text-left font-medium">Equipo</th>
                    <th className="py-2.5 px-4 text-right font-medium">Año</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredPlayers.map((pl) => (
                    <tr key={pl.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2.5 px-4 font-mono font-bold tabular-nums text-navy-900 dark:text-blue-400">
                        {pl.jerseyNumber}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">
                        {pl.fullName}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                        {pl.position}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">
                        {teamMap.get(pl.teamId)?.name || pl.teamId}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
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
