import React, { useState } from 'react';
import {
  BarChart3,
  Bell,
  CalendarDays,
  CheckCheck,
  ClipboardCheck,
  FileSpreadsheet,
  Globe,
  LayoutDashboard,
  LogIn,
  LogOut,
  MapPin,
  Menu,
  ShieldCheck,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSigdData } from '../context/SigdDataContext';
import { markNotificationRead } from '../services/firestoreService';
import { ROLE_LABELS, ROLE_PERMISSIONS } from '../types/sigd';

export type PageId =
  | 'public_portal'
  | 'dashboard'
  | 'tournaments'
  | 'teams'
  | 'facilities'
  | 'schedule'
  | 'results'
  | 'stats'
  | 'reports'
  | 'users';

interface NavItem {
  id: PageId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  visible: boolean;
}

interface LayoutProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  children: React.ReactNode;
}

export function Layout({ activePage, onNavigate, children }: LayoutProps) {
  const { firebaseUser, profile, role, signingIn, signInWithGoogle, signOut } = useAuth();
  const { notifications } = useSigdData();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const unreadCount = firebaseUser
    ? notifications.filter((n) => !n.readBy?.includes(firebaseUser.uid)).length
    : 0;

  const allNavItems: NavItem[] = [
    {
      id: 'public_portal',
      label: 'Portal Público',
      icon: Globe,
      visible: true,
    },
    {
      id: 'dashboard',
      label: 'Panel Principal',
      icon: LayoutDashboard,
      visible: Boolean(firebaseUser),
    },
    {
      id: 'tournaments',
      label: 'Torneos y Deportes',
      icon: Trophy,
      visible: Boolean(firebaseUser),
    },
    {
      id: 'teams',
      label: 'Equipos y Jugadores',
      icon: Users,
      visible: Boolean(firebaseUser),
    },
    {
      id: 'facilities',
      label: 'Canchas y Árbitros',
      icon: MapPin,
      visible: Boolean(firebaseUser),
    },
    {
      id: 'schedule',
      label: 'Generador de Roles',
      icon: CalendarDays,
      visible: Boolean(firebaseUser) && ROLE_PERMISSIONS.canGenerateSchedule(role),
    },
    {
      id: 'results',
      label: 'Actas y Resultados',
      icon: ClipboardCheck,
      visible: Boolean(firebaseUser) && (ROLE_PERMISSIONS.canSubmitMatchSheet(role) || role === 'representante'),
    },
    {
      id: 'stats',
      label: 'Estadísticas y Tablas',
      icon: BarChart3,
      visible: Boolean(firebaseUser),
    },
    {
      id: 'reports',
      label: 'Reportes PDF / Excel',
      icon: FileSpreadsheet,
      visible: Boolean(firebaseUser) && ROLE_PERMISSIONS.canExportReports(role),
    },
    {
      id: 'users',
      label: 'Usuarios y Auditoría',
      icon: ShieldCheck,
      visible: Boolean(firebaseUser) && (ROLE_PERMISSIONS.canManageUsers(role) || ROLE_PERMISSIONS.canViewAuditLogs(role)),
    },
  ];
  const navItems: NavItem[] = allNavItems.filter((item) => item.visible);

  const activeNav = navItems.find((i) => i.id === activePage) || navItems[0];

  const handleMarkRead = async (notifId: string) => {
    if (!firebaseUser) return;
    await markNotificationRead(notifId, firebaseUser.uid);
  };

  return (
    <div className="min-h-screen flex bg-pitch-canvas text-slate-900">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`no-print fixed lg:sticky top-0 left-0 z-40 h-screen w-[264px] shrink-0 bg-navy-900 text-slate-100 flex flex-col border-r border-navy-800 transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="px-5 py-5 flex items-center justify-between border-b border-navy-800">
          <div className="flex items-center gap-3">
            <img
              src="/src/assets/images/sigd_crest_emblem_1794523620307.jpg"
              alt="Emblema SIGD"
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-lg object-cover border border-white/15 shrink-0 bg-navy-800"
            />
            <div className="min-w-0">
              <span className="font-display font-extrabold text-lg tracking-tight text-white block leading-none">
                SIGD
              </span>
              <span className="text-[11px] text-slate-400 block mt-1 truncate">
                Gestión Deportiva
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-md"
            aria-label="Cerrar menú"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activePage;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onNavigate(item.id);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-electric-500 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-navy-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-navy-800">
          {firebaseUser && profile ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                {profile.photoUrl ? (
                  <img
                    src={profile.photoUrl}
                    alt={profile.displayName}
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded-lg object-cover border border-white/15 shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-electric-500/20 text-blue-300 flex items-center justify-center font-bold text-xs shrink-0">
                    {profile.displayName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">
                    {profile.displayName}
                  </p>
                  <p className="text-xs text-emerald-400 truncate">
                    {ROLE_LABELS[role]}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => signOut()}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-navy-800 hover:bg-navy-700 rounded-lg transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Cerrar sesión
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-400 leading-relaxed">
                Estás navegando el Portal Público. Inicia sesión para administrar torneos o actas.
              </p>
              <button
                type="button"
                disabled={signingIn}
                onClick={() => signInWithGoogle()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-electric-500 hover:bg-electric-600 rounded-lg transition-colors disabled:opacity-60"
              >
                <LogIn className="w-4 h-4" />
                {signingIn ? 'Conectando...' : 'Acceso Administrativo'}
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="no-print sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
              aria-label="Abrir menú"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="font-display font-bold text-navy-900 whitespace-nowrap shrink-0">
                SIGD
              </span>
              <span className="text-slate-300" aria-hidden="true">/</span>
              <span className="font-medium text-slate-700 truncate">
                {activeNav?.label || 'Portal Público'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {firebaseUser && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotifOpen((prev) => !prev)}
                  className="relative inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 transition-colors whitespace-nowrap"
                  aria-label="Notificaciones en tiempo real"
                >
                  <Bell className="w-4 h-4 text-navy-800" />
                  <span className="hidden sm:inline">Notificaciones</span>
                  {unreadCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-md bg-red-600 text-white text-[11px] font-mono font-semibold tabular-nums">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                      <span className="font-display font-semibold text-sm text-slate-900">
                        Centro de Notificaciones
                      </span>
                      <button
                        type="button"
                        onClick={() => setNotifOpen(false)}
                        className="text-slate-400 hover:text-slate-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-sm text-slate-500">
                          No hay notificaciones registradas todavía.
                        </div>
                      ) : (
                        notifications.slice(0, 20).map((n) => {
                          const isRead = firebaseUser && n.readBy?.includes(firebaseUser.uid);
                          const accentColor =
                            n.type === 'success'
                              ? 'text-emerald-700'
                              : n.type === 'alert'
                                ? 'text-red-700'
                                : n.type === 'warning'
                                  ? 'text-amber-700'
                                  : 'text-electric-600';
                          return (
                            <div
                              key={n.id}
                              className={`p-3.5 text-sm ${isRead ? 'bg-white' : 'bg-blue-50/40'}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className={`font-semibold ${accentColor}`}>{n.title}</p>
                                {!isRead && (
                                  <button
                                    type="button"
                                    onClick={() => handleMarkRead(n.id)}
                                    className="text-xs text-electric-600 hover:underline inline-flex items-center gap-1 shrink-0"
                                    title="Marcar como leída"
                                  >
                                    <CheckCheck className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                              <p className="text-xs text-slate-600 mt-1">{n.message}</p>
                              <p className="text-[11px] text-slate-400 mt-1.5 font-mono tabular-nums">
                                {n.createdAt?.toDate
                                  ? n.createdAt.toDate().toLocaleString('es-MX')
                                  : 'Reciente'}
                              </p>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!firebaseUser && (
              <button
                type="button"
                disabled={signingIn}
                onClick={() => signInWithGoogle()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy-900 hover:bg-navy-800 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0"
              >
                <LogIn className="w-4 h-4" />
                Iniciar sesión
              </button>
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
