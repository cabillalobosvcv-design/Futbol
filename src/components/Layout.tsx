import React, { useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  CheckCheck,
  ClipboardCheck,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Flag,
  Globe,
  History,
  KeyRound,
  LayoutDashboard,
  LogIn,
  LogOut,
  MailCheck,
  MapPin,
  Menu,
  Moon,
  Scale,
  ShieldCheck,
  Sun,
  Trophy,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { useTheme } from '../context/ThemeContext';
import { ROLE_LABELS, ROLE_PERMISSIONS } from '../types/sigd';
import { NAV_ICON_COLOR_CLASSES, NotificationTypeIcon } from './SemanticIcons';

export type PageId =
  | 'public_portal'
  | 'dashboard'
  | 'tournaments'
  | 'rules'
  | 'teams'
  | 'facilities'
  | 'schedule'
  | 'referee_assignments'
  | 'referee_capture'
  | 'results'
  | 'stats'
  | 'reports'
  | 'organization'
  | 'activity_history'
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
  const {
    firebaseUser,
    profile,
    role,
    signingIn,
    authError,
    clearAuthError,
    signInWithGoogle,
    signInWithEmail,
    resendVerificationEmail,
    signOut,
  } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const { theme, setTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [verificationSentMsg, setVerificationSentMsg] = useState<string | null>(null);

  const openLoginModal = () => {
    clearAuthError();
    setLoginModalOpen(true);
  };

  const handleEmailLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword) return;
    const ok = await signInWithEmail(loginEmail, loginPassword);
    if (ok) {
      setLoginModalOpen(false);
      setLoginPassword('');
    }
  };

  const handleGoogleLogin = async () => {
    const ok = await signInWithGoogle();
    if (ok) setLoginModalOpen(false);
  };

  const handleResendVerification = async () => {
    const ok = await resendVerificationEmail();
    setVerificationSentMsg(
      ok
        ? 'Se envió un nuevo enlace de verificación a tu correo. Revisa tu bandeja y vuelve a iniciar sesión.'
        : 'No se pudo reenviar el correo ahora. Intenta nuevamente en unos minutos.'
    );
  };

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
      id: 'rules',
      label: 'Reglamentos',
      icon: Scale,
      visible:
        Boolean(firebaseUser) &&
        (ROLE_PERMISSIONS.canManageSportsAndRules(role) ||
          ROLE_PERMISSIONS.canManageTournaments(role)),
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
      id: 'referee_assignments',
      label: 'Asignación Arbitral',
      icon: UserCheck,
      visible: Boolean(firebaseUser) && ROLE_PERMISSIONS.canManageFacilitiesAndReferees(role),
    },
    {
      id: 'referee_capture',
      label: 'Captura Arbitral',
      icon: Flag,
      visible: Boolean(firebaseUser) && ROLE_PERMISSIONS.canSubmitMatchSheet(role),
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
      id: 'organization',
      label: 'Organización',
      icon: Building2,
      visible: Boolean(firebaseUser) && ROLE_PERMISSIONS.canManageUsers(role),
    },
    {
      id: 'activity_history',
      label: 'Historial de Actividad',
      icon: History,
      visible: Boolean(firebaseUser) && ROLE_PERMISSIONS.canViewAuditLogs(role),
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
    await markAsRead(notifId);
  };

  return (
    <div className="min-h-screen flex bg-pitch-canvas text-slate-900 dark:text-slate-100 transition-colors">
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
            const iconColor = NAV_ICON_COLOR_CLASSES[item.id]?.sidebar || 'text-slate-300';
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onNavigate(item.id);
                  setSidebarOpen(false);
                }}
                className={`group w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-electric-500 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-navy-800 hover:text-white'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-transform duration-150 group-hover:scale-110 ${
                    isActive ? 'text-white' : iconColor
                  }`}
                />
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
                onClick={openLoginModal}
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
        <header className="no-print sticky top-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4 sm:gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Abrir menú"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="font-display font-bold text-navy-900 dark:text-white whitespace-nowrap shrink-0">
                SIGD
              </span>
              <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">/</span>
              {activeNav && (
                <activeNav.icon
                  className={`w-4 h-4 shrink-0 ${
                    NAV_ICON_COLOR_CLASSES[activeNav.id]?.breadcrumb || 'text-electric-500'
                  }`}
                />
              )}
              <span className="font-medium text-slate-700 dark:text-slate-200 truncate">
                {activeNav?.label || 'Portal Público'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            {/* Light / Dark Theme Segmented Buttons */}
            <div
              role="group"
              aria-label="Selector de tema claro u oscuro"
              className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0"
            >
              <button
                type="button"
                onClick={() => setTheme('light')}
                aria-pressed={theme === 'light'}
                aria-label="Cambiar a modo claro"
                className={`group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  theme === 'light'
                    ? 'bg-white text-navy-900 shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Sun
                  className={`w-3.5 h-3.5 transition-transform duration-150 group-hover:scale-110 ${
                    theme === 'light' ? 'text-amber-500' : 'text-amber-400/80'
                  }`}
                />
                <span className="hidden sm:inline">Claro</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                aria-pressed={theme === 'dark'}
                aria-label="Cambiar a modo oscuro"
                className={`group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  theme === 'dark'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Moon
                  className={`w-3.5 h-3.5 transition-transform duration-150 group-hover:scale-110 ${
                    theme === 'dark' ? 'text-indigo-400' : 'text-indigo-500/80'
                  }`}
                />
                <span className="hidden sm:inline">Oscuro</span>
              </button>
            </div>

            {firebaseUser && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotifOpen((prev) => !prev)}
                  className="group relative inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
                  aria-label="Notificaciones en tiempo real"
                >
                  <Bell
                    className={`w-4 h-4 transition-transform duration-150 group-hover:scale-110 ${
                      unreadCount > 0
                        ? 'text-amber-500 dark:text-amber-400'
                        : 'text-blue-600 dark:text-blue-400'
                    }`}
                  />
                  <span className="hidden sm:inline">Notificaciones</span>
                  {unreadCount > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-md bg-red-600 text-white text-[11px] font-mono font-semibold tabular-nums">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/70">
                      <span className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100">
                        Centro de Notificaciones
                      </span>
                      <div className="flex items-center gap-2">
                        {unreadCount > 0 && (
                          <button
                            type="button"
                            onClick={() => void markAllAsRead()}
                            className="text-xs font-medium text-electric-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                          >
                            Marcar todas leídas
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setNotifOpen(false)}
                          className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                          aria-label="Cerrar centro de notificaciones"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
                          No hay notificaciones registradas todavía.
                        </div>
                      ) : (
                        notifications.slice(0, 20).map((n) => {
                          const isRead = firebaseUser && n.readBy?.includes(firebaseUser.uid);
                          const accentColor =
                            n.type === 'success'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : n.type === 'alert'
                                ? 'text-red-700 dark:text-red-400'
                                : n.type === 'warning'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-electric-600 dark:text-blue-400';
                          return (
                            <div
                              key={n.id}
                              className={`p-3.5 text-sm ${
                                isRead
                                  ? 'bg-white dark:bg-slate-900'
                                  : 'bg-blue-50/40 dark:bg-blue-950/30'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2 min-w-0">
                                  <NotificationTypeIcon type={n.type} className="w-4 h-4 mt-0.5" />
                                  <p className={`font-semibold ${accentColor}`}>{n.title}</p>
                                </div>
                                {!isRead && (
                                  <button
                                    type="button"
                                    onClick={() => handleMarkRead(n.id)}
                                    className="text-xs text-electric-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 shrink-0"
                                    title="Marcar como leída"
                                  >
                                    <CheckCheck className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{n.message}</p>
                              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 font-mono tabular-nums">
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
                onClick={openLoginModal}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy-900 dark:bg-electric-500 hover:bg-navy-800 dark:hover:bg-electric-600 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0"
              >
                <LogIn className="w-4 h-4" />
                Iniciar sesión
              </button>
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {firebaseUser && !firebaseUser.emailVerified && (
            <div className="mb-6 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 rounded-xl px-4 py-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-2">
                <MailCheck className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
                <span>
                  {verificationSentMsg ||
                    'Tu correo aún no ha sido verificado. Revisa el enlace de verificación en tu correo y recarga la página para habilitar operaciones de escritura.'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleResendVerification}
                className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-medium shrink-0 whitespace-nowrap"
              >
                Reenviar verificación
              </button>
            </div>
          )}
          {children}
        </main>
      </div>

      {/* Login Modal (Google + Email/Password) */}
      {loginModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-electric-500" />
                <h2 className="font-display font-bold text-base text-navy-900 dark:text-white">
                  Iniciar sesión en SIGD
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setLoginModalOpen(false)}
                aria-label="Cerrar ventana de acceso"
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {authError && (
              <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 rounded-lg px-3 py-2.5 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="button"
              disabled={signingIn}
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-navy-900 dark:bg-electric-500 hover:bg-navy-800 dark:hover:bg-electric-600 text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              <LogIn className="w-4 h-4" />
              {signingIn ? 'Conectando...' : 'Continuar con Google'}
            </button>

            <div className="relative flex items-center">
              <div className="flex-1 border-t border-slate-200 dark:border-slate-800" />
              <span className="px-3 text-[11px] text-slate-400 dark:text-slate-500">
                o ingresa con correo y contraseña
              </span>
              <div className="flex-1 border-t border-slate-200 dark:border-slate-800" />
            </div>

            <form onSubmit={handleEmailLoginSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="usuario@dominio.com"
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-3 pr-9 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((v) => !v)}
                    aria-label={showLoginPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showLoginPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={signingIn}
                className="w-full py-2.5 px-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-semibold text-slate-900 dark:text-white disabled:opacity-60 transition-colors"
              >
                {signingIn ? 'Verificando...' : 'Ingresar con contraseña'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
