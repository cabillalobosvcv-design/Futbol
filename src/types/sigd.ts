import type { Timestamp } from 'firebase/firestore';

export type UserRole =
  | 'admin_general'
  | 'admin_deportivo'
  | 'coordinador'
  | 'arbitro'
  | 'representante'
  | 'publico';

export type SportEngineType =
  | 'football'
  | 'basketball'
  | 'volleyball'
  | 'baseball'
  | 'athletics'
  | 'racquet'
  | 'generic';

export type TournamentFormat = 'round_robin' | 'knockout' | 'groups' | 'mixed';

export type TiebreakerCriterion =
  | 'points'
  | 'goal_difference'
  | 'goals_for'
  | 'head_to_head'
  | 'wins';

export type MatchStatus =
  | 'Programado'
  | 'En juego'
  | 'Finalizado'
  | 'Suspendido'
  | 'Reprogramado'
  | 'Cancelado'
  | 'Pendiente de validación';

export type MatchStage =
  | 'regular'
  | 'grupos'
  | 'octavos'
  | 'cuartos'
  | 'semifinal'
  | 'final';

export type ValidationStatus = 'borrador' | 'pendiente' | 'aprobado' | 'rechazado';

export type MatchEventType =
  | 'gol'
  | 'penal'
  | 'autogol'
  | 'asistencia'
  | 'amarilla'
  | 'roja'
  | 'sustitucion'
  | 'participacion';

export type PlayerPosition = 'Portero' | 'Defensa' | 'Mediocampista' | 'Delantero';

