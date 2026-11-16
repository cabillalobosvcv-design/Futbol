import type {
  Field,
  Group,
  Match,
  MatchStage,
  Referee,
  Round,
  ScheduleConflict,
  Team,
  TournamentFormat,
} from '../types/sigd';

export type ScheduleGenerationMode = 'weekly_all' | 'single_week';

export interface WeekBucket {
  weekNumber: number;
  weekStart: string;
  weekEnd: string;
  dates: string[];
}

export interface GenerateFixtureOptions {
  tournamentId: string;
  categoryId: string;
  teams: Team[];
  format: TournamentFormat;
  doubleRound: boolean;
  teamsPerGroup: number;
  qualifiersPerGroup: number;
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  allowedWeekdays?: string[]; // e.g. ['Sábado', 'Domingo']
  scheduleMode?: ScheduleGenerationMode;
  roundsPerWeek?: number; // default 1 round per calendar week
  targetRoundNumber?: number; // used when scheduleMode === 'single_week'
  daysBetweenRounds: number;
  defaultTimes: string[]; // e.g. ['09:00', '11:00', '13:00', '15:00']
  fields: Field[];
  referees: Referee[];
  minRestHours: number;
  startingMatchNumber?: number;
  explicitFields?: boolean;
  occupiedMatches?: Match[];
}

export interface GeneratedFixtureResult {
  rounds: Omit<Round, 'id'>[];
  groups: Omit<Group, 'id'>[];
  matches: (Omit<Match, 'id' | 'createdAt' | 'updatedAt'> & { tempId: string })[];
  conflicts: ScheduleConflict[];
  teamGroupAssignments: Record<string, string>; // teamId -> groupName
}

const WEEKDAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const WEEKDAY_ORDER = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const;

export function addDaysToIsoDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function getWeekdayName(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1));
  return WEEKDAY_NAMES[dt.getUTCDay()] || 'Sábado';
}

function diffIsoDays(startIso: string, endIso: string): number {
  const [y1, m1, d1] = startIso.split('-').map(Number);
  const [y2, m2, d2] = endIso.split('-').map(Number);
  const t1 = Date.UTC(y1 || 2026, (m1 || 1) - 1, d1 || 1);
  const t2 = Date.UTC(y2 || 2026, (m2 || 1) - 1, d2 || 1);
  return Math.round((t2 - t1) / (24 * 3600 * 1000));
}

export function getWeekStartMonday(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1));
  const dayOfWeek = dt.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  dt.setUTCDate(dt.getUTCDate() + diffToMonday);
  return dt.toISOString().slice(0, 10);
}

export function getValidDatesInRange(
  startDate: string,
  endDate: string,
  allowedWeekdays?: string[]
): string[] {
  if (!startDate || !endDate || startDate > endDate) return [];
  const allowedSet = new Set(
    allowedWeekdays && allowedWeekdays.length > 0 ? allowedWeekdays : [...WEEKDAY_ORDER]
  );
  const dates: string[] = [];
  let cursor = startDate;
  for (let i = 0; i < 730 && cursor <= endDate; i++) {
    if (allowedSet.has(getWeekdayName(cursor))) {
      dates.push(cursor);
    }
    cursor = addDaysToIsoDate(cursor, 1);
  }
  return dates;
}

export function groupDatesByWeek(
  startDate: string,
  endDate: string,
  allowedWeekdays?: string[]
): WeekBucket[] {
  const validDates = getValidDatesInRange(startDate, endDate, allowedWeekdays);
  if (validDates.length === 0) return [];

  const bucketsMap = new Map<string, string[]>();
  for (const dt of validDates) {
    const monday = getWeekStartMonday(dt);
    const list = bucketsMap.get(monday) || [];
    list.push(dt);
    bucketsMap.set(monday, list);
  }

  return Array.from(bucketsMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, dates], idx) => ({
      weekNumber: idx + 1,
      weekStart,
      weekEnd: addDaysToIsoDate(weekStart, 6),
      dates,
    }));
}

