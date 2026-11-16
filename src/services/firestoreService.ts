import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  arrayUnion,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, handleFirestoreError, OperationType, storage } from '../firebase/config';
import { DEFAULT_SPORTS_CATALOG } from '../engines/sportsCatalog';
import { computeFootballCategoryMetrics } from '../engines/footballStatsEngine';
import { addDaysToIsoDate } from '../engines/fixtureGenerator';
import type {
  Category,
  CorrectionEntry,
  Match,
  MatchEvent,
  MatchResult,
  Player,
  Referee,
  Sport,
  SportRule,
  Team,
  TiebreakerCriterion,
  Tournament,
  UserInvite,
  UserProfile,
  UserRole,
} from '../types/sigd';

export function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

export async function emailToInviteId(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  if (globalThis.crypto?.subtle) {
    const data = new TextEncoder().encode(normalized);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `inv_${hashHex}`;
  }
  const safeHex = Array.from(new TextEncoder().encode(normalized))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 120);
  return `inv_${safeHex}`;
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

      batch.set(
        doc(db, 'sportRules', `rule_${s.id}`),
        cleanPayload({
          sportId: s.id,
          name: s.defaultRule.name,
          winPoints: s.defaultRule.winPoints,
          drawPoints: s.defaultRule.drawPoints,
          lossPoints: s.defaultRule.lossPoints,
          drawPenaltyShootout: Boolean(s.defaultRule.drawPenaltyShootout),
          drawPenaltyWinBonusPoints: s.defaultRule.drawPenaltyWinBonusPoints ?? 1,
          tiebreakers: s.defaultRule.tiebreakers,
          minRestHours: s.defaultRule.minRestHours,
          matchDurationMinutes: s.defaultRule.matchDurationMinutes,
          maxPlayersOnField: s.defaultRule.maxPlayersOnField,
          yellowCardsSuspensionLimit: s.defaultRule.yellowCardsSuspensionLimit,
          updatedAt: serverTimestamp(),
        })
      );
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

