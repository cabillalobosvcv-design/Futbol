import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  summary?: string;
  icon?: ReactNode;
  open: boolean;
  onToggle: () => void;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
}

export function CollapsibleSection({
  title,
  summary,
  icon,
  open,
  onToggle,
  actions,
  children,
  className = '',
  headerClassName = '',
  bodyClassName = '',
}: CollapsibleSectionProps) {
  return (
    <section
      className={`border border-slate-200 dark:border-slate-700/80 rounded-xl bg-white dark:bg-slate-900 overflow-hidden transition-colors ${className}`}
    >
      <div
        className={`flex items-center justify-between gap-2 px-4 py-2.5 min-h-[48px] ${
          open ? 'border-b border-slate-200 dark:border-slate-800' : ''
        } ${headerClassName}`}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex-1 min-w-0 flex items-center justify-between gap-3 text-left py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-500 rounded-md"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && <span className="shrink-0">{icon}</span>}
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {title}
              </div>
              {summary && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {summary}
                </div>
              )}
            </div>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0 transition-transform duration-150 ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>

        {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
      </div>

      {open && <div className={bodyClassName}>{children}</div>}
    </section>
  );
}
