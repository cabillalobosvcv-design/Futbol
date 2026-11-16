import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpRight,
  Ban,
  CalendarDays,
  CheckCircle2,
  Clock,
  Compass,
  Crosshair,
  Crown,
  Edit3,
  Flag,
  Globe,
  Info,
  PauseCircle,
  Play,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Square,
  Target,
  Timer,
  Trash2,
  Users,
  Wrench,
  XCircle,
} from 'lucide-react';
import type { PageId } from './Layout';
import type { Field, MatchEventType, MatchStatus, UserRole } from '../types/sigd';

export const NAV_ICON_COLOR_CLASSES: Record<PageId, { sidebar: string; breadcrumb: string }> = {
  public_portal: {
    sidebar: 'text-sky-400',
    breadcrumb: 'text-sky-600 dark:text-sky-400',
  },
  dashboard: {
    sidebar: 'text-blue-400',
    breadcrumb: 'text-blue-600 dark:text-blue-400',
  },
  tournaments: {
    sidebar: 'text-amber-400',
    breadcrumb: 'text-amber-600 dark:text-amber-400',
  },
  rules: {
    sidebar: 'text-indigo-400',
    breadcrumb: 'text-indigo-600 dark:text-indigo-400',
  },
  teams: {
    sidebar: 'text-emerald-400',
    breadcrumb: 'text-emerald-600 dark:text-emerald-400',
  },
  facilities: {
    sidebar: 'text-teal-400',
    breadcrumb: 'text-teal-600 dark:text-teal-400',
  },
  schedule: {
    sidebar: 'text-violet-400',
    breadcrumb: 'text-violet-600 dark:text-violet-400',
  },
  referee_assignments: {
    sidebar: 'text-orange-400',
    breadcrumb: 'text-orange-600 dark:text-orange-400',
  },
  referee_capture: {
    sidebar: 'text-yellow-400',
    breadcrumb: 'text-amber-600 dark:text-yellow-400',
  },
  results: {
    sidebar: 'text-lime-400',
    breadcrumb: 'text-emerald-600 dark:text-lime-400',
  },
  stats: {
    sidebar: 'text-cyan-400',
    breadcrumb: 'text-cyan-600 dark:text-cyan-400',
  },
  reports: {
    sidebar: 'text-green-400',
    breadcrumb: 'text-green-600 dark:text-green-400',
  },
  organization: {
    sidebar: 'text-sky-300',
    breadcrumb: 'text-indigo-600 dark:text-sky-300',
  },
  activity_history: {
    sidebar: 'text-purple-400',
    breadcrumb: 'text-purple-600 dark:text-purple-400',
  },
  users: {
    sidebar: 'text-rose-400',
    breadcrumb: 'text-rose-600 dark:text-rose-400',
  },
};

export function MatchStatusIndicator({
  status,
  rejected = false,
  onClick,
  title,
}: {
  status: MatchStatus;
  rejected?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const effectiveLabel = rejected ? 'Por corregir' : status;
  let Icon = Clock;
  let colorCls = 'text-blue-600 dark:text-blue-400';

  if (rejected) {
    Icon = AlertCircle;
    colorCls = 'text-rose-600 dark:text-rose-400';
  } else {
    switch (status) {
      case 'En juego':
        Icon = Play;
        colorCls = 'text-emerald-600 dark:text-emerald-400';
        break;
      case 'Finalizado':
        Icon = CheckCircle2;
        colorCls = 'text-green-600 dark:text-green-400';
        break;
      case 'Pendiente de validación':
        Icon = AlertTriangle;
        colorCls = 'text-amber-600 dark:text-amber-400';
        break;
      case 'Suspendido':
        Icon = PauseCircle;
        colorCls = 'text-orange-600 dark:text-orange-400';
        break;
      case 'Reprogramado':
        Icon = RefreshCw;
        colorCls = 'text-violet-600 dark:text-violet-400';
        break;
      case 'Cancelado':
        Icon = XCircle;
        colorCls = 'text-rose-600 dark:text-rose-400';
        break;
      default:
        Icon = Clock;
        colorCls = 'text-blue-600 dark:text-blue-400';
        break;
    }
  }

  const content = (
    <span className="inline-flex items-center gap-1.5 font-medium text-xs">
      <Icon
        className={`w-3.5 h-3.5 shrink-0 ${colorCls} ${
          onClick ? 'transition-transform duration-150 group-hover:scale-115' : ''
        }`}
      />
      <span className="text-slate-700 dark:text-slate-200">{effectiveLabel}</span>
    </span>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title || `Filtrar o revisar estado: ${effectiveLabel}`}
        className="group inline-flex items-center rounded-md px-1.5 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
      >
        {content}
      </button>
    );
  }

  return content;
}

