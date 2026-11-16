import { useMemo, useState } from 'react';
import {
  Calendar,
  Download,
  FileSpreadsheet,
  Filter,
  History,
  RotateCcw,
  Search,
  User,
} from 'lucide-react';
import { AuditActionIcon } from '../components/SemanticIcons';
import { useSigdData } from '../context/SigdDataContext';
import { exportToExcel, exportToPdf } from '../engines/exportEngine';
import type { AuditLog } from '../types/sigd';

interface ActionMeta {
  label: string;
  tone: 'emerald' | 'blue' | 'amber' | 'rose' | 'slate';
}

const ACTION_META: Record<string, ActionMeta> = {
  BOOTSTRAP_CATALOG: { label: 'Inicialización de catálogo', tone: 'blue' },
  CREATE_SEASON: { label: 'Alta de temporada', tone: 'emerald' },
  CREATE_TOURNAMENT: { label: 'Creación de torneo', tone: 'emerald' },
  SET_CHAMPION: { label: 'Designación de campeón', tone: 'emerald' },
  CREATE_CATEGORY: { label: 'Alta de categoría', tone: 'emerald' },
  CREATE_TEAM: { label: 'Alta de equipo', tone: 'emerald' },
  CREATE_FIELD: { label: 'Alta de cancha', tone: 'emerald' },
  CREATE_REFEREE: { label: 'Alta de árbitro', tone: 'emerald' },
  GENERATE_SCHEDULE: { label: 'Generación de calendario', tone: 'blue' },
  REGENERATE_SCHEDULE: { label: 'Regeneración de calendario', tone: 'amber' },
  UPDATE_MATCH: { label: 'Edición de partido', tone: 'amber' },
  PUBLISH_SCHEDULE: { label: 'Publicación de roles', tone: 'emerald' },
  SUBMIT_MATCH_RESULT: { label: 'Envío de acta a validación', tone: 'amber' },
  APPROVE_RESULT: { label: 'Aprobación de resultado', tone: 'emerald' },
  REJECT_RESULT: { label: 'Rechazo de acta', tone: 'rose' },
  SAVE_TOURNAMENT_RULES: { label: 'Configuración de reglamento', tone: 'blue' },
  DELETE_TOURNAMENT_RULES: { label: 'Eliminación de reglamento', tone: 'rose' },
  SAVE_ORGANIZATION_CONFIG: { label: 'Configuración institucional', tone: 'blue' },
  UPDATE_USER_ROLE: { label: 'Cambio de rol de usuario', tone: 'amber' },
  UPDATE_USER_PROFILE: { label: 'Actualización de perfil', tone: 'amber' },
  CREATE_USER_INVITE: { label: 'Alta de usuario', tone: 'emerald' },
  UPDATE_USER_INVITE: { label: 'Actualización de pre-registro', tone: 'amber' },
  DELETE_USER_INVITE: { label: 'Revocación de pre-registro', tone: 'rose' },
};

const ENTITY_LABELS: Record<string, string> = {
  organizations: 'Organización',
  users: 'Usuarios',
  userInvites: 'Pre-registros',
  sports: 'Deportes',
  sportRules: 'Reglamentos',
  seasons: 'Temporadas',
  tournaments: 'Torneos',
  categories: 'Categorías',
  teams: 'Equipos',
  fields: 'Canchas',
  referees: 'Árbitros',
  matches: 'Partidos',
  matchResults: 'Actas y Resultados',
};

function getActionMeta(action: string): ActionMeta {
  if (ACTION_META[action]) return ACTION_META[action];
  if (action.startsWith('CREATE_')) return { label: action, tone: 'emerald' };
  if (action.startsWith('DELETE_')) return { label: action, tone: 'rose' };
  if (action.startsWith('UPDATE_') || action.startsWith('SAVE_')) {
    return { label: action, tone: 'amber' };
  }
  return { label: action, tone: 'slate' };
}

function getToneClasses(tone: ActionMeta['tone']): string {
  switch (tone) {
    case 'emerald':
      return 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/70';
    case 'blue':
      return 'text-electric-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/70';
    case 'amber':
      return 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/70';
    case 'rose':
      return 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/70';
    default:
      return 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
  }
}

function toLocalDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLogDate(log: AuditLog): Date | null {
  if (log.createdAt?.toDate) return log.createdAt.toDate();
  return null;
}

type DatePreset = 'all' | 'today' | '7d' | '30d' | 'custom';

