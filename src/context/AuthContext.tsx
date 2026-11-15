import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase/config';
import { emailToInviteId } from '../services/firestoreService';
import type { UserInvite, UserProfile, UserRole } from '../types/sigd';

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  role: UserRole;
  authReady: boolean;
  signingIn: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const BOOTSTRAP_ADMIN_EMAIL = 'cabillalobosv.cv@gmail.com';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setProfile(null);
        setAuthReady(true);
        return;
      }

      const path = `users/${user.uid}`;
      try {
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);
        const inviteId = user.email && user.emailVerified ? await emailToInviteId(user.email) : '';

        if (snap.exists()) {
          const data = snap.data() as Omit<UserProfile, 'id'>;
          if (data.role === 'publico' && inviteId) {
            const inviteRef = doc(db, 'userInvites', inviteId);
            const inviteSnap = await getDoc(inviteRef);
            if (inviteSnap.exists()) {
              const inv = inviteSnap.data() as Omit<UserInvite, 'id'>;
              if (inv.active && inv.claimedUid === '') {
                const batch = writeBatch(db);
                batch.update(userRef, {
                  role: inv.role,
                  assignedCategoryIds: inv.assignedCategoryIds || [],
                  assignedTeamId: inv.assignedTeamId || '',
                  inviteId,
                  active: inv.active,
                  updatedAt: serverTimestamp(),
                });
                batch.update(inviteRef, {
                  claimedUid: user.uid,
                  updatedAt: serverTimestamp(),
                });
                await batch.commit();
                setProfile({
                  id: snap.id,
                  ...data,
                  role: inv.role,
                  assignedCategoryIds: inv.assignedCategoryIds || [],
                  assignedTeamId: inv.assignedTeamId || '',
                  inviteId,
                  active: inv.active,
                });
                return;
              }
            }
          }
          setProfile({ id: snap.id, ...data });
        } else {
          let invitedData: Omit<UserInvite, 'id'> | null = null;
          if (inviteId) {
            const inviteRef = doc(db, 'userInvites', inviteId);
            const inviteSnap = await getDoc(inviteRef);
            if (inviteSnap.exists()) {
              const inv = inviteSnap.data() as Omit<UserInvite, 'id'>;
              if (inv.active && inv.claimedUid === '') {
                invitedData = inv;
              }
            }
          }

          const isBootstrap =
            user.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL && user.emailVerified;
          const initialRole: UserRole = isBootstrap
            ? 'admin_general'
            : invitedData
              ? invitedData.role
              : 'publico';
          const initialCategories = invitedData?.assignedCategoryIds || [];
          const initialTeamId = invitedData?.assignedTeamId || '';
          const initialActive = invitedData ? invitedData.active : true;
          const displayName =
            user.displayName || invitedData?.displayName || user.email || 'Usuario SIGD';

          const newProfile: Record<string, unknown> = {
            uid: user.uid,
            displayName,
            email: (user.email || '').toLowerCase(),
            photoUrl: user.photoURL || '',
            role: initialRole,
            assignedCategoryIds: initialCategories,
            assignedTeamId: initialTeamId,
            ...(invitedData ? { inviteId } : {}),
            active: initialActive,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };

          if (invitedData && inviteId) {
            const batch = writeBatch(db);
            batch.set(userRef, newProfile);
            batch.update(doc(db, 'userInvites', inviteId), {
              claimedUid: user.uid,
              updatedAt: serverTimestamp(),
            });
            await batch.commit();
          } else {
            await setDoc(userRef, newProfile);
          }

          setProfile({
            id: user.uid,
            uid: user.uid,
            displayName: String(newProfile.displayName),
            email: String(newProfile.email),
            photoUrl: String(newProfile.photoUrl),
            role: initialRole,
            assignedCategoryIds: initialCategories,
            assignedTeamId: initialTeamId,
            ...(invitedData ? { inviteId } : {}),
            active: initialActive,
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, path);
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsub();
  }, []);

  const signInWithGoogle = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo iniciar sesión con Google.';
      setAuthError(msg);
    } finally {
      setSigningIn(false);
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setProfile(null);
  };

  const role: UserRole = profile?.active ? profile.role : 'publico';

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        role,
        authReady,
        signingIn,
        authError,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe utilizarse dentro de AuthProvider');
  return ctx;
}
