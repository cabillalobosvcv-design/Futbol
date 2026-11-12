import type {
  Match,
  MatchEvent,
  MatchResult,
  Player,
  PlayerStatistic,
  SportEngineType,
  Standing,
  Team,
  TeamStatistic,
  TiebreakerCriterion,
  Tournament,
} from '../types/sigd';

export interface FootballComputationOutput {
  teamStats: Omit<TeamStatistic, 'id' | 'updatedAt'>[];
  standings: Omit<Standing, 'id' | 'updatedAt'>[];
  playerStats: Omit<PlayerStatistic, 'id' | 'updatedAt'>[];
}

export function computeFootballCategoryMetrics(params: {
  sportEngine: SportEngineType;
  tournament: Tournament;
  categoryId: string;
  teams: Team[];
  players: Player[];
  matches: Match[];
  results: MatchResult[];
  events: MatchEvent[];
}): FootballComputationOutput {
  // Architectural isolation: never run football calculations for other sports
  if (params.sportEngine !== 'football') {
    return { teamStats: [], standings: [], playerStats: [] };
  }

  const { tournament, categoryId, teams, players, matches, results, events } = params;

  const approvedResults = results.filter(
    (r) =>
      r.tournamentId === tournament.id &&
      r.categoryId === categoryId &&
      r.validationStatus === 'aprobado'
  );

  const approvedResultByMatch = new Map(approvedResults.map((r) => [r.matchId, r]));
  const categoryMatches = matches.filter(
    (m) => m.tournamentId === tournament.id && m.categoryId === categoryId
  );

  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const teamAcc = new Map<
    string,
    {
      played: number;
      wins: number;
      draws: number;
      losses: number;
      goalsFor: number;
      goalsAgainst: number;
      points: number;
      cleanSheets: number;
      groupId?: string;
    }
  >();

  teams.forEach((t) => {
    teamAcc.set(t.id, {
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
      cleanSheets: 0,
      groupId: t.groupId,
    });
  });

  // Head-to-head lookup: `${teamA}|${teamB}` -> { pointsDiff, gdDiff }
  const h2hPoints = new Map<string, number>();
  const h2hGd = new Map<string, number>();

  const addH2H = (a: string, b: string, ptsA: number, ptsB: number, gfA: number, gfB: number) => {
    const keyAB = `${a}|${b}`;
    const keyBA = `${b}|${a}`;
    h2hPoints.set(keyAB, (h2hPoints.get(keyAB) || 0) + ptsA);
    h2hPoints.set(keyBA, (h2hPoints.get(keyBA) || 0) + ptsB);
    h2hGd.set(keyAB, (h2hGd.get(keyAB) || 0) + (gfA - gfB));
    h2hGd.set(keyBA, (h2hGd.get(keyBA) || 0) + (gfB - gfA));
  };

  for (const match of categoryMatches) {
    const res = approvedResultByMatch.get(match.id);
    if (!res) continue;
    const home = teamAcc.get(match.homeTeamId);
    const away = teamAcc.get(match.awayTeamId);
    if (!home || !away) continue;

    const hs = res.homeScore;
    const as = res.awayScore;

    home.played += 1;
    away.played += 1;
    home.goalsFor += hs;
    home.goalsAgainst += as;
    away.goalsFor += as;
    away.goalsAgainst += hs;

    if (as === 0) home.cleanSheets += 1;
    if (hs === 0) away.cleanSheets += 1;

    if (hs > as) {
      home.wins += 1;
      home.points += tournament.winPoints;
      away.losses += 1;
      away.points += tournament.lossPoints;
      addH2H(match.homeTeamId, match.awayTeamId, tournament.winPoints, tournament.lossPoints, hs, as);
    } else if (hs < as) {
      away.wins += 1;
      away.points += tournament.winPoints;
      home.losses += 1;
      home.points += tournament.lossPoints;
      addH2H(match.homeTeamId, match.awayTeamId, tournament.lossPoints, tournament.winPoints, hs, as);
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += tournament.drawPoints;
      away.points += tournament.drawPoints;
      addH2H(match.homeTeamId, match.awayTeamId, tournament.drawPoints, tournament.drawPoints, hs, as);
    }
  }

  const teamStats: Omit<TeamStatistic, 'id' | 'updatedAt'>[] = [];
  const rawStandings: Omit<Standing, 'id' | 'updatedAt'>[] = [];

  teamAcc.forEach((acc, teamId) => {
    const gd = acc.goalsFor - acc.goalsAgainst;
    const maxPossiblePoints = acc.played * tournament.winPoints;
    const winRate = acc.played > 0 ? Number(((acc.wins / acc.played) * 100).toFixed(1)) : 0;
    const effectivenessRate =
      maxPossiblePoints > 0 ? Number(((acc.points / maxPossiblePoints) * 100).toFixed(1)) : 0;
    const avgGoalsFor = acc.played > 0 ? Number((acc.goalsFor / acc.played).toFixed(2)) : 0;
    const avgGoalsAgainst = acc.played > 0 ? Number((acc.goalsAgainst / acc.played).toFixed(2)) : 0;

    teamStats.push({
      tournamentId: tournament.id,
      categoryId,
      teamId,
      played: acc.played,
      wins: acc.wins,
      draws: acc.draws,
      losses: acc.losses,
      goalsFor: acc.goalsFor,
      goalsAgainst: acc.goalsAgainst,
      goalDifference: gd,
      points: acc.points,
      winRate,
      effectivenessRate,
      avgGoalsFor,
      avgGoalsAgainst,
      cleanSheets: acc.cleanSheets,
    });

    rawStandings.push({
      tournamentId: tournament.id,
      categoryId,
      groupId: acc.groupId,
      teamId,
      position: 0,
      played: acc.played,
      wins: acc.wins,
      draws: acc.draws,
      losses: acc.losses,
      goalsFor: acc.goalsFor,
      goalsAgainst: acc.goalsAgainst,
      goalDifference: gd,
      points: acc.points,
    });
  });

  // Sort standings using configured tiebreakers
  const criteria: TiebreakerCriterion[] =
    tournament.tiebreakers && tournament.tiebreakers.length > 0
      ? tournament.tiebreakers
      : ['points', 'goal_difference', 'goals_for', 'head_to_head', 'wins'];

  const compareStandings = (a: Omit<Standing, 'id' | 'updatedAt'>, b: Omit<Standing, 'id' | 'updatedAt'>) => {
    for (const crit of criteria) {
      if (crit === 'points' && b.points !== a.points) return b.points - a.points;
      if (crit === 'goal_difference' && b.goalDifference !== a.goalDifference)
        return b.goalDifference - a.goalDifference;
      if (crit === 'goals_for' && b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      if (crit === 'wins' && b.wins !== a.wins) return b.wins - a.wins;
      if (crit === 'head_to_head') {
        const ptsA = h2hPoints.get(`${a.teamId}|${b.teamId}`) || 0;
        const ptsB = h2hPoints.get(`${b.teamId}|${a.teamId}`) || 0;
        if (ptsB !== ptsA) return ptsB - ptsA;
        const gdA = h2hGd.get(`${a.teamId}|${b.teamId}`) || 0;
        const gdB = h2hGd.get(`${b.teamId}|${a.teamId}`) || 0;
        if (gdB !== gdA) return gdB - gdA;
      }
    }
    const nameA = teamMap.get(a.teamId)?.name || '';
    const nameB = teamMap.get(b.teamId)?.name || '';
    return nameA.localeCompare(nameB);
  };

  // Assign overall or per-group positions
  const hasGroups = rawStandings.some((s) => Boolean(s.groupId));
  let standings: Omit<Standing, 'id' | 'updatedAt'>[] = [];
  if (hasGroups) {
    const grouped = new Map<string, Omit<Standing, 'id' | 'updatedAt'>[]>();
    rawStandings.forEach((s) => {
      const gKey = s.groupId || 'General';
      const arr = grouped.get(gKey) || [];
      arr.push(s);
      grouped.set(gKey, arr);
    });
    grouped.forEach((list) => {
      list.sort(compareStandings);
      list.forEach((item, idx) => {
        item.position = idx + 1;
      });
      standings.push(...list);
    });
  } else {
    standings = [...rawStandings].sort(compareStandings).map((item, idx) => ({
      ...item,
      position: idx + 1,
    }));
  }

  // Player statistics computed ONLY from events belonging to approved matches
  const approvedMatchIds = new Set(approvedResults.map((r) => r.matchId));
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const playerAcc = new Map<
    string,
    {
      teamId: string;
      matchIds: Set<string>;
      goals: number;
      assists: number;
      yellowCards: number;
      redCards: number;
      minutesPlayed: number;
      starts: number;
      subs: number;
      cleanSheetsGoalkeeper: number;
      goalsConcededGoalkeeper: number;
    }
  >();

  players.forEach((p) => {
    playerAcc.set(p.id, {
      teamId: p.teamId,
      matchIds: new Set<string>(),
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
      minutesPlayed: 0,
      starts: 0,
      subs: 0,
      cleanSheetsGoalkeeper: 0,
      goalsConcededGoalkeeper: 0,
    });
  });

  // Track goalkeeper appearances per match
  const gkMatchesProcessed = new Set<string>(); // `${matchId}|${playerId}`

  for (const ev of events) {
    if (!approvedMatchIds.has(ev.matchId)) continue;
    if (ev.tournamentId !== tournament.id || ev.categoryId !== categoryId) continue;

    const pStat = playerAcc.get(ev.playerId);
    if (pStat) {
      pStat.matchIds.add(ev.matchId);
      if (ev.eventType === 'gol' || ev.eventType === 'penal') {
        pStat.goals += 1;
      } else if (ev.eventType === 'asistencia') {
        pStat.assists += 1;
      } else if (ev.eventType === 'amarilla') {
        pStat.yellowCards += 1;
      } else if (ev.eventType === 'roja') {
        pStat.redCards += 1;
      } else if (ev.eventType === 'participacion') {
        pStat.minutesPlayed += ev.minutesPlayed || 0;
        if (ev.isStarter) pStat.starts += 1;
        else pStat.subs += 1;

        const playerObj = playerMap.get(ev.playerId);
        if (playerObj?.position === 'Portero') {
          const gkKey = `${ev.matchId}|${ev.playerId}`;
          if (!gkMatchesProcessed.has(gkKey)) {
            gkMatchesProcessed.add(gkKey);
            const matchRes = approvedResultByMatch.get(ev.matchId);
            const matchObj = categoryMatches.find((m) => m.id === ev.matchId);
            if (matchRes && matchObj) {
              const goalsAgainst =
                matchObj.homeTeamId === ev.teamId ? matchRes.awayScore : matchRes.homeScore;
              pStat.goalsConcededGoalkeeper += goalsAgainst;
              if (goalsAgainst === 0) pStat.cleanSheetsGoalkeeper += 1;
            }
          }
        }
      } else if (ev.eventType === 'sustitucion') {
        pStat.subs += 1;
      }

      if (ev.assistPlayerId) {
        const assister = playerAcc.get(ev.assistPlayerId);
        if (assister) {
          assister.matchIds.add(ev.matchId);
          assister.assists += 1;
        }
      }
    }
  }

  const playerStats: Omit<PlayerStatistic, 'id' | 'updatedAt'>[] = [];
  playerAcc.forEach((acc, playerId) => {
    playerStats.push({
      tournamentId: tournament.id,
      categoryId,
      teamId: acc.teamId,
      playerId,
      matchesPlayed: acc.matchIds.size,
      goals: acc.goals,
      assists: acc.assists,
      yellowCards: acc.yellowCards,
      redCards: acc.redCards,
      minutesPlayed: acc.minutesPlayed,
      starts: acc.starts,
      subs: acc.subs,
      cleanSheetsGoalkeeper: acc.cleanSheetsGoalkeeper,
      goalsConcededGoalkeeper: acc.goalsConcededGoalkeeper,
    });
  });

  return { teamStats, standings, playerStats };
}