function parseDateTimeMs(date: string, time: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return Date.UTC(y || 2026, (m || 1) - 1, d || 1, hh || 0, mm || 0);
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function buildRoundRobinPairings(teamIds: string[], doubleRound: boolean): { round: number; home: string; away: string }[] {
  const ids = [...teamIds];
  if (ids.length < 2) return [];
  const hasBye = ids.length % 2 !== 0;
  if (hasBye) ids.push('__BYE__');

  const n = ids.length;
  const numRounds = n - 1;
  const half = n / 2;
  const firstLeg: { round: number; home: string; away: string }[] = [];

  const rotating = ids.slice(1);
  const fixed = ids[0];

  for (let r = 0; r < numRounds; r++) {
    const circle = [fixed, ...rotating];
    for (let i = 0; i < half; i++) {
      const t1 = circle[i];
      const t2 = circle[n - 1 - i];
      if (t1 !== '__BYE__' && t2 !== '__BYE__') {
        const swap = r % 2 === 1 && i === 0;
        firstLeg.push({
          round: r + 1,
          home: swap ? t2 : t1,
          away: swap ? t1 : t2,
        });
      }
    }
    // Rotate clockwise
    const last = rotating.pop()!;
    rotating.unshift(last);
  }

  if (!doubleRound) return firstLeg;

  const secondLeg = firstLeg.map((p) => ({
    round: p.round + numRounds,
    home: p.away,
    away: p.home,
  }));

  return [...firstLeg, ...secondLeg];
}

function getKnockoutStageName(teamsInRound: number): MatchStage {
  if (teamsInRound <= 2) return 'final';
  if (teamsInRound <= 4) return 'semifinal';
  if (teamsInRound <= 8) return 'cuartos';
  return 'octavos';
}

function getRoundDisplayName(stage: MatchStage, roundNumber: number): string {
  switch (stage) {
    case 'final':
      return 'Final';
    case 'semifinal':
      return 'Semifinales';
    case 'cuartos':
      return 'Cuartos de Final';
    case 'octavos':
      return 'Octavos de Final';
    case 'grupos':
      return `Jornada ${roundNumber} · Grupos`;
    default:
      return `Jornada ${roundNumber}`;
  }
}

export function generateTournamentFixtures(opts: GenerateFixtureOptions): GeneratedFixtureResult {
  const activeTeams = opts.teams.filter((t) => t.active);
  const roundsMap = new Map<number, Omit<Round, 'id'>>();
  const groups: Omit<Group, 'id'>[] = [];
  const teamGroupAssignments: Record<string, string> = {};
  const rawPairings: {
    roundNumber: number;
    stage: MatchStage;
    groupName?: string;
    bracketSlot?: string;
    homeTeamId: string;
    awayTeamId: string;
  }[] = [];

  if (opts.format === 'round_robin') {
    const pairings = buildRoundRobinPairings(
      activeTeams.map((t) => t.id),
      opts.doubleRound
    );
    pairings.forEach((p) => {
      rawPairings.push({
        roundNumber: p.round,
        stage: 'regular',
        homeTeamId: p.home,
        awayTeamId: p.away,
      });
    });
  } else if (opts.format === 'knockout') {
    const count = activeTeams.length;
    let bracketSize = 2;
    while (bracketSize < count) bracketSize *= 2;
    const totalRounds = Math.log2(bracketSize);
    const firstStage = getKnockoutStageName(bracketSize);

    // Round 1 pairings (with BYE awareness: only create real matches when both exist, or TBD for next rounds)
    const seeded = activeTeams.map((t) => t.id);
    while (seeded.length < bracketSize) seeded.push('__BYE__');

    let roundTeamCount = bracketSize;
    for (let r = 1; r <= totalRounds; r++) {
      const stage = getKnockoutStageName(roundTeamCount);
      const matchesInRound = roundTeamCount / 2;
      for (let m = 0; m < matchesInRound; m++) {
        if (r === 1) {
          const home = seeded[m * 2];
          const away = seeded[m * 2 + 1];
          if (home !== '__BYE__' && away !== '__BYE__') {
            rawPairings.push({
              roundNumber: r,
              stage: firstStage,
              bracketSlot: `${stage.toUpperCase()}-${m + 1}`,
              homeTeamId: home,
              awayTeamId: away,
            });
          } else if (home !== '__BYE__' && away === '__BYE__') {
            // Auto-pass placeholder recorded as TBD vs home? Better: create TBD slot in next round or direct match
            rawPairings.push({
              roundNumber: r,
              stage: firstStage,
              bracketSlot: `${stage.toUpperCase()}-${m + 1}`,
              homeTeamId: home,
              awayTeamId: 'TBD_BYE',
            });
          }
        } else {
          rawPairings.push({
            roundNumber: r,
            stage,
            bracketSlot: `${stage.toUpperCase()}-${m + 1}`,
            homeTeamId: 'TBD',
            awayTeamId: 'TBD',
          });
        }
      }
      roundTeamCount = roundTeamCount / 2;
    }
  } else if (opts.format === 'groups' || opts.format === 'mixed') {
    const perGroup = Math.max(2, opts.teamsPerGroup || 4);
    const numGroups = Math.max(1, Math.ceil(activeTeams.length / perGroup));
    const groupBuckets: Team[][] = Array.from({ length: numGroups }, () => []);

    // Serpentine balanced distribution across groups
    activeTeams.forEach((team, idx) => {
      const cycle = Math.floor(idx / numGroups);
      const pos = cycle % 2 === 0 ? idx % numGroups : numGroups - 1 - (idx % numGroups);
      groupBuckets[pos].push(team);
    });

    let maxGroupRounds = 0;
    groupBuckets.forEach((bucket, gIdx) => {
      const groupLetter = String.fromCharCode(65 + gIdx);
      const groupName = `Grupo ${groupLetter}`;
      groups.push({
        tournamentId: opts.tournamentId,
        categoryId: opts.categoryId,
        name: groupName,
        teamIds: bucket.map((t) => t.id),
      });
      bucket.forEach((t) => {
        teamGroupAssignments[t.id] = groupName;
      });
      const pairings = buildRoundRobinPairings(
        bucket.map((t) => t.id),
        opts.doubleRound
      );
      pairings.forEach((p) => {
        if (p.round > maxGroupRounds) maxGroupRounds = p.round;
        rawPairings.push({
          roundNumber: p.round,
          stage: 'grupos',
          groupName,
          homeTeamId: p.home,
          awayTeamId: p.away,
        });
      });
    });

    // If mixed modality, append Knockout Semifinals & Final after group stage
    if (opts.format === 'mixed') {
      const totalQualified = numGroups * Math.max(1, opts.qualifiersPerGroup || 2);
      if (totalQualified >= 4) {
        const semiRound = maxGroupRounds + 1;
        rawPairings.push(
          {
            roundNumber: semiRound,
            stage: 'semifinal',
            bracketSlot: 'SF-1',
            homeTeamId: 'TBD_1A',
            awayTeamId: 'TBD_2B',
          },
          {
            roundNumber: semiRound,
            stage: 'semifinal',
            bracketSlot: 'SF-2',
            homeTeamId: 'TBD_1B',
            awayTeamId: 'TBD_2A',
          }
        );
        rawPairings.push({
          roundNumber: semiRound + 1,
          stage: 'final',
          bracketSlot: 'FINAL-1',
          homeTeamId: 'TBD_GAN_SF1',
          awayTeamId: 'TBD_GAN_SF2',
        });
      } else {
        rawPairings.push({
          roundNumber: maxGroupRounds + 1,
          stage: 'final',
          bracketSlot: 'FINAL-1',
          homeTeamId: 'TBD_1',
          awayTeamId: 'TBD_2',
        });
      }
    }
  }

  // Slot allocator respecting date range, allowed weekdays, field availability, simultaneous constraints, and minRestHours
  const availableFields = opts.explicitFields
    ? opts.fields
    : opts.fields.filter((f) => f.status === 'disponible');
  const activeReferees = opts.referees.filter((r) => r.status === 'activo');
  const defaultTimes =
    opts.defaultTimes.length > 0 ? opts.defaultTimes : ['09:00', '11:00', '13:00', '15:00'];

  const usedFieldSlots = new Set<string>(); // `${fieldId}|${date}|${time}`
  const usedRefereeSlots = new Set<string>(); // `${refId}|${date}|${time}`
  for (const occ of opts.occupiedMatches || []) {
    if (occ.status === 'Cancelado' || occ.status === 'Suspendido') continue;
    if (occ.fieldId) usedFieldSlots.add(`${occ.fieldId}|${occ.date}|${occ.time}`);
    if (occ.refereeId) usedRefereeSlots.add(`${occ.refereeId}|${occ.date}|${occ.time}`);
  }
  const teamLastMatchMs = new Map<string, number>();

  let matchSeq = opts.startingMatchNumber || 1;
  const generatedMatches: (Omit<Match, 'id' | 'createdAt' | 'updatedAt'> & { tempId: string })[] = [];

  // Group pairings by roundNumber
  const scheduleMode: ScheduleGenerationMode = opts.scheduleMode || 'weekly_all';
  const roundsPerWeek = Math.max(1, opts.roundsPerWeek || 1);
  const allPairings = [...rawPairings].sort((a, b) => a.roundNumber - b.roundNumber);
  const targetRound =
    scheduleMode === 'single_week'
      ? opts.targetRoundNumber || allPairings[0]?.roundNumber || 1
      : undefined;

  const sortedPairings =
    targetRound !== undefined
      ? allPairings.filter((p) => p.roundNumber === targetRound)
      : allPairings;

  const uniqueRoundNumbers = Array.from(new Set(sortedPairings.map((p) => p.roundNumber))).sort(
    (a, b) => a - b
  );

  const effectiveEndDate =
    opts.endDate && opts.endDate >= opts.startDate
      ? opts.endDate
      : addDaysToIsoDate(
          opts.startDate,
          Math.max(14, uniqueRoundNumbers.length * 7 + 7)
        );

  const validDates = getValidDatesInRange(
    opts.startDate,
    effectiveEndDate,
    opts.allowedWeekdays
  );
  const weekBuckets = groupDatesByWeek(
    opts.startDate,
    effectiveEndDate,
    opts.allowedWeekdays
  );

  // Map each roundNumber to candidate dates organized strictly by week (1+ rounds per calendar week)
  const roundCandidateDatesMap = new Map<number, string[]>();
  const roundPrimaryDateMap = new Map<number, string>();

  if (validDates.length > 0 && uniqueRoundNumbers.length > 0) {
    if (scheduleMode === 'single_week') {
      const targetRn = uniqueRoundNumbers[0];
      const firstWeekDates = weekBuckets[0]?.dates || validDates;
      const ordered = [
        ...firstWeekDates,
        ...validDates.filter((d) => !firstWeekDates.includes(d)),
      ];
      roundCandidateDatesMap.set(targetRn, ordered);
      roundPrimaryDateMap.set(targetRn, ordered[0]);
    } else if (weekBuckets.length > 0) {
      uniqueRoundNumbers.forEach((rn, idx) => {
        const weekIdx = Math.min(weekBuckets.length - 1, Math.floor(idx / roundsPerWeek));
        const weekDates = weekBuckets[weekIdx]?.dates || [];
        // Prefer dates inside that specific week first; fallback to later dates only if week is exhausted
        const laterDates = weekBuckets
          .slice(weekIdx + 1)
          .flatMap((wb) => wb.dates);
        const ordered = [...weekDates, ...laterDates];
        roundCandidateDatesMap.set(rn, ordered.length > 0 ? ordered : validDates);
        roundPrimaryDateMap.set(rn, (weekDates[0] || validDates[0]));
      });
    } else {
      let prevIdx = 0;
      uniqueRoundNumbers.forEach((rn, idx) => {
        if (idx === 0) {
          roundCandidateDatesMap.set(rn, validDates);
          roundPrimaryDateMap.set(rn, validDates[0]);
          prevIdx = 0;
          return;
        }
        const remainingRounds = uniqueRoundNumbers.length - 1 - idx;
        const maxAllowedIdx = validDates.length - 1 - remainingRounds;
        const minGap = Math.max(1, opts.daysBetweenRounds);

        let chosenIdx = prevIdx + 1;
        while (
          chosenIdx < maxAllowedIdx &&
          diffIsoDays(validDates[prevIdx], validDates[chosenIdx]) < minGap
        ) {
          chosenIdx += 1;
        }
        chosenIdx = Math.min(chosenIdx, maxAllowedIdx);
        roundCandidateDatesMap.set(rn, validDates.slice(chosenIdx));
        roundPrimaryDateMap.set(rn, validDates[chosenIdx]);
        prevIdx = chosenIdx;
      });
    }
  }

  for (const p of sortedPairings) {
    const fallbackWeekDate = addDaysToIsoDate(
      opts.startDate,
      scheduleMode === 'single_week' ? 0 : Math.floor((p.roundNumber - 1) / roundsPerWeek) * 7
    );
    const baseRoundDate = roundPrimaryDateMap.get(p.roundNumber) || fallbackWeekDate;

    if (!roundsMap.has(p.roundNumber)) {
      roundsMap.set(p.roundNumber, {
        tournamentId: opts.tournamentId,
        categoryId: opts.categoryId,
        roundNumber: p.roundNumber,
        name: getRoundDisplayName(p.stage, p.roundNumber),
        stage: p.stage,
        startDate: baseRoundDate,
      });
    }

    let chosenDate = baseRoundDate;
    let chosenTime = defaultTimes[0];
    let chosenField: Field | undefined = availableFields[0];
    let chosenReferee: Referee | undefined;

    const roundCandidates = roundCandidateDatesMap.get(p.roundNumber);
    const candidateDates: string[] =
      roundCandidates && roundCandidates.length > 0
        ? roundCandidates
        : validDates.length > 0
          ? validDates
          : [0, 1, 2, 3].map((d) => addDaysToIsoDate(baseRoundDate, d));

    let slotFound = false;
    for (const candidateDate of candidateDates) {
      if (slotFound) break;
      const weekday = getWeekdayName(candidateDate);

      for (const candidateTime of defaultTimes) {
        const candidateMs = parseDateTimeMs(candidateDate, candidateTime);

        // Check team minimum rest hours
        const homeLast = teamLastMatchMs.get(p.homeTeamId);
        const awayLast = teamLastMatchMs.get(p.awayTeamId);
        const minRestMs = (opts.minRestHours || 0) * 3600 * 1000;
        if (
          !p.homeTeamId.startsWith('TBD') &&
          homeLast !== undefined &&
          Math.abs(candidateMs - homeLast) < minRestMs
        ) {
          continue;
        }
        if (
          !p.awayTeamId.startsWith('TBD') &&
          awayLast !== undefined &&
          Math.abs(candidateMs - awayLast) < minRestMs
        ) {
          continue;
        }

        // Find available field matching day & open/close hours
        const freeField = availableFields.find((f) => {
          const slotKey = `${f.id}|${candidateDate}|${candidateTime}`;
          if (usedFieldSlots.has(slotKey)) return false;
          if (f.availableDays.length > 0 && !f.availableDays.includes(weekday)) return false;
          const tMin = timeToMinutes(candidateTime);
          if (tMin < timeToMinutes(f.openTime) || tMin >= timeToMinutes(f.closeTime)) return false;
          return true;
        });

        if (availableFields.length === 0 || freeField) {
          chosenDate = candidateDate;
          chosenTime = candidateTime;
          chosenField = freeField;
          slotFound = true;
          break;
        }
      }
    }

    // Fallback pass for explicit field selection when configured field hours/days differ from selected hours
    if (!slotFound && opts.explicitFields && availableFields.length > 0) {
      for (const candidateDate of candidateDates) {
        if (slotFound) break;
        for (const candidateTime of defaultTimes) {
          const freeField = availableFields.find(
            (f) => !usedFieldSlots.has(`${f.id}|${candidateDate}|${candidateTime}`)
          );
          if (freeField) {
            chosenDate = candidateDate;
            chosenTime = candidateTime;
            chosenField = freeField;
            slotFound = true;
            break;
          }
        }
      }
    }

    if (chosenField) {
      usedFieldSlots.add(`${chosenField.id}|${chosenDate}|${chosenTime}`);
    }

    // Find available referee authorized for category and free at date/time
    chosenReferee = activeReferees.find((ref) => {
      const refSlotKey = `${ref.id}|${chosenDate}|${chosenTime}`;
      if (usedRefereeSlots.has(refSlotKey)) return false;
      if (
        ref.authorizedCategories.length > 0 &&
        !ref.authorizedCategories.includes(opts.categoryId) &&
        !ref.authorizedCategories.includes('TODAS')
      ) {
        return false;
      }
      return true;
    });

    if (chosenReferee) {
      usedRefereeSlots.add(`${chosenReferee.id}|${chosenDate}|${chosenTime}`);
    }

    const matchMs = parseDateTimeMs(chosenDate, chosenTime);
    if (!p.homeTeamId.startsWith('TBD')) teamLastMatchMs.set(p.homeTeamId, matchMs);
    if (!p.awayTeamId.startsWith('TBD')) teamLastMatchMs.set(p.awayTeamId, matchMs);

    generatedMatches.push({
      tempId: `tmp_${matchSeq}`,
      matchNumber: matchSeq++,
      tournamentId: opts.tournamentId,
      categoryId: opts.categoryId,
      roundNumber: p.roundNumber,
      groupId: p.groupName,
      stage: p.stage,
      bracketSlot: p.bracketSlot,
      date: chosenDate,
      time: chosenTime,
      venueId: chosenField?.venueId,
      fieldId: chosenField?.id,
      homeTeamId: p.homeTeamId,
      awayTeamId: p.awayTeamId,
      refereeId: chosenReferee?.id,
      status: 'Programado',
      published: false,
    });
  }

  const conflicts = detectScheduleConflicts(
    generatedMatches.map((m) => ({ ...m, id: m.tempId })),
    opts.fields,
    opts.referees,
    opts.minRestHours
  );

  return {
    rounds: Array.from(roundsMap.values()).sort((a, b) => a.roundNumber - b.roundNumber),
    groups,
    matches: generatedMatches,
    conflicts,
    teamGroupAssignments,
  };
}

export function detectScheduleConflicts(
  matches: Match[],
  fields: Field[],
  referees: Referee[],
  minRestHours: number
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const activeMatches = matches.filter(
    (m) => m.status !== 'Cancelado' && m.status !== 'Suspendido'
  );
  const fieldMap = new Map(fields.map((f) => [f.id, f]));
  const refMap = new Map(referees.map((r) => [r.id, r]));

  for (let i = 0; i < activeMatches.length; i++) {
    const m = activeMatches[i];
    const mMs = parseDateTimeMs(m.date, m.time);

    // 1. Field availability check
    if (m.fieldId) {
      const f = fieldMap.get(m.fieldId);
      if (f) {
        if (f.status !== 'disponible') {
          conflicts.push({
            id: `field_unavail_${m.id}`,
            severity: 'error',
            code: 'FIELD_UNAVAILABLE',
            matchIds: [m.id],
            description: `Partido #${m.matchNumber}: La cancha "${f.name}" está en estado "${f.status}".`,
          });
        } else {
          const weekday = getWeekdayName(m.date);
          const tMin = timeToMinutes(m.time);
          if (
            (f.availableDays.length > 0 && !f.availableDays.includes(weekday)) ||
            tMin < timeToMinutes(f.openTime) ||
            tMin >= timeToMinutes(f.closeTime)
          ) {
            conflicts.push({
              id: `field_hours_${m.id}`,
              severity: 'warning',
              code: 'FIELD_UNAVAILABLE',
              matchIds: [m.id],
              description: `Partido #${m.matchNumber}: Fuera de horario/día disponible en "${f.name}" (${weekday} ${m.time}).`,
            });
          }
        }
      }
    }

    // 2. Referee availability check
    if (m.refereeId) {
      const ref = refMap.get(m.refereeId);
      if (ref && ref.status !== 'activo') {
        conflicts.push({
          id: `ref_unavail_${m.id}`,
          severity: 'warning',
          code: 'REFEREE_UNAVAILABLE',
          matchIds: [m.id],
          description: `Partido #${m.matchNumber}: El árbitro "${ref.fullName}" no está activo.`,
        });
      }
    }

    for (let j = i + 1; j < activeMatches.length; j++) {
      const other = activeMatches[j];
      const sameSlot = m.date === other.date && m.time === other.time;
      const otherMs = parseDateTimeMs(other.date, other.time);

      // 3. Field simultaneous
      if (sameSlot && m.fieldId && m.fieldId === other.fieldId) {
        conflicts.push({
          id: `field_sim_${m.id}_${other.id}`,
          severity: 'error',
          code: 'FIELD_SIMULTANEOUS',
          matchIds: [m.id, other.id],
          description: `Cancha ocupada simultáneamente el ${m.date} a las ${m.time} (Partidos #${m.matchNumber} y #${other.matchNumber}).`,
        });
      }

      // 4. Referee simultaneous
      if (sameSlot && m.refereeId && m.refereeId === other.refereeId) {
        conflicts.push({
          id: `ref_sim_${m.id}_${other.id}`,
          severity: 'error',
          code: 'REFEREE_SIMULTANEOUS',
          matchIds: [m.id, other.id],
          description: `Árbitro asignado simultáneamente el ${m.date} a las ${m.time} (Partidos #${m.matchNumber} y #${other.matchNumber}).`,
        });
      }

      // 5. Team simultaneous & minimum rest & excess per day
      const sharedTeams = [m.homeTeamId, m.awayTeamId].filter(
        (id) => !id.startsWith('TBD') && (id === other.homeTeamId || id === other.awayTeamId)
      );

      if (sharedTeams.length > 0) {
        if (sameSlot) {
          conflicts.push({
            id: `team_sim_${m.id}_${other.id}`,
            severity: 'error',
            code: 'TEAM_SIMULTANEOUS',
            matchIds: [m.id, other.id],
            description: `Un equipo tiene dos partidos simultáneos el ${m.date} a las ${m.time} (#${m.matchNumber} y #${other.matchNumber}).`,
          });
        } else if (m.date === other.date) {
          conflicts.push({
            id: `team_day_${m.id}_${other.id}`,
            severity: 'warning',
            code: 'EXCESS_MATCHES_PER_DAY',
            matchIds: [m.id, other.id],
            description: `Un equipo juega más de un encuentro el mismo día ${m.date} (#${m.matchNumber} y #${other.matchNumber}).`,
          });
        } else if (minRestHours > 0) {
          const diffHours = Math.abs(mMs - otherMs) / (3600 * 1000);
          if (diffHours < minRestHours) {
            conflicts.push({
              id: `rest_${m.id}_${other.id}`,
              severity: 'warning',
              code: 'INSUFFICIENT_REST',
              matchIds: [m.id, other.id],
              description: `Descanso insuficiente (${diffHours.toFixed(1)}h < ${minRestHours}h) entre #${m.matchNumber} y #${other.matchNumber}.`,
            });
          }
        }
      }
    }
  }

  return conflicts;
}
