import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  arrayUnion,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase/config';
import { DEFAULT_SPORTS_CATALOG } from '../engines/sportsCatalog';
import { computeFootballCategoryMetrics } from '../engines/footballStatsEngine';
import type {
  CorrectionEntry,
  Match,
  MatchEvent,
  MatchResult,
  Player,
  Sport,
  Team,
  Tournament,
  UserProfile,
  UserRole,
} from '../types/sigd';

export function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

function cleanPayload<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export async function createAuditLog(params: {
  actorUid: string;
  actorName: string;
  action: string;
  entity: string;
  entityId: string;
  summary: string;
}): Promise<void> {
  const id = makeId('log');
  const path = `auditLogs/${id}`;
  try {
    await setDoc(
      doc(db, 'auditLogs', id),
      cleanPayload({
        actorUid: params.actorUid,
        actorName: params.actorName.slice(0, 120),
        action: params.action.slice(0, 80),
        entity: params.entity.slice(0, 60),
        entityId: params.entityId.slice(0, 128),
        summary: params.summary.slice(0, 400),
        createdAt: serverTimestamp(),
      })
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function sendNotification(params: {
  recipientUid?: string;
  isBroadcast: boolean;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'alert';
  entityType?: string;
  entityId?: string;
  createdByUid: string;
}): Promise<void> {
  const id = makeId('notif');
  const path = `notifications/${id}`;
  try {
    await setDoc(
      doc(db, 'notifications', id),
      cleanPayload({
        recipientUid: params.recipientUid,
        isBroadcast: params.isBroadcast,
        title: params.title.slice(0, 140),
        message: params.message.slice(0, 500),
        type: params.type,
        entityType: params.entityType,
        entityId: params.entityId,
        readBy: [],
        createdByUid: params.createdByUid,
        createdAt: serverTimestamp(),
      })
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function markNotificationRead(notificationId: string, uid: string): Promise<void> {
  const path = `notifications/${notificationId}`;
  try {
    await updateDoc(doc(db, 'notifications', notificationId), {
      readBy: arrayUnion(uid),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function bootstrapDefaultCatalog(actorUid: string, actorName: string): Promise<void> {
  try {
    const batch = writeBatch(db);

    const orgRef = doc(db, 'organizations', 'org_sigd_principal');
    batch.set(orgRef, {
      name: 'Liga Deportiva SIGD',
      shortName: 'SIGD',
      city: 'Sede Central',
      active: true,
      createdBy: actorUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const branches = [
      { id: 'branch_varonil', name: 'Varonil', code: 'VAR' },
      { id: 'branch_femenil', name: 'Femenil', code: 'FEM' },
      { id: 'branch_mixta', name: 'Mixta', code: 'MIX' },
    ];
    for (const b of branches) {
      batch.set(doc(db, 'branches', b.id), { name: b.name, code: b.code });
    }

    for (const s of DEFAULT_SPORTS_CATALOG) {
      batch.set(doc(db, 'sports', s.id), {
        key: s.key,
        name: s.name,
        engineType: s.engineType,
        periodsCount: s.periodsCount,
        periodLabel: s.periodLabel,
        allowDraws: s.allowDraws,
        statSchema: s.statSchema,
        active: s.active,
        isPrimary: s.isPrimary,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'sportRules', `rule_${s.id}`), {
        sportId: s.id,
        name: s.defaultRule.name,
        winPoints: s.defaultRule.winPoints,
        drawPoints: s.defaultRule.drawPoints,
        lossPoints: s.defaultRule.lossPoints,
        tiebreakers: s.defaultRule.tiebreakers,
        minRestHours: s.defaultRule.minRestHours,
        matchDurationMinutes: s.defaultRule.matchDurationMinutes,
        maxPlayersOnField: s.defaultRule.maxPlayersOnField,
        yellowCardsSuspensionLimit: s.defaultRule.yellowCardsSuspensionLimit,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    await createAuditLog({
      actorUid,
      actorName,
      action: 'BOOTSTRAP_CATALOG',
      entity: 'sports',
      entityId: 'catalog',
      summary: 'Inicialización de organización base, ramas y catálogo multideporte.',
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'sports/catalog');
  }
}

export async function saveEntityDoc(
  collectionName: string,
  id: string,
  data: Record<string, unknown>,
  isNew: boolean,
  withTimestamps = true
): Promise<void> {
  const path = `${collectionName}/${id}`;
  try {
    const payload = cleanPayload({
      ...data,
      ...(withTimestamps
        ? isNew
          ? { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
          : { updatedAt: serverTimestamp() }
        : {}),
    });
    if (isNew) {
      await setDoc(doc(db, collectionName, id), payload);
    } else {
      await updateDoc(doc(db, collectionName, id), payload);
    }
  } catch (err) {
    handleFirestoreError(err, isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function deleteEntityDoc(collectionName: string, id: string): Promise<void> {
  const path = `${collectionName}/${id}`;
  try {
    await deleteDoc(doc(db, collectionName, id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveRefereeWithPrivateContact(params: {
  refereeId: string;
  isNew: boolean;
  refereeData: Record<string, unknown>;
  phone: string;
  email: string;
}): Promise<void> {
  const path = `referees/${params.refereeId}`;
  try {
    const batch = writeBatch(db);
    const refDoc = doc(db, 'referees', params.refereeId);
    const payload = cleanPayload({
      ...params.refereeData,
      ...(params.isNew
        ? { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
        : { updatedAt: serverTimestamp() }),
    });
    if (params.isNew) batch.set(refDoc, payload);
    else batch.update(refDoc, payload);

    const privDoc = doc(db, 'referees', params.refereeId, 'private', 'contact');
    batch.set(privDoc, {
      phone: params.phone.slice(0, 30),
      email: params.email.slice(0, 160),
    });

    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updateUserRoleAndScope(params: {
  targetUser: UserProfile;
  role: UserRole;
  assignedCategoryIds: string[];
  assignedTeamId?: string;
  active: boolean;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const path = `users/${params.targetUser.uid}`;
  try {
    await updateDoc(
      doc(db, 'users', params.targetUser.uid),
      cleanPayload({
        role: params.role,
        assignedCategoryIds: params.assignedCategoryIds.slice(0, 20),
        assignedTeamId: params.assignedTeamId || '',
        active: params.active,
        updatedAt: serverTimestamp(),
      })
    );
    await createAuditLog({
      actorUid: params.actorUid,
      actorName: params.actorName,
      action: 'UPDATE_USER_ROLE',
      entity: 'users',
      entityId: params.targetUser.uid,
      summary: `Rol actualizado a ${params.role} para ${params.targetUser.displayName}`,
    });
    await sendNotification({
      recipientUid: params.targetUser.uid,
      isBroadcast: false,
      title: 'Actualización de permisos en SIGD',
      message: `Tu perfil ha sido asignado al rol: ${params.role}.`,
      type: 'info',
      entityType: 'users',
      entityId: params.targetUser.uid,
      createdByUid: params.actorUid,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function persistGeneratedSchedule(params: {
  tournamentId: string;
  categoryId: string;
  rounds: { roundNumber: number; name: string; stage: string; startDate?: string }[];
  groups: { name: string; teamIds: string[] }[];
  teamGroupAssignments: Record<string, string>;
  matches: (Omit<Match, 'id' | 'createdAt' | 'updatedAt'> & { tempId?: string })[];
  replaceExisting: boolean;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const path = `matches/category_${params.categoryId}`;
  try {
    // Delete previous unpublished/category schedule items if regenerating
    if (params.replaceExisting) {
      const [oldMatches, oldRounds, oldGroups] = await Promise.all([
        getDocs(query(collection(db, 'matches'), where('categoryId', '==', params.categoryId))),
        getDocs(query(collection(db, 'rounds'), where('categoryId', '==', params.categoryId))),
        getDocs(query(collection(db, 'groups'), where('categoryId', '==', params.categoryId))),
      ]);
      const delBatch = writeBatch(db);
      oldMatches.docs.forEach((d) => delBatch.delete(d.ref));
      oldRounds.docs.forEach((d) => delBatch.delete(d.ref));
      oldGroups.docs.forEach((d) => delBatch.delete(d.ref));
      await delBatch.commit();
    }

    const batch = writeBatch(db);
    const roundIdByNum = new Map<number, string>();

    for (const r of params.rounds) {
      const rId = makeId('rnd');
      roundIdByNum.set(r.roundNumber, rId);
      batch.set(
        doc(db, 'rounds', rId),
        cleanPayload({
          tournamentId: params.tournamentId,
          categoryId: params.categoryId,
          roundNumber: r.roundNumber,
          name: r.name,
          stage: r.stage,
          startDate: r.startDate,
        })
      );
    }

    const groupIdByName = new Map<string, string>();
    for (const g of params.groups) {
      const gId = makeId('grp');
      groupIdByName.set(g.name, gId);
      batch.set(doc(db, 'groups', gId), {
        tournamentId: params.tournamentId,
        categoryId: params.categoryId,
        name: g.name,
        teamIds: g.teamIds,
      });
    }

    for (const [teamId, groupName] of Object.entries(params.teamGroupAssignments)) {
      const gId = groupIdByName.get(groupName);
      if (gId) {
        batch.update(doc(db, 'teams', teamId), {
          groupId: gId,
          updatedAt: serverTimestamp(),
        });
      }
    }

    for (const m of params.matches) {
      const mId = makeId('mat');
      const { tempId: _ignore, ...rest } = m;
      const gId = m.groupId ? groupIdByName.get(m.groupId) || m.groupId : undefined;
      batch.set(
        doc(db, 'matches', mId),
        cleanPayload({
          ...rest,
          roundId: roundIdByNum.get(m.roundNumber),
          groupId: gId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    }

    batch.update(doc(db, 'categories', params.categoryId), {
      schedulePublished: false,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    await createAuditLog({
      actorUid: params.actorUid,
      actorName: params.actorName,
      action: params.replaceExisting ? 'REGENERATE_SCHEDULE' : 'GENERATE_SCHEDULE',
      entity: 'matches',
      entityId: params.categoryId,
      summary: `Calendario generado (${params.matches.length} partidos) para categoría ${params.categoryId}.`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function publishCategorySchedule(params: {
  tournamentId: string;
  categoryId: string;
  categoryName: string;
  matches: Match[];
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const path = `categories/${params.categoryId}`;
  try {
    const batch = writeBatch(db);
    params.matches
      .filter((m) => m.categoryId === params.categoryId)
      .forEach((m) => {
        batch.update(doc(db, 'matches', m.id), {
          published: true,
          updatedAt: serverTimestamp(),
        });
      });

    batch.update(doc(db, 'categories', params.categoryId), {
      schedulePublished: true,
      updatedAt: serverTimestamp(),
    });

    batch.update(doc(db, 'tournaments', params.tournamentId), {
      schedulePublished: true,
      status: 'en_curso',
      updatedAt: serverTimestamp(),
    });

    await batch.commit();

    await sendNotification({
      isBroadcast: true,
      title: `Roles publicados · ${params.categoryName}`,
      message: `Se publicó el calendario oficial de ${params.categoryName} con ${params.matches.filter((m) => m.categoryId === params.categoryId).length} encuentros.`,
      type: 'success',
      entityType: 'categories',
      entityId: params.categoryId,
      createdByUid: params.actorUid,
    });

    await createAuditLog({
      actorUid: params.actorUid,
      actorName: params.actorName,
      action: 'PUBLISH_SCHEDULE',
      entity: 'categories',
      entityId: params.categoryId,
      summary: `Publicación oficial del calendario de ${params.categoryName}.`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function submitMatchSheetForValidation(params: {
  match: Match;
  existingResult?: MatchResult;
  homeScore: number;
  awayScore: number;
  periodScores: { period: string; home: number; away: number }[];
  observations: string;
  events: Omit<MatchEvent, 'id' | 'createdAt'>[];
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const resultId = params.existingResult?.id || `res_${params.match.id}`;
  const path = `matchResults/${resultId}`;
  try {
    // Delete old events for this match first
    const oldEvents = await getDocs(
      query(collection(db, 'matchEvents'), where('matchId', '==', params.match.id))
    );
    const batch = writeBatch(db);
    oldEvents.docs.forEach((d) => batch.delete(d.ref));

    for (const ev of params.events) {
      const evId = makeId('evt');
      batch.set(
        doc(db, 'matchEvents', evId),
        cleanPayload({
          ...ev,
          createdAt: serverTimestamp(),
        })
      );
    }

    const correctionHistory: CorrectionEntry[] = params.existingResult?.correctionHistory
      ? [...params.existingResult.correctionHistory]
      : [];

    if (params.existingResult) {
      correctionHistory.push({
        correctedAt: new Date().toISOString(),
        correctedByUid: params.actorUid,
        correctedByName: params.actorName,
        previousScore: `${params.existingResult.homeScore}-${params.existingResult.awayScore}`,
        newScore: `${params.homeScore}-${params.awayScore}`,
        reason: 'Actualización de acta enviada para validación',
      });
    }

    const resultPayload = cleanPayload({
      matchId: params.match.id,
      tournamentId: params.match.tournamentId,
      categoryId: params.match.categoryId,
      homeTeamId: params.match.homeTeamId,
      awayTeamId: params.match.awayTeamId,
      homeScore: params.homeScore,
      awayScore: params.awayScore,
      periodScores: params.periodScores,
      observations: params.observations.slice(0, 2000),
      refereeId: params.match.refereeId,
      submittedByUid: params.existingResult?.submittedByUid || params.actorUid,
      validationStatus: 'pendiente',
      correctionHistory,
      ...(params.existingResult ? {} : { createdAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
    });

    if (params.existingResult) batch.update(doc(db, 'matchResults', resultId), resultPayload);
    else batch.set(doc(db, 'matchResults', resultId), resultPayload);

    batch.update(doc(db, 'matches', params.match.id), {
      status: 'Pendiente de validación',
      homeScore: params.homeScore,
      awayScore: params.awayScore,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();

    await sendNotification({
      isBroadcast: true,
      title: `Acta pendiente de validación · Partido #${params.match.matchNumber}`,
      message: `Marcador capturado (${params.homeScore}-${params.awayScore}) por ${params.actorName}. Requiere aprobación oficial.`,
      type: 'warning',
      entityType: 'matches',
      entityId: params.match.id,
      createdByUid: params.actorUid,
    });

    await createAuditLog({
      actorUid: params.actorUid,
      actorName: params.actorName,
      action: 'SUBMIT_MATCH_RESULT',
      entity: 'matchResults',
      entityId: resultId,
      summary: `Acta #${params.match.matchNumber} enviada a validación (${params.homeScore}-${params.awayScore}).`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function approveOrRejectMatchResult(params: {
  approve: boolean;
  match: Match;
  result: MatchResult;
  correctionReason?: string;
  tournament: Tournament;
  sport: Sport;
  teams: Team[];
  players: Player[];
  allMatches: Match[];
  allResults: MatchResult[];
  allEvents: MatchEvent[];
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const path = `matchResults/${params.result.id}`;
  try {
    const newValidationStatus = params.approve ? 'aprobado' : 'rechazado';
    const history = [...(params.result.correctionHistory || [])];
    if (params.correctionReason) {
      history.push({
        correctedAt: new Date().toISOString(),
        correctedByUid: params.actorUid,
        correctedByName: params.actorName,
        previousScore: `${params.result.homeScore}-${params.result.awayScore}`,
        newScore: `${params.result.homeScore}-${params.result.awayScore}`,
        reason: params.correctionReason,
      });
    }

    const batch = writeBatch(db);
    batch.update(doc(db, 'matchResults', params.result.id), {
      validationStatus: newValidationStatus,
      approvedByUid: params.actorUid,
      correctionHistory: history,
      updatedAt: serverTimestamp(),
    });

    batch.update(doc(db, 'matches', params.match.id), {
      status: params.approve ? 'Finalizado' : 'Programado',
      homeScore: params.result.homeScore,
      awayScore: params.result.awayScore,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();

    // Recalculate official standings & statistics for the category from approved results
    if (params.sport.engineType === 'football') {
      const updatedResults = params.allResults.map((r) =>
        r.id === params.result.id
          ? { ...r, validationStatus: newValidationStatus as 'aprobado' | 'rechazado' }
          : r
      );

      const categoryTeams = params.teams.filter((t) => t.categoryId === params.match.categoryId);
      const categoryPlayers = params.players.filter((p) => p.categoryId === params.match.categoryId);

      const computed = computeFootballCategoryMetrics({
        sportEngine: params.sport.engineType,
        tournament: params.tournament,
        categoryId: params.match.categoryId,
        teams: categoryTeams,
        players: categoryPlayers,
        matches: params.allMatches,
        results: updatedResults,
        events: params.allEvents,
      });

      const statsBatch = writeBatch(db);
      for (const ts of computed.teamStats) {
        statsBatch.set(doc(db, 'teamStatistics', `ts_${ts.categoryId}_${ts.teamId}`), {
          ...ts,
          updatedAt: serverTimestamp(),
        });
      }
      for (const st of computed.standings) {
        statsBatch.set(
          doc(db, 'standings', `std_${st.categoryId}_${st.teamId}`),
          cleanPayload({
            ...st,
            updatedAt: serverTimestamp(),
          })
        );
      }
      for (const ps of computed.playerStats) {
        statsBatch.set(doc(db, 'playerStatistics', `ps_${ps.categoryId}_${ps.playerId}`), {
          ...ps,
          updatedAt: serverTimestamp(),
        });
      }
      await statsBatch.commit();
    }

    await sendNotification({
      isBroadcast: true,
      title: params.approve
        ? `Resultado oficial aprobado · Partido #${params.match.matchNumber}`
        : `Acta rechazada · Partido #${params.match.matchNumber}`,
      message: params.approve
        ? `Marcador oficial ${params.result.homeScore}-${params.result.awayScore} validado. Tablas y estadísticas actualizadas.`
        : `El acta del partido #${params.match.matchNumber} fue devuelta para corrección.`,
      type: params.approve ? 'success' : 'alert',
      entityType: 'matches',
      entityId: params.match.id,
      createdByUid: params.actorUid,
    });

    await createAuditLog({
      actorUid: params.actorUid,
      actorName: params.actorName,
      action: params.approve ? 'APPROVE_RESULT' : 'REJECT_RESULT',
      entity: 'matchResults',
      entityId: params.result.id,
      summary: `${params.approve ? 'Aprobación' : 'Rechazo'} de acta #${params.match.matchNumber} (${params.result.homeScore}-${params.result.awayScore}).`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}
