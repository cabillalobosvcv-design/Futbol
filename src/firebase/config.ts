import { getApps, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  inMemoryPersistence,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function provisionAuthUserWithPassword(params: {
  email: string;
  password: string;
  displayName: string;
}): Promise<{ uid: string; verificationSent: boolean }> {
  const secondaryName = 'sigd-user-provision';
  const secondaryApp =
    getApps().find((a) => a.name === secondaryName) ||
    initializeApp(firebaseConfig, secondaryName);
  const secondaryAuth = getAuth(secondaryApp);
  await setPersistence(secondaryAuth, inMemoryPersistence);

  try {
    const cred = await createUserWithEmailAndPassword(
      secondaryAuth,
      params.email.trim().toLowerCase(),
      params.password
    );
    if (params.displayName.trim()) {
      await updateProfile(cred.user, {
        displayName: params.displayName.trim().slice(0, 120),
      });
    }
    let verificationSent = false;
    try {
      await sendEmailVerification(cred.user);
      verificationSent = true;
    } catch {
      verificationSent = false;
    }
    const uid = cred.user.uid;
    await signOut(secondaryAuth);
    return { uid, verificationSent };
  } catch (err) {
    try {
      await signOut(secondaryAuth);
    } catch {
      // ignore cleanup error
    }
    throw err;
  }
}

export async function sendUserPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim().toLowerCase());
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Firestore client is offline. Verify firebase-applet-config.json.');
      return false;
    }
    return true;
  }
}

testFirestoreConnection();
