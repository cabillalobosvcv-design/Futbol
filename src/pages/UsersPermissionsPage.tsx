import React, { useState } from 'react';
import { BellRing, CheckCircle2, History, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSigdData } from '../context/SigdDataContext';
import { sendNotification, updateUserRoleAndScope } from '../services/firestoreService';
import { ROLE_LABELS, ROLE_PERMISSIONS, type UserRole } from '../types/sigd';

export function UsersPermissionsPage() {
  const { profile, role } = useAuth();
  const { users, auditLogs, categories, teams } = useSigdData();

  const [tab, setTab] = useState<'users' | 'notifications' | 'audit'>('users');
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifType, setNotifType] = useState<'info' | 'success' | 'warning' | 'alert'>('info');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canManageUsers = ROLE_PERMISSIONS.canManageUsers(role);

  const handleRoleChange = async (
    targetUser: (typeof users)[number],
    newRole: UserRole
  ) => {
    if (!profile || !canManageUsers) return;
    setBusy(true);
    try {
      await updateUserRoleAndScope({
        targetUser,
        role: newRole,
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

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !notifTitle.trim() || !notifMessage.trim()) return;
    setBusy(true);
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
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h1 className="text-xl font-display font-bold text-navy-900">
          Usuarios, Control de Permisos, Notificaciones y Auditoría
        </h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Administra perfiles RBAC, difunde avisos en tiempo real y revisa la bitácora inmutable de cambios.
        </p>
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
          onClick={() => setTab('users')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
            tab === 'users' ? 'bg-navy-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          Usuarios y Permisos ({users.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('notifications')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
            tab === 'notifications' ? 'bg-navy-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <BellRing className="w-4 h-4" />
          Difundir Aviso
        </button>
        <button
          type="button"
          onClick={() => setTab('audit')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
            tab === 'audit' ? 'bg-navy-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <History className="w-4 h-4" />
          Auditoría ({auditLogs.length})
        </button>
      </div>

      {tab === 'users' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-electric-500" />
              <h2 className="font-display font-semibold text-base text-slate-900">
                Usuarios Registrados
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                    <th className="py-3 px-4 text-left font-semibold">Usuario</th>
                    <th className="py-3 px-4 text-left font-semibold">Correo</th>
                    <th className="py-3 px-4 text-left font-semibold">Rol Asignado</th>
                    <th className="py-3 px-4 text-left font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-medium text-slate-900">{u.displayName}</td>
                      <td className="py-3 px-4 text-slate-600 font-mono text-xs">{u.email}</td>
                      <td className="py-3 px-4">
                        {canManageUsers ? (
                          <select
                            disabled={busy}
                            value={u.role}
                            onChange={(e) => handleRoleChange(u, e.target.value as UserRole)}
                            className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50"
                          >
                            {(Object.keys(ROLE_LABELS) as UserRole[]).map((rKey) => (
                              <option key={rKey} value={rKey}>
                                {ROLE_LABELS[rKey]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs font-medium">{ROLE_LABELS[u.role]}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs font-medium text-emerald-700">
                        {u.active ? 'Activo' : 'Suspendido'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="font-display font-semibold text-sm text-slate-900 mb-3">
              Matriz de Seguridad y Permisos RBAC (Frontend + Reglas Firestore)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                <p className="font-semibold text-navy-900">Administrador General</p>
                <p className="text-slate-600 mt-1">
                  Acceso total: torneos, usuarios, disciplinas, reglamentos, reportes y auditoría.
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                <p className="font-semibold text-navy-900">Administrador Deportivo</p>
                <p className="text-slate-600 mt-1">
                  Torneos, temporadas, categorías, equipos, jugadores, roles y validación de resultados.
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                <p className="font-semibold text-navy-900">Coordinador</p>
                <p className="text-slate-600 mt-1">
                  Categorías ({categories.length}), generación de roles, supervisión y aprobación oficial de actas.
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                <p className="font-semibold text-navy-900">Árbitro</p>
                <p className="text-slate-600 mt-1">
                  Consulta de encuentros, captura de actas digitales e incidencias enviadas a validación.
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                <p className="font-semibold text-navy-900">Representante de Equipo</p>
                <p className="text-slate-600 mt-1">
                  Consulta de su club ({teams.length} equipos), jugadores, roles y resultados oficiales.
                </p>
              </div>
              <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                <p className="font-semibold text-navy-900">Público / Visitante</p>
                <p className="text-slate-600 mt-1">
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
          className="bg-white border border-slate-200 rounded-xl p-6 max-w-xl space-y-4"
        >
          <h2 className="font-display font-semibold text-base text-slate-900">
            Enviar Notificación en Tiempo Real a Usuarios Registrados
          </h2>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Título</label>
            <input
              type="text"
              required
              value={notifTitle}
              onChange={(e) => setNotifTitle(e.target.value)}
              placeholder="Ej. Cambio de horario en Jornada 3"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Tipo de aviso</label>
            <select
              value={notifType}
              onChange={(e) =>
                setNotifType(e.target.value as 'info' | 'success' | 'warning' | 'alert')
              }
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50"
            >
              <option value="info">Informativo</option>
              <option value="success">Confirmación / Publicación</option>
              <option value="warning">Advertencia / Reprogramación</option>
              <option value="alert">Alerta / Suspensión</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Mensaje</label>
            <textarea
              rows={3}
              required
              value={notifMessage}
              onChange={(e) => setNotifMessage(e.target.value)}
              placeholder="Detalle de la notificación..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
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
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="font-display font-semibold text-base text-slate-900">
              Registro Inmutable de Auditoría
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                  <th className="py-3 px-4 text-left font-semibold">Fecha</th>
                  <th className="py-3 px-4 text-left font-semibold">Usuario</th>
                  <th className="py-3 px-4 text-left font-semibold">Acción</th>
                  <th className="py-3 px-4 text-left font-semibold">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-500 whitespace-nowrap tabular-nums">
                      {log.createdAt?.toDate
                        ? log.createdAt.toDate().toLocaleString('es-MX')
                        : 'Reciente'}
                    </td>
                    <td className="py-2.5 px-4 text-xs font-medium text-slate-800">
                      {log.actorName || log.actorUid}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs text-electric-600">
                      {log.action}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-700">{log.summary}</td>
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
