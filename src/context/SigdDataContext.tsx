import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, onSnapshot, or, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase/config';
import { useAuth } from './AuthContext';
import type {
  AuditLog,
  Branch,
  Category,
  Coach,
  Field,
  Group,
  Match,
  MatchEvent,
  MatchResult,
  Organization,
  Player,
  PlayerStatistic,
  Referee,
  Round,
  Season,
  SigdNotification,
  Sport,
  SportRule,
  Standing,
  Team,
  TeamStatistic,
  Tournament,
  UserProfile,
  Venue,
} from '../types/sigd';

interface SigdDataContextValue {
  loading: boolean;
  organizations: Organization[];
  users: UserProfile[];
  sports: Sport[];
  sportRules: SportRule[];
  seasons: Season[];
  tournaments: Tournament[];
  branches: Branch[];
  categories: Category[];
  teams: Team[];
  players: Player[];
  coaches: Coach[];
  referees: Referee[];
  venues: Venue[];
  fields: Field[];
  rounds: Round[];
  groups: Group[];
  matches: Match[];
  matchResults: MatchResult[];
  matchEvents: MatchEvent[];
  teamStatistics: TeamStatistic[];
  playerStatistics: PlayerStatistic[];
  standings: Standing[];
  notifications: SigdNotification[];
  auditLogs: AuditLog[];
}

const SigdDataContext = createContext<SigdDataContextValue | null>(null);

export function SigdDataProvider({ children }: { children: React.ReactNode }) {
  const { firebaseUser, profile, authReady } = useAuth();
  const [loading, setLoading] = useState(true);

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [sportRules, setSportRules] = useState<SportRule[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [referees, setReferees] = useState<Referee[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchResults, setMatchResults] = useState<MatchResult[]>([]);
  const [matchEvents, setMatchEvents] = useState<MatchEvent[]>([]);
  const [teamStatistics, setTeamStatistics] = useState<TeamStatistic[]>([]);
  const [playerStatistics, setPlayerStatistics] = useState<PlayerStatistic[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [notifications, setNotifications] = useState<SigdNotification[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Public & operational collections (always live for Public Portal + Staff)
  useEffect(() => {
    const subs: (() => void)[] = [];
    const subscribe = <T,>(colName: string, setter: React.Dispatch<React.SetStateAction<T[]>>) => {
      const unsub = onSnapshot(
        collection(db, colName),
        (snap) => {
          setter(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, colName);
        }
      );
      subs.push(unsub);
    };

    subscribe<Organization>('organizations', setOrganizations);
    subscribe<Sport>('sports', setSports);
    subscribe<SportRule>('sportRules', setSportRules);
    subscribe<Season>('seasons', setSeasons);
    subscribe<Tournament>('tournaments', setTournaments);
    subscribe<Branch>('branches', setBranches);
    subscribe<Category>('categories', setCategories);
    subscribe<Team>('teams', setTeams);
    subscribe<Player>('players', setPlayers);
    subscribe<Coach>('coaches', setCoaches);
    subscribe<Referee>('referees', setReferees);
    subscribe<Venue>('venues', setVenues);
    subscribe<Field>('fields', setFields);
    subscribe<Round>('rounds', setRounds);
    subscribe<Group>('groups', setGroups);
    subscribe<Match>('matches', setMatches);
    subscribe<MatchResult>('matchResults', setMatchResults);
    subscribe<MatchEvent>('matchEvents', setMatchEvents);
    subscribe<TeamStatistic>('teamStatistics', setTeamStatistics);
    subscribe<PlayerStatistic>('playerStatistics', setPlayerStatistics);
    subscribe<Standing>('standings', setStandings);

    const timer = setTimeout(() => setLoading(false), 350);
    return () => {
      clearTimeout(timer);
      subs.forEach((u) => u());
    };
  }, []);

  // Authenticated & PII-protected collections
  useEffect(() => {
    if (!authReady || !firebaseUser) {
      setNotifications([]);
      setUsers([]);
      setAuditLogs([]);
      return;
    }

    const subs: (() => void)[] = [];

    // Notifications scoped to user or broadcast
    const notifQuery = query(
      collection(db, 'notifications'),
      or(
        where('recipientUid', '==', firebaseUser.uid),
        where('isBroadcast', '==', true)
      )
    );
    subs.push(
      onSnapshot(
        notifQuery,
        (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SigdNotification);
          items.sort((a, b) => {
            const ta = a.createdAt?.toMillis?.() || 0;
            const tb = b.createdAt?.toMillis?.() || 0;
            return tb - ta;
          });
          setNotifications(items);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
      )
    );

    // Users list (bootstrapped admin sees all; others see self)
    const usersQuery =
      firebaseUser.email?.toLowerCase() === 'cabillalobosv.cv@gmail.com'
        ? collection(db, 'users')
        : query(collection(db, 'users'), where('uid', '==', firebaseUser.uid));
    subs.push(
      onSnapshot(
        usersQuery,
        (snap) => {
          setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as UserProfile));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'users')
      )
    );

    // Audit logs
    const logsQuery =
      firebaseUser.email?.toLowerCase() === 'cabillalobosv.cv@gmail.com'
        ? collection(db, 'auditLogs')
        : query(collection(db, 'auditLogs'), where('actorUid', '==', firebaseUser.uid));
    subs.push(
      onSnapshot(
        logsQuery,
        (snap) => {
          const logs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AuditLog);
          logs.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
          setAuditLogs(logs);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'auditLogs')
      )
    );

    return () => {
      subs.forEach((u) => u());
    };
  }, [authReady, firebaseUser, profile?.role]);

  return (
    <SigdDataContext.Provider
      value={{
        loading,
        organizations,
        users,
        sports,
        sportRules,
        seasons,
        tournaments,
        branches,
        categories,
        teams,
        players,
        coaches,
        referees,
        venues,
        fields,
        rounds,
        groups,
        matches,
        matchResults,
        matchEvents,
        teamStatistics,
        playerStatistics,
        standings,
        notifications,
        auditLogs,
      }}
    >
      {children}
    </SigdDataContext.Provider>
  );
}

export function useSigdData() {
  const ctx = useContext(SigdDataContext);
  if (!ctx) throw new Error('useSigdData debe utilizarse dentro de SigdDataProvider');
  return ctx;
}