export const MATCH_EVENT_STYLE: Record<
  MatchEventType,
  { label: string; colorClass: string; activeBgClass: string }
> = {
  gol: {
    label: 'Gol',
    colorClass: 'text-emerald-600 dark:text-emerald-400',
    activeBgClass:
      'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:border-emerald-500',
  },
  penal: {
    label: 'Penal',
    colorClass: 'text-blue-600 dark:text-blue-400',
    activeBgClass: 'bg-blue-600 text-white border-blue-600 dark:bg-blue-500 dark:border-blue-500',
  },
  autogol: {
    label: 'Autogol',
    colorClass: 'text-rose-600 dark:text-rose-400',
    activeBgClass: 'bg-rose-600 text-white border-rose-600 dark:bg-rose-500 dark:border-rose-500',
  },
  asistencia: {
    label: 'Asistencia',
    colorClass: 'text-cyan-600 dark:text-cyan-400',
    activeBgClass: 'bg-cyan-600 text-white border-cyan-600 dark:bg-cyan-500 dark:border-cyan-500',
  },
  amarilla: {
    label: 'T. Amarilla',
    colorClass: 'text-amber-500 dark:text-amber-400',
    activeBgClass:
      'bg-amber-500 text-slate-950 border-amber-500 dark:bg-amber-400 dark:text-slate-950 dark:border-amber-400',
  },
  roja: {
    label: 'T. Roja',
    colorClass: 'text-red-600 dark:text-red-400',
    activeBgClass: 'bg-red-600 text-white border-red-600 dark:bg-red-500 dark:border-red-500',
  },
  sustitucion: {
    label: 'Cambio',
    colorClass: 'text-violet-600 dark:text-violet-400',
    activeBgClass:
      'bg-violet-600 text-white border-violet-600 dark:bg-violet-500 dark:border-violet-500',
  },
  participacion: {
    label: 'Minutos',
    colorClass: 'text-teal-600 dark:text-teal-400',
    activeBgClass: 'bg-teal-600 text-white border-teal-600 dark:bg-teal-500 dark:border-teal-500',
  },
};

export function MatchEventIcon({
  eventType,
  className = 'w-4 h-4',
  inheritColor = false,
}: {
  eventType: MatchEventType;
  className?: string;
  inheritColor?: boolean;
}) {
  const color = inheritColor ? '' : MATCH_EVENT_STYLE[eventType].colorClass;
  switch (eventType) {
    case 'gol':
      return <Target className={`${className} ${color} shrink-0`} />;
    case 'penal':
      return <Crosshair className={`${className} ${color} shrink-0`} />;
    case 'autogol':
      return <RotateCcw className={`${className} ${color} shrink-0`} />;
    case 'asistencia':
      return <ArrowUpRight className={`${className} ${color} shrink-0`} />;
    case 'amarilla':
      return (
        <Square
          className={`${className} ${
            inheritColor ? 'fill-current' : 'text-amber-500 fill-amber-400 dark:text-amber-400'
          } shrink-0`}
        />
      );
    case 'roja':
      return (
        <Square
          className={`${className} ${
            inheritColor ? 'fill-current' : 'text-red-600 fill-red-600 dark:text-red-500 dark:fill-red-500'
          } shrink-0`}
        />
      );
    case 'sustitucion':
      return <ArrowLeftRight className={`${className} ${color} shrink-0`} />;
    case 'participacion':
      return <Timer className={`${className} ${color} shrink-0`} />;
  }
}

