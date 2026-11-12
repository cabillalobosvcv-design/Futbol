import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase/config';
import type { UserProfile, UserRole } from '../types/sigd';

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

        if (snap.exists()) {
          const data = snap.data() as Omit<UserProfile, 'id'>;
          setProfile({ id: snap.id, ...data });
        } else {
          const initialRole: UserRole =
            user.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL && user.emailVerified
              ? 'admin_general'
              : 'publico';

          const newProfile: Record<string, unknown> = {
            uid: user.uid,
            displayName: user.displayName || user.email || 'Usuario SIGD',
            email: user.email || '',
            photoUrl: user.photoURL || '',
            role: initialRole,
            assignedCategoryIds: [],
            assignedTeamId: '',
            active: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await setDoc(userRef, newProfile);
          setProfile({
            id: user.uid,
            uid: user.uid,
            displayName: String(newProfile.displayName),
            email: String(newProfile.email),
            photoUrl: String(newProfile.photoUrl),
            role: initialRole,
            assignedCategoryIds: [],
            assignedTeamId: '',
            active: true,
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
