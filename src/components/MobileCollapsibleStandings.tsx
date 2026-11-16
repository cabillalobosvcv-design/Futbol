import { useState } from 'react';
import { ChevronDown, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { TeamCrest } from './TeamCrest';
import type { Category, Standing, Team } from '../types/sigd';

interface MobileCollapsibleStandingsProps {
  standings: Standing[];
  teamMap: Map<string, Team>;
  showPenCol: boolean;
  categoryMap?: Map<string, Category>;
  showCategoryName?: boolean;
  maxItems?: number;
}

export function MobileCollapsibleStandings({
  standings,
  teamMap,
  showPenCol,
  categoryMap,
  showCategoryName = false,
  maxItems,
}: MobileCollapsibleStandingsProps) {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const visibleStandings = maxItems ? standings.slice(0, maxItems) : standings;

  const expandedCount = visibleStandings.filter((st) => expandedIds[st.id]).length;
  const allExpanded = visibleStandings.length > 0 && expandedCount === visibleStandings.length;

  const toggleRow = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAll = () => {
    if (allExpanded) {
      setExpandedIds({});
    } else {
      const next: Record<string, boolean> = {};
      visibleStandings.forEach((st) => {
        next[st.id] = true;
      });
      setExpandedIds(next);
    }
  };

  return (
    <div className="md:hidden">
      {/* Compact Header & Expand All Control */}
      <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-300">
        <div className="flex items-center gap-3 font-semibold uppercase tracking-wide">
          <span className="w-5">Pos</span>
          <span>Equipo</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-semibold uppercase tracking-wide">PJ · DG · PTS</span>
          <button
            type="button"
            onClick={toggleAll}
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {allExpanded ? (
              <>
                <ChevronsDownUp className="w-3 h-3" />
                Contraer
              </>
            ) : (
              <>
                <ChevronsUpDown className="w-3 h-3" />
                Expandir
              </>
            )}
          </button>
        </div>
      </div>

      {/* Collapsible Rows */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {visibleStandings.map((st) => {
          const team = teamMap.get(st.teamId);
          const isOpen = Boolean(expandedIds[st.id]);
          const catName = showCategoryName ? categoryMap?.get(st.categoryId)?.name : undefined;

          return (
            <div key={st.id} className="bg-white dark:bg-slate-900">
              <button
                type="button"
                onClick={() => toggleRow(st.id)}
                aria-expanded={isOpen}
                className="w-full min-h-[54px] px-4 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-electric-500"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className="w-5 text-center font-mono font-bold tabular-nums text-sm text-navy-900 dark:text-white shrink-0">
                    {st.position}
                  </span>
                  <TeamCrest
                    name={team?.name || st.teamId}
                    shortCode={team?.shortCode || 'EQ'}
                    primaryColor={team?.primaryColor}
                    secondaryColor={team?.secondaryColor}
                    crestUrl={team?.crestUrl}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {team?.name || st.teamId}
                    </div>
                    {catName && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {catName}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 font-mono tabular-nums text-xs">
                  <span className="w-6 text-right text-slate-600 dark:text-slate-300">
                    {st.played}
                  </span>
                  <span
                    className={`w-8 text-right ${
                      st.goalDifference > 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : st.goalDifference < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {st.goalDifference > 0 ? `+${st.goalDifference}` : st.goalDifference}
                  </span>
                  <span className="w-8 text-right text-sm font-bold text-navy-900 dark:text-white">
                    {st.points}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-150 ${
                      isOpen ? 'rotate-180 text-electric-500' : ''
                    }`}
                  />
                </div>
              </button>

              {isOpen && (
                <div className="px-4 pb-3 pt-2 bg-slate-50/80 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800">
                  <div
                    className={`grid gap-2 text-center font-mono tabular-nums ${
                      showPenCol ? 'grid-cols-4' : 'grid-cols-3'
                    }`}
                  >
                    <div className="py-1.5 px-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                      <span className="block text-[10px] font-sans text-slate-500 dark:text-slate-400">
                        PG (Ganados)
                      </span>
                      <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                        {st.wins}
                      </span>
                    </div>
                    <div className="py-1.5 px-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                      <span className="block text-[10px] font-sans text-slate-500 dark:text-slate-400">
                        PE (Empates)
                      </span>
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                        {st.draws}
                      </span>
                    </div>
                    {showPenCol && (
                      <div className="py-1.5 px-2 rounded-lg bg-white dark:bg-slate-900 border border-amber-200/80 dark:border-amber-800/70">
                        <span className="block text-[10px] font-sans text-amber-700 dark:text-amber-400">
                          PEN (+1 pt)
                        </span>
                        <span className="text-sm font-bold text-amber-700 dark:text-amber-400">
                          {st.penaltyWins ?? 0}
                        </span>
                      </div>
                    )}
                    <div className="py-1.5 px-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                      <span className="block text-[10px] font-sans text-slate-500 dark:text-slate-400">
                        PP (Perdidos)
                      </span>
                      <span className="text-sm font-bold text-rose-600 dark:text-rose-400">
                        {st.losses}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center font-mono tabular-nums mt-2">
                    <div className="py-1.5 px-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                      <span className="block text-[10px] font-sans text-slate-500 dark:text-slate-400">
                        GF (A favor)
                      </span>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {st.goalsFor}
                      </span>
                    </div>
                    <div className="py-1.5 px-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                      <span className="block text-[10px] font-sans text-slate-500 dark:text-slate-400">
                        GC (En contra)
                      </span>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {st.goalsAgainst}
                      </span>
                    </div>
                    <div className="py-1.5 px-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80">
                      <span className="block text-[10px] font-sans text-slate-500 dark:text-slate-400">
                        DG (Dif.)
                      </span>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {st.goalDifference > 0 ? `+${st.goalDifference}` : st.goalDifference}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