export interface Organization {
  id: string;
  name: string;
  shortName: string;
  city?: string;
  logoUrl?: string;
  active: boolean;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface UserProfile {
  id: string;
  uid: string;
  displayName: string;
  email: string;
  photoUrl?: string;
  role: UserRole;
  assignedCategoryIds?: string[];
  assignedTeamId?: string;
  refereeId?: string;
  active: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface SportStatMetric {
  key: string;
  label: string;
  unit?: string;
}

export interface Sport {
  id: string;
  key: string;
  name: string;
  engineType: SportEngineType;
  periodsCount: number;
  periodLabel?: string;
  allowDraws: boolean;
  statSchema?: SportStatMetric[];
  active: boolean;
  isPrimary?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface SportRule {
  id: string;
  sportId: string;
  name: string;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  tiebreakers: TiebreakerCriterion[];
  minRestHours: number;
  matchDurationMinutes?: number;
  maxPlayersOnField?: number;
  yellowCardsSuspensionLimit?: number;
  updatedAt?: Timestamp;
}

export interface Season {
  id: string;
  name: string;
  year: number;
  startDate: string;
  endDate: string;
  status: 'planificada' | 'activa' | 'finalizada';
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Tournament {
  id: string;
  name: string;
  sportId: string;
  seasonId: string;
  organizationId?: string;
  format: TournamentFormat;
  doubleRound?: boolean;
  teamsPerGroup?: number;
  qualifiersPerGroup?: number;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  tiebreakers: TiebreakerCriterion[];
  minRestHours?: number;
  schedulePublished: boolean;
  status: 'borrador' | 'inscripciones' | 'en_curso' | 'finalizado' | 'suspendido';
  championTeamId?: string;
  championTeamName?: string;
  startDate?: string;
  endDate?: string;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Branch {
  id: string;
  name: string;
  code: string;
}

export interface Category {
  id: string;
  tournamentId: string;
  branchId?: string;
  branchName?: string;
  name: string;
  minAge?: number;
  maxAge?: number;
  coordinatorUid?: string;
  schedulePublished: boolean;
  championTeamId?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Team {
  id: string;
  tournamentId: string;
  categoryId: string;
  name: string;
  shortCode: string;
  primaryColor: string;
  secondaryColor?: string;
  crestUrl?: string;
  coachId?: string;
  coachName?: string;
  representativeUid?: string;
  groupId?: string;
  active: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Player {
  id: string;
  tournamentId: string;
  categoryId: string;
  teamId: string;
  fullName: string;
  jerseyNumber: number;
  position: PlayerPosition;
  photoUrl?: string;
  birthYear?: number;
  active: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Coach {
  id: string;
  fullName: string;
  licenseCode?: string;
  teamId?: string;
  active: boolean;
  createdAt?: Timestamp;
}

export interface Referee {
  id: string;
  userUid?: string;
  fullName: string;
  photoUrl?: string;
  authorizedCategories: string[];
  availabilitySlots: string[];
  status: 'activo' | 'inactivo' | 'suspendido';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface RefereeContactPrivate {
  phone: string;
  email: string;
}

export interface Venue {
  id: string;
  name: string;
  address: string;
  facilityType: string;
  active: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Field {
  id: string;
  venueId: string;
  name: string;
  surfaceType?: string;
  capacity: number;
  availableDays: string[];
  openTime: string;
  closeTime: string;
  slotDurationMinutes?: number;
  status: 'disponible' | 'mantenimiento' | 'inactiva';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Round {
  id: string;
  tournamentId: string;
  categoryId: string;
  roundNumber: number;
  name: string;
  stage: MatchStage;
  startDate?: string;
}

export interface Group {
  id: string;
  tournamentId: string;
  categoryId: string;
  name: string;
  teamIds: string[];
}

export interface Match {
  id: string;
  matchNumber: number;
  tournamentId: string;
  categoryId: string;
  roundId?: string;
  roundNumber: number;
  groupId?: string;
  stage: MatchStage;
  bracketSlot?: string;
  date: string;
  time: string;
  venueId?: string;
  fieldId?: string;
  homeTeamId: string;
  awayTeamId: string;
  refereeId?: string;
  status: MatchStatus;
  homeScore?: number;
  awayScore?: number;
  published: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface PeriodScore {
  period: string;
  home: number;
  away: number;
}

export interface CorrectionEntry {
  correctedAt: string;
  correctedByUid: string;
  correctedByName: string;
  previousScore: string;
  newScore: string;
  reason: string;
}

export interface MatchResult {
  id: string;
  matchId: string;
  tournamentId: string;
  categoryId: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeScore: number;
  awayScore: number;
  periodScores?: PeriodScore[];
  observations?: string;
  refereeId?: string;
  submittedByUid: string;
  validationStatus: ValidationStatus;
  approvedByUid?: string;
  correctionHistory?: CorrectionEntry[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface MatchEvent {
  id: string;
  matchId: string;
  tournamentId: string;
  categoryId: string;
  teamId: string;
  playerId: string;
  eventType: MatchEventType;
  goalType?: string;
  minute: number;
  assistPlayerId?: string;
  subOutPlayerId?: string;
  isStarter?: boolean;
  minutesPlayed?: number;
  createdAt?: Timestamp;
}

export interface TeamStatistic {
  id: string;
  tournamentId: string;
  categoryId: string;
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  winRate: number;
  effectivenessRate: number;
  avgGoalsFor: number;
  avgGoalsAgainst: number;
  cleanSheets: number;
  updatedAt?: Timestamp;
}

export interface PlayerStatistic {
  id: string;
  tournamentId: string;
  categoryId: string;
  teamId: string;
  playerId: string;
  matchesPlayed: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  minutesPlayed: number;
  starts: number;
  subs: number;
  cleanSheetsGoalkeeper: number;
  goalsConcededGoalkeeper: number;
  updatedAt?: Timestamp;
}

export interface Standing {
  id: string;
  tournamentId: string;
  categoryId: string;
  groupId?: string;
  teamId: string;
  position: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  updatedAt?: Timestamp;
}

export interface SigdNotification {
  id: string;
  recipientUid?: string;
  isBroadcast: boolean;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'alert';
  entityType?: string;
  entityId?: string;
  readBy: string[];
  createdByUid: string;
  createdAt?: Timestamp;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorName?: string;
  action: string;
  entity: string;
  entityId: string;
  summary: string;
  createdAt?: Timestamp;
}

export interface ScheduleConflict {
  id: string;
  severity: 'error' | 'warning';
  code:
    | 'TEAM_SIMULTANEOUS'
    | 'FIELD_SIMULTANEOUS'
    | 'FIELD_UNAVAILABLE'
    | 'REFEREE_SIMULTANEOUS'
    | 'REFEREE_UNAVAILABLE'
    | 'INSUFFICIENT_REST'
    | 'EXCESS_MATCHES_PER_DAY';
  matchIds: string[];
  description: string;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin_general: 'Administrador General',
  admin_deportivo: 'Administrador Deportivo',
  coordinador: 'Coordinador',
  arbitro: 'Árbitro',
  representante: 'Representante de Equipo',
  publico: 'Público / Visitante',
};

export const ROLE_PERMISSIONS = {
  canManageUsers: (role: UserRole) => role === 'admin_general',
  canManageSportsAndRules: (role: UserRole) => role === 'admin_general',
  canManageTournaments: (role: UserRole) =>
    role === 'admin_general' || role === 'admin_deportivo',
  canManageTeamsAndPlayers: (role: UserRole) =>
    role === 'admin_general' || role === 'admin_deportivo' || role === 'coordinador',
  canManageFacilitiesAndReferees: (role: UserRole) =>
    role === 'admin_general' || role === 'admin_deportivo' || role === 'coordinador',
  canGenerateSchedule: (role: UserRole) =>
    role === 'admin_general' || role === 'admin_deportivo' || role === 'coordinador',
  canSubmitMatchSheet: (role: UserRole) =>
    role === 'admin_general' ||
    role === 'admin_deportivo' ||
    role === 'coordinador' ||
    role === 'arbitro',
  canValidateResults: (role: UserRole) =>
    role === 'admin_general' || role === 'admin_deportivo' || role === 'coordinador',
  canExportReports: (role: UserRole) => role !== 'publico',
  canViewAuditLogs: (role: UserRole) =>
    role === 'admin_general' || role === 'admin_deportivo' || role === 'coordinador',
};