export function FieldStatusIcon({
  status,
  className = 'w-3.5 h-3.5',
}: {
  status: Field['status'];
  className?: string;
}) {
  if (status === 'disponible') {
    return <CheckCircle2 className={`${className} text-emerald-600 dark:text-emerald-400 shrink-0`} />;
  }
  if (status === 'mantenimiento') {
    return <Wrench className={`${className} text-amber-600 dark:text-amber-400 shrink-0`} />;
  }
  return <Ban className={`${className} text-rose-600 dark:text-rose-400 shrink-0`} />;
}

export function NotificationTypeIcon({
  type,
  className = 'w-4 h-4',
}: {
  type: 'info' | 'success' | 'warning' | 'alert';
  className?: string;
}) {
  switch (type) {
    case 'success':
      return <CheckCircle2 className={`${className} text-emerald-600 dark:text-emerald-400 shrink-0`} />;
    case 'warning':
      return <AlertTriangle className={`${className} text-amber-600 dark:text-amber-400 shrink-0`} />;
    case 'alert':
      return <AlertCircle className={`${className} text-rose-600 dark:text-rose-400 shrink-0`} />;
    default:
      return <Info className={`${className} text-blue-600 dark:text-blue-400 shrink-0`} />;
  }
}

export function UserRoleIcon({
  role,
  className = 'w-3.5 h-3.5',
}: {
  role: UserRole;
  className?: string;
}) {
  switch (role) {
    case 'admin_general':
      return <Crown className={`${className} text-rose-600 dark:text-rose-400 shrink-0`} />;
    case 'admin_deportivo':
      return <ShieldCheck className={`${className} text-blue-600 dark:text-blue-400 shrink-0`} />;
    case 'coordinador':
      return <Compass className={`${className} text-violet-600 dark:text-violet-400 shrink-0`} />;
    case 'arbitro':
      return <Flag className={`${className} text-amber-600 dark:text-amber-400 shrink-0`} />;
    case 'representante':
      return <Users className={`${className} text-emerald-600 dark:text-emerald-400 shrink-0`} />;
    default:
      return <Globe className={`${className} text-sky-600 dark:text-sky-400 shrink-0`} />;
  }
}

export function AuditActionIcon({
  action,
  className = 'w-3.5 h-3.5',
}: {
  action: string;
  className?: string;
}) {
  if (action.startsWith('DELETE_') || action.startsWith('REJECT_')) {
    return <Trash2 className={`${className} text-rose-600 dark:text-rose-400 shrink-0`} />;
  }
  if (action === 'PUBLISH_SCHEDULE' || action === 'APPROVE_RESULT') {
    return action === 'PUBLISH_SCHEDULE' ? (
      <Send className={`${className} text-emerald-600 dark:text-emerald-400 shrink-0`} />
    ) : (
      <CheckCircle2 className={`${className} text-emerald-600 dark:text-emerald-400 shrink-0`} />
    );
  }
  if (action.includes('SCHEDULE')) {
    return <CalendarDays className={`${className} text-violet-600 dark:text-violet-400 shrink-0`} />;
  }
  if (action.startsWith('CREATE_') || action.startsWith('BOOTSTRAP_')) {
    return <PlusCircle className={`${className} text-emerald-600 dark:text-emerald-400 shrink-0`} />;
  }
  return <Edit3 className={`${className} text-amber-600 dark:text-amber-400 shrink-0`} />;
}
