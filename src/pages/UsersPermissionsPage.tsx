import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BellRing,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  EyeOff,
  History,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSigdData } from '../context/SigdDataContext';
import { provisionAuthUserWithPassword } from '../firebase/config';
import {
  createProvisionedUserProfile,
  deleteUserInvite,
  registerOrInviteUser,
  sendNotification,
  updateUserInvite,
  updateUserRoleAndScope,
} from '../services/firestoreService';
import { ROLE_LABELS, ROLE_PERMISSIONS, type UserInvite, type UserRole } from '../types/sigd';

function generateSecurePassword(length = 12): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*?';
  const all = upper + lower + digits + symbols;

  const pick = (charset: string, rnd: number) => charset[rnd % charset.length];
  const bytes = new Uint32Array(length);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 0xffffffff);
    }
  }

  const chars = [
    pick(upper, bytes[0]),
    pick(lower, bytes[1]),
    pick(digits, bytes[2]),
    pick(symbols, bytes[3]),
  ];
  for (let i = 4; i < length; i++) {
    chars.push(pick(all, bytes[i]));
  }
  // Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = bytes[i] % (i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  return chars.join('');
}

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
  const [usePasswordAuth, setUsePasswordAuth] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(true);
  const [copiedKey, setCopiedKey] = useState<'draft' | 'created' | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{
    displayName: string;
    email: string;
    password: string;
    role: UserRole;
    verificationSent: boolean;
  } | null>(null);
  const [providerSetupNotice, setProviderSetupNotice] = useState(false);
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

  const handleGeneratePassword = () => {
    setNewPassword(generateSecurePassword(12));
    setShowNewPassword(true);
    setUsePasswordAuth(true);
  };

  const copyCredentialsText = async (
    text: string,
    target: 'draft' | 'created'
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(target);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Clipboard blocked in restricted browser contexts
    }
  };

  const handleRegisterUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !canManageUsers) return;

    const trimmedName = newName.trim();
    const trimmedEmail = newEmail.trim().toLowerCase();
    const trimmedPassword = newPassword.trim();
    setMsg(null);
    setErrMsg(null);
    setProviderSetupNotice(false);

    if (trimmedName.length < 2) {
      setErrMsg('Ingresa el nombre completo del usuario (mínimo 2 caracteres).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrMsg('Ingresa un correo electrónico válido.');
      return;
    }
    if (usePasswordAuth && trimmedPassword.length < 8) {
      setErrMsg(
        'La contraseña debe tener al menos 8 caracteres. Usa el botón "Generar contraseña" o desmarca la opción si solo accederá con Google.'
      );
      return;
    }

    setBusy(true);
    try {
      if (usePasswordAuth) {
        try {
          const authRes = await provisionAuthUserWithPassword({
            email: trimmedEmail,
            password: trimmedPassword,
            displayName: trimmedName,
          });

          await createProvisionedUserProfile({
            uid: authRes.uid,
            displayName: trimmedName,
            email: trimmedEmail,
            role: newRole,
            assignedCategoryIds: newRole === 'coordinador' ? newCategoryIds : [],
            assignedTeamId: newRole === 'representante' ? newTeamId : '',
            active: newActive,
            actorUid: profile.uid,
            actorName: profile.displayName,
          });

          setCreatedCredentials({
            displayName: trimmedName,
            email: trimmedEmail,
            password: trimmedPassword,
            role: newRole,
            verificationSent: authRes.verificationSent,
          });
          setNewName('');
          setNewEmail('');
          setNewPassword('');
          setNewRole('coordinador');
          setNewActive(true);
          setNewCategoryIds([]);
          setNewTeamId('');
          setMsg(
            `Usuario ${trimmedName} (${trimmedEmail}) dado de alta con contraseña generada y rol ${ROLE_LABELS[newRole]}.`
          );
          return;
        } catch (authErr) {
          const code = (authErr as { code?: string })?.code || '';
          if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
            setProviderSetupNotice(true);
            await registerOrInviteUser({
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
            setErrMsg(
              'El método "Correo electrónico y contraseña" no está habilitado aún en Firebase Console. Se guardó el pre-registro de rol en Firestore; habilita el proveedor siguiendo las instrucciones abajo.'
            );
            return;
          }
          if (code === 'auth/email-already-in-use') {
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
            setMsg(
              res.mode === 'updated_existing'
                ? `El correo ${trimmedEmail} ya tenía cuenta de acceso; se actualizó su perfil con el rol ${ROLE_LABELS[newRole]}.`
                : `El correo ${trimmedEmail} ya existe en Authentication; se actualizó su pre-registro con el rol ${ROLE_LABELS[newRole]}.`
            );
            return;
          }
          if (code === 'auth/weak-password') {
            setErrMsg('La contraseña es demasiado débil. Usa el generador de contraseña segura.');
            return;
          }
          throw authErr;
        }
      }

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
      setNewPassword('');
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
                Registra un nuevo usuario, asigna su rol operativo y genera una contraseña de acceso directa (o déjalo pre-registrado para acceso con Google).
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
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    required
                    maxLength={160}
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="usuario@dominio.com"
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

              {/* Password Generation Section */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-electric-500 shrink-0" />
                    <span className="text-xs font-semibold text-slate-900 dark:text-white">
                      Generación de Contraseña de Acceso
                    </span>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={usePasswordAuth}
                      onChange={(e) => setUsePasswordAuth(e.target.checked)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    Crear acceso directo con correo y contraseña
                  </label>
                </div>

                {usePasswordAuth ? (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                    <div className="relative flex-1">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        minLength={8}
                        maxLength={64}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Mínimo 8 caracteres o presiona Generar contraseña"
                        className="w-full pl-3 pr-9 py-2 text-sm font-mono border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((v) => !v)}
                        aria-label={showNewPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        {showNewPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleGeneratePassword}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-navy-900 dark:bg-electric-500 hover:bg-navy-800 dark:hover:bg-electric-600 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Generar contraseña
                    </button>

                    {newPassword && (
                      <button
                        type="button"
                        onClick={() =>
                          copyCredentialsText(
                            `Correo: ${newEmail || '(pendiente)'}\nContraseña: ${newPassword}`,
                            'draft'
                          )
                        }
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
                      >
                        {copiedKey === 'draft' ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            Copiado
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Copiar
                          </>
                        )}
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Modo Google: el usuario quedará pre-registrado y activará sus permisos al iniciar sesión con su cuenta de Google.
                  </p>
                )}
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

          {/* Ephemeral One-Time Generated Credentials Summary */}
          {canManageUsers && createdCredentials && (
            <div className="bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  <h3 className="font-display font-semibold text-sm text-emerald-900 dark:text-emerald-200">
                    Credenciales de Acceso Generadas (entrega única)
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      copyCredentialsText(
                        `Acceso SIGD\nUsuario: ${createdCredentials.displayName}\nRol: ${ROLE_LABELS[createdCredentials.role]}\nCorreo: ${createdCredentials.email}\nContraseña: ${createdCredentials.password}`,
                        'created'
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors"
                  >
                    {copiedKey === 'created' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Credenciales copiadas
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copiar credenciales
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreatedCredentials(null)}
                    className="px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 text-xs font-medium text-emerald-900 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                  >
                    Ocultar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-emerald-700 dark:text-emerald-400 block">Usuario / Rol</span>
                  <span className="font-semibold text-emerald-950 dark:text-white">
                    {createdCredentials.displayName} · {ROLE_LABELS[createdCredentials.role]}
                  </span>
                </div>
                <div>
                  <span className="text-emerald-700 dark:text-emerald-400 block">Correo</span>
                  <span className="font-mono font-semibold text-emerald-950 dark:text-white">
                    {createdCredentials.email}
                  </span>
                </div>
                <div>
                  <span className="text-emerald-700 dark:text-emerald-400 block">
                    Contraseña asignada
                  </span>
                  <span className="font-mono font-bold text-emerald-950 dark:text-white">
                    {createdCredentials.password}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                Por seguridad, esta contraseña no se almacena en texto plano en la base de datos.
                {createdCredentials.verificationSent
                  ? ' Se envió un correo de verificación al usuario para activar sus permisos de escritura al ingresar.'
                  : ' Recuérdale verificar su correo electrónico al iniciar sesión.'}
              </p>
            </div>
          )}

          {/* Setup Guide if Email/Password provider is disabled in Firebase Console */}
          {canManageUsers && providerSetupNotice && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-5 space-y-2 text-xs text-amber-900 dark:text-amber-200">
              <p className="font-semibold">
                Cómo habilitar Correo electrónico/Contraseña en Firebase Console:
              </p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Abre Firebase Console en el proyecto <span className="font-mono font-semibold">refreshing-ceiling-nxq1s</span>.</li>
                <li>Ve a <strong>Authentication → Sign-in method</strong> (Método de acceso).</li>
                <li>Haz clic en <strong>Agregar proveedor nuevo</strong>, selecciona <strong>Correo electrónico/contraseña</strong>, actívalo y guarda los cambios.</li>
              </ol>
            </div>
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
