import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  ClipboardCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  useNotifications,
  type ToastNotification,
} from '../context/NotificationContext';
import { ROLE_PERMISSIONS } from '../types/sigd';
import type { PageId } from './Layout';

interface NotificationToastContainerProps {
  onNavigate?: (page: PageId) => void;
}

function getToastVisuals(toast: ToastNotification) {
  if (toast.category === 'schedule_published') {
    return {
      Icon: CalendarDays,
      statusLabel: 'Calendario publicado',
      iconTone:
        'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
      labelTone: 'text-emerald-700 dark:text-emerald-400',
      actionLabel: 'Ver calendario',
    };
  }

  if (toast.category === 'match_result') {
    if (toast.type === 'alert') {
      return {
        Icon: AlertTriangle,
        statusLabel: 'Incidencia en partido',
        iconTone:
          'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
        labelTone: 'text-red-700 dark:text-red-400',
        actionLabel: 'Revisar partido',
      };
    }
    if (toast.type === 'warning') {
      return {
        Icon: ClipboardCheck,
        statusLabel: 'Acta actualizada',
        iconTone:
          'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
        labelTone: 'text-amber-700 dark:text-amber-400',
        actionLabel: 'Validar acta',
      };
    }
    return {
      Icon: CheckCircle2,
      statusLabel: 'Resultado oficial',
      iconTone:
        'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
      labelTone: 'text-emerald-700 dark:text-emerald-400',
      actionLabel: 'Ver resultados',
    };
  }

  if (toast.type === 'alert') {
    return {
      Icon: AlertTriangle,
      statusLabel: 'Alerta operativa',
      iconTone:
        'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
      labelTone: 'text-red-700 dark:text-red-400',
      actionLabel: null,
    };
  }
  if (toast.type === 'warning') {
    return {
      Icon: AlertTriangle,
      statusLabel: 'Aviso operativo',
      iconTone:
        'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
      labelTone: 'text-amber-700 dark:text-amber-400',
      actionLabel: null,
    };
  }
  if (toast.type === 'success') {
    return {
      Icon: CheckCircle2,
      statusLabel: 'Confirmación',
      iconTone:
        'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
      labelTone: 'text-emerald-700 dark:text-emerald-400',
      actionLabel: null,
    };
  }

  return {
    Icon: Bell,
    statusLabel: 'Notificación SIGD',
    iconTone:
      'bg-blue-50 dark:bg-blue-950/60 text-electric-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
    labelTone: 'text-electric-600 dark:text-blue-400',
    actionLabel: null,
  };
}

export function NotificationToastContainer({
  onNavigate,
}: NotificationToastContainerProps) {
  const { role } = useAuth();
  const {
    toasts,
    dismissToast,
    markAsRead,
    pauseToastTimer,
    resumeToastTimer,
  } = useNotifications();

  if (toasts.length === 0) return null;

  const resolveTargetPage = (toast: ToastNotification): PageId | null => {
    if (toast.category === 'match_result') {
      if (
        ROLE_PERMISSIONS.canSubmitMatchSheet(role) ||
        role === 'representante'
      ) {
        return 'results';
      }
      return 'stats';
    }
    if (toast.category === 'schedule_published') {
      return ROLE_PERMISSIONS.canGenerateSchedule(role)
        ? 'schedule'
        : 'public_portal';
    }
    return null;
  };

  return (
    <section
      aria-label="Notificaciones recientes"
      className="no-print fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] max-w-sm pointer-events-none flex flex-col gap-2.5"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const { Icon, statusLabel, iconTone, labelTone, actionLabel } =
            getToastVisuals(toast);
          const targetPage = onNavigate ? resolveTargetPage(toast) : null;
          const timeText = new Date(toast.createdAtMs).toLocaleTimeString(
            'es-MX',
            {
              hour: '2-digit',
              minute: '2-digit',
            }
          );

          return (
            <motion.div
              key={toast.id}
              layout
              role="status"
              aria-live="polite"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              onMouseEnter={() => pauseToastTimer(toast.id)}
              onMouseLeave={() => resumeToastTimer(toast.id)}
              className="pointer-events-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-4 text-slate-900 dark:text-slate-100"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${iconTone}`}
                >
                  <Icon className="w-4 h-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs min-w-0">
                      <span className={`font-semibold truncate ${labelTone}`}>
                        {statusLabel}
                      </span>
                      <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-slate-400 dark:text-slate-500 font-mono tabular-nums shrink-0">
                        {timeText}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => dismissToast(toast.id)}
                      className="p-1 -m-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md transition-colors shrink-0"
                      aria-label="Cerrar notificación"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-sm font-display font-semibold text-navy-900 dark:text-white mt-1 leading-snug">
                    {toast.title}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed line-clamp-2">
                    {toast.message}
                  </p>

                  <div className="mt-3 flex items-center gap-3">
                    {targetPage && actionLabel && (
                      <button
                        type="button"
                        onClick={() => {
                          onNavigate?.(targetPage);
                          if (toast.notificationId) {
                            void markAsRead(toast.notificationId);
                          } else {
                            dismissToast(toast.id);
                          }
                        }}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-electric-600 dark:text-blue-400 hover:text-electric-700 dark:hover:text-blue-300 transition-colors whitespace-nowrap"
                      >
                        <span>{actionLabel}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {toast.notificationId && (
                      <button
                        type="button"
                        onClick={() => void markAsRead(toast.notificationId!)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors whitespace-nowrap"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>Marcar leída</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </section>
  );
}
