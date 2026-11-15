import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  Clock,
  History,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSigdData } from '../context/SigdDataContext';
import {
  deleteUserInvite,
  registerOrInviteUser,
  sendNotification,
  updateUserInvite,
  updateUserRoleAndScope,
} from '../services/firestoreService';
import { ROLE_LABELS, ROLE_PERMISSIONS, type UserInvite, type UserRole } from '../types/sigd';

export function UsersPermissionsPage() {
  const { profile, role } = useAuth();
  const { users, userInvites, auditLogs, categories, teams } = useSigdData();

  const [tab, setTab] = useState<'users' | 'notifications' | 'audit'>('users');
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifType, setNotifType] = useState<'info' | 'success' | 'warning' | 'alert'>('info');
  const [msg, setMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Admin-only user registration form state
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('coordinador');
  const [newActive, setNewActive] = useState(true);
  const [newCategoryIds, setNewCategoryIds] = useState<string[]>([]);
  const [newTeamId, setNewTeamId] = useState('');
  const [confirmDeleteInviteId, setConfirmDeleteInviteId] = useState<string | null>(null);

  const canManageUsers = ROLE_PERMISSIONS.canManageUsers(role);

  const pendingInvites = useMemo(() => {
    if (!canManageUsers) return [];
    const activeEmails = new Set(users.map((u) => u.email.trim().toLowerCase()));
    return userInvites.filter(
      (inv) => !inv.claimedUid && !activeEmails.has(inv.email.trim().toLowerCase())
    );
  }, [canManageUsers, userInvites, users]);

  const toggleCategorySelection = (categoryId: string) => {
    setNewCategoryIds((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : prev.length < 20
          ? [...prev, categoryId]
          : prev
    );
  };

  const handleRegisterUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !canManageUsers) return;

    const trimmedName = newName.trim();
    const trimmedEmail = newEmail.trim().toLowerCase();
    setMsg(null);
    setErrMsg(null);

    if (trimmedName.length < 2) {
      setErrMsg('Ingresa el nombre completo del usuario (mínimo 2 caracteres).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrMsg('Ingresa un correo electrónico de Google válido.');
      return;
    }

    setBusy(true);
    try {
      const res = await registerOrInviteUser({
        displayName: trimmedName,
        email: trimmedEmail,
        role: newRole,
        assignedCategoryIds: newRole === 'coordinador' ? newCategoryIds : [],
        assignedTeamId: newRole === 'representante' ? newTeamId : '',
        active: newActive,
        existingUsers: users,
        existingInvites: userInvites,
        actorUid: profile.uid,
        actorName: profile.displayName,
      });

      setNewName('');
      setNewEmail('');
      setNewRole('coordinador');
      setNewActive(true);
      setNewCategoryIds([]);
      setNewTeamId('');

      if (res.mode === 'updated_existing') {
        setMsg(
          `El usuario ${trimmedEmail} ya estaba registrado y su perfil fue actualizado con el rol ${ROLE_LABELS[newRole]}.`
        );
      } else {
        setMsg(
          `Usuario ${trimmedName} (${trimmedEmail}) dado de alta con rol ${ROLE_LABELS[newRole]}. Al iniciar sesión con Google recibirá sus permisos automáticamente.`
        );
      }
    } catch {
      setErrMsg('No se pudo completar el alta del usuario. Verifica los permisos e intenta nuevamente.');
    } finally {
      setBusy(false);
    }
  };

  const handleRoleChange = async (
    targetUser: (typeof users)[number],
    updatedRole: UserRole
  ) => {
    if (!profile || !canManageUsers) return;
    setBusy(true);
    setMsg(null);
    setErrMsg(null);
    try {
      await updateUserRoleAndScope({
        targetUser,
        role: updatedRole,
        assignedCategoryIds: targetUser.assignedCategoryIds || [],
        assignedTeamId: targetUser.assignedTeamId,
        active: targetUser.active,
        actorUid: profile.uid,
        actorName: profile.displayName,
      });
      setMsg(`Rol actualizado para ${targetUser.displayName}.`);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleUserActive = async (targetUser: (typeof users)[number]) => {
    if (!profile || !canManageUsers || targetUser.uid === profile.uid) return;
    setBusy(true);
    setMsg(null);
    setErrMsg(null);
    try {
      await updateUserRoleAndScope({
        targetUser,
        role: targetUser.role,
        assignedCategoryIds: targetUser.assignedCategoryIds || [],
        assignedTeamId: targetUser.assignedTeamId,
        active: !targetUser.active,
        actorUid: profile.uid,
        actorName: profile.displayName,
      });
      setMsg(
        `Usuario ${targetUser.displayName} ${!targetUser.active ? 'activado' : 'suspendido'}.`
      );
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateInvite = async (
    invite: UserInvite,
    updatedRole: UserRole,
    updatedActive: boolean
  ) => {
    if (!profile || !canManageUsers) return;
    setBusy(true);
    setMsg(null);
    setErrMsg(null);
    try {
      await updateUserInvite({
        invite,
        role: updatedRole,
        active: updatedActive,
        actorUid: profile.uid,
        actorName: profile.displayName,
      });
      setMsg(`Pre-registro actualizado para ${invite.displayName}.`);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteInvite = async (invite: UserInvite) => {
    if (!profile || !canManageUsers) return;
    setBusy(true);
    setMsg(null);
    setErrMsg(null);
    try {
      await deleteUserInvite({
        invite,
        actorUid: profile.uid,
        actorName: profile.displayName,
      });
      setConfirmDeleteInviteId(null);
      setMsg(`Pre-registro eliminado para ${invite.email}.`);
    } finally {
      setBusy(false);
    }
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !notifTitle.trim() || !notifMessage.trim()) return;
    setBusy(true);
    setMsg(null);
    setErrMsg(null);
    try {
      await sendNotification({
        isBroadcast: true,
        title: notifTitle.trim(),
        message: notifMessage.trim(),
        type: notifType,
        createdByUid: profile.uid,
      });
      setNotifTitle('');
      setNotifMessage('');
      setMsg('Notificación en tiempo real enviada a todos los usuarios registrados.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 transition-colors">
        <h1 className="text-xl font-display font-bold text-navy-900 dark:text-white">
          Usuarios, Control de Permisos, Notificaciones y Auditoría
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
          Administra perfiles RBAC, difunde avisos en tiempo real y revisa la bitácora inmutable de cambios.
        </p>
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
          onClick={() => setTab('users')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'users'
              ? 'bg-navy-900 dark:bg-electric-500 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          Usuarios y Permisos ({users.length + pendingInvites.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('notifications')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'notifications'
              ? 'bg-navy-900 dark:bg-electric-500 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <BellRing className="w-4 h-4" />
          Difundir Aviso
        </button>
        <button
          type="button"
          onClick={() => setTab('audit')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'audit'
              ? 'bg-navy-900 dark:bg-electric-500 text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          Auditoría ({auditLogs.length})
        </button>
      </div>

      {tab === 'users' && (
        <div className="space-y-6">
          {canManageUsers && (
            <form
              onSubmit={handleRegisterUser}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 transition-colors"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-electric-500" />
                  <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
                    Alta de Usuarios
                  </h2>
                </div>
                <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-navy-900/10 dark:bg-electric-500/20 text-navy-900 dark:text-blue-300">
                  Exclusivo Administrador General
                </span>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400">
                Registra un nuevo usuario con su correo de Google y asigna su rol operativo. Al iniciar sesión con esa cuenta, sus permisos se activarán automáticamente.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nombre completo
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Ej. Laura Hernández"
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Correo de Google
                  </label>
                  <input
                    type="email"
                    required
                    maxLength={160}
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="usuario@gmail.com"
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Rol asignado
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    {(Object.keys(ROLE_LABELS) as UserRole[]).map((rKey) => (
                      <option key={rKey} value={rKey}>
                        {ROLE_LABELS[rKey]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Estado inicial
                  </label>
                  <select
                    value={newActive ? 'active' : 'suspended'}
                    onChange={(e) => setNewActive(e.target.value === 'active')}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    <option value="active">Activo</option>
                    <option value="suspended">Suspendido</option>
                  </select>
                </div>
              </div>

              {newRole === 'coordinador' && categories.length > 0 && (
                <div className="pt-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Categorías asignadas (opcional)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((cat) => {
                      const selected = newCategoryIds.includes(cat.id);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => toggleCategorySelection(cat.id)}
                          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                            selected
                              ? 'bg-navy-900 dark:bg-electric-500 text-white border-navy-900 dark:border-electric-500'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                          }`}
                        >
                          {cat.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {newRole === 'representante' && (
                <div className="pt-2 max-w-sm">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Equipo asignado (opcional)
                  </label>
                  <select
                    value={newTeamId}
                    onChange={(e) => setNewTeamId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  >
                    <option value="">Sin equipo específico</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-electric-500 hover:bg-electric-600 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  {busy ? 'Guardando...' : 'Dar de alta usuario'}
                </button>
              </div>
            </form>
          )}

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden transition-colors">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-electric-500" />
              <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
                Usuarios Registrados
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                    <th className="py-3 px-4 text-left font-semibold">Usuario</th>
                    <th className="py-3 px-4 text-left font-semibold">Correo</th>
                    <th className="py-3 px-4 text-left font-semibold">Rol Asignado</th>
                    <th className="py-3 px-4 text-left font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                        {u.displayName}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300 font-mono text-xs">
                        {u.email}
                      </td>
                      <td className="py-3 px-4">
                        {canManageUsers ? (
                          <select
                            disabled={busy}
                            value={u.role}
                            onChange={(e) => handleRoleChange(u, e.target.value as UserRole)}
                            className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                          >
                            {(Object.keys(ROLE_LABELS) as UserRole[]).map((rKey) => (
                              <option key={rKey} value={rKey}>
                                {ROLE_LABELS[rKey]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            {ROLE_LABELS[u.role]}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {canManageUsers && profile?.uid !== u.uid ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleToggleUserActive(u)}
                            className={`px-2.5 py-1 rounded-md font-medium border transition-colors ${
                              u.active
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/50'
                            }`}
                          >
                            {u.active ? 'Activo' : 'Suspendido'}
                          </button>
                        ) : (
                          <span
                            className={`font-medium ${
                              u.active
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-rose-700 dark:text-rose-400'
                            }`}
                          >
                            {u.active ? 'Activo' : 'Suspendido'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {canManageUsers && pendingInvites.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden transition-colors">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
                    Usuarios Dados de Alta (Pendientes de Primer Ingreso)
                  </h2>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {pendingInvites.length} pendiente(s)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                      <th className="py-3 px-4 text-left font-semibold">Nombre</th>
                      <th className="py-3 px-4 text-left font-semibold">Correo</th>
                      <th className="py-3 px-4 text-left font-semibold">Rol Asignado</th>
                      <th className="py-3 px-4 text-left font-semibold">Estado</th>
                      <th className="py-3 px-4 text-right font-semibold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {pendingInvites.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                          {inv.displayName}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300 font-mono text-xs">
                          {inv.email}
                        </td>
                        <td className="py-3 px-4">
                          <select
                            disabled={busy}
                            value={inv.role}
                            onChange={(e) =>
                              handleUpdateInvite(inv, e.target.value as UserRole, inv.active)
                            }
                            className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                          >
                            {(Object.keys(ROLE_LABELS) as UserRole[]).map((rKey) => (
                              <option key={rKey} value={rKey}>
                                {ROLE_LABELS[rKey]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleUpdateInvite(inv, inv.role, !inv.active)}
                            className={`px-2.5 py-1 rounded-md font-medium border transition-colors ${
                              inv.active
                                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800'
                            }`}
                          >
                            {inv.active ? 'Pendiente (Activo)' : 'Suspendido'}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {confirmDeleteInviteId === inv.id ? (
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleDeleteInvite(inv)}
                                className="px-2.5 py-1 text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white rounded-md"
                              >
                                Confirmar
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setConfirmDeleteInviteId(null)}
                                className="px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setConfirmDeleteInviteId(inv.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-md transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Revocar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 transition-colors">
            <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-white mb-3">
              Matriz de Seguridad y Permisos RBAC (Frontend + Reglas Firestore)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                <p className="font-semibold text-navy-900 dark:text-white">Administrador General</p>
                <p className="text-slate-600 dark:text-slate-300 mt-1">
                  Acceso total: torneos, alta y gestión de usuarios, disciplinas, reglamentos, reportes y auditoría.
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                <p className="font-semibold text-navy-900 dark:text-white">
                  Administrador Deportivo
                </p>
                <p className="text-slate-600 dark:text-slate-300 mt-1">
                  Torneos, temporadas, categorías, equipos, jugadores, roles y validación de resultados.
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                <p className="font-semibold text-navy-900 dark:text-white">Coordinador</p>
                <p className="text-slate-600 dark:text-slate-300 mt-1">
                  Categorías ({categories.length}), generación de roles, supervisión y aprobación oficial de actas.
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                <p className="font-semibold text-navy-900 dark:text-white">Árbitro</p>
                <p className="text-slate-600 dark:text-slate-300 mt-1">
                  Consulta de encuentros, captura de actas digitales e incidencias enviadas a validación.
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                <p className="font-semibold text-navy-900 dark:text-white">
                  Representante de Equipo
                </p>
                <p className="text-slate-600 dark:text-slate-300 mt-1">
                  Consulta de su club ({teams.length} equipos), jugadores, roles y resultados oficiales.
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                <p className="font-semibold text-navy-900 dark:text-white">Público / Visitante</p>
                <p className="text-slate-600 dark:text-slate-300 mt-1">
                  Solo lectura en Portal Público: calendarios, resultados, posiciones y estadísticas.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'notifications' && (
        <form
          onSubmit={handleSendBroadcast}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 max-w-xl space-y-4 transition-colors"
        >
          <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
            Enviar Notificación en Tiempo Real a Usuarios Registrados
          </h2>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Título
            </label>
            <input
              type="text"
              required
              value={notifTitle}
              onChange={(e) => setNotifTitle(e.target.value)}
              placeholder="Ej. Cambio de horario en Jornada 3"
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Tipo de aviso
            </label>
            <select
              value={notifType}
              onChange={(e) =>
                setNotifType(e.target.value as 'info' | 'success' | 'warning' | 'alert')
              }
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="info">Informativo</option>
              <option value="success">Confirmación / Publicación</option>
              <option value="warning">Advertencia / Reprogramación</option>
              <option value="alert">Alerta / Suspensión</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Mensaje
            </label>
            <textarea
              rows={3}
              required
              value={notifMessage}
              onChange={(e) => setNotifMessage(e.target.value)}
              placeholder="Detalle de la notificación..."
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2.5 bg-electric-500 hover:bg-electric-600 text-white text-sm font-medium rounded-lg"
          >
            Enviar Notificación Broadcast
          </button>
        </form>
      )}

      {tab === 'audit' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden transition-colors">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
              Registro Inmutable de Auditoría
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-3 px-4 text-left font-semibold">Fecha</th>
                  <th className="py-3 px-4 text-left font-semibold">Usuario</th>
                  <th className="py-3 px-4 text-left font-semibold">Acción</th>
                  <th className="py-3 px-4 text-left font-semibold">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                      {log.createdAt?.toDate
                        ? log.createdAt.toDate().toLocaleString('es-MX')
                        : 'Reciente'}
                    </td>
                    <td className="py-2.5 px-4 text-xs font-medium text-slate-800 dark:text-slate-200">
                      {log.actorName || log.actorUid}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-electric-600 dark:text-blue-400">
                      {log.action}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-700 dark:text-slate-300">
                      {log.summary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
