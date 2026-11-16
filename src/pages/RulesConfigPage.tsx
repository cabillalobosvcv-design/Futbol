import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Edit3,
  RotateCcw,
  Scale,
  Settings2,
  SlidersHorizontal,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSigdData } from '../context/SigdDataContext';
import { TIEBREAKER_LABELS } from '../engines/sportsCatalog';
import {
  deleteTournamentSportRule,
  saveTournamentSportRule,
  updateBaseSportRule,
} from '../services/firestoreService';
import {
  ROLE_PERMISSIONS,
  type SportRule,
  type TiebreakerCriterion,
} from '../types/sigd';

const ALL_TIEBREAKERS: TiebreakerCriterion[] = [
  'points',
  'goal_difference',
  'goals_for',
  'head_to_head',
  'wins',
];

export function RulesConfigPage() {
  const { profile, role } = useAuth();
  const {
    tournaments,
    sports,
    seasons,
    sportRules,
    categories,
    teams,
    players,
    matches,
    matchResults,
    matchEvents,
  } = useSigdData();

  const canManageRules = ROLE_PERMISSIONS.canManageSportsAndRules(role);

  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('');
  const [ruleName, setRuleName] = useState('');
  const [winPoints, setWinPoints] = useState(3);
  const [drawPoints, setDrawPoints] = useState(1);
  const [lossPoints, setLossPoints] = useState(0);
  const [drawPenaltyShootout, setDrawPenaltyShootout] = useState(true);
  const [drawPenaltyWinBonusPoints, setDrawPenaltyWinBonusPoints] = useState(1);
  const [tiebreakers, setTiebreakers] = useState<TiebreakerCriterion[]>([
    'points',
    'goal_difference',
    'goals_for',
    'head_to_head',
    'wins',
  ]);
  const [minRestHours, setMinRestHours] = useState(24);
  const [matchDurationMinutes, setMatchDurationMinutes] = useState(90);
  const [maxPlayersOnField, setMaxPlayersOnField] = useState(11);
  const [yellowCardsLimit, setYellowCardsLimit] = useState(5);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // Edit base rule & delete any rule from stored table
  const [editingBaseRule, setEditingBaseRule] = useState<SportRule | null>(null);
  const [baseRuleName, setBaseRuleName] = useState('');
  const [baseWinPoints, setBaseWinPoints] = useState(3);
  const [baseDrawPoints, setBaseDrawPoints] = useState(1);
  const [baseLossPoints, setBaseLossPoints] = useState(0);
  const [baseDrawPenaltyShootout, setBaseDrawPenaltyShootout] = useState(true);
  const [baseDrawPenaltyBonus, setBaseDrawPenaltyBonus] = useState(1);
  const [baseTiebreakers, setBaseTiebreakers] = useState<TiebreakerCriterion[]>([...ALL_TIEBREAKERS]);
  const [baseMinRestHours, setBaseMinRestHours] = useState(24);
  const [baseMatchDuration, setBaseMatchDuration] = useState(90);
  const [baseMaxPlayers, setBaseMaxPlayers] = useState(11);
  const [baseYellowCards, setBaseYellowCards] = useState(5);
  const [deletingTableRule, setDeletingTableRule] = useState<SportRule | null>(null);

  const activeTournament = useMemo(
    () => tournaments.find((t) => t.id === selectedTournamentId) || tournaments[0],
    [tournaments, selectedTournamentId]
  );

  const activeSport = useMemo(
    () => sports.find((s) => s.id === activeTournament?.sportId),
    [sports, activeTournament?.sportId]
  );

  const tournamentSpecificRule = useMemo(
    () => sportRules.find((r) => r.tournamentId === activeTournament?.id),
    [sportRules, activeTournament?.id]
  );

  const baseSportRule = useMemo(
    () => sportRules.find((r) => r.sportId === activeTournament?.sportId && !r.tournamentId),
    [sportRules, activeTournament?.sportId]
  );

  const loadFormFromSource = (
    tournamentId: string,
    specificRule?: SportRule,
    fallbackRule?: SportRule
  ) => {
    const trn = tournaments.find((t) => t.id === tournamentId);
    if (!trn) return;

    const source = specificRule || fallbackRule;
    setRuleName(
      specificRule?.name || `Reglamento Oficial · ${trn.name}`.slice(0, 120)
    );
    setWinPoints(specificRule?.winPoints ?? trn.winPoints ?? fallbackRule?.winPoints ?? 3);
    setDrawPoints(specificRule?.drawPoints ?? trn.drawPoints ?? fallbackRule?.drawPoints ?? 1);
    setLossPoints(specificRule?.lossPoints ?? trn.lossPoints ?? fallbackRule?.lossPoints ?? 0);
    setDrawPenaltyShootout(
      specificRule?.drawPenaltyShootout ??
        trn.drawPenaltyShootout ??
        fallbackRule?.drawPenaltyShootout ??
        false
    );
    setDrawPenaltyWinBonusPoints(
      specificRule?.drawPenaltyWinBonusPoints ??
        trn.drawPenaltyWinBonusPoints ??
        fallbackRule?.drawPenaltyWinBonusPoints ??
        1
    );

    const activeTb =
      specificRule?.tiebreakers?.length
        ? specificRule.tiebreakers
        : trn.tiebreakers?.length
          ? trn.tiebreakers
          : fallbackRule?.tiebreakers?.length
            ? fallbackRule.tiebreakers
            : (['points', 'goal_difference', 'goals_for', 'head_to_head', 'wins'] as TiebreakerCriterion[]);
    setTiebreakers([...activeTb]);

    setMinRestHours(
      specificRule?.minRestHours ?? trn.minRestHours ?? source?.minRestHours ?? 24
    );
    setMatchDurationMinutes(
      specificRule?.matchDurationMinutes ?? fallbackRule?.matchDurationMinutes ?? 90
    );
    setMaxPlayersOnField(
      specificRule?.maxPlayersOnField ?? fallbackRule?.maxPlayersOnField ?? 11
    );
    setYellowCardsLimit(
      specificRule?.yellowCardsSuspensionLimit ?? fallbackRule?.yellowCardsSuspensionLimit ?? 5
    );
    setConfirmReset(false);
  };

  useEffect(() => {
    if (!activeTournament) return;
    loadFormFromSource(activeTournament.id, tournamentSpecificRule, baseSportRule);
  }, [activeTournament?.id, tournamentSpecificRule?.id, baseSportRule?.id]);

  const inactiveTiebreakers = useMemo(
    () => ALL_TIEBREAKERS.filter((crit) => !tiebreakers.includes(crit)),
    [tiebreakers]
  );

  const toggleTiebreaker = (crit: TiebreakerCriterion) => {
    if (!canManageRules) return;
    setTiebreakers((prev) => {
      if (prev.includes(crit)) {
        if (prev.length <= 1) return prev;
        return prev.filter((c) => c !== crit);
      }
      return [...prev, crit];
    });
  };

  const moveTiebreaker = (index: number, direction: -1 | 1) => {
    if (!canManageRules) return;
    const target = index + direction;
    if (target < 0 || target >= tiebreakers.length) return;
    setTiebreakers((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const applyPreset = (
    win: number,
    draw: number,
    loss: number,
    penaltyShootout = false,
    penaltyBonus = 1
  ) => {
    if (!canManageRules) return;
    setWinPoints(win);
    setDrawPoints(draw);
    setLossPoints(loss);
    setDrawPenaltyShootout(penaltyShootout);
    setDrawPenaltyWinBonusPoints(penaltyBonus);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !canManageRules || !activeTournament || !activeSport) return;

    setMsg(null);
    setErrMsg(null);

    const trimmedName = ruleName.trim();
    if (trimmedName.length < 2) {
      setErrMsg('El nombre del reglamento debe tener al menos 2 caracteres.');
      return;
    }
    if (tiebreakers.length === 0) {
      setErrMsg('Debes mantener al menos un criterio de desempate activo.');
      return;
    }

    setSaving(true);
    try {
      const cleanBonus = drawPenaltyShootout
        ? Math.min(10, Math.max(0, Math.round(Number(drawPenaltyWinBonusPoints))))
        : 0;

      await saveTournamentSportRule({
        ruleId: tournamentSpecificRule?.id || `rule_trn_${activeTournament.id}`,
        isNew: !tournamentSpecificRule,
        tournament: activeTournament,
        sport: activeSport,
        name: trimmedName,
        winPoints: Math.min(10, Math.max(0, Math.round(Number(winPoints)))),
        drawPoints: Math.min(10, Math.max(0, Math.round(Number(drawPoints)))),
        lossPoints: Math.min(10, Math.max(0, Math.round(Number(lossPoints)))),
        drawPenaltyShootout,
        drawPenaltyWinBonusPoints: cleanBonus,
        tiebreakers,
        minRestHours: Math.min(240, Math.max(0, Math.round(Number(minRestHours)))),
        matchDurationMinutes: Math.min(300, Math.max(10, Math.round(Number(matchDurationMinutes)))),
        maxPlayersOnField: Math.min(50, Math.max(1, Math.round(Number(maxPlayersOnField)))),
        yellowCardsSuspensionLimit: Math.min(20, Math.max(0, Math.round(Number(yellowCardsLimit)))),
        categories,
        teams,
        players,
        allMatches: matches,
        allResults: matchResults,
        allEvents: matchEvents,
        actorUid: profile.uid,
        actorName: profile.displayName,
      });

      const penSummary = drawPenaltyShootout ? ` (+${cleanBonus} pen.)` : '';
      setMsg(
        `Reglamento guardado en sportRules para "${activeTournament.name}" (${winPoints}V / ${drawPoints}E${penSummary} / ${lossPoints}D) y sincronizado con las tablas de posiciones.`
      );
    } catch {
      setErrMsg('No se pudo guardar el reglamento. Verifica tus permisos e intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCustomRule = async () => {
    if (!profile || !canManageRules || !tournamentSpecificRule || !activeTournament) return;
    setSaving(true);
    setMsg(null);
    setErrMsg(null);
    try {
      await deleteTournamentSportRule({
        ruleId: tournamentSpecificRule.id,
        tournamentName: activeTournament.name,
        actorUid: profile.uid,
        actorName: profile.displayName,
      });
      setConfirmReset(false);
      setMsg(
        `Se eliminó el reglamento personalizado de "${activeTournament.name}". Ahora utiliza los valores base de la disciplina.`
      );
    } catch {
      setErrMsg('No se pudo eliminar el reglamento personalizado.');
    } finally {
      setSaving(false);
    }
  };

  const openEditBaseRule = (rule: SportRule) => {
    setEditingBaseRule(rule);
    setBaseRuleName(rule.name);
    setBaseWinPoints(rule.winPoints);
    setBaseDrawPoints(rule.drawPoints);
    setBaseLossPoints(rule.lossPoints);
    setBaseDrawPenaltyShootout(Boolean(rule.drawPenaltyShootout));
    setBaseDrawPenaltyBonus(rule.drawPenaltyWinBonusPoints ?? 1);
    setBaseTiebreakers(
      rule.tiebreakers?.length ? [...rule.tiebreakers] : [...ALL_TIEBREAKERS]
    );
    setBaseMinRestHours(rule.minRestHours ?? 24);
    setBaseMatchDuration(rule.matchDurationMinutes ?? 90);
    setBaseMaxPlayers(rule.maxPlayersOnField ?? 11);
    setBaseYellowCards(rule.yellowCardsSuspensionLimit ?? 5);
    setMsg(null);
    setErrMsg(null);
  };

  const toggleBaseTiebreaker = (crit: TiebreakerCriterion) => {
    setBaseTiebreakers((prev) => {
      if (prev.includes(crit)) {
        if (prev.length <= 1) return prev;
        return prev.filter((c) => c !== crit);
      }
      return [...prev, crit];
    });
  };

  const moveBaseTiebreaker = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= baseTiebreakers.length) return;
    setBaseTiebreakers((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const handleSaveBaseRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !canManageRules || !editingBaseRule) return;
    const trimmed = baseRuleName.trim();
    if (trimmed.length < 2) {
      setErrMsg('El nombre del reglamento base debe tener al menos 2 caracteres.');
      return;
    }
    setSaving(true);
    setMsg(null);
    setErrMsg(null);
    try {
      await updateBaseSportRule({
        rule: editingBaseRule,
        name: trimmed,
        winPoints: Math.min(10, Math.max(0, Math.round(Number(baseWinPoints)))),
        drawPoints: Math.min(10, Math.max(0, Math.round(Number(baseDrawPoints)))),
        lossPoints: Math.min(10, Math.max(0, Math.round(Number(baseLossPoints)))),
        drawPenaltyShootout: baseDrawPenaltyShootout,
        drawPenaltyWinBonusPoints: baseDrawPenaltyShootout
          ? Math.min(10, Math.max(0, Math.round(Number(baseDrawPenaltyBonus))))
          : 0,
        tiebreakers: baseTiebreakers,
        minRestHours: Math.min(240, Math.max(0, Math.round(Number(baseMinRestHours)))),
        matchDurationMinutes: Math.min(300, Math.max(10, Math.round(Number(baseMatchDuration)))),
        maxPlayersOnField: Math.min(50, Math.max(1, Math.round(Number(baseMaxPlayers)))),
        yellowCardsSuspensionLimit: Math.min(20, Math.max(0, Math.round(Number(baseYellowCards)))),
        actorUid: profile.uid,
        actorName: profile.displayName,
      });
      setMsg(`Reglamento base "${trimmed}" actualizado correctamente.`);
      setEditingBaseRule(null);
    } catch {
      setErrMsg('No se pudo actualizar el reglamento base.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDeleteTableRule = async () => {
    if (!profile || !canManageRules || !deletingTableRule) return;
    setSaving(true);
    setMsg(null);
    setErrMsg(null);
    try {
      const scopeLabel = deletingTableRule.tournamentId
        ? tournaments.find((t) => t.id === deletingTableRule.tournamentId)?.name || deletingTableRule.name
        : deletingTableRule.name;
      await deleteTournamentSportRule({
        ruleId: deletingTableRule.id,
        tournamentName: scopeLabel,
        actorUid: profile.uid,
        actorName: profile.displayName,
      });
      setDeletingTableRule(null);
      setMsg(`Reglamento "${scopeLabel}" eliminado de sportRules.`);
    } catch {
      setErrMsg('No se pudo eliminar el reglamento seleccionado.');
    } finally {
      setSaving(false);
    }
  };

  const tournamentRules = useMemo(
    () => sportRules.filter((r) => Boolean(r.tournamentId)),
    [sportRules]
  );

  const sportBaseRules = useMemo(
    () => sportRules.filter((r) => !r.tournamentId),
    [sportRules]
  );

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors">
        <div>
          <h1 className="text-xl font-display font-bold text-navy-900 dark:text-white">
            Configuración de Reglamentos por Torneo
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            Define el sistema de puntuación, el orden de criterios de desempate y las reglas operativas de cada torneo en{' '}
            <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-navy-900 dark:text-blue-300">
              sportRules
            </code>
            .
          </p>
        </div>
        {!canManageRules && (
          <span className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shrink-0">
            Modo consulta (solo Administrador General edita reglamentos)
          </span>
        )}
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

      {tournaments.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-sm text-slate-500 dark:text-slate-400">
          No hay torneos registrados todavía. Crea primero un torneo en <strong>Torneos y Deportes</strong> para configurar su reglamento.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Tournament Selector Sidebar */}
          <div className="lg:col-span-4 space-y-3">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 transition-colors">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                <Trophy className="w-4 h-4 text-electric-500" />
                <h2 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
                  Seleccionar Torneo ({tournaments.length})
                </h2>
              </div>
              <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                {tournaments.map((t) => {
                  const sp = sports.find((s) => s.id === t.sportId);
                  const sea = seasons.find((s) => s.id === t.seasonId);
                  const hasCustom = sportRules.some((r) => r.tournamentId === t.id);
                  const isSelected = activeTournament?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setSelectedTournamentId(t.id);
                        setMsg(null);
                        setErrMsg(null);
                      }}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        isSelected
                          ? 'bg-navy-900/5 dark:bg-electric-500/15 border-electric-500'
                          : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-sm text-slate-900 dark:text-white leading-snug">
                          {t.name}
                        </p>
                        <span
                          className={`text-[11px] font-medium px-2 py-0.5 rounded shrink-0 ${
                            hasCustom
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {hasCustom ? 'Personalizado' : 'Base'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {sp?.name || t.sportId} · {sea?.name || t.seasonId}
                      </p>
                      <p className="text-[11px] font-mono text-slate-600 dark:text-slate-300 mt-1 tabular-nums">
                        V:{t.winPoints} · E:{t.drawPoints}
                        {t.drawPenaltyShootout ? ` (+${t.drawPenaltyWinBonusPoints ?? 1} Pen)` : ''} · D:{t.lossPoints}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Rule Configuration Form */}
          <form
            id="rule-editor-panel"
            onSubmit={handleSaveRule}
            className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-6 transition-colors"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-electric-500" />
                  <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                    {activeTournament?.name}
                  </h2>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Disciplina: <strong className="text-slate-700 dark:text-slate-200">{activeSport?.name || activeTournament?.sportId}</strong> · Documento destino:{' '}
                  <code className="font-mono text-[11px]">
                    sportRules/{tournamentSpecificRule?.id || `rule_trn_${activeTournament?.id}`}
                  </code>
                </p>
              </div>

              {canManageRules && (
                <button
                  type="button"
                  onClick={() =>
                    activeTournament &&
                    loadFormFromSource(activeTournament.id, undefined, baseSportRule)
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Cargar valores base
                </button>
              )}
            </div>

            {/* General Rule Name */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nombre del Reglamento
              </label>
              <input
                type="text"
                required
                maxLength={120}
                disabled={!canManageRules}
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                placeholder="Ej. Reglamento Oficial Apertura 2026"
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-60"
              />
            </div>

            {/* Scoring System */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-electric-500" />
                  <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
                    Sistema de Puntuación
                  </h3>
                </div>
                {canManageRules && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyPreset(3, 1, 0, true, 1)}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors"
                    >
                      Empate + Penales (3 / 1 + 1 Pen)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset(3, 1, 0, false, 0)}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      Estándar (3 / 1 / 0)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset(2, 1, 0, false, 0)}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      Clásico (2 / 1 / 0)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset(2, 0, 1, false, 0)}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      FIBA (2 / 0 / 1)
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Puntos por Victoria
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    required
                    disabled={!canManageRules}
                    value={winPoints}
                    onChange={(e) => setWinPoints(Number(e.target.value))}
                    className="w-full px-3 py-2 text-base font-mono font-bold border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 tabular-nums disabled:opacity-60"
                  />
                </div>
                <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Puntos por Empate
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    required
                    disabled={!canManageRules}
                    value={drawPoints}
                    onChange={(e) => setDrawPoints(Number(e.target.value))}
                    className="w-full px-3 py-2 text-base font-mono font-bold border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 tabular-nums disabled:opacity-60"
                  />
                </div>
                <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Puntos por Derrota
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    required
                    disabled={!canManageRules}
                    value={lossPoints}
                    onChange={(e) => setLossPoints(Number(e.target.value))}
                    className="w-full px-3 py-2 text-base font-mono font-bold border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 tabular-nums disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/25 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!canManageRules}
                      checked={drawPenaltyShootout}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setDrawPenaltyShootout(checked);
                        if (checked && drawPenaltyWinBonusPoints <= 0) {
                          setDrawPenaltyWinBonusPoints(1);
                        }
                      }}
                      className="mt-0.5 rounded border-amber-400 dark:border-amber-600 text-amber-600 focus:ring-amber-500"
                    />
                    <div>
                      <span className="block text-xs font-semibold text-slate-900 dark:text-white">
                        Empate con punto extra en tanda de penales
                      </span>
                      <span className="block text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                        Al empatar en tiempo regular se otorga {drawPoints} punto a cada equipo y se disputa otro punto adicional en penales.
                      </span>
                    </div>
                  </label>

                  {drawPenaltyShootout && (
                    <div className="flex items-center gap-2 shrink-0">
                      <label className="text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        Punto extra en penales:
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        disabled={!canManageRules}
                        value={drawPenaltyWinBonusPoints}
                        onChange={(e) => setDrawPenaltyWinBonusPoints(Number(e.target.value))}
                        className="w-16 px-2.5 py-1.5 text-sm font-mono font-bold text-center border border-amber-300 dark:border-amber-700 rounded-lg bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-300 tabular-nums disabled:opacity-60"
                      />
                    </div>
                  )}
                </div>

                {drawPenaltyShootout && (
                  <div className="text-[11px] font-mono text-amber-900 dark:text-amber-200 bg-white/80 dark:bg-slate-900/70 border border-amber-200/80 dark:border-amber-800/60 rounded-lg px-3 py-2">
                    Regla activa: Empate = {drawPoints} pt c/u · Ganador de penales = {drawPoints + (Number(drawPenaltyWinBonusPoints) || 1)} pts totales ({drawPoints} base + {Number(drawPenaltyWinBonusPoints) || 1} extra) · Perdedor de penales = {drawPoints} pt.
                  </div>
                )}
              </div>
            </div>

            {/* Tiebreakers Priority Order */}
            <div className="space-y-3">
              <div>
                <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
                  Criterios de Desempate (Orden de Prioridad)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  El motor estadístico evalúa los criterios activos de arriba hacia abajo para determinar las posiciones oficiales.
                </p>
              </div>

              <div className="space-y-2">
                {tiebreakers.map((crit, idx) => (
                  <div
                    key={crit}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60"
                  >
                    <label className="flex items-center gap-3 text-sm font-medium text-slate-800 dark:text-slate-100 cursor-pointer flex-1">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-navy-900 dark:bg-electric-500 text-white text-xs font-mono font-bold tabular-nums">
                        {idx + 1}
                      </span>
                      <input
                        type="checkbox"
                        checked
                        disabled={!canManageRules || tiebreakers.length <= 1}
                        onChange={() => toggleTiebreaker(crit)}
                        className="rounded border-slate-300 dark:border-slate-600"
                      />
                      <span>{TIEBREAKER_LABELS[crit]}</span>
                    </label>

                    {canManageRules && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveTiebreaker(idx, -1)}
                          className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-35"
                          title="Subir prioridad"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === tiebreakers.length - 1}
                          onClick={() => moveTiebreaker(idx, 1)}
                          className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-35"
                          title="Bajar prioridad"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {inactiveTiebreakers.length > 0 && (
                  <div className="pt-2 space-y-1.5">
                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Criterios desactivados
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {inactiveTiebreakers.map((crit) => (
                        <button
                          key={crit}
                          type="button"
                          disabled={!canManageRules}
                          onClick={() => toggleTiebreaker(crit)}
                          className="px-3 py-1.5 text-xs rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-electric-500 hover:text-electric-600 dark:hover:text-blue-400 disabled:opacity-50 transition-colors"
                        >
                          + Activar: {TIEBREAKER_LABELS[crit]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Operational Parameters */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-electric-500" />
                <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
                  Parámetros Operativos y Disciplinarios
                </h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Descanso mín. (hrs)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={240}
                    disabled={!canManageRules}
                    value={minRestHours}
                    onChange={(e) => setMinRestHours(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Duración (min)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={300}
                    disabled={!canManageRules}
                    value={matchDurationMinutes}
                    onChange={(e) => setMatchDurationMinutes(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Jugadores en cancha
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    disabled={!canManageRules}
                    value={maxPlayersOnField}
                    onChange={(e) => setMaxPlayersOnField(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Límite amarillas
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    disabled={!canManageRules}
                    value={yellowCardsLimit}
                    onChange={(e) => setYellowCardsLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums disabled:opacity-60"
                  />
                </div>
              </div>
            </div>

            {canManageRules && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div>
                  {tournamentSpecificRule && (
                    confirmReset ? (
                      <div className="inline-flex items-center gap-2">
                        <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                          ¿Eliminar regla personalizada?
                        </span>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={handleDeleteCustomRule}
                          className="px-2.5 py-1 text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white rounded-md"
                        >
                          Sí, eliminar
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => setConfirmReset(false)}
                          className="px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => setConfirmReset(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Eliminar regla del torneo
                      </button>
                    )
                  )}
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-electric-500 hover:bg-electric-600 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {saving ? 'Guardando reglamento...' : 'Guardar Reglamento del Torneo'}
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Stored Rules Overview */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden transition-colors">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white">
            Reglamentos Almacenados en sportRules ({sportRules.length})
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {tournamentRules.length} por torneo · {sportBaseRules.length} base por disciplina
          </span>
        </div>

        {sportRules.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Aún no hay documentos registrados en <code className="font-mono">sportRules</code>.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-3 px-4 text-left font-semibold">Reglamento</th>
                  <th className="py-3 px-4 text-left font-semibold">Ámbito</th>
                  <th className="py-3 px-4 text-left font-semibold">Puntuación (V / E / D)</th>
                  <th className="py-3 px-4 text-left font-semibold">Orden de Desempate</th>
                  <th className="py-3 px-4 text-right font-semibold">Descanso</th>
                  {canManageRules && (
                    <th className="py-3 px-4 text-right font-semibold">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sportRules.map((rule) => {
                  const sp = sports.find((s) => s.id === rule.sportId);
                  const trn = rule.tournamentId
                    ? tournaments.find((t) => t.id === rule.tournamentId)
                    : undefined;
                  return (
                    <tr
                      key={rule.id}
                      onClick={() => {
                        if (trn) setSelectedTournamentId(trn.id);
                      }}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                        trn ? 'cursor-pointer' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{rule.name}</p>
                        <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                          {rule.id}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {trn ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-medium">
                            Torneo: {trn.name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            Disciplina: {sp?.name || rule.sportId}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                        <span>
                          {rule.winPoints}V / {rule.drawPoints}E / {rule.lossPoints}D
                        </span>
                        {rule.drawPenaltyShootout && (
                          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px]">
                            +{rule.drawPenaltyWinBonusPoints ?? 1} Pen
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                        {rule.tiebreakers
                          .map((tb, i) => `${i + 1}. ${TIEBREAKER_LABELS[tb] || tb}`)
                          .join(' · ')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                        {rule.minRestHours} h
                      </td>
                      {canManageRules && (
                        <td
                          className="py-3 px-4 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => {
                                if (trn) {
                                  setSelectedTournamentId(trn.id);
                                  document
                                    .getElementById('rule-editor-panel')
                                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                } else {
                                  openEditBaseRule(rule);
                                }
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-navy-900 dark:text-blue-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              Editar
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => setDeletingTableRule(rule)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-md transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Eliminar
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Editar Reglamento Base de Disciplina */}
      {canManageRules && editingBaseRule && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveBaseRule}
            className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="font-display font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-electric-500" />
                  Editar Reglamento Base de Disciplina
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Disciplina: {sports.find((s) => s.id === editingBaseRule.sportId)?.name || editingBaseRule.sportId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingBaseRule(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nombre del Reglamento
              </label>
              <input
                type="text"
                required
                maxLength={120}
                value={baseRuleName}
                onChange={(e) => setBaseRuleName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Victoria (pts)
                </label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  required
                  value={baseWinPoints}
                  onChange={(e) => setBaseWinPoints(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono font-bold border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Empate (pts)
                </label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  required
                  value={baseDrawPoints}
                  onChange={(e) => setBaseDrawPoints(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono font-bold border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-400 tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Derrota (pts)
                </label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  required
                  value={baseLossPoints}
                  onChange={(e) => setBaseLossPoints(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono font-bold border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 tabular-nums"
                />
              </div>
            </div>

            <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/25 flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-800 dark:text-slate-100 cursor-pointer">
                <input
                  type="checkbox"
                  checked={baseDrawPenaltyShootout}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setBaseDrawPenaltyShootout(checked);
                    if (checked && baseDrawPenaltyBonus <= 0) setBaseDrawPenaltyBonus(1);
                  }}
                  className="rounded border-amber-400"
                />
                <span>Empate + punto extra en penales</span>
              </label>
              {baseDrawPenaltyShootout && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-600 dark:text-slate-300">Extra:</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={baseDrawPenaltyBonus}
                    onChange={(e) => setBaseDrawPenaltyBonus(Number(e.target.value))}
                    className="w-14 px-2 py-1 text-xs font-mono font-bold text-center border border-amber-300 dark:border-amber-700 rounded bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-300 tabular-nums"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Criterios de Desempate
              </label>
              <div className="space-y-1.5">
                {baseTiebreakers.map((crit, idx) => (
                  <div
                    key={crit}
                    className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60"
                  >
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-800 dark:text-slate-100 cursor-pointer flex-1">
                      <span className="font-mono font-bold text-navy-900 dark:text-blue-400">
                        {idx + 1}.
                      </span>
                      <input
                        type="checkbox"
                        checked
                        disabled={baseTiebreakers.length <= 1}
                        onChange={() => toggleBaseTiebreaker(crit)}
                      />
                      <span>{TIEBREAKER_LABELS[crit]}</span>
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveBaseTiebreaker(idx, -1)}
                        className="p-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-35"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === baseTiebreakers.length - 1}
                        onClick={() => moveBaseTiebreaker(idx, 1)}
                        className="p-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-35"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
                {ALL_TIEBREAKERS.filter((c) => !baseTiebreakers.includes(c)).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {ALL_TIEBREAKERS.filter((c) => !baseTiebreakers.includes(c)).map((crit) => (
                      <button
                        key={crit}
                        type="button"
                        onClick={() => toggleBaseTiebreaker(crit)}
                        className="px-2.5 py-1 text-[11px] rounded-md border border-dashed border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-electric-500"
                      >
                        + {TIEBREAKER_LABELS[crit]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Descanso (hrs)
                </label>
                <input
                  type="number"
                  min={0}
                  max={240}
                  value={baseMinRestHours}
                  onChange={(e) => setBaseMinRestHours(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Duración (min)
                </label>
                <input
                  type="number"
                  min={10}
                  max={300}
                  value={baseMatchDuration}
                  onChange={(e) => setBaseMatchDuration(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Jugadores cancha
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={baseMaxPlayers}
                  onChange={(e) => setBaseMaxPlayers(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Límite amarillas
                </label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={baseYellowCards}
                  onChange={(e) => setBaseYellowCards(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditingBaseRule(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-electric-500 hover:bg-electric-600 disabled:opacity-60 text-white text-xs font-semibold rounded-lg"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Confirmar Eliminación de Reglamento */}
      {canManageRules && deletingTableRule && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                    Eliminar Reglamento
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Esta acción elimina el documento de sportRules y quedará auditada.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeletingTableRule(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 text-xs space-y-1">
              <p className="font-semibold text-slate-900 dark:text-white">
                {deletingTableRule.name}
              </p>
              <p className="text-slate-600 dark:text-slate-300 font-mono">
                {deletingTableRule.winPoints}V / {deletingTableRule.drawPoints}E
                {deletingTableRule.drawPenaltyShootout
                  ? ` (+${deletingTableRule.drawPenaltyWinBonusPoints ?? 1} Pen)`
                  : ''}{' '}
                / {deletingTableRule.lossPoints}D
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setDeletingTableRule(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleConfirmDeleteTableRule}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {saving ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