export async function registerOrInviteUser(params: {
  displayName: string;
  email: string;
  role: UserRole;
  assignedCategoryIds: string[];
  assignedTeamId?: string;
  active: boolean;
  existingUsers: UserProfile[];
  existingInvites: UserInvite[];
  actorUid: string;
  actorName: string;
}): Promise<{ mode: 'updated_existing' | 'invited'; id: string }> {
  const normalizedEmail = params.email.trim().toLowerCase();
  const cleanName = params.displayName.trim().slice(0, 120);
  const categoryIds = params.assignedCategoryIds.slice(0, 20);
  const teamId = (params.assignedTeamId || '').slice(0, 128);

  const matchedUser = params.existingUsers.find(
    (u) => u.email.trim().toLowerCase() === normalizedEmail
  );

  if (matchedUser) {
    const path = `users/${matchedUser.uid}`;
    try {
      await updateDoc(
        doc(db, 'users', matchedUser.uid),
        cleanPayload({
          displayName: cleanName,
          role: params.role,
          assignedCategoryIds: categoryIds,
          assignedTeamId: teamId,
          active: params.active,
          updatedAt: serverTimestamp(),
        })
      );
      await createAuditLog({
        actorUid: params.actorUid,
        actorName: params.actorName,
        action: 'UPDATE_USER_PROFILE',
        entity: 'users',
        entityId: matchedUser.uid,
        summary: `Alta/actualización de usuario existente ${cleanName} (${normalizedEmail}) con rol ${params.role}.`,
      });
      await sendNotification({
        recipientUid: matchedUser.uid,
        isBroadcast: false,
        title: 'Actualización de perfil en SIGD',
        message: `Un administrador configuró tu cuenta con el rol: ${params.role}.`,
        type: 'info',
        entityType: 'users',
        entityId: matchedUser.uid,
        createdByUid: params.actorUid,
      });
      return { mode: 'updated_existing', id: matchedUser.uid };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }

  const inviteId = await emailToInviteId(normalizedEmail);
  const path = `userInvites/${inviteId}`;
  const existingInvite = params.existingInvites.find((inv) => inv.id === inviteId);

  try {
    if (existingInvite) {
      await updateDoc(
        doc(db, 'userInvites', inviteId),
        cleanPayload({
          displayName: cleanName,
          role: params.role,
          assignedCategoryIds: categoryIds,
          assignedTeamId: teamId,
          active: params.active,
          updatedAt: serverTimestamp(),
        })
      );
      await createAuditLog({
        actorUid: params.actorUid,
        actorName: params.actorName,
        action: 'UPDATE_USER_INVITE',
        entity: 'userInvites',
        entityId: inviteId,
        summary: `Pre-registro actualizado para ${cleanName} (${normalizedEmail}) con rol ${params.role}.`,
      });
    } else {
      await setDoc(
        doc(db, 'userInvites', inviteId),
        cleanPayload({
          email: normalizedEmail,
          displayName: cleanName,
          role: params.role,
          assignedCategoryIds: categoryIds,
          assignedTeamId: teamId,
          active: params.active,
          claimedUid: '',
          createdBy: params.actorUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
      await createAuditLog({
        actorUid: params.actorUid,
        actorName: params.actorName,
        action: 'CREATE_USER_INVITE',
        entity: 'userInvites',
        entityId: inviteId,
        summary: `Alta de usuario pre-registrado: ${cleanName} (${normalizedEmail}) con rol ${params.role}.`,
      });
    }
    return { mode: 'invited', id: inviteId };
  } catch (err) {
    handleFirestoreError(err, existingInvite ? OperationType.UPDATE : OperationType.CREATE, path);
    return { mode: 'invited', id: inviteId };
  }
}

export async function createProvisionedUserProfile(params: {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  assignedCategoryIds: string[];
  assignedTeamId?: string;
  active: boolean;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const path = `users/${params.uid}`;
  const normalizedEmail = params.email.trim().toLowerCase().slice(0, 160);
  const cleanName = params.displayName.trim().slice(0, 120);
  try {
    await setDoc(
      doc(db, 'users', params.uid),
      cleanPayload({
        uid: params.uid,
        displayName: cleanName,
        email: normalizedEmail,
        photoUrl: '',
        role: params.role,
        assignedCategoryIds: params.assignedCategoryIds.slice(0, 20),
        assignedTeamId: (params.assignedTeamId || '').slice(0, 128),
        active: params.active,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
    await createAuditLog({
      actorUid: params.actorUid,
      actorName: params.actorName,
      action: 'CREATE_USER_WITH_PASSWORD',
      entity: 'users',
      entityId: params.uid,
      summary: `Alta de usuario con contraseña generada: ${cleanName} (${normalizedEmail}) · rol ${params.role}.`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateUserProfileDetails(params: {
  targetUser: UserProfile;
  displayName: string;
  email: string;
  role: UserRole;
  assignedCategoryIds: string[];
  assignedTeamId?: string;
  active: boolean;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const path = `users/${params.targetUser.uid}`;
  const cleanName = params.displayName.trim().slice(0, 120);
  const cleanEmail = params.email.trim().toLowerCase().slice(0, 160);
  const cleanCategoryIds =
    params.role === 'coordinador' ? params.assignedCategoryIds.slice(0, 20) : [];
  const cleanTeamId =
    params.role === 'representante' ? (params.assignedTeamId || '').slice(0, 128) : '';

  try {
    await updateDoc(
      doc(db, 'users', params.targetUser.uid),
      cleanPayload({
        displayName: cleanName,
        email: cleanEmail,
        role: params.role,
        assignedCategoryIds: cleanCategoryIds,
        assignedTeamId: cleanTeamId,
        active: params.active,
        updatedAt: serverTimestamp(),
      })
    );
    await createAuditLog({
      actorUid: params.actorUid,
      actorName: params.actorName,
      action: 'UPDATE_USER_PROFILE',
      entity: 'users',
      entityId: params.targetUser.uid,
      summary: `Usuario modificado: ${cleanName} (${cleanEmail}) · rol ${params.role} · estado ${params.active ? 'activo' : 'suspendido'}.`,
    });
    if (params.targetUser.uid !== params.actorUid) {
      await sendNotification({
        recipientUid: params.targetUser.uid,
        isBroadcast: false,
        title: 'Actualización de perfil y permisos en SIGD',
        message: `Un administrador actualizó tu cuenta: rol ${params.role}, estado ${params.active ? 'activo' : 'suspendido'}.`,
        type: params.active ? 'info' : 'warning',
        entityType: 'users',
        entityId: params.targetUser.uid,
        createdByUid: params.actorUid,
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteUserAccountRecord(params: {
  targetUser: UserProfile;
  existingInvites?: UserInvite[];
  referees?: Referee[];
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const path = `users/${params.targetUser.uid}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'users', params.targetUser.uid));

    // Remove any matching invite records (by inviteId, claimedUid, or email) so they are not orphaned
    const normalizedEmail = params.targetUser.email.trim().toLowerCase();
    const matchingInvites = (params.existingInvites || []).filter(
      (inv) =>
        inv.id === params.targetUser.inviteId ||
        inv.claimedUid === params.targetUser.uid ||
        inv.email.trim().toLowerCase() === normalizedEmail
    );
    for (const inv of matchingInvites) {
      batch.delete(doc(db, 'userInvites', inv.id));
    }

    // Unlink any referee profile tied to this userUid
    const linkedReferees = (params.referees || []).filter(
      (r) => r.userUid === params.targetUser.uid
    );
    for (const refItem of linkedReferees) {
      batch.update(doc(db, 'referees', refItem.id), {
        userUid: '',
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();

    await createAuditLog({
      actorUid: params.actorUid,
      actorName: params.actorName,
      action: 'DELETE_USER',
      entity: 'users',
      entityId: params.targetUser.uid,
      summary: `Usuario eliminado del sistema: ${params.targetUser.displayName} (${params.targetUser.email}) · rol ${params.targetUser.role}.`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function updateUserInvite(params: {
  invite: UserInvite;
  displayName?: string;
  role: UserRole;
  assignedCategoryIds?: string[];
  assignedTeamId?: string;
  active: boolean;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const path = `userInvites/${params.invite.id}`;
  const cleanName = (params.displayName ?? params.invite.displayName).trim().slice(0, 120);
  const cleanCategoryIds =
    params.role === 'coordinador'
      ? (params.assignedCategoryIds ?? params.invite.assignedCategoryIds ?? []).slice(0, 20)
      : [];
  const cleanTeamId =
    params.role === 'representante'
      ? (params.assignedTeamId ?? params.invite.assignedTeamId ?? '').slice(0, 128)
      : '';

  try {
    await updateDoc(
      doc(db, 'userInvites', params.invite.id),
      cleanPayload({
        displayName: cleanName,
        role: params.role,
        assignedCategoryIds: cleanCategoryIds,
        assignedTeamId: cleanTeamId,
        active: params.active,
        updatedAt: serverTimestamp(),
      })
    );
    await createAuditLog({
      actorUid: params.actorUid,
      actorName: params.actorName,
      action: 'UPDATE_USER_INVITE',
      entity: 'userInvites',
      entityId: params.invite.id,
      summary: `Pre-registro de ${cleanName} (${params.invite.email}) actualizado: rol ${params.role}, estado ${params.active ? 'activo' : 'suspendido'}.`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteUserInvite(params: {
  invite: UserInvite;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const path = `userInvites/${params.invite.id}`;
  try {
    await deleteDoc(doc(db, 'userInvites', params.invite.id));
    await createAuditLog({
      actorUid: params.actorUid,
      actorName: params.actorName,
      action: 'DELETE_USER_INVITE',
      entity: 'userInvites',
      entityId: params.invite.id,
      summary: `Pre-registro eliminado para ${params.invite.displayName} (${params.invite.email}).`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
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
  replaceRoundNumbers?: number[];
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const path = `matches/category_${params.categoryId}`;
  try {
    // Delete previous category schedule items if regenerating fully, or only target rounds if replacing specific weeks
    if (params.replaceExisting) {
      const [oldMatches, oldRounds, oldGroups] = await Promise.all([
        getDocs(query(collection(db, 'matches'), where('categoryId', '==', params.categoryId))),
        getDocs(query(collection(db, 'rounds'), where('categoryId', '==', params.categoryId))),
        getDocs(query(collection(db, 'groups'), where('categoryId', '==', params.categoryId))),
      ]);
      const delRefs = [
        ...oldMatches.docs.map((d) => d.ref),
        ...oldRounds.docs.map((d) => d.ref),
        ...oldGroups.docs.map((d) => d.ref),
      ];
      for (let i = 0; i < delRefs.length; i += 400) {
        const delBatch = writeBatch(db);
        delRefs.slice(i, i + 400).forEach((r) => delBatch.delete(r));
        await delBatch.commit();
      }
    } else if (params.replaceRoundNumbers && params.replaceRoundNumbers.length > 0) {
      const targetRoundsSet = new Set(params.replaceRoundNumbers);
      const [oldMatches, oldRounds] = await Promise.all([
        getDocs(query(collection(db, 'matches'), where('categoryId', '==', params.categoryId))),
        getDocs(query(collection(db, 'rounds'), where('categoryId', '==', params.categoryId))),
      ]);
      const delRefs = [
        ...oldMatches.docs
          .filter((d) => targetRoundsSet.has((d.data() as { roundNumber?: number }).roundNumber ?? -1))
          .map((d) => d.ref),
        ...oldRounds.docs
          .filter((d) => targetRoundsSet.has((d.data() as { roundNumber?: number }).roundNumber ?? -1))
          .map((d) => d.ref),
      ];
      for (let i = 0; i < delRefs.length; i += 400) {
        const delBatch = writeBatch(db);
        delRefs.slice(i, i + 400).forEach((r) => delBatch.delete(r));
        await delBatch.commit();
      }
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
  penaltyHomeScore?: number;
  penaltyAwayScore?: number;
  penaltyWinnerTeamId?: string;
  periodScores: { period: string; home: number; away: number }[];
  observations: string;
  events: Omit<MatchEvent, 'id' | 'createdAt'>[];
  mode?: 'en_juego' | 'borrador' | 'pendiente';
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const mode = params.mode || 'pendiente';
  const targetValidationStatus = mode === 'pendiente' ? 'pendiente' : 'borrador';
  const targetMatchStatus =
    mode === 'pendiente' ? 'Pendiente de validación' : 'En juego';

  const resultId = params.existingResult?.id || `res_${params.match.id}`;
  const path = `matchResults/${resultId}`;
  const isDraw = params.homeScore === params.awayScore;
  const hasPenaltyResult =
    isDraw &&
    params.penaltyHomeScore !== undefined &&
    params.penaltyAwayScore !== undefined &&
    Boolean(params.penaltyWinnerTeamId);

  const penaltySuffix = hasPenaltyResult
    ? ` (pen. ${params.penaltyHomeScore}-${params.penaltyAwayScore})`
    : '';

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

    if (params.existingResult && mode === 'pendiente') {
      const prevPen =
        params.existingResult.penaltyHomeScore !== undefined &&
        params.existingResult.penaltyAwayScore !== undefined
          ? ` (pen. ${params.existingResult.penaltyHomeScore}-${params.existingResult.penaltyAwayScore})`
          : '';
      correctionHistory.push({
        correctedAt: new Date().toISOString(),
        correctedByUid: params.actorUid,
        correctedByName: params.actorName,
        previousScore: `${params.existingResult.homeScore}-${params.existingResult.awayScore}${prevPen}`,
        newScore: `${params.homeScore}-${params.awayScore}${penaltySuffix}`,
        reason: 'Acta enviada/actualizada para validación oficial',
      });
    }

    if (params.existingResult) {
      batch.update(
        doc(db, 'matchResults', resultId),
        cleanPayload({
          homeScore: params.homeScore,
          awayScore: params.awayScore,
          penaltyHomeScore: hasPenaltyResult ? params.penaltyHomeScore : deleteField(),
          penaltyAwayScore: hasPenaltyResult ? params.penaltyAwayScore : deleteField(),
          penaltyWinnerTeamId: hasPenaltyResult ? params.penaltyWinnerTeamId : deleteField(),
          periodScores: params.periodScores,
          observations: params.observations.slice(0, 2000),
          validationStatus: targetValidationStatus,
          correctionHistory,
          updatedAt: serverTimestamp(),
        })
      );
    } else {
      batch.set(
        doc(db, 'matchResults', resultId),
        cleanPayload({
          matchId: params.match.id,
          tournamentId: params.match.tournamentId,
          categoryId: params.match.categoryId,
          homeTeamId: params.match.homeTeamId,
          awayTeamId: params.match.awayTeamId,
          homeScore: params.homeScore,
          awayScore: params.awayScore,
          ...(hasPenaltyResult
            ? {
                penaltyHomeScore: params.penaltyHomeScore,
                penaltyAwayScore: params.penaltyAwayScore,
                penaltyWinnerTeamId: params.penaltyWinnerTeamId,
              }
            : {}),
          periodScores: params.periodScores,
          observations: params.observations.slice(0, 2000),
          refereeId: params.match.refereeId,
          submittedByUid: params.actorUid,
          validationStatus: targetValidationStatus,
          correctionHistory,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      );
    }

    batch.update(doc(db, 'matches', params.match.id), {
      status: targetMatchStatus,
      homeScore: params.homeScore,
      awayScore: params.awayScore,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();

    if (mode === 'pendiente') {
      await sendNotification({
        isBroadcast: true,
        title: `Acta pendiente de validación · Partido #${params.match.matchNumber}`,
        message: `Marcador capturado (${params.homeScore}-${params.awayScore}${penaltySuffix}) por ${params.actorName}. Requiere aprobación oficial.`,
        type: 'warning',
        entityType: 'matches',
        entityId: params.match.id,
        createdByUid: params.actorUid,
      });
    }

    await createAuditLog({
      actorUid: params.actorUid,
      actorName: params.actorName,
      action:
        mode === 'pendiente'
          ? 'SUBMIT_MATCH_RESULT'
          : mode === 'en_juego'
            ? 'UPDATE_LIVE_MATCH'
            : 'SAVE_MATCH_DRAFT',
      entity: 'matchResults',
      entityId: resultId,
      summary:
        mode === 'pendiente'
          ? `Acta #${params.match.matchNumber} enviada a validación (${params.homeScore}-${params.awayScore}${penaltySuffix}).`
          : mode === 'en_juego'
            ? `Marcador en vivo guardado para partido #${params.match.matchNumber} (${params.homeScore}-${params.awayScore}${penaltySuffix}).`
            : `Borrador arbitral guardado para partido #${params.match.matchNumber} (${params.homeScore}-${params.awayScore}${penaltySuffix}).`,
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

export async function saveTournamentSportRule(params: {
  ruleId?: string;
  isNew: boolean;
  tournament: Tournament;
  sport: Sport;
  name: string;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  drawPenaltyShootout: boolean;
  drawPenaltyWinBonusPoints: number;
  tiebreakers: TiebreakerCriterion[];
  minRestHours: number;
  matchDurationMinutes?: number;
  maxPlayersOnField?: number;
  yellowCardsSuspensionLimit?: number;
  categories: Category[];
  teams: Team[];
  players: Player[];
  allMatches: Match[];
  allResults: MatchResult[];
  allEvents: MatchEvent[];
  actorUid: string;
  actorName: string;
}): Promise<string> {
  const targetRuleId = params.ruleId || `rule_trn_${params.tournament.id}`;
  const path = `sportRules/${targetRuleId}`;
  try {
    const batch = writeBatch(db);
    const ruleRef = doc(db, 'sportRules', targetRuleId);
    const rulePayload = cleanPayload({
      sportId: params.sport.id,
      tournamentId: params.tournament.id,
      name: params.name.trim().slice(0, 120),
      winPoints: params.winPoints,
      drawPoints: params.drawPoints,
      lossPoints: params.lossPoints,
      drawPenaltyShootout: params.drawPenaltyShootout,
      drawPenaltyWinBonusPoints: params.drawPenaltyWinBonusPoints,
      tiebreakers: params.tiebreakers.slice(0, 10),
      minRestHours: params.minRestHours,
      matchDurationMinutes: params.matchDurationMinutes,
      maxPlayersOnField: params.maxPlayersOnField,
      yellowCardsSuspensionLimit: params.yellowCardsSuspensionLimit,
      updatedAt: serverTimestamp(),
    });

    if (params.isNew) {
      batch.set(ruleRef, rulePayload);
    } else {
      batch.update(ruleRef, rulePayload);
    }

    batch.update(doc(db, 'tournaments', params.tournament.id), {
      winPoints: params.winPoints,
      drawPoints: params.drawPoints,
      lossPoints: params.lossPoints,
      drawPenaltyShootout: params.drawPenaltyShootout,
      drawPenaltyWinBonusPoints: params.drawPenaltyWinBonusPoints,
      tiebreakers: params.tiebreakers.slice(0, 10),
      minRestHours: params.minRestHours,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();

    // Recalculate standings and team statistics when approved results exist for this tournament
    if (params.sport.engineType === 'football') {
      const updatedTournament: Tournament = {
        ...params.tournament,
        winPoints: params.winPoints,
        drawPoints: params.drawPoints,
        lossPoints: params.lossPoints,
        drawPenaltyShootout: params.drawPenaltyShootout,
        drawPenaltyWinBonusPoints: params.drawPenaltyWinBonusPoints,
        tiebreakers: params.tiebreakers.slice(0, 10),
        minRestHours: params.minRestHours,
      };
      const tournamentCategories = params.categories.filter(
        (c) => c.tournamentId === params.tournament.id
      );

      for (const cat of tournamentCategories) {
        const hasApproved = params.allResults.some(
          (r) =>
            r.tournamentId === params.tournament.id &&
            r.categoryId === cat.id &&
            r.validationStatus === 'aprobado'
        );
        if (!hasApproved) continue;

        const computed = computeFootballCategoryMetrics({
          sportEngine: params.sport.engineType,
          tournament: updatedTournament,
          categoryId: cat.id,
          teams: params.teams.filter((t) => t.categoryId === cat.id),
          players: params.players.filter((p) => p.categoryId === cat.id),
          matches: params.allMatches,
          results: params.allResults,
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
        await statsBatch.commit();
      }
    }

    const penaltyLabel = params.drawPenaltyShootout
      ? ` (+${params.drawPenaltyWinBonusPoints} penales)`
      : '';

    await createAuditLog({
      actorUid: params.actorUid,
      actorName: params.actorName,
      action: 'SAVE_TOURNAMENT_RULES',
      entity: 'sportRules',
      entityId: targetRuleId,
      summary: `Reglamento configurado para ${params.tournament.name}: V:${params.winPoints}/E:${params.drawPoints}${penaltyLabel}/D:${params.lossPoints} · Desempates: ${params.tiebreakers.join(' > ')}.`,
    });

    return targetRuleId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    return targetRuleId;
  }
}

export async function deleteTournamentSportRule(params: {
  ruleId: string;
  tournamentName: string;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const path = `sportRules/${params.ruleId}`;
  try {
    await deleteDoc(doc(db, 'sportRules', params.ruleId));
    await createAuditLog({
      actorUid: params.actorUid,
      actorName: params.actorName,
      action: 'DELETE_TOURNAMENT_RULES',
      entity: 'sportRules',
      entityId: params.ruleId,
      summary: `Reglamento personalizado eliminado para el torneo ${params.tournamentName}.`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

let storageUnavailable = false;

async function optimizeLogoToDataUrl(
  file: File,
  options: { maxDim?: number; maxChars?: number } = {}
): Promise<string> {
  const maxDim = options.maxDim ?? 192;
  const maxChars = options.maxChars ?? 58000;

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('No se pudo leer el archivo de imagen.'));
    };
    reader.onerror = () => reject(new Error('Error al leer el archivo seleccionado.'));
    reader.readAsDataURL(file);
  });

  if (
    (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) &&
    rawDataUrl.length <= maxChars
  ) {
    return rawDataUrl;
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('El archivo no es una imagen válida o está dañado.'));
    image.src = rawDataUrl;
  });

  const srcW = img.naturalWidth || img.width || maxDim;
  const srcH = img.naturalHeight || img.height || maxDim;
  const dims = [maxDim, 144, 112, 84];
  const qualities = [0.88, 0.72, 0.56, 0.4];

  for (const dim of dims) {
    const scale = Math.min(dim / srcW, dim / srcH, 1);
    const targetW = Math.max(1, Math.round(srcW * scale));
    const targetH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    ctx.clearRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const pngAttempt = canvas.toDataURL('image/png');
    if (pngAttempt.length <= maxChars) {
      return pngAttempt;
    }

    for (const q of qualities) {
      const webpAttempt = canvas.toDataURL('image/webp', q);
      if (webpAttempt.startsWith('data:image/webp') && webpAttempt.length <= maxChars) {
        return webpAttempt;
      }
      const jpegAttempt = canvas.toDataURL('image/jpeg', q);
      if (jpegAttempt.length <= maxChars) {
        return jpegAttempt;
      }
    }
  }

  if (rawDataUrl.length <= maxChars) {
    return rawDataUrl;
  }
  throw new Error('La imagen es demasiado pesada para optimizarse.');
}

async function uploadLogoWithFallback(storagePath: string, file: File): Promise<string> {
  const optimizedDataUrl = await optimizeLogoToDataUrl(file, {
    maxDim: 192,
    maxChars: 58000,
  });

  if (storageUnavailable) {
    return optimizedDataUrl;
  }

  try {
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytes(storageRef, file, {
      contentType: file.type || 'image/png',
      cacheControl: 'public, max-age=31536000',
    }).then(() => getDownloadURL(storageRef));

    return await Promise.race<string>([
      uploadTask,
      new Promise<never>((_, reject) =>
        window.setTimeout(() => reject(new Error('storage/timeout')), 2000)
      ),
    ]);
  } catch {
    storageUnavailable = true;
    return optimizedDataUrl;
  }
}

export async function uploadOrganizationLogo(orgId: string, file: File): Promise<string> {
  const safeOrgId = orgId.replace(/[^a-zA-Z0-9_-]/g, '') || 'org_sigd_principal';
  const extRaw = file.name.split('.').pop()?.toLowerCase() || 'png';
  const ext = ['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(extRaw) ? extRaw : 'png';
  const storagePath = `organizations/${safeOrgId}/logo_${Date.now()}.${ext}`;
  return uploadLogoWithFallback(storagePath, file);
}

export async function saveOrganizationConfig(params: {
  orgId: string;
  isNew: boolean;
  name: string;
  shortName: string;
  city?: string;
  logoUrl?: string;
  active: boolean;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const path = `organizations/${params.orgId}`;
  try {
    const payload = cleanPayload({
      name: params.name.trim().slice(0, 120),
      shortName: params.shortName.trim().slice(0, 24),
      city: (params.city || '').trim().slice(0, 80),
      logoUrl: (params.logoUrl || '').trim().slice(0, 65000),
      active: params.active,
      ...(params.isNew
        ? {
            createdBy: params.actorUid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }
        : {
            updatedAt: serverTimestamp(),
          }),
    });

    if (params.isNew) {
      await setDoc(doc(db, 'organizations', params.orgId), payload);
    } else {
      await updateDoc(doc(db, 'organizations', params.orgId), payload);
    }

    await createAuditLog({
      actorUid: params.actorUid,
      actorName: params.actorName,
      action: 'SAVE_ORGANIZATION_CONFIG',
      entity: 'organizations',
      entityId: params.orgId,
      summary: `Configuración institucional actualizada: ${params.name.trim()} (${params.shortName.trim()})${params.logoUrl ? ' con logotipo oficial' : ''}.`,
    });
  } catch (err) {
    handleFirestoreError(err, params.isNew ? OperationType.CREATE : OperationType.UPDATE, path);
  }
}

export async function assignRefereeToMatches(params: {
  matchIds: string[];
  refereeId: string;
  refereeName: string;
  refereeUserUid?: string;
  matches: Match[];
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const uniqueIds = Array.from(new Set(params.matchIds.filter(Boolean)));
  if (uniqueIds.length === 0) return;

  const cleanRefId = params.refereeId.trim().slice(0, 128);
  const path = uniqueIds.length === 1 ? `matches/${uniqueIds[0]}` : 'matches/bulk_assign';

  try {
    const chunkSize = 400;
    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
      const chunk = uniqueIds.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      for (const mId of chunk) {
        batch.update(doc(db, 'matches', mId), {
          refereeId: cleanRefId,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }

    const matchNums = uniqueIds
      .map((id) => params.matches.find((m) => m.id === id)?.matchNumber)
      .filter((n): n is number => typeof n === 'number')
      .sort((a, b) => a - b);
    const matchesLabel =
      matchNums.length > 0
        ? matchNums.slice(0, 6).map((n) => `#${n}`).join(', ') +
          (matchNums.length > 6 ? ` (+${matchNums.length - 6})` : '')
        : `${uniqueIds.length} partido(s)`;

    await createAuditLog({
      actorUid: params.actorUid,
      actorName: params.actorName,
      action: cleanRefId ? 'ASSIGN_MATCH_REFEREE' : 'UNASSIGN_MATCH_REFEREE',
      entity: 'matches',
      entityId: uniqueIds.length === 1 ? uniqueIds[0] : 'bulk_assignment',
      summary: cleanRefId
        ? `Árbitro ${params.refereeName} asignado a ${uniqueIds.length} partido(s): ${matchesLabel}.`
        : `Asignación arbitral removida de ${uniqueIds.length} partido(s): ${matchesLabel}.`,
    });

    if (cleanRefId && params.refereeUserUid) {
      await sendNotification({
        recipientUid: params.refereeUserUid,
        isBroadcast: false,
        title:
          uniqueIds.length === 1
            ? `Nuevo partido asignado · ${matchesLabel}`
            : `${uniqueIds.length} partidos asignados para arbitraje`,
        message: `${params.actorName} te asignó ${uniqueIds.length === 1 ? 'el encuentro' : 'los encuentros'} ${matchesLabel}. Ya puedes capturar el resultado en Captura Arbitral.`,
        type: 'info',
        entityType: 'matches',
        entityId: uniqueIds[0],
        createdByUid: params.actorUid,
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function linkRefereeUserAccount(params: {
  referee: Referee;
  userUid: string;
  userName?: string;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const path = `referees/${params.referee.id}`;
  const cleanUid = params.userUid.trim().slice(0, 128);
  try {
    await updateDoc(doc(db, 'referees', params.referee.id), {
      userUid: cleanUid,
      updatedAt: serverTimestamp(),
    });
    await createAuditLog({
      actorUid: params.actorUid,
      actorName: params.actorName,
      action: 'LINK_REFEREE_ACCOUNT',
      entity: 'referees',
      entityId: params.referee.id,
      summary: cleanUid
        ? `Árbitro ${params.referee.fullName} vinculado a la cuenta ${params.userName || cleanUid}.`
        : `Cuenta de usuario desvinculada del árbitro ${params.referee.fullName}.`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function uploadTeamLogo(teamId: string, file: File): Promise<string> {
  const safeTeamId = teamId.replace(/[^a-zA-Z0-9_-]/g, '') || makeId('tm');
  const extRaw = file.name.split('.').pop()?.toLowerCase() || 'png';
  const ext = ['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(extRaw) ? extRaw : 'png';
  const storagePath = `teams/${safeTeamId}/logo_${Date.now()}.${ext}`;
  return uploadLogoWithFallback(storagePath, file);
}

export async function updateTeamCrestUrl(params: {
  team: Team;
  crestUrl: string;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const path = `teams/${params.team.id}`;
  const cleanUrl = params.crestUrl.trim().slice(0, 65000);
  try {
    await updateDoc(doc(db, 'teams', params.team.id), {
      crestUrl: cleanUrl,
      updatedAt: serverTimestamp(),
    });
    await createAuditLog({
      actorUid: params.actorUid,
      actorName: params.actorName,
      action: 'UPDATE_TEAM_LOGO',
      entity: 'teams',
      entityId: params.team.id,
      summary: cleanUrl
        ? `Logotipo actualizado para el equipo ${params.team.name}.`
        : `Logotipo removido del equipo ${params.team.name}.`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteMatchFromSchedule(params: {
  match: Match;
  remainingCategoryMatchesCount: number;
  categoryName: string;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const path = `matches/${params.match.id}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'matches', params.match.id));
    if (params.remainingCategoryMatchesCount <= 0) {
      batch.update(doc(db, 'categories', params.match.categoryId), {
        schedulePublished: false,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();

    await createAuditLog({
      actorUid: params.actorUid,
      actorName: params.actorName,
      action: 'DELETE_MATCH',
      entity: 'matches',
      entityId: params.match.id,
      summary: `Partido #${params.match.matchNumber} (J${params.match.roundNumber} · ${params.match.date}) eliminado del rol de ${params.categoryName}.`,
    });

    if (params.match.published) {
      await sendNotification({
        isBroadcast: true,
        title: `Partido eliminado del rol · #${params.match.matchNumber}`,
        message: `El encuentro #${params.match.matchNumber} de ${params.categoryName} (${params.match.date} ${params.match.time}) fue retirado del calendario.`,
        type: 'warning',
        entityType: 'matches',
        entityId: params.match.id,
        createdByUid: params.actorUid,
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function updateRoundMatchesDate(params: {
  categoryId: string;
  categoryName: string;
  roundNumber: number;
  newDate: string;
  wasPublished: boolean;
  actorUid: string;
  actorName: string;
}): Promise<number> {
  const path = `matches/round_${params.categoryId}_${params.roundNumber}`;
  try {
    const [roundMatches, roundDocs] = await Promise.all([
      getDocs(
        query(
          collection(db, 'matches'),
          where('categoryId', '==', params.categoryId),
          where('roundNumber', '==', params.roundNumber)
        )
      ),
      getDocs(
        query(
          collection(db, 'rounds'),
          where('categoryId', '==', params.categoryId),
          where('roundNumber', '==', params.roundNumber)
        )
      ),
    ]);

    const ops: Array<{ ref: (typeof roundMatches.docs)[number]['ref']; data: Record<string, unknown> }> = [
      ...roundMatches.docs.map((d) => ({
        ref: d.ref,
        data: { date: params.newDate, updatedAt: serverTimestamp() },
      })),
      ...roundDocs.docs.map((d) => ({
        ref: d.ref,
        data: { startDate: params.newDate },
      })),
    ];

    for (let i = 0; i < ops.length; i += 400) {
      const batch = writeBatch(db);
      for (const item of ops.slice(i, i + 400)) {
        batch.update(item.ref, item.data);
      }
      await batch.commit();
    }

    await createAuditLog({
      actorUid: params.actorUid,
      actorName: params.actorName,
      action: 'UPDATE_ROUND_DATE',
      entity: 'matches',
      entityId: params.categoryId,
      summary: `Jornada ${params.roundNumber} de ${params.categoryName} reprogramada al ${params.newDate} (${roundMatches.size} partidos).`,
    });

    if (params.wasPublished && roundMatches.size > 0) {
      await sendNotification({
        isBroadcast: true,
        title: `Reprogramación de Jornada ${params.roundNumber} · ${params.categoryName}`,
        message: `Los ${roundMatches.size} partidos de la Jornada ${params.roundNumber} fueron reprogramados para el ${params.newDate}.`,
        type: 'warning',
        entityType: 'categories',
        entityId: params.categoryId,
        createdByUid: params.actorUid,
      });
    }

    return roundMatches.size;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
    return 0;
  }
}

export async function shiftRoundMatchesByDays(params: {
  categoryId: string;
  categoryName: string;
  roundNumber: number;
  deltaDays: number;
  wasPublished: boolean;
  actorUid: string;
  actorName: string;
}): Promise<number> {
  const path = `matches/round_${params.categoryId}_${params.roundNumber}`;
  try {
    const [roundMatches, roundDocs] = await Promise.all([
      getDocs(
        query(
          collection(db, 'matches'),
          where('categoryId', '==', params.categoryId),
          where('roundNumber', '==', params.roundNumber)
        )
      ),
      getDocs(
        query(
          collection(db, 'rounds'),
          where('categoryId', '==', params.categoryId),
          where('roundNumber', '==', params.roundNumber)
        )
      ),
    ]);

    const ops: Array<{ ref: (typeof roundMatches.docs)[number]['ref']; data: Record<string, unknown> }> = [];
    roundMatches.docs.forEach((d) => {
      const curDate = (d.data() as { date?: string }).date;
      if (curDate) {
        ops.push({
          ref: d.ref,
          data: { date: addDaysToIsoDate(curDate, params.deltaDays), updatedAt: serverTimestamp() },
        });
      }
    });
    roundDocs.docs.forEach((d) => {
      const curStart = (d.data() as { startDate?: string }).startDate;
      if (curStart) {
        ops.push({
          ref: d.ref,
          data: { startDate: addDaysToIsoDate(curStart, params.deltaDays) },
        });
      }
    });

    for (let i = 0; i < ops.length; i += 400) {
      const batch = writeBatch(db);
      for (const item of ops.slice(i, i + 400)) {
        batch.update(item.ref, item.data);
      }
      await batch.commit();
    }

    const dirLabel = params.deltaDays >= 0 ? `+${params.deltaDays}` : `${params.deltaDays}`;
    await createAuditLog({
      actorUid: params.actorUid,
      actorName: params.actorName,
      action: 'SHIFT_ROUND_WEEK',
      entity: 'matches',
      entityId: params.categoryId,
      summary: `Jornada ${params.roundNumber} de ${params.categoryName} recorrida ${dirLabel} días (${roundMatches.size} partidos).`,
    });

    if (params.wasPublished && roundMatches.size > 0) {
      await sendNotification({
        isBroadcast: true,
        title: `Ajuste semanal · Jornada ${params.roundNumber} (${params.categoryName})`,
        message: `Los ${roundMatches.size} partidos de la Jornada ${params.roundNumber} se recorrieron ${dirLabel} días manteniendo sus días de juego.`,
        type: 'warning',
        entityType: 'categories',
        entityId: params.categoryId,
        createdByUid: params.actorUid,
      });
    }

    return roundMatches.size;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
    return 0;
  }
}

export async function deleteRoundMatches(params: {
  categoryId: string;
  categoryName: string;
  roundNumber: number;
  wasPublished: boolean;
  actorUid: string;
  actorName: string;
}): Promise<number> {
  const path = `matches/round_${params.categoryId}_${params.roundNumber}`;
  try {
    const [roundMatches, roundDocs, allCatMatches] = await Promise.all([
      getDocs(
        query(
          collection(db, 'matches'),
          where('categoryId', '==', params.categoryId),
          where('roundNumber', '==', params.roundNumber)
        )
      ),
      getDocs(
        query(
          collection(db, 'rounds'),
          where('categoryId', '==', params.categoryId),
          where('roundNumber', '==', params.roundNumber)
        )
      ),
      getDocs(query(collection(db, 'matches'), where('categoryId', '==', params.categoryId))),
    ]);

    const refs = [...roundMatches.docs.map((d) => d.ref), ...roundDocs.docs.map((d) => d.ref)];
    for (let i = 0; i < refs.length; i += 400) {
      const batch = writeBatch(db);
      refs.slice(i, i + 400).forEach((r) => batch.delete(r));
      await batch.commit();
    }

    const remainingCount = allCatMatches.size - roundMatches.size;
    if (remainingCount <= 0) {
      await updateDoc(doc(db, 'categories', params.categoryId), {
        schedulePublished: false,
        updatedAt: serverTimestamp(),
      });
    }

    await createAuditLog({
      actorUid: params.actorUid,
      actorName: params.actorName,
      action: 'DELETE_ROUND_SCHEDULE',
      entity: 'matches',
      entityId: params.categoryId,
      summary: `Jornada ${params.roundNumber} (${roundMatches.size} partidos) eliminada del rol de ${params.categoryName}.`,
    });

    if (params.wasPublished && roundMatches.size > 0) {
      await sendNotification({
        isBroadcast: true,
        title: `Jornada ${params.roundNumber} cancelada · ${params.categoryName}`,
        message: `La Jornada ${params.roundNumber} de ${params.categoryName} fue eliminada del calendario oficial.`,
        type: 'alert',
        entityType: 'categories',
        entityId: params.categoryId,
        createdByUid: params.actorUid,
      });
    }

    return roundMatches.size;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    return 0;
  }
}

export async function deleteCategorySchedule(params: {
  categoryId: string;
  categoryName: string;
  wasPublished: boolean;
  actorUid: string;
  actorName: string;
}): Promise<number> {
  const path = `matches/category_${params.categoryId}`;
  try {
    const [oldMatches, oldRounds, oldGroups] = await Promise.all([
      getDocs(query(collection(db, 'matches'), where('categoryId', '==', params.categoryId))),
      getDocs(query(collection(db, 'rounds'), where('categoryId', '==', params.categoryId))),
      getDocs(query(collection(db, 'groups'), where('categoryId', '==', params.categoryId))),
    ]);

    const refs = [
      ...oldMatches.docs.map((d) => d.ref),
      ...oldRounds.docs.map((d) => d.ref),
      ...oldGroups.docs.map((d) => d.ref),
    ];

    for (let i = 0; i < refs.length; i += 400) {
      const batch = writeBatch(db);
      refs.slice(i, i + 400).forEach((r) => batch.delete(r));
      await batch.commit();
    }

    await updateDoc(doc(db, 'categories', params.categoryId), {
      schedulePublished: false,
      updatedAt: serverTimestamp(),
    });

    await createAuditLog({
      actorUid: params.actorUid,
      actorName: params.actorName,
      action: 'DELETE_SCHEDULE',
      entity: 'matches',
      entityId: params.categoryId,
      summary: `Rol completo eliminado para categoría ${params.categoryName} (${oldMatches.size} partidos, ${oldRounds.size} jornadas).`,
    });

    if (params.wasPublished && oldMatches.size > 0) {
      await sendNotification({
        isBroadcast: true,
        title: `Calendario retirado · ${params.categoryName}`,
        message: `El calendario de ${params.categoryName} fue eliminado para su reorganización.`,
        type: 'alert',
        entityType: 'categories',
        entityId: params.categoryId,
        createdByUid: params.actorUid,
      });
    }

    return oldMatches.size;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    return 0;
  }
}

export async function getRefereePrivateContact(
  refereeId: string
): Promise<{ phone: string; email: string }> {
  try {
    const snap = await getDoc(doc(db, 'referees', refereeId, 'private', 'contact'));
    if (!snap.exists()) return { phone: '', email: '' };
    const data = snap.data() as { phone?: string; email?: string };
    return {
      phone: typeof data.phone === 'string' ? data.phone : '',
      email: typeof data.email === 'string' ? data.email : '',
    };
  } catch {
    return { phone: '', email: '' };
  }
}

export async function deleteRefereeWithPrivateContact(params: {
  referee: Referee;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const path = `referees/${params.referee.id}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'referees', params.referee.id, 'private', 'contact'));
    batch.delete(doc(db, 'referees', params.referee.id));
    await batch.commit();

    await createAuditLog({
      actorUid: params.actorUid,
      actorName: params.actorName,
      action: 'DELETE_REFEREE',
      entity: 'referees',
      entityId: params.referee.id,
      summary: `Árbitro eliminado del padrón: ${params.referee.fullName}.`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function updateBaseSportRule(params: {
  rule: SportRule;
  name: string;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  drawPenaltyShootout: boolean;
  drawPenaltyWinBonusPoints: number;
  tiebreakers: TiebreakerCriterion[];
  minRestHours: number;
  matchDurationMinutes: number;
  maxPlayersOnField: number;
  yellowCardsSuspensionLimit: number;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const path = `sportRules/${params.rule.id}`;
  try {
    await updateDoc(
      doc(db, 'sportRules', params.rule.id),
      cleanPayload({
        sportId: params.rule.sportId,
        tournamentId: params.rule.tournamentId || '',
        name: params.name.trim().slice(0, 120),
        winPoints: params.winPoints,
        drawPoints: params.drawPoints,
        lossPoints: params.lossPoints,
        drawPenaltyShootout: params.drawPenaltyShootout,
        drawPenaltyWinBonusPoints: params.drawPenaltyWinBonusPoints,
        tiebreakers: params.tiebreakers.slice(0, 10),
        minRestHours: params.minRestHours,
        matchDurationMinutes: params.matchDurationMinutes,
        maxPlayersOnField: params.maxPlayersOnField,
        yellowCardsSuspensionLimit: params.yellowCardsSuspensionLimit,
        updatedAt: serverTimestamp(),
      })
    );

    const penaltyLabel = params.drawPenaltyShootout
      ? ` (+${params.drawPenaltyWinBonusPoints} pen.)`
      : '';

    await createAuditLog({
      actorUid: params.actorUid,
      actorName: params.actorName,
      action: 'UPDATE_SPORT_RULE',
      entity: 'sportRules',
      entityId: params.rule.id,
      summary: `Reglamento base actualizado: ${params.name.trim()} (${params.winPoints}V/${params.drawPoints}E${penaltyLabel}/${params.lossPoints}D).`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteNotificationDoc(params: {
  notificationId: string;
  title: string;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const path = `notifications/${params.notificationId}`;
  try {
    await deleteDoc(doc(db, 'notifications', params.notificationId));
    await createAuditLog({
      actorUid: params.actorUid,
      actorName: params.actorName,
      action: 'DELETE_NOTIFICATION',
      entity: 'notifications',
      entityId: params.notificationId,
      summary: `Notificación eliminada: ${params.title}.`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function deleteMatchResultActa(params: {
  match: Match;
  result: MatchResult;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const path = `matchResults/${params.result.id}`;
  try {
    const oldEventsSnap = await getDocs(
      query(collection(db, 'matchEvents'), where('matchId', '==', params.match.id))
    );

    const batch = writeBatch(db);
    oldEventsSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'matchResults', params.result.id));
    batch.update(doc(db, 'matches', params.match.id), {
      status: 'Programado',
      homeScore: 0,
      awayScore: 0,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();

    await createAuditLog({
      actorUid: params.actorUid,
      actorName: params.actorName,
      action: 'DELETE_MATCH_RESULT',
      entity: 'matchResults',
      entityId: params.result.id,
      summary: `Acta digital eliminada del partido #${params.match.matchNumber} (estado restablecido a Programado).`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}
