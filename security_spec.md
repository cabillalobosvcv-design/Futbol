# SIGD Firestore Security Specification

## 1. Data Invariants
1. **Default-Deny Catch-All**: Any path outside explicitly matched collections is denied for both reads and writes.
2. **Verified Users for Writes**: All authenticated write operations require `request.auth != null && request.auth.token.email_verified == true`.
3. **RBAC Role Integrity**: Only `admin_general` (bootstrapped via verified email `cabillalobosv.cv@gmail.com` or `users/{uid}.role == 'admin_general'`) can elevate or modify user roles. Users creating their own initial profile can only assign `role: 'publico'` (unless bootstrapped admin).
4. **PII Isolation**:
   - `users/{userId}` contains `email` and is readable ONLY by the document owner (`request.auth.uid == userId`) or `admin_general` / `admin_deportivo`.
   - `referees/{refereeId}/private/{contactDoc}` isolates `phone` and `email` to admins, coordinators, or the linked referee.
5. **Official Statistics & Standings Protection**: `standings`, `teamStatistics`, `playerStatistics` can only be written by `admin_general`, `admin_deportivo`, or `coordinador` during official match result approval/recalculation.
6. **Referee vs Coordinator Match Validation**: Referees (`arbitro`) can submit `matchResults` with `validationStatus: 'pendiente'` and `matchEvents` for their assigned matches, but CANNOT set `validationStatus: 'aprobado'`. Only `coordinador`, `admin_deportivo`, or `admin_general` can approve results.
7. **Immutable Audit Logs**: `auditLogs` can be created by verified staff/referees with `actorUid == request.auth.uid`, and can NEVER be updated or deleted.
8. **Notification Scoping**: `allow list` on `notifications` explicitly checks `resource.data.recipientUid == request.auth.uid || resource.data.isBroadcast == true || isStaff()`.
9. **Path ID & Payload Boundary Guards**: All single-document operations validate `isValidId(id)` (`^[a-zA-Z0-9_\\-]+$`, length `<= 128`) and every string field enforces explicit `.size()` bounds.
10. **Strict Timestamp Integrity**: Creation and update timestamps validate `request.time`.

## 2. Adversarial "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Self-Privilege Escalation**: User creates `users/{uid}` with `role: 'admin_general'` when email is not the bootstrapped admin.
2. **Role Tampering on Update**: User updates `users/{uid}` changing `role` from `'representante'` to `'admin_general'`.
3. **PII Blanket Read**: Non-admin user calls `get` or `list` on another user's `users/{otherUid}` document.
4. **Referee Private Contact Leak**: Public or unauthenticated visitor reads `referees/{id}/private/contact`.
5. **Unverified Email Spoof**: User with `email_verified: false` attempts to write to `tournaments`.
6. **Public Portal Tampering**: Unauthenticated user attempts to create/update `matches`, `standings`, or `teams`.
7. **Referee Self-Approval**: Referee creates or updates `matchResults/{id}` with `validationStatus: 'aprobado'`.
8. **Shadow Field Injection**: Authenticated admin writes `teams/{id}` with an undocumented ghost field `isVerifiedHack: true`.
9. **ID Poisoning**: Write to `tournaments/invalid id with spaces and 2000 chars...`.
10. **Audit Log Erasure**: Even an admin attempts `delete` or `update` on `auditLogs/{id}`.
11. **Notification Cross-Read**: User A queries `notifications` belonging to `recipientUid: User B` (`isBroadcast: false`).
12. **Client Timestamp Forgery**: Write `seasons/{id}` with forged `createdAt` not matching `request.time`.