export function ActivityHistoryPage() {
  const { auditLogs, users, organizations, loading } = useSigdData();

  const [selectedUserUid, setSelectedUserUid] = useState<string>('all');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [exportingPdf, setExportingPdf] = useState(false);

  const activeOrg = organizations[0];

  // Map uid -> friendly user info
  const userDirectory = useMemo(() => {
    const map = new Map<string, { name: string; email?: string }>();
    users.forEach((u) => {
      map.set(u.uid, { name: u.displayName, email: u.email });
    });
    auditLogs.forEach((log) => {
      if (!map.has(log.actorUid)) {
        map.set(log.actorUid, { name: log.actorName || log.actorUid });
      } else if (log.actorName && !map.get(log.actorUid)?.name) {
        const current = map.get(log.actorUid)!;
        map.set(log.actorUid, { ...current, name: log.actorName });
      }
    });
    return map;
  }, [users, auditLogs]);

  // Unique users appearing in auditLogs
  const actorOptions = useMemo(() => {
    const seen = new Map<string, string>();
    auditLogs.forEach((log) => {
      const dir = userDirectory.get(log.actorUid);
      const label = dir?.name || log.actorName || log.actorUid;
      seen.set(log.actorUid, dir?.email ? `${label} (${dir.email})` : label);
    });
    return Array.from(seen.entries())
      .map(([uid, label]) => ({ uid, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }, [auditLogs, userDirectory]);

  // Unique actions appearing in auditLogs
  const actionOptions = useMemo(() => {
    const unique = Array.from(new Set(auditLogs.map((l) => l.action)));
    return unique
      .map((action) => ({
        action,
        label: getActionMeta(action).label,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  }, [auditLogs]);

  const applyDatePreset = (preset: DatePreset) => {
    setDatePreset(preset);
    setCurrentPage(1);
    const now = new Date();
    if (preset === 'all') {
      setDateFrom('');
      setDateTo('');
    } else if (preset === 'today') {
      const todayStr = toLocalDateInputValue(now);
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (preset === '7d') {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      setDateFrom(toLocalDateInputValue(start));
      setDateTo(toLocalDateInputValue(now));
    } else if (preset === '30d') {
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      setDateFrom(toLocalDateInputValue(start));
      setDateTo(toLocalDateInputValue(now));
    }
  };

  const handleDateFromChange = (val: string) => {
    setDateFrom(val);
    setDatePreset(val || dateTo ? 'custom' : 'all');
    setCurrentPage(1);
  };

  const handleDateToChange = (val: string) => {
    setDateTo(val);
    setDatePreset(dateFrom || val ? 'custom' : 'all');
    setCurrentPage(1);
  };

  const resetFilters = () => {
    setSelectedUserUid('all');
    setSelectedAction('all');
    setDatePreset('all');
    setDateFrom('');
    setDateTo('');
    setSearchQuery('');
    setCurrentPage(1);
  };

  const hasActiveFilters =
    selectedUserUid !== 'all' ||
    selectedAction !== 'all' ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    searchQuery.trim().length > 0;

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const fromBoundary = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const toBoundary = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;

    return auditLogs.filter((log) => {
      if (selectedUserUid !== 'all' && log.actorUid !== selectedUserUid) {
        return false;
      }
      if (selectedAction !== 'all' && log.action !== selectedAction) {
        return false;
      }

      if (fromBoundary || toBoundary) {
        const logDate = getLogDate(log);
        if (!logDate) return false;
        if (fromBoundary && logDate < fromBoundary) return false;
        if (toBoundary && logDate > toBoundary) return false;
      }

      if (q) {
        const actorDisplay =
          userDirectory.get(log.actorUid)?.name || log.actorName || log.actorUid;
        const actionLabel = getActionMeta(log.action).label;
        const entityLabel = ENTITY_LABELS[log.entity] || log.entity;
        const haystack = [
          actorDisplay,
          log.actorUid,
          log.action,
          actionLabel,
          log.entity,
          entityLabel,
          log.entityId,
          log.summary,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [
    auditLogs,
    selectedUserUid,
    selectedAction,
    dateFrom,
    dateTo,
    searchQuery,
    userDirectory,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedLogs = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, safePage, pageSize]);

  const latestActivityLabel = useMemo(() => {
    const first = filteredLogs[0];
    if (!first) return 'Sin registros';
    const d = getLogDate(first);
    return d ? d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : 'Reciente';
  }, [filteredLogs]);

  const buildExportPayload = () => ({
    title: 'Historial de Actividad y Auditoría',
    subtitle: `Registros mostrados: ${filteredLogs.length}${
      dateFrom || dateTo ? ` · Periodo: ${dateFrom || '...'} a ${dateTo || '...'}` : ''
    }`,
    organizationName: activeOrg?.name || 'SIGD — Sistema Integral de Gestión Deportiva',
    organizationLogoUrl: activeOrg?.logoUrl,
    fileName: `Historial_Actividad_SIGD_${toLocalDateInputValue(new Date())}`,
    headers: ['Fecha y Hora', 'Usuario', 'Tipo de Acción', 'Entidad', 'ID Referencia', 'Descripción'],
    rows: filteredLogs.map((log) => {
      const d = getLogDate(log);
      const actor = userDirectory.get(log.actorUid)?.name || log.actorName || log.actorUid;
      const meta = getActionMeta(log.action);
      return [
        d ? d.toLocaleString('es-MX') : 'Reciente',
        actor,
        `${meta.label} (${log.action})`,
        ENTITY_LABELS[log.entity] || log.entity,
        log.entityId,
        log.summary,
      ];
    }),
  });

  const handleExportPdf = async () => {
    if (filteredLogs.length === 0) return;
    setExportingPdf(true);
    try {
      await exportToPdf(buildExportPayload());
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportExcel = () => {
    if (filteredLogs.length === 0) return;
    exportToExcel(buildExportPayload());
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-colors">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <History className="w-5 h-5 text-electric-500 shrink-0" />
            <h1 className="text-xl font-display font-bold text-navy-900 dark:text-white">
              Historial de Actividad
            </h1>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Bitácora inmutable de operaciones registradas en la colección de auditoría, filtrable por usuario, tipo de acción y rango de fechas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={filteredLogs.length === 0 || exportingPdf}
            onClick={handleExportPdf}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-electric-500" />
            {exportingPdf ? 'Generando PDF...' : 'Exportar PDF'}
          </button>
          <button
            type="button"
            disabled={filteredLogs.length === 0}
            onClick={handleExportExcel}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            Exportar Excel
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 transition-colors">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Registros visibles
          </p>
          <p className="mt-1 text-2xl font-display font-bold text-navy-900 dark:text-white font-mono tabular-nums">
            {filteredLogs.length}
            <span className="text-xs font-normal text-slate-400 dark:text-slate-500 ml-1.5">
              / {auditLogs.length} total
            </span>
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 transition-colors">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Usuarios con actividad
          </p>
          <p className="mt-1 text-2xl font-display font-bold text-navy-900 dark:text-white font-mono tabular-nums">
            {actorOptions.length}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 transition-colors">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Tipos de acción distintos
          </p>
          <p className="mt-1 text-2xl font-display font-bold text-navy-900 dark:text-white font-mono tabular-nums">
            {actionOptions.length}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 transition-colors">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Última actividad
          </p>
          <p className="mt-1.5 text-sm font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums truncate">
            {latestActivityLabel}
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 transition-colors">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-electric-500" />
            <h2 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
              Filtros de Búsqueda
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Rango rápido de fechas"
              className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              {(
                [
                  { id: 'all', label: 'Todo' },
                  { id: 'today', label: 'Hoy' },
                  { id: '7d', label: '7 días' },
                  { id: '30d', label: '30 días' },
                ] as { id: DatePreset; label: string }[]
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyDatePreset(preset.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    datePreset === preset.id
                      ? 'bg-white dark:bg-slate-900 text-navy-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Limpiar filtros
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3.5">
          {/* Search Input */}
          <div className="xl:col-span-1">
            <label
              htmlFor="audit-search"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Buscar en detalle o ID
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="audit-search"
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Torneo, acta, usuario..."
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>
          </div>

          {/* Filter by User */}
          <div>
            <label
              htmlFor="audit-user-filter"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1"
            >
              <User className="w-3.5 h-3.5 text-slate-400" />
              Usuario
            </label>
            <select
              id="audit-user-filter"
              value={selectedUserUid}
              onChange={(e) => {
                setSelectedUserUid(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="all">Todos los usuarios ({actorOptions.length})</option>
              {actorOptions.map((opt) => (
                <option key={opt.uid} value={opt.uid}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Filter by Action Type */}
          <div>
            <label
              htmlFor="audit-action-filter"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Tipo de acción
            </label>
            <select
              id="audit-action-filter"
              value={selectedAction}
              onChange={(e) => {
                setSelectedAction(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="all">Todas las acciones ({actionOptions.length})</option>
              {actionOptions.map((opt) => (
                <option key={opt.action} value={opt.action}>
                  {opt.label} ({opt.action})
                </option>
              ))}
            </select>
          </div>

          {/* Filter by Date From */}
          <div>
            <label
              htmlFor="audit-date-from"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1"
            >
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              Fecha desde
            </label>
            <input
              id="audit-date-from"
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => handleDateFromChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
            />
          </div>

          {/* Filter by Date To */}
          <div>
            <label
              htmlFor="audit-date-to"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1"
            >
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              Fecha hasta
            </label>
            <input
              id="audit-date-to"
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => handleDateToChange(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
            />
          </div>
        </div>
      </div>

      {/* Audit Logs Data Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden transition-colors">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <span className="font-semibold text-slate-900 dark:text-white">
              Registros de Auditoría
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {filteredLogs.length} resultado(s)
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <label
              htmlFor="audit-page-size"
              className="text-slate-500 dark:text-slate-400"
            >
              Filas por página
            </label>
            <select
              id="audit-page-size"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-md bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={500}>500</option>
            </select>
          </div>
        </div>

        {loading && auditLogs.length === 0 ? (
          <div className="p-5 space-y-2.5">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="h-10 rounded-lg bg-slate-100 dark:bg-slate-800/70 animate-pulse"
              />
            ))}
          </div>
        ) : auditLogs.length === 0 ? (
          <div className="px-6 py-12 text-center space-y-2">
            <History className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="font-display font-semibold text-sm text-slate-800 dark:text-slate-200">
              Aún no hay registros de actividad
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Cada creación de torneo, publicación de roles, validación de acta o cambio de permisos generará automáticamente un registro inmutable aquí.
            </p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="px-6 py-12 text-center space-y-3">
            <p className="font-display font-semibold text-sm text-slate-800 dark:text-slate-200">
              No se encontraron registros con los filtros seleccionados
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ajusta el usuario, tipo de acción o rango de fechas para ampliar la consulta.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-navy-900 dark:bg-electric-500 text-white hover:bg-navy-800 dark:hover:bg-electric-600 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restablecer filtros
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                    <th className="py-3 px-4 text-left font-semibold whitespace-nowrap">
                      Fecha y Hora
                    </th>
                    <th className="py-3 px-4 text-left font-semibold whitespace-nowrap">
                      Usuario
                    </th>
                    <th className="py-3 px-4 text-left font-semibold whitespace-nowrap">
                      Tipo de Acción
                    </th>
                    <th className="py-3 px-4 text-left font-semibold whitespace-nowrap">
                      Entidad / Ref.
                    </th>
                    <th className="py-3 px-4 text-left font-semibold">
                      Descripción
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paginatedLogs.map((log) => {
                    const d = getLogDate(log);
                    const userInfo = userDirectory.get(log.actorUid);
                    const displayActor =
                      userInfo?.name || log.actorName || log.actorUid;
                    const meta = getActionMeta(log.action);
                    const entityLabel = ENTITY_LABELS[log.entity] || log.entity;

                    return (
                      <tr
                        key={log.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <td className="py-2.5 px-4 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap tabular-nums">
                          {d
                            ? d.toLocaleString('es-MX', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })
                            : 'Reciente'}
                        </td>

                        <td className="py-2.5 px-4 text-xs whitespace-nowrap">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {displayActor}
                          </div>
                          {userInfo?.email && (
                            <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                              {userInfo.email}
                            </div>
                          )}
                        </td>

                        <td className="py-2.5 px-4 text-xs whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border font-medium ${getToneClasses(
                              meta.tone
                            )}`}
                          >
                            <AuditActionIcon action={log.action} className="w-3.5 h-3.5" />
                            {meta.label}
                          </span>
                          <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
                            {log.action}
                          </div>
                        </td>

                        <td className="py-2.5 px-4 text-xs whitespace-nowrap">
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {entityLabel}
                          </span>
                          <div
                            className="text-[11px] font-mono text-slate-400 dark:text-slate-500 max-w-[160px] truncate"
                            title={log.entityId}
                          >
                            {log.entityId}
                          </div>
                        </td>

                        <td className="py-2.5 px-4 text-xs text-slate-700 dark:text-slate-300 min-w-[260px]">
                          {log.summary}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-300">
                <span className="font-mono tabular-nums">
                  Página {safePage} de {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 font-medium transition-colors"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 font-medium transition-colors"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
